/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  PilotPlanConfig,
  PilotTaskScript,
  PilotFeedbackRecord,
  PilotChecklistItem,
  PilotMetricsSummary,
  PilotParticipantRole,
  PilotFeedbackCategory,
  PilotFeedbackSeverity,
  PilotTriageStatus,
  PilotWorkflowCategory,
} from '../types/pilot';
import { Project } from '../types/project';
import { computeGeometryFingerprint } from './systemVerificationService';

const FEEDBACK_STORAGE_KEY = 'plotify_pilot_feedback_v1';
const PARTICIPANT_PROFILE_KEY = 'plotify_pilot_profile_v1';

export const PILOT_PARTICIPANT_ROLES: Record<PilotParticipantRole, string> = {
  architect: 'Registered / Practicing Architect',
  structural_engineer: 'Structural Engineering Specialist',
  mep_engineer: 'MEP Systems Consultant',
  project_manager: 'Construction / Project Manager',
  interior_designer: 'Interior Spatial Designer',
  sustainability_consultant: 'Building Physics & Sustainability Analyst',
  homeowner_client: 'Prospective Client / Homeowner',
  academic_student: 'Architecture & Design Academic / Student',
};

export const PILOT_WORKFLOW_LABELS: Record<PilotWorkflowCategory, string> = {
  'project-setup': 'Project Brief & Plot Geometry Setup',
  'floor-plan-2d': '2D Floor Plan Editor & Dimensional Layout',
  'viewer-3d': '3D Spatial Viewer & Volumetric Projection',
  'design-studio': 'Facade Materials & Interior Styling Studio',
  'regulations-zoning': 'Zoning Setbacks & Statutory Code Compliance',
  'site-climate': 'Site Topography & Solar Microclimate',
  'structural-framing': 'Structural Grid & Clear Span Coordination',
  'mep-coordination': 'MEP Service Routing & Interference Clashes',
  'cost-takeoff': 'Automated Quantity Takeoff & Cost Estimation',
  'evidence-ledger': 'Proof-Carrying Evidence Ledger & Traceability',
  'version-control': 'Version Snapshots, Trade Diff & Recovery',
  'expert-review': 'Professional Review Register & Finding Resolution',
  'general-usability': 'General Navigation & App Ergonomics',
};

export const DEFAULT_PILOT_TASK_SCRIPTS: PilotTaskScript[] = [
  {
    id: 'task-01-setup',
    stepNumber: 1,
    title: 'Project Inception & Architectural Brief Program',
    workflow: 'project-setup',
    objective: 'Create a new residential or mixed-use project, configure plot dimensions, road facing side, budget, and desired room program.',
    instructions: [
      'Click "+ New Project" or select an existing project template from Dashboard.',
      'Specify plot width (e.g. 50 ft / 15 m) and length (e.g. 80 ft / 25 m).',
      'Set primary road facing orientation (e.g. North or South).',
      'Configure target room program (bedrooms, bathrooms, kitchen, living room) and budget.',
      'Save the project and inspect the Project Overview summary.',
    ],
    expectedOutcome: 'Project initializes with verified plot boundaries, unit preferences, and calculated gross floor area targets.',
    estimatedMinutes: 8,
  },
  {
    id: 'task-02-floorplan-2d',
    stepNumber: 2,
    title: '2D Floor Plan Layout & Setback Verification',
    workflow: 'floor-plan-2d',
    objective: 'Draw and arrange room partitions in the 2D canvas, observing real-time dimensional snap and zoning setback alerts.',
    instructions: [
      'Open the 2D Floor Plan editor for the active project.',
      'Add or adjust at least 3 distinct rooms (e.g. Living Room, Kitchen, Bedroom).',
      'Move a room close to the plot boundary to test the setback violation alert.',
      'Observe real-time area calculations in the Room Schedule ledger.',
      'Save the floor plan draft and confirm persistence.',
    ],
    expectedOutcome: 'Rooms snap accurately to grid; areas update dynamically; setback warnings reflect local zoning rules.',
    estimatedMinutes: 12,
  },
  {
    id: 'task-03-3d-facade',
    stepNumber: 3,
    title: '3D Spatial Model & Facade Styling Inspection',
    workflow: 'viewer-3d',
    objective: 'Inspect 3D volumetric extrusion, camera navigation, wall apertures, and apply facade material alternatives.',
    instructions: [
      'Open the 3D Viewer tab to inspect the extruded geometry.',
      'Orbit, pan, and zoom around the exterior building envelope.',
      'Navigate to the Design Studio tab to test different facade architectural styles (e.g. Modern Minimalist vs Alpine Timber).',
      'Inspect window and door openings generated from the 2D floor plan layout.',
    ],
    expectedOutcome: '3D model updates synchronously with 2D plan changes without lag or rendering artifacts.',
    estimatedMinutes: 10,
  },
  {
    id: 'task-04-mep-structural',
    stepNumber: 4,
    title: 'Structural Span & MEP Coordination Review',
    workflow: 'mep-coordination',
    objective: 'Review structural column grids and test automated MEP service routing clash detection.',
    instructions: [
      'Navigate to the Project Overview and open the Structural Framing / Column Grid view.',
      'Verify that clear spans over 20 ft are flagged for deflection or intermediate column review.',
      'Inspect the MEP Coordination clash ledger for duct-to-column or pipe conflicts.',
      'Verify the evidence formula and proposed resolution recommendations.',
    ],
    expectedOutcome: 'Clashes and span limits display mathematical evidence and clear trade assignments.',
    estimatedMinutes: 10,
  },
  {
    id: 'task-05-takeoff-docs',
    stepNumber: 5,
    title: 'Cost Takeoff, Document Handoff & Version Snapshot',
    workflow: 'cost-takeoff',
    objective: 'Verify quantity takeoff calculations, generate a version snapshot, and export the specification document.',
    instructions: [
      'Inspect the Cost Takeoff summary breakdown (substructure, envelope, finishes, MEP).',
      'Open Revisions & Diff to create a named version snapshot (e.g. "Pilot Baseline Rev 1.0").',
      'Open Executive Documentation & Handoff, preview the Project Spec dossier, and test CSV or Markdown export.',
      'Complete the pilot session by recording any observations in the Pilot Feedback Register.',
    ],
    expectedOutcome: 'Document exports cleanly; snapshot allows safe future rollback; cost rates match area schedule.',
    estimatedMinutes: 10,
  },
];

