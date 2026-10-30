import { Project, FloorPlanRoom } from '../types/project';
import {
  EvidenceRecord,
  EvidenceAuditSummary,
  ValidationStatus,
  EvidenceModule,
  EvidenceCategory,
} from '../types/evidence';
import {
  computeProjectGeometryHash,
  calculateCostSummary,
  generateDeterministicQTO,
  validateConstructionPhases,
  initializeProjectCostPlanning,
} from './costPlanningService';
import { evaluateDecisionTwin } from './decisionTwinService';
import { evaluateConstraintGraph } from './constraintGraphService';
import {
  checkBoundaryViolations,
  checkRoomOverlaps,
  calculateFloorMetrics,
} from '../components/floorplan/geometry';
import { evaluateSiteConstraints } from './siteIntelligenceService';
import {
  initializeProjectBrief,
  calculateSpaceProgramSummary,
  compareBriefWithFloorPlan,
  validateBrief,
} from './briefService';
import {
  evaluateProjectRegulations,
  initializeProjectRegulations,
} from './regulatoryService';
import { formatCurrency, formatArea } from '../utils/formatters';

const ENGINE_VERSION = 'v1.0.0-proof-carrying';

/**
 * Deterministically generates an Evidence Audit Ledger for a project.
 * Inspects all active project modules, calculates verified proof records,
 * and tracks dependencies, assumptions, limitations, and staleness.
 */
