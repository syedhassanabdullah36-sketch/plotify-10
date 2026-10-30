/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert';
import { INITIAL_SAMPLE_PROJECTS } from './src/services/storage';
import {
  ENVELOPE_ASSESSMENT_PROFILE_ID,
  EnvelopeAssemblyRecord,
} from './src/types/envelope';
import {
  applyEnvelopeAssessmentToProject,
  buildImprovedEnvelopeScenarioPreview,
  checkEnvelopeAssessmentStaleness,
  computeDewPointFromVapourPressureC,
  computeSaturationVapourPressurePa,
  createInitialEnvelopeAssessment,
  evaluateAssemblyMoistureCondensation,
  evaluateAssemblyThermalPerformance,
  evaluateEnvelopeAirtightness,
  evaluateThermalBridges,
  exportEnvelopeAssessmentReport,
  getAuthoritativeMaterialCatalog,
  getEnvelopeAssessmentProfile,
  recomputeEnvelopeAssessment,
} from './src/services/envelopeService';
import { getProjectSnapshots } from './src/services/versioningService';

// Polyfill localStorage for Node CLI test environment so versioningService snapshots persist
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

console.log('================================================================');
console.log('PLOTIFY P46 — BUILDING ENVELOPE PERFORMANCE ANALYZER TEST SUITE');
console.log('================================================================\n');

// ---------------------------------------------------------------------------
// TEST GROUP A: Profile Governance, Standards Scope & Non-Statutory Disclaimers
// ---------------------------------------------------------------------------
console.log('• Running Group A: Profile Governance, Standards Scope & Non-Statutory Disclaimers...');
{
  const profile = getEnvelopeAssessmentProfile();
  assert.strictEqual(profile.profileId, ENVELOPE_ASSESSMENT_PROFILE_ID);
  assert.ok(profile.supportedMethods.length >= 6, 'Must define all 6 core envelope calculation methods');
  assert.strictEqual(profile.surfaceResistanceDefaultsM2KPerW.horizontal.Rsi, 0.13);
  assert.strictEqual(profile.surfaceResistanceDefaultsM2KPerW.horizontal.Rse, 0.04);
  assert.strictEqual(profile.surfaceResistanceDefaultsM2KPerW.upward.Rsi, 0.10);
  assert.strictEqual(profile.surfaceResistanceDefaultsM2KPerW.downward.Rsi, 0.17);

  for (const bench of profile.screeningBenchmarks) {
    assert.strictEqual(
      bench.isStatutoryComplianceProof,
      false,
      `Benchmark ${bench.benchmarkId} must explicitly set isStatutoryComplianceProof = false`
    );
  }
  assert.ok(profile.statutoryComplianceDisclaimer.toLowerCase().includes('non-statutory'));
  assert.ok(profile.dynamicSimulationDisclaimer.toLowerCase().includes('iso 52016-1'));
  assert.ok(profile.hygrothermalDisclaimer.toLowerCase().includes('iso 13788'));

  const catalog = getAuthoritativeMaterialCatalog();
  assert.ok(catalog.length >= 12, 'Authoritative material catalog must include documented building materials');
  console.log('  ✓ Group A passed');
}

