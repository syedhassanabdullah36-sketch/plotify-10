/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Project } from '../types/project';
import { StorageQuotaInfo, StorageIntegrityAuditResult, StorageIntegrityIssue } from '../types/security';
import { safeJsonParse } from '../utils/securityUtils';

export const ESTIMATED_LOCAL_STORAGE_LIMIT_BYTES = 5 * 1024 * 1024; // 5 MB standard browser quota
const PROJECTS_KEY = 'architecture_intelligence_os_projects_v1';
const SNAPSHOT_PREFIX = 'plotify_snapshots_v1_';
const SAFETY_BACKUP_KEY = 'plotify_safety_backups_v1';

export class StorageQuotaError extends Error {
  constructor(message: string, public readonly usedBytes: number) {
    super(message);
    this.name = 'StorageQuotaError';
  }
}

/**
 * Calculates current localStorage utilization across all keys and Plotify keys.
 */
export function getStorageQuotaInfo(): StorageQuotaInfo {
  let usedBytes = 0;
  let projectCount = 0;
  let snapshotCount = 0;

  if (typeof localStorage !== 'undefined') {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        const value = localStorage.getItem(key) || '';
        // 2 bytes per UTF-16 character in browser memory
        const keyBytes = key.length * 2;
        const valBytes = value.length * 2;
        usedBytes += keyBytes + valBytes;

        if (key === PROJECTS_KEY) {
          const parsed = safeJsonParse<unknown[]>(value, []);
          projectCount = Array.isArray(parsed) ? parsed.length : 0;
        } else if (key.startsWith(SNAPSHOT_PREFIX) || key === SAFETY_BACKUP_KEY) {
          const parsed = safeJsonParse<unknown[]>(value, []);
          if (Array.isArray(parsed)) {
            snapshotCount += parsed.length;
          }
        }
      }
    } catch (error) {
      console.warn('[StorageGuard] Error reading storage keys for quota computation:', error);
    }
  }

  const percentageUsed = Math.min(100, Math.round((usedBytes / ESTIMATED_LOCAL_STORAGE_LIMIT_BYTES) * 100));

  return {
    usedBytes,
    estimatedTotalBytes: ESTIMATED_LOCAL_STORAGE_LIMIT_BYTES,
    percentageUsed,
    isNearLimit: percentageUsed >= 80,
    projectCount,
    snapshotCount,
    lastCalculatedAt: new Date().toISOString(),
  };
}

/**
 * Safe write wrapper that detects QuotaExceededError and prevents silent failure.
 */
export function safeStorageSetItem(key: string, value: string): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(key, value);
  } catch (err: unknown) {
    const isQuotaError =
      err instanceof DOMException &&
      (err.code === 22 ||
        err.code === 1014 ||
        err.name === 'QuotaExceededError' ||
        err.name === 'NS_ERROR_DOM_QUOTA_REACHED');

    if (isQuotaError) {
      console.warn('[StorageGuard] Storage quota exceeded. Attempting emergency non-destructive checkpoint cleanup...');
      // Emergency: prune auto-checkpoints across projects
      pruneAutoCheckpointsEmergency();
      try {
        localStorage.setItem(key, value);
        console.info('[StorageGuard] Successfully wrote item after emergency pruning.');
        return;
      } catch (retryErr) {
        const quotaInfo = getStorageQuotaInfo();
        throw new StorageQuotaError(
          'Browser storage capacity exceeded (~5MB). Please export a full system backup and archive older projects to free space.',
          quotaInfo.usedBytes
        );
      }
    }
    throw err;
  }
}

/**
 * Emergency non-destructive pruning of ephemeral auto-checkpoints.
 * Never deletes manual milestones or safety rollbacks.
 */
function pruneAutoCheckpointsEmergency(): void {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(SNAPSHOT_PREFIX)) {
        const raw = localStorage.getItem(k);
        if (raw) {
          const list = safeJsonParse<Array<{ trigger?: string }>>(raw, []);
          if (Array.isArray(list)) {
            // Keep manual milestones and safety rollbacks, prune auto-checkpoints to latest 3
            const manual = list.filter((s) => s.trigger !== 'auto-save' && s.trigger !== 'pre-restore-safety');
            const autos = list.filter((s) => s.trigger === 'auto-save').slice(-3);
            const safety = list.filter((s) => s.trigger === 'pre-restore-safety').slice(-3);
            const preserved = [...manual, ...safety, ...autos];
            localStorage.setItem(k, JSON.stringify(preserved));
          }
        }
      }
    }
  } catch (e) {
    console.warn('[StorageGuard] Emergency pruning error:', e);
  }
}

/**
 * Audits all projects and snapshots in storage for integrity and schema consistency.
 */