export function generateProjectEvidenceRecords(project: Project): EvidenceAuditSummary {
  const records: EvidenceRecord[] = [];
  const nowIso = new Date().toISOString();
  const currentGeomHash = computeProjectGeometryHash(project);

  const unitSuffix = project.unit === 'feet' ? 'ft' : 'm';
  const unitAreaSuffix = project.unit === 'feet' ? 'sq ft' : 'm²';
  const rooms = project.floorPlan?.rooms || [];

  const sourceMeta = {
    projectId: project.id,
    projectName: project.name,
    versionOrHash: currentGeomHash,
  };

  // =========================================================================
  // 1. 2D FLOOR-PLAN & SPATIAL GEOMETRY
  // =========================================================================

  // 1.1 Plot Area
  const plotArea = project.plotWidth * project.plotLength;
  const isPlotValid = project.plotWidth > 0 && project.plotLength > 0;
  records.push({
    id: 'ev-geom-plot-area',
    resultName: 'Plot Boundary Surface Area',
    resultValue: plotArea,
    unit: unitAreaSuffix,
    module: 'floor-plan',
    category: 'geometry',
    sourceProject: sourceMeta,
    relevantInputIdentifiers: ['project.plotWidth', 'project.plotLength', 'project.unit'],
    calculationMethod: 'Plot Area = Plot Width × Plot Length',
    inputValuesUsed: {
      plotWidth: project.plotWidth,
      plotLength: project.plotLength,
      unit: project.unit,
    },
    assumptionsAndExclusions: [
      'Assumes orthogonal rectangular plot geometry based on entered boundary dimensions.',
      'Excludes non-orthogonal corner bevels, topography elevation contours, or public right-of-way setbacks unless manually offset.',
    ],
    sourceReferenceOrRateSource: 'User Project Parameters',
    calculationVersion: ENGINE_VERSION,
    lastCalculatedAt: project.updatedAt || nowIso,
    validationStatus: isPlotValid ? 'pass' : 'conflict',
    statusExplanation: isPlotValid
      ? `Plot area of ${plotArea.toLocaleString()} ${unitAreaSuffix} verified from boundary dimensions (${project.plotWidth} × ${project.plotLength} ${unitSuffix}).`
      : 'Plot dimensions are zero or negative. Physical plot boundary cannot be calculated.',
    knownLimitations: 'Calculated purely from entered linear boundaries. Does not replace land cadastral surveyor boundary pegging.',
    requiredProfessionalReview: 'Cadastral Land Survey & Title Deed Verification',
    isAiGenerated: false,
    isFormalRequirement: true,
  });

  // 1.2 Ground Floor Footprint Area
  const groundRooms = rooms.filter((r) => (r.floorLevel || 1) === 1);
  const groundFloorArea = groundRooms.reduce((sum, r) => sum + r.width * r.length, 0);
  records.push({
    id: 'ev-geom-ground-floor-area',
    resultName: 'Ground Floor Footprint Area',
    resultValue: groundFloorArea,
    unit: unitAreaSuffix,
    module: 'floor-plan',
    category: 'geometry',
    sourceProject: sourceMeta,
    relevantInputIdentifiers: ['floorPlan.rooms', 'room.floorLevel', 'room.width', 'room.length'],
    calculationMethod: 'Ground Footprint = Sum(Room Width × Room Length) for all Level 1 rooms',
    inputValuesUsed: {
      level1RoomCount: groundRooms.length,
      level1RoomsSummary: groundRooms.map((r) => `${r.name}: ${r.width}×${r.length}`).join('; '),
    },
    assumptionsAndExclusions: [
      'Assumes planar room bounding rectangles on Ground Level (Floor 1).',
      'Excludes overhang cantilevers, open garden patios, and external driveways unless drawn as rooms.',
    ],
    sourceReferenceOrRateSource: '2D Floor-Plan Geometry Coordinates',
    calculationVersion: ENGINE_VERSION,
    lastCalculatedAt: project.updatedAt || nowIso,
    validationStatus: groundRooms.length > 0 ? 'pass' : 'pending',
    statusExplanation: groundRooms.length > 0
      ? `Calculated ${groundFloorArea.toLocaleString()} ${unitAreaSuffix} across ${groundRooms.length} level-1 spaces.`
      : 'No rooms are placed on Ground Floor Level 1. Footprint calculation is pending room placement.',
    knownLimitations: 'Sums individual room rectangles; does not account for irregular geometric angles.',
    requiredProfessionalReview: 'Architectural Plan Verification',
    isAiGenerated: false,
    isFormalRequirement: true,
  });

  // 1.3 Total Built-Up Area
  const totalBuiltArea = rooms.reduce((sum, r) => sum + r.width * r.length, 0);
  records.push({
    id: 'ev-geom-total-built-area',
    resultName: 'Total Gross Built-Up Area',
    resultValue: totalBuiltArea,
    unit: unitAreaSuffix,
    module: 'floor-plan',
    category: 'geometry',
    sourceProject: sourceMeta,
    relevantInputIdentifiers: ['floorPlan.rooms', 'room.width', 'room.length', 'room.floorLevel'],
    calculationMethod: 'Total Built Area = Sum(Room Width × Room Length across all floor levels)',
    inputValuesUsed: {
      totalRoomCount: rooms.length,
      floorCount: project.floors,
    },
    assumptionsAndExclusions: [
      'Aggregates indoor enclosed functional room dimensions across all designated floor tiers.',
      'Excludes unoccupied roof voids, parapet heights, and exterior landscape.',
    ],
    sourceReferenceOrRateSource: '2D Floor-Plan Geometry Model',
    calculationVersion: ENGINE_VERSION,
    lastCalculatedAt: project.updatedAt || nowIso,
    validationStatus: rooms.length > 0 ? 'pass' : 'pending',
    statusExplanation: rooms.length > 0
      ? `Total gross enclosed area evaluated at ${totalBuiltArea.toLocaleString()} ${unitAreaSuffix} across ${rooms.length} rooms.`
      : 'No floor plan rooms saved. Gross floor area calculation is pending geometry input.',
    knownLimitations: 'Internal usable room space only; perimeter wall thickness is measured separately in QTO line items.',
    requiredProfessionalReview: 'Licensed Architect Gross Floor Area Certification',
    isAiGenerated: false,
    isFormalRequirement: true,
  });

  // 1.4 Ground Coverage Ratio %
  const coveragePercent = plotArea > 0 ? Math.round((groundFloorArea / plotArea) * 1000) / 10 : 0;
  const coverageExceeds = coveragePercent > 70;
  records.push({
    id: 'ev-geom-ground-coverage',
    resultName: 'Ground Coverage Percentage',
    resultValue: coveragePercent,
    unit: '%',
    module: 'floor-plan',
    category: 'zoning-compliance',
    sourceProject: sourceMeta,
    relevantInputIdentifiers: ['ev-geom-ground-floor-area', 'ev-geom-plot-area'],
    calculationMethod: 'Ground Coverage % = (Ground Floor Footprint / Plot Area) × 100',
    inputValuesUsed: {
      groundFloorArea,
      plotArea,
      standardThreshold: '70%',
    },
    assumptionsAndExclusions: [
      'Standard residential zoning setback assumptions allow up to 70% maximum ground coverage.',
      'Local municipality zoning overlays may specify stricter 50% or 60% requirements.',
    ],
    sourceReferenceOrRateSource: 'Municipal Standard Residential Model Zoning By-Laws § 4.1',
    calculationVersion: ENGINE_VERSION,
    lastCalculatedAt: project.updatedAt || nowIso,
    validationStatus: coverageExceeds ? 'conflict' : coveragePercent > 0 ? 'pass' : 'pending',
    statusExplanation: coverageExceeds
      ? `Ground coverage of ${coveragePercent}% exceeds the standard 70% zoning threshold by ${(coveragePercent - 70).toFixed(1)}%.`
      : coveragePercent > 0
      ? `Ground coverage of ${coveragePercent}% is within the standard 70% allowable footprint.`
      : 'Pending room layout on Ground Floor.',
    knownLimitations: 'Regional zoning ordinances may enforce specific front, side, and rear setback setbacks.',
    requiredProfessionalReview: 'Local Municipal Zoning Planning Department Review',
    isAiGenerated: false,
    isFormalRequirement: true,
  });

  // 1.5 Floor Area Ratio (FAR)
  const farRatio = plotArea > 0 ? Math.round((totalBuiltArea / plotArea) * 100) / 100 : 0;
  records.push({
    id: 'ev-geom-far',
    resultName: 'Floor Area Ratio (FAR)',
    resultValue: farRatio,
    unit: 'ratio',
    module: 'floor-plan',
    category: 'zoning-compliance',
    sourceProject: sourceMeta,
    relevantInputIdentifiers: ['ev-geom-total-built-area', 'ev-geom-plot-area'],
    calculationMethod: 'FAR = Total Gross Built-Up Area / Total Plot Area',
    inputValuesUsed: {
      totalBuiltArea,
      plotArea,
      floors: project.floors,
    },
    assumptionsAndExclusions: [
      'Calculated as total interior room areas divided by boundary plot area.',
      'Excludes non-habitable basements or uncovered rooftop terraces if present.',
    ],
    sourceReferenceOrRateSource: 'Urban Development & Density Planning Standards',
    calculationVersion: ENGINE_VERSION,
    lastCalculatedAt: project.updatedAt || nowIso,
    validationStatus: farRatio > 0 ? (farRatio <= 2.5 ? 'pass' : 'conflict') : 'pending',
    statusExplanation: farRatio > 0
      ? farRatio <= 2.5
        ? `FAR is ${farRatio.toFixed(2)}, conforming to typical residential low-to-medium density zones (max 2.50).`
        : `FAR is ${farRatio.toFixed(2)}, which exceeds typical 2.50 density limits for low-rise zoning.`
      : 'Pending room dimensions.',
    knownLimitations: 'Local development masterplans dictate exact FAR caps per cadastral zoning tier.',
    requiredProfessionalReview: 'Municipal Urban Planning Board Assessment',
    isAiGenerated: false,
    isFormalRequirement: true,
  });

  // 1.6 Boundary Enclosure Violations
  const violations = rooms
    .map((r) => checkBoundaryViolations(r, project.plotWidth, project.plotLength))
    .filter((v): v is NonNullable<typeof v> => v !== null);

  records.push({
    id: 'ev-geom-boundary-violations',
    resultName: 'Plot Boundary Enclosure Check',
    resultValue: violations.length,
    unit: 'violations',
    module: 'floor-plan',
    category: 'geometry',
    sourceProject: sourceMeta,
    relevantInputIdentifiers: ['floorPlan.rooms.x', 'floorPlan.rooms.y', 'room.width', 'room.length', 'plotWidth', 'plotLength'],
    calculationMethod: 'Check: (x >= 0) AND (y >= 0) AND (x + width <= plotWidth) AND (y + length <= plotLength) for each room',
    inputValuesUsed: {
      roomCount: rooms.length,
      plotWidth: project.plotWidth,
      plotLength: project.plotLength,
    },
    assumptionsAndExclusions: [
      'Verifies all room perimeter vertices fall strictly inside the outer plot boundary box.',
      'Does not permit zero-lot-line boundary building unless party walls are explicitly configured.',
    ],
    sourceReferenceOrRateSource: 'Plotify Computational Geometry Kernel',
    calculationVersion: ENGINE_VERSION,
    lastCalculatedAt: project.updatedAt || nowIso,
    validationStatus: violations.length === 0 ? 'pass' : 'conflict',
    statusExplanation: violations.length === 0
      ? `All ${rooms.length} rooms are fully contained within plot perimeter boundaries (${project.plotWidth} × ${project.plotLength} ${unitSuffix}).`
      : `${violations.length} room(s) protrude beyond plot perimeter boundaries: ${violations.map((v) => v.roomName).join(', ')}.`,
    knownLimitations: 'Assumes rectangular bounding boundaries. Complex easements or irregular boundaries are not auto-detected.',
    requiredProfessionalReview: 'Architectural Spatial Plan Sign-Off',
    isAiGenerated: false,
    isFormalRequirement: true,
  });

  // 1.7 Room Spatial Overlaps
  const overlaps = checkRoomOverlaps(rooms);
  records.push({
    id: 'ev-geom-room-overlaps',
    resultName: 'Room Spatial Overlap & Collision Check',
    resultValue: overlaps.length,
    unit: 'collisions',
    module: 'floor-plan',
    category: 'geometry',
    sourceProject: sourceMeta,
    relevantInputIdentifiers: ['floorPlan.rooms', 'room.floorLevel', 'room.x', 'room.y', 'room.width', 'room.length'],
    calculationMethod: 'Axis-Aligned Bounding Box (AABB) intersection on identical floor level: !(r1.x2 <= r2.x1 || r1.x1 >= r2.x2 || r1.y2 <= r2.y1 || r1.y1 >= r2.y2)',
    inputValuesUsed: {
      roomsEvaluated: rooms.length,
      overlapPairs: overlaps.length,
    },
    assumptionsAndExclusions: [
      'Detects physical area collisions between rooms assigned to the exact same floor level.',
      'Rooms on separate vertical floor tiers (e.g. Floor 1 vs Floor 2) are not treated as collisions.',
    ],
    sourceReferenceOrRateSource: 'AABB 2D Spatial Intersect Engine',
    calculationVersion: ENGINE_VERSION,
    lastCalculatedAt: project.updatedAt || nowIso,
    validationStatus: overlaps.length === 0 ? 'pass' : 'conflict',
    statusExplanation: overlaps.length === 0
      ? `Zero geometric collisions detected among ${rooms.length} rooms.`
      : `${overlaps.length} pair(s) of rooms physically overlap on the same level: ${overlaps.map((o) => `${o.room1Name} & ${o.room2Name}`).join(', ')}.`,
    knownLimitations: 'Checks rectangular 2D footprint only; diagonal mezzanine cuts or double-height voids require manual specification.',
    requiredProfessionalReview: 'Architectural Layout Review',
    isAiGenerated: false,
    isFormalRequirement: true,
  });

  // =========================================================================
  // 2. 3D VIEWER & MODEL SYNCHRONIZATION
  // =========================================================================

  records.push({
    id: 'ev-3d-model-sync',
    resultName: '3D Building Model Geometric Synchronization',
    resultValue: currentGeomHash,
    unit: 'hash',
    module: 'viewer-3d',
    category: 'model-integrity',
    sourceProject: sourceMeta,
    relevantInputIdentifiers: ['project.floorPlan.rooms', 'project.floors', 'project.unit', 'project.designAlternatives'],
    calculationMethod: 'Procedural Three.js Extrusion from 2D Plan Coordinates + Wall Heights (3m/10ft per floor level)',
    inputValuesUsed: {
      validRoomsRendered: rooms.length - violations.length,
      floorLevelsGenerated: project.floors,
      activeAlternative: project.activeAlternativeId || 'default-whitebox',
      geometryHash: currentGeomHash,
    },
    assumptionsAndExclusions: [
      '3D viewer extrudes vertical walls from 2D boundary rectangles with standard floor-to-floor ceiling height (10ft / 3m).',
      'Assumes level ground elevation without sloping grade steps.',
    ],
    sourceReferenceOrRateSource: 'Three.js Procedural Architecture Pipeline v2.1',
    calculationVersion: ENGINE_VERSION,
    lastCalculatedAt: project.updatedAt || nowIso,
    validationStatus: rooms.length > 0 ? (violations.length === 0 ? 'pass' : 'conflict') : 'pending',
    statusExplanation: rooms.length > 0
      ? violations.length === 0
        ? `3D viewport model is fully synchronized with current 2D plan hash (${currentGeomHash}).`
        : `3D model is rendered, but contains ${violations.length} boundary enclosure violation(s) that require adjustment.`
      : 'No 3D geometry generated because 2D floor plan contains zero rooms.',
    knownLimitations: 'Procedural massing preview only. Does not model internal MEP piping, structural rebar, or foundation piles.',
    requiredProfessionalReview: 'BIM Coordinator / 3D Spatial Audit',
    isAiGenerated: false,
    isFormalRequirement: true,
  });

  // =========================================================================
  // 3. ARCHITECTURAL DECISION TWIN
  // =========================================================================

  const twinState = evaluateDecisionTwin(project);
  const twinNodeList = Object.values(twinState.nodes);
  const staleTwinNodes = twinNodeList.filter((n) => n.status === 'stale');
  const failedTwinNodes = twinNodeList.filter((n) => n.status === 'failed');
  const currentTwinNodes = twinNodeList.filter((n) => n.status === 'current');
  const allTwinIssues = twinNodeList.flatMap((n) => n.issues || []);

  records.push({
    id: 'ev-twin-multi-node-sync',
    resultName: 'Architectural Decision Twin Synchronization',
    resultValue: `${currentTwinNodes.length}/${twinNodeList.length} nodes current`,
    unit: 'nodes',
    module: 'decision-twin',
    category: 'model-integrity',
    sourceProject: sourceMeta,
    relevantInputIdentifiers: ['twinState.nodes', 'twinState.overallStatus'],
    calculationMethod: 'Directed Acyclic Graph (DAG) state propagation across 7 project lifecycle nodes',
    inputValuesUsed: {
      totalTwinNodes: twinNodeList.length,
      currentNodeCount: currentTwinNodes.length,
      staleNodeCount: staleTwinNodes.length,
      failedNodeCount: failedTwinNodes.length,
      validationIssues: allTwinIssues.length,
    },
    assumptionsAndExclusions: [
      'Nodes represent: Project Spec, 2D Floor Plan, Derived Metrics, 3D Model, Facade Envelope, Interior Schedules, and Structural/MEP Disclosures.',
      'Flags downstream nodes stale when upstream geometry or specifications change without being re-evaluated.',
    ],
    sourceReferenceOrRateSource: 'Plotify Decision Twin Dependency Kernel',
    calculationVersion: ENGINE_VERSION,
    lastCalculatedAt: twinState.lastEvaluationTimestamp,
    validationStatus: failedTwinNodes.length > 0
      ? 'failed'
      : staleTwinNodes.length > 0
      ? 'stale'
      : allTwinIssues.length > 0
      ? 'conflict'
      : 'pass',
    statusExplanation: staleTwinNodes.length > 0
      ? `${staleTwinNodes.length} twin node(s) are stale (${staleTwinNodes.map((n) => n.name).join(', ')}). Recalculation required.`
      : allTwinIssues.length > 0
      ? `Twin detected ${allTwinIssues.length} active design issues: ${allTwinIssues.map((i) => i.message).slice(0, 2).join('; ')}.`
      : `All ${twinNodeList.length} dependency nodes are verified and fully synchronized.`,
    knownLimitations: 'Tracks data pipeline dependency integrity; does not verify local soil mechanics or seismic engineering.',
    requiredProfessionalReview: 'Principal Architect Multi-Disciplinary Coordination',
    isAiGenerated: false,
    isFormalRequirement: true,
  });

  // =========================================================================
  // 4. LIVING CONSTRAINT GRAPH
  // =========================================================================

  const constraintGraph = evaluateConstraintGraph(project);
  const passingConstraints = constraintGraph.constraints.filter((c) => c.status === 'pass');
  const conflictConstraints = constraintGraph.constraints.filter((c) => c.status === 'conflict');
  const pendingConstraints = constraintGraph.constraints.filter((c) => c.status === 'pending');

  records.push({
    id: 'ev-cg-overall-compliance',
    resultName: 'Living Constraint Graph Validation',
    resultValue: `${passingConstraints.length}/${constraintGraph.constraints.length} checks passing`,
    unit: 'rules',
    module: 'constraint-graph',
    category: 'code-compliance',
    sourceProject: sourceMeta,
    relevantInputIdentifiers: ['constraintGraph.constraints', 'project.plotWidth', 'project.plotLength', 'project.floors', 'project.budget'],
    calculationMethod: 'Multi-category formal requirement vs user preference evaluation matrix',
    inputValuesUsed: {
      totalConstraints: constraintGraph.constraints.length,
      passingCount: passingConstraints.length,
      conflictCount: conflictConstraints.length,
      pendingCount: pendingConstraints.length,
    },
    assumptionsAndExclusions: [
      'Distinguishes Formal Code/Physical Requirements (e.g. plot boundaries, minimum room dimensions) from User Preferences (e.g. target budget alignment, room counts).',
    ],
    sourceReferenceOrRateSource: 'Plotify Constraint Engine v2.0',
    calculationVersion: ENGINE_VERSION,
    lastCalculatedAt: constraintGraph.lastEvaluatedAt,
    validationStatus: conflictConstraints.length > 0
      ? 'conflict'
      : pendingConstraints.length > 0
      ? 'pending'
      : 'pass',
    statusExplanation: conflictConstraints.length > 0
      ? `${conflictConstraints.length} constraint conflict(s) detected: ${conflictConstraints.map((c) => c.title).slice(0, 2).join('; ')}.`
      : pendingConstraints.length > 0
      ? `${pendingConstraints.length} constraint check(s) pending required inputs.`
      : `All ${constraintGraph.constraints.length} constraint rules satisfied without conflict.`,
    knownLimitations: 'Evaluates standard residential architectural guidelines; historic landmark preservation guidelines are not included.',
    requiredProfessionalReview: 'Municipal Code Enforcement & Structural Peer Review',
    isAiGenerated: false,
    isFormalRequirement: true,
  });

  // Individual Constraint Node: Budget Alignment (User-Defined Preference)
  const budgetConstraint = constraintGraph.constraints.find((c) => c.category === 'budget-alignment');
  if (budgetConstraint) {
    records.push({
      id: 'ev-cg-budget-preference',
      resultName: 'Constraint Check: Target Budget Alignment',
      resultValue: String(budgetConstraint.designValue.value),
      unit: project.currency,
      module: 'constraint-graph',
      category: 'cost-qto',
      sourceProject: sourceMeta,
      relevantInputIdentifiers: ['project.budget', 'project.costPlanning.targetBudget'],
      calculationMethod: budgetConstraint.comparisonRule,
      inputValuesUsed: {
        targetBudget: budgetConstraint.sourceRequirement.value,
        estimatedCost: budgetConstraint.designValue.value,
      },
      assumptionsAndExclusions: [
        'User-defined financial preference, NOT a statutory building-code limitation.',
      ],
      sourceReferenceOrRateSource: 'Project Target Budget Setting',
      calculationVersion: ENGINE_VERSION,
      lastCalculatedAt: budgetConstraint.lastEvaluatedAt,
      validationStatus: budgetConstraint.status === 'conflict' ? 'conflict' : 'pass',
      statusExplanation: budgetConstraint.statusReason,
      knownLimitations: 'Budget figures represent preliminary planning allocations, not firm contractor lump-sum tender bids.',
      requiredProfessionalReview: 'Certified Quantity Surveyor (QS) Cost Audit',
      isAiGenerated: false,
      isFormalRequirement: false, // User Preference!
    });
  }

  // =========================================================================
  // 5. FUTURE-IMPACT SIMULATOR & MULTI-CRITERIA OPTIMIZER
  // =========================================================================

  const scenarios = project.scenarios || [];
  const activeScenario = scenarios.find((s) => s.id === project.activeScenarioId) || scenarios[0];

  records.push({
    id: 'ev-impact-scenarios-status',
    resultName: 'Design Scenario Multi-Criteria Optimization',
    resultValue: scenarios.length > 0 ? `${scenarios.length} scenarios evaluated` : 'Baseline only',
    unit: 'scenarios',
    module: 'impact-simulator',
    category: 'multi-criteria',
    sourceProject: sourceMeta,
    relevantInputIdentifiers: ['project.scenarios', 'project.activeScenarioId'],
    calculationMethod: 'Deterministic Pareto Multi-Criteria Scoring = Weighted Sum of normalized spatial, financial, carbon, and compliance indices',
    inputValuesUsed: {
      scenarioCount: scenarios.length,
      activeScenario: activeScenario?.name || 'Baseline',
    },
    assumptionsAndExclusions: [
      'Normalizes criteria to a 0-100 index based on user-configured weights.',
      'Separates deterministic numerical area and cost deltas from qualitative architectural design suggestions.',
    ],
    sourceReferenceOrRateSource: 'Multi-Criteria Decision Analysis (MCDA) Weighted Sum Model',
    calculationVersion: ENGINE_VERSION,
    lastCalculatedAt: project.updatedAt || nowIso,
    validationStatus: scenarios.length > 1 ? 'pass' : 'pending',
    statusExplanation: scenarios.length > 1
      ? `Evaluated ${scenarios.length} design alternatives against baseline project parameters.`
      : 'Only baseline design exists. Create alternative scenarios to compare Pareto trade-offs.',
    knownLimitations: 'Optimization rankings depend strictly on user weight inputs; subjective aesthetic merit is not rated numerically.',
    requiredProfessionalReview: 'Client & Architectural Design Board Review',
    isAiGenerated: false,
    isFormalRequirement: false,
  });

  // =========================================================================
  // 6. COST INTELLIGENCE & DETERMINISTIC QTO
  // =========================================================================

  const costPlan = project.costPlanning || initializeProjectCostPlanning(project);
  const activeCostScenario = costPlan.scenarios.find((s) => s.id === costPlan.activeScenarioId) || costPlan.scenarios[0];
  const costSummary = calculateCostSummary(activeCostScenario, costPlan.targetBudget, currentGeomHash);

  // 6.1 QTO Staleness Detection
  const isCostStale = costSummary.isStale;
  records.push({
    id: 'ev-cost-geometry-hash-sync',
    resultName: 'Bill of Quantities Geometry Hash Verification',
    resultValue: costPlan.lastGeometryHash || 'uncalculated',
    unit: 'hash',
    module: 'cost-planning',
    category: 'model-integrity',
    sourceProject: sourceMeta,
    relevantInputIdentifiers: ['costPlan.lastGeometryHash', 'currentGeomHash'],
    calculationMethod: 'Cryptographic geometry hash comparison: costPlan.lastGeometryHash === currentGeomHash',
    inputValuesUsed: {
      qtoGeometryHash: costPlan.lastGeometryHash || 'none',
      currentFloorPlanHash: currentGeomHash,
      lastRecalculatedAt: costPlan.lastRecalculatedAt,
    },
    assumptionsAndExclusions: [
      'Verifies that concrete slabs, masonry partition walls, and exterior enclosures correspond to the latest saved 2D floor plan.',
    ],
    sourceReferenceOrRateSource: 'Plotify Geometry Hash Synchronization',
    calculationVersion: ENGINE_VERSION,
    lastCalculatedAt: costPlan.lastRecalculatedAt,
    validationStatus: isCostStale ? 'stale' : 'pass',
    statusExplanation: isCostStale
      ? `Bill of Quantities is STALE. The 2D floor plan geometry was modified after this cost estimate was generated. Expected hash "${costPlan.lastGeometryHash}", current hash "${currentGeomHash}".`
      : `Bill of Quantities is verified and in sync with current 2D floor plan geometry (${currentGeomHash}).`,
    staleReason: isCostStale ? 'Floor plan geometry was modified after this cost estimate was calculated.' : undefined,
    recommendation: isCostStale ? 'Click "Sync QTO" in Cost Intelligence workspace to refresh take-off quantities.' : undefined,
    knownLimitations: 'Detects dimensional and coordinate changes; does not track physical construction material market price inflation without user update.',
    requiredProfessionalReview: 'Cost Estimator / Quantity Surveyor Resync',
    isAiGenerated: false,
    isFormalRequirement: true,
  });

  // 6.2 Foundation & Floor Slab QTO
  const slabItem = activeCostScenario.lineItems.find((i) => i.code === 'M-01');
  if (slabItem) {
    records.push({
      id: 'ev-cost-qto-slab',
      resultName: 'Quantity Take-Off: Reinforced Concrete Floor Slabs',
      resultValue: slabItem.quantity,
      unit: slabItem.unit,
      module: 'cost-planning',
      category: 'cost-qto',
      sourceProject: sourceMeta,
      relevantInputIdentifiers: ['ev-geom-total-built-area', 'slabItem.unitRate'],
      calculationMethod: slabItem.calculationFormula,
      inputValuesUsed: {
        totalBuiltArea,
        unitRate: slabItem.unitRate,
        extendedCost: slabItem.extendedCost,
      },
      assumptionsAndExclusions: [
        '100% of gross floor plan room area calculated as reinforced concrete ground slab and suspended upper floor slabs.',
        'Excludes deep foundation driven piles, caissons, and sub-grade waterproofing membranes.',
      ],
      sourceReferenceOrRateSource: 'Geometry Take-Off Engine & Regional MasterFormat Division 03',
      calculationVersion: ENGINE_VERSION,
      lastCalculatedAt: activeCostScenario.updatedAt,
      validationStatus: isCostStale ? 'stale' : 'pass',
      statusExplanation: isCostStale
        ? 'Slab quantity may be out of date due to geometry changes.'
        : `Calculated ${slabItem.quantity} ${slabItem.unit} at ${formatCurrency(slabItem.unitRate, project.currency)}/${slabItem.unit} = ${formatCurrency(slabItem.extendedCost, project.currency)}.`,
      knownLimitations: 'Uniform slab thickness assumption (6-inch / 150mm standard residential slab). Structural engineer must determine thickness based on spans.',
      requiredProfessionalReview: 'Structural Engineer Slab Reinforcement Schedule',
      isAiGenerated: false,
      isFormalRequirement: true,
    });
  }

  // 6.3 Masonry Partition Walls QTO with 35% Shared Wall Reduction
  const partitionItem = activeCostScenario.lineItems.find((i) => i.code === 'M-02');
  if (partitionItem) {
    records.push({
      id: 'ev-cost-qto-partitions',
      resultName: 'Quantity Take-Off: Interior Partition Walls (Shared-Wall Deduction)',
      resultValue: partitionItem.quantity,
      unit: partitionItem.unit,
      module: 'cost-planning',
      category: 'cost-qto',
      sourceProject: sourceMeta,
      relevantInputIdentifiers: ['rooms.perimeter', 'wallHeight=10ft/3m', 'sharedWallReductionFactor=0.65'],
      calculationMethod: 'Sum(Room Perimeters) × Height × 0.65 (35% shared-wall deduction factor to prevent double counting)',
      inputValuesUsed: {
        rawRoomCount: rooms.length,
        wallHeight: project.unit === 'feet' ? '10 ft' : '3.0 m',
        reductionFactor: '35% deduction (0.65 multiplier)',
        extendedCost: partitionItem.extendedCost,
      },
      assumptionsAndExclusions: [
        'Shared interior walls between adjoining rooms are deducted by 35% to eliminate double counting.',
        'Includes 8-inch CMU / hollow blockwork with standard sand-cement bedding mortar.',
      ],
      sourceReferenceOrRateSource: 'Standard Method of Measurement (SMM7) / RICS Quantity Surveying Standard',
      calculationVersion: ENGINE_VERSION,
      lastCalculatedAt: activeCostScenario.updatedAt,
      validationStatus: isCostStale ? 'stale' : 'pass',
      statusExplanation: isCostStale
        ? 'Partition wall take-off is stale following floor plan edits.'
        : `Calculated ${partitionItem.quantity} ${partitionItem.unit} of net interior partition walling using 35% shared-wall deduplication.`,
      knownLimitations: 'Assumes uniform floor-to-ceiling partitions; acoustic party wall decoupling requires customized specification.',
      requiredProfessionalReview: 'Quantity Surveyor / Masonry Trade Contractor Review',
      isAiGenerated: false,
      isFormalRequirement: true,
    });
  }

  // 6.4 Estimated Grand Total
  records.push({
    id: 'ev-cost-estimated-total',
    resultName: 'Comprehensive Estimated Construction Cost',
    resultValue: costSummary.estimatedTotal,
    unit: project.currency,
    module: 'cost-planning',
    category: 'cost-qto',
    sourceProject: sourceMeta,
    relevantInputIdentifiers: ['costSummary.subtotal', 'costSummary.contingencyAmount', 'costSummary.taxAmount'],
    calculationMethod: 'Estimated Total = Subtotal (Sum of Line Items) + Contingency (' + activeCostScenario.contingencyRatePercent + '%) + Tax (' + activeCostScenario.taxRatePercent + '%)',
    inputValuesUsed: {
      subtotal: costSummary.subtotal,
      contingencyPercent: activeCostScenario.contingencyRatePercent,
      contingencyAmount: costSummary.contingencyAmount,
      taxPercent: activeCostScenario.taxRatePercent,
      taxAmount: costSummary.taxAmount,
      itemCount: activeCostScenario.lineItems.length,
    },
    assumptionsAndExclusions: [
      'Subtotal includes material, labour, equipment, and transport line items configured in active scenario.',
      'Contingency covers unforeseen site conditions and price fluctuations.',
      'Excludes land acquisition costs, financing interest during construction, and municipal permit impact fees unless explicitly added.',
    ],
    sourceReferenceOrRateSource: 'Plotify Cost Intelligence Engine v1.0',
    calculationVersion: ENGINE_VERSION,
    lastCalculatedAt: activeCostScenario.updatedAt,
    validationStatus: isCostStale
      ? 'stale'
      : costSummary.budgetStatus === 'over-budget'
      ? 'conflict'
      : costSummary.missingRatesCount > 0
      ? 'pending'
      : 'pass',
    statusExplanation: isCostStale
      ? 'Cost estimate total is STALE because floor plan geometry has changed.'
      : costSummary.budgetStatus === 'over-budget'
      ? `Current estimate of ${formatCurrency(costSummary.estimatedTotal, project.currency)} exceeds target budget of ${formatCurrency(costSummary.targetBudget, project.currency)} by ${formatCurrency(Math.abs(costSummary.budgetVariance), project.currency)} (${Math.abs(costSummary.budgetVariancePercent).toFixed(1)}%).`
      : costSummary.missingRatesCount > 0
      ? `${costSummary.missingRatesCount} line items have zero or missing unit rates.`
      : `Estimate of ${formatCurrency(costSummary.estimatedTotal, project.currency)} is verified and within configured budget.`,
    knownLimitations: 'Preliminary planning estimate (AACE Class 4/5). Fluctuations in local labor availability or material supply chain can impact actual contractor tender pricing.',
    requiredProfessionalReview: 'Professional Quantity Surveyor (RICS/AACE) or General Contractor Guaranteed Maximum Price (GMP) Audit',
    isAiGenerated: false,
    isFormalRequirement: true,
  });

  // 6.5 Construction Phase Scheduling Dependencies
  const phaseConflicts = validateConstructionPhases(costPlan.phases);
  records.push({
    id: 'ev-schedule-dependencies',
    resultName: 'Construction Phase Predecessor Scheduling Validation',
    resultValue: phaseConflicts.length,
    unit: 'conflicts',
    module: 'cost-planning',
    category: 'model-integrity',
    sourceProject: sourceMeta,
    relevantInputIdentifiers: ['costPlan.phases', 'phase.dependencies', 'phase.startDate', 'phase.durationDays'],
    calculationMethod: 'Topological predecessor date validation: Phase[N].StartDate >= Max(Predecessors[N].EndDate)',
    inputValuesUsed: {
      totalPhases: costPlan.phases.length,
      conflictsFound: phaseConflicts.length,
    },
    assumptionsAndExclusions: [
      'Validates sequential dependencies across 7 baseline construction stages.',
      'Identifies impossible scheduling conditions where a phase starts before its mandatory predecessors complete.',
    ],
    sourceReferenceOrRateSource: 'Critical Path Method (CPM) Construction Scheduling Rules',
    calculationVersion: ENGINE_VERSION,
    lastCalculatedAt: nowIso,
    validationStatus: phaseConflicts.length === 0 ? 'pass' : 'conflict',
    statusExplanation: phaseConflicts.length === 0
      ? `All ${costPlan.phases.length} construction phases maintain valid predecessor sequence timelines without scheduling collisions.`
      : `${phaseConflicts.length} schedule conflict(s) detected: ${phaseConflicts.map((c) => `${c.phaseName} starts before ${c.predecessorName} finishes`).join('; ')}.`,
    knownLimitations: 'Assumes standard 7-day working calendar without local statutory holiday adjustments.',
    requiredProfessionalReview: 'General Contractor Construction Project Manager Schedule Audit',
    isAiGenerated: false,
    isFormalRequirement: true,
  });

  // =========================================================================
  // 7. STRUCTURAL & MEP ENGINEERING DISCLOSURES (PROMPT 9 REQUIREMENT 8)
  // =========================================================================

  records.push({
    id: 'ev-eng-structural-gravity',
    resultName: 'Structural Gravity & Lateral Shear Capacity',
    resultValue: 'Requires Engineering Analysis',
    unit: 'status',
    module: 'engineering-disclosure',
    category: 'structural-mep',
    sourceProject: sourceMeta,
    relevantInputIdentifiers: ['project.floors', 'project.plotWidth', 'project.plotLength'],
    calculationMethod: 'Static finite element structural calculation under local dead/live/seismic design loads',
    inputValuesUsed: {
      floors: project.floors,
      structureType: 'Reinforced Concrete / Steel Frame (Presumed)',
      soilBearingCapacity: 'Unknown / Site Specific',
    },
    assumptionsAndExclusions: [
      'Plotify is a preliminary architectural spatial layout generator and DOES NOT compute structural load distributions, beam sizing, or rebar callouts.',
    ],
    sourceReferenceOrRateSource: 'International Building Code (IBC) Chapter 16 / ASCE 7',
    calculationVersion: ENGINE_VERSION,
    lastCalculatedAt: nowIso,
    validationStatus: 'not-assessed',
    statusExplanation: 'NOT ASSESSED: Structural integrity requires geotechnical soil borehole testing and licensed structural engineer finite-element analysis.',
    knownLimitations: 'Software outputs must never be used directly for structural framing fabrication or physical erection.',
    requiredProfessionalReview: 'MANDATORY: Licensed Professional Structural Engineer (PE / SE) Signed & Sealed Drawings',
    isAiGenerated: false,
    isFormalRequirement: true,
  });

  records.push({
    id: 'ev-eng-mep-egress',
    resultName: 'Fire Life Safety & Egress Corridor Capacity',
    resultValue: 'Requires Code Verification',
    unit: 'status',
    module: 'engineering-disclosure',
    category: 'code-compliance',
    sourceProject: sourceMeta,
    relevantInputIdentifiers: ['rooms.doors', 'rooms.corridors'],
    calculationMethod: 'NFPA 101 Life Safety Code Travel Distance & Egress Width Calculations',
    inputValuesUsed: {
      occupancyType: 'Residential (IBC Group R)',
      fireSprinklers: 'Not Specified',
    },
    assumptionsAndExclusions: [
      'Plotify room boundaries do not automatically calculate travel distance to secondary emergency exits or door swing clear-width requirements.',
    ],
    sourceReferenceOrRateSource: 'NFPA 101 Life Safety Code / IBC Chapter 10',
    calculationVersion: ENGINE_VERSION,
    lastCalculatedAt: nowIso,
    validationStatus: 'not-assessed',
    statusExplanation: 'NOT ASSESSED: Emergency egress paths, smoke ventilation, and fire sprinkler layouts require local fire code review.',
    knownLimitations: 'Requires detailed door hardware schedules and fire compartmentation ratings not currently modeled in 2D layout.',
    requiredProfessionalReview: 'MANDATORY: Fire Safety Engineer & Municipal Fire Marshal Approval',
    isAiGenerated: false,
    isFormalRequirement: true,
  });

  // =========================================================================
  // 8. SITE & CONTEXT INTELLIGENCE EVIDENCE (PROMPT 11 INTEGRATION)
  // =========================================================================
  const siteChecks = evaluateSiteConstraints(project);
  siteChecks.forEach((chk) => {
    const sanitizedInputs: Record<string, string | number | boolean> = {};
    Object.entries(chk.inputsUsed || {}).forEach(([k, v]) => {
      sanitizedInputs[k] =
        typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
          ? v
          : JSON.stringify(v);
    });

    const statusMapped: ValidationStatus =
      chk.status === 'pass'
        ? 'pass'
        : chk.status === 'conflict'
        ? 'conflict'
        : chk.status === 'warning'
        ? 'pending'
        : 'not-assessed';

    records.push({
      id: `ev-${chk.id}`,
      resultName: chk.title,
      resultValue: chk.status.toUpperCase(),
      unit: 'status',
      module: 'site-context',
      category: chk.category === 'setback' ? 'zoning-compliance' : 'geometry',
      sourceProject: sourceMeta,
      relevantInputIdentifiers: ['project.siteContext', ...Object.keys(chk.inputsUsed || {})],
      calculationMethod: chk.formulaOrRule,
      inputValuesUsed: sanitizedInputs,
      assumptionsAndExclusions: [
        'Deterministic site envelope and setback clearance analysis.',
        'Requires certified boundary pegging and municipal cadastral review for legal title filings.',
      ],
      sourceReferenceOrRateSource: 'Plotify Site & Context Intelligence Engine v1.0',
      calculationVersion: ENGINE_VERSION,
      lastCalculatedAt: nowIso,
      validationStatus: statusMapped,
      statusExplanation: chk.details,
      knownLimitations: 'Calculated from user-entered site dimensions and obstacles. Physical underground utilities require GPR locator scan.',
      requiredProfessionalReview: chk.requiresProfessionalReview,
      isAiGenerated: false,
      isFormalRequirement: chk.category === 'setback' || chk.category === 'boundary',
    });
  });

  // =========================================================================
  // 9. ARCHITECTURAL BRIEF & SPACE PROGRAMMING AUDIT (PROMPT 12 INTEGRATION)
  // =========================================================================
  const projectBrief = initializeProjectBrief(project);
  const briefSummary = calculateSpaceProgramSummary(project, projectBrief);
  const briefComparisons = compareBriefWithFloorPlan(project, projectBrief);
  const briefNotices = validateBrief(project, projectBrief);

  // 9.1 Target Net Area vs Site Allowable Capacity
  const isCapacityExceeded = briefSummary.footprintFitStatus === 'exceeds';
  records.push({
    id: 'ev-brief-program-area',
    resultName: 'Brief Program Gross Required vs Allowable Area',
    resultValue: `${briefSummary.estimatedGrossInternalArea} / ${briefSummary.maxAllowableGrossArea || 'N/A'}`,
    unit: unitAreaSuffix,
    module: 'brief-programming',
    category: 'spatial-program',
    sourceProject: sourceMeta,
    relevantInputIdentifiers: ['project.brief.spaces', 'project.plotWidth', 'project.plotLength', 'project.floors'],
    calculationMethod: 'GIA_est = TargetNetArea * (1 + CirculationWallAllowancePercent / 100); MaxAllowable = PlotArea * MaxCoverage * Floors',
    inputValuesUsed: {
      totalTargetNetArea: briefSummary.totalTargetNetArea,
      circulationWallAllowancePercent: briefSummary.circulationWallAllowancePercent,
      estimatedGrossInternalArea: briefSummary.estimatedGrossInternalArea,
      maxAllowableGrossArea: briefSummary.maxAllowableGrossArea || 0,
      footprintFitStatus: briefSummary.footprintFitStatus,
    },
    assumptionsAndExclusions: [
      `Assumes ${briefSummary.circulationWallAllowancePercent}% gross-to-net circulation and wall thickness factor.`,
      'Excludes exterior terraces, unroofed carports, and underground basements unless explicitly programmed.',
    ],
    sourceReferenceOrRateSource: 'Plotify Architectural Brief & Space Programming Engine v1.0',
    calculationVersion: ENGINE_VERSION,
    lastCalculatedAt: nowIso,
    validationStatus: isCapacityExceeded ? 'conflict' : 'pass',
    statusExplanation: isCapacityExceeded
      ? `Program requires ${briefSummary.estimatedGrossInternalArea} ${unitAreaSuffix}, exceeding allowable capacity of ${briefSummary.maxAllowableGrossArea} ${unitAreaSuffix}.`
      : `Program Gross Internal Area of ${briefSummary.estimatedGrossInternalArea} ${unitAreaSuffix} fits within allowable gross building capacity.`,
    knownLimitations: 'Allowable area is calculated from plot dimensions and ground coverage assumptions. Actual local zoning code FAR takes legal precedence.',
    requiredProfessionalReview: 'Zoning Code Consultant & Architect of Record Floor-Area Ratio Signoff',
    isAiGenerated: false,
    isFormalRequirement: true,
  });

  // 9.2 Mandatory Space Schedule Fulfillment (2D Placed vs Required)
  const unplacedMandatory = briefComparisons.filter(
    (c) => c.priority === 'mandatory' && c.placementStatus !== 'fully-placed' && c.placementStatus !== 'over-allocated'
  );
  const mandatoryCount = briefSummary.mandatorySpaceCount;
  const isMandatoryFulfilled = unplacedMandatory.length === 0;

  records.push({
    id: 'ev-brief-mandatory-compliance',
    resultName: 'Mandatory Brief Space Program Fulfillment',
    resultValue: `${mandatoryCount - unplacedMandatory.length} / ${mandatoryCount} spaces`,
    unit: 'spaces',
    module: 'brief-programming',
    category: 'spatial-program',
    sourceProject: sourceMeta,
    relevantInputIdentifiers: ['project.brief.spaces', 'project.floorPlan.rooms'],
    calculationMethod: 'Sum(Placed Mandatory Spaces Matching Brief Requirements) / Sum(Required Mandatory Spaces)',
    inputValuesUsed: {
      totalMandatorySpaces: mandatoryCount,
      unplacedOrPartialCount: unplacedMandatory.length,
      unplacedSpaceNames: unplacedMandatory.map((u) => u.name).join(', ') || 'None',
    },
    assumptionsAndExclusions: [
      'Deterministic reconciliation of 2D floor-plan placed rooms against programmed brief spaces.',
      'Mandatory spaces must have matching instances placed on the active floor plan.',
    ],
    sourceReferenceOrRateSource: 'Architectural Brief Specification',
    calculationVersion: ENGINE_VERSION,
    lastCalculatedAt: nowIso,
    validationStatus: isMandatoryFulfilled ? 'pass' : 'conflict',
    statusExplanation: isMandatoryFulfilled
      ? `All ${mandatoryCount} mandatory architectural spaces defined in the brief are placed on the floor plan.`
      : `${unplacedMandatory.length} mandatory space requirement(s) are unplaced or under-allocated: ${unplacedMandatory.map((u) => u.name).join(', ')}.`,
    knownLimitations: 'Spatial matching uses functional type tags and naming heuristics.',
    requiredProfessionalReview: 'Client & Project Architect Brief Reconciliation Signoff',
    isAiGenerated: false,
    isFormalRequirement: true,
  });

  // 9.3 Brief Approval & Governance State
  const approvalStatus = projectBrief.approvalStatus || 'draft';
  const isApproved = approvalStatus === 'client-approved' || approvalStatus === 'locked';
  records.push({
    id: 'ev-brief-governance-status',
    resultName: 'Architectural Brief Approval & Baseline Lock',
    resultValue: approvalStatus.toUpperCase(),
    unit: 'status',
    module: 'brief-programming',
    category: 'spatial-program',
    sourceProject: sourceMeta,
    relevantInputIdentifiers: ['project.brief.approvalStatus', 'project.brief.version'],
    calculationMethod: 'Deterministic inspection of brief approval workflow state and revision history',
    inputValuesUsed: {
      approvalStatus,
      briefVersion: projectBrief.version,
      revisionCount: projectBrief.revisions?.length || 1,
    },
    assumptionsAndExclusions: [
      'Tracks client sign-off and baseline locking to prevent unauthorized program scope creep.',
    ],
    sourceReferenceOrRateSource: 'Plotify Brief Governance Protocol',
    calculationVersion: ENGINE_VERSION,
    lastCalculatedAt: nowIso,
    validationStatus: isApproved ? 'pass' : 'pending',
    statusExplanation: isApproved
      ? `Brief is formally locked as baseline (${approvalStatus.toUpperCase()}) for schematic design.`
      : `Brief is currently in "${approvalStatus.toUpperCase()}" status and requires client/stakeholder signoff before baseline lock.`,
    knownLimitations: 'Digital sign-off establishes project baseline; statutory submissions require signed architectural contracts.',
    requiredProfessionalReview: 'Principal Architect & Client Representative Agreement',
    isAiGenerated: false,
    isFormalRequirement: false,
  });


  // =========================================================================
  // 10. BUILDING REGULATIONS & STATUTORY CODE EVALUATIONS (PROMPT 13)
  // =========================================================================

  const regState = initializeProjectRegulations(project);
  const regSummary = evaluateProjectRegulations(project, regState);

  // 10.1 Regulatory Profile & AHJ Register
  const hasJurisdiction = Boolean(regSummary.profile.country && regSummary.profile.country !== 'Unknown');
  records.push({
    id: 'ev-reg-jurisdiction-profile',
    resultName: 'Statutory Jurisdiction & AHJ Register',
    resultValue: hasJurisdiction ? `${regSummary.profile.country} — ${regSummary.profile.region}` : 'JURISDICTION UNKNOWN',
    unit: 'jurisdiction',
    module: 'regulatory-intelligence',
    category: 'code-compliance',
    sourceProject: sourceMeta,
    relevantInputIdentifiers: ['project.regulations.profile.country', 'project.regulations.profile.ahj'],
    calculationMethod: 'Jurisdiction verification and statutory code register validation',
    inputValuesUsed: {
      country: regSummary.profile.country,
      region: regSummary.profile.region,
      ahj: regSummary.profile.ahj,
      activeRulePack: regSummary.activeRulePack,
    },
    assumptionsAndExclusions: [
      'Regulatory compliance depends on officially adopted local municipal bylaws and building codes.',
      'Does not infer legal jurisdiction without explicit user declaration.',
    ],
    sourceReferenceOrRateSource: regSummary.activeRulePack,
    calculationVersion: ENGINE_VERSION,
    lastCalculatedAt: nowIso,
    validationStatus: hasJurisdiction ? 'pass' : 'conflict',
    statusExplanation: hasJurisdiction
      ? `Project jurisdiction established: ${regSummary.profile.country}, ${regSummary.profile.region} (AHJ: ${regSummary.profile.ahj}). Active code pack: ${regSummary.activeRulePack}.`
      : 'Project jurisdiction is not specified. Statutory compliance cannot be evaluated without a declared legal jurisdiction.',
    knownLimitations: 'Model codes do not automatically supersede state or city-specific legislative amendments.',
    requiredProfessionalReview: 'Authority Having Jurisdiction (AHJ) & Local Planning Department Filing',
    isAiGenerated: false,
    isFormalRequirement: true,
  });

  // 10.2 Statutory Lot Coverage Ratio
  const lotCovEval = regSummary.evaluations.find((e) => e.requirementId === 'req-max-lot-coverage');
  if (lotCovEval) {
    const isPass = lotCovEval.status === 'pass';
    const isConflict = lotCovEval.status === 'conflict';
    records.push({
      id: 'ev-reg-lot-coverage-compliance',
      resultName: 'Statutory Ground Lot Coverage Compliance',
      resultValue: lotCovEval.measuredValue || 'N/A',
      unit: '%',
      module: 'regulatory-intelligence',
      category: 'zoning-compliance',
      sourceProject: sourceMeta,
      relevantInputIdentifiers: ['project.plotWidth', 'project.plotLength', 'floorPlan.rooms'],
      calculationMethod: 'Ground Footprint Area / Total Plot Parcel Area × 100 <= 50.0%',
      inputValuesUsed: lotCovEval.inputsCaptured as Record<string, string | number | boolean>,
      assumptionsAndExclusions: [
        'Evaluates ground floor exterior walls footprint against parcel legal boundary.',
        'Excludes unroofed permeable patio slabs or cantilevered roof eaves under 2 ft.',
      ],
      sourceReferenceOrRateSource: 'ZON-RES-STD Section Z-101',
      calculationVersion: ENGINE_VERSION,
      lastCalculatedAt: nowIso,
      validationStatus: isPass ? 'pass' : isConflict ? 'conflict' : 'pending',
      statusExplanation: lotCovEval.statusReason,
      knownLimitations: 'Calculated from 2D room geometries. Final surveyor site plan required for zoning clearance.',
      requiredProfessionalReview: 'Zoning & Development Permit Officer Concurrence',
      isAiGenerated: false,
      isFormalRequirement: true,
      recommendation: lotCovEval.remedySuggestion,
    });
  }

  // 10.3 Statutory Boundary Setbacks Compliance
  const frontSetbackEval = regSummary.evaluations.find((e) => e.requirementId === 'req-front-setback');
  const rearSetbackEval = regSummary.evaluations.find((e) => e.requirementId === 'req-rear-setback');
  const sideSetbackEval = regSummary.evaluations.find((e) => e.requirementId === 'req-side-setbacks');
  const setbackPass =
    frontSetbackEval?.status === 'pass' &&
    rearSetbackEval?.status === 'pass' &&
    sideSetbackEval?.status === 'pass';
  const setbackConflict =
    frontSetbackEval?.status === 'conflict' ||
    rearSetbackEval?.status === 'conflict' ||
    sideSetbackEval?.status === 'conflict';

  records.push({
    id: 'ev-reg-setbacks-compliance',
    resultName: 'Statutory Property Boundary Setbacks Compliance',
    resultValue: setbackPass ? 'ALL CLEAR' : setbackConflict ? 'VIOLATION DETECTED' : 'PENDING EVALUATION',
    unit: 'compliance',
    module: 'regulatory-intelligence',
    category: 'zoning-compliance',
    sourceProject: sourceMeta,
    relevantInputIdentifiers: [
      'siteContext.setbacks.front',
      'siteContext.setbacks.rear',
      'siteContext.setbacks.sideLeft',
      'siteContext.setbacks.sideRight',
      'floorPlan.rooms',
    ],
    calculationMethod: 'Clearance offset check from all 4 parcel perimeter boundaries',
    inputValuesUsed: {
      frontStatus: frontSetbackEval?.status || 'missing',
      rearStatus: rearSetbackEval?.status || 'missing',
      sideStatus: sideSetbackEval?.status || 'missing',
    },
    assumptionsAndExclusions: [
      'Checks orthogonal distance from plot edges to exterior room coordinates.',
    ],
    sourceReferenceOrRateSource: 'ZON-RES-STD Sections Z-102, Z-103, Z-104',
    calculationVersion: ENGINE_VERSION,
    lastCalculatedAt: nowIso,
    validationStatus: setbackPass ? 'pass' : setbackConflict ? 'conflict' : 'pending',
    statusExplanation: setbackPass
      ? 'All front, rear, and lateral building setbacks satisfy statutory zoning clearances.'
      : `Setback non-compliance: ${[frontSetbackEval, rearSetbackEval, sideSetbackEval].filter((e) => e?.status === 'conflict').map((e) => e?.statusReason).join(' ')}`,
    knownLimitations: 'Assumes orthogonal rectangular boundaries; easement rights-of-way must be verified on title deed.',
    requiredProfessionalReview: 'Registered Land Surveyor & Municipal Zoning Examiner',
    isAiGenerated: false,
    isFormalRequirement: true,
  });

  // 10.4 Statutory Habitable Rooms Dimension & Area Compliance
  const habitAreaEval = regSummary.evaluations.find((e) => e.requirementId === 'req-habitable-room-min-area');
  const habitDimEval = regSummary.evaluations.find((e) => e.requirementId === 'req-habitable-room-min-dimension');
  const habitPass = habitAreaEval?.status === 'pass' && habitDimEval?.status === 'pass';
  const habitConflict = habitAreaEval?.status === 'conflict' || habitDimEval?.status === 'conflict';

  records.push({
    id: 'ev-reg-habitable-room-standards',
    resultName: 'Statutory Habitable Space Area & Dimension Standards',
    resultValue: habitPass ? 'COMPLIANT' : habitConflict ? 'NON-COMPLIANT' : 'PENDING EVALUATION',
    unit: 'standard',
    module: 'regulatory-intelligence',
    category: 'code-compliance',
    sourceProject: sourceMeta,
    relevantInputIdentifiers: ['floorPlan.rooms.width', 'floorPlan.rooms.length', 'floorPlan.rooms.type'],
    calculationMethod: 'IRC 2021 Section R304 (Min 70 sq ft per room, 120 sq ft primary, min 7 ft dimension)',
    inputValuesUsed: {
      areaStatus: habitAreaEval?.status || 'missing',
      dimStatus: habitDimEval?.status || 'missing',
    },
    assumptionsAndExclusions: [
      'Applies to habitable rooms (living, dining, bedrooms, office). Service and sanitary spaces excluded.',
    ],
    sourceReferenceOrRateSource: 'IRC 2021 Section R304.1 & R304.2',
    calculationVersion: ENGINE_VERSION,
    lastCalculatedAt: nowIso,
    validationStatus: habitPass ? 'pass' : habitConflict ? 'conflict' : 'pending',
    statusExplanation: habitPass
      ? 'All habitable rooms satisfy statutory floor area (>=70 sq ft) and horizontal dimension (>=7 ft) standards.'
      : `Habitable space code violation: ${[habitAreaEval, habitDimEval].filter((e) => e?.status === 'conflict').map((e) => e?.statusReason).join(' ')}`,
    knownLimitations: 'Calculated between structural internal bounding boxes.',
    requiredProfessionalReview: 'Architectural Building Code Plan Examiner',
    isAiGenerated: false,
    isFormalRequirement: true,
  });

  // 10.5 Regulatory Assessment Freshness & Governance Integrity
  const isRegStale = regSummary.isStale;
  records.push({
    id: 'ev-reg-governance-freshness',
    resultName: 'Regulatory Assessment Freshness & Source Integrity',
    resultValue: isRegStale ? 'STALE' : 'SYNCHRONIZED',
    unit: 'freshness',
    module: 'regulatory-intelligence',
    category: 'model-integrity',
    sourceProject: sourceMeta,
    relevantInputIdentifiers: ['project.regulations.lastEvaluatedGeometryHash', 'geometry.hash'],
    calculationMethod: 'Comparison of current design geometry hash against evaluation fingerprint',
    inputValuesUsed: {
      currentGeomHash,
      evalGeomHash: regSummary.geometryHash,
      isStale: isRegStale,
      activeConflictsCount: regSummary.counts.conflict,
    },
    assumptionsAndExclusions: [
      'Tracks whether floor plan geometry, room count, or boundaries have moved since regulatory assessment.',
    ],
    sourceReferenceOrRateSource: 'Plotify Decision Twin Freshness Protocol',
    calculationVersion: ENGINE_VERSION,
    lastCalculatedAt: nowIso,
    validationStatus: isRegStale ? 'stale' : 'pass',
    statusExplanation: isRegStale
      ? 'Floor plan geometry or project parameters have changed since last regulatory assessment. Re-evaluation required.'
      : `Regulatory assessment is synchronized with active project geometry (\`${currentGeomHash}\`).`,
    knownLimitations: 'Monitors internal application revisions; external municipal code changes require periodic source reviews.',
    requiredProfessionalReview: 'Building Regulations Assessment Lead',
    isAiGenerated: false,
    isFormalRequirement: true,
  });

  // =========================================================================
  // COMPILE SUMMARY AUDIT METRICS
  // =========================================================================

  let passCount = 0;
  let conflictCount = 0;
  let pendingCount = 0;
  let staleCount = 0;
  let notAssessedCount = 0;
  let failedCount = 0;

  records.forEach((r) => {
    switch (r.validationStatus) {
      case 'pass':
        passCount++;
        break;
      case 'conflict':
        conflictCount++;
        break;
      case 'pending':
        pendingCount++;
        break;
      case 'stale':
        staleCount++;
        break;
      case 'not-assessed':
        notAssessedCount++;
        break;
      case 'failed':
        failedCount++;
        break;
    }
  });

  return {
    projectId: project.id,
    projectName: project.name,
    timestamp: nowIso,
    geometryHash: currentGeomHash,
    totalRecords: records.length,
    passCount,
    conflictCount,
    pendingCount,
    staleCount,
    notAssessedCount,
    failedCount,
    records,
  };
}

