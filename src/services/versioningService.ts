/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Project } from '../types/project';
import {
  ProjectSnapshot,
  SnapshotTrigger,
  CollaboratorProfile,
  SnapshotMetrics,
  RestoreValidationResult,
  ProjectRevisionBundle,
} from '../types/versioning';
import { safeStorageSetItem } from './storageGuard';
import { safeJsonParse } from '../utils/securityUtils';
import { isCloudPersistenceEnabled } from './storage';
import {
  createSnapshot as apiCreateSnapshot,
  createSnapshotsBatch as apiCreateSnapshotsBatch,
  listSnapshots as apiListSnapshots,
} from './apiClient';
import { normalizeProjectFromCloud } from '../utils/idMapping';

const SNAPSHOTS_KEY_PREFIX = 'plotify_snapshots_v1_';
const ACTIVE_COLLABORATOR_KEY = 'plotify_active_collaborator_v1';
const MAX_AUTO_CHECKPOINTS = 15;

export const DEFAULT_COLLABORATORS: CollaboratorProfile[] = [
  {
    id: 'collab-arch-01',
    name: 'Elena Rostova, AIA',
    role: 'architect',
    roleTitle: 'Principal Lead Architect',
    initials: 'ER',
    avatarColor: 'bg-teal-700',
  },
  {
    id: 'collab-struct-02',
    name: 'Marcus Vance, PE, SE',
    role: 'structural-engineer',
    roleTitle: 'Senior Structural Engineer',
    initials: 'MV',
    avatarColor: 'bg-blue-700',
  },
  {
    id: 'collab-mep-03',
    name: 'David Chen, P.Eng, LEED AP',
    role: 'mep-engineer',
    roleTitle: 'MEP Systems Coordinator',
    initials: 'DC',
    avatarColor: 'bg-amber-700',
  },
  {
    id: 'collab-cost-04',
    name: 'Fiona Gallagher, MRICS',
    role: 'cost-planner',
    roleTitle: 'Commercial Cost Consultant',
    initials: 'FG',
    avatarColor: 'bg-emerald-700',
  },
  {
    id: 'collab-client-05',
    name: 'Julian Sterling',
    role: 'client-representative',
    roleTitle: 'Owner / Development Manager',
    initials: 'JS',
    avatarColor: 'bg-purple-700',
  },
];

export function getActiveCollaborator(): CollaboratorProfile {
  try {
    const raw = localStorage.getItem(ACTIVE_COLLABORATOR_KEY);
    if (raw) {
      const parsed = safeJsonParse<Partial<CollaboratorProfile>>(raw, {});
      if (parsed && parsed.id && parsed.name) return parsed as CollaboratorProfile;
    }
  } catch {
    // fallback
  }
  return DEFAULT_COLLABORATORS[0];
}

export function setActiveCollaborator(profile: CollaboratorProfile): void {
  try {
    safeStorageSetItem(ACTIVE_COLLABORATOR_KEY, JSON.stringify(profile));
  } catch (err) {
    console.error('[Versioning] Failed to set active collaborator:', err);
  }
}

export function calculateSnapshotMetrics(project: Project): SnapshotMetrics {
  const rooms = project.floorPlan?.rooms || [];
  const roomCount = rooms.length;
  const totalGFA = rooms.reduce((sum, r) => sum + r.width * r.length, 0);
  const plotArea = project.plotWidth * project.plotLength;
  const structuralColumnCount = project.structuralCoordination?.columns?.length || 0;
  const mepComponentCount = project.mepCoordination?.components?.length || 0;
  const mepClashCount = project.mepCoordination?.clashes?.length || 0;
  const estimatedCost = project.costPlanning?.targetBudget || project.budget;

  return {
    plotArea,
    unit: project.unit,
    roomCount,
    totalGFA: Math.round(totalGFA * 10) / 10,
    floors: project.floors,
    budget: project.budget,
    estimatedCost,
    structuralColumnCount,
    mepComponentCount,
    mepClashCount,
    status: project.status,
  };
}

