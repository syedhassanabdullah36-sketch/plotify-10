/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * P43 — Terrain & Topographic Site Modeling Service
 */

import { Project, MeasurementUnit } from '../types/project';
import {
  SupportedTerrainFormat,
  RecognizedTerrainFormat,
  TerrainLinearUnit,
  TerrainHorizontalCRS,
  TerrainVerticalDatum,
  TerrainSupportProfile,
  CSVColumnMapping,
  TerrainImportRequest,
  TerrainSourcePoint,
  TerrainSourceContourLine,
  TerrainBoundingBox3D,
  TerrainImportWarning,
  TerrainImportError,
  TerrainDatasetModel,
  TerrainAlignmentAndCalibration,
  CalibratedTerrainPoint,
  TerrainTINTriangle,
  DerivedContourSegment,
  TerrainSurfaceMesh,
  TerrainSectionProfile,
  TerrainSectionProfileSample,
  TerrainAnalysisSummary,
  TerrainModelingResult,
  ProjectTerrainModelingMetadata,
} from '../types/terrain';
import { computeStringChecksum, sanitizeText } from '../utils/securityUtils';
import { createProjectSnapshot } from './versioningService';

// ============================================================================
// 1. CONSTANTS & HONEST SUPPORT PROFILE
// ============================================================================

export const DEFAULT_MAX_TERRAIN_BYTES = 5 * 1024 * 1024; // 5 MB
export const DEFAULT_MAX_TERRAIN_POINTS = 10000;
export const MAX_PERSISTED_TERRAIN_POINTS = 2500;

export const PLOTIFY_TERRAIN_SUPPORT_PROFILE: TerrainSupportProfile = {
  profileId: 'plotify-terrain-modeling-p43-v1',
  profileName: 'Plotify Terrain & Topographic Site Modeling Profile (P43)',
  profileVersion: '1.0.0',
  supportedFormats: [
    {
      format: 'CSV-ELEVATION-POINTS',
      extensions: ['.csv', '.txt', '.xyz'],
      geometryTypes: ['3D Survey / Spot Elevation Points (X/Easting, Y/Northing, Z/Elevation)'],
      description:
        'Delimited tabular elevation spot points with user-configurable column mapping, explicit unit/CRS confirmation, duplicate/outlier inspection, and Bowyer-Watson Delaunay TIN surface generation.',
    },
    {
      format: 'GEOJSON-TOPOGRAPHY',
      extensions: ['.geojson', '.json'],
      geometryTypes: ['Point', 'MultiPoint', 'LineString (3D Contours)', 'MultiLineString'],
      description:
        'RFC 7946 GeoJSON FeatureCollection / Feature datasets containing 3D coordinates [x, y, z] or explicit elevation properties (elevation, z, elev, height). Enforces explicit WGS 84 local tangent-plane projection when geographic degrees are detected.',
    },
  ],
  recognizedButUnsupportedFormats: [
    {
      format: 'GEOTIFF-DEM-UNSUPPORTED',
      detectionMethod: 'TIFF magic header (II* / MM*) or .tif / .tiff extension',
      guidance:
        'Binary GeoTIFF / DEM rasters require GDAL/GeoTIFF raster reprojection and vertical datum grids. Export sampled spot elevations as CSV (.csv) or contour lines/points as GeoJSON (.geojson) from QGIS or ArcGIS before importing.',
    },
    {
      format: 'LANDXML-TIN-UNSUPPORTED',
      detectionMethod: '<LandXML XML root element or .xml extension',
      guidance:
        'LandXML civil surface schemas are not supported natively. Export survey points to CSV (X, Y, Z) or GeoJSON from Civil 3D / surveying software.',
    },
    {
      format: 'ESRI-ASCII-GRID-UNSUPPORTED',
      detectionMethod: 'ESRI ASCII Grid header (ncols / nrows / cellsize) or .asc extension',
      guidance:
        'Convert the ASCII Grid to an XYZ/CSV elevation point table or GeoJSON contour dataset before importing.',
    },
    {
      format: 'CAD-2D-NO-ELEVATION',
      detectionMethod: 'ASCII/Binary DXF or DWG header signature',
      guidance:
        'Plotify P42 CAD Drawing Exchange operates on 2D planar architectural geometry and does not claim 3D Z-elevation extraction. Export survey points as a CSV elevation table.',
    },
  ],
  supportedUnits: ['METRE', 'FOOT', 'MILLIMETRE'],
  supportedHorizontalCRS: ['PROJECT_LOCAL', 'PROJECTED_CARTESIAN', 'WGS84_GEOGRAPHIC_LON_LAT'],
  supportedVerticalDatums: [
    'PROJECT_BENCHMARK_ZERO',
    'LOCAL_SURVEY_BENCHMARK',
    'ORTHOMETRIC_SEA_LEVEL',
    'WGS84_ELLIPSOIDAL_HEIGHT',
  ],
  surfaceMethod: {
    algorithm:
      'Bowyer-Watson 2D Delaunay Triangulated Irregular Network (TIN) with Max-Edge Gap Filter',
    minimumNonCollinearPoints: 3,
    maxPointsLimit: DEFAULT_MAX_TERRAIN_POINTS,
    maxFileSizeBytes: DEFAULT_MAX_TERRAIN_BYTES,
    gapHandling:
      'Triangles with any edge exceeding maxTriangleEdgeLength are pruned so the surface never bridges across large unmeasured gaps; queries outside valid TIN triangles return null.',
  },
  claimLimitations: [
    'A visually convincing terrain surface is not proof of survey accuracy; source coordinates and elevations are preserved as provenance.',
    'Plotify never treats geographic longitude/latitude degrees as linear metres or feet, and never silently guesses ambiguous units or vertical datums.',
    'Visual slope, aspect, and section profiles are preliminary architectural planning aids and are not a substitute for a licensed land survey, geotechnical report, civil grading design, or flood/drainage certification.',
    'Cut/fill earthwork volume certification is intentionally omitted because certified earthwork requires a stamped existing-ground survey, proposed grading pad design, batter slopes, and compaction factors.',
  ],
};

export function getSupportedTerrainProfile(): TerrainSupportProfile {
  return PLOTIFY_TERRAIN_SUPPORT_PROFILE;
}

// ============================================================================
// 2. FORMAT DETECTION & UNIT HELPERS
// ============================================================================

export function detectTerrainFileSignature(
  fileName: string,
  rawContent: string
): RecognizedTerrainFormat {
  const trimmed = (rawContent || '').trimStart();
  const lowerName = (fileName || '').toLowerCase();

  // 1. GeoTIFF binary magic bytes: Little-endian "II*\x00" or Big-endian "MM\x00*"
  if (
    rawContent.startsWith('II*\x00') ||
    rawContent.startsWith('MM\x00*') ||
    lowerName.endsWith('.tif') ||
    lowerName.endsWith('.tiff')
  ) {
    return 'GEOTIFF-DEM-UNSUPPORTED';
  }

  // 2. LandXML
  if (/<LandXML\b/i.test(trimmed.slice(0, 1000)) || lowerName.endsWith('.xml')) {
    return 'LANDXML-TIN-UNSUPPORTED';
  }

  // 3. ESRI ASCII Grid (.asc)
  if (
    (/^ncols\s+\d+/im.test(trimmed.slice(0, 400)) &&
      /^nrows\s+\d+/im.test(trimmed.slice(0, 400))) ||
    lowerName.endsWith('.asc')
  ) {
    return 'ESRI-ASCII-GRID-UNSUPPORTED';
  }

  // 4. CAD DXF / DWG
  if (
    /^0\s*\r?\n\s*SECTION\b/m.test(trimmed.slice(0, 300)) ||
    /^AC10[0-9]{2}/.test(trimmed.slice(0, 20)) ||
    lowerName.endsWith('.dxf') ||
    lowerName.endsWith('.dwg')
  ) {
    return 'CAD-2D-NO-ELEVATION';
  }

  // 5. GeoJSON
  if (
    (trimmed.startsWith('{') &&
      (/"FeatureCollection"|"Feature"|"Point"|"MultiPoint"|"LineString"|"MultiLineString"/.test(
        trimmed.slice(0, 2000)
      ))) ||
    lowerName.endsWith('.geojson')
  ) {
    return 'GEOJSON-TOPOGRAPHY';
  }

  // 6. CSV / Delimited elevation table
  if (
    lowerName.endsWith('.csv') ||
    lowerName.endsWith('.txt') ||
    lowerName.endsWith('.xyz') ||
    /^[\w#,"';\t .+-]+\r?\n[\d.+-]+[,;\t ]+[\d.+-]+/m.test(trimmed.slice(0, 1000))
  ) {
    return 'CSV-ELEVATION-POINTS';
  }

  return 'UNKNOWN-UNSUPPORTED';
}

export function getLinearUnitToProjectFactor(
  sourceUnit: Exclude<TerrainLinearUnit, 'UNSPECIFIED'>,
  targetUnit: MeasurementUnit
): number {
  const toMetres =
    sourceUnit === 'METRE' ? 1.0 : sourceUnit === 'FOOT' ? 0.3048 : 0.001; // MILLIMETRE
  return targetUnit === 'metres' ? toMetres : toMetres / 0.3048;
}

function computeBounds3D(points: Array<{ x: number; y: number; z: number }>): TerrainBoundingBox3D | null {
  if (points.length === 0) return null;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.z < minZ) minZ = p.z;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
    if (p.z > maxZ) maxZ = p.z;
  }
  return {
    minX: Number(minX.toFixed(6)),
    minY: Number(minY.toFixed(6)),
    maxX: Number(maxX.toFixed(6)),
    maxY: Number(maxY.toFixed(6)),
    minZ: Number(minZ.toFixed(4)),
    maxZ: Number(maxZ.toFixed(4)),
    width: Number(Math.max(0, maxX - minX).toFixed(6)),
    length: Number(Math.max(0, maxY - minY).toFixed(6)),
    relief: Number(Math.max(0, maxZ - minZ).toFixed(4)),
  };
}

// ============================================================================
// 3. INPUT PARSING, PREFLIGHT & ANOMALY DETECTION
// ============================================================================

