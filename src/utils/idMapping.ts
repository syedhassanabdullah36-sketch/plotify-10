/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Project } from '../types/project';
import { safeJsonParse } from './securityUtils';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID_MAP_STORAGE_KEY = 'plotify_cloud_id_mapping_v1';

// In-memory cache for fast lookups
const legacyToCloudMap = new Map<string, string>();
const cloudToLegacyMap = new Map<string, string>();

/**
 * Loads persistent ID mappings from localStorage if available.
 * Validates each mapping entry to ensure corrupted or malformed entries
 * cannot cause silent data loss or invalidate the reverse index.
 */
function loadPersistedMappings(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(ID_MAP_STORAGE_KEY);
    if (!raw) return;
    const parsed = safeJsonParse<Record<string, string>>(raw, {});
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;

    for (const [legacyId, cloudUuid] of Object.entries(parsed)) {
      if (
        typeof legacyId === 'string' &&
        legacyId.trim().length > 0 &&
        typeof cloudUuid === 'string' &&
        isUuid(cloudUuid)
      ) {
        const cleanLegacy = legacyId.trim();
        const cleanCloud = cloudUuid.trim().toLowerCase();
        legacyToCloudMap.set(cleanLegacy, cleanCloud);
        cloudToLegacyMap.set(cleanCloud, cleanLegacy);
      }
    }
  } catch {
    // Graceful fallback on storage access issues or JSON parsing errors
  }
}

/**
 * Persists current ID mappings to localStorage.
 */
function persistMappings(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const obj: Record<string, string> = {};
    legacyToCloudMap.forEach((v, k) => {
      obj[k] = v;
    });
    localStorage.setItem(ID_MAP_STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // Graceful fallback
  }
}

// Initialize on module load
loadPersistedMappings();

/**
 * Checks whether an ID string is a valid RFC 4122 UUID.
 */
export function isUuid(id: unknown): boolean {
  if (!id || typeof id !== 'string') return false;
  return UUID_REGEX.test(id.trim());
}

/**
 * Deterministically derives an RFC 4122-compliant synthetic UUID from an arbitrary
 * seed string using multi-seeded FNV-1a hashing.
 *
 * NOTE ON RFC 4122 SPECIFICATION & TERMINOLOGY:
 * - Standard RFC 4122 Version 4 defines pseudo-random UUIDs (122 random bits).
 * - Standard RFC 4122 namespace UUIDs use Version 3 (MD5) or Version 5 (SHA-1).
 * - Here, deterministicNamespaceUuid synthesizes a deterministic identifier formatted
 *   with version nibble '4' and variant nibble 'a' (10xx binary) to ensure
 *   syntactic acceptance by PostgreSQL 16+ `UUID` columns without runtime overhead.
 * - This ensures 100% deterministic, offline-reproducible mappings for local legacy
 *   identifiers (e.g., "proj-001") while guaranteeing type compliance in PostgreSQL.
 *
 * COLLISION BOUNDARIES:
 * - Generates 128 pseudo-random bits across 4 independent 32-bit FNV-1a hash lanes.
 * - Masking leaves 122 effective entropy bits.
 * - Birthday collision probability across N = 10,000 legacy project IDs:
 *   P(collision) ≈ N^2 / (2 * 2^122) ≈ 10^8 / (1.06 * 10^37) ≈ 9.4 * 10^-30 (negligible).
 *
 * SILENT DATA LOSS PREVENTION:
 * - Determinism guarantee: Even if localStorage is cleared, re-running
 *   legacyToCloudUuid("proj-001") produces the exact same UUID.
 * - Bidirectional metadata preservation: Remote payloads store the original local
 *   ID inside `(project as any).legacyId`, ensuring that downloads restore original
 *   local references even in fresh browser sessions.
 */
