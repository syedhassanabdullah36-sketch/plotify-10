import { Project, FloorPlanRoom, FacadeConcept } from '../types/project';
import {
  DesignScenario,
  ScenarioMetricResult,
  OptimizationWeights,
  ScenarioEvaluation,
  MetricScoreContribution,
} from '../types/scenario';
import { validateFloorPlan } from '../utils/geometry';
import { evaluateConstraintGraph } from './constraintGraphService';
import { formatCurrency } from '../utils/formatters';

export const DEFAULT_OPTIMIZATION_WEIGHTS: OptimizationWeights = {
  usableArea: 25,
  budgetEfficiency: 30,
  constraintCompliance: 25,
  carbonEfficiency: 10,
  plotEfficiency: 10,
};

export const WEIGHT_PRESETS: Record<string, { label: string; description: string; weights: OptimizationWeights }> = {
  balanced: {
    label: 'Balanced Architectural',
    description: 'Equal consideration of space, budget, regulatory compliance, and environmental footprint.',
    weights: {
      usableArea: 25,
      budgetEfficiency: 25,
      constraintCompliance: 25,
      carbonEfficiency: 15,
      plotEfficiency: 10,
    },
  },
  costFirst: {
    label: 'Budget-Conscious',
    description: 'Prioritizes remaining within budget and cost predictability above maximum footprint.',
    weights: {
      usableArea: 15,
      budgetEfficiency: 50,
      constraintCompliance: 20,
      carbonEfficiency: 10,
      plotEfficiency: 5,
    },
  },
  spatialMax: {
    label: 'Spatial Maximizer',
    description: 'Focuses on maximizing usable indoor living space and programmatic floor area.',
    weights: {
      usableArea: 50,
      budgetEfficiency: 15,
      constraintCompliance: 20,
      carbonEfficiency: 5,
      plotEfficiency: 10,
    },
  },
  sustainability: {
    label: 'Low-Carbon & Green',
    description: 'Emphasizes low embodied carbon, timber/sustainable materials, and efficient site coverage.',
    weights: {
      usableArea: 15,
      budgetEfficiency: 20,
      constraintCompliance: 25,
      carbonEfficiency: 30,
      plotEfficiency: 10,
    },
  },
};

/**
 * Base construction costs per unit area based on facade tier.
 * Feet (sq ft) vs Metres (sq m).
 */
const BASE_COST_PER_AREA: Record<'feet' | 'metres', Record<string, number>> = {
  feet: {
    'Economic': 165,
    'Balanced Mid-Range': 240,
    'High-End Architectural': 350,
    'Ultra Luxury': 520,
  },
  metres: {
    'Economic': 1750,
    'Balanced Mid-Range': 2550,
    'High-End Architectural': 3750,
    'Ultra Luxury': 5500,
  },
};

/**
 * Embodied carbon intensity benchmarks (kg CO₂e / m² of GFA)
 * Source: ICE Database & RICS Professional Standard (WLC).
 */
const MATERIAL_CARBON_FACTORS: Record<string, number> = {
  timber: 180,
  plaster: 290,
  stone: 330,
  brick: 390,
  concrete: 490,
  glass: 530,
};

/**
 * Creates the official baseline scenario from current project state
 */
export function createBaselineScenario(project: Project): DesignScenario {
  const activeAlt = project.designAlternatives?.find(
    (a) => a.id === project.activeAlternativeId
  ) || project.designAlternatives?.[0];

  return {
    id: `scenario-baseline-${project.id}`,
    name: 'Current Baseline Design',
    description: 'Authoritative project baseline reflecting current 2D plan, program, and specifications.',
    status: 'baseline',
    isBaseline: true,
    createdAt: project.createdAt || new Date().toISOString(),
    updatedAt: project.updatedAt || new Date().toISOString(),
    floors: project.floors,
    budget: project.budget,
    rooms: project.floorPlan?.rooms ? JSON.parse(JSON.stringify(project.floorPlan.rooms)) : [],
    facade: activeAlt?.facade ? JSON.parse(JSON.stringify(activeAlt.facade)) : undefined,
    notes: 'Preserves the original project without any simulated modifications.',
  };
}

/**
 * Initializes scenarios for a project, creating standard initial alternatives if none exist.
 */
