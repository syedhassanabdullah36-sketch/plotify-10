/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * P47 — Construction Site Logistics Planner Service
 * Deterministic spatial & schedule conflict detection, vehicle route network analysis,
 * pedestrian segregation verification, crane & lifting safety gates, phase evolution,
 * non-destructive alternative comparison, and evidence-based reporting.
 */

import { Project, MeasurementUnit, RoadFacingSide } from '../types/project';
import {
  SITE_LOGISTICS_PROFILE_ID,
  SiteLogisticsPlan,
  SiteLogisticsPhase,
  SiteAccessPointRecord,
  VehicleRouteRecord,
  PedestrianRouteRecord,
  SiteLogisticsZoneRecord,
  ConstructionEquipmentPlacement,
  LiftingOperationPlan,
  TemporaryFacilityRecord,
  TemporaryUtilityRequirement,
  EmergencyAccessRequirement,
  SiteRestrictionRecord,
  DeliveryRequirementRecord,
  LogisticsConflictRecord,
  LogisticsRiskFinding,
  RouteDistanceTravelAnalysis,
  PhaseSpaceUtilizationSummary,
  TransportCarbonCompatibilitySummary,
  CrossDisciplineContextSummary,
  SiteLogisticsMetricsSummary,
  LogisticsAlternativeModification,
  LogisticsAlternativePreview,
  SiteLogisticsStalenessReport,
  SiteBoundingBox2D,
  SitePoint2D,
  VehicleCategory,
} from '../types/siteLogistics';
import { createProjectSnapshot } from './versioningService';

const FEET_TO_METRES = 0.3048;

export function toMetres(val: number, unit: MeasurementUnit): number {
  return unit === 'feet' ? Number((val * FEET_TO_METRES).toFixed(3)) : Number(val.toFixed(3));
}

export function fromMetres(valM: number, unit: MeasurementUnit): number {
  return unit === 'feet' ? Number((valM / FEET_TO_METRES).toFixed(2)) : Number(valM.toFixed(2));
}

export interface VehicleDesignStandard {
  category: VehicleCategory;
  label: string;
  typicalLengthM: number;
  typicalWidthM: number;
  minCorridorWidthM: number;
  minInnerTurningRadiusM: number;
  minVerticalClearanceM: number;
  typicalGrossWeightTonnes: number;
}

export const VEHICLE_DESIGN_CATALOG: Record<VehicleCategory, VehicleDesignStandard> = {
  light_van_utility: {
    category: 'light_van_utility',
    label: 'Light Commercial Van / Utility (6.0 m)',
    typicalLengthM: 6.0,
    typicalWidthM: 2.1,
    minCorridorWidthM: 3.2,
    minInnerTurningRadiusM: 6.0,
    minVerticalClearanceM: 2.8,
    typicalGrossWeightTonnes: 3.5,
  },
  rigid_flatbed_10m: {
    category: 'rigid_flatbed_10m',
    label: 'Rigid Flatbed Delivery Truck (10.0 m)',
    typicalLengthM: 10.0,
    typicalWidthM: 2.55,
    minCorridorWidthM: 3.7,
    minInnerTurningRadiusM: 8.5,
    minVerticalClearanceM: 4.0,
    typicalGrossWeightTonnes: 18.0,
  },
  concrete_mixer_9m: {
    category: 'concrete_mixer_9m',
    label: '4-Axle Ready-Mix Concrete Agitator (9.2 m)',
    typicalLengthM: 9.2,
    typicalWidthM: 2.55,
    minCorridorWidthM: 3.8,
    minInnerTurningRadiusM: 9.0,
    minVerticalClearanceM: 4.2,
    typicalGrossWeightTonnes: 32.0,
  },
  articulated_hgv_16_5m: {
    category: 'articulated_hgv_16_5m',
    label: 'Articulated HGV Semi-Trailer (16.5 m)',
    typicalLengthM: 16.5,
    typicalWidthM: 2.55,
    minCorridorWidthM: 4.2,
    minInnerTurningRadiusM: 11.5,
    minVerticalClearanceM: 4.5,
    typicalGrossWeightTonnes: 40.0,
  },
  mobile_crane_carrier: {
    category: 'mobile_crane_carrier',
    label: 'All-Terrain Mobile Crane Carrier (14.0 m)',
    typicalLengthM: 14.0,
    typicalWidthM: 2.75,
    minCorridorWidthM: 4.5,
    minInnerTurningRadiusM: 12.5,
    minVerticalClearanceM: 4.5,
    typicalGrossWeightTonnes: 60.0,
  },
  low_loader_plant: {
    category: 'low_loader_plant',
    label: 'Heavy Plant Low-Loader Transporter (18.0 m)',
    typicalLengthM: 18.0,
    typicalWidthM: 2.75,
    minCorridorWidthM: 4.5,
    minInnerTurningRadiusM: 13.5,
    minVerticalClearanceM: 4.8,
    typicalGrossWeightTonnes: 65.0,
  },
  fire_appliance_emergency: {
    category: 'fire_appliance_emergency',
    label: 'Emergency Fire Appliance Pump / Ladder (8.5 m)',
    typicalLengthM: 8.5,
    typicalWidthM: 2.5,
    minCorridorWidthM: 3.7,
    minInnerTurningRadiusM: 8.5,
    minVerticalClearanceM: 4.0,
    typicalGrossWeightTonnes: 18.0,
  },
};

/**
 * Extracts the building footprint bounding box in metres from the project's 2D floor plan
 * or setback envelope without modifying project geometry.
 */
export function extractBuildingBoundsMetres(project: Project): SiteBoundingBox2D {
  const siteW = toMetres(project.plotWidth, project.unit);
  const siteL = toMetres(project.plotLength, project.unit);
  const rooms = project.floorPlan?.rooms || [];
  const groundRooms = rooms.filter((r) => r.floorLevel === 1);
  const targetRooms = groundRooms.length > 0 ? groundRooms : rooms;

  if (targetRooms.length > 0) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const r of targetRooms) {
      const rx = toMetres(r.x, project.unit);
      const ry = toMetres(r.y, project.unit);
      const rw = toMetres(r.width, project.unit);
      const rl = toMetres(r.length, project.unit);
      if (rx < minX) minX = rx;
      if (ry < minY) minY = ry;
      if (rx + rw > maxX) maxX = rx + rw;
      if (ry + rl > maxY) maxY = ry + rl;
    }
    return {
      x: Number(Math.max(0, minX).toFixed(2)),
      y: Number(Math.max(0, minY).toFixed(2)),
      widthM: Number(Math.max(2, maxX - minX).toFixed(2)),
      lengthM: Number(Math.max(2, maxY - minY).toFixed(2)),
    };
  }

  // Fallback to setback-derived central footprint if no 2D rooms placed yet
  const frontSetback = project.siteContext?.setbacks?.front
    ? toMetres(project.siteContext.setbacks.front, project.unit)
    : Math.min(4.5, siteL * 0.2);
  const rearSetback = project.siteContext?.setbacks?.rear
    ? toMetres(project.siteContext.setbacks.rear, project.unit)
    : Math.min(4.0, siteL * 0.2);
  const leftSetback = project.siteContext?.setbacks?.sideLeft
    ? toMetres(project.siteContext.setbacks.sideLeft, project.unit)
    : Math.min(2.5, siteW * 0.15);
  const rightSetback = project.siteContext?.setbacks?.sideRight
    ? toMetres(project.siteContext.setbacks.sideRight, project.unit)
    : Math.min(2.5, siteW * 0.15);

  const availW = Math.max(4, siteW - leftSetback - rightSetback);
  const availL = Math.max(4, siteL - frontSetback - rearSetback);
  const bW = Number((availW * 0.65).toFixed(2));
  const bL = Number((availL * 0.65).toFixed(2));
  return {
    x: Number((leftSetback + (availW - bW) * 0.5).toFixed(2)),
    y: Number((frontSetback + (availL - bL) * 0.4).toFixed(2)),
    widthM: bW,
    lengthM: bL,
  };
}

/**
 * Computes a deterministic fingerprint of project geometry and site context inputs
 * so staleness is detected whenever plot dimensions, rooms, setbacks, obstacles, or terrain change.
 */
export function computeSiteLogisticsFingerprint(project: Project): string {
  const bBounds = extractBuildingBoundsMetres(project);
  const obstaclesKey = (project.siteContext?.obstacles || [])
    .map((o) => `${o.id}:${o.x},${o.y},${o.width},${o.length},${o.preservationStatus}`)
    .join('|');
  const accessKey = (project.siteContext?.accessPoints || [])
    .map((a) => `${a.id}:${a.side}:${a.offsetAlongSide}:${a.width}`)
    .join('|');
  const terrainSlope = project.terrainModeling?.analysis?.maxSlopePercent ?? project.siteContext?.slope ?? 'none';
  const cadCount = project.cadInterop?.referenceEntities?.length ?? 0;
  const ifcCount = project.ifcInterop?.preservedElements?.length ?? 0;
  const envCount = project.envelopePerformance?.activeAssessment?.assemblies?.length ?? 0;

  return [
    `plot:${project.plotWidth}x${project.plotLength}:${project.unit}:${project.roadFacing}:${project.floors}`,
    `bldg:${bBounds.x},${bBounds.y},${bBounds.widthM},${bBounds.lengthM}`,
    `obs:${obstaclesKey}`,
    `acc:${accessKey}`,
    `ter:${terrainSlope}`,
    `cad:${cadCount}:ifc:${ifcCount}:env:${envCount}`,
  ].join('::');
}

/**
 * Checks whether an existing SiteLogisticsPlan is stale relative to current project geometry.
 */
export function checkSiteLogisticsStaleness(
  project: Project,
  plan?: SiteLogisticsPlan
): SiteLogisticsStalenessReport {
  const targetPlan = plan || project.siteLogistics?.activePlan;
  const currentFingerprint = computeSiteLogisticsFingerprint(project);
  if (!targetPlan) {
    return {
      isStale: false,
      reasons: [],
      recordedFingerprint: currentFingerprint,
      currentFingerprint,
    };
  }

  const reasons: string[] = [];
  if (targetPlan.geometryFingerprint !== currentFingerprint) {
    const oldParts = targetPlan.geometryFingerprint.split('::');
    const newParts = currentFingerprint.split('::');
    if (oldParts[0] !== newParts[0]) {
      reasons.push('Project plot dimensions, measurement unit, road orientation, or storey count changed.');
    }
    if (oldParts[1] !== newParts[1]) {
      reasons.push('Building ground footprint geometry changed in the 2D floor plan.');
    }
    if (oldParts[2] !== newParts[2]) {
      reasons.push('Site obstacles or preservation statuses changed in Site Context.');
    }
    if (oldParts[3] !== newParts[3]) {
      reasons.push('Site access points changed in Site Context.');
    }
    if (oldParts[4] !== newParts[4]) {
      reasons.push('Terrain slope or topographic model parameters changed.');
    }
    if (oldParts[5] !== newParts[5]) {
      reasons.push('Linked CAD, IFC, or Envelope Performance references changed.');
    }
  }

  return {
    isStale: reasons.length > 0,
    reasons,
    recordedFingerprint: targetPlan.geometryFingerprint,
    currentFingerprint,
  };
}

// ---------------------------------------------------------------------------
// GEOMETRIC HELPER FUNCTIONS
// ---------------------------------------------------------------------------

export function getActiveBuildingBoundsForPhase(
  baseBounds: SiteBoundingBox2D,
  phase: SiteLogisticsPhase | undefined
): SiteBoundingBox2D {
  if (!phase) return baseBounds;
  const ratio = Math.max(0.2, Math.min(1.0, phase.activeBuildingFootprintRatio));
  const scaledW = Number((baseBounds.widthM * Math.sqrt(ratio)).toFixed(2));
  const scaledL = Number((baseBounds.lengthM * Math.sqrt(ratio)).toFixed(2));
  return {
    x: Number((baseBounds.x + (baseBounds.widthM - scaledW) * 0.5).toFixed(2)),
    y: Number((baseBounds.y + (baseBounds.lengthM - scaledL) * 0.5).toFixed(2)),
    widthM: scaledW,
    lengthM: scaledL,
  };
}

export function boxesOverlap(a: SiteBoundingBox2D, b: SiteBoundingBox2D, marginM = 0): boolean {
  return (
    a.x - marginM < b.x + b.widthM &&
    a.x + a.widthM + marginM > b.x &&
    a.y - marginM < b.y + b.lengthM &&
    a.y + a.lengthM + marginM > b.y
  );
}

export function boxIntersectionArea(a: SiteBoundingBox2D, b: SiteBoundingBox2D): number {
  const xOverlap = Math.max(0, Math.min(a.x + a.widthM, b.x + b.widthM) - Math.max(a.x, b.x));
  const yOverlap = Math.max(0, Math.min(a.y + a.lengthM, b.y + b.lengthM) - Math.max(a.y, b.y));
  return Number((xOverlap * yOverlap).toFixed(2));
}

export function isBoxInsideSite(box: SiteBoundingBox2D, siteW: number, siteL: number, toleranceM = 0.05): boolean {
  return (
    box.x >= -toleranceM &&
    box.y >= -toleranceM &&
    box.x + box.widthM <= siteW + toleranceM &&
    box.y + box.lengthM <= siteL + toleranceM
  );
}

export function boxCenter(box: SiteBoundingBox2D): SitePoint2D {
  return {
    x: Number((box.x + box.widthM * 0.5).toFixed(2)),
    y: Number((box.y + box.lengthM * 0.5).toFixed(2)),
  };
}

export function euclideanDistance(p1: SitePoint2D, p2: SitePoint2D): number {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

export function pointToSegmentDistance(p: SitePoint2D, v: SitePoint2D, w: SitePoint2D): number {
  const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
  if (l2 === 0) return euclideanDistance(p, v);
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return euclideanDistance(p, {
    x: v.x + t * (w.x - v.x),
    y: v.y + t * (w.y - v.y),
  });
}

export function segmentsIntersect(
  p1: SitePoint2D,
  p2: SitePoint2D,
  p3: SitePoint2D,
  p4: SitePoint2D
): SitePoint2D | null {
  const d1x = p2.x - p1.x;
  const d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x;
  const d2y = p4.y - p3.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-9) return null;

  const s = (-d1y * (p1.x - p3.x) + d1x * (p1.y - p3.y)) / denom;
  const t = (d2x * (p1.y - p3.y) - d2y * (p1.x - p3.x)) / denom;

  if (s >= 0 && s <= 1 && t >= 0 && t <= 1) {
    return {
      x: Number((p1.x + t * d1x).toFixed(2)),
      y: Number((p1.y + t * d1y).toFixed(2)),
    };
  }
  return null;
}

export function polylineIntersectsBox(
  waypoints: SitePoint2D[],
  corridorHalfWidthM: number,
  box: SiteBoundingBox2D
): boolean {
  const expandedBox: SiteBoundingBox2D = {
    x: box.x - corridorHalfWidthM,
    y: box.y - corridorHalfWidthM,
    widthM: box.widthM + 2 * corridorHalfWidthM,
    lengthM: box.lengthM + 2 * corridorHalfWidthM,
  };

  for (let i = 0; i < waypoints.length; i++) {
    const pt = waypoints[i];
    if (
      pt.x >= expandedBox.x &&
      pt.x <= expandedBox.x + expandedBox.widthM &&
      pt.y >= expandedBox.y &&
      pt.y <= expandedBox.y + expandedBox.lengthM
    ) {
      return true;
    }
    if (i < waypoints.length - 1) {
      const next = waypoints[i + 1];
      const corners: [SitePoint2D, SitePoint2D][] = [
        [
          { x: expandedBox.x, y: expandedBox.y },
          { x: expandedBox.x + expandedBox.widthM, y: expandedBox.y },
        ],
        [
          { x: expandedBox.x + expandedBox.widthM, y: expandedBox.y },
          { x: expandedBox.x + expandedBox.widthM, y: expandedBox.y + expandedBox.lengthM },
        ],
        [
          { x: expandedBox.x + expandedBox.widthM, y: expandedBox.y + expandedBox.lengthM },
          { x: expandedBox.x, y: expandedBox.y + expandedBox.lengthM },
        ],
        [
          { x: expandedBox.x, y: expandedBox.y + expandedBox.lengthM },
          { x: expandedBox.x, y: expandedBox.y },
        ],
      ];
      for (const [c1, c2] of corners) {
        if (segmentsIntersect(pt, next, c1, c2)) {
          return true;
        }
      }
    }
  }
  return false;
}

function parseTimeMinutes(hhmm: string): number {
  const parts = hhmm.split(':').map((n) => parseInt(n, 10));
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return 0;
  return parts[0] * 60 + parts[1];
}

function timeWindowsOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  const sA = parseTimeMinutes(startA);
  const eA = parseTimeMinutes(endA);
  const sB = parseTimeMinutes(startB);
  const eB = parseTimeMinutes(endB);
  return Math.max(sA, sB) < Math.min(eA, eB);
}

// ---------------------------------------------------------------------------
// ROUTE DISTANCE & TRAVEL TIME ANALYSIS
// ---------------------------------------------------------------------------

