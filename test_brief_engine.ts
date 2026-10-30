import { Project } from './src/types/project';
import {
  initializeProjectBrief,
  calculateSpaceProgramSummary,
  compareBriefWithFloorPlan,
  validateBrief,
  getBriefTemplates,
  recordBriefRevision,
} from './src/services/briefService';
import { generateProjectEvidenceRecords } from './src/services/evidenceEngine';
import {
  generateBriefSpaceProgramCSV,
  generateBriefDocumentMarkdown,
} from './src/services/documentationEngine';

console.log('================================================================');
console.log('PLOTIFY PROMPT 12: ARCHITECTURAL BRIEF & SPACE PROGRAMMING TEST');
console.log('================================================================\n');

const testProject: Project = {
  id: 'proj-brief-test-01',
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
  notes: 'Prompt 12 Acceptance Testing Project',
  status: 'Schematic Design',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  floorPlan: {
    rooms: [
      {
        id: 'r-liv-1',
        name: 'Living Room',
        type: 'living',
        x: 5,
        y: 5,
        width: 18,
        length: 20, // 360 sq ft
        floorLevel: 1,
      },
      {
        id: 'r-kit-1',
        name: 'Kitchen',
        type: 'kitchen',
        x: 25,
        y: 5,
        width: 12,
        length: 15, // 180 sq ft
        floorLevel: 1,
      },
      {
        id: 'r-bed-1',
        name: 'Master Suite',
        type: 'bedroom',
        x: 5,
        y: 5,
        width: 15,
        length: 16, // 240 sq ft
        floorLevel: 2,
      },
    ],
    gridSnap: 0.5,
    showGrid: true,
  },
};

// -------------------------------------------------------------------------
// TEST 1: Brief Initialization & Synthesis from Project Parameters
// -------------------------------------------------------------------------
console.log('Test 1: Brief Initialization & Synthesis...');
const brief = initializeProjectBrief(testProject);

if (!brief || !brief.spaces || brief.spaces.length === 0) {
  throw new Error('Test 1 Failed: Brief spaces were not synthesized');
}
if (brief.approvalStatus !== 'draft') {
  throw new Error(`Test 1 Failed: Expected initial status 'draft', got ${brief.approvalStatus}`);
}
if (!brief.objectives.primaryPurpose.includes('Nordic Passive Villa')) {
  throw new Error('Test 1 Failed: Brief objectives did not synthesize project name');
}

// Check that bedrooms and living room were generated
const livingSpace = brief.spaces.find((s) => s.category === 'living');
const bedSpaces = brief.spaces.filter((s) => s.category === 'sleeping');

if (!livingSpace || livingSpace.priority !== 'mandatory') {
  throw new Error('Test 1 Failed: Living room must be generated with mandatory priority');
}
if (bedSpaces.length === 0) {
  throw new Error('Test 1 Failed: Bedrooms were not synthesized');
}

console.log(`✓ Test 1 Passed: Initialized ${brief.spaces.length} spaces, objectives, and occupancy profile cleanly.`);

// -------------------------------------------------------------------------
// TEST 2: Deterministic Space Program Totals & Circulation Allowance
// -------------------------------------------------------------------------
console.log('\nTest 2: Space Program Calculations & Circulation Allowances...');
const summary = calculateSpaceProgramSummary(testProject, brief);

if (summary.totalTargetNetArea <= 0) {
  throw new Error('Test 2 Failed: Target net area must be positive');
}
if (summary.mandatoryTargetArea <= 0 || summary.mandatoryTargetArea > summary.totalTargetNetArea) {
  throw new Error('Test 2 Failed: Mandatory target area out of bounds');
}
const expectedGIA = Math.round(
  summary.totalTargetNetArea * (1 + summary.circulationWallAllowancePercent / 100)
);
if (Math.abs(summary.estimatedGrossInternalArea - expectedGIA) > 2) {
  throw new Error(
    `Test 2 Failed: GIA formula mismatch. Expected ${expectedGIA}, got ${summary.estimatedGrossInternalArea}`
  );
}

console.log(
  `✓ Test 2 Passed: Net Target: ${summary.totalTargetNetArea} sq ft, GIA: ${summary.estimatedGrossInternalArea} sq ft (+${summary.circulationWallAllowancePercent}% circulation).`
);

// -------------------------------------------------------------------------
// TEST 3: Plot Fit Feasibility Evaluation
// -------------------------------------------------------------------------
console.log('\nTest 3: Site Capacity & Footprint Feasibility...');
// Plot: 50 * 80 = 4000 sq ft. 60% coverage = 2400 sq ft. 2 floors = 4800 sq ft allowable gross area.
if (summary.availablePlotArea !== 4000) {
  throw new Error(`Test 3 Failed: Expected plot area 4000, got ${summary.availablePlotArea}`);
}
if (summary.maxAllowableGrossArea !== 4800) {
  throw new Error(
    `Test 3 Failed: Expected max allowable gross area 4800 sq ft, got ${summary.maxAllowableGrossArea}`
  );
}
if (summary.footprintFitStatus !== 'fits') {
  throw new Error(
    `Test 3 Failed: Program should fit easily within 4800 sq ft capacity, got ${summary.footprintFitStatus}`
  );
}

// Test intentional capacity exceedance
const oversizedProject: Project = {
  ...testProject,
  plotWidth: 15,
  plotLength: 15, // 225 sq ft plot!
  floors: 1,
};
const oversizedSummary = calculateSpaceProgramSummary(oversizedProject, brief);
if (oversizedSummary.footprintFitStatus !== 'exceeds') {
  throw new Error(
    `Test 3 Failed: Oversized program should flag 'exceeds' on tiny plot, got ${oversizedSummary.footprintFitStatus}`
  );
}

