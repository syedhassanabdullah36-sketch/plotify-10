/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import { Pool, PoolClient } from 'pg';
import { Project, MeasurementUnit, Currency } from '../../src/types/project';
import { isUuid } from '../../src/utils/idMapping';
import { withTenantContext } from '../db/tenantContext';
import { computeProjectDataChecksum } from './snapshotService';

export const MAX_PROJECTS_PER_ARCHIVE = 100;
export const MAX_PAYLOAD_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

export interface ProjectArchiveItem {
  project: Project;
  snapshots?: Array<{
    revision: number;
    versionTag: string;
    label: string;
    description?: string;
    trigger: string;
    metrics?: Record<string, unknown>;
    projectData: Project;
  }>;
}

export interface ProjectArchivePayload {
  archiveVersion: string;
  archiveName: string;
  exportedAt: string;
  tenantId?: string;
  items: ProjectArchiveItem[];
}

export interface ArchiveValidationResult {
  valid: boolean;
  errors: string[];
  projectCount: number;
  sizeBytes: number;
}

export interface IngestionResult {
  jobId: string;
  archiveName: string;
  projectsIngested: number;
  snapshotsIngested: number;
  durationMs: number;
}

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

/**
 * Validates the raw uncompressed archive payload against strict size,
 * project-count, and schema integrity constraints.
 */
