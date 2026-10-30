/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Project } from './src/types/project';
import {
  initializeProjectRegulations,
  evaluateProjectRegulations,
  recordProjectRegulatoryAssessment,
  addReviewerDecision,
  addRegulatorySource,
  generateRegulatoryComplianceCSV,
  generateRegulatoryMarkdownReport,
  DEFAULT_REGULATORY_SOURCES,
  DEFAULT_REGULATORY_REQUIREMENTS,
} from './src/services/regulatoryService';
import { generateProjectEvidenceRecords } from './src/services/evidenceEngine';
import { evaluateConstraintGraph } from './src/services/constraintGraphService';
import { evaluateDecisionTwin } from './src/services/decisionTwinService';
import { initializeProjectBrief, validateBrief } from './src/services/briefService';
import { generateDocumentMarkdown } from './src/services/documentationEngine';

console.log('================================================================');
console.log('PLOTIFY PROMPT 13: BUILDING REGULATIONS INTELLIGENCE ENGINE TEST');
console.log('================================================================\n');

// Base test project fixture
const baseProject: Project = {
  id: 'proj-reg-test-01',
  name: 'Oakridge Contemporary Villa',
  projectType: 'house',
  plotWidth: 60,
  plotLength: 100, // Plot area = 6,000 sq ft
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
  budget: 550000,
  currency: 'USD',
  notes: 'Prompt 13 Regulatory Engine Acceptance Testing Fixture',
  status: 'Schematic Design',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  floorPlan: {
    rooms: [
      {
        id: 'r-liv-01',
        name: 'Grand Living Room',
        type: 'living',
        x: 16, // setback from left = 16 ft (>= 5 ft pass)
        y: 20, // setback from front = 20 ft (>= 15 ft pass)
        width: 20,
        length: 22, // 440 sq ft (>= 120 sq ft primary pass)
        floorLevel: 1,
      },
      {
        id: 'r-kit-01',
        name: 'Family Kitchen',
        type: 'kitchen',
        x: 36,
        y: 20,
        width: 14,
        length: 18, // 252 sq ft
        floorLevel: 1,
      },
      {
        id: 'r-bath-01',
        name: 'Guest Bathroom',
        type: 'bathroom',
        x: 16,
        y: 42,
        width: 8,
        length: 10,
        floorLevel: 1,
      },
      {
        id: 'r-bed-01',
        name: 'Master Bedroom',
        type: 'bedroom',
        x: 16,
        y: 20,
        width: 16,
        length: 18, // 288 sq ft (>= 70 sq ft pass)
        floorLevel: 2,
      },
      {
        id: 'r-bed-02',
        name: 'Bedroom 2',
        type: 'bedroom',
        x: 32,
        y: 20,
        width: 12,
        length: 14, // 168 sq ft (>= 70 sq ft pass)
        floorLevel: 2,
      },
    ],
  },
};

let allPassed = true;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`✓ ${testName} Passed${detail ? ` (${detail})` : ''}`);
  } else {
    console.error(`✗ ${testName} FAILED${detail ? `: ${detail}` : ''}`);
    allPassed = false;
  }
}

// -------------------------------------------------------------------------
// TEST 1: Valid Jurisdiction & Verified Applicable Rule Pass
// -------------------------------------------------------------------------
console.log('Test 1: Valid Jurisdiction & Verified Rule Evaluation...');
const regState1 = initializeProjectRegulations(baseProject);
const summary1 = evaluateProjectRegulations(baseProject, regState1);

assert(summary1.profile.country === 'United States', 'Test 1.1', 'Profile country initialized');
assert(summary1.counts.pass >= 6, 'Test 1.2', `${summary1.counts.pass} rules evaluated as Pass`);

const habitableAreaCheck = summary1.evaluations.find((e) => e.requirementId === 'req-habitable-room-min-area');
assert(habitableAreaCheck?.status === 'pass', 'Test 1.3', 'Habitable room min area passes (all >= 70 sq ft, primary 440 sq ft >= 120 sq ft)');

// -------------------------------------------------------------------------
// TEST 2: Missing Jurisdiction Information Handling
// -------------------------------------------------------------------------
console.log('\nTest 2: Missing Jurisdiction Information Handling...');
const projectMissingJurisdiction: Project = {
  ...baseProject,
  regulations: {
    ...regState1,
    profile: {
      ...regState1.profile,
      country: '',
      ahj: '',
    },
  },
};
const evidenceMissingJurisdiction = generateProjectEvidenceRecords(projectMissingJurisdiction);
const jurisEvidence = evidenceMissingJurisdiction.records.find((r) => r.id === 'ev-reg-jurisdiction-profile');

