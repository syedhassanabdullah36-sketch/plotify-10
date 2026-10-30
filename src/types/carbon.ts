export type CarbonLifecycleModuleCode =
  | 'A0'
  | 'A1-A3'
  | 'A4'
  | 'A5'
  | 'B1'
  | 'B2-B5'
  | 'B6'
  | 'B7'
  | 'B8'
  | 'C1-C4'
  | 'D';

export type CarbonModuleAssessmentStatus =
  | 'assessed'
  | 'partially-assessed'
  | 'unassessed'
  | 'unavailable'
  | 'not-applicable';

export type CarbonAssessmentScopeClassification =
  | 'Preliminary screening estimate'
  | 'Partially assessed lifecycle'
  | 'Whole-life assessment within a documented scope'
  | 'Not assessable with current data';

export type CarbonFactorSourceHierarchyTier =
  | '1-product-epd'
  | '2-manufacturer-dataset'
  | '3-regional-national-db'
  | '4-authoritative-generic'
  | '5-user-scenario';

export type CarbonFactorVerificationStatus =
  | 'verified-epd'
  | 'authoritative-generic'
  | 'user-imported-unverified'
  | 'scenario-assumption';

export type CarbonDeclaredUnit =
  | 'kg'
  | 'tonne'
  | 'm2'
  | 'm3'
  | 'm'
  | 'item'
  | 'kWh'
  | 'm3-water'
  | 'tonne-km';

export type CarbonGWPMetric = 'GWP-total' | 'GWP-fossil' | 'GWP-biogenic';

export type CarbonElementCategory =
  | 'substructure-foundation'
  | 'superstructure-frame'
  | 'superstructure-upper-floors'
  | 'superstructure-roof'
  | 'external-walls-facade'
  | 'windows-external-doors'
  | 'internal-walls-partitions'
  | 'internal-finishes'
  | 'mep-services'
  | 'external-works-site';

export type CarbonQuantitySourceType =
  | 'model-derived-geometry'
  | 'ifc-preserved-element'
  | 'cost-schedule-derived'
  | 'user-entered'
  | 'default-assumption';

export type CarbonMappingConfidence = 'high' | 'medium' | 'low' | 'unmapped';

export interface CarbonLifecycleModuleDefinition {
  code: CarbonLifecycleModuleCode;
  stageGroup: 'Upfront (A0-A5)' | 'In-Use Embodied (B1-B5)' | 'Operational (B6-B8)' | 'End of Life (C1-C4)' | 'Beyond Boundary (D)';
  title: string;
  description: string;
  includedInUpfrontTotal: boolean;
  includedInEmbodiedTotal: boolean;
  includedInOperationalTotal: boolean;
  includedInWholeLifeACTotal: boolean;
  reportedSeparatelyBeyondBoundary: boolean;
}

export interface CarbonAssessmentProfile {
  profileId: 'plotify-whole-life-carbon-p44-v1';
  profileName: string;
  version: string;
  methodologyReferences: string[];
  defaultReferenceStudyPeriodYears: number;
  supportedModules: CarbonLifecycleModuleDefinition[];
  supportedDeclaredUnits: CarbonDeclaredUnit[];
  unitConversionRules: string[];
  biogenicAccountingPolicy: string;
  moduleDPolicy: string;
  missingDataPolicy: string;
  knownExclusionsAndLimitations: string[];
}

