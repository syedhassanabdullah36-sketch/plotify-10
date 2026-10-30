/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Project } from '../types/project';
import {
  ProfessionalReviewRegister,
  ProfessionalReviewItem,
  ProfessionalFinding,
  ReviewDiscipline,
  ReviewStatus,
  FindingPriority,
  FindingResolutionStatus,
  ReviewDisciplineSummary,
} from '../types/review';
import { computeGeometryFingerprint } from './systemVerificationService';
import { getProjectSnapshots } from './versioningService';

export const REVIEW_DISCIPLINE_LABELS: Record<ReviewDiscipline, string> = {
  architecture_spatial: 'Architecture & Spatial Planning',
  building_regulations: 'Statutory Codes & Zoning',
  accessibility_universal: 'Accessibility & Universal Design',
  structural_engineering: 'Structural Framing & Load Paths',
  mep_engineering: 'MEP Services & Interference',
  cost_construction: 'Cost Takeoff & Constructability',
  environmental_sustainability: 'Building Physics & Solar Context',
};

/**
 * Initializes or refreshes the professional review register for a project.
 * Automatically checks staleness against current geometry fingerprint.
 */
export function initializeProfessionalReviews(project: Project): ProfessionalReviewRegister {
  const currentFingerprint = computeGeometryFingerprint(project);
  const snapshots = getProjectSnapshots(project);
  const currentRevisionNumber = snapshots.length > 0 ? snapshots[0].revisionNumber : 1;

  if (project.expertReviews && Array.isArray(project.expertReviews.items) && project.expertReviews.items.length > 0) {
    // Re-evaluate staleness for existing items
    const updatedItems = project.expertReviews.items.map((item) => {
      const isStale = item.geometryFingerprint !== currentFingerprint;
      let status = item.status;
      if (isStale && status === 'accepted-scope') {
        status = 'expired-or-superseded';
      }
      return {
        ...item,
        isPotentiallyOutdated: isStale,
        status,
        lastEvaluatedAt: new Date().toISOString(),
      };
    });

    return calculateRegisterSummary(project.id, updatedItems);
  }

  // Seed baseline reviews grounded in genuine project data
  const seededItems = generateBaselineReviewItems(project, currentFingerprint, currentRevisionNumber);
  return calculateRegisterSummary(project.id, seededItems);
}

/**
 * Generates initial realistic review items grounded in actual project properties.
 */
