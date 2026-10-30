export type ValidationStatus =
  | 'pass'          // A specific implemented check was executed and passed
  | 'conflict'      // A specific implemented check detected a defined conflict
  | 'pending'       // Required inputs or checks are incomplete
  | 'stale'         // The result depends on inputs that have changed since it was calculated
  | 'not-assessed'  // No applicable check has been performed
  | 'failed';       // A calculation or operation failed

export type EvidenceModule =
  | 'floor-plan'
  | 'viewer-3d'
  | 'decision-twin'
  | 'constraint-graph'
  | 'impact-simulator'
  | 'cost-planning'
  | 'site-context'
  | 'brief-programming'
  | 'regulatory-intelligence'
  | 'engineering-disclosure';

export type EvidenceCategory =
  | 'geometry'
  | 'cost-qto'
  | 'code-compliance'
  | 'zoning-compliance'
  | 'spatial-program'
  | 'model-integrity'
  | 'multi-criteria'
  | 'structural-mep';

export interface EvidenceRecord {
  id: string;
  resultName: string;
  resultValue: string | number;
  unit?: string;
  module: EvidenceModule;
  category: EvidenceCategory;
  sourceProject: {
    projectId: string;
    projectName: string;
    versionOrHash: string;
  };
  relevantInputIdentifiers: string[];
  calculationMethod: string;
  inputValuesUsed: Record<string, string | number | boolean>;
  assumptionsAndExclusions: string[];
  sourceReferenceOrRateSource?: string;
  calculationVersion: string;
  lastCalculatedAt: string;
  validationStatus: ValidationStatus;
  statusExplanation: string;
  knownLimitations: string;
  requiredProfessionalReview: string;
  isAiGenerated: boolean;
  isFormalRequirement?: boolean; // formal physical/code requirement vs user preference
  staleReason?: string;
  recommendation?: string;
}

export interface EvidenceAuditSummary {
  projectId: string;
  projectName: string;
  timestamp: string;
  geometryHash: string;
  totalRecords: number;
  passCount: number;
  conflictCount: number;
  pendingCount: number;
  staleCount: number;
  notAssessedCount: number;
  failedCount: number;
  records: EvidenceRecord[];
}

export interface EvidenceFilterOptions {
  module?: EvidenceModule | 'all';
  status?: ValidationStatus | 'all';
  category?: EvidenceCategory | 'all';
  searchQuery?: string;
}