// ---------------------------------------------------------------------------
// TEST GROUP B: ISO 6946 1D Layered Opaque R/U Math, Well-Ventilated Cavity & Validation
// ---------------------------------------------------------------------------
console.log('• Running Group B: ISO 6946 1D Layered Opaque R/U Math, Well-Ventilated Cavity & Validation...');
{
  // Hand-calculable 3-layer wall:
  // Layer 1 (Out): 100 mm (0.10 m), lambda = 0.50 -> R_1 = 0.20 m²K/W
  // Layer 2 (Mid): 140 mm (0.14 m), lambda = 0.035 -> R_2 = 4.00 m²K/W
  // Layer 3 (In):  200 mm (0.20 m), lambda = 1.00 -> R_3 = 0.20 m²K/W
  // Horizontal heat flow: R_si = 0.13, R_se = 0.04
  // Expected sum(R_i) = 4.40 m²K/W, R_T = 4.57 m²K/W, U = 1 / 4.57 = 0.2188 W/(m²·K)
  const testWall: EnvelopeAssemblyRecord = {
    assemblyId: 'test-wall-iso6946',
    name: 'Test 3-Layer Wall',
    category: 'external-opaque-wall',
    boundaryCondition: 'exterior-ambient',
    orientation: 'North',
    heatFlowDirection: 'horizontal',
    provenance: 'project-defined',
    sourceDescription: 'Unit test wall',
    grossAreaM2: 40,
    openingAreaSubtractedM2: 5,
    netAreaM2: 35,
    areaDerivationNote: '40 - 5 = 35 m²',
    layers: [
      {
        layerId: 'l1',
        orderIndex: 1,
        name: 'Outer Masonry',
        materialCategory: 'masonry-concrete',
        thicknessMm: 100,
        thermalConductivityWPerMK: 0.50,
        vapourResistanceFactorMu: 15,
        sourceNote: 'Test',
      },
      {
        layerId: 'l2',
        orderIndex: 2,
        name: 'Mineral Wool Insulation',
        materialCategory: 'insulation',
        thicknessMm: 140,
        thermalConductivityWPerMK: 0.035,
        vapourResistanceFactorMu: 1.3,
        sourceNote: 'Test',
      },
      {
        layerId: 'l3',
        orderIndex: 3,
        name: 'Inner Concrete Block',
        materialCategory: 'masonry-concrete',
        thicknessMm: 200,
        thermalConductivityWPerMK: 1.00,
        vapourResistanceFactorMu: 50,
        sourceNote: 'Test',
      },
    ],
    includeInThermalEnvelope: true,
  };

  const res = evaluateAssemblyThermalPerformance(testWall);
  assert.strictEqual(res.status, 'assessed');
  assert.strictEqual(res.methodUsed, 'ISO-6946-2017-1D-LAYERED-OPAQUE');
  assert.ok(Math.abs((res.sumLayerResistanceM2KPerW || 0) - 4.40) < 1e-4);
  assert.ok(Math.abs((res.totalResistanceRTM2KPerW || 0) - 4.57) < 1e-4);
  assert.ok(Math.abs((res.uValueWPerM2K || 0) - 1 / 4.57) < 1e-3);

  // Test ISO 6946 §6.9.4 well-ventilated air cavity rule:
  // Adding an outer cladding layer + well-ventilated cavity outside the insulation must exclude outer cladding & cavity,
  // and replace R_se (0.04) with R_si (0.13) -> R_T = 0.13 + 4.00 + 0.20 + 0.13 = 4.46 m²K/W
  const rainscreenWall: EnvelopeAssemblyRecord = {
    ...testWall,
    layers: [
      {
        layerId: 'l1-clad',
        orderIndex: 1,
        name: 'Timber Rainscreen Cladding',
        materialCategory: 'cladding-render',
        thicknessMm: 22,
        thermalConductivityWPerMK: 0.14,
        sourceNote: 'Outer cladding',
      },
      {
        layerId: 'l2-vent-cav',
        orderIndex: 2,
        name: 'Well-Ventilated Air Cavity (40 mm)',
        materialCategory: 'air-cavity',
        thicknessMm: 40,
        thermalConductivityWPerMK: null,
        cavityVentilation: 'well-ventilated',
        sourceNote: 'ISO 6946 §6.9.4',
      },
      testWall.layers[1],
      testWall.layers[2],
    ],
  };
  const rainRes = evaluateAssemblyThermalPerformance(rainscreenWall);
  assert.strictEqual(rainRes.status, 'assessed');
  assert.strictEqual(rainRes.RseM2KPerW, 0.13, 'Well-ventilated cavity must set R_se = R_si (0.13)');
  assert.ok(Math.abs((rainRes.totalResistanceRTM2KPerW || 0) - 4.46) < 1e-4);
  assert.strictEqual(rainRes.layerSteps[0].includedInThermalSum, false);
  assert.strictEqual(rainRes.layerSteps[1].includedInThermalSum, false);

  // Test invalid negative/zero thickness or conductivity rejection
  const invalidWall: EnvelopeAssemblyRecord = {
    ...testWall,
    layers: [
      {
        ...testWall.layers[0],
        thicknessMm: -20,
        thermalConductivityWPerMK: 0,
      },
    ],
  };
  const invRes = evaluateAssemblyThermalPerformance(invalidWall);
  assert.strictEqual(invRes.status, 'invalid-input');
  assert.strictEqual(invRes.uValueWPerM2K, null);
  assert.ok(invRes.validationErrors.length >= 2);

  console.log('  ✓ Group B passed');
}

