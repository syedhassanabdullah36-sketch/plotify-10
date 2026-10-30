/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  Project,
  FloorPlanRoom,
} from '../../types/project';
import {
  EvaluationStatus,
  RegulatoryState,
  RegulatoryProjectProfile,
  RegulatorySourceRecord,
  RegulatoryRequirementItem,
  RequirementEvaluationRecord,
  ReviewerDecision,
  ProjectCategory,
  ApprovalPathway,
  SourceStatus,
  SourceVerificationStatus,
} from '../../types/regulations';
import {
  initializeProjectRegulations,
  evaluateProjectRegulations,
  recordProjectRegulatoryAssessment,
  addReviewerDecision,
  addRegulatorySource,
  generateRegulatoryComplianceCSV,
  generateRegulatoryMarkdownReport,
  DEFAULT_REGULATORY_REQUIREMENTS,
  STATUTORY_LIMITATION_DISCLAIMER,
} from '../../services/regulatoryService';
import {
  Scale,
  ShieldCheck,
  AlertTriangle,
  HelpCircle,
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCw,
  Download,
  Plus,
  ArrowLeft,
  Search,
  Filter,
  ExternalLink,
  ChevronRight,
  BookOpen,
  UserCheck,
  Building,
  MapPin,
  FileCheck2,
  Info,
} from 'lucide-react';

interface RegulatoryWorkspaceProps {
  project: Project;
  onUpdateProject: (project: Project) => void;
  onBack: () => void;
  onOpenFloorPlan: () => void;
}

type ActiveSubTab =
  | 'matrix'
  | 'conflicts'
  | 'sources'
  | 'profile'
  | 'history';