export function initializeProjectScenarios(project: Project): DesignScenario[] {
  const baseline = createBaselineScenario(project);

  if (project.scenarios && project.scenarios.length > 0) {
    // Keep baseline in sync with current project
    const others = project.scenarios.filter((s) => !s.isBaseline);
    return [baseline, ...others];
  }

  // Generate 2 sensible initial exploration scenarios
  const nowIso = new Date().toISOString();
  const roomsClone: FloorPlanRoom[] = baseline.rooms.map((r) => ({ ...r }));

  // Scenario 1: Vertical Expansion (+1 Floor, expanded living area)
  const verticalRooms: FloorPlanRoom[] = roomsClone.map((r) => ({ ...r }));
  if (verticalRooms.length > 0) {
    // Duplicate some bedrooms to floor 2 or 3
    const upperRooms: FloorPlanRoom[] = [
      {
        id: `room-vert-suite-${Date.now()}`,
        name: 'Upper Studio & Terrace',
        type: 'living',
        x: verticalRooms[0].x,
        y: verticalRooms[0].y,
        width: verticalRooms[0].width,
        length: verticalRooms[0].length,
        floorLevel: baseline.floors + 1,
        color: '#e0f2fe',
      },
    ];
    verticalRooms.push(...upperRooms);
  }

  const scenarioA: DesignScenario = {
    id: `scenario-vert-${Date.now()}`,
    name: 'Scenario A: Vertical Expansion',
    description: `Adds an extra level (${baseline.floors + 1} floors total) to increase usable floor area while preserving ground footprint.`,
    status: 'saved',
    isBaseline: false,
    createdAt: nowIso,
    updatedAt: nowIso,
    floors: baseline.floors + 1,
    budget: Math.round(baseline.budget * 1.25),
    rooms: verticalRooms,
    facade: baseline.facade
      ? {
          ...baseline.facade,
          costTier: 'High-End Architectural',
          primaryMaterial: 'timber',
          notes: 'Vertical extension with engineered glulam and lightweight timber facade.',
        }
      : undefined,
    notes: 'Optimized for larger family or studio requirements within the same plot boundary.',
  };

  // Scenario 2: Compact High-Efficiency / Low-Carbon
  const compactRooms: FloorPlanRoom[] = roomsClone.map((r) => ({
    ...r,
    width: Math.max(2, Math.round(r.width * 0.9 * 10) / 10),
    length: Math.max(2, Math.round(r.length * 0.9 * 10) / 10),
  }));

  const scenarioB: DesignScenario = {
    id: `scenario-compact-${Date.now() + 1}`,
    name: 'Scenario B: Eco-Compact & Budget Streamlined',
    description: 'Downsizes room envelopes by ~10% for superior thermal efficiency, lower embodied carbon, and substantial cost reduction.',
    status: 'saved',
    isBaseline: false,
    createdAt: nowIso,
    updatedAt: nowIso,
    floors: baseline.floors,
    budget: Math.round(baseline.budget * 0.85),
    rooms: compactRooms,
    facade: baseline.facade
      ? {
          ...baseline.facade,
          costTier: 'Balanced Mid-Range',
          primaryMaterial: 'timber',
          shadingStyle: 'deep-overhangs',
          notes: 'Sustainable timber envelope with deep passive overhangs.',
        }
      : undefined,
    notes: 'Prioritizes sustainability, passive shading, and reduced capital outlay.',
  };

  return [baseline, scenarioA, scenarioB];
}

/**
 * Calculates deterministic total area from room list
 */
export function calculateRoomsUsableArea(rooms: FloorPlanRoom[]): number {
  return rooms.reduce((acc, r) => {
    const w = typeof r.width === 'number' && r.width > 0 ? r.width : 0;
    const l = typeof r.length === 'number' && r.length > 0 ? r.length : 0;
    return acc + w * l;
  }, 0);
}

/**
 * Calculates Gross Floor Area (GFA) incorporating floor counts and circulation
 */
export function calculateGFA(rooms: FloorPlanRoom[], floors: number): number {
  const usable = calculateRoomsUsableArea(rooms);
  if (usable === 0) return 0;

  // Group rooms by floorLevel if assigned, or scale by floors
  const maxFloor = Math.max(floors, ...rooms.map((r) => r.floorLevel || 1));
  const hasMultiLevelRooms = rooms.some((r) => (r.floorLevel || 1) > 1);

  let gfa: number;
  if (hasMultiLevelRooms) {
    // Rooms are already placed on explicit floors: add 12% standard circulation/walls
    gfa = usable * 1.12;
  } else {
    // Rooms represent typical footprint: multiply by floor count
    gfa = usable * floors * 1.10;
  }

  return Math.round(gfa * 10) / 10;
}

/**
 * Calculates footprint on ground floor
 */
