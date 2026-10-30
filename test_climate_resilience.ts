/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * PLOTIFY — P45 Climate Hazard & Resilience Analyzer Verification Suite
 * Covers Test Groups A through F (Prompt 45 Section 18)
 */

import assert from 'assert';

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => store.set(k, String(v)),
    removeItem: (k: string) => store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
}

import { INITIAL_SAMPLE_PROJECTS } from './src/services/storage';
import { Project } from './src/types/project';
import { CLIMATE_ASSESSMENT_PROFILE_ID } from './src/types/climateResilience';
import {
  applyClimateAssessmentToProject,
  applySelectedResilienceMeasuresToProject,
  checkClimateAssessmentStaleness,
  computeQualitativeRiskLevel,
  createDefaultClimateResilienceConfig,
  exportClimateResilienceCSV,
  exportClimateResilienceJSON,
  exportClimateResilienceMarkdownReport,
  getAuthoritativeClimateSources,
  importClimateEvidencePayload,
  removeClimateAssessmentFromProject,
  runClimateHazardResilienceAssessment,
  validateSiteLocationPreflight,
} from './src/services/climateResilienceService';
import { getProjectSnapshots } from './src/services/versioningService';

console.log('================================================================');
console.log('PLOTIFY — P45 CLIMATE HAZARD & RESILIENCE ANALYZER TEST SUITE');
console.log('================================================================\n');

const baseSample: Project = JSON.parse(JSON.stringify(INITIAL_SAMPLE_PROJECTS[0]));

// ============================================================================
// GROUP A: LOCATION & DATA PREFLIGHT
// ============================================================================
console.log('• Group A: Location & Spatial Preflight, Source Governance & Quarantine...');

// A1. Missing coordinates even when city/region text is present (never fabricate coordinates!)
const projectWithCityOnly: Project = {
  ...JSON.parse(JSON.stringify(baseSample)),
  siteContext: {
    ...(baseSample.siteContext || {
      locationConfidence: 'unverified',
      northOrientationOffsetDeg: 0,
      slope: 'flat-under-2-pct',
      slopeDirection: 'None',
      accessPoints: [],
      obstacles: [],
      neighbors: [],
      setbacks: { front: 10, rear: 10, sideLeft: 5, sideRight: 5, source: 'user-specified' },
      environmental: {},
      photos: [],
      updatedAt: new Date().toISOString(),
    }),
    cityRegion: 'Lahore, Punjab, Pakistan',
    latitude: undefined,
    longitude: undefined,
  },
};

const defaultCfg = createDefaultClimateResilienceConfig();
const preMissing = validateSiteLocationPreflight(projectWithCityOnly, defaultCfg);
assert.strictEqual(preMissing.status, 'missing-coordinates');
assert.strictEqual(preMissing.canRunLocationSpecificScreening, false);
assert.strictEqual(preMissing.latitude, null);
assert.strictEqual(preMissing.longitude, null);
assert.ok(
  preMissing.blockingIssues.some((b) =>
    b.includes('never fabricates geographic coordinates')
  ),
  'Must explicitly state that coordinates are never fabricated from city text'
);

// A2. Suspected coordinate swap (longitude in latitude field)
const preSwap = validateSiteLocationPreflight(projectWithCityOnly, {
  ...defaultCfg,
  confirmedCoordinatesOverride: {
    latitude: 74.3587, // invalid latitude (>90), looks like longitude!
    longitude: 31.5204,
    confirmationNote: 'Swapped input test',
    sourceType: 'user-observation',
  },
});
assert.strictEqual(preSwap.status, 'suspected-coordinate-swap');
assert.strictEqual(preSwap.canRunLocationSpecificScreening, false);

// A3. Out-of-range coordinates
const preInvalidRange = validateSiteLocationPreflight(projectWithCityOnly, {
  ...defaultCfg,
  confirmedCoordinatesOverride: {
    latitude: 95.5,
    longitude: 210.0,
    confirmationNote: 'Out of range test',
    sourceType: 'user-observation',
  },
});
assert.strictEqual(preInvalidRange.status, 'invalid-coordinate-range');
assert.strictEqual(preInvalidRange.canRunLocationSpecificScreening, false);

