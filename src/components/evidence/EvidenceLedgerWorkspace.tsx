import React, { useState, useMemo } from 'react';
import { Project } from '../../types/project';
import {
  EvidenceRecord,
  EvidenceModule,
  ValidationStatus,
  EvidenceCategory,
} from '../../types/evidence';
import {
  generateProjectEvidenceRecords,
  generateAuditMarkdownReport,
  exportAuditJson,
} from '../../services/evidenceEngine';
import { EvidenceStatusBadge } from './EvidenceStatusBadge';
import { EvidenceRecordDetailModal } from './EvidenceRecordDetailModal';
import {
  ArrowLeft,
  FileCheck2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  HelpCircle,
  FileQuestion,
  RotateCcw,
  Download,
  Printer,
  Copy,
  Check,
  Search,
  Filter,
  ShieldCheck,
  Lock,
  Layers,
  ChevronRight,
  ExternalLink,
  Sliders,
  DollarSign,
  Maximize2,
  Eye,
  Box,
  Compass,
} from 'lucide-react';

interface EvidenceLedgerWorkspaceProps {
  project: Project;
  onBack: () => void;
  onOpenFloorPlan?: (project: Project) => void;
  onOpen3DViewer?: (project: Project) => void;
  onOpenDesignStudio?: (project: Project) => void;
  onOpenDecisionTwin?: () => void;
  onOpenConstraintGraph?: () => void;
  onOpenCostPlanning?: (project: Project) => void;
  onOpenImpactSimulator?: (project: Project) => void;
  onSaveProject?: (project: Project) => void;
  onShowToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const EvidenceLedgerWorkspace: React.FC<EvidenceLedgerWorkspaceProps> = ({
  project,
  onBack,
  onOpenFloorPlan,
  onOpen3DViewer,
  onOpenDesignStudio,
  onOpenDecisionTwin,
  onOpenConstraintGraph,
  onOpenCostPlanning,
  onOpenImpactSimulator,
  onSaveProject,
  onShowToast,
}) => {
  // Regenerate deterministic audit records whenever project changes
  const auditSummary = useMemo(() => {
    return generateProjectEvidenceRecords(project);
  }, [project]);

  // Filtering states
  const [selectedModule, setSelectedModule] = useState<EvidenceModule | 'all'>('all');
  const [selectedStatus, setSelectedStatus] = useState<ValidationStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Selected record for modal inspection
  const [inspectingRecord, setInspectingRecord] = useState<EvidenceRecord | null>(null);

  // Copy state
  const [isCopiedMarkdown, setIsCopiedMarkdown] = useState(false);
  const [isCopiedJson, setIsCopiedJson] = useState(false);

  // Filtered records
  const filteredRecords = useMemo(() => {
    return auditSummary.records.filter((rec) => {
      // Module filter
      if (selectedModule !== 'all' && rec.module !== selectedModule) {
        return false;
      }
      // Status filter
      if (selectedStatus !== 'all' && rec.validationStatus !== selectedStatus) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchTitle = rec.resultName.toLowerCase().includes(query);
        const matchId = rec.id.toLowerCase().includes(query);
        const matchFormula = rec.calculationMethod.toLowerCase().includes(query);
        const matchAssumptions = rec.assumptionsAndExclusions.some((a) =>
          a.toLowerCase().includes(query)
        );
        const matchInputs = Object.keys(rec.inputValuesUsed).some((k) =>
          k.toLowerCase().includes(query)
        );
        if (!matchTitle && !matchId && !matchFormula && !matchAssumptions && !matchInputs) {
          return false;
        }
      }
      return true;
    });
  }, [auditSummary.records, selectedModule, selectedStatus, searchQuery]);

  // Export handlers
  const handleCopyMarkdown = () => {
    const md = generateAuditMarkdownReport(auditSummary);
    navigator.clipboard.writeText(md);
    setIsCopiedMarkdown(true);
    onShowToast?.('Proof-Carrying Audit Markdown report copied to clipboard!', 'success');
    setTimeout(() => setIsCopiedMarkdown(false), 2500);
  };

  const handleDownloadJson = () => {
    const jsonStr = exportAuditJson(auditSummary);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-audit-ledger.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onShowToast?.('Evidence Ledger exported as JSON file.', 'success');
  };

  const handleDownloadMarkdown = () => {
    const md = generateAuditMarkdownReport(auditSummary);
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-audit-report.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onShowToast?.('Evidence Ledger exported as Markdown file.', 'success');
  };

