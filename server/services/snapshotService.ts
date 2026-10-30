/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import { Pool, PoolClient } from 'pg';
import { Project } from '../../src/types/project';
import { ProjectSnapshot, SnapshotTrigger } from '../../src/types/versioning';
import { withTenantContext } from '../db/tenantContext';

export interface CreateSnapshotInput {
  projectId: string;
  organizationId: string;
  versionTag: string;
  label: string;
  description?: string;
  trigger: SnapshotTrigger;
  authorId?: string;
  metrics?: Record<string, unknown>;
  projectData: Project;
}

export interface DbSnapshotRecord {
  id: string;
  project_id: string;
  organization_id: string;
  revision: number;
  version_tag: string;
  label: string;
  description: string | null;
  trigger: string;
  author_id: string | null;
  metrics: Record<string, unknown>;
  project_data: Project;
  checksum: string;
  created_at: Date;
}

/**
 * Computes deterministic SHA-256 fingerprint of a project state.
 */
export function computeProjectDataChecksum(projectData: Project): string {
  const serialized = JSON.stringify(projectData);
  return crypto.createHash('sha256').update(serialized, 'utf8').digest('hex');
}

/**
 * Atomically creates a project snapshot with sequential revision numbering
 * guaranteed via an exclusive row-level lock on the parent project row.
 */