export function calculateGroundFootprint(rooms: FloorPlanRoom[]): number {
  const groundRooms = rooms.filter((r) => !r.floorLevel || r.floorLevel === 1);
  return calculateRoomsUsableArea(groundRooms.length > 0 ? groundRooms : rooms);
}

/**
 * Calculates estimated construction cost based on deterministic engineering rates
 */
export function calculateEstimatedCost(
  gfa: number,
  floors: number,
  unit: 'feet' | 'metres',
  costTier: string = 'Balanced Mid-Range'
): number {
  if (gfa <= 0) return 0;

  const unitRates = BASE_COST_PER_AREA[unit] || BASE_COST_PER_AREA['feet'];
  const baseRate = unitRates[costTier] || unitRates['Balanced Mid-Range'];

  // Multi-story vertical complexity factor (+6% per floor beyond 1)
  const verticalMultiplier = 1 + Math.max(0, floors - 1) * 0.06;

  return Math.round(gfa * baseRate * verticalMultiplier);
}

/**
 * Calculates embodied carbon footprint based on GFA and primary material
 */
export function calculateEmbodiedCarbon(
  gfa: number,
  unit: 'feet' | 'metres',
  primaryMaterial: string = 'concrete'
): { totalTonnes: number; intensityKgPerM2: number } {
  if (gfa <= 0) return { totalTonnes: 0, intensityKgPerM2: 0 };

  // Convert GFA to m² for carbon calculation
  const gfaM2 = unit === 'feet' ? gfa * 0.092903 : gfa;
  const factor = MATERIAL_CARBON_FACTORS[primaryMaterial] || MATERIAL_CARBON_FACTORS['concrete'];

  const totalKg = gfaM2 * factor;
  return {
    totalTonnes: Math.round((totalKg / 1000) * 10) / 10,
    intensityKgPerM2: Math.round(factor),
  };
}

/**
 * Formats delta with explicit +/- sign
 */
