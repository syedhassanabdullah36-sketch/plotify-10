import { MeasurementUnit } from './project';

export const AR_SITE_VISUALIZATION_PROFILE_ID = 'plotify-ar-site-visualization-p48-v1';

export type ARVisualizationMode =
  | 'immersive_ar_webxr'
  | 'standard_3d_site_preview'
  | 'manually_calibrated_placement_preview';

export type WebXRReadinessState =
  | 'ready_for_immersive_ar'
  | 'insecure_context_blocked'
  | 'webgl_unavailable'
  | 'webxr_api_missing'
  | 'permissions_policy_blocked'
  | 'immersive_ar_unsupported_device'
  | 'permission_denied_by_user'
  | 'session_creation_failed';

export type CameraPermissionState =
  | 'not_requested_yet'
  | 'granted'
  | 'denied'
  | 'prompt'
  | 'unavailable';

export interface WebXRCapabilityReport {
  profileId: typeof AR_SITE_VISUALIZATION_PROFILE_ID;
  evaluatedAt: string;
  isSecureContext: boolean;
  hasWebGL: boolean;
  hasWebGL2: boolean;
  isSoftwareRenderer: boolean;
  hasNavigatorXR: boolean;
  permissionsPolicyBlocked: boolean;
  immersiveArSupported: boolean;
  hitTestSupported: boolean;
  domOverlaySupported: boolean;
  lightEstimationSupported: boolean;
  cameraPermissionState: CameraPermissionState;
  readinessState: WebXRReadinessState;
  recommendedMode: ARVisualizationMode;
  canAttemptImmersiveAR: boolean;
  headline: string;
  explanation: string;
  technicalNotes: string[];
}

export type ARScalePreset = '1:1' | '1:10' | '1:20' | '1:50' | '1:100';

export type ARAnchorOriginMode =
  | 'plot_center'
  | 'plot_southwest_corner'
  | 'road_frontage_center';

export type ARAlignmentMethod =
  | 'unplaced_preview'
  | 'webxr_hit_test_surface_uncalibrated'
  | 'webxr_hit_test_with_manual_yaw_offset'
  | 'manual_ground_plane_calibrated';

export interface ARPlacementCalibration {
  scalePreset: ARScalePreset;
  scaleFactor: number; // 1.0 for 1:1 real-world scale, 0.05 for 1:20 tabletop, etc.
  anchorOriginMode: ARAnchorOriginMode;
  yawRotationDeg: number; // -180 to +180 degrees
  offsetXMetres: number; // Horizontal East/West nudge in metres
  offsetZMetres: number; // Horizontal North/South nudge in metres
  elevationOffsetYMetres: number; // Vertical height nudge from detected/reference plane in metres
  alignWithProjectNorth: boolean;
  projectNorthOffsetDeg: number;
  alignmentMethod: ARAlignmentMethod;
  isGeospatiallyRegistered: false; // Hard honesty invariant: local hit-test/manual placement is never survey-grade GNSS
  placementLocked: boolean;
}

export interface ARLayerVisibilityConfig {
  showBuildingShell: boolean;
  showFloorSlabs: boolean;
  showOpenings: boolean;
  showStructuralColumns: boolean;
  showSiteBoundaryAndSetbacks: boolean;
  showTerrainSurface: boolean;
  showEnvelopeHighlights: boolean;
  showSiteLogisticsOverlay: boolean;
  showScaleReferenceMarkers: boolean;
  selectedFloor: number | 'all';
  wallOpacity: number; // 0.25 to 1.0
  activeLogisticsPhaseId?: string;
}

export type ARPerformanceBudgetStatus =
  | 'optimal'
  | 'moderate_warning'
  | 'heavy_simplify_recommended'
  | 'invalid_geometry';

export interface ARDisciplineLayerAvailability {
  layerKey:
    | 'building_shell'
    | 'structural_columns'
    | 'site_context_setbacks'
    | 'terrain_topography_p43'
    | 'envelope_highlights_p46'
    | 'site_logistics_p47'
    | 'ifc_provenance_p41'
    | 'cad_provenance_p42';
  label: string;
  available: boolean;
  elementCount: number;
  renderableIn3DAR: boolean;
  statusNote: string;
}