// A4. Local (0,0) coordinates rejected as geographic location
const preZeroOrigin = validateSiteLocationPreflight(projectWithCityOnly, {
  ...defaultCfg,
  confirmedCoordinatesOverride: {
    latitude: 0,
    longitude: 0,
    confirmationNote: 'Local zero origin',
    sourceType: 'user-observation',
  },
});
assert.strictEqual(preZeroOrigin.status, 'local-plot-coordinates-only');
assert.strictEqual(preZeroOrigin.canRunLocationSpecificScreening, false);

// A5. Unverified coordinates warning
const projectUnverifiedCoords: Project = {
  ...JSON.parse(JSON.stringify(projectWithCityOnly)),
  siteContext: {
    ...projectWithCityOnly.siteContext!,
    latitude: 31.5204,
    longitude: 74.3587,
    locationConfidence: 'unverified',
  },
};
const preUnverified = validateSiteLocationPreflight(projectUnverifiedCoords, defaultCfg);
assert.strictEqual(preUnverified.status, 'unverified-geographic-location');
assert.strictEqual(preUnverified.canRunLocationSpecificScreening, true);
assert.strictEqual(preUnverified.detectedJurisdictionScope, 'pakistan');
assert.ok(preUnverified.warnings.some((w) => w.includes('unverified')));

// A6. Grid-cell boundary proximity & multi-grid-cell parcel checks
const preNearGridBoundary = validateSiteLocationPreflight(projectWithCityOnly, {
  ...defaultCfg,
  confirmedCoordinatesOverride: {
    latitude: 31.505, // within 0.02 deg of 31.50 (0.25 deg grid boundary)
    longitude: 74.255,
    confirmationNote: 'Near 0.25 deg boundary',
    sourceType: 'survey-stamped',
  },
});
assert.strictEqual(preNearGridBoundary.status, 'valid-geographic-location');
assert.strictEqual(preNearGridBoundary.gridCellSpanCheck.nearGridCellBoundary, true);

// A7. Offline mode & stale cache source governance
const sourcesOnlinePak = getAuthoritativeClimateSources('pakistan', [], false, '2026-06-01T00:00:00.000Z');
const femaInPak = sourcesOnlinePak.find((s) => s.sourceId === 'SRC-FEMA-NFHL-MSC')!;
const pmdInPak = sourcesOnlinePak.find((s) => s.sourceId === 'SRC-PMD-FFD-PAK')!;
assert.strictEqual(femaInPak.verificationStatus, 'out-of-jurisdiction');
assert.strictEqual(pmdInPak.verificationStatus, 'verified-reference-fixture');

const sourcesOffline = getAuthoritativeClimateSources('united-states', [], true, '2026-06-01T00:00:00.000Z');
const era5Offline = sourcesOffline.find((s) => s.sourceId === 'SRC-COPERNICUS-ERA5-CMIP6')!;
assert.strictEqual(era5Offline.verificationStatus, 'live-connector-unavailable');

const sourcesExpired = getAuthoritativeClimateSources('global', [], false, '2030-06-01T00:00:00.000Z');
assert.ok(sourcesExpired.every((s) => s.isExpired && s.verificationStatus === 'stale-cached-record'));

// A8. Malformed JSON & CSV climate evidence import quarantine
const malformedJsonRes = importClimateEvidencePayload('{ broken json ', 'json');
assert.strictEqual(malformedJsonRes.success, false);
assert.strictEqual(malformedJsonRes.quarantinedRecords.length, 1);

const mixedCsvPayload = [
  'hazardCategory,indicatorCode,label,scenario,timeHorizon,historicalBaselineValue,projectedOrObservedValue,unit,spatialResolutionKm,sourceId,sourceCitation',
  'extreme-heat,TXx,Station Max Temp,ssp2-4.5,mid-century-2041-2060,44.0,46.9,°C,5,SRC-LOCAL,Local Station',
  'invalid-hazard,BAD,Bad Hazard Row,ssp2-4.5,mid-century-2041-2060,10,20,mm,5,SRC-LOCAL,Bad Row',
  'extreme-precipitation,Rx1day,Corrupt NaN Row,ssp2-4.5,mid-century-2041-2060,80,NOT_A_NUMBER,mm/day,5,SRC-LOCAL,NaN Row',
].join('\n');

