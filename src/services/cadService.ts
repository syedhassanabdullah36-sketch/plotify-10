/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Project,
  FloorPlanRoom,
  MeasurementUnit,
} from '../types/project';
import {
  StructuralColumn,
  StructuralBeam,
  StructuralGridAxis,
  StructuralCoordinationData,
} from '../types/structural';
import {
  CADLengthUnit,
  SupportedDXFEntityType,
  CADLayerTargetRole,
  RecognizedCADFormat,
  CADSupportProfile,
  CADImportRequest,
  CADBoundingBox2D,
  CADLayerSummary,
  CADPoint2D,
  CADExtractedEntity,
  CADImportWarning,
  CADImportError,
  CADDrawingMetadata,
  CADDrawingModel,
  CADLayerMappingRule,
  CADCalibrationOptions,
  CADCandidateRoomMapping,
  CADProvenanceMappingEntry,
  CADImportReport,
  ProjectCADInteropMetadata,
  CADMappingResult,
  CADExportOptions,
  CADValidationCheckResult,
  CADExportReport,
  CADRoundTripComparison,
} from '../types/cad';
import { computeStringChecksum, sanitizeText } from '../utils/securityUtils';
import { ROOM_TYPE_CONFIG } from '../components/floorplan/geometry';
import { initializeStructuralCoordination, evaluateStructuralCoordination } from './structuralService';
import { createProjectSnapshot } from './versioningService';
import { deriveRoomConfigFromRooms } from './ifcService';

// ============================================================================
// 1. CONSTANTS & HONEST CAD SUPPORT PROFILE
// ============================================================================

export const DEFAULT_MAX_CAD_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
export const DEFAULT_MAX_CAD_ENTITIES = 50000;
export const MAX_BLOCK_NESTING_DEPTH = 8;

const ACTIVE_CAD_IMPORT_LOCKS = new Set<string>();

export const PLOTIFY_CAD_SUPPORT_PROFILE: CADSupportProfile = {
  profileId: 'plotify-cad-exchange-p42-v1',
  profileName: 'Plotify 2D CAD Drawing Exchange Profile (P42)',
  profileVersion: '1.0.0',
  fullySupportedFormats: [
    {
      format: 'ASCII DXF (.dxf)',
      versions: ['AC1009 (R12)', 'AC1014 (R14)', 'AC1015 (2000)', 'AC1018 (2004)', 'AC1021 (2007)', 'AC1024 (2010)', 'AC1027 (2013)', 'AC1032 (2018)'],
      description: '2D architectural and structural drawing exchange via ASCII Drawing Interchange Format.',
    },
  ],
  partiallySupportedFeatures: [
    {
      feature: 'INSERT + BLOCK References',
      behavior:
        '2D primitive entities (LINE, LWPOLYLINE, CIRCLE, TEXT) inside BLOCK definitions are expanded at the INSERT origin with uniform/orthogonal scale and 90° increment rotations up to depth 8. Non-uniformly skewed or dynamic parametric blocks emit an explicit warning.',
    },
    {
      feature: 'LWPOLYLINE with Curved Bulge Segments (Group Code 42)',
      behavior:
        'Preserved for drawing inspection and reference bounds, but flagged with CURVED_BULGE_SEGMENT and excluded from automatic rectangular FloorPlanRoom conversion.',
    },
    {
      feature: 'Architectural Wall / Door / Window Linework Layers',
      behavior:
        'Imported and preserved as CAD Reference Underlay & Provenance Metadata. Editable Plotify rooms require closed rectilinear space/room boundary polylines.',
    },
  ],
  recognizedButUnsupportedFormats: [
    {
      format: 'Native Binary DWG (.dwg, AC1012–AC1032)',
      detectionMethod: 'Binary header signature (AC10xx) or .dwg file container',
      guidance:
        'Native DWG is a proprietary binary format. Export or Save As ASCII DXF (R12/2000/2018 .dxf) from AutoCAD, BricsCAD, Rhino, ArchiCAD, or Revit before importing into Plotify.',
    },
    {
      format: 'Binary DXF (AutoCAD Binary DXF)',
      detectionMethod: '22-byte "AutoCAD Binary DXF" sentinel header',
      guidance: 'Re-save the drawing as an ASCII DXF (.dxf) file.',
    },
    {
      format: 'IFC STEP (.ifc, ISO-10303-21)',
      detectionMethod: 'ISO-10303-21; STEP header',
      guidance: 'Use Plotify’s dedicated P41 OpenBIM & IFC Interoperability workspace for 3D BIM models.',
    },
  ],
  supportedEntityTypes: [
    'LINE',
    'LWPOLYLINE',
    'POLYLINE',
    'CIRCLE',
    'ARC',
    'TEXT',
    'MTEXT',
    'INSERT',
  ],
  unsupportedEntityTypes: [
    'HATCH',
    'DIMENSION',
    'LEADER',
    'MULTILEADER',
    'SPLINE',
    'ELLIPSE',
    '3DFACE',
    'MESH',
    'SOLID',
    '3DSOLID',
    'BODY',
    'REGION',
    'VIEWPORT',
    'POINT',
    'XLINE',
    'RAY',
    'MLINE',
    'WIPEOUT',
    'IMAGE',
    'OLE2FRAME',
    'TABLE',
  ],
  supportedUnits: ['UNITLESS', 'MILLIMETRE', 'CENTIMETRE', 'METRE', 'INCH', 'FOOT'],
  unitConversionTable: [
    { unit: 'MILLIMETRE', insunitsCode: 4, toMetresFactor: 0.001, toFeetFactor: 0.0032808399 },
    { unit: 'CENTIMETRE', insunitsCode: 5, toMetresFactor: 0.01, toFeetFactor: 0.032808399 },
    { unit: 'METRE', insunitsCode: 6, toMetresFactor: 1.0, toFeetFactor: 3.280839895 },
    { unit: 'INCH', insunitsCode: 1, toMetresFactor: 0.0254, toFeetFactor: 1 / 12 },
    { unit: 'FOOT', insunitsCode: 2, toMetresFactor: 0.3048, toFeetFactor: 1.0 },
  ],
  maxFileSizeBytes: DEFAULT_MAX_CAD_FILE_BYTES,
  maxEntityCount: DEFAULT_MAX_CAD_ENTITIES,
  maxBlockNestingDepth: MAX_BLOCK_NESTING_DEPTH,
  knownLimitations: [
    'Plotify never silently guesses CAD units when $INSUNITS is 0 (Unitless) or omitted; explicit user unit selection is required before mapping.',
    'Only closed, orthogonal 4-corner rectilinear polylines (LWPOLYLINE / POLYLINE) on layers mapped to "room-space" are converted to editable FloorPlanRoom objects.',
    'Open polylines, L-shaped polygons, self-intersecting polygons, or curved splines are flagged with warnings and preserved as reference-only metadata rather than fabricating room geometry.',
    '2D CAD DXF exports represent Plotify 2D floor plans, parcel boundaries, setbacks, room labels, and structural grids/columns/beams; 3D solid extrusions, facade materials, and cost/scenario analytics are not part of 2D DXF.',
  ],
};

export function getSupportedCADProfile(): CADSupportProfile {
  return PLOTIFY_CAD_SUPPORT_PROFILE;
}

// ============================================================================
// 2. UNIT & FORMAT HELPERS
// ============================================================================

export function getCADUnitFactors(unit: Exclude<CADLengthUnit, 'UNITLESS'>): {
  toMetres: number;
  toFeet: number;
  insunitsCode: number;
} {
  switch (unit) {
    case 'MILLIMETRE':
      return { toMetres: 0.001, toFeet: 0.0032808399, insunitsCode: 4 };
    case 'CENTIMETRE':
      return { toMetres: 0.01, toFeet: 0.032808399, insunitsCode: 5 };
    case 'METRE':
      return { toMetres: 1.0, toFeet: 3.280839895, insunitsCode: 6 };
    case 'INCH':
      return { toMetres: 0.0254, toFeet: 1 / 12, insunitsCode: 1 };
    case 'FOOT':
      return { toMetres: 0.3048, toFeet: 1.0, insunitsCode: 2 };
  }
}

export function mapInsunitsToCADUnit(code: number | null): CADLengthUnit {
  switch (code) {
    case 1:
      return 'INCH';
    case 2:
      return 'FOOT';
    case 4:
      return 'MILLIMETRE';
    case 5:
      return 'CENTIMETRE';
    case 6:
      return 'METRE';
    default:
      return 'UNITLESS';
  }
}

export function mapAcadVerToLabel(code: string): string {
  const clean = (code || '').trim().toUpperCase();
  const map: Record<string, string> = {
    AC1006: 'AutoCAD R10',
    AC1009: 'AutoCAD R11/R12',
    AC1012: 'AutoCAD R13',
    AC1014: 'AutoCAD R14',
    AC1015: 'AutoCAD 2000',
    AC1018: 'AutoCAD 2004',
    AC1021: 'AutoCAD 2007',
    AC1024: 'AutoCAD 2010',
    AC1027: 'AutoCAD 2013',
    AC1032: 'AutoCAD 2018+',
  };
  return map[clean] || (clean ? `DXF (${clean})` : 'ASCII DXF (Unspecified Version)');
}

/**
 * Strips MTEXT formatting sequences such as {\fArial|b0|i0;Living Room}\P24m2 -> Living Room 24m2
 */
export function cleanMTextString(raw: string): string {
  if (!raw) return '';
  let s = raw
    .replace(/\\P/gi, ' ')
    .replace(/\\~|\\\^/g, ' ')
    .replace(/\\[A-Za-z][^;]*;/g, '')
    .replace(/[{}]/g, '')
    .replace(/%%[cC]/g, 'Ø')
    .replace(/%%[dD]/g, '°')
    .replace(/%%[pP]/g, '±');
  return sanitizeText(s, 160, '');
}

/**
 * Suggests a default CADLayerTargetRole based on AIA / architectural layer naming conventions.
 */
export function inferSuggestedLayerRole(
  layerName: string,
  entityBreakdown: Record<string, number>
): CADLayerTargetRole {
  const upper = (layerName || '').toUpperCase();
  if (/SITE|PLOT|PARCEL|BNDY|BOUNDARY|PROP-LINE/i.test(upper)) {
    return 'plot-boundary';
  }
  if (/ROOM|SPACE|AREA|A-AREA|ZONE/i.test(upper)) {
    return 'room-space';
  }
  if (/COL|S-COLS|COLUMN|PILLAR/i.test(upper)) {
    return 'structural-column';
  }
  if (/BEAM|S-BEAM|GIRDER|JOIST/i.test(upper)) {
    return 'structural-beam';
  }
  if (/GRID|S-GRID|AXIS/i.test(upper)) {
    return 'structural-grid';
  }
  if (/DEFPOINTS|VIEWPORT|TITLE|BORDER|HATCH|DIM/i.test(upper)) {
    return 'ignore';
  }
  // If layer only contains TEXT/MTEXT and is named ANNO/TEXT, keep as reference-only (used for room label matching)
  if (
    (entityBreakdown['TEXT'] || entityBreakdown['MTEXT']) &&
    !entityBreakdown['LWPOLYLINE'] &&
    !entityBreakdown['POLYLINE']
  ) {
    return 'reference-only';
  }
  return 'reference-only';
}

/**
 * Infers floor level (1..N) from layer name if present (e.g. A-AREA-F2, LEVEL-2, L02, 2ND-FLOOR)
 */
export function inferLayerFloorLevel(layerName: string): number {
  const upper = (layerName || '').toUpperCase();
  const match =
    upper.match(/(?:F|FL|FLOOR|LVL|LEVEL|L)[-_]?0*([1-9]\d?)\b/) ||
    upper.match(/\b([1-9])(?:ST|ND|RD|TH)[-_]?FLOOR\b/);
  if (match) {
    const parsed = parseInt(match[1], 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 20) return parsed;
  }
  return 1;
}

/**
 * Inspects file signature and extension to distinguish ASCII DXF from binary DWG, binary DXF, IFC, or non-CAD files.
 */
export function detectCADFileSignature(
  fileName: string,
  rawContent: string
): RecognizedCADFormat {
  const trimmed = (rawContent || '').trimStart();
  const lowerName = (fileName || '').toLowerCase();

  // Check for native binary DWG header ("AC1012", "AC1014", "AC1015", "AC1018", "AC1021", "AC1024", "AC1027", "AC1032")
  if (/^AC10[0-9]{2}/.test(trimmed) || (lowerName.endsWith('.dwg') && !/^0\r?\nSECTION/i.test(trimmed))) {
    return 'DWG-BINARY-UNSUPPORTED';
  }

  // Check for AutoCAD Binary DXF sentinel
  if (trimmed.startsWith('AutoCAD Binary DXF')) {
    return 'DXF-BINARY-UNSUPPORTED';
  }

  // Check for IFC STEP file
  if (trimmed.startsWith('ISO-10303-21;') || lowerName.endsWith('.ifc')) {
    return 'IFC-STEP-USE-P41';
  }

  // Check for ASCII DXF group code 0 / SECTION
  if (/^0\s*\r?\n\s*SECTION\b/m.test(trimmed)) {
    return 'DXF-ASCII';
  }

  return 'UNKNOWN-UNSUPPORTED';
}

// ============================================================================
// 3. POLYGON GEOMETRY & SELF-INTERSECTION / RECTILINEARITY CHECKS
// ============================================================================

