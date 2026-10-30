/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * P47 — Construction Site Logistics Planner
 * Evidence-Based Site Access, Traffic & Pedestrian Routing, Material Staging,
 * Delivery Scheduling, Equipment & Lifting Safety Gates, Phasing, and Risk Analysis.
 */

import { MeasurementUnit, RoadFacingSide } from './project';

export const SITE_LOGISTICS_PROFILE_ID = 'plotify-site-logistics-p47-v1' as const;

export type LogisticsPhaseStageId =
  | 'enabling_excavation'
  | 'substructure_foundation'
  | 'superstructure_frame'
  | 'envelope_weatherproofing'
  | 'interior_mep_fitout'
  | 'external_works_commissioning'
  | 'custom';

export type LogisticsProvenanceSource =
  | 'project_site_context'
  | 'ifc_imported_element'
  | 'cad_imported_layer'
  | 'terrain_survey_model'
  | 'user_declared_plan'
  | 'unverified_assumption';

export type LogisticsApprovalStatus =
  | 'verified_approved'
  | 'declared_pending_verification'
  | 'missing_evidence_blocker'
  | 'not_applicable';

export interface SitePoint2D {
  x: number; // in metres from top-left (0,0) of plot
  y: number; // in metres from top-left (0,0) of plot
}

export interface SiteBoundingBox2D {
  x: number; // in metres from top-left (0,0)
  y: number; // in metres from top-left (0,0)
  widthM: number;
  lengthM: number;
  rotationDeg?: number;
}

export interface SiteLogisticsPhase {
  id: string;
  stageType: LogisticsPhaseStageId;
  name: string;
  sequenceOrder: number;
  startDateIso: string; // e.g. '2026-06-01'
  endDateIso: string;   // e.g. '2026-07-15'
  durationDays: number;
  activeBuildingFootprintRatio: number; // 0..1 (e.g. 0.4 during initial excavation, 1.0 during superstructure)
  workingHoursStart: string; // '07:30'
  workingHoursEnd: string;   // '18:00'
  saturdayAllowed: boolean;
  sundayOrHolidayAllowed: boolean;
  notes: string;
}

export type AccessDirectionMode = 'entry_only' | 'exit_only' | 'two_way_controlled' | 'emergency_dedicated';

export type AccessSurfaceCondition =
  | 'paved_heavy_duty'
  | 'compacted_hardcore'
  | 'temporary_trackway_mats'
  | 'unprepared_ground'
  | 'unknown_unverified';

export interface SiteAccessPointRecord {
  id: string;
  name: string;
  boundarySide: RoadFacingSide;
  offsetAlongSideM: number; // distance from top/left corner along boundary side in metres
  clearWidthM: number;
  clearHeightM: number | null; // null if unlimited / open sky, or overhead restriction height
  directionMode: AccessDirectionMode;
  permittedVehicleTypes: VehicleCategory[];
  maxVehicleLengthM: number | null;
  maxGrossVehicleWeightTonnes: number | null;
  surfaceCondition: AccessSurfaceCondition;
  visibilitySplayConfirmed: boolean;
  highwayAuthorityPermitStatus: LogisticsApprovalStatus;
  activePhaseIds: string[];
  provenance: LogisticsProvenanceSource;
  notes: string;
}

export type VehicleCategory =
  | 'light_van_utility'
  | 'rigid_flatbed_10m'
  | 'concrete_mixer_9m'
  | 'articulated_hgv_16_5m'
  | 'mobile_crane_carrier'
  | 'low_loader_plant'
  | 'fire_appliance_emergency';

export type SweptPathVerificationMethod =
  | 'geometric_corridor_and_radius_screening'
  | 'certified_external_swept_path_simulation'
  | 'not_verified';

export interface VehicleRouteRecord {
  id: string;
  name: string;
  entryAccessPointId: string;
  exitAccessPointId: string;
  waypoints: SitePoint2D[]; // centerline polyline in metres
  corridorWidthM: number;
  minVerticalClearanceM: number | null;
  designVehicleCategory: VehicleCategory;
  requiredMinCorridorWidthM: number;
  requiredMinInnerTurningRadiusM: number;
  declaredMinCurveRadiusM: number | null;
  oneWayOperation: boolean;
  requiresReversingManoeuvre: boolean;
  trainedBanksmanMarshallingConfirmed: boolean;
  wheelWashProvidedAtExit: boolean;
  maxSpeedLimitKmh: number;
  surfaceCondition: AccessSurfaceCondition;
  maxRouteGradientPct: number | null; // derived from P43 terrain if available or user-declared
  sweptPathMethod: SweptPathVerificationMethod;
  activePhaseIds: string[];
  provenance: LogisticsProvenanceSource;
  notes: string;
}

