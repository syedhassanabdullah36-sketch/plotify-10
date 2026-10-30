/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MeasurementUnit, FloorPlanRoom } from './project';
import { StructuralColumn, StructuralBeam, StructuralGridAxis } from './structural';

export type SupportedCADFormat = 'DXF-ASCII';

export type RecognizedCADFormat =
  | 'DXF-ASCII'
  | 'DXF-BINARY-UNSUPPORTED'
  | 'DWG-BINARY-UNSUPPORTED'
  | 'IFC-STEP-USE-P41'
  | 'UNKNOWN-UNSUPPORTED';

export type CADLengthUnit =
  | 'UNITLESS'
  | 'MILLIMETRE'
  | 'CENTIMETRE'
  | 'METRE'
  | 'INCH'
  | 'FOOT';

export type SupportedDXFEntityType =
  | 'LINE'
  | 'LWPOLYLINE'
  | 'POLYLINE'
  | 'CIRCLE'
  | 'ARC'
  | 'TEXT'
  | 'MTEXT'
  | 'INSERT';

export type CADLayerTargetRole =
  | 'plot-boundary'
  | 'room-space'
  | 'structural-column'
  | 'structural-beam'
  | 'structural-grid'
  | 'reference-only'
  | 'ignore';

export interface CADSupportProfile {
  profileId: string;
  profileName: string;
  profileVersion: string;
  fullySupportedFormats: Array<{
    format: string;
    versions: string[];
    description: string;
  }>;
  partiallySupportedFeatures: Array<{
    feature: string;
    behavior: string;
  }>;
  recognizedButUnsupportedFormats: Array<{
    format: string;
    detectionMethod: string;
    guidance: string;
  }>;
  supportedEntityTypes: SupportedDXFEntityType[];
  unsupportedEntityTypes: string[];
  supportedUnits: CADLengthUnit[];
  unitConversionTable: Array<{
    unit: CADLengthUnit;
    insunitsCode: number;
    toMetresFactor: number;
    toFeetFactor: number;
  }>;
  maxFileSizeBytes: number;
  maxEntityCount: number;
  maxBlockNestingDepth: number;
  knownLimitations: string[];
}

export interface CADImportRequest {
  fileName: string;
  fileSizeBytes: number;
  rawContent: string;
  maxFileSizeBytes?: number;
  maxEntityCount?: number;
  signal?: AbortSignal;
  requestId?: string;
}

export interface CADBoundingBox2D {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  length: number;
}

export interface CADLayerSummary {
  name: string;
  colorIndex: number;
  isFrozen: boolean;
  isOff: boolean;
  entityCount: number;
  entityBreakdown: Record<string, number>;
  bounds: CADBoundingBox2D | null;
  suggestedRole: CADLayerTargetRole;
}

export interface CADPoint2D {
  x: number;
  y: number;
  bulge?: number;
}

export interface CADExtractedEntity {
  id: string;
  handle: string;
  dxfType: SupportedDXFEntityType;
  layer: string;
  floorLevelHint?: number;
  /** True if LWPOLYLINE/POLYLINE has closed flag (70 & 1) or start===end */
  isClosed: boolean;
  /** True if closed 4-corner orthogonal rectangle suitable for room/column/plot mapping */
  isRectilinear: boolean;
  /** True if edges self-intersect */
  isSelfIntersecting: boolean;
  /** True if LWPOLYLINE has non-zero bulge arcs */
  hasCurvedBulge: boolean;
  vertices: CADPoint2D[];
  center?: CADPoint2D;
  radius?: number;
  startAngleDeg?: number;
  endAngleDeg?: number;
  textContent?: string;
  textHeight?: number;
  rotationDeg?: number;
  blockName?: string;
  bounds: CADBoundingBox2D;
  areaInSourceUnits: number;
  sourceBlockHandle?: string;
}

export interface CADImportWarning {
  id: string;
  code:
    | 'AMBIGUOUS_OR_MISSING_UNITS'
    | 'UNSUPPORTED_ENTITY_SKIPPED'
    | 'OPEN_POLYLINE_NOT_ROOM'
    | 'NON_RECTILINEAR_POLYLINE'
    | 'SELF_INTERSECTING_POLYGON'
    | 'CURVED_BULGE_SEGMENT'
    | 'DEGENERATE_GEOMETRY'
    | 'OVERLAPPING_MAPPED_ROOMS'
    | 'SCALE_MISMATCH_SUSPECTED'
    | 'BLOCK_PARTIAL_OR_UNRESOLVED'
    | 'DUPLICATE_ENTITY_HANDLE'
    | 'COORDINATE_OFFSET_NORMALIZED';
  severity: 'warning' | 'info';
  message: string;
  layer?: string;
  entityHandle?: string;
  dxfType?: string;
  remedy?: string;
}