assert(jurisEvidence?.validationStatus === 'conflict', 'Test 2.1', 'Missing jurisdiction triggers conflict in evidence ledger');
assert(jurisEvidence?.resultValue === 'JURISDICTION UNKNOWN', 'Test 2.2', 'Explicitly records JURISDICTION UNKNOWN');

// -------------------------------------------------------------------------
// TEST 3: Missing or Invalid Project Measurements
// -------------------------------------------------------------------------
console.log('\nTest 3: Missing or Invalid Project Measurements...');
const projectZeroPlot: Project = {
  ...baseProject,
  plotWidth: 0,
  plotLength: 0,
};
const summaryZeroPlot = evaluateProjectRegulations(projectZeroPlot);
const lotCovZero = summaryZeroPlot.evaluations.find((e) => e.requirementId === 'req-max-lot-coverage');
const frontSetbackZero = summaryZeroPlot.evaluations.find((e) => e.requirementId === 'req-front-setback');

assert(lotCovZero?.status === 'insufficient-data', 'Test 3.1', 'Lot coverage with 0 plot returns insufficient-data');
assert(frontSetbackZero?.status === 'insufficient-data', 'Test 3.2', 'Setback check with 0 plot returns insufficient-data');

// -------------------------------------------------------------------------
// TEST 4: Verified Numeric Requirement That Passes
// -------------------------------------------------------------------------
console.log('\nTest 4: Verified Numeric Requirement That Passes...');
// Ground footprint = (20*22) + (14*18) + (8*10) = 440 + 252 + 80 = 772 sq ft.
// Plot area = 6,000 sq ft. Ratio = 772 / 6,000 = 12.9% <= 50%
const lotCovPass = summary1.evaluations.find((e) => e.requirementId === 'req-max-lot-coverage');
assert(lotCovPass?.status === 'pass', 'Test 4.1', `Lot coverage ratio ${lotCovPass?.measuredValue} <= 50%`);
assert(lotCovPass?.measuredValue === '12.9%', 'Test 4.2', 'Exact deterministic ratio 12.9% calculated');

// -------------------------------------------------------------------------
// TEST 5: Verified Numeric Requirement That Conflicts
// -------------------------------------------------------------------------
console.log('\nTest 5: Verified Numeric Requirement That Conflicts with Measurements...');
// Intentionally violate front setback (setback required is 15 ft; place room at y = 5 ft)
const projectSetbackViolation: Project = {
  ...baseProject,
  floorPlan: {
    rooms: [
      {
        id: 'r-encroach',
        name: 'Encroaching Living Room',
        type: 'living',
        x: 10,
        y: 5, // Encroaches into 15 ft setback by 10 ft!
        width: 25,
        length: 25,
        floorLevel: 1,
      },
    ],
  },
};
const summaryConflict = evaluateProjectRegulations(projectSetbackViolation);
const frontConflict = summaryConflict.evaluations.find((e) => e.requirementId === 'req-front-setback');

assert(frontConflict?.status === 'conflict', 'Test 5.1', 'Setback encroachment correctly flagged as conflict');
assert(Boolean(frontConflict?.statusReason.includes('violating the required 15')), 'Test 5.2', 'Conflict message explains violation distance');

// -------------------------------------------------------------------------
// TEST 6: Unverified or Superseded Source Handling
// -------------------------------------------------------------------------
console.log('\nTest 6: Unverified or Superseded Source Handling...');
const projectUnverifiedSource: Project = {
  ...baseProject,
  regulations: {
    ...regState1,
    sources: regState1.sources.map((s) =>
      s.id === 'src-irc-2021' ? { ...s, verificationStatus: 'unverified' as const } : s
    ),
  },
};
const summaryUnverified = evaluateProjectRegulations(projectUnverifiedSource);
const unverifiedRuleEval = summaryUnverified.evaluations.find((e) => e.requirementId === 'req-habitable-room-min-area');

assert(unverifiedRuleEval?.status === 'unverified-rule', 'Test 6.1', 'Rule with unverified source produces unverified-rule status');
assert(Boolean(unverifiedRuleEval?.actionNeeded.includes('Verify authoritative legal adoption')), 'Test 6.2', 'Directs user to verify source adoption');