export async function createSnapshotWithClient(
  client: PoolClient,
  input: CreateSnapshotInput
): Promise<DbSnapshotRecord> {
  const {
    projectId,
    organizationId,
    versionTag,
    label,
    description = '',
    trigger,
    authorId = null,
    metrics = {},
    projectData,
  } = input;

  // 1. Acquire exclusive row-level lock on parent project
  const projectLockRes = await client.query<{ id: string }>(
    `SELECT id FROM projects WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
    [projectId, organizationId]
  );

  if (projectLockRes.rows.length === 0) {
    throw new Error(
      `Project "${projectId}" not found in tenant "${organizationId}" or access denied.`
    );
  }

  // 2. Compute the next sequential revision number
  const revRes = await client.query<{ next_rev: number }>(
    `SELECT COALESCE(MAX(revision), 0) + 1 AS next_rev 
     FROM project_snapshots 
     WHERE project_id = $1 AND organization_id = $2`,
    [projectId, organizationId]
  );

  const nextRevision = revRes.rows[0].next_rev;
  const checksum = computeProjectDataChecksum(projectData);

  // 3. Insert snapshot row
  const insertRes = await client.query<DbSnapshotRecord>(
    `INSERT INTO project_snapshots (
       id, project_id, organization_id, revision, version_tag, label,
       description, trigger, author_id, metrics, project_data, checksum, created_at
     )
     VALUES (
       gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, clock_timestamp()
     )
     RETURNING *`,
    [
      projectId,
      organizationId,
      nextRevision,
      versionTag,
      label,
      description,
      trigger,
      authorId,
      JSON.stringify(metrics),
      JSON.stringify(projectData),
      checksum,
    ]
  );

  return insertRes.rows[0];
}

/**
 * Top-level convenience wrapper setting tenant context and creating snapshot.
 */
export async function createProjectSnapshot(
  pool: Pool,
  input: CreateSnapshotInput
): Promise<DbSnapshotRecord> {
  return withTenantContext(pool, input.organizationId, async (client) => {
    return createSnapshotWithClient(client, input);
  });
}

export interface BatchSnapshotItemInput {
  clientSnapshotId?: string;
  revisionNumber?: number;
  versionTag?: string;
  label: string;
  description?: string;
  trigger?: SnapshotTrigger;
  metrics?: Record<string, unknown>;
  projectData: Project;
}

export interface CreateSnapshotsBatchInput {
  projectId: string;
  organizationId: string;
  authorId?: string;
  snapshots: BatchSnapshotItemInput[];
}

export interface CreateSnapshotsBatchResult {
  importedCount: number;
  snapshots: DbSnapshotRecord[];
}

/**
 * Atomically imports a batch of project snapshots inside a single database transaction.
 * Locks the parent project row once (FOR UPDATE), deduplicates against existing revisions
 * and intra-batch duplicates for safe retry idempotency, and assigns contiguous revisions.
 * If any insert fails, the caller's transaction rolls back all snapshots in the batch.
 */
export async function createSnapshotsBatchWithClient(
  client: PoolClient,
  input: CreateSnapshotsBatchInput
): Promise<CreateSnapshotsBatchResult> {
  const { projectId, organizationId, authorId = null, snapshots } = input;

  // 1. Acquire exclusive row-level lock on parent project
  const projectLockRes = await client.query<{ id: string }>(
    `SELECT id FROM projects WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
    [projectId, organizationId]
  );

  if (projectLockRes.rows.length === 0) {
    throw new Error(
      `Project "${projectId}" not found in tenant "${organizationId}" or access denied.`
    );
  }

  // 2. Load existing snapshots for deterministic deduplication and revision numbering
  const existingRes = await client.query<DbSnapshotRecord>(
    `SELECT * FROM project_snapshots
     WHERE project_id = $1 AND organization_id = $2
     ORDER BY revision ASC`,
    [projectId, organizationId]
  );

  const existingRows = existingRes.rows;
  let nextRevision =
    existingRows.reduce((max, r) => Math.max(max, Number(r.revision) || 0), 0) + 1;

  const seenSnapshotIds = new Set<string>();
  const seenSourceIds = new Set<string>();
  const seenSignatures = new Set<string>();

  for (const row of existingRows) {
    if (row.id) seenSnapshotIds.add(row.id);
    const srcId =
      row.metrics && typeof (row.metrics as any).sourceSnapshotId === 'string'
        ? ((row.metrics as any).sourceSnapshotId as string)
        : undefined;
    if (srcId) seenSourceIds.add(srcId);
    seenSignatures.add(`${row.version_tag}|${row.label}|${row.checksum}`);
  }

  // Sort incoming items by revisionNumber ascending when provided so bundle history order is preserved
  const orderedItems = snapshots
    .map((item, idx) => ({ item, idx }))
    .sort((a, b) => {
      const revA = typeof a.item.revisionNumber === 'number' ? a.item.revisionNumber : a.idx + 1;
      const revB = typeof b.item.revisionNumber === 'number' ? b.item.revisionNumber : b.idx + 1;
      return revA - revB;
    })
    .map((entry) => entry.item);

  const insertedRows: DbSnapshotRecord[] = [];

  for (const item of orderedItems) {
    const versionTag = (item.versionTag || 'v1.0-import').trim();
    const label = item.label.trim();
    const description = item.description || '';
    const trigger: SnapshotTrigger = item.trigger || 'import';
    const checksum = computeProjectDataChecksum(item.projectData);
    const clientSnapId = item.clientSnapshotId?.trim();
    const signature = `${versionTag}|${label}|${checksum}`;

    if (
      (clientSnapId && (seenSnapshotIds.has(clientSnapId) || seenSourceIds.has(clientSnapId))) ||
      seenSignatures.has(signature)
    ) {
      continue;
    }

    const metricsPayload: Record<string, unknown> = {
      ...(item.metrics || {}),
      ...(clientSnapId ? { sourceSnapshotId: clientSnapId } : {}),
    };

    const insertRes = await client.query<DbSnapshotRecord>(
      `INSERT INTO project_snapshots (
         id, project_id, organization_id, revision, version_tag, label,
         description, trigger, author_id, metrics, project_data, checksum, created_at
       )
       VALUES (
         gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, clock_timestamp()
       )
       RETURNING *`,
      [
        projectId,
        organizationId,
        nextRevision,
        versionTag,
        label,
        description,
        trigger,
        authorId,
        JSON.stringify(metricsPayload),
        JSON.stringify(item.projectData),
        checksum,
      ]
    );

    const created = insertRes.rows[0];
    insertedRows.push(created);
    nextRevision += 1;

    if (clientSnapId) {
      seenSourceIds.add(clientSnapId);
    }
    seenSignatures.add(signature);
  }

  const allSnapshotsDesc = [...existingRows, ...insertedRows].sort(
    (a, b) => Number(b.revision) - Number(a.revision)
  );

  return {
    importedCount: insertedRows.length,
    snapshots: allSnapshotsDesc,
  };
}

/**
 * Top-level transactional wrapper setting tenant context and importing a snapshot batch.
 */
export async function createProjectSnapshotsBatch(
  pool: Pool,
  input: CreateSnapshotsBatchInput
): Promise<CreateSnapshotsBatchResult> {
  return withTenantContext(pool, input.organizationId, async (client) => {
    return createSnapshotsBatchWithClient(client, input);
  });
}

/**
 * Lists all snapshots for a project in descending revision order.
 */
export async function listProjectSnapshots(
  pool: Pool,
  tenantId: string,
  projectId: string
): Promise<DbSnapshotRecord[]> {
  return withTenantContext(pool, tenantId, async (client) => {
    const res = await client.query<DbSnapshotRecord>(
      `SELECT * FROM project_snapshots 
       WHERE project_id = $1 AND organization_id = $2 
       ORDER BY revision DESC`,
      [projectId, tenantId]
    );
    return res.rows;
  });
}