export function auditStorageIntegrity(projects: Project[]): StorageIntegrityAuditResult {
  const issues: StorageIntegrityIssue[] = [];

  // 1. Audit Projects
  projects.forEach((proj, idx) => {
    if (!proj.id || typeof proj.id !== 'string') {
      issues.push({
        severity: 'error',
        field: 'id',
        message: `Project at index ${idx} is missing a valid unique ID string.`,
        autoFixable: true,
      });
    }

    if (!proj.name || typeof proj.name !== 'string' || proj.name.trim().length === 0) {
      issues.push({
        severity: 'warning',
        projectId: proj.id,
        field: 'name',
        message: `Project "${proj.id}" has an empty or invalid name.`,
        remediation: 'Provide a recognizable project name.',
      });
    }

    if (typeof proj.plotWidth !== 'number' || proj.plotWidth <= 0) {
      issues.push({
        severity: 'error',
        projectId: proj.id,
        projectName: proj.name,
        field: 'plotWidth',
        message: `Project "${proj.name}" has invalid plotWidth: ${proj.plotWidth}. Width must be positive.`,
      });
    }

    if (typeof proj.plotLength !== 'number' || proj.plotLength <= 0) {
      issues.push({
        severity: 'error',
        projectId: proj.id,
        projectName: proj.name,
        field: 'plotLength',
        message: `Project "${proj.name}" has invalid plotLength: ${proj.plotLength}. Length must be positive.`,
      });
    }

    if (!proj.floorPlan || !Array.isArray(proj.floorPlan.rooms)) {
      issues.push({
        severity: 'error',
        projectId: proj.id,
        projectName: proj.name,
        field: 'floorPlan.rooms',
        message: `Project "${proj.name}" has corrupted or missing floorPlan rooms array.`,
      });
    } else {
      const roomIds = new Set<string>();
      proj.floorPlan.rooms.forEach((r, rIdx) => {
        if (!r.id) {
          issues.push({
            severity: 'error',
            projectId: proj.id,
            projectName: proj.name,
            field: `floorPlan.rooms[${rIdx}].id`,
            message: `Room at index ${rIdx} in "${proj.name}" is missing a valid ID.`,
          });
        } else if (roomIds.has(r.id)) {
          issues.push({
            severity: 'warning',
            projectId: proj.id,
            projectName: proj.name,
            field: `floorPlan.rooms[${rIdx}].id`,
            message: `Duplicate room ID "${r.id}" detected in project "${proj.name}".`,
          });
        } else {
          roomIds.add(r.id);
        }

        if (r.width <= 0 || r.length <= 0) {
          issues.push({
            severity: 'error',
            projectId: proj.id,
            projectName: proj.name,
            field: `floorPlan.rooms[${r.id}].dimensions`,
            message: `Room "${r.name || r.id}" has non-positive dimensions (${r.width}x${r.length}).`,
          });
        }
      });
    }

    // Check MEP coordination consistency if present
    if (proj.mepCoordination && !Array.isArray(proj.mepCoordination.components)) {
      issues.push({
        severity: 'warning',
        projectId: proj.id,
        projectName: proj.name,
        field: 'mepCoordination.components',
        message: `MEP coordination components data structure in "${proj.name}" is non-standard.`,
      });
    }
  });

  // 2. Audit Snapshots
  let totalSnapshots = 0;
  if (typeof localStorage !== 'undefined') {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(SNAPSHOT_PREFIX)) {
          const projectIdFromKey = key.replace(SNAPSHOT_PREFIX, '');
          const exists = projects.some((p) => p.id === projectIdFromKey);
          const raw = localStorage.getItem(key);
          const parsed = safeJsonParse<unknown[]>(raw, []);
          if (Array.isArray(parsed)) {
            totalSnapshots += parsed.length;
          }

          if (!exists) {
            issues.push({
              severity: 'info',
              projectId: projectIdFromKey,
              message: `Orphaned snapshot storage found for deleted project "${projectIdFromKey}". Can be safely cleaned.`,
              remediation: 'Purge orphaned snapshots to reclaim storage.',
              autoFixable: true,
            });
          }
        }
      }
    } catch (err) {
      console.warn('[StorageGuard] Error auditing snapshots:', err);
    }
  }

  const errorsCount = issues.filter((i) => i.severity === 'error').length;
  const warningsCount = issues.filter((i) => i.severity === 'warning').length;

  return {
    passed: errorsCount === 0,
    auditedAt: new Date().toISOString(),
    totalProjectsAudited: projects.length,
    totalSnapshotsAudited: totalSnapshots,
    errorsCount,
    warningsCount,
    issues,
    schemaVersion: 2,
  };
}

/**
 * Reclaims storage by removing orphaned snapshots for deleted projects.
 */
export function purgeOrphanedSnapshots(activeProjects: Project[]): number {
  const activeIds = new Set(activeProjects.map((p) => p.id));
  let purgedCount = 0;

  if (typeof localStorage !== 'undefined') {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(SNAPSHOT_PREFIX)) {
          const projId = key.replace(SNAPSHOT_PREFIX, '');
          if (!activeIds.has(projId)) {
            keysToRemove.push(key);
          }
        }
      }

      keysToRemove.forEach((k) => {
        localStorage.removeItem(k);
        purgedCount++;
      });
    } catch (err) {
      console.warn('[StorageGuard] Failed to purge orphaned snapshots:', err);
    }
  }

  return purgedCount;
}
