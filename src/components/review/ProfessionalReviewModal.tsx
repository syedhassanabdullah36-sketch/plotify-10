/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  FileCheck2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  ShieldAlert,
  UserCheck,
  Plus,
  Download,
  X,
  Filter,
  Layers,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  FileSpreadsheet,
  FileText,
  AlertCircle,
  HelpCircle,
  Check,
} from 'lucide-react';
import { Project } from '../../types/project';
import {
  ProfessionalReviewRegister,
  ProfessionalReviewItem,
  ProfessionalFinding,
  ReviewDiscipline,
  ReviewStatus,
  FindingPriority,
  FindingResolutionStatus,
} from '../../types/review';
import {
  initializeProfessionalReviews,
  addProfessionalReviewItem,
  updateFindingResolution,
  generateReviewDossierMarkdown,
  exportReviewRegisterCSV,
  REVIEW_DISCIPLINE_LABELS,
} from '../../services/expertReviewService';

interface Props {
  project: Project;
  isOpen: boolean;
  onClose: () => void;
  onUpdateProject: (updated: Project) => void;
  onShowToast: (message: string, type: 'success' | 'error' | 'info') => void;
  onOpenFloorPlan?: () => void;
  onOpenStructural?: () => void;
  onOpenMEP?: () => void;
}

type TabMode = 'register' | 'findings' | 'dossier';