console.log('✓ Test 3 Passed: Site footprint capacity and over-allocation evaluated accurately.');

// -------------------------------------------------------------------------
// TEST 4: 2D Floor Plan Reconciliation & Area Variances
// -------------------------------------------------------------------------
console.log('\nTest 4: 2D Floor Plan Reconciliation...');
const comparisons = compareBriefWithFloorPlan(testProject, brief);

const livingComp = comparisons.find((c) => c.category === 'living');
if (!livingComp || livingComp.placedQuantity !== 1) {
  throw new Error('Test 4 Failed: Placed living room should be matched on 2D floor plan');
}
if (livingComp.actualPlacedTotalArea !== 360) {
  throw new Error(
    `Test 4 Failed: Expected placed living area 360 sq ft, got ${livingComp.actualPlacedTotalArea}`
  );
}

// Bathrooms: 2 required in brief, 0 placed on 2D plan
const bathComp = comparisons.find((c) => c.category === 'hygiene');
if (!bathComp || bathComp.placedQuantity !== 0 || bathComp.placementStatus !== 'unplaced') {
  throw new Error('Test 4 Failed: Bathrooms should be detected as unplaced');
}

// Validation notices should detect unplaced mandatory bathroom
const notices = validateBrief(testProject, brief);
const unplacedMandatoryNotice = notices.find(
  (n) => n.type === 'unplaced-mandatory' && n.title.includes('Bathroom')
);
if (!unplacedMandatoryNotice) {
  throw new Error('Test 4 Failed: Expected validation notice for unplaced mandatory bathroom');
}

console.log(
  `✓ Test 4 Passed: 2D plan reconciliation detected placed vs unplaced spaces and flagged unplaced mandatory bathrooms.`
);

// -------------------------------------------------------------------------
// TEST 5: Spatial Relationship Adjacency Checks
// -------------------------------------------------------------------------
console.log('\nTest 5: Spatial Relationship Adjacency Rules...');
const briefWithRules = {
  ...brief,
  relationships: [
    {
      id: 'rel-test-floor-mismatch',
      sourceSpaceId: brief.spaces.find((s) => s.category === 'living')?.id || '',
      targetSpaceId: brief.spaces.find((s) => s.category === 'sleeping')?.id || '',
      relationType: 'direct-access' as const,
      priority: 'mandatory' as const,
    },
  ],
};
const ruleNotices = validateBrief(testProject, briefWithRules);
const floorMismatchNotice = ruleNotices.find((n) => n.type === 'adjacency-conflict');
if (!floorMismatchNotice) {
  throw new Error('Test 5 Failed: Direct access across different floor levels should flag an adjacency conflict');
}
console.log('✓ Test 5 Passed: Multi-level spatial relationship conflict detected successfully.');

// -------------------------------------------------------------------------
// TEST 6: Proof-Carrying Evidence Ledger Integration (Section 9)
// -------------------------------------------------------------------------
console.log('\nTest 6: Proof-Carrying Evidence Ledger Integration (Section 9)...');
const evidenceSummary = generateProjectEvidenceRecords(testProject);

const programAreaEvidence = evidenceSummary.records.find((r) => r.id === 'ev-brief-program-area');
if (!programAreaEvidence || programAreaEvidence.module !== 'brief-programming') {
  throw new Error('Test 6 Failed: Missing ev-brief-program-area evidence record');
}

const mandatoryFulfillmentEvidence = evidenceSummary.records.find(
  (r) => r.id === 'ev-brief-mandatory-compliance'
);
if (!mandatoryFulfillmentEvidence || mandatoryFulfillmentEvidence.module !== 'brief-programming') {
  throw new Error('Test 6 Failed: Missing ev-brief-mandatory-compliance evidence record');
}
// Because bathrooms are unplaced, mandatory compliance should be conflict!
if (mandatoryFulfillmentEvidence.validationStatus !== 'conflict') {
  throw new Error(
    `Test 6 Failed: Mandatory compliance should be 'conflict' with unplaced bathrooms, got ${mandatoryFulfillmentEvidence.validationStatus}`
  );
}

const governanceEvidence = evidenceSummary.records.find((r) => r.id === 'ev-brief-governance-status');
if (!governanceEvidence) {
  throw new Error('Test 6 Failed: Missing ev-brief-governance-status record');
}

console.log('✓ Test 6 Passed: Section 9 Evidence records verified with exact status evaluation.');

// -------------------------------------------------------------------------
// TEST 7: Documentation & Export Engine Consistency
// -------------------------------------------------------------------------
console.log('\nTest 7: Documentation & Export Engine Output...');
const csv = generateBriefSpaceProgramCSV(testProject);
if (!csv.includes('Space ID,Space Name,Category,Priority')) {
  throw new Error('Test 7 Failed: CSV export header is missing');
}
if (!csv.includes('Living Lounge')) {
  throw new Error('Test 7 Failed: CSV export missing programmed living space');
}

const markdown = generateBriefDocumentMarkdown(testProject);
if (!markdown.includes('# PLOTIFY — ARCHITECTURAL BRIEF & SPACE PROGRAM SPECIFICATION')) {
  throw new Error('Test 7 Failed: Markdown report missing title banner');
}
if (!markdown.includes('## 4. Space Program Totals & Plot Capacity Analysis')) {
  throw new Error('Test 7 Failed: Markdown report missing capacity analysis section');
}

console.log('✓ Test 7 Passed: Space program CSV and Markdown specifications generated cleanly.');

console.log('\n================================================================');
console.log('ALL 7 ACCEPTANCE TESTS FOR BRIEF & SPACE PROGRAMMING PASSED (100%)');
console.log('================================================================\n');
