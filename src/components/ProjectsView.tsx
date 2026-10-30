import React, { useState } from 'react';
import {
  Plus,
  Search,
  Filter,
  ArrowUpDown,
  Building2,
  FolderOpen,
  LayoutGrid,
  List,
  FileCode2,
  FileSpreadsheet,
  Mountain,
  Leaf,
  CloudRain,
  Thermometer,
  Truck,
  Camera,
  Glasses,
  Users,
} from 'lucide-react';
import { Project, ProjectType, ProjectStatus } from '../types/project';
import { ProjectCard } from './ProjectCard';
import { formatArea, formatCurrency, formatDate, getStatusStyle } from '../utils/formatters';

interface ProjectsViewProps {
  projects: Project[];
  onCreateNew: () => void;
  onViewProject: (project: Project) => void;
  onEditProject: (project: Project) => void;
  onDeleteProject: (project: Project) => void;
  onOpenFloorPlan?: (project: Project) => void;
  onOpen3DViewer?: (project: Project) => void;
  onOpenDesignStudio?: (project: Project) => void;
  onOpenImpactSimulator?: (project: Project) => void;
  onOpenCostPlanning?: (project: Project) => void;
  onOpenDocumentation?: (project: Project) => void;
  onOpenIFC?: () => void;
  onOpenCAD?: () => void;
  onOpenTerrain?: () => void;
  onOpenCarbon?: () => void;
  onOpenClimateResilience?: () => void;
  onOpenEnvelopePerformance?: () => void;
  onOpenSiteLogistics?: () => void;
  onOpenARSite?: () => void;
  onOpenVRReview?: () => void;
  onOpenLiveCollaboration?: () => void;
}

type SortField = 'updatedAt' | 'name' | 'area' | 'budget';
type SortOrder = 'asc' | 'desc';

