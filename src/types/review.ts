/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ReviewDiscipline =
  | 'architecture_spatial'
  | 'building_regulations'
  | 'accessibility_universal'
  | 'structural_engineering'
  | 'mep_engineering'
  | 'cost_construction'
  | 'environmental_sustainability';

export type ReviewStatus =
  | 'not-reviewed'
  | 'in-review'
  | 'changes-required'
  | 'accepted-scope'
  | 'rejected'
  | 'unable-to-assess'
  | 'expired-or-superseded';

export type FindingPriority = 'critical' | 'high' | 'medium' | 'low';

export type FindingResolutionStatus =
  | 'open'
  | 'proposed-correction'
  | 'verified-resolved'
  | 'variance-accepted';

export interface ReviewEvidenceLink {
  id: string;
  evidenceType:
    | 'drawing_room'
    | 'structural_column'
    | 'mep_clash'
    | 'calculation_record'
    | 'code_citation'
    | 'cost_takeoff'
    | 'snapshot_revision';
  targetId: string;
  targetLabel: string;
  capturedValue: string;
}

export interface ProfessionalFinding {
  id: string;
  reviewItemId: string;
  title: string;
  discipline: ReviewDiscipline;
  priority: FindingPriority;
  description: string;
  evidenceLinks: ReviewEvidenceLink[];
  correctiveActionRequired: string;
  assigneeRole: string;
  resolutionStatus: FindingResolutionStatus;
  resolutionNotes?: string;
  resolutionEvidence?: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

export interface ProfessionalReviewItem {
  id: string;
  projectId: string;
  revisionNumber: number;
  geometryFingerprint: string;
  discipline: ReviewDiscipline;
  title: string;
  scopeAndLimitations: string;
  targetSubject: string;
  reviewerName: string;
  reviewerRole: string;
  reviewerCredentials?: string;
  reviewDate: string;
  status: ReviewStatus;
  generalComments: string;
  findings: ProfessionalFinding[];
  isPotentiallyOutdated: boolean;
  lastEvaluatedAt: string;
}

export interface ReviewDisciplineSummary {
  discipline: ReviewDiscipline;
  label: string;
  totalReviews: number;
  acceptedCount: number;
  changesRequiredCount: number;
  openFindingsCount: number;
  criticalCount: number;
  isStale: boolean;
}

export interface ProfessionalReviewRegister {
  projectId: string;
  lastUpdated: string;
  items: ProfessionalReviewItem[];
  summary: {
    totalReviews: number;
    acceptedScopeCount: number;
    changesRequiredCount: number;
    inReviewCount: number;
    expiredCount: number;
    openFindingsCount: number;
    criticalFindingsCount: number;
  };
  disciplineSummaries: Record<ReviewDiscipline, ReviewDisciplineSummary>;
}
