import React from 'react';
import { GitFork, CheckCircle2, AlertCircle, Clock, HelpCircle } from 'lucide-react';
import { ConstraintGraphState } from '../../types/constraintGraph';

interface ConstraintGraphBadgeProps {
  state: ConstraintGraphState;
  onClick: () => void;
  compact?: boolean;
}

export const ConstraintGraphBadge: React.FC<ConstraintGraphBadgeProps> = ({
  state,
  onClick,
  compact = false,
}) => {
  const { summary } = state;
  const hasConflicts = summary.conflicts > 0;
  const hasPending = summary.pending > 0;

  let themeClasses = 'bg-teal-50 border-teal-200 text-teal-900 hover:bg-teal-100/80';
  let dotColor = 'bg-teal-500';

  if (hasConflicts) {
    themeClasses = 'bg-rose-50 border-rose-200 text-rose-900 hover:bg-rose-100/80';
    dotColor = 'bg-rose-500 animate-pulse';
  } else if (hasPending) {
    themeClasses = 'bg-amber-50 border-amber-200 text-amber-900 hover:bg-amber-100/80';
    dotColor = 'bg-amber-500';
  }

  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all shadow-2xs cursor-pointer ${themeClasses}`}
      title="Open Living Constraint Graph (Tracks project requirements, plot boundaries, geometry, and sync)"
      aria-label={`Living Constraint Graph: ${summary.passing} passing, ${summary.conflicts} conflicts, ${summary.pending} pending, ${summary.notAssessed} not assessed`}
    >
      <div className="flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
        <GitFork className="w-3.5 h-3.5 shrink-0 opacity-80" />
        <span className="font-semibold tracking-tight">Constraints</span>
      </div>

      <div className="flex items-center gap-1.5 text-[11px] tabular-nums font-semibold">
        {hasConflicts ? (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-rose-200/80 text-rose-950 font-bold">
            <AlertCircle className="w-3 h-3 text-rose-700" />
            {summary.conflicts} {compact ? 'Conflict' : 'Conflict' + (summary.conflicts > 1 ? 's' : '')}
          </span>
        ) : hasPending ? (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-200/80 text-amber-950 font-bold">
            <Clock className="w-3 h-3 text-amber-700" />
            {summary.pending} Pending
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-teal-200/60 text-teal-950">
            <CheckCircle2 className="w-3 h-3 text-teal-700" />
            {summary.passing}/{summary.total} Pass
          </span>
        )}

        {summary.notAssessed > 0 && !compact && (
          <span className="text-[10px] text-slate-500 font-normal hidden lg:inline">
            · {summary.notAssessed} N/A
          </span>
        )}
      </div>
    </button>
  );
};
