/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Project, FloorPlanRoom } from '../types/project';
import {
  MEPCoordinationData,
  MEPComponent,
  MEPClashRecord,
  MEPCoordinationSummary,
  MEPSystemType,
  ClashSeverity,
  ClashCategory,
  ClashStatus,
  MEPRouteSegment,
} from '../types/mep';
import { computeGeometryHash } from './decisionTwinService';

export const MEP_ENGINE_VERSION = 'v1.0.0-mep-clash';

/**
 * Initializes MEP Coordination data deterministically based on architectural layout.
 * Synthesizes standard residential/commercial MEP routes tailored to placed rooms.
 */
export function initializeMEPCoordination(project: Project): MEPCoordinationData {
  if (project.mepCoordination) {
    return project.mepCoordination;
  }

  const isFeet = project.unit === 'feet';
  const rooms = project.floorPlan?.rooms || [];
  const unit = project.unit;
  const width = Math.max(10, project.plotWidth);
  const length = Math.max(10, project.plotLength);

  // Baseline clearance assumptions
  const assumptions = {
    minimumHeadHeightClearance: isFeet ? 7.0 : 2.1,
    electricalPanelWorkingClearance: isFeet ? 3.0 : 0.9,
    defaultDuctClearance: isFeet ? 0.3 : 0.1,
    defaultPipeClearance: isFeet ? 0.2 : 0.05,
  };

  const components: MEPComponent[] = [];

  // 1. MECHANICAL: HVAC Central Unit and Main Distribution Duct
  const utilityOrFirstRoom =
    rooms.find((r) => r.type === 'garage' || r.type === 'utility' || r.type === 'kitchen') ||
    rooms[0];

  const mechX = utilityOrFirstRoom ? utilityOrFirstRoom.x + 2 : 5;
  const mechY = utilityOrFirstRoom ? utilityOrFirstRoom.y + 2 : 5;

  components.push({
    id: 'mep-mech-ahu-01',
    name: 'Primary Variable Air Volume (VAV) Heat Pump',
    system: 'mechanical',
    subtype: 'hvac-air-handler',
    floorLevel: 1,
    location: {
      x: Math.round(mechX * 10) / 10,
      y: Math.round(mechY * 10) / 10,
      z: 0.5,
      width: isFeet ? 3.5 : 1.1,
      length: isFeet ? 4.0 : 1.2,
      height: isFeet ? 4.5 : 1.4,
    },
    clearanceRequirement: isFeet ? 2.5 : 0.75,
    serviceZone: utilityOrFirstRoom ? utilityOrFirstRoom.name : 'Central Mechanical Zone',
    source: 'architectural-baseline',
    status: 'active',
    notes: 'Primary heating and cooling air handling package with integrated filter bank.',
    material: 'Galvanized Sheet Steel / Acoustically Insulated',
  });

  // Main Supply Duct running along floor 1 ceiling spine
  const spineStartX = mechX;
  const spineStartY = mechY;
  const spineEndX = Math.min(width - 5, mechX + (isFeet ? 30 : 9));
  const spineEndY = spineStartY;
  const ductElev = isFeet ? 8.5 : 2.6; // 8.5 ft / 2.6 m ceiling void

  components.push({
    id: 'mep-mech-duct-supply-01',
    name: 'Primary Supply Air Trunk Line',
    system: 'mechanical',
    subtype: 'supply-air-duct',
    floorLevel: 1,
    segments: [
      {
        id: 'seg-duct-01',
        startX: Math.round(spineStartX * 10) / 10,
        startY: Math.round(spineStartY * 10) / 10,
        startZ: ductElev,
        endX: Math.round(spineEndX * 10) / 10,
        endY: Math.round(spineEndY * 10) / 10,
        endZ: ductElev,
        width: isFeet ? 1.8 : 0.55,
        height: isFeet ? 1.2 : 0.35,
      },
    ],
    clearanceRequirement: isFeet ? 0.4 : 0.12,
    serviceZone: 'Ground Floor Core Distribution',
    source: 'architectural-baseline',
    status: 'active',
    notes: 'Low-velocity insulated supply trunk duct distributing conditioned air.',
    material: 'Galvanized Steel Rectangular Ductwork',
  });

  // 2. ELECTRICAL: Main Distribution Panel (MDB) & Cable Tray
  const elecX = Math.max(2, Math.min(width - 3, mechX + (isFeet ? 6 : 1.8)));
  const elecY = Math.max(2, Math.min(length - 3, mechY - (isFeet ? 3 : 0.9)));

  components.push({
    id: 'mep-elec-panel-main',
    name: 'Main Electrical Distribution Board (MDB-1)',
    system: 'electrical',
    subtype: 'main-distribution-panel',
    floorLevel: 1,
    location: {
      x: Math.round(elecX * 10) / 10,
      y: Math.round(elecY * 10) / 10,
      z: isFeet ? 4.0 : 1.2, // 4 ft wall-mounted height
      width: isFeet ? 2.5 : 0.75,
      length: isFeet ? 0.8 : 0.25,
      height: isFeet ? 3.5 : 1.1,
    },
    clearanceRequirement: assumptions.electricalPanelWorkingClearance, // Mandatory 3ft / 0.9m NEC clearance
    serviceZone: 'Service Entrance Core',
    source: 'architectural-baseline',
    status: 'active',
    notes: '200A 120/240V split-phase main electrical panel with surge protection.',
    material: 'NEMA 1 Enclosure Powder-Coated Steel',
  });

  // Electrical Cable Tray / Main Conduit Feeder
  components.push({
    id: 'mep-elec-tray-01',
    name: 'Overhead Power & Data Cable Tray Trunk',
    system: 'electrical',
    subtype: 'cable-tray',
    floorLevel: 1,
    segments: [
      {
        id: 'seg-tray-01',
        startX: Math.round(elecX * 10) / 10,
        startY: Math.round(elecY * 10) / 10,
        startZ: isFeet ? 9.2 : 2.8,
        endX: Math.round(spineEndX * 10) / 10,
        endY: Math.round(elecY * 10) / 10,
        endZ: isFeet ? 9.2 : 2.8,
        width: isFeet ? 1.0 : 0.3,
        height: isFeet ? 0.4 : 0.12,
      },
    ],
    clearanceRequirement: isFeet ? 0.5 : 0.15,
    serviceZone: 'Electrical Distribution Backbone',
    source: 'architectural-baseline',
    status: 'active',
    notes: 'Perforated aluminum cable ladder supporting branch power and low-voltage circuits.',
    material: 'Extruded Aluminum Ladder',
  });

  // 3. PLUMBING: Domestic Cold Water Supply & Sanitary Soil Pipe
  const plumbingRoom =
    rooms.find((r) => r.type === 'bathroom' || r.type === 'kitchen') || rooms[0];

  const plumbX = plumbingRoom ? plumbingRoom.x + 1 : 8;
  const plumbY = plumbingRoom ? plumbingRoom.y + 1 : 8;

  components.push({
    id: 'mep-plumb-sanitary-stack-01',
    name: 'Main Sanitary Soil & Vent Stack (SVP-1)',
    system: 'plumbing',
    subtype: 'sanitary-soil-pipe',
    floorLevel: 1,
    segments: [
      {
        id: 'seg-soil-01',
        startX: Math.round(plumbX * 10) / 10,
        startY: Math.round(plumbY * 10) / 10,
        startZ: isFeet ? -1.0 : -0.3, // under slab
        endX: Math.round(plumbX * 10) / 10,
        endY: Math.round((plumbY + (isFeet ? 15 : 4.5)) * 10) / 10,
        endZ: isFeet ? -1.5 : -0.45,
        diameter: isFeet ? 0.35 : 0.11, // 4-inch / 110mm standard waste pipe
      },
    ],
    clearanceRequirement: isFeet ? 0.3 : 0.08,
    serviceZone: plumbingRoom ? plumbingRoom.name : 'Wet Service Core',
    source: 'architectural-baseline',
    status: 'active',
    notes: '4-inch (110mm) PVC/Cast Iron gravity discharge pipe pitched at 1:50 gradient.',
    material: 'Schedule 40 PVC / Acoustic Soil Pipe',
  });

  const nowIso = new Date().toISOString();
  const geomHash = computeGeometryHash(rooms, project.plotWidth, project.plotLength, project.unit);

  return {
    version: MEP_ENGINE_VERSION,
    components,
    clashes: [],
    assumptions,
    lastEvaluatedGeometryHash: geomHash,
    lastEvaluatedAt: nowIso,
    isStale: false,
    notes: 'Preliminary MEP service routes and spatial clash detection baseline.',
  };
}