function inferCSVColumnMapping(headers: string[], delimiter: ',' | ';' | '\t'): CSVColumnMapping {
  const findCol = (patterns: RegExp[], fallbackIdx: number): string => {
    for (const pat of patterns) {
      const match = headers.find((h) => pat.test(h.trim()));
      if (match) return match;
    }
    return headers[fallbackIdx] || '';
  };

  const idCol = headers.find((h) => /^(id|pt|point_?id|name|station|code)$/i.test(h.trim()));
  const xCol = findCol([/^(x|easting|east|lon|lng|longitude|local_?x)$/i, /x|east|lon/i], idCol ? 1 : 0);
  const yCol = findCol([/^(y|northing|north|lat|latitude|local_?y)$/i, /y|north|lat/i], idCol ? 2 : 1);
  const zCol = findCol([/^(z|elev|elevation|height|alt|altitude|rl|level)$/i, /z|elev|height/i], idCol ? 3 : 2);
  const classCol = headers.find((h) => /^(class|classification|desc|description|type|feature|note)$/i.test(h.trim()));

  return {
    idColumn: idCol,
    xColumn: xCol,
    yColumn: yCol,
    zColumn: zCol,
    classificationColumn: classCol,
    hasHeaderRow: true,
    delimiter,
  };
}

/**
 * Checks if a set of 2D points has at least 3 non-collinear points.
 */
export function hasThreeNonCollinearPoints(pts: Array<{ x: number; y: number }>): boolean {
  if (pts.length < 3) return false;
  const p0 = pts[0];
  let p1: { x: number; y: number } | null = null;
  for (let i = 1; i < pts.length; i++) {
    if (Math.hypot(pts[i].x - p0.x, pts[i].y - p0.y) > 1e-5) {
      p1 = pts[i];
      break;
    }
  }
  if (!p1) return false;
  const dx1 = p1.x - p0.x;
  const dy1 = p1.y - p0.y;
  const baseLen = Math.hypot(dx1, dy1);
  for (let i = 1; i < pts.length; i++) {
    const dx2 = pts[i].x - p0.x;
    const dy2 = pts[i].y - p0.y;
    const cross = Math.abs(dx1 * dy2 - dy1 * dx2);
    if (cross / baseLen > 1e-4) {
      return true;
    }
  }
  return false;
}

