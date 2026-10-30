/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MeasurementUnit, Project, FloorPlanRoom } from './project';
import { StructuralColumn, StructuralBeam } from './structural';

export type SupportedIFCSchema = 'IFC2X3' | 'IFC4';

export type IFCLengthUnitName = 'METRE' | 'MILLIMETRE' | 'CENTIMETRE' | 'FOOT' | 'INCH';

export type IFCGeometryRepresentationType =
  | 'ExtrudedAreaSolid-RectangleProfile'
  | 'ExtrudedAreaSolid-RectilinearPolygon'
  | 'BoundingBox'
  | 'QuantityDerived'
  | 'Unsupported-FacetedBrep'
  | 'Unsupported-TriangulatedFaceSet'
  | 'Unsupported-BooleanClippingResult'
  | 'Unsupported-CurvedProfile'
  | 'Unsupported-Other'
  | 'None';

export type IFCEntityCategory =
  | 'spatial-hierarchy'
  | 'space'
  | 'wall'
  | 'slab'
  | 'column'
  | 'beam'
  | 'opening'
  | 'property-set'
  | 'material'
  | 'unsupported-element';

export type IFCDataPreservationClass =
  | 'imported-and-editable'
  | 'imported-not-editable'
  | 'transformed-or-normalized'
  | 'omitted-unsupported'
  | 'lost-on-export';

export interface IFCImportProfile {
  profileId: string;
  profileName: string;
  profileVersion: string;
  supportedSchemas: SupportedIFCSchema[];
  rejectedSchemas: string[];
  supportedSpatialHierarchy: string[];
  supportedEntityTypes: string[];
  partiallySupportedEntityTypes: Array<{
    entityType: string;
    behavior: string;
  }>;
  unsupportedEntityTypes: string[];
  supportedPropertySets: string[];
  supportedClassifications: string[];
  supportedGeometryRepresentations: string[];
  unsupportedGeometryRepresentations: string[];
  supportedUnits: IFCLengthUnitName[];
  unitConversionRules: Array<{
    sourceUnit: IFCLengthUnitName;
    toMetresFactor: number;
    toFeetFactor: number;
  }>;
  maxFileSizeBytes: number;
  maxEntityCount: number;
  maxPlacementDepth: number;
  knownLimitations: string[];
}

export interface IFCImportRequest {
  fileName: string;
  fileSizeBytes: number;
  rawContent: string;
  targetUnit?: MeasurementUnit;
  maxFileSizeBytes?: number;
  maxEntityCount?: number;
  signal?: AbortSignal;
  requestId?: string;
}

export interface IFCSourceMetadata {
  fileName: string;
  fileSizeBytes: number;
  fileChecksum: string;
  schemaIdentifier: string;
  normalizedSchema: SupportedIFCSchema | 'UNSUPPORTED';
  fileDescription: string;
  implementationLevel: string;
  author: string;
  organization: string;
  preprocessorVersion: string;
  originatingSystem: string;
  authorization: string;
  timeStamp: string;
  applicationName?: string;
  sourceLengthUnit: IFCLengthUnitName;
  sourceLengthToMetresFactor: number;
  sourceAreaUnitLabel: string;
  sourceVolumeUnitLabel: string;
  parsedAt: string;
}

export interface IFCPropertyRecord {
  psetName: string;
  propertyName: string;
  value: string | number | boolean;
  unit?: string;
}

export interface IFCQuantityRecord {
  qtoName: string;
  quantityName: string;
  quantityType: 'area' | 'length' | 'volume' | 'count';
  value: number;
}

export interface IFCExtractedBoundingGeometry {
  representationType: IFCGeometryRepresentationType;
  /** Coordinates in source length units relative to resolved world/building origin */
  x: number;
  y: number;
  z: number;
  width: number;
  length: number;
  height: number;
  rotationDeg: number;
  isAxisAligned: boolean;
  hasValidSolidBounds: boolean;
  rawGeometryNote?: string;
}

export interface IFCEntityRecord {
  stepId: number;
  globalId: string;
  ifcType: string;
  category: IFCEntityCategory;
  name: string;
  description?: string;
  objectType?: string;
  tag?: string;
  longName?: string;
  predefinedType?: string;
  elevation?: number;
  parentStepId?: number;
  parentGlobalId?: string;
  storeyStepId?: number;
  storeyName?: string;
  geometry: IFCExtractedBoundingGeometry;
  properties: IFCPropertyRecord[];
  quantities: IFCQuantityRecord[];
  materials: string[];
  classifications: string[];
  preservationStatus: IFCDataPreservationClass;
  preservationNote: string;
}

