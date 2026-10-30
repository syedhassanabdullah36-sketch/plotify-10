/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router, Request, Response } from 'express';
import { getAppPool, sanitizeDatabaseErrorMessage } from '../db/pool';
import { withTenantContext } from '../db/tenantContext';
import { Project, MeasurementUnit, Currency } from '../../src/types/project';

export const projectsRouter = Router();

// Regular expression for validating RFC 4122 UUIDs
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const VALID_UNITS = new Set<MeasurementUnit>(['feet', 'metres']);
const VALID_CURRENCIES = new Set<Currency>([
  'USD',
  'EUR',
  'GBP',
  'CAD',
  'AUD',
  'INR',
  'AED',
  'CHF',
]);

function isValidId(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  // Project identifiers in PostgreSQL are typed as UUID. Reject legacy strings like "proj-001".
  return UUID_REGEX.test(id.trim());
}

function isValidUnit(unit: unknown): unit is MeasurementUnit {
  return typeof unit === 'string' && VALID_UNITS.has(unit as MeasurementUnit);
}

function isValidCurrency(currency: unknown): currency is Currency {
  return typeof currency === 'string' && VALID_CURRENCIES.has(currency as Currency);
}

/**
 * GET /api/projects
 * Lists projects for the authenticated tenant with safe pagination.
 */
projectsRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  const tenantId = req.tenant!.id;

  // Validate pagination parameters
  let limit = 50; // default limit
  let offset = 0; // default offset

  if (req.query.limit !== undefined) {
    const parsedLimit = Number(req.query.limit);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      res.status(400).json({
        error: 'Invalid "limit" parameter. Must be an integer between 1 and 100.',
        code: 'ERR_INVALID_PAGINATION',
      });
      return;
    }
    limit = parsedLimit;
  }

  if (req.query.offset !== undefined) {
    const parsedOffset = Number(req.query.offset);
    if (!Number.isInteger(parsedOffset) || parsedOffset < 0) {
      res.status(400).json({
        error: 'Invalid "offset" parameter. Must be a non-negative integer.',
        code: 'ERR_INVALID_PAGINATION',
      });
      return;
    }
    offset = parsedOffset;
  }

  const pool = getAppPool();

  try {
    const { projects, total } = await withTenantContext(pool, tenantId, async (client) => {
      const countRes = await client.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM projects WHERE organization_id = $1`,
        [tenantId]
      );
      const totalCount = parseInt(countRes.rows[0]?.count || '0', 10);

      const dbRes = await client.query<{
        id: string;
        organization_id: string;
        name: string;
        project_type: string;
        status: string;
        unit: string;
        budget: string | number;
        currency: string;
        data: Partial<Project>;
        created_at: Date;
        updated_at: Date;
      }>(
        `SELECT id, organization_id, name, project_type, status, unit, budget, currency, data, created_at, updated_at
         FROM projects
         WHERE organization_id = $1
         ORDER BY updated_at DESC
         LIMIT $2 OFFSET $3`,
        [tenantId, limit, offset]
      );

      const mapped = dbRes.rows.map((row) => ({
        ...row.data,
        id: row.id,
        name: row.name,
        projectType: row.project_type as any,
        status: row.status as any,
        unit: row.unit as any,
        budget: Number(row.budget),
        currency: row.currency as any,
      }));

      return { projects: mapped, total: totalCount };
    });

    res.json({ projects, total, limit, offset });
  } catch (err: any) {
    console.error('[Projects API] GET /api/projects error:', sanitizeDatabaseErrorMessage(err));
    res.status(500).json({
      error: 'Failed to retrieve projects from database.',
      code: 'ERR_DATABASE_QUERY',
    });
  }
});

const MAX_BATCH_PROJECTS = 100;

export interface ValidatedBatchProject {
  id: string;
  name: string;
  projectType: Project['projectType'];
  status: Project['status'];
  unit: MeasurementUnit;
  budget: number;
  currency: Currency;
  rawPayload: Partial<Project> & Record<string, unknown>;
}

function validateBatchProjectItem(
  raw: unknown,
  index: number,
  tenantId: string
):
  | { valid: true; project: ValidatedBatchProject }
  | { valid: false; status: number; code: string; error: string } {
  const itemLabel = `Project item #${index + 1}`;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      valid: false,
      status: 400,
      code: 'ERR_INVALID_BODY',
      error: `${itemLabel} must be a non-null JSON object.`,
    };
  }

  const item = raw as Partial<Project> & Record<string, unknown>;

  const explicitOrgId =
    (typeof item.organizationId === 'string' && item.organizationId.trim()) ||
    (typeof item.organization_id === 'string' && item.organization_id.trim()) ||
    '';

  if (explicitOrgId && explicitOrgId.toLowerCase() !== tenantId.toLowerCase()) {
    return {
      valid: false,
      status: 403,
      code: 'ERR_CROSS_TENANT_FORBIDDEN',
      error: `${itemLabel} specifies an unauthorized cross-tenant organization ID.`,
    };
  }

  if (!item.id || typeof item.id !== 'string' || !isValidId(item.id)) {
    return {
      valid: false,
      status: 400,
      code: 'ERR_INVALID_PROJECT_ID',
      error: `${itemLabel} has an invalid project identifier: "${String(item.id || '')}". Must be a valid RFC 4122 UUID.`,
    };
  }

  if (!item.name || typeof item.name !== 'string' || item.name.trim().length === 0) {
    return {
      valid: false,
      status: 400,
      code: 'ERR_VALIDATION_NAME',
      error: `${itemLabel} "name" is required and must be a non-empty string.`,
    };
  }

  if (item.name.trim().length > 255) {
    return {
      valid: false,
      status: 400,
      code: 'ERR_VALIDATION_NAME',
      error: `${itemLabel} "name" must not exceed 255 characters.`,
    };
  }

  if (
    item.projectType !== undefined &&
    (typeof item.projectType !== 'string' ||
      item.projectType.trim().length === 0 ||
      item.projectType.trim().length > 32)
  ) {
    return {
      valid: false,
      status: 400,
      code: 'ERR_VALIDATION_PROJECT_TYPE',
      error: `${itemLabel} "projectType" must be a non-empty string up to 32 characters.`,
    };
  }

  if (
    item.status !== undefined &&
    (typeof item.status !== 'string' ||
      item.status.trim().length === 0 ||
      item.status.trim().length > 32)
  ) {
    return {
      valid: false,
      status: 400,
      code: 'ERR_VALIDATION_STATUS',
      error: `${itemLabel} "status" must be a non-empty string up to 32 characters.`,
    };
  }

  if (item.budget !== undefined && item.budget !== null) {
    if (typeof item.budget !== 'number' || !Number.isFinite(item.budget) || item.budget < 0) {
      return {
        valid: false,
        status: 400,
        code: 'ERR_VALIDATION_BUDGET',
        error: `${itemLabel} "budget" must be a non-negative finite number.`,
      };
    }
  }

  if (item.unit !== undefined && item.unit !== null && !isValidUnit(item.unit)) {
    return {
      valid: false,
      status: 400,
      code: 'ERR_VALIDATION_UNIT',
      error: `${itemLabel} has an invalid "unit": "${String(item.unit)}". Must be one of: feet, metres.`,
    };
  }

  if (item.currency !== undefined && item.currency !== null && !isValidCurrency(item.currency)) {
    return {
      valid: false,
      status: 400,
      code: 'ERR_VALIDATION_CURRENCY',
      error: `${itemLabel} has an invalid "currency": "${String(item.currency)}".`,
    };
  }

  if (
    item.plotWidth !== undefined &&
    (typeof item.plotWidth !== 'number' || !Number.isFinite(item.plotWidth) || item.plotWidth <= 0)
  ) {
    return {
      valid: false,
      status: 400,
      code: 'ERR_VALIDATION_DIMENSIONS',
      error: `${itemLabel} "plotWidth" must be a positive finite number.`,
    };
  }

  if (
    item.plotLength !== undefined &&
    (typeof item.plotLength !== 'number' || !Number.isFinite(item.plotLength) || item.plotLength <= 0)
  ) {
    return {
      valid: false,
      status: 400,
      code: 'ERR_VALIDATION_DIMENSIONS',
      error: `${itemLabel} "plotLength" must be a positive finite number.`,
    };
  }

  return {
    valid: true,
    project: {
      id: item.id.trim().toLowerCase(),
      name: item.name.trim(),
      projectType: (item.projectType || 'house') as Project['projectType'],
      status: (item.status || 'Drafting') as Project['status'],
      unit: (item.unit || 'feet') as MeasurementUnit,
      budget: typeof item.budget === 'number' ? item.budget : 0,
      currency: (item.currency || 'USD') as Currency,
      rawPayload: item,
    },
  };
}

