import * as THREE from 'three';
import { Project, FloorPlanRoom, MeasurementUnit, DesignAlternative } from '../../types/project';

export interface Viewer3DConfig {
  wallHeight: number; // in project units (feet or metres)
  wallThickness: number; // in project units
  floorThickness: number; // in project units
  showWalls: boolean;
  showSlabs: boolean;
  showPlotBoundary: boolean;
  showOpenings: boolean;
  selectedFloor: number | 'all'; // 'all' or specific floor number
  wallOpacity: number; // 0.2 to 1.0
  applyDesignAlternative?: boolean;
  activeAlternative?: DesignAlternative | null;
  showColumns?: boolean;
}

export interface GeometryValidationResult {
  validRooms: FloorPlanRoom[];
  invalidRooms: Array<{ id: string; name: string; reason: string }>;
  warnings: string[];
  totalBuiltVolume: number;
}

/**
 * Default conceptual settings adjusted by measurement unit
 */
export function getDefaultViewerConfig(
  unit: MeasurementUnit,
  activeAlternative?: DesignAlternative | null,
  applyDesignDefault: boolean = true
): Viewer3DConfig {
  const isMetres = unit === 'metres';
  return {
    wallHeight: isMetres ? 3.0 : 10.0,
    wallThickness: isMetres ? 0.15 : 0.5,
    floorThickness: isMetres ? 0.15 : 0.5,
    showWalls: true,
    showSlabs: true,
    showPlotBoundary: true,
    showOpenings: true,
    showColumns: true,
    selectedFloor: 'all',
    wallOpacity: 0.95,
    applyDesignAlternative: applyDesignDefault && Boolean(activeAlternative),
    activeAlternative: activeAlternative || null,
  };
}

/**
 * Validates rooms before 3D mesh generation
 */
export function validateFloorPlanFor3D(
  rooms: FloorPlanRoom[],
  plotWidth: number,
  plotLength: number
): GeometryValidationResult {
  const validRooms: FloorPlanRoom[] = [];
  const invalidRooms: Array<{ id: string; name: string; reason: string }> = [];
  const warnings: string[] = [];

  for (const r of rooms) {
    if (typeof r.width !== 'number' || isNaN(r.width) || r.width <= 0) {
      invalidRooms.push({ id: r.id, name: r.name || 'Unnamed', reason: 'Invalid or zero width' });
      continue;
    }
    if (typeof r.length !== 'number' || isNaN(r.length) || r.length <= 0) {
      invalidRooms.push({ id: r.id, name: r.name || 'Unnamed', reason: 'Invalid or zero length' });
      continue;
    }
    if (typeof r.x !== 'number' || isNaN(r.x) || typeof r.y !== 'number' || isNaN(r.y)) {
      invalidRooms.push({ id: r.id, name: r.name || 'Unnamed', reason: 'Invalid coordinates' });
      continue;
    }

    // Check boundary overflow warning
    if (r.x < 0 || r.y < 0 || r.x + r.width > plotWidth || r.y + r.length > plotLength) {
      warnings.push(`Room "${r.name}" extends beyond the plot envelope boundary.`);
    }

    validRooms.push(r);
  }

  const totalBuiltVolume = validRooms.reduce(
    (sum, r) => sum + r.width * r.length,
    0
  );

  return {
    validRooms,
    invalidRooms,
    warnings,
    totalBuiltVolume,
  };
}

/**
 * Creates canvas texture for room floor with text label
 */
function createRoomFloorTexture(name: string, areaText: string, colorHex: string): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    // Background fill
    ctx.fillStyle = colorHex || '#f8fafc';
    ctx.fillRect(0, 0, 512, 512);

    // Subtle architectural grid texture
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.06)';
    ctx.lineWidth = 4;
    for (let x = 0; x <= 512; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 512);
      ctx.stroke();
    }
    for (let y = 0; y <= 512; y += 64) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(512, y);
      ctx.stroke();
    }

    // Border perimeter
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.15)';
    ctx.lineWidth = 12;
    ctx.strokeRect(6, 6, 500, 500);

    // Room Label
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 36px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, 256, 236);

    // Area Label
    ctx.fillStyle = '#0f766e';
    ctx.font = '600 24px "JetBrains Mono", monospace';
    ctx.fillText(areaText, 256, 280);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Constructs the Three.js building group from project 2D data
 */
