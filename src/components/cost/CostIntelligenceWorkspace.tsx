import React, { useState, useMemo } from 'react';
import { Project } from '../../types/project';
import {
  CostPlanningState,
  CostScenario,
  ConstructionPhase,
} from '../../types/costPlanning';
import {
  initializeProjectCostPlanning,
  calculateCostSummary,
  generateDeterministicQTO,
  computeProjectGeometryHash,
} from '../../services/costPlanningService';
import { CostOverviewHeader } from './CostOverviewHeader';
import { ItemizedEstimateTable } from './ItemizedEstimateTable';
import { BudgetControlPanel } from './BudgetControlPanel';
import { CostScenariosView } from './CostScenariosView';
import { ConstructionPlanningView } from './ConstructionPlanningView';
import { CostAssumptionsModal } from './CostAssumptionsModal';
import {
  ArrowLeft,
  DollarSign,
  Scale,
  Calendar,
  Layers,
  Save,
  RotateCcw,
  BookOpen,
  PieChart,
  HardHat,
  Boxes,
  HelpCircle,
  FileCheck2,
} from 'lucide-react';

interface CostIntelligenceWorkspaceProps {
  project: Project;
  onSaveProject: (updated: Project) => void;
  onBack: () => void;
  onOpenFloorPlan?: (project: Project) => void;
  onOpen3DViewer?: (project: Project) => void;
  onOpenDesignStudio?: (project: Project) => void;
  onOpenDecisionTwin?: () => void;
  onOpenConstraintGraph?: () => void;
  onOpenEvidenceLedger?: (project: Project) => void;
  onShowToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const CostIntelligenceWorkspace: React.FC<CostIntelligenceWorkspaceProps> = ({
  project,
  onSaveProject,
  onBack,
  onOpenFloorPlan,
  onOpen3DViewer,
  onOpenDesignStudio,
  onOpenDecisionTwin,
  onOpenConstraintGraph,
  onOpenEvidenceLedger,
  onShowToast,
}) => {
  // Initialize cost planning state
  const [costPlanning, setCostPlanning] = useState<CostPlanningState>(() => {
    return initializeProjectCostPlanning(project);
  });

  const [activeSubTab, setActiveSubTab] = useState<'estimate' | 'budget' | 'scenarios' | 'schedule'>('estimate');
  const [isAssumptionsModalOpen, setIsAssumptionsModalOpen] = useState(false);

  // Active scenario
  const activeScenario = useMemo(() => {
    const found = costPlanning.scenarios.find(
      (s) => s.id === costPlanning.activeScenarioId
    );
    return found || costPlanning.scenarios[0];
  }, [costPlanning.scenarios, costPlanning.activeScenarioId]);

  // Current project geometry hash to check staleness
  const currentGeomHash = useMemo(() => {
    return computeProjectGeometryHash(project);
  }, [project]);

  // Calculated summary metrics
  const summary = useMemo(() => {
    return calculateCostSummary(
      activeScenario,
      costPlanning.targetBudget,
      currentGeomHash
    );
  }, [activeScenario, costPlanning.targetBudget, currentGeomHash]);

  // Schedule metrics
  const scheduleMetrics = useMemo(() => {
    if (costPlanning.phases.length === 0) return { totalDays: 0, endDate: 'N/A' };
    let minStart = new Date(costPlanning.phases[0].startDate).getTime();
    let maxEnd = minStart;

    costPlanning.phases.forEach((p) => {
      const s = new Date(p.startDate).getTime();
      const e = s + p.durationDays * 24 * 60 * 60 * 1000;
      if (s < minStart) minStart = s;
      if (e > maxEnd) maxEnd = e;
    });

    const totalDays = Math.round((maxEnd - minStart) / (1000 * 60 * 60 * 24));
    return {
      totalDays,
      endDate: new Date(maxEnd).toISOString().split('T')[0],
    };
  }, [costPlanning.phases]);

  // Update scenario helper
  const handleUpdateScenario = (updated: CostScenario) => {
    const updatedScenarios = costPlanning.scenarios.map((s) =>
      s.id === updated.id ? updated : s
    );
    const updatedState: CostPlanningState = {
      ...costPlanning,
      scenarios: updatedScenarios,
    };
    setCostPlanning(updatedState);
    onSaveProject({
      ...project,
      costPlanning: updatedState,
    });
  };

  // Recalculate QTO (sync with active floor plan geometry)
  const handleRecalculateTakeOff = () => {
    const freshLineItems = generateDeterministicQTO(project);
    const updatedScenarios = costPlanning.scenarios.map((scen) => {
      if (scen.id === activeScenario.id) {
        // Keep custom user-entered items, refresh geometry-derived items
        const userItems = scen.lineItems.filter((i) => i.quantitySource === 'user-entered');
        const refreshed = freshLineItems.map((fresh) => {
          // Preserve any custom unit rate the user previously edited for this code!
          const existing = scen.lineItems.find((e) => e.code === fresh.code);
          const rate = existing && existing.unitRate > 0 ? existing.unitRate : fresh.unitRate;
          return {
            ...fresh,
            unitRate: rate,
            extendedCost: Math.round(fresh.quantity * rate),
            isStale: false,
          };
        });

        return {
          ...scen,
          lineItems: [...refreshed, ...userItems],
          sourceGeometryHash: currentGeomHash,
          updatedAt: new Date().toISOString(),
        };
      }
      return scen;
    });

    const updatedState: CostPlanningState = {
      ...costPlanning,
      scenarios: updatedScenarios,
      lastRecalculatedAt: new Date().toISOString(),
      lastGeometryHash: currentGeomHash,
    };

    setCostPlanning(updatedState);
    onSaveProject({
      ...project,
      costPlanning: updatedState,
    });

    onShowToast?.('Bill of quantities successfully resynced with 2D floor plan!', 'success');
  };

  // Target Budget change
  const handleTargetBudgetChange = (newBudget: number) => {
    const updatedState: CostPlanningState = {
      ...costPlanning,
      targetBudget: newBudget,
    };
    setCostPlanning(updatedState);
    onSaveProject({
      ...project,
      budget: newBudget,
      costPlanning: updatedState,
    });
    onShowToast?.(`Target budget updated to ${newBudget.toLocaleString()} ${project.currency}`, 'info');
  };

  // Create new scenario
  const handleCreateScenario = () => {
    const newId = `cost-scen-${Date.now()}`;
    const newName = `Alternative Specification ${costPlanning.scenarios.length + 1}`;
    const freshLineItems = generateDeterministicQTO(project);

    const newScenario: CostScenario = {
      id: newId,
      name: newName,
      description: 'Alternative cost model exploring modified material rates and contingencies.',
      isBaseline: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      location: activeScenario.location,
      currency: project.currency,
      contingencyRatePercent: 7.5,
      taxRatePercent: 0,
      lineItems: freshLineItems,
      sourceGeometryHash: currentGeomHash,
    };

    const updatedScenarios = [...costPlanning.scenarios, newScenario];
    const updatedState: CostPlanningState = {
      ...costPlanning,
      scenarios: updatedScenarios,
      activeScenarioId: newId,
    };

    setCostPlanning(updatedState);
    onSaveProject({
      ...project,
      costPlanning: updatedState,
    });
    onShowToast?.(`Created "${newName}"`, 'success');
  };

  // Duplicate scenario
  const handleDuplicateScenario = (id: string) => {
    const target = costPlanning.scenarios.find((s) => s.id === id);
    if (!target) return;

    const newId = `cost-scen-copy-${Date.now()}`;
    const newName = `Copy of ${target.name}`;

    const newScenario: CostScenario = {
      ...target,
      id: newId,
      name: newName,
      isBaseline: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lineItems: target.lineItems.map((item) => ({ ...item, id: `${item.id}-copy` })),
    };

    const updatedScenarios = [...costPlanning.scenarios, newScenario];
    const updatedState: CostPlanningState = {
      ...costPlanning,
      scenarios: updatedScenarios,
      activeScenarioId: newId,
    };

    setCostPlanning(updatedState);
    onSaveProject({
      ...project,
      costPlanning: updatedState,
    });
    onShowToast?.(`Duplicated scenario to "${newName}"`, 'success');
  };

  // Delete scenario
  const handleDeleteScenario = (id: string) => {
    if (costPlanning.scenarios.length <= 1) return;
    const scen = costPlanning.scenarios.find((s) => s.id === id);
    if (scen?.isBaseline) {
      onShowToast?.('Cannot delete the baseline specification scenario.', 'error');
      return;
    }

    const updatedScenarios = costPlanning.scenarios.filter((s) => s.id !== id);
    const updatedState: CostPlanningState = {
      ...costPlanning,
      scenarios: updatedScenarios,
      activeScenarioId:
        costPlanning.activeScenarioId === id
          ? updatedScenarios[0]?.id || 'baseline'
          : costPlanning.activeScenarioId,
    };

    setCostPlanning(updatedState);
    onSaveProject({
      ...project,
      costPlanning: updatedState,
    });
    onShowToast?.(`Deleted scenario "${scen?.name}".`, 'info');
  };

  // Phases update handler
  const handleUpdatePhases = (updatedPhases: ConstructionPhase[]) => {
    const updatedState: CostPlanningState = {
      ...costPlanning,
      phases: updatedPhases,
    };
    setCostPlanning(updatedState);
    onSaveProject({
      ...project,
      costPlanning: updatedState,
    });
    onShowToast?.('Construction phase schedule updated.', 'success');
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Top Breadcrumb & Header */}
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
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Cost Intelligence & Construction Planning
              </h1>
              <p className="text-xs text-slate-500">
                Geometry-aware quantity takeoff, trade-by-trade cost estimation, and preliminary phase scheduling for{' '}
                <strong className="text-slate-800">{project.name}</strong>.
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {onOpenFloorPlan && (
            <button
              onClick={() => onOpenFloorPlan(project)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors cursor-pointer"
            >
              <span>View 2D Geometry</span>
            </button>
          )}

          <button
            onClick={() => setIsAssumptionsModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-2xs transition-colors cursor-pointer"
          >
            <BookOpen className="w-3.5 h-3.5 text-teal-700" />
            <span>QTO Formulas & Limits</span>
          </button>

          {onOpenEvidenceLedger && (
            <button
              onClick={() => onOpenEvidenceLedger(project)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-900 bg-teal-100/70 hover:bg-teal-200/70 border border-teal-300 rounded-lg transition-colors cursor-pointer"
              title="Inspect Proof-Carrying Design records for cost calculations"
            >
              <FileCheck2 className="w-3.5 h-3.5 text-teal-800" />
              <span>Evidence Ledger</span>
            </button>
          )}
        </div>
      </div>

      {/* Overview KPI Header */}
      <CostOverviewHeader
        project={project}
        activeScenario={activeScenario}
        summary={summary}
        totalScheduleDays={scheduleMetrics.totalDays}
        projectedEndDate={scheduleMetrics.endDate}
        onRecalculateTakeOff={handleRecalculateTakeOff}
        onOpenAssumptionsModal={() => setIsAssumptionsModalOpen(true)}
        onTargetBudgetChange={handleTargetBudgetChange}
      />

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-1 bg-slate-100 p-1.5 rounded-xl border border-slate-200 overflow-x-auto">
        <button
          onClick={() => setActiveSubTab('estimate')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 ${
            activeSubTab === 'estimate'
              ? 'bg-white text-slate-900 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Boxes className="w-3.5 h-3.5 text-teal-700" />
          <span>Itemized Estimate ({activeScenario.lineItems.length} items)</span>
        </button>

        <button
          onClick={() => setActiveSubTab('budget')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 ${
            activeSubTab === 'budget'
              ? 'bg-white text-slate-900 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <PieChart className="w-3.5 h-3.5 text-teal-700" />
          <span>Budget Control & Pareto Drivers</span>
        </button>

        <button
          onClick={() => setActiveSubTab('scenarios')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 ${
            activeSubTab === 'scenarios'
              ? 'bg-white text-slate-900 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Scale className="w-3.5 h-3.5 text-teal-700" />
          <span>Cost Scenarios Matrix ({costPlanning.scenarios.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('schedule')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 ${
            activeSubTab === 'schedule'
              ? 'bg-white text-slate-900 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Calendar className="w-3.5 h-3.5 text-teal-700" />
          <span>Construction Staging ({costPlanning.phases.length} Phases)</span>
        </button>
      </div>

      {/* Tab Contents */}
      {activeSubTab === 'estimate' && (
        <ItemizedEstimateTable
          project={project}
          scenario={activeScenario}
          onUpdateScenario={handleUpdateScenario}
        />
      )}

      {activeSubTab === 'budget' && (
        <BudgetControlPanel
          project={project}
          summary={summary}
        />
      )}

      {activeSubTab === 'scenarios' && (
        <CostScenariosView
          project={project}
          scenarios={costPlanning.scenarios}
          activeScenarioId={costPlanning.activeScenarioId}
          targetBudget={costPlanning.targetBudget}
          onSelectScenario={(id) => {
            const updatedState = { ...costPlanning, activeScenarioId: id };
            setCostPlanning(updatedState);
            onSaveProject({ ...project, costPlanning: updatedState });
          }}
          onCreateScenario={handleCreateScenario}
          onDuplicateScenario={handleDuplicateScenario}
          onDeleteScenario={handleDeleteScenario}
        />
      )}

      {activeSubTab === 'schedule' && (
        <ConstructionPlanningView
          project={project}
          phases={costPlanning.phases}
          onUpdatePhases={handleUpdatePhases}
        />
      )}

      {/* Transparency & Assumptions Report Modal */}
      <CostAssumptionsModal
        isOpen={isAssumptionsModalOpen}
        onClose={() => setIsAssumptionsModalOpen(false)}
      />
    </div>
  );
};
