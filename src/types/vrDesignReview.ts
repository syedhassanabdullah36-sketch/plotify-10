/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * PLOTIFY — P49 Immersive VR Design Review
 * Profile Identifier: plotify-vr-design-review-p49-v1
 *
 * Scope & Honesty Contract:
 * - P49 provides an immersive WebXR ('immersive-vr') and non-immersive Three.js
 *   architectural design-review workspace for exploring spatial proportions,
 *   circulation, multi-discipline context (P41–P48), and model-anchored review notes.
 * - P49 is a virtual scene review only. It is NOT a certified land survey,
 *   construction setting-out instrument, code-compliance engine, or validated
 *   structural/environmental simulation.
 * - P50 (live multi-user collaboration, shared cursors, co-presence, websockets)
 *   is strictly out of scope.
 */

import { MeasurementUnit } from './project';

export const VR_DESIGN_REVIEW_PROFILE_ID = 'plotify-vr-design-review-p49-v1' as const;

/**
 * Three explicit workspace modes required by Section 5:
 * - Mode A ('immersive_vr_webxr'): Entered ONLY when WebXR 'immersive-vr' support is confirmed
 *   and an intentional user-initiated session startup succeeds.
 * - Mode B ('standard_3d_design_review'): Non-immersive Three.js orbit/pan/zoom/walkthrough fallback
 *   when 'immersive-vr' is unavailable, blocked, or exited.
 * - Mode C ('review_setup_calibration'): Non-immersive pre-flight setup and calibration workspace
 *   for checking scale, orientation, comfort settings, and layers before entering VR.
 */
export type VRWorkspaceMode =
  | 'immersive_vr_webxr'
  | 'standard_3d_design_review'
  | 'review_setup_calibration';

export type VRScalePreset = '1:1' | '1:10' | '1:20' | '1:50' | '1:100';

export type VRLocomotionMode = 'teleport' | 'snap-turn' | 'seated-stationary';

export type VRSnapTurnDegrees = 15 | 30 | 45 | 60;

export type VRReferenceSpaceType = 'local-floor' | 'bounded-floor' | 'local' | 'viewer';

export type VRInputTargetRayMode = 'tracked-pointer' | 'gaze' | 'screen' | 'transient-pointer';

export type VRHandedness = 'left' | 'right' | 'none';

export interface VRInputSourceSummary {
  id: string;
  handedness: VRHandedness;
  targetRayMode: VRInputTargetRayMode;
  profiles: string[];
  hasGripSpace: boolean;
  hasGamepadAxes: boolean;
  buttonCount: number;
}

export type VRCapabilityBlockerCode =
  | 'NONE'
  | 'INSECURE_CONTEXT_HTTP'
  | 'WEBGL_UNAVAILABLE'
  | 'DOCUMENT_HIDDEN_OR_UNFOCUSED'
  | 'PERMISSIONS_POLICY_XR_BLOCKED'
  | 'WEBXR_API_MISSING'
  | 'IMMERSIVE_VR_NOT_SUPPORTED'
  | 'IMMERSIVE_VR_CHECK_REJECTED'
  | 'ACTIVE_SESSION_CONFLICT';

export interface VRCapabilityReport {
  profileId: typeof VR_DESIGN_REVIEW_PROFILE_ID;
  evaluatedAt: string;
  isSecureContext: boolean;
  hasWebGL: boolean;
  isSoftwareWebGL: boolean;
  hasNavigatorXR: boolean;
  immersiveVRSupported: boolean;
  documentVisibleAndFocused: boolean;
  permissionsPolicyBlocked: boolean;
  activeSessionConflict: boolean;
  blockerCode: VRCapabilityBlockerCode;
  supportedReferenceSpaces: VRReferenceSpaceType[];
  detectedInputSources: VRInputSourceSummary[];
  recommendedMode: VRWorkspaceMode;
  fallbackModeAvailable: boolean;
  inferredFromUserAgent: false; // Strictly false: never infer VR support from UA strings
  statusSummary: string;
  actionableNextSteps: string[];
  probeErrorMessage?: string;
}

export type VRSceneOriginMode =
  | 'plot_center'
  | 'plot_southwest_corner'
  | 'building_footprint_center'
  | 'first_room_interior';