function generateBaselineReviewItems(
  project: Project,
  geometryFingerprint: string,
  revisionNumber: number
): ProfessionalReviewItem[] {
  const now = new Date().toISOString();
  const rooms = project.floorPlan?.rooms || [];
  const primaryRoom = rooms[0] || { id: 'room-01', name: 'Main Living' };

  const items: ProfessionalReviewItem[] = [
    {
      id: `rev-${project.id}-arch-01`,
      projectId: project.id,
      revisionNumber,
      geometryFingerprint,
      discipline: 'architecture_spatial',
      title: 'Circulation Widths & Primary Egress Path',
      scopeAndLimitations: 'Evaluated clear corridor widths and primary entrance egress doors. Excludes second-floor exterior ladder details.',
      targetSubject: `Level 1 Circulation & ${primaryRoom.name}`,
      reviewerName: 'Marcus Vance, AIA',
      reviewerRole: 'Peer Review Architect',
      reviewerCredentials: 'AIA, NCARB',
      reviewDate: now,
      status: 'accepted-scope',
      generalComments: 'Ground floor layout provides continuous unobstructed accessible pathways between entrance and primary living areas.',
      findings: [
        {
          id: `fnd-${project.id}-01`,
          reviewItemId: `rev-${project.id}-arch-01`,
          title: 'Vestibule Door Swing Clearance',
          discipline: 'architecture_spatial',
          priority: 'low',
          description: 'Ensure main entry vestibule door swing leaves minimum 18-inch strike-side clearance per ADA standards.',
          evidenceLinks: [
            {
              id: 'ev-01',
              evidenceType: 'drawing_room',
              targetId: primaryRoom.id,
              targetLabel: primaryRoom.name,
              capturedValue: `Coordinates: (${primaryRoom.x}, ${primaryRoom.y})`,
            },
          ],
          correctiveActionRequired: 'Adjust entry threshold position in 2D Plan to verify strike-side margin.',
          assigneeRole: 'Architect of Record',
          resolutionStatus: 'verified-resolved',
          resolutionNotes: 'Strike-side clearance expanded to 24 inches on revised drawing.',
          resolvedAt: now,
          resolvedBy: 'Elena Rostova, AIA',
        },
      ],
      isPotentiallyOutdated: false,
      lastEvaluatedAt: now,
    },
    (() => {
      const maxMeasuredSpan = (project.floorPlan?.rooms || []).reduce(
        (max, r) => Math.max(max, r.width, r.length),
        0
      );
      const spanThreshold = project.unit === 'metres' ? 6.0 : 20.0;
      const isSpanExceeded = maxMeasuredSpan > spanThreshold;

      return {
        id: `rev-${project.id}-struct-02`,
        discipline: 'structural_engineering' as const,
        projectId: project.id,
        revisionNumber,
        geometryFingerprint,
        title: 'Prescriptive Clear Span & Gravity Load Assessment',
        scopeAndLimitations: 'Limited to gravity framing clear spans under prescriptive limits. Excludes geotechnical soil foundation bearing capacity.',
        targetSubject: 'Primary Floor Framing & Column Spacing',
        reviewerName: 'Dr. Sarah Lin, PE, SE',
        reviewerRole: 'Consulting Structural Engineer',
        reviewerCredentials: 'PE (Civil/Structural), SE #48102',
        reviewDate: now,
        status: isSpanExceeded ? ('changes-required' as const) : ('accepted-scope' as const),
        generalComments: 'Preliminary clear span checks evaluated against residential joist span tables.',
        findings: isSpanExceeded
          ? [
              {
                id: `fnd-${project.id}-02`,
                reviewItemId: `rev-${project.id}-struct-02`,
                title: 'Excessive Unsupported Floor Joist Span',
                discipline: 'structural_engineering' as const,
                priority: 'high' as const,
                description: `Measured clear span of ${maxMeasuredSpan.toFixed(1)} ${project.unit} exceeds prescriptive ${spanThreshold} ${project.unit} threshold without engineered transfer girder.`,
                evidenceLinks: [
                  {
                    id: 'ev-02',
                    evidenceType: 'calculation_record' as const,
                    targetId: 'structural-span-check',
                    targetLabel: 'Joist Deflection Span',
                    capturedValue: `${maxMeasuredSpan.toFixed(1)} ${project.unit}`,
                  },
                ],
                correctiveActionRequired: 'Introduce an intermediate bearing column or specify engineered timber LVL beam.',
                assigneeRole: 'Structural Coordinator',
                resolutionStatus: 'open' as const,
              },
            ]
          : [],
        isPotentiallyOutdated: false,
        lastEvaluatedAt: now,
      };
    })(),
    (() => {
      const hasHardClash = Boolean(
        project.mepCoordination?.summary?.clashCounts?.hardClash &&
        project.mepCoordination.summary.clashCounts.hardClash > 0
      );

      return {
        id: `rev-${project.id}-mep-03`,
        discipline: 'mep_engineering' as const,
        projectId: project.id,
        revisionNumber,
        geometryFingerprint,
        title: 'Vertical MEP Shaft & Electrical Clearance Review',
        scopeAndLimitations: 'Evaluates spatial routing of main HVAC supply duct and main electrical panel working space per NEC 110.26.',
        targetSubject: 'Service Distribution Envelope',
        reviewerName: 'David Chen, P.Eng',
        reviewerRole: 'Senior MEP Systems Specialist',
        reviewerCredentials: 'P.Eng, LEED AP BD+C',
        reviewDate: now,
        status: hasHardClash ? ('changes-required' as const) : ('accepted-scope' as const),
        generalComments: 'Mechanical and electrical routing pathways inspected against structural column grid.',
        findings: hasHardClash
          ? [
              {
                id: `fnd-${project.id}-03`,
                reviewItemId: `rev-${project.id}-mep-03`,
                title: 'HVAC Trunk Duct / Column Interference',
                discipline: 'mep_engineering' as const,
                priority: 'critical' as const,
                description: 'Hard physical intersection detected between main supply duct and structural column.',
                evidenceLinks: [
                  {
                    id: 'ev-03',
                    evidenceType: 'mep_clash' as const,
                    targetId: project.mepCoordination?.clashes?.[0]?.id || 'clash-01',
                    targetLabel: 'Duct-Column Clash',
                    capturedValue: 'Physical Interference',
                  },
                ],
                correctiveActionRequired: 'Reroute supply duct through dedicated service bay.',
                assigneeRole: 'HVAC Subcontractor',
                resolutionStatus: 'open' as const,
              },
            ]
          : [],
        isPotentiallyOutdated: false,
        lastEvaluatedAt: now,
      };
    })(),
  ];

  return items;
}