const csvImportRes = importClimateEvidencePayload(mixedCsvPayload, 'csv');
assert.strictEqual(csvImportRes.success, true);
assert.strictEqual(csvImportRes.importedIndicators.length, 1);
assert.strictEqual(csvImportRes.importedIndicators[0].projectedOrObservedValue, 46.9);
assert.strictEqual(csvImportRes.quarantinedRecords.length, 2);

console.log('  ✓ Group A passed (8/8 preflight & source governance checks)');

// ============================================================================
// GROUP B: HAZARD & SCENARIO HANDLING
// ============================================================================
console.log('• Group B: Hazard Catalog, Scenario Comparison & Flood Sub-Type Separation...');

// B1. Missing coordinates -> all location-dependent hazards marked 'unassessed', never low risk
const unassessedResult = runClimateHazardResilienceAssessment(projectWithCityOnly, defaultCfg);
for (const haz of unassessedResult.hazards) {
  assert.ok(
    haz.hazardSeverityLevel === 'unassessed' ||
      haz.hazardSeverityLevel === 'insufficient-evidence',
    `Hazard ${haz.hazardCategory} with missing coordinates must be unassessed/insufficient-evidence, got ${haz.hazardSeverityLevel}`
  );
}
for (const rf of unassessedResult.riskFindings) {
  assert.ok(
    rf.inherentRiskLevel === 'unassessed' ||
      rf.inherentRiskLevel === 'insufficient-evidence',
    `Risk finding ${rf.findingId} with missing coordinates must never be low risk, got ${rf.inherentRiskLevel}`
  );
}

// B2. Valid coordinates (Lahore 31.5204N, 74.3587E) across SSP2-4.5 vs SSP5-8.5
const lahoreCfg = {
  ...defaultCfg,
  activeScenario: 'ssp2-4.5' as const,
  comparisonScenario: 'ssp5-8.5' as const,
  activeTimeHorizon: 'mid-century-2041-2060' as const,
  confirmedCoordinatesOverride: {
    latitude: 31.5204,
    longitude: 74.3587,
    confirmationNote: 'Surveyed Lahore Benchmark',
    sourceType: 'survey-stamped' as const,
  },
};

const lahoreAssessment = runClimateHazardResilienceAssessment(projectWithCityOnly, lahoreCfg);
assert.strictEqual(lahoreAssessment.profileId, CLIMATE_ASSESSMENT_PROFILE_ID);

const heatHazard = lahoreAssessment.hazards.find((h) => h.hazardCategory === 'extreme-heat')!;
assert.strictEqual(heatHazard.screeningStatus, 'assessed-verified');
assert.strictEqual(heatHazard.hazardSeverityLevel, 'very-high');
assert.ok(
  heatHazard.scientificBoundaryNotices.some((n) => n.includes('P46')),
  'Extreme heat hazard must explicitly state the P46 indoor thermal boundary'
);

// Check scenario comparison (SSP5-8.5 TXx > SSP2-4.5 TXx > Historical Baseline)
const txxComparison = lahoreAssessment.scenarioComparison.find((r) => r.indicatorCode === 'TXx')!;
assert.ok(
  typeof txxComparison.baselineValue === 'number' &&
    typeof txxComparison.activeScenarioValue === 'number' &&
    typeof txxComparison.comparisonScenarioValue === 'number'
);
assert.ok(
  txxComparison.activeScenarioValue > txxComparison.baselineValue,
  'SSP2-4.5 mid-century TXx must exceed 1991–2020 baseline'
);
assert.ok(
  txxComparison.comparisonScenarioValue > txxComparison.activeScenarioValue,
  'SSP5-8.5 mid-century TXx must exceed SSP2-4.5'
);