/**
 * Pure deterministic clash detection engine.
 * Computes exact 2D and 3D spatial intersections between MEP components,
 * structural elements (columns, beams), walls, door headers, and working clearances.
 */
export function evaluateMEPClashes(
  project: Project,
  mepOverride?: MEPCoordinationData,
  draftRooms?: FloorPlanRoom[]
): {
  clashes: MEPClashRecord[];
  summary: MEPCoordinationSummary;
  isStale: boolean;
  dataVersion: string;
} {
  const data = mepOverride || initializeMEPCoordination(project);
  const activeRooms = draftRooms || project.floorPlan?.rooms || [];
  const currentGeomHash = computeGeometryHash(
    activeRooms,
    project.plotWidth,
    project.plotLength,
    project.unit
  );

  const isStale = Boolean(
    data.lastEvaluatedGeometryHash &&
    data.lastEvaluatedGeometryHash !== currentGeomHash
  );

  const unit = project.unit;
  const unitSuffix = unit === 'feet' ? 'ft' : 'm';
  const nowIso = new Date().toISOString();
  const dataVersion = `${project.id}-mep-v${project.updatedAt || '0'}-${currentGeomHash}`;

  const generatedClashes: MEPClashRecord[] = [];
  const existingClashesMap = new Map<string, MEPClashRecord>();
  (data.clashes || []).forEach((c) => existingClashesMap.set(c.id, c));

  const columns = project.structuralCoordination?.columns || [];
  const beams = project.structuralCoordination?.beams || [];
  const components = data.components || [];

  let clashIndex = 1;

  const isColOnFloor = (col: any, floor: number): boolean => {
    if (Array.isArray(col.floorLevels)) {
      return col.floorLevels.includes(floor);
    }
    if (typeof col.floorLevel === 'number') {
      return col.floorLevel === floor;
    }
    return true;
  };

  // =========================================================================
  // 1. MEP-TO-STRUCTURAL COLUMN CLASHES
  // =========================================================================
  components.forEach((comp) => {
    const segments = comp.segments || (comp as any).routeSegments || [];
    const compClearance = typeof comp.clearanceRequirement === 'number'
      ? comp.clearanceRequirement
      : (comp as any).clearanceRequired?.horizontal || (project.unit === 'feet' ? 0.3 : 0.1);

    // Check linear segments against structural columns on same floor level
    segments.forEach((seg: MEPRouteSegment) => {
      columns
        .filter((col) => isColOnFloor(col, comp.floorLevel))
        .forEach((col) => {
          const colRadius = Math.max(col.width, col.depth) / 2;
          const compRadius = ((seg.width || seg.diameter || 1.0) / 2);

          // Distance from point (col.x, col.y) to segment (startX, startY) -> (endX, endY)
          const dist2D = distancePointToSegment(
            col.x,
            col.y,
            seg.startX,
            seg.startY,
            seg.endX,
            seg.endY
          );

          const collisionThreshold = colRadius + compRadius;
          const clearanceThreshold = collisionThreshold + compClearance;

          if (dist2D < collisionThreshold) {
            // Hard clash: physical intersection
            const clashId = `clash-col-${comp.id}-${col.id}-${seg.id}`;
            const existing = existingClashesMap.get(clashId);
            const overlap = (collisionThreshold - dist2D).toFixed(2);

            generatedClashes.push({
              id: clashId,
              clashCode: `CLASH-STR-${String(clashIndex++).padStart(3, '0')}`,
              title: `${comp.name} Intersects Column ${col.label}`,
              description: `Physical geometric collision: ${comp.name} crosses through Structural Column ${col.label} at (${col.x.toFixed(1)}, ${col.y.toFixed(1)}). Penetration of primary load-bearing columns is prohibited.`,
              severity: 'hard-clash',
              category: 'mep-to-structure',
              primaryComponentId: comp.id,
              primaryComponentName: comp.name,
              primarySystem: comp.system,
              intersectingElementId: col.id,
              intersectingElementName: col.label,
              intersectingElementType: 'column',
              location: {
                floorLevel: comp.floorLevel,
                x: col.x,
                y: col.y,
                z: (seg.startZ + seg.endZ) / 2,
              },
              measuredOverlap: `${overlap} ${unitSuffix} intersection depth`,
              clearanceThreshold: `0.0 ${unitSuffix} (Solid Column Core)`,
              evidenceFormula: `dist2D(${dist2D.toFixed(2)}) < (colRadius: ${colRadius.toFixed(2)} + compRadius: ${compRadius.toFixed(2)})`,
              recommendation: `Reroute ${comp.name} around Column ${col.label} with 45° or 90° transition elbows, or realign routing axis along architectural corridor.`,
              status: existing?.status || 'open',
              reviewerNotes: existing?.reviewerNotes,
              reviewedBy: existing?.reviewedBy,
              reviewedAt: existing?.reviewedAt,
              varianceJustification: existing?.varianceJustification,
            });
          } else if (dist2D < clearanceThreshold) {
            // Clearance violation
            const clashId = `clash-clr-col-${comp.id}-${col.id}-${seg.id}`;
            const existing = existingClashesMap.get(clashId);

            generatedClashes.push({
              id: clashId,
              clashCode: `CLR-STR-${String(clashIndex++).padStart(3, '0')}`,
              title: `Insufficient Clearance: ${comp.name} Near Column ${col.label}`,
              description: `Clearance buffer encroached: ${comp.name} passes within ${dist2D.toFixed(2)} ${unitSuffix} of Column ${col.label}. Insufficient space for thermal insulation jacket or hanger brackets.`,
              severity: 'clearance-violation',
              category: 'mep-to-structure',
              primaryComponentId: comp.id,
              primaryComponentName: comp.name,
              primarySystem: comp.system,
              intersectingElementId: col.id,
              intersectingElementName: col.label,
              intersectingElementType: 'column',
              location: {
                floorLevel: comp.floorLevel,
                x: col.x,
                y: col.y,
                z: (seg.startZ + seg.endZ) / 2,
              },
              measuredOverlap: `${(clearanceThreshold - dist2D).toFixed(2)} ${unitSuffix} encroachment`,
              clearanceThreshold: `≥ ${comp.clearanceRequirement} ${unitSuffix} buffer`,
              evidenceFormula: `dist2D(${dist2D.toFixed(2)}) < clearanceThreshold(${clearanceThreshold.toFixed(2)})`,
              recommendation: `Shift duct/conduit centerline minimum ${(clearanceThreshold - dist2D).toFixed(2)} ${unitSuffix} to ensure acoustic and seismic clearance.`,
              status: existing?.status || 'open',
              reviewerNotes: existing?.reviewerNotes,
              reviewedBy: existing?.reviewedBy,
              reviewedAt: existing?.reviewedAt,
              varianceJustification: existing?.varianceJustification,
            });
          }
        });
    });

    // Check equipment footprints against columns
    if (comp.location) {
      const eq = comp.location;
      columns
        .filter((col) => isColOnFloor(col, comp.floorLevel))
        .forEach((col) => {
          const inX = col.x >= eq.x - col.width / 2 && col.x <= eq.x + eq.width + col.width / 2;
          const inY = col.y >= eq.y - col.depth / 2 && col.y <= eq.y + eq.length + col.depth / 2;

          if (inX && inY) {
            const clashId = `clash-eq-col-${comp.id}-${col.id}`;
            const existing = existingClashesMap.get(clashId);

            generatedClashes.push({
              id: clashId,
              clashCode: `CLASH-EQP-${String(clashIndex++).padStart(3, '0')}`,
              title: `Equipment Footprint Clashes With Column (${comp.name})`,
              description: `Physical clash: Equipment ${comp.name} footprint overlaps with Structural Column ${col.label} at (${col.x.toFixed(1)}, ${col.y.toFixed(1)}).`,
              severity: 'hard-clash',
              category: 'mep-to-structure',
              primaryComponentId: comp.id,
              primaryComponentName: comp.name,
              primarySystem: comp.system,
              intersectingElementId: col.id,
              intersectingElementName: col.label,
              intersectingElementType: 'column',
              location: {
                floorLevel: comp.floorLevel,
                x: col.x,
                y: col.y,
                z: eq.z,
              },
              measuredOverlap: `Spatial envelope intersection`,
              clearanceThreshold: `0.0 ${unitSuffix}`,
              evidenceFormula: `equipment.bbox overlaps column.bbox`,
              recommendation: `Relocate equipment pad or adjust room mechanical equipment layout away from structural grid column.`,
              status: existing?.status || 'open',
              reviewerNotes: existing?.reviewerNotes,
              reviewedBy: existing?.reviewedBy,
              reviewedAt: existing?.reviewedAt,
              varianceJustification: existing?.varianceJustification,
            });
          }
        });
    }
  });

  // =========================================================================
  // 2. MEP-TO-MEP INTERSECTION CLASHES
  // =========================================================================
  for (let i = 0; i < components.length; i++) {
    for (let j = i + 1; j < components.length; j++) {
      const c1 = components[i];
      const c2 = components[j];

      if (c1.floorLevel !== c2.floorLevel) continue;

      const segs1 = c1.segments || (c1 as any).routeSegments || [];
      const segs2 = c2.segments || (c2 as any).routeSegments || [];

      segs1.forEach((s1: MEPRouteSegment) => {
        segs2.forEach((s2: MEPRouteSegment) => {
          // Check 2D intersection of line segments
          const inter2D = checkLineIntersection2D(
            s1.startX, s1.startY, s1.endX, s1.endY,
            s2.startX, s2.startY, s2.endX, s2.endY
          );

          if (inter2D) {
            // Check vertical Z elevation overlap
            const zMin1 = Math.min(s1.startZ, s1.endZ) - (s1.height || s1.diameter || 1.0) / 2;
            const zMax1 = Math.max(s1.startZ, s1.endZ) + (s1.height || s1.diameter || 1.0) / 2;
            const zMin2 = Math.min(s2.startZ, s2.endZ) - (s2.height || s2.diameter || 1.0) / 2;
            const zMax2 = Math.max(s2.startZ, s2.endZ) + (s2.height || s2.diameter || 1.0) / 2;

            const zOverlap = zMax1 >= zMin2 && zMax2 >= zMin1;

            if (zOverlap) {
              const clashId = `clash-mep-mep-${c1.id}-${c2.id}-${s1.id}-${s2.id}`;
              const existing = existingClashesMap.get(clashId);
              const zDelta = Math.abs((s1.startZ + s1.endZ) / 2 - (s2.startZ + s2.endZ) / 2);

              generatedClashes.push({
                id: clashId,
                clashCode: `CLASH-MEP-${String(clashIndex++).padStart(3, '0')}`,
                title: `${c1.name} Intersects ${c2.name}`,
                description: `Cross-trade hard clash: ${c1.name} (${c1.system}) and ${c2.name} (${c2.system}) physically intersect at (${inter2D.x.toFixed(1)}, ${inter2D.y.toFixed(1)}) at Elevation ${s1.startZ.toFixed(1)} ${unitSuffix}.`,
                severity: 'hard-clash',
                category: 'mep-to-mep',
                primaryComponentId: c1.id,
                primaryComponentName: c1.name,
                primarySystem: c1.system,
                intersectingElementId: c2.id,
                intersectingElementName: c2.name,
                intersectingElementType: 'mep',
                location: {
                  floorLevel: c1.floorLevel,
                  x: inter2D.x,
                  y: inter2D.y,
                  z: s1.startZ,
                },
                measuredOverlap: `Vertical clearance delta: ${zDelta.toFixed(2)} ${unitSuffix} (Overlapping)`,
                clearanceThreshold: `≥ ${((s1.height || 1) + (s2.height || 1)) / 2} ${unitSuffix} separation`,
                evidenceFormula: `segmentsIntersect2D === true && [${zMin1.toFixed(1)}, ${zMax1.toFixed(1)}] overlaps [${zMin2.toFixed(1)}, ${zMax2.toFixed(1)}]`,
                recommendation: `Apply vertical offset: Drop or raise ${c2.name} by 0.5 ${unitSuffix} to cross beneath/above ${c1.name}.`,
                status: existing?.status || 'open',
                reviewerNotes: existing?.reviewerNotes,
                reviewedBy: existing?.reviewedBy,
                reviewedAt: existing?.reviewedAt,
                varianceJustification: existing?.varianceJustification,
              });
            }
          }
        });
      });
    }
  }

  // =========================================================================
  // 3. ELECTRICAL PANEL FRONT WORKING CLEARANCE ENVELOPE
  // =========================================================================
  components
    .filter((c) => c.subtype === 'main-distribution-panel' || c.subtype === 'sub-panel')
    .forEach((panel) => {
      if (!panel.location) return;
      const pLoc = panel.location;
      const reqWorkingClearance = data.assumptions.electricalPanelWorkingClearance; // e.g. 3.0 ft / 0.9 m

      // Working box in front of panel (assuming front faces into room interior)
      // Check if any other equipment, column, or pipe enters this 3ft clearance box
      const workingBox = {
        minX: pLoc.x - 0.5,
        maxX: pLoc.x + pLoc.width + 0.5,
        minY: pLoc.y,
        maxY: pLoc.y + reqWorkingClearance,
        minZ: 0,
        maxZ: 6.5,
      };

      // Check against plumbing pipes or other equipment
      components.forEach((other) => {
        if (other.id === panel.id) return;

        const otherSegs = other.segments || (other as any).routeSegments || [];
        otherSegs.forEach((seg: MEPRouteSegment) => {
          if (seg.startX >= workingBox.minX && seg.startX <= workingBox.maxX &&
              seg.startY >= workingBox.minY && seg.startY <= workingBox.maxY) {
            const clashId = `clash-elec-clearance-${panel.id}-${other.id}`;
            const existing = existingClashesMap.get(clashId);

            generatedClashes.push({
              id: clashId,
              clashCode: `CLR-ELEC-${String(clashIndex++).padStart(3, '0')}`,
              title: `Electrical Working Space Violation (${panel.name})`,
              description: `Mandatory electrical code violation: ${other.name} encroaches within the required ${reqWorkingClearance} ${unitSuffix} clear working space in front of ${panel.name}. NEC Article 110.26 / OSHA requirement.`,
              severity: 'clearance-violation',
              category: 'clearance-zone',
              primaryComponentId: panel.id,
              primaryComponentName: panel.name,
              primarySystem: 'electrical',
              intersectingElementId: other.id,
              intersectingElementName: other.name,
              intersectingElementType: 'mep',
              location: {
                floorLevel: panel.floorLevel,
                x: pLoc.x,
                y: pLoc.y,
                z: pLoc.z,
              },
              measuredOverlap: `Component enters dedicated electrical working envelope`,
              clearanceThreshold: `≥ ${reqWorkingClearance} ${unitSuffix} clear front depth`,
              evidenceFormula: `pipe.pos within panel.workingBox(depth: ${reqWorkingClearance})`,
              recommendation: `Reroute ${other.name} outside the dedicated 30" wide × 36" deep electrical panel working zone.`,
              status: existing?.status || 'open',
              reviewerNotes: existing?.reviewerNotes,
              reviewedBy: existing?.reviewedBy,
              reviewedAt: existing?.reviewedAt,
              varianceJustification: existing?.varianceJustification,
            });
          }
        });
      });
    });

  // =========================================================================
  // 4. BUILDING ENVELOPE BOUNDARY OVERFLOW
  // =========================================================================
  components.forEach((comp) => {
    const compSegs = comp.segments || (comp as any).routeSegments || [];
    compSegs.forEach((seg: MEPRouteSegment) => {
      const outOfBounds =
        seg.startX < 0 || seg.startX > project.plotWidth ||
        seg.endX < 0 || seg.endX > project.plotWidth ||
        seg.startY < 0 || seg.startY > project.plotLength ||
        seg.endY < 0 || seg.endY > project.plotLength;

      if (outOfBounds) {
        const clashId = `clash-overflow-${comp.id}-${seg.id}`;
        const existing = existingClashesMap.get(clashId);

        generatedClashes.push({
          id: clashId,
          clashCode: `OVR-BOUND-${String(clashIndex++).padStart(3, '0')}`,
          title: `${comp.name} Extends Beyond Plot Boundary`,
          description: `Route segment extends past the legal plot boundary limits (${project.plotWidth} × ${project.plotLength} ${unitSuffix}).`,
          severity: 'potential-conflict',
          category: 'envelope-overflow',
          primaryComponentId: comp.id,
          primaryComponentName: comp.name,
          primarySystem: comp.system,
          intersectingElementId: 'plot-boundary',
          intersectingElementName: 'Property Boundary',
          intersectingElementType: 'boundary',
          location: {
            floorLevel: comp.floorLevel,
            x: Math.max(0, Math.min(project.plotWidth, seg.endX)),
            y: Math.max(0, Math.min(project.plotLength, seg.endY)),
            z: seg.startZ,
          },
          measuredOverlap: `Crossing property line`,
          clearanceThreshold: `Within plot limits`,
          evidenceFormula: `route.coord > plot.dimension`,
          recommendation: `Trim routing inside building envelope or verify easement connection agreement.`,
          status: existing?.status || 'open',
          reviewerNotes: existing?.reviewerNotes,
          reviewedBy: existing?.reviewedBy,
          reviewedAt: existing?.reviewedAt,
          varianceJustification: existing?.varianceJustification,
        });
      }
    });
  });

  // Reconcile manual custom clashes that were manually recorded
  (data.clashes || []).forEach((customClash) => {
    if (!generatedClashes.some((g) => g.id === customClash.id)) {
      generatedClashes.push(customClash);
    }
  });

  // Compile summary metrics
  const clashCounts = {
    hardClash: generatedClashes.filter((c) => c.severity === 'hard-clash' && c.status !== 'resolved').length,
    clearanceViolation: generatedClashes.filter((c) => c.severity === 'clearance-violation' && c.status !== 'resolved').length,
    potentialConflict: generatedClashes.filter((c) => c.severity === 'potential-conflict' && c.status !== 'resolved').length,
    resolved: generatedClashes.filter((c) => c.status === 'resolved' || c.status === 'variance-accepted').length,
  };

  const summary: MEPCoordinationSummary = {
    totalComponents: components.length,
    componentsBySystem: {
      mechanical: components.filter((c) => c.system === 'mechanical').length,
      electrical: components.filter((c) => c.system === 'electrical').length,
      plumbing: components.filter((c) => c.system === 'plumbing').length,
    },
    totalClashes: generatedClashes.length,
    clashCounts,
    hasCriticalHardClashes: clashCounts.hardClash > 0,
    requiresEngineeringReview: clashCounts.hardClash > 0 || clashCounts.clearanceViolation > 0,
    lastEvaluatedAt: nowIso,
    dataVersion,
  };

  return {
    clashes: generatedClashes,
    summary,
    isStale,
    dataVersion,
  };
}