export function validateProjectBatchArray(
  rawProjects: unknown,
  tenantId: string
):
  | { valid: true; projects: ValidatedBatchProject[] }
  | { valid: false; status: number; code: string; error: string } {
  if (!Array.isArray(rawProjects) || rawProjects.length === 0) {
    return {
      valid: false,
      status: 400,
      code: 'ERR_INVALID_BATCH_BODY',
      error: 'Request body must include a non-empty "projects" array.',
    };
  }

  if (rawProjects.length > MAX_BATCH_PROJECTS) {
    return {
      valid: false,
      status: 400,
      code: 'ERR_BATCH_LIMIT_EXCEEDED',
      error: `Project batch exceeds maximum limit of ${MAX_BATCH_PROJECTS} projects.`,
    };
  }

  const validated: ValidatedBatchProject[] = [];
  const seenIds = new Set<string>();

  for (let i = 0; i < rawProjects.length; i++) {
    const check = validateBatchProjectItem(rawProjects[i], i, tenantId);
    if (!check.valid) {
      return check;
    }

    if (seenIds.has(check.project.id)) {
      return {
        valid: false,
        status: 400,
        code: 'ERR_DUPLICATE_BATCH_PROJECT_ID',
        error: `Duplicate project ID "${check.project.id}" detected in batch at item #${i + 1}.`,
      };
    }

    seenIds.add(check.project.id);
    validated.push(check.project);
  }

  return { valid: true, projects: validated };
}

export async function upsertValidatedProjectWithClient(
  client: any,
  tenantId: string,
  vp: ValidatedBatchProject
): Promise<Partial<Project> & Record<string, unknown>> {
  const existingRes = await client.query(
    `SELECT name, project_type, status, unit, budget, currency, data
     FROM projects
     WHERE id = $1 AND organization_id = $2
     FOR UPDATE`,
    [vp.id, tenantId]
  );

  if (existingRes.rows.length > 0) {
    const existingRow = existingRes.rows[0];
    const existingData = existingRow.data || {};
    const mergedData: Partial<Project> & Record<string, unknown> = {
      ...existingData,
      ...vp.rawPayload,
      id: vp.id,
      name: vp.name,
      projectType: vp.projectType,
      status: vp.status,
      unit: vp.unit,
      budget: vp.budget,
      currency: vp.currency,
      organizationId: tenantId,
    };
    delete mergedData.organization_id;

    await client.query(
      `UPDATE projects 
       SET name = $1,
           project_type = $2,
           status = $3,
           unit = $4,
           budget = $5,
           currency = $6,
           data = $7,
           updated_at = clock_timestamp()
       WHERE id = $8 AND organization_id = $9`,
      [
        vp.name,
        vp.projectType,
        vp.status,
        vp.unit,
        vp.budget,
        vp.currency,
        JSON.stringify(mergedData),
        vp.id,
        tenantId,
      ]
    );

    return mergedData;
  }

  const sanitizedBody: Partial<Project> & Record<string, unknown> = {
    ...vp.rawPayload,
    id: vp.id,
    name: vp.name,
    projectType: vp.projectType,
    status: vp.status,
    unit: vp.unit,
    budget: vp.budget,
    currency: vp.currency,
    organizationId: tenantId,
  };
  delete sanitizedBody.organization_id;

  const insertRes = await client.query(
    `INSERT INTO projects (
       id, organization_id, name, project_type, status, unit, budget, currency, data, created_at, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, clock_timestamp(), clock_timestamp())
     RETURNING id, created_at, updated_at`,
    [
      vp.id,
      tenantId,
      vp.name,
      vp.projectType,
      vp.status,
      vp.unit,
      vp.budget,
      vp.currency,
      JSON.stringify(sanitizedBody),
    ]
  );

  return {
    ...sanitizedBody,
    id: insertRes.rows[0]?.id || vp.id,
  };
}

export async function batchUpsertProjects(
  pool: any,
  tenantId: string,
  validatedProjects: ValidatedBatchProject[]
): Promise<Array<Partial<Project> & Record<string, unknown>>> {
  return withTenantContext(pool, tenantId, async (client) => {
    const results: Array<Partial<Project> & Record<string, unknown>> = [];
    for (const vp of validatedProjects) {
      const saved = await upsertValidatedProjectWithClient(client, tenantId, vp);
      results.push(saved);
    }
    return results;
  });
}