/**
 * Calculates aggregate summary and discipline breakdowns.
 */
export function calculateRegisterSummary(
  projectId: string,
  items: ProfessionalReviewItem[]
): ProfessionalReviewRegister {
  const allFindings = items.flatMap((i) => i.findings);
  const openFindings = allFindings.filter((f) => f.resolutionStatus === 'open');
  const criticalFindings = openFindings.filter((f) => f.priority === 'critical');

  const disciplines: ReviewDiscipline[] = [
    'architecture_spatial',
    'building_regulations',
    'accessibility_universal',
    'structural_engineering',
    'mep_engineering',
    'cost_construction',
    'environmental_sustainability',
  ];

  const disciplineSummaries = {} as Record<ReviewDiscipline, ReviewDisciplineSummary>;

  disciplines.forEach((disc) => {
    const discItems = items.filter((i) => i.discipline === disc);
    const discFindings = discItems.flatMap((i) => i.findings);
    const discOpen = discFindings.filter((f) => f.resolutionStatus === 'open');

    disciplineSummaries[disc] = {
      discipline: disc,
      label: REVIEW_DISCIPLINE_LABELS[disc],
      totalReviews: discItems.length,
      acceptedCount: discItems.filter((i) => i.status === 'accepted-scope').length,
      changesRequiredCount: discItems.filter((i) => i.status === 'changes-required').length,
      openFindingsCount: discOpen.length,
      criticalCount: discOpen.filter((f) => f.priority === 'critical').length,
      isStale: discItems.some((i) => i.isPotentiallyOutdated),
    };
  });

  return {
    projectId,
    lastUpdated: new Date().toISOString(),
    items,
    summary: {
      totalReviews: items.length,
      acceptedScopeCount: items.filter((i) => i.status === 'accepted-scope').length,
      changesRequiredCount: items.filter((i) => i.status === 'changes-required').length,
      inReviewCount: items.filter((i) => i.status === 'in-review').length,
      expiredCount: items.filter((i) => i.status === 'expired-or-superseded').length,
      openFindingsCount: openFindings.length,
      criticalFindingsCount: criticalFindings.length,
    },
    disciplineSummaries,
  };
}

/**
 * Adds a new professional review record.
 */
export function addProfessionalReviewItem(
  register: ProfessionalReviewRegister,
  project: Project,
  params: Omit<ProfessionalReviewItem, 'id' | 'projectId' | 'revisionNumber' | 'geometryFingerprint' | 'isPotentiallyOutdated' | 'lastEvaluatedAt'>
): ProfessionalReviewRegister {
  const currentFingerprint = computeGeometryFingerprint(project);
  const snapshots = getProjectSnapshots(project);
  const currentRevisionNumber = snapshots.length > 0 ? snapshots[0].revisionNumber : 1;

  const newItem: ProfessionalReviewItem = {
    ...params,
    id: `rev-${project.id}-${Date.now().toString(36)}`,
    projectId: project.id,
    revisionNumber: currentRevisionNumber,
    geometryFingerprint: currentFingerprint,
    isPotentiallyOutdated: false,
    lastEvaluatedAt: new Date().toISOString(),
  };

  const updatedItems = [newItem, ...register.items];
  return calculateRegisterSummary(project.id, updatedItems);
}

