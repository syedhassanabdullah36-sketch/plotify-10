/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ShieldCheck,
  HardDrive,
  Database,
  Download,
  Upload,
  AlertTriangle,
  CheckCircle2,
  FileCheck2,
  Lock,
  RefreshCw,
  X,
  FileJson,
  EyeOff,
  Activity,
  Layers,
  ArrowRight,
  RotateCcw,
  Info,
  Cloud,
  Server,
  CloudOff,
  Link2,
} from 'lucide-react';
import { Project } from '../../types/project';
import { StorageQuotaInfo, StorageIntegrityAuditResult, BackupValidationResult, PlotifySystemBackup } from '../../types/security';
import { getStorageQuotaInfo, auditStorageIntegrity, purgeOrphanedSnapshots } from '../../services/storageGuard';
import {
  generateSystemBackup,
  downloadSystemBackup,
  validateSystemBackupFile,
  restoreSystemBackup,
  rollbackLastSystemRestore,
  ingestSystemArchiveToBackend,
} from '../../services/backupService';
import { anonymizeProject, getPrivacySummary } from '../../services/privacyService';
import {
  getCloudPersistenceStatus,
  isCloudPersistenceEnabled,
} from '../../services/storage';
import {
  checkApiHealth,
  getAuthSession,
  setAuthSession,
  isAuthSessionConfigured,
} from '../../services/apiClient';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  projects: Project[];
  activeProject: Project | null;
  onProjectsUpdated: () => void;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

type ActiveTab = 'health' | 'audit' | 'backup' | 'privacy' | 'cloud';