export function parseTerrainInputToDataset(request: TerrainImportRequest): TerrainDatasetModel {
  const warnings: TerrainImportWarning[] = [];
  const errors: TerrainImportError[] = [];
  const parsedAt = new Date().toISOString();

  const maxBytes = request.maxFileSizeBytes ?? DEFAULT_MAX_TERRAIN_BYTES;
  const maxPoints = request.maxPointsLimit ?? DEFAULT_MAX_TERRAIN_POINTS;

  const createEmptyDataset = (detectedFormat: RecognizedTerrainFormat = 'UNKNOWN-UNSUPPORTED'): TerrainDatasetModel => ({
    formatVersion: 'plotify-terrain-dataset-v1',
    isValid: false,
    fileName: request.fileName || 'unknown',
    fileSizeBytes: request.fileSizeBytes || 0,
    fileChecksum: '',
    detectedFormat,
    detectedCsvHeaders: [],
    detectedHorizontalCRS: 'UNKNOWN_AMBIGUOUS',
    detectedHorizontalUnit: 'UNSPECIFIED',
    detectedVerticalUnit: 'UNSPECIFIED',
    detectedVerticalDatum: 'UNSPECIFIED_DATUM',
    requiresUserConfirmation: true,
    sourcePoints: [],
    sourceContours: [],
    skippedRecordCount: 0,
    unsupportedFeatureCounts: {},
    duplicatePointIds: [],
    outlierPointIds: [],
    rawExtents: null,
    warnings,
    errors,
    parsedAt,
  });

  if (!request.rawContent || request.rawContent.trim().length === 0 || request.fileSizeBytes === 0) {
    errors.push({
      id: 'err-terrain-empty',
      code: 'FILE_EMPTY',
      message: 'The uploaded terrain file is empty (0 bytes).',
      fatal: true,
    });
    return createEmptyDataset();
  }

  if (request.fileSizeBytes > maxBytes || request.rawContent.length > maxBytes) {
    errors.push({
      id: 'err-terrain-oversize',
      code: 'FILE_TOO_LARGE',
      message: `Terrain file size (${(request.fileSizeBytes / (1024 * 1024)).toFixed(2)} MB) exceeds Plotify's safe processing limit of ${(maxBytes / (1024 * 1024)).toFixed(0)} MB.`,
      fatal: true,
    });
    return createEmptyDataset();
  }

  const detectedFormat = request.formatHint || detectTerrainFileSignature(request.fileName, request.rawContent);

  if (detectedFormat === 'GEOTIFF-DEM-UNSUPPORTED') {
    errors.push({
      id: 'err-terrain-geotiff',
      code: 'UNSUPPORTED_FORMAT_GEOTIFF',
      message:
        'Binary GeoTIFF / DEM raster files (.tif/.tiff) are not parsed directly to avoid unverified binary reprojection. Export sampled spot elevations as CSV (.csv) or contour features as GeoJSON (.geojson) and import that file.',
      fatal: true,
    });
    return createEmptyDataset(detectedFormat);
  }

  if (detectedFormat === 'LANDXML-TIN-UNSUPPORTED') {
    errors.push({
      id: 'err-terrain-landxml',
      code: 'UNSUPPORTED_FORMAT_LANDXML',
      message:
        'LandXML files (.xml) are not supported natively. Export survey points as a CSV elevation table (X, Y, Z) or GeoJSON topography dataset.',
      fatal: true,
    });
    return createEmptyDataset(detectedFormat);
  }

  if (detectedFormat === 'ESRI-ASCII-GRID-UNSUPPORTED') {
    errors.push({
      id: 'err-terrain-asc',
      code: 'UNSUPPORTED_FORMAT_ESRI_GRID',
      message:
        'ESRI ASCII Grid (.asc) files are not supported natively. Convert grid cells to an XYZ/CSV elevation point table or GeoJSON contours.',
      fatal: true,
    });
    return createEmptyDataset(detectedFormat);
  }

  if (detectedFormat === 'CAD-2D-NO-ELEVATION') {
    errors.push({
      id: 'err-terrain-cad2d',
      code: 'CAD_2D_HAS_NO_ELEVATIONS',
      message:
        'P42 CAD Drawing Exchange supports 2D planar architectural geometry only and does not extract 3D survey elevations. Please import a CSV elevation point table or 3D GeoJSON contour dataset.',
      fatal: true,
    });
    return createEmptyDataset(detectedFormat);
  }

  if (detectedFormat !== 'CSV-ELEVATION-POINTS' && detectedFormat !== 'GEOJSON-TOPOGRAPHY') {
    errors.push({
      id: 'err-terrain-unknown',
      code: 'MALFORMED_INPUT_FILE',
      message:
        'Unrecognized terrain file format. Supported formats are CSV Elevation Points (.csv, .txt, .xyz) and GeoJSON Topography (.geojson, .json).',
      fatal: true,
    });
    return createEmptyDataset(detectedFormat);
  }

  const sourcePoints: TerrainSourcePoint[] = [];
  const sourceContours: TerrainSourceContourLine[] = [];
  let skippedRecordCount = 0;
  const unsupportedFeatureCounts: Record<string, number> = {};
  let detectedCsvHeaders: string[] = [];
  let appliedCsvMapping: CSVColumnMapping | undefined;

  let detectedHorizontalCRS: TerrainHorizontalCRS = 'UNKNOWN_AMBIGUOUS';
  let detectedHorizontalUnit: TerrainLinearUnit = 'UNSPECIFIED';
  let detectedVerticalUnit: TerrainLinearUnit = 'UNSPECIFIED';
  let detectedVerticalDatum: TerrainVerticalDatum = 'UNSPECIFIED_DATUM';

  if (detectedFormat === 'CSV-ELEVATION-POINTS') {
    const rawLines = request.rawContent
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    // Inspect optional metadata comment lines starting with '#'
    const dataLines: string[] = [];
    for (const line of rawLines) {
      if (line.startsWith('#')) {
        const metaUpper = line.toUpperCase();
        if (metaUpper.includes('CRS: PROJECT_LOCAL')) detectedHorizontalCRS = 'PROJECT_LOCAL';
        else if (metaUpper.includes('CRS: PROJECTED_CARTESIAN')) detectedHorizontalCRS = 'PROJECTED_CARTESIAN';
        else if (metaUpper.includes('CRS: WGS84')) detectedHorizontalCRS = 'WGS84_GEOGRAPHIC_LON_LAT';

        if (metaUpper.includes('UNIT: METRE') || metaUpper.includes('UNIT: M')) {
          detectedHorizontalUnit = 'METRE';
          detectedVerticalUnit = 'METRE';
        } else if (metaUpper.includes('UNIT: FOOT') || metaUpper.includes('UNIT: FT')) {
          detectedHorizontalUnit = 'FOOT';
          detectedVerticalUnit = 'FOOT';
        } else if (metaUpper.includes('UNIT: MILLIMETRE') || metaUpper.includes('UNIT: MM')) {
          detectedHorizontalUnit = 'MILLIMETRE';
          detectedVerticalUnit = 'MILLIMETRE';
        }

        if (metaUpper.includes('DATUM: PROJECT_BENCHMARK_ZERO')) {
          detectedVerticalDatum = 'PROJECT_BENCHMARK_ZERO';
        } else if (metaUpper.includes('DATUM: LOCAL_SURVEY_BENCHMARK')) {
          detectedVerticalDatum = 'LOCAL_SURVEY_BENCHMARK';
        } else if (metaUpper.includes('DATUM: ORTHOMETRIC_SEA_LEVEL')) {
          detectedVerticalDatum = 'ORTHOMETRIC_SEA_LEVEL';
        }
      } else {
        dataLines.push(line);
      }
    }

    if (dataLines.length === 0) {
      errors.push({
        id: 'err-csv-no-rows',
        code: 'NO_VALID_ELEVATION_POINTS',
        message: 'CSV file contains no data rows.',
        fatal: true,
      });
      return createEmptyDataset(detectedFormat);
    }

    const firstLine = dataLines[0];
    const delimiter: ',' | ';' | '\t' =
      request.csvMapping?.delimiter ||
      (firstLine.includes('\t') ? '\t' : firstLine.includes(';') ? ';' : ',');

    const firstTokens = firstLine.split(delimiter).map((t) => t.trim().replace(/^"|"$/g, ''));
    const firstRowLooksNumeric =
      firstTokens.length >= 3 &&
      !isNaN(parseFloat(firstTokens[0])) &&
      !isNaN(parseFloat(firstTokens[1])) &&
      !isNaN(parseFloat(firstTokens[2]));

    const hasHeaderRow = request.csvMapping?.hasHeaderRow ?? !firstRowLooksNumeric;
    detectedCsvHeaders = hasHeaderRow
      ? firstTokens
      : firstTokens.map((_, idx) => `Col_${idx + 1}`);

    const defaultMap = inferCSVColumnMapping(detectedCsvHeaders, delimiter);
    appliedCsvMapping = {
      idColumn: request.csvMapping?.idColumn ?? defaultMap.idColumn,
      xColumn: request.csvMapping?.xColumn ?? defaultMap.xColumn,
      yColumn: request.csvMapping?.yColumn ?? defaultMap.yColumn,
      zColumn: request.csvMapping?.zColumn ?? defaultMap.zColumn,
      classificationColumn:
        request.csvMapping?.classificationColumn ?? defaultMap.classificationColumn,
      hasHeaderRow,
      delimiter,
    };

    const xIdx = detectedCsvHeaders.indexOf(appliedCsvMapping.xColumn);
    const yIdx = detectedCsvHeaders.indexOf(appliedCsvMapping.yColumn);
    const zIdx = detectedCsvHeaders.indexOf(appliedCsvMapping.zColumn);
    const idIdx = appliedCsvMapping.idColumn
      ? detectedCsvHeaders.indexOf(appliedCsvMapping.idColumn)
      : -1;
    const classIdx = appliedCsvMapping.classificationColumn
      ? detectedCsvHeaders.indexOf(appliedCsvMapping.classificationColumn)
      : -1;

    if (xIdx === -1 || yIdx === -1 || zIdx === -1 || xIdx === yIdx || xIdx === zIdx || yIdx === zIdx) {
      errors.push({
        id: 'err-csv-missing-cols',
        code: 'MISSING_REQUIRED_COLUMNS',
        message: `CSV column mapping requires distinct valid columns for X ("${appliedCsvMapping.xColumn}"), Y ("${appliedCsvMapping.yColumn}"), and Z/Elevation ("${appliedCsvMapping.zColumn}"). Available columns: ${detectedCsvHeaders.join(', ')}.`,
        fatal: true,
      });
      return {
        ...createEmptyDataset(detectedFormat),
        detectedCsvHeaders,
        appliedCsvMapping,
      };
    }

    const startRow = hasHeaderRow ? 1 : 0;
    for (let r = startRow; r < dataLines.length; r++) {
      const cols = dataLines[r].split(delimiter).map((c) => c.trim().replace(/^"|"$/g, ''));
      const rawXStr = cols[xIdx];
      const rawYStr = cols[yIdx];
      const rawZStr = cols[zIdx];

      const rawX = rawXStr !== undefined && rawXStr !== '' ? Number(rawXStr) : NaN;
      const rawY = rawYStr !== undefined && rawYStr !== '' ? Number(rawYStr) : NaN;
      const rawZ = rawZStr !== undefined && rawZStr !== '' ? Number(rawZStr) : NaN;

      if (!Number.isFinite(rawX) || !Number.isFinite(rawY) || !Number.isFinite(rawZ)) {
        skippedRecordCount++;
        warnings.push({
          id: `warn-skip-row-${r + 1}`,
          code: 'MISSING_ELEVATION_RECORD_SKIPPED',
          severity: 'warning',
          message: `Skipped CSV row ${r + 1}: non-finite or missing X, Y, or Z elevation value (${rawXStr || 'empty'}, ${rawYStr || 'empty'}, ${rawZStr || 'empty'}). Never fabricated.`,
        });
        continue;
      }

      if (sourcePoints.length >= maxPoints) {
        errors.push({
          id: 'err-terrain-point-limit',
          code: 'POINT_LIMIT_EXCEEDED',
          message: `Terrain dataset exceeds maximum supported point count (${maxPoints} points).`,
          fatal: true,
        });
        return createEmptyDataset(detectedFormat);
      }

      const ptId =
        idIdx >= 0 && cols[idIdx]
          ? sanitizeText(cols[idIdx], 40, `PT-${sourcePoints.length + 1}`)
          : `PT-${sourcePoints.length + 1}`;
      const ptClass =
        classIdx >= 0 && cols[classIdx]
          ? sanitizeText(cols[classIdx], 60, 'spot-elevation')
          : 'spot-elevation';

      sourcePoints.push({
        id: ptId,
        rowIndexOrFeatureIndex: r + 1,
        rawX,
        rawY,
        rawZ,
        classification: ptClass,
        sourceType: 'csv-point',
      });
    }
  } else if (detectedFormat === 'GEOJSON-TOPOGRAPHY') {
    let parsedJson: any;
    try {
      parsedJson = JSON.parse(request.rawContent);
    } catch (e: any) {
      errors.push({
        id: 'err-geojson-syntax',
        code: 'MALFORMED_INPUT_FILE',
        message: `Malformed GeoJSON file: ${e.message || 'Invalid JSON syntax'}.`,
        fatal: true,
      });
      return createEmptyDataset(detectedFormat);
    }

    if (!parsedJson || typeof parsedJson !== 'object') {
      errors.push({
        id: 'err-geojson-root',
        code: 'MALFORMED_INPUT_FILE',
        message: 'GeoJSON root must be a valid JSON object.',
        fatal: true,
      });
      return createEmptyDataset(detectedFormat);
    }

    // Inspect optional plotifyMetadata or crs block if present
    if (parsedJson.plotifyMetadata && typeof parsedJson.plotifyMetadata === 'object') {
      const pm = parsedJson.plotifyMetadata;
      if (pm.horizontalCRS === 'PROJECT_LOCAL' || pm.horizontalCRS === 'PROJECTED_CARTESIAN' || pm.horizontalCRS === 'WGS84_GEOGRAPHIC_LON_LAT') {
        detectedHorizontalCRS = pm.horizontalCRS;
      }
      if (pm.horizontalUnit === 'METRE' || pm.horizontalUnit === 'FOOT' || pm.horizontalUnit === 'MILLIMETRE') {
        detectedHorizontalUnit = pm.horizontalUnit;
      }
      if (pm.verticalUnit === 'METRE' || pm.verticalUnit === 'FOOT' || pm.verticalUnit === 'MILLIMETRE') {
        detectedVerticalUnit = pm.verticalUnit;
      }
      if (pm.verticalDatum) {
        detectedVerticalDatum = pm.verticalDatum;
      }
    }

    const features: any[] =
      parsedJson.type === 'FeatureCollection' && Array.isArray(parsedJson.features)
        ? parsedJson.features
        : parsedJson.type === 'Feature'
        ? [parsedJson]
        : [];

    if (features.length === 0) {
      errors.push({
        id: 'err-geojson-empty-features',
        code: 'NO_VALID_ELEVATION_POINTS',
        message: 'GeoJSON contains no valid Feature or FeatureCollection features.',
        fatal: true,
      });
      return createEmptyDataset(detectedFormat);
    }

    const extractPropElevation = (props: any): number | null => {
      if (!props || typeof props !== 'object') return null;
      for (const key of ['elevation', 'z', 'elev', 'height', 'level', 'RL']) {
        if (props[key] !== undefined && props[key] !== null && props[key] !== '') {
          const val = Number(props[key]);
          if (Number.isFinite(val)) return val;
        }
      }
      return null;
    };

    for (let fIdx = 0; fIdx < features.length; fIdx++) {
      const feat = features[fIdx];
      const geom = feat?.geometry;
      const props = feat?.properties || {};
      if (!geom || !geom.type) {
        skippedRecordCount++;
        continue;
      }

      const gType = String(geom.type);
      const propZ = extractPropElevation(props);
      const featId = sanitizeText(String(feat.id || props.id || props.name || `F-${fIdx + 1}`), 40, `F-${fIdx + 1}`);
      const featClass = sanitizeText(String(props.classification || props.type || gType), 60, gType);

      if (gType === 'Point') {
        const c = geom.coordinates;
        const rx = Array.isArray(c) ? Number(c[0]) : NaN;
        const ry = Array.isArray(c) ? Number(c[1]) : NaN;
        const rz = Array.isArray(c) && c.length >= 3 && Number.isFinite(Number(c[2])) ? Number(c[2]) : propZ ?? NaN;

        if (!Number.isFinite(rx) || !Number.isFinite(ry) || !Number.isFinite(rz)) {
          skippedRecordCount++;
          warnings.push({
            id: `warn-geojson-pt-${fIdx}`,
            code: 'MISSING_ELEVATION_RECORD_SKIPPED',
            severity: 'warning',
            message: `Skipped GeoJSON Point feature "${featId}" without valid 3D Z coordinate or elevation property.`,
          });
          continue;
        }
        sourcePoints.push({
          id: featId,
          rowIndexOrFeatureIndex: fIdx + 1,
          rawX: rx,
          rawY: ry,
          rawZ: rz,
          classification: featClass,
          sourceType: 'geojson-point',
        });
      } else if (gType === 'MultiPoint') {
        const coords = Array.isArray(geom.coordinates) ? geom.coordinates : [];
        coords.forEach((c: any, mIdx: number) => {
          const rx = Array.isArray(c) ? Number(c[0]) : NaN;
          const ry = Array.isArray(c) ? Number(c[1]) : NaN;
          const rz = Array.isArray(c) && c.length >= 3 && Number.isFinite(Number(c[2])) ? Number(c[2]) : propZ ?? NaN;
          if (!Number.isFinite(rx) || !Number.isFinite(ry) || !Number.isFinite(rz)) {
            skippedRecordCount++;
            return;
          }
          sourcePoints.push({
            id: `${featId}-${mIdx + 1}`,
            rowIndexOrFeatureIndex: fIdx + 1,
            rawX: rx,
            rawY: ry,
            rawZ: rz,
            classification: featClass,
            sourceType: 'geojson-point',
          });
        });
      } else if (gType === 'LineString' || gType === 'MultiLineString') {
        const lines =
          gType === 'LineString'
            ? [geom.coordinates]
            : Array.isArray(geom.coordinates)
            ? geom.coordinates
            : [];
        lines.forEach((lineCoords: any, lIdx: number) => {
          if (!Array.isArray(lineCoords) || lineCoords.length < 2) {
            skippedRecordCount++;
            return;
          }
          const contourVerts: Array<{ rawX: number; rawY: number; rawZ: number }> = [];
          lineCoords.forEach((c: any, vIdx: number) => {
            const rx = Array.isArray(c) ? Number(c[0]) : NaN;
            const ry = Array.isArray(c) ? Number(c[1]) : NaN;
            const rz = Array.isArray(c) && c.length >= 3 && Number.isFinite(Number(c[2])) ? Number(c[2]) : propZ ?? NaN;
            if (Number.isFinite(rx) && Number.isFinite(ry) && Number.isFinite(rz)) {
              contourVerts.push({ rawX: rx, rawY: ry, rawZ: rz });
              sourcePoints.push({
                id: `${featId}-L${lIdx + 1}-V${vIdx + 1}`,
                rowIndexOrFeatureIndex: fIdx + 1,
                rawX: rx,
                rawY: ry,
                rawZ: rz,
                classification: 'contour-vertex',
                sourceType: 'geojson-contour-vertex',
              });
            }
          });
          if (contourVerts.length >= 2) {
            sourceContours.push({
              id: `${featId}-C${lIdx + 1}`,
              elevation: contourVerts[0].rawZ,
              label: props.label || `${contourVerts[0].rawZ}`,
              vertices: contourVerts,
            });
          } else {
            skippedRecordCount++;
            warnings.push({
              id: `warn-geojson-line-${fIdx}`,
              code: 'MISSING_ELEVATION_RECORD_SKIPPED',
              severity: 'warning',
              message: `Skipped GeoJSON ${gType} "${featId}" because it lacks 3D Z coordinates or an elevation property.`,
            });
          }
        });
      } else {
        unsupportedFeatureCounts[gType] = (unsupportedFeatureCounts[gType] || 0) + 1;
        skippedRecordCount++;
        warnings.push({
          id: `warn-geojson-unsup-${fIdx}`,
          code: 'UNSUPPORTED_FEATURE_SKIPPED',
          severity: 'warning',
          message: `Skipped unsupported GeoJSON geometry type "${gType}" on feature "${featId}". Only Point, MultiPoint, LineString, and MultiLineString with elevations are supported.`,
        });
      }
    }

    // Standard RFC 7946 GeoJSON uses WGS 84 geographic [longitude, latitude] in degrees
    if (detectedHorizontalCRS === 'UNKNOWN_AMBIGUOUS' && sourcePoints.length > 0) {
      const allWithinLonLatRange = sourcePoints.every(
        (p) => Math.abs(p.rawX) <= 180 && Math.abs(p.rawY) <= 90
      );
      const spanX =
        Math.max(...sourcePoints.map((p) => p.rawX)) -
        Math.min(...sourcePoints.map((p) => p.rawX));
      const spanY =
        Math.max(...sourcePoints.map((p) => p.rawY)) -
        Math.min(...sourcePoints.map((p) => p.rawY));

      if (allWithinLonLatRange && spanX > 0 && spanX < 1.0 && spanY > 0 && spanY < 1.0) {
        detectedHorizontalCRS = 'WGS84_GEOGRAPHIC_LON_LAT';
        detectedVerticalUnit = 'METRE';
        detectedVerticalDatum = 'WGS84_ELLIPSOIDAL_HEIGHT';
        warnings.push({
          id: 'warn-geojson-wgs84-deg',
          code: 'WGS84_GEOGRAPHIC_REQUIRES_TANGENT_ORIGIN',
          severity: 'warning',
          message:
            'RFC 7946 GeoJSON coordinates appear to be WGS 84 geographic [longitude, latitude] degrees. Plotify never treats degrees as linear metres or feet; confirm the local tangent-plane reference origin before generating terrain.',
          remedy:
            'Confirm WGS84_GEOGRAPHIC_LON_LAT projection and reference (lon, lat) in Step 2 Calibration.',
        });
        warnings.push({
          id: 'warn-geojson-wgs84-datum',
          code: 'WGS84_ELLIPSOIDAL_HEIGHT_NOTICE',
          severity: 'info',
          message:
            'Standard GeoJSON 3rd coordinates represent height in metres above the WGS 84 ellipsoid, not a local municipal orthometric or project benchmark datum.',
        });
      }
    }
  }

  if (sourcePoints.length === 0) {
    errors.push({
      id: 'err-no-valid-points',
      code: 'NO_VALID_ELEVATION_POINTS',
      message: 'No valid finite 3D elevation points could be extracted from the input file.',
      fatal: true,
    });
    return {
      ...createEmptyDataset(detectedFormat),
      detectedCsvHeaders,
      appliedCsvMapping,
      skippedRecordCount,
      unsupportedFeatureCounts,
    };
  }

  const rawExtents = computeBounds3D(
    sourcePoints.map((p) => ({ x: p.rawX, y: p.rawY, z: p.rawZ }))
  );

  // Quality Check A: Duplicate XY points
  const xyMap = new Map<string, TerrainSourcePoint[]>();
  const duplicatePointIds: string[] = [];
  for (const pt of sourcePoints) {
    const key = `${pt.rawX.toFixed(4)}:${pt.rawY.toFixed(4)}`;
    const list = xyMap.get(key) || [];
    list.push(pt);
    xyMap.set(key, list);
  }
  for (const [, list] of xyMap.entries()) {
    if (list.length > 1) {
      for (let i = 1; i < list.length; i++) {
        duplicatePointIds.push(list[i].id);
      }
    }
  }
  if (duplicatePointIds.length > 0) {
    warnings.push({
      id: 'warn-dup-xy',
      code: 'DUPLICATE_XY_COORDINATES',
      severity: 'warning',
      affectedIds: duplicatePointIds,
      message: `Detected ${duplicatePointIds.length} duplicate horizontal (X, Y) point record(s) (${duplicatePointIds.slice(0, 5).join(', ')}). Review in the Point Inspector; duplicates are deduplicated during TIN triangulation without deleting source records.`,
    });
  }

  // Quality Check B: Statistical Z Outliers
  const outlierPointIds: string[] = [];
  if (sourcePoints.length >= 6) {
    const meanZ = sourcePoints.reduce((acc, p) => acc + p.rawZ, 0) / sourcePoints.length;
    const varianceZ =
      sourcePoints.reduce((acc, p) => acc + (p.rawZ - meanZ) ** 2, 0) / sourcePoints.length;
    const stdZ = Math.sqrt(varianceZ);
    if (stdZ > 1e-3) {
      for (const pt of sourcePoints) {
        if (Math.abs(pt.rawZ - meanZ) > 2.6 * stdZ) {
          outlierPointIds.push(pt.id);
        }
      }
    }
  }
  if (outlierPointIds.length > 0) {
    warnings.push({
      id: 'warn-z-outliers',
      code: 'ABRUPT_ELEVATION_OUTLIER',
      severity: 'warning',
      affectedIds: outlierPointIds,
      message: `Detected ${outlierPointIds.length} potential abrupt elevation outlier(s) (${outlierPointIds.slice(0, 5).join(', ')}). Plotify never silently deletes survey points; you may inspect and optionally exclude them in Step 3.`,
    });
  }

  // Quality Check C: Minimum non-collinear points for surface generation
  if (sourcePoints.length < 3) {
    warnings.push({
      id: 'warn-too-few-points',
      code: 'INSUFFICIENT_POINTS_FOR_SURFACE',
      severity: 'warning',
      message: `Only ${sourcePoints.length} valid elevation point(s) found. At least 3 non-collinear points are required to triangulate a terrain surface; points will be displayed without fabricating a surface.`,
    });
  } else if (
    !hasThreeNonCollinearPoints(sourcePoints.map((p) => ({ x: p.rawX, y: p.rawY })))
  ) {
    warnings.push({
      id: 'warn-collinear-points',
      code: 'COLLINEAR_OR_DEGENERATE_POINTS',
      severity: 'warning',
      message:
        'All imported elevation points are collinear along a single line. A 2D terrain surface cannot be triangulated from collinear points.',
    });
  }

  const requiresUserConfirmation =
    detectedHorizontalCRS === 'UNKNOWN_AMBIGUOUS' ||
    detectedHorizontalCRS === 'WGS84_GEOGRAPHIC_LON_LAT' ||
    detectedHorizontalUnit === 'UNSPECIFIED' ||
    detectedVerticalUnit === 'UNSPECIFIED' ||
    detectedVerticalDatum === 'UNSPECIFIED_DATUM';

  if (
    detectedHorizontalCRS === 'UNKNOWN_AMBIGUOUS' ||
    detectedHorizontalUnit === 'UNSPECIFIED' ||
    detectedVerticalUnit === 'UNSPECIFIED'
  ) {
    warnings.push({
      id: 'warn-ambiguous-units-crs',
      code: 'AMBIGUOUS_UNITS_OR_CRS',
      severity: 'warning',
      message:
        'File metadata does not explicitly declare horizontal coordinate system or linear units. Explicit user confirmation is required before applying.',
    });
  }

  if (detectedVerticalDatum === 'UNSPECIFIED_DATUM') {
    warnings.push({
      id: 'warn-ambiguous-datum',
      code: 'AMBIGUOUS_VERTICAL_DATUM',
      severity: 'warning',
      message:
        'Vertical datum / height reference is not specified in the file header. Confirm the vertical datum before applying.',
    });
  }

  return {
    formatVersion: 'plotify-terrain-dataset-v1',
    isValid: !errors.some((e) => e.fatal),
    fileName: request.fileName,
    fileSizeBytes: request.fileSizeBytes,
    fileChecksum: computeStringChecksum(request.rawContent),
    detectedFormat,
    detectedCsvHeaders,
    appliedCsvMapping,
    detectedHorizontalCRS,
    detectedHorizontalUnit,
    detectedVerticalUnit,
    detectedVerticalDatum,
    requiresUserConfirmation,
    sourcePoints,
    sourceContours,
    skippedRecordCount,
    unsupportedFeatureCounts,
    duplicatePointIds,
    outlierPointIds,
    rawExtents,
    warnings,
    errors,
    parsedAt,
  };
}