export interface CADImportError {
  id: string;
  code:
    | 'FILE_EMPTY'
    | 'FILE_TOO_LARGE'
    | 'ENTITY_LIMIT_EXCEEDED'
    | 'DWG_CONVERSION_REQUIRED'
    | 'BINARY_DXF_UNSUPPORTED'
    | 'IFC_FILE_USE_OPENBIM_WORKSPACE'
    | 'NOT_A_DXF_FILE'
    | 'MALFORMED_DXF_PAIR'
    | 'TRUNCATED_DXF_EOF'
    | 'UNIT_CONFIRMATION_REQUIRED'
    | 'INVALID_CALIBRATION_SCALE'
    | 'IMPORT_CANCELLED'
    | 'DUPLICATE_IMPORT_IN_PROGRESS'
    | 'NO_SUPPORTED_ENTITIES';
  message: string;
  lineOrSection?: number | string;
  fatal: boolean;
}

export interface CADDrawingMetadata {
  fileName: string;
  fileSizeBytes: number;
  fileChecksum: string;
  detectedFormat: RecognizedCADFormat;
  acadVersionCode: string;
  acadVersionLabel: string;
  insunitsCode: number | null;
  detectedUnit: CADLengthUnit;
  hasExplicitUnits: boolean;
  headerExtents: CADBoundingBox2D | null;
  computedExtents: CADBoundingBox2D | null;
  parsedAt: string;
}

export interface CADDrawingModel {
  formatVersion: 'plotify-cad-ir-v1';
  isValid: boolean;
  metadata: CADDrawingMetadata;
  layers: CADLayerSummary[];
  entities: CADExtractedEntity[];
  unsupportedEntityCounts: Record<string, number>;
  totalRawEntitiesEncountered: number;
  warnings: CADImportWarning[];
  errors: CADImportError[];
}

export interface CADLayerMappingRule {
  layerName: string;
  visible: boolean;
  selectedForImport: boolean;
  targetRole: CADLayerTargetRole;
  targetFloorLevel: number;
  defaultRoomType?: string;
}

export interface CADCalibrationOptions {
  /** Required when drawing is UNITLESS or when user overrides the header unit */
  effectiveSourceUnit: Exclude<CADLengthUnit, 'UNITLESS'>;
  /** Optional user-confirmed explicit unit when header was UNITLESS */
  userConfirmedUnitWhenUnitless: boolean;
  /** Additional scale multiplier (default 1.0) */
  scaleMultiplier: number;
  targetPlotifyUnit: MeasurementUnit;
  /** Optional entity handles the user unchecked/omitted in preview */
  omittedEntityHandles?: string[];
  /** Normalize negative or distant world CAD coordinates to plot origin */
  normalizeOriginToZero?: boolean;
}

export interface CADCandidateRoomMapping {
  entityId: string;
  handle: string;
  layer: string;
  floorLevel: number;
  inferredName: string;
  inferredRoomType: string;
  sourceBounds: CADBoundingBox2D;
  mappedRoom: FloorPlanRoom;
  isEligible: boolean;
  eligibilityReason: string;
  isOmittedByUser: boolean;
}

export interface CADProvenanceMappingEntry {
  sourceHandle: string;
  sourceLayer: string;
  sourceDxfType: SupportedDXFEntityType;
  sourceBounds: CADBoundingBox2D;
  plotifyEntityId: string;
  plotifyEntityType: 'plot-boundary' | 'room' | 'column' | 'beam' | 'grid-axis' | 'reference-only';
  floorLevel: number;
}

