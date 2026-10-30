import React, { useState, useMemo } from 'react';
import {
  X,
  GitFork,
  CheckCircle2,
  AlertCircle,
  Clock,
  HelpCircle,
  Search,
  ArrowRight,
  RotateCcw,
  Maximize2,
  Layers,
  Building,
  Coins,
  ShieldCheck,
  Compass,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import {
  ConstraintCategory,
  ConstraintGraphState,
  ConstraintNode,
  ConstraintStatus,
} from '../../types/constraintGraph';
import { Project } from '../../types/project';

interface ConstraintGraphDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  graphState: ConstraintGraphState;
  project: Project;
  onNavigateFloorPlan: () => void;
  onNavigateEditProject: () => void;
  onNavigate3DViewer: () => void;
  onOpenDecisionTwin?: () => void;
  onSelectRoom?: (roomId: string) => void;
  onReevaluate?: () => void | Promise<boolean | void>;
}

const CATEGORY_LABELS: Record<ConstraintCategory, string> = {
  'plot-envelope': 'Plot Envelope',
  'room-geometry': 'Room Geometry',
  'floor-program': 'Multi-Floor Program',
  'program-requirements': 'Brief Requirements',
  '2d-3d-dependency': '2D-to-3D Sync',
  'budget-alignment': 'Budget Feasibility',
  'regulatory-compliance': 'Building Regulations',
  'structural-coordination': 'Structural Coordination',
  'mep-coordination': 'MEP Clash Coordination',
  'project-units': 'Measurement Units',
};

