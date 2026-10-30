export type BuildingUseClassification =
  | 'residential'
  | 'workplace-office'
  | 'retail-commercial'
  | 'mixed-use'
  | 'cultural-educational'
  | 'other';

export type BriefPriority =
  | 'mandatory'       // Must be satisfied for the brief to be acceptable
  | 'high-priority'   // Strong preference; conflicts require explicit explanation
  | 'preferred'       // Desirable; can be compromised without failing brief
  | 'optional';       // Nice-to-have; consider only if space/budget allow

export type SpaceCategory =
  | 'living'
  | 'sleeping'
  | 'work'
  | 'service'
  | 'circulation'
  | 'outdoor'
  | 'hygiene'
  | 'specialized';

export type PrivacyLevel =
  | 'public'          // Entry, lobby, client zones, public living
  | 'semi-private'    // Dining, family lounge, meeting rooms, corridors
  | 'private';        // Bedrooms, private offices, bathrooms, archives

export type SpatialRelationshipType =
  | 'direct-access'      // Immediate door or open opening required
  | 'adjacent'           // Close proximity, shared wall or common zone
  | 'separated'          // Physical separation required (no direct view/smell)
  | 'acoustic-isolated'  // Soundproofing / acoustic barrier required
  | 'outdoor-connection' // Direct visual or physical outdoor connection required
  | 'service-access';    // Back-of-house or exterior service delivery route

export type BriefApprovalStatus =
  | 'draft'              // Initial drafting in progress
  | 'under-review'       // Shared with client or team for review
  | 'client-approved'    // Approved by client as baseline
  | 'locked';            // Locked against accidental modification

export interface SpecialRequirementTag {
  id: string;
  label: string;
  iconName?: string;
}

export interface SpaceRequirement {
  id: string;
  name: string;
  category: SpaceCategory;
  targetArea: number;           // Target area in project units (sq ft or m²)
  minArea?: number;             // Minimum acceptable area
  maxArea?: number;             // Maximum acceptable area
  quantity: number;             // Number of instances required (e.g. 3 bedrooms)
  floorPreference?: number | 'any'; // Preferred floor level: 1, 2, 3 or 'any'
  priority: BriefPriority;
  privacyLevel: PrivacyLevel;
  occupantCapacity?: number;    // Estimated simultaneous people
  naturalLightRequired: boolean;
  plumbingRequired: boolean;
  outdoorAccessRequired: boolean;
  acousticPrivacyRequired: boolean;
  wheelchairAccessible: boolean;
  notes?: string;
}

export interface SpatialRelationshipRule {
  id: string;
  sourceSpaceId: string;
  targetSpaceId: string;
  relationType: SpatialRelationshipType;
  priority: BriefPriority;
  notes?: string;
}

export interface BriefObjective {
  primaryPurpose: string;
  buildingUse: BuildingUseClassification;
  customBuildingUse?: string;
  intendedUsers: string;
  mainActivities: string;
  desiredOutcomes: string;
  targetBudget?: number;
  projectStage: string;
  designLifeYears?: number;
}

export interface BriefOccupancy {
  regularOccupants: number;
  occasionalVisitors: number;
  occupancyPattern: string;       // e.g. "Weekdays 9-5", "Full-time family + frequent weekend guests"
  userGroupNeeds: string;         // e.g. "Work-from-home professional + elderly parents"
  futureExpansionNeeds: string;   // e.g. "Potential 2nd-floor bedroom conversion in 5 years"
  accessibilityNotes: string;     // e.g. "Step-free ground floor bedroom and walk-in shower"
}

export interface BriefDesignPreferences {
  spatialCharacter: string;       // e.g. "Open-plan living with secluded reading nooks"
  indoorOutdoorRelationship: string; // e.g. "Seamless patio transition, framed garden vistas"
  naturalLightPriorities: string; // e.g. "Morning sun in kitchen/breakfast, shaded west facade"
  storagePriorities: string;      // e.g. "Floor-to-ceiling concealed cabinetry, bike workshop"
  circulationPreferences: string;// e.g. "Central stair core, minimal wasted corridor space"
  materialPreferences: string;   // e.g. "Timber, lime plaster, honest natural materials"
}

export interface BriefConstraints {
  siteRestrictionsSummary: string; // e.g. "Rear setback 4.5m, 8.5m height limit"
  structuralAssumptions: string;   // e.g. "Timber post & beam or reinforced concrete frame"
  knownMandatoryRequirements: string[];
  budgetCapKnown?: number;
  accessibilityMandatory: boolean;
  sustainabilityGoals?: string;    // e.g. "Passive house standards, rainwater harvesting"
  unresolvedQuestions: string[];   // Specific unknowns requiring client/site clarification
}

export interface BriefRevisionRecord {
  id: string;
  versionNumber: number;
  timestamp: string;
  author: string;
  summaryOfChanges: string;
  approvalStatus: BriefApprovalStatus;
}

export interface SpaceProgramSummary {
  totalTargetNetArea: number;
  minProgramArea: number;
  maxProgramArea: number;
  mandatoryTargetArea: number;
  highPriorityTargetArea: number;
  preferredTargetArea: number;
  optionalTargetArea: number;
  circulationWallAllowancePercent: number; // e.g. 15%
  estimatedCirculationWallArea: number;
  estimatedGrossInternalArea: number;
  availablePlotArea: number;
  maxAllowableFootprintArea?: number;
  maxAllowableGrossArea?: number;
  footprintFitStatus: 'fits' | 'tight' | 'exceeds' | 'unverified';
  totalSpaceCount: number;
  mandatorySpaceCount: number;
}

export interface SpacePlacementComparison {
  spaceRequirementId: string;
  name: string;
  category: SpaceCategory;
  priority: BriefPriority;
  requiredQuantity: number;
  placedQuantity: number;
  targetAreaEach: number;
  targetTotalArea: number;
  actualPlacedTotalArea: number;
  areaDelta: number;               // actual - target
  areaVariancePercent: number;     // ((actual - target) / target) * 100
  placementStatus: 'unplaced' | 'partially-placed' | 'fully-placed' | 'over-allocated';
  matchedRoomIds: string[];
}

export interface BriefValidationNotice {
  id: string;
  type: 'unplaced-mandatory' | 'area-shortfall' | 'area-excess' | 'adjacency-conflict' | 'capacity-exceeded' | 'missing-input' | 'unresolved-question' | 'regulatory-code-notice';
  severity: 'conflict' | 'warning' | 'info';
  title: string;
  message: string;
  affectedSpaceIds?: string[];
  suggestedAction: string;
}

export interface ArchitecturalBriefData {
  version: string;
  lastUpdated: string;
  approvalStatus: BriefApprovalStatus;
  approvalSignoff?: {
    approvedBy: string;
    approvedAt: string;
    signoffNotes: string;
  };
  objectives: BriefObjective;
  occupancy: BriefOccupancy;
  preferences: BriefDesignPreferences;
  constraints: BriefConstraints;
  spaces: SpaceRequirement[];
  relationships: SpatialRelationshipRule[];
  circulationWallAllowancePercent: number; // default 15%
  revisions: BriefRevisionRecord[];
}
