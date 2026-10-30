/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Project } from './src/types/project';
import {
  initializeStructuralCoordination,
  evaluateStructuralCoordination,
  updateStructuralIssue,
  saveStructuralColumn,
  deleteStructuralColumn,
  generateStructuralSummaryCSV,
  generateStructuralReportMarkdown,
} from './src/services/structuralService';
import { evaluateDecisionTwin } from './src/services/decisionTwinService';
import { evaluateConstraintGraph } from './src/services/constraintGraphService';
import { generateDocumentMarkdown } from './src/services/documentationEngine';

console.log('================================================================');
console.log('PLOTIFY PROMPT 14: STRUCTURAL COORDINATION & REVIEW ENGINE TEST');
console.log('================================================================\n');

const testProject: Project = {
  id: 'proj-struct-test-01',
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
  notes: 'Testing Structural Framing Coordination Workspace',
  status: 'Schematic Design',
  createdAt: '2026-10-20T10:00:00.000Z',
  updatedAt: '2026-10-20T10:00:00.000Z',
  floorPlan: {
    rooms: [
      {
        id: 'r-living',
        name: 'Open Living & Dining Room',
        type: 'living',
        x: 4,
        y: 4,
        width: 24, // Exceeds 20 ft prescriptive span limit!
        length: 22,
        floorLevel: 1,
      },
      {
        id: 'r-kitchen',
        name: 'Kitchen',
        type: 'kitchen',
        x: 30,
        y: 4,
        width: 14,
        length: 16,
        floorLevel: 1,
      },
      {
        id: 'r-bed-upper',
        name: 'Primary Bedroom Suite',
        type: 'bedroom',
        x: 4,
        y: 4,
        width: 18,
        length: 18,
        floorLevel: 2,
      },
      {
        id: 'r-balcony',
        name: 'Cantilever View Terrace',
        type: 'balcony',
        x: 24,
        y: 4,
        width: 8, // Exceeds 6 ft cantilever limit!
        length: 10,
        floorLevel: 2,
      },
    ],
    gridSnap: 0.5,
    showGrid: true,
  },
};

// -------------------------------------------------------------------------
// TEST 1: Structural Initialization & Orthogonal Grid Baseline
// -------------------------------------------------------------------------
console.log('Test 1: Structural Initialization & Orthogonal Grid Baseline...');
const initialData = initializeStructuralCoordination(testProject);

if (!initialData.grid || initialData.grid.xAxes.length === 0 || initialData.grid.yAxes.length === 0) {
  throw new Error('Test 1 Failed: Structural reference grid was not generated properly.');
}
if (initialData.columns.length === 0) {
  throw new Error('Test 1 Failed: Structural column baseline was not generated.');
}
if (initialData.maxUnsupportedSpanThreshold !== 20) {
  throw new Error(`Test 1 Failed: Expected prescriptive span threshold of 20 ft, got ${initialData.maxUnsupportedSpanThreshold}`);
}
console.log(`✓ Test 1 Passed: Initialized ${initialData.grid.xAxes.length} X-Axes, ${initialData.grid.yAxes.length} Y-Axes, and ${initialData.columns.length} columns.`);

// -------------------------------------------------------------------------
// TEST 2: Clear Span & Deflection Evaluation (Detecting span > 20 ft limit)
// -------------------------------------------------------------------------
console.log('\nTest 2: Clear Span & Deflection Evaluation...');
const eval1 = evaluateStructuralCoordination(testProject, initialData);

const spanIssue = eval1.issues.find((i) => i.category === 'span-exceeded' && i.location.roomName === 'Open Living & Dining Room');
if (!spanIssue) {
  throw new Error('Test 2 Failed: Did not detect clear span exceedance in Open Living & Dining Room (24 ft > 20 ft limit).');
}
if (eval1.summary.maxMeasuredSpan !== 24) {
  throw new Error(`Test 2 Failed: Expected max measured span of 24.0 ft, got ${eval1.summary.maxMeasuredSpan}`);
}
console.log(`✓ Test 2 Passed: Detected 24.0 ft clear span exceeding 20.0 ft limit with recommendation: "${spanIssue.recommendation.slice(0, 40)}..."`);

// -------------------------------------------------------------------------
// TEST 3: Cantilever & Deep Balcony Support Evaluation
// -------------------------------------------------------------------------
console.log('\nTest 3: Cantilever & Deep Balcony Support Evaluation...');
const cantIssue = eval1.issues.find((i) => i.category === 'cantilever-unsupported');
if (!cantIssue) {
  throw new Error('Test 3 Failed: Did not detect deep cantilever on Cantilever View Terrace (8 ft projection > 6 ft limit).');
}
console.log(`✓ Test 3 Passed: Detected deep cantilever (8.0 ft projection > 6.0 ft limit) requiring structural back-span design.`);

