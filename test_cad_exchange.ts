/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * P42 — CAD Drawing Exchange Verification Suite
 */

// Mock localStorage for Node.js CLI execution so snapshot & storage services persist
if (typeof globalThis.localStorage === 'undefined') {
  const memoryStore = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => (memoryStore.has(key) ? memoryStore.get(key)! : null),
    setItem: (key: string, value: string) => {
      memoryStore.set(key, String(value));
    },
    removeItem: (key: string) => {
      memoryStore.delete(key);
    },
    clear: () => {
      memoryStore.clear();
    },
    key: (index: number) => Array.from(memoryStore.keys())[index] ?? null,
    get length() {
      return memoryStore.size;
    },
  };
}

import assert from 'assert';
import {
  getSupportedCADProfile,
  detectCADFileSignature,
  checkPolygonGeometry,
  parseDXFToDrawingModel,
  parseDXFAsync,
  buildDefaultLayerMappingRules,
  mapCADDrawingToPlotify,
  buildNewProjectFromCADMapping,
  applyCADMappingToExistingProject,
  validateDXFFileStructure,
  exportProjectToDXF,
  compareCADRoundTrip,
  SAMPLE_CAD_FIXTURES,
  SAMPLE_DXF_METRIC_COURTYARD_PLAN,
  SAMPLE_DXF_UNITLESS_MILLIMETRE_STUDIO,
} from './src/services/cadService';
import {
  parseIFCToIntermediateModel,
  mapIFCIntermediateToPlotify,
  applyIFCMappingToExistingProject,
  exportProjectToIFC,
  SAMPLE_IFC_FIXTURES,
} from './src/services/ifcService';
import { INITIAL_SAMPLE_PROJECTS } from './src/services/storage';
import { getProjectSnapshots } from './src/services/versioningService';

console.log('================================================================');
console.log('PLOTIFY P42 — CAD DRAWING EXCHANGE VERIFICATION SUITE');
console.log('================================================================\n');