export async function resetSampleProjects(
  pool: any,
  tenantId: string,
  validatedSamples: ValidatedBatchProject[]
): Promise<{
  restoredProjects: Array<Partial<Project> & Record<string, unknown>>;
  deletedCount: number;
}> {
  const sampleIdsSet = new Set(validatedSamples.map((p) => p.id));
  return withTenantContext(pool, tenantId, async (client) => {
    // 1. Lock all existing projects for this tenant
    const existingRes = await client.query<{ id: string }>(
      `SELECT id FROM projects WHERE organization_id = $1 FOR UPDATE`,
      [tenantId]
    );
    const existingIds = existingRes.rows.map((r) => r.id);

    // 2. Upsert all sample projects in deterministic order
    const restored: Array<Partial<Project> & Record<string, unknown>> = [];
    for (const vp of validatedSamples) {
      const saved = await upsertValidatedProjectWithClient(client, tenantId, vp);
      restored.push(saved);
    }

    // 3. Delete any non-sample projects (and their snapshots) belonging to this tenant
    const nonSampleIds = existingIds.filter((id) => !sampleIdsSet.has(id.toLowerCase()));
    let removed = 0;
    for (const delId of nonSampleIds) {
      await client.query(
        `DELETE FROM project_snapshots WHERE project_id = $1 AND organization_id = $2`,
        [delId, tenantId]
      );
      const delRes = await client.query(
        `DELETE FROM projects WHERE id = $1 AND organization_id = $2`,
        [delId, tenantId]
      );
      if (delRes.rowCount && delRes.rowCount > 0) {
        removed += delRes.rowCount;
      }
    }

    return { restoredProjects: restored, deletedCount: removed };
  });
}

export async function clearAllTenantProjects(pool: any, tenantId: string): Promise<number> {
  return withTenantContext(pool, tenantId, async (client) => {
    await client.query(`DELETE FROM project_snapshots WHERE organization_id = $1`, [tenantId]);
    const delRes = await client.query(`DELETE FROM projects WHERE organization_id = $1`, [
      tenantId,
    ]);
    return delRes.rowCount || 0;
  });
}

/**
 * POST /api/projects/batch
 * Validates and imports/upserts a batch of projects in one atomic database transaction.
 * If any validation or database error occurs, zero projects from the batch are committed.
 */
projectsRouter.post('/batch', async (req: Request, res: Response): Promise<void> => {
  const tenantId = req.tenant!.id;
  const body = req.body as { projects?: unknown };

  const validation = validateProjectBatchArray(body?.projects, tenantId);
  if (!validation.valid) {
    res.status(validation.status).json({
      error: validation.error,
      code: validation.code,
    });
    return;
  }

  const pool = getAppPool();

  try {
    const savedProjects = await batchUpsertProjects(pool, tenantId, validation.projects);

    res.status(200).json({
      projects: savedProjects,
      count: savedProjects.length,
    });
  } catch (err: any) {
    console.error('[Projects API] POST /api/projects/batch error:', sanitizeDatabaseErrorMessage(err));
    res.status(500).json({
      error: 'Batch project import failed and all changes were rolled back.',
      code: 'ERR_DATABASE_BATCH_IMPORT',
    });
  }
});

/**
 * POST /api/projects/reset-samples
 * Atomically upserts the provided sample projects and deletes any non-sample projects
 * belonging to the authenticated tenant inside a single database transaction.
 */
projectsRouter.post('/reset-samples', async (req: Request, res: Response): Promise<void> => {
  const tenantId = req.tenant!.id;
  const body = req.body as { projects?: unknown };

  const validation = validateProjectBatchArray(body?.projects, tenantId);
  if (!validation.valid) {
    res.status(validation.status).json({
      error: validation.error,
      code: validation.code,
    });
    return;
  }

  const pool = getAppPool();

  try {
    const { restoredProjects, deletedCount } = await resetSampleProjects(
      pool,
      tenantId,
      validation.projects
    );

    res.status(200).json({
      projects: restoredProjects,
      deletedCount,
    });
  } catch (err: any) {
    console.error(
      '[Projects API] POST /api/projects/reset-samples error:',
      sanitizeDatabaseErrorMessage(err)
    );
    res.status(500).json({
      error: 'Sample project reset failed and all changes were rolled back.',
      code: 'ERR_DATABASE_RESET_SAMPLES',
    });
  }
});