export function generateSimpleChecksum(project: Project): string {
  const content = `${project.id}|${project.name}|${project.plotWidth}x${project.plotLength}|${project.unit}|${project.floors}|${project.floorPlan?.rooms?.length || 0}|${project.structuralCoordination?.columns?.length || 0}|${project.mepCoordination?.components?.length || 0}|${project.budget}|${project.updatedAt}`;
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `chk-${Math.abs(hash).toString(16)}`;
}

/**
 * Loads snapshots for a project from localStorage with safe parsing.
 * If empty and it's a sample project, seeds initial baseline revisions.
 */
export function getProjectSnapshots(project: Project): ProjectSnapshot[] {
  if (typeof localStorage === 'undefined') {
    return generateSampleInitialSnapshots(project);
  }
  const storageKey = `${SNAPSHOTS_KEY_PREFIX}${project.id}`;
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = safeJsonParse<ProjectSnapshot[]>(raw, []);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      }
    }
  } catch (err) {
    console.error(`[Versioning] Failed to load snapshots for ${project.id}:`, err);
  }

  // Pre-seed baseline snapshots if none exist
  const seeded = generateSampleInitialSnapshots(project);
  if (seeded.length > 0) {
    saveProjectSnapshots(project.id, seeded);
    return seeded;
  }

  return [];
}

export function saveProjectSnapshots(projectId: string, snapshots: ProjectSnapshot[]): void {
  const storageKey = `${SNAPSHOTS_KEY_PREFIX}${projectId}`;
  try {
    safeStorageSetItem(storageKey, JSON.stringify(snapshots));
  } catch (err) {
    console.error(`[Versioning] Failed to save snapshots for ${projectId}:`, err);
  }
}

/**
 * Creates a new project snapshot.
 */