function formatDelta(delta: number, decimals: number = 1): string {
  if (Math.abs(delta) < 0.001) return '0.0';
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta.toFixed(decimals)}`;
}

/**
 * Formats percentage change with zero safety
 */
function formatPercentDelta(delta: number, baseline: number): { percent: number | null; display: string } {
  if (baseline === 0) {
    if (delta === 0) return { percent: 0, display: '0%' };
    return { percent: null, display: 'N/A (base 0)' };
  }
  const pct = (delta / baseline) * 100;
  const sign = pct > 0 ? '+' : '';
  return { percent: Math.round(pct * 10) / 10, display: `${sign}${pct.toFixed(1)}%` };
}

/**
 * Evaluates a scenario against the baseline project and computes all impact metrics deterministically.
 */
export function evaluateScenario(
  project: Project,
  baseline: DesignScenario,
  scenario: DesignScenario,
  weights: OptimizationWeights = DEFAULT_OPTIMIZATION_WEIGHTS
): ScenarioEvaluation {
  const unitSuffix = project.unit === 'feet' ? 'ft' : 'm';
  const areaUnit = project.unit === 'feet' ? 'sq ft' : 'm²';
  const plotArea = project.plotWidth * project.plotLength;

  // Baseline values
  const bUsableArea = calculateRoomsUsableArea(baseline.rooms);
  const bGFA = calculateGFA(baseline.rooms, baseline.floors);
  const bFootprint = calculateGroundFootprint(baseline.rooms);
  const bPlotUtilization = plotArea > 0 ? (bFootprint / plotArea) * 100 : 0;
  const bTier = baseline.facade?.costTier || 'Balanced Mid-Range';
  const bEstCost = calculateEstimatedCost(bGFA, baseline.floors, project.unit, bTier);
  const bBudgetDelta = baseline.budget - bEstCost;
  const bMat = baseline.facade?.primaryMaterial || 'concrete';
  const bCarbon = calculateEmbodiedCarbon(bGFA, project.unit, bMat);

  // Scenario values
  const sUsableArea = calculateRoomsUsableArea(scenario.rooms);
  const sGFA = calculateGFA(scenario.rooms, scenario.floors);
  const sFootprint = calculateGroundFootprint(scenario.rooms);
  const sPlotUtilization = plotArea > 0 ? (sFootprint / plotArea) * 100 : 0;
  const sTier = scenario.facade?.costTier || baseline.facade?.costTier || 'Balanced Mid-Range';
  const sEstCost = calculateEstimatedCost(sGFA, scenario.floors, project.unit, sTier);
  const sBudgetDelta = scenario.budget - sEstCost;
  const sMat = scenario.facade?.primaryMaterial || baseline.facade?.primaryMaterial || 'concrete';
  const sCarbon = calculateEmbodiedCarbon(sGFA, project.unit, sMat);

  // Geometry collisions
  const sGeomValidation = validateFloorPlan(
    { rooms: scenario.rooms } as any,
    project.plotWidth,
    project.plotLength,
    project.unit
  );
  const bGeomValidation = validateFloorPlan(
    { rooms: baseline.rooms } as any,
    project.plotWidth,
    project.plotLength,
    project.unit
  );

  const sConflictCount =
    sGeomValidation.boundaryViolations.length + sGeomValidation.overlapViolations.length;
  const bConflictCount =
    bGeomValidation.boundaryViolations.length + bGeomValidation.overlapViolations.length;

  // Living Constraint Graph evaluation
  const scenarioMockProject: Project = {
    ...project,
    floors: scenario.floors,
    budget: scenario.budget,
    floorPlan: { rooms: scenario.rooms },
  };
  const scenarioGraphState = evaluateConstraintGraph(scenarioMockProject);
  const baselineMockProject: Project = {
    ...project,
    floors: baseline.floors,
    budget: baseline.budget,
    floorPlan: { rooms: baseline.rooms },
  };
  const baselineGraphState = evaluateConstraintGraph(baselineMockProject);

  const sPassingConstraints = scenarioGraphState.summary.passing;
  const bPassingConstraints = baselineGraphState.summary.passing;
  const sTotalConstraints = scenarioGraphState.summary.total;
  const sCompliancePct =
    sTotalConstraints > 0 ? (sPassingConstraints / sTotalConstraints) * 100 : 100;

  // Build metric comparison records
  const metrics: ScenarioMetricResult[] = [];

  // 1. Usable Room Area
  const usableDelta = sUsableArea - bUsableArea;
  const usablePct = formatPercentDelta(usableDelta, bUsableArea);
  metrics.push({
    id: 'usable-area',
    name: 'Usable Room Area',
    category: 'spatial',
    baselineRaw: bUsableArea,
    scenarioRaw: sUsableArea,
    baselineDisplay: `${bUsableArea.toFixed(1)} ${areaUnit}`,
    scenarioDisplay: `${sUsableArea.toFixed(1)} ${areaUnit}`,
    absoluteDelta: usableDelta,
    absoluteDeltaDisplay: `${formatDelta(usableDelta)} ${areaUnit}`,
    percentChange: usablePct.percent,
    percentChangeDisplay: usablePct.display,
    unit: areaUnit,
    status: sUsableArea > 0 ? 'calculated' : 'warning',
    statusMessage: sUsableArea > 0 ? 'Calculated from net interior room boundaries' : 'No rooms defined',
    assumptions: 'Sum of interior room dimensions (W × L), excluding partition wall thicknesses.',
    higherIsBetter: true,
  });

  // 2. Gross Floor Area (GFA)
  const gfaDelta = sGFA - bGFA;
  const gfaPct = formatPercentDelta(gfaDelta, bGFA);
  metrics.push({
    id: 'gross-floor-area',
    name: 'Gross Floor Area (GFA)',
    category: 'spatial',
    baselineRaw: bGFA,
    scenarioRaw: sGFA,
    baselineDisplay: `${bGFA.toFixed(1)} ${areaUnit}`,
    scenarioDisplay: `${sGFA.toFixed(1)} ${areaUnit}`,
    absoluteDelta: gfaDelta,
    absoluteDeltaDisplay: `${formatDelta(gfaDelta)} ${areaUnit}`,
    percentChange: gfaPct.percent,
    percentChangeDisplay: gfaPct.display,
    unit: areaUnit,
    status: 'calculated',
    statusMessage: 'Calculated across all programmed floor levels with standard circulation envelope',
    assumptions: 'Incorporates multi-level floor multiplication and 10–12% circulation/structural wall factor.',
    higherIsBetter: true,
  });

  // 3. Plot Utilization / Coverage
  const covDelta = sPlotUtilization - bPlotUtilization;
  const covPct = formatPercentDelta(covDelta, bPlotUtilization);
  const coverageStatus = sPlotUtilization > 80 ? 'warning' : 'calculated';
  metrics.push({
    id: 'plot-utilization',
    name: 'Plot Ground Coverage Ratio',
    category: 'spatial',
    baselineRaw: bPlotUtilization,
    scenarioRaw: sPlotUtilization,
    baselineDisplay: `${bPlotUtilization.toFixed(1)}%`,
    scenarioDisplay: `${sPlotUtilization.toFixed(1)}%`,
    absoluteDelta: covDelta,
    absoluteDeltaDisplay: `${formatDelta(covDelta, 1)}%`,
    percentChange: covPct.percent,
    percentChangeDisplay: covPct.display,
    unit: '%',
    status: coverageStatus,
    statusMessage: sPlotUtilization > 80 ? 'Warning: High plot coverage (>80%) may breach local zoning setbacks' : 'Calculated within parcel boundary',
    assumptions: 'Ground footprint divided by total parcel area (Width × Length).',
    higherIsBetter: 'neutral',
  });

  // 4. Floor Count & Room Count
  const floorDelta = scenario.floors - baseline.floors;
  const floorPct = formatPercentDelta(floorDelta, baseline.floors);
  metrics.push({
    id: 'floor-count',
    name: 'Building Height (Floors)',
    category: 'spatial',
    baselineRaw: baseline.floors,
    scenarioRaw: scenario.floors,
    baselineDisplay: `${baseline.floors} ${baseline.floors === 1 ? 'Floor' : 'Floors'}`,
    scenarioDisplay: `${scenario.floors} ${scenario.floors === 1 ? 'Floor' : 'Floors'}`,
    absoluteDelta: floorDelta,
    absoluteDeltaDisplay: formatDelta(floorDelta, 0),
    percentChange: floorPct.percent,
    percentChangeDisplay: floorPct.display,
    unit: 'levels',
    status: 'calculated',
    statusMessage: 'Design verticality parameter',
    assumptions: 'Vertical building height level configuration.',
    higherIsBetter: 'neutral',
  });

  // 5. Estimated Construction Cost
  const costDelta = sEstCost - bEstCost;
  const costPct = formatPercentDelta(costDelta, bEstCost);
  metrics.push({
    id: 'construction-cost',
    name: 'Estimated Construction Cost',
    category: 'financial',
    baselineRaw: bEstCost,
    scenarioRaw: sEstCost,
    baselineDisplay: formatCurrency(bEstCost, project.currency),
    scenarioDisplay: formatCurrency(sEstCost, project.currency),
    absoluteDelta: costDelta,
    absoluteDeltaDisplay: `${costDelta >= 0 ? '+' : ''}${formatCurrency(costDelta, project.currency)}`,
    percentChange: costPct.percent,
    percentChangeDisplay: costPct.display,
    unit: project.currency,
    status: sEstCost > scenario.budget ? 'warning' : 'calculated',
    statusMessage: sEstCost > scenario.budget ? `Over declared budget by ${formatCurrency(sEstCost - scenario.budget, project.currency)}` : 'Within declared budget target',
    assumptions: `Based on ${sTier} baseline rates (${project.unit === 'feet' ? '$' + BASE_COST_PER_AREA['feet'][sTier] + '/sq ft' : '€' + BASE_COST_PER_AREA['metres'][sTier] + '/m²'}) plus vertical structural complexity premium.`,
    higherIsBetter: false,
  });

  // 6. Declared Budget Variance
  const budgetVarDelta = sBudgetDelta - bBudgetDelta;
  const bVarPct = formatPercentDelta(budgetVarDelta, Math.abs(bBudgetDelta) || 1);
  metrics.push({
    id: 'budget-variance',
    name: 'Budget Surplus / (Deficit)',
    category: 'financial',
    baselineRaw: bBudgetDelta,
    scenarioRaw: sBudgetDelta,
    baselineDisplay: `${bBudgetDelta >= 0 ? '+' : ''}${formatCurrency(bBudgetDelta, project.currency)}`,
    scenarioDisplay: `${sBudgetDelta >= 0 ? '+' : ''}${formatCurrency(sBudgetDelta, project.currency)}`,
    absoluteDelta: budgetVarDelta,
    absoluteDeltaDisplay: `${budgetVarDelta >= 0 ? '+' : ''}${formatCurrency(budgetVarDelta, project.currency)}`,
    percentChange: bVarPct.percent,
    percentChangeDisplay: bVarPct.display,
    unit: project.currency,
    status: sBudgetDelta < 0 ? 'warning' : 'calculated',
    statusMessage: sBudgetDelta < 0 ? 'Deficit: Estimated cost exceeds declared budget' : 'Surplus: Budget sufficient for projected construction',
    assumptions: 'Calculated as Declared Scenario Budget minus Estimated Cost.',
    higherIsBetter: true,
  });

  // 7. Geometry Overlaps & Clearance Conflicts
  const geomDelta = sConflictCount - bConflictCount;
  const geomStatus = sConflictCount > 0 ? 'conflict' : 'calculated';
  metrics.push({
    id: 'geometry-conflicts',
    name: 'Geometry & Boundary Conflicts',
    category: 'compliance',
    baselineRaw: bConflictCount,
    scenarioRaw: sConflictCount,
    baselineDisplay: `${bConflictCount} conflict${bConflictCount === 1 ? '' : 's'}`,
    scenarioDisplay: `${sConflictCount} conflict${sConflictCount === 1 ? '' : 's'}`,
    absoluteDelta: geomDelta,
    absoluteDeltaDisplay: formatDelta(geomDelta, 0),
    percentChange: null,
    percentChangeDisplay: geomDelta === 0 ? 'No change' : geomDelta > 0 ? `+${geomDelta} added` : `${geomDelta} resolved`,
    unit: 'issues',
    status: geomStatus,
    statusMessage: sConflictCount > 0
      ? `${sGeomValidation.boundaryViolations.length} boundary violations, ${sGeomValidation.overlapViolations.length} room overlaps detected`
      : 'Clean layout: All rooms within boundaries with zero overlapping geometry',
    assumptions: 'Axis-Aligned Bounding Box (AABB) collision detection and parcel perimeter containment.',
    higherIsBetter: false,
  });

  // 8. Living Constraint Graph Compliance
  const cRateDelta = sCompliancePct - (baselineGraphState.summary.total > 0 ? (bPassingConstraints / baselineGraphState.summary.total) * 100 : 100);
  metrics.push({
    id: 'constraint-compliance',
    name: 'Living Constraint Graph Passing Rate',
    category: 'compliance',
    baselineRaw: bPassingConstraints,
    scenarioRaw: sPassingConstraints,
    baselineDisplay: `${sTotalConstraints > 0 ? Math.round((bPassingConstraints / baselineGraphState.summary.total) * 100) : 100}% (${bPassingConstraints}/${baselineGraphState.summary.total})`,
    scenarioDisplay: `${Math.round(sCompliancePct)}% (${sPassingConstraints}/${sTotalConstraints})`,
    absoluteDelta: cRateDelta,
    absoluteDeltaDisplay: `${formatDelta(cRateDelta, 1)}%`,
    percentChange: null,
    percentChangeDisplay: formatDelta(cRateDelta, 1) + '%',
    unit: '%',
    status: scenarioGraphState.summary.conflicts > 0 ? 'warning' : 'calculated',
    statusMessage: `${scenarioGraphState.summary.passing} passing, ${scenarioGraphState.summary.conflicts} conflicts, ${scenarioGraphState.summary.pending} pending`,
    assumptions: 'Deterministic evaluation of Plotify Living Constraint Graph across envelope, program, geometry, and budget rules.',
    higherIsBetter: true,
  });

  // 9. Embodied Carbon Footprint
  const carbonDelta = sCarbon.totalTonnes - bCarbon.totalTonnes;
  const carbonPct = formatPercentDelta(carbonDelta, bCarbon.totalTonnes);
  metrics.push({
    id: 'embodied-carbon',
    name: 'Estimated Embodied Carbon',
    category: 'environmental',
    baselineRaw: bCarbon.totalTonnes,
    scenarioRaw: sCarbon.totalTonnes,
    baselineDisplay: `${bCarbon.totalTonnes.toFixed(1)} t CO₂e`,
    scenarioDisplay: `${sCarbon.totalTonnes.toFixed(1)} t CO₂e`,
    absoluteDelta: carbonDelta,
    absoluteDeltaDisplay: `${formatDelta(carbonDelta, 1)} t CO₂e`,
    percentChange: carbonPct.percent,
    percentChangeDisplay: carbonPct.display,
    unit: 't CO₂e',
    status: 'calculated',
    statusMessage: `Material intensity factor: ${sCarbon.intensityKgPerM2} kg CO₂e/m² (${sMat})`,
    assumptions: 'Cradle-to-gate upfront embodied carbon (A1-A3) derived from RICS standard benchmarks by primary structural/facade material.',
    higherIsBetter: false,
  });

  // ==========================================
  // MULTI-CRITERIA NORMALIZATION & SCORING
  // ==========================================
  const totalWeight =
    weights.usableArea +
    weights.budgetEfficiency +
    weights.constraintCompliance +
    weights.carbonEfficiency +
    weights.plotEfficiency || 100;

  // 1. Usable Area Score: baseline gives 70 pts. Scaled up/down by area ratio.
  const areaRatio = bUsableArea > 0 ? sUsableArea / bUsableArea : 1;
  const normAreaScore = Math.min(100, Math.max(0, Math.round(70 * areaRatio)));

  // 2. Budget Score: 100 if within budget, penalized linearly for overrun
  let normBudgetScore = 75;
  if (scenario.budget > 0) {
    if (sEstCost <= scenario.budget) {
      const savingsRatio = (scenario.budget - sEstCost) / scenario.budget;
      normBudgetScore = Math.min(100, 75 + Math.round(savingsRatio * 25));
    } else {
      const overrunRatio = (sEstCost - scenario.budget) / scenario.budget;
      normBudgetScore = Math.max(0, 75 - Math.round(overrunRatio * 150));
    }
  }

  // 3. Compliance Score: direct constraint % penalized by geometry overlaps
  const geomPenalty = sConflictCount * 15;
  const normComplianceScore = Math.max(0, Math.round(sCompliancePct - geomPenalty));

  // 4. Carbon Score: benchmark compared to baseline (100 is lowest carbon)
  const carbonRatio = bCarbon.totalTonnes > 0 ? sCarbon.totalTonnes / bCarbon.totalTonnes : 1;
  const normCarbonScore = Math.min(100, Math.max(0, Math.round(70 * (2 - carbonRatio))));

  // 5. Plot Efficiency: healthy target is 40-65% coverage
  let normPlotScore = 80;
  if (sPlotUtilization > 80) {
    normPlotScore = Math.max(20, 80 - (sPlotUtilization - 80) * 3);
  } else if (sPlotUtilization < 20 && sPlotUtilization > 0) {
    normPlotScore = 60;
  }

  const scoreBreakdown: MetricScoreContribution[] = [
    {
      metricId: 'usableArea',
      name: 'Usable Living Space',
      rawValue: sUsableArea,
      normalizedScore: normAreaScore,
      weight: weights.usableArea,
      weightedPoints: Math.round(((normAreaScore * weights.usableArea) / totalWeight) * 10) / 10,
    },
    {
      metricId: 'budgetEfficiency',
      name: 'Budget & Cost Feasibility',
      rawValue: sBudgetDelta,
      normalizedScore: normBudgetScore,
      weight: weights.budgetEfficiency,
      weightedPoints: Math.round(((normBudgetScore * weights.budgetEfficiency) / totalWeight) * 10) / 10,
    },
    {
      metricId: 'constraintCompliance',
      name: 'Regulatory & Geometry Compliance',
      rawValue: sCompliancePct,
      normalizedScore: normComplianceScore,
      weight: weights.constraintCompliance,
      weightedPoints: Math.round(((normComplianceScore * weights.constraintCompliance) / totalWeight) * 10) / 10,
    },
    {
      metricId: 'carbonEfficiency',
      name: 'Embodied Carbon Performance',
      rawValue: sCarbon.totalTonnes,
      normalizedScore: normCarbonScore,
      weight: weights.carbonEfficiency,
      weightedPoints: Math.round(((normCarbonScore * weights.carbonEfficiency) / totalWeight) * 10) / 10,
    },
    {
      metricId: 'plotEfficiency',
      name: 'Plot Site Utilization',
      rawValue: sPlotUtilization,
      normalizedScore: normPlotScore,
      weight: weights.plotEfficiency,
      weightedPoints: Math.round(((normPlotScore * weights.plotEfficiency) / totalWeight) * 10) / 10,
    },
  ];

  const compositeScore = Math.min(
    100,
    Math.max(
      0,
      Math.round(scoreBreakdown.reduce((sum, item) => sum + item.weightedPoints, 0))
    )
  );

  // Key Strengths & Risks
  const keyStrengths: string[] = [];
  const keyRisks: string[] = [];

  if (usableDelta > 0) {
    keyStrengths.push(`+${usablePct.display} usable floor area (${formatDelta(usableDelta)} ${areaUnit})`);
  }
  if (sEstCost <= scenario.budget) {
    keyStrengths.push(`Within declared budget (+${formatCurrency(sBudgetDelta, project.currency)} contingency reserve)`);
  }
  if (carbonDelta < 0) {
    keyStrengths.push(`${carbonPct.display} lower embodied carbon emissions`);
  }
  if (sConflictCount === 0 && scenarioGraphState.summary.conflicts === 0) {
    keyStrengths.push('Full regulatory and spatial boundary compliance (zero conflicts)');
  }

  if (sEstCost > scenario.budget) {
    keyRisks.push(`Exceeds budget target by ${formatCurrency(sEstCost - scenario.budget, project.currency)}`);
  }
  if (sConflictCount > 0) {
    keyRisks.push(`${sConflictCount} geometry / setback clearance conflict(s) detected`);
  }
  if (sPlotUtilization > 80) {
    keyRisks.push(`Plot coverage (${sPlotUtilization.toFixed(1)}%) exceeds recommended 80% maximum`);
  }
  if (carbonDelta > 0) {
    keyRisks.push(`+${carbonPct.display} higher embodied carbon footprint`);
  }

  // Trade-Off Narrative (Pareto articulation)
  const tradeOffSummary: string[] = [];
  if (usableDelta > 0 && costDelta > 0) {
    tradeOffSummary.push(
      `Expands living area by +${usablePct.display} (+${usableDelta.toFixed(1)} ${areaUnit}), but increases estimated cost by ${formatCurrency(costDelta, project.currency)}.`
    );
  } else if (usableDelta < 0 && costDelta < 0) {
    tradeOffSummary.push(
      `Reduces construction cost by ${formatCurrency(Math.abs(costDelta), project.currency)} (${costPct.display}), at the expense of -${Math.abs(usableDelta).toFixed(1)} ${areaUnit} interior space.`
    );
  }

  if (carbonDelta < 0 && sMat !== bMat) {
    tradeOffSummary.push(
      `Specifying ${sMat} cuts upfront embodied carbon by ${Math.abs(carbonDelta).toFixed(1)} t CO₂e.`
    );
  }

  if (sConflictCount > bConflictCount) {
    tradeOffSummary.push(
      `Introduces ${sConflictCount - bConflictCount} new boundary/overlap conflict(s) requiring manual adjustment.`
    );
  }

  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    metrics,
    compositeScore,
    scoreBreakdown,
    isParetoOptimal: false, // Calculated across scenario collection
    tradeOffSummary,
    keyStrengths,
    keyRisks,
  };
}

/**
 * Calculates Pareto optimality across a set of evaluated scenarios.
 * A scenario is Pareto-optimal if no other scenario is strictly better in all criteria without being worse in any.
 */
export function computeParetoOptimality(evaluations: ScenarioEvaluation[]): ScenarioEvaluation[] {
  if (evaluations.length <= 1) {
    return evaluations.map((e) => ({ ...e, isParetoOptimal: true }));
  }

  return evaluations.map((target) => {
    // Check if target is dominated by any other candidate
    const isDominated = evaluations.some((other) => {
      if (other.scenarioId === target.scenarioId) return false;

      let strictlyBetterInAtLeastOne = false;
      let atLeastAsGoodInAll = true;

      // Criteria: Usable Area (higher), Cost (lower), Conflicts (lower), Carbon (lower)
      const targetArea = (target.metrics.find((m) => m.id === 'usable-area')?.scenarioRaw as number) || 0;
      const otherArea = (other.metrics.find((m) => m.id === 'usable-area')?.scenarioRaw as number) || 0;

      const targetCost = (target.metrics.find((m) => m.id === 'construction-cost')?.scenarioRaw as number) || 0;
      const otherCost = (other.metrics.find((m) => m.id === 'construction-cost')?.scenarioRaw as number) || 0;

      const targetConflicts = (target.metrics.find((m) => m.id === 'geometry-conflicts')?.scenarioRaw as number) || 0;
      const otherConflicts = (other.metrics.find((m) => m.id === 'geometry-conflicts')?.scenarioRaw as number) || 0;

      const targetCarbon = (target.metrics.find((m) => m.id === 'embodied-carbon')?.scenarioRaw as number) || 0;
      const otherCarbon = (other.metrics.find((m) => m.id === 'embodied-carbon')?.scenarioRaw as number) || 0;

      // Area
      if (otherArea > targetArea) strictlyBetterInAtLeastOne = true;
      if (otherArea < targetArea) atLeastAsGoodInAll = false;

      // Cost
      if (otherCost < targetCost) strictlyBetterInAtLeastOne = true;
      if (otherCost > targetCost) atLeastAsGoodInAll = false;

      // Conflicts
      if (otherConflicts < targetConflicts) strictlyBetterInAtLeastOne = true;
      if (otherConflicts > targetConflicts) atLeastAsGoodInAll = false;

      // Carbon
      if (otherCarbon < targetCarbon) strictlyBetterInAtLeastOne = true;
      if (otherCarbon > targetCarbon) atLeastAsGoodInAll = false;

      return strictlyBetterInAtLeastOne && atLeastAsGoodInAll;
    });

    return {
      ...target,
      isParetoOptimal: !isDominated,
    };
  });
}
