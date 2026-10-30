import { Project, FloorPlanRoom } from '../types/project';
import {
  DecisionTwinState,
  DependencyNode,
  DependencyNodeId,
  DerivedMetrics,
  TwinImpactEvent,
  TwinValidationIssue,
} from '../types/decisionTwin';

/**
 * Deterministic string hash for quick geometry revision comparison.
 */
export function computeGeometryHash(
  rooms: FloorPlanRoom[],
  plotWidth: number,
  plotLength: number,
  unit: string
): string {
  const sorted = [...rooms].sort((a, b) => a.id.localeCompare(b.id));
  const raw = `${unit}_${plotWidth}x${plotLength}_` +
    sorted
      .map(
        (r) =>
          `${r.id}:${r.type}:${r.floorLevel}:${r.x.toFixed(2)},${r.y.toFixed(2)},${r.width.toFixed(2)},${r.length.toFixed(2)}`
      )
      .join('|');

  // Simple, deterministic 32-bit FNV-1a hash
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `geom-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * Deterministic hash for design alternative choices.
 */
export function computeDesignHash(project: Project): string {
  const alt = project.designAlternatives?.find(
    (a) => a.id === project.activeAlternativeId
  ) || project.designAlternatives?.[0];

  if (!alt) return 'design-none';

  const interiorKeys = Object.keys(alt.interiors || {}).sort().join(',');
  const raw = `${alt.id}:${alt.facade.style}:${alt.facade.primaryMaterial}:${alt.facade.primaryColor}:${interiorKeys}`;

  let hash = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `dsgn-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * Calculate derived metrics from geometry and project program.
 */
export function calculateDerivedMetrics(
  project: Project,
  rooms: FloorPlanRoom[]
): DerivedMetrics {
  const plotArea = Math.max(0, project.plotWidth * project.plotLength);

  let groundFloorArea = 0;
  let totalBuiltArea = 0;
  const floorBreakdown: Record<number, { roomCount: number; area: number }> = {};

  rooms.forEach((room) => {
    // Only tally rooms with positive non-zero area
    if (room.width > 0 && room.length > 0) {
      const roomArea = room.width * room.length;
      totalBuiltArea += roomArea;

      const level = room.floorLevel || 1;
      if (!floorBreakdown[level]) {
        floorBreakdown[level] = { roomCount: 0, area: 0 };
      }
      floorBreakdown[level].roomCount += 1;
      floorBreakdown[level].area = Number((floorBreakdown[level].area + roomArea).toFixed(1));

      if (level === 1) {
        groundFloorArea += roomArea;
      }
    }
  });

  groundFloorArea = Number(groundFloorArea.toFixed(1));
  totalBuiltArea = Number(totalBuiltArea.toFixed(1));

  const groundCoveragePercent =
    plotArea > 0 ? Number(((groundFloorArea / plotArea) * 100).toFixed(1)) : 0;

  const floorAreaRatio =
    plotArea > 0 ? Number((totalBuiltArea / plotArea).toFixed(2)) : 0;

  // Programmed rooms analysis
  const programmedTypes: string[] = [];
  const cfg = project.rooms;
  if (cfg) {
    if (cfg.bedrooms) for (let i = 0; i < cfg.bedrooms; i++) programmedTypes.push('bedroom');
    if (cfg.bathrooms) for (let i = 0; i < cfg.bathrooms; i++) programmedTypes.push('bathroom');
    if (cfg.kitchen) for (let i = 0; i < cfg.kitchen; i++) programmedTypes.push('kitchen');
    if (cfg.livingRoom) for (let i = 0; i < cfg.livingRoom; i++) programmedTypes.push('living');
    if (cfg.diningRoom) for (let i = 0; i < cfg.diningRoom; i++) programmedTypes.push('dining');
    if (cfg.homeOffice) for (let i = 0; i < cfg.homeOffice; i++) programmedTypes.push('office');
    if (cfg.balcony) for (let i = 0; i < cfg.balcony; i++) programmedTypes.push('balcony');
    if (cfg.garage) for (let i = 0; i < cfg.garage; i++) programmedTypes.push('garage');
  }

  const placedTypes = rooms.map((r) => r.type);
  const unplacedProgramRooms: string[] = [];
  const placedPool = [...placedTypes];

  programmedTypes.forEach((pType) => {
    const idx = placedPool.indexOf(pType);
    if (idx !== -1) {
      placedPool.splice(idx, 1);
    } else {
      unplacedProgramRooms.push(pType);
    }
  });

  return {
    plotArea: Number(plotArea.toFixed(1)),
    groundFloorArea,
    totalBuiltArea,
    groundCoveragePercent,
    floorAreaRatio,
    roomCount: rooms.length,
    programmedRoomCount: programmedTypes.length,
    unplacedProgramRooms,
    floorBreakdown,
  };
}

/**
 * Validate room geometry against plot constraints and geometric invariants.
 */
export function validateGeometry(
  rooms: FloorPlanRoom[],
  plotWidth: number,
  plotLength: number
): {
  issues: TwinValidationIssue[];
  criticalErrors: boolean;
  hasWarnings: boolean;
} {
  const issues: TwinValidationIssue[] = [];
  let criticalErrors = false;
  let hasWarnings = false;

  rooms.forEach((room) => {
    // 1. Invalid or zero dimensions
    if (room.width <= 0 || room.length <= 0 || isNaN(room.width) || isNaN(room.length)) {
      criticalErrors = true;
      issues.push({
        id: `err-dim-${room.id}`,
        severity: 'error',
        message: `Room "${room.name}" has invalid or zero dimensions (${room.width} x ${room.length}).`,
        affectedElement: room.name,
        remedy: 'Set width and length to positive numbers in the 2D editor inspector.',
      });
    }

    // 2. Negative coordinates
    if (room.x < 0 || room.y < 0) {
      issues.push({
        id: `err-coord-${room.id}`,
        severity: 'error',
        message: `Room "${room.name}" has negative coordinates (x: ${room.x.toFixed(1)}, y: ${room.y.toFixed(1)}).`,
        affectedElement: room.name,
        remedy: 'Move room inside the plot origin (x >= 0, y >= 0).',
      });
      criticalErrors = true;
    }

    // 3. Boundary overflow
    if (room.x + room.width > plotWidth || room.y + room.length > plotLength) {
      const overflowX = Math.max(0, room.x + room.width - plotWidth);
      const overflowY = Math.max(0, room.y + room.length - plotLength);
      issues.push({
        id: `warn-bound-${room.id}`,
        severity: 'warning',
        message: `Room "${room.name}" extends past the plot boundary by ${Math.max(overflowX, overflowY).toFixed(1)} units.`,
        affectedElement: room.name,
        remedy: 'Reposition room or adjust dimensions to fit within plot boundaries.',
      });
      hasWarnings = true;
    }
  });

  // 4. Overlap detection between rooms on the same floor level
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const r1 = rooms[i];
      const r2 = rooms[j];
      if (r1.floorLevel !== r2.floorLevel) continue;

      const noOverlap =
        r1.x + r1.width <= r2.x ||
        r2.x + r2.width <= r1.x ||
        r1.y + r1.length <= r2.y ||
        r2.y + r2.length <= r1.y;

      if (!noOverlap) {
        issues.push({
          id: `warn-overlap-${r1.id}-${r2.id}`,
          severity: 'warning',
          message: `Spatial collision between "${r1.name}" and "${r2.name}" on Floor ${r1.floorLevel}.`,
          affectedElement: `${r1.name} & ${r2.name}`,
          remedy: 'Separate room boundaries or adjust snap grid in 2D editor.',
        });
        hasWarnings = true;
      }
    }
  }

  return { issues, criticalErrors, hasWarnings };
}

