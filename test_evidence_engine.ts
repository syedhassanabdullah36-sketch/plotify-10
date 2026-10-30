import {
  generateProjectEvidenceRecords,
  generateAuditMarkdownReport,
  exportAuditJson,
} from './src/services/evidenceEngine';
import { Project } from './src/types/project';
import { computeProjectGeometryHash, generateDeterministicQTO } from './src/services/costPlanningService';

console.log('================================================================');
console.log('PLOTIFY PROMPT 9: PROOF-CARRYING DESIGN & TRACEABILITY TEST SUITE');
console.log('================================================================\n');

const baseProject: Project = {
  id: 'proj-proof-audit-01',
  name: 'Nordic Passive Villa',
  projectType: 'house',
  plotWidth: 50,
  plotLength: 80,
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
    garage: 1,
    customRooms: [],
  },
  budget: 450000,
  currency: 'USD',
  notes: 'Testing Proof-Carrying Evidence Engine',
  status: 'Drafting',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  floorPlan: {
    rooms: [
      {
        id: 'room-1',
        name: 'Living Room',
        type: 'living',
        x: 5,
        y: 5,
        width: 18,
        length: 22,
        floorLevel: 1,
      },
      {
        id: 'room-2',
        name: 'Kitchen',
        type: 'kitchen',
        x: 25,
        y: 5,
        width: 14,
        length: 16,
        floorLevel: 1,
      },
      {
        id: 'room-3',
        name: 'Master Suite',
        type: 'bedroom',
        x: 5,
        y: 5,
        width: 16,
        length: 20,
        floorLevel: 2,
      },
    ],
    gridSnap: 0.5,
    showGrid: true,
  },
};

// -------------------------------------------------------------------------
// TEST 1: Verification of Recorded Inputs & Deterministic Mathematical Formulas
// -------------------------------------------------------------------------
console.log('Test 1: Verification of Recorded Inputs against Real Geometry...');
const initialSummary = generateProjectEvidenceRecords(baseProject);

const plotAreaRec = initialSummary.records.find((r) => r.id === 'ev-geom-plot-area');
if (!plotAreaRec || plotAreaRec.resultValue !== 4000) {
  throw new Error(`Test 1 Failed: Expected plot area 4000, got ${plotAreaRec?.resultValue}`);
}
if (plotAreaRec.inputValuesUsed.plotWidth !== 50 || plotAreaRec.inputValuesUsed.plotLength !== 80) {
  throw new Error('Test 1 Failed: Captured input dimensions do not match project data');
}

// Ground Floor Footprint: Room 1 (18*22=396) + Room 2 (14*16=224) = 620 sq ft
const groundFootprintRec = initialSummary.records.find((r) => r.id === 'ev-geom-ground-floor-area');
if (!groundFootprintRec || groundFootprintRec.resultValue !== 620) {
  throw new Error(`Test 1 Failed: Expected ground footprint 620 sq ft, got ${groundFootprintRec?.resultValue}`);
}

// Total Built Area: 620 + Room 3 (16*20=320) = 940 sq ft
const totalBuiltRec = initialSummary.records.find((r) => r.id === 'ev-geom-total-built-area');
if (!totalBuiltRec || totalBuiltRec.resultValue !== 940) {
  throw new Error(`Test 1 Failed: Expected total built area 940 sq ft, got ${totalBuiltRec?.resultValue}`);
}
console.log('✓ Test 1 Passed: Spatial inputs & calculations match with exact mathematical precision.');

// -------------------------------------------------------------------------
// TEST 2: Validation Status Rules System (Pass, Conflict, Pending, Not Assessed)
// -------------------------------------------------------------------------
console.log('\nTest 2: Validation Status Rules Execution...');
const boundaryViolationRec = initialSummary.records.find((r) => r.id === 'ev-geom-boundary-violations');
if (!boundaryViolationRec || boundaryViolationRec.validationStatus !== 'pass') {
  throw new Error(`Test 2 Failed: Expected boundary violations check to pass, got ${boundaryViolationRec?.validationStatus}`);
}

// Check that structural engineering check is honestly marked 'not-assessed'
const structuralRec = initialSummary.records.find((r) => r.id === 'ev-eng-structural-gravity');
if (!structuralRec || structuralRec.validationStatus !== 'not-assessed') {
  throw new Error(`Test 2 Failed: Structural check should be marked 'not-assessed', got ${structuralRec?.validationStatus}`);
}
if (!structuralRec.requiredProfessionalReview.includes('Licensed Professional Structural Engineer')) {
  throw new Error('Test 2 Failed: Missing mandatory structural engineer review disclosure');
}
console.log('✓ Test 2 Passed: Validation status rules correctly assign Pass, Conflict, and Not-Assessed without fabrication.');