export function buildBuilding3DModel(
  project: Project,
  config: Viewer3DConfig,
  validRooms: FloorPlanRoom[]
): { group: THREE.Group; bounds: { size: THREE.Vector3; center: THREE.Vector3 } } {
  const buildingGroup = new THREE.Group();
  buildingGroup.name = 'Building3DModel';

  const pw = project.plotWidth;
  const pl = project.plotLength;
  const unitSuffix = project.unit === 'feet' ? 'ft' : 'm';
  const unitAreaSuffix = project.unit === 'feet' ? 'sq ft' : 'm²';

  // Plot center offset so the building is centered at world (0, 0, 0)
  const offsetX = -pw / 2;
  const offsetZ = -pl / 2;

  // 1. PLOT SITE GROUND SLAB
  if (config.showPlotBoundary) {
    const slabThick = config.floorThickness;
    const slabGeo = new THREE.BoxGeometry(pw, slabThick, pl);
    const slabMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      roughness: 0.85,
      metalness: 0.05,
    });
    const siteSlab = new THREE.Mesh(slabGeo, slabMat);
    siteSlab.position.set(0, -slabThick / 2, 0);
    siteSlab.receiveShadow = true;
    siteSlab.name = 'PlotSlab';
    buildingGroup.add(siteSlab);

    // Plot perimeter boundary line
    const borderPoints = [
      new THREE.Vector3(offsetX, 0.05, offsetZ),
      new THREE.Vector3(offsetX + pw, 0.05, offsetZ),
      new THREE.Vector3(offsetX + pw, 0.05, offsetZ + pl),
      new THREE.Vector3(offsetX, 0.05, offsetZ + pl),
      new THREE.Vector3(offsetX, 0.05, offsetZ),
    ];
    const borderGeo = new THREE.BufferGeometry().setFromPoints(borderPoints);
    const borderMat = new THREE.LineBasicMaterial({ color: 0x0d9488, linewidth: 2 });
    const borderLine = new THREE.Line(borderGeo, borderMat);
    buildingGroup.add(borderLine);

    // Road indicator arrow on plot edge
    const roadAngle = project.roadFacing.toLowerCase();
    const isNorth = roadAngle.includes('north');
    const isSouth = roadAngle.includes('south');
    const isWest = roadAngle.includes('west');
    const isEast = roadAngle.includes('east');

    let roadPos = new THREE.Vector3(0, 0.08, offsetZ - 2);
    if (isSouth) roadPos = new THREE.Vector3(0, 0.08, offsetZ + pl + 2);
    if (isWest && !isNorth && !isSouth) roadPos = new THREE.Vector3(offsetX - 2, 0.08, 0);
    if (isEast && !isNorth && !isSouth) roadPos = new THREE.Vector3(offsetX + pw + 2, 0.08, 0);

    const roadBandGeo = new THREE.PlaneGeometry(isWest || isEast ? 3 : pw, isWest || isEast ? pl : 3);
    const roadBandMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.9,
    });
    const roadBand = new THREE.Mesh(roadBandGeo, roadBandMat);
    roadBand.rotation.x = -Math.PI / 2;
    roadBand.position.copy(roadPos);
    roadBand.receiveShadow = true;
    buildingGroup.add(roadBand);

    // P43: Optional Topographic TIN Surface & Contours overlay alongside building geometry
    const terrainMeta = project.terrainModeling;
    const terrainMeshData = terrainMeta?.surfaceMesh;
    const showTerrain3D = terrainMeta?.displaySettings?.showSurfaceIn3D !== false;
    if (terrainMeshData && showTerrain3D && terrainMeshData.triangles.length > 0) {
      const terrainGroup = new THREE.Group();
      terrainGroup.name = 'P43_TerrainSurface';
      const verticalExag = terrainMeta?.displaySettings?.verticalExaggerationDisplayOnly ?? 1.0;
      const meanZ = terrainMeta?.analysis?.meanElevation ?? terrainMeshData.bounds.minZ;
      const verts = terrainMeshData.vertices;

      const positions: number[] = [];
      for (const tri of terrainMeshData.triangles) {
        const pA = verts[tri.v0Index];
        const pB = verts[tri.v1Index];
        const pC = verts[tri.v2Index];
        if (!pA || !pB || !pC) continue;

        const yA = (pA.z - meanZ) * verticalExag - slabThick * 0.25;
        const yB = (pB.z - meanZ) * verticalExag - slabThick * 0.25;
        const yC = (pC.z - meanZ) * verticalExag - slabThick * 0.25;

        positions.push(
          offsetX + pA.x, yA, offsetZ + pA.y,
          offsetX + pB.x, yB, offsetZ + pB.y,
          offsetX + pC.x, yC, offsetZ + pC.y
        );
      }

      if (positions.length >= 9) {
        const tinGeo = new THREE.BufferGeometry();
        tinGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        tinGeo.computeVertexNormals();

        const tinMat = new THREE.MeshStandardMaterial({
          color: 0xd1fae5,
          roughness: 0.9,
          metalness: 0.05,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.65,
        });
        const tinMesh = new THREE.Mesh(tinGeo, tinMat);
        tinMesh.receiveShadow = true;
        tinMesh.name = 'TerrainTINMesh';
        terrainGroup.add(tinMesh);

        // Contour line segments on the 3D TIN surface
        if (
          terrainMeta?.displaySettings?.showContoursIn2D !== false &&
          terrainMeshData.derivedContours.length > 0
        ) {
          const contourPositions: number[] = [];
          for (const c of terrainMeshData.derivedContours) {
            const cY = (c.elevation - meanZ) * verticalExag - slabThick * 0.22;
            contourPositions.push(
              offsetX + c.x1, cY, offsetZ + c.y1,
              offsetX + c.x2, cY, offsetZ + c.y2
            );
          }
          if (contourPositions.length >= 6) {
            const contourGeo = new THREE.BufferGeometry();
            contourGeo.setAttribute('position', new THREE.Float32BufferAttribute(contourPositions, 3));
            const contourMat = new THREE.LineBasicMaterial({
              color: 0x047857,
              transparent: true,
              opacity: 0.8,
            });
            const contourLines = new THREE.LineSegments(contourGeo, contourMat);
            contourLines.name = 'TerrainContourLines';
            terrainGroup.add(contourLines);
          }
        }

        buildingGroup.add(terrainGroup);
      }
    }
  }

  // Group rooms by floor level
  const roomsByFloor = new Map<number, FloorPlanRoom[]>();
  for (const r of validRooms) {
    const list = roomsByFloor.get(r.floorLevel) || [];
    list.push(r);
    roomsByFloor.set(r.floorLevel, list);
  }

  // Floor finish color mapping helper
  const getFloorFinishColor = (finish?: string, fallbackColor?: string): string => {
    switch (finish) {
      case 'light-oak-plank':
        return '#d4b996';
      case 'smoked-walnut':
        return '#5c4033';
      case 'polished-concrete':
        return '#94a3b8';
      case 'honed-travertine':
        return '#ede5d8';
      case 'terrazzo-aggregate':
        return '#cbd5e1';
      default:
        return fallbackColor || '#f1f5f9';
    }
  };

  // Reusable materials (adapting to active alternative if enabled)
  const isDesignApplied = Boolean(config.applyDesignAlternative && config.activeAlternative);
  const activeAlt = config.activeAlternative;

  let wallColorHex = '#ffffff';
  let wallRoughness = 0.75;
  let wallMetalness = 0.05;

  if (isDesignApplied && activeAlt) {
    wallColorHex = activeAlt.facade.primaryColor || '#ffffff';
    const mat = activeAlt.facade.primaryMaterial;
    if (mat === 'timber') {
      wallRoughness = 0.65;
    } else if (mat === 'brick') {
      wallRoughness = 0.88;
    } else if (mat === 'concrete') {
      wallRoughness = 0.80;
    } else if (mat === 'stone') {
      wallRoughness = 0.82;
    } else if (mat === 'glass') {
      wallRoughness = 0.15;
      wallMetalness = 0.25;
    } else {
      wallRoughness = 0.90;
    }
  }

  const wallMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(wallColorHex),
    roughness: wallRoughness,
    metalness: wallMetalness,
    transparent: config.wallOpacity < 0.98,
    opacity: config.wallOpacity,
  });

  const wallEdgeMat = new THREE.LineBasicMaterial({
    color: 0x475569,
    transparent: true,
    opacity: 0.5,
  });

  const doorMatColor = isDesignApplied && activeAlt
    ? activeAlt.facade.accentColor || '#0d9488'
    : '#0d9488';

  const conceptualOpeningMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(doorMatColor),
    roughness: 0.35,
    metalness: 0.1,
    transparent: true,
    opacity: 0.85,
  });

  const wallHeight = config.wallHeight;
  const wallThick = config.wallThickness;
  const floorThick = config.floorThickness;
  const storyHeight = wallHeight + floorThick;

  // Build each floor
  const targetFloors =
    config.selectedFloor === 'all'
      ? Array.from(roomsByFloor.keys()).sort((a, b) => a - b)
      : [config.selectedFloor];

  for (const floorNum of targetFloors) {
    const floorRooms = roomsByFloor.get(floorNum) || [];
    const floorBaseY = (floorNum - 1) * storyHeight;

    const floorGroup = new THREE.Group();
    floorGroup.name = `Floor_${floorNum}`;

    for (const room of floorRooms) {
      const roomGroup = new THREE.Group();
      roomGroup.name = `Room_${room.name}_${room.id}`;

      // Convert 2D (x, y) where y is depth to 3D (x, z)
      // Center of room in plot coordinates
      const roomCenterX = offsetX + room.x + room.width / 2;
      const roomCenterZ = offsetZ + room.y + room.length / 2;
      const areaVal = (room.width * room.length).toFixed(1);

      // A. ROOM FLOOR SLAB
      if (config.showSlabs) {
        const roomFloorGeo = new THREE.BoxGeometry(room.width, floorThick, room.length);
        const roomInteriorConcept = isDesignApplied && activeAlt ? activeAlt.interiors[room.id] : undefined;
        const slabColorHex = isDesignApplied
          ? getFloorFinishColor(roomInteriorConcept?.floorFinish, room.color)
          : room.color || '#f1f5f9';

        const texture = createRoomFloorTexture(
          room.name,
          `${areaVal} ${unitAreaSuffix}`,
          slabColorHex
        );
        const topMaterial = texture
          ? new THREE.MeshStandardMaterial({ map: texture, roughness: 0.7 })
          : new THREE.MeshStandardMaterial({
              color: new THREE.Color(slabColorHex),
              roughness: 0.7,
            });

        const floorMats = [
          new THREE.MeshStandardMaterial({ color: 0xe2e8f0 }),
          new THREE.MeshStandardMaterial({ color: 0xe2e8f0 }),
          topMaterial, // top
          new THREE.MeshStandardMaterial({ color: 0xcbd5e1 }), // bottom
          new THREE.MeshStandardMaterial({ color: 0xe2e8f0 }),
          new THREE.MeshStandardMaterial({ color: 0xe2e8f0 }),
        ];

        const roomSlab = new THREE.Mesh(roomFloorGeo, floorMats);
        roomSlab.position.set(roomCenterX, floorBaseY + floorThick / 2, roomCenterZ);
        roomSlab.receiveShadow = true;
        roomGroup.add(roomSlab);
      }

      // B. ROOM PERIMETER WALLS (4 segments: North, South, East, West)
      if (config.showWalls) {
        const wallY = floorBaseY + floorThick + wallHeight / 2;

        // North Wall (top in 2D, -Z in 3D)
        const northGeo = new THREE.BoxGeometry(room.width, wallHeight, wallThick);
        const northWall = new THREE.Mesh(northGeo, wallMaterial);
        northWall.position.set(
          roomCenterX,
          wallY,
          offsetZ + room.y + wallThick / 2
        );
        northWall.castShadow = true;
        northWall.receiveShadow = true;
        roomGroup.add(northWall);

        // South Wall (bottom in 2D, +Z in 3D)
        const southGeo = new THREE.BoxGeometry(room.width, wallHeight, wallThick);
        const southWall = new THREE.Mesh(southGeo, wallMaterial);
        southWall.position.set(
          roomCenterX,
          wallY,
          offsetZ + room.y + room.length - wallThick / 2
        );
        southWall.castShadow = true;
        southWall.receiveShadow = true;
        roomGroup.add(southWall);

        // West Wall (left in 2D, -X in 3D)
        const westGeo = new THREE.BoxGeometry(wallThick, wallHeight, room.length - wallThick * 2);
        const westWall = new THREE.Mesh(westGeo, wallMaterial);
        westWall.position.set(
          offsetX + room.x + wallThick / 2,
          wallY,
          roomCenterZ
        );
        westWall.castShadow = true;
        westWall.receiveShadow = true;
        roomGroup.add(westWall);

        // East Wall (right in 2D, +X in 3D)
        const eastGeo = new THREE.BoxGeometry(wallThick, wallHeight, room.length - wallThick * 2);
        const eastWall = new THREE.Mesh(eastGeo, wallMaterial);
        eastWall.position.set(
          offsetX + room.x + room.width - wallThick / 2,
          wallY,
          roomCenterZ
        );
        eastWall.castShadow = true;
        eastWall.receiveShadow = true;
        roomGroup.add(eastWall);

        // C. CONCEPTUAL OPENINGS (Door & Window visual markers)
        if (config.showOpenings) {
          const doorWidth = Math.min(3.0, room.width * 0.35);
          const doorHeight = Math.min(7.0, wallHeight * 0.7);

          // Conceptual Door Marker on South wall
          const doorGeo = new THREE.BoxGeometry(doorWidth, doorHeight, wallThick + 0.05);
          const doorMarker = new THREE.Mesh(doorGeo, conceptualOpeningMat);
          doorMarker.position.set(
            roomCenterX,
            floorBaseY + floorThick + doorHeight / 2,
            offsetZ + room.y + room.length - wallThick / 2
          );
          roomGroup.add(doorMarker);

          // Conceptual Window Marker on North wall
          const windowWidth = Math.min(4.0, room.width * 0.45);
          const windowHeight = Math.min(4.0, wallHeight * 0.4);
          const windowY = floorBaseY + floorThick + wallHeight * 0.55;

          const windowGeo = new THREE.BoxGeometry(windowWidth, windowHeight, wallThick + 0.05);
          const windowMat = new THREE.MeshStandardMaterial({
            color: 0x38bdf8,
            roughness: 0.1,
            metalness: 0.2,
            transparent: true,
            opacity: 0.6,
          });
          const windowMarker = new THREE.Mesh(windowGeo, windowMat);
          windowMarker.position.set(
            roomCenterX,
            windowY,
            offsetZ + room.y + wallThick / 2
          );
          roomGroup.add(windowMarker);
        }
      }

      floorGroup.add(roomGroup);
    }

    buildingGroup.add(floorGroup);
  }

  // Add structural column reference posts if available
  const structuralColumns = project.structuralCoordination?.columns || [];
  if (config.showColumns !== false && structuralColumns.length > 0) {
    const colGroup = new THREE.Group();
    colGroup.name = 'structural_columns';
    const offsetX = -project.plotWidth / 2;
    const offsetZ = -project.plotLength / 2;

    structuralColumns.forEach((col) => {
      const colFloors = col.floorLevels || [1];
      const maxColFloor = Math.max(...colFloors);
      const totalColHeight = maxColFloor * wallHeight;

      const colGeo =
        col.profile === 'circular'
          ? new THREE.CylinderGeometry(col.width / 2, col.width / 2, totalColHeight, 16)
          : new THREE.BoxGeometry(col.width, totalColHeight, col.depth);

      const colMat = new THREE.MeshStandardMaterial({
        color: 0x0d9488, // teal structural post
        roughness: 0.5,
        metalness: 0.3,
      });

      const colMesh = new THREE.Mesh(colGeo, colMat);
      colMesh.position.set(
        offsetX + col.x,
        totalColHeight / 2,
        offsetZ + col.y
      );
      colMesh.castShadow = true;
      colMesh.receiveShadow = true;
      colGroup.add(colMesh);
    });

    buildingGroup.add(colGroup);
  }

  // Compute bounding box
  const bbox = new THREE.Box3().setFromObject(buildingGroup);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  bbox.getSize(size);
  bbox.getCenter(center);

  return {
    group: buildingGroup,
    bounds: { size, center },
  };
}

/**
 * Traverses and disposes Three.js meshes, geometries, and materials safely
 */
export function disposeThreeHierarchy(obj: THREE.Object3D) {
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      if (child.geometry) child.geometry.dispose();

      if (Array.isArray(child.material)) {
        child.material.forEach((mat) => {
          if ('map' in mat && mat.map) mat.map.dispose();
          mat.dispose();
        });
      } else if (child.material) {
        if ('map' in child.material && child.material.map) child.material.map.dispose();
        child.material.dispose();
      }
    }
  });
}