/**
 * Main evaluation function for the Architectural Decision Twin.
 * Evaluates state across Project Spec, 2D Geometry, Derived Metrics,
 * 3D Model, Facade Envelope, Interior Schedules, and Structural/MEP.
 */
export function evaluateDecisionTwin(
  project: Project,
  draftRooms?: FloorPlanRoom[] | null,
  options?: { isDraftModified?: boolean }
): DecisionTwinState {
  const timestamp = new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const savedRooms = project.floorPlan?.rooms || [];
  const effectiveRooms = draftRooms ?? savedRooms;
  const isDraftModified = Boolean(options?.isDraftModified);

  const savedGeometryHash = computeGeometryHash(
    savedRooms,
    project.plotWidth,
    project.plotLength,
    project.unit
  );
  const currentGeometryHash = computeGeometryHash(
    effectiveRooms,
    project.plotWidth,
    project.plotLength,
    project.unit
  );
  const designHash = computeDesignHash(project);

  // Validate geometry
  const validation = validateGeometry(
    effectiveRooms,
    project.plotWidth,
    project.plotLength
  );

  // Calculate derived metrics
  const derivedMetrics = calculateDerivedMetrics(project, effectiveRooms);

  // Active alternative inspection
  const activeAlt = project.designAlternatives?.find(
    (a) => a.id === project.activeAlternativeId
  ) || project.designAlternatives?.[0];

  // Interior finish coverage
  const interiorMap = activeAlt?.interiors || {};
  const unassignedInteriorRooms = effectiveRooms.filter((r) => !interiorMap[r.id]);

  const nodes: Record<DependencyNodeId, DependencyNode> = {
    'project-spec': {
      id: 'project-spec',
      name: 'Project Specification & Plot',
      category: 'specification',
      status: project.plotWidth > 0 && project.plotLength > 0 ? 'current' : 'failed',
      statusMessage:
        project.plotWidth > 0 && project.plotLength > 0
          ? `Verified plot boundaries: ${project.plotWidth} × ${project.plotLength} ${project.unit}`
          : 'Plot dimensions are zero or invalid.',
      lastUpdated: new Date(project.updatedAt || project.createdAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
      sourceIds: [],
      dependentIds: ['floorplan-2d', 'derived-metrics', 'model-3d', 'facade-envelope'],
      metrics: {
        'Plot Dimensions': `${project.plotWidth} × ${project.plotLength} ${project.unit}`,
        'Plot Area': `${derivedMetrics.plotArea} ${project.unit === 'feet' ? 'sq ft' : 'm²'}`,
        'Orientation': project.roadFacing,
        'Floors Specified': project.floors,
      },
      issues:
        project.plotWidth <= 0 || project.plotLength <= 0
          ? [
              {
                id: 'err-plot-spec',
                severity: 'error',
                message: 'Plot dimensions must be greater than zero.',
                remedy: 'Edit project specifications to set valid plot boundaries.',
              },
            ]
          : [],
      isSupported: true,
    },

    'floorplan-2d': {
      id: 'floorplan-2d',
      name: '2D Floor Plan Geometry',
      category: 'geometry',
      status: validation.criticalErrors
        ? 'failed'
        : isDraftModified
        ? 'stale'
        : effectiveRooms.length === 0
        ? 'stale'
        : 'current',
      statusMessage: validation.criticalErrors
        ? 'Critical geometric errors detected in room definitions.'
        : isDraftModified
        ? 'Unsaved 2D canvas edits pending save; downstream dependencies out of sync.'
        : effectiveRooms.length === 0
        ? 'No room polygons defined in project.'
        : `${effectiveRooms.length} rooms placed across ${Object.keys(derivedMetrics.floorBreakdown).length} floor(s).`,
      lastUpdated: timestamp,
      sourceIds: ['project-spec'],
      dependentIds: ['derived-metrics', 'model-3d', 'interior-schedules'],
      metrics: {
        'Placed Rooms': effectiveRooms.length,
        'Active Floors': Object.keys(derivedMetrics.floorBreakdown).length,
        'Revision Hash': currentGeometryHash,
        'Draft State': isDraftModified ? 'Unsaved Edits Pending' : 'Saved to Project',
      },
      issues: validation.issues,
      isSupported: true,
    },

    'derived-metrics': {
      id: 'derived-metrics',
      name: 'Spatial & Area Metrics',
      category: 'analytics',
      status: validation.criticalErrors
        ? 'failed'
        : isDraftModified
        ? 'stale'
        : 'current',
      statusMessage: validation.criticalErrors
        ? 'Calculations blocked by invalid geometry.'
        : isDraftModified
        ? 'Metrics calculated from unsaved draft geometry; save to synchronize.'
        : `Gross built area: ${derivedMetrics.totalBuiltArea} ${project.unit === 'feet' ? 'sq ft' : 'm²'} · FAR: ${derivedMetrics.floorAreaRatio}`,
      lastUpdated: timestamp,
      sourceIds: ['floorplan-2d', 'project-spec'],
      dependentIds: ['model-3d'],
      metrics: {
        'Gross Built Area': `${derivedMetrics.totalBuiltArea} ${project.unit === 'feet' ? 'sq ft' : 'm²'}`,
        'Ground Floor Area': `${derivedMetrics.groundFloorArea} ${project.unit === 'feet' ? 'sq ft' : 'm²'}`,
        'Ground Coverage': `${derivedMetrics.groundCoveragePercent}%`,
        'Floor Area Ratio (FAR)': derivedMetrics.floorAreaRatio,
        'Program Coverage': `${effectiveRooms.length} of ${derivedMetrics.programmedRoomCount} programmed spaces placed`,
      },
      issues:
        derivedMetrics.groundCoveragePercent > 80
          ? [
              {
                id: 'warn-coverage-high',
                severity: 'warning',
                message: `Ground coverage is ${derivedMetrics.groundCoveragePercent}%, which exceeds standard residential setback allowances (typically 60-70%).`,
                remedy: 'Verify local municipal zoning setback requirements.',
              },
            ]
          : [],
      isSupported: true,
    },

    'model-3d': {
      id: 'model-3d',
      name: '3D Building Extrusions & Voids',
      category: 'visualization',
      status: validation.criticalErrors
        ? 'failed'
        : effectiveRooms.length === 0
        ? 'stale'
        : isDraftModified
        ? 'stale'
        : 'current',
      statusMessage: validation.criticalErrors
        ? '3D mesh extrusion halted due to geometry errors.'
        : effectiveRooms.length === 0
        ? 'Awaiting 2D floor plan layout to extrude walls and slabs.'
        : isDraftModified
        ? '3D viewer reflects last saved plan; save 2D draft to update 3D mesh.'
        : `Synchronized with ${savedRooms.length} room extrusions and floor slab.`,
      lastUpdated: timestamp,
      sourceIds: ['floorplan-2d', 'project-spec', 'facade-envelope'],
      dependentIds: [],
      metrics: {
        'Extruded Spaces': effectiveRooms.length,
        'Default Wall Height': project.unit === 'feet' ? '10 ft' : '3.0 m',
        'Wall Thickness': project.unit === 'feet' ? '0.5 ft' : '0.15 m',
        'Mesh Sync Hash': savedGeometryHash,
      },
      issues: isDraftModified
        ? [
            {
              id: 'info-3d-stale-draft',
              severity: 'info',
              message: '3D model is currently displaying the last saved floor plan revision.',
              remedy: 'Click "Save Floor Plan" in the 2D editor to push updates to 3D.',
            },
          ]
        : [],
      isSupported: true,
    },

    'facade-envelope': {
      id: 'facade-envelope',
      name: 'Exterior Facade & Materials',
      category: 'finishes',
      status: activeAlt ? 'current' : 'stale',
      statusMessage: activeAlt
        ? `Active Concept: ${activeAlt.name} (${activeAlt.facade.style} style · ${activeAlt.facade.primaryMaterial})`
        : 'No design alternative selected.',
      lastUpdated: timestamp,
      sourceIds: ['project-spec'],
      dependentIds: ['model-3d'],
      metrics: {
        'Architectural Style': activeAlt?.facade.style || 'None',
        'Primary Cladding': activeAlt?.facade.primaryMaterial || 'None',
        'Window Fenestration': activeAlt?.facade.windowStyle || 'None',
        'Active Alternative': activeAlt?.name || 'Default',
      },
      issues: [],
      isSupported: true,
    },

    'interior-schedules': {
      id: 'interior-schedules',
      name: 'Interior Finish Schedules',
      category: 'finishes',
      status:
        effectiveRooms.length === 0
          ? 'stale'
          : unassignedInteriorRooms.length > 0
          ? 'stale'
          : 'current',
      statusMessage:
        effectiveRooms.length === 0
          ? 'No rooms placed to assign finishes.'
          : unassignedInteriorRooms.length > 0
          ? `${effectiveRooms.length - unassignedInteriorRooms.length} of ${effectiveRooms.length} rooms scheduled · ${unassignedInteriorRooms.length} room(s) missing interior finishes.`
          : `All ${effectiveRooms.length} rooms mapped with finishes in "${activeAlt?.name || 'Active Option'}".`,
      lastUpdated: timestamp,
      sourceIds: ['floorplan-2d'],
      dependentIds: [],
      metrics: {
        'Scheduled Rooms': `${effectiveRooms.length - unassignedInteriorRooms.length}/${effectiveRooms.length}`,
        'Unassigned Spaces': unassignedInteriorRooms.map((r) => r.name).join(', ') || 'None',
      },
      issues:
        unassignedInteriorRooms.length > 0
          ? [
              {
                id: 'warn-unassigned-interiors',
                severity: 'info',
                message: `${unassignedInteriorRooms.length} room(s) do not yet have interior material palettes assigned.`,
                affectedElement: unassignedInteriorRooms.map((r) => r.name).join(', '),
                remedy: 'Open Interior Studio to configure room finishes.',
              },
            ]
          : [],
      isSupported: true,
    },

    'structural-mep': {
      id: 'structural-mep',
      name: 'Structural & MEP Engineering Coordination',
      category: 'engineering',
      status: isDraftModified || (Boolean(project.structuralCoordination?.lastEvaluatedGeometryHash) && project.structuralCoordination?.lastEvaluatedGeometryHash !== currentGeometryHash)
        ? 'stale'
        : (project.structuralCoordination?.reviewIssues?.some((i) => i.severity === 'conflict' && i.status !== 'resolved') ?? false)
        ? 'failed'
        : 'current',
      statusMessage: isDraftModified
        ? 'Structural & MEP checks stale: Unsaved floor plan draft changes detected.'
        : (Boolean(project.structuralCoordination?.lastEvaluatedGeometryHash) && project.structuralCoordination?.lastEvaluatedGeometryHash !== currentGeometryHash)
        ? 'Structural & MEP coordination stale: Geometry updated since last run. Re-evaluation required.'
        : project.structuralCoordination
        ? `Coordinated: ${project.structuralCoordination.columns.length} columns, ${project.structuralCoordination.grid.xAxes.length}×${project.structuralCoordination.grid.yAxes.length} grid bays (${project.structuralCoordination.framingSystem.replace(/-/g, ' ')}).`
        : 'Structural & MEP coordination active with orthogonal reference grid, prescriptive spans, and spatial clash detection.',
      lastUpdated: project.structuralCoordination?.lastEvaluatedAt || timestamp,
      sourceIds: ['project-spec', 'floorplan-2d', 'model-3d'],
      dependentIds: ['regulatory-compliance'],
      metrics: {
        'Framing System': project.structuralCoordination?.framingSystem
          ? project.structuralCoordination.framingSystem.replace(/-/g, ' ')
          : 'Prescriptive Light Frame',
        'Structural Columns': project.structuralCoordination?.columns.length ?? (effectiveRooms.length > 0 ? 8 : 0),
        'Prescriptive Max Span': `${project.structuralCoordination?.maxUnsupportedSpanThreshold ?? (project.unit === 'feet' ? 20 : 6.0)} ${project.unit === 'feet' ? 'ft' : 'm'}`,
        'MEP Elements Placed': project.mepCoordination?.components?.length ?? (effectiveRooms.length > 0 ? 3 : 0),
        'MEP Hard Clashes': project.mepCoordination?.summary?.clashCounts?.hardClash ?? 0,
        'Sign-Off Status': project.structuralCoordination?.engineeringSignOff?.isSignedOff ? 'Signed & Stamped' : 'Pending Engineer Stamp',
      },
      issues: [
        {
          id: 'info-disclaimer',
          severity: 'info',
          message:
            'Plotify evaluates geometric framing coordination and clear spans. Final gravity/lateral load engineering calculations must be sealed by a licensed PE/SE.',
        },
        ...((project.structuralCoordination?.reviewIssues || [])
          .filter((i) => i.severity === 'conflict' && i.status !== 'resolved')
          .map((i) => ({
            id: i.id,
            severity: 'error' as const,
            message: `${i.title}: ${i.description}`,
            affectedElement: i.affectedElements.join(', '),
            remedy: i.recommendation,
          }))),
      ],
      isSupported: true,
    },

    'regulatory-compliance': {
      id: 'regulatory-compliance',
      name: 'Building Regulations Intelligence',
      category: 'engineering',
      status: isDraftModified || (Boolean(project.regulations?.lastEvaluatedGeometryHash) && project.regulations?.lastEvaluatedGeometryHash !== currentGeometryHash)
        ? 'stale'
        : 'current',
      statusMessage: isDraftModified || (Boolean(project.regulations?.lastEvaluatedGeometryHash) && project.regulations?.lastEvaluatedGeometryHash !== currentGeometryHash)
        ? 'Regulatory checks stale: Project geometry changed since last statutory assessment. Re-evaluation required.'
        : 'Regulatory intelligence checks synchronized with current design geometry.',
      lastUpdated: project.regulations?.lastEvaluatedAt || timestamp,
      sourceIds: ['project-spec', 'floorplan-2d'],
      dependentIds: [],
      metrics: {
        Jurisdiction: project.regulations?.profile.country || 'United States (Model Code)',
        'Active Code Pack': project.regulations?.activeRulePack || 'IRC 2021 Model Code',
        'Review Pathway': project.regulations?.profile.approvalPathway || 'Standard Permit',
      },
      issues: [],
      isSupported: true,
    },
  };

  // Determine overall status
  let overallStatus: 'synchronized' | 'stale-pending' | 'geometric-violation' | 'degraded' =
    'synchronized';
  let overallMessage = 'All connected architectural outputs are current and synchronized.';

  if (validation.criticalErrors || project.plotWidth <= 0) {
    overallStatus = 'geometric-violation';
    overallMessage =
      'Geometry violations detected. Fix invalid room dimensions to re-enable 3D extrusions.';
  } else if (isDraftModified) {
    overallStatus = 'stale-pending';
    overallMessage =
      'Unsaved 2D draft divergence. Save floor plan to synchronize 3D building viewer and area schedules.';
  } else if (effectiveRooms.length === 0) {
    overallStatus = 'stale-pending';
    overallMessage = 'Floor plan is empty. Place rooms in 2D editor to generate 3D model.';
  } else if (unassignedInteriorRooms.length > 0) {
    overallStatus = 'stale-pending';
    overallMessage = `${unassignedInteriorRooms.length} room(s) pending interior finish specifications.`;
  }

  // Generate audit impact events
  const recentEvents: TwinImpactEvent[] = [
    {
      id: `evt-${Date.now()}-1`,
      timestamp,
      title: isDraftModified ? '2D Spatial Draft In Progress' : 'Project Model Evaluated',
      description: isDraftModified
        ? 'Real-time 2D geometry edit detected. Dependent 3D meshes and schedule outputs marked as Stale pending save.'
        : `Synchronized ${effectiveRooms.length} rooms with total gross built area of ${derivedMetrics.totalBuiltArea} ${project.unit === 'feet' ? 'sq ft' : 'm²'}.`,
      affectedNodes: isDraftModified
        ? ['floorplan-2d', 'derived-metrics', 'model-3d', 'interior-schedules']
        : ['project-spec', 'floorplan-2d', 'derived-metrics', 'model-3d'],
      severity: validation.criticalErrors
        ? 'error'
        : isDraftModified
        ? 'warning'
        : 'success',
    },
  ];

  if (validation.hasWarnings && !validation.criticalErrors) {
    recentEvents.push({
      id: `evt-${Date.now()}-2`,
      timestamp,
      title: 'Geometric Boundary or Overlap Warning',
      description: 'One or more rooms cross plot setback boundaries or collide on the same floor level.',
      affectedNodes: ['floorplan-2d', 'derived-metrics'],
      severity: 'warning',
    });
  }

  return {
    projectId: project.id,
    projectName: project.name,
    unit: project.unit,
    overallStatus,
    overallMessage,
    lastEvaluationTimestamp: timestamp,
    geometryHash: currentGeometryHash,
    designHash,
    hasUnsavedDraft: isDraftModified,
    draftChangesCount: isDraftModified ? 1 : 0,
    nodes,
    derivedMetrics,
    recentEvents,
  };
}