export interface IFCSpatialStoreyNode {
  stepId: number;
  globalId: string;
  name: string;
  elevationInSourceUnits: number;
  elevationInTargetUnits: number;
  mappedFloorLevel: number;
  spaceStepIds: number[];
  containedElementStepIds: number[];
}

export interface IFCSpatialHierarchy {
  project?: {
    stepId: number;
    globalId: string;
    name: string;
    longName?: string;
    description?: string;
  };
  site?: {
    stepId: number;
    globalId: string;
    name: string;
    description?: string;
    refLatitude?: number[];
    refLongitude?: number[];
    siteWidthInSourceUnits?: number;
    siteLengthInSourceUnits?: number;
  };
  building?: {
    stepId: number;
    globalId: string;
    name: string;
    description?: string;
  };
  storeys: IFCSpatialStoreyNode[];
}

export interface IFCImportWarning {
  id: string;
  code:
    | 'UNSUPPORTED_ENTITY'
    | 'UNSUPPORTED_GEOMETRY'
    | 'NON_RECTILINEAR_APPROXIMATED'
    | 'MISSING_OPTIONAL_PROPERTY'
    | 'DUPLICATE_ENTITY_ID'
    | 'BROKEN_REFERENCE'
    | 'UNRESOLVED_SPATIAL_PARENT'
    | 'COORDINATE_OFFSET_NORMALIZED'
    | 'UNIT_CONVERTED'
    | 'READ_ONLY_ELEMENT_METADATA'
    | 'STOREY_DEFAULT_ASSIGNED';
  severity: 'warning' | 'info';
  message: string;
  stepId?: number;
  globalId?: string;
  ifcType?: string;
  remedy?: string;
}

export interface IFCImportError {
  id: string;
  code:
    | 'FILE_EMPTY'
    | 'FILE_TOO_LARGE'
    | 'ENTITY_LIMIT_EXCEEDED'
    | 'INVALID_FILE_EXTENSION'
    | 'MALFORMED_STEP_HEADER'
    | 'TRUNCATED_STEP_FILE'
    | 'UNSUPPORTED_SCHEMA'
    | 'NO_SPATIAL_ROOT'
    | 'CIRCULAR_REFERENCE'
    | 'IMPORT_CANCELLED'
    | 'DUPLICATE_IMPORT_IN_PROGRESS'
    | 'INVALID_INTERMEDIATE_MODEL';
  message: string;
  lineOrStepId?: number | string;
  fatal: boolean;
}

export interface IFCIDMappingEntry {
  sourceStepId: number;
  sourceGlobalId: string;
  sourceIfcType: string;
  sourceName: string;
  plotifyEntityId: string;
  plotifyEntityType: 'project' | 'room' | 'column' | 'beam' | 'storey' | 'metadata-only';
  floorLevel?: number;
}

export interface IFCUnitConversionRecord {
  dimensionType: 'length' | 'area' | 'elevation';
  sourceUnit: string;
  targetUnit: MeasurementUnit;
  conversionFactor: number;
  exampleTransformation: string;
}

export interface IFCIntermediateModel {
  formatVersion: 'plotify-ifc-ir-v1';
  createdAt: string;
  isValid: boolean;
  metadata: IFCSourceMetadata;
  spatialHierarchy: IFCSpatialHierarchy;
  entities: IFCEntityRecord[];
  unsupportedEntityCounts: Record<string, number>;
  totalRawStepEntities: number;
  warnings: IFCImportWarning[];
  errors: IFCImportError[];
}