export interface VRNavigationComfortSettings {
  locomotionMode: VRLocomotionMode;
  snapTurnDegrees: VRSnapTurnDegrees;
  postureMode: 'standing' | 'seated';
  standingEyeHeightMetres: number; // default 1.65m
  seatedEyeHeightMetres: number; // default 1.20m
  teleportMaxDistanceMetres: number; // default 15m
  requireValidFloorForTeleport: boolean;
  comfortVignetteNoteAck: boolean;
}

export interface VRReviewLayerVisibility {
  showBaseBuildingShell: boolean;
  showRoomLabelsAndSlabs: boolean;
  showOpenings: boolean;
  showStructuralColumns: boolean;
  showP41IfcProvenanceBadges: boolean;
  showP43TerrainSurface: boolean;
  showP46EnvelopeHighlights: boolean;
  showP47SiteLogistics: boolean;
  selectedSiteLogisticsPhaseId: string | 'all';
  showReviewAnnotations: boolean;
  showNavigationTeleportGrid: boolean;
  selectedFloor: number | 'all';
  isolatedElementId: string | null;
}

export interface VRDesignReviewConfig {
  profileId: typeof VR_DESIGN_REVIEW_PROFILE_ID;
  preferredMode: VRWorkspaceMode;
  scalePreset: VRScalePreset;
  originMode: VRSceneOriginMode;
  customOffsetMetres: {
    x: number;
    y: number;
    z: number;
  };
  yawDegrees: number;
  userConfirmedSourceUnits: boolean;
  navigation: VRNavigationComfortSettings;
  layers: VRReviewLayerVisibility;
}

export interface VRSceneTransformSummary {
  sourceProjectUnit: MeasurementUnit;
  unitToMetresFactor: number;
  scalePreset: VRScalePreset;
  scaleMultiplier: number; // 1.0 for 1:1, 0.1 for 1:10, 0.05 for 1:20, 0.02 for 1:50, 0.01 for 1:100
  combinedScaleFactor: number; // unitToMetresFactor * scaleMultiplier (applied once)
  scaleDerivationBasis: 'validated-project-geometry' | 'user-configured-preview-transform';
  originMode: VRSceneOriginMode;
  anchorOriginOffsetMetres: { x: number; y: number; z: number };
  manualOffsetMetres: { x: number; y: number; z: number };
  totalTranslationMetres: { x: number; y: number; z: number };
  yawDegrees: number;
  yawRadians: number;
  eyeHeightMetres: number;
  worldMatrix4x4: number[]; // 16 finite numbers, column-major
  coordinateConvention: {
    xAxis: '+X East across plotWidth';
    yAxis: '+Y Vertical Up in metres';
    zAxis: '+Z South across plotLength';
  };
  isVirtualSceneOnly: true;
  isGeospatiallyRegistered: false;
  inheritsARRegistration: false;
}

export interface VRModelPreflightSummary {
  isReady: boolean;
  projectId: string;
  projectName: string;
  sourceUnit: MeasurementUnit;
  unitConfirmed: boolean;
  plotDimensionsSourceUnits: { width: number; length: number };
  plotDimensionsMetresAt1To1: { widthM: number; lengthM: number; heightM: number };
  scaledDimensionsMetres: { widthM: number; lengthM: number; heightM: number };
  floorCount: number;
  validRoomCount: number;
  invalidRoomCount: number;
  structuralColumnCount: number;
  ifcMappedElementCount: number;
  cad2DOnlySkippedCount: number;
  terrainTriangleCount: number;
  logisticsZoneCount: number;
  estimatedTriangleCount: number;
  estimatedDrawCallCount: number;
  estimatedMaterialCount: number;
  withinHeadsetComplexityBudget: boolean;
  blockingErrors: string[];
  validationWarnings: string[];
  missingDataDisclosures: string[];
  geometryFingerprint: string;
}

export type VRInspectableElementType =
  | 'room'
  | 'wall'
  | 'slab'
  | 'opening'
  | 'structural-column'
  | 'terrain-surface'
  | 'envelope-facade'
  | 'logistics-zone'
  | 'logistics-crane'
  | 'annotation-marker'
  | 'plot-ground';

