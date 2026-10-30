import React, { useState, useMemo } from 'react';
import { Project } from '../../types/project';
import {
  ConstructionPhase,
  ConstructionPhaseStatus,
} from '../../types/costPlanning';
import {
  validateConstructionPhases,
} from '../../services/costPlanningService';
import { formatCurrency } from '../../utils/formatters';
import {
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  PlayCircle,
  PauseCircle,
  Plus,
  Trash2,
  Edit2,
  ArrowRight,
  ShieldAlert,
  Info,
} from 'lucide-react';

interface ConstructionPlanningViewProps {
  project: Project;
  phases: ConstructionPhase[];
  onUpdatePhases: (updated: ConstructionPhase[]) => void;
}

export const ConstructionPlanningView: React.FC<ConstructionPlanningViewProps> = ({
  project,
  phases,
  onUpdatePhases,
}) => {
  const [editingPhaseId, setEditingPhaseId] = useState<string | null>(null);

  // Add new phase modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newPhaseName, setNewPhaseName] = useState('');
  const [newPhaseDescription, setNewPhaseDescription] = useState('');
  const [newPhaseStartDate, setNewPhaseStartDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [newPhaseDuration, setNewPhaseDuration] = useState(30);
  const [newPhaseResponsible, setNewPhaseResponsible] = useState('General Contractor');
  const [newPhaseBudget, setNewPhaseBudget] = useState(50000);
  const [newPhasePredecessor, setNewPhasePredecessor] = useState('');

  // Validate dependencies
  const conflictWarnings = useMemo(() => {
    return validateConstructionPhases(phases);
  }, [phases]);

  // Overall schedule calculation
  const scheduleMetrics = useMemo(() => {
    if (phases.length === 0) {
      return { totalDays: 0, startDate: 'N/A', endDate: 'N/A', allocatedTotal: 0 };
    }

    let minStart = new Date(phases[0].startDate).getTime();
    let maxEnd = minStart;
    let allocatedTotal = 0;

    phases.forEach((p) => {
      const s = new Date(p.startDate).getTime();
      const e = s + p.durationDays * 24 * 60 * 60 * 1000;
      if (s < minStart) minStart = s;
      if (e > maxEnd) maxEnd = e;
      allocatedTotal += p.allocatedBudget || 0;
    });

    const totalDays = Math.round((maxEnd - minStart) / (1000 * 60 * 60 * 24));
    return {
      totalDays,
      startDate: new Date(minStart).toISOString().split('T')[0],
      endDate: new Date(maxEnd).toISOString().split('T')[0],
      allocatedTotal,
    };
  }, [phases]);

  // Update phase helper
  const handleUpdatePhase = (phaseId: string, updates: Partial<ConstructionPhase>) => {
    const updatedList = phases.map((p) =>
      p.id === phaseId ? { ...p, ...updates } : p
    );
    onUpdatePhases(updatedList);
  };

  // Delete phase helper
  const handleDeletePhase = (phaseId: string) => {
    if (phases.length <= 1) return;
    const updatedList = phases.filter((p) => p.id !== phaseId);
    onUpdatePhases(updatedList);
  };

  // Add phase helper
  const handleCreatePhase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPhaseName.trim()) return;

    const newPhase: ConstructionPhase = {
      id: `phase-custom-${Date.now()}`,
      phaseNumber: phases.length + 1,
      name: newPhaseName.trim(),
      description: newPhaseDescription.trim() || 'Custom preliminary construction stage.',
      startDate: newPhaseStartDate,
      durationDays: Math.max(1, newPhaseDuration),
      dependencies: newPhasePredecessor ? [newPhasePredecessor] : [],
      responsibleParty: newPhaseResponsible.trim() || 'General Contractor',
      allocatedBudget: Math.max(0, newPhaseBudget),
      status: 'not-started',
    };

    onUpdatePhases([...phases, newPhase]);
    setNewPhaseName('');
    setNewPhaseDescription('');
    setIsAddModalOpen(false);
  };

  const getStatusBadge = (status: ConstructionPhaseStatus) => {
    switch (status) {
      case 'complete':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-teal-50 text-teal-800 border border-teal-200">
            <CheckCircle2 className="w-3 h-3 text-teal-600" />
            Complete
          </span>
        );
      case 'in-progress':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
            <PlayCircle className="w-3 h-3 text-blue-600" />
            In Progress
          </span>
        );
      case 'blocked':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-rose-50 text-rose-800 border border-rose-200">
            <PauseCircle className="w-3 h-3 text-rose-600" />
            Blocked
          </span>
        );
      case 'not-started':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
            <Clock className="w-3 h-3 text-slate-400" />
            Not Started
          </span>
        );
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-teal-700" />
            <h3 className="text-base font-bold text-slate-900">
              Preliminary Construction Planning & Staging
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Phase-by-phase execution schedule, predecessor dependency checking, and trade budget allocations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-teal-800 hover:bg-teal-900 rounded-lg shadow-2xs transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Stage</span>
          </button>
        </div>
      </div>

      {/* Dependency Conflict Warning Banner */}
      {conflictWarnings.length > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-rose-900">
            <ShieldAlert className="w-4 h-4 text-rose-700" />
            <span>Scheduling Dependency Conflicts Detected ({conflictWarnings.length})</span>
          </div>
          <ul className="space-y-1 text-xs text-rose-800">
            {conflictWarnings.map((w, idx) => (
              <li key={idx} className="flex items-start gap-1.5">
                <span className="text-rose-500 font-bold">•</span>
                <span>
                  <strong>{w.phaseName}:</strong> {w.reason}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Schedule Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
        <div>
          <span className="text-slate-400 block text-[10px] font-semibold uppercase">
            Total Calendar Duration
          </span>
          <span className="text-base font-black text-slate-900 tabular-nums">
            {scheduleMetrics.totalDays} Days (~{Math.round(scheduleMetrics.totalDays / 7)} Wks)
          </span>
        </div>

        <div>
          <span className="text-slate-400 block text-[10px] font-semibold uppercase">
            Mobilization Date
          </span>
          <span className="text-sm font-bold text-slate-900 font-mono">
            {scheduleMetrics.startDate}
          </span>
        </div>

        <div>
          <span className="text-slate-400 block text-[10px] font-semibold uppercase">
            Projected Completion
          </span>
          <span className="text-sm font-bold text-slate-900 font-mono">
            {scheduleMetrics.endDate}
          </span>
        </div>

        <div>
          <span className="text-slate-400 block text-[10px] font-semibold uppercase">
            Phase Budget Allocations
          </span>
          <span className="text-sm font-bold text-slate-900 tabular-nums">
            {formatCurrency(scheduleMetrics.allocatedTotal, project.currency)}
          </span>
        </div>
      </div>

      {/* Timeline Gantt Representation */}
      <div className="space-y-2 pt-2">
        <span className="text-xs font-bold text-slate-800 block">
          Sequential Stage Progression & Status
        </span>

        <div className="space-y-3">
          {phases.map((phase, idx) => {
            const hasConflict = conflictWarnings.some((w) => w.phaseId === phase.id);

            return (
              <div
                key={phase.id}
                className={`p-4 rounded-xl border transition-all ${
                  hasConflict
                    ? 'border-rose-300 bg-rose-50/30'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  {/* Left: Phase Title & Description */}
                  <div className="flex items-start gap-3">
                    <span className="w-7 h-7 rounded-lg bg-slate-900 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                      {phase.phaseNumber || idx + 1}
                    </span>

                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-sm font-bold text-slate-900">
                          {phase.name}
                        </h4>
                        {getStatusBadge(phase.status)}
                        {hasConflict && (
                          <span className="text-[10px] font-bold text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded-md border border-rose-200 flex items-center gap-1">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            Dependency Conflict
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-500">
                        {phase.description}
                      </p>

                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600 pt-0.5">
                        <span>
                          <strong>Trades:</strong> {phase.responsibleParty}
                        </span>
                        {phase.dependencies.length > 0 && (
                          <span>
                            <strong>Predecessors:</strong>{' '}
                            {phase.dependencies
                              .map((id) => phases.find((p) => p.id === id)?.name || id)
                              .join(', ')}
                          </span>
                        )}
                        {phase.notes && (
                          <span className="text-slate-400 italic">
                            ({phase.notes})
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Date, Duration, Budget & Status selector */}
                  <div className="flex flex-wrap items-center gap-3 self-end lg:self-center shrink-0">
                    <div className="text-right text-xs">
                      <div className="font-bold text-slate-900 tabular-nums">
                        {formatCurrency(phase.allocatedBudget, project.currency)}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {phase.startDate} ({phase.durationDays} days)
                      </div>
                    </div>

                    {/* Status Dropdown */}
                    <select
                      value={phase.status}
                      onChange={(e) =>
                        handleUpdatePhase(phase.id, {
                          status: e.target.value as ConstructionPhaseStatus,
                        })
                      }
                      className="text-xs font-semibold px-2.5 py-1 bg-slate-50 border border-slate-300 rounded-lg focus:ring-1 focus:ring-teal-500 cursor-pointer"
                    >
                      <option value="not-started">Not Started</option>
                      <option value="in-progress">In Progress</option>
                      <option value="blocked">Blocked</option>
                      <option value="complete">Complete</option>
                    </select>

                    {/* Delete phase button */}
                    <button
                      onClick={() => handleDeletePhase(phase.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md hover:bg-rose-50 cursor-pointer"
                      title="Remove stage"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add Custom Stage Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <h4 className="text-base font-bold text-slate-900">
              Add Preliminary Construction Stage
            </h4>

            <form onSubmit={handleCreatePhase} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Stage Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Landscaping, Hardscape & Boundary Fencing"
                  value={newPhaseName}
                  onChange={(e) => setNewPhaseName(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Scope Description
                </label>
                <input
                  type="text"
                  placeholder="e.g. Retaining walls, perimeter fence, sod and exterior lighting"
                  value={newPhaseDescription}
                  onChange={(e) => setNewPhaseDescription(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Planned Start Date
                  </label>
                  <input
                    type="date"
                    required
                    value={newPhaseStartDate}
                    onChange={(e) => setNewPhaseStartDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Duration (Days)
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={newPhaseDuration}
                    onChange={(e) => setNewPhaseDuration(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Responsible Contractor
                  </label>
                  <input
                    type="text"
                    value={newPhaseResponsible}
                    onChange={(e) => setNewPhaseResponsible(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Budget Allocation ({project.currency})
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={newPhaseBudget}
                    onChange={(e) => setNewPhaseBudget(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Required Predecessor Stage
                </label>
                <select
                  value={newPhasePredecessor}
                  onChange={(e) => setNewPhasePredecessor(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md"
                >
                  <option value="">None (Independent Stage)</option>
                  {phases.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.phaseNumber}. {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-3 py-1.5 text-slate-600 hover:text-slate-800 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-teal-800 hover:bg-teal-900 text-white rounded-lg text-xs font-semibold shadow-2xs cursor-pointer"
                >
                  Add Stage
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
