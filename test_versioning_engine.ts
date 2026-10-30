/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Project } from './src/types/project';
import {
  createProjectSnapshot,
  getProjectSnapshots,
  saveProjectSnapshots,
  deleteProjectSnapshot,
  validateRestoreSnapshot,
  executeSafeRestore,
  exportProjectRevisionBundle,
  importProjectRevisionBundle,
  calculateSnapshotMetrics,
  DEFAULT_COLLABORATORS,
} from './src/services/versioningService';
import { computeProjectDiff } from './src/services/versionDiffEngine';
import { ProjectSnapshot } from './src/types/versioning';

// Setup mock localStorage in Node.js test environment if not present
if (typeof globalThis.localStorage === 'undefined') {
  const store: Record<string, string> = {};
  globalThis.localStorage = {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, val: string) => {
      store[key] = val;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
    key: (i: number) => Object.keys(store)[i] || null,
    length: Object.keys(store).length,
  };
}

console.log('================================================================');
console.log('PLOTIFY PROMPT 18: PROJECT VERSIONS & COLLABORATION ENGINE TEST');
console.log('================================================================\n');

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    console.log(`✓ PASS: ${testName}`);
    testsPassed++;
  } else {
    console.error(`✗ FAIL: ${testName} ${details ? `(${details})` : ''}`);
    testsFailed++;
  }
}

// 1. Initial Project Model Setup
const baseProject: Project = {
  id: 'proj-ver-test-01',
  name: 'Verdant Horizon Pavilion',
  projectType: 'house',
  plotWidth: 60,
  plotLength: 100,
  unit: 'feet',
  roadFacing: 'North',
  floors: 2,
  rooms: {
    livingRoom: 1,
    bedrooms: 3,
    bathrooms: 2,
    kitchen: 1,
    diningRoom: 1,
    balcony: 1,
    garage: 2,
    customRooms: [],
  },
  budget: 750000,
  currency: 'USD',
  notes: 'Testing Versioning & Collaboration Engine with multi-trade diffing',
  status: 'Schematic Design',
  createdAt: '2026-10-24T08:00:00.000Z',
  updatedAt: '2026-10-24T08:00:00.000Z',
  floorPlan: {
    rooms: [
      { id: 'r1', name: 'Living Room', type: 'living', x: 5, y: 10, width: 20, length: 24, floorLevel: 1 },
      { id: 'r2', name: 'Open Kitchen', type: 'kitchen', x: 28, y: 10, width: 15, length: 18, floorLevel: 1 },
      { id: 'r3', name: 'Guest Bath', type: 'bathroom', x: 45, y: 10, width: 8, length: 10, floorLevel: 1 },
      { id: 'r4', name: 'Master Suite', type: 'bedroom', x: 10, y: 10, width: 22, length: 20, floorLevel: 2 },
    ],
  },
  structuralCoordination: {
    version: '1.0',
    framingSystem: 'reinforced-concrete-frame',
    grid: {
      id: 'grid-1',
      xAxes: [],
      yAxes: [],
      baySpacingX: 15,
      baySpacingY: 15,
      offsetX: 0,
      offsetY: 0,
      showGridLines: true,
      showBubbles: true,
    },
    columns: [
      { id: 'col-1', label: 'C1', x: 5, y: 10, width: 1.5, depth: 1.5, profile: 'rectangular', material: 'reinforced-concrete', floorLevels: [1], isLoadBearing: true, status: 'active' },
      { id: 'col-2', label: 'C2', x: 25, y: 10, width: 1.5, depth: 1.5, profile: 'rectangular', material: 'reinforced-concrete', floorLevels: [1], isLoadBearing: true, status: 'active' },
    ],
    beams: [],
    reviewIssues: [],
    maxUnsupportedSpanThreshold: 20,
    lastEvaluatedGeometryHash: 'hash-01',
    lastEvaluatedAt: '2026-10-24T08:00:00.000Z',
    isStale: false,
    notes: 'Preliminary concrete frame',
  },
  mepCoordination: {
    version: '1.0',
    assumptions: {
      minimumHeadHeightClearance: 7.0,
      electricalPanelWorkingClearance: 3.0,
      defaultDuctClearance: 0.3,
      defaultPipeClearance: 0.2,
    },
    components: [
      { id: 'mep-1', name: 'Supply Duct 100', system: 'mechanical', subtype: 'supply-air-duct', floorLevel: 1, clearanceRequirement: 0.5, source: 'architectural-baseline', status: 'active' },
    ],
    clashes: [
      {
        id: 'clash-1',
        clashCode: 'CLASH-001',
        category: 'mep-to-structure',
        title: 'Duct penetrates Column C1',
        description: 'Supply duct penetrates column centroid',
        severity: 'hard-clash',
        primaryComponentId: 'mep-1',
        primaryComponentName: 'Supply Duct 100',
        primarySystem: 'mechanical',
        intersectingElementId: 'col-1',
        intersectingElementName: 'C1',
        intersectingElementType: 'column',
        location: { floorLevel: 1, x: 5, y: 10, z: 8 },
        measuredOverlap: '0.8 ft',
        clearanceThreshold: '0.5 ft',
        evidenceFormula: 'Overlap > 0',
        recommendation: 'Re-route duct',
        status: 'open',
      },
    ],
    lastEvaluatedGeometryHash: 'geom-01',
    lastEvaluatedAt: '2026-10-24T08:00:00.000Z',
    isStale: false,
    notes: 'Preliminary MEP routing',
  },
};