// ---------------------------------------------------------------------------
// TEST GROUP C: Fenestration Routing (ISO 10077-1) & Ground-Floor Routing (ISO 13370)
// ---------------------------------------------------------------------------
console.log('• Running Group C: Fenestration Routing (ISO 10077-1) & Ground-Floor Routing (ISO 13370)...');
{
  // Windows must use ISO-10077-1-DECLARED-WINDOW-DOOR and warn if centre-of-glass Ug is supplied
  const cogWindow: EnvelopeAssemblyRecord = {
    assemblyId: 'test-win-cog',
    name: 'Centre-of-Glass Window',
    category: 'window-glazing',
    boundaryCondition: 'exterior-ambient',
    orientation: 'South',
    heatFlowDirection: 'horizontal',
    provenance: 'project-defined',
    sourceDescription: 'Test window',
    grossAreaM2: 12,
    openingAreaSubtractedM2: 0,
    netAreaM2: 12,
    areaDerivationNote: '12 m²',
    layers: [],
    glazingSolar: {
      uValueBasis: 'centre-of-glass-Ug',
      declaredUValueWPerM2K: 1.05,
      solarHeatGainCoefficientSHGC: 0.45,
      visibleTransmittanceVT: 0.70,
      externalShadingFactorFsh: 0.80,
    },
    includeInThermalEnvelope: true,
  };
  const winRes = evaluateAssemblyThermalPerformance(cogWindow);
  assert.strictEqual(winRes.methodUsed, 'ISO-10077-1-DECLARED-WINDOW-DOOR');
  assert.strictEqual(winRes.uValueWPerM2K, 1.05);
  assert.ok(
    winRes.warnings.some((w) => w.includes('centre-of-glass')),
    'Must warn when centre-of-glass Ug is used instead of whole-window Uw'
  );

  // Ground-contact floor without ground-coupling model must be blocked from 1D air-to-air ISO 6946 math
  const unmodelledSlab: EnvelopeAssemblyRecord = {
    assemblyId: 'test-ground-unmodelled',
    name: 'Unmodelled Ground Slab',
    category: 'ground-contact-floor',
    boundaryCondition: 'ground-contact',
    orientation: 'Horizontal-Downward',
    heatFlowDirection: 'downward',
    provenance: 'project-defined',
    sourceDescription: 'Test ground slab',
    grossAreaM2: 100,
    openingAreaSubtractedM2: 0,
    netAreaM2: 100,
    areaDerivationNote: '100 m²',
    layers: [
      {
        layerId: 'gf-1',
        orderIndex: 1,
        name: 'Concrete Slab',
        materialCategory: 'masonry-concrete',
        thicknessMm: 200,
        thermalConductivityWPerMK: 2.5,
        sourceNote: 'Test',
      },
    ],
    groundFloor: {
      groundCalculationMethod: 'unmodelled-ground-coupling',
    },
    includeInThermalEnvelope: true,
  };
  const gfBlocked = evaluateAssemblyThermalPerformance(unmodelledSlab);
  assert.strictEqual(gfBlocked.status, 'unsupported-method');
  assert.strictEqual(gfBlocked.uValueWPerM2K, null);

  // Ground-contact floor with ISO 13370 simplified slab-on-ground parameters must compute valid U_0
  const iso13370Slab: EnvelopeAssemblyRecord = {
    ...unmodelledSlab,
    groundFloor: {
      groundCalculationMethod: 'iso-13370-slab-on-ground-simplified',
      slabCharacteristicDimensionBM: 6.5,
      soilThermalConductivityWPerMK: 2.0,
      perimeterWallThicknessM: 0.35,
      slabThermalResistanceM2KPerW: 3.5,
    },
  };
  const gfValid = evaluateAssemblyThermalPerformance(iso13370Slab);
  assert.strictEqual(gfValid.status, 'assessed');
  assert.strictEqual(gfValid.methodUsed, 'ISO-13370-DECLARED-GROUND-FLOOR');
  assert.ok(gfValid.uValueWPerM2K !== null && gfValid.uValueWPerM2K > 0.10 && gfValid.uValueWPerM2K < 0.35);

  console.log('  ✓ Group C passed');
}

