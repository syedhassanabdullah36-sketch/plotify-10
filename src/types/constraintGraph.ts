export type ConstraintStatus = 'pass' | 'conflict' | 'pending' | 'not-assessed';

export type ConstraintCategory =
  | 'plot-envelope'
  | 'room-geometry'
  | 'floor-program'
  | 'program-requirements'
  | '2d-3d-dependency'
  | 'budget-alignment'
  | 'regulatory-compliance'
  | 'structural-coordination'
  | 'mep-coordination'
  | 'project-units';

export interface ConstraintValueItem {
  label: string;
  value: string | number;
  unit?: string;
}

export interface ConstraintRecommendation {
  actionLabel: string;
  actionType:
    | 'navigate-floor-plan'
    | 'navigate-edit-project'
    | 'navigate-3d-viewer'
    | 'sync-3d'
    | 'select-room';
  targetRoomId?: string;
  details: string;
}

export interface ConstraintNode {
  id: string;
  projectId: string;
  category: ConstraintCategory;
  title: string;
  description: string;
  sourceRequirement: ConstraintValueItem;
  designValue: ConstraintValueItem;
  comparisonRule: string;
  status: ConstraintStatus;
  statusReason: string;
  affectedElements: string[];
  recommendation?: ConstraintRecommendation;
  dataVersion: string;
  lastEvaluatedAt: string;
}

export interface ConstraintSummary {
  total: number;
  passing: number;
  conflicts: number;
  pending: number;
  notAssessed: number;
}

export interface ConstraintGraphState {
  projectId: string;
  projectName: string;
  dataVersion: string;
  lastEvaluatedAt: string;
  constraints: ConstraintNode[];
  summary: ConstraintSummary;
  isEvaluating: boolean;
}
