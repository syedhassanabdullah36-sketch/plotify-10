import React from 'react';
import { Eye, Edit3, Trash2, Home, Building2, Layers, Compass, ArrowUpRight, PenTool, Box, Palette, Scale, DollarSign, FileText } from 'lucide-react';
import { Project } from '../types/project';
import { formatArea, formatCurrency, formatDate, getStatusStyle } from '../utils/formatters';

interface ProjectCardProps {
  project: Project;
  onView: (project: Project) => void;
  onEdit: (project: Project) => void;
  onDelete: (project: Project) => void;
  onOpenFloorPlan?: (project: Project) => void;
  onOpen3DViewer?: (project: Project) => void;
  onOpenDesignStudio?: (project: Project) => void;
  onOpenImpactSimulator?: (project: Project) => void;
  onOpenCostPlanning?: (project: Project) => void;
  onOpenDocumentation?: (project: Project) => void;
}

export const ProjectCard: React.FC<ProjectCardProps> = ({
  project,
  onView,
  onEdit,
  onDelete,
  onOpenFloorPlan,
  onOpen3DViewer,
  onOpenDesignStudio,
  onOpenImpactSimulator,
  onOpenCostPlanning,
  onOpenDocumentation,
}) => {
  const { label: areaLabel } = formatArea(project.plotWidth, project.plotLength, project.unit);
  const statusStyle = getStatusStyle(project.status);
  const unitSuffix = project.unit === 'feet' ? 'ft' : 'm';

  // Room summary text
  const roomItems: string[] = [];
  if (project.rooms.bedrooms) roomItems.push(`${project.rooms.bedrooms} Bed`);
  if (project.rooms.bathrooms) roomItems.push(`${project.rooms.bathrooms} Bath`);
  if (project.rooms.kitchen) roomItems.push(`${project.rooms.kitchen} Kitchen`);
  if (project.rooms.livingRoom) roomItems.push(`${project.rooms.livingRoom} Living`);

  const TypeIcon = project.projectType === 'apartment' ? Building2 : Home;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 hover:border-teal-500/50 hover:shadow-xs transition-all flex flex-col justify-between">
      <div>
        {/* Top Header: Type, Status, and Options */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <TypeIcon className="w-4 h-4 text-slate-400" />
            <span className="capitalize font-medium text-slate-700">
              {project.projectType === 'other' ? (project.customProjectType || 'Other Structure') : project.projectType}
            </span>
            <span aria-hidden="true">·</span>
            <span>{formatDate(project.updatedAt)}</span>
          </div>

          <span
            className={`px-2.5 py-1 text-xs font-medium rounded-md border ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}
          >
            {project.status}
          </span>
        </div>

        {/* Project Name */}
        <h3
          onClick={() => onView(project)}
          className="text-base font-bold text-slate-900 mt-2.5 hover:text-teal-700 cursor-pointer transition-colors flex items-center justify-between group"
        >
          <span className="truncate">{project.name}</span>
          <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-teal-600 transition-colors shrink-0 ml-2" />
        </h3>

        {/* Plot Dimensions & Floors Grid */}
        <div className="mt-4 grid grid-cols-2 gap-3 py-3 border-y border-slate-100 text-xs">
          <div>
            <div className="text-slate-400 font-medium">Plot Dimensions</div>
            <div className="font-semibold text-slate-800 tabular-nums mt-0.5">
              {project.plotWidth} × {project.plotLength} {unitSuffix}
            </div>
            <div className="text-[11px] text-teal-700 font-medium tabular-nums mt-0.5">
              {areaLabel}
            </div>
          </div>

          <div>
            <div className="text-slate-400 font-medium">Configuration</div>
            <div className="font-semibold text-slate-800 tabular-nums mt-0.5 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-slate-400" />
              <span>{project.floors} {project.floors === 1 ? 'Floor' : 'Floors'}</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1 truncate">
              <Compass className="w-3 h-3 text-slate-400 shrink-0" />
              <span className="truncate">{project.roadFacing}</span>
            </div>
          </div>
        </div>

        {/* Room breakdown summary */}
        <div className="mt-3 text-xs text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-1">
          {roomItems.slice(0, 4).map((item, idx) => (
            <React.Fragment key={idx}>
              {idx > 0 && <span aria-hidden="true" className="text-slate-300">·</span>}
              <span className="tabular-nums font-medium text-slate-700">{item}</span>
            </React.Fragment>
          ))}
          {roomItems.length > 4 && (
            <span className="text-[11px] text-slate-400">+{roomItems.length - 4} more</span>
          )}
        </div>

        {/* Budget info */}
        {project.budget > 0 && (
          <div className="mt-2.5 text-xs text-slate-600 flex items-center justify-between">
            <span className="text-slate-400">Target Budget:</span>
            <span className="font-semibold text-slate-900 tabular-nums">
              {formatCurrency(project.budget, project.currency)}
            </span>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between gap-1.5">
        <button
          onClick={() => onView(project)}
          className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 hover:text-slate-900 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
        >
          <Eye className="w-3.5 h-3.5 text-slate-500" />
          <span>Overview</span>
        </button>

        {onOpenFloorPlan && (
          <button
            onClick={() => onOpenFloorPlan(project)}
            className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200/80 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            title="Open 2D floor-plan canvas"
            aria-label={`2D Floor Plan for ${project.name}`}
          >
            <PenTool className="w-3.5 h-3.5 text-teal-600" />
            <span>Plan</span>
          </button>
        )}

        {onOpen3DViewer && (
          <button
            onClick={() => onOpen3DViewer(project)}
            className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            title="Open 3D building viewer"
            aria-label={`3D Model for ${project.name}`}
          >
            <Box className="w-3.5 h-3.5 text-teal-600" />
            <span>3D</span>
          </button>
        )}

        {onOpenDesignStudio && (
          <button
            onClick={() => onOpenDesignStudio(project)}
            className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            title="Open Facade & Interior Design Studio"
            aria-label={`Design Studio for ${project.name}`}
          >
            <Palette className="w-3.5 h-3.5 text-teal-700" />
            <span>Studio</span>
          </button>
        )}

        {onOpenImpactSimulator && (
          <button
            onClick={() => onOpenImpactSimulator(project)}
            className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-teal-950 bg-teal-100/70 hover:bg-teal-200/70 border border-teal-300 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            title="Open Future-Impact Simulator & Optimizer"
            aria-label={`Impact Simulator for ${project.name}`}
          >
            <Scale className="w-3.5 h-3.5 text-teal-800" />
            <span>Simulator</span>
          </button>
        )}

        {onOpenCostPlanning && (
          <button
            onClick={() => onOpenCostPlanning(project)}
            className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            title="Open Cost Intelligence & Construction Planning"
            aria-label={`Cost Planning for ${project.name}`}
          >
            <DollarSign className="w-3.5 h-3.5 text-teal-700" />
            <span>Cost</span>
          </button>
        )}

        {onOpenDocumentation && (
          <button
            onClick={() => onOpenDocumentation(project)}
            className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            title="Open Documentation & Handoff Packages"
            aria-label={`Documentation for ${project.name}`}
          >
            <FileText className="w-3.5 h-3.5 text-teal-700" />
            <span>Docs</span>
          </button>
        )}

        <button
          onClick={() => onEdit(project)}
          className="inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 hover:text-slate-900 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          title="Edit project details"
          aria-label={`Edit ${project.name}`}
        >
          <Edit3 className="w-3.5 h-3.5 text-slate-500" />
          <span>Edit</span>
        </button>

        <button
          onClick={() => onDelete(project)}
          className="inline-flex items-center justify-center p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
          title="Delete project"
          aria-label={`Delete ${project.name}`}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
