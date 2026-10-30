import { FacadeConcept, FloorPlanRoom, MeasurementUnit } from './project';

export type ScenarioStatus = 'baseline' | 'saved' | 'draft';

export interface DesignScenario {
  id: string;
  name: string;
  description?: string;
  status: ScenarioStatus;
  isBaseline: boolean;
  createdAt: string;
  updatedAt: string;
  // Core mutable scenario parameters
  floors: number;
  budget: number;
  rooms: FloorPlanRoom[];
  facade?: FacadeConcept;
  notes?: string;
}

export type MetricCategory =
  | 'spatial'
  | 'financial'
  | 'compliance'
  | 'environmental';

export type MetricStatus =
  | 'calculated'
  | 'not-assessed'
  | 'warning'
  | 'conflict';

export interface ScenarioMetricResult {
  id: string;
  name: string;
  category: MetricCategory;
  baselineRaw: number | string | null;
  scenarioRaw: number | string | null;
  baselineDisplay: string;
  scenarioDisplay: string;
  absoluteDelta: number | null;
  absoluteDeltaDisplay: string;
  percentChange: number | null;
  percentChangeDisplay: string;
  unit: string;
  status: MetricStatus;
  statusMessage: string;
  assumptions: string;
  higherIsBetter: boolean | 'neutral';
}

export interface OptimizationWeights {
  usableArea: number; // 0 - 100
  budgetEfficiency: number; // 0 - 100
  constraintCompliance: number; // 0 - 100
  carbonEfficiency: number; // 0 - 100
  plotEfficiency: number; // 0 - 100
}

export interface MetricScoreContribution {
  metricId: string;
  name: string;
  rawValue: number;
  normalizedScore: number; // 0 - 100
  weight: number;
  weightedPoints: number;
}

export interface ScenarioEvaluation {
  scenarioId: string;
  scenarioName: string;
  metrics: ScenarioMetricResult[];
  compositeScore: number; // 0 - 100
  scoreBreakdown: MetricScoreContribution[];
  isParetoOptimal: boolean;
  tradeOffSummary: string[];
  keyStrengths: string[];
  keyRisks: string[];
}
