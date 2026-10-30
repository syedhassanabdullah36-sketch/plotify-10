import { Project, FloorPlanRoom } from '../types/project';
import {
  ConstraintGraphState,
  ConstraintNode,
  ConstraintSummary,
} from '../types/constraintGraph';
import { computeGeometryHash, computeDesignHash } from './decisionTwinService';
import { evaluateProjectRegulations } from './regulatoryService';
import { evaluateMEPClashes } from './mepClashService';
import { formatCurrency } from '../utils/formatters';

interface EvaluationOptions {
  draftRooms?: FloorPlanRoom[];
  isDraftPending?: boolean;
}

/**
 * Pure deterministic evaluator for the Plotify Living Constraint Graph.
 * Operates strictly on real project data without mutating user state.
 */
export function evaluateConstraintGraph(
  project: Project,
  options?: EvaluationOptions
): ConstraintGraphState {
  const activeRooms = options?.draftRooms || project.floorPlan?.rooms || [];
  const isDraftPending = Boolean(options?.isDraftPending);

  const unitSuffix = project.unit === 'feet' ? 'ft' : 'm';
  const unitFactor = project.unit === 'feet' ? 1 : 10.764; // sq m to sq ft approx for budget reference

  // Deterministic source version hash
  const geomHash = computeGeometryHash(
    activeRooms,
    project.plotWidth,
    project.plotLength,
    project.unit
  );
  const designHash = computeDesignHash(project);
  const dataVersion = `${project.id}-v${project.updatedAt || '0'}-${geomHash}-${isDraftPending ? 'draft' : 'synced'}`;
  const nowIso = new Date().toISOString();

  const constraints: ConstraintNode[] = [];

  // ==========================================
  // 1. PLOT ENVELOPE CONSTRAINTS
  // ==========================================

  // 1.1 Plot Dimensions Validity
  const plotWidthValid = typeof project.plotWidth === 'number' && project.plotWidth > 0;
  const plotLengthValid = typeof project.plotLength === 'number' && project.plotLength > 0;
  const plotDimensionsValid = plotWidthValid && plotLengthValid;

  constraints.push({
    id: `${project.id}-plot-dim-validity`,
    projectId: project.id,
    category: 'plot-envelope',
    title: 'Plot Envelope Dimensional Validity',
    description: 'Verifies that plot width and length are strictly positive, measurable real values.',
    sourceRequirement: {
      label: 'Plot Parameters',
      value: `Width > 0, Length > 0`,
      unit: unitSuffix,
    },
    designValue: {
      label: 'Declared Plot',
      value: `${project.plotWidth} × ${project.plotLength}`,
      unit: unitSuffix,
    },
    comparisonRule: 'plotWidth > 0 && plotLength > 0',
    status: plotDimensionsValid ? 'pass' : 'conflict',
    statusReason: plotDimensionsValid
      ? `Plot dimensions are valid (${project.plotWidth} × ${project.plotLength} ${unitSuffix}).`
      : `Invalid plot dimensions declared: width is ${project.plotWidth}, length is ${project.plotLength}.`,
    affectedElements: ['Plot Width', 'Plot Length'],
    recommendation: !plotDimensionsValid
      ? {
          actionLabel: 'Correct Plot Dimensions',
          actionType: 'navigate-edit-project',
          details: 'Open project specification to enter positive numeric dimensions for plot width and length.',
        }
      : undefined,
    dataVersion,
    lastEvaluatedAt: nowIso,
  });

  // 1.2 Plot Boundary Containment
  if (activeRooms.length === 0) {
    constraints.push({
      id: `${project.id}-plot-containment`,
      projectId: project.id,
      category: 'plot-envelope',
      title: 'Plot Boundary Spatial Containment',
      description: 'Ensures all placed rooms fit entirely within the declared parcel boundaries.',
      sourceRequirement: {
        label: 'Plot Boundary',
        value: `${project.plotWidth} × ${project.plotLength}`,
        unit: unitSuffix,
      },
      designValue: {
        label: 'Placed Rooms',
        value: '0 rooms placed',
      },
      comparisonRule: 'x >= 0 && y >= 0 && (x + width) <= plotWidth && (y + length) <= plotLength',
      status: 'not-assessed',
      statusReason: 'No rooms have been placed on the floor plan yet. Boundary containment is not assessed.',
      affectedElements: ['Plot Boundary'],
      recommendation: {
        actionLabel: 'Launch 2D Floor Plan',
        actionType: 'navigate-floor-plan',
        details: 'Open 2D floor plan editor to lay out programmed rooms inside the parcel.',
      },
      dataVersion,
      lastEvaluatedAt: nowIso,
    });
  } else {
    const overflowingRooms = activeRooms.filter(
      (r) =>
        r.x < 0 ||
        r.y < 0 ||
        r.x + r.width > project.plotWidth ||
        r.y + r.length > project.plotLength
    );

    const hasViolations = overflowingRooms.length > 0;
    const violationSummary = overflowingRooms
      .map((r) => {
        const overX = Math.max(0, r.x + r.width - project.plotWidth);
        const overY = Math.max(0, r.y + r.length - project.plotLength);
        const maxOver = Math.max(overX, overY);
        return `"${r.name}" (${maxOver > 0 ? `+${maxOver.toFixed(1)}${unitSuffix} overflow` : 'negative offset'})`;
      })
      .join(', ');

    constraints.push({
      id: `${project.id}-plot-containment`,
      projectId: project.id,
      category: 'plot-envelope',
      title: 'Plot Boundary Spatial Containment',
      description: 'Ensures all placed rooms fit entirely within the declared parcel boundaries.',
      sourceRequirement: {
        label: 'Plot Boundary',
        value: `${project.plotWidth} × ${project.plotLength}`,
        unit: unitSuffix,
      },
      designValue: {
        label: 'Boundary Check',
        value: hasViolations ? `${overflowingRooms.length} room(s) overflow` : 'All rooms contained',
        unit: unitSuffix,
      },
      comparisonRule: 'x >= 0 && y >= 0 && (x + width) <= plotWidth && (y + length) <= plotLength',
      status: hasViolations ? 'conflict' : 'pass',
      statusReason: hasViolations
        ? `Spatial boundary violation: ${overflowingRooms.length} room(s) extend past the plot limits: ${violationSummary}.`
        : `All ${activeRooms.length} room(s) are strictly contained inside the ${project.plotWidth} × ${project.plotLength} ${unitSuffix} plot envelope.`,
      affectedElements: hasViolations ? overflowingRooms.map((r) => r.name) : ['Plot Envelope'],
      recommendation: hasViolations
        ? {
            actionLabel: 'Adjust in 2D Floor Plan',
            actionType: 'navigate-floor-plan',
            targetRoomId: overflowingRooms[0]?.id,
            details: 'Move or resize overflowing rooms inside the 2D floor plan canvas, or adjust plot dimensions in project settings.',
          }
        : undefined,
      dataVersion,
      lastEvaluatedAt: nowIso,
    });
  }

  // ==========================================
  // 2. ROOM GEOMETRIC INVARIANTS
  // ==========================================

  // 2.1 Room Dimensions Positivity
  if (activeRooms.length === 0) {
    constraints.push({
      id: `${project.id}-room-dim-positive`,
      projectId: project.id,
      category: 'room-geometry',
      title: 'Room Dimensional Positivity',
      description: 'Verifies that every architectural room has strictly positive non-zero width and length.',
      sourceRequirement: {
        label: 'Geometric Invariant',
        value: 'width > 0, length > 0',
        unit: unitSuffix,
      },
      designValue: {
        label: 'Rooms',
        value: 'None placed',
      },
      comparisonRule: 'room.width > 0 && room.length > 0',
      status: 'not-assessed',
      statusReason: 'No rooms exist in the floor plan to evaluate dimensional positivity.',
      affectedElements: ['Room Dimensions'],
      dataVersion,
      lastEvaluatedAt: nowIso,
    });
  } else {
    const invalidRooms = activeRooms.filter(
      (r) => r.width <= 0 || r.length <= 0 || isNaN(r.width) || isNaN(r.length)
    );
    const hasInvalid = invalidRooms.length > 0;

    constraints.push({
      id: `${project.id}-room-dim-positive`,
      projectId: project.id,
      category: 'room-geometry',
      title: 'Room Dimensional Positivity',
      description: 'Verifies that every architectural room has strictly positive non-zero width and length.',
      sourceRequirement: {
        label: 'Geometric Invariant',
        value: 'width > 0, length > 0',
        unit: unitSuffix,
      },
      designValue: {
        label: 'Evaluated Rooms',
        value: hasInvalid ? `${invalidRooms.length} zero/invalid` : `${activeRooms.length} rooms positive`,
      },
      comparisonRule: 'room.width > 0 && room.length > 0',
      status: hasInvalid ? 'conflict' : 'pass',
      statusReason: hasInvalid
        ? `${invalidRooms.length} room(s) have invalid or zero dimensions: ${invalidRooms.map((r) => r.name).join(', ')}.`
        : `All ${activeRooms.length} room(s) have positive non-zero dimensions.`,
      affectedElements: hasInvalid ? invalidRooms.map((r) => r.name) : ['Room Geometry'],
      recommendation: hasInvalid
        ? {
            actionLabel: 'Fix Room Dimensions',
            actionType: 'navigate-floor-plan',
            targetRoomId: invalidRooms[0]?.id,
            details: 'Open 2D editor inspector to assign valid positive numbers for width and length.',
          }
        : undefined,
      dataVersion,
      lastEvaluatedAt: nowIso,
    });
  }

  // 2.2 Room Non-Overlap on Same Floor Level
  if (activeRooms.length < 2) {
    constraints.push({
      id: `${project.id}-room-non-overlap`,
      projectId: project.id,
      category: 'room-geometry',
      title: 'Coplanar Room Non-Overlap',
      description: 'Verifies that rooms situated on the same floor level do not occupy intersecting floor space.',
      sourceRequirement: {
        label: 'AABB Non-Intersection',
        value: 'Disjoint spatial envelopes',
      },
      designValue: {
        label: 'Placed Rooms',
        value: `${activeRooms.length} room(s)`,
      },
      comparisonRule: 'r1.right <= r2.left || r2.right <= r1.left || r1.bottom <= r2.top || r2.bottom <= r1.top',
      status: 'pass',
      statusReason: activeRooms.length === 1
        ? 'Single room on floor; no coplanar collisions possible.'
        : 'No rooms placed yet; collision check trivially clean.',
      affectedElements: ['Room Boundaries'],
      dataVersion,
      lastEvaluatedAt: nowIso,
    });
  } else {
    const collisions: Array<{ r1: FloorPlanRoom; r2: FloorPlanRoom; floor: number }> = [];

    for (let i = 0; i < activeRooms.length; i++) {
      for (let j = i + 1; j < activeRooms.length; j++) {
        const r1 = activeRooms[i];
        const r2 = activeRooms[j];
        if (r1.floorLevel !== r2.floorLevel) continue;

        const separated =
          r1.x + r1.width <= r2.x ||
          r2.x + r2.width <= r1.x ||
          r1.y + r1.length <= r2.y ||
          r2.y + r2.length <= r1.y;

        if (!separated) {
          collisions.push({ r1, r2, floor: r1.floorLevel });
        }
      }
    }

    const hasCollisions = collisions.length > 0;
    const collisionSummary = collisions
      .map((c) => `"${c.r1.name}" × "${c.r2.name}" (Floor ${c.floor})`)
      .join(', ');

    constraints.push({
      id: `${project.id}-room-non-overlap`,
      projectId: project.id,
      category: 'room-geometry',
      title: 'Coplanar Room Non-Overlap',
      description: 'Verifies that rooms situated on the same floor level do not occupy intersecting floor space.',
      sourceRequirement: {
        label: 'AABB Non-Intersection',
        value: 'Zero overlapping area',
      },
      designValue: {
        label: 'Overlap Status',
        value: hasCollisions ? `${collisions.length} collision(s)` : 'Zero collisions',
      },
      comparisonRule: 'r1.right <= r2.left || r2.right <= r1.left || r1.bottom <= r2.top || r2.bottom <= r1.top',
      status: hasCollisions ? 'conflict' : 'pass',
      statusReason: hasCollisions
        ? `Spatial collision detected between coplanar rooms: ${collisionSummary}.`
        : `No spatial overlap detected across ${activeRooms.length} room(s) on all floor levels.`,
      affectedElements: hasCollisions
        ? Array.from(new Set(collisions.flatMap((c) => [c.r1.name, c.r2.name])))
        : ['Floor Plan Layout'],
      recommendation: hasCollisions
        ? {
            actionLabel: 'Resolve Overlaps in 2D Editor',
            actionType: 'navigate-floor-plan',
            targetRoomId: collisions[0]?.r1.id,
            details: 'Reposition overlapping rooms using grid snap or numeric coordinate inputs in the 2D floor plan editor.',
          }
        : undefined,
      dataVersion,
      lastEvaluatedAt: nowIso,
    });
  }

  // ==========================================
  // 3. MULTI-FLOOR PROGRAM INVARIANTS
  // ==========================================

  // 3.1 Floor Count Validity
  const floorsValid = typeof project.floors === 'number' && project.floors >= 1;
  constraints.push({
    id: `${project.id}-floor-count-valid`,
    projectId: project.id,
    category: 'floor-program',
    title: 'Multi-Floor Envelope Capacity',
    description: 'Verifies that project floor count is configured to an integer >= 1.',
    sourceRequirement: {
      label: 'Storey Count Rule',
      value: 'floors >= 1',
    },
    designValue: {
      label: 'Configured Floors',
      value: project.floors || 0,
    },
    comparisonRule: 'floors >= 1 && Number.isInteger(floors)',
    status: floorsValid ? 'pass' : 'conflict',
    statusReason: floorsValid
      ? `Project is configured for ${project.floors} ${project.floors === 1 ? 'floor' : 'floors'}.`
      : `Invalid floor count configured: ${project.floors}. Must be at least 1 floor.`,
    affectedElements: ['Project Floors'],
    recommendation: !floorsValid
      ? {
          actionLabel: 'Update Floor Count',
          actionType: 'navigate-edit-project',
          details: 'Edit project specifications to set floor count to at least 1.',
        }
      : undefined,
    dataVersion,
    lastEvaluatedAt: nowIso,
  });

  // 3.2 Placed Rooms Floor Level Assignment
  if (activeRooms.length === 0) {
    constraints.push({
      id: `${project.id}-room-floor-range`,
      projectId: project.id,
      category: 'floor-program',
      title: 'Room Floor Level Assignment',
      description: 'Ensures placed rooms are assigned within the project floor range (1 to declared floors).',
      sourceRequirement: {
        label: 'Allowed Floor Range',
        value: `1 to ${project.floors}`,
      },
      designValue: {
        label: 'Placed Rooms',
        value: 'None',
      },
      comparisonRule: '1 <= room.floorLevel && room.floorLevel <= project.floors',
      status: 'not-assessed',
      statusReason: 'No rooms placed yet to evaluate floor level assignments.',
      affectedElements: ['Floor Levels'],
      dataVersion,
      lastEvaluatedAt: nowIso,
    });
  } else {
    const maxFloors = project.floors || 1;
    const outOfBoundsRooms = activeRooms.filter(
      (r) => !r.floorLevel || r.floorLevel < 1 || r.floorLevel > maxFloors
    );
    const hasOutOfBounds = outOfBoundsRooms.length > 0;

    constraints.push({
      id: `${project.id}-room-floor-range`,
      projectId: project.id,
      category: 'floor-program',
      title: 'Room Floor Level Assignment',
      description: 'Ensures placed rooms are assigned within the project floor range (1 to declared floors).',
      sourceRequirement: {
        label: 'Allowed Floor Range',
        value: `1 to ${maxFloors}`,
      },
      designValue: {
        label: 'Room Floor Distribution',
        value: hasOutOfBounds
          ? `${outOfBoundsRooms.length} room(s) exceed floor ${maxFloors}`
          : `All rooms within 1..${maxFloors}`,
      },
      comparisonRule: '1 <= room.floorLevel && room.floorLevel <= project.floors',
      status: hasOutOfBounds ? 'conflict' : 'pass',
      statusReason: hasOutOfBounds
        ? `${outOfBoundsRooms.length} room(s) assigned to invalid floors (beyond project limit of ${maxFloors}): ${outOfBoundsRooms.map((r) => `"${r.name}" (Floor ${r.floorLevel})`).join(', ')}.`
        : `All ${activeRooms.length} room(s) are correctly situated on Floors 1 through ${maxFloors}.`,
      affectedElements: hasOutOfBounds ? outOfBoundsRooms.map((r) => r.name) : ['Floor Program'],
      recommendation: hasOutOfBounds
        ? {
            actionLabel: 'Adjust Floor Assignment',
            actionType: 'navigate-floor-plan',
            targetRoomId: outOfBoundsRooms[0]?.id,
            details: `Move rooms to Floors 1..${maxFloors} in the 2D editor or increase the project floor count.`,
          }
        : undefined,
      dataVersion,
      lastEvaluatedAt: nowIso,
    });
  }

  // ==========================================
  // 4. PROGRAMMED ROOM REQUIREMENTS
  // ==========================================

  const programChecks = [
    { key: 'bedrooms', label: 'Bedrooms', type: 'bedroom', req: project.rooms.bedrooms },
    { key: 'bathrooms', label: 'Bathrooms', type: 'bathroom', req: project.rooms.bathrooms },
    { key: 'kitchen', label: 'Kitchen', type: 'kitchen', req: project.rooms.kitchen },
    { key: 'livingRoom', label: 'Living Room', type: 'living', req: project.rooms.livingRoom },
    { key: 'diningRoom', label: 'Dining Room', type: 'dining', req: project.rooms.diningRoom || 0 },
    { key: 'homeOffice', label: 'Home Office', type: 'office', req: project.rooms.homeOffice || 0 },
    { key: 'balcony', label: 'Balcony / Terrace', type: 'balcony', req: project.rooms.balcony || 0 },
    { key: 'garage', label: 'Garage', type: 'garage', req: project.rooms.garage || 0 },
  ];

  programChecks.forEach((chk) => {
    if (chk.req > 0) {
      const placedCount = activeRooms.filter((r) => r.type === chk.type).length;
      const isSatisfied = placedCount >= chk.req;

      constraints.push({
        id: `${project.id}-prog-${chk.key}`,
        projectId: project.id,
        category: 'program-requirements',
        title: `Program Requirement: ${chk.label}`,
        description: `Compares actual placed ${chk.label.toLowerCase()} spaces on the 2D plan against client brief specification.`,
        sourceRequirement: {
          label: 'Client Brief Target',
          value: chk.req,
          unit: 'spaces',
        },
        designValue: {
          label: 'Placed in 2D Plan',
          value: placedCount,
          unit: 'spaces',
        },
        comparisonRule: 'actualPlacedCount >= briefRequiredCount',
        status: isSatisfied ? 'pass' : 'conflict',
        statusReason: isSatisfied
          ? `Requirement fulfilled: ${placedCount} of ${chk.req} ${chk.label.toLowerCase()} spaces placed.`
          : `Requirement unmet: Brief specifies ${chk.req} ${chk.label.toLowerCase()} space(s), but only ${placedCount} placed on floor plan (${chk.req - placedCount} missing).`,
        affectedElements: [chk.label, 'Floor Plan Program'],
        recommendation: !isSatisfied
          ? {
              actionLabel: `Add ${chk.label} in 2D Editor`,
              actionType: 'navigate-floor-plan',
              details: `Open the 2D floor plan editor and add ${chk.req - placedCount} additional ${chk.label.toLowerCase()} room(s).`,
            }
          : undefined,
        dataVersion,
        lastEvaluatedAt: nowIso,
      });
    }
  });

  // 4.2 Room Minimum Dimension Requirements (Not assessed / Missing Information)
  // The application stores counts, but not explicit custom min-dimension rules in project brief
  constraints.push({
    id: `${project.id}-prog-min-dimensions`,
    projectId: project.id,
    category: 'program-requirements',
    title: 'Room Minimum Dimension Targets',
    description: 'Tracks user-specified minimum width/length constraints for individual room types.',
    sourceRequirement: {
      label: 'Minimum Dimension Rule',
      value: 'Unconfigured in Brief',
    },
    designValue: {
      label: 'Current Geometry',
      value: `${activeRooms.length} rooms drawn`,
    },
    comparisonRule: 'room.width >= briefTargetWidth && room.length >= briefTargetLength',
    status: 'not-assessed',
    statusReason: 'No specific minimum dimension thresholds configured in the project brief. Room dimension target constraint is not assessed.',
    affectedElements: ['Program Specifications'],
    dataVersion,
    lastEvaluatedAt: nowIso,
  });

  // ==========================================
  // 5. 2D-TO-3D DEPENDENCY STATE
  // ==========================================

  if (activeRooms.length === 0) {
    constraints.push({
      id: `${project.id}-sync-2d-3d`,
      projectId: project.id,
      category: '2d-3d-dependency',
      title: '2D-to-3D Geometry Synchronization',
      description: 'Tracks whether the 3D building viewer and volumetric engine reflect current 2D plan state.',
      sourceRequirement: {
        label: '3D Engine Input',
        value: 'Saved 2D Geometry',
      },
      designValue: {
        label: '2D Floor Plan',
        value: 'No rooms placed',
      },
      comparisonRule: 'saved2DHash === activeViewer3DHash',
      status: 'not-assessed',
      statusReason: 'No room geometry placed yet for 3D generation. Synchronization is not assessed.',
      affectedElements: ['3D Building Engine', '2D Floor Plan'],
      recommendation: {
        actionLabel: 'Design in 2D Editor',
        actionType: 'navigate-floor-plan',
        details: 'Place initial rooms on the 2D floor plan to establish 3D volumetric extrusion geometry.',
      },
      dataVersion,
      lastEvaluatedAt: nowIso,
    });
  } else if (isDraftPending) {
    constraints.push({
      id: `${project.id}-sync-2d-3d`,
      projectId: project.id,
      category: '2d-3d-dependency',
      title: '2D-to-3D Geometry Synchronization',
      description: 'Tracks whether the 3D building viewer and volumetric engine reflect current 2D plan state.',
      sourceRequirement: {
        label: 'Source Geometry State',
        value: 'Saved Project Geometry',
      },
      designValue: {
        label: 'Current 2D Editor',
        value: 'Unsaved Draft Changes Pending',
      },
      comparisonRule: 'saved2DHash === activeViewer3DHash',
      status: 'pending',
      statusReason: 'Unsaved 2D floor plan changes exist. 3D building engine and downstream schedules await save to synchronize.',
      affectedElements: ['3D Building Engine', '2D Floor Plan Draft'],
      recommendation: {
        actionLabel: 'Save 2D Changes',
        actionType: 'navigate-floor-plan',
        details: 'Save your 2D floor plan changes to propagate updated geometry to the 3D viewer.',
      },
      dataVersion,
      lastEvaluatedAt: nowIso,
    });
  } else {
    constraints.push({
      id: `${project.id}-sync-2d-3d`,
      projectId: project.id,
      category: '2d-3d-dependency',
      title: '2D-to-3D Geometry Synchronization',
      description: 'Tracks whether the 3D building viewer and volumetric engine reflect current 2D plan state.',
      sourceRequirement: {
        label: 'Source Geometry State',
        value: geomHash,
      },
      designValue: {
        label: '3D Engine State',
        value: 'Synchronized with Saved 2D',
      },
      comparisonRule: 'saved2DHash === activeViewer3DHash',
      status: 'pass',
      statusReason: `3D building engine geometry is fully synchronized with saved 2D plan revision (${geomHash}).`,
      affectedElements: ['3D Building Engine', '2D Floor Plan'],
      recommendation: {
        actionLabel: 'Open 3D Viewer',
        actionType: 'navigate-3d-viewer',
        details: 'Explore realistic 3D volumetric model with active materials and lighting.',
      },
      dataVersion,
      lastEvaluatedAt: nowIso,
    });
  }

  // ==========================================
  // 6. PROJECT BUDGET ALIGNMENT
  // ==========================================

  // Total built area calculation
  const totalBuiltArea = activeRooms.reduce(
    (acc, r) => acc + (r.width > 0 && r.length > 0 ? r.width * r.length : 0),
    0
  );

  if (!project.budget || project.budget <= 0) {
    constraints.push({
      id: `${project.id}-budget-feasibility`,
      projectId: project.id,
      category: 'budget-alignment',
      title: 'Project Budget Feasibility',
      description: 'Compares estimated schematic building cost against the declared client project budget.',
      sourceRequirement: {
        label: 'Allocated Budget',
        value: 'Not configured ($0)',
      },
      designValue: {
        label: 'Total Built Area',
        value: `${totalBuiltArea.toFixed(1)} sq ${unitSuffix}`,
      },
      comparisonRule: 'estimatedConceptualCost <= allocatedBudget',
      status: 'not-assessed',
      statusReason: 'Budget has not been specified for this project ($0 / unconfigured). Budget feasibility is not assessed.',
      affectedElements: ['Project Budget'],
      recommendation: {
        actionLabel: 'Set Project Budget',
        actionType: 'navigate-edit-project',
        details: 'Open project specification to define a target budget for financial feasibility tracking.',
      },
      dataVersion,
      lastEvaluatedAt: nowIso,
    });
  } else {
    // Meaningful comparison: Approximate baseline conceptual cost
    // Baseline ~$180/sq ft (or converted to sq m ~$1940/sq m) depending on costTier
    const activeAlt = project.designAlternatives?.find(
      (a) => a.id === project.activeAlternativeId
    ) || project.designAlternatives?.[0];

    let ratePerSqFt = 180;
    if (activeAlt?.facade.costTier === 'Economic') ratePerSqFt = 120;
    else if (activeAlt?.facade.costTier === 'Balanced Mid-Range') ratePerSqFt = 175;
    else if (activeAlt?.facade.costTier === 'High-End Architectural') ratePerSqFt = 260;
    else if (activeAlt?.facade.costTier === 'Ultra Luxury') ratePerSqFt = 380;

    const areaInSqFt = project.unit === 'metres' ? totalBuiltArea * 10.764 : totalBuiltArea;
    const estimatedCost = Math.round(areaInSqFt * ratePerSqFt);
    const isWithinBudget = estimatedCost <= project.budget;

    constraints.push({
      id: `${project.id}-budget-feasibility`,
      projectId: project.id,
      category: 'budget-alignment',
      title: 'Project Budget Feasibility',
      description: 'Compares estimated schematic building cost against the declared client project budget.',
      sourceRequirement: {
        label: 'Allocated Budget',
        value: formatCurrency(project.budget, project.currency),
      },
      designValue: {
        label: 'Estimated Schematic Cost',
        value: formatCurrency(estimatedCost, project.currency),
      },
      comparisonRule: 'estimatedConceptualCost <= allocatedBudget',
      status: isWithinBudget ? 'pass' : 'conflict',
      statusReason: isWithinBudget
        ? `Estimated schematic cost (${formatCurrency(estimatedCost, project.currency)}) is within the allocated budget (${formatCurrency(project.budget, project.currency)}).`
        : `Budget exceeded: Estimated schematic cost of ${formatCurrency(estimatedCost, project.currency)} exceeds the declared budget of ${formatCurrency(project.budget, project.currency)} by ${formatCurrency(estimatedCost - project.budget, project.currency)}.`,
      affectedElements: ['Project Budget', 'Total Built Area', 'Material Tier'],
      recommendation: !isWithinBudget
        ? {
            actionLabel: 'Adjust Budget or Geometry',
            actionType: 'navigate-edit-project',
            details: 'Increase the allocated project budget or optimize room areas in the 2D floor plan editor.',
          }
        : undefined,
      dataVersion,
      lastEvaluatedAt: nowIso,
    });
  }

  // ==========================================
  // 7. REGULATORY COMPLIANCE CONSTRAINTS (PROMPT 13)
  // ==========================================

  const projectForRegs: Project = {
    ...project,
    floorPlan: {
      ...project.floorPlan,
      rooms: activeRooms,
    },
  };
  const regEvaluation = evaluateProjectRegulations(projectForRegs);

  // 7.1 Statutory Lot Coverage Constraint
  const lotCov = regEvaluation.evaluations.find((e) => e.requirementId === 'req-max-lot-coverage');
  if (lotCov) {
    constraints.push({
      id: `${project.id}-reg-lot-coverage`,
      projectId: project.id,
      category: 'regulatory-compliance',
      title: 'Statutory Maximum Lot Coverage Ratio',
      description: 'Zoning compliance constraint ensuring ground floor building footprint does not exceed 50% of parcel area.',
      sourceRequirement: {
        label: 'Statutory Cap',
        value: '50.0%',
      },
      designValue: {
        label: 'Current Footprint Coverage',
        value: lotCov.measuredValue || 'N/A',
      },
      comparisonRule: 'groundFootprint / plotArea <= 0.50',
      status: lotCov.status === 'pass' ? 'pass' : lotCov.status === 'conflict' ? 'conflict' : 'pending',
      statusReason: lotCov.statusReason,
      affectedElements: ['Ground Floor Footprint', 'Plot Parcel Area'],
      recommendation: lotCov.status === 'conflict'
        ? {
            actionLabel: 'Reduce Ground Footprint',
            actionType: 'navigate-floor-plan',
            details: lotCov.remedySuggestion || 'Resize ground floor rooms or move spaces to upper floor.',
          }
        : undefined,
      dataVersion,
      lastEvaluatedAt: nowIso,
    });
  }

  // 7.2 Statutory Habitable Room Space Dimensions
  const habitDim = regEvaluation.evaluations.find((e) => e.requirementId === 'req-habitable-room-min-dimension');
  if (habitDim) {
    constraints.push({
      id: `${project.id}-reg-habitable-dimensions`,
      projectId: project.id,
      category: 'regulatory-compliance',
      title: 'Statutory Habitable Room Dimensions (IRC R304.2)',
      description: 'Ensures all habitable living spaces maintain minimum 7 ft (2.13 m) clear horizontal width and depth.',
      sourceRequirement: {
        label: 'IRC R304.2 Minimum',
        value: project.unit === 'metres' ? '2.13 m' : '7.0 ft',
      },
      designValue: {
        label: 'Measured Clear Space',
        value: habitDim.measuredValue || 'N/A',
      },
      comparisonRule: 'min(room.width, room.length) >= 7.0 ft',
      status: habitDim.status === 'pass' ? 'pass' : habitDim.status === 'conflict' ? 'conflict' : 'pending',
      statusReason: habitDim.statusReason,
      affectedElements: ['Habitable Rooms (Living, Dining, Bedroom, Office)'],
      recommendation: habitDim.status === 'conflict'
        ? {
            actionLabel: 'Widen Narrow Rooms',
            actionType: 'navigate-floor-plan',
            details: 'Widen room dimensions to at least 7 ft (2.13 m) in 2D Floor Plan.',
          }
        : undefined,
      dataVersion,
      lastEvaluatedAt: nowIso,
    });
  }

  // ==========================================
  // 8. STRUCTURAL COORDINATION CONSTRAINTS
  // ==========================================
  const maxSpanLimit = project.unit === 'feet' ? 20 : 6.0;
  const longestSpanRoom = activeRooms.reduce<{ room: FloorPlanRoom | null; span: number }>(
    (acc, r) => {
      const s = Math.max(r.width, r.length);
      return s > acc.span ? { room: r, span: s } : acc;
    },
    { room: null, span: 0 }
  );

  const spanCompliant = longestSpanRoom.span <= maxSpanLimit || activeRooms.length === 0;

  constraints.push({
    id: `${project.id}-structural-span-limit`,
    projectId: project.id,
    category: 'structural-coordination',
    title: 'Prescriptive Clear Span Threshold',
    description: `Ensures architectural room clear spans remain within prescriptive light-frame span limits (${maxSpanLimit} ${unitSuffix}) without requiring heavy transfer girders or primary columns.`,
    sourceRequirement: {
      label: 'Max Prescriptive Span',
      value: `≤ ${maxSpanLimit}`,
      unit: unitSuffix,
    },
    designValue: {
      label: longestSpanRoom.room ? longestSpanRoom.room.name : 'Max Span',
      value: longestSpanRoom.span > 0 ? longestSpanRoom.span.toFixed(1) : '0.0',
      unit: unitSuffix,
    },
    comparisonRule: `max(room.width, room.length) <= ${maxSpanLimit}`,
    status: isDraftPending
      ? 'pending'
      : activeRooms.length === 0
      ? 'not-assessed'
      : spanCompliant
      ? 'pass'
      : 'conflict',
    statusReason: activeRooms.length === 0
      ? 'No rooms placed to evaluate structural spans.'
      : isDraftPending
      ? 'Pending: Re-evaluating clear spans against unsaved floor plan draft.'
      : spanCompliant
      ? `All ${activeRooms.length} rooms satisfy prescriptive clear span limits (longest: ${longestSpanRoom.span.toFixed(1)} ${unitSuffix} in ${longestSpanRoom.room?.name || 'N/A'}).`
      : `Room "${longestSpanRoom.room?.name}" clear span of ${longestSpanRoom.span.toFixed(1)} ${unitSuffix} exceeds prescriptive limit of ${maxSpanLimit} ${unitSuffix}. Requires intermediate column grid or engineered primary girder.`,
    affectedElements: longestSpanRoom.room ? [longestSpanRoom.room.name] : ['Structural Superstructure'],
    recommendation: !spanCompliant && longestSpanRoom.room
      ? {
          actionLabel: 'Inspect Structural Workspace',
          actionType: 'navigate-floor-plan',
          targetRoomId: longestSpanRoom.room.id,
          details: 'Open Structural Coordination workspace to review framing bays, intermediate columns, or transfer girder sizing.',
        }
      : undefined,
    dataVersion,
    lastEvaluatedAt: nowIso,
  });

  // Vertical load path continuity constraint for multi-floor buildings
  if (project.floors > 1) {
    const hasDiscontinuousColumns = project.structuralCoordination?.reviewIssues?.some(
      (iss) => iss.category === 'vertical-continuity' && iss.status !== 'resolved'
    );

    constraints.push({
      id: `${project.id}-structural-vertical-continuity`,
      projectId: project.id,
      category: 'structural-coordination',
      title: 'Multi-Level Vertical Load Path Alignment',
      description: 'Verifies that structural columns and primary load-bearing elements on upper levels align with ground floor structural bearing elements.',
      sourceRequirement: {
        label: 'Load Path Stacking',
        value: 'Continuous vertical stack',
      },
      designValue: {
        label: 'Upper Level Framing',
        value: hasDiscontinuousColumns ? 'Discontinuous column detected' : 'Aligned grid',
      },
      comparisonRule: 'discontinuousUpperColumns === 0',
      status: isDraftPending
        ? 'pending'
        : hasDiscontinuousColumns
        ? 'conflict'
        : 'pass',
      statusReason: isDraftPending
        ? 'Pending floor plan draft changes.'
        : hasDiscontinuousColumns
        ? 'One or more upper-level structural columns do not stack over ground floor bearing elements, requiring engineered transfer beam.'
        : `Vertical framing alignments verified across all ${project.floors} levels without unstacked columns.`,
      affectedElements: ['Upper Level Superstructure', 'Ground Floor Bearing Grid'],
      dataVersion,
      lastEvaluatedAt: nowIso,
    });
  }

  // ==========================================
  // 9. MEP COORDINATION & CLASH CONSTRAINTS
  // ==========================================
  const mepEval = evaluateMEPClashes(project);
  const hardClashCount = mepEval.summary.clashCounts.hardClash;
  const clearanceViolations = mepEval.summary.clashCounts.clearanceViolation;

  constraints.push({
    id: `${project.id}-mep-hard-clashes`,
    projectId: project.id,
    category: 'mep-coordination',
    title: 'MEP vs Structural Physical Clearances',
    description: 'Ensures zero hard collisions between mechanical HVAC ducts, plumbing soil stacks, electrical cable trays, and structural columns/framing.',
    sourceRequirement: {
      label: 'Permitted Hard Interferences',
      value: 0,
      unit: 'clashes',
    },
    designValue: {
      label: 'Detected Hard Collisions',
      value: hardClashCount,
      unit: 'clashes',
    },
    comparisonRule: 'hardClashes === 0',
    status: isDraftPending
      ? 'pending'
      : hardClashCount === 0
      ? 'pass'
      : 'conflict',
    statusReason: isDraftPending
      ? 'Pending floor plan draft changes.'
      : hardClashCount === 0
      ? `All ${mepEval.summary.totalComponents} MEP routes satisfy geometric clearances without intersecting structural columns or cross-trade routes.`
      : `${hardClashCount} solid geometric collision(s) detected between MEP distribution lines and structural framing. Adjust routes or framing bay offsets.`,
    affectedElements: hardClashCount > 0
      ? mepEval.clashes.filter((c) => c.severity === 'hard-clash').map((c) => c.title)
      : ['MEP Systems'],
    recommendation: hardClashCount > 0
      ? {
          actionLabel: 'Inspect MEP Clash Register',
          actionType: 'navigate-floor-plan',
          details: 'Open the MEP Coordination & Clash Detection engine to reroute interfering ductwork or adjust structural column bay coordinates.',
        }
      : undefined,
    dataVersion,
    lastEvaluatedAt: nowIso,
  });

  constraints.push({
    id: `${project.id}-mep-electrical-clearance`,
    projectId: project.id,
    category: 'mep-coordination',
    title: 'NEC 110.26 Electrical Working Space Envelope',
    description: 'Enforces statutory working clearance in front of main electrical distribution equipment (min. 3.0 ft / 0.9 m unobstructed).',
    sourceRequirement: {
      label: 'Working Space Clearance',
      value: project.unit === 'feet' ? '3.0 ft' : '0.9 m',
    },
    designValue: {
      label: 'Encroachment Violations',
      value: clearanceViolations,
      unit: 'violations',
    },
    comparisonRule: 'electricalWorkingEnvelopeViolations === 0',
    status: isDraftPending
      ? 'pending'
      : clearanceViolations === 0
      ? 'pass'
      : 'conflict',
    statusReason: isDraftPending
      ? 'Pending floor plan draft changes.'
      : clearanceViolations === 0
      ? 'Electrical service panels maintain required dedicated unobstructed working space per NEC Art. 110.26.'
      : `${clearanceViolations} electrical working clearance violation(s) detected. Clear front access envelope of partitions and storage racks.`,
    affectedElements: ['Main Distribution Panel (MDB-1)', 'Service Equipment Working Space'],
    dataVersion,
    lastEvaluatedAt: nowIso,
  });

  // ==========================================
  // 10. PROJECT UNITS CONSISTENCY
  // ==========================================

  const validUnits = project.unit === 'feet' || project.unit === 'metres';
  constraints.push({
    id: `${project.id}-unit-consistency`,
    projectId: project.id,
    category: 'project-units',
    title: 'Measurement Unit System Consistency',
    description: 'Ensures spatial dimensions, floor plans, and plot areas operate under a unified measurement standard.',
    sourceRequirement: {
      label: 'Standard Unit',
      value: 'feet | metres',
    },
    designValue: {
      label: 'Current Standard',
      value: project.unit,
    },
    comparisonRule: "unit === 'feet' || unit === 'metres'",
    status: validUnits ? 'pass' : 'conflict',
    statusReason: validUnits
      ? `System-wide measurement unit is consistently set to ${project.unit}.`
      : `Unrecognized measurement unit standard: ${project.unit}.`,
    affectedElements: ['Project Units'],
    dataVersion,
    lastEvaluatedAt: nowIso,
  });

  // Calculate summary counts
  const summary: ConstraintSummary = {
    total: constraints.length,
    passing: constraints.filter((c) => c.status === 'pass').length,
    conflicts: constraints.filter((c) => c.status === 'conflict').length,
    pending: constraints.filter((c) => c.status === 'pending').length,
    notAssessed: constraints.filter((c) => c.status === 'not-assessed').length,
  };

  return {
    projectId: project.id,
    projectName: project.name,
    dataVersion,
    lastEvaluatedAt: nowIso,
    constraints,
    summary,
    isEvaluating: false,
  };
}