// ============================================================================
// 4. DEFAULT CALIBRATION & COORDINATE TRANSFORMATION
// ============================================================================

export function buildDefaultTerrainCalibration(
  dataset: TerrainDatasetModel,
  project: Project | null,
  fallbackUnit: MeasurementUnit = 'metres'
): TerrainAlignmentAndCalibration {
  const targetUnit = project?.unit || fallbackUnit;
  const defaultLinearUnit: Exclude<TerrainLinearUnit, 'UNSPECIFIED'> =
    targetUnit === 'feet' ? 'FOOT' : 'METRE';

  const horizontalCRS: Exclude<TerrainHorizontalCRS, 'UNKNOWN_AMBIGUOUS'> =
    dataset.detectedHorizontalCRS === 'UNKNOWN_AMBIGUOUS'
      ? 'PROJECT_LOCAL'
      : dataset.detectedHorizontalCRS;

  const horizontalUnit: Exclude<TerrainLinearUnit, 'UNSPECIFIED'> =
    dataset.detectedHorizontalUnit === 'UNSPECIFIED'
      ? defaultLinearUnit
      : dataset.detectedHorizontalUnit;

  const verticalUnit: Exclude<TerrainLinearUnit, 'UNSPECIFIED'> =
    dataset.detectedVerticalUnit === 'UNSPECIFIED'
      ? defaultLinearUnit
      : dataset.detectedVerticalUnit;

  const verticalDatum: Exclude<TerrainVerticalDatum, 'UNSPECIFIED_DATUM'> =
    dataset.detectedVerticalDatum === 'UNSPECIFIED_DATUM'
      ? 'LOCAL_SURVEY_BENCHMARK'
      : dataset.detectedVerticalDatum;

  const ext = dataset.rawExtents;
  const needsOriginShift =
    horizontalCRS === 'PROJECTED_CARTESIAN' ||
    horizontalCRS === 'WGS84_GEOGRAPHIC_LON_LAT' ||
    (ext !== null && (ext.minX < -1 || ext.minY < -1 || ext.minX > 200 || ext.minY > 200));

  const plotDiag = project
    ? Math.hypot(project.plotWidth, project.plotLength)
    : targetUnit === 'feet'
    ? 120
    : 40;

  return {
    horizontalCRS,
    horizontalUnit,
    verticalUnit,
    verticalDatum,
    userConfirmedUnitsAndCRS: !dataset.requiresUserConfirmation,
    userConfirmedVerticalDatum: dataset.detectedVerticalDatum !== 'UNSPECIFIED_DATUM',
    alignmentMode: needsOriginShift ? 'align-min-extents-to-plot-origin' : 'preserve-local',
    manualOriginSourceX: ext?.minX || 0,
    manualOriginSourceY: ext?.minY || 0,
    wgs84ReferenceLon: ext?.minX || 0,
    wgs84ReferenceLat: ext?.minY || 0,
    verticalOffsetInTargetUnit: 0,
    maxTriangleEdgeLength: Number((plotDiag * 0.85).toFixed(2)),
    contourInterval: targetUnit === 'feet' ? 1.0 : 0.5,
    excludedPointIds: [],
  };
}