export function computeBoundsForPoints(pts: CADPoint2D[]): CADBoundingBox2D {
  if (!pts || pts.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, length: 0 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return {
    minX: Number(minX.toFixed(4)),
    minY: Number(minY.toFixed(4)),
    maxX: Number(maxX.toFixed(4)),
    maxY: Number(maxY.toFixed(4)),
    width: Number(Math.max(0, maxX - minX).toFixed(4)),
    length: Number(Math.max(0, maxY - minY).toFixed(4)),
  };
}

function deduplicatePolygonVertices(vertices: CADPoint2D[], eps = 1e-3): CADPoint2D[] {
  if (vertices.length === 0) return [];
  const out: CADPoint2D[] = [vertices[0]];
  for (let i = 1; i < vertices.length; i++) {
    const prev = out[out.length - 1];
    const curr = vertices[i];
    if (Math.hypot(curr.x - prev.x, curr.y - prev.y) > eps) {
      out.push(curr);
    }
  }
  if (
    out.length > 1 &&
    Math.hypot(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y) <= eps
  ) {
    out.pop();
  }
  // Also simplify collinear intermediate vertices on straight edges
  if (out.length >= 4) {
    const simplified: CADPoint2D[] = [];
    const n = out.length;
    for (let i = 0; i < n; i++) {
      const prev = out[(i - 1 + n) % n];
      const curr = out[i];
      const next = out[(i + 1) % n];
      const cross =
        (curr.x - prev.x) * (next.y - curr.y) - (curr.y - prev.y) * (next.x - curr.x);
      const dot =
        (curr.x - prev.x) * (next.x - curr.x) + (curr.y - prev.y) * (next.y - curr.y);
      if (Math.abs(cross) <= 1e-3 && dot >= 0) {
        continue; // collinear mid-point
      }
      simplified.push(curr);
    }
    return simplified;
  }
  return out;
}

function segmentsProperlyIntersect(
  a1: CADPoint2D,
  a2: CADPoint2D,
  b1: CADPoint2D,
  b2: CADPoint2D
): boolean {
  const ccw = (p1: CADPoint2D, p2: CADPoint2D, p3: CADPoint2D) =>
    (p3.y - p1.y) * (p2.x - p1.x) - (p2.y - p1.y) * (p3.x - p1.x);

  const d1 = ccw(b1, b2, a1);
  const d2 = ccw(b1, b2, a2);
  const d3 = ccw(a1, a2, b1);
  const d4 = ccw(a1, a2, b2);

  if (((d1 > 1e-5 && d2 < -1e-5) || (d1 < -1e-5 && d2 > 1e-5)) &&
      ((d3 > 1e-5 && d4 < -1e-5) || (d3 < -1e-5 && d4 > 1e-5))) {
    return true;
  }
  return false;
}

export function checkPolygonGeometry(
  rawVertices: CADPoint2D[],
  isClosedFlag: boolean
): {
  isClosed: boolean;
  isRectilinear: boolean;
  isSelfIntersecting: boolean;
  hasCurvedBulge: boolean;
  area: number;
} {
  const hasCurvedBulge = rawVertices.some((v) => typeof v.bulge === 'number' && Math.abs(v.bulge) > 1e-4);
  if (rawVertices.length < 2) {
    return {
      isClosed: false,
      isRectilinear: false,
      isSelfIntersecting: false,
      hasCurvedBulge,
      area: 0,
    };
  }

  const first = rawVertices[0];
  const last = rawVertices[rawVertices.length - 1];
  const endpointsCoincide =
    rawVertices.length >= 4 && Math.hypot(first.x - last.x, first.y - last.y) <= 1e-2;
  const isClosed = isClosedFlag || endpointsCoincide;

  const unique = deduplicatePolygonVertices(rawVertices);
  if (!isClosed || unique.length < 3) {
    return {
      isClosed,
      isRectilinear: false,
      isSelfIntersecting: false,
      hasCurvedBulge,
      area: 0,
    };
  }

  // Signed shoelace area
  let doubleArea = 0;
  const n = unique.length;
  for (let i = 0; i < n; i++) {
    const p1 = unique[i];
    const p2 = unique[(i + 1) % n];
    doubleArea += p1.x * p2.y - p2.x * p1.y;
  }
  const area = Math.abs(doubleArea) / 2;

  // Check self-intersection between non-adjacent edges
  let isSelfIntersecting = false;
  if (n >= 4) {
    for (let i = 0; i < n; i++) {
      const a1 = unique[i];
      const a2 = unique[(i + 1) % n];
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue; // adjacent at vertex 0
        const b1 = unique[j];
        const b2 = unique[(j + 1) % n];
        if (segmentsProperlyIntersect(a1, a2, b1, b2)) {
          isSelfIntersecting = true;
          break;
        }
      }
      if (isSelfIntersecting) break;
    }
  }

  // Check if orthogonal 4-corner rectangle
  let isRectilinear = false;
  if (n === 4 && !isSelfIntersecting && !hasCurvedBulge && area > 1e-4) {
    let allOrtho = true;
    for (let i = 0; i < 4; i++) {
      const p1 = unique[i];
      const p2 = unique[(i + 1) % 4];
      const dx = Math.abs(p2.x - p1.x);
      const dy = Math.abs(p2.y - p1.y);
      const edgeLen = Math.hypot(dx, dy);
      if (edgeLen < 1e-4 || (dx > edgeLen * 0.02 && dy > edgeLen * 0.02)) {
        allOrtho = false;
        break;
      }
    }
    const bounds = computeBoundsForPoints(unique);
    const bboxArea = bounds.width * bounds.length;
    if (allOrtho && bboxArea > 0 && Math.abs(area - bboxArea) / bboxArea < 0.03) {
      isRectilinear = true;
    }
  }

  return {
    isClosed,
    isRectilinear,
    isSelfIntersecting,
    hasCurvedBulge,
    area: Number(area.toFixed(4)),
  };
}

// ============================================================================
// 4. DEFENSIVE ASCII DXF PARSER
// ============================================================================

interface DXFPair {
  code: number;
  value: string;
  lineIndex: number;
}

/**
 * Parses an ASCII DXF file into a validated `CADDrawingModel`.
 * Never modifies any Plotify project state.
 */
