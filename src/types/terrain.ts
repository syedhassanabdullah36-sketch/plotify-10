/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * P43 — Terrain & Topographic Site Modeling Type Definitions
 */

import { MeasurementUnit } from './project';

export type SupportedTerrainFormat = 'CSV-ELEVATION-POINTS' | 'GEOJSON-TOPOGRAPHY';

export type RecognizedTerrainFormat =
  | 'CSV-ELEVATION-POINTS'
  | 'GEOJSON-TOPOGRAPHY'
  | 'GEOTIFF-DEM-UNSUPPORTED'
  | 'LANDXML-TIN-UNSUPPORTED'
  | 'ESRI-ASCII-GRID-UNSUPPORTED'
  | 'CAD-2D-NO-ELEVATION'
  | 'UNKNOWN-UNSUPPORTED';

export type TerrainLinearUnit = 'METRE' | 'FOOT' | 'MILLIMETRE' | 'UNSPECIFIED';

export type TerrainHorizontalCRS =
  | 'PROJECT_LOCAL'
  | 'PROJECTED_CARTESIAN'
  | 'WGS84_GEOGRAPHIC_LON_LAT'
  | 'UNKNOWN_AMBIGUOUS';

export type TerrainVerticalDatum =
  | 'PROJECT_BENCHMARK_ZERO'
  | 'LOCAL_SURVEY_BENCHMARK'
  | 'ORTHOMETRIC_SEA_LEVEL'
  | 'WGS84_ELLIPSOIDAL_HEIGHT'
  | 'UNSPECIFIED_DATUM';

export interface TerrainSupportProfile {
  profileId: string;
  profileName: string;
  profileVersion: string;
  supportedFormats: Array<{
    format: SupportedTerrainFormat;
    extensions: string[];
    geometryTypes: string[];
    description: string;
  }>;
  recognizedButUnsupportedFormats: Array<{
    format: RecognizedTerrainFormat;
    detectionMethod: string;
    guidance: string;
  }>;
  supportedUnits: Exclude<TerrainLinearUnit, 'UNSPECIFIED'>[];
  supportedHorizontalCRS: Exclude<TerrainHorizontalCRS, 'UNKNOWN_AMBIGUOUS'>[];
  supportedVerticalDatums: Exclude<TerrainVerticalDatum, 'UNSPECIFIED_DATUM'>[];
  surfaceMethod: {
    algorithm: 'Bowyer-Watson 2D Delaunay Triangulated Irregular Network (TIN) with Max-Edge Gap Filter';
    minimumNonCollinearPoints: number;
    maxPointsLimit: number;
    maxFileSizeBytes: number;
    gapHandling: string;
  };
  claimLimitations: string[];
}

export interface CSVColumnMapping {
  idColumn?: string;
  xColumn: string;
  yColumn: string;
  zColumn: string;
  classificationColumn?: string;
  hasHeaderRow: boolean;
  delimiter: ',' | ';' | '\t';
}

export interface TerrainImportRequest {
  fileName: string;
  fileSizeBytes: number;
  rawContent: string;
  formatHint?: SupportedTerrainFormat;
  csvMapping?: Partial<CSVColumnMapping>;
  maxFileSizeBytes?: number;
  maxPointsLimit?: number;
}

export interface TerrainSourcePoint {
  id: string;
  rowIndexOrFeatureIndex: number;
  rawX: number;
  rawY: number;
  rawZ: number;
  classification: string;
  sourceType: 'csv-point' | 'geojson-point' | 'geojson-contour-vertex';
}

export interface TerrainSourceContourLine {
  id: string;
  elevation: number;
  label?: string;
  vertices: Array<{ rawX: number; rawY: number; rawZ: number }>;
}

export interface TerrainBoundingBox3D {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  width: number;
  length: number;
  relief: number;
}

export interface TerrainImportWarning {
  id: string;
  code:
    | 'AMBIGUOUS_UNITS_OR_CRS'
    | 'AMBIGUOUS_VERTICAL_DATUM'
    | 'WGS84_GEOGRAPHIC_REQUIRES_TANGENT_ORIGIN'
    | 'WGS84_ELLIPSOIDAL_HEIGHT_NOTICE'
    | 'DUPLICATE_XY_COORDINATES'
    | 'ABRUPT_ELEVATION_OUTLIER'
    | 'SPARSE_OR_PARTIAL_SITE_COVERAGE'
    | 'INSUFFICIENT_POINTS_FOR_SURFACE'
    | 'COLLINEAR_OR_DEGENERATE_POINTS'
    | 'UNSUPPORTED_FEATURE_SKIPPED'
    | 'MISSING_ELEVATION_RECORD_SKIPPED'
    | 'LARGE_COORDINATE_OFFSET_DETECTED'
    | 'SURFACE_GAPS_PRESENT';
  severity: 'warning' | 'info';
  message: string;
  affectedIds?: string[];
  remedy?: string;
}