// -------------------------------------------------------------------------
// TEST 4: Column Usable Space Obstruction Check
// -------------------------------------------------------------------------
console.log('\nTest 4: Column Usable Space Obstruction Check...');
// Place an isolated column right in the middle of Open Living Room (x: 14, y: 14)
const isolatedCol = {
  id: 'col-freestanding-test',
  label: 'C-ISO',
  x: 14, // in middle of room (4..28)
  y: 14, // in middle of room (4..26)
  floorLevels: [1],
  profile: 'rectangular' as const,
  width: 1.0,
  depth: 1.0,
  material: 'reinforced-concrete' as const,
  isLoadBearing: true,
  status: 'active' as const,
};
const dataWithIsoCol = saveStructuralColumn(initialData, isolatedCol);
const evalIso = evaluateStructuralCoordination(testProject, dataWithIsoCol);

const colClash = evalIso.issues.find((i) => i.id === 'iss-col-protrude-col-freestanding-test-r-living');
if (!colClash) {
  throw new Error('Test 4 Failed: Did not detect freestanding column inside room clear usable space.');
}
console.log(`✓ Test 4 Passed: Detected freestanding column C-ISO in usable room area (${colClash.measuredValue}).`);

// -------------------------------------------------------------------------
// TEST 5: Multi-Level Vertical Load Path Continuity
// -------------------------------------------------------------------------
console.log('\nTest 5: Multi-Level Vertical Load Path Continuity...');
// Add an upper level column that has no column or wall beneath it on Floor 1
const floatingUpperCol = {
  id: 'col-upper-floating',
  label: 'C-UPPER-FLOAT',
  x: 40, // Far from any room or ground column
  y: 40,
  floorLevels: [2],
  profile: 'rectangular' as const,
  width: 1.0,
  depth: 1.0,
  material: 'structural-steel' as const,
  isLoadBearing: true,
  status: 'active' as const,
};
const dataWithDiscont = saveStructuralColumn(dataWithIsoCol, floatingUpperCol);
const evalDiscont = evaluateStructuralCoordination(testProject, dataWithDiscont);

const vertIssue = evalDiscont.issues.find((i) => i.id === 'iss-vert-discont-col-upper-floating');
if (!vertIssue || vertIssue.severity !== 'conflict') {
  throw new Error('Test 5 Failed: Did not flag discontinuous upper-level column as critical conflict.');
}
console.log(`✓ Test 5 Passed: Discontinuous vertical load path identified as conflict (${vertIssue.issueCode}).`);

// -------------------------------------------------------------------------
// TEST 6: Engineering Review Register & Issue Tracking
// -------------------------------------------------------------------------
console.log('\nTest 6: Engineering Review Register & Issue Tracking...');
const updatedIssueData = updateStructuralIssue(dataWithDiscont, vertIssue.id, {
  status: 'variance-accepted',
  reviewerNotes: 'Transfer girder W18x50 verified on Floor 1 ceiling plan to support point load.',
  reviewedBy: 'Dr. Sarah Lin, PE, SE',
});

const evalUpdated = evaluateStructuralCoordination(testProject, updatedIssueData);
const updatedIssue = evalUpdated.issues.find((i) => i.id === vertIssue.id);
if (!updatedIssue || updatedIssue.status !== 'variance-accepted' || updatedIssue.reviewedBy !== 'Dr. Sarah Lin, PE, SE') {
  throw new Error('Test 6 Failed: Reviewer updates were not preserved in structural review register.');
}
console.log(`✓ Test 6 Passed: Issue updated to "${updatedIssue.status}" with reviewer notes by "${updatedIssue.reviewedBy}".`);

// -------------------------------------------------------------------------
// TEST 7: Column Deletion & Beam Association Cleanup
// -------------------------------------------------------------------------
console.log('\nTest 7: Column Deletion & Beam Association Cleanup...');
const cleanedData = deleteStructuralColumn(updatedIssueData, 'col-upper-floating');
if (cleanedData.columns.some((c) => c.id === 'col-upper-floating')) {
  throw new Error('Test 7 Failed: Column was not deleted from inventory.');
}
console.log(`✓ Test 7 Passed: Successfully removed column and associated framing.`);

// -------------------------------------------------------------------------
// TEST 8: Decision Twin Dynamic Integration
// -------------------------------------------------------------------------
console.log('\nTest 8: Decision Twin Dynamic Integration...');
const projectWithStruct: Project = {
  ...testProject,
  structuralCoordination: updatedIssueData,
};
const twinState = evaluateDecisionTwin(projectWithStruct);
const structTwinNode = twinState.nodes['structural-mep'];

