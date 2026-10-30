/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useCallback } from 'react';
import { Project, FloorPlanRoom } from '../../types/project';
import {
  StructuralCoordinationData,
  StructuralReviewIssue,
  StructuralColumn,
  StructuralFramingSystem,
  StructuralIssueSeverity,
  StructuralIssueStatus,
} from '../../types/structural';
import {
  initializeStructuralCoordination,
  evaluateStructuralCoordination,
  updateStructuralIssue,
  saveStructuralColumn,
  deleteStructuralColumn,
  generateStructuralSummaryCSV,
  generateStructuralReportMarkdown,
} from '../../services/structuralService';
import {
  ArrowLeft,
  Grid,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Download,
  FileText,
  RotateCcw,
  Sliders,
  Plus,
  Trash2,
  Edit3,
  Layers,
  Building,
  Check,
  Search,
  Filter,
  Maximize2,
  Info,
  Calendar,
  UserCheck,
  Hash,
  Scale,
} from 'lucide-react';

interface StructuralCoordinationWorkspaceProps {
  project: Project;
  onUpdateProject: (updated: Project) => void;
  onBack: () => void;
  onOpenFloorPlan?: (project: Project) => void;
  onOpenEvidenceLedger?: (project: Project) => void;
  onOpenDocumentation?: (project: Project) => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const StructuralCoordinationWorkspace: React.FC<StructuralCoordinationWorkspaceProps> = ({
  project,
  onUpdateProject,
  onBack,
  onOpenFloorPlan,
  onOpenEvidenceLedger,
  onOpenDocumentation,
  showToast,
}) => {
  // Ensure structural data is initialized
  const [data, setData] = useState<StructuralCoordinationData>(() =>
    initializeStructuralCoordination(project)
  );

  const [activeTab, setActiveTab] = useState<
    'grid-model' | 'issue-register' | 'span-analysis' | 'disclosures-signoff'
  >('grid-model');

  // Filters for review register
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected column for details or editing
  const [selectedColumnId, setSelectedColumnId] = useState<string | null>(null);

  // Active floor level view for the 2D structural diagram
  const [activeFloorLevel, setActiveFloorLevel] = useState<number>(1);

  // Modal / drawer state for issue detail editing
  const [activeEditingIssue, setActiveEditingIssue] = useState<StructuralReviewIssue | null>(null);

  // Modal state for adding a column
  const [isAddColumnOpen, setIsAddColumnOpen] = useState(false);
  const [newColLabel, setNewColLabel] = useState('');
  const [newColX, setNewColX] = useState<number>(10);
  const [newColY, setNewColY] = useState<number>(10);
  const [newColWidth, setNewColWidth] = useState<number>(project.unit === 'feet' ? 1.0 : 0.3);
  const [newColDepth, setNewColDepth] = useState<number>(project.unit === 'feet' ? 1.0 : 0.3);
  const [newColMaterial, setNewColMaterial] = useState<StructuralColumn['material']>('reinforced-concrete');

  // Evaluate deterministic coordination
  const evaluation = useMemo(() => {
    return evaluateStructuralCoordination(project, data);
  }, [project, data]);

  const { issues, summary, isStale } = evaluation;

  const unitSuffix = project.unit === 'feet' ? 'ft' : 'm';
  const unitAreaSuffix = project.unit === 'feet' ? 'sq ft' : 'm²';

  // Persistence handler
  const handleSaveData = useCallback(
    (updatedData: StructuralCoordinationData, message = 'Structural coordination model saved.') => {
      setData(updatedData);
      const updatedProject: Project = {
        ...project,
        structuralCoordination: updatedData,
        updatedAt: new Date().toISOString(),
      };
      onUpdateProject(updatedProject);
      if (showToast) showToast(message, 'success');
    },
    [project, onUpdateProject, showToast]
  );

  // Re-run coordination evaluation & sync geometry
  const handleRunCoordinationCheck = useCallback(() => {
    const refreshed = evaluateStructuralCoordination(project, data);
    const updatedData: StructuralCoordinationData = {
      ...data,
      lastEvaluatedGeometryHash: project.floorPlan?.rooms
        ? evaluation.dataVersion.split('-').pop() || data.lastEvaluatedGeometryHash
        : data.lastEvaluatedGeometryHash,
      lastEvaluatedAt: new Date().toISOString(),
      isStale: false,
    };
    handleSaveData(updatedData, 'Structural coordination checks successfully refreshed!');
  }, [project, data, evaluation, handleSaveData]);

  // Framing system change
  const handleFramingSystemChange = (system: StructuralFramingSystem) => {
    const updated = {
      ...data,
      framingSystem: system,
    };
    handleSaveData(updated, `Structural framing system set to ${system.replace(/-/g, ' ')}.`);
  };

  // Span limit change
  const handleSpanLimitChange = (val: number) => {
    if (isNaN(val) || val <= 0) return;
    const updated = {
      ...data,
      maxUnsupportedSpanThreshold: val,
    };
    handleSaveData(updated, `Prescriptive span threshold updated to ${val} ${unitSuffix}.`);
  };

  // Issue update handler
  const handleSaveIssueUpdates = (
    issueId: string,
    updates: Partial<StructuralReviewIssue>
  ) => {
    const updatedData = updateStructuralIssue(data, issueId, updates);
    handleSaveData(updatedData, 'Engineering review register updated.');
    setActiveEditingIssue(null);
  };

  // Add column
  const handleAddColumn = (e: React.FormEvent) => {
    e.preventDefault();
    const colId = `col-${Date.now().toString(36)}`;
    const newCol: StructuralColumn = {
      id: colId,
      label: newColLabel.trim() || `C-${data.columns.length + 1}`,
      x: Number(newColX),
      y: Number(newColY),
      floorLevels: [activeFloorLevel],
      profile: 'rectangular',
      width: Number(newColWidth),
      depth: Number(newColDepth),
      material: newColMaterial,
      isLoadBearing: true,
      status: 'active',
      notes: 'Manually placed structural column',
    };

    const updated = saveStructuralColumn(data, newCol);
    handleSaveData(updated, `Column ${newCol.label} added.`);
    setIsAddColumnOpen(false);
    setNewColLabel('');
  };

  // Delete column
  const handleDeleteColumn = (colId: string) => {
    const col = data.columns.find((c) => c.id === colId);
    const updated = deleteStructuralColumn(data, colId);
    handleSaveData(updated, `Column ${col?.label || colId} removed.`);
    if (selectedColumnId === colId) setSelectedColumnId(null);
  };

  // Export CSV
  const handleExportCSV = () => {
    const csvContent = generateStructuralSummaryCSV(project, data);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.toLowerCase().replace(/\s+/g, '_')}_structural_coordination.csv`;
    a.click();
    URL.revokeObjectURL(url);
    if (showToast) showToast('Structural Coordination CSV downloaded.', 'info');
  };

  // Export Markdown
  const handleExportMarkdown = () => {
    const mdContent = generateStructuralReportMarkdown(project, data);
    const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.toLowerCase().replace(/\s+/g, '_')}_structural_report.md`;
    a.click();
    URL.revokeObjectURL(url);
    if (showToast) showToast('Structural Dossier Report downloaded.', 'info');
  };

