import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Project } from '../../types/project';
import { Building3DCanvas } from './Building3DCanvas';
import {
  Viewer3DConfig,
  getDefaultViewerConfig,
  validateFloorPlanFor3D,
} from './building3dGeometry';
import {
  ArrowLeft,
  PenTool,
  RotateCcw,
  Eye,
  Layers,
  Sliders,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Info,
  Maximize2,
  Box,
  Compass,
  Building,
  Palette,
  Network,
  CheckCircle2,
} from 'lucide-react';

interface Building3DViewerProps {
  project: Project;
  onBack: () => void;
  onOpen2DEditor: (project: Project) => void;
  onOpenDesignStudio?: (project: Project) => void;
  onOpenDecisionTwin?: () => void;
}

export const Building3DViewer: React.FC<Building3DViewerProps> = ({
  project,
  onBack,
  onOpen2DEditor,
  onOpenDesignStudio,
  onOpenDecisionTwin,
}) => {
  const activeAlternative = useMemo(() => {
    if (!project.designAlternatives || project.designAlternatives.length === 0) return null;
    return (
      project.designAlternatives.find((a) => a.id === project.activeAlternativeId) ||
      project.designAlternatives[0]
    );
  }, [project.designAlternatives, project.activeAlternativeId]);

  const [config, setConfig] = useState<Viewer3DConfig>(() =>
    getDefaultViewerConfig(project.unit, activeAlternative, project.applyDesignTo3D ?? true)
  );

  // Sync alternative if project updates safely
  useEffect(() => {
    setConfig((prev) => {
      if (
        prev.activeAlternative === activeAlternative ||
        (prev.activeAlternative?.id === activeAlternative?.id &&
          prev.activeAlternative?.name === activeAlternative?.name)
      ) {
        return prev;
      }
      return {
        ...prev,
        activeAlternative,
      };
    });
  }, [activeAlternative]);

  const handlePresetApplied = useCallback(() => {}, []);

  const [cameraPreset, setCameraPreset] = useState<
    'perspective' | 'top' | 'front' | 'side' | 'fit'
  >('perspective');

  const [isControlsCollapsed, setIsControlsCollapsed] = useState(false);
  const [activeDockTab, setActiveDockTab] = useState<'camera' | 'layers' | 'dimensions'>('camera');

  // Rooms source: from project.floorPlan
  const rooms = useMemo(() => {
    return project.floorPlan?.rooms || [];
  }, [project.floorPlan]);

  // Validation
  const validation = useMemo(() => {
    return validateFloorPlanFor3D(rooms, project.plotWidth, project.plotLength);
  }, [rooms, project.plotWidth, project.plotLength]);

  const unitSuffix = project.unit === 'feet' ? 'ft' : 'm';
  const unitAreaSuffix = project.unit === 'feet' ? 'sq ft' : 'm²';

  // Floor levels present in rooms
  const floorLevels = useMemo(() => {
    const levels = new Set<number>();
    for (const r of validation.validRooms) {
      levels.add(r.floorLevel);
    }
    const arr = Array.from(levels).sort((a, b) => a - b);
    return arr.length > 0 ? arr : [1];
  }, [validation.validRooms]);

  // Empty state if 0 valid rooms
  if (validation.validRooms.length === 0) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Project Overview</span>
          </button>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-xs max-w-lg mx-auto">
          <div className="w-12 h-12 bg-teal-50 text-teal-700 rounded-xl flex items-center justify-center mx-auto mb-4 border border-teal-100">
            <Box className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">No 2D Floor Plan Data</h3>
          <p className="text-xs text-slate-600 mt-2 leading-relaxed">
            The 3D Building Engine generates walls, slabs, and rooms directly from verified 2D floor-plan geometry. No spaces have been placed on this project yet.
          </p>
          <div className="mt-6">
            <button
              onClick={() => onOpen2DEditor(project)}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <PenTool className="w-4 h-4 text-teal-400" />
              <span>Open 2D Floor-Plan Editor</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      {/* Top Header Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            title="Back to Overview"
            aria-label="Back to Overview"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="font-semibold text-teal-700 uppercase tracking-wider text-[11px]">
                3D Model Engine
              </span>
              <span aria-hidden="true">·</span>
              <span>{project.unit === 'feet' ? 'Imperial (ft)' : 'Metric (m)'}</span>
              <span aria-hidden="true">·</span>
              <span className="capitalize">{project.projectType}</span>
            </div>
            <h2 className="text-base font-bold text-slate-900 mt-0.5 tracking-tight flex items-center gap-2">
              <span>{project.name}</span>
              <span className="text-xs font-normal text-slate-500">
                ({project.plotWidth}×{project.plotLength} {unitSuffix} plot)
              </span>
            </h2>
          </div>
        </div>

        {/* Floor Selection & Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Floor Isolator */}
          {floorLevels.length > 1 && (
            <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg border border-slate-200 text-xs">
              <button
                onClick={() => setConfig({ ...config, selectedFloor: 'all' })}
                className={`px-2.5 py-1 font-semibold rounded-md transition-all cursor-pointer ${
                  config.selectedFloor === 'all'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All Floors
              </button>
              {floorLevels.map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => setConfig({ ...config, selectedFloor: lvl })}
                  className={`px-2.5 py-1 font-semibold rounded-md transition-all cursor-pointer ${
                    config.selectedFloor === lvl
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Floor {lvl}
                </button>
              ))}
            </div>
          )}

          {/* Design Concept Finish Toggle */}
          {activeAlternative && (
            <button
              onClick={() =>
                setConfig({
                  ...config,
                  applyDesignAlternative: !config.applyDesignAlternative,
                })
              }
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                config.applyDesignAlternative
                  ? 'bg-teal-50 border-teal-200 text-teal-900 shadow-2xs'
                  : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900'
              }`}
              title={
                config.applyDesignAlternative
                  ? 'Showing materials from active design alternative. Click to view default architectural white model.'
                  : 'Click to apply materials and finishes from active design alternative.'
              }
            >
              <Palette className={`w-3.5 h-3.5 ${config.applyDesignAlternative ? 'text-teal-700' : 'text-slate-400'}`} />
              <span>{config.applyDesignAlternative ? 'Finishes: Active' : 'Finishes: Off'}</span>
            </button>
          )}

          {onOpenDecisionTwin && (
            <button
              onClick={onOpenDecisionTwin}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-lg border border-teal-200 transition-colors cursor-pointer"
              title="Inspect Architectural Decision Twin synchronization state"
            >
              <Network className="w-3.5 h-3.5 text-slate-700" />
              <span>Twin: 3D Synced</span>
            </button>
          )}

          <button
            onClick={() => onOpen2DEditor(project)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 transition-colors cursor-pointer"
          >
            <PenTool className="w-3.5 h-3.5 text-teal-600" />
            <span>2D Plan</span>
          </button>

          {onOpenDesignStudio && (
            <button
              onClick={() => onOpenDesignStudio(project)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <Palette className="w-3.5 h-3.5 text-teal-400" />
              <span>Design Studio</span>
            </button>
          )}
        </div>
      </div>

      {/* Geometry Warnings Banner (if any) */}
      {validation.warnings.length > 0 && (
        <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-semibold">Geometry Notice:</span>{' '}
            {validation.warnings.length === 1
              ? validation.warnings[0]
              : `${validation.warnings.length} space boundary warnings detected. 3D geometry generated accurately according to entered coordinates.`}
          </div>
        </div>
      )}

      {/* Main 3D Canvas Viewport */}
      <div className="relative">
        <Building3DCanvas
          project={project}
          config={config}
          validRooms={validation.validRooms}
          cameraPreset={cameraPreset}
          onPresetApplied={handlePresetApplied}
        />

        {/* Collapsible Unified Bottom Control Dock (Three.js Skill Directive) */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[94%] max-w-3xl z-20 pointer-events-auto">
          {/* Dock Header Collapse Button */}
          <div className="flex justify-center mb-1">
            <button
              onClick={() => setIsControlsCollapsed(!isControlsCollapsed)}
              className="inline-flex items-center gap-1 px-3 py-1 bg-white/95 backdrop-blur-xs border border-slate-200 rounded-full text-[11px] font-semibold text-slate-700 hover:text-slate-900 shadow-xs transition-colors cursor-pointer"
            >
              {isControlsCollapsed ? (
                <>
                  <ChevronUp className="w-3 h-3 text-teal-600" />
                  <span>Show 3D Controls</span>
                </>
              ) : (
                <>
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                  <span>Hide Controls</span>
                </>
              )}
            </button>
          </div>

          {!isControlsCollapsed && (
            <div className="bg-white/95 backdrop-blur-xs rounded-xl border border-slate-200 p-4 shadow-lg space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-150">
              {/* Tab Selector */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 text-xs">
                <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
                  <button
                    onClick={() => setActiveDockTab('camera')}
                    className={`px-3 py-1 font-semibold rounded-md transition-all cursor-pointer ${
                      activeDockTab === 'camera'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Camera Views
                  </button>
                  <button
                    onClick={() => setActiveDockTab('layers')}
                    className={`px-3 py-1 font-semibold rounded-md transition-all cursor-pointer ${
                      activeDockTab === 'layers'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Layer Visibility
                  </button>
                  <button
                    onClick={() => setActiveDockTab('dimensions')}
                    className={`px-3 py-1 font-semibold rounded-md transition-all cursor-pointer ${
                      activeDockTab === 'dimensions'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Wall & Slab Specs
                  </button>
                </div>

                <div className="hidden sm:flex items-center gap-2 text-[11px] text-slate-500 tabular-nums">
                  <span>{validation.validRooms.length} Spaces Modeled</span>
                </div>
              </div>

              {/* Tab 1: Camera Controls */}
              {activeDockTab === 'camera' && (
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      onClick={() => setCameraPreset('perspective')}
                      className={`px-3 py-1.5 rounded-lg border font-medium transition-colors cursor-pointer ${
                        cameraPreset === 'perspective'
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      Isometric 3D
                    </button>
                    <button
                      onClick={() => setCameraPreset('top')}
                      className={`px-3 py-1.5 rounded-lg border font-medium transition-colors cursor-pointer ${
                        cameraPreset === 'top'
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      Top-Down (Plan)
                    </button>
                    <button
                      onClick={() => setCameraPreset('front')}
                      className={`px-3 py-1.5 rounded-lg border font-medium transition-colors cursor-pointer ${
                        cameraPreset === 'front'
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      Front Elevation
                    </button>
                    <button
                      onClick={() => setCameraPreset('side')}
                      className={`px-3 py-1.5 rounded-lg border font-medium transition-colors cursor-pointer ${
                        cameraPreset === 'side'
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      Side Elevation
                    </button>
                  </div>

                  <button
                    onClick={() => setCameraPreset('fit')}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-teal-600" />
                    <span>Fit to Screen</span>
                  </button>
                </div>
              )}

              {/* Tab 2: Layer Visibility */}
              {activeDockTab === 'layers' && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setConfig({ ...config, showWalls: !config.showWalls })}
                    className={`p-2 rounded-lg border font-medium text-center transition-colors cursor-pointer ${
                      config.showWalls
                        ? 'bg-teal-50 border-teal-200 text-teal-900'
                        : 'bg-slate-50 border-slate-200 text-slate-500'
                    }`}
                  >
                    {config.showWalls ? '✓ Walls Visible' : '✕ Walls Hidden'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setConfig({ ...config, showSlabs: !config.showSlabs })}
                    className={`p-2 rounded-lg border font-medium text-center transition-colors cursor-pointer ${
                      config.showSlabs
                        ? 'bg-teal-50 border-teal-200 text-teal-900'
                        : 'bg-slate-50 border-slate-200 text-slate-500'
                    }`}
                  >
                    {config.showSlabs ? '✓ Room Slabs Visible' : '✕ Slabs Hidden'}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setConfig({ ...config, showPlotBoundary: !config.showPlotBoundary })
                    }
                    className={`p-2 rounded-lg border font-medium text-center transition-colors cursor-pointer ${
                      config.showPlotBoundary
                        ? 'bg-teal-50 border-teal-200 text-teal-900'
                        : 'bg-slate-50 border-slate-200 text-slate-500'
                    }`}
                  >
                    {config.showPlotBoundary ? '✓ Plot Ground Slab' : '✕ Plot Ground Hidden'}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setConfig({ ...config, showOpenings: !config.showOpenings })
                    }
                    className={`p-2 rounded-lg border font-medium text-center transition-colors cursor-pointer ${
                      config.showOpenings
                        ? 'bg-teal-50 border-teal-200 text-teal-900'
                        : 'bg-slate-50 border-slate-200 text-slate-500'
                    }`}
                  >
                    {config.showOpenings ? '✓ Conceptual Openings' : '✕ Openings Hidden'}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setConfig({ ...config, showColumns: !config.showColumns })
                    }
                    className={`p-2 rounded-lg border font-medium text-center transition-colors cursor-pointer ${
                      config.showColumns !== false
                        ? 'bg-teal-50 border-teal-200 text-teal-900'
                        : 'bg-slate-50 border-slate-200 text-slate-500'
                    }`}
                  >
                    {config.showColumns !== false ? '✓ Structural Columns' : '✕ Columns Hidden'}
                  </button>
                </div>
              )}

              {/* Tab 3: Dimensions & Wall Height Parameters */}
              {activeDockTab === 'dimensions' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-semibold text-slate-700">
                        Wall Height:
                      </label>
                      <span className="font-bold text-slate-900 tabular-nums">
                        {config.wallHeight} {unitSuffix}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={project.unit === 'metres' ? 2.2 : 7}
                      max={project.unit === 'metres' ? 5.0 : 16}
                      step={project.unit === 'metres' ? 0.1 : 0.5}
                      value={config.wallHeight}
                      onChange={(e) =>
                        setConfig({ ...config, wallHeight: parseFloat(e.target.value) })
                      }
                      className="w-full accent-teal-600"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-semibold text-slate-700">
                        Wall Opacity (Ghosting):
                      </label>
                      <span className="font-bold text-slate-900 tabular-nums">
                        {Math.round(config.wallOpacity * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.2"
                      max="1.0"
                      step="0.05"
                      value={config.wallOpacity}
                      onChange={(e) =>
                        setConfig({ ...config, wallOpacity: parseFloat(e.target.value) })
                      }
                      className="w-full accent-teal-600"
                    />
                  </div>
                </div>
              )}

              {/* Architectural Assumptions & Honesty Disclosure */}
              <div className="pt-2 border-t border-slate-100 flex items-start gap-2 text-[11px] text-slate-500">
                <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                <p>
                  <strong>Conceptual 3D Visualization:</strong> Model generated directly from saved 2D spaces. Wall height: {config.wallHeight} {unitSuffix}; Thickness: {config.wallThickness} {unitSuffix}. Openings are conceptual visual markers. Not certified for structural safety, MEP engineering, or construction blueprints.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
