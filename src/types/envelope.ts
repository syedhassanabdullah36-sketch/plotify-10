/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const ENVELOPE_ASSESSMENT_PROFILE_ID = 'plotify-envelope-performance-p46-v1' as const;

export type EnvelopeStandardMethodId =
  | 'ISO-6946-2017-1D-LAYERED-OPAQUE'
  | 'ISO-10077-1-DECLARED-WINDOW-DOOR'
  | 'ISO-13370-DECLARED-GROUND-FLOOR'
  | 'ISO-13788-2012-SURFACE-GLASER-SCREENING'
  | 'ISO-14683-DECLARED-THERMAL-BRIDGE'
  | 'STEADY-STATE-UA-DELTA-T-SCREENING';

export type EnvelopeElementCategory =
  | 'external-opaque-wall'
  | 'internal-thermal-partition'
  | 'roof-assembly'
  | 'ground-contact-floor'
  | 'exposed-suspended-floor'
  | 'window-glazing'
  | 'exterior-door'
  | 'skylight-roof-glazing'
  | 'curtain-wall';

export type EnvelopeBoundaryCondition =
  | 'exterior-ambient'
  | 'ground-contact'
  | 'unheated-buffer-space'
  | 'ventilated-crawlspace-exterior'
  | 'adjacent-conditioned-space';

export type EnvelopeOrientation =
  | 'North'
  | 'North-East'
  | 'East'
  | 'South-East'
  | 'South'
  | 'South-West'
  | 'West'
  | 'North-West'
  | 'Horizontal-Upward'
  | 'Horizontal-Downward'
  | 'Interior';

export type EnvelopeHeatFlowDirection = 'horizontal' | 'upward' | 'downward';

export type EnvelopeDataProvenance =
  | 'project-defined'
  | 'ifc-imported'
  | 'geometry-inferred-incomplete'
  | 'user-hypothetical'
  | 'illustrative-template';

export type EnvelopeAssessmentStatus =
  | 'assessed'
  | 'partially-assessed'
  | 'incomplete-data'
  | 'unsupported-method'
  | 'invalid-input'
  | 'stale';

export type EnvelopeCavityVentilationState =
  | 'none'
  | 'unventilated'
  | 'slightly-ventilated'
  | 'well-ventilated';

export interface EnvelopeMethodDefinition {
  methodId: EnvelopeStandardMethodId;
  title: string;
  standardReference: string;
  supportedScope: string;
  governingFormulas: string[];
  requiredInputs: string[];
  explicitExclusionsAndLimitations: string[];
}

export interface EnvelopeRegionalScreeningTarget {
  benchmarkId: string;
  name: string;
  regionOrClimateZone: string;
  authorityNote: string;
  isStatutoryComplianceProof: false;
  maxUValueByCategoryWPerM2K: Partial<Record<EnvelopeElementCategory, number>>;
  maxSHGC?: number;
  minTemperatureFactorFRsi?: number;
  maxAirPermeabilityQ50M3PerHM2?: number;
  maxAirChangesN50PerHour?: number;
}

export interface EnvelopeAssessmentProfile {
  profileId: typeof ENVELOPE_ASSESSMENT_PROFILE_ID;
  profileName: string;
  version: string;
  supportedMethods: EnvelopeMethodDefinition[];
  surfaceResistanceDefaultsM2KPerW: {
    horizontal: { Rsi: number; Rse: number };
    upward: { Rsi: number; Rse: number };
    downward: { Rsi: number; Rse: number };
  };
  screeningBenchmarks: EnvelopeRegionalScreeningTarget[];
  statutoryComplianceDisclaimer: string;
  dynamicSimulationDisclaimer: string;
  hygrothermalDisclaimer: string;
}

export interface EnvelopeMaterialCatalogEntry {
  materialId: string;
  name: string;
  category:
    | 'masonry-concrete'
    | 'insulation'
    | 'timber-board'
    | 'cladding-render'
    | 'membrane-vapour-control'
    | 'gypsum-plaster'
    | 'metal'
    | 'air-cavity';
  thermalConductivityWPerMK: number | null;
  fixedThermalResistanceM2KPerW?: number;
  densityKgPerM3: number;
  specificHeatJPerKgK: number;
  /** Water vapour diffusion resistance factor mu (dimensionless) */
  vapourResistanceFactorMu?: number;
  /** Or explicit equivalent air layer thickness sd (m) for membranes */
  explicitSdValueM?: number;
  sourceReference: string;
  provenance: 'authoritative-generic' | 'manufacturer-declared' | 'user-defined';
  linkedP44CarbonFactorId?: string;
}