export interface CarbonFactorRecord {
  factorId: string;
  name: string;
  materialOrFuelCategory: string;
  applicableElementCategories: CarbonElementCategory[];
  sourceOrganisation: string;
  sourceReference: string;
  epdRegistrationNumber?: string;
  sourceHierarchyTier: CarbonFactorSourceHierarchyTier;
  verificationStatus: CarbonFactorVerificationStatus;
  region: string;
  publicationYear: number;
  validUntilYear?: number;
  declaredUnit: CarbonDeclaredUnit;
  gwpValueKgCO2ePerUnit: number;
  gwpMetric: CarbonGWPMetric;
  coveredModules: CarbonLifecycleModuleCode[];
  /** Biogenic carbon uptake/storage declared in A1-A3 (negative for uptake if declared, 0 if none) */
  biogenicStorageKgCO2ePerUnit?: number;
  /** Biogenic release at end-of-life C3-C4 so balance is preserved without double counting */
  biogenicEndOfLifeReleaseKgCO2ePerUnit?: number;
  /** Optional C1-C4 end-of-life factor per declared unit if known from the dataset */
  endOfLifeC1C4KgCO2ePerUnit?: number;
  /** Optional Module D net benefit/load per declared unit (reported strictly separately from A-C) */
  moduleDBenefitKgCO2ePerUnit?: number;
  /** Required for converting between m3 and kg/tonne */
  densityKgPerM3?: number;
  /** Default component service life in years for B4 replacement calculations */
  defaultServiceLifeYears?: number;
  /** Default construction site waste rate (%) for A5 material waste calculations */
  defaultWasteRatePercent?: number;
  /** Default transport distance (km) for A4 product transport if not overridden */
  defaultTransportDistanceKm?: number;
  licenseAndAttribution: string;
  exclusionsAndNotes?: string;
  userConfirmedUnverified?: boolean;
}

export interface CarbonFactorQuarantineRecord {
  rowIndex: number;
  rawIdentifier: string;
  reasons: string[];
  rawPayload: Record<string, unknown>;
}

export interface CarbonFactorImportResult {
  sourceFileName: string;
  importedAt: string;
  format: 'csv' | 'json';
  validFactors: CarbonFactorRecord[];
  quarantinedRecords: CarbonFactorQuarantineRecord[];
  warnings: string[];
}

export interface CarbonMaterialInventoryItem {
  itemId: string;
  elementName: string;
  elementCategory: CarbonElementCategory;
  sourceType: CarbonQuantitySourceType;
  sourceReferenceId?: string;
  sourceDescription: string;
  quantity: number;
  quantityUnit: 'kg' | 'tonne' | 'm2' | 'm3' | 'm' | 'item';
  /** Required when converting m2 <-> m3 or m2 <-> kg */
  thicknessM?: number;
  /** Optional explicit density override (kg/m3); falls back to factor.densityKgPerM3 */
  densityOverrideKgPerM3?: number;
  assignedFactorId?: string;
  mappingConfidence: CarbonMappingConfidence;
  /** Component service life in years for B4 replacement cycles */
  serviceLifeYears?: number;
  /** Transport distance in km for A4 */
  transportDistanceKm?: number;
  /** Transport mode factor ID for A4 */
  transportFactorId?: string;
  /** Site waste rate (%) for A5 */
  wasteRatePercent?: number;
  /** Whether to include in C1-C4 end of life */
  includeEndOfLife: boolean;
  /** Whether to include in Module D separate reporting */
  includeModuleD: boolean;
  notes?: string;
}

export interface CarbonInventoryExtractionWarning {
  code: string;
  severity: 'info' | 'warning' | 'error';
  sourceDomain: 'geometry' | 'ifc' | 'cad' | 'terrain' | 'structural' | 'mep' | 'cost';
  message: string;
}

export interface CarbonOperationalEnergyInput {
  enabled: boolean;
  sourceType: 'user-entered' | 'metered-utility' | 'energy-simulation-import' | 'unavailable';
  annualElectricityKwhPerYear?: number;
  electricityGridFactorId?: string;
  annualFuelThermalKwhPerYear?: number;
  fuelFactorId?: string;
  onSiteRenewableExportedKwhPerYear?: number;
  gridDecarbonisationFactorPercentPerYear?: number;
  assumptionsNote?: string;
}

export interface CarbonOperationalWaterInput {
  enabled: boolean;
  sourceType: 'user-entered' | 'metered-utility' | 'unavailable';
  annualPotableWaterM3PerYear?: number;
  waterSupplyAndTreatmentFactorId?: string;
  assumptionsNote?: string;
}

export interface CarbonSiteConstructionInput {
  enableA0PreConstruction: boolean;
  a0PreConstructionKgCO2e?: number;
  a0BasisNote?: string;
  enableA5SiteActivities: boolean;
  a5SiteElectricityKwh?: number;
  a5SiteFuelLitresOrKwh?: number;
  a5DirectSiteProcessKgCO2e?: number;
  enableB1InUseRelease: boolean;
  b1RefrigerantOrMaterialReleaseKgCO2e?: number;
  enableB2B3MaintenanceRepair: boolean;
  b2B3AnnualMaintenanceKgCO2ePerYear?: number;
  enableB8UserActivities: boolean;
  b8AnnualUserActivitiesKgCO2ePerYear?: number;
}

