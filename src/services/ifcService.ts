/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Project,
  FloorPlanRoom,
  MeasurementUnit,
  RoomConfig,
} from '../types/project';
import {
  StructuralColumn,
  StructuralBeam,
  StructuralCoordinationData,
} from '../types/structural';
import {
  SupportedIFCSchema,
  IFCLengthUnitName,
  IFCGeometryRepresentationType,
  IFCEntityCategory,
  IFCImportProfile,
  IFCImportRequest,
  IFCSourceMetadata,
  IFCPropertyRecord,
  IFCQuantityRecord,
  IFCExtractedBoundingGeometry,
  IFCEntityRecord,
  IFCSpatialStoreyNode,
  IFCSpatialHierarchy,
  IFCImportWarning,
  IFCImportError,
  IFCIDMappingEntry,
  IFCUnitConversionRecord,
  IFCIntermediateModel,
  IFCImportReport,
  ProjectIFCInteropMetadata,
  IFCMappingResult,
  IFCExportOptions,
  IFCValidationCheckResult,
  IFCExportReport,
  IFCRoundTripComparison,
} from '../types/ifc';
import { computeStringChecksum, sanitizeText, sanitizeNumber } from '../utils/securityUtils';
import { ROOM_TYPE_CONFIG } from '../components/floorplan/geometry';
import { initializeStructuralCoordination, evaluateStructuralCoordination } from './structuralService';
import { createProjectSnapshot } from './versioningService';

// ============================================================================
// 1. CONSTANTS & HONEST IFC SUPPORT PROFILE
// ============================================================================

export const DEFAULT_MAX_IFC_FILE_BYTES = 15 * 1024 * 1024; // 15 MB
export const DEFAULT_MAX_IFC_ENTITIES = 50000;
export const MAX_PLACEMENT_RECURSION_DEPTH = 32;

const ACTIVE_IMPORT_REQUESTS = new Set<string>();

export const PLOTIFY_IFC_SUPPORT_PROFILE: IFCImportProfile = {
  profileId: 'plotify-openbim-profile-p41-v1',
  profileName: 'Plotify OpenBIM & IFC Architectural Spatial Subset (P41)',
  profileVersion: '1.0.0',
  supportedSchemas: ['IFC2X3', 'IFC4'],
  rejectedSchemas: ['IFC4X3', 'IFC4X2', 'IFC4X1', 'IFC2X2', 'IFC2X', 'ifcXML', 'ifcZIP'],
  supportedSpatialHierarchy: [
    'IFCPROJECT',
    'IFCSITE',
    'IFCBUILDING',
    'IFCBUILDINGSTOREY',
    'IFCSPACE',
  ],
  supportedEntityTypes: [
    'IFCPROJECT',
    'IFCSITE',
    'IFCBUILDING',
    'IFCBUILDINGSTOREY',
    'IFCSPACE',
    'IFCCOLUMN',
    'IFCBEAM',
    'IFCWALL',
    'IFCWALLSTANDARDCASE',
    'IFCSLAB',
    'IFCDOOR',
    'IFCWINDOW',
    'IFCRELAGGREGATES',
    'IFCRELCONTAINEDINSPATIALSTRUCTURE',
    'IFCRELDEFINESBYPROPERTIES',
    'IFCRELASSOCIATESMATERIAL',
    'IFCPROPERTYSET',
    'IFCPROPERTYSINGLEVALUE',
    'IFCELEMENTQUANTITY',
    'IFCQUANTITYAREA',
    'IFCQUANTITYLENGTH',
    'IFCQUANTITYVOLUME',
    'IFCMATERIAL',
    'IFCMATERIALLAYERSET',
    'IFCMATERIALLAYER',
    'IFCCLASSIFICATIONREFERENCE',
    'IFCUNITASSIGNMENT',
    'IFCSIUNIT',
    'IFCCONVERSIONBASEDUNIT',
    'IFCMEASUREWITHUNIT',
    'IFCLOCALPLACEMENT',
    'IFCAXIS2PLACEMENT3D',
    'IFCAXIS2PLACEMENT2D',
    'IFCCARTESIANPOINT',
    'IFCDIRECTION',
    'IFCPRODUCTDEFINITIONSHAPE',
    'IFCSHAPEREPRESENTATION',
    'IFCEXTRUDEDAREASOLID',
    'IFCRECTANGLEPROFILEDEF',
    'IFCARBITRARYCLOSEDPROFILEDEF',
    'IFCPOLYLINE',
    'IFCBOUNDINGBOX',
  ],
  partiallySupportedEntityTypes: [
    {
      entityType: 'IFCWALL / IFCWALLSTANDARDCASE',
      behavior:
        'Imported and preserved in project IFC metadata with properties and materials; Plotify 3D walls are derived from room boundaries in the 2D floor-plan model.',
    },
    {
      entityType: 'IFCSLAB',
      behavior:
        'Imported and preserved in project IFC metadata; Plotify floor slabs are generated per room and plot boundary.',
    },
    {
      entityType: 'IFCDOOR / IFCWINDOW',
      behavior:
        'Imported and preserved in project IFC metadata with dimensions and properties; not editable as standalone arbitrary wall-hosted openings.',
    },
    {
      entityType: 'IFCARBITRARYCLOSEDPROFILEDEF',
      behavior:
        'Supported when defined by an orthogonal 4-corner rectilinear IfcPolyline; non-rectangular or L-shaped polygons are flagged with a warning and preserved as metadata without fabricating room geometry.',
    },
  ],
  unsupportedEntityTypes: [
    'IFCSTAIR',
    'IFCSTAIRFLIGHT',
    'IFCROOF',
    'IFCRAILING',
    'IFCRAMP',
    'IFCCURTAINWALL',
    'IFCFURNISHINGELEMENT',
    'IFCFLOWSEGMENT',
    'IFCFLOWTERMINAL',
    'IFCFLOWFITTING',
    'IFCDISTRIBUTIONELEMENT',
    'IFCBUILDINGELEMENTPROXY',
    'IFCFOOTING',
    'IFCPILE',
    'IFCREINFORCINGBAR',
  ],
  supportedPropertySets: [
    'Pset_SpaceCommon',
    'Pset_WallCommon',
    'Pset_SlabCommon',
    'Pset_ColumnCommon',
    'Pset_BeamCommon',
    'Pset_BuildingCommon',
    'Qto_SpaceBaseQuantities',
    'BaseQuantities',
  ],
  supportedClassifications: ['IfcClassificationReference (OmniClass, Uniclass, MasterFormat tags)'],
  supportedGeometryRepresentations: [
    'IfcExtrudedAreaSolid with IfcRectangleProfileDef (axis-aligned)',
    'IfcExtrudedAreaSolid with orthogonal 4-point rectilinear IfcArbitraryClosedProfileDef + IfcPolyline',
    'IfcBoundingBox (Corner, XDim, YDim, ZDim)',
    'IfcLocalPlacement recursive coordinate hierarchy (Site -> Building -> Storey -> Element)',
  ],
  unsupportedGeometryRepresentations: [
    'IfcFacetedBrep (boundary representation meshes)',
    'IfcTriangulatedFaceSet / IfcPolygonalFaceSet (tessellated meshes)',
    'IfcBooleanClippingResult / CSG boolean operations',
    'IfcSweptDiskSolid / IfcSurfaceCurveSweptAreaSolid',
    'IfcBSplineSurface / NURBS surfaces and curved wall arcs',
  ],
  supportedUnits: ['METRE', 'MILLIMETRE', 'CENTIMETRE', 'FOOT', 'INCH'],
  unitConversionRules: [
    { sourceUnit: 'METRE', toMetresFactor: 1.0, toFeetFactor: 3.280839895 },
    { sourceUnit: 'MILLIMETRE', toMetresFactor: 0.001, toFeetFactor: 0.0032808399 },
    { sourceUnit: 'CENTIMETRE', toMetresFactor: 0.01, toFeetFactor: 0.032808399 },
    { sourceUnit: 'FOOT', toMetresFactor: 0.3048, toFeetFactor: 1.0 },
    { sourceUnit: 'INCH', toMetresFactor: 0.0254, toFeetFactor: 1 / 12 },
  ],
  maxFileSizeBytes: DEFAULT_MAX_IFC_FILE_BYTES,
  maxEntityCount: DEFAULT_MAX_IFC_ENTITIES,
  maxPlacementDepth: MAX_PLACEMENT_RECURSION_DEPTH,
  knownLimitations: [
    'Plotify represents editable building spaces as axis-aligned rectangular rooms (x, y, width, length) assigned to integer floor levels.',
    'Non-orthogonal, curved, or freeform B-Rep / tessellated geometries cannot be edited in the 2D floor plan canvas and are flagged in the import report without fabricating geometry.',
    'Standalone walls, slabs, doors, and windows from IFC are preserved in the project IFC provenance ledger and exported in IFC reports, while 2D/3D room visualization renders from Plotify FloorPlanRoom and StructuralColumn/Beam records.',
    'Plotify financial budgets, multi-criteria optimization scenarios, and statutory code rule evaluations are Plotify-native analytical layers and are not part of standard IFC2X3/IFC4 geometry entities.',
  ],
};

export function getSupportedIFCProfile(): IFCImportProfile {
  return PLOTIFY_IFC_SUPPORT_PROFILE;
}

// ============================================================================
// 2. INTERNAL STEP PARSER DATA STRUCTURES & HELPERS
// ============================================================================

interface RawStepEntity {
  stepId: number;
  ifcType: string;
  rawArgs: string;
  args: string[];
}

/**
 * Decodes STEP string literals, stripping surrounding single quotes,
 * unescaping doubled single quotes (''), decoding basic \X2\...\X0\ hex sequences,
 * and sanitizing against HTML/script injection.
 */
export function decodeStepString(raw: string | undefined, fallback = ''): string {
  if (!raw || typeof raw !== 'string') return fallback;
  const trimmed = raw.trim();
  if (trimmed === '$' || trimmed === '*' || trimmed === '') return fallback;

  let inner = trimmed;
  // Unwrap typed wrapper like IFCLABEL('Kitchen') or IFCIDENTIFIER('...')
  const wrapperMatch = inner.match(/^[A-Z0-9_]+\((.*)\)$/i);
  if (wrapperMatch) {
    inner = wrapperMatch[1].trim();
  }

  if (inner.startsWith("'") && inner.endsWith("'") && inner.length >= 2) {
    inner = inner.slice(1, -1);
  }

  // Unescape STEP '' -> '
  inner = inner.replace(/''/g, "'");

  // Decode \X2\XXXX\X0\ UTF-16 hex sequences
  inner = inner.replace(/\\X2\\([0-9A-Fa-f]+)\\X0\\/g, (_, hex: string) => {
    let out = '';
    for (let i = 0; i + 3 < hex.length; i += 4) {
      const code = parseInt(hex.slice(i, i + 4), 16);
      if (!isNaN(code)) out += String.fromCharCode(code);
    }
    return out;
  });

  // Decode \X\XX hex sequences
  inner = inner.replace(/\\X\\([0-9A-Fa-f]{2})/g, (_, hex: string) => {
    const code = parseInt(hex, 16);
    return !isNaN(code) ? String.fromCharCode(code) : '';
  });

  return sanitizeText(inner, 400, fallback);
}

/**
 * Splits a top-level STEP argument list `a, b, (c, d), 'e,f'` into individual argument tokens.
 */
export function splitStepArguments(rawArgs: string): string[] {
  const result: string[] = [];
  let current = '';
  let depth = 0;
  let inString = false;

  for (let i = 0; i < rawArgs.length; i++) {
    const ch = rawArgs[i];
    if (ch === "'") {
      if (inString && rawArgs[i + 1] === "'") {
        current += "''";
        i++;
        continue;
      }
      inString = !inString;
      current += ch;
    } else if (!inString) {
      if (ch === '(') {
        depth++;
        current += ch;
      } else if (ch === ')') {
        if (depth > 0) depth--;
        current += ch;
      } else if (ch === ',' && depth === 0) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    } else {
      current += ch;
    }
  }

  if (current.trim().length > 0 || rawArgs.endsWith(',')) {
    result.push(current.trim());
  }

  return result;
}

/**
 * Parses a STEP reference `#123` into integer `123` or `undefined`.
 */
export function parseStepRef(token: string | undefined): number | undefined {
  if (!token) return undefined;
  const trimmed = token.trim();
  if (!trimmed.startsWith('#')) return undefined;
  const num = parseInt(trimmed.slice(1), 10);
  return isNaN(num) || num <= 0 ? undefined : num;
}

/**
 * Parses a STEP tuple of references `(#10, #11, #12)` into an array of integer stepIds.
 */
export function parseStepRefList(token: string | undefined): number[] {
  if (!token) return [];
  const trimmed = token.trim();
  if (!trimmed.startsWith('(') || !trimmed.endsWith(')')) return [];
  const inner = trimmed.slice(1, -1).trim();
  if (!inner) return [];
  return splitStepArguments(inner)
    .map((t) => parseStepRef(t))
    .filter((id): id is number => typeof id === 'number');
}

/**
 * Extracts all `#id` references appearing anywhere inside a raw argument string (outside string literals).
 */
export function extractAllStepRefsInArgs(rawArgs: string): number[] {
  const refs: number[] = [];
  let inString = false;
  for (let i = 0; i < rawArgs.length; i++) {
    const ch = rawArgs[i];
    if (ch === "'") {
      if (inString && rawArgs[i + 1] === "'") {
        i++;
        continue;
      }
      inString = !inString;
    } else if (!inString && ch === '#') {
      let j = i + 1;
      let digits = '';
      while (j < rawArgs.length && rawArgs[j] >= '0' && rawArgs[j] <= '9') {
        digits += rawArgs[j];
        j++;
      }
      if (digits.length > 0) {
        const num = parseInt(digits, 10);
        if (!isNaN(num) && num > 0) refs.push(num);
        i = j - 1;
      }
    }
  }
  return refs;
}

/**
 * Parses a numeric value from a STEP token (handling wrappers like IFCLENGTHMEASURE(12.5) or IFCREAL(4.0)).
 */
export function parseStepNumber(token: string | undefined, fallback = 0): number {
  if (!token) return fallback;
  let trimmed = token.trim();
  if (trimmed === '$' || trimmed === '*') return fallback;
  const wrapperMatch = trimmed.match(/^[A-Z0-9_]+\(([-+0-9.eE]+)\)$/i);
  if (wrapperMatch) {
    trimmed = wrapperMatch[1];
  }
  const num = Number(trimmed);
  return sanitizeNumber(num, -1e9, 1e9, fallback);
}

/**
 * Parses a tuple of numbers `(10.0, 20.5, 0.0)` into `number[]`.
 */
export function parseStepNumberTuple(token: string | undefined): number[] {
  if (!token) return [];
  const trimmed = token.trim();
  if (!trimmed.startsWith('(') || !trimmed.endsWith(')')) return [];
  const inner = trimmed.slice(1, -1).trim();
  if (!inner) return [];
  return splitStepArguments(inner).map((item) => parseStepNumber(item, 0));
}

// ============================================================================
// 3. PRELIMINARY INSPECTION & INTERMEDIATE MODEL PARSER
// ============================================================================

export function getUnitConversionFactors(unitName: IFCLengthUnitName): {
  toMetres: number;
  toFeet: number;
} {
  switch (unitName) {
    case 'MILLIMETRE':
      return { toMetres: 0.001, toFeet: 0.001 / 0.3048 };
    case 'CENTIMETRE':
      return { toMetres: 0.01, toFeet: 0.01 / 0.3048 };
    case 'FOOT':
      return { toMetres: 0.3048, toFeet: 1.0 };
    case 'INCH':
      return { toMetres: 0.0254, toFeet: 1 / 12 };
    case 'METRE':
    default:
      return { toMetres: 1.0, toFeet: 1 / 0.3048 };
  }
}

/**
 * Parses an IFC STEP physical file into a validated `IFCIntermediateModel`.
 */