export type PedestrianBarrierType =
  | 'physical_jersey_or_water_filled_barrier'
  | 'fixed_handrail_fencing'
  | 'painted_line_only_insufficient'
  | 'unsegregated_shared_hazard';

export interface PedestrianRouteRecord {
  id: string;
  name: string;
  waypoints: SitePoint2D[]; // centerline polyline in metres
  clearWidthM: number;
  barrierType: PedestrianBarrierType;
  weatherProtectedCovered: boolean;
  lightingProvided: boolean;
  stepFreeAccessible: boolean;
  controlledCrossingPoints: SitePoint2D[]; // explicit controlled crossing locations
  connectsAccessToWelfare: boolean;
  activePhaseIds: string[];
  provenance: LogisticsProvenanceSource;
  notes: string;
}

export type LogisticsZoneCategory =
  | 'material_storage'
  | 'laydown_staging'
  | 'loading_unloading_bay'
  | 'prefab_envelope_assembly'
  | 'waste_skip_recycling'
  | 'hazardous_coshh_store'
  | 'spoil_topsoil_stockpile';

export type MaterialHandlingSensitivity =
  | 'weatherproof_covered_required'
  | 'fragile_glazing_vertical_stillage'
  | 'flammable_segregated_coshh'
  | 'heavy_structural_level_cribbing'
  | 'bulk_aggregate_contained'
  | 'general_outdoor_palletized';

export interface SiteLogisticsZoneRecord {
  id: string;
  name: string;
  category: LogisticsZoneCategory;
  bounds: SiteBoundingBox2D;
  usableCapacityM2: number;
  maxStackHeightM: number;
  groundBearingRequirementKPa: number | null;
  verifiedGroundBearingCapacityKPa: number | null; // null if no geotechnical evidence
  groundBearingStatus: LogisticsApprovalStatus;
  handlingSensitivity: MaterialHandlingSensitivity;
  weatherProtectionProvided: boolean;
  containmentBundProvided: boolean;
  linkedEnvelopeAssemblyIds?: string[]; // P46 linkage
  activePhaseIds: string[];
  provenance: LogisticsProvenanceSource;
  notes: string;
}

export type EquipmentCategory =
  | 'tower_crane_luffing_or_hammerhead'
  | 'mobile_telescopic_crane'
  | 'concrete_boom_pump'
  | 'passenger_goods_hoist'
  | 'telehandler_reach_zone'
  | 'mewp_access_platform'
  | 'excavator_piling_rig';

export interface ConstructionEquipmentPlacement {
  id: string;
  name: string;
  category: EquipmentCategory;
  baseBounds: SiteBoundingBox2D; // physical base/outrigger mat footprint in metres
  outriggerSpreadWidthM: number;
  outriggerSpreadLengthM: number;
  operatingRadiusM: number; // slewing / reach radius from center of baseBounds
  tailSwingRadiusM: number;
  maxHeightM: number;
  requiredGroundBearingKPa: number | null;
  verifiedGroundBearingKPa: number | null;
  groundBearingApprovalStatus: LogisticsApprovalStatus;
  certifiedLiftPlanApprovalStatus: LogisticsApprovalStatus;
  undergroundServiceClearanceStatus: LogisticsApprovalStatus;
  oversailsOutsideSiteBoundaryPermitted: boolean;
  oversailLicenseApproved: boolean;
  exclusionZoneRadiusM: number;
  activePhaseIds: string[];
  provenance: LogisticsProvenanceSource;
  notes: string;
}

export interface LiftingOperationPlan {
  id: string;
  name: string;
  equipmentId: string;
  phaseId: string;
  pickupZoneId: string; // references a SiteLogisticsZoneRecord (e.g., unloading bay or laydown)
  targetDropCoordinate: SitePoint2D; // point on building or assembly zone
  loadDescription: string;
  grossLoadWeightTonnes: number;
  requiredLiftRadiusM: number; // computed Euclidean distance from crane center to max(pickup, drop)
  declaredRatedCapacityAtRadiusTonnes: number | null; // requires manufacturer load chart input
  windSpeedOperationalLimitMs: number;
  appointedPersonSignOffStatus: LogisticsApprovalStatus;
  notes: string;
}

