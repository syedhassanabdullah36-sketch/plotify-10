export type DependencyNodeId =
  | 'project-spec'
  | 'floorplan-2d'
  | 'derived-metrics'
  | 'model-3d'
  | 'facade-envelope'
  | 'interior-schedules'
  | 'structural-mep'
  | 'regulatory-compliance';

export type TwinNodeStatus = 'current' | 'stale' | 'failed' | 'not-available';

export type TwinCategory =
  | 'specification'
  | 'geometry'
  | 'analytics'
  | 'visualization'
  | 'finishes'
  | 'engineering';

export interface TwinValidationIssue {
  id: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  affectedElement?: string;
  remedy?: string;
}

export interface DependencyNode {
  id: DependencyNodeId;
  name: string;
  category: TwinCategory;
  status: TwinNodeStatus;
  statusMessage: string;
  lastUpdated: string;
  sourceIds: DependencyNodeId[];
  dependentIds: DependencyNodeId[];
  metrics?: Record<string, string | number>;
  issues?: TwinValidationIssue[];
  isSupported: boolean;
  unsupportedReason?: string;
}

export interface DerivedMetrics {
  plotArea: number;
  groundFloorArea: number;
  totalBuiltArea: number;
  groundCoveragePercent: number; // groundFloorArea / plotArea * 100
  floorAreaRatio: number; // totalBuiltArea / plotArea
  roomCount: number;
  programmedRoomCount: number;
  unplacedProgramRooms: string[];
  floorBreakdown: Record<number, { roomCount: number; area: number }>;
}

export interface TwinImpactEvent {
  id: string;
  timestamp: string;
  title: string;
  description: string;
  affectedNodes: DependencyNodeId[];
  severity: 'info' | 'warning' | 'error' | 'success';
}

export interface DecisionTwinState {
  projectId: string;
  projectName: string;
  unit: 'feet' | 'metres';
  overallStatus: 'synchronized' | 'stale-pending' | 'geometric-violation' | 'degraded';
  overallMessage: string;
  lastEvaluationTimestamp: string;
  geometryHash: string;
  designHash: string;
  hasUnsavedDraft: boolean;
  draftChangesCount: number;
  nodes: Record<DependencyNodeId, DependencyNode>;
  derivedMetrics: DerivedMetrics;
  recentEvents: TwinImpactEvent[];
}
