/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * PLOTIFY — P49 Immersive VR Design Review Workspace
 * Profile Identifier: plotify-vr-design-review-p49-v1
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  ArrowLeft,
  Glasses,
  Box,
  Sliders,
  Compass,
  Layers,
  MessageSquarePlus,
  Bookmark,
  CheckCircle2,
  AlertTriangle,
  Info,
  RotateCcw,
  RotateCw,
  Eye,
  Save,
  Download,
  Trash2,
  Edit3,
  History,
  Maximize2,
  Minimize2,
  ShieldCheck,
  Navigation,
  Crosshair,
  FileCode2,
  FileSpreadsheet,
  Mountain,
  Leaf,
  CloudRain,
  Thermometer,
  Truck,
  Camera,
  Users,
  X,
} from 'lucide-react';
import { Project } from '../../types/project';
import {
  VRWorkspaceMode,
  VRScalePreset,
  VRLocomotionMode,
  VRSnapTurnDegrees,
  VRSceneOriginMode,
  VRCapabilityReport,
  VRDesignReviewConfig,
  VRRaycastSelectionResult,
  VRTeleportDestinationResult,
  VRReviewAnnotation,
  VRAnnotationCategory,
  VRAnnotationPriority,
  VRAnnotationStatus,
  VRReviewBookmark,
  VRSessionStateSnapshot,
} from '../../types/vrDesignReview';
import {
  VR_SCALE_PRESET_MULTIPLIERS,
  VR_SCALE_PRESET_DESCRIPTIONS,
  NON_ENGINEERING_RISK_DISCLAIMER,
  detectVRCapabilities,
  getSafeVRDesignReviewState,
  prepareVRModelPreflight,
  computeVRSceneTransform,
  buildVRCrossDisciplineDigests,
  buildVRDesignReviewThreeGroup,
  resolveVRControllerRayTarget,
  computeViewpointForPreset,
  createVRReviewAnnotation,
  updateVRReviewAnnotation,
  deleteVRReviewAnnotation,
  createVRReviewBookmark,
  VRSessionController,
  applyVRDesignReviewStateToProject,
  checkVRDesignReviewStaleness,
  generateVRDesignReviewReport,
  exportVRDesignReviewReport,
  disposeThreeHierarchy,
} from '../../services/vrDesignReviewService';

interface VRDesignReviewWorkspaceProps {
  project: Project | null;
  projects?: Project[];
  onSelectProject?: (project: Project) => void;
  onUpdateProject: (project: Project) => void;
  onBack: () => void;
  onOpenFloorPlan?: (project: Project) => void;
  onOpen3DViewer?: (project: Project) => void;
  onOpenIFC?: (project: Project) => void;
  onOpenCAD?: (project: Project) => void;
  onOpenTerrain?: (project: Project) => void;
  onOpenCarbon?: (project: Project) => void;
  onOpenClimateResilience?: (project: Project) => void;
  onOpenEnvelopePerformance?: (project: Project) => void;
  onOpenSiteLogistics?: (project: Project) => void;
  onOpenARSite?: (project: Project) => void;
  onOpenLiveCollaboration?: (project: Project) => void;
  onOpenVersionWorkspace?: (
    project: Project,
    tab?: 'timeline' | 'diff' | 'recovery' | 'collaboration'
  ) => void;
  onShowToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

type InspectorTab = 'navigate' | 'layers' | 'annotations' | 'diagnostics';
type CanvasPointerMode = 'inspect-select' | 'teleport-target';

export const VRDesignReviewWorkspace: React.FC<VRDesignReviewWorkspaceProps> = ({
  project,
  projects = [],
  onSelectProject,
  onUpdateProject,
  onBack,
  onOpenFloorPlan,
  onOpen3DViewer,
  onOpenIFC,
  onOpenCAD,
  onOpenTerrain,
  onOpenCarbon,
  onOpenClimateResilience,
  onOpenEnvelopePerformance,
  onOpenSiteLogistics,
  onOpenARSite,
  onOpenLiveCollaboration,
  onOpenVersionWorkspace,
  onShowToast,
}) => {
  const safeInitial = useMemo(() => getSafeVRDesignReviewState(project), [project]);

  const [config, setConfig] = useState<VRDesignReviewConfig>(safeInitial.config);
  const [annotations, setAnnotations] = useState<VRReviewAnnotation[]>(safeInitial.annotations);
  const [bookmarks, setBookmarks] = useState<VRReviewBookmark[]>(safeInitial.bookmarks);
  const [capability, setCapability] = useState<VRCapabilityReport | null>(null);
  const [activeInspectorTab, setActiveInspectorTab] = useState<InspectorTab>('navigate');
  const [pointerMode, setPointerMode] = useState<CanvasPointerMode>('inspect-select');
  const [isBottomDockCollapsed, setIsBottomDockCollapsed] = useState(false);

  // Selection & Teleport state
  const [selectedTarget, setSelectedTarget] = useState<VRRaycastSelectionResult | null>(null);
  const [lastTeleportResult, setLastTeleportResult] = useState<VRTeleportDestinationResult | null>(
    null
  );

  // Annotation form state
  const [noteTitle, setNoteTitle] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const [noteCategory, setNoteCategory] = useState<VRAnnotationCategory>(
    'spatial-layout-observation'
  );
  const [notePriority, setNotePriority] = useState<VRAnnotationPriority>('medium');
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null);
  const [annotationToConfirmDelete, setAnnotationToConfirmDelete] = useState<string | null>(null);
  const [annotationFilterStatus, setAnnotationFilterStatus] = useState<VRAnnotationStatus | 'all'>(
    'all'
  );

  // Bookmark form state
  const [bookmarkLabel, setBookmarkLabel] = useState('');

  // Export modal state
  const [exportModalFormat, setExportModalFormat] = useState<'markdown' | 'json' | null>(null);

  // Session controller ref
  const sessionControllerRef = useRef<VRSessionController | null>(null);
  if (!sessionControllerRef.current) {
    sessionControllerRef.current = new VRSessionController(project || undefined, config);
  }
  const [sessionState, setSessionState] = useState<VRSessionStateSnapshot>(() =>
    sessionControllerRef.current!.getState()
  );

  // Sync when project changes
  useEffect(() => {
    const nextSafe = getSafeVRDesignReviewState(project);
    setConfig(nextSafe.config);
    setAnnotations(nextSafe.annotations);
    setBookmarks(nextSafe.bookmarks);
    setSelectedTarget(null);
    setLastTeleportResult(null);
  }, [project?.id]);