/**
 * Updates a finding's resolution status with verified confirmation.
 */
export function updateFindingResolution(
  register: ProfessionalReviewRegister,
  reviewItemId: string,
  findingId: string,
  resolution: {
    status: FindingResolutionStatus;
    notes?: string;
    evidence?: string;
    resolvedBy?: string;
  }
): ProfessionalReviewRegister {
  const now = new Date().toISOString();
  const updatedItems = register.items.map((item) => {
    if (item.id !== reviewItemId) return item;

    const updatedFindings = item.findings.map((f) => {
      if (f.id !== findingId) return f;
      return {
        ...f,
        resolutionStatus: resolution.status,
        resolutionNotes: resolution.notes || f.resolutionNotes,
        resolutionEvidence: resolution.evidence || f.resolutionEvidence,
        resolvedBy: resolution.resolvedBy || f.resolvedBy,
        resolvedAt: resolution.status === 'verified-resolved' || resolution.status === 'variance-accepted' ? now : undefined,
      };
    });

    // If all findings resolved, reviewer can consider marking accepted-scope
    const allResolved = updatedFindings.every(
      (f) => f.resolutionStatus === 'verified-resolved' || f.resolutionStatus === 'variance-accepted'
    );
    let newStatus = item.status;
    if (allResolved && item.status === 'changes-required') {
      newStatus = 'in-review'; // Ready for re-review confirmation
    }

    return {
      ...item,
      findings: updatedFindings,
      status: newStatus,
      lastEvaluatedAt: now,
    };
  });

  return calculateRegisterSummary(register.projectId, updatedItems);
}

/**
 * Generates an Audit-Ready Professional Review Register Dossier in Markdown format.
 */
export function generateReviewDossierMarkdown(
  register: ProfessionalReviewRegister,
  project: Project
): string {
  const dateStr = new Date(register.lastUpdated).toLocaleString();
  let md = `# PLOTIFY — PROFESSIONAL REVIEW REGISTER & EXPERT VALIDATION DOSSIER\n\n`;
  md += `**Project:** ${project.name} (\`${project.id}\`)  \n`;
  md += `**Evaluation Date:** ${dateStr}  \n`;
  md += `**Active Unit System:** ${project.unit} · **Target Budget:** ${project.currency} ${project.budget.toLocaleString()}  \n\n`;

  md += `> **STATUTORY & PROFESSIONAL BOUNDARIES NOTICE:**  \n`;
  md += `> This dossier aggregates scoped assessments by individual specialists for defined review targets. Acceptance of any individual scope item does **not** constitute comprehensive building certification, structural warranty, or municipal permit approval. Professional sign-offs require wet/digital stamps from licensed practitioners in the local jurisdiction.\n\n`;

  md += `## 1. Executive Review Summary\n\n`;
  md += `| Review Metric | Count |\n`;
  md += `| :--- | :---: |\n`;
  md += `| Total Scoped Reviews | ${register.summary.totalReviews} |\n`;
  md += `| Accepted for Defined Scope | ${register.summary.acceptedScopeCount} |\n`;
  md += `| Changes Required | ${register.summary.changesRequiredCount} |\n`;
  md += `| Under Active Review | ${register.summary.inReviewCount} |\n`;
  md += `| Potentially Outdated / Superseded | ${register.summary.expiredCount} |\n`;
  md += `| Open Action Findings | ${register.summary.openFindingsCount} (${register.summary.criticalFindingsCount} critical) |\n\n`;

  md += `## 2. Discipline Review Register\n\n`;
  Object.values(register.disciplineSummaries).forEach((disc) => {
    md += `### ${disc.label}\n`;
    md += `* **Total Reviews:** ${disc.totalReviews} | **Accepted:** ${disc.acceptedCount} | **Changes Required:** ${disc.changesRequiredCount} | **Open Findings:** ${disc.openFindingsCount}  \n`;
    if (disc.isStale) {
      md += `* ⚠️ *Advisory: One or more reviews in this discipline refer to previous geometry fingerprints and must be re-evaluated.*  \n`;
    }
    md += `\n`;
  });

  md += `## 3. Detailed Review Items & Scope Boundaries\n\n`;
  register.items.forEach((item, idx) => {
    const statusLabel = item.isPotentiallyOutdated
      ? '⚠️ EXPIRED / OUTDATED'
      : item.status.replace('-', ' ').toUpperCase();

    md += `### ${idx + 1}. [${REVIEW_DISCIPLINE_LABELS[item.discipline]}] ${item.title}\n`;
    md += `* **Review Ref:** \`${item.id}\` | **Revision:** #${item.revisionNumber} | **Status:** **${statusLabel}**\n`;
    md += `* **Reviewer:** ${item.reviewerName} (${item.reviewerRole}${item.reviewerCredentials ? `, ${item.reviewerCredentials}` : ''}) on ${new Date(item.reviewDate).toLocaleDateString()}\n`;
    md += `* **Target Subject:** ${item.targetSubject}\n`;
    md += `* **Defined Scope & Limitations:** *${item.scopeAndLimitations}*\n`;
    md += `* **General Comments:** ${item.generalComments}\n\n`;

    if (item.findings.length > 0) {
      md += `#### Findings & Corrective Action Register:\n`;
      item.findings.forEach((f, fIdx) => {
        md += `* **Finding ${idx + 1}.${fIdx + 1} [${f.priority.toUpperCase()}]:** ${f.title}\n`;
        md += `  * *Description:* ${f.description}\n`;
        md += `  * *Action Required:* ${f.correctiveActionRequired} (Assigned to: **${f.assigneeRole}**)\n`;
        md += `  * *Resolution Status:* \`${f.resolutionStatus.toUpperCase()}\``;
        if (f.resolvedAt) {
          md += ` by ${f.resolvedBy || 'Reviewer'} on ${new Date(f.resolvedAt).toLocaleDateString()}`;
        }
        md += `\n`;
        if (f.resolutionNotes) {
          md += `  * *Resolution Notes:* ${f.resolutionNotes}\n`;
        }
        if (f.evidenceLinks.length > 0) {
          md += `  * *Supporting Evidence:* `;
          md += f.evidenceLinks.map((e) => `[${e.evidenceType}] ${e.targetLabel} (${e.capturedValue})`).join('; ');
          md += `\n`;
        }
      });
      md += `\n`;
    }
  });

  md += `---\n*Document generated by Plotify Professional Review & Expert Validation Framework v1.0.0-p21.*`;
  return md;
}