// Clear localStorage for this test
localStorage.clear();

// TEST 1: Snapshot Metrics Calculation
console.log('--- TEST GROUP 1: Snapshot Metrics & Baseline Capture ---');
const metrics = calculateSnapshotMetrics(baseProject);
assert(metrics.plotArea === 6000, 'Calculates correct plot area (60x100 = 6000 sq ft)');
assert(metrics.roomCount === 4, 'Counts placed rooms correctly (4 rooms)');
assert(metrics.totalGFA === 20 * 24 + 15 * 18 + 8 * 10 + 22 * 20, 'Computes total net measured room area (1270 sq ft)');
assert(metrics.structuralColumnCount === 2, 'Counts structural columns (2 columns)');
assert(metrics.mepComponentCount === 1, 'Counts MEP components (1 component)');
assert(metrics.mepClashCount === 1, 'Counts MEP clash records (1 clash)');

// TEST 2: Milestone Snapshot Creation
console.log('\n--- TEST GROUP 2: Milestone Snapshot Creation ---');
const snap1 = createProjectSnapshot(baseProject, {
  trigger: 'manual',
  label: 'Initial Concept & MEP Baseline',
  description: 'First schematic pass with preliminary structural grid and MEP duct layout.',
  versionTag: 'v1.0-Concept',
  author: DEFAULT_COLLABORATORS[0], // Elena Rostova
});

assert(snap1.revisionNumber >= 1, `Assigned sequential revision number (${snap1.revisionNumber})`);
assert(snap1.versionTag === 'v1.0-Concept', `Preserved custom version tag (${snap1.versionTag})`);
assert(snap1.author.name === 'Elena Rostova, AIA', `Recorded correct author attribution (${snap1.author.name})`);
assert(snap1.projectData.floorPlan?.rooms.length === 4, 'Encapsulated full project geometry');

const loadedSnaps = getProjectSnapshots(baseProject);
assert(loadedSnaps.length >= 1, `Successfully persisted and reloaded snapshot list (${loadedSnaps.length} found)`);

// TEST 3: Deep Diff Engine (Modifications, Additions, Deletions)
console.log('\n--- TEST GROUP 3: Deep Project Diff Engine ---');
const modifiedProject: Project = JSON.parse(JSON.stringify(baseProject));
modifiedProject.updatedAt = '2026-10-24T12:00:00.000Z';

// Modify plot width
modifiedProject.plotWidth = 65; // +5 ft
// Modify room 1 dimensions
modifiedProject.floorPlan!.rooms[0].width = 22; // was 20 (+48 sq ft)
// Remove room 3 (Guest Bath)
modifiedProject.floorPlan!.rooms = modifiedProject.floorPlan!.rooms.filter(r => r.id !== 'r3');
// Add new room (Home Office)
modifiedProject.floorPlan!.rooms.push({
  id: 'r5',
  name: 'Executive Office',
  type: 'office',
  x: 30,
  y: 35,
  width: 14,
  length: 16,
  floorLevel: 1,
});
// Add column
modifiedProject.structuralCoordination!.columns!.push({
  id: 'col-3',
  label: 'C3',
  x: 45,
  y: 10,
  width: 1.5,
  depth: 1.5,
  profile: 'rectangular',
  material: 'reinforced-concrete',
  floorLevels: [1],
  isLoadBearing: true,
  status: 'active',
});
// Resolve MEP Clash
modifiedProject.mepCoordination!.clashes = []; // 0 clashes
// Increase budget
modifiedProject.budget = 820000;

const diffReport = computeProjectDiff(baseProject, modifiedProject, {
  sourceLabel: 'Revision #1 (v1.0-Concept)',
  targetLabel: 'Modified Design State',
});