export interface CADImportReport {
  reportId: string;
  generatedAt: string;
  fileName: string;
  acadVersionLabel: string;
  detectedHeaderUnit: CADLengthUnit;
  effectiveSourceUnit: Exclude<CADLengthUnit, 'UNITLESS'>;
  targetUnit: MeasurementUnit;
  appliedUnitScaleFactor: number;
  appliedCalibrationMultiplier: number;
  coordinateOffsetApplied: {
    offsetX: number;
    offsetY: number;
    unit: MeasurementUnit;
    wasShifted: boolean;
  };
  totalRawEntities: number;
  supportedEntitiesCount: number;
  unsupportedEntitiesCount: number;
  unsupportedEntityBreakdown: Record<string, number>;
  mappedRoomsCount: number;
  mappedColumnsCount: number;
  mappedBeamsCount: number;
  mappedGridAxesCount: number;
  referenceOnlyEntitiesCount: number;
  rejectedRoomCandidatesCount: number;
  warnings: CADImportWarning[];
  errors: CADImportError[];
}

export interface ProjectCADInteropMetadata {
  version: 'plotify-cad-meta-v1';
  lastImportedAt?: string;
  lastExportedAt?: string;
  sourceMetadata?: CADDrawingMetadata;
  calibrationUsed?: {
    effectiveSourceUnit: Exclude<CADLengthUnit, 'UNITLESS'>;
    scaleMultiplier: number;
    targetUnit: MeasurementUnit;
    offsetX: number;
    offsetY: number;
  };
  provenanceMappings: CADProvenanceMappingEntry[];
  referenceEntities: Array<{
    handle: string;
    dxfType: SupportedDXFEntityType;
    layer: string;
    floorLevel: number;
    boundsInTargetUnits: CADBoundingBox2D;
    textContent?: string;
  }>;
  unsupportedEntitySummary: Record<string, number>;
  lastImportReport?: CADImportReport;
  lastExportReport?: CADExportReport;
}

export interface CADMappingResult {
  success: boolean;
  targetUnit: MeasurementUnit;
  mappedProjectSpec: {
    name: string;
    plotWidth: number;
    plotLength: number;
    floors: number;
    notes: string;
  };
  candidateRooms: CADCandidateRoomMapping[];
  mappedRooms: FloorPlanRoom[];
  mappedColumns: StructuralColumn[];
  mappedBeams: StructuralBeam[];
  mappedGridAxes: StructuralGridAxis[];
  provenanceMappings: CADProvenanceMappingEntry[];
  interopMetadata: ProjectCADInteropMetadata;
  report: CADImportReport;
}

export interface CADExportOptions {
  exportUnit: 'PROJECT_UNIT' | 'MILLIMETRE' | 'METRE' | 'FOOT';
  floorFilter: 'all' | number;
  includePlotBoundary: boolean;
  includeSiteSetbacks: boolean;
  includeRoomPolylines: boolean;
  includeRoomLabels: boolean;
  includeStructuralGrid: boolean;
  includeStructuralColumnsAndBeams: boolean;
}

export interface CADValidationCheckResult {
  isValid: boolean;
  evenLinePairingValid: boolean;
  hasHeaderSection: boolean;
  hasTablesSection: boolean;
  hasEntitiesSection: boolean;
  hasEofMarker: boolean;
  insunitsDetected: number | null;
  totalEntitiesCount: number;
  duplicateHandles: string[];
  undefinedLayersReferenced: string[];
  invalidNumericCoordinatesCount: number;
  errors: string[];
  warnings: string[];
}

export interface CADExportReport {
  reportId: string;
  exportedAt: string;
  fileName: string;
  fileSizeBytes: number;
  checksum: string;
  dxfVersion: string;
  unitExported: CADLengthUnit;
  totalEntitiesWritten: number;
  layersWritten: string[];
  exportedCounts: {
    plotBoundaries: number;
    setbackEnvelopes: number;
    roomPolylines: number;
    textAnnotations: number;
    gridLines: number;
    columns: number;
    beams: number;
  };
  omittedPlotifyInformation: Array<{
    domain: string;
    reason: string;
  }>;
  validationResult: CADValidationCheckResult;
}

export interface CADRoundTripComparison {
  passed: boolean;
  comparedAt: string;
  unitMatch: boolean;
  plotDimensionsMatch: boolean;
  roomCountMatch: boolean;
  columnCountMatch: boolean;
  preservedHandlesMatched: number;
  totalRoomsCompared: number;
  maxDimensionDelta: number;
  maxAreaDelta: number;
  toleranceUsed: number;
  roomComparisons: Array<{
    name: string;
    floorLevel: number;
    sourceWidth: number;
    reimportedWidth: number;
    sourceLength: number;
    reimportedLength: number;
    areaDelta: number;
    withinTolerance: boolean;
  }>;
  discrepancies: string[];
  summaryNotes: string[];
}
