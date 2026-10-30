import {
  getAvailableDocuments,
  generateRoomScheduleDocumentData,
  generateCostReportDocumentData,
  generateDesignSpecDocumentData,
  generateRoomScheduleCSV,
  generateCostEstimateCSV,
  generateDesignSpecCSV,
  generateEvidenceAuditCSV,
  generateDocumentMarkdown,
} from './src/services/documentationEngine';
import { Project } from './src/types/project';

console.log('================================================================');
console.log('PLOTIFY PROMPT 10: DOCUMENTATION & HANDOFF ENGINE TEST SUITE');
console.log('================================================================\n');

const testProject: Project = {
  id: 'proj-doc-test-01',
  name: 'Alpine Timber Residence',
  projectType: 'house',
  plotWidth: 60,
  plotLength: 90,
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
  budget: 500000,
  currency: 'USD',
  notes: 'Testing Documentation & Handoff Engine',
  status: 'Schematic Design',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  floorPlan: {
    rooms: [
      {
        id: 'r-1',
        name: 'Great Room',
        type: 'living',
        x: 5,
        y: 5,
        width: 20,
        length: 25,
        floorLevel: 1,
      },
      {
        id: 'r-2',
        name: 'Open Kitchen',
        type: 'kitchen',
        x: 30,
        y: 5,
        width: 15,
        length: 18,
        floorLevel: 1,
      },
      {
        id: 'r-3',
        name: 'Master Suite',
        type: 'bedroom',
        x: 5,
        y: 5,
        width: 18,
        length: 22,
        floorLevel: 2,
      },
    ],
    gridSnap: 0.5,
    showGrid: true,
  },
};

// -------------------------------------------------------------------------
// TEST 1: Available Documents & Metadata Registry
// -------------------------------------------------------------------------
console.log('Test 1: Available Documents Registry...');
const docs = getAvailableDocuments(testProject);
if (docs.length !== 5) {
  throw new Error(`Test 1 Failed: Expected 5 document types, got ${docs.length}`);
}
console.log(`✓ Test 1 Passed: Identified ${docs.length} official document types with full metadata.`);

// -------------------------------------------------------------------------
// TEST 2: Room Schedule & Area Separation
// -------------------------------------------------------------------------
console.log('\nTest 2: Room Schedule Area Calculations & Distinctions...');
const roomData = generateRoomScheduleDocumentData(testProject);
// r1: 20*25=500, r2: 15*18=270, r3: 18*22=396 => total = 1166
if (roomData.totalMeasuredRoomArea !== 1166) {
  throw new Error(`Test 2 Failed: Expected 1166 sq ft total measured room area, got ${roomData.totalMeasuredRoomArea}`);
}
if (roomData.plotArea !== 5400) {
  throw new Error(`Test 2 Failed: Expected 5400 sq ft plot area, got ${roomData.plotArea}`);
}
// Ground floor: r1 (500) + r2 (270) = 770
if (roomData.groundFloorFootprint !== 770) {
  throw new Error(`Test 2 Failed: Expected 770 sq ft ground footprint, got ${roomData.groundFloorFootprint}`);
}
// Estimated gross built: 1166 * 1.12 = 1306
if (roomData.estimatedGrossBuiltArea !== 1306) {
  throw new Error(`Test 2 Failed: Expected 1306 sq ft gross built area, got ${roomData.estimatedGrossBuiltArea}`);
}
console.log('✓ Test 2 Passed: Net Room Usable Area, Ground Footprint, Gross Built Area, and Plot Area are calculated and distinguished.');

// -------------------------------------------------------------------------
// TEST 3: CSV Export Generation
// -------------------------------------------------------------------------
console.log('\nTest 3: Standards-Compliant CSV File Generation...');
const roomCsv = generateRoomScheduleCSV(testProject);
if (!roomCsv.includes('Floor Level,Room ID,Room Name') || !roomCsv.includes('Great Room') || !roomCsv.includes('1166')) {
  throw new Error('Test 3 Failed: Room Schedule CSV missing required headers or totals');
}

const costCsv = generateCostEstimateCSV(testProject);
if (!costCsv.includes('Item Code,Category') || !costCsv.includes('SUBTOTAL') || !costCsv.includes('ESTIMATED GRAND TOTAL')) {
  throw new Error('Test 3 Failed: Cost Estimate CSV missing structure');
}

const auditCsv = generateEvidenceAuditCSV(testProject);
if (!auditCsv.includes('Proof ID,Module,Category') || !auditCsv.includes('ev-geom-plot-area')) {
  throw new Error('Test 3 Failed: Evidence Audit CSV missing structure');
}
console.log('✓ Test 3 Passed: CSV files for Room Schedules, QTO Cost Tables, and Evidence Audits generate cleanly.');

// -------------------------------------------------------------------------
// TEST 4: Markdown Export Generation with Disclaimers
// -------------------------------------------------------------------------
console.log('\nTest 4: Markdown Architectural Dossier & Statutory Disclaimers...');
const summaryMd = generateDocumentMarkdown(testProject, 'project-summary');
if (!summaryMd.includes('ARCHITECTURAL PROJECT EXECUTIVE DOSSIER') || !summaryMd.includes('Mandatory Statutory & Professional Disclaimers')) {
  throw new Error('Test 4 Failed: Summary Markdown missing required dossier headers or disclaimers');
}

const roomMd = generateDocumentMarkdown(testProject, 'room-schedule');
if (!roomMd.includes('FLOOR-PLAN SPATIAL & ROOM SCHEDULE') || !roomMd.includes('MEASUREMENT DISTINCTION NOTE')) {
  throw new Error('Test 4 Failed: Room Schedule Markdown missing required distinction note');
}
console.log('✓ Test 4 Passed: Markdown reports contain consistent values and explicit statutory review disclaimers.');

// -------------------------------------------------------------------------
// TEST 5: Staleness Detection in Documentation
// -------------------------------------------------------------------------
console.log('\nTest 5: Document Freshness & Staleness Detection...');
const staleProject: Project = {
  ...testProject,
  costPlanning: {
    currency: 'USD',
    lastRecalculatedAt: new Date().toISOString(),
    lastGeometryHash: 'geom-outdated-hash-1234',
    targetBudget: 500000,
    activeScenarioId: 'scen-1',
    scenarios: [],
    phases: [],
  },
};
const staleDocs = getAvailableDocuments(staleProject);
const costDocMeta = staleDocs.find((d) => d.type === 'cost-estimate');
if (!costDocMeta || !costDocMeta.isStale || !costDocMeta.staleReason?.includes('modified')) {
  throw new Error('Test 5 Failed: Cost document failed to flag stale status when geometry hash mismatches');
}
console.log('✓ Test 5 Passed: Documentation engine detects stale source geometry and alerts user.');

console.log('\n================================================================');
console.log('ALL 5 ACCEPTANCE TESTS FOR DOCUMENTATION ENGINE PASSED (100%)');
console.log('================================================================');
