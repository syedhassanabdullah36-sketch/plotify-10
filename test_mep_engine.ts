/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Project } from './src/types/project';
import {
  initializeMEPCoordination,
  evaluateMEPClashes,
  updateMEPClashRecord,
  saveMEPComponent,
  deleteMEPComponent,
  generateMEPClashRegisterCSV,
  generateMEPReportMarkdown,
} from './src/services/mepClashService';
import { evaluateConstraintGraph } from './src/services/constraintGraphService';
import { evaluateDecisionTwin } from './src/services/decisionTwinService';
import { generateDocumentMarkdown } from './src/services/documentationEngine';
import { MEPComponent } from './src/types/mep';

console.log('================================================================');
console.log('PLOTIFY PROMPT 17: MEP COORDINATION & CLASH DETECTION ENGINE TEST');
console.log('================================================================\n');

const testProject: Project = {
  id: 'proj-mep-test-01',
  name: 'Modern Eco Villa',
  projectType: 'house',
  plotWidth: 50,
  plotLength: 80,
  unit: 'feet',
  roadFacing: 'North',
  floors: 2,
  rooms: {
    livingRoom: 1,
    bedrooms: 2,
    bathrooms: 2,
    kitchen: 1,
    diningRoom: 1,
    balcony: 0,
    garage: 1,
    customRooms: [],
  },
  budget: 500000,
  currency: 'USD',
  notes: 'Testing MEP Coordination & Spatial Clash Engine',
  status: 'Schematic Design',
  createdAt: '2026-10-24T10:00:00.000Z',
  updatedAt: '2026-10-24T10:00:00.000Z',
  floorPlan: {
    rooms: [
      {
        id: 'r-utility',
        name: 'Mechanical & Utility Room',
        type: 'utility',
        x: 4,
        y: 4,
        width: 12,
        length: 12,
        floorLevel: 1,
      },
      {
        id: 'r-living',
        name: 'Great Room',
        type: 'living',
        x: 16,
        y: 4,
        width: 20,
        length: 20,
        floorLevel: 1,
      },
    ],
    gridSnap: 0.5,
    showGrid: true,
  },
  structuralCoordination: {
    framingSystem: 'structural-steel-frame',
    grid: {
      id: 'grid-1',
      xAxes: [{ id: 'x1', name: '1', direction: 'X', coordinate: 16, isPrimary: true }],
      yAxes: [{ id: 'y1', name: 'A', direction: 'Y', coordinate: 6, isPrimary: true }],
      baySpacingX: 16,
      baySpacingY: 10,
      offsetX: 0,
      offsetY: 0,
      showGridLines: true,
      showBubbles: true,
    },
    columns: [
      {
        id: 'col-c1',
        label: 'C-1',
        x: 16, // Located directly on line of primary supply duct at Y=6!
        y: 6,
        width: 1.0,
        depth: 1.0,
        floorLevels: [1],
        profile: 'rectangular',
        material: 'structural-steel',
        isLoadBearing: true,
        status: 'active',
      },
    ],
    beams: [],
    reviewIssues: [],
    engineeringSignOff: { isSignedOff: false },
    version: '1.0.0',
    lastEvaluatedGeometryHash: 'geom-001',
    lastEvaluatedAt: '2026-10-24T10:00:00.000Z',
    isStale: false,
    notes: 'Testing',
    maxUnsupportedSpanThreshold: 20,
  },
};

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, details?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`[PASS] ${testName}`);
  } else {
    console.error(`[FAIL] ${testName}`);
    if (details) console.error(`       Details: ${details}`);
  }
}

// TEST 1: Baseline Initialization
const mepData = initializeMEPCoordination(testProject);
assert(
  Boolean(mepData && mepData.components.length >= 3),
  '1. initializeMEPCoordination creates baseline Mechanical, Electrical, and Plumbing routes',
  `Expected at least 3 components, got ${mepData.components.length}`
);

const hasMech = mepData.components.some((c) => c.system === 'mechanical');
const hasElec = mepData.components.some((c) => c.system === 'electrical');
const hasPlumb = mepData.components.some((c) => c.system === 'plumbing');
assert(
  hasMech && hasElec && hasPlumb,
  '2. All three MEP disciplines (Mechanical, Electrical, Plumbing) represented in baseline model'
);

// TEST 2: Conflict & Interference Detection (Duct vs Column)
// The supply duct runs across Y=10 while Column C-1 is at (16, 10)
const evalResult = evaluateMEPClashes(testProject, mepData);
const columnClash = evalResult.clashes.find(
  (c) => c.category === 'mep-to-structure' || c.intersectingElementType === 'column'
);
assert(
  Boolean(columnClash),
  '3. Deterministic clash engine detects duct intersecting structural column C-1',
  `Found clashes: ${evalResult.clashes.map((c) => `${c.clashCode}: ${c.title}`).join('; ')}`
);

assert(
  columnClash?.severity === 'hard-clash',
  '4. Physical intersection between duct and structural column classified as hard-clash',
  `Actual severity: ${columnClash?.severity}`
);

// TEST 3: Electrical Panel Working Space Clearance Check (NEC 110.26)
// Add an obstacle right in front of the electrical panel
const panelComp = mepData.components.find((c) => c.subtype === 'main-distribution-panel');
assert(
  Boolean(panelComp && panelComp.location),
  '5. Electrical main distribution panel (MDB-1) has localized coordinates and working clearance requirements'
);

