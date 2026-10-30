/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Project, AppSettings } from '../types/project';
import { ProjectSnapshot } from '../types/versioning';
import { PlotifySystemBackup, BackupValidationResult } from '../types/security';
import { loadProjects, saveProjects, loadSettings, saveSettings, isCloudPersistenceEnabled } from './storage';
import { computeStringChecksum, safeJsonParse } from '../utils/securityUtils';
import { safeStorageSetItem } from './storageGuard';
import { ingestArchive as apiIngestArchive } from './apiClient';
import { normalizeProjectForCloud } from '../utils/idMapping';

const SNAPSHOT_PREFIX = 'plotify_snapshots_v1_';
const SYSTEM_PRE_RESTORE_SAFETY_KEY = 'plotify_system_pre_restore_safety_v1';
const APP_VERSION = '1.0.0-p19';

/**
 * Collects all project data, settings, and revision history into a single structured backup payload.
 */
export function generateSystemBackup(): PlotifySystemBackup {
  const projects = loadProjects();
  const settings = loadSettings();
  const snapshots: Record<string, ProjectSnapshot[]> = {};
  let totalSnapshots = 0;

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(SNAPSHOT_PREFIX)) {
        const projId = key.replace(SNAPSHOT_PREFIX, '');
        const raw = localStorage.getItem(key);
        const parsed = safeJsonParse<ProjectSnapshot[]>(raw, []);
        if (Array.isArray(parsed) && parsed.length > 0) {
          snapshots[projId] = parsed;
          totalSnapshots += parsed.length;
        }
      }
    }
  } catch (err) {
    console.warn('[BackupService] Could not export snapshots:', err);
  }

  const exportedAt = new Date().toISOString();

  // Create deterministic string for checksum
  const rawDataPayload = JSON.stringify({
    projects,
    settings,
    snapshots,
  });

  const checksum = computeStringChecksum(rawDataPayload);

  return {
    formatVersion: 'plotify-backup-v1',
    exportedAt,
    appVersion: APP_VERSION,
    checksum,
    environment: {
      origin: typeof window !== 'undefined' ? window.location.origin : 'local',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 100) : 'node',
      storageEngine: 'localStorage',
    },
    data: {
      projects,
      settings,
      snapshots,
      metadata: {
        totalProjects: projects.length,
        totalSnapshots,
        exportSummary: `Plotify Full Backup: ${projects.length} projects, ${totalSnapshots} revision snapshots.`,
      },
    },
  };
}

/**
 * Downloads the system backup as a JSON file.
 */
export function downloadSystemBackup(backup?: PlotifySystemBackup): void {
  const payload = backup || generateSystemBackup();
  const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
  const fileName = `plotify-full-backup-${dateStr}.json`;

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Validates an uploaded backup file string before application.
 */
export function validateSystemBackupFile(fileContent: string, currentProjects: Project[]): BackupValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const parsed = safeJsonParse<Partial<PlotifySystemBackup>>(fileContent, {});

  if (!parsed || typeof parsed !== 'object') {
    return {
      isValid: false,
      projectCount: 0,
      snapshotCount: 0,
      checksumMatch: false,
      warnings: [],
      errors: ['File does not contain valid JSON syntax.'],
    };
  }

  if (parsed.formatVersion !== 'plotify-backup-v1') {
    errors.push(`Unrecognized or incompatible backup format: "${parsed.formatVersion || 'unknown'}". Expected "plotify-backup-v1".`);
  }

  if (!parsed.data || typeof parsed.data !== 'object') {
    errors.push('Backup payload is missing the core "data" container.');
  }

  const projects = parsed.data?.projects;
  if (!Array.isArray(projects)) {
    errors.push('Backup payload does not contain a valid projects array.');
  }

  let projectCount = 0;
  if (Array.isArray(projects)) {
    projectCount = projects.length;
    projects.forEach((p, idx) => {
      if (!p || typeof p.id !== 'string' || typeof p.name !== 'string') {
        errors.push(`Project at index ${idx} is malformed or missing id/name.`);
      }
      if (typeof p.plotWidth !== 'number' || typeof p.plotLength !== 'number') {
        errors.push(`Project at index ${idx} (${p?.name || 'unnamed'}) has invalid plot dimensions.`);
      }
    });
  }

  let snapshotCount = 0;
  if (parsed.data?.snapshots && typeof parsed.data.snapshots === 'object') {
    for (const snapList of Object.values(parsed.data.snapshots)) {
      if (Array.isArray(snapList)) {
        snapshotCount += snapList.length;
      }
    }
  }

  // Verify Checksum
  let checksumMatch = false;
  if (parsed.checksum && parsed.data) {
    const rawDataPayload = JSON.stringify({
      projects: parsed.data.projects,
      settings: parsed.data.settings,
      snapshots: parsed.data.snapshots,
    });
    const calculated = computeStringChecksum(rawDataPayload);
    checksumMatch = calculated === parsed.checksum;
    if (!checksumMatch) {
      warnings.push('Checksum verification mismatch. File contents may have been manually modified or truncated.');
    }
  }

  // Dry Run Calculation
  const currentIds = new Set(currentProjects.map((p) => p.id));
  const newProjects: string[] = [];
  const overwritingProjects: string[] = [];

  if (Array.isArray(projects)) {
    projects.forEach((p) => {
      if (currentIds.has(p.id)) {
        overwritingProjects.push(p.name || p.id);
      } else {
        newProjects.push(p.name || p.id);
      }
    });
  }

  return {
    isValid: errors.length === 0,
    formatVersion: parsed.formatVersion,
    exportedAt: parsed.exportedAt,
    projectCount,
    snapshotCount,
    checksumMatch,
    warnings,
    errors,
    dryRunSummary: {
      newProjects,
      overwritingProjects,
      safeToProceed: errors.length === 0,
    },
  };
}

