import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Project } from '../../types/project';
import {
  ARVisualizationMode,
  WebXRCapabilityReport,
  ARScalePreset,
  ARAnchorOriginMode,
  ARSiteVisualizationConfig,
  ARSessionTelemetryState,
} from '../../types/arSiteVisualization';
import {
  AR_SCALE_PRESET_FACTORS,
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
} from '../../services/arSiteVisualizationService';
import {
  ArrowLeft,
  Camera,
  Box,
  Compass,
  Sliders,
  Layers,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Info,
  RotateCcw,
  Save,
  Download,
  Copy,
  Lock,
  Unlock,
  ChevronDown,
  ChevronUp,
  Eye,
  Maximize2,
  Mountain,
  Thermometer,
  Truck,
  FileCode2,
  FileSpreadsheet,
  History,
} from 'lucide-react';

interface ARSiteVisualizationWorkspaceProps {
  project: Project;
  onUpdateProject: (updated: Project) => void;
  onBack: () => void;
  onOpenFloorPlan?: (project: Project) => void;
  onOpen3DViewer?: (project: Project) => void;
  onOpenTerrain?: (project: Project) => void;
  onOpenEnvelopePerformance?: (project: Project) => void;
  onOpenSiteLogistics?: (project: Project) => void;
  onOpenIFC?: (project: Project) => void;
  onOpenCAD?: (project: Project) => void;
  onOpenVersionWorkspace?: (
    project: Project,
    tab?: 'timeline' | 'diff' | 'recovery' | 'collaboration'
  ) => void;
  onShowToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const ARSiteVisualizationWorkspace: React.FC<ARSiteVisualizationWorkspaceProps> = ({
  project,
  onUpdateProject,
  onBack,
  onOpenFloorPlan,
  onOpen3DViewer,
  onOpenTerrain,
  onOpenEnvelopePerformance,
  onOpenSiteLogistics,
  onOpenIFC,
  onOpenCAD,
  onOpenVersionWorkspace,
  onShowToast,
}) => {
  const [capabilityReport, setCapabilityReport] = useState<WebXRCapabilityReport | null>(null);
  const [config, setConfig] = useState<ARSiteVisualizationConfig>(() =>
    createDefaultARSiteVisualizationConfig(project)
  );
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<
    'placement' | 'layers' | 'diagnostics' | 'report'
  >('placement');
  const [activeDockTab, setActiveDockTab] = useState<'mode' | 'scale' | 'layers' | 'camera'>('mode');
  const [isDockCollapsed, setIsDockCollapsed] = useState(false);
  const [cameraPreset, setCameraPreset] = useState<'perspective' | 'top' | 'front' | 'side' | 'eye_level'>(
    'perspective'
  );
  const [exportFormat, setExportFormat] = useState<'markdown' | 'json'>('markdown');

  const controllerRef = useRef<ARSessionController>(
    new ARSessionController(config.preferredMode)
  );
  const [sessionState, setSessionState] = useState<ARSessionTelemetryState>(() =>
    controllerRef.current.getState()
  );

  // Sync config when project switches
  useEffect(() => {
    const nextCfg = createDefaultARSiteVisualizationConfig(project, capabilityReport || undefined);
    setConfig(nextCfg);
  }, [project.id]);

  // Run genuine WebXR capability detection on mount (never requests camera permissions)
  useEffect(() => {
    let mounted = true;
    detectARCapabilities().then((report) => {
      if (!mounted) return;
      setCapabilityReport(report);
      if (!project.arSiteVisualization?.savedConfig) {
        setConfig((prev) => ({
          ...prev,
          preferredMode: report.recommendedMode,
          placement: {
            ...prev.placement,
            alignmentMethod:
              report.recommendedMode === 'immersive_ar_webxr'
                ? 'webxr_hit_test_surface_uncalibrated'
                : 'manual_ground_plane_calibrated',
          },
        }));
      }
      if (!report.canAttemptImmersiveAR) {
        controllerRef.current
          .activateFallbackPreview(
            report.recommendedMode === 'standard_3d_site_preview'
              ? 'standard_3d_site_preview'
              : 'manually_calibrated_placement_preview'
          )
          .then((st) => {
            if (mounted) setSessionState(st);
          });
      }
    });
    return () => {
      mounted = false;
      controllerRef.current.endSessionAndCleanup();
    };
  }, [project.id]);

  // Preflight, transform, and staleness calculations
  const preflight = useMemo(() => prepareARModelPreflight(project, config), [project, config]);
  const transformSummary = useMemo(
    () =>
      computeARPlacementTransform(
        project,
        config.placement,
        sessionState.placedAnchorPoseMetres
      ),
    [project, config.placement, sessionState.placedAnchorPoseMetres]
  );
  const staleness = useMemo(() => checkARSiteVisualizationStaleness(project), [project]);

  const floorLevels = useMemo(() => {
    const levels = new Set<number>();
    for (const r of project.floorPlan?.rooms || []) {
      if (r.floorLevel >= 1) levels.add(r.floorLevel);
    }
    const sorted = Array.from(levels).sort((a, b) => a - b);
    return sorted.length > 0 ? sorted : [1];
  }, [project.floorPlan?.rooms]);

  // Three.js Viewport Refs
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const placedRootRef = useRef<THREE.Group | null>(null);
  const calibrationHelpersRef = useRef<THREE.Group | null>(null);
  const reticleMeshRef = useRef<THREE.Mesh | null>(null);
  const renderDirtyRef = useRef<boolean>(true);
  const frameIdRef = useRef<number>(0);

  const requestRender = useCallback(() => {
    renderDirtyRef.current = true;
  }, []);

  // Apply camera preset in metric coordinates
  const applyCameraPresetToViewport = useCallback(
    (preset: 'perspective' | 'top' | 'front' | 'side' | 'eye_level') => {
      if (!cameraRef.current || !controlsRef.current) return;
      const camera = cameraRef.current;
      const controls = controlsRef.current;

      const scaledW = Math.max(1.5, preflight.scaledDisplayDimensionsMetres.widthM);
      const scaledL = Math.max(1.5, preflight.scaledDisplayDimensionsMetres.lengthM);
      const scaledH = Math.max(0.8, preflight.scaledDisplayDimensionsMetres.heightM);
      const maxDim = Math.max(scaledW, scaledL, scaledH);
      const dist = Math.max(2.5, maxDim * 1.65);

      const targetX = transformSummary.positionMetres.x;
      const targetY = transformSummary.positionMetres.y + scaledH * 0.35;
      const targetZ = transformSummary.positionMetres.z;

      if (preset === 'top') {
        controls.target.set(targetX, transformSummary.positionMetres.y, targetZ);
        camera.position.set(targetX, transformSummary.positionMetres.y + dist * 1.45, targetZ + 0.01);
      } else if (preset === 'front') {
        controls.target.set(targetX, targetY, targetZ);
        camera.position.set(targetX, targetY, targetZ + dist);
      } else if (preset === 'side') {
        controls.target.set(targetX, targetY, targetZ);
        camera.position.set(targetX + dist, targetY, targetZ);
      } else if (preset === 'eye_level') {
        // Human eye-level walk-up perspective (1.65 m above ground at 1:1 scale, or proportional in tabletop)
        const eyeY =
          transformSummary.positionMetres.y +
          (config.placement.scalePreset === '1:1' ? 1.65 : Math.max(0.35, scaledH * 0.4));
        controls.target.set(targetX, eyeY, targetZ);
        camera.position.set(targetX, eyeY, targetZ + Math.max(2.0, scaledL * 0.95));
      } else {
        controls.target.set(targetX, targetY * 0.8, targetZ);
        camera.position.set(
          targetX + dist * 0.85,
          transformSummary.positionMetres.y + dist * 0.72,
          targetZ + dist * 0.95
        );
      }

      camera.lookAt(controls.target);
      controls.update();
      requestRender();
    },
    [preflight.scaledDisplayDimensionsMetres, transformSummary.positionMetres, config.placement.scalePreset, requestRender]
  );

  // Initialize Three.js WebGL scene once
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 900;
    const height = container.clientHeight || 540;

    const isSoftwareGl = (() => {
      try {
        const gl = document.createElement('canvas').getContext('webgl2');
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

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
      alpha: true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.xr.enabled = true;

    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8fafc);
    scene.fog = new THREE.Fog(0xf8fafc, 60, 220);
    sceneRef.current = scene;

    // Studio Environment Reflection (Three.js Skill Directive)
    try {
      const pmremGenerator = new THREE.PMREMGenerator(renderer);
      scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
      pmremGenerator.dispose();
    } catch {
      // Fallback if PMREM fails on restricted context
    }

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.05, 500);
    camera.position.set(18, 14, 22);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2 + 0.04;
    controls.minDistance = 0.4;
    controls.maxDistance = 250;
    controls.addEventListener('change', requestRender);
    controlsRef.current = controls;

    // 3-Point Warm/Cool Studio Lighting Rig
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x94a3b8, 1.05);
    hemiLight.position.set(0, 50, 0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfffbeb, 1.75);
    keyLight.position.set(25, 42, 22);
    keyLight.castShadow = !isSoftwareGl;
    if (keyLight.castShadow) {
      keyLight.shadow.mapSize.width = 1024;
      keyLight.shadow.mapSize.height = 1024;
      keyLight.shadow.camera.near = 1;
      keyLight.shadow.camera.far = 140;
      const d = 28;
      keyLight.shadow.camera.left = -d;
      keyLight.shadow.camera.right = d;
      keyLight.shadow.camera.top = d;
      keyLight.shadow.camera.bottom = -d;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xe0f2fe, 0.65);
    fillLight.position.set(-22, 18, -18);
    scene.add(fillLight);

    // Metric Ground Grid & Calibration Ring Group
    const calibrationGroup = new THREE.Group();
    calibrationGroup.name = 'MetricCalibrationHelpers';

    const metricGrid = new THREE.GridHelper(60, 60, 0x0d9488, 0xe2e8f0);
    metricGrid.position.y = -0.005;
    calibrationGroup.add(metricGrid);

    // Anchor Target Ring at (0, 0, 0)
    const ringGeo = new THREE.RingGeometry(0.45, 0.55, 48);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x0d9488,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const anchorRing = new THREE.Mesh(ringGeo, ringMat);
    anchorRing.rotation.x = -Math.PI / 2;
    anchorRing.position.y = 0.005;
    calibrationGroup.add(anchorRing);

    scene.add(calibrationGroup);
    calibrationHelpersRef.current = calibrationGroup;

    // Reticle mesh for AR surface hit-test visualization
    const reticleGeo = new THREE.RingGeometry(0.18, 0.24, 32).rotateX(-Math.PI / 2);
    const reticleMat = new THREE.MeshBasicMaterial({ color: 0x10b981, side: THREE.DoubleSide });
    const reticleMesh = new THREE.Mesh(reticleGeo, reticleMat);
    reticleMesh.visible = false;
    reticleMesh.name = 'WebXRHitTestReticle';
    scene.add(reticleMesh);
    reticleMeshRef.current = reticleMesh;

    // Software WebGL fence-synced loop helper
    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (gl && typeof gl.fenceSync === 'function') {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (state === gl.UNSIGNALED) {
            frameIdRef.current = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            frameIdRef.current = window.setTimeout(cb, 80);
          }
        };
        frameIdRef.current = window.setTimeout(poll, 5);
      } else {
        frameIdRef.current = window.setTimeout(cb, 80);
      }
    }

    const tick = () => {
      if (controls.enableDamping) {
        controls.update();
      }
      if (renderDirtyRef.current) {
        renderer.render(scene, camera);
        renderDirtyRef.current = false;
      }
      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameIdRef.current = requestAnimationFrame(tick);
      }
    };
    tick();

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: w, height: h } = entry.contentRect;
        if (w > 0 && h > 0) {
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
          requestRender();
        }
      }
    });
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(frameIdRef.current);
      clearTimeout(frameIdRef.current);
      resizeObserver.disconnect();
      controls.dispose();
      renderer.setAnimationLoop(null);
      if (placedRootRef.current) {
        disposeThreeHierarchy(placedRootRef.current);
      }
      disposeThreeHierarchy(calibrationGroup);
      renderer.dispose();
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, [requestRender]);

  // Rebuild and place normalized metric 3D model when project, config, or session pose changes
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (placedRootRef.current) {
      scene.remove(placedRootRef.current);
      disposeThreeHierarchy(placedRootRef.current);
      placedRootRef.current = null;
    }

    const { rootGroup } = buildARSiteCompleteThreeGroup(
      project,
      config,
      sessionState.placedAnchorPoseMetres
    );
    placedRootRef.current = rootGroup;
    scene.add(rootGroup);

    // Update reticle visibility if in surface search state
    if (reticleMeshRef.current) {
      reticleMeshRef.current.visible = Boolean(
        sessionState.reticleVisible && sessionState.reticleHitPoseMetres
      );
      if (sessionState.reticleHitPoseMetres) {
        reticleMeshRef.current.position.set(
          sessionState.reticleHitPoseMetres.x,
          sessionState.reticleHitPoseMetres.y + 0.01,
          sessionState.reticleHitPoseMetres.z
        );
      }
    }

    // Toggle calibration helpers visibility based on mode
    if (calibrationHelpersRef.current) {
      calibrationHelpersRef.current.visible =
        sessionState.activeMode !== 'immersive_ar_webxr' || !sessionState.placedAnchorPoseMetres;
    }

    requestRender();
  }, [project, config, sessionState.placedAnchorPoseMetres, sessionState.reticleVisible, sessionState.reticleHitPoseMetres, sessionState.activeMode, requestRender]);

  // Apply initial camera framing when scale preset changes
  useEffect(() => {
    applyCameraPresetToViewport(cameraPreset);
  }, [cameraPreset, config.placement.scalePreset, applyCameraPresetToViewport]);

  // Handlers for mode switching & explicit user-triggered WebXR startup
  const handleSelectMode = async (mode: ARVisualizationMode) => {
    setConfig((prev) => ({
      ...prev,
      preferredMode: mode,
      placement: {
        ...prev.placement,
        alignmentMethod:
          mode === 'immersive_ar_webxr'
            ? 'webxr_hit_test_surface_uncalibrated'
            : 'manual_ground_plane_calibrated',
      },
      updatedAt: new Date().toISOString(),
    }));

    if (mode !== 'immersive_ar_webxr') {
      const nextState = await controllerRef.current.activateFallbackPreview(mode);
      setSessionState(nextState);
      if (sceneRef.current) {
        sceneRef.current.background = new THREE.Color(
          mode === 'manually_calibrated_placement_preview' ? 0xf1f5f9 : 0xf8fafc
        );
        requestRender();
      }
    }
  };

  const handleStartImmersiveARClick = async () => {
    if (!capabilityReport) return;

    if (!config.safetyNoticeAcknowledged) {
      setConfig((prev) => ({ ...prev, safetyNoticeAcknowledged: true }));
    }

    const nextState = await controllerRef.current.requestStartImmersiveAR({
      triggeredByUserGesture: true,
      capabilityReport,
    });
    setSessionState(nextState);

    if (nextState.activeMode === 'immersive_ar_webxr') {
      onShowToast?.('Immersive AR session started. Scan a horizontal ground surface to place model.', 'info');
    } else if (nextState.lastErrorMessage) {
      onShowToast?.(nextState.lastErrorMessage, 'info');
    }
  };

  const handleEndARSession = async () => {
    const nextState = await controllerRef.current.endSessionAndCleanup();
    setSessionState(nextState);
    onShowToast?.('AR session ended and spatial tracking resources released.', 'info');
  };

  const handlePlacementPatch = (
    patch: Parameters<typeof applyManualPlacementAdjustment>[1]
  ) => {
    if (config.placement.placementLocked && patch.placementLocked === undefined) {
      onShowToast?.('Placement is currently locked. Unlock placement to adjust coordinates or scale.', 'info');
      return;
    }
    setConfig((prev) => applyManualPlacementAdjustment(prev, patch));
  };

  const handleResetPlacement = () => {
    setConfig((prev) => resetARPlacementToDefault(project, prev, false));
    onShowToast?.('AR placement calibration reset to 1:1 centered plot origin.', 'info');
  };

  const handleSaveConfigToProject = () => {
    const updated = applyARSiteConfigToProject(
      project,
      config,
      capabilityReport || undefined,
      true
    );
    onUpdateProject(updated);
    onShowToast?.(`Saved P48 AR Site Visualization configuration to "${project.name}".`, 'success');
  };

  const fullReport = useMemo(() => {
    if (!capabilityReport) return null;
    return generateARSiteVisualizationReport(project, config, capabilityReport, sessionState);
  }, [project, config, capabilityReport, sessionState]);

  const exportedReportText = useMemo(() => {
    if (!fullReport) return '';
    return exportARSiteVisualizationReport(fullReport, exportFormat);
  }, [fullReport, exportFormat]);

  const handleCopyReport = () => {
    if (!exportedReportText) return;
    navigator.clipboard?.writeText(exportedReportText);
    onShowToast?.(`Copied AR Site Visualization ${exportFormat.toUpperCase()} report to clipboard.`, 'success');
  };

  const handleDownloadReport = () => {
    if (!exportedReportText) return;
    const blob = new Blob([exportedReportText], {
      type: exportFormat === 'json' ? 'application/json' : 'text/markdown',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-p48-ar-site-report.${
      exportFormat === 'json' ? 'json' : 'md'
    }`;
    a.click();
    URL.revokeObjectURL(url);
    onShowToast?.(`Downloaded P48 AR Site Visualization report.`, 'success');
  };

  const unitSuffix = project.unit === 'feet' ? 'ft' : 'm';

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      {/* Top Header Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <button
            onClick={onBack}
            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer mt-0.5"
            title="Back to Project Overview"
            aria-label="Back to Project Overview"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="font-semibold text-teal-800">P48 Augmented Reality Site Visualization</span>
              <span aria-hidden="true">·</span>
              <span>Profile: plotify-ar-site-visualization-p48-v1</span>
              <span aria-hidden="true">·</span>
              <span>
                Source: {project.plotWidth}×{project.plotLength} {unitSuffix} →{' '}
                {preflight.plotDimensionsMetres.widthM.toFixed(2)}m ×{' '}
                {preflight.plotDimensionsMetres.lengthM.toFixed(2)}m (1:1 WebXR Metric)
              </span>
            </div>

            <h1 className="text-xl font-bold text-slate-900 tracking-tight mt-1">
              {project.name} — Site & Massing AR Placement Studio
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onOpen3DViewer && (
            <button
              onClick={() => onOpen3DViewer(project)}
              className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              3D Engine
            </button>
          )}
          {onOpenTerrain && (
            <button
              onClick={() => onOpenTerrain(project)}
              className="px-3 py-1.5 text-xs font-semibold text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              P43 Terrain
            </button>
          )}
          {onOpenSiteLogistics && (
            <button
              onClick={() => onOpenSiteLogistics(project)}
              className="px-3 py-1.5 text-xs font-semibold text-amber-950 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              P47 Logistics
            </button>
          )}
          {onOpenVersionWorkspace && (
            <button
              onClick={() => onOpenVersionWorkspace(project, 'timeline')}
              className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer inline-flex items-center gap-1.5"
            >
              <History className="w-3.5 h-3.5 text-teal-700" />
              <span>Revisions</span>
            </button>
          )}
          <button
            onClick={handleSaveConfigToProject}
            className="px-4 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer inline-flex items-center gap-1.5"
          >
            <Save className="w-3.5 h-3.5 text-teal-400" />
            <span>Save AR Config</span>
          </button>
        </div>
      </div>

      {/* Physical Safety & Non-Survey Honesty Disclosure Strip */}
      <div className="bg-amber-50/90 border border-amber-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs text-amber-950">
        <div className="flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div className="space-y-0.5 leading-relaxed">
            <span className="font-bold">Visual Site Overlay Only — Not a Survey or Set-Out Instrument:</span>{' '}
            AR and calibrated placement previews use local visual-inertial tracking or manual alignment (typical drift ±0.10 m to ±1.50 m+;{' '}
            <code className="font-mono text-[11px] bg-amber-100/80 px-1 py-0.5 rounded">
              isGeospatiallyRegistered = false
            </code>
            ). Never use for legal boundary determination, excavation set-out, or structural clearance. Stay aware of physical terrain, vehicles, and construction hazards at all times.
          </div>
        </div>

        <label className="inline-flex items-center gap-2 shrink-0 font-semibold text-amber-950 cursor-pointer bg-white px-3 py-1.5 rounded-lg border border-amber-300">
          <input
            type="checkbox"
            checked={config.safetyNoticeAcknowledged}
            onChange={(e) =>
              setConfig((prev) => ({
                ...prev,
                safetyNoticeAcknowledged: e.target.checked,
              }))
            }
            className="accent-teal-700 rounded"
          />
          <span className="whitespace-nowrap">Safety & Limits Understood</span>
        </label>
      </div>

      {/* Staleness Notice if project geometry changed since last save */}
      {staleness.isStale && (
        <div className="bg-sky-50 border border-sky-200 rounded-xl p-3.5 flex items-center justify-between gap-4 text-xs text-sky-950">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-sky-700 shrink-0" />
            <span>
              <strong>Upstream Model Updated:</strong> {staleness.reason} Live viewport has automatically re-normalized the latest geometry. Click &ldquo;Save AR Config&rdquo; to update the stored fingerprint.
            </span>
          </div>
          <button
            onClick={handleSaveConfigToProject}
            className="px-3 py-1 bg-sky-900 hover:bg-sky-800 text-white rounded-lg font-semibold whitespace-nowrap shrink-0 cursor-pointer"
          >
            Sync Saved Config
          </button>
        </div>
      )}

      {/* Three Explicit Viewing Modes Selector & Capability Status Banner */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <div className="text-xs font-bold text-slate-900">
              Viewing & Placement Mode Selection (Honest Capability Routing)
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              {capabilityReport
                ? `${capabilityReport.headline} — ${capabilityReport.explanation}`
                : 'Evaluating browser WebXR immersive-ar and spatial tracking capabilities...'}
            </div>
          </div>

          {capabilityReport?.canAttemptImmersiveAR ? (
            <button
              onClick={handleStartImmersiveARClick}
              className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg shadow-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer inline-flex items-center gap-1.5"
            >
              <Camera className="w-4 h-4" />
              <span>Start Immersive AR Session (Requests Camera)</span>
            </button>
          ) : (
            <div className="text-xs font-medium text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 whitespace-nowrap shrink-0">
              Immersive AR Hardware Unavailable · Fallback Active
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Mode A */}
          <button
            type="button"
            onClick={() => handleSelectMode('immersive_ar_webxr')}
            className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
              config.preferredMode === 'immersive_ar_webxr'
                ? 'bg-teal-50/70 border-teal-300 text-slate-900'
                : 'bg-slate-50/60 hover:bg-slate-100/70 border-slate-200 text-slate-700'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-bold text-slate-900">
              <span>Mode A — Immersive AR (WebXR)</span>
              <span className="text-[11px] font-normal text-slate-500">
                {capabilityReport?.canAttemptImmersiveAR ? 'Supported' : 'Hardware Required'}
              </span>
            </div>
            <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
              Live camera passthrough and real-world surface hit-testing via WebXR{' '}
              <code className="font-mono">immersive-ar</code>. Requires ARCore/ARKit compatible mobile browser and explicit user camera permission.
            </p>
          </button>

          {/* Mode C */}
          <button
            type="button"
            onClick={() => handleSelectMode('manually_calibrated_placement_preview')}
            className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
              config.preferredMode === 'manually_calibrated_placement_preview'
                ? 'bg-teal-50/70 border-teal-300 text-slate-900'
                : 'bg-slate-50/60 hover:bg-slate-100/70 border-slate-200 text-slate-700'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-bold text-slate-900">
              <span>Mode C — Calibrated Placement Preview</span>
              <span className="text-[11px] font-semibold text-teal-800">Active Fallback</span>
            </div>
            <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
              1:1 real-world metre or miniature tabletop (1:10–1:100) ground-plane anchor calibration with yaw heading, X/Y/Z metre offsets, and 1.75 m human scale reference.
            </p>
          </button>

          {/* Mode B */}
          <button
            type="button"
            onClick={() => handleSelectMode('standard_3d_site_preview')}
            className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
              config.preferredMode === 'standard_3d_site_preview'
                ? 'bg-teal-50/70 border-teal-300 text-slate-900'
                : 'bg-slate-50/60 hover:bg-slate-100/70 border-slate-200 text-slate-700'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-bold text-slate-900">
              <span>Mode B — Standard 3D Site Preview</span>
              <span className="text-[11px] font-normal text-slate-500">Universal 3D</span>
            </div>
            <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
              Non-AR architectural 3D orbit inspection with P43 terrain, P46 envelope highlights, and P47 phased site logistics overlays.
            </p>
          </button>
        </div>
      </div>

      {/* Main 3D / AR Calibration Viewport with Unobstructed Center & Collapsible Bottom Dock */}
      <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-100 shadow-xs">
        {/* Top-Left Minimal Spec & Mode Overlay (Semantic DOM over Canvas) */}
        <div className="absolute top-3 left-3 z-10 pointer-events-none flex flex-wrap items-center gap-2 text-xs bg-slate-900/90 text-white px-3 py-1.5 rounded-lg border border-slate-700">
          <span className="font-semibold text-teal-300">
            {sessionState.activeMode === 'immersive_ar_webxr'
              ? 'Mode A: Immersive AR (WebXR)'
              : sessionState.activeMode === 'manually_calibrated_placement_preview'
              ? 'Mode C: Calibrated Placement Preview (Non-AR)'
              : 'Mode B: Standard 3D Site Preview (Non-AR)'}
          </span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">Scale {config.placement.scalePreset}</span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">
            {preflight.scaledDisplayDimensionsMetres.widthM.toFixed(2)}m ×{' '}
            {preflight.scaledDisplayDimensionsMetres.lengthM.toFixed(2)}m ×{' '}
            {preflight.scaledDisplayDimensionsMetres.heightM.toFixed(2)}m
          </span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">Yaw {transformSummary.totalYawDeg.toFixed(1)}°</span>
        </div>

        {/* Dedicated Isolated Three.js Canvas Mount */}
        <div
          ref={mountRef}
          className="w-full h-[540px] select-none"
          style={{ touchAction: 'none' }}
        />

        {/* Collapsible Unified Bottom Control Dock (Zero backdrop-filter over WebGL per Three.js skill) */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[94%] max-w-3xl z-20 pointer-events-auto">
          <div className="flex justify-center mb-1.5">
            <button
              type="button"
              onClick={() => setIsDockCollapsed(!isDockCollapsed)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1 bg-slate-900 text-white border border-slate-700 rounded-lg text-[11px] font-semibold shadow-sm hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {isDockCollapsed ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5 text-teal-400" />
                  <span>Show AR & 3D Viewport Controls</span>
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                  <span>Hide Controls</span>
                </>
              )}
            </button>
          </div>

          {!isDockCollapsed && (
            <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-lg space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100 text-xs">
                <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setActiveDockTab('mode')}
                    className={`px-2.5 py-1 font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      activeDockTab === 'mode'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Scale & Anchor
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveDockTab('scale')}
                    className={`px-2.5 py-1 font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      activeDockTab === 'scale'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Yaw & Nudge
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveDockTab('layers')}
                    className={`px-2.5 py-1 font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      activeDockTab === 'layers'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Layers
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveDockTab('camera')}
                    className={`px-2.5 py-1 font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      activeDockTab === 'camera'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Camera Views
                  </button>
                </div>

                <div className="flex items-center gap-2 text-[11px] text-slate-500 tabular-nums">
                  <span>{preflight.estimatedTriangles.toLocaleString()} tris</span>
                  <span aria-hidden="true">·</span>
                  <button
                    type="button"
                    onClick={() =>
                      handlePlacementPatch({
                        placementLocked: !config.placement.placementLocked,
                      })
                    }
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border font-semibold cursor-pointer ${
                      config.placement.placementLocked
                        ? 'bg-amber-50 border-amber-300 text-amber-900'
                        : 'bg-slate-50 border-slate-200 text-slate-700'
                    }`}
                  >
                    {config.placement.placementLocked ? (
                      <>
                        <Lock className="w-3 h-3 text-amber-700" />
                        <span>Locked</span>
                      </>
                    ) : (
                      <>
                        <Unlock className="w-3 h-3 text-slate-500" />
                        <span>Unlocked</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {activeDockTab === 'mode' && (
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-slate-500 font-medium mr-1">Scale:</span>
                    {(['1:1', '1:10', '1:20', '1:50', '1:100'] as ARScalePreset[]).map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => handlePlacementPatch({ scalePreset: preset })}
                        className={`px-2.5 py-1 rounded-lg border font-semibold tabular-nums transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          config.placement.scalePreset === preset
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        {preset === '1:1' ? '1:1 Full Site' : `${preset} Tabletop`}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500 font-medium">Anchor:</span>
                    <select
                      value={config.placement.anchorOriginMode}
                      onChange={(e) =>
                        handlePlacementPatch({
                          anchorOriginMode: e.target.value as ARAnchorOriginMode,
                        })
                      }
                      className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800"
                    >
                      <option value="plot_center">Plot Center (0,0)</option>
                      <option value="plot_southwest_corner">Southwest Corner</option>
                      <option value="road_frontage_center">Road Frontage Center</option>
                    </select>
                  </div>
                </div>
              )}

              {activeDockTab === 'scale' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs items-center">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="font-medium text-slate-600">Yaw Heading:</span>
                      <span className="font-bold text-slate-900 tabular-nums">
                        {config.placement.yawRotationDeg}°
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-180}
                      max={180}
                      step={1}
                      value={config.placement.yawRotationDeg}
                      onChange={(e) =>
                        handlePlacementPatch({ yawRotationDeg: parseFloat(e.target.value) })
                      }
                      className="w-full accent-teal-700"
                    />
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        handlePlacementPatch({
                          offsetXMetres: Number((config.placement.offsetXMetres - 0.5).toFixed(2)),
                        })
                      }
                      className="px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded font-semibold text-slate-700 cursor-pointer"
                    >
                      X -0.5m
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handlePlacementPatch({
                          offsetXMetres: Number((config.placement.offsetXMetres + 0.5).toFixed(2)),
                        })
                      }
                      className="px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded font-semibold text-slate-700 cursor-pointer"
                    >
                      X +0.5m
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handlePlacementPatch({
                          offsetZMetres: Number((config.placement.offsetZMetres - 0.5).toFixed(2)),
                        })
                      }
                      className="px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded font-semibold text-slate-700 cursor-pointer"
                    >
                      Z -0.5m
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handlePlacementPatch({
                          offsetZMetres: Number((config.placement.offsetZMetres + 0.5).toFixed(2)),
                        })
                      }
                      className="px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded font-semibold text-slate-700 cursor-pointer"
                    >
                      Z +0.5m
                    </button>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleResetPlacement}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-teal-700" />
                      <span>Reset Origin</span>
                    </button>
                  </div>
                </div>
              )}

              {activeDockTab === 'layers' && (
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  {[
                    { key: 'showBuildingShell', label: 'Walls & Shell' },
                    { key: 'showFloorSlabs', label: 'Slabs' },
                    { key: 'showStructuralColumns', label: 'Columns' },
                    { key: 'showTerrainSurface', label: 'P43 Terrain' },
                    { key: 'showEnvelopeHighlights', label: 'P46 Envelope' },
                    { key: 'showSiteLogisticsOverlay', label: 'P47 Logistics' },
                    { key: 'showScaleReferenceMarkers', label: '1.75m Scale Ref' },
                  ].map((item) => {
                    const active = Boolean(
                      config.layers[item.key as keyof typeof config.layers]
                    );
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() =>
                          setConfig((prev) => ({
                            ...prev,
                            layers: {
                              ...prev.layers,
                              [item.key]: !active,
                            },
                          }))
                        }
                        className={`px-2.5 py-1 rounded-lg border font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                          active
                            ? 'bg-teal-50 border-teal-200 text-teal-900'
                            : 'bg-slate-50 border-slate-200 text-slate-500'
                        }`}
                      >
                        {active ? `✓ ${item.label}` : item.label}
                      </button>
                    );
                  })}
                </div>
              )}

              {activeDockTab === 'camera' && (
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(
                      [
                        { id: 'perspective', label: 'Isometric 3D' },
                        { id: 'eye_level', label: '1.65m Eye-Level Site View' },
                        { id: 'top', label: 'Top-Down Plan' },
                        { id: 'front', label: 'Front Elevation' },
                        { id: 'side', label: 'Side Elevation' },
                      ] as const
                    ).map((cam) => (
                      <button
                        key={cam.id}
                        type="button"
                        onClick={() => setCameraPreset(cam.id)}
                        className={`px-2.5 py-1 rounded-lg border font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                          cameraPreset === cam.id
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        {cam.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Detailed Workspace Tabs Below Viewport */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="flex flex-wrap items-center gap-1 p-2 bg-slate-50 border-b border-slate-200 text-xs">
          <button
            type="button"
            onClick={() => setActiveWorkspaceTab('placement')}
            className={`px-3.5 py-2 rounded-lg font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeWorkspaceTab === 'placement'
                ? 'bg-white text-slate-900 shadow-2xs border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            01. Scale, Anchor & Placement Calibration
          </button>
          <button
            type="button"
            onClick={() => setActiveWorkspaceTab('layers')}
            className={`px-3.5 py-2 rounded-lg font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeWorkspaceTab === 'layers'
                ? 'bg-white text-slate-900 shadow-2xs border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            02. P41–P47 Layer Compatibility & Preflight Budget
          </button>
          <button
            type="button"
            onClick={() => setActiveWorkspaceTab('diagnostics')}
            className={`px-3.5 py-2 rounded-lg font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeWorkspaceTab === 'diagnostics'
                ? 'bg-white text-slate-900 shadow-2xs border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            03. WebXR Capability & Lifecycle Diagnostics
          </button>
          <button
            type="button"
            onClick={() => setActiveWorkspaceTab('report')}
            className={`px-3.5 py-2 rounded-lg font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeWorkspaceTab === 'report'
                ? 'bg-white text-slate-900 shadow-2xs border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            04. AR Site Dossier & Report Export
          </button>
        </div>

        <div className="p-6">
          {/* TAB 1: Placement Calibration & Coordinate Reference */}
          {activeWorkspaceTab === 'placement' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 space-y-5">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Metric Unit Normalization & Placement Calibration
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    WebXR <code className="font-mono">immersive-ar</code> operates strictly in real-world metres (1.0 scene unit = 1.0 m). Plotify converts your project from{' '}
                    <strong>{project.unit}</strong> using factor{' '}
                    <code className="font-mono">{preflight.unitToMetresFactor}</code> exactly once before applying scale or anchor offsets.
                  </p>
                </div>

                {/* Scale & Anchor Controls */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 block">
                      Display Scale Mode
                    </label>
                    <select
                      value={config.placement.scalePreset}
                      onChange={(e) =>
                        handlePlacementPatch({
                          scalePreset: e.target.value as ARScalePreset,
                        })
                      }
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg font-medium text-slate-900"
                    >
                      <option value="1:1">1:1 — Full-Scale On-Site Walk-Around (Factor 1.0)</option>
                      <option value="1:10">1:10 — Large Studio Model (Factor 0.10)</option>
                      <option value="1:20">1:20 — Architectural Tabletop Model (Factor 0.05)</option>
                      <option value="1:50">1:50 — Site Context Tabletop Model (Factor 0.02)</option>
                      <option value="1:100">1:100 — Compact Desk Massing Model (Factor 0.01)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 block">
                      Placement Anchor Origin Reference
                    </label>
                    <select
                      value={config.placement.anchorOriginMode}
                      onChange={(e) =>
                        handlePlacementPatch({
                          anchorOriginMode: e.target.value as ARAnchorOriginMode,
                        })
                      }
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg font-medium text-slate-900"
                    >
                      <option value="plot_center">Plot Center at Ground Base (0, 0, 0)</option>
                      <option value="plot_southwest_corner">Southwest Plot Corner Monument</option>
                      <option value="road_frontage_center">
                        Primary Road Frontage Center ({project.roadFacing})
                      </option>
                    </select>
                  </div>
                </div>

                {/* Yaw Rotation & North Alignment */}
                <div className="space-y-3 pt-3 border-t border-slate-100">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-semibold text-slate-700">
                      Yaw Heading Rotation (degrees around +Y vertical axis)
                    </label>
                    <span className="font-mono font-bold text-slate-900 tabular-nums">
                      {config.placement.yawRotationDeg}° (Total: {transformSummary.totalYawDeg}°)
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-180}
                    max={180}
                    step={1}
                    value={config.placement.yawRotationDeg}
                    onChange={(e) =>
                      handlePlacementPatch({ yawRotationDeg: parseFloat(e.target.value) })
                    }
                    className="w-full accent-teal-700"
                  />

                  <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.placement.alignWithProjectNorth}
                      onChange={(e) =>
                        handlePlacementPatch({ alignWithProjectNorth: e.target.checked })
                      }
                      className="accent-teal-700 rounded"
                    />
                    <span>
                      Apply P31 Site True-North Offset ({config.placement.projectNorthOffsetDeg}°) to AR Heading
                    </span>
                  </label>
                </div>

                {/* Fine Position Offsets in Metres */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-slate-100 text-xs">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      East/West Offset X (m)
                    </label>
                    <input
                      type="number"
                      step={0.1}
                      min={-100}
                      max={100}
                      value={config.placement.offsetXMetres}
                      onChange={(e) =>
                        handlePlacementPatch({
                          offsetXMetres: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono tabular-nums text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      North/South Offset Z (m)
                    </label>
                    <input
                      type="number"
                      step={0.1}
                      min={-100}
                      max={100}
                      value={config.placement.offsetZMetres}
                      onChange={(e) =>
                        handlePlacementPatch({
                          offsetZMetres: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono tabular-nums text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      Ground Elevation Offset Y (m)
                    </label>
                    <input
                      type="number"
                      step={0.05}
                      min={-25}
                      max={25}
                      value={config.placement.elevationOffsetYMetres}
                      onChange={(e) =>
                        handlePlacementPatch({
                          elevationOffsetYMetres: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono tabular-nums text-slate-900"
                    />
                  </div>
                </div>
              </div>

              {/* Right Column: Live Metric Transform Matrix & Provenance Readout */}
              <div className="lg:col-span-5 bg-slate-50 rounded-xl border border-slate-200 p-5 space-y-4 text-xs">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                  <span className="font-bold text-slate-900">
                    Computed WebXR Metric Transform State
                  </span>
                  <span className="font-mono text-[11px] text-teal-800">
                    Right-Handed (+X East, +Y Up, -Z North)
                  </span>
                </div>

                <div className="space-y-2 tabular-nums">
                  <div className="flex justify-between">
                    <span className="text-slate-500">1:1 Full-Scale Plot (Metres):</span>
                    <span className="font-mono font-semibold text-slate-900">
                      {preflight.plotDimensionsMetres.widthM.toFixed(3)} m ×{' '}
                      {preflight.plotDimensionsMetres.lengthM.toFixed(3)} m
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">1:1 Building Height (Metres):</span>
                    <span className="font-mono font-semibold text-slate-900">
                      {preflight.plotDimensionsMetres.totalHeightM.toFixed(3)} m ({preflight.floorCount} floors)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Uniform Scale (m / project unit):</span>
                    <span className="font-mono font-semibold text-teal-800">
                      {transformSummary.uniformScaleMetresPerProjectUnit.toFixed(6)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Anchor Local Shift (m):</span>
                    <span className="font-mono text-slate-800">
                      ({transformSummary.anchorLocalOffsetMetres.x.toFixed(2)},{' '}
                      {transformSummary.anchorLocalOffsetMetres.y.toFixed(2)},{' '}
                      {transformSummary.anchorLocalOffsetMetres.z.toFixed(2)})
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">World Anchor Position (m):</span>
                    <span className="font-mono font-semibold text-slate-900">
                      ({transformSummary.positionMetres.x.toFixed(2)},{' '}
                      {transformSummary.positionMetres.y.toFixed(2)},{' '}
                      {transformSummary.positionMetres.z.toFixed(2)})
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Alignment Provenance:</span>
                    <span className="font-mono text-slate-800">
                      {config.placement.alignmentMethod}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Geospatially Registered (GNSS):</span>
                    <span className="font-mono font-bold text-amber-800">false (Local / Manual)</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200">
                  <div className="text-[11px] font-semibold text-slate-500 mb-1">
                    4×4 Homogeneous World Transform Matrix (Column-Major):
                  </div>
                  <div className="grid grid-cols-4 gap-1 font-mono text-[11px] bg-white p-2.5 rounded-lg border border-slate-200 text-right tabular-nums">
                    {transformSummary.matrix16.map((val, idx) => (
                      <span key={idx} className="text-slate-700">
                        {val.toFixed(3)}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: P41–P47 Layer Compatibility & Preflight Budget */}
          {activeWorkspaceTab === 'layers' && (
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Cross-Discipline AR Layer Controls & Mobile Geometry Budget
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Selectively toggle architectural, structural, topographic (P43), envelope (P46), and site logistics (P47) layers. Unmapped 2D-only CAD entities (P42) are honestly excluded from 3D mesh fabrication.
                  </p>
                </div>

                <div className="flex items-center gap-4 text-xs tabular-nums bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-200">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Est. Triangles</span>
                    <span className="font-bold text-slate-900">
                      {preflight.estimatedTriangles.toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Est. Vertices</span>
                    <span className="font-bold text-slate-900">
                      {preflight.estimatedVertices.toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Draw Calls</span>
                    <span className="font-bold text-slate-900">~{preflight.estimatedDrawCalls}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">AR Budget</span>
                    <span className="font-bold text-teal-800">{preflight.performanceBudgetStatus}</span>
                  </div>
                </div>
              </div>

              {/* Floor Isolator & Wall Opacity */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1.5">
                    Storey / Floor Isolation
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setConfig((prev) => ({
                          ...prev,
                          layers: { ...prev.layers, selectedFloor: 'all' },
                        }))
                      }
                      className={`px-3 py-1.5 rounded-lg border font-semibold cursor-pointer ${
                        config.layers.selectedFloor === 'all'
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-700 border-slate-200'
                      }`}
                    >
                      All Storeys ({preflight.floorCount})
                    </button>
                    {floorLevels.map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() =>
                          setConfig((prev) => ({
                            ...prev,
                            layers: { ...prev.layers, selectedFloor: lvl },
                          }))
                        }
                        className={`px-3 py-1.5 rounded-lg border font-semibold cursor-pointer ${
                          config.layers.selectedFloor === lvl
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-700 border-slate-200'
                        }`}
                      >
                        Floor {lvl}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex justify-between mb-1.5">
                    <label className="font-semibold text-slate-700">
                      Wall Ghosting / Opacity
                    </label>
                    <span className="font-bold text-slate-900 tabular-nums">
                      {Math.round(config.layers.wallOpacity * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.25}
                    max={1.0}
                    step={0.05}
                    value={config.layers.wallOpacity}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        layers: {
                          ...prev.layers,
                          wallOpacity: parseFloat(e.target.value),
                        },
                      }))
                    }
                    className="w-full accent-teal-700"
                  />
                </div>

                {project.siteLogistics?.activePlan && (
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1.5">
                      P47 Active Construction Logistics Phase
                    </label>
                    <select
                      value={
                        config.layers.activeLogisticsPhaseId ||
                        project.siteLogistics.activePlan.activePhaseId
                      }
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          layers: {
                            ...prev.layers,
                            activeLogisticsPhaseId: e.target.value,
                          },
                        }))
                      }
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg font-medium text-slate-800"
                    >
                      {project.siteLogistics.activePlan.phases.map((ph) => (
                        <option key={ph.id} value={ph.id}>
                          {ph.name} ({ph.startDateIso} to {ph.endDateIso})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* P41–P47 Layer Compatibility Table */}
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                      <th className="py-2.5 px-4">Discipline Layer</th>
                      <th className="py-2.5 px-4 text-right">Elements</th>
                      <th className="py-2.5 px-4">3D / AR Renderable</th>
                      <th className="py-2.5 px-4">Preflight Provenance & Honesty Note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {preflight.layerAvailability.map((layer) => (
                      <tr key={layer.layerKey} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 font-semibold text-slate-900">{layer.label}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-800">
                          {layer.elementCount}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`font-semibold ${
                              layer.renderableIn3DAR ? 'text-teal-800' : 'text-slate-500'
                            }`}
                          >
                            {layer.renderableIn3DAR ? 'Renderable in 3D/AR' : 'Not Present / Filtered'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-600">{layer.statusNote}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: WebXR Capability & Session Lifecycle Diagnostics */}
          {activeWorkspaceTab === 'diagnostics' && capabilityReport && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-xs">
              <div className="lg:col-span-6 space-y-4">
                <h3 className="text-base font-bold text-slate-900">
                  Live Browser & Hardware WebXR Capability Probe
                </h3>
                <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-2.5">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Readiness State:</span>
                    <span className="font-mono font-bold text-slate-900">
                      {capabilityReport.readinessState}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Recommended Mode:</span>
                    <span className="font-mono font-semibold text-teal-800">
                      {capabilityReport.recommendedMode}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Secure Context (HTTPS):</span>
                    <span className="font-mono text-slate-800">
                      {String(capabilityReport.isSecureContext)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">WebGL / WebGL2 Context:</span>
                    <span className="font-mono text-slate-800">
                      {String(capabilityReport.hasWebGL)} / {String(capabilityReport.hasWebGL2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">navigator.xr Present:</span>
                    <span className="font-mono text-slate-800">
                      {String(capabilityReport.hasNavigatorXR)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">immersive-ar Session Supported:</span>
                    <span className="font-mono font-bold text-slate-900">
                      {String(capabilityReport.immersiveArSupported)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">hit-test Feature Supported:</span>
                    <span className="font-mono text-slate-800">
                      {String(capabilityReport.hitTestSupported)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Permissions-Policy Blocked:</span>
                    <span className="font-mono text-slate-800">
                      {String(capabilityReport.permissionsPolicyBlocked)}
                    </span>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
                  <div className="font-bold text-slate-900">Privacy & Camera Access Guarantees</div>
                  <ul className="space-y-1 text-slate-600 list-disc pl-4">
                    <li>
                      Camera/XR permissions are never requested on page load (
                      <code className="font-mono">
                        cameraPermissionRequestedOnlyOnClick ={' '}
                        {String(sessionState.privacyGuard.cameraPermissionRequestedOnlyOnClick)}
                      </code>
                      ).
                    </li>
                    <li>
                      Raw camera feed frames are never captured, stored, or uploaded (
                      <code className="font-mono">
                        rawCameraFramesStoredOrUploaded ={' '}
                        {String(sessionState.privacyGuard.rawCameraFramesStoredOrUploaded)}
                      </code>
                      ).
                    </li>
                    <li>
                      Device environmental point clouds/meshes are never persisted or transmitted (
                      <code className="font-mono">
                        environmentMeshStoredOrUploaded ={' '}
                        {String(sessionState.privacyGuard.environmentMeshStoredOrUploaded)}
                      </code>
                      ).
                    </li>
                  </ul>
                </div>
              </div>

              <div className="lg:col-span-6 space-y-4">
                <h3 className="text-base font-bold text-slate-900">
                  AR Session Lifecycle State Machine & Test Harness
                </h3>
                <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-2.5">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Current Lifecycle State:</span>
                    <span className="font-mono font-bold text-teal-800">
                      {sessionState.lifecycleState}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Active Viewing Mode:</span>
                    <span className="font-mono text-slate-900">{sessionState.activeMode}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Spatial Tracking Quality:</span>
                    <span className="font-mono text-slate-900">{sessionState.trackingQuality}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Hit-Test Reticle Visible:</span>
                    <span className="font-mono text-slate-900">
                      {String(sessionState.reticleVisible)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Cleanup Completed on Teardown:</span>
                    <span className="font-mono text-slate-900">
                      {String(sessionState.cleanupCompleted)}
                    </span>
                  </div>
                </div>

                {/* State Machine Diagnostic Exercise Controls (Clearly labelled for desktop verification) */}
                <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                  <div>
                    <div className="font-bold text-slate-900">
                      State Machine Diagnostic Exercise (Simulated Lifecycle Events)
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      On non-AR desktop browsers, you can exercise the P48 controller state transitions below to verify reticle placement, tracking loss warnings, and deterministic session teardown.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        const mockCap: WebXRCapabilityReport = {
                          ...capabilityReport,
                          canAttemptImmersiveAR: true,
                          immersiveArSupported: true,
                          hitTestSupported: true,
                          readinessState: 'ready_for_immersive_ar',
                        };
                        await controllerRef.current.requestStartImmersiveAR({
                          triggeredByUserGesture: true,
                          capabilityReport: mockCap,
                          sessionAdapter: {
                            requestSession: async () => ({
                              referenceSpaceType: 'local-floor',
                              hitTestSourceAvailable: true,
                              end: async () => {},
                            }),
                          },
                        });
                        const st = controllerRef.current.updateHitTestReticle({
                          x: 0,
                          y: 0,
                          z: -2.5,
                        });
                        setSessionState(st);
                      }}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg font-semibold cursor-pointer"
                    >
                      1. Test Reticle Surface Lock (0, 0, -2.5m)
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const st = controllerRef.current.confirmModelPlacementAtReticle();
                        setSessionState(st);
                      }}
                      className="px-3 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-900 border border-teal-200 rounded-lg font-semibold cursor-pointer"
                    >
                      2. Confirm Anchor Placement
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const st = controllerRef.current.reportTrackingQuality(
                          'limited_insufficient_features'
                        );
                        setSessionState(st);
                      }}
                      className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-lg font-semibold cursor-pointer"
                    >
                      3. Test Tracking Degraded State
                    </button>

                    <button
                      type="button"
                      onClick={handleEndARSession}
                      className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-semibold cursor-pointer"
                    >
                      4. End Session & Verify Teardown
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: AR Site Dossier & Report Export */}
          {activeWorkspaceTab === 'report' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    P48 Augmented Reality Site Visualization Dossier & Audit Export
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Includes capability diagnostics, metric unit normalization proof, placement matrix, P41–P47 layer manifest, and explicit hardware/survey disclaimers.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
                    <button
                      type="button"
                      onClick={() => setExportFormat('markdown')}
                      className={`px-3 py-1 rounded-md font-semibold cursor-pointer ${
                        exportFormat === 'markdown'
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-600'
                      }`}
                    >
                      Markdown
                    </button>
                    <button
                      type="button"
                      onClick={() => setExportFormat('json')}
                      className={`px-3 py-1 rounded-md font-semibold cursor-pointer ${
                        exportFormat === 'json'
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-600'
                      }`}
                    >
                      JSON
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleCopyReport}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadReport}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-teal-400" />
                    <span>Download Report</span>
                  </button>
                </div>
              </div>

              <pre className="p-4 bg-slate-950 text-slate-100 rounded-xl text-xs font-mono overflow-x-auto max-h-96 leading-relaxed border border-slate-800">
                {exportedReportText}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
