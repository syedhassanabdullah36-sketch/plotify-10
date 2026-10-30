/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Project, FloorPlanRoom } from '../types/project';
import {
  EvaluationStatus,
  RegulatoryState,
  RegulatoryProjectProfile,
  RegulatorySourceRecord,
  RegulatoryRequirementItem,
  RequirementEvaluationRecord,
  RegulatoryEvaluationSummary,
  ReviewerDecision,
  AssessmentHistoryRecord,
} from '../types/regulations';
import { computeProjectGeometryHash } from './costPlanningService';
import { initializeProjectSiteContext } from './siteIntelligenceService';

const REGULATORY_ENGINE_VERSION = 'v1.0.0-regulatory-intel';

export const STATUTORY_LIMITATION_DISCLAIMER =
  'IMPORTANT NOTICE: Plotify Building Regulations Intelligence Engine provides preliminary, automated mathematical rule checks and regulatory traceability. It DOES NOT constitute an official municipal permit, building control sign-off, or professional architectural/engineering certification. Local authorities, code amendments, historic overlays, and discretionary variances must be verified with the relevant Authority Having Jurisdiction (AHJ) and qualified licensed professionals.';

// =========================================================================
// DEFAULT STANDARD REGULATORY SOURCES
// =========================================================================

export const DEFAULT_REGULATORY_SOURCES: RegulatorySourceRecord[] = [
  {
    id: 'src-irc-2021',
    title: 'International Residential Code for One- and Two-Family Dwellings',
    issuingAuthority: 'International Code Council (ICC)',
    documentIdentifier: 'IRC 2021',
    officialUrl: 'https://codes.iccsafe.org/content/IRC2021P2',
    jurisdiction: {
      country: 'United States',
      region: 'Model Code',
      localAuthority: 'Adopting Municipalities',
    },
    edition: '2021 Edition',
    publicationDate: '2020-09-01',
    effectiveDate: '2021-01-01',
    status: 'model-code',
    verificationStatus: 'verified',
    sourceType: 'adopted-code',
    clauses: [
      {
        clauseId: 'cl-r304-1',
        section: 'Section R304.1',
        title: 'Minimum Habitable Room Areas',
        text: 'Habitable rooms shall have a floor area of not less than 70 square feet (6.5 m²). Exception: Every dwelling unit shall have at least one habitable room that shall have not less than 120 square feet (11 m²) of gross floor area.',
        page: 'R-45',
      },
      {
        clauseId: 'cl-r304-2',
        section: 'Section R304.2',
        title: 'Minimum Horizontal Dimensions',
        text: 'Habitable rooms shall not be less than 7 feet (2134 mm) in any horizontal dimension.',
        page: 'R-45',
      },
      {
        clauseId: 'cl-r305-1',
        section: 'Section R305.1',
        title: 'Minimum Ceiling Heights',
        text: 'Habitable space, hallways and portions of basements containing these spaces shall have a ceiling height of not less than 7 feet (2134 mm).',
        page: 'R-46',
      },
      {
        clauseId: 'cl-r306-1',
        section: 'Section R306.1',
        title: 'Sanitary Facilities',
        text: 'Every dwelling unit shall be provided with a water closet, lavatory, and a bathtub or shower.',
        page: 'R-48',
      },
      {
        clauseId: 'cl-r310-1',
        section: 'Section R310.1',
        title: 'Emergency Escape and Rescue Openings',
        text: 'Basements, habitable attics and every sleeping room shall have not less than one operable emergency escape and rescue opening.',
        page: 'R-51',
      },
    ],
    lastReviewedDate: '2026-01-15',
    reviewerNotes: 'Verified against published ICC 2021 model code. State-level amendments may apply.',
    limitations: 'Local municipal amendments may adjust minimum room sizes or ceiling heights.',
  },
  {
    id: 'src-zoning-baseline',
    title: 'Standard Residential Zoning & Parcel Planning Framework',
    issuingAuthority: 'Municipal Planning Commission (Generic Baseline)',
    documentIdentifier: 'ZON-RES-STD',
    jurisdiction: {
      country: 'United States',
      region: 'Municipal Baseline',
    },
    edition: '2024 Framework',
    publicationDate: '2024-01-01',
    effectiveDate: '2024-01-01',
    status: 'adopted',
    verificationStatus: 'verified',
    sourceType: 'official-legislation',
    clauses: [
      {
        clauseId: 'cl-zon-lot-cov',
        section: 'Section Z-101',
        title: 'Maximum Ground Lot Coverage',
        text: 'The total footprint area of all buildings on the parcel shall not exceed 50% of the total parcel lot area.',
      },
      {
        clauseId: 'cl-zon-setback-front',
        section: 'Section Z-102',
        title: 'Front Boundary Setback',
        text: 'No principal building structure shall be erected within 15 feet (4.5 m) of the front parcel road boundary.',
      },
      {
        clauseId: 'cl-zon-setback-rear',
        section: 'Section Z-103',
        title: 'Rear Boundary Setback',
        text: 'No principal building structure shall be erected within 10 feet (3.0 m) of the rear parcel boundary.',
      },
      {
        clauseId: 'cl-zon-setback-side',
        section: 'Section Z-104',
        title: 'Side Boundary Setbacks',
        text: 'A minimum side yard setback of not less than 5 feet (1.5 m) shall be maintained along both lateral parcel boundaries.',
      },
      {
        clauseId: 'cl-zon-height-floors',
        section: 'Section Z-105',
        title: 'Maximum Building Storeys',
        text: 'Residential dwelling structures in this zone shall not exceed 3 storeys above finished grade.',
      },
    ],
    lastReviewedDate: '2026-02-10',
    reviewerNotes: 'Baseline municipal setback and lot coverage standards.',
  },
  {
    id: 'src-ibc-structural',
    title: 'International Building Code — Structural Integrity & Review Provisions',
    issuingAuthority: 'International Code Council (ICC)',
    documentIdentifier: 'IBC 2021 Ch 16',
    jurisdiction: {
      country: 'United States',
      region: 'Model Code',
    },
    edition: '2021 Edition',
    status: 'model-code',
    verificationStatus: 'verified',
    sourceType: 'adopted-code',
    clauses: [
      {
        clauseId: 'cl-ibc-1604',
        section: 'Section 1604.1',
        title: 'Structural Design Professional Review',
        text: 'Buildings, structures and all parts thereof shall be designed and constructed to support the nominal loads without exceeding the appropriate allowable stresses. Certified calculations required for non-conventional framing.',
      },
    ],
    lastReviewedDate: '2026-01-20',
  },
  {
    id: 'src-geotech-investigation',
    title: 'Geotechnical Soil Capacity & Site Subsurface Investigation Guidance',
    issuingAuthority: 'Building Officials Advisory Committee',
    documentIdentifier: 'GEO-GUIDE-01',
    jurisdiction: {
      country: 'United States',
      region: 'Advisory Guidance',
    },
    edition: '2023 Revision',
    status: 'guidance',
    verificationStatus: 'verified',
    sourceType: 'authority-guidance',
    clauses: [
      {
        clauseId: 'cl-geo-1803',
        section: 'Guideline G-1803',
        title: 'Subsurface Geotechnical Investigation',
        text: 'Where soil load-bearing capacity is unconfirmed or slope exceeds 10%, a subsurface geotechnical soil report by a licensed engineer is strongly recommended.',
      },
    ],
    lastReviewedDate: '2026-02-01',
  },
];

// =========================================================================
// DEFAULT STANDARD REGULATORY REQUIREMENTS
// =========================================================================

