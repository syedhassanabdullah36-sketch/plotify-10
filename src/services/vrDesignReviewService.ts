/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * PLOTIFY — P49 Immersive VR Design Review Service
 * Profile Identifier: plotify-vr-design-review-p49-v1
 */

import * as THREE from 'three';
import { Project, FloorPlanRoom, MeasurementUnit } from '../types/project';
import {
  VR_DESIGN_REVIEW_PROFILE_ID,
  VRWorkspaceMode,
  VRScalePreset,
  VRLocomotionMode,
  VRSnapTurnDegrees,
  VRReferenceSpaceType,
  VRInputSourceSummary,
  VRCapabilityReport,
  VRSceneOriginMode,
  VRDesignReviewConfig,
  VRSceneTransformSummary,
  VRModelPreflightSummary,
  VRInspectableMetadata,
  VRInspectableElementType,
  VRRaycastSelectionResult,
  VRTeleportDestinationResult,
  VRReviewAnnotation,
  VRAnnotationCategory,
  VRAnnotationPriority,
  VRAnnotationStatus,
  VRReviewBookmark,
  VRCrossDisciplineLayerSummary,
  VRSessionStateSnapshot,
  VRPrivacyAndSecurityGuard,
  ProjectVRDesignReviewMetadata,
  VRDesignReviewExportReport,
} from '../types/vrDesignReview';
import {
  getDefaultViewerConfig,
  validateFloorPlanFor3D,
  buildBuilding3DModel,
  disposeThreeHierarchy,
} from '../components/viewer3d/building3dGeometry';
import {
  FEET_TO_METRES,
  getUnitToMetresFactor,
  computeARSiteGeometryFingerprint,
} from './arSiteVisualizationService';
import { createProjectSnapshot } from './versioningService';

export { FEET_TO_METRES, getUnitToMetresFactor, disposeThreeHierarchy };

export const VR_SCALE_PRESET_MULTIPLIERS: Record<VRScalePreset, number> = {
  '1:1': 1.0,
  '1:10': 0.1,
  '1:20': 0.05,
  '1:50': 0.02,
  '1:100': 0.01,
};

export const VR_SCALE_PRESET_DESCRIPTIONS: Record<VRScalePreset, string> = {
  '1:1': '1:1 Full-Scale Walkthrough (true architectural room & circulation proportions)',
  '1:10': '1:10 Large Sectional Model (walk around rooms at knee/waist height)',
  '1:20': '1:20 Studio Model Review (inspect multi-room layout & massing)',
  '1:50': '1:50 Tabletop Whole-Site Model (overview of plot, terrain & logistics)',
  '1:100': '1:100 Compact Massing Overview (compact site & context inspection)',
};

export const MAX_RECOMMENDED_VR_TRIANGLES = 80000;
export const MAX_RECOMMENDED_VR_DRAW_CALLS = 350;
export const MAX_RECOMMENDED_VR_MATERIALS = 180;
export const MAX_ANNOTATION_TEXT_LENGTH = 2000;
export const MAX_ANNOTATIONS_PER_PROJECT = 250;

export const NON_ENGINEERING_RISK_DISCLAIMER =
  'User-selected review observation priority only — not a certified structural, fire, code-compliance, or engineering risk assessment.';

export const VIRTUAL_SCENE_PROVENANCE_DISCLAIMERS: string[] = [
  'Virtual Scene Review Only: P49 Immersive VR Design Review renders normalized digital geometry in a virtual coordinate space. It is NOT geospatially registered to a physical property, GNSS coordinate, surveyed boundary, or construction setting-out grid.',
  'Not an Engineering or Code-Compliance Certification: Visual inspection, semantic overlays (P44–P47), and user review annotations do not substitute for licensed architectural, structural, MEP, or fire-engineering verification.',
  'Read-Only Cross-Discipline Context: P41–P48 layers reflect upstream project assessments as of their recorded evaluation timestamp and never fabricate missing building components or parcel-certified risk maps.',
];

// Pre-allocated math helpers for zero-GC raycasting and transforms
const _tempVec3A = new THREE.Vector3();
const _tempVec3B = new THREE.Vector3();
const _tempMat4 = new THREE.Matrix4();
const _tempQuat = new THREE.Quaternion();
const _tempEuler = new THREE.Euler();
const _raycaster = new THREE.Raycaster();

/**
 * Deterministic fingerprint of all geometry and upstream layers relevant to P49 VR review.
 */
export function computeVRModelGeometryFingerprint(project: Project | null | undefined): string {
  if (!project) return 'vr-fp-empty';
  const arBaseFp = computeARSiteGeometryFingerprint(project);
  const ifcCount = project.ifcInterop?.idMappings?.length || 0;
  const cadRefCount = project.cadInterop?.referenceEntities?.length || 0;
  const carbonId = project.carbonAssessment?.activeAssessment?.assessmentId || 'no-p44';
  const climateId = project.climateResilience?.activeAssessment?.assessmentId || 'no-p45';
  return `vr-${arBaseFp}|ifc:${ifcCount}|cad:${cadRefCount}|c:${carbonId}|cl:${climateId}`;
}

/**
 * Runtime environment overrides for deterministic testing of WebXR 'immersive-vr' capability branches.
 */
export interface VRCapabilityDetectionEnvOverride {
  isSecureContext?: boolean;
  hasWebGL?: boolean;
  isSoftwareWebGL?: boolean;
  documentVisibilityState?: 'visible' | 'hidden';
  documentHasFocus?: boolean;
  permissionsPolicyAllowsXR?: boolean;
  activeSessionConflict?: boolean;
  userAgentString?: string; // Ignored for capability inference; used to prove UA never overrides XR API
  navigatorXR?: {
    isSessionSupported?: (mode: string) => Promise<boolean>;
  } | null;
  supportedReferenceSpaces?: VRReferenceSpaceType[];
  detectedInputSources?: VRInputSourceSummary[];
}

/**
 * Group A — Runtime WebXR 'immersive-vr' capability detection.
 * Strictly inspects runtime APIs and never infers VR support from user-agent strings,
 * screen width, or mobile status.
 */
export async function detectVRCapabilities(
  envOverride?: VRCapabilityDetectionEnvOverride
): Promise<VRCapabilityReport> {
  const now = new Date().toISOString();

  const isSecure =
    envOverride?.isSecureContext !== undefined
      ? envOverride.isSecureContext
      : typeof window !== 'undefined'
      ? Boolean(window.isSecureContext)
      : false;

  const hasWebGL =
    envOverride?.hasWebGL !== undefined
      ? envOverride.hasWebGL
      : (() => {
          if (typeof document === 'undefined') return false;
          try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
            return Boolean(gl);
          } catch {
            return false;
          }
        })();

  const isSoftwareWebGL =
    envOverride?.isSoftwareWebGL !== undefined
      ? envOverride.isSoftwareWebGL
      : (() => {
          if (typeof document === 'undefined' || !hasWebGL) return false;
          try {
            const canvas = document.createElement('canvas');
            const gl = (canvas.getContext('webgl2') ||
              canvas.getContext('webgl')) as WebGLRenderingContext | null;
            if (!gl) return true;
            const ext = gl.getExtension('WEBGL_debug_renderer_info');
            const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
            const gpu = String(gl.getParameter(param));
            gl.getExtension('WEBGL_lose_context')?.loseContext();
            return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
          } catch {
            return false;
          }
        })();

  const docVisible =
    envOverride?.documentVisibilityState !== undefined
      ? envOverride.documentVisibilityState === 'visible'
      : typeof document !== 'undefined'
      ? document.visibilityState !== 'hidden'
      : true;

  const docFocused =
    envOverride?.documentHasFocus !== undefined
      ? envOverride.documentHasFocus
      : typeof document !== 'undefined' && typeof document.hasFocus === 'function'
      ? document.hasFocus()
      : true;

  const documentVisibleAndFocused = docVisible && docFocused;

  const permissionsPolicyBlocked =
    envOverride?.permissionsPolicyAllowsXR !== undefined
      ? !envOverride.permissionsPolicyAllowsXR
      : (() => {
          if (typeof document === 'undefined') return false;
          try {
            const anyDoc = document as any;
            const policy = anyDoc.permissionsPolicy || anyDoc.featurePolicy;
            if (policy && typeof policy.allowsFeature === 'function') {
              return !policy.allowsFeature('xr-spatial-tracking');
            }
          } catch {
            // Ignore if browser does not expose allowsFeature
          }
          return false;
        })();

  const activeSessionConflict = Boolean(envOverride?.activeSessionConflict);

  const xrObject =
    envOverride && 'navigatorXR' in envOverride
      ? envOverride.navigatorXR
      : typeof navigator !== 'undefined' && 'xr' in navigator
      ? (navigator as any).xr
      : null;

  const hasNavigatorXR = Boolean(xrObject && typeof xrObject.isSessionSupported === 'function');

  // 1. Check Secure Context
  if (!isSecure) {
    return {
      profileId: VR_DESIGN_REVIEW_PROFILE_ID,
      evaluatedAt: now,
      isSecureContext: false,
      hasWebGL,
      isSoftwareWebGL,
      hasNavigatorXR,
      immersiveVRSupported: false,
      documentVisibleAndFocused,
      permissionsPolicyBlocked,
      activeSessionConflict,
      blockerCode: 'INSECURE_CONTEXT_HTTP',
      supportedReferenceSpaces: [],
      detectedInputSources: [],
      recommendedMode: 'standard_3d_design_review',
      fallbackModeAvailable: hasWebGL,
      inferredFromUserAgent: false,
      statusSummary:
        'WebXR Immersive VR requires a secure HTTPS or localhost context. Standard 3D Design Review is active.',
      actionableNextSteps: [
        'Serve the application over HTTPS or localhost to enable WebXR APIs.',
        'Use Mode B (Standard 3D Design Review) or Mode C (Review Setup & Calibration) in the meantime.',
      ],
    };
  }

  // 2. Check WebGL availability
  if (!hasWebGL) {
    return {
      profileId: VR_DESIGN_REVIEW_PROFILE_ID,
      evaluatedAt: now,
      isSecureContext: true,
      hasWebGL: false,
      isSoftwareWebGL: false,
      hasNavigatorXR,
      immersiveVRSupported: false,
      documentVisibleAndFocused,
      permissionsPolicyBlocked,
      activeSessionConflict,
      blockerCode: 'WEBGL_UNAVAILABLE',
      supportedReferenceSpaces: [],
      detectedInputSources: [],
      recommendedMode: 'review_setup_calibration',
      fallbackModeAvailable: false,
      inferredFromUserAgent: false,
      statusSummary:
        'WebGL rendering context is unavailable. Neither Immersive VR nor interactive 3D rendering can start.',
      actionableNextSteps: [
        'Enable hardware acceleration and WebGL in your browser settings.',
        'You can still inspect saved P49 review annotations, bookmarks, and P41–P48 layer summaries in the panel.',
      ],
    };
  }

  // 3. Check Permissions-Policy
  if (permissionsPolicyBlocked) {
    return {
      profileId: VR_DESIGN_REVIEW_PROFILE_ID,
      evaluatedAt: now,
      isSecureContext: true,
      hasWebGL: true,
      isSoftwareWebGL,
      hasNavigatorXR,
      immersiveVRSupported: false,
      documentVisibleAndFocused,
      permissionsPolicyBlocked: true,
      activeSessionConflict,
      blockerCode: 'PERMISSIONS_POLICY_XR_BLOCKED',
      supportedReferenceSpaces: [],
      detectedInputSources: [],
      recommendedMode: 'standard_3d_design_review',
      fallbackModeAvailable: true,
      inferredFromUserAgent: false,
      statusSummary:
        'Permissions-Policy blocks xr-spatial-tracking in this document/iframe. Standard 3D Design Review is active.',
      actionableNextSteps: [
        'Ensure the hosting frame or HTTP header permits Permissions-Policy: xr-spatial-tracking=(self).',
        'Use Mode B (Standard 3D Design Review) for full model walkthrough, layer inspection, and annotations.',
      ],
    };
  }

  // 4. Check Active Session Conflict
  if (activeSessionConflict) {
    return {
      profileId: VR_DESIGN_REVIEW_PROFILE_ID,
      evaluatedAt: now,
      isSecureContext: true,
      hasWebGL: true,
      isSoftwareWebGL,
      hasNavigatorXR,
      immersiveVRSupported: false,
      documentVisibleAndFocused,
      permissionsPolicyBlocked: false,
      activeSessionConflict: true,
      blockerCode: 'ACTIVE_SESSION_CONFLICT',
      supportedReferenceSpaces: [],
      detectedInputSources: [],
      recommendedMode: 'standard_3d_design_review',
      fallbackModeAvailable: true,
      inferredFromUserAgent: false,
      statusSummary:
        'An existing WebXR session is already active on the headset or renderer. Exit the active session before starting a new VR review.',
      actionableNextSteps: [
        'Exit any active AR/VR session in this tab or other browser tabs.',
        'Use Standard 3D Design Review while the headset is busy.',
      ],
    };
  }

  // 5. Check navigator.xr presence
  if (!hasNavigatorXR || !xrObject) {
    return {
      profileId: VR_DESIGN_REVIEW_PROFILE_ID,
      evaluatedAt: now,
      isSecureContext: true,
      hasWebGL: true,
      isSoftwareWebGL,
      hasNavigatorXR: false,
      immersiveVRSupported: false,
      documentVisibleAndFocused,
      permissionsPolicyBlocked: false,
      activeSessionConflict: false,
      blockerCode: 'WEBXR_API_MISSING',
      supportedReferenceSpaces: [],
      detectedInputSources: [],
      recommendedMode: 'standard_3d_design_review',
      fallbackModeAvailable: true,
      inferredFromUserAgent: false,
      statusSummary:
        'WebXR Device API (navigator.xr) is not available in this browser. Standard 3D Design Review is active.',
      actionableNextSteps: [
        'Use Mode B (Standard 3D Design Review) on this desktop or mobile browser to inspect rooms, layers, and annotations.',
        'To enter Immersive VR, open Plotify in a WebXR-enabled headset browser (e.g., Meta Quest Browser, Pico Browser, or desktop Chrome/Edge with OpenXR runtime).',
      ],
    };
  }

  // 6. Query navigator.xr.isSessionSupported('immersive-vr')
  let immersiveSupported = false;
  let probeErrorMessage: string | undefined;

  try {
    immersiveSupported = Boolean(await xrObject.isSessionSupported!('immersive-vr'));
  } catch (err: any) {
    probeErrorMessage = err?.message || 'isSessionSupported("immersive-vr") rejected';
    return {
      profileId: VR_DESIGN_REVIEW_PROFILE_ID,
      evaluatedAt: now,
      isSecureContext: true,
      hasWebGL: true,
      isSoftwareWebGL,
      hasNavigatorXR: true,
      immersiveVRSupported: false,
      documentVisibleAndFocused,
      permissionsPolicyBlocked: false,
      activeSessionConflict: false,
      blockerCode: 'IMMERSIVE_VR_CHECK_REJECTED',
      supportedReferenceSpaces: [],
      detectedInputSources: [],
      recommendedMode: 'standard_3d_design_review',
      fallbackModeAvailable: true,
      inferredFromUserAgent: false,
      statusSummary: `WebXR immersive-vr capability check rejected (${probeErrorMessage}). Standard 3D Design Review is active.`,
      actionableNextSteps: [
        'Verify your OpenXR runtime or VR headset connection and reload.',
        'Continue reviewing in Mode B (Standard 3D Design Review).',
      ],
      probeErrorMessage,
    };
  }

  if (!immersiveSupported) {
    return {
      profileId: VR_DESIGN_REVIEW_PROFILE_ID,
      evaluatedAt: now,
      isSecureContext: true,
      hasWebGL: true,
      isSoftwareWebGL,
      hasNavigatorXR: true,
      immersiveVRSupported: false,
      documentVisibleAndFocused,
      permissionsPolicyBlocked: false,
      activeSessionConflict: false,
      blockerCode: 'IMMERSIVE_VR_NOT_SUPPORTED',
      supportedReferenceSpaces: [],
      detectedInputSources: [],
      recommendedMode: 'standard_3d_design_review',
      fallbackModeAvailable: true,
      inferredFromUserAgent: false,
      statusSummary:
        'Browser exposes WebXR, but "immersive-vr" is not supported on the current device/runtime. Standard 3D Design Review is active.',
      actionableNextSteps: [
        'Connect a compatible VR headset or enable an OpenXR runtime if you wish to use Mode A.',
        'Use Mode B (Standard 3D Design Review) or Mode C (Review Setup & Calibration) with full feature parity for annotations and layers.',
      ],
    };
  }

  if (!documentVisibleAndFocused) {
    return {
      profileId: VR_DESIGN_REVIEW_PROFILE_ID,
      evaluatedAt: now,
      isSecureContext: true,
      hasWebGL: true,
      isSoftwareWebGL,
      hasNavigatorXR: true,
      immersiveVRSupported: true,
      documentVisibleAndFocused: false,
      permissionsPolicyBlocked: false,
      activeSessionConflict: false,
      blockerCode: 'DOCUMENT_HIDDEN_OR_UNFOCUSED',
      supportedReferenceSpaces: envOverride?.supportedReferenceSpaces || ['local-floor', 'local'],
      detectedInputSources: envOverride?.detectedInputSources || [],
      recommendedMode: 'standard_3d_design_review',
      fallbackModeAvailable: true,
      inferredFromUserAgent: false,
      statusSummary:
        'Immersive VR is supported, but the document is currently unfocused or hidden. Focus the window and click "Start Immersive VR" to begin.',
      actionableNextSteps: [
        'Click inside the Plotify window to focus the document, then click "Start Immersive VR".',
      ],
    };
  }

  return {
    profileId: VR_DESIGN_REVIEW_PROFILE_ID,
    evaluatedAt: now,
    isSecureContext: true,
    hasWebGL: true,
    isSoftwareWebGL,
    hasNavigatorXR: true,
    immersiveVRSupported: true,
    documentVisibleAndFocused: true,
    permissionsPolicyBlocked: false,
    activeSessionConflict: false,
    blockerCode: 'NONE',
    supportedReferenceSpaces: envOverride?.supportedReferenceSpaces || [
      'local-floor',
      'bounded-floor',
      'local',
      'viewer',
    ],
    detectedInputSources: envOverride?.detectedInputSources || [],
    recommendedMode: 'immersive_vr_webxr',
    fallbackModeAvailable: true,
    inferredFromUserAgent: false,
    statusSummary:
      'WebXR "immersive-vr" capability confirmed. Click "Start Immersive VR" to launch a headset session (note: capability confirmation does not guarantee headset startup or controller presence until session starts).',
    actionableNextSteps: [
      'Review scale and comfort settings in Mode C or click "Start Immersive VR" directly.',
      'Ensure physical surroundings are clear and headset guardian boundaries are active.',
    ],
  };
}

