/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Project, FloorPlanRoom } from '../types/project';
import {
  StructuralCoordinationData,
  StructuralGrid,
  StructuralGridAxis,
  StructuralColumn,
  StructuralBeam,
  StructuralReviewIssue,
  StructuralCoordinationSummary,
  StructuralFramingSystem,
  StructuralIssueStatus,
} from '../types/structural';
import { computeGeometryHash } from './decisionTwinService';

export const STRUCTURAL_ENGINE_VERSION = 'v1.0.0-structural';

/**
 * Deterministically initializes structural coordination data for a project.
 * If data already exists, preserves user settings and grid alignment.
 */
export function initializeStructuralCoordination(
  project: Project
): StructuralCoordinationData {
  if (project.structuralCoordination) {
    return project.structuralCoordination;
  }

  const unit = project.unit;
  const isFeet = unit === 'feet';
  const width = Math.max(10, project.plotWidth);
  const length = Math.max(10, project.plotLength);

  // Default bay spacing: 16-20 ft or 5.0-6.0 m
  const defaultBayX = isFeet ? 16 : 5.0;
  const defaultBayY = isFeet ? 18 : 5.5;

  // Prescriptive span threshold: 20 ft or 6.0 m
  const spanThreshold = isFeet ? 20 : 6.0;

  // Determine structural framing system default based on project type
  let framingSystem: StructuralFramingSystem = 'reinforced-concrete-frame';
  if (project.projectType === 'house') {
    framingSystem = isFeet ? 'light-timber-framing' : 'reinforced-concrete-frame';
  }

  // Generate orthogonal structural grid lines
  const xAxes: StructuralGridAxis[] = [];
  const yAxes: StructuralGridAxis[] = [];

  // Starting offset from plot boundary (e.g. 5 ft or 1.5 m)
  const marginX = isFeet ? 4 : 1.2;
  const marginY = isFeet ? 4 : 1.2;

  // X axes (labeled A, B, C, D...)
  let curX = marginX;
  let xIdx = 0;
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  while (curX < width) {
    const label = alphabet[xIdx % alphabet.length] + (xIdx >= alphabet.length ? Math.floor(xIdx / alphabet.length) : '');
    xAxes.push({
      id: `grid-x-${label.toLowerCase()}`,
      name: label,
      direction: 'X',
      coordinate: Math.round(curX * 10) / 10,
      isPrimary: true,
    });
    curX += defaultBayX;
    xIdx++;
  }

  // Y axes (labeled 1, 2, 3, 4...)
  let curY = marginY;
  let yIdx = 1;
  while (curY < length) {
    yAxes.push({
      id: `grid-y-${yIdx}`,
      name: String(yIdx),
      direction: 'Y',
      coordinate: Math.round(curY * 10) / 10,
      isPrimary: true,
    });
    curY += defaultBayY;
    yIdx++;
  }

  const grid: StructuralGrid = {
    id: `grid-${project.id}`,
    xAxes,
    yAxes,
    baySpacingX: defaultBayX,
    baySpacingY: defaultBayY,
    offsetX: marginX,
    offsetY: marginY,
    showGridLines: true,
    showBubbles: true,
  };

  // Generate baseline structural columns at grid intersections overlapping active rooms
  const rooms = project.floorPlan?.rooms || [];
  const columns: StructuralColumn[] = [];
  const currentSystem = framingSystem as StructuralFramingSystem;
  const colMaterial: StructuralColumn['material'] =
    currentSystem === 'light-timber-framing' || currentSystem === 'mass-timber-post-beam'
      ? 'mass-timber'
      : currentSystem === 'structural-steel-frame'
      ? 'structural-steel'
      : 'reinforced-concrete';
  const colSize = isFeet ? 1.0 : 0.3; // 1 ft or 300 mm standard column

  let colCounter = 1;
  for (const xAxis of xAxes) {
    for (const yAxis of yAxes) {
      // Check if this intersection is within 5 units of any room
      const nearRoom = rooms.some((r) => {
        return (
          xAxis.coordinate >= r.x - 2 &&
          xAxis.coordinate <= r.x + r.width + 2 &&
          yAxis.coordinate >= r.y - 2 &&
          yAxis.coordinate <= r.y + r.length + 2
        );
      });

      if (nearRoom || rooms.length === 0) {
        columns.push({
          id: `col-${xAxis.name}${yAxis.name}`,
          label: `C-${xAxis.name}${yAxis.name}`,
          x: xAxis.coordinate,
          y: yAxis.coordinate,
          floorLevels: Array.from({ length: Math.max(1, project.floors) }, (_, i) => i + 1),
          profile: 'rectangular',
          width: colSize,
          depth: colSize,
          material: colMaterial,
          isLoadBearing: true,
          status: 'active',
          notes: `Structural column aligned to Grid ${xAxis.name}-${yAxis.name}`,
        });
        colCounter++;
        if (colCounter > 24) break; // Keep initial grid reasonably bounded
      }
    }
  }

  // Generate primary connecting beams between adjacent columns on grid lines
  const beams: StructuralBeam[] = [];
  // Connect adjacent columns along X and Y axes
  for (let i = 0; i < columns.length; i++) {
    for (let j = i + 1; j < columns.length; j++) {
      const c1 = columns[i];
      const c2 = columns[j];
      const sameX = Math.abs(c1.x - c2.x) < 0.1;
      const sameY = Math.abs(c1.y - c2.y) < 0.1;

      // Connect if aligned on same axis and distance matches typical bay
      if ((sameX && Math.abs(c1.y - c2.y) <= defaultBayY * 1.2) ||
          (sameY && Math.abs(c1.x - c2.x) <= defaultBayX * 1.2)) {
        beams.push({
          id: `bm-${c1.id}-${c2.id}`,
          label: `B-${c1.label.replace('C-', '')}/${c2.label.replace('C-', '')}`,
          startX: c1.x,
          startY: c1.y,
          endX: c2.x,
          endY: c2.y,
          floorLevel: 1,
          profileWidth: isFeet ? 0.8 : 0.25,
          profileDepth: isFeet ? 1.5 : 0.45,
          material: colMaterial,
          beamType: 'primary-girder',
        });
      }
    }
  }

  const nowIso = new Date().toISOString();
  const geomHash = computeGeometryHash(rooms, project.plotWidth, project.plotLength, project.unit);

  return {
    version: STRUCTURAL_ENGINE_VERSION,
    framingSystem,
    grid,
    columns,
    beams,
    reviewIssues: [],
    maxUnsupportedSpanThreshold: spanThreshold,
    lastEvaluatedGeometryHash: geomHash,
    lastEvaluatedAt: nowIso,
    isStale: false,
    notes: 'Preliminary structural coordination reference model.',
    engineeringSignOff: {
      isSignedOff: false,
    },
  };
}

