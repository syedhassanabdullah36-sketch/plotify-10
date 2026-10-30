/**
 * P43 — Terrain & Topographic Site Modeling Automated Verification Suite
 */

// Mock localStorage for Node CLI test environment so versioning snapshots work identically to browser runtime
const memoryStore = new Map<string, string>();
if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string) => memoryStore.get(key) ?? null,
      setItem: (key: string, val: string) => {
        memoryStore.set(key, String(val));
      },
      removeItem: (key: string) => {
        memoryStore.delete(key);
      },
      clear: () => {
        memoryStore.clear();
      },
    },
    configurable: true,
  });
}

import { Project } from './src/types/project';
import {
  getSupportedTerrainProfile,
  parseTerrainInputToDataset,
  buildDefaultTerrainCalibration,
  evaluateTerrainModelForProject,
  interpolateElevationOnTIN,
  applyTerrainModelToProject,
  removeTerrainModelFromProject,
  SAMPLE_TERRAIN_FIXTURES,
} from './src/services/terrainService';
import { getProjectSnapshots } from './src/services/versioningService';
import {
  buildBuilding3DModel,
  getDefaultViewerConfig,
  validateFloorPlanFor3D,
} from './src/components/viewer3d/building3dGeometry';
import { INITIAL_SAMPLE_PROJECTS } from './src/services/storage';
import {
  parseIFCToIntermediateModel,
  mapIFCIntermediateToPlotify,
  applyIFCMappingToExistingProject,
  exportProjectToIFC,
  SAMPLE_IFC_FIXTURES,
} from './src/services/ifcService';
import {
  parseDXFToDrawingModel,
  buildDefaultLayerMappingRules,
  mapCADDrawingToPlotify,
  applyCADMappingToExistingProject,
  exportProjectToDXF,
  SAMPLE_DXF_METRIC_COURTYARD_PLAN,
} from './src/services/cadService';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

function createSampleProject(): Project {
  const base = JSON.parse(JSON.stringify(INITIAL_SAMPLE_PROJECTS[0])) as Project;
  base.id = 'proj-p43-test';
  base.name = 'Hillside Residence P43';
  base.plotWidth = 20;
  base.plotLength = 25;
  base.unit = 'metres';

  // Apply real P41 IFC mapping
  const ifcFixture = SAMPLE_IFC_FIXTURES[0];
  const ifcModel = parseIFCToIntermediateModel({
    fileName: ifcFixture.fileName,
    fileSizeBytes: ifcFixture.content.length,
    rawContent: ifcFixture.content,
    targetUnit: base.unit,
  });
  const ifcMapping = mapIFCIntermediateToPlotify(ifcModel, { targetUnit: base.unit });
  const { updatedProject: withIFC } = applyIFCMappingToExistingProject(
    base,
    ifcMapping,
    'merge-append'
  );

  // Apply real P42 CAD mapping
  const dxfDrawing = parseDXFToDrawingModel({
    fileName: 'courtyard_plan.dxf',
    fileSizeBytes: SAMPLE_DXF_METRIC_COURTYARD_PLAN.length,
    rawContent: SAMPLE_DXF_METRIC_COURTYARD_PLAN,
  });
  const cadRules = buildDefaultLayerMappingRules(dxfDrawing);
  const cadMapping = mapCADDrawingToPlotify(dxfDrawing, cadRules, {
    effectiveSourceUnit: 'METRE',
    userConfirmedUnitWhenUnitless: true,
    scaleMultiplier: 1.0,
    targetPlotifyUnit: base.unit,
    omittedEntityHandles: [],
  });
  const { updatedProject: withIFCandCAD } = applyCADMappingToExistingProject(
    withIFC,
    cadMapping,
    'merge-append'
  );

  return withIFCandCAD;
}

