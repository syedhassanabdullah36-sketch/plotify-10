/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * PLOTIFY — P45 Climate Hazard & Resilience Analyzer
 * Profile Identifier: plotify-climate-hazard-resilience-p45-v1
 *
 * Explicitly separates:
 *  1. Climate hazards (physical events/trends + temporal/scenario/model context)
 *  2. Exposure (site, building, rooms, openings, MEP, structural, access in hazard-prone locations)
 *  3. Vulnerability (sensitivity of elements/materials/elevations to damage or disruption)
 *  4. Consequences (occupant safety, service interruption, envelope/structural damage, habitability)
 *  5. Adaptive capacity (existing or proposed design features that reduce impact)
 *  6. Residual risk (risk remaining after selected resilience measures, never claimed as zero)
 */

export const CLIMATE_ASSESSMENT_PROFILE_ID = 'plotify-climate-hazard-resilience-p45-v1' as const;

export type ClimateScenarioId =
  | 'historical-baseline'
  | 'ssp1-2.6'
  | 'ssp2-4.5'
  | 'ssp3-7.0'
  | 'ssp5-8.5'
  | 'user-custom-scenario';

export type ClimateTimeHorizon =
  | 'historical-1991-2020'
  | 'recent-observed'
  | 'near-term-2021-2040'
  | 'mid-century-2041-2060'
  | 'late-century-2081-2100'
  | 'custom-horizon';

export type ClimateTemporalClass =
  | 'current-recent-observation'
  | 'historical-baseline'
  | 'short-term-forecast'
  | 'future-climate-projection';

export type ClimateSourceVerificationStatus =
  | 'verified-reference-fixture'
  | 'user-imported-evidence'
  | 'live-connector-unavailable'
  | 'stale-cached-record'
  | 'out-of-jurisdiction'
  | 'unverified';

export type ClimateJurisdictionScope =
  | 'global'
  | 'united-states'
  | 'pakistan'
  | 'europe'
  | 'regional-custom';

export interface ClimateDataSourceRecord {
  sourceId: string;
  name: string;
  organization: string;
  datasetIdentifier: string;
  versionOrRelease: string;
  temporalClass: ClimateTemporalClass;
  baselinePeriod: string;
  projectionHorizonsSupported: ClimateTimeHorizon[];
  scenariosSupported: ClimateScenarioId[];
  spatialResolutionKm: number;
  spatialCoverageDescription: string;
  jurisdictionScope: ClimateJurisdictionScope;
  retrievedAt: string;
  validUntil: string;
  isExpired: boolean;
  verificationStatus: ClimateSourceVerificationStatus;
  officialUrl: string;
  limitations: string[];
  licenseOrAttribution: string;
}

export type LocationPreflightStatus =
  | 'valid-geographic-location'
  | 'unverified-geographic-location'
  | 'missing-coordinates'
  | 'invalid-coordinate-range'
  | 'suspected-coordinate-swap'
  | 'local-plot-coordinates-only';

export type CoordinateEvidenceSource =
  | 'site-context-verified'
  | 'terrain-wgs84-reference'
  | 'user-override-confirmed'
  | 'site-context-unverified'
  | 'none';

export interface SiteLocationPreflightResult {
  status: LocationPreflightStatus;
  latitude: number | null;
  longitude: number | null;
  coordinateSource: CoordinateEvidenceSource;
  locationConfidence:
    | 'survey-stamped'
    | 'municipal-cadastral'
    | 'user-observation'
    | 'unverified'
    | 'missing';
  cityRegionText: string;
  countryJurisdiction: string;
  detectedJurisdictionScope: ClimateJurisdictionScope;
  parcelFootprintMeters: {
    widthM: number;
    lengthM: number;
    areaM2: number;
    diagonalSpanKm: number;
  };
  gridCellSpanCheck: {
    finestSourceGridKm: number;
    coarsestSourceGridKm: number;
    spansMultipleGridCells: boolean;
    nearGridCellBoundary: boolean;
    spatialResolutionWarning: string;
  };
  terrainAlignmentCheck: {
    hasTerrainModel: boolean;
    horizontalCRS: string;
    verticalDatum: string;
    hasValidVerticalDatumForFloodComparison: boolean;
    footprintReliefM: number | null;
    minGroundElevationUnderBuildingM: number | null;
    maxGroundElevationUnderBuildingM: number | null;
    maxSlopePercent: number | null;
    terrainWarning: string;
  };
  blockingIssues: string[];
  warnings: string[];
  canRunLocationSpecificScreening: boolean;
}