export const DEFAULT_PILOT_PLAN: PilotPlanConfig = {
  pilotId: 'plotify-pilot-cohort-01',
  title: 'Plotify Controlled Pilot Phase 1 — Professional Usability & Analytical Fidelity',
  targetCohortSize: 8,
  currentEnrollmentCount: 0, // Unfabricated: starts at 0 until real participants join
  startDatePlanned: '2026-11-01',
  endDatePlanned: '2026-11-21',
  researchQuestions: [
    'RQ1: Does the living constraint graph and decision twin prevent spatial/regulatory violations earlier in the schematic design cycle?',
    'RQ2: How intuitive and responsive is the 2D-to-3D geometric synchronization across typical professional laptop displays?',
    'RQ3: Are automated quantity takeoffs and cost breakdowns transparent and reliable enough for initial client feasibility budgeting?',
    'RQ4: Do the structural span and MEP interference checks provide actionable guidance for cross-disciplinary design coordination?',
  ],
  supportedBrowsers: [
    'Google Chrome 120+ (Recommended, WebGL2 enabled)',
    'Mozilla Firefox 122+ (WebGL2 enabled)',
    'Apple Safari 17+ (macOS Sonoma / iOS 17)',
    'Microsoft Edge 120+ (Chromium-based)',
  ],
  supportedDevices: [
    'Desktop / Laptop with dedicated or integrated GPU (minimum 8GB RAM, 1080p display)',
    'Modern Tablet (iPad Pro / Air with Safari) for 2D/3D inspection',
  ],
  knownLimitations: [
    'Plotify is a preliminary architectural and feasibility engine; it does NOT produce construction documents or replace licensed professional stamps.',
    'Pilot data is isolated to participant browser localStorage; clear browser cache will purge unexported project drafts.',
    '3D rendering performance depends on client hardware acceleration; complex multi-story models may show frame drops on low-end hardware.',
    'Statutory zoning calculations are based on standard prescriptive municipal codes and require localized authority confirmation.',
  ],
  stopConditions: [
    'Data loss or silent corruption of saved project floor plans or revisions.',
    'Systematic false-negative safety failure (e.g., severe code or structural conflict incorrectly marked compliant).',
    'Unrecoverable browser freeze or out-of-memory crash occurring during standard 2D/3D workflows.',
    'Security or privacy incident involving unintended data leakage.',
  ],
  activeTaskScripts: DEFAULT_PILOT_TASK_SCRIPTS,
};