export function validateArchivePayload(
  rawPayload: unknown,
  expectedTenantId?: string
): ArchiveValidationResult {
  const errors: string[] = [];

  if (!rawPayload || typeof rawPayload !== 'object') {
    return { valid: false, errors: ['Archive payload must be a non-null object.'], projectCount: 0, sizeBytes: 0 };
  }

  const serialized = JSON.stringify(rawPayload);
  const sizeBytes = Buffer.byteLength(serialized, 'utf8');

  if (sizeBytes > MAX_PAYLOAD_SIZE_BYTES) {
    errors.push(
      `Archive payload exceeds maximum size limit of 50 MB (Actual: ${(sizeBytes / (1024 * 1024)).toFixed(2)} MB).`
    );
  }

  const payload = rawPayload as Partial<ProjectArchivePayload>;

  if (!payload.archiveName || typeof payload.archiveName !== 'string' || payload.archiveName.trim().length === 0) {
    errors.push('Archive payload missing required string property "archiveName".');
  }

  if (
    expectedTenantId &&
    typeof payload.tenantId === 'string' &&
    payload.tenantId.trim().length > 0 &&
    payload.tenantId.trim().toLowerCase() !== expectedTenantId.trim().toLowerCase()
  ) {
    errors.push('Archive payload "tenantId" does not match the authenticated tenant context.');
  }

  if (!Array.isArray(payload.items)) {
    errors.push('Archive payload missing required array property "items".');
    return { valid: false, errors, projectCount: 0, sizeBytes };
  }

  const projectCount = payload.items.length;

  if (projectCount === 0) {
    errors.push('Archive contains 0 projects. Must contain between 1 and 100 projects.');
  }

  if (projectCount > MAX_PROJECTS_PER_ARCHIVE) {
    errors.push(
      `Archive contains ${projectCount} projects, exceeding the maximum limit of ${MAX_PROJECTS_PER_ARCHIVE} projects.`
    );
  }

  payload.items.forEach((item, idx) => {
    if (!item || !item.project || typeof item.project !== 'object') {
      errors.push(`Item #${idx + 1} is missing a valid "project" object.`);
      return;
    }
    const proj = item.project as Partial<Project> & Record<string, unknown>;

    if (!proj.id || typeof proj.id !== 'string' || proj.id.trim().length === 0) {
      errors.push(`Item #${idx + 1} project is missing a valid string "id".`);
    } else if (!isUuid(proj.id)) {
      errors.push(
        `Item #${idx + 1} project has an invalid UUID "id": "${proj.id}". Must be a valid RFC 4122 UUID.`
      );
    }

    if (!proj.name || typeof proj.name !== 'string' || proj.name.trim().length === 0) {
      errors.push(`Item #${idx + 1} project is missing a valid string "name".`);
    } else if (proj.name.trim().length > 255) {
      errors.push(`Item #${idx + 1} project "name" exceeds maximum length of 255 characters.`);
    }

    if (
      typeof proj.plotWidth !== 'number' ||
      !Number.isFinite(proj.plotWidth) ||
      proj.plotWidth <= 0 ||
      typeof proj.plotLength !== 'number' ||
      !Number.isFinite(proj.plotLength) ||
      proj.plotLength <= 0
    ) {
      errors.push(`Item #${idx + 1} project has invalid plot dimensions.`);
    }

    if (proj.unit !== undefined && proj.unit !== null && !VALID_UNITS.has(proj.unit as MeasurementUnit)) {
      errors.push(
        `Item #${idx + 1} project has an invalid "unit": "${String(proj.unit)}". Must be one of: feet, metres.`
      );
    }

    if (
      proj.currency !== undefined &&
      proj.currency !== null &&
      !VALID_CURRENCIES.has(proj.currency as Currency)
    ) {
      errors.push(
        `Item #${idx + 1} project has an invalid "currency": "${String(proj.currency)}".`
      );
    }

    if (
      proj.budget !== undefined &&
      proj.budget !== null &&
      (typeof proj.budget !== 'number' || !Number.isFinite(proj.budget) || proj.budget < 0)
    ) {
      errors.push(`Item #${idx + 1} project "budget" must be a non-negative finite number.`);
    }

    const explicitOrgId =
      (typeof proj.organizationId === 'string' && proj.organizationId.trim()) ||
      (typeof proj.organization_id === 'string' && proj.organization_id.trim()) ||
      '';
    if (
      expectedTenantId &&
      explicitOrgId &&
      explicitOrgId.toLowerCase() !== expectedTenantId.trim().toLowerCase()
    ) {
      errors.push(
        `Item #${idx + 1} project specifies an unauthorized cross-tenant organization ID.`
      );
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    projectCount,
    sizeBytes,
  };
}

/**
 * Ingests a validated project archive inside a single atomic transaction.
 * If any project or snapshot insert fails, the entire transaction rolls back.
 */
export async function ingestProjectArchive(
  pool: Pool,
  organizationId: string,
  payload: ProjectArchivePayload
): Promise<IngestionResult> {
  const validation = validateArchivePayload(payload, organizationId);
  if (!validation.valid) {
    throw new Error(`Archive validation failed: ${validation.errors.join('; ')}`);
  }

  const startTime = Date.now();
  const serialized = JSON.stringify(payload);
  const checksum = crypto.createHash('sha256').update(serialized, 'utf8').digest('hex');

  return withTenantContext(pool, organizationId, async (client: PoolClient) => {
    // 1. Create audit job record
    const jobRes = await client.query<{ id: string }>(
      `INSERT INTO archive_ingestion_jobs (
         id, organization_id, archive_name, project_count, payload_size_bytes, status, checksum, created_at
       )
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'in_progress', $5, clock_timestamp())
       RETURNING id`,
      [organizationId, payload.archiveName, validation.projectCount, validation.sizeBytes, checksum]
    );

    const jobId = jobRes.rows[0].id;
    let totalProjects = 0;
    let totalSnapshots = 0;

    // 2. Insert or update projects and snapshots atomically
    for (const item of payload.items) {
      const p = item.project as Partial<Project> & Record<string, unknown>;
      const projectId = p.id!.trim().toLowerCase();

      // Check if project already exists within the authenticated tenant to preserve existing
      // JSONB properties and omitted optional relational columns during archive re-ingestion
      const existingRes = await client.query<{
        name: string;
        project_type: string;
        status: string;
        unit: string;
        budget: string | number;
        currency: string;
        data: Record<string, unknown>;
      }>(
        `SELECT name, project_type, status, unit, budget, currency, data
         FROM projects
         WHERE id = $1 AND organization_id = $2
         FOR UPDATE`,
        [projectId, organizationId]
      );

      const existingRow = existingRes.rows[0];
      const existingData = existingRow?.data || {};

      const name = p.name!.trim();
      const projectType =
        p.projectType !== undefined && p.projectType !== null
          ? p.projectType
          : ((existingRow?.project_type as Project['projectType']) ||
              (existingData.projectType as Project['projectType']) ||
              'house');
      const status =
        p.status !== undefined && p.status !== null
          ? p.status
          : ((existingRow?.status as Project['status']) ||
              (existingData.status as Project['status']) ||
              'Drafting');
      const unit: MeasurementUnit =
        p.unit !== undefined && p.unit !== null
          ? p.unit
          : ((existingRow?.unit as MeasurementUnit) ||
              (existingData.unit as MeasurementUnit) ||
              'feet');
      const budget =
        typeof p.budget === 'number'
          ? p.budget
          : existingRow?.budget !== undefined && existingRow?.budget !== null
          ? Number(existingRow.budget)
          : typeof existingData.budget === 'number'
          ? existingData.budget
          : 0;
      const currency: Currency =
        p.currency !== undefined && p.currency !== null
          ? p.currency
          : ((existingRow?.currency as Currency) ||
              (existingData.currency as Currency) ||
              'USD');

      const mergedData: Record<string, unknown> = {
        ...existingData,
        ...p,
        id: projectId,
        name,
        projectType,
        status,
        unit,
        budget,
        currency,
        organizationId,
      };
      delete mergedData.organization_id;

      await client.query(
        `INSERT INTO projects (
           id, organization_id, name, project_type, status, unit, budget, currency, data, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, clock_timestamp(), clock_timestamp())
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           project_type = EXCLUDED.project_type,
           status = EXCLUDED.status,
           unit = EXCLUDED.unit,
           budget = EXCLUDED.budget,
           currency = EXCLUDED.currency,
           data = projects.data || EXCLUDED.data,
           updated_at = clock_timestamp()`,
        [
          projectId,
          organizationId,
          name,
          projectType,
          status,
          unit,
          budget,
          currency,
          JSON.stringify(mergedData),
        ]
      );
      totalProjects++;

      if (Array.isArray(item.snapshots) && item.snapshots.length > 0) {
        for (const snap of item.snapshots) {
          const snapshotProjectData = (snap.projectData || mergedData) as Project;
          const snapChecksum = computeProjectDataChecksum(snapshotProjectData);
          const snapRes = await client.query(
            `INSERT INTO project_snapshots (
               id, project_id, organization_id, revision, version_tag, label,
               description, trigger, metrics, project_data, checksum, created_at
             )
             VALUES (
               gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, clock_timestamp()
             )
             ON CONFLICT (project_id, revision) DO NOTHING`,
            [
              projectId,
              organizationId,
              snap.revision,
              snap.versionTag || `v${snap.revision}.0`,
              snap.label || `Snapshot Rev ${snap.revision}`,
              snap.description || '',
              snap.trigger || 'import',
              JSON.stringify(snap.metrics || {}),
              JSON.stringify(snapshotProjectData),
              snapChecksum,
            ]
          );
          if ((snapRes.rowCount ?? 1) > 0) {
            totalSnapshots++;
          }
        }
      }
    }

    // 3. Mark job complete
    await client.query(
      `UPDATE archive_ingestion_jobs 
       SET status = 'completed', completed_at = clock_timestamp() 
       WHERE id = $1`,
      [jobId]
    );

    return {
      jobId,
      archiveName: payload.archiveName,
      projectsIngested: totalProjects,
      snapshotsIngested: totalSnapshots,
      durationMs: Date.now() - startTime,
    };
  });
}