export type TemporaryFacilityCategory =
  | 'site_office_management'
  | 'worker_welfare_canteen_drying'
  | 'sanitary_wc_washroom'
  | 'first_aid_medical_station'
  | 'security_gatehouse_turnstile'
  | 'induction_training_cabin';

export interface TemporaryFacilityRecord {
  id: string;
  name: string;
  category: TemporaryFacilityCategory;
  bounds: SiteBoundingBox2D;
  storeys: number;
  maxOccupancyPersons: number;
  requiresPowerConnection: boolean;
  requiresPotableWater: boolean;
  requiresFoulDrainage: boolean;
  fireAssemblyPointNearby: boolean;
  activePhaseIds: string[];
  provenance: LogisticsProvenanceSource;
  notes: string;
}

export type UtilityServiceType =
  | 'temporary_electrical_supply_3phase'
  | 'potable_water_supply'
  | 'foul_drainage_sewer_or_tank'
  | 'surface_water_silt_settlement'
  | 'site_lighting_perimeter'
  | 'telecom_data_connectivity'
  | 'existing_buried_gas_or_power_hazard'
  | 'existing_overhead_power_line';

export interface TemporaryUtilityRequirement {
  id: string;
  name: string;
  serviceType: UtilityServiceType;
  isExistingHazardToProtect: boolean;
  locationOrCorridor: SitePoint2D[]; // point or polyline in metres
  safetyClearanceBufferM: number;
  capacityDescription: string;
  connectionConfirmedStatus: LogisticsApprovalStatus;
  permitOrUtilitySurveyStatus: LogisticsApprovalStatus;
  activePhaseIds: string[];
  provenance: LogisticsProvenanceSource;
  notes: string;
}

export interface EmergencyAccessRequirement {
  id: string;
  name: string;
  routeType: 'fire_appliance_access' | 'ambulance_stretcher_route' | 'worker_evacuation_corridor' | 'muster_assembly_point';
  waypoints: SitePoint2D[];
  minClearWidthM: number;
  minClearHeightM: number;
  mustRemainUnobstructedAllPhases: boolean;
  activePhaseIds: string[];
  notes: string;
}

export type SiteRestrictionCategory =
  | 'tree_root_protection_zone'
  | 'easement_wayleave_no_build'
  | 'neighbor_noise_dust_sensitive_buffer'
  | 'heritage_or_party_wall_standoff'
  | 'excavation_batter_exclusion_zone'
  | 'flood_or_overland_flow_channel'
  | 'cad_imported_boundary_constraint';

export interface SiteRestrictionRecord {
  id: string;
  name: string;
  category: SiteRestrictionCategory;
  bounds: SiteBoundingBox2D;
  prohibitsStorageAndStaging: boolean;
  prohibitsHeavyPlantAndCranes: boolean;
  prohibitsVehicleTraffic: boolean;
  activePhaseIds: string[];
  provenance: LogisticsProvenanceSource;
  sourceEntityId?: string; // e.g., siteContext obstacle ID, CAD entity handle, IFC GlobalId
  notes: string;
}

export type DeliveryMaterialType =
  | 'ready_mix_concrete'
  | 'structural_steel_or_timber_frame'
  | 'rebar_and_formwork'
  | 'curtain_wall_and_glazing_packs'
  | 'insulation_and_envelope_cladding'
  | 'mep_plant_and_ductwork'
  | 'internal_fitout_drywall_joinery'
  | 'excavation_spoil_muck_away';