export function analyzeVehicleRoutes(
  routes: VehicleRouteRecord[],
  phases: SiteLogisticsPhase[]
): RouteDistanceTravelAnalysis[] {
  const analyses: RouteDistanceTravelAnalysis[] = [];

  for (const route of routes) {
    if (route.waypoints.length < 2) continue;
    const startPt = route.waypoints[0];
    const endPt = route.waypoints[route.waypoints.length - 1];
    const straightLineM = Math.max(0.1, euclideanDistance(startPt, endPt));

    let networkLenM = 0;
    let maxTurnAngleDeg = 0;
    for (let i = 0; i < route.waypoints.length - 1; i++) {
      const segLen = euclideanDistance(route.waypoints[i], route.waypoints[i + 1]);
      networkLenM += segLen;

      if (i > 0) {
        const prev = route.waypoints[i - 1];
        const curr = route.waypoints[i];
        const next = route.waypoints[i + 1];
        const v1x = curr.x - prev.x;
        const v1y = curr.y - prev.y;
        const v2x = next.x - curr.x;
        const v2y = next.y - curr.y;
        const mag1 = Math.hypot(v1x, v1y);
        const mag2 = Math.hypot(v2x, v2y);
        if (mag1 > 0.01 && mag2 > 0.01) {
          const dot = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (mag1 * mag2)));
          const angleDeg = (Math.acos(dot) * 180) / Math.PI;
          if (angleDeg > maxTurnAngleDeg) maxTurnAngleDeg = angleDeg;
        }
      }
    }

    const tortuosity = Number((networkLenM / straightLineM).toFixed(2));
    const speedKmh = Math.max(3, route.maxSpeedLimitKmh || 10);
    const speedMPerMin = (speedKmh * 1000) / 60;
    const reversingPenaltyMin = route.requiresReversingManoeuvre ? 3.5 : 0;
    const transitMin = Number((networkLenM / speedMPerMin + reversingPenaltyMin).toFixed(2));

    const targetPhaseIds = route.activePhaseIds.length > 0 ? route.activePhaseIds : phases.map((p) => p.id);
    for (const phaseId of targetPhaseIds) {
      analyses.push({
        routeId: route.id,
        routeName: route.name,
        phaseId,
        straightLineEntryToExitM: Number(straightLineM.toFixed(2)),
        actualNetworkPathLengthM: Number(networkLenM.toFixed(2)),
        tortuosityFactor: tortuosity,
        assumedAverageSpeedKmh: speedKmh,
        estimatedTransitMinutesOneWay: transitMin,
        includesReversingPenaltyMinutes: reversingPenaltyMin,
        maxSegmentTurnAngleDeg: Number(maxTurnAngleDeg.toFixed(1)),
        impliedMinCurveRadiusM: route.declaredMinCurveRadiusM,
      });
    }
  }

  return analyses;
}

// ---------------------------------------------------------------------------
// DETERMINISTIC CONFLICT, BLOCKER & RISK ENGINE
// ---------------------------------------------------------------------------

