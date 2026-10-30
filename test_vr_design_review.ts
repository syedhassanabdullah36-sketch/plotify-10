/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * PLOTIFY — P49 Immersive VR Design Review Verification Suite (Suite 21)
 * Covers Groups A through I (Section 18 of P49 Specification):
 * - Group A: Capability detection
 * - Group B: Session lifecycle
 * - Group C: Model geometry and coordinates
 * - Group D: Navigation and controller interactions
 * - Group E: Annotations and bookmarks
 * - Group F: P41–P48 coexistence
 * - Group G: Persistence and state safety
 * - Group H: Performance and resource teardown
 * - Group I: User experience and fallback
 */

import assert from 'node:assert/strict';

// Mock localStorage in Node CLI environment so versioningService snapshots persist in memory
if (typeof globalThis.localStorage === 'undefined') {
  const memoryStorage = new Map<string, string>();
  (globalThis as any).localStorage = {
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
}

import { INITIAL_SAMPLE_PROJECTS } from './src/services/storage';
import { Project } from './src/types/project';
import {
  VR_DESIGN_REVIEW_PROFILE_ID,
  VRScalePreset,
} from './src/types/vrDesignReview';
import {
  FEET_TO_METRES,
  VR_SCALE_PRESET_MULTIPLIERS,
  MAX_RECOMMENDED_VR_TRIANGLES,
  MAX_ANNOTATIONS_PER_PROJECT,
  getUnitToMetresFactor,
  computeVRModelGeometryFingerprint,
  detectVRCapabilities,
  createDefaultVRDesignReviewConfig,
  computeVRSceneTransform,
  prepareVRModelPreflight,
  buildVRCrossDisciplineDigests,
  buildVRDesignReviewThreeGroup,
  resolveVRControllerRayTarget,
  validateVRTeleportDestination,
  computeSnapTurnYaw,
  computeViewpointForPreset,
  createVRReviewAnnotation,
  updateVRReviewAnnotation,
  deleteVRReviewAnnotation,
  resolveAnnotationAnchorsAgainstProject,
  createVRReviewBookmark,
  VRSessionController,
  getSafeVRDesignReviewState,
  applyVRDesignReviewStateToProject,
  checkVRDesignReviewStaleness,
  generateVRDesignReviewReport,
  exportVRDesignReviewReport,
  disposeThreeHierarchy,
} from './src/services/vrDesignReviewService';
import {
  parseIFCToIntermediateModel,
  mapIFCIntermediateToPlotify,
  applyIFCMappingToExistingProject,
  SAMPLE_IFC_FIXTURES,
} from './src/services/ifcService';
import {
  parseTerrainInputToDataset,
  buildDefaultTerrainCalibration,
  evaluateTerrainModelForProject,
  applyTerrainModelToProject,
  SAMPLE_TERRAIN_FIXTURES,
} from './src/services/terrainService';
import {
  createInitialProjectCarbonAssessment,
  applyCarbonAssessmentToProject,
} from './src/services/carbonService';
import {
  createDefaultClimateResilienceConfig,
  runClimateHazardResilienceAssessment,
  applyClimateAssessmentToProject,
} from './src/services/climateResilienceService';
import {
  createInitialEnvelopeAssessment,
  applyEnvelopeAssessmentToProject,
} from './src/services/envelopeService';
import {
  initializeSiteLogisticsPlan,
  applySiteLogisticsPlanToProject,
} from './src/services/siteLogisticsService';
import {
  detectARCapabilities,
  createDefaultARSiteVisualizationConfig,
  applyARSiteConfigToProject,
} from './src/services/arSiteVisualizationService';
import {
  getProjectSnapshots,
  executeSafeRestore,
} from './src/services/versioningService';

function assertApprox(actual: number, expected: number, tolerance: number, msg: string) {
  assert.ok(
    Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
    `${msg} (expected ${expected} ± ${tolerance}, got ${actual})`
  );
}

async function runTests() {
  console.log('================================================================');
  console.log('P49 — IMMERSIVE VR DESIGN REVIEW VERIFICATION SUITE (SUITE 21)');
  console.log('================================================================\n');

  const sampleFeetProject: Project = structuredClone(INITIAL_SAMPLE_PROJECTS[0]); // 40×60 feet
  const sampleMetresProject: Project = structuredClone(INITIAL_SAMPLE_PROJECTS[1]); // metres

  // =========================================================================
  // GROUP A: Capability Detection Tests
  // =========================================================================
  console.log('• Group A: Capability Detection Tests...');

  // A1: navigator.xr unavailable
  const capNoXR = await detectVRCapabilities({
    isSecureContext: true,
    hasWebGL: true,
    navigatorXR: null,
    userAgentString: 'Mozilla/5.0 (X11; Linux x86_64) Quest 3 VR Browser', // UA must NEVER trick capability detector
  });
  assert.equal(capNoXR.hasNavigatorXR, false);
  assert.equal(capNoXR.immersiveVRSupported, false);
  assert.equal(capNoXR.inferredFromUserAgent, false);
  assert.equal(capNoXR.blockerCode, 'WEBXR_API_MISSING');
  assert.equal(capNoXR.recommendedMode, 'standard_3d_design_review');
  assert.equal(capNoXR.fallbackModeAvailable, true);

  // A2: isSessionSupported('immersive-vr') returns false
  const capUnsupported = await detectVRCapabilities({
    isSecureContext: true,
    hasWebGL: true,
    navigatorXR: {
      isSessionSupported: async (mode: string) => mode === 'inline',
    },
  });
  assert.equal(capUnsupported.hasNavigatorXR, true);
  assert.equal(capUnsupported.immersiveVRSupported, false);
  assert.equal(capUnsupported.blockerCode, 'IMMERSIVE_VR_NOT_SUPPORTED');
  assert.equal(capUnsupported.recommendedMode, 'standard_3d_design_review');

  // A3: isSessionSupported('immersive-vr') rejects
  const capRejected = await detectVRCapabilities({
    isSecureContext: true,
    hasWebGL: true,
    navigatorXR: {
      isSessionSupported: async () => {
        throw new Error('OpenXR runtime disconnected');
      },
    },
  });
  assert.equal(capRejected.immersiveVRSupported, false);
  assert.equal(capRejected.blockerCode, 'IMMERSIVE_VR_CHECK_REJECTED');
  assert.ok(capRejected.probeErrorMessage?.includes('OpenXR runtime disconnected'));
  assert.equal(capRejected.recommendedMode, 'standard_3d_design_review');

  // A4: Secure context unavailable (HTTP)
  const capInsecure = await detectVRCapabilities({
    isSecureContext: false,
    hasWebGL: true,
    navigatorXR: {
      isSessionSupported: async () => true,
    },
  });
  assert.equal(capInsecure.isSecureContext, false);
  assert.equal(capInsecure.immersiveVRSupported, false);
  assert.equal(capInsecure.blockerCode, 'INSECURE_CONTEXT_HTTP');
  assert.equal(capInsecure.recommendedMode, 'standard_3d_design_review');

  // A5: WebGL renderer unavailable
  const capNoWebGL = await detectVRCapabilities({
    isSecureContext: true,
    hasWebGL: false,
    navigatorXR: {
      isSessionSupported: async () => true,
    },
  });
  assert.equal(capNoWebGL.hasWebGL, false);
  assert.equal(capNoWebGL.immersiveVRSupported, false);
  assert.equal(capNoWebGL.blockerCode, 'WEBGL_UNAVAILABLE');
  assert.equal(capNoWebGL.fallbackModeAvailable, false);

  // A6: Permissions-Policy blocks xr-spatial-tracking
  const capPolicyBlocked = await detectVRCapabilities({
    isSecureContext: true,
    hasWebGL: true,
    permissionsPolicyAllowsXR: false,
    navigatorXR: {
      isSessionSupported: async () => true,
    },
  });
  assert.equal(capPolicyBlocked.permissionsPolicyBlocked, true);
  assert.equal(capPolicyBlocked.immersiveVRSupported, false);
  assert.equal(capPolicyBlocked.blockerCode, 'PERMISSIONS_POLICY_XR_BLOCKED');
  assert.equal(capPolicyBlocked.recommendedMode, 'standard_3d_design_review');

  // A7: Document unfocused/hidden blocks immediate immersive entry
  const capUnfocused = await detectVRCapabilities({
    isSecureContext: true,
    hasWebGL: true,
    documentVisibilityState: 'hidden',
    documentHasFocus: false,
    navigatorXR: {
      isSessionSupported: async () => true,
    },
  });
  assert.equal(capUnfocused.immersiveVRSupported, true);
  assert.equal(capUnfocused.documentVisibleAndFocused, false);
  assert.equal(capUnfocused.blockerCode, 'DOCUMENT_HIDDEN_OR_UNFOCUSED');
  assert.equal(capUnfocused.recommendedMode, 'standard_3d_design_review');

  // A8: Immersive VR supported with full readiness
  const capSupported = await detectVRCapabilities({
    isSecureContext: true,
    hasWebGL: true,
    documentVisibilityState: 'visible',
    documentHasFocus: true,
    permissionsPolicyAllowsXR: true,
    navigatorXR: {
      isSessionSupported: async (mode: string) => mode === 'immersive-vr',
    },
  });
  assert.equal(capSupported.immersiveVRSupported, true);
  assert.equal(capSupported.blockerCode, 'NONE');
  assert.equal(capSupported.recommendedMode, 'immersive_vr_webxr');
  assert.equal(capSupported.inferredFromUserAgent, false);

  console.log('  ✓ Group A passed (8 capability & fallback routing scenarios verified).');

  // =========================================================================
  // GROUP B: Session Lifecycle Tests
  // =========================================================================
  console.log('• Group B: Session Lifecycle Tests...');

  const defaultCfg = createDefaultVRDesignReviewConfig(sampleFeetProject, capSupported);
  const controller = new VRSessionController(sampleFeetProject, defaultCfg);

  // B1: Programmatic start without explicit user gesture must be rejected
  const blockedNoGesture = await controller.startImmersiveVRSession({
    userGestureConfirmed: false,
    project: sampleFeetProject,
    config: defaultCfg,
    capabilityReport: capSupported,
  });
  assert.equal(blockedNoGesture.phase, 'session-error');
  assert.equal(blockedNoGesture.activeMode, 'standard_3d_design_review');
  assert.ok(blockedNoGesture.lastErrorMessage?.includes('USER_GESTURE_REQUIRED'));
  assert.equal(blockedNoGesture.privacyGuard.userGestureConfirmedForSessionStart, false);

  // Create a mocked WebXR session & renderer to verify lifecycle events, listener cleanup, and renderer restoration
  const sessionListeners = new Map<string, Set<(...args: any[]) => void>>();
  let sessionEndedCalled = false;
  const mockXRSession = {
    visibilityState: 'visible',
    inputSources: [
      {
        id: 'right-ctrl',
        handedness: 'right',
        targetRayMode: 'tracked-pointer',
        profiles: ['oculus-touch-v3'],
        gripSpace: {},
        gamepad: { axes: [0, 0, 0, 0], buttons: [{}, {}, {}, {}] },
      },
    ],
    requestReferenceSpace: async (type: string) => {
      if (type === 'local-floor') return { type: 'local-floor' };
      throw new Error('Unsupported ref space');
    },
    addEventListener: (evt: string, fn: (...args: any[]) => void) => {
      if (!sessionListeners.has(evt)) sessionListeners.set(evt, new Set());
      sessionListeners.get(evt)!.add(fn);
    },
    removeEventListener: (evt: string, fn: (...args: any[]) => void) => {
      sessionListeners.get(evt)?.delete(fn);
    },
    end: async () => {
      sessionEndedCalled = true;
    },
  };

  let currentPixelRatio = 1.75;
  const mockRenderer = {
    getPixelRatio: () => currentPixelRatio,
    setPixelRatio: (r: number) => {
      currentPixelRatio = r;
    },
    shadowMap: { enabled: true },
    toneMappingExposure: 1.15,
    xr: {
      enabled: false,
      setSession: async () => {},
    },
    setAnimationLoop: (_cb: any) => {},
  };

  // B2: Successful session start after explicit user action
  const startedState = await controller.startImmersiveVRSession({
    userGestureConfirmed: true,
    project: sampleFeetProject,
    config: defaultCfg,
    capabilityReport: capSupported,
    renderer: mockRenderer,
    navigatorXROverride: {
      requestSession: async () => mockXRSession,
    },
  });
  assert.equal(startedState.phase, 'immersive-vr-active');
  assert.equal(startedState.activeMode, 'immersive_vr_webxr');
  assert.equal(startedState.activeReferenceSpace, 'local-floor');
  assert.equal(startedState.activeAnimationLoopCount, 1);
  assert.equal(startedState.connectedInputSources.length, 1);
  assert.equal(startedState.connectedInputSources[0].handedness, 'right');
  assert.equal(mockRenderer.shadowMap.enabled, false, 'Real-time shadows disabled during VR for frame pacing');
  assert.equal(mockRenderer.xr.enabled, true);

  // B3: Duplicate start call while active does not create duplicate loops
  const duplicateAttempt = await controller.startImmersiveVRSession({
    userGestureConfirmed: true,
    project: sampleFeetProject,
    config: defaultCfg,
    capabilityReport: capSupported,
    renderer: mockRenderer,
    navigatorXROverride: {
      requestSession: async () => mockXRSession,
    },
  });
  assert.equal(duplicateAttempt.activeAnimationLoopCount, 1);
  assert.equal(duplicateAttempt.enterCycleCount, 1);

  // B4: Visibility change event (headset system guardian / menu blurred)
  const visHandlers = sessionListeners.get('visibilitychange');
  assert.ok(visHandlers && visHandlers.size > 0);
  for (const fn of visHandlers!) {
    fn({ session: { visibilityState: 'visible-blurred' } });
  }
  assert.equal(controller.getState().phase, 'immersive-vr-hidden-blurred');

  for (const fn of visHandlers!) {
    fn({ session: { visibilityState: 'visible' } });
  }
  assert.equal(controller.getState().phase, 'immersive-vr-active');

  // B5: User exits through supported control; renderer restored and listeners removed
  const exitedState = await controller.exitImmersiveVRSession();
  assert.equal(exitedState.phase, 'session-ended');
  assert.equal(exitedState.activeMode, 'standard_3d_design_review');
  assert.equal(exitedState.activeAnimationLoopCount, 0);
  assert.equal(exitedState.registeredListenerCount, 0);
  assert.equal(sessionEndedCalled, true);
  assert.equal(mockRenderer.shadowMap.enabled, true, 'Renderer shadowMap state restored after exit');
  assert.equal(mockRenderer.xr.enabled, false, 'Renderer xr.enabled restored after exit');

  // B6: Startup rejection handled cleanly without crashing or leaving VR active
  const rejectedStart = await controller.startImmersiveVRSession({
    userGestureConfirmed: true,
    project: sampleFeetProject,
    config: defaultCfg,
    capabilityReport: capSupported,
    renderer: mockRenderer,
    navigatorXROverride: {
      requestSession: async () => {
        throw new Error('Headset USB link lost during startup');
      },
    },
  });
  assert.equal(rejectedStart.phase, 'session-error');
  assert.equal(rejectedStart.activeMode, 'standard_3d_design_review');
  assert.equal(rejectedStart.activeAnimationLoopCount, 0);
  assert.ok(rejectedStart.lastErrorMessage?.includes('Headset USB link lost'));

  // B7: Runtime interruption during active session recovers to Standard 3D review
  await controller.startImmersiveVRSession({
    userGestureConfirmed: true,
    project: sampleFeetProject,
    config: defaultCfg,
    capabilityReport: capSupported,
    renderer: mockRenderer,
    navigatorXROverride: {
      requestSession: async () => mockXRSession,
    },
  });
  const interruptedState = controller.handleUnexpectedSessionInterruption('Headset battery depleted');
  assert.equal(interruptedState.phase, 'session-interrupted');
  assert.equal(interruptedState.activeMode, 'standard_3d_design_review');
  assert.equal(interruptedState.activeAnimationLoopCount, 0);
  assert.equal(interruptedState.registeredListenerCount, 0);

  controller.dispose();
  console.log('  ✓ Group B passed (user-gesture guard, startup, visibility, interruption, renderer restore & listener cleanup verified).');

  // =========================================================================
  // GROUP C: Model Geometry and Coordinates Tests
  // =========================================================================
  console.log('• Group C: Model Geometry and Coordinates Tests...');

  // C1: Feet normalization (50ft × 80ft -> 15.24m × 24.384m)
  const feetPreflight = prepareVRModelPreflight(sampleFeetProject, defaultCfg);
  assert.equal(feetPreflight.isReady, true);
  assert.equal(feetPreflight.sourceUnit, 'feet');
  assertApprox(feetPreflight.plotDimensionsMetresAt1To1.widthM, sampleFeetProject.plotWidth * 0.3048, 1e-4, `${sampleFeetProject.plotWidth} ft -> metres`);
  assertApprox(feetPreflight.plotDimensionsMetresAt1To1.lengthM, sampleFeetProject.plotLength * 0.3048, 1e-4, `${sampleFeetProject.plotLength} ft -> metres`);

  // C2: Scale multipliers applied exactly once across all presets
  const scalePresets: VRScalePreset[] = ['1:1', '1:10', '1:20', '1:50', '1:100'];
  for (const preset of scalePresets) {
    const cfgAtScale = { ...defaultCfg, scalePreset: preset };
    const tfFeet = computeVRSceneTransform(sampleFeetProject, cfgFeetCfg(cfgAtScale));
    const expectedFactor = Number((0.3048 * VR_SCALE_PRESET_MULTIPLIERS[preset]).toFixed(8));
    assertApprox(
      tfFeet.combinedScaleFactor,
      expectedFactor,
      1e-7,
      `Feet project at ${preset} must apply 0.3048 * ${VR_SCALE_PRESET_MULTIPLIERS[preset]} once`
    );

    const tfMetres = computeVRSceneTransform(sampleMetresProject, cfgAtScale);
    assertApprox(
      tfMetres.combinedScaleFactor,
      VR_SCALE_PRESET_MULTIPLIERS[preset],
      1e-7,
      `Metres project at ${preset} must apply 1.0 * ${VR_SCALE_PRESET_MULTIPLIERS[preset]} once`
    );
    assert.equal(tfMetres.coordinateConvention.yAxis, '+Y Vertical Up in metres');
    assert.equal(tfMetres.isVirtualSceneOnly, true);
    assert.equal(tfMetres.isGeospatiallyRegistered, false);
    assert.equal(tfMetres.inheritsARRegistration, false);
    assert.ok(tfMetres.worldMatrix4x4.every((n) => Number.isFinite(n)));
  }

  function cfgFeetCfg(c: typeof defaultCfg) {
    return c;
  }

  // C3: Empty / invalid model blocked by preflight
  const emptyRoomsProj: Project = {
    ...structuredClone(sampleMetresProject),
    floorPlan: { rooms: [] },
  };
  const emptyPreflight = prepareVRModelPreflight(emptyRoomsProj, defaultCfg);
  assert.equal(emptyPreflight.isReady, false);
  assert.ok(emptyPreflight.blockingErrors.some((e) => e.includes('no valid 3D reviewable rooms')));

  // C4: Unconfirmed source units blocked by preflight
  const unconfirmedUnitsCfg = { ...defaultCfg, userConfirmedSourceUnits: false };
  const unconfirmedPreflight = prepareVRModelPreflight(sampleMetresProject, unconfirmedUnitsCfg);
  assert.equal(unconfirmedPreflight.isReady, false);
  assert.ok(unconfirmedPreflight.blockingErrors.some((e) => e.includes('Source measurement unit is unconfirmed')));

  // C5: Invalid floor-level filter warning & missing geometry disclosures
  const invalidFloorCfg = {
    ...defaultCfg,
    layers: { ...defaultCfg.layers, selectedFloor: 9 },
  };
  const invalidFloorPreflight = prepareVRModelPreflight(sampleMetresProject, invalidFloorCfg);
  assert.ok(
    invalidFloorPreflight.validationWarnings.some((w) => w.includes('Floor 9'))
  );
  assert.ok(invalidFloorPreflight.missingDataDisclosures.length >= 2);

  console.log('  ✓ Group C passed (feet/metres normalization, single-pass scaling, and preflight validation verified).');

  // =========================================================================
  // GROUP D: Navigation and Controller Interactions Tests
  // =========================================================================
  console.log('• Group D: Navigation and Controller Interactions Tests...');

  const metresCfg = createDefaultVRDesignReviewConfig(sampleMetresProject, capSupported);
  const builtScene = buildVRDesignReviewThreeGroup(sampleMetresProject, metresCfg, []);
  assert.ok(builtScene.inspectableCount > 0, 'Scene must contain inspectable tagged meshes');

  // D1: Controller ray-target resolution (ray pointing straight down into the first room)
  const firstRoom = sampleMetresProject.floorPlan!.rooms[0];
  const roomWorldX = firstRoom.x + firstRoom.width / 2 - sampleMetresProject.plotWidth / 2;
  const roomWorldZ = firstRoom.y + firstRoom.length / 2 - sampleMetresProject.plotLength / 2;

  const rayHit = resolveVRControllerRayTarget(
    builtScene.rootGroup,
    { x: roomWorldX, y: 10, z: roomWorldZ },
    { x: 0, y: -1, z: 0 },
    sampleMetresProject,
    metresCfg
  );
  assert.equal(rayHit.hit, true);
  assert.equal(rayHit.actionPerformed, 'inspect-only');
  assert.ok(rayHit.targetMetadata);
  assert.equal(rayHit.targetMetadata?.roomId, firstRoom.id);

  // D2: Invalid / non-intersecting ray does not mutate project or crash
  const projSnapshotBeforeRay = JSON.stringify(sampleMetresProject);
  const rayMiss = resolveVRControllerRayTarget(
    builtScene.rootGroup,
    { x: 500, y: 500, z: 500 },
    { x: 0, y: 1, z: 0 },
    sampleMetresProject,
    metresCfg
  );
  assert.equal(rayMiss.hit, false);
  assert.equal(JSON.stringify(sampleMetresProject), projSnapshotBeforeRay, 'Raycasting must never mutate project');

  // D3: Valid teleport destination inside room floor
  const tpValidRoom = validateVRTeleportDestination(
    sampleMetresProject,
    metresCfg,
    { x: roomWorldX, y: 0, z: roomWorldZ },
    { x: roomWorldX, y: 0, z: roomWorldZ }
  );
  assert.equal(tpValidRoom.isValid, true);
  assert.equal(tpValidRoom.reasonCode, 'VALID_ROOM_FLOOR');
  assert.equal(tpValidRoom.resolvedRoomId, firstRoom.id);
  assert.equal(tpValidRoom.physicallyValidatedWalkable, true);
  assertApprox(tpValidRoom.eyePositionWorldMetres!.y, 1.65, 0.05, 'Standing eye height = 1.65m');

  // D4: Seated posture eye height (1.20m)
  const seatedCfg = {
    ...metresCfg,
    navigation: { ...metresCfg.navigation, postureMode: 'seated' as const },
  };
  const tpSeated = validateVRTeleportDestination(
    sampleMetresProject,
    seatedCfg,
    { x: roomWorldX, y: 0, z: roomWorldZ },
    { x: roomWorldX, y: 0, z: roomWorldZ }
  );
  assert.equal(tpSeated.isValid, true);
  assertApprox(tpSeated.eyePositionWorldMetres!.y, 1.2, 0.05, 'Seated eye height = 1.20m');

  // D5: Invalid teleport destinations (outside plot boundary, wall obstacle, exceeds max range, missing floor)
  const tpOutside = validateVRTeleportDestination(
    sampleMetresProject,
    metresCfg,
    { x: 999, y: 0, z: 999 },
    { x: 995, y: 0, z: 995 }
  );
  assert.equal(tpOutside.isValid, false);
  assert.equal(tpOutside.reasonCode, 'OUTSIDE_PLOT_BOUNDARY');

  const tpExceedsRange = validateVRTeleportDestination(
    sampleMetresProject,
    metresCfg,
    { x: roomWorldX, y: 0, z: roomWorldZ },
    { x: roomWorldX + 45, y: 0, z: roomWorldZ }
  );
  assert.equal(tpExceedsRange.isValid, false);
  assert.equal(tpExceedsRange.reasonCode, 'EXCEEDS_MAX_TELEPORT_RANGE');

  // Wall obstacle check (right on the North perimeter wall of firstRoom)
  const northWallX = firstRoom.x + firstRoom.width / 2 - sampleMetresProject.plotWidth / 2;
  const northWallZ = firstRoom.y + 0.05 - sampleMetresProject.plotLength / 2;
  const tpWall = validateVRTeleportDestination(
    sampleMetresProject,
    metresCfg,
    { x: northWallX, y: 0, z: northWallZ },
    { x: northWallX, y: 0, z: northWallZ }
  );
  assert.equal(tpWall.isValid, false);
  assert.equal(tpWall.reasonCode, 'INSIDE_WALL_OBSTACLE');

  const tpNoFloor = validateVRTeleportDestination(
    emptyRoomsProj,
    metresCfg,
    { x: 0, y: 0, z: 0 }
  );
  assert.equal(tpNoFloor.isValid, false);
  assert.equal(tpNoFloor.reasonCode, 'NO_WALKABLE_FLOOR_ESTABLISHED');
  assert.equal(tpNoFloor.physicallyValidatedWalkable, false);

  // D6: Snap-turn increments
  assert.equal(computeSnapTurnYaw(0, 'left', 30), 30);
  assert.equal(computeSnapTurnYaw(0, 'right', 45), -45);
  assert.equal(computeSnapTurnYaw(170, 'left', 30), -160);

  disposeThreeHierarchy(builtScene.rootGroup);
  console.log('  ✓ Group D passed (controller ray target resolution, teleport floor/obstacle validation & snap-turn verified).');

  // =========================================================================
  // GROUP E: Annotations and Bookmarks Tests
  // =========================================================================
  console.log('• Group E: Annotations and Bookmarks Tests...');

  // E1: Reject empty annotation input
  const invalidNoteRes = createVRReviewAnnotation(sampleMetresProject, metresCfg, {
    title: '   ',
    note: 'Valid body',
    category: 'visual-review-note',
    priority: 'low',
  });
  assert.equal(invalidNoteRes.annotation, null);
  assert.ok(invalidNoteRes.error);

  // E2: Create valid room-anchored annotation & verify non-engineering disclaimer
  const validNoteRes = createVRReviewAnnotation(sampleMetresProject, metresCfg, {
    title: 'Daylight & Sightline Check in Living Zone',
    note: 'Verify window sill height relative to seated eye level (1.20m).',
    category: 'spatial-layout-observation',
    priority: 'high',
    targetRoomId: firstRoom.id,
    targetElementId: firstRoom.id,
    targetElementType: 'room',
    targetFloorLevel: firstRoom.floorLevel,
  });
  assert.ok(validNoteRes.annotation);
  const createdNote = validNoteRes.annotation!;
  assert.equal(createdNote.isVerifiedEngineeringRisk, false);
  assert.ok(createdNote.provenanceDisclaimer.includes('not a certified'));
  assert.equal(createdNote.anchorResolutionStatus, 'resolved');
  assert.equal(createdNote.targetRoomId, firstRoom.id);

  // E3: Update annotation
  const updatedNoteRes = updateVRReviewAnnotation(
    createdNote,
    {
      title: 'Updated Sightline Observation',
      status: 'in-review',
    },
    sampleMetresProject
  );
  assert.ok(updatedNoteRes.annotation);
  assert.equal(updatedNoteRes.annotation!.title, 'Updated Sightline Observation');
  assert.equal(updatedNoteRes.annotation!.status, 'in-review');
  assert.equal(updatedNoteRes.annotation!.isVerifiedEngineeringRisk, false);

  // E4: Removed target room marks annotation 'unresolved-target-removed' instead of reassigning to another room
  const projWithRoomRemoved: Project = {
    ...structuredClone(sampleMetresProject),
    floorPlan: {
      rooms: sampleMetresProject.floorPlan!.rooms.slice(1), // remove firstRoom
    },
  };
  const resolvedAfterRemove = resolveAnnotationAnchorsAgainstProject(projWithRoomRemoved, [
    updatedNoteRes.annotation!,
  ]);
  assert.equal(resolvedAfterRemove[0].anchorResolutionStatus, 'unresolved-target-removed');
  assert.equal(resolvedAfterRemove[0].targetRoomId, firstRoom.id, 'Must not silently reassign to another room ID');
  assert.equal(resolvedAfterRemove[0].status, 'needs-reverification');

  // E5: Delete annotation
  const afterDelete = deleteVRReviewAnnotation([createdNote], createdNote.annotationId);
  assert.equal(afterDelete.length, 0);

  // E6: Create viewpoint bookmark
  const bm = createVRReviewBookmark(sampleMetresProject, metresCfg, {
    label: 'Living Room Walkthrough Bookmark',
    presetType: 'room-interior',
    targetRoomId: firstRoom.id,
  });
  assert.ok(bm.bookmarkId.startsWith('vr-bm-'));
  assert.equal(bm.targetRoomId, firstRoom.id);

  console.log('  ✓ Group E passed (annotation CRUD, anchor removal detection, non-engineering provenance & bookmarks verified).');

  // =========================================================================
  // GROUP F: P41–P48 Coexistence Tests
  // =========================================================================
  console.log('• Group F: P41–P48 Coexistence Tests...');

  let fullProject: Project = structuredClone(sampleMetresProject);

  // 1. Apply P41 IFC
  const ifcFixture = SAMPLE_IFC_FIXTURES[0];
  const ifcIr = parseIFCToIntermediateModel({
    fileName: ifcFixture.fileName,
    fileSizeBytes: ifcFixture.content.length,
    rawContent: ifcFixture.content,
    targetUnit: fullProject.unit,
  });
  const ifcMap = mapIFCIntermediateToPlotify(ifcIr, { targetUnit: fullProject.unit });
  fullProject = applyIFCMappingToExistingProject(fullProject, ifcMap, 'merge-append').updatedProject;

  // 2. Apply P42 CAD 2D-only reference entity
  fullProject.cadInterop = {
    version: 'plotify-cad-meta-v1',
    provenanceMappings: [],
    referenceEntities: [
      {
        handle: 'CAD-NOTE-1',
        dxfType: 'MTEXT',
        layer: 'A-ANNO-NOTE',
        floorLevel: 1,
        boundsInTargetUnits: { minX: 1, minY: 1, maxX: 3, maxY: 2, width: 2, length: 1 },
        textContent: '2D BENCHMARK CALLOUT',
      },
    ],
    unsupportedEntitySummary: {},
  };

  // 3. Apply P43 Terrain
  const terrainFix = SAMPLE_TERRAIN_FIXTURES[0];
  const terrainDs = parseTerrainInputToDataset({
    fileName: terrainFix.fileName,
    fileSizeBytes: terrainFix.content.length,
    rawContent: terrainFix.content,
  });
  const terrainCal = buildDefaultTerrainCalibration(terrainDs, fullProject);
  const terrainEval = evaluateTerrainModelForProject(terrainDs, terrainCal, fullProject);
  fullProject = applyTerrainModelToProject(fullProject, terrainDs, terrainCal, terrainEval, {
    showSurfaceIn3D: true,
    showContoursIn2D: true,
    showElevationPoints: true,
    verticalExaggerationDisplayOnly: 1.0,
  }).updatedProject;

  // 4. Apply P44 Whole-Life Carbon
  const carbonEval = createInitialProjectCarbonAssessment(fullProject);
  fullProject = applyCarbonAssessmentToProject(fullProject, carbonEval, {
    saveAsScenario: false,
  }).updatedProject;

  // 5. Apply P45 Climate Hazard & Resilience
  const climateCfg = createDefaultClimateResilienceConfig();
  const climateEval = runClimateHazardResilienceAssessment(fullProject, climateCfg);
  fullProject = applyClimateAssessmentToProject(fullProject, climateEval, [], [], [], false);

  // 6. Apply P46 Building Envelope
  const envEval = createInitialEnvelopeAssessment(fullProject);
  fullProject = applyEnvelopeAssessmentToProject(fullProject, envEval, { saveAsScenario: false });

  // 7. Apply P47 Site Logistics
  const logPlan = initializeSiteLogisticsPlan(fullProject);
  fullProject = applySiteLogisticsPlanToProject(fullProject, logPlan).updatedProject;

  // 8. Apply P48 AR Site Visualization
  const arCap = await detectARCapabilities({ isSecureContext: true, hasWebGL: true, hasNavigatorXR: false });
  const arCfg = createDefaultARSiteVisualizationConfig(fullProject, arCap);
  fullProject = applyARSiteConfigToProject(fullProject, arCfg, arCap, false);

  const arBeforeP49 = JSON.stringify(fullProject.arSiteVisualization);

  // Verify P41–P48 digests
  const digests = buildVRCrossDisciplineDigests(fullProject);
  assert.equal(digests.length, 8);
  const p44Digest = digests.find((d) => d.moduleId === 'P44')!;
  const p45Digest = digests.find((d) => d.moduleId === 'P45')!;
  assert.equal(p44Digest.isAvailableInProject, true);
  assert.equal(p44Digest.representationMode, 'read-only-summary-panel', 'P44 must not invent spatial room heatmaps');
  assert.equal(p45Digest.isAvailableInProject, true);
  assert.equal(p45Digest.representationMode, 'read-only-summary-panel', 'P45 must remain a read-only summary panel');

  // Build P49 3D scene with all spatial layers enabled
  const fullVrCfg = createDefaultVRDesignReviewConfig(fullProject, capSupported);
  fullVrCfg.layers.showP43TerrainSurface = true;
  fullVrCfg.layers.showP46EnvelopeHighlights = true;
  fullVrCfg.layers.showP47SiteLogistics = true;
  fullVrCfg.layers.showReviewAnnotations = true;

  const fullBuilt = buildVRDesignReviewThreeGroup(fullProject, fullVrCfg, [createdNote]);
  assert.equal(fullBuilt.preflight.cad2DOnlySkippedCount, 1, 'P42 2D-only entity skipped from 3D extrusion');
  assert.ok(fullBuilt.rootGroup.getObjectByName('P43_TerrainSurface'));
  assert.ok(fullBuilt.rootGroup.getObjectByName('P46_EnvelopeHighlights'));
  assert.ok(fullBuilt.rootGroup.getObjectByName('P47_SiteLogisticsOverlay'));
  assert.ok(fullBuilt.rootGroup.getObjectByName('P49_ReviewAnnotationMarkers'));

  // Verify toggling one overlay (e.g., hiding P46 Envelope) does not hide P43 Terrain or P47 Logistics
  const noP46Cfg = {
    ...fullVrCfg,
    layers: { ...fullVrCfg.layers, showP46EnvelopeHighlights: false },
  };
  const builtNoP46 = buildVRDesignReviewThreeGroup(fullProject, noP46Cfg, [createdNote]);
  assert.equal(builtNoP46.rootGroup.getObjectByName('P46_EnvelopeHighlights'), undefined);
  assert.ok(builtNoP46.rootGroup.getObjectByName('P43_TerrainSurface'));
  assert.ok(builtNoP46.rootGroup.getObjectByName('P47_SiteLogisticsOverlay'));

  // Verify P48 AR state was not mutated by P49
  assert.equal(JSON.stringify(fullProject.arSiteVisualization), arBeforeP49);

  disposeThreeHierarchy(fullBuilt.rootGroup);
  disposeThreeHierarchy(builtNoP46.rootGroup);
  console.log('  ✓ Group F passed (P41–P48 coexistence, CAD 2D filter, P44/P45 read-only summaries & P48 isolation verified).');

  // =========================================================================
  // GROUP G: Persistence and State Safety Tests
  // =========================================================================
  console.log('• Group G: Persistence and State Safety Tests...');

  // G1: Legacy project with no vrDesignReview property loads safely
  const legacySafe = getSafeVRDesignReviewState(sampleFeetProject);
  assert.equal(legacySafe.annotations.length, 0);
  assert.equal(legacySafe.bookmarks.length, 0);
  assert.equal(legacySafe.config.scalePreset, '1:1');

  // G2: Persist P49 state with pre-apply snapshot & verify unrelated data untouched
  const snapsBeforeP49 = getProjectSnapshots(fullProject).length;
  const { updatedProject: savedVrProj, snapshotId } = applyVRDesignReviewStateToProject(
    fullProject,
    {
      config: fullVrCfg,
      annotations: [createdNote],
      bookmarks: [bm],
      capabilityReport: capSupported,
    },
    true
  );
  const snapsAfterP49 = getProjectSnapshots(savedVrProj).length;
  assert.equal(snapsAfterP49, snapsBeforeP49 + 1, 'Must create pre-apply snapshot before saving P49 state');
  assert.ok(snapshotId);
  assert.equal(savedVrProj.vrDesignReview?.annotations.length, 1);
  assert.equal(savedVrProj.vrDesignReview?.bookmarks.length, 1);
  assert.equal(
    JSON.stringify(savedVrProj.floorPlan),
    JSON.stringify(fullProject.floorPlan),
    'floorPlan must remain unchanged'
  );
  assert.equal(
    JSON.stringify(savedVrProj.arSiteVisualization),
    arBeforeP49,
    'arSiteVisualization must remain unchanged'
  );

  // G3: Staleness check after geometry mutation
  assert.equal(checkVRDesignReviewStaleness(savedVrProj).isStale, false);
  const mutatedGeometryProj: Project = {
    ...savedVrProj,
    plotWidth: savedVrProj.plotWidth + 6,
  };
  const staleCheck = checkVRDesignReviewStaleness(mutatedGeometryProj);
  assert.equal(staleCheck.isStale, true);
  assert.ok(staleCheck.reason?.includes('changed'));

  // G4: Rollback via snapshot restores pre-P49 state cleanly
  const targetSnap = getProjectSnapshots(savedVrProj).find((s) => s.id === snapshotId)!;
  assert.ok(targetSnap);
  const rolledBack = executeSafeRestore(savedVrProj, targetSnap);
  assert.equal(rolledBack.success, true);
  assert.equal(rolledBack.restoredProject?.vrDesignReview, undefined);

  // G5: Corrupt or oversized review data is sanitized safely without crashing
  const corruptProj: Project = {
    ...structuredClone(sampleMetresProject),
    vrDesignReview: {
      version: 'plotify-vr-review-meta-v1',
      profileId: VR_DESIGN_REVIEW_PROFILE_ID,
      savedConfig: {
        ...fullVrCfg,
        scalePreset: 'INVALID_SCALE' as any,
      },
      annotations: [
        { bad: 'record' } as any,
        ...Array.from({ length: MAX_ANNOTATIONS_PER_PROJECT + 15 }, (_, i) => ({
          ...createdNote,
          annotationId: `note-${i}`,
          title: `<script>alert(1)</script>Safe Title ${i}`,
        })),
      ],
      bookmarks: [{ brokenBookmark: true } as any],
      lastGeometryFingerprint: 'fp',
      updatedAt: new Date().toISOString(),
    },
  };
  const sanitized = getSafeVRDesignReviewState(corruptProj);
  assert.equal(sanitized.config.scalePreset, '1:1');
  assert.equal(sanitized.annotations.length, MAX_ANNOTATIONS_PER_PROJECT);
  assert.ok(!sanitized.annotations[0].title.includes('<script>'));
  assert.equal(sanitized.bookmarks.length, 0);
  assert.ok(sanitized.sanitizedWarnings.length >= 3);

  console.log('  ✓ Group G passed (legacy defaults, snapshot rollback, staleness detection & corrupt-data sanitization verified).');

  // =========================================================================
  // GROUP H: Performance and Resource Teardown Tests
  // =========================================================================
  console.log('• Group H: Performance and Resource Teardown Tests...');

  // H1: Repeated enter/exit cycles do not accumulate sessions, animation loops, or listeners
  const cycleController = new VRSessionController(sampleMetresProject, metresCfg);
  for (let i = 0; i < 5; i++) {
    const s = await cycleController.startImmersiveVRSession({
      userGestureConfirmed: true,
      project: sampleMetresProject,
      config: metresCfg,
      capabilityReport: capSupported,
      renderer: mockRenderer,
      navigatorXROverride: {
        requestSession: async () => mockXRSession,
      },
    });
    assert.equal(s.activeAnimationLoopCount, 1);
    const e = await cycleController.exitImmersiveVRSession();
    assert.equal(e.activeAnimationLoopCount, 0);
    assert.equal(e.registeredListenerCount, 0);
  }
  assert.equal(cycleController.getState().enterCycleCount, 5);
  assert.equal(cycleController.getState().exitCycleCount, 5);
  cycleController.dispose();

  // H2: Over-budget complex scene triggers documented warning rather than crashing
  const manyRooms = Array.from({ length: 1000 }, (_, idx) => ({
    id: `r-heavy-${idx}`,
    name: `Space ${idx}`,
    type: 'office',
    x: (idx % 10) * 2,
    y: Math.floor(idx / 10) * 2,
    width: 1.8,
    length: 1.8,
    floorLevel: 1,
  }));
  const heavyProj: Project = {
    ...structuredClone(sampleMetresProject),
    plotWidth: 300,
    plotLength: 300,
    floorPlan: { rooms: manyRooms },
  };
  const heavyPreflight = prepareVRModelPreflight(heavyProj, metresCfg);
  assert.equal(heavyPreflight.withinHeadsetComplexityBudget, false);
  assert.ok(heavyPreflight.estimatedTriangleCount > MAX_RECOMMENDED_VR_TRIANGLES);
  assert.ok(
    heavyPreflight.validationWarnings.some((w) => w.includes('exceeds the recommended VR headset comfort budget'))
  );

  console.log('  ✓ Group H passed (5x enter/exit cycle hygiene, renderer restore & complexity budget warnings verified).');

  // =========================================================================
  // GROUP I: User Experience, Fallback & Report Honesty Tests
  // =========================================================================
  console.log('• Group I: User Experience, Fallback & Report Honesty Tests...');

  // I1: No project selected handled gracefully by preflight & safe state
  const nullPreflight = prepareVRModelPreflight(null);
  assert.equal(nullPreflight.isReady, false);
  assert.ok(nullPreflight.blockingErrors[0].includes('No project selected'));

  // I2: Saved annotations remain accessible in Standard 3D mode without entering VR
  const fallbackController = new VRSessionController(savedVrProj, fullVrCfg);
  assert.equal(fallbackController.getState().activeMode, 'immersive_vr_webxr');
  const switchedTo3D = fallbackController.switchWorkspaceMode('standard_3d_design_review');
  assert.equal(switchedTo3D.activeMode, 'standard_3d_design_review');
  const extractedWithoutVR = getSafeVRDesignReviewState(savedVrProj);
  assert.equal(extractedWithoutVR.annotations.length, 1);
  assert.equal(extractedWithoutVR.annotations[0].title, createdNote.title);

  // I3: Report generation & explicit hardware verification honesty disclosure
  const report = generateVRDesignReviewReport(
    savedVrProj,
    fullVrCfg,
    capNoXR,
    switchedTo3D,
    extractedWithoutVR.annotations,
    extractedWithoutVR.bookmarks
  );
  assert.equal(report.profileId, VR_DESIGN_REVIEW_PROFILE_ID);
  assert.equal(report.transform.isVirtualSceneOnly, true);
  assert.equal(report.transform.isGeospatiallyRegistered, false);
  assert.equal(report.sessionSummary.privacyGuard.cameraCaptureEnabled, false);
  assert.equal(report.sessionSummary.privacyGuard.microphoneRecordingEnabled, false);
  assert.equal(report.sessionSummary.privacyGuard.eyeTrackingCollected, false);
  assert.equal(report.sessionSummary.privacyGuard.liveMultiUserP50Enabled, false);
  assert.equal(report.hardwareVerificationDisclosure.physicalVRHeadsetTestedInCurrentEnv, false);
  assert.equal(
    report.hardwareVerificationDisclosure.explicitStatement,
    'Physical VR headset testing was not performed in this environment.'
  );

  const mdExport = exportVRDesignReviewReport(report, 'markdown');
  const jsonExport = exportVRDesignReviewReport(report, 'json');
  assert.ok(mdExport.includes('Physical VR headset testing was not performed in this environment.'));
  assert.ok(mdExport.includes('Virtual Scene Review Only'));
  assert.equal(JSON.parse(jsonExport).profileId, VR_DESIGN_REVIEW_PROFILE_ID);

  fallbackController.dispose();
  console.log('  ✓ Group I passed (fallback accessibility, privacy guarantees & explicit hardware honesty disclosure verified).\n');

  console.log('✓ ALL P49 IMMERSIVE VR DESIGN REVIEW VERIFICATION CHECKS PASSED!');
}

runTests().catch((err) => {
  console.error('✗ P49 Verification Suite Failed:', err);
  process.exit(1);
});
