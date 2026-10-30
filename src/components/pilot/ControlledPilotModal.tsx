/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  FlaskConical,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  HelpCircle,
  Clock,
  Shield,
  FileText,
  Download,
  Trash2,
  Users,
  ChevronRight,
  ChevronDown,
  Sparkles,
  ExternalLink,
  Bug,
  Lightbulb,
  Check,
  RotateCcw,
  Sliders,
  Layers,
  ArrowRight,
  UserCheck,
} from 'lucide-react';
import { Project } from '../../types/project';
import {
  PilotPlanConfig,
  PilotTaskScript,
  PilotFeedbackRecord,
  PilotChecklistItem,
  PilotParticipantRole,
  PilotWorkflowCategory,
  PilotFeedbackCategory,
  PilotFeedbackSeverity,
  PilotTriageStatus,
  PilotTriageDecision,
} from '../../types/pilot';
import {
  DEFAULT_PILOT_PLAN,
  DEFAULT_PILOT_CHECKLIST,
  PILOT_PARTICIPANT_ROLES,
  PILOT_WORKFLOW_LABELS,
  loadPilotFeedback,
  savePilotFeedback,
  loadParticipantProfile,
  saveParticipantProfile,
  generateAnonymousParticipantId,
  addPilotFeedback,
  updateFeedbackTriage,
  deleteFeedbackRecord,
  calculatePilotMetrics,
  exportPilotFeedbackCSV,
  exportPilotFeedbackJSON,
  generatePilotDossierMarkdown,
  purgePilotData,
} from '../../services/pilotService';

interface ControlledPilotModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeProject?: Project | null;
}

type ActivePilotTab = 'onboarding' | 'feedback' | 'triage' | 'metrics' | 'checklist';

