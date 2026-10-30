/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert';
import {
  getSupportedIFCProfile,
  parseIFCToIntermediateModel,
  parseIFCAsync,
  validateIntermediateModel,
  mapIFCIntermediateToPlotify,
  buildNewProjectFromIFCMapping,
  applyIFCMappingToExistingProject,
  exportProjectToIFC,
  validateIFCFileStructure,
  compareIFCRoundTrip,
  SAMPLE_IFC_FIXTURES,
  SAMPLE_IFC4_RESIDENTIAL_VILLA,
  SAMPLE_IFC2X3_IMPERIAL_STUDIO,
} from './src/services/ifcService';
import { INITIAL_SAMPLE_PROJECTS, saveProjects, loadProjects } from './src/services/storage';
import { getProjectSnapshots } from './src/services/versioningService';
import { validateFloorPlanFor3D, getDefaultViewerConfig } from './src/components/viewer3d/building3dGeometry';

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
    get length() {
      return Object.keys(store).length;
    },
  };
}

console.log('================================================================');
console.log('P41 — OPENBIM & IFC INTEROPERABILITY VERIFICATION SUITE');
console.log('================================================================\n');

async function runTests() {
  // 0. Profile Verification
  console.log('0. Verifying Honest IFC Support Profile...');
  const profile = getSupportedIFCProfile();
  assert.strictEqual(profile.profileId, 'plotify-openbim-profile-p41-v1');
  assert.ok(profile.supportedSchemas.includes('IFC2X3'));
  assert.ok(profile.supportedSchemas.includes('IFC4'));
  assert.ok(profile.supportedEntityTypes.includes('IFCSPACE'));
  assert.ok(profile.supportedEntityTypes.includes('IFCCOLUMN'));
  assert.ok(profile.partiallySupportedEntityTypes.some((e) => e.entityType.includes('IFCWALL')));
  assert.ok(profile.unsupportedEntityTypes.includes('IFCSTAIR'));
  console.log('   ✓ Honest IFC Support Profile verified.');

  // 1. Valid supported IFC fixture import
  console.log('1. Testing valid supported IFC4 fixture import...');
  const validFixture = SAMPLE_IFC_FIXTURES[0];
  const parsedValid = parseIFCToIntermediateModel({
    fileName: validFixture.fileName,
    fileSizeBytes: validFixture.content.length,
    rawContent: validFixture.content,
    targetUnit: 'metres',
  });
  assert.strictEqual(parsedValid.isValid, true, 'Valid IFC4 fixture should be valid');
  assert.strictEqual(parsedValid.errors.length, 0, 'Valid IFC4 fixture should have 0 fatal errors');
  assert.strictEqual(parsedValid.metadata.normalizedSchema, 'IFC4');
  console.log('   ✓ Valid IFC4 fixture parsed cleanly into IFCIntermediateModel.');

  // 2. Empty file rejection
  console.log('2. Testing empty file rejection...');
  const emptyRes = parseIFCToIntermediateModel({
    fileName: 'empty.ifc',
    fileSizeBytes: 0,
    rawContent: '   \n  ',
  });
  assert.strictEqual(emptyRes.isValid, false);
  assert.ok(
    emptyRes.errors.some((e) => e.code === 'FILE_EMPTY'),
    'Must reject empty file with FILE_EMPTY code'
  );
  console.log('   ✓ Empty file rejected with structured FILE_EMPTY error.');

  // 3. Non-IFC file rejection
  console.log('3. Testing non-IFC file rejection...');
  const nonIfcRes = parseIFCToIntermediateModel({
    fileName: 'document.json',
    fileSizeBytes: 42,
    rawContent: '{"hello": "world", "not": "an ifc file"}',
  });
  assert.strictEqual(nonIfcRes.isValid, false);
  assert.ok(
    nonIfcRes.errors.some((e) => e.code === 'INVALID_FILE_EXTENSION' || e.code === 'MALFORMED_STEP_HEADER'),
    'Must reject non-IFC file with structured error code'
  );
  console.log('   ✓ Non-IFC content rejected cleanly.');

  // 4. Truncated or malformed IFC file failure handling
  console.log('4. Testing truncated / malformed IFC file failure handling...');
  const truncatedIfc = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');
FILE_NAME('truncated.ifc','2026-03-10T10:00:00',('Arch'),('Firm'),'Pre','App','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCPROJECT('0YvctVUKr0kugbFTf53O9L',$,'Truncated Project',$,$,$,$,$,$);
`; // Missing ENDSEC; and END-ISO-10303-21;
  const truncatedRes = parseIFCToIntermediateModel({
    fileName: 'truncated.ifc',
    fileSizeBytes: truncatedIfc.length,
    rawContent: truncatedIfc,
  });
  assert.strictEqual(truncatedRes.isValid, false);
  assert.ok(
    truncatedRes.errors.some((e) => e.code === 'TRUNCATED_STEP_FILE'),
    'Must reject truncated file missing END-ISO-10303-21;'
  );
  console.log('   ✓ Truncated IFC file safely rejected with TRUNCATED_STEP_FILE error.');

  // 5. Unsupported IFC schema version rejection
  console.log('5. Testing unsupported IFC schema version rejection...');
  const ifc4x3Content = validFixture.content.replace("FILE_SCHEMA(('IFC4'));", "FILE_SCHEMA(('IFC4X3_ADD2'));");
  const unsupportedSchemaRes = parseIFCToIntermediateModel({
    fileName: 'bridge_ifc4x3.ifc',
    fileSizeBytes: ifc4x3Content.length,
    rawContent: ifc4x3Content,
  });
  assert.strictEqual(unsupportedSchemaRes.isValid, false);
  assert.ok(
    unsupportedSchemaRes.errors.some((e) => e.code === 'UNSUPPORTED_SCHEMA'),
    'Must reject unsupported IFC4X3_ADD2 schema with UNSUPPORTED_SCHEMA error'
  );
  console.log('   ✓ Unsupported schema (IFC4X3_ADD2) rejected cleanly.');

  // 6. Unit detection and conversion into Plotify project units (MILLIMETRE & FOOT -> metres & feet)
  console.log('6. Testing unit detection and conversion (MILLIMETRE & FOOT -> metres & feet)...');
  const mmContent = SAMPLE_IFC4_RESIDENTIAL_VILLA
    .replace("#6 = IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);", "#6 = IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);")
    .replace("IFCRECTANGLEPROFILEDEF(.AREA.,'LivingRoomProfile',#44,7.0,8.0);", "IFCRECTANGLEPROFILEDEF(.AREA.,'LivingRoomProfile',#44,7000.0,8000.0);");
  const parsedMm = parseIFCToIntermediateModel({
    fileName: 'mm_test.ifc',
    fileSizeBytes: mmContent.length,
    rawContent: mmContent,
    targetUnit: 'metres',
  });
  assert.strictEqual(parsedMm.isValid, true);
  assert.strictEqual(parsedMm.metadata.sourceLengthUnit, 'MILLIMETRE');
  assert.strictEqual(parsedMm.metadata.sourceLengthToMetresFactor, 0.001);

  const mappedFromMm = mapIFCIntermediateToPlotify(parsedMm, { targetUnit: 'metres' });
  const livingFromMm = mappedFromMm.mappedRooms.find((r) => r.name === 'Main Living Lounge' || r.name === 'SP-101');
  assert.ok(livingFromMm);
  assert.strictEqual(livingFromMm.width, 7.0); // 7000 mm -> 7.0 m
  assert.strictEqual(livingFromMm.length, 8.0); // 8000 mm -> 8.0 m

  // Also test IFC2X3 Imperial FOOT fixture converted to metres and feet
  const parsedImperial = parseIFCToIntermediateModel({
    fileName: 'coastal-pavilion-ifc2x3.ifc',
    fileSizeBytes: SAMPLE_IFC2X3_IMPERIAL_STUDIO.length,
    rawContent: SAMPLE_IFC2X3_IMPERIAL_STUDIO,
  });
  assert.strictEqual(parsedImperial.metadata.sourceLengthUnit, 'FOOT');
  const mappedImperialToFeet = mapIFCIntermediateToPlotify(parsedImperial, { targetUnit: 'feet' });
  assert.strictEqual(mappedImperialToFeet.mappedRooms[0].width, 14);
  assert.strictEqual(mappedImperialToFeet.mappedRooms[0].length, 18);

  const mappedImperialToMetres = mapIFCIntermediateToPlotify(parsedImperial, { targetUnit: 'metres' });
  assert.ok(Math.abs(mappedImperialToMetres.mappedRooms[0].width - 4.27) < 0.05, '14 ft should convert to ~4.27 m');
  console.log('   ✓ MILLIMETRE and FOOT unit detection and conversion to metres and feet verified.');

  // 7. Spatial hierarchy extraction (IfcProject, IfcSite, IfcBuilding, IfcBuildingStorey, IfcSpace)
  console.log('7. Testing spatial hierarchy extraction...');
  assert.ok(parsedValid.spatialHierarchy.project, 'IfcProject root must be identified');
  assert.ok(parsedValid.spatialHierarchy.site, 'IfcSite must be extracted');
  assert.ok(parsedValid.spatialHierarchy.building, 'IfcBuilding must be extracted');
  assert.strictEqual(parsedValid.spatialHierarchy.storeys.length, 2, '2 IfcBuildingStoreys must be extracted');
  assert.strictEqual(parsedValid.spatialHierarchy.storeys[0].mappedFloorLevel, 1);
  assert.strictEqual(parsedValid.spatialHierarchy.storeys[1].mappedFloorLevel, 2);
  assert.strictEqual(parsedValid.spatialHierarchy.storeys[0].spaceStepIds.length, 3, 'Ground floor has 3 spaces');
  assert.strictEqual(parsedValid.spatialHierarchy.storeys[1].spaceStepIds.length, 2, 'Upper floor has 2 spaces');
  console.log('   ✓ Spatial hierarchy (IfcProject -> IfcSite -> IfcBuilding -> 2 Storeys -> 5 Spaces) verified.');

  // 8. Supported element mapping (Spaces, Columns, and Preserved Wall metadata)
  console.log('8. Testing supported element mapping and read-only metadata preservation...');
  const mappedValid = mapIFCIntermediateToPlotify(parsedValid, { targetUnit: 'metres' });
  assert.strictEqual(mappedValid.mappedRooms.length, 5, 'All 5 rectangular IfcSpaces must map to FloorPlanRooms');
  assert.strictEqual(mappedValid.mappedColumns.length, 2, 'Both IfcColumns must map to StructuralColumns');
  assert.strictEqual(mappedValid.report.readOnlyWallsCount, 1, 'IfcWallStandardCase must be counted in readOnlyWallsCount');
  assert.ok(
    mappedValid.interopMetadata.preservedElements.some(
      (e) => e.ifcType === 'IFCWALLSTANDARDCASE' && e.preservationStatus === 'imported-not-editable'
    ),
    'IfcWallStandardCase must be preserved in interopMetadata.preservedElements'
  );
  console.log('   ✓ 5 Spaces, 2 Columns, and read-only Wall metadata preservation verified.');

  // 9. Unsupported entity and unsupported B-Rep geometry reporting without crashing
  console.log('9. Testing unsupported entity (IfcStair) and B-Rep geometry reporting...');
  assert.strictEqual(
    mappedValid.report.unsupportedEntityBreakdown['IFCSTAIR'],
    1,
    'IfcStair in fixture 1 must be counted in unsupportedEntityBreakdown'
  );
  // Test IfcFacetedBrep geometry is flagged and never fabricated into a fake room
  const brepIfc = SAMPLE_IFC2X3_IMPERIAL_STUDIO.replace(
    "#36 = IFCEXTRUDEDAREASOLID(#35,#15,#12,10.);",
    "#36 = IFCFACETEDBREP(#35);"
  );
  const parsedBrep = parseIFCToIntermediateModel({
    fileName: 'brep_space.ifc',
    fileSizeBytes: brepIfc.length,
    rawContent: brepIfc,
  });
  const mappedBrep = mapIFCIntermediateToPlotify(parsedBrep);
  assert.strictEqual(
    mappedBrep.mappedRooms.length,
    1,
    'Space with IfcFacetedBrep must NOT fabricate a fake rectangular room; only the 1 valid space should map'
  );
  assert.ok(
    mappedBrep.report.warnings.some((w) => w.code === 'UNSUPPORTED_GEOMETRY'),
    'IfcFacetedBrep must emit an UNSUPPORTED_GEOMETRY warning'
  );
  console.log('   ✓ Unsupported entities and IfcFacetedBrep geometry reported honestly without fabrication.');

  // 10. Source IFC ID and Plotify ID separation
  console.log('10. Testing Source IFC GlobalId and Plotify internal ID separation...');
  for (const room of mappedValid.mappedRooms) {
    assert.ok(room.id.startsWith('room-ifc-'), `Plotify room ID must use Plotify namespace: ${room.id}`);
    const idMap = mappedValid.idMappings.find((m) => m.plotifyEntityId === room.id);
    assert.ok(idMap, `ID mapping record must exist for mapped room ${room.id}`);
    assert.ok(idMap.sourceGlobalId && idMap.sourceGlobalId.length > 0, 'Source IFC GlobalId must be preserved separately');
    assert.notStrictEqual(room.id, idMap.sourceGlobalId, 'Plotify ID and IFC GlobalId must be distinct fields');
  }
  console.log('   ✓ Source IFC GlobalIds and Plotify internal IDs are cleanly separated.');

  // 11. Import report counts matching parsed input
  console.log('11. Testing import report count accuracy...');
  const rep = mappedValid.report;
  assert.strictEqual(rep.totalStepEntitiesEncountered, parsedValid.totalRawStepEntities);
  assert.strictEqual(rep.mappedSpacesCount, 5);
  assert.strictEqual(rep.mappedStoreysCount, 2);
  assert.strictEqual(rep.mappedColumnsCount, 2);
  assert.strictEqual(rep.entitiesSkippedOrUnsupported, 1); // 1 IFCSTAIR
  console.log('   ✓ Import report counts match parsed STEP input.');

  // 12. Creating a new Plotify project from valid imported data
  console.log('12. Testing creation of a new Plotify project from IFC mapping...');
  const newProjectData = buildNewProjectFromIFCMapping(mappedValid, 'USD');
  assert.strictEqual(newProjectData.name, 'Nordic Courtyard Villa');
  assert.strictEqual(newProjectData.floors, 2);
  assert.strictEqual(newProjectData.plotWidth, 20);
  assert.strictEqual(newProjectData.plotLength, 26);
  assert.strictEqual(newProjectData.floorPlan?.rooms.length, 5);
  assert.strictEqual(newProjectData.structuralCoordination?.columns.length, 2);
  assert.ok(newProjectData.ifcInterop?.lastImportReport);
  console.log('   ✓ New Plotify project constructed with rooms, columns, and IFC provenance.');

  // 13. Applying imported data to an existing project without losing unrelated project data
  console.log('13. Testing safe application to an existing project with automatic rollback snapshot...');
  const baseProject = JSON.parse(JSON.stringify(INITIAL_SAMPLE_PROJECTS[0]));
  const originalSiteObstacles = baseProject.siteContext?.obstacles?.length || 0;
  const originalBudget = baseProject.budget;
  const snapshotsBefore = getProjectSnapshots(baseProject).length;

  const { updatedProject, safetySnapshotId } = applyIFCMappingToExistingProject(
    baseProject,
    mappedValid,
    'merge-append'
  );

  const snapshotsAfter = getProjectSnapshots(updatedProject).length;
  assert.ok(safetySnapshotId && safetySnapshotId.length > 0, 'A pre-import safety snapshot ID must be returned');
  assert.strictEqual(snapshotsAfter, snapshotsBefore + 1, 'Snapshot history must increment by 1');
  assert.strictEqual(updatedProject.budget, originalBudget, 'Existing project budget must be preserved');
  assert.strictEqual(
    updatedProject.siteContext?.obstacles?.length || 0,
    originalSiteObstacles,
    'Unrelated siteContext obstacles must be preserved'
  );
  assert.ok(
    (updatedProject.floorPlan?.rooms.length || 0) >=
      (baseProject.floorPlan?.rooms.length || 0) + mappedValid.mappedRooms.length,
    'Merged floorPlan must retain existing rooms plus imported IFC spaces'
  );
  console.log('   ✓ Safe merge into existing project preserved unrelated domains and created rollback checkpoint.');

  // 14. Persistence and reload of imported project data and import report
  console.log('14. Testing local persistence and reload of IFC-imported project...');
  const existingProjects = loadProjects();
  saveProjects([updatedProject, ...existingProjects.filter((p) => p.id !== updatedProject.id)]);
  const reloadedProjects = loadProjects();
  const reloaded = reloadedProjects.find((p) => p.id === updatedProject.id);
  assert.ok(reloaded, 'Reloaded project must exist in storage');
  assert.ok(reloaded.ifcInterop?.lastImportReport, 'Reloaded project must retain ifcInterop.lastImportReport');
  assert.strictEqual(
    reloaded.ifcInterop?.idMappings.length,
    updatedProject.ifcInterop?.idMappings.length,
    'Reloaded project must retain all idMappings'
  );
  console.log('   ✓ Persistence and reload of IFC provenance and import report verified.');

  // 15. Rendering / 3D scene consumption of imported geometry
  console.log('15. Testing 3D geometry validation & pipeline consumption of imported IFC project...');
  const fullNewProject = {
    ...newProjectData,
    id: 'test-ifc-3d-project',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const config3d = getDefaultViewerConfig(fullNewProject.unit);
  assert.strictEqual(config3d.wallHeight, 3.0);
  const geomValidation = validateFloorPlanFor3D(
    fullNewProject.floorPlan?.rooms || [],
    fullNewProject.plotWidth,
    fullNewProject.plotLength
  );
  assert.strictEqual(geomValidation.validRooms.length, 5, 'All 5 imported IFC spaces must pass 3D geometry validation');
  assert.strictEqual(geomValidation.invalidRooms.length, 0, '0 invalid rooms in 3D validation');
  assert.strictEqual(geomValidation.warnings.length, 0, 'All 5 imported spaces fit cleanly within plot boundaries');
  console.log('   ✓ 2D/3D geometry pipeline validates and consumes imported IFC spaces cleanly.');

  // 16. IFC export and independent structural validation
  console.log('16. Testing IFC4 STEP export and independent file structure validation...');
  const exportRes = exportProjectToIFC(fullNewProject, {
    schemaVersion: 'IFC4',
    includePerimeterWallsAndSlabs: true,
    includeStructuralElements: true,
    includePropertySets: true,
    includeBaseQuantities: true,
    authorName: 'Plotify Verification',
    organizationName: 'Plotify OpenBIM Lab',
  });
  assert.ok(exportRes.ifcContent.startsWith('ISO-10303-21;'), 'Exported IFC must start with ISO-10303-21;');
  assert.ok(exportRes.ifcContent.trim().endsWith('END-ISO-10303-21;'), 'Exported IFC must end with END-ISO-10303-21;');
  assert.strictEqual(exportRes.report.exportedCounts.spaces, 5);
  assert.strictEqual(exportRes.report.exportedCounts.columns, 2);
  assert.ok(
    exportRes.report.omittedPlotifyInformation.length > 0,
    'Export report must honestly list omitted Plotify-only domains'
  );

  const structuralValidation = validateIFCFileStructure(exportRes.ifcContent);
  assert.strictEqual(
    structuralValidation.isValid,
    true,
    'Exported IFC file must pass independent structural & reference validation'
  );
  assert.strictEqual(
    structuralValidation.unresolvedReferences.length,
    0,
    'Exported IFC file must have 0 unresolved #stepId references'
  );
  assert.strictEqual(
    structuralValidation.duplicateStepIds.length,
    0,
    'Exported IFC file must have 0 duplicate #stepIds'
  );
  console.log('   ✓ IFC4 STEP export and reference integrity validation passed.');

  // 17. Round-trip preservation of documented supported subset
  console.log('17. Testing round-trip preservation (Import -> Plotify -> Export IFC -> Re-Import)...');
  const roundTrip = compareIFCRoundTrip(fullNewProject, {
    schemaVersion: 'IFC4',
    includeStructuralElements: true,
    includePropertySets: true,
    includeBaseQuantities: true,
  });
  assert.strictEqual(roundTrip.comparison.passed, true, 'Round-trip comparison must pass with 0 unexpected discrepancies');
  assert.strictEqual(roundTrip.comparison.storeyCountMatch, true, 'Storey count preserved across round-trip');
  assert.strictEqual(roundTrip.comparison.spaceCountMatch, true, 'Space count and dimensions preserved across round-trip');
  assert.strictEqual(roundTrip.comparison.columnCountMatch, true, 'Column count and profiles preserved across round-trip');
  assert.strictEqual(
    roundTrip.comparison.preservedGlobalIdsMatched,
    roundTrip.comparison.totalGlobalIdsCompared,
    'All space GlobalIds preserved across round-trip'
  );
  console.log('   ✓ Round-trip preservation verified (5 spaces, 2 columns, 2 storeys, GlobalIds preserved).');

  // 18. Cancellation and duplicate-import protection
  console.log('18. Testing cancellation (AbortController) and duplicate-import lock protection...');
  const abortController = new AbortController();
  abortController.abort();
  const abortedRes = await parseIFCAsync({
    fileName: 'aborted.ifc',
    fileSizeBytes: validFixture.content.length,
    rawContent: validFixture.content,
    signal: abortController.signal,
  });
  assert.strictEqual(abortedRes.isValid, false);
  assert.ok(
    abortedRes.errors.some((e) => e.code === 'IMPORT_CANCELLED'),
    'Aborted import must return IMPORT_CANCELLED'
  );

  // Concurrent duplicate import protection for same requestId / fileName
  const [firstConcurrent, secondConcurrent] = await Promise.all([
    parseIFCAsync({
      fileName: 'concurrent_test.ifc',
      fileSizeBytes: validFixture.content.length,
      rawContent: validFixture.content,
      requestId: 'dup-lock-test-1',
    }),
    parseIFCAsync({
      fileName: 'concurrent_test.ifc',
      fileSizeBytes: validFixture.content.length,
      rawContent: validFixture.content,
      requestId: 'dup-lock-test-1',
    }),
  ]);
  assert.strictEqual(firstConcurrent.isValid, true, 'First concurrent import should succeed');
  assert.ok(
    secondConcurrent.errors.some((e) => e.code === 'DUPLICATE_IMPORT_IN_PROGRESS'),
    'Second simultaneous import of same file must be blocked with DUPLICATE_IMPORT_IN_PROGRESS'
  );
  console.log('   ✓ AbortSignal cancellation and duplicate-import lock protection verified.');

  console.log('\n================================================================');
  console.log('ALL 18 P41 OPENBIM & IFC INTEROPERABILITY CHECKS PASSED');
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