export function createProjectSnapshot(
  project: Project,
  params: {
    trigger: SnapshotTrigger;
    label: string;
    description?: string;
    versionTag?: string;
    author?: CollaboratorProfile;
  }
): ProjectSnapshot {
  const snapshots = getProjectSnapshots(project);
  const nextRevNumber = snapshots.length > 0 ? Math.max(...snapshots.map(s => s.revisionNumber)) + 1 : 1;
  const author = params.author || getActiveCollaborator();
  const timestamp = new Date().toISOString();
  const metrics = calculateSnapshotMetrics(project);
  const checksum = generateSimpleChecksum(project);

  const defaultTag = params.versionTag || `v${Math.floor(nextRevNumber / 2)}.${nextRevNumber % 2 === 0 ? '0' : '5'}`;

  const newSnapshot: ProjectSnapshot = {
    id: `snap-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    projectId: project.id,
    revisionNumber: nextRevNumber,
    versionTag: defaultTag,
    label: params.label,
    description: params.description || '',
    trigger: params.trigger,
    timestamp,
    author,
    metrics,
    projectData: JSON.parse(JSON.stringify(project)),
    checksum,
  };

  // Pruning logic: Keep all manual, pre-restore, and import snapshots; cap auto-checkpoints
  let updated = [newSnapshot, ...snapshots];
  const autoCheckpoints = updated.filter(s => s.trigger === 'auto-checkpoint');
  if (autoCheckpoints.length > MAX_AUTO_CHECKPOINTS) {
    const toRemove = autoCheckpoints.slice(MAX_AUTO_CHECKPOINTS);
    const removeIds = new Set(toRemove.map(s => s.id));
    updated = updated.filter(s => !removeIds.has(s.id));
  }

  saveProjectSnapshots(project.id, updated);
  return newSnapshot;
}

/**
 * Asynchronously creates a project snapshot, dispatching to cloud persistence
 * when enabled, or local storage otherwise. Never writes to localStorage in cloud mode.
 */
export async function createProjectSnapshotAsync(
  project: Project,
  params: {
    trigger: SnapshotTrigger;
    label: string;
    description?: string;
    versionTag?: string;
    author?: CollaboratorProfile;
  }
): Promise<ProjectSnapshot> {
  if (!isCloudPersistenceEnabled()) {
    return createProjectSnapshot(project, params);
  }

  const author = params.author || getActiveCollaborator();
  const metrics = calculateSnapshotMetrics(project);
  const defaultTag = params.versionTag || 'v1.0';

  const cloudRecord: any = await apiCreateSnapshot(project.id, {
    label: params.label,
    versionTag: defaultTag,
    description: params.description || '',
    trigger: params.trigger,
    metrics: metrics as unknown as Record<string, unknown>,
    projectData: project,
  });

  const restoredProjectData =
    cloudRecord && cloudRecord.project_data
      ? normalizeProjectFromCloud(cloudRecord.project_data)
      : JSON.parse(JSON.stringify(project));

  return {
    id: cloudRecord?.id || `snap-${Date.now()}`,
    projectId: project.id,
    revisionNumber:
      typeof cloudRecord?.revision === 'number' ? cloudRecord.revision : 1,
    versionTag: cloudRecord?.version_tag || defaultTag,
    label: cloudRecord?.label || params.label,
    description:
      cloudRecord?.description !== undefined && cloudRecord?.description !== null
        ? cloudRecord.description
        : params.description || '',
    trigger: (cloudRecord?.trigger as SnapshotTrigger) || params.trigger,
    timestamp: cloudRecord?.created_at
      ? new Date(cloudRecord.created_at).toISOString()
      : new Date().toISOString(),
    author,
    metrics:
      cloudRecord?.metrics && Object.keys(cloudRecord.metrics).length > 0
        ? (cloudRecord.metrics as SnapshotMetrics)
        : metrics,
    projectData: restoredProjectData,
    checksum: cloudRecord?.checksum || generateSimpleChecksum(project),
  };
}

/**
 * Asynchronously lists project snapshots, fetching from cloud when enabled,
 * or returning local snapshots otherwise. Does not silently fall back to localStorage
 * when cloud mode is active.
 */
export async function listProjectSnapshotsAsync(project: Project): Promise<ProjectSnapshot[]> {
  if (isCloudPersistenceEnabled()) {
    const cloudSnapshots = await apiListSnapshots(project.id);
    if (!Array.isArray(cloudSnapshots)) {
      return [];
    }
    return cloudSnapshots.map((cs: any) => {
      const normalizedData = cs.project_data
        ? normalizeProjectFromCloud(cs.project_data)
        : project;
      return {
        id: cs.id,
        projectId: project.id,
        revisionNumber: cs.revision,
        versionTag: cs.version_tag,
        label: cs.label,
        description: cs.description || '',
        trigger: cs.trigger,
        timestamp: cs.created_at
          ? new Date(cs.created_at).toISOString()
          : new Date().toISOString(),
        author: cs.author_id
          ? {
              id: cs.author_id,
              name: 'Cloud Collaborator',
              role: 'architect',
              roleTitle: 'Collaborator',
              initials: 'CC',
              avatarColor: 'bg-teal-700',
            }
          : getActiveCollaborator(),
        metrics:
          cs.metrics && Object.keys(cs.metrics).length > 0
            ? cs.metrics
            : calculateSnapshotMetrics(normalizedData),
        projectData: normalizedData,
        checksum: cs.checksum || generateSimpleChecksum(normalizedData),
      };
    });
  }

  return getProjectSnapshots(project);
}

/**
 * Deletes a snapshot by id in local-first mode.
 */
export function deleteProjectSnapshot(projectId: string, snapshotId: string): boolean {
  const storageKey = `${SNAPSHOTS_KEY_PREFIX}${projectId}`;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return false;
    const snapshots: ProjectSnapshot[] = JSON.parse(raw);
    const filtered = snapshots.filter(s => s.id !== snapshotId);
    if (filtered.length === snapshots.length) return false;
    localStorage.setItem(storageKey, JSON.stringify(filtered));
    return true;
  } catch (err) {
    console.error('Failed to delete snapshot:', err);
    return false;
  }
}

/**
 * Asynchronously deletes a snapshot in local-first mode, or rejects in cloud mode
 * because PostgreSQL revision snapshots are immutable audit records with no DELETE contract.
 */
export async function deleteProjectSnapshotAsync(
  projectId: string,
  snapshotId: string
): Promise<boolean> {
  if (isCloudPersistenceEnabled()) {
    throw new Error(
      'Snapshot deletion is not supported in cloud persistence mode: cloud revisions are immutable audit records.'
    );
  }
  return deleteProjectSnapshot(projectId, snapshotId);
}

/**
 * Validates a snapshot prior to restoration.
 */
export function validateRestoreSnapshot(snapshot: ProjectSnapshot): RestoreValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const repairedFields: string[] = [];

  if (!snapshot || !snapshot.projectData) {
    return {
      isValid: false,
      errors: ['Corrupted snapshot file: No project data payload present.'],
      warnings: [],
      repairedFields: [],
    };
  }

  const p = snapshot.projectData;

  if (typeof p.id !== 'string' || !p.id) {
    errors.push('Missing or invalid project identifier.');
  }
  if (typeof p.name !== 'string' || !p.name.trim()) {
    errors.push('Missing or invalid project name.');
  }
  if (typeof p.plotWidth !== 'number' || p.plotWidth <= 0) {
    errors.push('Invalid plot width geometry (must be positive number).');
  }
  if (typeof p.plotLength !== 'number' || p.plotLength <= 0) {
    errors.push('Invalid plot length geometry (must be positive number).');
  }
  if (p.unit !== 'feet' && p.unit !== 'metres') {
    errors.push('Unsupported measurement unit.');
  }

  // Check rooms structure
  if (!p.floorPlan || !Array.isArray(p.floorPlan.rooms)) {
    warnings.push('Floor plan room list is missing or invalid; initializing empty room plan.');
    repairedFields.push('floorPlan.rooms');
  } else {
    for (const r of p.floorPlan.rooms) {
      if (!r.id || typeof r.width !== 'number' || typeof r.length !== 'number') {
        warnings.push(`Room "${r.name || 'Unknown'}" had missing geometric dimensions.`);
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    repairedFields,
  };
}

/**
 * Prepares restore by creating an automatic pre-restore safety snapshot of the CURRENT working project.
 * Returns both the safety snapshot and the validated restored project payload.
 */
export function executeSafeRestore(
  currentProject: Project,
  snapshotToRestore: ProjectSnapshot,
  author?: CollaboratorProfile
): {
  success: boolean;
  safetySnapshot?: ProjectSnapshot;
  restoredProject?: Project;
  validation: RestoreValidationResult;
} {
  const validation = validateRestoreSnapshot(snapshotToRestore);
  if (!validation.isValid) {
    return { success: false, validation };
  }

  // 1. Create automatic pre-restore safety snapshot of the CURRENT state
  const safetySnapshot = createProjectSnapshot(currentProject, {
    trigger: 'pre-restore-safety',
    label: `Pre-Restore Safety Backup (Prior to ${snapshotToRestore.versionTag})`,
    description: `Automated safety checkpoint created immediately before rolling back to Revision #${snapshotToRestore.revisionNumber} (${snapshotToRestore.label}).`,
    author: author || getActiveCollaborator(),
    versionTag: `pre-restore-safe-${Date.now().toString(36).substr(-4)}`,
  });

  // 2. Clone snapshot data and refresh updatedAt timestamp
  const restored: Project = JSON.parse(JSON.stringify(snapshotToRestore.projectData));
  restored.id = currentProject.id;
  restored.updatedAt = new Date().toISOString();

  return {
    success: true,
    safetySnapshot,
    restoredProject: restored,
    validation,
  };
}