export const RegulatoryWorkspace: React.FC<RegulatoryWorkspaceProps> = ({
  project,
  onUpdateProject,
  onBack,
  onOpenFloorPlan,
}) => {
  const [activeTab, setActiveTab] = useState<ActiveSubTab>('matrix');
  const [statusFilter, setStatusFilter] = useState<EvaluationStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedReqId, setSelectedReqId] = useState<string | null>(null);

  // Modal states
  const [isAddSourceOpen, setIsAddSourceOpen] = useState(false);
  const [isDecisionModalOpen, setIsDecisionModalOpen] = useState(false);

  // New source form state
  const [newSource, setNewSource] = useState<Partial<RegulatorySourceRecord>>({
    title: '',
    issuingAuthority: '',
    documentIdentifier: '',
    edition: '2024 Edition',
    status: 'adopted',
    verificationStatus: 'unverified',
    sourceType: 'user-supplied',
    jurisdiction: { country: 'United States' },
  });

  // Decision form state
  const [decisionReqId, setDecisionReqId] = useState<string>('');
  const [decisionType, setDecisionType] = useState<ReviewerDecision['decision']>('accepted-with-conditions');
  const [decisionNotes, setDecisionNotes] = useState('');
  const [decisionReviewer, setDecisionReviewer] = useState('');

  // Editable Profile state
  const [profile, setProfile] = useState<RegulatoryProjectProfile>(() => {
    return initializeProjectRegulations(project).profile;
  });

  // Regulatory Evaluation
  const regState = useMemo(() => initializeProjectRegulations(project), [project]);
  const summary = useMemo(() => evaluateProjectRegulations(project, regState), [project, regState]);

  // Handle re-evaluation and saving
  const handleRunEvaluation = () => {
    const updated = recordProjectRegulatoryAssessment(project, summary);
    onUpdateProject(updated);
  };

  // Handle saving profile changes
  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const currentRegs = initializeProjectRegulations(project);
    const updated: Project = {
      ...project,
      regulations: {
        ...currentRegs,
        profile,
      },
      updatedAt: new Date().toISOString(),
    };
    onUpdateProject(updated);
  };

  // Handle adding source
  const handleCreateSource = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSource.title || !newSource.documentIdentifier) return;

    const sourceRecord: RegulatorySourceRecord = {
      id: `src-custom-${Date.now()}`,
      title: newSource.title,
      issuingAuthority: newSource.issuingAuthority || 'User Declared Authority',
      documentIdentifier: newSource.documentIdentifier,
      officialUrl: newSource.officialUrl,
      jurisdiction: {
        country: newSource.jurisdiction?.country || profile.country || 'Unknown',
        region: newSource.jurisdiction?.region || profile.region,
      },
      edition: newSource.edition || '2024',
      status: (newSource.status as SourceStatus) || 'user-supplied',
      verificationStatus: (newSource.verificationStatus as SourceVerificationStatus) || 'unverified',
      sourceType: 'user-supplied',
      clauses: [
        {
          clauseId: `cl-${Date.now()}-1`,
          section: 'Section Custom',
          title: 'General Provision',
          text: newSource.reviewerNotes || 'User-supplied regulatory citation.',
        },
      ],
      lastReviewedDate: new Date().toISOString().split('T')[0],
      reviewerNotes: newSource.reviewerNotes,
    };

    const updated = addRegulatorySource(project, sourceRecord);
    onUpdateProject(updated);
    setIsAddSourceOpen(false);
    setNewSource({
      title: '',
      issuingAuthority: '',
      documentIdentifier: '',
      edition: '2024 Edition',
      status: 'adopted',
      verificationStatus: 'unverified',
      sourceType: 'user-supplied',
    });
  };

  // Handle recording reviewer decision
  const handleRecordDecision = (e: React.FormEvent) => {
    e.preventDefault();
    if (!decisionReqId || !decisionNotes.trim()) return;

    const updated = addReviewerDecision(project, {
      requirementId: decisionReqId,
      decision: decisionType,
      notes: decisionNotes.trim(),
      reviewer: decisionReviewer.trim() || profile.responsibleReviewer || 'Project Reviewer',
    });

    onUpdateProject(updated);
    setIsDecisionModalOpen(false);
    setDecisionNotes('');
  };

  // Export handlers
  const handleExportCSV = () => {
    const csv = generateRegulatoryComplianceCSV(project, summary);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${project.name.toLowerCase().replace(/\s+/g, '_')}_regulatory_compliance.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportMarkdown = () => {
    const md = generateRegulatoryMarkdownReport(project, summary);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${project.name.toLowerCase().replace(/\s+/g, '_')}_regulatory_assessment.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filter requirements
  const allRequirements = useMemo(() => {
    return [...DEFAULT_REGULATORY_REQUIREMENTS, ...(regState.customRequirements || [])];
  }, [regState]);

  const reqMap = useMemo(() => {
    return new Map(allRequirements.map((r) => [r.id, r]));
  }, [allRequirements]);

  const filteredEvaluations = useMemo(() => {
    return summary.evaluations.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const reqDef = reqMap.get(item.requirementId);
        const title = (reqDef?.title || '').toLowerCase();
        const reason = item.statusReason.toLowerCase();
        const clause = (reqDef?.clauseReference || '').toLowerCase();
        return title.includes(q) || reason.includes(q) || clause.includes(q) || item.requirementId.includes(q);
      }
      return true;
    });
  }, [summary.evaluations, statusFilter, searchQuery, reqMap]);

  const selectedEvaluation = summary.evaluations.find((e) => e.requirementId === selectedReqId) || null;
  const selectedReqDef = selectedReqId ? reqMap.get(selectedReqId) : null;

  // Status helper styles
  const getStatusBadge = (status: EvaluationStatus) => {
    switch (status) {
      case 'pass':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Pass
          </span>
        );
      case 'conflict':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800">
            <XCircle className="w-3 h-3 text-rose-600" /> Conflict
          </span>
        );
      case 'needs-review':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
            <AlertTriangle className="w-3 h-3 text-amber-600" /> Needs Review
          </span>
        );
      case 'insufficient-data':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-100 text-sky-800">
            <HelpCircle className="w-3 h-3 text-sky-600" /> Insufficient Data
          </span>
        );
      case 'unverified-rule':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-800">
            <AlertTriangle className="w-3 h-3 text-orange-600" /> Unverified Rule
          </span>
        );
      case 'not-applicable':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
            Not Applicable
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
            Not Assessed
          </span>
        );
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors mb-2 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Project Overview</span>
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 text-teal-400 flex items-center justify-center font-bold shadow-xs">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                Building Regulations Intelligence Engine
                <span className="text-xs px-2.5 py-0.5 rounded-md font-mono font-medium bg-slate-100 text-slate-700 border border-slate-200">
                  Prompt 13 Active
                </span>
              </h1>
              <p className="text-xs text-slate-500">
                Statutory Code Verification • Jurisdiction Profiles • Source Registers • Traceable Evidence
              </p>
            </div>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleRunEvaluation}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-colors cursor-pointer"
            title="Execute deterministic assessment and save snapshot to project"
          >
            <RotateCw className="w-3.5 h-3.5 text-teal-400" />
            <span>Re-evaluate All Rules</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg shadow-2xs transition-colors cursor-pointer"
            title="Download complete compliance matrix CSV"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={handleExportMarkdown}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg shadow-2xs transition-colors cursor-pointer"
            title="Download publication-ready assessment Markdown report"
          >
            <FileText className="w-3.5 h-3.5 text-teal-700" />
            <span>Export Report (MD)</span>
          </button>
        </div>
      </div>

      {/* Staleness Banner if Project Geometry Moved */}
      {summary.isStale && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold">Assessment Stale — Project Geometry Changed</h4>
              <p className="text-xs text-amber-800 mt-0.5">
                The floor plan rooms or project parcel dimensions were modified since the last formal code check. Re-evaluate to sync results with current geometry.
              </p>
            </div>
          </div>
          <button
            onClick={handleRunEvaluation}
            className="px-3 py-1 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors shrink-0"
          >
            Update Results
          </button>
        </div>
      )}

      {/* Jurisdiction & Profile Summary Strip */}
      <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-800">
            <MapPin className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Jurisdiction & AHJ</span>
            <span className="text-xs font-bold text-slate-800">
              {profile.country ? `${profile.country} (${profile.region || 'Model Code'})` : 'Jurisdiction Not Provided'}
            </span>
            <div className="text-[10px] text-slate-500">{profile.ahj || 'AHJ Unspecified'}</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-800">
            <Building className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Use & Occupancy</span>
            <span className="text-xs font-bold text-slate-800">{profile.buildingUse}</span>
            <div className="text-[10px] text-slate-500">{profile.occupancyClassification}</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700">
            <BookOpen className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Active Code Standards</span>
            <span className="text-xs font-bold text-slate-800">{regState.sources.length} Authoritative Sources</span>
            <div className="text-[10px] text-slate-500">{summary.activeRulePack}</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-800">
            <UserCheck className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Reviewer & Pathway</span>
            <span className="text-xs font-bold text-slate-800">{profile.approvalPathway.replace(/-/g, ' ').toUpperCase()}</span>
            <div className="text-[10px] text-slate-500">{profile.responsibleReviewer || 'Unassigned'}</div>
          </div>
        </div>
      </div>

      {/* KPI Metric Summary Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div
          onClick={() => setStatusFilter(statusFilter === 'pass' ? 'all' : 'pass')}
          className={`p-3 rounded-xl border transition-all cursor-pointer ${
            statusFilter === 'pass'
              ? 'bg-emerald-50/80 border-emerald-300 ring-2 ring-emerald-500/20'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-emerald-700 text-xs font-semibold">
            <span>Pass</span>
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{summary.counts.pass}</div>
          <div className="text-[10px] text-slate-500">Verified & compliant</div>
        </div>

        <div
          onClick={() => setStatusFilter(statusFilter === 'conflict' ? 'all' : 'conflict')}
          className={`p-3 rounded-xl border transition-all cursor-pointer ${
            statusFilter === 'conflict'
              ? 'bg-rose-50/80 border-rose-300 ring-2 ring-rose-500/20'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-rose-700 text-xs font-semibold">
            <span>Conflicts</span>
            <XCircle className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold text-rose-700 mt-1">{summary.counts.conflict}</div>
          <div className="text-[10px] text-slate-500">Violations detected</div>
        </div>

        <div
          onClick={() => setStatusFilter(statusFilter === 'needs-review' ? 'all' : 'needs-review')}
          className={`p-3 rounded-xl border transition-all cursor-pointer ${
            statusFilter === 'needs-review'
              ? 'bg-amber-50/80 border-amber-300 ring-2 ring-amber-500/20'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-amber-700 text-xs font-semibold">
            <span>Needs Review</span>
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold text-amber-800 mt-1">{summary.counts.needsReview}</div>
          <div className="text-[10px] text-slate-500">Engineer / AHJ signoff</div>
        </div>

        <div
          onClick={() => setStatusFilter(statusFilter === 'insufficient-data' ? 'all' : 'insufficient-data')}
          className={`p-3 rounded-xl border transition-all cursor-pointer ${
            statusFilter === 'insufficient-data'
              ? 'bg-sky-50/80 border-sky-300 ring-2 ring-sky-500/20'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-sky-700 text-xs font-semibold">
            <span>Missing Data</span>
            <HelpCircle className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold text-sky-800 mt-1">{summary.counts.insufficientData}</div>
          <div className="text-[10px] text-slate-500">Inputs required</div>
        </div>

        <div
          onClick={() => setStatusFilter(statusFilter === 'unverified-rule' ? 'all' : 'unverified-rule')}
          className={`p-3 rounded-xl border transition-all cursor-pointer ${
            statusFilter === 'unverified-rule'
              ? 'bg-orange-50/80 border-orange-300 ring-2 ring-orange-500/20'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-orange-700 text-xs font-semibold">
            <span>Unverified</span>
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold text-orange-800 mt-1">{summary.counts.unverifiedRule}</div>
          <div className="text-[10px] text-slate-500">Check source status</div>
        </div>

        <div
          onClick={() => setStatusFilter('all')}
          className={`p-3 rounded-xl border transition-all cursor-pointer ${
            statusFilter === 'all'
              ? 'bg-slate-100 border-slate-400'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-slate-700 text-xs font-semibold">
            <span>Total Rules</span>
            <Scale className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{summary.counts.total}</div>
          <div className="text-[10px] text-slate-500">Active requirements</div>
        </div>
      </div>

      {/* Sub-Tab Navigation Strip */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('matrix')}
          className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors ${
            activeTab === 'matrix'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Requirements & Compliance Matrix ({summary.counts.total})
        </button>

        <button
          onClick={() => setActiveTab('conflicts')}
          className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
            activeTab === 'conflicts'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>Conflict Review & Action Plan</span>
          {summary.counts.conflict > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-500 text-white">
              {summary.counts.conflict}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('sources')}
          className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors ${
            activeTab === 'sources'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Regulatory Source Register ({regState.sources.length})
        </button>

        <button
          onClick={() => setActiveTab('profile')}
          className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors ${
            activeTab === 'profile'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Project Regulatory Profile
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors ${
            activeTab === 'history'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Assessment History & Audit ({regState.history?.length || 0})
        </button>
      </div>

      {/* TAB 1: REQUIREMENTS & COMPLIANCE MATRIX */}
      {activeTab === 'matrix' && (
        <div className="space-y-4">
          {/* Search & Filter Toolbar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 bg-white border border-slate-200 rounded-xl shadow-2xs">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search rule title, code section, or reason..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-slate-400"
              />
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <span className="text-xs text-slate-500 font-medium">Filter Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-hidden"
              >
                <option value="all">All Statuses ({summary.counts.total})</option>
                <option value="pass">Pass ({summary.counts.pass})</option>
                <option value="conflict">Conflict ({summary.counts.conflict})</option>
                <option value="needs-review">Needs Review ({summary.counts.needsReview})</option>
                <option value="insufficient-data">Insufficient Data ({summary.counts.insufficientData})</option>
                <option value="unverified-rule">Unverified Rule ({summary.counts.unverifiedRule})</option>
                <option value="not-applicable">Not Applicable ({summary.counts.notApplicable})</option>
              </select>
            </div>
          </div>

          {/* Requirements Table */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="py-3 px-4">Requirement & Legal Clause</th>
                    <th className="py-3 px-3">Category</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3">Measured vs Threshold</th>
                    <th className="py-3 px-4">Evaluation Details & Required Action</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredEvaluations.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        No regulatory requirements match the active filter or search query.
                      </td>
                    </tr>
                  ) : (
                    filteredEvaluations.map((item) => {
                      const def = reqMap.get(item.requirementId);
                      return (
                        <tr
                          key={item.requirementId}
                          className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                          onClick={() => setSelectedReqId(item.requirementId)}
                        >
                          <td className="py-3 px-4 max-w-xs">
                            <div className="font-bold text-slate-900">
                              {def?.title || item.requirementId}
                            </div>
                            <div className="text-[11px] text-teal-800 font-mono mt-0.5">
                              {def?.clauseReference || 'Reference Unspecified'}
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              Source: {item.sourceVersion}
                            </div>
                          </td>

                          <td className="py-3 px-3">
                            <span className="capitalize text-slate-700 font-medium">
                              {def?.requirementType.replace(/-/g, ' ')}
                            </span>
                          </td>

                          <td className="py-3 px-3 whitespace-nowrap">
                            {getStatusBadge(item.status)}
                          </td>

                          <td className="py-3 px-3 whitespace-nowrap">
                            <div className="font-semibold text-slate-900">
                              {item.measuredValue || '—'}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              Req: {item.thresholdValue || 'N/A'}
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            <p className="text-slate-700 leading-snug">
                              {item.statusReason}
                            </p>
                            <div className="text-[11px] text-teal-900 font-medium mt-1">
                              Action: {item.actionNeeded}
                            </div>
                          </td>

                          <td className="py-3 px-3 text-right whitespace-nowrap">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedReqId(item.requirementId);
                              }}
                              className="px-2.5 py-1 text-xs font-semibold text-teal-900 bg-teal-50 hover:bg-teal-100 rounded-md border border-teal-200 transition-colors"
                            >
                              Inspect
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CONFLICT REVIEW & ACTION PLAN */}
      {activeTab === 'conflicts' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-slate-900 text-white shadow-xs">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              Active Regulatory Conflicts & Missing Inputs
            </h3>
            <p className="text-xs text-slate-300 mt-1">
              Deterministic architectural checks identified the following non-compliant dimensions or missing parameters. Review recommended actions below.
            </p>
          </div>

          {summary.activeConflicts.length === 0 && summary.missingInputs.length === 0 ? (
            <div className="p-12 text-center bg-white border border-slate-200 rounded-xl shadow-2xs space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
              <h4 className="text-base font-bold text-slate-900">No Active Code Conflicts Detected</h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                All machine-checkable requirements against current parcel setbacks, room dimensions, and lot coverage are passing.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {summary.activeConflicts.map((c) => {
                const def = reqMap.get(c.requirementId);
                return (
                  <div
                    key={c.requirementId}
                    className="p-4 rounded-xl bg-rose-50/50 border border-rose-200 shadow-2xs space-y-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-200 text-rose-900">
                            CONFLICT
                          </span>
                          <h4 className="text-sm font-bold text-slate-900">
                            {def?.title || c.requirementId}
                          </h4>
                        </div>
                        <div className="text-xs text-teal-800 font-mono mt-0.5">
                          {def?.clauseReference}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={onOpenFloorPlan}
                          className="px-2.5 py-1 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                        >
                          Open 2D Plan
                        </button>
                        <button
                          onClick={() => {
                            setDecisionReqId(c.requirementId);
                            setIsDecisionModalOpen(true);
                          }}
                          className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
                        >
                          Request Variance / Exemption
                        </button>
                      </div>
                    </div>

                    <p className="text-xs text-slate-800">
                      {c.statusReason}
                    </p>

                    <div className="p-2.5 rounded-lg bg-white/80 border border-rose-100 flex items-start gap-2">
                      <ChevronRight className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <div className="text-xs text-slate-700">
                        <span className="font-semibold text-slate-900">Recommended Resolution: </span>
                        {c.actionNeeded}
                      </div>
                    </div>
                  </div>
                );
              })}

              {summary.missingInputs.map((m) => {
                const def = reqMap.get(m.requirementId);
                return (
                  <div
                    key={m.requirementId}
                    className="p-4 rounded-xl bg-sky-50/50 border border-sky-200 shadow-2xs space-y-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-sky-200 text-sky-900">
                            MISSING DATA
                          </span>
                          <h4 className="text-sm font-bold text-slate-900">
                            {def?.title || m.requirementId}
                          </h4>
                        </div>
                        <div className="text-xs text-slate-600 mt-0.5">
                          {def?.clauseReference}
                        </div>
                      </div>

                      <button
                        onClick={onOpenFloorPlan}
                        className="px-2.5 py-1 text-xs font-semibold text-sky-900 bg-sky-100 hover:bg-sky-200 border border-sky-300 rounded-lg transition-colors cursor-pointer"
                      >
                        Provide Inputs
                      </button>
                    </div>

                    <p className="text-xs text-slate-700">
                      {m.statusReason}
                    </p>

                    <div className="p-2.5 rounded-lg bg-white/80 border border-sky-100 text-xs text-slate-700">
                      <span className="font-semibold text-slate-900">Required Input: </span>
                      {m.actionNeeded}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: REGULATORY SOURCE REGISTER */}
      {activeTab === 'sources' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Authoritative Code & Source Register</h3>
              <p className="text-xs text-slate-500">
                Official building regulations, municipal zoning bylaws, and technical standards active for this project.
              </p>
            </div>
            <button
              onClick={() => setIsAddSourceOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-teal-400" />
              <span>Add Custom Source</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {regState.sources.map((src) => (
              <div
                key={src.id}
                className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">{src.title}</h4>
                    <div className="text-xs text-slate-500">{src.issuingAuthority}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        src.verificationStatus === 'verified'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {src.verificationStatus.toUpperCase()}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">{src.edition}</span>
                  </div>
                </div>

                <div className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  <div className="font-semibold text-slate-700 mb-1">
                    Document Ref: <code className="text-teal-800">{src.documentIdentifier}</code>
                  </div>
                  <div>Jurisdiction: {src.jurisdiction.country} ({src.jurisdiction.region || 'Standard'})</div>
                  {src.officialUrl && (
                    <a
                      href={src.officialUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-teal-800 hover:underline mt-1 font-semibold"
                    >
                      Official Source Link <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>

                {src.clauses.length > 0 && (
                  <div>
                    <span className="text-[11px] font-bold text-slate-600 block mb-1">
                      Active Sections & Clauses:
                    </span>
                    <ul className="text-xs space-y-1 text-slate-700">
                      {src.clauses.map((c) => (
                        <li key={c.clauseId} className="flex items-start gap-1.5">
                          <span className="font-mono font-semibold text-slate-800 shrink-0">
                            {c.section}:
                          </span>
                          <span className="text-slate-600">{c.title}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: PROJECT REGULATORY PROFILE */}
      {activeTab === 'profile' && (
        <form onSubmit={handleSaveProfile} className="space-y-6 bg-white p-6 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Regulatory & Statutory Project Profile</h3>
              <p className="text-xs text-slate-500">
                Specify official jurisdiction, Authority Having Jurisdiction (AHJ), and permit review pathways.
              </p>
            </div>
            <button
              type="submit"
              className="px-4 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              Save Profile
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Country
              </label>
              <input
                type="text"
                value={profile.country}
                onChange={(e) => setProfile({ ...profile, country: e.target.value })}
                className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-slate-400"
                placeholder="e.g. United States, United Kingdom, Canada"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                State / Province / Region
              </label>
              <input
                type="text"
                value={profile.region}
                onChange={(e) => setProfile({ ...profile, region: e.target.value })}
                className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-slate-400"
                placeholder="e.g. California, Ontario, Greater London"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Local Authority / Municipality
              </label>
              <input
                type="text"
                value={profile.localAuthority}
                onChange={(e) => setProfile({ ...profile, localAuthority: e.target.value })}
                className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-slate-400"
                placeholder="e.g. City Building Department, Borough Council"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Authority Having Jurisdiction (AHJ)
              </label>
              <input
                type="text"
                value={profile.ahj}
                onChange={(e) => setProfile({ ...profile, ahj: e.target.value })}
                className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-slate-400"
                placeholder="e.g. Planning & Safety Commission"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Occupancy Classification
              </label>
              <input
                type="text"
                value={profile.occupancyClassification}
                onChange={(e) => setProfile({ ...profile, occupancyClassification: e.target.value })}
                className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-slate-400"
                placeholder="e.g. Group R-3 (Single Family Dwelling)"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Approval / Review Pathway
              </label>
              <select
                value={profile.approvalPathway}
                onChange={(e) => setProfile({ ...profile, approvalPathway: e.target.value as ApprovalPathway })}
                className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-slate-400"
              >
                <option value="standard-planning-permit">Standard Planning & Building Permit</option>
                <option value="building-notice">Building Notice (Minor Works)</option>
                <option value="full-plans-application">Full Plans Application</option>
                <option value="permitted-development">Permitted Development (Exempt / Prior Approval)</option>
                <option value="exempt">Statutory Exemption</option>
                <option value="unknown">Unknown / Not Determined</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Responsible Reviewer Name
              </label>
              <input
                type="text"
                value={profile.responsibleReviewer}
                onChange={(e) => setProfile({ ...profile, responsibleReviewer: e.target.value })}
                className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-slate-400"
                placeholder="e.g. Lead Architect / Code Consultant"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Review Notes & Local Amendments
              </label>
              <input
                type="text"
                value={profile.reviewNotes}
                onChange={(e) => setProfile({ ...profile, reviewNotes: e.target.value })}
                className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-slate-400"
                placeholder="Local amendments or heritage conservation notes"
              />
            </div>
          </div>
        </form>
      )}

      {/* TAB 5: ASSESSMENT HISTORY & AUDIT LOG */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-3">
            <h3 className="text-sm font-bold text-slate-900">Deterministic Assessment Run History</h3>
            <p className="text-xs text-slate-500">
              Each evaluation is cryptographically timestamped and linked to the exact geometry hash active during that run.
            </p>

            {(!regState.history || regState.history.length === 0) ? (
              <div className="py-6 text-center text-xs text-slate-400">
                No saved historical runs recorded yet. Click &quot;Re-evaluate All Rules&quot; to save a baseline snapshot.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {regState.history.map((h) => (
                  <div key={h.id} className="py-3 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-slate-800">
                        Assessment Snapshot {h.id}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {new Date(h.timestamp).toLocaleString()} • Geometry: {h.geometryHash}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded font-semibold bg-emerald-100 text-emerald-800">
                        {h.summary.pass} Pass
                      </span>
                      {h.summary.conflict > 0 && (
                        <span className="px-2 py-0.5 rounded font-semibold bg-rose-100 text-rose-800">
                          {h.summary.conflict} Conflict
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded font-semibold bg-amber-100 text-amber-800">
                        {h.summary.needsReview} Review
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Reviewer Decisions Log */}
          <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-3">
            <h3 className="text-sm font-bold text-slate-900">Professional Reviewer Decisions & Variances</h3>
            {(!regState.reviewerDecisions || regState.reviewerDecisions.length === 0) ? (
              <div className="py-4 text-center text-xs text-slate-400">
                No manual reviewer decisions or variances recorded.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {regState.reviewerDecisions.map((d) => (
                  <div key={d.id} className="py-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900">
                        Rule: {d.requirementId}
                      </span>
                      <span className="font-semibold text-teal-800 uppercase text-[10px] bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                        {d.decision.replace(/-/g, ' ')}
                      </span>
                    </div>
                    <p className="text-slate-700 mt-0.5">{d.notes}</p>
                    <div className="text-[10px] text-slate-400 mt-1">
                      By {d.reviewer} on {new Date(d.timestamp).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* INSPECT REQUIREMENT DETAIL MODAL */}
      {selectedEvaluation && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between pb-3 border-b border-slate-200">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-slate-500">{selectedEvaluation.requirementId}</span>
                  {getStatusBadge(selectedEvaluation.status)}
                </div>
                <h3 className="text-base font-bold text-slate-900 mt-1">
                  {selectedReqDef?.title || selectedEvaluation.requirementId}
                </h3>
                <div className="text-xs text-teal-800 font-mono mt-0.5">
                  {selectedReqDef?.clauseReference} • {selectedEvaluation.sourceVersion}
                </div>
              </div>
              <button
                onClick={() => setSelectedReqId(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <h4 className="font-bold text-slate-700">Plain-Language Summary</h4>
                <p className="text-slate-600 mt-0.5">
                  {selectedReqDef?.plainLanguageExplanation || 'Standard regulatory check.'}
                </p>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <div className="font-bold text-slate-700">Evaluation Rationale & Measured Values</div>
                <p className="text-slate-800 font-medium">
                  {selectedEvaluation.statusReason}
                </p>
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200 text-[11px]">
                  <div>
                    <span className="text-slate-500 block">Measured Project Value:</span>
                    <span className="font-bold text-slate-900">{selectedEvaluation.measuredValue || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Statutory Threshold:</span>
                    <span className="font-bold text-slate-900">{selectedEvaluation.thresholdValue || 'N/A'}</span>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-slate-700">Captured Inputs</h4>
                <pre className="p-2 bg-slate-900 text-slate-200 text-[11px] rounded-lg overflow-x-auto font-mono">
                  {JSON.stringify(selectedEvaluation.inputsCaptured, null, 2)}
                </pre>
              </div>

              <div className="p-3 bg-teal-50/60 rounded-xl border border-teal-200 text-teal-950">
                <span className="font-bold block mb-0.5">Next Action Required:</span>
                {selectedEvaluation.actionNeeded}
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-200">
              <button
                onClick={() => {
                  setDecisionReqId(selectedEvaluation.requirementId);
                  setSelectedReqId(null);
                  setIsDecisionModalOpen(true);
                }}
                className="px-3 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                Record Reviewer Decision
              </button>

              <button
                onClick={() => setSelectedReqId(null)}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RECORD REVIEWER DECISION MODAL */}
      {isDecisionModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleRecordDecision}
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-900">Record Reviewer Decision</h3>
              <button
                type="button"
                onClick={() => setIsDecisionModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Requirement ID</label>
                <input
                  type="text"
                  value={decisionReqId}
                  disabled
                  className="w-full p-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-600 font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Decision Type</label>
                <select
                  value={decisionType}
                  onChange={(e) => setDecisionType(e.target.value as any)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                >
                  <option value="accepted-with-conditions">Accepted with Conditions</option>
                  <option value="variance-required">Municipal Variance Required</option>
                  <option value="exempted">Exempted by Documented Exception</option>
                  <option value="clarification-requested">Clarification Requested from AHJ</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Reviewer Name</label>
                <input
                  type="text"
                  value={decisionReviewer}
                  onChange={(e) => setDecisionReviewer(e.target.value)}
                  placeholder={profile.responsibleReviewer || 'e.g. Lead Architect'}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Justification & Notes</label>
                <textarea
                  rows={3}
                  required
                  value={decisionNotes}
                  onChange={(e) => setDecisionNotes(e.target.value)}
                  placeholder="State technical basis, municipal variance reference, or conditions..."
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setIsDecisionModalOpen(false)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
              >
                Save Decision
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ADD CUSTOM SOURCE MODAL */}
      {isAddSourceOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleCreateSource}
            className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-900">Add Regulatory Source Document</h3>
              <button
                type="button"
                onClick={() => setIsAddSourceOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Source Title *</label>
                <input
                  type="text"
                  required
                  value={newSource.title}
                  onChange={(e) => setNewSource({ ...newSource, title: e.target.value })}
                  placeholder="e.g. City of Denver Zoning Code Title 12"
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Document Identifier *</label>
                  <input
                    type="text"
                    required
                    value={newSource.documentIdentifier}
                    onChange={(e) => setNewSource({ ...newSource, documentIdentifier: e.target.value })}
                    placeholder="e.g. DZC-2024"
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Issuing Authority</label>
                  <input
                    type="text"
                    value={newSource.issuingAuthority}
                    onChange={(e) => setNewSource({ ...newSource, issuingAuthority: e.target.value })}
                    placeholder="e.g. Municipal City Council"
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Edition / Year</label>
                  <input
                    type="text"
                    value={newSource.edition}
                    onChange={(e) => setNewSource({ ...newSource, edition: e.target.value })}
                    placeholder="2024 Edition"
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Verification Status</label>
                  <select
                    value={newSource.verificationStatus}
                    onChange={(e) => setNewSource({ ...newSource, verificationStatus: e.target.value as any })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                  >
                    <option value="unverified">Unverified (Pending Official Check)</option>
                    <option value="verified">Verified Adopted Legislation</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Official Reference URL</label>
                <input
                  type="url"
                  value={newSource.officialUrl || ''}
                  onChange={(e) => setNewSource({ ...newSource, officialUrl: e.target.value })}
                  placeholder="https://..."
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Reviewer Notes</label>
                <textarea
                  rows={2}
                  value={newSource.reviewerNotes || ''}
                  onChange={(e) => setNewSource({ ...newSource, reviewerNotes: e.target.value })}
                  placeholder="Notes on scope, applicability, or local amendments..."
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setIsAddSourceOpen(false)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs"
              >
                Add Source
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Statutory Limitation Footer Disclaimer */}
      <div className="p-4 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 flex items-start gap-3 text-xs leading-relaxed">
        <ShieldCheck className="w-5 h-5 text-teal-800 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-slate-800 block mb-0.5">Statutory Architecture & Legal Disclaimer</span>
          {STATUTORY_LIMITATION_DISCLAIMER}
        </div>
      </div>
    </div>
  );
};