export const DEFAULT_REGULATORY_REQUIREMENTS: RegulatoryRequirementItem[] = [
  {
    id: 'req-front-setback',
    title: 'Front Parcel Boundary Minimum Setback',
    plainLanguageExplanation:
      'The building front edge must sit at least 15 ft (or 4.5 m) behind the front property road boundary.',
    clauseReference: 'Section Z-102 (Front Boundary Setback)',
    sourceId: 'src-zoning-baseline',
    jurisdictionScope: 'Municipal Zoning Baseline',
    buildingScope: ['house', 'apartment', 'other'],
    applicabilityConditions: 'Applies to all principal building structures with road frontage.',
    requiredInputs: ['siteContext.setbacks.front', 'floorPlan.rooms', 'project.plotLength'],
    requirementType: 'dimensional-condition',
    evaluationMethod: 'evalFrontSetback',
    threshold: {
      targetValue: 15,
      unit: 'feet',
      operator: 'min',
    },
    evidenceNeeded: 'Frontmost placed room y-coordinate compared against required front setback.',
    lastVerificationDate: '2026-02-10',
    verificationStatus: 'verified',
    isDiscretionary: false,
  },
  {
    id: 'req-rear-setback',
    title: 'Rear Parcel Boundary Minimum Setback',
    plainLanguageExplanation:
      'The rear edge of the building must remain at least 10 ft (or 3.0 m) away from the back boundary.',
    clauseReference: 'Section Z-103 (Rear Boundary Setback)',
    sourceId: 'src-zoning-baseline',
    jurisdictionScope: 'Municipal Zoning Baseline',
    buildingScope: ['house', 'apartment', 'other'],
    applicabilityConditions: 'Applies to rear boundary of all principal building structures.',
    requiredInputs: ['siteContext.setbacks.rear', 'floorPlan.rooms', 'project.plotLength'],
    requirementType: 'dimensional-condition',
    evaluationMethod: 'evalRearSetback',
    threshold: {
      targetValue: 10,
      unit: 'feet',
      operator: 'min',
    },
    evidenceNeeded: 'Rearmost placed room extent compared against rear parcel setback buffer.',
    lastVerificationDate: '2026-02-10',
    verificationStatus: 'verified',
    isDiscretionary: false,
  },
  {
    id: 'req-side-setbacks',
    title: 'Side Parcel Boundaries Minimum Setbacks',
    plainLanguageExplanation:
      'Both left and right exterior walls must maintain at least a 5 ft (or 1.5 m) clearance from side property lines.',
    clauseReference: 'Section Z-104 (Side Boundary Setbacks)',
    sourceId: 'src-zoning-baseline',
    jurisdictionScope: 'Municipal Zoning Baseline',
    buildingScope: ['house', 'apartment', 'other'],
    applicabilityConditions: 'Applies to lateral boundaries of all building structures.',
    requiredInputs: ['siteContext.setbacks.sideLeft', 'siteContext.setbacks.sideRight', 'floorPlan.rooms', 'project.plotWidth'],
    requirementType: 'dimensional-condition',
    evaluationMethod: 'evalSideSetbacks',
    threshold: {
      targetValue: 5,
      unit: 'feet',
      operator: 'min',
    },
    evidenceNeeded: 'Minimum x and maximum (x + width) of all rooms compared against left and right setback limits.',
    lastVerificationDate: '2026-02-10',
    verificationStatus: 'verified',
    isDiscretionary: false,
  },
  {
    id: 'req-max-lot-coverage',
    title: 'Maximum Ground Footprint Lot Coverage Ratio',
    plainLanguageExplanation:
      'Ground floor building footprint cannot cover more than 50% of the total parcel land area.',
    clauseReference: 'Section Z-101 (Maximum Ground Lot Coverage)',
    sourceId: 'src-zoning-baseline',
    jurisdictionScope: 'Municipal Zoning Baseline',
    buildingScope: ['house', 'apartment', 'other'],
    applicabilityConditions: 'Applies to total ground floor footprint on legal plot parcel.',
    requiredInputs: ['project.plotWidth', 'project.plotLength', 'floorPlan.rooms'],
    requirementType: 'numeric-threshold',
    evaluationMethod: 'evalMaxLotCoverage',
    threshold: {
      targetValue: 50,
      unit: '%',
      operator: 'max',
    },
    evidenceNeeded: 'Ratio of Level 1 footprint area to total plot parcel area.',
    lastVerificationDate: '2026-02-10',
    verificationStatus: 'verified',
    isDiscretionary: false,
  },
  {
    id: 'req-max-storeys',
    title: 'Maximum Building Storey Limit',
    plainLanguageExplanation:
      'Residential dwelling structure must not exceed 3 storeys above grade in this standard zoning category.',
    clauseReference: 'Section Z-105 (Maximum Building Storeys)',
    sourceId: 'src-zoning-baseline',
    jurisdictionScope: 'Municipal Zoning Baseline',
    buildingScope: ['house', 'apartment', 'other'],
    applicabilityConditions: 'Single-family and two-family residential zoning districts.',
    requiredInputs: ['project.floors'],
    requirementType: 'numeric-threshold',
    evaluationMethod: 'evalMaxStoreys',
    threshold: {
      targetValue: 3,
      unit: 'floors',
      operator: 'max',
    },
    evidenceNeeded: 'Project declared floors and floor plan room levels compared against 3 storeys.',
    lastVerificationDate: '2026-02-10',
    verificationStatus: 'verified',
    isDiscretionary: false,
  },
  {
    id: 'req-habitable-room-min-area',
    title: 'Habitable Rooms Minimum Floor Area & Primary Living Space',
    plainLanguageExplanation:
      'All habitable rooms (bedrooms, living, dining) must be at least 70 sq ft (6.5 m²), and at least one primary habitable room must have >= 120 sq ft (11 m²).',
    clauseReference: 'IRC 2021 Section R304.1',
    sourceId: 'src-irc-2021',
    jurisdictionScope: 'IRC 2021 Model Code',
    buildingScope: ['house', 'apartment'],
    applicabilityConditions: 'All rooms designated as habitable (living, dining, bedrooms, office). Bathrooms/storage excluded.',
    requiredInputs: ['floorPlan.rooms.type', 'floorPlan.rooms.width', 'floorPlan.rooms.length'],
    requirementType: 'numeric-threshold',
    evaluationMethod: 'evalHabitableRoomMinArea',
    threshold: {
      targetValue: 70,
      unit: 'sq ft',
      operator: 'min',
    },
    evidenceNeeded: 'Individual usable room area calculations for all placed habitable rooms.',
    lastVerificationDate: '2026-01-15',
    verificationStatus: 'verified',
    isDiscretionary: false,
  },
  {
    id: 'req-habitable-room-min-dimension',
    title: 'Minimum Habitable Room Horizontal Dimension',
    plainLanguageExplanation:
      'Habitable rooms must be at least 7 ft (2.13 m) wide and 7 ft long in every horizontal direction.',
    clauseReference: 'IRC 2021 Section R304.2',
    sourceId: 'src-irc-2021',
    jurisdictionScope: 'IRC 2021 Model Code',
    buildingScope: ['house', 'apartment'],
    applicabilityConditions: 'Applies to width and length dimensions of habitable rooms.',
    requiredInputs: ['floorPlan.rooms.width', 'floorPlan.rooms.length'],
    requirementType: 'dimensional-condition',
    evaluationMethod: 'evalHabitableRoomMinDimension',
    threshold: {
      targetValue: 7,
      unit: 'feet',
      operator: 'min',
    },
    evidenceNeeded: 'Minimum horizontal clear dimension check across width and length.',
    lastVerificationDate: '2026-01-15',
    verificationStatus: 'verified',
    isDiscretionary: false,
  },
  {
    id: 'req-sanitary-facilities',
    title: 'Mandatory Complete Sanitary Hygiene Facilities',
    plainLanguageExplanation:
      'Dwelling unit must provide at least one complete sanitary bathroom with water closet, lavatory, and bathtub or shower.',
    clauseReference: 'IRC 2021 Section R306.1',
    sourceId: 'src-irc-2021',
    jurisdictionScope: 'IRC 2021 Model Code',
    buildingScope: ['house', 'apartment'],
    applicabilityConditions: 'Mandatory for all residential dwelling units.',
    requiredInputs: ['project.rooms.bathrooms', 'floorPlan.rooms'],
    requirementType: 'mandatory-provision',
    evaluationMethod: 'evalSanitaryFacilities',
    threshold: {
      targetValue: 1,
      unit: 'bathroom',
      operator: 'min',
    },
    evidenceNeeded: 'Count of configured and placed bathroom spaces.',
    lastVerificationDate: '2026-01-15',
    verificationStatus: 'verified',
    isDiscretionary: false,
  },
  {
    id: 'req-sleeping-room-egress',
    title: 'Sleeping Room Emergency Egress & Exterior Ventilation Opening',
    plainLanguageExplanation:
      'Every bedroom must have access to an exterior building wall allowing required emergency escape, rescue opening, and direct natural light.',
    clauseReference: 'IRC 2021 Section R310.1',
    sourceId: 'src-irc-2021',
    jurisdictionScope: 'IRC 2021 Model Code',
    buildingScope: ['house', 'apartment'],
    applicabilityConditions: 'All designated sleeping rooms / bedrooms.',
    requiredInputs: ['floorPlan.rooms', 'project.plotWidth', 'project.plotLength'],
    requirementType: 'mandatory-provision',
    evaluationMethod: 'evalSleepingRoomEgress',
    evidenceNeeded: 'Geometric verification that bedroom boundary touches the building envelope facing an exterior yard.',
    lastVerificationDate: '2026-01-15',
    verificationStatus: 'verified',
    isDiscretionary: false,
  },
  {
    id: 'req-structural-engineer-review',
    title: 'Structural Engineering Review & Calculations Seal',
    plainLanguageExplanation:
      'Multi-storey construction, spans exceeding 20 feet, or open layouts require sealed structural calculations by a licensed engineer.',
    clauseReference: 'IBC 2021 Section 1604.1',
    sourceId: 'src-ibc-structural',
    jurisdictionScope: 'IBC 2021 Model Code',
    buildingScope: ['house', 'apartment', 'other'],
    applicabilityConditions: 'Projects exceeding 1 storey or containing large open spans.',
    requiredInputs: ['project.floors', 'floorPlan.rooms.width', 'floorPlan.rooms.length'],
    requirementType: 'professional-review',
    evaluationMethod: 'evalStructuralReview',
    evidenceNeeded: 'Floor count, max room clear span, and structural review assignment.',
    lastVerificationDate: '2026-01-20',
    verificationStatus: 'verified',
    isDiscretionary: true,
  },
  {
    id: 'req-geotech-soil-investigation',
    title: 'Geotechnical Soil Capacity & Site Investigation',
    plainLanguageExplanation:
      'Subsurface soil conditions must be established prior to foundation permit issuance, especially on sloped terrain.',
    clauseReference: 'Guideline G-1803 (Subsurface Geotechnical Investigation)',
    sourceId: 'src-geotech-investigation',
    jurisdictionScope: 'Building Officials Advisory Guidance',
    buildingScope: ['house', 'apartment', 'other'],
    applicabilityConditions: 'Site topography and foundation design.',
    requiredInputs: ['siteContext.slope', 'siteContext.soilType'],
    requirementType: 'professional-review',
    evaluationMethod: 'evalGeotechInvestigation',
    evidenceNeeded: 'Site context slope data and geotechnical review record.',
    lastVerificationDate: '2026-02-01',
    verificationStatus: 'verified',
    isDiscretionary: true,
  },
];