/**
 * Asynchronously prepares a safe restore by recording the pre-restore safety snapshot
 * via the active persistence mode (cloud API when cloud mode is enabled, localStorage otherwise).
 */
export async function executeSafeRestoreAsync(
  currentProject: Project,
  snapshotToRestore: ProjectSnapshot,
  author?: CollaboratorProfile
): Promise<{
  success: boolean;
  safetySnapshot?: ProjectSnapshot;
  restoredProject?: Project;
  validation: RestoreValidationResult;
}> {
  const validation = validateRestoreSnapshot(snapshotToRestore);
  if (!validation.isValid) {
    return { success: false, validation };
  }

  const safetySnapshot = await createProjectSnapshotAsync(currentProject, {
    trigger: 'pre-restore-safety',
    label: `Pre-Restore Safety Backup (Prior to ${snapshotToRestore.versionTag})`,
    description: `Automated safety checkpoint created immediately before rolling back to Revision #${snapshotToRestore.revisionNumber} (${snapshotToRestore.label}).`,
    author: author || getActiveCollaborator(),
    versionTag: `pre-restore-safe-${Date.now().toString(36).substr(-4)}`,
  });

  const restored: Project = JSON.parse(JSON.stringify(snapshotToRestore.projectData));
  restored.id = currentProject.id;
  restored.updatedAt = new Date().toISOString();

  return {
    success: true,
    safetySnapshot,
    restoredProject: restored,
    validation,
  };
}

