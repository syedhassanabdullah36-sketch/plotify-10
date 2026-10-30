import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Project, FloorPlanRoom } from '../../types/project';
import {
  Viewer3DConfig,
  buildBuilding3DModel,
  disposeThreeHierarchy,
} from './building3dGeometry';

interface Building3DCanvasProps {
  project: Project;
  config: Viewer3DConfig;
  validRooms: FloorPlanRoom[];
  cameraPreset: 'perspective' | 'top' | 'front' | 'side' | 'fit';
  onPresetApplied?: () => void;
}

export const Building3DCanvas: React.FC<Building3DCanvasProps> = ({
  project,
  config,
  validRooms,
  cameraPreset,
  onPresetApplied,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const buildingMeshRef = useRef<THREE.Group | null>(null);
  const boundsRef = useRef<{ size: THREE.Vector3; center: THREE.Vector3 } | null>(null);
  const reqIdRef = useRef<number>(0);

  // Helper to trigger frame render
  const renderDirtyRef = useRef<boolean>(true);

  const requestFrame = useCallback(() => {
    renderDirtyRef.current = true;
  }, []);

  const onPresetAppliedRef = useRef(onPresetApplied);
  useEffect(() => {
    onPresetAppliedRef.current = onPresetApplied;
  });

  // Position camera based on model bounds
  const applyCameraPreset = useCallback(
    (preset: 'perspective' | 'top' | 'front' | 'side' | 'fit') => {
      if (!cameraRef.current || !controlsRef.current || !boundsRef.current) return;

      const camera = cameraRef.current;
      const controls = controlsRef.current;
      const { size, center } = boundsRef.current;

      const maxDim = Math.max(size.x, size.y, size.z, 20);
      const dist = maxDim * 1.5;

      controls.target.copy(center);

      if (preset === 'top') {
        camera.position.set(center.x, center.y + dist * 1.4, center.z + 0.001);
      } else if (preset === 'front') {
        camera.position.set(center.x, center.y + maxDim * 0.35, center.z + dist);
      } else if (preset === 'side') {
        camera.position.set(center.x + dist, center.y + maxDim * 0.35, center.z);
      } else {
        // Perspective / Fit
        camera.position.set(center.x + dist * 0.85, center.y + dist * 0.75, center.z + dist * 0.95);
      }

      camera.lookAt(controls.target);
      controls.update();
      requestFrame();

      onPresetAppliedRef.current?.();
    },
    [requestFrame]
  );

  // Initialize Three.js Scene, Renderer, Lights, and Controls
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 550;

    // Detect software WebGL
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

    // 1. Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
      alpha: false,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 2. Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8fafc); // Clean neutral background matching UI
    scene.fog = new THREE.Fog(0xf8fafc, 150, 450);
    sceneRef.current = scene;

    // 3. Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.5, 1000);
    camera.position.set(50, 45, 60);
    cameraRef.current = camera;

    // 4. Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2 + 0.05; // Prevent camera from going under ground
    controls.minDistance = 5;
    controls.maxDistance = 500;
    controls.addEventListener('change', requestFrame);
    controlsRef.current = controls;

    // 5. Lighting Rig (3-point architectural studio lighting)
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x94a3b8, 1.1);
    hemiLight.position.set(0, 100, 0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfffbeb, 1.8);
    keyLight.position.set(60, 90, 50);
    keyLight.castShadow = !isSoftwareGl;
    if (keyLight.castShadow) {
      keyLight.shadow.mapSize.width = 1024;
      keyLight.shadow.mapSize.height = 1024;
      keyLight.shadow.camera.near = 10;
      keyLight.shadow.camera.far = 300;
      const d = 60;
      keyLight.shadow.camera.left = -d;
      keyLight.shadow.camera.right = d;
      keyLight.shadow.camera.top = d;
      keyLight.shadow.camera.bottom = -d;
      keyLight.shadow.bias = -0.0005;
    }
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xe0f2fe, 0.7);
    fillLight.position.set(-50, 40, -40);
    scene.add(fillLight);

    // Subtle Ground Grid
    const groundGrid = new THREE.GridHelper(200, 50, 0x0d9488, 0xe2e8f0);
    groundGrid.position.y = -0.01;
    scene.add(groundGrid);

    // 6. Animation / Render loop
    const animate = () => {
      reqIdRef.current = requestAnimationFrame(animate);

      if (controls.enableDamping) {
        controls.update();
      }

      if (renderDirtyRef.current) {
        renderer.render(scene, camera);
        renderDirtyRef.current = false;
      }
    };
    animate();

    // 7. Resize Observer
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: w, height: h } = entry.contentRect;
        if (w > 0 && h > 0) {
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
          requestFrame();
        }
      }
    });
    resizeObserver.observe(container);

    // Cleanup on unmount
    return () => {
      cancelAnimationFrame(reqIdRef.current);
      resizeObserver.disconnect();
      controls.dispose();

      if (buildingMeshRef.current) {
        disposeThreeHierarchy(buildingMeshRef.current);
      }

      renderer.dispose();
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, [requestFrame]);

  // Rebuild 3D Model when project, config, or validRooms change
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Remove previous building model
    if (buildingMeshRef.current) {
      scene.remove(buildingMeshRef.current);
      disposeThreeHierarchy(buildingMeshRef.current);
      buildingMeshRef.current = null;
    }

    // Build new 3D model
    const { group, bounds } = buildBuilding3DModel(project, config, validRooms);
    buildingMeshRef.current = group;
    boundsRef.current = bounds;
    scene.add(group);

    // Fit camera on initial load
    applyCameraPreset('fit');
    requestFrame();
  }, [project, config, validRooms, applyCameraPreset, requestFrame]);

  // Respond to camera preset changes
  useEffect(() => {
    if (cameraPreset) {
      applyCameraPreset(cameraPreset);
    }
  }, [cameraPreset, applyCameraPreset]);

  return (
    <div
      ref={mountRef}
      className="relative w-full h-[580px] bg-slate-50 rounded-xl overflow-hidden border border-slate-200 select-none shadow-xs"
      style={{ touchAction: 'none' }}
    />
  );
};