export function ControlledPilotModal({
  isOpen,
  onClose,
  activeProject,
}: ControlledPilotModalProps) {
  const [activeTab, setActiveTab] = useState<ActivePilotTab>('onboarding');
  const [feedbackList, setFeedbackList] = useState<PilotFeedbackRecord[]>([]);
  const [checklist, setChecklist] = useState<PilotChecklistItem[]>(DEFAULT_PILOT_CHECKLIST);
  const [participantId, setParticipantId] = useState<string>('PILOT-ARC-101');
  const [participantRole, setParticipantRole] = useState<PilotParticipantRole>('architect');
  const [expandedTask, setExpandedTask] = useState<string | null>('task-01-setup');
  const [showAddForm, setShowAddForm] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Form State
  const [newTitle, setNewTitle] = useState('');
  const [newWorkflow, setNewWorkflow] = useState<PilotWorkflowCategory>('floor-plan-2d');
  const [newCategory, setNewCategory] = useState<PilotFeedbackCategory>('usability');
  const [newSeverity, setNewSeverity] = useState<PilotFeedbackSeverity>('moderate');
  const [newDescription, setNewDescription] = useState('');
  const [newExpected, setNewExpected] = useState('');
  const [newObserved, setNewObserved] = useState('');
  const [newReproSteps, setNewReproSteps] = useState('');

  // Filters for Feedback List
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [filterWorkflow, setFilterWorkflow] = useState<string>('all');

  // Load state on mount / open
  useEffect(() => {
    if (isOpen) {
      const records = loadPilotFeedback();
      setFeedbackList(records);

      const profile = loadParticipantProfile();
      if (profile) {
        setParticipantId(profile.participantId);
        setParticipantRole(profile.role);
      } else {
        const generated = generateAnonymousParticipantId('architect');
        setParticipantId(generated);
        saveParticipantProfile({ participantId: generated, role: 'architect' });
      }
    }
  }, [isOpen]);

  const handleGenerateNewId = (role: PilotParticipantRole) => {
    const generated = generateAnonymousParticipantId(role);
    setParticipantId(generated);
    setParticipantRole(role);
    saveParticipantProfile({ participantId: generated, role });
    setStatusMessage(`Assigned new anonymous token: ${generated}`);
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleRoleChange = (role: PilotParticipantRole) => {
    setParticipantRole(role);
    handleGenerateNewId(role);
  };

  const handleSubmitFeedback = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newDescription.trim()) return;

    const reproArray = newReproSteps
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    const envInfo = {
      browser: typeof navigator !== 'undefined' ? navigator.userAgent.split(' ')[0] : 'Standard Browser',
      operatingSystem: typeof navigator !== 'undefined' ? navigator.platform : 'Generic OS',
      screenResolution: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : undefined,
      webGlSupported: true,
    };

    const created = addPilotFeedback(
      {
        participantId,
        participantRole,
        workflow: newWorkflow,
        category: newCategory,
        severity: newSeverity,
        title: newTitle.trim(),
        description: newDescription.trim(),
        expectedBehavior: newExpected.trim() || 'Expected seamless operation without defect.',
        observedBehavior: newObserved.trim() || newDescription.trim(),
        reproductionSteps: reproArray.length > 0 ? reproArray : ['1. Navigate to workflow', '2. Perform action'],
        environmentInfo: envInfo,
      },
      activeProject
    );

    setFeedbackList(loadPilotFeedback());
    setShowAddForm(false);
    setNewTitle('');
    setNewDescription('');
    setNewExpected('');
    setNewObserved('');
    setNewReproSteps('');
    setStatusMessage(`Feedback record ${created.id} saved successfully!`);
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleTriageUpdate = (
    id: string,
    status: PilotTriageStatus,
    decision?: PilotTriageDecision,
    rationale?: string
  ) => {
    const updated = updateFeedbackTriage(id, {
      triageStatus: status,
      triageDecision: decision,
      triageRationale: rationale,
    });
    setFeedbackList(updated);
  };

  const handleDeleteFeedback = (id: string) => {
    if (confirm('Delete this feedback record? This action cannot be undone.')) {
      const updated = deleteFeedbackRecord(id);
      setFeedbackList(updated);
    }
  };

  const handlePurgeAll = () => {
    if (
      confirm(
        'Privacy Safeguard: Permanently delete all local pilot feedback records and reset participant tokens? This ensures zero lingering data on this device.'
      )
    ) {
      purgePilotData();
      setFeedbackList([]);
      handleGenerateNewId(participantRole);
      setStatusMessage('All pilot records purged successfully.');
      setTimeout(() => setStatusMessage(null), 3500);
    }
  };

  const handleExportCSV = () => {
    const csv = exportPilotFeedbackCSV(feedbackList);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plotify_pilot_feedback_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJSON = () => {
    const json = exportPilotFeedbackJSON(feedbackList);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plotify_pilot_dossier_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportMarkdown = () => {
    const md = generatePilotDossierMarkdown(DEFAULT_PILOT_PLAN, feedbackList, checklist);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plotify_pilot_dossier_${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const metrics = useMemo(() => calculatePilotMetrics(feedbackList), [feedbackList]);

  const filteredFeedback = useMemo(() => {
    return feedbackList.filter((item) => {
      if (filterCategory !== 'all' && item.category !== filterCategory) return false;
      if (filterSeverity !== 'all' && item.severity !== filterSeverity) return false;
      if (filterWorkflow !== 'all' && item.workflow !== filterWorkflow) return false;
      return true;
    });
  }, [feedbackList, filterCategory, filterSeverity, filterWorkflow]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Top Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-linear-to-r from-slate-900 via-slate-800 to-indigo-950 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
              <FlaskConical className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  Controlled Pilot & Real-World Feedback System
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-indigo-400/20 text-indigo-200 border border-indigo-300/30 rounded-full uppercase tracking-wider">
                  Cohort 1 (5–10 Users)
                </span>
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-400/20 text-emerald-200 border border-emerald-300/30 rounded-full uppercase tracking-wider">
                  Pilot Prep Active
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Structured user evaluation, guided task scripts, defect tracking, and triage loop
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              className="px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5"
              title="Export all feedback as RFC-4180 CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>
            <button
              onClick={handleExportMarkdown}
              className="px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5"
              title="Export comprehensive Pilot Dossier in Markdown"
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

        {/* Status Toast Banner */}
        {statusMessage && (
          <div className="bg-indigo-50 border-b border-indigo-100 px-6 py-2 flex items-center justify-between text-xs text-indigo-900 font-medium">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-indigo-600" />
              <span>{statusMessage}</span>
            </div>
            <button
              onClick={() => setStatusMessage(null)}
              className="text-indigo-500 hover:text-indigo-800 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-6 border-b border-slate-200 bg-slate-50/80 shrink-0 overflow-x-auto text-xs font-medium">
          <button
            onClick={() => setActiveTab('onboarding')}
            className={`py-3 px-3.5 border-b-2 flex items-center gap-2 cursor-pointer transition-colors whitespace-nowrap ${
              activeTab === 'onboarding'
                ? 'border-indigo-600 text-indigo-900 font-bold bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
            }`}
          >
            <Users className="w-4 h-4 text-indigo-600" />
            <span>Onboarding & Task Scripts</span>
          </button>

          <button
            onClick={() => setActiveTab('feedback')}
            className={`py-3 px-3.5 border-b-2 flex items-center gap-2 cursor-pointer transition-colors whitespace-nowrap ${
              activeTab === 'feedback'
                ? 'border-indigo-600 text-indigo-900 font-bold bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
            }`}
          >
            <Bug className="w-4 h-4 text-indigo-600" />
            <span>Feedback Register</span>
            <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-slate-200 text-slate-700 rounded-full">
              {feedbackList.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('triage')}
            className={`py-3 px-3.5 border-b-2 flex items-center gap-2 cursor-pointer transition-colors whitespace-nowrap ${
              activeTab === 'triage'
                ? 'border-indigo-600 text-indigo-900 font-bold bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
            }`}
          >
            <Sliders className="w-4 h-4 text-indigo-600" />
            <span>Triage & Decision Board</span>
          </button>

          <button
            onClick={() => setActiveTab('metrics')}
            className={`py-3 px-3.5 border-b-2 flex items-center gap-2 cursor-pointer transition-colors whitespace-nowrap ${
              activeTab === 'metrics'
                ? 'border-indigo-600 text-indigo-900 font-bold bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
            }`}
          >
            <Sparkles className="w-4 h-4 text-indigo-600" />
            <span>Pilot Metrics & Quality Ledger</span>
          </button>

          <button
            onClick={() => setActiveTab('checklist')}
            className={`py-3 px-3.5 border-b-2 flex items-center gap-2 cursor-pointer transition-colors whitespace-nowrap ${
              activeTab === 'checklist'
                ? 'border-indigo-600 text-indigo-900 font-bold bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 text-indigo-600" />
            <span>Pilot Readiness Checklist</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
          {/* TAB 1: ONBOARDING & GUIDED TASK SCRIPTS */}
          {activeTab === 'onboarding' && (
            <div className="space-y-6">
              {/* Participant Profile & Token Card */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Active Participant Token:
                    </span>
                    <span className="font-mono font-bold text-sm text-indigo-900 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                      {participantId}
                    </span>
                    <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-100 text-emerald-800 rounded">
                      Local Device Isolated
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">
                    Pseudonymous identity token prevents collection of personal names, emails, or corporate domains.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">
                      Assigned Role:
                    </label>
                    <select
                      value={participantRole}
                      onChange={(e) => handleRoleChange(e.target.value as PilotParticipantRole)}
                      className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg font-medium text-slate-800 cursor-pointer focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                    >
                      {Object.entries(PILOT_PARTICIPANT_ROLES).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={() => handleGenerateNewId(participantRole)}
                    className="mt-4 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5"
                    title="Generate new anonymous ID token"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Regenerate Token</span>
                  </button>
                </div>
              </div>

              {/* Research Focus & Scope Notice */}
              <div className="bg-indigo-50/60 p-5 rounded-xl border border-indigo-200/70 text-xs text-indigo-950 space-y-2">
                <div className="flex items-center gap-2 font-bold text-sm text-indigo-900">
                  <Lightbulb className="w-4 h-4 text-indigo-600" />
                  <span>Pilot Purpose & Research Questions</span>
                </div>
                <p className="text-indigo-900/80 leading-relaxed">
                  The Plotify Controlled Pilot evaluates whether spatial intelligence, living constraint graphs, and synchronized 2D/3D workflows reduce early-stage architectural coordination errors before broad deployment.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-2">
                  {DEFAULT_PILOT_PLAN.researchQuestions.map((rq, idx) => (
                    <div
                      key={idx}
                      className="bg-white/80 p-2.5 rounded-lg border border-indigo-100 text-[11px] text-slate-700 font-medium"
                    >
                      {rq}
                    </div>
                  ))}
                </div>
              </div>

              {/* Step-by-Step Task Scripts */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Guided Pilot Task Scripts (Tasks 1 through 5)</span>
                  </h3>
                  <span className="text-xs text-slate-500">
                    Total Estimated Duration: ~50 minutes
                  </span>
                </div>

                <div className="space-y-2.5">
                  {DEFAULT_PILOT_PLAN.activeTaskScripts.map((task) => {
                    const isExpanded = expandedTask === task.id;
                    return (
                      <div
                        key={task.id}
                        className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden transition-all"
                      >
                        <button
                          onClick={() => setExpandedTask(isExpanded ? null : task.id)}
                          className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-slate-50/80 text-left transition-colors cursor-pointer"
                        >
                          <div className="flex items-center gap-3">
                            <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-800 font-bold text-xs flex items-center justify-center shrink-0">
                              {task.stepNumber}
                            </span>
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="text-xs font-bold text-slate-900">
                                  {task.title}
                                </h4>
                                <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                                  ~{task.estimatedMinutes} min
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                Workflow: {PILOT_WORKFLOW_LABELS[task.workflow]}
                              </p>
                            </div>
                          </div>
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-slate-400" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-slate-400" />
                          )}
                        </button>

                        {isExpanded && (
                          <div className="px-5 pb-5 pt-1 border-t border-slate-100 bg-slate-50/40 space-y-3 text-xs">
                            <div>
                              <span className="font-semibold text-slate-700">Objective:</span>{' '}
                              <span className="text-slate-600">{task.objective}</span>
                            </div>

                            <div>
                              <span className="font-semibold text-slate-700 block mb-1">
                                Step-by-Step Instructions:
                              </span>
                              <ol className="list-decimal list-inside space-y-1 text-slate-600 pl-1">
                                {task.instructions.map((inst, i) => (
                                  <li key={i} className="leading-relaxed">
                                    {inst}
                                  </li>
                                ))}
                              </ol>
                            </div>

                            <div className="bg-emerald-50/80 p-2.5 rounded-lg border border-emerald-200 text-emerald-900">
                              <span className="font-semibold">Expected Outcome:</span>{' '}
                              <span>{task.expectedOutcome}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Known Limitations Notice */}
              <div className="bg-amber-50/80 p-4 rounded-xl border border-amber-200 text-xs text-amber-900 space-y-2">
                <div className="flex items-center gap-2 font-bold text-amber-950">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span>Important Notice: Known Pilot Limitations & Non-Reliance</span>
                </div>
                <ul className="list-disc list-inside space-y-1 text-amber-900/90 pl-1 text-[11px]">
                  {DEFAULT_PILOT_PLAN.knownLimitations.map((lim, i) => (
                    <li key={i}>{lim}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* TAB 2: FEEDBACK & ISSUE REGISTER */}
          {activeTab === 'feedback' && (
            <div className="space-y-5">
              {/* Top Action Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowAddForm(!showAddForm)}
                    className="px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs transition-colors cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <Bug className="w-3.5 h-3.5" />
                    <span>{showAddForm ? 'Close Form' : '+ Record Pilot Feedback'}</span>
                  </button>
                  <span className="text-xs text-slate-500">
                    {feedbackList.length} total feedback item{feedbackList.length === 1 ? '' : 's'} recorded
                  </span>
                </div>

                {/* Filters */}
                <div className="flex items-center gap-2 text-xs">
                  <select
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    className="px-2.5 py-1 bg-white border border-slate-300 rounded-md text-slate-700 text-xs font-medium"
                  >
                    <option value="all">All Categories</option>
                    <option value="usability">Usability</option>
                    <option value="functional-defect">Functional Defect</option>
                    <option value="calculation-concern">Calculation Concern</option>
                    <option value="performance-lag">Performance Lag</option>
                    <option value="missing-capability">Missing Capability</option>
                    <option value="documentation-gap">Documentation Gap</option>
                    <option value="suggestion">Suggestion</option>
                  </select>

                  <select
                    value={filterSeverity}
                    onChange={(e) => setFilterSeverity(e.target.value)}
                    className="px-2.5 py-1 bg-white border border-slate-300 rounded-md text-slate-700 text-xs font-medium"
                  >
                    <option value="all">All Severities</option>
                    <option value="blocker">Blocker</option>
                    <option value="critical">Critical</option>
                    <option value="moderate">Moderate</option>
                    <option value="minor">Minor</option>
                    <option value="cosmetic">Cosmetic</option>
                  </select>
                </div>
              </div>

              {/* New Feedback Submission Form */}
              {showAddForm && (
                <form
                  onSubmit={handleSubmitFeedback}
                  className="bg-white p-5 rounded-xl border border-indigo-200 shadow-sm space-y-4 animate-in fade-in duration-150"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <h3 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                      <Bug className="w-4 h-4 text-indigo-600" />
                      <span>Record Observation or Defect ({participantId})</span>
                    </h3>
                    <span className="text-[11px] text-slate-500">
                      Active Project: {activeProject?.name || 'None Selected'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Workflow Area:
                      </label>
                      <select
                        value={newWorkflow}
                        onChange={(e) => setNewWorkflow(e.target.value as PilotWorkflowCategory)}
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-800"
                      >
                        {Object.entries(PILOT_WORKFLOW_LABELS).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Category:
                      </label>
                      <select
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value as PilotFeedbackCategory)}
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-800"
                      >
                        <option value="usability">Usability / Ergonomics</option>
                        <option value="functional-defect">Functional Defect</option>
                        <option value="calculation-concern">Calculation Discrepancy</option>
                        <option value="performance-lag">Performance / Frame Rate</option>
                        <option value="missing-capability">Missing Capability</option>
                        <option value="documentation-gap">Documentation / Guidance</option>
                        <option value="suggestion">General Suggestion</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Severity / Impact:
                      </label>
                      <select
                        value={newSeverity}
                        onChange={(e) => setNewSeverity(e.target.value as PilotFeedbackSeverity)}
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-800"
                      >
                        <option value="blocker">Blocker (Cannot proceed)</option>
                        <option value="critical">Critical (Major loss / safety error)</option>
                        <option value="moderate">Moderate (Feature impaired)</option>
                        <option value="minor">Minor (Workaround exists)</option>
                        <option value="cosmetic">Cosmetic (Visual / alignment)</option>
                        <option value="enhancement">Enhancement Request</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Summary Title:
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Setback warning does not recompute when plot width decreases"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-800 focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Detailed Observation:
                    </label>
                    <textarea
                      required
                      rows={2}
                      placeholder="Describe what occurred during your session..."
                      value={newDescription}
                      onChange={(e) => setNewDescription(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-800 focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Expected Behavior:
                      </label>
                      <input
                        type="text"
                        placeholder="What you anticipated should happen..."
                        value={newExpected}
                        onChange={(e) => setNewExpected(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Actual Observed Behavior:
                      </label>
                      <input
                        type="text"
                        placeholder="What actually occurred..."
                        value={newObserved}
                        onChange={(e) => setNewObserved(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-800"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Reproduction Steps (one per line):
                    </label>
                    <textarea
                      rows={2}
                      placeholder="1. Open 2D Floor Plan editor&#10;2. Select Living Room&#10;3. Drag boundary wall..."
                      value={newReproSteps}
                      onChange={(e) => setNewReproSteps(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-800"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setShowAddForm(false)}
                      className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors cursor-pointer"
                    >
                      Save to Local Register
                    </button>
                  </div>
                </form>
              )}

              {/* Feedback Records List */}
              {filteredFeedback.length === 0 ? (
                <div className="bg-white p-8 rounded-xl border border-slate-200 text-center space-y-2">
                  <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                    <Bug className="w-5 h-5" />
                  </div>
                  <h4 className="text-xs font-bold text-slate-800">
                    No Feedback Records Found
                  </h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    {feedbackList.length === 0
                      ? 'The pilot register is currently empty. Use the "+ Record Pilot Feedback" button above or execute the guided task scripts.'
                      : 'No feedback items match the selected filters.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredFeedback.map((item) => {
                    const severityColors = {
                      blocker: 'bg-rose-100 text-rose-800 border-rose-300',
                      critical: 'bg-red-100 text-red-800 border-red-300',
                      moderate: 'bg-amber-100 text-amber-800 border-amber-300',
                      minor: 'bg-blue-100 text-blue-800 border-blue-300',
                      cosmetic: 'bg-slate-100 text-slate-700 border-slate-300',
                      enhancement: 'bg-purple-100 text-purple-800 border-purple-300',
                    }[item.severity];

                    const statusColors = {
                      new: 'bg-slate-100 text-slate-700',
                      investigating: 'bg-amber-100 text-amber-800',
                      triaged: 'bg-blue-100 text-blue-800',
                      'in-progress': 'bg-indigo-100 text-indigo-800',
                      'verified-fixed': 'bg-emerald-100 text-emerald-800',
                      deferred: 'bg-slate-200 text-slate-700',
                      rejected: 'bg-rose-100 text-rose-800',
                      'as-designed': 'bg-teal-100 text-teal-800',
                    }[item.triageStatus];

                    return (
                      <div
                        key={item.id}
                        className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded border ${severityColors}`}
                            >
                              {item.severity}
                            </span>
                            <span className="text-xs font-bold text-slate-900">
                              {item.title}
                            </span>
                            <span className="font-mono text-[10px] text-slate-400">
                              ({item.id})
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 text-[10px] font-semibold uppercase rounded ${statusColors}`}
                            >
                              {item.triageStatus.replace('-', ' ')}
                            </span>
                            <button
                              onClick={() => handleDeleteFeedback(item.id)}
                              className="text-slate-400 hover:text-rose-600 p-1 rounded transition-colors cursor-pointer"
                              title="Delete record"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="text-xs text-slate-700 space-y-1.5">
                          <p>{item.description}</p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                            <div>
                              <span className="font-semibold text-slate-600">Expected:</span>{' '}
                              <span className="text-slate-700">{item.expectedBehavior}</span>
                            </div>
                            <div>
                              <span className="font-semibold text-slate-600">Observed:</span>{' '}
                              <span className="text-slate-700">{item.observedBehavior}</span>
                            </div>
                          </div>
                          {item.reproductionSteps.length > 0 && (
                            <div className="text-[11px] text-slate-500">
                              <span className="font-semibold text-slate-600">Reproduction:</span>{' '}
                              {item.reproductionSteps.join(' → ')}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                          <div className="flex items-center gap-2">
                            <span>Participant: <strong className="text-slate-600">{item.participantId}</strong></span>
                            <span>·</span>
                            <span>Workflow: <strong className="text-slate-600">{PILOT_WORKFLOW_LABELS[item.workflow]}</strong></span>
                          </div>
                          <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: TRIAGE & DECISION BOARD */}
          {activeTab === 'triage' && (
            <div className="space-y-5">
              <div className="bg-indigo-50/70 p-4 rounded-xl border border-indigo-200 text-xs text-indigo-950 space-y-1">
                <div className="font-bold flex items-center gap-2 text-indigo-900">
                  <Sliders className="w-4 h-4 text-indigo-600" />
                  <span>Engineering Pilot Triage Discipline</span>
                </div>
                <p className="text-indigo-900/80 leading-relaxed">
                  Classify and decide upon reported issues before release. Prioritize critical safety/calculation concerns and data-loss risks above cosmetic adjustments. Record rationales for every triage decision.
                </p>
              </div>

              {feedbackList.length === 0 ? (
                <div className="bg-white p-8 rounded-xl border border-slate-200 text-center space-y-2">
                  <p className="text-xs text-slate-500">
                    No feedback items to triage. Record observations in Tab 2 to initiate the triage workflow.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {feedbackList.map((item) => (
                    <div
                      key={item.id}
                      className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-slate-700">
                            {item.id}
                          </span>
                          <span className="text-xs font-bold text-slate-900">
                            {item.title}
                          </span>
                        </div>
                        <span className="text-xs font-semibold text-slate-500 uppercase">
                          Severity: {item.severity}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Triage Status:
                          </label>
                          <select
                            value={item.triageStatus}
                            onChange={(e) =>
                              handleTriageUpdate(
                                item.id,
                                e.target.value as PilotTriageStatus,
                                item.triageDecision,
                                item.triageRationale
                              )
                            }
                            className="w-full px-2 py-1 text-xs bg-white border border-slate-300 rounded font-medium"
                          >
                            <option value="new">New (Untriaged)</option>
                            <option value="investigating">Investigating</option>
                            <option value="triaged">Triaged</option>
                            <option value="in-progress">In Progress</option>
                            <option value="verified-fixed">Verified Fixed</option>
                            <option value="deferred">Deferred (v2)</option>
                            <option value="rejected">Rejected</option>
                            <option value="as-designed">As Designed</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Triage Decision:
                          </label>
                          <select
                            value={item.triageDecision || 'fix-immediate'}
                            onChange={(e) =>
                              handleTriageUpdate(
                                item.id,
                                item.triageStatus,
                                e.target.value as PilotTriageDecision,
                                item.triageRationale
                              )
                            }
                            className="w-full px-2 py-1 text-xs bg-white border border-slate-300 rounded font-medium"
                          >
                            <option value="fix-immediate">Fix Immediately (Critical)</option>
                            <option value="defer-v2">Defer to Post-Pilot</option>
                            <option value="investigate-further">Investigate Further</option>
                            <option value="reject-out-of-scope">Reject (Out of Scope)</option>
                            <option value="clarify-documentation">Clarify Documentation</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Rationale / Fix Notes:
                          </label>
                          <input
                            type="text"
                            placeholder="Engineering rationale..."
                            value={item.triageRationale || ''}
                            onChange={(e) =>
                              handleTriageUpdate(
                                item.id,
                                item.triageStatus,
                                item.triageDecision,
                                e.target.value
                              )
                            }
                            className="w-full px-2 py-1 text-xs bg-white border border-slate-300 rounded"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: PILOT METRICS & QUALITY LEDGER */}
          {activeTab === 'metrics' && (
            <div className="space-y-5">
              {!metrics.isRealDataCollected ? (
                <div className="bg-amber-50 border border-amber-200 p-5 rounded-xl text-center space-y-2">
                  <AlertCircle className="w-6 h-6 text-amber-600 mx-auto" />
                  <h4 className="text-xs font-bold text-amber-950 uppercase tracking-wide">
                    Awaiting Live Pilot Execution
                  </h4>
                  <p className="text-xs text-amber-900 max-w-lg mx-auto">
                    No fabricated metrics or synthetic participant telemetry are displayed. Real quality metrics will automatically calculate and update as invited cohort participants record their feedback.
                  </p>
                </div>
              ) : null}

              {/* KPI Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Total Feedback
                  </div>
                  <div className="text-2xl font-bold text-slate-900 mt-1">
                    {metrics.totalFeedbackCount}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {metrics.uniqueParticipantsCount} unique participant{metrics.uniqueParticipantsCount === 1 ? '' : 's'}
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Critical Blockers
                  </div>
                  <div
                    className={`text-2xl font-bold mt-1 ${
                      metrics.criticalBlockerCount > 0 ? 'text-rose-600' : 'text-emerald-600'
                    }`}
                  >
                    {metrics.criticalBlockerCount}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    Target: 0 for release
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Triage Completion
                  </div>
                  <div className="text-2xl font-bold text-indigo-900 mt-1">
                    {metrics.isRealDataCollected ? `${metrics.triageRatePercent}%` : 'Not Yet Measured'}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {metrics.triagedCount} / {metrics.totalFeedbackCount} classified
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Data Loss Incidents
                  </div>
                  <div
                    className={`text-2xl font-bold mt-1 ${
                      metrics.dataLossIncidentsCount > 0 ? 'text-rose-600' : 'text-emerald-600'
                    }`}
                  >
                    {metrics.dataLossIncidentsCount}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    Zero tolerance threshold
                  </div>
                </div>
              </div>

              {/* Categorical Breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-2">
                  <h4 className="text-xs font-bold text-slate-800">
                    Feedback Breakdown by Category
                  </h4>
                  <div className="space-y-1.5 text-xs">
                    {Object.entries(metrics.byCategory).map(([cat, count]) => (
                      <div key={cat} className="flex items-center justify-between py-0.5 border-b border-slate-50">
                        <span className="capitalize text-slate-600">{cat.replace('-', ' ')}</span>
                        <span className="font-semibold text-slate-900">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-2">
                  <h4 className="text-xs font-bold text-slate-800">
                    Feedback Breakdown by Severity
                  </h4>
                  <div className="space-y-1.5 text-xs">
                    {Object.entries(metrics.bySeverity).map(([sev, count]) => (
                      <div key={sev} className="flex items-center justify-between py-0.5 border-b border-slate-50">
                        <span className="capitalize text-slate-600">{sev}</span>
                        <span className="font-semibold text-slate-900">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: READINESS CHECKLIST & SAFEGUARDS */}
          {activeTab === 'checklist' && (
            <div className="space-y-5">
              {/* Stop Conditions Banner */}
              <div className="bg-rose-50 border border-rose-200 p-4 rounded-xl text-xs text-rose-950 space-y-2">
                <div className="font-bold flex items-center gap-2 text-rose-900">
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                  <span>Pilot Stop-Conditions (Immediate Evaluation Pause Triggers)</span>
                </div>
                <ul className="list-disc list-inside space-y-1 text-rose-900/80 text-[11px] pl-1">
                  {DEFAULT_PILOT_PLAN.stopConditions.map((cond, i) => (
                    <li key={i}>{cond}</li>
                  ))}
                </ul>
              </div>

              {/* Checklist Items */}
              <div className="space-y-2.5">
                <h3 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>8-Point Pilot Readiness Verification Checklist</span>
                </h3>

                {checklist.map((item) => {
                  const statusColors = {
                    ready: 'bg-emerald-100 text-emerald-800 border-emerald-300',
                    'not-ready': 'bg-amber-100 text-amber-800 border-amber-300',
                    blocked: 'bg-rose-100 text-rose-800 border-rose-300',
                    'not-assessed': 'bg-slate-100 text-slate-700 border-slate-300',
                  }[item.status];

                  return (
                    <div
                      key={item.id}
                      className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded border ${statusColors}`}
                          >
                            {item.status.replace('-', ' ')}
                          </span>
                          <h4 className="text-xs font-bold text-slate-900">{item.title}</h4>
                          {item.mandatoryForPilot && (
                            <span className="text-[10px] text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded font-medium">
                              Mandatory
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-600">{item.description}</p>
                        <div className="text-[11px] text-slate-400">
                          <strong>Verification Note:</strong> {item.verificationNotes}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Privacy Safeguard & Purge Section */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 font-bold text-xs text-slate-900">
                    <Shield className="w-4 h-4 text-emerald-600" />
                    <span>Privacy Safeguard & Data Deletion Rights</span>
                  </div>
                  <p className="text-xs text-slate-500 max-w-lg">
                    Participants maintain complete control over their device data. Clicking purge permanently clears all feedback items and profile tokens from browser storage.
                  </p>
                </div>
                <button
                  onClick={handlePurgeAll}
                  className="px-3.5 py-2 text-xs font-semibold text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors cursor-pointer shrink-0 inline-flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Purge Local Pilot Data</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-white flex items-center justify-between shrink-0 text-xs">
          <div className="text-slate-500 flex items-center gap-2">
            <span>Pilot Cohort: <strong className="text-slate-700">{DEFAULT_PILOT_PLAN.pilotId}</strong></span>
            <span>·</span>
            <span>Target Size: <strong className="text-slate-700">{DEFAULT_PILOT_PLAN.targetCohortSize} users</strong></span>
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