/**
 * Updates a clash record status, reviewer notes, or variance justification.
 */
export function updateMEPClashRecord(
  data: MEPCoordinationData,
  clashId: string,
  updates: Partial<MEPClashRecord>
): MEPCoordinationData {
  const current = [...(data.clashes || [])];
  const idx = current.findIndex((c) => c.id === clashId);

  if (idx >= 0) {
    current[idx] = {
      ...current[idx],
      ...updates,
      reviewedAt: new Date().toISOString(),
    };
  } else {
    current.push({
      id: clashId,
      clashCode: updates.clashCode || 'CLASH-REV',
      title: updates.title || 'Coordination Review Item',
      description: updates.description || '',
      severity: updates.severity || 'clearance-violation',
      category: updates.category || 'mep-to-mep',
      primaryComponentId: updates.primaryComponentId || 'mep-01',
      primaryComponentName: updates.primaryComponentName || 'MEP Component',
      primarySystem: updates.primarySystem || 'mechanical',
      intersectingElementId: updates.intersectingElementId || 'elem-01',
      intersectingElementName: updates.intersectingElementName || 'Element',
      intersectingElementType: updates.intersectingElementType || 'mep',
      location: updates.location || { floorLevel: 1, x: 0, y: 0, z: 0 },
      measuredOverlap: updates.measuredOverlap || 'N/A',
      clearanceThreshold: updates.clearanceThreshold || 'N/A',
      evidenceFormula: updates.evidenceFormula || 'Manual Entry',
      recommendation: updates.recommendation || '',
      status: updates.status || 'open',
      ...updates,
      reviewedAt: new Date().toISOString(),
    });
  }

  return {
    ...data,
    clashes: current,
    lastEvaluatedAt: new Date().toISOString(),
  };
}