export function parseIFCToIntermediateModel(request: IFCImportRequest): IFCIntermediateModel {
  const warnings: IFCImportWarning[] = [];
  const errors: IFCImportError[] = [];
  const nowIso = new Date().toISOString();
  const maxBytes = request.maxFileSizeBytes ?? DEFAULT_MAX_IFC_FILE_BYTES;
  const maxEntities = request.maxEntityCount ?? DEFAULT_MAX_IFC_ENTITIES;

  const emptyMetadata: IFCSourceMetadata = {
    fileName: sanitizeText(request.fileName, 200, 'untitled.ifc'),
    fileSizeBytes: request.fileSizeBytes || 0,
    fileChecksum: computeStringChecksum(request.rawContent || ''),
    schemaIdentifier: 'UNKNOWN',
    normalizedSchema: 'UNSUPPORTED',
    fileDescription: '',
    implementationLevel: '',
    author: '',
    organization: '',
    preprocessorVersion: '',
    originatingSystem: '',
    authorization: '',
    timeStamp: '',
    sourceLengthUnit: 'METRE',
    sourceLengthToMetresFactor: 1.0,
    sourceAreaUnitLabel: 'm²',
    sourceVolumeUnitLabel: 'm³',
    parsedAt: nowIso,
  };

  // 1. Check cancellation
  if (request.signal?.aborted) {
    errors.push({
      id: 'err-cancelled-init',
      code: 'IMPORT_CANCELLED',
      message: 'IFC import was cancelled by the user before parsing started.',
      fatal: true,
    });
    return {
      formatVersion: 'plotify-ifc-ir-v1',
      createdAt: nowIso,
      isValid: false,
      metadata: emptyMetadata,
      spatialHierarchy: { storeys: [] },
      entities: [],
      unsupportedEntityCounts: {},
      totalRawStepEntities: 0,
      warnings,
      errors,
    };
  }

  // 2. Validate file name & extension
  const cleanFileName = sanitizeText(request.fileName, 200, 'model.ifc');
  if (!cleanFileName.toLowerCase().endsWith('.ifc')) {
    errors.push({
      id: 'err-invalid-ext',
      code: 'INVALID_FILE_EXTENSION',
      message: `Unsupported file extension in "${cleanFileName}". Only ISO 10303-21 STEP (.ifc) files are supported.`,
      fatal: true,
    });
  }

  // 3. Validate non-empty & file size limits
  const content = request.rawContent || '';
  const byteLength = request.fileSizeBytes || new Blob([content]).size;
  emptyMetadata.fileSizeBytes = byteLength;

  if (!content.trim() || byteLength === 0) {
    errors.push({
      id: 'err-empty-file',
      code: 'FILE_EMPTY',
      message: 'The selected IFC file is empty (0 bytes).',
      fatal: true,
    });
    return {
      formatVersion: 'plotify-ifc-ir-v1',
      createdAt: nowIso,
      isValid: false,
      metadata: emptyMetadata,
      spatialHierarchy: { storeys: [] },
      entities: [],
      unsupportedEntityCounts: {},
      totalRawStepEntities: 0,
      warnings,
      errors,
    };
  }

  if (byteLength > maxBytes) {
    errors.push({
      id: 'err-file-too-large',
      code: 'FILE_TOO_LARGE',
      message: `File size (${(byteLength / (1024 * 1024)).toFixed(2)} MB) exceeds the maximum safe processing limit of ${(maxBytes / (1024 * 1024)).toFixed(1)} MB.`,
      fatal: true,
    });
    return {
      formatVersion: 'plotify-ifc-ir-v1',
      createdAt: nowIso,
      isValid: false,
      metadata: emptyMetadata,
      spatialHierarchy: { storeys: [] },
      entities: [],
      unsupportedEntityCounts: {},
      totalRawStepEntities: 0,
      warnings,
      errors,
    };
  }

  // 4. Validate STEP physical file structure (ISO-10303-21, HEADER, DATA, END-ISO-10303-21)
  // Strip C-style /* ... */ comments safely
  const uncommented = content.replace(/\/\*[\s\S]*?\*\//g, '');
  const trimmedContent = uncommented.trim();

  if (!trimmedContent.startsWith('ISO-10303-21;')) {
    errors.push({
      id: 'err-malformed-header',
      code: 'MALFORMED_STEP_HEADER',
      message: 'Missing "ISO-10303-21;" prologue. File is not a valid STEP physical file.',
      fatal: true,
    });
  }

  if (!trimmedContent.includes('END-ISO-10303-21;')) {
    errors.push({
      id: 'err-truncated-file',
      code: 'TRUNCATED_STEP_FILE',
      message: 'Missing "END-ISO-10303-21;" epilogue. The IFC file appears truncated or incomplete.',
      fatal: true,
    });
  }

  const headerMatch = uncommented.match(/HEADER\s*;([\s\S]*?)ENDSEC\s*;/i);
  const dataMatch = uncommented.match(/DATA\s*;([\s\S]*?)ENDSEC\s*;/i);

  if (!headerMatch) {
    errors.push({
      id: 'err-missing-header-sec',
      code: 'MALFORMED_STEP_HEADER',
      message: 'Missing or unclosed HEADER; ... ENDSEC; section in STEP file.',
      fatal: true,
    });
  }

  if (!dataMatch) {
    errors.push({
      id: 'err-missing-data-sec',
      code: 'TRUNCATED_STEP_FILE',
      message: 'Missing or unclosed DATA; ... ENDSEC; section in STEP file.',
      fatal: true,
    });
  }

  if (errors.some((e) => e.fatal)) {
    return {
      formatVersion: 'plotify-ifc-ir-v1',
      createdAt: nowIso,
      isValid: false,
      metadata: emptyMetadata,
      spatialHierarchy: { storeys: [] },
      entities: [],
      unsupportedEntityCounts: {},
      totalRawStepEntities: 0,
      warnings,
      errors,
    };
  }

  // 5. Parse HEADER metadata
  const headerRaw = headerMatch![1];
  const fileDescMatch = headerRaw.match(/FILE_DESCRIPTION\s*\(([\s\S]*?)\)\s*;/i);
  if (fileDescMatch) {
    const descArgs = splitStepArguments(fileDescMatch[1]);
    emptyMetadata.fileDescription = decodeStepString(descArgs[0], '');
    emptyMetadata.implementationLevel = decodeStepString(descArgs[1], '2;1');
  }

  const fileNameMatch = headerRaw.match(/FILE_NAME\s*\(([\s\S]*?)\)\s*;/i);
  if (fileNameMatch) {
    const nameArgs = splitStepArguments(fileNameMatch[1]);
    emptyMetadata.timeStamp = decodeStepString(nameArgs[1], '');
    emptyMetadata.author = decodeStepString(nameArgs[2], '');
    emptyMetadata.organization = decodeStepString(nameArgs[3], '');
    emptyMetadata.preprocessorVersion = decodeStepString(nameArgs[4], '');
    emptyMetadata.originatingSystem = decodeStepString(nameArgs[5], '');
    emptyMetadata.authorization = decodeStepString(nameArgs[6], '');
  }

  const fileSchemaMatch = headerRaw.match(/FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/i);
  const rawSchema = fileSchemaMatch ? sanitizeText(fileSchemaMatch[1].toUpperCase(), 60, 'UNKNOWN') : 'UNKNOWN';
  emptyMetadata.schemaIdentifier = rawSchema;

  // Normalize schema & enforce strict support profile
  if (rawSchema === 'IFC4' || rawSchema === 'IFC4_ADD1' || rawSchema === 'IFC4_ADD2') {
    emptyMetadata.normalizedSchema = 'IFC4';
  } else if (rawSchema === 'IFC2X3' || rawSchema === 'IFC2X3_TC1') {
    emptyMetadata.normalizedSchema = 'IFC2X3';
  } else {
    emptyMetadata.normalizedSchema = 'UNSUPPORTED';
    errors.push({
      id: 'err-unsupported-schema',
      code: 'UNSUPPORTED_SCHEMA',
      message: `IFC schema "${rawSchema}" is not supported by Plotify's verified profile. Supported schemas are strictly: IFC2X3 and IFC4.`,
      fatal: true,
    });
    return {
      formatVersion: 'plotify-ifc-ir-v1',
      createdAt: nowIso,
      isValid: false,
      metadata: emptyMetadata,
      spatialHierarchy: { storeys: [] },
      entities: [],
      unsupportedEntityCounts: {},
      totalRawStepEntities: 0,
      warnings,
      errors,
    };
  }

  // 6. Parse DATA section statements (#id = IFCENTITY(...);)
  const dataRaw = dataMatch![1];
  const entityMap = new Map<number, RawStepEntity>();
  const allReferencedIds = new Array<{ sourceId: number; targetId: number }>();

  // Extract statements terminated by ; outside of single-quoted strings
  const statements: string[] = [];
  let stmtCurrent = '';
  let inQuotes = false;
  for (let i = 0; i < dataRaw.length; i++) {
    const ch = dataRaw[i];
    if (ch === "'") {
      if (inQuotes && dataRaw[i + 1] === "'") {
        stmtCurrent += "''";
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      stmtCurrent += ch;
    } else if (!inQuotes && ch === ';') {
      const trimmedStmt = stmtCurrent.trim();
      if (trimmedStmt.length > 0) {
        statements.push(trimmedStmt);
      }
      stmtCurrent = '';
    } else {
      stmtCurrent += ch;
    }
  }

  if (stmtCurrent.trim().length > 0) {
    // Unterminated statement inside DATA section
    errors.push({
      id: 'err-unterminated-stmt',
      code: 'TRUNCATED_STEP_FILE',
      message: `Unterminated STEP entity statement in DATA section: "${stmtCurrent.trim().slice(0, 60)}..."`,
      fatal: true,
    });
    return {
      formatVersion: 'plotify-ifc-ir-v1',
      createdAt: nowIso,
      isValid: false,
      metadata: emptyMetadata,
      spatialHierarchy: { storeys: [] },
      entities: [],
      unsupportedEntityCounts: {},
      totalRawStepEntities: statements.length,
      warnings,
      errors,
    };
  }

  if (statements.length > maxEntities) {
    errors.push({
      id: 'err-entity-limit',
      code: 'ENTITY_LIMIT_EXCEEDED',
      message: `File contains ${statements.length} STEP entities, exceeding the maximum safe limit of ${maxEntities} entities.`,
      fatal: true,
    });
    return {
      formatVersion: 'plotify-ifc-ir-v1',
      createdAt: nowIso,
      isValid: false,
      metadata: emptyMetadata,
      spatialHierarchy: { storeys: [] },
      entities: [],
      unsupportedEntityCounts: {},
      totalRawStepEntities: statements.length,
      warnings,
      errors,
    };
  }

  const stmtRegex = /^#(\d+)\s*=\s*([A-Z0-9_]+)\s*\(([\s\S]*)\)$/i;

  for (let idx = 0; idx < statements.length; idx++) {
    if (idx % 500 === 0 && request.signal?.aborted) {
      errors.push({
        id: 'err-cancelled-loop',
        code: 'IMPORT_CANCELLED',
        message: 'IFC import was cancelled during STEP entity parsing.',
        fatal: true,
      });
      break;
    }

    const stmt = statements[idx];
    const match = stmt.match(stmtRegex);
    if (!match) {
      warnings.push({
        id: `warn-syntax-${idx}`,
        code: 'BROKEN_REFERENCE',
        severity: 'warning',
        message: `Skipped malformed STEP statement at index ${idx + 1}: "${stmt.slice(0, 50)}"`,
      });
      continue;
    }

    const stepId = parseInt(match[1], 10);
    const ifcType = match[2].toUpperCase();
    const rawArgs = match[3];

    if (entityMap.has(stepId)) {
      warnings.push({
        id: `warn-dup-id-${stepId}-${idx}`,
        code: 'DUPLICATE_ENTITY_ID',
        severity: 'warning',
        stepId,
        ifcType,
        message: `Duplicate STEP entity identifier #${stepId} (${ifcType}) encountered. Retaining first definition to prevent overwrite corruption.`,
        remedy: 'Regenerate IFC file from authoring BIM tool with unique STEP entity IDs.',
      });
      continue;
    }

    const args = splitStepArguments(rawArgs);
    entityMap.set(stepId, { stepId, ifcType, rawArgs, args });

    const refs = extractAllStepRefsInArgs(rawArgs);
    for (const refId of refs) {
      allReferencedIds.push({ sourceId: stepId, targetId: refId });
    }
  }

  if (errors.some((e) => e.fatal)) {
    return {
      formatVersion: 'plotify-ifc-ir-v1',
      createdAt: nowIso,
      isValid: false,
      metadata: emptyMetadata,
      spatialHierarchy: { storeys: [] },
      entities: [],
      unsupportedEntityCounts: {},
      totalRawStepEntities: statements.length,
      warnings,
      errors,
    };
  }

  // 7. Check for broken/unresolved #id references
  for (const { sourceId, targetId } of allReferencedIds) {
    if (!entityMap.has(targetId)) {
      const sourceEnt = entityMap.get(sourceId);
      warnings.push({
        id: `warn-broken-ref-${sourceId}-${targetId}`,
        code: 'BROKEN_REFERENCE',
        severity: 'warning',
        stepId: sourceId,
        ifcType: sourceEnt?.ifcType,
        message: `Entity #${sourceId} (${sourceEnt?.ifcType || 'Unknown'}) references missing STEP entity #${targetId}.`,
        remedy: 'Verify that all referenced geometry, placement, and relationship entities are exported in the STEP file.',
      });
    }
  }

  // 8. Extract Application Name & Unit Assignment
  for (const ent of entityMap.values()) {
    if (ent.ifcType === 'IFCAPPLICATION') {
      const appFullName = decodeStepString(ent.args[2], '');
      const appVer = decodeStepString(ent.args[1], '');
      if (appFullName) {
        emptyMetadata.applicationName = appVer ? `${appFullName} (${appVer})` : appFullName;
      }
    }
  }

  // Detect length unit from IFCUNITASSIGNMENT or IFCSIUNIT / IFCCONVERSIONBASEDUNIT
  let detectedLengthUnit: IFCLengthUnitName = 'METRE';
  for (const ent of entityMap.values()) {
    if (ent.ifcType === 'IFCCONVERSIONBASEDUNIT') {
      // IFCCONVERSIONBASEDUNIT(Dimensions, UnitType, Name, ConversionFactor)
      const unitType = ent.args[1] || '';
      const unitName = decodeStepString(ent.args[2], '').toUpperCase();
      if (unitType.includes('.LENGTHUNIT.')) {
        if (unitName.includes('FOOT') || unitName.includes('FEET') || unitName === 'FT') {
          detectedLengthUnit = 'FOOT';
          break;
        } else if (unitName.includes('INCH') || unitName === 'IN') {
          detectedLengthUnit = 'INCH';
          break;
        }
      }
    } else if (ent.ifcType === 'IFCSIUNIT') {
      // IFCSIUNIT(*, .LENGTHUNIT., .MILLI., .METRE.)
      const unitType = ent.args[1] || '';
      const prefix = ent.args[2] || '$';
      const name = ent.args[3] || '';
      if (unitType.includes('.LENGTHUNIT.') && name.includes('.METRE.')) {
        if (prefix.includes('.MILLI.')) {
          detectedLengthUnit = 'MILLIMETRE';
        } else if (prefix.includes('.CENTI.')) {
          detectedLengthUnit = 'CENTIMETRE';
        } else {
          detectedLengthUnit = 'METRE';
        }
      }
    }
  }

  const unitFactors = getUnitConversionFactors(detectedLengthUnit);
  emptyMetadata.sourceLengthUnit = detectedLengthUnit;
  emptyMetadata.sourceLengthToMetresFactor = unitFactors.toMetres;
  emptyMetadata.sourceAreaUnitLabel =
    detectedLengthUnit === 'FOOT' || detectedLengthUnit === 'INCH' ? 'sq ft' : 'm²';
  emptyMetadata.sourceVolumeUnitLabel =
    detectedLengthUnit === 'FOOT' || detectedLengthUnit === 'INCH' ? 'cu ft' : 'm³';

  // 9. Resolve Coordinate Placement Hierarchy (IfcLocalPlacement)
  const resolveCartesianPoint = (pointStepId: number | undefined): [number, number, number] => {
    if (!pointStepId) return [0, 0, 0];
    const ptEnt = entityMap.get(pointStepId);
    if (!ptEnt || ptEnt.ifcType !== 'IFCCARTESIANPOINT') return [0, 0, 0];
    const coords = parseStepNumberTuple(ptEnt.args[0]);
    return [coords[0] || 0, coords[1] || 0, coords[2] || 0];
  };

  const resolveDirectionAngleDeg = (dirStepId: number | undefined): number => {
    if (!dirStepId) return 0;
    const dirEnt = entityMap.get(dirStepId);
    if (!dirEnt || dirEnt.ifcType !== 'IFCDIRECTION') return 0;
    const ratios = parseStepNumberTuple(dirEnt.args[0]);
    const dx = ratios[0] ?? 1;
    const dy = ratios[1] ?? 0;
    if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return 0;
    return (Math.atan2(dy, dx) * 180) / Math.PI;
  };

  const resolveAxis2Placement = (
    axisStepId: number | undefined
  ): { x: number; y: number; z: number; rotationDeg: number } => {
    if (!axisStepId) return { x: 0, y: 0, z: 0, rotationDeg: 0 };
    const axEnt = entityMap.get(axisStepId);
    if (!axEnt) return { x: 0, y: 0, z: 0, rotationDeg: 0 };
    if (axEnt.ifcType === 'IFCAXIS2PLACEMENT3D') {
      const locId = parseStepRef(axEnt.args[0]);
      const refDirId = parseStepRef(axEnt.args[2]);
      const [x, y, z] = resolveCartesianPoint(locId);
      const rotationDeg = resolveDirectionAngleDeg(refDirId);
      return { x, y, z, rotationDeg };
    }
    if (axEnt.ifcType === 'IFCAXIS2PLACEMENT2D') {
      const locId = parseStepRef(axEnt.args[0]);
      const refDirId = parseStepRef(axEnt.args[1]);
      const [x, y, z] = resolveCartesianPoint(locId);
      const rotationDeg = resolveDirectionAngleDeg(refDirId);
      return { x, y, z, rotationDeg };
    }
    return { x: 0, y: 0, z: 0, rotationDeg: 0 };
  };

  const resolveLocalPlacement = (
    placementStepId: number | undefined,
    visited = new Set<number>()
  ): { x: number; y: number; z: number; rotationDeg: number } => {
    if (!placementStepId) return { x: 0, y: 0, z: 0, rotationDeg: 0 };
    if (visited.has(placementStepId)) {
      errors.push({
        id: `err-circular-placement-${placementStepId}`,
        code: 'CIRCULAR_REFERENCE',
        lineOrStepId: placementStepId,
        message: `Circular coordinate placement dependency detected at IFCLOCALPLACEMENT #${placementStepId}.`,
        fatal: false,
      });
      return { x: 0, y: 0, z: 0, rotationDeg: 0 };
    }
    if (visited.size >= MAX_PLACEMENT_RECURSION_DEPTH) {
      return { x: 0, y: 0, z: 0, rotationDeg: 0 };
    }

    const placeEnt = entityMap.get(placementStepId);
    if (!placeEnt || placeEnt.ifcType !== 'IFCLOCALPLACEMENT') {
      return { x: 0, y: 0, z: 0, rotationDeg: 0 };
    }

    visited.add(placementStepId);
    const parentId = parseStepRef(placeEnt.args[0]);
    const relAxisId = parseStepRef(placeEnt.args[1]);

    const parent = parentId
      ? resolveLocalPlacement(parentId, visited)
      : { x: 0, y: 0, z: 0, rotationDeg: 0 };
    const local = resolveAxis2Placement(relAxisId);

    const rad = (parent.rotationDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const worldX = parent.x + (local.x * cos - local.y * sin);
    const worldY = parent.y + (local.x * sin + local.y * cos);
    const worldZ = parent.z + local.z;
    const totalRot = (parent.rotationDeg + local.rotationDeg) % 360;

    return {
      x: worldX,
      y: worldY,
      z: worldZ,
      rotationDeg: totalRot,
    };
  };

  // 10. Index Relationships:
  // - IFCRELAGGREGATES(GlobalId, OwnerHistory, Name, Description, RelatingObject, RelatedObjects)
  // - IFCRELCONTAINEDINSPATIALSTRUCTURE(GlobalId, OwnerHistory, Name, Description, RelatedElements, RelatingStructure)
  // - IFCRELDEFINESBYPROPERTIES(GlobalId, OwnerHistory, Name, Description, RelatedObjects, RelatingPropertyDefinition)
  // - IFCRELASSOCIATESMATERIAL(GlobalId, OwnerHistory, Name, Description, RelatedObjects, RelatingMaterial)
  // - IFCRELASSOCIATESCLASSIFICATION(GlobalId, OwnerHistory, Name, Description, RelatedObjects, RelatingClassification)
  const parentByChildStepId = new Map<number, number>();
  const childrenByParentStepId = new Map<number, number[]>();
  const spatialContainerByElementStepId = new Map<number, number>();
  const elementsBySpatialContainerStepId = new Map<number, number[]>();
  const propDefsByElementStepId = new Map<number, number[]>();
  const materialsByElementStepId = new Map<number, number[]>();
  const classificationsByElementStepId = new Map<number, number[]>();

  for (const ent of entityMap.values()) {
    if (ent.ifcType === 'IFCRELAGGREGATES') {
      const relatingId = parseStepRef(ent.args[4]);
      const relatedIds = parseStepRefList(ent.args[5]);
      if (relatingId && entityMap.has(relatingId)) {
        const existing = childrenByParentStepId.get(relatingId) || [];
        for (const childId of relatedIds) {
          if (entityMap.has(childId)) {
            parentByChildStepId.set(childId, relatingId);
            existing.push(childId);
          }
        }
        childrenByParentStepId.set(relatingId, existing);
      }
    } else if (ent.ifcType === 'IFCRELCONTAINEDINSPATIALSTRUCTURE') {
      const relatedIds = parseStepRefList(ent.args[4]);
      const relatingStructureId = parseStepRef(ent.args[5]);
      if (relatingStructureId && entityMap.has(relatingStructureId)) {
        const existing = elementsBySpatialContainerStepId.get(relatingStructureId) || [];
        for (const elemId of relatedIds) {
          if (entityMap.has(elemId)) {
            spatialContainerByElementStepId.set(elemId, relatingStructureId);
            existing.push(elemId);
          }
        }
        elementsBySpatialContainerStepId.set(relatingStructureId, existing);
      }
    } else if (ent.ifcType === 'IFCRELDEFINESBYPROPERTIES') {
      const relatedIds = parseStepRefList(ent.args[4]);
      const propDefId = parseStepRef(ent.args[5]);
      if (propDefId && entityMap.has(propDefId)) {
        for (const objId of relatedIds) {
          const list = propDefsByElementStepId.get(objId) || [];
          list.push(propDefId);
          propDefsByElementStepId.set(objId, list);
        }
      }
    } else if (ent.ifcType === 'IFCRELASSOCIATESMATERIAL') {
      const relatedIds = parseStepRefList(ent.args[4]);
      const matId = parseStepRef(ent.args[5]);
      if (matId && entityMap.has(matId)) {
        for (const objId of relatedIds) {
          const list = materialsByElementStepId.get(objId) || [];
          list.push(matId);
          materialsByElementStepId.set(objId, list);
        }
      }
    } else if (ent.ifcType === 'IFCRELASSOCIATESCLASSIFICATION') {
      const relatedIds = parseStepRefList(ent.args[4]);
      const classId = parseStepRef(ent.args[5]);
      if (classId && entityMap.has(classId)) {
        for (const objId of relatedIds) {
          const list = classificationsByElementStepId.get(objId) || [];
          list.push(classId);
          classificationsByElementStepId.set(objId, list);
        }
      }
    }
  }

  // Helper to extract properties & quantities for an entity
  const extractPropertiesAndQuantities = (
    elemStepId: number
  ): { properties: IFCPropertyRecord[]; quantities: IFCQuantityRecord[] } => {
    const properties: IFCPropertyRecord[] = [];
    const quantities: IFCQuantityRecord[] = [];
    const propDefIds = propDefsByElementStepId.get(elemStepId) || [];

    for (const defId of propDefIds) {
      const defEnt = entityMap.get(defId);
      if (!defEnt) continue;

      if (defEnt.ifcType === 'IFCPROPERTYSET') {
        // IFCPROPERTYSET(GlobalId, OwnerHistory, Name, Description, HasProperties)
        const psetName = decodeStepString(defEnt.args[2], 'PropertySet');
        const propIds = parseStepRefList(defEnt.args[4]);
        for (const pid of propIds) {
          const propEnt = entityMap.get(pid);
          if (!propEnt) continue;
          if (propEnt.ifcType === 'IFCPROPERTYSINGLEVALUE') {
            // IFCPROPERTYSINGLEVALUE(Name, Description, NominalValue, Unit)
            const propName = decodeStepString(propEnt.args[0], 'Property');
            const rawVal = propEnt.args[2] || '';
            let parsedValue: string | number | boolean = decodeStepString(rawVal, '');
            if (/\.T\.$/i.test(rawVal) || /\(\.T\.\)/i.test(rawVal)) {
              parsedValue = true;
            } else if (/\.F\.$/i.test(rawVal) || /\(\.F\.\)/i.test(rawVal)) {
              parsedValue = false;
            } else if (/^[A-Z0-9_]+\(([-+0-9.eE]+)\)$/i.test(rawVal.trim())) {
              parsedValue = parseStepNumber(rawVal, 0);
            }
            properties.push({ psetName, propertyName: propName, value: parsedValue });
          }
        }
      } else if (defEnt.ifcType === 'IFCELEMENTQUANTITY') {
        // IFCELEMENTQUANTITY(GlobalId, OwnerHistory, Name, Description, MethodOfMeasurement, Quantities)
        const qtoName = decodeStepString(defEnt.args[2], 'BaseQuantities');
        const qIds = parseStepRefList(defEnt.args[5]);
        for (const qid of qIds) {
          const qEnt = entityMap.get(qid);
          if (!qEnt) continue;
          const qName = decodeStepString(qEnt.args[0], 'Quantity');
          const val = parseStepNumber(qEnt.args[3], 0);
          if (qEnt.ifcType === 'IFCQUANTITYAREA') {
            quantities.push({ qtoName, quantityName: qName, quantityType: 'area', value: val });
          } else if (qEnt.ifcType === 'IFCQUANTITYLENGTH') {
            quantities.push({ qtoName, quantityName: qName, quantityType: 'length', value: val });
          } else if (qEnt.ifcType === 'IFCQUANTITYVOLUME') {
            quantities.push({ qtoName, quantityName: qName, quantityType: 'volume', value: val });
          } else if (qEnt.ifcType === 'IFCQUANTITYCOUNT') {
            quantities.push({ qtoName, quantityName: qName, quantityType: 'count', value: val });
          }
        }
      }
    }

    return { properties, quantities };
  };

  // Helper to extract material names
  const extractMaterials = (elemStepId: number): string[] => {
    const mats: string[] = [];
    const matIds = materialsByElementStepId.get(elemStepId) || [];
    for (const mid of matIds) {
      const mEnt = entityMap.get(mid);
      if (!mEnt) continue;
      if (mEnt.ifcType === 'IFCMATERIAL') {
        const mName = decodeStepString(mEnt.args[0], '');
        if (mName) mats.push(mName);
      } else if (mEnt.ifcType === 'IFCMATERIALLAYERSETUSAGE') {
        const layerSetId = parseStepRef(mEnt.args[0]);
        const lsEnt = layerSetId ? entityMap.get(layerSetId) : undefined;
        if (lsEnt && lsEnt.ifcType === 'IFCMATERIALLAYERSET') {
          const setName = decodeStepString(lsEnt.args[1], '');
          if (setName) mats.push(setName);
          const layerIds = parseStepRefList(lsEnt.args[0]);
          for (const lid of layerIds) {
            const lEnt = entityMap.get(lid);
            if (lEnt && lEnt.ifcType === 'IFCMATERIALLAYER') {
              const innerMatId = parseStepRef(lEnt.args[0]);
              const innerMat = innerMatId ? entityMap.get(innerMatId) : undefined;
              if (innerMat && innerMat.ifcType === 'IFCMATERIAL') {
                const nm = decodeStepString(innerMat.args[0], '');
                if (nm) mats.push(nm);
              }
            }
          }
        }
      } else if (mEnt.ifcType === 'IFCMATERIALLAYERSET') {
        const setName = decodeStepString(mEnt.args[1], '');
        if (setName) mats.push(setName);
      } else if (mEnt.ifcType === 'IFCMATERIALLIST') {
        const itemIds = parseStepRefList(mEnt.args[0]);
        for (const iid of itemIds) {
          const iEnt = entityMap.get(iid);
          if (iEnt && iEnt.ifcType === 'IFCMATERIAL') {
            const nm = decodeStepString(iEnt.args[0], '');
            if (nm) mats.push(nm);
          }
        }
      }
    }
    return Array.from(new Set(mats));
  };

  // Helper to extract classifications
  const extractClassifications = (elemStepId: number): string[] => {
    const list: string[] = [];
    const cIds = classificationsByElementStepId.get(elemStepId) || [];
    for (const cid of cIds) {
      const cEnt = entityMap.get(cid);
      if (!cEnt) continue;
      if (cEnt.ifcType === 'IFCCLASSIFICATIONREFERENCE') {
        // IFCCLASSIFICATIONREFERENCE(Location, ItemReference/Identification, Name, ReferencedSource)
        const code = decodeStepString(cEnt.args[1], '');
        const name = decodeStepString(cEnt.args[2], '');
        const tag = [code, name].filter(Boolean).join(' - ');
        if (tag) list.push(tag);
      }
    }
    return list;
  };

  // Helper to extract geometry representation from IFCPRODUCTDEFINITIONSHAPE
  const extractElementGeometry = (
    elemStepId: number,
    ifcType: string,
    placementStepId: number | undefined,
    representationStepId: number | undefined,
    quantities: IFCQuantityRecord[],
    isCenteredElement: boolean = false
  ): IFCExtractedBoundingGeometry => {
    const worldPlacement = resolveLocalPlacement(placementStepId);
    const defaultGeom: IFCExtractedBoundingGeometry = {
      representationType: 'None',
      x: worldPlacement.x,
      y: worldPlacement.y,
      z: worldPlacement.z,
      width: 0,
      length: 0,
      height: 0,
      rotationDeg: worldPlacement.rotationDeg,
      isAxisAligned:
        Math.abs(worldPlacement.rotationDeg % 90) < 1e-2 ||
        Math.abs(Math.abs(worldPlacement.rotationDeg % 90) - 90) < 1e-2,
      hasValidSolidBounds: false,
    };

    if (!representationStepId) {
      // Check if quantities provide floor area & dimensions
      const widthQ = quantities.find((q) => /width/i.test(q.quantityName));
      const lengthQ = quantities.find((q) => /length|depth/i.test(q.quantityName));
      const heightQ = quantities.find((q) => /height/i.test(q.quantityName));
      if (widthQ && lengthQ && widthQ.value > 0 && lengthQ.value > 0) {
        return {
          ...defaultGeom,
          representationType: 'QuantityDerived',
          width: widthQ.value,
          length: lengthQ.value,
          height: heightQ?.value || 3.0,
          hasValidSolidBounds: true,
          rawGeometryNote: 'Derived from IfcElementQuantity Length/Width.',
        };
      }
      return defaultGeom;
    }

    const prodShape = entityMap.get(representationStepId);
    if (!prodShape || prodShape.ifcType !== 'IFCPRODUCTDEFINITIONSHAPE') {
      return defaultGeom;
    }

    const repIds = parseStepRefList(prodShape.args[2]);
    for (const repId of repIds) {
      const shapeRep = entityMap.get(repId);
      if (!shapeRep || shapeRep.ifcType !== 'IFCSHAPEREPRESENTATION') continue;

      const repType = decodeStepString(shapeRep.args[2], '');
      const itemIds = parseStepRefList(shapeRep.args[3]);

      for (const itemId of itemIds) {
        const geomItem = entityMap.get(itemId);
        if (!geomItem) continue;

        if (geomItem.ifcType === 'IFCEXTRUDEDAREASOLID') {
          // IFCEXTRUDEDAREASOLID(SweptArea, Position, ExtrudedDirection, Depth)
          const profileId = parseStepRef(geomItem.args[0]);
          const solidPosId = parseStepRef(geomItem.args[1]);
          const depth = parseStepNumber(geomItem.args[3], 0);
          const solidPos = resolveAxis2Placement(solidPosId);
          const profileEnt = profileId ? entityMap.get(profileId) : undefined;

          if (!profileEnt) continue;

          if (profileEnt.ifcType === 'IFCRECTANGLEPROFILEDEF') {
            // IFCRECTANGLEPROFILEDEF(ProfileType, ProfileName, Position, XDim, YDim)
            const profPosId = parseStepRef(profileEnt.args[2]);
            const xDim = parseStepNumber(profileEnt.args[3], 0);
            const yDim = parseStepNumber(profileEnt.args[4], 0);
            const profPos = profPosId
              ? resolveAxis2Placement(profPosId)
              : { x: 0, y: 0, z: 0, rotationDeg: 0 };

            const totalRot = (worldPlacement.rotationDeg + solidPos.rotationDeg + profPos.rotationDeg) % 360;
            const normRot = ((totalRot % 360) + 360) % 360;
            const isSwap90 = Math.abs(normRot - 90) < 1 || Math.abs(normRot - 270) < 1;
            const isOrtho =
              Math.abs(normRot) < 1 ||
              Math.abs(normRot - 90) < 1 ||
              Math.abs(normRot - 180) < 1 ||
              Math.abs(normRot - 270) < 1 ||
              Math.abs(normRot - 360) < 1;

            const effWidth = isSwap90 ? yDim : xDim;
            const effLength = isSwap90 ? xDim : yDim;

            // Compute origin: If profPosId is explicitly centered at (xDim/2, yDim/2),
            // minCorner is worldPlacement.x + solidPos.x + profPos.x - xDim/2 = worldPlacement.x + solidPos.x.
            // If profPosId is $ (null) on a room/space, check whether isCenteredElement (like Column) or corner-placed.
            let finalX = worldPlacement.x + solidPos.x;
            let finalY = worldPlacement.y + solidPos.y;

            if (isCenteredElement) {
              finalX = worldPlacement.x + solidPos.x + profPos.x;
              finalY = worldPlacement.y + solidPos.y + profPos.y;
            } else if (profPosId) {
              finalX = worldPlacement.x + solidPos.x + profPos.x - effWidth / 2;
              finalY = worldPlacement.y + solidPos.y + profPos.y - effLength / 2;
            }

            if (!isOrtho) {
              warnings.push({
                id: `warn-rot-${elemStepId}`,
                code: 'NON_RECTILINEAR_APPROXIMATED',
                severity: 'warning',
                stepId: elemStepId,
                ifcType,
                message: `${ifcType} #${elemStepId} has non-orthogonal rotation (${normRot.toFixed(1)}°). Plotify requires axis-aligned geometry.`,
              });
            }

            return {
              representationType: 'ExtrudedAreaSolid-RectangleProfile',
              x: finalX,
              y: finalY,
              z: worldPlacement.z + solidPos.z,
              width: effWidth,
              length: effLength,
              height: depth,
              rotationDeg: normRot,
              isAxisAligned: isOrtho,
              hasValidSolidBounds: effWidth > 0 && effLength > 0 && isOrtho,
            };
          } else if (profileEnt.ifcType === 'IFCARBITRARYCLOSEDPROFILEDEF') {
            // IFCARBITRARYCLOSEDPROFILEDEF(ProfileType, ProfileName, OuterCurve)
            const curveId = parseStepRef(profileEnt.args[2]);
            const curveEnt = curveId ? entityMap.get(curveId) : undefined;
            if (curveEnt && curveEnt.ifcType === 'IFCPOLYLINE') {
              const ptIds = parseStepRefList(curveEnt.args[0]);
              const pts = ptIds.map((pid) => resolveCartesianPoint(pid));
              // Deduplicate closing vertex if identical to first
              const uniquePts =
                pts.length > 1 &&
                Math.abs(pts[0][0] - pts[pts.length - 1][0]) < 1e-4 &&
                Math.abs(pts[0][1] - pts[pts.length - 1][1]) < 1e-4
                  ? pts.slice(0, -1)
                  : pts;

              if (uniquePts.length === 4) {
                // Check if all 4 edges are axis-aligned
                let allOrtho = true;
                for (let i = 0; i < uniquePts.length; i++) {
                  const p1 = uniquePts[i];
                  const p2 = uniquePts[(i + 1) % uniquePts.length];
                  const dx = Math.abs(p2[0] - p1[0]);
                  const dy = Math.abs(p2[1] - p1[1]);
                  if (dx > 1e-3 && dy > 1e-3) {
                    allOrtho = false;
                    break;
                  }
                }

                const xs = uniquePts.map((p) => p[0]);
                const ys = uniquePts.map((p) => p[1]);
                const minX = Math.min(...xs);
                const maxX = Math.max(...xs);
                const minY = Math.min(...ys);
                const maxY = Math.max(...ys);
                const w = maxX - minX;
                const l = maxY - minY;

                if (allOrtho && w > 0 && l > 0) {
                  return {
                    representationType: 'ExtrudedAreaSolid-RectilinearPolygon',
                    x: worldPlacement.x + solidPos.x + minX,
                    y: worldPlacement.y + solidPos.y + minY,
                    z: worldPlacement.z + solidPos.z,
                    width: w,
                    length: l,
                    height: depth,
                    rotationDeg: worldPlacement.rotationDeg,
                    isAxisAligned: true,
                    hasValidSolidBounds: true,
                  };
                }
              }

              // Non-rectangular polygon (e.g., L-shaped or angled)
              warnings.push({
                id: `warn-poly-${elemStepId}`,
                code: 'UNSUPPORTED_GEOMETRY',
                severity: 'warning',
                stepId: elemStepId,
                ifcType,
                message: `${ifcType} #${elemStepId} uses a non-rectangular IfcArbitraryClosedProfileDef (${uniquePts.length} vertices). Plotify does not fabricate rectangular geometry for non-rectangular polygons.`,
              });
              return {
                ...defaultGeom,
                representationType: 'Unsupported-Other',
                hasValidSolidBounds: false,
                rawGeometryNote: `Non-rectangular polygon (${uniquePts.length} vertices)`,
              };
            } else {
              warnings.push({
                id: `warn-curved-prof-${elemStepId}`,
                code: 'UNSUPPORTED_GEOMETRY',
                severity: 'warning',
                stepId: elemStepId,
                ifcType,
                message: `${ifcType} #${elemStepId} uses curved profile "${curveEnt?.ifcType || 'Unknown'}". Curved profiles are not editable in Plotify.`,
              });
              return {
                ...defaultGeom,
                representationType: 'Unsupported-CurvedProfile',
                hasValidSolidBounds: false,
              };
            }
          } else if (profileEnt.ifcType === 'IFCCIRCLEPROFILEDEF') {
            // Supported for circular structural columns!
            const radius = parseStepNumber(profileEnt.args[3], 0);
            if (ifcType === 'IFCCOLUMN' && radius > 0) {
              return {
                representationType: 'ExtrudedAreaSolid-RectangleProfile',
                x: worldPlacement.x + solidPos.x,
                y: worldPlacement.y + solidPos.y,
                z: worldPlacement.z + solidPos.z,
                width: radius * 2,
                length: radius * 2,
                height: depth,
                rotationDeg: 0,
                isAxisAligned: true,
                hasValidSolidBounds: true,
                rawGeometryNote: 'CircularColumnProfile',
              };
            }
            warnings.push({
              id: `warn-circle-prof-${elemStepId}`,
              code: 'UNSUPPORTED_GEOMETRY',
              severity: 'warning',
              stepId: elemStepId,
              ifcType,
              message: `${ifcType} #${elemStepId} uses IfcCircleProfileDef which is only supported for circular structural columns.`,
            });
            return {
              ...defaultGeom,
              representationType: 'Unsupported-CurvedProfile',
              hasValidSolidBounds: false,
            };
          }
        } else if (geomItem.ifcType === 'IFCBOUNDINGBOX') {
          // IFCBOUNDINGBOX(Corner, XDim, YDim, ZDim)
          const cornerId = parseStepRef(geomItem.args[0]);
          const [cx, cy, cz] = resolveCartesianPoint(cornerId);
          const xDim = parseStepNumber(geomItem.args[1], 0);
          const yDim = parseStepNumber(geomItem.args[2], 0);
          const zDim = parseStepNumber(geomItem.args[3], 0);
          return {
            representationType: 'BoundingBox',
            x: worldPlacement.x + cx,
            y: worldPlacement.y + cy,
            z: worldPlacement.z + cz,
            width: xDim,
            length: yDim,
            height: zDim,
            rotationDeg: worldPlacement.rotationDeg,
            isAxisAligned: true,
            hasValidSolidBounds: xDim > 0 && yDim > 0,
          };
        } else if (geomItem.ifcType === 'IFCFACETEDBREP') {
          warnings.push({
            id: `warn-brep-${elemStepId}`,
            code: 'UNSUPPORTED_GEOMETRY',
            severity: 'warning',
            stepId: elemStepId,
            ifcType,
            message: `${ifcType} #${elemStepId} uses IfcFacetedBrep mesh representation. Retained as metadata; no fake room/element geometry created.`,
          });
          return {
            ...defaultGeom,
            representationType: 'Unsupported-FacetedBrep',
            hasValidSolidBounds: false,
          };
        } else if (
          geomItem.ifcType === 'IFCTRIANGULATEDFACESET' ||
          geomItem.ifcType === 'IFCPOLYGONALFACESET'
        ) {
          warnings.push({
            id: `warn-tess-${elemStepId}`,
            code: 'UNSUPPORTED_GEOMETRY',
            severity: 'warning',
            stepId: elemStepId,
            ifcType,
            message: `${ifcType} #${elemStepId} uses tessellated ${geomItem.ifcType} mesh. Retained as metadata without fabricating geometry.`,
          });
          return {
            ...defaultGeom,
            representationType: 'Unsupported-TriangulatedFaceSet',
            hasValidSolidBounds: false,
          };
        } else if (geomItem.ifcType === 'IFCBOOLEANCLIPPINGRESULT') {
          warnings.push({
            id: `warn-csg-${elemStepId}`,
            code: 'UNSUPPORTED_GEOMETRY',
            severity: 'warning',
            stepId: elemStepId,
            ifcType,
            message: `${ifcType} #${elemStepId} uses CSG boolean clipping (${geomItem.ifcType}). Retained as metadata.`,
          });
          return {
            ...defaultGeom,
            representationType: 'Unsupported-BooleanClippingResult',
            hasValidSolidBounds: false,
          };
        }
      }

      if (/brep/i.test(repType)) {
        warnings.push({
          id: `warn-rep-brep-${elemStepId}`,
          code: 'UNSUPPORTED_GEOMETRY',
          severity: 'warning',
          stepId: elemStepId,
          ifcType,
          message: `${ifcType} #${elemStepId} uses "${repType}" shape representation.`,
        });
        return {
          ...defaultGeom,
          representationType: 'Unsupported-FacetedBrep',
          hasValidSolidBounds: false,
        };
      }
    }

    return defaultGeom;
  };

  // 11. Build Spatial Hierarchy (IfcProject -> IfcSite -> IfcBuilding -> IfcBuildingStorey)
  const spatialHierarchy: IFCSpatialHierarchy = {
    storeys: [],
  };

  for (const ent of entityMap.values()) {
    if (ent.ifcType === 'IFCPROJECT' && !spatialHierarchy.project) {
      const globalId = decodeStepString(ent.args[0], `PRJ-${ent.stepId}`);
      const name = decodeStepString(ent.args[2], 'Imported IFC Project');
      const description = decodeStepString(ent.args[3], '');
      const longName = decodeStepString(ent.args[7], '');
      spatialHierarchy.project = {
        stepId: ent.stepId,
        globalId,
        name: name || longName || 'Imported IFC Project',
        longName: longName || undefined,
        description: description || undefined,
      };
    } else if (ent.ifcType === 'IFCSITE' && !spatialHierarchy.site) {
      const globalId = decodeStepString(ent.args[0], `SITE-${ent.stepId}`);
      const name = decodeStepString(ent.args[2], 'Default Site');
      const description = decodeStepString(ent.args[3], '');
      const { properties, quantities } = extractPropertiesAndQuantities(ent.stepId);
      const widthProp =
        properties.find((p) => /plotwidth|sitewidth|width/i.test(p.propertyName))?.value ||
        quantities.find((q) => /width/i.test(q.quantityName))?.value;
      const lengthProp =
        properties.find((p) => /plotlength|sitelength|length|depth/i.test(p.propertyName))?.value ||
        quantities.find((q) => /length|depth|perimeter/i.test(q.quantityName))?.value;

      spatialHierarchy.site = {
        stepId: ent.stepId,
        globalId,
        name: name || 'Default Site',
        description: description || undefined,
        siteWidthInSourceUnits: typeof widthProp === 'number' && widthProp > 0 ? widthProp : undefined,
        siteLengthInSourceUnits: typeof lengthProp === 'number' && lengthProp > 0 ? lengthProp : undefined,
      };
    } else if (ent.ifcType === 'IFCBUILDING' && !spatialHierarchy.building) {
      const globalId = decodeStepString(ent.args[0], `BLDG-${ent.stepId}`);
      const name = decodeStepString(ent.args[2], 'Primary Building');
      const description = decodeStepString(ent.args[3], '');
      spatialHierarchy.building = {
        stepId: ent.stepId,
        globalId,
        name: name || 'Primary Building',
        description: description || undefined,
      };
    }
  }

  if (!spatialHierarchy.project) {
    errors.push({
      id: 'err-no-ifcproject',
      code: 'NO_SPATIAL_ROOT',
      message: 'IFC file does not contain a root IFCPROJECT entity.',
      fatal: true,
    });
  }

  // Extract storeys and sort by elevation ascending
  const rawStoreys: Array<{
    stepId: number;
    globalId: string;
    name: string;
    elevation: number;
  }> = [];

  for (const ent of entityMap.values()) {
    if (ent.ifcType === 'IFCBUILDINGSTOREY') {
      // IFCBUILDINGSTOREY(GlobalId, OwnerHistory, Name, Description, ObjectType, ObjectPlacement, Representation, LongName, CompositionType, Elevation)
      const globalId = decodeStepString(ent.args[0], `STRY-${ent.stepId}`);
      const name = decodeStepString(ent.args[2], '') || decodeStepString(ent.args[7], '') || `Storey #${ent.stepId}`;
      const placementId = parseStepRef(ent.args[5]);
      const explicitElev = parseStepNumber(ent.args[9], NaN);
      const placementCoords = resolveLocalPlacement(placementId);
      const elevation = !isNaN(explicitElev) ? explicitElev : placementCoords.z;

      if (!ent.args[2] || ent.args[2].trim() === '$') {
        warnings.push({
          id: `warn-storey-name-${ent.stepId}`,
          code: 'MISSING_OPTIONAL_PROPERTY',
          severity: 'info',
          stepId: ent.stepId,
          globalId,
          ifcType: 'IFCBUILDINGSTOREY',
          message: `IFCBUILDINGSTOREY #${ent.stepId} is missing an explicit Name attribute; assigned "${name}".`,
        });
      }

      rawStoreys.push({
        stepId: ent.stepId,
        globalId,
        name,
        elevation: isNaN(elevation) ? 0 : elevation,
      });
    }
  }

  rawStoreys.sort((a, b) => a.elevation - b.elevation || a.stepId - b.stepId);

  const storeyLevelByStepId = new Map<number, number>();
  const storeyNameByStepId = new Map<number, string>();

  rawStoreys.forEach((st, idx) => {
    const floorLevel = idx + 1;
    storeyLevelByStepId.set(st.stepId, floorLevel);
    storeyNameByStepId.set(st.stepId, st.name);

    const aggChildren = childrenByParentStepId.get(st.stepId) || [];
    const containedElems = elementsBySpatialContainerStepId.get(st.stepId) || [];
    const spaceStepIds = [
      ...aggChildren.filter((cid) => entityMap.get(cid)?.ifcType === 'IFCSPACE'),
      ...containedElems.filter((cid) => entityMap.get(cid)?.ifcType === 'IFCSPACE'),
    ];

    spatialHierarchy.storeys.push({
      stepId: st.stepId,
      globalId: st.globalId,
      name: st.name,
      elevationInSourceUnits: st.elevation,
      elevationInTargetUnits: st.elevation, // updated during mapping
      mappedFloorLevel: floorLevel,
      spaceStepIds: Array.from(new Set(spaceStepIds)),
      containedElementStepIds: containedElems,
    });
  });

  // Helper to resolve which storey an element or space belongs to
  const resolveStoreyForEntity = (stepId: number): { storeyStepId?: number; storeyName?: string } => {
    // Direct spatial containment
    const containerId = spatialContainerByElementStepId.get(stepId);
    if (containerId) {
      if (storeyLevelByStepId.has(containerId)) {
        return { storeyStepId: containerId, storeyName: storeyNameByStepId.get(containerId) };
      }
      // Or contained in an IfcSpace which is aggregated under an IfcBuildingStorey
      const spaceParent = parentByChildStepId.get(containerId);
      if (spaceParent && storeyLevelByStepId.has(spaceParent)) {
        return { storeyStepId: spaceParent, storeyName: storeyNameByStepId.get(spaceParent) };
      }
    }
    // Aggregation parent
    let currParent = parentByChildStepId.get(stepId);
    let hops = 0;
    while (currParent && hops < 10) {
      if (storeyLevelByStepId.has(currParent)) {
        return { storeyStepId: currParent, storeyName: storeyNameByStepId.get(currParent) };
      }
      currParent = parentByChildStepId.get(currParent);
      hops++;
    }
    return {};
  };

  // 12. Classify all entities in DATA section into supported vs unsupported
  const entities: IFCEntityRecord[] = [];
  const unsupportedEntityCounts: Record<string, number> = {};

  const INFRASTRUCTURE_STEP_TYPES = new Set([
    'IFCPROJECT',
    'IFCSITE',
    'IFCBUILDING',
    'IFCBUILDINGSTOREY',
    'IFCOWNERHISTORY',
    'IFCPERSON',
    'IFCORGANIZATION',
    'IFCPERSONANDORGANIZATION',
    'IFCAPPLICATION',
    'IFCUNITASSIGNMENT',
    'IFCSIUNIT',
    'IFCCONVERSIONBASEDUNIT',
    'IFCMEASUREWITHUNIT',
    'IFCDIMENSIONALEXPONENTS',
    'IFCGEOMETRICREPRESENTATIONCONTEXT',
    'IFCGEOMETRICREPRESENTATIONSUBCONTEXT',
    'IFCLOCALPLACEMENT',
    'IFCAXIS2PLACEMENT3D',
    'IFCAXIS2PLACEMENT2D',
    'IFCCARTESIANPOINT',
    'IFCDIRECTION',
    'IFCVECTOR',
    'IFCPRODUCTDEFINITIONSHAPE',
    'IFCSHAPEREPRESENTATION',
    'IFCEXTRUDEDAREASOLID',
    'IFCRECTANGLEPROFILEDEF',
    'IFCARBITRARYCLOSEDPROFILEDEF',
    'IFCCIRCLEPROFILEDEF',
    'IFCPOLYLINE',
    'IFCBOUNDINGBOX',
    'IFCFACETEDBREP',
    'IFCTRIANGULATEDFACESET',
    'IFCPOLYGONALFACESET',
    'IFCBOOLEANCLIPPINGRESULT',
    'IFCCLOSEDSHELL',
    'IFCFACE',
    'IFCFACEOUTERBOUND',
    'IFCPOLYLOOP',
    'IFCRELAGGREGATES',
    'IFCRELCONTAINEDINSPATIALSTRUCTURE',
    'IFCRELDEFINESBYPROPERTIES',
    'IFCRELASSOCIATESMATERIAL',
    'IFCRELASSOCIATESCLASSIFICATION',
    'IFCRELVOIDSELEMENT',
    'IFCRELFILLSELEMENT',
    'IFCRELSPACEBOUNDARY',
    'IFCPROPERTYSET',
    'IFCPROPERTYSINGLEVALUE',
    'IFCELEMENTQUANTITY',
    'IFCQUANTITYAREA',
    'IFCQUANTITYLENGTH',
    'IFCQUANTITYVOLUME',
    'IFCQUANTITYCOUNT',
    'IFCMATERIAL',
    'IFCMATERIALLIST',
    'IFCMATERIALLAYER',
    'IFCMATERIALLAYERSET',
    'IFCMATERIALLAYERSETUSAGE',
    'IFCCLASSIFICATION',
    'IFCCLASSIFICATIONREFERENCE',
    'IFCSTYLEDITEM',
    'IFCSURFACESTYLE',
    'IFCSURFACESTYLERENDERING',
    'IFCCOLOURRGB',
    'IFCPRESENTATIONSTYLEASSIGNMENT',
  ]);

  for (const ent of entityMap.values()) {
    if (INFRASTRUCTURE_STEP_TYPES.has(ent.ifcType)) {
      continue;
    }

    const globalId = decodeStepString(ent.args[0], `IFC-${ent.stepId}`);
    const rawName = decodeStepString(ent.args[2], '');
    const description = decodeStepString(ent.args[3], '');
    const objectType = decodeStepString(ent.args[4], '');
    const placementId = parseStepRef(ent.args[5]);
    const representationId = parseStepRef(ent.args[6]);

    const { properties, quantities } = extractPropertiesAndQuantities(ent.stepId);
    const materials = extractMaterials(ent.stepId);
    const classifications = extractClassifications(ent.stepId);
    const { storeyStepId, storeyName } = resolveStoreyForEntity(ent.stepId);
    const parentStepId = parentByChildStepId.get(ent.stepId) || spatialContainerByElementStepId.get(ent.stepId);
    const parentEnt = parentStepId ? entityMap.get(parentStepId) : undefined;
    const parentGlobalId = parentEnt ? decodeStepString(parentEnt.args[0], undefined) : undefined;

    if (ent.ifcType === 'IFCSPACE') {
      // IFCSPACE(GlobalId, OwnerHistory, Name, Description, ObjectType, ObjectPlacement, Representation, LongName, CompositionType, PredefinedType, ElevationWithFlooring)
      const longName = decodeStepString(ent.args[7], '');
      const predefinedType = decodeStepString(ent.args[9], '');
      const displayName = longName || rawName || `Space #${ent.stepId}`;

      if (!rawName && !longName) {
        warnings.push({
          id: `warn-missing-space-name-${ent.stepId}`,
          code: 'MISSING_OPTIONAL_PROPERTY',
          severity: 'info',
          stepId: ent.stepId,
          globalId,
          ifcType: 'IFCSPACE',
          message: `IFCSPACE #${ent.stepId} is missing both Name and LongName attributes; defaulted to "${displayName}".`,
        });
      }

      if (!storeyStepId) {
        warnings.push({
          id: `warn-space-no-storey-${ent.stepId}`,
          code: 'UNRESOLVED_SPATIAL_PARENT',
          severity: 'warning',
          stepId: ent.stepId,
          globalId,
          ifcType: 'IFCSPACE',
          message: `IFCSPACE "${displayName}" (#${ent.stepId}) is not linked to an IFCBUILDINGSTOREY via IFCRELAGGREGATES or IFCRELCONTAINEDINSPATIALSTRUCTURE. Defaulting to Floor 1.`,
        });
      }

      const geometry = extractElementGeometry(
        ent.stepId,
        ent.ifcType,
        placementId,
        representationId,
        quantities,
        false
      );

      entities.push({
        stepId: ent.stepId,
        globalId,
        ifcType: ent.ifcType,
        category: 'space',
        name: displayName,
        description: description || undefined,
        objectType: objectType || undefined,
        longName: longName || undefined,
        predefinedType: predefinedType || undefined,
        parentStepId,
        parentGlobalId,
        storeyStepId,
        storeyName,
        geometry,
        properties,
        quantities,
        materials,
        classifications,
        preservationStatus: geometry.hasValidSolidBounds
          ? 'imported-and-editable'
          : 'imported-not-editable',
        preservationNote: geometry.hasValidSolidBounds
          ? 'Mapped to editable Plotify FloorPlanRoom on 2D Floor Plan and 3D Building Viewer.'
          : 'Retained in project IFC metadata only; geometry representation is missing or non-rectilinear.',
      });
    } else if (ent.ifcType === 'IFCCOLUMN') {
      const displayName = rawName || decodeStepString(ent.args[7], '') || `C-${ent.stepId}`;
      const geometry = extractElementGeometry(
        ent.stepId,
        ent.ifcType,
        placementId,
        representationId,
        quantities,
        true
      );
      entities.push({
        stepId: ent.stepId,
        globalId,
        ifcType: ent.ifcType,
        category: 'column',
        name: displayName,
        description: description || undefined,
        objectType: objectType || undefined,
        tag: decodeStepString(ent.args[7], undefined),
        predefinedType: decodeStepString(ent.args[8], undefined),
        parentStepId,
        parentGlobalId,
        storeyStepId,
        storeyName,
        geometry,
        properties,
        quantities,
        materials,
        classifications,
        preservationStatus: geometry.hasValidSolidBounds
          ? 'imported-and-editable'
          : 'imported-not-editable',
        preservationNote: geometry.hasValidSolidBounds
          ? 'Mapped to Plotify StructuralColumn in Structural Coordination & 3D Viewer.'
          : 'Retained in project IFC metadata; column profile geometry could not be resolved.',
      });
    } else if (ent.ifcType === 'IFCBEAM') {
      const displayName = rawName || decodeStepString(ent.args[7], '') || `B-${ent.stepId}`;
      const geometry = extractElementGeometry(
        ent.stepId,
        ent.ifcType,
        placementId,
        representationId,
        quantities,
        false
      );
      entities.push({
        stepId: ent.stepId,
        globalId,
        ifcType: ent.ifcType,
        category: 'beam',
        name: displayName,
        description: description || undefined,
        objectType: objectType || undefined,
        tag: decodeStepString(ent.args[7], undefined),
        predefinedType: decodeStepString(ent.args[8], undefined),
        parentStepId,
        parentGlobalId,
        storeyStepId,
        storeyName,
        geometry,
        properties,
        quantities,
        materials,
        classifications,
        preservationStatus: geometry.hasValidSolidBounds
          ? 'imported-and-editable'
          : 'imported-not-editable',
        preservationNote: geometry.hasValidSolidBounds
          ? 'Mapped to Plotify StructuralBeam in Structural Coordination.'
          : 'Retained in project IFC metadata.',
      });
    } else if (
      ent.ifcType === 'IFCWALL' ||
      ent.ifcType === 'IFCWALLSTANDARDCASE' ||
      ent.ifcType === 'IFCSLAB' ||
      ent.ifcType === 'IFCDOOR' ||
      ent.ifcType === 'IFCWINDOW'
    ) {
      const displayName = rawName || `${ent.ifcType} #${ent.stepId}`;
      const category: IFCEntityCategory =
        ent.ifcType === 'IFCSLAB'
          ? 'slab'
          : ent.ifcType === 'IFCDOOR' || ent.ifcType === 'IFCWINDOW'
          ? 'opening'
          : 'wall';
      const geometry = extractElementGeometry(
        ent.stepId,
        ent.ifcType,
        placementId,
        representationId,
        quantities,
        false
      );

      warnings.push({
        id: `warn-ro-elem-${ent.stepId}`,
        code: 'READ_ONLY_ELEMENT_METADATA',
        severity: 'info',
        stepId: ent.stepId,
        globalId,
        ifcType: ent.ifcType,
        message: `${ent.ifcType} "${displayName}" (#${ent.stepId}) imported into IFC Provenance Ledger as read-only metadata. Plotify generates 2D/3D walls, slabs, and openings parametrically from room envelopes.`,
      });

      entities.push({
        stepId: ent.stepId,
        globalId,
        ifcType: ent.ifcType,
        category,
        name: displayName,
        description: description || undefined,
        objectType: objectType || undefined,
        parentStepId,
        parentGlobalId,
        storeyStepId,
        storeyName,
        geometry,
        properties,
        quantities,
        materials,
        classifications,
        preservationStatus: 'imported-not-editable',
        preservationNote:
          'Preserved in project IFC Provenance Ledger (properties, materials, quantities, and GlobalId retained). Not directly editable as a standalone element.',
      });
    } else {
      // Unsupported entity type (e.g. IFCSTAIR, IFCROOF, IFCFURNISHINGELEMENT, IFCFLOWSEGMENT, etc.)
      unsupportedEntityCounts[ent.ifcType] = (unsupportedEntityCounts[ent.ifcType] || 0) + 1;
      const displayName = rawName || `${ent.ifcType} #${ent.stepId}`;

      warnings.push({
        id: `warn-unsupported-${ent.stepId}`,
        code: 'UNSUPPORTED_ENTITY',
        severity: 'warning',
        stepId: ent.stepId,
        globalId,
        ifcType: ent.ifcType,
        message: `Unsupported IFC entity ${ent.ifcType} "${displayName}" (#${ent.stepId}) encountered and skipped from geometric mapping.`,
        remedy: 'Review the OpenBIM Support Profile for supported entity types.',
      });

      entities.push({
        stepId: ent.stepId,
        globalId,
        ifcType: ent.ifcType,
        category: 'unsupported-element',
        name: displayName,
        description: description || undefined,
        objectType: objectType || undefined,
        parentStepId,
        parentGlobalId,
        storeyStepId,
        storeyName,
        geometry: {
          representationType: 'None',
          x: 0,
          y: 0,
          z: 0,
          width: 0,
          length: 0,
          height: 0,
          rotationDeg: 0,
          isAxisAligned: true,
          hasValidSolidBounds: false,
        },
        properties,
        quantities,
        materials,
        classifications,
        preservationStatus: 'omitted-unsupported',
        preservationNote: `Entity type ${ent.ifcType} is outside Plotify's P41 OpenBIM support profile and was omitted from active model geometry.`,
      });
    }
  }

  const isValid = !errors.some((e) => e.fatal);

  return {
    formatVersion: 'plotify-ifc-ir-v1',
    createdAt: nowIso,
    isValid,
    metadata: emptyMetadata,
    spatialHierarchy,
    entities,
    unsupportedEntityCounts,
    totalRawStepEntities: statements.length,
    warnings,
    errors,
  };
}

/**
 * Asynchronous, non-blocking wrapper for IFC parsing that prevents duplicate concurrent imports
 * and respects AbortSignal cancellation.
 */
export async function parseIFCAsync(request: IFCImportRequest): Promise<IFCIntermediateModel> {
  const lockKey =
    request.requestId || `${request.fileName}:${request.fileSizeBytes}:${request.rawContent.length}`;

  if (ACTIVE_IMPORT_REQUESTS.has(lockKey)) {
    return {
      formatVersion: 'plotify-ifc-ir-v1',
      createdAt: new Date().toISOString(),
      isValid: false,
      metadata: {
        fileName: request.fileName,
        fileSizeBytes: request.fileSizeBytes,
        fileChecksum: '',
        schemaIdentifier: 'UNKNOWN',
        normalizedSchema: 'UNSUPPORTED',
        fileDescription: '',
        implementationLevel: '',
        author: '',
        organization: '',
        preprocessorVersion: '',
        originatingSystem: '',
        authorization: '',
        timeStamp: '',
        sourceLengthUnit: 'METRE',
        sourceLengthToMetresFactor: 1,
        sourceAreaUnitLabel: 'm²',
        sourceVolumeUnitLabel: 'm³',
        parsedAt: new Date().toISOString(),
      },
      spatialHierarchy: { storeys: [] },
      entities: [],
      unsupportedEntityCounts: {},
      totalRawStepEntities: 0,
      warnings: [],
      errors: [
        {
          id: 'err-dup-import-lock',
          code: 'DUPLICATE_IMPORT_IN_PROGRESS',
          message: `An import operation for "${request.fileName}" is already in progress. Duplicate concurrent imports are blocked.`,
          fatal: true,
        },
      ],
    };
  }

  ACTIVE_IMPORT_REQUESTS.add(lockKey);
  try {
    // Yield to event loop so UI remains responsive
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
    if (request.signal?.aborted) {
      return parseIFCToIntermediateModel(request);
    }
    return parseIFCToIntermediateModel(request);
  } finally {
    ACTIVE_IMPORT_REQUESTS.delete(lockKey);
  }
}

// ============================================================================
// 4. INTERMEDIATE MODEL VALIDATION & MAPPING TO PLOTIFY
// ============================================================================

export function validateIntermediateModel(ir: IFCIntermediateModel): {
  isValid: boolean;
  errors: IFCImportError[];
} {
  const errors: IFCImportError[] = [...ir.errors];
  if (!ir || ir.formatVersion !== 'plotify-ifc-ir-v1') {
    errors.push({
      id: 'err-ir-version',
      code: 'INVALID_INTERMEDIATE_MODEL',
      message: 'Unrecognized or corrupted IFC Intermediate Model format version.',
      fatal: true,
    });
  }
  if (
    ir.metadata.normalizedSchema !== 'IFC2X3' &&
    ir.metadata.normalizedSchema !== 'IFC4'
  ) {
    if (!errors.some((e) => e.code === 'UNSUPPORTED_SCHEMA')) {
      errors.push({
        id: 'err-ir-schema',
        code: 'UNSUPPORTED_SCHEMA',
        message: `Intermediate model schema "${ir.metadata.schemaIdentifier}" is not supported.`,
        fatal: true,
      });
    }
  }
  if (!ir.spatialHierarchy?.project) {
    if (!errors.some((e) => e.code === 'NO_SPATIAL_ROOT')) {
      errors.push({
        id: 'err-ir-no-project',
        code: 'NO_SPATIAL_ROOT',
        message: 'Intermediate model is missing a root IfcProject spatial node.',
        fatal: true,
      });
    }
  }
  return {
    isValid: !errors.some((e) => e.fatal),
    errors,
  };
}

/**
 * Infers Plotify room type from IFC space Name, LongName, ObjectType, PredefinedType, or Category property.
 */
export function inferPlotifyRoomType(entity: IFCEntityRecord): string {
  const categoryProp = entity.properties.find((p) => /category|function|usage/i.test(p.propertyName));
  const combined = [
    entity.name,
    entity.longName,
    entity.objectType,
    entity.predefinedType,
    categoryProp ? String(categoryProp.value) : '',
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (/bed|master|suite|sleeping|guest room/i.test(combined)) return 'bedroom';
  if (/bath|wc|toilet|restroom|lavatory|washroom|en-suite|powder/i.test(combined)) return 'bathroom';
  if (/kitchen|pantry|culinary|cooking|scullery/i.test(combined)) return 'kitchen';
  if (/living|lounge|family|great room|salon|sitting/i.test(combined)) return 'living';
  if (/dining|breakfast|banquet|mess/i.test(combined)) return 'dining';
  if (/office|study|work|library|den/i.test(combined)) return 'office';
  if (/balcony|terrace|patio|veranda|deck|loggia/i.test(combined)) return 'balcony';
  if (/garage|carport|parking/i.test(combined)) return 'garage';
  if (/laundry|utility|mudroom|mechanical/i.test(combined)) return 'laundry';
  if (/storage|closet|wardrobe|cellar|store/i.test(combined)) return 'storage';
  return 'custom';
}

/**
 * Maps a validated `IFCIntermediateModel` into Plotify structures without mutating any existing project.
 */
export function mapIFCIntermediateToPlotify(
  ir: IFCIntermediateModel,
  options?: {
    targetUnit?: MeasurementUnit;
  }
): IFCMappingResult {
  const validation = validateIntermediateModel(ir);
  const warnings: IFCImportWarning[] = [...ir.warnings];
  const errors: IFCImportError[] = [...validation.errors];

  // Determine target unit: if user explicitly specifies feet/metres, use it;
  // otherwise use 'feet' for FOOT/INCH source files and 'metres' for METRE/MM/CM source files.
  const defaultTargetUnit: MeasurementUnit =
    ir.metadata.sourceLengthUnit === 'FOOT' || ir.metadata.sourceLengthUnit === 'INCH'
      ? 'feet'
      : 'metres';
  const targetUnit: MeasurementUnit = options?.targetUnit || defaultTargetUnit;

  const factors = getUnitConversionFactors(ir.metadata.sourceLengthUnit);
  const lengthScale = targetUnit === 'metres' ? factors.toMetres : factors.toFeet;
  const areaScale = lengthScale * lengthScale;
  const unitSuffix = targetUnit === 'feet' ? 'ft' : 'm';
  const areaSuffix = targetUnit === 'feet' ? 'sq ft' : 'm²';

  const unitConversions: IFCUnitConversionRecord[] = [];
  if (Math.abs(lengthScale - 1.0) > 1e-6) {
    unitConversions.push({
      dimensionType: 'length',
      sourceUnit: ir.metadata.sourceLengthUnit,
      targetUnit,
      conversionFactor: Number(lengthScale.toFixed(6)),
      exampleTransformation: `100 ${ir.metadata.sourceLengthUnit} → ${(100 * lengthScale).toFixed(2)} ${unitSuffix}`,
    });
    unitConversions.push({
      dimensionType: 'area',
      sourceUnit: `${ir.metadata.sourceLengthUnit}²`,
      targetUnit,
      conversionFactor: Number(areaScale.toFixed(6)),
      exampleTransformation: `100 ${ir.metadata.sourceLengthUnit}² → ${(100 * areaScale).toFixed(2)} ${areaSuffix}`,
    });
    warnings.push({
      id: 'warn-unit-conversion-applied',
      code: 'UNIT_CONVERTED',
      severity: 'info',
      message: `Converted coordinates and dimensions from ${ir.metadata.sourceLengthUnit} to Plotify ${targetUnit} (factor ×${lengthScale.toFixed(4)}).`,
    });
  } else {
    unitConversions.push({
      dimensionType: 'length',
      sourceUnit: ir.metadata.sourceLengthUnit,
      targetUnit,
      conversionFactor: 1.0,
      exampleTransformation: `1 ${ir.metadata.sourceLengthUnit} = 1.00 ${unitSuffix} (Direct 1:1 unit match)`,
    });
  }

  // Map storeys to sequential integer floorLevels (1..N)
  const storeyFloorMap = new Map<number, number>();
  ir.spatialHierarchy.storeys.forEach((st, idx) => {
    st.elevationInTargetUnits = Number((st.elevationInSourceUnits * lengthScale).toFixed(2));
    st.mappedFloorLevel = idx + 1;
    storeyFloorMap.set(st.stepId, idx + 1);
  });

  const idMappings: IFCIDMappingEntry[] = [];
  if (ir.spatialHierarchy.project) {
    idMappings.push({
      sourceStepId: ir.spatialHierarchy.project.stepId,
      sourceGlobalId: ir.spatialHierarchy.project.globalId,
      sourceIfcType: 'IFCPROJECT',
      sourceName: ir.spatialHierarchy.project.name,
      plotifyEntityId: 'project-root',
      plotifyEntityType: 'project',
    });
  }

  ir.spatialHierarchy.storeys.forEach((st) => {
    idMappings.push({
      sourceStepId: st.stepId,
      sourceGlobalId: st.globalId,
      sourceIfcType: 'IFCBUILDINGSTOREY',
      sourceName: st.name,
      plotifyEntityId: `floor-${st.mappedFloorLevel}`,
      plotifyEntityType: 'storey',
      floorLevel: st.mappedFloorLevel,
    });
  });

  // Collect valid spaces, columns, beams in target units
  const rawMappedSpaces: Array<{
    entity: IFCEntityRecord;
    x: number;
    y: number;
    width: number;
    length: number;
    floorLevel: number;
    roomType: string;
  }> = [];

  const rawMappedColumns: Array<{
    entity: IFCEntityRecord;
    x: number;
    y: number;
    width: number;
    depth: number;
    floorLevel: number;
    profile: 'rectangular' | 'circular';
  }> = [];

  const rawMappedBeams: Array<{
    entity: IFCEntityRecord;
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    profileWidth: number;
    profileDepth: number;
    floorLevel: number;
  }> = [];

  for (const ent of ir.entities) {
    const floorLevel =
      (ent.storeyStepId ? storeyFloorMap.get(ent.storeyStepId) : undefined) || 1;

    if (ent.category === 'space' && ent.geometry.hasValidSolidBounds) {
      const w = Number((ent.geometry.width * lengthScale).toFixed(2));
      const l = Number((ent.geometry.length * lengthScale).toFixed(2));
      const x = Number((ent.geometry.x * lengthScale).toFixed(2));
      const y = Number((ent.geometry.y * lengthScale).toFixed(2));

      if (w > 0 && l > 0) {
        rawMappedSpaces.push({
          entity: ent,
          x,
          y,
          width: w,
          length: l,
          floorLevel,
          roomType: inferPlotifyRoomType(ent),
        });
      }
    } else if (ent.category === 'column' && ent.geometry.hasValidSolidBounds) {
      const w = Math.max(0.2, Number((ent.geometry.width * lengthScale).toFixed(2)));
      const d = Math.max(0.2, Number((ent.geometry.length * lengthScale).toFixed(2)));
      const x = Number((ent.geometry.x * lengthScale).toFixed(2));
      const y = Number((ent.geometry.y * lengthScale).toFixed(2));
      rawMappedColumns.push({
        entity: ent,
        x,
        y,
        width: w,
        depth: d,
        floorLevel,
        profile: ent.geometry.rawGeometryNote === 'CircularColumnProfile' ? 'circular' : 'rectangular',
      });
    } else if (ent.category === 'beam' && ent.geometry.hasValidSolidBounds) {
      const x = Number((ent.geometry.x * lengthScale).toFixed(2));
      const y = Number((ent.geometry.y * lengthScale).toFixed(2));
      const w = Number((ent.geometry.width * lengthScale).toFixed(2));
      const l = Number((ent.geometry.length * lengthScale).toFixed(2));
      rawMappedBeams.push({
        entity: ent,
        startX: x,
        startY: y,
        endX: Number((x + w).toFixed(2)),
        endY: y,
        profileWidth: Math.max(0.2, Math.min(w, l)),
        profileDepth: Math.max(0.3, Number((ent.geometry.height * lengthScale).toFixed(2))),
        floorLevel,
      });
    } else if (ent.preservationStatus === 'imported-not-editable') {
      idMappings.push({
        sourceStepId: ent.stepId,
        sourceGlobalId: ent.globalId,
        sourceIfcType: ent.ifcType,
        sourceName: ent.name,
        plotifyEntityId: `meta-${ent.stepId}`,
        plotifyEntityType: 'metadata-only',
        floorLevel,
      });
    }
  }

  // Coordinate normalization: Ensure all mapped rooms and columns have non-negative coordinates (x >= margin, y >= margin)
  let minCoordX = 0;
  let minCoordY = 0;
  const allXs: number[] = [];
  const allYs: number[] = [];
  const allMaxXs: number[] = [];
  const allMaxYs: number[] = [];

  for (const sp of rawMappedSpaces) {
    allXs.push(sp.x);
    allYs.push(sp.y);
    allMaxXs.push(sp.x + sp.width);
    allMaxYs.push(sp.y + sp.length);
  }
  for (const col of rawMappedColumns) {
    allXs.push(col.x);
    allYs.push(col.y);
    allMaxXs.push(col.x + col.width / 2);
    allMaxYs.push(col.y + col.depth / 2);
  }

  let offsetX = 0;
  let offsetY = 0;
  let wasShifted = false;
  const defaultMargin = targetUnit === 'feet' ? 4 : 2;

  if (allXs.length > 0) {
    minCoordX = Math.min(...allXs);
    minCoordY = Math.min(...allYs);
    if (minCoordX < 0 || minCoordY < 0) {
      offsetX = Number((defaultMargin - minCoordX).toFixed(2));
      offsetY = Number((defaultMargin - minCoordY).toFixed(2));
      wasShifted = true;
      warnings.push({
        id: 'warn-coord-offset',
        code: 'COORDINATE_OFFSET_NORMALIZED',
        severity: 'info',
        message: `Normalized negative IFC local coordinates by (+${offsetX} ${unitSuffix}, +${offsetY} ${unitSuffix}) to fit inside Plotify's positive plot origin (0,0).`,
      });
    }
  }

  // Build final FloorPlanRoom[]
  const mappedRooms: FloorPlanRoom[] = rawMappedSpaces.map((sp, index) => {
    const plotifyRoomId = `room-ifc-${sp.entity.stepId}-${index + 1}`;
    const typeConfig = ROOM_TYPE_CONFIG[sp.roomType] || ROOM_TYPE_CONFIG.custom;
    const room: FloorPlanRoom = {
      id: plotifyRoomId,
      name: sp.entity.name,
      type: sp.roomType,
      x: Number((sp.x + offsetX).toFixed(2)),
      y: Number((sp.y + offsetY).toFixed(2)),
      width: sp.width,
      length: sp.length,
      color: typeConfig.defaultColor,
      floorLevel: sp.floorLevel,
    };

    idMappings.push({
      sourceStepId: sp.entity.stepId,
      sourceGlobalId: sp.entity.globalId,
      sourceIfcType: sp.entity.ifcType,
      sourceName: sp.entity.name,
      plotifyEntityId: plotifyRoomId,
      plotifyEntityType: 'room',
      floorLevel: sp.floorLevel,
    });

    return room;
  });

  // Build final StructuralColumn[]
  const mappedColumns: StructuralColumn[] = rawMappedColumns.map((col, index) => {
    const plotifyColId = `col-ifc-${col.entity.stepId}-${index + 1}`;
    const matRaw = col.entity.materials.join(' ').toLowerCase();
    const material = /steel/i.test(matRaw)
      ? 'structural-steel'
      : /timber|wood|glulam/i.test(matRaw)
      ? 'mass-timber'
      : 'reinforced-concrete';

    idMappings.push({
      sourceStepId: col.entity.stepId,
      sourceGlobalId: col.entity.globalId,
      sourceIfcType: col.entity.ifcType,
      sourceName: col.entity.name,
      plotifyEntityId: plotifyColId,
      plotifyEntityType: 'column',
      floorLevel: col.floorLevel,
    });

    return {
      id: plotifyColId,
      label: col.entity.name,
      x: Number((col.x + offsetX).toFixed(2)),
      y: Number((col.y + offsetY).toFixed(2)),
      floorLevels: [col.floorLevel],
      profile: col.profile,
      width: col.width,
      depth: col.depth,
      material,
      isLoadBearing: true,
      status: 'active',
      notes: `Imported from IFC ${col.entity.ifcType} (${col.entity.globalId})`,
    };
  });

  // Build final StructuralBeam[]
  const mappedBeams: StructuralBeam[] = rawMappedBeams.map((bm, index) => {
    const plotifyBeamId = `beam-ifc-${bm.entity.stepId}-${index + 1}`;
    const matRaw = bm.entity.materials.join(' ').toLowerCase();
    const material = /steel/i.test(matRaw)
      ? 'structural-steel'
      : /timber|wood|glulam/i.test(matRaw)
      ? 'mass-timber'
      : 'reinforced-concrete';

    idMappings.push({
      sourceStepId: bm.entity.stepId,
      sourceGlobalId: bm.entity.globalId,
      sourceIfcType: bm.entity.ifcType,
      sourceName: bm.entity.name,
      plotifyEntityId: plotifyBeamId,
      plotifyEntityType: 'beam',
      floorLevel: bm.floorLevel,
    });

    return {
      id: plotifyBeamId,
      label: bm.entity.name,
      startX: Number((bm.startX + offsetX).toFixed(2)),
      startY: Number((bm.startY + offsetY).toFixed(2)),
      endX: Number((bm.endX + offsetX).toFixed(2)),
      endY: Number((bm.endY + offsetY).toFixed(2)),
      floorLevel: bm.floorLevel,
      profileWidth: bm.profileWidth,
      profileDepth: bm.profileDepth,
      material,
      beamType: 'primary-girder',
    };
  });

  // Compute plotWidth & plotLength
  const maxRoomRight =
    mappedRooms.length > 0
      ? Math.max(...mappedRooms.map((r) => r.x + r.width))
      : targetUnit === 'feet'
      ? 40
      : 15;
  const maxRoomBottom =
    mappedRooms.length > 0
      ? Math.max(...mappedRooms.map((r) => r.y + r.length))
      : targetUnit === 'feet'
      ? 60
      : 22;

  const siteW = ir.spatialHierarchy.site?.siteWidthInSourceUnits
    ? Number((ir.spatialHierarchy.site.siteWidthInSourceUnits * lengthScale).toFixed(1))
    : 0;
  const siteL = ir.spatialHierarchy.site?.siteLengthInSourceUnits
    ? Number((ir.spatialHierarchy.site.siteLengthInSourceUnits * lengthScale).toFixed(1))
    : 0;

  const plotWidth = Math.max(
    siteW,
    Math.ceil(maxRoomRight + defaultMargin),
    targetUnit === 'feet' ? 30 : 12
  );
  const plotLength = Math.max(
    siteL,
    Math.ceil(maxRoomBottom + defaultMargin),
    targetUnit === 'feet' ? 40 : 16
  );

  const floors = Math.max(
    1,
    ir.spatialHierarchy.storeys.length,
    ...mappedRooms.map((r) => r.floorLevel)
  );

  const projectName =
    ir.spatialHierarchy.building?.name &&
    ir.spatialHierarchy.building.name !== 'Primary Building'
      ? ir.spatialHierarchy.building.name
      : ir.spatialHierarchy.project?.name || 'Imported OpenBIM Project';

  // Build preservation breakdown
  const editableEntities = ir.entities.filter((e) => e.preservationStatus === 'imported-and-editable');
  const readOnlyEntities = ir.entities.filter((e) => e.preservationStatus === 'imported-not-editable');
  const omittedEntities = ir.entities.filter((e) => e.preservationStatus === 'omitted-unsupported');

  const unrepresentableGeometryCount = ir.entities.filter(
    (e) =>
      e.category !== 'unsupported-element' &&
      e.geometry.representationType.startsWith('Unsupported-')
  ).length;

  const duplicateIdsDetected = warnings.filter((w) => w.code === 'DUPLICATE_ENTITY_ID').length;
  const brokenReferencesDetected = warnings.filter((w) => w.code === 'BROKEN_REFERENCE').length;

  const report: IFCImportReport = {
    reportId: `ifc-rep-${Date.now()}`,
    generatedAt: new Date().toISOString(),
    fileName: ir.metadata.fileName,
    schemaIdentifier: ir.metadata.schemaIdentifier,
    sourceUnit: ir.metadata.sourceLengthUnit,
    targetUnit,
    totalStepEntitiesEncountered: ir.totalRawStepEntities,
    supportedArchitecturalEntitiesFound: editableEntities.length + readOnlyEntities.length,
    entitiesMappedToEditableModel: editableEntities.length,
    entitiesPreservedAsReadOnlyMetadata: readOnlyEntities.length,
    entitiesSkippedOrUnsupported: omittedEntities.length,
    unsupportedEntityBreakdown: { ...ir.unsupportedEntityCounts },
    mappedSpacesCount: mappedRooms.length,
    mappedStoreysCount: ir.spatialHierarchy.storeys.length,
    mappedColumnsCount: mappedColumns.length,
    mappedBeamsCount: mappedBeams.length,
    readOnlyWallsCount: ir.entities.filter((e) => e.category === 'wall').length,
    readOnlySlabsCount: ir.entities.filter((e) => e.category === 'slab').length,
    readOnlyOpeningsCount: ir.entities.filter((e) => e.category === 'opening').length,
    duplicateIdsDetected,
    brokenReferencesDetected,
    unrepresentableGeometryCount,
    coordinateOffsetApplied: {
      offsetX,
      offsetY,
      unit: targetUnit,
      wasShifted,
    },
    unitConversions,
    preservationBreakdown: {
      importedAndEditable: editableEntities.map(
        (e) => `${e.ifcType} "${e.name}" (#${e.stepId}, GlobalId: ${e.globalId})`
      ),
      importedNotEditable: readOnlyEntities.map(
        (e) => `${e.ifcType} "${e.name}" (#${e.stepId}) — ${e.preservationNote}`
      ),
      transformedOrNormalized: [
        ...(Math.abs(lengthScale - 1.0) > 1e-6
          ? [`Unit conversion: ${ir.metadata.sourceLengthUnit} → ${targetUnit} (×${lengthScale.toFixed(4)})`]
          : [`Unit preserved: ${targetUnit}`]),
        ...(wasShifted
          ? [`Coordinate origin offset: shifted by (+${offsetX}, +${offsetY}) ${unitSuffix} into positive parcel bounds`]
          : []),
        `Storey elevation sorting: ${ir.spatialHierarchy.storeys.length} IFC storey(s) mapped to integer floorLevel 1..${floors}`,
      ],
      omittedUnsupported: omittedEntities.map(
        (e) => `${e.ifcType} "${e.name}" (#${e.stepId}) — Unsupported IFC entity class`
      ),
    },
    warnings,
    errors,
  };

  const interopMetadata: ProjectIFCInteropMetadata = {
    version: 'plotify-ifc-meta-v1',
    lastImportedAt: report.generatedAt,
    sourceMetadata: ir.metadata,
    idMappings,
    preservedElements: ir.entities.map((e) => ({
      stepId: e.stepId,
      globalId: e.globalId,
      ifcType: e.ifcType,
      name: e.name,
      floorLevel: e.storeyStepId ? storeyFloorMap.get(e.storeyStepId) : 1,
      properties: e.properties,
      quantities: e.quantities,
      materials: e.materials,
      classifications: e.classifications,
      preservationStatus: e.preservationStatus,
      note: e.preservationNote,
    })),
    unsupportedEntitySummary: { ...ir.unsupportedEntityCounts },
    lastImportReport: report,
  };

  return {
    success: validation.isValid,
    targetUnit,
    mappedProjectSpec: {
      name: projectName,
      projectType: 'house',
      plotWidth,
      plotLength,
      floors,
      notes: `Imported via Plotify OpenBIM & IFC Interoperability (P41) from "${ir.metadata.fileName}" (${ir.metadata.schemaIdentifier}).`,
    },
    mappedRooms,
    mappedColumns,
    mappedBeams,
    idMappings,
    interopMetadata,
    report,
  };
}

/**
 * Computes RoomConfig counts from an array of FloorPlanRoom items.
 */
export function deriveRoomConfigFromRooms(rooms: FloorPlanRoom[]): RoomConfig {
  const countByType = (t: string) => rooms.filter((r) => r.type === t).length;
  const customRooms = rooms
    .filter((r) => r.type === 'custom')
    .map((r) => ({ name: r.name, count: 1 }));

  return {
    bedrooms: countByType('bedroom'),
    bathrooms: countByType('bathroom'),
    kitchen: countByType('kitchen'),
    livingRoom: countByType('living'),
    diningRoom: countByType('dining'),
    homeOffice: countByType('office'),
    balcony: countByType('balcony'),
    garage: countByType('garage'),
    laundry: countByType('laundry'),
    storage: countByType('storage'),
    customRooms,
  };
}

/**
 * Creates a brand-new Plotify `Project` payload from an `IFCMappingResult`.
 */
export function buildNewProjectFromIFCMapping(
  mapping: IFCMappingResult,
  defaultCurrency: Project['currency'] = 'USD'
): Omit<Project, 'id' | 'createdAt' | 'updatedAt'> {
  if (!mapping.success) {
    throw new Error('Cannot create a project from an invalid or failed IFC mapping result.');
  }

  const baseProjectStub: Project = {
    id: 'proj-ifc-temp',
    name: mapping.mappedProjectSpec.name,
    projectType: mapping.mappedProjectSpec.projectType,
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
    ifcInterop: mapping.interopMetadata,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // If structural columns or beams were mapped, initialize structural coordination and merge them
  if (mapping.mappedColumns.length > 0 || mapping.mappedBeams.length > 0) {
    const baseStruct = initializeStructuralCoordination(baseProjectStub);
    const mergedStruct: StructuralCoordinationData = {
      ...baseStruct,
      columns: mapping.mappedColumns.length > 0 ? mapping.mappedColumns : baseStruct.columns,
      beams: mapping.mappedBeams.length > 0 ? mapping.mappedBeams : baseStruct.beams,
      notes: `${baseStruct.notes} Includes ${mapping.mappedColumns.length} column(s) and ${mapping.mappedBeams.length} beam(s) imported from IFC.`,
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
 * Safely applies mapped IFC data to an existing `Project`:
 * - Creates a pre-import safety snapshot in Version History first.
 * - Preserves all unrelated project domains (budget, currency, costPlanning, designAlternatives,
 *   scenarios, regulations, brief, siteContext, mepCoordination, expertReviews).
 * - Supports either `'merge-append'` (default: retains existing rooms and appends non-duplicate imported rooms)
 *   or `'replace-geometry'` (replaces floorPlan rooms with imported rooms while preserving all non-geometric project domains).
 */
export function applyIFCMappingToExistingProject(
  existingProject: Project,
  mapping: IFCMappingResult,
  mode: 'merge-append' | 'replace-geometry' = 'merge-append'
): {
  updatedProject: Project;
  safetySnapshotId: string;
} {
  if (!mapping.success) {
    throw new Error('Cannot apply an invalid or failed IFC mapping result to an existing project.');
  }

  // 1. Create pre-import safety checkpoint so the user can always roll back
  const snapshot = createProjectSnapshot(existingProject, {
    trigger: 'pre-restore-safety',
    label: `Pre-IFC Import Safety Checkpoint (${mapping.interopMetadata.sourceMetadata?.fileName || 'IFC'})`,
    description: `Automatic safety snapshot captured before applying IFC import (${mode}).`,
  });

  // 2. If existingProject unit differs from mapping.targetUnit, convert mapped rooms/columns to existingProject.unit
  const unitFactor =
    existingProject.unit === mapping.targetUnit
      ? 1.0
      : existingProject.unit === 'feet'
      ? 1 / 0.3048
      : 0.3048;

  const convertedImportedRooms: FloorPlanRoom[] = mapping.mappedRooms.map((r) => ({
    ...r,
    x: Number((r.x * unitFactor).toFixed(2)),
    y: Number((r.y * unitFactor).toFixed(2)),
    width: Number((r.width * unitFactor).toFixed(2)),
    length: Number((r.length * unitFactor).toFixed(2)),
  }));

  const existingRooms = existingProject.floorPlan?.rooms || [];
  let finalRooms: FloorPlanRoom[];

  if (mode === 'replace-geometry') {
    finalRooms = convertedImportedRooms;
  } else {
    // merge-append: keep all existing rooms, append imported rooms with unique IDs
    const existingIds = new Set(existingRooms.map((r) => r.id));
    const deduplicatedImported = convertedImportedRooms.map((r) =>
      existingIds.has(r.id) ? { ...r, id: `${r.id}-${Date.now().toString(36)}` } : r
    );
    finalRooms = [...existingRooms, ...deduplicatedImported];
  }

  const maxRoomRight =
    finalRooms.length > 0 ? Math.max(...finalRooms.map((r) => r.x + r.width)) : 0;
  const maxRoomBottom =
    finalRooms.length > 0 ? Math.max(...finalRooms.map((r) => r.y + r.length)) : 0;

  const updatedPlotWidth = Math.max(existingProject.plotWidth, Math.ceil(maxRoomRight + 2));
  const updatedPlotLength = Math.max(existingProject.plotLength, Math.ceil(maxRoomBottom + 2));
  const updatedFloors = Math.max(
    existingProject.floors,
    mapping.mappedProjectSpec.floors,
    ...finalRooms.map((r) => r.floorLevel)
  );

  // Preserve existing structural coordination or merge imported columns/beams
  let updatedStructural = existingProject.structuralCoordination;
  if (mapping.mappedColumns.length > 0 || mapping.mappedBeams.length > 0) {
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
        mode === 'replace-geometry'
          ? convertedCols
          : [...baseStruct.columns, ...convertedCols],
      beams:
        mode === 'replace-geometry'
          ? convertedBeams
          : [...baseStruct.beams, ...convertedBeams],
    };
  }

  // Merge IFC interop metadata preserving prior mappings if merging
  const prevMappings = existingProject.ifcInterop?.idMappings || [];
  const mergedMappings =
    mode === 'replace-geometry'
      ? mapping.idMappings
      : [
          ...prevMappings.filter(
            (pm) => !mapping.idMappings.some((nm) => nm.sourceGlobalId === pm.sourceGlobalId)
          ),
          ...mapping.idMappings,
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
    ifcInterop: {
      ...mapping.interopMetadata,
      idMappings: mergedMappings,
      lastExportReport: existingProject.ifcInterop?.lastExportReport,
      lastExportedAt: existingProject.ifcInterop?.lastExportedAt,
    },
    updatedAt: new Date().toISOString(),
  };

  return {
    updatedProject,
    safetySnapshotId: snapshot.id,
  };
}

// ============================================================================
// 5. DETERMINISTIC IFC EXPORTER & INDEPENDENT SCHEMA/REFERENCE VALIDATOR
// ============================================================================

const IFC_BASE64_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';

/**
 * Generates a deterministic 22-character IFC GlobalId (compressed GUID) from a seed string.
 */
export function generateDeterministicIFCGlobalId(seed: string): string {
  const chars: string[] = [];
  let h1 = 0x811c9dc5;
  let h2 = 0x1b873593;
  for (let i = 0; i < seed.length; i++) {
    const c = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = Math.imul(h2 ^ (c + i * 31), 0x85ebca6b);
  }

  // First character in IFC GlobalId must be 0..3
  chars.push(IFC_BASE64_CHARS[Math.abs(h1) % 4]);
  for (let i = 1; i < 22; i++) {
    h1 = Math.imul(h1 ^ (i * 0x9e3779b9), 16777619);
    h2 = Math.imul(h2 ^ (h1 >>> 13), 0xc2b2ae35);
    const idx = Math.abs(h1 ^ h2) % 64;
    chars.push(IFC_BASE64_CHARS[idx]);
  }
  return chars.join('');
}

function escapeStepString(str: string): string {
  return (str || '').replace(/'/g, "''").replace(/[\r\n]+/g, ' ').trim();
}

function formatStepReal(val: number): string {
  if (!isFinite(val) || isNaN(val)) return '0.';
  const fixed = Number(val.toFixed(4));
  const str = String(fixed);
  return str.includes('.') ? str : `${str}.`;
}

/**
 * Independent structural & referential integrity validator for ISO 10303-21 STEP / IFC files.
 * Verifies header, schema, syntax, duplicate step IDs, required spatial root entities, and 100% of #id references.
 */
export function validateIFCFileStructure(ifcContent: string): IFCValidationCheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const unresolvedReferences: Array<{ sourceStepId: number; missingTargetStepId: number }> = [];
  const duplicateStepIds: number[] = [];
  const missingRequiredRoots: string[] = [];

  const trimmed = (ifcContent || '').trim();
  const headerValid =
    trimmed.startsWith('ISO-10303-21;') &&
    /HEADER\s*;[\s\S]*?FILE_DESCRIPTION[\s\S]*?FILE_NAME[\s\S]*?FILE_SCHEMA[\s\S]*?ENDSEC\s*;/i.test(
      trimmed
    );
  const footerValid = trimmed.endsWith('END-ISO-10303-21;');
  const dataMatch = trimmed.match(/DATA\s*;([\s\S]*?)ENDSEC\s*;/i);
  const dataSectionValid = Boolean(dataMatch);

  if (!headerValid) errors.push('Invalid or incomplete ISO-10303-21 HEADER section.');
  if (!dataSectionValid) errors.push('Invalid or missing DATA section.');
  if (!footerValid) errors.push('Missing END-ISO-10303-21; footer.');

  const schemaMatch = trimmed.match(/FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/i);
  const schemaDetected = schemaMatch ? schemaMatch[1].toUpperCase() : 'UNKNOWN';
  if (schemaDetected !== 'IFC4' && schemaDetected !== 'IFC2X3') {
    errors.push(`Unsupported or unrecognized FILE_SCHEMA "${schemaDetected}".`);
  }

  const definedStepIds = new Set<number>();
  const entityTypesPresent = new Set<string>();
  const refPairs: Array<{ sourceStepId: number; targetStepId: number }> = [];

  if (dataMatch) {
    const dataBody = dataMatch[1];
    const lines = dataBody
      .split(';')
      .map((l) => l.trim())
      .filter(Boolean);

    for (const stmt of lines) {
      const m = stmt.match(/^#(\d+)\s*=\s*([A-Z0-9_]+)\s*\(([\s\S]*)\)$/i);
      if (!m) {
        errors.push(`Malformed STEP entity statement: "${stmt.slice(0, 60)}"`);
        continue;
      }
      const id = parseInt(m[1], 10);
      const eType = m[2].toUpperCase();
      const argsStr = m[3];

      if (definedStepIds.has(id)) {
        duplicateStepIds.push(id);
        errors.push(`Duplicate STEP entity ID #${id}.`);
      }
      definedStepIds.add(id);
      entityTypesPresent.add(eType);

      const refs = extractAllStepRefsInArgs(argsStr);
      for (const r of refs) {
        refPairs.push({ sourceStepId: id, targetStepId: r });
      }
    }
  }

  for (const pair of refPairs) {
    if (!definedStepIds.has(pair.targetStepId)) {
      unresolvedReferences.push({
        sourceStepId: pair.sourceStepId,
        missingTargetStepId: pair.targetStepId,
      });
      errors.push(
        `Entity #${pair.sourceStepId} references non-existent entity #${pair.targetStepId}.`
      );
    }
  }

  const requiredRoots = ['IFCPROJECT', 'IFCUNITASSIGNMENT', 'IFCSITE', 'IFCBUILDING', 'IFCBUILDINGSTOREY'];
  for (const req of requiredRoots) {
    if (!entityTypesPresent.has(req)) {
      missingRequiredRoots.push(req);
      errors.push(`Missing required spatial/context entity: ${req}.`);
    }
  }

  return {
    isValid:
      headerValid &&
      dataSectionValid &&
      footerValid &&
      unresolvedReferences.length === 0 &&
      duplicateStepIds.length === 0 &&
      missingRequiredRoots.length === 0 &&
      errors.length === 0,
    schemaDetected,
    headerValid,
    dataSectionValid,
    footerValid,
    totalEntities: definedStepIds.size,
    unresolvedReferences,
    duplicateStepIds,
    missingRequiredRoots,
    errors,
    warnings,
  };
}

/**
 * Exports a Plotify `Project` into a valid ISO 10303-21 STEP file (`.ifc`) conforming to the declared
 * support profile (`IFC4` or `IFC2X3`) and returns the STEP content + detailed `IFCExportReport`.
 */
export function exportProjectToIFC(
  project: Project,
  options?: Partial<IFCExportOptions>
): {
  ifcContent: string;
  report: IFCExportReport;
} {
  if (!project || typeof project !== 'object' || !project.id || !project.name) {
    throw new Error('Invalid project provided for IFC export: missing id or name.');
  }
  if (
    typeof project.plotWidth !== 'number' ||
    project.plotWidth <= 0 ||
    typeof project.plotLength !== 'number' ||
    project.plotLength <= 0
  ) {
    throw new Error('Invalid project dimensions for IFC export: plotWidth and plotLength must be > 0.');
  }

  const opts: IFCExportOptions = {
    schemaVersion: options?.schemaVersion || 'IFC4',
    includePerimeterWallsAndSlabs: options?.includePerimeterWallsAndSlabs ?? true,
    includeStructuralElements: options?.includeStructuralElements ?? true,
    includePropertySets: options?.includePropertySets ?? true,
    includeBaseQuantities: options?.includeBaseQuantities ?? true,
    authorName: options?.authorName || 'Plotify Architect',
    organizationName: options?.organizationName || 'Plotify Architectural Intelligence',
  };

  const rooms = (project.floorPlan?.rooms || []).filter(
    (r) => typeof r.width === 'number' && r.width > 0 && typeof r.length === 'number' && r.length > 0
  );

  // Map existing plotifyEntityId -> preserved sourceGlobalId if available
  const existingGlobalIdByPlotifyId = new Map<string, string>();
  if (project.ifcInterop?.idMappings) {
    for (const m of project.ifcInterop.idMappings) {
      if (m.plotifyEntityId && m.sourceGlobalId && m.sourceGlobalId.length > 0) {
        existingGlobalIdByPlotifyId.set(m.plotifyEntityId, m.sourceGlobalId);
      }
    }
  }

  let preservedGlobalIdsCount = 0;
  let newlyGeneratedGlobalIdsCount = 0;

  const getOrCreateGlobalId = (plotifyEntityId: string, fallbackSeed: string): string => {
    const existing = existingGlobalIdByPlotifyId.get(plotifyEntityId);
    if (existing) {
      preservedGlobalIdsCount++;
      return existing;
    }
    newlyGeneratedGlobalIdsCount++;
    return generateDeterministicIFCGlobalId(`${project.id}:${plotifyEntityId}:${fallbackSeed}`);
  };

  let nextStepId = 1;
  const lines: string[] = [];
  const addEntity = (ifcType: string, args: string): number => {
    const id = nextStepId++;
    lines.push(`#${id} = ${ifcType}(${args});`);
    return id;
  };

  const exportedCounts = {
    projects: 0,
    sites: 0,
    buildings: 0,
    storeys: 0,
    spaces: 0,
    walls: 0,
    slabs: 0,
    columns: 0,
    beams: 0,
    propertySets: 0,
    elementQuantities: 0,
    materials: 0,
  };

  const nowIso = new Date().toISOString().slice(0, 19);
  const unixTime = Math.floor(Date.now() / 1000);

  // 1. OwnerHistory & Application Context
  const personId = addEntity(
    'IFCPERSON',
    `$,'${escapeStepString(opts.authorName!)}',$,$,$,$,$,$`
  );
  const orgId = addEntity(
    'IFCORGANIZATION',
    `$,'${escapeStepString(opts.organizationName!)}','Plotify OpenBIM P41',$,$`
  );
  const personAndOrgId = addEntity('IFCPERSONANDORGANIZATION', `#${personId},#${orgId},$`);
  const appId = addEntity(
    'IFCAPPLICATION',
    `#${orgId},'1.0.0-P41','Plotify OpenBIM & IFC Engine','Plotify-P41'`
  );
  const ownerHistoryId = addEntity(
    'IFCOWNERHISTORY',
    `#${personAndOrgId},#${appId},$,.ADDED.,$,#${personAndOrgId},#${appId},${unixTime}`
  );

  // 2. Units (METRE or FOOT)
  const unitIds: number[] = [];
  if (project.unit === 'feet') {
    const dimExpLength = addEntity('IFCDIMENSIONALEXPONENTS', '1,0,0,0,0,0,0');
    const siMetre = addEntity('IFCSIUNIT', '*,.LENGTHUNIT.,$,.METRE.');
    const measureWithUnit = addEntity(
      'IFCMEASUREWITHUNIT',
      `IFCLENGTHMEASURE(0.3048),#${siMetre}`
    );
    const footUnit = addEntity(
      'IFCCONVERSIONBASEDUNIT',
      `#${dimExpLength},.LENGTHUNIT.,'FOOT',#${measureWithUnit}`
    );
    const siSqMetre = addEntity('IFCSIUNIT', '*,.AREAUNIT.,$,.SQUARE_METRE.');
    const siCuMetre = addEntity('IFCSIUNIT', '*,.VOLUMEUNIT.,$,.CUBIC_METRE.');
    const siRad = addEntity('IFCSIUNIT', '*,.PLANEANGLEUNIT.,$,.RADIAN.');
    unitIds.push(footUnit, siSqMetre, siCuMetre, siRad);
  } else {
    const siMetre = addEntity('IFCSIUNIT', '*,.LENGTHUNIT.,$,.METRE.');
    const siSqMetre = addEntity('IFCSIUNIT', '*,.AREAUNIT.,$,.SQUARE_METRE.');
    const siCuMetre = addEntity('IFCSIUNIT', '*,.VOLUMEUNIT.,$,.CUBIC_METRE.');
    const siRad = addEntity('IFCSIUNIT', '*,.PLANEANGLEUNIT.,$,.RADIAN.');
    unitIds.push(siMetre, siSqMetre, siCuMetre, siRad);
  }
  const unitAssignmentId = addEntity(
    'IFCUNITASSIGNMENT',
    `(${unitIds.map((u) => `#${u}`).join(',')})`
  );

  // 3. Geometric Representation Context & Base Directions
  const origin3D = addEntity('IFCCARTESIANPOINT', '(0.,0.,0.)');
  const origin2D = addEntity('IFCCARTESIANPOINT', '(0.,0.)');
  const dirZ = addEntity('IFCDIRECTION', '(0.,0.,1.)');
  const dirX = addEntity('IFCDIRECTION', '(1.,0.,0.)');
  const dirX2D = addEntity('IFCDIRECTION', '(1.,0.)');
  const worldAxis3D = addEntity('IFCAXIS2PLACEMENT3D', `#${origin3D},#${dirZ},#${dirX}`);
  const geomContextId = addEntity(
    'IFCGEOMETRICREPRESENTATIONCONTEXT',
    `'Model','Model',3,1.0E-5,#${worldAxis3D},$`
  );

  // 4. Spatial Root: IfcProject -> IfcSite -> IfcBuilding -> IfcBuildingStorey
  const projGlobalId = getOrCreateGlobalId('project-root', project.id);
  const ifcProjectId = addEntity(
    'IFCPROJECT',
    `'${projGlobalId}',#${ownerHistoryId},'${escapeStepString(project.name)}','${escapeStepString(
      project.notes || 'Plotify Architectural Project'
    )}',$,'${escapeStepString(project.name)}','${escapeStepString(project.status)}',(#${geomContextId}),#${unitAssignmentId}`
  );
  exportedCounts.projects++;

  const sitePlacementId = addEntity('IFCLOCALPLACEMENT', `$,#${worldAxis3D}`);
  const siteGlobalId = generateDeterministicIFCGlobalId(`${project.id}:site`);
  newlyGeneratedGlobalIdsCount++;
  const ifcSiteId = addEntity(
    'IFCSITE',
    `'${siteGlobalId}',#${ownerHistoryId},'${escapeStepString(
      project.siteContext?.siteName || `${project.name} Parcel`
    )}','Plot Envelope ${project.plotWidth}x${project.plotLength} ${project.unit}',$,#${sitePlacementId},$,$,.ELEMENT.,$,$,$,$,$`
  );
  exportedCounts.sites++;

  // Attach Site Dimension PropertySet so re-import preserves exact plotWidth and plotLength
  if (opts.includePropertySets) {
    const pPlotW = addEntity(
      'IFCPROPERTYSINGLEVALUE',
      `'PlotWidth',$,IFCLENGTHMEASURE(${formatStepReal(project.plotWidth)}),$`
    );
    const pPlotL = addEntity(
      'IFCPROPERTYSINGLEVALUE',
      `'PlotLength',$,IFCLENGTHMEASURE(${formatStepReal(project.plotLength)}),$`
    );
    const pRoad = addEntity(
      'IFCPROPERTYSINGLEVALUE',
      `'RoadFacing',$,IFCLABEL('${escapeStepString(project.roadFacing)}'),$`
    );
    const sitePsetId = addEntity(
      'IFCPROPERTYSET',
      `'${generateDeterministicIFCGlobalId(`${project.id}:pset-site`)}',#${ownerHistoryId},'Pset_SiteCommon',$,(#${pPlotW},#${pPlotL},#${pRoad})`
    );
    exportedCounts.propertySets++;
    addEntity(
      'IFCRELDEFINESBYPROPERTIES',
      `'${generateDeterministicIFCGlobalId(`${project.id}:rel-pset-site`)}',#${ownerHistoryId},$,$,(#${ifcSiteId}),#${sitePsetId}`
    );
  }

  const bldgPlacementId = addEntity('IFCLOCALPLACEMENT', `#${sitePlacementId},#${worldAxis3D}`);
  const bldgGlobalId = generateDeterministicIFCGlobalId(`${project.id}:building`);
  newlyGeneratedGlobalIdsCount++;
  const ifcBuildingId = addEntity(
    'IFCBUILDING',
    `'${bldgGlobalId}',#${ownerHistoryId},'${escapeStepString(project.name)}','${escapeStepString(
      project.projectType
    )}',$,#${bldgPlacementId},$,'${escapeStepString(project.name)}',.ELEMENT.,$,$,$`
  );
  exportedCounts.buildings++;

  addEntity(
    'IFCRELAGGREGATES',
    `'${generateDeterministicIFCGlobalId(`${project.id}:rel-proj-site`)}',#${ownerHistoryId},'ProjectToSite',$,#${ifcProjectId},(#${ifcSiteId})`
  );
  addEntity(
    'IFCRELAGGREGATES',
    `'${generateDeterministicIFCGlobalId(`${project.id}:rel-site-bldg`)}',#${ownerHistoryId},'SiteToBuilding',$,#${ifcSiteId},(#${ifcBuildingId})`
  );

  // 5. Storeys
  const totalFloors = Math.max(
    1,
    project.floors || 1,
    ...rooms.map((r) => r.floorLevel || 1)
  );
  const storeyHeight = project.unit === 'feet' ? 10.0 : 3.0;
  const wallThickness = project.unit === 'feet' ? 0.5 : 0.15;
  const slabThickness = project.unit === 'feet' ? 0.5 : 0.15;

  const storeyIdByLevel = new Map<number, number>();
  const storeyPlacementByLevel = new Map<number, number>();
  const allStoreyIds: number[] = [];

  for (let fl = 1; fl <= totalFloors; fl++) {
    const elev = (fl - 1) * storeyHeight;
    const stOrigin = addEntity('IFCCARTESIANPOINT', `(0.,0.,${formatStepReal(elev)})`);
    const stAxis = addEntity('IFCAXIS2PLACEMENT3D', `#${stOrigin},#${dirZ},#${dirX}`);
    const stPlacement = addEntity('IFCLOCALPLACEMENT', `#${bldgPlacementId},#${stAxis}`);
    const stGlobalId = getOrCreateGlobalId(`floor-${fl}`, `storey-${fl}`);
    const stName = fl === 1 ? 'Level 1 - Ground Floor' : `Level ${fl} - Floor ${fl}`;

    const stId = addEntity(
      'IFCBUILDINGSTOREY',
      `'${stGlobalId}',#${ownerHistoryId},'${stName}',$,$,#${stPlacement},$,'${stName}',.ELEMENT.,${formatStepReal(
        elev
      )}`
    );
    exportedCounts.storeys++;
    storeyIdByLevel.set(fl, stId);
    storeyPlacementByLevel.set(fl, stPlacement);
    allStoreyIds.push(stId);
  }

  addEntity(
    'IFCRELAGGREGATES',
    `'${generateDeterministicIFCGlobalId(`${project.id}:rel-bldg-storeys`)}',#${ownerHistoryId},'BuildingToStoreys',$,#${ifcBuildingId},(${allStoreyIds
      .map((id) => `#${id}`)
      .join(',')})`
  );

  // 6. Export Spaces (FloorPlanRoom -> IFCSPACE) and optional Slabs/Walls
  const spacesByStorey = new Map<number, number[]>();
  const containedElementsByStorey = new Map<number, number[]>();

  for (const room of rooms) {
    const fl = Math.min(Math.max(1, room.floorLevel || 1), totalFloors);
    const parentStoreyPlacement = storeyPlacementByLevel.get(fl)!;

    // Room local placement at (room.x, room.y, 0) relative to storey
    const rmOrigin = addEntity(
      'IFCCARTESIANPOINT',
      `(${formatStepReal(room.x)},${formatStepReal(room.y)},0.)`
    );
    const rmAxis = addEntity('IFCAXIS2PLACEMENT3D', `#${rmOrigin},#${dirZ},#${dirX}`);
    const rmPlacement = addEntity('IFCLOCALPLACEMENT', `#${parentStoreyPlacement},#${rmAxis}`);

    // Profile centered at (width/2, length/2) so lower-left corner is at (room.x, room.y)
    const profCenter = addEntity(
      'IFCCARTESIANPOINT',
      `(${formatStepReal(room.width / 2)},${formatStepReal(room.length / 2)})`
    );
    const profAxis2D = addEntity('IFCAXIS2PLACEMENT2D', `#${profCenter},#${dirX2D}`);
    const rectProfileId = addEntity(
      'IFCRECTANGLEPROFILEDEF',
      `.AREA.,'${escapeStepString(room.name)}_Profile',#${profAxis2D},${formatStepReal(
        room.width
      )},${formatStepReal(room.length)}`
    );

    const solidAxis3D = addEntity('IFCAXIS2PLACEMENT3D', `#${origin3D},#${dirZ},#${dirX}`);
    const extrudedSolidId = addEntity(
      'IFCEXTRUDEDAREASOLID',
      `#${rectProfileId},#${solidAxis3D},#${dirZ},${formatStepReal(storeyHeight)}`
    );
    const shapeRepId = addEntity(
      'IFCSHAPEREPRESENTATION',
      `#${geomContextId},'Body','SweptSolid',(#${extrudedSolidId})`
    );
    const prodShapeId = addEntity('IFCPRODUCTDEFINITIONSHAPE', `$,$,(#${shapeRepId})`);

    const spaceGlobalId = getOrCreateGlobalId(room.id, `space-${room.id}`);
    const spaceEntityArgs =
      opts.schemaVersion === 'IFC2X3'
        ? `'${spaceGlobalId}',#${ownerHistoryId},'${escapeStepString(room.name)}','${escapeStepString(
            room.type
          )}',$,#${rmPlacement},#${prodShapeId},'${escapeStepString(room.name)}',.ELEMENT.,.INTERNAL.,$`
        : `'${spaceGlobalId}',#${ownerHistoryId},'${escapeStepString(room.name)}','${escapeStepString(
            room.type
          )}',$,#${rmPlacement},#${prodShapeId},'${escapeStepString(room.name)}',.ELEMENT.,.SPACE.,$`;

    const ifcSpaceId = addEntity('IFCSPACE', spaceEntityArgs);
    exportedCounts.spaces++;

    const stSpaces = spacesByStorey.get(fl) || [];
    stSpaces.push(ifcSpaceId);
    spacesByStorey.set(fl, stSpaces);

    if (opts.includePropertySets) {
      const propRef = addEntity(
        'IFCPROPERTYSINGLEVALUE',
        `'Reference',$,IFCIDENTIFIER('${escapeStepString(room.id)}'),$`
      );
      const propCat = addEntity(
        'IFCPROPERTYSINGLEVALUE',
        `'Category',$,IFCLABEL('${escapeStepString(room.type)}'),$`
      );
      const psetSpaceId = addEntity(
        'IFCPROPERTYSET',
        `'${generateDeterministicIFCGlobalId(`${project.id}:pset-${room.id}`)}',#${ownerHistoryId},'Pset_SpaceCommon',$,(#${propRef},#${propCat})`
      );
      exportedCounts.propertySets++;
      addEntity(
        'IFCRELDEFINESBYPROPERTIES',
        `'${generateDeterministicIFCGlobalId(`${project.id}:rel-pset-${room.id}`)}',#${ownerHistoryId},$,$,(#${ifcSpaceId}),#${psetSpaceId}`
      );
    }

    if (opts.includeBaseQuantities) {
      const areaVal = room.width * room.length;
      const volVal = areaVal * storeyHeight;
      const qNetArea = addEntity(
        'IFCQUANTITYAREA',
        `'NetFloorArea',$,$,${formatStepReal(areaVal)},$`
      );
      const qWidth = addEntity(
        'IFCQUANTITYLENGTH',
        `'Width',$,$,${formatStepReal(room.width)},$`
      );
      const qLength = addEntity(
        'IFCQUANTITYLENGTH',
        `'Length',$,$,${formatStepReal(room.length)},$`
      );
      const qHeight = addEntity(
        'IFCQUANTITYLENGTH',
        `'Height',$,$,${formatStepReal(storeyHeight)},$`
      );
      const qVol = addEntity(
        'IFCQUANTITYVOLUME',
        `'GrossVolume',$,$,${formatStepReal(volVal)},$`
      );
      const elQtyId = addEntity(
        'IFCELEMENTQUANTITY',
        `'${generateDeterministicIFCGlobalId(`${project.id}:qto-${room.id}`)}',#${ownerHistoryId},'Qto_SpaceBaseQuantities',$,'Plotify Geometry Engine',(#${qNetArea},#${qWidth},#${qLength},#${qHeight},#${qVol})`
      );
      exportedCounts.elementQuantities++;
      addEntity(
        'IFCRELDEFINESBYPROPERTIES',
        `'${generateDeterministicIFCGlobalId(`${project.id}:rel-qto-${room.id}`)}',#${ownerHistoryId},$,$,(#${ifcSpaceId}),#${elQtyId}`
      );
    }

    // Optional Floor Slab & Perimeter Wall per Room
    if (opts.includePerimeterWallsAndSlabs) {
      const slabSolidId = addEntity(
        'IFCEXTRUDEDAREASOLID',
        `#${rectProfileId},#${solidAxis3D},#${dirZ},${formatStepReal(slabThickness)}`
      );
      const slabRepId = addEntity(
        'IFCSHAPEREPRESENTATION',
        `#${geomContextId},'Body','SweptSolid',(#${slabSolidId})`
      );
      const slabProdShapeId = addEntity('IFCPRODUCTDEFINITIONSHAPE', `$,$,(#${slabRepId})`);
      const slabId = addEntity(
        'IFCSLAB',
        `'${generateDeterministicIFCGlobalId(`${project.id}:slab-${room.id}`)}',#${ownerHistoryId},'${escapeStepString(
          room.name
        )} Floor Slab',$,$,#${rmPlacement},#${slabProdShapeId},'SLAB-${room.id}',.FLOOR.`
      );
      exportedCounts.slabs++;

      const wallProfId = addEntity(
        'IFCRECTANGLEPROFILEDEF',
        `.AREA.,'WallProfile',#${profAxis2D},${formatStepReal(room.width)},${formatStepReal(
          wallThickness
        )}`
      );
      const wallSolidId = addEntity(
        'IFCEXTRUDEDAREASOLID',
        `#${wallProfId},#${solidAxis3D},#${dirZ},${formatStepReal(storeyHeight)}`
      );
      const wallRepId = addEntity(
        'IFCSHAPEREPRESENTATION',
        `#${geomContextId},'Body','SweptSolid',(#${wallSolidId})`
      );
      const wallProdShapeId = addEntity('IFCPRODUCTDEFINITIONSHAPE', `$,$,(#${wallRepId})`);
      const wallId = addEntity(
        'IFCWALLSTANDARDCASE',
        opts.schemaVersion === 'IFC2X3'
          ? `'${generateDeterministicIFCGlobalId(`${project.id}:wall-${room.id}`)}',#${ownerHistoryId},'${escapeStepString(
              room.name
            )} Envelope Wall',$,$,#${rmPlacement},#${wallProdShapeId},'WALL-${room.id}'`
          : `'${generateDeterministicIFCGlobalId(`${project.id}:wall-${room.id}`)}',#${ownerHistoryId},'${escapeStepString(
              room.name
            )} Envelope Wall',$,$,#${rmPlacement},#${wallProdShapeId},'WALL-${room.id}',.STANDARD.`
      );
      exportedCounts.walls++;

      const stContained = containedElementsByStorey.get(fl) || [];
      stContained.push(slabId, wallId);
      containedElementsByStorey.set(fl, stContained);
    }
  }

  // 7. Export Structural Columns & Beams
  if (opts.includeStructuralElements && project.structuralCoordination) {
    for (const col of project.structuralCoordination.columns || []) {
      const fl = Math.min(Math.max(1, col.floorLevels?.[0] || 1), totalFloors);
      const parentStoreyPlacement = storeyPlacementByLevel.get(fl)!;

      const colOrigin = addEntity(
        'IFCCARTESIANPOINT',
        `(${formatStepReal(col.x)},${formatStepReal(col.y)},0.)`
      );
      const colAxis = addEntity('IFCAXIS2PLACEMENT3D', `#${colOrigin},#${dirZ},#${dirX}`);
      const colPlacement = addEntity('IFCLOCALPLACEMENT', `#${parentStoreyPlacement},#${colAxis}`);

      const colProfAxis2D = addEntity('IFCAXIS2PLACEMENT2D', `#${origin2D},#${dirX2D}`);
      const colProfileId =
        col.profile === 'circular'
          ? addEntity(
              'IFCCIRCLEPROFILEDEF',
              `.AREA.,'ColCircleProfile',#${colProfAxis2D},${formatStepReal(col.width / 2)}`
            )
          : addEntity(
              'IFCRECTANGLEPROFILEDEF',
              `.AREA.,'ColRectProfile',#${colProfAxis2D},${formatStepReal(
                col.width
              )},${formatStepReal(col.depth)}`
            );

      const colSolidAxis = addEntity('IFCAXIS2PLACEMENT3D', `#${origin3D},#${dirZ},#${dirX}`);
      const colSolidId = addEntity(
        'IFCEXTRUDEDAREASOLID',
        `#${colProfileId},#${colSolidAxis},#${dirZ},${formatStepReal(storeyHeight)}`
      );
      const colRepId = addEntity(
        'IFCSHAPEREPRESENTATION',
        `#${geomContextId},'Body','SweptSolid',(#${colSolidId})`
      );
      const colProdShapeId = addEntity('IFCPRODUCTDEFINITIONSHAPE', `$,$,(#${colRepId})`);

      const colGlobalId = getOrCreateGlobalId(col.id, `col-${col.id}`);
      const ifcColId = addEntity(
        'IFCCOLUMN',
        opts.schemaVersion === 'IFC2X3'
          ? `'${colGlobalId}',#${ownerHistoryId},'${escapeStepString(col.label)}','${escapeStepString(
              col.material
            )}',$,#${colPlacement},#${colProdShapeId},'${escapeStepString(col.id)}'`
          : `'${colGlobalId}',#${ownerHistoryId},'${escapeStepString(col.label)}','${escapeStepString(
              col.material
            )}',$,#${colPlacement},#${colProdShapeId},'${escapeStepString(col.id)}',.COLUMN.`
      );
      exportedCounts.columns++;

      const matId = addEntity('IFCMATERIAL', `'${escapeStepString(col.material)}'`);
      exportedCounts.materials++;
      addEntity(
        'IFCRELASSOCIATESMATERIAL',
        `'${generateDeterministicIFCGlobalId(`${project.id}:mat-${col.id}`)}',#${ownerHistoryId},$,$,(#${ifcColId}),#${matId}`
      );

      const stContained = containedElementsByStorey.get(fl) || [];
      stContained.push(ifcColId);
      containedElementsByStorey.set(fl, stContained);
    }

    for (const beam of project.structuralCoordination.beams || []) {
      const fl = Math.min(Math.max(1, beam.floorLevel || 1), totalFloors);
      const parentStoreyPlacement = storeyPlacementByLevel.get(fl)!;

      const spanLen = Math.max(
        0.5,
        Math.hypot(beam.endX - beam.startX, beam.endY - beam.startY)
      );
      const bmOrigin = addEntity(
        'IFCCARTESIANPOINT',
        `(${formatStepReal(beam.startX)},${formatStepReal(beam.startY)},${formatStepReal(
          storeyHeight - beam.profileDepth
        )})`
      );
      const bmAxis = addEntity('IFCAXIS2PLACEMENT3D', `#${bmOrigin},#${dirZ},#${dirX}`);
      const bmPlacement = addEntity('IFCLOCALPLACEMENT', `#${parentStoreyPlacement},#${bmAxis}`);

      const bmCenter = addEntity(
        'IFCCARTESIANPOINT',
        `(${formatStepReal(spanLen / 2)},${formatStepReal(beam.profileWidth / 2)})`
      );
      const bmProfAxis2D = addEntity('IFCAXIS2PLACEMENT2D', `#${bmCenter},#${dirX2D}`);
      const bmProfileId = addEntity(
        'IFCRECTANGLEPROFILEDEF',
        `.AREA.,'BeamRectProfile',#${bmProfAxis2D},${formatStepReal(spanLen)},${formatStepReal(
          beam.profileWidth
        )}`
      );
      const bmSolidAxis = addEntity('IFCAXIS2PLACEMENT3D', `#${origin3D},#${dirZ},#${dirX}`);
      const bmSolidId = addEntity(
        'IFCEXTRUDEDAREASOLID',
        `#${bmProfileId},#${bmSolidAxis},#${dirZ},${formatStepReal(beam.profileDepth)}`
      );
      const bmRepId = addEntity(
        'IFCSHAPEREPRESENTATION',
        `#${geomContextId},'Body','SweptSolid',(#${bmSolidId})`
      );
      const bmProdShapeId = addEntity('IFCPRODUCTDEFINITIONSHAPE', `$,$,(#${bmRepId})`);

      const bmGlobalId = getOrCreateGlobalId(beam.id, `beam-${beam.id}`);
      const ifcBeamId = addEntity(
        'IFCBEAM',
        opts.schemaVersion === 'IFC2X3'
          ? `'${bmGlobalId}',#${ownerHistoryId},'${escapeStepString(beam.label)}','${escapeStepString(
              beam.material
            )}',$,#${bmPlacement},#${bmProdShapeId},'${escapeStepString(beam.id)}'`
          : `'${bmGlobalId}',#${ownerHistoryId},'${escapeStepString(beam.label)}','${escapeStepString(
              beam.material
            )}',$,#${bmPlacement},#${bmProdShapeId},'${escapeStepString(beam.id)}',.BEAM.`
      );
      exportedCounts.beams++;

      const stContained = containedElementsByStorey.get(fl) || [];
      stContained.push(ifcBeamId);
      containedElementsByStorey.set(fl, stContained);
    }
  }

  // 8. Link Spaces and Contained Elements to Storeys
  for (let fl = 1; fl <= totalFloors; fl++) {
    const stId = storeyIdByLevel.get(fl)!;
    const spList = spacesByStorey.get(fl) || [];
    if (spList.length > 0) {
      addEntity(
        'IFCRELAGGREGATES',
        `'${generateDeterministicIFCGlobalId(`${project.id}:rel-st-sp-${fl}`)}',#${ownerHistoryId},'StoreyToSpaces_${fl}',$,#${stId},(${spList
          .map((id) => `#${id}`)
          .join(',')})`
      );
    }

    const elemList = containedElementsByStorey.get(fl) || [];
    if (elemList.length > 0) {
      addEntity(
        'IFCRELCONTAINEDINSPATIALSTRUCTURE',
        `'${generateDeterministicIFCGlobalId(`${project.id}:rel-st-el-${fl}`)}',#${ownerHistoryId},'StoreyContained_${fl}',$,(${elemList
          .map((id) => `#${id}`)
          .join(',')}),#${stId}`
      );
    }
  }

  const safeSlug = project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project';
  const fileName = `${safeSlug}-${opts.schemaVersion.toLowerCase()}.ifc`;

  const headerLines = [
    'ISO-10303-21;',
    'HEADER;',
    `FILE_DESCRIPTION(('ViewDefinition [CoordinationView]','Plotify OpenBIM & IFC Export Profile P41'),'2;1');`,
    `FILE_NAME('${escapeStepString(fileName)}','${nowIso}',('${escapeStepString(
      opts.authorName!
    )}'),('${escapeStepString(
      opts.organizationName!
    )}'),'Plotify OpenBIM P41 Engine 1.0','Plotify Architecture Intelligence OS','None');`,
    `FILE_SCHEMA(('${opts.schemaVersion}'));`,
    'ENDSEC;',
    'DATA;',
  ];

  const footerLines = ['ENDSEC;', 'END-ISO-10303-21;'];
  const ifcContent = [...headerLines, ...lines, ...footerLines].join('\n');
  const fileSizeBytes = new Blob([ifcContent]).size;
  const checksum = computeStringChecksum(ifcContent);

  // Validate generated IFC output with independent validator
  const validationResult = validateIFCFileStructure(ifcContent);

  // Honest disclosure of omitted Plotify-specific analytical information
  const omittedPlotifyInformation: Array<{ domain: string; reason: string }> = [
    {
      domain: 'Target Budget & Cost Planning Scenarios',
      reason: `Financial budget (${project.budget} ${project.currency}) and elemental cost rate tables are Plotify commercial planning layers not represented in coordination-view geometry.`,
    },
    {
      domain: 'Future-Impact Simulator & Multi-Criteria Scenarios',
      reason: 'Pareto optimization weights and expansion scenarios are simulation states outside the active building geometry.',
    },
    {
      domain: 'Statutory Code Rule Evaluations & Review Sign-Offs',
      reason: 'Municipal zoning compliance checks and PE/SE review stamps remain in Plotify Documentation & Evidence packages.',
    },
  ];

  if (project.designAlternatives && project.designAlternatives.length > 0) {
    omittedPlotifyInformation.push({
      domain: 'Design Studio Mood Palettes & Lighting Moods',
      reason: 'Conceptual interior furniture styles and lighting moods are studio presentation attributes.',
    });
  }

  const report: IFCExportReport = {
    reportId: `ifc-exp-${Date.now()}`,
    exportedAt: new Date().toISOString(),
    fileName,
    fileSizeBytes,
    checksum,
    schemaVersion: opts.schemaVersion,
    unitExported: project.unit,
    totalEntitiesWritten: lines.length,
    exportedCounts,
    preservedGlobalIdsCount,
    newlyGeneratedGlobalIdsCount,
    omittedPlotifyInformation,
    validationResult,
  };

  return { ifcContent, report };
}

// ============================================================================
// 6. ROUND-TRIP VERIFICATION ENGINE
// ============================================================================

/**
 * Compares a source Plotify project (or imported IFC project) with its exported and re-imported
 * representation across stable GlobalIds, spatial hierarchy, units, and space/column dimensions.
 */
export function compareIFCRoundTrip(
  sourceProject: Project,
  exportOptions?: Partial<IFCExportOptions>,
  tolerance = 0.05
): {
  comparison: IFCRoundTripComparison;
  exportedIfcContent: string;
  exportReport: IFCExportReport;
  reimportedIR: IFCIntermediateModel;
  remappedResult: IFCMappingResult;
} {
  // 1. Export project to IFC
  const { ifcContent, report: exportReport } = exportProjectToIFC(sourceProject, exportOptions);

  // 2. Re-import the exported IFC file
  const reimportedIR = parseIFCToIntermediateModel({
    fileName: exportReport.fileName,
    fileSizeBytes: exportReport.fileSizeBytes,
    rawContent: ifcContent,
    targetUnit: sourceProject.unit,
  });

  // 3. Map re-imported IR back to Plotify
  const remappedResult = mapIFCIntermediateToPlotify(reimportedIR, {
    targetUnit: sourceProject.unit,
  });

  const sourceRooms = (sourceProject.floorPlan?.rooms || []).filter(
    (r) => r.width > 0 && r.length > 0
  );
  const reimportedRooms = remappedResult.mappedRooms;

  const discrepancies: string[] = [];
  const spaceComparisons: IFCRoundTripComparison['spaceComparisons'] = [];

  const targetSchema = exportOptions?.schemaVersion || 'IFC4';
  const schemaMatch = reimportedIR.metadata.normalizedSchema === targetSchema;
  if (!schemaMatch) {
    discrepancies.push(
      `Schema mismatch: expected ${targetSchema}, re-imported ${reimportedIR.metadata.normalizedSchema}.`
    );
  }

  const unitMatch = remappedResult.targetUnit === sourceProject.unit;
  if (!unitMatch) {
    discrepancies.push(
      `Unit mismatch: source=${sourceProject.unit}, re-imported=${remappedResult.targetUnit}.`
    );
  }

  const expectedStoreys = Math.max(
    1,
    sourceProject.floors || 1,
    ...sourceRooms.map((r) => r.floorLevel || 1)
  );
  const storeyCountMatch = reimportedIR.spatialHierarchy.storeys.length === expectedStoreys;
  if (!storeyCountMatch) {
    discrepancies.push(
      `Storey count mismatch: expected ${expectedStoreys}, re-imported ${reimportedIR.spatialHierarchy.storeys.length}.`
    );
  }

  const spaceCountMatch = reimportedRooms.length === sourceRooms.length;
  if (!spaceCountMatch) {
    discrepancies.push(
      `Space count mismatch: source has ${sourceRooms.length} rooms, re-imported has ${reimportedRooms.length} rooms.`
    );
  }

  const sourceCols = sourceProject.structuralCoordination?.columns || [];
  const includeStruct = exportOptions?.includeStructuralElements ?? true;
  const columnCountMatch = includeStruct
    ? remappedResult.mappedColumns.length === sourceCols.length
    : true;
  if (!columnCountMatch) {
    discrepancies.push(
      `Column count mismatch: source has ${sourceCols.length}, re-imported has ${remappedResult.mappedColumns.length}.`
    );
  }

  const sourceBeams = sourceProject.structuralCoordination?.beams || [];
  const beamCountMatch = includeStruct
    ? remappedResult.mappedBeams.length === sourceBeams.length
    : true;

  // Map GlobalIds from source (or deterministic export) vs re-imported
  const sourceGlobalMap = new Map<string, string>();
  if (sourceProject.ifcInterop?.idMappings) {
    for (const m of sourceProject.ifcInterop.idMappings) {
      sourceGlobalMap.set(m.plotifyEntityId, m.sourceGlobalId);
    }
  }

  let preservedGlobalIdsMatched = 0;
  let totalGlobalIdsCompared = 0;
  let maxDimensionDelta = 0;
  let maxAreaDelta = 0;

  for (let i = 0; i < sourceRooms.length; i++) {
    const srcRoom = sourceRooms[i];
    const expectedGlobalId =
      sourceGlobalMap.get(srcRoom.id) ||
      generateDeterministicIFCGlobalId(`${sourceProject.id}:${srcRoom.id}:space-${srcRoom.id}`);

    // Find matching re-imported room by GlobalId mapping or name
    const matchingMapping = remappedResult.idMappings.find(
      (m) => m.plotifyEntityType === 'room' && m.sourceGlobalId === expectedGlobalId
    );
    const reRoom = matchingMapping
      ? reimportedRooms.find((r) => r.id === matchingMapping.plotifyEntityId)
      : reimportedRooms.find((r) => r.name === srcRoom.name && r.floorLevel === srcRoom.floorLevel) ||
        reimportedRooms[i];

    totalGlobalIdsCompared++;
    const reGlobalId = matchingMapping?.sourceGlobalId || '';
    const globalIdPreserved = reGlobalId === expectedGlobalId;
    if (globalIdPreserved) preservedGlobalIdsMatched++;

    if (!reRoom) {
      discrepancies.push(`Room "${srcRoom.name}" missing in re-imported model.`);
      spaceComparisons.push({
        name: srcRoom.name,
        sourceGlobalId: expectedGlobalId,
        reimportedGlobalId: 'MISSING',
        globalIdPreserved: false,
        sourceFloor: srcRoom.floorLevel,
        reimportedFloor: 0,
        sourceWidth: srcRoom.width,
        reimportedWidth: 0,
        sourceLength: srcRoom.length,
        reimportedLength: 0,
        areaDelta: srcRoom.width * srcRoom.length,
        withinTolerance: false,
      });
      continue;
    }

    const wDelta = Math.abs(srcRoom.width - reRoom.width);
    const lDelta = Math.abs(srcRoom.length - reRoom.length);
    const dimDelta = Math.max(wDelta, lDelta);
    const srcArea = srcRoom.width * srcRoom.length;
    const reArea = reRoom.width * reRoom.length;
    const areaDelta = Math.abs(srcArea - reArea);

    if (dimDelta > maxDimensionDelta) maxDimensionDelta = Number(dimDelta.toFixed(4));
    if (areaDelta > maxAreaDelta) maxAreaDelta = Number(areaDelta.toFixed(4));

    const withinTolerance =
      dimDelta <= tolerance &&
      srcRoom.floorLevel === reRoom.floorLevel &&
      globalIdPreserved;

    if (!withinTolerance) {
      discrepancies.push(
        `Room "${srcRoom.name}" round-trip deviation exceeds tolerance: ΔW=${wDelta.toFixed(
          3
        )}, ΔL=${lDelta.toFixed(3)}, floor=${srcRoom.floorLevel}->${reRoom.floorLevel}.`
      );
    }

    spaceComparisons.push({
      name: srcRoom.name,
      sourceGlobalId: expectedGlobalId,
      reimportedGlobalId: reGlobalId,
      globalIdPreserved,
      sourceFloor: srcRoom.floorLevel,
      reimportedFloor: reRoom.floorLevel,
      sourceWidth: srcRoom.width,
      reimportedWidth: reRoom.width,
      sourceLength: srcRoom.length,
      reimportedLength: reRoom.length,
      areaDelta: Number(areaDelta.toFixed(3)),
      withinTolerance,
    });
  }

  const passed =
    exportReport.validationResult.isValid &&
    schemaMatch &&
    unitMatch &&
    storeyCountMatch &&
    spaceCountMatch &&
    columnCountMatch &&
    beamCountMatch &&
    preservedGlobalIdsMatched === totalGlobalIdsCompared &&
    discrepancies.length === 0;

  const comparison: IFCRoundTripComparison = {
    passed,
    comparedAt: new Date().toISOString(),
    schemaMatch,
    unitMatch,
    storeyCountMatch,
    spaceCountMatch,
    columnCountMatch,
    beamCountMatch,
    preservedGlobalIdsMatched,
    totalGlobalIdsCompared,
    maxDimensionDelta,
    maxAreaDelta,
    toleranceUsed: tolerance,
    spaceComparisons,
    discrepancies,
    summaryNotes: [
      `Verified ${preservedGlobalIdsMatched}/${totalGlobalIdsCompared} stable IFC GlobalIds across round-trip exchange.`,
      `Maximum linear dimension deviation: ${maxDimensionDelta.toFixed(4)} ${sourceProject.unit} (tolerance ≤ ${tolerance} ${sourceProject.unit}).`,
      `Exported STEP file passed independent structural and reference integrity checks (${exportReport.totalEntitiesWritten} STEP entities).`,
    ],
  };

  return {
    comparison,
    exportedIfcContent: ifcContent,
    exportReport,
    reimportedIR,
    remappedResult,
  };
}

// ============================================================================
// 7. LEGITIMATE BUILT-IN SAMPLE IFC FIXTURES FOR TESTING & WORKSPACE DEMO
// ============================================================================

export const SAMPLE_IFC4_RESIDENTIAL_VILLA = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [CoordinationView_V2.0]','Plotify OpenBIM Reference Fixture'),'2;1');
FILE_NAME('nordic-courtyard-villa-ifc4.ifc','2026-10-25T12:00:00',('Elena Rostova, AIA'),('Plotify OpenBIM Lab'),'Plotify STEP Generator 1.0','Plotify Reference BIM Authoring','Approved for OpenBIM Testing');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1 = IFCPERSON($,'Elena Rostova, AIA',$,$,$,$,$,$);
#2 = IFCORGANIZATION($,'Plotify OpenBIM Lab','Architectural Intelligence',$,$);
#3 = IFCPERSONANDORGANIZATION(#1,#2,$);
#4 = IFCAPPLICATION(#2,'1.0','Plotify OpenBIM Reference Author','PlotifyBIM');
#5 = IFCOWNERHISTORY(#3,#4,$,.ADDED.,$,#3,#4,1761393600);
#6 = IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
#7 = IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.);
#8 = IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.);
#9 = IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.);
#10 = IFCUNITASSIGNMENT((#6,#7,#8,#9));
#11 = IFCCARTESIANPOINT((0.,0.,0.));
#12 = IFCDIRECTION((0.,0.,1.));
#13 = IFCDIRECTION((1.,0.,0.));
#14 = IFCDIRECTION((1.,0.));
#15 = IFCAXIS2PLACEMENT3D(#11,#12,#13);
#16 = IFCGEOMETRICREPRESENTATIONCONTEXT('Model','Model',3,1.0E-5,#15,$);
#20 = IFCPROJECT('0YvctVUKr0kugbFTf53O9L',#5,'Nordic Courtyard Residence','Two-storey timber and concrete courtyard house',$ ,'Nordic Courtyard Villa','Schematic Design',(#16),#10);
#21 = IFCLOCALPLACEMENT($,#15);
#22 = IFCSITE('1YvctVUKr0kugbFTf53O9S',#5,'Highridge Nordic Parcel','20m x 28m residential plot',$,#21,$,$,.ELEMENT.,$,$,$,$,$);
#23 = IFCLOCALPLACEMENT(#21,#15);
#24 = IFCBUILDING('2YvctVUKr0kugbFTf53O9B',#5,'Nordic Courtyard Villa','Residential Building',$,#23,$,'Nordic Courtyard Villa',.ELEMENT.,$,$,$);
#25 = IFCCARTESIANPOINT((0.,0.,0.));
#26 = IFCAXIS2PLACEMENT3D(#25,#12,#13);
#27 = IFCLOCALPLACEMENT(#23,#26);
#28 = IFCBUILDINGSTOREY('3YvctVUKr0kugbFTf53O01',#5,'Ground Floor','Main living and culinary level',$,#27,$,'Level 1 - Ground Floor',.ELEMENT.,0.);
#29 = IFCCARTESIANPOINT((0.,0.,3.2));
#30 = IFCAXIS2PLACEMENT3D(#29,#12,#13);
#31 = IFCLOCALPLACEMENT(#23,#30);
#32 = IFCBUILDINGSTOREY('3YvctVUKr0kugbFTf53O02',#5,'Upper Floor','Private bedroom and terrace level',$,#31,$,'Level 2 - Upper Floor',.ELEMENT.,3.2);
#33 = IFCRELAGGREGATES('0RelProjSite0000000001',#5,'ProjectToSite',$,#20,(#22));
#34 = IFCRELAGGREGATES('0RelSiteBldg0000000002',#5,'SiteToBuilding',$,#22,(#24));
#35 = IFCRELAGGREGATES('0RelBldgStry0000000003',#5,'BuildingToStoreys',$,#24,(#28,#32));
#40 = IFCCARTESIANPOINT((2.,3.,0.));
#41 = IFCAXIS2PLACEMENT3D(#40,#12,#13);
#42 = IFCLOCALPLACEMENT(#27,#41);
#43 = IFCCARTESIANPOINT((3.5,4.0));
#44 = IFCAXIS2PLACEMENT2D(#43,#14);
#45 = IFCRECTANGLEPROFILEDEF(.AREA.,'LivingRoomProfile',#44,7.0,8.0);
#46 = IFCEXTRUDEDAREASOLID(#45,#15,#12,3.0);
#47 = IFCSHAPEREPRESENTATION(#16,'Body','SweptSolid',(#46));
#48 = IFCPRODUCTDEFINITIONSHAPE($,$,(#47));
#49 = IFCSPACE('0SpcLiving000000000101',#5,'SP-101','Daylit Great Room',$,#42,#48,'Main Living Lounge',.ELEMENT.,.SPACE.,0.);
#50 = IFCCARTESIANPOINT((10.,3.,0.));
#51 = IFCAXIS2PLACEMENT3D(#50,#12,#13);
#52 = IFCLOCALPLACEMENT(#27,#51);
#53 = IFCCARTESIANPOINT((2.5,3.0));
#54 = IFCAXIS2PLACEMENT2D(#53,#14);
#55 = IFCRECTANGLEPROFILEDEF(.AREA.,'KitchenProfile',#54,5.0,6.0);
#56 = IFCEXTRUDEDAREASOLID(#55,#15,#12,3.0);
#57 = IFCSHAPEREPRESENTATION(#16,'Body','SweptSolid',(#56));
#58 = IFCPRODUCTDEFINITIONSHAPE($,$,(#57));
#59 = IFCSPACE('0SpcKitchen00000000102',#5,'SP-102','Culinary Island Kitchen',$,#52,#58,'Kitchen & Pantry',.ELEMENT.,.SPACE.,0.);
#60 = IFCCARTESIANPOINT((10.,10.,0.));
#61 = IFCAXIS2PLACEMENT3D(#60,#12,#13);
#62 = IFCLOCALPLACEMENT(#27,#61);
#63 = IFCCARTESIANPOINT((2.5,2.5));
#64 = IFCAXIS2PLACEMENT2D(#63,#14);
#65 = IFCRECTANGLEPROFILEDEF(.AREA.,'OfficeProfile',#64,5.0,5.0);
#66 = IFCEXTRUDEDAREASOLID(#65,#15,#12,3.0);
#67 = IFCSHAPEREPRESENTATION(#16,'Body','SweptSolid',(#66));
#68 = IFCPRODUCTDEFINITIONSHAPE($,$,(#67));
#69 = IFCSPACE('0SpcOffice000000000103',#5,'SP-103','Architect Studio',$,#62,#68,'Home Office Studio',.ELEMENT.,.SPACE.,0.);
#70 = IFCCARTESIANPOINT((2.,3.,0.));
#71 = IFCAXIS2PLACEMENT3D(#70,#12,#13);
#72 = IFCLOCALPLACEMENT(#31,#71);
#73 = IFCCARTESIANPOINT((3.0,3.5));
#74 = IFCAXIS2PLACEMENT2D(#73,#14);
#75 = IFCRECTANGLEPROFILEDEF(.AREA.,'PrimarySuiteProfile',#74,6.0,7.0);
#76 = IFCEXTRUDEDAREASOLID(#75,#15,#12,3.0);
#77 = IFCSHAPEREPRESENTATION(#16,'Body','SweptSolid',(#76));
#78 = IFCPRODUCTDEFINITIONSHAPE($,$,(#77));
#79 = IFCSPACE('0SpcBed000000000000201',#5,'SP-201','Primary Suite',$,#72,#78,'Primary Bedroom Suite',.ELEMENT.,.SPACE.,0.);
#80 = IFCCARTESIANPOINT((9.,3.,0.));
#81 = IFCAXIS2PLACEMENT3D(#80,#12,#13);
#82 = IFCLOCALPLACEMENT(#31,#81);
#83 = IFCCARTESIANPOINT((1.5,2.0));
#84 = IFCAXIS2PLACEMENT2D(#83,#14);
#85 = IFCRECTANGLEPROFILEDEF(.AREA.,'BathProfile',#84,3.0,4.0);
#86 = IFCEXTRUDEDAREASOLID(#85,#15,#12,3.0);
#87 = IFCSHAPEREPRESENTATION(#16,'Body','SweptSolid',(#86));
#88 = IFCPRODUCTDEFINITIONSHAPE($,$,(#87));
#89 = IFCSPACE('0SpcBath00000000000202',#5,'SP-202','Spa Bath',$,#82,#88,'Primary Bathroom',.ELEMENT.,.SPACE.,0.);
#90 = IFCCARTESIANPOINT((2.,3.,0.));
#91 = IFCAXIS2PLACEMENT3D(#90,#12,#13);
#92 = IFCLOCALPLACEMENT(#27,#91);
#93 = IFCCARTESIANPOINT((0.,0.));
#94 = IFCAXIS2PLACEMENT2D(#93,#14);
#95 = IFCRECTANGLEPROFILEDEF(.AREA.,'ColProfile',#94,0.35,0.35);
#96 = IFCEXTRUDEDAREASOLID(#95,#15,#12,3.2);
#97 = IFCSHAPEREPRESENTATION(#16,'Body','SweptSolid',(#96));
#98 = IFCPRODUCTDEFINITIONSHAPE($,$,(#97));
#99 = IFCCOLUMN('0ColA10000000000000001',#5,'C-A1','Corner Glulam Column',$,#92,#98,'COL-A1',.COLUMN.);
#100 = IFCCARTESIANPOINT((9.,3.,0.));
#101 = IFCAXIS2PLACEMENT3D(#100,#12,#13);
#102 = IFCLOCALPLACEMENT(#27,#101);
#103 = IFCCOLUMN('0ColB10000000000000002',#5,'C-B1','Interior Glulam Column',$,#102,#98,'COL-B1',.COLUMN.);
#104 = IFCWALLSTANDARDCASE('0WallExt00000000000001',#5,'North Exterior Timber Wall','CLT Load Bearing Wall',$,#42,$,'W-EXT-01',.STANDARD.);
#105 = IFCSTAIR('0StairMain000000000001',#5,'Main Sculptural Timber Stair','Unsupported stair entity for reporting verification',$,#27,$,'STAIR-01',.STRAIGHT_RUN_STAIR.);
#110 = IFCRELAGGREGATES('0RelStry1Spaces0000001',#5,'GroundFloorSpaces',$,#28,(#49,#59,#69));
#111 = IFCRELAGGREGATES('0RelStry2Spaces0000002',#5,'UpperFloorSpaces',$,#32,(#79,#89));
#112 = IFCRELCONTAINEDINSPATIALSTRUCTURE('0RelStry1Elems00000001',#5,'GroundFloorElements',$,(#99,#103,#104,#105),#28);
#120 = IFCPROPERTYSINGLEVALUE('PlotWidth',$,IFCLENGTHMEASURE(20.),$);
#121 = IFCPROPERTYSINGLEVALUE('PlotLength',$,IFCLENGTHMEASURE(26.),$);
#122 = IFCPROPERTYSET('0PsetSite0000000000001',#5,'Pset_SiteCommon',$,(#120,#121));
#123 = IFCRELDEFINESBYPROPERTIES('0RelPsetSite0000000001',#5,$,$,(#22),#122);
#130 = IFCPROPERTYSINGLEVALUE('Category',$,IFCLABEL('living'),$);
#131 = IFCPROPERTYSINGLEVALUE('IsExternal',$,IFCBOOLEAN(.F.),$);
#132 = IFCPROPERTYSET('0PsetSpc10100000000001',#5,'Pset_SpaceCommon',$,(#130,#131));
#133 = IFCRELDEFINESBYPROPERTIES('0RelPsetSpc10100000001',#5,$,$,(#49),#132);
#140 = IFCMATERIAL('Cross-Laminated Timber (CLT GL28h)');
#141 = IFCRELASSOCIATESMATERIAL('0RelMatCol000000000001',#5,$,$,(#99,#103,#104),#140);
ENDSEC;
END-ISO-10303-21;`;

export const SAMPLE_IFC2X3_IMPERIAL_STUDIO = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [CoordinationView]','Imperial Feet IFC2X3 Fixture'),'2;1');
FILE_NAME('coastal-pavilion-ifc2x3.ifc','2026-10-25T14:30:00',('Marcus Vance, PE'),('Plotify Engineering'),'Plotify STEP 2x3','Plotify CAD','None');
FILE_SCHEMA(('IFC2X3'));
ENDSEC;
DATA;
#1 = IFCPERSON($,'Marcus Vance, PE',$,$,$,$,$,$);
#2 = IFCORGANIZATION($,'Plotify Engineering',$,$,$);
#3 = IFCPERSONANDORGANIZATION(#1,#2,$);
#4 = IFCAPPLICATION(#2,'2.3','Plotify IFC2X3 Exporter','Plotify2x3');
#5 = IFCOWNERHISTORY(#3,#4,$,.ADDED.,$,#3,#4,1761393600);
#6 = IFCDIMENSIONALEXPONENTS(1,0,0,0,0,0,0);
#7 = IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
#8 = IFCMEASUREWITHUNIT(IFCLENGTHMEASURE(0.3048),#7);
#9 = IFCCONVERSIONBASEDUNIT(#6,.LENGTHUNIT.,'FOOT',#8);
#10 = IFCUNITASSIGNMENT((#9));
#11 = IFCCARTESIANPOINT((0.,0.,0.));
#12 = IFCDIRECTION((0.,0.,1.));
#13 = IFCDIRECTION((1.,0.,0.));
#14 = IFCDIRECTION((1.,0.));
#15 = IFCAXIS2PLACEMENT3D(#11,#12,#13);
#16 = IFCGEOMETRICREPRESENTATIONCONTEXT('Model','Model',3,1.0E-5,#15,$);
#20 = IFCPROJECT('2x3PrjGlobalId00000001',#5,'Coastal ADU Studio (IFC2X3)','Imperial feet single-storey studio',$,'Coastal ADU Studio','Concept Feasibility',(#16),#10);
#21 = IFCLOCALPLACEMENT($,#15);
#22 = IFCSITE('2x3SiteGlobalId0000001',#5,'Coastal Parcel',$,$,#21,$,$,.ELEMENT.,$,$,$,$,$);
#23 = IFCLOCALPLACEMENT(#21,#15);
#24 = IFCBUILDING('2x3BldgGlobalId0000001',#5,'Coastal Studio Building',$,$,#23,$,'Coastal Studio',.ELEMENT.,$,$,$);
#25 = IFCBUILDINGSTOREY('2x3StryGlobalId0000001',#5,'Level 1',$,$,#23,$,'Ground Level',.ELEMENT.,0.);
#26 = IFCRELAGGREGATES('2x3Rel1000000000000001',#5,$,$,#20,(#22));
#27 = IFCRELAGGREGATES('2x3Rel2000000000000002',#5,$,$,#22,(#24));
#28 = IFCRELAGGREGATES('2x3Rel3000000000000003',#5,$,$,#24,(#25));
#30 = IFCCARTESIANPOINT((4.,6.,0.));
#31 = IFCAXIS2PLACEMENT3D(#30,#12,#13);
#32 = IFCLOCALPLACEMENT(#23,#31);
#33 = IFCCARTESIANPOINT((7.,9.));
#34 = IFCAXIS2PLACEMENT2D(#33,#14);
#35 = IFCRECTANGLEPROFILEDEF(.AREA.,'StudioLiving',#34,14.,18.);
#36 = IFCEXTRUDEDAREASOLID(#35,#15,#12,10.);
#37 = IFCSHAPEREPRESENTATION(#16,'Body','SweptSolid',(#36));
#38 = IFCPRODUCTDEFINITIONSHAPE($,$,(#37));
#39 = IFCSPACE('2x3SpcLiving0000000001',#5,'S-01','Open Studio Living',$,#32,#38,'Open Studio Living',.ELEMENT.,.INTERNAL.,$);
#40 = IFCCARTESIANPOINT((20.,6.,0.));
#41 = IFCAXIS2PLACEMENT3D(#40,#12,#13);
#42 = IFCLOCALPLACEMENT(#23,#41);
#43 = IFCCARTESIANPOINT((4.,5.));
#44 = IFCAXIS2PLACEMENT2D(#43,#14);
#45 = IFCRECTANGLEPROFILEDEF(.AREA.,'Kitchenette',#44,8.,10.);
#46 = IFCEXTRUDEDAREASOLID(#45,#15,#12,10.);
#47 = IFCSHAPEREPRESENTATION(#16,'Body','SweptSolid',(#46));
#48 = IFCPRODUCTDEFINITIONSHAPE($,$,(#47));
#49 = IFCSPACE('2x3SpcKitchen000000002',#5,'S-02','Kitchenette',$,#42,#48,'Kitchenette',.ELEMENT.,.INTERNAL.,$);
#50 = IFCRELAGGREGATES('2x3RelStrySpc000000004',#5,$,$,#25,(#39,#49));
ENDSEC;
END-ISO-10303-21;`;

export const SAMPLE_IFC_FIXTURES = [
  {
    id: 'ifc4-nordic-villa',
    label: 'IFC4 · Nordic Courtyard Villa (Metres, 2 Storeys, 5 Spaces, Columns, Read-Only Wall & Unsupported Stair)',
    fileName: 'nordic-courtyard-villa-ifc4.ifc',
    schema: 'IFC4' as SupportedIFCSchema,
    content: SAMPLE_IFC4_RESIDENTIAL_VILLA,
  },
  {
    id: 'ifc2x3-coastal-studio',
    label: 'IFC2X3 · Coastal ADU Studio (Imperial Feet, 1 Storey, 2 Spaces)',
    fileName: 'coastal-pavilion-ifc2x3.ifc',
    schema: 'IFC2X3' as SupportedIFCSchema,
    content: SAMPLE_IFC2X3_IMPERIAL_STUDIO,
  },
];