assert(diffReport.totalChanges > 0, `Detected changes across project trades (total: ${diffReport.totalChanges})`);
assert(diffReport.categories.boundaries.modifiedCount >= 1, 'Detected boundary change (plotWidth: 60 -> 65)');
assert(diffReport.categories.rooms.addedCount === 1, 'Detected added room (Executive Office)');
assert(diffReport.categories.rooms.removedCount === 1, 'Detected removed room (Guest Bath)');
assert(diffReport.categories.rooms.modifiedCount >= 1, 'Detected resized room (Living Room dimensions expanded)');
assert(diffReport.categories.structure.addedCount === 1, 'Detected added structural column (Column count changed from 2 to 3)');
assert(diffReport.categories.mep.removedCount === 1, 'Detected resolved MEP clash (clashes decreased from 1 to 0)');
assert(diffReport.categories.cost.modifiedCount >= 1, 'Detected budget update ($750k -> $820k)');

// TEST 4: Snapshot Validation Prior to Restore
console.log('\n--- TEST GROUP 4: Snapshot Integrity Validation ---');
const validResult = validateRestoreSnapshot(snap1);
assert(validResult.isValid === true, 'Validation passes for healthy snapshot');

const corruptSnapshot: ProjectSnapshot = JSON.parse(JSON.stringify(snap1));
corruptSnapshot.projectData.plotWidth = -50; // invalid dimension
const corruptResult = validateRestoreSnapshot(corruptSnapshot);
assert(corruptResult.isValid === false, 'Validation rejects snapshot with negative plot width');
assert(corruptResult.errors.length > 0, `Reported specific validation error: "${corruptResult.errors[0]}"`);

// TEST 5: Safe Restoration with Automatic Pre-Restore Safety Checkpoint
console.log('\n--- TEST GROUP 5: Safe Restoration & Auto-Safety Checkpoint ---');
const restoreOutcome = executeSafeRestore(modifiedProject, snap1, DEFAULT_COLLABORATORS[1]); // Marcus Vance restoring

assert(restoreOutcome.success === true, 'Safe restore operation succeeded');
assert(Boolean(restoreOutcome.safetySnapshot), 'Automatic pre-restore safety snapshot created');
assert(restoreOutcome.safetySnapshot?.trigger === 'pre-restore-safety', 'Safety snapshot tagged with trigger: pre-restore-safety');
assert(restoreOutcome.restoredProject?.plotWidth === 60, 'Restored project reverted to target snapshot plot width (60 ft)');
assert(restoreOutcome.restoredProject?.floorPlan?.rooms.length === 4, 'Restored project reverted to original 4 rooms');

// Verify that the safety snapshot preserved the working state before restore
assert(restoreOutcome.safetySnapshot?.projectData.plotWidth === 65, 'Safety backup preserved working plotWidth (65 ft)');
assert(Boolean(restoreOutcome.safetySnapshot?.projectData.floorPlan?.rooms.some(r => r.id === 'r5')), 'Safety backup preserved added Executive Office');

// TEST 6: Revision Bundle Export & Import
console.log('\n--- TEST GROUP 6: Asynchronous Revision Bundle Exchange ---');
const bundle = exportProjectRevisionBundle(modifiedProject, DEFAULT_COLLABORATORS[0]);
assert(bundle.plotifyBundleVersion === '1.0', 'Export bundle specifies version 1.0');
assert(bundle.projectId === modifiedProject.id, 'Bundle identifies matching project ID');
assert(bundle.snapshots.length >= 2, `Bundle contains historical snapshots and safety backup (${bundle.snapshots.length} total)`);

const bundleJson = JSON.stringify(bundle);
const importResult = importProjectRevisionBundle(bundleJson);
assert(importResult.success === true, 'Successfully parsed and validated exported revision bundle');
assert(importResult.bundle?.snapshots.length === bundle.snapshots.length, 'Preserved all snapshots across serialization');

const invalidJsonResult = importProjectRevisionBundle('{ badJson: true }');
assert(invalidJsonResult.success === false, 'Safely rejected invalid/corrupt JSON bundle without crashing');

// TEST 7: Snapshot Deletion
console.log('\n--- TEST GROUP 7: Snapshot Deletion ---');
const deleted = deleteProjectSnapshot(baseProject.id, snap1.id);
assert(deleted === true, 'Successfully deleted snapshot by ID');
const remainingSnaps = getProjectSnapshots(baseProject);
assert(!remainingSnaps.some(s => s.id === snap1.id), 'Deleted snapshot is no longer in project snapshot list');

console.log('\n================================================================');
console.log(`TEST SUMMARY: ${testsPassed} PASSED, ${testsFailed} FAILED`);
console.log('================================================================\n');

if (testsFailed > 0) {
  process.exit(1);
} else {
  console.log('ALL PROMPT 18 TESTS PASSED SUCCESSFULLY! ✨');
}