/**
 * Creates a safe default VRDesignReviewConfig for a project.
 */
export function createDefaultVRDesignReviewConfig(
  project?: Project | null,
  capabilityReport?: VRCapabilityReport
): VRDesignReviewConfig {
  const existing = project?.vrDesignReview?.savedConfig;
  if (existing && existing.profileId === VR_DESIGN_REVIEW_PROFILE_ID) {
    return structuredClone(existing);
  }

  const preferredMode: VRWorkspaceMode = capabilityReport?.immersiveVRSupported
    ? 'immersive_vr_webxr'
    : 'standard_3d_design_review';

  const hasValidUnit = project?.unit === 'feet' || project?.unit === 'metres';

  return {
    profileId: VR_DESIGN_REVIEW_PROFILE_ID,
    preferredMode,
    scalePreset: '1:1',
    originMode: 'plot_center',
    customOffsetMetres: { x: 0, y: 0, z: 0 },
    yawDegrees: 0,
    userConfirmedSourceUnits: hasValidUnit,
    navigation: {
      locomotionMode: 'teleport',
      snapTurnDegrees: 30,
      postureMode: 'standing',
      standingEyeHeightMetres: 1.65,
      seatedEyeHeightMetres: 1.2,
      teleportMaxDistanceMetres: 18,
      requireValidFloorForTeleport: true,
      comfortVignetteNoteAck: true,
    },
    layers: {
      showBaseBuildingShell: true,
      showRoomLabelsAndSlabs: true,
      showOpenings: true,
      showStructuralColumns: true,
      showP41IfcProvenanceBadges: false,
      showP43TerrainSurface: Boolean(project?.terrainModeling?.surfaceMesh),
      showP46EnvelopeHighlights: false,
      showP47SiteLogistics: false,
      selectedSiteLogisticsPhaseId: 'all',
      showReviewAnnotations: true,
      showNavigationTeleportGrid: true,
      selectedFloor: 'all',
      isolatedElementId: null,
    },
  };
}

/**
 * Group C — Single-pass unit & scale transformation calculation.
 * Never applies unit conversion or scale multiplier twice.
 */
export function computeVRSceneTransform(
  project: Project,
  config: VRDesignReviewConfig
): VRSceneTransformSummary {
  const sourceUnit: MeasurementUnit = project.unit === 'feet' ? 'feet' : 'metres';
  const unitToMetresFactor = getUnitToMetresFactor(sourceUnit);
  const scaleMultiplier = VR_SCALE_PRESET_MULTIPLIERS[config.scalePreset] ?? 1.0;
  const combinedScaleFactor = Number((unitToMetresFactor * scaleMultiplier).toFixed(8));

  const pwMetres = project.plotWidth * unitToMetresFactor;
  const plMetres = project.plotLength * unitToMetresFactor;

  const rooms = project.floorPlan?.rooms || [];
  const validation = validateFloorPlanFor3D(rooms, project.plotWidth, project.plotLength);

  // Compute anchor origin offset in 1:1 metres prior to scaleMultiplier
  let anchorX = 0;
  let anchorY = 0;
  let anchorZ = 0;

  if (config.originMode === 'plot_southwest_corner') {
    // In buildBuilding3DModel, plot center is (0,0,0), SW corner (+Z South, -X West) is (-pw/2, 0, +pl/2)
    // Shift model so SW corner sits at origin (0,0,0)
    anchorX = (pwMetres / 2) * scaleMultiplier;
    anchorZ = (-plMetres / 2) * scaleMultiplier;
  } else if (config.originMode === 'building_footprint_center' && validation.validRooms.length > 0) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const r of validation.validRooms) {
      minX = Math.min(minX, r.x);
      maxX = Math.max(maxX, r.x + r.width);
      minY = Math.min(minY, r.y);
      maxY = Math.max(maxY, r.y + r.length);
    }
    const footprintCenterPlotX = (minX + maxX) / 2 - project.plotWidth / 2;
    const footprintCenterPlotZ = (minY + maxY) / 2 - project.plotLength / 2;
    anchorX = -footprintCenterPlotX * combinedScaleFactor;
    anchorZ = -footprintCenterPlotZ * combinedScaleFactor;
  } else if (config.originMode === 'first_room_interior' && validation.validRooms.length > 0) {
    const r0 = validation.validRooms[0];
    const rCenterPlotX = r0.x + r0.width / 2 - project.plotWidth / 2;
    const rCenterPlotZ = r0.y + r0.length / 2 - project.plotLength / 2;
    anchorX = -rCenterPlotX * combinedScaleFactor;
    anchorZ = -rCenterPlotZ * combinedScaleFactor;
  }

  const clampOffset = (val: number, maxAbs: number) =>
    Number.isFinite(val) ? Math.max(-maxAbs, Math.min(maxAbs, val)) : 0;

  const manualX = clampOffset(config.customOffsetMetres?.x ?? 0, 200);
  const manualY = clampOffset(config.customOffsetMetres?.y ?? 0, 50);
  const manualZ = clampOffset(config.customOffsetMetres?.z ?? 0, 200);

  const totalX = Number((anchorX + manualX).toFixed(5));
  const totalY = Number((anchorY + manualY).toFixed(5));
  const totalZ = Number((anchorZ + manualZ).toFixed(5));

  const rawYaw = Number.isFinite(config.yawDegrees) ? config.yawDegrees : 0;
  const normalizedYaw = ((((rawYaw + 180) % 360) + 360) % 360) - 180;
  const yawRadians = Number(((normalizedYaw * Math.PI) / 180).toFixed(6));

  const eyeHeightMetres =
    config.navigation.postureMode === 'seated'
      ? Math.max(0.8, Math.min(2.2, config.navigation.seatedEyeHeightMetres || 1.2))
      : Math.max(1.0, Math.min(2.5, config.navigation.standingEyeHeightMetres || 1.65));

  _tempVec3A.set(totalX, totalY, totalZ);
  _tempEuler.set(0, yawRadians, 0, 'YXZ');
  _tempQuat.setFromEuler(_tempEuler);
  _tempVec3B.set(combinedScaleFactor, combinedScaleFactor, combinedScaleFactor);
  _tempMat4.compose(_tempVec3A, _tempQuat, _tempVec3B);

  const worldMatrix4x4 = _tempMat4.elements.map((n) => Number(n.toFixed(6)));

  const hasCustomTransform =
    config.scalePreset !== '1:1' ||
    Math.abs(manualX) > 1e-4 ||
    Math.abs(manualY) > 1e-4 ||
    Math.abs(manualZ) > 1e-4 ||
    Math.abs(normalizedYaw) > 1e-4;

  return {
    sourceProjectUnit: sourceUnit,
    unitToMetresFactor,
    scalePreset: config.scalePreset,
    scaleMultiplier,
    combinedScaleFactor,
    scaleDerivationBasis: hasCustomTransform
      ? 'user-configured-preview-transform'
      : 'validated-project-geometry',
    originMode: config.originMode,
    anchorOriginOffsetMetres: {
      x: Number(anchorX.toFixed(5)),
      y: Number(anchorY.toFixed(5)),
      z: Number(anchorZ.toFixed(5)),
    },
    manualOffsetMetres: {
      x: manualX,
      y: manualY,
      z: manualZ,
    },
    totalTranslationMetres: {
      x: totalX,
      y: totalY,
      z: totalZ,
    },
    yawDegrees: normalizedYaw,
    yawRadians,
    eyeHeightMetres,
    worldMatrix4x4,
    coordinateConvention: {
      xAxis: '+X East across plotWidth',
      yAxis: '+Y Vertical Up in metres',
      zAxis: '+Z South across plotLength',
    },
    isVirtualSceneOnly: true,
    isGeospatiallyRegistered: false,
    inheritsARRegistration: false,
  };
}

/**
 * Group C — Model preflight & complexity budget validator.
 */
export function prepareVRModelPreflight(
  project: Project | null | undefined,
  config?: VRDesignReviewConfig
): VRModelPreflightSummary {
  if (!project) {
    return {
      isReady: false,
      projectId: '',
      projectName: 'No Project Selected',
      sourceUnit: 'metres',
      unitConfirmed: false,
      plotDimensionsSourceUnits: { width: 0, length: 0 },
      plotDimensionsMetresAt1To1: { widthM: 0, lengthM: 0, heightM: 0 },
      scaledDimensionsMetres: { widthM: 0, lengthM: 0, heightM: 0 },
      floorCount: 0,
      validRoomCount: 0,
      invalidRoomCount: 0,
      structuralColumnCount: 0,
      ifcMappedElementCount: 0,
      cad2DOnlySkippedCount: 0,
      terrainTriangleCount: 0,
      logisticsZoneCount: 0,
      estimatedTriangleCount: 0,
      estimatedDrawCallCount: 0,
      estimatedMaterialCount: 0,
      withinHeadsetComplexityBudget: true,
      blockingErrors: ['No project selected for VR design review.'],
      validationWarnings: [],
      missingDataDisclosures: [],
      geometryFingerprint: 'vr-fp-empty',
    };
  }

  const effectiveConfig = config || createDefaultVRDesignReviewConfig(project);
  const blockingErrors: string[] = [];
  const validationWarnings: string[] = [];
  const missingDataDisclosures: string[] = [];

  const hasKnownUnit = project.unit === 'feet' || project.unit === 'metres';
  const unitConfirmed = hasKnownUnit && effectiveConfig.userConfirmedSourceUnits !== false;
  if (!unitConfirmed) {
    blockingErrors.push(
      'Source measurement unit is unconfirmed or unknown. Confirm project units (feet or metres) before starting VR review.'
    );
  }

  if (
    typeof project.plotWidth !== 'number' ||
    !Number.isFinite(project.plotWidth) ||
    project.plotWidth <= 0 ||
    typeof project.plotLength !== 'number' ||
    !Number.isFinite(project.plotLength) ||
    project.plotLength <= 0
  ) {
    blockingErrors.push(
      `Invalid plot dimensions (${project.plotWidth} × ${project.plotLength}). Positive finite plotWidth and plotLength are required.`
    );
  }

  const rawRooms = project.floorPlan?.rooms || [];
  const roomValidation = validateFloorPlanFor3D(
    rawRooms,
    project.plotWidth > 0 ? project.plotWidth : 10,
    project.plotLength > 0 ? project.plotLength : 10
  );

  if (roomValidation.validRooms.length === 0) {
    blockingErrors.push(
      'Project contains no valid 3D reviewable rooms. Add or import valid room geometry before entering VR design review.'
    );
  }

  if (roomValidation.invalidRooms.length > 0) {
    validationWarnings.push(
      `${roomValidation.invalidRooms.length} malformed room(s) were excluded from 3D generation: ${roomValidation.invalidRooms
        .map((r) => `${r.name} (${r.reason})`)
        .join(', ')}.`
    );
  }

  for (const w of roomValidation.warnings) {
    validationWarnings.push(w);
  }

  // Check floor-level consistency
  const maxRoomFloor = roomValidation.validRooms.reduce(
    (max, r) => Math.max(max, r.floorLevel || 1),
    1
  );
  const declaredFloors = Math.max(1, project.floors || 1);
  if (maxRoomFloor > declaredFloors) {
    validationWarnings.push(
      `Rooms exist on Floor ${maxRoomFloor}, which exceeds declared project.floors (${declaredFloors}).`
    );
  }
  if (
    typeof effectiveConfig.layers.selectedFloor === 'number' &&
    !roomValidation.validRooms.some((r) => r.floorLevel === effectiveConfig.layers.selectedFloor)
  ) {
    validationWarnings.push(
      `Selected floor filter (Floor ${effectiveConfig.layers.selectedFloor}) has no modelled rooms in the current floor plan.`
    );
  }

  // Check missing data disclosures honestly (Section 9)
  missingDataDisclosures.push(
    'Pitched/complex roof assemblies are not separately modelled; rooms are represented with flat floor slabs and perimeter walls.'
  );
  if (!project.designAlternatives || project.designAlternatives.length === 0) {
    missingDataDisclosures.push(
      'No custom interior/facade finish alternatives are applied; default architectural neutral materials are shown.'
    );
  }
  if (!project.terrainModeling?.surfaceMesh) {
    missingDataDisclosures.push(
      'No P43 Topographic TIN surface is present; building rests on a flat local plot datum slab.'
    );
  }

  // P42 CAD 2D-only reference entities skipped
  const cad2DOnlySkippedCount = project.cadInterop?.referenceEntities?.length || 0;
  if (cad2DOnlySkippedCount > 0) {
    validationWarnings.push(
      `${cad2DOnlySkippedCount} P42 2D-only CAD reference entity/entities (annotations/lines without 3D height) are preserved as 2D references and excluded from fabricated 3D VR geometry.`
    );
  }

  const ifcMappedElementCount = project.ifcInterop?.idMappings?.length || 0;
  const structuralColumnCount = project.structuralCoordination?.columns?.length || 0;
  const terrainTriangleCount = project.terrainModeling?.surfaceMesh?.triangles?.length || 0;
  const logisticsZoneCount = project.siteLogistics?.activePlan?.logisticsZones?.length || 0;

  // Estimate rendering complexity
  const validRoomCount = roomValidation.validRooms.length;
  const estimatedTriangleCount =
    24 + // plot slab + road band
    validRoomCount * 84 + // slab + 4 walls + conceptual door/window per room
    structuralColumnCount * 32 +
    terrainTriangleCount +
    logisticsZoneCount * 24;

  const estimatedDrawCallCount =
    4 +
    validRoomCount * 7 +
    structuralColumnCount +
    (terrainTriangleCount > 0 ? 2 : 0) +
    logisticsZoneCount * 2;

  const estimatedMaterialCount =
    6 + validRoomCount * 2 + (terrainTriangleCount > 0 ? 2 : 0) + (logisticsZoneCount > 0 ? 4 : 0);

  const withinHeadsetComplexityBudget =
    estimatedTriangleCount <= MAX_RECOMMENDED_VR_TRIANGLES &&
    estimatedDrawCallCount <= MAX_RECOMMENDED_VR_DRAW_CALLS &&
    estimatedMaterialCount <= MAX_RECOMMENDED_VR_MATERIALS;

  if (!withinHeadsetComplexityBudget) {
    validationWarnings.push(
      `Scene complexity (${estimatedTriangleCount.toLocaleString()} tris, ${estimatedDrawCallCount} draw calls) exceeds the recommended VR headset comfort budget (${MAX_RECOMMENDED_VR_TRIANGLES.toLocaleString()} tris / ${MAX_RECOMMENDED_VR_DRAW_CALLS} draw calls). Consider filtering to a single floor or disabling optional overlays.`
    );
  }

  const unitFactor = getUnitToMetresFactor(project.unit === 'feet' ? 'feet' : 'metres');
  const scaleMult = VR_SCALE_PRESET_MULTIPLIERS[effectiveConfig.scalePreset] ?? 1.0;
  const storyHeightMetres = 3.15;
  const totalStories = Math.max(declaredFloors, maxRoomFloor);

  const widthM1To1 = Number((project.plotWidth * unitFactor).toFixed(4));
  const lengthM1To1 = Number((project.plotLength * unitFactor).toFixed(4));
  const heightM1To1 = Number((totalStories * storyHeightMetres).toFixed(4));

  return {
    isReady: blockingErrors.length === 0,
    projectId: project.id,
    projectName: project.name,
    sourceUnit: project.unit === 'feet' ? 'feet' : 'metres',
    unitConfirmed,
    plotDimensionsSourceUnits: {
      width: project.plotWidth,
      length: project.plotLength,
    },
    plotDimensionsMetresAt1To1: {
      widthM: widthM1To1,
      lengthM: lengthM1To1,
      heightM: heightM1To1,
    },
    scaledDimensionsMetres: {
      widthM: Number((widthM1To1 * scaleMult).toFixed(4)),
      lengthM: Number((lengthM1To1 * scaleMult).toFixed(4)),
      heightM: Number((heightM1To1 * scaleMult).toFixed(4)),
    },
    floorCount: totalStories,
    validRoomCount,
    invalidRoomCount: roomValidation.invalidRooms.length,
    structuralColumnCount,
    ifcMappedElementCount,
    cad2DOnlySkippedCount,
    terrainTriangleCount,
    logisticsZoneCount,
    estimatedTriangleCount,
    estimatedDrawCallCount,
    estimatedMaterialCount,
    withinHeadsetComplexityBudget,
    blockingErrors,
    validationWarnings,
    missingDataDisclosures,
    geometryFingerprint: computeVRModelGeometryFingerprint(project),
  };
}