// ---------------------------------------------------------------------------
// TEST GROUP D: Area Accounting, Thermal Bridge Double-Counting Guard & Solar Screening
// ---------------------------------------------------------------------------
console.log('• Running Group D: Area Accounting, Thermal Bridge Double-Counting Guard & Solar Screening...');
{
  const sampleProject = INITIAL_SAMPLE_PROJECTS[0];
  const assessment = createInitialEnvelopeAssessment(sampleProject);

  assert.ok(assessment.summary.totalSubtractedOpeningAreaM2 > 0, 'Must subtract window and door openings from gross wall areas');
  const grossWallsM2 =
    assessment.summary.totalGrossEnvelopeAreaM2 -
    assessment.summary.roofNetAreaM2 -
    assessment.summary.groundAndExposedFloorAreaM2;
  assert.ok(
    assessment.summary.opaqueWallNetAreaM2 < grossWallsM2,
    'Net opaque wall area must be strictly less than gross wall area after subtracting windows/doors'
  );
  assert.ok(
    Math.abs(
      assessment.summary.totalGrossEnvelopeAreaM2 - assessment.summary.totalNetEnvelopeAreaM2
    ) < 0.05,
    'Total exterior boundary surface area is conserved: gross host surfaces == net opaque + windows + doors'
  );
  assert.ok(assessment.summary.areaWeightedEnvelopeUWPerM2K !== null);
  assert.ok(assessment.summary.effectiveEnvelopeUWithBridgesWPerM2K !== null);
  assert.ok(
    assessment.summary.effectiveEnvelopeUWithBridgesWPerM2K! >
      assessment.summary.areaWeightedEnvelopeUWPerM2K!,
    'Effective U with bridges must exceed 1D area-weighted U when positive Psi bridges exist'
  );
  assert.ok(assessment.summary.steadyStateSolarHeatGainW !== null && assessment.summary.steadyStateSolarHeatGainW > 0);

  // Verify double-counting guard on thermal bridges
  const bridges = [
    {
      bridgeId: 'tb-1',
      name: 'Active Linear Bridge',
      junctionType: 'wall-to-ground-slab' as const,
      bridgeKind: 'linear-psi' as const,
      psiValueWPerMK: 0.20,
      lengthM: 30,
      provenance: 'iso-14683-default-catalogue' as const,
      sourceReference: 'Test',
      linkedAssemblyIds: [],
      alreadyIncludedInAssemblyUValue: false,
    },
    {
      bridgeId: 'tb-2',
      name: 'Already Embedded Bridge',
      junctionType: 'window-door-perimeter-reveal' as const,
      bridgeKind: 'linear-psi' as const,
      psiValueWPerMK: 0.15,
      lengthM: 40,
      provenance: 'iso-14683-default-catalogue' as const,
      sourceReference: 'Test',
      linkedAssemblyIds: [],
      alreadyIncludedInAssemblyUValue: true,
    },
  ];
  const tbSum = evaluateThermalBridges(bridges, 200, 22, 8);
  assert.strictEqual(tbSum.assessedBridgesCount, 1);
  assert.strictEqual(tbSum.totalBridgeHeatTransferCoeffWPerK, 6.0, 'Only non-embedded bridge (0.20 * 30 = 6.0 W/K) should be summed');
  assert.strictEqual(tbSum.equivalentDeltaUWPerM2K, 0.03);

  console.log('  ✓ Group D passed');
}

