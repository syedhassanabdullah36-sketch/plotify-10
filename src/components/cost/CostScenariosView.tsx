import React from 'react';
import { Project } from '../../types/project';
import { CostScenario } from '../../types/costPlanning';
import { calculateCostSummary } from '../../services/costPlanningService';
import { formatCurrency } from '../../utils/formatters';
import {
  Scale,
  Plus,
  Copy,
  Trash2,
  Check,
  TrendingDown,
  TrendingUp,
  Layers,
  Percent,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

interface CostScenariosViewProps {
  project: Project;
  scenarios: CostScenario[];
  activeScenarioId: string;
  targetBudget: number;
  onSelectScenario: (id: string) => void;
  onCreateScenario: () => void;
  onDuplicateScenario: (id: string) => void;
  onDeleteScenario: (id: string) => void;
}

export const CostScenariosView: React.FC<CostScenariosViewProps> = ({
  project,
  scenarios,
  activeScenarioId,
  targetBudget,
  onSelectScenario,
  onCreateScenario,
  onDuplicateScenario,
  onDeleteScenario,
}) => {
  // Baseline scenario summary for delta comparisons
  const baselineScenario = scenarios.find((s) => s.isBaseline) || scenarios[0];
  const baselineSummary = calculateCostSummary(baselineScenario, targetBudget);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-teal-700" />
            <h3 className="text-base font-bold text-slate-900">
              Cost Scenario Synthesis & Comparison Matrix
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Evaluate alternative material specifications, value engineering targets, and rate sensitivities side-by-side.
          </p>
        </div>

        <button
          onClick={onCreateScenario}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-teal-800 hover:bg-teal-900 rounded-lg shadow-2xs transition-colors cursor-pointer self-start sm:self-center"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Cost Scenario</span>
        </button>
      </div>

      {/* Grid of Scenario Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {scenarios.map((scenario) => {
          const isActive = scenario.id === activeScenarioId;
          const summary = calculateCostSummary(scenario, targetBudget);
          const deltaVsBaseline = summary.estimatedTotal - baselineSummary.estimatedTotal;
          const deltaPct =
            baselineSummary.estimatedTotal > 0
              ? Math.round((deltaVsBaseline / baselineSummary.estimatedTotal) * 1000) / 10
              : 0;

          return (
            <div
              key={scenario.id}
              className={`rounded-xl border p-5 flex flex-col justify-between transition-all ${
                isActive
                  ? 'border-teal-500 bg-teal-50/20 ring-1 ring-teal-500 shadow-xs'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="space-y-3">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      {scenario.isBaseline ? 'Baseline Estimate' : 'Alternative Option'}
                    </div>
                    <h4 className="text-sm font-bold text-slate-900">
                      {scenario.name}
                    </h4>
                  </div>

                  {isActive ? (
                    <span className="text-[10px] font-bold text-teal-800 bg-teal-100 px-2 py-0.5 rounded-md flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      Active
                    </span>
                  ) : (
                    <button
                      onClick={() => onSelectScenario(scenario.id)}
                      className="text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer underline"
                    >
                      Set Active
                    </button>
                  )}
                </div>

                <p className="text-xs text-slate-500 line-clamp-2">
                  {scenario.description}
                </p>

                {/* Big Metric: Total */}
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                  <div className="text-[10px] text-slate-500 font-semibold uppercase">
                    Grand Estimated Total
                  </div>
                  <div className="text-xl font-black text-slate-900 tabular-nums">
                    {formatCurrency(summary.estimatedTotal, project.currency)}
                  </div>

                  {!scenario.isBaseline && (
                    <div
                      className={`text-[11px] font-semibold flex items-center gap-1 ${
                        deltaVsBaseline <= 0 ? 'text-teal-700' : 'text-rose-700'
                      }`}
                    >
                      {deltaVsBaseline <= 0 ? (
                        <TrendingDown className="w-3 h-3" />
                      ) : (
                        <TrendingUp className="w-3 h-3" />
                      )}
                      <span>
                        {deltaVsBaseline > 0 ? '+' : ''}
                        {formatCurrency(deltaVsBaseline, project.currency)} ({deltaPct}%) vs Baseline
                      </span>
                    </div>
                  )}
                </div>

                {/* Breakdown details */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-slate-50/70 p-2 rounded-md">
                    <span className="text-[10px] text-slate-400 block">Materials:</span>
                    <span className="font-semibold text-slate-800">
                      {formatCurrency(summary.subtotalByCategory.materials, project.currency)}
                    </span>
                  </div>

                  <div className="bg-slate-50/70 p-2 rounded-md">
                    <span className="text-[10px] text-slate-400 block">Labour:</span>
                    <span className="font-semibold text-slate-800">
                      {formatCurrency(summary.subtotalByCategory.labour, project.currency)}
                    </span>
                  </div>

                  <div className="bg-slate-50/70 p-2 rounded-md">
                    <span className="text-[10px] text-slate-400 block">Contingency:</span>
                    <span className="font-semibold text-slate-800">
                      {scenario.contingencyRatePercent}% ({formatCurrency(summary.contingencyAmount, project.currency)})
                    </span>
                  </div>

                  <div className="bg-slate-50/70 p-2 rounded-md">
                    <span className="text-[10px] text-slate-400 block">Budget Variance:</span>
                    <span
                      className={`font-semibold tabular-nums ${
                        summary.budgetVariance >= 0 ? 'text-teal-700' : 'text-rose-700'
                      }`}
                    >
                      {summary.budgetVariance >= 0 ? '+' : ''}
                      {formatCurrency(summary.budgetVariance, project.currency)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Card Footer Actions */}
              <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-100">
                <button
                  onClick={() => onDuplicateScenario(scenario.id)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                  title="Duplicate scenario as new option"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Duplicate</span>
                </button>

                {!scenario.isBaseline && (
                  <button
                    onClick={() => onDeleteScenario(scenario.id)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-rose-600 cursor-pointer"
                    title="Delete scenario"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