// Check time horizon progression (late-century > near-term under SSP5-8.5)
const nearTermRes = runClimateHazardResilienceAssessment(projectWithCityOnly, {
  ...lahoreCfg,
  activeScenario: 'ssp5-8.5',
  activeTimeHorizon: 'near-term-2021-2040',
});
const lateCenturyRes = runClimateHazardResilienceAssessment(projectWithCityOnly, {
  ...lahoreCfg,
  activeScenario: 'ssp5-8.5',
  activeTimeHorizon: 'late-century-2081-2100',
});
const nearTxx = nearTermRes.hazards
  .find((h) => h.hazardCategory === 'extreme-heat')!
  .indicators.find((i) => i.indicatorCode === 'TXx')!.projectedOrObservedValue as number;
const lateTxx = lateCenturyRes.hazards
  .find((h) => h.hazardCategory === 'extreme-heat')!
  .indicators.find((i) => i.indicatorCode === 'TXx')!.projectedOrObservedValue as number;
assert.ok(lateTxx > nearTxx, 'Late-century warming must exceed near-term warming under SSP5-8.5');

// B3. Flood sub-type separation (Fluvial, Pluvial, Coastal, Official Map)
const floodHazard = lahoreAssessment.hazards.find((h) => h.hazardCategory === 'flooding')!;
assert.ok(floodHazard.floodSubTypeBreakdown && floodHazard.floodSubTypeBreakdown.length === 4);
const subTypesPresent = floodHazard.floodSubTypeBreakdown.map((s) => s.subType);
assert.deepStrictEqual(subTypesPresent, [
  'pluvial-surface-water',
  'fluvial-riverine',
  'coastal-storm-surge',
  'official-flood-zone-map',
]);
const officialMapSub = floodHazard.floodSubTypeBreakdown.find(
  (s) => s.subType === 'official-flood-zone-map'
)!;
assert.strictEqual(
  officialMapSub.severityLevel,
  'insufficient-evidence',
  'When no official flood zone map is entered, official-flood-zone-map must be insufficient-evidence'
);

// B4. Slope / Geotechnical honesty: without geotechnical report, slope stability is insufficient-evidence
const slopeHazard = lahoreAssessment.hazards.find(
  (h) => h.hazardCategory === 'slope-erosion-landslide'
)!;
assert.strictEqual(slopeHazard.screeningStatus, 'insufficient-evidence');
assert.strictEqual(slopeHazard.hazardSeverityLevel, 'insufficient-evidence');

console.log('  ✓ Group B passed (6/6 hazard & scenario checks)');

// ============================================================================
// GROUP C: PROJECT EXPOSURE & VULNERABILITY MAPPING
// ============================================================================
console.log('• Group C: Exposure & Vulnerability Mapping to Real Project Elements...');

// C1. Verify Floor 1 rooms and MEP components are linked in exposure mappings
const groundExp = lahoreAssessment.exposureMappings.find(
  (e) => e.assetCategory === 'ground-floor-habitable-spaces'
)!;
const expectedFloor1Rooms =
  projectWithCityOnly.floorPlan?.rooms?.filter((r) => r.floorLevel === 1).length || 0;
assert.strictEqual(groundExp.linkedProjectElements.length, expectedFloor1Rooms);
assert.ok(
  groundExp.missingAttributes.includes('finished-floor-elevation-above-ground-m'),
  'Missing FFE must be explicitly recorded in missingAttributes'
);

// C2. Verify missing FFE causes ground-floor flood vulnerability & risk finding to be 'insufficient-evidence'
const pluvialFindingNoFFE = lahoreAssessment.riskFindings.find(
  (f) => f.findingId === 'FIND-PLUVIAL-GROUND-ROOMS'
)!;
assert.strictEqual(
  pluvialFindingNoFFE.vulnerabilityLevel,
  'insufficient-evidence',
  'Missing FFE must keep ground-floor flood vulnerability as insufficient-evidence'
);
assert.strictEqual(
  pluvialFindingNoFFE.inherentRiskLevel,
  'insufficient-evidence',
  'Missing FFE must keep inherent risk as insufficient-evidence rather than guessing low risk'
);

