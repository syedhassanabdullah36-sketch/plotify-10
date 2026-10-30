/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type EvaluationStatus =
  | 'pass'
  | 'conflict'
  | 'needs-review'
  | 'insufficient-data'
  | 'not-applicable'
  | 'unverified-rule'
  | 'not-assessed';

export type SourceType =
  | 'official-legislation'
  | 'authority-guidance'
  | 'adopted-code'
  | 'technical-standard'
  | 'secondary-commentary'
  | 'user-supplied';

export type SourceStatus =
  | 'adopted'
  | 'model-code'
  | 'guidance'
  | 'amended'
  | 'superseded'
  | 'user-supplied';

export type SourceVerificationStatus =
  | 'verified'
  | 'unverified'
  | 'disputed'
  | 'outdated';

export type RequirementType =
  | 'numeric-threshold'
  | 'dimensional-condition'
  | 'mandatory-provision'
  | 'documentation-requirement'
  | 'professional-review';

export type ProjectCategory =
  | 'new-construction'
  | 'renovation'
  | 'extension'
  | 'change-of-use'
  | 'other';

export type ApprovalPathway =
  | 'standard-planning-permit'
  | 'building-notice'
  | 'full-plans-application'
  | 'permitted-development'
  | 'exempt'
  | 'unknown';

export interface RegulatoryClause {
  clauseId: string;
  section: string;
  title: string;
  text?: string;
  page?: string | number;
}

export interface RegulatorySourceRecord {
  id: string;
  title: string;
  issuingAuthority: string;
  documentIdentifier: string;
  officialUrl?: string;
  jurisdiction: {
    country: string;
    region?: string;
    localAuthority?: string;
  };
  edition: string;
  publicationDate?: string;
  effectiveDate?: string;
  status: SourceStatus;
  verificationStatus: SourceVerificationStatus;
  sourceType: SourceType;
  clauses: RegulatoryClause[];
  lastReviewedDate: string;
  reviewerNotes?: string;
  limitations?: string;
}

export interface NumericThreshold {
  targetValue: number;
  unit: string;
  operator: 'min' | 'max' | 'range' | 'exact';
  rangeMax?: number;
}

export interface RegulatoryRequirementItem {
  id: string;
  title: string;
  plainLanguageExplanation: string;
  clauseReference: string;
  sourceId: string;
  jurisdictionScope: string;
  buildingScope: string[];
  applicabilityConditions: string;
  requiredInputs: string[];
  requirementType: RequirementType;
  evaluationMethod: string;
  threshold?: NumericThreshold;
  evidenceNeeded: string;
  knownExceptions?: string[];
  lastVerificationDate: string;
  verificationStatus: 'verified' | 'unverified';
  limitations?: string;
  isDiscretionary: boolean;
}

export interface RequirementEvaluationRecord {
  requirementId: string;
  status: EvaluationStatus;
  statusReason: string;
  inputsCaptured: Record<string, string | number | boolean | null>;
  measuredValue?: string | number;
  thresholdValue?: string | number;
  unit?: string;
  sourceVersion: string;
  evaluatedAt: string;
  evaluatorEngine: string;
  geometryHashAtEval: string;
  isStale: boolean;
  staleReason?: string;
  actionNeeded: string;
  remedySuggestion?: string;
  reviewerOverride?: {
    overrideStatus: EvaluationStatus;
    reviewerName: string;
    justification: string;
    timestamp: string;
  };
}

export interface RegulatoryProjectProfile {
  country: string;
  region: string;
  localAuthority: string;
  siteAddress: string;
  ahj: string;
  buildingUse: string;
  projectCategory: ProjectCategory;
  occupancyClassification: string;
  approvalPathway: ApprovalPathway;
  applicableCodeFamilies: string[];
  assessmentDate: string;
  lastSourceVerificationDate: string;
  responsibleReviewer: string;
  reviewNotes: string;
}

export interface ReviewerDecision {
  id: string;
  requirementId: string;
  decision: 'accepted-with-conditions' | 'variance-required' | 'clarification-requested' | 'rejected' | 'exempted';
  notes: string;
  reviewer: string;
  timestamp: string;
}

export interface AssessmentHistoryRecord {
  id: string;
  timestamp: string;
  geometryHash: string;
  summary: {
    pass: number;
    conflict: number;
    needsReview: number;
    insufficientData: number;
    notApplicable: number;
    unverifiedRule: number;
    notAssessed: number;
    total: number;
  };
  staleCount: number;
}

export interface RegulatoryState {
  profile: RegulatoryProjectProfile;
  sources: RegulatorySourceRecord[];
  customRequirements: RegulatoryRequirementItem[];
  activeRulePack: string;
  lastEvaluatedAt?: string;
  lastEvaluatedGeometryHash?: string;
  evaluations: Record<string, RequirementEvaluationRecord>;
  history: AssessmentHistoryRecord[];
  reviewerDecisions: ReviewerDecision[];
}

export interface RegulatoryEvaluationSummary {
  profile: RegulatoryProjectProfile;
  activeRulePack: string;
  timestamp: string;
  geometryHash: string;
  isStale: boolean;
  staleReasons: string[];
  counts: {
    pass: number;
    conflict: number;
    needsReview: number;
    insufficientData: number;
    notApplicable: number;
    unverifiedRule: number;
    notAssessed: number;
    total: number;
  };
  evaluations: RequirementEvaluationRecord[];
  activeConflicts: RequirementEvaluationRecord[];
  pendingReviews: RequirementEvaluationRecord[];
  missingInputs: RequirementEvaluationRecord[];
  statutoryDisclaimer: string;
}
