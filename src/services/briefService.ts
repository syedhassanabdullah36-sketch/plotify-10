import { Project, FloorPlanRoom, MeasurementUnit } from '../types/project';
import {
  ArchitecturalBriefData,
  SpaceRequirement,
  SpatialRelationshipRule,
  SpaceProgramSummary,
  SpacePlacementComparison,
  BriefValidationNotice,
  BriefApprovalStatus,
  BriefRevisionRecord,
  BuildingUseClassification,
} from '../types/brief';

export const BRIEF_ENGINE_VERSION = 'v1.0.0';

/**
 * Standard baseline unit-aware space definitions
 */
function getDefaultSpaceAreas(unit: MeasurementUnit) {
  const isFeet = unit === 'feet';
  return {
    living: isFeet ? 260 : 24,
    dining: isFeet ? 160 : 15,
    kitchen: isFeet ? 150 : 14,
    masterBedroom: isFeet ? 200 : 19,
    bedroom: isFeet ? 140 : 13,
    ensuiteBath: isFeet ? 60 : 5.5,
    familyBath: isFeet ? 50 : 4.5,
    powderRoom: isFeet ? 30 : 2.8,
    homeOffice: isFeet ? 120 : 11,
    laundry: isFeet ? 45 : 4.2,
    storage: isFeet ? 40 : 3.7,
    garage: isFeet ? 240 : 22,
    balcony: isFeet ? 80 : 7.5,
    entryVestibule: isFeet ? 50 : 4.6,
  };
}

/**
 * Pre-configured Architectural Brief Templates
 */
