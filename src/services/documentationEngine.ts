import { Project, FloorPlanRoom } from '../types/project';
import {
  DocumentType,
  DocumentMeta,
  RoomScheduleDocumentData,
  CostReportDocumentData,
  DesignSpecDocumentData,
  FloorScheduleGroup,
  RoomScheduleEntry,
} from '../types/documentation';
import {
  computeProjectGeometryHash,
  calculateCostSummary,
  initializeProjectCostPlanning,
} from './costPlanningService';
import {
  generateProjectEvidenceRecords,
  generateAuditMarkdownReport,
} from './evidenceEngine';
import {
  checkBoundaryViolations,
  checkRoomOverlaps,
} from '../components/floorplan/geometry';
import { formatCurrency, formatArea, formatDate } from '../utils/formatters';
import { initializeProjectSiteContext } from './siteIntelligenceService';
import {
  initializeProjectBrief,
  calculateSpaceProgramSummary,
  compareBriefWithFloorPlan,
  validateBrief,
} from './briefService';
import {
  evaluateProjectRegulations,
  generateRegulatoryComplianceCSV,
  generateRegulatoryMarkdownReport,
} from './regulatoryService';

import {
  generateStructuralSummaryCSV,
  generateStructuralReportMarkdown,
  evaluateStructuralCoordination,
} from './structuralService';

import {
  generateMEPClashRegisterCSV,
  generateMEPReportMarkdown,
  evaluateMEPClashes,
} from './mepClashService';

export {
  generateRegulatoryComplianceCSV,
  generateRegulatoryMarkdownReport,
  generateStructuralSummaryCSV,
  generateStructuralReportMarkdown,
  generateMEPClashRegisterCSV,
  generateMEPReportMarkdown,
};

const ENGINE_VERSION = 'v1.0.0-documentation';

/**
 * Returns document metadata and supported export formats for all 5 official document types
 */
export function getAvailableDocuments(project: Project): DocumentMeta[] {
  const currentGeomHash = computeProjectGeometryHash(project);
  const nowIso = new Date().toISOString();

  const costPlan = project.costPlanning;
  const isCostStale = Boolean(
    costPlan?.lastGeometryHash && costPlan.lastGeometryHash !== currentGeomHash
  );

  return [
    {
      id: `${project.id}-doc-summary`,
      type: 'project-summary',
      title: 'Executive Architectural Project Dossier',
      description: 'Comprehensive project summary compiling spatial parameters, site zoning, active concept specifications, preliminary budget, and regulatory evidence.',
      generatedAt: nowIso,
      sourceGeometryHash: currentGeomHash,
      projectVersion: project.updatedAt || nowIso,
      isStale: false,
      supportedFormats: ['print', 'pdf', 'markdown', 'json'],
    },
    {
      id: `${project.id}-doc-rooms`,
      type: 'room-schedule',
      title: 'Floor-Plan Spatial & Room Schedule',
      description: 'Floor-by-floor schedule of enclosed usable rooms with dimensions, surface areas, boundary checks, and distinction between Usable vs Gross Built vs Plot Area.',
      generatedAt: nowIso,
      sourceGeometryHash: currentGeomHash,
      projectVersion: project.updatedAt || nowIso,
      isStale: false,
      supportedFormats: ['print', 'pdf', 'csv', 'markdown'],
    },
    {
      id: `${project.id}-doc-cost`,
      type: 'cost-estimate',
      title: 'Itemized Bill of Quantities & Construction Schedule',
      description: 'Detailed elemental cost plan (QTO) derived from geometry, including materials, labour, contingency allowances, budget variances, and phase predecessor timelines.',
      generatedAt: costPlan?.lastRecalculatedAt || nowIso,
      sourceGeometryHash: costPlan?.lastGeometryHash || currentGeomHash,
      projectVersion: project.updatedAt || nowIso,
      isStale: isCostStale,
      staleReason: isCostStale
        ? 'Floor-plan geometry was modified after this cost model was generated. Re-sync required.'
        : undefined,
      supportedFormats: ['print', 'pdf', 'csv', 'markdown'],
    },
    {
      id: `${project.id}-doc-design`,
      type: 'design-specification',
      title: 'Exterior Facade & Interior Finishes Schedule',
      description: 'Specification schedule of active facade materials, color palettes, window styles, and room-by-room interior wall, floor, ceiling, and lighting finishes.',
      generatedAt: nowIso,
      sourceGeometryHash: currentGeomHash,
      projectVersion: project.updatedAt || nowIso,
      isStale: false,
      supportedFormats: ['print', 'pdf', 'csv', 'markdown'],
    },
    {
      id: `${project.id}-doc-evidence`,
      type: 'evidence-audit',
      title: 'Proof-Carrying Design & Regulatory Audit Ledger',
      description: 'Itemized mathematical proof ledger recording captured inputs, deterministic formulas, boundary checks, and mandatory statutory engineering review notices.',
      generatedAt: nowIso,
      sourceGeometryHash: currentGeomHash,
      projectVersion: project.updatedAt || nowIso,
      isStale: false,
      supportedFormats: ['print', 'pdf', 'csv', 'markdown', 'json'],
    },
  ];
}

/**
 * Computes deterministic room schedule data from actual saved floor plan geometry
 */
