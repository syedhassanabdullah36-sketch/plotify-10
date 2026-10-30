/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type StructuralFramingSystem =
  | 'reinforced-concrete-frame'
  | 'mass-timber-post-beam'
  | 'structural-steel-frame'
  | 'light-timber-framing'
  | 'load-bearing-masonry';

export interface StructuralGridAxis {
  id: string;
  name: string; // e.g. '1', '2', '3' or 'A', 'B', 'C'
  direction: 'X' | 'Y'; // 'X' runs vertically at x coordinate, 'Y' runs horizontally at y coordinate
  coordinate: number; // in project units (feet or metres) from plot origin (0,0)
  isPrimary: boolean;
}

export interface StructuralGrid {
  id: string;
  xAxes: StructuralGridAxis[];
  yAxes: StructuralGridAxis[];
  baySpacingX: number; // typical bay width (e.g. 15-20 ft or 4.5-6 m)
  baySpacingY: number; // typical bay length
  offsetX: number; // plot offset
  offsetY: number;
  showGridLines: boolean;
  showBubbles: boolean;
}

export type ColumnProfile = 'rectangular' | 'circular';
export type StructuralMaterial =
  | 'reinforced-concrete'
  | 'structural-steel'
  | 'mass-timber'
  | 'engineered-composite';

export interface StructuralColumn {
  id: string;
  label: string; // e.g. 'C-1A', 'C-2B'
  x: number; // in project units
  y: number;
  floorLevels: number[]; // e.g. [1, 2]
  profile: ColumnProfile;
  width: number; // e.g. 1.0 ft or 0.3 m
  depth: number;
  material: StructuralMaterial;
  isLoadBearing: boolean;
  status: 'active' | 'proposed' | 'existing-retained';
  notes?: string;
}

export interface StructuralBeam {
  id: string;
  label: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  floorLevel: number;
  profileWidth: number;
  profileDepth: number;
  material: StructuralMaterial;
  beamType: 'primary-girder' | 'secondary-joist' | 'perimeter-tie';
}

export type StructuralIssueSeverity =
  | 'conflict' // Direct measurable geometric collision (e.g. column in doorway)
  | 'coordination-concern' // Non-standard spatial condition (e.g. column in room clear zone)
  | 'review-required' // Exceeds prescriptive limits, requires licensed engineer sign-off
  | 'info'; // Informational observation

export type StructuralIssueStatus =
  | 'open'
  | 'under-review'
  | 'resolved'
  | 'variance-accepted';

export interface StructuralReviewIssue {
  id: string;
  issueCode: string; // e.g. 'STR-COL-001', 'STR-SPN-002'
  title: string;
  description: string;
  location: {
    floorLevel: number;
    x: number;
    y: number;
    roomName?: string;
    gridRef?: string;
  };
  severity: StructuralIssueSeverity;
  category:
    | 'column-opening-clash'
    | 'span-exceeded'
    | 'vertical-continuity'
    | 'wall-alignment'
    | 'cantilever-unsupported'
    | 'statutory-engineering';
  affectedElements: string[];
  evidenceFormula: string;
  measuredValue: string;
  thresholdLimit: string;
  status: StructuralIssueStatus;
  recommendation: string;
  reviewerNotes?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  varianceJustification?: string;
}

export interface StructuralCoordinationSummary {
  totalColumns: number;
  totalBeams: number;
  gridAxesCount: number;
  evaluatedSpansCount: number;
  maxMeasuredSpan: number;
  maxSpanRoomName: string;
  issueCounts: {
    total: number;
    conflict: number;
    coordinationConcern: number;
    reviewRequired: number;
    info: number;
    resolved: number;
  };
  hasCriticalConflicts: boolean;
  requiresLicensedReview: boolean;
  lastEvaluatedAt: string;
  dataVersion: string;
}

export interface StructuralCoordinationData {
  version: string;
  framingSystem: StructuralFramingSystem;
  grid: StructuralGrid;
  columns: StructuralColumn[];
  beams: StructuralBeam[];
  reviewIssues: StructuralReviewIssue[];
  maxUnsupportedSpanThreshold: number; // e.g. 20 ft or 6.0 m
  lastEvaluatedGeometryHash: string;
  lastEvaluatedAt: string;
  isStale: boolean;
  notes: string;
  engineeringSignOff?: {
    isSignedOff: boolean;
    engineerName?: string;
    licenseNumber?: string;
    jurisdiction?: string;
    signedAt?: string;
    stampNotes?: string;
  };
}
