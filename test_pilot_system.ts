/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  DEFAULT_PILOT_PLAN,
  DEFAULT_PILOT_CHECKLIST,
  DEFAULT_PILOT_TASK_SCRIPTS,
  PILOT_PARTICIPANT_ROLES,
  PILOT_WORKFLOW_LABELS,
  generateAnonymousParticipantId,
  addPilotFeedback,
  loadPilotFeedback,
  updateFeedbackTriage,
  deleteFeedbackRecord,
  purgePilotData,
  calculatePilotMetrics,
  exportPilotFeedbackCSV,
  exportPilotFeedbackJSON,
  generatePilotDossierMarkdown,
} from './src/services/pilotService';
import { Project } from './src/types/project';
import {
  PilotParticipantRole,
  PilotWorkflowCategory,
  PilotFeedbackCategory,
  PilotFeedbackSeverity,
  PilotTriageStatus,
  PilotTriageDecision,
} from './src/types/pilot';

console.log('================================================================');
console.log('PLOTIFY PROMPT 22: CONTROLLED PILOT & FEEDBACK SYSTEM TEST');
console.log('================================================================\n');

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`  ✓ ${message}`);
}

const testProject: Project = {
  id: 'proj-pilot-test-01',
  name: 'Pilot Evaluation Residence',
  projectType: 'house',
  plotWidth: 60,
  plotLength: 90,
  unit: 'feet',
  roadFacing: 'North',
  floors: 2,
  rooms: {
    livingRoom: 1,
    bedrooms: 3,
    bathrooms: 2,
    kitchen: 1,
    diningRoom: 1,
    balcony: 1,
    garage: 1,
    customRooms: [],
  },
  budget: 450000,
  currency: 'USD',
  notes: 'Testing Pilot & Real-World Feedback System',
  status: 'Schematic Design',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  floorPlan: {
    rooms: [
      {
        id: 'r-101',
        name: 'Great Living Space',
        type: 'living',
        x: 10,
        y: 10,
        width: 25,
        length: 30,
        floorLevel: 1,
      },
    ],
  },
};

// -----------------------------------------------------------------------------
// TEST SUITE 1: Pilot Scope & Configuration Architecture
// -----------------------------------------------------------------------------
console.log('TEST SUITE 1: Pilot Scope & Plan Configuration');

assert(Boolean(DEFAULT_PILOT_PLAN), 'Pilot plan configuration exists');
assert(DEFAULT_PILOT_PLAN.targetCohortSize >= 5 && DEFAULT_PILOT_PLAN.targetCohortSize <= 10, 'Target cohort size configured for 5-10 participants');
assert(DEFAULT_PILOT_PLAN.researchQuestions.length >= 4, 'Includes at least 4 defined research questions');
assert(DEFAULT_PILOT_PLAN.supportedBrowsers.length >= 3, 'Supported browsers explicitly documented');
assert(DEFAULT_PILOT_PLAN.knownLimitations.length >= 3, 'Known limitations and non-reliance disclaimers documented');
assert(DEFAULT_PILOT_PLAN.stopConditions.length >= 3, 'Stop conditions (immediate pause triggers) defined');
assert(DEFAULT_PILOT_PLAN.currentEnrollmentCount === 0, 'Honest baseline: enrollment count starts at 0 without fabrication');

// -----------------------------------------------------------------------------
// TEST SUITE 2: Guided Task Scripts
// -----------------------------------------------------------------------------
console.log('\nTEST SUITE 2: Participant Guided Task Scripts');

assert(DEFAULT_PILOT_TASK_SCRIPTS.length === 5, 'Exactly 5 guided task scripts provided');
const scriptWorkflows = DEFAULT_PILOT_TASK_SCRIPTS.map(s => s.workflow);
assert(scriptWorkflows.includes('project-setup'), 'Task 1 covers project setup & brief');
assert(scriptWorkflows.includes('floor-plan-2d'), 'Task 2 covers 2D floor plan & setback checks');
assert(scriptWorkflows.includes('viewer-3d'), 'Task 3 covers 3D spatial viewing & facade styling');
assert(scriptWorkflows.includes('mep-coordination'), 'Task 4 covers structural span & MEP clashes');
assert(scriptWorkflows.includes('cost-takeoff'), 'Task 5 covers cost takeoff & version handoff');

DEFAULT_PILOT_TASK_SCRIPTS.forEach((s) => {
  assert(s.instructions.length >= 3, `Task ${s.stepNumber} has sufficient step instructions`);
  assert(s.estimatedMinutes > 0, `Task ${s.stepNumber} has realistic estimated duration`);
  assert(s.expectedOutcome.length > 10, `Task ${s.stepNumber} defines clear expected outcome`);
});

// -----------------------------------------------------------------------------
// TEST SUITE 3: Participant Anonymization & Role Mapping
// -----------------------------------------------------------------------------
console.log('\nTEST SUITE 3: Participant Token Generator & Role Mapping');