// C3. P43 Terrain integration & local-relative datum warning
const projectWithLocalTerrain: Project = {
  ...JSON.parse(JSON.stringify(projectWithCityOnly)),
  terrainModeling: {
    version: 'plotify-terrain-meta-v1',
    datasetId: 'TERR-TEST-1',
    appliedAt: new Date().toISOString(),
    sourceFileName: 'site_survey.csv',
    sourceFormat: 'CSV-ELEVATION-POINTS',
    sourceChecksum: 'CHK-TERR-123',
    sourcePointCount: 12,
    sourceContourCount: 0,
    calibration: {
      horizontalCRS: 'PROJECT_LOCAL',
      horizontalUnit: 'FOOT',
      verticalUnit: 'FOOT',
      verticalDatum: 'PROJECT_BENCHMARK_ZERO',
      userConfirmedUnitsAndCRS: true,
      userConfirmedVerticalDatum: true,
      alignmentMode: 'preserve-local',
      manualOriginSourceX: 0,
      manualOriginSourceY: 0,
      verticalOffsetInTargetUnit: 0,
      maxTriangleEdgeLength: 100,
      contourInterval: 1,
      excludedPointIds: [],
    },
    appliedTransformSummary: {
      horizontalScaleFactor: 1,
      verticalScaleFactor: 1,
      originOffsetX: 0,
      originOffsetY: 0,
      verticalOffset: 0,
      crsTransformationUsed: 'Identity local',
    },
    calibratedPoints: [],
    surfaceMesh: {
      method: 'bowyer-watson-delaunay-tin-v1',
      generatedAt: new Date().toISOString(),
      unit: 'feet',
      vertices: [],
      triangles: [
        {
          id: 'T1',
          v0Index: 0,
          v1Index: 1,
          v2Index: 2,
          centroidX: 10,
          centroidY: 10,
          centroidZ: 12,
          area2D: 50,
          slopePercent: 8.7,
          slopeDegrees: 5,
          aspectDegrees: 180,
        },
      ],
      derivedContours: [],
      hullBoundary: [],
      bounds: {
        minX: 0,
        maxX: 50,
        minY: 0,
        maxY: 80,
        minZ: 10,
        maxZ: 14,
        width: 50,
        length: 80,
        relief: 4,
      },
      plotCoverageRatio: 0.95,
      hasGapsWithinPlot: false,
    },
    analysis: {
      unit: 'feet',
      validPointCount: 12,
      excludedPointCount: 0,
      pointsInsidePlotCount: 12,
      surfaceGenerated: true,
      minElevation: 10,
      maxElevation: 14,
      meanElevation: 12,
      elevationRelief: 4,
      meanSlopePercent: 7.0,
      meanSlopeDegrees: 4,
      maxSlopePercent: 14.0,
      maxSlopeDegrees: 8,
      dominantAspectDegrees: 180,
      dominantAspectCardinal: 'S',
      plotCoveragePercent: 95,
      buildingFootprintRelief: {
        hasGroundFloorRooms: true,
        totalCornersChecked: 4,
        coveredCornersCount: 4,
        uncoveredCornersCount: 0,
        minGroundElevationUnderBuilding: 10.5,
        maxGroundElevationUnderBuilding: 13.5,
        footprintLevelDifference: 3.0,
      },
      primarySectionWestEast: {
        label: 'W-E',
        startX: 0,
        startY: 20,
        endX: 50,
        endY: 20,
        totalLength: 50,
        unit: 'feet',
        samples: [],
        minElevation: 10,
        maxElevation: 14,
        gapCount: 0,
      },
      primarySectionNorthSouth: {
        label: 'N-S',
        startX: 25,
        startY: 0,
        endX: 25,
        endY: 80,
        totalLength: 80,
        unit: 'feet',
        samples: [],
        minElevation: 10,
        maxElevation: 14,
        gapCount: 0,
      },
      methodologyAndLimitations: [],
    },
    warnings: [],
    displaySettings: {
      showSurfaceIn3D: true,
      showContoursIn2D: true,
      showElevationPoints: true,
      verticalExaggerationDisplayOnly: 1.0,
    },
  },
};