/**
 * Projects WGS 84 (lon, lat) in degrees to local tangent plane Easting/Northing in metres
 * relative to (refLon, refLat) using WGS 84 ellipsoid radii of curvature.
 */
export function projectWGS84LonLatToLocalMetres(
  lonDeg: number,
  latDeg: number,
  refLonDeg: number,
  refLatDeg: number
): { eastMetres: number; northMetres: number } {
  const a = 6378137.0; // WGS 84 semi-major axis (m)
  const e2 = 0.00669437999014; // WGS 84 first eccentricity squared
  const phi0 = (refLatDeg * Math.PI) / 180.0;
  const sinPhi0 = Math.sin(phi0);
  const cosPhi0 = Math.cos(phi0);
  const denom = Math.sqrt(1 - e2 * sinPhi0 * sinPhi0);
  const RN = a / denom; // Prime vertical radius of curvature
  const RM = (a * (1 - e2)) / (denom * denom * denom); // Meridional radius of curvature

  const dLonRad = ((lonDeg - refLonDeg) * Math.PI) / 180.0;
  const dLatRad = ((latDeg - refLatDeg) * Math.PI) / 180.0;

  return {
    eastMetres: dLonRad * RN * cosPhi0,
    northMetres: dLatRad * RM,
  };
}

// ============================================================================
// 5. DETERMINISTIC BOWYER-WATSON DELAUNAY TIN & CONTOUR GENERATOR
// ============================================================================

interface RawTri {
  i0: number;
  i1: number;
  i2: number;
}

function circumcircleContains(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p: { x: number; y: number }
): boolean {
  const ax = p0.x - p.x;
  const ay = p0.y - p.y;
  const bx = p1.x - p.x;
  const by = p1.y - p.y;
  const cx = p2.x - p.x;
  const cy = p2.y - p.y;

  const det =
    (ax * ax + ay * ay) * (bx * cy - cx * by) -
    (bx * bx + by * by) * (ax * cy - cx * ay) +
    (cx * cx + cy * cy) * (ax * by - bx * ay);

  // Ensure counter-clockwise orientation sign
  const orient = (p1.x - p0.x) * (p2.y - p0.y) - (p1.y - p0.y) * (p2.x - p0.x);
  return orient > 0 ? det > 1e-9 : det < -1e-9;
}

export function generateDelaunayTIN(
  calibratedPoints: CalibratedTerrainPoint[],
  unit: MeasurementUnit,
  plotWidth: number,
  plotLength: number,
  maxTriangleEdgeLength: number,
  contourInterval: number
): TerrainSurfaceMesh | null {
  // Filter to active (non-excluded) finite points and deduplicate identical XY coordinates
  const activePoints: CalibratedTerrainPoint[] = [];
  const seenXY = new Set<string>();
  for (const pt of calibratedPoints) {
    if (pt.isExcluded) continue;
    if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y) || !Number.isFinite(pt.z)) continue;
    const key = `${pt.x.toFixed(3)}:${pt.y.toFixed(3)}`;
    if (seenXY.has(key)) continue;
    seenXY.add(key);
    activePoints.push(pt);
  }

  if (
    activePoints.length < 3 ||
    !hasThreeNonCollinearPoints(activePoints.map((p) => ({ x: p.x, y: p.y })))
  ) {
    return null;
  }

  const bounds = computeBounds3D(activePoints);
  if (!bounds) return null;

  const minX = bounds.minX;
  const minY = bounds.minY;
  const maxX = bounds.maxX;
  const maxY = bounds.maxY;
  const dx = Math.max(maxX - minX, 10);
  const dy = Math.max(maxY - minY, 10);
  const deltaMax = Math.max(dx, dy) * 10;
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  // Super-triangle vertices appended at indices N, N+1, N+2
  const n = activePoints.length;
  const allPts: Array<{ x: number; y: number }> = activePoints.map((p) => ({ x: p.x, y: p.y }));
  allPts.push(
    { x: midX - 2 * deltaMax, y: midY - deltaMax },
    { x: midX, y: midY + 2 * deltaMax },
    { x: midX + 2 * deltaMax, y: midY - deltaMax }
  );

  let triangles: RawTri[] = [{ i0: n, i1: n + 1, i2: n + 2 }];

  for (let i = 0; i < n; i++) {
    const pt = allPts[i];
    const badTriangles: RawTri[] = [];
    for (const tri of triangles) {
      if (circumcircleContains(allPts[tri.i0], allPts[tri.i1], allPts[tri.i2], pt)) {
        badTriangles.push(tri);
      }
    }

    // Find boundary edges of the polygonal hole (edges shared by only 1 bad triangle)
    const edgeCounts = new Map<string, { u: number; v: number; count: number }>();
    const addEdge = (u: number, v: number) => {
      const a = Math.min(u, v);
      const b = Math.max(u, v);
      const key = `${a}:${b}`;
      const existing = edgeCounts.get(key);
      if (existing) {
        existing.count++;
      } else {
        edgeCounts.set(key, { u, v, count: 1 });
      }
    };

    for (const bt of badTriangles) {
      addEdge(bt.i0, bt.i1);
      addEdge(bt.i1, bt.i2);
      addEdge(bt.i2, bt.i0);
    }

    const badSet = new Set(badTriangles);
    triangles = triangles.filter((t) => !badSet.has(t));

    for (const edge of edgeCounts.values()) {
      if (edge.count === 1) {
        // Ensure counter-clockwise orientation
        const pA = allPts[edge.u];
        const pB = allPts[edge.v];
        const orient = (pB.x - pA.x) * (pt.y - pA.y) - (pB.y - pA.y) * (pt.x - pA.x);
        if (orient > 0) {
          triangles.push({ i0: edge.u, i1: edge.v, i2: i });
        } else {
          triangles.push({ i0: edge.v, i1: edge.u, i2: i });
        }
      }
    }
  }

  // Filter out super-triangle vertices, degenerate sliver triangles, and edges > maxTriangleEdgeLength
  const effectiveMaxEdge = maxTriangleEdgeLength > 0 ? maxTriangleEdgeLength : Infinity;
  const validTriangles: TerrainTINTriangle[] = [];
  const boundaryEdgeCounts = new Map<string, { u: number; v: number; count: number }>();

  for (const t of triangles) {
    if (t.i0 >= n || t.i1 >= n || t.i2 >= n) continue;
    const v0 = activePoints[t.i0];
    const v1 = activePoints[t.i1];
    const v2 = activePoints[t.i2];

    const e01 = Math.hypot(v1.x - v0.x, v1.y - v0.y);
    const e12 = Math.hypot(v2.x - v1.x, v2.y - v1.y);
    const e20 = Math.hypot(v0.x - v2.x, v0.y - v2.y);

    if (e01 > effectiveMaxEdge || e12 > effectiveMaxEdge || e20 > effectiveMaxEdge) {
      continue; // Pruned to prevent misleading extrapolation across large data gaps
    }

    const doubleArea = Math.abs((v1.x - v0.x) * (v2.y - v0.y) - (v1.y - v0.y) * (v2.x - v0.x));
    const area2D = doubleArea / 2;
    if (area2D < 1e-4) continue;

    // Compute exact 3D plane gradient (dz/dx, dz/dy)
    // Plane equation: z - z0 = gx*(x - x0) + gy*(y - y0)
    const ux = v1.x - v0.x;
    const uy = v1.y - v0.y;
    const uz = v1.z - v0.z;
    const vx = v2.x - v0.x;
    const vy = v2.y - v0.y;
    const vz = v2.z - v0.z;

    const detXY = ux * vy - uy * vx;
    if (Math.abs(detXY) < 1e-7) continue;

    const dzdx = (uz * vy - uy * vz) / detXY;
    const dzdy = (ux * vz - uz * vx) / detXY;
    const gradMag = Math.hypot(dzdx, dzdy);
    const slopePercent = Number((gradMag * 100).toFixed(2));
    const slopeDegrees = Number(((Math.atan(gradMag) * 180) / Math.PI).toFixed(2));

    // Downslope vector is (-dzdx, -dzdy). Note: in Plotify 2D coordinates, +X is East, +Y is South (-North).
    // Downslope North component = +dzdy, Downslope East component = -dzdx.
    let aspectDegrees = 0;
    if (gradMag > 1e-5) {
      const downEast = -dzdx;
      const downNorth = dzdy;
      const deg = (Math.atan2(downEast, downNorth) * 180) / Math.PI;
      aspectDegrees = Number(((deg + 360) % 360).toFixed(1));
    }

    validTriangles.push({
      id: `tin-tri-${validTriangles.length + 1}`,
      v0Index: t.i0,
      v1Index: t.i1,
      v2Index: t.i2,
      centroidX: Number(((v0.x + v1.x + v2.x) / 3).toFixed(3)),
      centroidY: Number(((v0.y + v1.y + v2.y) / 3).toFixed(3)),
      centroidZ: Number(((v0.z + v1.z + v2.z) / 3).toFixed(3)),
      area2D: Number(area2D.toFixed(3)),
      slopePercent,
      slopeDegrees,
      aspectDegrees,
    });

    const addBEdge = (u: number, v: number) => {
      const a = Math.min(u, v);
      const b = Math.max(u, v);
      const k = `${a}:${b}`;
      const ex = boundaryEdgeCounts.get(k);
      if (ex) ex.count++;
      else boundaryEdgeCounts.set(k, { u, v, count: 1 });
    };
    addBEdge(t.i0, t.i1);
    addBEdge(t.i1, t.i2);
    addBEdge(t.i2, t.i0);
  }

  if (validTriangles.length === 0) {
    return null;
  }

  // Extract derived contour segments by slicing TIN triangles at multiples of contourInterval
  const derivedContours: DerivedContourSegment[] = [];
  const effInterval = contourInterval > 0.05 ? contourInterval : unit === 'feet' ? 1.0 : 0.5;
  const startElev = Math.ceil(bounds.minZ / effInterval) * effInterval;
  const endElev = Math.floor(bounds.maxZ / effInterval) * effInterval;

  if (endElev >= startElev && (endElev - startElev) / effInterval <= 200) {
    for (let elev = startElev; elev <= endElev + 1e-6; elev += effInterval) {
      const level = Number(elev.toFixed(3));
      const idxStep = Math.round(level / effInterval);
      const isMajor = idxStep % 5 === 0;

      for (const tri of validTriangles) {
        const p0 = activePoints[tri.v0Index];
        const p1 = activePoints[tri.v1Index];
        const p2 = activePoints[tri.v2Index];

        const minTriZ = Math.min(p0.z, p1.z, p2.z);
        const maxTriZ = Math.max(p0.z, p1.z, p2.z);
        if (level < minTriZ || level > maxTriZ || maxTriZ - minTriZ < 1e-5) continue;

        const pts: Array<{ x: number; y: number }> = [];
        const checkEdge = (a: CalibratedTerrainPoint, b: CalibratedTerrainPoint) => {
          if ((a.z <= level && b.z >= level) || (b.z <= level && a.z >= level)) {
            const dz = b.z - a.z;
            if (Math.abs(dz) < 1e-6) return;
            const t = (level - a.z) / dz;
            if (t >= 0 && t <= 1) {
              pts.push({
                x: Number((a.x + t * (b.x - a.x)).toFixed(3)),
                y: Number((a.y + t * (b.y - a.y)).toFixed(3)),
              });
            }
          }
        };
        checkEdge(p0, p1);
        checkEdge(p1, p2);
        checkEdge(p2, p0);

        if (pts.length >= 2) {
          const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
          if (dist > 1e-3) {
            derivedContours.push({
              elevation: level,
              isMajor,
              x1: pts[0].x,
              y1: pts[0].y,
              x2: pts[1].x,
              y2: pts[1].y,
            });
          }
        }
      }
    }
  }

  // Compute convex/outer hull boundary points for display
  const hullVertIndices = new Set<number>();
  for (const e of boundaryEdgeCounts.values()) {
    if (e.count === 1) {
      hullVertIndices.add(e.u);
      hullVertIndices.add(e.v);
    }
  }
  const hullPts = Array.from(hullVertIndices).map((idx) => ({
    x: activePoints[idx].x,
    y: activePoints[idx].y,
  }));
  const cx = hullPts.reduce((s, p) => s + p.x, 0) / Math.max(1, hullPts.length);
  const cy = hullPts.reduce((s, p) => s + p.y, 0) / Math.max(1, hullPts.length);
  hullPts.sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));

  const tempMesh: TerrainSurfaceMesh = {
    method: 'bowyer-watson-delaunay-tin-v1',
    generatedAt: new Date().toISOString(),
    unit,
    vertices: activePoints,
    triangles: validTriangles,
    derivedContours,
    hullBoundary: hullPts,
    bounds,
    plotCoverageRatio: 0,
    hasGapsWithinPlot: false,
  };

  // Sample a 16x16 grid over the project plot (0..plotWidth, 0..plotLength) to measure actual TIN coverage
  const gridN = 16;
  let coveredSamples = 0;
  const totalSamples = gridN * gridN;
  for (let gx = 0; gx < gridN; gx++) {
    for (let gy = 0; gy < gridN; gy++) {
      const sx = ((gx + 0.5) / gridN) * plotWidth;
      const sy = ((gy + 0.5) / gridN) * plotLength;
      if (interpolateElevationOnTIN(tempMesh, sx, sy) !== null) {
        coveredSamples++;
      }
    }
  }

  tempMesh.plotCoverageRatio = Number((coveredSamples / totalSamples).toFixed(3));
  tempMesh.hasGapsWithinPlot = tempMesh.plotCoverageRatio < 0.85;

  return tempMesh;
}

