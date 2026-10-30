/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type MEPSystemType = 'mechanical' | 'electrical' | 'plumbing';

export type MEPComponentSubtype =
  // Mechanical
  | 'hvac-air-handler'
  | 'hvac-heat-pump'
  | 'hvac-rooftop-unit'
  | 'hvac-exhaust-fan'
  | 'supply-air-duct'
  | 'return-air-duct'
  | 'exhaust-air-duct'
  // Electrical
  | 'main-distribution-panel'
  | 'sub-panel'
  | 'cable-tray'
  | 'conduit-run'
  | 'transformer'
  | 'lighting-trunk'
  // Plumbing
  | 'domestic-cold-water'
  | 'domestic-hot-water'
  | 'sanitary-soil-pipe'
  | 'vent-stack'
  | 'water-heater'
  | 'water-meter';

export interface MEPRoutePoint {
  x: number; // in project units (feet or metres) from plot origin
  y: number;
  z: number; // elevation from floor slab (e.g. 8.5 ft)
}

export interface MEPRouteSegment {
  id: string;
  startX: number;
  startY: number;
  startZ: number;
  endX: number;
  endY: number;
  endZ: number;
  width?: number; // for rectangular ducts/trays
  height?: number;
  diameter?: number; // for circular pipes/ducts
}

export interface MEPComponent {
  id: string;
  name: string; // e.g. "Primary Supply Air Duct Main"
  system: MEPSystemType;
  subtype: MEPComponentSubtype;
  floorLevel: number;
  // Position for localized equipment (units in plot coordinates)
  location?: {
    x: number;
    y: number;
    z: number; // elevation above floor level
    width: number;
    length: number;
    height: number;
  };
  // Route segments for linear distribution systems (ducts, trays, pipes)
  segments?: MEPRouteSegment[];
  routeSegments?: MEPRouteSegment[];
  dimensions?: { width: number; length: number; height: number };
  clearanceRequirement: number; // required clearance envelope (e.g. 0.5 ft or 0.15 m for maintenance / insulation)
  clearanceRequired?: { horizontal: number; vertical: number };
  serviceZone?: string; // e.g. "Main Floor Living", "Kitchen Service Riser"
  source: 'architectural-baseline' | 'user-defined' | 'subcontractor-submittal';
  status: 'active' | 'proposed' | 'existing';
  notes?: string;
  material?: string;
  updatedAt?: string;
}

export type ClashSeverity =
  | 'hard-clash' // Direct physical solid-solid intersection
  | 'clearance-violation' // Element encroaches on mandatory maintenance / buffer zone
  | 'potential-conflict' // Tight proximity < threshold or non-standard routing
  | 'unassessed'; // Missing geometric data or elevation undefined

export type ClashCategory =
  | 'mep-to-structure' // Clash with structural column or beam
  | 'mep-to-mep' // Two MEP runs intersecting (e.g. duct vs soil pipe)
  | 'mep-to-wall' // Route penetrating wall without sleeve or clearance
  | 'mep-to-opening' // Route clashing with door or window head height
  | 'clearance-zone' // Electrical panel working space violation
  | 'envelope-overflow'; // Route extends outside declared building boundary

export type ClashStatus =
  | 'open'
  | 'under-review'
  | 'resolved'
  | 'variance-accepted';

export interface MEPClashRecord {
  id: string;
  clashCode: string; // e.g. "CLASH-MEP-001"
  title: string;
  description: string;
  severity: ClashSeverity;
  category: ClashCategory;
  primaryComponentId: string;
  primaryComponentName: string;
  primarySystem: MEPSystemType;
  intersectingElementId: string;
  intersectingElementName: string;
  intersectingElementType: 'mep' | 'column' | 'beam' | 'wall' | 'opening' | 'boundary';
  location: {
    floorLevel: number;
    x: number;
    y: number;
    z: number;
    roomName?: string;
  };
  measuredOverlap: string; // e.g. "0.8 ft intersection depth"
  clearanceThreshold: string; // e.g. "0.5 ft required buffer"
  evidenceFormula: string; // Mathematical proof
  recommendation: string;
  status: ClashStatus;
  reviewerNotes?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  varianceJustification?: string;
}

export interface MEPCoordinationSummary {
  totalComponents: number;
  componentsBySystem: {
    mechanical: number;
    electrical: number;
    plumbing: number;
  };
  totalClashes: number;
  clashCounts: {
    hardClash: number;
    clearanceViolation: number;
    potentialConflict: number;
    resolved: number;
  };
  hasCriticalHardClashes: boolean;
  requiresEngineeringReview: boolean;
  lastEvaluatedAt: string;
  dataVersion: string;
}

export interface MEPCoordinationData {
  version: string;
  components: MEPComponent[];
  clashes: MEPClashRecord[];
  summary?: MEPCoordinationSummary;
  assumptions: {
    minimumHeadHeightClearance: number; // e.g. 7.0 ft or 2.1 m (below which horizontal runs cannot hang in doorways)
    electricalPanelWorkingClearance: number; // e.g. 3.0 ft or 0.9 m front working clearance
    defaultDuctClearance: number; // e.g. 0.3 ft or 0.1 m
    defaultPipeClearance: number; // e.g. 0.2 ft or 0.05 m
  };
  lastEvaluatedGeometryHash: string;
  lastEvaluatedAt: string;
  isStale: boolean;
  notes: string;
}