// ---------------------------------------------------------------------------
// TEST GROUP E: ISO 13788 Psychrometrics, Surface Condensation, Mould f_Rsi & Glaser Profile
// ---------------------------------------------------------------------------
console.log('• Running Group E: ISO 13788 Psychrometrics, Surface Condensation, Mould f_Rsi & Glaser Profile...');
{
  // At 20°C, p_sat ≈ 2338 Pa; at 50% RH, p_v ≈ 1169 Pa -> dew point T_dp ≈ 9.26°C
  const pSat20 = computeSaturationVapourPressurePa(20);
  assert.ok(Math.abs(pSat20 - 2338) < 10, `p_sat(20°C) should be ~2338 Pa, got ${pSat20}`);
  const tDp = computeDewPointFromVapourPressureC(0.50 * pSat20);
  assert.ok(Math.abs(tDp - 9.26) < 0.2, `Dew point at 20°C / 50% RH should be ~9.26°C, got ${tDp}`);

  // Test poorly insulated wall (U = 2.6 W/m²K) in cold winter (-5°C outdoor, 20°C / 65% RH indoor):
  // T_dp(20°C, 65% RH) ≈ 13.2°C; T_si = 20 - 2.6 * 0.13 * 25 = 11.55°C < T_dp -> surface condensation risk!
  const poorWall: EnvelopeAssemblyRecord = {
    assemblyId: 'poor-wall',
    name: 'Uninsulated Solid Masonry Wall',
    category: 'external-opaque-wall',
    boundaryCondition: 'exterior-ambient',
    orientation: 'North',
    heatFlowDirection: 'horizontal',
    provenance: 'project-defined',
    sourceDescription: 'Test uninsulated wall',
    grossAreaM2: 25,
    openingAreaSubtractedM2: 0,
    netAreaM2: 25,
    areaDerivationNote: '25 m²',
    layers: [
      {
        layerId: 'pw-1',
        orderIndex: 1,
        name: 'Solid Brick 215 mm',
        materialCategory: 'masonry-concrete',
        thicknessMm: 215,
        thermalConductivityWPerMK: 1.0,
        vapourResistanceFactorMu: 10,
        sourceNote: 'Test',
      },
    ],
    includeInThermalEnvelope: true,
  };
  const poorThermal = evaluateAssemblyThermalPerformance(poorWall);
  const moistureRes = evaluateAssemblyMoistureCondensation(
    poorWall,
    poorThermal,
    {
      scenarioId: 'cold-humid',
      name: 'Cold Humid Test',
      scenarioType: 'humid-condensation-screening',
      indoorTempC: 20,
      outdoorTempC: -5,
      indoorRelativeHumidityPercent: 65,
      outdoorRelativeHumidityPercent: 90,
      solarIrradianceByOrientationWPerM2: {},
      windExposureCategory: 'moderate',
      provenanceNote: 'Test',
    },
    0.70
  );
  assert.strictEqual(moistureRes.surfaceCondensationRisk, true);
  assert.strictEqual(moistureRes.status, 'surface-condensation-risk');

  // Test Glaser interstitial condensation when a vapour-tight foil is placed on the COLD exterior side
  // of mineral wool insulation without an interior VCL
  const vapourTrapWall: EnvelopeAssemblyRecord = {
    ...poorWall,
    assemblyId: 'vapour-trap-wall',
    name: 'Outer Vapour Barrier Trap Wall',
    layers: [
      {
        layerId: 'vt-out',
        orderIndex: 1,
        name: 'Exterior Foil Barrier (sd = 100 m on cold side)',
        materialCategory: 'membrane-vapour-control',
        thicknessMm: 1,
        thermalConductivityWPerMK: 0.25,
        fixedThermalResistanceM2KPerW: 0.004,
        explicitSdValueM: 100,
        sourceNote: 'Cold-side barrier',
      },
      {
        layerId: 'vt-ins',
        orderIndex: 2,
        name: 'Vapour-Open Mineral Wool (160 mm, mu = 1.3)',
        materialCategory: 'insulation',
        thicknessMm: 160,
        thermalConductivityWPerMK: 0.035,
        vapourResistanceFactorMu: 1.3,
        sourceNote: 'Warm-side open insulation',
      },
      {
        layerId: 'vt-in',
        orderIndex: 3,
        name: 'Interior Gypsum Board (12.5 mm, mu = 10)',
        materialCategory: 'gypsum-plaster',
        thicknessMm: 12.5,
        thermalConductivityWPerMK: 0.25,
        vapourResistanceFactorMu: 10,
        sourceNote: 'Interior finish without VCL',
      },
    ],
  };
  const vtThermal = evaluateAssemblyThermalPerformance(vapourTrapWall);
  const vtMoisture = evaluateAssemblyMoistureCondensation(
    vapourTrapWall,
    vtThermal,
    {
      scenarioId: 'winter-std',
      name: 'Winter Test',
      scenarioType: 'winter-heating-design',
      indoorTempC: 20,
      outdoorTempC: -5,
      indoorRelativeHumidityPercent: 55,
      outdoorRelativeHumidityPercent: 85,
      solarIrradianceByOrientationWPerM2: {},
      windExposureCategory: 'moderate',
      provenanceNote: 'Test',
    },
    0.70
  );
  assert.strictEqual(vtMoisture.interstitialCondensationRisk, true);
  assert.strictEqual(vtMoisture.interstitialStatus, 'glaser-interstitial-risk-detected');

  console.log('  ✓ Group E passed');
}