/**
 * Evaluates exact planar interpolated elevation at (x, y) inside the TIN.
 * Returns `null` if (x, y) is outside the triangulated surface or in a pruned gap.
 */
export function interpolateElevationOnTIN(
  surfaceMesh: TerrainSurfaceMesh | null,
  x: number,
  y: number
): number | null {
  if (!surfaceMesh || surfaceMesh.triangles.length === 0) return null;

  const verts = surfaceMesh.vertices;
  const eps = -1e-4;

  for (const tri of surfaceMesh.triangles) {
    const p0 = verts[tri.v0Index];
    const p1 = verts[tri.v1Index];
    const p2 = verts[tri.v2Index];

    const minX = Math.min(p0.x, p1.x, p2.x) - 0.01;
    const maxX = Math.max(p0.x, p1.x, p2.x) + 0.01;
    const minY = Math.min(p0.y, p1.y, p2.y) - 0.01;
    const maxY = Math.max(p0.y, p1.y, p2.y) + 0.01;
    if (x < minX || x > maxX || y < minY || y > maxY) continue;

    const denom = (p1.y - p2.y) * (p0.x - p2.x) + (p2.x - p1.x) * (p0.y - p2.y);
    if (Math.abs(denom) < 1e-8) continue;

    const w0 = ((p1.y - p2.y) * (x - p2.x) + (p2.x - p1.x) * (y - p2.y)) / denom;
    const w1 = ((p2.y - p0.y) * (x - p2.x) + (p0.x - p2.x) * (y - p2.y)) / denom;
    const w2 = 1.0 - w0 - w1;

    if (w0 >= eps && w1 >= eps && w2 >= eps) {
      return Number((w0 * p0.z + w1 * p1.z + w2 * p2.z).toFixed(4));
    }
  }

  return null;
}

export function computeTerrainSectionProfile(
  surfaceMesh: TerrainSurfaceMesh | null,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  label: string,
  unit: MeasurementUnit,
  sampleCount = 25
): TerrainSectionProfile {
  const totalLength = Number(Math.hypot(endX - startX, endY - startY).toFixed(2));
  const samples: TerrainSectionProfileSample[] = [];
  let minElevation: number | null = null;
  let maxElevation: number | null = null;
  let gapCount = 0;

  const n = Math.max(2, sampleCount);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const x = Number((startX + t * (endX - startX)).toFixed(3));
    const y = Number((startY + t * (endY - startY)).toFixed(3));
    const dist = Number((t * totalLength).toFixed(2));
    const elev = interpolateElevationOnTIN(surfaceMesh, x, y);

    if (elev === null) {
      gapCount++;
      samples.push({
        distanceAlongSection: dist,
        x,
        y,
        elevation: null,
        isGap: true,
      });
    } else {
      if (minElevation === null || elev < minElevation) minElevation = elev;
      if (maxElevation === null || elev > maxElevation) maxElevation = elev;
      samples.push({
        distanceAlongSection: dist,
        x,
        y,
        elevation: elev,
        isGap: false,
      });
    }
  }

  return {
    label,
    startX,
    startY,
    endX,
    endY,
    totalLength,
    unit,
    samples,
    minElevation,
    maxElevation,
    gapCount,
  };
}

// ============================================================================
// 6. FULL TERRAIN EVALUATION & TOPOGRAPHIC ANALYSIS ENGINE
// ============================================================================

function degreesToCardinal(deg: number | null): TerrainAnalysisSummary['dominantAspectCardinal'] {
  if (deg === null || !Number.isFinite(deg)) return 'Unassessed';
  const normalized = ((deg % 360) + 360) % 360;
  const dirs: Array<'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW'> = [
    'N',
    'NE',
    'E',
    'SE',
    'S',
    'SW',
    'W',
    'NW',
  ];
  return dirs[Math.round(normalized / 45) % 8];
}

