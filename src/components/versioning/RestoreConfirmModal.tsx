/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  RotateCcw,
  X,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Eye,
  Lock,
} from 'lucide-react';
import { Project } from '../../types/project';
import { ProjectSnapshot } from '../../types/versioning';
import { validateRestoreSnapshot } from '../../services/versioningService';
import { computeProjectDiff } from '../../services/versionDiffEngine';
import { formatDate } from '../../utils/formatters';

interface RestoreConfirmModalProps {
  currentProject: Project;
  snapshotToRestore: ProjectSnapshot | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirmRestore: (snapshot: ProjectSnapshot) => void;
  onOpenDiffPeek?: (source: Project, target: Project) => void;
}

export const RestoreConfirmModal: React.FC<RestoreConfirmModalProps> = ({
  currentProject,
  snapshotToRestore,
  isOpen,
  onClose,
  onConfirmRestore,
  onOpenDiffPeek,
}) => {
  const [confirmedCheckbox, setConfirmedCheckbox] = useState(false);
  const [showDiffSummary, setShowDiffSummary] = useState(false);

  const validation = useMemo(() => {
    if (!snapshotToRestore) return null;
    return validateRestoreSnapshot(snapshotToRestore);
  }, [snapshotToRestore]);

  const diffReport = useMemo(() => {
    if (!snapshotToRestore) return null;
    return computeProjectDiff(currentProject, snapshotToRestore.projectData, {
      sourceLabel: 'Current Working Draft',
      targetLabel: `${snapshotToRestore.versionTag} (${snapshotToRestore.label})`,
    });
  }, [currentProject, snapshotToRestore]);

  if (!isOpen || !snapshotToRestore) return null;

  const handleConfirm = () => {
    if (!validation?.isValid || !confirmedCheckbox) return;
    onConfirmRestore(snapshotToRestore);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-xl w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-amber-200/60 bg-amber-50/70 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
              <RotateCcw className="w-5 h-5 text-amber-700" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 leading-tight">
                Confirm Safe Project Restore
              </h3>
              <p className="text-xs text-amber-800 font-medium">
                Roll back working draft to Revision #{snapshotToRestore.revisionNumber} ({snapshotToRestore.versionTag})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Target Snapshot Details */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-semibold uppercase tracking-wider text-slate-700">
                Target Revision Snapshot
              </span>
              <span>{formatDate(snapshotToRestore.timestamp)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-teal-100 text-teal-800 font-mono text-xs font-bold">
                {snapshotToRestore.versionTag}
              </span>
              <span className="font-bold text-slate-900 text-sm">
                {snapshotToRestore.label}
              </span>
            </div>
            {snapshotToRestore.description && (
              <p className="text-xs text-slate-600 leading-relaxed italic">
                "{snapshotToRestore.description}"
              </p>
            )}
            <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
              <span>Author: <strong className="text-slate-700">{snapshotToRestore.author.name}</strong> ({snapshotToRestore.author.roleTitle})</span>
              <span>•</span>
              <span>Rooms: <strong className="text-slate-700">{snapshotToRestore.metrics.roomCount}</strong></span>
              <span>•</span>
              <span>GFA: <strong className="text-slate-700">{snapshotToRestore.metrics.totalGFA} sq {snapshotToRestore.metrics.unit}</strong></span>
            </div>
          </div>

          {/* Automatic Safety Snapshot Guarantee Banner */}
          <div className="p-4 bg-teal-50 border border-teal-200 rounded-xl space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-bold text-teal-900">
              <ShieldCheck className="w-4 h-4 text-teal-700 shrink-0" />
              <span>Safety Guarantee: Pre-Restore Snapshot Automated</span>
            </div>
            <p className="text-xs text-teal-800 leading-relaxed pl-6">
              Before applying this restore, Plotify will automatically record an immutable checkpoint of your current working project tagged <code className="bg-teal-100/80 px-1 py-0.5 rounded font-mono text-[11px]">pre-restore-safety</code>. You will never lose ongoing progress and can safely revert back at any time.
            </p>
          </div>

          {/* Validation Status */}
          {validation && (
            <div>
              {validation.isValid ? (
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-lg">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Snapshot integrity check passed: Schema structure, room geometry, and dimensional data verified.</span>
                </div>
              ) : (
                <div className="space-y-1.5 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  <div className="flex items-center gap-2 font-bold">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <span>Snapshot Validation Failed: Cannot restore corrupted data</span>
                  </div>
                  <ul className="list-disc pl-5 space-y-0.5">
                    {validation.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {validation.warnings.length > 0 && (
                <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                  <div className="font-semibold flex items-center gap-1.5 mb-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                    <span>Restoration Notices ({validation.warnings.length}):</span>
                  </div>
                  <ul className="list-disc pl-5 space-y-0.5 text-[11px]">
                    {validation.warnings.map((warn, i) => (
                      <li key={i}>{warn}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Change Peek / Diff Overview */}
          {diffReport && (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowDiffSummary(!showDiffSummary)}
                className="w-full px-4 py-2.5 bg-slate-50 hover:bg-slate-100 flex items-center justify-between text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Eye className="w-3.5 h-3.5 text-teal-700" />
                  <span>
                    Preview Restoration Impact ({diffReport.totalChanges} changes across {Object.keys(diffReport.categories).length} categories)
                  </span>
                </div>
                <span className="text-[11px] text-teal-700 hover:underline">
                  {showDiffSummary ? 'Hide Details' : 'Show Details'}
                </span>
              </button>

              {showDiffSummary && (
                <div className="p-4 bg-white border-t border-slate-200 space-y-2.5 max-h-48 overflow-y-auto text-xs">
                  {diffReport.summaryNotes.map((note, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-slate-700">
                      <span className="text-teal-600 font-bold">•</span>
                      <span>{note}</span>
                    </div>
                  ))}
                  {diffReport.totalChanges > 0 && onOpenDiffPeek && (
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          onOpenDiffPeek(currentProject, snapshotToRestore.projectData);
                          onClose();
                        }}
                        className="text-xs text-teal-800 hover:text-teal-900 font-semibold underline inline-flex items-center gap-1 cursor-pointer"
                      >
                        <span>Open full side-by-side visual diff inspector</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Confirmation Checkbox */}
          <div className="pt-2">
            <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-slate-50 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={confirmedCheckbox}
                onChange={(e) => setConfirmedCheckbox(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-teal-700 focus:ring-teal-500 cursor-pointer"
              />
              <span className="text-xs text-slate-700 leading-relaxed">
                I understand that my current working project will be replaced with this snapshot revision, and that a safety backup checkpoint will be captured automatically before restoring.
              </span>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50/50 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={!validation?.isValid || !confirmedCheckbox}
            onClick={handleConfirm}
            className={`inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold rounded-lg shadow-xs transition-all cursor-pointer ${
              validation?.isValid && confirmedCheckbox
                ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-900/10'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Restore Revision #{snapshotToRestore.revisionNumber}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