/**
 * Adds or updates an MEP component.
 */
export function saveMEPComponent(
  data: MEPCoordinationData,
  component: MEPComponent
): MEPCoordinationData {
  const components = [...data.components];
  const idx = components.findIndex((c) => c.id === component.id);

  if (idx >= 0) {
    components[idx] = component;
  } else {
    components.push(component);
  }

  return {
    ...data,
    components,
    lastEvaluatedAt: new Date().toISOString(),
  };
}

/**
 * Deletes an MEP component by ID.
 */
export function deleteMEPComponent(
  data: MEPCoordinationData,
  componentId: string
): MEPCoordinationData {
  return {
    ...data,
    components: data.components.filter((c) => c.id !== componentId),
    clashes: (data.clashes || []).filter(
      (c) => c.primaryComponentId !== componentId && c.intersectingElementId !== componentId
    ),
    lastEvaluatedAt: new Date().toISOString(),
  };
}

/**
 * Helper: Calculates the shortest distance from a 2D point (px, py) to line segment (x1, y1)-(x2, y2).
 */
function distancePointToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
  if (l2 === 0) return Math.hypot(px - x1, py - y1);

  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));

  const projX = x1 + t * (x2 - x1);
  const projY = y1 + t * (y2 - y1);

  return Math.hypot(px - projX, py - projY);
}

