import React, { useState } from 'react';
import {
  DecisionTwinState,
  DependencyNode,
  DependencyNodeId,
  TwinNodeStatus,
} from '../../types/decisionTwin';
import {
  X,
  Network,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  HelpCircle,
  ArrowRight,
  RefreshCw,
  Box,
  PenTool,
  Palette,
  Layers,
  Activity,
  ShieldAlert,
  Sliders,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Info,
  GitFork,
} from 'lucide-react';

interface DecisionTwinDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  twinState: DecisionTwinState;
  onRecalculate: () => void | Promise<boolean | void>;
  onNavigateTo2D?: () => void;
  onNavigateTo3D?: () => void;
  onNavigateToDesign?: () => void;
  onOpenConstraintGraph?: () => void;
}

export const DecisionTwinDrawer: React.FC<DecisionTwinDrawerProps> = ({
  isOpen,
  onClose,
  twinState,
  onRecalculate,
  onNavigateTo2D,
  onNavigateTo3D,
  onNavigateToDesign,
  onOpenConstraintGraph,
}) => {
  const [activeTab, setActiveTab] = useState<'matrix' | 'analytics' | 'log' | 'disclaimers'>('matrix');
  const [selectedNodeId, setSelectedNodeId] = useState<DependencyNodeId>('floorplan-2d');
  const [isRecalculating, setIsRecalculating] = useState(false);

  if (!isOpen) return null;

  const handleForceRecalculate = async () => {
    if (isRecalculating) return;
    setIsRecalculating(true);
    try {
      await onRecalculate();
    } finally {
      setIsRecalculating(false);
    }
  };

  const getStatusBadge = (status: TwinNodeStatus) => {
    switch (status) {
      case 'current':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-100 text-teal-800 border border-teal-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
            Current
          </span>
        );
      case 'stale':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            Stale
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-200">
            <AlertCircle className="w-3.5 h-3.5 text-red-600" />
            Failed
          </span>
        );
      case 'not-available':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-300">
            <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
            Not Available
          </span>
        );
    }
  };

  const selectedNode = twinState.nodes[selectedNodeId];

  // Helper icons for nodes
  const getNodeIcon = (id: DependencyNodeId) => {
    switch (id) {
      case 'project-spec':
        return <Sliders className="w-4 h-4 text-indigo-600" />;
      case 'floorplan-2d':
        return <PenTool className="w-4 h-4 text-teal-600" />;
      case 'derived-metrics':
        return <Activity className="w-4 h-4 text-cyan-600" />;
      case 'model-3d':
        return <Box className="w-4 h-4 text-blue-600" />;
      case 'facade-envelope':
        return <Palette className="w-4 h-4 text-emerald-600" />;
      case 'interior-schedules':
        return <Layers className="w-4 h-4 text-purple-600" />;
      case 'structural-mep':
        return <ShieldAlert className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-xs flex justify-end animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl bg-white h-full shadow-2xl flex flex-col overflow-hidden text-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="px-6 py-5 border-b border-slate-200 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-teal-500/20 text-teal-400 border border-teal-500/30 flex items-center justify-center font-bold">
              <Network className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold tracking-tight">Architectural Decision Twin</h2>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-teal-500/20 text-teal-300 border border-teal-500/30">
                  Connected State
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Deterministic dependency graph for {twinState.projectName} ({twinState.unit})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenConstraintGraph && (
              <button
                onClick={() => {
                  onClose();
                  onOpenConstraintGraph();
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/40 transition-colors cursor-pointer"
                title="View Living Constraint Graph"
              >
                <GitFork className="w-3.5 h-3.5" />
                <span>Constraint Graph</span>
              </button>
            )}
            <button
              onClick={handleForceRecalculate}
              disabled={isRecalculating}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors cursor-pointer disabled:opacity-50"
              title="Force deterministic recalculation of all dependencies"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRecalculating ? 'animate-spin text-teal-400' : ''}`} />
              <span>{isRecalculating ? 'Syncing...' : 'Recompute Twin'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Close Decision Twin"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Global Status Banner */}
        <div className="px-6 py-3.5 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2.5">
            <span
              className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                twinState.overallStatus === 'synchronized'
                  ? 'bg-teal-500'
                  : twinState.overallStatus === 'stale-pending'
                  ? 'bg-amber-500 animate-pulse'
                  : 'bg-red-500 animate-pulse'
              }`}
            />
            <span className="font-semibold text-slate-900">
              {twinState.overallStatus === 'synchronized' && 'Model Synchronized'}
              {twinState.overallStatus === 'stale-pending' && 'Stale Downstream Dependencies'}
              {twinState.overallStatus === 'geometric-violation' && 'Geometric Violation Detected'}
              {twinState.overallStatus === 'degraded' && 'System Degraded'}
            </span>
            <span className="text-slate-400">·</span>
            <span className="text-slate-600 line-clamp-1">{twinState.overallMessage}</span>
          </div>

          <div className="text-[11px] text-slate-500 shrink-0">
            Last evaluated: <span className="font-mono font-medium text-slate-700">{twinState.lastEvaluationTimestamp}</span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center px-6 border-b border-slate-200 bg-white gap-6 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('matrix')}
            className={`py-3.5 border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'matrix'
                ? 'border-teal-600 text-teal-800'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Network className="w-4 h-4" />
            <span>Dependency Matrix</span>
          </button>

          <button
            onClick={() => setActiveTab('analytics')}
            className={`py-3.5 border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'analytics'
                ? 'border-teal-600 text-teal-800'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>Spatial Analytics & FAR</span>
          </button>

          <button
            onClick={() => setActiveTab('log')}
            className={`py-3.5 border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'log'
                ? 'border-teal-600 text-teal-800'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Sync Audit Log</span>
          </button>

          <button
            onClick={() => setActiveTab('disclaimers')}
            className={`py-3.5 border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'disclaimers'
                ? 'border-teal-600 text-teal-800'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            <span>Scope & Disclaimers</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
          {activeTab === 'matrix' && (
            <div className="space-y-6">
              {/* Architecture Dependency Flow Summary */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center justify-between">
                  <span>Connected Propagation Pipeline</span>
                  <span className="text-[11px] font-normal text-slate-400">
                    Source → Calculation → 3D Mesh & Schedules
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="p-2.5 rounded-lg border bg-slate-50 border-slate-200 flex flex-col justify-between">
                    <span className="text-[10px] text-slate-500 font-semibold uppercase">1. Origin</span>
                    <span className="font-bold text-slate-800 mt-1">Plot & Specs</span>
                    <span className="text-[10px] text-teal-700 font-medium mt-1">Immutable Root</span>
                  </div>
                  <div className="p-2.5 rounded-lg border bg-slate-50 border-slate-200 flex flex-col justify-between">
                    <span className="text-[10px] text-slate-500 font-semibold uppercase">2. Geometry</span>
                    <span className="font-bold text-slate-800 mt-1">2D Floor Plan</span>
                    <span className="text-[10px] text-slate-600 mt-1">
                      {twinState.hasUnsavedDraft ? 'Draft Divergence' : 'Authoritative'}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg border bg-slate-50 border-slate-200 flex flex-col justify-between">
                    <span className="text-[10px] text-slate-500 font-semibold uppercase">3. Analytics</span>
                    <span className="font-bold text-slate-800 mt-1">FAR & Areas</span>
                    <span className="text-[10px] text-teal-700 font-medium mt-1">Deterministic</span>
                  </div>
                  <div className="p-2.5 rounded-lg border bg-slate-50 border-slate-200 flex flex-col justify-between">
                    <span className="text-[10px] text-slate-500 font-semibold uppercase">4. Downstream</span>
                    <span className="font-bold text-slate-800 mt-1">3D Mesh & Finishes</span>
                    <span className="text-[10px] text-slate-600 mt-1">Extrusions & Finishes</span>
                  </div>
                </div>
              </div>

              {/* Node List & Details Split */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
                {/* Node List (Left) */}
                <div className="md:col-span-5 space-y-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                    Dependency Nodes
                  </div>

                  {Object.values(twinState.nodes).map((node) => {
                    const isSelected = selectedNodeId === node.id;
                    return (
                      <button
                        key={node.id}
                        onClick={() => setSelectedNodeId(node.id)}
                        className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                          isSelected
                            ? 'bg-teal-50/50 border-teal-500 shadow-xs'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="p-1.5 rounded-lg bg-slate-100 shrink-0">
                            {getNodeIcon(node.id)}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-900 truncate">
                              {node.name}
                            </div>
                            <div className="text-[10px] text-slate-500 capitalize">
                              {node.category}
                            </div>
                          </div>
                        </div>

                        <div className="shrink-0 ml-2">{getStatusBadge(node.status)}</div>
                      </button>
                    );
                  })}
                </div>

                {/* Node Inspector Card (Right) */}
                <div className="md:col-span-7">
                  {selectedNode && (
                    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-5">
                      <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-slate-100">
                            {getNodeIcon(selectedNode.id)}
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-slate-900">{selectedNode.name}</h3>
                            <span className="text-[11px] text-slate-500 capitalize">
                              Category: {selectedNode.category}
                            </span>
                          </div>
                        </div>
                        <div>{getStatusBadge(selectedNode.status)}</div>
                      </div>

                      {/* Status Explanation */}
                      <div className="text-xs text-slate-700 bg-slate-50 p-3.5 rounded-lg border border-slate-200/80 leading-relaxed">
                        <span className="font-semibold text-slate-900">Current Status: </span>
                        {selectedNode.statusMessage}
                      </div>

                      {/* Source & Dependent Relationships */}
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                            Source Inputs
                          </span>
                          {selectedNode.sourceIds.length > 0 ? (
                            <ul className="space-y-1">
                              {selectedNode.sourceIds.map((srcId) => (
                                <li key={srcId} className="flex items-center gap-1.5 text-slate-700 font-medium">
                                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                                  <span>{twinState.nodes[srcId]?.name || srcId}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <span className="text-slate-400 italic">None (Root specification)</span>
                          )}
                        </div>

                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                            Downstream Dependents
                          </span>
                          {selectedNode.dependentIds.length > 0 ? (
                            <ul className="space-y-1">
                              {selectedNode.dependentIds.map((depId) => (
                                <li key={depId} className="flex items-center gap-1.5 text-slate-700 font-medium">
                                  <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                                  <span>{twinState.nodes[depId]?.name || depId}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <span className="text-slate-400 italic">None (Terminal output)</span>
                          )}
                        </div>
                      </div>

                      {/* Metrics Table */}
                      {selectedNode.metrics && (
                        <div>
                          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                            Extracted Geometric & Attribute Data
                          </div>
                          <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                            {Object.entries(selectedNode.metrics).map(([key, val]) => (
                              <div
                                key={key}
                                className="flex items-center justify-between px-3.5 py-2 text-xs bg-white hover:bg-slate-50"
                              >
                                <span className="text-slate-500">{key}</span>
                                <span className="font-semibold text-slate-800 font-mono">{val}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Issues & Warnings */}
                      {selectedNode.issues && selectedNode.issues.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                            Diagnostic Checks & Advisories
                          </div>
                          {selectedNode.issues.map((issue) => (
                            <div
                              key={issue.id}
                              className={`p-3 rounded-lg border text-xs leading-relaxed ${
                                issue.severity === 'error'
                                  ? 'bg-red-50 border-red-200 text-red-900'
                                  : issue.severity === 'warning'
                                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                                  : 'bg-slate-50 border-slate-200 text-slate-700'
                              }`}
                            >
                              <div className="font-semibold">{issue.message}</div>
                              {issue.remedy && (
                                <div className="mt-1 text-[11px] opacity-85">
                                  <span className="font-semibold">Remedy:</span> {issue.remedy}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Direct Navigation Button for this node */}
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
                        {selectedNode.id === 'floorplan-2d' && onNavigateTo2D && (
                          <button
                            onClick={() => {
                              onNavigateTo2D();
                              onClose();
                            }}
                            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                          >
                            <PenTool className="w-3.5 h-3.5 text-teal-400" />
                            <span>Open in 2D Floor-Plan Editor</span>
                          </button>
                        )}

                        {selectedNode.id === 'model-3d' && onNavigateTo3D && (
                          <button
                            onClick={() => {
                              onNavigateTo3D();
                              onClose();
                            }}
                            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                          >
                            <Box className="w-3.5 h-3.5 text-teal-400" />
                            <span>Open in 3D Building Engine</span>
                          </button>
                        )}

                        {(selectedNode.id === 'facade-envelope' || selectedNode.id === 'interior-schedules') &&
                          onNavigateToDesign && (
                            <button
                              onClick={() => {
                                onNavigateToDesign();
                                onClose();
                              }}
                              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                            >
                              <Palette className="w-3.5 h-3.5 text-teal-400" />
                              <span>Open in Design Studio</span>
                            </button>
                          )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'analytics' && (
            <div className="space-y-6">
              {/* Key Zoning Metrics Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Plot Area
                  </div>
                  <div className="text-xl font-bold text-slate-900 mt-1">
                    {twinState.derivedMetrics.plotArea.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {twinState.unit === 'feet' ? 'sq ft' : 'm²'}
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Gross Built Area
                  </div>
                  <div className="text-xl font-bold text-teal-700 mt-1">
                    {twinState.derivedMetrics.totalBuiltArea.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {twinState.unit === 'feet' ? 'sq ft' : 'm²'}
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Ground Coverage
                  </div>
                  <div className="text-xl font-bold text-slate-900 mt-1">
                    {twinState.derivedMetrics.groundCoveragePercent}%
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Footprint / Plot Area
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Floor Area Ratio (FAR)
                  </div>
                  <div className="text-xl font-bold text-indigo-700 mt-1">
                    {twinState.derivedMetrics.floorAreaRatio}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Total Built / Plot Area
                  </div>
                </div>
              </div>

              {/* Floor-by-Floor Distribution */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">
                  Floor-by-Floor Spatial Breakdown
                </h4>
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden text-xs">
                  <div className="grid grid-cols-12 bg-slate-50 font-bold text-slate-600 px-4 py-2.5">
                    <div className="col-span-3">Level</div>
                    <div className="col-span-3">Room Count</div>
                    <div className="col-span-3">Usable Area</div>
                    <div className="col-span-3 text-right">Floor Share</div>
                  </div>
                  {Object.entries(twinState.derivedMetrics.floorBreakdown).map(([floor, data]) => {
                    const share =
                      twinState.derivedMetrics.totalBuiltArea > 0
                        ? ((data.area / twinState.derivedMetrics.totalBuiltArea) * 100).toFixed(1)
                        : 0;
                    return (
                      <div key={floor} className="grid grid-cols-12 px-4 py-3 items-center">
                        <div className="col-span-3 font-semibold text-slate-800">
                          Floor {floor}
                        </div>
                        <div className="col-span-3 text-slate-600">{data.roomCount} rooms</div>
                        <div className="col-span-3 font-mono font-medium text-slate-900">
                          {data.area} {twinState.unit === 'feet' ? 'sq ft' : 'm²'}
                        </div>
                        <div className="col-span-3 text-right font-medium text-teal-700">
                          {share}%
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Program vs Placement Audit */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Programmed Spaces vs Placed Rooms
                  </h4>
                  <span className="text-xs font-medium text-slate-500">
                    {twinState.derivedMetrics.roomCount} placed of {twinState.derivedMetrics.programmedRoomCount} programmed
                  </span>
                </div>

                {twinState.derivedMetrics.unplacedProgramRooms.length > 0 ? (
                  <div className="p-3.5 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-900">
                    <span className="font-bold">Pending Placement on 2D Plan: </span>
                    {twinState.derivedMetrics.unplacedProgramRooms.join(', ')}
                  </div>
                ) : (
                  <div className="p-3.5 bg-teal-50 rounded-lg border border-teal-200 text-xs text-teal-900 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-teal-600" />
                    <span>All requested spaces in the project brief have been accommodated on the floor plan!</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'log' && (
            <div className="space-y-4">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                Synchronization & Event Audit Trail
              </div>

              <div className="space-y-3">
                {twinState.recentEvents.map((evt) => (
                  <div
                    key={evt.id}
                    className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs flex items-start gap-3.5"
                  >
                    <div className="mt-0.5">
                      {evt.severity === 'success' && <CheckCircle2 className="w-4 h-4 text-teal-600" />}
                      {evt.severity === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-600" />}
                      {evt.severity === 'error' && <AlertCircle className="w-4 h-4 text-red-600" />}
                      {evt.severity === 'info' && <Info className="w-4 h-4 text-blue-600" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-xs font-bold text-slate-900">{evt.title}</h4>
                        <span className="text-[11px] font-mono text-slate-400">{evt.timestamp}</span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">{evt.description}</p>
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        {evt.affectedNodes.map((nId) => (
                          <span
                            key={nId}
                            className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-medium"
                          >
                            {twinState.nodes[nId]?.name || nId}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'disclaimers' && (
            <div className="space-y-5">
              <div className="bg-amber-50/70 border border-amber-200 p-5 rounded-xl space-y-3 text-amber-900">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-amber-700" />
                  <h4 className="text-sm font-bold">Architectural & Engineering Scope Disclaimers</h4>
                </div>
                <p className="text-xs leading-relaxed">
                  Plotify is an <strong>AI-powered schematic concept, zoning massing, 2D floor-planning, and 3D visualization platform</strong>.
                </p>
                <div className="text-xs space-y-2 list-disc pl-5">
                  <li>
                    <strong>Not Construction Documents:</strong> The floor plans, 3D meshes, and facade models produced are conceptual representations and must not be used for construction or contractor bidding without professional detailing.
                  </li>
                  <li>
                    <strong>Engineering Review Required:</strong> Structural load calculations, shear wall placements, foundation design, and soil mechanics require review and stamp by a licensed Professional Structural Engineer (PE/SE).
                  </li>
                  <li>
                    <strong>MEP Systems Not Modeled:</strong> Mechanical (HVAC ducting), Electrical (circuits, panels), and Plumbing (waste, supply lines) are excluded from the current dependency graph.
                  </li>
                  <li>
                    <strong>Municipal Code & Permitting:</strong> Building setbacks, maximum building heights, and egress clearances must be independently verified against local jurisdictional building codes (e.g. IBC, IRC).
                  </li>
                </div>
              </div>

              <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-3 text-xs text-slate-700 shadow-xs">
                <h4 className="font-bold text-slate-900">Deterministic Twin Guarantees</h4>
                <p className="leading-relaxed">
                  The Architectural Decision Twin guarantees that mathematical properties (areas, perimeters, floor counts, and 3D mesh extrusions) are recalculated deterministically directly from your verified 2D geometry coordinates, ensuring no phantom spaces or stale models persist.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Drawer Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-white flex items-center justify-between text-xs">
          <div className="text-slate-500 font-mono text-[11px]">
            Geometry Revision: <span className="font-bold text-slate-700">{twinState.geometryHash}</span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
};