// =========================================================================
// INITIALIZATION & STATE MANAGEMENT
// =========================================================================

/**
 * Initializes or normalizes the regulatory state for a project.
 */
export function initializeProjectRegulations(project: Project): RegulatoryState {
  if (project.regulations && project.regulations.profile && project.regulations.sources) {
    return {
      ...project.regulations,
      sources: project.regulations.sources.length > 0 ? project.regulations.sources : DEFAULT_REGULATORY_SOURCES,
      customRequirements: project.regulations.customRequirements || [],
      evaluations: project.regulations.evaluations || {},
      history: project.regulations.history || [],
      reviewerDecisions: project.regulations.reviewerDecisions || [],
    };
  }

  // Derive initial profile from project metadata where available
  const initialProfile: RegulatoryProjectProfile = {
    country: 'United States', // editable baseline
    region: 'California (Baseline Model)',
    localAuthority: 'Municipal Building Department',
    siteAddress: project.name ? `${project.name} Parcel Site` : 'Site Address Pending',
    ahj: 'City Planning & Building Safety Department',
    buildingUse:
      project.projectType === 'house'
        ? 'Single-Family Detached Dwelling'
        : project.projectType === 'apartment'
        ? 'Multi-Family Residential'
        : 'General Building Use',
    projectCategory: 'new-construction',
    occupancyClassification:
      project.projectType === 'house'
        ? 'Group R-3 (One- and Two-Family Dwellings)'
        : project.projectType === 'apartment'
        ? 'Group R-2 (Residential Multi-Unit)'
        : 'General Occupancy',
    approvalPathway: 'standard-planning-permit',
    applicableCodeFamilies: ['IRC 2021', 'IBC 2021', 'Municipal Zoning Code ZON-RES-STD'],
    assessmentDate: new Date().toISOString().split('T')[0],
    lastSourceVerificationDate: '2026-02-10',
    responsibleReviewer: 'Architectural Intelligence Specialist (Plotify)',
    reviewNotes: 'Initial preliminary regulatory baseline profile initialized.',
  };

  return {
    profile: initialProfile,
    sources: [...DEFAULT_REGULATORY_SOURCES],
    customRequirements: [],
    activeRulePack: 'irc-2021-baseline',
    evaluations: {},
    history: [],
    reviewerDecisions: [],
  };
}

// =========================================================================
// DETERMINISTIC EVALUATION ENGINE
// =========================================================================

/**
 * Evaluates all applicable regulatory requirements deterministically.
 */