export const ConstraintGraphDrawer: React.FC<ConstraintGraphDrawerProps> = ({
  isOpen,
  onClose,
  graphState,
  project,
  onNavigateFloorPlan,
  onNavigateEditProject,
  onNavigate3DViewer,
  onOpenDecisionTwin,
  onSelectRoom,
  onReevaluate,
}) => {
  const [statusFilter, setStatusFilter] = useState<'all' | ConstraintStatus>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | ConstraintCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'matrix' | 'graph-view'>('matrix');
  const [isReevaluating, setIsReevaluating] = useState(false);

  // Filtered constraints
  const filteredConstraints = useMemo(() => {
    return graphState.constraints.filter((c) => {
      const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
      const matchesCategory = categoryFilter === 'all' || c.category === categoryFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        c.title.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.statusReason.toLowerCase().includes(q) ||
        c.affectedElements.some((e) => e.toLowerCase().includes(q));

      return matchesStatus && matchesCategory && matchesSearch;
    });
  }, [graphState.constraints, statusFilter, categoryFilter, searchQuery]);

  if (!isOpen) return null;

  const { summary } = graphState;

  const handleReevaluateClick = async () => {
    if (!onReevaluate || isReevaluating) return;
    setIsReevaluating(true);
    try {
      await onReevaluate();
    } finally {
      setIsReevaluating(false);
    }
  };

  const handleAction = (node: ConstraintNode) => {
    if (!node.recommendation) return;
    onClose();
    switch (node.recommendation.actionType) {
      case 'navigate-floor-plan':
        onNavigateFloorPlan();
        if (node.recommendation.targetRoomId && onSelectRoom) {
          onSelectRoom(node.recommendation.targetRoomId);
        }
        break;
      case 'navigate-edit-project':
        onNavigateEditProject();
        break;
      case 'navigate-3d-viewer':
        onNavigate3DViewer();
        break;
      case 'select-room':
        onNavigateFloorPlan();
        if (node.recommendation.targetRoomId && onSelectRoom) {
          onSelectRoom(node.recommendation.targetRoomId);
        }
        break;
      default:
        onNavigateFloorPlan();
        break;
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="constraint-drawer-title"
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="w-full max-w-3xl bg-white h-full shadow-2xl flex flex-col border-l border-slate-200 overflow-hidden animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="p-6 border-b border-slate-200 bg-slate-900 text-white shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-teal-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Compass className="w-3.5 h-3.5" />
                  Plotify · AI-Powered Architectural Intelligence
                </span>
                <span className="text-slate-600">·</span>
                <span className="text-[11px] text-slate-400 font-medium">Living Constraint Graph</span>
              </div>
              <h2 id="constraint-drawer-title" className="text-xl font-bold tracking-tight text-white">
                Architectural Constraint Relationships
              </h2>
              <p className="text-xs text-slate-300 leading-relaxed max-w-xl">
                Continuous deterministic evaluation of project brief requirements, plot parcel boundaries, room geometry invariants, and 2D-to-3D synchronization states.
              </p>
            </div>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Close Living Constraint Graph"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Quick Scorecard KPI Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 mt-5">
            <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700/60">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                Total Checks
              </div>
              <div className="text-lg font-bold text-white tabular-nums mt-0.5">
                {summary.total}
              </div>
            </div>

            <button
              onClick={() => setStatusFilter(statusFilter === 'pass' ? 'all' : 'pass')}
              className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                statusFilter === 'pass'
                  ? 'bg-emerald-950/80 border-emerald-500 text-emerald-200 ring-1 ring-emerald-500'
                  : 'bg-slate-800/80 border-slate-700/60 text-emerald-400 hover:bg-slate-800'
              }`}
            >
              <div className="text-[10px] uppercase tracking-wider font-semibold flex items-center justify-between">
                <span>Passing</span>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="text-lg font-bold text-emerald-300 tabular-nums mt-0.5">
                {summary.passing}
              </div>
            </button>

            <button
              onClick={() => setStatusFilter(statusFilter === 'conflict' ? 'all' : 'conflict')}
              className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                statusFilter === 'conflict'
                  ? 'bg-rose-950/80 border-rose-500 text-rose-200 ring-1 ring-rose-500'
                  : summary.conflicts > 0
                  ? 'bg-rose-950/40 border-rose-800 text-rose-400 hover:bg-rose-950/60'
                  : 'bg-slate-800/80 border-slate-700/60 text-slate-400 hover:bg-slate-800'
              }`}
            >
              <div className="text-[10px] uppercase tracking-wider font-semibold flex items-center justify-between">
                <span>Conflicts</span>
                <AlertCircle className={`w-3.5 h-3.5 ${summary.conflicts > 0 ? 'text-rose-400' : 'text-slate-500'}`} />
              </div>
              <div className={`text-lg font-bold tabular-nums mt-0.5 ${summary.conflicts > 0 ? 'text-rose-300' : 'text-slate-400'}`}>
                {summary.conflicts}
              </div>
            </button>

            <button
              onClick={() => setStatusFilter(statusFilter === 'pending' ? 'all' : 'pending')}
              className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                statusFilter === 'pending'
                  ? 'bg-amber-950/80 border-amber-500 text-amber-200 ring-1 ring-amber-500'
                  : summary.pending > 0
                  ? 'bg-amber-950/40 border-amber-800 text-amber-400 hover:bg-amber-950/60'
                  : 'bg-slate-800/80 border-slate-700/60 text-slate-400 hover:bg-slate-800'
              }`}
            >
              <div className="text-[10px] uppercase tracking-wider font-semibold flex items-center justify-between">
                <span>Pending</span>
                <Clock className={`w-3.5 h-3.5 ${summary.pending > 0 ? 'text-amber-400' : 'text-slate-500'}`} />
              </div>
              <div className={`text-lg font-bold tabular-nums mt-0.5 ${summary.pending > 0 ? 'text-amber-300' : 'text-slate-400'}`}>
                {summary.pending}
              </div>
            </button>

            <button
              onClick={() => setStatusFilter(statusFilter === 'not-assessed' ? 'all' : 'not-assessed')}
              className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                statusFilter === 'not-assessed'
                  ? 'bg-slate-700 border-slate-400 text-slate-200 ring-1 ring-slate-400'
                  : 'bg-slate-800/80 border-slate-700/60 text-slate-400 hover:bg-slate-800'
              }`}
            >
              <div className="text-[10px] uppercase tracking-wider font-semibold flex items-center justify-between">
                <span>Not Assessed</span>
                <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
              </div>
              <div className="text-lg font-bold text-slate-300 tabular-nums mt-0.5">
                {summary.notAssessed}
              </div>
            </button>
          </div>
        </div>

        {/* View Switcher & Action Toolbar */}
        <div className="px-6 py-3 bg-slate-100 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">Project:</span>
            <span className="px-2 py-0.5 rounded-md bg-white border border-slate-300 font-bold text-slate-900">
              {project.name}
            </span>
            <span className="text-slate-400">·</span>
            <span className="text-slate-500 font-mono text-[11px] truncate max-w-xs">
              Revision: {graphState.dataVersion.slice(-18)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {onOpenDecisionTwin && (
              <button
                onClick={() => {
                  onClose();
                  onOpenDecisionTwin();
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg font-medium transition-colors cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5 text-teal-600" />
                <span>Decision Twin & FAR</span>
              </button>
            )}

            {onReevaluate && (
              <button
                onClick={handleReevaluateClick}
                disabled={isReevaluating}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg font-medium transition-colors cursor-pointer disabled:opacity-50"
                title="Re-evaluate constraint graph from current project data"
              >
                <RotateCcw className={`w-3.5 h-3.5 text-slate-500 ${isReevaluating ? 'animate-spin' : ''}`} />
                <span>{isReevaluating ? 'Re-evaluating...' : 'Re-evaluate'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Search & Category Filter Bar */}
        <div className="p-4 border-b border-slate-200 bg-white space-y-3 shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search constraints by title, room name, or rule..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as any)}
              className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-700 font-medium"
            >
              <option value="all">All Categories ({graphState.constraints.length})</option>
              {Object.entries(CATEGORY_LABELS).map(([cat, label]) => {
                const count = graphState.constraints.filter((c) => c.category === cat).length;
                return (
                  <option key={cat} value={cat}>
                    {label} ({count})
                  </option>
                );
              })}
            </select>
          </div>

          {/* Interactive tabs */}
          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={() => setActiveTab('matrix')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                activeTab === 'matrix'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Constraint Inspector ({filteredConstraints.length})
            </button>
            <button
              onClick={() => setActiveTab('graph-view')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                activeTab === 'graph-view'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Visual Dependency Topology
            </button>
          </div>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50">
          {activeTab === 'graph-view' ? (
            /* Visual Dependency Topology Flow */
            <div className="space-y-6">
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <GitFork className="w-4 h-4 text-teal-700" />
                    <h3 className="text-sm font-bold text-slate-900">
                      Plotify Living Constraint Graph Topology
                    </h3>
                  </div>
                  <span className="text-xs text-slate-500 font-medium">Deterministic Graph Engine</span>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">
                  Every node represents an architectural requirement or invariant. Downstream edges continuously propagate geometric changes and evaluate boundaries, floor capacities, room programs, and 3D sync.
                </p>

                {/* Graph Diagram Nodes */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-2">
                  {/* Node 1 */}
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                    <div className="text-[10px] uppercase font-bold text-slate-500 flex items-center justify-between">
                      <span>1. Brief & Parcel</span>
                      <Building className="w-3.5 h-3.5 text-teal-700" />
                    </div>
                    <div className="text-xs font-bold text-slate-900">{project.name}</div>
                    <div className="text-[11px] text-slate-500">
                      {project.plotWidth} × {project.plotLength} {project.unit} · {project.floors} Floors
                    </div>
                    <div className="pt-2 border-t border-slate-200/80 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Boundary Root Node</span>
                    </div>
                  </div>

                  {/* Node 2 */}
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                    <div className="text-[10px] uppercase font-bold text-slate-500 flex items-center justify-between">
                      <span>2. 2D Spatial Layout</span>
                      <Maximize2 className="w-3.5 h-3.5 text-cyan-700" />
                    </div>
                    <div className="text-xs font-bold text-slate-900">
                      {project.floorPlan?.rooms?.length || 0} Placed Rooms
                    </div>
                    <div className="text-[11px] text-slate-500">
                      AABB bounds, collision matrix, area schedule
                    </div>
                    <div className="pt-2 border-t border-slate-200/80 flex items-center gap-1.5 text-[11px] font-semibold text-teal-700">
                      <GitFork className="w-3.5 h-3.5" />
                      <span>Geometry Invariants</span>
                    </div>
                  </div>

                  {/* Node 3 */}
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                    <div className="text-[10px] uppercase font-bold text-slate-500 flex items-center justify-between">
                      <span>3. 3D & Finishes</span>
                      <Layers className="w-3.5 h-3.5 text-purple-700" />
                    </div>
                    <div className="text-xs font-bold text-slate-900">Volumetric Engine</div>
                    <div className="text-[11px] text-slate-500">
                      Extrusion, facade material, interior schedules
                    </div>
                    <div className="pt-2 border-t border-slate-200/80 flex items-center gap-1.5 text-[11px] font-semibold text-purple-700">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Sync Dependency</span>
                    </div>
                  </div>

                  {/* Node 4 */}
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                    <div className="text-[10px] uppercase font-bold text-slate-500 flex items-center justify-between">
                      <span>4. Feasibility & Budget</span>
                      <Coins className="w-3.5 h-3.5 text-amber-700" />
                    </div>
                    <div className="text-xs font-bold text-slate-900">
                      {project.budget > 0 ? `$${project.budget.toLocaleString()}` : 'Budget Unset'}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Schematic cost vs allocated investment
                    </div>
                    <div className="pt-2 border-t border-slate-200/80 flex items-center gap-1.5 text-[11px] font-semibold text-amber-700">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Feasibility Gate</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Conflict Analysis Section if any conflicts exist */}
              {summary.conflicts > 0 && (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-2 text-xs">
                  <div className="flex items-center gap-2 font-bold text-rose-900">
                    <AlertCircle className="w-4 h-4 text-rose-600" />
                    <span>{summary.conflicts} Constraint Conflict(s) Detected</span>
                  </div>
                  <p className="text-rose-800 leading-relaxed">
                    The current architectural design conflicts with declared project requirements or boundary invariants. Review the specific constraint cards below to inspect affected elements and apply safe remedies.
                  </p>
                </div>
              )}
            </div>
          ) : null}

          {/* Constraint Card List */}
          {filteredConstraints.length === 0 ? (
            <div className="bg-white p-8 rounded-xl border border-slate-200 text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 text-teal-600 mx-auto" />
              <h4 className="text-sm font-bold text-slate-900">No Constraints Match Filter</h4>
              <p className="text-xs text-slate-500">
                Try clearing your search query or selecting a different status/category filter.
              </p>
              <button
                onClick={() => {
                  setStatusFilter('all');
                  setCategoryFilter('all');
                  setSearchQuery('');
                }}
                className="mt-3 px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-medium cursor-pointer"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            filteredConstraints.map((node) => {
              const isConflict = node.status === 'conflict';
              const isPending = node.status === 'pending';
              const isPass = node.status === 'pass';
              const isNotAssessed = node.status === 'not-assessed';

              let borderClass = 'border-slate-200 bg-white';
              let badgeColor = 'bg-slate-100 text-slate-700 border-slate-200';
              let icon = <HelpCircle className="w-3.5 h-3.5 text-slate-500" />;
              let statusLabel = 'Not Assessed';

              if (isPass) {
                borderClass = 'border-slate-200 bg-white hover:border-teal-300';
                badgeColor = 'bg-emerald-50 text-emerald-800 border-emerald-200';
                icon = <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />;
                statusLabel = 'Pass';
              } else if (isConflict) {
                borderClass = 'border-rose-300 bg-rose-50/20 hover:border-rose-400';
                badgeColor = 'bg-rose-50 text-rose-800 border-rose-200 font-bold';
                icon = <AlertCircle className="w-3.5 h-3.5 text-rose-600" />;
                statusLabel = 'Conflict';
              } else if (isPending) {
                borderClass = 'border-amber-300 bg-amber-50/20 hover:border-amber-400';
                badgeColor = 'bg-amber-50 text-amber-800 border-amber-200 font-bold';
                icon = <Clock className="w-3.5 h-3.5 text-amber-600" />;
                statusLabel = 'Pending';
              }

              return (
                <div
                  key={node.id}
                  className={`p-5 rounded-xl border shadow-xs transition-all space-y-3 ${borderClass}`}
                >
                  {/* Top line: Category and Status Pill */}
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      {CATEGORY_LABELS[node.category]}
                    </span>

                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border ${badgeColor}`}
                    >
                      {icon}
                      <span>{statusLabel}</span>
                    </span>
                  </div>

                  {/* Title & Description */}
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 tracking-tight">
                      {node.title}
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                      {node.description}
                    </p>
                  </div>

                  {/* Requirement vs Design Data Comparison Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 bg-slate-50/80 rounded-lg border border-slate-200/70 text-xs">
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase font-semibold">
                        {node.sourceRequirement.label}
                      </div>
                      <div className="font-semibold text-slate-800 mt-0.5 tabular-nums">
                        {node.sourceRequirement.value}{' '}
                        {node.sourceRequirement.unit && (
                          <span className="text-slate-500 font-normal">
                            {node.sourceRequirement.unit}
                          </span>
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] text-slate-400 uppercase font-semibold">
                        {node.designValue.label}
                      </div>
                      <div className="font-semibold text-slate-800 mt-0.5 tabular-nums">
                        {node.designValue.value}{' '}
                        {node.designValue.unit && (
                          <span className="text-slate-500 font-normal">
                            {node.designValue.unit}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Comparison Rule Code */}
                  <div className="flex items-center gap-2 text-[11px] text-slate-500">
                    <span className="font-semibold text-slate-400">Rule:</span>
                    <code className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-700 font-mono text-[10px]">
                      {node.comparisonRule}
                    </code>
                  </div>

                  {/* Status Reason Explanation in Plain Language */}
                  <div
                    className={`p-3 rounded-lg text-xs leading-relaxed ${
                      isConflict
                        ? 'bg-rose-50 text-rose-900 border border-rose-200/80'
                        : isPending
                        ? 'bg-amber-50 text-amber-900 border border-amber-200/80'
                        : isPass
                        ? 'bg-slate-50 text-slate-700 border border-slate-200/60'
                        : 'bg-slate-50 text-slate-600 border border-slate-200/60'
                    }`}
                  >
                    <span className="font-semibold">Analysis: </span>
                    {node.statusReason}
                  </div>

                  {/* Affected Elements Tags */}
                  {node.affectedElements.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-[11px] text-slate-400 font-medium">Affected:</span>
                      {node.affectedElements.map((elem, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-700 text-[11px] font-medium"
                        >
                          {elem}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Working Remedy / Action Button */}
                  {node.recommendation && (
                    <div className="pt-2 flex items-center justify-between gap-3 border-t border-slate-100">
                      <span className="text-[11px] text-slate-500 italic max-w-sm">
                        {node.recommendation.details}
                      </span>

                      <button
                        onClick={() => handleAction(node)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg shadow-2xs transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                          isConflict
                            ? 'bg-rose-600 hover:bg-rose-700 text-white'
                            : isPending
                            ? 'bg-amber-600 hover:bg-amber-700 text-white'
                            : 'bg-slate-900 hover:bg-slate-800 text-white'
                        }`}
                      >
                        <span>{node.recommendation.actionLabel}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* Scope & Non-Destructive Invariant Notice */}
          <div className="p-4 bg-slate-100 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1.5">
            <div className="flex items-center gap-2 font-semibold text-slate-800">
              <ShieldCheck className="w-4 h-4 text-teal-700" />
              <span>Plotify Constraint Engine Standards</span>
            </div>
            <p className="leading-relaxed">
              Living constraints are evaluated deterministically from active project parameters and 2D geometry. Plotify never silently changes room coordinates or overwrites project data without user confirmation. Unconfigured requirements are marked <em>Not assessed</em> rather than assumed passing.
            </p>
          </div>
        </div>

        {/* Drawer Footer */}
        <div className="p-4 border-t border-slate-200 bg-white flex items-center justify-between shrink-0 text-xs text-slate-500">
          <div>
            Evaluated at: <span className="font-mono text-slate-700">{new Date(graphState.lastEvaluatedAt).toLocaleTimeString()}</span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