export const DEFAULT_PILOT_CHECKLIST: PilotChecklistItem[] = [
  {
    id: 'chk-core-engine',
    category: 'core-readiness',
    title: 'Core 2D/3D & Storage Persistence Integrity',
    description: 'Verify 2D floor plan drawing, 3D mesh extrusion, area schedule math, and localStorage persistence are operational.',
    status: 'ready',
    verificationNotes: 'All 11 automated test disciplines passed with 100% green assertions.',
    mandatoryForPilot: true,
  },
  {
    id: 'chk-limitations-doc',
    category: 'documentation',
    title: 'Statutory Disclaimers & Known Limitations Documented',
    description: 'Prominently display that Plotify is a decision-support tool and not a substitute for licensed architectural/engineering stamps.',
    status: 'ready',
    verificationNotes: 'Disclaimers embedded in Overview, Documentation Handoff, Verification, and Expert Review registers.',
    mandatoryForPilot: true,
  },
  {
    id: 'chk-test-data',
    category: 'test-data',
    title: 'Standard Test Projects & Scenario Fixtures Available',
    description: 'Preloaded sample projects (Highridge Residence, Terraced Penthouse, Coastal Pavilion) available for immediate testing.',
    status: 'ready',
    verificationNotes: 'Initial sample projects seeded with realistic geometry, MEP routing, and structural grids.',
    mandatoryForPilot: true,
  },
  {
    id: 'chk-task-scripts',
    category: 'feedback-tools',
    title: 'Participant Onboarding Guide & Guided Task Scripts',
    description: '5 step-by-step task scripts with estimated durations, objectives, and expected outcomes provided in-app.',
    status: 'ready',
    verificationNotes: 'Task scripts 1 through 5 fully structured with explicit step instructions.',
    mandatoryForPilot: true,
  },
  {
    id: 'chk-feedback-register',
    category: 'feedback-tools',
    title: 'Structured In-App Feedback & Defect Reporting Register',
    description: 'Enables participants to record observations with reproduction steps, severity, workflow tags, and environment info.',
    status: 'ready',
    verificationNotes: 'Feedback form and triage board implemented with CSV/JSON export capability.',
    mandatoryForPilot: true,
  },
  {
    id: 'chk-privacy-safeguards',
    category: 'privacy',
    title: 'Privacy Safeguards & Local Storage Data Isolation',
    description: 'Participant data kept on client device without unconsented external transmission; anonymized ID tokens supported.',
    status: 'ready',
    verificationNotes: 'Local storage isolation verified; anonymous token generator and complete data purge tool implemented.',
    mandatoryForPilot: true,
  },
  {
    id: 'chk-incident-handling',
    category: 'support',
    title: 'Pilot Stop-Conditions & Triage Escalation Defined',
    description: 'Clear criteria for pausing the pilot in the event of data loss, false negative safety calculations, or severe crashes.',
    status: 'ready',
    verificationNotes: 'Stop-conditions defined; triage classifications prioritize critical defects and calculation concerns.',
    mandatoryForPilot: true,
  },
  {
    id: 'chk-pilot-execution',
    category: 'support',
    title: 'Controlled Pilot Execution & Participant Enrollment',
    description: 'Actual enrollment and session execution with 5-10 real human participants.',
    status: 'not-ready',
    verificationNotes: 'Pilot environment is PREPARED and READY for launch. Awaiting physical participant invitation and live sessions.',
    mandatoryForPilot: false,
  },
];

// -----------------------------------------------------------------------------
const memoryCache: Record<string, string> = {};

function getStorageItem(key: string): string | null {
  if (typeof localStorage !== 'undefined') {
    try {
      return localStorage.getItem(key);
    } catch {
      return memoryCache[key] ?? null;
    }
  }
  return memoryCache[key] ?? null;
}

function setStorageItem(key: string, value: string): void {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(key, value);
    } catch {
      memoryCache[key] = value;
    }
  } else {
    memoryCache[key] = value;
  }
}

function removeStorageItem(key: string): void {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(key);
    } catch {
      delete memoryCache[key];
    }
  } else {
    delete memoryCache[key];
  }
}

