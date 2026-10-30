import React from 'react';
import { Project } from '../../types/project';
import { DesignScenario } from '../../types/scenario';
import {
  AlertTriangle,
  Check,
  X,
  Layers,
  DollarSign,
  Building,
  Maximize2,
} from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

interface ApplyScenarioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  project: Project;
  scenario: DesignScenario;
}

export const ApplyScenarioModal: React.FC<ApplyScenarioModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  project,
  scenario,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog Card */}
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150">
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-800 text-white flex items-center justify-center font-bold shadow-xs">
              <Check className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-teal-800 uppercase tracking-wider">
                Apply Design Alternative
              </div>
              <h2 className="text-base font-bold text-slate-900">
                Confirm Scenario Application
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="text-xs text-slate-600 leading-relaxed">
            You are about to promote <strong className="text-slate-900">{scenario.name}</strong> to be the active configuration for{' '}
            <strong className="text-slate-900">{project.name}</strong>.
          </div>

          {/* Diff Summary */}
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-3">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Parameter Changes to Main Project
            </span>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="space-y-1">
                <span className="text-slate-500 flex items-center gap-1">
                  <Layers className="w-3 h-3 text-teal-700" /> Floors:
                </span>
                <div className="font-semibold text-slate-800">
                  {project.floors}F <span className="text-slate-400">→</span>{' '}
                  <span className="text-teal-800 font-bold">{scenario.floors}F</span>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-slate-500 flex items-center gap-1">
                  <DollarSign className="w-3 h-3 text-teal-700" /> Budget:
                </span>
                <div className="font-semibold text-slate-800">
                  {formatCurrency(project.budget, project.currency)}{' '}
                  <span className="text-slate-400">→</span>{' '}
                  <span className="text-teal-800 font-bold">
                    {formatCurrency(scenario.budget, project.currency)}
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-slate-500 flex items-center gap-1">
                  <Maximize2 className="w-3 h-3 text-teal-700" /> Placed Rooms:
                </span>
                <div className="font-semibold text-slate-800">
                  {project.floorPlan?.rooms?.length || 0} rooms{' '}
                  <span className="text-slate-400">→</span>{' '}
                  <span className="text-teal-800 font-bold">
                    {scenario.rooms.length} rooms
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-slate-500 flex items-center gap-1">
                  <Building className="w-3 h-3 text-teal-700" /> Envelope Material:
                </span>
                <div className="font-semibold text-slate-800 capitalize">
                  {scenario.facade?.primaryMaterial || 'Default'}
                </div>
              </div>
            </div>
          </div>

          {/* Warning Banner */}
          <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="leading-tight">
              <strong>Notice:</strong> This action will update your primary project data, 2D floor plan layout, and 3D building model. The previous baseline will be archived as a scenario.
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="px-4 py-2 text-xs font-semibold text-white bg-teal-800 hover:bg-teal-900 rounded-lg shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Apply to Main Project</span>
          </button>
        </div>
      </div>
    </div>
  );
};