const roles: PilotParticipantRole[] = [
  'architect',
  'structural_engineer',
  'mep_engineer',
  'project_manager',
  'interior_designer',
  'sustainability_consultant',
  'homeowner_client',
  'academic_student',
];

roles.forEach((r) => {
  const token = generateAnonymousParticipantId(r);
  assert(token.startsWith('PILOT-'), `Generated token ${token} starts with PILOT- prefix`);
  assert(PILOT_PARTICIPANT_ROLES[r].length > 0, `Role label defined for ${r}`);
});

// -----------------------------------------------------------------------------
// TEST SUITE 4: Feedback Recording & Storage Operations
// -----------------------------------------------------------------------------
console.log('\nTEST SUITE 4: Feedback Collection & Local Storage Operations');

// Ensure clean slate
purgePilotData();
assert(loadPilotFeedback().length === 0, 'Clean slate after purgePilotData');

const sampleFeedback1 = addPilotFeedback(
  {
    participantId: 'PILOT-ARC-101',
    participantRole: 'architect',
    workflow: 'floor-plan-2d',
    category: 'usability',
    severity: 'moderate',
    title: 'Room partition snap guide requires finer 0.5-foot increments',
    description: 'When dragging the interior partition between living and kitchen, the cursor jumps by 1 foot.',
    expectedBehavior: 'Allow pressing Shift key to toggle 0.5 ft precision snap.',
    observedBehavior: 'Fixed 1.0 ft snap grid regardless of key modifiers.',
    reproductionSteps: [
      'Open 2D floor plan editor',
      'Select living room right partition',
      'Hold Shift and drag left',
    ],
    environmentInfo: {
      browser: 'Chrome 122',
      operatingSystem: 'macOS Sonoma',
      screenResolution: '1920x1080',
      webGlSupported: true,
    },
  },
  testProject
);

assert(Boolean(sampleFeedback1.id), 'Feedback record assigned unique identifier');
assert(sampleFeedback1.triageStatus === 'new', 'Initial triage status set to new');
assert(sampleFeedback1.projectId === testProject.id, 'Feedback linked to active project ID');
assert(Boolean(sampleFeedback1.geometryFingerprint), 'Feedback captures geometry fingerprint');

const sampleFeedback2 = addPilotFeedback(
  {
    participantId: 'PILOT-ENG-202',
    participantRole: 'mep_engineer',
    workflow: 'mep-coordination',
    category: 'calculation-concern',
    severity: 'critical',
    title: 'HVAC return duct clearance rule citation mismatch',
    description: 'The displayed clearance threshold cites NEC 110.26 instead of IMC 305.',
    expectedBehavior: 'Duct clearance should reference Mechanical Code IMC 305.4.',
    observedBehavior: 'Cites National Electrical Code 110.26 electrical panel working clearance.',
    reproductionSteps: [
      'Inspect MEP clash register',
      'Select return duct clash record',
      'View code citation field',
    ],
    environmentInfo: {
      browser: 'Firefox 123',
      operatingSystem: 'Windows 11',
      webGlSupported: true,
    },
  },
  testProject
);

const loaded = loadPilotFeedback();
assert(loaded.length === 2, '2 feedback records loaded from storage');

// -----------------------------------------------------------------------------
// TEST SUITE 5: Engineering Triage & Decision Loop
// -----------------------------------------------------------------------------
console.log('\nTEST SUITE 5: Engineering Triage & Decision Classification');

// Update feedback 1: Triage as 'in-progress' with decision 'defer-v2'
const afterTriage1 = updateFeedbackTriage(sampleFeedback1.id, {
  triageStatus: 'in-progress',
  triageDecision: 'defer-v2',
  triageRationale: 'Precision snap toggle scheduled for post-pilot minor release sprint.',
  assignedOwner: 'Frontend Geometry Team',
});

const updatedF1 = afterTriage1.find(f => f.id === sampleFeedback1.id)!;
assert(updatedF1.triageStatus === 'in-progress', 'Status updated to in-progress');
assert(updatedF1.triageDecision === 'defer-v2', 'Decision set to defer-v2');
assert(updatedF1.assignedOwner === 'Frontend Geometry Team', 'Owner assigned');

// Update feedback 2: Verify fix
const afterTriage2 = updateFeedbackTriage(sampleFeedback2.id, {
  triageStatus: 'verified-fixed',
  triageDecision: 'fix-immediate',
  triageRationale: 'Corrected citation lookup table to map HVAC components to IMC Section 305.',
  assignedOwner: 'Regulatory Engine Lead',
  resolutionNotes: 'Updated in patch 1.0.1; code citation verified.',
});

const updatedF2 = afterTriage2.find(f => f.id === sampleFeedback2.id)!;
assert(updatedF2.triageStatus === 'verified-fixed', 'Status updated to verified-fixed');
assert(Boolean(updatedF2.resolvedAt), 'Resolved timestamp populated on verified-fixed');