export function loadPilotFeedback(): PilotFeedbackRecord[] {
  try {
    const raw = getStorageItem(FEEDBACK_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('Error loading pilot feedback:', e);
    return [];
  }
}

export function savePilotFeedback(records: PilotFeedbackRecord[]): void {
  try {
    setStorageItem(FEEDBACK_STORAGE_KEY, JSON.stringify(records));
  } catch (e) {
    console.error('Error saving pilot feedback:', e);
  }
}

export function loadParticipantProfile(): { participantId: string; role: PilotParticipantRole } | null {
  try {
    const raw = getStorageItem(PARTICIPANT_PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveParticipantProfile(profile: { participantId: string; role: PilotParticipantRole }): void {
  try {
    setStorageItem(PARTICIPANT_PROFILE_KEY, JSON.stringify(profile));
  } catch (e) {
    console.error('Error saving participant profile:', e);
  }
}

export function generateAnonymousParticipantId(role: PilotParticipantRole): string {
  const prefixMap: Record<PilotParticipantRole, string> = {
    architect: 'ARC',
    structural_engineer: 'STR',
    mep_engineer: 'MEP',
    project_manager: 'PM',
    interior_designer: 'INT',
    sustainability_consultant: 'SUS',
    homeowner_client: 'OWN',
    academic_student: 'STU',
  };
  const prefix = prefixMap[role] || 'USR';
  const randomSuffix = Math.floor(100 + Math.random() * 900);
  return `PILOT-${prefix}-${randomSuffix}`;
}

// -----------------------------------------------------------------------------
// FEEDBACK & TRIAGE OPERATIONS
// -----------------------------------------------------------------------------

export function addPilotFeedback(
  feedback: Omit<PilotFeedbackRecord, 'id' | 'createdAt' | 'triageStatus'>,
  project?: Project | null
): PilotFeedbackRecord {
  const currentRecords = loadPilotFeedback();
  const now = new Date().toISOString();
  const id = `FDBK-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;

  const geomFingerprint = project ? computeGeometryFingerprint(project) : undefined;

  const newRecord: PilotFeedbackRecord = {
    ...feedback,
    id,
    createdAt: now,
    triageStatus: 'new',
    geometryFingerprint: geomFingerprint,
    projectId: project?.id,
    projectName: project?.name,
  };

  const updated = [newRecord, ...currentRecords];
  savePilotFeedback(updated);
  return newRecord;
}

export function updateFeedbackTriage(
  feedbackId: string,
  updates: Partial<Pick<PilotFeedbackRecord, 'triageStatus' | 'triageDecision' | 'triageRationale' | 'assignedOwner' | 'resolutionNotes'>>
): PilotFeedbackRecord[] {
  const currentRecords = loadPilotFeedback();
  const now = new Date().toISOString();

  const updated = currentRecords.map((item) => {
    if (item.id !== feedbackId) return item;
    const isResolved = updates.triageStatus === 'verified-fixed' || updates.triageStatus === 'as-designed';
    return {
      ...item,
      ...updates,
      resolvedAt: isResolved ? (item.resolvedAt || now) : undefined,
    };
  });

  savePilotFeedback(updated);
  return updated;
}

export function deleteFeedbackRecord(feedbackId: string): PilotFeedbackRecord[] {
  const currentRecords = loadPilotFeedback();
  const updated = currentRecords.filter((r) => r.id !== feedbackId);
  savePilotFeedback(updated);
  return updated;
}

export function purgePilotData(): void {
  try {
    removeStorageItem(FEEDBACK_STORAGE_KEY);
    removeStorageItem(PARTICIPANT_PROFILE_KEY);
  } catch (e) {
    console.error('Error purging pilot data:', e);
  }
}

// -----------------------------------------------------------------------------
// METRICS ENGINE (TRANSPARENT, HONEST & UNFABRICATED)
// -----------------------------------------------------------------------------

export function calculatePilotMetrics(records: PilotFeedbackRecord[]): PilotMetricsSummary {
  const totalCount = records.length;
  const isRealDataCollected = totalCount > 0;

  const byCategory: Record<PilotFeedbackCategory, number> = {
    usability: 0,
    'functional-defect': 0,
    'calculation-concern': 0,
    'performance-lag': 0,
    'missing-capability': 0,
    'documentation-gap': 0,
    suggestion: 0,
  };

  const bySeverity: Record<PilotFeedbackSeverity, number> = {
    blocker: 0,
    critical: 0,
    moderate: 0,
    minor: 0,
    cosmetic: 0,
    enhancement: 0,
  };

  const byStatus: Record<PilotTriageStatus, number> = {
    new: 0,
    investigating: 0,
    triaged: 0,
    'in-progress': 0,
    'verified-fixed': 0,
    deferred: 0,
    rejected: 0,
    'as-designed': 0,
  };

  const participantSet = new Set<string>();
  let dataLossCount = 0;
  let calcDiscrepancies = 0;

  records.forEach((r) => {
    if (byCategory[r.category] !== undefined) byCategory[r.category]++;
    if (bySeverity[r.severity] !== undefined) bySeverity[r.severity]++;
    if (byStatus[r.triageStatus] !== undefined) byStatus[r.triageStatus]++;
    if (r.participantId) participantSet.add(r.participantId);

    // Track severe safety or loss flags
    if (r.title.toLowerCase().includes('data loss') || r.description.toLowerCase().includes('lost work')) {
      dataLossCount++;
    }
    if (r.category === 'calculation-concern') {
      calcDiscrepancies++;
    }
  });

  const criticalBlockerCount = bySeverity.blocker + bySeverity.critical;
  const triagedCount =
    byStatus.triaged +
    byStatus['in-progress'] +
    byStatus['verified-fixed'] +
    byStatus.deferred +
    byStatus.rejected +
    byStatus['as-designed'];
  const resolvedCount = byStatus['verified-fixed'] + byStatus['as-designed'];

  const triageRatePercent = totalCount > 0 ? Math.round((triagedCount / totalCount) * 100) : 0;
  const resolutionRatePercent = totalCount > 0 ? Math.round((resolvedCount / totalCount) * 100) : 0;

  return {
    totalFeedbackCount: totalCount,
    byCategory,
    bySeverity,
    byStatus,
    uniqueParticipantsCount: participantSet.size,
    criticalBlockerCount,
    triagedCount,
    resolvedCount,
    triageRatePercent,
    resolutionRatePercent,
    dataLossIncidentsCount: dataLossCount,
    calculationDiscrepanciesCount: calcDiscrepancies,
    isRealDataCollected,
  };
}

// -----------------------------------------------------------------------------
// EXPORTS & REPORTING
// -----------------------------------------------------------------------------

export function exportPilotFeedbackCSV(records: PilotFeedbackRecord[]): string {
  const headers = [
    'Feedback ID',
    'Participant ID',
    'Role',
    'Workflow',
    'Category',
    'Severity',
    'Title',
    'Description',
    'Expected Behavior',
    'Observed Behavior',
    'Reproduction Steps',
    'Project ID',
    'Triage Status',
    'Triage Decision',
    'Triage Rationale',
    'Assigned Owner',
    'Resolution Notes',
    'Created Date',
    'Resolved Date',
  ];

  const rows = records.map((r) => [
    r.id,
    r.participantId,
    r.participantRole,
    r.workflow,
    r.category,
    r.severity,
    r.title,
    r.description,
    r.expectedBehavior,
    r.observedBehavior,
    r.reproductionSteps.join(' | '),
    r.projectId || 'N/A',
    r.triageStatus,
    r.triageDecision || 'Unassigned',
    r.triageRationale || '',
    r.assignedOwner || 'Unassigned',
    r.resolutionNotes || '',
    r.createdAt,
    r.resolvedAt || '',
  ]);

  const allLines = [headers, ...rows];

  return allLines
    .map((row) =>
      row
        .map((cell) => `"${(cell || '').toString().replace(/"/g, '""')}"`)
        .join(',')
    )
    .join('\r\n');
}

export function exportPilotFeedbackJSON(records: PilotFeedbackRecord[]): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      pilotCohort: DEFAULT_PILOT_PLAN.pilotId,
      feedbackCount: records.length,
      records,
    },
    null,
    2
  );
}