async function runP43TerrainTests() {
  console.log('=== P43 TERRAIN & TOPOGRAPHIC SITE MODELING VERIFICATION ===');

  // 1. Verify Support Matrix & Non-Claims
  const profile = getSupportedTerrainProfile();
  const csvFmt = profile.supportedFormats.find((f) => f.format === 'CSV-ELEVATION-POINTS');
  const geojsonFmt = profile.supportedFormats.find((f) => f.format === 'GEOJSON-TOPOGRAPHY');
  const geotiffFmt = profile.recognizedButUnsupportedFormats.find(
    (f) => f.format === 'GEOTIFF-DEM-UNSUPPORTED'
  );
  const landxmlFmt = profile.recognizedButUnsupportedFormats.find(
    (f) => f.format === 'LANDXML-TIN-UNSUPPORTED'
  );
  assert(Boolean(csvFmt), 'CSV-ELEVATION-POINTS must be in supportedFormats');
  assert(Boolean(geojsonFmt), 'GEOJSON-TOPOGRAPHY must be in supportedFormats');
  assert(Boolean(geotiffFmt), 'GEOTIFF-DEM-UNSUPPORTED must be in recognizedButUnsupportedFormats');
  assert(Boolean(landxmlFmt), 'LANDXML-TIN-UNSUPPORTED must be in recognizedButUnsupportedFormats');
  assert(
    profile.claimLimitations.some((c) => c.includes('not a substitute for a licensed land survey')),
    'Profile must include survey boundary disclaimer'
  );
  console.log('  [PASS] 1. Terrain support matrix and engineering disclaimers verified');

  // 2. Verify CSV Survey Point Import & Source Extents
  const gentleFixture = SAMPLE_TERRAIN_FIXTURES.find((f) => f.id === 'csv-hillside-metric')!;
  const gentleDataset = parseTerrainInputToDataset({
    fileName: gentleFixture.fileName,
    fileSizeBytes: gentleFixture.content.length,
    rawContent: gentleFixture.content,
  });
  assert(gentleDataset.isValid === true, 'Gentle CSV fixture should be valid');
  assert(gentleDataset.detectedFormat === 'CSV-ELEVATION-POINTS', 'Format should be CSV-ELEVATION-POINTS');
  assert(gentleDataset.sourcePoints.length === 9, `Expected 9 points, got ${gentleDataset.sourcePoints.length}`);
  assert(gentleDataset.rawExtents?.minZ === 100.0, `Expected minZ 100.0, got ${gentleDataset.rawExtents?.minZ}`);
  assert(gentleDataset.rawExtents?.maxZ === 103.2, `Expected maxZ 103.2, got ${gentleDataset.rawExtents?.maxZ}`);
  assert(Math.abs((gentleDataset.rawExtents?.relief || 0) - 3.2) < 1e-6, 'Expected relief 3.2m');
  console.log('  [PASS] 2. CSV survey point import and source elevation extents verified');

  // 3. Verify GeoJSON 3D Point + Contour LineString Import
  const geojsonFixture = SAMPLE_TERRAIN_FIXTURES.find((f) => f.id === 'geojson-wgs84-contours')!;
  const geojsonDataset = parseTerrainInputToDataset({
    fileName: geojsonFixture.fileName,
    fileSizeBytes: geojsonFixture.content.length,
    rawContent: geojsonFixture.content,
  });
  assert(geojsonDataset.isValid === true, 'GeoJSON topography fixture should be valid');
  assert(geojsonDataset.detectedFormat === 'GEOJSON-TOPOGRAPHY', 'Format should be GEOJSON-TOPOGRAPHY');
  assert(
    geojsonDataset.sourcePoints.length >= 7,
    `Expected >= 7 extracted 3D points, got ${geojsonDataset.sourcePoints.length}`
  );
  assert(geojsonDataset.sourceContours.length === 1, 'Expected 1 3D contour LineString');
  assert(
    geojsonDataset.detectedHorizontalCRS === 'WGS84_GEOGRAPHIC_LON_LAT',
    'GeoJSON WGS84 CRS should be detected'
  );
  console.log('  [PASS] 3. GeoJSON 3D points and elevation-tagged contour LineStrings verified');

  // 4. Verify Unsupported Formats & 2D CAD Without Elevation Rejection
  const geotiffDs = parseTerrainInputToDataset({
    fileName: 'site_dem.tif',
    fileSizeBytes: 24,
    rawContent: 'II*\x00binary_raster_payload',
  });
  assert(geotiffDs.isValid === false, 'GeoTIFF binary must be rejected');
  assert(geotiffDs.detectedFormat === 'GEOTIFF-DEM-UNSUPPORTED', 'GeoTIFF signature detected');

  const landxmlDs = parseTerrainInputToDataset({
    fileName: 'civil_surface.xml',
    fileSizeBytes: 120,
    rawContent:
      '<?xml version="1.0"?><LandXML><Surfaces><Surface name="EG"><Definition surfType="TIN"/></Surface></Surfaces></LandXML>',
  });
  assert(landxmlDs.isValid === false, 'LandXML must be rejected');
  assert(landxmlDs.detectedFormat === 'LANDXML-TIN-UNSUPPORTED', 'LandXML signature detected');

  const cad2dDs = parseTerrainInputToDataset({
    fileName: 'flat_plan.dxf',
    fileSizeBytes: 80,
    rawContent: '0\nSECTION\n2\nENTITIES\n0\nLINE\n8\nA-WALL\n10\n0\n20\n0\n0\nENDSEC\n0\nEOF',
  });
  assert(cad2dDs.isValid === false, '2D DXF without elevation must not fabricate terrain');
  assert(cad2dDs.detectedFormat === 'CAD-2D-NO-ELEVATION', '2D CAD without elevation detected');

  const flatGeojsonContent = JSON.stringify({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { name: 'Lot' },
        geometry: { type: 'Point', coordinates: [10, 20] },
      },
    ],
  });
  const flatGeojsonDs = parseTerrainInputToDataset({
    fileName: 'footprints_2d.geojson',
    fileSizeBytes: flatGeojsonContent.length,
    rawContent: flatGeojsonContent,
  });
  assert(flatGeojsonDs.isValid === false, '2D GeoJSON without Z or elevation property must be blocked');
  assert(
    flatGeojsonDs.errors.some((e) => e.code === 'NO_VALID_ELEVATION_POINTS'),
    'Must report NO_VALID_ELEVATION_POINTS'
  );
  console.log(
    '  [PASS] 4. Unsupported formats (GeoTIFF, LandXML, 2D DXF, 2D GeoJSON) cleanly rejected without fabricating elevation'
  );

  // 5. Verify Duplicate XY & Outlier Elevation Spike Detection + Exclusion Filter
  const noisyFixture = SAMPLE_TERRAIN_FIXTURES.find((f) => f.id === 'csv-ambiguous-anomalies')!;
  const noisyDataset = parseTerrainInputToDataset({
    fileName: noisyFixture.fileName,
    fileSizeBytes: noisyFixture.content.length,
    rawContent: noisyFixture.content,
  });
  assert(
    noisyDataset.duplicatePointIds.length === 1,
    `Expected 1 duplicate point, got ${noisyDataset.duplicatePointIds.length}`
  );
  assert(
    noisyDataset.outlierPointIds.includes('P10_SPIKE'),
    `Expected P10_SPIKE in outlierPointIds, got ${noisyDataset.outlierPointIds.join(',')}`
  );
  assert(
    noisyDataset.skippedRecordCount === 1,
    `Expected 1 malformed row skipped, got ${noisyDataset.skippedRecordCount}`
  );

  const project = createSampleProject();
  const noisyCal = buildDefaultTerrainCalibration(noisyDataset, project);
  // First verify that unconfirmed ambiguous dataset is blocked!
  assert(
    noisyCal.userConfirmedUnitsAndCRS === false,
    'Ambiguous dataset must default to userConfirmedUnitsAndCRS=false'
  );
  const blockedNoisyEval = evaluateTerrainModelForProject(noisyDataset, noisyCal, project);
  assert(blockedNoisyEval.success === false, 'Unconfirmed ambiguous dataset must block');
  assert(
    blockedNoisyEval.errors.some((e) => e.code === 'CONFIRMATION_REQUIRED_FOR_UNITS_OR_CRS'),
    'Must require unit/CRS confirmation'
  );

  // Now confirm units/datum and exclude P10_SPIKE
  noisyCal.userConfirmedUnitsAndCRS = true;
  noisyCal.userConfirmedVerticalDatum = true;
  noisyCal.excludedPointIds = ['P10_SPIKE'];
  const cleanResult = evaluateTerrainModelForProject(noisyDataset, noisyCal, project);
  assert(cleanResult.success === true, 'Confirmed & filtered dataset should succeed');
  assert(
    cleanResult.analysis.maxElevation < 60,
    `Excluded spike P10_SPIKE (185m) should not distort maxElevation (got ${cleanResult.analysis.maxElevation})`
  );
  console.log(
    '  [PASS] 5. Duplicate XY, malformed row, and 185m outlier spike detection & filtering verified'
  );

  // 6. Verify WGS84 Geographic Lon/Lat Local Tangent-Plane Projection (never treat degrees as metres!)
  const wgsCal = buildDefaultTerrainCalibration(geojsonDataset, project);
  assert(
    wgsCal.userConfirmedUnitsAndCRS === false,
    'WGS84 dataset must require explicit confirmation before projecting'
  );
  wgsCal.userConfirmedUnitsAndCRS = true;
  wgsCal.userConfirmedVerticalDatum = true;
  const wgsEval = evaluateTerrainModelForProject(geojsonDataset, wgsCal, project);
  assert(wgsEval.success === true, 'Confirmed WGS84 dataset should project to local metres');
  assert(
    (wgsEval.surfaceMesh?.bounds.width || 0) > 15 && (wgsEval.surfaceMesh?.bounds.width || 0) < 35,
    `WGS84 lon span must be projected to ~22m, got ${wgsEval.surfaceMesh?.bounds.width}m`
  );
  assert(
    wgsEval.appliedTransformSummary.crsTransformationUsed.includes('WGS 84 Ellipsoidal Local Tangent Plane'),
    'Must record WGS 84 Ellipsoidal Local Tangent Plane transformation'
  );
  console.log(
    '  [PASS] 6. Unconfirmed CRS/unit/datum blocking and WGS84 Lon/Lat local tangent-plane projection verified'
  );

  // 7. Verify Delaunay TIN Surface Generation, Contours, Section Profiles & Barycentric Point Query
  const gentleCal = buildDefaultTerrainCalibration(gentleDataset, project);
  const gentleEval = evaluateTerrainModelForProject(gentleDataset, gentleCal, project);
  assert(gentleEval.success === true, 'Explicitly tagged hillside metric dataset should succeed');
  assert(
    gentleEval.surfaceMesh?.method === 'bowyer-watson-delaunay-tin-v1',
    'Surface method should be bowyer-watson-delaunay-tin-v1'
  );
  assert(
    gentleEval.surfaceMesh?.triangles.length === 8,
    `3x3 grid should produce 8 Delaunay triangles, got ${gentleEval.surfaceMesh?.triangles.length}`
  );
  assert(
    (gentleEval.surfaceMesh?.derivedContours.length || 0) > 0,
    'Should derive contour segments across TIN triangles'
  );
  assert(
    gentleEval.analysis.primarySectionWestEast.samples.length === 25,
    'Should compute West-East section profile samples'
  );

  // Query elevation inside the TIN at center (10, 12.5)
  const centerQuery = interpolateElevationOnTIN(gentleEval.surfaceMesh, 10, 12.5);
  assert(
    centerQuery !== null,
    'Point (10, 12.5) is inside the 20x25m TIN and must return an interpolated elevation'
  );
  assert(
    centerQuery! >= 100.0 && centerQuery! <= 103.2,
    `Interpolated elevation at (10,12.5) must be within [100.0, 103.2], got ${centerQuery}`
  );

  // Query elevation outside the TIN hull (-50, -50) -> must return null (no fabricated extrapolation)
  const outsideQuery = interpolateElevationOnTIN(gentleEval.surfaceMesh, -50, -50);
  assert(
    outsideQuery === null,
    'Point outside TIN hull must return null without fabricating elevation'
  );
  console.log(
    '  [PASS] 7. Delaunay TIN triangulation, derived contours, section profiles, and barycentric interpolation verified'
  );

  // 8. Verify Insufficient (< 3) Points Handling
  const twoPtRaw = '# CRS: PROJECT_LOCAL\n# UNIT: METRE\n# DATUM: LOCAL_SURVEY_BENCHMARK\nid,x,y,z\nP1,0,0,100\nP2,10,10,102';
  const twoPointDs = parseTerrainInputToDataset({
    fileName: 'two_points.csv',
    fileSizeBytes: twoPtRaw.length,
    rawContent: twoPtRaw,
  });
  const twoPtCal = buildDefaultTerrainCalibration(twoPointDs, project);
  const twoPtEval = evaluateTerrainModelForProject(twoPointDs, twoPtCal, project);
  assert(twoPtEval.surfaceMesh === null, '< 3 points must not generate a TIN surface');
  assert(twoPtEval.analysis.surfaceGenerated === false, 'surfaceGenerated must be false for < 3 points');
  console.log('  [PASS] 8. Insufficient (<3) points blocked from fabricating a TIN surface');

  // 9. Verify Safe Project Application, Rollback Snapshot, 3D Viewer Overlay, and Removal
  const snapshotsBefore = getProjectSnapshots(project).length;
  const { updatedProject: projWithTerrain } = applyTerrainModelToProject(
    project,
    gentleDataset,
    gentleCal,
    gentleEval,
    {
      showSurfaceIn3D: true,
      showContoursIn2D: true,
      showElevationPoints: true,
      verticalExaggerationDisplayOnly: 1.0,
    }
  );
  const snapshotsAfterApply = getProjectSnapshots(projWithTerrain).length;
  assert(
    snapshotsAfterApply === snapshotsBefore + 1,
    'Applying terrain model must create a pre-apply rollback snapshot'
  );
  assert(
    Boolean(projWithTerrain.terrainModeling?.surfaceMesh),
    'Project must store terrainModeling.surfaceMesh'
  );
  // Verify unrelated project data preserved
  const origRoomCount = project.floorPlan?.rooms.length || 0;
  const origColCount = project.structuralCoordination?.columns.length || 0;
  const origIfcCount = project.ifcInterop?.idMappings.length || 0;
  const origCadCount = project.cadInterop?.provenanceMappings.length || 0;
  assert(
    projWithTerrain.floorPlan?.rooms.length === origRoomCount && origRoomCount > 0,
    'Floor plan rooms must be preserved'
  );
  assert(
    (projWithTerrain.structuralCoordination?.columns.length || 0) === origColCount,
    'Structural columns must be preserved'
  );
  assert(
    (projWithTerrain.ifcInterop?.idMappings.length || 0) === origIfcCount && origIfcCount > 0,
    'P41 IFC provenance must be preserved'
  );
  assert(
    (projWithTerrain.cadInterop?.provenanceMappings.length || 0) === origCadCount && origCadCount > 0,
    'P42 CAD provenance must be preserved'
  );

  // Verify 3D viewer renders P43_TerrainSurface alongside building rooms
  const viewerConfig = getDefaultViewerConfig(projWithTerrain.unit);
  const validation3D = validateFloorPlanFor3D(
    projWithTerrain.floorPlan!.rooms,
    projWithTerrain.plotWidth,
    projWithTerrain.plotLength
  );
  const model3D = buildBuilding3DModel(projWithTerrain, viewerConfig, validation3D.validRooms);
  const terrainGroup3D = model3D.group.getObjectByName('P43_TerrainSurface');
  const floor1Group3D = model3D.group.getObjectByName('Floor_1');
  assert(Boolean(terrainGroup3D), '3D model must include P43_TerrainSurface group');
  assert(Boolean(floor1Group3D), '3D model must preserve Floor_1 building geometry');

  // Verify P41 IFC export and P42 CAD DXF export continue to work seamlessly on a project with terrainModeling
  const ifcExport = exportProjectToIFC(projWithTerrain);
  assert(
    ifcExport.ifcContent.includes('IFCSPACE'),
    'P41 IFC4 export must work with P43 terrain attached'
  );
  const dxfExport = exportProjectToDXF(projWithTerrain);
  assert(
    dxfExport.dxfContent.includes('LWPOLYLINE'),
    'P42 DXF export must work with P43 terrain attached'
  );

  // Verify safe removal of terrain model
  const { updatedProject: projAfterRemove } = removeTerrainModelFromProject(projWithTerrain);
  assert(projAfterRemove.terrainModeling === undefined, 'Terrain model must be cleanly removed');
  assert(
    projAfterRemove.floorPlan?.rooms.length === origRoomCount,
    'Rooms preserved after terrain removal'
  );
  assert(
    projAfterRemove.ifcInterop?.idMappings.length === origIfcCount,
    'P41 IFC data preserved after terrain removal'
  );
  assert(
    projAfterRemove.cadInterop?.provenanceMappings.length === origCadCount,
    'P42 CAD data preserved after terrain removal'
  );
  console.log(
    '  [PASS] 9. Safe apply, rollback snapshot, 3D viewer terrain overlay, P41/P42 coexistence, and removal verified'
  );

  console.log('=== ALL P43 TERRAIN & TOPOGRAPHIC SITE MODELING TESTS PASSED ===');
}

runP43TerrainTests().catch((err) => {
  console.error('P43 Terrain Verification Failed:', err);
  process.exit(1);
});
