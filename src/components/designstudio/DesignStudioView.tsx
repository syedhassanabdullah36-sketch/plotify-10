import React, { useState, useMemo } from 'react';
import {
  Project,
  DesignAlternative,
  FacadeConcept,
  InteriorRoomConcept,
} from '../../types/project';
import { createDefaultDesignAlternative } from '../../services/designPalettes';
import { FacadeStudio } from './FacadeStudio';
import { InteriorStudio } from './InteriorStudio';
import { MaterialLibraryView } from './MaterialLibraryView';
import { AlternativeComparisonModal } from './AlternativeComparisonModal';
import {
  ArrowLeft,
  Building2,
  Armchair,
  Palette,
  Scale,
  Plus,
  Copy,
  Trash2,
  Check,
  Eye,
  PenTool,
  Box,
  ShieldCheck,
  Info,
  Sparkles,
  Network,
} from 'lucide-react';

interface DesignStudioViewProps {
  project: Project;
  onSaveProject: (updated: Project) => void;
  onBack: () => void;
  onOpen3DViewer: (project: Project) => void;
  onOpenFloorPlan: (project: Project) => void;
  onShowToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
  onOpenDecisionTwin?: () => void;
}

export const DesignStudioView: React.FC<DesignStudioViewProps> = ({
  project,
  onSaveProject,
  onBack,
  onOpen3DViewer,
  onOpenFloorPlan,
  onShowToast,
  onOpenDecisionTwin,
}) => {
  // Ensure project has at least 2 default alternatives (Option A and Option B)
  const initializedAlternatives: DesignAlternative[] = useMemo(() => {
    if (project.designAlternatives && project.designAlternatives.length > 0) {
      // If only 1 alternative exists, generate Option B
      if (project.designAlternatives.length === 1) {
        const altB = createDefaultDesignAlternative(
          project,
          'Option B — Minimalist Limewash & Concrete',
          'B'
        );
        return [...project.designAlternatives, altB];
      }
      return project.designAlternatives;
    }
    // Create both Option A and Option B
    const altA = createDefaultDesignAlternative(
      project,
      'Option A — Nordic Timber & Slate',
      'A'
    );
    const altB = createDefaultDesignAlternative(
      project,
      'Option B — Minimalist Limewash & Concrete',
      'B'
    );
    return [altA, altB];
  }, [project]);

  const [activeAltId, setActiveAltId] = useState<string>(() => {
    return (
      project.activeAlternativeId ||
      initializedAlternatives[0]?.id ||
      'alt-default'
    );
  });

  const [currentSubTab, setCurrentSubTab] = useState<
    'facade' | 'interior' | 'materials' | 'comparison'
  >('facade');

  const [isComparisonModalOpen, setIsComparisonModalOpen] = useState(false);

  // Active alternative reference
  const currentAlternative = useMemo(() => {
    return (
      initializedAlternatives.find((a) => a.id === activeAltId) ||
      initializedAlternatives[0]
    );
  }, [initializedAlternatives, activeAltId]);

  // Update alternative handler
  const handleUpdateAlternative = (updatedAlt: DesignAlternative) => {
    const updatedList = initializedAlternatives.map((a) =>
      a.id === updatedAlt.id ? updatedAlt : a
    );

    const updatedProject: Project = {
      ...project,
      designAlternatives: updatedList,
      activeAlternativeId: activeAltId,
    };

    onSaveProject(updatedProject);
  };

  // Update Facade concept
  const handleUpdateFacade = (newFacade: FacadeConcept) => {
    if (!currentAlternative) return;
    const updatedAlt: DesignAlternative = {
      ...currentAlternative,
      facade: newFacade,
    };
    handleUpdateAlternative(updatedAlt);
  };

  // Update Interior concepts
  const handleUpdateInteriors = (
    newInteriors: Record<string, InteriorRoomConcept>
  ) => {
    if (!currentAlternative) return;
    const updatedAlt: DesignAlternative = {
      ...currentAlternative,
      interiors: newInteriors,
    };
    handleUpdateAlternative(updatedAlt);
  };

  // Add new alternative
  const handleCreateNewAlternative = () => {
    const nextLetter = String.fromCharCode(65 + initializedAlternatives.length);
    const newName = `Option ${nextLetter} — Architectural Concept`;
    const newAlt = createDefaultDesignAlternative(
      project,
      newName,
      initializedAlternatives.length % 2 === 0 ? 'A' : 'B'
    );

    const updatedList = [...initializedAlternatives, newAlt];
    const updatedProject: Project = {
      ...project,
      designAlternatives: updatedList,
      activeAlternativeId: newAlt.id,
    };

    onSaveProject(updatedProject);
    setActiveAltId(newAlt.id);
    if (onShowToast) onShowToast(`Created new alternative "${newName}"!`, 'success');
  };

  // Duplicate current alternative
  const handleDuplicateCurrent = () => {
    if (!currentAlternative) return;
    const clonedId = `alt-${Date.now()}`;
    const clonedName = `${currentAlternative.name} (Copy)`;
    const cloned: DesignAlternative = {
      ...currentAlternative,
      id: clonedId,
      name: clonedName,
      createdAt: new Date().toISOString(),
    };

    const updatedList = [...initializedAlternatives, cloned];
    const updatedProject: Project = {
      ...project,
      designAlternatives: updatedList,
      activeAlternativeId: clonedId,
    };

    onSaveProject(updatedProject);
    setActiveAltId(clonedId);
    if (onShowToast) onShowToast(`Duplicated "${currentAlternative.name}"!`, 'success');
  };

  // Delete alternative
  const handleDeleteCurrent = () => {
    if (initializedAlternatives.length <= 1) {
      if (onShowToast) {
        onShowToast('At least one design alternative must remain in the project.', 'error');
      }
      return;
    }

    const name = currentAlternative.name;
    const updatedList = initializedAlternatives.filter(
      (a) => a.id !== currentAlternative.id
    );
    const nextActive = updatedList[0].id;

    const updatedProject: Project = {
      ...project,
      designAlternatives: updatedList,
      activeAlternativeId: nextActive,
    };

    onSaveProject(updatedProject);
    setActiveAltId(nextActive);
    if (onShowToast) onShowToast(`Deleted alternative "${name}".`, 'info');
  };

  // Set as project active alternative & apply to 3D
  const handleSetAsActiveAlternative = (altId: string) => {
    setActiveAltId(altId);
    const updatedProject: Project = {
      ...project,
      activeAlternativeId: altId,
      applyDesignTo3D: true,
    };
    onSaveProject(updatedProject);
    if (onShowToast) {
      const alt = initializedAlternatives.find((a) => a.id === altId);
      onShowToast(`"${alt?.name}" is now the active project concept.`, 'success');
    }
  };

  // Toggle apply to 3D model
  const handleToggleApplyTo3D = () => {
    const nextState = !project.applyDesignTo3D;
    const updatedProject: Project = {
      ...project,
      activeAlternativeId: activeAltId,
      applyDesignTo3D: nextState,
    };
    onSaveProject(updatedProject);
    if (onShowToast) {
      onShowToast(
        nextState
          ? `Concept materials applied to 3D Building Engine!`
          : `3D Building Engine restored to default white monolithic model.`,
        'info'
      );
    }
  };

  const isAppliedTo3D = project.applyDesignTo3D ?? true;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Comparison Modal */}
      <AlternativeComparisonModal
        isOpen={isComparisonModalOpen}
        onClose={() => setIsComparisonModalOpen(false)}
        project={project}
        alternatives={initializedAlternatives}
        activeAlternativeId={activeAltId}
        onSelectActiveAlternative={(id) => {
          handleSetAsActiveAlternative(id);
          setIsComparisonModalOpen(false);
        }}
        onApplyTo3D={(id) => {
          handleSetAsActiveAlternative(id);
          setIsComparisonModalOpen(false);
          onOpen3DViewer(project);
        }}
      />

      {/* Top Main Navigation Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            title="Back to Overview"
            aria-label="Back to Overview"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="font-semibold text-teal-700 uppercase tracking-wider text-[11px]">
                Design Studio
              </span>
              <span aria-hidden="true">·</span>
              <span>Facade & Interior Engine</span>
              <span aria-hidden="true">·</span>
              <span className="capitalize">{project.projectType}</span>
            </div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 mt-0.5 tracking-tight flex items-center gap-2">
              <span>{project.name}</span>
            </h2>
          </div>
        </div>

        {/* Global Action Shortcuts */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Apply to 3D Button */}
          <button
            type="button"
            onClick={handleToggleApplyTo3D}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
              isAppliedTo3D
                ? 'bg-teal-50 border-teal-200 text-teal-900 shadow-2xs'
                : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900'
            }`}
            title="Toggle whether active alternative materials appear in the 3D Building Engine"
          >
            <Palette className={`w-3.5 h-3.5 ${isAppliedTo3D ? 'text-teal-700' : 'text-slate-400'}`} />
            <span>{isAppliedTo3D ? 'Finishes in 3D: Active' : 'Finishes in 3D: Default'}</span>
          </button>

          {/* Architectural Decision Twin Shortcut */}
          {onOpenDecisionTwin && (
            <button
              type="button"
              onClick={onOpenDecisionTwin}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors cursor-pointer"
              title="Inspect Architectural Decision Twin finish schedules & synchronization"
            >
              <Network className="w-3.5 h-3.5 text-slate-700" />
              <span>Twin: Schedules</span>
            </button>
          )}

          {/* Quick Comparison Modal Trigger */}
          <button
            type="button"
            onClick={() => setIsComparisonModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            <Scale className="w-3.5 h-3.5 text-teal-600" />
            <span>Compare ({initializedAlternatives.length})</span>
          </button>

          {/* 2D Plan shortcut */}
          <button
            type="button"
            onClick={() => onOpenFloorPlan(project)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            <PenTool className="w-3.5 h-3.5 text-slate-500" />
            <span>2D Plan</span>
          </button>

          {/* 3D Model shortcut */}
          <button
            type="button"
            onClick={() => onOpen3DViewer(project)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            <Box className="w-3.5 h-3.5 text-teal-400" />
            <span>3D View</span>
          </button>
        </div>
      </div>

      {/* Design Alternatives Selector & Management Toolbar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mr-1">
            Alternatives:
          </span>

          {initializedAlternatives.map((alt) => {
            const isSelected = alt.id === activeAltId;
            const isProjectActive = project.activeAlternativeId === alt.id;

            return (
              <button
                key={alt.id}
                type="button"
                onClick={() => handleSetAsActiveAlternative(alt.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 border ${
                  isSelected
                    ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                <span>{alt.name}</span>
                {isProjectActive && (
                  <Check className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                )}
              </button>
            );
          })}

          <button
            type="button"
            onClick={handleCreateNewAlternative}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors cursor-pointer"
            title="Create new design alternative"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Option</span>
          </button>
        </div>

        {/* Current Alternative Management Actions */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            type="button"
            onClick={handleDuplicateCurrent}
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer border border-slate-200"
            title="Duplicate selected alternative"
            aria-label="Duplicate selected alternative"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>

          {initializedAlternatives.length > 1 && (
            <button
              type="button"
              onClick={handleDeleteCurrent}
              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer border border-slate-200"
              title="Delete selected alternative"
              aria-label="Delete selected alternative"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Sub-Studio Navigation Tabs */}
      <div className="border-b border-slate-200 bg-white rounded-t-xl px-4 flex items-center gap-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setCurrentSubTab('facade')}
          className={`py-3.5 px-4 text-xs font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer whitespace-nowrap ${
            currentSubTab === 'facade'
              ? 'border-teal-700 text-teal-900 bg-teal-50/40'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <Building2 className="w-4 h-4 text-teal-600" />
          <span>Facade Studio (Exterior)</span>
        </button>

        <button
          type="button"
          onClick={() => setCurrentSubTab('interior')}
          className={`py-3.5 px-4 text-xs font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer whitespace-nowrap ${
            currentSubTab === 'interior'
              ? 'border-teal-700 text-teal-900 bg-teal-50/40'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <Armchair className="w-4 h-4 text-teal-600" />
          <span>Interior Studio (Room Spaces)</span>
        </button>

        <button
          type="button"
          onClick={() => setCurrentSubTab('materials')}
          className={`py-3.5 px-4 text-xs font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer whitespace-nowrap ${
            currentSubTab === 'materials'
              ? 'border-teal-700 text-teal-900 bg-teal-50/40'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <Palette className="w-4 h-4 text-teal-600" />
          <span>Material Library & Pairings</span>
        </button>
      </div>

      {/* Active Sub-Studio Viewport */}
      <div>
        {currentSubTab === 'facade' && (
          <FacadeStudio
            project={project}
            facade={currentAlternative.facade}
            onChange={handleUpdateFacade}
            onOpen3D={() => onOpen3DViewer(project)}
          />
        )}

        {currentSubTab === 'interior' && (
          <InteriorStudio
            project={project}
            interiors={currentAlternative.interiors}
            onChange={handleUpdateInteriors}
            onOpen2DEditor={() => onOpenFloorPlan(project)}
            onOpen3D={() => onOpen3DViewer(project)}
          />
        )}

        {currentSubTab === 'materials' && (
          <MaterialLibraryView
            activeAlternative={currentAlternative}
            onUpdateAlternative={handleUpdateAlternative}
          />
        )}
      </div>

      {/* Architectural Assumptions & Legal Compliance Disclaimer (Prompt Directive) */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex items-start gap-3 text-xs text-slate-600">
        <ShieldCheck className="w-5 h-5 text-teal-700 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h4 className="font-bold text-slate-900">
            Architectural Assumptions & Schematic Scope Disclaimer
          </h4>
          <p className="leading-relaxed text-[11px] text-slate-500">
            Material finishes, color palettes, fenestration choices, and interior furniture arrangements configured in the Design Studio are conceptual schematic proposals intended for early aesthetic alignment and design exploration. They do not constitute construction working drawings, finish schedules, structural calculations, MEP engineering plans, or local building code certifications. Verify physical sample swatches under site daylight conditions prior to procurement.
          </p>
        </div>
      </div>
    </div>
  );
};
