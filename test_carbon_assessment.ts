// Mock localStorage in Node CLI environment so versioningService snapshots persist in memory
const memoryStorage = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (key: string) => memoryStorage.get(key) ?? null,
  setItem: (key: string, value: string) => {
    memoryStorage.set(key, String(value));
  },
  removeItem: (key: string) => {
    memoryStorage.delete(key);
  },
  clear: () => {
    memoryStorage.clear();
  },
  key: (index: number) => Array.from(memoryStorage.keys())[index] ?? null,
  get length() {
    return memoryStorage.size;
  },
};

import { Project } from './src/types/project';
import {
  applyCarbonAssessmentToProject,
  BUILT_IN_CARBON_FACTORS,
  convertInventoryQuantityToDeclaredUnit,
  createInitialProjectCarbonAssessment,
  deriveProjectCarbonInventory,
  evaluateWholeLifeCarbonAssessment,
  exportCarbonAssessmentReport,
  parseAndValidateCarbonFactorsImport,
  removeCarbonAssessmentFromProject,
  SUPPORTED_CARBON_ASSESSMENT_PROFILE,
} from './src/services/carbonService';
import { getProjectSnapshots } from './src/services/versioningService';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

function assertApprox(actual: number, expected: number, tolerance: number, message: string): void {
  if (!Number.isFinite(actual) || Math.abs(actual - expected) > tolerance) {
    throw new Error(
      `ASSERTION FAILED: ${message} (expected ${expected} ± ${tolerance}, got ${actual})`
    );
  }
}

