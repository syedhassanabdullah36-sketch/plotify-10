import { Project, Currency, MeasurementUnit } from '../types/project';
import {
  CostLineItem,
  CostScenario,
  ConstructionPhase,
  CostPlanningState,
  PhaseConflictWarning,
  CostItemCategory,
  CostSummaryMetrics,
} from '../types/costPlanning';

/**
 * Computes a stable hash of the project's spatial geometry to detect staleness
 */
export function computeProjectGeometryHash(project: Project): string {
  const rooms = project.floorPlan?.rooms || [];
  const roomTokens = rooms
    .map(
      (r) =>
        `${r.id}:${Math.round(r.x * 10)}:${Math.round(r.y * 10)}:${Math.round(r.width * 10)}:${Math.round(r.length * 10)}:${r.floorLevel || 1}`
    )
    .sort()
    .join('|');

  return `geom-${project.unit}-${project.plotWidth}x${project.plotLength}-${project.floors}-${rooms.length}-[${roomTokens}]`;
}

/**
 * Baseline default construction phases
 */
export function getDefaultConstructionPhases(startDateStr?: string): ConstructionPhase[] {
  const baseDate = startDateStr || new Date().toISOString().split('T')[0];
  const d = new Date(baseDate);

  const addDays = (days: number): string => {
    const copy = new Date(d);
    copy.setDate(copy.getDate() + days);
    return copy.toISOString().split('T')[0];
  };

  return [
    {
      id: 'phase-01',
      phaseNumber: 1,
      name: 'Pre-Construction & Permitting',
      description: 'Zoning approvals, structural engineering sign-off, utility locate, site mobilization.',
      startDate: addDays(0),
      durationDays: 28,
      dependencies: [],
      responsibleParty: 'Project Architect & General Contractor',
      allocatedBudget: 25000,
      status: 'complete',
      notes: 'Permits approved by municipal planning department.',
    },
    {
      id: 'phase-02',
      phaseNumber: 2,
      name: 'Site Prep & Substructure Foundations',
      description: 'Grading, soil compaction, strip footings, underground drainage, and slab prep.',
      startDate: addDays(30),
      durationDays: 35,
      dependencies: ['phase-01'],
      responsibleParty: 'Civil & Earthwork Contractor',
      allocatedBudget: 85000,
      status: 'in-progress',
      notes: 'Subsurface soil bearing capacity confirmed.',
    },
    {
      id: 'phase-03',
      phaseNumber: 3,
      name: 'Superstructure & Structural Framing',
      description: 'Structural columns, load-bearing walls, floor joists, upper-level slab casting, and roof trusses.',
      startDate: addDays(68),
      durationDays: 45,
      dependencies: ['phase-02'],
      responsibleParty: 'Structural Framing Subcontractor',
      allocatedBudget: 140000,
      status: 'not-started',
      notes: 'Prefabricated framing timber / steel packs scheduled for delivery.',
    },
    {
      id: 'phase-04',
      phaseNumber: 4,
      name: 'Building Envelope, Roofing & Enclosure',
      description: 'Roofing membrane, flashings, external vapor barrier, exterior cladding, and exterior glazing.',
      startDate: addDays(115),
      durationDays: 35,
      dependencies: ['phase-03'],
      responsibleParty: 'Facade & Roofing Specialist',
      allocatedBudget: 95000,
      status: 'not-started',
      notes: 'Achieves weather-tight envelope milestone.',
    },
    {
      id: 'phase-05',
      phaseNumber: 5,
      name: 'MEP Rough-In (Plumbing, Electrical, HVAC)',
      description: 'Conduit runs, domestic water supply, waste stacks, HVAC ducting, and low-voltage distribution.',
      startDate: addDays(145),
      durationDays: 30,
      dependencies: ['phase-04'],
      responsibleParty: 'Licensed MEP Subcontractors',
      allocatedBudget: 75000,
      status: 'not-started',
      notes: 'In-wall rough-in inspection required prior to board close.',
    },
    {
      id: 'phase-06',
      phaseNumber: 6,
      name: 'Interior & Exterior Architectural Finishes',
      description: 'Drywall, taping, painting, floor tiles, hardwood, cabinetry, sanitary fixtures, and lighting trim.',
      startDate: addDays(180),
      durationDays: 40,
      dependencies: ['phase-05'],
      responsibleParty: 'Finishes & Interior Millwork Contractor',
      allocatedBudget: 110000,
      status: 'not-started',
      notes: 'Requires dust-free conditioned space for wood finishes.',
    },
    {
      id: 'phase-07',
      phaseNumber: 7,
      name: 'Testing, Snagging & Handover',
      description: 'MEP balancing, fire alarm verification, punch list rectification, final clean, and occupancy certificate.',
      startDate: addDays(225),
      durationDays: 20,
      dependencies: ['phase-06'],
      responsibleParty: 'General Contractor & Clerk of Works',
      allocatedBudget: 20000,
      status: 'not-started',
      notes: 'Client walkthrough and warranty documentation.',
    },
  ];
}

