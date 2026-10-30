import React from 'react';
import { Project } from '../../types/project';
import { CostSummaryMetrics, CostScenario } from '../../types/costPlanning';
import { formatCurrency } from '../../utils/formatters';
import {
  DollarSign,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  BookOpen,
  Calendar,
  Layers,
  MapPin,
  Clock,
  ArrowRight,
} from 'lucide-react';

interface CostOverviewHeaderProps {
  project: Project;
  activeScenario: CostScenario;
  summary: CostSummaryMetrics;
  totalScheduleDays: number;
  projectedEndDate: string;
  onRecalculateTakeOff: () => void;
  onOpenAssumptionsModal: () => void;
  onTargetBudgetChange: (newBudget: number) => void;
}

export const CostOverviewHeader: React.FC<CostOverviewHeaderProps> = ({
  project,
  activeScenario,
  summary,
  totalScheduleDays,
  projectedEndDate,
  onRecalculateTakeOff,
  onOpenAssumptionsModal,
  onTargetBudgetChange,
}) => {
  const {
    estimatedTotal,
    targetBudget,
    budgetVariance,
    budgetVariancePercent,
    budgetStatus,
    contingencyAmount,
    isStale,
  } = summary;

  const getStatusBadge = () => {
    switch (budgetStatus) {
      case 'within-budget':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-teal-50 text-teal-800 border border-teal-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
            Within Target Budget (+{formatCurrency(budgetVariance, project.currency)})
          </span>
        );
      case 'over-budget':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-rose-50 text-rose-800 border border-rose-200">
            <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
            Over Target Budget ({formatCurrency(Math.abs(budgetVariance), project.currency)})
          </span>
        );
      case 'incomplete':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            Incomplete Estimate ({summary.missingRatesCount} rates pending)
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Staleness Alert Banner */}
      {isStale && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900 animate-in fade-in duration-150">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <strong className="block text-amber-950 font-bold mb-0.5">
                Floor-Plan Geometry Changed Since Last Take-Off
              </strong>
              Room dimensions or floor program have been updated in the 2D editor. Affected geometry-derived quantities are marked as stale.
            </div>
          </div>
          <button
            onClick={onRecalculateTakeOff}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-amber-700 hover:bg-amber-800 rounded-lg shadow-2xs transition-colors cursor-pointer shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Recalculate Take-Off</span>
          </button>
        </div>
      )}

      {/* Top Header Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
              <span className="flex items-center gap-1 font-medium text-slate-600">
                <MapPin className="w-3.5 h-3.5 text-teal-700" />
                {activeScenario.location}
              </span>
              <span>·</span>
              <span className="font-semibold text-slate-700 uppercase">
                {project.currency}
              </span>
              <span>·</span>
              <span className="capitalize font-medium text-slate-600">
                {project.unit}
              </span>
              <span>·</span>
              <span>{project.floors} {project.floors === 1 ? 'Floor' : 'Floors'}</span>
            </div>

            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-slate-900">
                {activeScenario.name}
              </h2>
              {getStatusBadge()}
            </div>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl">
              {activeScenario.description}
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={onRecalculateTakeOff}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer"
              title="Sync quantities with current 2D floor plan layout"
            >
              <RotateCcw className="w-3.5 h-3.5 text-teal-700" />
              <span>Sync QTO</span>
            </button>

            <button
              onClick={onOpenAssumptionsModal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5 text-teal-700" />
              <span>Assumptions & Limits</span>
            </button>
          </div>
        </div>

        {/* 4 Core Financial & Construction KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Grand Estimated Cost */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
              <span>Estimated Construction Cost</span>
              <DollarSign className="w-3.5 h-3.5 text-teal-700" />
            </div>
            <div className="text-2xl font-black text-slate-900 tabular-nums">
              {formatCurrency(estimatedTotal, project.currency)}
            </div>
            <div className="text-[11px] text-slate-500 flex items-center justify-between">
              <span>Subtotal: {formatCurrency(summary.subtotal, project.currency)}</span>
              <span>Contingency: +{formatCurrency(contingencyAmount, project.currency)}</span>
            </div>
          </div>

          {/* 2. Target Budget */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
              <span>Target Project Budget</span>
              <button
                type="button"
                onClick={() => {
                  const val = prompt('Enter new target budget amount:', String(targetBudget));
                  if (val && !isNaN(Number(val)) && Number(val) > 0) {
                    onTargetBudgetChange(Number(val));
                  }
                }}
                className="text-teal-700 hover:underline cursor-pointer text-[10px] lowercase"
              >
                edit target
              </button>
            </div>
            <div className="text-2xl font-black text-slate-900 tabular-nums">
              {formatCurrency(targetBudget, project.currency)}
            </div>
            <div className="text-[11px] text-slate-500">
              Allocated development capital
            </div>
          </div>

          {/* 3. Variance & Feasibility */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
              <span>Budget Variance</span>
              <TrendingUp className="w-3.5 h-3.5 text-teal-700" />
            </div>
            <div
              className={`text-2xl font-black tabular-nums ${
                budgetVariance >= 0 ? 'text-teal-800' : 'text-rose-700'
              }`}
            >
              {budgetVariance >= 0 ? '+' : ''}
              {formatCurrency(budgetVariance, project.currency)}
            </div>
            <div className="text-[11px] text-slate-500">
              {budgetVariance >= 0
                ? `${budgetVariancePercent}% contingency reserve`
                : `${Math.abs(budgetVariancePercent)}% budget overrun`}
            </div>
          </div>

          {/* 4. Preliminary Schedule */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
              <span>Preliminary Construction Duration</span>
              <Calendar className="w-3.5 h-3.5 text-teal-700" />
            </div>
            <div className="text-2xl font-black text-slate-900 tabular-nums">
              {totalScheduleDays} <span className="text-sm font-semibold text-slate-500">Days</span>
            </div>
            <div className="text-[11px] text-slate-500 flex items-center justify-between">
              <span>~{Math.round(totalScheduleDays / 7)} Weeks</span>
              <span>Est. End: {projectedEndDate}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