export function evaluateTerrainModelForProject(
  dataset: TerrainDatasetModel,
  calibration: TerrainAlignmentAndCalibration,
  project: Project | null,
  fallbackUnit: MeasurementUnit = 'metres'
): TerrainModelingResult {
  const warnings: TerrainImportWarning[] = [...dataset.warnings];
  const errors: TerrainImportError[] = [...dataset.errors];
  const targetUnit = project?.unit || fallbackUnit;
  const plotWidth = project?.plotWidth || (targetUnit === 'feet' ? 60 : 20);
  const plotLength = project?.plotLength || (targetUnit === 'feet' ? 80 : 25);

  if (!calibration.userConfirmedUnitsAndCRS) {
    errors.push({
      id: 'err-confirm-crs-units',
      code: 'CONFIRMATION_REQUIRED_FOR_UNITS_OR_CRS',
      message:
        'You must explicitly confirm the horizontal coordinate reference system (CRS) and measurement units before generating or applying the terrain model.',
      fatal: true,
    });
  }

  if (!calibration.userConfirmedVerticalDatum) {
    errors.push({
      id: 'err-confirm-datum',
      code: 'CONFIRMATION_REQUIRED_FOR_DATUM',
      message:
        'You must explicitly confirm the source vertical datum / height reference before generating or applying the terrain model.',
      fatal: true,
    });
  }

  if (
    !Number.isFinite(calibration.maxTriangleEdgeLength) ||
    calibration.maxTriangleEdgeLength <= 0 ||
    !Number.isFinite(calibration.contourInterval) ||
    calibration.contourInterval <= 0
  ) {
    errors.push({
      id: 'err-invalid-cal-params',
      code: 'INVALID_CALIBRATION_PARAMETERS',
      message:
        'Max triangle edge length and contour interval must be positive finite numbers.',
      fatal: true,
    });
  }

  const hFactor =
    calibration.horizontalCRS === 'WGS84_GEOGRAPHIC_LON_LAT'
      ? targetUnit === 'metres'
        ? 1.0
        : 1 / 0.3048
      : getLinearUnitToProjectFactor(calibration.horizontalUnit, targetUnit);

  const vFactor = getLinearUnitToProjectFactor(calibration.verticalUnit, targetUnit);
  const excludedSet = new Set(calibration.excludedPointIds || []);

  const refLon =
    calibration.wgs84ReferenceLon ?? dataset.rawExtents?.minX ?? 0;
  const refLat =
    calibration.wgs84ReferenceLat ?? dataset.rawExtents?.minY ?? 0;

  // Step 1: Convert source horizontal coordinates to target linear unit before origin shift
  const preShiftedPoints = dataset.sourcePoints.map((sp) => {
    let linX = 0;
    let linY = 0;
    if (calibration.horizontalCRS === 'WGS84_GEOGRAPHIC_LON_LAT') {
      const proj = projectWGS84LonLatToLocalMetres(sp.rawX, sp.rawY, refLon, refLat);
      linX = proj.eastMetres * hFactor;
      // Note: In Plotify 2D plan coordinates, Y increases Southward from top-left (0,0),
      // or we map Northing into [0..plotLength] cleanly. Let's map local Northing to Y:
      linY = proj.northMetres * hFactor;
    } else {
      linX = sp.rawX * hFactor;
      linY = sp.rawY * hFactor;
    }
    const linZ = sp.rawZ * vFactor + (calibration.verticalOffsetInTargetUnit || 0);
    return {
      sp,
      linX,
      linY,
      linZ,
    };
  });

  // Step 2: Determine horizontal origin offset
  let originOffsetX = 0;
  let originOffsetY = 0;
  if (calibration.alignmentMode === 'align-min-extents-to-plot-origin' && preShiftedPoints.length > 0) {
    const minLinX = Math.min(...preShiftedPoints.map((p) => p.linX));
    const minLinY = Math.min(...preShiftedPoints.map((p) => p.linY));
    originOffsetX = Number((-minLinX).toFixed(4));
    originOffsetY = Number((-minLinY).toFixed(4));
  } else if (calibration.alignmentMode === 'manual-origin-offset') {
    originOffsetX = Number((-(calibration.manualOriginSourceX * hFactor)).toFixed(4));
    originOffsetY = Number((-(calibration.manualOriginSourceY * hFactor)).toFixed(4));
  }

  const calibratedPoints: CalibratedTerrainPoint[] = preShiftedPoints.map(({ sp, linX, linY, linZ }) => {
    const x = Number((linX + originOffsetX).toFixed(3));
    const y = Number((linY + originOffsetY).toFixed(3));
    const z = Number(linZ.toFixed(3));
    const isInsidePlot = x >= -0.01 && x <= plotWidth + 0.01 && y >= -0.01 && y <= plotLength + 0.01;
    return {
      id: sp.id,
      sourceId: sp.id,
      x,
      y,
      z,
      rawX: sp.rawX,
      rawY: sp.rawY,
      rawZ: sp.rawZ,
      classification: sp.classification,
      isInsidePlot,
      isExcluded: excludedSet.has(sp.id),
    };
  });

  const calibratedContours = dataset.sourceContours.map((sc) => ({
    id: sc.id,
    elevation: Number((sc.elevation * vFactor + (calibration.verticalOffsetInTargetUnit || 0)).toFixed(3)),
    vertices: sc.vertices.map((v) => {
      let lx = v.rawX * hFactor;
      let ly = v.rawY * hFactor;
      if (calibration.horizontalCRS === 'WGS84_GEOGRAPHIC_LON_LAT') {
        const proj = projectWGS84LonLatToLocalMetres(v.rawX, v.rawY, refLon, refLat);
        lx = proj.eastMetres * hFactor;
        ly = proj.northMetres * hFactor;
      }
      return {
        x: Number((lx + originOffsetX).toFixed(3)),
        y: Number((ly + originOffsetY).toFixed(3)),
        z: Number((v.rawZ * vFactor + (calibration.verticalOffsetInTargetUnit || 0)).toFixed(3)),
      };
    }),
  }));

  const activePoints = calibratedPoints.filter((p) => !p.isExcluded);
  const pointsInsidePlotCount = activePoints.filter((p) => p.isInsidePlot).length;

  let surfaceMesh: TerrainSurfaceMesh | null = null;
  let surfaceBlockedReason: string | undefined;

  if (errors.some((e) => e.fatal)) {
    surfaceBlockedReason = errors.find((e) => e.fatal)?.message;
  } else if (activePoints.length < 3) {
    surfaceBlockedReason = `Insufficient active points (${activePoints.length}); at least 3 non-collinear points are required.`;
  } else if (!hasThreeNonCollinearPoints(activePoints)) {
    surfaceBlockedReason = 'Active elevation points are collinear; cannot triangulate a 2D surface.';
  } else {
    surfaceMesh = generateDelaunayTIN(
      calibratedPoints,
      targetUnit,
      plotWidth,
      plotLength,
      calibration.maxTriangleEdgeLength,
      calibration.contourInterval
    );
    if (!surfaceMesh) {
      surfaceBlockedReason =
        'No valid triangles remained after applying the maximum edge-length gap filter. Increase maxTriangleEdgeLength or provide denser elevation coverage.';
    }
  }

  if (surfaceMesh && surfaceMesh.plotCoverageRatio < 0.7) {
    warnings.push({
      id: 'warn-sparse-plot-coverage',
      code: 'SPARSE_OR_PARTIAL_SITE_COVERAGE',
      severity: 'warning',
      message: `Triangulated terrain surface covers ${(surfaceMesh.plotCoverageRatio * 100).toFixed(1)}% of the ${plotWidth}×${plotLength} ${targetUnit === 'feet' ? 'ft' : 'm'} plot envelope. Uncovered zones are left blank rather than extrapolated.`,
    });
  }

  // Compute Topographic Analysis Summary
  const zVals = activePoints.map((p) => p.z);
  const minElevation = zVals.length > 0 ? Number(Math.min(...zVals).toFixed(3)) : 0;
  const maxElevation = zVals.length > 0 ? Number(Math.max(...zVals).toFixed(3)) : 0;
  const meanElevation =
    zVals.length > 0
      ? Number((zVals.reduce((a, b) => a + b, 0) / zVals.length).toFixed(3))
      : 0;
  const elevationRelief = Number((maxElevation - minElevation).toFixed(3));

  let meanSlopePercent = 0;
  let meanSlopeDegrees = 0;
  let maxSlopePercent = 0;
  let maxSlopeDegrees = 0;
  let dominantAspectDegrees: number | null = null;
  let dominantAspectCardinal: TerrainAnalysisSummary['dominantAspectCardinal'] = 'Unassessed';

  if (surfaceMesh && surfaceMesh.triangles.length > 0) {
    let totalArea = 0;
    let weightedSlopePct = 0;
    let weightedSlopeDeg = 0;
    let sinSum = 0;
    let cosSum = 0;
    let slopedArea = 0;

    for (const tri of surfaceMesh.triangles) {
      totalArea += tri.area2D;
      weightedSlopePct += tri.slopePercent * tri.area2D;
      weightedSlopeDeg += tri.slopeDegrees * tri.area2D;
      if (tri.slopePercent > maxSlopePercent) maxSlopePercent = tri.slopePercent;
      if (tri.slopeDegrees > maxSlopeDegrees) maxSlopeDegrees = tri.slopeDegrees;

      if (tri.slopePercent > 0.5) {
        const rad = (tri.aspectDegrees * Math.PI) / 180;
        sinSum += Math.sin(rad) * tri.area2D;
        cosSum += Math.cos(rad) * tri.area2D;
        slopedArea += tri.area2D;
      }
    }

    if (totalArea > 0) {
      meanSlopePercent = Number((weightedSlopePct / totalArea).toFixed(2));
      meanSlopeDegrees = Number((weightedSlopeDeg / totalArea).toFixed(2));
    }

    if (slopedArea > 0) {
      const avgDeg = ((Math.atan2(sinSum, cosSum) * 180) / Math.PI + 360) % 360;
      dominantAspectDegrees = Number(avgDeg.toFixed(1));
      dominantAspectCardinal = degreesToCardinal(dominantAspectDegrees);
    } else {
      dominantAspectCardinal = 'Flat';
    }
  }

  // Evaluate ground elevations under Ground Floor (Floor 1) building rooms
  const groundRooms = (project?.floorPlan?.rooms || []).filter((r) => (r.floorLevel || 1) === 1);
  let totalCornersChecked = 0;
  let coveredCornersCount = 0;
  let uncoveredCornersCount = 0;
  let minGroundElev: number | null = null;
  let maxGroundElev: number | null = null;

  for (const room of groundRooms) {
    const corners = [
      { x: room.x, y: room.y },
      { x: room.x + room.width, y: room.y },
      { x: room.x + room.width, y: room.y + room.length },
      { x: room.x, y: room.y + room.length },
    ];
    for (const c of corners) {
      totalCornersChecked++;
      const gz = interpolateElevationOnTIN(surfaceMesh, c.x, c.y);
      if (gz === null) {
        uncoveredCornersCount++;
      } else {
        coveredCornersCount++;
        if (minGroundElev === null || gz < minGroundElev) minGroundElev = gz;
        if (maxGroundElev === null || gz > maxGroundElev) maxGroundElev = gz;
      }
    }
  }

  const primarySectionWestEast = computeTerrainSectionProfile(
    surfaceMesh,
    0,
    plotLength / 2,
    plotWidth,
    plotLength / 2,
    'Section A–A (West to East Mid-Plot)',
    targetUnit,
    25
  );

  const primarySectionNorthSouth = computeTerrainSectionProfile(
    surfaceMesh,
    plotWidth / 2,
    0,
    plotWidth / 2,
    plotLength,
    'Section B–B (North to South Mid-Plot)',
    targetUnit,
    25
  );

  const analysis: TerrainAnalysisSummary = {
    unit: targetUnit,
    validPointCount: activePoints.length,
    excludedPointCount: calibratedPoints.length - activePoints.length,
    pointsInsidePlotCount,
    surfaceGenerated: Boolean(surfaceMesh),
    surfaceBlockedReason,
    minElevation,
    maxElevation,
    meanElevation,
    elevationRelief,
    meanSlopePercent,
    meanSlopeDegrees,
    maxSlopePercent,
    maxSlopeDegrees,
    dominantAspectDegrees,
    dominantAspectCardinal,
    plotCoveragePercent: surfaceMesh ? Number((surfaceMesh.plotCoverageRatio * 100).toFixed(1)) : 0,
    buildingFootprintRelief: {
      hasGroundFloorRooms: groundRooms.length > 0,
      totalCornersChecked,
      coveredCornersCount,
      uncoveredCornersCount,
      minGroundElevationUnderBuilding: minGroundElev,
      maxGroundElevationUnderBuilding: maxGroundElev,
      footprintLevelDifference:
        minGroundElev !== null && maxGroundElev !== null
          ? Number((maxGroundElev - minGroundElev).toFixed(3))
          : null,
    },
    primarySectionWestEast,
    primarySectionNorthSouth,
    methodologyAndLimitations: [
      `Surface generated via 2D Bowyer-Watson Delaunay Triangulation (TIN) with max-edge gap filter (${calibration.maxTriangleEdgeLength} ${targetUnit === 'feet' ? 'ft' : 'm'}).`,
      'Triangle slope (%) = 100 × √((∂z/∂x)² + (∂z/∂y)²); mean slope is area-weighted across valid TIN triangles.',
      'Preliminary architectural site model only — not a licensed land survey, geotechnical stability analysis, or civil grading/drainage design.',
    ],
  };

  const crsTransformationUsed =
    calibration.horizontalCRS === 'WGS84_GEOGRAPHIC_LON_LAT'
      ? `WGS 84 Ellipsoidal Local Tangent Plane around (${refLon.toFixed(6)}°, ${refLat.toFixed(6)}°)`
      : `${calibration.horizontalCRS} (${calibration.horizontalUnit} → ${targetUnit}, scale ×${hFactor.toFixed(5)})`;

  return {
    success: !errors.some((e) => e.fatal),
    targetUnit,
    calibratedPoints,
    calibratedContours,
    surfaceMesh,
    analysis,
    appliedTransformSummary: {
      horizontalScaleFactor: Number(hFactor.toFixed(6)),
      verticalScaleFactor: Number(vFactor.toFixed(6)),
      originOffsetX,
      originOffsetY,
      verticalOffset: calibration.verticalOffsetInTargetUnit || 0,
      crsTransformationUsed,
    },
    warnings,
    errors,
  };
}