export function generateRoomScheduleDocumentData(project: Project): RoomScheduleDocumentData {
  const rooms = project.floorPlan?.rooms || [];
  const unit = project.unit;
  const unitLabel = unit === 'feet' ? 'ft' : 'm';
  const unitAreaLabel = unit === 'feet' ? 'sq ft' : 'm²';

  const plotArea = project.plotWidth * project.plotLength;
  const plotAreaFormatted = `${plotArea.toLocaleString()} ${unitAreaLabel}`;
  const plotDimensionsFormatted = `${project.plotWidth} ${unitLabel} × ${project.plotLength} ${unitLabel}`;

  // Check spatial violations
  const violations = rooms
    .map((r) => checkBoundaryViolations(r, project.plotWidth, project.plotLength))
    .filter((v): v is NonNullable<typeof v> => v !== null);

  const overlaps = checkRoomOverlaps(rooms);
  const violationRoomIds = new Set(violations.map((v) => v.roomId));
  const overlapRoomIds = new Set(overlaps.flatMap((o) => [o.room1Id, o.room2Id]));

  const entries: RoomScheduleEntry[] = rooms.map((r) => {
    const w = typeof r.width === 'number' && r.width > 0 ? r.width : 0;
    const l = typeof r.length === 'number' && r.length > 0 ? r.length : 0;
    const area = w * l;
    return {
      id: r.id,
      name: r.name,
      type: r.type,
      floorLevel: r.floorLevel || 1,
      width: w,
      length: l,
      area,
      unit: unitAreaLabel,
      dimensionsFormatted: `${w} × ${l} ${unitLabel}`,
      areaFormatted: `${area.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${unitAreaLabel}`,
      hasBoundaryViolation: violationRoomIds.has(r.id),
      hasOverlap: overlapRoomIds.has(r.id),
    };
  });

  // Group by floor
  const floorMap = new Map<number, RoomScheduleEntry[]>();
  for (let f = 1; f <= Math.max(project.floors, 1); f++) {
    floorMap.set(f, []);
  }

  entries.forEach((entry) => {
    const list = floorMap.get(entry.floorLevel) || [];
    list.push(entry);
    floorMap.set(entry.floorLevel, list);
  });

  const floorGroups: FloorScheduleGroup[] = Array.from(floorMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([lvl, roomList]) => {
      const totalFloorArea = roomList.reduce((sum, r) => sum + r.area, 0);
      return {
        floorLevel: lvl,
        floorLabel: lvl === 1 ? 'Floor 1 — Ground Level' : `Floor ${lvl} — Upper Level`,
        roomCount: roomList.length,
        totalFloorArea,
        totalFloorAreaFormatted: `${totalFloorArea.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${unitAreaLabel}`,
        rooms: roomList,
      };
    });

  const totalMeasuredRoomArea = entries.reduce((sum, r) => sum + r.area, 0);
  const groundFloorArea = entries
    .filter((r) => r.floorLevel === 1)
    .reduce((sum, r) => sum + r.area, 0);

  const coveragePercent = plotArea > 0 ? Math.round((groundFloorArea / plotArea) * 1000) / 10 : 0;
  const far = plotArea > 0 ? Math.round((totalMeasuredRoomArea / plotArea) * 100) / 100 : 0;
  // Standard architectural assumption: Gross built area is ~12% higher than net interior room spaces to account for structural walls
  const estimatedGrossBuiltArea = Math.round(totalMeasuredRoomArea * 1.12);

  const unresolvedGeometryWarnings: string[] = [];
  if (violations.length > 0) {
    unresolvedGeometryWarnings.push(
      `${violations.length} room(s) protrude beyond plot perimeter boundaries: ${violations.map((v) => v.roomName).join(', ')}.`
    );
  }
  if (overlaps.length > 0) {
    unresolvedGeometryWarnings.push(
      `${overlaps.length} pair(s) of rooms physically overlap on the same level: ${overlaps.map((o) => `${o.room1Name} & ${o.room2Name}`).join(', ')}.`
    );
  }
  if (rooms.length === 0) {
    unresolvedGeometryWarnings.push('No 2D floor-plan rooms have been placed or saved yet.');
  }

  return {
    projectId: project.id,
    projectName: project.name,
    unit,
    unitLabel,
    unitAreaLabel,
    plotDimensionsFormatted,
    plotArea,
    plotAreaFormatted,
    totalMeasuredRoomArea,
    totalMeasuredRoomAreaFormatted: `${totalMeasuredRoomArea.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${unitAreaLabel}`,
    estimatedGrossBuiltArea,
    estimatedGrossBuiltAreaFormatted: `${estimatedGrossBuiltArea.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${unitAreaLabel}`,
    groundFloorFootprint: groundFloorArea,
    groundFloorFootprintFormatted: `${groundFloorArea.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${unitAreaLabel}`,
    groundCoveragePercent: coveragePercent,
    floorAreaRatio: far,
    floorGroups,
    totalRoomsCount: rooms.length,
    unresolvedGeometryWarnings,
  };
}

/**
 * Extracts Cost Intelligence data for reporting
 */
export function generateCostReportDocumentData(project: Project): CostReportDocumentData {
  const costPlan = project.costPlanning || initializeProjectCostPlanning(project);
  const activeScenario =
    costPlan.scenarios.find((s) => s.id === costPlan.activeScenarioId) || costPlan.scenarios[0];

  const currentGeomHash = computeProjectGeometryHash(project);
  const summary = calculateCostSummary(activeScenario, costPlan.targetBudget, currentGeomHash);

  return {
    projectId: project.id,
    projectName: project.name,
    scenarioName: activeScenario.name,
    currency: project.currency,
    targetBudget: costPlan.targetBudget,
    estimatedTotal: summary.estimatedTotal,
    subtotal: summary.subtotal,
    contingencyRatePercent: activeScenario.contingencyRatePercent,
    contingencyAmount: summary.contingencyAmount,
    taxRatePercent: activeScenario.taxRatePercent,
    taxAmount: summary.taxAmount,
    budgetVariance: summary.budgetVariance,
    budgetVariancePercent: summary.budgetVariancePercent,
    budgetStatus: summary.budgetStatus,
    lineItems: activeScenario.lineItems,
    phases: costPlan.phases,
    isStale: summary.isStale,
    staleReason: summary.isStale
      ? 'Floor plan geometry was modified after this bill of quantities was calculated.'
      : undefined,
    rateDate: activeScenario.updatedAt,
    location: activeScenario.location || 'Local Regional Standard',
  };
}

/**
 * Extracts design specifications and material schedules
 */
export function generateDesignSpecDocumentData(project: Project): DesignSpecDocumentData {
  const alts = project.designAlternatives || [];
  const activeAlt = alts.find((a) => a.id === project.activeAlternativeId) || alts[0];

  if (!activeAlt) {
    return {
      projectId: project.id,
      projectName: project.name,
      activeAlternativeName: 'Default Contemporary Whitebox',
      facadeStyle: 'Contemporary Architectural Whitebox',
      primaryMaterial: 'plaster',
      accentMaterial: 'timber',
      primaryColor: '#f8fafc',
      accentColor: '#334155',
      windowTrimColor: '#0f172a',
      roofTrimColor: '#1e293b',
      windowStyle: 'floor-to-ceiling',
      entranceStyle: 'minimal-pivot',
      shadingStyle: 'deep-overhangs',
      elevationView: 'perspective',
      interiorRoomSchedules: [],
      alternativeCount: 0,
    };
  }

  const interiorList = Object.entries(activeAlt.interiors || {}).map(([roomId, roomConcept]) => ({
    roomId,
    roomName: roomConcept.roomName,
    style: roomConcept.style,
    wallColor: roomConcept.wallColor,
    wallFinish: roomConcept.wallFinish,
    floorFinish: roomConcept.floorFinish,
    ceilingFinish: roomConcept.ceilingFinish,
    lightingMood: roomConcept.lightingMood,
    designPriority: roomConcept.designPriority,
    notes: roomConcept.notes,
  }));

  return {
    projectId: project.id,
    projectName: project.name,
    activeAlternativeId: activeAlt.id,
    activeAlternativeName: activeAlt.name,
    facadeStyle: activeAlt.facade.style,
    primaryMaterial: activeAlt.facade.primaryMaterial,
    accentMaterial: activeAlt.facade.accentMaterial,
    primaryColor: activeAlt.facade.primaryColor,
    accentColor: activeAlt.facade.accentColor,
    windowTrimColor: activeAlt.facade.windowTrimColor,
    roofTrimColor: activeAlt.facade.roofTrimColor,
    windowStyle: activeAlt.facade.windowStyle,
    entranceStyle: activeAlt.facade.entranceStyle,
    shadingStyle: activeAlt.facade.shadingStyle,
    elevationView: activeAlt.facade.elevationView,
    interiorRoomSchedules: interiorList,
    alternativeCount: alts.length,
  };
}