export interface CarbonUnitConversionResult {
  valid: boolean;
  sourceQuantity: number;
  sourceUnit: string;
  targetUnit: CarbonDeclaredUnit;
  convertedQuantity?: number;
  massKg?: number;
  conversionFormula?: string;
  errorReason?: string;
}

export interface CarbonCalculationTrace {
  traceId: string;
  moduleCode: CarbonLifecycleModuleCode;
  itemId?: string;
  elementName: string;
  elementCategory?: CarbonElementCategory;
  quantitySourceType: string;
  rawQuantity: number;
  rawUnit: string;
  convertedQuantity: number;
  declaredUnit: CarbonDeclaredUnit;
  conversionExplanation: string;
  factorId: string;
  factorName: string;
  factorSourceReference: string;
  factorVerificationStatus: CarbonFactorVerificationStatus;
  factorValueKgCO2ePerUnit: number;
  formulaDescription: string;
  emissionsKgCO2e: number;
  biogenicStorageKgCO2e: number;
  biogenicReleaseKgCO2e: number;
  assumptions: string[];
}

export interface CarbonLifecycleModuleResult {
  moduleCode: CarbonLifecycleModuleCode;
  title: string;
  stageGroup: CarbonLifecycleModuleDefinition['stageGroup'];
  status: CarbonModuleAssessmentStatus;
  /** Null when status is 'unassessed' or 'unavailable' so missing data is never silently 0 */
  emissionsKgCO2e: number | null;
  emissionsTCO2e: number | null;
  intensityKgCO2ePerM2Gfa: number | null;
  traceCount: number;
  coverageRatioPercent: number;
  statusExplanation: string;
}

export interface CarbonBiogenicSummary {
  biogenicAccountingMethod: 'en15978-balanced-a1a3-c3c4' | 'fossil-only-biogenic-excluded';
  totalBiogenicStorageA1A3KgCO2e: number;
  totalBiogenicReleaseC3C4KgCO2e: number;
  netBiogenicBalanceAtoCKgCO2e: number;
  biogenicItemsCount: number;
  policyNote: string;
}

export interface CarbonModuleDSummary {
  status: CarbonModuleAssessmentStatus;
  netModuleDBenefitOrLoadKgCO2e: number | null;
  netModuleDBenefitOrLoadTCO2e: number | null;
  exportedRenewableEnergyBenefitKgCO2e: number;
  materialRecyclingReuseBenefitKgCO2e: number;
  separationGuaranteeNote: string;
}

export interface CarbonHotspotRecord {
  rank: number;
  categoryOrItemId: string;
  label: string;
  kind: 'element-category' | 'inventory-item' | 'lifecycle-module';
  emissionsKgCO2e: number;
  shareOfAssessedWholeLifePercent: number;
  primaryFactorName?: string;
}

export interface CarbonReductionOpportunity {
  opportunityId: string;
  title: string;
  targetItemId?: string;
  targetElementName: string;
  elementCategory: CarbonElementCategory;
  currentFactorId: string;
  currentFactorName: string;
  proposedFactorId: string;
  proposedFactorName: string;
  affectedModules: CarbonLifecycleModuleCode[];
  baselineEmissionsKgCO2e: number;
  proposedEmissionsKgCO2e: number;
  estimatedSavingKgCO2e: number;
  estimatedSavingPercentOfItem: number;
  estimatedSavingPercentOfWholeLife: number;
  confidenceLevel: 'high' | 'medium' | 'low';
  technicalTradeoffsAndCaveats: string[];
  explanationFormula: string;
}

export interface CarbonValidationIssue {
  issueId: string;
  severity: 'error' | 'warning' | 'info';
  code:
    | 'UNMAPPED_INVENTORY_ITEM'
    | 'UNIT_CONVERSION_ERROR'
    | 'UNVERIFIED_USER_FACTOR'
    | 'MISSING_OPERATIONAL_ENERGY_B6'
    | 'MISSING_OPERATIONAL_WATER_B7'
    | 'MISSING_GFA_REFERENCE'
    | 'SERVICE_LIFE_EXCEEDS_STUDY_PERIOD'
    | 'ZERO_OR_NEGATIVE_QUANTITY'
    | 'CAD_2D_VOLUME_NOT_INFERRED'
    | 'TERRAIN_EXCAVATION_NOT_INFERRED'
    | 'IFC_DUPLICATE_PREVENTED'
    | 'BIOGENIC_BALANCE_CHECK';
  moduleCode?: CarbonLifecycleModuleCode;
  itemId?: string;
  message: string;
  remediationHint: string;
}