export function getBriefTemplates(unit: MeasurementUnit): Array<{
  id: string;
  name: string;
  category: BuildingUseClassification;
  description: string;
  brief: Partial<ArchitecturalBriefData>;
}> {
  const areas = getDefaultSpaceAreas(unit);

  return [
    {
      id: 'family-residence-4bed',
      name: 'Contemporary Family Residence (4 Bed)',
      category: 'residential',
      description: 'Balanced family living with dedicated master suite, guest room, study, and seamless indoor-outdoor connectivity.',
      brief: {
        objectives: {
          primaryPurpose: 'Single-family primary residence with multi-generational flexibility',
          buildingUse: 'residential',
          intendedUsers: 'Family of 4-5 plus occasional visiting grandparents',
          mainActivities: 'Daily cooking, gathering, quiet homework/study, remote work, garden recreation',
          desiredOutcomes: 'High daylight quality, acoustic isolation for bedrooms, low thermal bridging',
          projectStage: 'Schematic Design',
          designLifeYears: 60,
        },
        occupancy: {
          regularOccupants: 4,
          occasionalVisitors: 2,
          occupancyPattern: 'Full-time family occupancy, weekday school/work schedule, weekend hosting',
          userGroupNeeds: 'Separate work-from-home study; step-free ground floor powder room; safe play line-of-sight',
          futureExpansionNeeds: 'Potential loft or attic conversion in 8-10 years',
          accessibilityNotes: 'Step-free ground level entrance and wide 36-inch (910mm) circulation doors',
        },
        preferences: {
          spatialCharacter: 'Warm contemporary open-plan kitchen and dining with sunken or acoustic-separated formal lounge',
          indoorOutdoorRelationship: 'Expansive sliding glazed doors opening directly onto sheltered south-facing garden patio',
          naturalLightPriorities: 'Morning light in kitchen and breakfast nook; soft diffused north light for home office',
          storagePriorities: 'Concealed hallway cloakroom, walk-in kitchen pantry, built-in bedroom wardrobes',
          circulationPreferences: 'Compact central stair core to minimise wasted hallway area (<12%)',
          materialPreferences: 'Natural timber accents, lime-wash plastered walls, energy-efficient triple glazing',
        },
        constraints: {
          siteRestrictionsSummary: 'Governed by local zoning setbacks and solar shading envelope',
          structuralAssumptions: 'Engineered timber framing or reinforced masonry ground floor',
          knownMandatoryRequirements: [
            'All habitable bedrooms must have direct exterior daylight and operable ventilation',
            'Minimum 2 dedicated parking bays on site',
            'Full acoustic barrier between living room and ground floor guest room',
          ],
          accessibilityMandatory: true,
          unresolvedQuestions: [
            'Client confirmation on ground-floor vs first-floor master suite preference',
            'Local council maximum roof ridgeline height restriction',
          ],
        },
        circulationWallAllowancePercent: 15,
        spaces: [
          {
            id: 'sp-entry',
            name: 'Entry Foyer & Cloaks',
            category: 'circulation',
            targetArea: areas.entryVestibule,
            minArea: Math.round(areas.entryVestibule * 0.8),
            maxArea: Math.round(areas.entryVestibule * 1.3),
            quantity: 1,
            floorPreference: 1,
            priority: 'mandatory',
            privacyLevel: 'public',
            occupantCapacity: 3,
            naturalLightRequired: true,
            plumbingRequired: false,
            outdoorAccessRequired: true,
            acousticPrivacyRequired: false,
            wheelchairAccessible: true,
            notes: 'Welcoming transition with integrated shoe bench and coat storage',
          },
          {
            id: 'sp-living',
            name: 'Main Living Lounge',
            category: 'living',
            targetArea: areas.living,
            minArea: Math.round(areas.living * 0.85),
            maxArea: Math.round(areas.living * 1.35),
            quantity: 1,
            floorPreference: 1,
            priority: 'mandatory',
            privacyLevel: 'public',
            occupantCapacity: 8,
            naturalLightRequired: true,
            plumbingRequired: false,
            outdoorAccessRequired: true,
            acousticPrivacyRequired: true,
            wheelchairAccessible: true,
            notes: 'Comfortable family gathering, garden views, media wall',
          },
          {
            id: 'sp-kitchen-dining',
            name: 'Open Kitchen & Dining Area',
            category: 'service',
            targetArea: areas.kitchen + areas.dining,
            minArea: Math.round((areas.kitchen + areas.dining) * 0.85),
            maxArea: Math.round((areas.kitchen + areas.dining) * 1.3),
            quantity: 1,
            floorPreference: 1,
            priority: 'mandatory',
            privacyLevel: 'semi-private',
            occupantCapacity: 8,
            naturalLightRequired: true,
            plumbingRequired: true,
            outdoorAccessRequired: true,
            acousticPrivacyRequired: false,
            wheelchairAccessible: true,
            notes: 'Central island bench, pantry zone, table seating for 8',
          },
          {
            id: 'sp-master-suite',
            name: 'Master Suite & Ensuite',
            category: 'sleeping',
            targetArea: areas.masterBedroom + areas.ensuiteBath,
            minArea: Math.round((areas.masterBedroom + areas.ensuiteBath) * 0.85),
            maxArea: Math.round((areas.masterBedroom + areas.ensuiteBath) * 1.3),
            quantity: 1,
            floorPreference: 'any',
            priority: 'mandatory',
            privacyLevel: 'private',
            occupantCapacity: 2,
            naturalLightRequired: true,
            plumbingRequired: true,
            outdoorAccessRequired: false,
            acousticPrivacyRequired: true,
            wheelchairAccessible: true,
            notes: 'Private acoustic haven, walk-through wardrobe, private bathroom',
          },
          {
            id: 'sp-secondary-beds',
            name: 'Secondary Bedrooms',
            category: 'sleeping',
            targetArea: areas.bedroom,
            minArea: Math.round(areas.bedroom * 0.85),
            maxArea: Math.round(areas.bedroom * 1.25),
            quantity: 3,
            floorPreference: 'any',
            priority: 'mandatory',
            privacyLevel: 'private',
            occupantCapacity: 1,
            naturalLightRequired: true,
            plumbingRequired: false,
            outdoorAccessRequired: false,
            acousticPrivacyRequired: true,
            wheelchairAccessible: true,
            notes: 'Children / guest rooms with study desk space and built-in closet',
          },
          {
            id: 'sp-family-bath',
            name: 'Family Bathroom',
            category: 'hygiene',
            targetArea: areas.familyBath,
            minArea: Math.round(areas.familyBath * 0.85),
            maxArea: Math.round(areas.familyBath * 1.3),
            quantity: 1,
            floorPreference: 'any',
            priority: 'mandatory',
            privacyLevel: 'private',
            occupantCapacity: 1,
            naturalLightRequired: true,
            plumbingRequired: true,
            outdoorAccessRequired: false,
            acousticPrivacyRequired: true,
            wheelchairAccessible: true,
            notes: 'Full bathtub, walk-in shower, double basin vanity',
          },
          {
            id: 'sp-powder',
            name: 'Ground Guest Powder Room',
            category: 'hygiene',
            targetArea: areas.powderRoom,
            minArea: Math.round(areas.powderRoom * 0.8),
            maxArea: Math.round(areas.powderRoom * 1.4),
            quantity: 1,
            floorPreference: 1,
            priority: 'high-priority',
            privacyLevel: 'semi-private',
            occupantCapacity: 1,
            naturalLightRequired: false,
            plumbingRequired: true,
            outdoorAccessRequired: false,
            acousticPrivacyRequired: true,
            wheelchairAccessible: true,
            notes: 'Accessible guest WC near entrance and living zones',
          },
          {
            id: 'sp-home-office',
            name: 'Dedicated Home Office / Library',
            category: 'work',
            targetArea: areas.homeOffice,
            minArea: Math.round(areas.homeOffice * 0.8),
            maxArea: Math.round(areas.homeOffice * 1.3),
            quantity: 1,
            floorPreference: 'any',
            priority: 'high-priority',
            privacyLevel: 'private',
            occupantCapacity: 2,
            naturalLightRequired: true,
            plumbingRequired: false,
            outdoorAccessRequired: false,
            acousticPrivacyRequired: true,
            wheelchairAccessible: true,
            notes: 'Quiet video-conferencing zone with direct daylight',
          },
          {
            id: 'sp-utility-laundry',
            name: 'Utility, Laundry & Storage',
            category: 'service',
            targetArea: areas.laundry + areas.storage,
            minArea: Math.round((areas.laundry + areas.storage) * 0.8),
            maxArea: Math.round((areas.laundry + areas.storage) * 1.3),
            quantity: 1,
            floorPreference: 1,
            priority: 'preferred',
            privacyLevel: 'private',
            occupantCapacity: 1,
            naturalLightRequired: false,
            plumbingRequired: true,
            outdoorAccessRequired: true,
            acousticPrivacyRequired: true,
            wheelchairAccessible: true,
            notes: 'Direct exterior side yard access for clothes drying and muddy boots',
          },
        ],
        relationships: [
          {
            id: 'rel-1',
            sourceSpaceId: 'sp-entry',
            targetSpaceId: 'sp-living',
            relationType: 'direct-access',
            priority: 'mandatory',
            notes: 'Direct welcoming flow from entry to living',
          },
          {
            id: 'rel-2',
            sourceSpaceId: 'sp-kitchen-dining',
            targetSpaceId: 'sp-living',
            relationType: 'adjacent',
            priority: 'high-priority',
            notes: 'Visual connectivity between culinary preparation and social areas',
          },
          {
            id: 'rel-3',
            sourceSpaceId: 'sp-master-suite',
            targetSpaceId: 'sp-living',
            relationType: 'separated',
            priority: 'mandatory',
            notes: 'Sleeping quarters must be acoustically and visually buffered from living spaces',
          },
          {
            id: 'rel-4',
            sourceSpaceId: 'sp-kitchen-dining',
            targetSpaceId: 'sp-utility-laundry',
            relationType: 'adjacent',
            priority: 'preferred',
            notes: 'Convenient back-of-house service connection',
          },
        ],
      },
    },
    {
      id: 'urban-townhouse-livework',
      name: 'Urban Live-Work Townhouse',
      category: 'mixed-use',
      description: 'Vertical urban living featuring ground floor client-facing studio / office and upper private duplex residence.',
      brief: {
        objectives: {
          primaryPurpose: 'Live-work hybrid with street-facing professional studio and secluded upper home',
          buildingUse: 'mixed-use',
          intendedUsers: 'Creative professional / consultant couple with client appointments',
          mainActivities: 'Client meetings, digital production, residential cooking and relaxation',
          desiredOutcomes: 'Clear zoning between professional visitor access and private residential sanctuary',
          projectStage: 'Concept Feasibility',
          designLifeYears: 50,
        },
        occupancy: {
          regularOccupants: 2,
          occasionalVisitors: 5,
          occupancyPattern: 'Business hours weekday client visits on ground level; private residence evening and weekends',
          userGroupNeeds: 'Separate business entrance and client restroom',
          futureExpansionNeeds: 'Flexibility to convert studio into ground-floor suite or commercial rental',
          accessibilityNotes: 'Ground floor meeting space and restroom must meet universal accessibility standards',
        },
        preferences: {
          spatialCharacter: 'Industrial-minimalist high ceilings, polished concrete ground floor, warm timber upper levels',
          indoorOutdoorRelationship: 'Private rooftop terrace and small internal ground-floor lightwell courtyard',
          naturalLightPriorities: 'Zenithal roof skylights for upper stairwell; storefront glazing for studio',
          storagePriorities: 'Secure archive and equipment storage on ground floor',
          circulationPreferences: 'Acoustically isolated secure stairwell connecting studio to residence',
          materialPreferences: 'Exposed steel structural beams, acoustic felt paneling, dark bronze window frames',
        },
        constraints: {
          siteRestrictionsSummary: 'Narrow urban lot with party walls on both flanks; strict height ceiling',
          structuralAssumptions: 'Steel post-and-beam frame or precast concrete floor slabs for fire separation',
          knownMandatoryRequirements: [
            'Fire-rated 60-minute separation floor between commercial studio and residential level',
            'Independent emergency egress paths',
          ],
          accessibilityMandatory: true,
          unresolvedQuestions: [
            'Zoning approval required for mixed-use commercial occupancy classification',
          ],
        },
        circulationWallAllowancePercent: 18,
        spaces: [
          {
            id: 'sp-commercial-studio',
            name: 'Client Studio & Meeting Room',
            category: 'work',
            targetArea: areas.living,
            minArea: Math.round(areas.living * 0.85),
            maxArea: Math.round(areas.living * 1.3),
            quantity: 1,
            floorPreference: 1,
            priority: 'mandatory',
            privacyLevel: 'public',
            occupantCapacity: 6,
            naturalLightRequired: true,
            plumbingRequired: false,
            outdoorAccessRequired: true,
            acousticPrivacyRequired: true,
            wheelchairAccessible: true,
            notes: 'Street-facing commercial presentation space',
          },
          {
            id: 'sp-client-wc',
            name: 'Accessible Studio Restroom',
            category: 'hygiene',
            targetArea: areas.powderRoom * 1.5,
            minArea: Math.round(areas.powderRoom * 1.2),
            quantity: 1,
            floorPreference: 1,
            priority: 'mandatory',
            privacyLevel: 'public',
            occupantCapacity: 1,
            naturalLightRequired: false,
            plumbingRequired: true,
            outdoorAccessRequired: false,
            acousticPrivacyRequired: true,
            wheelchairAccessible: true,
            notes: 'Universal accessibility compliance for commercial visitors',
          },
          {
            id: 'sp-upper-living',
            name: 'Private Residential Living & Kitchen',
            category: 'living',
            targetArea: areas.living + areas.kitchen,
            quantity: 1,
            floorPreference: 2,
            priority: 'mandatory',
            privacyLevel: 'private',
            occupantCapacity: 4,
            naturalLightRequired: true,
            plumbingRequired: true,
            outdoorAccessRequired: true,
            acousticPrivacyRequired: true,
            wheelchairAccessible: false,
            notes: 'Upper private living with direct access to terrace',
          },
          {
            id: 'sp-upper-bedroom',
            name: 'Upper Bedroom Suites',
            category: 'sleeping',
            targetArea: areas.masterBedroom,
            quantity: 2,
            floorPreference: 2,
            priority: 'mandatory',
            privacyLevel: 'private',
            occupantCapacity: 2,
            naturalLightRequired: true,
            plumbingRequired: false,
            outdoorAccessRequired: false,
            acousticPrivacyRequired: true,
            wheelchairAccessible: false,
            notes: 'Quiet top-floor retreat',
          },
        ],
        relationships: [
          {
            id: 'rel-tw-1',
            sourceSpaceId: 'sp-commercial-studio',
            targetSpaceId: 'sp-upper-living',
            relationType: 'separated',
            priority: 'mandatory',
            notes: 'Strict physical and acoustic separation between work clients and private home',
          },
        ],
      },
    },
    {
      id: 'boutique-office',
      name: 'Creative Collaborative Office',
      category: 'workplace-office',
      description: 'Flexible agile workspace designed for 10-15 knowledge workers with focus pods, boardroom, and social kitchen.',
      brief: {
        objectives: {
          primaryPurpose: 'Headquarters for an architecture/design consultancy',
          buildingUse: 'workplace-office',
          intendedUsers: '12 core team members plus rotating clients and collaborators',
          mainActivities: 'Design modeling, collaborative workshops, client presentations, video calls',
          desiredOutcomes: 'Acoustic comfort, biophilic elements, agile hot-desking, showcase brand identity',
          projectStage: 'Schematic Design',
          designLifeYears: 40,
        },
        occupancy: {
          regularOccupants: 12,
          occasionalVisitors: 8,
          occupancyPattern: 'Weekdays 8am-7pm; occasional weekend events',
          userGroupNeeds: 'Dedicated pin-up walls, sample library storage, acoustic telephone booths',
          futureExpansionNeeds: 'Ability to accommodate 18 workstations via reconfigurable furniture',
          accessibilityNotes: 'Full DDA / ADA barrier-free accessibility throughout ground floor and meeting rooms',
        },
        preferences: {
          spatialCharacter: 'Loft-like open ceiling, acoustic baffles, perimeter desks with central collaboration tables',
          indoorOutdoorRelationship: 'Spill-out courtyard for outdoor lunch and Friday social events',
          naturalLightPriorities: 'Glare-free diffuse illumination on work surfaces; automated shading on south facade',
          storagePriorities: 'Extensive physical material library shelving and 3D print workshop enclosure',
          circulationPreferences: 'Active circulation loop encouraging casual cross-disciplinary interaction',
          materialPreferences: 'Recycled acoustic felt, sustainably harvested timber, low-VOC finishes',
        },
        constraints: {
          siteRestrictionsSummary: 'Commercial zoning compliance, required parking ratio of 1 stall per 300 sq ft',
          structuralAssumptions: 'Exposed structural mass timber or concrete flat slab',
          knownMandatoryRequirements: [
            'Dual compliant fire exit routes',
            'Minimum fresh-air ventilation of 10 L/s per person',
          ],
          accessibilityMandatory: true,
          unresolvedQuestions: [
            'Server room dedicated HVAC unit placement and power load confirmation',
          ],
        },
        circulationWallAllowancePercent: 20,
        spaces: [
          {
            id: 'sp-open-work',
            name: 'Open Studio Workstations (12 Desks)',
            category: 'work',
            targetArea: areas.living * 2,
            quantity: 1,
            floorPreference: 1,
            priority: 'mandatory',
            privacyLevel: 'semi-private',
            occupantCapacity: 14,
            naturalLightRequired: true,
            plumbingRequired: false,
            outdoorAccessRequired: false,
            acousticPrivacyRequired: false,
            wheelchairAccessible: true,
            notes: 'Ergonomic sit-stand desk clusters with perimeter natural lighting',
          },
          {
            id: 'sp-boardroom',
            name: 'Boardroom / Presentation Suite',
            category: 'work',
            targetArea: areas.living,
            quantity: 1,
            floorPreference: 1,
            priority: 'mandatory',
            privacyLevel: 'semi-private',
            occupantCapacity: 10,
            naturalLightRequired: true,
            plumbingRequired: false,
            outdoorAccessRequired: false,
            acousticPrivacyRequired: true,
            wheelchairAccessible: true,
            notes: 'High-spec acoustic attenuation (STC 50+), presentation screen, conference audio',
          },
          {
            id: 'sp-kitchen-social',
            name: 'Staff Cafe & Social Hub',
            category: 'service',
            targetArea: areas.kitchen + areas.dining,
            quantity: 1,
            floorPreference: 1,
            priority: 'high-priority',
            privacyLevel: 'public',
            occupantCapacity: 12,
            naturalLightRequired: true,
            plumbingRequired: true,
            outdoorAccessRequired: true,
            acousticPrivacyRequired: true,
            wheelchairAccessible: true,
            notes: 'Coffee bar, dining bench, informal team breakout zone',
          },
          {
            id: 'sp-focus-pods',
            name: 'Acoustic Phone & Focus Pods',
            category: 'work',
            targetArea: areas.powderRoom * 2,
            quantity: 2,
            floorPreference: 1,
            priority: 'high-priority',
            privacyLevel: 'private',
            occupantCapacity: 1,
            naturalLightRequired: false,
            plumbingRequired: false,
            outdoorAccessRequired: false,
            acousticPrivacyRequired: true,
            wheelchairAccessible: true,
            notes: 'Acoustically sealed single-person video call booths',
          },
        ],
        relationships: [
          {
            id: 'rel-off-1',
            sourceSpaceId: 'sp-kitchen-social',
            targetSpaceId: 'sp-boardroom',
            relationType: 'acoustic-isolated',
            priority: 'mandatory',
            notes: 'Social hub noise must not intrude into client board presentations',
          },
        ],
      },
    },
  ];
}