/**
 * Group F — Cross-Discipline Read-Only Summaries & Freshness Evaluation (P41–P48).
 * Never fabricates spatial surfaces for project-level summaries (P44, P45).
 */
export function buildVRCrossDisciplineDigests(
  project: Project | null | undefined
): VRCrossDisciplineLayerSummary[] {
  if (!project) return [];

  const digests: VRCrossDisciplineLayerSummary[] = [];

  // P41 — OpenBIM & IFC Interoperability
  const ifcMeta = project.ifcInterop;
  const ifcMappingsCount = ifcMeta?.idMappings?.length || 0;
  const ifcUnsupportedCount = ifcMeta?.unsupportedEntitySummary
    ? Object.values(ifcMeta.unsupportedEntitySummary).reduce((a, b) => a + b, 0)
    : 0;
  digests.push({
    moduleId: 'P41',
    title: 'P41 — OpenBIM & IFC Interoperability',
    isAvailableInProject: Boolean(ifcMeta && ifcMappingsCount > 0),
    isStale: false,
    representationMode: 'spatial-3d-geometry',
    summaryHeadline:
      ifcMeta && ifcMappingsCount > 0
        ? `${ifcMappingsCount} IFC entity ID mapping(s) preserved (${ifcMeta.sourceMetadata?.normalizedSchema || 'IFC4'}).`
        : 'No IFC import metadata recorded for this project.',
    keyMetrics: [
      { label: 'Mapped IFC Entities', value: String(ifcMappingsCount) },
      {
        label: 'Preserved Read-Only Elements',
        value: String(ifcMeta?.preservedElements?.length || 0),
      },
      { label: 'Unsupported/Omitted Entities', value: String(ifcUnsupportedCount) },
    ],
    legendItems: [
      {
        label: 'IFC-Backed Space / Column (Inspectable GlobalId)',
        colorHex: '#0d9488',
        patternOrSymbol: '[IFC]',
      },
    ],
    limitationsAndDisclaimers: [
      'Only supported IFC architectural entities (IfcSpace, IfcColumn, rectilinear footprints) are rendered as 3D meshes; unsupported representations (e.g., FacetedBrep, BooleanClippingResult) are disclosed in the import report and not fabricated.',
    ],
  });

  // P42 — CAD Drawing Exchange
  const cadMeta = project.cadInterop;
  const cadProvenanceCount = cadMeta?.provenanceMappings?.length || 0;
  const cadRef2DCount = cadMeta?.referenceEntities?.length || 0;
  digests.push({
    moduleId: 'P42',
    title: 'P42 — CAD Drawing Exchange',
    isAvailableInProject: Boolean(cadMeta && (cadProvenanceCount > 0 || cadRef2DCount > 0)),
    isStale: false,
    representationMode: 'filtered-2d-reference',
    summaryHeadline:
      cadMeta && (cadProvenanceCount > 0 || cadRef2DCount > 0)
        ? `${cadProvenanceCount} CAD-mapped room/column entity(ies) in 3D; ${cadRef2DCount} 2D-only annotation/reference entity(ies) held out from 3D extrusion.`
        : 'No CAD DXF exchange metadata recorded for this project.',
    keyMetrics: [
      { label: '3D-Mapped CAD Entities', value: String(cadProvenanceCount) },
      { label: '2D-Only References (Not Extruded)', value: String(cadRef2DCount) },
    ],
    legendItems: [
      {
        label: '2D Reference Entity (Kept Unextruded)',
        colorHex: '#64748b',
        patternOrSymbol: '[2D-REF]',
      },
    ],
    limitationsAndDisclaimers: [
      'Two-dimensional DXF annotations (TEXT, MTEXT, unclosed lines) are never extruded into fabricated 3D walls or columns without an explicit room/column mapping rule.',
    ],
  });

  // P43 — Terrain & Topographic Site Modeling
  const terrainMeta = project.terrainModeling;
  const terrainTriCount = terrainMeta?.surfaceMesh?.triangles?.length || 0;
  digests.push({
    moduleId: 'P43',
    title: 'P43 — Terrain & Topographic Site Modeling',
    isAvailableInProject: Boolean(terrainMeta && terrainTriCount > 0),
    isStale: false,
    representationMode: 'spatial-3d-geometry',
    summaryHeadline:
      terrainMeta && terrainTriCount > 0
        ? `Delaunay TIN surface (${terrainTriCount} triangles, CRS: ${terrainMeta.calibration?.horizontalCRS || 'Local-Plot-Planar'}, Datum: ${terrainMeta.calibration?.verticalDatum || 'Local-Relative'}).`
        : 'No P43 Topographic TIN surface loaded for this project.',
    keyMetrics: [
      { label: 'TIN Triangles', value: String(terrainTriCount) },
      {
        label: 'Elevation Span',
        value: terrainMeta?.analysis
          ? `${terrainMeta.analysis.minElevation.toFixed(2)}m to ${terrainMeta.analysis.maxElevation.toFixed(2)}m`
          : 'N/A',
      },
      {
        label: 'Horizontal CRS / Vertical Datum',
        value: terrainMeta?.calibration
          ? `${terrainMeta.calibration.horizontalCRS} / ${terrainMeta.calibration.verticalDatum}`
          : 'N/A',
      },
    ],
    legendItems: [
      { label: 'Delaunay TIN Mesh', colorHex: '#10b981', patternOrSymbol: '▲ TIN' },
      { label: 'Derived Contour Lines', colorHex: '#047857', patternOrSymbol: '═ Contour' },
    ],
    limitationsAndDisclaimers: [
      'Visible terrain mesh in VR represents interpolated survey/sample points in local plot coordinates and does not guarantee physical site alignment.',
    ],
  });

  // P44 — Embodied & Whole-Life Carbon Assessment (Read-Only Summary — NEVER fabricates spatial room heatmaps)
  const carbonMeta = project.carbonAssessment?.activeAssessment;
  digests.push({
    moduleId: 'P44',
    title: 'P44 — Embodied & Whole-Life Carbon Assessment',
    isAvailableInProject: Boolean(carbonMeta),
    isStale: false,
    representationMode: 'read-only-summary-panel',
    summaryHeadline: carbonMeta
      ? `${carbonMeta.scopeClassification}: Whole-Life A–C = ${carbonMeta.totals.wholeLifeCarbonAtoCTCO2e.toFixed(2)} tCO2e (${carbonMeta.dataQuality.inventoryCompletenessPercent.toFixed(0)}% inventory mapped).`
      : 'No P44 Whole-Life Carbon assessment saved on this project.',
    keyMetrics: carbonMeta
      ? [
          {
            label: 'Upfront Carbon (A0–A5)',
            value: `${carbonMeta.totals.upfrontCarbonA0toA5TCO2e.toFixed(2)} tCO2e`,
          },
          {
            label: 'Whole-Life Carbon (A–C)',
            value: `${carbonMeta.totals.wholeLifeCarbonAtoCTCO2e.toFixed(2)} tCO2e`,
          },
          {
            label: 'Module D (Beyond Boundary)',
            value: `${((carbonMeta.moduleDSummary.netModuleDBenefitOrLoadKgCO2e || 0) / 1000).toFixed(2)} tCO2e (separate)`,
          },
          {
            label: 'Unassessed Modules',
            value:
              carbonMeta.dataQuality.unassessedOrUnavailableModules.join(', ') || 'None',
          },
        ]
      : [{ label: 'Status', value: 'Unavailable — run P44 Whole-Life Carbon Workspace first' }],
    legendItems: [
      {
        label: 'Read-Only Project/Category Carbon Summary (No Arbitrary Room Heatmap)',
        colorHex: '#059669',
        patternOrSymbol: '[P44-SUMMARY]',
      },
    ],
    limitationsAndDisclaimers: [
      'P49 displays P44 Whole-Life Carbon as a read-only project/category summary. Aggregate carbon totals are never assigned to arbitrary room surfaces as a fabricated spatial heatmap.',
    ],
  });

  // P45 — Climate Hazard & Resilience Analyzer (Read-Only Summary — preserves location/grid uncertainty)
  const climateMeta = project.climateResilience?.activeAssessment;
  digests.push({
    moduleId: 'P45',
    title: 'P45 — Climate Hazard & Resilience Analyzer',
    isAvailableInProject: Boolean(climateMeta),
    isStale: Boolean(climateMeta?.isStale),
    staleReason: climateMeta?.staleReasons?.join('; '),
    representationMode: 'read-only-summary-panel',
    summaryHeadline: climateMeta
      ? `Scenario ${climateMeta.config.activeScenario} (${climateMeta.config.activeTimeHorizon}): ${climateMeta.summaryCounts.highOrVeryHighRiskFindings} high/very-high finding(s), Location status: ${climateMeta.locationPreflight.status}.`
      : 'No P45 Climate Hazard & Resilience assessment saved on this project.',
    keyMetrics: climateMeta
      ? [
          { label: 'Location Preflight', value: climateMeta.locationPreflight.status },
          {
            label: 'High / Very-High Findings',
            value: String(climateMeta.summaryCounts.highOrVeryHighRiskFindings),
          },
          {
            label: 'Assessed Hazards',
            value: `${climateMeta.summaryCounts.hazardsAssessed} / ${climateMeta.summaryCounts.totalHazardsCataloged}`,
          },
          {
            label: 'Selected Adaptation Measures',
            value: String(climateMeta.summaryCounts.selectedAdaptationMeasures),
          },
        ]
      : [{ label: 'Status', value: 'Unavailable — run P45 Climate Resilience Workspace first' }],
    legendItems: [
      {
        label: 'Read-Only Screening Summary (Coarse Grid — Not Parcel-Certified)',
        colorHex: '#0284c7',
        patternOrSymbol: '[P45-SUMMARY]',
      },
    ],
    limitationsAndDisclaimers: [
      'P45 climate screening uses coarse regional grid projections and is displayed as a read-only summary panel rather than a fabricated parcel-level hazard surface.',
    ],
  });

  // P46 — Building Envelope Performance Analyzer
  const envMeta = project.envelopePerformance?.activeAssessment;
  const envHighRiskCount = envMeta
    ? envMeta.findings.filter((f) => f.severity === 'high' || f.severity === 'moderate').length
    : 0;
  digests.push({
    moduleId: 'P46',
    title: 'P46 — Building Envelope Performance Analyzer',
    isAvailableInProject: Boolean(envMeta),
    isStale: false,
    representationMode: 'semantic-3d-highlight',
    summaryHeadline: envMeta
      ? `${envMeta.assemblies.length} envelope assembly(ies) evaluated (Overall WWR: ${(envMeta.summary.overallWindowToWallRatioPercent ?? 0).toFixed(1)}%, H_tr: ${(envMeta.summary.transmissionHeatTransferCoeffWPerK ?? 0).toFixed(1)} W/K).`
      : 'No P46 Building Envelope assessment saved on this project.',
    keyMetrics: envMeta
      ? [
          {
            label: 'Overall WWR',
            value: `${(envMeta.summary.overallWindowToWallRatioPercent ?? 0).toFixed(1)}%`,
          },
          {
            label: 'Transmission H_tr',
            value: `${(envMeta.summary.transmissionHeatTransferCoeffWPerK ?? 0).toFixed(1)} W/K`,
          },
          {
            label: 'Risk / Warning Findings',
            value: String(envHighRiskCount),
          },
        ]
      : [{ label: 'Status', value: 'Unavailable — run P46 Envelope Analyzer first' }],
    legendItems: [
      { label: 'Optimal Facade Rating', colorHex: '#10b981', patternOrSymbol: '■ OPTIMAL' },
      { label: 'Moderate Facade Rating', colorHex: '#f59e0b', patternOrSymbol: '▲ MODERATE' },
      { label: 'High-Risk Facade Rating', colorHex: '#ef4444', patternOrSymbol: '◆ HIGH-RISK' },
    ],
    limitationsAndDisclaimers: [
      'P46 perimeter ribbons are semantic status indicators only and do not represent physical insulation thickness, CFD airflow, or real-time surface temperatures.',
    ],
  });

  // P47 — Construction Site Logistics Planner
  const logPlan = project.siteLogistics?.activePlan;
  const logZonesCount = logPlan?.logisticsZones?.length || 0;
  const logEquipCount = logPlan?.equipmentPlacements?.length || 0;
  digests.push({
    moduleId: 'P47',
    title: 'P47 — Construction Site Logistics Planner',
    isAvailableInProject: Boolean(logPlan && (logZonesCount > 0 || logEquipCount > 0)),
    isStale: false,
    representationMode: 'spatial-3d-geometry',
    summaryHeadline: logPlan
      ? `Plan "${logPlan.name}": ${logZonesCount} logistics zone(s), ${logEquipCount} equipment/crane placement(s) across ${logPlan.phases.length} phase(s).`
      : 'No P47 Site Logistics Plan saved on this project.',
    keyMetrics: logPlan
      ? [
          { label: 'Logistics Zones', value: String(logZonesCount) },
          { label: 'Equipment / Cranes', value: String(logEquipCount) },
          { label: 'Gate Readiness', value: logPlan.summary.overallReadinessStatus },
        ]
      : [{ label: 'Status', value: 'Unavailable — run P47 Site Logistics Planner first' }],
    legendItems: [
      { label: 'Laydown / Storage Zone', colorHex: '#f59e0b', patternOrSymbol: '▣ ZONE' },
      { label: 'Waste / Skips Zone', colorHex: '#ef4444', patternOrSymbol: '▣ WASTE' },
      { label: 'Crane Swing Radius Ring', colorHex: '#f97316', patternOrSymbol: '◯ CRANE' },
    ],
    limitationsAndDisclaimers: [
      'P47 zones and crane swing rings in VR are spatial coordination aids only and do not substitute for a certified lift plan, geotechnical bearing check, or site safety approval.',
    ],
  });

  // P48 — Augmented Reality Site Visualization
  const arMeta = project.arSiteVisualization;
  digests.push({
    moduleId: 'P48',
    title: 'P48 — Augmented Reality Site Visualization',
    isAvailableInProject: Boolean(arMeta),
    isStale: false,
    representationMode: 'read-only-summary-panel',
    summaryHeadline: arMeta
      ? `Saved AR preset ${arMeta.savedConfig.placement.scalePreset} (Origin: ${arMeta.savedConfig.placement.anchorOriginMode}, Geospatially Registered: false).`
      : 'Default P48 unit/transform pipeline available (no custom AR preset saved yet).',
    keyMetrics: [
      {
        label: 'Saved AR Scale Preset',
        value: arMeta?.savedConfig?.placement?.scalePreset || '1:1 (default)',
      },
      { label: 'Geospatially Registered', value: 'false (Preserved)' },
    ],
    legendItems: [
      {
        label: 'Shared Metric Unit Normalization (P48 ↔ P49)',
        colorHex: '#0d9488',
        patternOrSymbol: '[METRIC-1X]',
      },
    ],
    limitationsAndDisclaimers: [
      'P49 reuses P48 metric normalization and scene conventions without mutating P48 AR placement settings or altering P48 isGeospatiallyRegistered: false.',
    ],
  });

  return digests;
}

/**
 * Builds the complete Three.js group for P49 VR Design Review, tagging all reviewable
 * meshes with `userData.vrInspectable: VRInspectableMetadata` for controller raycasting
 * and desktop click inspection.
 */