export const ProjectsView: React.FC<ProjectsViewProps> = ({
  projects,
  onCreateNew,
  onViewProject,
  onEditProject,
  onDeleteProject,
  onOpenFloorPlan,
  onOpen3DViewer,
  onOpenDesignStudio,
  onOpenImpactSimulator,
  onOpenCostPlanning,
  onOpenDocumentation,
  onOpenIFC,
  onOpenCAD,
  onOpenTerrain,
  onOpenCarbon,
  onOpenClimateResilience,
  onOpenEnvelopePerformance,
  onOpenSiteLogistics,
  onOpenARSite,
  onOpenVRReview,
  onOpenLiveCollaboration,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortField>('updatedAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Filtering
  const filtered = projects.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.notes.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.roadFacing.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesType = typeFilter === 'all' || p.projectType === typeFilter;
    const matchesStatus = statusFilter === 'all' || p.status === statusFilter;

    return matchesSearch && matchesType && matchesStatus;
  });

  // Sorting
  const sorted = [...filtered].sort((a, b) => {
    let comparison = 0;
    if (sortBy === 'updatedAt') {
      comparison = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      return sortOrder === 'desc' ? comparison : -comparison;
    }
    if (sortBy === 'name') {
      comparison = a.name.localeCompare(b.name);
      return sortOrder === 'asc' ? comparison : -comparison;
    }
    if (sortBy === 'area') {
      const areaA = a.plotWidth * a.plotLength;
      const areaB = b.plotWidth * b.plotLength;
      comparison = areaB - areaA;
      return sortOrder === 'desc' ? comparison : -comparison;
    }
    if (sortBy === 'budget') {
      comparison = b.budget - a.budget;
      return sortOrder === 'desc' ? comparison : -comparison;
    }
    return 0;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            Architectural Projects
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage your project specifications, plot envelopes, and space programming records.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {onOpenLiveCollaboration && (
            <button
              onClick={onOpenLiveCollaboration}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-teal-950 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <Users className="w-4 h-4 text-teal-700" />
              <span>Live Collaboration</span>
            </button>
          )}
          {onOpenVRReview && (
            <button
              onClick={onOpenVRReview}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-teal-950 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <Glasses className="w-4 h-4 text-teal-700" />
              <span>VR Design Review</span>
            </button>
          )}
          {onOpenARSite && (
            <button
              onClick={onOpenARSite}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-teal-950 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <Camera className="w-4 h-4 text-teal-700" />
              <span>AR Site View</span>
            </button>
          )}
          {onOpenSiteLogistics && (
            <button
              onClick={onOpenSiteLogistics}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-amber-950 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <Truck className="w-4 h-4 text-amber-700" />
              <span>Site Logistics</span>
            </button>
          )}
          {onOpenEnvelopePerformance && (
            <button
              onClick={onOpenEnvelopePerformance}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <Thermometer className="w-4 h-4 text-teal-700" />
              <span>Envelope Performance</span>
            </button>
          )}
          {onOpenClimateResilience && (
            <button
              onClick={onOpenClimateResilience}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-sky-900 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <CloudRain className="w-4 h-4 text-sky-700" />
              <span>Climate & Resilience</span>
            </button>
          )}
          {onOpenCarbon && (
            <button
              onClick={onOpenCarbon}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <Leaf className="w-4 h-4 text-emerald-700" />
              <span>Whole-Life Carbon</span>
            </button>
          )}
          {onOpenTerrain && (
            <button
              onClick={onOpenTerrain}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <Mountain className="w-4 h-4 text-teal-700" />
              <span>Terrain & Topography</span>
            </button>
          )}
          {onOpenCAD && (
            <button
              onClick={onOpenCAD}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-teal-700" />
              <span>CAD / DXF Exchange</span>
            </button>
          )}
          {onOpenIFC && (
            <button
              onClick={onOpenIFC}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <FileCode2 className="w-4 h-4 text-teal-700" />
              <span>OpenBIM / IFC Import</span>
            </button>
          )}
          <button
            onClick={onCreateNew}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-colors whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-4 h-4 text-teal-400" />
            <span>New Project</span>
          </button>
        </div>
      </div>

      {/* Filter and Control Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search bar */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by project name, road orientation, or notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            />
          </div>

          {/* View Mode Toggle & Sort Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-md text-slate-600 transition-colors cursor-pointer ${
                  viewMode === 'grid' ? 'bg-white text-slate-900 shadow-2xs' : 'hover:text-slate-900'
                }`}
                title="Grid View"
                aria-label="Grid View"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-md text-slate-600 transition-colors cursor-pointer ${
                  viewMode === 'table' ? 'bg-white text-slate-900 shadow-2xs' : 'hover:text-slate-900'
                }`}
                title="Table View"
                aria-label="Table View"
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Sort Select */}
            <div className="flex items-center gap-1 text-xs">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortField)}
                className="py-1.5 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
              >
                <option value="updatedAt">Sort: Recently Updated</option>
                <option value="name">Sort: Project Name</option>
                <option value="area">Sort: Plot Footprint Area</option>
                <option value="budget">Sort: Approximate Budget</option>
              </select>

              <button
                onClick={() => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                className="p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 hover:text-slate-900 cursor-pointer"
                title={`Order: ${sortOrder === 'asc' ? 'Ascending' : 'Descending'}`}
                aria-label="Toggle sort order"
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Secondary Filter Chips / Selectors */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 text-xs">
          <span className="text-slate-400 font-medium">Type:</span>
          {['all', 'house', 'apartment', 'other'].map((type) => (
            <button
              key={type}
              onClick={() => setTypeFilter(type)}
              className={`px-2.5 py-1 rounded-md capitalize transition-colors cursor-pointer ${
                typeFilter === type
                  ? 'bg-slate-900 text-white font-medium'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {type === 'all' ? 'All Types' : type}
            </button>
          ))}

          <span className="text-slate-400 font-medium ml-2">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="py-1 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-700 focus:outline-hidden"
          >
            <option value="all">All Statuses</option>
            <option value="Drafting">Drafting</option>
            <option value="Concept Feasibility">Concept Feasibility</option>
            <option value="Schematic Design">Schematic Design</option>
            <option value="Client Review">Client Review</option>
            <option value="Permit Review">Permit Review</option>
            <option value="Approved">Approved</option>
          </select>

          {(typeFilter !== 'all' || statusFilter !== 'all' || searchQuery) && (
            <button
              onClick={() => {
                setTypeFilter('all');
                setStatusFilter('all');
                setSearchQuery('');
              }}
              className="text-xs text-teal-700 hover:underline font-semibold ml-auto cursor-pointer"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Content Rendering: Grid vs Table */}
      {sorted.length > 0 ? (
        viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {sorted.map((project) => (
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
        ) : (
          /* Table View */
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-500 font-semibold">
                  <th className="py-3 px-4">Project Name</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4 text-right">Plot Dimensions</th>
                  <th className="py-3 px-4 text-center">Floors</th>
                  <th className="py-3 px-4">Road Orientation</th>
                  <th className="py-3 px-4 text-right">Target Budget</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sorted.map((project) => {
                  const { label: areaLabel } = formatArea(
                    project.plotWidth,
                    project.plotLength,
                    project.unit
                  );
                  const statusStyle = getStatusStyle(project.status);
                  const unitSuffix = project.unit === 'feet' ? 'ft' : 'm';

                  return (
                    <tr
                      key={project.id}
                      className="hover:bg-slate-50/80 transition-colors group"
                    >
                      <td className="py-3.5 px-4">
                        <button
                          onClick={() => onViewProject(project)}
                          className="font-bold text-slate-900 hover:text-teal-700 transition-colors text-left cursor-pointer"
                        >
                          {project.name}
                        </button>
                        <div className="text-[11px] text-slate-400">
                          Updated {formatDate(project.updatedAt)}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 capitalize text-slate-700">
                        {project.projectType === 'other'
                          ? project.customProjectType || 'Other'
                          : project.projectType}
                      </td>

                      <td className="py-3.5 px-4 text-right tabular-nums">
                        <div className="font-semibold text-slate-800">
                          {project.plotWidth} × {project.plotLength} {unitSuffix}
                        </div>
                        <div className="text-[11px] text-teal-700 font-medium">{areaLabel}</div>
                      </td>

                      <td className="py-3.5 px-4 text-center tabular-nums font-medium text-slate-700">
                        {project.floors}
                      </td>

                      <td className="py-3.5 px-4 text-slate-700">
                        {project.roadFacing}
                      </td>

                      <td className="py-3.5 px-4 text-right tabular-nums font-semibold text-slate-800">
                        {project.budget > 0
                          ? formatCurrency(project.budget, project.currency)
                          : '—'}
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-block px-2.5 py-0.5 text-[11px] font-medium rounded-md border ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}
                        >
                          {project.status}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => onViewProject(project)}
                            className="px-2.5 py-1 text-slate-700 hover:bg-slate-100 rounded text-xs font-medium cursor-pointer"
                          >
                            View
                          </button>
                          {onOpenFloorPlan && (
                            <button
                              onClick={() => onOpenFloorPlan(project)}
                              className="px-2.5 py-1 text-teal-800 bg-teal-50 hover:bg-teal-100 rounded text-xs font-semibold cursor-pointer"
                            >
                              Plan
                            </button>
                          )}
                          {onOpen3DViewer && (
                            <button
                              onClick={() => onOpen3DViewer(project)}
                              className="px-2 py-1 text-slate-800 bg-slate-100 hover:bg-slate-200 rounded text-xs font-semibold cursor-pointer"
                            >
                              3D
                            </button>
                          )}
                          {onOpenDocumentation && (
                            <button
                              onClick={() => onOpenDocumentation(project)}
                              className="px-2 py-1 text-teal-800 bg-teal-50 hover:bg-teal-100 rounded text-xs font-semibold cursor-pointer"
                            >
                              Docs
                            </button>
                          )}
                          <button
                            onClick={() => onEditProject(project)}
                            className="px-2.5 py-1 text-slate-700 hover:bg-slate-100 rounded text-xs font-medium cursor-pointer"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => onDeleteProject(project)}
                            className="p-1 text-slate-400 hover:text-red-600 rounded cursor-pointer"
                            aria-label={`Delete ${project.name}`}
                          >
                            ×
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-xs">
          <FolderOpen className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-900">No Projects Found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            No projects matched your active search or filters. Try adjusting your parameters or create a new project.
          </p>
          <div className="mt-4">
            <button
              onClick={onCreateNew}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4 text-teal-400" />
              <span>Create New Project</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