async function runTests() {
  let passed = 0;

  // 1. Support profile honesty & explicit format matrices
  console.log('1. Verifying CAD Support Profile & Explicit DWG/DXF Format Boundaries...');
  const profile = getSupportedCADProfile();
  assert.strictEqual(profile.profileId, 'plotify-cad-exchange-p42-v1');
  assert(
    profile.fullySupportedFormats.some((f) => f.format.includes('ASCII DXF')),
    'ASCII DXF must be listed as fully supported'
  );
  assert(
    profile.recognizedButUnsupportedFormats.some((f) => f.format.includes('DWG')),
    'Binary DWG must explicitly state conversion required'
  );
  assert(profile.supportedEntityTypes.includes('LWPOLYLINE'), 'LWPOLYLINE must be supported');
  assert(profile.unsupportedEntityTypes.includes('HATCH'), 'HATCH must be listed as unsupported');
  passed++;
  console.log('   ✓ Support profile verified.');

  // 2. Binary DWG, Binary DXF, and IFC preflight signature detection
  console.log('2. Verifying Preflight Signature Detection (Binary DWG, Binary DXF, IFC Redirect)...');
  const dwgSig = detectCADFileSignature('site_plan.dwg', 'AC1032\x00\x00\x00BINARY_DWG');
  assert.strictEqual(dwgSig, 'DWG-BINARY-UNSUPPORTED');

  const dwgModel = parseDXFToDrawingModel({
    fileName: 'site_plan.dwg',
    fileSizeBytes: 64,
    rawContent: 'AC1032\x00\x00\x00BINARY_DWG',
  });
  assert.strictEqual(dwgModel.isValid, false);
  assert(dwgModel.errors.some((e) => e.code === 'DWG_CONVERSION_REQUIRED'));

  const binDxfModel = parseDXFToDrawingModel({
    fileName: 'binary_drawing.dxf',
    fileSizeBytes: 64,
    rawContent: 'AutoCAD Binary DXF\r\n\x1a\x00',
  });
  assert.strictEqual(binDxfModel.isValid, false);
  assert(binDxfModel.errors.some((e) => e.code === 'BINARY_DXF_UNSUPPORTED'));

  const ifcRedirectModel = parseDXFToDrawingModel({
    fileName: 'building.ifc',
    fileSizeBytes: 64,
    rawContent: 'ISO-10303-21;\nHEADER;\nENDSEC;',
  });
  assert.strictEqual(ifcRedirectModel.isValid, false);
  assert(ifcRedirectModel.errors.some((e) => e.code === 'IFC_FILE_USE_OPENBIM_WORKSPACE'));
  passed++;
  console.log('   ✓ Preflight signature detection and DWG/IFC guidance verified.');

  // 3. Metric Multi-Storey Courtyard DXF Import, Layer Inference, Block INSERT & Spatial Label Matching
  console.log('3. Verifying Metric Multi-Storey Courtyard DXF Parsing, BLOCK/INSERT & Spatial Label Matching...');
  const metricDrawing = await parseDXFAsync({
    fileName: SAMPLE_CAD_FIXTURES[0].fileName,
    fileSizeBytes: SAMPLE_DXF_METRIC_COURTYARD_PLAN.length,
    rawContent: SAMPLE_DXF_METRIC_COURTYARD_PLAN,
  });
  assert.strictEqual(metricDrawing.isValid, true);
  assert.strictEqual(metricDrawing.metadata.detectedUnit, 'METRE');
  assert.strictEqual(metricDrawing.metadata.hasExplicitUnits, true);
  assert(metricDrawing.layers.length >= 6, 'Should extract defined CAD layers');
  assert.strictEqual(metricDrawing.unsupportedEntityCounts['HATCH'], 1);
  assert.strictEqual(metricDrawing.unsupportedEntityCounts['SPLINE'], 1);

  const metricRules = buildDefaultLayerMappingRules(metricDrawing);
  const metricMapping = mapCADDrawingToPlotify(metricDrawing, metricRules, {
    effectiveSourceUnit: 'METRE',
    userConfirmedUnitWhenUnitless: true,
    scaleMultiplier: 1.0,
    targetPlotifyUnit: 'metres',
  });

  assert.strictEqual(metricMapping.success, true);
  assert.strictEqual(metricMapping.mappedProjectSpec.plotWidth, 22);
  assert.strictEqual(metricMapping.mappedProjectSpec.plotLength, 28);
  assert.strictEqual(metricMapping.mappedProjectSpec.floors, 2);
  assert.strictEqual(metricMapping.mappedRooms.length, 4, 'Should map 4 closed rectilinear rooms across F1 and F2');
  assert.strictEqual(metricMapping.mappedColumns.length, 2, 'Should map 1 LWPOLYLINE column + 1 expanded INSERT block CIRCLE column');
  assert.strictEqual(metricMapping.mappedGridAxes.length, 2, 'Should map 2 structural grid axes');
  assert.strictEqual(metricMapping.report.rejectedRoomCandidatesCount, 1, 'Open polyline #303 on A-AREA-F1 must be rejected from room creation');

  const roomNames = metricMapping.mappedRooms.map((r) => r.name);
  assert(roomNames.includes('Living Lounge'), 'Should match TEXT label "Living Lounge"');
  assert(roomNames.some((n) => n.includes('Chef Kitchen')), 'Should clean and match MTEXT label "Chef Kitchen"');
  assert(roomNames.includes('Primary Bedroom Suite'), 'Should match Floor 2 room label');
  passed++;
  console.log('   ✓ Metric DXF parsing, INSERT block expansion, and spatial label matching verified.');

  // 4. Unitless Drawing Detection & Explicit Calibration Enforcement
  console.log('4. Verifying Unitless Drawing ($INSUNITS=0) Detection & Explicit Scale Calibration...');
  const unitlessDrawing = parseDXFToDrawingModel({
    fileName: SAMPLE_CAD_FIXTURES[1].fileName,
    fileSizeBytes: SAMPLE_DXF_UNITLESS_MILLIMETRE_STUDIO.length,
    rawContent: SAMPLE_DXF_UNITLESS_MILLIMETRE_STUDIO,
  });
  assert.strictEqual(unitlessDrawing.isValid, true);
  assert.strictEqual(unitlessDrawing.metadata.detectedUnit, 'UNITLESS');
  assert.strictEqual(unitlessDrawing.metadata.hasExplicitUnits, false);
  assert(unitlessDrawing.warnings.some((w) => w.code === 'AMBIGUOUS_OR_MISSING_UNITS'));

  const unitlessRules = buildDefaultLayerMappingRules(unitlessDrawing);

  // Verify mapping refuses to proceed if userConfirmedUnitWhenUnitless is false
  const unconfirmedMapping = mapCADDrawingToPlotify(unitlessDrawing, unitlessRules, {
    effectiveSourceUnit: 'MILLIMETRE',
    userConfirmedUnitWhenUnitless: false,
    scaleMultiplier: 1.0,
    targetPlotifyUnit: 'metres',
  });
  assert.strictEqual(unconfirmedMapping.success, false, 'Must block mapping when unitless drawing unit is not confirmed');
  assert(unconfirmedMapping.report.errors.some((e) => e.code === 'UNIT_CONFIRMATION_REQUIRED'));

  // Now confirm unit as MILLIMETRE -> target metres (15000mm x 20000mm -> 15m x 20m)
  const confirmedMapping = mapCADDrawingToPlotify(unitlessDrawing, unitlessRules, {
    effectiveSourceUnit: 'MILLIMETRE',
    userConfirmedUnitWhenUnitless: true,
    scaleMultiplier: 1.0,
    targetPlotifyUnit: 'metres',
  });
  assert.strictEqual(confirmedMapping.success, true);
  assert.strictEqual(confirmedMapping.mappedProjectSpec.plotWidth, 15);
  assert.strictEqual(confirmedMapping.mappedProjectSpec.plotLength, 20);
  assert.strictEqual(confirmedMapping.mappedRooms.length, 2, 'Should map 2 valid rectangular rooms and reject the 6-vertex L-shaped polygon');
  assert.strictEqual(confirmedMapping.report.rejectedRoomCandidatesCount, 1, 'L-shaped polygon #24 must be flagged as non-rectilinear');
  passed++;
  console.log('   ✓ Unitless CAD detection, confirmation gate, and mm-to-metres calibration verified.');

  // 5. Self-Intersecting Polygon Check & User Entity Omission Controls
  console.log('5. Verifying Self-Intersecting Polygon Detection & User Entity Omission Controls...');
  const bowtieCheck = checkPolygonGeometry(
    [
      { x: 0, y: 0 },
      { x: 4, y: 4 },
      { x: 4, y: 0 },
      { x: 0, y: 4 },
    ],
    true
  );
  assert.strictEqual(bowtieCheck.isSelfIntersecting, true, 'Bowtie polygon must be flagged as self-intersecting');
  assert.strictEqual(bowtieCheck.isRectilinear, false);

  // Omit handle '20' from unitless studio mapping
  const omittedMapping = mapCADDrawingToPlotify(unitlessDrawing, unitlessRules, {
    effectiveSourceUnit: 'MILLIMETRE',
    userConfirmedUnitWhenUnitless: true,
    scaleMultiplier: 1.0,
    targetPlotifyUnit: 'metres',
    omittedEntityHandles: ['20'],
  });
  assert.strictEqual(omittedMapping.mappedRooms.length, 1, 'Omitted room handle #20 must be excluded from mappedRooms');
  passed++;
  console.log('   ✓ Self-intersection geometry validator and user entity omission verified.');

  // 6. Safe Application into Existing Project + P41 IFC Coexistence + Rollback Checkpoint
  console.log('6. Verifying Safe Application, Rollback Snapshot & Coexistence with P41 OpenBIM IFC...');
  const baseProject = JSON.parse(JSON.stringify(INITIAL_SAMPLE_PROJECTS[0]));

  // First apply a P41 IFC model to baseProject so it has active ifcInterop metadata
  const ifcFixture = SAMPLE_IFC_FIXTURES[0];
  const ifcModel = parseIFCToIntermediateModel({
    fileName: ifcFixture.fileName,
    fileSizeBytes: ifcFixture.content.length,
    rawContent: ifcFixture.content,
    targetUnit: baseProject.unit,
  });
  const ifcMapping = mapIFCIntermediateToPlotify(ifcModel, {
    targetUnit: baseProject.unit,
  });
  const { updatedProject: projectWithIFC } = applyIFCMappingToExistingProject(
    baseProject,
    ifcMapping,
    'merge-append'
  );
  assert(projectWithIFC.ifcInterop, 'Project must have P41 ifcInterop metadata');
  const ifcGlobalIdCountBefore = projectWithIFC.ifcInterop!.idMappings.length;

  const snapshotsBefore = getProjectSnapshots(projectWithIFC).length;

  // Now apply P42 CAD drawing to the same project in merge-append mode
  const { updatedProject: projectWithIFCandCAD, safetySnapshotId } =
    applyCADMappingToExistingProject(projectWithIFC, metricMapping, 'merge-append');

  assert(safetySnapshotId.length > 0, 'Must return a valid safetySnapshotId');
  const snapshotsAfter = getProjectSnapshots(projectWithIFCandCAD).length;
  assert(snapshotsAfter > snapshotsBefore, 'Snapshot history count must increase');

  // Verify P41 IFC metadata is 100% intact
  assert(projectWithIFCandCAD.ifcInterop, 'P41 ifcInterop metadata must remain intact');
  assert.strictEqual(
    projectWithIFCandCAD.ifcInterop!.idMappings.length,
    ifcGlobalIdCountBefore,
    'P41 IFC GlobalId mappings must not be lost when applying P42 CAD'
  );

  // Verify P42 CAD metadata is recorded
  assert(projectWithIFCandCAD.cadInterop, 'P42 cadInterop metadata must be recorded');
  assert(projectWithIFCandCAD.cadInterop!.provenanceMappings.length >= 6);
  assert.strictEqual(projectWithIFCandCAD.budget, baseProject.budget, 'Budget must be preserved');

  // Verify P41 IFC Export still passes on the combined project
  const ifcExportAfterCAD = exportProjectToIFC(projectWithIFCandCAD);
  assert.strictEqual(ifcExportAfterCAD.report.validationResult.isValid, true, 'P41 IFC export must still pass after CAD import');
  passed++;
  console.log('   ✓ Safe application, safety snapshot, and P41 IFC + P42 CAD coexistence verified.');

  // 7. Deterministic ASCII DXF Export, Independent Validation & Round-Trip Verification
  console.log('7. Verifying Deterministic ASCII DXF Export, Structural Validation & Round-Trip...');
  const newCadProjectPayload = buildNewProjectFromCADMapping(metricMapping, 'USD');
  const fullCadProject = {
    ...newCadProjectPayload,
    id: 'test-cad-rt-01',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const dxfExport = exportProjectToDXF(fullCadProject, { exportUnit: 'METRE' });
  assert.strictEqual(dxfExport.report.validationResult.isValid, true, 'Generated DXF must pass all independent structural checks');
  assert.strictEqual(dxfExport.report.exportedCounts.roomPolylines, 4);
  assert.strictEqual(dxfExport.report.exportedCounts.columns, 2);

  const independentCheck = validateDXFFileStructure(dxfExport.dxfContent);
  assert.strictEqual(independentCheck.isValid, true);

  const roundTrip = compareCADRoundTrip(fullCadProject, { exportUnit: 'METRE' });
  assert.strictEqual(roundTrip.comparison.passed, true, 'Plotify -> DXF -> Plotify round-trip must pass');
  assert.strictEqual(roundTrip.comparison.roomCountMatch, true);
  assert.strictEqual(roundTrip.comparison.columnCountMatch, true);
  assert(roundTrip.comparison.maxDimensionDelta <= 0.05, `Max dimension drift (${roundTrip.comparison.maxDimensionDelta}) must be <= 0.05`);
  passed++;
  console.log('   ✓ Deterministic ASCII DXF export, structural validation, and round-trip verified.');

  console.log('\n================================================================');
  console.log(`✓ ALL ${passed}/${passed} P42 CAD DRAWING EXCHANGE TESTS PASSED`);
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('✗ P42 CAD Exchange test failed:', err);
  process.exit(1);
});