export function buildVRDesignReviewThreeGroup(
  project: Project,
  config: VRDesignReviewConfig,
  annotations: VRReviewAnnotation[] = []
): {
  rootGroup: THREE.Group;
  preflight: VRModelPreflightSummary;
  transform: VRSceneTransformSummary;
  inspectableCount: number;
} {
  const preflight = prepareVRModelPreflight(project, config);
  const transform = computeVRSceneTransform(project, config);

  const rootGroup = new THREE.Group();
  rootGroup.name = 'PlotifyVRDesignReviewRoot';

  if (!preflight.isReady) {
    return { rootGroup, preflight, transform, inspectableCount: 0 };
  }

  const unitFactor = transform.unitToMetresFactor;
  const activeAlt =
    project.designAlternatives?.find((a) => a.id === project.activeAlternativeId) || null;
  const viewerConfig = getDefaultViewerConfig(project.unit, activeAlt, Boolean(project.applyDesignTo3D));
  viewerConfig.showWalls = config.layers.showBaseBuildingShell;
  viewerConfig.showSlabs = config.layers.showRoomLabelsAndSlabs;
  viewerConfig.showOpenings = config.layers.showOpenings;
  viewerConfig.showColumns = config.layers.showStructuralColumns;
  viewerConfig.selectedFloor = config.layers.selectedFloor;

  const roomValidation = validateFloorPlanFor3D(
    project.floorPlan?.rooms || [],
    project.plotWidth,
    project.plotLength
  );

  // Filter rooms if isolatedElementId targets a specific room
  const filteredRooms =
    config.layers.isolatedElementId &&
    roomValidation.validRooms.some((r) => r.id === config.layers.isolatedElementId)
      ? roomValidation.validRooms.filter((r) => r.id === config.layers.isolatedElementId)
      : roomValidation.validRooms;

  const { group: buildingGroup } = buildBuilding3DModel(project, viewerConfig, filteredRooms);
  buildingGroup.name = 'VR_BaseBuildingAndTerrain';

  // Toggle P43 Terrain visibility
  const terrainSubgroup = buildingGroup.getObjectByName('P43_TerrainSurface');
  if (terrainSubgroup) {
    terrainSubgroup.visible = Boolean(config.layers.showP43TerrainSurface);
  }

  // Index P41 IFC mappings by plotifyEntityId for provenance enrichment
  const ifcByPlotifyId = new Map<
    string,
    { globalId: string; stepId: number; ifcType: string }
  >();
  for (const m of project.ifcInterop?.idMappings || []) {
    ifcByPlotifyId.set(m.plotifyEntityId, {
      globalId: m.sourceGlobalId,
      stepId: m.sourceStepId,
      ifcType: m.sourceIfcType,
    });
  }

  let inspectableCount = 0;

  // Tag base building meshes with structured VRInspectableMetadata
  const roomMapById = new Map<string, FloorPlanRoom>();
  for (const r of filteredRooms) {
    roomMapById.set(r.id, r);
  }

  buildingGroup.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;

    if (obj.name === 'PlotSlab') {
      const meta: VRInspectableMetadata = {
        elementId: 'plot-ground-slab',
        elementType: 'plot-ground',
        label: `Plot Ground Slab (${project.plotWidth} × ${project.plotLength} ${project.unit})`,
        floorLevel: 1,
        dimensionsProjectUnits: {
          width: project.plotWidth,
          length: project.plotLength,
          unit: project.unit,
        },
        dimensionsMetresAt1To1: {
          widthM: Number((project.plotWidth * unitFactor).toFixed(2)),
          lengthM: Number((project.plotLength * unitFactor).toFixed(2)),
          areaM2: Number((project.plotWidth * project.plotLength * unitFactor * unitFactor).toFixed(2)),
        },
        sourceModule: 'Base-3D',
      };
      obj.userData.vrInspectable = meta;
      obj.userData.isWalkableFloor = true;
      inspectableCount++;
      return;
    }

    if (obj.name === 'TerrainTINMesh') {
      const meta: VRInspectableMetadata = {
        elementId: 'p43-terrain-tin',
        elementType: 'terrain-surface',
        label: `P43 Topographic TIN Surface (${preflight.terrainTriangleCount} triangles)`,
        sourceModule: 'P43-Terrain',
        semanticOverlayNote: `CRS: ${project.terrainModeling?.calibration?.horizontalCRS || 'Local-Plot-Planar'}, Datum: ${project.terrainModeling?.calibration?.verticalDatum || 'Local-Relative'}`,
      };
      obj.userData.vrInspectable = meta;
      inspectableCount++;
      return;
    }

    // Check if parent is a Room group: Room_<name>_<id>
    const parentName = obj.parent?.name || '';
    if (parentName.startsWith('Room_')) {
      const matchedRoom = filteredRooms.find((r) => parentName === `Room_${r.name}_${r.id}`);
      if (matchedRoom) {
        const ifcInfo = ifcByPlotifyId.get(matchedRoom.id);
        const isSlab = Math.abs(obj.geometry.boundingBox?.max.y || 0) < 0.6 && obj.position.y < (matchedRoom.floorLevel - 1) * 12 + 1;
        const elementType: VRInspectableElementType = isSlab ? 'room' : 'wall';
        const meta: VRInspectableMetadata = {
          elementId: matchedRoom.id,
          elementType,
          label: `${matchedRoom.name} (Floor ${matchedRoom.floorLevel})`,
          floorLevel: matchedRoom.floorLevel,
          roomId: matchedRoom.id,
          roomName: matchedRoom.name,
          dimensionsProjectUnits: {
            width: matchedRoom.width,
            length: matchedRoom.length,
            unit: project.unit,
          },
          dimensionsMetresAt1To1: {
            widthM: Number((matchedRoom.width * unitFactor).toFixed(2)),
            lengthM: Number((matchedRoom.length * unitFactor).toFixed(2)),
            areaM2: Number((matchedRoom.width * matchedRoom.length * unitFactor * unitFactor).toFixed(2)),
          },
          sourceModule: ifcInfo ? 'P41-IFC' : 'Base-3D',
          ifcProvenance: ifcInfo,
        };
        obj.userData.vrInspectable = meta;
        if (Array.isArray(obj.material)) {
          obj.userData.isWalkableFloor = true;
        }
        inspectableCount++;
      }
    } else if (parentName === 'structural_columns') {
      const colIdx = obj.parent ? obj.parent.children.indexOf(obj) : 0;
      const colRecord = project.structuralCoordination?.columns?.[colIdx];
      const colId = colRecord?.id || `col-${colIdx + 1}`;
      const ifcInfo = ifcByPlotifyId.get(colId);
      const meta: VRInspectableMetadata = {
        elementId: colId,
        elementType: 'structural-column',
        label: `Structural Column ${colRecord?.label || colId}`,
        floorLevel: colRecord?.floorLevels?.[0] || 1,
        sourceModule: ifcInfo ? 'P41-IFC' : 'P13-Structural',
        ifcProvenance: ifcInfo,
      };
      obj.userData.vrInspectable = meta;
      inspectableCount++;
    }
  });

  rootGroup.add(buildingGroup);

  const pw = project.plotWidth;
  const pl = project.plotLength;
  const wallH = viewerConfig.wallHeight;
  const storyH = wallH + viewerConfig.floorThickness;
  const totalH = Math.max(1, project.floors || 1) * storyH;

  // P46 — Building Envelope Semantic Highlights
  const envAssessment = project.envelopePerformance?.activeAssessment;
  if (config.layers.showP46EnvelopeHighlights && envAssessment && envAssessment.assemblies.length > 0) {
    const envGroup = new THREE.Group();
    envGroup.name = 'P46_EnvelopeHighlights';

    const hasCondensationRisk = (envAssessment.moistureRecords || []).some(
      (m) => m.surfaceCondensationRisk || m.interstitialCondensationRisk
    );
    const overallWwr = envAssessment.summary.overallWindowToWallRatioPercent ?? 0;
    const effectiveU = envAssessment.summary.effectiveEnvelopeUWithBridgesWPerM2K ?? 0;

    const directions: Array<'North' | 'South' | 'East' | 'West'> = ['North', 'South', 'East', 'West'];
    for (const orientation of directions) {
      const ratingLabel = hasCondensationRisk
        ? 'HIGH-RISK'
        : overallWwr > 45
          ? 'MODERATE'
          : 'OPTIMAL';
      const colorHex = hasCondensationRisk
        ? 0xef4444
        : overallWwr > 45
          ? 0xf59e0b
          : 0x10b981;
      const isNS = orientation === 'North' || orientation === 'South';
      const span = isNS ? pw * 0.85 : pl * 0.85;
      const ribbonGeo = new THREE.BoxGeometry(
        isNS ? span : 0.18,
        totalH * 0.9,
        isNS ? 0.18 : span
      );
      const ribbonMat = new THREE.MeshStandardMaterial({
        color: colorHex,
        roughness: 0.4,
        metalness: 0.1,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      });
      const ribbonMesh = new THREE.Mesh(ribbonGeo, ribbonMat);
      ribbonMesh.name = `P46_Facade_${orientation}`;

      const offsetDist = 0.35;
      if (orientation === 'North') {
        ribbonMesh.position.set(0, totalH * 0.45, -pl / 2 - offsetDist);
      } else if (orientation === 'South') {
        ribbonMesh.position.set(0, totalH * 0.45, pl / 2 + offsetDist);
      } else if (orientation === 'East') {
        ribbonMesh.position.set(pw / 2 + offsetDist, totalH * 0.45, 0);
      } else {
        ribbonMesh.position.set(-pw / 2 - offsetDist, totalH * 0.45, 0);
      }

      const meta: VRInspectableMetadata = {
        elementId: `p46-facade-${orientation.toLowerCase()}`,
        elementType: 'envelope-facade',
        label: `P46 ${orientation} Facade Highlight (${ratingLabel})`,
        sourceModule: 'P46-Envelope',
        semanticOverlayNote: `Semantic overlay only — Overall WWR ${overallWwr.toFixed(1)}%, Effective U-value ${effectiveU.toFixed(2)} W/m²K. Does not represent physical wall thickness or simulated heat-flux.`,
      };
      ribbonMesh.userData.vrInspectable = meta;
      inspectableCount++;
      envGroup.add(ribbonMesh);
    }

    rootGroup.add(envGroup);
  }

  // P47 — Construction Site Logistics Overlays
  const logisticsPlan = project.siteLogistics?.activePlan;
  if (config.layers.showP47SiteLogistics && logisticsPlan) {
    const logisticsGroup = new THREE.Group();
    logisticsGroup.name = 'P47_SiteLogisticsOverlay';
    const phaseFilter = config.layers.selectedSiteLogisticsPhaseId;
    const offsetX = -pw / 2;
    const offsetZ = -pl / 2;
    const metresToProj = 1 / unitFactor;

    const zoneColorByCategory: Record<string, number> = {
      material_storage: 0xf59e0b,
      laydown_staging: 0xf59e0b,
      waste_skip_recycling: 0xef4444,
      prefab_envelope_assembly: 0x3b82f6,
      loading_unloading_bay: 0x10b981,
      spoil_topsoil_stockpile: 0x14b8a6,
      hazardous_coshh_store: 0xdc2626,
    };

    for (const zone of logisticsPlan.logisticsZones || []) {
      if (phaseFilter !== 'all' && !zone.activePhaseIds.includes(phaseFilter)) continue;
      const zw = Math.max(0.5, zone.bounds.widthM * metresToProj);
      const zl = Math.max(0.5, zone.bounds.lengthM * metresToProj);
      const zGeo = new THREE.BoxGeometry(zw, 0.16, zl);
      const zMat = new THREE.MeshStandardMaterial({
        color: zoneColorByCategory[zone.category] ?? 0xf59e0b,
        roughness: 0.6,
        metalness: 0.1,
        transparent: true,
        opacity: 0.6,
      });
      const zMesh = new THREE.Mesh(zGeo, zMat);
      zMesh.name = `P47_Zone_${zone.id}`;
      zMesh.position.set(
        offsetX + zone.bounds.x * metresToProj + zw / 2,
        0.1,
        offsetZ + zone.bounds.y * metresToProj + zl / 2
      );

      const meta: VRInspectableMetadata = {
        elementId: zone.id,
        elementType: 'logistics-zone',
        label: `P47 Zone: ${zone.name} (${zone.category})`,
        dimensionsProjectUnits: { width: zw, length: zl, unit: project.unit },
        sourceModule: 'P47-Logistics',
        semanticOverlayNote:
          'Design-coordination overlay only — not a certified site safety plan or lift approval.',
      };
      zMesh.userData.vrInspectable = meta;
      inspectableCount++;
      logisticsGroup.add(zMesh);
    }

    for (const eq of logisticsPlan.equipmentPlacements || []) {
      if (phaseFilter !== 'all' && !eq.activePhaseIds.includes(phaseFilter)) continue;
      const ew = Math.max(0.8, eq.baseBounds.widthM * metresToProj);
      const el = Math.max(0.8, eq.baseBounds.lengthM * metresToProj);
      const eqCenterX = offsetX + (eq.baseBounds.x + eq.baseBounds.widthM / 2) * metresToProj;
      const eqCenterZ = offsetZ + (eq.baseBounds.y + eq.baseBounds.lengthM / 2) * metresToProj;
      const eqGeo = new THREE.BoxGeometry(ew, 1.4, el);
      const eqMat = new THREE.MeshStandardMaterial({
        color: 0xf97316,
        roughness: 0.45,
        metalness: 0.35,
      });
      const eqMesh = new THREE.Mesh(eqGeo, eqMat);
      eqMesh.name = `P47_Equipment_${eq.id}`;
      eqMesh.position.set(eqCenterX, 0.7, eqCenterZ);

      const meta: VRInspectableMetadata = {
        elementId: eq.id,
        elementType: 'logistics-crane',
        label: `P47 Equipment: ${eq.name} (Radius: ${eq.operatingRadiusM}m)`,
        sourceModule: 'P47-Logistics',
        semanticOverlayNote:
          'Conceptual equipment envelope only — does not substitute for a certified lift study or crane capacity verification.',
      };
      eqMesh.userData.vrInspectable = meta;
      inspectableCount++;
      logisticsGroup.add(eqMesh);

      if (eq.operatingRadiusM > 0) {
        const radiusProj = eq.operatingRadiusM * metresToProj;
        const ringGeo = new THREE.RingGeometry(
          Math.max(0.2, radiusProj - 0.18),
          radiusProj,
          48
        );
        const ringMat = new THREE.MeshBasicMaterial({
          color: 0xf97316,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.65,
        });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.name = `P47_CraneSwingRing_${eq.id}`;
        ringMesh.rotation.x = -Math.PI / 2;
        ringMesh.position.set(eqCenterX, 0.18, eqCenterZ);
        logisticsGroup.add(ringMesh);
      }
    }

    rootGroup.add(logisticsGroup);
  }

  // P49 — 3D Review Annotation Pin Markers
  if (config.layers.showReviewAnnotations && annotations.length > 0) {
    const notesGroup = new THREE.Group();
    notesGroup.name = 'P49_ReviewAnnotationMarkers';
    const offsetX = -pw / 2;
    const offsetZ = -pl / 2;

    const priorityColor: Record<VRAnnotationPriority, number> = {
      low: 0x0ea5e9,
      medium: 0x14b8a6,
      high: 0xf59e0b,
      'critical-observation': 0xef4444,
    };

    for (const note of annotations) {
      if (
        typeof config.layers.selectedFloor === 'number' &&
        note.targetFloorLevel !== config.layers.selectedFloor
      ) {
        continue;
      }

      const pinGroup = new THREE.Group();
      pinGroup.name = `P49_Annotation_${note.annotationId}`;

      const stemGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.7, 12);
      const headGeo = new THREE.OctahedronGeometry(0.28, 1);
      const pinColor =
        note.anchorResolutionStatus === 'unresolved-target-removed'
          ? 0x94a3b8
          : priorityColor[note.priority] ?? 0x14b8a6;

      const pinMat = new THREE.MeshStandardMaterial({
        color: pinColor,
        roughness: 0.3,
        metalness: 0.2,
      });

      const stemMesh = new THREE.Mesh(stemGeo, pinMat);
      stemMesh.position.set(0, 0.35, 0);
      const headMesh = new THREE.Mesh(headGeo, pinMat);
      headMesh.position.set(0, 0.85, 0);

      const meta: VRInspectableMetadata = {
        elementId: note.annotationId,
        elementType: 'annotation-marker',
        label: `Review Note: ${note.title} [${note.priority}]`,
        floorLevel: note.targetFloorLevel,
        roomId: note.targetRoomId,
        roomName: note.targetRoomName,
        sourceModule: 'P49-Annotation',
        semanticOverlayNote: `${note.note} (${note.anchorResolutionStatus})`,
      };
      stemMesh.userData.vrInspectable = meta;
      headMesh.userData.vrInspectable = meta;
      inspectableCount += 2;

      pinGroup.add(stemMesh);
      pinGroup.add(headMesh);

      const localX = offsetX + note.anchorPositionLocalPlotUnits.x;
      const localY = note.anchorPositionLocalPlotUnits.y;
      const localZ = offsetZ + note.anchorPositionLocalPlotUnits.z;
      pinGroup.position.set(localX, localY, localZ);

      notesGroup.add(pinGroup);
    }

    rootGroup.add(notesGroup);
  }

  // Apply single-pass normalized transform to rootGroup
  rootGroup.scale.set(
    transform.combinedScaleFactor,
    transform.combinedScaleFactor,
    transform.combinedScaleFactor
  );
  rootGroup.rotation.set(0, transform.yawRadians, 0, 'YXZ');
  rootGroup.position.set(
    transform.totalTranslationMetres.x,
    transform.totalTranslationMetres.y,
    transform.totalTranslationMetres.z
  );
  rootGroup.updateMatrixWorld(true);

  return {
    rootGroup,
    preflight,
    transform,
    inspectableCount,
  };
}

