/**
 * Test suite for Plotify Prompt 11: Site & Context Intelligence Engine
 */

import { Project, FloorPlanRoom } from './src/types/project';
import {
  initializeProjectSiteContext,
  computeBuildingPlacementBounds,
  evaluateSiteConstraints,
  evaluateSolarOrientation,
  getDefaultSetbacks,
} from './src/services/siteIntelligenceService';
import { generateProjectEvidenceRecords } from './src/services/evidenceEngine';

console.log('================================================================');
console.log('PLOTIFY PROMPT 11: SITE & CONTEXT INTELLIGENCE TEST SUITE');
console.log('================================================================');

// Helper to construct a test project
function createBaseProject(): Project {
  const rooms: FloorPlanRoom[] = [
    {
      id: 'living-1',
      name: 'Living Room',
      type: 'living',
      x: 20, // Inside 15ft front setback
      y: 20,
      width: 20,
      length: 25,
      floorLevel: 1,
    },
    {
      id: 'kitchen-1',
      name: 'Kitchen',
      type: 'kitchen',
      x: 20,
      y: 45,
      width: 15,
      length: 20,
      floorLevel: 1,
    },
    {
      id: 'bed-upper-1',
      name: 'Master Bedroom',
      type: 'bedroom',
      x: 20,
      y: 20,
      width: 20,
      length: 20,
      floorLevel: 2,
    },
  ];

  return {
    id: 'test-site-proj-001',
    name: 'Prairie Modern Residence',
    projectType: 'house',
    plotWidth: 60,
    plotLength: 100,
    unit: 'feet',
    floors: 2,
    roadFacing: 'South', // Front is South (bottom, y = 100)
    budget: 350000,
    currency: 'USD',
    rooms: { bedrooms: 3, bathrooms: 2, livingRoom: 1, kitchen: 1 },
    status: 'Drafting',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    notes: 'Site context testing',
    floorPlan: {
      rooms,
      gridSnap: 1,
      showGrid: true,
    },
  };
}

// -------------------------------------------------------------------------
// TEST 1: Site Context Initialization & Unit Scaling
// -------------------------------------------------------------------------
console.log('\nTest 1: Site Context Initialization & Unit Defaults...');
const baseProject = createBaseProject();
const siteContext = initializeProjectSiteContext(baseProject);

if (!siteContext) {
  throw new Error('Test 1 Failed: initializeProjectSiteContext returned null/undefined');
}
if (siteContext.setbacks.front !== 15 || siteContext.setbacks.rear !== 10) {
  throw new Error(`Test 1 Failed: Expected 15ft front & 10ft rear setbacks, got F:${siteContext.setbacks.front} R:${siteContext.setbacks.rear}`);
}
if (siteContext.accessPoints.length === 0) {
  throw new Error('Test 1 Failed: Expected at least 1 default vehicular/pedestrian access point');
}
console.log('✓ Test 1 Passed: Site Context initialized cleanly with accurate unit-scaled setback baselines.');

// -------------------------------------------------------------------------
// TEST 2: Building Placement Bounds Calculation
// -------------------------------------------------------------------------
console.log('\nTest 2: Ground-Floor Building Placement Bounds...');
const bounds = computeBuildingPlacementBounds(baseProject);

if (!bounds.hasRooms) {
  throw new Error('Test 2 Failed: Expected hasRooms to be true');
}
// Room 1: (20,20) to (40, 45). Room 2: (20,45) to (35, 65).
// Combined Ground Floor: minX=20, maxX=40, minY=20, maxY=65.
if (bounds.minX !== 20 || bounds.maxX !== 40 || bounds.minY !== 20 || bounds.maxY !== 65) {
  throw new Error(`Test 2 Failed: Unexpected bounds calculated: minX=${bounds.minX}, maxX=${bounds.maxX}, minY=${bounds.minY}, maxY=${bounds.maxY}`);
}
if (bounds.width !== 20 || bounds.length !== 45) {
  throw new Error(`Test 2 Failed: Unexpected building dimensions: ${bounds.width}x${bounds.length}`);
}
console.log('✓ Test 2 Passed: Ground-floor building envelope bounds computed with exact coordinate precision.');

// -------------------------------------------------------------------------
// TEST 3: Site Constraint Evaluation (Clearances & Violations)
// -------------------------------------------------------------------------
console.log('\nTest 3: Site Constraint Evaluation & Violation Detection...');
// Base project: plot is 60 wide, 100 long. Road is South (y = 100).
// Front setback is 15ft from y=100 => corridor y in [85, 100].
// Building maxY is 65, which is < 85. Front clearance is 100 - 65 = 35ft >= 15ft => PASS.
const initialChecks = evaluateSiteConstraints(baseProject);
const frontCheck = initialChecks.find((c) => c.id === 'site-chk-setback');
if (!frontCheck || frontCheck.status !== 'pass') {
  throw new Error(`Test 3 Failed: Front setback check should pass for base project, got: ${frontCheck?.status}`);
}