export interface ARModelPreflightSummary {
  projectId: string;
  projectName: string;
  sourceUnit: MeasurementUnit;
  targetARUnit: 'metres';
  unitToMetresFactor: number; // 0.3048 for feet, 1.0 for metres
  plotDimensionsProjectUnits: {
    width: number;
    length: number;
  };
  plotDimensionsMetres: {
    widthM: number;
    lengthM: number;
    footprintAreaM2: number;
    totalHeightM: number;
  };
  scaledDisplayDimensionsMetres: {
    scalePreset: ARScalePreset;
    scaleFactor: number;
    widthM: number;
    lengthM: number;
    heightM: number;
  };
  validRoomCount: number;
  invalidRoomCount: number;
  floorCount: number;
  structuralColumnCount: number;
  terrainTriangleCount: number;
  logisticsZoneCount: number;
  cad2DOnlySkippedCount: number;
  estimatedTriangles: number;
  estimatedVertices: number;
  estimatedDrawCalls: number;
  performanceBudgetStatus: ARPerformanceBudgetStatus;
  isValidForAR: boolean;
  validationErrors: string[];
  validationWarnings: string[];
  layerAvailability: ARDisciplineLayerAvailability[];
}

export type ARSessionLifecycleState =
  | 'idle'
  | 'checking_capabilities'
  | 'ready_to_start'
  | 'requesting_session'
  | 'searching_for_surface'
  | 'surface_reticle_ready'
  | 'model_placed_tracking'
  | 'tracking_limited_or_lost'
  | 'fallback_3d_active'
  | 'session_ended'
  | 'session_error';

export type ARTrackingQuality =
  | 'not_applicable'
  | 'initializing'
  | 'normal_tracking'
  | 'limited_excessive_motion'
  | 'limited_insufficient_features'
  | 'tracking_lost';

export interface ARTransformMatrixResult {
  positionMetres: { x: number; y: number; z: number };
  rotationEulerRad: { x: number; y: number; z: number };
  totalYawDeg: number;
  uniformScaleMetresPerProjectUnit: number;
  anchorLocalOffsetMetres: { x: number; y: number; z: number };
  matrix16: number[]; // Column-major 4x4 homogeneous transform matrix
}

export interface ARSessionTelemetryState {
  lifecycleState: ARSessionLifecycleState;
  activeMode: ARVisualizationMode;
  trackingQuality: ARTrackingQuality;
  referenceSpaceType: 'local-floor' | 'local' | 'viewer' | 'non_xr_preview';
  reticleVisible: boolean;
  reticleHitPoseMetres: { x: number; y: number; z: number } | null;
  placedAnchorPoseMetres: { x: number; y: number; z: number } | null;
  sessionStartedAt: string | null;
  sessionEndedAt: string | null;
  lastErrorMessage: string | null;
  cleanupCompleted: boolean;
  privacyGuard: {
    cameraPermissionRequestedOnlyOnClick: true;
    rawCameraFramesStoredOrUploaded: false;
    environmentMeshStoredOrUploaded: false;
  };
}

export interface ARSiteVisualizationConfig {
  profileId: typeof AR_SITE_VISUALIZATION_PROFILE_ID;
  preferredMode: ARVisualizationMode;
  placement: ARPlacementCalibration;
  layers: ARLayerVisibilityConfig;
  safetyNoticeAcknowledged: boolean;
  updatedAt: string;
}

export interface ARSiteVisualizationReport {
  profileId: typeof AR_SITE_VISUALIZATION_PROFILE_ID;
  generatedAt: string;
  projectId: string;
  projectName: string;
  geometryFingerprint: string;
  capabilityReport: WebXRCapabilityReport;
  preflight: ARModelPreflightSummary;
  config: ARSiteVisualizationConfig;
  transformSummary: ARTransformMatrixResult;
  sessionStateSummary: {
    activeMode: ARVisualizationMode;
    lifecycleState: ARSessionLifecycleState;
    trackingQuality: ARTrackingQuality;
    alignmentMethod: ARAlignmentMethod;
    isGeospatiallyRegistered: false;
  };
  hardwareVerificationDisclosure: {
    automatedAndMockedTestsExecuted: boolean;
    physicalMobileARHardwareTestedInCurrentEnv: boolean;
    disclosureStatement: string;
  };
  limitationsAndSafetyNotices: string[];
}

export interface ProjectARSiteVisualizationMetadata {
  profileId: typeof AR_SITE_VISUALIZATION_PROFILE_ID;
  savedConfig: ARSiteVisualizationConfig;
  lastPreflightSummary?: ARModelPreflightSummary;
  lastCapabilitySnapshot?: WebXRCapabilityReport;
  sourceGeometryFingerprint: string;
  updatedAt: string;
}
