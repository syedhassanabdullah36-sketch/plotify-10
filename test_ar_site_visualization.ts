/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * P48 — Augmented Reality Site Visualization Verification Suite (Suite 20)
 * Covers Groups A through G:
 * - Group A: Capability & Environment Detection Tests
 * - Group B: Model Preparation & Unit Normalization Tests
 * - Group C: Placement & Transformation Logic Tests
 * - Group D: Session Lifecycle & Cleanup Tests
 * - Group E: UI, Privacy & Workflow Honesty Tests
 * - Group F: Cross-Feature Compatibility Tests (P41–P47)
 * - Group G: Negative & Stress Tests
 */

import assert from 'node:assert/strict';
import { INITIAL_SAMPLE_PROJECTS } from './src/services/storage';
import {
  AR_SITE_VISUALIZATION_PROFILE_ID,
  ARScalePreset,
} from './src/types/arSiteVisualization';
import {
  FEET_TO_METRES,
  AR_SCALE_PRESET_FACTORS,
  getUnitToMetresFactor,
  computeARSiteGeometryFingerprint,
  detectARCapabilities,
  createDefaultARSiteVisualizationConfig,
  prepareARModelPreflight,
  computeARPlacementTransform,
  applyManualPlacementAdjustment,
  resetARPlacementToDefault,
  ARSessionController,
  buildARSiteCompleteThreeGroup,
  checkARSiteVisualizationStaleness,
  applyARSiteConfigToProject,
  generateARSiteVisualizationReport,
  exportARSiteVisualizationReport,
  disposeThreeHierarchy,
} from './src/services/arSiteVisualizationService';
import {
  parseTerrainInputToDataset,
  buildDefaultTerrainCalibration,
  evaluateTerrainModelForProject,
  applyTerrainModelToProject,
  SAMPLE_TERRAIN_FIXTURES,
} from './src/services/terrainService';
import {
  createInitialEnvelopeAssessment,
  applyEnvelopeAssessmentToProject,
} from './src/services/envelopeService';
import {
  initializeSiteLogisticsPlan,
  applySiteLogisticsPlanToProject,
} from './src/services/siteLogisticsService';