/**
 * Generates initial rich historical snapshots for sample projects so users immediately see
 * chronological revisions, diffs, and milestones.
 */
function generateSampleInitialSnapshots(project: Project): ProjectSnapshot[] {
  const authorArch = DEFAULT_COLLABORATORS[0];
  const authorStruct = DEFAULT_COLLABORATORS[1];
  const authorMEP = DEFAULT_COLLABORATORS[2];

  const baseTime = new Date(project.createdAt || Date.now() - 14 * 86400000);
  const t1 = new Date(baseTime.getTime() + 1000 * 3600 * 24).toISOString();
  const t2 = new Date(baseTime.getTime() + 1000 * 3600 * 72).toISOString();
  const t3 = new Date(baseTime.getTime() + 1000 * 3600 * 120).toISOString();

  // Baseline Concept (earlier state with fewer rooms)
  const baselineProj: Project = JSON.parse(JSON.stringify(project));
  if (baselineProj.floorPlan && baselineProj.floorPlan.rooms.length > 2) {
    baselineProj.floorPlan.rooms = baselineProj.floorPlan.rooms.slice(0, 3);
  }
  baselineProj.status = 'Drafting';
  baselineProj.updatedAt = t1;

  const snap1: ProjectSnapshot = {
    id: `snap-seed-01-${project.id}`,
    projectId: project.id,
    revisionNumber: 1,
    versionTag: 'v0.1-Brief',
    label: 'Initial Zoning & Conceptual Massing',
    description: 'Initial site envelope definition with basic space program allocation and setback boundaries.',
    trigger: 'manual',
    timestamp: t1,
    author: authorArch,
    metrics: calculateSnapshotMetrics(baselineProj),
    projectData: baselineProj,
    checksum: generateSimpleChecksum(baselineProj),
  };

  // Schematic Structural Coordination
  const structProj: Project = JSON.parse(JSON.stringify(project));
  if (structProj.floorPlan && structProj.floorPlan.rooms.length > 4) {
    structProj.floorPlan.rooms = structProj.floorPlan.rooms.slice(0, 5);
  }
  structProj.status = 'Concept Feasibility';
  structProj.updatedAt = t2;

  const snap2: ProjectSnapshot = {
    id: `snap-seed-02-${project.id}`,
    projectId: project.id,
    revisionNumber: 2,
    versionTag: 'v0.5-Structural',
    label: 'Structural Framing & Grid Alignment',
    description: 'Structural grid established with column placements and preliminary gravity load check.',
    trigger: 'manual',
    timestamp: t2,
    author: authorStruct,
    metrics: calculateSnapshotMetrics(structProj),
    projectData: structProj,
    checksum: generateSimpleChecksum(structProj),
  };

  // Milestone: Complete Schematic Design
  const snap3: ProjectSnapshot = {
    id: `snap-seed-03-${project.id}`,
    projectId: project.id,
    revisionNumber: 3,
    versionTag: 'v1.0-Schematic',
    label: 'Schematic Design & MEP Coordination Baseline',
    description: 'Detailed room layouts, facade options, and initial MEP clash detection pass completed.',
    trigger: 'manual',
    timestamp: t3,
    author: authorMEP,
    metrics: calculateSnapshotMetrics(project),
    projectData: JSON.parse(JSON.stringify(project)),
    checksum: generateSimpleChecksum(project),
  };

  return [snap3, snap2, snap1];
}

