/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AlertTriangle, RefreshCw, GitCommit, ArrowRight } from 'lucide-react';

interface StaleAnalysisBannerProps {
  analysisName: string;
  calculatedAt?: string;
  projectUpdatedAt?: string;
  isStale: boolean;
  onRecalculate?: () => void;
  onOpenVersionHistory?: () => void;
}

export const StaleAnalysisBanner: React.FC<StaleAnalysisBannerProps> = ({
  analysisName,
  isStale,
  onRecalculate,
  onOpenVersionHistory,
}) => {
  if (!isStale) return null;

  return (
    <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-amber-900 shadow-2xs">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold block">
            Potentially Stale Analysis — Revision Desync
          </span>
          <span className="text-amber-800 text-[11px] leading-relaxed">
            Architectural geometry, room dimensions, or structural grid elements have changed since the {analysisName} analysis was last evaluated.
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
        {onOpenVersionHistory && (
          <button
            type="button"
            onClick={onOpenVersionHistory}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-amber-900 bg-amber-100/80 hover:bg-amber-200/80 border border-amber-300 rounded-lg transition-colors cursor-pointer"
          >
            <GitCommit className="w-3 h-3" />
            <span>View Changes</span>
          </button>
        )}
        {onRecalculate && (
          <button
            type="button"
            onClick={onRecalculate}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-semibold text-white bg-amber-700 hover:bg-amber-800 rounded-lg transition-colors shadow-2xs cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Recalculate Analysis</span>
          </button>
        )}
      </div>
    </div>
  );
};