// ---------------------------------------------------------------------------
// TEST GROUP F: Airtightness Provenance Honesty, Improvement Preview & P44 Carbon Link
// ---------------------------------------------------------------------------
console.log('• Running Group F: Airtightness Provenance Honesty, Improvement Preview & P44 Carbon Link...');
{
  // Unavailable airtightness must not fabricate infiltration numbers
  const airUnavailable = evaluateEnvelopeAirtightness(
    {
      provenance: 'unavailable-untested',
      n50AirChangesPerHour: null,
      q50AirPermeabilityM3PerHM2: null,
      conditionedVolumeM3: 450,
      exposureFactorE: 0.07,
      airBarrierContinuityChecklist: [],
      notes: 'Untested',
    },
    320,
    22,
    8
  );
  assert.strictEqual(airUnavailable.status, 'unavailable');
  assert.strictEqual(airUnavailable.heatingInfiltrationHeatLossW, null);

  // Non-destructive scenario preview & P44 Carbon link
  const baseProj = INITIAL_SAMPLE_PROJECTS[0];
  const baseAssess = createInitialEnvelopeAssessment(baseProj);
  const withSelectedUpgrades = recomputeEnvelopeAssessment(baseProj, {
    ...baseAssess,
    improvementOptions: baseAssess.improvementOptions.map((o) => ({
      ...o,
      selectedForScenario: true,
    })),
  });

  const baseEffectiveU = withSelectedUpgrades.summary.effectiveEnvelopeUWithBridgesWPerM2K!;
  const preview = buildImprovedEnvelopeScenarioPreview(baseProj, withSelectedUpgrades);
  const previewEffectiveU = preview.summary.effectiveEnvelopeUWithBridgesWPerM2K!;

  assert.ok(
    previewEffectiveU < baseEffectiveU,
    `Improved scenario preview U (${previewEffectiveU}) must be lower than baseline U (${baseEffectiveU})`
  );
  assert.strictEqual(
    withSelectedUpgrades.summary.effectiveEnvelopeUWithBridgesWPerM2K,
    baseEffectiveU,
    'Building preview must not mutate baseline assessment'
  );
  assert.ok(
    withSelectedUpgrades.improvementOptions.every(
      (o) => o.estimatedUpfrontCarbonDeltaKgCO2e !== null && o.estimatedUpfrontCarbonDeltaKgCO2e > 0
    ),
    'All improvement options must report upfront embodied carbon trade-off delta (kgCO2e)'
  );

  console.log('  ✓ Group F passed');
}