export interface DeliveryRequirementRecord {
  id: string;
  title: string;
  materialType: DeliveryMaterialType;
  phaseId: string;
  scheduledDateIso: string; // e.g. '2026-06-15'
  arrivalWindowStart: string; // '08:30'
  arrivalWindowEnd: string;   // '10:00'
  dwellDurationMinutes: number;
  vehicleCategory: VehicleCategory;
  vehicleCountInWindow: number;
  grossPayloadTonnes: number;
  requiredStorageAreaM2: number;
  targetAccessPointId: string;
  targetVehicleRouteId: string;
  targetUnloadingZoneId: string;
  targetStorageZoneId: string | null; // null if direct jit lift from truck to structure
  requiresCraneLiftId: string | null; // references ConstructionEquipmentPlacement.id
  oneWayTransportDistanceKm: number | null; // for optional P44 Module A4 alignment if factor provided
  transportEmissionFactorKgCO2ePerTonneKm: number | null; // null unless explicitly declared
  justInTimeDelivery: boolean;
  holdingAreaFallbackConfirmed: boolean;
  notes: string;
}

export type ConflictSeverity = 'blocker' | 'conflict' | 'warning' | 'info';

export type ConflictCategory =
  | 'boundary_or_setback_violation'
  | 'access_gate_or_permit_constraint'
  | 'vehicle_route_geometry_or_clearance'
  | 'pedestrian_vehicle_segregation_hazard'
  | 'storage_overlap_or_capacity_exceeded'
  | 'delivery_schedule_or_bay_congestion'
  | 'crane_reach_load_or_oversail_conflict'
  | 'missing_engineering_or_geotech_evidence'
  | 'utility_strike_or_clearance_hazard'
  | 'emergency_egress_or_fire_route_obstruction'
  | 'phase_transition_or_footprint_clash'
  | 'environmental_or_terrain_slope_hazard';

export interface LogisticsConflictRecord {
  id: string;
  category: ConflictCategory;
  severity: ConflictSeverity;
  phaseId: string | 'all_phases';
  title: string;
  description: string;
  affectedElementIds: string[];
  spatialLocation?: SitePoint2D;
  measuredValue?: string;
  requiredThreshold?: string;
  evidenceStatus: LogisticsApprovalStatus;
  remediationGuidance: string;
  requiresCompetentProfessionalSignOff: string;
}

export interface LogisticsRiskFinding {
  id: string;
  domain: 'traffic_pedestrian' | 'lifting_plant' | 'ground_utilities' | 'delivery_staging' | 'emergency_welfare' | 'neighbor_environmental';
  severity: ConflictSeverity;
  headline: string;
  rationale: string;
  mitigationAction: string;
  verificationGateRequired: string;
}

export interface RouteDistanceTravelAnalysis {
  routeId: string;
  routeName: string;
  phaseId: string;
  straightLineEntryToExitM: number;
  actualNetworkPathLengthM: number;
  tortuosityFactor: number; // actual / straightLine
  assumedAverageSpeedKmh: number;
  estimatedTransitMinutesOneWay: number;
  includesReversingPenaltyMinutes: number;
  maxSegmentTurnAngleDeg: number;
  impliedMinCurveRadiusM: number | null;
}

export interface PhaseSpaceUtilizationSummary {
  phaseId: string;
  phaseName: string;
  totalSiteAreaM2: number;
  activeBuildingFootprintM2: number;
  restrictedNoGoAreaM2: number;
  netAvailableExteriorSiteAreaM2: number;
  allocatedStorageAndLaydownM2: number;
  allocatedEquipmentAndFacilitiesM2: number;
  totalAllocatedLogisticsFootprintM2: number;
  exteriorSiteUtilizationPct: number; // totalAllocated / netAvailableExteriorSiteArea * 100
  requiredPeakDeliveryStorageM2: number;
  storageCapacityCoverageRatio: number | null; // allocatedStorage / requiredPeakDeliveryStorage
  activeConflictCount: number;
  activeBlockerCount: number;
}

export interface TransportCarbonCompatibilitySummary {
  status: 'computed_with_explicit_factors' | 'partial_missing_factors' | 'not_computed_missing_inputs';
  totalScheduledDeliveries: number;
  deliveriesWithCompleteA4Data: number;
  totalScheduledPayloadTonnes: number;
  totalTonneKilometres: number;
  estimatedModuleA4TransportKgCO2e: number | null;
  p44LinkedAssessmentId: string | null;
  transparencyNote: string;
}

export interface CrossDisciplineContextSummary {
  p41IfcElementsReferenced: number;
  p42CadConstraintsReferenced: number;
  p43TerrainSlopeEvaluated: boolean;
  p43MaxSiteSlopePct: number | null;
  p44CarbonLinked: boolean;
  p45ClimateHazardsFlagged: string[];
  p46EnvelopeFragileStagingLinked: number;
  provenanceNotes: string[];
}