/**
 * DELETE /api/projects
 * Atomically clears all projects and associated snapshots for the authenticated tenant
 * inside a single database transaction. Requires explicit confirmation flag.
 */
projectsRouter.delete('/', async (req: Request, res: Response): Promise<void> => {
  const tenantId = req.tenant!.id;
  const confirmed =
    req.body?.confirm === true ||
    req.query.confirm === 'true' ||
    req.headers['x-confirm-clear'] === 'true';

  if (!confirmed) {
    res.status(400).json({
      error: 'Explicit confirmation ("confirm: true") is required to clear all tenant projects.',
      code: 'ERR_CONFIRMATION_REQUIRED',
    });
    return;
  }

  const pool = getAppPool();

  try {
    const deletedCount = await clearAllTenantProjects(pool, tenantId);

    res.status(200).json({
      success: true,
      deletedCount,
    });
  } catch (err: any) {
    console.error('[Projects API] DELETE /api/projects error:', sanitizeDatabaseErrorMessage(err));
    res.status(500).json({
      error: 'Failed to clear tenant projects. All changes were rolled back.',
      code: 'ERR_DATABASE_CLEAR_ALL',
    });
  }
});

/**
 * GET /api/projects/:id
 * Fetches a single project by ID for the authenticated tenant.
 */
projectsRouter.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const tenantId = req.tenant!.id;

  if (!isValidId(id)) {
    res.status(400).json({
      error: `Invalid project identifier: "${id}".`,
      code: 'ERR_INVALID_ID',
    });
    return;
  }

  const pool = getAppPool();

  try {
    const project = await withTenantContext(pool, tenantId, async (client) => {
      const dbRes = await client.query<{
        id: string;
        name: string;
        project_type: string;
        status: string;
        unit: string;
        budget: string | number;
        currency: string;
        data: Partial<Project>;
      }>(
        `SELECT id, name, project_type, status, unit, budget, currency, data
         FROM projects
         WHERE id = $1 AND organization_id = $2`,
        [id, tenantId]
      );

      if (dbRes.rows.length === 0) return null;

      const row = dbRes.rows[0];
      return {
        ...row.data,
        id: row.id,
        name: row.name,
        projectType: row.project_type as any,
        status: row.status as any,
        unit: row.unit as any,
        budget: Number(row.budget),
        currency: row.currency as any,
      };
    });

    if (!project) {
      res.status(404).json({
        error: `Project with ID "${id}" was not found in this organization.`,
        code: 'ERR_PROJECT_NOT_FOUND',
      });
      return;
    }

    res.json({ project });
  } catch (err: any) {
    console.error(`[Projects API] GET /api/projects/${id} error:`, sanitizeDatabaseErrorMessage(err));
    res.status(500).json({
      error: 'Failed to retrieve project details.',
      code: 'ERR_DATABASE_QUERY',
    });
  }
});

/**
 * POST /api/projects
 * Creates a new project in the authenticated tenant.
 */
projectsRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  const tenantId = req.tenant!.id;
  const body = req.body as Partial<Project>;

  if (!body || typeof body !== 'object') {
    res.status(400).json({
      error: 'Invalid request body. Expected project JSON object.',
      code: 'ERR_INVALID_BODY',
    });
    return;
  }

  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    res.status(400).json({
      error: 'Project "name" is required and must be a non-empty string.',
      code: 'ERR_VALIDATION_NAME',
    });
    return;
  }

  if (body.name.trim().length > 255) {
    res.status(400).json({
      error: 'Project "name" must not exceed 255 characters.',
      code: 'ERR_VALIDATION_NAME',
    });
    return;
  }

  if (body.budget !== undefined && body.budget !== null) {
    if (typeof body.budget !== 'number' || !Number.isFinite(body.budget) || body.budget < 0) {
      res.status(400).json({
        error: 'Project "budget" must be a non-negative finite number.',
        code: 'ERR_VALIDATION_BUDGET',
      });
      return;
    }
  }

  if (body.unit !== undefined && body.unit !== null) {
    if (!isValidUnit(body.unit)) {
      res.status(400).json({
        error: `Invalid project "unit": "${String(body.unit)}". Must be one of: feet, metres.`,
        code: 'ERR_VALIDATION_UNIT',
      });
      return;
    }
  }

  if (body.currency !== undefined && body.currency !== null) {
    if (!isValidCurrency(body.currency)) {
      res.status(400).json({
        error: `Invalid project "currency": "${String(body.currency)}". Must be one of: USD, EUR, GBP, CAD, AUD, INR, AED, CHF.`,
        code: 'ERR_VALIDATION_CURRENCY',
      });
      return;
    }
  }

  if (body.id !== undefined && body.id !== null) {
    if (typeof body.id !== 'string' || !isValidId(body.id)) {
      res.status(400).json({
        error: `Invalid project identifier: "${body.id}". If supplied, project "id" must be a valid RFC 4122 UUID. Legacy IDs (e.g. "proj-001") must be mapped via idMapping before direct API submission.`,
        code: 'ERR_INVALID_PROJECT_ID',
      });
      return;
    }
  }

  const pool = getAppPool();

  try {
    const createdProject = await withTenantContext(pool, tenantId, async (client) => {
      const projectId = body.id ? body.id.trim().toLowerCase() : crypto.randomUUID();
      const name = body.name!.trim();
      const projectType = body.projectType || 'house';
      const status = body.status || 'Drafting';
      const unit = body.unit || 'feet';
      const budget = typeof body.budget === 'number' ? body.budget : 0;
      const currency = body.currency || 'USD';

      // Enforce tenant identity and relational field parity inside serialized metadata
      const sanitizedBody: Partial<Project> & Record<string, unknown> = {
        ...body,
        id: projectId,
        name,
        projectType,
        status,
        unit,
        budget,
        currency,
        organizationId: tenantId,
      };
      delete sanitizedBody.organization_id;

      const serializedData = JSON.stringify(sanitizedBody);

      const insertRes = await client.query<{ id: string; created_at: Date; updated_at: Date }>(
        `INSERT INTO projects (
           id, organization_id, name, project_type, status, unit, budget, currency, data, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, clock_timestamp(), clock_timestamp())
         RETURNING id, created_at, updated_at`,
        [projectId, tenantId, name, projectType, status, unit, budget, currency, serializedData]
      );

      return {
        ...sanitizedBody,
        id: insertRes.rows[0].id,
        name,
        projectType,
        status,
        unit,
        budget,
        currency,
      };
    });

    res.status(201).json({ project: createdProject });
  } catch (err: any) {
    console.error('[Projects API] POST /api/projects error:', sanitizeDatabaseErrorMessage(err));
    res.status(500).json({
      error: 'Failed to create project in database.',
      code: 'ERR_DATABASE_INSERT',
    });
  }
});

/**
 * PUT /api/projects/:id
 * Updates an existing project in the authenticated tenant.
 */