  const handlePrint = () => {
    window.print();
  };

  // Quick navigation to relevant module
  const handleNavigateToModule = (module: string) => {
    switch (module) {
      case 'floor-plan':
        if (onOpenFloorPlan) onOpenFloorPlan(project);
        break;
      case 'viewer-3d':
        if (onOpen3DViewer) onOpen3DViewer(project);
        break;
      case 'decision-twin':
        if (onOpenDecisionTwin) onOpenDecisionTwin();
        break;
      case 'constraint-graph':
        if (onOpenConstraintGraph) onOpenConstraintGraph();
        break;
      case 'cost-planning':
        if (onOpenCostPlanning) onOpenCostPlanning(project);
        break;
      case 'impact-simulator':
        if (onOpenImpactSimulator) onOpenImpactSimulator(project);
        break;
      default:
        break;
    }
  };

  return (
    <div className="space-y-6 pb-16">
      {/* 1. Header Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              title="Return to Project Overview"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-800 border border-teal-200 flex items-center justify-center font-bold shadow-2xs">
              <FileCheck2 className="w-5 h-5 text-teal-700" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                  Proof-Carrying Design & Evidence Traceability
                </h1>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-teal-100 text-teal-900 border border-teal-200">
                  Engine v1.0
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Deterministic mathematical audit trail for{' '}
                <span className="font-semibold text-slate-700">{project.name}</span> • Fingerprint:{' '}
                <span className="font-mono text-[11px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                  {auditSummary.geometryHash.slice(0, 24)}...
                </span>
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center flex-wrap gap-2">
            <button
              onClick={handleCopyMarkdown}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg shadow-2xs transition-colors cursor-pointer"
              title="Copy audit ledger in Markdown format"
            >
              {isCopiedMarkdown ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Report Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-500" />
                  <span>Copy Markdown</span>
                </>
              )}
            </button>

            <button
              onClick={handleDownloadMarkdown}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg shadow-2xs transition-colors cursor-pointer"
              title="Download Markdown Report"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Export Report</span>
            </button>

            <button
              onClick={handleDownloadJson}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg shadow-2xs transition-colors cursor-pointer"
              title="Download raw audit JSON"
            >
              <Download className="w-3.5 h-3.5 text-teal-600" />
              <span>Audit JSON</span>
            </button>

            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-colors cursor-pointer"
              title="Print official audit ledger"
            >
              <Printer className="w-3.5 h-3.5 text-teal-400" />
              <span>Print Audit</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. KPI Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
            Tracked Proofs
          </span>
          <div className="text-2xl font-black text-slate-900 tabular-nums">
            {auditSummary.totalRecords}
          </div>
          <span className="text-[11px] text-slate-400 mt-0.5 block">Cross-Module Rules</span>
        </div>

        <div
          onClick={() => setSelectedStatus('pass')}
          className="bg-white p-3.5 rounded-xl border border-emerald-200/80 hover:border-emerald-400 shadow-2xs cursor-pointer transition-all hover:bg-emerald-50/20"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider">
              Passed Checks
            </span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-700 tabular-nums">
            {auditSummary.passCount}
          </div>
          <span className="text-[11px] text-emerald-600 mt-0.5 block">Verified With Evidence</span>
        </div>

        <div
          onClick={() => setSelectedStatus('conflict')}
          className="bg-white p-3.5 rounded-xl border border-rose-200/80 hover:border-rose-400 shadow-2xs cursor-pointer transition-all hover:bg-rose-50/20"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-rose-800 uppercase tracking-wider">
              Conflicts
            </span>
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
          </div>
          <div className="text-2xl font-black text-rose-700 tabular-nums">
            {auditSummary.conflictCount}
          </div>
          <span className="text-[11px] text-rose-600 mt-0.5 block">Action Required</span>
        </div>

        <div
          onClick={() => setSelectedStatus('stale')}
          className="bg-white p-3.5 rounded-xl border border-amber-200/80 hover:border-amber-400 shadow-2xs cursor-pointer transition-all hover:bg-amber-50/20"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-amber-800 uppercase tracking-wider">
              Stale Data
            </span>
            <Clock className="w-3.5 h-3.5 text-amber-600" />
          </div>
          <div className="text-2xl font-black text-amber-700 tabular-nums">
            {auditSummary.staleCount}
          </div>
          <span className="text-[11px] text-amber-600 mt-0.5 block">Resync Upstream Data</span>
        </div>

        <div
          onClick={() => setSelectedStatus('pending')}
          className="bg-white p-3.5 rounded-xl border border-sky-200/80 hover:border-sky-400 shadow-2xs cursor-pointer transition-all hover:bg-sky-50/20"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-sky-800 uppercase tracking-wider">
              Pending
            </span>
            <HelpCircle className="w-3.5 h-3.5 text-sky-600" />
          </div>
          <div className="text-2xl font-black text-sky-700 tabular-nums">
            {auditSummary.pendingCount}
          </div>
          <span className="text-[11px] text-sky-600 mt-0.5 block">Incomplete Inputs</span>
        </div>

        <div
          onClick={() => setSelectedStatus('not-assessed')}
          className="bg-white p-3.5 rounded-xl border border-slate-200 hover:border-slate-400 shadow-2xs cursor-pointer transition-all hover:bg-slate-50"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
              Engineering Disclosures
            </span>
            <FileQuestion className="w-3.5 h-3.5 text-slate-500" />
          </div>
          <div className="text-2xl font-black text-slate-700 tabular-nums">
            {auditSummary.notAssessedCount}
          </div>
          <span className="text-[11px] text-slate-500 mt-0.5 block">Outside AI Scope</span>
        </div>
      </div>

      {/* 3. Stale Detection Banner (if any stale items exist) */}
      {auditSummary.staleCount > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900 shadow-xs">
          <div className="flex items-start gap-2.5">
            <Clock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-amber-950 block">
                Upstream Geometry Changes Detected ({auditSummary.staleCount} stale result records)
              </span>
              <span>
                Floor plan geometry was modified after cost estimates or downstream model states were
                calculated. Resynchronize to ensure bill of quantities reflects current room
                dimensions.
              </span>
            </div>
          </div>

          {onOpenCostPlanning && (
            <button
              onClick={() => onOpenCostPlanning(project)}
              className="px-3.5 py-1.5 bg-amber-700 text-white font-semibold rounded-lg hover:bg-amber-800 shadow-xs transition-colors shrink-0 cursor-pointer self-start sm:self-auto"
            >
              Open Cost & Resync QTO
            </button>
          )}
        </div>
      )}