/**
 * Deterministic evaluation engine for architectural-to-structural coordination.
 * Evaluates clear spans, column-to-wall alignments, vertical load path continuity,
 * cantilever projections, and generates a structured engineering review register.
 */
export function evaluateStructuralCoordination(
  project: Project,
  dataOverride?: StructuralCoordinationData,
  draftRooms?: FloorPlanRoom[]
): {
  issues: StructuralReviewIssue[];
  summary: StructuralCoordinationSummary;
  isStale: boolean;
  dataVersion: string;
} {
  const data = dataOverride || initializeStructuralCoordination(project);
  const activeRooms = draftRooms || project.floorPlan?.rooms || [];
  const currentGeomHash = computeGeometryHash(
    activeRooms,
    project.plotWidth,
    project.plotLength,
    project.unit
  );

  const isStale = Boolean(
    data.lastEvaluatedGeometryHash &&
    data.lastEvaluatedGeometryHash !== currentGeomHash
  );

  const unitSuffix = project.unit === 'feet' ? 'ft' : 'm';
  const unitAreaSuffix = project.unit === 'feet' ? 'sq ft' : 'm²';
  const nowIso = new Date().toISOString();
  const dataVersion = `${project.id}-v${project.updatedAt || '0'}-${currentGeomHash}`;

  const generatedIssues: StructuralReviewIssue[] = [];
  const existingIssuesMap = new Map<string, StructuralReviewIssue>();
  (data.reviewIssues || []).forEach((iss) => existingIssuesMap.set(iss.id, iss));

  let maxMeasuredSpan = 0;
  let maxSpanRoomName = 'None';
  let evaluatedSpansCount = 0;

  // =========================================================================
  // 1. CLEAR SPAN & DEFLECTION THRESHOLD CHECK
  // =========================================================================
  activeRooms.forEach((room) => {
    evaluatedSpansCount++;
    const spanW = Math.max(0, room.width);
    const spanL = Math.max(0, room.length);
    const maxRoomSpan = Math.max(spanW, spanL);

    if (maxRoomSpan > maxMeasuredSpan) {
      maxMeasuredSpan = maxRoomSpan;
      maxSpanRoomName = room.name;
    }

    const threshold = data.maxUnsupportedSpanThreshold;

    if (maxRoomSpan > threshold) {
      const issueId = `iss-span-${room.id}`;
      const existing = existingIssuesMap.get(issueId);
      const isExtreme = maxRoomSpan > threshold * 1.35; // e.g. >27 ft
      const severity = isExtreme ? 'review-required' : 'coordination-concern';

      generatedIssues.push({
        id: issueId,
        issueCode: `STR-SPN-${room.floorLevel}-${room.id.slice(-4).toUpperCase()}`,
        title: `Clear Span Exceeds Prescriptive Limit (${room.name})`,
        description: `Room clear span of ${maxRoomSpan.toFixed(1)} ${unitSuffix} exceeds maximum unsupported span threshold of ${threshold} ${unitSuffix}. May result in excessive deflection or deep floor joist requirements.`,
        location: {
          floorLevel: room.floorLevel,
          x: room.x + room.width / 2,
          y: room.y + room.length / 2,
          roomName: room.name,
        },
        severity,
        category: 'span-exceeded',
        affectedElements: [room.name, `Floor ${room.floorLevel} Superstructure`],
        evidenceFormula: `Span = max(width: ${room.width}, length: ${room.length}) = ${maxRoomSpan.toFixed(1)} ${unitSuffix} > ${threshold} ${unitSuffix}`,
        measuredValue: `${maxRoomSpan.toFixed(1)} ${unitSuffix}`,
        thresholdLimit: `${threshold} ${unitSuffix}`,
        status: existing?.status || 'open',
        recommendation: `Introduce intermediate column along structural grid or specify engineered primary transfer girder/steel beam. Mandate licensed structural engineer span sizing.`,
        reviewerNotes: existing?.reviewerNotes,
        reviewedBy: existing?.reviewedBy,
        reviewedAt: existing?.reviewedAt,
        varianceJustification: existing?.varianceJustification,
      });
    }
  });

  // =========================================================================
  // 2. COLUMN INTERACTION WITH ROOM BOUNDARIES & CIRCULATION
  // =========================================================================
  const columns = data.columns || [];

  columns.forEach((col) => {
    const colFloors = Array.isArray(col.floorLevels)
      ? col.floorLevels
      : [(col as any).floorLevel || 1];
    colFloors.forEach((floor) => {
      const roomsOnFloor = activeRooms.filter((r) => r.floorLevel === floor);

      roomsOnFloor.forEach((room) => {
        const inX = col.x >= room.x && col.x <= room.x + room.width;
        const inY = col.y >= room.y && col.y <= room.y + room.length;

        if (inX && inY) {
          // Check distance to all 4 walls of the room
          const distToLeft = Math.abs(col.x - room.x);
          const distToRight = Math.abs(room.x + room.width - col.x);
          const distToTop = Math.abs(col.y - room.y);
          const distToBottom = Math.abs(room.y + room.length - col.y);

          const minWallDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);
          const clearanceThreshold = project.unit === 'feet' ? 2.0 : 0.6; // 2 ft or 600 mm away from edge is "in the room"

          if (minWallDist > clearanceThreshold) {
            const issueId = `iss-col-protrude-${col.id}-${room.id}`;
            const existing = existingIssuesMap.get(issueId);

            generatedIssues.push({
              id: issueId,
              issueCode: `STR-CLU-${col.label.replace('C-', '')}`,
              title: `Freestanding Column in Clear Usable Space (${col.label} in ${room.name})`,
              description: `Column ${col.label} is located ${minWallDist.toFixed(1)} ${unitSuffix} away from perimeter partitions inside ${room.name}. Creates architectural circulation obstruction.`,
              location: {
                floorLevel: floor,
                x: col.x,
                y: col.y,
                roomName: room.name,
              },
              severity: 'coordination-concern',
              category: 'wall-alignment',
              affectedElements: [col.label, room.name],
              evidenceFormula: `min(distToWalls) = ${minWallDist.toFixed(1)} ${unitSuffix} > ${clearanceThreshold} ${unitSuffix}`,
              measuredValue: `${minWallDist.toFixed(1)} ${unitSuffix} from nearest wall`,
              thresholdLimit: `≤ ${clearanceThreshold} ${unitSuffix} (flush in wall)`,
              status: existing?.status || 'open',
              recommendation: `Align column ${col.label} with partition wall centerline or integrate into millwork/architectural feature column casing.`,
              reviewerNotes: existing?.reviewerNotes,
              reviewedBy: existing?.reviewedBy,
              reviewedAt: existing?.reviewedAt,
              varianceJustification: existing?.varianceJustification,
            });
          }
        }
      });
    });
  });

  // =========================================================================
  // 3. MULTI-LEVEL VERTICAL LOAD PATH CONTINUITY
  // =========================================================================
  if (project.floors > 1) {
    const floor1Rooms = activeRooms.filter((r) => r.floorLevel === 1);
    const upperColumns = columns.filter((c) => c.floorLevels.some((fl) => fl > 1));

    upperColumns.forEach((uCol) => {
      // Check if lower floor has matching column or bearing wall
      const lowerCol = columns.find(
        (lc) =>
          lc.id !== uCol.id &&
          lc.floorLevels.includes(1) &&
          Math.abs(lc.x - uCol.x) < 0.5 &&
          Math.abs(lc.y - uCol.y) < 0.5
      );

      const hasDirectColumn = Boolean(lowerCol);
      // Or check if column on floor 1 sits in same structural column record with [1, 2]
      const sharesRecord = uCol.floorLevels.includes(1);

      if (!hasDirectColumn && !sharesRecord) {
        // Upper floor column does not continue to ground
        // Check if there is an underlying wall beneath it on Floor 1
        const sitsOnGroundWall = floor1Rooms.some((r) => {
          const onWallX = Math.abs(uCol.x - r.x) < 0.5 || Math.abs(uCol.x - (r.x + r.width)) < 0.5;
          const onWallY = Math.abs(uCol.y - r.y) < 0.5 || Math.abs(uCol.y - (r.y + r.length)) < 0.5;
          const withinBounds = uCol.x >= r.x - 0.5 && uCol.x <= r.x + r.width + 0.5 &&
                               uCol.y >= r.y - 0.5 && uCol.y <= r.y + r.length + 0.5;
          return withinBounds && (onWallX || onWallY);
        });

        if (!sitsOnGroundWall) {
          const issueId = `iss-vert-discont-${uCol.id}`;
          const existing = existingIssuesMap.get(issueId);

          generatedIssues.push({
            id: issueId,
            issueCode: `STR-VRT-${uCol.label.replace('C-', '')}`,
            title: `Discontinuous Vertical Load Path (${uCol.label} on Upper Floor)`,
            description: `Upper level column ${uCol.label} does not align with a lower level column or load-bearing wall beneath. Creates a concentrated point load requiring heavy transfer beam.`,
            location: {
              floorLevel: Math.max(...uCol.floorLevels),
              x: uCol.x,
              y: uCol.y,
            },
            severity: 'conflict',
            category: 'vertical-continuity',
            affectedElements: [uCol.label, 'Ground Floor Structure'],
            evidenceFormula: `Vertical alignment delta: No column within 0.5 ${unitSuffix} tolerance on Floor 1`,
            measuredValue: `Unstacked upper column at (${uCol.x}, ${uCol.y})`,
            thresholdLimit: `Colinear vertical stack ≤ 0.2 ${unitSuffix}`,
            status: existing?.status || 'open',
            recommendation: `Align upper column with ground floor structural grid axis or provide engineered transfer girder designed by licensed structural engineer.`,
            reviewerNotes: existing?.reviewerNotes,
            reviewedBy: existing?.reviewedBy,
            reviewedAt: existing?.reviewedAt,
            varianceJustification: existing?.varianceJustification,
          });
        }
      }
    });
  }

  // =========================================================================
  // 4. CANTILEVER & BALCONY SUPPORT CHECK
  // =========================================================================
  const balconies = activeRooms.filter((r) => r.type === 'balcony');
  balconies.forEach((balcony) => {
    const balcSpan = Math.max(balcony.width, balcony.length);
    const maxPrescriptiveCantilever = project.unit === 'feet' ? 6.0 : 1.8;

    if (balcSpan > maxPrescriptiveCantilever) {
      const issueId = `iss-balc-cantilever-${balcony.id}`;
      const existing = existingIssuesMap.get(issueId);

      generatedIssues.push({
        id: issueId,
        issueCode: `STR-CAN-${balcony.id.slice(-4).toUpperCase()}`,
        title: `Deep Cantilever Projection (${balcony.name})`,
        description: `Balcony projection dimension of ${balcSpan.toFixed(1)} ${unitSuffix} exceeds standard prescriptive residential cantilever allowance (${maxPrescriptiveCantilever} ${unitSuffix}).`,
        location: {
          floorLevel: balcony.floorLevel,
          x: balcony.x,
          y: balcony.y,
          roomName: balcony.name,
        },
        severity: 'review-required',
        category: 'cantilever-unsupported',
        affectedElements: [balcony.name, 'Balcony Floor Slab'],
        evidenceFormula: `Cantilever span ${balcSpan.toFixed(1)} ${unitSuffix} > ${maxPrescriptiveCantilever} ${unitSuffix}`,
        measuredValue: `${balcSpan.toFixed(1)} ${unitSuffix}`,
        thresholdLimit: `${maxPrescriptiveCantilever} ${unitSuffix}`,
        status: existing?.status || 'open',
        recommendation: `Provide supporting ground columns, angled structural brackets, or submit licensed structural engineer back-span tie-down calculations.`,
        reviewerNotes: existing?.reviewerNotes,
        reviewedBy: existing?.reviewedBy,
        reviewedAt: existing?.reviewedAt,
        varianceJustification: existing?.varianceJustification,
      });
    }
  });

  // =========================================================================
  // 5. STATUTORY ENGINEERING PROVISION (IBC / IRC MANDATE)
  // =========================================================================
  const requiresSpecialReview =
    project.floors > 2 ||
    maxMeasuredSpan > 20 ||
    project.projectType === 'other';

  const statIssueId = `iss-statutory-review-${project.id}`;
  const existingStat = existingIssuesMap.get(statIssueId);

  generatedIssues.push({
    id: statIssueId,
    issueCode: 'STR-ENG-001',
    title: requiresSpecialReview
      ? 'Mandatory Professional Structural Engineering (PE/SE) Seal'
      : 'Prescriptive Light-Frame Structural Threshold Review',
    description: requiresSpecialReview
      ? `Project parameters (Floors: ${project.floors}, Max Clear Span: ${maxMeasuredSpan.toFixed(1)} ${unitSuffix}) trigger statutory municipal requirements for sealed structural calculations by a licensed Professional Engineer (PE/SE).`
      : `Standard prescriptive residential light-frame span limits apply. Professional engineering review recommended prior to permit filing.`,
    location: {
      floorLevel: 1,
      x: project.plotWidth / 2,
      y: project.plotLength / 2,
    },
    severity: requiresSpecialReview ? 'review-required' : 'info',
    category: 'statutory-engineering',
    affectedElements: ['Full Superstructure', 'Foundation Design'],
    evidenceFormula: `IBC Ch. 16 / IRC R301: Spans > 20ft or Floors > 2 mandate engineered design`,
    measuredValue: `Floors: ${project.floors}, Max Span: ${maxMeasuredSpan.toFixed(1)} ${unitSuffix}`,
    thresholdLimit: `Prescriptive Span ≤ 20.0 ${unitSuffix}, Floors ≤ 2`,
    status: existingStat?.status || 'open',
    recommendation: `Engage a licensed Professional Structural Engineer (PE/SE) to produce sealed framing plans, foundation slab schedules, and seismic/lateral wind shear load diagrams.`,
    reviewerNotes: existingStat?.reviewerNotes,
    reviewedBy: existingStat?.reviewedBy,
    reviewedAt: existingStat?.reviewedAt,
    varianceJustification: existingStat?.varianceJustification,
  });

  // Reconcile with any manually added issues in data.reviewIssues that are not auto-generated
  (data.reviewIssues || []).forEach((customIss) => {
    if (!generatedIssues.some((g) => g.id === customIss.id)) {
      generatedIssues.push(customIss);
    }
  });

  // Calculate issue counts
  const issueCounts = {
    total: generatedIssues.length,
    conflict: generatedIssues.filter((i) => i.severity === 'conflict' && i.status !== 'resolved').length,
    coordinationConcern: generatedIssues.filter((i) => i.severity === 'coordination-concern' && i.status !== 'resolved').length,
    reviewRequired: generatedIssues.filter((i) => i.severity === 'review-required' && i.status !== 'resolved').length,
    info: generatedIssues.filter((i) => i.severity === 'info').length,
    resolved: generatedIssues.filter((i) => i.status === 'resolved').length,
  };

  const summary: StructuralCoordinationSummary = {
    totalColumns: columns.length,
    totalBeams: (data.beams || []).length,
    gridAxesCount: (data.grid?.xAxes?.length || 0) + (data.grid?.yAxes?.length || 0),
    evaluatedSpansCount,
    maxMeasuredSpan,
    maxSpanRoomName,
    issueCounts,
    hasCriticalConflicts: issueCounts.conflict > 0,
    requiresLicensedReview: issueCounts.reviewRequired > 0 || requiresSpecialReview,
    lastEvaluatedAt: nowIso,
    dataVersion,
  };

  return {
    issues: generatedIssues,
    summary,
    isStale,
    dataVersion,
  };
}

