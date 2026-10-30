import React from 'react';
import {
  Trash2,
  Copy,
  RotateCw,
  Maximize2,
  Building,
  Layers,
  Info,
  ShieldAlert,
  Sliders,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { FloorPlanData, PlanOpening, PlanRoom, PlanWall, RoomType } from '../../types/floorplan';
import { MeasurementUnit, Project } from '../../types/project';
import { ROOM_PRESETS, snapToGrid } from '../../utils/geometry';

interface FloorPlanPropertiesProps {
  project: Project;
  plan: FloorPlanData;
  selectedId: string | null;
  selectedType: 'room' | 'wall' | 'opening' | null;
  unit: MeasurementUnit;
  onUpdateRoom: (room: PlanRoom) => void;
  onDeleteRoom: (roomId: string) => void;
  onDuplicateRoom: (room: PlanRoom) => void;
  onUpdateWall: (wall: PlanWall) => void;
  onDeleteWall: (wallId: string) => void;
  onUpdateOpening: (opening: PlanOpening) => void;
  onDeleteOpening: (openingId: string) => void;
  onAddPresetRoom: (type: RoomType) => void;
}

export const FloorPlanProperties: React.FC<FloorPlanPropertiesProps> = ({
  project,
  plan,
  selectedId,
  selectedType,
  unit,
  onUpdateRoom,
  onDeleteRoom,
  onDuplicateRoom,
  onUpdateWall,
  onDeleteWall,
  onUpdateOpening,
  onDeleteOpening,
  onAddPresetRoom,
}) => {
  const unitSuffix = unit === 'feet' ? 'ft' : 'm';
  const areaUnit = unit === 'feet' ? 'sq ft' : 'm²';

  const selectedRoom =
    selectedType === 'room' ? plan.rooms.find((r) => r.id === selectedId) : null;
  const selectedWall =
    selectedType === 'wall' ? plan.walls.find((w) => w.id === selectedId) : null;
  const selectedOpening =
    selectedType === 'opening' ? plan.openings.find((o) => o.id === selectedId) : null;

  // Selected Room Inspector
  if (selectedRoom) {
    const area = selectedRoom.width * selectedRoom.length;
    const isOutOfBounds =
      selectedRoom.x < 0 ||
      selectedRoom.y < 0 ||
      selectedRoom.x + selectedRoom.width > project.plotWidth ||
      selectedRoom.y + selectedRoom.length > project.plotLength;

    return (
      <div className="space-y-4 p-4 bg-white rounded-xl border border-slate-200 text-xs">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-xs border"
              style={{
                backgroundColor: ROOM_PRESETS[selectedRoom.type]?.fillColor || '#f1f5f9',
                borderColor: ROOM_PRESETS[selectedRoom.type]?.strokeColor || '#64748b',
              }}
            />
            <h4 className="font-bold text-slate-900 text-sm">Room Inspector</h4>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onDuplicateRoom(selectedRoom)}
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded cursor-pointer"
              title="Duplicate room"
              aria-label="Duplicate room"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onDeleteRoom(selectedRoom.id)}
              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded cursor-pointer"
              title="Delete room"
              aria-label="Delete room"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Room Name */}
        <div>
          <label className="block text-slate-600 font-medium mb-1">Room Label</label>
          <input
            type="text"
            value={selectedRoom.name}
            onChange={(e) => onUpdateRoom({ ...selectedRoom, name: e.target.value })}
            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-teal-500"
          />
        </div>

        {/* Room Type */}
        <div>
          <label className="block text-slate-600 font-medium mb-1">Functional Type</label>
          <select
            value={selectedRoom.type}
            onChange={(e) => {
              const newType = e.target.value as RoomType;
              onUpdateRoom({ ...selectedRoom, type: newType });
            }}
            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-hidden"
          >
            {Object.keys(ROOM_PRESETS).map((k) => (
              <option key={k} value={k}>
                {ROOM_PRESETS[k as RoomType].name}
              </option>
            ))}
          </select>
        </div>

        {/* Dimensions */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div>
            <label className="block text-slate-600 font-medium mb-1">
              Width ({unitSuffix})
            </label>
            <input
              type="number"
              step="0.5"
              min="1"
              value={selectedRoom.width}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                if (!isNaN(val) && val > 0) {
                  onUpdateRoom({ ...selectedRoom, width: val });
                }
              }}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg tabular-nums text-slate-900 font-medium"
            />
          </div>

          <div>
            <label className="block text-slate-600 font-medium mb-1">
              Length ({unitSuffix})
            </label>
            <input
              type="number"
              step="0.5"
              min="1"
              value={selectedRoom.length}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                if (!isNaN(val) && val > 0) {
                  onUpdateRoom({ ...selectedRoom, length: val });
                }
              }}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg tabular-nums text-slate-900 font-medium"
            />
          </div>
        </div>

        {/* Coordinates */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-slate-600 font-medium mb-1">
              X Position ({unitSuffix})
            </label>
            <input
              type="number"
              step="0.5"
              value={selectedRoom.x}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                if (!isNaN(val)) {
                  onUpdateRoom({ ...selectedRoom, x: val });
                }
              }}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg tabular-nums text-slate-900"
            />
          </div>

          <div>
            <label className="block text-slate-600 font-medium mb-1">
              Y Position ({unitSuffix})
            </label>
            <input
              type="number"
              step="0.5"
              value={selectedRoom.y}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                if (!isNaN(val)) {
                  onUpdateRoom({ ...selectedRoom, y: val });
                }
              }}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg tabular-nums text-slate-900"
            />
          </div>
        </div>

        {/* Area Badge */}
        <div className="p-3 bg-teal-50/70 border border-teal-200/80 rounded-lg flex items-center justify-between">
          <span className="font-medium text-teal-900">Room Area:</span>
          <span className="font-bold text-teal-950 tabular-nums">
            {area.toLocaleString(undefined, { maximumFractionDigits: 1 })} {areaUnit}
          </span>
        </div>

        {/* Out of bounds warning */}
        {isOutOfBounds && (
          <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-[11px] flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
            <span>This room extends outside the defined plot boundary. Adjust position or dimensions.</span>
          </div>
        )}
      </div>
    );
  }

  // Selected Wall Inspector
  if (selectedWall) {
    const dx = selectedWall.x2 - selectedWall.x1;
    const dy = selectedWall.y2 - selectedWall.y1;
    const length = Math.sqrt(dx * dx + dy * dy);

    return (
      <div className="space-y-4 p-4 bg-white rounded-xl border border-slate-200 text-xs">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h4 className="font-bold text-slate-900 text-sm">Interior Wall Inspector</h4>
          <button
            onClick={() => onDeleteWall(selectedWall.id)}
            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded cursor-pointer"
            title="Delete wall"
            aria-label="Delete wall"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        <div>
          <label className="block text-slate-600 font-medium mb-1">Wall Identifier</label>
          <input
            type="text"
            value={selectedWall.name}
            onChange={(e) => onUpdateWall({ ...selectedWall, name: e.target.value })}
            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-slate-600 font-medium mb-1">Start X ({unitSuffix})</label>
            <input
              type="number"
              step="0.5"
              value={selectedWall.x1}
              onChange={(e) => onUpdateWall({ ...selectedWall, x1: parseFloat(e.target.value) || 0 })}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg tabular-nums"
            />
          </div>
          <div>
            <label className="block text-slate-600 font-medium mb-1">Start Y ({unitSuffix})</label>
            <input
              type="number"
              step="0.5"
              value={selectedWall.y1}
              onChange={(e) => onUpdateWall({ ...selectedWall, y1: parseFloat(e.target.value) || 0 })}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg tabular-nums"
            />
          </div>
          <div>
            <label className="block text-slate-600 font-medium mb-1">End X ({unitSuffix})</label>
            <input
              type="number"
              step="0.5"
              value={selectedWall.x2}
              onChange={(e) => onUpdateWall({ ...selectedWall, x2: parseFloat(e.target.value) || 0 })}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg tabular-nums"
            />
          </div>
          <div>
            <label className="block text-slate-600 font-medium mb-1">End Y ({unitSuffix})</label>
            <input
              type="number"
              step="0.5"
              value={selectedWall.y2}
              onChange={(e) => onUpdateWall({ ...selectedWall, y2: parseFloat(e.target.value) || 0 })}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg tabular-nums"
            />
          </div>
        </div>

        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between">
          <span className="text-slate-500">Wall Length:</span>
          <span className="font-semibold text-slate-900 tabular-nums">
            {length.toFixed(1)} {unitSuffix}
          </span>
        </div>
      </div>
    );
  }

  // Selected Opening (Door/Window) Inspector
  if (selectedOpening) {
    return (
      <div className="space-y-4 p-4 bg-white rounded-xl border border-slate-200 text-xs">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h4 className="font-bold text-slate-900 text-sm capitalize">
            {selectedOpening.type} Marker Inspector
          </h4>
          <button
            onClick={() => onDeleteOpening(selectedOpening.id)}
            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded cursor-pointer"
            title={`Delete ${selectedOpening.type}`}
            aria-label={`Delete ${selectedOpening.type}`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        <div>
          <label className="block text-slate-600 font-medium mb-1">Marker Label</label>
          <input
            type="text"
            value={selectedOpening.name}
            onChange={(e) => onUpdateOpening({ ...selectedOpening, name: e.target.value })}
            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-slate-600 font-medium mb-1">Width ({unitSuffix})</label>
            <input
              type="number"
              step="0.5"
              min="0.5"
              value={selectedOpening.width}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                if (val > 0) onUpdateOpening({ ...selectedOpening, width: val });
              }}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg tabular-nums"
            />
          </div>

          <div>
            <label className="block text-slate-600 font-medium mb-1">Rotation</label>
            <button
              onClick={() => {
                const nextRot = ((selectedOpening.rotation + 90) % 360) as 0 | 90 | 180 | 270;
                onUpdateOpening({ ...selectedOpening, rotation: nextRot });
              }}
              className="w-full py-1.5 px-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg font-semibold text-slate-700 flex items-center justify-center gap-1 cursor-pointer"
            >
              <RotateCw className="w-3.5 h-3.5 text-teal-600" />
              <span>{selectedOpening.rotation}°</span>
            </button>
          </div>
        </div>

        {selectedOpening.type === 'door' && (
          <div>
            <label className="block text-slate-600 font-medium mb-1">Swing Direction</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onUpdateOpening({ ...selectedOpening, swingDirection: 'left' })}
                className={`py-1.5 rounded-lg border text-xs font-semibold cursor-pointer ${
                  selectedOpening.swingDirection === 'left'
                    ? 'border-teal-600 bg-teal-50 text-teal-900'
                    : 'border-slate-200 text-slate-600'
                }`}
              >
                Left Swing
              </button>
              <button
                type="button"
                onClick={() => onUpdateOpening({ ...selectedOpening, swingDirection: 'right' })}
                className={`py-1.5 rounded-lg border text-xs font-semibold cursor-pointer ${
                  selectedOpening.swingDirection === 'right'
                    ? 'border-teal-600 bg-teal-50 text-teal-900'
                    : 'border-slate-200 text-slate-600'
                }`}
              >
                Right Swing
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Nothing selected: Plot Overview & Quick Add
  const totalRoomArea = plan.rooms.reduce((acc, r) => acc + r.width * r.length, 0);
  const plotArea = project.plotWidth * project.plotLength;
  const coveragePercent = plotArea > 0 ? (totalRoomArea / plotArea) * 100 : 0;

  return (
    <div className="space-y-5 p-4 bg-white rounded-xl border border-slate-200 text-xs">
      <div className="pb-3 border-b border-slate-100 flex items-center justify-between">
        <h4 className="font-bold text-slate-900 text-sm">Plot & Plan Overview</h4>
        <span className="text-[11px] text-teal-700 font-semibold uppercase tracking-wider">
          {project.unit}
        </span>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-slate-600">
          <span>Plot Envelope:</span>
          <span className="font-semibold text-slate-900 tabular-nums">
            {project.plotWidth} × {project.plotLength} {unitSuffix}
          </span>
        </div>
        <div className="flex items-center justify-between text-slate-600">
          <span>Total Plot Area:</span>
          <span className="font-semibold text-slate-900 tabular-nums">
            {plotArea.toLocaleString()} {areaUnit}
          </span>
        </div>
        <div className="flex items-center justify-between text-slate-600">
          <span>Rooms Programmed:</span>
          <span className="font-semibold text-slate-900 tabular-nums">{plan.rooms.length}</span>
        </div>
        <div className="flex items-center justify-between text-slate-600">
          <span>Total Footprint Area:</span>
          <span className="font-semibold text-teal-700 tabular-nums">
            {totalRoomArea.toLocaleString(undefined, { maximumFractionDigits: 1 })} {areaUnit}
          </span>
        </div>
        <div className="flex items-center justify-between text-slate-600">
          <span>Plot Coverage Ratio:</span>
          <span className="font-semibold text-slate-900 tabular-nums">
            {coveragePercent.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Quick Add Presets */}
      <div className="pt-3 border-t border-slate-100">
        <div className="font-semibold text-slate-800 mb-2">Quick Add Rooms</div>
        <div className="grid grid-cols-2 gap-1.5">
          {[
            { type: 'living' as RoomType, label: '+ Living' },
            { type: 'bedroom' as RoomType, label: '+ Bedroom' },
            { type: 'kitchen' as RoomType, label: '+ Kitchen' },
            { type: 'dining' as RoomType, label: '+ Dining' },
            { type: 'bathroom' as RoomType, label: '+ Bathroom' },
            { type: 'office' as RoomType, label: '+ Office' },
          ].map((preset) => (
            <button
              key={preset.type}
              onClick={() => onAddPresetRoom(preset.type)}
              className="py-1.5 px-2 bg-slate-50 hover:bg-slate-100 hover:border-slate-300 border border-slate-200 rounded-lg font-medium text-slate-700 text-left transition-colors cursor-pointer"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-slate-500 text-[11px] leading-relaxed">
        Click any room or wall on the canvas to inspect and edit its geometric properties, or drag its handles.
      </div>
    </div>
  );
};