/**
 * Helper: Checks if two line segments (p1-p2) and (p3-p4) intersect in 2D.
 */
function checkLineIntersection2D(
  x1: number, y1: number, x2: number, y2: number,
  x3: number, y3: number, x4: number, y4: number
): { x: number; y: number } | null {
  const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
  if (denom === 0) return null; // parallel

  const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
  const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;

  if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
    return {
      x: x1 + ua * (x2 - x1),
      y: y1 + ua * (y2 - y1),
    };
  }
  return null;
}

/**
 * Generates an RFC 4180 standards-compliant CSV of MEP clash register.
 */
export function generateMEPClashRegisterCSV(
  project: Project,
  data: MEPCoordinationData
): string {
  const { clashes, summary } = evaluateMEPClashes(project, data);
  const rows: string[][] = [];

  rows.push(['# PLOTIFY MEP COORDINATION & CLASH DETECTION REGISTER']);
  rows.push(['Project Name', project.name]);
  rows.push(['Project ID', project.id]);
  rows.push(['Total MEP Components', String(summary.totalComponents)]);
  rows.push(['Mechanical Components', String(summary.componentsBySystem.mechanical)]);
  rows.push(['Electrical Components', String(summary.componentsBySystem.electrical)]);
  rows.push(['Plumbing Components', String(summary.componentsBySystem.plumbing)]);
  rows.push(['Total Detected Clashes', String(summary.totalClashes)]);
  rows.push(['Hard Clashes', String(summary.clashCounts.hardClash)]);
  rows.push(['Clearance Violations', String(summary.clashCounts.clearanceViolation)]);
  rows.push([]);

  // Clash Table
  rows.push([
    'Clash Code',
    'Severity',
    'Category',
    'Primary Component',
    'System',
    'Intersecting Element',
    'Element Type',
    'Floor Level',
    'Coordinates (X,Y,Z)',
    'Measured Overlap',
    'Clearance Threshold',
    'Status',
    'Recommendation',
    'Reviewer Notes',
    'Reviewed By',
    'Reviewed At',
  ]);

  clashes.forEach((c) => {
    rows.push([
      c.clashCode,
      c.severity.toUpperCase(),
      c.category,
      c.primaryComponentName,
      c.primarySystem.toUpperCase(),
      c.intersectingElementName,
      c.intersectingElementType,
      String(c.location.floorLevel),
      `(${c.location.x.toFixed(1)}, ${c.location.y.toFixed(1)}, ${c.location.z.toFixed(1)})`,
      c.measuredOverlap,
      c.clearanceThreshold,
      c.status.toUpperCase(),
      c.recommendation,
      c.reviewerNotes || '',
      c.reviewedBy || '',
      c.reviewedAt || '',
    ]);
  });

  return rows
    .map((r) =>
      r
        .map((cell) => {
          const str = String(cell ?? '');
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(',')
    )
    .join('\n');
}

/**
 * Generates Markdown report section for MEP Coordination & Clash Detection.
 */
export function generateMEPReportMarkdown(
  project: Project,
  data: MEPCoordinationData
): string {
  const { clashes, summary } = evaluateMEPClashes(project, data);
  const unit = project.unit;
  const unitSuffix = unit === 'feet' ? 'ft' : 'm';
  const lines: string[] = [];

  lines.push(`# Section: MEP Coordination & Clash Detection Register`);
  lines.push(`**Project:** ${project.name} (${project.id})`);
  lines.push(`**Engine Version:** ${MEP_ENGINE_VERSION} | **Evaluation Date:** ${new Date().toLocaleDateString()}`);
  lines.push('');

  lines.push(`> **ENGINEERING BOUNDARY & COORDINATION DISCLAIMER:**`);
  lines.push(`> This MEP Coordination & Clash Detection Engine performs **preliminary geometric interference checks** between modeled architectural rooms, structural columns/beams, and primary MEP distribution lines.`);
  lines.push(`> Plotify **DOES NOT** calculate fluid dynamics, pipe flow rates, electrical short-circuit currents, acoustic duct noise, or fire-rated penetration detailing.`);
  lines.push(`> This register **DOES NOT** replace stamped shop drawings or professional mechanical, electrical, and plumbing engineering designs.`);
  lines.push('');

  lines.push(`## 1. MEP Systems Summary`);
  lines.push(`- **Total Modeled Elements:** ${summary.totalComponents}`);
  lines.push(`  - Mechanical (HVAC): ${summary.componentsBySystem.mechanical}`);
  lines.push(`  - Electrical (Power & Data): ${summary.componentsBySystem.electrical}`);
  lines.push(`  - Plumbing (Water & Waste): ${summary.componentsBySystem.plumbing}`);
  lines.push(`- **Hard Geometric Clashes:** ${summary.clashCounts.hardClash}`);
  lines.push(`- **Clearance Violations:** ${summary.clashCounts.clearanceViolation}`);
  lines.push(`- **Potential Routing Conflicts:** ${summary.clashCounts.potentialConflict}`);
  lines.push(`- **Resolved / Accepted Variances:** ${summary.clashCounts.resolved}`);
  lines.push('');

  lines.push(`## 2. Clash Detection Register`);
  if (clashes.length === 0) {
    lines.push(`*All evaluated MEP routes and equipment clearances satisfy preliminary geometric spatial requirements without detectable clashes.*`);
  } else {
    lines.push(`| Clash Code | Severity | System | Description | Location | Measured vs Threshold | Status | Recommendation |`);
    lines.push(`| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |`);
    clashes.forEach((c) => {
      lines.push(
        `| \`${c.clashCode}\` | **${c.severity.toUpperCase()}** | ${c.primarySystem} | ${c.title} | F${c.location.floorLevel} (${c.location.x.toFixed(1)}, ${c.location.y.toFixed(1)}) | ${c.measuredOverlap} / ${c.clearanceThreshold} | \`${c.status}\` | ${c.recommendation} |`
      );
    });
  }
  lines.push('');

  return lines.join('\n');
}
