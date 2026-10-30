import React from 'react';
import { FloorPlanRoom, MeasurementUnit } from '../../types/project';
import { BoundaryViolation, OverlapCollision, ROOM_TYPE_CONFIG } from './geometry';
import {
  Trash2,
  Copy,
  AlertTriangle,
  Move,
  Maximize2,
  Layers,
  Sparkles,
  Info,
} from 'lucide-react';

interface RoomInspectorProps {
  selectedRoom: FloorPlanRoom | null;
  onUpdateRoom: (updated: FloorPlanRoom) => void;
  onDeleteRoom: (roomId: string) => void;
  onDuplicateRoom: (room: FloorPlanRoom) => void;
  plotWidth: number;
  plotLength: number;
  unit: MeasurementUnit;
  boundaryViolation: BoundaryViolation | null;
  overlapCollisions: OverlapCollision[];
  onSnapInsideBoundary?: (room: FloorPlanRoom) => void;
}

export const RoomInspector: React.FC<RoomInspectorProps> = ({
  selectedRoom,
  onUpdateRoom,
  onDeleteRoom,
  onDuplicateRoom,
  plotWidth,
  plotLength,
  unit,
  boundaryViolation,
  overlapCollisions,
  onSnapInsideBoundary,
}) => {
  const unitSuffix = unit === 'feet' ? 'ft' : 'm';
  const unitAreaSuffix = unit === 'feet' ? 'sq ft' : 'm²';

  if (!selectedRoom) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between h-full">
        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <Layers className="w-4 h-4 text-teal-600" />
            <h3 className="text-sm font-bold text-slate-900">Room Properties</h3>
          </div>

          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200/80 text-center space-y-2">
            <Info className="w-6 h-6 text-slate-400 mx-auto" />
            <h4 className="text-xs font-semibold text-slate-800">No Space Selected</h4>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Click any room on the 2D canvas to inspect exact coordinates, resize dimensions, or adjust room naming.
            </p>
          </div>

          <div className="text-xs text-slate-500 space-y-2 pt-2">
            <div className="font-semibold text-slate-700">Quick Canvas Controls:</div>
            <ul className="space-y-1 text-[11px] list-disc pl-4 text-slate-600">
              <li><strong>Click & Drag</strong> to reposition spaces.</li>
              <li><strong>Corner / Edge Handles</strong> to resize rooms interactively.</li>
              <li><strong>Arrow Keys</strong> on keyboard to nudge by 0.5 {unitSuffix}.</li>
              <li><strong>Delete / Backspace</strong> key to remove selected space.</li>
            </ul>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 text-[11px] text-slate-400">
          Plot Boundary: {plotWidth} × {plotLength} {unitSuffix}
        </div>
      </div>
    );
  }

  const roomArea = (selectedRoom.width * selectedRoom.length).toFixed(1);

  // Filter overlaps involving this specific room
  const thisRoomOverlaps = overlapCollisions.filter(
    (c) => c.room1Id === selectedRoom.id || c.room2Id === selectedRoom.id
  );

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between space-y-4 h-full">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span
              className="w-3.5 h-3.5 rounded-xs border border-slate-300 shrink-0"
              style={{ backgroundColor: selectedRoom.color || '#f1f5f9' }}
            />
            <h3 className="text-sm font-bold text-slate-900 truncate max-w-[140px]">
              {selectedRoom.name}
            </h3>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => onDuplicateRoom(selectedRoom)}
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              title="Duplicate space"
              aria-label="Duplicate room"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onDeleteRoom(selectedRoom.id)}
              className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
              title="Delete space"
              aria-label="Delete room"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Boundary Warning Alert */}
        {boundaryViolation && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs space-y-1.5">
            <div className="flex items-center gap-1.5 font-bold text-red-700">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span>Boundary Overflow Alert</span>
            </div>
            <p className="text-[11px] text-red-600 leading-tight">
              Space extends outside plot boundary ({plotWidth}×{plotLength} {unitSuffix}).
            </p>
            {onSnapInsideBoundary && (
              <button
                type="button"
                onClick={() => onSnapInsideBoundary(selectedRoom)}
                className="mt-1 w-full py-1 text-[11px] font-semibold text-red-800 bg-red-100/80 hover:bg-red-200/80 rounded transition-colors cursor-pointer"
              >
                Snap Inside Plot
              </button>
            )}
          </div>
        )}

        {/* Overlap Warning Alert */}
        {thisRoomOverlaps.length > 0 && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-amber-800">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Spatial Overlap Alert</span>
            </div>
            <p className="text-[11px] text-amber-700 leading-tight">
              Collides with{' '}
              {thisRoomOverlaps.map((c, i) => (
                <span key={i} className="font-semibold">
                  {c.room1Id === selectedRoom.id ? c.room2Name : c.room1Name}
                  {i < thisRoomOverlaps.length - 1 ? ', ' : ''}
                </span>
              ))}
              .
            </p>
          </div>
        )}

        {/* Room Name */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Space Identifier
          </label>
          <input
            type="text"
            value={selectedRoom.name}
            onChange={(e) => onUpdateRoom({ ...selectedRoom, name: e.target.value })}
            className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
          />
        </div>

        {/* Room Type */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Space Category
          </label>
          <select
            value={selectedRoom.type}
            onChange={(e) => {
              const newType = e.target.value;
              const config = ROOM_TYPE_CONFIG[newType];
              onUpdateRoom({
                ...selectedRoom,
                type: newType,
                color: config ? config.defaultColor : selectedRoom.color,
              });
            }}
            className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
          >
            {Object.entries(ROOM_TYPE_CONFIG).map(([key, cfg]) => (
              <option key={key} value={key}>
                {cfg.label}
              </option>
            ))}
          </select>
        </div>

        {/* Dimensions: Width & Length */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Width ({unitSuffix})
            </label>
            <input
              type="number"
              step="0.5"
              min="2"
              value={selectedRoom.width}
              onChange={(e) => {
                const val = Math.max(2, parseFloat(e.target.value) || 2);
                onUpdateRoom({ ...selectedRoom, width: val });
              }}
              className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg tabular-nums text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Length ({unitSuffix})
            </label>
            <input
              type="number"
              step="0.5"
              min="2"
              value={selectedRoom.length}
              onChange={(e) => {
                const val = Math.max(2, parseFloat(e.target.value) || 2);
                onUpdateRoom({ ...selectedRoom, length: val });
              }}
              className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg tabular-nums text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            />
          </div>
        </div>

        {/* Position: X & Y Coordinates */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Offset X ({unitSuffix})
            </label>
            <input
              type="number"
              step="0.5"
              value={selectedRoom.x}
              onChange={(e) => {
                const val = parseFloat(e.target.value) || 0;
                onUpdateRoom({ ...selectedRoom, x: val });
              }}
              className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg tabular-nums text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Offset Y ({unitSuffix})
            </label>
            <input
              type="number"
              step="0.5"
              value={selectedRoom.y}
              onChange={(e) => {
                const val = parseFloat(e.target.value) || 0;
                onUpdateRoom({ ...selectedRoom, y: val });
              }}
              className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg tabular-nums text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            />
          </div>
        </div>

        {/* Computed Area Summary Box */}
        <div className="p-3 bg-teal-50/70 border border-teal-200/80 rounded-lg flex items-center justify-between text-xs">
          <span className="font-semibold text-teal-900">Room Built Area:</span>
          <span className="font-bold text-teal-950 tabular-nums">
            {roomArea} {unitAreaSuffix}
          </span>
        </div>
      </div>

      {/* Delete Action Button */}
      <div className="pt-3 border-t border-slate-100">
        <button
          type="button"
          onClick={() => onDeleteRoom(selectedRoom.id)}
          className="w-full py-2 px-3 text-xs font-semibold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100/70 rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Remove Space</span>
        </button>
      </div>
    </div>
  );
};
