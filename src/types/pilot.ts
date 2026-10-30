/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type PilotParticipantRole =
  | 'architect'
  | 'structural_engineer'
  | 'mep_engineer'
  | 'project_manager'
  | 'interior_designer'
  | 'sustainability_consultant'
  | 'homeowner_client'
  | 'academic_student';

export type PilotWorkflowCategory =
  | 'project-setup'
  | 'floor-plan-2d'
  | 'viewer-3d'
  | 'design-studio'
  | 'regulations-zoning'
  | 'site-climate'
  | 'structural-framing'
  | 'mep-coordination'
  | 'cost-takeoff'
  | 'evidence-ledger'
  | 'version-control'
  | 'expert-review'
  | 'general-usability';

export type PilotFeedbackCategory =
  | 'usability'
  | 'functional-defect'
  | 'calculation-concern'
  | 'performance-lag'
  | 'missing-capability'
  | 'documentation-gap'
  | 'suggestion';

export type PilotFeedbackSeverity =
  | 'blocker'
  | 'critical'
  | 'moderate'
  | 'minor'
  | 'cosmetic'
  | 'enhancement';

export type PilotTriageStatus =
  | 'new'
  | 'investigating'
  | 'triaged'
  | 'in-progress'
  | 'verified-fixed'
  | 'deferred'
  | 'rejected'
  | 'as-designed';

export type PilotTriageDecision =
  | 'fix-immediate'
  | 'defer-v2'
  | 'investigate-further'
  | 'reject-out-of-scope'
  | 'clarify-documentation';

export interface PilotFeedbackRecord {
  id: string;
  participantId: string;
  participantRole: PilotParticipantRole;
  workflow: PilotWorkflowCategory;
  category: PilotFeedbackCategory;
  severity: PilotFeedbackSeverity;
  title: string;
  description: string;
  expectedBehavior: string;
  observedBehavior: string;
  reproductionSteps: string[];
  projectId?: string;
  projectName?: string;
  geometryFingerprint?: string;
  environmentInfo: {
    browser: string;
    operatingSystem: string;
    screenResolution?: string;
    webGlSupported: boolean;
  };
  createdAt: string;
  triageStatus: PilotTriageStatus;
  triageDecision?: PilotTriageDecision;
  triageRationale?: string;
  assignedOwner?: string;
  resolutionNotes?: string;
  resolvedAt?: string;
}

export interface PilotTaskScript {
  id: string;
  stepNumber: number;
  title: string;
  workflow: PilotWorkflowCategory;
  objective: string;
  instructions: string[];
  expectedOutcome: string;
  estimatedMinutes: number;
}

export interface PilotChecklistItem {
  id: string;
  category: 'core-readiness' | 'documentation' | 'test-data' | 'feedback-tools' | 'privacy' | 'support';
  title: string;
  description: string;
  status: 'ready' | 'not-ready' | 'blocked' | 'not-assessed';
  verificationNotes: string;
  mandatoryForPilot: boolean;
}

export interface PilotMetricsSummary {
  totalFeedbackCount: number;
  byCategory: Record<PilotFeedbackCategory, number>;
  bySeverity: Record<PilotFeedbackSeverity, number>;
  byStatus: Record<PilotTriageStatus, number>;
  uniqueParticipantsCount: number;
  criticalBlockerCount: number;
  triagedCount: number;
  resolvedCount: number;
  triageRatePercent: number;
  resolutionRatePercent: number;
  dataLossIncidentsCount: number;
  calculationDiscrepanciesCount: number;
  isRealDataCollected: boolean;
}

export interface PilotPlanConfig {
  pilotId: string;
  title: string;
  targetCohortSize: number; // e.g., 5-10 participants
  currentEnrollmentCount: number;
  startDatePlanned: string;
  endDatePlanned: string;
  researchQuestions: string[];
  supportedBrowsers: string[];
  supportedDevices: string[];
  knownLimitations: string[];
  stopConditions: string[];
  activeTaskScripts: PilotTaskScript[];
}