/**
 * Bundles all revisions of a project into an exportable JSON object for asynchronous team exchange.
 */
export function exportProjectRevisionBundle(
  project: Project,
  author?: CollaboratorProfile,
  existingSnapshots?: ProjectSnapshot[]
): ProjectRevisionBundle {
  const snapshots = existingSnapshots ?? getProjectSnapshots(project);
  return {
    plotifyBundleVersion: '1.0',
    projectId: project.id,
    projectName: project.name,
    exportedAt: new Date().toISOString(),
    exportedBy: author || getActiveCollaborator(),
    snapshots,
    activeProject: project,
  };
}

/**
 * Asynchronously exports a project revision bundle using the active persistence provider.
 */
export async function exportProjectRevisionBundleAsync(
  project: Project,
  author?: CollaboratorProfile
): Promise<ProjectRevisionBundle> {
  const snapshots = await listProjectSnapshotsAsync(project);
  return exportProjectRevisionBundle(project, author, snapshots);
}

/**
 * Imports a revision bundle from JSON string.
 */
export function importProjectRevisionBundle(rawJson: string): {
  success: boolean;
  bundle?: ProjectRevisionBundle;
  error?: string;
} {
  try {
    const bundle: ProjectRevisionBundle = JSON.parse(rawJson);
    if (!bundle || bundle.plotifyBundleVersion !== '1.0' || !bundle.activeProject || !Array.isArray(bundle.snapshots)) {
      return { success: false, error: 'Invalid Plotify revision bundle file format.' };
    }
    return { success: true, bundle };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown JSON parse error';
    return { success: false, error: `Failed to parse bundle: ${msg}` };
  }
}

/**
 * Asynchronously imports and persists a project revision bundle via the active persistence provider.
 * Pre-validates every snapshot in the bundle before applying mutations.
 * In cloud mode, snapshots are persisted atomically in a single transaction via
 * POST /api/projects/:id/snapshots/batch without writing to localStorage.
 */