/**
 * Group D — Controller Ray Target Resolution.
 * Resolves the closest visible reviewable object hit by a controller or pointer ray.
 * Never mutates project state on selection ('inspect-only').
 */
export function resolveVRControllerRayTarget(
  rootGroup: THREE.Object3D,
  rayOriginWorldMetres: { x: number; y: number; z: number },
  rayDirectionWorldNormalized: { x: number; y: number; z: number },
  project?: Project,
  config?: VRDesignReviewConfig,
  maxDistanceMetres: number = 60
): VRRaycastSelectionResult {
  if (
    !Number.isFinite(rayOriginWorldMetres.x) ||
    !Number.isFinite(rayOriginWorldMetres.y) ||
    !Number.isFinite(rayOriginWorldMetres.z) ||
    !Number.isFinite(rayDirectionWorldNormalized.x) ||
    !Number.isFinite(rayDirectionWorldNormalized.y) ||
    !Number.isFinite(rayDirectionWorldNormalized.z)
  ) {
    return {
      hit: false,
      distanceMetres: null,
      hitPointWorldMetres: null,
      hitPointLocalPlotUnits: null,
      targetMetadata: null,
      isWalkableSurface: false,
      actionPerformed: 'inspect-only',
    };
  }

  _tempVec3A.set(rayOriginWorldMetres.x, rayOriginWorldMetres.y, rayOriginWorldMetres.z);
  _tempVec3B
    .set(
      rayDirectionWorldNormalized.x,
      rayDirectionWorldNormalized.y,
      rayDirectionWorldNormalized.z
    )
    .normalize();

  _raycaster.set(_tempVec3A, _tempVec3B);
  _raycaster.near = 0.05;
  _raycaster.far = maxDistanceMetres;

  rootGroup.updateMatrixWorld(true);
  const intersections = _raycaster.intersectObject(rootGroup, true);

  for (const hit of intersections) {
    if (!hit.object.visible) continue;
    // Check parent visibility chain
    let p: THREE.Object3D | null = hit.object;
    let chainVisible = true;
    while (p) {
      if (!p.visible) {
        chainVisible = false;
        break;
      }
      p = p.parent;
    }
    if (!chainVisible) continue;

    const meta = hit.object.userData?.vrInspectable as VRInspectableMetadata | undefined;
    if (!meta) continue;

    // Convert world hit point back to local plot coordinates (0..plotWidth, 0..plotLength)
    let localPlotUnits: { x: number; y: number; z: number } | null = null;
    if (project) {
      const effConfig = config || createDefaultVRDesignReviewConfig(project);
      const transform = computeVRSceneTransform(project, effConfig);
      const invMat = _tempMat4.fromArray(transform.worldMatrix4x4).invert();
      const localCentered = hit.point.clone().applyMatrix4(invMat);
      localPlotUnits = {
        x: Number((localCentered.x + project.plotWidth / 2).toFixed(3)),
        y: Number(Math.max(0, localCentered.y).toFixed(3)),
        z: Number((localCentered.z + project.plotLength / 2).toFixed(3)),
      };
    }

    return {
      hit: true,
      distanceMetres: Number(hit.distance.toFixed(4)),
      hitPointWorldMetres: {
        x: Number(hit.point.x.toFixed(4)),
        y: Number(hit.point.y.toFixed(4)),
        z: Number(hit.point.z.toFixed(4)),
      },
      hitPointLocalPlotUnits: localPlotUnits,
      targetMetadata: meta,
      isWalkableSurface: Boolean(hit.object.userData?.isWalkableFloor),
      actionPerformed: 'inspect-only',
    };
  }

  return {
    hit: false,
    distanceMetres: null,
    hitPointWorldMetres: null,
    hitPointLocalPlotUnits: null,
    targetMetadata: null,
    isWalkableSurface: false,
    actionPerformed: 'inspect-only',
  };
}

/**
 * Group D — Comfort Teleport Destination Validator.
 * Validates whether a requested teleport target lies on a valid room floor or plot slab,
 * checks wall/column collisions, and never implies physical validation when floor geometry is absent.
 */
export function validateVRTeleportDestination(
  project: Project | null | undefined,
  config: VRDesignReviewConfig,
  targetWorldPointMetres: { x: number; y: number; z: number },
  currentViewerWorldMetres: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 }
): VRTeleportDestinationResult {
  if (
    !Number.isFinite(targetWorldPointMetres.x) ||
    !Number.isFinite(targetWorldPointMetres.y) ||
    !Number.isFinite(targetWorldPointMetres.z)
  ) {
    return {
      isValid: false,
      reasonCode: 'NON_FINITE_COORDINATES',
      message: 'Teleport destination coordinates must be finite numbers.',
      destinationWorldMetres: null,
      destinationLocalPlotUnits: null,
      resolvedFloorLevel: 1,
      eyePositionWorldMetres: null,
      physicallyValidatedWalkable: false,
    };
  }

  if (!project || project.plotWidth <= 0 || project.plotLength <= 0) {
    return {
      isValid: false,
      reasonCode: 'NO_WALKABLE_FLOOR_ESTABLISHED',
      message: 'No valid project or walkable floor geometry exists to validate teleportation.',
      destinationWorldMetres: null,
      destinationLocalPlotUnits: null,
      resolvedFloorLevel: 1,
      eyePositionWorldMetres: null,
      physicallyValidatedWalkable: false,
    };
  }

  const rooms = validateFloorPlanFor3D(
    project.floorPlan?.rooms || [],
    project.plotWidth,
    project.plotLength
  ).validRooms;

  if (rooms.length === 0) {
    return {
      isValid: false,
      reasonCode: 'NO_WALKABLE_FLOOR_ESTABLISHED',
      message: 'Project has no valid room slabs established for walkable teleportation.',
      destinationWorldMetres: null,
      destinationLocalPlotUnits: null,
      resolvedFloorLevel: 1,
      eyePositionWorldMetres: null,
      physicallyValidatedWalkable: false,
    };
  }

  // Check horizontal teleport distance budget
  const dx = targetWorldPointMetres.x - currentViewerWorldMetres.x;
  const dz = targetWorldPointMetres.z - currentViewerWorldMetres.z;
  const horizDist = Math.hypot(dx, dz);
  const maxDist = Math.max(2, config.navigation.teleportMaxDistanceMetres || 18);

  if (horizDist > maxDist) {
    return {
      isValid: false,
      reasonCode: 'EXCEEDS_MAX_TELEPORT_RANGE',
      message: `Teleport distance (${horizDist.toFixed(2)}m) exceeds configured comfort range (${maxDist.toFixed(1)}m).`,
      destinationWorldMetres: null,
      destinationLocalPlotUnits: null,
      resolvedFloorLevel: 1,
      eyePositionWorldMetres: null,
      physicallyValidatedWalkable: false,
    };
  }

  const transform = computeVRSceneTransform(project, config);
  const invMat = _tempMat4.fromArray(transform.worldMatrix4x4).invert();
  const localCentered = new THREE.Vector3(
    targetWorldPointMetres.x,
    targetWorldPointMetres.y,
    targetWorldPointMetres.z
  ).applyMatrix4(invMat);

  const plotX = localCentered.x + project.plotWidth / 2;
  const plotZ = localCentered.z + project.plotLength / 2;
  const plotY = Math.max(0, localCentered.y);

  // Check plot boundary
  if (plotX < 0 || plotX > project.plotWidth || plotZ < 0 || plotZ > project.plotLength) {
    return {
      isValid: false,
      reasonCode: 'OUTSIDE_PLOT_BOUNDARY',
      message: `Target (${plotX.toFixed(2)}, ${plotZ.toFixed(2)} ${project.unit}) is outside the ${project.plotWidth}×${project.plotLength} ${project.unit} plot boundary.`,
      destinationWorldMetres: null,
      destinationLocalPlotUnits: {
        x: Number(plotX.toFixed(3)),
        y: Number(plotY.toFixed(3)),
        z: Number(plotZ.toFixed(3)),
      },
      resolvedFloorLevel: 1,
      eyePositionWorldMetres: null,
      physicallyValidatedWalkable: false,
    };
  }

  // Check structural column collision
  const columns = project.structuralCoordination?.columns || [];
  for (const col of columns) {
    const halfW = (col.width || 0.4) / 2 + (project.unit === 'feet' ? 0.5 : 0.15);
    const halfD = (col.depth || col.width || 0.4) / 2 + (project.unit === 'feet' ? 0.5 : 0.15);
    if (Math.abs(plotX - col.x) <= halfW && Math.abs(plotZ - col.y) <= halfD) {
      return {
        isValid: false,
        reasonCode: 'INSIDE_COLUMN_OBSTACLE',
        message: `Teleport blocked: target lies inside structural column ${col.label || col.id}.`,
        destinationWorldMetres: null,
        destinationLocalPlotUnits: {
          x: Number(plotX.toFixed(3)),
          y: Number(plotY.toFixed(3)),
          z: Number(plotZ.toFixed(3)),
        },
        resolvedFloorLevel: 1,
        eyePositionWorldMetres: null,
        physicallyValidatedWalkable: true,
      };
    }
  }

  const isMetres = project.unit === 'metres';
  const wallThick = isMetres ? 0.15 : 0.5;
  const wallClearance = wallThick * 1.1;
  const storyHeight = (isMetres ? 3.0 : 10.0) + (isMetres ? 0.15 : 0.5);

  const requestedFloor =
    typeof config.layers.selectedFloor === 'number'
      ? config.layers.selectedFloor
      : Math.max(1, Math.round(plotY / storyHeight) + 1);

  // Check rooms on the resolved floor level
  const candidateRooms = rooms.filter((r) => r.floorLevel === requestedFloor);
  for (const r of candidateRooms) {
    const insideRoom =
      plotX >= r.x &&
      plotX <= r.x + r.width &&
      plotZ >= r.y &&
      plotZ <= r.y + r.length;

    if (insideRoom) {
      const onPerimeterWall =
        plotX - r.x < wallClearance ||
        r.x + r.width - plotX < wallClearance ||
        plotZ - r.y < wallClearance ||
        r.y + r.length - plotZ < wallClearance;

      if (onPerimeterWall && config.layers.showBaseBuildingShell) {
        return {
          isValid: false,
          reasonCode: 'INSIDE_WALL_OBSTACLE',
          message: `Teleport blocked: target intersects perimeter wall of room "${r.name}".`,
          destinationWorldMetres: null,
          destinationLocalPlotUnits: {
            x: Number(plotX.toFixed(3)),
            y: Number(((requestedFloor - 1) * storyHeight).toFixed(3)),
            z: Number(plotZ.toFixed(3)),
          },
          resolvedFloorLevel: requestedFloor,
          resolvedRoomId: r.id,
          resolvedRoomName: r.name,
          eyePositionWorldMetres: null,
          physicallyValidatedWalkable: true,
        };
      }

      const floorYPlotUnits = (requestedFloor - 1) * storyHeight;
      const worldFloorPt = new THREE.Vector3(
        plotX - project.plotWidth / 2,
        floorYPlotUnits,
        plotZ - project.plotLength / 2
      ).applyMatrix4(_tempMat4.fromArray(transform.worldMatrix4x4));

      return {
        isValid: true,
        reasonCode: 'VALID_ROOM_FLOOR',
        message: `Teleport destination validated inside "${r.name}" (Floor ${requestedFloor}).`,
        destinationWorldMetres: {
          x: Number(worldFloorPt.x.toFixed(4)),
          y: Number(worldFloorPt.y.toFixed(4)),
          z: Number(worldFloorPt.z.toFixed(4)),
        },
        destinationLocalPlotUnits: {
          x: Number(plotX.toFixed(3)),
          y: Number(floorYPlotUnits.toFixed(3)),
          z: Number(plotZ.toFixed(3)),
        },
        resolvedFloorLevel: requestedFloor,
        resolvedRoomId: r.id,
        resolvedRoomName: r.name,
        eyePositionWorldMetres: {
          x: Number(worldFloorPt.x.toFixed(4)),
          y: Number((worldFloorPt.y + transform.eyeHeightMetres).toFixed(4)),
          z: Number(worldFloorPt.z.toFixed(4)),
        },
        physicallyValidatedWalkable: true,
      };
    }
  }

  // Ground-level outdoor plot slab is valid if on Floor 1
  if (requestedFloor === 1) {
    const worldGroundPt = new THREE.Vector3(
      plotX - project.plotWidth / 2,
      0,
      plotZ - project.plotLength / 2
    ).applyMatrix4(_tempMat4.fromArray(transform.worldMatrix4x4));

    return {
      isValid: true,
      reasonCode: 'VALID_PLOT_GROUND',
      message: `Teleport destination validated on outdoor plot ground (${plotX.toFixed(1)}, ${plotZ.toFixed(1)} ${project.unit}).`,
      destinationWorldMetres: {
        x: Number(worldGroundPt.x.toFixed(4)),
        y: Number(worldGroundPt.y.toFixed(4)),
        z: Number(worldGroundPt.z.toFixed(4)),
      },
      destinationLocalPlotUnits: {
        x: Number(plotX.toFixed(3)),
        y: 0,
        z: Number(plotZ.toFixed(3)),
      },
      resolvedFloorLevel: 1,
      eyePositionWorldMetres: {
        x: Number(worldGroundPt.x.toFixed(4)),
        y: Number((worldGroundPt.y + transform.eyeHeightMetres).toFixed(4)),
        z: Number(worldGroundPt.z.toFixed(4)),
      },
      physicallyValidatedWalkable: true,
    };
  }

  return {
    isValid: false,
    reasonCode: 'NO_WALKABLE_FLOOR_ESTABLISHED',
    message: `No walkable floor slab exists at (${plotX.toFixed(1)}, ${plotZ.toFixed(1)} ${project.unit}) on Floor ${requestedFloor}.`,
    destinationWorldMetres: null,
    destinationLocalPlotUnits: {
      x: Number(plotX.toFixed(3)),
      y: Number(plotY.toFixed(3)),
      z: Number(plotZ.toFixed(3)),
    },
    resolvedFloorLevel: requestedFloor,
    eyePositionWorldMetres: null,
    physicallyValidatedWalkable: false,
  };
}

/**
 * Group D — Snap-Turn comfort rotation helper.
 */
export function computeSnapTurnYaw(
  currentYawDegrees: number,
  direction: 'left' | 'right',
  incrementDegrees: VRSnapTurnDegrees = 30
): number {
  const base = Number.isFinite(currentYawDegrees) ? currentYawDegrees : 0;
  const delta = direction === 'left' ? incrementDegrees : -incrementDegrees;
  const next = base + delta;
  return Number((((((next + 180) % 360) + 360) % 360) - 180).toFixed(2));
}

/**
 * Computes a comfortable camera/viewer pose in metres for entering a specific room,
 * floor level, or returning to whole-building overview.
 */