// -----------------------------------------------------------------------------
// TEST SUITE 6: Pilot Metrics Engine (Unfabricated)
// -----------------------------------------------------------------------------
console.log('\nTEST SUITE 6: Pilot Metrics Engine (Transparent & Unfabricated)');

const metrics = calculatePilotMetrics(afterTriage2);

assert(metrics.isRealDataCollected === true, 'Metrics recognize real collected records');
assert(metrics.totalFeedbackCount === 2, 'Total feedback count matches 2');
assert(metrics.uniqueParticipantsCount === 2, 'Two unique participants tracked');
assert(metrics.criticalBlockerCount === 1, 'Correctly tallies 1 critical item');
assert(metrics.calculationDiscrepanciesCount === 1, 'Correctly tallies 1 calculation concern');
assert(metrics.triagedCount === 2, 'Both items have been triaged');
assert(metrics.triageRatePercent === 100, 'Triage rate is 100%');
assert(metrics.resolvedCount === 1, '1 item verified resolved');
assert(metrics.resolutionRatePercent === 50, 'Resolution rate is 50%');

// Test empty metrics baseline
const emptyMetrics = calculatePilotMetrics([]);
assert(emptyMetrics.isRealDataCollected === false, 'Empty metrics flag isRealDataCollected as false');
assert(emptyMetrics.totalFeedbackCount === 0, 'Empty total count is 0');
assert(emptyMetrics.triageRatePercent === 0, 'Empty triage rate is 0 without division-by-zero errors');

// -----------------------------------------------------------------------------
// TEST SUITE 7: Export Formats & Dossier Generation
// -----------------------------------------------------------------------------
console.log('\nTEST SUITE 7: CSV, JSON & Markdown Dossier Generation');

const csv = exportPilotFeedbackCSV(afterTriage2);
assert(typeof csv === 'string' && csv.length > 200, 'CSV export generated');
assert(csv.startsWith('"Feedback ID","Participant ID","Role"'), 'CSV has valid RFC-4180 headers');
assert(csv.includes('PILOT-ARC-101'), 'CSV contains participant ID');
assert(csv.includes('IMC Section 305'), 'CSV contains resolution notes');

const json = exportPilotFeedbackJSON(afterTriage2);
assert(typeof json === 'string' && json.length > 200, 'JSON export generated');
const parsed = JSON.parse(json);
assert(parsed.feedbackCount === 2, 'JSON preserves feedback count');
assert(parsed.records.length === 2, 'JSON contains records array');

const dossier = generatePilotDossierMarkdown(DEFAULT_PILOT_PLAN, afterTriage2, DEFAULT_PILOT_CHECKLIST);
assert(typeof dossier === 'string' && dossier.length > 500, 'Markdown dossier generated');
assert(dossier.includes('# PLOTIFY — CONTROLLED PILOT DOSSIER & FEEDBACK SYSTEM'), 'Dossier header present');
assert(dossier.includes('PILOT PREPARATION & HONEST DISCLOSURE NOTICE'), 'Statutory disclaimer notice present');
assert(dossier.includes('Active Task Scripts for Participants'), 'Task scripts included in dossier');
assert(dossier.includes('Known Limitations & Stop Conditions'), 'Stop conditions included in dossier');

// -----------------------------------------------------------------------------
// TEST SUITE 8: 8-Point Pilot Readiness Checklist Verification
// -----------------------------------------------------------------------------
console.log('\nTEST SUITE 8: Pilot Readiness Checklist Verification');

assert(DEFAULT_PILOT_CHECKLIST.length === 8, 'Checklist contains 8 items');
const mandatoryItems = DEFAULT_PILOT_CHECKLIST.filter(c => c.mandatoryForPilot);
assert(mandatoryItems.length >= 6, 'Mandatory pilot readiness items identified');
assert(DEFAULT_PILOT_CHECKLIST.some(c => c.id === 'chk-core-engine' && c.status === 'ready'), 'Core engine readiness marked ready');
assert(DEFAULT_PILOT_CHECKLIST.some(c => c.id === 'chk-limitations-doc' && c.status === 'ready'), 'Limitations documented marked ready');
assert(DEFAULT_PILOT_CHECKLIST.some(c => c.id === 'chk-feedback-register' && c.status === 'ready'), 'Feedback register marked ready');
assert(DEFAULT_PILOT_CHECKLIST.some(c => c.id === 'chk-privacy-safeguards' && c.status === 'ready'), 'Privacy safeguards marked ready');
assert(DEFAULT_PILOT_CHECKLIST.some(c => c.id === 'chk-pilot-execution' && c.status === 'not-ready'), 'Pilot execution correctly marked not-ready (awaiting live sessions)');

console.log('\n================================================================');
console.log('✅ ALL 8 PILOT SYSTEM & FEEDBACK FRAMEWORK TESTS PASSED!');
console.log('================================================================\n');