export interface VRInspectableMetadata {
  elementId: string;
  elementType: VRInspectableElementType;
  label: string;
  floorLevel?: number;
  roomId?: string;
  roomName?: string;
  dimensionsProjectUnits?: { width: number; length: number; height?: number; unit: MeasurementUnit };
  dimensionsMetresAt1To1?: { widthM: number; lengthM: number; heightM?: number; areaM2?: number };
  sourceModule: 'Base-3D' | 'P13-Structural' | 'P41-IFC' | 'P43-Terrain' | 'P46-Envelope' | 'P47-Logistics' | 'P49-Annotation';
  ifcProvenance?: {
    globalId: string;
    stepId: number;
    ifcType: string;
    preservationStatus?: string;
  };
  semanticOverlayNote?: string;
}

export interface VRRaycastSelectionResult {
  hit: boolean;
  distanceMetres: number | null;
  hitPointWorldMetres: { x: number; y: number; z: number } | null;
  hitPointLocalPlotUnits: { x: number; y: number; z: number } | null;
  targetMetadata: VRInspectableMetadata | null;
  isWalkableSurface: boolean;
  actionPerformed: 'inspect-only'; // Never mutates project on selection
}

export interface VRTeleportDestinationResult {
  isValid: boolean;
  reasonCode:
    | 'VALID_ROOM_FLOOR'
    | 'VALID_PLOT_GROUND'
    | 'OUTSIDE_PLOT_BOUNDARY'
    | 'INSIDE_WALL_OBSTACLE'
    | 'INSIDE_COLUMN_OBSTACLE'
    | 'EXCEEDS_MAX_TELEPORT_RANGE'
    | 'NO_WALKABLE_FLOOR_ESTABLISHED'
    | 'NON_FINITE_COORDINATES';
  message: string;
  destinationWorldMetres: { x: number; y: number; z: number } | null;
  destinationLocalPlotUnits: { x: number; y: number; z: number } | null;
  resolvedFloorLevel: number;
  resolvedRoomId?: string;
  resolvedRoomName?: string;
  eyePositionWorldMetres: { x: number; y: number; z: number } | null;
  physicallyValidatedWalkable: boolean;
}

export type VRAnnotationCategory =
  | 'spatial-layout-observation'
  | 'circulation-wayfinding-concern'
  | 'design-coordination-issue'
  | 'missing-unclear-model-info'
  | 'visual-review-note'
  | 'follow-up-inspection-required';

export type VRAnnotationPriority = 'low' | 'medium' | 'high' | 'critical-observation';

export type VRAnnotationStatus = 'open' | 'in-review' | 'resolved' | 'needs-reverification';

export type VRAnnotationAnchorResolutionStatus =
  | 'resolved'
  | 'stale-geometry-changed'
  | 'unresolved-target-removed';

export interface VRReviewAnnotation {
  annotationId: string;
  projectId: string;
  reviewSessionId: string;
  title: string;
  note: string;
  category: VRAnnotationCategory;
  priority: VRAnnotationPriority;
  status: VRAnnotationStatus;
  targetElementId?: string;
  targetElementType?: VRInspectableElementType;
  targetRoomId?: string;
  targetRoomName?: string;
  targetFloorLevel: number;
  anchorPositionLocalPlotUnits: { x: number; y: number; z: number };
  anchorPositionMetresAt1To1: { x: number; y: number; z: number };
  sourceGeometryFingerprint: string;
  anchorResolutionStatus: VRAnnotationAnchorResolutionStatus;
  anchorResolutionMessage: string;
  createdAt: string;
  updatedAt: string;
  provenanceDisclaimer: string;
  isVerifiedEngineeringRisk: false; // Strictly false: user priority is not a certified engineering risk
}

export interface VRReviewBookmark {
  bookmarkId: string;
  projectId: string;
  label: string;
  presetType: 'overview' | 'room-interior' | 'floor-level' | 'custom-viewpoint';
  targetRoomId?: string;
  targetFloorLevel: number | 'all';
  cameraPositionMetres: { x: number; y: number; z: number };
  lookAtTargetMetres: { x: number; y: number; z: number };
  scalePreset: VRScalePreset;
  createdAt: string;
}