/**
 * Initializes or normalizes the architectural brief on a project.
 * Preserves existing user inputs and provides intelligent baseline defaults.
 */
export function initializeProjectBrief(project: Project): ArchitecturalBriefData {
  const existing = project.brief;
  const unit = project.unit;
  const areas = getDefaultSpaceAreas(unit);

  // If already present, ensure all structured fields exist cleanly
  if (existing && existing.spaces && existing.spaces.length > 0) {
    return {
      version: existing.version || BRIEF_ENGINE_VERSION,
      lastUpdated: existing.lastUpdated || project.updatedAt || new Date().toISOString(),
      approvalStatus: existing.approvalStatus || 'draft',
      approvalSignoff: existing.approvalSignoff,
      objectives: {
        primaryPurpose: existing.objectives?.primaryPurpose || `${project.name} Architectural Program`,
        buildingUse: existing.objectives?.buildingUse || (project.projectType === 'apartment' ? 'residential' : 'residential'),
        customBuildingUse: existing.objectives?.customBuildingUse,
        intendedUsers: existing.objectives?.intendedUsers || 'Occupants and invited guests',
        mainActivities: existing.objectives?.mainActivities || 'Residential living, relaxation, cooking, sleeping',
        desiredOutcomes: existing.objectives?.desiredOutcomes || 'Optimised spatial efficiency, high environmental comfort, compliance with zoning constraints',
        targetBudget: existing.objectives?.targetBudget ?? project.budget,
        projectStage: existing.objectives?.projectStage || 'Schematic Design',
        designLifeYears: existing.objectives?.designLifeYears ?? 50,
      },
      occupancy: {
        regularOccupants: existing.occupancy?.regularOccupants ?? (project.rooms.bedrooms ? project.rooms.bedrooms * 2 : 4),
        occasionalVisitors: existing.occupancy?.occasionalVisitors ?? 2,
        occupancyPattern: existing.occupancy?.occupancyPattern || 'Permanent year-round residential occupancy',
        userGroupNeeds: existing.occupancy?.userGroupNeeds || 'Family multi-generational accommodation with dedicated private zones',
        futureExpansionNeeds: existing.occupancy?.futureExpansionNeeds || 'Adaptable spatial layout to allow future re-partitioning',
        accessibilityNotes: existing.occupancy?.accessibilityNotes || 'Standard level access on ground floor and accessible circulation paths',
      },
      preferences: {
        spatialCharacter: existing.preferences?.spatialCharacter || 'Contemporary open-plan living with distinct quiet zones',
        indoorOutdoorRelationship: existing.preferences?.indoorOutdoorRelationship || 'Seamless threshold connection to garden and outdoor living areas',
        naturalLightPriorities: existing.preferences?.naturalLightPriorities || 'Direct solar ingress in living rooms; diffuse natural daylight in workspaces',
        storagePriorities: existing.preferences?.storagePriorities || 'Integrated built-in cabinetry to maximise usable floor clear space',
        circulationPreferences: existing.preferences?.circulationPreferences || 'Compact central circulation core to reduce dedicated corridor area',
        materialPreferences: existing.preferences?.materialPreferences || 'Durable, natural, low-maintenance architectural materials',
      },
      constraints: {
        siteRestrictionsSummary: existing.constraints?.siteRestrictionsSummary || (project.siteContext?.generalNotes || project.siteContext?.setbacks?.notes || 'Governed by project plot boundary and setback allowances'),
        structuralAssumptions: existing.constraints?.structuralAssumptions || 'Engineered timber or reinforced concrete frame construction',
        knownMandatoryRequirements: existing.constraints?.knownMandatoryRequirements || [
          'Habitable rooms must receive direct natural light and ventilation',
          'Sanitary facilities must have accessible clearances',
        ],
        budgetCapKnown: existing.constraints?.budgetCapKnown ?? project.budget,
        accessibilityMandatory: existing.constraints?.accessibilityMandatory ?? true,
        sustainabilityGoals: existing.constraints?.sustainabilityGoals || 'Energy efficient thermal envelope and low-carbon construction materials',
        unresolvedQuestions: existing.constraints?.unresolvedQuestions || [],
      },
      spaces: existing.spaces.map((sp, idx) => ({
        ...sp,
        id: sp.id || `space-${idx + 1}`,
        quantity: typeof sp.quantity === 'number' && sp.quantity > 0 ? sp.quantity : 1,
        priority: sp.priority || 'mandatory',
        privacyLevel: sp.privacyLevel || 'semi-private',
      })),
      relationships: existing.relationships || [],
      circulationWallAllowancePercent: existing.circulationWallAllowancePercent ?? 15,
      revisions: existing.revisions || [
        {
          id: 'rev-init',
          versionNumber: 1,
          timestamp: project.createdAt || new Date().toISOString(),
          author: 'Plotify Architecture Engine',
          summaryOfChanges: 'Initial baseline brief synthesis',
          approvalStatus: existing.approvalStatus || 'draft',
        },
      ],
    };
  }

  // Generate intelligent initial brief based on project's room config and type
  const generatedSpaces: SpaceRequirement[] = [];
  let spaceIndex = 1;

  // Living Room
  const livingQty = project.rooms.livingRoom || 1;
  generatedSpaces.push({
    id: `req-living-${spaceIndex++}`,
    name: 'Living Lounge & Gathering',
    category: 'living',
    targetArea: areas.living,
    minArea: Math.round(areas.living * 0.8),
    maxArea: Math.round(areas.living * 1.3),
    quantity: livingQty,
    floorPreference: 1,
    priority: 'mandatory',
    privacyLevel: 'public',
    occupantCapacity: 6,
    naturalLightRequired: true,
    plumbingRequired: false,
    outdoorAccessRequired: true,
    acousticPrivacyRequired: true,
    wheelchairAccessible: true,
    notes: 'Primary social hub with outdoor visual connection',
  });

  // Kitchen
  const kitchenQty = project.rooms.kitchen || 1;
  generatedSpaces.push({
    id: `req-kitchen-${spaceIndex++}`,
    name: 'Kitchen & Meal Preparation',
    category: 'service',
    targetArea: areas.kitchen,
    minArea: Math.round(areas.kitchen * 0.85),
    maxArea: Math.round(areas.kitchen * 1.25),
    quantity: kitchenQty,
    floorPreference: 1,
    priority: 'mandatory',
    privacyLevel: 'semi-private',
    occupantCapacity: 4,
    naturalLightRequired: true,
    plumbingRequired: true,
    outdoorAccessRequired: false,
    acousticPrivacyRequired: false,
    wheelchairAccessible: true,
    notes: 'Culinary prep, cooktop ventilation, food storage pantry zone',
  });

  // Dining Room
  if (project.rooms.diningRoom && project.rooms.diningRoom > 0) {
    generatedSpaces.push({
      id: `req-dining-${spaceIndex++}`,
      name: 'Formal Dining Area',
      category: 'living',
      targetArea: areas.dining,
      minArea: Math.round(areas.dining * 0.85),
      maxArea: Math.round(areas.dining * 1.3),
      quantity: project.rooms.diningRoom,
      floorPreference: 1,
      priority: 'high-priority',
      privacyLevel: 'semi-private',
      occupantCapacity: 8,
      naturalLightRequired: true,
      plumbingRequired: false,
      outdoorAccessRequired: false,
      acousticPrivacyRequired: false,
      wheelchairAccessible: true,
      notes: 'Dedicated seating area for family and guest meals',
    });
  }

  // Master Bedroom
  const totalBedrooms = project.rooms.bedrooms || 3;
  generatedSpaces.push({
    id: `req-masterbed-${spaceIndex++}`,
    name: 'Master Bedroom Suite',
    category: 'sleeping',
    targetArea: areas.masterBedroom,
    minArea: Math.round(areas.masterBedroom * 0.85),
    maxArea: Math.round(areas.masterBedroom * 1.3),
    quantity: 1,
    floorPreference: project.floors > 1 ? 2 : 1,
    priority: 'mandatory',
    privacyLevel: 'private',
    occupantCapacity: 2,
    naturalLightRequired: true,
    plumbingRequired: false,
    outdoorAccessRequired: false,
    acousticPrivacyRequired: true,
    wheelchairAccessible: true,
    notes: 'Principal retreat with wardrobe space and acoustic separation',
  });

  // Secondary Bedrooms
  if (totalBedrooms > 1) {
    generatedSpaces.push({
      id: `req-secbeds-${spaceIndex++}`,
      name: 'Secondary Bedrooms',
      category: 'sleeping',
      targetArea: areas.bedroom,
      minArea: Math.round(areas.bedroom * 0.85),
      maxArea: Math.round(areas.bedroom * 1.25),
      quantity: totalBedrooms - 1,
      floorPreference: project.floors > 1 ? 2 : 'any',
      priority: 'mandatory',
      privacyLevel: 'private',
      occupantCapacity: 1,
      naturalLightRequired: true,
      plumbingRequired: false,
      outdoorAccessRequired: false,
      acousticPrivacyRequired: true,
      wheelchairAccessible: true,
      notes: 'Bedrooms for children, family members or guests',
    });
  }

  // Bathrooms
  const totalBaths = project.rooms.bathrooms || 2;
  generatedSpaces.push({
    id: `req-bathrooms-${spaceIndex++}`,
    name: 'Full Bathroom',
    category: 'hygiene',
    targetArea: areas.familyBath,
    minArea: Math.round(areas.familyBath * 0.85),
    maxArea: Math.round(areas.familyBath * 1.3),
    quantity: totalBaths,
    floorPreference: 'any',
    priority: 'mandatory',
    privacyLevel: 'private',
    occupantCapacity: 1,
    naturalLightRequired: true,
    plumbingRequired: true,
    outdoorAccessRequired: false,
    acousticPrivacyRequired: true,
    wheelchairAccessible: true,
    notes: 'Sanitary facilities with water closets, washbasins, and shower/tub',
  });

  // Home Office / Study
  if (project.rooms.homeOffice && project.rooms.homeOffice > 0) {
    generatedSpaces.push({
      id: `req-office-${spaceIndex++}`,
      name: 'Home Office / Study',
      category: 'work',
      targetArea: areas.homeOffice,
      minArea: Math.round(areas.homeOffice * 0.8),
      maxArea: Math.round(areas.homeOffice * 1.3),
      quantity: project.rooms.homeOffice,
      floorPreference: 'any',
      priority: 'high-priority',
      privacyLevel: 'private',
      occupantCapacity: 2,
      naturalLightRequired: true,
      plumbingRequired: false,
      outdoorAccessRequired: false,
      acousticPrivacyRequired: true,
      wheelchairAccessible: true,
      notes: 'Quiet workspace with natural daylight and power/data',
    });
  }

  // Balcony / Terrace
  if (project.rooms.balcony && project.rooms.balcony > 0) {
    generatedSpaces.push({
      id: `req-balcony-${spaceIndex++}`,
      name: 'Balcony / Covered Terrace',
      category: 'outdoor',
      targetArea: areas.balcony,
      minArea: Math.round(areas.balcony * 0.75),
      maxArea: Math.round(areas.balcony * 1.5),
      quantity: project.rooms.balcony,
      floorPreference: project.floors > 1 ? 2 : 1,
      priority: 'preferred',
      privacyLevel: 'semi-private',
      occupantCapacity: 4,
      naturalLightRequired: true,
      plumbingRequired: false,
      outdoorAccessRequired: true,
      acousticPrivacyRequired: false,
      wheelchairAccessible: true,
      notes: 'Outdoor amenity space with parapet or safety railing',
    });
  }

  // Garage
  if (project.rooms.garage && project.rooms.garage > 0) {
    generatedSpaces.push({
      id: `req-garage-${spaceIndex++}`,
      name: 'Enclosed Garage / Vehicle Bay',
      category: 'service',
      targetArea: areas.garage,
      minArea: Math.round(areas.garage * 0.9),
      maxArea: Math.round(areas.garage * 1.4),
      quantity: project.rooms.garage,
      floorPreference: 1,
      priority: 'high-priority',
      privacyLevel: 'service-access' as any,
      occupantCapacity: 1,
      naturalLightRequired: false,
      plumbingRequired: false,
      outdoorAccessRequired: true,
      acousticPrivacyRequired: true,
      wheelchairAccessible: true,
      notes: 'Secure vehicle storage and workshop area',
    });
  }

  // Storage / Laundry
  if (project.rooms.laundry && project.rooms.laundry > 0) {
    generatedSpaces.push({
      id: `req-laundry-${spaceIndex++}`,
      name: 'Laundry & Utility Room',
      category: 'service',
      targetArea: areas.laundry,
      minArea: Math.round(areas.laundry * 0.8),
      maxArea: Math.round(areas.laundry * 1.3),
      quantity: project.rooms.laundry,
      floorPreference: 1,
      priority: 'preferred',
      privacyLevel: 'private',
      occupantCapacity: 1,
      naturalLightRequired: false,
      plumbingRequired: true,
      outdoorAccessRequired: false,
      acousticPrivacyRequired: true,
      wheelchairAccessible: true,
      notes: 'Washing machine, dryer, linen sorting and sink',
    });
  }

  // Custom rooms if any
  if (project.rooms.customRooms && project.rooms.customRooms.length > 0) {
    for (const cr of project.rooms.customRooms) {
      if (cr.count > 0) {
        generatedSpaces.push({
          id: `req-custom-${spaceIndex++}`,
          name: cr.name,
          category: 'specialized',
          targetArea: areas.homeOffice,
          quantity: cr.count,
          floorPreference: 'any',
          priority: 'preferred',
          privacyLevel: 'semi-private',
          naturalLightRequired: true,
          plumbingRequired: false,
          outdoorAccessRequired: false,
          acousticPrivacyRequired: false,
          wheelchairAccessible: true,
          notes: 'User-specified project space requirement',
        });
      }
    }
  }

  // Basic relationships
  const relationships: SpatialRelationshipRule[] = [
    {
      id: 'rel-gen-1',
      sourceSpaceId: generatedSpaces[0]?.id || 'req-living-1',
      targetSpaceId: generatedSpaces[1]?.id || 'req-kitchen-2',
      relationType: 'adjacent',
      priority: 'high-priority',
      notes: 'Proximity between living social zone and meal preparation',
    },
  ];

  return {
    version: BRIEF_ENGINE_VERSION,
    lastUpdated: new Date().toISOString(),
    approvalStatus: 'draft',
    objectives: {
      primaryPurpose: `${project.name} Architectural Program`,
      buildingUse: project.projectType === 'apartment' ? 'residential' : 'residential',
      intendedUsers: `Family of ${totalBedrooms + 1} occupants`,
      mainActivities: 'Residential family living, cooking, sleeping, studying, gathering',
      desiredOutcomes: 'Generous natural light, functional room proportions, seamless spatial flow',
      targetBudget: project.budget,
      projectStage: project.status || 'Schematic Design',
      designLifeYears: 50,
    },
    occupancy: {
      regularOccupants: totalBedrooms + 1,
      occasionalVisitors: 2,
      occupancyPattern: 'Year-round full-time residential use',
      userGroupNeeds: 'Private sleeping quarters paired with expansive communal social zones',
      futureExpansionNeeds: 'Flexible rooms to accommodate growing family lifecycle',
      accessibilityNotes: 'Step-free ground floor access and universal circulation clearances',
    },
    preferences: {
      spatialCharacter: 'Balanced contemporary layout with distinct public social and private rest zones',
      indoorOutdoorRelationship: 'Living spaces oriented toward prime garden or courtyard aspects',
      naturalLightPriorities: 'Primary living areas positioned for direct sunlight ingress',
      storagePriorities: 'Adequate built-in closet and pantry storage to keep living spaces clear',
      circulationPreferences: 'Efficient hallway layout to preserve net room areas',
      materialPreferences: 'Modern architectural finishes with acoustic comfort',
    },
    constraints: {
      siteRestrictionsSummary: `Plot dimensions: ${project.plotWidth} x ${project.plotLength} ${project.unit}. Street frontage: ${project.roadFacing}.`,
      structuralAssumptions: 'Standard residential frame construction suitable for local climate',
      knownMandatoryRequirements: [
        'Habitable bedrooms must provide operable windows and exterior daylight',
        'Wet areas must include compliant drainage and moisture sealing',
      ],
      budgetCapKnown: project.budget,
      accessibilityMandatory: true,
      sustainabilityGoals: 'Good thermal envelope performance and cross-ventilation',
      unresolvedQuestions: [],
    },
    spaces: generatedSpaces,
    relationships,
    circulationWallAllowancePercent: 15,
    revisions: [
      {
        id: 'rev-init',
        versionNumber: 1,
        timestamp: new Date().toISOString(),
        author: 'Plotify Architecture Engine',
        summaryOfChanges: 'Synthesized architectural brief and space schedule from project parameters',
        approvalStatus: 'draft',
      },
    ],
  };
}

