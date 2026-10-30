import React from 'react';
import { DesignAlternative, Project } from '../../types/project';
import {
  X,
  Check,
  Scale,
  Building2,
  Palette,
  Sun,
  ShieldCheck,
  DollarSign,
  Layers,
  ArrowRight,
  Eye,
} from 'lucide-react';

interface AlternativeComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  alternatives: DesignAlternative[];
  activeAlternativeId?: string;
  onSelectActiveAlternative: (altId: string) => void;
  onApplyTo3D: (altId: string) => void;
}

export const AlternativeComparisonModal: React.FC<AlternativeComparisonModalProps> = ({
  isOpen,
  onClose,
  project,
  alternatives,
  activeAlternativeId,
  onSelectActiveAlternative,
  onApplyTo3D,
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
      <div className="relative w-full max-w-6xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-10 flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 text-teal-400 flex items-center justify-center font-bold shadow-2xs">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-semibold text-teal-700 uppercase tracking-wider">
                Architectural Evaluation
              </div>
              <h2 className="text-base font-bold text-slate-900">
                Design Alternative Comparison Matrix
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Comparison Content Table */}
        <div className="p-6 overflow-y-auto space-y-6">
          <div className="text-xs text-slate-500 flex items-center justify-between pb-2 border-b border-slate-100">
            <span>
              Comparing {alternatives.length} design alternatives for{' '}
              <strong className="text-slate-800">{project.name}</strong>
            </span>
            <span className="text-[11px] text-slate-400 italic">
              Switching active concept updates 3D model materials
            </span>
          </div>

          {/* Side-by-Side Grid */}
          <div
            className="grid gap-4"
            style={{
              gridTemplateColumns: `repeat(${Math.max(alternatives.length, 2)}, minmax(280px, 1fr))`,
            }}
          >
            {alternatives.map((alt) => {
              const isActive = alt.id === activeAlternativeId;
              const f = alt.facade;
              const interiorCount = Object.keys(alt.interiors).length;

              return (
                <div
                  key={alt.id}
                  className={`rounded-xl border p-5 flex flex-col justify-between transition-all ${
                    isActive
                      ? 'bg-teal-50/40 border-teal-500 shadow-sm ring-1 ring-teal-500'
                      : 'bg-slate-50/70 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="space-y-4">
                    {/* Header: Title & Active Badge */}
                    <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-200/80">
                      <div>
                        <span className="text-[10px] font-mono text-slate-400 uppercase">
                          {alt.id}
                        </span>
                        <h3 className="text-sm font-bold text-slate-900 mt-0.5">
                          {alt.name}
                        </h3>
                      </div>
                      {isActive ? (
                        <span className="px-2.5 py-0.5 bg-teal-600 text-white text-[11px] font-bold rounded-full shadow-2xs">
                          Active Concept
                        </span>
                      ) : (
                        <button
                          onClick={() => onSelectActiveAlternative(alt.id)}
                          className="px-2.5 py-0.5 bg-white text-slate-700 hover:text-slate-900 border border-slate-300 text-[11px] font-semibold rounded-md shadow-2xs cursor-pointer transition-colors"
                        >
                          Make Active
                        </button>
                      )}
                    </div>

                    {/* Description */}
                    {alt.description && (
                      <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                        {alt.description}
                      </p>
                    )}

                    {/* Color Swatch Preview Bar */}
                    <div className="p-3 bg-white rounded-lg border border-slate-200 shadow-2xs space-y-2">
                      <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                        Palette Swatches
                      </div>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-8 h-8 rounded-md border border-slate-300 shadow-2xs"
                          style={{ backgroundColor: f.primaryColor }}
                          title={`Primary: ${f.primaryColor}`}
                        />
                        <div
                          className="w-8 h-8 rounded-md border border-slate-300 shadow-2xs"
                          style={{ backgroundColor: f.accentColor }}
                          title={`Accent: ${f.accentColor}`}
                        />
                        <div
                          className="w-8 h-8 rounded-md border border-slate-300 shadow-2xs"
                          style={{ backgroundColor: f.windowTrimColor }}
                          title={`Window Trim: ${f.windowTrimColor}`}
                        />
                        <div
                          className="w-8 h-8 rounded-md border border-slate-300 shadow-2xs"
                          style={{ backgroundColor: f.roofTrimColor }}
                          title={`Roof Parapet: ${f.roofTrimColor}`}
                        />
                      </div>
                      <div className="text-[11px] font-medium text-slate-700 truncate">
                        {f.paletteName}
                      </div>
                    </div>

                    {/* Comparison Criteria List */}
                    <div className="space-y-2 text-xs divide-y divide-slate-200/60">
                      <div className="pt-2 flex items-center justify-between">
                        <span className="text-slate-500">Facade Style:</span>
                        <span className="font-semibold text-slate-900">{f.style}</span>
                      </div>

                      <div className="pt-2 flex items-center justify-between">
                        <span className="text-slate-500">Primary Material:</span>
                        <span className="font-semibold text-slate-900 capitalize">
                          {f.primaryMaterial}
                        </span>
                      </div>

                      <div className="pt-2 flex items-center justify-between">
                        <span className="text-slate-500">Accent Material:</span>
                        <span className="font-semibold text-slate-900 capitalize">
                          {f.accentMaterial}
                        </span>
                      </div>

                      <div className="pt-2 flex items-center justify-between">
                        <span className="text-slate-500">Window Fenestration:</span>
                        <span className="font-semibold text-slate-900 capitalize">
                          {f.windowStyle.replace('-', ' ')}
                        </span>
                      </div>

                      <div className="pt-2 flex items-center justify-between">
                        <span className="text-slate-500">Entrance Portal:</span>
                        <span className="font-semibold text-slate-900 capitalize">
                          {f.entranceStyle.replace('-', ' ')}
                        </span>
                      </div>

                      <div className="pt-2 flex items-center justify-between">
                        <span className="text-slate-500">Solar Shading:</span>
                        <span className="font-semibold text-slate-900 capitalize">
                          {f.shadingStyle.replace('-', ' ')}
                        </span>
                      </div>

                      <div className="pt-2 flex items-center justify-between">
                        <span className="text-slate-500">Cost & Spec Tier:</span>
                        <span className="font-semibold text-slate-900">
                          {f.costTier}
                        </span>
                      </div>

                      <div className="pt-2 flex items-center justify-between">
                        <span className="text-slate-500">Interior Spaces Configured:</span>
                        <span className="font-semibold text-slate-900">
                          {interiorCount} Rooms
                        </span>
                      </div>
                    </div>

                    {/* Architectural Notes */}
                    {f.notes && (
                      <div className="p-3 bg-white rounded-lg border border-slate-200 text-[11px] text-slate-600 italic leading-relaxed">
                        "{f.notes.split('\n')[0]}"
                      </div>
                    )}
                  </div>

                  {/* Bottom Action Buttons */}
                  <div className="mt-5 pt-3 border-t border-slate-200 flex items-center gap-2">
                    <button
                      onClick={() => onApplyTo3D(alt.id)}
                      className="flex-1 py-2 px-3 text-xs font-semibold rounded-lg bg-slate-900 hover:bg-slate-800 text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                    >
                      <Eye className="w-3.5 h-3.5 text-teal-400" />
                      <span>Apply to 3D</span>
                    </button>

                    {!isActive && (
                      <button
                        onClick={() => onSelectActiveAlternative(alt.id)}
                        className="py-2 px-3 text-xs font-semibold rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-900 border border-teal-200 transition-colors cursor-pointer"
                      >
                        Set Active
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-teal-700" />
            <span>Alternatives persist locally in browser storage with the project.</span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-2 bg-white border border-slate-300 text-slate-700 hover:text-slate-900 font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Close Matrix
          </button>
        </div>
      </div>
    </div>
  );
};