// =========================================================================
// CSV EXPORT GENERATORS
// =========================================================================

/**
 * Generates standards-compliant CSV for room schedules
 */
export function generateRoomScheduleCSV(project: Project): string {
  const data = generateRoomScheduleDocumentData(project);
  const rows: string[][] = [
    [
      'Floor Level',
      'Room ID',
      'Room Name',
      'Functional Type',
      `Width (${data.unitLabel})`,
      `Length (${data.unitLabel})`,
      `Measured Usable Area (${data.unitAreaLabel})`,
      'Boundary Enclosure',
      'Spatial Overlap Check',
    ],
  ];

  data.floorGroups.forEach((group) => {
    group.rooms.forEach((r) => {
      rows.push([
        String(r.floorLevel),
        r.id,
        `"${r.name.replace(/"/g, '""')}"`,
        r.type,
        String(r.width),
        String(r.length),
        String(r.area),
        r.hasBoundaryViolation ? 'VIOLATION' : 'PASSED',
        r.hasOverlap ? 'COLLISION' : 'CLEAR',
      ]);
    });
  });

  // Summary row
  rows.push([]);
  rows.push([
    'TOTALS',
    '',
    `${data.totalRoomsCount} Rooms`,
    '',
    '',
    '',
    String(data.totalMeasuredRoomArea),
    '',
    '',
  ]);

  return rows.map((r) => r.join(',')).join('\n');
}

/**
 * Generates CSV for the elemental Bill of Quantities
 */
export function generateCostEstimateCSV(project: Project): string {
  const cost = generateCostReportDocumentData(project);
  const rows: string[][] = [
    [
      'Item Code',
      'Category',
      'Item Name',
      'Quantity',
      'Unit',
      `Unit Rate (${cost.currency})`,
      `Extended Cost (${cost.currency})`,
      'Quantity Source',
      'Formula / Method',
      'Assumptions',
    ],
  ];

  cost.lineItems.forEach((item) => {
    rows.push([
      item.code,
      item.category,
      `"${item.name.replace(/"/g, '""')}"`,
      String(item.quantity),
      item.unit,
      String(item.unitRate),
      String(item.extendedCost),
      item.quantitySource,
      `"${item.calculationFormula.replace(/"/g, '""')}"`,
      `"${item.assumptions.replace(/"/g, '""')}"`,
    ]);
  });

  rows.push([]);
  rows.push(['SUBTOTAL', '', '', '', '', '', String(cost.subtotal), '', '', '']);
  rows.push([
    `CONTINGENCY (${cost.contingencyRatePercent}%)`,
    '',
    '',
    '',
    '',
    '',
    String(cost.contingencyAmount),
    '',
    '',
    '',
  ]);
  rows.push([
    `TAX (${cost.taxRatePercent}%)`,
    '',
    '',
    '',
    '',
    '',
    String(cost.taxAmount),
    '',
    '',
    '',
  ]);
  rows.push(['ESTIMATED GRAND TOTAL', '', '', '', '', '', String(cost.estimatedTotal), '', '', '']);
  rows.push([
    `TARGET BUDGET: ${cost.targetBudget}`,
    `VARIANCE: ${cost.budgetVariance}`,
    `STATUS: ${cost.budgetStatus.toUpperCase()}`,
  ]);

  return rows.map((r) => r.join(',')).join('\n');
}

/**
 * Generates CSV for material finishes specification
 */
export function generateDesignSpecCSV(project: Project): string {
  const design = generateDesignSpecDocumentData(project);
  const rows: string[][] = [
    [
      'Room Name',
      'Room ID',
      'Interior Style',
      'Wall Color (HEX)',
      'Wall Surface Finish',
      'Flooring Finish',
      'Ceiling Finish',
      'Lighting Mood',
      'Design Priority',
    ],
  ];

  design.interiorRoomSchedules.forEach((item) => {
    rows.push([
      `"${item.roomName.replace(/"/g, '""')}"`,
      item.roomId,
      item.style,
      item.wallColor,
      item.wallFinish,
      item.floorFinish,
      item.ceilingFinish,
      item.lightingMood,
      item.designPriority,
    ]);
  });

  return rows.map((r) => r.join(',')).join('\n');
}

/**
 * Generates CSV for Proof-Carrying Evidence Audit Ledger
 */
export function generateEvidenceAuditCSV(project: Project): string {
  const audit = generateProjectEvidenceRecords(project);
  const rows: string[][] = [
    [
      'Proof ID',
      'Module',
      'Category',
      'Result Name',
      'Calculated Value',
      'Unit',
      'Validation Status',
      'Requirement Classification',
      'Calculation Method',
      'Mandatory Review Requirement',
      'Status Rationale',
    ],
  ];

  audit.records.forEach((r) => {
    rows.push([
      r.id,
      r.module,
      r.category,
      `"${r.resultName.replace(/"/g, '""')}"`,
      `"${String(r.resultValue).replace(/"/g, '""')}"`,
      r.unit || '',
      r.validationStatus.toUpperCase(),
      r.isFormalRequirement ? 'Formal Rule' : 'User Preference',
      `"${r.calculationMethod.replace(/"/g, '""')}"`,
      `"${r.requiredProfessionalReview.replace(/"/g, '""')}"`,
      `"${r.statusExplanation.replace(/"/g, '""')}"`,
    ]);
  });

  return rows.map((r) => r.join(',')).join('\n');
}

// =========================================================================
// MARKDOWN DOCUMENT EXPORTERS
// =========================================================================

/**
 * Generates clean, publication-ready Markdown for any document type
 */