/**
 * Calculates deterministic space program totals and verifies footprint fit against plot bounds.
 */
export function calculateSpaceProgramSummary(
  project: Project,
  brief: ArchitecturalBriefData
): SpaceProgramSummary {
  let totalTargetNetArea = 0;
  let minProgramArea = 0;
  let maxProgramArea = 0;
  let mandatoryTargetArea = 0;
  let highPriorityTargetArea = 0;
  let preferredTargetArea = 0;
  let optionalTargetArea = 0;
  let mandatorySpaceCount = 0;

  const spaces = brief.spaces || [];

  for (const sp of spaces) {
    const qty = sp.quantity > 0 ? sp.quantity : 1;
    const spaceNetTarget = sp.targetArea * qty;
    const spaceMin = (sp.minArea ?? sp.targetArea * 0.85) * qty;
    const spaceMax = (sp.maxArea ?? sp.targetArea * 1.25) * qty;

    totalTargetNetArea += spaceNetTarget;
    minProgramArea += spaceMin;
    maxProgramArea += spaceMax;

    switch (sp.priority) {
      case 'mandatory':
        mandatoryTargetArea += spaceNetTarget;
        mandatorySpaceCount += qty;
        break;
      case 'high-priority':
        highPriorityTargetArea += spaceNetTarget;
        break;
      case 'preferred':
        preferredTargetArea += spaceNetTarget;
        break;
      case 'optional':
        optionalTargetArea += spaceNetTarget;
        break;
    }
  }

  const circPercent = brief.circulationWallAllowancePercent ?? 15;
  const estimatedCirculationWallArea = Math.round(totalTargetNetArea * (circPercent / 100));
  const estimatedGrossInternalArea = totalTargetNetArea + estimatedCirculationWallArea;

  const plotArea = project.plotWidth * project.plotLength;
  const floors = project.floors > 0 ? project.floors : 1;

  // Compute allowable footprint based on site setback envelope or standard 60% ground coverage rule
  let maxCoverageRatio = 0.60;
  if (project.siteContext?.setbacks && project.plotWidth > 0 && project.plotLength > 0) {
    const sb = project.siteContext.setbacks;
    const buildableW = Math.max(0, project.plotWidth - (sb.sideLeft + sb.sideRight));
    const buildableL = Math.max(0, project.plotLength - (sb.front + sb.rear));
    const envelopeArea = buildableW * buildableL;
    if (envelopeArea > 0 && plotArea > 0) {
      maxCoverageRatio = Math.min(0.70, envelopeArea / plotArea);
    }
  }

  const maxAllowableFootprintArea = Math.round(plotArea * maxCoverageRatio);
  const maxAllowableGrossArea = maxAllowableFootprintArea * floors;

  // Footprint fit status
  let footprintFitStatus: 'fits' | 'tight' | 'exceeds' | 'unverified' = 'fits';
  if (plotArea <= 0) {
    footprintFitStatus = 'unverified';
  } else if (estimatedGrossInternalArea > maxAllowableGrossArea) {
    footprintFitStatus = 'exceeds';
  } else if (estimatedGrossInternalArea > maxAllowableGrossArea * 0.90) {
    footprintFitStatus = 'tight';
  } else {
    footprintFitStatus = 'fits';
  }

  return {
    totalTargetNetArea: Math.round(totalTargetNetArea * 10) / 10,
    minProgramArea: Math.round(minProgramArea * 10) / 10,
    maxProgramArea: Math.round(maxProgramArea * 10) / 10,
    mandatoryTargetArea: Math.round(mandatoryTargetArea * 10) / 10,
    highPriorityTargetArea: Math.round(highPriorityTargetArea * 10) / 10,
    preferredTargetArea: Math.round(preferredTargetArea * 10) / 10,
    optionalTargetArea: Math.round(optionalTargetArea * 10) / 10,
    circulationWallAllowancePercent: circPercent,
    estimatedCirculationWallArea,
    estimatedGrossInternalArea,
    availablePlotArea: plotArea,
    maxAllowableFootprintArea,
    maxAllowableGrossArea,
    footprintFitStatus,
    totalSpaceCount: spaces.reduce((acc, s) => acc + (s.quantity || 1), 0),
    mandatorySpaceCount,
  };
}