// -------------------------------------------------------------------------
// TEST 7: Rule Requiring Professional Interpretation
// -------------------------------------------------------------------------
console.log('\nTest 7: Rule Requiring Professional Interpretation...');
const structuralEval = summary1.evaluations.find((e) => e.requirementId === 'req-structural-engineer-review');
const geotechEval = summary1.evaluations.find((e) => e.requirementId === 'req-geotech-soil-investigation');

assert(structuralEval?.status === 'needs-review', 'Test 7.1', 'Structural review produces needs-review status');
assert(geotechEval?.status === 'needs-review', 'Test 7.2', 'Geotechnical investigation produces needs-review status');
assert(Boolean(structuralEval?.actionNeeded.includes('structural engineer')), 'Test 7.3', 'Refers to licensed structural engineer');

// -------------------------------------------------------------------------
// TEST 8: Reviewer Decision & Variance Recording
// -------------------------------------------------------------------------
console.log('\nTest 8: Reviewer Decision & Variance Recording...');
const projectWithDecision = addReviewerDecision(baseProject, {
  requirementId: 'req-rear-setback',
  decision: 'accepted-with-conditions',
  notes: 'Zoning variance granted by City Board of Adjustment under Resolution 2026-B-14.',
  reviewer: 'Jane Doe, AIA',
});

const regDecisions = projectWithDecision.regulations?.reviewerDecisions || [];
assert(regDecisions.length === 1, 'Test 8.1', 'Reviewer decision recorded in project state');
assert(regDecisions[0].decision === 'accepted-with-conditions', 'Test 8.2', 'Variance decision type preserved');

// -------------------------------------------------------------------------
// TEST 9: Project Geometry Change Invalidating Previous Assessment (Staleness)
// -------------------------------------------------------------------------
console.log('\nTest 9: Geometry Change Invalidating Assessment (Staleness)...');
// Snapshot assessment at current geometry
const projectSnapshot = recordProjectRegulatoryAssessment(baseProject, summary1);
assert(!evaluateProjectRegulations(projectSnapshot).isStale, 'Test 9.1', 'Fresh assessment is not stale');

// Modify room width in floor plan
const projectModifiedGeom: Project = {
  ...projectSnapshot,
  floorPlan: {
    rooms: [
      ...projectSnapshot.floorPlan!.rooms,
      {
        id: 'r-new-ext',
        name: 'New Extension',
        type: 'living',
        x: 10,
        y: 10,
        width: 15,
        length: 15,
        floorLevel: 1,
      },
    ],
  },
};
const summaryStale = evaluateProjectRegulations(projectModifiedGeom);
assert(summaryStale.isStale, 'Test 9.2', 'Assessment correctly flagged as stale after geometry edit');
assert(summaryStale.staleReasons.length > 0, 'Test 9.3', 'Staleness reason recorded');

// -------------------------------------------------------------------------
// TEST 10: Source Edition Change Tracking
// -------------------------------------------------------------------------
console.log('\nTest 10: Source Edition Change Tracking...');
const projectNewSourceEdition = addRegulatorySource(baseProject, {
  ...DEFAULT_REGULATORY_SOURCES[0],
  edition: '2024 Edition (Published Oct 2023)',
  lastReviewedDate: '2026-03-01',
});
const summaryNewEdition = evaluateProjectRegulations(projectNewSourceEdition);
const updatedSourceEval = summaryNewEdition.evaluations.find((e) => e.requirementId === 'req-habitable-room-min-area');
assert(updatedSourceEval?.sourceVersion === '2024 Edition (Published Oct 2023)', 'Test 10.1', 'Updated source edition reflected in evaluation record');

// -------------------------------------------------------------------------
// TEST 11: Persistence & Assessment History
// -------------------------------------------------------------------------
console.log('\nTest 11: Persistence & Assessment History...');
let persistentProj = recordProjectRegulatoryAssessment(baseProject, summary1);
persistentProj = recordProjectRegulatoryAssessment(persistentProj, summary1);

assert((persistentProj.regulations?.history?.length || 0) === 2, 'Test 11.1', 'History snapshots persisted across multiple runs');
assert(persistentProj.regulations?.lastEvaluatedGeometryHash === summary1.geometryHash, 'Test 11.2', 'Last evaluated geometry hash preserved');

// -------------------------------------------------------------------------
// TEST 12: Proof-Carrying Evidence Ledger Integration (Section 10)
// -------------------------------------------------------------------------
console.log('\nTest 12: Evidence Ledger Integration (Section 10)...');
const evidenceAudit = generateProjectEvidenceRecords(baseProject);
const regRecords = evidenceAudit.records.filter((r) => r.module === 'regulatory-intelligence');