export interface EnvelopeLayerRecord {
  layerId: string;
  orderIndex: number; // 1 = outermost (exterior) -> N = innermost (interior)
  name: string;
  materialCategory: EnvelopeMaterialCatalogEntry['category'];
  thicknessMm: number;
  thermalConductivityWPerMK: number | null;
  /** Used for air cavities or membranes with declared fixed resistance */
  fixedThermalResistanceM2KPerW?: number | null;
  cavityVentilation?: EnvelopeCavityVentilationState;
  densityKgPerM3?: number | null;
  specificHeatJPerKgK?: number | null;
  /** Water vapour diffusion resistance factor (mu) */
  vapourResistanceFactorMu?: number | null;
  /** Equivalent air layer thickness sd = mu * d (m) or declared membrane sd */
  explicitSdValueM?: number | null;
  hasInhomogeneousFastenersOrStuds?: boolean;
  inhomogeneousNote?: string;
  linkedP44CarbonFactorId?: string;
  sourceNote: string;
}

export interface EnvelopeGlazingSolarProperties {
  uValueBasis: 'whole-window-Uw' | 'centre-of-glass-Ug' | 'unverified-unknown';
  declaredUValueWPerM2K: number | null;
  centreOfGlassUgWPerM2K?: number | null;
  frameUfWPerM2K?: number | null;
  frameFractionPercent?: number | null;
  solarHeatGainCoefficientSHGC: number | null;
  visibleTransmittanceVT: number | null;
  externalShadingFactorFsh: number; // 0.0 (fully shaded) to 1.0 (unshaded)
  shadingDescription?: string;
  glazingCavitiesAndCoating?: string;
  airLeakageRatingNote?: string;
}

export interface EnvelopeGroundFloorProperties {
  groundCalculationMethod:
    | 'declared-effective-u-value'
    | 'iso-13370-slab-on-ground-simplified'
    | 'unmodelled-ground-coupling';
  declaredEffectiveUValueWPerM2K?: number | null;
  slabCharacteristicDimensionBM?: number | null; // B' = Area / (0.5 * Perimeter)
  soilThermalConductivityWPerMK?: number | null; // default e.g. 2.0 W/(m·K) only if user-confirmed
  perimeterWallThicknessM?: number | null;
  slabThermalResistanceM2KPerW?: number | null;
}

export interface EnvelopeLayerCalculationStep {
  layerId: string;
  orderIndex: number;
  layerName: string;
  thicknessM: number;
  conductivityWPerMK: number | null;
  calculatedResistanceM2KPerW: number | null;
  calculatedSdM: number | null;
  includedInThermalSum: boolean;
  exclusionOrWarningNote?: string;
}

export interface EnvelopeThermalCalculationResult {
  assemblyId: string;
  status: EnvelopeAssessmentStatus;
  methodUsed: EnvelopeStandardMethodId | 'UNSUPPORTED';
  heatFlowDirection: EnvelopeHeatFlowDirection;
  RsiM2KPerW: number;
  RseM2KPerW: number;
  layerSteps: EnvelopeLayerCalculationStep[];
  sumLayerResistanceM2KPerW: number | null;
  totalResistanceRTM2KPerW: number | null;
  uValueWPerM2K: number | null;
  totalThicknessMm: number;
  totalArealMassKgPerM2: number | null;
  equivalentVapourThicknessSdTotalM: number | null;
  formulaTrace: string[];
  validationErrors: string[];
  warnings: string[];
}

export interface EnvelopeAssemblyRecord {
  assemblyId: string;
  name: string;
  category: EnvelopeElementCategory;
  boundaryCondition: EnvelopeBoundaryCondition;
  orientation: EnvelopeOrientation;
  heatFlowDirection: EnvelopeHeatFlowDirection;
  provenance: EnvelopeDataProvenance;
  sourceReferenceId?: string;
  sourceDescription: string;
  /** Gross surface area in m2 before subtracting child openings */
  grossAreaM2: number;
  /** Subtracted child window/door area in m2 */
  openingAreaSubtractedM2: number;
  /** Net area in m2 used for thermal weighting (max(0, gross - subtracted)) */
  netAreaM2: number;
  areaDerivationNote: string;
  /** Material layers ordered Outside (1) -> Inside (N) for layered opaque assemblies */
  layers: EnvelopeLayerRecord[];
  /** Present for window-glazing, skylight-roof-glazing, curtain-wall, or glazed exterior-door */
  glazingSolar?: EnvelopeGlazingSolarProperties;
  /** Present for ground-contact-floor */
  groundFloor?: EnvelopeGroundFloorProperties;
  /** Optional explicit declared U-value for doors or imported IFC assemblies */
  declaredUValueOverrideWPerM2K?: number | null;
  includeInThermalEnvelope: boolean;
  notes?: string;
  thermalResult?: EnvelopeThermalCalculationResult;
}