/**
 * Reconciles architectural brief requirements against placed 2D floor plan rooms.
 * Deterministically maps placed rooms by type/category and calculates area variances.
 */
export function compareBriefWithFloorPlan(
  project: Project,
  brief: ArchitecturalBriefData
): SpacePlacementComparison[] {
  const placedRooms: FloorPlanRoom[] = project.floorPlan?.rooms || [];
  const comparisons: SpacePlacementComparison[] = [];
  const assignedRoomIds = new Set<string>();

  // Map each brief space
  for (const sp of brief.spaces) {
    const requiredQty = sp.quantity || 1;
    const targetAreaEach = sp.targetArea;
    const targetTotalArea = targetAreaEach * requiredQty;

    // Find placed rooms matching this space category or name keyword
    const matched: FloorPlanRoom[] = [];
    const nameLower = sp.name.toLowerCase();

    for (const room of placedRooms) {
      if (assignedRoomIds.has(room.id)) continue;

      const roomNameLower = room.name.toLowerCase();
      const roomTypeLower = room.type.toLowerCase();

      let isMatch = false;

      // Exact or sub-phrase match in name
      if (
        roomNameLower.includes(nameLower) ||
        nameLower.includes(roomNameLower)
      ) {
        isMatch = true;
      }
      // Category match
      else if (sp.category === 'sleeping' && (roomTypeLower.includes('bed') || roomNameLower.includes('bed'))) {
        isMatch = true;
      } else if (sp.category === 'living' && (roomTypeLower.includes('liv') || roomNameLower.includes('liv'))) {
        isMatch = true;
      } else if (sp.category === 'hygiene' && (roomTypeLower.includes('bath') || roomTypeLower.includes('wc') || roomNameLower.includes('bath'))) {
        isMatch = true;
      } else if (sp.category === 'service' && (roomTypeLower.includes('kitchen') || roomNameLower.includes('kitchen') || roomTypeLower.includes('garage') || roomTypeLower.includes('laundry'))) {
        if (nameLower.includes(roomTypeLower) || roomNameLower.includes(nameLower)) {
          isMatch = true;
        }
      } else if (sp.category === 'work' && (roomTypeLower.includes('office') || roomNameLower.includes('office') || roomNameLower.includes('study'))) {
        isMatch = true;
      } else if (sp.category === 'outdoor' && (roomTypeLower.includes('balcony') || roomNameLower.includes('balcony') || roomNameLower.includes('terrace'))) {
        isMatch = true;
      }

      if (isMatch) {
        matched.push(room);
        assignedRoomIds.add(room.id);
        if (matched.length >= requiredQty) {
          break; // Matched enough for this specification
        }
      }
    }

    const placedQuantity = matched.length;
    const actualPlacedTotalArea = matched.reduce((sum, r) => sum + r.width * r.length, 0);
    const areaDelta = Math.round((actualPlacedTotalArea - targetTotalArea) * 10) / 10;
    const areaVariancePercent = targetTotalArea > 0
      ? Math.round(((actualPlacedTotalArea - targetTotalArea) / targetTotalArea) * 100)
      : 0;

    let placementStatus: 'unplaced' | 'partially-placed' | 'fully-placed' | 'over-allocated' = 'unplaced';
    if (placedQuantity === 0) {
      placementStatus = 'unplaced';
    } else if (placedQuantity < requiredQty) {
      placementStatus = 'partially-placed';
    } else if (placedQuantity === requiredQty) {
      placementStatus = 'fully-placed';
    } else {
      placementStatus = 'over-allocated';
    }

    comparisons.push({
      spaceRequirementId: sp.id,
      name: sp.name,
      category: sp.category,
      priority: sp.priority,
      requiredQuantity: requiredQty,
      placedQuantity,
      targetAreaEach,
      targetTotalArea,
      actualPlacedTotalArea: Math.round(actualPlacedTotalArea * 10) / 10,
      areaDelta,
      areaVariancePercent,
      placementStatus,
      matchedRoomIds: matched.map((r) => r.id),
    });
  }

  return comparisons;
}

