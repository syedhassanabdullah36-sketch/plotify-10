import React from 'react';
import {
  OptimizationWeights,
  ScenarioEvaluation,
} from '../../types/scenario';
import { WEIGHT_PRESETS } from '../../services/scenarioCalculator';
import {
  SlidersHorizontal,
  Award,
  Sparkles,
  TrendingUp,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Leaf,
  Scale,
  Maximize2,
  DollarSign,
  Info,
} from 'lucide-react';

interface MultiCriteriaOptimizerPanelProps {
  evaluation: ScenarioEvaluation;
  weights: OptimizationWeights;
  onUpdateWeights: (newWeights: OptimizationWeights) => void;
  onSelectPreset: (presetKey: string) => void;
  activePresetKey: string | null;
}

export const MultiCriteriaOptimizerPanel: React.FC<MultiCriteriaOptimizerPanelProps> = ({
  evaluation,
  weights,
  onUpdateWeights,
  onSelectPreset,
  activePresetKey,
}) => {
  const { compositeScore, scoreBreakdown, isParetoOptimal, tradeOffSummary, keyStrengths, keyRisks } = evaluation;

  const handleSliderChange = (key: keyof OptimizationWeights, val: number) => {
    onUpdateWeights({
      ...weights,
      [key]: val,
    });
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-teal-700 bg-teal-50 border-teal-200';
    if (score >= 60) return 'text-cyan-700 bg-cyan-50 border-cyan-200';
    if (score >= 40) return 'text-amber-700 bg-amber-50 border-amber-200';
    return 'text-rose-700 bg-rose-50 border-rose-200';
  };

  const getCriterionIcon = (id: string) => {
    switch (id) {
      case 'usableArea':
        return <Maximize2 className="w-3.5 h-3.5 text-indigo-600" />;
      case 'budgetEfficiency':
        return <DollarSign className="w-3.5 h-3.5 text-emerald-600" />;
      case 'constraintCompliance':
        return <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />;
      case 'carbonEfficiency':
        return <Leaf className="w-3.5 h-3.5 text-emerald-700" />;
      case 'plotEfficiency':
        return <Scale className="w-3.5 h-3.5 text-cyan-600" />;
      default:
        return <Scale className="w-3.5 h-3.5 text-slate-500" />;
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-6">
      {/* Header and Top Metrics */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-teal-700" />
            <h3 className="text-base font-bold text-slate-900">
              Multi-Criteria Design Optimizer
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Deterministic weighted synthesis across architectural program, financial bounds, code compliance, and embodied carbon.
          </p>
        </div>

        {/* Composite Score Card & Pareto Badge */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-200">
            <div>
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                Composite Score
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black text-slate-900 tabular-nums">
                  {compositeScore}
                </span>
                <span className="text-xs font-semibold text-slate-400">/ 100</span>
              </div>
            </div>

            <div
              className={`px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 ${getScoreColor(
                compositeScore
              )}`}
            >
              <Award className="w-4 h-4" />
              <span>
                {compositeScore >= 80
                  ? 'Highly Recommended'
                  : compositeScore >= 65
                  ? 'Viable Trade-Off'
                  : compositeScore >= 50
                  ? 'Moderate Conflict'
                  : 'Needs Redesign'}
              </span>
            </div>
          </div>

          <div
            className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
              isParetoOptimal
                ? 'bg-teal-50 text-teal-800 border-teal-200'
                : 'bg-slate-50 text-slate-600 border-slate-200'
            }`}
            title={
              isParetoOptimal
                ? 'Non-dominated design alternative: No other scenario is strictly better in all criteria without sacrificing another.'
                : 'Dominated scenario: Another alternative offers strictly better space or cost with equal or fewer conflicts.'
            }
          >
            <Sparkles className="w-4 h-4 text-teal-700" />
            <div>
              <div className="text-[10px] uppercase tracking-wider font-bold">
                Pareto Frontier
              </div>
              <div>{isParetoOptimal ? 'Optimal / Non-Dominated' : 'Sub-Optimal Alternative'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Criteria Weight Presets & Sliders */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
            <SlidersHorizontal className="w-3.5 h-3.5 text-slate-600" />
            <span>Criteria Priority Weighting</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-medium text-slate-400 mr-1">Presets:</span>
            {Object.entries(WEIGHT_PRESETS).map(([key, preset]) => (
              <button
                key={key}
                onClick={() => onSelectPreset(key)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md border transition-colors cursor-pointer ${
                  activePresetKey === key
                    ? 'bg-teal-800 text-white border-teal-800 shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
                title={preset.description}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sliders Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 bg-slate-50/60 p-4 rounded-xl border border-slate-200">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700 flex items-center gap-1">
                <Maximize2 className="w-3 h-3 text-indigo-600" />
                Living Area
              </span>
              <span className="font-bold text-slate-900 tabular-nums">
                {weights.usableArea}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="60"
              step="5"
              value={weights.usableArea}
              onChange={(e) => handleSliderChange('usableArea', Number(e.target.value))}
              className="w-full accent-teal-700 cursor-pointer"
            />
            <div className="text-[10px] text-slate-400">Usable floor space volume</div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700 flex items-center gap-1">
                <DollarSign className="w-3 h-3 text-emerald-600" />
                Cost Feasibility
              </span>
              <span className="font-bold text-slate-900 tabular-nums">
                {weights.budgetEfficiency}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="60"
              step="5"
              value={weights.budgetEfficiency}
              onChange={(e) => handleSliderChange('budgetEfficiency', Number(e.target.value))}
              className="w-full accent-teal-700 cursor-pointer"
            />
            <div className="text-[10px] text-slate-400">Budget buffer & unit cost</div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-teal-600" />
                Code & Geometry
              </span>
              <span className="font-bold text-slate-900 tabular-nums">
                {weights.constraintCompliance}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="60"
              step="5"
              value={weights.constraintCompliance}
              onChange={(e) => handleSliderChange('constraintCompliance', Number(e.target.value))}
              className="w-full accent-teal-700 cursor-pointer"
            />
            <div className="text-[10px] text-slate-400">Living Constraint compliance</div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700 flex items-center gap-1">
                <Leaf className="w-3 h-3 text-emerald-700" />
                Embodied Carbon
              </span>
              <span className="font-bold text-slate-900 tabular-nums">
                {weights.carbonEfficiency}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="60"
              step="5"
              value={weights.carbonEfficiency}
              onChange={(e) => handleSliderChange('carbonEfficiency', Number(e.target.value))}
              className="w-full accent-teal-700 cursor-pointer"
            />
            <div className="text-[10px] text-slate-400">Material lifecycle CO₂e</div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700 flex items-center gap-1">
                <Scale className="w-3 h-3 text-cyan-600" />
                Site Utilization
              </span>
              <span className="font-bold text-slate-900 tabular-nums">
                {weights.plotEfficiency}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="40"
              step="5"
              value={weights.plotEfficiency}
              onChange={(e) => handleSliderChange('plotEfficiency', Number(e.target.value))}
              className="w-full accent-teal-700 cursor-pointer"
            />
            <div className="text-[10px] text-slate-400">Ground coverage efficiency</div>
          </div>
        </div>
      </div>

      {/* Transparent Score Contribution Breakdown */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-800">
            Transparent Score Contribution Breakdown
          </span>
          <span className="text-[11px] text-slate-400 italic">
            Sum of weighted contributions = {compositeScore} pts
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {scoreBreakdown.map((item) => (
            <div
              key={item.metricId}
              className="p-3 bg-white border border-slate-200 rounded-lg space-y-1.5 shadow-2xs"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                  {getCriterionIcon(item.metricId)}
                  <span className="truncate">{item.name}</span>
                </span>
                <span className="font-bold text-slate-900 tabular-nums">
                  +{item.weightedPoints}
                </span>
              </div>

              {/* Mini progress bar */}
              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-teal-700 h-1.5 rounded-full transition-all"
                  style={{ width: `${item.normalizedScore}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[10px] text-slate-400">
                <span>Norm: {item.normalizedScore}/100</span>
                <span>Wt: {item.weight}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Trade-Off Articulation & Findings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
        {/* Identified Trade-Offs */}
        <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
            <TrendingUp className="w-4 h-4 text-amber-700 shrink-0" />
            <span>Identified Pareto Trade-Offs</span>
          </div>

          {tradeOffSummary.length > 0 ? (
            <ul className="space-y-1.5 text-xs text-amber-800">
              {tradeOffSummary.map((item, idx) => (
                <li key={idx} className="flex items-start gap-1.5">
                  <ArrowRight className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-xs text-amber-700 italic">
              No significant trade-off divergence from the baseline design detected.
            </div>
          )}
        </div>

        {/* Strengths & Risks */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
          {keyStrengths.length > 0 && (
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-teal-800 uppercase tracking-wider block">
                Measurable Strengths
              </span>
              <ul className="space-y-1 text-xs text-slate-700">
                {keyStrengths.map((s, idx) => (
                  <li key={idx} className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-600 shrink-0" />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {keyRisks.length > 0 && (
            <div className="space-y-1 pt-2 border-t border-slate-200">
              <span className="text-[11px] font-bold text-rose-800 uppercase tracking-wider block">
                Trade-Off Warnings & Risks
              </span>
              <ul className="space-y-1 text-xs text-slate-700">
                {keyRisks.map((r, idx) => (
                  <li key={idx} className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-600 shrink-0" />
                    <span className="text-rose-900">{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