const terrainPreflight = validateSiteLocationPreflight(projectWithLocalTerrain, lahoreCfg);
assert.strictEqual(terrainPreflight.terrainAlignmentCheck.hasTerrainModel, true);
assert.strictEqual(
  terrainPreflight.terrainAlignmentCheck.hasValidVerticalDatumForFloodComparison,
  false,
  'local-relative vertical datum must be flagged as invalid for direct orthometric flood datum comparison'
);
assert.strictEqual(terrainPreflight.terrainAlignmentCheck.footprintReliefM, 0.91); // 3.0 ft * 0.3048 = 0.91 m

console.log('  ✓ Group C passed (5/5 exposure, vulnerability & P43 terrain checks)');

// ============================================================================
// GROUP D: RISK & RESILIENCE RECOMMENDATIONS + P44 CARBON CROSS-REFERENCE
// ============================================================================
console.log('• Group D: Transparent Risk Matrix, Resilience Measures & P44 Carbon Context...');

// D1. Qualitative risk matrix never turns missing data into low risk
const missingCalc = computeQualitativeRiskLevel('high', 'high', 'insufficient-evidence', 2);
assert.strictEqual(missingCalc.inherentRiskLevel, 'insufficient-evidence');
assert.strictEqual(missingCalc.residualRiskLevel, 'insufficient-evidence');

// D2. Supplying low FFE (+0.15 m) produces evaluated High risk, and selecting MEAS-FLOOD-FFE-RAISE reduces residual risk without claiming zero risk
const lowFfeCfg = {
  ...lahoreCfg,
  siteSpecificAttributes: {
    ...lahoreCfg.siteSpecificAttributes,
    finishedFloorElevationAboveGroundM: 0.15,
    hasBackflowPrevention: false,
    officialFloodZoneLabel: 'Zone AE (100-yr Floodplain)',
    hasOnSiteRainwaterStorageLiters: 0,
  },
  selectedMeasureIds: [],
};

const beforeMeasuresRes = runClimateHazardResilienceAssessment(projectWithCityOnly, lowFfeCfg);
const pluvialBefore = beforeMeasuresRes.riskFindings.find(
  (f) => f.findingId === 'FIND-PLUVIAL-GROUND-ROOMS'
)!;
assert.strictEqual(pluvialBefore.evaluationStatus, 'evaluated');
assert.ok(
  pluvialBefore.inherentRiskLevel === 'high' ||
    pluvialBefore.inherentRiskLevel === 'very-high' ||
    pluvialBefore.inherentRiskLevel === 'moderate'
);

const withMeasuresRes = runClimateHazardResilienceAssessment(projectWithCityOnly, {
  ...lowFfeCfg,
  selectedMeasureIds: ['MEAS-FLOOD-FFE-RAISE', 'MEAS-STORM-RETENTION-SWALE', 'MEAS-HEAT-PASSIVE-SHADING'],
});
const pluvialAfter = withMeasuresRes.riskFindings.find(
  (f) => f.findingId === 'FIND-PLUVIAL-GROUND-ROOMS'
)!;
assert.notStrictEqual(
  pluvialAfter.residualRiskLevel,
  pluvialAfter.inherentRiskLevel,
  'Selected flood mitigation measures must reduce residual risk relative to inherent risk'
);

// D3. Verify every measure includes P44 Whole-Life Carbon trade-off context and residual risk note
for (const m of withMeasuresRes.adaptationMeasures) {
  assert.ok(m.embodiedCarbonTradeOff.materialImplicationSummary.length > 10);
  assert.ok(m.embodiedCarbonTradeOff.p44CrossReferenceNote.length > 10);
  assert.ok(m.residualRiskAfterMeasure.length > 10);
  assert.strictEqual(m.projectParameterPreview.mutatesGeometryDirectly, false);
}

console.log('  ✓ Group D passed (5/5 risk trace, measure reduction & P44 trade-off checks)');

// ============================================================================
// GROUP E: PERSISTENCE, MEASURE APPLY, STALENESS & ROLLBACK
// ============================================================================
console.log('• Group E: Safe Persistence, Checkpoints, Staleness & Rollback...');