export const ProfessionalReviewModal: React.FC<Props> = ({
  project,
  isOpen,
  onClose,
  onUpdateProject,
  onShowToast,
  onOpenFloorPlan,
  onOpenStructural,
  onOpenMEP,
}) => {
  const [register, setRegister] = useState<ProfessionalReviewRegister>(() =>
    initializeProfessionalReviews(project)
  );

  const [activeTab, setActiveTab] = useState<TabMode>('register');
  const [disciplineFilter, setDisciplineFilter] = useState<ReviewDiscipline | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<ReviewStatus | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = useState<FindingPriority | 'all'>('all');
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  // New Review Form State
  const [isAddingReview, setIsAddingReview] = useState(false);
  const [newDiscipline, setNewDiscipline] = useState<ReviewDiscipline>('architecture_spatial');
  const [newTitle, setNewTitle] = useState('');
  const [newTargetSubject, setNewTargetSubject] = useState('');
  const [newScope, setNewScope] = useState('');
  const [newReviewerName, setNewReviewerName] = useState('Elena Rostova, AIA');
  const [newReviewerRole, setNewReviewerRole] = useState('Principal Architect');
  const [newReviewerCredentials, setNewReviewerCredentials] = useState('AIA, NCARB');
  const [newStatus, setNewStatus] = useState<ReviewStatus>('accepted-scope');
  const [newComments, setNewComments] = useState('');

  // Finding Resolution Modal State
  const [resolvingFinding, setResolvingFinding] = useState<{
    reviewItemId: string;
    findingId: string;
    findingTitle: string;
  } | null>(null);
  const [resolutionStatus, setResolutionStatus] = useState<FindingResolutionStatus>('verified-resolved');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [resolverName, setResolverName] = useState('Elena Rostova, AIA');

  // Sync state if project changes
  useMemo(() => {
    setRegister(initializeProfessionalReviews(project));
  }, [project]);

  // Filtered reviews
  const filteredItems = useMemo(() => {
    return register.items.filter((item) => {
      if (disciplineFilter !== 'all' && item.discipline !== disciplineFilter) return false;
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      return true;
    });
  }, [register, disciplineFilter, statusFilter]);

  // All findings across all items
  const allFindings = useMemo(() => {
    return register.items.flatMap((i) =>
      i.findings.map((f) => ({ ...f, parentItemTitle: i.title, parentReviewId: i.id }))
    );
  }, [register]);

  const filteredFindings = useMemo(() => {
    return allFindings.filter((f) => {
      if (disciplineFilter !== 'all' && f.discipline !== disciplineFilter) return false;
      if (priorityFilter !== 'all' && f.priority !== priorityFilter) return false;
      return true;
    });
  }, [allFindings, disciplineFilter, priorityFilter]);

  if (!isOpen) return null;

  const handleCreateReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newScope.trim()) {
      onShowToast('Please provide a review title and define the review scope.', 'error');
      return;
    }

    const updated = addProfessionalReviewItem(register, project, {
      discipline: newDiscipline,
      title: newTitle.trim(),
      targetSubject: newTargetSubject.trim() || 'Floor Plan / Overall Model',
      scopeAndLimitations: newScope.trim(),
      reviewerName: newReviewerName.trim(),
      reviewerRole: newReviewerRole.trim(),
      reviewerCredentials: newReviewerCredentials.trim(),
      reviewDate: new Date().toISOString(),
      status: newStatus,
      generalComments: newComments.trim() || 'Review assessment documented.',
      findings: [],
    });

    setRegister(updated);
    onUpdateProject({ ...project, expertReviews: updated });
    setIsAddingReview(false);
    setNewTitle('');
    setNewScope('');
    setNewComments('');
    onShowToast(`Professional review "${newTitle}" registered.`, 'success');
  };

  const handleConfirmResolution = () => {
    if (!resolvingFinding) return;

    const updated = updateFindingResolution(
      register,
      resolvingFinding.reviewItemId,
      resolvingFinding.findingId,
      {
        status: resolutionStatus,
        notes: resolutionNotes.trim() || 'Resolution accepted by reviewer.',
        resolvedBy: resolverName.trim(),
      }
    );

    setRegister(updated);
    onUpdateProject({ ...project, expertReviews: updated });
    setResolvingFinding(null);
    setResolutionNotes('');
    onShowToast(`Finding updated to ${resolutionStatus.replace('-', ' ').toUpperCase()}.`, 'success');
  };

  const handleExportMarkdown = () => {
    const md = generateReviewDossierMarkdown(register, project);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plotify-professional-review-dossier-${project.id}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onShowToast('Professional Review Dossier (.md) exported.', 'success');
  };

  const handleExportCSV = () => {
    const csv = exportReviewRegisterCSV(register, project);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plotify-review-register-${project.id}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onShowToast('Review Register CSV exported.', 'success');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/80">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-teal-700 flex items-center justify-center text-white shadow-sm">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-semibold text-slate-900">
                  Professional Validation & Expert Review Register
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-teal-100 text-teal-800 border border-teal-200">
                  Evidence-Linked
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Track formal peer evaluations, evidence-linked findings, and resolution sign-offs for project <strong className="text-slate-800">{project.name}</strong>.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setIsAddingReview(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-semibold transition shadow-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Record Expert Review</span>
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

        {/* Staleness Advisory Banner (if any review is outdated) */}
        {register.summary.expiredCount > 0 && (
          <div className="bg-amber-50 border-b border-amber-200 px-6 py-2.5 flex items-center justify-between text-xs text-amber-900">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>Geometry Hash Outdated:</strong> {register.summary.expiredCount} review record(s) were assessed on older 2D geometry and require re-evaluation before release.
              </span>
            </div>
            <span className="text-[11px] font-mono bg-white px-2 py-0.5 rounded border border-amber-300">
              Fingerprint Mismatch
            </span>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 bg-slate-100/60 px-6 gap-2 pt-2">
          <button
            onClick={() => setActiveTab('register')}
            className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-medium border-b-2 transition ${
              activeTab === 'register'
                ? 'border-teal-700 text-teal-900 bg-white rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileCheck2 className="w-4 h-4" />
            <span>Scoped Reviews ({register.items.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('findings')}
            className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-medium border-b-2 transition ${
              activeTab === 'findings'
                ? 'border-teal-700 text-teal-900 bg-white rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <AlertCircle className="w-4 h-4" />
            <span>Action Findings ({allFindings.length})</span>
            {register.summary.openFindingsCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-100 text-amber-800 font-bold">
                {register.summary.openFindingsCount} Open
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('dossier')}
            className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-medium border-b-2 transition ${
              activeTab === 'dossier'
                ? 'border-teal-700 text-teal-900 bg-white rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Dossier & Exports</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: SCOPED REVIEWS REGISTER */}
          {activeTab === 'register' && (
            <div className="space-y-4">
              {/* Filter Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 font-medium">Discipline:</span>
                  <select
                    value={disciplineFilter}
                    onChange={(e) => setDisciplineFilter(e.target.value as any)}
                    className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800"
                  >
                    <option value="all">All Disciplines ({register.items.length})</option>
                    {Object.entries(REVIEW_DISCIPLINE_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-slate-500 font-medium">Review Status:</span>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                    className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800"
                  >
                    <option value="all">All Statuses</option>
                    <option value="accepted-scope">Accepted for Defined Scope</option>
                    <option value="changes-required">Changes Required</option>
                    <option value="in-review">Under Active Review</option>
                    <option value="expired-or-superseded">Expired / Superseded</option>
                  </select>
                </div>
              </div>

              {/* Review Items List */}
              <div className="space-y-3">
                {filteredItems.length === 0 ? (
                  <div className="text-center py-12 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-xs text-slate-500">
                    No professional review items match the active filters.
                  </div>
                ) : (
                  filteredItems.map((item) => {
                    const isExpanded = expandedItemId === item.id;
                    const statusBg =
                      item.isPotentiallyOutdated
                        ? 'bg-amber-100 text-amber-800 border-amber-300'
                        : item.status === 'accepted-scope'
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : item.status === 'changes-required'
                        ? 'bg-rose-100 text-rose-800 border-rose-300'
                        : 'bg-slate-100 text-slate-800 border-slate-300';

                    return (
                      <div
                        key={item.id}
                        className={`rounded-xl border transition ${
                          item.isPotentiallyOutdated
                            ? 'bg-amber-50/30 border-amber-200'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div
                          onClick={() => setExpandedItemId(isExpanded ? null : item.id)}
                          className="p-4 cursor-pointer select-none flex items-start justify-between gap-4"
                        >
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700 uppercase">
                                {REVIEW_DISCIPLINE_LABELS[item.discipline]}
                              </span>
                              <h4 className="text-xs font-bold text-slate-900">{item.title}</h4>
                              <span className="text-[10px] font-mono text-slate-400">Rev #{item.revisionNumber}</span>
                            </div>

                            <p className="text-xs text-slate-600 line-clamp-1">
                              <strong>Scope:</strong> {item.scopeAndLimitations}
                            </p>

                            <div className="text-[11px] text-slate-500 flex items-center space-x-3 pt-0.5">
                              <span>
                                Evaluated by <strong>{item.reviewerName}</strong> ({item.reviewerRole})
                              </span>
                              <span>•</span>
                              <span>{new Date(item.reviewDate).toLocaleDateString()}</span>
                              <span>•</span>
                              <span>{item.findings.length} Finding(s)</span>
                            </div>
                          </div>

                          <div className="flex items-center space-x-3 shrink-0">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-bold border ${statusBg}`}>
                              {item.isPotentiallyOutdated
                                ? '⚠️ OUTDATED'
                                : item.status.replace('-', ' ').toUpperCase()}
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
                          <div className="px-5 pb-5 pt-2 border-t border-slate-100 text-xs space-y-3 bg-slate-50/50 rounded-b-xl">
                            <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-1.5">
                              <div className="text-slate-500 font-medium">Defined Scope & Stated Limitations:</div>
                              <p className="text-slate-800 italic">{item.scopeAndLimitations}</p>
                              <div className="text-slate-500 font-medium pt-1">Review Comments:</div>
                              <p className="text-slate-800">{item.generalComments}</p>
                            </div>

                            {/* Findings List inside Item */}
                            {item.findings.length > 0 && (
                              <div className="space-y-2 pt-1">
                                <h5 className="font-bold text-xs uppercase tracking-wider text-slate-500">
                                  Findings & Required Actions ({item.findings.length})
                                </h5>
                                {item.findings.map((f) => (
                                  <div
                                    key={f.id}
                                    className="p-3 bg-white rounded-lg border border-slate-200 text-xs space-y-2"
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="flex items-center space-x-2">
                                        <span
                                          className={`px-1.5 py-0.2 rounded text-[10px] font-bold uppercase ${
                                            f.priority === 'critical'
                                              ? 'bg-rose-100 text-rose-800'
                                              : f.priority === 'high'
                                              ? 'bg-amber-100 text-amber-800'
                                              : 'bg-slate-100 text-slate-700'
                                          }`}
                                        >
                                          {f.priority}
                                        </span>
                                        <span className="font-bold text-slate-900">{f.title}</span>
                                      </div>

                                      <div className="flex items-center space-x-2">
                                        <span
                                          className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold ${
                                            f.resolutionStatus === 'verified-resolved'
                                              ? 'bg-emerald-100 text-emerald-800'
                                              : 'bg-amber-100 text-amber-800'
                                          }`}
                                        >
                                          {f.resolutionStatus.replace('-', ' ').toUpperCase()}
                                        </span>
                                        {f.resolutionStatus === 'open' && (
                                          <button
                                            onClick={() =>
                                              setResolvingFinding({
                                                reviewItemId: item.id,
                                                findingId: f.id,
                                                findingTitle: f.title,
                                              })
                                            }
                                            className="px-2 py-1 bg-teal-50 hover:bg-teal-100 text-teal-800 rounded font-semibold text-[11px] border border-teal-200 cursor-pointer"
                                          >
                                            Resolve Finding
                                          </button>
                                        )}
                                      </div>
                                    </div>

                                    <p className="text-slate-700">{f.description}</p>
                                    <div className="bg-slate-50 p-2 rounded border border-slate-100 text-[11px]">
                                      <span className="font-semibold text-slate-700">Corrective Action Required: </span>
                                      <span className="text-slate-600">{f.correctiveActionRequired}</span>
                                      <span className="text-slate-400 block mt-0.5">Assigned Role: {f.assigneeRole}</span>
                                    </div>

                                    {f.resolutionNotes && (
                                      <div className="bg-emerald-50/70 p-2 rounded border border-emerald-100 text-[11px] text-emerald-900">
                                        <span className="font-semibold">Resolution Note: </span>
                                        {f.resolutionNotes} (by {f.resolvedBy} on{' '}
                                        {f.resolvedAt ? new Date(f.resolvedAt).toLocaleDateString() : 'N/A'})
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB 2: FINDINGS REGISTER */}
          {activeTab === 'findings' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
                <span className="text-slate-600">
                  Manage all action items raised across architectural, structural, MEP, and regulatory reviews.
                </span>
                <select
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value as any)}
                  className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800"
                >
                  <option value="all">All Priorities ({allFindings.length})</option>
                  <option value="critical">Critical Only</option>
                  <option value="high">High Only</option>
                  <option value="medium">Medium Only</option>
                  <option value="low">Low Only</option>
                </select>
              </div>

              <div className="space-y-2">
                {filteredFindings.length === 0 ? (
                  <div className="text-center py-12 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-xs text-slate-500">
                    No findings recorded under the current filters.
                  </div>
                ) : (
                  filteredFindings.map((f) => (
                    <div key={f.id} className="p-4 bg-white rounded-xl border border-slate-200 space-y-2 text-xs">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center space-x-2">
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-bold uppercase ${
                              f.priority === 'critical'
                                ? 'bg-rose-100 text-rose-800'
                                : f.priority === 'high'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {f.priority}
                          </span>
                          <span className="font-bold text-slate-900">{f.title}</span>
                          <span className="text-slate-400 font-mono text-[11px]">({f.parentItemTitle})</span>
                        </div>

                        <div className="flex items-center space-x-2">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold ${
                              f.resolutionStatus === 'verified-resolved'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {f.resolutionStatus.replace('-', ' ').toUpperCase()}
                          </span>
                          {f.resolutionStatus === 'open' && (
                            <button
                              onClick={() =>
                                setResolvingFinding({
                                  reviewItemId: f.reviewItemId,
                                  findingId: f.id,
                                  findingTitle: f.title,
                                })
                              }
                              className="px-2 py-1 bg-teal-50 hover:bg-teal-100 text-teal-800 rounded font-semibold text-[11px] border border-teal-200 cursor-pointer"
                            >
                              Resolve
                            </button>
                          )}
                        </div>
                      </div>

                      <p className="text-slate-700">{f.description}</p>
                      <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 text-[11px]">
                        <span className="font-semibold text-slate-800">Required Correction: </span>
                        {f.correctiveActionRequired} (Assignee: <strong>{f.assigneeRole}</strong>)
                      </div>

                      {f.resolutionNotes && (
                        <div className="p-2.5 bg-emerald-50 rounded-lg border border-emerald-100 text-[11px] text-emerald-900">
                          <span className="font-semibold">Resolution: </span>
                          {f.resolutionNotes} (Confirmed by {f.resolvedBy})
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 3: DOSSIER & EXPORTS */}
          {activeTab === 'dossier' && (
            <div className="space-y-6">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      Export Professional Review & Validation Dossier
                    </h3>
                    <p className="text-xs text-slate-500">
                      Download formal audit registers for local authority submission, insurer review, or contractor bidding.
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={handleExportMarkdown}
                      className="flex items-center space-x-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition shadow-xs cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-teal-400" />
                      <span>Export Dossier (.md)</span>
                    </button>
                    <button
                      onClick={handleExportCSV}
                      className="flex items-center space-x-1.5 px-3 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold transition cursor-pointer"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Export CSV Table</span>
                    </button>
                  </div>
                </div>

                <div className="bg-amber-50 rounded-xl border border-amber-200 p-4 text-xs text-amber-900 space-y-2">
                  <div className="flex items-center space-x-2 font-bold">
                    <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0" />
                    <span>Statutory Practice & Legal Boundaries</span>
                  </div>
                  <p className="text-[11px] text-amber-900/90 leading-relaxed">
                    Plotify’s review register organizes expert feedback and tracks corrective actions. It does <strong>not</strong> grant building permits or substitute for wet/digital engineering stamps. Formal regulatory submissions require certified drawings endorsed by licensed practitioners in the local jurisdiction.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* New Review Modal Overlay */}
        {isAddingReview && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/70">
            <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <h3 className="text-sm font-bold text-slate-900">Record New Professional Review</h3>
                <button
                  onClick={() => setIsAddingReview(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCreateReview} className="space-y-3 text-xs">
                <div>
                  <label className="font-semibold block mb-1 text-slate-700">Review Discipline</label>
                  <select
                    value={newDiscipline}
                    onChange={(e) => setNewDiscipline(e.target.value as any)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                  >
                    {Object.entries(REVIEW_DISCIPLINE_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-semibold block mb-1 text-slate-700">Review Title / Assessment Scope</label>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="e.g. Primary Staircase Egress & Egress Widths"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                    required
                  />
                </div>

                <div>
                  <label className="font-semibold block mb-1 text-slate-700">Defined Scope & Limitations (Mandatory)</label>
                  <textarea
                    value={newScope}
                    onChange={(e) => setNewScope(e.target.value)}
                    placeholder="Explicitly define what is covered and what is excluded (e.g. 'Limited to ground floor corridors. Excludes upper fire suppression hydraulics.')."
                    rows={2}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-semibold block mb-1 text-slate-700">Reviewer Name</label>
                    <input
                      type="text"
                      value={newReviewerName}
                      onChange={(e) => setNewReviewerName(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                      required
                    />
                  </div>
                  <div>
                    <label className="font-semibold block mb-1 text-slate-700">Credentials</label>
                    <input
                      type="text"
                      value={newReviewerCredentials}
                      onChange={(e) => setNewReviewerCredentials(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-semibold block mb-1 text-slate-700">Review Status</label>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value as any)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                  >
                    <option value="accepted-scope">Accepted for Defined Scope</option>
                    <option value="changes-required">Changes Required</option>
                    <option value="in-review">Under Active Review</option>
                    <option value="unable-to-assess">Unable to Assess (Missing Data)</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold block mb-1 text-slate-700">Review Comments</label>
                  <textarea
                    value={newComments}
                    onChange={(e) => setNewComments(e.target.value)}
                    placeholder="Detailed professional commentary and observations."
                    rows={2}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                  />
                </div>

                <div className="flex justify-end space-x-2 pt-2 border-t">
                  <button
                    type="button"
                    onClick={() => setIsAddingReview(false)}
                    className="px-3 py-1.5 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-teal-700 hover:bg-teal-800 text-white rounded-lg font-semibold"
                  >
                    Save Review
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Resolution Modal Overlay */}
        {resolvingFinding && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/70">
            <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-5 space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <h3 className="text-sm font-bold text-slate-900">Resolve Finding Action</h3>
                <button
                  onClick={() => setResolvingFinding(null)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <p className="text-slate-600">
                  Finding: <strong>{resolvingFinding.findingTitle}</strong>
                </p>

                <div>
                  <label className="font-semibold block mb-1 text-slate-700">Resolution Decision</label>
                  <select
                    value={resolutionStatus}
                    onChange={(e) => setResolutionStatus(e.target.value as any)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                  >
                    <option value="verified-resolved">Verified Resolved (Correction Confirmed)</option>
                    <option value="variance-accepted">Variance Accepted (Documented Waiver)</option>
                    <option value="proposed-correction">Proposed Correction (Pending Re-review)</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold block mb-1 text-slate-700">Resolution Notes & Evidence</label>
                  <textarea
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    placeholder="Describe how the issue was resolved or justify why the variance was accepted."
                    rows={3}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                    required
                  />
                </div>

                <div>
                  <label className="font-semibold block mb-1 text-slate-700">Confirming Reviewer</label>
                  <input
                    type="text"
                    value={resolverName}
                    onChange={(e) => setResolverName(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                    required
                  />
                </div>

                <div className="flex justify-end space-x-2 pt-2 border-t">
                  <button
                    type="button"
                    onClick={() => setResolvingFinding(null)}
                    className="px-3 py-1.5 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmResolution}
                    className="px-4 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-semibold"
                  >
                    Confirm Resolution
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <span>Plotify Professional Review Framework • Engine v1.0.0-p21</span>
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