  // Subscribe to session controller state updates
  useEffect(() => {
    const controller = sessionControllerRef.current!;
    const unsubscribe = controller.subscribe((snap) => {
      setSessionState(snap);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  // Unmount cleanup
  useEffect(() => {
    return () => {
      sessionControllerRef.current?.dispose();
    };
  }, []);

  // Run WebXR 'immersive-vr' capability check on mount
  const runCapabilityProbe = useCallback(async () => {
    const report = await detectVRCapabilities();
    setCapability(report);
    return report;
  }, []);

  useEffect(() => {
    runCapabilityProbe();
  }, [runCapabilityProbe]);

  // Derived preflight, transform, staleness, and cross-discipline digests
  const preflight = useMemo(
    () => prepareVRModelPreflight(project, config),
    [project, config]
  );

  const transform = useMemo(
    () =>
      project
        ? computeVRSceneTransform(project, config)
        : null,
    [project, config]
  );

  const staleness = useMemo(
    () => checkVRDesignReviewStaleness(project),
    [project, annotations]
  );

  const crossDisciplineDigests = useMemo(
    () => buildVRCrossDisciplineDigests(project),
    [project]
  );

  // Three.js viewport refs
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const modelRootRef = useRef<THREE.Group | null>(null);
  const teleportRingRef = useRef<THREE.Mesh | null>(null);
  const selectionBoxHelperRef = useRef<THREE.BoxHelper | null>(null);
  const requestRenderRef = useRef<(() => void) | null>(null);

  // Keep latest callbacks/state in refs for canvas click handler
  const pointerModeRef = useRef<CanvasPointerMode>(pointerMode);
  pointerModeRef.current = pointerMode;
  const projectRef = useRef<Project | null>(project);
  projectRef.current = project;
  const configRef = useRef<VRDesignReviewConfig>(config);
  configRef.current = config;

  // Initialize Three.js WebGLRenderer & Scene once per project presence
  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container || !project) return;

    let frameId = 0;
    let isDisposed = false;

    // Detect software WebGL from GPU string (never UA)
    const isSoftwareGl = (() => {
      try {
        const probeCanvas = document.createElement('canvas');
        const gl = (probeCanvas.getContext('webgl2') ||
          probeCanvas.getContext('webgl')) as WebGLRenderingContext | null;
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
    } catch {
      return;
    }

    const width = Math.max(320, container.clientWidth || 800);
    const height = Math.max(260, container.clientHeight || 520);
    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);
    scene.fog = new THREE.FogExp2(0x0f172a, 0.008);
    sceneRef.current = scene;

    // Studio environment reflection via RoomEnvironment
    try {
      const pmremGenerator = new THREE.PMREMGenerator(renderer);
      scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
      pmremGenerator.dispose();
    } catch {
      // Fallback if PMREM fails
    }

    // Balanced 3-point architectural lighting rig
    const hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x1e293b, 0.85);
    hemiLight.position.set(0, 30, 0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfffbeb, 1.35);
    keyLight.position.set(22, 36, 24);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.45);
    rimLight.position.set(-24, 18, -20);
    scene.add(rimLight);

    // Reference metric ground grid
    const gridHelper = new THREE.GridHelper(80, 80, 0x14b8a6, 0x1e293b);
    gridHelper.position.y = -0.02;
    gridHelper.name = 'VR_ReferenceMetricGrid';
    scene.add(gridHelper);

    // Teleport target indicator ring
    const ringGeo = new THREE.RingGeometry(0.28, 0.42, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x14b8a6,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const teleportRing = new THREE.Mesh(ringGeo, ringMat);
    teleportRing.rotation.x = -Math.PI / 2;
    teleportRing.position.set(0, 0.03, 0);
    teleportRing.visible = false;
    scene.add(teleportRing);
    teleportRingRef.current = teleportRing;

    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 500);
    const initVp = computeViewpointForPreset(project, configRef.current, 'overview');
    camera.position.set(
      initVp.cameraPositionMetres.x,
      initVp.cameraPositionMetres.y,
      initVp.cameraPositionMetres.z
    );
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.maxDistance = 220;
    controls.minDistance = 0.3;
    controls.target.set(
      initVp.lookAtTargetMetres.x,
      initVp.lookAtTargetMetres.y,
      initVp.lookAtTargetMetres.z
    );
    controls.update();
    controlsRef.current = controls;

    // Coalesced on-demand render scheduler
    let renderBusy = false;
    let renderDirty = false;

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (gl && typeof gl.fenceSync === 'function') {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (isDisposed) return;
          const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (state === gl.UNSIGNALED) {
            frameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            frameId = window.setTimeout(cb, 80);
          }
        };
        frameId = window.setTimeout(poll, 5);
      } else {
        frameId = window.setTimeout(cb, 80);
      }
    };

    const requestRender = () => {
      if (isDisposed) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        if (isDisposed) return;
        renderDirty = false;
        controls.update();
        renderer.render(scene, camera);
        const done = () => {
          renderBusy = false;
          if (renderDirty) requestRender();
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    };

    requestRenderRef.current = requestRender;
    controls.addEventListener('change', requestRender);

    // Handle pointer click for raycast inspection or teleport destination
    let downX = 0;
    let downY = 0;
    const onPointerDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
    };

    const onPointerUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;
      const curProj = projectRef.current;
      const curCfg = configRef.current;
      const rootGroup = modelRootRef.current;
      if (!curProj || !rootGroup) return;