export interface SiteLogisticsMetricsSummary {
  totalSiteAreaM2: number;
  buildingFootprintAreaM2: number;
  remainingExteriorAreaM2: number;
  totalPhases: number;
  totalAccessPoints: number;
  totalVehicleRoutes: number;
  totalPedestrianRoutes: number;
  totalLogisticsZones: number;
  totalEquipmentPlacements: number;
  totalLiftingOperations: number;
  totalTemporaryFacilities: number;
  totalUtilityRequirements: number;
  totalEmergencyRoutes: number;
  totalDeliveriesScheduled: number;
  peakExteriorUtilizationPct: number;
  blockerCount: number;
  conflictCount: number;
  warningCount: number;
  unverifiedEvidenceGatesCount: number;
  overallReadinessStatus: 'blocked_critical_safety_or_conflict' | 'conditional_pending_professional_verification' | 'preliminary_planning_aligned';
}

export interface SiteLogisticsPlan {
  id: string;
  profileId: typeof SITE_LOGISTICS_PROFILE_ID;
  name: string;
  projectId: string;
  projectUnit: MeasurementUnit;
  internalCalculationUnit: 'metres';
  siteWidthM: number;
  siteLengthM: number;
  buildingBoundsM: SiteBoundingBox2D;
  activePhaseId: string;
  phases: SiteLogisticsPhase[];
  accessPoints: SiteAccessPointRecord[];
  vehicleRoutes: VehicleRouteRecord[];
  pedestrianRoutes: PedestrianRouteRecord[];
  logisticsZones: SiteLogisticsZoneRecord[];
  equipmentPlacements: ConstructionEquipmentPlacement[];
  liftingOperations: LiftingOperationPlan[];
  temporaryFacilities: TemporaryFacilityRecord[];
  utilityRequirements: TemporaryUtilityRequirement[];
  emergencyRoutes: EmergencyAccessRequirement[];
  siteRestrictions: SiteRestrictionRecord[];
  deliveries: DeliveryRequirementRecord[];
  // Evaluated outputs
  routeAnalyses: RouteDistanceTravelAnalysis[];
  phaseSummaries: PhaseSpaceUtilizationSummary[];
  conflicts: LogisticsConflictRecord[];
  riskFindings: LogisticsRiskFinding[];
  transportCarbonSummary: TransportCarbonCompatibilitySummary;
  crossDisciplineContext: CrossDisciplineContextSummary;
  summary: SiteLogisticsMetricsSummary;
  assumptionsAndLimitations: string[];
  geometryFingerprint: string;
  evaluatedAt: string;
}

export interface LogisticsAlternativeModification {
  name?: string;
  relocateZoneOffsetsM?: Record<string, { dxM: number; dyM: number; widthM?: number; lengthM?: number }>;
  relocateEquipmentOffsetsM?: Record<string, { dxM: number; dyM: number; operatingRadiusM?: number }>;
  overrideRouteWidthsM?: Record<string, number>;
  rescheduleDeliveryWindows?: Record<string, { scheduledDateIso?: string; arrivalWindowStart?: string; arrivalWindowEnd?: string }>;
  upgradePedestrianBarriersToPhysical?: boolean;
  provideWheelWashAtExits?: boolean;
}

export interface LogisticsAlternativePreview {
  id: string;
  title: string;
  baselinePlanId: string;
  candidatePlan: SiteLogisticsPlan;
  deltas: {
    blockerDelta: number;
    conflictDelta: number;
    warningDelta: number;
    peakExteriorUtilizationDeltaPct: number;
    unverifiedGatesDelta: number;
  };
  comparisonSummary: string[];
  isNonDestructivePreview: true;
  createdAt: string;
}

export interface SiteLogisticsStalenessReport {
  isStale: boolean;
  reasons: string[];
  recordedFingerprint: string;
  currentFingerprint: string;
}

export interface ProjectSiteLogisticsMetadata {
  profileId: typeof SITE_LOGISTICS_PROFILE_ID;
  activePlan: SiteLogisticsPlan;
  savedAlternatives?: LogisticsAlternativePreview[];
  lastAppliedSnapshotId?: string;
  updatedAt: string;
}