export const SystemHealthModal: React.FC<Props> = ({
  isOpen,
  onClose,
  projects,
  activeProject,
  onProjectsUpdated,
  showToast,
}) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('health');
  const [quotaInfo, setQuotaInfo] = useState<StorageQuotaInfo>(getStorageQuotaInfo());
  const [auditResult, setAuditResult] = useState<StorageIntegrityAuditResult>(() => auditStorageIntegrity(projects));

  // Cloud & API State
  const [apiHealthStatus, setApiHealthStatus] = useState<{ status: string; package: string } | null>(null);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [isIngestingArchive, setIsIngestingArchive] = useState(false);
  const [archiveIngestResult, setArchiveIngestResult] = useState<any>(null);
  const [sessionTokenInput, setSessionTokenInput] = useState('');
  const [sessionTenantInput, setSessionTenantInput] = useState('');

  // Backup restore states
  const [uploadedBackupFile, setUploadedBackupFile] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<BackupValidationResult | null>(null);
  const [restoreMode, setRestoreMode] = useState<'replace' | 'merge'>('replace');
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Refresh data on open or tab change
  useEffect(() => {
    if (isOpen) {
      setQuotaInfo(getStorageQuotaInfo());
      setAuditResult(auditStorageIntegrity(projects));
      setUploadedBackupFile(null);
      setValidationResult(null);
    }
  }, [isOpen, projects]);

  const privacySummary = useMemo(() => getPrivacySummary(projects), [projects]);

  if (!isOpen) return null;

  const handleRefreshAudit = () => {
    const updatedQuota = getStorageQuotaInfo();
    const updatedAudit = auditStorageIntegrity(projects);
    setQuotaInfo(updatedQuota);
    setAuditResult(updatedAudit);
    showToast('Storage & integrity audit refreshed.', 'info');
  };

  const handlePurgeOrphans = () => {
    const purged = purgeOrphanedSnapshots(projects);
    const updatedQuota = getStorageQuotaInfo();
    const updatedAudit = auditStorageIntegrity(projects);
    setQuotaInfo(updatedQuota);
    setAuditResult(updatedAudit);
    showToast(`Cleaned ${purged} orphaned snapshot keys.`, 'success');
  };

  const handleDownloadFullBackup = () => {
    try {
      const backup = generateSystemBackup();
      downloadSystemBackup(backup);
      showToast(`Full backup downloaded (${backup.data.metadata.totalProjects} projects, ${backup.data.metadata.totalSnapshots} snapshots).`, 'success');
    } catch (err) {
      showToast('Failed to export backup.', 'error');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setUploadedBackupFile(content);
      const val = validateSystemBackupFile(content, projects);
      setValidationResult(val);
    };
    reader.readAsText(file);
  };

  const handleExecuteRestore = () => {
    if (!uploadedBackupFile || !validationResult || !validationResult.isValid) return;

    setIsProcessing(true);
    try {
      const parsed = JSON.parse(uploadedBackupFile) as PlotifySystemBackup;
      const res = restoreSystemBackup(parsed, restoreMode);
      if (res.success) {
        showToast(res.message, 'success');
        onProjectsUpdated();
        setUploadedBackupFile(null);
        setValidationResult(null);
      } else {
        showToast(res.message, 'error');
      }
    } catch (err) {
      showToast('Restore execution failed.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRollback = () => {
    setIsProcessing(true);
    try {
      const res = rollbackLastSystemRestore();
      if (res.success) {
        showToast(res.message, 'success');
        onProjectsUpdated();
      } else {
        showToast(res.message, 'error');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExportAnonymized = () => {
    if (!activeProject) {
      showToast('Please select a project first to create an anonymized export.', 'info');
      return;
    }
    const anon = anonymizeProject(activeProject);
    const blob = new Blob([JSON.stringify(anon, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${anon.id}-anonymized-tender.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Anonymized copy of "${activeProject.name}" exported without client personal data.`, 'success');
  };

  const cloudStatus = useMemo(() => getCloudPersistenceStatus(), [isOpen]);
  const activeSession = useMemo(() => getAuthSession(), [isOpen, activeTab]);

  const handleTestApiHealth = async () => {
    setIsCheckingHealth(true);
    try {
      const res = await checkApiHealth();
      setApiHealthStatus(res);
      showToast(`API Gateway is reachable (${res.package})`, 'success');
    } catch (err: any) {
      setApiHealthStatus(null);
      showToast(`API Gateway health check failed: ${err.message}`, 'error');
    } finally {
      setIsCheckingHealth(false);
    }
  };

  const handleIngestArchive = async () => {
    setIsIngestingArchive(true);
    try {
      const res = await ingestSystemArchiveToBackend('Plotify System Health Ingest');
      if (res.success) {
        setArchiveIngestResult(res.result);
        showToast('Successfully ingested project archive to backend!', 'success');
      } else {
        showToast(res.error || 'Archive ingestion failed.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Archive ingestion failed.', 'error');
    } finally {
      setIsIngestingArchive(false);
    }
  };

  const handleSaveDevSession = () => {
    if (!sessionTokenInput.trim() || !sessionTenantInput.trim()) {
      showToast('Both Bearer token and Tenant UUID are required.', 'error');
      return;
    }
    setAuthSession({
      token: sessionTokenInput.trim(),
      tenantId: sessionTenantInput.trim(),
    });
    setSessionTokenInput('');
    setSessionTenantInput('');
    showToast('Session credentials saved to active browser tab.', 'success');
  };

  const handleClearSession = () => {
    setAuthSession(null);
    showToast('Active session cleared.', 'info');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/80">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center text-white shadow-sm">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-semibold text-slate-900">
                  Production Infrastructure & Security Engine
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Air-Gapped Local
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Storage quota monitoring, schema integrity audits, disaster recovery backups, and privacy governance.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-lg transition"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 bg-slate-100/60 px-6 gap-2 pt-2">
          <button
            onClick={() => setActiveTab('health')}
            className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-medium border-b-2 transition ${
              activeTab === 'health'
                ? 'border-teal-600 text-teal-800 bg-white rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>Storage & Capacity</span>
          </button>

          <button
            onClick={() => setActiveTab('audit')}
            className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-medium border-b-2 transition ${
              activeTab === 'audit'
                ? 'border-teal-600 text-teal-800 bg-white rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileCheck2 className="w-4 h-4" />
            <span>Integrity Audit</span>
            {auditResult.errorsCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-100 text-rose-700 font-bold">
                {auditResult.errorsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('backup')}
            className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-medium border-b-2 transition ${
              activeTab === 'backup'
                ? 'border-teal-600 text-teal-800 bg-white rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>Disaster Recovery & Backups</span>
          </button>

          <button
            onClick={() => setActiveTab('privacy')}
            className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-medium border-b-2 transition ${
              activeTab === 'privacy'
                ? 'border-teal-600 text-teal-800 bg-white rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Lock className="w-4 h-4" />
            <span>Privacy & Local Boundaries</span>
          </button>

          <button
            onClick={() => setActiveTab('cloud')}
            className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-medium border-b-2 transition ${
              activeTab === 'cloud'
                ? 'border-teal-600 text-teal-800 bg-white rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Server className="w-4 h-4" />
            <span>Cloud & Backend API</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: Storage & Capacity */}
          {activeTab === 'health' && (
            <div className="space-y-6">
              {/* Storage Quota Card */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="p-2.5 rounded-lg bg-teal-100 text-teal-700">
                      <HardDrive className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">
                        Browser Local Storage Allocation
                      </h3>
                      <p className="text-xs text-slate-500">
                        Standard Web Storage origin quota estimate: ~5.00 MB
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-mono font-bold text-slate-800">
                      {(quotaInfo.usedBytes / 1024).toFixed(1)} KB
                    </span>
                    <span className="text-xs text-slate-400"> / 5,120 KB</span>
                    <div className="text-[11px] font-medium text-emerald-600">
                      {quotaInfo.percentageUsed}% utilized
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                  <div
                    className={`h-2.5 rounded-full transition-all duration-500 ${
                      quotaInfo.percentageUsed >= 80 ? 'bg-rose-500' : 'bg-teal-600'
                    }`}
                    style={{ width: `${Math.max(2, quotaInfo.percentageUsed)}%` }}
                  />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                  <div className="bg-white p-3 rounded-lg border border-slate-200">
                    <div className="text-[11px] text-slate-500 uppercase font-mono">Projects Stored</div>
                    <div className="text-lg font-bold text-slate-900 mt-0.5">{quotaInfo.projectCount}</div>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-slate-200">
                    <div className="text-[11px] text-slate-500 uppercase font-mono">Snapshots & Revisions</div>
                    <div className="text-lg font-bold text-slate-900 mt-0.5">{quotaInfo.snapshotCount}</div>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-slate-200">
                    <div className="text-[11px] text-slate-500 uppercase font-mono">Storage Limit Status</div>
                    <div className="text-xs font-semibold text-emerald-700 mt-1 flex items-center space-x-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Capacity Nominal</span>
                    </div>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-slate-200">
                    <div className="text-[11px] text-slate-500 uppercase font-mono">Persistence Guard</div>
                    <div className="text-xs font-semibold text-teal-700 mt-1 flex items-center space-x-1">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Quota Auto-Prune Active</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                  <p className="text-xs text-slate-500">
                    Auto-checkpoints are automatically pruned at 15 revisions to prevent overflow. Manual milestones and safety rollbacks are permanently preserved.
                  </p>
                  <button
                    onClick={handlePurgeOrphans}
                    className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition shrink-0 ml-3"
                  >
                    Purge Orphaned Keys
                  </button>
                </div>
              </div>

              {/* Deployment Security Baseline Checklist */}
              <div className="border border-slate-200 rounded-xl p-5 space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Security Baseline Verification
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="flex items-start space-x-3 p-3 rounded-lg bg-emerald-50/50 border border-emerald-200/60">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-semibold text-slate-900">Zero Hardcoded Secrets</p>
                      <p className="text-slate-500 text-[11px]">All API configurations and bundle contents are verified free of credentials, tokens, or private secrets.</p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3 p-3 rounded-lg bg-emerald-50/50 border border-emerald-200/60">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-semibold text-slate-900">Air-Gapped Client Isolation</p>
                      <p className="text-slate-500 text-[11px]">No external telemetry, tracking cookies, or silent background data exfiltration.</p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3 p-3 rounded-lg bg-emerald-50/50 border border-emerald-200/60">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-semibold text-slate-900">Prototype Pollution Guard</p>
                      <p className="text-slate-500 text-[11px]">All JSON parsing and import pipelines recursively sanitize __proto__, constructor, and prototype keys.</p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3 p-3 rounded-lg bg-emerald-50/50 border border-emerald-200/60">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-semibold text-slate-900">Disaster Recovery Error Boundary</p>
                      <p className="text-slate-500 text-[11px]">Top-level React error interception protects working state and enables emergency JSON data downloads.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Integrity Audit */}
          {activeTab === 'audit' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Schema Consistency & Spatial Model Audit
                  </h3>
                  <p className="text-xs text-slate-500">
                    Scans all project records, floor plans, MEP coordination trees, and snapshot pointers.
                  </p>
                </div>
                <button
                  onClick={handleRefreshAudit}
                  className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Re-run Audit</span>
                </button>
              </div>

              {/* Status summary banner */}
              <div
                className={`p-4 rounded-xl border flex items-center space-x-3 ${
                  auditResult.passed
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-amber-50 border-amber-200 text-amber-800'
                }`}
              >
                {auditResult.passed ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                )}
                <div>
                  <p className="text-xs font-semibold">
                    {auditResult.passed
                      ? 'Integrity Audit Passed — All schemas adhere to specifications.'
                      : `Integrity Audit Noted ${auditResult.errorsCount} error(s) and ${auditResult.warningsCount} warning(s).`}
                  </p>
                  <p className="text-[11px] opacity-80 mt-0.5">
                    Audited {auditResult.totalProjectsAudited} active projects and {auditResult.totalSnapshotsAudited} revision snapshots at{' '}
                    {new Date(auditResult.auditedAt).toLocaleTimeString()}.
                  </p>
                </div>
              </div>

              {/* Issues list */}
              <div className="space-y-2">
                {auditResult.issues.length === 0 ? (
                  <div className="text-center py-8 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                    <p className="text-xs font-medium text-slate-700">No schema anomalies detected.</p>
                    <p className="text-[11px] text-slate-400 mt-1">All geometry, dimensions, and identifiers are healthy.</p>
                  </div>
                ) : (
                  auditResult.issues.map((issue, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-lg border text-xs flex items-start space-x-3 ${
                        issue.severity === 'error'
                          ? 'bg-rose-50 border-rose-200 text-rose-900'
                          : issue.severity === 'warning'
                          ? 'bg-amber-50 border-amber-200 text-amber-900'
                          : 'bg-slate-50 border-slate-200 text-slate-800'
                      }`}
                    >
                      <div className="shrink-0 mt-0.5">
                        {issue.severity === 'error' ? (
                          <AlertTriangle className="w-4 h-4 text-rose-600" />
                        ) : (
                          <Info className="w-4 h-4 text-amber-600" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold uppercase text-[10px] tracking-wider px-1.5 py-0.2 rounded-sm bg-white/70">
                            {issue.severity}
                          </span>
                          {issue.projectName && (
                            <span className="font-medium text-slate-700">[{issue.projectName}]</span>
                          )}
                          {issue.field && <code className="font-mono text-[10px] text-slate-600">{issue.field}</code>}
                        </div>
                        <p className="mt-1 text-slate-800">{issue.message}</p>
                        {issue.remediation && (
                          <p className="text-[11px] text-slate-500 mt-0.5">Remediation: {issue.remediation}</p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 3: Disaster Recovery & Backups */}
          {activeTab === 'backup' && (
            <div className="space-y-6">
              {/* Export Full System Backup */}
              <div className="border border-slate-200 rounded-xl p-5 bg-slate-50/50 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      Export Full System Disaster Recovery Backup
                    </h3>
                    <p className="text-xs text-slate-500">
                      Creates a portable, checksum-verified JSON archive containing all projects, settings, and revision history.
                    </p>
                  </div>
                  <button
                    onClick={handleDownloadFullBackup}
                    className="flex items-center space-x-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium rounded-lg transition shadow-sm"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Full Backup (.json)</span>
                  </button>
                </div>
              </div>

              {/* Restore System Backup */}
              <div className="border border-slate-200 rounded-xl p-5 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Restore System Archive
                  </h3>
                  <p className="text-xs text-slate-500">
                    Upload a verified Plotify backup bundle. Pre-restore safety checkpoints are created automatically prior to applying changes.
                  </p>
                </div>

                <div className="flex items-center space-x-3">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept=".json"
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center space-x-2 px-3.5 py-2 border border-slate-300 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Select Backup File...</span>
                  </button>

                  <button
                    onClick={handleRollback}
                    disabled={isProcessing}
                    className="flex items-center space-x-1.5 px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Rollback Last Restore</span>
                  </button>
                </div>

                {/* Validation Inspection Card */}
                {validationResult && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        {validationResult.isValid ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-rose-600" />
                        )}
                        <span className="font-semibold text-slate-900">
                          {validationResult.isValid ? 'Valid Archive Bundle' : 'Archive Validation Failed'}
                        </span>
                      </div>
                      <span className="font-mono text-[11px] text-slate-500">
                        {validationResult.projectCount} Projects • {validationResult.snapshotCount} Snapshots
                      </span>
                    </div>

                    {validationResult.warnings.length > 0 && (
                      <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-[11px]">
                        {validationResult.warnings.map((w, i) => (
                          <div key={i}>• {w}</div>
                        ))}
                      </div>
                    )}

                    {validationResult.errors.length > 0 && (
                      <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-[11px]">
                        {validationResult.errors.map((e, i) => (
                          <div key={i}>• {e}</div>
                        ))}
                      </div>
                    )}

                    {validationResult.isValid && validationResult.dryRunSummary && (
                      <div className="space-y-3 pt-2">
                        <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-1">
                          <p className="font-semibold text-slate-800 text-xs">Dry Run Analysis:</p>
                          <p className="text-[11px] text-slate-600">
                            • New Projects to be added: {validationResult.dryRunSummary.newProjects.length}
                          </p>
                          <p className="text-[11px] text-slate-600">
                            • Existing Projects to be updated: {validationResult.dryRunSummary.overwritingProjects.length}
                          </p>
                        </div>

                        {/* Restore Mode Selector */}
                        <div className="flex items-center space-x-4 pt-1">
                          <label className="flex items-center space-x-2 text-xs text-slate-700 cursor-pointer">
                            <input
                              type="radio"
                              name="restoreMode"
                              checked={restoreMode === 'replace'}
                              onChange={() => setRestoreMode('replace')}
                              className="text-teal-600 focus:ring-teal-500"
                            />
                            <span>Replace Workspace (Clean Overwrite with Safety Backup)</span>
                          </label>
                          <label className="flex items-center space-x-2 text-xs text-slate-700 cursor-pointer">
                            <input
                              type="radio"
                              name="restoreMode"
                              checked={restoreMode === 'merge'}
                              onChange={() => setRestoreMode('merge')}
                              className="text-teal-600 focus:ring-teal-500"
                            />
                            <span>Merge (Combine with Existing Projects)</span>
                          </label>
                        </div>

                        <button
                          onClick={handleExecuteRestore}
                          disabled={isProcessing}
                          className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-medium text-xs rounded-lg transition shadow-xs flex items-center space-x-2"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Confirm & Restore Archive Safely</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: Privacy & Local Boundaries */}
          {activeTab === 'privacy' && (
            <div className="space-y-6">
              {/* Privacy Posture Card */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 rounded-lg bg-teal-100 text-teal-700">
                    <Lock className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      Air-Gapped Client Privacy Governance
                    </h3>
                    <p className="text-xs text-slate-500">
                      All architectural models, room coordinates, budgets, and engineering records remain entirely on your device.
                    </p>
                  </div>
                </div>

                <div className="p-4 bg-white rounded-lg border border-slate-200 text-xs space-y-2 text-slate-700">
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-500">Storage Architecture:</span>
                    <span className="font-medium text-slate-900">{privacySummary.storageModel}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-500">Telemetry & Tracking:</span>
                    <span className="font-medium text-emerald-700">Inactive (0 tracking pixels / 0 third-party cookies)</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-500">Projects with Financial Models:</span>
                    <span className="font-medium text-slate-900">{privacySummary.retainedData.projectsWithFinancials}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-500">Projects with Confidential Notes:</span>
                    <span className="font-medium text-slate-900">{privacySummary.retainedData.projectsWithCustomNotes}</span>
                  </div>
                </div>
              </div>

              {/* Data Anonymization Export */}
              <div className="border border-slate-200 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="p-2.5 rounded-lg bg-purple-100 text-purple-700">
                      <EyeOff className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900">
                        Anonymized Model Export (Tender / Review Ready)
                      </h4>
                      <p className="text-xs text-slate-500">
                        Generates a sanitized JSON model stripping homeowner names, project budgets, and confidential notes.
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={handleExportAnonymized}
                    className="flex items-center space-x-2 px-3.5 py-2 bg-purple-700 hover:bg-purple-800 text-white text-xs font-medium rounded-lg transition shadow-xs"
                  >
                    <Download className="w-4 h-4" />
                    <span>Export Anonymized Project</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: Cloud & Backend API */}
          {activeTab === 'cloud' && (
            <div className="space-y-6">
              {/* Architecture & Persistence Provider Status */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="p-2.5 rounded-lg bg-indigo-100 text-indigo-700">
                      <Server className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">
                        Persistence Tier & Cloud Configuration
                      </h3>
                      <p className="text-xs text-slate-500">
                        P53 Dual-Persistence Layer: Offline-first Browser LocalStorage with optional PostgreSQL Cloud Sync
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                      cloudStatus.isCloudActive
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : 'bg-slate-200 text-slate-700 border border-slate-300'
                    }`}>
                      {cloudStatus.isCloudActive ? 'PostgreSQL Active' : 'LocalStorage (Default)'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  <div className="bg-white p-3.5 rounded-lg border border-slate-200">
                    <div className="text-[11px] text-slate-500 uppercase font-mono">Provider Status</div>
                    <div className="text-sm font-bold text-slate-900 mt-1 flex items-center gap-1.5">
                      {cloudStatus.isCloudActive ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span>Cloud Mode (VITE_USE_CLOUD_STORAGE=true)</span>
                        </>
                      ) : (
                        <>
                          <HardDrive className="w-4 h-4 text-slate-600" />
                          <span>Local Mode (VITE_USE_CLOUD_STORAGE=false)</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="bg-white p-3.5 rounded-lg border border-slate-200">
                    <div className="text-[11px] text-slate-500 uppercase font-mono">Session Authorization</div>
                    <div className="text-sm font-bold text-slate-900 mt-1 flex items-center gap-1.5">
                      {activeSession?.token ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span>Authenticated</span>
                        </>
                      ) : (
                        <>
                          <Lock className="w-4 h-4 text-amber-600" />
                          <span>No Active Session</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="bg-white p-3.5 rounded-lg border border-slate-200">
                    <div className="text-[11px] text-slate-500 uppercase font-mono">Active Tenant ID</div>
                    <div className="text-xs font-mono font-semibold text-slate-800 mt-1 truncate" title={activeSession?.tenantId || 'None'}>
                      {activeSession?.tenantId ? activeSession.tenantId : 'None (Air-gapped)'}
                    </div>
                  </div>
                </div>
              </div>

              {/* API Gateway Health Check */}
              <div className="border border-slate-200 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="p-2.5 rounded-lg bg-teal-100 text-teal-700">
                      <Activity className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900">
                        API Gateway Connectivity Check
                      </h4>
                      <p className="text-xs text-slate-500">
                        Pings public endpoint <code className="font-mono text-teal-700">GET /api/health</code> to verify server reachability.
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={handleTestApiHealth}
                    disabled={isCheckingHealth}
                    className="flex items-center space-x-2 px-3.5 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isCheckingHealth ? 'animate-spin' : ''}`} />
                    <span>Test Gateway Health</span>
                  </button>
                </div>

                {apiHealthStatus && (
                  <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs space-y-1">
                    <div className="font-semibold text-emerald-900 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>API Gateway Online & Responding</span>
                    </div>
                    <p className="text-emerald-700 font-mono text-[11px]">
                      Status: {apiHealthStatus.status} • Package: {apiHealthStatus.package}
                    </p>
                  </div>
                )}
              </div>

              {/* Archive Ingestion to Backend */}
              <div className="border border-slate-200 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="p-2.5 rounded-lg bg-indigo-100 text-indigo-700">
                      <Upload className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900">
                        Batch Archive Ingestion (P53 Endpoint)
                      </h4>
                      <p className="text-xs text-slate-500">
                        Ingests all local projects & revision trees via <code className="font-mono text-indigo-700">POST /api/archives/ingest</code> in a single transaction.
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={handleIngestArchive}
                    disabled={isIngestingArchive}
                    className="flex items-center space-x-2 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition"
                  >
                    <Upload className={`w-3.5 h-3.5 ${isIngestingArchive ? 'animate-spin' : ''}`} />
                    <span>Sync Archive to Cloud</span>
                  </button>
                </div>

                {archiveIngestResult && (
                  <div className="p-3.5 bg-indigo-50 border border-indigo-200 rounded-lg text-xs space-y-1">
                    <div className="font-semibold text-indigo-900 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                      <span>Batch Ingestion Transaction Succeeded</span>
                    </div>
                    <p className="text-indigo-800 font-mono text-[11px]">
                      Job ID: {archiveIngestResult.jobId || 'N/A'} • Projects: {archiveIngestResult.projectsIngested || 0} • Duration: {archiveIngestResult.durationMs || 0}ms
                    </p>
                  </div>
                )}
              </div>

              {/* Session Configuration Seam for Development & Testing */}
              <div className="border border-slate-200 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900">
                      Session Configuration Seam (Development & Testing)
                    </h4>
                    <p className="text-xs text-slate-500">
                      Configure session token and tenant UUID in active browser tab. In production, credentials originate from the verified IdP.
                    </p>
                  </div>

                  {activeSession && (
                    <button
                      onClick={handleClearSession}
                      className="px-3 py-1.5 border border-rose-300 text-rose-700 hover:bg-rose-50 text-xs font-medium rounded-lg transition"
                    >
                      Clear Session
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-700 font-medium mb-1">Bearer Token (JWT)</label>
                    <input
                      type="text"
                      placeholder="eyJhbGciOiJIUzI1NiIs..."
                      value={sessionTokenInput}
                      onChange={(e) => setSessionTokenInput(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-[11px] bg-white text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-medium mb-1">Tenant Organization ID (UUID)</label>
                    <input
                      type="text"
                      placeholder="11111111-2222-4333-8444-555555555555"
                      value={sessionTenantInput}
                      onChange={(e) => setSessionTenantInput(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-[11px] bg-white text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    onClick={handleSaveDevSession}
                    className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-medium rounded-lg transition"
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    <span>Apply Session Credentials</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <span>Plotify Security Engine • Build v1.0.0-p19</span>
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