// -------------------------------------------------------------------------
// TEST 3: Stale-Data Detection on Geometry Modification
// -------------------------------------------------------------------------
console.log('\nTest 3: Change Tracking & Stale Detection...');
// Simulate project with a cached cost planning geometry hash
const currentGeomHash = computeProjectGeometryHash(baseProject);
const syncedProject: Project = {
  ...baseProject,
  costPlanning: {
    currency: 'USD',
    lastRecalculatedAt: new Date().toISOString(),
    lastGeometryHash: currentGeomHash, // in sync!
    targetBudget: 450000,
    activeScenarioId: 'cost-scen-1',
    scenarios: [
      {
        id: 'cost-scen-1',
        name: 'Baseline Estimate',
        description: 'Baseline cost scenario for testing',
        isBaseline: true,
        sourceGeometryHash: currentGeomHash,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        location: 'Default Site',
        currency: 'USD',
        contingencyRatePercent: 7.5,
        taxRatePercent: 0,
        lineItems: generateDeterministicQTO(baseProject),
      },
    ],
    phases: [],
  },
};

const syncedSummary = generateProjectEvidenceRecords(syncedProject);
const syncedHashRec = syncedSummary.records.find((r) => r.id === 'ev-cost-geometry-hash-sync');
if (!syncedHashRec || syncedHashRec.validationStatus !== 'pass') {
  throw new Error(`Test 3 Failed: Synced QTO should have 'pass' status, got ${syncedHashRec?.validationStatus}`);
}

// Now modify 2D geometry (e.g. expand living room)
const modifiedProject: Project = {
  ...syncedProject,
  floorPlan: {
    ...syncedProject.floorPlan!,
    rooms: [
      {
        ...syncedProject.floorPlan!.rooms[0],
        width: 25, // modified width!
      },
      ...syncedProject.floorPlan!.rooms.slice(1),
    ],
  },
};

const modifiedSummary = generateProjectEvidenceRecords(modifiedProject);
const staleHashRec = modifiedSummary.records.find((r) => r.id === 'ev-cost-geometry-hash-sync');
if (!staleHashRec || staleHashRec.validationStatus !== 'stale') {
  throw new Error(`Test 3 Failed: Modified geometry should trigger 'stale' status, got ${staleHashRec?.validationStatus}`);
}
if (!staleHashRec.staleReason?.includes('geometry was modified')) {
  throw new Error('Test 3 Failed: Missing explicit stale reason explanation');
}
console.log('✓ Test 3 Passed: Changing 2D geometry immediately flags dependent cost QTO records as STALE.');

// -------------------------------------------------------------------------
// TEST 4: Detection of Boundary Violations and Spatial Conflicts
// -------------------------------------------------------------------------
console.log('\nTest 4: Boundary Conflict Detection...');
const violatingProject: Project = {
  ...baseProject,
  floorPlan: {
    ...baseProject.floorPlan!,
    rooms: [
      {
        id: 'violating-room',
        name: 'Oversized Great Hall',
        type: 'living',
        x: 40,
        y: 70,
        width: 30, // 40 + 30 = 70 > plotWidth 50!
        length: 20, // 70 + 20 = 90 > plotLength 80!
        floorLevel: 1,
      },
    ],
  },
};

const violationSummary = generateProjectEvidenceRecords(violatingProject);
const violationRec = violationSummary.records.find((r) => r.id === 'ev-geom-boundary-violations');
if (!violationRec || violationRec.validationStatus !== 'conflict' || violationRec.resultValue !== 1) {
  throw new Error(`Test 4 Failed: Expected 1 conflict for boundary violation, got ${violationRec?.resultValue} (${violationRec?.validationStatus})`);
}
console.log('✓ Test 4 Passed: Spatial boundary enclosure conflicts are reliably detected.');

// -------------------------------------------------------------------------
// TEST 5: Professional Reporting & Markdown / JSON Export
// -------------------------------------------------------------------------
console.log('\nTest 5: Export Consistency & Statutory Disclaimers...');
const markdownReport = generateAuditMarkdownReport(syncedSummary);
if (!markdownReport.includes('PROOF-CARRYING DESIGN & EVIDENCE TRACEABILITY AUDIT LEDGER')) {
  throw new Error('Test 5 Failed: Markdown report missing title');
}
if (!markdownReport.includes('Statutory Professional Limitations Disclaimer')) {
  throw new Error('Test 5 Failed: Markdown report missing mandatory professional disclaimer');
}

const jsonExport = exportAuditJson(syncedSummary);
const parsedJson = JSON.parse(jsonExport);
if (parsedJson.records.length !== syncedSummary.totalRecords) {
  throw new Error('Test 5 Failed: JSON export record count mismatch');
}
console.log('✓ Test 5 Passed: Markdown & JSON export formats preserve exact data, counts, and disclosures.');

console.log('\n================================================================');
console.log('ALL 5 ACCEPTANCE TESTS FOR PROOF-CARRYING ENGINE PASSED (100%)');
console.log('================================================================');
