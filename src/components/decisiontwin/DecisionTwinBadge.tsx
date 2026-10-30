import React from 'react';
import { DecisionTwinState } from '../../types/decisionTwin';
import { Network, CheckCircle2, AlertTriangle, AlertCircle, RefreshCw } from 'lucide-react';

interface DecisionTwinBadgeProps {
  state: DecisionTwinState;
  onClick: () => void;
  className?: string;
  compact?: boolean;
}

export const DecisionTwinBadge: React.FC<DecisionTwinBadgeProps> = ({
  state,
  onClick,
  className = '',
  compact = false,
}) => {
  let badgeClasses = 'bg-teal-50 border-teal-200 text-teal-800 hover:bg-teal-100';
  let dotColor = 'bg-teal-500';
  let label = 'Twin: In Sync';
  let Icon = CheckCircle2;

  if (state.overallStatus === 'geometric-violation') {
    badgeClasses = 'bg-red-50 border-red-200 text-red-800 hover:bg-red-100';
    dotColor = 'bg-red-500 animate-pulse';
    label = 'Twin: Geometry Issue';
    Icon = AlertCircle;
  } else if (state.overallStatus === 'stale-pending') {
    badgeClasses = 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100';
    dotColor = 'bg-amber-500 animate-pulse';
    label = state.hasUnsavedDraft ? 'Twin: Draft Divergence' : 'Twin: Sync Pending';
    Icon = AlertTriangle;
  }

  if (compact) {
    return (
      <button
        onClick={onClick}
        title={`Architectural Decision Twin: ${state.overallMessage} (Click to inspect)`}
        aria-label="Inspect Architectural Decision Twin"
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold transition-all cursor-pointer shadow-2xs ${badgeClasses} ${className}`}
      >
        <span className={`w-2 h-2 rounded-full ${dotColor}`} />
        <Network className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">{label}</span>
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      title="Open Architectural Decision Twin Inspector"
      aria-label="Open Architectural Decision Twin Inspector"
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer shadow-2xs group ${badgeClasses} ${className}`}
    >
      <span className={`w-2 h-2 rounded-full ${dotColor}`} />
      <Network className="w-3.5 h-3.5 shrink-0 text-slate-700 group-hover:text-slate-900" />
      <span className="tracking-tight">{label}</span>
      <span className="text-[10px] font-normal opacity-75 hidden lg:inline">
        · {state.derivedMetrics.totalBuiltArea} {state.unit === 'feet' ? 'sq ft' : 'm²'}
      </span>
    </button>
  );
};
