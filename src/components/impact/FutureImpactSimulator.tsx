import React, { useState, useMemo } from 'react';
import { Project } from '../../types/project';
import {
  DesignScenario,
  OptimizationWeights,
  ScenarioEvaluation,
} from '../../types/scenario';
import {
  createBaselineScenario,
  initializeProjectScenarios,
  evaluateScenario,
  computeParetoOptimality,
  DEFAULT_OPTIMIZATION_WEIGHTS,
  WEIGHT_PRESETS,
} from '../../services/scenarioCalculator';
import { ScenarioParametersPanel } from './ScenarioParametersPanel';
import { MultiCriteriaOptimizerPanel } from './MultiCriteriaOptimizerPanel';
import { ImpactComparisonTable } from './ImpactComparisonTable';
import { ApplyScenarioModal } from './ApplyScenarioModal';
import { AssumptionsModal } from './AssumptionsModal';
import {
  ArrowLeft,
  Plus,
  Copy,
  Trash2,
  Edit2,
  Check,
  CheckCircle2,
  Layers,
  Sliders,
  Scale,
  Sparkles,
  BookOpen,
  Eye,
  Box,
  Palette,
  Network,
  RotateCcw,
  Maximize2,
  Table,
} from 'lucide-react';

interface FutureImpactSimulatorProps {
  project: Project;
  onSaveProject: (updated: Project) => void;
  onBack: () => void;
  onOpenFloorPlan?: (project: Project) => void;
  onOpen3DViewer?: (project: Project) => void;
  onOpenDesignStudio?: (project: Project) => void;
  onOpenDecisionTwin?: () => void;
  onOpenConstraintGraph?: () => void;
  onShowToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const FutureImpactSimulator: React.FC<FutureImpactSimulatorProps> = ({
  project,
  onSaveProject,
  onBack,
  onOpenFloorPlan,
  onOpen3DViewer,
  onOpenDesignStudio,
  onOpenDecisionTwin,
  onOpenConstraintGraph,
  onShowToast,
}) => {
  // Initialize scenarios list
  const [scenarios, setScenarios] = useState<DesignScenario[]>(() => {
    return initializeProjectScenarios(project);
  });

  // Track active scenario ID (default to first non-baseline alternative if available)
  const [activeScenarioId, setActiveScenarioId] = useState<string>(() => {
    const nonBaseline = scenarios.find((s) => !s.isBaseline);
    return nonBaseline ? nonBaseline.id : scenarios[0]?.id || 'baseline';
  });

  // Active editable draft state for live parameter tweaking
  const [draftScenario, setDraftScenario] = useState<DesignScenario | null>(null);

  // Optimizer Weights
  const [weights, setWeights] = useState<OptimizationWeights>(DEFAULT_OPTIMIZATION_WEIGHTS);
  const [activePresetKey, setActivePresetKey] = useState<string | null>('balanced');

  // Modals state
  const [isApplyModalOpen, setIsApplyModalOpen] = useState(false);
  const [isAssumptionsModalOpen, setIsAssumptionsModalOpen] = useState(false);
  const [editingNameScenarioId, setEditingNameScenarioId] = useState<string | null>(null);
  const [nameInputValue, setNameInputValue] = useState('');

  // View toggle: single detailed scenario vs all scenarios matrix
  const [viewMode, setViewMode] = useState<'single' | 'all-matrix'>('single');

  // Baseline Scenario (always matches active project)
  const baselineScenario = useMemo(() => {
    return scenarios.find((s) => s.isBaseline) || createBaselineScenario(project);
  }, [scenarios, project]);

  // Active Scenario reference
  const currentScenario = useMemo(() => {
    if (draftScenario && draftScenario.id === activeScenarioId) {
      return draftScenario;
    }
    const found = scenarios.find((s) => s.id === activeScenarioId);
    return found || baselineScenario;
  }, [draftScenario, scenarios, activeScenarioId, baselineScenario]);

  const hasUnsavedChanges = Boolean(
    draftScenario && draftScenario.id === activeScenarioId
  );

  // Evaluate all scenarios deterministically
  const evaluatedScenarios: ScenarioEvaluation[] = useMemo(() => {
    const evals = scenarios.map((scen) => {
      // If active scenario has unsaved draft changes, evaluate with draft
      const target =
        draftScenario && draftScenario.id === scen.id ? draftScenario : scen;
      return evaluateScenario(project, baselineScenario, target, weights);
    });
    return computeParetoOptimality(evals);
  }, [scenarios, draftScenario, project, baselineScenario, weights]);

  // Current active evaluation
  const activeEvaluation = useMemo(() => {
    return (
      evaluatedScenarios.find((e) => e.scenarioId === currentScenario.id) ||
      evaluatedScenarios[0]
    );
  }, [evaluatedScenarios, currentScenario]);

  // Weight preset change handler
  const handleSelectPreset = (presetKey: string) => {
    const preset = WEIGHT_PRESETS[presetKey];
    if (preset) {
      setWeights(preset.weights);
      setActivePresetKey(presetKey);
    }
  };

  const handleCustomWeights = (newWeights: OptimizationWeights) => {
    setWeights(newWeights);
    setActivePresetKey(null);
  };

  // Scenario updates in draft
  const handleUpdateDraft = (updated: DesignScenario) => {
    setDraftScenario(updated);
  };

  // Reset current scenario to baseline values
  const handleResetToBaseline = () => {
    const resetScen: DesignScenario = {
      ...currentScenario,
      floors: baselineScenario.floors,
      budget: baselineScenario.budget,
      rooms: JSON.parse(JSON.stringify(baselineScenario.rooms)),
      facade: baselineScenario.facade ? JSON.parse(JSON.stringify(baselineScenario.facade)) : undefined,
      status: 'saved',
      updatedAt: new Date().toISOString(),
    };
    setDraftScenario(null);
    const updatedList = scenarios.map((s) =>
      s.id === resetScen.id ? resetScen : s
    );
    setScenarios(updatedList);
    onSaveProject({
      ...project,
      scenarios: updatedList,
    });
    onShowToast?.(`Reset "${currentScenario.name}" to match baseline.`, 'info');
  };

  // Save draft scenario
  const handleSaveScenario = () => {
    if (!draftScenario) return;
    const saved: DesignScenario = {
      ...draftScenario,
      status: 'saved',
      updatedAt: new Date().toISOString(),
    };
    const updatedList = scenarios.map((s) =>
      s.id === saved.id ? saved : s
    );
    setScenarios(updatedList);
    setDraftScenario(null);
    onSaveProject({
      ...project,
      scenarios: updatedList,
      activeScenarioId: saved.id,
    });
    onShowToast?.(`Scenario "${saved.name}" saved!`, 'success');
  };

  // Create new scenario
  const handleCreateScenario = () => {
    const newId = `scenario-${Date.now()}`;
    const newName = `Alternative Scenario ${scenarios.filter((s) => !s.isBaseline).length + 1}`;
    const newScenario: DesignScenario = {
      id: newId,
      name: newName,
      description: 'Alternative design scenario for comparative impact simulation.',
      status: 'saved',
      isBaseline: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      floors: currentScenario.floors,
      budget: currentScenario.budget,
      rooms: JSON.parse(JSON.stringify(currentScenario.rooms)),
      facade: currentScenario.facade ? JSON.parse(JSON.stringify(currentScenario.facade)) : undefined,
    };

    const updated = [...scenarios, newScenario];
    setScenarios(updated);
    setActiveScenarioId(newId);
    setDraftScenario(null);
    onSaveProject({
      ...project,
      scenarios: updated,
      activeScenarioId: newId,
    });
    onShowToast?.(`Created "${newName}"`, 'success');
  };

  // Duplicate scenario
  const handleDuplicateScenario = () => {
    const newId = `scenario-copy-${Date.now()}`;
    const newName = `Copy of ${currentScenario.name}`;
    const newScenario: DesignScenario = {
      ...currentScenario,
      id: newId,
      name: newName,
      status: 'saved',
      isBaseline: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      rooms: JSON.parse(JSON.stringify(currentScenario.rooms)),
    };

    const updated = [...scenarios, newScenario];
    setScenarios(updated);
    setActiveScenarioId(newId);
    setDraftScenario(null);
    onSaveProject({
      ...project,
      scenarios: updated,
      activeScenarioId: newId,
    });
    onShowToast?.(`Duplicated to "${newName}"`, 'success');
  };

  // Delete scenario
  const handleDeleteScenario = (scenarioId: string) => {
    if (scenarios.length <= 1) return;
    const scen = scenarios.find((s) => s.id === scenarioId);
    if (scen?.isBaseline) {
      onShowToast?.('Cannot delete the original baseline project scenario.', 'error');
      return;
    }

    const updated = scenarios.filter((s) => s.id !== scenarioId);
    setScenarios(updated);
    if (activeScenarioId === scenarioId) {
      setActiveScenarioId(updated[0]?.id || 'baseline');
      setDraftScenario(null);
    }
    onSaveProject({
      ...project,
      scenarios: updated,
    });
    onShowToast?.(`Removed scenario "${scen?.name}".`, 'info');
  };

  // Rename scenario
  const handleStartRename = (scen: DesignScenario) => {
    setEditingNameScenarioId(scen.id);
    setNameInputValue(scen.name);
  };

  const handleFinishRename = (scenarioId: string) => {
    if (!nameInputValue.trim()) {
      setEditingNameScenarioId(null);
      return;
    }
    const updated = scenarios.map((s) =>
      s.id === scenarioId ? { ...s, name: nameInputValue.trim(), updatedAt: new Date().toISOString() } : s
    );
    setScenarios(updated);
    if (draftScenario && draftScenario.id === scenarioId) {
      setDraftScenario({ ...draftScenario, name: nameInputValue.trim() });
    }
    setEditingNameScenarioId(null);
    onSaveProject({
      ...project,
      scenarios: updated,
    });
    onShowToast?.('Scenario name updated.', 'success');
  };

  // Apply scenario to main project
  const handleConfirmApplyToProject = () => {
    const updatedProject: Project = {
      ...project,
      floors: currentScenario.floors,
      budget: currentScenario.budget,
      floorPlan: {
        rooms: JSON.parse(JSON.stringify(currentScenario.rooms)),
      },
      updatedAt: new Date().toISOString(),
    };

    // Update active alternative facade if scenario has custom facade
    if (currentScenario.facade && updatedProject.designAlternatives && updatedProject.designAlternatives.length > 0) {
      const activeAltId = updatedProject.activeAlternativeId || updatedProject.designAlternatives[0].id;
      updatedProject.designAlternatives = updatedProject.designAlternatives.map((alt) =>
        alt.id === activeAltId ? { ...alt, facade: JSON.parse(JSON.stringify(currentScenario.facade!)) } : alt
      );
    }

    // Refresh baseline scenario
    const newBaseline = createBaselineScenario(updatedProject);
    const updatedScenarios = [
      newBaseline,
      ...scenarios.filter((s) => !s.isBaseline),
    ];
    updatedProject.scenarios = updatedScenarios;

    setScenarios(updatedScenarios);
    setDraftScenario(null);
    setActiveScenarioId(newBaseline.id);

    onSaveProject(updatedProject);
    onShowToast?.(`Successfully applied "${currentScenario.name}" to main project!`, 'success');
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Top Breadcrumb & Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer mb-1.5"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Project Overview</span>
          </button>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-teal-800 text-teal-300 flex items-center justify-center font-bold shadow-xs">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Future-Impact Simulator & Optimizer
              </h1>
              <p className="text-xs text-slate-500">
                Explore design alternatives for <strong className="text-slate-800">{project.name}</strong>, inspect trade-offs, and compare deterministic metrics without mutating your baseline.
              </p>
            </div>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsAssumptionsModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-2xs transition-colors cursor-pointer"
          >
            <BookOpen className="w-3.5 h-3.5 text-teal-700" />
            <span>Assumptions & Disclaimers</span>
          </button>

          {!currentScenario.isBaseline && (
            <button
              onClick={() => setIsApplyModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-teal-800 hover:bg-teal-900 rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Apply to Main Project</span>
            </button>
          )}
        </div>
      </div>

      {/* Scenario Selector Tabs Bar */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider shrink-0 mr-1">
            Scenarios:
          </span>

          {scenarios.map((scen) => {
            const isActive = scen.id === activeScenarioId;
            const isEditingName = editingNameScenarioId === scen.id;

            return (
              <div
                key={scen.id}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all shrink-0 ${
                  isActive
                    ? 'bg-teal-50 text-teal-900 border-teal-300 shadow-2xs'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {isEditingName ? (
                  <input
                    type="text"
                    value={nameInputValue}
                    onChange={(e) => setNameInputValue(e.target.value)}
                    onBlur={() => handleFinishRename(scen.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleFinishRename(scen.id);
                      if (e.key === 'Escape') setEditingNameScenarioId(null);
                    }}
                    autoFocus
                    className="w-36 px-1.5 py-0.5 text-xs bg-white border border-teal-500 rounded-md focus:outline-hidden"
                  />
                ) : (
                  <button
                    onClick={() => {
                      setActiveScenarioId(scen.id);
                      setDraftScenario(null);
                    }}
                    className="cursor-pointer font-bold tracking-tight"
                  >
                    {scen.name}
                  </button>
                )}

                {/* Status Badges */}
                {scen.isBaseline ? (
                  <span className="text-[10px] font-bold text-slate-500 bg-slate-200/60 px-1.5 py-0.5 rounded-md">
                    Baseline
                  </span>
                ) : hasUnsavedChanges && isActive ? (
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-md">
                    Draft
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold text-teal-700 bg-teal-100/70 px-1.5 py-0.5 rounded-md">
                    Saved
                  </span>
                )}

                {/* Edit Name & Delete for non-baseline */}
                {!scen.isBaseline && !isEditingName && (
                  <div className="flex items-center gap-1 ml-1 text-slate-400">
                    <button
                      onClick={() => handleStartRename(scen)}
                      className="hover:text-slate-700 p-0.5 rounded-sm cursor-pointer"
                      title="Rename scenario"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => handleDeleteScenario(scen.id)}
                      className="hover:text-rose-600 p-0.5 rounded-sm cursor-pointer"
                      title="Delete scenario"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleDuplicateScenario}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer"
            title="Duplicate active scenario"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Duplicate</span>
          </button>
          <button
            onClick={handleCreateScenario}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-2xs transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Scenario</span>
          </button>
        </div>
      </div>

      {/* View Toggle Bar */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-500">
          Showing impact analysis for{' '}
          <strong className="text-slate-900">{currentScenario.name}</strong> vs{' '}
          <span className="text-slate-700">Baseline Project</span>
        </div>

        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
          <button
            onClick={() => setViewMode('single')}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
              viewMode === 'single'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Detailed Scenario View
          </button>
          <button
            onClick={() => setViewMode('all-matrix')}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
              viewMode === 'all-matrix'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Multi-Scenario Comparison Grid
          </button>
        </div>
      </div>

      {viewMode === 'single' ? (
        <>
          {/* 1. Interactive Parameter Playground */}
          <ScenarioParametersPanel
            project={project}
            scenario={currentScenario}
            isBaseline={currentScenario.isBaseline}
            onUpdateScenario={handleUpdateDraft}
            onResetToBaseline={handleResetToBaseline}
            onSaveScenario={handleSaveScenario}
            hasUnsavedChanges={hasUnsavedChanges}
          />

          {/* 2. Multi-Criteria Design Optimizer */}
          <MultiCriteriaOptimizerPanel
            evaluation={activeEvaluation}
            weights={weights}
            onUpdateWeights={handleCustomWeights}
            onSelectPreset={handleSelectPreset}
            activePresetKey={activePresetKey}
          />

          {/* 3. Side-by-Side Measurable Impact Table */}
          <ImpactComparisonTable
            metrics={activeEvaluation.metrics}
            baselineName={baselineScenario.name}
            scenarioName={currentScenario.name}
          />
        </>
      ) : (
        /* Multi-Scenario Grid Comparison View */
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-6">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Cross-Scenario Synthesis Matrix
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Side-by-side comparison across all saved alternatives evaluated against the baseline.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {evaluatedScenarios.map((ev) => {
              const scen = scenarios.find((s) => s.id === ev.scenarioId);
              if (!scen) return null;
              const isCurrent = scen.id === activeScenarioId;

              const usableArea = ev.metrics.find((m) => m.id === 'usable-area');
              const gfa = ev.metrics.find((m) => m.id === 'gross-floor-area');
              const cost = ev.metrics.find((m) => m.id === 'construction-cost');
              const conflicts = ev.metrics.find((m) => m.id === 'geometry-conflicts');
              const carbon = ev.metrics.find((m) => m.id === 'embodied-carbon');

              return (
                <div
                  key={scen.id}
                  className={`rounded-xl border p-5 space-y-4 transition-all ${
                    isCurrent
                      ? 'border-teal-500 bg-teal-50/20 ring-1 ring-teal-500'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        {scen.isBaseline ? 'Baseline Design' : 'Alternative Scenario'}
                      </div>
                      <h4 className="text-sm font-bold text-slate-900">
                        {scen.name}
                      </h4>
                    </div>

                    <div className="text-right">
                      <div className="text-base font-black text-slate-900 tabular-nums">
                        {ev.compositeScore}
                      </div>
                      <div className="text-[10px] font-bold text-teal-700">
                        {ev.isParetoOptimal ? 'Pareto Optimal' : 'Alternative'}
                      </div>
                    </div>
                  </div>

                  {/* Quick Key Metrics */}
                  <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-100">
                    <div className="bg-slate-50 p-2 rounded-md">
                      <span className="text-[10px] text-slate-400 block">Floors / GFA:</span>
                      <span className="font-semibold text-slate-800">
                        {scen.floors}F · {gfa?.scenarioDisplay}
                      </span>
                    </div>

                    <div className="bg-slate-50 p-2 rounded-md">
                      <span className="text-[10px] text-slate-400 block">Estimated Cost:</span>
                      <span className="font-semibold text-slate-800">
                        {cost?.scenarioDisplay}
                      </span>
                    </div>

                    <div className="bg-slate-50 p-2 rounded-md">
                      <span className="text-[10px] text-slate-400 block">Compliance:</span>
                      <span className="font-semibold text-slate-800">
                        {conflicts?.scenarioRaw === 0 ? 'Zero Conflicts' : `${conflicts?.scenarioRaw} Issues`}
                      </span>
                    </div>

                    <div className="bg-slate-50 p-2 rounded-md">
                      <span className="text-[10px] text-slate-400 block">Embodied Carbon:</span>
                      <span className="font-semibold text-slate-800">
                        {carbon?.scenarioDisplay}
                      </span>
                    </div>
                  </div>

                  {/* Trade-off summary */}
                  {ev.tradeOffSummary.length > 0 && (
                    <div className="text-[11px] text-amber-900 bg-amber-50/80 p-2.5 rounded-lg border border-amber-200">
                      <strong>Trade-Off:</strong> {ev.tradeOffSummary[0]}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <button
                      onClick={() => {
                        setActiveScenarioId(scen.id);
                        setViewMode('single');
                      }}
                      className="text-xs font-semibold text-teal-800 hover:text-teal-900 cursor-pointer"
                    >
                      Inspect in Simulator →
                    </button>

                    {!scen.isBaseline && (
                      <button
                        onClick={() => {
                          setActiveScenarioId(scen.id);
                          setIsApplyModalOpen(true);
                        }}
                        className="text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                      >
                        Apply to Project
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Confirmation Modal to Apply Scenario */}
      <ApplyScenarioModal
        isOpen={isApplyModalOpen}
        onClose={() => setIsApplyModalOpen(false)}
        onConfirm={handleConfirmApplyToProject}
        project={project}
        scenario={currentScenario}
      />

      {/* Assumptions & Technical Limitations Modal */}
      <AssumptionsModal
        isOpen={isAssumptionsModalOpen}
        onClose={() => setIsAssumptionsModalOpen(false)}
      />
    </div>
  );
};