export interface IFCImportReport {
  reportId: string;
  generatedAt: string;
  fileName: string;
  schemaIdentifier: string;
  sourceUnit: IFCLengthUnitName;
  targetUnit: MeasurementUnit;
  totalStepEntitiesEncountered: number;
  supportedArchitecturalEntitiesFound: number;
  entitiesMappedToEditableModel: number;
  entitiesPreservedAsReadOnlyMetadata: number;
  entitiesSkippedOrUnsupported: number;
  unsupportedEntityBreakdown: Record<string, number>;
  mappedSpacesCount: number;
  mappedStoreysCount: number;
  mappedColumnsCount: number;
  mappedBeamsCount: number;
  readOnlyWallsCount: number;
  readOnlySlabsCount: number;
  readOnlyOpeningsCount: number;
  duplicateIdsDetected: number;
  brokenReferencesDetected: number;
  unrepresentableGeometryCount: number;
  coordinateOffsetApplied: {
    offsetX: number;
    offsetY: number;
    unit: MeasurementUnit;
    wasShifted: boolean;
  };
  unitConversions: IFCUnitConversionRecord[];
  preservationBreakdown: {
    importedAndEditable: string[];
    importedNotEditable: string[];
    transformedOrNormalized: string[];
    omittedUnsupported: string[];
  };
  warnings: IFCImportWarning[];
  errors: IFCImportError[];
}

export interface ProjectIFCInteropMetadata {
  version: 'plotify-ifc-meta-v1';
  lastImportedAt?: string;
  lastExportedAt?: string;
  sourceMetadata?: IFCSourceMetadata;
  idMappings: IFCIDMappingEntry[];
  preservedElements: Array<{
    stepId: number;
    globalId: string;
    ifcType: string;
    name: string;
    floorLevel?: number;
    properties: IFCPropertyRecord[];
    quantities: IFCQuantityRecord[];
    materials: string[];
    classifications: string[];
    preservationStatus: IFCDataPreservationClass;
    note: string;
  }>;
  unsupportedEntitySummary: Record<string, number>;
  lastImportReport?: IFCImportReport;
  lastExportReport?: IFCExportReport;
}

export interface IFCMappingResult {
  success: boolean;
  targetUnit: MeasurementUnit;
  mappedProjectSpec: {
    name: string;
    projectType: 'house' | 'apartment' | 'other';
    plotWidth: number;
    plotLength: number;
    floors: number;
    notes: string;
  };
  mappedRooms: FloorPlanRoom[];
  mappedColumns: StructuralColumn[];
  mappedBeams: StructuralBeam[];
  idMappings: IFCIDMappingEntry[];
  interopMetadata: ProjectIFCInteropMetadata;
  report: IFCImportReport;
}

export interface IFCExportOptions {
  schemaVersion: SupportedIFCSchema;
  includePerimeterWallsAndSlabs: boolean;
  includeStructuralElements: boolean;
  includePropertySets: boolean;
  includeBaseQuantities: boolean;
  authorName?: string;
  organizationName?: string;
}

export interface IFCValidationCheckResult {
  isValid: boolean;
  schemaDetected: string;
  headerValid: boolean;
  dataSectionValid: boolean;
  footerValid: boolean;
  totalEntities: number;
  unresolvedReferences: Array<{ sourceStepId: number; missingTargetStepId: number }>;
  duplicateStepIds: number[];
  missingRequiredRoots: string[];
  errors: string[];
  warnings: string[];
}

export interface IFCExportReport {
  reportId: string;
  exportedAt: string;
  fileName: string;
  fileSizeBytes: number;
  checksum: string;
  schemaVersion: SupportedIFCSchema;
  unitExported: MeasurementUnit;
  totalEntitiesWritten: number;
  exportedCounts: {
    projects: number;
    sites: number;
    buildings: number;
    storeys: number;
    spaces: number;
    walls: number;
    slabs: number;
    columns: number;
    beams: number;
    propertySets: number;
    elementQuantities: number;
    materials: number;
  };
  preservedGlobalIdsCount: number;
  newlyGeneratedGlobalIdsCount: number;
  omittedPlotifyInformation: Array<{
    domain: string;
    reason: string;
  }>;
  validationResult: IFCValidationCheckResult;
}

export interface IFCRoundTripComparison {
  passed: boolean;
  comparedAt: string;
  schemaMatch: boolean;
  unitMatch: boolean;
  storeyCountMatch: boolean;
  spaceCountMatch: boolean;
  columnCountMatch: boolean;
  beamCountMatch: boolean;
  preservedGlobalIdsMatched: number;
  totalGlobalIdsCompared: number;
  maxDimensionDelta: number;
  maxAreaDelta: number;
  toleranceUsed: number;
  spaceComparisons: Array<{
    name: string;
    sourceGlobalId: string;
    reimportedGlobalId: string;
    globalIdPreserved: boolean;
    sourceFloor: number;
    reimportedFloor: number;
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
