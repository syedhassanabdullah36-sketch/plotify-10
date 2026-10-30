import React, { useState } from 'react';
import { EvidenceRecord } from '../../types/evidence';
import { EvidenceStatusBadge } from './EvidenceStatusBadge';
import {
  X,
  Copy,
  Check,
  ShieldAlert,
  FileCheck2,
  Calculator,
  Sliders,
  AlertTriangle,
  BookOpen,
  Layers,
  Sparkles,
  ArrowRight,
  Clock,
  Lock,
} from 'lucide-react';

interface EvidenceRecordDetailModalProps {
  record: EvidenceRecord | null;
  isOpen: boolean;
  onClose: () => void;
  onNavigateToModule?: (module: string) => void;
  onSyncQTO?: () => void;
}

export const EvidenceRecordDetailModal: React.FC<EvidenceRecordDetailModalProps> = ({
  record,
  isOpen,
  onClose,
  onNavigateToModule,
  onSyncQTO,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !record) return null;

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(record, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="evidence-detail-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div className="bg-white w-full max-w-2xl max-h-[90vh] rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-teal-100 text-teal-800 flex items-center justify-center font-bold">
              <FileCheck2 className="w-5 h-5 text-teal-700" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono font-semibold uppercase text-slate-500 tracking-wider">
                  {record.id}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-slate-200/80 text-slate-700">
                  {record.module}
                </span>
              </div>
              <h2
                id="evidence-detail-title"
                className="text-base font-bold text-slate-900 leading-snug"
              >
                {record.resultName}
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1 text-sm text-slate-700">
          {/* Top Status & Result Card */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Calculated Output
              </span>
              <div className="text-2xl font-black text-slate-900 tabular-nums">
                {typeof record.resultValue === 'number'
                  ? record.resultValue.toLocaleString()
                  : String(record.resultValue)}
                {record.unit && record.unit !== 'status' && (
                  <span className="text-sm font-semibold text-slate-500 ml-1.5">
                    {record.unit}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-500 flex items-center gap-1.5 pt-1">
                <span>Category:</span>
                <span className="font-semibold text-slate-700 capitalize">
                  {record.category.replace('-', ' ')}
                </span>
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col justify-between">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 block mb-1.5">
                  Validation Status
                </span>
                <EvidenceStatusBadge status={record.validationStatus} size="lg" />
              </div>
              <div className="text-[11px] text-slate-500 pt-2 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>Calculated: {new Date(record.lastCalculatedAt).toLocaleTimeString()}</span>
              </div>
            </div>
          </div>

          {/* Status Explanation Banner */}
          <div
            className={`p-3.5 rounded-xl border text-xs leading-relaxed flex items-start gap-2.5 ${
              record.validationStatus === 'pass'
                ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                : record.validationStatus === 'conflict'
                ? 'bg-rose-50/70 border-rose-200 text-rose-900'
                : record.validationStatus === 'stale'
                ? 'bg-amber-50 border-amber-300 text-amber-900'
                : 'bg-slate-100 border-slate-200 text-slate-800'
            }`}
          >
            {record.validationStatus === 'pass' ? (
              <FileCheck2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : record.validationStatus === 'conflict' ? (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            ) : (
              <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            )}
            <div>
              <span className="font-semibold block mb-0.5">
                {record.validationStatus === 'pass'
                  ? 'Verified Proof Rationale:'
                  : record.validationStatus === 'conflict'
                  ? 'Conflict Detection Rationale:'
                  : record.validationStatus === 'stale'
                  ? 'Stale Result Notice:'
                  : 'Assessment Status:'}
              </span>
              <span>{record.statusExplanation}</span>
            </div>
          </div>

          {/* Stale Warning & Quick Action */}
          {record.validationStatus === 'stale' && (
            <div className="p-3 bg-amber-100/70 border border-amber-300 rounded-xl flex items-center justify-between text-xs text-amber-900">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-700 shrink-0" />
                <span>
                  {record.staleReason || 'Upstream inputs have changed since this result was computed.'}
                </span>
              </div>
              {onSyncQTO && record.module === 'cost-planning' && (
                <button
                  onClick={() => {
                    onSyncQTO();
                    onClose();
                  }}
                  className="px-3 py-1 bg-amber-700 text-white font-semibold rounded-lg hover:bg-amber-800 transition-colors shrink-0 ml-3 cursor-pointer shadow-xs"
                >
                  Sync QTO Now
                </button>
              )}
            </div>
          )}

          {/* Calculation Formula & Method */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
              <Calculator className="w-4 h-4 text-teal-700" />
              <span>Calculation Method & Deterministic Formula</span>
            </div>
            <div className="p-3 bg-slate-900 text-emerald-400 font-mono text-xs rounded-xl overflow-x-auto shadow-inner">
              {record.calculationMethod}
            </div>
          </div>

          {/* Captured Input Values */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
              <Sliders className="w-4 h-4 text-teal-700" />
              <span>Captured Input Parameters</span>
            </div>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 border-b border-slate-200 text-slate-600 font-semibold">
                  <tr>
                    <th className="py-2 px-3">Input Key</th>
                    <th className="py-2 px-3">Value Captured at Calculation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {Object.entries(record.inputValuesUsed).map(([key, val]) => (
                    <tr key={key} className="hover:bg-slate-50/80">
                      <td className="py-2 px-3 font-mono text-slate-600">{key}</td>
                      <td className="py-2 px-3 font-semibold text-slate-900">{String(val)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Assumptions & Exclusions */}
          {record.assumptionsAndExclusions.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                <BookOpen className="w-4 h-4 text-teal-700" />
                <span>Transparent Assumptions & Exclusions</span>
              </div>
              <ul className="list-disc pl-5 text-xs text-slate-600 space-y-1">
                {record.assumptionsAndExclusions.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Meta & Classification Tags */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                Source Reference & Standard
              </span>
              <span className="font-medium text-slate-800">
                {record.sourceReferenceOrRateSource || 'Plotify Native Geometry Rules'}
              </span>
              <div className="text-[11px] text-slate-400">
                Version: {record.calculationVersion}
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                Rule Classification
              </span>
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                <span
                  className={`px-2 py-0.5 rounded-md font-semibold text-[10px] ${
                    record.isFormalRequirement
                      ? 'bg-blue-100 text-blue-900'
                      : 'bg-amber-100 text-amber-900'
                  }`}
                >
                  {record.isFormalRequirement ? 'Formal Code / Physical Rule' : 'User Preference'}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-md font-semibold text-[10px] ${
                    record.isAiGenerated
                      ? 'bg-purple-100 text-purple-900'
                      : 'bg-emerald-100 text-emerald-900'
                  }`}
                >
                  {record.isAiGenerated ? 'Qualitative AI Suggestion' : 'Deterministic Quantitative'}
                </span>
              </div>
            </div>
          </div>

          {/* Mandatory Professional Review Notice */}
          <div className="p-3.5 bg-amber-50/80 border border-amber-300 rounded-xl text-xs space-y-1 text-amber-900">
            <div className="flex items-center gap-2 font-bold text-amber-950">
              <Lock className="w-4 h-4 text-amber-700 shrink-0" />
              <span>Mandatory Professional Review Requirement:</span>
            </div>
            <p className="leading-relaxed font-medium">
              {record.requiredProfessionalReview}
            </p>
            <div className="text-[11px] text-amber-800 pt-1">
              <span className="font-semibold">Known Limitations:</span> {record.knownLimitations}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <button
            onClick={handleCopyJson}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg shadow-2xs transition-colors cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>JSON Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-slate-500" />
                <span>Copy Proof Record (JSON)</span>
              </>
            )}
          </button>

          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