export interface VRCrossDisciplineLayerSummary {
  moduleId: 'P41' | 'P42' | 'P43' | 'P44' | 'P45' | 'P46' | 'P47' | 'P48';
  title: string;
  isAvailableInProject: boolean;
  isStale: boolean;
  staleReason?: string;
  representationMode: 'spatial-3d-geometry' | 'semantic-3d-highlight' | 'read-only-summary-panel' | 'filtered-2d-reference';
  summaryHeadline: string;
  keyMetrics: Array<{ label: string; value: string }>;
  legendItems: Array<{ label: string; colorHex: string; patternOrSymbol: string }>;
  limitationsAndDisclaimers: string[];
}

export type VRSessionLifecyclePhase =
  | 'idle'
  | 'preflight-ready'
  | 'requesting-session'
  | 'immersive-vr-active'
  | 'immersive-vr-hidden-blurred'
  | 'fallback-3d-active'
  | 'setup-calibration-active'
  | 'session-interrupted'
  | 'session-error'
  | 'session-ended';

export interface VRPrivacyAndSecurityGuard {
  userGestureConfirmedForSessionStart: boolean;
  cameraCaptureEnabled: false;
  microphoneRecordingEnabled: false;
  eyeTrackingCollected: false;
  biometricOrBehavioralAnalyticsCollected: false;
  headPoseTelemetryUploaded: false;
  externalDataTransmitted: false;
  automaticNoteSharingEnabled: false;
  liveMultiUserP50Enabled: false;
}

export interface VRRendererRestoreSnapshot {
  pixelRatio: number;
  shadowMapEnabled: boolean;
  toneMappingExposure: number;
  xrEnabledPrior: boolean;
  restoredCount: number;
}

export interface VRSessionStateSnapshot {
  sessionId: string;
  phase: VRSessionLifecyclePhase;
  activeMode: VRWorkspaceMode;
  activeReferenceSpace: VRReferenceSpaceType | null;
  connectedInputSources: VRInputSourceSummary[];
  activeAnimationLoopCount: number;
  registeredListenerCount: number;
  enterCycleCount: number;
  exitCycleCount: number;
  viewerPositionWorldMetres: { x: number; y: number; z: number };
  viewerYawDegrees: number;
  lastSelectedTarget: VRRaycastSelectionResult | null;
  lastTeleportResult: VRTeleportDestinationResult | null;
  rendererRestoreState: VRRendererRestoreSnapshot;
  privacyGuard: VRPrivacyAndSecurityGuard;
  lastErrorMessage: string | null;
  statusMessage: string;
}

export interface ProjectVRDesignReviewMetadata {
  version: 'plotify-vr-review-meta-v1';
  profileId: typeof VR_DESIGN_REVIEW_PROFILE_ID;
  savedConfig: VRDesignReviewConfig;
  annotations: VRReviewAnnotation[];
  bookmarks: VRReviewBookmark[];
  lastGeometryFingerprint: string;
  lastCapabilitySummary?: {
    immersiveVRSupported: boolean;
    recommendedMode: VRWorkspaceMode;
    evaluatedAt: string;
  };
  updatedAt: string;
}

export interface VRDesignReviewExportReport {
  reportId: string;
  profileId: typeof VR_DESIGN_REVIEW_PROFILE_ID;
  generatedAt: string;
  projectId: string;
  projectName: string;
  preflight: VRModelPreflightSummary;
  transform: VRSceneTransformSummary;
  capability: VRCapabilityReport;
  sessionSummary: {
    phase: VRSessionLifecyclePhase;
    activeMode: VRWorkspaceMode;
    activeReferenceSpace: VRReferenceSpaceType | null;
    connectedInputSourcesCount: number;
    privacyGuard: VRPrivacyAndSecurityGuard;
  };
  annotationsSummary: {
    totalCount: number;
    openCount: number;
    resolvedAnchorCount: number;
    staleOrUnresolvedAnchorCount: number;
    annotations: VRReviewAnnotation[];
  };
  bookmarksCount: number;
  crossDisciplineLayers: VRCrossDisciplineLayerSummary[];
  nonEngineeringAndSurveyDisclaimers: string[];
  hardwareVerificationDisclosure: {
    automatedAndMockedTestsExecuted: boolean;
    physicalVRHeadsetTestedInCurrentEnv: boolean;
    explicitStatement: string;
  };
}