export function evaluateSiteLogisticsPlan(
  project: Project,
  rawPlan: Omit<
    SiteLogisticsPlan,
    | 'routeAnalyses'
    | 'phaseSummaries'
    | 'conflicts'
    | 'riskFindings'
    | 'transportCarbonSummary'
    | 'crossDisciplineContext'
    | 'summary'
    | 'assumptionsAndLimitations'
    | 'geometryFingerprint'
    | 'evaluatedAt'
  >
): SiteLogisticsPlan {
  const siteW = rawPlan.siteWidthM;
  const siteL = rawPlan.siteLengthM;
  const totalSiteAreaM2 = Number((siteW * siteL).toFixed(2));
  const conflicts: LogisticsConflictRecord[] = [];
  const riskFindings: LogisticsRiskFinding[] = [];

  const routeAnalyses = analyzeVehicleRoutes(rawPlan.vehicleRoutes, rawPlan.phases);

  // Extract Terrain slope if available from P43 or siteContext
  const p43SlopePct = project.terrainModeling?.analysis?.maxSlopePercent ?? null;
  const siteContextSlopeFallbackPct =
    project.siteContext?.slope === 'steep-over-10-pct'
      ? 12.0
      : project.siteContext?.slope === 'moderate-5-to-10-pct'
      ? 7.5
      : project.siteContext?.slope === 'gentle-2-to-5-pct'
      ? 3.5
      : 1.5;
  const effectiveSiteSlopePct = p43SlopePct !== null ? p43SlopePct : siteContextSlopeFallbackPct;

  // 1. Validate Site Access Points
  for (const ap of rawPlan.accessPoints) {
    const boundaryMaxM =
      ap.boundarySide === 'North' || ap.boundarySide === 'South' ? siteW : siteL;

    if (ap.offsetAlongSideM < 0 || ap.offsetAlongSideM + ap.clearWidthM > boundaryMaxM + 0.05) {
      conflicts.push({
        id: `conf-access-bounds-${ap.id}`,
        category: 'boundary_or_setback_violation',
        severity: 'conflict',
        phaseId: 'all_phases',
        title: `Access gate "${ap.name}" extends beyond ${ap.boundarySide} boundary`,
        description: `Gate offset (${ap.offsetAlongSideM.toFixed(1)} m) + width (${ap.clearWidthM.toFixed(1)} m) exceeds the ${ap.boundarySide} boundary length (${boundaryMaxM.toFixed(1)} m).`,
        affectedElementIds: [ap.id],
        measuredValue: `${(ap.offsetAlongSideM + ap.clearWidthM).toFixed(1)} m`,
        requiredThreshold: `<= ${boundaryMaxM.toFixed(1)} m`,
        evidenceStatus: ap.highwayAuthorityPermitStatus,
        remediationGuidance: `Adjust offsetAlongSideM or clearWidthM so the gate sits wholly within the ${ap.boundarySide} property boundary.`,
        requiresCompetentProfessionalSignOff: 'Civil / Highway Access Engineer',
      });
    }

    if (ap.highwayAuthorityPermitStatus === 'missing_evidence_blocker') {
      conflicts.push({
        id: `conf-access-permit-${ap.id}`,
        category: 'access_gate_or_permit_constraint',
        severity: 'blocker',
        phaseId: 'all_phases',
        title: `Missing highway / kerb-crossing permit for "${ap.name}"`,
        description: `Site access "${ap.name}" on ${ap.boundarySide} boundary lacks highway authority kerb-crossing / traffic management permit confirmation.`,
        affectedElementIds: [ap.id],
        evidenceStatus: 'missing_evidence_blocker',
        remediationGuidance: 'Obtain municipal highway access permit and confirm visibility splays before construction vehicle entry.',
        requiresCompetentProfessionalSignOff: 'Highway Authority / Traffic Management Coordinator',
      });
    } else if (ap.highwayAuthorityPermitStatus === 'declared_pending_verification') {
      conflicts.push({
        id: `conf-access-pending-${ap.id}`,
        category: 'access_gate_or_permit_constraint',
        severity: 'warning',
        phaseId: 'all_phases',
        title: `Access permit pending formal sign-off for "${ap.name}"`,
        description: `Access point "${ap.name}" is declared for planning but awaits formal highway crossover permit sign-off.`,
        affectedElementIds: [ap.id],
        evidenceStatus: 'declared_pending_verification',
        remediationGuidance: 'Attach highway authority permit reference prior to site mobilization.',
        requiresCompetentProfessionalSignOff: 'Principal Contractor Site Manager',
      });
    }

    if (!ap.visibilitySplayConfirmed) {
      conflicts.push({
        id: `conf-access-splay-${ap.id}`,
        category: 'access_gate_or_permit_constraint',
        severity: 'warning',
        phaseId: 'all_phases',
        title: `Sightline visibility splay unconfirmed at "${ap.name}"`,
        description: `Pedestrian and highway sightline visibility splays are not confirmed at gate "${ap.name}".`,
        affectedElementIds: [ap.id],
        evidenceStatus: ap.highwayAuthorityPermitStatus,
        remediationGuidance: 'Verify sightlines or station a dedicated traffic marshall / banksman at the gate.',
        requiresCompetentProfessionalSignOff: 'Traffic Management Coordinator',
      });
    }
  }

  // 2. Validate Vehicle Routes
  for (const route of rawPlan.vehicleRoutes) {
    const std = VEHICLE_DESIGN_CATALOG[route.designVehicleCategory];
    const reqWidth = Math.max(route.requiredMinCorridorWidthM, std.minCorridorWidthM);
    const reqRadius = Math.max(route.requiredMinInnerTurningRadiusM, std.minInnerTurningRadiusM);

    // Check corridor width
    if (route.corridorWidthM < reqWidth) {
      conflicts.push({
        id: `conf-route-width-${route.id}`,
        category: 'vehicle_route_geometry_or_clearance',
        severity: 'conflict',
        phaseId: route.activePhaseIds[0] || 'all_phases',
        title: `Vehicle route "${route.name}" narrower than required for ${std.label}`,
        description: `Corridor width (${route.corridorWidthM.toFixed(2)} m) is narrower than the required minimum (${reqWidth.toFixed(2)} m) for ${std.label}.`,
        affectedElementIds: [route.id],
        measuredValue: `${route.corridorWidthM.toFixed(2)} m`,
        requiredThreshold: `>= ${reqWidth.toFixed(2)} m`,
        evidenceStatus: 'declared_pending_verification',
        remediationGuidance: `Widen "${route.name}" to at least ${reqWidth.toFixed(2)} m or restrict route to smaller delivery vehicles.`,
        requiresCompetentProfessionalSignOff: 'Construction Logistics Planner / Traffic Engineer',
      });
    }

    // Check vertical clearance if overhead constraint exists
    if (route.minVerticalClearanceM !== null && route.minVerticalClearanceM < std.minVerticalClearanceM) {
      conflicts.push({
        id: `conf-route-height-${route.id}`,
        category: 'vehicle_route_geometry_or_clearance',
        severity: 'conflict',
        phaseId: route.activePhaseIds[0] || 'all_phases',
        title: `Insufficient overhead clearance along "${route.name}"`,
        description: `Vertical clearance (${route.minVerticalClearanceM.toFixed(2)} m) is less than required (${std.minVerticalClearanceM.toFixed(2)} m) for ${std.label}.`,
        affectedElementIds: [route.id],
        measuredValue: `${route.minVerticalClearanceM.toFixed(2)} m`,
        requiredThreshold: `>= ${std.minVerticalClearanceM.toFixed(2)} m`,
        evidenceStatus: 'declared_pending_verification',
        remediationGuidance: 'Reroute high-sided vehicles or install goalposts and raise overhead obstructions.',
        requiresCompetentProfessionalSignOff: 'Temporary Works Coordinator',
      });
    }

    // Check turning radius
    const routeAnalysis = routeAnalyses.find((ra) => ra.routeId === route.id);
    if (route.declaredMinCurveRadiusM !== null && route.declaredMinCurveRadiusM < reqRadius) {
      conflicts.push({
        id: `conf-route-radius-${route.id}`,
        category: 'vehicle_route_geometry_or_clearance',
        severity: 'conflict',
        phaseId: route.activePhaseIds[0] || 'all_phases',
        title: `Turning radius along "${route.name}" tighter than vehicle minimum`,
        description: `Declared inner turning radius (${route.declaredMinCurveRadiusM.toFixed(1)} m) is below the minimum (${reqRadius.toFixed(1)} m) for ${std.label}.`,
        affectedElementIds: [route.id],
        measuredValue: `${route.declaredMinCurveRadiusM.toFixed(1)} m`,
        requiredThreshold: `>= ${reqRadius.toFixed(1)} m`,
        evidenceStatus: 'declared_pending_verification',
        remediationGuidance: `Realign curve geometry to achieve >= ${reqRadius.toFixed(1)} m inner radius or verify with certified swept-path simulation.`,
        requiresCompetentProfessionalSignOff: 'Highway / Swept-Path Engineer',
      });
    } else if (
      routeAnalysis &&
      routeAnalysis.maxSegmentTurnAngleDeg > 60 &&
      route.sweptPathMethod === 'not_verified'
    ) {
      conflicts.push({
        id: `conf-route-swept-${route.id}`,
        category: 'vehicle_route_geometry_or_clearance',
        severity: 'warning',
        phaseId: route.activePhaseIds[0] || 'all_phases',
        title: `Sharp turn (${routeAnalysis.maxSegmentTurnAngleDeg.toFixed(0)}°) on "${route.name}" lacks swept-path verification`,
        description: `Route "${route.name}" has a ${routeAnalysis.maxSegmentTurnAngleDeg.toFixed(0)}° directional change without swept-path verification for ${std.label}.`,
        affectedElementIds: [route.id],
        measuredValue: `${routeAnalysis.maxSegmentTurnAngleDeg.toFixed(0)}° turn`,
        requiredThreshold: `Swept-path verification required for >= ${reqRadius.toFixed(1)} m radius`,
        evidenceStatus: 'declared_pending_verification',
        remediationGuidance: 'Perform swept-path simulation for design vehicle body overhang and tail swing.',
        requiresCompetentProfessionalSignOff: 'Construction Logistics Engineer',
      });
    }

    // Check reversing without banksman
    if (route.requiresReversingManoeuvre && !route.trainedBanksmanMarshallingConfirmed) {
      conflicts.push({
        id: `conf-route-reverse-${route.id}`,
        category: 'pedestrian_vehicle_segregation_hazard',
        severity: 'blocker',
        phaseId: route.activePhaseIds[0] || 'all_phases',
        title: `Unmarshalled vehicle reversing on "${route.name}"`,
        description: `Route "${route.name}" requires vehicle reversing manoeuvres, but trained banksman / traffic marshall attendance is not confirmed.`,
        affectedElementIds: [route.id],
        evidenceStatus: 'missing_evidence_blocker',
        remediationGuidance: 'Eliminate reversing via a one-way loop or turning head, or mandate a dedicated trained Traffic Marshall / Banksman.',
        requiresCompetentProfessionalSignOff: 'Principal Contractor Health & Safety Manager',
      });
    }

    // Check wheel wash
    if (!route.wheelWashProvidedAtExit) {
      conflicts.push({
        id: `conf-route-wheelwash-${route.id}`,
        category: 'environmental_or_terrain_slope_hazard',
        severity: 'warning',
        phaseId: route.activePhaseIds[0] || 'all_phases',
        title: `No wheel-wash / mud control confirmed at exit of "${route.name}"`,
        description: `Vehicles exiting via "${route.name}" lack confirmed wheel-wash or jet-wash mud control facilities.`,
        affectedElementIds: [route.id],
        evidenceStatus: 'declared_pending_verification',
        remediationGuidance: 'Provide a compacted hardstanding wheel-wash bay with silt trap before highway egress.',
        requiresCompetentProfessionalSignOff: 'Environmental / Site Manager',
      });
    }

    // Check terrain gradient
    const routeSlopePct = route.maxRouteGradientPct !== null ? route.maxRouteGradientPct : effectiveSiteSlopePct;
    if (routeSlopePct > 10.0) {
      conflicts.push({
        id: `conf-route-slope-${route.id}`,
        category: 'environmental_or_terrain_slope_hazard',
        severity: 'conflict',
        phaseId: route.activePhaseIds[0] || 'all_phases',
        title: `Excessive longitudinal gradient (${routeSlopePct.toFixed(1)}%) on "${route.name}"`,
        description: `Route gradient (${routeSlopePct.toFixed(1)}%) exceeds safe temporary haul road limit (10.0%) for ${std.label}.`,
        affectedElementIds: [route.id],
        measuredValue: `${routeSlopePct.toFixed(1)}%`,
        requiredThreshold: '<= 10.0%',
        evidenceStatus: 'declared_pending_verification',
        remediationGuidance: 'Regrade haul road alignment along contours or engineer high-friction surfaced ramp.',
        requiresCompetentProfessionalSignOff: 'Temporary Works / Civil Engineer',
      });
    }

    // Check route vs active building footprint per phase
    for (const phaseId of route.activePhaseIds) {
      const phase = rawPlan.phases.find((p) => p.id === phaseId);
      const bBounds = getActiveBuildingBoundsForPhase(rawPlan.buildingBoundsM, phase);
      if (polylineIntersectsBox(route.waypoints, route.corridorWidthM * 0.5, bBounds)) {
        conflicts.push({
          id: `conf-route-bldg-${route.id}-${phaseId}`,
          category: 'phase_transition_or_footprint_clash',
          severity: 'conflict',
          phaseId,
          title: `Vehicle route "${route.name}" clashes with active building footprint in ${phase?.name || phaseId}`,
          description: `The ${route.corridorWidthM.toFixed(1)} m corridor of "${route.name}" intersects the active building footprint (${bBounds.widthM}×${bBounds.lengthM} m) during ${phase?.name || phaseId}.`,
          affectedElementIds: [route.id],
          spatialLocation: boxCenter(bBounds),
          evidenceStatus: 'declared_pending_verification',
          remediationGuidance: 'Reroute vehicle corridor outside the building perimeter envelope for this construction phase.',
          requiresCompetentProfessionalSignOff: 'Construction Logistics Planner',
        });
      }
    }

    // Check route vs restricted zones
    for (const res of rawPlan.siteRestrictions) {
      if (!res.prohibitsVehicleTraffic) continue;
      const sharedPhases = route.activePhaseIds.filter((pid) => res.activePhaseIds.includes(pid));
      if (sharedPhases.length > 0 && polylineIntersectsBox(route.waypoints, route.corridorWidthM * 0.5, res.bounds)) {
        conflicts.push({
          id: `conf-route-res-${route.id}-${res.id}`,
          category: 'boundary_or_setback_violation',
          severity: 'conflict',
          phaseId: sharedPhases[0],
          title: `Vehicle route "${route.name}" encroaches into restricted zone "${res.name}"`,
          description: `Vehicle corridor overlaps protected restriction "${res.name}" (${res.category.replace(/_/g, ' ')}).`,
          affectedElementIds: [route.id, res.id],
          spatialLocation: boxCenter(res.bounds),
          evidenceStatus: 'declared_pending_verification',
          remediationGuidance: `Divert "${route.name}" clear of "${res.name}" or install engineered tree-root / easement protection mats if permitted.`,
          requiresCompetentProfessionalSignOff: 'Site Engineer / Arboriculturist',
        });
      }
    }
  }

  // 3. Validate Pedestrian Routes & Vehicle Crossings
  for (const ped of rawPlan.pedestrianRoutes) {
    if (ped.clearWidthM < 1.2) {
      conflicts.push({
        id: `conf-ped-width-${ped.id}`,
        category: 'pedestrian_vehicle_segregation_hazard',
        severity: 'conflict',
        phaseId: ped.activePhaseIds[0] || 'all_phases',
        title: `Pedestrian walkway "${ped.name}" narrower than 1.20 m minimum`,
        description: `Walkway clear width (${ped.clearWidthM.toFixed(2)} m) is below the 1.20 m safe minimum for worker circulation.`,
        affectedElementIds: [ped.id],
        measuredValue: `${ped.clearWidthM.toFixed(2)} m`,
        requiredThreshold: '>= 1.20 m',
        evidenceStatus: 'declared_pending_verification',
        remediationGuidance: 'Widen pedestrian corridor to >= 1.20 m (1.50 m preferred for two-way worker flow).',
        requiresCompetentProfessionalSignOff: 'Health & Safety Coordinator',
      });
    }

    if (ped.barrierType === 'unsegregated_shared_hazard') {
      conflicts.push({
        id: `conf-ped-barrier-none-${ped.id}`,
        category: 'pedestrian_vehicle_segregation_hazard',
        severity: 'blocker',
        phaseId: ped.activePhaseIds[0] || 'all_phases',
        title: `Unsegregated pedestrian route "${ped.name}" lacks physical vehicle protection`,
        description: `Pedestrian route "${ped.name}" has no physical segregation barrier separating operatives from plant and vehicle movements.`,
        affectedElementIds: [ped.id],
        evidenceStatus: 'missing_evidence_blocker',
        remediationGuidance: 'Install interlocking water-filled/concrete barriers or fixed handrail fencing along the walkway.',
        requiresCompetentProfessionalSignOff: 'Principal Contractor Health & Safety Manager',
      });
    } else if (ped.barrierType === 'painted_line_only_insufficient') {
      conflicts.push({
        id: `conf-ped-barrier-paint-${ped.id}`,
        category: 'pedestrian_vehicle_segregation_hazard',
        severity: 'warning',
        phaseId: ped.activePhaseIds[0] || 'all_phases',
        title: `Walkway "${ped.name}" relies on painted line marking rather than physical barrier`,
        description: `Painted lines do not physically arrest slewing plant or vehicles adjacent to "${ped.name}".`,
        affectedElementIds: [ped.id],
        evidenceStatus: 'declared_pending_verification',
        remediationGuidance: 'Upgrade to physical handrail fencing or jersey barriers where adjacent to vehicle routes.',
        requiresCompetentProfessionalSignOff: 'Site Safety Manager',
      });
    }

    // Check intersections between pedestrian segments and vehicle segments
    for (const vRoute of rawPlan.vehicleRoutes) {
      const sharedPhases = ped.activePhaseIds.filter((pid) => vRoute.activePhaseIds.includes(pid));
      if (sharedPhases.length === 0) continue;

      for (let i = 0; i < ped.waypoints.length - 1; i++) {
        for (let j = 0; j < vRoute.waypoints.length - 1; j++) {
          const hit = segmentsIntersect(
            ped.waypoints[i],
            ped.waypoints[i + 1],
            vRoute.waypoints[j],
            vRoute.waypoints[j + 1]
          );
          if (hit) {
            const hasControlledCrossing = ped.controlledCrossingPoints.some(
              (cp) => euclideanDistance(cp, hit) <= 2.5
            );
            if (!hasControlledCrossing) {
              conflicts.push({
                id: `conf-ped-veh-cross-${ped.id}-${vRoute.id}-${i}-${j}`,
                category: 'pedestrian_vehicle_segregation_hazard',
                severity: 'conflict',
                phaseId: sharedPhases[0],
                title: `Uncontrolled pedestrian-vehicle crossing: "${ped.name}" × "${vRoute.name}"`,
                description: `Pedestrian route "${ped.name}" intersects vehicle route "${vRoute.name}" at (${hit.x.toFixed(1)} m, ${hit.y.toFixed(1)} m) without a designated controlled crossing gate/barrier.`,
                affectedElementIds: [ped.id, vRoute.id],
                spatialLocation: hit,
                evidenceStatus: 'missing_evidence_blocker',
                remediationGuidance: 'Add a designated controlled crossing point with drop-arm gates, zebra markings, and visibility signage, or reroute the pedestrian path.',
                requiresCompetentProfessionalSignOff: 'Traffic & Pedestrian Safety Coordinator',
              });
            }
          }
        }
      }
    }
  }

  // 4. Validate Storage, Laydown, Unloading & Waste Zones
  for (let i = 0; i < rawPlan.logisticsZones.length; i++) {
    const z = rawPlan.logisticsZones[i];

    // Inside site boundary check
    if (!isBoxInsideSite(z.bounds, siteW, siteL)) {
      conflicts.push({
        id: `conf-zone-outside-${z.id}`,
        category: 'boundary_or_setback_violation',
        severity: 'conflict',
        phaseId: z.activePhaseIds[0] || 'all_phases',
        title: `Logistics zone "${z.name}" protrudes outside site boundary`,
        description: `Zone "${z.name}" (${z.bounds.widthM}×${z.bounds.lengthM} m at ${z.bounds.x},${z.bounds.y} m) extends outside the ${siteW.toFixed(1)}×${siteL.toFixed(1)} m parcel boundary.`,
        affectedElementIds: [z.id],
        spatialLocation: boxCenter(z.bounds),
        evidenceStatus: z.groundBearingStatus,
        remediationGuidance: 'Reposition or resize the zone so it sits completely within the property boundary.',
        requiresCompetentProfessionalSignOff: 'Site Logistics Coordinator',
      });
    }

    // Check against active building footprint per phase
    for (const phaseId of z.activePhaseIds) {
      const phase = rawPlan.phases.find((p) => p.id === phaseId);
      const bBounds = getActiveBuildingBoundsForPhase(rawPlan.buildingBoundsM, phase);
      if (boxesOverlap(z.bounds, bBounds)) {
        conflicts.push({
          id: `conf-zone-bldg-${z.id}-${phaseId}`,
          category: 'phase_transition_or_footprint_clash',
          severity: 'conflict',
          phaseId,
          title: `Zone "${z.name}" overlaps active building footprint in ${phase?.name || phaseId}`,
          description: `Zone "${z.name}" overlaps the building construction footprint (${boxIntersectionArea(z.bounds, bBounds)} m² clash) during ${phase?.name || phaseId}.`,
          affectedElementIds: [z.id],
          spatialLocation: boxCenter(z.bounds),
          measuredValue: `${boxIntersectionArea(z.bounds, bBounds)} m² overlap`,
          requiredThreshold: '0 m² overlap',
          evidenceStatus: z.groundBearingStatus,
          remediationGuidance: 'Relocate staging/storage zone to exterior yard or restrict its active phases to enabling works only.',
          requiresCompetentProfessionalSignOff: 'Construction Planner',
        });
      }
    }

    // Check zone-to-zone overlap in shared phases
    for (let j = i + 1; j < rawPlan.logisticsZones.length; j++) {
      const other = rawPlan.logisticsZones[j];
      const sharedPhases = z.activePhaseIds.filter((pid) => other.activePhaseIds.includes(pid));
      if (sharedPhases.length > 0 && boxesOverlap(z.bounds, other.bounds)) {
        conflicts.push({
          id: `conf-zone-overlap-${z.id}-${other.id}`,
          category: 'storage_overlap_or_capacity_exceeded',
          severity: 'conflict',
          phaseId: sharedPhases[0],
          title: `Spatial overlap between "${z.name}" and "${other.name}"`,
          description: `Logistics zones "${z.name}" and "${other.name}" overlap by ${boxIntersectionArea(z.bounds, other.bounds)} m² during shared construction phases.`,
          affectedElementIds: [z.id, other.id],
          spatialLocation: boxCenter(z.bounds),
          measuredValue: `${boxIntersectionArea(z.bounds, other.bounds)} m² overlap`,
          requiredThreshold: '0 m² overlap',
          evidenceStatus: 'declared_pending_verification',
          remediationGuidance: 'Separate the two zones spatially or stagger their active construction phases.',
          requiresCompetentProfessionalSignOff: 'Site Logistics Coordinator',
        });
      }
    }

    // Check zone vs restricted areas
    for (const res of rawPlan.siteRestrictions) {
      if (!res.prohibitsStorageAndStaging) continue;
      const sharedPhases = z.activePhaseIds.filter((pid) => res.activePhaseIds.includes(pid));
      if (sharedPhases.length > 0 && boxesOverlap(z.bounds, res.bounds)) {
        conflicts.push({
          id: `conf-zone-res-${z.id}-${res.id}`,
          category: 'boundary_or_setback_violation',
          severity: 'conflict',
          phaseId: sharedPhases[0],
          title: `Zone "${z.name}" encroaches into restricted area "${res.name}"`,
          description: `Staging/storage is prohibited inside "${res.name}" (${res.category.replace(/_/g, ' ')}).`,
          affectedElementIds: [z.id, res.id],
          spatialLocation: boxCenter(res.bounds),
          evidenceStatus: 'declared_pending_verification',
          remediationGuidance: `Move "${z.name}" outside the protection perimeter of "${res.name}".`,
          requiresCompetentProfessionalSignOff: 'Site Manager / Environmental Advisor',
        });
      }
    }

    // Check zone vs vehicle routes (unless zone is loading_unloading_bay adjacent to route)
    if (z.category !== 'loading_unloading_bay') {
      for (const vRoute of rawPlan.vehicleRoutes) {
        const sharedPhases = z.activePhaseIds.filter((pid) => vRoute.activePhaseIds.includes(pid));
        if (sharedPhases.length > 0 && polylineIntersectsBox(vRoute.waypoints, vRoute.corridorWidthM * 0.5, z.bounds)) {
          conflicts.push({
            id: `conf-zone-vroute-${z.id}-${vRoute.id}`,
            category: 'vehicle_route_geometry_or_clearance',
            severity: 'conflict',
            phaseId: sharedPhases[0],
            title: `Storage zone "${z.name}" obstructs vehicle corridor "${vRoute.name}"`,
            description: `Zone "${z.name}" encroaches into the swept corridor of vehicle route "${vRoute.name}".`,
            affectedElementIds: [z.id, vRoute.id],
            spatialLocation: boxCenter(z.bounds),
            evidenceStatus: 'declared_pending_verification',
            remediationGuidance: 'Relocate storage zone clear of active vehicle circulation lanes.',
            requiresCompetentProfessionalSignOff: 'Site Logistics Coordinator',
          });
        }
      }
    }

    // Check handling sensitivity & COSHH / weather protection
    if (
      (z.handlingSensitivity === 'weatherproof_covered_required' ||
        z.handlingSensitivity === 'fragile_glazing_vertical_stillage') &&
      !z.weatherProtectionProvided
    ) {
      conflicts.push({
        id: `conf-zone-weather-${z.id}`,
        category: 'storage_overlap_or_capacity_exceeded',
        severity: 'warning',
        phaseId: z.activePhaseIds[0] || 'all_phases',
        title: `Moisture/fragile staging "${z.name}" lacks weather protection`,
        description: `Zone "${z.name}" (${z.handlingSensitivity.replace(/_/g, ' ')}) does not have covered/weatherproof protection enabled.`,
        affectedElementIds: [z.id],
        evidenceStatus: 'declared_pending_verification',
        remediationGuidance: 'Provide covered tented stillage or breathable weatherproof sheeting on raised dunnage.',
        requiresCompetentProfessionalSignOff: 'Package Manager / Facade Supervisor',
      });
    }

    if (
      (z.category === 'hazardous_coshh_store' || z.handlingSensitivity === 'flammable_segregated_coshh') &&
      !z.containmentBundProvided
    ) {
      conflicts.push({
        id: `conf-zone-coshh-${z.id}`,
        category: 'environmental_or_terrain_slope_hazard',
        severity: 'conflict',
        phaseId: z.activePhaseIds[0] || 'all_phases',
        title: `Hazardous / COSHH store "${z.name}" lacks 110% spill containment bund`,
        description: `Flammable or hazardous material storage "${z.name}" has no secondary spill containment bund or fire-rated cabinet confirmed.`,
        affectedElementIds: [z.id],
        evidenceStatus: 'missing_evidence_blocker',
        remediationGuidance: 'Provide a locked, ventilated, bunded COSHH store with fire extinguisher point.',
        requiresCompetentProfessionalSignOff: 'Environmental & Fire Safety Coordinator',
      });
    }

    // Ground bearing check on heavy storage
    if (z.groundBearingRequirementKPa !== null) {
      if (z.groundBearingStatus === 'missing_evidence_blocker') {
        conflicts.push({
          id: `conf-zone-gbr-missing-${z.id}`,
          category: 'missing_engineering_or_geotech_evidence',
          severity: 'blocker',
          phaseId: z.activePhaseIds[0] || 'all_phases',
          title: `Unverified ground-bearing capacity for heavy laydown "${z.name}"`,
          description: `Zone "${z.name}" requires ${z.groundBearingRequirementKPa} kPa ground bearing, but geotechnical bearing evidence is missing.`,
          affectedElementIds: [z.id],
          measuredValue: 'Unverified kPa',
          requiredThreshold: `>= ${z.groundBearingRequirementKPa} kPa`,
          evidenceStatus: 'missing_evidence_blocker',
          remediationGuidance: 'Verify subgrade CBR / bearing pressure via Temporary Works Engineer before stacking heavy structural loads.',
          requiresCompetentProfessionalSignOff: 'Temporary Works / Geotechnical Engineer',
        });
      } else if (
        z.verifiedGroundBearingCapacityKPa !== null &&
        z.verifiedGroundBearingCapacityKPa < z.groundBearingRequirementKPa
      ) {
        conflicts.push({
          id: `conf-zone-gbr-exceeded-${z.id}`,
          category: 'missing_engineering_or_geotech_evidence',
          severity: 'blocker',
          phaseId: z.activePhaseIds[0] || 'all_phases',
          title: `Stacking pressure in "${z.name}" exceeds verified ground-bearing capacity`,
          description: `Required bearing pressure (${z.groundBearingRequirementKPa} kPa) exceeds verified ground capacity (${z.verifiedGroundBearingCapacityKPa} kPa).`,
          affectedElementIds: [z.id],
          measuredValue: `${z.groundBearingRequirementKPa} kPa required`,
          requiredThreshold: `<= ${z.verifiedGroundBearingCapacityKPa} kPa verified`,
          evidenceStatus: z.groundBearingStatus,
          remediationGuidance: 'Reduce stack height, spread load on engineered crane/spreader mats, or design compacted working platform.',
          requiresCompetentProfessionalSignOff: 'Temporary Works Engineer',
        });
      }
    }
  }

  // 5. Validate Equipment Placements & Lifting Operations
  for (const eq of rawPlan.equipmentPlacements) {
    const outriggerBox: SiteBoundingBox2D = {
      x: eq.baseBounds.x - Math.max(0, (eq.outriggerSpreadWidthM - eq.baseBounds.widthM) * 0.5),
      y: eq.baseBounds.y - Math.max(0, (eq.outriggerSpreadLengthM - eq.baseBounds.lengthM) * 0.5),
      widthM: Math.max(eq.baseBounds.widthM, eq.outriggerSpreadWidthM),
      lengthM: Math.max(eq.baseBounds.lengthM, eq.outriggerSpreadLengthM),
    };

    if (!isBoxInsideSite(outriggerBox, siteW, siteL)) {
      conflicts.push({
        id: `conf-eq-outside-${eq.id}`,
        category: 'boundary_or_setback_violation',
        severity: 'conflict',
        phaseId: eq.activePhaseIds[0] || 'all_phases',
        title: `Equipment / outrigger footprint "${eq.name}" extends outside site boundary`,
        description: `Outrigger/base footprint (${outriggerBox.widthM.toFixed(1)}×${outriggerBox.lengthM.toFixed(1)} m) of "${eq.name}" protrudes outside the property line.`,
        affectedElementIds: [eq.id],
        spatialLocation: boxCenter(outriggerBox),
        evidenceStatus: eq.groundBearingApprovalStatus,
        remediationGuidance: 'Relocate crane/plant setup position so outrigger mats remain fully inside site boundaries.',
        requiresCompetentProfessionalSignOff: 'Appointed Person (Lifting) / Temporary Works Engineer',
      });
    }

    // Check overlap with logistics zones
    for (const z of rawPlan.logisticsZones) {
      const sharedPhases = eq.activePhaseIds.filter((pid) => z.activePhaseIds.includes(pid));
      if (sharedPhases.length > 0 && boxesOverlap(outriggerBox, z.bounds)) {
        conflicts.push({
          id: `conf-eq-zone-${eq.id}-${z.id}`,
          category: 'crane_reach_load_or_oversail_conflict',
          severity: 'conflict',
          phaseId: sharedPhases[0],
          title: `Equipment base/outriggers "${eq.name}" overlap zone "${z.name}"`,
          description: `Outrigger/base footprint of "${eq.name}" clashes spatially with "${z.name}".`,
          affectedElementIds: [eq.id, z.id],
          spatialLocation: boxCenter(outriggerBox),
          evidenceStatus: eq.certifiedLiftPlanApprovalStatus,
          remediationGuidance: 'Clear storage/staging materials from the crane outrigger & exclusion footprint.',
          requiresCompetentProfessionalSignOff: 'Appointed Person (Lifting)',
        });
      }
    }

    // Check overlap with restricted zones
    for (const res of rawPlan.siteRestrictions) {
      if (!res.prohibitsHeavyPlantAndCranes) continue;
      const sharedPhases = eq.activePhaseIds.filter((pid) => res.activePhaseIds.includes(pid));
      if (sharedPhases.length > 0 && boxesOverlap(outriggerBox, res.bounds)) {
        conflicts.push({
          id: `conf-eq-res-${eq.id}-${res.id}`,
          category: 'crane_reach_load_or_oversail_conflict',
          severity: 'conflict',
          phaseId: sharedPhases[0],
          title: `Heavy plant "${eq.name}" encroaches into restricted exclusion "${res.name}"`,
          description: `Equipment outriggers/base overlap "${res.name}" (${res.category.replace(/_/g, ' ')}).`,
          affectedElementIds: [eq.id, res.id],
          spatialLocation: boxCenter(outriggerBox),
          evidenceStatus: eq.groundBearingApprovalStatus,
          remediationGuidance: 'Relocate plant outside the standoff/root protection/easement zone.',
          requiresCompetentProfessionalSignOff: 'Temporary Works Engineer',
        });
      }
    }

    // Mandatory Engineering & Geotechnical Blocker Gates
    if (eq.groundBearingApprovalStatus === 'missing_evidence_blocker') {
      conflicts.push({
        id: `conf-eq-gbr-blocker-${eq.id}`,
        category: 'missing_engineering_or_geotech_evidence',
        severity: 'blocker',
        phaseId: eq.activePhaseIds[0] || 'all_phases',
        title: `Missing geotechnical / outrigger bearing design for "${eq.name}"`,
        description: `Equipment "${eq.name}" has no verified ground-bearing or temporary works crane mat design sign-off. Visual placement is not proof of safe ground support.`,
        affectedElementIds: [eq.id],
        spatialLocation: boxCenter(eq.baseBounds),
        measuredValue: eq.requiredGroundBearingKPa ? `${eq.requiredGroundBearingKPa} kPa demand` : 'Unverified load',
        requiredThreshold: 'Signed Temporary Works Foundation / Mat Design',
        evidenceStatus: 'missing_evidence_blocker',
        remediationGuidance: 'Obtain geotechnical bearing verification and Temporary Works Engineer outrigger mat / piling design before rigging.',
        requiresCompetentProfessionalSignOff: 'Temporary Works & Geotechnical Engineer',
      });
    } else if (
      eq.requiredGroundBearingKPa !== null &&
      eq.verifiedGroundBearingKPa !== null &&
      eq.requiredGroundBearingKPa > eq.verifiedGroundBearingKPa
    ) {
      conflicts.push({
        id: `conf-eq-gbr-exceeded-${eq.id}`,
        category: 'missing_engineering_or_geotech_evidence',
        severity: 'blocker',
        phaseId: eq.activePhaseIds[0] || 'all_phases',
        title: `Outrigger/base bearing demand of "${eq.name}" exceeds verified soil capacity`,
        description: `Equipment "${eq.name}" imposes ${eq.requiredGroundBearingKPa} kPa, exceeding verified bearing capacity (${eq.verifiedGroundBearingKPa} kPa).`,
        affectedElementIds: [eq.id],
        spatialLocation: boxCenter(eq.baseBounds),
        measuredValue: `${eq.requiredGroundBearingKPa} kPa`,
        requiredThreshold: `<= ${eq.verifiedGroundBearingKPa} kPa`,
        evidenceStatus: eq.groundBearingApprovalStatus,
        remediationGuidance: 'Design larger load-spreading crane mats, piled crane base, or select lower ground-pressure plant.',
        requiresCompetentProfessionalSignOff: 'Temporary Works & Geotechnical Engineer',
      });
    }

    if (eq.certifiedLiftPlanApprovalStatus === 'missing_evidence_blocker') {
      conflicts.push({
        id: `conf-eq-liftplan-blocker-${eq.id}`,
        category: 'missing_engineering_or_geotech_evidence',
        severity: 'blocker',
        phaseId: eq.activePhaseIds[0] || 'all_phases',
        title: `Missing Appointed Person Lift Plan for "${eq.name}"`,
        description: `Equipment "${eq.name}" lacks a certified Lift Plan (BS 7121 / LOLER / OSHA 1926 Subpart CC equivalent) prepared by an Appointed Person.`,
        affectedElementIds: [eq.id],
        spatialLocation: boxCenter(eq.baseBounds),
        evidenceStatus: 'missing_evidence_blocker',
        remediationGuidance: 'Prepare and sign off a site-specific Lift Plan, load schedule, and wind-speed shutdown protocol.',
        requiresCompetentProfessionalSignOff: 'Appointed Person (Lifting Operations)',
      });
    }

    if (eq.undergroundServiceClearanceStatus === 'missing_evidence_blocker') {
      conflicts.push({
        id: `conf-eq-ugservice-blocker-${eq.id}`,
        category: 'utility_strike_or_clearance_hazard',
        severity: 'blocker',
        phaseId: eq.activePhaseIds[0] || 'all_phases',
        title: `Missing underground utility / void survey beneath "${eq.name}"`,
        description: `Subsurface utility and basement/culvert void clearance is unverified beneath the outriggers/base of "${eq.name}".`,
        affectedElementIds: [eq.id],
        spatialLocation: boxCenter(eq.baseBounds),
        evidenceStatus: 'missing_evidence_blocker',
        remediationGuidance: 'Complete PAS 128 / GPR subsurface utility survey and Issue Permit-to-Dig / Permit-to-Load before crane setup.',
        requiresCompetentProfessionalSignOff: 'Temporary Works Coordinator / Utility Surveyor',
      });
    }

    // Check oversail beyond parcel boundaries
    const center = boxCenter(eq.baseBounds);
    const oversailsParcel =
      center.x - eq.operatingRadiusM < 0 ||
      center.x + eq.operatingRadiusM > siteW ||
      center.y - eq.operatingRadiusM < 0 ||
      center.y + eq.operatingRadiusM > siteL;

    if (oversailsParcel && (!eq.oversailsOutsideSiteBoundaryPermitted || !eq.oversailLicenseApproved)) {
      conflicts.push({
        id: `conf-eq-oversail-${eq.id}`,
        category: 'crane_reach_load_or_oversail_conflict',
        severity: 'conflict',
        phaseId: eq.activePhaseIds[0] || 'all_phases',
        title: `Unlicensed crane oversail beyond property boundary for "${eq.name}"`,
        description: `Operating radius (${eq.operatingRadiusM.toFixed(1)} m) of "${eq.name}" extends beyond the ${siteW.toFixed(1)}×${siteL.toFixed(1)} m site boundary without an approved neighbor/highway oversail license or sleigh-limiting zone.`,
        affectedElementIds: [eq.id],
        spatialLocation: center,
        measuredValue: `R = ${eq.operatingRadiusM.toFixed(1)} m`,
        requiredThreshold: 'Within site boundary or approved oversail license',
        evidenceStatus: eq.certifiedLiftPlanApprovalStatus,
        remediationGuidance: 'Obtain neighbor/highway oversail agreements, program electronic slew-range limiters, or reduce jib radius.',
        requiresCompetentProfessionalSignOff: 'Appointed Person (Lifting) / Project Legal & Neighbors',
      });
    }
  }

  // Validate individual Lifting Operations
  for (const lift of rawPlan.liftingOperations) {
    const eq = rawPlan.equipmentPlacements.find((e) => e.id === lift.equipmentId);
    const pickupZone = rawPlan.logisticsZones.find((z) => z.id === lift.pickupZoneId);

    if (!eq) {
      conflicts.push({
        id: `conf-lift-noeq-${lift.id}`,
        category: 'crane_reach_load_or_oversail_conflict',
        severity: 'conflict',
        phaseId: lift.phaseId,
        title: `Lifting operation "${lift.name}" references missing crane`,
        description: `Assigned equipment (${lift.equipmentId}) does not exist in the equipment register.`,
        affectedElementIds: [lift.id],
        evidenceStatus: 'missing_evidence_blocker',
        remediationGuidance: 'Assign a valid crane placement to this lifting operation.',
        requiresCompetentProfessionalSignOff: 'Appointed Person (Lifting)',
      });
      continue;
    }

    const eqCenter = boxCenter(eq.baseBounds);
    const distToDrop = euclideanDistance(eqCenter, lift.targetDropCoordinate);
    const distToPickup = pickupZone ? euclideanDistance(eqCenter, boxCenter(pickupZone.bounds)) : 0;
    const actualRequiredRadiusM = Number(Math.max(distToDrop, distToPickup, lift.requiredLiftRadiusM).toFixed(2));

    if (actualRequiredRadiusM > eq.operatingRadiusM) {
      conflicts.push({
        id: `conf-lift-reach-${lift.id}`,
        category: 'crane_reach_load_or_oversail_conflict',
        severity: 'conflict',
        phaseId: lift.phaseId,
        title: `Lift "${lift.name}" exceeds "${eq.name}" maximum operating radius`,
        description: `Required lift radius (${actualRequiredRadiusM.toFixed(1)} m to pickup/drop) exceeds the maximum operating radius (${eq.operatingRadiusM.toFixed(1)} m) of "${eq.name}".`,
        affectedElementIds: [lift.id, eq.id],
        spatialLocation: lift.targetDropCoordinate,
        measuredValue: `${actualRequiredRadiusM.toFixed(1)} m required`,
        requiredThreshold: `<= ${eq.operatingRadiusM.toFixed(1)} m max reach`,
        evidenceStatus: lift.appointedPersonSignOffStatus,
        remediationGuidance: 'Move pickup bay or crane closer to target drop coordinate, or specify a larger-radius crane.',
        requiresCompetentProfessionalSignOff: 'Appointed Person (Lifting)',
      });
    }

    if (lift.declaredRatedCapacityAtRadiusTonnes === null) {
      conflicts.push({
        id: `conf-lift-nochart-${lift.id}`,
        category: 'missing_engineering_or_geotech_evidence',
        severity: 'blocker',
        phaseId: lift.phaseId,
        title: `Missing load-chart rated capacity for lift "${lift.name}" at ${actualRequiredRadiusM.toFixed(1)} m`,
        description: `Lift "${lift.name}" (${lift.grossLoadWeightTonnes.toFixed(2)} t gross load) has no manufacturer load-chart capacity declared at ${actualRequiredRadiusM.toFixed(1)} m radius.`,
        affectedElementIds: [lift.id, eq.id],
        spatialLocation: lift.targetDropCoordinate,
        measuredValue: `${lift.grossLoadWeightTonnes.toFixed(2)} t load`,
        requiredThreshold: 'Manufacturer load-chart SWL at radius required',
        evidenceStatus: 'missing_evidence_blocker',
        remediationGuidance: 'Verify crane manufacturer duty chart at the exact radius, boom length, and counterweight configuration.',
        requiresCompetentProfessionalSignOff: 'Appointed Person (Lifting)',
      });
    } else if (lift.grossLoadWeightTonnes > lift.declaredRatedCapacityAtRadiusTonnes) {
      conflicts.push({
        id: `conf-lift-overload-${lift.id}`,
        category: 'crane_reach_load_or_oversail_conflict',
        severity: 'blocker',
        phaseId: lift.phaseId,
        title: `Lift "${lift.name}" gross load (${lift.grossLoadWeightTonnes.toFixed(2)} t) exceeds rated capacity (${lift.declaredRatedCapacityAtRadiusTonnes.toFixed(2)} t)`,
        description: `Gross load weight including hook block and rigging (${lift.grossLoadWeightTonnes.toFixed(2)} t) exceeds declared crane SWL (${lift.declaredRatedCapacityAtRadiusTonnes.toFixed(2)} t) at ${actualRequiredRadiusM.toFixed(1)} m radius.`,
        affectedElementIds: [lift.id, eq.id],
        spatialLocation: lift.targetDropCoordinate,
        measuredValue: `${lift.grossLoadWeightTonnes.toFixed(2)} t load`,
        requiredThreshold: `<= ${lift.declaredRatedCapacityAtRadiusTonnes.toFixed(2)} t SWL`,
        evidenceStatus: 'missing_evidence_blocker',
        remediationGuidance: 'Split prefabricated load into lighter sub-assemblies, reposition crane closer, or specify higher-capacity crane.',
        requiresCompetentProfessionalSignOff: 'Appointed Person (Lifting)',
      });
    }

    if (lift.appointedPersonSignOffStatus === 'missing_evidence_blocker') {
      conflicts.push({
        id: `conf-lift-ap-${lift.id}`,
        category: 'missing_engineering_or_geotech_evidence',
        severity: 'blocker',
        phaseId: lift.phaseId,
        title: `Lift "${lift.name}" lacks Appointed Person method statement sign-off`,
        description: `Lifting operation "${lift.name}" has not been signed off by a certified Appointed Person.`,
        affectedElementIds: [lift.id],
        evidenceStatus: 'missing_evidence_blocker',
        remediationGuidance: 'Complete lifting method statement, slinger/signaller briefing, and Appointed Person sign-off.',
        requiresCompetentProfessionalSignOff: 'Appointed Person (Lifting)',
      });
    }
  }

  // 6. Validate Temporary Facilities & Temporary Utilities
  for (const fac of rawPlan.temporaryFacilities) {
    if (!isBoxInsideSite(fac.bounds, siteW, siteL)) {
      conflicts.push({
        id: `conf-fac-outside-${fac.id}`,
        category: 'boundary_or_setback_violation',
        severity: 'conflict',
        phaseId: fac.activePhaseIds[0] || 'all_phases',
        title: `Temporary facility "${fac.name}" extends outside site boundary`,
        description: `Cabin "${fac.name}" protrudes beyond the parcel boundary.`,
        affectedElementIds: [fac.id],
        spatialLocation: boxCenter(fac.bounds),
        evidenceStatus: 'declared_pending_verification',
        remediationGuidance: 'Reposition cabin within site compound boundaries.',
        requiresCompetentProfessionalSignOff: 'Site Manager',
      });
    }

    // Check overlap with zones
    for (const z of rawPlan.logisticsZones) {
      const sharedPhases = fac.activePhaseIds.filter((pid) => z.activePhaseIds.includes(pid));
      if (sharedPhases.length > 0 && boxesOverlap(fac.bounds, z.bounds)) {
        conflicts.push({
          id: `conf-fac-zone-${fac.id}-${z.id}`,
          category: 'storage_overlap_or_capacity_exceeded',
          severity: 'conflict',
          phaseId: sharedPhases[0],
          title: `Temporary facility "${fac.name}" overlaps zone "${z.name}"`,
          description: `Welfare/office cabin "${fac.name}" overlaps logistics zone "${z.name}".`,
          affectedElementIds: [fac.id, z.id],
          spatialLocation: boxCenter(fac.bounds),
          evidenceStatus: 'declared_pending_verification',
          remediationGuidance: 'Segregate welfare/accommodation cabins from material storage and loading areas.',
          requiresCompetentProfessionalSignOff: 'Site Manager',
        });
      }
    }

    // Check utility servicing for welfare cabins
    if (fac.requiresPotableWater) {
      const hasWater = rawPlan.utilityRequirements.some(
        (u) => u.serviceType === 'potable_water_supply' && u.connectionConfirmedStatus !== 'missing_evidence_blocker'
      );
      if (!hasWater) {
        conflicts.push({
          id: `conf-fac-water-${fac.id}`,
          category: 'utility_strike_or_clearance_hazard',
          severity: 'warning',
          phaseId: fac.activePhaseIds[0] || 'all_phases',
          title: `Welfare facility "${fac.name}" lacks confirmed potable water connection`,
          description: `Worker welfare facility "${fac.name}" requires wholesome potable water supply under construction welfare regulations.`,
          affectedElementIds: [fac.id],
          evidenceStatus: 'declared_pending_verification',
          remediationGuidance: 'Confirm mains water connection or bowsered wholesome water tank supply before workforce induction.',
          requiresCompetentProfessionalSignOff: 'Site Manager',
        });
      }
    }
  }

  for (const util of rawPlan.utilityRequirements) {
    if (util.isExistingHazardToProtect && util.permitOrUtilitySurveyStatus === 'missing_evidence_blocker') {
      conflicts.push({
        id: `conf-util-hazard-${util.id}`,
        category: 'utility_strike_or_clearance_hazard',
        severity: 'blocker',
        phaseId: util.activePhaseIds[0] || 'all_phases',
        title: `Unverified existing service hazard: "${util.name}"`,
        description: `Existing utility hazard "${util.name}" (${util.serviceType.replace(/_/g, ' ')}) lacks verified utility survey / isolation / protection sign-off.`,
        affectedElementIds: [util.id],
        spatialLocation: util.locationOrCorridor[0],
        evidenceStatus: 'missing_evidence_blocker',
        remediationGuidance: 'Perform CAT & Genny / GPR utility trace, mark exclusion corridor, and erect goalposts or physical protection.',
        requiresCompetentProfessionalSignOff: 'Utility Coordinator / Temporary Works Engineer',
      });
    }

    // Check if any crane or heavy storage intrudes into existing utility hazard buffer
    if (util.isExistingHazardToProtect && util.locationOrCorridor.length > 0) {
      for (const eq of rawPlan.equipmentPlacements) {
        const sharedPhases = util.activePhaseIds.filter((pid) => eq.activePhaseIds.includes(pid));
        if (
          sharedPhases.length > 0 &&
          polylineIntersectsBox(util.locationOrCorridor, util.safetyClearanceBufferM, eq.baseBounds)
        ) {
          conflicts.push({
            id: `conf-util-eq-clash-${util.id}-${eq.id}`,
            category: 'utility_strike_or_clearance_hazard',
            severity: 'blocker',
            phaseId: sharedPhases[0],
            title: `Equipment "${eq.name}" intrudes within ${util.safetyClearanceBufferM.toFixed(1)} m safety buffer of "${util.name}"`,
            description: `Placement of "${eq.name}" violates the mandatory ${util.safetyClearanceBufferM.toFixed(1)} m standoff buffer from existing utility hazard "${util.name}".`,
            affectedElementIds: [util.id, eq.id],
            spatialLocation: boxCenter(eq.baseBounds),
            measuredValue: `< ${util.safetyClearanceBufferM.toFixed(1)} m clearance`,
            requiredThreshold: `>= ${util.safetyClearanceBufferM.toFixed(1)} m buffer`,
            evidenceStatus: 'missing_evidence_blocker',
            remediationGuidance: 'Relocate crane/plant outside utility standoff corridor or arrange statutory utility diversion/isolation.',
            requiresCompetentProfessionalSignOff: 'Statutory Utility Provider & Appointed Person',
          });
        }
      }
    }
  }

  // 7. Validate Emergency Access & Egress Continuity
  for (const phase of rawPlan.phases) {
    const activeEmergencyRoutes = rawPlan.emergencyRoutes.filter(
      (er) => er.mustRemainUnobstructedAllPhases || er.activePhaseIds.includes(phase.id)
    );
    if (activeEmergencyRoutes.length === 0) {
      conflicts.push({
        id: `conf-emerg-missing-${phase.id}`,
        category: 'emergency_egress_or_fire_route_obstruction',
        severity: 'blocker',
        phaseId: phase.id,
        title: `No emergency access / evacuation route defined for ${phase.name}`,
        description: `Construction phase "${phase.name}" has no active emergency fire/ambulance/evacuation route defined.`,
        affectedElementIds: [phase.id],
        evidenceStatus: 'missing_evidence_blocker',
        remediationGuidance: 'Designate an unobstructed emergency access corridor and muster point for every construction phase.',
        requiresCompetentProfessionalSignOff: 'Fire & Emergency Coordinator',
      });
    }
  }

  for (const er of rawPlan.emergencyRoutes) {
    if (er.routeType === 'fire_appliance_access' && er.minClearWidthM < 3.7) {
      conflicts.push({
        id: `conf-emerg-width-${er.id}`,
        category: 'emergency_egress_or_fire_route_obstruction',
        severity: 'conflict',
        phaseId: er.activePhaseIds[0] || 'all_phases',
        title: `Fire appliance route "${er.name}" narrower than 3.70 m statutory minimum`,
        description: `Emergency fire appliance access "${er.name}" has clear width ${er.minClearWidthM.toFixed(2)} m (< 3.70 m minimum for pump appliance).`,
        affectedElementIds: [er.id],
        measuredValue: `${er.minClearWidthM.toFixed(2)} m`,
        requiredThreshold: '>= 3.70 m',
        evidenceStatus: 'declared_pending_verification',
        remediationGuidance: 'Widen emergency fire corridor to at least 3.70 m clear width with >= 4.0 m height clearance.',
        requiresCompetentProfessionalSignOff: 'Fire Safety Engineer',
      });
    }

    // Check obstruction by zones or equipment
    for (const z of rawPlan.logisticsZones) {
      if (z.category === 'loading_unloading_bay') continue;
      const sharedPhases = er.mustRemainUnobstructedAllPhases
        ? z.activePhaseIds
        : er.activePhaseIds.filter((pid) => z.activePhaseIds.includes(pid));
      if (
        sharedPhases.length > 0 &&
        polylineIntersectsBox(er.waypoints, er.minClearWidthM * 0.5, z.bounds)
      ) {
        conflicts.push({
          id: `conf-emerg-zone-obs-${er.id}-${z.id}`,
          category: 'emergency_egress_or_fire_route_obstruction',
          severity: 'blocker',
          phaseId: sharedPhases[0],
          title: `Emergency route "${er.name}" obstructed by zone "${z.name}"`,
          description: `Logistics zone "${z.name}" encroaches into the mandatory clear corridor of emergency route "${er.name}".`,
          affectedElementIds: [er.id, z.id],
          spatialLocation: boxCenter(z.bounds),
          evidenceStatus: 'missing_evidence_blocker',
          remediationGuidance: 'Keep emergency access and egress corridors 100% clear of material storage and skips at all times.',
          requiresCompetentProfessionalSignOff: 'Principal Contractor Fire & Safety Manager',
        });
      }
    }

    for (const eq of rawPlan.equipmentPlacements) {
      const sharedPhases = er.mustRemainUnobstructedAllPhases
        ? eq.activePhaseIds
        : er.activePhaseIds.filter((pid) => eq.activePhaseIds.includes(pid));
      if (
        sharedPhases.length > 0 &&
        polylineIntersectsBox(er.waypoints, er.minClearWidthM * 0.5, eq.baseBounds)
      ) {
        conflicts.push({
          id: `conf-emerg-eq-obs-${er.id}-${eq.id}`,
          category: 'emergency_egress_or_fire_route_obstruction',
          severity: 'blocker',
          phaseId: sharedPhases[0],
          title: `Emergency route "${er.name}" obstructed by equipment "${eq.name}"`,
          description: `Equipment base "${eq.name}" blocks emergency corridor "${er.name}".`,
          affectedElementIds: [er.id, eq.id],
          spatialLocation: boxCenter(eq.baseBounds),
          evidenceStatus: 'missing_evidence_blocker',
          remediationGuidance: 'Relocate equipment base or realign emergency corridor with unobstructed egress.',
          requiresCompetentProfessionalSignOff: 'Principal Contractor Fire & Safety Manager',
        });
      }
    }
  }

  // 8. Validate Deliveries & Unloading Bay Schedules
  for (let i = 0; i < rawPlan.deliveries.length; i++) {
    const del = rawPlan.deliveries[i];
    const phase = rawPlan.phases.find((p) => p.id === del.phaseId);
    const accessPt = rawPlan.accessPoints.find((a) => a.id === del.targetAccessPointId);
    const unloadZone = rawPlan.logisticsZones.find((z) => z.id === del.targetUnloadingZoneId);
    const storageZone = del.targetStorageZoneId
      ? rawPlan.logisticsZones.find((z) => z.id === del.targetStorageZoneId)
      : null;

    // Check working hours compliance
    if (phase) {
      const startMin = parseTimeMinutes(del.arrivalWindowStart);
      const endMin = parseTimeMinutes(del.arrivalWindowEnd);
      const workStartMin = parseTimeMinutes(phase.workingHoursStart);
      const workEndMin = parseTimeMinutes(phase.workingHoursEnd);

      if (startMin < workStartMin || endMin > workEndMin) {
        conflicts.push({
          id: `conf-del-hours-${del.id}`,
          category: 'delivery_schedule_or_bay_congestion',
          severity: 'conflict',
          phaseId: del.phaseId,
          title: `Delivery "${del.title}" scheduled outside permitted site working hours`,
          description: `Arrival window (${del.arrivalWindowStart}–${del.arrivalWindowEnd}) falls outside phase working hours (${phase.workingHoursStart}–${phase.workingHoursEnd}).`,
          affectedElementIds: [del.id],
          measuredValue: `${del.arrivalWindowStart}–${del.arrivalWindowEnd}`,
          requiredThreshold: `${phase.workingHoursStart}–${phase.workingHoursEnd}`,
          evidenceStatus: 'declared_pending_verification',
          remediationGuidance: 'Reschedule delivery within permitted municipal working hours or obtain out-of-hours highway/noise dispensation.',
          requiresCompetentProfessionalSignOff: 'Logistics Manager',
        });
      }
    }

    // Check access point vehicle permission
    if (accessPt && !accessPt.permittedVehicleTypes.includes(del.vehicleCategory)) {
      const std = VEHICLE_DESIGN_CATALOG[del.vehicleCategory];
      conflicts.push({
        id: `conf-del-access-veh-${del.id}`,
        category: 'access_gate_or_permit_constraint',
        severity: 'conflict',
        phaseId: del.phaseId,
        title: `Access gate "${accessPt.name}" does not permit ${std.label} for "${del.title}"`,
        description: `Delivery "${del.title}" uses ${std.label}, which is not permitted through "${accessPt.name}".`,
        affectedElementIds: [del.id, accessPt.id],
        evidenceStatus: 'declared_pending_verification',
        remediationGuidance: 'Route delivery through a heavy-vehicle access gate or split load onto smaller rigid trucks.',
        requiresCompetentProfessionalSignOff: 'Logistics Manager',
      });
    }

    // Check unloading zone active in phase
    if (unloadZone && !unloadZone.activePhaseIds.includes(del.phaseId)) {
      conflicts.push({
        id: `conf-del-unload-phase-${del.id}`,
        category: 'delivery_schedule_or_bay_congestion',
        severity: 'conflict',
        phaseId: del.phaseId,
        title: `Unloading bay "${unloadZone.name}" is inactive during phase of delivery "${del.title}"`,
        description: `Delivery "${del.title}" targets unloading bay "${unloadZone.name}", which is not active in ${phase?.name || del.phaseId}.`,
        affectedElementIds: [del.id, unloadZone.id],
        evidenceStatus: 'declared_pending_verification',
        remediationGuidance: 'Activate the unloading bay for this phase or assign an active phase unloading zone.',
        requiresCompetentProfessionalSignOff: 'Logistics Manager',
      });
    }

    // Check storage zone capacity
    if (storageZone && del.requiredStorageAreaM2 > storageZone.usableCapacityM2) {
      conflicts.push({
        id: `conf-del-storage-cap-${del.id}`,
        category: 'storage_overlap_or_capacity_exceeded',
        severity: 'conflict',
        phaseId: del.phaseId,
        title: `Delivery "${del.title}" storage demand (${del.requiredStorageAreaM2} m²) exceeds "${storageZone.name}" capacity (${storageZone.usableCapacityM2} m²)`,
        description: `Required laydown area (${del.requiredStorageAreaM2} m²) for "${del.title}" exceeds usable capacity (${storageZone.usableCapacityM2} m²) of "${storageZone.name}".`,
        affectedElementIds: [del.id, storageZone.id],
        measuredValue: `${del.requiredStorageAreaM2} m² required`,
        requiredThreshold: `<= ${storageZone.usableCapacityM2} m² capacity`,
        evidenceStatus: 'declared_pending_verification',
        remediationGuidance: 'Split delivery into smaller Just-In-Time (JIT) batches or expand storage zone footprint.',
        requiresCompetentProfessionalSignOff: 'Logistics Manager',
      });
    }

    // Check double-booking of unloading bay on same date and overlapping time window
    for (let j = i + 1; j < rawPlan.deliveries.length; j++) {
      const other = rawPlan.deliveries[j];
      if (
        del.scheduledDateIso === other.scheduledDateIso &&
        del.targetUnloadingZoneId === other.targetUnloadingZoneId &&
        timeWindowsOverlap(
          del.arrivalWindowStart,
          del.arrivalWindowEnd,
          other.arrivalWindowStart,
          other.arrivalWindowEnd
        )
      ) {
        conflicts.push({
          id: `conf-del-doublebook-${del.id}-${other.id}`,
          category: 'delivery_schedule_or_bay_congestion',
          severity: 'conflict',
          phaseId: del.phaseId,
          title: `Unloading bay double-booked: "${del.title}" & "${other.title}" on ${del.scheduledDateIso}`,
          description: `Both deliveries are scheduled at "${unloadZone?.name || del.targetUnloadingZoneId}" on ${del.scheduledDateIso} with overlapping windows (${del.arrivalWindowStart}–${del.arrivalWindowEnd} vs ${other.arrivalWindowStart}–${other.arrivalWindowEnd}).`,
          affectedElementIds: [del.id, other.id, del.targetUnloadingZoneId],
          measuredValue: `${del.arrivalWindowStart}–${del.arrivalWindowEnd} & ${other.arrivalWindowStart}–${other.arrivalWindowEnd}`,
          requiredThreshold: 'Non-overlapping booking windows',
          evidenceStatus: 'declared_pending_verification',
          remediationGuidance: 'Stagger delivery arrival windows or assign a secondary unloading bay.',
          requiresCompetentProfessionalSignOff: 'Site Logistics / Gate Booking Controller',
        });
      }
    }
  }

  // 9. Compute Phase Space Utilization Summaries
  const phaseSummaries: PhaseSpaceUtilizationSummary[] = rawPlan.phases.map((phase) => {
    const bBounds = getActiveBuildingBoundsForPhase(rawPlan.buildingBoundsM, phase);
    const activeBldgAreaM2 = Number((bBounds.widthM * bBounds.lengthM).toFixed(2));

    const activeRestrictions = rawPlan.siteRestrictions.filter((r) => r.activePhaseIds.includes(phase.id));
    const restrictedAreaM2 = Number(
      activeRestrictions.reduce((acc, r) => acc + r.bounds.widthM * r.bounds.lengthM, 0).toFixed(2)
    );

    const netExteriorM2 = Math.max(1, Number((totalSiteAreaM2 - activeBldgAreaM2 - restrictedAreaM2).toFixed(2)));

    const activeZones = rawPlan.logisticsZones.filter((z) => z.activePhaseIds.includes(phase.id));
    const allocatedStorageM2 = Number(
      activeZones.reduce((acc, z) => acc + z.bounds.widthM * z.bounds.lengthM, 0).toFixed(2)
    );

    const activeEq = rawPlan.equipmentPlacements.filter((e) => e.activePhaseIds.includes(phase.id));
    const eqAreaM2 = activeEq.reduce(
      (acc, e) => acc + Math.max(e.baseBounds.widthM, e.outriggerSpreadWidthM) * Math.max(e.baseBounds.lengthM, e.outriggerSpreadLengthM),
      0
    );

    const activeFac = rawPlan.temporaryFacilities.filter((f) => f.activePhaseIds.includes(phase.id));
    const facAreaM2 = activeFac.reduce((acc, f) => acc + f.bounds.widthM * f.bounds.lengthM, 0);

    const allocatedEqFacM2 = Number((eqAreaM2 + facAreaM2).toFixed(2));
    const totalAllocatedM2 = Number((allocatedStorageM2 + allocatedEqFacM2).toFixed(2));
    const utilPct = Number(((totalAllocatedM2 / netExteriorM2) * 100).toFixed(1));

    const phaseDeliveries = rawPlan.deliveries.filter((d) => d.phaseId === phase.id);
    const reqPeakStorageM2 = Number(
      phaseDeliveries.reduce((acc, d) => acc + (d.justInTimeDelivery ? d.requiredStorageAreaM2 * 0.5 : d.requiredStorageAreaM2), 0).toFixed(2)
    );

    const phaseConflicts = conflicts.filter(
      (c) => (c.phaseId === phase.id || c.phaseId === 'all_phases') && c.severity === 'conflict'
    ).length;
    const phaseBlockers = conflicts.filter(
      (c) => (c.phaseId === phase.id || c.phaseId === 'all_phases') && c.severity === 'blocker'
    ).length;

    return {
      phaseId: phase.id,
      phaseName: phase.name,
      totalSiteAreaM2,
      activeBuildingFootprintM2: activeBldgAreaM2,
      restrictedNoGoAreaM2: restrictedAreaM2,
      netAvailableExteriorSiteAreaM2: netExteriorM2,
      allocatedStorageAndLaydownM2: allocatedStorageM2,
      allocatedEquipmentAndFacilitiesM2: allocatedEqFacM2,
      totalAllocatedLogisticsFootprintM2: totalAllocatedM2,
      exteriorSiteUtilizationPct: utilPct,
      requiredPeakDeliveryStorageM2: reqPeakStorageM2,
      storageCapacityCoverageRatio:
        reqPeakStorageM2 > 0 ? Number((allocatedStorageM2 / reqPeakStorageM2).toFixed(2)) : null,
      activeConflictCount: phaseConflicts,
      activeBlockerCount: phaseBlockers,
    };
  });

  // 10. Compute Transport Carbon Compatibility Summary (P44 Module A4)
  let deliveriesWithA4 = 0;
  let totalPayloadTonnes = 0;
  let totalTonneKm = 0;
  let totalA4KgCO2e = 0;

  for (const d of rawPlan.deliveries) {
    const totalLoadT = d.grossPayloadTonnes * d.vehicleCountInWindow;
    totalPayloadTonnes += totalLoadT;
    if (d.oneWayTransportDistanceKm !== null && d.transportEmissionFactorKgCO2ePerTonneKm !== null) {
      deliveriesWithA4++;
      const tkm = totalLoadT * d.oneWayTransportDistanceKm;
      totalTonneKm += tkm;
      totalA4KgCO2e += tkm * d.transportEmissionFactorKgCO2ePerTonneKm;
    }
  }

  const transportCarbonSummary: TransportCarbonCompatibilitySummary = {
    status:
      rawPlan.deliveries.length > 0 && deliveriesWithA4 === rawPlan.deliveries.length
        ? 'computed_with_explicit_factors'
        : deliveriesWithA4 > 0
        ? 'partial_missing_factors'
        : 'not_computed_missing_inputs',
    totalScheduledDeliveries: rawPlan.deliveries.length,
    deliveriesWithCompleteA4Data: deliveriesWithA4,
    totalScheduledPayloadTonnes: Number(totalPayloadTonnes.toFixed(2)),
    totalTonneKilometres: Number(totalTonneKm.toFixed(2)),
    estimatedModuleA4TransportKgCO2e:
      deliveriesWithA4 > 0 ? Number(totalA4KgCO2e.toFixed(2)) : null,
    p44LinkedAssessmentId: project.carbonAssessment?.activeAssessment?.assessmentId ?? null,
    transparencyNote:
      deliveriesWithA4 === rawPlan.deliveries.length && rawPlan.deliveries.length > 0
        ? `Computed deterministically across ${deliveriesWithA4} deliveries using explicitly declared one-way haul distances (km) and transport factors (kgCO₂e/t·km).`
        : deliveriesWithA4 > 0
        ? `Partial Module A4 transport estimate (${deliveriesWithA4}/${rawPlan.deliveries.length} deliveries have explicit distance and emission factors; unverified deliveries are excluded without fabrication).`
        : 'Transport emissions (EN 15978 Module A4) are not computed because delivery distance and/or transport emission factors are not declared.',
  };

  // 11. Cross-Discipline Context (P41–P46)
  const p45HazardsFlagged = (project.climateResilience?.activeAssessment?.hazards || [])
    .filter((h) => h.hazardSeverityLevel === 'high' || h.hazardSeverityLevel === 'very-high')
    .map((h) => `${h.title} (${h.hazardSeverityLevel})`);

  const p46FragileZones = rawPlan.logisticsZones.filter(
    (z) => (z.linkedEnvelopeAssemblyIds && z.linkedEnvelopeAssemblyIds.length > 0) || z.handlingSensitivity === 'fragile_glazing_vertical_stillage'
  ).length;

  const crossDisciplineContext: CrossDisciplineContextSummary = {
    p41IfcElementsReferenced: project.ifcInterop?.preservedElements?.length ?? 0,
    p42CadConstraintsReferenced:
      rawPlan.siteRestrictions.filter((r) => r.provenance === 'cad_imported_layer').length +
      (project.cadInterop?.referenceEntities?.length ?? 0),
    p43TerrainSlopeEvaluated: Boolean(project.terrainModeling?.analysis || project.siteContext?.slope),
    p43MaxSiteSlopePct: Number(effectiveSiteSlopePct.toFixed(2)),
    p44CarbonLinked: Boolean(project.carbonAssessment?.activeAssessment),
    p45ClimateHazardsFlagged: p45HazardsFlagged,
    p46EnvelopeFragileStagingLinked: p46FragileZones,
    provenanceNotes: [
      `Parcel boundary (${siteW.toFixed(2)} m × ${siteL.toFixed(2)} m) and road frontage (${project.roadFacing}) sourced from Project & Site Context.`,
      project.terrainModeling?.analysis
        ? `Topographic gradient (${effectiveSiteSlopePct.toFixed(1)}% max slope) sourced from P43 Terrain TIN Model.`
        : `Slope context (${effectiveSiteSlopePct.toFixed(1)}%) sourced from Site Context slope classification.`,
      p45HazardsFlagged.length > 0
        ? `P45 Climate Resilience screening flags ${p45HazardsFlagged.join(', ')} for site drainage & wind shutdown planning.`
        : 'P45 Climate Resilience context checked (no high/extreme hazards flagged or assessment not yet run).',
    ],
  };

  // 12. Synthesize Structured Risk Findings
  const blockerConflicts = conflicts.filter((c) => c.severity === 'blocker');
  const regularConflicts = conflicts.filter((c) => c.severity === 'conflict');
  const warningConflicts = conflicts.filter((c) => c.severity === 'warning');

  if (blockerConflicts.some((c) => c.category === 'missing_engineering_or_geotech_evidence')) {
    riskFindings.push({
      id: 'risk-geotech-lifting',
      domain: 'lifting_plant',
      severity: 'blocker',
      headline: 'Unverified Crane Ground-Bearing or Lift Plan Engineering Evidence',
      rationale:
        'One or more cranes, outrigger mats, heavy laydown zones, or lifting operations lack verified geotechnical bearing capacity or Appointed Person Lift Plan sign-off.',
      mitigationAction:
        'Complete plate bearing / CBR verification, Temporary Works outrigger mat design, and manufacturer load-chart verification before plant mobilization.',
      verificationGateRequired: 'Temporary Works Engineer & Appointed Person (Lifting)',
    });
  }

  if (
    conflicts.some((c) => c.category === 'pedestrian_vehicle_segregation_hazard')
  ) {
    riskFindings.push({
      id: 'risk-ped-veh',
      domain: 'traffic_pedestrian',
      severity: blockerConflicts.some((c) => c.category === 'pedestrian_vehicle_segregation_hazard')
        ? 'blocker'
        : 'conflict',
      headline: 'Pedestrian-Vehicle Interface & Reversing Hazards Detected',
      rationale:
        'Uncontrolled route crossings, unmarshalled reversing manoeuvres, or non-physical walkway barriers expose site operatives to mobile plant hazards.',
      mitigationAction:
        'Provide continuous physical barriers along pedestrian walkways, controlled crossing gates at intersections, and mandatory trained Traffic Marshalls.',
      verificationGateRequired: 'Principal Contractor Health & Safety Manager',
    });
  }

  if (conflicts.some((c) => c.category === 'delivery_schedule_or_bay_congestion')) {
    riskFindings.push({
      id: 'risk-delivery-congestion',
      domain: 'delivery_staging',
      severity: 'conflict',
      headline: 'Unloading Bay Congestion or Out-of-Hours Delivery Schedule Clash',
      rationale:
        'Overlapping delivery time slots at the same unloading bay risk highway queuing and unsafe ad-hoc unloading.',
      mitigationAction:
        'Stagger delivery booking slots, enforce Just-In-Time (JIT) call-offs, and confirm off-site holding area fallback.',
      verificationGateRequired: 'Site Logistics & Gate Booking Controller',
    });
  }

  if (p45HazardsFlagged.length > 0 || effectiveSiteSlopePct > 5.0) {
    riskFindings.push({
      id: 'risk-env-slope-weather',
      domain: 'neighbor_environmental',
      severity: effectiveSiteSlopePct > 10.0 ? 'conflict' : 'warning',
      headline: 'Topographic Gradient & Environmental Weather Sensitivity',
      rationale: `Site slope (${effectiveSiteSlopePct.toFixed(1)}%) and climate exposure (${p45HazardsFlagged.length > 0 ? p45HazardsFlagged.join(', ') : 'standard seasonal weather'}) affect haul road traction, silt runoff, and crane wind limits.`,
      mitigationAction:
        'Maintain anemometer wind-speed cut-offs on lifting plant, provide silt interceptors on haul roads, and cover moisture-sensitive envelope materials.',
      verificationGateRequired: 'Temporary Works & Environmental Coordinator',
    });
  }

  // Count unverified evidence gates across access points, zones, equipment, lifts, and utilities
  const unverifiedGatesCount =
    rawPlan.accessPoints.filter((a) => a.highwayAuthorityPermitStatus !== 'verified_approved').length +
    rawPlan.logisticsZones.filter((z) => z.groundBearingRequirementKPa !== null && z.groundBearingStatus !== 'verified_approved').length +
    rawPlan.equipmentPlacements.filter(
      (e) =>
        e.groundBearingApprovalStatus !== 'verified_approved' ||
        e.certifiedLiftPlanApprovalStatus !== 'verified_approved' ||
        e.undergroundServiceClearanceStatus !== 'verified_approved'
    ).length +
    rawPlan.liftingOperations.filter((l) => l.appointedPersonSignOffStatus !== 'verified_approved').length +
    rawPlan.utilityRequirements.filter((u) => u.isExistingHazardToProtect && u.permitOrUtilitySurveyStatus !== 'verified_approved').length;

  const peakUtilPct =
    phaseSummaries.length > 0
      ? Math.max(...phaseSummaries.map((ps) => ps.exteriorSiteUtilizationPct))
      : 0;

  const bldgAreaM2 = Number((rawPlan.buildingBoundsM.widthM * rawPlan.buildingBoundsM.lengthM).toFixed(2));
  const remExtM2 = Math.max(0, Number((totalSiteAreaM2 - bldgAreaM2).toFixed(2)));

  const summary: SiteLogisticsMetricsSummary = {
    totalSiteAreaM2,
    buildingFootprintAreaM2: bldgAreaM2,
    remainingExteriorAreaM2: remExtM2,
    totalPhases: rawPlan.phases.length,
    totalAccessPoints: rawPlan.accessPoints.length,
    totalVehicleRoutes: rawPlan.vehicleRoutes.length,
    totalPedestrianRoutes: rawPlan.pedestrianRoutes.length,
    totalLogisticsZones: rawPlan.logisticsZones.length,
    totalEquipmentPlacements: rawPlan.equipmentPlacements.length,
    totalLiftingOperations: rawPlan.liftingOperations.length,
    totalTemporaryFacilities: rawPlan.temporaryFacilities.length,
    totalUtilityRequirements: rawPlan.utilityRequirements.length,
    totalEmergencyRoutes: rawPlan.emergencyRoutes.length,
    totalDeliveriesScheduled: rawPlan.deliveries.length,
    peakExteriorUtilizationPct: peakUtilPct,
    blockerCount: blockerConflicts.length,
    conflictCount: regularConflicts.length,
    warningCount: warningConflicts.length,
    unverifiedEvidenceGatesCount: unverifiedGatesCount,
    overallReadinessStatus:
      blockerConflicts.length > 0 || regularConflicts.length > 0
        ? 'blocked_critical_safety_or_conflict'
        : unverifiedGatesCount > 0 || warningConflicts.length > 0
        ? 'conditional_pending_professional_verification'
        : 'preliminary_planning_aligned',
  };

  const assumptionsAndLimitations = [
    'All spatial coordinates, clearances, turning radii, and zone capacities are evaluated deterministically in metres (1 ft = 0.3048 m).',
    'A visually clean 2D site layout is NOT proof of safe lifting, adequate ground-bearing capacity, highway compliance, or an approved construction method statement.',
    'Vehicle turning checks screen corridor widths and minimum inner turning radii against reference vehicle classes; complex tight manoeuvres require certified external swept-path simulation.',
    'Crane reach circles represent geometric horizontal radii; actual safe working loads (SWL) depend on manufacturer load charts, boom configuration, counterweight, wind speed, and Temporary Works foundation/mat design.',
    'Subsurface utility locations and soil bearing capacities are never fabricated and require site-specific PAS 128 utility surveys and geotechnical investigation.',
  ];

  return {
    ...rawPlan,
    routeAnalyses,
    phaseSummaries,
    conflicts,
    riskFindings,
    transportCarbonSummary,
    crossDisciplineContext,
    summary,
    assumptionsAndLimitations,
    geometryFingerprint: computeSiteLogisticsFingerprint(project),
    evaluatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// INITIALIZE DEFAULT SITE LOGISTICS PLAN FROM PROJECT CONTEXT
// ---------------------------------------------------------------------------

export function initializeSiteLogisticsPlan(project: Project): SiteLogisticsPlan {
  if (project.siteLogistics?.activePlan) {
    return evaluateSiteLogisticsPlan(project, project.siteLogistics.activePlan);
  }

  const siteW = toMetres(project.plotWidth, project.unit);
  const siteL = toMetres(project.plotLength, project.unit);
  const bBounds = extractBuildingBoundsMetres(project);

  const phases: SiteLogisticsPhase[] = [
    {
      id: 'phase-1-enabling',
      stageType: 'enabling_excavation',
      name: 'Phase 1 — Enabling, Demolition & Bulk Earthworks',
      sequenceOrder: 1,
      startDateIso: '2026-06-01',
      endDateIso: '2026-07-15',
      durationDays: 45,
      activeBuildingFootprintRatio: 0.75,
      workingHoursStart: '07:30',
      workingHoursEnd: '18:00',
      saturdayAllowed: true,
      sundayOrHolidayAllowed: false,
      notes: 'Perimeter hoarding, tree protection fencing, muck-away haulage, and piling/excavation.',
    },
    {
      id: 'phase-2-substructure',
      stageType: 'substructure_foundation',
      name: 'Phase 2 — Substructure, Foundations & Ground Slab',
      sequenceOrder: 2,
      startDateIso: '2026-07-16',
      endDateIso: '2026-09-15',
      durationDays: 62,
      activeBuildingFootprintRatio: 1.0,
      workingHoursStart: '07:30',
      workingHoursEnd: '18:00',
      saturdayAllowed: true,
      sundayOrHolidayAllowed: false,
      notes: 'Rebar cages, concrete agitator pours, mobile concrete pump, and sub-slab drainage.',
    },
    {
      id: 'phase-3-superstructure',
      stageType: 'superstructure_frame',
      name: 'Phase 3 — Superstructure Frame & Upper Floors',
      sequenceOrder: 3,
      startDateIso: '2026-09-16',
      endDateIso: '2026-12-15',
      durationDays: 91,
      activeBuildingFootprintRatio: 1.0,
      workingHoursStart: '07:30',
      workingHoursEnd: '18:00',
      saturdayAllowed: true,
      sundayOrHolidayAllowed: false,
      notes: 'Primary structural frame erection, crane lifting operations, and perimeter edge protection.',
    },
    {
      id: 'phase-4-envelope-fitout',
      stageType: 'envelope_weatherproofing',
      name: 'Phase 4 — Envelope Cladding, Glazing & MEP Fit-Out',
      sequenceOrder: 4,
      startDateIso: '2026-12-16',
      endDateIso: '2027-03-31',
      durationDays: 105,
      activeBuildingFootprintRatio: 1.0,
      workingHoursStart: '07:30',
      workingHoursEnd: '18:00',
      saturdayAllowed: true,
      sundayOrHolidayAllowed: false,
      notes: 'Weatherproof glazing stillage, insulated facade panels, goods hoist, and internal fit-out.',
    },
  ];

  const allPhaseIds = phases.map((p) => p.id);

  // Derive access points from project.siteContext or roadFacing side
  const primarySide: RoadFacingSide =
    project.roadFacing === 'North' ||
    project.roadFacing === 'South' ||
    project.roadFacing === 'East' ||
    project.roadFacing === 'West'
      ? project.roadFacing
      : 'South';

  const accessPoints: SiteAccessPointRecord[] = [
    {
      id: 'gate-1-vehicular',
      name: `Gate A — Primary Construction Vehicle Access (${primarySide})`,
      boundarySide: primarySide,
      offsetAlongSideM: 1.0,
      clearWidthM: 4.5,
      clearHeightM: null,
      directionMode: 'two_way_controlled',
      permittedVehicleTypes: [
        'light_van_utility',
        'rigid_flatbed_10m',
        'concrete_mixer_9m',
        'articulated_hgv_16_5m',
        'mobile_crane_carrier',
        'fire_appliance_emergency',
      ],
      maxVehicleLengthM: 16.5,
      maxGrossVehicleWeightTonnes: 44,
      surfaceCondition: 'paved_heavy_duty',
      visibilitySplayConfirmed: true,
      highwayAuthorityPermitStatus: 'verified_approved',
      activePhaseIds: allPhaseIds,
      provenance: project.siteContext?.accessPoints?.length ? 'project_site_context' : 'user_declared_plan',
      notes: 'Primary heavy-duty vehicle gate with Traffic Marshall booth and wheel-wash bay.',
    },
    {
      id: 'gate-2-pedestrian',
      name: `Gate B — Segregated Operative Pedestrian Turnstile (${primarySide})`,
      boundarySide: primarySide,
      offsetAlongSideM: Number(Math.min(siteW - 2.0, Math.max(6.0, siteW - 2.5)).toFixed(2)),
      clearWidthM: 1.5,
      clearHeightM: 2.4,
      directionMode: 'two_way_controlled',
      permittedVehicleTypes: [],
      maxVehicleLengthM: null,
      maxGrossVehicleWeightTonnes: null,
      surfaceCondition: 'paved_heavy_duty',
      visibilitySplayConfirmed: true,
      highwayAuthorityPermitStatus: 'verified_approved',
      activePhaseIds: allPhaseIds,
      provenance: 'user_declared_plan',
      notes: 'Biometric / badge access turnstile segregated from vehicle gate.',
    },
  ];

  // Convert project.siteContext.obstacles into SiteRestrictionRecords first so default layout avoids them
  const siteRestrictions: SiteRestrictionRecord[] = (project.siteContext?.obstacles || []).map((obs) => {
    const ox = toMetres(obs.x, project.unit);
    const oy = toMetres(obs.y, project.unit);
    const ow = toMetres(obs.width, project.unit);
    const ol = toMetres(obs.length, project.unit);
    return {
      id: `res-obs-${obs.id}`,
      name: `${obs.name} (${obs.type.replace(/-/g, ' ')})`,
      category:
        obs.type === 'tree'
          ? 'tree_root_protection_zone'
          : obs.type === 'easement'
          ? 'easement_wayleave_no_build'
          : 'heritage_or_party_wall_standoff',
      bounds: {
        x: ox,
        y: oy,
        widthM: ow,
        lengthM: ol,
      },
      prohibitsStorageAndStaging: obs.preservationStatus !== 'removable',
      prohibitsHeavyPlantAndCranes: obs.preservationStatus !== 'removable',
      prohibitsVehicleTraffic: obs.preservationStatus !== 'removable',
      activePhaseIds: allPhaseIds,
      provenance: 'project_site_context',
      sourceEntityId: obs.id,
      notes: obs.notes || `Preservation status: ${obs.preservationStatus}`,
    };
  });

  // Helper to nudge a candidate box in the exterior yard so it does not overlap building, restricted obstacles, or already placed boxes
  const placedBoxes: SiteBoundingBox2D[] = [];
  const findClearYardBox = (preferred: SiteBoundingBox2D, extraReservedBoxes: SiteBoundingBox2D[] = []): SiteBoundingBox2D => {
    const candidates: SiteBoundingBox2D[] = [preferred];
    for (let y = Number((siteL - preferred.lengthM - 0.3).toFixed(2)); y >= 0.3; y -= 1.0) {
      for (let x = 0.4; x <= siteW - preferred.widthM - 0.4; x += 1.0) {
        candidates.push({
          x: Number(x.toFixed(2)),
          y: Number(y.toFixed(2)),
          widthM: preferred.widthM,
          lengthM: preferred.lengthM,
        });
      }
    }
    for (const c of candidates) {
      if (!isBoxInsideSite(c, siteW, siteL)) continue;
      if (boxesOverlap(c, bBounds, 0.15)) continue;
      const hitsObstacle = siteRestrictions.some(
        (r) =>
          (r.prohibitsStorageAndStaging || r.prohibitsHeavyPlantAndCranes) &&
          boxesOverlap(c, r.bounds, 0.1)
      );
      if (hitsObstacle) continue;
      const hitsPlaced = [...placedBoxes, ...extraReservedBoxes].some((pb) => boxesOverlap(c, pb, 0.25));
      if (!hitsPlaced) {
        placedBoxes.push(c);
        return c;
      }
    }
    placedBoxes.push(preferred);
    return preferred;
  };

  // Unloading bay near Gate A in South yard left
  const unloadBayBounds: SiteBoundingBox2D = findClearYardBox({
    x: 0.6,
    y: Number(Math.max(0.5, siteL - 3.2).toFixed(2)),
    widthM: 2.6,
    lengthM: 2.4,
  });

  // Reserve the 3.8m vehicle & emergency corridor leading into unloadBayBounds
  const vRouteX = Number((unloadBayBounds.x + unloadBayBounds.widthM * 0.5).toFixed(2));
  const reservedCorridorBox: SiteBoundingBox2D = {
    x: Math.max(0, vRouteX - 1.95),
    y: unloadBayBounds.y,
    widthM: 3.9,
    lengthM: Number((siteL - unloadBayBounds.y).toFixed(2)),
  };

  // Crane / Lifting Equipment placement in South yard clear of unloading corridor
  const craneBounds: SiteBoundingBox2D = findClearYardBox(
    {
      x: Number(Math.min(siteW - 2.6, Math.max(4.2, unloadBayBounds.x + unloadBayBounds.widthM + 1.2)).toFixed(2)),
      y: unloadBayBounds.y,
      widthM: 2.0,
      lengthM: 2.0,
    },
    [reservedCorridorBox]
  );

  // Material storage / laydown zone in South yard center-right
  const storageZoneBounds: SiteBoundingBox2D = findClearYardBox(
    {
      x: Number(Math.min(siteW - 3.2, craneBounds.x + craneBounds.widthM + 0.8).toFixed(2)),
      y: unloadBayBounds.y,
      widthM: 2.6,
      lengthM: 2.2,
    },
    [reservedCorridorBox]
  );

  // Waste skip & recycling zone in North yard left
  const wasteZoneBounds: SiteBoundingBox2D = findClearYardBox(
    {
      x: 0.6,
      y: 0.4,
      widthM: 2.0,
      lengthM: 1.8,
    },
    [reservedCorridorBox]
  );

  const envelopeAssemblyIds = (project.envelopePerformance?.activeAssessment?.assemblies || []).map((a) => a.assemblyId);

  const logisticsZones: SiteLogisticsZoneRecord[] = [
    {
      id: 'zone-1-unloading',
      name: 'Bay 1 — Dedicated Vehicle Loading / Unloading Bay',
      category: 'loading_unloading_bay',
      bounds: unloadBayBounds,
      usableCapacityM2: Number((unloadBayBounds.widthM * unloadBayBounds.lengthM).toFixed(1)),
      maxStackHeightM: 2.5,
      groundBearingRequirementKPa: 75,
      verifiedGroundBearingCapacityKPa: 120,
      groundBearingStatus: 'verified_approved',
      handlingSensitivity: 'general_outdoor_palletized',
      weatherProtectionProvided: false,
      containmentBundProvided: false,
      activePhaseIds: allPhaseIds,
      provenance: 'user_declared_plan',
      notes: 'Compacted hardcore unloading bay within crane hook reach.',
    },
    {
      id: 'zone-2-laydown',
      name: 'Zone 2 — Structural & Envelope Material Laydown Stillage',
      category: 'laydown_staging',
      bounds: storageZoneBounds,
      usableCapacityM2: Number((storageZoneBounds.widthM * storageZoneBounds.lengthM).toFixed(1)),
      maxStackHeightM: 2.2,
      groundBearingRequirementKPa: 60,
      verifiedGroundBearingCapacityKPa: 100,
      groundBearingStatus: 'verified_approved',
      handlingSensitivity: 'fragile_glazing_vertical_stillage',
      weatherProtectionProvided: true,
      containmentBundProvided: false,
      linkedEnvelopeAssemblyIds: envelopeAssemblyIds,
      activePhaseIds: allPhaseIds,
      provenance: 'user_declared_plan',
      notes: 'Weatherproofed vertical A-frame stillage and timber cribbing for structural & P46 envelope packs.',
    },
    {
      id: 'zone-3-waste',
      name: 'Zone 3 — Segregated Waste Skips & Recycling Compound',
      category: 'waste_skip_recycling',
      bounds: wasteZoneBounds,
      usableCapacityM2: Number((wasteZoneBounds.widthM * wasteZoneBounds.lengthM).toFixed(1)),
      maxStackHeightM: 1.8,
      groundBearingRequirementKPa: 40,
      verifiedGroundBearingCapacityKPa: 90,
      groundBearingStatus: 'verified_approved',
      handlingSensitivity: 'general_outdoor_palletized',
      weatherProtectionProvided: true,
      containmentBundProvided: true,
      activePhaseIds: allPhaseIds,
      provenance: 'user_declared_plan',
      notes: 'Segregated timber, metal, gypsum, and inert waste skips.',
    },
  ];

  // Vehicle Route connecting Gate A straight into Unloading Bay 1
  const vehicleRoutes: VehicleRouteRecord[] = [
    {
      id: 'vroute-1-main',
      name: 'Haul Route 1 — Gate A to Unloading Bay 1',
      entryAccessPointId: 'gate-1-vehicular',
      exitAccessPointId: 'gate-1-vehicular',
      waypoints: [
        { x: vRouteX, y: Number((siteL - 0.2).toFixed(2)) },
        { x: vRouteX, y: Number((unloadBayBounds.y + unloadBayBounds.lengthM * 0.5).toFixed(2)) },
      ],
      corridorWidthM: 3.8,
      minVerticalClearanceM: null,
      designVehicleCategory: 'concrete_mixer_9m',
      requiredMinCorridorWidthM: 3.8,
      requiredMinInnerTurningRadiusM: 9.0,
      declaredMinCurveRadiusM: 10.0,
      oneWayOperation: false,
      requiresReversingManoeuvre: true,
      trainedBanksmanMarshallingConfirmed: true,
      wheelWashProvidedAtExit: true,
      maxSpeedLimitKmh: 10,
      surfaceCondition: 'compacted_hardcore',
      maxRouteGradientPct: null,
      sweptPathMethod: 'geometric_corridor_and_radius_screening',
      activePhaseIds: allPhaseIds,
      provenance: 'user_declared_plan',
      notes: 'Marshalled vehicle access corridor with wheel-wash at Gate A.',
    },
  ];

  // Welfare cabin in North yard right
  const welfareBounds: SiteBoundingBox2D = findClearYardBox({
    x: Number(Math.max(3.5, siteW - 3.0).toFixed(2)),
    y: 0.4,
    widthM: 2.2,
    lengthM: 1.8,
  });

  const temporaryFacilities: TemporaryFacilityRecord[] = [
    {
      id: 'fac-1-welfare',
      name: 'Cabin 1 — Stacked Site Office, Welfare Canteen & Drying Room',
      category: 'worker_welfare_canteen_drying',
      bounds: welfareBounds,
      storeys: 2,
      maxOccupancyPersons: 16,
      requiresPowerConnection: true,
      requiresPotableWater: true,
      requiresFoulDrainage: true,
      fireAssemblyPointNearby: true,
      activePhaseIds: allPhaseIds,
      provenance: 'user_declared_plan',
      notes: 'Two-storey jackleg cabin unit with ground-floor canteen/WC and first-floor site management office.',
    },
  ];

  // Pedestrian route along right perimeter from Gate B to Welfare Cabin
  const pedX = Number(Math.max(0.8, siteW - 0.6).toFixed(2));
  const pedestrianRoutes: PedestrianRouteRecord[] = [
    {
      id: 'proute-1-welfare',
      name: 'Walkway 1 — Gate B to Welfare Cabin & Hoist Access',
      waypoints: [
        { x: pedX, y: Number((siteL - 0.3).toFixed(2)) },
        { x: pedX, y: Number((welfareBounds.y + welfareBounds.lengthM).toFixed(2)) },
      ],
      clearWidthM: 1.3,
      barrierType: 'physical_jersey_or_water_filled_barrier',
      weatherProtectedCovered: true,
      lightingProvided: true,
      stepFreeAccessible: true,
      controlledCrossingPoints: [],
      connectsAccessToWelfare: true,
      activePhaseIds: allPhaseIds,
      provenance: 'user_declared_plan',
      notes: 'Segregated pedestrian walkway with physical barrier and 110V festoon lighting.',
    },
  ];

  const craneCenter = boxCenter(craneBounds);
  const bldgCenter = boxCenter(bBounds);
  const unloadCenter = boxCenter(unloadBayBounds);
  const maxLiftDistM = Number(
    Math.max(euclideanDistance(craneCenter, bldgCenter), euclideanDistance(craneCenter, unloadCenter)).toFixed(2)
  );

  const equipmentPlacements: ConstructionEquipmentPlacement[] = [
    {
      id: 'eq-1-crane',
      name: 'Crane 1 — Compact Pedestrian-Operated / Mobile Tower Crane',
      category: 'tower_crane_luffing_or_hammerhead',
      baseBounds: craneBounds,
      outriggerSpreadWidthM: 2.2,
      outriggerSpreadLengthM: 2.2,
      operatingRadiusM: Number((maxLiftDistM + 1.5).toFixed(1)),
      tailSwingRadiusM: 2.0,
      maxHeightM: Number((project.floors * 3.5 + 8.0).toFixed(1)),
      requiredGroundBearingKPa: 165,
      verifiedGroundBearingKPa: 185,
      groundBearingApprovalStatus: 'verified_approved',
      certifiedLiftPlanApprovalStatus: 'verified_approved',
      undergroundServiceClearanceStatus: 'verified_approved',
      oversailsOutsideSiteBoundaryPermitted: true,
      oversailLicenseApproved: true,
      exclusionZoneRadiusM: 2.4,
      activePhaseIds: ['phase-2-substructure', 'phase-3-superstructure', 'phase-4-envelope-fitout'],
      provenance: 'user_declared_plan',
      notes: 'Engineered crane base pad with electronic slew limiters and Appointed Person Lift Plan.',
    },
  ];

  const liftingOperations: LiftingOperationPlan[] = [
    {
      id: 'lift-1-frame-glazing',
      name: 'Lift 1 — Structural Frame & Pre-Glazed Facade Stillage Pick',
      equipmentId: 'eq-1-crane',
      phaseId: 'phase-3-superstructure',
      pickupZoneId: 'zone-1-unloading',
      targetDropCoordinate: bldgCenter,
      loadDescription: 'Primary structural beam / prefabricated facade cassette including spreader beam',
      grossLoadWeightTonnes: 2.4,
      requiredLiftRadiusM: maxLiftDistM,
      declaredRatedCapacityAtRadiusTonnes: 3.5,
      windSpeedOperationalLimitMs: 16.5,
      appointedPersonSignOffStatus: 'verified_approved',
      notes: 'Verified against manufacturer load chart at maximum radius with anemometer cut-off.',
    },
  ];

  const utilityRequirements: TemporaryUtilityRequirement[] = [
    {
      id: 'util-1-power',
      name: 'Temp Power 1 — 63A 3-Phase Site Distribution Pillar & 110V Transformers',
      serviceType: 'temporary_electrical_supply_3phase',
      isExistingHazardToProtect: false,
      locationOrCorridor: [{ x: welfareBounds.x, y: welfareBounds.y }],
      safetyClearanceBufferM: 1.0,
      capacityDescription: '63A 400V 3-Phase + 10 kVA 110V CTE site distribution',
      connectionConfirmedStatus: 'verified_approved',
      permitOrUtilitySurveyStatus: 'verified_approved',
      activePhaseIds: allPhaseIds,
      provenance: 'user_declared_plan',
      notes: 'Supplies welfare cabin, crane, and 110V task lighting.',
    },
    {
      id: 'util-2-water',
      name: 'Temp Water 1 — Wholesome Potable Water & Wheel-Wash Standpipe',
      serviceType: 'potable_water_supply',
      isExistingHazardToProtect: false,
      locationOrCorridor: [{ x: welfareBounds.x, y: Number((welfareBounds.y + 0.8).toFixed(2)) }],
      safetyClearanceBufferM: 0.5,
      capacityDescription: '25 mm MDPE metered potable connection with RPZ backflow preventer',
      connectionConfirmedStatus: 'verified_approved',
      permitOrUtilitySurveyStatus: 'verified_approved',
      activePhaseIds: allPhaseIds,
      provenance: 'user_declared_plan',
      notes: 'Serves welfare canteen, washrooms, and dust suppression.',
    },
    {
      id: 'util-3-buried-main',
      name: 'Existing Service 1 — Buried Low-Voltage / Telecom Duct Along Frontage',
      serviceType: 'existing_buried_gas_or_power_hazard',
      isExistingHazardToProtect: true,
      locationOrCorridor: [
        { x: 0.2, y: Number((siteL - 0.1).toFixed(2)) },
        { x: Number((siteW - 0.2).toFixed(2)), y: Number((siteL - 0.1).toFixed(2)) },
      ],
      safetyClearanceBufferM: 0.3,
      capacityDescription: 'Existing underground utility corridor along highway boundary',
      connectionConfirmedStatus: 'verified_approved',
      permitOrUtilitySurveyStatus: 'verified_approved',
      activePhaseIds: allPhaseIds,
      provenance: 'project_site_context',
      notes: 'CAT & Genny scanned and protected with heavy-duty road plates at Gate A.',
    },
  ];

  // Emergency access route along unobstructed frontage into Unloading Bay muster zone
  const emergencyRoutes: EmergencyAccessRequirement[] = [
    {
      id: 'emerg-1-fire-evac',
      name: 'Emergency Route 1 — Fire Appliance & Stretcher Egress to Muster Point',
      routeType: 'fire_appliance_access',
      waypoints: [
        { x: vRouteX, y: Number((siteL - 0.2).toFixed(2)) },
        { x: vRouteX, y: Number((unloadBayBounds.y + unloadBayBounds.lengthM * 0.5).toFixed(2)) },
      ],
      minClearWidthM: 3.7,
      minClearHeightM: 4.0,
      mustRemainUnobstructedAllPhases: true,
      activePhaseIds: allPhaseIds,
      notes: 'Maintained clear for emergency appliance access and stretcher evacuation across all phases.',
    },
  ];

  // Deliveries schedule
  const deliveries: DeliveryRequirementRecord[] = [
    {
      id: 'del-1-concrete',
      title: 'Ready-Mix Concrete Foundation Pour (C32/40 Low-Carbon)',
      materialType: 'ready_mix_concrete',
      phaseId: 'phase-2-substructure',
      scheduledDateIso: '2026-07-24',
      arrivalWindowStart: '08:00',
      arrivalWindowEnd: '11:30',
      dwellDurationMinutes: 45,
      vehicleCategory: 'concrete_mixer_9m',
      vehicleCountInWindow: 4,
      grossPayloadTonnes: 76,
      requiredStorageAreaM2: 0,
      targetAccessPointId: 'gate-1-vehicular',
      targetVehicleRouteId: 'vroute-1-main',
      targetUnloadingZoneId: 'zone-1-unloading',
      targetStorageZoneId: null,
      requiresCraneLiftId: 'eq-1-crane',
      oneWayTransportDistanceKm: 18,
      transportEmissionFactorKgCO2ePerTonneKm: 0.105,
      justInTimeDelivery: true,
      holdingAreaFallbackConfirmed: true,
      notes: 'Direct discharge from agitator trucks at Unloading Bay 1.',
    },
    {
      id: 'del-2-frame',
      title: 'Primary Structural Frame & Engineered Timber/Steel Packs',
      materialType: 'structural_steel_or_timber_frame',
      phaseId: 'phase-3-superstructure',
      scheduledDateIso: '2026-09-22',
      arrivalWindowStart: '09:00',
      arrivalWindowEnd: '11:00',
      dwellDurationMinutes: 60,
      vehicleCategory: 'rigid_flatbed_10m',
      vehicleCountInWindow: 2,
      grossPayloadTonnes: 24,
      requiredStorageAreaM2: 5.0,
      targetAccessPointId: 'gate-1-vehicular',
      targetVehicleRouteId: 'vroute-1-main',
      targetUnloadingZoneId: 'zone-1-unloading',
      targetStorageZoneId: 'zone-2-laydown',
      requiresCraneLiftId: 'eq-1-crane',
      oneWayTransportDistanceKm: 65,
      transportEmissionFactorKgCO2ePerTonneKm: 0.089,
      justInTimeDelivery: true,
      holdingAreaFallbackConfirmed: true,
      notes: 'Unloaded via Crane 1 to Zone 2 laydown stillage.',
    },
    {
      id: 'del-3-glazing',
      title: 'High-Performance Triple-Glazed Curtain Wall & Window Stillages',
      materialType: 'curtain_wall_and_glazing_packs',
      phaseId: 'phase-4-envelope-fitout',
      scheduledDateIso: '2027-01-12',
      arrivalWindowStart: '09:30',
      arrivalWindowEnd: '11:30',
      dwellDurationMinutes: 50,
      vehicleCategory: 'rigid_flatbed_10m',
      vehicleCountInWindow: 1,
      grossPayloadTonnes: 8.5,
      requiredStorageAreaM2: 4.5,
      targetAccessPointId: 'gate-1-vehicular',
      targetVehicleRouteId: 'vroute-1-main',
      targetUnloadingZoneId: 'zone-1-unloading',
      targetStorageZoneId: 'zone-2-laydown',
      requiresCraneLiftId: 'eq-1-crane',
      oneWayTransportDistanceKm: 110,
      transportEmissionFactorKgCO2ePerTonneKm: 0.089,
      justInTimeDelivery: true,
      holdingAreaFallbackConfirmed: true,
      notes: 'Fragile vertical glazing stillage linked to P46 Envelope Assemblies.',
    },
  ];

  return evaluateSiteLogisticsPlan(project, {
    id: `logistics-plan-${project.id}`,
    profileId: SITE_LOGISTICS_PROFILE_ID,
    name: `${project.name} — Construction Site Logistics Plan`,
    projectId: project.id,
    projectUnit: project.unit,
    internalCalculationUnit: 'metres',
    siteWidthM: siteW,
    siteLengthM: siteL,
    buildingBoundsM: bBounds,
    activePhaseId: phases[2].id, // Default to Phase 3 Superstructure for comprehensive view
    phases,
    accessPoints,
    vehicleRoutes,
    pedestrianRoutes,
    logisticsZones,
    equipmentPlacements,
    liftingOperations,
    temporaryFacilities,
    utilityRequirements,
    emergencyRoutes,
    siteRestrictions,
    deliveries,
  });
}

// ---------------------------------------------------------------------------
// NON-DESTRUCTIVE ALTERNATIVE PREVIEW & COMPARISON
// ---------------------------------------------------------------------------

export function buildSiteLogisticsAlternativePreview(
  project: Project,
  baselinePlan: SiteLogisticsPlan,
  modifications: LogisticsAlternativeModification
): LogisticsAlternativePreview {
  const clonedZones = baselinePlan.logisticsZones.map((z) => {
    const mod = modifications.relocateZoneOffsetsM?.[z.id];
    if (!mod) return { ...z, bounds: { ...z.bounds } };
    const newW = mod.widthM !== undefined ? mod.widthM : z.bounds.widthM;
    const newL = mod.lengthM !== undefined ? mod.lengthM : z.bounds.lengthM;
    return {
      ...z,
      bounds: {
        x: Number((z.bounds.x + mod.dxM).toFixed(2)),
        y: Number((z.bounds.y + mod.dyM).toFixed(2)),
        widthM: newW,
        lengthM: newL,
      },
      usableCapacityM2: Number((newW * newL).toFixed(1)),
    };
  });

  const clonedEq = baselinePlan.equipmentPlacements.map((e) => {
    const mod = modifications.relocateEquipmentOffsetsM?.[e.id];
    if (!mod) return { ...e, baseBounds: { ...e.baseBounds } };
    return {
      ...e,
      baseBounds: {
        ...e.baseBounds,
        x: Number((e.baseBounds.x + mod.dxM).toFixed(2)),
        y: Number((e.baseBounds.y + mod.dyM).toFixed(2)),
      },
      operatingRadiusM: mod.operatingRadiusM !== undefined ? mod.operatingRadiusM : e.operatingRadiusM,
    };
  });

  const clonedRoutes = baselinePlan.vehicleRoutes.map((r) => {
    const newW = modifications.overrideRouteWidthsM?.[r.id];
    return {
      ...r,
      corridorWidthM: newW !== undefined ? newW : r.corridorWidthM,
      wheelWashProvidedAtExit: modifications.provideWheelWashAtExits ? true : r.wheelWashProvidedAtExit,
    };
  });

  const clonedPedRoutes = baselinePlan.pedestrianRoutes.map((pr) => ({
    ...pr,
    barrierType: modifications.upgradePedestrianBarriersToPhysical
      ? ('physical_jersey_or_water_filled_barrier' as const)
      : pr.barrierType,
  }));

  const clonedDeliveries = baselinePlan.deliveries.map((d) => {
    const mod = modifications.rescheduleDeliveryWindows?.[d.id];
    if (!mod) return { ...d };
    return {
      ...d,
      scheduledDateIso: mod.scheduledDateIso ?? d.scheduledDateIso,
      arrivalWindowStart: mod.arrivalWindowStart ?? d.arrivalWindowStart,
      arrivalWindowEnd: mod.arrivalWindowEnd ?? d.arrivalWindowEnd,
    };
  });

  const candidatePlan = evaluateSiteLogisticsPlan(project, {
    ...baselinePlan,
    id: `${baselinePlan.id}-alt-${Date.now()}`,
    name: modifications.name || `${baselinePlan.name} (Alternative Layout)`,
    logisticsZones: clonedZones,
    equipmentPlacements: clonedEq,
    vehicleRoutes: clonedRoutes,
    pedestrianRoutes: clonedPedRoutes,
    deliveries: clonedDeliveries,
  });

  const blockerDelta = candidatePlan.summary.blockerCount - baselinePlan.summary.blockerCount;
  const conflictDelta = candidatePlan.summary.conflictCount - baselinePlan.summary.conflictCount;
  const warningDelta = candidatePlan.summary.warningCount - baselinePlan.summary.warningCount;
  const peakExteriorUtilizationDeltaPct = Number(
    (candidatePlan.summary.peakExteriorUtilizationPct - baselinePlan.summary.peakExteriorUtilizationPct).toFixed(1)
  );
  const unverifiedGatesDelta =
    candidatePlan.summary.unverifiedEvidenceGatesCount - baselinePlan.summary.unverifiedEvidenceGatesCount;

  const comparisonSummary: string[] = [
    `Blockers: ${baselinePlan.summary.blockerCount} → ${candidatePlan.summary.blockerCount} (${blockerDelta <= 0 ? blockerDelta : `+${blockerDelta}`})`,
    `Spatial/Schedule Conflicts: ${baselinePlan.summary.conflictCount} → ${candidatePlan.summary.conflictCount} (${conflictDelta <= 0 ? conflictDelta : `+${conflictDelta}`})`,
    `Warnings: ${baselinePlan.summary.warningCount} → ${candidatePlan.summary.warningCount} (${warningDelta <= 0 ? warningDelta : `+${warningDelta}`})`,
    `Peak Exterior Site Utilization: ${baselinePlan.summary.peakExteriorUtilizationPct.toFixed(1)}% → ${candidatePlan.summary.peakExteriorUtilizationPct.toFixed(1)}%`,
  ];

  return {
    id: `alt-preview-${Date.now()}`,
    title: modifications.name || 'Candidate Site Logistics Alternative',
    baselinePlanId: baselinePlan.id,
    candidatePlan,
    deltas: {
      blockerDelta,
      conflictDelta,
      warningDelta,
      peakExteriorUtilizationDeltaPct,
      unverifiedGatesDelta,
    },
    comparisonSummary,
    isNonDestructivePreview: true,
    createdAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// SAFE PERSISTENCE WITH VERSIONING SNAPSHOT
// ---------------------------------------------------------------------------

export function applySiteLogisticsPlanToProject(
  project: Project,
  plan: SiteLogisticsPlan,
  savedAlternatives?: LogisticsAlternativePreview[]
): { updatedProject: Project; snapshotId: string } {
  const snapshot = createProjectSnapshot(project, {
    label: `Pre-Logistics Plan Update (${plan.name})`,
    description: `Automated safety checkpoint before applying P47 Construction Site Logistics Plan (${plan.summary.totalPhases} phases, ${plan.summary.conflictCount} conflicts, ${plan.summary.blockerCount} blockers).`,
    trigger: 'auto-checkpoint',
  });

  const reevaluated = evaluateSiteLogisticsPlan(project, plan);

  const updatedProject: Project = {
    ...project,
    siteLogistics: {
      profileId: SITE_LOGISTICS_PROFILE_ID,
      activePlan: reevaluated,
      savedAlternatives: savedAlternatives ?? project.siteLogistics?.savedAlternatives ?? [],
      lastAppliedSnapshotId: snapshot.id,
      updatedAt: new Date().toISOString(),
    },
    updatedAt: new Date().toISOString(),
  };

  return {
    updatedProject,
    snapshotId: snapshot.id,
  };
}

// ---------------------------------------------------------------------------
// STRUCTURED EXPORT (JSON, CSV, MARKDOWN ENGINEERING REPORT)
// ---------------------------------------------------------------------------

export function exportSiteLogisticsReport(
  project: Project,
  plan: SiteLogisticsPlan,
  format: 'json' | 'csv' | 'markdown'
): string {
  if (format === 'json') {
    return JSON.stringify(
      {
        profileId: SITE_LOGISTICS_PROFILE_ID,
        exportedAt: new Date().toISOString(),
        project: {
          id: project.id,
          name: project.name,
          plotWidth: project.plotWidth,
          plotLength: project.plotLength,
          unit: project.unit,
          roadFacing: project.roadFacing,
          floors: project.floors,
        },
        plan,
      },
      null,
      2
    );
  }

  if (format === 'csv') {
    const lines: string[] = [
      'Section,ID,Name_or_Title,Phase_or_Category,Metric_1,Metric_2,Status_or_Severity,Provenance_or_Gate',
    ];
    for (const p of plan.phases) {
      lines.push(
        `PHASE,${p.id},"${p.name.replace(/"/g, '""')}",${p.stageType},${p.startDateIso} to ${p.endDateIso},${p.workingHoursStart}-${p.workingHoursEnd},Footprint ${(p.activeBuildingFootprintRatio * 100).toFixed(0)}%,user_declared_plan`
      );
    }
    for (const z of plan.logisticsZones) {
      lines.push(
        `ZONE,${z.id},"${z.name.replace(/"/g, '""')}",${z.category},${z.bounds.widthM}x${z.bounds.lengthM}m (${z.usableCapacityM2}m2),Req ${z.groundBearingRequirementKPa ?? 'N/A'} kPa,${z.groundBearingStatus},${z.provenance}`
      );
    }
    for (const eq of plan.equipmentPlacements) {
      lines.push(
        `EQUIPMENT,${eq.id},"${eq.name.replace(/"/g, '""')}",${eq.category},Radius ${eq.operatingRadiusM}m,Req ${eq.requiredGroundBearingKPa ?? 'N/A'} kPa,LiftPlan:${eq.certifiedLiftPlanApprovalStatus}|Ground:${eq.groundBearingApprovalStatus},${eq.provenance}`
      );
    }
    for (const d of plan.deliveries) {
      lines.push(
        `DELIVERY,${d.id},"${d.title.replace(/"/g, '""')}",${d.phaseId},${d.scheduledDateIso} ${d.arrivalWindowStart}-${d.arrivalWindowEnd},${d.grossPayloadTonnes}t (${d.vehicleCategory}),JIT:${d.justInTimeDelivery},${d.targetUnloadingZoneId}`
      );
    }
    for (const c of plan.conflicts) {
      lines.push(
        `CONFLICT,${c.id},"${c.title.replace(/"/g, '""')}",${c.category},"${(c.measuredValue || '').replace(/"/g, '""')}","${(c.requiredThreshold || '').replace(/"/g, '""')}",${c.severity.toUpperCase()},"${c.requiresCompetentProfessionalSignOff.replace(/"/g, '""')}"`
      );
    }
    return lines.join('\n');
  }

  // Markdown Engineering Report
  const lines: string[] = [
    `# Construction Site Logistics & Traffic Management Plan (P47)`,
    ``,
    `- **Project**: ${project.name} (\`${project.id}\`)`,
    `- **Profile ID**: \`${plan.profileId}\``,
    `- **Site Dimensions**: ${plan.siteWidthM.toFixed(2)} m × ${plan.siteLengthM.toFixed(2)} m (${plan.summary.totalSiteAreaM2.toFixed(1)} m² | Project Unit: ${project.unit})`,
    `- **Building Ground Footprint**: ${plan.buildingBoundsM.widthM.toFixed(2)} m × ${plan.buildingBoundsM.lengthM.toFixed(2)} m (${plan.summary.buildingFootprintAreaM2.toFixed(1)} m²)`,
    `- **Remaining Exterior Site Area**: ${plan.summary.remainingExteriorAreaM2.toFixed(1)} m² (Peak Utilization: ${plan.summary.peakExteriorUtilizationPct.toFixed(1)}%)`,
    `- **Overall Readiness Status**: **${plan.summary.overallReadinessStatus.toUpperCase()}**`,
    `- **Safety Blockers / Conflicts / Warnings**: ${plan.summary.blockerCount} Blockers · ${plan.summary.conflictCount} Conflicts · ${plan.summary.warningCount} Warnings`,
    ``,
    `## 1. Construction Phasing & Space Utilization`,
    `| Phase | Dates | Working Hours | Active Bldg Footprint | Allocated Logistics Area | Exterior Utilization | Conflicts / Blockers |`,
    `| :--- | :--- | :--- | :---: | :---: | :---: | :---: |`,
  ];

  for (const ps of plan.phaseSummaries) {
    const ph = plan.phases.find((p) => p.id === ps.phaseId);
    lines.push(
      `| **${ps.phaseName}** | ${ph?.startDateIso} → ${ph?.endDateIso} | ${ph?.workingHoursStart}–${ph?.workingHoursEnd} | ${ps.activeBuildingFootprintM2.toFixed(1)} m² | ${ps.totalAllocatedLogisticsFootprintM2.toFixed(1)} m² | ${ps.exteriorSiteUtilizationPct.toFixed(1)}% | ${ps.activeConflictCount} / ${ps.activeBlockerCount} |`
    );
  }

  lines.push(
    ``,
    `## 2. Site Access, Vehicle Routes & Pedestrian Segregation`,
    `| Route / Gate | Category / Width | Design Vehicle / Barrier | Path Length (Network vs Direct) | Transit Time | Safety Controls |`,
    `| :--- | :--- | :--- | :---: | :---: | :--- |`
  );

  for (const r of plan.vehicleRoutes) {
    const ra = plan.routeAnalyses.find((a) => a.routeId === r.id);
    const std = VEHICLE_DESIGN_CATALOG[r.designVehicleCategory];
    lines.push(
      `| **${r.name}** | ${r.corridorWidthM.toFixed(2)} m wide | ${std.label} | ${ra ? `${ra.actualNetworkPathLengthM.toFixed(1)} m vs ${ra.straightLineEntryToExitM.toFixed(1)} m` : 'N/A'} | ${ra ? `${ra.estimatedTransitMinutesOneWay.toFixed(1)} min` : 'N/A'} | Banksman: ${r.trainedBanksmanMarshallingConfirmed ? 'Yes' : 'NO'}, Wheel-Wash: ${r.wheelWashProvidedAtExit ? 'Yes' : 'NO'} |`
    );
  }

  for (const pr of plan.pedestrianRoutes) {
    lines.push(
      `| **${pr.name}** | ${pr.clearWidthM.toFixed(2)} m walkway | ${pr.barrierType.replace(/_/g, ' ')} | Covered: ${pr.weatherProtectedCovered ? 'Yes' : 'No'} | Step-Free: ${pr.stepFreeAccessible ? 'Yes' : 'No'} | Crossings: ${pr.controlledCrossingPoints.length} controlled |`
    );
  }

  lines.push(
    ``,
    `## 3. Equipment, Cranes & Lifting Safety Gates`,
    `| Equipment | Operating Radius | Ground Bearing (Req / Verified) | Geotechnical Gate | Lift Plan Gate | Utility Clearance Gate |`,
    `| :--- | :---: | :---: | :---: | :---: | :---: |`
  );

  for (const eq of plan.equipmentPlacements) {
    lines.push(
      `| **${eq.name}** | ${eq.operatingRadiusM.toFixed(1)} m | ${eq.requiredGroundBearingKPa ?? 'N/A'} / ${eq.verifiedGroundBearingKPa ?? 'Unverified'} kPa | \`${eq.groundBearingApprovalStatus}\` | \`${eq.certifiedLiftPlanApprovalStatus}\` | \`${eq.undergroundServiceClearanceStatus}\` |`
    );
  }

  lines.push(
    ``,
    `## 4. Material Deliveries & Module A4 Transport Carbon Alignment`,
    `- **Transport Carbon Status**: \`${plan.transportCarbonSummary.status}\``,
    `- **Scheduled Payload**: ${plan.transportCarbonSummary.totalScheduledPayloadTonnes.toFixed(1)} tonnes across ${plan.transportCarbonSummary.totalScheduledDeliveries} deliveries (${plan.transportCarbonSummary.totalTonneKilometres.toFixed(1)} t·km)`,
    `- **Estimated Module A4 Transport Emissions**: ${plan.transportCarbonSummary.estimatedModuleA4TransportKgCO2e !== null ? `${plan.transportCarbonSummary.estimatedModuleA4TransportKgCO2e.toFixed(2)} kgCO₂e` : 'Not computed (explicit factors required)'}`,
    `- **Note**: ${plan.transportCarbonSummary.transparencyNote}`,
    ``,
    `## 5. Detected Conflicts, Safety Blockers & Remediation Register`,
  );

  if (plan.conflicts.length === 0) {
    lines.push(`- No spatial or schedule conflicts detected in the current configuration.`);
  } else {
    for (const c of plan.conflicts) {
      lines.push(
        `- **[${c.severity.toUpperCase()}] ${c.title}** (${c.category}, Phase: \`${c.phaseId}\`)`,
        `  - *Details*: ${c.description}`,
        `  - *Remediation*: ${c.remediationGuidance}`,
        `  - *Required Sign-Off*: ${c.requiresCompetentProfessionalSignOff}`
      );
    }
  }

  lines.push(
    ``,
    `## 6. Assumptions, Provenance & Engineering Limitations`,
    ...plan.assumptionsAndLimitations.map((a) => `- ${a}`)
  );

  return lines.join('\n');
}