export async function importProjectRevisionBundleAsync(
  project: Project,
  rawJson: string
): Promise<{
  importedCount: number;
  snapshots: ProjectSnapshot[];
}> {
  const parsed = importProjectRevisionBundle(rawJson);
  if (!parsed.success || !parsed.bundle) {
    throw new Error(parsed.error || 'Failed to import revision bundle.');
  }

  const bundleSnapshots = parsed.bundle.snapshots;
  const seenBundleIds = new Set<string>();

  for (let i = 0; i < bundleSnapshots.length; i++) {
    const snap = bundleSnapshots[i];
    if (!snap || typeof snap !== 'object') {
      throw new Error(`Invalid snapshot at index #${i + 1} in revision bundle.`);
    }
    if (!snap.label || typeof snap.label !== 'string' || snap.label.trim().length === 0) {
      throw new Error(`Snapshot at index #${i + 1} in revision bundle is missing a valid label.`);
    }
    const validation = validateRestoreSnapshot(snap);
    if (!validation.isValid) {
      throw new Error(
        `Invalid snapshot at index #${i + 1} in revision bundle: ${validation.errors.join(' ')}`
      );
    }
    if (snap.id && typeof snap.id === 'string' && snap.id.trim().length > 0) {
      const cleanId = snap.id.trim();
      if (seenBundleIds.has(cleanId)) {
        throw new Error(`Duplicate snapshot ID "${cleanId}" in revision bundle at index #${i + 1}.`);
      }
      seenBundleIds.add(cleanId);
    }
  }

  if (!isCloudPersistenceEnabled()) {
    const existing = getProjectSnapshots(project);
    const existingIds = new Set(existing.map((s) => s.id));
    const newSnapshots = bundleSnapshots.filter((s) => !existingIds.has(s.id));

    const merged = [...newSnapshots, ...existing].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    saveProjectSnapshots(project.id, merged);
    return { importedCount: newSnapshots.length, snapshots: merged };
  }

  if (bundleSnapshots.length === 0) {
    const existingCloud = await listProjectSnapshotsAsync(project);
    return { importedCount: 0, snapshots: existingCloud };
  }

  // Cloud persistence mode: send entire validated bundle to atomic batch endpoint
  const orderedBundle = bundleSnapshots
    .slice()
    .sort((a, b) => (a.revisionNumber || 0) - (b.revisionNumber || 0));

  const batchPayload = orderedBundle.map((snap, idx) => {
    const snapshotProjectState: Project = {
      ...(snap.projectData || project),
      id: project.id,
    };
    const metrics =
      snap.metrics && Object.keys(snap.metrics).length > 0
        ? (snap.metrics as unknown as Record<string, unknown>)
        : (calculateSnapshotMetrics(snapshotProjectState) as unknown as Record<string, unknown>);

    return {
      clientSnapshotId: snap.id,
      revisionNumber: typeof snap.revisionNumber === 'number' ? snap.revisionNumber : idx + 1,
      versionTag: snap.versionTag || 'v1.0-import',
      label: snap.label || `Imported Revision #${snap.revisionNumber || idx + 1}`,
      description: snap.description || '',
      trigger: snap.trigger || 'import',
      metrics,
      projectData: snapshotProjectState,
    };
  });

  const batchResult = await apiCreateSnapshotsBatch(project.id, batchPayload);
  const mappedSnapshots: ProjectSnapshot[] = Array.isArray(batchResult.snapshots)
    ? batchResult.snapshots.map((cs: any) => {
        const normalizedData = cs.project_data
          ? normalizeProjectFromCloud(cs.project_data)
          : project;
        return {
          id: cs.id,
          projectId: project.id,
          revisionNumber: cs.revision,
          versionTag: cs.version_tag,
          label: cs.label,
          description: cs.description || '',
          trigger: cs.trigger,
          timestamp: cs.created_at
            ? new Date(cs.created_at).toISOString()
            : new Date().toISOString(),
          author: cs.author_id
            ? {
                id: cs.author_id,
                name: 'Cloud Collaborator',
                role: 'architect',
                roleTitle: 'Collaborator',
                initials: 'CC',
                avatarColor: 'bg-teal-700',
              }
            : getActiveCollaborator(),
          metrics:
            cs.metrics && Object.keys(cs.metrics).length > 0
              ? cs.metrics
              : calculateSnapshotMetrics(normalizedData),
          projectData: normalizedData,
          checksum: cs.checksum || generateSimpleChecksum(normalizedData),
        };
      })
    : [];

  return {
    importedCount: batchResult.importedCount,
    snapshots: mappedSnapshots,
  };
}

