/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router, Request, Response } from 'express';
import { getAppPool, sanitizeDatabaseErrorMessage } from '../db/pool';
import {
  createProjectSnapshot,
  createProjectSnapshotsBatch,
  listProjectSnapshots,
  CreateSnapshotInput,
  BatchSnapshotItemInput,
} from '../services/snapshotService';
import { SnapshotTrigger } from '../../src/types/versioning';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BATCH_SNAPSHOTS = 100;
const VALID_TRIGGERS = new Set<SnapshotTrigger>([
  'manual',
  'auto-checkpoint',
  'pre-restore-safety',
  'import',
]);
const VALID_UNITS = new Set(['feet', 'metres']);

function isValidProjectId(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  return UUID_REGEX.test(id.trim());
}

export const snapshotsRouter = Router({ mergeParams: true });

/**
 * GET /api/projects/:id/snapshots
 * Lists all revisions for a project in descending order.
 */
snapshotsRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  const { id: projectId } = req.params;
  const tenantId = req.tenant!.id;

  if (!isValidProjectId(projectId)) {
    res.status(400).json({
      error: `Invalid project identifier: "${projectId}". Must be a valid RFC 4122 UUID.`,
      code: 'ERR_INVALID_PROJECT_ID',
    });
    return;
  }

  const pool = getAppPool();

  try {
    const snapshots = await listProjectSnapshots(pool, tenantId, projectId);
    res.json({ snapshots });
  } catch (err: any) {
    console.error(`[Snapshots API] GET /snapshots error:`, sanitizeDatabaseErrorMessage(err));
    res.status(500).json({
      error: 'Failed to retrieve project snapshots.',
      code: 'ERR_DATABASE_QUERY',
    });
  }
});

/**
 * POST /api/projects/:id/snapshots/batch
 * Validates an entire revision bundle snapshot batch in memory before executing
 * a single atomic database transaction with parent-project row locking.
 */
snapshotsRouter.post('/batch', async (req: Request, res: Response): Promise<void> => {
  const { id: projectId } = req.params;
  const tenantId = req.tenant!.id;

  if (!isValidProjectId(projectId)) {
    res.status(400).json({
      error: `Invalid project identifier: "${projectId}". Must be a valid RFC 4122 UUID.`,
      code: 'ERR_INVALID_PROJECT_ID',
    });
    return;
  }

  const body = req.body;
  if (!body || typeof body !== 'object' || !Array.isArray(body.snapshots)) {
    res.status(400).json({
      error: 'Invalid request body. Expected an object with a "snapshots" array.',
      code: 'ERR_INVALID_BODY',
    });
    return;
  }

  if (body.snapshots.length === 0) {
    res.status(400).json({
      error: 'Snapshot batch cannot be empty.',
      code: 'ERR_INVALID_BODY',
    });
    return;
  }

  if (body.snapshots.length > MAX_BATCH_SNAPSHOTS) {
    res.status(400).json({
      error: `Snapshot batch exceeds maximum limit of ${MAX_BATCH_SNAPSHOTS} items.`,
      code: 'ERR_BATCH_LIMIT_EXCEEDED',
    });
    return;
  }

  const normalizedBatch: BatchSnapshotItemInput[] = [];
  const seenClientIds = new Set<string>();

  for (let i = 0; i < body.snapshots.length; i++) {
    const raw = body.snapshots[i];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      res.status(400).json({
        error: `Snapshot item #${i + 1} must be a valid object.`,
        code: 'ERR_INVALID_BODY',
      });
      return;
    }

    if (!raw.label || typeof raw.label !== 'string' || raw.label.trim().length === 0) {
      res.status(400).json({
        error: `Snapshot item #${i + 1} is missing a valid non-empty "label".`,
        code: 'ERR_VALIDATION_LABEL',
      });
      return;
    }

    if (!raw.projectData || typeof raw.projectData !== 'object' || Array.isArray(raw.projectData)) {
      res.status(400).json({
        error: `Snapshot item #${i + 1} is missing a valid "projectData" object.`,
        code: 'ERR_VALIDATION_PROJECT_DATA',
      });
      return;
    }

    const pd = raw.projectData as Record<string, unknown>;
    const explicitOrgId =
      (typeof raw.organizationId === 'string' && raw.organizationId.trim()) ||
      (typeof pd.organizationId === 'string' && pd.organizationId.trim()) ||
      (typeof pd.organization_id === 'string' && pd.organization_id.trim()) ||
      '';

    if (explicitOrgId && explicitOrgId.toLowerCase() !== tenantId.toLowerCase()) {
      res.status(403).json({
        error: `Snapshot item #${i + 1} targets an unauthorized cross-tenant organization.`,
        code: 'ERR_CROSS_TENANT_FORBIDDEN',
      });
      return;
    }

    if (typeof pd.name !== 'string' || pd.name.trim().length === 0 || pd.name.trim().length > 255) {
      res.status(400).json({
        error: `Snapshot item #${i + 1} projectData has an invalid "name".`,
        code: 'ERR_VALIDATION_PROJECT_DATA',
      });
      return;
    }

    if (
      typeof pd.plotWidth !== 'number' ||
      !Number.isFinite(pd.plotWidth) ||
      pd.plotWidth <= 0 ||
      typeof pd.plotLength !== 'number' ||
      !Number.isFinite(pd.plotLength) ||
      pd.plotLength <= 0
    ) {
      res.status(400).json({
        error: `Snapshot item #${i + 1} projectData has invalid plot dimensions.`,
        code: 'ERR_VALIDATION_PROJECT_DATA',
      });
      return;
    }

    if (pd.unit !== undefined && (! VALID_UNITS.has(String(pd.unit)))) {
      res.status(400).json({
        error: `Snapshot item #${i + 1} projectData has an unsupported measurement unit.`,
        code: 'ERR_VALIDATION_PROJECT_DATA',
      });
      return;
    }

    if (raw.trigger !== undefined && !VALID_TRIGGERS.has(raw.trigger as SnapshotTrigger)) {
      res.status(400).json({
        error: `Snapshot item #${i + 1} has an invalid trigger "${String(raw.trigger)}".`,
        code: 'ERR_VALIDATION_TRIGGER',
      });
      return;
    }

    const clientSnapshotId =
      typeof raw.clientSnapshotId === 'string' && raw.clientSnapshotId.trim().length > 0
        ? raw.clientSnapshotId.trim()
        : typeof raw.id === 'string' && raw.id.trim().length > 0
        ? raw.id.trim()
        : undefined;

    if (clientSnapshotId) {
      if (seenClientIds.has(clientSnapshotId)) {
        res.status(400).json({
          error: `Duplicate snapshot ID "${clientSnapshotId}" in batch at item #${i + 1}.`,
          code: 'ERR_DUPLICATE_BATCH_SNAPSHOT_ID',
        });
        return;
      }
      seenClientIds.add(clientSnapshotId);
    }

    const sanitizedProjectData: any = {
      ...pd,
      id: projectId.trim().toLowerCase(),
      organizationId: tenantId,
    };
    delete sanitizedProjectData.organization_id;

    normalizedBatch.push({
      clientSnapshotId,
      revisionNumber: typeof raw.revisionNumber === 'number' ? raw.revisionNumber : undefined,
      versionTag: typeof raw.versionTag === 'string' ? raw.versionTag : 'v1.0-import',
      label: raw.label.trim(),
      description: typeof raw.description === 'string' ? raw.description : '',
      trigger: (raw.trigger as SnapshotTrigger) || 'import',
      metrics:
        raw.metrics && typeof raw.metrics === 'object' && !Array.isArray(raw.metrics)
          ? raw.metrics
          : {},
      projectData: sanitizedProjectData,
    });
  }

  const pool = getAppPool();

  try {
    const result = await createProjectSnapshotsBatch(pool, {
      projectId: projectId.trim().toLowerCase(),
      organizationId: tenantId,
      authorId: req.user?.id || undefined,
      snapshots: normalizedBatch,
    });
    res.status(201).json(result);
  } catch (err: any) {
    console.error(`[Snapshots API] POST /snapshots/batch error:`, sanitizeDatabaseErrorMessage(err));
    if (err.message && err.message.includes('not found')) {
      res.status(404).json({
        error: err.message,
        code: 'ERR_PROJECT_NOT_FOUND',
      });
      return;
    }
    res.status(500).json({
      error: 'Failed to import snapshot batch. All changes were rolled back.',
      code: 'ERR_SNAPSHOT_BATCH_FAILED',
    });
  }
});