export function generateDocumentMarkdown(project: Project, docType: DocumentType): string {
  const lines: string[] = [];
  const nowStr = new Date().toUTCString();
  const geomHash = computeProjectGeometryHash(project);

  if (docType === 'complete-dossier') {
    const roomData = generateRoomScheduleDocumentData(project);
    const costData = generateCostReportDocumentData(project);
    const designData = generateDesignSpecDocumentData(project);
    const auditData = generateProjectEvidenceRecords(project);

    lines.push(`# PLOTIFY — ARCHITECTURAL PROJECT EXECUTIVE DOSSIER (COMPLETE HANDOFF PACKAGE)`);
    lines.push(`**Project Name:** ${project.name} | **ID:** \`${project.id}\``);
    lines.push(`**Generated:** ${nowStr}`);
    lines.push(`**Source Geometry Hash:** \`${geomHash}\``);
    lines.push(`**Project Revision / Last Updated:** \`${project.updatedAt || project.createdAt}\``);
    lines.push(`**Status:** ${project.status} | **Building Floors:** ${project.floors}`);
    lines.push(``);
    lines.push(`---`);
    lines.push(``);
    const siteData = initializeProjectSiteContext(project);
    const uSuffix = project.unit === 'feet' ? 'ft' : 'm';

    lines.push(`## 1. Site Boundary, Orientation & Spatial Program Summary`);
    lines.push(`- **Plot Parcel Dimensions:** ${roomData.plotDimensionsFormatted}`);
    lines.push(`- **Total Plot Parcel Area:** ${roomData.plotAreaFormatted}`);
    lines.push(`- **True North Orientation:** ${siteData.northOrientationOffsetDeg}° offset from plot datum`);
    lines.push(`- **Mandatory Setbacks:** Front: ${siteData.setbacks.front}${uSuffix}, Rear: ${siteData.setbacks.rear}${uSuffix}, Left: ${siteData.setbacks.sideLeft}${uSuffix}, Right: ${siteData.setbacks.sideRight}${uSuffix}`);
    lines.push(`- **Topography & Grading:** ${siteData.slope.replace(/-/g, ' ')} (fall: ${siteData.slopeDirection})`);
    if (siteData.obstacles.length > 0) {
      lines.push(`- **Preserved Site Obstacles:** ${siteData.obstacles.map((o) => `${o.name} (${o.type})`).join(', ')}`);
    }
    lines.push(`- **Ground Floor Footprint:** ${roomData.groundFloorFootprintFormatted} (${roomData.groundCoveragePercent}% ground coverage)`);
    lines.push(`- **Net Usable Room Area:** ${roomData.totalMeasuredRoomAreaFormatted}`);
    lines.push(`- **Estimated Gross Built-Up Area:** ${roomData.estimatedGrossBuiltAreaFormatted} (includes structural wall allowances)`);
    lines.push(`- **Floor Area Ratio (FAR):** ${roomData.floorAreaRatio}`);
    lines.push(`- **Total Placed Rooms:** ${roomData.totalRoomsCount} rooms across ${roomData.floorGroups.length} floor level(s)`);
    lines.push(``);

    if (roomData.unresolvedGeometryWarnings.length > 0) {
      lines.push(`### ⚠️ Spatial Geometry Notices`);
      roomData.unresolvedGeometryWarnings.forEach((w) => lines.push(`- ${w}`));
      lines.push(``);
    }

    lines.push(`---`);
    lines.push(``);
    lines.push(`## 2. Floor-by-Floor Spatial & Room Schedules`);
    roomData.floorGroups.forEach((group) => {
      lines.push(`### ${group.floorLabel} (${group.totalFloorAreaFormatted})`);
      lines.push(`| Room ID | Room Name | Function | Dimensions | Measured Usable Area | Boundary Check | Overlap Check |`);
      lines.push(`|:---|:---|:---|:---|:---|:---|:---|`);
      group.rooms.forEach((r) => {
        lines.push(
          `| \`${r.id}\` | ${r.name} | ${r.type} | ${r.dimensionsFormatted} | **${r.areaFormatted}** | ${r.hasBoundaryViolation ? '⚠️ Violation' : '✓ Pass'} | ${r.hasOverlap ? '⚠️ Collision' : '✓ Clear'} |`
        );
      });
      lines.push(``);
    });
    lines.push(`> **MEASUREMENT DISTINCTION NOTE:** Total Measured Room Area aggregates internal clear-space dimensions between interior room faces. Gross Built-Up Area includes estimated 12% structural partition and envelope wall thicknesses. Plot Area represents the perimeter legal parcel boundary.`);
    lines.push(``);

    lines.push(`---`);
    lines.push(``);
    lines.push(`## 3. Itemized Bill of Quantities & Construction Schedule`);
    lines.push(`**Scenario:** ${costData.scenarioName} | **Target Budget:** ${formatCurrency(costData.targetBudget, project.currency)}`);
    lines.push(`**Estimated Construction Cost:** ${formatCurrency(costData.estimatedTotal, project.currency)}`);
    lines.push(`**Budget Variance:** ${formatCurrency(Math.abs(costData.budgetVariance), project.currency)} (${costData.budgetStatus})`);
    if (costData.isStale) {
      lines.push(`\n> ⚠️ **STALE WARNING:** ${costData.staleReason}`);
    }
    lines.push(``);
    lines.push(`| Code | Category | Description | Quantity | Unit | Unit Rate | Extended Cost |`);
    lines.push(`|:---|:---|:---|:---:|:---:|:---:|:---|`);
    costData.lineItems.forEach((i) => {
      lines.push(
        `| \`${i.code}\` | ${i.category} | ${i.name} | ${i.quantity} | ${i.unit} | ${formatCurrency(i.unitRate, project.currency)} | **${formatCurrency(i.extendedCost, project.currency)}** |`
      );
    });
    lines.push(``);
    lines.push(`- **Subtotal:** ${formatCurrency(costData.subtotal, project.currency)}`);
    lines.push(`- **Contingency Reserve (${costData.contingencyRatePercent}%):** ${formatCurrency(costData.contingencyAmount, project.currency)}`);
    lines.push(`- **Tax (${costData.taxRatePercent}%):** ${formatCurrency(costData.taxAmount, project.currency)}`);
    lines.push(`- **ESTIMATED TOTAL:** **${formatCurrency(costData.estimatedTotal, project.currency)}**`);
    lines.push(``);

    if (costData.phases.length > 0) {
      lines.push(`### Construction Phases & Critical Path Dependencies`);
      lines.push(`| Phase | Name | Start Date | Duration | Predecessors | Allocated Budget |`);
      lines.push(`|:---|:---|:---|:---:|:---|:---|`);
      costData.phases.forEach((p) => {
        lines.push(
          `| P-${p.phaseNumber} | ${p.name} | ${p.startDate} | ${p.durationDays}d | ${p.dependencies.join(', ') || 'None'} | ${formatCurrency(p.allocatedBudget, project.currency)} |`
        );
      });
      lines.push(``);
    }

    lines.push(`---`);
    lines.push(``);
    lines.push(`## 4. Exterior Facade & Interior Finishes Specifications`);
    lines.push(`- **Proposal:** ${designData.activeAlternativeName}`);
    lines.push(`- **Facade Style:** ${designData.facadeStyle}`);
    lines.push(`- **Exterior Materials:** ${designData.primaryMaterial} (${designData.primaryColor}) + ${designData.accentMaterial} (${designData.accentColor})`);
    lines.push(`- **Trim & Windows:** ${designData.windowStyle} with ${designData.shadingStyle} sun shading`);
    lines.push(`- **Entrance Architecture:** ${designData.entranceStyle}`);
    lines.push(``);
    lines.push(`### Room-by-Room Interior Finishes`);
    lines.push(`| Room Space | Interior Style | Wall Finish | Floor Finish | Ceiling Finish | Lighting Mood |`);
    lines.push(`|:---|:---|:---|:---|:---|:---|`);
    designData.interiorRoomSchedules.forEach((r) => {
      lines.push(
        `| ${r.roomName} | ${r.style} | ${r.wallFinish} | ${r.floorFinish} | ${r.ceilingFinish} | ${r.lightingMood} |`
      );
    });
    lines.push(``);

    lines.push(`---`);
    lines.push(``);
    lines.push(`## 5. Proof-Carrying Design & Regulatory Audit Ledger`);
    lines.push(`| Proof ID | Module | Evaluated Item | Value | Status | Formula / Method | Mandatory Review |`);
    lines.push(`|:---|:---|:---|:---|:---:|:---|:---|`);
    auditData.records.forEach((r) => {
      lines.push(
        `| \`${r.id}\` | ${r.module} | ${r.resultName} | ${String(r.resultValue)} ${r.unit && r.unit !== 'status' ? r.unit : ''} | **${r.validationStatus.toUpperCase()}** | ${r.calculationMethod} | ${r.requiredProfessionalReview} |`
      );
    });
    lines.push(``);

    lines.push(`---`);
    lines.push(``);
    lines.push(`## 6. Building Regulations Intelligence & Statutory Code Pre-Check`);
    const regSummary = evaluateProjectRegulations(project);
    lines.push(`- **Declared Jurisdiction:** ${regSummary.profile.country}, ${regSummary.profile.region} (${regSummary.profile.localAuthority})`);
    lines.push(`- **AHJ:** ${regSummary.profile.ahj}`);
    lines.push(`- **Active Rule Pack:** \`${regSummary.activeRulePack}\``);
    lines.push(`- **Compliance Overview:** **${regSummary.counts.pass} Pass**, **${regSummary.counts.conflict} Conflict(s)**, **${regSummary.counts.needsReview} Needs Review**, **${regSummary.counts.insufficientData} Missing Data**`);
    if (regSummary.isStale) {
      lines.push(`- ⚠️ **Assessment Freshness:** STALE — Re-evaluation required against latest project geometry.`);
    }
    lines.push(``);
    lines.push(`| Rule / Code Item | Clause Reference | Result | Measured | Statutory Threshold | Review Requirement |`);
    lines.push(`|:---|:---|:---:|:---|:---|:---|`);
    regSummary.evaluations.forEach((e) => {
      lines.push(
        `| \`${e.requirementId}\` | ${e.sourceVersion} | **${e.status.toUpperCase()}** | ${e.measuredValue || 'N/A'} | ${e.thresholdValue || 'N/A'} | ${e.actionNeeded} |`
      );
    });
    lines.push(``);

    lines.push(`---`);
    lines.push(``);
    lines.push(`## 7. Structural Coordination & Engineering Review`);
    lines.push(`> **ENGINEERING BOUNDARY & STATUTORY DISCLAIMER:**`);
    lines.push(`> This structural coordination review evaluates preliminary architectural geometry, reference grid alignment, and clear spans only.`);
    lines.push(`> Plotify does not calculate gravity/lateral loads, beam bending moments, or foundation designs. Stamped drawings by a licensed Professional Structural Engineer (PE/SE) are required.`);
    lines.push(``);
    const structCoord = evaluateStructuralCoordination(project);
    lines.push(`- **Framing System:** ${structCoord.summary.totalColumns > 0 ? (project.structuralCoordination?.framingSystem || 'Prescriptive Light Frame').replace(/-/g, ' ').toUpperCase() : 'Not Specified'}`);
    lines.push(`- **Structural Columns:** ${structCoord.summary.totalColumns} elements placed`);
    lines.push(`- **Max Measured Clear Span:** ${structCoord.summary.maxMeasuredSpan.toFixed(1)} ${uSuffix} (${structCoord.summary.maxSpanRoomName})`);
    lines.push(`- **Geometric Conflicts:** ${structCoord.summary.issueCounts.conflict} | **Engineering Review Required:** ${structCoord.summary.issueCounts.reviewRequired}`);
    lines.push(`- **Sign-Off Status:** ${project.structuralCoordination?.engineeringSignOff?.isSignedOff ? 'SIGNED & SEATED' : 'PENDING PROFESSIONAL ENGINEER REVIEW'}`);
    lines.push(``);
    if (structCoord.issues.length > 0) {
      lines.push(`| Issue Code | Severity | Location | Title | Status | Recommendation |`);
      lines.push(`|:---|:---|:---|:---|:---:|:---|`);
      structCoord.issues.forEach((iss) => {
        lines.push(
          `| \`${iss.issueCode}\` | **${iss.severity.toUpperCase()}** | ${iss.location.roomName || `Floor ${iss.location.floorLevel}`} | ${iss.title} | \`${iss.status}\` | ${iss.recommendation} |`
        );
      });
      lines.push(``);
    }

    lines.push(`---`);
    lines.push(``);
    lines.push(`## 8. MEP Coordination & Clash Detection Register`);
    lines.push(`> **ENGINEERING BOUNDARY & COORDINATION DISCLAIMER:**`);
    lines.push(`> Preliminary spatial clearance checks between modeled rooms, structural columns, and primary MEP distribution lines.`);
    lines.push(`> Does not calculate fluid dynamics, short-circuit currents, or replace stamped MEP engineering drawings.`);
    lines.push(``);
    const mepEval = evaluateMEPClashes(project);
    lines.push(`- **Modeled MEP Elements:** ${mepEval.summary.totalComponents} (Mech: ${mepEval.summary.componentsBySystem.mechanical}, Elec: ${mepEval.summary.componentsBySystem.electrical}, Plumb: ${mepEval.summary.componentsBySystem.plumbing})`);
    lines.push(`- **Hard Collisions:** ${mepEval.summary.clashCounts.hardClash} | **Clearance Violations:** ${mepEval.summary.clashCounts.clearanceViolation} | **Potential Conflicts:** ${mepEval.summary.clashCounts.potentialConflict}`);
    lines.push(``);
    if (mepEval.clashes.length > 0) {
      lines.push(`| Clash Code | Severity | System | Primary Element | Intersecting Element | Location | Status | Recommendation |`);
      lines.push(`|:---|:---|:---|:---|:---|:---|:---:|:---|`);
      mepEval.clashes.forEach((c) => {
        lines.push(
          `| \`${c.clashCode}\` | **${c.severity.toUpperCase()}** | ${c.primarySystem} | ${c.primaryComponentName} | ${c.intersectingElementName} | F${c.location.floorLevel} | \`${c.status}\` | ${c.recommendation} |`
        );
      });
      lines.push(``);
    }

    lines.push(`---`);
    lines.push(``);
    lines.push(`## 9. Mandatory Statutory & Professional Disclaimers`);
    lines.push(`> **IMPORTANT NOTICE:** This architectural dossier contains preliminary planning calculations, deterministic geometry audits, and cost models. Total room area represents net usable interior floor space and does not equal gross external built-up area. Cost figures are preliminary AACE Class 4/5 estimates, not binding contractor tenders. Structural safety, soil bearing capacity, seismic resistance, and emergency fire egress must be formally reviewed and stamped by a licensed Professional Engineer (PE/SE) and Registered Architect prior to construction or municipal permit filings.`);
    lines.push(``);
    lines.push(`### Professional Sign-Off Blocks`);
    lines.push(`- **Project Architect / Designer:**   _________________________ Date: ____________`);
    lines.push(`- **Structural Engineer (PE/SE):**   _________________________ Date: ____________`);
    lines.push(`- **MEP Engineer of Record (PE):**   _________________________ Date: ____________`);
    lines.push(`- **Client / Property Owner:**       _________________________ Date: ____________`);

    return lines.join('\n');
  }

  if (docType === 'project-summary') {
    const roomData = generateRoomScheduleDocumentData(project);
    const costData = generateCostReportDocumentData(project);
    const designData = generateDesignSpecDocumentData(project);
    const auditData = generateProjectEvidenceRecords(project);

    lines.push(`# PLOTIFY — ARCHITECTURAL PROJECT EXECUTIVE DOSSIER`);
    lines.push(`**Project Name:** ${project.name} | **ID:** \`${project.id}\``);
    lines.push(`**Generated:** ${nowStr}`);
    lines.push(`**Source Geometry Hash:** \`${geomHash}\``);
    lines.push(`**Status:** ${project.status} | **Building Floors:** ${project.floors}`);
    lines.push(``);
    lines.push(`---`);
    lines.push(``);
    const siteData = initializeProjectSiteContext(project);
    const uSuffix = project.unit === 'feet' ? 'ft' : 'm';

    lines.push(`## 1. Site Boundary, Orientation & Spatial Program Summary`);
    lines.push(`- **Plot Parcel Dimensions:** ${roomData.plotDimensionsFormatted}`);
    lines.push(`- **Total Plot Parcel Area:** ${roomData.plotAreaFormatted}`);
    lines.push(`- **True North Orientation:** ${siteData.northOrientationOffsetDeg}° offset from plot datum`);
    lines.push(`- **Mandatory Setbacks:** Front: ${siteData.setbacks.front}${uSuffix}, Rear: ${siteData.setbacks.rear}${uSuffix}, Left: ${siteData.setbacks.sideLeft}${uSuffix}, Right: ${siteData.setbacks.sideRight}${uSuffix}`);
    lines.push(`- **Topography & Grading:** ${siteData.slope.replace(/-/g, ' ')} (fall: ${siteData.slopeDirection})`);
    if (siteData.obstacles.length > 0) {
      lines.push(`- **Preserved Site Obstacles:** ${siteData.obstacles.map((o) => `${o.name} (${o.type})`).join(', ')}`);
    }
    lines.push(`- **Ground Floor Footprint:** ${roomData.groundFloorFootprintFormatted} (${roomData.groundCoveragePercent}% ground coverage)`);
    lines.push(`- **Net Usable Room Area:** ${roomData.totalMeasuredRoomAreaFormatted}`);
    lines.push(`- **Estimated Gross Built-Up Area:** ${roomData.estimatedGrossBuiltAreaFormatted} (includes structural wall allowances)`);
    lines.push(`- **Floor Area Ratio (FAR):** ${roomData.floorAreaRatio}`);
    lines.push(`- **Total Placed Rooms:** ${roomData.totalRoomsCount} rooms across ${roomData.floorGroups.length} floor level(s)`);
    lines.push(``);

    if (roomData.unresolvedGeometryWarnings.length > 0) {
      lines.push(`### ⚠️ Spatial Geometry Notices`);
      roomData.unresolvedGeometryWarnings.forEach((w) => lines.push(`- ${w}`));
      lines.push(``);
    }

    lines.push(`---`);
    lines.push(``);
    lines.push(`## 2. Active Design Concept Specifications`);
    lines.push(`- **Design Proposal:** ${designData.activeAlternativeName}`);
    lines.push(`- **Facade Style:** ${designData.facadeStyle}`);
    lines.push(`- **Exterior Materials:** ${designData.primaryMaterial} (Primary) + ${designData.accentMaterial} (Accent)`);
    lines.push(`- **Fenestration & Glazing:** ${designData.windowStyle} with ${designData.shadingStyle} sun-shading`);
    lines.push(`- **Entrance Architecture:** ${designData.entranceStyle}`);
    lines.push(``);

    lines.push(`---`);
    lines.push(``);
    lines.push(`## 3. Financial & Construction Overview`);
    lines.push(`- **Active Scenario:** ${costData.scenarioName}`);
    lines.push(`- **Target Budget:** ${formatCurrency(costData.targetBudget, project.currency)}`);
    lines.push(`- **Estimated Construction Cost:** ${formatCurrency(costData.estimatedTotal, project.currency)}`);
    lines.push(`- **Budget Variance:** ${formatCurrency(Math.abs(costData.budgetVariance), project.currency)} (${costData.budgetStatus === 'within-budget' ? 'Under Target Budget' : 'Exceeds Target Budget'})`);
    lines.push(`- **Contingency Reserve (${costData.contingencyRatePercent}%):** ${formatCurrency(costData.contingencyAmount, project.currency)}`);
    lines.push(`- **Status:** ${costData.isStale ? '⚠️ STALE (Geometry modified since calculation)' : 'Verified with current 2D plan'}`);
    lines.push(``);

    lines.push(`---`);
    lines.push(``);
    lines.push(`## 4. Proof-Carrying Evidence Audit Summary`);
    lines.push(`- **Total Tracked Rules:** ${auditData.totalRecords}`);
    lines.push(`- **Passed Validations:** ${auditData.passCount}`);
    lines.push(`- **Conflicts Detected:** ${auditData.conflictCount}`);
    lines.push(`- **Stale Results:** ${auditData.staleCount}`);
    lines.push(`- **Engineering Disclosures (Not Assessed):** ${auditData.notAssessedCount}`);
    lines.push(``);

    lines.push(`---`);
    lines.push(``);
    lines.push(`## 5. Mandatory Statutory & Professional Disclaimers`);
    lines.push(`> **IMPORTANT NOTICE:** This architectural dossier contains preliminary planning calculations, deterministic geometry audits, and cost models. Total room area represents net usable interior floor space and does not equal gross external built-up area. Cost figures are preliminary AACE Class 4/5 estimates, not binding contractor tenders. Structural safety, soil bearing capacity, seismic resistance, and emergency fire egress must be formally reviewed and stamped by a licensed Professional Engineer (PE/SE) and Registered Architect prior to construction or municipal permit filings.`);

    return lines.join('\n');
  }

  if (docType === 'room-schedule') {
    const roomData = generateRoomScheduleDocumentData(project);
    lines.push(`# PLOTIFY — FLOOR-PLAN SPATIAL & ROOM SCHEDULE`);
    lines.push(`**Project:** ${project.name} | **ID:** \`${project.id}\``);
    lines.push(`**Plot Boundary:** ${roomData.plotDimensionsFormatted} (${roomData.plotAreaFormatted})`);
    lines.push(`**Net Measured Room Usable Area:** ${roomData.totalMeasuredRoomAreaFormatted}`);
    lines.push(`**Estimated Gross Built Area:** ${roomData.estimatedGrossBuiltAreaFormatted}`);
    lines.push(`**Ground Footprint:** ${roomData.groundFloorFootprintFormatted} (${roomData.groundCoveragePercent}% coverage)`);
    lines.push(``);

    roomData.floorGroups.forEach((group) => {
      lines.push(`### ${group.floorLabel} (${group.totalFloorAreaFormatted})`);
      lines.push(`| Room ID | Room Name | Function | Dimensions | Measured Usable Area | Boundary Check | Overlap Check |`);
      lines.push(`|:---|:---|:---|:---|:---|:---|:---|`);
      group.rooms.forEach((r) => {
        lines.push(
          `| \`${r.id}\` | ${r.name} | ${r.type} | ${r.dimensionsFormatted} | **${r.areaFormatted}** | ${r.hasBoundaryViolation ? '⚠️ Violation' : '✓ Pass'} | ${r.hasOverlap ? '⚠️ Collision' : '✓ Clear'} |`
        );
      });
      lines.push(``);
    });

    lines.push(`> **MEASUREMENT DISTINCTION NOTE:** Total Measured Room Area aggregates internal clear-space dimensions between interior room faces. Gross Built-Up Area includes estimated 12% structural partition and envelope wall thicknesses. Plot Area represents the perimeter legal parcel boundary.`);

    return lines.join('\n');
  }

  if (docType === 'cost-estimate') {
    const cost = generateCostReportDocumentData(project);
    lines.push(`# PLOTIFY — BILL OF QUANTITIES & PRELIMINARY ESTIMATE`);
    lines.push(`**Project:** ${project.name} | **Scenario:** ${cost.scenarioName}`);
    lines.push(`**Target Budget:** ${formatCurrency(cost.targetBudget, project.currency)}`);
    lines.push(`**Estimated Grand Total:** ${formatCurrency(cost.estimatedTotal, project.currency)}`);
    lines.push(`**Variance:** ${formatCurrency(Math.abs(cost.budgetVariance), project.currency)} (${cost.budgetStatus})`);
    if (cost.isStale) {
      lines.push(`\n> ⚠️ **STALE WARNING:** ${cost.staleReason}`);
    }
    lines.push(``);
    lines.push(`| Code | Category | Description | Quantity | Unit | Unit Rate | Extended Cost |`);
    lines.push(`|:---|:---|:---|:---:|:---:|:---:|:---|`);
    cost.lineItems.forEach((i) => {
      lines.push(
        `| \`${i.code}\` | ${i.category} | ${i.name} | ${i.quantity} | ${i.unit} | ${formatCurrency(i.unitRate, project.currency)} | **${formatCurrency(i.extendedCost, project.currency)}** |`
      );
    });
    lines.push(``);
    lines.push(`- **Subtotal:** ${formatCurrency(cost.subtotal, project.currency)}`);
    lines.push(`- **Contingency Reserve (${cost.contingencyRatePercent}%):** ${formatCurrency(cost.contingencyAmount, project.currency)}`);
    lines.push(`- **Tax (${cost.taxRatePercent}%):** ${formatCurrency(cost.taxAmount, project.currency)}`);
    lines.push(`- **ESTIMATED TOTAL:** **${formatCurrency(cost.estimatedTotal, project.currency)}**`);
    lines.push(``);
    lines.push(`> **ESTIMATE DISCLAIMER:** Preliminary planning estimate (AACE Class 4/5). Does not constitute a guaranteed maximum price or contractor lump-sum tender bid.`);

    return lines.join('\n');
  }

  if (docType === 'design-specification') {
    const design = generateDesignSpecDocumentData(project);
    lines.push(`# PLOTIFY — EXTERIOR FACADE & INTERIOR FINISHES SPECIFICATION`);
    lines.push(`**Project:** ${project.name} | **Active Concept:** ${design.activeAlternativeName}`);
    lines.push(``);
    lines.push(`## 1. Exterior Facade Specification`);
    lines.push(`- **Architectural Style:** ${design.facadeStyle}`);
    lines.push(`- **Primary Cladding:** ${design.primaryMaterial} (${design.primaryColor})`);
    lines.push(`- **Accent Cladding:** ${design.accentMaterial} (${design.accentColor})`);
    lines.push(`- **Window Trim:** ${design.windowTrimColor} | **Roof Trim:** ${design.roofTrimColor}`);
    lines.push(`- **Window Fenestration:** ${design.windowStyle}`);
    lines.push(`- **Entrance Architecture:** ${design.entranceStyle}`);
    lines.push(``);
    lines.push(`## 2. Room-by-Room Interior Finishes`);
    lines.push(`| Room Name | Style | Wall Finish | Floor Finish | Ceiling Finish | Lighting Mood |`);
    lines.push(`|:---|:---|:---|:---|:---|:---|`);
    design.interiorRoomSchedules.forEach((r) => {
      lines.push(
        `| ${r.roomName} | ${r.style} | ${r.wallFinish} | ${r.floorFinish} | ${r.ceilingFinish} | ${r.lightingMood} |`
      );
    });
    lines.push(``);
    lines.push(`> **VISUAL CONCEPT NOTICE:** Finishes and material palettes represent architectural aesthetic direction. Physical product procurement requires approved contractor finish submittals.`);

    return lines.join('\n');
  }

  if (docType === 'evidence-audit') {
    return generateAuditMarkdownReport(generateProjectEvidenceRecords(project));
  }

  return `# PLOTIFY REPORT — ${project.name}\nGenerated: ${nowStr}`;
}