export function evaluateProjectRegulations(
  project: Project,
  existingState?: RegulatoryState
): RegulatoryEvaluationSummary {
  const state = existingState || initializeProjectRegulations(project);
  const nowIso = new Date().toISOString();
  const currentGeomHash = computeProjectGeometryHash(project);
  const siteContext = initializeProjectSiteContext(project);

  const unitFactor = project.unit === 'metres' ? 3.28084 : 1; // feet multiplier
  const unitSuffix = project.unit === 'feet' ? 'ft' : 'm';
  const unitAreaSuffix = project.unit === 'feet' ? 'sq ft' : 'm²';

  const rooms = project.floorPlan?.rooms || [];
  const allRequirements = [...DEFAULT_REGULATORY_REQUIREMENTS, ...(state.customRequirements || [])];
  const sourceMap = new Map(state.sources.map((s) => [s.id, s]));

  const evaluations: RequirementEvaluationRecord[] = [];
  const staleReasons: string[] = [];

  // Check whether geometry or site has changed since last evaluation
  const isGeometryStale = Boolean(
    state.lastEvaluatedGeometryHash && state.lastEvaluatedGeometryHash !== currentGeomHash
  );
  if (isGeometryStale) {
    staleReasons.push('Floor plan room geometry has changed since last regulatory assessment.');
  }

  // Iterate requirements
  allRequirements.forEach((req) => {
    const source = sourceMap.get(req.sourceId);

    // Rule 2: Unverified source check
    if (!source || source.verificationStatus === 'unverified' || source.status === 'superseded') {
      evaluations.push({
        requirementId: req.id,
        status: 'unverified-rule',
        statusReason: !source
          ? `Regulatory source reference \`${req.sourceId}\` is missing from the source register.`
          : `Source \`${source.title}\` is marked as ${source.verificationStatus.toUpperCase()} or ${source.status.toUpperCase()}. Statutory compliance cannot be claimed on unverified or superseded sources.`,
        inputsCaptured: { sourceId: req.sourceId, verificationStatus: source?.verificationStatus || 'missing' },
        sourceVersion: source?.edition || 'Unknown',
        evaluatedAt: nowIso,
        evaluatorEngine: REGULATORY_ENGINE_VERSION,
        geometryHashAtEval: currentGeomHash,
        isStale: false,
        actionNeeded: 'Verify authoritative legal adoption with local AHJ before relying on this rule.',
      });
      return;
    }

    // Rule 1 & Specific Evaluator Functions
    let record: RequirementEvaluationRecord;

    switch (req.id) {
      // 1. Front Setback
      case 'req-front-setback': {
        const requiredSetbackFt = 15;
        const requiredSetbackLocal = project.unit === 'metres' ? Number((requiredSetbackFt / 3.28084).toFixed(1)) : requiredSetbackFt;
        const siteSetback = siteContext.setbacks.front;

        if (project.plotLength <= 0 || project.plotWidth <= 0) {
          record = createInsufficientDataRecord(req, source, currentGeomHash, nowIso, {
            'project.plotLength': project.plotLength,
            'project.plotWidth': project.plotWidth,
          }, 'Plot dimensions are missing or invalid (<= 0). Cannot evaluate setback clearance.');
          break;
        }

        if (rooms.length === 0) {
          record = createInsufficientDataRecord(req, source, currentGeomHash, nowIso, {
            placedRoomsCount: 0,
            requiredSetback: `${requiredSetbackLocal} ${unitSuffix}`,
          }, 'No rooms are placed on the 2D floor plan. Cannot measure front building edge distance.');
          break;
        }

        // Front road facing: Road is top/front by default, meaning min Y coordinate is the front building edge
        const minY = Math.min(...rooms.map((r) => r.y));
        const effectiveRequired = Math.max(requiredSetbackLocal, siteSetback);
        const passes = minY >= effectiveRequired - 0.05; // tiny epsilon

        record = {
          requirementId: req.id,
          status: passes ? 'pass' : 'conflict',
          statusReason: passes
            ? `Front building setback of ${minY.toFixed(1)} ${unitSuffix} satisfies the minimum requirement of ${effectiveRequired} ${unitSuffix}.`
            : `Front building setback violation: Frontmost room edge is positioned at ${minY.toFixed(1)} ${unitSuffix}, violating the required ${effectiveRequired} ${unitSuffix} buffer by ${(effectiveRequired - minY).toFixed(1)} ${unitSuffix}.`,
          inputsCaptured: {
            frontmostY: minY,
            requiredSetback: effectiveRequired,
            siteDeclaredSetback: siteSetback,
            unit: unitSuffix,
          },
          measuredValue: `${minY.toFixed(1)} ${unitSuffix}`,
          thresholdValue: `${effectiveRequired} ${unitSuffix}`,
          unit: unitSuffix,
          sourceVersion: source.edition,
          evaluatedAt: nowIso,
          evaluatorEngine: REGULATORY_ENGINE_VERSION,
          geometryHashAtEval: currentGeomHash,
          isStale: false,
          actionNeeded: passes
            ? 'Maintain building setback buffer during detail design.'
            : `Move front rooms backwards by at least ${(effectiveRequired - minY).toFixed(1)} ${unitSuffix} to clear the front setback buffer.`,
          remedySuggestion: passes ? undefined : 'Adjust room coordinates in 2D Floor Plan editor to satisfy front setback.',
        };
        break;
      }

      // 2. Rear Setback
      case 'req-rear-setback': {
        const requiredSetbackFt = 10;
        const requiredSetbackLocal = project.unit === 'metres' ? Number((requiredSetbackFt / 3.28084).toFixed(1)) : requiredSetbackFt;
        const siteSetback = siteContext.setbacks.rear;

        if (project.plotLength <= 0) {
          record = createInsufficientDataRecord(req, source, currentGeomHash, nowIso, {
            'project.plotLength': project.plotLength,
          }, 'Plot length is missing or zero.');
          break;
        }

        if (rooms.length === 0) {
          record = createInsufficientDataRecord(req, source, currentGeomHash, nowIso, {
            placedRoomsCount: 0,
          }, 'No floor plan rooms placed to measure rear clearance.');
          break;
        }

        const maxY = Math.max(...rooms.map((r) => r.y + r.length));
        const rearClearance = project.plotLength - maxY;
        const effectiveRequired = Math.max(requiredSetbackLocal, siteSetback);
        const passes = rearClearance >= effectiveRequired - 0.05;

        record = {
          requirementId: req.id,
          status: passes ? 'pass' : 'conflict',
          statusReason: passes
            ? `Rear building clearance of ${rearClearance.toFixed(1)} ${unitSuffix} satisfies the required ${effectiveRequired} ${unitSuffix} rear setback.`
            : `Rear setback encroachment: Building extends to ${maxY.toFixed(1)} ${unitSuffix}, leaving only ${rearClearance.toFixed(1)} ${unitSuffix} rear clearance against the required ${effectiveRequired} ${unitSuffix}.`,
          inputsCaptured: {
            rearmostY: maxY,
            plotLength: project.plotLength,
            rearClearance,
            requiredSetback: effectiveRequired,
            unit: unitSuffix,
          },
          measuredValue: `${rearClearance.toFixed(1)} ${unitSuffix}`,
          thresholdValue: `${effectiveRequired} ${unitSuffix}`,
          unit: unitSuffix,
          sourceVersion: source.edition,
          evaluatedAt: nowIso,
          evaluatorEngine: REGULATORY_ENGINE_VERSION,
          geometryHashAtEval: currentGeomHash,
          isStale: false,
          actionNeeded: passes
            ? 'Rear setback compliant with zoning standard.'
            : `Shorten rear room depth or pull building forward by ${(effectiveRequired - rearClearance).toFixed(1)} ${unitSuffix}.`,
          remedySuggestion: passes ? undefined : 'Reduce length of rear rooms in 2D Floor Plan.',
        };
        break;
      }

      // 3. Side Setbacks
      case 'req-side-setbacks': {
        const requiredSetbackFt = 5;
        const requiredSetbackLocal = project.unit === 'metres' ? Number((requiredSetbackFt / 3.28084).toFixed(1)) : requiredSetbackFt;
        const leftSetback = siteContext.setbacks.sideLeft;
        const rightSetback = siteContext.setbacks.sideRight;

        if (project.plotWidth <= 0) {
          record = createInsufficientDataRecord(req, source, currentGeomHash, nowIso, {
            'project.plotWidth': project.plotWidth,
          }, 'Plot width is missing or zero.');
          break;
        }

        if (rooms.length === 0) {
          record = createInsufficientDataRecord(req, source, currentGeomHash, nowIso, {
            placedRoomsCount: 0,
          }, 'No floor plan rooms placed.');
          break;
        }

        const minX = Math.min(...rooms.map((r) => r.x));
        const maxX = Math.max(...rooms.map((r) => r.x + r.width));
        const rightClearance = project.plotWidth - maxX;

        const effectiveLeft = Math.max(requiredSetbackLocal, leftSetback);
        const effectiveRight = Math.max(requiredSetbackLocal, rightSetback);

        const leftPass = minX >= effectiveLeft - 0.05;
        const rightPass = rightClearance >= effectiveRight - 0.05;
        const passes = leftPass && rightPass;

        record = {
          requirementId: req.id,
          status: passes ? 'pass' : 'conflict',
          statusReason: passes
            ? `Side yard clearances (Left: ${minX.toFixed(1)} ${unitSuffix}, Right: ${rightClearance.toFixed(1)} ${unitSuffix}) satisfy minimum ${effectiveLeft}/${effectiveRight} ${unitSuffix} setbacks.`
            : `Side yard setback violation: ${!leftPass ? `Left clearance is ${minX.toFixed(1)} ${unitSuffix} (< ${effectiveLeft} ${unitSuffix}). ` : ''}${!rightPass ? `Right clearance is ${rightClearance.toFixed(1)} ${unitSuffix} (< ${effectiveRight} ${unitSuffix}).` : ''}`,
          inputsCaptured: {
            leftClearance: minX,
            rightClearance,
            requiredLeft: effectiveLeft,
            requiredRight: effectiveRight,
            unit: unitSuffix,
          },
          measuredValue: `L: ${minX.toFixed(1)} / R: ${rightClearance.toFixed(1)} ${unitSuffix}`,
          thresholdValue: `L: ${effectiveLeft} / R: ${effectiveRight} ${unitSuffix}`,
          unit: unitSuffix,
          sourceVersion: source.edition,
          evaluatedAt: nowIso,
          evaluatorEngine: REGULATORY_ENGINE_VERSION,
          geometryHashAtEval: currentGeomHash,
          isStale: false,
          actionNeeded: passes
            ? 'Lateral setbacks compliant.'
            : 'Shift or narrow floor plan to ensure 5 ft (1.5 m) buffer on both property flanks.',
        };
        break;
      }

      // 4. Maximum Ground Lot Coverage
      case 'req-max-lot-coverage': {
        const plotArea = project.plotWidth * project.plotLength;
        if (plotArea <= 0) {
          record = createInsufficientDataRecord(req, source, currentGeomHash, nowIso, {
            plotArea,
          }, 'Plot area cannot be calculated because parcel dimensions are missing or non-positive.');
          break;
        }

        const groundRooms = rooms.filter((r) => (r.floorLevel || 1) === 1);
        const groundFootprint = groundRooms.reduce((sum, r) => sum + r.width * r.length, 0);
        const coverageRatio = (groundFootprint / plotArea) * 100;
        const passes = coverageRatio <= 50.05;

        record = {
          requirementId: req.id,
          status: passes ? 'pass' : 'conflict',
          statusReason: passes
            ? `Ground floor coverage of ${coverageRatio.toFixed(1)}% (${groundFootprint.toLocaleString()} ${unitAreaSuffix} on ${plotArea.toLocaleString()} ${unitAreaSuffix} parcel) complies with maximum 50% limit.`
            : `Ground coverage exceeded: Footprint of ${groundFootprint.toLocaleString()} ${unitAreaSuffix} occupies ${coverageRatio.toFixed(1)}% of the parcel, exceeding the 50% statutory maximum by ${(coverageRatio - 50).toFixed(1)}%.`,
          inputsCaptured: {
            groundFootprint,
            plotArea,
            coverageRatio: Number(coverageRatio.toFixed(1)),
          },
          measuredValue: `${coverageRatio.toFixed(1)}%`,
          thresholdValue: '50.0%',
          unit: '%',
          sourceVersion: source.edition,
          evaluatedAt: nowIso,
          evaluatorEngine: REGULATORY_ENGINE_VERSION,
          geometryHashAtEval: currentGeomHash,
          isStale: false,
          actionNeeded: passes
            ? 'Lot coverage within allowable zoning envelope.'
            : 'Reduce ground floor building footprint or distribute space to upper storeys.',
          remedySuggestion: passes ? undefined : 'Move rooms to upper floor or reduce room sizes to meet 50% lot coverage.',
        };
        break;
      }

      // 5. Maximum Storeys
      case 'req-max-storeys': {
        const declaredFloors = project.floors || 1;
        const maxLevelInPlan = rooms.length > 0 ? Math.max(...rooms.map((r) => r.floorLevel || 1)) : declaredFloors;
        const effectiveFloors = Math.max(declaredFloors, maxLevelInPlan);
        const passes = effectiveFloors <= 3;

        record = {
          requirementId: req.id,
          status: passes ? 'pass' : 'conflict',
          statusReason: passes
            ? `Proposed height of ${effectiveFloors} storey(s) complies with maximum 3-storey single-family residential zoning limitation.`
            : `Storey limit exceeded: Project specifies ${effectiveFloors} storeys, exceeding the 3-storey maximum for standard residential zoning.`,
          inputsCaptured: {
            declaredFloors,
            maxLevelInPlan,
            effectiveFloors,
          },
          measuredValue: `${effectiveFloors} storeys`,
          thresholdValue: '3 storeys',
          unit: 'floors',
          sourceVersion: source.edition,
          evaluatedAt: nowIso,
          evaluatorEngine: REGULATORY_ENGINE_VERSION,
          geometryHashAtEval: currentGeomHash,
          isStale: false,
          actionNeeded: passes ? 'Storey count compliant.' : 'Reduce floor count to 3 or apply for municipal height variance.',
        };
        break;
      }

      // 6. Habitable Room Minimum Area
      case 'req-habitable-room-min-area': {
        if (rooms.length === 0) {
          record = createInsufficientDataRecord(req, source, currentGeomHash, nowIso, {
            placedRoomsCount: 0,
          }, 'No rooms placed on the floor plan to evaluate room areas.');
          break;
        }

        // Habitable categories
        const habitableTypes = ['bedroom', 'living', 'dining', 'office'];
        const habitableRooms = rooms.filter((r) => habitableTypes.includes(r.type.toLowerCase()));

        if (habitableRooms.length === 0) {
          record = createInsufficientDataRecord(req, source, currentGeomHash, nowIso, {
            habitableRoomsCount: 0,
          }, 'No habitable rooms (living, dining, bedrooms, office) identified on the floor plan.');
          break;
        }

        // IRC R304.1: min 70 sq ft (6.5 m²) for all, at least one >= 120 sq ft (11 m²)
        const minSingleRoomAreaFt = 70;
        const minPrimaryRoomAreaFt = 120;
        const minSingleLocal = project.unit === 'metres' ? 6.5 : minSingleRoomAreaFt;
        const minPrimaryLocal = project.unit === 'metres' ? 11.0 : minPrimaryRoomAreaFt;

        const substandardRooms = habitableRooms.filter((r) => r.width * r.length < minSingleLocal - 0.1);
        const maxHabitableArea = Math.max(...habitableRooms.map((r) => r.width * r.length));
        const hasPrimary120 = maxHabitableArea >= minPrimaryLocal - 0.1;

        const passes = substandardRooms.length === 0 && hasPrimary120;

        let reason = '';
        if (passes) {
          reason = `All ${habitableRooms.length} habitable rooms meet minimum ${minSingleLocal} ${unitAreaSuffix}, and primary living space reaches ${maxHabitableArea.toFixed(1)} ${unitAreaSuffix} (>= ${minPrimaryLocal} ${unitAreaSuffix}).`;
        } else {
          const errors: string[] = [];
          if (substandardRooms.length > 0) {
            errors.push(`${substandardRooms.length} room(s) [${substandardRooms.map((r) => `${r.name}: ${(r.width * r.length).toFixed(1)} ${unitAreaSuffix}`).join(', ')}] are below ${minSingleLocal} ${unitAreaSuffix}`);
          }
          if (!hasPrimary120) {
            errors.push(`no primary habitable room reaches the required ${minPrimaryLocal} ${unitAreaSuffix} (largest is ${maxHabitableArea.toFixed(1)} ${unitAreaSuffix})`);
          }
          reason = `Habitable room area violation: ${errors.join('; ')}.`;
        }

        record = {
          requirementId: req.id,
          status: passes ? 'pass' : 'conflict',
          statusReason: reason,
          inputsCaptured: {
            habitableRoomsCount: habitableRooms.length,
            substandardCount: substandardRooms.length,
            largestRoomArea: maxHabitableArea,
            requiredSingleMin: minSingleLocal,
            requiredPrimaryMin: minPrimaryLocal,
            unit: unitAreaSuffix,
          },
          measuredValue: `Min room: ${Math.min(...habitableRooms.map((r) => r.width * r.length)).toFixed(1)} / Max: ${maxHabitableArea.toFixed(1)} ${unitAreaSuffix}`,
          thresholdValue: `Min: ${minSingleLocal} / Primary: ${minPrimaryLocal} ${unitAreaSuffix}`,
          unit: unitAreaSuffix,
          sourceVersion: source.edition,
          evaluatedAt: nowIso,
          evaluatorEngine: REGULATORY_ENGINE_VERSION,
          geometryHashAtEval: currentGeomHash,
          isStale: false,
          actionNeeded: passes
            ? 'Room areas comply with IRC R304.1.'
            : 'Enlarge substandard rooms to meet statutory clear floor area minimums.',
          remedySuggestion: passes ? undefined : 'Resize rooms in 2D Floor Plan editor.',
        };
        break;
      }

      // 7. Habitable Room Minimum Horizontal Dimension
      case 'req-habitable-room-min-dimension': {
        if (rooms.length === 0) {
          record = createInsufficientDataRecord(req, source, currentGeomHash, nowIso, {
            placedRoomsCount: 0,
          }, 'No rooms placed on the floor plan.');
          break;
        }

        const habitableTypes = ['bedroom', 'living', 'dining', 'office'];
        const habitableRooms = rooms.filter((r) => habitableTypes.includes(r.type.toLowerCase()));

        if (habitableRooms.length === 0) {
          record = createInsufficientDataRecord(req, source, currentGeomHash, nowIso, {
            habitableRoomsCount: 0,
          }, 'No habitable rooms placed.');
          break;
        }

        const minDimFt = 7;
        const minDimLocal = project.unit === 'metres' ? 2.13 : minDimFt;

        const narrowRooms = habitableRooms.filter(
          (r) => r.width < minDimLocal - 0.05 || r.length < minDimLocal - 0.05
        );
        const passes = narrowRooms.length === 0;

        record = {
          requirementId: req.id,
          status: passes ? 'pass' : 'conflict',
          statusReason: passes
            ? `All ${habitableRooms.length} habitable rooms maintain horizontal width and length dimensions >= ${minDimLocal} ${unitSuffix}.`
            : `Dimension violation: ${narrowRooms.length} room(s) [${narrowRooms.map((r) => `${r.name}: ${r.width.toFixed(1)}×${r.length.toFixed(1)} ${unitSuffix}`).join(', ')}] have a width or length under ${minDimLocal} ${unitSuffix}.`,
          inputsCaptured: {
            narrowRoomsCount: narrowRooms.length,
            minRequiredDimension: minDimLocal,
            unit: unitSuffix,
          },
          measuredValue: passes ? `All >= ${minDimLocal} ${unitSuffix}` : `${narrowRooms.length} rooms narrow`,
          thresholdValue: `${minDimLocal} ${unitSuffix}`,
          unit: unitSuffix,
          sourceVersion: source.edition,
          evaluatedAt: nowIso,
          evaluatorEngine: REGULATORY_ENGINE_VERSION,
          geometryHashAtEval: currentGeomHash,
          isStale: false,
          actionNeeded: passes
            ? 'Horizontal clear dimensions compliant.'
            : `Widen narrow rooms to at least ${minDimLocal} ${unitSuffix} in both dimensions.`,
        };
        break;
      }

      // 8. Sanitary Facilities
      case 'req-sanitary-facilities': {
        const configuredBaths = project.rooms.bathrooms || 0;
        const placedBaths = rooms.filter((r) => r.type === 'bathroom').length;
        const totalBaths = Math.max(configuredBaths, placedBaths);
        const passes = totalBaths >= 1;

        record = {
          requirementId: req.id,
          status: passes ? 'pass' : 'conflict',
          statusReason: passes
            ? `Dwelling unit provides ${totalBaths} sanitary bathroom space(s), fulfilling IRC R306.1 requirements.`
            : 'Sanitary facilities missing: No bathroom space is configured or placed in the project model.',
          inputsCaptured: {
            configuredBaths,
            placedBaths,
            totalBaths,
          },
          measuredValue: `${totalBaths} bathroom(s)`,
          thresholdValue: '>= 1 bathroom',
          unit: 'spaces',
          sourceVersion: source.edition,
          evaluatedAt: nowIso,
          evaluatorEngine: REGULATORY_ENGINE_VERSION,
          geometryHashAtEval: currentGeomHash,
          isStale: false,
          actionNeeded: passes ? 'Sanitary provision satisfied.' : 'Add at least one bathroom to the project brief and floor plan.',
        };
        break;
      }

      // 9. Sleeping Room Egress
      case 'req-sleeping-room-egress': {
        const bedrooms = rooms.filter((r) => r.type === 'bedroom');
        if (bedrooms.length === 0) {
          record = {
            requirementId: req.id,
            status: 'not-applicable',
            statusReason: 'No sleeping rooms / bedrooms are currently configured in this floor plan model.',
            inputsCaptured: { bedroomCount: 0 },
            sourceVersion: source.edition,
            evaluatedAt: nowIso,
            evaluatorEngine: REGULATORY_ENGINE_VERSION,
            geometryHashAtEval: currentGeomHash,
            isStale: false,
            actionNeeded: 'Not applicable until bedrooms are added to the floor plan.',
          };
          break;
        }

        // Check if each bedroom has at least one edge along the building exterior
        // A room has an exterior wall if its minX, maxX, minY, or maxY coincides with the outer envelope bounds of its floor
        const interiorBedrooms: FloorPlanRoom[] = [];
        bedrooms.forEach((br) => {
          const floorRooms = rooms.filter((r) => (r.floorLevel || 1) === (br.floorLevel || 1));
          const floorMinX = Math.min(...floorRooms.map((r) => r.x));
          const floorMaxX = Math.max(...floorRooms.map((r) => r.x + r.width));
          const floorMinY = Math.min(...floorRooms.map((r) => r.y));
          const floorMaxY = Math.max(...floorRooms.map((r) => r.y + r.length));

          const touchesExterior =
            Math.abs(br.x - floorMinX) < 0.1 ||
            Math.abs(br.x + br.width - floorMaxX) < 0.1 ||
            Math.abs(br.y - floorMinY) < 0.1 ||
            Math.abs(br.y + br.length - floorMaxY) < 0.1;

          if (!touchesExterior) {
            interiorBedrooms.push(br);
          }
        });

        const passes = interiorBedrooms.length === 0;

        record = {
          requirementId: req.id,
          status: passes ? 'pass' : 'conflict',
          statusReason: passes
            ? `All ${bedrooms.length} sleeping room(s) border an exterior building envelope face, facilitating mandatory emergency escape/rescue window openings.`
            : `Landlocked sleeping room detected: ${interiorBedrooms.map((r) => r.name).join(', ')} is completely enclosed by interior partitions without direct exterior wall frontage for egress.`,
          inputsCaptured: {
            bedroomCount: bedrooms.length,
            interiorBedroomCount: interiorBedrooms.length,
          },
          measuredValue: passes ? 'All bedrooms perimeter-facing' : `${interiorBedrooms.length} landlocked bedroom(s)`,
          thresholdValue: '100% exterior frontage',
          unit: 'ratio',
          sourceVersion: source.edition,
          evaluatedAt: nowIso,
          evaluatorEngine: REGULATORY_ENGINE_VERSION,
          geometryHashAtEval: currentGeomHash,
          isStale: false,
          actionNeeded: passes
            ? 'Ensure window opening clear net area meets 5.7 sq ft (0.5 m²) during fenestration design.'
            : 'Relocate interior bedrooms to perimeter walls to provide required egress windows.',
        };
        break;
      }

      // 10. Structural Review
      case 'req-structural-engineer-review': {
        const declaredFloors = project.floors || 1;
        const maxSpan = rooms.length > 0 ? Math.max(...rooms.map((r) => Math.max(r.width, r.length))) : 0;
        const requiresSpecialReview = declaredFloors > 2 || maxSpan > 20;

        record = {
          requirementId: req.id,
          status: 'needs-review',
          statusReason: `Professional structural review required: Building has ${declaredFloors} floor(s) with maximum room clear span of ${maxSpan.toFixed(1)} ${unitSuffix}. ${requiresSpecialReview ? 'Notice: Spans >20 ft or >2 floors require stamped engineered calculations prior to permit issuance.' : 'Standard light-frame prescriptive span limits apply.'}`,
          inputsCaptured: {
            floors: declaredFloors,
            maxSpan,
            unit: unitSuffix,
            requiresSpecialReview,
          },
          measuredValue: `${declaredFloors} fl, ${maxSpan.toFixed(1)} ${unitSuffix} span`,
          thresholdValue: 'Licensed Professional Seal',
          sourceVersion: source.edition,
          evaluatedAt: nowIso,
          evaluatorEngine: REGULATORY_ENGINE_VERSION,
          geometryHashAtEval: currentGeomHash,
          isStale: false,
          actionNeeded: 'Engage licensed structural engineer (PE/SE) to calculate gravity, seismic, and lateral wind loads.',
        };
        break;
      }

      // 11. Geotechnical Investigation
      case 'req-geotech-soil-investigation': {
        const slope = siteContext.slope;
        const isSteep = slope === 'moderate-5-to-10-pct' || slope === 'steep-over-10-pct';

        record = {
          requirementId: req.id,
          status: 'needs-review',
          statusReason: `Geotechnical foundation assessment required. Site topography is classified as "${slope.replace(/-/g, ' ')}". ${isSteep ? 'Steep slope requires site-specific borehole logs and slope stability analysis.' : 'Presumptive 1,500 psf soil bearing capacity may apply subject to building official verification.'}`,
          inputsCaptured: {
            slope,
            slopeDirection: siteContext.slopeDirection,
            levelDifferenceEstimate: siteContext.levelDifferenceEstimate || 0,
          },
          measuredValue: `Slope: ${slope}`,
          thresholdValue: 'Soils Engineer Sign-off',
          sourceVersion: source.edition,
          evaluatedAt: nowIso,
          evaluatorEngine: REGULATORY_ENGINE_VERSION,
          geometryHashAtEval: currentGeomHash,
          isStale: false,
          actionNeeded: 'Obtain site geotechnical investigation or local authority presumptive bearing confirmation.',
        };
        break;
      }

      // Custom requirement fallback
      default: {
        record = {
          requirementId: req.id,
          status: req.isDiscretionary ? 'needs-review' : 'not-assessed',
          statusReason: `Custom requirement "${req.title}". Requires site-specific verification against ${req.clauseReference}.`,
          inputsCaptured: {},
          sourceVersion: source.edition,
          evaluatedAt: nowIso,
          evaluatorEngine: REGULATORY_ENGINE_VERSION,
          geometryHashAtEval: currentGeomHash,
          isStale: false,
          actionNeeded: 'Review requirement documentation with project team.',
        };
      }
    }

    // Check if reviewer has recorded an override
    const decision = state.reviewerDecisions.find((d) => d.requirementId === req.id);
    if (decision) {
      if (decision.decision === 'exempted') {
        record.status = 'not-applicable';
        record.statusReason += ` [Reviewer Exemption: ${decision.notes} (By ${decision.reviewer})]`;
      } else if (decision.decision === 'accepted-with-conditions') {
        record.statusReason += ` [Conditional Acceptance: ${decision.notes} (By ${decision.reviewer})]`;
      }
    }

    evaluations.push(record);
  });

  // Calculate summary counts
  const counts = {
    pass: evaluations.filter((e) => e.status === 'pass').length,
    conflict: evaluations.filter((e) => e.status === 'conflict').length,
    needsReview: evaluations.filter((e) => e.status === 'needs-review').length,
    insufficientData: evaluations.filter((e) => e.status === 'insufficient-data').length,
    notApplicable: evaluations.filter((e) => e.status === 'not-applicable').length,
    unverifiedRule: evaluations.filter((e) => e.status === 'unverified-rule').length,
    notAssessed: evaluations.filter((e) => e.status === 'not-assessed').length,
    total: evaluations.length,
  };

  const activeConflicts = evaluations.filter((e) => e.status === 'conflict');
  const pendingReviews = evaluations.filter((e) => e.status === 'needs-review');
  const missingInputs = evaluations.filter((e) => e.status === 'insufficient-data');

  return {
    profile: state.profile,
    activeRulePack: state.activeRulePack,
    timestamp: nowIso,
    geometryHash: currentGeomHash,
    isStale: isGeometryStale,
    staleReasons,
    counts,
    evaluations,
    activeConflicts,
    pendingReviews,
    missingInputs,
    statutoryDisclaimer: STATUTORY_LIMITATION_DISCLAIMER,
  };
}