/**
 * POST /api/projects/:id/snapshots
 * Atomically generates a serialized snapshot with parent-project row lock.
 */
snapshotsRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  const { id: projectId } = req.params;
  const tenantId = req.tenant!.id;

  if (!isValidProjectId(projectId)) {
    res.status(400).json({
      error: `Invalid project identifier: "${projectId}". Must be a valid RFC 4122 UUID.`,
      code: 'ERR_INVALID_PROJECT_ID',
    });
    return;
  }
  const body = req.body;

  if (!body || typeof body !== 'object') {
    res.status(400).json({
      error: 'Invalid request body. Expected snapshot payload.',
      code: 'ERR_INVALID_BODY',
    });
    return;
  }

  if (!body.label || typeof body.label !== 'string') {
    res.status(400).json({
      error: 'Snapshot "label" is required.',
      code: 'ERR_VALIDATION_LABEL',
    });
    return;
  }

  if (!body.projectData || typeof body.projectData !== 'object') {
    res.status(400).json({
      error: 'Snapshot "projectData" is required and must contain project state.',
      code: 'ERR_VALIDATION_PROJECT_DATA',
    });
    return;
  }

  const pool = getAppPool();

  const snapshotInput: CreateSnapshotInput = {
    projectId,
    organizationId: tenantId,
    versionTag: body.versionTag || 'v1.0',
    label: body.label.trim(),
    description: body.description || '',
    trigger: body.trigger || 'manual',
    authorId: req.user?.id || undefined,
    metrics: body.metrics || {},
    projectData: body.projectData,
  };

  try {
    const createdSnapshot = await createProjectSnapshot(pool, snapshotInput);
    res.status(201).json({ snapshot: createdSnapshot });
  } catch (err: any) {
    console.error(`[Snapshots API] POST /snapshots error:`, sanitizeDatabaseErrorMessage(err));
    if (err.message && err.message.includes('not found')) {
      res.status(404).json({
        error: err.message,
        code: 'ERR_PROJECT_NOT_FOUND',
      });
      return;
    }
    res.status(500).json({
      error: 'Failed to create project snapshot.',
      code: 'ERR_SNAPSHOT_CREATION_FAILED',
    });
  }
});