/**
 * Generates an architectural brief and space program CSV schedule
 */
export function generateBriefSpaceProgramCSV(project: Project): string {
  const brief = initializeProjectBrief(project);
  const comparisons = compareBriefWithFloorPlan(project, brief);
  const unitAreaSuffix = project.unit === 'feet' ? 'sq ft' : 'm²';

  const rows: string[][] = [
    [
      'Space ID',
      'Space Name',
      'Category',
      'Priority',
      'Required Qty',
      `Target Area Each (${unitAreaSuffix})`,
      `Target Total Area (${unitAreaSuffix})`,
      'Placed Qty',
      `Placed Total Area (${unitAreaSuffix})`,
      `Area Delta (${unitAreaSuffix})`,
      'Variance %',
      'Placement Status',
      'Floor Preference',
      'Privacy Level',
      'Natural Light',
      'Plumbing',
      'Wheelchair Accessible',
      'Notes',
    ],
  ];

  brief.spaces.forEach((sp) => {
    const comp = comparisons.find((c) => c.spaceRequirementId === sp.id);
    rows.push([
      sp.id,
      `"${sp.name.replace(/"/g, '""')}"`,
      sp.category,
      sp.priority.toUpperCase(),
      String(sp.quantity || 1),
      String(sp.targetArea),
      String((sp.quantity || 1) * sp.targetArea),
      String(comp?.placedQuantity || 0),
      String(comp?.actualPlacedTotalArea || 0),
      String(comp?.areaDelta || 0),
      `${comp?.areaVariancePercent || 0}%`,
      (comp?.placementStatus || 'unplaced').toUpperCase(),
      String(sp.floorPreference ?? 'any'),
      sp.privacyLevel,
      sp.naturalLightRequired ? 'Yes' : 'No',
      sp.plumbingRequired ? 'Yes' : 'No',
      sp.wheelchairAccessible ? 'Yes' : 'No',
      `"${(sp.notes || '').replace(/"/g, '""')}"`,
    ]);
  });

  return rows.map((r) => r.join(',')).join('\n');
}

