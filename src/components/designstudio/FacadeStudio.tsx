import React from 'react';
import {
  FacadeConcept,
  Project,
  MeasurementUnit,
} from '../../types/project';
import {
  FACADE_STYLES,
  EXTERIOR_MATERIALS,
  CURATED_FACADE_PALETTES,
} from '../../services/designPalettes';
import {
  Building2,
  Palette,
  Sun,
  Shield,
  Layers,
  Sparkles,
  Info,
  Compass,
  Check,
  Eye,
  Sliders,
  DollarSign,
  Maximize2,
} from 'lucide-react';

interface FacadeStudioProps {
  project: Project;
  facade: FacadeConcept;
  onChange: (updated: FacadeConcept) => void;
  onOpen3D?: () => void;
}

export const FacadeStudio: React.FC<FacadeStudioProps> = ({
  project,
  facade,
  onChange,
  onOpen3D,
}) => {
  const unitSuffix = project.unit === 'feet' ? 'ft' : 'm';

  // Solar orientation recommendation
  const roadFacingLower = project.roadFacing.toLowerCase();
  const isHighSolar =
    roadFacingLower.includes('south') || roadFacingLower.includes('west');

  const selectedPrimaryMat = EXTERIOR_MATERIALS.find(
    (m) => m.id === facade.primaryMaterial
  ) || EXTERIOR_MATERIALS[0];

  const selectedAccentMat = EXTERIOR_MATERIALS.find(
    (m) => m.id === facade.accentMaterial
  ) || EXTERIOR_MATERIALS[1];

  const handleApplyCuratedPalette = (palette: (typeof CURATED_FACADE_PALETTES)[0]) => {
    onChange({
      ...facade,
      style: palette.style,
      primaryMaterial: palette.primaryMaterial,
      accentMaterial: palette.accentMaterial,
      paletteName: palette.name,
      primaryColor: palette.primaryColor,
      accentColor: palette.accentColor,
      windowTrimColor: palette.windowTrimColor,
      roofTrimColor: palette.roofTrimColor,
      costTier: palette.costTier,
      shadingStyle: palette.shadingStyle,
      windowStyle: palette.windowStyle,
      entranceStyle: palette.entranceStyle,
      notes: `${facade.notes ? facade.notes + '\n' : ''}Applied palette: ${palette.name}.`,
    });
  };

  return (
    <div className="space-y-8">
      {/* Top Elevation Concept Card & Schematic Preview */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        {/* Header Bar */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-slate-900 text-teal-400 flex items-center justify-center font-bold shadow-2xs">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="font-semibold text-teal-700 uppercase tracking-wider text-[11px]">
                  Exterior Architecture Studio
                </span>
                <span aria-hidden="true">·</span>
                <span>{project.roadFacing} Elevation</span>
                <span aria-hidden="true">·</span>
                <span>{project.floors} {project.floors === 1 ? 'Storey' : 'Storeys'}</span>
              </div>
              <h3 className="text-base font-bold text-slate-900">
                {facade.style} Facade Composition · {facade.paletteName || 'Custom Palette'}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200">
              {facade.costTier} Tier
            </span>
            {onOpen3D && (
              <button
                onClick={onOpen3D}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5 text-teal-400" />
                <span>Test in 3D</span>
              </button>
            )}
          </div>
        </div>

        {/* Architectural Elevation Schematic Board */}
        <div className="p-6 bg-slate-900 text-white relative overflow-hidden">
          {/* Subtle architectural grid pattern */}
          <div
            className="absolute inset-0 opacity-10 pointer-events-none"
            style={{
              backgroundImage:
                'linear-gradient(to right, #38bdf8 1px, transparent 1px), linear-gradient(to bottom, #38bdf8 1px, transparent 1px)',
              backgroundSize: '32px 32px',
            }}
          />

          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            {/* Visual Elevation Composition Drawing (Vector Architecture Canvas) */}
            <div className="lg:col-span-8 bg-slate-950/70 border border-slate-800 rounded-xl p-6 relative">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-4 pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-teal-400 uppercase text-[11px]">
                    Elevation: {project.roadFacing} Facing
                  </span>
                  <span>·</span>
                  <span className="font-mono">{project.plotWidth} {unitSuffix} Frontage</span>
                </div>
                <div className="text-[11px] font-mono text-slate-400">
                  Concept Scheme · 1:{project.floors > 1 ? '100' : '50'}
                </div>
              </div>

              {/* Dynamic Facade Vector Visualizer */}
              <div className="h-60 sm:h-72 w-full flex flex-col justify-end items-center relative py-2">
                {/* Sky / Daylight tone */}
                <div className="absolute top-2 right-3 flex items-center gap-2 text-[11px] text-slate-400 bg-slate-900/80 px-2.5 py-1 rounded-md border border-slate-800">
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <span>
                    {isHighSolar
                      ? 'High Solar Exposure (Recommended Deep Shading)'
                      : 'Moderate Daylight Exposure'}
                  </span>
                </div>

                {/* Building Mass Envelope */}
                <div
                  className="w-4/5 max-w-md border-2 rounded-t-sm relative transition-all duration-300 shadow-2xl flex flex-col justify-between"
                  style={{
                    backgroundColor: facade.primaryColor,
                    borderColor: facade.roofTrimColor,
                    height: project.floors > 1 ? '82%' : '58%',
                  }}
                >
                  {/* Roof Parapet / Overhang */}
                  <div
                    className="w-[106%] -ml-[3%] h-3.5 rounded-xs transition-colors border shadow-md flex items-center justify-between px-2"
                    style={{
                      backgroundColor: facade.roofTrimColor,
                      borderColor: '#0f172a',
                    }}
                  >
                    <span className="text-[8px] font-mono tracking-widest text-slate-400 uppercase">
                      {facade.shadingStyle.replace('-', ' ')}
                    </span>
                  </div>

                  {/* Upper Storey (if multi-floor) */}
                  {project.floors > 1 && (
                    <div className="flex-1 border-b border-slate-900/20 p-4 flex items-center justify-around relative">
                      {/* Window Treatment */}
                      <div
                        className="w-1/3 h-14 border-2 rounded-xs flex items-center justify-center transition-colors shadow-inner"
                        style={{
                          backgroundColor: '#38bdf8',
                          borderColor: facade.windowTrimColor,
                          opacity: 0.85,
                        }}
                      >
                        <span className="text-[9px] font-mono text-slate-900 font-bold px-1 bg-white/70 rounded-xs">
                          {facade.windowStyle === 'frameless-minimal'
                            ? 'Frameless'
                            : 'Ribbon Glazing'}
                        </span>
                      </div>

                      {/* Accent Material Cladding Panel */}
                      <div
                        className="w-1/3 h-14 border rounded-xs flex items-center justify-center transition-colors shadow-sm"
                        style={{
                          backgroundColor: facade.accentColor,
                          borderColor: 'rgba(0,0,0,0.2)',
                        }}
                      >
                        <span className="text-[9px] font-mono text-white/90 font-semibold uppercase px-1 bg-black/40 rounded-xs">
                          {facade.accentMaterial}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Ground Level with Entrance & Windows */}
                  <div className="h-28 p-4 flex items-end justify-between relative bg-black/5">
                    {/* Ground Window */}
                    <div
                      className="w-1/3 h-16 border-2 rounded-xs flex items-center justify-center transition-colors shadow-inner"
                      style={{
                        backgroundColor: '#38bdf8',
                        borderColor: facade.windowTrimColor,
                        opacity: 0.9,
                      }}
                    >
                      <div className="w-full h-full flex flex-col justify-around p-1">
                        <div className="h-0.5 bg-slate-800/40 w-full" />
                        <div className="h-0.5 bg-slate-800/40 w-full" />
                      </div>
                    </div>

                    {/* Entrance Door & Portal Feature */}
                    <div className="flex flex-col items-center">
                      {/* Canopy / Shading over door */}
                      {facade.entranceStyle !== 'minimal-pivot' && (
                        <div
                          className="w-16 h-2 border rounded-xs mb-0.5 shadow-sm"
                          style={{ backgroundColor: facade.roofTrimColor }}
                        />
                      )}
                      <div
                        className="w-12 h-20 border-2 rounded-t-xs flex flex-col justify-end p-1 transition-colors shadow-md"
                        style={{
                          backgroundColor: facade.accentColor,
                          borderColor: facade.windowTrimColor,
                        }}
                      >
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-400 self-end mr-1 mb-6 shadow-xs" />
                        <span className="text-[8px] font-mono text-center text-white/90 uppercase font-bold bg-black/40 rounded-xs">
                          Entry
                        </span>
                      </div>
                    </div>

                    {/* Accent Masonry / Panel column */}
                    <div
                      className="w-1/4 h-20 border rounded-xs flex items-center justify-center text-[8px] font-mono uppercase text-center p-1"
                      style={{
                        backgroundColor: facade.accentColor,
                        color: '#ffffff',
                      }}
                    >
                      {facade.accentMaterial} Base
                    </div>
                  </div>
                </div>

                {/* Ground Line / Finished Grade */}
                <div className="w-full h-2 bg-slate-700 mt-0 flex items-center justify-between px-4 border-t border-slate-600">
                  <span className="text-[9px] font-mono text-slate-400">Finished Grade ±0.00</span>
                  <span className="text-[9px] font-mono text-slate-400">Road Curb Offset</span>
                </div>
              </div>

              {/* Disclaimer overlay note */}
              <div className="mt-3 text-[11px] text-slate-400 flex items-center justify-between border-t border-slate-800 pt-2">
                <span>
                  Schematic elevation proposal · Derived from {project.plotWidth}×{project.plotLength} {unitSuffix} site model
                </span>
                <span className="text-teal-400 font-mono">Not for construction blueprints</span>
              </div>
            </div>

            {/* Spec Highlights & Material Swatch Board (4 cols) */}
            <div className="lg:col-span-4 space-y-4">
              <div className="bg-slate-800/80 rounded-xl p-4 border border-slate-700">
                <div className="text-xs font-semibold text-teal-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Palette className="w-4 h-4" />
                  <span>Selected Palette Swatches</span>
                </div>

                <div className="space-y-2.5 text-xs">
                  {/* Primary Material Swatch */}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/60 border border-slate-700/60">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-7 h-7 rounded-md border border-white/20 shadow-xs"
                        style={{ backgroundColor: facade.primaryColor }}
                      />
                      <div>
                        <div className="font-semibold text-white capitalize">
                          {facade.primaryMaterial}
                        </div>
                        <div className="text-[10px] text-slate-400">Primary Massing</div>
                      </div>
                    </div>
                    <span className="font-mono text-[11px] text-slate-300">
                      {facade.primaryColor}
                    </span>
                  </div>

                  {/* Accent Material Swatch */}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/60 border border-slate-700/60">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-7 h-7 rounded-md border border-white/20 shadow-xs"
                        style={{ backgroundColor: facade.accentColor }}
                      />
                      <div>
                        <div className="font-semibold text-white capitalize">
                          {facade.accentMaterial}
                        </div>
                        <div className="text-[10px] text-slate-400">Accent / Plinth</div>
                      </div>
                    </div>
                    <span className="font-mono text-[11px] text-slate-300">
                      {facade.accentColor}
                    </span>
                  </div>

                  {/* Window Trim Swatch */}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/60 border border-slate-700/60">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-7 h-7 rounded-md border border-white/20 shadow-xs"
                        style={{ backgroundColor: facade.windowTrimColor }}
                      />
                      <div>
                        <div className="font-semibold text-white">Window Mullions</div>
                        <div className="text-[10px] text-slate-400 capitalize">
                          {facade.windowStyle.replace('-', ' ')}
                        </div>
                      </div>
                    </div>
                    <span className="font-mono text-[11px] text-slate-300">
                      {facade.windowTrimColor}
                    </span>
                  </div>

                  {/* Roof & Canopy Swatch */}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/60 border border-slate-700/60">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-7 h-7 rounded-md border border-white/20 shadow-xs"
                        style={{ backgroundColor: facade.roofTrimColor }}
                      />
                      <div>
                        <div className="font-semibold text-white">Parapet / Canopy</div>
                        <div className="text-[10px] text-slate-400 capitalize">
                          {facade.entranceStyle.replace('-', ' ')}
                        </div>
                      </div>
                    </div>
                    <span className="font-mono text-[11px] text-slate-300">
                      {facade.roofTrimColor}
                    </span>
                  </div>
                </div>
              </div>

              {/* Solar & Orientation Advisory */}
              <div className="p-3.5 bg-slate-800/50 rounded-xl border border-slate-700 text-xs space-y-1">
                <div className="flex items-center gap-1.5 text-amber-400 font-semibold">
                  <Compass className="w-3.5 h-3.5" />
                  <span>{project.roadFacing} Elevation Performance</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  {isHighSolar
                    ? `South/West facing orientation receives intense afternoon solar radiation. Deep overhangs or motorized louvers (${facade.shadingStyle}) are strongly recommended to reduce HVAC cooling loads.`
                    : `North/East facing orientation offers balanced morning light with minimal glare. Consider generous glass fenestration to maximize daylighting penetration.`}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Preset Curated Architectural Palettes Quick Selection */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-teal-600" />
            <h4 className="text-sm font-bold text-slate-900">
              Curated Architectural Finish Palettes
            </h4>
          </div>
          <span className="text-xs text-slate-400">Click to apply palette preset</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {CURATED_FACADE_PALETTES.map((p, idx) => {
            const isMatch =
              facade.paletteName === p.name ||
              (facade.style === p.style &&
                facade.primaryMaterial === p.primaryMaterial);

            return (
              <button
                key={idx}
                type="button"
                onClick={() => handleApplyCuratedPalette(p)}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  isMatch
                    ? 'bg-teal-50/70 border-teal-500 shadow-xs ring-1 ring-teal-500'
                    : 'bg-slate-50/80 hover:bg-slate-100/80 border-slate-200 text-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">{p.name}</span>
                    {isMatch && <Check className="w-3.5 h-3.5 text-teal-700" />}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {p.style} · {p.primaryMaterial} + {p.accentMaterial}
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-1.5">
                  <div
                    className="w-5 h-5 rounded-md border border-slate-300 shadow-2xs"
                    style={{ backgroundColor: p.primaryColor }}
                    title="Primary"
                  />
                  <div
                    className="w-5 h-5 rounded-md border border-slate-300 shadow-2xs"
                    style={{ backgroundColor: p.accentColor }}
                    title="Accent"
                  />
                  <div
                    className="w-5 h-5 rounded-md border border-slate-300 shadow-2xs"
                    style={{ backgroundColor: p.windowTrimColor }}
                    title="Trim"
                  />
                  <div
                    className="w-5 h-5 rounded-md border border-slate-300 shadow-2xs"
                    style={{ backgroundColor: p.roofTrimColor }}
                    title="Roof"
                  />
                  <span className="text-[10px] text-slate-400 font-mono ml-auto">
                    {p.costTier.split(' ')[0]}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Configuration Form Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Panel 1: Architectural Style & Materials */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-6">
          <div className="pb-3 border-b border-slate-100 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-teal-600" />
            <h4 className="text-sm font-bold text-slate-900">
              1. Architectural Style & Exterior Materials
            </h4>
          </div>

          {/* Architectural Style */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
              Architectural Style Language
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {FACADE_STYLES.map((style) => {
                const isSelected = facade.style === style.id;
                return (
                  <button
                    key={style.id}
                    type="button"
                    onClick={() => onChange({ ...facade, style: style.id })}
                    className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200'
                    }`}
                  >
                    <div className="font-bold text-xs">{style.label}</div>
                    <div
                      className={`text-[10px] line-clamp-1 mt-0.5 ${
                        isSelected ? 'text-slate-300' : 'text-slate-500'
                      }`}
                    >
                      {style.historicalContext.split('.')[0]}
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-500 italic mt-1">
              {FACADE_STYLES.find((s) => s.id === facade.style)?.description}
            </p>
          </div>

          {/* Primary Material */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
              Primary Facade Material Cladding
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {EXTERIOR_MATERIALS.map((mat) => {
                const isSelected = facade.primaryMaterial === mat.id;
                return (
                  <button
                    key={mat.id}
                    type="button"
                    onClick={() =>
                      onChange({
                        ...facade,
                        primaryMaterial: mat.id,
                        primaryColor: mat.defaultHex,
                      })
                    }
                    className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-teal-50 border-teal-500 ring-1 ring-teal-500 text-teal-950 shadow-2xs'
                        : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-4 h-4 rounded-full border border-slate-300 shrink-0"
                        style={{ backgroundColor: mat.defaultHex }}
                      />
                      <span className="font-semibold text-xs truncate">{mat.label.split(' ')[0]}</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1 line-clamp-1">
                      {mat.textureHint}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Accent Material */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
              Accent / Plinth Material
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {EXTERIOR_MATERIALS.map((mat) => {
                const isSelected = facade.accentMaterial === mat.id;
                return (
                  <button
                    key={`accent-${mat.id}`}
                    type="button"
                    onClick={() =>
                      onChange({
                        ...facade,
                        accentMaterial: mat.id,
                        accentColor: mat.defaultHex,
                      })
                    }
                    className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-teal-50 border-teal-500 text-teal-950 shadow-2xs font-bold'
                        : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3.5 h-3.5 rounded-full border border-slate-300 shrink-0"
                        style={{ backgroundColor: mat.defaultHex }}
                      />
                      <span className="text-xs truncate">{mat.label.split(' ')[0]}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Hex Color Fine-Tuning */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-100">
            <div>
              <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                Primary Hex
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="color"
                  value={facade.primaryColor}
                  onChange={(e) => onChange({ ...facade, primaryColor: e.target.value })}
                  className="w-7 h-7 rounded-md cursor-pointer border border-slate-300 p-0.5"
                />
                <input
                  type="text"
                  value={facade.primaryColor}
                  onChange={(e) => onChange({ ...facade, primaryColor: e.target.value })}
                  className="w-full text-xs font-mono uppercase bg-slate-50 border border-slate-200 rounded-md p-1"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                Accent Hex
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="color"
                  value={facade.accentColor}
                  onChange={(e) => onChange({ ...facade, accentColor: e.target.value })}
                  className="w-7 h-7 rounded-md cursor-pointer border border-slate-300 p-0.5"
                />
                <input
                  type="text"
                  value={facade.accentColor}
                  onChange={(e) => onChange({ ...facade, accentColor: e.target.value })}
                  className="w-full text-xs font-mono uppercase bg-slate-50 border border-slate-200 rounded-md p-1"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                Window Trim
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="color"
                  value={facade.windowTrimColor}
                  onChange={(e) => onChange({ ...facade, windowTrimColor: e.target.value })}
                  className="w-7 h-7 rounded-md cursor-pointer border border-slate-300 p-0.5"
                />
                <input
                  type="text"
                  value={facade.windowTrimColor}
                  onChange={(e) => onChange({ ...facade, windowTrimColor: e.target.value })}
                  className="w-full text-xs font-mono uppercase bg-slate-50 border border-slate-200 rounded-md p-1"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                Roof Parapet
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="color"
                  value={facade.roofTrimColor}
                  onChange={(e) => onChange({ ...facade, roofTrimColor: e.target.value })}
                  className="w-7 h-7 rounded-md cursor-pointer border border-slate-300 p-0.5"
                />
                <input
                  type="text"
                  value={facade.roofTrimColor}
                  onChange={(e) => onChange({ ...facade, roofTrimColor: e.target.value })}
                  className="w-full text-xs font-mono uppercase bg-slate-50 border border-slate-200 rounded-md p-1"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Panel 2: Fenestration, Shading, Entrance & Notes */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-6">
          <div className="pb-3 border-b border-slate-100 flex items-center gap-2">
            <Sliders className="w-4 h-4 text-teal-600" />
            <h4 className="text-sm font-bold text-slate-900">
              2. Fenestration, Shading & Architectural Details
            </h4>
          </div>

          {/* Window Fenestration Design */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
              Window & Glazing System
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { id: 'floor-to-ceiling', label: 'Floor to Ceiling', desc: 'Maximized daylight' },
                { id: 'ribbon-horizontal', label: 'Continuous Ribbon', desc: 'Modern Bauhaus' },
                { id: 'divided-pane', label: 'Divided Light', desc: 'Industrial steel' },
                { id: 'frameless-minimal', label: 'Frameless Flush', desc: 'Sleek reflection' },
                { id: 'recessed-shading', label: 'Deep Recessed', desc: 'Thermal shadow' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onChange({ ...facade, windowStyle: item.id as any })}
                  className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                    facade.windowStyle === item.id
                      ? 'bg-slate-900 text-white border-slate-900 shadow-2xs font-semibold'
                      : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                  }`}
                >
                  <div className="text-xs font-semibold">{item.label}</div>
                  <div
                    className={`text-[10px] mt-0.5 ${
                      facade.windowStyle === item.id ? 'text-slate-300' : 'text-slate-500'
                    }`}
                  >
                    {item.desc}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Entrance & Canopy Treatment */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
              Main Entrance Portal & Canopy
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { id: 'canopy-cantilever', label: 'Cantilever Canopy', desc: 'Floating steel' },
                { id: 'recessed-portal', label: 'Recessed Portal', desc: 'Deep threshold' },
                { id: 'minimal-pivot', label: 'Oversized Pivot', desc: 'Flush architectural' },
                { id: 'timber-porch', label: 'Timber Slatted Porch', desc: 'Warm biophilic' },
                { id: 'glass-atrium', label: 'Double-Height Atrium', desc: 'Monumental scale' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onChange({ ...facade, entranceStyle: item.id as any })}
                  className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                    facade.entranceStyle === item.id
                      ? 'bg-teal-50 border-teal-500 text-teal-950 font-semibold shadow-2xs'
                      : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                  }`}
                >
                  <div className="text-xs font-semibold">{item.label}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{item.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Solar Shading Device */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                Solar Shading & Louvers
              </label>
              {isHighSolar && (
                <span className="text-[11px] text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                  Recommended for {project.roadFacing}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { id: 'deep-overhangs', label: 'Deep Roof Overhangs' },
                { id: 'motorized-louvers', label: 'Motorized Metal Louvers' },
                { id: 'timber-pergola', label: 'Timber Pergola / Trellis' },
                { id: 'brise-soleil', label: 'Architectural Brise-Soleil' },
                { id: 'none', label: 'Flush Unshaded Facade' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onChange({ ...facade, shadingStyle: item.id as any })}
                  className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                    facade.shadingStyle === item.id
                      ? 'bg-teal-50 border-teal-500 text-teal-950 font-semibold shadow-2xs'
                      : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                  }`}
                >
                  <div className="text-xs truncate">{item.label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Cost Tier */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
              Envelope Cost & Specification Tier
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(
                [
                  'Economic',
                  'Balanced Mid-Range',
                  'High-End Architectural',
                  'Ultra Luxury',
                ] as const
              ).map((tier) => (
                <button
                  key={tier}
                  type="button"
                  onClick={() => onChange({ ...facade, costTier: tier })}
                  className={`p-2 rounded-lg border text-center transition-all cursor-pointer text-xs ${
                    facade.costTier === tier
                      ? 'bg-slate-900 text-white font-semibold'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  {tier.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>

          {/* Architectural Notes & Directives */}
          <div className="space-y-1.5 pt-2 border-t border-slate-100">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
              Facade Notes & Client Directives
            </label>
            <textarea
              rows={3}
              value={facade.notes}
              onChange={(e) => onChange({ ...facade, notes: e.target.value })}
              placeholder="e.g. Client requested dark charcoal reveals, integrated soffit downlights, and thermal break frames for energy performance..."
              className="w-full text-xs p-3 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:border-teal-500 focus:outline-none transition-colors"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