/**
 * Validates phase dependencies and detects scheduling conflicts
 */
export function validateConstructionPhases(phases: ConstructionPhase[]): PhaseConflictWarning[] {
  const warnings: PhaseConflictWarning[] = [];
  const phaseMap = new Map<string, ConstructionPhase>();
  phases.forEach((p) => phaseMap.set(p.id, p));

  phases.forEach((phase) => {
    const phaseStart = new Date(phase.startDate);

    phase.dependencies.forEach((predId) => {
      const pred = phaseMap.get(predId);
      if (!pred) return;

      const predStart = new Date(pred.startDate);
      const predEnd = new Date(predStart);
      predEnd.setDate(predEnd.getDate() + pred.durationDays);

      if (phaseStart < predEnd) {
        const gapDays = Math.round((predEnd.getTime() - phaseStart.getTime()) / (1000 * 60 * 60 * 24));
        warnings.push({
          phaseId: phase.id,
          phaseName: phase.name,
          predecessorId: pred.id,
          predecessorName: pred.name,
          reason: `Starts on ${phase.startDate}, which is ${gapDays} day${gapDays === 1 ? '' : 's'} before predecessor "${pred.name}" finishes on ${predEnd.toISOString().split('T')[0]}.`,
        });
      }
    });
  });

  return warnings;
}

/**
 * Generates deterministic quantity takeoff from actual project rooms & dimensions
 */