/**
 * Generates comprehensive publication-ready Markdown for the Architectural Brief & Space Program
 */
export function generateBriefDocumentMarkdown(project: Project): string {
  const brief = initializeProjectBrief(project);
  const summary = calculateSpaceProgramSummary(project, brief);
  const comparisons = compareBriefWithFloorPlan(project, brief);
  const notices = validateBrief(project, brief);
  const uSuffix = project.unit === 'feet' ? 'sq ft' : 'm²';

  const lines: string[] = [];
  lines.push(`# PLOTIFY — ARCHITECTURAL BRIEF & SPACE PROGRAM SPECIFICATION`);
  lines.push(`**Project Name:** ${project.name} | **Project ID:** \`${project.id}\``);
  lines.push(`**Brief Version:** ${brief.version} | **Status:** ${brief.approvalStatus.toUpperCase()}`);
  lines.push(`**Last Updated:** ${brief.lastUpdated}`);
  lines.push(`**Building Use Classification:** ${brief.objectives.buildingUse.toUpperCase()}`);
  lines.push(``);
  lines.push(`---`);
  lines.push(``);

  lines.push(`## 1. Project Objectives & Intended Users`);
  lines.push(`- **Primary Purpose:** ${brief.objectives.primaryPurpose}`);
  lines.push(`- **Intended Users:** ${brief.objectives.intendedUsers}`);
  lines.push(`- **Key Functional Activities:** ${brief.objectives.mainActivities}`);
  lines.push(`- **Desired Architectural Outcomes:** ${brief.objectives.desiredOutcomes}`);
  lines.push(`- **Design Life Expectancy:** ${brief.objectives.designLifeYears || 50} years`);
  lines.push(`- **Project Stage:** ${brief.objectives.projectStage}`);
  lines.push(``);

  lines.push(`## 2. Occupancy Profile & Usage Patterns`);
  lines.push(`- **Regular Occupants:** ${brief.occupancy.regularOccupants} people`);
  lines.push(`- **Occasional Guests / Visitors:** ${brief.occupancy.occasionalVisitors} people`);
  lines.push(`- **Occupancy Pattern:** ${brief.occupancy.occupancyPattern}`);
  lines.push(`- **User-Group Specific Needs:** ${brief.occupancy.userGroupNeeds}`);
  lines.push(`- **Accessibility Requirements:** ${brief.occupancy.accessibilityNotes}`);
  lines.push(`- **Future Adaptability / Expansion:** ${brief.occupancy.futureExpansionNeeds}`);
  lines.push(``);

  lines.push(`## 3. Design Preferences & Constraints`);
  lines.push(`- **Spatial Character:** ${brief.preferences.spatialCharacter}`);
  lines.push(`- **Indoor-Outdoor Connection:** ${brief.preferences.indoorOutdoorRelationship}`);
  lines.push(`- **Natural Daylight Priorities:** ${brief.preferences.naturalLightPriorities}`);
  lines.push(`- **Storage Priorities:** ${brief.preferences.storagePriorities}`);
  lines.push(`- **Circulation Priorities:** ${brief.preferences.circulationPreferences}`);
  lines.push(`- **Material Tone:** ${brief.preferences.materialPreferences}`);
  lines.push(`- **Site Constraints Summary:** ${brief.constraints.siteRestrictionsSummary}`);
  lines.push(``);

  lines.push(`## 4. Space Program Totals & Plot Capacity Analysis`);
  lines.push(`| Metric | Program Value | Notes / Baseline |`);
  lines.push(`|:---|:---:|:---|`);
  lines.push(`| **Total Target Net Area** | **${summary.totalTargetNetArea} ${uSuffix}** | Sum of programmed usable spaces |`);
  lines.push(`| **Mandatory Space Area** | ${summary.mandatoryTargetArea} ${uSuffix} | ${summary.mandatorySpaceCount} mandatory space units |`);
  lines.push(`| **High Priority Area** | ${summary.highPriorityTargetArea} ${uSuffix} | Strong client preference |`);
  lines.push(`| **Circulation & Wall Factor** | ${summary.circulationWallAllowancePercent}% | Added for walls, shafts & corridors |`);
  lines.push(`| **Estimated Gross Internal Area (GIA)** | **${summary.estimatedGrossInternalArea} ${uSuffix}** | Required total building enclosure |`);
  lines.push(`| **Available Plot Area** | ${summary.availablePlotArea} ${uSuffix} | Legal boundary parcel area |`);
  lines.push(`| **Allowable Gross Building Area** | ${summary.maxAllowableGrossArea || 'N/A'} ${uSuffix} | Derived from ${project.floors} floors & ground coverage |`);
  lines.push(`| **Feasibility / Fit Status** | **${summary.footprintFitStatus.toUpperCase()}** | ${summary.footprintFitStatus === 'fits' ? 'Program fits within allowable building envelope' : 'Program exceeds allowable gross capacity'} |`);
  lines.push(``);

  lines.push(`## 5. Itemized Space Program Schedule`);
  lines.push(`| Space Name | Category | Priority | Target Each | Qty | Target Total | Placed Qty | Placed Area | Status |`);
  lines.push(`|:---|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|`);
  comparisons.forEach((c) => {
    lines.push(
      `| ${c.name} | ${c.category} | \`${c.priority.toUpperCase()}\` | ${c.targetAreaEach} ${uSuffix} | ${c.requiredQuantity} | **${c.targetTotalArea} ${uSuffix}** | ${c.placedQuantity} | ${c.actualPlacedTotalArea} ${uSuffix} | ${c.placementStatus.toUpperCase()} |`
    );
  });
  lines.push(``);

  if (notices.length > 0) {
    lines.push(`## 6. Program Validation & Verification Notices`);
    notices.forEach((n) => {
      lines.push(`- **[${n.severity.toUpperCase()}] ${n.title}:** ${n.message}`);
      lines.push(`  *Remedy:* ${n.suggestedAction}`);
    });
    lines.push(``);
  }

  lines.push(`---`);
  lines.push(``);
  lines.push(`## 7. Professional Governance Sign-Off`);
  lines.push(`- **Lead Architectural Designer:** _________________________ Date: ____________`);
  lines.push(`- **Client Representative:**       _________________________ Date: ____________`);
  lines.push(``);
  lines.push(`> **STATUTORY DISCLAIMER:** This space program represents pre-design architectural planning targets. Actual constructed dimensions will be governed by approved structural engineering calculations, local fire egress requirements, and verified site boundaries.`);

  return lines.join('\n');
}

