import React, { useState } from 'react';
import {
  MetricCategory,
  ScenarioMetricResult,
} from '../../types/scenario';
import {
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  HelpCircle,
  Info,
  Maximize2,
  DollarSign,
  ShieldCheck,
  Leaf,
  Layers,
} from 'lucide-react';

interface ImpactComparisonTableProps {
  metrics: ScenarioMetricResult[];
  baselineName: string;
  scenarioName: string;
}

export const ImpactComparisonTable: React.FC<ImpactComparisonTableProps> = ({
  metrics,
  baselineName,
  scenarioName,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<MetricCategory | 'all'>('all');
  const [expandedMetricId, setExpandedMetricId] = useState<string | null>(null);

  const filteredMetrics =
    selectedCategory === 'all'
      ? metrics
      : metrics.filter((m) => m.category === selectedCategory);

  const getDeltaBadgeStyle = (m: ScenarioMetricResult) => {
    if (m.absoluteDelta === null || Math.abs(m.absoluteDelta) < 0.001) {
      return 'text-slate-500 bg-slate-50 border-slate-200';
    }

    if (m.higherIsBetter === 'neutral') {
      return 'text-slate-700 bg-slate-100 border-slate-200';
    }

    const isPositiveChange = m.absoluteDelta > 0;
    const isGood = m.higherIsBetter ? isPositiveChange : !isPositiveChange;

    if (isGood) {
      return 'text-teal-800 bg-teal-50 border-teal-200';
    }
    return 'text-rose-800 bg-rose-50 border-rose-200';
  };

  const getStatusIcon = (status: ScenarioMetricResult['status']) => {
    switch (status) {
      case 'calculated':
        return (
          <span title="Deterministic calculation verified">
            <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
          </span>
        );
      case 'warning':
        return (
          <span title="Threshold warning">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
          </span>
        );
      case 'conflict':
        return (
          <span title="Regulatory / Spatial conflict">
            <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
          </span>
        );
      default:
        return (
          <span title="Not assessed">
            <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
          </span>
        );
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden space-y-4 p-5">
      {/* Category Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-teal-700" />
          <h3 className="text-sm font-bold text-slate-900">
            Side-by-Side Measurable Impact Matrix
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
              selectedCategory === 'all'
                ? 'bg-teal-800 text-white border-teal-800'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            All Metrics ({metrics.length})
          </button>
          <button
            onClick={() => setSelectedCategory('spatial')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
              selectedCategory === 'spatial'
                ? 'bg-teal-800 text-white border-teal-800'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            Spatial & Area
          </button>
          <button
            onClick={() => setSelectedCategory('financial')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
              selectedCategory === 'financial'
                ? 'bg-teal-800 text-white border-teal-800'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            Financial & Budget
          </button>
          <button
            onClick={() => setSelectedCategory('compliance')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
              selectedCategory === 'compliance'
                ? 'bg-teal-800 text-white border-teal-800'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            Compliance & Rules
          </button>
          <button
            onClick={() => setSelectedCategory('environmental')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
              selectedCategory === 'environmental'
                ? 'bg-teal-800 text-white border-teal-800'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            Carbon & Ecology
          </button>
        </div>
      </div>

      {/* Comparison Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
              <th className="py-3 px-4">Metric</th>
              <th className="py-3 px-3 text-right">Baseline ({baselineName})</th>
              <th className="py-3 px-3 text-right">Scenario ({scenarioName})</th>
              <th className="py-3 px-3 text-right">Absolute Delta</th>
              <th className="py-3 px-3 text-right">% Change</th>
              <th className="py-3 px-3 text-center">Status</th>
              <th className="py-3 px-3 text-center">Assumptions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredMetrics.map((m) => {
              const isExpanded = expandedMetricId === m.id;
              const deltaBadge = getDeltaBadgeStyle(m);

              return (
                <React.Fragment key={m.id}>
                  <tr className="hover:bg-slate-50/70 transition-colors">
                    {/* Metric Name & Category */}
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{m.name}</div>
                      <div className="text-[10px] text-slate-400 capitalize">
                        {m.category} · {m.unit}
                      </div>
                    </td>

                    {/* Baseline */}
                    <td className="py-3 px-3 text-right font-medium text-slate-600 tabular-nums">
                      {m.baselineDisplay}
                    </td>

                    {/* Scenario */}
                    <td className="py-3 px-3 text-right font-bold text-slate-900 tabular-nums">
                      {m.scenarioDisplay}
                    </td>

                    {/* Absolute Delta */}
                    <td className="py-3 px-3 text-right tabular-nums">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-md font-semibold text-[11px] border ${deltaBadge}`}
                      >
                        {m.absoluteDeltaDisplay}
                      </span>
                    </td>

                    {/* Percentage Change */}
                    <td className="py-3 px-3 text-right font-semibold text-slate-700 tabular-nums">
                      {m.percentChangeDisplay}
                    </td>

                    {/* Calculation Status */}
                    <td className="py-3 px-3 text-center">
                      <div className="inline-flex items-center justify-center">
                        {getStatusIcon(m.status)}
                      </div>
                    </td>

                    {/* Technical Notes Toggle */}
                    <td className="py-3 px-3 text-center">
                      <button
                        onClick={() =>
                          setExpandedMetricId(isExpanded ? null : m.id)
                        }
                        className="p-1 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
                        title="View calculation formula and assumptions"
                      >
                        <Info className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>

                  {/* Expanded Assumptions Row */}
                  {isExpanded && (
                    <tr className="bg-slate-50/80">
                      <td colSpan={7} className="py-3 px-4 text-xs text-slate-600 border-t border-slate-200">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-800">
                              Status Assessment:
                            </span>
                            <span className="text-slate-700">{m.statusMessage}</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <span className="font-bold text-slate-800 shrink-0">
                              Calculation Assumptions:
                            </span>
                            <span className="text-slate-600">{m.assumptions}</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