export function computeViewpointForPreset(
  project: Project,
  config: VRDesignReviewConfig,
  preset: 'overview' | 'room-interior' | 'floor-level' | 'default-origin',
  targetIdOrFloor?: string | number
): {
  cameraPositionMetres: { x: number; y: number; z: number };
  lookAtTargetMetres: { x: number; y: number; z: number };
  description: string;
} {
  const transform = computeVRSceneTransform(project, config);
  const unitFactor = transform.unitToMetresFactor;
  const scaleMult = transform.scaleMultiplier;
  const combined = transform.combinedScaleFactor;
  const eyeH = transform.eyeHeightMetres;

  const pwM = project.plotWidth * combined;
  const plM = project.plotLength * combined;
  const isMetres = project.unit === 'metres';
  const storyHPlot = (isMetres ? 3.0 : 10.0) + (isMetres ? 0.15 : 0.5);

  if (preset === 'room-interior') {
    const rooms = project.floorPlan?.rooms || [];
    const targetRoom =
      rooms.find((r) => r.id === targetIdOrFloor) || rooms[0];
    if (targetRoom) {
      const localCenterX = targetRoom.x + targetRoom.width / 2 - project.plotWidth / 2;
      const localCenterZ = targetRoom.y + targetRoom.length / 2 - project.plotLength / 2;
      const floorBasePlotY = ((targetRoom.floorLevel || 1) - 1) * storyHPlot;

      const worldPt = new THREE.Vector3(
        localCenterX,
        floorBasePlotY,
        localCenterZ
      ).applyMatrix4(_tempMat4.fromArray(transform.worldMatrix4x4));

      return {
        cameraPositionMetres: {
          x: Number(worldPt.x.toFixed(4)),
          y: Number((worldPt.y + eyeH * scaleMult).toFixed(4)),
          z: Number((worldPt.z + Math.min(1.5, targetRoom.length * combined * 0.25)).toFixed(4)),
        },
        lookAtTargetMetres: {
          x: Number(worldPt.x.toFixed(4)),
          y: Number((worldPt.y + eyeH * scaleMult * 0.9).toFixed(4)),
          z: Number(worldPt.z.toFixed(4)),
        },
        description: `Interior walkthrough viewpoint in "${targetRoom.name}" (Floor ${targetRoom.floorLevel}) at ${config.scalePreset}.`,
      };
    }
  }

  if (preset === 'floor-level') {
    const floorNum = typeof targetIdOrFloor === 'number' ? targetIdOrFloor : 1;
    const floorBaseMetres = (floorNum - 1) * storyHPlot * combined;
    return {
      cameraPositionMetres: {
        x: Number((transform.totalTranslationMetres.x + pwM * 0.65).toFixed(4)),
        y: Number((transform.totalTranslationMetres.y + floorBaseMetres + Math.max(eyeH, plM * 0.55)).toFixed(4)),
        z: Number((transform.totalTranslationMetres.z + plM * 0.85).toFixed(4)),
      },
      lookAtTargetMetres: {
        x: transform.totalTranslationMetres.x,
        y: Number((transform.totalTranslationMetres.y + floorBaseMetres + 1.0 * scaleMult).toFixed(4)),
        z: transform.totalTranslationMetres.z,
      },
      description: `Floor ${floorNum} architectural inspection viewpoint at ${config.scalePreset}.`,
    };
  }

  if (preset === 'default-origin') {
    return {
      cameraPositionMetres: {
        x: transform.totalTranslationMetres.x,
        y: Number((transform.totalTranslationMetres.y + eyeH).toFixed(4)),
        z: Number((transform.totalTranslationMetres.z + Math.max(2.5, plM * 0.6)).toFixed(4)),
      },
      lookAtTargetMetres: {
        x: transform.totalTranslationMetres.x,
        y: Number((transform.totalTranslationMetres.y + eyeH * 0.85).toFixed(4)),
        z: transform.totalTranslationMetres.z,
      },
      description: `Recentered at virtual scene origin (${config.originMode}, eye height ${eyeH.toFixed(2)}m).`,
    };
  }

  // Whole-building overview
  const span = Math.max(6, Math.hypot(pwM, plM));
  return {
    cameraPositionMetres: {
      x: Number((transform.totalTranslationMetres.x + span * 0.75).toFixed(4)),
      y: Number((transform.totalTranslationMetres.y + span * 0.6).toFixed(4)),
      z: Number((transform.totalTranslationMetres.z + span * 0.85).toFixed(4)),
    },
    lookAtTargetMetres: {
      x: transform.totalTranslationMetres.x,
      y: Number((transform.totalTranslationMetres.y + 1.5 * scaleMult).toFixed(4)),
      z: transform.totalTranslationMetres.z,
    },
    description: `Whole-building overview viewpoint (${config.scalePreset}).`,
  };
}

/**
 * Group E — Create, Validate, Update, Delete & Resolve Model-Anchored Review Annotations.
 */
export interface CreateVRAnnotationInput {
  title: string;
  note: string;
  category: VRAnnotationCategory;
  priority: VRAnnotationPriority;
  status?: VRAnnotationStatus;
  targetElementId?: string;
  targetElementType?: VRInspectableElementType;
  targetRoomId?: string;
  targetFloorLevel?: number;
  anchorPositionLocalPlotUnits?: { x: number; y: number; z: number };
}

