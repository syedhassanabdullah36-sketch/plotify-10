import React from 'react';
import { Project } from '../../types/project';
import { CostSummaryMetrics, CostLineItem } from '../../types/costPlanning';
import { formatCurrency } from '../../utils/formatters';
import {
  Scale,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  PieChart,
  Target,
  ArrowRight,
  Boxes,
  HardHat,
  Wrench,
  Truck,
  Layers,
} from 'lucide-react';

interface BudgetControlPanelProps {
  project: Project;
  summary: CostSummaryMetrics;
}

export const BudgetControlPanel: React.FC<BudgetControlPanelProps> = ({
  project,
  summary,
}) => {
  const {
    estimatedTotal,
    targetBudget,
    budgetVariance,
    budgetVariancePercent,
    budgetStatus,
    subtotalByCategory,
    categoryPercentages,
    topCostDrivers,
    missingRatesCount,
  } = summary;

  const budgetUsagePercent =
    targetBudget > 0 ? Math.min(100, Math.round((estimatedTotal / targetBudget) * 100)) : 100;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Target className="w-4 h-4 text-teal-700" />
            Budget Control & Financial Variance Analysis
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time reconciliation between declared project budget and preliminary bill of quantities.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {budgetStatus === 'within-budget' && (
            <span className="text-xs font-bold text-teal-800 bg-teal-50 px-2.5 py-1 rounded-lg border border-teal-200 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
              Budget Feasible
            </span>
          )}
          {budgetStatus === 'over-budget' && (
            <span className="text-xs font-bold text-rose-800 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
              Over Budget
            </span>
          )}
          {budgetStatus === 'incomplete' && (
            <span className="text-xs font-bold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              Incomplete Data
            </span>
          )}
        </div>
      </div>

      {/* Progress Bar of Budget Consumed */}
      <div className="space-y-2 bg-slate-50 p-4 rounded-xl border border-slate-200">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-700">
            Target Budget Utilization ({budgetUsagePercent}% allocated)
          </span>
          <span className="tabular-nums font-bold text-slate-900">
            {formatCurrency(estimatedTotal, project.currency)} / {formatCurrency(targetBudget, project.currency)}
          </span>
        </div>

        <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
          <div
            className={`h-3 rounded-full transition-all duration-300 ${
              budgetUsagePercent > 100
                ? 'bg-rose-600'
                : budgetUsagePercent > 85
                ? 'bg-amber-500'
                : 'bg-teal-700'
            }`}
            style={{ width: `${Math.min(100, budgetUsagePercent)}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
          <span>0%</span>
          <span className="font-semibold text-slate-700">
            {budgetVariance >= 0
              ? `Uncommitted Contingency Buffer: +${formatCurrency(budgetVariance, project.currency)}`
              : `Capital Shortfall: -${formatCurrency(Math.abs(budgetVariance), project.currency)}`}
          </span>
          <span>100% Target</span>
        </div>
      </div>

      {/* Category Breakdown & Top Cost Drivers Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Breakdown */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800">
              Expenditure Breakdown by Cost Category
            </span>
            <span className="text-[11px] text-slate-400">Direct Base</span>
          </div>

          <div className="space-y-2.5">
            {/* Materials */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700 flex items-center gap-1.5">
                  <Boxes className="w-3.5 h-3.5 text-blue-600" />
                  Building Materials
                </span>
                <span className="tabular-nums font-semibold text-slate-900">
                  {formatCurrency(subtotalByCategory.materials, project.currency)}{' '}
                  <span className="text-slate-400 font-normal">({categoryPercentages.materials}%)</span>
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-blue-600 h-1.5 rounded-full"
                  style={{ width: `${categoryPercentages.materials}%` }}
                />
              </div>
            </div>

            {/* Labour */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700 flex items-center gap-1.5">
                  <HardHat className="w-3.5 h-3.5 text-amber-600" />
                  Site Labour & Trades
                </span>
                <span className="tabular-nums font-semibold text-slate-900">
                  {formatCurrency(subtotalByCategory.labour, project.currency)}{' '}
                  <span className="text-slate-400 font-normal">({categoryPercentages.labour}%)</span>
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-amber-600 h-1.5 rounded-full"
                  style={{ width: `${categoryPercentages.labour}%` }}
                />
              </div>
            </div>

            {/* Equipment */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700 flex items-center gap-1.5">
                  <Wrench className="w-3.5 h-3.5 text-emerald-600" />
                  Plant & Machinery Rentals
                </span>
                <span className="tabular-nums font-semibold text-slate-900">
                  {formatCurrency(subtotalByCategory.equipment, project.currency)}{' '}
                  <span className="text-slate-400 font-normal">({categoryPercentages.equipment}%)</span>
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-emerald-600 h-1.5 rounded-full"
                  style={{ width: `${categoryPercentages.equipment}%` }}
                />
              </div>
            </div>

            {/* Transport */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700 flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5 text-indigo-600" />
                  Logistics & Waste Disposal
                </span>
                <span className="tabular-nums font-semibold text-slate-900">
                  {formatCurrency(subtotalByCategory.transport, project.currency)}{' '}
                  <span className="text-slate-400 font-normal">({categoryPercentages.transport}%)</span>
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-indigo-600 h-1.5 rounded-full"
                  style={{ width: `${categoryPercentages.transport}%` }}
                />
              </div>
            </div>

            {/* Other */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-slate-600" />
                  Preliminaries & Permits
                </span>
                <span className="tabular-nums font-semibold text-slate-900">
                  {formatCurrency(subtotalByCategory.other, project.currency)}{' '}
                  <span className="text-slate-400 font-normal">({categoryPercentages.other}%)</span>
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-slate-600 h-1.5 rounded-full"
                  style={{ width: `${categoryPercentages.other}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Top 5 Cost Drivers (Pareto Analysis) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800">
              Pareto Cost Drivers (Greatest Effect on Total)
            </span>
            <span className="text-[11px] text-slate-400">% of Grand Total</span>
          </div>

          <div className="space-y-2">
            {topCostDrivers.map(({ item, percentOfTotal }: { item: CostLineItem; percentOfTotal: number }, idx: number) => (
              <div
                key={item.id}
                className="p-2.5 bg-slate-50/80 rounded-lg border border-slate-200/80 flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-2 max-w-[70%]">
                  <span className="w-5 h-5 rounded-md bg-slate-200 text-slate-700 font-bold text-[10px] flex items-center justify-center shrink-0">
                    {idx + 1}
                  </span>
                  <div>
                    <div className="font-bold text-slate-900 truncate">{item.name}</div>
                    <div className="text-[10px] text-slate-500 font-mono">
                      {item.code} · {item.quantity} {item.unit} @ {formatCurrency(item.unitRate, project.currency)}
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="font-black text-slate-900 tabular-nums">
                    {formatCurrency(item.extendedCost, project.currency)}
                  </div>
                  <div className="text-[10px] font-semibold text-teal-700">
                    {percentOfTotal}% of total
                  </div>
                </div>
              </div>
            ))}
          </div>

          {missingRatesCount > 0 && (
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-[11px] text-amber-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>{missingRatesCount} line item{missingRatesCount === 1 ? '' : 's'}</strong> have zero rates or unverified quantities. Fill them in to finalize your estimate.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