projectsRouter.put('/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const tenantId = req.tenant!.id;
  const updates = req.body as Partial<Project>;

  if (!isValidId(id)) {
    res.status(400).json({
      error: `Invalid project identifier: "${id}".`,
      code: 'ERR_INVALID_ID',
    });
    return;
  }

  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    res.status(400).json({
      error: 'Invalid request body. Expected project JSON object.',
      code: 'ERR_INVALID_BODY',
    });
    return;
  }

  if (updates.name !== undefined) {
    if (typeof updates.name !== 'string' || updates.name.trim().length === 0) {
      res.status(400).json({
        error: 'Project "name" must be a non-empty string.',
        code: 'ERR_VALIDATION_NAME',
      });
      return;
    }
    if (updates.name.trim().length > 255) {
      res.status(400).json({
        error: 'Project "name" must not exceed 255 characters.',
        code: 'ERR_VALIDATION_NAME',
      });
      return;
    }
  }

  if (updates.budget !== undefined && updates.budget !== null) {
    if (typeof updates.budget !== 'number' || !Number.isFinite(updates.budget) || updates.budget < 0) {
      res.status(400).json({
        error: 'Project "budget" must be a non-negative finite number.',
        code: 'ERR_VALIDATION_BUDGET',
      });
      return;
    }
  }

  if (updates.unit !== undefined) {
    if (!isValidUnit(updates.unit)) {
      res.status(400).json({
        error: `Invalid project "unit": "${String(updates.unit)}". Must be one of: feet, metres.`,
        code: 'ERR_VALIDATION_UNIT',
      });
      return;
    }
  }

  if (updates.currency !== undefined) {
    if (!isValidCurrency(updates.currency)) {
      res.status(400).json({
        error: `Invalid project "currency": "${String(updates.currency)}". Must be one of: USD, EUR, GBP, CAD, AUD, INR, AED, CHF.`,
        code: 'ERR_VALIDATION_CURRENCY',
      });
      return;
    }
  }

  const pool = getAppPool();

  try {
    const updated = await withTenantContext(pool, tenantId, async (client) => {
      // Check existing row and lock for atomic update
      const existingRes = await client.query<{
        name: string;
        project_type: string;
        status: string;
        unit: string;
        budget: string | number;
        currency: string;
        data: Partial<Project>;
      }>(
        `SELECT name, project_type, status, unit, budget, currency, data
         FROM projects
         WHERE id = $1 AND organization_id = $2
         FOR UPDATE`,
        [id, tenantId]
      );

      if (existingRes.rows.length === 0) return null;

      const existingRow = existingRes.rows[0];
      const existingData = existingRow.data || {};

      const name =
        updates.name !== undefined
          ? updates.name.trim()
          : (existingRow.name || existingData.name || 'Untitled Project');
      const projectType =
        updates.projectType !== undefined
          ? updates.projectType
          : ((existingRow.project_type as Project['projectType']) || existingData.projectType || 'house');
      const status =
        updates.status !== undefined
          ? updates.status
          : ((existingRow.status as Project['status']) || existingData.status || 'Drafting');
      const unit: MeasurementUnit =
        updates.unit !== undefined
          ? updates.unit
          : ((existingRow.unit as MeasurementUnit) || existingData.unit || 'feet');
      const budget =
        typeof updates.budget === 'number'
          ? updates.budget
          : (existingRow.budget !== undefined && existingRow.budget !== null
              ? Number(existingRow.budget)
              : (typeof existingData.budget === 'number' ? existingData.budget : 0));
      const currency: Currency =
        updates.currency !== undefined
          ? updates.currency
          : ((existingRow.currency as Currency) || existingData.currency || 'USD');

      // Enforce organizationId in mergedData cannot be changed and synchronize relational columns with JSONB data
      const mergedData: Partial<Project> & Record<string, unknown> = {
        ...existingData,
        ...updates,
        id,
        name,
        projectType,
        status,
        unit,
        budget,
        currency,
        organizationId: tenantId,
      };
      delete mergedData.organization_id;

      await client.query(
        `UPDATE projects 
         SET name = $1,
             project_type = $2,
             status = $3,
             unit = $4,
             budget = $5,
             currency = $6,
             data = $7,
             updated_at = clock_timestamp()
         WHERE id = $8 AND organization_id = $9`,
        [
          name,
          projectType,
          status,
          unit,
          budget,
          currency,
          JSON.stringify(mergedData),
          id,
          tenantId,
        ]
      );

      return mergedData;
    });

    if (!updated) {
      res.status(404).json({
        error: `Project "${id}" not found or unauthorized.`,
        code: 'ERR_PROJECT_NOT_FOUND',
      });
      return;
    }

    res.json({ project: updated });
  } catch (err: any) {
    console.error(`[Projects API] PUT /api/projects/${id} error:`, sanitizeDatabaseErrorMessage(err));
    res.status(500).json({
      error: 'Failed to update project in database.',
      code: 'ERR_DATABASE_UPDATE',
    });
  }
});

/**
 * DELETE /api/projects/:id
 * Removes a project and all associated cascading snapshots from the tenant.
 */
projectsRouter.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const tenantId = req.tenant!.id;

  if (!isValidId(id)) {
    res.status(400).json({
      error: `Invalid project identifier: "${id}".`,
      code: 'ERR_INVALID_ID',
    });
    return;
  }

  const pool = getAppPool();

  try {
    const deleted = await withTenantContext(pool, tenantId, async (client) => {
      const delRes = await client.query(
        `DELETE FROM projects WHERE id = $1 AND organization_id = $2`,
        [id, tenantId]
      );
      return delRes.rowCount && delRes.rowCount > 0;
    });

    if (!deleted) {
      res.status(404).json({
        error: `Project "${id}" not found or unauthorized.`,
        code: 'ERR_PROJECT_NOT_FOUND',
      });
      return;
    }

    res.json({ success: true, id });
  } catch (err: any) {
    console.error(`[Projects API] DELETE /api/projects/${id} error:`, sanitizeDatabaseErrorMessage(err));
    res.status(500).json({
      error: 'Failed to delete project from database.',
      code: 'ERR_DATABASE_DELETE',
    });
  }
});