function createInsufficientDataRecord(
  req: RegulatoryRequirementItem,
  source: RegulatorySourceRecord,
  geometryHash: string,
  nowIso: string,
  inputs: Record<string, string | number | boolean | null>,
  reason: string
): RequirementEvaluationRecord {
  return {
    requirementId: req.id,
    status: 'insufficient-data',
    statusReason: `Insufficient project data: ${reason}`,
    inputsCaptured: inputs,
    sourceVersion: source.edition,
    evaluatedAt: nowIso,
    evaluatorEngine: REGULATORY_ENGINE_VERSION,
    geometryHashAtEval: geometryHash,
    isStale: false,
    actionNeeded: `Supply missing inputs (${req.requiredInputs.join(', ')}) in project specification to evaluate this requirement.`,
  };
}

/**
 * Re-runs assessment and saves the evaluation record and history to the project.
 */
export function recordProjectRegulatoryAssessment(
  project: Project,
  summary: RegulatoryEvaluationSummary
): Project {
  const currentRegs = initializeProjectRegulations(project);
  const historyEntry: AssessmentHistoryRecord = {
    id: `eval-hist-${Date.now()}`,
    timestamp: summary.timestamp,
    geometryHash: summary.geometryHash,
    summary: { ...summary.counts },
    staleCount: summary.isStale ? 1 : 0,
  };

  const evalMap: Record<string, RequirementEvaluationRecord> = {};
  summary.evaluations.forEach((e) => {
    evalMap[e.requirementId] = e;
  });

  const updatedRegs: RegulatoryState = {
    ...currentRegs,
    lastEvaluatedAt: summary.timestamp,
    lastEvaluatedGeometryHash: summary.geometryHash,
    evaluations: evalMap,
    history: [historyEntry, ...(currentRegs.history || [])].slice(0, 15), // keep last 15 runs
  };

  return {
    ...project,
    regulations: updatedRegs,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Adds a reviewer decision (e.g. variance requested, conditional signoff).
 */
export function addReviewerDecision(
  project: Project,
  decision: Omit<ReviewerDecision, 'id' | 'timestamp'>
): Project {
  const currentRegs = initializeProjectRegulations(project);
  const newDecision: ReviewerDecision = {
    ...decision,
    id: `rev-dec-${Date.now()}`,
    timestamp: new Date().toISOString(),
  };

  const updatedRegs: RegulatoryState = {
    ...currentRegs,
    reviewerDecisions: [newDecision, ...(currentRegs.reviewerDecisions || [])],
  };

  return {
    ...project,
    regulations: updatedRegs,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Adds a new custom source to the project register.
 */
export function addRegulatorySource(
  project: Project,
  source: RegulatorySourceRecord
): Project {
  const currentRegs = initializeProjectRegulations(project);
  const updatedSources = [...currentRegs.sources.filter((s) => s.id !== source.id), source];

  return {
    ...project,
    regulations: {
      ...currentRegs,
      sources: updatedSources,
    },
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Exports regulatory evaluation to CSV.
 */
export function generateRegulatoryComplianceCSV(
  project: Project,
  summary: RegulatoryEvaluationSummary
): string {
  const rows: string[][] = [
    [
      'Requirement ID',
      'Title',
      'Clause Reference',
      'Source Edition',
      'Status',
      'Measured Value',
      'Statutory Threshold',
      'Unit',
      'Status Reason',
      'Action Needed',
    ],
  ];

  const reqMap = new Map([
    ...DEFAULT_REGULATORY_REQUIREMENTS,
    ...(project.regulations?.customRequirements || []),
  ].map((r) => [r.id, r]));

  summary.evaluations.forEach((e) => {
    const def = reqMap.get(e.requirementId);
    rows.push([
      e.requirementId,
      `"${(def?.title || e.requirementId).replace(/"/g, '""')}"`,
      `"${(def?.clauseReference || '').replace(/"/g, '""')}"`,
      `"${e.sourceVersion.replace(/"/g, '""')}"`,
      e.status.toUpperCase(),
      `"${String(e.measuredValue || 'N/A').replace(/"/g, '""')}"`,
      `"${String(e.thresholdValue || 'N/A').replace(/"/g, '""')}"`,
      e.unit || '',
      `"${e.statusReason.replace(/"/g, '""')}"`,
      `"${e.actionNeeded.replace(/"/g, '""')}"`,
    ]);
  });

  return rows.map((r) => r.join(',')).join('\n');
}

/**
 * Exports clean Markdown report for the Regulatory Assessment.
 */
export function generateRegulatoryMarkdownReport(
  project: Project,
  summary: RegulatoryEvaluationSummary
): string {
  const lines: string[] = [];
  lines.push(`# PLOTIFY — BUILDING REGULATIONS INTELLIGENCE ASSESSMENT`);
  lines.push(`**Project:** ${project.name} (ID: \`${project.id}\`)`);
  lines.push(`**Generated:** ${new Date(summary.timestamp).toUTCString()}`);
  lines.push(`**Source Geometry Hash:** \`${summary.geometryHash}\``);
  lines.push(`**Engine Version:** ${REGULATORY_ENGINE_VERSION}`);
  lines.push(``);
  lines.push(`---`);
  lines.push(``);
  lines.push(`## 1. Regulatory Project Profile`);
  lines.push(`- **Jurisdiction:** ${summary.profile.country}, ${summary.profile.region} (${summary.profile.localAuthority})`);
  lines.push(`- **Authority Having Jurisdiction (AHJ):** ${summary.profile.ahj}`);
  lines.push(`- **Building Use:** ${summary.profile.buildingUse}`);
  lines.push(`- **Occupancy Classification:** ${summary.profile.occupancyClassification}`);
  lines.push(`- **Approval Pathway:** ${summary.profile.approvalPathway.replace(/-/g, ' ').toUpperCase()}`);
  lines.push(`- **Active Rule Pack:** \`${summary.activeRulePack}\``);
  lines.push(`- **Responsible Reviewer:** ${summary.profile.responsibleReviewer}`);
  lines.push(``);
  lines.push(`---`);
  lines.push(``);
  lines.push(`## 2. Compliance Evaluation Summary`);
  lines.push(`| Status | Count | Meaning |`);
  lines.push(`|:---|:---:|:---|`);
  lines.push(`| **Pass** | ${summary.counts.pass} | Requirement evaluated against verified project inputs and satisfied. |`);
  lines.push(`| **Conflict** | ${summary.counts.conflict} | Input measurements violate the statutory or zoning requirement. |`);
  lines.push(`| **Needs Review** | ${summary.counts.needsReview} | Professional judgment, site investigation, or engineer stamp required. |`);
  lines.push(`| **Insufficient Data** | ${summary.counts.insufficientData} | Essential measurements (e.g. plot dimensions, placed rooms) missing. |`);
  lines.push(`| **Unverified Rule** | ${summary.counts.unverifiedRule} | Source or rule not verified as adopted in this jurisdiction. |`);
  lines.push(`| **Not Applicable** | ${summary.counts.notApplicable} | Excluded by documented project scope conditions. |`);
  lines.push(`| **Not Assessed** | ${summary.counts.notAssessed} | Specialized check outside preliminary architectural layout scope. |`);
  lines.push(`| **TOTAL REQUIREMENTS** | **${summary.counts.total}** | Comprehensive code checks evaluated. |`);
  lines.push(``);

  if (summary.isStale) {
    lines.push(`> ⚠️ **STALENESS WARNING:** This assessment is stale. Floor plan geometry or project parameters have changed since this evaluation was run.`);
    lines.push(``);
  }

  if (summary.activeConflicts.length > 0) {
    lines.push(`---`);
    lines.push(``);
    lines.push(`## 3. Active Regulatory Conflicts`);
    summary.activeConflicts.forEach((c, idx) => {
      lines.push(`### 3.${idx + 1} Conflict: \`${c.requirementId}\``);
      lines.push(`- **Reason:** ${c.statusReason}`);
      lines.push(`- **Measured vs Threshold:** ${c.measuredValue || 'N/A'} (Required: ${c.thresholdValue || 'N/A'})`);
      lines.push(`- **Action Needed:** ${c.actionNeeded}`);
      lines.push(``);
    });
  }

  lines.push(`---`);
  lines.push(``);
  lines.push(`## 4. Statutory Professional Limitations Disclaimer`);
  lines.push(`> ${summary.statutoryDisclaimer}`);
  lines.push(``);
  lines.push(`*Plotify AI-Powered Architectural Intelligence — Engine ${REGULATORY_ENGINE_VERSION}*`);

  return lines.join('\n');
}