export interface TerrainImportError {
  id: string;
  code:
    | 'FILE_EMPTY'
    | 'FILE_TOO_LARGE'
    | 'POINT_LIMIT_EXCEEDED'
    | 'UNSUPPORTED_FORMAT_GEOTIFF'
    | 'UNSUPPORTED_FORMAT_LANDXML'
    | 'UNSUPPORTED_FORMAT_ESRI_GRID'
    | 'CAD_2D_HAS_NO_ELEVATIONS'
    | 'MALFORMED_INPUT_FILE'
    | 'MISSING_REQUIRED_COLUMNS'
    | 'NO_VALID_ELEVATION_POINTS'
    | 'CONFIRMATION_REQUIRED_FOR_UNITS_OR_CRS'
    | 'CONFIRMATION_REQUIRED_FOR_DATUM'
    | 'INVALID_CALIBRATION_PARAMETERS';
  message: string;
  fatal: boolean;
}

export interface TerrainDatasetModel {
  formatVersion: 'plotify-terrain-dataset-v1';
  isValid: boolean;
  fileName: string;
  fileSizeBytes: number;
  fileChecksum: string;
  detectedFormat: RecognizedTerrainFormat;
  detectedCsvHeaders: string[];
  appliedCsvMapping?: CSVColumnMapping;
  detectedHorizontalCRS: TerrainHorizontalCRS;
  detectedHorizontalUnit: TerrainLinearUnit;
  detectedVerticalUnit: TerrainLinearUnit;
  detectedVerticalDatum: TerrainVerticalDatum;
  requiresUserConfirmation: boolean;
  sourcePoints: TerrainSourcePoint[];
  sourceContours: TerrainSourceContourLine[];
  skippedRecordCount: number;
  unsupportedFeatureCounts: Record<string, number>;
  duplicatePointIds: string[];
  outlierPointIds: string[];
  rawExtents: TerrainBoundingBox3D | null;
  warnings: TerrainImportWarning[];
  errors: TerrainImportError[];
  parsedAt: string;
}

export interface TerrainAlignmentAndCalibration {
  horizontalCRS: Exclude<TerrainHorizontalCRS, 'UNKNOWN_AMBIGUOUS'>;
  horizontalUnit: Exclude<TerrainLinearUnit, 'UNSPECIFIED'>;
  verticalUnit: Exclude<TerrainLinearUnit, 'UNSPECIFIED'>;
  verticalDatum: Exclude<TerrainVerticalDatum, 'UNSPECIFIED_DATUM'>;
  userConfirmedUnitsAndCRS: boolean;
  userConfirmedVerticalDatum: boolean;
  /** Mode for mapping horizontal source coordinates into Plotify local plot coordinates (0..plotWidth, 0..plotLength) */
  alignmentMode: 'preserve-local' | 'align-min-extents-to-plot-origin' | 'manual-origin-offset';
  manualOriginSourceX: number;
  manualOriginSourceY: number;
  /** For WGS84_GEOGRAPHIC_LON_LAT, explicit reference longitude & latitude mapped to plot (0,0) */
  wgs84ReferenceLon?: number;
  wgs84ReferenceLat?: number;
  /** Optional vertical offset added after converting Z to target project unit */
  verticalOffsetInTargetUnit: number;
  /** Maximum allowed triangle edge length in target project units to prevent bridging across large data gaps */
  maxTriangleEdgeLength: number;
  /** Contour interval in target project units for derived contour generation */
  contourInterval: number;
  /** Point IDs explicitly excluded by user after inspecting anomalies */
  excludedPointIds: string[];
}

export interface CalibratedTerrainPoint {
  id: string;
  sourceId: string;
  x: number; // in project.unit ('metres' | 'feet') relative to plot origin (0,0)
  y: number; // in project.unit relative to plot origin (0,0)
  z: number; // elevation in project.unit
  rawX: number;
  rawY: number;
  rawZ: number;
  classification: string;
  isInsidePlot: boolean;
  isExcluded: boolean;
}