      const rect = renderer.domElement.getBoundingClientRect();
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);

      const result = resolveVRControllerRayTarget(
        rootGroup,
        {
          x: raycaster.ray.origin.x,
          y: raycaster.ray.origin.y,
          z: raycaster.ray.origin.z,
        },
        {
          x: raycaster.ray.direction.x,
          y: raycaster.ray.direction.y,
          z: raycaster.ray.direction.z,
        },
        curProj,
        curCfg
      );

      if (pointerModeRef.current === 'teleport-target' && result.hit && result.hitPointWorldMetres) {
        const tpRes = sessionControllerRef.current!.applyTeleport(
          curProj,
          curCfg,
          result.hitPointWorldMetres
        );
        setLastTeleportResult(tpRes);

        if (teleportRingRef.current) {
          teleportRingRef.current.visible = true;
          teleportRingRef.current.position.set(
            result.hitPointWorldMetres.x,
            result.hitPointWorldMetres.y + 0.04,
            result.hitPointWorldMetres.z
          );
          (teleportRingRef.current.material as THREE.MeshBasicMaterial).color.setHex(
            tpRes.isValid ? 0x10b981 : 0xef4444
          );
        }

        if (tpRes.isValid && tpRes.eyePositionWorldMetres && tpRes.destinationWorldMetres) {
          camera.position.set(
            tpRes.eyePositionWorldMetres.x,
            tpRes.eyePositionWorldMetres.y,
            tpRes.eyePositionWorldMetres.z + 0.8
          );
          controls.target.set(
            tpRes.destinationWorldMetres.x,
            tpRes.eyePositionWorldMetres.y * 0.9,
            tpRes.destinationWorldMetres.z
          );
          controls.update();
        }
        requestRender();
        return;
      }

      // Inspect / Select mode
      setSelectedTarget(result.hit ? result : null);
      sessionControllerRef.current!.recordRaycastSelection(result.hit ? result : null);
      requestRender();
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    const onResize = () => {
      if (!container || isDisposed) return;
      const w = Math.max(320, container.clientWidth);
      const h = Math.max(260, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    };
    window.addEventListener('resize', onResize);

    requestRender();

    return () => {
      isDisposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      controls.dispose();
      if (modelRootRef.current) {
        disposeThreeHierarchy(modelRootRef.current);
      }
      renderer.dispose();
    };
  }, [project?.id]);

  // Rebuild / update the normalized 3D VR model group whenever project, config, or annotations change
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !project) return;

    if (modelRootRef.current) {
      scene.remove(modelRootRef.current);
      disposeThreeHierarchy(modelRootRef.current);
      modelRootRef.current = null;
    }

    if (selectionBoxHelperRef.current) {
      scene.remove(selectionBoxHelperRef.current);
      selectionBoxHelperRef.current = null;
    }

    const gridObj = scene.getObjectByName('VR_ReferenceMetricGrid');
    if (gridObj) {
      gridObj.visible = config.layers.showNavigationTeleportGrid;
    }

    const built = buildVRDesignReviewThreeGroup(project, config, annotations);
    modelRootRef.current = built.rootGroup;
    scene.add(built.rootGroup);

    requestRenderRef.current?.();
  }, [project, config, annotations]);

  // Handlers for camera viewpoints & locomotion
  const handleJumpToViewpoint = (
    preset: 'overview' | 'room-interior' | 'floor-level' | 'default-origin',
    targetIdOrFloor?: string | number
  ) => {
    if (!project || !cameraRef.current || !controlsRef.current) return;
    const vp = computeViewpointForPreset(project, config, preset, targetIdOrFloor);
    cameraRef.current.position.set(
      vp.cameraPositionMetres.x,
      vp.cameraPositionMetres.y,
      vp.cameraPositionMetres.z
    );
    controlsRef.current.target.set(
      vp.lookAtTargetMetres.x,
      vp.lookAtTargetMetres.y,
      vp.lookAtTargetMetres.z
    );
    controlsRef.current.update();
    requestRenderRef.current?.();
    onShowToast?.(vp.description, 'info');
  };

  const handleSnapTurn = (direction: 'left' | 'right', degrees?: VRSnapTurnDegrees) => {
    const inc = degrees || config.navigation.snapTurnDegrees;
    const nextYaw = sessionControllerRef.current!.applySnapTurn(direction, inc);
    setConfig((prev) => ({
      ...prev,
      yawDegrees: nextYaw,
    }));
  };

  const handleStartImmersiveVR = async () => {
    if (!project) return;
    const freshCap = await runCapabilityProbe();
    const snap = await sessionControllerRef.current!.startImmersiveVRSession({
      userGestureConfirmed: true,
      project,
      config,
      capabilityReport: freshCap,
      renderer: rendererRef.current,
    });
    if (snap.phase === 'immersive-vr-active') {
      onShowToast?.('Immersive VR Design Review session started.', 'success');
    } else if (snap.lastErrorMessage) {
      onShowToast?.(snap.lastErrorMessage, 'error');
    }
  };

  const handleExitImmersiveVR = async () => {
    await sessionControllerRef.current!.exitImmersiveVRSession(
      'Exited Immersive VR; restored Standard 3D Design Review.'
    );
    requestRenderRef.current?.();
    onShowToast?.('Exited Immersive VR and restored Standard 3D Design Review.', 'info');
  };

  const handleSwitchMode = (mode: VRWorkspaceMode) => {
    if (mode === 'immersive_vr_webxr') {
      handleStartImmersiveVR();
      return;
    }
    sessionControllerRef.current!.switchWorkspaceMode(mode);
    setConfig((prev) => ({
      ...prev,
      preferredMode: mode,
    }));
  };

  // Annotation handlers
  const handleCreateOrUpdateAnnotation = () => {
    if (!project) return;

    if (editingAnnotationId) {
      const targetNote = annotations.find((a) => a.annotationId === editingAnnotationId);
      if (!targetNote) return;
      const res = updateVRReviewAnnotation(
        targetNote,
        {
          title: noteTitle,
          note: noteBody,
          category: noteCategory,
          priority: notePriority,
        },
        project
      );
      if (res.error || !res.annotation) {
        onShowToast?.(res.error || 'Failed to update annotation.', 'error');
        return;
      }
      setAnnotations((prev) =>
        prev.map((a) => (a.annotationId === editingAnnotationId ? res.annotation! : a))
      );
      setEditingAnnotationId(null);
      setNoteTitle('');
      setNoteBody('');
      onShowToast?.('Review annotation updated.', 'success');
      return;
    }

    const res = createVRReviewAnnotation(
      project,
      config,
      {
        title: noteTitle,
        note: noteBody,
        category: noteCategory,
        priority: notePriority,
        targetElementId: selectedTarget?.targetMetadata?.elementId,
        targetElementType: selectedTarget?.targetMetadata?.elementType,
        targetRoomId: selectedTarget?.targetMetadata?.roomId,
        targetFloorLevel:
          selectedTarget?.targetMetadata?.floorLevel ||
          (typeof config.layers.selectedFloor === 'number' ? config.layers.selectedFloor : 1),
        anchorPositionLocalPlotUnits: selectedTarget?.hitPointLocalPlotUnits || undefined,
      },
      sessionState.sessionId
    );

    if (res.error || !res.annotation) {
      onShowToast?.(res.error || 'Please provide both a title and a review note.', 'error');
      return;
    }

    setAnnotations((prev) => [res.annotation!, ...prev]);
    setNoteTitle('');
    setNoteBody('');
    onShowToast?.(`Added review note "${res.annotation.title}".`, 'success');
  };

  const handleConfirmDeleteAnnotation = (annotationId: string) => {
    setAnnotations((prev) => deleteVRReviewAnnotation(prev, annotationId));
    setAnnotationToConfirmDelete(null);
    if (editingAnnotationId === annotationId) {
      setEditingAnnotationId(null);
      setNoteTitle('');
      setNoteBody('');
    }
    onShowToast?.('Review annotation removed.', 'info');
  };

  const handleToggleAnnotationStatus = (
    annotationId: string,
    nextStatus: VRAnnotationStatus
  ) => {
    if (!project) return;
    setAnnotations((prev) =>
      prev.map((a) => {
        if (a.annotationId !== annotationId) return a;
        const res = updateVRReviewAnnotation(a, { status: nextStatus }, project);
        return res.annotation || a;
      })
    );
  };

  const handleFocusAnnotationIn3D = (note: VRReviewAnnotation) => {
    if (!project || !cameraRef.current || !controlsRef.current || !transform) return;
    const localCentered = new THREE.Vector3(
      note.anchorPositionLocalPlotUnits.x - project.plotWidth / 2,
      note.anchorPositionLocalPlotUnits.y,
      note.anchorPositionLocalPlotUnits.z - project.plotLength / 2
    );
    const mat = new THREE.Matrix4().fromArray(transform.worldMatrix4x4);
    const worldPt = localCentered.applyMatrix4(mat);

    cameraRef.current.position.set(
      worldPt.x + 2.5 * transform.scaleMultiplier,
      worldPt.y + transform.eyeHeightMetres,
      worldPt.z + 3.2 * transform.scaleMultiplier
    );
    controlsRef.current.target.set(worldPt.x, worldPt.y + 0.6 * transform.scaleMultiplier, worldPt.z);
    controlsRef.current.update();
    requestRenderRef.current?.();
  };

  // Bookmark handlers
  const handleSaveCurrentBookmark = () => {
    if (!project || !cameraRef.current || !controlsRef.current) return;
    const bm = createVRReviewBookmark(project, config, {
      label:
        bookmarkLabel.trim() ||
        `Viewpoint ${bookmarks.length + 1} (${config.scalePreset})`,
      presetType: 'custom-viewpoint',
      targetFloorLevel: config.layers.selectedFloor,
      customCameraPositionMetres: {
        x: Number(cameraRef.current.position.x.toFixed(3)),
        y: Number(cameraRef.current.position.y.toFixed(3)),
        z: Number(cameraRef.current.position.z.toFixed(3)),
      },
      customLookAtTargetMetres: {
        x: Number(controlsRef.current.target.x.toFixed(3)),
        y: Number(controlsRef.current.target.y.toFixed(3)),
        z: Number(controlsRef.current.target.z.toFixed(3)),
      },
    });
    setBookmarks((prev) => [bm, ...prev]);
    setBookmarkLabel('');
    onShowToast?.(`Saved viewpoint bookmark "${bm.label}".`, 'success');
  };

  const handleApplyBookmark = (bm: VRReviewBookmark) => {
    if (!cameraRef.current || !controlsRef.current) return;
    setConfig((prev) => ({
      ...prev,
      scalePreset: bm.scalePreset,
      layers: {
        ...prev.layers,
        selectedFloor: bm.targetFloorLevel,
      },
    }));
    cameraRef.current.position.set(
      bm.cameraPositionMetres.x,
      bm.cameraPositionMetres.y,
      bm.cameraPositionMetres.z
    );
    controlsRef.current.target.set(
      bm.lookAtTargetMetres.x,
      bm.lookAtTargetMetres.y,
      bm.lookAtTargetMetres.z
    );
    controlsRef.current.update();
    requestRenderRef.current?.();
    onShowToast?.(`Restored bookmark "${bm.label}".`, 'info');
  };

  // Save P49 Review State to Project with Pre-Apply Snapshot
  const handlePersistReviewState = () => {
    if (!project) return;
    try {
      const { updatedProject } = applyVRDesignReviewStateToProject(
        project,
        {
          config,
          annotations,
          bookmarks,
          capabilityReport: capability || undefined,
        },
        true
      );
      onUpdateProject(updatedProject);
      onShowToast?.(
        `Saved P49 VR Design Review state (${annotations.length} note(s), ${bookmarks.length} bookmark(s)) with rollback checkpoint.`,
        'success'
      );
    } catch (err: any) {
      onShowToast?.(err?.message || 'Failed to save VR Design Review state.', 'error');
    }
  };

  // Empty project fallback (Group I)
  if (!project) {
    return (
      <div className="max-w-3xl mx-auto mt-12 bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-4 shadow-xs">
        <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-600 mx-auto flex items-center justify-center">
          <Glasses className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">
          No Project Selected for VR Design Review
        </h2>
        <p className="text-xs text-slate-600 max-w-md mx-auto">
          Select a valid Plotify project to inspect its 3D architectural model, switch review
          scales, evaluate P41–P48 layers, and record model-anchored review annotations.
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={onBack}
            className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            Return to Projects
          </button>
        </div>
      </div>
    );
  }

  const rooms = project.floorPlan?.rooms || [];
  const availableFloors = Array.from(
    new Set(rooms.map((r) => r.floorLevel || 1).concat([1]))
  ).sort((a, b) => a - b);

  const filteredAnnotations =
    annotationFilterStatus === 'all'
      ? annotations
      : annotations.filter((a) => a.status === annotationFilterStatus);

  const exportedReportText = useMemo(() => {
    if (!exportModalFormat || !capability) return '';
    const rep = generateVRDesignReviewReport(
      project,
      config,
      capability,
      sessionState,
      annotations,
      bookmarks
    );
    return exportVRDesignReviewReport(rep, exportModalFormat);
  }, [exportModalFormat, project, config, capability, sessionState, annotations, bookmarks]);

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      {/* Top Workspace Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1.5 font-semibold text-slate-700 hover:text-slate-900 transition-colors cursor-pointer whitespace-nowrap"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>
            <span aria-hidden="true">·</span>
            <span>P49 Immersive VR Design Review</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono text-[11px] text-slate-600">
              plotify-vr-design-review-p49-v1
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              {project.name}
            </h2>
            {projects.length > 1 && onSelectProject && (
              <select
                aria-label="Select Project for VR Design Review"
                value={project.id}
                onChange={(e) => {
                  const found = projects.find((p) => p.id === e.target.value);
                  if (found) onSelectProject(found);
                }}
                className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 font-medium"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.plotWidth}×{p.plotLength} {p.unit})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 tabular-nums">
            <span>
              Plot: {project.plotWidth} × {project.plotLength} {project.unit} (
              {preflight.plotDimensionsMetresAt1To1.widthM} m ×{' '}
              {preflight.plotDimensionsMetresAt1To1.lengthM} m at 1:1)
            </span>
            <span aria-hidden="true">·</span>
            <span>Scale: {config.scalePreset}</span>
            <span aria-hidden="true">·</span>
            <span>Rooms: {preflight.validRoomCount}</span>
            <span aria-hidden="true">·</span>
            <span>Saved Notes: {annotations.length}</span>
          </div>
        </div>

        {/* Primary Workspace Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {onOpenLiveCollaboration && (
            <button
              onClick={() => onOpenLiveCollaboration(project)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors cursor-pointer"
              title="Open P50 Live Multi-User Design Collaboration Workspace"
            >
              <Users className="w-3.5 h-3.5 text-teal-700" />
              <span>P50 Live Collaboration</span>
            </button>
          )}
          {sessionState.phase === 'immersive-vr-active' ? (
            <button
              onClick={handleExitImmersiveVR}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <X className="w-4 h-4" />
              <span>Exit Immersive VR</span>
            </button>
          ) : (
            <button
              onClick={handleStartImmersiveVR}
              disabled={!capability?.immersiveVRSupported || !preflight.isReady}
              title={
                !capability?.immersiveVRSupported
                  ? capability?.statusSummary || 'Immersive VR not supported on this browser/device'
                  : !preflight.isReady
                  ? preflight.blockingErrors.join(' ')
                  : 'Launch WebXR Immersive VR Session'
              }
              className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                capability?.immersiveVRSupported && preflight.isReady
                  ? 'bg-teal-700 hover:bg-teal-800 text-white cursor-pointer'
                  : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
              }`}
            >
              <Glasses className="w-4 h-4" />
              <span>
                {capability?.immersiveVRSupported
                  ? 'Start Immersive VR (Mode A)'
                  : 'Immersive VR Unavailable (Mode B Active)'}
              </span>
            </button>
          )}

          <button
            onClick={handlePersistReviewState}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <Save className="w-3.5 h-3.5 text-teal-400" />
            <span>Save Review State</span>
          </button>

          <button
            onClick={() => setExportModalFormat('markdown')}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Report</span>
          </button>

          {onOpenVersionWorkspace && (
            <button
              onClick={() => onOpenVersionWorkspace(project, 'timeline')}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <History className="w-3.5 h-3.5" />
              <span>Checkpoints</span>
            </button>
          )}
        </div>
      </div>

      {/* Explicit Non-Survey / Non-Engineering Provenance & Capability Banner */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs text-slate-700">
        <div className="flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <div className="font-semibold text-slate-900">
              Virtual Design Review Only — Not a Survey, Setting-Out Instrument, or Certified Engineering Simulation
            </div>
            <p className="text-slate-600 leading-relaxed">
              P49 renders normalized project geometry in a virtual scene (
              <code className="text-[11px] font-mono">isGeospatiallyRegistered: false</code>).
              Semantic layers (P44–P47) and user observation priorities do not substitute for
              licensed structural, thermal, fire, or site-safety verification.{' '}
              <span className="font-medium text-slate-800">
                {capability?.statusSummary || 'Checking WebXR capability...'}
              </span>
            </p>
          </div>
        </div>

        {/* Mode A / Mode B / Mode C Switcher */}
        <div
          role="group"
          aria-label="VR Review Workspace Mode Selector"
          className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg shrink-0 self-start md:self-center"
        >
          <button
            onClick={() => handleSwitchMode('immersive_vr_webxr')}
            disabled={!capability?.immersiveVRSupported || !preflight.isReady}
            className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              sessionState.activeMode === 'immersive_vr_webxr'
                ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                : capability?.immersiveVRSupported && preflight.isReady
                ? 'text-slate-700 hover:text-slate-900 cursor-pointer'
                : 'text-slate-400 cursor-not-allowed'
            }`}
          >
            Mode A: Immersive VR
          </button>
          <button
            onClick={() => handleSwitchMode('standard_3d_design_review')}
            className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              sessionState.activeMode === 'standard_3d_design_review'
                ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                : 'text-slate-700 hover:text-slate-900'
            }`}
          >
            Mode B: Standard 3D Review
          </button>
          <button
            onClick={() => handleSwitchMode('review_setup_calibration')}
            className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              sessionState.activeMode === 'review_setup_calibration'
                ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                : 'text-slate-700 hover:text-slate-900'
            }`}
          >
            Mode C: Setup & Calibration
          </button>
        </div>
      </div>

      {/* Stale Data or Preflight Blocking Banner */}
      {(staleness.isStale || !preflight.isReady || preflight.validationWarnings.length > 0) && (
        <div className="bg-amber-50/90 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-950 space-y-1.5">
          {!preflight.isReady && (
            <div className="flex items-start gap-2 font-semibold text-rose-800">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                Preflight Blocked: {preflight.blockingErrors.join(' ')}
              </div>
            </div>
          )}
          {staleness.isStale && (
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <span>
                  <strong>Stale Review State Detected:</strong> {staleness.reason} (
                  {staleness.staleAnnotationCount} stale anchor(s),{' '}
                  {staleness.unresolvedAnnotationCount} unresolved removed target(s)).
                </span>
              </div>
              <button
                onClick={handlePersistReviewState}
                className="px-2.5 py-1 bg-amber-900 text-white rounded-md font-semibold hover:bg-amber-800 transition-colors whitespace-nowrap cursor-pointer"
              >
                Re-Verify & Save Fingerprint
              </button>
            </div>
          )}
          {preflight.validationWarnings.map((w, idx) => (
            <div key={idx} className="flex items-start gap-2 text-amber-900">
              <Info className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* Main Split Layout: 3D/VR Viewport (Left 7 cols) + Progressive Disclosure Inspector (Right 5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column: 3D / VR Viewport Container */}
        <div className="lg:col-span-7 bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-sm relative flex flex-col">
          {/* Top Viewport Status Overlay Bar (No backdrop-blur over WebGL canvas) */}
          <div className="bg-slate-950/90 border-b border-slate-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-200 z-10">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-teal-400">
                {sessionState.activeMode === 'immersive_vr_webxr'
                  ? 'Mode A: Immersive VR Active'
                  : sessionState.activeMode === 'review_setup_calibration'
                  ? 'Mode C: Review Setup & Calibration (Non-Immersive)'
                  : 'Mode B: Standard 3D Design Review (Non-Immersive)'}
              </span>
              <span aria-hidden="true" className="text-slate-600">
                ·
              </span>
              <span className="font-mono text-[11px] text-slate-300 tabular-nums">
                Scale {config.scalePreset} ({transform?.combinedScaleFactor.toFixed(4)} m/unit)
              </span>
              <span aria-hidden="true" className="text-slate-600">
                ·
              </span>
              <span className="text-slate-300">
                Floor:{' '}
                {config.layers.selectedFloor === 'all'
                  ? 'All Floors'
                  : `Floor ${config.layers.selectedFloor}`}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPointerMode('inspect-select')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  pointerMode === 'inspect-select'
                    ? 'bg-teal-600 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <Crosshair className="w-3 h-3" />
                <span>Ray / Click Inspect</span>
              </button>
              <button
                onClick={() => setPointerMode('teleport-target')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  pointerMode === 'teleport-target'
                    ? 'bg-teal-600 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <Navigation className="w-3 h-3" />
                <span>Teleport to Floor</span>
              </button>
            </div>
          </div>

          {/* Dedicated Empty Ref Container for Three.js WebGL Canvas */}
          <div
            ref={canvasMountRef}
            className="w-full h-[500px] bg-slate-950 relative"
            aria-label="P49 Interactive 3D and WebXR Design Review Viewport"
          />

          {/* Selected Element / Teleport Feedback Bar */}
          <div className="bg-slate-950 border-t border-slate-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300">
            <div className="truncate max-w-xl">
              {selectedTarget?.hit && selectedTarget.targetMetadata ? (
                <span>
                  <strong className="text-teal-400">Selected:</strong>{' '}
                  {selectedTarget.targetMetadata.label} [
                  {selectedTarget.targetMetadata.sourceModule}]
                  {selectedTarget.targetMetadata.ifcProvenance
                    ? ` · IFC GlobalId: ${selectedTarget.targetMetadata.ifcProvenance.globalId}`
                    : ''}
                </span>
              ) : lastTeleportResult ? (
                <span>
                  <strong
                    className={
                      lastTeleportResult.isValid ? 'text-emerald-400' : 'text-rose-400'
                    }
                  >
                    Teleport {lastTeleportResult.isValid ? 'Valid' : 'Blocked'}:
                  </strong>{' '}
                  {lastTeleportResult.message}
                </span>
              ) : (
                <span className="text-slate-400">
                  {pointerMode === 'inspect-select'
                    ? 'Click any room, wall, column, terrain surface, or overlay in the 3D scene to inspect or anchor a review note.'
                    : 'Click on a walkable room floor or plot slab to test comfort teleportation.'}
                </span>
              )}
            </div>

            {selectedTarget?.hit && selectedTarget.targetMetadata && (
              <div className="flex items-center gap-2 shrink-0">
                {selectedTarget.targetMetadata.roomId && (
                  <button
                    onClick={() =>
                      setConfig((prev) => ({
                        ...prev,
                        layers: {
                          ...prev.layers,
                          isolatedElementId:
                            prev.layers.isolatedElementId ===
                            selectedTarget.targetMetadata!.roomId
                              ? null
                              : selectedTarget.targetMetadata!.roomId!,
                        },
                      }))
                    }
                    className="px-2 py-1 text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-teal-300 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                  >
                    {config.layers.isolatedElementId === selectedTarget.targetMetadata.roomId
                      ? 'Show All Rooms'
                      : 'Isolate Room'}
                  </button>
                )}
                <button
                  onClick={() => {
                    setActiveInspectorTab('annotations');
                    if (!noteTitle && selectedTarget.targetMetadata) {
                      setNoteTitle(`Observation: ${selectedTarget.targetMetadata.label}`);
                    }
                  }}
                  className="px-2 py-1 text-[11px] font-medium bg-teal-700 hover:bg-teal-600 text-white rounded-md transition-colors cursor-pointer whitespace-nowrap"
                >
                  Annotate Target
                </button>
              </div>
            )}
          </div>

          {/* Collapsible Bottom Control Dock */}
          <div className="bg-slate-900 border-t border-slate-800 px-4 py-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-400">
                Quick Locomotion & Camera Presets
              </span>
              <button
                onClick={() => setIsBottomDockCollapsed((prev) => !prev)}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-300 hover:text-white cursor-pointer"
              >
                {isBottomDockCollapsed ? (
                  <>
                    <Maximize2 className="w-3 h-3" />
                    <span>Show Controls</span>
                  </>
                ) : (
                  <>
                    <Minimize2 className="w-3 h-3" />
                    <span>Hide Controls</span>
                  </>
                )}
              </button>
            </div>

            {!isBottomDockCollapsed && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    onClick={() => handleJumpToViewpoint('overview')}
                    className="px-2.5 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Overview
                  </button>
                  <button
                    onClick={() => handleJumpToViewpoint('default-origin')}
                    className="px-2.5 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Recenter Origin
                  </button>
                  {rooms.length > 0 && (
                    <select
                      aria-label="Enter Room Walkthrough"
                      onChange={(e) => {
                        if (e.target.value) {
                          handleJumpToViewpoint('room-interior', e.target.value);
                        }
                      }}
                      defaultValue=""
                      className="px-2.5 py-1.5 text-xs bg-slate-800 border border-slate-700 text-slate-200 rounded-lg"
                    >
                      <option value="" disabled>
                        Enter Room...
                      </option>
                      {rooms.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} (F{r.floorLevel})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Snap-Turn Controls */}
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleSnapTurn('left')}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                    title={`Snap Turn Left (${config.navigation.snapTurnDegrees}°)`}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>-{config.navigation.snapTurnDegrees}°</span>
                  </button>
                  <button
                    onClick={() => handleSnapTurn('right')}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                    title={`Snap Turn Right (${config.navigation.snapTurnDegrees}°)`}
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    <span>+{config.navigation.snapTurnDegrees}°</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Progressive Disclosure Inspector (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
          {/* Inspector Navigation Tabs */}
          <div className="grid grid-cols-4 border-b border-slate-200 bg-slate-50 p-1 gap-1">
            <button
              onClick={() => setActiveInspectorTab('navigate')}
              className={`py-2 px-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                activeInspectorTab === 'navigate'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              1. Scale & Comfort
            </button>
            <button
              onClick={() => setActiveInspectorTab('layers')}
              className={`py-2 px-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                activeInspectorTab === 'layers'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              2. Layers (P41–P48)
            </button>
            <button
              onClick={() => setActiveInspectorTab('annotations')}
              className={`py-2 px-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                activeInspectorTab === 'annotations'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              3. Notes ({annotations.length})
            </button>
            <button
              onClick={() => setActiveInspectorTab('diagnostics')}
              className={`py-2 px-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                activeInspectorTab === 'diagnostics'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              4. Diagnostics
            </button>
          </div>

          {/* Tab 1: Scale, Orientation, Locomotion & Bookmarks */}
          {activeInspectorTab === 'navigate' && (
            <div className="p-4 space-y-5 text-xs max-h-[600px] overflow-y-auto">
              {/* Review Scale Presets */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-900">
                    Architectural Review Scale Preset
                  </label>
                  <span className="text-slate-500 font-mono text-[11px]">
                    Basis: {transform?.scaleDerivationBasis}
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-1.5">
                  {(['1:1', '1:10', '1:20', '1:50', '1:100'] as VRScalePreset[]).map((preset) => (
                    <button
                      key={preset}
                      onClick={() =>
                        setConfig((prev) => ({
                          ...prev,
                          scalePreset: preset,
                        }))
                      }
                      className={`py-2 px-2 rounded-lg font-mono font-semibold text-xs border transition-colors cursor-pointer ${
                        config.scalePreset === preset
                          ? 'bg-teal-50 border-teal-600 text-teal-950'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-500">
                  {VR_SCALE_PRESET_DESCRIPTIONS[config.scalePreset]}
                </p>
              </div>

              {/* Scene Origin & Orientation Calibration */}
              <div className="space-y-2.5 pt-3 border-t border-slate-100">
                <div className="font-bold text-slate-900">
                  Virtual Scene Origin & Orientation Calibration
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">
                      Anchor Origin Mode
                    </label>
                    <select
                      aria-label="Virtual Scene Origin Mode"
                      value={config.originMode}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          originMode: e.target.value as VRSceneOriginMode,
                        }))
                      }
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                    >
                      <option value="plot_center">Plot Center (Default)</option>
                      <option value="plot_southwest_corner">Plot Southwest Corner</option>
                      <option value="building_footprint_center">Building Footprint Center</option>
                      <option value="first_room_interior">First Room Interior</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">
                      Floor Level Filter
                    </label>
                    <select
                      aria-label="Floor Level Filter"
                      value={String(config.layers.selectedFloor)}
                      onChange={(e) => {
                        const val =
                          e.target.value === 'all' ? 'all' : Number(e.target.value);
                        setConfig((prev) => ({
                          ...prev,
                          layers: {
                            ...prev.layers,
                            selectedFloor: val,
                          },
                        }));
                      }}
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                    >
                      <option value="all">All Floors ({preflight.floorCount})</option>
                      {availableFloors.map((fl) => (
                        <option key={fl} value={fl}>
                          Floor {fl} Only
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Source Unit Confirmation Check */}
                <label className="flex items-center gap-2 pt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.userConfirmedSourceUnits}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        userConfirmedSourceUnits: e.target.checked,
                      }))
                    }
                    className="rounded border-slate-300 text-teal-600"
                  />
                  <span className="text-slate-700">
                    Confirm source project measurement unit is{' '}
                    <strong>{project.unit}</strong> (1 {project.unit} ={' '}
                    {transform?.unitToMetresFactor} m)
                  </span>
                </label>
              </div>

              {/* Comfort & Locomotion Settings */}
              <div className="space-y-2.5 pt-3 border-t border-slate-100">
                <div className="font-bold text-slate-900">
                  VR Comfort & Locomotion Settings
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">
                      Locomotion Mode
                    </label>
                    <select
                      aria-label="VR Locomotion Mode"
                      value={config.navigation.locomotionMode}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          navigation: {
                            ...prev.navigation,
                            locomotionMode: e.target.value as VRLocomotionMode,
                          },
                        }))
                      }
                      className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                    >
                      <option value="teleport">Teleport (Comfort)</option>
                      <option value="snap-turn">Snap-Turn + Teleport</option>
                      <option value="seated-stationary">Seated / Stationary</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">
                      Snap-Turn Angle
                    </label>
                    <select
                      aria-label="Snap-Turn Increment Degrees"
                      value={config.navigation.snapTurnDegrees}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          navigation: {
                            ...prev.navigation,
                            snapTurnDegrees: Number(e.target.value) as VRSnapTurnDegrees,
                          },
                        }))
                      }
                      className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                    >
                      <option value={15}>15°</option>
                      <option value={30}>30° (Default)</option>
                      <option value={45}>45°</option>
                      <option value={60}>60°</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">
                      Viewer Posture
                    </label>
                    <select
                      aria-label="Viewer Posture Mode"
                      value={config.navigation.postureMode}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          navigation: {
                            ...prev.navigation,
                            postureMode: e.target.value as 'standing' | 'seated',
                          },
                        }))
                      }
                      className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                    >
                      <option value="standing">Standing (1.65 m)</option>
                      <option value="seated">Seated (1.20 m)</option>
                    </select>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Comfort guidance: Low-motion teleportation and discrete snap-turning are enabled
                  by default to reduce visual-vestibular mismatch. Comfort presets do not guarantee
                  that motion discomfort cannot occur; take breaks and keep headset physical
                  guardian boundaries enabled.
                </p>
              </div>

              {/* Saved Viewpoint Bookmarks */}
              <div className="space-y-2.5 pt-3 border-t border-slate-100">
                <div className="font-bold text-slate-900">Saved Viewpoint Bookmarks</div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Bookmark label (e.g., Double-Height Living View)..."
                    value={bookmarkLabel}
                    onChange={(e) => setBookmarkLabel(e.target.value)}
                    className="flex-1 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                  />
                  <button
                    onClick={handleSaveCurrentBookmark}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <Bookmark className="w-3.5 h-3.5 text-teal-400" />
                    <span>Save View</span>
                  </button>
                </div>

                {bookmarks.length === 0 ? (
                  <p className="text-[11px] text-slate-500">
                    No custom bookmarks saved yet. Use the button above to bookmark any camera angle
                    or room interior.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {bookmarks.map((bm) => (
                      <div
                        key={bm.bookmarkId}
                        className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200"
                      >
                        <div>
                          <div className="font-semibold text-slate-800">{bm.label}</div>
                          <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                            Scale {bm.scalePreset} · Floor {String(bm.targetFloorLevel)}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleApplyBookmark(bm)}
                            className="px-2.5 py-1 text-[11px] font-semibold bg-teal-50 hover:bg-teal-100 text-teal-900 border border-teal-200 rounded-md cursor-pointer"
                          >
                            Jump
                          </button>
                          <button
                            onClick={() =>
                              setBookmarks((prev) =>
                                prev.filter((x) => x.bookmarkId !== bm.bookmarkId)
                              )
                            }
                            aria-label={`Delete bookmark ${bm.label}`}
                            className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab 2: Selected Component Inspector & Cross-Discipline Layers (P41–P48) */}
          {activeInspectorTab === 'layers' && (
            <div className="p-4 space-y-5 text-xs max-h-[600px] overflow-y-auto">
              {/* Selected Component Inspector */}
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-3 space-y-2">
                <div className="font-bold text-slate-900">Selected Element Inspector</div>
                {selectedTarget?.hit && selectedTarget.targetMetadata ? (
                  <div className="space-y-1.5 text-slate-700">
                    <div className="font-semibold text-teal-900">
                      {selectedTarget.targetMetadata.label}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      ID: <code className="font-mono">{selectedTarget.targetMetadata.elementId}</code>{' '}
                      · Type: <code className="font-mono">{selectedTarget.targetMetadata.elementType}</code>{' '}
                      · Source: {selectedTarget.targetMetadata.sourceModule}
                    </div>
                    {selectedTarget.targetMetadata.dimensionsProjectUnits && (
                      <div className="text-[11px] font-mono tabular-nums">
                        Dimensions:{' '}
                        {selectedTarget.targetMetadata.dimensionsProjectUnits.width} ×{' '}
                        {selectedTarget.targetMetadata.dimensionsProjectUnits.length}{' '}
                        {selectedTarget.targetMetadata.dimensionsProjectUnits.unit} (
                        {selectedTarget.targetMetadata.dimensionsMetresAt1To1?.widthM} m ×{' '}
                        {selectedTarget.targetMetadata.dimensionsMetresAt1To1?.lengthM} m at 1:1)
                      </div>
                    )}
                    {selectedTarget.targetMetadata.ifcProvenance && (
                      <div className="text-[11px] bg-teal-50 border border-teal-200 rounded-md p-2 text-teal-950 font-mono">
                        P41 IFC Provenance: {selectedTarget.targetMetadata.ifcProvenance.ifcType} ·
                        GlobalId: {selectedTarget.targetMetadata.ifcProvenance.globalId} · STEP #
                        {selectedTarget.targetMetadata.ifcProvenance.stepId}
                      </div>
                    )}
                    {selectedTarget.targetMetadata.semanticOverlayNote && (
                      <div className="text-[11px] text-slate-600 italic">
                        {selectedTarget.targetMetadata.semanticOverlayNote}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500">
                    Click any element in the 3D scene to inspect its source metadata, dimensions,
                    and P41–P47 provenance.
                  </p>
                )}
              </div>

              {/* Base Architectural Layer Toggles */}
              <div className="space-y-2">
                <div className="font-bold text-slate-900">
                  3D Scene & Discipline Layer Visibility
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.layers.showBaseBuildingShell}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          layers: {
                            ...prev.layers,
                            showBaseBuildingShell: e.target.checked,
                          },
                        }))
                      }
                    />
                    <span>Perimeter Walls</span>
                  </label>
                  <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.layers.showRoomLabelsAndSlabs}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          layers: {
                            ...prev.layers,
                            showRoomLabelsAndSlabs: e.target.checked,
                          },
                        }))
                      }
                    />
                    <span>Room Floor Slabs</span>
                  </label>
                  <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.layers.showOpenings}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          layers: {
                            ...prev.layers,
                            showOpenings: e.target.checked,
                          },
                        }))
                      }
                    />
                    <span>Doors & Windows</span>
                  </label>
                  <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.layers.showStructuralColumns}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          layers: {
                            ...prev.layers,
                            showStructuralColumns: e.target.checked,
                          },
                        }))
                      }
                    />
                    <span>Structural Columns</span>
                  </label>
                  <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.layers.showP43TerrainSurface}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          layers: {
                            ...prev.layers,
                            showP43TerrainSurface: e.target.checked,
                          },
                        }))
                      }
                    />
                    <span>P43 Terrain TIN</span>
                  </label>
                  <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.layers.showP46EnvelopeHighlights}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          layers: {
                            ...prev.layers,
                            showP46EnvelopeHighlights: e.target.checked,
                          },
                        }))
                      }
                    />
                    <span>P46 Envelope Ribbons</span>
                  </label>
                  <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.layers.showP47SiteLogistics}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          layers: {
                            ...prev.layers,
                            showP47SiteLogistics: e.target.checked,
                          },
                        }))
                      }
                    />
                    <span>P47 Site Logistics</span>
                  </label>
                  <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.layers.showReviewAnnotations}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          layers: {
                            ...prev.layers,
                            showReviewAnnotations: e.target.checked,
                          },
                        }))
                      }
                    />
                    <span>P49 Annotation Pins</span>
                  </label>
                </div>

                {/* P47 Phase Filter when Site Logistics is enabled */}
                {config.layers.showP47SiteLogistics &&
                  project.siteLogistics?.activePlan?.phases && (
                    <div className="pt-1">
                      <label className="block text-[11px] text-slate-600 mb-1">
                        P47 Site Logistics Phase Filter
                      </label>
                      <select
                        aria-label="P47 Site Logistics Phase Filter"
                        value={config.layers.selectedSiteLogisticsPhaseId}
                        onChange={(e) =>
                          setConfig((prev) => ({
                            ...prev,
                            layers: {
                              ...prev.layers,
                              selectedSiteLogisticsPhaseId: e.target.value,
                            },
                          }))
                        }
                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                      >
                        <option value="all">All Construction Phases</option>
                        {project.siteLogistics.activePlan.phases.map((ph) => (
                          <option key={ph.id} value={ph.id}>
                            {ph.name} ({ph.startDateIso} to {ph.endDateIso})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
              </div>

              {/* Read-Only Cross-Discipline Digests (P41–P48) */}
              <div className="space-y-2.5 pt-3 border-t border-slate-100">
                <div className="font-bold text-slate-900">
                  P41–P48 Cross-Discipline Source Digests & Legends
                </div>
                {crossDisciplineDigests.map((layer) => (
                  <div
                    key={layer.moduleId}
                    className="p-3 rounded-xl border border-slate-200 bg-white space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900">{layer.title}</span>
                      <span className="text-[11px] text-slate-500">
                        {layer.isAvailableInProject ? 'Available' : 'Not Configured'}
                        {layer.isStale ? ' · STALE' : ''}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-700">{layer.summaryHeadline}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600 tabular-nums">
                      {layer.keyMetrics.map((m, i) => (
                        <span key={i}>
                          <strong>{m.label}:</strong> {m.value}
                        </span>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {layer.legendItems.map((leg, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 text-[10px] text-slate-600 font-mono"
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-xs inline-block"
                            style={{ backgroundColor: leg.colorHex }}
                          />
                          <span>
                            {leg.patternOrSymbol} {leg.label}
                          </span>
                        </span>
                      ))}
                    </div>
                    <p className="text-[10px] text-slate-500 leading-relaxed">
                      {layer.limitationsAndDisclaimers[0]}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tab 3: Review Annotations & Issue Markers */}
          {activeInspectorTab === 'annotations' && (
            <div className="p-4 space-y-4 text-xs max-h-[600px] overflow-y-auto">
              {/* Create / Edit Annotation Form */}
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900">
                    {editingAnnotationId
                      ? 'Edit Saved Review Annotation'
                      : 'Record Model-Anchored Review Note'}
                  </span>
                  {selectedTarget?.hit && selectedTarget.targetMetadata && (
                    <span className="text-[11px] text-teal-800 font-medium">
                      Target: {selectedTarget.targetMetadata.label}
                    </span>
                  )}
                </div>

                <input
                  type="text"
                  aria-label="Annotation Title"
                  placeholder="Observation title (e.g., Narrow corridor pinch point)..."
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-900"
                />

                <textarea
                  rows={3}
                  aria-label="Annotation Review Note"
                  placeholder="Describe spatial observation, circulation question, or missing model detail..."
                  value={noteBody}
                  onChange={(e) => setNoteBody(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-900"
                />

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">
                      Observation Category
                    </label>
                    <select
                      aria-label="Annotation Category"
                      value={noteCategory}
                      onChange={(e) =>
                        setNoteCategory(e.target.value as VRAnnotationCategory)
                      }
                      className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800"
                    >
                      <option value="spatial-layout-observation">
                        Spatial Layout Observation
                      </option>
                      <option value="circulation-wayfinding-concern">
                        Circulation / Wayfinding Concern
                      </option>
                      <option value="design-coordination-issue">
                        Design Coordination Issue
                      </option>
                      <option value="missing-unclear-model-info">
                        Missing / Unclear Model Info
                      </option>
                      <option value="visual-review-note">Visual Review Note</option>
                      <option value="follow-up-inspection-required">
                        Follow-Up Inspection Required
                      </option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">
                      User Observation Priority
                    </label>
                    <select
                      aria-label="Annotation Observation Priority"
                      value={notePriority}
                      onChange={(e) =>
                        setNotePriority(e.target.value as VRAnnotationPriority)
                      }
                      className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800"
                    >
                      <option value="low">Low Observation</option>
                      <option value="medium">Medium Observation</option>
                      <option value="high">High Observation</option>
                      <option value="critical-observation">
                        Critical Review Observation
                      </option>
                    </select>
                  </div>
                </div>

                <p className="text-[10px] text-slate-500">
                  {NON_ENGINEERING_RISK_DISCLAIMER}
                </p>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCreateOrUpdateAnnotation}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    <MessageSquarePlus className="w-3.5 h-3.5 text-teal-400" />
                    <span>
                      {editingAnnotationId ? 'Update Review Note' : 'Add Review Note'}
                    </span>
                  </button>
                  {editingAnnotationId && (
                    <button
                      onClick={() => {
                        setEditingAnnotationId(null);
                        setNoteTitle('');
                        setNoteBody('');
                      }}
                      className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-medium rounded-lg cursor-pointer"
                    >
                      Cancel Edit
                    </button>
                  )}
                </div>
              </div>

              {/* Filter & Saved Notes List */}
              <div className="flex items-center justify-between pt-2">
                <span className="font-bold text-slate-900">
                  Saved Review Notes ({filteredAnnotations.length})
                </span>
                <select
                  aria-label="Filter Annotations by Status"
                  value={annotationFilterStatus}
                  onChange={(e) =>
                    setAnnotationFilterStatus(
                      e.target.value as VRAnnotationStatus | 'all'
                    )
                  }
                  className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-700"
                >
                  <option value="all">All Statuses</option>
                  <option value="open">Open</option>
                  <option value="in-review">In Review</option>
                  <option value="needs-reverification">Needs Re-Verification</option>
                  <option value="resolved">Resolved</option>
                </select>
              </div>

              {filteredAnnotations.length === 0 ? (
                <p className="text-[11px] text-slate-500 py-4 text-center">
                  No review annotations match the selected filter. You can create and inspect notes
                  both in Standard 3D mode and during VR review.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {filteredAnnotations.map((note) => (
                    <div
                      key={note.annotationId}
                      className="p-3 rounded-xl border border-slate-200 bg-white space-y-1.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold text-slate-900">
                            {note.title}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Priority: <strong>{note.priority}</strong> · Category:{' '}
                            {note.category} · Floor {note.targetFloorLevel}
                          </div>
                        </div>

                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-md whitespace-nowrap ${
                            note.anchorResolutionStatus === 'resolved'
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : note.anchorResolutionStatus === 'stale-geometry-changed'
                              ? 'bg-amber-50 text-amber-800 border border-amber-200'
                              : 'bg-rose-50 text-rose-800 border border-rose-200'
                          }`}
                        >
                          {note.anchorResolutionStatus === 'resolved'
                            ? 'Anchor Resolved'
                            : note.anchorResolutionStatus === 'stale-geometry-changed'
                            ? 'Stale Geometry'
                            : 'Target Removed'}
                        </span>
                      </div>

                      <p className="text-slate-700 leading-relaxed">{note.note}</p>

                      <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                        {note.anchorResolutionMessage}
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-slate-100">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleFocusAnnotationIn3D(note)}
                            className="px-2 py-1 text-[11px] font-medium bg-teal-50 hover:bg-teal-100 text-teal-900 rounded-md cursor-pointer"
                          >
                            Focus in 3D
                          </button>
                          <select
                            aria-label={`Status for ${note.title}`}
                            value={note.status}
                            onChange={(e) =>
                              handleToggleAnnotationStatus(
                                note.annotationId,
                                e.target.value as VRAnnotationStatus
                              )
                            }
                            className="px-2 py-1 text-[11px] bg-slate-50 border border-slate-200 rounded-md text-slate-700"
                          >
                            <option value="open">Open</option>
                            <option value="in-review">In Review</option>
                            <option value="needs-reverification">Needs Re-Verification</option>
                            <option value="resolved">Resolved</option>
                          </select>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              setEditingAnnotationId(note.annotationId);
                              setNoteTitle(note.title);
                              setNoteBody(note.note);
                              setNoteCategory(note.category);
                              setNotePriority(note.priority);
                            }}
                            aria-label={`Edit annotation ${note.title}`}
                            className="p-1 text-slate-500 hover:text-slate-900 cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          {annotationToConfirmDelete === note.annotationId ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() =>
                                  handleConfirmDeleteAnnotation(note.annotationId)
                                }
                                className="px-2 py-0.5 text-[10px] font-semibold bg-rose-600 text-white rounded cursor-pointer"
                              >
                                Confirm Delete
                              </button>
                              <button
                                onClick={() => setAnnotationToConfirmDelete(null)}
                                className="px-1.5 py-0.5 text-[10px] bg-slate-100 text-slate-600 rounded cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() =>
                                setAnnotationToConfirmDelete(note.annotationId)
                              }
                              aria-label={`Delete annotation ${note.title}`}
                              className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab 4: VR Capability Diagnostics, Complexity Budget & Privacy */}
          {activeInspectorTab === 'diagnostics' && (
            <div className="p-4 space-y-4 text-xs max-h-[600px] overflow-y-auto">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900">
                    WebXR &quot;immersive-vr&quot; Capability Diagnostics
                  </span>
                  <button
                    onClick={runCapabilityProbe}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-md cursor-pointer"
                  >
                    Re-Run Probe
                  </button>
                </div>

                <div className="bg-slate-50 rounded-xl border border-slate-200 p-3 space-y-1.5 tabular-nums">
                  <div>
                    <strong>Secure Context (HTTPS / localhost):</strong>{' '}
                    {capability?.isSecureContext ? 'Yes' : 'No'}
                  </div>
                  <div>
                    <strong>WebGL Context Ready:</strong>{' '}
                    {capability?.hasWebGL ? 'Yes' : 'No'}
                  </div>
                  <div>
                    <strong>navigator.xr Present:</strong>{' '}
                    {capability?.hasNavigatorXR ? 'Yes' : 'No'}
                  </div>
                  <div>
                    <strong>isSessionSupported(&apos;immersive-vr&apos;):</strong>{' '}
                    {capability?.immersiveVRSupported ? 'Supported' : 'Not Supported'}
                  </div>
                  <div>
                    <strong>Inferred from User-Agent String:</strong> false (Strictly runtime-probed)
                  </div>
                  <div>
                    <strong>Blocker Code:</strong>{' '}
                    <code className="font-mono">{capability?.blockerCode || 'NONE'}</code>
                  </div>
                  <div>
                    <strong>Detected XR Input Sources:</strong>{' '}
                    {sessionState.connectedInputSources.length === 0
                      ? 'None (using Standard 3D mouse/keyboard/touch fallback)'
                      : sessionState.connectedInputSources
                          .map((s) => `${s.handedness} (${s.targetRayMode})`)
                          .join(', ')}
                  </div>
                </div>
              </div>

              {/* Scene Complexity & Headset Budget */}
              <div className="space-y-1.5 pt-2 border-t border-slate-100">
                <div className="font-bold text-slate-900">
                  Scene Complexity & Missing Data Disclosures
                </div>
                <div className="bg-slate-50 rounded-xl border border-slate-200 p-3 space-y-1 tabular-nums">
                  <div>
                    <strong>Estimated Triangles:</strong>{' '}
                    {preflight.estimatedTriangleCount.toLocaleString()} / 80,000 budget
                  </div>
                  <div>
                    <strong>Estimated Draw Calls:</strong>{' '}
                    {preflight.estimatedDrawCallCount} / 350 budget
                  </div>
                  <div>
                    <strong>CAD 2D-Only Entities Excluded:</strong>{' '}
                    {preflight.cad2DOnlySkippedCount}
                  </div>
                  <div>
                    <strong>Within Headset Budget:</strong>{' '}
                    {preflight.withinHeadsetComplexityBudget ? 'Yes' : 'Warning — Exceeds Budget'}
                  </div>
                </div>
                <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-600">
                  {preflight.missingDataDisclosures.map((d, idx) => (
                    <li key={idx}>{d}</li>
                  ))}
                </ul>
              </div>

              {/* Privacy & Security Guarantees */}
              <div className="space-y-1.5 pt-2 border-t border-slate-100">
                <div className="font-bold text-slate-900">
                  Privacy, Lifecycle & Hardware Honesty Guarantees
                </div>
                <div className="bg-slate-50 rounded-xl border border-slate-200 p-3 space-y-1 text-[11px] text-slate-700">
                  <div>
                    • <strong>Intentional User Action Required:</strong> Session starts only on
                    explicit user click (<code className="font-mono">userGestureConfirmed</code>).
                  </div>
                  <div>
                    • <strong>Zero Unrelated Sensory Capture:</strong> Camera capture ={' '}
                    <code className="font-mono">false</code>, Microphone recording ={' '}
                    <code className="font-mono">false</code>, Eye-tracking ={' '}
                    <code className="font-mono">false</code>, Head-pose telemetry upload ={' '}
                    <code className="font-mono">false</code>.
                  </div>
                  <div>
                    • <strong>P50 Scope Boundary:</strong> Live multi-user co-presence / websocket
                    collaboration = <code className="font-mono">false</code>.
                  </div>
                  <div>
                    • <strong>Hardware Verification Disclosure:</strong> Physical VR headset testing
                    was not performed in this environment.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Export Report Modal */}
      {exportModalFormat && (
        <div className="fixed inset-0 bg-slate-950/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-3xl w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Export P49 Immersive VR Design Review Report
                </h3>
                <p className="text-xs text-slate-500">
                  Includes preflight geometry metrics, scale transforms, saved annotations, P41–P48
                  digests, and hardware verification disclosures.
                </p>
              </div>
              <button
                onClick={() => setExportModalFormat(null)}
                aria-label="Close export modal"
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setExportModalFormat('markdown')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer ${
                  exportModalFormat === 'markdown'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                Markdown (.md)
              </button>
              <button
                onClick={() => setExportModalFormat('json')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer ${
                  exportModalFormat === 'json'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                JSON (.json)
              </button>
            </div>

            <pre className="bg-slate-950 text-slate-100 p-4 rounded-xl text-[11px] font-mono overflow-auto max-h-96 whitespace-pre-wrap">
              {exportedReportText}
            </pre>

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  const blob = new Blob([exportedReportText], {
                    type:
                      exportModalFormat === 'json'
                        ? 'application/json'
                        : 'text/markdown',
                  });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${project.name
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')}-p49-vr-review.${
                    exportModalFormat === 'json' ? 'json' : 'md'
                  }`;
                  a.click();
                  URL.revokeObjectURL(url);
                  onShowToast?.('Downloaded P49 VR Design Review report.', 'success');
                }}
                className="px-4 py-2 text-xs font-semibold bg-teal-700 hover:bg-teal-800 text-white rounded-lg cursor-pointer"
              >
                Download File
              </button>
              <button
                onClick={() => setExportModalFormat(null)}
                className="px-4 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