// ============================================================================
// 7. SAFE APPLICATION & REMOVAL ON PROJECTS (WITH ROLLBACK CHECKPOINTS)
// ============================================================================

export function applyTerrainModelToProject(
  existingProject: Project,
  dataset: TerrainDatasetModel,
  calibration: TerrainAlignmentAndCalibration,
  modelingResult: TerrainModelingResult,
  displaySettings?: Partial<ProjectTerrainModelingMetadata['displaySettings']>
): {
  updatedProject: Project;
  safetySnapshotId: string;
} {
  if (!existingProject || !existingProject.id) {
    throw new Error('Cannot apply terrain model: invalid target project.');
  }
  if (!modelingResult.success) {
    const fatalMsg =
      modelingResult.errors.find((e) => e.fatal)?.message || 'Invalid terrain modeling state.';
    throw new Error(`Cannot apply terrain model with unresolved errors: ${fatalMsg}`);
  }

  // 1. Create automatic rollback checkpoint in version history
  const snapshot = createProjectSnapshot(existingProject, {
    trigger: 'pre-restore-safety',
    label: `Pre-Terrain Model Checkpoint (${dataset.fileName})`,
    description:
      'Automatic safety snapshot captured before applying P43 Terrain & Topographic Site Modeling.',
  });

  // 2. Cap stored points to MAX_PERSISTED_TERRAIN_POINTS to protect storage quota
  const persistedPoints = modelingResult.calibratedPoints.slice(0, MAX_PERSISTED_TERRAIN_POINTS);

  const terrainMetadata: ProjectTerrainModelingMetadata = {
    version: 'plotify-terrain-meta-v1',
    datasetId: `terrain-${Date.now()}`,
    appliedAt: new Date().toISOString(),
    sourceFileName: dataset.fileName,
    sourceFormat:
      dataset.detectedFormat === 'GEOJSON-TOPOGRAPHY'
        ? 'GEOJSON-TOPOGRAPHY'
        : 'CSV-ELEVATION-POINTS',
    sourceChecksum: dataset.fileChecksum,
    sourcePointCount: dataset.sourcePoints.length,
    sourceContourCount: dataset.sourceContours.length,
    calibration,
    appliedTransformSummary: modelingResult.appliedTransformSummary,
    calibratedPoints: persistedPoints,
    surfaceMesh: modelingResult.surfaceMesh,
    analysis: modelingResult.analysis,
    warnings: modelingResult.warnings,
    displaySettings: {
      showSurfaceIn3D: displaySettings?.showSurfaceIn3D ?? true,
      showContoursIn2D: displaySettings?.showContoursIn2D ?? true,
      showElevationPoints: displaySettings?.showElevationPoints ?? true,
      verticalExaggerationDisplayOnly:
        displaySettings?.verticalExaggerationDisplayOnly ?? 1.0,
    },
  };

  // Preserve all existing project domains (including ifcInterop, cadInterop, floorPlan, structuralCoordination, etc.)
  const updatedProject: Project = {
    ...existingProject,
    terrainModeling: terrainMetadata,
    updatedAt: new Date().toISOString(),
  };

  return {
    updatedProject,
    safetySnapshotId: snapshot.id,
  };
}

export function removeTerrainModelFromProject(existingProject: Project): {
  updatedProject: Project;
  safetySnapshotId: string;
} {
  if (!existingProject || !existingProject.id) {
    throw new Error('Invalid project.');
  }

  const snapshot = createProjectSnapshot(existingProject, {
    trigger: 'pre-restore-safety',
    label: 'Pre-Terrain Removal Safety Checkpoint',
    description: 'Automatic safety snapshot captured before removing P43 Terrain model.',
  });

  const cloned: Project = {
    ...existingProject,
    updatedAt: new Date().toISOString(),
  };
  delete cloned.terrainModeling;

  return {
    updatedProject: cloned,
    safetySnapshotId: snapshot.id,
  };
}

// ============================================================================
// 8. BUILT-IN VERIFICATION & SAMPLE TERRAIN FIXTURES
// ============================================================================

export const SAMPLE_TERRAIN_CSV_HILLSIDE_METRIC = `# Plotify Topographic Survey Spot Elevations
# CRS: PROJECT_LOCAL
# UNIT: METRE
# DATUM: LOCAL_SURVEY_BENCHMARK
point_id,easting,northing,elevation,classification
BM-01,0.0,0.0,100.00,benchmark
SP-02,10.0,0.0,100.65,natural-ground
SP-03,20.0,0.0,101.35,natural-ground
SP-04,0.0,12.5,100.80,natural-ground
SP-05,10.0,12.5,101.55,building-pad-area
SP-06,20.0,12.5,102.30,natural-ground
SP-07,0.0,25.0,101.60,natural-ground
SP-08,10.0,25.0,102.40,natural-ground
SP-09,20.0,25.0,103.20,ridge-crest
`;

export const SAMPLE_TERRAIN_CSV_AMBIGUOUS_WITH_ANOMALIES = `id,x,y,z,notes
P1,5000.0,2000.0,45.2,corner_sw
P2,5015.0,2000.0,45.8,edge_s
P3,5030.0,2000.0,46.4,corner_se
P4,5000.0,2020.0,45.9,edge_w
P5,5015.0,2020.0,46.5,center
P5_DUP,5015.0,2020.0,46.5,duplicate_xy_point
P6,5030.0,2020.0,47.1,edge_e
P7,5000.0,2040.0,46.6,corner_nw
P8,5015.0,2040.0,47.2,edge_n
P9,5030.0,2040.0,47.9,corner_ne
P10_SPIKE,5010.0,2010.0,185.0,erroneous_rod_spike
P11_BAD,5020.0,2010.0,NaN,missing_elevation
`;

export const SAMPLE_TERRAIN_GEOJSON_WGS84 = JSON.stringify(
  {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        id: 'G-01',
        properties: { classification: 'gps-corner-sw' },
        geometry: { type: 'Point', coordinates: [-122.4194, 37.7749, 32.0] },
      },
      {
        type: 'Feature',
        id: 'G-02',
        properties: { classification: 'gps-corner-se' },
        geometry: { type: 'Point', coordinates: [-122.41915, 37.7749, 33.1] },
      },
      {
        type: 'Feature',
        id: 'G-03',
        properties: { classification: 'gps-corner-nw' },
        geometry: { type: 'Point', coordinates: [-122.4194, 37.77515, 33.4] },
      },
      {
        type: 'Feature',
        id: 'G-04',
        properties: { classification: 'gps-corner-ne' },
        geometry: { type: 'Point', coordinates: [-122.41915, 37.77515, 34.6] },
      },
      {
        type: 'Feature',
        id: 'G-CONTOUR-33',
        properties: { elevation: 33.2, label: '33.2m Contour' },
        geometry: {
          type: 'LineString',
          coordinates: [
            [-122.41938, 37.77502, 33.2],
            [-122.41928, 37.77502, 33.2],
            [-122.41918, 37.77502, 33.2],
          ],
        },
      },
    ],
  },
  null,
  2
);

export const SAMPLE_TERRAIN_FIXTURES = [
  {
    id: 'csv-hillside-metric',
    label: 'CSV (Explicit Metres & Local Benchmark) — 9-Point Gently Sloping Hillside Grid',
    fileName: 'hillside_survey_metric.csv',
    content: SAMPLE_TERRAIN_CSV_HILLSIDE_METRIC,
  },
  {
    id: 'csv-ambiguous-anomalies',
    label: 'CSV (Ambiguous Units/CRS + Duplicate Point + Z Spike Outlier + Missing Row)',
    fileName: 'uncalibrated_raw_survey.csv',
    content: SAMPLE_TERRAIN_CSV_AMBIGUOUS_WITH_ANOMALIES,
  },
  {
    id: 'geojson-wgs84-contours',
    label: 'GeoJSON (RFC 7946 WGS 84 Lon/Lat Degrees + 3D Contour LineString)',
    fileName: 'wgs84_site_topography.geojson',
    content: SAMPLE_TERRAIN_GEOJSON_WGS84,
  },
];