  // Sign-off toggle
  const handleToggleSignOff = (signed: boolean, engineerName = '', licenseNumber = '', notes = '') => {
    const updated: StructuralCoordinationData = {
      ...data,
      engineeringSignOff: {
        isSignedOff: signed,
        engineerName: signed ? engineerName : undefined,
        licenseNumber: signed ? licenseNumber : undefined,
        jurisdiction: project.unit === 'feet' ? 'State Board of PE' : 'Statutory Building Authority',
        signedAt: signed ? new Date().toISOString() : undefined,
        stampNotes: signed ? notes : undefined,
      },
    };
    handleSaveData(
      updated,
      signed
        ? 'Professional engineering sign-off recorded!'
        : 'Sign-off status cleared.'
    );
  };

  // Filtered issues
  const filteredIssues = useMemo(() => {
    return issues.filter((iss) => {
      if (severityFilter !== 'all' && iss.severity !== severityFilter) return false;
      if (statusFilter !== 'all' && iss.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchCode = iss.issueCode.toLowerCase().includes(q);
        const matchTitle = iss.title.toLowerCase().includes(q);
        const matchDesc = iss.description.toLowerCase().includes(q);
        const matchLoc = (iss.location.roomName || '').toLowerCase().includes(q);
        if (!matchCode && !matchTitle && !matchDesc && !matchLoc) return false;
      }
      return true;
    });
  }, [issues, severityFilter, statusFilter, searchQuery]);

  const activeRooms = useMemo(() => {
    return (project.floorPlan?.rooms || []).filter(
      (r) => r.floorLevel === activeFloorLevel
    );
  }, [project.floorPlan?.rooms, activeFloorLevel]);

  const columnsOnActiveFloor = useMemo(() => {
    return (data.columns || []).filter((c) =>
      c.floorLevels.includes(activeFloorLevel)
    );
  }, [data.columns, activeFloorLevel]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Top Breadcrumb & Main Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            title="Back to Overview"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                Engineering Coordination
              </span>
              <span className="text-xs text-slate-400 font-mono">
                {project.name}
              </span>
            </div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Structural Coordination & Engineering Review Workspace
            </h1>
          </div>
        </div>

        {/* Global Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleRunCoordinationCheck}
            className="px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Re-Check Coordination</span>
          </button>
          <button
            onClick={handleExportCSV}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Export full issue register and column schedule to CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span>CSV</span>
          </button>
          <button
            onClick={handleExportMarkdown}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Download Engineering Markdown Dossier"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Report</span>
          </button>
        </div>
      </div>

      {/* Staleness / Revision Warning Banner */}
      {isStale && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start justify-between gap-3 animate-in fade-in">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-amber-900 leading-tight">
                Floor Plan Geometry Changed Since Last Structural Evaluation
              </h4>
              <p className="text-xs text-amber-700 mt-1">
                Room dimensions, partitions, or floor levels were modified in the 2D floor plan editor. Clear spans and column alignment checks may be stale.
              </p>
            </div>
          </div>
          <button
            onClick={handleRunCoordinationCheck}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold cursor-pointer shrink-0 transition-colors"
          >
            Sync & Re-Evaluate
          </button>
        </div>
      )}