function sanitizeAnnotationText(raw: string, maxLength: number): string {
  return String(raw || '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, maxLength);
}

export function createVRReviewAnnotation(
  project: Project,
  config: VRDesignReviewConfig,
  input: CreateVRAnnotationInput,
  reviewSessionId: string = 'vr-session-local'
): { annotation: VRReviewAnnotation | null; error?: string } {
  const cleanTitle = sanitizeAnnotationText(input.title, 160);
  const cleanNote = sanitizeAnnotationText(input.note, MAX_ANNOTATION_TEXT_LENGTH);

  if (!cleanTitle) {
    return { annotation: null, error: 'Annotation title is required.' };
  }
  if (!cleanNote) {
    return { annotation: null, error: 'Annotation review note is required.' };
  }

  const unitFactor = getUnitToMetresFactor(project.unit === 'feet' ? 'feet' : 'metres');
  const rooms = project.floorPlan?.rooms || [];
  const matchedRoom =
    rooms.find((r) => r.id === input.targetRoomId || r.id === input.targetElementId) || null;

  const isMetres = project.unit === 'metres';
  const storyHPlot = (isMetres ? 3.0 : 10.0) + (isMetres ? 0.15 : 0.5);
  const resolvedFloor =
    input.targetFloorLevel || matchedRoom?.floorLevel || 1;

  let localPos = input.anchorPositionLocalPlotUnits;
  if (!localPos) {
    if (matchedRoom) {
      localPos = {
        x: Number((matchedRoom.x + matchedRoom.width / 2).toFixed(3)),
        y: Number(((matchedRoom.floorLevel - 1) * storyHPlot).toFixed(3)),
        z: Number((matchedRoom.y + matchedRoom.length / 2).toFixed(3)),
      };
    } else {
      localPos = {
        x: Number((project.plotWidth / 2).toFixed(3)),
        y: Number(((resolvedFloor - 1) * storyHPlot).toFixed(3)),
        z: Number((project.plotLength / 2).toFixed(3)),
      };
    }
  }

  if (
    !Number.isFinite(localPos.x) ||
    !Number.isFinite(localPos.y) ||
    !Number.isFinite(localPos.z)
  ) {
    return {
      annotation: null,
      error: 'Annotation anchor coordinates must be finite numbers in model space.',
    };
  }

  const now = new Date().toISOString();
  const fp = computeVRModelGeometryFingerprint(project);

  const annotation: VRReviewAnnotation = {
    annotationId: `vr-note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    projectId: project.id,
    reviewSessionId,
    title: cleanTitle,
    note: cleanNote,
    category: input.category || 'visual-review-note',
    priority: input.priority || 'medium',
    status: input.status || 'open',
    targetElementId: input.targetElementId || matchedRoom?.id,
    targetElementType: input.targetElementType || (matchedRoom ? 'room' : 'plot-ground'),
    targetRoomId: matchedRoom?.id || input.targetRoomId,
    targetRoomName: matchedRoom?.name,
    targetFloorLevel: resolvedFloor,
    anchorPositionLocalPlotUnits: {
      x: Number(localPos.x.toFixed(3)),
      y: Number(localPos.y.toFixed(3)),
      z: Number(localPos.z.toFixed(3)),
    },
    anchorPositionMetresAt1To1: {
      x: Number((localPos.x * unitFactor).toFixed(4)),
      y: Number((localPos.y * unitFactor).toFixed(4)),
      z: Number((localPos.z * unitFactor).toFixed(4)),
    },
    sourceGeometryFingerprint: fp,
    anchorResolutionStatus: 'resolved',
    anchorResolutionMessage: matchedRoom
      ? `Anchored to room "${matchedRoom.name}" (${matchedRoom.id}) in normalized model space.`
      : `Anchored to local plot coordinates (${localPos.x.toFixed(2)}, ${localPos.z.toFixed(2)} ${project.unit}).`,
    createdAt: now,
    updatedAt: now,
    provenanceDisclaimer: NON_ENGINEERING_RISK_DISCLAIMER,
    isVerifiedEngineeringRisk: false,
  };

  // Validate against current project elements immediately
  const [resolved] = resolveAnnotationAnchorsAgainstProject(project, [annotation]);
  return { annotation: resolved };
}

/**
 * Revalidates saved annotations against the current project model.
 * If a referenced room/column/element was removed, marks it 'unresolved-target-removed'
 * instead of silently attaching it to an unrelated object.
 */
export function resolveAnnotationAnchorsAgainstProject(
  project: Project,
  annotations: VRReviewAnnotation[]
): VRReviewAnnotation[] {
  const currentFp = computeVRModelGeometryFingerprint(project);
  const roomsById = new Map<string, FloorPlanRoom>();
  for (const r of project.floorPlan?.rooms || []) {
    roomsById.set(r.id, r);
  }
  const colsById = new Set<string>(
    (project.structuralCoordination?.columns || []).map((c) => c.id)
  );
  const zonesById = new Set<string>(
    (project.siteLogistics?.activePlan?.logisticsZones || []).map((z) => z.id)
  );
  const equipById = new Set<string>(
    (project.siteLogistics?.activePlan?.equipmentPlacements || []).map((e) => e.id)
  );

  return annotations.map((note) => {
    const targetId = note.targetRoomId || note.targetElementId;

    // 1. Check if specific target room was removed
    if (note.targetRoomId) {
      const room = roomsById.get(note.targetRoomId);
      if (!room) {
        return {
          ...note,
          anchorResolutionStatus: 'unresolved-target-removed',
          anchorResolutionMessage: `Target room (${note.targetRoomName || note.targetRoomId}) is no longer present in the floor plan. Review note preserved at last known model coordinates without reassigning to an unrelated room.`,
          status: note.status === 'resolved' ? 'resolved' : 'needs-reverification',
        };
      }
      // Check if room moved so far that anchor is outside its current bounds
      const ax = note.anchorPositionLocalPlotUnits.x;
      const az = note.anchorPositionLocalPlotUnits.z;
      const insideCurrentBounds =
        ax >= room.x - 0.5 &&
        ax <= room.x + room.width + 0.5 &&
        az >= room.y - 0.5 &&
        az <= room.y + room.length + 0.5;
      if (!insideCurrentBounds) {
        return {
          ...note,
          targetRoomName: room.name,
          anchorResolutionStatus: 'stale-geometry-changed',
          anchorResolutionMessage: `Target room "${room.name}" moved or resized since this note was created.`,
        };
      }
    }

    // 2. Check if structural column target was removed
    if (note.targetElementType === 'structural-column' && targetId && !colsById.has(targetId)) {
      return {
        ...note,
        anchorResolutionStatus: 'unresolved-target-removed',
        anchorResolutionMessage: `Target structural column (${targetId}) was removed from the structural grid. Note flagged for re-verification.`,
        status: note.status === 'resolved' ? 'resolved' : 'needs-reverification',
      };
    }

    // 3. Check if logistics zone/crane target was removed
    if (note.targetElementType === 'logistics-zone' && targetId && !zonesById.has(targetId)) {
      return {
        ...note,
        anchorResolutionStatus: 'unresolved-target-removed',
        anchorResolutionMessage: `Target P47 logistics zone (${targetId}) was removed.`,
        status: note.status === 'resolved' ? 'resolved' : 'needs-reverification',
      };
    }
    if (note.targetElementType === 'logistics-crane' && targetId && !equipById.has(targetId)) {
      return {
        ...note,
        anchorResolutionStatus: 'unresolved-target-removed',
        anchorResolutionMessage: `Target P47 equipment placement (${targetId}) was removed.`,
        status: note.status === 'resolved' ? 'resolved' : 'needs-reverification',
      };
    }

    // 4. Check overall geometry fingerprint change
    if (note.sourceGeometryFingerprint && note.sourceGeometryFingerprint !== currentFp) {
      return {
        ...note,
        anchorResolutionStatus: 'stale-geometry-changed',
        anchorResolutionMessage:
          'Upstream model geometry or layer fingerprint changed since this annotation was recorded; verify anchor alignment.',
      };
    }

    return {
      ...note,
      anchorResolutionStatus: 'resolved',
      anchorResolutionMessage: note.targetRoomName
        ? `Resolved against room "${note.targetRoomName}" (${note.targetRoomId}).`
        : `Resolved in local model coordinates (${note.anchorPositionLocalPlotUnits.x.toFixed(1)}, ${note.anchorPositionLocalPlotUnits.z.toFixed(1)} ${project.unit}).`,
    };
  });
}

export function updateVRReviewAnnotation(
  existing: VRReviewAnnotation,
  updates: Partial<Pick<VRReviewAnnotation, 'title' | 'note' | 'category' | 'priority' | 'status'>>,
  project: Project
): { annotation: VRReviewAnnotation | null; error?: string } {
  const nextTitle =
    updates.title !== undefined ? sanitizeAnnotationText(updates.title, 160) : existing.title;
  const nextNote =
    updates.note !== undefined
      ? sanitizeAnnotationText(updates.note, MAX_ANNOTATION_TEXT_LENGTH)
      : existing.note;

  if (!nextTitle) {
    return { annotation: null, error: 'Annotation title cannot be empty.' };
  }
  if (!nextNote) {
    return { annotation: null, error: 'Annotation review note cannot be empty.' };
  }

  const updated: VRReviewAnnotation = {
    ...existing,
    title: nextTitle,
    note: nextNote,
    category: updates.category ?? existing.category,
    priority: updates.priority ?? existing.priority,
    status: updates.status ?? existing.status,
    updatedAt: new Date().toISOString(),
    provenanceDisclaimer: NON_ENGINEERING_RISK_DISCLAIMER,
    isVerifiedEngineeringRisk: false,
  };

  const [resolved] = resolveAnnotationAnchorsAgainstProject(project, [updated]);
  return { annotation: resolved };
}

export function deleteVRReviewAnnotation(
  annotations: VRReviewAnnotation[],
  annotationId: string
): VRReviewAnnotation[] {
  return annotations.filter((a) => a.annotationId !== annotationId);
}

/**
 * Creates a saved viewpoint bookmark.
 */
export function createVRReviewBookmark(
  project: Project,
  config: VRDesignReviewConfig,
  input: {
    label: string;
    presetType: 'overview' | 'room-interior' | 'floor-level' | 'custom-viewpoint';
    targetRoomId?: string;
    targetFloorLevel?: number | 'all';
    customCameraPositionMetres?: { x: number; y: number; z: number };
    customLookAtTargetMetres?: { x: number; y: number; z: number };
  }
): VRReviewBookmark {
  const cleanLabel = sanitizeAnnotationText(input.label, 120) || 'Saved VR Viewpoint';
  const computed = computeViewpointForPreset(
    project,
    config,
    input.presetType === 'custom-viewpoint' ? 'overview' : input.presetType,
    input.targetRoomId || (typeof input.targetFloorLevel === 'number' ? input.targetFloorLevel : undefined)
  );

  return {
    bookmarkId: `vr-bm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    projectId: project.id,
    label: cleanLabel,
    presetType: input.presetType,
    targetRoomId: input.targetRoomId,
    targetFloorLevel: input.targetFloorLevel ?? config.layers.selectedFloor,
    cameraPositionMetres: input.customCameraPositionMetres || computed.cameraPositionMetres,
    lookAtTargetMetres: input.customLookAtTargetMetres || computed.lookAtTargetMetres,
    scalePreset: config.scalePreset,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Group B & H — Safe WebXR Session Lifecycle, Input Source Adaptation,
 * Renderer Restoration, and Privacy Controller.
 */
export interface StartVRSessionOptions {
  userGestureConfirmed: boolean;
  project: Project;
  config: VRDesignReviewConfig;
  capabilityReport: VRCapabilityReport;
  renderer?: {
    getPixelRatio?: () => number;
    setPixelRatio?: (r: number) => void;
    shadowMap?: { enabled: boolean };
    toneMappingExposure?: number;
    xr?: {
      enabled: boolean;
      setSession?: (session: any) => Promise<void> | void;
    };
    setAnimationLoop?: (cb: ((time: number, frame?: any) => void) | null) => void;
  } | null;
  navigatorXROverride?: {
    requestSession: (mode: string, init?: any) => Promise<any>;
  } | null;
}

export class VRSessionController {
  private state: VRSessionStateSnapshot;
  private activeXRSession: any = null;
  private activeRenderer: StartVRSessionOptions['renderer'] = null;
  private boundCleanupCallbacks: Array<() => void> = [];
  private stateListeners: Set<(snapshot: VRSessionStateSnapshot) => void> = new Set();

  constructor(initialProject?: Project, initialConfig?: VRDesignReviewConfig) {
    const defaultPos =
      initialProject && initialConfig
        ? computeViewpointForPreset(initialProject, initialConfig, 'default-origin')
            .cameraPositionMetres
        : { x: 0, y: 1.65, z: 4 };

    this.state = {
      sessionId: `vr-session-${Date.now()}`,
      phase: 'idle',
      activeMode: initialConfig?.preferredMode || 'standard_3d_design_review',
      activeReferenceSpace: null,
      connectedInputSources: [],
      activeAnimationLoopCount: 0,
      registeredListenerCount: 0,
      enterCycleCount: 0,
      exitCycleCount: 0,
      viewerPositionWorldMetres: defaultPos,
      viewerYawDegrees: initialConfig?.yawDegrees || 0,
      lastSelectedTarget: null,
      lastTeleportResult: null,
      rendererRestoreState: {
        pixelRatio: 1,
        shadowMapEnabled: true,
        toneMappingExposure: 1.1,
        xrEnabledPrior: false,
        restoredCount: 0,
      },
      privacyGuard: this.createStrictPrivacyGuard(false),
      lastErrorMessage: null,
      statusMessage: 'VR Design Review session controller initialized in non-immersive mode.',
    };
  }

  private createStrictPrivacyGuard(userGestureConfirmed: boolean): VRPrivacyAndSecurityGuard {
    return {
      userGestureConfirmedForSessionStart: userGestureConfirmed,
      cameraCaptureEnabled: false,
      microphoneRecordingEnabled: false,
      eyeTrackingCollected: false,
      biometricOrBehavioralAnalyticsCollected: false,
      headPoseTelemetryUploaded: false,
      externalDataTransmitted: false,
      automaticNoteSharingEnabled: false,
      liveMultiUserP50Enabled: false,
    };
  }

  public getState(): VRSessionStateSnapshot {
    return structuredClone(this.state);
  }

  public subscribe(listener: (snapshot: VRSessionStateSnapshot) => void): () => void {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  private emit(): void {
    const snap = this.getState();
    for (const listener of this.stateListeners) {
      listener(snap);
    }
  }

  public switchWorkspaceMode(mode: VRWorkspaceMode): VRSessionStateSnapshot {
    if (mode === 'immersive_vr_webxr' && this.state.phase !== 'immersive-vr-active') {
      // Do not falsely claim VR is active without a confirmed session start
      this.state.activeMode = 'standard_3d_design_review';
      this.state.phase = 'fallback-3d-active';
      this.state.statusMessage =
        'Immersive VR requires clicking "Start Immersive VR". Standard 3D Design Review is active.';
      this.emit();
      return this.getState();
    }

    this.state.activeMode = mode;
    this.state.phase =
      mode === 'review_setup_calibration' ? 'setup-calibration-active' : 'fallback-3d-active';
    this.state.statusMessage =
      mode === 'review_setup_calibration'
        ? 'Mode C — Review Setup & Calibration active (non-immersive).'
        : 'Mode B — Standard 3D Design Review active (non-immersive).';
    this.emit();
    return this.getState();
  }

  /**
   * Starts an immersive-vr session ONLY in response to an intentional user gesture,
   * after preflight and capability verification succeed.
   */
  public async startImmersiveVRSession(
    options: StartVRSessionOptions
  ): Promise<VRSessionStateSnapshot> {
    // 1. User-gesture guard
    if (!options.userGestureConfirmed) {
      this.state.phase = 'session-error';
      this.state.activeMode = 'standard_3d_design_review';
      this.state.privacyGuard = this.createStrictPrivacyGuard(false);
      this.state.lastErrorMessage =
        'USER_GESTURE_REQUIRED: Immersive VR session startup was blocked because it was not triggered by an explicit user action.';
      this.state.statusMessage = this.state.lastErrorMessage;
      this.emit();
      return this.getState();
    }

    // 2. Prevent duplicate session startup if already active
    if (this.activeXRSession && this.state.phase === 'immersive-vr-active') {
      this.state.statusMessage = 'Immersive VR session is already active; duplicate startup prevented.';
      this.emit();
      return this.getState();
    }

    // 3. Model preflight gate
    const preflight = prepareVRModelPreflight(options.project, options.config);
    if (!preflight.isReady) {
      this.state.phase = 'session-error';
      this.state.activeMode = 'standard_3d_design_review';
      this.state.lastErrorMessage = `MODEL_PREFLIGHT_FAILED: ${preflight.blockingErrors.join(' ')}`;
      this.state.statusMessage = this.state.lastErrorMessage;
      this.emit();
      return this.getState();
    }

    // 4. Capability gate
    if (!options.capabilityReport.immersiveVRSupported) {
      this.state.phase = 'fallback-3d-active';
      this.state.activeMode = 'standard_3d_design_review';
      this.state.lastErrorMessage = `VR_CAPABILITY_UNAVAILABLE (${options.capabilityReport.blockerCode}): ${options.capabilityReport.statusSummary}`;
      this.state.statusMessage = this.state.lastErrorMessage;
      this.emit();
      return this.getState();
    }

    const xrApi =
      options.navigatorXROverride !== undefined
        ? options.navigatorXROverride
        : typeof navigator !== 'undefined' && 'xr' in navigator
        ? (navigator as any).xr
        : null;

    if (!xrApi || typeof xrApi.requestSession !== 'function') {
      this.state.phase = 'fallback-3d-active';
      this.state.activeMode = 'standard_3d_design_review';
      this.state.lastErrorMessage = 'WEBXR_REQUEST_SESSION_UNAVAILABLE: navigator.xr.requestSession is missing.';
      this.state.statusMessage = this.state.lastErrorMessage;
      this.emit();
      return this.getState();
    }

    this.state.phase = 'requesting-session';
    this.state.privacyGuard = this.createStrictPrivacyGuard(true);
    this.state.lastErrorMessage = null;
    this.state.statusMessage = 'Requesting WebXR "immersive-vr" session...';
    this.emit();

    try {
      // Request only local-floor / bounded-floor / local reference spaces — never request camera, mic, or eye-tracking
      const session = await xrApi.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor'],
      });

      if (!session) {
        throw new Error('XR runtime returned an empty session.');
      }

      // Clean up any stale listeners before attaching new ones
      this.removeSessionListeners();

      this.activeXRSession = session;
      this.activeRenderer = options.renderer || null;

      // Save renderer settings so we can restore them on exit
      if (this.activeRenderer) {
        this.state.rendererRestoreState = {
          pixelRatio:
            typeof this.activeRenderer.getPixelRatio === 'function'
              ? this.activeRenderer.getPixelRatio()
              : 1,
          shadowMapEnabled: Boolean(this.activeRenderer.shadowMap?.enabled),
          toneMappingExposure: this.activeRenderer.toneMappingExposure ?? 1.1,
          xrEnabledPrior: Boolean(this.activeRenderer.xr?.enabled),
          restoredCount: this.state.rendererRestoreState.restoredCount,
        };

        // Optimize renderer for immersive VR frame pacing (disable expensive real-time shadow maps in VR)
        if (this.activeRenderer.shadowMap) {
          this.activeRenderer.shadowMap.enabled = false;
        }
        if (this.activeRenderer.xr) {
          this.activeRenderer.xr.enabled = true;
          if (typeof this.activeRenderer.xr.setSession === 'function') {
            await this.activeRenderer.xr.setSession(session);
          }
        }
      }

      // Negotiate reference space: prefer 'local-floor', fall back to 'local' or 'viewer'
      let resolvedRefSpace: VRReferenceSpaceType = 'local-floor';
      if (typeof session.requestReferenceSpace === 'function') {
        const candidates: VRReferenceSpaceType[] = ['local-floor', 'bounded-floor', 'local', 'viewer'];
        let found = false;
        for (const refType of candidates) {
          try {
            await session.requestReferenceSpace(refType);
            resolvedRefSpace = refType;
            found = true;
            break;
          } catch {
            // Try next fallback reference space
          }
        }
        if (!found) {
          resolvedRefSpace = 'local';
        }
      }

      // Inspect initial input sources
      this.syncInputSourcesFromSession(session);

      // Attach session lifecycle & input listeners with deterministic cleanup
      this.attachSessionListener(session, 'end', () => {
        this.handleSessionEndedInternal('XRSession "end" event received; restored standard 3D review.');
      });

      this.attachSessionListener(session, 'visibilitychange', (evt: any) => {
        const visState = evt?.session?.visibilityState || session.visibilityState || 'visible';
        if (visState === 'hidden' || visState === 'visible-blurred') {
          this.state.phase = 'immersive-vr-hidden-blurred';
          this.state.statusMessage = `Immersive VR session paused (${visState}); headset system boundary or menu is active.`;
        } else {
          this.state.phase = 'immersive-vr-active';
          this.state.statusMessage = 'Immersive VR session resumed and active.';
        }
        this.emit();
      });

      this.attachSessionListener(session, 'inputsourceschange', () => {
        this.syncInputSourcesFromSession(session);
        this.emit();
      });

      this.attachSessionListener(session, 'select', () => {
        // Handled per-frame or via explicit controller ray action
      });

      // Start a single XR animation loop
      this.state.activeAnimationLoopCount = 1;
      if (this.activeRenderer && typeof this.activeRenderer.setAnimationLoop === 'function') {
        this.activeRenderer.setAnimationLoop(() => {
          // Minimal XR frame loop — no synchronous model rebuilds or allocations
        });
      }

      this.state.enterCycleCount += 1;
      this.state.phase = 'immersive-vr-active';
      this.state.activeMode = 'immersive_vr_webxr';
      this.state.activeReferenceSpace = resolvedRefSpace;
      this.state.statusMessage = `Mode A — Immersive VR active (Reference Space: ${resolvedRefSpace}, Controllers detected: ${this.state.connectedInputSources.length}).`;
      this.emit();
      return this.getState();
    } catch (err: any) {
      this.removeSessionListeners();
      this.restoreRendererState();
      this.activeXRSession = null;
      this.state.activeAnimationLoopCount = 0;
      this.state.phase = 'session-error';
      this.state.activeMode = 'standard_3d_design_review';
      this.state.activeReferenceSpace = null;
      this.state.lastErrorMessage = `SESSION_START_REJECTED: ${err?.message || 'Headset runtime rejected immersive-vr session start.'}`;
      this.state.statusMessage = `${this.state.lastErrorMessage} Standard 3D Design Review remains active.`;
      this.emit();
      return this.getState();
    }
  }

  private attachSessionListener(target: any, eventName: string, handler: (...args: any[]) => void): void {
    if (!target || typeof target.addEventListener !== 'function') return;
    target.addEventListener(eventName, handler);
    this.state.registeredListenerCount += 1;
    this.boundCleanupCallbacks.push(() => {
      if (typeof target.removeEventListener === 'function') {
        target.removeEventListener(eventName, handler);
      }
    });
  }

  private removeSessionListeners(): void {
    for (const cleanup of this.boundCleanupCallbacks) {
      try {
        cleanup();
      } catch {
        // Ignore cleanup errors
      }
    }
    this.boundCleanupCallbacks = [];
    this.state.registeredListenerCount = 0;
  }

  private syncInputSourcesFromSession(session: any): void {
    const rawSources = Array.isArray(session?.inputSources)
      ? session.inputSources
      : [];

    this.state.connectedInputSources = rawSources.map((src: any, idx: number) => ({
      id: src.id || `xr-input-${idx + 1}`,
      handedness:
        src.handedness === 'left' || src.handedness === 'right' ? src.handedness : 'none',
      targetRayMode:
        src.targetRayMode === 'tracked-pointer' ||
        src.targetRayMode === 'gaze' ||
        src.targetRayMode === 'screen' ||
        src.targetRayMode === 'transient-pointer'
          ? src.targetRayMode
          : 'tracked-pointer',
      profiles: Array.isArray(src.profiles) ? src.profiles.map(String) : [],
      hasGripSpace: Boolean(src.gripSpace),
      hasGamepadAxes: Boolean(src.gamepad && Array.isArray(src.gamepad.axes) && src.gamepad.axes.length > 0),
      buttonCount: src.gamepad && Array.isArray(src.gamepad.buttons) ? src.gamepad.buttons.length : 0,
    }));
  }

  private restoreRendererState(): void {
    if (!this.activeRenderer) return;
    try {
      if (typeof this.activeRenderer.setAnimationLoop === 'function') {
        this.activeRenderer.setAnimationLoop(null);
      }
      if (typeof this.activeRenderer.setPixelRatio === 'function') {
        this.activeRenderer.setPixelRatio(this.state.rendererRestoreState.pixelRatio);
      }
      if (this.activeRenderer.shadowMap) {
        this.activeRenderer.shadowMap.enabled = this.state.rendererRestoreState.shadowMapEnabled;
      }
      if (typeof this.activeRenderer.toneMappingExposure === 'number') {
        this.activeRenderer.toneMappingExposure =
          this.state.rendererRestoreState.toneMappingExposure;
      }
      if (this.activeRenderer.xr) {
        this.activeRenderer.xr.enabled = this.state.rendererRestoreState.xrEnabledPrior;
      }
      this.state.rendererRestoreState.restoredCount += 1;
    } catch {
      // Ignore errors if renderer was already disposed
    }
  }

  private handleSessionEndedInternal(reasonMessage: string): void {
    this.removeSessionListeners();
    this.restoreRendererState();
    this.activeXRSession = null;
    this.state.activeAnimationLoopCount = 0;
    this.state.activeReferenceSpace = null;
    this.state.connectedInputSources = [];
    this.state.exitCycleCount += 1;
    this.state.phase = 'session-ended';
    this.state.activeMode = 'standard_3d_design_review';
    this.state.statusMessage = reasonMessage;
    this.emit();
  }

  /**
   * Simulates an unexpected runtime/headset disconnection or interruption and safely recovers
   * to Mode B (Standard 3D Design Review) without leaving a stuck 'VR active' state.
   */
  public handleUnexpectedSessionInterruption(reason: string): VRSessionStateSnapshot {
    this.removeSessionListeners();
    this.restoreRendererState();
    const sessionToClose = this.activeXRSession;
    this.activeXRSession = null;
    if (sessionToClose && typeof sessionToClose.end === 'function') {
      try {
        sessionToClose.end();
      } catch {
        // Ignore if already ended
      }
    }
    this.state.activeAnimationLoopCount = 0;
    this.state.activeReferenceSpace = null;
    this.state.connectedInputSources = [];
    this.state.exitCycleCount += 1;
    this.state.phase = 'session-interrupted';
    this.state.activeMode = 'standard_3d_design_review';
    this.state.lastErrorMessage = `SESSION_INTERRUPTED: ${reason}`;
    this.state.statusMessage = `Immersive VR session interrupted (${reason}). Restored Standard 3D Design Review.`;
    this.emit();
    return this.getState();
  }

  /**
   * User-initiated exit from Immersive VR back to Standard 3D Design Review.
   */
  public async exitImmersiveVRSession(
    reason: string = 'User exited Immersive VR; restored Standard 3D Design Review.'
  ): Promise<VRSessionStateSnapshot> {
    const session = this.activeXRSession;
    this.removeSessionListeners();
    this.restoreRendererState();
    this.activeXRSession = null;

    if (session && typeof session.end === 'function') {
      try {
        await session.end();
      } catch {
        // Session may have already ended
      }
    }

    this.state.activeAnimationLoopCount = 0;
    this.state.activeReferenceSpace = null;
    this.state.connectedInputSources = [];
    this.state.exitCycleCount += 1;
    this.state.phase = 'session-ended';
    this.state.activeMode = 'standard_3d_design_review';
    this.state.statusMessage = reason;
    this.emit();
    return this.getState();
  }

  /**
   * Updates viewer position via validated teleportation.
   */
  public applyTeleport(
    project: Project,
    config: VRDesignReviewConfig,
    targetWorldMetres: { x: number; y: number; z: number }
  ): VRTeleportDestinationResult {
    const res = validateVRTeleportDestination(
      project,
      config,
      targetWorldMetres,
      this.state.viewerPositionWorldMetres
    );
    this.state.lastTeleportResult = res;
    if (res.isValid && res.eyePositionWorldMetres) {
      this.state.viewerPositionWorldMetres = { ...res.eyePositionWorldMetres };
      this.state.statusMessage = res.message;
    } else {
      this.state.statusMessage = `Teleport rejected: ${res.message}`;
    }
    this.emit();
    return res;
  }

  /**
   * Applies snap-turn rotation.
   */
  public applySnapTurn(
    direction: 'left' | 'right',
    incrementDegrees: VRSnapTurnDegrees = 30
  ): number {
    this.state.viewerYawDegrees = computeSnapTurnYaw(
      this.state.viewerYawDegrees,
      direction,
      incrementDegrees
    );
    this.state.statusMessage = `Snap-turned ${direction} by ${incrementDegrees}° (Yaw: ${this.state.viewerYawDegrees}°).`;
    this.emit();
    return this.state.viewerYawDegrees;
  }

  /**
   * Records a raycast selection without mutating project state.
   */
  public recordRaycastSelection(result: VRRaycastSelectionResult | null): void {
    this.state.lastSelectedTarget = result;
    if (result?.hit && result.targetMetadata) {
      this.state.statusMessage = `Selected ${result.targetMetadata.label} [${result.targetMetadata.sourceModule}] (read-only inspection).`;
    } else {
      this.state.statusMessage = 'Selection cleared.';
    }
    this.emit();
  }

  /**
   * Recenters viewer to default origin.
   */
  public recenterViewerOrigin(project: Project, config: VRDesignReviewConfig): void {
    const vp = computeViewpointForPreset(project, config, 'default-origin');
    this.state.viewerPositionWorldMetres = { ...vp.cameraPositionMetres };
    this.state.viewerYawDegrees = config.yawDegrees || 0;
    this.state.statusMessage = vp.description;
    this.emit();
  }

  /**
   * Disposes session resources on component unmount without destroying shared project data.
   */
  public dispose(): void {
    if (this.activeXRSession && typeof this.activeXRSession.end === 'function') {
      try {
        this.activeXRSession.end();
      } catch {
        // Ignore
      }
    }
    this.removeSessionListeners();
    this.restoreRendererState();
    this.activeXRSession = null;
    this.activeRenderer = null;
    this.state.activeAnimationLoopCount = 0;
    this.state.phase = 'session-ended';
    this.state.activeMode = 'standard_3d_design_review';
    this.stateListeners.clear();
  }
}

/**
 * Group G — Safe Extraction & Validation of Persisted Project P49 State.
 * Handles legacy projects with no `vrDesignReview` property and sanitizes corrupt/oversized data.
 */
export function getSafeVRDesignReviewState(project: Project | null | undefined): {
  config: VRDesignReviewConfig;
  annotations: VRReviewAnnotation[];
  bookmarks: VRReviewBookmark[];
  sanitizedWarnings: string[];
} {
  const sanitizedWarnings: string[] = [];
  if (!project) {
    return {
      config: createDefaultVRDesignReviewConfig(null),
      annotations: [],
      bookmarks: [],
      sanitizedWarnings: [],
    };
  }

  const rawMeta = project.vrDesignReview as any;
  if (!rawMeta || typeof rawMeta !== 'object') {
    return {
      config: createDefaultVRDesignReviewConfig(project),
      annotations: [],
      bookmarks: [],
      sanitizedWarnings: [],
    };
  }

  const defaultConfig = createDefaultVRDesignReviewConfig(project);
  const rawConfig = rawMeta.savedConfig;
  const config: VRDesignReviewConfig =
    rawConfig && typeof rawConfig === 'object' && rawConfig.profileId === VR_DESIGN_REVIEW_PROFILE_ID
      ? {
          ...defaultConfig,
          ...rawConfig,
          navigation: {
            ...defaultConfig.navigation,
            ...(rawConfig.navigation || {}),
          },
          layers: {
            ...defaultConfig.layers,
            ...(rawConfig.layers || {}),
          },
        }
      : defaultConfig;

  // Validate scalePreset
  if (!VR_SCALE_PRESET_MULTIPLIERS[config.scalePreset]) {
    config.scalePreset = '1:1';
    sanitizedWarnings.push('Invalid saved scalePreset was reset to 1:1.');
  }

  // Validate annotations array
  const validAnnotations: VRReviewAnnotation[] = [];
  if (Array.isArray(rawMeta.annotations)) {
    let truncatedCount = 0;
    for (const item of rawMeta.annotations.slice(0, MAX_ANNOTATIONS_PER_PROJECT * 2)) {
      if (
        !item ||
        typeof item !== 'object' ||
        typeof item.annotationId !== 'string' ||
        typeof item.title !== 'string' ||
        !item.anchorPositionLocalPlotUnits ||
        !Number.isFinite(item.anchorPositionLocalPlotUnits.x) ||
        !Number.isFinite(item.anchorPositionLocalPlotUnits.y) ||
        !Number.isFinite(item.anchorPositionLocalPlotUnits.z)
      ) {
        sanitizedWarnings.push('Skipped 1 malformed/corrupt annotation record.');
        continue;
      }
      if (validAnnotations.length >= MAX_ANNOTATIONS_PER_PROJECT) {
        truncatedCount++;
        continue;
      }
      validAnnotations.push({
        ...item,
        title: sanitizeAnnotationText(item.title, 160) || 'Untitled Note',
        note: sanitizeAnnotationText(item.note || '', MAX_ANNOTATION_TEXT_LENGTH),
        provenanceDisclaimer: NON_ENGINEERING_RISK_DISCLAIMER,
        isVerifiedEngineeringRisk: false,
      });
    }
    if (truncatedCount > 0 || rawMeta.annotations.length > MAX_ANNOTATIONS_PER_PROJECT * 2) {
      sanitizedWarnings.push(
        `Saved annotations exceeded limit (${MAX_ANNOTATIONS_PER_PROJECT}); truncated to ${MAX_ANNOTATIONS_PER_PROJECT}.`
      );
    }
  } else if (rawMeta.annotations !== undefined) {
    sanitizedWarnings.push('Corrupt annotations field was reset to an empty list.');
  }

  const resolvedAnnotations = resolveAnnotationAnchorsAgainstProject(project, validAnnotations);

  // Validate bookmarks array
  const validBookmarks: VRReviewBookmark[] = [];
  if (Array.isArray(rawMeta.bookmarks)) {
    for (const bm of rawMeta.bookmarks.slice(0, 100)) {
      if (
        !bm ||
        typeof bm !== 'object' ||
        typeof bm.bookmarkId !== 'string' ||
        typeof bm.label !== 'string' ||
        !bm.cameraPositionMetres ||
        !Number.isFinite(bm.cameraPositionMetres.x)
      ) {
        sanitizedWarnings.push('Skipped 1 malformed bookmark record.');
        continue;
      }
      validBookmarks.push(bm);
    }
  }

  return {
    config,
    annotations: resolvedAnnotations,
    bookmarks: validBookmarks,
    sanitizedWarnings,
  };
}

/**
 * Group G — Persist P49 VR Design Review state onto the Project with a pre-apply version checkpoint.
 * Preserves all unrelated project fields (floorPlan, structural, P41–P48) intact.
 */
export function applyVRDesignReviewStateToProject(
  project: Project,
  stateInput: {
    config: VRDesignReviewConfig;
    annotations: VRReviewAnnotation[];
    bookmarks: VRReviewBookmark[];
    capabilityReport?: VRCapabilityReport;
  },
  createCheckpoint: boolean = true
): { updatedProject: Project; snapshotId: string | null } {
  if (!project || typeof project.id !== 'string' || !project.id) {
    throw new Error('Cannot apply VR Design Review state to an invalid project.');
  }

  let snapshotId: string | null = null;
  if (createCheckpoint) {
    try {
      const snap = createProjectSnapshot(project, {
        label: `Pre-VR Design Review Save (${stateInput.annotations.length} note(s), ${stateInput.config.scalePreset})`,
        description: `Automatic checkpoint before saving P49 Immersive VR Design Review state (${stateInput.annotations.length} annotations, ${stateInput.bookmarks.length} bookmarks).`,
        trigger: 'auto-checkpoint',
      });
      snapshotId = snap.id;
    } catch {
      // Non-blocking in headless test contexts
    }
  }

  const resolvedAnnotations = resolveAnnotationAnchorsAgainstProject(
    project,
    stateInput.annotations.slice(0, MAX_ANNOTATIONS_PER_PROJECT)
  );
  const fingerprint = computeVRModelGeometryFingerprint(project);
  const now = new Date().toISOString();

  const vrMetadata: ProjectVRDesignReviewMetadata = {
    version: 'plotify-vr-review-meta-v1',
    profileId: VR_DESIGN_REVIEW_PROFILE_ID,
    savedConfig: structuredClone(stateInput.config),
    annotations: structuredClone(resolvedAnnotations),
    bookmarks: structuredClone(stateInput.bookmarks.slice(0, 100)),
    lastGeometryFingerprint: fingerprint,
    lastCapabilitySummary: stateInput.capabilityReport
      ? {
          immersiveVRSupported: stateInput.capabilityReport.immersiveVRSupported,
          recommendedMode: stateInput.capabilityReport.recommendedMode,
          evaluatedAt: stateInput.capabilityReport.evaluatedAt,
        }
      : project.vrDesignReview?.lastCapabilitySummary,
    updatedAt: now,
  };

  const updatedProject: Project = {
    ...project,
    vrDesignReview: vrMetadata,
    updatedAt: now,
  };

  return { updatedProject, snapshotId };
}

/**
 * Checks whether the project's geometry or upstream layers have changed since P49 state was saved.
 */
export function checkVRDesignReviewStaleness(project: Project | null | undefined): {
  isStale: boolean;
  reason: string | null;
  savedFingerprint: string | null;
  currentFingerprint: string;
  staleAnnotationCount: number;
  unresolvedAnnotationCount: number;
} {
  if (!project) {
    return {
      isStale: false,
      reason: null,
      savedFingerprint: null,
      currentFingerprint: 'vr-fp-empty',
      staleAnnotationCount: 0,
      unresolvedAnnotationCount: 0,
    };
  }

  const currentFingerprint = computeVRModelGeometryFingerprint(project);
  const savedFingerprint = project.vrDesignReview?.lastGeometryFingerprint || null;
  const { annotations } = getSafeVRDesignReviewState(project);

  const staleAnnotationCount = annotations.filter(
    (a) => a.anchorResolutionStatus === 'stale-geometry-changed'
  ).length;
  const unresolvedAnnotationCount = annotations.filter(
    (a) => a.anchorResolutionStatus === 'unresolved-target-removed'
  ).length;

  if (savedFingerprint && savedFingerprint !== currentFingerprint) {
    return {
      isStale: true,
      reason:
        'Project geometry or upstream P41–P47 layer data changed since the last VR Design Review save. Dependent annotation anchors and overlays have been flagged for re-verification.',
      savedFingerprint,
      currentFingerprint,
      staleAnnotationCount,
      unresolvedAnnotationCount,
    };
  }

  if (unresolvedAnnotationCount > 0) {
    return {
      isStale: true,
      reason: `${unresolvedAnnotationCount} saved annotation(s) reference a model element that was removed.`,
      savedFingerprint,
      currentFingerprint,
      staleAnnotationCount,
      unresolvedAnnotationCount,
    };
  }

  return {
    isStale: false,
    reason: null,
    savedFingerprint,
    currentFingerprint,
    staleAnnotationCount,
    unresolvedAnnotationCount,
  };
}

/**
 * Generates and exports a structured P49 VR Design Review report (Markdown or JSON).
 */
export function generateVRDesignReviewReport(
  project: Project,
  config: VRDesignReviewConfig,
  capability: VRCapabilityReport,
  sessionState: VRSessionStateSnapshot,
  annotations: VRReviewAnnotation[],
  bookmarks: VRReviewBookmark[]
): VRDesignReviewExportReport {
  const preflight = prepareVRModelPreflight(project, config);
  const transform = computeVRSceneTransform(project, config);
  const crossDisciplineLayers = buildVRCrossDisciplineDigests(project);
  const resolvedNotes = resolveAnnotationAnchorsAgainstProject(project, annotations);

  return {
    reportId: `p49-vr-report-${Date.now()}`,
    profileId: VR_DESIGN_REVIEW_PROFILE_ID,
    generatedAt: new Date().toISOString(),
    projectId: project.id,
    projectName: project.name,
    preflight,
    transform,
    capability,
    sessionSummary: {
      phase: sessionState.phase,
      activeMode: sessionState.activeMode,
      activeReferenceSpace: sessionState.activeReferenceSpace,
      connectedInputSourcesCount: sessionState.connectedInputSources.length,
      privacyGuard: sessionState.privacyGuard,
    },
    annotationsSummary: {
      totalCount: resolvedNotes.length,
      openCount: resolvedNotes.filter((n) => n.status !== 'resolved').length,
      resolvedAnchorCount: resolvedNotes.filter((n) => n.anchorResolutionStatus === 'resolved')
        .length,
      staleOrUnresolvedAnchorCount: resolvedNotes.filter(
        (n) => n.anchorResolutionStatus !== 'resolved'
      ).length,
      annotations: resolvedNotes,
    },
    bookmarksCount: bookmarks.length,
    crossDisciplineLayers,
    nonEngineeringAndSurveyDisclaimers: [...VIRTUAL_SCENE_PROVENANCE_DISCLAIMERS],
    hardwareVerificationDisclosure: {
      automatedAndMockedTestsExecuted: true,
      physicalVRHeadsetTestedInCurrentEnv: false,
      explicitStatement: 'Physical VR headset testing was not performed in this environment.',
    },
  };
}

export function exportVRDesignReviewReport(
  report: VRDesignReviewExportReport,
  format: 'markdown' | 'json'
): string {
  if (format === 'json') {
    return JSON.stringify(report, null, 2);
  }

  const lines: string[] = [
    `# P49 — Immersive VR Design Review Report`,
    `**Profile ID:** \`${report.profileId}\``,
    `**Project:** ${report.projectName} (\`${report.projectId}\`)`,
    `**Generated At:** ${report.generatedAt}`,
    ``,
    `## 1. Provenance & Scope Disclaimers`,
    ...report.nonEngineeringAndSurveyDisclaimers.map((d) => `- ${d}`),
    `- **Hardware Verification Disclosure:** ${report.hardwareVerificationDisclosure.explicitStatement}`,
    ``,
    `## 2. Model Preflight & Coordinate Transform`,
    `- **Preflight Ready:** ${report.preflight.isReady ? 'Yes' : 'No'}`,
    `- **Source Unit:** ${report.preflight.sourceUnit} (1 ${report.preflight.sourceUnit} = ${report.transform.unitToMetresFactor} m)`,
    `- **Review Scale Preset:** ${report.transform.scalePreset} (Combined Factor: ${report.transform.combinedScaleFactor})`,
    `- **Scale Derivation Basis:** ${report.transform.scaleDerivationBasis}`,
    `- **Plot Dimensions (1:1 Metres):** ${report.preflight.plotDimensionsMetresAt1To1.widthM} m × ${report.preflight.plotDimensionsMetresAt1To1.lengthM} m × ${report.preflight.plotDimensionsMetresAt1To1.heightM} m`,
    `- **Valid Rooms / Floors:** ${report.preflight.validRoomCount} room(s) across ${report.preflight.floorCount} floor(s)`,
    `- **CAD 2D-Only Entities Excluded:** ${report.preflight.cad2DOnlySkippedCount}`,
    `- **Estimated Complexity:** ${report.preflight.estimatedTriangleCount} triangles, ${report.preflight.estimatedDrawCallCount} draw calls (Within Budget: ${report.preflight.withinHeadsetComplexityBudget})`,
    ``,
    `## 3. WebXR Capability & Session Status`,
    `- **Immersive VR Supported:** ${report.capability.immersiveVRSupported}`,
    `- **Active Workspace Mode:** \`${report.sessionSummary.activeMode}\``,
    `- **Blocker Code:** \`${report.capability.blockerCode}\``,
    `- **Status Summary:** ${report.capability.statusSummary}`,
    `- **Privacy Guarantees:** Camera Capture = \`${report.sessionSummary.privacyGuard.cameraCaptureEnabled}\`, Mic Recording = \`${report.sessionSummary.privacyGuard.microphoneRecordingEnabled}\`, Eye Tracking = \`${report.sessionSummary.privacyGuard.eyeTrackingCollected}\`, P50 Live Multi-User = \`${report.sessionSummary.privacyGuard.liveMultiUserP50Enabled}\``,
    ``,
    `## 4. Saved Review Annotations (${report.annotationsSummary.totalCount})`,
  ];

  if (report.annotationsSummary.annotations.length === 0) {
    lines.push(`- No review annotations recorded.`);
  } else {
    for (const note of report.annotationsSummary.annotations) {
      lines.push(
        `- **[${note.priority.toUpperCase()}] ${note.title}** (\`${note.category}\`, Status: \`${note.status}\`, Anchor: \`${note.anchorResolutionStatus}\`)`
      );
      lines.push(`  - Note: ${note.note}`);
      lines.push(`  - Anchor Details: ${note.anchorResolutionMessage}`);
      lines.push(`  - Provenance: ${note.provenanceDisclaimer}`);
    }
  }

  lines.push(``, `## 5. Cross-Discipline Layer Digests (P41–P48)`);
  for (const layer of report.crossDisciplineLayers) {
    lines.push(
      `- **${layer.title}** (${layer.isAvailableInProject ? 'Available' : 'Unavailable'}${layer.isStale ? ', STALE' : ''}): ${layer.summaryHeadline}`
    );
  }

  return lines.join('\n');
}
