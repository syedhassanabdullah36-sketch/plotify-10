import React from 'react';
import { Project, FloorPlanRoom, FacadeConcept } from '../../types/project';
import { DesignScenario } from '../../types/scenario';
import {
  Layers,
  DollarSign,
  Building,
  RotateCcw,
  Save,
  Palette,
  Sliders,
  Sparkles,
  Info,
} from 'lucide-react';

interface ScenarioParametersPanelProps {
  project: Project;
  scenario: DesignScenario;
  isBaseline: boolean;
  onUpdateScenario: (updated: DesignScenario) => void;
  onResetToBaseline: () => void;
  onSaveScenario: () => void;
  hasUnsavedChanges: boolean;
}

export const ScenarioParametersPanel: React.FC<ScenarioParametersPanelProps> = ({
  project,
  scenario,
  isBaseline,
  onUpdateScenario,
  onResetToBaseline,
  onSaveScenario,
  hasUnsavedChanges,
}) => {
  const unitSuffix = project.unit === 'feet' ? 'ft' : 'm';

  const handleFloorsChange = (newFloors: number) => {
    if (newFloors < 1 || newFloors > 8) return;
    onUpdateScenario({
      ...scenario,
      floors: newFloors,
      status: 'draft',
      updatedAt: new Date().toISOString(),
    });
  };

  const handleBudgetChange = (newBudget: number) => {
    if (isNaN(newBudget) || newBudget < 0) return;
    onUpdateScenario({
      ...scenario,
      budget: newBudget,
      status: 'draft',
      updatedAt: new Date().toISOString(),
    });
  };

  const handleMaterialChange = (
    primaryMaterial: 'plaster' | 'brick' | 'stone' | 'concrete' | 'timber' | 'glass'
  ) => {
    const existingFacade = scenario.facade || {
      style: 'Modern',
      primaryMaterial: 'timber',
      accentMaterial: 'glass',
      paletteName: 'Natural Architectural',
      primaryColor: '#78716c',
      accentColor: '#38bdf8',
      windowTrimColor: '#1e293b',
      roofTrimColor: '#0f172a',
      windowStyle: 'floor-to-ceiling',
      entranceStyle: 'minimal-pivot',
      shadingStyle: 'deep-overhangs',
      elevationView: 'perspective',
      costTier: 'Balanced Mid-Range',
      notes: '',
    };

    onUpdateScenario({
      ...scenario,
      facade: {
        ...existingFacade,
        primaryMaterial,
      },
      status: 'draft',
      updatedAt: new Date().toISOString(),
    });
  };

  const handleCostTierChange = (
    costTier: 'Economic' | 'Balanced Mid-Range' | 'High-End Architectural' | 'Ultra Luxury'
  ) => {
    const existingFacade = scenario.facade || {
      style: 'Modern',
      primaryMaterial: 'concrete',
      accentMaterial: 'glass',
      paletteName: 'Modern Minimal',
      primaryColor: '#64748b',
      accentColor: '#0d9488',
      windowTrimColor: '#1e293b',
      roofTrimColor: '#0f172a',
      windowStyle: 'floor-to-ceiling',
      entranceStyle: 'canopy-cantilever',
      shadingStyle: 'deep-overhangs',
      elevationView: 'perspective',
      costTier: 'Balanced Mid-Range',
      notes: '',
    };

    onUpdateScenario({
      ...scenario,
      facade: {
        ...existingFacade,
        costTier,
      },
      status: 'draft',
      updatedAt: new Date().toISOString(),
    });
  };

  const handleScaleAllRooms = (factor: number) => {
    const updatedRooms = scenario.rooms.map((room) => ({
      ...room,
      width: Math.max(2, Math.round(room.width * factor * 10) / 10),
      length: Math.max(2, Math.round(room.length * factor * 10) / 10),
    }));

    onUpdateScenario({
      ...scenario,
      rooms: updatedRooms,
      status: 'draft',
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-teal-700" />
          <h3 className="text-sm font-bold text-slate-900">
            Interactive Parameter Playground
          </h3>
          {hasUnsavedChanges && !isBaseline && (
            <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
              Unsaved Draft Changes
            </span>
          )}
        </div>

        {!isBaseline && (
          <div className="flex items-center gap-2">
            <button
              onClick={onResetToBaseline}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset to Baseline</span>
            </button>
            <button
              onClick={onSaveScenario}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-teal-800 hover:bg-teal-900 rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Scenario</span>
            </button>
          </div>
        )}
      </div>

      {isBaseline ? (
        <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-600 flex items-start gap-3">
          <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
          <div>
            <strong className="text-slate-800 block mb-0.5">
              Current Project Baseline (Read-Only in Simulator)
            </strong>
            This scenario reflects the active specifications and 2D floor plan of{' '}
            <span className="font-semibold text-slate-800">{project.name}</span>. To experiment with alternative floor counts, material selections, and room dimensions, select or create an alternative scenario from the tabs above.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Floor Count Control */}
          <div className="bg-slate-50/70 p-3.5 rounded-lg border border-slate-200 space-y-2">
            <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-teal-700" />
                Floor Levels
              </span>
              <span className="font-bold text-slate-900 tabular-nums">
                {scenario.floors} {scenario.floors === 1 ? 'Level' : 'Levels'}
              </span>
            </label>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((fl) => (
                <button
                  key={fl}
                  onClick={() => handleFloorsChange(fl)}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-md border transition-all cursor-pointer ${
                    scenario.floors === fl
                      ? 'bg-teal-800 text-white border-teal-800 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {fl}F
                </button>
              ))}
            </div>
            <div className="text-[11px] text-slate-500">
              Adjusts building height & vertical circulation.
            </div>
          </div>

          {/* 2. Budget Control */}
          <div className="bg-slate-50/70 p-3.5 rounded-lg border border-slate-200 space-y-2">
            <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-teal-700" />
                Scenario Budget
              </span>
              <span className="font-bold text-slate-900 tabular-nums">
                {project.currency}
              </span>
            </label>
            <input
              type="number"
              min={10000}
              step={10000}
              value={scenario.budget}
              onChange={(e) => handleBudgetChange(Number(e.target.value))}
              className="w-full px-3 py-1.5 text-xs font-medium bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
            />
            <div className="flex items-center justify-between gap-1 text-[11px] text-slate-500">
              <button
                type="button"
                onClick={() => handleBudgetChange(Math.round(scenario.budget * 0.9))}
                className="hover:text-slate-800 underline cursor-pointer"
              >
                -10%
              </button>
              <button
                type="button"
                onClick={() => handleBudgetChange(project.budget)}
                className="hover:text-slate-800 underline cursor-pointer"
              >
                Match Baseline
              </button>
              <button
                type="button"
                onClick={() => handleBudgetChange(Math.round(scenario.budget * 1.15))}
                className="hover:text-slate-800 underline cursor-pointer"
              >
                +15%
              </button>
            </div>
          </div>

          {/* 3. Primary Facade & Structural Material */}
          <div className="bg-slate-50/70 p-3.5 rounded-lg border border-slate-200 space-y-2">
            <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Building className="w-3.5 h-3.5 text-teal-700" />
                Envelope Material
              </span>
              <span className="text-[11px] text-slate-500 capitalize">
                {scenario.facade?.primaryMaterial || 'timber'}
              </span>
            </label>
            <select
              value={scenario.facade?.primaryMaterial || 'timber'}
              onChange={(e) => handleMaterialChange(e.target.value as any)}
              className="w-full px-2.5 py-1.5 text-xs font-medium bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-teal-500 focus:outline-hidden capitalize"
            >
              <option value="timber">Timber / Mass Wood (180 kg CO₂e/m²)</option>
              <option value="plaster">Mineral Plaster / Stucco (290 kg CO₂e/m²)</option>
              <option value="stone">Natural Stone Ashlar (330 kg CO₂e/m²)</option>
              <option value="brick">Clay Facing Brick (390 kg CO₂e/m²)</option>
              <option value="concrete">Fair-Faced Concrete (490 kg CO₂e/m²)</option>
              <option value="glass">Structural Glass Curtain (530 kg CO₂e/m²)</option>
            </select>
            <div className="text-[11px] text-slate-500">
              Directly influences embodied carbon takeoff.
            </div>
          </div>

          {/* 4. Cost Tier & Room Scaling */}
          <div className="bg-slate-50/70 p-3.5 rounded-lg border border-slate-200 space-y-2">
            <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5 text-teal-700" />
                Finish Specification
              </span>
            </label>
            <select
              value={scenario.facade?.costTier || 'Balanced Mid-Range'}
              onChange={(e) => handleCostTierChange(e.target.value as any)}
              className="w-full px-2.5 py-1.5 text-xs font-medium bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
            >
              <option value="Economic">Economic (Standard Spec)</option>
              <option value="Balanced Mid-Range">Balanced Mid-Range (Quality)</option>
              <option value="High-End Architectural">High-End Architectural</option>
              <option value="Ultra Luxury">Ultra Luxury (Bespoke)</option>
            </select>
            <div className="flex items-center gap-1 pt-0.5">
              <span className="text-[10px] text-slate-500 shrink-0">Scale Plan:</span>
              <button
                type="button"
                onClick={() => handleScaleAllRooms(0.9)}
                className="px-2 py-0.5 text-[10px] font-semibold bg-white border border-slate-200 rounded-md hover:bg-slate-100 cursor-pointer"
                title="Downsize rooms by 10%"
              >
                -10% Area
              </button>
              <button
                type="button"
                onClick={() => handleScaleAllRooms(1.1)}
                className="px-2 py-0.5 text-[10px] font-semibold bg-white border border-slate-200 rounded-md hover:bg-slate-100 cursor-pointer"
                title="Upsize rooms by 10%"
              >
                +10% Area
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
