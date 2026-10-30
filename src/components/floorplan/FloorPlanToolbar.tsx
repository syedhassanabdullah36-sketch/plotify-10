import React, { useState } from 'react';
import {
  Plus,
  Save,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Grid,
  Sparkles,
  Layers,
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  Box,
  Palette,
  Network,
  GitFork,
} from 'lucide-react';
import { FloorMetrics, ROOM_TYPE_CONFIG } from './geometry';

interface FloorPlanToolbarProps {
  currentFloor: number;
  totalFloors: number;
  onSelectFloor: (floor: number) => void;
  metrics: FloorMetrics;
  onAddRoom: (type: string, name?: string) => void;
  onAutoGenerate: () => void;
  onSave: () => void;
  hasUnsavedChanges: boolean;
  onBack: () => void;
  onOpen3D?: () => void;
  onOpenDesignStudio?: () => void;
  onOpenDecisionTwin?: () => void;
  onOpenConstraintGraph?: () => void;
  zoom: number;
  onZoomChange: (newZoom: number) => void;
  showGrid: boolean;
  onToggleGrid: () => void;
  gridSnap: number;
  onSnapChange: (snap: number) => void;
  boundaryWarningCount: number;
  overlapWarningCount: number;
  unitSuffix: string;
}

export const FloorPlanToolbar: React.FC<FloorPlanToolbarProps> = ({
  currentFloor,
  totalFloors,
  onSelectFloor,
  metrics,
  onAddRoom,
  onAutoGenerate,
  onSave,
  hasUnsavedChanges,
  onBack,
  onOpen3D,
  onOpenDesignStudio,
  onOpenDecisionTwin,
  onOpenConstraintGraph,
  zoom,
  onZoomChange,
  showGrid,
  onToggleGrid,
  gridSnap,
  onSnapChange,
  boundaryWarningCount,
  overlapWarningCount,
  unitSuffix,
}) => {
  const [showAddMenu, setShowAddMenu] = useState(false);

  const floorTabs: number[] = [];
  for (let f = 1; f <= totalFloors; f++) floorTabs.push(f);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3">
      {/* Top Row: Navigation, Floor Switcher, and Main Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Left: Back button & Floor Tabs */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Overview</span>
          </button>

          {/* Floor Level Selector */}
          <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg border border-slate-200 text-xs">
            {floorTabs.map((floorNum) => (
              <button
                key={floorNum}
                onClick={() => onSelectFloor(floorNum)}
                className={`px-3 py-1 font-semibold rounded-md transition-all cursor-pointer ${
                  currentFloor === floorNum
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {floorNum === 1 ? 'Floor 1 (Ground)' : `Floor ${floorNum}`}
              </button>
            ))}
          </div>

          {/* Warning Pills if any */}
          {(boundaryWarningCount > 0 || overlapWarningCount > 0) && (
            <div className="flex items-center gap-2">
              {boundaryWarningCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200 rounded-md">
                  <AlertTriangle className="w-3 h-3 text-red-600" />
                  <span>{boundaryWarningCount} Boundary Exceeded</span>
                </span>
              )}
              {overlapWarningCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 rounded-md">
                  <AlertTriangle className="w-3 h-3 text-amber-600" />
                  <span>{overlapWarningCount} Overlaps</span>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Right: Add Room, Save Actions, and Decision Twin */}
        <div className="flex items-center gap-2 flex-wrap">
          {onOpenDecisionTwin && (
            <button
              onClick={onOpenDecisionTwin}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                hasUnsavedChanges
                  ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                  : 'bg-teal-50 text-teal-800 border-teal-200 hover:bg-teal-100'
              }`}
              title="Inspect Architectural Decision Twin State"
            >
              <Network className="w-3.5 h-3.5 text-slate-700" />
              <span>{hasUnsavedChanges ? 'Twin: Draft Divergence' : 'Twin: In Sync'}</span>
            </button>
          )}

          {onOpenConstraintGraph && (
            <button
              onClick={onOpenConstraintGraph}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                hasUnsavedChanges
                  ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                  : 'bg-teal-50 text-teal-800 border-teal-200 hover:bg-teal-100'
              }`}
              title="Inspect Plotify Living Constraint Graph"
            >
              <GitFork className="w-3.5 h-3.5 text-slate-700" />
              <span>Constraints</span>
            </button>
          )}
          {/* Add Space Menu */}
          <div className="relative">
            <button
              onClick={() => setShowAddMenu(!showAddMenu)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-teal-600" />
              <span>Add Space</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {showAddMenu && (
              <div
                className="absolute right-0 top-full mt-1.5 w-52 bg-white rounded-xl shadow-xl border border-slate-200 p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100"
                onMouseLeave={() => setShowAddMenu(false)}
              >
                <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  Quick Add Space
                </div>
                {Object.entries(ROOM_TYPE_CONFIG).slice(0, 7).map(([typeKey, cfg]) => (
                  <button
                    key={typeKey}
                    onClick={() => {
                      onAddRoom(typeKey, cfg.label);
                      setShowAddMenu(false);
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-teal-50 hover:text-teal-900 rounded-md transition-colors text-left cursor-pointer"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-xs border border-slate-300"
                      style={{ backgroundColor: cfg.defaultColor }}
                    />
                    <span>{cfg.label}</span>
                  </button>
                ))}

                <div className="my-1 border-t border-slate-100" />
                <button
                  onClick={() => {
                    onAutoGenerate();
                    setShowAddMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-teal-800 hover:bg-teal-50 rounded-md transition-colors font-medium text-left cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                  <span>Auto-Arrange Program</span>
                </button>
              </div>
            )}
          </div>

          {/* Save Button */}
          <button
            onClick={onSave}
            className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg shadow-xs transition-all cursor-pointer ${
              hasUnsavedChanges
                ? 'bg-slate-900 text-white hover:bg-slate-800 ring-2 ring-teal-500/30'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {hasUnsavedChanges ? (
              <>
                <Save className="w-3.5 h-3.5 text-teal-400" />
                <span>Save Floor Plan</span>
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5 text-teal-600" />
                <span>Saved</span>
              </>
            )}
          </button>

          {onOpen3D && (
            <button
              onClick={onOpen3D}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 transition-colors cursor-pointer"
              title="Open 3D building viewer"
            >
              <Box className="w-3.5 h-3.5 text-teal-600" />
              <span>3D View</span>
            </button>
          )}

          {onOpenDesignStudio && (
            <button
              onClick={onOpenDesignStudio}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-colors cursor-pointer"
              title="Open Facade & Interior Design Studio"
            >
              <Palette className="w-3.5 h-3.5 text-teal-400" />
              <span>Design Studio</span>
            </button>
          )}
        </div>
      </div>

      {/* Bottom Sub-row: Canvas Controls & Live Area Coverage Metrics */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100 text-xs">
        {/* Canvas Tools */}
        <div className="flex items-center gap-3">
          {/* Zoom controls */}
          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            <button
              onClick={() => onZoomChange(Math.max(50, zoom - 15))}
              className="p-1 rounded text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
              title="Zoom Out"
              aria-label="Zoom out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] font-semibold text-slate-700 px-1.5 tabular-nums">
              {zoom}%
            </span>
            <button
              onClick={() => onZoomChange(Math.min(220, zoom + 15))}
              className="p-1 rounded text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
              title="Zoom In"
              aria-label="Zoom in"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onZoomChange(100)}
              className="p-1 rounded text-slate-400 hover:text-slate-700 transition-colors cursor-pointer ml-0.5"
              title="Reset Zoom to 100%"
              aria-label="Reset zoom"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          </div>

          {/* Grid Toggle */}
          <button
            onClick={onToggleGrid}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-[11px] font-medium transition-colors cursor-pointer ${
              showGrid
                ? 'bg-teal-50 text-teal-900 border-teal-200'
                : 'bg-slate-50 text-slate-600 border-slate-200'
            }`}
          >
            <Grid className="w-3 h-3" />
            <span>Grid</span>
          </button>

          {/* Snap Selector */}
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <span>Snap:</span>
            <select
              value={gridSnap}
              onChange={(e) => onSnapChange(parseFloat(e.target.value))}
              className="py-0.5 px-1.5 text-[11px] bg-slate-50 border border-slate-200 rounded-md text-slate-700 focus:outline-hidden"
            >
              <option value="0.5">0.5 {unitSuffix}</option>
              <option value="1.0">1.0 {unitSuffix}</option>
              <option value="2.0">2.0 {unitSuffix}</option>
              <option value="0">Off (Free)</option>
            </select>
          </div>
        </div>

        {/* Live Area Calculations Bar */}
        <div className="flex items-center gap-3 text-slate-600 text-xs tabular-nums">
          <div>
            Built Footprint:{' '}
            <strong className="text-slate-900">{metrics.areaLabel}</strong>
          </div>
          <span aria-hidden="true" className="text-slate-300">·</span>
          <div>
            Plot Coverage:{' '}
            <strong
              className={
                metrics.coverageRatio > 80
                  ? 'text-red-700 font-bold'
                  : metrics.coverageRatio > 65
                  ? 'text-amber-700 font-bold'
                  : 'text-teal-700 font-bold'
              }
            >
              {metrics.coverageRatio}%
            </strong>
          </div>
          <span aria-hidden="true" className="text-slate-300">·</span>
          <div className="hidden md:inline">
            Open Space:{' '}
            <span className="text-slate-700 font-medium">
              {metrics.openArea.toLocaleString()} {metrics.unitLabel}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
