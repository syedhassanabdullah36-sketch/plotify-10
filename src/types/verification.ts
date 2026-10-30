/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type VerificationCategory =
  | 'project_foundation'
  | 'geometry_spatial_sync'
  | 'calculation_integrity'
  | 'dependency_propagation'
  | 'design_intelligence'
  | 'versioning_recovery'
  | 'security_infrastructure';

export type VerificationSeverity =
  | 'blocking_defect'
  | 'warning'
  | 'incomplete_data'
  | 'unsupported_check';

export interface VerificationCheck {
  id: string;
  category: VerificationCategory;
  name: string;
  description: string;
  passed: boolean;
  severity: VerificationSeverity;
  details: string;
  affectedComponentId?: string;
  affectedField?: string;
  remediation?: string;
  executionTimeMs: number;
}

export type ReleaseGateTarget =
  | 'concept_schematic'
  | 'design_development'
  | 'tender_bidding'
  | 'construction_handoff';

export interface ReleaseGateChecklistRequirement {
  id: string;
  title: string;
  category: VerificationCategory;
  isMandatory: boolean;
  status: 'satisfied' | 'failed' | 'waived';
  explanation: string;
}

export interface ReleaseGateEvaluation {
  target: ReleaseGateTarget;
  targetLabel: string;
  description: string;
  eligible: boolean;
  scorePercentage: number;
  blockingIssuesCount: number;
  warningsCount: number;
  checklist: ReleaseGateChecklistRequirement[];
  evaluatedAt: string;
}

export interface ProjectVerificationReport {
  reportId: string;
  projectId: string;
  projectName: string;
  evaluatedAt: string;
  overallPassed: boolean;
  healthScore: number;
  summary: {
    totalChecks: number;
    passedChecks: number;
    failedChecks: number;
    blockingDefects: number;
    warnings: number;
    incompleteData: number;
    unsupportedChecks: number;
    totalExecutionTimeMs: number;
  };
  categoryScores: Record<
    VerificationCategory,
    {
      category: VerificationCategory;
      label: string;
      total: number;
      passed: number;
      blocking: number;
      percentage: number;
    }
  >;
  checks: VerificationCheck[];
  releaseGates: Record<ReleaseGateTarget, ReleaseGateEvaluation>;
  auditSignature: string;
}
