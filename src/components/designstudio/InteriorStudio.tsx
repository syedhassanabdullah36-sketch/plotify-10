import React, { useState, useMemo } from 'react';
import {
  InteriorRoomConcept,
  Project,
  FloorPlanRoom,
} from '../../types/project';
import {
  INTERIOR_STYLES,
  INTERIOR_FLOOR_FINISHES,
  INTERIOR_WALL_FINISHES,
  createDefaultRoomConcept,
} from '../../services/designPalettes';
import {
  Armchair,
  Palette,
  Sun,
  Layers,
  Sparkles,
  Info,
  Maximize2,
  Check,
  Eye,
  Sliders,
  Lamp,
  Archive,
  Compass,
  PenTool,
} from 'lucide-react';

interface InteriorStudioProps {
  project: Project;
  interiors: Record<string, InteriorRoomConcept>;
  onChange: (updatedInteriors: Record<string, InteriorRoomConcept>) => void;
  onOpen2DEditor?: () => void;
  onOpen3D?: () => void;
}

export const InteriorStudio: React.FC<InteriorStudioProps> = ({
  project,
  interiors,
  onChange,
  onOpen2DEditor,
  onOpen3D,
}) => {
  const unitSuffix = project.unit === 'feet' ? 'ft' : 'm';
  const unitAreaSuffix = project.unit === 'feet' ? 'sq ft' : 'm²';

  // Get available rooms from floorPlan or fallback to programmed spaces
  const availableRooms: FloorPlanRoom[] = useMemo(() => {
    if (project.floorPlan?.rooms && project.floorPlan.rooms.length > 0) {
      return project.floorPlan.rooms;
    }
    // Fallback pseudo-rooms based on project.rooms if floor-plan is empty
    return [
      {
        id: 'room-prog-01',
        name: 'Primary Living Suite',
        type: 'living',
        x: 0,
        y: 0,
        width: Math.round(project.plotWidth * 0.4),
        length: Math.round(project.plotLength * 0.3),
        floorLevel: 1,
      },
      {
        id: 'room-prog-02',
        name: 'Kitchen & Dining Space',
        type: 'kitchen',
        x: 0,
        y: 0,
        width: Math.round(project.plotWidth * 0.3),
        length: Math.round(project.plotLength * 0.25),
        floorLevel: 1,
      },
      {
        id: 'room-prog-03',
        name: 'Master Bedroom',
        type: 'bedroom',
        x: 0,
        y: 0,
        width: Math.round(project.plotWidth * 0.35),
        length: Math.round(project.plotLength * 0.3),
        floorLevel: project.floors > 1 ? 2 : 1,
      },
    ];
  }, [project.floorPlan, project.plotWidth, project.plotLength, project.floors]);

  // Selected room state
  const [selectedRoomId, setSelectedRoomId] = useState<string>(() => {
    return availableRooms[0]?.id || '';
  });

  const selectedRoom =
    availableRooms.find((r) => r.id === selectedRoomId) || availableRooms[0];

  // Resolve current room concept
  const currentConcept: InteriorRoomConcept = useMemo(() => {
    if (!selectedRoom) {
      return {
        roomId: 'fallback',
        roomName: 'General Living',
        style: 'Scandinavian',
        paletteName: 'Nordic Oak & Plaster',
        wallColor: '#f8fafc',
        wallFinish: 'matte-plaster',
        floorFinish: 'light-oak-plank',
        ceilingFinish: 'smooth-white',
        furnitureStyle: 'scandinavian-clean',
        lightingMood: 'warm-ambient-2700k',
        storageStyle: 'floor-to-ceiling-concealed',
        designPriority: 'simplicity',
        notes: '',
      };
    }
    return (
      interiors[selectedRoom.id] ||
      createDefaultRoomConcept(selectedRoom, 'A')
    );
  }, [selectedRoom, interiors]);

  const handleUpdateCurrentConcept = (updated: InteriorRoomConcept) => {
    if (!selectedRoom) return;
    onChange({
      ...interiors,
      [selectedRoom.id]: updated,
    });
  };

  const selectedFloorFinish =
    INTERIOR_FLOOR_FINISHES.find((f) => f.id === currentConcept.floorFinish) ||
    INTERIOR_FLOOR_FINISHES[0];

  const selectedWallFinish =
    INTERIOR_WALL_FINISHES.find((w) => w.id === currentConcept.wallFinish) ||
    INTERIOR_WALL_FINISHES[0];

  const roomArea = selectedRoom
    ? (selectedRoom.width * selectedRoom.length).toFixed(1)
    : '0';

  const isRealFloorPlan = Boolean(
    project.floorPlan?.rooms && project.floorPlan.rooms.length > 0
  );

  return (
    <div className="space-y-8">
      {/* Room Selector Strip */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="font-semibold text-teal-700 uppercase tracking-wider text-[11px]">
                Space Selection
              </span>
              <span aria-hidden="true">·</span>
              <span>{availableRooms.length} Spaces Available</span>
            </div>
            <h3 className="text-sm font-bold text-slate-900 mt-0.5">
              Select Room from Project Architecture
            </h3>
          </div>

          {!isRealFloorPlan && onOpen2DEditor && (
            <button
              onClick={onOpen2DEditor}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors cursor-pointer"
            >
              <PenTool className="w-3.5 h-3.5 text-teal-700" />
              <span>Customize in 2D Floor Plan</span>
            </button>
          )}
        </div>

        {/* Room selection chips */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {availableRooms.map((room) => {
            const isSelected = room.id === selectedRoom?.id;
            const hasCustomConcept = Boolean(interiors[room.id]);
            const rArea = (room.width * room.length).toFixed(0);

            return (
              <button
                key={room.id}
                type="button"
                onClick={() => setSelectedRoomId(room.id)}
                className={`px-3.5 py-2 rounded-xl text-left border transition-all cursor-pointer flex items-center gap-3 ${
                  isSelected
                    ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                <div>
                  <div className="text-xs font-bold truncate max-w-[150px]">
                    {room.name}
                  </div>
                  <div
                    className={`text-[10px] font-mono mt-0.5 ${
                      isSelected ? 'text-teal-300' : 'text-slate-500'
                    }`}
                  >
                    Level {room.floorLevel} · {rArea} {unitAreaSuffix}
                  </div>
                </div>

                {hasCustomConcept && (
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      isSelected ? 'bg-teal-400' : 'bg-teal-600'
                    }`}
                    title="Configured interior concept"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Room Architectural Spec & Interior Moodboard Presentation */}
      {selectedRoom && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-slate-50 to-white">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-teal-50 text-teal-700 border border-teal-200 flex items-center justify-center font-bold shadow-2xs">
                <Armchair className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="font-semibold text-teal-800 uppercase tracking-wider text-[11px]">
                    Interior Concept Board
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>Floor Level {selectedRoom.floorLevel}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    {selectedRoom.width}×{selectedRoom.length} {unitSuffix} ({roomArea}{' '}
                    {unitAreaSuffix})
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-900 mt-0.5">
                  {selectedRoom.name} · {currentConcept.style} Scheme
                </h3>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-teal-50 text-teal-900 text-xs font-semibold rounded-lg border border-teal-200 capitalize">
                {currentConcept.designPriority} Priority
              </span>
              {onOpen3D && (
                <button
                  onClick={onOpen3D}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5 text-teal-600" />
                  <span>View in 3D</span>
                </button>
              )}
            </div>
          </div>

          {/* Interactive Moodboard Canvas */}
          <div className="p-6 bg-slate-900 text-white relative">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              {/* Room Spatial Finishes Board (7 cols) */}
              <div className="lg:col-span-7 bg-slate-950/80 border border-slate-800 rounded-xl p-5 relative overflow-hidden">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-xs text-slate-400">
                  <span className="font-mono text-teal-400 uppercase text-[11px]">
                    Spatial Finishes & Tactile Palette
                  </span>
                  <span className="font-mono text-[11px]">
                    Verified: {selectedRoom.width}×{selectedRoom.length} {unitSuffix}
                  </span>
                </div>

                {/* Layered Architectural Material Composition */}
                <div className="mt-4 grid grid-cols-3 gap-3">
                  {/* Flooring Swatch */}
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg space-y-2">
                    <div className="text-[10px] font-mono text-slate-400 uppercase">
                      Floor Material
                    </div>
                    <div
                      className="w-full h-16 rounded-md border border-white/10 shadow-inner flex items-center justify-center p-2 text-center"
                      style={{ backgroundColor: selectedFloorFinish.hex }}
                    >
                      <span className="text-[10px] font-bold text-slate-900 bg-white/80 px-1.5 py-0.5 rounded-xs shadow-2xs">
                        {selectedFloorFinish.label.split(' ')[0]}
                      </span>
                    </div>
                    <div className="text-xs font-semibold text-white truncate">
                      {selectedFloorFinish.label}
                    </div>
                    <div className="text-[10px] text-slate-400 line-clamp-1">
                      {selectedFloorFinish.description}
                    </div>
                  </div>

                  {/* Wall Finish Swatch */}
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg space-y-2">
                    <div className="text-[10px] font-mono text-slate-400 uppercase">
                      Wall Cladding
                    </div>
                    <div
                      className="w-full h-16 rounded-md border border-white/10 shadow-inner flex items-center justify-center p-2 text-center"
                      style={{ backgroundColor: currentConcept.wallColor }}
                    >
                      <span className="text-[10px] font-bold text-slate-900 bg-white/80 px-1.5 py-0.5 rounded-xs shadow-2xs">
                        {selectedWallFinish.label.split(' ')[0]}
                      </span>
                    </div>
                    <div className="text-xs font-semibold text-white truncate">
                      {selectedWallFinish.label}
                    </div>
                    <div className="text-[10px] text-slate-400 line-clamp-1">
                      {selectedWallFinish.description}
                    </div>
                  </div>

                  {/* Lighting Mood Glow Card */}
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg space-y-2 relative overflow-hidden">
                    <div className="text-[10px] font-mono text-slate-400 uppercase">
                      Illumination Mood
                    </div>
                    <div
                      className="w-full h-16 rounded-md border border-white/10 flex items-center justify-center shadow-lg relative"
                      style={{
                        backgroundColor:
                          currentConcept.lightingMood.includes('2700k')
                            ? '#ffedd5'
                            : currentConcept.lightingMood.includes('3000k')
                            ? '#fef9c3'
                            : '#e0f2fe',
                      }}
                    >
                      <Lamp className="w-6 h-6 text-slate-800/80" />
                    </div>
                    <div className="text-xs font-semibold text-white truncate capitalize">
                      {currentConcept.lightingMood.replace('-', ' ')}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Balanced circadian ambiance
                    </div>
                  </div>
                </div>

                {/* Conceptual Furniture Note */}
                <div className="mt-4 p-3 rounded-lg bg-slate-900/90 border border-slate-800 text-[11px] text-slate-300 flex items-start gap-2">
                  <Info className="w-3.5 h-3.5 text-teal-400 shrink-0 mt-0.5" />
                  <p>
                    <strong>Furniture & Millwork Arrangement:</strong> Configured for{' '}
                    <span className="text-teal-300 font-semibold">
                      {currentConcept.furnitureStyle.replace('-', ' ')}
                    </span>{' '}
                    with{' '}
                    <span className="text-teal-300 font-semibold">
                      {currentConcept.storageStyle.replace('-', ' ')}
                    </span>
                    . <em>(Note: Furniture layout is conceptual and for spatial zoning; not measured millwork shop drawings).</em>
                  </p>
                </div>
              </div>

              {/* Interior Spec Highlights (5 cols) */}
              <div className="lg:col-span-5 space-y-3">
                <div className="bg-slate-800/80 rounded-xl p-4 border border-slate-700 space-y-3">
                  <div className="text-xs font-semibold text-teal-400 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-slate-700">
                    <Sparkles className="w-4 h-4" />
                    <span>Space Interior Specification</span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="text-slate-400">Design Language:</span>
                      <span className="font-semibold text-white">{currentConcept.style}</span>
                    </div>

                    <div className="flex items-center justify-between text-slate-300">
                      <span className="text-slate-400">Ceiling Surface:</span>
                      <span className="font-semibold text-white capitalize">
                        {currentConcept.ceilingFinish.replace('-', ' ')}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-slate-300">
                      <span className="text-slate-400">Storage Strategy:</span>
                      <span className="font-semibold text-white capitalize">
                        {currentConcept.storageStyle.replace('-', ' ')}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-slate-300">
                      <span className="text-slate-400">Core Priority:</span>
                      <span className="font-semibold text-teal-300 capitalize">
                        {currentConcept.designPriority}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-slate-300 pt-1 border-t border-slate-700/60">
                      <span className="text-slate-400">Derived Geometry:</span>
                      <span className="font-mono text-white">
                        {selectedRoom.width}×{selectedRoom.length} {unitSuffix} ({roomArea}{' '}
                        {unitAreaSuffix})
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-teal-950/40 rounded-xl border border-teal-800/50 text-[11px] text-teal-200">
                  <div className="font-semibold flex items-center gap-1.5 mb-1">
                    <Palette className="w-3.5 h-3.5 text-teal-400" />
                    <span>Connected 3D Surface Rendering</span>
                  </div>
                  This room's floor finish ({selectedFloorFinish.label}) and wall color are automatically mapped to its 3D slab in the Building Engine.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Configuration Form Controls */}
      {selectedRoom && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Panel 1: Interior Style, Flooring & Wall Finishes */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-6">
            <div className="pb-3 border-b border-slate-100 flex items-center gap-2">
              <Palette className="w-4 h-4 text-teal-600" />
              <h4 className="text-sm font-bold text-slate-900">
                1. Interior Style, Floor & Wall Surfaces
              </h4>
            </div>

            {/* Interior Style */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                Interior Design Aesthetic
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {INTERIOR_STYLES.map((st) => {
                  const isSelected = currentConcept.style === st.id;
                  return (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() =>
                        handleUpdateCurrentConcept({
                          ...currentConcept,
                          style: st.id,
                        })
                      }
                      className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-slate-900 text-white border-slate-900 shadow-2xs font-semibold'
                          : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                      }`}
                    >
                      <div className="text-xs font-semibold">{st.label}</div>
                      <div
                        className={`text-[10px] line-clamp-1 mt-0.5 ${
                          isSelected ? 'text-slate-300' : 'text-slate-500'
                        }`}
                      >
                        {st.description}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Floor Finish */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                Floor Finish Cladding
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {INTERIOR_FLOOR_FINISHES.map((f) => {
                  const isSelected = currentConcept.floorFinish === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() =>
                        handleUpdateCurrentConcept({
                          ...currentConcept,
                          floorFinish: f.id,
                        })
                      }
                      className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer flex items-center gap-2.5 ${
                        isSelected
                          ? 'bg-teal-50 border-teal-500 ring-1 ring-teal-500 text-teal-950 shadow-2xs'
                          : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                      }`}
                    >
                      <div
                        className="w-5 h-5 rounded-md border border-slate-300 shrink-0 shadow-2xs"
                        style={{ backgroundColor: f.hex }}
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold truncate">{f.label}</div>
                        <div className="text-[10px] text-slate-500 truncate">
                          {f.description.split('.')[0]}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Wall Finish */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                Wall Cladding & Finish
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {INTERIOR_WALL_FINISHES.map((w) => {
                  const isSelected = currentConcept.wallFinish === w.id;
                  return (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() =>
                        handleUpdateCurrentConcept({
                          ...currentConcept,
                          wallFinish: w.id,
                          wallColor: w.defaultHex,
                        })
                      }
                      className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer flex items-center gap-2.5 ${
                        isSelected
                          ? 'bg-teal-50 border-teal-500 text-teal-950 font-semibold shadow-2xs'
                          : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                      }`}
                    >
                      <div
                        className="w-5 h-5 rounded-md border border-slate-300 shrink-0 shadow-2xs"
                        style={{ backgroundColor: w.defaultHex }}
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold truncate">{w.label}</div>
                        <div className="text-[10px] text-slate-500 truncate">
                          {w.description.split('.')[0]}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom Wall Color Swatch */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <div>
                <label className="text-xs font-bold text-slate-700 block">
                  Fine-tune Wall Color Hue
                </label>
                <span className="text-[11px] text-slate-400">
                  Custom pigment tone
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={currentConcept.wallColor}
                  onChange={(e) =>
                    handleUpdateCurrentConcept({
                      ...currentConcept,
                      wallColor: e.target.value,
                    })
                  }
                  className="w-8 h-8 rounded-md cursor-pointer border border-slate-300 p-0.5"
                />
                <input
                  type="text"
                  value={currentConcept.wallColor}
                  onChange={(e) =>
                    handleUpdateCurrentConcept({
                      ...currentConcept,
                      wallColor: e.target.value,
                    })
                  }
                  className="w-24 text-xs font-mono uppercase bg-slate-50 border border-slate-200 rounded-md p-1.5"
                />
              </div>
            </div>
          </div>

          {/* Panel 2: Furniture, Lighting, Ceiling & Priority */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-6">
            <div className="pb-3 border-b border-slate-100 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-teal-600" />
              <h4 className="text-sm font-bold text-slate-900">
                2. Furniture, Lighting Atmosphere & Millwork
              </h4>
            </div>

            {/* Furniture Style & Conceptual Arrangement */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                Furniture Silhouette & Zoning
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { id: 'scandinavian-clean', label: 'Scandinavian Clean', desc: 'Light ash & linen' },
                  { id: 'minimalist-low', label: 'Minimalist Low Profile', desc: 'Floating horizontals' },
                  { id: 'mid-century-curved', label: 'Mid-Century Curved', desc: 'Tactile sculpted walnut' },
                  { id: 'modular-italian', label: 'Modular Italian', desc: 'Deep sectional comfort' },
                  { id: 'built-in-bespoke', label: 'Bespoke Integrated', desc: 'Architectural joinery' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() =>
                      handleUpdateCurrentConcept({
                        ...currentConcept,
                        furnitureStyle: item.id as any,
                      })
                    }
                    className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                      currentConcept.furnitureStyle === item.id
                        ? 'bg-slate-900 text-white border-slate-900 shadow-2xs font-semibold'
                        : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                    }`}
                  >
                    <div className="text-xs font-semibold">{item.label}</div>
                    <div
                      className={`text-[10px] mt-0.5 ${
                        currentConcept.furnitureStyle === item.id
                          ? 'text-slate-300'
                          : 'text-slate-500'
                      }`}
                    >
                      {item.desc}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Lighting Atmosphere */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                Lighting Temperature & Placement
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'warm-ambient-2700k', label: 'Warm Ambient (2700K)', desc: 'Residential relaxation & dusk' },
                  { id: 'gallery-directional-3000k', label: 'Gallery Focus (3000K)', desc: 'Architectural art spotlights' },
                  { id: 'recessed-linear-cove', label: 'Concealed Cove LEDs', desc: 'Perimeter ceiling wash' },
                  { id: 'natural-zenithal', label: 'Zenithal Daylight Focus', desc: 'Light wells & clerestory' },
                ].map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() =>
                      handleUpdateCurrentConcept({
                        ...currentConcept,
                        lightingMood: l.id as any,
                      })
                    }
                    className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                      currentConcept.lightingMood === l.id
                        ? 'bg-teal-50 border-teal-500 text-teal-950 font-semibold shadow-2xs'
                        : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                    }`}
                  >
                    <div className="text-xs font-semibold">{l.label}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">{l.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Storage & Built-ins */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                Storage & Built-In Millwork
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'floor-to-ceiling-concealed', label: 'Full Floor-to-Ceiling Flush' },
                  { id: 'open-slotted-shelving', label: 'Open Slatted Display' },
                  { id: 'floating-credenza', label: 'Cantilevered Floating Credenza' },
                  { id: 'minimal-recessed', label: 'Concealed Niche Storage' },
                ].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() =>
                      handleUpdateCurrentConcept({
                        ...currentConcept,
                        storageStyle: s.id as any,
                      })
                    }
                    className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                      currentConcept.storageStyle === s.id
                        ? 'bg-teal-50 border-teal-500 text-teal-950 font-semibold shadow-2xs'
                        : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                    }`}
                  >
                    <div className="text-xs truncate">{s.label}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Core Design Priority */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                Primary Spatial Design Goal
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { id: 'functionality', label: 'High Functionality' },
                  { id: 'simplicity', label: 'Purist Simplicity' },
                  { id: 'acoustic-warmth', label: 'Acoustic Warmth' },
                  { id: 'durability-family', label: 'Family Durability' },
                  { id: 'biophilic-light', label: 'Biophilic Daylight' },
                ].map((dp) => (
                  <button
                    key={dp.id}
                    type="button"
                    onClick={() =>
                      handleUpdateCurrentConcept({
                        ...currentConcept,
                        designPriority: dp.id as any,
                      })
                    }
                    className={`p-2 rounded-lg border text-center transition-all cursor-pointer text-xs ${
                      currentConcept.designPriority === dp.id
                        ? 'bg-slate-900 text-white font-semibold'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    {dp.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5 pt-2 border-t border-slate-100">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                Room Interior Notes
              </label>
              <textarea
                rows={3}
                value={currentConcept.notes}
                onChange={(e) =>
                  handleUpdateCurrentConcept({
                    ...currentConcept,
                    notes: e.target.value,
                  })
                }
                placeholder="Specific requirements, electrical outlet preferences, acoustic absorption notes, or custom joinery ideas..."
                className="w-full text-xs p-3 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:border-teal-500 focus:outline-none transition-colors"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