function createSampleProjectForCarbonTest(): Project {
  return {
    id: 'proj-p44-carbon-test',
    name: 'Meridian Low-Carbon Courtyard House',
    projectType: 'house',
    plotWidth: 20,
    plotLength: 30,
    unit: 'metres',
    roadFacing: 'South',
    floors: 2,
    rooms: {
      bedrooms: 3,
      bathrooms: 2,
      kitchen: 1,
      livingRoom: 1,
      diningRoom: 1,
      homeOffice: 1,
      balcony: 1,
      garage: 1,
      laundry: 1,
      storage: 1,
    },
    budget: 650000,
    currency: 'GBP',
    notes: 'P44 Whole-Life Carbon verification project',
    status: 'Schematic Design',
    floorPlan: {
      rooms: [
        {
          id: 'room-living',
          name: 'Living & Dining Hall',
          type: 'livingRoom',
          x: 2,
          y: 2,
          width: 8,
          length: 6,
          color: '#e0f2fe',
          floorLevel: 1,
        },
        {
          id: 'room-kitchen',
          name: 'Kitchen & Pantry',
          type: 'kitchen',
          x: 10,
          y: 2,
          width: 5,
          length: 6,
          color: '#fef3c7',
          floorLevel: 1,
        },
        {
          id: 'room-bed1',
          name: 'Primary Bedroom',
          type: 'bedroom',
          x: 2,
          y: 8,
          width: 6,
          length: 5,
          color: '#dcfce7',
          floorLevel: 1,
        },
      ],
      gridSnap: 0.5,
      showGrid: true,
    },
    structuralCoordination: {
      version: '1.0',
      framingSystem: 'reinforced-concrete-frame',
      grid: {
        id: 'grid-1',
        xAxes: [],
        yAxes: [],
        baySpacingX: 6,
        baySpacingY: 6,
        offsetX: 0,
        offsetY: 0,
        showGridLines: true,
        showBubbles: true,
      },
      columns: [
        {
          id: 'col-1',
          label: 'C1',
          x: 2,
          y: 2,
          floorLevels: [1, 2],
          profile: 'rectangular',
          width: 0.4,
          depth: 0.4,
          material: 'reinforced-concrete',
          isLoadBearing: true,
          status: 'active',
        },
        {
          id: 'col-2',
          label: 'C2',
          x: 10,
          y: 2,
          floorLevels: [1, 2],
          profile: 'rectangular',
          width: 0.4,
          depth: 0.4,
          material: 'reinforced-concrete',
          isLoadBearing: true,
          status: 'active',
        },
      ],
      beams: [
        {
          id: 'beam-1',
          label: 'B1',
          startX: 2,
          startY: 2,
          endX: 10,
          endY: 2,
          floorLevel: 1,
          profileWidth: 0.3,
          profileDepth: 0.5,
          material: 'reinforced-concrete',
          beamType: 'primary-girder',
        },
      ],
      reviewIssues: [],
      maxUnsupportedSpanThreshold: 6.0,
      lastEvaluatedGeometryHash: 'hash-1',
      lastEvaluatedAt: '2026-10-26T00:00:00.000Z',
      isStale: false,
      notes: '',
    },
    ifcInterop: {
      version: 'plotify-ifc-meta-v1',
      idMappings: [
        {
          plotifyEntityId: 'room-living',
          plotifyEntityType: 'room',
          sourceGlobalId: '2O2Fr$t4X7Zf8NOew3FLOH',
          sourceIfcType: 'IFCSPACE',
          sourceStepId: 101,
          sourceName: 'Living & Dining Hall',
        },
      ],
      preservedElements: [
        {
          stepId: 101,
          globalId: '2O2Fr$t4X7Zf8NOew3FLOH',
          ifcType: 'IFCSPACE',
          name: 'Mapped Living Room (Should Not Be Double Counted)',
          preservationStatus: 'imported-and-editable',
          properties: [],
          quantities: [{ qtoName: 'Qto_SpaceBaseQuantities', quantityName: 'NetFloorArea', value: 48, quantityType: 'area' }],
          materials: [],
          classifications: [],
          note: '',
        },
        {
          stepId: 202,
          globalId: '3WallPreservedGlobalId99',
          ifcType: 'IFCWALL',
          name: 'Acoustic Garden Screen Wall',
          preservationStatus: 'imported-not-editable',
          properties: [],
          quantities: [{ qtoName: 'Qto_WallBaseQuantities', quantityName: 'NetVolume', value: 12.5, quantityType: 'volume' }],
          materials: ['Brick Masonry'],
          classifications: [],
          note: '',
        },
      ],
      unsupportedEntitySummary: {},
    },
    cadInterop: {
      version: 'plotify-cad-meta-v1',
      provenanceMappings: [],
      referenceEntities: [
        {
          handle: 'A10',
          dxfType: 'LWPOLYLINE',
          layer: 'A-SITE-BOUNDARY',
          floorLevel: 1,
          boundsInTargetUnits: { minX: 0, minY: 0, maxX: 20, maxY: 0, width: 20, length: 0 },
        },
      ],
      unsupportedEntitySummary: {},
    },
    terrainModeling: {
      version: 'plotify-terrain-meta-v1',
      datasetId: 'ter-1',
      appliedAt: '2026-10-26T00:00:00.000Z',
      sourceFileName: 'survey.csv',
      sourceFormat: 'CSV-ELEVATION-POINTS',
      sourceChecksum: 'chk-123',
      sourcePointCount: 3,
      sourceContourCount: 0,
      calibration: {
        horizontalCRS: 'PROJECT_LOCAL',
        horizontalUnit: 'METRE',
        verticalUnit: 'METRE',
        verticalDatum: 'LOCAL_SURVEY_BENCHMARK',
        userConfirmedUnitsAndCRS: true,
        userConfirmedVerticalDatum: true,
        alignmentMode: 'preserve-local',
        manualOriginSourceX: 0,
        manualOriginSourceY: 0,
        verticalOffsetInTargetUnit: 0,
        maxTriangleEdgeLength: 50,
        contourInterval: 0.5,
        excludedPointIds: [],
      },
      appliedTransformSummary: {
        horizontalScaleFactor: 1,
        verticalScaleFactor: 1,
        originOffsetX: 0,
        originOffsetY: 0,
        verticalOffset: 0,
        crsTransformationUsed: 'LOCAL_PLOT_CARTESIAN',
      },
      calibratedPoints: [],
      surfaceMesh: null,
      analysis: {
        unit: 'metres',
        validPointCount: 3,
        excludedPointCount: 0,
        pointsInsidePlotCount: 3,
        surfaceGenerated: true,
        minElevation: 10,
        maxElevation: 12,
        meanElevation: 11,
        elevationRelief: 2,
        meanSlopePercent: 5,
        meanSlopeDegrees: 2.86,
        maxSlopePercent: 8,
        maxSlopeDegrees: 4.57,
        dominantAspectDegrees: 180,
        dominantAspectCardinal: 'S',
        plotCoveragePercent: 100,
        buildingFootprintRelief: {
          hasGroundFloorRooms: true,
          totalCornersChecked: 4,
          coveredCornersCount: 4,
          uncoveredCornersCount: 0,
          minGroundElevationUnderBuilding: 10.2,
          maxGroundElevationUnderBuilding: 11.4,
          footprintLevelDifference: 1.2,
        },
        primarySectionWestEast: {
          label: 'W-E',
          startX: 0,
          startY: 15,
          endX: 20,
          endY: 15,
          totalLength: 20,
          unit: 'metres',
          samples: [],
          minElevation: 10,
          maxElevation: 12,
          gapCount: 0,
        },
        primarySectionNorthSouth: {
          label: 'N-S',
          startX: 10,
          startY: 0,
          endX: 10,
          endY: 30,
          totalLength: 30,
          unit: 'metres',
          samples: [],
          minElevation: 10,
          maxElevation: 12,
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
    createdAt: '2026-10-26T00:00:00.000Z',
    updatedAt: '2026-10-26T00:00:00.000Z',
  };
}

async function runCarbonAssessmentVerificationSuite() {
  console.log('=== P44 EMBODIED & WHOLE-LIFE CARBON ASSESSMENT VERIFICATION SUITE ===');

  // 1. Profile & Built-In Factors Governance Check
  console.log('1. Verifying Supported Carbon Assessment Profile & Built-in Factor Governance...');
  assert(
    SUPPORTED_CARBON_ASSESSMENT_PROFILE.profileId === 'plotify-whole-life-carbon-p44-v1',
    'Profile ID must match plotify-whole-life-carbon-p44-v1'
  );
  assert(
    SUPPORTED_CARBON_ASSESSMENT_PROFILE.supportedModules.length === 11,
    'Profile must define all 11 lifecycle module groups (A0 through D)'
  );
  assert(
    BUILT_IN_CARBON_FACTORS.length >= 15,
    'Built-in factor registry must include comprehensive structural, envelope, finish, MEP, transport, energy, and water factors'
  );
  for (const factor of BUILT_IN_CARBON_FACTORS) {
    assert(factor.factorId && factor.name, 'Every built-in factor must have factorId and name');
    assert(
      Number.isFinite(factor.gwpValueKgCO2ePerUnit) && factor.gwpValueKgCO2ePerUnit >= 0,
      `Factor ${factor.factorId} must have finite non-negative GWP`
    );
    if (factor.verificationStatus === 'verified-epd') {
      assert(
        Boolean(factor.epdRegistrationNumber),
        `Verified EPD factor ${factor.factorId} must have an explicit epdRegistrationNumber`
      );
    }
  }

  // 2. Unit Conversion & Invalid Conversion Rejection Test
  console.log('2. Verifying Unit Conversion Engine & Physical Property Guards...');
  const convM2ToKgValid = convertInventoryQuantityToDeclaredUnit({
    quantity: 100,
    sourceUnit: 'm2',
    targetUnit: 'kg',
    thicknessM: 0.2,
    densityKgPerM3: 2400,
  });
  assert(convM2ToKgValid.valid, 'm2 -> kg with thicknessM and densityKgPerM3 should succeed');
  assertApprox(convM2ToKgValid.convertedQuantity!, 48000, 0.01, '100 m2 * 0.2 m * 2400 kg/m3 = 48,000 kg');

  const convM2ToKgMissingThickness = convertInventoryQuantityToDeclaredUnit({
    quantity: 100,
    sourceUnit: 'm2',
    targetUnit: 'kg',
    densityKgPerM3: 2400,
  });
  assert(
    !convM2ToKgMissingThickness.valid,
    'm2 -> kg without thicknessM must be rejected rather than guessed'
  );

  const convM3ToKgMissingDensity = convertInventoryQuantityToDeclaredUnit({
    quantity: 25,
    sourceUnit: 'm3',
    targetUnit: 'kg',
  });
  assert(
    !convM3ToKgMissingDensity.valid,
    'm3 -> kg without densityKgPerM3 must be rejected rather than guessed'
  );

  const convIncompatible = convertInventoryQuantityToDeclaredUnit({
    quantity: 50,
    sourceUnit: 'item',
    targetUnit: 'm2',
  });
  assert(!convIncompatible.valid, 'item -> m2 incompatible conversion must be rejected');

  // 3. Valid Embodied Carbon Calculation, Replacement Cycles (B4), and Module D Separation
  console.log('3. Verifying Embodied Carbon Math (A1–A3, A4, A5, B2–B5, C1–C4) & Module D Separation...');
  const controlledEval = evaluateWholeLifeCarbonAssessment({
    assessmentName: 'Controlled Verification Assessment',
    referenceStudyPeriodYears: 60,
    grossInternalFloorAreaM2: 200,
    inventory: [
      {
        itemId: 'test-slab-concrete',
        elementName: 'Ground Slab C30/37 CEM I',
        elementCategory: 'substructure-foundation',
        sourceType: 'model-derived-geometry',
        sourceDescription: '100 m2 × 0.20 m = 20 m3 × 2400 kg/m3 = 48,000 kg',
        quantity: 100,
        quantityUnit: 'm2',
        thicknessM: 0.2,
        assignedFactorId: 'ice-rc-c30-37-cem1', // 0.159 kgCO2e/kg, EoL 0.014, Mod D -0.008, density 2400
        mappingConfidence: 'high',
        serviceLifeYears: 60, // 0 replacements in 60-yr RSP
        transportDistanceKm: 50, // 48 tonnes * 50 km = 2400 tonne-km * 0.105 = 252 kgCO2e
        transportFactorId: 'defra-road-freight-hgv-average',
        wasteRatePercent: 5, // 5% of (7632 + 252) = 394.2 kgCO2e
        includeEndOfLife: true, // 48000 * 0.014 = 672 kgCO2e
        includeModuleD: true, // 48000 * -0.008 = -384 kgCO2e
      },
      {
        itemId: 'test-windows-30yr',
        elementName: 'Aluminium Windows (30-Year Lifespan)',
        elementCategory: 'windows-external-doors',
        sourceType: 'model-derived-geometry',
        sourceDescription: '40 m2 double glazed windows',
        quantity: 40,
        quantityUnit: 'm2',
        thicknessM: 0.05,
        assignedFactorId: 'ice-double-glazed-aluminium-window', // 165 kgCO2e/m2, EoL 6.5, Mod D -42, density 1100
        mappingConfidence: 'high',
        serviceLifeYears: 30, // Replaced 1 time in 60-yr RSP!
        transportDistanceKm: 0,
        wasteRatePercent: 0,
        includeEndOfLife: true,
        includeModuleD: true,
      },
    ],
    operationalEnergy: { enabled: false, sourceType: 'unavailable' },
    operationalWater: { enabled: false, sourceType: 'unavailable' },
  });

  // Concrete A1-A3 = 48,000 * 0.159 = 7,632 kgCO2e
  // Windows A1-A3 = 40 * 165 = 6,600 kgCO2e
  // Total A1-A3 = 14,232 kgCO2e
  const modA1A3 = controlledEval.moduleResults.find((m) => m.moduleCode === 'A1-A3')!;
  assertApprox(modA1A3.emissionsKgCO2e!, 14232, 0.1, 'A1-A3 total must equal 14,232 kgCO2e');

  // Concrete A4 = 48 t * 50 km * 0.105 = 252 kgCO2e
  const modA4 = controlledEval.moduleResults.find((m) => m.moduleCode === 'A4')!;
  assertApprox(modA4.emissionsKgCO2e!, 252, 0.1, 'A4 total must equal 252 kgCO2e');

  // Concrete A5 = (7632 + 252) * 0.05 = 394.2 kgCO2e
  const modA5 = controlledEval.moduleResults.find((m) => m.moduleCode === 'A5')!;
  assertApprox(modA5.emissionsKgCO2e!, 394.2, 0.1, 'A5 total must equal 394.2 kgCO2e');

  // Windows B4 replacement: 1 cycle in 60 yrs = (6600 A1-A3 + 260 C1-C4) = 6,860 kgCO2e
  const modB2B5 = controlledEval.moduleResults.find((m) => m.moduleCode === 'B2-B5')!;
  assertApprox(modB2B5.emissionsKgCO2e!, 6860, 0.1, 'B2-B5 replacement total must equal 6,860 kgCO2e');

  // C1-C4 End of Life: Concrete (48,000 * 0.014 = 672) + Windows (40 * 6.5 = 260) = 932 kgCO2e
  const modC1C4 = controlledEval.moduleResults.find((m) => m.moduleCode === 'C1-C4')!;
  assertApprox(modC1C4.emissionsKgCO2e!, 932, 0.1, 'C1-C4 total must equal 932 kgCO2e');

  // Module D: Concrete (48,000 * -0.008 = -384) + Windows (40 * -42 = -1680) = -2,064 kgCO2e
  assertApprox(
    controlledEval.moduleDSummary.netModuleDBenefitOrLoadKgCO2e!,
    -2064,
    0.1,
    'Module D net benefit must equal -2,064 kgCO2e'
  );

  // Verify Module D is NEVER subtracted from Upfront (A0-A5) or Whole-Life (A-C)
  const expectedUpfront = 14232 + 252 + 394.2; // 14,878.2
  const expectedWholeLifeAC = expectedUpfront + 6860 + 932; // 22,670.2
  assertApprox(
    controlledEval.totals.upfrontCarbonA0toA5KgCO2e,
    expectedUpfront,
    0.1,
    'Upfront A0-A5 must equal A1-A3 + A4 + A5 without Module D'
  );
  assertApprox(
    controlledEval.totals.wholeLifeCarbonAtoCKgCO2e,
    expectedWholeLifeAC,
    0.1,
    'Whole-Life A-C must strictly exclude Module D'
  );

  // 4. Missing Operational Energy (B6) & Water (B7) Must Be Unavailable (Null, Never 0)
  console.log('4. Verifying Missing B6/B7 Operational Data Is Marked Unavailable (Never Silently 0)...');
  const modB6Missing = controlledEval.moduleResults.find((m) => m.moduleCode === 'B6')!;
  const modB7Missing = controlledEval.moduleResults.find((m) => m.moduleCode === 'B7')!;
  assert(
    modB6Missing.status === 'unavailable' && modB6Missing.emissionsKgCO2e === null,
    'Missing B6 Operational Energy must have status "unavailable" and emissionsKgCO2e === null'
  );
  assert(
    modB7Missing.status === 'unavailable' && modB7Missing.emissionsKgCO2e === null,
    'Missing B7 Operational Water must have status "unavailable" and emissionsKgCO2e === null'
  );
  assert(
    controlledEval.totals.operationalCarbonB6toB8KgCO2e === null,
    'Operational total must be null when B6–B8 are unavailable/unassessed'
  );
  assert(
    controlledEval.scopeClassification === 'Partially assessed lifecycle',
    `Expected "Partially assessed lifecycle" when B6/B7 are unavailable, got "${controlledEval.scopeClassification}"`
  );

  // 5. Operational Energy (B6) & Water (B7) Enabled + Exported Renewable Routed to Module D
  console.log('5. Verifying Operational Energy (B6), Water (B7), and Exported Renewable -> Module D...');
  const fullWholeLifeEval = evaluateWholeLifeCarbonAssessment({
    assessmentName: 'Full Whole-Life Assessment',
    referenceStudyPeriodYears: 60,
    grossInternalFloorAreaM2: 200,
    inventory: controlledEval.inventory,
    operationalEnergy: {
      enabled: true,
      sourceType: 'user-entered',
      annualElectricityKwhPerYear: 8000, // 8000 * 60 * 0.225 = 108,000 kgCO2e
      electricityGridFactorId: 'grid-electricity-average-reference',
      annualFuelThermalKwhPerYear: 4000, // 4000 * 60 * 0.183 = 43,920 kgCO2e
      fuelFactorId: 'fuel-natural-gas-boiler',
      onSiteRenewableExportedKwhPerYear: 2000, // 2000 * 60 * -0.225 = -27,000 kgCO2e -> Module D!
    },
    operationalWater: {
      enabled: true,
      sourceType: 'user-entered',
      annualPotableWaterM3PerYear: 150, // 150 * 60 * 0.378 = 3,402 kgCO2e
      waterSupplyAndTreatmentFactorId: 'water-potable-supply-and-wastewater',
    },
  });

  const modB6Active = fullWholeLifeEval.moduleResults.find((m) => m.moduleCode === 'B6')!;
  const modB7Active = fullWholeLifeEval.moduleResults.find((m) => m.moduleCode === 'B7')!;
  assertApprox(modB6Active.emissionsKgCO2e!, 151920, 0.1, 'B6 must equal 108,000 + 43,920 = 151,920 kgCO2e (exported PV not deducted from B6)');
  assertApprox(modB7Active.emissionsKgCO2e!, 3402, 0.1, 'B7 must equal 3,402 kgCO2e');
  assertApprox(
    fullWholeLifeEval.moduleDSummary.exportedRenewableEnergyBenefitKgCO2e,
    -27000,
    0.1,
    'Exported renewable electricity benefit (-27,000 kgCO2e) must be reported in Module D'
  );
  assert(
    fullWholeLifeEval.scopeClassification === 'Whole-life assessment within a documented scope',
    `Expected "Whole-life assessment within a documented scope", got "${fullWholeLifeEval.scopeClassification}"`
  );

  // 6. Biogenic Carbon Balance Verification (EN 15978 A1-A3 Uptake Balanced by C3-C4 Release)
  console.log('6. Verifying Biogenic Carbon Balance Between A1–A3 and C3–C4...');
  const timberEval = evaluateWholeLifeCarbonAssessment({
    assessmentName: 'Biogenic Timber Balance Test',
    referenceStudyPeriodYears: 60,
    grossInternalFloorAreaM2: 100,
    includeBiogenicInTotals: true,
    inventory: [
      {
        itemId: 'test-clt-slab',
        elementName: 'CLT Timber Floor Slab',
        elementCategory: 'superstructure-upper-floors',
        sourceType: 'model-derived-geometry',
        sourceDescription: '10 m3 CLT × 480 kg/m3 = 4,800 kg',
        quantity: 10,
        quantityUnit: 'm3',
        assignedFactorId: 'epd-mass-timber-clt-glulam', // biogenicStorage -1.64, release +1.64, density 480
        mappingConfidence: 'high',
        serviceLifeYears: 60,
        transportDistanceKm: 0,
        wasteRatePercent: 0,
        includeEndOfLife: false, // Even if user sets false, includeBiogenicInTotals enforces EoL biogenic balance!
        includeModuleD: false,
      },
    ],
    operationalEnergy: { enabled: false, sourceType: 'unavailable' },
    operationalWater: { enabled: false, sourceType: 'unavailable' },
  });

  assertApprox(
    timberEval.biogenicSummary.totalBiogenicStorageA1A3KgCO2e,
    -7872,
    0.1,
    '4,800 kg CLT * -1.64 = -7,872 kgCO2e biogenic storage in A1-A3'
  );
  assertApprox(
    timberEval.biogenicSummary.netBiogenicBalanceAtoCKgCO2e,
    0,
    0.1,
    'Net biogenic balance across A-C must be 0 kgCO2e per EN 15978'
  );
  // Total embodied A-C must equal fossil A1-A3 (4800 * 0.437 = 2097.6) because -7872 storage in A1-A3 is balanced by +7872 release in C1-C4
  assertApprox(
    timberEval.totals.embodiedCarbonAtoCKgCO2e,
    2097.6,
    0.1,
    'Embodied A-C total must not permanently credit A1-A3 biogenic storage without C3-C4 release'
  );

  // 7. Factor Import & Quarantine Validation (CSV & JSON)
  console.log('7. Verifying Custom Carbon Factor Import & Quarantine Validation...');
  const csvBatch = [
    'factorId,name,materialOrFuelCategory,sourceOrganisation,sourceReference,declaredUnit,gwpValueKgCO2ePerUnit,publicationYear,region,densityKgPerM3,defaultServiceLifeYears,coveredModules',
    'custom-lime-render,Hydraulic Lime Render,Finishes,Lime Association,EPD-LIME-2024,kg,0.115,2024,UK,1700,45,A1-A3',
    'bad-row-missing-unit,Invalid Factor Missing Unit,Concrete,Org,Ref,gallons,0.5,2024,UK,2400,60,A1-A3',
    'bad-row-nan-gwp,Invalid Factor NaN GWP,Concrete,Org,Ref,kg,not-a-number,2024,UK,2400,60,A1-A3',
    'custom-lime-render,Duplicate Factor ID,Finishes,Lime Association,EPD-LIME-2024,kg,0.115,2024,UK,1700,45,A1-A3',
  ].join('\n');

  const importResult = parseAndValidateCarbonFactorsImport(csvBatch, 'test-import.csv');
  assert(importResult.validFactors.length === 1, `Expected 1 valid factor, got ${importResult.validFactors.length}`);
  assert(
    importResult.validFactors[0].verificationStatus === 'user-imported-unverified',
    'User-imported factor must be tagged user-imported-unverified'
  );
  assert(
    importResult.quarantinedRecords.length === 3,
    `Expected 3 quarantined records (bad unit, NaN GWP, duplicate ID), got ${importResult.quarantinedRecords.length}`
  );

  // 8. Project Inventory Extraction, P41 IFC Duplicate Prevention, and P42/P43 Boundary Refusals
  console.log('8. Verifying Project Inventory Extraction & P41/P42/P43 Boundary Guards...');
  const sampleProject = createSampleProjectForCarbonTest();
  const derived = deriveProjectCarbonInventory(sampleProject);

  // 3 rooms on floorPlan: 48 + 30 + 30 = 108 m2 footprint * 2 floors = 216 m2 GFA
  assertApprox(derived.grossInternalFloorAreaM2, 216, 0.1, 'Derived GFA must equal 216 m2');

  // Check P41 IFC preserved elements:
  // GlobalId '2O2Fr$t4X7Zf8NOew3FLOH' is in idMappings -> MUST BE SKIPPED!
  // GlobalId '3WallPreservedGlobalId99' is unmapped with 12.5 m3 volume -> MUST BE INCLUDED!
  const ifcItems = derived.inventory.filter((i) => i.sourceType === 'ifc-preserved-element');
  assert(ifcItems.length === 1, `Expected exactly 1 unmapped IFC preserved element, got ${ifcItems.length}`);
  assert(
    ifcItems[0].sourceReferenceId === '3WallPreservedGlobalId99' && ifcItems[0].quantity === 12.5,
    'Unmapped IFC preserved wall volume (12.5 m3) must be extracted with GlobalId provenance'
  );
  assert(
    derived.warnings.some((w) => w.code === 'IFC_DUPLICATE_PREVENTED'),
    'Must emit IFC_DUPLICATE_PREVENTED warning for mapped IFC entities'
  );
  assert(
    derived.warnings.some((w) => w.code === 'CAD_2D_VOLUME_NOT_INFERRED'),
    'Must emit CAD_2D_VOLUME_NOT_INFERRED boundary notice when P42 2D CAD entities exist'
  );
  assert(
    derived.warnings.some((w) => w.code === 'TERRAIN_EXCAVATION_NOT_INFERRED'),
    'Must emit TERRAIN_EXCAVATION_NOT_INFERRED boundary notice when P43 terrain exists'
  );

  // 9. Explainable Carbon-Reduction Opportunities Generation
  console.log('9. Verifying Explainable Carbon-Reduction Opportunities...');
  const projectAssessment = createInitialProjectCarbonAssessment(sampleProject);
  assert(
    projectAssessment.reductionOpportunities.length >= 3,
    'Project assessment must generate explainable material substitution opportunities (e.g. GGBS concrete, windows, partitions)'
  );
  for (const opp of projectAssessment.reductionOpportunities) {
    assert(opp.estimatedSavingKgCO2e > 0, 'Reduction opportunity must have positive saving');
    assert(
      opp.proposedEmissionsKgCO2e < opp.baselineEmissionsKgCO2e,
      'Proposed emissions must be strictly lower than baseline emissions'
    );
    assert(opp.explanationFormula.length > 10, 'Opportunity must provide an explicit formula trace');
  }

  // 10. Safe Persistence, Pre-Apply Rollback Snapshot, Unrelated Data Preservation, Removal & Export
  console.log('10. Verifying Safe Project Persistence, Rollback Snapshots & Report Export...');
  const snapshotsBefore = getProjectSnapshots(sampleProject).length;
  const { updatedProject, snapshotId } = applyCarbonAssessmentToProject(
    sampleProject,
    projectAssessment,
    { saveAsScenario: true }
  );
  const snapshotsAfter = getProjectSnapshots(updatedProject).length;
  assert(snapshotsAfter === snapshotsBefore + 1, 'Applying P44 assessment must create a pre-apply rollback snapshot');
  assert(Boolean(snapshotId), 'Must return snapshotId');
  assert(
    updatedProject.carbonAssessment?.activeAssessment.assessmentId === projectAssessment.assessmentId,
    'Active carbon assessment must be persisted on project.carbonAssessment'
  );

  // Verify unrelated project data is 100% preserved
  assert(
    JSON.stringify(updatedProject.floorPlan) === JSON.stringify(sampleProject.floorPlan),
    'floorPlan must remain untouched'
  );
  assert(
    JSON.stringify(updatedProject.structuralCoordination) === JSON.stringify(sampleProject.structuralCoordination),
    'structuralCoordination must remain untouched'
  );
  assert(
    JSON.stringify(updatedProject.ifcInterop) === JSON.stringify(sampleProject.ifcInterop),
    'P41 ifcInterop must remain untouched'
  );
  assert(
    JSON.stringify(updatedProject.cadInterop) === JSON.stringify(sampleProject.cadInterop),
    'P42 cadInterop must remain untouched'
  );
  assert(
    JSON.stringify(updatedProject.terrainModeling) === JSON.stringify(sampleProject.terrainModeling),
    'P43 terrainModeling must remain untouched'
  );

  // Export reports (JSON, Markdown, CSV)
  const jsonReport = exportCarbonAssessmentReport(updatedProject, projectAssessment, 'json');
  const mdReport = exportCarbonAssessmentReport(updatedProject, projectAssessment, 'markdown');
  const csvReport = exportCarbonAssessmentReport(updatedProject, projectAssessment, 'csv');
  assert(jsonReport.content.includes('"plotify-whole-life-carbon-p44-v1"'), 'JSON report must include profileId');
  assert(mdReport.content.includes('Module D (Beyond System Boundary'), 'Markdown report must include separate Module D section');
  assert(csvReport.content.split('\n').length > 5, 'CSV report must export all calculation trace rows');

  // Remove carbon assessment
  const { updatedProject: afterRemoval } = removeCarbonAssessmentFromProject(updatedProject);
  assert(afterRemoval.carbonAssessment === undefined, 'removeCarbonAssessmentFromProject must clear carbonAssessment');
  assert(
    JSON.stringify(afterRemoval.terrainModeling) === JSON.stringify(sampleProject.terrainModeling),
    'Removing carbonAssessment must preserve P43 terrainModeling and all other project data'
  );

  console.log('✅ ALL P44 EMBODIED & WHOLE-LIFE CARBON ASSESSMENT VERIFICATION CHECKS PASSED!');
}

runCarbonAssessmentVerificationSuite().catch((err) => {
  console.error('❌ P44 Verification Failed:', err);
  process.exit(1);
});