async function runTests() {
  console.log('================================================================');
  console.log('P48 — AUGMENTED REALITY SITE VISUALIZATION VERIFICATION SUITE');
  console.log('================================================================\n');

  const sampleFeetProject = structuredClone(INITIAL_SAMPLE_PROJECTS[0]); // 40x60 feet
  const sampleMetresProject = structuredClone(INITIAL_SAMPLE_PROJECTS[1]); // metres

  // =========================================================================
  // GROUP A: Capability & Environment Detection Tests
  // =========================================================================
  console.log('• Group A: Capability & Environment Detection Tests...');

  // A1: Insecure context (HTTP) blocked
  const capInsecure = await detectARCapabilities({
    isSecureContext: false,
    hasWebGL: true,
    hasNavigatorXR: true,
    immersiveArSupported: true,
  });
  assert.equal(capInsecure.readinessState, 'insecure_context_blocked');
  assert.equal(capInsecure.canAttemptImmersiveAR, false);
  assert.equal(capInsecure.recommendedMode, 'standard_3d_site_preview');

  // A2: WebGL unavailable
  const capNoWebGL = await detectARCapabilities({
    isSecureContext: true,
    hasWebGL: false,
    hasNavigatorXR: true,
    immersiveArSupported: true,
  });
  assert.equal(capNoWebGL.readinessState, 'webgl_unavailable');
  assert.equal(capNoWebGL.canAttemptImmersiveAR, false);

  // A3: Missing navigator.xr (typical desktop browser)
  const capMissingXR = await detectARCapabilities({
    isSecureContext: true,
    hasWebGL: true,
    hasNavigatorXR: false,
  });
  assert.equal(capMissingXR.readinessState, 'webxr_api_missing');
  assert.equal(capMissingXR.canAttemptImmersiveAR, false);
  assert.equal(capMissingXR.recommendedMode, 'manually_calibrated_placement_preview');

  // A4: Permissions-Policy blocked (iframe/container block)
  const capPolicyBlocked = await detectARCapabilities({
    isSecureContext: true,
    hasWebGL: true,
    hasNavigatorXR: true,
    permissionsPolicyBlocked: true,
  });
  assert.equal(capPolicyBlocked.readinessState, 'permissions_policy_blocked');
  assert.equal(capPolicyBlocked.canAttemptImmersiveAR, false);
  assert.equal(capPolicyBlocked.recommendedMode, 'manually_calibrated_placement_preview');

  // A5: navigator.xr exists, but immersive-ar is unsupported on hardware
  const capUnsupportedDevice = await detectARCapabilities({
    isSecureContext: true,
    hasWebGL: true,
    hasNavigatorXR: true,
    immersiveArSupported: false,
  });
  assert.equal(capUnsupportedDevice.readinessState, 'immersive_ar_unsupported_device');
  assert.equal(capUnsupportedDevice.canAttemptImmersiveAR, false);
  assert.equal(capUnsupportedDevice.recommendedMode, 'manually_calibrated_placement_preview');

  // A6: Camera permission denied
  const capPermDenied = await detectARCapabilities({
    isSecureContext: true,
    hasWebGL: true,
    hasNavigatorXR: true,
    immersiveArSupported: true,
    cameraPermissionState: 'denied',
  });
  assert.equal(capPermDenied.readinessState, 'permission_denied_by_user');
  assert.equal(capPermDenied.canAttemptImmersiveAR, false);

  // A7: Supported WebXR immersive-ar + hit-test hardware
  const capSupported = await detectARCapabilities({
    isSecureContext: true,
    hasWebGL: true,
    hasWebGL2: true,
    hasNavigatorXR: true,
    immersiveArSupported: true,
    hitTestSupported: true,
    domOverlaySupported: true,
  });
  assert.equal(capSupported.readinessState, 'ready_for_immersive_ar');
  assert.equal(capSupported.canAttemptImmersiveAR, true);
  assert.equal(capSupported.recommendedMode, 'immersive_ar_webxr');
  assert.equal(capSupported.cameraPermissionState, 'not_requested_yet');

  console.log('  ✓ Group A passed (7 capability & fallback routing scenarios verified).');

  // =========================================================================
  // GROUP B: Model Preparation & Unit Normalization Tests
  // =========================================================================
  console.log('• Group B: Model Preparation & Unit Normalization Tests...');

  // B1: Feet project converts to metres exactly once (1 ft = 0.3048 m)
  assert.equal(getUnitToMetresFactor('feet'), 0.3048);
  assert.equal(getUnitToMetresFactor('metres'), 1.0);

  const preflightFeet = prepareARModelPreflight(sampleFeetProject);
  assert.equal(preflightFeet.sourceUnit, 'feet');
  assert.equal(preflightFeet.targetARUnit, 'metres');
  assert.equal(preflightFeet.unitToMetresFactor, FEET_TO_METRES);
  assert.equal(
    preflightFeet.plotDimensionsMetres.widthM,
    Number((sampleFeetProject.plotWidth * 0.3048).toFixed(4))
  );
  assert.equal(
    preflightFeet.plotDimensionsMetres.lengthM,
    Number((sampleFeetProject.plotLength * 0.3048).toFixed(4))
  );
  assert.equal(preflightFeet.isValidForAR, true);

  // B2: Metres project preserves 1.0 factor without double conversion
  const preflightMetres = prepareARModelPreflight(sampleMetresProject);
  assert.equal(preflightMetres.sourceUnit, 'metres');
  assert.equal(preflightMetres.unitToMetresFactor, 1.0);
  assert.equal(preflightMetres.plotDimensionsMetres.widthM, sampleMetresProject.plotWidth);
  assert.equal(preflightMetres.plotDimensionsMetres.lengthM, sampleMetresProject.plotLength);
  assert.equal(preflightMetres.isValidForAR, true);

  // B3: Scale presets (1:1, 1:10, 1:20, 1:50, 1:100) scale display dimensions accurately
  const cfgTabletop = applyManualPlacementAdjustment(
    createDefaultARSiteVisualizationConfig(sampleMetresProject),
    { scalePreset: '1:20' }
  );
  const preflightTabletop = prepareARModelPreflight(sampleMetresProject, cfgTabletop);
  assert.equal(preflightTabletop.scaledDisplayDimensionsMetres.scaleFactor, 0.05);
  assert.equal(
    preflightTabletop.scaledDisplayDimensionsMetres.widthM,
    Number((sampleMetresProject.plotWidth * 0.05).toFixed(4))
  );

  console.log('  ✓ Group B passed (feet/metres normalization & tabletop scaling verified).');

  // =========================================================================
  // GROUP C: Placement & Transformation Logic Tests
  // =========================================================================
  console.log('• Group C: Placement & Transformation Logic Tests...');

  const baseCfg = createDefaultARSiteVisualizationConfig(sampleFeetProject, capSupported);
  const transformDefault = computeARPlacementTransform(sampleFeetProject, baseCfg.placement, {
    x: 1.25,
    y: -0.5,
    z: -3.4,
  });
  assert.equal(transformDefault.positionMetres.x, 1.25);
  assert.equal(transformDefault.positionMetres.y, -0.5);
  assert.equal(transformDefault.positionMetres.z, -3.4);
  assert.equal(transformDefault.uniformScaleMetresPerProjectUnit, 0.3048);
  assert.equal(transformDefault.matrix16.length, 16);
  assert.equal(transformDefault.matrix16.every((n) => Number.isFinite(n)), true);

  // C2: Manual yaw, X/Z/Y offset adjustments, and southwest corner anchor shift
  const adjustedCfg = applyManualPlacementAdjustment(baseCfg, {
    anchorOriginMode: 'plot_southwest_corner',
    yawRotationDeg: 45,
    offsetXMetres: 2.0,
    offsetZMetres: -1.5,
    elevationOffsetYMetres: 0.25,
  });
  assert.equal(adjustedCfg.placement.alignmentMethod, 'webxr_hit_test_with_manual_yaw_offset');
  assert.equal(adjustedCfg.placement.isGeospatiallyRegistered, false);

  const transformAdjusted = computeARPlacementTransform(
    sampleFeetProject,
    adjustedCfg.placement,
    { x: 1.0, y: 0.0, z: -2.0 }
  );
  assert.equal(transformAdjusted.positionMetres.x, 3.0);
  assert.equal(transformAdjusted.positionMetres.y, 0.25);
  assert.equal(transformAdjusted.positionMetres.z, -3.5);
  assert.equal(transformAdjusted.totalYawDeg, 45);
  const expectedHalfW = Number(((sampleFeetProject.plotWidth * 0.3048) / 2).toFixed(4));
  const expectedHalfL = Number((-(sampleFeetProject.plotLength * 0.3048) / 2).toFixed(4));
  assert.equal(transformAdjusted.anchorLocalOffsetMetres.x, expectedHalfW);
  assert.equal(transformAdjusted.anchorLocalOffsetMetres.z, expectedHalfL);

  // C3: Reset placement restores origin and zero offsets
  const resetCfg = resetARPlacementToDefault(sampleFeetProject, adjustedCfg);
  assert.equal(resetCfg.placement.yawRotationDeg, 0);
  assert.equal(resetCfg.placement.offsetXMetres, 0);
  assert.equal(resetCfg.placement.offsetZMetres, 0);
  assert.equal(resetCfg.placement.elevationOffsetYMetres, 0);
  assert.equal(resetCfg.placement.anchorOriginMode, 'plot_center');

  console.log('  ✓ Group C passed (placement matrices, anchor origins, and reset verified).');

  // =========================================================================
  // GROUP D: Session Lifecycle, Privacy Guards & Cleanup Tests
  // =========================================================================
  console.log('• Group D: Session Lifecycle, Privacy Guards & Cleanup Tests...');

  const controller = new ARSessionController('immersive_ar_webxr');
  const initialSt = controller.getState();
  assert.equal(initialSt.privacyGuard.cameraPermissionRequestedOnlyOnClick, true);
  assert.equal(initialSt.privacyGuard.rawCameraFramesStoredOrUploaded, false);
  assert.equal(initialSt.privacyGuard.environmentMeshStoredOrUploaded, false);

  // D1: Attempt to start without explicit user click gesture is blocked
  const blockedStart = await controller.requestStartImmersiveAR({
    triggeredByUserGesture: false,
    capabilityReport: capSupported,
  });
  assert.equal(blockedStart.lifecycleState, 'session_error');
  assert.ok(blockedStart.lastErrorMessage?.includes('user click gesture'));

  // D2: Start with explicit user gesture + mock XR session adapter with hit-test
  let mockSessionEndedCount = 0;
  let customCleanupCalledCount = 0;
  controller.registerCleanupCallback(() => {
    customCleanupCalledCount += 1;
  });

  const startedSt = await controller.requestStartImmersiveAR({
    triggeredByUserGesture: true,
    capabilityReport: capSupported,
    sessionAdapter: {
      requestSession: async () => ({
        referenceSpaceType: 'local-floor',
        hitTestSourceAvailable: true,
        end: async () => {
          mockSessionEndedCount += 1;
        },
      }),
    },
  });
  assert.equal(startedSt.lifecycleState, 'searching_for_surface');
  assert.equal(startedSt.activeMode, 'immersive_ar_webxr');
  assert.equal(startedSt.referenceSpaceType, 'local-floor');

  // D3: Reticle surface hit detection -> placement confirmation -> tracking degradation & recovery
  const reticleSt = controller.updateHitTestReticle({ x: 0.4, y: -1.1, z: -2.8 });
  assert.equal(reticleSt.lifecycleState, 'surface_reticle_ready');
  assert.equal(reticleSt.reticleVisible, true);
  assert.deepEqual(reticleSt.reticleHitPoseMetres, { x: 0.4, y: -1.1, z: -2.8 });

  const placedSt = controller.confirmModelPlacementAtReticle();
  assert.equal(placedSt.lifecycleState, 'model_placed_tracking');
  assert.equal(placedSt.reticleVisible, false);
  assert.deepEqual(placedSt.placedAnchorPoseMetres, { x: 0.4, y: -1.1, z: -2.8 });

  const degradedSt = controller.reportTrackingQuality('limited_insufficient_features');
  assert.equal(degradedSt.lifecycleState, 'tracking_limited_or_lost');
  assert.equal(degradedSt.trackingQuality, 'limited_insufficient_features');

  const recoveredSt = controller.reportTrackingQuality('normal_tracking');
  assert.equal(recoveredSt.lifecycleState, 'model_placed_tracking');

  // D4: Deterministic teardown & cleanup
  const endedSt = await controller.endSessionAndCleanup();
  assert.equal(endedSt.lifecycleState, 'session_ended');
  assert.equal(endedSt.cleanupCompleted, true);
  assert.equal(mockSessionEndedCount, 1);
  assert.equal(customCleanupCalledCount, 1);

  console.log('  ✓ Group D passed (user-gesture guard, hit-test reticle, tracking loss, and teardown verified).');

  // =========================================================================
  // GROUP E: UI, Privacy & Workflow Honesty Tests
  // =========================================================================
  console.log('• Group E: UI, Privacy & Workflow Honesty Tests...');

  const report = generateARSiteVisualizationReport(
    sampleFeetProject,
    adjustedCfg,
    capMissingXR,
    endedSt
  );
  assert.equal(report.profileId, AR_SITE_VISUALIZATION_PROFILE_ID);
  assert.equal(report.sessionStateSummary.isGeospatiallyRegistered, false);
  assert.equal(report.hardwareVerificationDisclosure.automatedAndMockedTestsExecuted, true);
  assert.equal(
    report.hardwareVerificationDisclosure.physicalMobileARHardwareTestedInCurrentEnv,
    false
  );

  const mdText = exportARSiteVisualizationReport(report, 'markdown');
  const jsonText = exportARSiteVisualizationReport(report, 'json');
  assert.ok(mdText.includes('Visual Overlay Only — Not a Survey or Engineering Instrument'));
  assert.ok(mdText.includes('Physical mobile AR hardware testing'));
  const parsedJson = JSON.parse(jsonText);
  assert.equal(parsedJson.profileId, AR_SITE_VISUALIZATION_PROFILE_ID);

  console.log('  ✓ Group E passed (non-survey provenance, privacy, and hardware disclosure verified).');

  // =========================================================================
  // GROUP F: Cross-Feature Compatibility Tests (P41–P47)
  // =========================================================================
  console.log('• Group F: Cross-Feature Compatibility Tests (P41–P47)...');

  // Enrich project with P43 Terrain, P46 Envelope, P47 Site Logistics, and P42 CAD 2D-only entities
  let multiDisciplineProject = structuredClone(sampleMetresProject);

  // Add P43 Terrain
  const terrainFixture = SAMPLE_TERRAIN_FIXTURES[0];
  const terrainDs = parseTerrainInputToDataset({
    fileName: terrainFixture.fileName,
    fileSizeBytes: terrainFixture.content.length,
    rawContent: terrainFixture.content,
  });
  const terrainCal = buildDefaultTerrainCalibration(terrainDs, multiDisciplineProject);
  const terrainEval = evaluateTerrainModelForProject(terrainDs, terrainCal, multiDisciplineProject);
  multiDisciplineProject = applyTerrainModelToProject(
    multiDisciplineProject,
    terrainDs,
    terrainCal,
    terrainEval,
    {
      showSurfaceIn3D: true,
      showContoursIn2D: true,
      showElevationPoints: true,
      verticalExaggerationDisplayOnly: 1.0,
    }
  ).updatedProject;

  // Add P46 Envelope
  const envEval = createInitialEnvelopeAssessment(multiDisciplineProject);
  multiDisciplineProject = applyEnvelopeAssessmentToProject(multiDisciplineProject, envEval, {
    saveAsScenario: false,
  });

  // Add P47 Site Logistics
  const logPlan = initializeSiteLogisticsPlan(multiDisciplineProject);
  multiDisciplineProject = applySiteLogisticsPlanToProject(multiDisciplineProject, logPlan).updatedProject;

  // Add P42 CAD 2D-only reference entities to verify they are excluded from 3D fabrication
  multiDisciplineProject.cadInterop = {
    version: 'plotify-cad-meta-v1',
    provenanceMappings: [],
    referenceEntities: [
      {
        handle: 'CAD-H1',
        dxfType: 'TEXT',
        layer: 'A-ANNO-NOTE',
        floorLevel: 1,
        boundsInTargetUnits: { minX: 2, minY: 3, maxX: 4, maxY: 3.5, width: 2, length: 0.5 },
        textContent: 'NORTH PROPERTY LINE NOTE',
      },
    ],
    unsupportedEntitySummary: {},
  };

  const multiConfig = createDefaultARSiteVisualizationConfig(multiDisciplineProject, capSupported);
  const built = buildARSiteCompleteThreeGroup(multiDisciplineProject, multiConfig);

  assert.equal(built.preflight.terrainTriangleCount > 0, true);
  assert.equal(built.preflight.logisticsZoneCount > 0, true);
  assert.equal(built.preflight.cad2DOnlySkippedCount, 1);
  assert.ok(
    built.preflight.validationWarnings.some((w) => w.includes('2D CAD reference'))
  );

  // Verify Three.js scene graph contains P43 Terrain, P46 Envelope, P47 Logistics, and P48 Scale Reference subgroups
  assert.ok(built.rootGroup.getObjectByName('P43_TerrainSurface'));
  assert.ok(built.rootGroup.getObjectByName('P46_EnvelopeHighlights'));
  assert.ok(built.rootGroup.getObjectByName('P47_SiteLogisticsOverlay'));
  assert.ok(built.rootGroup.getObjectByName('P48_ScaleReferenceMarkers'));

  // Clean up Three.js geometries/materials
  disposeThreeHierarchy(built.rootGroup);

  // Verify persistence & staleness detection
  const savedProj = applyARSiteConfigToProject(
    multiDisciplineProject,
    multiConfig,
    capSupported,
    false
  );
  assert.equal(checkARSiteVisualizationStaleness(savedProj).isStale, false);

  const mutatedProj = {
    ...savedProj,
    plotWidth: savedProj.plotWidth + 5,
  };
  const staleCheck = checkARSiteVisualizationStaleness(mutatedProj);
  assert.equal(staleCheck.isStale, true);
  assert.ok(staleCheck.reason);

  console.log('  ✓ Group F passed (P41–P47 3D layer assembly, CAD 2D filter, and staleness verified).');

  // =========================================================================
  // GROUP G: Negative & Stress Tests
  // =========================================================================
  console.log('• Group G: Negative & Stress Tests...');

  // G1: Project with 0 rooms or invalid plot dimensions is caught by preflight
  const emptyRoomsProject = {
    ...structuredClone(sampleMetresProject),
    plotWidth: -10,
    floorPlan: { rooms: [] },
  };
  const invalidPreflight = prepareARModelPreflight(emptyRoomsProject);
  assert.equal(invalidPreflight.isValidForAR, false);
  assert.equal(invalidPreflight.performanceBudgetStatus, 'invalid_geometry');
  assert.equal(invalidPreflight.validationErrors.length >= 2, true);

  // G2: Extreme manual offsets and yaw angles are clamped deterministically
  const clampedCfg = applyManualPlacementAdjustment(baseCfg, {
    yawRotationDeg: 725,
    offsetXMetres: 9999,
    offsetZMetres: -9999,
    elevationOffsetYMetres: -500,
  });
  assert.equal(clampedCfg.placement.yawRotationDeg, 180);
  assert.equal(clampedCfg.placement.offsetXMetres, 100);
  assert.equal(clampedCfg.placement.offsetZMetres, -100);
  assert.equal(clampedCfg.placement.elevationOffsetYMetres, -25);

  // G3: Permission rejection during session startup falls back cleanly to Mode C
  const controllerReject = new ARSessionController('immersive_ar_webxr');
  const rejectedSt = await controllerReject.requestStartImmersiveAR({
    triggeredByUserGesture: true,
    capabilityReport: capSupported,
    sessionAdapter: {
      requestSession: async () => {
        const err = new Error('User denied camera permission');
        err.name = 'NotAllowedError';
        throw err;
      },
    },
  });
  assert.equal(rejectedSt.lifecycleState, 'session_error');
  assert.equal(rejectedSt.activeMode, 'manually_calibrated_placement_preview');
  assert.ok(rejectedSt.lastErrorMessage?.includes('permission was denied'));

  console.log('  ✓ Group G passed (invalid geometry preflight, clamping, and permission rejection verified).');
  console.log('\n✓ ALL P48 AUGMENTED REALITY SITE VISUALIZATION VERIFICATION CHECKS PASSED!\n');
}

runTests().catch((err) => {
  console.error('✗ P48 Verification Suite Failed:', err);
  process.exit(1);
});
