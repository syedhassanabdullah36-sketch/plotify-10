import React, { useState } from 'react';
import {
  EXTERIOR_MATERIALS,
  INTERIOR_FLOOR_FINISHES,
  INTERIOR_WALL_FINISHES,
  CURATED_FACADE_PALETTES,
} from '../../services/designPalettes';
import { DesignAlternative } from '../../types/project';
import {
  Palette,
  Sparkles,
  Layers,
  Building2,
  Check,
  ArrowRight,
  Shield,
  Info,
} from 'lucide-react';

interface MaterialLibraryViewProps {
  activeAlternative: DesignAlternative;
  onUpdateAlternative: (updated: DesignAlternative) => void;
}

export const MaterialLibraryView: React.FC<MaterialLibraryViewProps> = ({
  activeAlternative,
  onUpdateAlternative,
}) => {
  const [activeCategory, setActiveCategory] = useState<
    'exterior' | 'interior-floors' | 'interior-walls' | 'combinations'
  >('combinations');

  // Pairings
  const architecturalPairings = [
    {
      title: 'Nordic Warmth: Timber Rainscreen & Honed Slate',
      tags: ['Modern', 'Biophilic', 'Cold Climate'],
      primary: { label: 'Thermal Cedar', hex: '#b4845c' },
      accent: { label: 'Honed Dark Slate', hex: '#475569' },
      trim: { label: 'Matte Black Anodized', hex: '#1e293b' },
      floor: { label: 'European White Oak', hex: '#d4b996' },
      description:
        'Vertical open-jointed cedar creates tactile shadow lines, complemented by a solid slate ground plinth for moisture mitigation.',
      onApply: () => {
        onUpdateAlternative({
          ...activeAlternative,
          facade: {
            ...activeAlternative.facade,
            style: 'Modern',
            primaryMaterial: 'timber',
            accentMaterial: 'stone',
            paletteName: 'Nordic Timber & Honed Slate',
            primaryColor: '#b4845c',
            accentColor: '#475569',
            windowTrimColor: '#1e293b',
          },
        });
      },
    },
    {
      title: 'Brutalist Purity: Fair-Faced Concrete & Smoked Glass',
      tags: ['Industrial', 'Minimalist', 'Urban'],
      primary: { label: 'Board-Formed Concrete', hex: '#94a3b8' },
      accent: { label: 'Architectural Zinc', hex: '#334155' },
      trim: { label: 'Dark Steel Mullions', hex: '#020617' },
      floor: { label: 'Honed Screed Concrete', hex: '#94a3b8' },
      description:
        'Raw architectural concrete with tie-rod holes juxtaposed against crystalline structural glazing and blackened steel detailing.',
      onApply: () => {
        onUpdateAlternative({
          ...activeAlternative,
          facade: {
            ...activeAlternative.facade,
            style: 'Industrial',
            primaryMaterial: 'concrete',
            accentMaterial: 'glass',
            paletteName: 'Raw Concrete & Smoked Glass',
            primaryColor: '#94a3b8',
            accentColor: '#334155',
            windowTrimColor: '#020617',
          },
        });
      },
    },
    {
      title: 'Mediterranean Clarity: Warm Limewash & Terracotta Tile',
      tags: ['Mediterranean', 'High Solar', 'Tactile'],
      primary: { label: 'Artisanal Lime Stucco', hex: '#f8fafc' },
      accent: { label: 'Kiln Terracotta Brick', hex: '#c2410c' },
      trim: { label: 'Earth Bronze Trim', hex: '#78350f' },
      floor: { label: 'Vein-Cut Travertine', hex: '#ede5d8' },
      description:
        'High-albedo mineral stucco reflects severe summer heat, while terracotta accents provide deep tactile warmth around portals and courtyards.',
      onApply: () => {
        onUpdateAlternative({
          ...activeAlternative,
          facade: {
            ...activeAlternative.facade,
            style: 'Mediterranean',
            primaryMaterial: 'plaster',
            accentMaterial: 'brick',
            paletteName: 'Warm Limewash & Terracotta',
            primaryColor: '#f8fafc',
            accentColor: '#c2410c',
            windowTrimColor: '#78350f',
          },
        });
      },
    },
  ];

  return (
    <div className="space-y-6">
      {/* Category Tabs */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200">
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
          <button
            onClick={() => setActiveCategory('combinations')}
            className={`px-3 py-1.5 font-semibold rounded-lg transition-all cursor-pointer ${
              activeCategory === 'combinations'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Curated Material Pairings
          </button>
          <button
            onClick={() => setActiveCategory('exterior')}
            className={`px-3 py-1.5 font-semibold rounded-lg transition-all cursor-pointer ${
              activeCategory === 'exterior'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Exterior Claddings
          </button>
          <button
            onClick={() => setActiveCategory('interior-floors')}
            className={`px-3 py-1.5 font-semibold rounded-lg transition-all cursor-pointer ${
              activeCategory === 'interior-floors'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Flooring Finishes
          </button>
          <button
            onClick={() => setActiveCategory('interior-walls')}
            className={`px-3 py-1.5 font-semibold rounded-lg transition-all cursor-pointer ${
              activeCategory === 'interior-walls'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Interior Wall Finishes
          </button>
        </div>

        <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500">
          <span>Active Alternative:</span>
          <span className="font-semibold text-slate-800">
            {activeAlternative.name}
          </span>
        </div>
      </div>

      {/* 1. Combinations & Pairings */}
      {activeCategory === 'combinations' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {architecturalPairings.map((pairing, idx) => (
            <div
              key={idx}
              className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between hover:border-teal-500/50 transition-all"
            >
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  {pairing.tags.map((tag, tIdx) => (
                    <span
                      key={tIdx}
                      className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-semibold"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                <h3 className="text-sm font-bold text-slate-900">
                  {pairing.title}
                </h3>

                <p className="text-xs text-slate-600 leading-relaxed">
                  {pairing.description}
                </p>

                {/* Swatches Bar */}
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                  <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    Material Composition Swatches
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <div className="space-y-1">
                      <div
                        className="w-full h-8 rounded-md border border-slate-300 shadow-2xs"
                        style={{ backgroundColor: pairing.primary.hex }}
                      />
                      <div className="text-[9px] text-slate-500 truncate">
                        {pairing.primary.label.split(' ')[0]}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div
                        className="w-full h-8 rounded-md border border-slate-300 shadow-2xs"
                        style={{ backgroundColor: pairing.accent.hex }}
                      />
                      <div className="text-[9px] text-slate-500 truncate">
                        {pairing.accent.label.split(' ')[0]}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div
                        className="w-full h-8 rounded-md border border-slate-300 shadow-2xs"
                        style={{ backgroundColor: pairing.trim.hex }}
                      />
                      <div className="text-[9px] text-slate-500 truncate">
                        {pairing.trim.label.split(' ')[0]}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div
                        className="w-full h-8 rounded-md border border-slate-300 shadow-2xs"
                        style={{ backgroundColor: pairing.floor.hex }}
                      />
                      <div className="text-[9px] text-slate-500 truncate">
                        {pairing.floor.label.split(' ')[0]}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={pairing.onApply}
                  className="w-full py-2 px-3 text-xs font-semibold rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-900 border border-teal-200 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-teal-700" />
                  <span>Apply Pairing to {activeAlternative.name}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 2. Exterior Claddings */}
      {activeCategory === 'exterior' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {EXTERIOR_MATERIALS.map((mat) => (
            <div
              key={mat.id}
              className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-lg border border-slate-300 shadow-xs shrink-0"
                    style={{ backgroundColor: mat.defaultHex }}
                  />
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">
                      {mat.label}
                    </h4>
                    <span className="text-[10px] font-mono text-slate-400">
                      {mat.defaultHex} · Roughness {mat.roughness}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">
                  {mat.description}
                </p>

                <div className="text-[11px] text-teal-800 bg-teal-50 p-2.5 rounded-lg border border-teal-100">
                  <span className="font-semibold">Texture specification:</span>{' '}
                  {mat.textureHint}
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  onUpdateAlternative({
                    ...activeAlternative,
                    facade: {
                      ...activeAlternative.facade,
                      primaryMaterial: mat.id,
                      primaryColor: mat.defaultHex,
                    },
                  })
                }
                className="mt-4 w-full py-2 text-xs font-semibold rounded-lg bg-slate-900 hover:bg-slate-800 text-white transition-colors cursor-pointer"
              >
                Set as Primary Facade Material
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 3. Interior Floors */}
      {activeCategory === 'interior-floors' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {INTERIOR_FLOOR_FINISHES.map((floor) => (
            <div
              key={floor.id}
              className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-lg border border-slate-300 shadow-xs shrink-0"
                    style={{ backgroundColor: floor.hex }}
                  />
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">
                      {floor.label}
                    </h4>
                    <span className="text-[10px] font-mono text-slate-400">
                      {floor.hex}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">
                  {floor.description}
                </p>
              </div>

              <div className="mt-4 p-2 bg-slate-50 rounded-lg border border-slate-200 text-[11px] text-slate-500 text-center">
                Selectable inside room-by-room Interior Studio
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 4. Interior Walls */}
      {activeCategory === 'interior-walls' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {INTERIOR_WALL_FINISHES.map((wall) => (
            <div
              key={wall.id}
              className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-lg border border-slate-300 shadow-xs shrink-0"
                    style={{ backgroundColor: wall.defaultHex }}
                  />
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">
                      {wall.label}
                    </h4>
                    <span className="text-[10px] font-mono text-slate-400">
                      {wall.defaultHex}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">
                  {wall.description}
                </p>
              </div>

              <div className="mt-4 p-2 bg-slate-50 rounded-lg border border-slate-200 text-[11px] text-slate-500 text-center">
                Selectable inside room-by-room Interior Studio
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
