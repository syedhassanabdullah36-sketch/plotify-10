/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useCallback } from 'react';
import { Project, FloorPlanRoom } from '../../types/project';
import {
  MEPCoordinationData,
  MEPComponent,
  MEPClashRecord,
  MEPSystemType,
  MEPComponentSubtype,
  ClashSeverity,
  ClashStatus,
} from '../../types/mep';
import {
  initializeMEPCoordination,
  evaluateMEPClashes,
  updateMEPClashRecord,
  saveMEPComponent,
  deleteMEPComponent,
  generateMEPClashRegisterCSV,
  generateMEPReportMarkdown,
} from '../../services/mepClashService';
import {
  ArrowLeft,
  Wrench,
  Zap,
  Droplets,
  Wind,
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
  Eye,
  EyeOff,
  Activity,
  AlertOctagon,
} from 'lucide-react';

interface MEPCoordinationWorkspaceProps {
  project: Project;
  onUpdateProject: (updated: Project) => void;
  onBack: () => void;
  onOpenFloorPlan?: (project: Project) => void;
  onOpenStructural?: (project: Project) => void;
  onOpenDocumentation?: (project: Project) => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const MEPCoordinationWorkspace: React.FC<MEPCoordinationWorkspaceProps> = ({
  project,
  onUpdateProject,
  onBack,
  onOpenFloorPlan,
  onOpenStructural,
  onOpenDocumentation,
  showToast,
}) => {
  // Ensure MEP data is initialized
  const [data, setData] = useState<MEPCoordinationData>(() =>
    initializeMEPCoordination(project)
  );

  const [activeTab, setActiveTab] = useState<
    'coordination-model' | 'clash-register' | 'component-inventory' | 'assumptions-standards'
  >('coordination-model');

  // Filters for Clash Register
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [systemFilter, setSystemFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Layer visibility toggles in 2D diagram
  const [showMechanical, setShowMechanical] = useState(true);
  const [showElectrical, setShowElectrical] = useState(true);
  const [showPlumbing, setShowPlumbing] = useState(true);
  const [showStructuralCols, setShowStructuralCols] = useState(true);
  const [showArchRooms, setShowArchRooms] = useState(true);
  const [showClashHighlights, setShowClashHighlights] = useState(true);

  // Selected component or clash for details
  const [selectedClashId, setSelectedClashId] = useState<string | null>(null);
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);

  // Floor level selector
  const [activeFloorLevel, setActiveFloorLevel] = useState<number>(1);

  // Modal states
  const [activeEditingClash, setActiveEditingClash] = useState<MEPClashRecord | null>(null);
  const [isAddComponentOpen, setIsAddComponentOpen] = useState(false);

  // Form states for adding component
  const [newCompName, setNewCompName] = useState('');
  const [newCompSystem, setNewCompSystem] = useState<MEPSystemType>('mechanical');
  const [newCompSubtype, setNewCompSubtype] = useState<MEPComponentSubtype>('supply-air-duct');
  const [newCompStartX, setNewCompStartX] = useState<number>(4);
  const [newCompStartY, setNewCompStartY] = useState<number>(4);
  const [newCompStartZ, setNewCompStartZ] = useState<number>(8.5);
  const [newCompEndX, setNewCompEndX] = useState<number>(18);
  const [newCompEndY, setNewCompEndY] = useState<number>(4);
  const [newCompEndZ, setNewCompEndZ] = useState<number>(8.5);
  const [newCompWidth, setNewCompWidth] = useState<number>(project.unit === 'feet' ? 1.5 : 0.45);
  const [newCompHeight, setNewCompHeight] = useState<number>(project.unit === 'feet' ? 1.0 : 0.3);

  // Deterministic evaluation
  const evaluation = useMemo(() => {
    return evaluateMEPClashes(project, data);
  }, [project, data]);

  const { clashes, summary, isStale } = evaluation;

  const unitSuffix = project.unit === 'feet' ? 'ft' : 'm';

  // Persistence handler
  const handleSaveData = useCallback(
    (updatedData: MEPCoordinationData, message = 'MEP coordination model saved.') => {
      setData(updatedData);
      const updatedProject: Project = {
        ...project,
        mepCoordination: updatedData,
        updatedAt: new Date().toISOString(),
      };
      onUpdateProject(updatedProject);
      if (showToast) {
        showToast(message, 'success');
      }
    },
    [project, onUpdateProject, showToast]
  );

  // Re-sync with geometry
  const handleReevaluate = () => {
    const updated = evaluateMEPClashes(project, data);
    handleSaveData(
      {
        ...data,
        clashes: updated.clashes,
        summary: updated.summary,
        lastEvaluatedAt: new Date().toISOString(),
      },
      'MEP clashes successfully re-evaluated against latest architectural geometry.'
    );
  };

  // Clash review update
  const handleUpdateClash = (
    clashId: string,
    updates: {
      status?: ClashStatus;
      reviewerNotes?: string;
      reviewedBy?: string;
    }
  ) => {
    const updatedData = updateMEPClashRecord(data, clashId, updates);
    handleSaveData(updatedData, `Clash ${clashId} review status updated.`);
    setActiveEditingClash(null);
  };

  // Add component handler
  const handleCreateComponent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompName.trim()) return;

    const newComp: MEPComponent = {
      id: `mep-${newCompSystem.slice(0, 3)}-custom-${Date.now()}`,
      name: newCompName.trim(),
      system: newCompSystem,
      subtype: newCompSubtype,
      floorLevel: activeFloorLevel,
      routeSegments: [
        {
          id: `seg-${Date.now()}`,
          startX: Number(newCompStartX),
          startY: Number(newCompStartY),
          startZ: Number(newCompStartZ),
          endX: Number(newCompEndX),
          endY: Number(newCompEndY),
          endZ: Number(newCompEndZ),
          width: Number(newCompWidth),
          height: Number(newCompHeight),
        },
      ],
      clearanceRequirement: project.unit === 'feet' ? 0.5 : 0.15,
      clearanceRequired: {
        horizontal: project.unit === 'feet' ? 0.5 : 0.15,
        vertical: project.unit === 'feet' ? 0.5 : 0.15,
      },
      source: 'user-defined',
      status: 'active',
      updatedAt: new Date().toISOString(),
    };