export interface EnvelopeThermalBridgeRecord {
  bridgeId: string;
  name: string;
  junctionType:
    | 'wall-to-roof-eaves-parapet'
    | 'wall-to-ground-slab'
    | 'wall-to-intermediate-floor'
    | 'balcony-cantilever-slab'
    | 'window-door-perimeter-reveal'
    | 'corner-external-internal'
    | 'structural-column-penetration';
  bridgeKind: 'linear-psi' | 'point-chi';
  /** Linear thermal transmittance Psi in W/(m·K) */
  psiValueWPerMK: number | null;
  /** Length L in m */
  lengthM: number;
  /** Point thermal transmittance Chi in W/K */
  chiValueWPerK?: number | null;
  /** Count n of point bridges */
  pointCount?: number;
  provenance:
    | 'iso-14683-default-catalogue'
    | 'certified-thermal-bridge-atlas'
    | '2d-3d-fem-numerical'
    | 'user-scenario-assumption'
    | 'unassigned-incomplete';
  sourceReference: string;
  linkedAssemblyIds: string[];
  /** Explicit flag preventing double counting if already embedded in assembly U-value */
  alreadyIncludedInAssemblyUValue: boolean;
  notes?: string;
}

export interface EnvelopeThermalBridgeSummary {
  assessedBridgesCount: number;
  incompleteBridgesCount: number;
  /** Total linear + point bridge heat transfer coefficient H_tb = sum(psi*L) + sum(chi*n) in W/K */
  totalBridgeHeatTransferCoeffWPerK: number;
  /** Equivalent U-value increment deltaU_tb = H_tb / Total_Net_Envelope_Area in W/(m²·K) */
  equivalentDeltaUWPerM2K: number | null;
  heatingDesignBridgeHeatFlowW: number | null;
  coolingDesignBridgeHeatFlowW: number | null;
  bridgeBreakdown: Array<{
    bridgeId: string;
    name: string;
    junctionType: EnvelopeThermalBridgeRecord['junctionType'];
    hTbWPerK: number | null;
    heatingHeatFlowW: number | null;
    status: 'assessed' | 'excluded-double-count' | 'incomplete';
    formulaTrace: string;
  }>;
}

export interface EnvelopeBoundaryClimateScenario {
  scenarioId: string;
  name: string;
  scenarioType:
    | 'winter-heating-design'
    | 'summer-cooling-design'
    | 'humid-condensation-screening'
    | 'p45-climate-resilience-linked';
  indoorTempC: number;
  outdoorTempC: number;
  indoorRelativeHumidityPercent: number;
  outdoorRelativeHumidityPercent: number;
  /** Design incident solar irradiance (W/m²) by orientation for steady-state solar gain screening */
  solarIrradianceByOrientationWPerM2: Partial<Record<EnvelopeOrientation, number>>;
  windExposureCategory: 'sheltered' | 'moderate' | 'exposed';
  linkedP45ScenarioCode?: string;
  linkedP45SourceId?: string;
  provenanceNote: string;
}

export interface EnvelopeGlaserInterfaceNode {
  interfaceIndex: number;
  label: string; // e.g. "Interior Surface", "After Layer 1 (Gypsum)", ..., "Exterior Surface"
  cumulativeRFromInsideM2KPerW: number;
  cumulativeSdFromInsideM: number;
  temperatureC: number;
  saturationVapourPressurePa: number;
  actualVapourPressurePa: number;
  condensationAtInterface: boolean;
}

