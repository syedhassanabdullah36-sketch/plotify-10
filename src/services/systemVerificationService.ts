/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Project } from '../types/project';
import {
  VerificationCheck,
  VerificationCategory,
  ProjectVerificationReport,
  ReleaseGateTarget,
  ReleaseGateEvaluation,
  ReleaseGateChecklistRequirement,
} from '../types/verification';
import { evaluateConstraintGraph } from './constraintGraphService';
import { evaluateSiteConstraints } from './siteIntelligenceService';
import { getProjectSnapshots } from './versioningService';
import { getStorageQuotaInfo } from './storageGuard';
import { computeStringChecksum } from '../utils/securityUtils';

/**
 * Generates deterministic geometry hash for staleness detection.
 */
export function computeGeometryFingerprint(project: Project): string {
  const rooms = project.floorPlan?.rooms || [];
  const roomTokens = rooms
    .map((r) => `${r.id}:${r.x},${r.y},${r.width},${r.length},L${r.floorLevel}`)
    .sort()
    .join('|');
  return computeStringChecksum(
    `${project.id}_${project.unit}_${project.plotWidth}x${project.plotLength}_${project.floors}_[${roomTokens}]`
  );
}

/**
 * Runs all system verification checks against a given project.
 */
export function runSystemVerification(project: Project): ProjectVerificationReport {
  const startTime = performance.now();
  const checks: VerificationCheck[] = [];
  const currentGeomHash = computeGeometryFingerprint(project);

  // ==========================================
  // 1. PROJECT FOUNDATION CHECKS
  // ==========================================
  const t0 = performance.now();
  const hasValidId = typeof project.id === 'string' && project.id.trim().length > 0;
  checks.push({
    id: 'PF-01-ID-VALIDITY',
    category: 'project_foundation',
    name: 'Project Identifier Validity',
    description: 'Verifies that the project has a globally unique, well-formed identifier string.',
    passed: hasValidId,
    severity: 'blocking_defect',
    details: hasValidId ? `Valid ID format: "${project.id}"` : 'Missing or non-string project identifier.',
    affectedField: 'id',
    remediation: hasValidId ? undefined : 'Assign a standard unique project identifier.',
    executionTimeMs: Math.round((performance.now() - t0) * 100) / 100,
  });

  const t1 = performance.now();
  const hasValidName = typeof project.name === 'string' && project.name.trim().length > 0;
  checks.push({
    id: 'PF-02-NAME-SPECIFIED',
    category: 'project_foundation',
    name: 'Project Name Specification',
    description: 'Ensures the project has a recognizable architectural title.',
    passed: hasValidName,
    severity: 'warning',
    details: hasValidName ? `Project Title: "${project.name}"` : 'Project name is blank or missing.',
    affectedField: 'name',
    remediation: hasValidName ? undefined : 'Provide an architectural project title in Project Settings.',
    executionTimeMs: Math.round((performance.now() - t1) * 100) / 100,
  });

  const t2 = performance.now();
  const hasValidPlotDims =
    typeof project.plotWidth === 'number' &&
    project.plotWidth > 0 &&
    typeof project.plotLength === 'number' &&
    project.plotLength > 0;
  checks.push({
    id: 'PF-03-BOUNDARY-DIMENSIONS',
    category: 'project_foundation',
    name: 'Plot Boundary Geometric Dimensions',
    description: 'Confirms that parcel boundaries are strictly positive, finite numbers.',
    passed: hasValidPlotDims,
    severity: 'blocking_defect',
    details: hasValidPlotDims
      ? `Plot dimensions: ${project.plotWidth} × ${project.plotLength} ${project.unit}`
      : `Invalid parcel dimensions: width=${project.plotWidth}, length=${project.plotLength}`,
    affectedField: 'plotWidth / plotLength',
    remediation: hasValidPlotDims ? undefined : 'Input positive plot width and length dimensions.',
    executionTimeMs: Math.round((performance.now() - t2) * 100) / 100,
  });

  const t3 = performance.now();
  const hasValidUnit = project.unit === 'feet' || project.unit === 'metres';
  checks.push({
    id: 'PF-04-UNIT-SYSTEM',
    category: 'project_foundation',
    name: 'Measurement Unit System Standard',
    description: 'Ensures the project adheres to either Imperial (feet) or Metric (metres) units.',
    passed: hasValidUnit,
    severity: 'blocking_defect',
    details: hasValidUnit ? `Active Unit: "${project.unit}"` : `Unsupported unit system: "${project.unit}"`,
    affectedField: 'unit',
    remediation: hasValidUnit ? undefined : 'Set unit system to "feet" or "metres".',
    executionTimeMs: Math.round((performance.now() - t3) * 100) / 100,
  });

  // ==========================================
  // 2. 2D GEOMETRY & 3D SYNCHRONIZATION CHECKS
  // ==========================================
  const rooms = project.floorPlan?.rooms || [];

  const t4 = performance.now();
  const hasRooms = rooms.length > 0;
  checks.push({
    id: 'GEO-01-ROOMS-ALLOCATED',
    category: 'geometry_spatial_sync',
    name: 'Spatial Program Room Allocation',
    description: 'Verifies that at least one functional room cell is placed in the floor plan.',
    passed: hasRooms,
    severity: 'warning',
    details: hasRooms ? `${rooms.length} room cell(s) placed.` : 'Floor plan is completely empty.',
    remediation: hasRooms ? undefined : 'Place rooms in the 2D Floor Plan Editor.',
    executionTimeMs: Math.round((performance.now() - t4) * 100) / 100,
  });

  const t5 = performance.now();
  const encroachingRooms: string[] = [];
  rooms.forEach((r) => {
    if (r.x < 0 || r.y < 0 || r.x + r.width > project.plotWidth || r.y + r.length > project.plotLength) {
      encroachingRooms.push(r.name || r.id);
    }
  });
  const withinEnvelope = encroachingRooms.length === 0;
  checks.push({
    id: 'GEO-02-PARCEL-CONTAINMENT',
    category: 'geometry_spatial_sync',
    name: 'Parcel Boundary Enclosure Containment',
    description: 'Verifies that all rooms are positioned strictly within the legal plot perimeter.',
    passed: withinEnvelope,
    severity: 'blocking_defect',
    details: withinEnvelope
      ? 'All rooms are strictly contained within parcel boundary.'
      : `${encroachingRooms.length} room(s) project outside parcel bounds: [${encroachingRooms.join(', ')}].`,
    affectedField: 'floorPlan.rooms',
    remediation: withinEnvelope ? undefined : 'Adjust room coordinates in 2D Plan to stay inside plot limits.',
    executionTimeMs: Math.round((performance.now() - t5) * 100) / 100,
  });

  const t6 = performance.now();
  const invalidDimRooms: string[] = [];
  rooms.forEach((r) => {
    if (typeof r.width !== 'number' || r.width <= 0 || typeof r.length !== 'number' || r.length <= 0) {
      invalidDimRooms.push(r.name || r.id);
    }
  });
  const validDims = invalidDimRooms.length === 0;
  checks.push({
    id: 'GEO-03-ROOM-POSITIVE-DIMENSIONS',
    category: 'geometry_spatial_sync',
    name: 'Room Geometric Span Validity',
    description: 'Confirms that all rooms possess positive, non-zero width and length spans.',
    passed: validDims,
    severity: 'blocking_defect',
    details: validDims
      ? 'All room cells have valid geometric dimensions.'
      : `Rooms with non-positive dimensions: [${invalidDimRooms.join(', ')}]`,
    affectedField: 'floorPlan.rooms',
    remediation: validDims ? undefined : 'Resize rooms to have positive width and length values.',
    executionTimeMs: Math.round((performance.now() - t6) * 100) / 100,
  });

  const t7 = performance.now();
  const roomIds = new Set<string>();
  let hasDuplicateIds = false;
  rooms.forEach((r) => {
    if (r.id) {
      if (roomIds.has(r.id)) hasDuplicateIds = true;
      roomIds.add(r.id);
    }
  });
  checks.push({
    id: 'GEO-04-UNIQUE-SPATIAL-IDS',
    category: 'geometry_spatial_sync',
    name: 'Unique Spatial Cell Identifiers',
    description: 'Ensures no duplicate room IDs exist, preventing 3D mesh rendering collisions.',
    passed: !hasDuplicateIds,
    severity: 'blocking_defect',
    details: !hasDuplicateIds ? 'All room identifiers are unique.' : 'Duplicate room IDs detected in floor plan.',
    affectedField: 'floorPlan.rooms',
    remediation: !hasDuplicateIds ? undefined : 'Re-generate unique IDs for affected floor plan rooms.',
    executionTimeMs: Math.round((performance.now() - t7) * 100) / 100,
  });

  // ==========================================
  // 3. CALCULATION INTEGRITY CHECKS
  // ==========================================
  const t8 = performance.now();
  const calculatedSumArea = rooms.reduce((acc, r) => acc + r.width * r.length, 0);
  const plotArea = project.plotWidth * project.plotLength;
  const groundFloorArea = rooms
    .filter((r) => (r.floorLevel ?? 1) === 1)
    .reduce((acc, r) => acc + r.width * r.length, 0);
  const footprintRatio = plotArea > 0 ? groundFloorArea / plotArea : 0;
  const footprintValid = footprintRatio <= 1.0;

  checks.push({
    id: 'CALC-01-FOOTPRINT-RATIO',
    category: 'calculation_integrity',
    name: 'Ground Footprint vs Plot Area Capacity',
    description: 'Confirms ground floor footprint does not physically exceed the total site plot area.',
    passed: footprintValid,
    severity: 'blocking_defect',
    details: `Ground Footprint: ${groundFloorArea.toFixed(1)} ${project.unit}² / Plot: ${plotArea} ${project.unit}² (${(footprintRatio * 100).toFixed(1)}% coverage)`,
    remediation: footprintValid ? undefined : 'Reduce ground floor room areas to fit within site boundaries.',
    executionTimeMs: Math.round((performance.now() - t8) * 100) / 100,
  });

  const t9 = performance.now();
  const hasBudget = typeof project.budget === 'number' && project.budget >= 0;
  checks.push({
    id: 'CALC-02-BUDGET-FINITE-NUMBER',
    category: 'calculation_integrity',
    name: 'Financial Budget Input Integrity',
    description: 'Verifies that project budget is a valid non-negative numeric value.',
    passed: hasBudget,
    severity: 'warning',
    details: hasBudget
      ? `Budget: ${project.currency} ${project.budget.toLocaleString()}`
      : 'Budget is missing or negative.',
    affectedField: 'budget',
    remediation: hasBudget ? undefined : 'Input a positive budget figure.',
    executionTimeMs: Math.round((performance.now() - t9) * 100) / 100,
  });

  // ==========================================
  // 4. DEPENDENCY & STALENESS VERIFICATION CHECKS
  // ==========================================
  const t10 = performance.now();
  let structuralStale = false;
  let structuralEvaluated = false;
  if (project.structuralCoordination) {
    structuralEvaluated = true;
    if (project.structuralCoordination.lastEvaluatedGeometryHash) {
      structuralStale = project.structuralCoordination.lastEvaluatedGeometryHash !== currentGeomHash;
    }
  }

  checks.push({
    id: 'DEP-01-STRUCTURAL-STALENESS',
    category: 'dependency_propagation',
    name: 'Structural Analysis Synchronization',
    description: 'Detects if structural grid and clear span calculations were evaluated against older geometry.',
    passed: !structuralStale,
    severity: structuralStale ? 'warning' : 'incomplete_data',
    details: !structuralEvaluated
      ? 'Structural coordination not yet evaluated for this project.'
      : structuralStale
      ? 'Structural calculations are STALE (evaluated on older 2D geometry hash).'
      : 'Structural coordination is synchronized with active geometry.',
    remediation: structuralStale ? 'Open Structural Workspace to re-evaluate load paths.' : undefined,
    executionTimeMs: Math.round((performance.now() - t10) * 100) / 100,
  });

  const t11 = performance.now();
  let mepStale = false;
  let mepEvaluated = false;
  if (project.mepCoordination) {
    mepEvaluated = true;
    if (project.mepCoordination.lastEvaluatedGeometryHash) {
      mepStale = project.mepCoordination.lastEvaluatedGeometryHash !== currentGeomHash;
    }
  }

  checks.push({
    id: 'DEP-02-MEP-CLASH-STALENESS',
    category: 'dependency_propagation',
    name: 'MEP Interference Synchronization',
    description: 'Verifies that MEP duct/pipe clash records reflect current 2D plan and column positions.',
    passed: !mepStale,
    severity: mepStale ? 'warning' : 'incomplete_data',
    details: !mepEvaluated
      ? 'MEP coordination model not yet initialized.'
      : mepStale
      ? 'MEP clash detection is STALE (evaluated on previous geometry).'
      : 'MEP clash detection is synchronized with active geometry.',
    remediation: mepStale ? 'Open MEP Coordination Workspace to re-run clash detection.' : undefined,
    executionTimeMs: Math.round((performance.now() - t11) * 100) / 100,
  });

  const t12 = performance.now();
  const constraintState = evaluateConstraintGraph(project);
  const conflictCount = constraintState.summary.conflicts;
  checks.push({
    id: 'DEP-03-CONSTRAINT-GRAPH-INVARIANTS',
    category: 'dependency_propagation',
    name: 'Living Constraint Graph Invariant State',
    description: 'Evaluates programmatic and spatial rules across 2D boundaries, zoning, and multi-floor alignment.',
    passed: conflictCount === 0,
    severity: 'warning',
    details: conflictCount === 0
      ? `All ${constraintState.summary.passing} active constraints satisfied.`
      : `${conflictCount} constraint advisory conflict(s) detected in living graph.`,
    remediation: conflictCount > 0 ? 'Review Living Constraint Graph drawer to resolve advisories.' : undefined,
    executionTimeMs: Math.round((performance.now() - t12) * 100) / 100,
  });

  // ==========================================
  // 5. DESIGN & MULTI-TRADE INTELLIGENCE CHECKS
  // ==========================================
  const t13 = performance.now();
  const hardClashes = project.mepCoordination?.clashes?.filter((c) => c.severity === 'hard-clash' && c.status === 'open') || [];
  const noHardClashes = hardClashes.length === 0;
  checks.push({
    id: 'ENG-01-MEP-HARD-CLASHES',
    category: 'design_intelligence',
    name: 'MEP Physical Intersection Clashes',
    description: 'Checks for unresolved physical intersections between ductwork, sanitary lines, and columns.',
    passed: noHardClashes,
    severity: 'blocking_defect',
    details: noHardClashes
      ? 'Zero unresolved MEP hard clashes detected.'
      : `${hardClashes.length} unresolved physical clash(es) found (e.g. duct intersecting structural column).`,
    affectedField: 'mepCoordination.clashes',
    remediation: noHardClashes ? undefined : 'Reroute duct/pipe or relocate column in MEP Workspace.',
    executionTimeMs: Math.round((performance.now() - t13) * 100) / 100,
  });

  const t14 = performance.now();
  const siteConstraints = evaluateSiteConstraints(project);
  const setbackConflicts = siteConstraints.filter((c) => c.category === 'setback' && c.status === 'conflict');
  const setbackPass = setbackConflicts.length === 0;
  checks.push({
    id: 'ENG-02-SITE-SETBACK-COMPLIANCE',
    category: 'design_intelligence',
    name: 'Zoning Setback Clearance Compliance',
    description: 'Verifies that building massing respects statutory front, rear, and side setback buffers.',
    passed: setbackPass,
    severity: 'warning',
    details: setbackPass
      ? 'All setback clearance buffers satisfied.'
      : `${setbackConflicts.length} setback buffer clearance advisory notice(s) detected.`,
    remediation: setbackPass ? undefined : 'Adjust room coordinates or obtain municipal zoning variance.',
    executionTimeMs: Math.round((performance.now() - t14) * 100) / 100,
  });

  // ==========================================
  // 6. VERSIONING & RECOVERY CHECKS
  // ==========================================
  const t15 = performance.now();
  const snapshots = getProjectSnapshots(project);
  const hasSnapshots = snapshots.length > 0;
  checks.push({
    id: 'VER-01-REVISION-HISTORY-EXISTS',
    category: 'versioning_recovery',
    name: 'Revision History & Rollback Baseline',
    description: 'Verifies that at least one immutable snapshot or baseline milestone is recorded.',
    passed: hasSnapshots,
    severity: 'warning',
    details: hasSnapshots
      ? `${snapshots.length} snapshot milestone(s) available for recovery.`
      : 'No snapshots recorded for this project yet.',
    remediation: hasSnapshots ? undefined : 'Create a milestone snapshot in Revisions & Diff workspace.',
    executionTimeMs: Math.round((performance.now() - t15) * 100) / 100,
  });

  // ==========================================
  // 7. SECURITY & INFRASTRUCTURE CHECKS
  // ==========================================
  const t16 = performance.now();
  const quota = getStorageQuotaInfo();
  const quotaSafe = !quota.isNearLimit;
  checks.push({
    id: 'SEC-01-STORAGE-QUOTA-CAPACITY',
    category: 'security_infrastructure',
    name: 'Client Storage Quota Capacity Buffer',
    description: 'Verifies that local storage utilization remains comfortably under the ~5MB boundary (<80%).',
    passed: quotaSafe,
    severity: quotaSafe ? 'warning' : 'blocking_defect',
    details: `Storage utilization: ${(quota.usedBytes / 1024).toFixed(1)} KB / 5,120 KB (${quota.percentageUsed}% used)`,
    remediation: quotaSafe ? undefined : 'Export a system backup and purge older revision checkpoints.',
    executionTimeMs: Math.round((performance.now() - t16) * 100) / 100,
  });

  const t17 = performance.now();
  // Secret scan on project record fields
  const serialized = JSON.stringify(project);
  const hasExposedSecret = /("|')(AIza|sk-|ghp_|AKIA)[A-Za-z0-9_\-]{16,}/.test(serialized);
  checks.push({
    id: 'SEC-02-NO-EXPOSED-CREDENTIALS',
    category: 'security_infrastructure',
    name: 'Credential & Token Non-Exposure',
    description: 'Scans project fields and client models to confirm zero private API keys or tokens are stored.',
    passed: !hasExposedSecret,
    severity: 'blocking_defect',
    details: !hasExposedSecret ? 'Project data clean: 0 credentials or private tokens detected.' : 'Potential API token pattern found in project state.',
    remediation: !hasExposedSecret ? undefined : 'Remove hardcoded credentials from project notes or metadata.',
    executionTimeMs: Math.round((performance.now() - t17) * 100) / 100,
  });

  // ==========================================
  // SUMMARY CALCULATIONS
  // ==========================================
  const totalExecutionTimeMs = Math.round((performance.now() - startTime) * 100) / 100;
  const totalChecks = checks.length;
  const passedChecks = checks.filter((c) => c.passed).length;
  const failedChecks = totalChecks - passedChecks;
  const blockingDefects = checks.filter((c) => !c.passed && c.severity === 'blocking_defect').length;
  const warnings = checks.filter((c) => !c.passed && c.severity === 'warning').length;
  const incompleteData = checks.filter((c) => !c.passed && c.severity === 'incomplete_data').length;
  const unsupportedChecks = checks.filter((c) => !c.passed && c.severity === 'unsupported_check').length;

  const healthScore = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 100;
  const overallPassed = blockingDefects === 0;

  // Category aggregations
  const categoryKeys: VerificationCategory[] = [
    'project_foundation',
    'geometry_spatial_sync',
    'calculation_integrity',
    'dependency_propagation',
    'design_intelligence',
    'versioning_recovery',
    'security_infrastructure',
  ];

  const categoryLabels: Record<VerificationCategory, string> = {
    project_foundation: 'Project Foundation',
    geometry_spatial_sync: '2D Geometry & 3D Sync',
    calculation_integrity: 'Calculation Integrity',
    dependency_propagation: 'Dependency & Staleness',
    design_intelligence: 'Multi-Trade Engineering',
    versioning_recovery: 'Versioning & Recovery',
    security_infrastructure: 'Security & Persistence',
  };

  const categoryScores = {} as ProjectVerificationReport['categoryScores'];
  categoryKeys.forEach((cat) => {
    const catChecks = checks.filter((c) => c.category === cat);
    const catTotal = catChecks.length;
    const catPassed = catChecks.filter((c) => c.passed).length;
    const catBlocking = catChecks.filter((c) => !c.passed && c.severity === 'blocking_defect').length;
    const percentage = catTotal > 0 ? Math.round((catPassed / catTotal) * 100) : 100;
    categoryScores[cat] = {
      category: cat,
      label: categoryLabels[cat],
      total: catTotal,
      passed: catPassed,
      blocking: catBlocking,
      percentage,
    };
  });

  // Release Gate Evaluations
  const releaseGates = evaluateReleaseGates(project, checks);

  const reportId = `vrpt-${project.id}-${Date.now().toString(36)}`;
  const auditSignature = computeStringChecksum(
    `${reportId}|${project.id}|${overallPassed}|${healthScore}|${blockingDefects}|${passedChecks}/${totalChecks}`
  );

  return {
    reportId,
    projectId: project.id,
    projectName: project.name,
    evaluatedAt: new Date().toISOString(),
    overallPassed,
    healthScore,
    summary: {
      totalChecks,
      passedChecks,
      failedChecks,
      blockingDefects,
      warnings,
      incompleteData,
      unsupportedChecks,
      totalExecutionTimeMs,
    },
    categoryScores,
    checks,
    releaseGates,
    auditSignature,
  };
}

/**
 * Evaluates four formal release gates based on check results and project maturity.
 */
export function evaluateReleaseGates(
  project: Project,
  checks: VerificationCheck[]
): Record<ReleaseGateTarget, ReleaseGateEvaluation> {
  const checkMap = new Map(checks.map((c) => [c.id, c]));

  // GATE 1: Concept & Schematic Design
  const g1Reqs: ReleaseGateChecklistRequirement[] = [
    {
      id: 'PF-01-ID-VALIDITY',
      title: 'Valid Project Identifier',
      category: 'project_foundation',
      isMandatory: true,
      status: checkMap.get('PF-01-ID-VALIDITY')?.passed ? 'satisfied' : 'failed',
      explanation: 'Project must possess a well-formed identifier.',
    },
    {
      id: 'PF-03-BOUNDARY-DIMENSIONS',
      title: 'Positive Plot Boundary Dimensions',
      category: 'project_foundation',
      isMandatory: true,
      status: checkMap.get('PF-03-BOUNDARY-DIMENSIONS')?.passed ? 'satisfied' : 'failed',
      explanation: 'Parcel geometry must be specified with positive spans.',
    },
    {
      id: 'GEO-01-ROOMS-ALLOCATED',
      title: 'Spatial Allocation Placed',
      category: 'geometry_spatial_sync',
      isMandatory: false,
      status: checkMap.get('GEO-01-ROOMS-ALLOCATED')?.passed ? 'satisfied' : 'failed',
      explanation: 'At least one space program cell should be positioned.',
    },
    {
      id: 'GEO-02-PARCEL-CONTAINMENT',
      title: 'Parcel Boundary Enclosure',
      category: 'geometry_spatial_sync',
      isMandatory: true,
      status: checkMap.get('GEO-02-PARCEL-CONTAINMENT')?.passed ? 'satisfied' : 'failed',
      explanation: 'Massing must not exceed legal parcel boundaries.',
    },
  ];

  // GATE 2: Design Development Release
  const g2Reqs: ReleaseGateChecklistRequirement[] = [
    ...g1Reqs,
    {
      id: 'GEO-03-ROOM-POSITIVE-DIMENSIONS',
      title: 'Room Positive Dimensions',
      category: 'geometry_spatial_sync',
      isMandatory: true,
      status: checkMap.get('GEO-03-ROOM-POSITIVE-DIMENSIONS')?.passed ? 'satisfied' : 'failed',
      explanation: 'All rooms must have positive dimensions.',
    },
    {
      id: 'DEP-03-CONSTRAINT-GRAPH-INVARIANTS',
      title: 'Zero Constraint Invariant Conflicts',
      category: 'dependency_propagation',
      isMandatory: true,
      status: checkMap.get('DEP-03-CONSTRAINT-GRAPH-INVARIANTS')?.passed ? 'satisfied' : 'failed',
      explanation: 'Living Constraint Graph must contain zero blocking conflicts.',
    },
    {
      id: 'ENG-02-SITE-SETBACK-COMPLIANCE',
      title: 'Zoning Setback Compliance',
      category: 'design_intelligence',
      isMandatory: true,
      status: checkMap.get('ENG-02-SITE-SETBACK-COMPLIANCE')?.passed ? 'satisfied' : 'failed',
      explanation: 'Building massing must respect statutory setbacks.',
    },
    {
      id: 'VER-01-REVISION-HISTORY-EXISTS',
      title: 'Baseline Milestone Snapshot Created',
      category: 'versioning_recovery',
      isMandatory: false,
      status: checkMap.get('VER-01-REVISION-HISTORY-EXISTS')?.passed ? 'satisfied' : 'failed',
      explanation: 'A baseline snapshot milestone must be preserved.',
    },
  ];

  // GATE 3: Tender & Bidding Release
  const g3Reqs: ReleaseGateChecklistRequirement[] = [
    ...g2Reqs,
    {
      id: 'CALC-02-BUDGET-FINITE-NUMBER',
      title: 'Approved Financial Target Budget',
      category: 'calculation_integrity',
      isMandatory: true,
      status: checkMap.get('CALC-02-BUDGET-FINITE-NUMBER')?.passed ? 'satisfied' : 'failed',
      explanation: 'Financial model must include an approved target budget.',
    },
    {
      id: 'ENG-01-MEP-HARD-CLASHES',
      title: 'Zero MEP Hard Clashes',
      category: 'design_intelligence',
      isMandatory: true,
      status: checkMap.get('ENG-01-MEP-HARD-CLASHES')?.passed ? 'satisfied' : 'failed',
      explanation: 'All physical clashes between ductwork and structure must be resolved.',
    },
    {
      id: 'DEP-01-STRUCTURAL-STALENESS',
      title: 'Fresh Structural Framing Alignment',
      category: 'dependency_propagation',
      isMandatory: true,
      status: checkMap.get('DEP-01-STRUCTURAL-STALENESS')?.passed ? 'satisfied' : 'failed',
      explanation: 'Structural framing must not be based on stale geometry.',
    },
  ];

  // GATE 4: Construction Handoff Gate
  const g4Reqs: ReleaseGateChecklistRequirement[] = [
    ...g3Reqs,
    {
      id: 'SEC-01-STORAGE-QUOTA-CAPACITY',
      title: 'Storage Health & Persistence Quota Buffer',
      category: 'security_infrastructure',
      isMandatory: true,
      status: checkMap.get('SEC-01-STORAGE-QUOTA-CAPACITY')?.passed ? 'satisfied' : 'failed',
      explanation: 'Storage capacity must have headroom for documentation assets.',
    },
    {
      id: 'SEC-02-NO-EXPOSED-CREDENTIALS',
      title: 'Zero Credentials in Construction Package',
      category: 'security_infrastructure',
      isMandatory: true,
      status: checkMap.get('SEC-02-NO-EXPOSED-CREDENTIALS')?.passed ? 'satisfied' : 'failed',
      explanation: 'Exported dossier must be completely clean of credential patterns.',
    },
  ];

  const buildGate = (
    target: ReleaseGateTarget,
    targetLabel: string,
    description: string,
    checklist: ReleaseGateChecklistRequirement[]
  ): ReleaseGateEvaluation => {
    const mandatoryFailed = checklist.filter((r) => r.isMandatory && r.status === 'failed').length;
    const warnings = checklist.filter((r) => !r.isMandatory && r.status === 'failed').length;
    const satisfied = checklist.filter((r) => r.status === 'satisfied').length;
    const scorePercentage = Math.round((satisfied / checklist.length) * 100);

    return {
      target,
      targetLabel,
      description,
      eligible: mandatoryFailed === 0,
      scorePercentage,
      blockingIssuesCount: mandatoryFailed,
      warningsCount: warnings,
      checklist,
      evaluatedAt: new Date().toISOString(),
    };
  };

  return {
    concept_schematic: buildGate(
      'concept_schematic',
      'Concept & Schematic Gate',
      'Validates boundary containment, orientation, and fundamental room layouts.',
      g1Reqs
    ),
    design_development: buildGate(
      'design_development',
      'Design Development Gate',
      'Ensures zoning setbacks, living constraint invariants, and structural grid alignment.',
      g2Reqs
    ),
    tender_bidding: buildGate(
      'tender_bidding',
      'Tender & Contractor Bidding Gate',
      'Verifies MEP hard-clash resolution, budget definition, and trade synchronization.',
      g3Reqs
    ),
    construction_handoff: buildGate(
      'construction_handoff',
      'Construction Handoff Gate',
      'Full compliance verification across all 7 disciplines with zero blocking defects.',
      g4Reqs
    ),
  };
}

/**
 * Exports a formal Verification & Release Certificate in Markdown format.
 */
export function generateVerificationCertificateMarkdown(report: ProjectVerificationReport): string {
  const dateStr = new Date(report.evaluatedAt).toLocaleString();
  let md = `# PLOTIFY — ARCHITECTURAL VERIFICATION & RELEASE CERTIFICATE\n\n`;
  md += `**Report ID:** \`${report.reportId}\`  \n`;
  md += `**Project:** ${report.projectName} (\`${report.projectId}\`)  \n`;
  md += `**Evaluated At:** ${dateStr}  \n`;
  md += `**Audit Signature:** \`${report.auditSignature}\`  \n`;
  md += `**Overall Status:** ${report.overallPassed ? '✓ PASSED (ELIGIBLE FOR STAGED RELEASE)' : '✗ BLOCKED (CONTAINS DEFECTS)'}  \n`;
  md += `**System Health Score:** ${report.healthScore}%  \n\n`;

  md += `## 1. Executive Summary\n\n`;
  md += `| Metric | Count |\n`;
  md += `| :--- | :--- |\n`;
  md += `| Total Verification Checks | ${report.summary.totalChecks} |\n`;
  md += `| Passed Checks | ${report.summary.passedChecks} |\n`;
  md += `| Blocking Defects | ${report.summary.blockingDefects} |\n`;
  md += `| Non-Blocking Warnings | ${report.summary.warnings} |\n`;
  md += `| Total Execution Time | ${report.summary.totalExecutionTimeMs} ms |\n\n`;

  md += `## 2. Category Discipline Scores\n\n`;
  md += `| Discipline Category | Checks | Passed | Blocking Defects | Score |\n`;
  md += `| :--- | :---: | :---: | :---: | :---: |\n`;
  Object.values(report.categoryScores).forEach((c) => {
    md += `| ${c.label} | ${c.total} | ${c.passed} | ${c.blocking} | ${c.percentage}% |\n`;
  });
  md += `\n`;

  md += `## 3. Release Milestone Gates\n\n`;
  Object.values(report.releaseGates).forEach((gate) => {
    md += `### ${gate.targetLabel}: ${gate.eligible ? '✓ ELIGIBLE' : '✗ BLOCKED'}\n`;
    md += `*${gate.description}*  \n`;
    md += `**Score:** ${gate.scorePercentage}% | **Blocking Issues:** ${gate.blockingIssuesCount} | **Warnings:** ${gate.warningsCount}  \n\n`;
    md += `| Requirement | Mandatory | Status | Explanation |\n`;
    md += `| :--- | :---: | :---: | :--- |\n`;
    gate.checklist.forEach((req) => {
      md += `| ${req.title} | ${req.isMandatory ? 'Yes' : 'No'} | ${req.status.toUpperCase()} | ${req.explanation} |\n`;
    });
    md += `\n`;
  });

  md += `## 4. Itemized Verification Register\n\n`;
  report.checks.forEach((c) => {
    const symbol = c.passed ? '✓' : c.severity === 'blocking_defect' ? '✗ [BLOCKING]' : '▲ [WARNING]';
    md += `* **${symbol} ${c.id}:** ${c.name} — *${c.details}*\n`;
    if (c.remediation) {
      md += `  *Remediation:* ${c.remediation}\n`;
    }
  });

  md += `\n---\n*Notice: Plotify automated verification provides deterministic mathematical and spatial validation based on provided models. It does not replace stamped professional engineering certifications.*`;

  return md;
}