    const updatedData = saveMEPComponent(data, newComp);
    handleSaveData(updatedData, `MEP component "${newComp.name}" added successfully.`);
    setIsAddComponentOpen(false);
    setNewCompName('');
  };

  const handleDeleteComponent = (compId: string) => {
    if (confirm('Are you sure you want to remove this MEP component from the coordination model?')) {
      const updatedData = deleteMEPComponent(data, compId);
      handleSaveData(updatedData, 'MEP component removed.');
    }
  };

  // CSV download
  const handleDownloadCSV = () => {
    const csv = generateMEPClashRegisterCSV(project, data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.toLowerCase().replace(/\s+/g, '-')}-mep-clash-register.csv`;
    a.click();
    URL.revokeObjectURL(url);
    if (showToast) showToast('MEP clash register exported to CSV.', 'info');
  };

  // Markdown download
  const handleDownloadMarkdown = () => {
    const md = generateMEPReportMarkdown(project, data);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.toLowerCase().replace(/\s+/g, '-')}-mep-coordination-report.md`;
    a.click();
    URL.revokeObjectURL(url);
    if (showToast) showToast('MEP coordination report exported to Markdown.', 'info');
  };

  // Filtered clashes
  const filteredClashes = useMemo(() => {
    return clashes.filter((c) => {
      if (severityFilter !== 'all' && c.severity !== severityFilter) return false;
      if (systemFilter !== 'all' && c.primarySystem !== systemFilter) return false;
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesCode = c.clashCode.toLowerCase().includes(q);
        const matchesTitle = c.title.toLowerCase().includes(q);
        const matchesComp = c.primaryComponentName.toLowerCase().includes(q);
        const matchesInt = c.intersectingElementName.toLowerCase().includes(q);
        if (!matchesCode && !matchesTitle && !matchesComp && !matchesInt) return false;
      }
      return true;
    });
  }, [clashes, severityFilter, systemFilter, statusFilter, searchQuery]);

  // Diagram scaling math
  const diagramScale = useMemo(() => {
    const svgWidth = 700;
    const svgHeight = 480;
    const padding = 50;

    const pWidth = Math.max(10, project.plotWidth);
    const pLength = Math.max(10, project.plotLength);

    const availableW = svgWidth - padding * 2;
    const availableH = svgHeight - padding * 2;

    const scaleX = availableW / pWidth;
    const scaleY = availableH / pLength;
    const scale = Math.min(scaleX, scaleY);

    const offsetX = padding + (availableW - pWidth * scale) / 2;
    const offsetY = padding + (availableH - pLength * scale) / 2;

    return { scale, offsetX, offsetY, svgWidth, svgHeight };
  }, [project.plotWidth, project.plotLength]);

  const roomsOnActiveFloor = useMemo(() => {
    return (project.floorPlan?.rooms || []).filter(
      (r) => r.floorLevel === activeFloorLevel
    );
  }, [project.floorPlan, activeFloorLevel]);

  const columnsOnActiveFloor = useMemo(() => {
    return (project.structuralCoordination?.columns || []).filter(
      (col) => !col.floorLevels || col.floorLevels.includes(activeFloorLevel)
    );
  }, [project.structuralCoordination, activeFloorLevel]);

  const componentsOnActiveFloor = useMemo(() => {
    return (data.components || []).filter(
      (c) => c.floorLevel === activeFloorLevel
    );
  }, [data.components, activeFloorLevel]);

  const clashesOnActiveFloor = useMemo(() => {
    return clashes.filter(
      (c) => c.location.floorLevel === activeFloorLevel
    );
  }, [clashes, activeFloorLevel]);

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-16">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
            title="Back to Project Overview"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-teal-50 border border-teal-200 text-teal-800">
                <Wrench className="w-4 h-4 text-teal-700" />
              </span>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                MEP Coordination & Clash Detection
              </h1>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                Deterministic 3D/2D Interference Engine
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Cross-trade spatial clearance analysis for Mechanical (HVAC), Electrical, and Plumbing routes vs. structural framing & rooms.
            </p>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {isStale && (
            <button
              onClick={handleReevaluate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white rounded-lg shadow-xs transition-colors cursor-pointer animate-pulse"
              title="Architectural geometry updated. Re-evaluate spatial intersections."
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Re-Evaluate Clashes (Stale)</span>
            </button>
          )}

          <button
            onClick={handleDownloadCSV}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg shadow-2xs transition-colors cursor-pointer"
            title="Export Clash Register to CSV"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Clash CSV</span>
          </button>

          <button
            onClick={handleDownloadMarkdown}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg shadow-2xs transition-colors cursor-pointer"
            title="Export MEP Technical Report to Markdown"
          >
            <FileText className="w-3.5 h-3.5 text-slate-500" />
            <span>Report MD</span>
          </button>

          {onOpenStructural && (
            <button
              onClick={() => onOpenStructural(project)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-teal-50 hover:bg-teal-100 text-teal-900 border border-teal-200 rounded-lg shadow-2xs transition-colors cursor-pointer"
            >
              <Building className="w-3.5 h-3.5 text-teal-700" />
              <span>Structural Grid</span>
            </button>
          )}
        </div>
      </div>

      {/* Engineering Boundaries Notice Banner */}
      <div className="bg-slate-900 text-slate-100 p-3.5 rounded-xl text-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-start gap-2.5">
          <Info className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <span className="font-semibold text-white">Engineering Coordination Boundary: </span>
            This engine calculates deterministic spatial intersections, clearance buffers, and working envelopes.
            It does <strong className="text-teal-300">not</strong> replace stamped MEP engineering drawings, hydraulic head-loss sizing, or electrical short-circuit calculations.
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-slate-800 text-teal-400 border border-slate-700 rounded">
            NEC 110.26 / IMC / IPC Assessed
          </span>
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-1">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Total Modeled Elements
          </span>
          <div className="text-xl font-bold text-slate-900 tabular-nums">
            {summary.totalComponents}
          </div>
          <span className="text-[10px] text-slate-400 block truncate">
            {summary.componentsBySystem.mechanical}M · {summary.componentsBySystem.electrical}E · {summary.componentsBySystem.plumbing}P
          </span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-1">
          <span className="text-[11px] font-semibold text-rose-600 uppercase tracking-wider block flex items-center gap-1">
            <AlertOctagon className="w-3.5 h-3.5 text-rose-600" />
            Hard Clashes
          </span>
          <div className="text-xl font-bold text-rose-700 tabular-nums">
            {summary.clashCounts.hardClash}
          </div>
          <span className="text-[10px] text-rose-500 block">
            Solid physical intersections
          </span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-1">
          <span className="text-[11px] font-semibold text-amber-600 uppercase tracking-wider block flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            Clearance Violations
          </span>
          <div className="text-xl font-bold text-amber-700 tabular-nums">
            {summary.clashCounts.clearanceViolation}
          </div>
          <span className="text-[10px] text-amber-600 block">
            Working envelope breached
          </span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-1">
          <span className="text-[11px] font-semibold text-blue-600 uppercase tracking-wider block flex items-center gap-1">
            <Activity className="w-3.5 h-3.5 text-blue-600" />
            Potential Conflicts
          </span>
          <div className="text-xl font-bold text-blue-700 tabular-nums">
            {summary.clashCounts.potentialConflict}
          </div>
          <span className="text-[10px] text-blue-500 block">
            Ceiling / boundary proximity
          </span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-1">
          <span className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wider block flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Resolved / Accepted
          </span>
          <div className="text-xl font-bold text-emerald-700 tabular-nums">
            {summary.clashCounts.resolved}
          </div>
          <span className="text-[10px] text-emerald-600 block">
            Variance documented
          </span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-1">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Current Floor
          </span>
          <div className="text-xl font-bold text-slate-900 tabular-nums flex items-center justify-between">
            <span>F{activeFloorLevel}</span>
            <div className="flex items-center gap-1 text-xs">
              {Array.from({ length: project.floors || 1 }, (_, i) => i + 1).map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => setActiveFloorLevel(lvl)}
                  className={`w-6 h-6 rounded flex items-center justify-center font-bold text-xs transition-colors cursor-pointer ${
                    activeFloorLevel === lvl
                      ? 'bg-slate-900 text-teal-400'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>
          <span className="text-[10px] text-slate-400 block truncate">
            {componentsOnActiveFloor.length} elements · {clashesOnActiveFloor.length} issues
          </span>
        </div>
      </div>

      {/* Workspace Main Navigation Tabs */}
      <div className="flex border-b border-slate-200 gap-6 text-sm font-semibold">
        <button
          onClick={() => setActiveTab('coordination-model')}
          className={`pb-3 border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'coordination-model'
              ? 'border-teal-700 text-teal-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Spatial Overlay & 2D Diagram</span>
        </button>

        <button
          onClick={() => setActiveTab('clash-register')}
          className={`pb-3 border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'clash-register'
              ? 'border-teal-700 text-teal-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <AlertOctagon className="w-4 h-4" />
          <span>Clash Register</span>
          {clashes.length > 0 && (
            <span
              className={`px-1.5 py-0.2 rounded-full text-xs tabular-nums ${
                summary.clashCounts.hardClash > 0
                  ? 'bg-rose-100 text-rose-800 font-bold'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              {clashes.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('component-inventory')}
          className={`pb-3 border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'component-inventory'
              ? 'border-teal-700 text-teal-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Wrench className="w-4 h-4" />
          <span>MEP Inventory & Modeler</span>
          <span className="px-1.5 py-0.2 rounded-full text-xs bg-slate-100 text-slate-700 tabular-nums">
            {data.components.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('assumptions-standards')}
          className={`pb-3 border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'assumptions-standards'
              ? 'border-teal-700 text-teal-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Scale className="w-4 h-4" />
          <span>Clearance Standards & Notes</span>
        </button>
      </div>

      {/* TAB 1: SPATIAL OVERLAY & 2D DIAGRAM */}
      {activeTab === 'coordination-model' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
          {/* Main Visualizer SVG Canvas (3 Cols) */}
          <div className="lg:col-span-3 bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-4">
            {/* Diagram Controls Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-500 uppercase text-[10px] tracking-wider">
                  Layers:
                </span>

                <button
                  onClick={() => setShowMechanical(!showMechanical)}
                  className={`px-2.5 py-1 rounded-md border font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                    showMechanical
                      ? 'bg-sky-50 text-sky-800 border-sky-300'
                      : 'bg-slate-50 text-slate-400 border-slate-200'
                  }`}
                >
                  <Wind className="w-3.5 h-3.5 text-sky-600" />
                  <span>HVAC / Mechanical</span>
                </button>

                <button
                  onClick={() => setShowElectrical(!showElectrical)}
                  className={`px-2.5 py-1 rounded-md border font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                    showElectrical
                      ? 'bg-amber-50 text-amber-800 border-amber-300'
                      : 'bg-slate-50 text-slate-400 border-slate-200'
                  }`}
                >
                  <Zap className="w-3.5 h-3.5 text-amber-600" />
                  <span>Electrical / Trays</span>
                </button>

                <button
                  onClick={() => setShowPlumbing(!showPlumbing)}
                  className={`px-2.5 py-1 rounded-md border font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                    showPlumbing
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                      : 'bg-slate-50 text-slate-400 border-slate-200'
                  }`}
                >
                  <Droplets className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Plumbing / Sanitary</span>
                </button>

                <button
                  onClick={() => setShowStructuralCols(!showStructuralCols)}
                  className={`px-2.5 py-1 rounded-md border font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                    showStructuralCols
                      ? 'bg-slate-100 text-slate-800 border-slate-300'
                      : 'bg-slate-50 text-slate-400 border-slate-200'
                  }`}
                >
                  <Building className="w-3 h-3 text-slate-600" />
                  <span>Columns</span>
                </button>

                <button
                  onClick={() => setShowArchRooms(!showArchRooms)}
                  className={`px-2.5 py-1 rounded-md border font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                    showArchRooms
                      ? 'bg-slate-100 text-slate-800 border-slate-300'
                      : 'bg-slate-50 text-slate-400 border-slate-200'
                  }`}
                >
                  <Layers className="w-3 h-3 text-slate-600" />
                  <span>Rooms</span>
                </button>

                <button
                  onClick={() => setShowClashHighlights(!showClashHighlights)}
                  className={`px-2.5 py-1 rounded-md border font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                    showClashHighlights
                      ? 'bg-rose-50 text-rose-800 border-rose-300'
                      : 'bg-slate-50 text-slate-400 border-slate-200'
                  }`}
                >
                  <AlertOctagon className="w-3.5 h-3.5 text-rose-600" />
                  <span>Clashes</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-500 font-mono">
                  Plot: {project.plotWidth}×{project.plotLength} {unitSuffix}
                </span>
              </div>
            </div>

            {/* SVG Diagram Canvas */}
            <div className="relative bg-slate-950 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center p-2 min-h-[480px]">
              <svg
                width={diagramScale.svgWidth}
                height={diagramScale.svgHeight}
                viewBox={`0 0 ${diagramScale.svgWidth} ${diagramScale.svgHeight}`}
                className="select-none"
              >
                <defs>
                  {/* Subtle Grid Pattern */}
                  <pattern
                    id="mep-grid"
                    width={diagramScale.scale * (project.unit === 'feet' ? 5 : 2)}
                    height={diagramScale.scale * (project.unit === 'feet' ? 5 : 2)}
                    patternUnits="userSpaceOnUse"
                  >
                    <path
                      d={`M ${diagramScale.scale * (project.unit === 'feet' ? 5 : 2)} 0 L 0 0 0 ${
                        diagramScale.scale * (project.unit === 'feet' ? 5 : 2)
                      }`}
                      fill="none"
                      stroke="#1e293b"
                      strokeWidth="0.5"
                    />
                  </pattern>

                  {/* Electrical Working Clearance Hatch */}
                  <pattern
                    id="clearance-hatch"
                    width="6"
                    height="6"
                    patternTransform="rotate(45 0 0)"
                    patternUnits="userSpaceOnUse"
                  >
                    <line x1="0" y1="0" x2="0" y2="6" stroke="#f59e0b" strokeWidth="1" strokeOpacity="0.4" />
                  </pattern>
                </defs>

                {/* Background Grid */}
                <rect width="100%" height="100%" fill="#090d16" />
                <rect width="100%" height="100%" fill="url(#mep-grid)" />

                {/* Plot Boundary */}
                <rect
                  x={diagramScale.offsetX}
                  y={diagramScale.offsetY}
                  width={project.plotWidth * diagramScale.scale}
                  height={project.plotLength * diagramScale.scale}
                  fill="none"
                  stroke="#334155"
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                />

                {/* 1. ARCHITECTURAL ROOM FOOTPRINTS */}
                {showArchRooms &&
                  roomsOnActiveFloor.map((room) => {
                    const rx = diagramScale.offsetX + room.x * diagramScale.scale;
                    const ry = diagramScale.offsetY + room.y * diagramScale.scale;
                    const rw = room.width * diagramScale.scale;
                    const rl = room.length * diagramScale.scale;

                    return (
                      <g key={room.id} opacity={0.65}>
                        <rect
                          x={rx}
                          y={ry}
                          width={rw}
                          height={rl}
                          fill="#1e293b"
                          fillOpacity="0.4"
                          stroke="#475569"
                          strokeWidth="1"
                        />
                        <text
                          x={rx + 6}
                          y={ry + 14}
                          fill="#94a3b8"
                          fontSize="9"
                          fontFamily="sans-serif"
                          fontWeight="600"
                        >
                          {room.name}
                        </text>
                      </g>
                    );
                  })}

                {/* 2. STRUCTURAL COLUMNS */}
                {showStructuralCols &&
                  columnsOnActiveFloor.map((col) => {
                    const cx = diagramScale.offsetX + col.x * diagramScale.scale;
                    const cy = diagramScale.offsetY + col.y * diagramScale.scale;
                    const cw = col.width * diagramScale.scale;
                    const cd = col.depth * diagramScale.scale;

                    return (
                      <g key={col.id}>
                        <rect
                          x={cx - cw / 2}
                          y={cy - cd / 2}
                          width={cw}
                          height={cd}
                          fill="#475569"
                          stroke="#94a3b8"
                          strokeWidth="1"
                        />
                        <text
                          x={cx + cw / 2 + 2}
                          y={cy + 3}
                          fill="#cbd5e1"
                          fontSize="8"
                          fontFamily="monospace"
                        >
                          {col.label}
                        </text>
                      </g>
                    );
                  })}

                {/* 3. MEP ROUTE SEGMENTS & EQUIPMENT */}
                {componentsOnActiveFloor.map((comp) => {
                  if (comp.system === 'mechanical' && !showMechanical) return null;
                  if (comp.system === 'electrical' && !showElectrical) return null;
                  if (comp.system === 'plumbing' && !showPlumbing) return null;

                  const isSelected = selectedComponentId === comp.id;
                  const strokeColor =
                    comp.system === 'mechanical'
                      ? '#38bdf8' // Cyan
                      : comp.system === 'electrical'
                      ? '#fbbf24' // Amber
                      : '#34d399'; // Emerald

                  return (
                    <g
                      key={comp.id}
                      onClick={() => setSelectedComponentId(comp.id)}
                      className="cursor-pointer"
                    >
                      {/* Equipment Location / Footprint */}
                      {comp.location && (
                        <g>
                          {/* Electrical panel working space buffer */}
                          {comp.subtype === 'main-distribution-panel' && (
                            <rect
                              x={diagramScale.offsetX + (comp.location.x - 1.5) * diagramScale.scale}
                              y={diagramScale.offsetY + (comp.location.y) * diagramScale.scale}
                              width={3.0 * diagramScale.scale}
                              height={3.0 * diagramScale.scale}
                              fill="url(#clearance-hatch)"
                              stroke="#f59e0b"
                              strokeWidth="1"
                              strokeDasharray="2 2"
                            />
                          )}

                          <rect
                            x={
                              diagramScale.offsetX +
                              (comp.location.x - (comp.dimensions?.width || 1) / 2) *
                                diagramScale.scale
                            }
                            y={
                              diagramScale.offsetY +
                              (comp.location.y - (comp.dimensions?.length || 1) / 2) *
                                diagramScale.scale
                            }
                            width={(comp.dimensions?.width || 1.5) * diagramScale.scale}
                            height={(comp.dimensions?.length || 1.5) * diagramScale.scale}
                            fill={strokeColor}
                            fillOpacity="0.3"
                            stroke={strokeColor}
                            strokeWidth={isSelected ? 3 : 1.5}
                            rx="2"
                          />
                          <text
                            x={diagramScale.offsetX + comp.location.x * diagramScale.scale}
                            y={diagramScale.offsetY + (comp.location.y - 1.5) * diagramScale.scale}
                            fill={strokeColor}
                            fontSize="9"
                            fontFamily="monospace"
                            fontWeight="bold"
                            textAnchor="middle"
                          >
                            {comp.name.split(' ')[0]}
                          </text>
                        </g>
                      )}

                      {/* Linear Route Segments */}
                      {comp.routeSegments?.map((seg) => {
                        const sx = diagramScale.offsetX + seg.startX * diagramScale.scale;
                        const sy = diagramScale.offsetY + seg.startY * diagramScale.scale;
                        const ex = diagramScale.offsetX + seg.endX * diagramScale.scale;
                        const ey = diagramScale.offsetY + seg.endY * diagramScale.scale;
                        const strokeW = Math.max(
                          2,
                          (seg.width || seg.diameter || 0.5) * diagramScale.scale
                        );

                        return (
                          <g key={seg.id}>
                            {/* Outer clearance boundary halo */}
                            <line
                              x1={sx}
                              y1={sy}
                              x2={ex}
                              y2={ey}
                              stroke={strokeColor}
                              strokeWidth={strokeW + 6}
                              strokeOpacity="0.15"
                              strokeLinecap="round"
                            />
                            {/* Primary duct/tray/pipe line */}
                            <line
                              x1={sx}
                              y1={sy}
                              x2={ex}
                              y2={ey}
                              stroke={strokeColor}
                              strokeWidth={strokeW}
                              strokeLinecap="round"
                            />
                          </g>
                        );
                      })}
                    </g>
                  );
                })}

                {/* 4. CLASH HIGHLIGHT MARKERS */}
                {showClashHighlights &&
                  clashesOnActiveFloor.map((clash) => {
                    const cx = diagramScale.offsetX + clash.location.x * diagramScale.scale;
                    const cy = diagramScale.offsetY + clash.location.y * diagramScale.scale;
                    const isSelected = selectedClashId === clash.id;

                    const markerColor =
                      clash.severity === 'hard-clash'
                        ? '#f43f5e' // Rose Red
                        : clash.severity === 'clearance-violation'
                        ? '#f59e0b' // Amber
                        : '#38bdf8'; // Sky

                    return (
                      <g
                        key={clash.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedClashId(clash.id);
                          setActiveEditingClash(clash);
                        }}
                        className="cursor-pointer group"
                      >
                        {/* Pulse Ring */}
                        <circle
                          cx={cx}
                          cy={cy}
                          r={isSelected ? 16 : 10}
                          fill={markerColor}
                          fillOpacity="0.25"
                          className="animate-ping origin-center"
                        />
                        <circle
                          cx={cx}
                          cy={cy}
                          r={isSelected ? 10 : 7}
                          fill={markerColor}
                          stroke="#ffffff"
                          strokeWidth="1.5"
                        />
                        <text
                          x={cx + 10}
                          y={cy + 4}
                          fill="#ffffff"
                          fontSize="9"
                          fontFamily="monospace"
                          fontWeight="bold"
                          filter="drop-shadow(0px 1px 2px rgba(0,0,0,0.8))"
                        >
                          {clash.clashCode}
                        </text>
                      </g>
                    );
                  })}
              </svg>

              {/* Legend overlay in bottom corner */}
              <div className="absolute bottom-3 left-3 bg-slate-900/90 backdrop-blur-xs p-2.5 rounded-lg border border-slate-800 text-[11px] text-slate-300 space-y-1.5 shadow-md">
                <div className="font-semibold text-slate-400 uppercase text-[9px] tracking-wider mb-1">
                  Color Convention
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-1.5 rounded-sm bg-sky-400" />
                  <span>Mechanical / HVAC Duct</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-1.5 rounded-sm bg-amber-400" />
                  <span>Electrical / Cable Tray</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-1.5 rounded-sm bg-emerald-400" />
                  <span>Plumbing / Sanitary Stack</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-rose-300" />
                  <span>Geometric Clash / Conflict</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Inspector & Selection Panel (1 Col) */}
          <div className="space-y-4">
            {/* Quick Component Adder Trigger */}
            <button
              onClick={() => setIsAddComponentOpen(true)}
              className="w-full py-2.5 px-4 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Add Custom MEP Route / Unit</span>
            </button>

            {/* Selected Clash Card if any */}
            {selectedClashId && (() => {
              const clash = clashes.find((c) => c.id === selectedClashId);
              if (!clash) return null;

              return (
                <div className="bg-white rounded-xl border border-rose-200 p-4 shadow-xs space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] font-mono font-bold text-rose-600 block">
                        {clash.clashCode}
                      </span>
                      <h4 className="text-xs font-bold text-slate-900 leading-tight">
                        {clash.title}
                      </h4>
                    </div>
                    <span
                      className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${
                        clash.severity === 'hard-clash'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {clash.severity.replace(/-/g, ' ')}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed">
                    {clash.description}
                  </p>

                  <div className="space-y-1.5 text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <div className="flex justify-between">
                      <span className="text-slate-500">System:</span>
                      <span className="font-semibold text-slate-800 capitalize">
                        {clash.primarySystem}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Intersecting:</span>
                      <span className="font-semibold text-slate-800 truncate max-w-[140px]">
                        {clash.intersectingElementName}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Coordinates:</span>
                      <span className="font-mono text-slate-800">
                        ({clash.location.x.toFixed(1)}, {clash.location.y.toFixed(1)}, {clash.location.z.toFixed(1)})
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Measured Overlap:</span>
                      <span className="font-semibold text-rose-700">
                        {clash.measuredOverlap}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Status:</span>
                      <span className="font-bold uppercase text-slate-800">
                        {clash.status.replace(/-/g, ' ')}
                      </span>
                    </div>
                  </div>

                  <div className="text-xs text-slate-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                    <strong className="block text-amber-900 text-[11px] mb-0.5">
                      Recommendation:
                    </strong>
                    {clash.recommendation}
                  </div>

                  <button
                    onClick={() => setActiveEditingClash(clash)}
                    className="w-full py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                  >
                    Review & Update Status →
                  </button>
                </div>
              );
            })()}

            {/* Selected Component Card if any */}
            {selectedComponentId && (() => {
              const comp = data.components.find((c) => c.id === selectedComponentId);
              if (!comp) return null;

              return (
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] font-mono text-slate-400 block">
                        {comp.id}
                      </span>
                      <h4 className="text-xs font-bold text-slate-900">
                        {comp.name}
                      </h4>
                    </div>
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 bg-slate-100 text-slate-800 rounded">
                      {comp.system}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Subtype:</span>
                      <span className="font-semibold text-slate-800">
                        {comp.subtype.replace(/-/g, ' ')}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Floor Level:</span>
                      <span className="font-semibold text-slate-800">
                        Floor {comp.floorLevel}
                      </span>
                    </div>
                    {comp.routeSegments && comp.routeSegments[0] && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Elevation (Z):</span>
                          <span className="font-mono text-slate-800">
                            {comp.routeSegments[0].startZ} {unitSuffix}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Dimensions:</span>
                          <span className="font-mono text-slate-800">
                            {comp.routeSegments[0].width || 1}×{comp.routeSegments[0].height || 1} {unitSuffix}
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDeleteComponent(comp.id)}
                      className="w-full py-1.5 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-lg text-xs font-medium cursor-pointer transition-colors"
                    >
                      Remove Component
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Quick Coordination Summary Card */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-2.5">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-teal-700" />
                <span>Interference Invariants</span>
              </h4>
              <ul className="text-xs text-slate-600 space-y-1.5">
                <li className="flex items-start gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-1.5 shrink-0" />
                  <span>Column penetration: Beams/columns must not clip primary supply air trunks.</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-1.5 shrink-0" />
                  <span>Cross-Trade: Ducts and plumbing pipes require min. {project.unit === 'feet' ? '0.2 ft' : '0.06 m'} vertical clearance.</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-1.5 shrink-0" />
                  <span>NEC 110.26: 3.0 ft deep by width clear zone in front of electrical main panels.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CLASH REGISTER TABLE */}
      {activeTab === 'clash-register' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden space-y-4 p-4">
          {/* Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
            <div className="flex flex-wrap items-center gap-3">
              {/* Search input */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter by code, element..."
                  className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-teal-600 w-52"
                />
              </div>

              {/* Severity Filter */}
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="py-1.5 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 font-medium focus:outline-teal-600"
              >
                <option value="all">All Severities</option>
                <option value="hard-clash">Hard Clash (Solid Intersection)</option>
                <option value="clearance-violation">Clearance Violation</option>
                <option value="potential-conflict">Potential Conflict</option>
                <option value="unassessed">Unassessed</option>
              </select>

              {/* System Filter */}
              <select
                value={systemFilter}
                onChange={(e) => setSystemFilter(e.target.value)}
                className="py-1.5 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 font-medium focus:outline-teal-600"
              >
                <option value="all">All Systems</option>
                <option value="mechanical">Mechanical (HVAC)</option>
                <option value="electrical">Electrical</option>
                <option value="plumbing">Plumbing</option>
              </select>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="py-1.5 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 font-medium focus:outline-teal-600"
              >
                <option value="all">All Statuses</option>
                <option value="open">Open</option>
                <option value="under-review">Under Review</option>
                <option value="resolved">Resolved</option>
                <option value="variance-accepted">Variance Accepted</option>
              </select>
            </div>

            <div className="text-xs text-slate-500 font-medium">
              Showing <strong className="text-slate-800">{filteredClashes.length}</strong> of{' '}
              {clashes.length} issues
            </div>
          </div>

          {/* Table */}
          {filteredClashes.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
              <h3 className="text-sm font-bold text-slate-800">No Clashes Matching Filter</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                No active MEP collisions match your selected filters. All evaluated trades satisfy spatial clearances.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px] tracking-wider">
                    <th className="py-2.5 px-3">Code</th>
                    <th className="py-2.5 px-3">Severity</th>
                    <th className="py-2.5 px-3">Trade / System</th>
                    <th className="py-2.5 px-3">Primary Element</th>
                    <th className="py-2.5 px-3">Interfering Element</th>
                    <th className="py-2.5 px-3">Location</th>
                    <th className="py-2.5 px-3">Overlap / Clearance</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredClashes.map((c) => {
                    const sevStyle =
                      c.severity === 'hard-clash'
                        ? 'bg-rose-50 text-rose-800 border-rose-200'
                        : c.severity === 'clearance-violation'
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : 'bg-blue-50 text-blue-800 border-blue-200';

                    const statStyle =
                      c.status === 'resolved'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : c.status === 'variance-accepted'
                        ? 'bg-purple-50 text-purple-800 border-purple-200'
                        : c.status === 'under-review'
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : 'bg-slate-100 text-slate-700 border-slate-200';

                    return (
                      <tr key={c.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-3 font-mono font-bold text-slate-900">
                          {c.clashCode}
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${sevStyle}`}
                          >
                            {c.severity.replace(/-/g, ' ')}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <span className="font-semibold text-slate-800 capitalize">
                            {c.primarySystem}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-800 font-medium max-w-[160px] truncate">
                          {c.primaryComponentName}
                        </td>
                        <td className="py-3 px-3 text-slate-600 max-w-[160px] truncate">
                          {c.intersectingElementName}
                          <span className="block text-[10px] text-slate-400 capitalize">
                            {c.intersectingElementType}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-600">
                          F{c.location.floorLevel} ({c.location.x.toFixed(1)}, {c.location.y.toFixed(1)})
                        </td>
                        <td className="py-3 px-3">
                          <span className="font-semibold text-slate-800">
                            {c.measuredOverlap}
                          </span>
                          <span className="block text-[10px] text-slate-400">
                            Req: {c.clearanceThreshold}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${statStyle}`}
                          >
                            {c.status.replace(/-/g, ' ')}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <button
                            onClick={() => setActiveEditingClash(c)}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded font-semibold text-xs transition-colors cursor-pointer"
                          >
                            Review
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: MEP INVENTORY & MODELER */}
      {activeTab === 'component-inventory' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">
              MEP Elements & Route Segments ({data.components.length})
            </h3>
            <button
              onClick={() => setIsAddComponentOpen(true)}
              className="py-1.5 px-3 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Component</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.components.map((comp) => {
              const sysColor =
                comp.system === 'mechanical'
                  ? 'border-sky-200 bg-sky-50/20'
                  : comp.system === 'electrical'
                  ? 'border-amber-200 bg-amber-50/20'
                  : 'border-emerald-200 bg-emerald-50/20';

              const icon =
                comp.system === 'mechanical' ? (
                  <Wind className="w-4 h-4 text-sky-600" />
                ) : comp.system === 'electrical' ? (
                  <Zap className="w-4 h-4 text-amber-600" />
                ) : (
                  <Droplets className="w-4 h-4 text-emerald-600" />
                );

              return (
                <div
                  key={comp.id}
                  className={`bg-white rounded-xl border p-4 shadow-xs space-y-3 ${sysColor}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className="p-1.5 rounded-lg bg-white border border-slate-200 shadow-2xs">
                        {icon}
                      </span>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900">
                          {comp.name}
                        </h4>
                        <span className="text-[10px] text-slate-500 uppercase font-mono">
                          {comp.subtype.replace(/-/g, ' ')}
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700">
                      Floor {comp.floorLevel}
                    </span>
                  </div>

                  {comp.location && (
                    <div className="text-xs bg-white/80 p-2 rounded-lg border border-slate-200 text-slate-600">
                      <span className="font-semibold text-slate-800 block text-[11px]">
                        Equipment Location:
                      </span>
                      ({comp.location.x.toFixed(1)}, {comp.location.y.toFixed(1)}) · Elevation {comp.location.z.toFixed(1)} {unitSuffix}
                    </div>
                  )}

                  {comp.routeSegments && comp.routeSegments.length > 0 && (
                    <div className="text-xs bg-white/80 p-2 rounded-lg border border-slate-200 text-slate-600 space-y-1">
                      <span className="font-semibold text-slate-800 block text-[11px]">
                        Route Geometry:
                      </span>
                      {comp.routeSegments.map((seg, idx) => (
                        <div key={seg.id || idx} className="font-mono text-[11px] text-slate-700">
                          ({seg.startX.toFixed(1)}, {seg.startY.toFixed(1)}) → ({seg.endX.toFixed(1)}, {seg.endY.toFixed(1)})
                          <span className="block text-slate-500 text-[10px]">
                            Z: {seg.startZ.toFixed(1)} {unitSuffix} | Size: {seg.width || 1}×{seg.height || 1} {unitSuffix}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                    <span className="text-[11px] text-slate-500">
                      Clearance: {comp.clearanceRequired?.horizontal || 0.3} {unitSuffix}
                    </span>
                    <button
                      onClick={() => handleDeleteComponent(comp.id)}
                      className="text-rose-600 hover:text-rose-800 text-xs font-semibold cursor-pointer"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 4: CLEARANCE STANDARDS & STATUTORY NOTES */}
      {activeTab === 'assumptions-standards' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-6">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              MEP Spatial Clearance Standards & Coordination Disclosures
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Deterministic interference parameters derived from model codes (NEC, IMC, IPC) and standard BIM coordination protocols.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-amber-600" />
                  <span>NEC 110.26 Working Space Clearance</span>
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Electrical distribution panels require a clear rectangular envelope of at least{' '}
                  <strong>{project.unit === 'feet' ? '3.0 ft' : '0.9 m'} depth</strong> in the direction of access,
                  extending from the floor to a height of {project.unit === 'feet' ? '6.5 ft' : '2.0 m'}. No architectural walls or mechanical piping may intrude.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Wind className="w-4 h-4 text-sky-600" />
                  <span>IMC Ductwork & Penetration Rules</span>
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  HVAC supply ducts must not penetrate structural columns. Where passing beneath floor joists or beams,
                  a minimum vertical head clearance of <strong>{project.unit === 'feet' ? '7.0 ft' : '2.1 m'}</strong> is enforced for habitable corridors.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Droplets className="w-4 h-4 text-emerald-600" />
                  <span>IPC Gravity Drainage Slope</span>
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Sanitary soil stacks require continuous vertical drops and minimum 1/4 inch per foot (2%) slope for horizontal runs.
                  Water pipes must maintain electrical isolation and prevent thermal bridging with HVAC return plenums.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-900 text-slate-100 space-y-2">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Scale className="w-4 h-4 text-teal-400" />
                  <span>Mandatory Professional Disclaimer</span>
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Clash reports generated by Plotify are advisory preliminary coordination models.
                  All final penetrations, sleeves, dampers, and hanger supports must be coordinated with licensed Structural and MEP engineers of record prior to fabrication.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CLASH REVIEW MODAL */}
      {activeEditingClash && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div>
                <span className="text-xs font-mono font-bold text-rose-600">
                  {activeEditingClash.clashCode}
                </span>
                <h3 className="text-base font-bold text-slate-900">
                  {activeEditingClash.title}
                </h3>
              </div>
              <button
                onClick={() => setActiveEditingClash(null)}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg space-y-1 text-slate-700">
                <div className="flex justify-between">
                  <span className="text-slate-500">Category:</span>
                  <span className="font-semibold capitalize">{activeEditingClash.category}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Elements:</span>
                  <span className="font-semibold truncate max-w-[220px]">
                    {activeEditingClash.primaryComponentName} × {activeEditingClash.intersectingElementName}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Measured:</span>
                  <span className="font-semibold text-rose-700">{activeEditingClash.measuredOverlap}</span>
                </div>
              </div>

              {/* Status Selector */}
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Coordination Resolution Status:
                </label>
                <select
                  value={activeEditingClash.status}
                  onChange={(e) =>
                    setActiveEditingClash({
                      ...activeEditingClash,
                      status: e.target.value as ClashStatus,
                    })
                  }
                  className="w-full py-2 px-3 bg-white border border-slate-300 rounded-lg text-xs font-medium focus:outline-teal-600"
                >
                  <option value="open">Open (Unresolved Conflict)</option>
                  <option value="under-review">Under Review with Engineering</option>
                  <option value="resolved">Resolved (Geometry Adjusted)</option>
                  <option value="variance-accepted">Variance Accepted (Field Sleeve Approved)</option>
                </select>
              </div>

              {/* Reviewer Notes */}
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Engineering Reviewer Notes:
                </label>
                <textarea
                  rows={3}
                  value={activeEditingClash.reviewerNotes || ''}
                  onChange={(e) =>
                    setActiveEditingClash({
                      ...activeEditingClash,
                      reviewerNotes: e.target.value,
                    })
                  }
                  placeholder="Record trade coordination meeting decisions, reroute instructions, or sleeve dimensions..."
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs focus:outline-teal-600"
                />
              </div>

              {/* Reviewer Name */}
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Reviewed By (Lead MEP Engineer / Coordinator):
                </label>
                <input
                  type="text"
                  value={activeEditingClash.reviewedBy || ''}
                  onChange={(e) =>
                    setActiveEditingClash({
                      ...activeEditingClash,
                      reviewedBy: e.target.value,
                    })
                  }
                  placeholder="e.g. S. Miller, PE (Mechanical Lead)"
                  className="w-full py-2 px-3 bg-white border border-slate-300 rounded-lg text-xs focus:outline-teal-600"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setActiveEditingClash(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  handleUpdateClash(activeEditingClash.id, {
                    status: activeEditingClash.status,
                    reviewerNotes: activeEditingClash.reviewerNotes,
                    reviewedBy: activeEditingClash.reviewedBy,
                  })
                }
                className="px-4 py-2 text-xs font-semibold bg-teal-700 hover:bg-teal-800 text-white rounded-lg transition-colors cursor-pointer shadow-xs"
              >
                Save Resolution
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD MEP COMPONENT MODAL */}
      {isAddComponentOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <form
            onSubmit={handleCreateComponent}
            className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Add MEP Component / Route
                </h3>
                <p className="text-xs text-slate-500">
                  Model a linear duct, tray, or pipe segment on Floor {activeFloorLevel}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddComponentOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Component / Run Label:
                </label>
                <input
                  type="text"
                  required
                  value={newCompName}
                  onChange={(e) => setNewCompName(e.target.value)}
                  placeholder="e.g. South Branch Return Duct"
                  className="w-full py-2 px-3 bg-white border border-slate-300 rounded-lg text-xs focus:outline-teal-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">System:</label>
                  <select
                    value={newCompSystem}
                    onChange={(e) => setNewCompSystem(e.target.value as MEPSystemType)}
                    className="w-full py-2 px-3 bg-white border border-slate-300 rounded-lg text-xs focus:outline-teal-600"
                  >
                    <option value="mechanical">Mechanical (HVAC)</option>
                    <option value="electrical">Electrical</option>
                    <option value="plumbing">Plumbing</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Subtype:</label>
                  <select
                    value={newCompSubtype}
                    onChange={(e) => setNewCompSubtype(e.target.value as MEPComponentSubtype)}
                    className="w-full py-2 px-3 bg-white border border-slate-300 rounded-lg text-xs focus:outline-teal-600"
                  >
                    <option value="supply-air-duct">Supply Air Duct</option>
                    <option value="return-air-duct">Return Air Duct</option>
                    <option value="cable-tray">Cable Tray</option>
                    <option value="conduit-run">Conduit Run</option>
                    <option value="sanitary-soil-pipe">Sanitary Soil Pipe</option>
                    <option value="domestic-cold-water">Domestic Cold Water</option>
                  </select>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                <span className="font-semibold text-slate-800 block text-[11px]">
                  Linear Route Coordinates ({unitSuffix}):
                </span>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-500 block">Start X</label>
                    <input
                      type="number"
                      step="0.5"
                      value={newCompStartX}
                      onChange={(e) => setNewCompStartX(Number(e.target.value))}
                      className="w-full p-1.5 bg-white border border-slate-300 rounded text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block">Start Y</label>
                    <input
                      type="number"
                      step="0.5"
                      value={newCompStartY}
                      onChange={(e) => setNewCompStartY(Number(e.target.value))}
                      className="w-full p-1.5 bg-white border border-slate-300 rounded text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block">Elevation Z</label>
                    <input
                      type="number"
                      step="0.5"
                      value={newCompStartZ}
                      onChange={(e) => setNewCompStartZ(Number(e.target.value))}
                      className="w-full p-1.5 bg-white border border-slate-300 rounded text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-500 block">End X</label>
                    <input
                      type="number"
                      step="0.5"
                      value={newCompEndX}
                      onChange={(e) => setNewCompEndX(Number(e.target.value))}
                      className="w-full p-1.5 bg-white border border-slate-300 rounded text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block">End Y</label>
                    <input
                      type="number"
                      step="0.5"
                      value={newCompEndY}
                      onChange={(e) => setNewCompEndY(Number(e.target.value))}
                      className="w-full p-1.5 bg-white border border-slate-300 rounded text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block">End Z</label>
                    <input
                      type="number"
                      step="0.5"
                      value={newCompEndZ}
                      onChange={(e) => setNewCompEndZ(Number(e.target.value))}
                      className="w-full p-1.5 bg-white border border-slate-300 rounded text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <label className="text-[10px] text-slate-500 block">Width ({unitSuffix})</label>
                    <input
                      type="number"
                      step="0.1"
                      value={newCompWidth}
                      onChange={(e) => setNewCompWidth(Number(e.target.value))}
                      className="w-full p-1.5 bg-white border border-slate-300 rounded text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block">Height ({unitSuffix})</label>
                    <input
                      type="number"
                      step="0.1"
                      value={newCompHeight}
                      onChange={(e) => setNewCompHeight(Number(e.target.value))}
                      className="w-full p-1.5 bg-white border border-slate-300 rounded text-xs"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsAddComponentOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold bg-teal-700 hover:bg-teal-800 text-white rounded-lg transition-colors cursor-pointer shadow-xs"
              >
                Add Route to Model
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