      {/* Engineering Disclaimers Banner */}
      <div className="bg-slate-900 text-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-teal-400 shrink-0" />
            <span className="text-xs font-bold text-teal-300 uppercase tracking-wider">
              Preliminary Coordination Boundary Notice
            </span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed max-w-3xl">
            This workspace provides <strong>geometric coordination checks, clear span limits, and architectural-to-structural alignment</strong> only. It does <em>not</em> calculate gravity dead/live loads, seismic shear distributions, rebar details, or soil bearing foundations. All physical construction requires sealed drawings by a licensed Professional Engineer (PE/SE).
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {data.engineeringSignOff?.isSignedOff ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              PE/SE Stamped
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-semibold">
              <AlertCircle className="w-4 h-4 text-amber-400" />
              Review Pending
            </span>
          )}
        </div>
      </div>

      {/* Key Metric Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {/* Total Columns */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Structural Columns
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
            {summary.totalColumns}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 truncate">
            {data.columns.filter((c) => c.status === 'active').length} active reference posts
          </div>
        </div>

        {/* Structural Grid */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Reference Grid
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
            {data.grid.xAxes.length} × {data.grid.yAxes.length}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {data.grid.baySpacingX}{unitSuffix} × {data.grid.baySpacingY}{unitSuffix} bays
          </div>
        </div>

        {/* Max Span */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Max Clear Span
          </div>
          <div className={`text-2xl font-bold mt-1 tabular-nums ${
            summary.maxMeasuredSpan > data.maxUnsupportedSpanThreshold
              ? 'text-amber-600'
              : 'text-slate-900'
          }`}>
            {summary.maxMeasuredSpan.toFixed(1)} <span className="text-sm font-normal text-slate-500">{unitSuffix}</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 truncate" title={summary.maxSpanRoomName}>
            Threshold: {data.maxUnsupportedSpanThreshold} {unitSuffix}
          </div>
        </div>

        {/* Geometric Conflicts */}
        <div className={`rounded-xl border p-4 shadow-xs ${
          summary.issueCounts.conflict > 0
            ? 'bg-rose-50 border-rose-200'
            : 'bg-white border-slate-200'
        }`}>
          <div className={`text-[11px] font-semibold uppercase tracking-wider ${
            summary.issueCounts.conflict > 0 ? 'text-rose-700' : 'text-slate-400'
          }`}>
            Geometric Conflicts
          </div>
          <div className={`text-2xl font-bold mt-1 tabular-nums ${
            summary.issueCounts.conflict > 0 ? 'text-rose-700' : 'text-slate-900'
          }`}>
            {summary.issueCounts.conflict}
          </div>
          <div className={`text-[11px] mt-0.5 ${
            summary.issueCounts.conflict > 0 ? 'text-rose-600' : 'text-slate-500'
          }`}>
            {summary.issueCounts.conflict > 0 ? 'Direct physical clashes' : 'No clashes detected'}
          </div>
        </div>

        {/* Review Required */}
        <div className={`rounded-xl border p-4 shadow-xs ${
          summary.issueCounts.reviewRequired > 0
            ? 'bg-amber-50 border-amber-200'
            : 'bg-white border-slate-200'
        }`}>
          <div className={`text-[11px] font-semibold uppercase tracking-wider ${
            summary.issueCounts.reviewRequired > 0 ? 'text-amber-700' : 'text-slate-400'
          }`}>
            PE/SE Review Flags
          </div>
          <div className={`text-2xl font-bold mt-1 tabular-nums ${
            summary.issueCounts.reviewRequired > 0 ? 'text-amber-700' : 'text-slate-900'
          }`}>
            {summary.issueCounts.reviewRequired}
          </div>
          <div className={`text-[11px] mt-0.5 ${
            summary.issueCounts.reviewRequired > 0 ? 'text-amber-700' : 'text-slate-500'
          }`}>
            {summary.issueCounts.resolved} resolved / variances
          </div>
        </div>
      </div>

      {/* Framing System & Parameters Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <div>
            <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">
              Structural Framing System
            </label>
            <select
              value={data.framingSystem}
              onChange={(e) => handleFramingSystemChange(e.target.value as StructuralFramingSystem)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-teal-500"
            >
              <option value="reinforced-concrete-frame">Reinforced Concrete Frame</option>
              <option value="mass-timber-post-beam">Mass Timber Post & Beam</option>
              <option value="structural-steel-frame">Structural Steel Frame</option>
              <option value="light-timber-framing">Light Timber Framing (Platform)</option>
              <option value="load-bearing-masonry">Load-Bearing Reinforced Masonry</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">
              Prescriptive Max Span Threshold ({unitSuffix})
            </label>
            <input
              type="number"
              step="0.5"
              min="5"
              max="50"
              value={data.maxUnsupportedSpanThreshold}
              onChange={(e) => handleSpanLimitChange(parseFloat(e.target.value))}
              className="w-24 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-teal-500"
            />
          </div>

          <div>
            <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">
              Building Levels
            </label>
            <div className="px-3 py-1.5 bg-slate-100 rounded-lg text-xs font-semibold text-slate-700">
              {project.floors} Level{project.floors > 1 ? 's' : ''} ({project.roadFacing} Entrance)
            </div>
          </div>
        </div>

        {/* Quick Nav to Floor Plan */}
        {onOpenFloorPlan && (
          <button
            onClick={() => onOpenFloorPlan(project)}
            className="text-xs font-semibold text-teal-700 hover:text-teal-900 cursor-pointer flex items-center gap-1"
          >
            <span>Open 2D Floor Plan Editor →</span>
          </button>
        )}
      </div>

      {/* Main Workspace Navigation Tabs */}
      <div className="flex border-b border-slate-200 gap-1 bg-white p-1 rounded-xl shadow-xs">
        <button
          onClick={() => setActiveTab('grid-model')}
          className={`flex-1 py-2.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeTab === 'grid-model'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Grid className="w-4 h-4 text-teal-400" />
          <span>Interactive Structural Grid & Model</span>
        </button>

        <button
          onClick={() => setActiveTab('issue-register')}
          className={`flex-1 py-2.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeTab === 'issue-register'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          <span>Engineering Review Register ({issues.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('span-analysis')}
          className={`flex-1 py-2.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeTab === 'span-analysis'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Scale className="w-4 h-4 text-teal-400" />
          <span>Clear Span & Deflection Analysis</span>
        </button>

        <button
          onClick={() => setActiveTab('disclosures-signoff')}
          className={`flex-1 py-2.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeTab === 'disclosures-signoff'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Disclosures & PE/SE Sign-Off</span>
        </button>
      </div>

      {/* ==================================================================== */}
      {/* TAB 1: INTERACTIVE STRUCTURAL GRID & REFERENCE MODEL */}
      {/* ==================================================================== */}
      {activeTab === 'grid-model' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: 2D Spatial Layout Diagram (8 cols) */}
          <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Grid className="w-4 h-4 text-teal-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  Architectural-to-Structural Reference Plan
                </h3>
              </div>

              {/* Floor Switcher */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs font-semibold">
                {Array.from({ length: Math.max(1, project.floors) }, (_, i) => i + 1).map(
                  (fl) => (
                    <button
                      key={fl}
                      onClick={() => setActiveFloorLevel(fl)}
                      className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                        activeFloorLevel === fl
                          ? 'bg-white text-slate-900 shadow-2xs font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Floor {fl}
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Canvas / SVG Representation */}
            <div className="relative w-full aspect-4/3 bg-slate-950 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center p-4">
              {/* SVG Coordinate Space */}
              {(() => {
                const plotW = Math.max(10, project.plotWidth);
                const plotL = Math.max(10, project.plotLength);
                const viewBox = `-6 -6 ${plotW + 12} ${plotL + 12}`;

                return (
                  <svg
                    viewBox={viewBox}
                    className="w-full h-full select-none"
                    style={{ maxHeight: '520px' }}
                  >
                    <defs>
                      <pattern id="struct-dot" width="5" height="5" patternUnits="userSpaceOnUse">
                        <circle cx="2.5" cy="2.5" r="0.2" fill="#334155" />
                      </pattern>
                    </defs>

                    {/* Canvas background dot grid */}
                    <rect x="-6" y="-6" width={plotW + 12} height={plotL + 12} fill="url(#struct-dot)" />

                    {/* Plot boundary */}
                    <rect
                      x="0"
                      y="0"
                      width={plotW}
                      height={plotL}
                      fill="#0f172a"
                      stroke="#475569"
                      strokeWidth="0.3"
                      strokeDasharray="1 1"
                    />

                    {/* Structural Grid X Axes (Vertical lines) */}
                    {data.grid.xAxes.map((xAxis) => (
                      <g key={xAxis.id}>
                        <line
                          x1={xAxis.coordinate}
                          y1="-4"
                          x2={xAxis.coordinate}
                          y2={plotL + 4}
                          stroke="#0ea5e9"
                          strokeWidth="0.15"
                          strokeDasharray="0.8 0.4"
                          opacity="0.6"
                        />
                        {/* Grid bubble at top */}
                        <circle
                          cx={xAxis.coordinate}
                          cy="-4"
                          r="1.4"
                          fill="#0284c7"
                          stroke="#ffffff"
                          strokeWidth="0.2"
                        />
                        <text
                          x={xAxis.coordinate}
                          y="-3.5"
                          textAnchor="middle"
                          fill="#ffffff"
                          fontSize="1.1"
                          fontWeight="bold"
                          fontFamily="monospace"
                        >
                          {xAxis.name}
                        </text>
                      </g>
                    ))}

                    {/* Structural Grid Y Axes (Horizontal lines) */}
                    {data.grid.yAxes.map((yAxis) => (
                      <g key={yAxis.id}>
                        <line
                          x1="-4"
                          y1={yAxis.coordinate}
                          x2={plotW + 4}
                          y2={yAxis.coordinate}
                          stroke="#0ea5e9"
                          strokeWidth="0.15"
                          strokeDasharray="0.8 0.4"
                          opacity="0.6"
                        />
                        {/* Grid bubble at left */}
                        <circle
                          cx="-4"
                          cy={yAxis.coordinate}
                          r="1.4"
                          fill="#0284c7"
                          stroke="#ffffff"
                          strokeWidth="0.2"
                        />
                        <text
                          x="-4"
                          y={yAxis.coordinate + 0.4}
                          textAnchor="middle"
                          fill="#ffffff"
                          fontSize="1.1"
                          fontWeight="bold"
                          fontFamily="monospace"
                        >
                          {yAxis.name}
                        </text>
                      </g>
                    ))}

                    {/* Architectural Rooms on this floor */}
                    {activeRooms.map((room) => {
                      const isOverSpan = Math.max(room.width, room.length) > data.maxUnsupportedSpanThreshold;
                      return (
                        <g key={room.id}>
                          <rect
                            x={room.x}
                            y={room.y}
                            width={room.width}
                            height={room.length}
                            fill={isOverSpan ? 'rgba(239, 68, 68, 0.12)' : 'rgba(56, 189, 248, 0.08)'}
                            stroke={isOverSpan ? '#ef4444' : '#38bdf8'}
                            strokeWidth="0.35"
                            rx="0.3"
                          />
                          <text
                            x={room.x + room.width / 2}
                            y={room.y + room.length / 2 - 0.5}
                            textAnchor="middle"
                            fill="#e2e8f0"
                            fontSize="1.2"
                            fontWeight="600"
                          >
                            {room.name}
                          </text>
                          <text
                            x={room.x + room.width / 2}
                            y={room.y + room.length / 2 + 1.2}
                            textAnchor="middle"
                            fill="#94a3b8"
                            fontSize="0.9"
                            fontFamily="monospace"
                          >
                            {room.width.toFixed(1)} × {room.length.toFixed(1)} {unitSuffix}
                          </text>
                        </g>
                      );
                    })}

                    {/* Structural Beams */}
                    {(data.beams || []).map((bm) => (
                      <line
                        key={bm.id}
                        x1={bm.startX}
                        y1={bm.startY}
                        x2={bm.endX}
                        y2={bm.endY}
                        stroke="#f59e0b"
                        strokeWidth="0.3"
                        strokeLinecap="round"
                        opacity="0.85"
                      />
                    ))}

                    {/* Structural Columns on this floor */}
                    {columnsOnActiveFloor.map((col) => {
                      const isSelected = selectedColumnId === col.id;
                      const hasConflict = issues.some(
                        (i) =>
                          i.affectedElements.includes(col.label) &&
                          i.severity === 'conflict' &&
                          i.status !== 'resolved'
                      );
                      const hasConcern = issues.some(
                        (i) =>
                          i.affectedElements.includes(col.label) &&
                          i.severity === 'coordination-concern' &&
                          i.status !== 'resolved'
                      );

                      const fillColor = hasConflict
                        ? '#ef4444'
                        : hasConcern
                        ? '#f59e0b'
                        : '#10b981';

                      const halfW = col.width / 2;
                      const halfD = col.depth / 2;

                      return (
                        <g
                          key={col.id}
                          className="cursor-pointer transition-transform"
                          onClick={() => setSelectedColumnId(col.id)}
                        >
                          {col.profile === 'circular' ? (
                            <circle
                              cx={col.x}
                              cy={col.y}
                              r={halfW}
                              fill={fillColor}
                              stroke={isSelected ? '#ffffff' : '#0f172a'}
                              strokeWidth={isSelected ? '0.4' : '0.2'}
                            />
                          ) : (
                            <rect
                              x={col.x - halfW}
                              y={col.y - halfD}
                              width={col.width}
                              height={col.depth}
                              fill={fillColor}
                              stroke={isSelected ? '#ffffff' : '#0f172a'}
                              strokeWidth={isSelected ? '0.4' : '0.2'}
                              rx="0.1"
                            />
                          )}

                          {/* Column label tag */}
                          <text
                            x={col.x}
                            y={col.y - col.depth - 0.5}
                            textAnchor="middle"
                            fill="#ffffff"
                            fontSize="0.9"
                            fontWeight="bold"
                            fontFamily="monospace"
                          >
                            {col.label}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                );
              })()}

              {/* Diagram Legend */}
              <div className="absolute bottom-3 left-3 bg-slate-900/90 backdrop-blur-xs border border-slate-700/80 rounded-lg p-2 text-[10px] text-slate-300 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />
                  <span>Column (Clear)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" />
                  <span>Concern</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 inline-block" />
                  <span>Conflict</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-4 h-0.5 bg-amber-400 inline-block" />
                  <span>Primary Girder</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-4 h-0.5 border-t border-sky-400 border-dashed inline-block" />
                  <span>Grid Axis</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-500">
              <div>
                Displaying <strong>{activeRooms.length}</strong> room envelopes and{' '}
                <strong>{columnsOnActiveFloor.length}</strong> structural column reference markers on Floor {activeFloorLevel}.
              </div>
              <button
                onClick={() => setIsAddColumnOpen(true)}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Column</span>
              </button>
            </div>
          </div>

          {/* Right: Structural Column Properties & Grid Controls (4 cols) */}
          <div className="lg:col-span-4 space-y-5">
            {/* Column Detail Card */}
            {selectedColumnId ? (
              (() => {
                const col = data.columns.find((c) => c.id === selectedColumnId);
                if (!col) return null;
                return (
                  <div className="bg-white rounded-2xl border border-teal-200 p-5 shadow-xs space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-teal-500 inline-block" />
                        <h4 className="text-sm font-bold text-slate-900">
                          Column: {col.label}
                        </h4>
                      </div>
                      <button
                        onClick={() => setSelectedColumnId(null)}
                        className="text-xs text-slate-400 hover:text-slate-600"
                      >
                        Deselect
                      </button>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between py-1 border-b border-slate-50">
                        <span className="text-slate-500">Plan Coordinates:</span>
                        <span className="font-mono font-bold text-slate-800">
                          X: {col.x.toFixed(1)}, Y: {col.y.toFixed(1)} {unitSuffix}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-50">
                        <span className="text-slate-500">Cross-Section:</span>
                        <span className="font-semibold text-slate-800 capitalize">
                          {col.profile} ({col.width} × {col.depth} {unitSuffix})
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-50">
                        <span className="text-slate-500">Material:</span>
                        <span className="font-semibold text-slate-800 capitalize">
                          {col.material.replace(/-/g, ' ')}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-50">
                        <span className="text-slate-500">Active Levels:</span>
                        <span className="font-semibold text-slate-800">
                          Floor {col.floorLevels.join(', ')}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-50">
                        <span className="text-slate-500">Load Bearing:</span>
                        <span className="font-semibold text-emerald-700">
                          {col.isLoadBearing ? 'Yes (Primary Path)' : 'Secondary'}
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 flex items-center justify-end">
                      <button
                        onClick={() => handleDeleteColumn(col.id)}
                        className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete Column</span>
                      </button>
                    </div>
                  </div>
                );
              })()
            ) : (
              <div className="bg-slate-50 rounded-2xl border border-dashed border-slate-300 p-5 text-center text-xs text-slate-500">
                <Grid className="w-8 h-8 text-slate-400 mx-auto mb-2 opacity-60" />
                <p className="font-medium text-slate-700">No Column Selected</p>
                <p className="mt-1 text-slate-500">
                  Click any structural column marker on the plan diagram to inspect coordinates, cross-section profiles, or adjust placement.
                </p>
              </div>
            )}

            {/* Quick Grid Bay Spacing Adjuster */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <Sliders className="w-4 h-4 text-teal-700" />
                <h4 className="text-sm font-bold text-slate-900">
                  Structural Reference Grid Setup
                </h4>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">
                    Bay Spacing X ({unitSuffix})
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="8"
                    max="40"
                    value={data.grid.baySpacingX}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (val > 0) {
                        const updated = {
                          ...data,
                          grid: { ...data.grid, baySpacingX: val },
                        };
                        handleSaveData(updated, `Bay spacing X set to ${val} ${unitSuffix}.`);
                      }
                    }}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-semibold text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">
                    Bay Spacing Y ({unitSuffix})
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="8"
                    max="40"
                    value={data.grid.baySpacingY}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (val > 0) {
                        const updated = {
                          ...data,
                          grid: { ...data.grid, baySpacingY: val },
                        };
                        handleSaveData(updated, `Bay spacing Y set to ${val} ${unitSuffix}.`);
                      }
                    }}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-semibold text-slate-800"
                  />
                </div>
              </div>

              <div className="text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                Structural grid lines provide orthogonal reference datums for structural columns, perimeter walls, and MEP coordination.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 2: ENGINEERING REVIEW REGISTER */}
      {/* ==================================================================== */}
      {activeTab === 'issue-register' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Engineering Review & Coordination Register
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Itemized log of geometric collisions, unpropped cantilevers, discontinuous load paths, and prescriptive span exceedances.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
                {filteredIssues.length} of {issues.length} Issues Listed
              </span>
            </div>
          </div>

          {/* Search & Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search issue code, description, room..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-teal-500"
              />
            </div>

            {/* Severity Filter */}
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-400 font-semibold text-[10px] uppercase">
                Severity:
              </span>
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700"
              >
                <option value="all">All Severities</option>
                <option value="conflict">Conflicts (Clashes)</option>
                <option value="coordination-concern">Coordination Concerns</option>
                <option value="review-required">PE/SE Review Required</option>
                <option value="info">Informational</option>
              </select>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-400 font-semibold text-[10px] uppercase">
                Status:
              </span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700"
              >
                <option value="all">All Statuses</option>
                <option value="open">Open</option>
                <option value="under-review">Under Review</option>
                <option value="variance-accepted">Variance Accepted</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>
          </div>

          {/* Issues Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-2.5 px-3">Issue Code</th>
                  <th className="py-2.5 px-3">Severity</th>
                  <th className="py-2.5 px-3">Location</th>
                  <th className="py-2.5 px-3">Title & Summary</th>
                  <th className="py-2.5 px-3">Measured vs Threshold</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredIssues.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      No structural issues matching filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredIssues.map((iss) => {
                    const isConflict = iss.severity === 'conflict';
                    const isReviewReq = iss.severity === 'review-required';
                    const isConcern = iss.severity === 'coordination-concern';

                    const sevBadge = isConflict
                      ? 'bg-rose-100 text-rose-800 border-rose-200'
                      : isReviewReq
                      ? 'bg-amber-100 text-amber-800 border-amber-200'
                      : isConcern
                      ? 'bg-blue-100 text-blue-800 border-blue-200'
                      : 'bg-slate-100 text-slate-700 border-slate-200';

                    const statusBadge =
                      iss.status === 'resolved'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : iss.status === 'variance-accepted'
                        ? 'bg-purple-50 text-purple-800 border-purple-200'
                        : iss.status === 'under-review'
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : 'bg-slate-100 text-slate-800 border-slate-200';

                    return (
                      <tr key={iss.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-3 font-mono font-bold text-slate-800">
                          {iss.issueCode}
                        </td>
                        <td className="py-3 px-3">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase ${sevBadge}`}>
                            {iss.severity.replace('-', ' ')}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-600 font-medium">
                          {iss.location.roomName
                            ? `${iss.location.roomName} (F${iss.location.floorLevel})`
                            : `Floor ${iss.location.floorLevel}`}
                        </td>
                        <td className="py-3 px-3 max-w-sm">
                          <div className="font-bold text-slate-900 leading-snug">
                            {iss.title}
                          </div>
                          <div className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">
                            {iss.description}
                          </div>
                          {iss.reviewerNotes && (
                            <div className="mt-1 text-[10px] text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-100">
                              <strong>Reviewer Note:</strong> {iss.reviewerNotes}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 font-mono text-[11px] text-slate-700 whitespace-nowrap">
                          <div><strong>Act:</strong> {iss.measuredValue}</div>
                          <div className="text-slate-400"><strong>Lim:</strong> {iss.thresholdLimit}</div>
                        </td>
                        <td className="py-3 px-3">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border capitalize ${statusBadge}`}>
                            {iss.status.replace('-', ' ')}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <button
                            onClick={() => setActiveEditingIssue(iss)}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                          >
                            Review & Notes
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
      )}

      {/* ==================================================================== */}
      {/* TAB 3: CLEAR SPAN & DEFLECTION ANALYSIS */}
      {/* ==================================================================== */}
      {activeTab === 'span-analysis' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
          <div className="pb-3 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Room-by-Room Clear Span & Framing Evaluation
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Evaluates the unsupported clear span of every architectural room against the prescriptive limit of {data.maxUnsupportedSpanThreshold} {unitSuffix}.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700">
                Prescriptive Ceiling Limit: {data.maxUnsupportedSpanThreshold} {unitSuffix}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-2.5 px-3">Room Space</th>
                  <th className="py-2.5 px-3">Floor Level</th>
                  <th className="py-2.5 px-3">Dimensions</th>
                  <th className="py-2.5 px-3">Max Span</th>
                  <th className="py-2.5 px-3 min-w-[200px]">Span vs Limit Ratio</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Framing Recommendation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(project.floorPlan?.rooms || []).map((r) => {
                  const span = Math.max(r.width, r.length);
                  const threshold = data.maxUnsupportedSpanThreshold;
                  const ratioPercent = Math.round((span / threshold) * 100);
                  const isExceeded = span > threshold;

                  return (
                    <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-3 font-bold text-slate-900">
                        {r.name}
                      </td>
                      <td className="py-3 px-3 text-slate-600">
                        Floor {r.floorLevel}
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-600">
                        {r.width.toFixed(1)} × {r.length.toFixed(1)} {unitSuffix}
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-slate-900">
                        {span.toFixed(1)} {unitSuffix}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                ratioPercent > 125
                                  ? 'bg-rose-500'
                                  : ratioPercent > 100
                                  ? 'bg-amber-500'
                                  : 'bg-emerald-500'
                              }`}
                              style={{ width: `${Math.min(100, ratioPercent)}%` }}
                            />
                          </div>
                          <span className="font-mono text-[10px] text-slate-500 w-10 text-right">
                            {ratioPercent}%
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        {isExceeded ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                            Exceeds Limit
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            Prescriptive Pass
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-[11px] text-slate-600">
                        {isExceeded
                          ? 'Provide intermediate column along grid axis or specify deep steel girder.'
                          : 'Standard joist / slab framing without intermediate support.'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 4: DISCLOSURES & PROFESSIONAL SIGN-OFF */}
      {/* ==================================================================== */}
      {activeTab === 'disclosures-signoff' && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Statutory Boundaries Disclosures (7 cols) */}
          <div className="md:col-span-7 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <ShieldAlert className="w-5 h-5 text-teal-700" />
              <h3 className="text-base font-bold text-slate-900">
                Statutory Structural Review Boundaries & Disclosures
              </h3>
            </div>

            <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
              <p>
                Under governing building legislation (including <strong>International Building Code Chapter 16</strong>, <strong>International Residential Code Section R301</strong>, and <strong>Eurocode EN 1990/1991/1992</strong>), architectural modeling software output does not constitute statutory permit drawings without registered engineering calculations.
              </p>

              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-2">
                <h5 className="font-bold text-slate-900 text-xs uppercase tracking-wide">
                  Items Verified by This Workspace:
                </h5>
                <ul className="list-disc pl-4 space-y-1 text-slate-700">
                  <li>2D Orthogonal structural reference grid alignment and bay spacing.</li>
                  <li>Column locations relative to perimeter walls and usable floor clear-zones.</li>
                  <li>Architectural room clear spans against standard prescriptive span ceilings.</li>
                  <li>Multi-level vertical load path stack continuity.</li>
                </ul>
              </div>

              <div className="bg-rose-50 rounded-xl p-4 border border-rose-200 space-y-2">
                <h5 className="font-bold text-rose-900 text-xs uppercase tracking-wide">
                  Items Excluded (Mandatory Professional Engineer Calculations Required):
                </h5>
                <ul className="list-disc pl-4 space-y-1 text-rose-800">
                  <li>Geotechnical soil borehole analysis and foundation pile / footing sizing.</li>
                  <li>Dead, live, snow, and occupancy gravity load distribution calculations.</li>
                  <li>Seismic base shear and lateral wind drift resistance diagrams.</li>
                  <li>Reinforcing rebar callouts, structural steel member sizing, and connection detailing.</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Professional Engineer Sign-Off Block (5 cols) */}
          <div className="md:col-span-5 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <UserCheck className="w-5 h-5 text-teal-700" />
              <h3 className="text-base font-bold text-slate-900">
                Professional Review Sign-Off
              </h3>
            </div>

            {data.engineeringSignOff?.isSignedOff ? (
              <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-200 space-y-3">
                <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
                  <ShieldCheck className="w-5 h-5 text-emerald-600" />
                  <span>Licensed Review Recorded</span>
                </div>
                <div className="text-xs text-emerald-900 space-y-1">
                  <div><strong>Engineer:</strong> {data.engineeringSignOff.engineerName || 'Licensed Engineer'}</div>
                  <div><strong>License No:</strong> {data.engineeringSignOff.licenseNumber || 'Verified PE'}</div>
                  <div><strong>Timestamp:</strong> {new Date(data.engineeringSignOff.signedAt || '').toLocaleString()}</div>
                  {data.engineeringSignOff.stampNotes && (
                    <div className="pt-2 italic text-emerald-800 border-t border-emerald-200/60">
                      &ldquo;{data.engineeringSignOff.stampNotes}&rdquo;
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleToggleSignOff(false)}
                  className="w-full py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                >
                  Clear Sign-Off Record
                </button>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  const name = fd.get('engineerName') as string;
                  const lic = fd.get('licenseNumber') as string;
                  const notes = fd.get('notes') as string;
                  handleToggleSignOff(true, name, lic, notes);
                }}
                className="space-y-3 text-xs"
              >
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Reviewing Engineer Name
                  </label>
                  <input
                    name="engineerName"
                    required
                    placeholder="e.g. Marcus Vance, PE, SE"
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-teal-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Professional License / Registration Number
                  </label>
                  <input
                    name="licenseNumber"
                    required
                    placeholder="e.g. PE-94812-SE"
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-teal-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Review Notes / Exceptions
                  </label>
                  <textarea
                    name="notes"
                    rows={3}
                    placeholder="e.g. Preliminary framing review completed. Recommend deep LVL beam across primary living room span."
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-teal-500"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold transition-colors cursor-pointer shadow-xs"
                >
                  Record PE/SE Review Sign-Off
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: EDIT ISSUE & REVIEWER NOTES */}
      {/* ==================================================================== */}
      {activeEditingIssue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div>
                <span className="text-[10px] font-mono font-bold text-teal-700 uppercase">
                  {activeEditingIssue.issueCode}
                </span>
                <h3 className="text-base font-bold text-slate-900">
                  {activeEditingIssue.title}
                </h3>
              </div>
              <button
                onClick={() => setActiveEditingIssue(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ×
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-slate-600 space-y-1.5">
                <div><strong>Location:</strong> {activeEditingIssue.location.roomName || 'Enclosure'} (Floor {activeEditingIssue.location.floorLevel})</div>
                <div><strong>Description:</strong> {activeEditingIssue.description}</div>
                <div><strong>Recommendation:</strong> {activeEditingIssue.recommendation}</div>
                <div className="font-mono text-[11px] text-slate-700 pt-1 border-t border-slate-200/60">
                  Formula: {activeEditingIssue.evidenceFormula}
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Issue Status
                </label>
                <select
                  value={activeEditingIssue.status}
                  onChange={(e) =>
                    setActiveEditingIssue({
                      ...activeEditingIssue,
                      status: e.target.value as StructuralIssueStatus,
                    })
                  }
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-semibold text-slate-800"
                >
                  <option value="open">Open (Unresolved)</option>
                  <option value="under-review">Under Engineering Review</option>
                  <option value="variance-accepted">Variance Accepted (Approved by Engineer)</option>
                  <option value="resolved">Resolved</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Professional Reviewer Notes
                </label>
                <textarea
                  rows={3}
                  value={activeEditingIssue.reviewerNotes || ''}
                  onChange={(e) =>
                    setActiveEditingIssue({
                      ...activeEditingIssue,
                      reviewerNotes: e.target.value,
                    })
                  }
                  placeholder="Enter structural engineering justification, beam callout, or variance notes..."
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-teal-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Reviewer Name / PE Stamp
                </label>
                <input
                  type="text"
                  value={activeEditingIssue.reviewedBy || ''}
                  onChange={(e) =>
                    setActiveEditingIssue({
                      ...activeEditingIssue,
                      reviewedBy: e.target.value,
                    })
                  }
                  placeholder="e.g. J. Reynolds, PE"
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-teal-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setActiveEditingIssue(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  handleSaveIssueUpdates(activeEditingIssue.id, {
                    status: activeEditingIssue.status,
                    reviewerNotes: activeEditingIssue.reviewerNotes,
                    reviewedBy: activeEditingIssue.reviewedBy,
                  })
                }
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold text-xs transition-colors cursor-pointer shadow-xs"
              >
                Save Review Updates
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: ADD STRUCTURAL COLUMN */}
      {/* ==================================================================== */}
      {isAddColumnOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <form
            onSubmit={handleAddColumn}
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                Add Structural Column
              </h3>
              <button
                type="button"
                onClick={() => setIsAddColumnOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold cursor-pointer"
              >
                ×
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Column Label
                </label>
                <input
                  type="text"
                  value={newColLabel}
                  onChange={(e) => setNewColLabel(e.target.value)}
                  placeholder={`e.g. C-${data.columns.length + 1}`}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Coordinate X ({unitSuffix})
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={newColX}
                    onChange={(e) => setNewColX(parseFloat(e.target.value))}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Coordinate Y ({unitSuffix})
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={newColY}
                    onChange={(e) => setNewColY(parseFloat(e.target.value))}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Width ({unitSuffix})
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={newColWidth}
                    onChange={(e) => setNewColWidth(parseFloat(e.target.value))}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Depth ({unitSuffix})
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={newColDepth}
                    onChange={(e) => setNewColDepth(parseFloat(e.target.value))}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Structural Material
                </label>
                <select
                  value={newColMaterial}
                  onChange={(e) => setNewColMaterial(e.target.value as StructuralColumn['material'])}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-semibold"
                >
                  <option value="reinforced-concrete">Reinforced Concrete</option>
                  <option value="structural-steel">Structural Steel</option>
                  <option value="mass-timber">Mass Timber</option>
                  <option value="engineered-composite">Engineered Composite</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsAddColumnOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold text-xs cursor-pointer shadow-xs"
              >
                Add Column
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