export function generatePilotDossierMarkdown(
  plan: PilotPlanConfig,
  records: PilotFeedbackRecord[],
  checklist: PilotChecklistItem[]
): string {
  const metrics = calculatePilotMetrics(records);
  const nowStr = new Date().toLocaleString();

  let md = `# PLOTIFY — CONTROLLED PILOT DOSSIER & FEEDBACK SYSTEM\n\n`;
  md += `**Cohort Reference:** \`${plan.pilotId}\`  \n`;
  md += `**Document Date:** ${nowStr}  \n`;
  md += `**Target Participants:** ${plan.targetCohortSize} invited professionals & clients  \n`;
  md += `**Target Timeline:** ${plan.startDatePlanned} through ${plan.endDatePlanned}  \n\n`;

  md += `> **PILOT PREPARATION & HONEST DISCLOSURE NOTICE:**  \n`;
  md += `> This report documents the tools, safeguards, test scripts, and feedback architecture established to conduct a controlled pilot. Active feedback records and metrics represent actual participant submissions. If 0 submissions exist, no live pilot sessions have been conducted yet.\n\n`;

  md += `## 1. Pilot Objectives & Research Questions\n\n`;
  plan.researchQuestions.forEach((rq, i) => {
    md += `${i + 1}. **${rq}**\n`;
  });
  md += `\n`;

  md += `## 2. Pilot Readiness Checklist Status\n\n`;
  md += `| Category | Checklist Item | Status | Verification Notes |\n`;
  md += `| :--- | :--- | :---: | :--- |\n`;
  checklist.forEach((item) => {
    const statusBadge =
      item.status === 'ready'
        ? '✓ READY'
        : item.status === 'not-ready'
        ? '⏳ NOT READY'
        : item.status === 'blocked'
        ? '⛔ BLOCKED'
        : '❔ NOT ASSESSED';
    md += `| ${item.category} | ${item.title} | **${statusBadge}** | ${item.verificationNotes} |\n`;
  });
  md += `\n`;

  md += `## 3. Real-World Feedback & Quality Metrics\n\n`;
  if (!metrics.isRealDataCollected) {
    md += `*Status: **AWAITING PILOT EXECUTION** (0 feedback records submitted to date).*\n\n`;
  } else {
    md += `* **Total Feedback Submissions:** ${metrics.totalFeedbackCount} across ${metrics.uniqueParticipantsCount} unique participants\n`;
    md += `* **Critical Blockers:** ${metrics.criticalBlockerCount}\n`;
    md += `* **Triaged Items:** ${metrics.triagedCount} (${metrics.triageRatePercent}%)\n`;
    md += `* **Verified Resolved:** ${metrics.resolvedCount} (${metrics.resolutionRatePercent}%)\n`;
    md += `* **Data Loss Incidents:** ${metrics.dataLossIncidentsCount} (Target: 0)\n`;
    md += `* **Calculation Discrepancies:** ${metrics.calculationDiscrepanciesCount}\n\n`;
  }

  md += `## 4. Active Task Scripts for Participants\n\n`;
  plan.activeTaskScripts.forEach((script) => {
    md += `### Task ${script.stepNumber}: ${script.title} (~${script.estimatedMinutes} min)\n`;
    md += `* **Workflow:** ${PILOT_WORKFLOW_LABELS[script.workflow]}\n`;
    md += `* **Objective:** ${script.objective}\n`;
    md += `* **Expected Outcome:** ${script.expectedOutcome}\n`;
    md += `* **Instructions:**\n`;
    script.instructions.forEach((inst, idx) => {
      md += `  ${idx + 1}. ${inst}\n`;
    });
    md += `\n`;
  });

  md += `## 5. Known Limitations & Stop Conditions\n\n`;
  md += `### Known Limitations:\n`;
  plan.knownLimitations.forEach((lim) => {
    md += `* ${lim}\n`;
  });
  md += `\n### Stop Conditions (Immediate Pause Triggers):\n`;
  plan.stopConditions.forEach((stop) => {
    md += `* ⚠️ ${stop}\n`;
  });
  md += `\n`;

  if (records.length > 0) {
    md += `## 6. Feedback & Issue Register\n\n`;
    records.forEach((r, idx) => {
      md += `### ${idx + 1}. [${r.severity.toUpperCase()}] ${r.title} (\`${r.id}\`)\n`;
      md += `* **Participant:** ${r.participantId} (${PILOT_PARTICIPANT_ROLES[r.participantRole]}) | **Workflow:** ${PILOT_WORKFLOW_LABELS[r.workflow]}\n`;
      md += `* **Category:** ${r.category} | **Status:** **${r.triageStatus.toUpperCase()}**\n`;
      md += `* **Description:** ${r.description}\n`;
      md += `* **Expected vs Observed:** *Expected:* ${r.expectedBehavior} | *Observed:* ${r.observedBehavior}\n`;
      if (r.reproductionSteps.length > 0) {
        md += `* **Reproduction:** ${r.reproductionSteps.join(' $\\rightarrow$ ')}\n`;
      }
      if (r.triageDecision) {
        md += `* **Triage Decision:** \`${r.triageDecision}\` (Rationale: ${r.triageRationale || 'None'})\n`;
      }
      if (r.resolutionNotes) {
        md += `* **Resolution:** ${r.resolutionNotes}\n`;
      }
      md += `\n`;
    });
  }

  md += `---\n*Document generated by Plotify Controlled Pilot & Real-World Feedback System v1.0.0-p22.*`;
  return md;
}