export function generateDeterministicQTO(
  project: Project,
  options?: { location?: string; currency?: Currency }
): CostLineItem[] {
  const isFeet = project.unit === 'feet';
  const unitSuffix = isFeet ? 'ft' : 'm';
  const areaUnit = isFeet ? 'sq ft' : 'm²';
  const volUnit = isFeet ? 'cu yd' : 'm³';
  const linUnit = isFeet ? 'lin ft' : 'lin m';

  const rooms = project.floorPlan?.rooms || [];
  const floors = Math.max(1, project.floors);

  // 1. Calculate ground floor area and total room area
  let groundArea = 0;
  let totalNetRoomArea = 0;
  let totalPerimeter = 0;

  rooms.forEach((room) => {
    const w = typeof room.width === 'number' && room.width > 0 ? room.width : 0;
    const l = typeof room.length === 'number' && room.length > 0 ? room.length : 0;
    const a = w * l;
    totalNetRoomArea += a;

    if (!room.floorLevel || room.floorLevel === 1) {
      groundArea += a;
    }
    totalPerimeter += 2 * (w + l);
  });

  // If no rooms placed yet, estimate footprint from plot coverage (e.g. 50% plot area)
  const isGeometryAvailable = rooms.length > 0 && totalNetRoomArea > 0;
  const effectiveGroundArea = isGeometryAvailable
    ? groundArea
    : Math.round(project.plotWidth * project.plotLength * 0.45);
  const effectiveTotalGFA = isGeometryAvailable
    ? Math.round(totalNetRoomArea * (floors > 1 && !rooms.some((r) => r.floorLevel > 1) ? floors : 1) * 1.12)
    : Math.round(effectiveGroundArea * floors * 1.10);

  // Wall height assumption (standard 9 ft or 2.75 m)
  const wallHeight = isFeet ? 9.0 : 2.75;

  // Reduced internal perimeter (eliminating double-counted shared walls by 35% factor)
  const internalWallLength = isGeometryAvailable
    ? Math.round(totalPerimeter * 0.65)
    : Math.round(Math.sqrt(effectiveGroundArea) * 4 * floors * 0.8);
  const internalWallArea = Math.round(internalWallLength * wallHeight);

  // External perimeter envelope
  const approxPerimeter = Math.round(2 * (project.plotWidth * 0.75 + project.plotLength * 0.75));
  const externalEnvelopeArea = Math.round(approxPerimeter * wallHeight * floors * 0.78); // minus 22% glazing

  // Concrete volumes
  // Ground slab: thickness 5 inches (0.42 ft) or 0.13 m
  const slabThickness = isFeet ? 0.42 : 0.13;
  const slabConcreteVol = isFeet
    ? Math.round(((effectiveGroundArea * slabThickness) / 27) * 10) / 10
    : Math.round(effectiveGroundArea * slabThickness * 10) / 10;

  // Rate benchmark tables by unit
  const rates = isFeet
    ? {
        concreteM3: 165, // per cu yd
        framingM2: 32, // per sq ft
        claddingM2: 24, // per sq ft
        drywallM2: 6.5, // per sq ft
        flooringM2: 12.5, // per sq ft
        ceilingM2: 5.8, // per sq ft
        roofM2: 14.0, // per sq ft
        labourStruct: 48, // per hr
        labourFinishes: 44, // per hr
        labourMEP: 58, // per hr
        equipExcav: 850, // per day
        equipScaffold: 480, // per week
        transportFreight: 380, // per load
        transportDebris: 290, // per trip
        permits: 4500, // lump sum
        siteSupervision: 3200, // per month
      }
    : {
        concreteM3: 155, // per m³
        framingM2: 290, // per m²
        claddingM2: 220, // per m²
        drywallM2: 58, // per m²
        flooringM2: 115, // per m²
        ceilingM2: 52, // per m²
        roofM2: 135, // per m²
        labourStruct: 42, // per hr
        labourFinishes: 38, // per hr
        labourMEP: 52, // per hr
        equipExcav: 780, // per day
        equipScaffold: 420, // per week
        transportFreight: 320, // per load
        transportDebris: 260, // per trip
        permits: 3800, // lump sum
        siteSupervision: 2900, // per month
      };

  const lineItems: CostLineItem[] = [
    // ----------------------------------------------------
    // MATERIALS
    // ----------------------------------------------------
    {
      id: 'cost-m-01',
      code: 'M-01',
      category: 'materials',
      name: 'Substructure Concrete & Foundation Slab',
      description: `Grade C30 reinforced cast-in-place concrete for ground slab (${isFeet ? '5" thickness' : '130mm thickness'}) and grade beams.`,
      quantity: Math.max(1, slabConcreteVol),
      unit: volUnit,
      unitRate: rates.concreteM3,
      extendedCost: Math.round(Math.max(1, slabConcreteVol) * rates.concreteM3),
      quantitySource: isGeometryAvailable ? 'geometry-derived' : 'user-entered',
      calculationFormula: `Ground Footprint (${effectiveGroundArea} ${areaUnit}) × ${slabThickness} ${unitSuffix} slab thickness`,
      assumptions: 'Includes vapor barrier, formwork, steel rebar reinforcement mesh, and 5% pump waste.',
    },
    {
      id: 'cost-m-02',
      code: 'M-02',
      category: 'materials',
      name: 'Superstructure Framing & Intermediate Slabs',
      description: 'Structural floor deck, load-bearing posts, beams, and intermediate floor structure.',
      quantity: Math.max(0, effectiveTotalGFA - effectiveGroundArea),
      unit: areaUnit,
      unitRate: rates.framingM2,
      extendedCost: Math.round(Math.max(0, effectiveTotalGFA - effectiveGroundArea) * rates.framingM2),
      quantitySource: isGeometryAvailable ? 'geometry-derived' : 'user-entered',
      calculationFormula: `Upper Floor Levels Built-Up Area (${Math.max(0, effectiveTotalGFA - effectiveGroundArea)} ${areaUnit})`,
      assumptions: 'Calculated across upper floors (Levels 2+). If 1-story structure, quantity is 0.',
    },
    {
      id: 'cost-m-03',
      code: 'M-03',
      category: 'materials',
      name: 'Exterior Enclosure & Facade Cladding',
      description: 'Exterior weather-resistant cladding, exterior thermal insulation, air/water barrier, and flashings.',
      quantity: Math.max(50, externalEnvelopeArea),
      unit: areaUnit,
      unitRate: rates.claddingM2,
      extendedCost: Math.round(Math.max(50, externalEnvelopeArea) * rates.claddingM2),
      quantitySource: 'geometry-derived',
      calculationFormula: `Perimeter Envelope (~${approxPerimeter} ${linUnit}) × Height (${wallHeight} ${unitSuffix}) × ${floors} Floors × 0.78 (net of glazing)`,
      assumptions: 'Derived from building perimeter envelope minus 22% standard fenestration opening deduction.',
    },
    {
      id: 'cost-m-04',
      code: 'M-04',
      category: 'materials',
      name: 'Interior Partition Walls & Drywall Assembly',
      description: 'Light-gauge metal/timber stud framing, acoustic fiberglass batt insulation, and dual-layer drywall.',
      quantity: Math.max(50, internalWallArea),
      unit: areaUnit,
      unitRate: rates.drywallM2,
      extendedCost: Math.round(Math.max(50, internalWallArea) * rates.drywallM2),
      quantitySource: isGeometryAvailable ? 'geometry-derived' : 'user-entered',
      calculationFormula: `Total Room Boundaries (${internalWallLength} ${linUnit}) × Ceiling Height (${wallHeight} ${unitSuffix})`,
      assumptions: 'Calculated from 2D room perimeter with 35% shared-wall reduction to avoid double-counting.',
    },
    {
      id: 'cost-m-05',
      code: 'M-05',
      category: 'materials',
      name: 'Architectural Flooring & Tiling Finishes',
      description: 'Engineered hardwood, large-format porcelain tile for wet zones, and acoustic underlayment.',
      quantity: Math.round(effectiveTotalGFA * 0.95),
      unit: areaUnit,
      unitRate: rates.flooringM2,
      extendedCost: Math.round(effectiveTotalGFA * 0.95 * rates.flooringM2),
      quantitySource: isGeometryAvailable ? 'geometry-derived' : 'user-entered',
      calculationFormula: `Net Room Usable Floor Area (${Math.round(effectiveTotalGFA * 0.95)} ${areaUnit}) + 8% cutting waste`,
      assumptions: 'Net interior floor surfaces with room-specific material blends and 8% tile/wood cut allowance.',
    },
    {
      id: 'cost-m-06',
      code: 'M-06',
      category: 'materials',
      name: 'Ceiling Finishes & Drywall Board',
      description: 'Continuous smooth suspended gypsum ceilings, acoustic damping, and primer paint preparation.',
      quantity: Math.round(effectiveTotalGFA * 0.92),
      unit: areaUnit,
      unitRate: rates.ceilingM2,
      extendedCost: Math.round(effectiveTotalGFA * 0.92 * rates.ceilingM2),
      quantitySource: isGeometryAvailable ? 'geometry-derived' : 'user-entered',
      calculationFormula: `Total Room Interior Footprint Plane (${Math.round(effectiveTotalGFA * 0.92)} ${areaUnit})`,
      assumptions: 'Matches net interior overhead ceiling plane.',
    },
    {
      id: 'cost-m-07',
      code: 'M-07',
      category: 'materials',
      name: 'Roof Waterproofing, Insulation & Parapet Trim',
      description: 'Multi-ply SBS bituminous or TPO roof membrane, polyiso rigid insulation (R-30), and coping metal.',
      quantity: Math.round(effectiveGroundArea * 1.08),
      unit: areaUnit,
      unitRate: rates.roofM2,
      extendedCost: Math.round(effectiveGroundArea * 1.08 * rates.roofM2),
      quantitySource: 'geometry-derived',
      calculationFormula: `Top Floor Footprint (${effectiveGroundArea} ${areaUnit}) × 1.08 eaves/parapet perimeter overhang`,
      assumptions: 'Includes 8% geometric roof slope and perimeter parapet flashings.',
    },

    // ----------------------------------------------------
    // LABOUR
    // ----------------------------------------------------
    {
      id: 'cost-l-01',
      code: 'L-01',
      category: 'labour',
      name: 'Structural, Concrete & Masonry Trades Labour',
      description: 'Journeyman carpenters, rebar placers, concrete finishers, and formwork erectors.',
      quantity: Math.round(effectiveTotalGFA * (isFeet ? 0.42 : 4.5)),
      unit: 'hrs',
      unitRate: rates.labourStruct,
      extendedCost: Math.round(effectiveTotalGFA * (isFeet ? 0.42 : 4.5) * rates.labourStruct),
      quantitySource: 'geometry-derived',
      calculationFormula: `GFA (${effectiveTotalGFA} ${areaUnit}) × ${isFeet ? '0.42' : '4.5'} man-hours per ${areaUnit}`,
      assumptions: 'Derived from RSMeans structural trades production rates for residential/commercial framing.',
    },
    {
      id: 'cost-l-02',
      code: 'L-02',
      category: 'labour',
      name: 'Interior Carpentry, Drywall & Finishes Trades',
      description: 'Drywall tapers, painters, floor installers, and trim carpenters.',
      quantity: Math.round(effectiveTotalGFA * (isFeet ? 0.38 : 4.0)),
      unit: 'hrs',
      unitRate: rates.labourFinishes,
      extendedCost: Math.round(effectiveTotalGFA * (isFeet ? 0.38 : 4.0) * rates.labourFinishes),
      quantitySource: 'geometry-derived',
      calculationFormula: `GFA (${effectiveTotalGFA} ${areaUnit}) × ${isFeet ? '0.38' : '4.0'} man-hours per ${areaUnit}`,
      assumptions: 'Interior finishing trades productivity standard.',
    },
    {
      id: 'cost-l-03',
      code: 'L-03',
      category: 'labour',
      name: 'Mechanical, Electrical & Plumbing (MEP) Trades',
      description: 'Licensed master electricians, plumbers, and HVAC technicians for rough-in and fixture trim.',
      quantity: Math.round(effectiveTotalGFA * (isFeet ? 0.32 : 3.4)),
      unit: 'hrs',
      unitRate: rates.labourMEP,
      extendedCost: Math.round(effectiveTotalGFA * (isFeet ? 0.32 : 3.4) * rates.labourMEP),
      quantitySource: 'geometry-derived',
      calculationFormula: `GFA (${effectiveTotalGFA} ${areaUnit}) × ${isFeet ? '0.32' : '3.4'} man-hours per ${areaUnit}`,
      assumptions: 'MEP specialty trades combined allowance.',
    },

    // ----------------------------------------------------
    // EQUIPMENT
    // ----------------------------------------------------
    {
      id: 'cost-e-01',
      code: 'E-01',
      category: 'equipment',
      name: 'Site Prep Earthmoving & Excavator Rental',
      description: 'Tracked hydraulic excavator (20-ton), trenching bucket, and vibratory plate compactor.',
      quantity: Math.max(8, Math.round(effectiveGroundArea / (isFeet ? 250 : 25))),
      unit: 'days',
      unitRate: rates.equipExcav,
      extendedCost: Math.round(Math.max(8, Math.round(effectiveGroundArea / (isFeet ? 250 : 25))) * rates.equipExcav),
      quantitySource: 'geometry-derived',
      calculationFormula: `Ground Footprint (${effectiveGroundArea} ${areaUnit}) scaled excavation cycle`,
      assumptions: 'Rental duration includes mobilization, excavation, backfill, and site fine-grading.',
    },
    {
      id: 'cost-e-02',
      code: 'E-02',
      category: 'equipment',
      name: 'Perimeter Modular Scaffolding & Hoisting',
      description: 'Full-perimeter facade scaffolding, safety netting, and materials hoists.',
      quantity: Math.max(3, floors * 3),
      unit: 'weeks',
      unitRate: rates.equipScaffold,
      extendedCost: Math.round(Math.max(3, floors * 3) * rates.equipScaffold),
      quantitySource: 'geometry-derived',
      calculationFormula: `${floors} Building Floors × 3 weeks per elevation duration`,
      assumptions: 'Weekly rental for scaffolding, inspection, and perimeter safety barriers.',
    },

    // ----------------------------------------------------
    // TRANSPORT & LOGISTICS
    // ----------------------------------------------------
    {
      id: 'cost-t-01',
      code: 'T-01',
      category: 'transport',
      name: 'Heavy Freight Delivery & Ready-Mix Transport',
      description: 'Flatbed haulage for timber/steel, ready-mix concrete transit mixers, and palletized deliveries.',
      quantity: Math.max(6, Math.round(effectiveTotalGFA / (isFeet ? 400 : 40))),
      unit: 'loads',
      unitRate: rates.transportFreight,
      extendedCost: Math.round(Math.max(6, Math.round(effectiveTotalGFA / (isFeet ? 400 : 40))) * rates.transportFreight),
      quantitySource: 'geometry-derived',
      calculationFormula: `Total Built-Up Area (${effectiveTotalGFA} ${areaUnit}) / freight payload volume`,
      assumptions: 'Logistics delivery trips based on gross structural and finish material volume.',
    },
    {
      id: 'cost-t-02',
      code: 'T-02',
      category: 'transport',
      name: 'Construction Waste Hauling & Sorting Skips',
      description: 'Roll-off dumpster containers (30-yard) and certified recycling haulage.',
      quantity: Math.max(4, Math.round(effectiveTotalGFA / (isFeet ? 600 : 60))),
      unit: 'trips',
      unitRate: rates.transportDebris,
      extendedCost: Math.round(Math.max(4, Math.round(effectiveTotalGFA / (isFeet ? 600 : 60))) * rates.transportDebris),
      quantitySource: 'geometry-derived',
      calculationFormula: `Waste container turns based on square footage turnover`,
      assumptions: 'Standard LEED diversion recycling bins and tipping fees.',
    },

    // ----------------------------------------------------
    // OTHER PRELIMINARIES & SITE FEES
    // ----------------------------------------------------
    {
      id: 'cost-o-01',
      code: 'O-01',
      category: 'other',
      name: 'Municipal Building Permits & Regulatory Filings',
      description: 'Jurisdictional plan-check fees, street-use permits, and building department inspections.',
      quantity: 1,
      unit: 'lump sum',
      unitRate: rates.permits,
      extendedCost: rates.permits,
      quantitySource: 'user-entered',
      calculationFormula: 'User-specified municipal permit fee schedule',
      assumptions: 'Estimated permit review and statutory compliance fees.',
    },
    {
      id: 'cost-o-02',
      code: 'O-02',
      category: 'other',
      name: 'Site Preliminaries, Project Supervision & Temporary Power',
      description: 'Site superintendent, temporary electrical panel, job trailer, and site security.',
      quantity: Math.max(4, Math.round(floors * 2.5)),
      unit: 'months',
      unitRate: rates.siteSupervision,
      extendedCost: Math.round(Math.max(4, Math.round(floors * 2.5)) * rates.siteSupervision),
      quantitySource: 'user-entered',
      calculationFormula: `${floors} floors duration factor (~${Math.max(4, Math.round(floors * 2.5))} months)`,
      assumptions: 'General condition monthly site overhead and supervisor costs.',
    },
  ];

  return lineItems;
}

