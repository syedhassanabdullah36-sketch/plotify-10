import React, { useState } from 'react';
import {
  Plus,
  FolderPlus,
  Search,
  Building,
  Layers,
  Sparkles,
  Maximize2,
  Coins,
  ArrowRight,
  RotateCcw,
} from 'lucide-react';
import { Project } from '../types/project';
import { ProjectCard } from './ProjectCard';
import { formatCurrency } from '../utils/formatters';

interface DashboardViewProps {
  projects: Project[];
  onCreateNew: () => void;
  onViewProject: (project: Project) => void;
  onEditProject: (project: Project) => void;
  onDeleteProject: (project: Project) => void;
  onRestoreSamples: () => void;
  onOpenFloorPlan?: (project: Project) => void;
  onOpen3DViewer?: (project: Project) => void;
  onOpenDesignStudio?: (project: Project) => void;
  onOpenImpactSimulator?: (project: Project) => void;
  onOpenCostPlanning?: (project: Project) => void;
  onOpenDocumentation?: (project: Project) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  projects,
  onCreateNew,
  onViewProject,
  onEditProject,
  onDeleteProject,
  onRestoreSamples,
  onOpenFloorPlan,
  onOpen3DViewer,
  onOpenDesignStudio,
  onOpenImpactSimulator,
  onOpenCostPlanning,
  onOpenDocumentation,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Filter projects
  const filteredProjects = projects.filter((project) => {
    const matchesSearch =
      project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.notes.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.projectType.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'all' || project.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Calculate high-level metrics
  const totalFloors = projects.reduce((acc, p) => acc + (p.floors || 1), 0);
  const totalBudget = projects.reduce((acc, p) => acc + (p.budget || 0), 0);

  // Approximate total area in sq ft (converting metres to sq ft if needed: 1 sq m ≈ 10.764 sq ft)
  const totalAreaSqFt = projects.reduce((acc, p) => {
    const area = p.plotWidth * p.plotLength;
    return acc + (p.unit === 'metres' ? area * 10.764 : area);
  }, 0);

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Top Banner / Welcome Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            Project Dashboard
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            <span className="font-semibold text-teal-700">Plotify · AI-Powered Architectural Intelligence:</span> Spatial programming, living constraint validation, and dimensional tracking.
          </p>
        </div>

        <button
          onClick={onCreateNew}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs hover:shadow-md transition-all whitespace-nowrap self-start md:self-auto cursor-pointer"
        >
          <Plus className="w-4 h-4 text-teal-400" />
          <span>Create New Project</span>
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Total Projects</span>
            <Building className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
            {projects.length}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Active in local repository
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Total Floors Programmed</span>
            <Layers className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
            {totalFloors}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Across {projects.length} architectural envelopes
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Planned Plot Area</span>
            <Maximize2 className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
            {Math.round(totalAreaSqFt).toLocaleString()} <span className="text-sm font-normal text-slate-500">sq ft</span>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Normalized gross plot boundary
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Portfolio Target Budget</span>
            <Coins className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
            {formatCurrency(totalBudget, 'USD')}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Combined target allocations
          </div>
        </div>
      </div>

      {/* Projects Section Header with Filter Controls */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Recent Projects</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Review current architectural envelopes, floor configurations, and statuses.
            </p>
          </div>

          {/* Search bar & Status filter */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 w-44 sm:w-56"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="py-1.5 px-3 text-xs bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            >
              <option value="all">All Statuses</option>
              <option value="Drafting">Drafting</option>
              <option value="Concept Feasibility">Concept Feasibility</option>
              <option value="Schematic Design">Schematic Design</option>
              <option value="Client Review">Client Review</option>
              <option value="Permit Review">Permit Review</option>
              <option value="Approved">Approved</option>
            </select>
          </div>
        </div>

        {/* Project Grid or Empty State */}
        {filteredProjects.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onView={onViewProject}
                onEdit={onEditProject}
                onDelete={onDeleteProject}
                onOpenFloorPlan={onOpenFloorPlan}
                onOpen3DViewer={onOpen3DViewer}
                onOpenDesignStudio={onOpenDesignStudio}
                onOpenImpactSimulator={onOpenImpactSimulator}
                onOpenCostPlanning={onOpenCostPlanning}
                onOpenDocumentation={onOpenDocumentation}
              />
            ))}
          </div>
        ) : projects.length === 0 ? (
          /* Empty State when no projects exist */
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center max-w-xl mx-auto shadow-xs">
            <div className="w-14 h-14 bg-teal-50 text-teal-700 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-teal-100">
              <FolderPlus className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">No Projects Found</h3>
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">
              You haven't created any architectural projects yet. Start by defining your plot boundaries, road orientation, floor count, and room requirements.
            </p>
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={onCreateNew}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-colors"
              >
                <Plus className="w-4 h-4 text-teal-400" />
                <span>Create Your First Project</span>
              </button>
              <button
                onClick={onRestoreSamples}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                <RotateCcw className="w-4 h-4 text-slate-500" />
                <span>Load Sample Projects</span>
              </button>
            </div>
          </div>
        ) : (
          /* Filtered empty state */
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500 text-sm">
            No projects matched the search term "{searchQuery}" or status filter.
            <button
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('all');
              }}
              className="ml-2 font-semibold text-teal-700 hover:underline"
            >
              Reset filters
            </button>
          </div>
        )}
      </div>

      {/* Advisory Banner */}
      <div className="p-4 bg-slate-100/80 rounded-xl border border-slate-200 text-xs text-slate-600 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <span className="font-semibold text-slate-800">Architectural Foundation:</span> All project data is stored locally in your browser. Editable 2D floor-plan geometry drafting is scheduled for Milestone 2.
        </div>
        <button
          onClick={onCreateNew}
          className="text-teal-700 font-semibold hover:underline inline-flex items-center gap-1 shrink-0 text-xs"
        >
          <span>Start new plan</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