export type ClimateHazardCategory =
  | 'extreme-heat'
  | 'extreme-precipitation'
  | 'flooding'
  | 'drought-water-stress'
  | 'severe-wind-cyclone'
  | 'wildfire-weather'
  | 'slope-erosion-landslide'
  | 'cold-freeze-thaw-snow';

export type FloodSubType =
  | 'fluvial-riverine'
  | 'pluvial-surface-water'
  | 'coastal-storm-surge'
  | 'official-flood-zone-map';

export type HazardScreeningStatus =
  | 'assessed-verified'
  | 'assessed-indicative'
  | 'insufficient-evidence'
  | 'unassessed'
  | 'not-applicable-confirmed';

export type QualitativeLevel =
  | 'very-low'
  | 'low'
  | 'moderate'
  | 'high'
  | 'very-high'
  | 'insufficient-evidence'
  | 'unassessed';

export interface ClimateUncertaintySpread {
  p10: number;
  p50: number;
  p90: number;
  spreadLabel: string;
}

export interface ClimateHazardIndicatorRecord {
  indicatorId: string;
  hazardCategory: ClimateHazardCategory;
  floodSubType?: FloodSubType;
  indicatorCode: string;
  label: string;
  temporalClass: ClimateTemporalClass;
  scenario: ClimateScenarioId;
  timeHorizon: ClimateTimeHorizon;
  baselinePeriod: string;
  modelOrEnsemble: string;
  historicalBaselineValue: number | string | null;
  projectedOrObservedValue: number | string | null;
  deltaFromBaseline: number | null;
  uncertaintyRange: ClimateUncertaintySpread | null;
  unit: string;
  spatialResolutionKm: number;
  sourceId: string;
  sourceCitation: string;
  thresholdUsed: string;
  notesAndLimitations: string;
}

export interface FloodSubTypeAssessment {
  subType: FloodSubType;
  label: string;
  screeningStatus: HazardScreeningStatus;
  severityLevel: QualitativeLevel;
  summary: string;
  sourceId: string;
  evidenceNote: string;
}

export interface ClimateHazardAssessmentItem {
  hazardCategory: ClimateHazardCategory;
  title: string;
  screeningStatus: HazardScreeningStatus;
  hazardSeverityLevel: QualitativeLevel;
  floodSubTypeBreakdown?: FloodSubTypeAssessment[];
  indicators: ClimateHazardIndicatorRecord[];
  confidenceLevel: 'high' | 'medium' | 'low' | 'none';
  confidenceRationale: string;
  scientificBoundaryNotices: string[];
  missingEvidenceItems: string[];
}

export type ExposedAssetCategory =
  | 'ground-floor-habitable-spaces'
  | 'building-envelope-openings'
  | 'roof-and-drainage'
  | 'structural-framing-foundation'
  | 'mep-critical-equipment'
  | 'site-access-and-egress'
  | 'site-terrain-and-grading'
  | 'water-supply-and-storage';

export interface ProjectElementReference {
  elementId: string;
  elementName: string;
  elementType:
    | 'room'
    | 'column'
    | 'beam'
    | 'mep-component'
    | 'terrain-surface'
    | 'site-access'
    | 'ifc-preserved';
  floorLevel?: number;
  elevationNote?: string;
  sourceModule: string;
}

export interface AssetExposureMapping {
  id: string;
  assetCategory: ExposedAssetCategory;
  title: string;
  hazardCategories: ClimateHazardCategory[];
  exposureLevel: QualitativeLevel;
  linkedProjectElements: ProjectElementReference[];
  spatialBasis: string;
  knownAttributes: Record<string, string | number | boolean>;
  missingAttributes: string[];
}

