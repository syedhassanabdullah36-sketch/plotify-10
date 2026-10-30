import { Currency, MeasurementUnit } from './project';

export type CostItemCategory =
  | 'materials'
  | 'labour'
  | 'equipment'
  | 'transport'
  | 'other';

export type QuantitySource =
  | 'geometry-derived'
  | 'user-entered'
  | 'rate-book';

export interface CostLineItem {
  id: string;
  code: string; // e.g. M-01, L-01
  category: CostItemCategory;
  name: string;
  description: string;
  quantity: number;
  unit: string; // sq ft, m², lin ft, lin m, hrs, days, units, lump sum
  unitRate: number;
  extendedCost: number; // quantity * unitRate
  quantitySource: QuantitySource;
  calculationFormula: string;
  assumptions: string;
  isStale?: boolean;
  supplierOrSource?: string;
  location?: string;
  rateDate?: string;
  notes?: string;
}

export type ConstructionPhaseStatus =
  | 'not-started'
  | 'in-progress'
  | 'blocked'
  | 'complete';

export interface ConstructionPhase {
  id: string;
  phaseNumber: number;
  name: string;
  description: string;
  startDate: string; // YYYY-MM-DD
  durationDays: number;
  dependencies: string[]; // IDs of predecessor phases
  responsibleParty: string;
  allocatedBudget: number;
  status: ConstructionPhaseStatus;
  notes?: string;
}

export interface PhaseConflictWarning {
  phaseId: string;
  phaseName: string;
  predecessorId: string;
  predecessorName: string;
  reason: string;
}

export interface CostScenario {
  id: string;
  name: string;
  description: string;
  isBaseline: boolean;
  createdAt: string;
  updatedAt: string;
  location: string;
  currency: Currency;
  contingencyRatePercent: number; // e.g. 7.5 (%)
  taxRatePercent: number; // e.g. 0 or 5 (%)
  lineItems: CostLineItem[];
  sourceGeometryHash: string;
}

export interface CostPlanningState {
  scenarios: CostScenario[];
  activeScenarioId: string;
  phases: ConstructionPhase[];
  targetBudget: number;
  currency: Currency;
  lastRecalculatedAt: string;
  lastGeometryHash: string;
}

export interface CostSummaryMetrics {
  subtotalByCategory: Record<CostItemCategory, number>;
  categoryPercentages: Record<CostItemCategory, number>;
  subtotal: number;
  contingencyAmount: number;
  taxAmount: number;
  estimatedTotal: number;
  targetBudget: number;
  budgetVariance: number; // targetBudget - estimatedTotal
  budgetVariancePercent: number; // (budgetVariance / targetBudget) * 100
  budgetStatus: 'within-budget' | 'over-budget' | 'incomplete';
  missingRatesCount: number;
  topCostDrivers: Array<{
    item: CostLineItem;
    percentOfTotal: number;
  }>;
  isStale: boolean;
}