/**
 * Updates an issue status or reviewer note in the structural coordination data.
 */
export function updateStructuralIssue(
  data: StructuralCoordinationData,
  issueId: string,
  updates: Partial<StructuralReviewIssue>
): StructuralCoordinationData {
  const currentIssues = [...(data.reviewIssues || [])];
  const idx = currentIssues.findIndex((i) => i.id === issueId);

  if (idx >= 0) {
    currentIssues[idx] = {
      ...currentIssues[idx],
      ...updates,
      reviewedAt: new Date().toISOString(),
    };
  } else {
    // If not found in existing, we add it with the updates
    currentIssues.push({
      id: issueId,
      issueCode: updates.issueCode || 'STR-REV',
      title: updates.title || 'Structural Review Item',
      description: updates.description || '',
      location: updates.location || { floorLevel: 1, x: 0, y: 0 },
      severity: updates.severity || 'review-required',
      category: updates.category || 'statutory-engineering',
      affectedElements: updates.affectedElements || [],
      evidenceFormula: updates.evidenceFormula || 'Manual Review Entry',
      measuredValue: updates.measuredValue || 'N/A',
      thresholdLimit: updates.thresholdLimit || 'N/A',
      status: updates.status || 'open',
      recommendation: updates.recommendation || '',
      ...updates,
      reviewedAt: new Date().toISOString(),
    });
  }

  return {
    ...data,
    reviewIssues: currentIssues,
    lastEvaluatedAt: new Date().toISOString(),
  };
}