/**
 * Initializes or syncs cost planning state for a project
 */
export function initializeProjectCostPlanning(project: Project): CostPlanningState {
  const currentGeomHash = computeProjectGeometryHash(project);

  if (project.costPlanning && project.costPlanning.scenarios && project.costPlanning.scenarios.length > 0) {
    const isStale = project.costPlanning.lastGeometryHash !== currentGeomHash;

    // Check if line items need stale flags
    const updatedScenarios = project.costPlanning.scenarios.map((scen) => ({
      ...scen,
      lineItems: scen.lineItems.map((item) => ({
        ...item,
        isStale: isStale && item.quantitySource === 'geometry-derived',
      })),
    }));

    return {
      ...project.costPlanning,
      scenarios: updatedScenarios,
      targetBudget: project.budget || project.costPlanning.targetBudget,
      currency: project.currency || project.costPlanning.currency,
      lastGeometryHash: project.costPlanning.lastGeometryHash,
    };
  }

  // Generate initial baseline and value-engineered scenarios
  const nowIso = new Date().toISOString();
  const baselineLineItems = generateDeterministicQTO(project);

  const baselineScenario: CostScenario = {
    id: `cost-scen-baseline-${project.id}`,
    name: 'Baseline Architectural Specification',
    description: 'Standard construction estimate derived from current project geometry and quality finish specifications.',
    isBaseline: true,
    createdAt: nowIso,
    updatedAt: nowIso,
    location: 'Standard Regional Market',
    currency: project.currency,
    contingencyRatePercent: 7.5,
    taxRatePercent: 0,
    lineItems: baselineLineItems,
    sourceGeometryHash: currentGeomHash,
  };

  // Value Engineering Scenario (lower finishes, standard plaster, tighter rate allowances)
  const veLineItems = baselineLineItems.map((item) => {
    let rateFactor = 1.0;
    if (item.category === 'materials' && item.code === 'M-05') rateFactor = 0.75; // economy flooring
    if (item.category === 'materials' && item.code === 'M-03') rateFactor = 0.82; // economy render
    if (item.category === 'labour') rateFactor = 0.95;
    const newRate = Math.round(item.unitRate * rateFactor * 10) / 10;
    return {
      ...item,
      id: `${item.id}-ve`,
      unitRate: newRate,
      extendedCost: Math.round(item.quantity * newRate),
      notes: rateFactor < 1.0 ? 'Value-engineered material/rate adjustment' : item.notes,
    };
  });

  const veScenario: CostScenario = {
    id: `cost-scen-ve-${project.id}`,
    name: 'Option B: Value Engineering (Cost-Optimized)',
    description: 'Downscales premium finishes to builder-grade specifications to reduce capital expenditure by ~12–15%.',
    isBaseline: false,
    createdAt: nowIso,
    updatedAt: nowIso,
    location: 'Standard Regional Market',
    currency: project.currency,
    contingencyRatePercent: 5.0,
    taxRatePercent: 0,
    lineItems: veLineItems,
    sourceGeometryHash: currentGeomHash,
  };

  // Premium Architectural Option (high-end architectural finish tier)
  const premiumLineItems = baselineLineItems.map((item) => {
    let rateFactor = 1.0;
    if (item.category === 'materials' && item.code === 'M-05') rateFactor = 1.35; // high-end timber
    if (item.category === 'materials' && item.code === 'M-03') rateFactor = 1.40; // natural stone / curtain wall
    if (item.category === 'materials' && item.code === 'M-04') rateFactor = 1.20; // enhanced acoustic drywall
    const newRate = Math.round(item.unitRate * rateFactor * 10) / 10;
    return {
      ...item,
      id: `${item.id}-prem`,
      unitRate: newRate,
      extendedCost: Math.round(item.quantity * newRate),
      notes: rateFactor > 1.0 ? 'High-end architectural finish specification' : item.notes,
    };
  });

  const premiumScenario: CostScenario = {
    id: `cost-scen-prem-${project.id}`,
    name: 'Option C: High-End Architectural Finishes',
    description: 'Bespoke architectural specifications including stone ashlar, acoustic wall treatments, and wide-plank oak flooring.',
    isBaseline: false,
    createdAt: nowIso,
    updatedAt: nowIso,
    location: 'Standard Regional Market',
    currency: project.currency,
    contingencyRatePercent: 10.0,
    taxRatePercent: 0,
    lineItems: premiumLineItems,
    sourceGeometryHash: currentGeomHash,
  };

  return {
    scenarios: [baselineScenario, veScenario, premiumScenario],
    activeScenarioId: baselineScenario.id,
    phases: getDefaultConstructionPhases(),
    targetBudget: project.budget,
    currency: project.currency,
    lastRecalculatedAt: nowIso,
    lastGeometryHash: currentGeomHash,
  };
}