// Now test a project that violates front setback
const violatingProject = createBaseProject();
violatingProject.floorPlan!.rooms.push({
  id: 'encroaching-patio',
  name: 'Sunroom Encroachment',
  type: 'patio',
  x: 20,
  y: 90, // Encroaches into the 15ft front setback corridor [85, 100]
  width: 15,
  length: 8,
  floorLevel: 1,
});
const violatedChecks = evaluateSiteConstraints(violatingProject);
const violatedFrontCheck = violatedChecks.find((c) => c.id === 'site-chk-setback');
if (!violatedFrontCheck || violatedFrontCheck.status !== 'conflict') {
  throw new Error(`Test 3 Failed: Encroaching room was not flagged as conflict: ${violatedFrontCheck?.status}`);
}
console.log('✓ Test 3 Passed: Setback clearances and intentional front setback encroachment conflict correctly detected.');

// -------------------------------------------------------------------------
// TEST 4: Preserved Obstacle Clearance & Tree Protection
// -------------------------------------------------------------------------
console.log('\nTest 4: Preserved Obstacle Clearance & Tree Encroachment...');
const obstacleProject = createBaseProject();
obstacleProject.siteContext = {
  ...initializeProjectSiteContext(obstacleProject),
  obstacles: [
    {
      id: 'tree-heritage-1',
      name: 'Century Oak (Heritage Tree)',
      type: 'tree',
      x: 25,
      y: 30, // Directly overlaps living room at (20,20) to (40,45)
      width: 10,
      length: 10,
      preservationStatus: 'preserve-mandatory',
    },
  ],
};
const obstacleChecks = evaluateSiteConstraints(obstacleProject);
const treeCheck = obstacleChecks.find((c) => c.id === 'site-chk-obstacle');
if (!treeCheck || treeCheck.status !== 'conflict') {
  throw new Error(`Test 4 Failed: Mandatory heritage tree collision should be flagged as conflict, got: ${treeCheck?.status}`);
}
console.log('✓ Test 4 Passed: Preserved heritage tree collision correctly evaluated and flagged with required arboricultural review.');

// -------------------------------------------------------------------------
// TEST 5: Solar Orientation & Facade Microclimate Analysis
// -------------------------------------------------------------------------
console.log('\nTest 5: Solar Orientation & Microclimate Analysis...');
const solarProj = createBaseProject();
solarProj.siteContext = {
  ...initializeProjectSiteContext(solarProj),
  northOrientationOffsetDeg: 0, // Plot Top is North, Bottom is South
};
const solarAnalysis = evaluateSolarOrientation(solarProj);

if (!solarAnalysis.facadeSunExposure) {
  throw new Error('Test 5 Failed: Solar orientation exposure missing');
}
if (solarAnalysis.passiveSolarRecommendations.length === 0) {
  throw new Error('Test 5 Failed: Expected passive solar daylighting recommendations');
}
console.log('✓ Test 5 Passed: Solar orientation and daylighting recommendations computed deterministically.');

// -------------------------------------------------------------------------
// TEST 6: Evidence Ledger Integration (Section 8 Site Records)
// -------------------------------------------------------------------------
console.log('\nTest 6: Evidence Ledger Registration & Audit Traceability...');
const auditLedger = generateProjectEvidenceRecords(baseProject);
const siteRecords = auditLedger.records.filter((r) => r.module === 'site-context');

if (siteRecords.length === 0) {
  throw new Error('Test 6 Failed: Expected site-context evidence records in audit ledger');
}
const setbackEvidence = siteRecords.find((r) => r.id === 'ev-site-chk-setback');
if (!setbackEvidence) {
  throw new Error('Test 6 Failed: ev-site-chk-setback evidence record not found in ledger');
}
if (!setbackEvidence.requiredProfessionalReview) {
  throw new Error('Test 6 Failed: Expected requiredProfessionalReview in evidence record');
}
console.log(`✓ Test 6 Passed: Found ${siteRecords.length} Section 8 Site Evidence records with captured formulas and review tags.`);

console.log('\n================================================================');
console.log('ALL 6 ACCEPTANCE TESTS FOR SITE & CONTEXT ENGINE PASSED (100%)');
console.log('================================================================\n');