export interface EnvelopeMoistureCondensationRecord {
  assemblyId: string;
  assemblyName: string;
  category: EnvelopeElementCategory;
  status:
    | 'assessed-pass'
    | 'surface-mould-risk'
    | 'surface-condensation-risk'
    | 'interstitial-condensation-risk'
    | 'incomplete-inputs';
  interstitialStatus:
    | 'glaser-screened-clear'
    | 'glaser-interstitial-risk-detected'
    | 'unavailable-missing-vapour-data'
    | 'not-applicable-glazing';
  indoorTempC: number;
  outdoorTempC: number;
  indoorRHPercent: number;
  outdoorRHPercent: number;
  uValueWPerM2K: number | null;
  RsiM2KPerW: number;
  /** Interior surface temperature T_si = T_i - U * R_si * (T_i - T_e) */
  interiorSurfaceTempC: number | null;
  /** Indoor air dew-point temperature T_dp (°C) */
  indoorDewPointTempC: number | null;
  /** Surface condensation margin (T_si - T_dp) in °C */
  dewPointMarginC: number | null;
  /** Temperature factor f_Rsi = (T_si - T_e) / (T_i - T_e) */
  temperatureFactorFRsi: number | null;
  /** Critical minimum f_Rsi,min to avoid 80% surface RH mould growth per ISO 13788 */
  criticalMinimumFRsi: number | null;
  surfaceCondensationRisk: boolean;
  surfaceMouldRisk: boolean;
  interstitialCondensationRisk: boolean;
  glaserProfile: EnvelopeGlaserInterfaceNode[];
  formulaTrace: string[];
  limitationsDisclosure: string[];
}

export type EnvelopeAirtightnessProvenance =
  | 'measured-pressurization-test'
  | 'modelled-estimate'
  | 'manufacturer-claim'
  | 'user-scenario-assumption'
  | 'unavailable-untested';

export interface EnvelopeAirBarrierChecklistItem {
  itemId: string;
  junctionName: string;
  status: 'continuous-verified' | 'detailed-not-tested' | 'discontinuous-risk' | 'unassessed';
  notes: string;
}

export interface EnvelopeAirtightnessConfig {
  provenance: EnvelopeAirtightnessProvenance;
  /** Air changes per hour at 50 Pa (h^-1) */
  n50AirChangesPerHour: number | null;
  /** Air permeability at 50 Pa per m2 of envelope area (m³/(h·m²)) */
  q50AirPermeabilityM3PerHM2: number | null;
  /** Heated internal volume V (m³) */
  conditionedVolumeM3: number;
  /** Screening shelter/exposure factor e (typically 0.05 sheltered, 0.07 moderate, 0.10 exposed per ISO 13789 screening) */
  exposureFactorE: number;
  testStandardReference?: string;
  airBarrierContinuityChecklist: EnvelopeAirBarrierChecklistItem[];
  notes: string;
}

export interface EnvelopeAirtightnessEvaluation {
  status: 'assessed' | 'untested-assumption' | 'unavailable';
  provenance: EnvelopeAirtightnessProvenance;
  n50PerHour: number | null;
  q50M3PerHM2: number | null;
  estimatedAmbientInfiltrationAch: number | null;
  /** Screening infiltration heat loss coefficient H_inf = 0.34 * n_amb * V (W/K) */
  infiltrationHeatLossCoeffWPerK: number | null;
  heatingInfiltrationHeatLossW: number | null;
  coolingInfiltrationHeatGainW: number | null;
  discontinuousJunctionsCount: number;
  unassessedJunctionsCount: number;
  benchmarkPass: boolean | null;
  formulaTrace: string[];
  warnings: string[];
}

export interface EnvelopeOrientationGlazingSummary {
  orientation: EnvelopeOrientation;
  grossOpaqueWallAreaM2: number;
  glazingAreaM2: number;
  exteriorDoorAreaM2: number;
  netOpaqueWallAreaM2: number;
  windowToWallRatioPercent: number | null;
  areaWeightedGlazingUWPerM2K: number | null;
  areaWeightedSHGC: number | null;
  incidentSolarIrradianceWPerM2: number | null;
  steadyStateSolarGainW: number | null;
}

export interface EnvelopePerformanceSummary {
  totalGrossEnvelopeAreaM2: number;
  totalSubtractedOpeningAreaM2: number;
  totalNetEnvelopeAreaM2: number;
  opaqueWallNetAreaM2: number;
  roofNetAreaM2: number;
  groundAndExposedFloorAreaM2: number;
  totalGlazingAreaM2: number;
  totalExteriorDoorAreaM2: number;
  overallWindowToWallRatioPercent: number | null;
  /** Area-weighted U-value across all assessed exterior thermal envelope assemblies (without bridges) */
  areaWeightedEnvelopeUWPerM2K: number | null;
  /** Area-weighted U-value including linear/point thermal bridges (U_env + deltaU_tb) */
  effectiveEnvelopeUWithBridgesWPerM2K: number | null;
  areaWeightedOpaqueWallUWPerM2K: number | null;
  areaWeightedRoofUWPerM2K: number | null;
  areaWeightedFloorUWPerM2K: number | null;
  areaWeightedGlazingUWPerM2K: number | null;
  areaWeightedGlazingSHGC: number | null;
  /** Total transmission heat transfer coefficient H_tr = sum(U_i * A_i) + H_tb in W/K */
  transmissionHeatTransferCoeffWPerK: number | null;
  heatingDesignDeltaTK: number;
  coolingDesignDeltaTK: number;
  /** Steady-state conductive heat loss Q_tr,heat = H_tr * deltaT_heat in W */
  heatingDesignConductiveHeatLossW: number | null;
  /** Steady-state conductive heat gain Q_tr,cool = H_tr * deltaT_cool in W */
  coolingDesignConductiveHeatGainW: number | null;
  /** Steady-state solar heat gain through glazing in cooling/solar design condition (W) */
  steadyStateSolarHeatGainW: number | null;
  assessedAssembliesCount: number;
  incompleteOrInvalidAssembliesCount: number;
  orientationBreakdown: EnvelopeOrientationGlazingSummary[];
  /** Heat loss share by assembly category for hotspot ranking */
  categoryHeatLossBreakdown: Array<{
    category: EnvelopeElementCategory;
    netAreaM2: number;
    uaWPerK: number;
    shareOfTransmissionPercent: number;
    heatingHeatLossW: number;
  }>;
}