export interface CarbonDataQualitySummary {
  totalInventoryItems: number;
  mappedInventoryItems: number;
  unmappedInventoryItems: number;
  invalidConversionItems: number;
  inventoryCompletenessPercent: number;
  emissionsShareByFactorVerification: {
    verifiedEpdPercent: number;
    authoritativeGenericPercent: number;
    userImportedUnverifiedPercent: number;
    scenarioAssumptionPercent: number;
  };
  emissionsShareByQuantitySource: {
    modelDerivedPercent: number;
    ifcPreservedPercent: number;
    costScheduleDerivedPercent: number;
    userEnteredPercent: number;
    defaultAssumptionPercent: number;
  };
  assessedModules: CarbonLifecycleModuleCode[];
  unassessedOrUnavailableModules: CarbonLifecycleModuleCode[];
  overallUncertaintyRating: 'low' | 'moderate' | 'high';
  qualityNarrative: string;
}

export interface WholeLifeCarbonAssessment {
  assessmentId: string;
  assessmentName: string;
  profileId: 'plotify-whole-life-carbon-p44-v1';
  createdAt: string;
  updatedAt: string;
  referenceStudyPeriodYears: number;
  grossInternalFloorAreaM2: number;
  treatedFloorAreaM2: number;
  occupantsCount?: number;
  scopeClassification: CarbonAssessmentScopeClassification;
  scopeClassificationReason: string;
  inventory: CarbonMaterialInventoryItem[];
  customFactors: CarbonFactorRecord[];
  operationalEnergy: CarbonOperationalEnergyInput;
  operationalWater: CarbonOperationalWaterInput;
  siteAndInUseInputs: CarbonSiteConstructionInput;
  includeBiogenicInTotals: boolean;
  moduleResults: CarbonLifecycleModuleResult[];
  totals: {
    /** A0 + A1-A3 + A4 + A5 */
    upfrontCarbonA0toA5KgCO2e: number;
    upfrontCarbonA0toA5TCO2e: number;
    upfrontIntensityKgCO2ePerM2Gfa: number | null;
    /** A0-A5 + B1-B5 + C1-C4 (all assessed embodied modules) */
    embodiedCarbonAtoCKgCO2e: number;
    embodiedCarbonAtoCTCO2e: number;
    embodiedIntensityKgCO2ePerM2Gfa: number | null;
    /** B6 + B7 + B8 over the Reference Study Period (null if all operational modules are unavailable/unassessed) */
    operationalCarbonB6toB8KgCO2e: number | null;
    operationalCarbonB6toB8TCO2e: number | null;
    operationalIntensityKgCO2ePerM2GfaPerYear: number | null;
    /** A0-C4 total across assessed modules (Module D strictly excluded) */
    wholeLifeCarbonAtoCKgCO2e: number;
    wholeLifeCarbonAtoCTCO2e: number;
    wholeLifeIntensityKgCO2ePerM2Gfa: number | null;
    wholeLifePerOccupantKgCO2e: number | null;
  };
  biogenicSummary: CarbonBiogenicSummary;
  moduleDSummary: CarbonModuleDSummary;
  calculationTraces: CarbonCalculationTrace[];
  hotspotsByCategory: CarbonHotspotRecord[];
  hotspotsByItem: CarbonHotspotRecord[];
  reductionOpportunities: CarbonReductionOpportunity[];
  validationIssues: CarbonValidationIssue[];
  extractionWarnings: CarbonInventoryExtractionWarning[];
  dataQuality: CarbonDataQualitySummary;
}

export interface ProjectCarbonAssessmentMetadata {
  version: '1.0';
  activeAssessment: WholeLifeCarbonAssessment;
  savedScenarios: WholeLifeCarbonAssessment[];
  factorImportHistory: CarbonFactorImportResult[];
  lastPreApplySnapshotId?: string;
  provenanceNotes: string[];
}