export interface AssetVulnerabilityRecord {
  id: string;
  assetCategory: ExposedAssetCategory;
  hazardCategory: ClimateHazardCategory;
  vulnerabilityLevel: QualitativeLevel;
  sensitivityDrivers: string[];
  existingAdaptiveCapacityLevel: QualitativeLevel;
  existingAdaptiveFeatures: string[];
  missingVulnerabilityInputs: string[];
}

export type ConsequenceCategory =
  | 'occupant-safety-and-egress'
  | 'service-continuity-power-water-hvac'
  | 'envelope-and-structural-damage'
  | 'repair-downtime-and-habitability'
  | 'site-access-and-drainage';

export interface TransparentRiskFinding {
  findingId: string;
  hazardCategory: ClimateHazardCategory;
  floodSubType?: FloodSubType;
  exposedAssetCategory: ExposedAssetCategory;
  consequenceCategory: ConsequenceCategory;
  title: string;
  scenario: ClimateScenarioId;
  timeHorizon: ClimateTimeHorizon;
  hazardLevel: QualitativeLevel;
  exposureLevel: QualitativeLevel;
  vulnerabilityLevel: QualitativeLevel;
  adaptiveCapacityLevel: QualitativeLevel;
  inherentRiskLevel: QualitativeLevel;
  residualRiskLevel: QualitativeLevel;
  evaluationStatus: 'evaluated' | 'insufficient-evidence' | 'unassessed';
  ruleAndThresholdTrace: {
    ruleId: string;
    ruleExpression: string;
    inputsUsed: Record<string, string | number | boolean | null>;
    sourceIds: string[];
    limitations: string[];
  };
  consequenceDescription: string;
  recommendedMeasureIds: string[];
  requiresSpecialistEngineering: string;
}

export interface ResilienceAdaptationMeasure {
  measureId: string;
  title: string;
  category:
    | 'flood-mitigation'
    | 'passive-heat-envelope'
    | 'stormwater-drainage'
    | 'structural-wind-resilience'
    | 'mep-equipment-protection'
    | 'water-drought-autonomy'
    | 'wildfire-defensible-envelope'
    | 'slope-geotechnical-drainage';
  targetedHazards: ClimateHazardCategory[];
  targetedAssets: ExposedAssetCategory[];
  applicabilityStatus:
    | 'recommended'
    | 'already-present-in-project'
    | 'requires-site-verification'
    | 'not-applicable';
  designActionSummary: string;
  triggeringFindingIds: string[];
  expectedVulnerabilityReduction: {
    fromLevel: QualitativeLevel;
    toLevel: QualitativeLevel;
    resultingResidualRisk: QualitativeLevel;
    qualitativeBenefitSummary: string;
  };
  projectParameterPreview: {
    targetModule:
      | 'design-studio-facade'
      | 'mep-coordination'
      | 'site-context'
      | 'resilience-register-only';
    parameterChangeDescription: string;
    previewDiffSummary: string;
    mutatesGeometryDirectly: boolean;
  };
  embodiedCarbonTradeOff: {
    hasP44Baseline: boolean;
    materialImplicationSummary: string;
    estimatedEmbodiedCarbonDirection:
      | 'increase'
      | 'neutral'
      | 'decrease-via-avoided-replacement'
      | 'requires-p44-evaluation';
    estimatedDeltaKgCO2eRange: { minKgCO2e: number; maxKgCO2e: number } | null;
    p44CrossReferenceNote: string;
  };
  costAndMaintenanceImplication: string;
  residualRiskAfterMeasure: string;
  professionalSignOffRequired: string;
  selectedByUser: boolean;
  appliedAt?: string;
}

export interface QuarantinedClimateRecord {
  rowOrItemIndex: number;
  rawRecord: string;
  rejectionReason: string;
}

export interface ClimateEvidenceImportResult {
  success: boolean;
  format: 'json' | 'csv' | 'invalid';
  importedIndicators: ClimateHazardIndicatorRecord[];
  importedSources: ClimateDataSourceRecord[];
  quarantinedRecords: QuarantinedClimateRecord[];
  warnings: string[];
  errors: string[];
}

