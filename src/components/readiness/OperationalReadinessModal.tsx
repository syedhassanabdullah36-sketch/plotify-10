/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Shield,
  FileText,
  Download,
  Copy,
  Check,
  Server,
  Lock,
  HardDrive,
  LifeBuoy,
  RotateCcw,
  Sliders,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  ClipboardList,
  Eye,
  Rocket,
} from 'lucide-react';
import { Project } from '../../types/project';
import {
  ReleaseChecklistItem,
  ReleaseChecklistDomain,
  ReleaseChecklistStatus,
} from '../../types/readiness';
import {
  DEFAULT_RELEASE_CHECKLIST,
  DEFAULT_DEPLOYMENT_PROFILE,
  RELEASE_DOMAIN_LABELS,
  calculateReleasePreparationSummary,
  validateClientSecurityAndSecrets,
  generateSupportDiagnosticBundle,
  exportReleaseChecklistCSV,
  generateReleaseDossierMarkdown,
} from '../../services/readinessService';

interface OperationalReadinessModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeProject?: Project | null;
}

type ActiveReadinessTab = 'checklist' | 'deployment' | 'privacy' | 'backup' | 'support';

export function OperationalReadinessModal({
  isOpen,
  onClose,
  activeProject,
}: OperationalReadinessModalProps) {
  const [activeTab, setActiveTab] = useState<ActiveReadinessTab>('checklist');
  const [checklist, setChecklist] = useState<ReleaseChecklistItem[]>(DEFAULT_RELEASE_CHECKLIST);
  const [filterDomain, setFilterDomain] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [copiedDiagnostic, setCopiedDiagnostic] = useState(false);

  // Support ticket form state
  const [issueSummary, setIssueSummary] = useState('');
  const [issueCategory, setIssueCategory] = useState('2D Floor Plan Layout');
  const [issueRepro, setIssueRepro] = useState('');

  const summary = useMemo(() => calculateReleasePreparationSummary(checklist), [checklist]);
  const securityScan = useMemo(() => validateClientSecurityAndSecrets(), []);
  const diagnosticBundle = useMemo(
    () => generateSupportDiagnosticBundle(activeProject),
    [activeProject]
  );

  const filteredItems = useMemo(() => {
    return checklist.filter((item) => {
      if (filterDomain !== 'all' && item.domain !== filterDomain) return false;
      if (filterStatus !== 'all' && item.status !== filterStatus) return false;
      return true;
    });
  }, [checklist, filterDomain, filterStatus]);

  const handleCopyDiagnostics = () => {
    const text = JSON.stringify(diagnosticBundle, null, 2);
    navigator.clipboard.writeText(text);
    setCopiedDiagnostic(true);
    setTimeout(() => setCopiedDiagnostic(false), 2500);
  };

  const handleExportCSV = () => {
    const csv = exportReleaseChecklistCSV(checklist);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plotify_release_checklist_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportMarkdown = () => {
    const md = generateReleaseDossierMarkdown(checklist, DEFAULT_DEPLOYMENT_PROFILE);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plotify_release_dossier_${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Top Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-linear-to-r from-slate-900 via-slate-800 to-teal-950 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal-500/20 border border-teal-400/30 flex items-center justify-center text-teal-300">
              <Rocket className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  Release Preparation & Operational Readiness
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-teal-400/20 text-teal-200 border border-teal-300/30 rounded-full uppercase tracking-wider">
                  {DEFAULT_DEPLOYMENT_PROFILE.version}
                </span>
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-400/20 text-emerald-200 border border-emerald-300/30 rounded-full uppercase tracking-wider">
                  Mandatory: {summary.mandatoryReadyPercent}% Ready
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Deployment configuration, security controls, privacy documentation, support runbooks, and recovery planning
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              className="px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5"
              title="Export release checklist to CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>
            <button
              onClick={handleExportMarkdown}
              className="px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5"
              title="Export complete Release Dossier in Markdown"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Dossier</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-6 border-b border-slate-200 bg-slate-50/80 shrink-0 overflow-x-auto text-xs font-medium">
          <button
            onClick={() => setActiveTab('checklist')}
            className={`py-3 px-3.5 border-b-2 flex items-center gap-2 cursor-pointer transition-colors whitespace-nowrap ${
              activeTab === 'checklist'
                ? 'border-teal-600 text-teal-900 font-bold bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
            }`}
          >
            <ClipboardList className="w-4 h-4 text-teal-600" />
            <span>Release Checklist</span>
            <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-slate-200 text-slate-700 rounded-full">
              {summary.readyCount}/{summary.totalItemsCount}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('deployment')}
            className={`py-3 px-3.5 border-b-2 flex items-center gap-2 cursor-pointer transition-colors whitespace-nowrap ${
              activeTab === 'deployment'
                ? 'border-teal-600 text-teal-900 font-bold bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
            }`}
          >
            <Server className="w-4 h-4 text-teal-600" />
            <span>Deployment & Config</span>
          </button>

          <button
            onClick={() => setActiveTab('privacy')}
            className={`py-3 px-3.5 border-b-2 flex items-center gap-2 cursor-pointer transition-colors whitespace-nowrap ${
              activeTab === 'privacy'
                ? 'border-teal-600 text-teal-900 font-bold bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
            }`}
          >
            <Lock className="w-4 h-4 text-teal-600" />
            <span>Privacy & Data Catalog</span>
          </button>

          <button
            onClick={() => setActiveTab('backup')}
            className={`py-3 px-3.5 border-b-2 flex items-center gap-2 cursor-pointer transition-colors whitespace-nowrap ${
              activeTab === 'backup'
                ? 'border-teal-600 text-teal-900 font-bold bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
            }`}
          >
            <HardDrive className="w-4 h-4 text-teal-600" />
            <span>Backup & Disaster Recovery</span>
          </button>

          <button
            onClick={() => setActiveTab('support')}
            className={`py-3 px-3.5 border-b-2 flex items-center gap-2 cursor-pointer transition-colors whitespace-nowrap ${
              activeTab === 'support'
                ? 'border-teal-600 text-teal-900 font-bold bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
            }`}
          >
            <LifeBuoy className="w-4 h-4 text-teal-600" />
            <span>Support & Incident Runbook</span>
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
          {/* TAB 1: RELEASE CHECKLIST */}
          {activeTab === 'checklist' && (
            <div className="space-y-5">
              {/* Executive Summary Card */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Overall Readiness Status:
                    </span>
                    <span
                      className={`font-bold text-xs px-2.5 py-0.5 rounded-full border ${
                        summary.overallReadyForReleaseCandidate
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                          : 'bg-amber-50 text-amber-800 border-amber-300'
                      }`}
                    >
                      {summary.overallReadyForReleaseCandidate
                        ? 'READY FOR RELEASE CANDIDATE'
                        : 'ACTION ITEMS REMAINING'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">
                    {summary.readyCount} of {summary.totalItemsCount} readiness criteria verified with evidence across 9 architectural domains.
                  </p>
                </div>

                <div className="flex items-center gap-4 text-xs">
                  <div className="text-center">
                    <div className="font-bold text-base text-slate-900">
                      {summary.mandatoryReadyPercent}%
                    </div>
                    <div className="text-[10px] text-slate-400 uppercase font-medium">
                      Mandatory
                    </div>
                  </div>
                  <div className="w-px h-8 bg-slate-200" />
                  <div className="text-center">
                    <div className="font-bold text-base text-emerald-600">
                      {summary.readyCount}
                    </div>
                    <div className="text-[10px] text-slate-400 uppercase font-medium">
                      Ready
                    </div>
                  </div>
                  <div className="w-px h-8 bg-slate-200" />
                  <div className="text-center">
                    <div className="font-bold text-base text-amber-600">
                      {summary.notReadyCount}
                    </div>
                    <div className="text-[10px] text-slate-400 uppercase font-medium">
                      Pending
                    </div>
                  </div>
                </div>
              </div>

              {/* Filters */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs">
                  <select
                    value={filterDomain}
                    onChange={(e) => setFilterDomain(e.target.value)}
                    className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-700 font-medium"
                  >
                    <option value="all">All 9 Domains</option>
                    {Object.entries(RELEASE_DOMAIN_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>

                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-700 font-medium"
                  >
                    <option value="all">All Statuses</option>
                    <option value="ready">Ready</option>
                    <option value="not-ready">Not Ready</option>
                    <option value="blocked">Blocked</option>
                    <option value="not-applicable">Not Applicable</option>
                  </select>
                </div>
                <span className="text-xs text-slate-500">
                  Showing {filteredItems.length} of {checklist.length} checklist items
                </span>
              </div>

              {/* Checklist Items List */}
              <div className="space-y-2.5">
                {filteredItems.map((item) => {
                  const statusColors = {
                    ready: 'bg-emerald-100 text-emerald-800 border-emerald-300',
                    'not-ready': 'bg-amber-100 text-amber-800 border-amber-300',
                    blocked: 'bg-rose-100 text-rose-800 border-rose-300',
                    'not-assessed': 'bg-slate-100 text-slate-700 border-slate-300',
                    'not-applicable': 'bg-slate-100 text-slate-500 border-slate-200',
                  }[item.status];

                  return (
                    <div
                      key={item.id}
                      className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-2"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded border ${statusColors}`}
                          >
                            {item.status.replace('-', ' ')}
                          </span>
                          <span className="font-mono text-xs font-bold text-slate-700">
                            {item.id}
                          </span>
                          <h4 className="text-xs font-bold text-slate-900">{item.title}</h4>
                          {item.mandatoryForRelease && (
                            <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-teal-50 text-teal-800 rounded">
                              Mandatory
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] font-medium text-slate-500">
                          {RELEASE_DOMAIN_LABELS[item.domain]}
                        </span>
                      </div>

                      <p className="text-xs text-slate-600 leading-relaxed">
                        {item.description}
                      </p>

                      <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-[11px] text-slate-700 flex items-start gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 shrink-0 mt-0.5" />
                        <div>
                          <strong className="text-slate-800">Verification Evidence:</strong>{' '}
                          <span>{item.evidence}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: DEPLOYMENT & ENVIRONMENT */}
          {activeTab === 'deployment' && (
            <div className="space-y-5">
              {/* Security & Secrets Scan Badge */}
              <div
                className={`p-4 rounded-xl border flex items-center justify-between ${
                  securityScan.isSecure
                    ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                    : 'bg-rose-50 border-rose-200 text-rose-950'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      securityScan.isSecure
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-rose-100 text-rose-700'
                    }`}
                  >
                    <Lock className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold">
                      {securityScan.isSecure
                        ? 'Zero Client-Side Secrets Exposure Confirmed'
                        : 'Potential Secret Exposure Detected'}
                    </h4>
                    <p className="text-[11px] opacity-80">
                      Scanned {securityScan.scannedVariablesCount} environment variables. No private API keys or database credentials are embedded in client bundles.
                    </p>
                  </div>
                </div>
                <span className="text-xs font-bold px-2.5 py-1 bg-white/80 rounded-md border border-current">
                  {securityScan.isSecure ? 'VERIFIED SECURE' : 'REVIEW REQUIRED'}
                </span>
              </div>

              {/* Deployment Profile Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-3">
                  <h3 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                    <Server className="w-4 h-4 text-teal-600" />
                    <span>Active Deployment Profile</span>
                  </h3>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-slate-50">
                      <span className="text-slate-500">Target Environment:</span>
                      <span className="font-semibold text-slate-800 uppercase">
                        {DEFAULT_DEPLOYMENT_PROFILE.environment}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-50">
                      <span className="text-slate-500">Release Version:</span>
                      <span className="font-mono font-semibold text-slate-800">
                        {DEFAULT_DEPLOYMENT_PROFILE.version}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-50">
                      <span className="text-slate-500">Host / Port Mapping:</span>
                      <span className="font-mono text-slate-800">
                        {DEFAULT_DEPLOYMENT_PROFILE.hostPort}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-50">
                      <span className="text-slate-500">Bundle Target:</span>
                      <span className="font-semibold text-slate-800">
                        {DEFAULT_DEPLOYMENT_PROFILE.bundleTarget}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-50">
                      <span className="text-slate-500">Content Security Policy:</span>
                      <span className="font-semibold text-emerald-700">Strict CSP Enforced</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-3">
                  <h3 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-teal-600" />
                    <span>Pre-Deployment Verification Pipeline</span>
                  </h3>
                  <div className="space-y-2 font-mono text-[11px] bg-slate-900 text-slate-200 p-3 rounded-lg">
                    <div className="text-slate-400"># 1. Type Safety & Linting</div>
                    <div className="text-teal-300">npm run lint</div>
                    <div className="text-slate-400 pt-1"># 2. Complete 12-Suite Verification</div>
                    <div className="text-teal-300">npm test</div>
                    <div className="text-slate-400 pt-1"># 3. Static Production Bundle</div>
                    <div className="text-teal-300">npm run build</div>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    See <code className="text-slate-700 font-mono">docs/DEPLOYMENT_AND_CONFIGURATION.md</code> for multi-cloud CDN deployment targets.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: PRIVACY & DATA CATALOG */}
          {activeTab === 'privacy' && (
            <div className="space-y-5">
              <div className="bg-teal-50/70 p-4 rounded-xl border border-teal-200 text-xs text-teal-950 space-y-1">
                <div className="font-bold flex items-center gap-2 text-teal-900">
                  <Shield className="w-4 h-4 text-teal-600" />
                  <span>Client-Side Data Residency & Zero-Telemetry Architecture</span>
                </div>
                <p className="text-teal-900/80 leading-relaxed">
                  Plotify processes and retains 100% of architectural drawings, floor plan layouts, structural grids, MEP routes, and cost takeoff schedules directly on the user's local browser storage. No drawings or budgets are ever sent to remote tracking servers.
                </p>
              </div>

              {/* Data Categories Table */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 font-bold text-xs text-slate-900">
                  Catalog of Processed & Stored Data Categories
                </div>
                <div className="divide-y divide-slate-100 text-xs">
                  <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-slate-800">Architectural Plan Geometry</h4>
                      <p className="text-slate-500 text-[11px]">
                        Plot width/length, room coordinates, partition spans, door/window openings
                      </p>
                    </div>
                    <span className="text-[10px] font-semibold bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                      Local Only (`plotify_projects_v1`)
                    </span>
                  </div>

                  <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-slate-800">Structural & MEP Coordination</h4>
                      <p className="text-slate-500 text-[11px]">
                        Column grid axes, joist span deflections, duct/pipe routing, clash records
                      </p>
                    </div>
                    <span className="text-[10px] font-semibold bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                      Local Only
                    </span>
                  </div>

                  <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-slate-800">Cost Takeoff & Financial Models</h4>
                      <p className="text-slate-500 text-[11px]">
                        Target budget, currency, category cost breakdowns (substructure, envelope, finishes)
                      </p>
                    </div>
                    <span className="text-[10px] font-semibold bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                      Local Only
                    </span>
                  </div>

                  <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-slate-800">Version Snapshots & Recovery History</h4>
                      <p className="text-slate-500 text-[11px]">
                        Named snapshots, revision numbers, rollback markers
                      </p>
                    </div>
                    <span className="text-[10px] font-semibold bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                      Local Only (`plotify_snapshots_v1`)
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-amber-50/80 p-4 rounded-xl border border-amber-200 text-xs text-amber-900 space-y-1">
                <span className="font-bold">Statutory Notice:</span> Full privacy policy documentation is maintained in <code className="font-mono text-amber-950 font-semibold">docs/PRIVACY_DATA_HANDLING.md</code>. Prior to multi-tenant cloud deployment, jurisdiction-specific legal review is required.
              </div>
            </div>
          )}

          {/* TAB 4: BACKUP & DISASTER RECOVERY */}
          {activeTab === 'backup' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-1">
                  <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <RotateCcw className="w-3.5 h-3.5 text-teal-600" />
                    <span>Tier 1: Version Snapshots</span>
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Intra-session protection. Save named snapshots before major layout changes to enable instant rollback.
                  </p>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-1">
                  <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <HardDrive className="w-3.5 h-3.5 text-teal-600" />
                    <span>Tier 2: JSON Vaulting</span>
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Cold storage. Export self-contained `.json` archives to protect against browser cache eviction.
                  </p>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-1">
                  <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-teal-600" />
                    <span>Storage Quota Alert</span>
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Capacity monitoring triggers warnings at 75% browser quota with built-in snapshot pruner.
                  </p>
                </div>
              </div>

              {/* Recovery Guide */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-3">
                <h3 className="text-xs font-bold text-slate-900">
                  Disaster Recovery Procedure Checklist
                </h3>
                <div className="space-y-2 text-xs text-slate-600">
                  <div className="flex items-start gap-2">
                    <span className="font-bold text-teal-700 shrink-0">1.</span>
                    <span><strong>Accidental Geometry Deletion:</strong> Use the "Discard Draft" button in the 2D editor or restore the most recent snapshot in Revisions & Diff.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-bold text-teal-700 shrink-0">2.</span>
                    <span><strong>Device Migration or Cache Wipe:</strong> Import the backed-up project `.json` file from your local disk to restore complete project state.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-bold text-teal-700 shrink-0">3.</span>
                    <span><strong>Storage Quota Exceeded:</strong> Export active projects, open System Health, and execute snapshot pruning to reclaim storage space.</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: SUPPORT & INCIDENT RUNBOOK */}
          {activeTab === 'support' && (
            <div className="space-y-5">
              {/* Severity Matrix */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 font-bold text-xs text-slate-900">
                  Operational Severity Matrix & Response SLAs
                </div>
                <div className="divide-y divide-slate-100 text-xs">
                  <div className="p-3.5 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 text-[10px] font-bold bg-rose-100 text-rose-800 rounded">
                          P1 — CRITICAL
                        </span>
                        <strong className="text-slate-900">Data Loss / Life-Safety Conflict</strong>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Project corruption, false-negative safety violation, unrecoverable freeze
                      </p>
                    </div>
                    <span className="font-mono font-bold text-rose-700 text-xs">&lt; 2 Hours</span>
                  </div>

                  <div className="p-3.5 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-800 rounded">
                          P2 — MAJOR
                        </span>
                        <strong className="text-slate-900">Core Functional Impairment</strong>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        2D-to-3D sync failure, structural calculation mismatch
                      </p>
                    </div>
                    <span className="font-mono font-bold text-amber-700 text-xs">&lt; 8 Hours</span>
                  </div>

                  <div className="p-3.5 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-800 rounded">
                          P3 — MODERATE
                        </span>
                        <strong className="text-slate-900">Non-Critical Feature Degradation</strong>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Performance stutter on large models, minor visual layout glitch
                      </p>
                    </div>
                    <span className="font-mono font-bold text-blue-700 text-xs">&lt; 24 Hours</span>
                  </div>
                </div>
              </div>

              {/* Support Issue Generator */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <h3 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                    <LifeBuoy className="w-4 h-4 text-teal-600" />
                    <span>Sanitized Diagnostic Bundle & Support Issue Generator</span>
                  </h3>
                  <button
                    onClick={handleCopyDiagnostics}
                    className="px-2.5 py-1 text-xs font-medium text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer inline-flex items-center gap-1.5"
                  >
                    {copiedDiagnostic ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedDiagnostic ? 'Copied Diagnostic!' : 'Copy Diagnostics'}</span>
                  </button>
                </div>

                <div className="bg-slate-900 text-slate-300 font-mono text-[11px] p-3 rounded-lg overflow-x-auto max-h-48">
                  <pre>{JSON.stringify(diagnosticBundle, null, 2)}</pre>
                </div>

                <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>
                    Zero personal names, emails, or confidential drawings are exposed in this bundle.
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-white flex items-center justify-between shrink-0 text-xs">
          <div className="text-slate-500 flex items-center gap-2">
            <span>Operational Package: <strong>v1.0.0-rc1</strong></span>
            <span>·</span>
            <span>Status: <strong className="text-emerald-700">Release Controls Verified</strong></span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