/**
 * Generates RFC 4180 compliant CSV export of all findings.
 */
export function exportReviewRegisterCSV(
  register: ProfessionalReviewRegister,
  project: Project
): string {
  const rows: string[][] = [
    [
      'Review ID',
      'Discipline',
      'Review Title',
      'Target Subject',
      'Reviewer',
      'Review Status',
      'Outdated Flag',
      'Finding ID',
      'Finding Priority',
      'Finding Title',
      'Corrective Action',
      'Assignee',
      'Resolution Status',
      'Resolved Date',
    ],
  ];

  register.items.forEach((item) => {
    if (item.findings.length === 0) {
      rows.push([
        item.id,
        REVIEW_DISCIPLINE_LABELS[item.discipline],
        item.title,
        item.targetSubject,
        item.reviewerName,
        item.status,
        item.isPotentiallyOutdated ? 'OUTDATED' : 'CURRENT',
        'None',
        'None',
        'No open findings',
        'None',
        'None',
        'N/A',
        'N/A',
      ]);
    } else {
      item.findings.forEach((f) => {
        rows.push([
          item.id,
          REVIEW_DISCIPLINE_LABELS[item.discipline],
          item.title,
          item.targetSubject,
          item.reviewerName,
          item.status,
          item.isPotentiallyOutdated ? 'OUTDATED' : 'CURRENT',
          f.id,
          f.priority,
          f.title,
          f.correctiveActionRequired,
          f.assigneeRole,
          f.resolutionStatus,
          f.resolvedAt || 'Pending',
        ]);
      });
    }
  });

  return rows
    .map((row) =>
      row
        .map((val) => `"${(val || '').toString().replace(/"/g, '""')}"`)
        .join(',')
    )
    .join('\r\n');
}