assert(regRecords.length >= 4, 'Test 12.1', `${regRecords.length} regulatory records found in Section 10 of Evidence Ledger`);
const lotCovEv = regRecords.find((r) => r.id === 'ev-reg-lot-coverage-compliance');
assert(lotCovEv?.validationStatus === 'pass', 'Test 12.2', 'Statutory lot coverage evidence record is Pass');
const setbackEv = regRecords.find((r) => r.id === 'ev-reg-setbacks-compliance');
assert(setbackEv?.resultValue === 'ALL CLEAR', 'Test 12.3', 'Setback compliance evidence record is ALL CLEAR');

// -------------------------------------------------------------------------
// TEST 13: Invalid Input Handling & Error States
// -------------------------------------------------------------------------
console.log('\nTest 13: Invalid Input Handling & Error States...');
const projectEmptyPlan: Project = {
  ...baseProject,
  floorPlan: { rooms: [] },
};
const summaryEmpty = evaluateProjectRegulations(projectEmptyPlan);
assert(summaryEmpty.counts.insufficientData >= 2, 'Test 13.1', 'Empty floor plan returns insufficient-data for spatial rules without throwing');

// -------------------------------------------------------------------------
// TEST 14: Brief Space Program vs Regulatory Minimum Comparison
// -------------------------------------------------------------------------
console.log('\nTest 14: Brief Space Program vs Regulatory Minimum Comparison...');
const briefWithTinyBedroom = initializeProjectBrief(baseProject);
briefWithTinyBedroom.spaces = [
  ...briefWithTinyBedroom.spaces,
  {
    id: 'sp-tiny-bed',
    name: 'Micro Storage Pod (Assumed Bedroom)',
    category: 'sleeping',
    targetArea: 50, // 50 sq ft is < 70 sq ft statutory minimum!
    quantity: 1,
    floorPreference: 1,
    priority: 'high-priority',
    privacyLevel: 'private',
    naturalLightRequired: true,
    plumbingRequired: false,
    outdoorAccessRequired: false,
    acousticPrivacyRequired: true,
    wheelchairAccessible: true,
  },
];
const briefNotices = validateBrief(baseProject, briefWithTinyBedroom);
const regBriefNotice = briefNotices.find((n) => n.type === 'regulatory-code-notice');

assert(Boolean(regBriefNotice), 'Test 14.1', 'validateBrief detects space target below IRC R304.1 minimum');
assert(regBriefNotice?.severity === 'conflict', 'Test 14.2', 'Flagged as conflict severity');

// -------------------------------------------------------------------------
// TEST 15: Cross-Module Integrations (Constraint Graph, Twin, Documentation)
// -------------------------------------------------------------------------
console.log('\nTest 15: Cross-Module Integrations...');
// 15.1 Living Constraint Graph
const constraintGraph = evaluateConstraintGraph(baseProject);
const regConstraints = constraintGraph.constraints.filter((c) => c.category === 'regulatory-compliance');
assert(regConstraints.length >= 2, 'Test 15.1', `${regConstraints.length} regulatory constraints active in Living Constraint Graph`);

// 15.2 Architectural Decision Twin
const twinState = evaluateDecisionTwin(baseProject);
const twinRegNode = twinState.nodes['regulatory-compliance'];
assert(Boolean(twinRegNode), 'Test 15.2', 'regulatory-compliance node present in Decision Twin');
assert(twinRegNode.status === 'current', 'Test 15.3', 'Decision Twin regulatory node status is current');

// 15.3 Documentation CSV & Markdown Exporters
const csvExport = generateRegulatoryComplianceCSV(baseProject, summary1);
assert(csvExport.includes('req-front-setback'), 'Test 15.4', 'Regulatory compliance CSV exporter functional');
const dossierMarkdown = generateDocumentMarkdown(baseProject, 'complete-dossier');
assert(dossierMarkdown.includes('Building Regulations Intelligence & Statutory Code Pre-Check'), 'Test 15.5', 'Complete Dossier includes Section 6 Regulatory Assessment');

console.log('\n================================================================');
if (allPassed) {
  console.log('ALL 15 ACCEPTANCE TESTS FOR PROMPT 13 REGULATORY ENGINE PASSED (100%)');
} else {
  console.error('SOME ACCEPTANCE TESTS FAILED. CHECK LOGS ABOVE.');
}
console.log('================================================================');

if (!allPassed) {
  process.exit(1);
}