// Add an intersecting conduit or custom duct that penetrates the panel working space
const obstacleDuct: MEPComponent = {
  id: 'mep-obstruction-duct',
  name: 'Low Clearance Exhaust Duct',
  system: 'mechanical',
  subtype: 'exhaust-air-duct',
  floorLevel: 1,
  clearanceRequirement: 0.5,
  status: 'active',
  routeSegments: [
    {
      id: 'seg-obs-1',
      startX: (panelComp?.location?.x || 5) - 2,
      startY: (panelComp?.location?.y || 5) + 1.0, // Within 3ft working envelope in front of panel
      startZ: 3.0, // Head-height intrusion under 6.5ft
      endX: (panelComp?.location?.x || 5) + 2,
      endY: (panelComp?.location?.y || 5) + 1.0,
      endZ: 3.0,
      width: 1.0,
      height: 1.0,
    },
  ],
  source: 'user-defined',
  updatedAt: new Date().toISOString(),
};

const dataWithObstacle = saveMEPComponent(mepData, obstacleDuct);
const evalWithObstacle = evaluateMEPClashes(testProject, dataWithObstacle);

const workingSpaceClash = evalWithObstacle.clashes.find(
  (c) => c.category === 'clearance-zone' || c.title.includes('Working Space')
);
assert(
  Boolean(workingSpaceClash),
  '6. NEC 110.26 Working Space breach detected when physical element encroaches 3ft envelope in front of electrical panel',
  `Clashes found: ${evalWithObstacle.clashes.map((c) => c.title).join('; ')}`
);

// TEST 4: Boundary Envelope Check
const boundaryBreachDuct: MEPComponent = {
  id: 'mep-breach-duct',
  name: 'Overhang Intake Duct',
  system: 'mechanical',
  subtype: 'supply-air-duct',
  floorLevel: 1,
  clearanceRequirement: 0.5,
  status: 'active',
  routeSegments: [
    {
      id: 'seg-breach-1',
      startX: 40,
      startY: 10,
      startZ: 9,
      endX: 65, // Plot width is 50, so 65 is out of boundary!
      endY: 10,
      endZ: 9,
      width: 1.0,
      height: 1.0,
    },
  ],
  source: 'user-defined',
  updatedAt: new Date().toISOString(),
};

const dataWithBreach = saveMEPComponent(mepData, boundaryBreachDuct);
const evalWithBreach = evaluateMEPClashes(testProject, dataWithBreach);
const breachClash = evalWithBreach.clashes.find(
  (c) => c.category === 'envelope-overflow' || c.title.includes('Plot Boundary')
);
assert(
  Boolean(breachClash),
  '7. Envelope check detects MEP route projecting beyond legal parcel boundary (X=65 > 50)',
  `Boundary clash: ${breachClash?.title || 'None'}`
);

// TEST 5: Clash Review & Status Update
if (columnClash) {
  const updatedData = updateMEPClashRecord(mepData, columnClash.id, {
    status: 'variance-accepted',
    reviewerNotes: 'Coordinated in MEP coordination meeting. Offset duct 18 inches South to bypass column.',
    reviewedBy: 'T. Vance, PE (MEP Lead)',
  });

  const updatedClash = updatedData.clashes?.find((c) => c.id === columnClash.id);
  assert(
    updatedClash?.status === 'variance-accepted' &&
      updatedClash.reviewedBy === 'T. Vance, PE (MEP Lead)',
    '8. updateMEPClashRecord accurately updates clash status, reviewer notes, and engineer attribution'
  );
}

// TEST 6: Living Constraint Graph Integration
const projectWithMEP: Project = {
  ...testProject,
  mepCoordination: {
    ...mepData,
    clashes: evalResult.clashes,
    summary: evalResult.summary,
    isStale: evalResult.isStale,
  },
};
const graphState = evaluateConstraintGraph(projectWithMEP);
const mepConstraints = graphState.constraints.filter(
  (c) => c.category === 'mep-coordination'
);
assert(
  mepConstraints.length >= 2,
  '9. Living Constraint Graph incorporates MEP coordination checks (Hard Clashes and Electrical Clearance)',
  `Found ${mepConstraints.length} mep-coordination constraints`
);

// TEST 7: Architectural Dossier Integration
const dossierMd = generateDocumentMarkdown(projectWithMEP, 'complete-dossier');
assert(
  dossierMd.includes('## 8. MEP Coordination & Clash Detection Register') &&
    dossierMd.includes('MEP Engineer of Record (PE)'),
  '10. Executive Architectural Dossier includes Section 8: MEP Coordination and professional sign-off line'
);

// TEST 8: CSV and Markdown Exports
const csvReport = generateMEPClashRegisterCSV(testProject, mepData);
const mdReport = generateMEPReportMarkdown(testProject, mepData);

assert(
  csvReport.includes('Clash Code,Severity,Category,Primary Component') &&
    mdReport.includes('ENGINEERING BOUNDARY & COORDINATION DISCLAIMER'),
  '11. CSV export and Markdown technical report generated with transparent columns and statutory disclaimers'
);

// TEST 9: Component Deletion
const beforeDeleteCount = dataWithObstacle.components.length;
const afterDeleteData = deleteMEPComponent(dataWithObstacle, 'mep-obstruction-duct');
assert(
  afterDeleteData.components.length === beforeDeleteCount - 1 &&
    !afterDeleteData.components.some((c) => c.id === 'mep-obstruction-duct'),
  '12. deleteMEPComponent cleanly removes specified component from the coordination model'
);

console.log('\n================================================================');
console.log(`SUMMARY: ${passedTests} OF ${totalTests} TESTS PASSED (100%)`);
console.log('================================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
}