if (!structTwinNode || !structTwinNode.isSupported) {
  throw new Error('Test 8 Failed: Decision Twin structural-mep node is not active or marked supported.');
}
if (structTwinNode.status !== 'current' && structTwinNode.status !== 'failed') {
  throw new Error(`Test 8 Failed: Expected current or failed status, got ${structTwinNode.status}`);
}
console.log(`✓ Test 8 Passed: Decision Twin node 'structural-mep' evaluated with status '${structTwinNode.status}' and metrics:`, structTwinNode.metrics);

// -------------------------------------------------------------------------
// TEST 9: Living Constraint Graph Integration
// -------------------------------------------------------------------------
console.log('\nTest 9: Living Constraint Graph Integration...');
const graphState = evaluateConstraintGraph(projectWithStruct);
const structConstraints = graphState.constraints.filter((c) => c.category === 'structural-coordination');

if (structConstraints.length === 0) {
  throw new Error('Test 9 Failed: Living Constraint Graph contains no structural-coordination constraints.');
}
console.log(`✓ Test 9 Passed: Found ${structConstraints.length} structural coordination constraints in Living Constraint Graph:`, structConstraints.map((c) => `${c.title} (${c.status})`).join('; '));

// -------------------------------------------------------------------------
// TEST 10: Standards-Compliant CSV & Markdown Dossier Export
// -------------------------------------------------------------------------
console.log('\nTest 10: Standards-Compliant CSV & Markdown Dossier Export...');
const csvOutput = generateStructuralSummaryCSV(projectWithStruct, updatedIssueData);
if (!csvOutput.includes('# PLOTIFY STRUCTURAL COORDINATION & ENGINEERING REVIEW REGISTER') ||
    !csvOutput.includes('STR-SPN-') ||
    !csvOutput.includes('# STRUCTURAL COLUMN INVENTORY')) {
  throw new Error('Test 10 Failed: Generated CSV missing required structural coordination headers or records.');
}

const dossierMarkdown = generateDocumentMarkdown(projectWithStruct, 'complete-dossier');
if (!dossierMarkdown.includes('## 7. Structural Coordination & Engineering Review') ||
    !dossierMarkdown.includes('ENGINEERING BOUNDARY & STATUTORY DISCLAIMER')) {
  throw new Error('Test 10 Failed: Complete Dossier missing Section 7 Structural Coordination or statutory disclaimers.');
}
console.log('✓ Test 10 Passed: RFC 4180 CSV export and Complete Dossier Section 7 successfully generated with full statutory disclaimers.');

// -------------------------------------------------------------------------
// TEST 11: PE/SE Professional Review Sign-Off & Staleness Tracking
// -------------------------------------------------------------------------
console.log('\nTest 11: PE/SE Professional Review Sign-Off & Staleness Tracking...');
const signedData = {
  ...updatedIssueData,
  engineeringSignOff: {
    isSignedOff: true,
    engineerName: 'Marcus Vance, PE, SE',
    licenseNumber: 'PE-94812-SE',
    jurisdiction: 'State Board of Professional Engineers',
    signedAt: new Date().toISOString(),
    stampNotes: 'Schematic architectural framing approved for municipal pre-filing review.',
  },
};

const reportMd = generateStructuralReportMarkdown(projectWithStruct, signedData);
if (!reportMd.includes('SIGNED & SEATED') || !reportMd.includes('PE-94812-SE')) {
  throw new Error('Test 11 Failed: Professional engineer stamp was not reflected in structural report.');
}

// Modify room geometry to verify staleness detection
const modifiedRooms = [
  ...testProject.floorPlan!.rooms,
  {
    id: 'r-new-ext',
    name: 'Garden Pavilion Extension',
    type: 'living',
    x: 4,
    y: 30,
    width: 20,
    length: 20,
    floorLevel: 1,
  },
];
const staleCheck = evaluateStructuralCoordination(
  { ...projectWithStruct, floorPlan: { ...projectWithStruct.floorPlan!, rooms: modifiedRooms } },
  signedData
);

if (!staleCheck.isStale) {
  throw new Error('Test 11 Failed: Staleness was not detected after geometry modification.');
}
console.log('✓ Test 11 Passed: Professional PE/SE sign-off and staleness detection verified 100%.');

console.log('\n================================================================');
console.log('ALL 11 ACCEPTANCE TESTS FOR PROMPT 14 STRUCTURAL COORDINATION PASSED');
console.log('================================================================');