/**
 * Adds or updates a structural column.
 */
export function saveStructuralColumn(
  data: StructuralCoordinationData,
  column: StructuralColumn
): StructuralCoordinationData {
  const columns = [...data.columns];
  const idx = columns.findIndex((c) => c.id === column.id);

  if (idx >= 0) {
    columns[idx] = column;
  } else {
    columns.push(column);
  }

  return {
    ...data,
    columns,
    lastEvaluatedAt: new Date().toISOString(),
  };
}

/**
 * Removes a structural column by ID.
 */
export function deleteStructuralColumn(
  data: StructuralCoordinationData,
  columnId: string
): StructuralCoordinationData {
  return {
    ...data,
    columns: data.columns.filter((c) => c.id !== columnId),
    beams: data.beams.filter((b) => !b.id.includes(columnId)),
    lastEvaluatedAt: new Date().toISOString(),
  };
}

/**
 * Generates an RFC 4180 standards-compliant CSV of structural issues and columns.
 */
export function generateStructuralSummaryCSV(
  project: Project,
  data: StructuralCoordinationData
): string {
  const { issues, summary } = evaluateStructuralCoordination(project, data);
  const rows: string[][] = [];

  // Header metadata
  rows.push(['# PLOTIFY STRUCTURAL COORDINATION & ENGINEERING REVIEW REGISTER']);
  rows.push(['Project Name', project.name]);
  rows.push(['Project ID', project.id]);
  rows.push(['Framing System', data.framingSystem]);
  rows.push(['Unit', project.unit]);
  rows.push(['Total Columns', String(summary.totalColumns)]);
  rows.push(['Max Measured Span', `${summary.maxMeasuredSpan.toFixed(1)} ${project.unit}`]);
  rows.push(['Open Conflicts', String(summary.issueCounts.conflict)]);
  rows.push(['Engineering Review Required', String(summary.issueCounts.reviewRequired)]);
  rows.push(['Licensed Sign-Off Status', data.engineeringSignOff?.isSignedOff ? 'Signed Off' : 'Pending Engineer Stamp']);
  rows.push([]);

  // Section 1: Structural Review Issues
  rows.push([
    'Issue Code',
    'Severity',
    'Category',
    'Title',
    'Floor Level',
    'Location (X,Y)',
    'Room / Ref',
    'Measured Value',
    'Threshold Limit',
    'Status',
    'Recommendation',
    'Reviewer Notes',
    'Reviewed By',
    'Reviewed At',
  ]);

  issues.forEach((iss) => {
    rows.push([
      iss.issueCode,
      iss.severity.toUpperCase(),
      iss.category,
      iss.title,
      String(iss.location.floorLevel),
      `(${iss.location.x.toFixed(1)}, ${iss.location.y.toFixed(1)})`,
      iss.location.roomName || iss.location.gridRef || 'Enclosure',
      iss.measuredValue,
      iss.thresholdLimit,
      iss.status.toUpperCase(),
      iss.recommendation,
      iss.reviewerNotes || '',
      iss.reviewedBy || '',
      iss.reviewedAt || '',
    ]);
  });

  rows.push([]);

  // Section 2: Structural Column Schedule
  rows.push(['# STRUCTURAL COLUMN INVENTORY']);
  rows.push([
    'Column ID',
    'Label',
    'Coordinate X',
    'Coordinate Y',
    'Floors Active',
    'Profile',
    'Width',
    'Depth',
    'Material',
    'Load Bearing',
    'Status',
  ]);

  data.columns.forEach((c) => {
    rows.push([
      c.id,
      c.label,
      c.x.toFixed(1),
      c.y.toFixed(1),
      c.floorLevels.join(';'),
      c.profile,
      `${c.width} ${project.unit}`,
      `${c.depth} ${project.unit}`,
      c.material,
      c.isLoadBearing ? 'YES' : 'NO',
      c.status,
    ]);
  });

  return rows
    .map((r) =>
      r
        .map((cell) => {
          const str = String(cell ?? '');
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(',')
    )
    .join('\n');
}

/**
 * Generates Markdown Architectural Dossier section for Structural Coordination.
 */
export function generateStructuralReportMarkdown(
  project: Project,
  data: StructuralCoordinationData
): string {
  const { issues, summary } = evaluateStructuralCoordination(project, data);
  const unit = project.unit;
  const unitSuffix = unit === 'feet' ? 'ft' : 'm';
  const lines: string[] = [];

  lines.push(`# Section: Structural Coordination & Engineering Review`);
  lines.push(`**Project:** ${project.name} (${project.id})`);
  lines.push(`**Framing System:** ${data.framingSystem.replace(/-/g, ' ').toUpperCase()}`);
  lines.push(`**Prescriptive Span Threshold:** ${data.maxUnsupportedSpanThreshold} ${unitSuffix}`);
  lines.push(`**Evaluation Date:** ${new Date().toLocaleDateString()} | **Engine Version:** ${STRUCTURAL_ENGINE_VERSION}`);
  lines.push('');

  lines.push(`> **ENGINEERING BOUNDARY & STATUTORY DISCLAIMER:**`);
  lines.push(`> This Structural Coordination & Engineering Review Workspace evaluates **preliminary architectural geometry, structural grid alignment, clear spans, and column-to-space clearances only**.`);
  lines.push(`> Plotify **DOES NOT** compute gravity or lateral structural loads, wind shear distributions, seismic drift, beam bending moments, rebar schedules, or foundation bearing capacities.`);
  lines.push(`> This report **DOES NOT** constitute an autonomous professional engineering certification or statutory building permit set.`);
  lines.push(`> All spans, framing systems, and foundations must be verified and stamped by a licensed Professional Structural Engineer (PE/SE) in the governing jurisdiction.`);
  lines.push('');

  lines.push(`## 1. Structural Coordination Executive Metrics`);
  lines.push(`- **Total Columns Declared:** ${summary.totalColumns}`);
  lines.push(`- **Structural Grid Bays:** ${data.grid.xAxes.length} X-Axes × ${data.grid.yAxes.length} Y-Axes`);
  lines.push(`- **Evaluated Architectural Spans:** ${summary.evaluatedSpansCount} rooms`);
  lines.push(`- **Maximum Measured Clear Span:** ${summary.maxMeasuredSpan.toFixed(1)} ${unitSuffix} (${summary.maxSpanRoomName})`);
  lines.push(`- **Measurable Geometric Conflicts:** ${summary.issueCounts.conflict}`);
  lines.push(`- **Spatial Coordination Concerns:** ${summary.issueCounts.coordinationConcern}`);
  lines.push(`- **Items Requiring PE/SE Engineering Review:** ${summary.issueCounts.reviewRequired}`);
  lines.push('');

  lines.push(`## 2. Engineering Review Register`);
  if (issues.length === 0) {
    lines.push(`*All evaluated rooms and structural reference elements satisfy preliminary geometric coordination limits.*`);
  } else {
    lines.push(`| Issue Code | Severity | Location | Title | Measured vs Limit | Status | Recommendation |`);
    lines.push(`| :--- | :--- | :--- | :--- | :--- | :--- | :--- |`);
    issues.forEach((iss) => {
      const loc = iss.location.roomName
        ? `${iss.location.roomName} (F${iss.location.floorLevel})`
        : `Floor ${iss.location.floorLevel} (${iss.location.x.toFixed(1)}, ${iss.location.y.toFixed(1)})`;
      lines.push(
        `| \`${iss.issueCode}\` | **${iss.severity.toUpperCase()}** | ${loc} | ${iss.title} | ${iss.measuredValue} / ${iss.thresholdLimit} | \`${iss.status}\` | ${iss.recommendation} |`
      );
    });
  }
  lines.push('');

  lines.push(`## 3. Structural Column Inventory`);
  lines.push(`| Label | Profile | Coordinates | Levels | Material | Load Bearing | Notes |`);
  lines.push(`| :--- | :--- | :--- | :--- | :--- | :--- | :--- |`);
  data.columns.forEach((c) => {
    lines.push(
      `| **${c.label}** | ${c.profile} (${c.width}×${c.depth} ${unitSuffix}) | (${c.x.toFixed(1)}, ${c.y.toFixed(1)}) | ${c.floorLevels.join(', ')} | ${c.material} | ${c.isLoadBearing ? 'Yes' : 'No'} | ${c.notes || '-'} |`
    );
  });
  lines.push('');

  lines.push(`## 4. Professional Review Sign-Off Block`);
  lines.push(`- **Engineer Status:** ${data.engineeringSignOff?.isSignedOff ? 'SIGNED & SEATED' : 'PENDING PROFESSIONAL ENGINEER REVIEW'}`);
  if (data.engineeringSignOff?.isSignedOff) {
    lines.push(`- **Reviewer Name:** ${data.engineeringSignOff.engineerName || 'N/A'}`);
    lines.push(`- **License Number:** ${data.engineeringSignOff.licenseNumber || 'N/A'}`);
    lines.push(`- **Jurisdiction:** ${data.engineeringSignOff.jurisdiction || 'N/A'}`);
    lines.push(`- **Signed Timestamp:** ${data.engineeringSignOff.signedAt || 'N/A'}`);
    lines.push(`- **Stamp Notes:** ${data.engineeringSignOff.stampNotes || 'None'}`);
  }

  return lines.join('\n');
}
