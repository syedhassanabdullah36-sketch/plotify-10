/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ShieldCheck,
  RefreshCw,
  X,
  Download,
  FileCheck2,
  Filter,
  Layers,
  ChevronRight,
  ChevronDown,
  Info,
  Clock,
  Award,
  AlertCircle,
  FileText,
  Search,
} from 'lucide-react';
import { Project } from '../../types/project';
import {
  ProjectVerificationReport,
  VerificationCategory,
  VerificationSeverity,
  ReleaseGateTarget,
} from '../../types/verification';
import {
  runSystemVerification,
  generateVerificationCertificateMarkdown,
} from '../../services/systemVerificationService';

interface Props {
  project: Project;
  isOpen: boolean;
  onClose: () => void;
  onShowToast: (message: string, type: 'success' | 'error' | 'info') => void;
  onNavigateToFloorPlan?: () => void;
  onNavigateToStructural?: () => void;
  onNavigateToMEP?: () => void;
}

type TabType = 'overview' | 'checks' | 'gates' | 'certificate';

export const VerificationCenterModal: React.FC<Props> = ({
  project,
  isOpen,
  onClose,
  onShowToast,
  onNavigateToFloorPlan,
  onNavigateToStructural,
  onNavigateToMEP,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [report, setReport] = useState<ProjectVerificationReport>(() => runSystemVerification(project));
  const [selectedCategory, setSelectedCategory] = useState<VerificationCategory | 'all'>('all');
  const [severityFilter, setSeverityFilter] = useState<VerificationSeverity | 'all' | 'passed'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCheckId, setExpandedCheckId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Re-run verification whenever project changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setReport(runSystemVerification(project));
    }
  }, [isOpen, project]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      const fresh = runSystemVerification(project);
      setReport(fresh);
      setIsRefreshing(false);
      onShowToast(`Verification audit completed in ${fresh.summary.totalExecutionTimeMs} ms.`, 'info');
    }, 150);
  };

  const handleDownloadMarkdown = () => {
    const md = generateVerificationCertificateMarkdown(report);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plotify-verification-certificate-${project.id}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onShowToast('Verification Certificate (Markdown) exported.', 'success');
  };

  const handleDownloadJSON = () => {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plotify-verification-report-${project.id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onShowToast('Verification Report (JSON) exported.', 'success');
  };

  // Filtered checks list
  const filteredChecks = useMemo(() => {
    return report.checks.filter((c) => {
      if (selectedCategory !== 'all' && c.category !== selectedCategory) return false;
      if (severityFilter === 'passed' && !c.passed) return false;
      if (severityFilter !== 'all' && severityFilter !== 'passed') {
        if (c.passed || c.severity !== severityFilter) return false;
      }
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchName = c.name.toLowerCase().includes(query);
        const matchDesc = c.description.toLowerCase().includes(query);
        const matchDetails = c.details.toLowerCase().includes(query);
        const matchId = c.id.toLowerCase().includes(query);
        if (!matchName && !matchDesc && !matchDetails && !matchId) return false;
      }
      return true;
    });
  }, [report, selectedCategory, severityFilter, searchQuery]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/80">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center text-white shadow-sm">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-semibold text-slate-900">
                  Verification & Release Control Center
                </h2>
                <span
                  className={`px-2 py-0.5 rounded-full text-[11px] font-mono font-bold border ${
                    report.overallPassed
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                      : 'bg-rose-100 text-rose-800 border-rose-200'
                  }`}
                >
                  {report.overallPassed ? 'RELEASE ELIGIBLE' : 'RELEASE BLOCKED'}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Project: <strong className="text-slate-800">{project.name}</strong> • Audit Ref: <code className="font-mono text-[11px]">{report.auditSignature}</code>
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-700 transition"
              title="Re-run all automated verification checks"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-slate-600 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Re-run Audit</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-lg transition"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 bg-slate-100/60 px-6 gap-2 pt-2">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-medium border-b-2 transition ${
              activeTab === 'overview'
                ? 'border-teal-600 text-teal-800 bg-white rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Discipline Matrix</span>
          </button>

          <button
            onClick={() => setActiveTab('checks')}
            className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-medium border-b-2 transition ${
              activeTab === 'checks'
                ? 'border-teal-600 text-teal-800 bg-white rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileCheck2 className="w-4 h-4" />
            <span>Itemized Checks ({report.summary.totalChecks})</span>
            {report.summary.blockingDefects > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-100 text-rose-700 font-bold">
                {report.summary.blockingDefects} Blocking
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('gates')}
            className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-medium border-b-2 transition ${
              activeTab === 'gates'
                ? 'border-teal-600 text-teal-800 bg-white rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Award className="w-4 h-4" />
            <span>Milestone Release Gates</span>
          </button>

          <button
            onClick={() => setActiveTab('certificate')}
            className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-medium border-b-2 transition ${
              activeTab === 'certificate'
                ? 'border-teal-600 text-teal-800 bg-white rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Certificate & Dossier</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: OVERVIEW & DISCIPLINE MATRIX */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Executive Status Banner */}
              <div
                className={`p-5 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
                  report.overallPassed
                    ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                    : 'bg-rose-50/70 border-rose-200 text-rose-950'
                }`}
              >
                <div className="flex items-start space-x-3.5">
                  <div className="mt-0.5 shrink-0">
                    {report.overallPassed ? (
                      <CheckCircle2 className="w-7 h-7 text-emerald-600" />
                    ) : (
                      <XCircle className="w-7 h-7 text-rose-600" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold">
                      {report.overallPassed
                        ? 'Project Model Clear for Milestone Release'
                        : `Release Blocked: ${report.summary.blockingDefects} Critical Defect(s) Identified`}
                    </h3>
                    <p className="text-xs text-slate-600 mt-1">
                      {report.overallPassed
                        ? 'All mandatory spatial, boundary, calculation, and security checks verified without blocking defects.'
                        : 'Review the itemized register to remediate parcel encroachments, hard clashes, or calculation inconsistencies.'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-3 shrink-0">
                  <div className="text-center px-4 py-2 bg-white rounded-lg border border-slate-200 shadow-xs">
                    <span className="text-[10px] uppercase font-mono text-slate-400 block font-semibold">Health Score</span>
                    <span className="text-xl font-bold font-mono text-slate-900">{report.healthScore}%</span>
                  </div>
                  <div className="text-center px-4 py-2 bg-white rounded-lg border border-slate-200 shadow-xs">
                    <span className="text-[10px] uppercase font-mono text-slate-400 block font-semibold">Audit Time</span>
                    <span className="text-sm font-bold font-mono text-slate-800 mt-1 block">
                      {report.summary.totalExecutionTimeMs} ms
                    </span>
                  </div>
                </div>
              </div>

              {/* 4 Summary Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
                  <div className="text-slate-500 uppercase text-[10px] font-mono">Passed Checks</div>
                  <div className="text-lg font-bold text-emerald-700 mt-1">
                    {report.summary.passedChecks} / {report.summary.totalChecks}
                  </div>
                </div>
                <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
                  <div className="text-slate-500 uppercase text-[10px] font-mono">Blocking Defects</div>
                  <div className={`text-lg font-bold mt-1 ${report.summary.blockingDefects > 0 ? 'text-rose-600' : 'text-slate-700'}`}>
                    {report.summary.blockingDefects}
                  </div>
                </div>
                <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
                  <div className="text-slate-500 uppercase text-[10px] font-mono">Non-Blocking Warnings</div>
                  <div className={`text-lg font-bold mt-1 ${report.summary.warnings > 0 ? 'text-amber-600' : 'text-slate-700'}`}>
                    {report.summary.warnings}
                  </div>
                </div>
                <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
                  <div className="text-slate-500 uppercase text-[10px] font-mono">Release Readiness</div>
                  <div className="text-xs font-semibold text-teal-800 mt-1 flex items-center space-x-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
                    <span>{report.overallPassed ? 'Passed Gate' : 'Action Required'}</span>
                  </div>
                </div>
              </div>

              {/* 7 Discipline Category Cards */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Verification Category Matrix
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {Object.values(report.categoryScores).map((cat) => (
                    <div
                      key={cat.category}
                      onClick={() => {
                        setSelectedCategory(cat.category);
                        setActiveTab('checks');
                      }}
                      className="p-4 bg-white border border-slate-200 rounded-xl hover:border-teal-400 hover:shadow-xs transition cursor-pointer space-y-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900">{cat.label}</span>
                        <span className="font-mono text-xs font-bold text-slate-800">{cat.percentage}%</span>
                      </div>

                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-2 rounded-full transition-all duration-500 ${
                            cat.blocking > 0
                              ? 'bg-rose-500'
                              : cat.percentage === 100
                              ? 'bg-teal-600'
                              : 'bg-amber-500'
                          }`}
                          style={{ width: `${Math.max(4, cat.percentage)}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span>
                          {cat.passed} of {cat.total} checks passed
                        </span>
                        {cat.blocking > 0 ? (
                          <span className="text-rose-600 font-semibold">{cat.blocking} blocking defect</span>
                        ) : (
                          <span className="text-emerald-700 font-medium">All Clear</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: ITEMIZED CHECKS */}
          {activeTab === 'checks' && (
            <div className="space-y-4">
              {/* Filter Controls Bar */}
              <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value as any)}
                    className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-700"
                  >
                    <option value="all">All Disciplines ({report.checks.length})</option>
                    <option value="project_foundation">Project Foundation</option>
                    <option value="geometry_spatial_sync">2D Geometry & 3D Sync</option>
                    <option value="calculation_integrity">Calculation Integrity</option>
                    <option value="dependency_propagation">Dependency & Staleness</option>
                    <option value="design_intelligence">Multi-Trade Engineering</option>
                    <option value="versioning_recovery">Versioning & Recovery</option>
                    <option value="security_infrastructure">Security & Persistence</option>
                  </select>

                  <select
                    value={severityFilter}
                    onChange={(e) => setSeverityFilter(e.target.value as any)}
                    className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-700"
                  >
                    <option value="all">All Severities</option>
                    <option value="blocking_defect">Blocking Defects Only</option>
                    <option value="warning">Warnings Only</option>
                    <option value="passed">Passed Checks Only</option>
                  </select>
                </div>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search checks, IDs, fields..."
                    className="pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs w-full sm:w-56 focus:outline-teal-600"
                  />
                </div>
              </div>

              {/* Checks Accordion List */}
              <div className="space-y-2">
                {filteredChecks.length === 0 ? (
                  <div className="text-center py-10 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-xs text-slate-500">
                    No verification checks match the selected filter criteria.
                  </div>
                ) : (
                  filteredChecks.map((check) => {
                    const isExpanded = expandedCheckId === check.id;
                    return (
                      <div
                        key={check.id}
                        className={`rounded-xl border transition ${
                          check.passed
                            ? 'bg-white border-slate-200 hover:border-slate-300'
                            : check.severity === 'blocking_defect'
                            ? 'bg-rose-50/40 border-rose-200'
                            : 'bg-amber-50/40 border-amber-200'
                        }`}
                      >
                        <div
                          onClick={() => setExpandedCheckId(isExpanded ? null : check.id)}
                          className="flex items-center justify-between p-3.5 cursor-pointer select-none"
                        >
                          <div className="flex items-center space-x-3">
                            <div className="shrink-0">
                              {check.passed ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                              ) : check.severity === 'blocking_defect' ? (
                                <XCircle className="w-4 h-4 text-rose-600" />
                              ) : (
                                <AlertTriangle className="w-4 h-4 text-amber-600" />
                              )}
                            </div>
                            <div>
                              <div className="flex items-center space-x-2">
                                <span className="font-semibold text-xs text-slate-900">{check.name}</span>
                                <span className="text-[10px] font-mono text-slate-400">[{check.id}]</span>
                              </div>
                              <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{check.details}</p>
                            </div>
                          </div>

                          <div className="flex items-center space-x-3 shrink-0 ml-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold uppercase ${
                                check.passed
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : check.severity === 'blocking_defect'
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {check.passed ? 'PASSED' : check.severity.replace('_', ' ')}
                            </span>
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-slate-400" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-slate-400" />
                            )}
                          </div>
                        </div>

                        {/* Expanded details */}
                        {isExpanded && (
                          <div className="px-4 pb-4 pt-1 border-t border-slate-100 text-xs space-y-2 bg-slate-50/40 rounded-b-xl">
                            <div>
                              <span className="text-slate-500 font-medium">Description: </span>
                              <span className="text-slate-800">{check.description}</span>
                            </div>
                            <div>
                              <span className="text-slate-500 font-medium">Evaluation Finding: </span>
                              <span className="font-mono text-slate-900">{check.details}</span>
                            </div>
                            {check.affectedField && (
                              <div>
                                <span className="text-slate-500 font-medium">Affected Field / Model: </span>
                                <code className="bg-slate-200/80 px-1 py-0.5 rounded font-mono text-[11px] text-slate-700">
                                  {check.affectedField}
                                </code>
                              </div>
                            )}
                            {check.remediation && (
                              <div className="p-2.5 bg-amber-100/60 border border-amber-200/80 rounded-lg text-amber-900 text-[11px]">
                                <span className="font-semibold">Remediation Action: </span>
                                {check.remediation}
                              </div>
                            )}
                            <div className="text-[10px] text-slate-400 font-mono pt-1">
                              Execution Latency: {check.executionTimeMs} ms
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB 3: RELEASE MILESTONE GATES */}
          {activeTab === 'gates' && (
            <div className="space-y-6">
              <div className="text-xs text-slate-500">
                Plotify evaluates progressive release eligibility across four milestone gates. Each gate enforces strict mandatory invariants.
              </div>

              <div className="space-y-4">
                {Object.values(report.releaseGates).map((gate) => (
                  <div
                    key={gate.target}
                    className={`rounded-xl border p-5 space-y-3 ${
                      gate.eligible
                        ? 'bg-white border-slate-200'
                        : 'bg-rose-50/20 border-rose-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                            gate.eligible ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                          }`}
                        >
                          {gate.eligible ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-slate-900">{gate.targetLabel}</h4>
                          <p className="text-xs text-slate-500">{gate.description}</p>
                        </div>
                      </div>

                      <div className="text-right">
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-mono font-bold ${
                            gate.eligible
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : 'bg-rose-100 text-rose-800 border border-rose-200'
                          }`}
                        >
                          {gate.eligible ? 'GATE CLEARED' : 'GATE BLOCKED'}
                        </span>
                        <div className="text-[11px] text-slate-400 font-mono mt-1">
                          {gate.scorePercentage}% criteria met
                        </div>
                      </div>
                    </div>

                    {/* Requirements checklist */}
                    <div className="pt-2 border-t border-slate-100 space-y-1.5 text-xs">
                      {gate.checklist.map((req, idx) => (
                        <div key={idx} className="flex items-start justify-between py-1 border-b border-slate-50">
                          <div className="flex items-center space-x-2">
                            {req.status === 'satisfied' ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            ) : req.isMandatory ? (
                              <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                            ) : (
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            )}
                            <span className="font-medium text-slate-800">{req.title}</span>
                            {req.isMandatory && (
                              <span className="text-[10px] text-rose-700 bg-rose-50 px-1 rounded font-semibold uppercase">
                                Mandatory
                              </span>
                            )}
                          </div>
                          <span
                            className={`text-[11px] font-mono ${
                              req.status === 'satisfied' ? 'text-emerald-700 font-semibold' : 'text-rose-700'
                            }`}
                          >
                            {req.status.toUpperCase()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: CERTIFICATE & DOSSIER */}
          {activeTab === 'certificate' && (
            <div className="space-y-6">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      Export Formal Verification Certificate
                    </h3>
                    <p className="text-xs text-slate-500">
                      Download timestamped audit certificates with cryptographic signatures for clients, contractors, or municipality submissions.
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={handleDownloadMarkdown}
                      className="flex items-center space-x-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition shadow-xs"
                    >
                      <Download className="w-3.5 h-3.5 text-teal-400" />
                      <span>Download Certificate (.md)</span>
                    </button>
                    <button
                      onClick={handleDownloadJSON}
                      className="flex items-center space-x-1.5 px-3 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold transition"
                    >
                      <Download className="w-3.5 h-3.5 text-slate-600" />
                      <span>Export Audit JSON</span>
                    </button>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 font-mono text-xs text-slate-700 space-y-1">
                  <div><strong className="text-slate-900">Certificate Ref:</strong> {report.reportId}</div>
                  <div><strong className="text-slate-900">Audit Fingerprint:</strong> {report.auditSignature}</div>
                  <div><strong className="text-slate-900">Evaluation Timestamp:</strong> {new Date(report.evaluatedAt).toLocaleString()}</div>
                  <div><strong className="text-slate-900">Platform Build:</strong> Plotify v1.0.0-p20 (Production Hardened)</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <span>Plotify Release Controls • Engine v1.0.0-p20</span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-medium rounded-lg transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