/**
 * Validates the architectural brief against spatial geometry, site limits, and relationships.
 */
export function validateBrief(
  project: Project,
  brief: ArchitecturalBriefData
): BriefValidationNotice[] {
  const notices: BriefValidationNotice[] = [];
  const summary = calculateSpaceProgramSummary(project, brief);
  const comparisons = compareBriefWithFloorPlan(project, brief);
  const placedRooms = project.floorPlan?.rooms || [];

  // 1. Mandatory unplaced rooms
  for (const comp of comparisons) {
    if (comp.priority === 'mandatory' && comp.placedQuantity === 0) {
      notices.push({
        id: `notice-unplaced-${comp.spaceRequirementId}`,
        type: 'unplaced-mandatory',
        severity: 'conflict',
        title: `Mandatory Space Missing: ${comp.name}`,
        message: `The brief designates "${comp.name}" as Mandatory, but no corresponding room is placed on the 2D floor plan.`,
        affectedSpaceIds: [comp.spaceRequirementId],
        suggestedAction: `Open the 2D Floor Plan editor and place ${comp.requiredQuantity} room(s) for "${comp.name}", or adjust brief priority if requirements have changed.`,
      });
    } else if (comp.priority === 'mandatory' && comp.placedQuantity < comp.requiredQuantity) {
      notices.push({
        id: `notice-partial-${comp.spaceRequirementId}`,
        type: 'unplaced-mandatory',
        severity: 'warning',
        title: `Partial Mandatory Placement: ${comp.name}`,
        message: `Required quantity is ${comp.requiredQuantity}, but only ${comp.placedQuantity} room(s) have been placed on the floor plan.`,
        affectedSpaceIds: [comp.spaceRequirementId],
        suggestedAction: `Place the remaining ${comp.requiredQuantity - comp.placedQuantity} space(s) on the 2D floor plan.`,
      });
    }
  }

  // 2. Significant Area Discrepancies on Placed Rooms
  for (const comp of comparisons) {
    if (comp.placedQuantity > 0 && comp.targetTotalArea > 0) {
      if (comp.areaVariancePercent < -20) {
        notices.push({
          id: `notice-area-shortfall-${comp.spaceRequirementId}`,
          type: 'area-shortfall',
          severity: comp.priority === 'mandatory' ? 'conflict' : 'warning',
          title: `Area Shortfall: ${comp.name} (${comp.areaVariancePercent}%)`,
          message: `Placed room total area is ${comp.actualPlacedTotalArea} ${project.unit === 'feet' ? 'sq ft' : 'm²'}, which is ${Math.abs(comp.areaVariancePercent)}% smaller than the target ${comp.targetTotalArea} ${project.unit === 'feet' ? 'sq ft' : 'm²'}.`,
          affectedSpaceIds: [comp.spaceRequirementId],
          suggestedAction: `Resize placed room geometry in the 2D editor to meet the minimum usable threshold.`,
        });
      } else if (comp.areaVariancePercent > 35) {
        notices.push({
          id: `notice-area-excess-${comp.spaceRequirementId}`,
          type: 'area-excess',
          severity: 'info',
          title: `Area Surplus: ${comp.name} (+${comp.areaVariancePercent}%)`,
          message: `Placed area is ${comp.actualPlacedTotalArea} ${project.unit === 'feet' ? 'sq ft' : 'm²'}, exceeding the target by ${comp.areaVariancePercent}%. Verify if this allocation impacts other programmed spaces.`,
          affectedSpaceIds: [comp.spaceRequirementId],
          suggestedAction: `Review room dimensions against project budget and overall allowable floor area.`,
        });
      }
    }
  }

  // 3. Program Gross Area vs Allowable Site Capacity
  if (summary.footprintFitStatus === 'exceeds' && summary.maxAllowableGrossArea) {
    notices.push({
      id: 'notice-capacity-exceeded',
      type: 'capacity-exceeded',
      severity: 'conflict',
      title: 'Program Exceeds Site Allowable Floor Area',
      message: `The estimated Gross Internal Area (${summary.estimatedGrossInternalArea} ${project.unit === 'feet' ? 'sq ft' : 'm²'}) exceeds the maximum allowable building area (${summary.maxAllowableGrossArea} ${project.unit === 'feet' ? 'sq ft' : 'm²'}) across ${project.floors} floor(s).`,
      suggestedAction: `Consider reducing optional/preferred space targets, increasing floor count, or verifying local zoning FAR limits.`,
    });
  } else if (summary.footprintFitStatus === 'tight' && summary.maxAllowableGrossArea) {
    notices.push({
      id: 'notice-capacity-tight',
      type: 'capacity-exceeded',
      severity: 'warning',
      title: 'Program Approaches Allowable Floor Area Limit',
      message: `The estimated Gross Internal Area is within 10% of maximum allowable building capacity (${summary.estimatedGrossInternalArea} / ${summary.maxAllowableGrossArea} ${project.unit === 'feet' ? 'sq ft' : 'm²'}).`,
      suggestedAction: `Carefully manage circulation and wall thickness allowances during detailed floor plan layout.`,
    });
  }

  // 4. Spatial Relationship and Separation Checks
  if (brief.relationships && brief.relationships.length > 0 && placedRooms.length > 1) {
    const spaceIdToRoom = new Map<string, FloorPlanRoom>();
    for (const comp of comparisons) {
      if (comp.matchedRoomIds.length > 0) {
        const room = placedRooms.find((r) => r.id === comp.matchedRoomIds[0]);
        if (room) spaceIdToRoom.set(comp.spaceRequirementId, room);
      }
    }

    for (const rel of brief.relationships) {
      const roomA = spaceIdToRoom.get(rel.sourceSpaceId);
      const roomB = spaceIdToRoom.get(rel.targetSpaceId);

      if (roomA && roomB) {
        // Direct Access or Adjacent requires same floor level
        if (
          (rel.relationType === 'direct-access' || rel.relationType === 'adjacent') &&
          roomA.floorLevel !== roomB.floorLevel
        ) {
          notices.push({
            id: `notice-rel-floor-${rel.id}`,
            type: 'adjacency-conflict',
            severity: rel.priority === 'mandatory' ? 'conflict' : 'warning',
            title: `Adjacency Floor Mismatch`,
            message: `"${roomA.name}" (Floor ${roomA.floorLevel}) and "${roomB.name}" (Floor ${roomB.floorLevel}) are marked as ${rel.relationType.toUpperCase()}, but placed on different levels.`,
            affectedSpaceIds: [rel.sourceSpaceId, rel.targetSpaceId],
            suggestedAction: `Move both rooms to the same floor or adjust the brief relationship to reflect multi-level vertical connection.`,
          });
        }

        // Separated / Acoustic Isolated rooms placed touching or overlapping
        if (
          (rel.relationType === 'separated' || rel.relationType === 'acoustic-isolated') &&
          roomA.floorLevel === roomB.floorLevel
        ) {
          // Check Euclidean distance between room centers
          const centerAX = roomA.x + roomA.width / 2;
          const centerAY = roomA.y + roomA.length / 2;
          const centerBX = roomB.x + roomB.width / 2;
          const centerBY = roomB.y + roomB.length / 2;
          const dist = Math.sqrt(Math.pow(centerAX - centerBX, 2) + Math.pow(centerAY - centerBY, 2));
          const threshold = (Math.max(roomA.width, roomA.length) + Math.max(roomB.width, roomB.length)) * 0.45;

          if (dist < threshold) {
            notices.push({
              id: `notice-rel-proximity-${rel.id}`,
              type: 'adjacency-conflict',
              severity: 'warning',
              title: `Acoustic / Visual Separation Required`,
              message: `"${roomA.name}" and "${roomB.name}" are placed directly adjacent on Floor ${roomA.floorLevel}, but the brief specifies ${rel.relationType.toUpperCase()}.`,
              affectedSpaceIds: [rel.sourceSpaceId, rel.targetSpaceId],
              suggestedAction: `Introduce a buffer corridor, utility zone, or acoustic-rated partition wall.`,
            });
          }
        }
      }
    }
  }

  // 5. Unresolved brief questions
  if (brief.constraints?.unresolvedQuestions && brief.constraints.unresolvedQuestions.length > 0) {
    for (let i = 0; i < brief.constraints.unresolvedQuestions.length; i++) {
      const q = brief.constraints.unresolvedQuestions[i];
      if (q.trim()) {
        notices.push({
          id: `notice-unresolved-${i}`,
          type: 'unresolved-question',
          severity: 'info',
          title: `Unresolved Clarification`,
          message: q,
          suggestedAction: `Confirm this design requirement with the client or local authorities before freezing the brief.`,
        });
      }
    }
  }

  // 6. Regulatory Code Minimum Space Checks (Prompt 13 Integration)
  const minHabitableArea = project.unit === 'metres' ? 6.5 : 70;
  for (const sp of brief.spaces) {
    if (
      (sp.category === 'sleeping' || sp.category === 'living') &&
      sp.targetArea > 0 &&
      sp.targetArea < minHabitableArea
    ) {
      notices.push({
        id: `notice-reg-min-area-${sp.id}`,
        type: 'regulatory-code-notice',
        severity: 'conflict',
        title: `Brief Target Below Statutory Minimum (IRC R304.1)`,
        message: `Space "${sp.name}" has target area of ${sp.targetArea} ${project.unit === 'feet' ? 'sq ft' : 'm²'}, which is below the statutory ${minHabitableArea} ${project.unit === 'feet' ? 'sq ft' : 'm²'} minimum for habitable living spaces.`,
        affectedSpaceIds: [sp.id],
        suggestedAction: `Increase target area to at least ${minHabitableArea} ${project.unit === 'feet' ? 'sq ft' : 'm²'} to ensure building regulation compliance.`,
      });
    }
  }

  return notices;
}

/**
 * Creates a new revision record in the brief history.
 */
export function recordBriefRevision(
  brief: ArchitecturalBriefData,
  author: string,
  summaryOfChanges: string,
  status: BriefApprovalStatus
): ArchitecturalBriefData {
  const currentRevs = brief.revisions || [];
  const nextVersion = currentRevs.length + 1;
  const newRev: BriefRevisionRecord = {
    id: `rev-${Date.now()}`,
    versionNumber: nextVersion,
    timestamp: new Date().toISOString(),
    author: author.trim() || 'Project Architect',
    summaryOfChanges: summaryOfChanges.trim() || 'Updated space schedule and project constraints',
    approvalStatus: status,
  };

  return {
    ...brief,
    version: `v${nextVersion}.0`,
    lastUpdated: newRev.timestamp,
    approvalStatus: status,
    revisions: [newRev, ...currentRevs],
  };
}