export interface EnvelopeFindingRecord {
  findingId: string;
  severity: 'high' | 'moderate' | 'low' | 'informational' | 'data-gap';
  category:
    | 'thermal-transmittance'
    | 'window-solar-wwr'
    | 'thermal-bridging'
    | 'condensation-moisture'
    | 'airtightness-infiltration'
    | 'data-completeness';
  title: string;
  affectedElementIds: string[];
  governingInputsAndMetric: string;
  benchmarkComparison: string;
  evidenceStrength: 'high-measured-or-declared' | 'moderate-generic-standard' | 'low-assumed-or-incomplete';
  recommendationSummary: string;
  uncertaintiesAndLimitations: string[];
}

export interface EnvelopeImprovementOption {
  optionId: string;
  title: string;
  targetCategory: EnvelopeElementCategory | 'thermal-bridge' | 'airtightness';
  targetAssemblyIds: string[];
  proposedChangeDescription: string;
  beforeMetricLabel: string;
  projectedAfterMetricLabel: string;
  estimatedTransmissionReductionWPerK: number;
  estimatedHeatingPeakReductionW: number;
  /** Cross-reference to P44 Embodied Carbon impact */
  embodiedCarbonTradeoffStatus: 'p44-linked-evaluated' | 'p44-qualitative-note' | 'p44-not-configured';
  estimatedUpfrontCarbonDeltaKgCO2e: number | null;
  linkedP44FactorId?: string;
  technicalCaveatsAndMoistureCheck: string[];
  selectedForScenario: boolean;
}

export interface EnvelopeStalenessReport {
  isStale: boolean;
  reasons: string[];
  lastSourceFingerprint: string;
  currentSourceFingerprint: string;
}

export interface EnvelopeSourceFingerprint {
  plotWidth: number;
  plotLength: number;
  floors: number;
  unit: string;
  roomsCount: number;
  ifcImportTimestamp: string | null;
  climateScenarioCode: string | null;
  carbonAssessmentUpdatedAt: string | null;
}

export interface EnvelopePerformanceAssessment {
  assessmentId: string;
  assessmentName: string;
  profileId: typeof ENVELOPE_ASSESSMENT_PROFILE_ID;
  createdAt: string;
  updatedAt: string;
  activeBenchmarkId: string;
  activeScenarioId: string;
  coolingScenarioId: string;
  assemblies: EnvelopeAssemblyRecord[];
  thermalBridges: EnvelopeThermalBridgeRecord[];
  airtightness: EnvelopeAirtightnessConfig;
  climateScenarios: EnvelopeBoundaryClimateScenario[];
  customMaterials: EnvelopeMaterialCatalogEntry[];
  summary: EnvelopePerformanceSummary;
  bridgeSummary: EnvelopeThermalBridgeSummary;
  moistureRecords: EnvelopeMoistureCondensationRecord[];
  airtightnessEvaluation: EnvelopeAirtightnessEvaluation;
  findings: EnvelopeFindingRecord[];
  improvementOptions: EnvelopeImprovementOption[];
  extractionWarnings: string[];
  knownLimitations: string[];
  sourceFingerprint: EnvelopeSourceFingerprint;
}

export interface ProjectEnvelopePerformanceMetadata {
  version: '1.0';
  activeAssessment: EnvelopePerformanceAssessment;
  savedScenarios: EnvelopePerformanceAssessment[];
  lastPreApplySnapshotId?: string;
  provenanceNotes: string[];
}