/**
 * Restores a validated system backup safely.
 * Automatically saves a pre-restore safety snapshot before touching live data.
 */
export function restoreSystemBackup(
  backup: PlotifySystemBackup,
  mode: 'replace' | 'merge' = 'replace'
): { success: boolean; message: string; restoredProjectsCount: number } {
  try {
    // 1. Capture complete pre-restore safety snapshot of the entire current system
    const currentBackup = generateSystemBackup();
    safeStorageSetItem(SYSTEM_PRE_RESTORE_SAFETY_KEY, JSON.stringify(currentBackup));

    let finalProjects: Project[] = [];

    if (mode === 'replace') {
      finalProjects = backup.data.projects;
    } else {
      // Merge: Keep existing, overwrite matching IDs, append new
      const existing = loadProjects();
      const existingMap = new Map(existing.map((p) => [p.id, p]));
      backup.data.projects.forEach((p) => {
        existingMap.set(p.id, p);
      });
      finalProjects = Array.from(existingMap.values());
    }

    // 2. Commit projects
    saveProjects(finalProjects);

    // 3. Commit settings if present
    if (backup.data.settings) {
      saveSettings(backup.data.settings);
    }

    // 4. Restore snapshots
    if (backup.data.snapshots) {
      for (const [projId, snapList] of Object.entries(backup.data.snapshots)) {
        if (Array.isArray(snapList)) {
          safeStorageSetItem(`${SNAPSHOT_PREFIX}${projId}`, JSON.stringify(snapList));
        }
      }
    }

    return {
      success: true,
      message: `Successfully restored ${backup.data.projects.length} projects and ${backup.data.metadata.totalSnapshots} snapshots. Safety rollback point established.`,
      restoredProjectsCount: finalProjects.length,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[BackupService] Restore failed:', err);
    return {
      success: false,
      message: `Restore failed: ${errorMsg}`,
      restoredProjectsCount: 0,
    };
  }
}

/**
 * Reverts the system to the state prior to the last full backup restore.
 */
export function rollbackLastSystemRestore(): { success: boolean; message: string } {
  try {
    const raw = localStorage.getItem(SYSTEM_PRE_RESTORE_SAFETY_KEY);
    if (!raw) {
      return { success: false, message: 'No pre-restore safety checkpoint found to rollback to.' };
    }

    const backup = safeJsonParse<PlotifySystemBackup | null>(raw, null);
    if (!backup || !backup.data?.projects) {
      return { success: false, message: 'Pre-restore safety checkpoint is damaged or unreadable.' };
    }

    saveProjects(backup.data.projects);
    if (backup.data.settings) saveSettings(backup.data.settings);

    if (backup.data.snapshots) {
      for (const [projId, snapList] of Object.entries(backup.data.snapshots)) {
        safeStorageSetItem(`${SNAPSHOT_PREFIX}${projId}`, JSON.stringify(snapList));
      }
    }

    return {
      success: true,
      message: `System successfully rolled back to state from ${new Date(backup.exportedAt).toLocaleString()}.`,
    };
  } catch (err: unknown) {
    return {
      success: false,
      message: `Rollback failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export interface BackendArchiveItem {
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

export interface BackendArchivePayload {
  archiveVersion: string;
  archiveName: string;
  exportedAt: string;
  items: BackendArchiveItem[];
}

/**
 * Prepares an architectural project archive payload formatted for the
 * backend POST /api/archives/ingest endpoint.
 */
export function exportSystemArchiveForBackend(archiveName = 'Plotify Export Archive'): BackendArchivePayload {
  const projects = loadProjects();
  const items: BackendArchiveItem[] = projects.slice(0, 100).map((proj) => {
    const cloudProject = normalizeProjectForCloud(proj);
    let snapItems: BackendArchiveItem['snapshots'] = [];
    try {
      const snapKey = `${SNAPSHOT_PREFIX}${proj.id}`;
      const raw = localStorage.getItem(snapKey);
      if (raw) {
        const parsed = safeJsonParse<ProjectSnapshot[]>(raw, []);
        if (Array.isArray(parsed)) {
          snapItems = parsed.map((s) => ({
            revision: s.revisionNumber,
            versionTag: s.versionTag,
            label: s.label,
            description: s.description,
            trigger: s.trigger,
            metrics: s.metrics as unknown as Record<string, unknown>,
            projectData: normalizeProjectForCloud(s.projectData),
          }));
        }
      }
    } catch {
      // Ignore snapshot load issues
    }
    return {
      project: cloudProject,
      snapshots: snapItems,
    };
  });

  return {
    archiveVersion: '1.0',
    archiveName,
    exportedAt: new Date().toISOString(),
    items,
  };
}

/**
 * Ingests current projects and snapshots to the cloud persistence backend.
 */
export async function ingestSystemArchiveToBackend(archiveName = 'Cloud Sync Batch Ingest'): Promise<{
  success: boolean;
  result?: unknown;
  error?: string;
}> {
  if (!isCloudPersistenceEnabled()) {
    return {
      success: false,
      error: 'Cloud persistence is disabled (VITE_USE_CLOUD_STORAGE != true).',
    };
  }

  try {
    const payload = exportSystemArchiveForBackend(archiveName);
    const result = await apiIngestArchive(payload);
    return { success: true, result };
  } catch (err: any) {
    console.error('[BackupService] Cloud archive ingestion failed:', err);
    return { success: false, error: err.message || 'Archive ingestion failed.' };
  }
}
