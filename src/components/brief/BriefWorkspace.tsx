import React, { useState, useMemo } from 'react';
import { Project, FloorPlanRoom } from '../../types/project';
import {
  ArchitecturalBriefData,
  SpaceRequirement,
  SpatialRelationshipRule,
  BriefPriority,
  SpaceCategory,
  PrivacyLevel,
  SpatialRelationshipType,
  BriefApprovalStatus,
  BuildingUseClassification,
} from '../../types/brief';
import {
  initializeProjectBrief,
  calculateSpaceProgramSummary,
  compareBriefWithFloorPlan,
  validateBrief,
  getBriefTemplates,
  recordBriefRevision,
} from '../../services/briefService';
import {
  generateBriefSpaceProgramCSV,
  generateBriefDocumentMarkdown,
} from '../../services/documentationEngine';
import {
  FileText,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  Lock,
  Unlock,
  Plus,
  Trash2,
  Copy,
  Download,
  Users,
  Layers,
  ArrowRight,
  ArrowLeft,
  Building2,
  Target,
  Sparkles,
  Shield,
  FileCheck2,
  PenTool,
  RotateCcw,
  Maximize,
} from 'lucide-react';

interface BriefWorkspaceProps {
  project: Project;
  onUpdateProject: (updated: Project) => void;
  onBack: () => void;
  onOpenFloorPlan: (project: Project) => void;
  onOpenEvidenceLedger: (project: Project) => void;
  onOpenDocumentation: (project: Project) => void;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

type WorkspaceTab = 'objectives' | 'spaces' | 'adjacencies' | 'reconciliation' | 'governance';

export const BriefWorkspace: React.FC<BriefWorkspaceProps> = ({
  project,
  onUpdateProject,
  onBack,
  onOpenFloorPlan,
  onOpenEvidenceLedger,
  onOpenDocumentation,
  showToast,
}) => {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('spaces');
  const [brief, setBrief] = useState<ArchitecturalBriefData>(() => initializeProjectBrief(project));
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [selectedPriorityFilter, setSelectedPriorityFilter] = useState<string>('all');
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [isNewSpaceModalOpen, setIsNewSpaceModalOpen] = useState(false);
  const [newSpaceForm, setNewSpaceForm] = useState<Partial<SpaceRequirement>>({
    name: '',
    category: 'living',
    targetArea: project.unit === 'feet' ? 150 : 14,
    quantity: 1,
    priority: 'mandatory',
    privacyLevel: 'semi-private',
    floorPreference: 1,
    naturalLightRequired: true,
    plumbingRequired: false,
    outdoorAccessRequired: false,
    acousticPrivacyRequired: false,
    wheelchairAccessible: true,
    notes: '',
  });

  const [revisionNotes, setRevisionNotes] = useState('');
  const [revisionAuthor, setRevisionAuthor] = useState('Lead Architect');
  const [newUnresolvedQuestion, setNewUnresolvedQuestion] = useState('');

  const unitSuffix = project.unit === 'feet' ? 'ft' : 'm';
  const unitAreaSuffix = project.unit === 'feet' ? 'sq ft' : 'm²';

  // Derived deterministic calculations
  const summary = useMemo(() => calculateSpaceProgramSummary(project, brief), [project, brief]);
  const comparisons = useMemo(() => compareBriefWithFloorPlan(project, brief), [project, brief]);
  const notices = useMemo(() => validateBrief(project, brief), [project, brief]);

  const conflictsCount = notices.filter((n) => n.severity === 'conflict').length;
  const warningsCount = notices.filter((n) => n.severity === 'warning').length;

  // Save handler
  const handleSaveBrief = (updatedBrief: ArchitecturalBriefData, toastMsg = 'Brief saved successfully') => {
    setBrief(updatedBrief);
    const updatedProject: Project = {
      ...project,
      brief: updatedBrief,
      updatedAt: new Date().toISOString(),
    };
    onUpdateProject(updatedProject);
    showToast(toastMsg, 'success');
  };

  // Toggle locked status
  const handleToggleLock = () => {
    const isCurrentlyLocked = brief.approvalStatus === 'locked';
    const nextStatus: BriefApprovalStatus = isCurrentlyLocked ? 'under-review' : 'locked';
    const updated = recordBriefRevision(
      brief,
      'Project Lead',
      isCurrentlyLocked ? 'Unlocked brief for modifications' : 'Locked brief baseline',
      nextStatus
    );
    handleSaveBrief(updated, isCurrentlyLocked ? 'Brief unlocked for editing' : 'Brief locked as baseline');
  };

  // Load template
  const handleLoadTemplate = (templateBrief: Partial<ArchitecturalBriefData>) => {
    const initialized = initializeProjectBrief(project);
    const merged: ArchitecturalBriefData = {
      ...initialized,
      ...templateBrief,
      version: 'v1.0',
      lastUpdated: new Date().toISOString(),
      approvalStatus: 'draft',
      revisions: [
        {
          id: `rev-${Date.now()}`,
          versionNumber: 1,
          timestamp: new Date().toISOString(),
          author: 'Architecture Template Loader',
          summaryOfChanges: 'Loaded architectural brief preset template',
          approvalStatus: 'draft',
        },
      ],
    };
    handleSaveBrief(merged, 'Architectural template loaded successfully');
    setIsTemplateModalOpen(false);
  };

  // Add space requirement
  const handleCreateSpace = () => {
    if (!newSpaceForm.name?.trim()) {
      showToast('Space name is required', 'error');
      return;
    }
    const newSpace: SpaceRequirement = {
      id: `sp-${Date.now()}`,
      name: newSpaceForm.name.trim(),
      category: (newSpaceForm.category as SpaceCategory) || 'living',
      targetArea: Number(newSpaceForm.targetArea) || (project.unit === 'feet' ? 120 : 11),
      minArea: newSpaceForm.minArea ? Number(newSpaceForm.minArea) : undefined,
      maxArea: newSpaceForm.maxArea ? Number(newSpaceForm.maxArea) : undefined,
      quantity: Number(newSpaceForm.quantity) > 0 ? Number(newSpaceForm.quantity) : 1,
      priority: (newSpaceForm.priority as BriefPriority) || 'mandatory',
      privacyLevel: (newSpaceForm.privacyLevel as PrivacyLevel) || 'semi-private',
      floorPreference: newSpaceForm.floorPreference === 'any' ? 'any' : Number(newSpaceForm.floorPreference) || 1,
      naturalLightRequired: Boolean(newSpaceForm.naturalLightRequired),
      plumbingRequired: Boolean(newSpaceForm.plumbingRequired),
      outdoorAccessRequired: Boolean(newSpaceForm.outdoorAccessRequired),
      acousticPrivacyRequired: Boolean(newSpaceForm.acousticPrivacyRequired),
      wheelchairAccessible: Boolean(newSpaceForm.wheelchairAccessible),
      notes: newSpaceForm.notes?.trim() || '',
    };

    const updated: ArchitecturalBriefData = {
      ...brief,
      spaces: [...brief.spaces, newSpace],
      lastUpdated: new Date().toISOString(),
    };
    handleSaveBrief(updated, `Added "${newSpace.name}" to space schedule`);
    setIsNewSpaceModalOpen(false);
    setNewSpaceForm({
      name: '',
      category: 'living',
      targetArea: project.unit === 'feet' ? 150 : 14,
      quantity: 1,
      priority: 'mandatory',
      privacyLevel: 'semi-private',
      floorPreference: 1,
      naturalLightRequired: true,
      plumbingRequired: false,
      outdoorAccessRequired: false,
      acousticPrivacyRequired: false,
      wheelchairAccessible: true,
      notes: '',
    });
  };

  // Duplicate space
  const handleDuplicateSpace = (space: SpaceRequirement) => {
    const copy: SpaceRequirement = {
      ...space,
      id: `sp-${Date.now()}`,
      name: `${space.name} (Copy)`,
    };
    const updated: ArchitecturalBriefData = {
      ...brief,
      spaces: [...brief.spaces, copy],
      lastUpdated: new Date().toISOString(),
    };
    handleSaveBrief(updated, `Duplicated space "${space.name}"`);
  };

  // Delete space
  const handleDeleteSpace = (spaceId: string) => {
    const target = brief.spaces.find((s) => s.id === spaceId);
    if (!target) return;
    const updated: ArchitecturalBriefData = {
      ...brief,
      spaces: brief.spaces.filter((s) => s.id !== spaceId),
      relationships: brief.relationships.filter(
        (r) => r.sourceSpaceId !== spaceId && r.targetSpaceId !== spaceId
      ),
      lastUpdated: new Date().toISOString(),
    };
    handleSaveBrief(updated, `Removed space "${target.name}"`);
  };

  // Inline update space field
  const handleUpdateSpaceField = (spaceId: string, updates: Partial<SpaceRequirement>) => {
    const updated: ArchitecturalBriefData = {
      ...brief,
      spaces: brief.spaces.map((s) => (s.id === spaceId ? { ...s, ...updates } : s)),
      lastUpdated: new Date().toISOString(),
    };
    handleSaveBrief(updated, 'Updated space requirement');
  };

  // Add unresolved question
  const handleAddQuestion = () => {
    if (!newUnresolvedQuestion.trim()) return;
    const currentQuestions = brief.constraints.unresolvedQuestions || [];
    const updated: ArchitecturalBriefData = {
      ...brief,
      constraints: {
        ...brief.constraints,
        unresolvedQuestions: [...currentQuestions, newUnresolvedQuestion.trim()],
      },
      lastUpdated: new Date().toISOString(),
    };
    handleSaveBrief(updated, 'Added design clarification question');
    setNewUnresolvedQuestion('');
  };

  const handleRemoveQuestion = (idx: number) => {
    const updated: ArchitecturalBriefData = {
      ...brief,
      constraints: {
        ...brief.constraints,
        unresolvedQuestions: (brief.constraints.unresolvedQuestions || []).filter((_, i) => i !== idx),
      },
      lastUpdated: new Date().toISOString(),
    };
    handleSaveBrief(updated, 'Removed question');
  };

  // Add spatial relationship
  const [sourceSpaceId, setSourceSpaceId] = useState(brief.spaces[0]?.id || '');
  const [targetSpaceId, setTargetSpaceId] = useState(brief.spaces[1]?.id || '');
  const [relationType, setRelationType] = useState<SpatialRelationshipType>('adjacent');
  const [relationPriority, setRelationPriority] = useState<BriefPriority>('high-priority');

  const handleAddRelationship = () => {
    if (!sourceSpaceId || !targetSpaceId || sourceSpaceId === targetSpaceId) {
      showToast('Please select two distinct spaces for relationship', 'error');
      return;
    }
    const newRel: SpatialRelationshipRule = {
      id: `rel-${Date.now()}`,
      sourceSpaceId,
      targetSpaceId,
      relationType,
      priority: relationPriority,
    };
    const updated: ArchitecturalBriefData = {
      ...brief,
      relationships: [...brief.relationships, newRel],
      lastUpdated: new Date().toISOString(),
    };
    handleSaveBrief(updated, 'Added spatial relationship rule');
  };

  const handleDeleteRelationship = (relId: string) => {
    const updated: ArchitecturalBriefData = {
      ...brief,
      relationships: brief.relationships.filter((r) => r.id !== relId),
      lastUpdated: new Date().toISOString(),
    };
    handleSaveBrief(updated, 'Removed spatial relationship rule');
  };

  // Export handlers
  const handleDownloadCSV = () => {
    const csv = generateBriefSpaceProgramCSV(project);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${project.name.toLowerCase().replace(/\s+/g, '_')}_space_program.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Space program CSV exported successfully', 'success');
  };

  const handleDownloadMarkdown = () => {
    const md = generateBriefDocumentMarkdown(project);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${project.name.toLowerCase().replace(/\s+/g, '_')}_brief_spec.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Architectural brief markdown exported successfully', 'success');
  };

  // Filtered spaces
  const filteredSpaces = brief.spaces.filter((s) => {
    if (selectedCategoryFilter !== 'all' && s.category !== selectedCategoryFilter) return false;
    if (selectedPriorityFilter !== 'all' && s.priority !== selectedPriorityFilter) return false;
    return true;
  });

  const templates = getBriefTemplates(project.unit);
  const isLocked = brief.approvalStatus === 'locked';

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-16">
      {/* Top Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors mb-2 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Project Overview</span>
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Architectural Brief & Space Programming
            </h1>
            <span
              className={`text-xs px-2.5 py-0.5 rounded-full font-semibold uppercase tracking-wider ${
                brief.approvalStatus === 'locked'
                  ? 'bg-rose-100 text-rose-800 border border-rose-200'
                  : brief.approvalStatus === 'client-approved'
                  ? 'bg-teal-100 text-teal-800 border border-teal-200'
                  : brief.approvalStatus === 'under-review'
                  ? 'bg-amber-100 text-amber-800 border border-amber-200'
                  : 'bg-slate-100 text-slate-700 border border-slate-200'
              }`}
            >
              {brief.approvalStatus.replace('-', ' ')}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Structured user requirements, functional space program, target areas, priority governance, and 2D floor-plan reconciliation.
          </p>
        </div>

        {/* Global Action Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsTemplateModalOpen(true)}
            disabled={isLocked}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
              isLocked
                ? 'opacity-50 cursor-not-allowed bg-slate-50 text-slate-400 border-slate-200'
                : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300'
            }`}
            title="Load an architectural brief template"
          >
            <Sparkles className="w-3.5 h-3.5 text-teal-600" />
            <span>Load Template</span>
          </button>

          <button
            onClick={handleDownloadCSV}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors cursor-pointer"
            title="Export space schedule to CSV"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={handleDownloadMarkdown}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors cursor-pointer"
            title="Export complete brief specification to Markdown"
          >
            <FileText className="w-3.5 h-3.5 text-slate-500" />
            <span>Export MD</span>
          </button>

          <button
            onClick={() => onOpenFloorPlan(project)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors cursor-pointer"
            title="Open 2D floor plan to place programmed spaces"
          >
            <PenTool className="w-3.5 h-3.5 text-teal-700" />
            <span>2D Plan</span>
          </button>

          <button
            onClick={handleToggleLock}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
              isLocked
                ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                : 'bg-slate-900 text-white hover:bg-slate-800 border-slate-900'
            }`}
            title={isLocked ? 'Unlock brief to permit edits' : 'Lock brief baseline to prevent modifications'}
          >
            {isLocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
            <span>{isLocked ? 'Unlock Brief' : 'Lock Baseline'}</span>
          </button>
        </div>
      </div>

      {/* Metric Summary Ribbon */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white border border-slate-200 p-3.5 rounded-xl shadow-2xs">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Target Net Program
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-bold text-slate-900 tabular-nums">
              {summary.totalTargetNetArea.toLocaleString()}
            </span>
            <span className="text-xs text-slate-500">{unitAreaSuffix}</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {summary.totalSpaceCount} spaces across {brief.spaces.length} definitions
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-3.5 rounded-xl shadow-2xs">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Est. Gross Area (GIA)
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-bold text-slate-900 tabular-nums">
              {summary.estimatedGrossInternalArea.toLocaleString()}
            </span>
            <span className="text-xs text-slate-500">{unitAreaSuffix}</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            +{summary.circulationWallAllowancePercent}% circulation & walls
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-3.5 rounded-xl shadow-2xs">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Plot Fit Feasibility
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className={`text-sm font-bold px-2 py-0.5 rounded-md uppercase tracking-wider ${
                summary.footprintFitStatus === 'fits'
                  ? 'bg-teal-100 text-teal-800'
                  : summary.footprintFitStatus === 'tight'
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-rose-100 text-rose-800'
              }`}
            >
              {summary.footprintFitStatus}
            </span>
            <span className="text-xs text-slate-500">
              max {summary.maxAllowableGrossArea?.toLocaleString()} {unitAreaSuffix}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Across {project.floors} floor level(s)
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-3.5 rounded-xl shadow-2xs">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Mandatory Fulfillment
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-bold text-slate-900 tabular-nums">
              {comparisons.filter((c) => c.priority === 'mandatory' && c.placementStatus === 'fully-placed').length}
            </span>
            <span className="text-xs text-slate-500">
              / {brief.spaces.filter((s) => s.priority === 'mandatory').length} placed
            </span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {comparisons.filter((c) => c.priority === 'mandatory' && c.placementStatus === 'unplaced').length} unplaced in 2D plan
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-3.5 rounded-xl shadow-2xs">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Validation Notices
          </div>
          <div className="flex items-center gap-2">
            {conflictsCount > 0 ? (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                <AlertCircle className="w-3 h-3" />
                {conflictsCount} Conflict{conflictsCount > 1 ? 's' : ''}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                <CheckCircle2 className="w-3 h-3" />
                0 Conflicts
              </span>
            )}
            {warningsCount > 0 && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                <AlertTriangle className="w-3 h-3" />
                {warningsCount}
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Checked against 2D geometry
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 gap-1 overflow-x-auto">
        <button
          onClick={() => setActiveTab('spaces')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'spaces'
              ? 'border-teal-700 text-teal-900 bg-teal-50/50'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <Layers className="w-4 h-4 text-teal-700" />
          <span>Space Schedule & Program ({brief.spaces.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('objectives')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'objectives'
              ? 'border-teal-700 text-teal-900 bg-teal-50/50'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <Building2 className="w-4 h-4 text-teal-700" />
          <span>Objectives & Occupancy</span>
        </button>

        <button
          onClick={() => setActiveTab('adjacencies')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'adjacencies'
              ? 'border-teal-700 text-teal-900 bg-teal-50/50'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <Target className="w-4 h-4 text-teal-700" />
          <span>Spatial Adjacencies ({brief.relationships.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('reconciliation')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'reconciliation'
              ? 'border-teal-700 text-teal-900 bg-teal-50/50'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <PenTool className="w-4 h-4 text-teal-700" />
          <span>2D Plan Reconciliation</span>
          {conflictsCount > 0 && (
            <span className="w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] flex items-center justify-center font-bold">
              {conflictsCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('governance')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'governance'
              ? 'border-teal-700 text-teal-900 bg-teal-50/50'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <Shield className="w-4 h-4 text-teal-700" />
          <span>Revisions & Sign-Off ({brief.revisions.length})</span>
        </button>
      </div>

      {/* ==================================================================== */}
      {/* TAB 1: SPACE SCHEDULE & PROGRAM                                      */}
      {/* ==================================================================== */}
      {activeTab === 'spaces' && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">Filters:</span>
              <select
                value={selectedCategoryFilter}
                onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-teal-500"
              >
                <option value="all">All Categories</option>
                <option value="living">Living & Gathering</option>
                <option value="sleeping">Sleeping & Rest</option>
                <option value="service">Kitchen & Service</option>
                <option value="hygiene">Bathrooms & Hygiene</option>
                <option value="work">Work & Study</option>
                <option value="outdoor">Outdoor Amenity</option>
                <option value="circulation">Circulation</option>
                <option value="specialized">Specialized</option>
              </select>

              <select
                value={selectedPriorityFilter}
                onChange={(e) => setSelectedPriorityFilter(e.target.value)}
                className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-teal-500"
              >
                <option value="all">All Priorities</option>
                <option value="mandatory">Mandatory Only</option>
                <option value="high-priority">High Priority</option>
                <option value="preferred">Preferred</option>
                <option value="optional">Optional</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsNewSpaceModalOpen(true)}
                disabled={isLocked}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  isLocked
                    ? 'opacity-50 cursor-not-allowed bg-slate-100 text-slate-400'
                    : 'bg-teal-700 hover:bg-teal-800 text-white'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Programmed Space</span>
              </button>
            </div>
          </div>

          {/* Spaces Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold text-[11px]">
                  <tr>
                    <th className="py-3 px-3.5">Space Name & Notes</th>
                    <th className="py-3 px-3">Category</th>
                    <th className="py-3 px-3">Priority</th>
                    <th className="py-3 px-3 text-right">Target Each</th>
                    <th className="py-3 px-2 text-center">Qty</th>
                    <th className="py-3 px-3 text-right">Target Total</th>
                    <th className="py-3 px-2 text-center">Floor</th>
                    <th className="py-3 px-3 text-center">Requirements</th>
                    <th className="py-3 px-3 text-center">2D Placement</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800 font-medium">
                  {filteredSpaces.map((sp) => {
                    const comp = comparisons.find((c) => c.spaceRequirementId === sp.id);
                    const targetTotal = sp.targetArea * (sp.quantity || 1);

                    return (
                      <tr key={sp.id} className="hover:bg-slate-50/70 transition-colors">
                        {/* Space Name & Notes */}
                        <td className="py-3 px-3.5">
                          <div className="font-semibold text-slate-900">{sp.name}</div>
                          {sp.notes && <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{sp.notes}</div>}
                        </td>

                        {/* Category */}
                        <td className="py-3 px-3">
                          <span className="capitalize text-slate-600 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                            {sp.category}
                          </span>
                        </td>

                        {/* Priority */}
                        <td className="py-3 px-3">
                          <span
                            className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded ${
                              sp.priority === 'mandatory'
                                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                : sp.priority === 'high-priority'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : sp.priority === 'preferred'
                                ? 'bg-teal-50 text-teal-700 border border-teal-200'
                                : 'bg-slate-100 text-slate-600 border border-slate-200'
                            }`}
                          >
                            {sp.priority}
                          </span>
                        </td>

                        {/* Target Each */}
                        <td className="py-3 px-3 text-right tabular-nums font-semibold">
                          {isLocked ? (
                            <span>
                              {sp.targetArea} {unitAreaSuffix}
                            </span>
                          ) : (
                            <div className="inline-flex items-center gap-1">
                              <input
                                type="number"
                                min="1"
                                value={sp.targetArea}
                                onChange={(e) =>
                                  handleUpdateSpaceField(sp.id, { targetArea: Number(e.target.value) || 1 })
                                }
                                className="w-16 px-1.5 py-0.5 text-right bg-slate-50 border border-slate-200 rounded text-xs focus:bg-white focus:outline-teal-500"
                              />
                              <span className="text-[10px] text-slate-400">{unitAreaSuffix}</span>
                            </div>
                          )}
                        </td>

                        {/* Quantity */}
                        <td className="py-3 px-2 text-center tabular-nums">
                          {isLocked ? (
                            <span>{sp.quantity}</span>
                          ) : (
                            <input
                              type="number"
                              min="1"
                              max="20"
                              value={sp.quantity}
                              onChange={(e) =>
                                handleUpdateSpaceField(sp.id, { quantity: Number(e.target.value) || 1 })
                              }
                              className="w-11 px-1 py-0.5 text-center bg-slate-50 border border-slate-200 rounded text-xs focus:bg-white focus:outline-teal-500"
                            />
                          )}
                        </td>

                        {/* Target Total */}
                        <td className="py-3 px-3 text-right tabular-nums font-bold text-slate-900">
                          {targetTotal} {unitAreaSuffix}
                        </td>

                        {/* Floor Preference */}
                        <td className="py-3 px-2 text-center text-[11px] text-slate-600">
                          {sp.floorPreference === 'any' ? 'Any' : `Fl ${sp.floorPreference}`}
                        </td>

                        {/* Special Requirements */}
                        <td className="py-3 px-3">
                          <div className="flex items-center justify-center gap-1.5 text-slate-400">
                            {sp.naturalLightRequired && (
                              <span title="Direct natural light required" className="text-amber-500 font-bold text-[11px]">
                                ☀️
                              </span>
                            )}
                            {sp.plumbingRequired && (
                              <span title="Plumbing wet zone" className="text-teal-600 font-bold text-[11px]">
                                💧
                              </span>
                            )}
                            {sp.acousticPrivacyRequired && (
                              <span title="Acoustic isolation" className="text-indigo-600 font-bold text-[11px]">
                                🔇
                              </span>
                            )}
                            {sp.outdoorAccessRequired && (
                              <span title="Direct outdoor access" className="text-emerald-600 font-bold text-[11px]">
                                🌿
                              </span>
                            )}
                            {sp.wheelchairAccessible && (
                              <span title="Wheelchair accessible" className="text-blue-600 font-bold text-[11px]">
                                ♿
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 2D Placement Status */}
                        <td className="py-3 px-3 text-center">
                          {comp ? (
                            <span
                              className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded ${
                                comp.placementStatus === 'fully-placed'
                                  ? 'bg-teal-50 text-teal-700 border border-teal-200'
                                  : comp.placementStatus === 'partially-placed'
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : comp.placementStatus === 'over-allocated'
                                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200'
                              }`}
                            >
                              {comp.placedQuantity} / {comp.requiredQuantity} Placed
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs">—</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleDuplicateSpace(sp)}
                              disabled={isLocked}
                              className="p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100 transition-colors disabled:opacity-40 cursor-pointer"
                              title="Duplicate Space Requirement"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteSpace(sp.id)}
                              disabled={isLocked}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-slate-100 transition-colors disabled:opacity-40 cursor-pointer"
                              title="Delete Space Requirement"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Program Subtotals Footer */}
            <div className="bg-slate-50 border-t border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-slate-600">Circulation & Wall Allowance:</span>
                <input
                  type="range"
                  min="10"
                  max="25"
                  step="1"
                  disabled={isLocked}
                  value={brief.circulationWallAllowancePercent}
                  onChange={(e) => {
                    const updated = {
                      ...brief,
                      circulationWallAllowancePercent: Number(e.target.value),
                      lastUpdated: new Date().toISOString(),
                    };
                    handleSaveBrief(updated, `Circulation allowance set to ${e.target.value}%`);
                  }}
                  className="w-28 accent-teal-700"
                />
                <span className="text-xs font-bold text-slate-900 tabular-nums">
                  {brief.circulationWallAllowancePercent}%
                </span>
                <span className="text-xs text-slate-400">
                  (+{summary.estimatedCirculationWallArea.toLocaleString()} {unitAreaSuffix})
                </span>
              </div>

              <div className="flex items-baseline gap-4">
                <div className="text-right">
                  <div className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">
                    Net Internal Area (NIA)
                  </div>
                  <div className="text-sm font-bold text-slate-900 tabular-nums">
                    {summary.totalTargetNetArea.toLocaleString()} {unitAreaSuffix}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">
                    Estimated Gross Area (GIA)
                  </div>
                  <div className="text-base font-bold text-teal-800 tabular-nums">
                    {summary.estimatedGrossInternalArea.toLocaleString()} {unitAreaSuffix}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 2: OBJECTIVES & OCCUPANCY                                        */}
      {/* ==================================================================== */}
      {activeTab === 'objectives' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Section A: Project Objectives */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <Building2 className="w-4 h-4 text-teal-700" />
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                A. Project Objectives & Building Classification
              </h2>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Primary Building Purpose
              </label>
              <input
                type="text"
                disabled={isLocked}
                value={brief.objectives.primaryPurpose}
                onChange={(e) =>
                  handleSaveBrief({
                    ...brief,
                    objectives: { ...brief.objectives, primaryPurpose: e.target.value },
                  })
                }
                className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-teal-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Building Use Type
                </label>
                <select
                  disabled={isLocked}
                  value={brief.objectives.buildingUse}
                  onChange={(e) =>
                    handleSaveBrief({
                      ...brief,
                      objectives: {
                        ...brief.objectives,
                        buildingUse: e.target.value as BuildingUseClassification,
                      },
                    })
                  }
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-teal-500"
                >
                  <option value="residential">Residential</option>
                  <option value="mixed-use">Mixed-Use</option>
                  <option value="workplace-office">Workplace / Office</option>
                  <option value="retail-commercial">Retail & Commercial</option>
                  <option value="cultural-educational">Cultural / Educational</option>
                  <option value="other">Other User-Defined</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Design Life Expectancy
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="10"
                    max="150"
                    disabled={isLocked}
                    value={brief.objectives.designLifeYears || 50}
                    onChange={(e) =>
                      handleSaveBrief({
                        ...brief,
                        objectives: { ...brief.objectives, designLifeYears: Number(e.target.value) || 50 },
                      })
                    }
                    className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-teal-500"
                  />
                  <span className="text-xs text-slate-500 shrink-0">years</span>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Intended Users & Occupants
              </label>
              <input
                type="text"
                disabled={isLocked}
                value={brief.objectives.intendedUsers}
                onChange={(e) =>
                  handleSaveBrief({
                    ...brief,
                    objectives: { ...brief.objectives, intendedUsers: e.target.value },
                  })
                }
                className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Main Activities & Daily Functions
              </label>
              <textarea
                rows={2}
                disabled={isLocked}
                value={brief.objectives.mainActivities}
                onChange={(e) =>
                  handleSaveBrief({
                    ...brief,
                    objectives: { ...brief.objectives, mainActivities: e.target.value },
                  })
                }
                className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Desired Architectural Outcomes
              </label>
              <textarea
                rows={2}
                disabled={isLocked}
                value={brief.objectives.desiredOutcomes}
                onChange={(e) =>
                  handleSaveBrief({
                    ...brief,
                    objectives: { ...brief.objectives, desiredOutcomes: e.target.value },
                  })
                }
                className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-teal-500"
              />
            </div>
          </div>

          {/* Section B: Occupancy & Usage */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <Users className="w-4 h-4 text-teal-700" />
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                B. Occupancy Profiles & Usage Patterns
              </h2>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Regular Core Occupants
                </label>
                <input
                  type="number"
                  min="1"
                  disabled={isLocked}
                  value={brief.occupancy.regularOccupants}
                  onChange={(e) =>
                    handleSaveBrief({
                      ...brief,
                      occupancy: { ...brief.occupancy, regularOccupants: Number(e.target.value) || 1 },
                    })
                  }
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Occasional Guests / Visitors
                </label>
                <input
                  type="number"
                  min="0"
                  disabled={isLocked}
                  value={brief.occupancy.occasionalVisitors}
                  onChange={(e) =>
                    handleSaveBrief({
                      ...brief,
                      occupancy: { ...brief.occupancy, occasionalVisitors: Number(e.target.value) || 0 },
                    })
                  }
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-teal-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Occupancy Schedule & Rhythm
              </label>
              <input
                type="text"
                disabled={isLocked}
                value={brief.occupancy.occupancyPattern}
                onChange={(e) =>
                  handleSaveBrief({
                    ...brief,
                    occupancy: { ...brief.occupancy, occupancyPattern: e.target.value },
                  })
                }
                className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Specific Household / User-Group Needs
              </label>
              <textarea
                rows={2}
                disabled={isLocked}
                value={brief.occupancy.userGroupNeeds}
                onChange={(e) =>
                  handleSaveBrief({
                    ...brief,
                    occupancy: { ...brief.occupancy, userGroupNeeds: e.target.value },
                  })
                }
                className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Accessibility & Mobility Considerations
              </label>
              <input
                type="text"
                disabled={isLocked}
                value={brief.occupancy.accessibilityNotes}
                onChange={(e) =>
                  handleSaveBrief({
                    ...brief,
                    occupancy: { ...brief.occupancy, accessibilityNotes: e.target.value },
                  })
                }
                className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Future Lifecycle Adaptability
              </label>
              <input
                type="text"
                disabled={isLocked}
                value={brief.occupancy.futureExpansionNeeds}
                onChange={(e) =>
                  handleSaveBrief({
                    ...brief,
                    occupancy: { ...brief.occupancy, futureExpansionNeeds: e.target.value },
                  })
                }
                className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-teal-500"
              />
            </div>
          </div>

          {/* Section C: Design Preferences */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <Sparkles className="w-4 h-4 text-teal-700" />
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                C. Design Preferences & Spatial Character
              </h2>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Spatial Character & Flow
              </label>
              <input
                type="text"
                disabled={isLocked}
                value={brief.preferences.spatialCharacter}
                onChange={(e) =>
                  handleSaveBrief({
                    ...brief,
                    preferences: { ...brief.preferences, spatialCharacter: e.target.value },
                  })
                }
                className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Indoor-Outdoor Relationship
              </label>
              <input
                type="text"
                disabled={isLocked}
                value={brief.preferences.indoorOutdoorRelationship}
                onChange={(e) =>
                  handleSaveBrief({
                    ...brief,
                    preferences: { ...brief.preferences, indoorOutdoorRelationship: e.target.value },
                  })
                }
                className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Natural Daylight Priorities
              </label>
              <input
                type="text"
                disabled={isLocked}
                value={brief.preferences.naturalLightPriorities}
                onChange={(e) =>
                  handleSaveBrief({
                    ...brief,
                    preferences: { ...brief.preferences, naturalLightPriorities: e.target.value },
                  })
                }
                className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Storage & Concealment Priorities
              </label>
              <input
                type="text"
                disabled={isLocked}
                value={brief.preferences.storagePriorities}
                onChange={(e) =>
                  handleSaveBrief({
                    ...brief,
                    preferences: { ...brief.preferences, storagePriorities: e.target.value },
                  })
                }
                className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-teal-500"
              />
            </div>
          </div>

          {/* Section D: Constraints & Unresolved Questions */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <Shield className="w-4 h-4 text-teal-700" />
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                D. Constraints & Unresolved Clarifications
              </h2>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Site Restrictions Summary
              </label>
              <input
                type="text"
                disabled={isLocked}
                value={brief.constraints.siteRestrictionsSummary}
                onChange={(e) =>
                  handleSaveBrief({
                    ...brief,
                    constraints: { ...brief.constraints, siteRestrictionsSummary: e.target.value },
                  })
                }
                className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Structural & Construction Assumptions
              </label>
              <input
                type="text"
                disabled={isLocked}
                value={brief.constraints.structuralAssumptions}
                onChange={(e) =>
                  handleSaveBrief({
                    ...brief,
                    constraints: { ...brief.constraints, structuralAssumptions: e.target.value },
                  })
                }
                className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-teal-500"
              />
            </div>

            {/* Unresolved Questions List */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  Unresolved Clarification Questions ({brief.constraints.unresolvedQuestions?.length || 0})
                </label>
              </div>

              <div className="space-y-1.5 mb-2">
                {(brief.constraints.unresolvedQuestions || []).map((q, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-2 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  >
                    <span className="text-slate-800">{q}</span>
                    <button
                      onClick={() => handleRemoveQuestion(idx)}
                      disabled={isLocked}
                      className="text-slate-400 hover:text-rose-600 disabled:opacity-40 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {!isLocked && (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Enter question requiring client or regulatory confirmation..."
                    value={newUnresolvedQuestion}
                    onChange={(e) => setNewUnresolvedQuestion(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddQuestion();
                    }}
                    className="flex-1 text-xs px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-teal-500"
                  />
                  <button
                    onClick={handleAddQuestion}
                    className="px-3 py-1.5 text-xs font-semibold bg-teal-700 text-white rounded-lg hover:bg-teal-800 transition-colors cursor-pointer"
                  >
                    Add
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 3: SPATIAL ADJACENCIES                                           */}
      {/* ==================================================================== */}
      {activeTab === 'adjacencies' && (
        <div className="space-y-6">
          {/* Add Relationship Toolbar */}
          {!isLocked && (
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
              <div className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Define Spatial Relationship Rule
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                <div className="sm:col-span-1">
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">Source Space</label>
                  <select
                    value={sourceSpaceId}
                    onChange={(e) => setSourceSpaceId(e.target.value)}
                    className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-teal-500"
                  >
                    {brief.spaces.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-1">
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">Relationship</label>
                  <select
                    value={relationType}
                    onChange={(e) => setRelationType(e.target.value as SpatialRelationshipType)}
                    className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-teal-500"
                  >
                    <option value="direct-access">Direct Access (Door)</option>
                    <option value="adjacent">Adjacent (Close Proximity)</option>
                    <option value="separated">Separated (Visual/Physical)</option>
                    <option value="acoustic-isolated">Acoustic Isolated (Soundproof)</option>
                    <option value="outdoor-connection">Outdoor Connection</option>
                    <option value="service-access">Service Delivery Access</option>
                  </select>
                </div>

                <div className="sm:col-span-1">
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">Target Space</label>
                  <select
                    value={targetSpaceId}
                    onChange={(e) => setTargetSpaceId(e.target.value)}
                    className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-teal-500"
                  >
                    {brief.spaces.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-1">
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">Priority</label>
                  <select
                    value={relationPriority}
                    onChange={(e) => setRelationPriority(e.target.value as BriefPriority)}
                    className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-teal-500"
                  >
                    <option value="mandatory">Mandatory</option>
                    <option value="high-priority">High Priority</option>
                    <option value="preferred">Preferred</option>
                  </select>
                </div>

                <div className="sm:col-span-1 flex items-end">
                  <button
                    onClick={handleAddRelationship}
                    className="w-full px-3 py-1.5 text-xs font-semibold bg-teal-700 text-white rounded-lg hover:bg-teal-800 transition-colors cursor-pointer"
                  >
                    Add Rule
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Relationships List */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
            <div className="p-3.5 bg-slate-50 border-b border-slate-200 font-bold text-xs text-slate-900 uppercase tracking-wider">
              Active Spatial Rules ({brief.relationships.length})
            </div>

            {brief.relationships.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                No spatial relationship rules specified yet. Add rules above to evaluate flow and acoustic isolation.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {brief.relationships.map((rel) => {
                  const spA = brief.spaces.find((s) => s.id === rel.sourceSpaceId);
                  const spB = brief.spaces.find((s) => s.id === rel.targetSpaceId);

                  return (
                    <div
                      key={rel.id}
                      className="p-3.5 flex items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-slate-900">{spA?.name || rel.sourceSpaceId}</span>
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                            rel.relationType === 'direct-access'
                              ? 'bg-teal-50 text-teal-800 border border-teal-200'
                              : rel.relationType === 'adjacent'
                              ? 'bg-blue-50 text-blue-800 border border-blue-200'
                              : rel.relationType === 'acoustic-isolated'
                              ? 'bg-rose-50 text-rose-800 border border-rose-200'
                              : 'bg-amber-50 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {rel.relationType.replace('-', ' ')}
                        </span>
                        <span className="font-semibold text-slate-900">{spB?.name || rel.targetSpaceId}</span>
                        {rel.notes && <span className="text-slate-400 text-[11px]">— {rel.notes}</span>}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                          {rel.priority}
                        </span>
                        {!isLocked && (
                          <button
                            onClick={() => handleDeleteRelationship(rel.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                            title="Delete relationship rule"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 4: 2D FLOOR PLAN RECONCILIATION                                  */}
      {/* ==================================================================== */}
      {activeTab === 'reconciliation' && (
        <div className="space-y-6">
          {/* Action Callout if Discrepancies exist */}
          {conflictsCount > 0 && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-xs font-bold text-rose-900 uppercase tracking-wide">
                    {conflictsCount} Unplaced Mandatory Space Requirement(s) Detected
                  </h3>
                  <p className="text-xs text-rose-700 mt-0.5">
                    Certain spaces marked as Mandatory in the brief do not currently exist on the 2D floor plan. Place these rooms or adjust brief priorities.
                  </p>
                </div>
              </div>
              <button
                onClick={() => onOpenFloorPlan(project)}
                className="px-3 py-1.5 text-xs font-semibold bg-rose-700 text-white rounded-lg hover:bg-rose-800 transition-colors shrink-0 cursor-pointer"
              >
                Open 2D Plan
              </button>
            </div>
          )}

          {/* Validation Notice Cards */}
          {notices.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Active Verification Notices ({notices.length})
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {notices.map((n) => (
                  <div
                    key={n.id}
                    className={`p-3.5 rounded-xl border text-xs space-y-1.5 ${
                      n.severity === 'conflict'
                        ? 'bg-rose-50/60 border-rose-200 text-rose-900'
                        : n.severity === 'warning'
                        ? 'bg-amber-50/60 border-amber-200 text-amber-900'
                        : 'bg-blue-50/60 border-blue-200 text-blue-900'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold">
                      {n.severity === 'conflict' ? (
                        <AlertCircle className="w-4 h-4 text-rose-600" />
                      ) : n.severity === 'warning' ? (
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                      ) : (
                        <Info className="w-4 h-4 text-blue-600" />
                      )}
                      <span>{n.title}</span>
                    </div>
                    <p className="text-[11px] leading-relaxed opacity-90">{n.message}</p>
                    <div className="text-[11px] font-semibold opacity-95 pt-1 border-t border-black/5">
                      💡 Remedy: {n.suggestedAction}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reconciliation Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
            <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="font-bold text-xs text-slate-900 uppercase tracking-wider">
                Brief Requirements vs Placed 2D Floor Plan Rooms
              </span>
              <button
                onClick={() => onOpenFloorPlan(project)}
                className="text-xs font-semibold text-teal-700 hover:text-teal-900 inline-flex items-center gap-1 cursor-pointer"
              >
                <span>Edit 2D Layout</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3.5">Brief Space</th>
                    <th className="py-2.5 px-3">Priority</th>
                    <th className="py-2.5 px-3 text-right">Target Total</th>
                    <th className="py-2.5 px-3 text-center">Placed Qty</th>
                    <th className="py-2.5 px-3 text-right">Placed Area</th>
                    <th className="py-2.5 px-3 text-right">Area Delta</th>
                    <th className="py-2.5 px-3 text-center">Variance %</th>
                    <th className="py-2.5 px-3.5 text-center">Placement Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800 font-medium">
                  {comparisons.map((c) => (
                    <tr key={c.spaceRequirementId} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-2.5 px-3.5 font-semibold text-slate-900">{c.name}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded ${
                            c.priority === 'mandatory'
                              ? 'bg-rose-50 text-rose-700'
                              : c.priority === 'high-priority'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {c.priority}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums">
                        {c.targetTotalArea} {unitAreaSuffix}
                      </td>
                      <td className="py-2.5 px-3 text-center tabular-nums">
                        {c.placedQuantity} / {c.requiredQuantity}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums font-bold">
                        {c.actualPlacedTotalArea} {unitAreaSuffix}
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right tabular-nums font-semibold ${
                          c.areaDelta < 0
                            ? 'text-rose-600'
                            : c.areaDelta > 0
                            ? 'text-teal-700'
                            : 'text-slate-500'
                        }`}
                      >
                        {c.areaDelta > 0 ? `+${c.areaDelta}` : c.areaDelta} {unitAreaSuffix}
                      </td>
                      <td
                        className={`py-2.5 px-3 text-center tabular-nums font-semibold ${
                          c.areaVariancePercent < -20
                            ? 'text-rose-600'
                            : c.areaVariancePercent > 30
                            ? 'text-amber-600'
                            : 'text-slate-600'
                        }`}
                      >
                        {c.areaVariancePercent > 0 ? `+${c.areaVariancePercent}%` : `${c.areaVariancePercent}%`}
                      </td>
                      <td className="py-2.5 px-3.5 text-center">
                        <span
                          className={`text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded ${
                            c.placementStatus === 'fully-placed'
                              ? 'bg-teal-100 text-teal-800'
                              : c.placementStatus === 'partially-placed'
                              ? 'bg-amber-100 text-amber-800'
                              : c.placementStatus === 'over-allocated'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {c.placementStatus.replace('-', ' ')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 5: GOVERNANCE, REVISIONS & SIGNOFF                                */}
      {/* ==================================================================== */}
      {activeTab === 'governance' && (
        <div className="space-y-6">
          {/* Signoff Status Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FileCheck2 className="w-5 h-5 text-teal-700" />
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Brief Approval & Scope Lock Protocol
                </h2>
              </div>
              <span className="text-xs font-semibold text-slate-500">
                Active Version: <strong>{brief.version}</strong>
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Governance Status
                </div>
                <div className="text-base font-bold text-slate-900 capitalize mt-0.5">
                  {brief.approvalStatus.replace('-', ' ')}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  {brief.approvalStatus === 'locked'
                    ? 'Baseline frozen against accidental scope creep'
                    : 'Editable draft in progress'}
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Last Formal Modification
                </div>
                <div className="text-sm font-bold text-slate-900 mt-0.5">
                  {new Date(brief.lastUpdated).toLocaleDateString()}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  {new Date(brief.lastUpdated).toLocaleTimeString()}
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Traceability Proofs
                </div>
                <div className="text-sm font-bold text-teal-800 mt-0.5">
                  Registered in Section 9
                </div>
                <button
                  onClick={() => onOpenEvidenceLedger(project)}
                  className="text-[11px] text-teal-700 hover:text-teal-900 font-semibold mt-1 inline-flex items-center gap-1 cursor-pointer"
                >
                  <span>Inspect Audit Ledger</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Record New Revision Log */}
            <div className="pt-3 border-t border-slate-100 space-y-2">
              <div className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Record New Revision Entry
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <input
                    type="text"
                    placeholder="Author name..."
                    value={revisionAuthor}
                    onChange={(e) => setRevisionAuthor(e.target.value)}
                    className="w-full text-xs px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  />
                </div>
                <div className="sm:col-span-2 flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Summary of modifications (e.g. Added study space per client call)..."
                    value={revisionNotes}
                    onChange={(e) => setRevisionNotes(e.target.value)}
                    className="flex-1 text-xs px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  />
                  <button
                    onClick={() => {
                      if (!revisionNotes.trim()) {
                        showToast('Please enter revision notes', 'error');
                        return;
                      }
                      const updated = recordBriefRevision(
                        brief,
                        revisionAuthor,
                        revisionNotes,
                        brief.approvalStatus
                      );
                      handleSaveBrief(updated, 'New brief revision recorded');
                      setRevisionNotes('');
                    }}
                    className="px-3 py-1.5 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
                  >
                    Log Revision
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Revision History Log Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
            <div className="p-3.5 bg-slate-50 border-b border-slate-200 font-bold text-xs text-slate-900 uppercase tracking-wider">
              Revision Audit History ({brief.revisions.length})
            </div>

            <div className="divide-y divide-slate-100 text-xs">
              {brief.revisions.map((rev) => (
                <div key={rev.id} className="p-3.5 flex items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">v{rev.versionNumber}.0</span>
                      <span className="text-slate-400">•</span>
                      <span className="text-slate-600 font-semibold">{rev.author}</span>
                      <span className="text-slate-400">•</span>
                      <span className="text-slate-500">{new Date(rev.timestamp).toLocaleString()}</span>
                    </div>
                    <p className="text-slate-700 mt-1">{rev.summaryOfChanges}</p>
                  </div>

                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-700 shrink-0">
                    {rev.approvalStatus.replace('-', ' ')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: LOAD ARCHITECTURAL TEMPLATE                                   */}
      {/* ==================================================================== */}
      {isTemplateModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Select Architectural Brief Template
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Populates realistic space schedules, functional priorities, and spatial relationships.
                </p>
              </div>
              <button
                onClick={() => setIsTemplateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-3 max-h-[60vh] overflow-y-auto">
              {templates.map((tmpl) => (
                <div
                  key={tmpl.id}
                  className="p-4 rounded-xl border border-slate-200 hover:border-teal-500 hover:bg-teal-50/20 transition-all cursor-pointer flex items-start justify-between gap-4"
                  onClick={() => handleLoadTemplate(tmpl.brief)}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900">{tmpl.name}</span>
                      <span className="text-[10px] uppercase font-semibold text-teal-800 bg-teal-100 px-2 py-0.5 rounded">
                        {tmpl.category}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1">{tmpl.description}</p>
                    <div className="text-[11px] text-slate-400 mt-2">
                      Includes {tmpl.brief.spaces?.length || 0} programmed spaces & {tmpl.brief.relationships?.length || 0} spatial rules
                    </div>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleLoadTemplate(tmpl.brief);
                    }}
                    className="px-3 py-1.5 text-xs font-semibold bg-teal-700 text-white rounded-lg hover:bg-teal-800 transition-colors shrink-0 cursor-pointer"
                  >
                    Apply Preset
                  </button>
                </div>
              ))}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setIsTemplateModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: ADD NEW SPACE REQUIREMENT                                     */}
      {/* ==================================================================== */}
      {isNewSpaceModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                Add Programmed Space Requirement
              </h3>
              <button
                onClick={() => setIsNewSpaceModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Space Name / Functional Label *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Master Bedroom Suite, Open Kitchen, Library"
                  value={newSpaceForm.name}
                  onChange={(e) => setNewSpaceForm({ ...newSpaceForm, name: e.target.value })}
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-teal-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
                  <select
                    value={newSpaceForm.category}
                    onChange={(e) =>
                      setNewSpaceForm({ ...newSpaceForm, category: e.target.value as SpaceCategory })
                    }
                    className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-teal-500"
                  >
                    <option value="living">Living & Gathering</option>
                    <option value="sleeping">Sleeping & Rest</option>
                    <option value="service">Kitchen & Service</option>
                    <option value="hygiene">Bathrooms & Hygiene</option>
                    <option value="work">Work & Study</option>
                    <option value="outdoor">Outdoor Amenity</option>
                    <option value="circulation">Circulation</option>
                    <option value="specialized">Specialized</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Priority</label>
                  <select
                    value={newSpaceForm.priority}
                    onChange={(e) =>
                      setNewSpaceForm({ ...newSpaceForm, priority: e.target.value as BriefPriority })
                    }
                    className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-teal-500"
                  >
                    <option value="mandatory">Mandatory (Must Satisfy)</option>
                    <option value="high-priority">High Priority</option>
                    <option value="preferred">Preferred</option>
                    <option value="optional">Optional (Nice-to-Have)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Target Area ({unitAreaSuffix})
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={newSpaceForm.targetArea}
                    onChange={(e) =>
                      setNewSpaceForm({ ...newSpaceForm, targetArea: Number(e.target.value) })
                    }
                    className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={newSpaceForm.quantity}
                    onChange={(e) =>
                      setNewSpaceForm({ ...newSpaceForm, quantity: Number(e.target.value) })
                    }
                    className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Floor Level</label>
                  <select
                    value={String(newSpaceForm.floorPreference)}
                    onChange={(e) =>
                      setNewSpaceForm({
                        ...newSpaceForm,
                        floorPreference: e.target.value === 'any' ? 'any' : Number(e.target.value),
                      })
                    }
                    className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-teal-500"
                  >
                    <option value="1">Floor 1 (Ground)</option>
                    <option value="2">Floor 2</option>
                    <option value="3">Floor 3</option>
                    <option value="any">Any Level</option>
                  </select>
                </div>
              </div>

              {/* Requirement Checkboxes */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <span className="block text-xs font-semibold text-slate-700">Special Requirements:</span>
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-700">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newSpaceForm.naturalLightRequired}
                      onChange={(e) =>
                        setNewSpaceForm({ ...newSpaceForm, naturalLightRequired: e.target.checked })
                      }
                      className="rounded text-teal-700 focus:ring-teal-500"
                    />
                    <span>Direct Natural Light</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newSpaceForm.plumbingRequired}
                      onChange={(e) =>
                        setNewSpaceForm({ ...newSpaceForm, plumbingRequired: e.target.checked })
                      }
                      className="rounded text-teal-700 focus:ring-teal-500"
                    />
                    <span>Plumbing (Wet Zone)</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newSpaceForm.acousticPrivacyRequired}
                      onChange={(e) =>
                        setNewSpaceForm({ ...newSpaceForm, acousticPrivacyRequired: e.target.checked })
                      }
                      className="rounded text-teal-700 focus:ring-teal-500"
                    />
                    <span>Acoustic Isolation</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newSpaceForm.wheelchairAccessible}
                      onChange={(e) =>
                        setNewSpaceForm({ ...newSpaceForm, wheelchairAccessible: e.target.checked })
                      }
                      className="rounded text-teal-700 focus:ring-teal-500"
                    />
                    <span>Wheelchair Accessible</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Notes & Criteria</label>
                <input
                  type="text"
                  placeholder="e.g. Garden line of sight, double vanity, quiet zone"
                  value={newSpaceForm.notes}
                  onChange={(e) => setNewSpaceForm({ ...newSpaceForm, notes: e.target.value })}
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-teal-500"
                />
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setIsNewSpaceModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateSpace}
                className="px-4 py-2 text-xs font-semibold bg-teal-700 text-white rounded-lg hover:bg-teal-800 transition-colors cursor-pointer"
              >
                Add Space
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