// ---------------------------------------------------------------------------
// TEST GROUP G: Safe Persistence, Versioning Snapshot, Staleness Detection & Exports
// ---------------------------------------------------------------------------
console.log('• Running Group G: Safe Persistence, Versioning Snapshot, Staleness Detection & Exports...');
{
  const originalProject = INITIAL_SAMPLE_PROJECTS[0];
  const originalRoomCount = originalProject.floorPlan?.rooms.length || 0;
  const assessment = createInitialEnvelopeAssessment(originalProject);

  const updatedProject = applyEnvelopeAssessmentToProject(originalProject, assessment, {
    saveAsScenario: true,
  });

  assert.ok(updatedProject.envelopePerformance, 'Project must contain envelopePerformance metadata');
  assert.strictEqual(
    updatedProject.envelopePerformance?.activeAssessment.profileId,
    ENVELOPE_ASSESSMENT_PROFILE_ID
  );
  assert.strictEqual(updatedProject.envelopePerformance?.savedScenarios.length, 1);
  assert.strictEqual(
    updatedProject.floorPlan?.rooms.length || 0,
    originalRoomCount,
    'Floor-plan rooms must remain intact after applying envelope assessment'
  );

  const snapshots = getProjectSnapshots(updatedProject);
  assert.ok(
    snapshots.some((s) => s.id === updatedProject.envelopePerformance?.lastPreApplySnapshotId),
    'Pre-apply snapshot must be created and recorded'
  );

  // Staleness detection when plot dimensions or floors change
  const freshCheck = checkEnvelopeAssessmentStaleness(updatedProject);
  assert.strictEqual(freshCheck.isStale, false);

  const mutatedGeometryProject = {
    ...updatedProject,
    floors: updatedProject.floors + 1,
  };
  const staleCheck = checkEnvelopeAssessmentStaleness(mutatedGeometryProject);
  assert.strictEqual(staleCheck.isStale, true);
  assert.ok(staleCheck.reasons.some((r) => r.includes('Storey count changed')));

  // Structured exports (JSON, CSV, Markdown)
  const jsonOut = exportEnvelopeAssessmentReport(updatedProject, assessment, 'json');
  const parsedJson = JSON.parse(jsonOut);
  assert.strictEqual(parsedJson.schema, ENVELOPE_ASSESSMENT_PROFILE_ID);
  assert.strictEqual(parsedJson.profileMetadata.isStatutoryComplianceProof, false);

  const csvOut = exportEnvelopeAssessmentReport(updatedProject, assessment, 'csv');
  assert.ok(csvOut.includes('Assembly_ID,Assembly_Name,Category'));
  assert.ok(csvOut.split('\n').length >= assessment.assemblies.length + 1);

  const mdOut = exportEnvelopeAssessmentReport(updatedProject, assessment, 'markdown');
  assert.ok(mdOut.includes('# Building Envelope Performance Assessment Report'));
  assert.ok(mdOut.includes('isStatutoryComplianceProof: false'));

  console.log('  ✓ Group G passed');
}

console.log('\n================================================================');
console.log('ALL P46 BUILDING ENVELOPE PERFORMANCE TESTS PASSED SUCCESSFULLY!');
console.log('================================================================\n');