export interface ClimateSiteSpecificAttributes {
  finishedFloorElevationAboveGroundM: number | null;
  officialFloodZoneLabel: string | null;
  codeDesignWindSpeedMs: number | null;
  hasBackflowPrevention: boolean | null;
  hasOnSiteRainwaterStorageLiters: number | null;
  hasBackupPowerForCriticalMEP: boolean | null;
  geotechnicalSlopeReportAvailable: boolean;
  externalShadingConfirmed: boolean | null;
  coastalProximityKm: number | null;
  wildfireInterfaceZoneConfirmed: boolean | null;
}

export interface ConfirmedCoordinatesOverride {
  latitude: number;
  longitude: number;
  confirmationNote: string;
  sourceType: 'survey-stamped' | 'municipal-cadastral' | 'user-observation';
}

export interface ClimateResilienceConfig {
  activeScenario: ClimateScenarioId;
  comparisonScenario: ClimateScenarioId;
  activeTimeHorizon: ClimateTimeHorizon;
  jurisdictionOverride: 'auto' | ClimateJurisdictionScope;
  confirmedCoordinatesOverride: ConfirmedCoordinatesOverride | null;
  siteSpecificAttributes: ClimateSiteSpecificAttributes;
  selectedMeasureIds: string[];
  simulateOfflineMode?: boolean;
}

export interface ScenarioComparisonRow {
  hazardCategory: ClimateHazardCategory;
  title: string;
  indicatorCode: string;
  indicatorLabel: string;
  unit: string;
  baselineValue: number | string | null;
  activeScenarioValue: number | string | null;
  comparisonScenarioValue: number | string | null;
  deltaBetweenScenarios: number | null;
  activeUncertainty: ClimateUncertaintySpread | null;
  comparisonUncertainty: ClimateUncertaintySpread | null;
}

export interface ClimateHazardResilienceAssessmentResult {
  assessmentId: string;
  profileId: typeof CLIMATE_ASSESSMENT_PROFILE_ID;
  evaluatedAt: string;
  projectFingerprint: string;
  isStale: boolean;
  staleReasons: string[];
  config: ClimateResilienceConfig;
  locationPreflight: SiteLocationPreflightResult;
  dataSources: ClimateDataSourceRecord[];
  hazards: ClimateHazardAssessmentItem[];
  scenarioComparison: ScenarioComparisonRow[];
  exposureMappings: AssetExposureMapping[];
  vulnerabilities: AssetVulnerabilityRecord[];
  riskFindings: TransparentRiskFinding[];
  adaptationMeasures: ResilienceAdaptationMeasure[];
  summaryCounts: {
    totalHazardsCataloged: number;
    hazardsAssessed: number;
    hazardsInsufficientOrUnassessed: number;
    highOrVeryHighRiskFindings: number;
    moderateRiskFindings: number;
    lowOrVeryLowRiskFindings: number;
    unassessedRiskFindings: number;
    selectedAdaptationMeasures: number;
  };
  scopeAndMethodologyDisclaimers: string[];
}

export interface ClimateAssessmentHistoryEntry {
  assessmentId: string;
  evaluatedAt: string;
  activeScenario: ClimateScenarioId;
  activeTimeHorizon: ClimateTimeHorizon;
  highOrVeryHighRiskFindings: number;
  hazardsAssessed: number;
  selectedMeasuresCount: number;
  summaryNote: string;
}

export interface ProjectClimateResilienceMetadata {
  version: '1.0';
  profileId: typeof CLIMATE_ASSESSMENT_PROFILE_ID;
  config: ClimateResilienceConfig;
  customIndicators: ClimateHazardIndicatorRecord[];
  customSources: ClimateDataSourceRecord[];
  quarantinedImports: QuarantinedClimateRecord[];
  activeAssessment: ClimateHazardResilienceAssessmentResult;
  assessmentHistory: ClimateAssessmentHistoryEntry[];
  lastUpdatedAt: string;
}