export interface TerrainTINTriangle {
  id: string;
  v0Index: number;
  v1Index: number;
  v2Index: number;
  centroidX: number;
  centroidY: number;
  centroidZ: number;
  area2D: number;
  slopePercent: number;
  slopeDegrees: number;
  aspectDegrees: number; // 0 = North, 90 = East, 180 = South, 270 = West (downslope direction)
}

export interface DerivedContourSegment {
  elevation: number;
  isMajor: boolean;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface TerrainSurfaceMesh {
  method: 'bowyer-watson-delaunay-tin-v1';
  generatedAt: string;
  unit: MeasurementUnit;
  vertices: CalibratedTerrainPoint[];
  triangles: TerrainTINTriangle[];
  derivedContours: DerivedContourSegment[];
  hullBoundary: Array<{ x: number; y: number }>;
  bounds: TerrainBoundingBox3D;
  plotCoverageRatio: number; // 0..1 fraction of plot area covered by valid TIN triangles
  hasGapsWithinPlot: boolean;
}

export interface TerrainSectionProfileSample {
  distanceAlongSection: number;
  x: number;
  y: number;
  elevation: number | null; // null if outside TIN coverage or in a data gap
  isGap: boolean;
}

export interface TerrainSectionProfile {
  label: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  totalLength: number;
  unit: MeasurementUnit;
  samples: TerrainSectionProfileSample[];
  minElevation: number | null;
  maxElevation: number | null;
  gapCount: number;
}

export interface TerrainAnalysisSummary {
  unit: MeasurementUnit;
  validPointCount: number;
  excludedPointCount: number;
  pointsInsidePlotCount: number;
  surfaceGenerated: boolean;
  surfaceBlockedReason?: string;
  minElevation: number;
  maxElevation: number;
  meanElevation: number;
  elevationRelief: number;
  meanSlopePercent: number;
  meanSlopeDegrees: number;
  maxSlopePercent: number;
  maxSlopeDegrees: number;
  dominantAspectDegrees: number | null;
  dominantAspectCardinal: 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW' | 'Flat' | 'Unassessed';
  plotCoveragePercent: number;
  buildingFootprintRelief: {
    hasGroundFloorRooms: boolean;
    totalCornersChecked: number;
    coveredCornersCount: number;
    uncoveredCornersCount: number;
    minGroundElevationUnderBuilding: number | null;
    maxGroundElevationUnderBuilding: number | null;
    footprintLevelDifference: number | null;
  };
  primarySectionWestEast: TerrainSectionProfile;
  primarySectionNorthSouth: TerrainSectionProfile;
  methodologyAndLimitations: string[];
}

export interface TerrainModelingResult {
  success: boolean;
  targetUnit: MeasurementUnit;
  calibratedPoints: CalibratedTerrainPoint[];
  calibratedContours: Array<{
    id: string;
    elevation: number;
    vertices: Array<{ x: number; y: number; z: number }>;
  }>;
  surfaceMesh: TerrainSurfaceMesh | null;
  analysis: TerrainAnalysisSummary;
  appliedTransformSummary: {
    horizontalScaleFactor: number;
    verticalScaleFactor: number;
    originOffsetX: number;
    originOffsetY: number;
    verticalOffset: number;
    crsTransformationUsed: string;
  };
  warnings: TerrainImportWarning[];
  errors: TerrainImportError[];
}

export interface ProjectTerrainModelingMetadata {
  version: 'plotify-terrain-meta-v1';
  datasetId: string;
  appliedAt: string;
  sourceFileName: string;
  sourceFormat: SupportedTerrainFormat;
  sourceChecksum: string;
  sourcePointCount: number;
  sourceContourCount: number;
  calibration: TerrainAlignmentAndCalibration;
  appliedTransformSummary: TerrainModelingResult['appliedTransformSummary'];
  /** Stored compactly up to 2,500 points for deterministic re-evaluation and 3D rendering */
  calibratedPoints: CalibratedTerrainPoint[];
  surfaceMesh: TerrainSurfaceMesh | null;
  analysis: TerrainAnalysisSummary;
  warnings: TerrainImportWarning[];
  displaySettings: {
    showSurfaceIn3D: boolean;
    showContoursIn2D: boolean;
    showElevationPoints: boolean;
    verticalExaggerationDisplayOnly: number; // default 1.0; if != 1.0, explicitly disclosed in UI
  };
}