      {/* 4. Professional Limitations Banner */}
      <div className="p-4 bg-slate-900 text-slate-200 rounded-2xl flex items-start gap-3 text-xs leading-relaxed border border-slate-800">
        <ShieldCheck className="w-5 h-5 text-teal-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-bold text-white block">
            Plotify Proof-Carrying Transparency Engine — Statutory Disclosure
          </span>
          <p className="text-slate-300">
            This module provides transparent evidence records, mathematical formula breakdowns, and
            dependency change tracking for architectural decision-making. These proofs reflect deterministic
            computational calculations on entered geometry and unit rates; they <strong>do not</strong>{' '}
            substitute for an official stamped architectural plan, structural load engineering analysis
            by a licensed Professional Engineer (PE/SE), or formal municipal building-code permitting.
          </p>
        </div>
      </div>

      {/* 5. Filter & Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search box */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search proofs, formulas, inputs, rules, assumptions..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white transition-all text-slate-800"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
              >
                Clear
              </button>
            )}
          </div>

          {/* Status Quick Filter */}
          <div className="flex items-center gap-1 overflow-x-auto text-xs">
            <span className="text-[11px] font-semibold text-slate-400 mr-1 flex items-center gap-1">
              <Filter className="w-3 h-3" /> Status:
            </span>
            {(['all', 'pass', 'conflict', 'stale', 'pending', 'not-assessed'] as const).map(
              (st) => (
                <button
                  key={st}
                  onClick={() => setSelectedStatus(st)}
                  className={`px-2.5 py-1 rounded-lg font-semibold capitalize transition-all cursor-pointer whitespace-nowrap text-xs ${
                    selectedStatus === st
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {st.replace('-', ' ')}
                </button>
              )
            )}
          </div>
        </div>

        {/* Module Sub-tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto border-t border-slate-100 pt-2 text-xs">
          <span className="text-[11px] font-semibold text-slate-400 mr-1 flex items-center gap-1 shrink-0">
            <Layers className="w-3 h-3" /> Module:
          </span>
          {[
            { id: 'all' as const, label: 'All Modules' },
            { id: 'floor-plan' as const, label: '2D Floor Plan' },
            { id: 'viewer-3d' as const, label: '3D Model' },
            { id: 'decision-twin' as const, label: 'Decision Twin' },
            { id: 'constraint-graph' as const, label: 'Constraints' },
            { id: 'impact-simulator' as const, label: 'Scenarios' },
            { id: 'cost-planning' as const, label: 'Cost & QTO' },
            { id: 'engineering-disclosure' as const, label: 'Engineering' },
          ].map((mod) => (
            <button
              key={mod.id}
              onClick={() => setSelectedModule(mod.id)}
              className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer whitespace-nowrap text-xs shrink-0 ${
                selectedModule === mod.id
                  ? 'bg-teal-50 text-teal-900 border border-teal-200 shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {mod.label}
            </button>
          ))}
        </div>
      </div>

      {/* 6. Evidence Cards Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-500 px-1">
          <span>
            Showing <strong className="text-slate-900">{filteredRecords.length}</strong> of{' '}
            {auditSummary.totalRecords} verified records
          </span>
          {(selectedModule !== 'all' || selectedStatus !== 'all' || searchQuery) && (
            <button
              onClick={() => {
                setSelectedModule('all');
                setSelectedStatus('all');
                setSearchQuery('');
              }}
              className="text-teal-700 hover:underline font-semibold cursor-pointer"
            >
              Reset all filters
            </button>
          )}
        </div>

        {filteredRecords.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3 shadow-xs">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
              <Search className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-800">No Matching Evidence Records Found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              No evidence records match the selected module, status, or search query. Try resetting
              filters or searching for a different architectural parameter.
            </p>
            <button
              onClick={() => {
                setSelectedModule('all');
                setSelectedStatus('all');
                setSearchQuery('');
              }}
              className="px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {filteredRecords.map((rec) => (
              <div
                key={rec.id}
                onClick={() => setInspectingRecord(rec)}
                className={`bg-white rounded-xl border p-4.5 shadow-2xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group ${
                  rec.validationStatus === 'conflict'
                    ? 'border-rose-200 hover:border-rose-300'
                    : rec.validationStatus === 'stale'
                    ? 'border-amber-300 hover:border-amber-400'
                    : 'border-slate-200 hover:border-teal-300'
                }`}
              >
                <div>
                  {/* Card Header: Module, ID, and Status */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-mono font-semibold uppercase text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                        {rec.id}
                      </span>
                      <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full capitalize">
                        {rec.module.replace('-', ' ')}
                      </span>
                    </div>
                    <EvidenceStatusBadge status={rec.validationStatus} size="sm" />
                  </div>

                  {/* Title & Output Value */}
                  <div className="flex items-baseline justify-between gap-2 mt-1">
                    <h3 className="text-sm font-bold text-slate-900 group-hover:text-teal-800 transition-colors line-clamp-1">
                      {rec.resultName}
                    </h3>
                    <div className="text-sm font-black text-slate-900 tabular-nums shrink-0">
                      {typeof rec.resultValue === 'number'
                        ? rec.resultValue.toLocaleString()
                        : String(rec.resultValue)}
                      {rec.unit && rec.unit !== 'status' && (
                        <span className="text-xs font-normal text-slate-500 ml-1">
                          {rec.unit}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Formula Preview */}
                  <div className="mt-2 text-[11px] font-mono text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-150 line-clamp-1">
                    {rec.calculationMethod}
                  </div>

                  {/* Status explanation */}
                  <p className="mt-2 text-xs text-slate-600 line-clamp-2 leading-relaxed">
                    {rec.statusExplanation}
                  </p>
                </div>

                {/* Card Footer: Metadata & Inspect Button */}
                <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                  <div className="flex items-center gap-1.5">
                    {rec.isFormalRequirement ? (
                      <span className="text-blue-700 font-medium">Formal Requirement</span>
                    ) : (
                      <span className="text-amber-700 font-medium">User Preference</span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 text-teal-700 group-hover:text-teal-900 font-semibold transition-colors">
                    <span>Inspect Proof</span>
                    <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 7. Modal Inspector */}
      <EvidenceRecordDetailModal
        record={inspectingRecord}
        isOpen={Boolean(inspectingRecord)}
        onClose={() => setInspectingRecord(null)}
        onNavigateToModule={handleNavigateToModule}
        onSyncQTO={() => {
          if (onOpenCostPlanning) onOpenCostPlanning(project);
        }}
      />
    </div>
  );
};