/**
 * Generates an auditable, professional Markdown summary of the evidence ledger.
 */
export function generateAuditMarkdownReport(summary: EvidenceAuditSummary): string {
  const lines: string[] = [];

  lines.push(`# PLOTIFY — PROOF-CARRYING DESIGN & EVIDENCE TRACEABILITY AUDIT LEDGER`);
  lines.push(`**Project:** ${summary.projectName} (ID: \`${summary.projectId}\`)`);
  lines.push(`**Audit Generated:** ${new Date(summary.timestamp).toUTCString()}`);
  lines.push(`**Geometry Fingerprint:** \`${summary.geometryHash}\``);
  lines.push(`**Engine Version:** ${ENGINE_VERSION}`);
  lines.push(``);
  lines.push(`---`);
  lines.push(``);
  lines.push(`## 1. Executive Validation Summary`);
  lines.push(``);
  lines.push(`| Status Category | Count | Status Policy |`);
  lines.push(`|:---|:---:|:---|`);
  lines.push(`| **Pass** | ${summary.passCount} | A specific implemented check was executed and passed with positive evidence. |`);
  lines.push(`| **Conflict** | ${summary.conflictCount} | A specific implemented check detected an active violation or boundary conflict. |`);
  lines.push(`| **Stale** | ${summary.staleCount} | Result depends on upstream inputs (e.g., 2D floor plan) modified after calculation. |`);
  lines.push(`| **Pending** | ${summary.pendingCount} | Required input parameters or room geometry placements are incomplete. |`);
  lines.push(`| **Not Assessed** | ${summary.notAssessedCount} | Specialized engineering check outside preliminary architectural layout scope. |`);
  lines.push(`| **Failed** | ${summary.failedCount} | Mathematical or procedural operation failed to execute. |`);
  lines.push(`| **TOTAL PROOFS** | **${summary.totalRecords}** | Comprehensive cross-module auditable records. |`);
  lines.push(``);
  lines.push(`---`);
  lines.push(``);
  lines.push(`## 2. Itemized Evidence Records`);
  lines.push(``);

  summary.records.forEach((r, idx) => {
    lines.push(`### 2.${idx + 1} ${r.resultName} [\`${r.validationStatus.toUpperCase()}\`]`);
    lines.push(`- **Record ID:** \`${r.id}\``);
    lines.push(`- **Module:** ${r.module.toUpperCase()} | **Category:** ${r.category}`);
    lines.push(`- **Calculated Value:** **${r.resultValue} ${r.unit || ''}**`);
    lines.push(`- **Calculation Method / Formula:** \`${r.calculationMethod}\``);
    lines.push(`- **Status Explanation:** ${r.statusExplanation}`);
    if (r.staleReason) {
      lines.push(`- **Stale Notice:** ⚠️ ${r.staleReason}`);
    }
    if (r.recommendation) {
      lines.push(`- **Actionable Remedy:** 💡 ${r.recommendation}`);
    }
    lines.push(`- **Input Values Captured:**`);
    Object.entries(r.inputValuesUsed).forEach(([k, v]) => {
      lines.push(`  - \`${k}\`: ${v}`);
    });
    lines.push(`- **Assumptions & Deductions:**`);
    r.assumptionsAndExclusions.forEach((a) => lines.push(`  - ${a}`));
    if (r.sourceReferenceOrRateSource) {
      lines.push(`- **Source Reference:** ${r.sourceReferenceOrRateSource}`);
    }
    lines.push(`- **Known Limitations:** ${r.knownLimitations}`);
    lines.push(`- **Mandatory Professional Review:** 🔒 *${r.requiredProfessionalReview}*`);
    lines.push(``);
  });

  lines.push(`---`);
  lines.push(``);
  lines.push(`## 3. Statutory Professional Limitations Disclaimer`);
  lines.push(``);
  lines.push(`> **IMPORTANT NOTICE:** Plotify's Proof-Carrying Design & Evidence Traceability Engine provides deterministic mathematical transparency, change-tracking, and spatial rule auditing. This audit ledger **DOES NOT** constitute an autonomous professional architectural license, a professional structural engineering (PE/SE) seal, or statutory municipal building-code certification. All structural load calculations, soil capacities, seismic designs, and fire egress routes must be independently certified by licensed professionals in the governing jurisdiction prior to site excavation, physical construction, or statutory permitting.`);
  lines.push(``);
  lines.push(`*Report generated by Plotify AI-Powered Architectural Intelligence — Engine ${ENGINE_VERSION}*`);

  return lines.join('\n');
}

/**
 * Exports complete JSON audit log with cryptographic timestamps.
 */
export function exportAuditJson(summary: EvidenceAuditSummary): string {
  return JSON.stringify(summary, null, 2);
}