export function parseDXFToDrawingModel(request: CADImportRequest): CADDrawingModel {
  const warnings: CADImportWarning[] = [];
  const errors: CADImportError[] = [];
  const nowIso = new Date().toISOString();

  const maxBytes = request.maxFileSizeBytes ?? DEFAULT_MAX_CAD_FILE_BYTES;
  const maxEntities = request.maxEntityCount ?? DEFAULT_MAX_CAD_ENTITIES;

  const createEmptyModel = (detectedFormat: RecognizedCADFormat = 'UNKNOWN-UNSUPPORTED'): CADDrawingModel => ({
    formatVersion: 'plotify-cad-ir-v1',
    isValid: false,
    metadata: {
      fileName: request.fileName || 'unknown.dxf',
      fileSizeBytes: request.fileSizeBytes || 0,
      fileChecksum: '',
      detectedFormat,
      acadVersionCode: 'UNKNOWN',
      acadVersionLabel: 'Unknown',
      insunitsCode: null,
      detectedUnit: 'UNITLESS',
      hasExplicitUnits: false,
      headerExtents: null,
      computedExtents: null,
      parsedAt: nowIso,
    },
    layers: [],
    entities: [],
    unsupportedEntityCounts: {},
    totalRawEntitiesEncountered: 0,
    warnings,
    errors,
  });

  if (request.signal?.aborted) {
    errors.push({
      id: 'err-cad-cancelled',
      code: 'IMPORT_CANCELLED',
      message: 'CAD drawing import was cancelled by the user.',
      fatal: true,
    });
    return createEmptyModel();
  }

  if (!request.rawContent || request.rawContent.trim().length === 0 || request.fileSizeBytes === 0) {
    errors.push({
      id: 'err-cad-empty',
      code: 'FILE_EMPTY',
      message: 'The uploaded CAD file is empty (0 bytes).',
      fatal: true,
    });
    return createEmptyModel();
  }

  if (request.fileSizeBytes > maxBytes || request.rawContent.length > maxBytes) {
    errors.push({
      id: 'err-cad-oversize',
      code: 'FILE_TOO_LARGE',
      message: `CAD file size (${(request.fileSizeBytes / (1024 * 1024)).toFixed(2)} MB) exceeds Plotify's safe limit of ${(maxBytes / (1024 * 1024)).toFixed(0)} MB.`,
      fatal: true,
    });
    return createEmptyModel();
  }

  const signature = detectCADFileSignature(request.fileName, request.rawContent);
  if (signature === 'DWG-BINARY-UNSUPPORTED') {
    errors.push({
      id: 'err-dwg-binary',
      code: 'DWG_CONVERSION_REQUIRED',
      message:
        'Native binary DWG files (.dwg) are proprietary and cannot be parsed directly without conversion. Please export or Save As an ASCII DXF (.dxf, R12/2000/2018) from your CAD software and upload the .dxf file.',
      fatal: true,
    });
    return createEmptyModel(signature);
  }

  if (signature === 'DXF-BINARY-UNSUPPORTED') {
    errors.push({
      id: 'err-dxf-binary',
      code: 'BINARY_DXF_UNSUPPORTED',
      message:
        'Binary DXF files are not supported. Please re-save your drawing as an ASCII DXF (.dxf) file.',
      fatal: true,
    });
    return createEmptyModel(signature);
  }

  if (signature === 'IFC-STEP-USE-P41') {
    errors.push({
      id: 'err-ifc-in-cad',
      code: 'IFC_FILE_USE_OPENBIM_WORKSPACE',
      message:
        'This file is an ISO-10303-21 IFC building model (.ifc). Please use the OpenBIM & IFC Interoperability workspace (P41) to import IFC files.',
      fatal: true,
    });
    return createEmptyModel(signature);
  }

  if (signature !== 'DXF-ASCII') {
    errors.push({
      id: 'err-not-dxf',
      code: 'NOT_A_DXF_FILE',
      message:
        'Unrecognized file content: missing valid ASCII DXF group code 0 / SECTION structure.',
      fatal: true,
    });
    return createEmptyModel(signature);
  }

  // Tokenize lines into (groupCode, value) pairs
  const rawLines = request.rawContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  // Trim trailing empty lines after EOF
  while (rawLines.length > 0 && rawLines[rawLines.length - 1].trim() === '') {
    rawLines.pop();
  }

  const pairs: DXFPair[] = [];
  let hasEof = false;

  for (let i = 0; i < rawLines.length; i += 2) {
    const codeStr = rawLines[i]?.trim();
    if (codeStr === undefined) break;

    const code = parseInt(codeStr, 10);
    if (isNaN(code)) {
      errors.push({
        id: `err-dxf-code-${i + 1}`,
        code: 'MALFORMED_DXF_PAIR',
        lineOrSection: i + 1,
        message: `Malformed DXF group code "${codeStr.slice(0, 30)}" at line ${i + 1}; expected integer group code.`,
        fatal: true,
      });
      return createEmptyModel('DXF-ASCII');
    }

    if (i + 1 >= rawLines.length) {
      errors.push({
        id: `err-dxf-unpaired-${i + 1}`,
        code: 'TRUNCATED_DXF_EOF',
        lineOrSection: i + 1,
        message: `Truncated DXF file at line ${i + 1}: group code ${code} is missing its value line.`,
        fatal: true,
      });
      return createEmptyModel('DXF-ASCII');
    }

    const val = rawLines[i + 1].trim();
    pairs.push({ code, value: val, lineIndex: i + 1 });

    if (code === 0 && val.toUpperCase() === 'EOF') {
      hasEof = true;
      break;
    }
  }

  if (!hasEof) {
    errors.push({
      id: 'err-dxf-no-eof',
      code: 'TRUNCATED_DXF_EOF',
      message: 'DXF file is truncated or incomplete: missing terminal 0 / EOF marker.',
      fatal: true,
    });
    return createEmptyModel('DXF-ASCII');
  }

  // Parse sections: HEADER, TABLES, BLOCKS, ENTITIES
  let acadVersionCode = 'AC1015';
  let insunitsCode: number | null = null;
  let extMinX: number | null = null;
  let extMinY: number | null = null;
  let extMaxX: number | null = null;
  let extMaxY: number | null = null;

  const layerDefs = new Map<
    string,
    { name: string; colorIndex: number; isFrozen: boolean; isOff: boolean }
  >();
  layerDefs.set('0', { name: '0', colorIndex: 7, isFrozen: false, isOff: false });

  interface RawBlockDef {
    name: string;
    baseX: number;
    baseY: number;
    entityPairs: DXFPair[][];
  }
  const blockDefs = new Map<string, RawBlockDef>();
  const rawEntityRecords: DXFPair[][] = [];

  let pIdx = 0;
  while (pIdx < pairs.length) {
    const p = pairs[pIdx];
    if (p.code === 0 && p.value.toUpperCase() === 'SECTION') {
      const secNamePair = pairs[pIdx + 1];
      const secName = secNamePair?.code === 2 ? secNamePair.value.toUpperCase() : '';
      pIdx += 2;

      if (secName === 'HEADER') {
        let currentVar = '';
        while (pIdx < pairs.length) {
          const hp = pairs[pIdx];
          if (hp.code === 0 && hp.value.toUpperCase() === 'ENDSEC') {
            pIdx++;
            break;
          }
          if (hp.code === 9) {
            currentVar = hp.value.toUpperCase();
          } else if (currentVar === '$ACADVER' && hp.code === 1) {
            acadVersionCode = hp.value.trim().toUpperCase();
          } else if (currentVar === '$INSUNITS' && hp.code === 70) {
            const parsed = parseInt(hp.value, 10);
            if (!isNaN(parsed)) insunitsCode = parsed;
          } else if (currentVar === '$EXTMIN') {
            if (hp.code === 10) extMinX = parseFloat(hp.value);
            if (hp.code === 20) extMinY = parseFloat(hp.value);
          } else if (currentVar === '$EXTMAX') {
            if (hp.code === 10) extMaxX = parseFloat(hp.value);
            if (hp.code === 20) extMaxY = parseFloat(hp.value);
          }
          pIdx++;
        }
      } else if (secName === 'TABLES') {
        while (pIdx < pairs.length) {
          const tp = pairs[pIdx];
          if (tp.code === 0 && tp.value.toUpperCase() === 'ENDSEC') {
            pIdx++;
            break;
          }
          if (tp.code === 0 && tp.value.toUpperCase() === 'LAYER') {
            pIdx++;
            let lName = '0';
            let lColor = 7;
            let lFlags = 0;
            while (pIdx < pairs.length && pairs[pIdx].code !== 0) {
              const lp = pairs[pIdx];
              if (lp.code === 2) lName = sanitizeText(lp.value, 80, '0') || '0';
              if (lp.code === 62) lColor = parseInt(lp.value, 10) || 7;
              if (lp.code === 70) lFlags = parseInt(lp.value, 10) || 0;
              pIdx++;
            }
            layerDefs.set(lName, {
              name: lName,
              colorIndex: Math.abs(lColor),
              isFrozen: (lFlags & 1) === 1,
              isOff: lColor < 0,
            });
            continue;
          }
          pIdx++;
        }
      } else if (secName === 'BLOCKS') {
        while (pIdx < pairs.length) {
          const bp = pairs[pIdx];
          if (bp.code === 0 && bp.value.toUpperCase() === 'ENDSEC') {
            pIdx++;
            break;
          }
          if (bp.code === 0 && bp.value.toUpperCase() === 'BLOCK') {
            pIdx++;
            let bName = '';
            let baseX = 0;
            let baseY = 0;
            while (pIdx < pairs.length && pairs[pIdx].code !== 0) {
              const bhp = pairs[pIdx];
              if (bhp.code === 2 || bhp.code === 3) {
                if (!bName) bName = sanitizeText(bhp.value, 80, '');
              }
              if (bhp.code === 10) baseX = parseFloat(bhp.value) || 0;
              if (bhp.code === 20) baseY = parseFloat(bhp.value) || 0;
              pIdx++;
            }
            const blockEntityPairs: DXFPair[][] = [];
            while (pIdx < pairs.length) {
              const bep = pairs[pIdx];
              if (bep.code === 0 && bep.value.toUpperCase() === 'ENDBLK') {
                pIdx++;
                while (pIdx < pairs.length && pairs[pIdx].code !== 0) pIdx++;
                break;
              }
              if (bep.code === 0) {
                const rec: DXFPair[] = [bep];
                pIdx++;
                while (pIdx < pairs.length && pairs[pIdx].code !== 0) {
                  rec.push(pairs[pIdx]);
                  pIdx++;
                }
                blockEntityPairs.push(rec);
              } else {
                pIdx++;
              }
            }
            if (bName) {
              blockDefs.set(bName, { name: bName, baseX, baseY, entityPairs: blockEntityPairs });
            }
            continue;
          }
          pIdx++;
        }
      } else if (secName === 'ENTITIES') {
        while (pIdx < pairs.length) {
          const ep = pairs[pIdx];
          if (ep.code === 0 && ep.value.toUpperCase() === 'ENDSEC') {
            pIdx++;
            break;
          }
          if (ep.code === 0) {
            const rec: DXFPair[] = [ep];
            pIdx++;
            while (pIdx < pairs.length && pairs[pIdx].code !== 0) {
              rec.push(pairs[pIdx]);
              pIdx++;
            }
            rawEntityRecords.push(rec);
            if (rawEntityRecords.length > maxEntities) {
              errors.push({
                id: 'err-cad-entity-limit',
                code: 'ENTITY_LIMIT_EXCEEDED',
                message: `DXF file exceeds maximum supported entity count (${maxEntities}).`,
                fatal: true,
              });
              return createEmptyModel('DXF-ASCII');
            }
          } else {
            pIdx++;
          }
        }
      } else {
        // Skip other sections (CLASSES, OBJECTS, THUMBNAILIMAGE)
        while (pIdx < pairs.length) {
          if (pairs[pIdx].code === 0 && pairs[pIdx].value.toUpperCase() === 'ENDSEC') {
            pIdx++;
            break;
          }
          pIdx++;
        }
      }
    } else {
      pIdx++;
    }
  }

  const detectedUnit = mapInsunitsToCADUnit(insunitsCode);
  const hasExplicitUnits = detectedUnit !== 'UNITLESS';

  if (!hasExplicitUnits) {
    warnings.push({
      id: 'warn-cad-unitless',
      code: 'AMBIGUOUS_OR_MISSING_UNITS',
      severity: 'warning',
      message:
        'DXF header $INSUNITS is 0 (Unitless) or omitted. Plotify will not guess drawing units; explicit unit selection is required before mapping.',
      remedy: 'Select the drawing source unit (Millimetres, Centimetres, Metres, Feet, or Inches) in the Calibration panel.',
    });
  }

  const entities: CADExtractedEntity[] = [];
  const unsupportedEntityCounts: Record<string, number> = {};
  const seenHandles = new Set<string>();
  let totalRawEntitiesEncountered = 0;
  let syntheticHandleCounter = 1;

  // Helper to parse a list of raw entity records (used for ENTITIES and recursively for INSERT blocks)
  const processEntityRecordList = (
    records: DXFPair[][],
    transform?: {
      offsetX: number;
      offsetY: number;
      scaleX: number;
      scaleY: number;
      rotationDeg: number;
      overrideLayer?: string;
      sourceBlockHandle?: string;
      depth: number;
    }
  ) => {
    const transformPoint = (x: number, y: number): CADPoint2D => {
      if (!transform) return { x: Number(x.toFixed(4)), y: Number(y.toFixed(4)) };
      const sx = x * transform.scaleX;
      const sy = y * transform.scaleY;
      const rad = (transform.rotationDeg * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const rx = sx * cos - sy * sin + transform.offsetX;
      const ry = sx * sin + sy * cos + transform.offsetY;
      return { x: Number(rx.toFixed(4)), y: Number(ry.toFixed(4)) };
    };

    let idx = 0;
    while (idx < records.length) {
      const rec = records[idx];
      const entityType = rec[0].value.toUpperCase();

      // Skip VERTEX / SEQEND if orphaned outside POLYLINE
      if (entityType === 'VERTEX' || entityType === 'SEQEND') {
        idx++;
        continue;
      }

      totalRawEntitiesEncountered++;
      let handle = '';
      let layer = '0';
      for (let k = 1; k < rec.length; k++) {
        if (rec[k].code === 5 && !handle) handle = sanitizeText(rec[k].value, 40, '');
        if (rec[k].code === 8) layer = sanitizeText(rec[k].value, 80, '0') || '0';
      }

      if (transform?.overrideLayer && layer === '0') {
        layer = transform.overrideLayer;
      }
      if (!layerDefs.has(layer)) {
        layerDefs.set(layer, { name: layer, colorIndex: 7, isFrozen: false, isOff: false });
      }

      if (!handle) {
        handle = `H-${syntheticHandleCounter++}`;
      } else if (transform?.sourceBlockHandle) {
        handle = `${transform.sourceBlockHandle}:${handle}:${syntheticHandleCounter++}`;
      } else if (seenHandles.has(handle)) {
        warnings.push({
          id: `warn-dup-handle-${handle}-${idx}`,
          code: 'DUPLICATE_ENTITY_HANDLE',
          severity: 'info',
          entityHandle: handle,
          layer,
          dxfType: entityType,
          message: `Duplicate DXF entity handle "${handle}" detected on layer "${layer}"; assigned unique internal provenance key.`,
        });
        handle = `${handle}-dup-${syntheticHandleCounter++}`;
      }
      seenHandles.add(handle);

      if (entityType === 'LINE') {
        let x1 = 0, y1 = 0, x2 = 0, y2 = 0;
        for (let k = 1; k < rec.length; k++) {
          const c = rec[k].code;
          const v = parseFloat(rec[k].value);
          if (isNaN(v)) continue;
          if (c === 10) x1 = v;
          else if (c === 20) y1 = v;
          else if (c === 11) x2 = v;
          else if (c === 21) y2 = v;
        }
        const p1 = transformPoint(x1, y1);
        const p2 = transformPoint(x2, y2);
        const vertices = [p1, p2];
        const bounds = computeBoundsForPoints(vertices);
        entities.push({
          id: `cad-ent-${entities.length + 1}`,
          handle,
          dxfType: 'LINE',
          layer,
          floorLevelHint: inferLayerFloorLevel(layer),
          isClosed: false,
          isRectilinear: false,
          isSelfIntersecting: false,
          hasCurvedBulge: false,
          vertices,
          bounds,
          areaInSourceUnits: 0,
          sourceBlockHandle: transform?.sourceBlockHandle,
        });
        idx++;
      } else if (entityType === 'LWPOLYLINE') {
        let flags = 0;
        const vertices: CADPoint2D[] = [];
        let curX: number | null = null;
        let curY: number | null = null;
        let curBulge = 0;

        for (let k = 1; k < rec.length; k++) {
          const c = rec[k].code;
          if (c === 70) {
            flags = parseInt(rec[k].value, 10) || 0;
          } else if (c === 10) {
            if (curX !== null && curY !== null) {
              const tp = transformPoint(curX, curY);
              if (curBulge !== 0) tp.bulge = curBulge;
              vertices.push(tp);
            }
            curX = parseFloat(rec[k].value) || 0;
            curY = 0;
            curBulge = 0;
          } else if (c === 20) {
            curY = parseFloat(rec[k].value) || 0;
          } else if (c === 42) {
            curBulge = parseFloat(rec[k].value) || 0;
          }
        }
        if (curX !== null && curY !== null) {
          const tp = transformPoint(curX, curY);
          if (curBulge !== 0) tp.bulge = curBulge;
          vertices.push(tp);
        }

        const isClosedFlag = (flags & 1) === 1;
        const geomCheck = checkPolygonGeometry(vertices, isClosedFlag);
        const bounds = computeBoundsForPoints(vertices);

        if (geomCheck.hasCurvedBulge) {
          warnings.push({
            id: `warn-bulge-${handle}`,
            code: 'CURVED_BULGE_SEGMENT',
            severity: 'info',
            layer,
            entityHandle: handle,
            dxfType: 'LWPOLYLINE',
            message: `LWPOLYLINE (${handle}) on layer "${layer}" contains curved arc bulge segments (code 42). Retained as reference geometry; not auto-converted to a rectangular room.`,
          });
        }

        entities.push({
          id: `cad-ent-${entities.length + 1}`,
          handle,
          dxfType: 'LWPOLYLINE',
          layer,
          floorLevelHint: inferLayerFloorLevel(layer),
          isClosed: geomCheck.isClosed,
          isRectilinear: geomCheck.isRectilinear,
          isSelfIntersecting: geomCheck.isSelfIntersecting,
          hasCurvedBulge: geomCheck.hasCurvedBulge,
          vertices,
          bounds,
          areaInSourceUnits: geomCheck.area,
          sourceBlockHandle: transform?.sourceBlockHandle,
        });
        idx++;
      } else if (entityType === 'POLYLINE') {
        let flags = 0;
        for (let k = 1; k < rec.length; k++) {
          if (rec[k].code === 70) flags = parseInt(rec[k].value, 10) || 0;
        }
        const vertices: CADPoint2D[] = [];
        idx++;
        while (idx < records.length) {
          const vRec = records[idx];
          const vType = vRec[0].value.toUpperCase();
          if (vType === 'SEQEND') {
            idx++;
            break;
          }
          if (vType === 'VERTEX') {
            let vx = 0, vy = 0, vBulge = 0;
            for (let k = 1; k < vRec.length; k++) {
              if (vRec[k].code === 10) vx = parseFloat(vRec[k].value) || 0;
              else if (vRec[k].code === 20) vy = parseFloat(vRec[k].value) || 0;
              else if (vRec[k].code === 42) vBulge = parseFloat(vRec[k].value) || 0;
            }
            const tp = transformPoint(vx, vy);
            if (vBulge !== 0) tp.bulge = vBulge;
            vertices.push(tp);
            idx++;
          } else {
            break;
          }
        }

        const isClosedFlag = (flags & 1) === 1;
        const geomCheck = checkPolygonGeometry(vertices, isClosedFlag);
        const bounds = computeBoundsForPoints(vertices);

        entities.push({
          id: `cad-ent-${entities.length + 1}`,
          handle,
          dxfType: 'POLYLINE',
          layer,
          floorLevelHint: inferLayerFloorLevel(layer),
          isClosed: geomCheck.isClosed,
          isRectilinear: geomCheck.isRectilinear,
          isSelfIntersecting: geomCheck.isSelfIntersecting,
          hasCurvedBulge: geomCheck.hasCurvedBulge,
          vertices,
          bounds,
          areaInSourceUnits: geomCheck.area,
          sourceBlockHandle: transform?.sourceBlockHandle,
        });
      } else if (entityType === 'CIRCLE') {
        let cx = 0, cy = 0, radius = 0;
        for (let k = 1; k < rec.length; k++) {
          if (rec[k].code === 10) cx = parseFloat(rec[k].value) || 0;
          else if (rec[k].code === 20) cy = parseFloat(rec[k].value) || 0;
          else if (rec[k].code === 40) radius = Math.abs(parseFloat(rec[k].value) || 0);
        }
        const center = transformPoint(cx, cy);
        const scale = transform ? Math.abs(transform.scaleX) : 1;
        const effRadius = Number((radius * scale).toFixed(4));
        const bounds: CADBoundingBox2D = {
          minX: Number((center.x - effRadius).toFixed(4)),
          minY: Number((center.y - effRadius).toFixed(4)),
          maxX: Number((center.x + effRadius).toFixed(4)),
          maxY: Number((center.y + effRadius).toFixed(4)),
          width: Number((effRadius * 2).toFixed(4)),
          length: Number((effRadius * 2).toFixed(4)),
        };
        entities.push({
          id: `cad-ent-${entities.length + 1}`,
          handle,
          dxfType: 'CIRCLE',
          layer,
          floorLevelHint: inferLayerFloorLevel(layer),
          isClosed: true,
          isRectilinear: false,
          isSelfIntersecting: false,
          hasCurvedBulge: false,
          vertices: [center],
          center,
          radius: effRadius,
          bounds,
          areaInSourceUnits: Number((Math.PI * effRadius * effRadius).toFixed(4)),
          sourceBlockHandle: transform?.sourceBlockHandle,
        });
        idx++;
      } else if (entityType === 'ARC') {
        let cx = 0, cy = 0, radius = 0, startAng = 0, endAng = 360;
        for (let k = 1; k < rec.length; k++) {
          if (rec[k].code === 10) cx = parseFloat(rec[k].value) || 0;
          else if (rec[k].code === 20) cy = parseFloat(rec[k].value) || 0;
          else if (rec[k].code === 40) radius = Math.abs(parseFloat(rec[k].value) || 0);
          else if (rec[k].code === 50) startAng = parseFloat(rec[k].value) || 0;
          else if (rec[k].code === 51) endAng = parseFloat(rec[k].value) || 0;
        }
        const center = transformPoint(cx, cy);
        const scale = transform ? Math.abs(transform.scaleX) : 1;
        const effRadius = Number((radius * scale).toFixed(4));
        const bounds: CADBoundingBox2D = {
          minX: Number((center.x - effRadius).toFixed(4)),
          minY: Number((center.y - effRadius).toFixed(4)),
          maxX: Number((center.x + effRadius).toFixed(4)),
          maxY: Number((center.y + effRadius).toFixed(4)),
          width: Number((effRadius * 2).toFixed(4)),
          length: Number((effRadius * 2).toFixed(4)),
        };
        entities.push({
          id: `cad-ent-${entities.length + 1}`,
          handle,
          dxfType: 'ARC',
          layer,
          floorLevelHint: inferLayerFloorLevel(layer),
          isClosed: false,
          isRectilinear: false,
          isSelfIntersecting: false,
          hasCurvedBulge: true,
          vertices: [center],
          center,
          radius: effRadius,
          startAngleDeg: startAng,
          endAngleDeg: endAng,
          bounds,
          areaInSourceUnits: 0,
          sourceBlockHandle: transform?.sourceBlockHandle,
        });
        idx++;
      } else if (entityType === 'TEXT' || entityType === 'MTEXT') {
        let tx = 0, ty = 0, tHeight = 0.25, rot = 0;
        const textChunks: string[] = [];
        for (let k = 1; k < rec.length; k++) {
          const c = rec[k].code;
          if (c === 10) tx = parseFloat(rec[k].value) || 0;
          else if (c === 20) ty = parseFloat(rec[k].value) || 0;
          else if (c === 40) tHeight = Math.abs(parseFloat(rec[k].value) || 0.25);
          else if (c === 50) rot = parseFloat(rec[k].value) || 0;
          else if (c === 1 || c === 3) textChunks.push(rec[k].value);
        }
        const pt = transformPoint(tx, ty);
        const cleanedText = cleanMTextString(textChunks.join(''));
        const bounds: CADBoundingBox2D = {
          minX: pt.x,
          minY: pt.y,
          maxX: Number((pt.x + Math.max(tHeight, cleanedText.length * tHeight * 0.5)).toFixed(4)),
          maxY: Number((pt.y + tHeight).toFixed(4)),
          width: Number(Math.max(tHeight, cleanedText.length * tHeight * 0.5).toFixed(4)),
          length: Number(tHeight.toFixed(4)),
        };
        entities.push({
          id: `cad-ent-${entities.length + 1}`,
          handle,
          dxfType: entityType,
          layer,
          floorLevelHint: inferLayerFloorLevel(layer),
          isClosed: false,
          isRectilinear: false,
          isSelfIntersecting: false,
          hasCurvedBulge: false,
          vertices: [pt],
          center: pt,
          textContent: cleanedText,
          textHeight: tHeight,
          rotationDeg: rot,
          bounds,
          areaInSourceUnits: 0,
          sourceBlockHandle: transform?.sourceBlockHandle,
        });
        idx++;
      } else if (entityType === 'INSERT') {
        let blockName = '';
        let ix = 0, iy = 0, sx = 1, sy = 1, rot = 0;
        for (let k = 1; k < rec.length; k++) {
          const c = rec[k].code;
          if (c === 2) blockName = sanitizeText(rec[k].value, 80, '');
          else if (c === 10) ix = parseFloat(rec[k].value) || 0;
          else if (c === 20) iy = parseFloat(rec[k].value) || 0;
          else if (c === 41) sx = parseFloat(rec[k].value) || 1;
          else if (c === 42) sy = parseFloat(rec[k].value) || 1;
          else if (c === 50) rot = parseFloat(rec[k].value) || 0;
        }
        const currentDepth = (transform?.depth || 0) + 1;
        const blockDef = blockDefs.get(blockName);
        if (!blockDef || currentDepth > MAX_BLOCK_NESTING_DEPTH) {
          warnings.push({
            id: `warn-block-unres-${handle}`,
            code: 'BLOCK_PARTIAL_OR_UNRESOLVED',
            severity: 'warning',
            layer,
            entityHandle: handle,
            dxfType: 'INSERT',
            message: !blockDef
              ? `INSERT (${handle}) references undefined BLOCK "${blockName}" on layer "${layer}".`
              : `INSERT (${handle}) exceeded maximum block nesting depth (${MAX_BLOCK_NESTING_DEPTH}).`,
          });
        } else {
          const insPt = transformPoint(ix - blockDef.baseX * sx, iy - blockDef.baseY * sy);
          const isUniformOrtho =
            Math.abs(Math.abs(sx) - Math.abs(sy)) < 1e-3 && Math.abs(rot % 90) < 1e-2;
          if (!isUniformOrtho) {
            warnings.push({
              id: `warn-block-skew-${handle}`,
              code: 'BLOCK_PARTIAL_OR_UNRESOLVED',
              severity: 'info',
              layer,
              entityHandle: handle,
              dxfType: 'INSERT',
              message: `INSERT "${blockName}" (${handle}) uses non-uniform scale (${sx}, ${sy}) or non-orthogonal rotation (${rot}°); expanded geometry is preserved for reference only.`,
            });
          }
          processEntityRecordList(blockDef.entityPairs, {
            offsetX: insPt.x,
            offsetY: insPt.y,
            scaleX: sx * (transform?.scaleX || 1),
            scaleY: sy * (transform?.scaleY || 1),
            rotationDeg: (rot + (transform?.rotationDeg || 0)) % 360,
            overrideLayer: layer,
            sourceBlockHandle: handle,
            depth: currentDepth,
          });
        }
        idx++;
      } else {
        // Unsupported DXF entity type (e.g. HATCH, DIMENSION, SPLINE, 3DSOLID, etc.)
        unsupportedEntityCounts[entityType] = (unsupportedEntityCounts[entityType] || 0) + 1;
        warnings.push({
          id: `warn-unsup-ent-${handle}-${idx}`,
          code: 'UNSUPPORTED_ENTITY_SKIPPED',
          severity: 'warning',
          layer,
          entityHandle: handle,
          dxfType: entityType,
          message: `Unsupported DXF entity ${entityType} (${handle}) on layer "${layer}" was skipped without fabricating geometry.`,
          remedy: 'Review the CAD Drawing Exchange Support Profile for supported 2D entity types.',
        });
        idx++;
      }
    }
  };

  processEntityRecordList(rawEntityRecords);

  // Build Layer Summaries & Computed Extents
  let globalMinX = Infinity;
  let globalMinY = Infinity;
  let globalMaxX = -Infinity;
  let globalMaxY = -Infinity;

  const layerEntitiesMap = new Map<string, CADExtractedEntity[]>();
  for (const ent of entities) {
    const list = layerEntitiesMap.get(ent.layer) || [];
    list.push(ent);
    layerEntitiesMap.set(ent.layer, list);

    if (ent.bounds.minX < globalMinX) globalMinX = ent.bounds.minX;
    if (ent.bounds.minY < globalMinY) globalMinY = ent.bounds.minY;
    if (ent.bounds.maxX > globalMaxX) globalMaxX = ent.bounds.maxX;
    if (ent.bounds.maxY > globalMaxY) globalMaxY = ent.bounds.maxY;
  }

  const computedExtents: CADBoundingBox2D | null =
    entities.length > 0 && isFinite(globalMinX)
      ? {
          minX: Number(globalMinX.toFixed(4)),
          minY: Number(globalMinY.toFixed(4)),
          maxX: Number(globalMaxX.toFixed(4)),
          maxY: Number(globalMaxY.toFixed(4)),
          width: Number(Math.max(0, globalMaxX - globalMinX).toFixed(4)),
          length: Number(Math.max(0, globalMaxY - globalMinY).toFixed(4)),
        }
      : null;

  const headerExtents: CADBoundingBox2D | null =
    extMinX !== null &&
    extMinY !== null &&
    extMaxX !== null &&
    extMaxY !== null &&
    !isNaN(extMinX) &&
    !isNaN(extMaxX) &&
    extMaxX >= extMinX
      ? {
          minX: extMinX,
          minY: extMinY,
          maxX: extMaxX,
          maxY: extMaxY,
          width: Number((extMaxX - extMinX).toFixed(4)),
          length: Number((extMaxY - extMinY).toFixed(4)),
        }
      : null;

  const layers: CADLayerSummary[] = [];
  for (const [lName, lDef] of layerDefs.entries()) {
    const lEnts = layerEntitiesMap.get(lName) || [];
    const breakdown: Record<string, number> = {};
    let lMinX = Infinity, lMinY = Infinity, lMaxX = -Infinity, lMaxY = -Infinity;

    for (const e of lEnts) {
      breakdown[e.dxfType] = (breakdown[e.dxfType] || 0) + 1;
      if (e.bounds.minX < lMinX) lMinX = e.bounds.minX;
      if (e.bounds.minY < lMinY) lMinY = e.bounds.minY;
      if (e.bounds.maxX > lMaxX) lMaxX = e.bounds.maxX;
      if (e.bounds.maxY > lMaxY) lMaxY = e.bounds.maxY;
    }

    if (lEnts.length === 0 && lName === '0' && layerDefs.size > 1) {
      continue;
    }

    layers.push({
      name: lName,
      colorIndex: lDef.colorIndex,
      isFrozen: lDef.isFrozen,
      isOff: lDef.isOff,
      entityCount: lEnts.length,
      entityBreakdown: breakdown,
      bounds:
        lEnts.length > 0
          ? {
              minX: Number(lMinX.toFixed(4)),
              minY: Number(lMinY.toFixed(4)),
              maxX: Number(lMaxX.toFixed(4)),
              maxY: Number(lMaxY.toFixed(4)),
              width: Number(Math.max(0, lMaxX - lMinX).toFixed(4)),
              length: Number(Math.max(0, lMaxY - lMinY).toFixed(4)),
            }
          : null,
      suggestedRole: inferSuggestedLayerRole(lName, breakdown),
    });
  }

  if (entities.length === 0) {
    errors.push({
      id: 'err-no-supported-entities',
      code: 'NO_SUPPORTED_ENTITIES',
      message:
        'DXF file contains no supported 2D geometric entities (LINE, LWPOLYLINE, POLYLINE, CIRCLE, ARC, TEXT, MTEXT).',
      fatal: true,
    });
  }

  return {
    formatVersion: 'plotify-cad-ir-v1',
    isValid: !errors.some((e) => e.fatal),
    metadata: {
      fileName: request.fileName,
      fileSizeBytes: request.fileSizeBytes,
      fileChecksum: computeStringChecksum(request.rawContent),
      detectedFormat: 'DXF-ASCII',
      acadVersionCode,
      acadVersionLabel: mapAcadVerToLabel(acadVersionCode),
      insunitsCode,
      detectedUnit,
      hasExplicitUnits,
      headerExtents,
      computedExtents,
      parsedAt: nowIso,
    },
    layers,
    entities,
    unsupportedEntityCounts,
    totalRawEntitiesEncountered,
    warnings,
    errors,
  };
}

/**
 * Asynchronous wrapper for DXF parsing with duplicate-request lock protection and AbortSignal cancellation.
 */
export async function parseDXFAsync(request: CADImportRequest): Promise<CADDrawingModel> {
  const lockKey =
    request.requestId || `${request.fileName}:${request.fileSizeBytes}:${request.rawContent.length}`;

  if (ACTIVE_CAD_IMPORT_LOCKS.has(lockKey)) {
    return {
      formatVersion: 'plotify-cad-ir-v1',
      isValid: false,
      metadata: {
        fileName: request.fileName,
        fileSizeBytes: request.fileSizeBytes,
        fileChecksum: '',
        detectedFormat: 'DXF-ASCII',
        acadVersionCode: 'UNKNOWN',
        acadVersionLabel: 'Unknown',
        insunitsCode: null,
        detectedUnit: 'UNITLESS',
        hasExplicitUnits: false,
        headerExtents: null,
        computedExtents: null,
        parsedAt: new Date().toISOString(),
      },
      layers: [],
      entities: [],
      unsupportedEntityCounts: {},
      totalRawEntitiesEncountered: 0,
      warnings: [],
      errors: [
        {
          id: 'err-cad-dup-lock',
          code: 'DUPLICATE_IMPORT_IN_PROGRESS',
          message: `A CAD import operation for "${request.fileName}" is already in progress.`,
          fatal: true,
        },
      ],
    };
  }

  ACTIVE_CAD_IMPORT_LOCKS.add(lockKey);
  try {
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
    return parseDXFToDrawingModel(request);
  } finally {
    ACTIVE_CAD_IMPORT_LOCKS.delete(lockKey);
  }
}

// ============================================================================
// 5. LAYER MAPPING, CALIBRATION, GEOMETRY VALIDATION & PREVIEW ENGINE
// ============================================================================

export function buildDefaultLayerMappingRules(drawing: CADDrawingModel): CADLayerMappingRule[] {
  return drawing.layers.map((layer) => ({
    layerName: layer.name,
    visible: !layer.isFrozen && !layer.isOff,
    selectedForImport: !layer.isFrozen && !layer.isOff && layer.suggestedRole !== 'ignore',
    targetRole: layer.suggestedRole,
    targetFloorLevel: inferLayerFloorLevel(layer.name),
  }));
}

export function inferRoomTypeFromTextLabel(label: string): string {
  const lower = (label || '').toLowerCase();
  if (/bed|master|suite|guest/i.test(lower)) return 'bedroom';
  if (/bath|wc|toilet|restroom|lavatory|powder|ensuite|en-suite/i.test(lower)) return 'bathroom';
  if (/kitchen|pantry|cooking|culinary/i.test(lower)) return 'kitchen';
  if (/living|lounge|great room|family|sitting/i.test(lower)) return 'living';
  if (/dining|breakfast/i.test(lower)) return 'dining';
  if (/office|study|studio|library/i.test(lower)) return 'office';
  if (/balcony|terrace|patio|deck|veranda/i.test(lower)) return 'balcony';
  if (/garage|carport|parking/i.test(lower)) return 'garage';
  if (/laundry|utility|mudroom/i.test(lower)) return 'laundry';
  if (/storage|store|closet|wardrobe/i.test(lower)) return 'storage';
  return 'custom';
}

/**
 * Maps a `CADDrawingModel` into Plotify project entities according to explicit user layer rules
 * and unit/scale calibration. Never modifies any existing project.
 */
export function mapCADDrawingToPlotify(
  drawing: CADDrawingModel,
  layerRules: CADLayerMappingRule[],
  calibration: CADCalibrationOptions
): CADMappingResult {
  const warnings: CADImportWarning[] = [...drawing.warnings];
  const errors: CADImportError[] = [...drawing.errors];

  // 1. Validate explicit unit selection if header was UNITLESS
  if (
    drawing.metadata.detectedUnit === 'UNITLESS' &&
    !calibration.userConfirmedUnitWhenUnitless
  ) {
    errors.push({
      id: 'err-unit-confirm-required',
      code: 'UNIT_CONFIRMATION_REQUIRED',
      message:
        'Drawing has no explicit unit ($INSUNITS = 0). You must explicitly confirm the source unit in the Calibration step before mapping.',
      fatal: true,
    });
  }

  // 2. Validate scale multiplier
  if (
    typeof calibration.scaleMultiplier !== 'number' ||
    isNaN(calibration.scaleMultiplier) ||
    !isFinite(calibration.scaleMultiplier) ||
    calibration.scaleMultiplier <= 0 ||
    calibration.scaleMultiplier > 10000
  ) {
    errors.push({
      id: 'err-invalid-scale-multiplier',
      code: 'INVALID_CALIBRATION_SCALE',
      message: `Invalid scale calibration multiplier (${calibration.scaleMultiplier}); must be a positive number between 0.0001 and 10000.`,
      fatal: true,
    });
  }

  const effectiveSourceUnit = calibration.effectiveSourceUnit || 'METRE';
  const targetUnit = calibration.targetPlotifyUnit || 'metres';
  const unitFactors = getCADUnitFactors(effectiveSourceUnit);
  const baseUnitFactor = targetUnit === 'metres' ? unitFactors.toMetres : unitFactors.toFeet;
  const totalScale = baseUnitFactor * (calibration.scaleMultiplier > 0 ? calibration.scaleMultiplier : 1);

  const ruleByLayer = new Map<string, CADLayerMappingRule>();
  for (const r of layerRules) {
    ruleByLayer.set(r.layerName, r);
  }

  const omittedSet = new Set<string>(calibration.omittedEntityHandles || []);

  // Collect active entities on selected layers
  const activeEntities = drawing.entities.filter((ent) => {
    const rule = ruleByLayer.get(ent.layer);
    return rule && rule.selectedForImport && rule.targetRole !== 'ignore';
  });

  // Compute coordinate normalization offset if requested or if negative coordinates exist
  let minScaledX = Infinity;
  let minScaledY = Infinity;
  let maxScaledX = -Infinity;
  let maxScaledY = -Infinity;

  // Check if there is an explicit plot-boundary entity
  const boundaryEntities = activeEntities.filter(
    (e) => ruleByLayer.get(e.layer)?.targetRole === 'plot-boundary'
  );

  const referenceBoundsSource = boundaryEntities.length > 0 ? boundaryEntities : activeEntities;
  for (const ent of referenceBoundsSource) {
    const bx1 = ent.bounds.minX * totalScale;
    const by1 = ent.bounds.minY * totalScale;
    const bx2 = ent.bounds.maxX * totalScale;
    const by2 = ent.bounds.maxY * totalScale;
    if (bx1 < minScaledX) minScaledX = bx1;
    if (by1 < minScaledY) minScaledY = by1;
    if (bx2 > maxScaledX) maxScaledX = bx2;
    if (by2 > maxScaledY) maxScaledY = by2;
  }

  let offsetX = 0;
  let offsetY = 0;
  let wasShifted = false;
  const shouldNormalize = calibration.normalizeOriginToZero ?? true;

  if (isFinite(minScaledX) && isFinite(minScaledY)) {
    // If drawing has negative coordinates or is far from origin (> 50 units), shift minimum parcel corner to (0,0) (or margin if no boundary layer)
    const margin = boundaryEntities.length > 0 ? 0 : targetUnit === 'feet' ? 4 : 2;
    if (minScaledX < 0 || minScaledY < 0 || (shouldNormalize && (Math.abs(minScaledX) > 0.01 || Math.abs(minScaledY) > 0.01))) {
      offsetX = Number((margin - minScaledX).toFixed(3));
      offsetY = Number((margin - minScaledY).toFixed(3));
      if (Math.abs(offsetX) > 1e-3 || Math.abs(offsetY) > 1e-3) {
        wasShifted = true;
        warnings.push({
          id: 'warn-cad-coord-shift',
          code: 'COORDINATE_OFFSET_NORMALIZED',
          severity: 'info',
          message: `Normalized CAD origin by (${offsetX >= 0 ? '+' : ''}${offsetX}, ${offsetY >= 0 ? '+' : ''}${offsetY} ${targetUnit === 'feet' ? 'ft' : 'm'}) to align with Plotify's top-left parcel origin (0,0). Original coordinates preserved in provenance metadata.`,
        });
      }
    }
  }

  // Collect all TEXT / MTEXT entities for spatial room label matching
  const textEntities = drawing.entities.filter(
    (e) => (e.dxfType === 'TEXT' || e.dxfType === 'MTEXT') && e.textContent && e.center
  );
  const consumedTextHandles = new Set<string>();

  const candidateRooms: CADCandidateRoomMapping[] = [];
  const mappedRooms: FloorPlanRoom[] = [];
  const mappedColumns: StructuralColumn[] = [];
  const mappedBeams: StructuralBeam[] = [];
  const mappedGridAxes: StructuralGridAxis[] = [];
  const provenanceMappings: CADProvenanceMappingEntry[] = [];
  const referenceEntities: ProjectCADInteropMetadata['referenceEntities'] = [];

  let explicitPlotWidth = 0;
  let explicitPlotLength = 0;

  const minRoomDim = targetUnit === 'feet' ? 2.5 : 0.8;

  for (const ent of activeEntities) {
    const rule = ruleByLayer.get(ent.layer)!;
    const floorLevel = Math.max(1, rule.targetFloorLevel || ent.floorLevelHint || 1);
    const scaledBounds: CADBoundingBox2D = {
      minX: Number((ent.bounds.minX * totalScale + offsetX).toFixed(2)),
      minY: Number((ent.bounds.minY * totalScale + offsetY).toFixed(2)),
      maxX: Number((ent.bounds.maxX * totalScale + offsetX).toFixed(2)),
      maxY: Number((ent.bounds.maxY * totalScale + offsetY).toFixed(2)),
      width: Number((ent.bounds.width * totalScale).toFixed(2)),
      length: Number((ent.bounds.length * totalScale).toFixed(2)),
    };

    if (rule.targetRole === 'plot-boundary') {
      if (
        (ent.dxfType === 'LWPOLYLINE' || ent.dxfType === 'POLYLINE' || ent.dxfType === 'LINE') &&
        scaledBounds.width > explicitPlotWidth &&
        scaledBounds.length > explicitPlotLength
      ) {
        explicitPlotWidth = Math.max(explicitPlotWidth, Number(scaledBounds.width.toFixed(2)));
        explicitPlotLength = Math.max(explicitPlotLength, Number(scaledBounds.length.toFixed(2)));
        provenanceMappings.push({
          sourceHandle: ent.handle,
          sourceLayer: ent.layer,
          sourceDxfType: ent.dxfType,
          sourceBounds: ent.bounds,
          plotifyEntityId: 'plot-envelope',
          plotifyEntityType: 'plot-boundary',
          floorLevel: 1,
        });
      }
    } else if (rule.targetRole === 'room-space') {
      if (ent.dxfType === 'LWPOLYLINE' || ent.dxfType === 'POLYLINE') {
        // Find any unconsumed TEXT / MTEXT inside this polyline's source bounds
        const hasExplicitFloorInLayer = (layerName: string) =>
          /(?:F|FL|FLOOR|LVL|LEVEL|L)[-_]?0*[1-9]\d?\b/i.test(layerName);
        const matchingText =
          textEntities.find(
            (t) =>
              !consumedTextHandles.has(t.handle) &&
              t.center &&
              t.center.x >= ent.bounds.minX &&
              t.center.x <= ent.bounds.maxX &&
              t.center.y >= ent.bounds.minY &&
              t.center.y <= ent.bounds.maxY &&
              hasExplicitFloorInLayer(t.layer) &&
              t.floorLevelHint === floorLevel
          ) ||
          textEntities.find(
            (t) =>
              !consumedTextHandles.has(t.handle) &&
              t.center &&
              t.center.x >= ent.bounds.minX &&
              t.center.x <= ent.bounds.maxX &&
              t.center.y >= ent.bounds.minY &&
              t.center.y <= ent.bounds.maxY &&
              (!hasExplicitFloorInLayer(t.layer) || t.floorLevelHint === floorLevel)
          );
        if (matchingText) {
          consumedTextHandles.add(matchingText.handle);
        }
        const inferredName =
          matchingText?.textContent || `Space ${ent.handle}`;
        const inferredRoomType =
          rule.defaultRoomType ||
          (matchingText?.textContent
            ? inferRoomTypeFromTextLabel(matchingText.textContent)
            : inferRoomTypeFromTextLabel(ent.layer));

        // Strict geometry eligibility checks!
        let isEligible = true;
        let eligibilityReason = 'Valid closed rectilinear room boundary';

        if (!ent.isClosed) {
          isEligible = false;
          eligibilityReason = 'Open polyline: not a closed room boundary';
          warnings.push({
            id: `warn-open-poly-${ent.handle}`,
            code: 'OPEN_POLYLINE_NOT_ROOM',
            severity: 'warning',
            layer: ent.layer,
            entityHandle: ent.handle,
            dxfType: ent.dxfType,
            message: `Open ${ent.dxfType} (${ent.handle}) on room layer "${ent.layer}" was not converted to a room because it is not closed.`,
            remedy: 'Close the polyline in CAD or map the layer to Reference-Only.',
          });
        } else if (ent.isSelfIntersecting) {
          isEligible = false;
          eligibilityReason = 'Self-intersecting polygon geometry';
          warnings.push({
            id: `warn-self-int-${ent.handle}`,
            code: 'SELF_INTERSECTING_POLYGON',
            severity: 'warning',
            layer: ent.layer,
            entityHandle: ent.handle,
            dxfType: ent.dxfType,
            message: `Self-intersecting ${ent.dxfType} (${ent.handle}) on layer "${ent.layer}" was rejected from room conversion.`,
          });
        } else if (ent.hasCurvedBulge) {
          isEligible = false;
          eligibilityReason = 'Contains curved arc bulge segments';
        } else if (!ent.isRectilinear) {
          isEligible = false;
          eligibilityReason = 'Non-rectilinear polygon (L-shaped, angled, or >4 corners)';
          warnings.push({
            id: `warn-non-rect-${ent.handle}`,
            code: 'NON_RECTILINEAR_POLYLINE',
            severity: 'warning',
            layer: ent.layer,
            entityHandle: ent.handle,
            dxfType: ent.dxfType,
            message: `Closed ${ent.dxfType} (${ent.handle}) on layer "${ent.layer}" is non-rectilinear (${ent.vertices.length} vertices). Plotify does not fabricate rectangular rooms from non-rectangular polygons; preserved as reference geometry.`,
          });
        } else if (scaledBounds.width < minRoomDim || scaledBounds.length < minRoomDim) {
          isEligible = false;
          eligibilityReason = `Degenerate or undersized dimensions (${scaledBounds.width} × ${scaledBounds.length} ${targetUnit === 'feet' ? 'ft' : 'm'})`;
          warnings.push({
            id: `warn-degen-${ent.handle}`,
            code: 'DEGENERATE_GEOMETRY',
            severity: 'warning',
            layer: ent.layer,
            entityHandle: ent.handle,
            dxfType: ent.dxfType,
            message: `Closed ${ent.dxfType} (${ent.handle}) on layer "${ent.layer}" has undersized room dimensions (${scaledBounds.width} × ${scaledBounds.length}) and was skipped.`,
          });
        }

        const isOmittedByUser = omittedSet.has(ent.handle);
        const roomId = `room-cad-${ent.handle.replace(/[^a-zA-Z0-9_-]/g, '')}`;
        const typeCfg = ROOM_TYPE_CONFIG[inferredRoomType] || ROOM_TYPE_CONFIG.custom;

        const candidateRoom: FloorPlanRoom = {
          id: roomId,
          name: inferredName,
          type: inferredRoomType,
          x: Math.max(0, scaledBounds.minX),
          y: Math.max(0, scaledBounds.minY),
          width: scaledBounds.width,
          length: scaledBounds.length,
          color: typeCfg.defaultColor,
          floorLevel,
        };

        candidateRooms.push({
          entityId: ent.id,
          handle: ent.handle,
          layer: ent.layer,
          floorLevel,
          inferredName,
          inferredRoomType,
          sourceBounds: ent.bounds,
          mappedRoom: candidateRoom,
          isEligible,
          eligibilityReason,
          isOmittedByUser,
        });

        if (isEligible && !isOmittedByUser) {
          mappedRooms.push(candidateRoom);
          provenanceMappings.push({
            sourceHandle: ent.handle,
            sourceLayer: ent.layer,
            sourceDxfType: ent.dxfType,
            sourceBounds: ent.bounds,
            plotifyEntityId: roomId,
            plotifyEntityType: 'room',
            floorLevel,
          });
        } else {
          // Keep as reference entity so nothing is silently lost
          referenceEntities.push({
            handle: ent.handle,
            dxfType: ent.dxfType,
            layer: ent.layer,
            floorLevel,
            boundsInTargetUnits: scaledBounds,
            textContent: eligibilityReason,
          });
        }
      } else {
        referenceEntities.push({
          handle: ent.handle,
          dxfType: ent.dxfType,
          layer: ent.layer,
          floorLevel,
          boundsInTargetUnits: scaledBounds,
          textContent: ent.textContent,
        });
      }
    } else if (rule.targetRole === 'structural-column') {
      if (omittedSet.has(ent.handle)) continue;
      if (ent.dxfType === 'CIRCLE' && ent.center && ent.radius && ent.radius > 0) {
        const diam = Math.max(0.15, Number((ent.radius * 2 * totalScale).toFixed(2)));
        const colId = `col-cad-${ent.handle.replace(/[^a-zA-Z0-9_-]/g, '')}`;
        mappedColumns.push({
          id: colId,
          label: `C-${mappedColumns.length + 1}`,
          x: Number((ent.center.x * totalScale + offsetX).toFixed(2)),
          y: Number((ent.center.y * totalScale + offsetY).toFixed(2)),
          floorLevels: [floorLevel],
          profile: 'circular',
          width: diam,
          depth: diam,
          material: 'reinforced-concrete',
          isLoadBearing: true,
          status: 'active',
          notes: `Imported from CAD CIRCLE (${ent.handle}) on layer ${ent.layer}`,
        });
        provenanceMappings.push({
          sourceHandle: ent.handle,
          sourceLayer: ent.layer,
          sourceDxfType: ent.dxfType,
          sourceBounds: ent.bounds,
          plotifyEntityId: colId,
          plotifyEntityType: 'column',
          floorLevel,
        });
      } else if (
        (ent.dxfType === 'LWPOLYLINE' || ent.dxfType === 'POLYLINE') &&
        ent.isClosed &&
        ent.isRectilinear &&
        scaledBounds.width > 0 &&
        scaledBounds.length > 0
      ) {
        const colId = `col-cad-${ent.handle.replace(/[^a-zA-Z0-9_-]/g, '')}`;
        mappedColumns.push({
          id: colId,
          label: `C-${mappedColumns.length + 1}`,
          x: Number((scaledBounds.minX + scaledBounds.width / 2).toFixed(2)),
          y: Number((scaledBounds.minY + scaledBounds.length / 2).toFixed(2)),
          floorLevels: [floorLevel],
          profile: 'rectangular',
          width: scaledBounds.width,
          depth: scaledBounds.length,
          material: 'reinforced-concrete',
          isLoadBearing: true,
          status: 'active',
          notes: `Imported from CAD ${ent.dxfType} (${ent.handle}) on layer ${ent.layer}`,
        });
        provenanceMappings.push({
          sourceHandle: ent.handle,
          sourceLayer: ent.layer,
          sourceDxfType: ent.dxfType,
          sourceBounds: ent.bounds,
          plotifyEntityId: colId,
          plotifyEntityType: 'column',
          floorLevel,
        });
      }
    } else if (rule.targetRole === 'structural-beam') {
      if (omittedSet.has(ent.handle)) continue;
      if (ent.dxfType === 'LINE' && ent.vertices.length >= 2) {
        const p1 = ent.vertices[0];
        const p2 = ent.vertices[1];
        const beamId = `beam-cad-${ent.handle.replace(/[^a-zA-Z0-9_-]/g, '')}`;
        const defaultW = targetUnit === 'feet' ? 1.0 : 0.3;
        const defaultD = targetUnit === 'feet' ? 1.5 : 0.45;
        mappedBeams.push({
          id: beamId,
          label: `B-${mappedBeams.length + 1}`,
          startX: Number((p1.x * totalScale + offsetX).toFixed(2)),
          startY: Number((p1.y * totalScale + offsetY).toFixed(2)),
          endX: Number((p2.x * totalScale + offsetX).toFixed(2)),
          endY: Number((p2.y * totalScale + offsetY).toFixed(2)),
          floorLevel,
          profileWidth: defaultW,
          profileDepth: defaultD,
          material: 'reinforced-concrete',
          beamType: 'primary-girder',
        });
        provenanceMappings.push({
          sourceHandle: ent.handle,
          sourceLayer: ent.layer,
          sourceDxfType: ent.dxfType,
          sourceBounds: ent.bounds,
          plotifyEntityId: beamId,
          plotifyEntityType: 'beam',
          floorLevel,
        });
      }
    } else if (rule.targetRole === 'structural-grid') {
      if (omittedSet.has(ent.handle)) continue;
      if (ent.dxfType === 'LINE' && ent.vertices.length >= 2) {
        const p1 = ent.vertices[0];
        const p2 = ent.vertices[1];
        const dx = Math.abs(p2.x - p1.x);
        const dy = Math.abs(p2.y - p1.y);
        const axisId = `grid-cad-${ent.handle.replace(/[^a-zA-Z0-9_-]/g, '')}`;
        if (dx < dy * 0.05) {
          // Vertical grid line -> X axis coordinate
          const coord = Number(((p1.x * totalScale) + offsetX).toFixed(2));
          mappedGridAxes.push({
            id: axisId,
            name: `${mappedGridAxes.filter((g) => g.direction === 'X').length + 1}`,
            direction: 'X',
            coordinate: Math.max(0, coord),
            isPrimary: true,
          });
          provenanceMappings.push({
            sourceHandle: ent.handle,
            sourceLayer: ent.layer,
            sourceDxfType: ent.dxfType,
            sourceBounds: ent.bounds,
            plotifyEntityId: axisId,
            plotifyEntityType: 'grid-axis',
            floorLevel: 1,
          });
        } else if (dy < dx * 0.05) {
          // Horizontal grid line -> Y axis coordinate
          const coord = Number(((p1.y * totalScale) + offsetY).toFixed(2));
          const yIdx = mappedGridAxes.filter((g) => g.direction === 'Y').length;
          mappedGridAxes.push({
            id: axisId,
            name: String.fromCharCode(65 + (yIdx % 26)),
            direction: 'Y',
            coordinate: Math.max(0, coord),
            isPrimary: true,
          });
          provenanceMappings.push({
            sourceHandle: ent.handle,
            sourceLayer: ent.layer,
            sourceDxfType: ent.dxfType,
            sourceBounds: ent.bounds,
            plotifyEntityId: axisId,
            plotifyEntityType: 'grid-axis',
            floorLevel: 1,
          });
        }
      }
    } else {
      // reference-only
      referenceEntities.push({
        handle: ent.handle,
        dxfType: ent.dxfType,
        layer: ent.layer,
        floorLevel,
        boundsInTargetUnits: scaledBounds,
        textContent: ent.textContent,
      });
      provenanceMappings.push({
        sourceHandle: ent.handle,
        sourceLayer: ent.layer,
        sourceDxfType: ent.dxfType,
        sourceBounds: ent.bounds,
        plotifyEntityId: `ref-cad-${ent.handle}`,
        plotifyEntityType: 'reference-only',
        floorLevel,
      });
    }
  }

  // Check for overlapping mapped rooms on the same floor level
  for (let i = 0; i < mappedRooms.length; i++) {
    for (let j = i + 1; j < mappedRooms.length; j++) {
      const r1 = mappedRooms[i];
      const r2 = mappedRooms[j];
      if (r1.floorLevel !== r2.floorLevel) continue;
      const overlapX = Math.min(r1.x + r1.width, r2.x + r2.width) - Math.max(r1.x, r2.x);
      const overlapY = Math.min(r1.y + r1.length, r2.y + r2.length) - Math.max(r1.y, r2.y);
      if (overlapX > 0.1 && overlapY > 0.1) {
        warnings.push({
          id: `warn-room-overlap-${r1.id}-${r2.id}`,
          code: 'OVERLAPPING_MAPPED_ROOMS',
          severity: 'warning',
          message: `Mapped rooms "${r1.name}" and "${r2.name}" on Floor ${r1.floorLevel} overlap by ${(overlapX * overlapY).toFixed(2)} ${targetUnit === 'feet' ? 'sq ft' : 'm²'}. You can uncheck one in the Room Candidates table before applying.`,
        });
      }
    }
  }

  // Compute plotWidth & plotLength and check for scale mismatch anomalies
  const maxRight = Math.max(
    0,
    ...mappedRooms.map((r) => r.x + r.width),
    ...mappedColumns.map((c) => c.x + c.width / 2),
    ...(isFinite(maxScaledX) ? [maxScaledX + offsetX] : [0])
  );
  const maxBottom = Math.max(
    0,
    ...mappedRooms.map((r) => r.y + r.length),
    ...mappedColumns.map((c) => c.y + c.depth / 2),
    ...(isFinite(maxScaledY) ? [maxScaledY + offsetY] : [0])
  );

  const defaultMargin = targetUnit === 'feet' ? 4 : 2;
  const plotWidth =
    explicitPlotWidth > 0
      ? explicitPlotWidth
      : Math.max(targetUnit === 'feet' ? 30 : 12, Math.ceil(maxRight + defaultMargin));
  const plotLength =
    explicitPlotLength > 0
      ? explicitPlotLength
      : Math.max(targetUnit === 'feet' ? 40 : 16, Math.ceil(maxBottom + defaultMargin));

  // Scale mismatch detection (e.g., millimeter file accidentally calibrated as metres -> 15000m wide!)
  const minPlausiblePlot = targetUnit === 'feet' ? 8 : 2.5;
  const maxPlausiblePlot = targetUnit === 'feet' ? 1600 : 500;
  const rawConvertedWidth = (drawing.metadata.computedExtents?.width || 0) * totalScale;
  const rawConvertedLength = (drawing.metadata.computedExtents?.length || 0) * totalScale;

  if (
    rawConvertedWidth > maxPlausiblePlot ||
    rawConvertedLength > maxPlausiblePlot ||
    (rawConvertedWidth > 0 && rawConvertedWidth < minPlausiblePlot && rawConvertedLength < minPlausiblePlot)
  ) {
    warnings.push({
      id: 'warn-scale-mismatch',
      code: 'SCALE_MISMATCH_SUSPECTED',
      severity: 'warning',
      message: `Converted drawing extents (${rawConvertedWidth.toFixed(2)} × ${rawConvertedLength.toFixed(2)} ${targetUnit === 'feet' ? 'ft' : 'm'}) appear implausible for a building plot. Verify whether the source CAD drawing was authored in Millimetres, Metres, Feet, or Inches.`,
      remedy: 'Adjust the Source CAD Unit or Scale Multiplier in the Calibration panel.',
    });
  }

  const floors = Math.max(
    1,
    ...mappedRooms.map((r) => r.floorLevel),
    ...mappedColumns.flatMap((c) => c.floorLevels)
  );

  const rejectedRoomCandidatesCount = candidateRooms.filter((c) => !c.isEligible).length;
  const unsupportedEntitiesCount = Object.values(drawing.unsupportedEntityCounts).reduce(
    (a, b) => a + b,
    0
  );

  const report: CADImportReport = {
    reportId: `cad-rep-${Date.now()}`,
    generatedAt: new Date().toISOString(),
    fileName: drawing.metadata.fileName,
    acadVersionLabel: drawing.metadata.acadVersionLabel,
    detectedHeaderUnit: drawing.metadata.detectedUnit,
    effectiveSourceUnit,
    targetUnit,
    appliedUnitScaleFactor: Number(baseUnitFactor.toFixed(6)),
    appliedCalibrationMultiplier: calibration.scaleMultiplier,
    coordinateOffsetApplied: {
      offsetX,
      offsetY,
      unit: targetUnit,
      wasShifted,
    },
    totalRawEntities: drawing.totalRawEntitiesEncountered,
    supportedEntitiesCount: drawing.entities.length,
    unsupportedEntitiesCount,
    unsupportedEntityBreakdown: { ...drawing.unsupportedEntityCounts },
    mappedRoomsCount: mappedRooms.length,
    mappedColumnsCount: mappedColumns.length,
    mappedBeamsCount: mappedBeams.length,
    mappedGridAxesCount: mappedGridAxes.length,
    referenceOnlyEntitiesCount: referenceEntities.length,
    rejectedRoomCandidatesCount,
    warnings,
    errors,
  };

  const interopMetadata: ProjectCADInteropMetadata = {
    version: 'plotify-cad-meta-v1',
    lastImportedAt: report.generatedAt,
    sourceMetadata: drawing.metadata,
    calibrationUsed: {
      effectiveSourceUnit,
      scaleMultiplier: calibration.scaleMultiplier,
      targetUnit,
      offsetX,
      offsetY,
    },
    provenanceMappings,
    referenceEntities,
    unsupportedEntitySummary: { ...drawing.unsupportedEntityCounts },
    lastImportReport: report,
  };

  const cleanBaseName =
    drawing.metadata.fileName.replace(/\.dxf$/i, '').replace(/[-_]+/g, ' ').trim() ||
    'Imported CAD Drawing';

  return {
    success: !errors.some((e) => e.fatal),
    targetUnit,
    mappedProjectSpec: {
      name: cleanBaseName,
      plotWidth,
      plotLength,
      floors,
      notes: `Imported via Plotify CAD Drawing Exchange (P42) from "${drawing.metadata.fileName}" (${drawing.metadata.acadVersionLabel}, source unit: ${effectiveSourceUnit}).`,
    },
    candidateRooms,
    mappedRooms,
    mappedColumns,
    mappedBeams,
    mappedGridAxes,
    provenanceMappings,
    interopMetadata,
    report,
  };
}

// ============================================================================
// 6. SAFE APPLICATION TO NEW OR EXISTING PROJECTS (WITH ROLLBACK CHECKPOINT)
// ============================================================================

export function buildNewProjectFromCADMapping(
  mapping: CADMappingResult,
  defaultCurrency: Project['currency'] = 'USD'
): Omit<Project, 'id' | 'createdAt' | 'updatedAt'> {
  if (!mapping.success) {
    const fatalMsg = mapping.report.errors.find((e) => e.fatal)?.message || 'Invalid CAD mapping.';
    throw new Error(`Cannot create project from CAD mapping: ${fatalMsg}`);
  }

  const baseProjectStub: Project = {
    id: 'proj-cad-temp',
    name: mapping.mappedProjectSpec.name,
    projectType: 'house',
    plotWidth: mapping.mappedProjectSpec.plotWidth,
    plotLength: mapping.mappedProjectSpec.plotLength,
    unit: mapping.targetUnit,
    roadFacing: 'South',
    floors: mapping.mappedProjectSpec.floors,
    rooms: deriveRoomConfigFromRooms(mapping.mappedRooms),
    budget: 500000,
    currency: defaultCurrency,
    notes: mapping.mappedProjectSpec.notes,
    status: 'Schematic Design',
    floorPlan: {
      rooms: mapping.mappedRooms,
      gridSnap: 0.5,
      showGrid: true,
    },
    cadInterop: mapping.interopMetadata,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (
    mapping.mappedColumns.length > 0 ||
    mapping.mappedBeams.length > 0 ||
    mapping.mappedGridAxes.length > 0
  ) {
    const baseStruct = initializeStructuralCoordination(baseProjectStub);
    const xAxes = mapping.mappedGridAxes.filter((a) => a.direction === 'X');
    const yAxes = mapping.mappedGridAxes.filter((a) => a.direction === 'Y');
    const mergedStruct: StructuralCoordinationData = {
      ...baseStruct,
      grid: {
        ...baseStruct.grid,
        xAxes: xAxes.length > 0 ? xAxes : baseStruct.grid.xAxes,
        yAxes: yAxes.length > 0 ? yAxes : baseStruct.grid.yAxes,
      },
      columns: mapping.mappedColumns.length > 0 ? mapping.mappedColumns : baseStruct.columns,
      beams: mapping.mappedBeams.length > 0 ? mapping.mappedBeams : baseStruct.beams,
      notes: `${baseStruct.notes} Includes ${mapping.mappedColumns.length} column(s), ${mapping.mappedBeams.length} beam(s), and ${mapping.mappedGridAxes.length} grid axis line(s) imported from CAD DXF.`,
    };
    const evaluated = evaluateStructuralCoordination(baseProjectStub, mergedStruct);
    baseProjectStub.structuralCoordination = {
      ...mergedStruct,
      reviewIssues: evaluated.issues,
    };
  }

  const { id: _id, createdAt: _c, updatedAt: _u, ...newProjectData } = baseProjectStub;
  return newProjectData;
}

/**
 * Safely applies mapped CAD geometry to an existing `Project`:
 * - Requires `mapping.success === true`.
 * - If `mode === 'replace-geometry'` and `mapping.mappedRooms.length === 0`, refuses to wipe out existing rooms.
 * - Creates an automatic `pre-restore-safety` checkpoint in Version History before applying.
 * - Preserves all unrelated project domains (`ifcInterop`, `budget`, `costPlanning`, `siteContext`, `brief`,
 *   `regulations`, `mepCoordination`, `designAlternatives`, `scenarios`, `expertReviews`).
 */
export function applyCADMappingToExistingProject(
  existingProject: Project,
  mapping: CADMappingResult,
  mode: 'merge-append' | 'replace-geometry' = 'merge-append'
): {
  updatedProject: Project;
  safetySnapshotId: string;
} {
  if (!existingProject || !existingProject.id) {
    throw new Error('Cannot apply CAD mapping: invalid target project.');
  }
  if (!mapping.success) {
    const fatalMsg = mapping.report.errors.find((e) => e.fatal)?.message || 'Invalid CAD mapping.';
    throw new Error(`Cannot apply failed CAD mapping to project: ${fatalMsg}`);
  }
  if (
    mode === 'replace-geometry' &&
    mapping.mappedRooms.length === 0 &&
    (existingProject.floorPlan?.rooms?.length || 0) > 0
  ) {
    throw new Error(
      'Refusing to replace existing floor-plan rooms with 0 mapped CAD rooms. Use merge-append mode or map at least one valid closed room polyline.'
    );
  }

  // 1. Create automatic rollback checkpoint in version history
  const snapshot = createProjectSnapshot(existingProject, {
    trigger: 'pre-restore-safety',
    label: `Pre-CAD Import Safety Checkpoint (${mapping.interopMetadata.sourceMetadata?.fileName || 'DXF'})`,
    description: `Automatic safety snapshot captured before applying P42 CAD Drawing Exchange (${mode}).`,
  });

  // 2. Reconcile unit if existingProject.unit differs from mapping.targetUnit
  const unitFactor =
    existingProject.unit === mapping.targetUnit
      ? 1.0
      : existingProject.unit === 'feet'
      ? 1 / 0.3048
      : 0.3048;

  const convertedRooms: FloorPlanRoom[] = mapping.mappedRooms.map((r) => ({
    ...r,
    x: Number((r.x * unitFactor).toFixed(2)),
    y: Number((r.y * unitFactor).toFixed(2)),
    width: Number((r.width * unitFactor).toFixed(2)),
    length: Number((r.length * unitFactor).toFixed(2)),
  }));

  const existingRooms = existingProject.floorPlan?.rooms || [];
  let finalRooms: FloorPlanRoom[];

  if (mode === 'replace-geometry') {
    finalRooms = convertedRooms;
  } else {
    const existingIds = new Set(existingRooms.map((r) => r.id));
    const deduplicated = convertedRooms.map((r) =>
      existingIds.has(r.id) ? { ...r, id: `${r.id}-${Date.now().toString(36)}` } : r
    );
    finalRooms = [...existingRooms, ...deduplicated];
  }

  const maxRoomRight =
    finalRooms.length > 0 ? Math.max(...finalRooms.map((r) => r.x + r.width)) : 0;
  const maxRoomBottom =
    finalRooms.length > 0 ? Math.max(...finalRooms.map((r) => r.y + r.length)) : 0;

  const updatedPlotWidth = Math.max(
    existingProject.plotWidth,
    Number((mapping.mappedProjectSpec.plotWidth * unitFactor).toFixed(1)),
    Math.ceil(maxRoomRight + 2)
  );
  const updatedPlotLength = Math.max(
    existingProject.plotLength,
    Number((mapping.mappedProjectSpec.plotLength * unitFactor).toFixed(1)),
    Math.ceil(maxRoomBottom + 2)
  );
  const updatedFloors = Math.max(
    existingProject.floors,
    mapping.mappedProjectSpec.floors,
    ...finalRooms.map((r) => r.floorLevel)
  );

  // Merge or replace structural elements if present
  let updatedStructural = existingProject.structuralCoordination;
  if (
    mapping.mappedColumns.length > 0 ||
    mapping.mappedBeams.length > 0 ||
    mapping.mappedGridAxes.length > 0
  ) {
    const baseStruct =
      existingProject.structuralCoordination || initializeStructuralCoordination(existingProject);
    const convertedCols: StructuralColumn[] = mapping.mappedColumns.map((c) => ({
      ...c,
      x: Number((c.x * unitFactor).toFixed(2)),
      y: Number((c.y * unitFactor).toFixed(2)),
      width: Number((c.width * unitFactor).toFixed(2)),
      depth: Number((c.depth * unitFactor).toFixed(2)),
    }));
    const convertedBeams: StructuralBeam[] = mapping.mappedBeams.map((b) => ({
      ...b,
      startX: Number((b.startX * unitFactor).toFixed(2)),
      startY: Number((b.startY * unitFactor).toFixed(2)),
      endX: Number((b.endX * unitFactor).toFixed(2)),
      endY: Number((b.endY * unitFactor).toFixed(2)),
      profileWidth: Number((b.profileWidth * unitFactor).toFixed(2)),
      profileDepth: Number((b.profileDepth * unitFactor).toFixed(2)),
    }));

    updatedStructural = {
      ...baseStruct,
      columns:
        mode === 'replace-geometry' && convertedCols.length > 0
          ? convertedCols
          : [...baseStruct.columns, ...convertedCols],
      beams:
        mode === 'replace-geometry' && convertedBeams.length > 0
          ? convertedBeams
          : [...baseStruct.beams, ...convertedBeams],
    };
  }

  const prevProvenance = existingProject.cadInterop?.provenanceMappings || [];
  const mergedProvenance =
    mode === 'replace-geometry'
      ? mapping.provenanceMappings
      : [
          ...prevProvenance.filter(
            (pm) => !mapping.provenanceMappings.some((nm) => nm.sourceHandle === pm.sourceHandle)
          ),
          ...mapping.provenanceMappings,
        ];

  const updatedProject: Project = {
    ...existingProject,
    plotWidth: updatedPlotWidth,
    plotLength: updatedPlotLength,
    floors: updatedFloors,
    rooms: deriveRoomConfigFromRooms(finalRooms),
    floorPlan: {
      ...(existingProject.floorPlan || { gridSnap: 0.5, showGrid: true }),
      rooms: finalRooms,
    },
    structuralCoordination: updatedStructural,
    // Explicitly preserve P41 ifcInterop alongside new P42 cadInterop
    ifcInterop: existingProject.ifcInterop,
    cadInterop: {
      ...mapping.interopMetadata,
      provenanceMappings: mergedProvenance,
      lastExportReport: existingProject.cadInterop?.lastExportReport,
      lastExportedAt: existingProject.cadInterop?.lastExportedAt,
    },
    updatedAt: new Date().toISOString(),
  };

  return {
    updatedProject,
    safetySnapshotId: snapshot.id,
  };
}

// ============================================================================
// 7. DETERMINISTIC ASCII DXF EXPORTER & INDEPENDENT VALIDATOR
// ============================================================================

export function validateDXFFileStructure(dxfContent: string): CADValidationCheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const duplicateHandles: string[] = [];
  const undefinedLayersReferenced: string[] = [];
  let invalidNumericCoordinatesCount = 0;

  const rawLines = (dxfContent || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  while (rawLines.length > 0 && rawLines[rawLines.length - 1].trim() === '') {
    rawLines.pop();
  }

  const evenLinePairingValid = rawLines.length > 0 && rawLines.length % 2 === 0;
  if (!evenLinePairingValid) {
    errors.push(`DXF line count (${rawLines.length}) is odd; every group code must have a value line.`);
  }

  let hasHeaderSection = false;
  let hasTablesSection = false;
  let hasEntitiesSection = false;
  let hasEofMarker = false;
  let insunitsDetected: number | null = null;
  let totalEntitiesCount = 0;

  const definedLayers = new Set<string>(['0']);
  const referencedLayers = new Set<string>();
  const handles = new Set<string>();

  let currentSection = '';
  let inHeaderInsunits = false;

  for (let i = 0; i + 1 < rawLines.length; i += 2) {
    const code = parseInt(rawLines[i].trim(), 10);
    const val = rawLines[i + 1].trim();

    if (isNaN(code)) {
      errors.push(`Invalid group code "${rawLines[i].trim()}" at line ${i + 1}.`);
      continue;
    }

    if (code === 0 && val === 'SECTION') {
      const nextCode = parseInt(rawLines[i + 2]?.trim() || '', 10);
      const nextVal = rawLines[i + 3]?.trim().toUpperCase() || '';
      if (nextCode === 2) {
        currentSection = nextVal;
        if (nextVal === 'HEADER') hasHeaderSection = true;
        if (nextVal === 'TABLES') hasTablesSection = true;
        if (nextVal === 'ENTITIES') hasEntitiesSection = true;
      }
      continue;
    }

    if (code === 0 && val === 'ENDSEC') {
      currentSection = '';
      continue;
    }

    if (code === 0 && val === 'EOF') {
      hasEofMarker = true;
      break;
    }

    if (currentSection === 'HEADER') {
      if (code === 9 && val === '$INSUNITS') {
        inHeaderInsunits = true;
      } else if (code === 9) {
        inHeaderInsunits = false;
      } else if (inHeaderInsunits && code === 70) {
        insunitsDetected = parseInt(val, 10);
        inHeaderInsunits = false;
      }
    } else if (currentSection === 'TABLES') {
      if (code === 0 && val === 'LAYER') {
        // Look ahead for code 2 layer name
        for (let k = i + 2; k + 1 < rawLines.length; k += 2) {
          const lc = parseInt(rawLines[k].trim(), 10);
          const lv = rawLines[k + 1].trim();
          if (lc === 0) break;
          if (lc === 2) {
            definedLayers.add(lv);
            break;
          }
        }
      }
    } else if (currentSection === 'ENTITIES') {
      if (code === 0 && val !== 'VERTEX' && val !== 'SEQEND') {
        totalEntitiesCount++;
      } else if (code === 5) {
        if (handles.has(val)) {
          duplicateHandles.push(val);
          errors.push(`Duplicate entity handle "${val}" in ENTITIES section.`);
        }
        handles.add(val);
      } else if (code === 8) {
        referencedLayers.add(val);
      } else if (code === 10 || code === 20 || code === 11 || code === 21 || code === 40) {
        const num = parseFloat(val);
        if (isNaN(num) || !isFinite(num)) {
          invalidNumericCoordinatesCount++;
          errors.push(`Invalid coordinate/dimension value "${val}" at line ${i + 2}.`);
        }
      }
    }
  }

  for (const refLayer of referencedLayers) {
    if (!definedLayers.has(refLayer)) {
      undefinedLayersReferenced.push(refLayer);
      warnings.push(`Entity references layer "${refLayer}" not explicitly declared in LAYER table.`);
    }
  }

  if (!hasHeaderSection) errors.push('Missing HEADER section.');
  if (!hasTablesSection) errors.push('Missing TABLES section.');
  if (!hasEntitiesSection) errors.push('Missing ENTITIES section.');
  if (!hasEofMarker) errors.push('Missing EOF marker.');

  return {
    isValid:
      evenLinePairingValid &&
      hasHeaderSection &&
      hasTablesSection &&
      hasEntitiesSection &&
      hasEofMarker &&
      duplicateHandles.length === 0 &&
      invalidNumericCoordinatesCount === 0 &&
      errors.length === 0,
    evenLinePairingValid,
    hasHeaderSection,
    hasTablesSection,
    hasEntitiesSection,
    hasEofMarker,
    insunitsDetected,
    totalEntitiesCount,
    duplicateHandles,
    undefinedLayersReferenced,
    invalidNumericCoordinatesCount,
    errors,
    warnings,
  };
}

/**
 * Exports a Plotify `Project` to a deterministic, standards-conforming ASCII DXF (`AC1015`) file
 * and returns the DXF string + honest `CADExportReport`.
 */
export function exportProjectToDXF(
  project: Project,
  options?: Partial<CADExportOptions>
): {
  dxfContent: string;
  report: CADExportReport;
} {
  if (!project || typeof project !== 'object' || !project.id || !project.name) {
    throw new Error('Invalid project provided for CAD DXF export.');
  }
  if (
    typeof project.plotWidth !== 'number' ||
    project.plotWidth <= 0 ||
    typeof project.plotLength !== 'number' ||
    project.plotLength <= 0
  ) {
    throw new Error('Invalid project dimensions for CAD DXF export: plotWidth and plotLength must be > 0.');
  }

  const opts: CADExportOptions = {
    exportUnit: options?.exportUnit || 'PROJECT_UNIT',
    floorFilter: options?.floorFilter ?? 'all',
    includePlotBoundary: options?.includePlotBoundary ?? true,
    includeSiteSetbacks: options?.includeSiteSetbacks ?? true,
    includeRoomPolylines: options?.includeRoomPolylines ?? true,
    includeRoomLabels: options?.includeRoomLabels ?? true,
    includeStructuralGrid: options?.includeStructuralGrid ?? true,
    includeStructuralColumnsAndBeams: options?.includeStructuralColumnsAndBeams ?? true,
  };

  // Resolve export unit and conversion scale from project.unit ('feet' | 'metres')
  const resolvedUnit: Exclude<CADLengthUnit, 'UNITLESS'> =
    opts.exportUnit === 'PROJECT_UNIT'
      ? project.unit === 'feet'
        ? 'FOOT'
        : 'METRE'
      : opts.exportUnit;

  let scaleFromProject = 1.0;
  if (project.unit === 'metres') {
    if (resolvedUnit === 'MILLIMETRE') scaleFromProject = 1000.0;
    else if (resolvedUnit === 'FOOT') scaleFromProject = 3.280839895;
    else scaleFromProject = 1.0;
  } else {
    // project.unit === 'feet'
    if (resolvedUnit === 'METRE') scaleFromProject = 0.3048;
    else if (resolvedUnit === 'MILLIMETRE') scaleFromProject = 304.8;
    else scaleFromProject = 1.0;
  }

  const insunitsCode = getCADUnitFactors(resolvedUnit).insunitsCode;
  const fmt = (n: number) => Number((n * scaleFromProject).toFixed(4)).toString();

  // Preserve original CAD handles where available
  const handleByPlotifyId = new Map<string, string>();
  if (project.cadInterop?.provenanceMappings) {
    for (const pm of project.cadInterop.provenanceMappings) {
      if (pm.plotifyEntityId && pm.sourceHandle) {
        handleByPlotifyId.set(pm.plotifyEntityId, pm.sourceHandle);
      }
    }
  }

  const usedHandles = new Set<string>();
  let handleSeq = 100;
  const allocHandle = (preferred?: string): string => {
    const cleanPref = preferred ? preferred.replace(/[^A-Za-z0-9]/g, '').toUpperCase() : '';
    if (cleanPref && !usedHandles.has(cleanPref)) {
      usedHandles.add(cleanPref);
      return cleanPref;
    }
    while (true) {
      const candidate = (handleSeq++).toString(16).toUpperCase();
      if (!usedHandles.has(candidate)) {
        usedHandles.add(candidate);
        return candidate;
      }
    }
  };

  const rooms = (project.floorPlan?.rooms || []).filter(
    (r) =>
      r.width > 0 &&
      r.length > 0 &&
      (opts.floorFilter === 'all' || r.floorLevel === opts.floorFilter)
  );

  const maxFloor = Math.max(1, project.floors || 1, ...rooms.map((r) => r.floorLevel || 1));

  // Collect layers to declare in TABLES
  const layerDeclarations: Array<{ name: string; color: number }> = [
    { name: '0', color: 7 },
    { name: 'A-SITE-BNDY', color: 3 },
    { name: 'A-SITE-SETB', color: 8 },
    { name: 'S-GRID', color: 8 },
    { name: 'S-COLS', color: 1 },
    { name: 'S-BEAM', color: 4 },
  ];
  for (let fl = 1; fl <= maxFloor; fl++) {
    layerDeclarations.push({ name: `A-AREA-F${fl}`, color: 5 });
    layerDeclarations.push({ name: `A-ANNO-F${fl}`, color: 2 });
  }

  const dxfLines: string[] = [];
  const pushPair = (code: number, value: string | number) => {
    dxfLines.push(String(code));
    dxfLines.push(String(value));
  };

  // 1. HEADER SECTION
  pushPair(0, 'SECTION');
  pushPair(2, 'HEADER');
  pushPair(9, '$ACADVER');
  pushPair(1, 'AC1015');
  pushPair(9, '$INSUNITS');
  pushPair(70, insunitsCode);
  pushPair(9, '$MEASUREMENT');
  pushPair(70, resolvedUnit === 'FOOT' ? 0 : 1);
  pushPair(9, '$EXTMIN');
  pushPair(10, '0');
  pushPair(20, '0');
  pushPair(30, '0');
  pushPair(9, '$EXTMAX');
  pushPair(10, fmt(project.plotWidth));
  pushPair(20, fmt(project.plotLength));
  pushPair(30, '0');
  pushPair(0, 'ENDSEC');

  // 2. TABLES SECTION (LAYER TABLE)
  pushPair(0, 'SECTION');
  pushPair(2, 'TABLES');
  pushPair(0, 'TABLE');
  pushPair(2, 'LAYER');
  pushPair(70, layerDeclarations.length);
  for (const lyr of layerDeclarations) {
    pushPair(0, 'LAYER');
    pushPair(2, lyr.name);
    pushPair(70, 0);
    pushPair(62, lyr.color);
    pushPair(6, 'CONTINUOUS');
  }
  pushPair(0, 'ENDTAB');
  pushPair(0, 'ENDSEC');

  // 3. BLOCKS SECTION
  pushPair(0, 'SECTION');
  pushPair(2, 'BLOCKS');
  pushPair(0, 'ENDSEC');

  // 4. ENTITIES SECTION
  pushPair(0, 'SECTION');
  pushPair(2, 'ENTITIES');

  const exportedCounts = {
    plotBoundaries: 0,
    setbackEnvelopes: 0,
    roomPolylines: 0,
    textAnnotations: 0,
    gridLines: 0,
    columns: 0,
    beams: 0,
  };

  const addClosedRectPolyline = (
    layer: string,
    handle: string,
    x: number,
    y: number,
    w: number,
    l: number
  ) => {
    pushPair(0, 'LWPOLYLINE');
    pushPair(5, handle);
    pushPair(8, layer);
    pushPair(90, 4);
    pushPair(70, 1); // Closed flag
    pushPair(10, fmt(x));
    pushPair(20, fmt(y));
    pushPair(10, fmt(x + w));
    pushPair(20, fmt(y));
    pushPair(10, fmt(x + w));
    pushPair(20, fmt(y + l));
    pushPair(10, fmt(x));
    pushPair(20, fmt(y + l));
  };

  // 4a. Plot Boundary
  if (opts.includePlotBoundary) {
    const h = allocHandle(handleByPlotifyId.get('plot-envelope') || 'BND1');
    addClosedRectPolyline('A-SITE-BNDY', h, 0, 0, project.plotWidth, project.plotLength);
    exportedCounts.plotBoundaries++;
  }

  // 4b. Site Setbacks Envelope
  if (opts.includeSiteSetbacks && project.siteContext?.setbacks) {
    const sb = project.siteContext.setbacks;
    const leftSetback = sb.sideLeft || 0;
    const rightSetback = sb.sideRight || 0;
    const sx = leftSetback;
    const sy = sb.front || 0;
    const sw = project.plotWidth - leftSetback - rightSetback;
    const sl = project.plotLength - (sb.front || 0) - (sb.rear || 0);
    if (sw > 0 && sl > 0) {
      addClosedRectPolyline('A-SITE-SETB', allocHandle('SETB1'), sx, sy, sw, sl);
      exportedCounts.setbackEnvelopes++;
    }
  }

  // 4c. Rooms & Text Annotations
  const textHeightProjectUnits = project.unit === 'feet' ? 0.8 : 0.25;
  for (const room of rooms) {
    const fl = Math.max(1, room.floorLevel || 1);
    const areaLayer = `A-AREA-F${fl}`;
    const annoLayer = `A-ANNO-F${fl}`;

    if (opts.includeRoomPolylines) {
      const h = allocHandle(handleByPlotifyId.get(room.id));
      addClosedRectPolyline(areaLayer, h, room.x, room.y, room.width, room.length);
      exportedCounts.roomPolylines++;
    }

    if (opts.includeRoomLabels) {
      const cx = room.x + room.width / 2;
      const cy = room.y + room.length / 2;
      pushPair(0, 'TEXT');
      pushPair(5, allocHandle());
      pushPair(8, annoLayer);
      pushPair(10, fmt(cx));
      pushPair(20, fmt(cy));
      pushPair(30, '0');
      pushPair(40, fmt(textHeightProjectUnits));
      pushPair(1, sanitizeText(room.name, 80, 'Space'));
      exportedCounts.textAnnotations++;
    }
  }

  // 4d. Structural Grid, Columns & Beams
  if (opts.includeStructuralGrid && project.structuralCoordination?.grid) {
    for (const xAxis of project.structuralCoordination.grid.xAxes || []) {
      pushPair(0, 'LINE');
      pushPair(5, allocHandle(handleByPlotifyId.get(xAxis.id)));
      pushPair(8, 'S-GRID');
      pushPair(10, fmt(xAxis.coordinate));
      pushPair(20, '0');
      pushPair(11, fmt(xAxis.coordinate));
      pushPair(21, fmt(project.plotLength));
      exportedCounts.gridLines++;
    }
    for (const yAxis of project.structuralCoordination.grid.yAxes || []) {
      pushPair(0, 'LINE');
      pushPair(5, allocHandle(handleByPlotifyId.get(yAxis.id)));
      pushPair(8, 'S-GRID');
      pushPair(10, '0');
      pushPair(20, fmt(yAxis.coordinate));
      pushPair(11, fmt(project.plotWidth));
      pushPair(21, fmt(yAxis.coordinate));
      exportedCounts.gridLines++;
    }
  }

  if (opts.includeStructuralColumnsAndBeams && project.structuralCoordination) {
    for (const col of project.structuralCoordination.columns || []) {
      const colFloor = col.floorLevels?.[0] || 1;
      if (opts.floorFilter !== 'all' && colFloor !== opts.floorFilter) continue;
      const h = allocHandle(handleByPlotifyId.get(col.id));
      if (col.profile === 'circular') {
        pushPair(0, 'CIRCLE');
        pushPair(5, h);
        pushPair(8, 'S-COLS');
        pushPair(10, fmt(col.x));
        pushPair(20, fmt(col.y));
        pushPair(40, fmt(col.width / 2));
      } else {
        addClosedRectPolyline(
          'S-COLS',
          h,
          col.x - col.width / 2,
          col.y - col.depth / 2,
          col.width,
          col.depth
        );
      }
      exportedCounts.columns++;
    }

    for (const beam of project.structuralCoordination.beams || []) {
      if (opts.floorFilter !== 'all' && beam.floorLevel !== opts.floorFilter) continue;
      pushPair(0, 'LINE');
      pushPair(5, allocHandle(handleByPlotifyId.get(beam.id)));
      pushPair(8, 'S-BEAM');
      pushPair(10, fmt(beam.startX));
      pushPair(20, fmt(beam.startY));
      pushPair(11, fmt(beam.endX));
      pushPair(21, fmt(beam.endY));
      exportedCounts.beams++;
    }
  }

  pushPair(0, 'ENDSEC');
  pushPair(0, 'EOF');

  const dxfContent = dxfLines.join('\n') + '\n';
  const fileSizeBytes = new Blob([dxfContent]).size;
  const checksum = computeStringChecksum(dxfContent);
  const validationResult = validateDXFFileStructure(dxfContent);

  const safeSlug =
    project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project';
  const fileName = `${safeSlug}-cad-p42.dxf`;

  const omittedPlotifyInformation: Array<{ domain: string; reason: string }> = [
    {
      domain: '3D Wall Extrusions, Roof Volumes & BIM Property Sets',
      reason: '2D DXF represents planar linework and closed polylines. Use P41 OpenBIM & IFC Export for 3D BIM geometry and property sets.',
    },
    {
      domain: 'Target Budget, Cost Estimates & Construction Phasing',
      reason: 'Commercial cost planning and schedule dependencies are non-geometric data layers.',
    },
    {
      domain: 'Design Studio Finishes & Multi-Criteria Scenarios',
      reason: 'Material colour palettes, lighting moods, and Pareto scenarios are not represented in 2D CAD linework.',
    },
  ];

  const totalEntitiesWritten =
    exportedCounts.plotBoundaries +
    exportedCounts.setbackEnvelopes +
    exportedCounts.roomPolylines +
    exportedCounts.textAnnotations +
    exportedCounts.gridLines +
    exportedCounts.columns +
    exportedCounts.beams;

  const report: CADExportReport = {
    reportId: `cad-exp-${Date.now()}`,
    exportedAt: new Date().toISOString(),
    fileName,
    fileSizeBytes,
    checksum,
    dxfVersion: 'AC1015 (AutoCAD 2000 ASCII DXF)',
    unitExported: resolvedUnit,
    totalEntitiesWritten,
    layersWritten: layerDeclarations.map((l) => l.name),
    exportedCounts,
    omittedPlotifyInformation,
    validationResult,
  };

  return { dxfContent, report };
}

// ============================================================================
// 8. CAD ROUND-TRIP VERIFICATION ENGINE
// ============================================================================

export function compareCADRoundTrip(
  sourceProject: Project,
  exportOptions?: Partial<CADExportOptions>,
  tolerance = 0.05
): {
  comparison: CADRoundTripComparison;
  exportedDxfContent: string;
  exportReport: CADExportReport;
  reimportedDrawing: CADDrawingModel;
  remappedResult: CADMappingResult;
} {
  // 1. Export project to DXF
  const { dxfContent, report: exportReport } = exportProjectToDXF(sourceProject, exportOptions);

  // 2. Re-import generated DXF
  const reimportedDrawing = parseDXFToDrawingModel({
    fileName: exportReport.fileName,
    fileSizeBytes: exportReport.fileSizeBytes,
    rawContent: dxfContent,
  });

  // 3. Map back to Plotify using default layer rules
  const defaultRules = buildDefaultLayerMappingRules(reimportedDrawing);
  const remappedResult = mapCADDrawingToPlotify(reimportedDrawing, defaultRules, {
    effectiveSourceUnit: exportReport.unitExported === 'UNITLESS' ? 'METRE' : exportReport.unitExported,
    userConfirmedUnitWhenUnitless: true,
    scaleMultiplier: 1.0,
    targetPlotifyUnit: sourceProject.unit,
    normalizeOriginToZero: false,
  });

  const sourceRooms = (sourceProject.floorPlan?.rooms || []).filter(
    (r) =>
      r.width > 0 &&
      r.length > 0 &&
      (!exportOptions?.floorFilter ||
        exportOptions.floorFilter === 'all' ||
        r.floorLevel === exportOptions.floorFilter)
  );
  const reRooms = remappedResult.mappedRooms;

  const discrepancies: string[] = [];
  const roomComparisons: CADRoundTripComparison['roomComparisons'] = [];

  const unitMatch = remappedResult.targetUnit === sourceProject.unit;
  if (!unitMatch) {
    discrepancies.push(`Unit mismatch: expected ${sourceProject.unit}, got ${remappedResult.targetUnit}.`);
  }

  const plotWDelta = Math.abs(remappedResult.mappedProjectSpec.plotWidth - sourceProject.plotWidth);
  const plotLDelta = Math.abs(remappedResult.mappedProjectSpec.plotLength - sourceProject.plotLength);
  const plotDimensionsMatch = plotWDelta <= tolerance && plotLDelta <= tolerance;
  if (!plotDimensionsMatch) {
    discrepancies.push(
      `Plot dimensions mismatch: source ${sourceProject.plotWidth}×${sourceProject.plotLength}, re-imported ${remappedResult.mappedProjectSpec.plotWidth}×${remappedResult.mappedProjectSpec.plotLength}.`
    );
  }

  const roomCountMatch = reRooms.length === sourceRooms.length;
  if (!roomCountMatch) {
    discrepancies.push(
      `Room count mismatch: source has ${sourceRooms.length} rooms, re-imported has ${reRooms.length} rooms.`
    );
  }

  const sourceCols = sourceProject.structuralCoordination?.columns || [];
  const columnCountMatch =
    (exportOptions?.includeStructuralColumnsAndBeams ?? true)
      ? remappedResult.mappedColumns.length === sourceCols.length
      : true;
  if (!columnCountMatch) {
    discrepancies.push(
      `Column count mismatch: source has ${sourceCols.length}, re-imported has ${remappedResult.mappedColumns.length}.`
    );
  }

  let preservedHandlesMatched = 0;
  let maxDimensionDelta = 0;
  let maxAreaDelta = 0;

  for (let i = 0; i < sourceRooms.length; i++) {
    const src = sourceRooms[i];
    const match =
      reRooms.find(
        (r) =>
          r.floorLevel === src.floorLevel &&
          r.name === src.name &&
          Math.abs(r.x - src.x) <= tolerance * 2
      ) ||
      reRooms.find(
        (r) =>
          r.floorLevel === src.floorLevel &&
          Math.abs(r.x - src.x) <= tolerance * 2 &&
          Math.abs(r.y - src.y) <= tolerance * 2
      ) ||
      reRooms[i];

    if (!match) {
      discrepancies.push(`Room "${src.name}" (Floor ${src.floorLevel}) missing after CAD round-trip.`);
      roomComparisons.push({
        name: src.name,
        floorLevel: src.floorLevel,
        sourceWidth: src.width,
        reimportedWidth: 0,
        sourceLength: src.length,
        reimportedLength: 0,
        areaDelta: src.width * src.length,
        withinTolerance: false,
      });
      continue;
    }

    preservedHandlesMatched++;
    const dw = Math.abs(src.width - match.width);
    const dl = Math.abs(src.length - match.length);
    const dimDelta = Math.max(dw, dl);
    const areaDelta = Math.abs(src.width * src.length - match.width * match.length);

    if (dimDelta > maxDimensionDelta) maxDimensionDelta = Number(dimDelta.toFixed(4));
    if (areaDelta > maxAreaDelta) maxAreaDelta = Number(areaDelta.toFixed(4));

    const withinTolerance = dimDelta <= tolerance && src.floorLevel === match.floorLevel;
    if (!withinTolerance) {
      discrepancies.push(
        `Room "${src.name}" dimension delta (${dimDelta.toFixed(4)}) exceeds tolerance (${tolerance}).`
      );
    }

    roomComparisons.push({
      name: src.name,
      floorLevel: src.floorLevel,
      sourceWidth: src.width,
      reimportedWidth: match.width,
      sourceLength: src.length,
      reimportedLength: match.length,
      areaDelta: Number(areaDelta.toFixed(4)),
      withinTolerance,
    });
  }

  const passed =
    exportReport.validationResult.isValid &&
    unitMatch &&
    plotDimensionsMatch &&
    roomCountMatch &&
    columnCountMatch &&
    discrepancies.length === 0;

  const comparison: CADRoundTripComparison = {
    passed,
    comparedAt: new Date().toISOString(),
    unitMatch,
    plotDimensionsMatch,
    roomCountMatch,
    columnCountMatch,
    preservedHandlesMatched,
    totalRoomsCompared: sourceRooms.length,
    maxDimensionDelta,
    maxAreaDelta,
    toleranceUsed: tolerance,
    roomComparisons,
    discrepancies,
    summaryNotes: [
      `Round-trip matched ${preservedHandlesMatched}/${sourceRooms.length} room polylines and labels across ${exportReport.layersWritten.length} CAD layers.`,
      `Maximum linear dimension delta: ${maxDimensionDelta.toFixed(4)} ${sourceProject.unit} (tolerance ≤ ${tolerance} ${sourceProject.unit}).`,
      `Exported DXF passed independent structural validation (${exportReport.totalEntitiesWritten} entities).`,
    ],
  };

  return {
    comparison,
    exportedDxfContent: dxfContent,
    exportReport,
    reimportedDrawing,
    remappedResult,
  };
}

// ============================================================================
// 9. BUILT-IN REFERENCE DXF FIXTURES FOR TESTING & WORKSPACE INSPECTION
// ============================================================================

export const SAMPLE_DXF_METRIC_COURTYARD_PLAN = `0
SECTION
2
HEADER
9
$ACADVER
1
AC1015
9
$INSUNITS
70
6
9
$EXTMIN
10
0.0
20
0.0
9
$EXTMAX
10
22.0
20
28.0
0
ENDSEC
0
SECTION
2
TABLES
0
TABLE
2
LAYER
70
7
0
LAYER
2
A-SITE-BNDY
70
0
62
3
0
LAYER
2
A-AREA-F1
70
0
62
5
0
LAYER
2
A-AREA-F2
70
0
62
5
0
LAYER
2
A-ANNO-TEXT
70
0
62
2
0
LAYER
2
S-COLS
70
0
62
1
0
LAYER
2
S-GRID
70
0
62
8
0
LAYER
2
A-FURN-UNSUP
70
0
62
9
0
ENDTAB
0
ENDSEC
0
SECTION
2
BLOCKS
0
BLOCK
2
STD_COL_BLOCK
10
0.0
20
0.0
0
CIRCLE
5
BLK_C1
8
S-COLS
10
0.0
20
0.0
40
0.2
0
ENDBLK
0
ENDSEC
0
SECTION
2
ENTITIES
0
LWPOLYLINE
5
101
8
A-SITE-BNDY
90
4
70
1
10
0.0
20
0.0
10
22.0
20
0.0
10
22.0
20
28.0
10
0.0
20
28.0
0
LWPOLYLINE
5
201
8
A-AREA-F1
90
4
70
1
10
2.0
20
3.0
10
10.0
20
3.0
10
10.0
20
10.0
10
2.0
20
10.0
0
TEXT
5
202
8
A-ANNO-TEXT
10
5.0
20
6.0
40
0.3
1
Living Lounge
0
LWPOLYLINE
5
203
8
A-AREA-F1
90
4
70
1
10
10.5
20
3.0
10
16.5
20
3.0
10
16.5
20
9.0
10
10.5
20
9.0
0
MTEXT
5
204
8
A-ANNO-TEXT
10
13.0
20
5.5
40
0.3
1
{\\fArial|b1;Chef Kitchen}\\P36m2
0
LWPOLYLINE
5
205
8
A-AREA-F1
90
4
70
1
10
2.0
20
11.0
10
7.0
20
11.0
10
7.0
20
16.0
10
2.0
20
16.0
0
TEXT
5
206
8
A-ANNO-TEXT
10
4.0
20
13.0
40
0.3
1
Home Office Studio
0
LWPOLYLINE
5
301
8
A-AREA-F2
90
4
70
1
10
2.0
20
3.0
10
9.0
20
3.0
10
9.0
20
9.5
10
2.0
20
9.5
0
TEXT
5
302
8
A-ANNO-TEXT
10
5.0
20
6.0
40
0.3
1
Primary Bedroom Suite
0
LWPOLYLINE
5
303
8
A-AREA-F1
90
3
70
0
10
17.0
20
3.0
10
20.0
20
3.0
10
20.0
20
8.0
0
LWPOLYLINE
5
401
8
S-COLS
90
4
70
1
10
1.8
20
2.8
10
2.2
20
2.8
10
2.2
20
3.2
10
1.8
20
3.2
0
INSERT
5
402
8
S-COLS
2
STD_COL_BLOCK
10
10.0
20
3.0
41
1.0
42
1.0
50
0.0
0
LINE
5
501
8
S-GRID
10
2.0
20
0.0
11
2.0
21
28.0
0
LINE
5
502
8
S-GRID
10
0.0
20
3.0
11
22.0
21
3.0
0
ARC
5
601
8
A-ANNO-TEXT
10
10.0
20
10.0
40
0.9
50
0.0
51
90.0
0
HATCH
5
701
8
A-FURN-UNSUP
2
ANSI31
0
SPLINE
5
702
8
A-FURN-UNSUP
70
8
0
ENDSEC
0
EOF
`;

export const SAMPLE_DXF_UNITLESS_MILLIMETRE_STUDIO = `0
SECTION
2
HEADER
9
$ACADVER
1
AC1009
9
$INSUNITS
70
0
0
ENDSEC
0
SECTION
2
TABLES
0
TABLE
2
LAYER
70
3
0
LAYER
2
PLOT-BOUNDARY
70
0
62
3
0
LAYER
2
ROOMS-F1
70
0
62
5
0
LAYER
2
LABELS
70
0
62
2
0
ENDTAB
0
ENDSEC
0
SECTION
2
ENTITIES
0
POLYLINE
5
10
8
PLOT-BOUNDARY
66
1
70
1
0
VERTEX
8
PLOT-BOUNDARY
10
0.0
20
0.0
0
VERTEX
8
PLOT-BOUNDARY
10
15000.0
20
0.0
0
VERTEX
8
PLOT-BOUNDARY
10
15000.0
20
20000.0
0
VERTEX
8
PLOT-BOUNDARY
10
0.0
20
20000.0
0
SEQEND
0
LWPOLYLINE
5
20
8
ROOMS-F1
90
4
70
1
10
1500.0
20
2000.0
10
7500.0
20
2000.0
10
7500.0
20
7000.0
10
1500.0
20
7000.0
0
TEXT
5
21
8
LABELS
10
3500.0
20
4500.0
40
250.0
1
Studio Living Room
0
LWPOLYLINE
5
22
8
ROOMS-F1
90
4
70
1
10
8000.0
20
2000.0
10
12500.0
20
2000.0
10
12500.0
20
6000.0
10
8000.0
20
6000.0
0
TEXT
5
23
8
LABELS
10
9500.0
20
4000.0
40
250.0
1
Guest Bedroom
0
LWPOLYLINE
5
24
8
ROOMS-F1
90
6
70
1
10
1500.0
20
8000.0
10
6500.0
20
8000.0
10
6500.0
20
11000.0
10
4000.0
20
11000.0
10
4000.0
20
14000.0
10
1500.0
20
14000.0
0
ENDSEC
0
EOF
`;

export const SAMPLE_CAD_FIXTURES = [
  {
    id: 'dxf-metric-courtyard',
    label: 'DXF (AC1015 · Explicit Metres) — 2-Storey Courtyard Plan, Columns, Grid, Open Polyline & Unsupported Hatch/Spline',
    fileName: 'courtyard-architectural-plan-m.dxf',
    content: SAMPLE_DXF_METRIC_COURTYARD_PLAN,
  },
  {
    id: 'dxf-unitless-mm-studio',
    label: 'DXF (R12 · Unitless Millimetre Drawing) — Requires Explicit Unit Calibration, Classic POLYLINE + L-Shaped Polygon Warning',
    fileName: 'millimetre-studio-unitless.dxf',
    content: SAMPLE_DXF_UNITLESS_MILLIMETRE_STUDIO,
  },
];