/**
 * Deterministically computes cost totals, category subtotals, contingency, tax, and budget variances
 */
export function calculateCostSummary(
  scenario: CostScenario,
  targetBudget: number,
  currentProjectGeomHash?: string
): CostSummaryMetrics {
  const subtotalByCategory: Record<CostItemCategory, number> = {
    materials: 0,
    labour: 0,
    equipment: 0,
    transport: 0,
    other: 0,
  };

  let subtotal = 0;
  let missingRatesCount = 0;

  scenario.lineItems.forEach((item) => {
    const ext = Math.max(0, item.quantity * item.unitRate);
    subtotalByCategory[item.category] += ext;
    subtotal += ext;

    if (item.unitRate <= 0 || item.quantity <= 0) {
      missingRatesCount++;
    }
  });

  // Deterministic contingency
  const contingencyAmount = Math.round(subtotal * (Math.max(0, scenario.contingencyRatePercent) / 100));

  // Explicit tax calculation
  const taxableBase = subtotal + contingencyAmount;
  const taxAmount = Math.round(taxableBase * (Math.max(0, scenario.taxRatePercent) / 100));

  // Grand Total
  const estimatedTotal = subtotal + contingencyAmount + taxAmount;

  // Category shares
  const categoryPercentages: Record<CostItemCategory, number> = {
    materials: subtotal > 0 ? Math.round((subtotalByCategory.materials / subtotal) * 1000) / 10 : 0,
    labour: subtotal > 0 ? Math.round((subtotalByCategory.labour / subtotal) * 1000) / 10 : 0,
    equipment: subtotal > 0 ? Math.round((subtotalByCategory.equipment / subtotal) * 1000) / 10 : 0,
    transport: subtotal > 0 ? Math.round((subtotalByCategory.transport / subtotal) * 1000) / 10 : 0,
    other: subtotal > 0 ? Math.round((subtotalByCategory.other / subtotal) * 1000) / 10 : 0,
  };

  // Budget Variance
  const budgetVariance = targetBudget - estimatedTotal;
  const budgetVariancePercent =
    targetBudget > 0 ? Math.round((budgetVariance / targetBudget) * 1000) / 10 : 0;

  let budgetStatus: 'within-budget' | 'over-budget' | 'incomplete';
  if (missingRatesCount > 3 || subtotal === 0) {
    budgetStatus = 'incomplete';
  } else if (budgetVariance >= 0) {
    budgetStatus = 'within-budget';
  } else {
    budgetStatus = 'over-budget';
  }

  // Top Cost Drivers (sorted descending by extended cost)
  const topCostDrivers = [...scenario.lineItems]
    .sort((a, b) => b.extendedCost - a.extendedCost)
    .slice(0, 5)
    .map((item) => ({
      item,
      percentOfTotal: estimatedTotal > 0 ? Math.round((item.extendedCost / estimatedTotal) * 1000) / 10 : 0,
    }));

  const isStale = Boolean(
    currentProjectGeomHash && scenario.sourceGeometryHash !== currentProjectGeomHash
  );

  return {
    subtotalByCategory,
    categoryPercentages,
    subtotal,
    contingencyAmount,
    taxAmount,
    estimatedTotal,
    targetBudget,
    budgetVariance,
    budgetVariancePercent,
    budgetStatus,
    missingRatesCount,
    topCostDrivers,
    isStale,
  };
}