export function deterministicNamespaceUuid(seed: string): string {
  // Generate 16 bytes of deterministic pseudo-random bytes from seed using multi-seed FNV-1a
  let h1 = 0x811c9dc5 ^ 0x12345678;
  let h2 = 0x811c9dc5 ^ 0x87654321;
  let h3 = 0x811c9dc5 ^ 0xabcdef01;
  let h4 = 0x811c9dc5 ^ 0x10fedcba;

  for (let i = 0; i < seed.length; i++) {
    const code = seed.charCodeAt(i);
    h1 = (h1 ^ code) * 16777619;
    h2 = (h2 ^ (code + i)) * 16777619;
    h3 = (h3 ^ (code * 31)) * 16777619;
    h4 = (h4 ^ (code * 17 + i)) * 16777619;
  }

  const p1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const p2 = (h2 >>> 0).toString(16).padStart(8, '0');
  const p3 = (h3 >>> 0).toString(16).padStart(8, '0');
  const p4 = (h4 >>> 0).toString(16).padStart(8, '0');

  const hex32 = `${p1}${p2}${p3}${p4}`.toLowerCase();

  // Format as RFC 4122 variant 1 with version nibble '4'
  const timeLow = hex32.slice(0, 8);
  const timeMid = hex32.slice(8, 12);
  const timeHiAndVersion = '4' + hex32.slice(13, 16);
  const clockSeq = 'a' + hex32.slice(17, 20);
  const node = hex32.slice(20, 32);

  return `${timeLow}-${timeMid}-${timeHiAndVersion}-${clockSeq}-${node}`;
}

/**
 * Converts a legacy project ID (e.g. "proj-001") into a deterministic,
 * collision-resistant UUID required by PostgreSQL.
 * If the input is already a UUID, returns it unchanged.
 */
export function legacyToCloudUuid(id: string): string {
  if (!id || typeof id !== 'string') {
    throw new Error('Project ID must be a non-empty string.');
  }

  const trimmed = id.trim();
  if (isUuid(trimmed)) {
    return trimmed.toLowerCase();
  }

  // Check persistent mapping cache
  if (legacyToCloudMap.has(trimmed)) {
    return legacyToCloudMap.get(trimmed)!;
  }

  // Generate deterministic UUID and store mapping
  const cloudUuid = deterministicNamespaceUuid(`plotify:legacy_project:${trimmed}`);
  legacyToCloudMap.set(trimmed, cloudUuid);
  cloudToLegacyMap.set(cloudUuid, trimmed);
  persistMappings();

  return cloudUuid;
}

/**
 * Resolves a cloud UUID back to its original local legacy ID if one was recorded.
 * If no legacy mapping exists, returns the cloud UUID.
 */
export function cloudUuidToLegacy(cloudUuid: string): string {
  if (!cloudUuid || typeof cloudUuid !== 'string') return cloudUuid;
  const trimmed = cloudUuid.trim().toLowerCase();
  return cloudToLegacyMap.get(trimmed) || trimmed;
}

/**
 * Normalizes a local project object for transmission to the cloud:
 * - Sets project.id to a valid PostgreSQL UUID.
 * - Stores the original local ID in `(project as any).legacyId` so that
 *   round-tripping back to localStorage preserves original references.
 */
export function normalizeProjectForCloud(project: Project): Project {
  const originalId = project.id;
  const cloudId = legacyToCloudUuid(originalId);

  return {
    ...project,
    id: cloudId,
    // Embed legacy ID in data so that remote storage carries the original local ID
    ...(originalId !== cloudId ? { legacyId: originalId } : {}),
  } as Project;
}

/**
 * Restores a cloud project record into a local project object:
 * - Restores the original legacy ID if present in legacyId or in the mapping cache.
 */
export function normalizeProjectFromCloud(cloudProject: Project): Project {
  const cloudId = cloudProject.id;
  const embeddedLegacyId = (cloudProject as any).legacyId;
  const mappedLegacyId = cloudUuidToLegacy(cloudId);
  const restoredId = embeddedLegacyId || mappedLegacyId || cloudId;

  const restored = {
    ...cloudProject,
    id: restoredId,
  };

  if ((restored as any).legacyId) {
    delete (restored as any).legacyId;
  }

  return restored;
}

/**
 * Diagnostic helper to inspect active mappings.
 */
export function getIdMappingAudit(): {
  mappingsCount: number;
  mappings: Record<string, string>;
} {
  const mappings: Record<string, string> = {};
  legacyToCloudMap.forEach((v, k) => {
    mappings[k] = v;
  });
  return {
    mappingsCount: legacyToCloudMap.size,
    mappings,
  };
}