const snapshotsBefore = getProjectSnapshots(projectWithCityOnly).length;
const savedProject = applyClimateAssessmentToProject(
  projectWithCityOnly,
  withMeasuresRes,
  csvImportRes.importedIndicators,
  csvImportRes.importedSources,
  csvImportRes.quarantinedRecords,
  true
);
const snapshotsAfterSave = getProjectSnapshots(savedProject).length;
assert.ok(
  snapshotsAfterSave > snapshotsBefore,
  'Saving climate assessment must create an automatic version checkpoint'
);
assert.ok(savedProject.climateResilience);
assert.strictEqual(
  savedProject.climateResilience.profileId,
  CLIMATE_ASSESSMENT_PROFILE_ID
);

// Verify unrelated project fields are 100% preserved
assert.strictEqual(
  savedProject.floorPlan?.rooms.length,
  projectWithCityOnly.floorPlan?.rooms.length
);
assert.strictEqual(savedProject.budget, projectWithCityOnly.budget);
assert.strictEqual(savedProject.plotWidth, projectWithCityOnly.plotWidth);

// Apply selected resilience measures explicitly
const appliedMeasuresProject = applySelectedResilienceMeasuresToProject(
  savedProject,
  withMeasuresRes.config
);
assert.strictEqual(
  appliedMeasuresProject.climateResilience?.config.siteSpecificAttributes
    .finishedFloorElevationAboveGroundM,
  0.65
);
assert.strictEqual(
  appliedMeasuresProject.climateResilience?.config.siteSpecificAttributes
    .hasBackflowPrevention,
  true
);
assert.strictEqual(
  appliedMeasuresProject.climateResilience?.config.siteSpecificAttributes
    .hasOnSiteRainwaterStorageLiters,
  5000
);

// Staleness detection when project plot/geometry changes
const notStaleCheck = checkClimateAssessmentStaleness(appliedMeasuresProject);
assert.strictEqual(notStaleCheck.isStale, false);

const modifiedGeometryProject: Project = {
  ...appliedMeasuresProject,
  floors: appliedMeasuresProject.floors + 1,
};
const staleCheck = checkClimateAssessmentStaleness(modifiedGeometryProject);
assert.strictEqual(
  staleCheck.isStale,
  true,
  'Changing project floors/geometry must mark saved climate assessment as stale'
);

// Safe removal of climate resilience data
const removedProject = removeClimateAssessmentFromProject(appliedMeasuresProject);
assert.strictEqual(removedProject.climateResilience, undefined);
assert.strictEqual(
  removedProject.floorPlan?.rooms.length,
  projectWithCityOnly.floorPlan?.rooms.length
);

console.log('  ✓ Group E passed (6/6 persistence, staleness & rollback checks)');

// ============================================================================
// GROUP F: REPORT EXPORT & PROVENANCE
// ============================================================================
console.log('• Group F: Structured JSON, CSV & Markdown Report Export...');

const jsonOut = exportClimateResilienceJSON(savedProject, withMeasuresRes);
const parsedJsonOut = JSON.parse(jsonOut);
assert.strictEqual(parsedJsonOut.schema, CLIMATE_ASSESSMENT_PROFILE_ID);
assert.strictEqual(parsedJsonOut.assessment.hazards.length, 8);

const csvOut = exportClimateResilienceCSV(withMeasuresRes);
assert.ok(csvOut.includes('FindingID,HazardCategory,FloodSubType'));
assert.ok(csvOut.includes('FIND-PLUVIAL-GROUND-ROOMS'));

const mdOut = exportClimateResilienceMarkdownReport(savedProject, withMeasuresRes);
assert.ok(mdOut.includes(CLIMATE_ASSESSMENT_PROFILE_ID));
assert.ok(mdOut.includes('Mandatory Scope & Engineering Disclaimers'));
assert.ok(mdOut.includes('SRC-IPCC-AR6-WGI-ATLAS'));

console.log('  ✓ Group F passed (3/3 export & provenance checks)');

console.log('\n================================================================');
console.log('✓ ALL P45 CLIMATE HAZARD & RESILIENCE ANALYZER TESTS PASSED!');
console.log('================================================================\n');
