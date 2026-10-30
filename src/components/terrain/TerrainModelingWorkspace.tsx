import React, { useState, useMemo } from 'react';
import {
  Mountain,
  Upload,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  ArrowLeft,
  Compass,
  PenTool,
  Box,
  FileCode2,
  FileSpreadsheet,
  Sliders,
  Eye,
  Trash2,
  Plus,
  ShieldCheck,
  MapPin,
  Activity,
} from 'lucide-react';
import { Project, MeasurementUnit } from '../../types/project';
import {
  TerrainDatasetModel,
  TerrainAlignmentAndCalibration,
  CSVColumnMapping,
  TerrainHorizontalCRS,
  TerrainLinearUnit,
  TerrainVerticalDatum,
} from '../../types/terrain';
import {
  getSupportedTerrainProfile,
  SAMPLE_TERRAIN_FIXTURES,
  parseTerrainInputToDataset,
  buildDefaultTerrainCalibration,
  evaluateTerrainModelForProject,
  interpolateElevationOnTIN,
  applyTerrainModelToProject,
  removeTerrainModelFromProject,
} from '../../services/terrainService';

interface TerrainModelingWorkspaceProps {
  project: Project | null;
  defaultUnit: MeasurementUnit;
  onBack: () => void;
  onUpdateProject: (project: Project) => void;
  onOpenFloorPlan?: (project: Project) => void;
  onOpen3DViewer?: (project: Project) => void;
  onOpenSiteContext?: (project: Project) => void;
  onOpenIFC?: (project?: Project) => void;
  onOpenCAD?: (project?: Project) => void;
  onShowToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const TerrainModelingWorkspace: React.FC<TerrainModelingWorkspaceProps> = ({
  project,
  defaultUnit,
  onBack,
  onUpdateProject,
  onOpenFloorPlan,
  onOpen3DViewer,
  onOpenSiteContext,
  onOpenIFC,
  onOpenCAD,
  onShowToast,
}) => {
  const supportProfile = useMemo(() => getSupportedTerrainProfile(), []);
  const activeUnit: MeasurementUnit = project?.unit || defaultUnit;
  const unitLabel = activeUnit === 'feet' ? 'ft' : 'm';

  const [activeTab, setActiveTab] = useState<'import' | 'calibrate' | 'visualize' | 'matrix'>('import');

  // Raw file / text input state
  const [selectedFixtureId, setSelectedFixtureId] = useState<string>(SAMPLE_TERRAIN_FIXTURES[0].id);
  const [fileName, setFileName] = useState<string>(SAMPLE_TERRAIN_FIXTURES[0].fileName);
  const [rawContent, setRawContent] = useState<string>(SAMPLE_TERRAIN_FIXTURES[0].content);

  // Optional custom CSV Column mapping state
  const [csvMapping, setCsvMapping] = useState<Partial<CSVColumnMapping>>({
    hasHeaderRow: true,
    delimiter: ',',
  });

  // Parse dataset deterministically from current raw input & mapping
  const parsedDataset: TerrainDatasetModel = useMemo(() => {
    return parseTerrainInputToDataset({
      fileName,
      fileSizeBytes: rawContent.length,
      rawContent,
      csvMapping,
    });
  }, [fileName, rawContent, csvMapping]);

  // Calibration state
  const [calibration, setCalibration] = useState<TerrainAlignmentAndCalibration>(() => {
    const initialDataset = parseTerrainInputToDataset({
      fileName: SAMPLE_TERRAIN_FIXTURES[0].fileName,
      fileSizeBytes: SAMPLE_TERRAIN_FIXTURES[0].content.length,
      rawContent: SAMPLE_TERRAIN_FIXTURES[0].content,
    });
    return buildDefaultTerrainCalibration(initialDataset, project, activeUnit);
  });

  // Sync calibration defaults when fixture or dataset changes
  const resetCalibrationForDataset = (
    dataset: TerrainDatasetModel,
    autoConfirm: boolean = false
  ) => {
    const nextCal = buildDefaultTerrainCalibration(dataset, project, activeUnit);
    setCalibration({
      ...nextCal,
      userConfirmedUnitsAndCRS: autoConfirm ? true : nextCal.userConfirmedUnitsAndCRS,
      userConfirmedVerticalDatum: autoConfirm ? true : nextCal.userConfirmedVerticalDatum,
    });
  };

  // Manual point entry form
  const [manualX, setManualX] = useState<string>('10');
  const [manualY, setManualY] = useState<string>('10');
  const [manualZ, setManualZ] = useState<string>('102.0');
  const [manualDesc, setManualDesc] = useState<string>('manual-spot-level');

  // Display toggles for 2D & 3D
  const [showContoursIn2D, setShowContoursIn2D] = useState<boolean>(
    project?.terrainModeling?.displaySettings?.showContoursIn2D ?? true
  );
  const [showElevationPoints, setShowElevationPoints] = useState<boolean>(
    project?.terrainModeling?.displaySettings?.showElevationPoints ?? true
  );
  const [showTINWireframe, setShowTINWireframe] = useState<boolean>(true);
  const [showSurfaceIn3D, setShowSurfaceIn3D] = useState<boolean>(
    project?.terrainModeling?.displaySettings?.showSurfaceIn3D ?? true
  );
  const [verticalExaggerationDisplayOnly, setVerticalExaggerationDisplayOnly] = useState<number>(
    project?.terrainModeling?.displaySettings?.verticalExaggerationDisplayOnly ?? 1.0
  );

  // Interactive 2D canvas elevation query point
  const [queryPoint, setQueryPoint] = useState<{ x: number; y: number } | null>(null);

  // Evaluate full P43 Terrain Modeling result
  const modelingResult = useMemo(() => {
    if (!project) return null;
    return evaluateTerrainModelForProject(parsedDataset, calibration, project, activeUnit);
  }, [parsedDataset, calibration, project, activeUnit]);

  // Query interpolated elevation at clicked/hovered point
  const queriedElevation = useMemo(() => {
    if (!queryPoint || !modelingResult?.surfaceMesh) return null;
    return interpolateElevationOnTIN(modelingResult.surfaceMesh, queryPoint.x, queryPoint.y);
  }, [queryPoint, modelingResult]);

  // Load sample fixture handler
  const handleSelectFixture = (fixtureId: string) => {
    const fixture = SAMPLE_TERRAIN_FIXTURES.find((f) => f.id === fixtureId);
    if (!fixture) return;
    setSelectedFixtureId(fixture.id);
    setFileName(fixture.fileName);
    setRawContent(fixture.content);
    setCsvMapping({ hasHeaderRow: true, delimiter: ',' });

    const ds = parseTerrainInputToDataset({
      fileName: fixture.fileName,
      fileSizeBytes: fixture.content.length,
      rawContent: fixture.content,
    });
    // Only auto-confirm if the fixture header explicitly declared CRS, units, and datum
    resetCalibrationForDataset(ds, false);
    onShowToast?.(`Loaded sample terrain dataset "${fixture.label}".`, 'info');
  };

  // File upload handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      setFileName(file.name);
      setRawContent(text);
      setCsvMapping({ hasHeaderRow: true, delimiter: ',' });
      const ds = parseTerrainInputToDataset({
        fileName: file.name,
        fileSizeBytes: text.length,
        rawContent: text,
      });
      resetCalibrationForDataset(ds, false);
      onShowToast?.(`Inspected terrain file "${file.name}". Please review units & datum.`, 'info');
    };
    reader.readAsText(file);
  };

  // Add manual spot elevation row to CSV content
  const handleAddManualPoint = () => {
    const xVal = Number(manualX);
    const yVal = Number(manualY);
    const zVal = Number(manualZ);
    if (!Number.isFinite(xVal) || !Number.isFinite(yVal) || !Number.isFinite(zVal)) {
      onShowToast?.('Please enter valid finite X, Y, and Z numbers.', 'error');
      return;
    }
    const nextId = `PT-MAN-${parsedDataset.sourcePoints.length + 1}`;
    const appendedLine = `${nextId},${xVal},${yVal},${zVal},${manualDesc.replace(/,/g, ' ')}`;
    const updatedRaw =
      rawContent.trim().endsWith('.geojson') || rawContent.trim().startsWith('{')
        ? `# CRS: PROJECT_LOCAL\n# UNIT: METRE\n# DATUM: LOCAL_SURVEY_BENCHMARK\npoint_id,easting,northing,elevation,classification\n${appendedLine}`
        : `${rawContent.trim()}\n${appendedLine}`;
    const nextFileName = fileName.endsWith('.csv') ? fileName : 'manual_spot_survey.csv';
    setFileName(nextFileName);
    setRawContent(updatedRaw);
    onShowToast?.(`Added spot elevation ${nextId} (${xVal}, ${yVal}, Z=${zVal}).`, 'success');
  };

  // Toggle point exclusion
  const handleToggleExcludePoint = (pointId: string) => {
    setCalibration((prev) => {
      const exists = prev.excludedPointIds.includes(pointId);
      const nextExcluded = exists
        ? prev.excludedPointIds.filter((id) => id !== pointId)
        : [...prev.excludedPointIds, pointId];
      return {
        ...prev,
        excludedPointIds: nextExcluded,
      };
    });
  };

  // Apply Terrain Model to active project
  const handleApplyToProject = () => {
    if (!project || !modelingResult) return;
    if (!modelingResult.success) {
      onShowToast?.(
        modelingResult.errors[0]?.message || 'Resolve blocking terrain errors before applying.',
        'error'
      );
      return;
    }

    const { updatedProject } = applyTerrainModelToProject(
      project,
      parsedDataset,
      calibration,
      modelingResult,
      {
        showSurfaceIn3D,
        showContoursIn2D,
        showElevationPoints,
        verticalExaggerationDisplayOnly,
      }
    );

    onUpdateProject(updatedProject);
    onShowToast?.(
      `Applied terrain model "${parsedDataset.fileName}" (${modelingResult.surfaceMesh?.triangles.length || 0} TIN triangles) with safety rollback checkpoint.`,
      'success'
    );
  };

  // Remove Terrain Model from active project
  const handleRemoveFromProject = () => {
    if (!project) return;
    const { updatedProject } = removeTerrainModelFromProject(project);
    onUpdateProject(updatedProject);
    onShowToast?.(
      'Removed terrain model from project (pre-removal safety snapshot saved).',
      'info'
    );
  };

  if (!project) {
    return (
      <div className="max-w-4xl mx-auto bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-4 shadow-xs mt-8">
        <div className="w-12 h-12 rounded-xl bg-teal-50 text-teal-700 mx-auto flex items-center justify-center border border-teal-200">
          <Mountain className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Select a Project for Terrain & Topographic Site Modeling
          </h2>
          <p className="text-xs text-slate-500 mt-1 max-w-lg mx-auto">
            Terrain modeling requires an active Plotify project so elevation points, Delaunay TIN surfaces, and contour lines can be aligned with the project parcel envelope and building footprint.
          </p>
        </div>
        <button
          onClick={onBack}
          className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors"
        >
          Go to Projects
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="space-y-1">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Project Overview</span>
          </button>
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-900 text-teal-400 flex items-center justify-center">
              <Mountain className="w-4 h-4" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Terrain & Topographic Site Modeling
            </h1>
            <span className="px-2.5 py-0.5 text-[11px] font-bold rounded-md bg-teal-50 text-teal-900 border border-teal-200">
              P43 · {project.name} ({project.plotWidth}×{project.plotLength} {unitLabel})
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Import survey elevation points or GeoJSON topography, verify CRS & vertical datum, generate Delaunay TIN surfaces & derived contours, and inspect site-building elevation relationships.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onOpenFloorPlan && (
            <button
              onClick={() => onOpenFloorPlan(project)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors cursor-pointer"
            >
              <PenTool className="w-3.5 h-3.5 text-teal-700" />
              <span>2D Plan</span>
            </button>
          )}
          {onOpen3DViewer && (
            <button
              onClick={() => onOpen3DViewer(project)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              <Box className="w-3.5 h-3.5 text-teal-600" />
              <span>3D View (Terrain Overlay)</span>
            </button>
          )}
          {onOpenSiteContext && (
            <button
              onClick={() => onOpenSiteContext(project)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              <Compass className="w-3.5 h-3.5 text-teal-700" />
              <span>Site & Context</span>
            </button>
          )}
          {onOpenIFC && (
            <button
              onClick={() => onOpenIFC(project)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              <FileCode2 className="w-3.5 h-3.5 text-teal-700" />
              <span>OpenBIM / IFC</span>
            </button>
          )}
          {onOpenCAD && (
            <button
              onClick={() => onOpenCAD(project)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-teal-700" />
              <span>CAD / DXF</span>
            </button>
          )}
        </div>
      </div>

      {/* Honest Survey & Engineering Boundary Notice */}
      <div className="bg-amber-50/90 border border-amber-200 rounded-xl p-3.5 flex items-start gap-3">
        <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-950 leading-relaxed">
          <span className="font-bold">Preliminary Topographic Modeling Boundary:</span>{' '}
          {supportProfile.claimLimitations[0]} {supportProfile.claimLimitations[2]}
        </div>
      </div>

      {/* Step Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 bg-white p-1.5 rounded-xl border border-slate-200 shadow-2xs">
        {[
          { id: 'import', label: '1. Import & Inspect Source Data', icon: Upload },
          { id: 'calibrate', label: '2. CRS, Units, Datum & Point Filter', icon: Sliders },
          { id: 'visualize', label: '3. 2D Contour/TIN Map, Sections & Apply', icon: Eye },
          { id: 'matrix', label: '4. Support Matrix & Provenance', icon: ShieldCheck },
        ].map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as typeof activeTab)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                isActive
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-teal-400' : 'text-slate-400'}`} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* STEP 1: IMPORT & INSPECT SOURCE DATA */}
      {activeTab === 'import' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Fixture Loader, File Upload, Column Mapping & Manual Entry */}
          <div className="lg:col-span-5 space-y-5">
            {/* Sample Fixtures */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">
                  Built-In Topographic Survey Fixtures
                </h3>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200">
                  {SAMPLE_TERRAIN_FIXTURES.length} Verified Datasets
                </span>
              </div>
              <p className="text-xs text-slate-600">
                Load a sample CSV spot-elevation survey or GeoJSON topographic dataset to inspect parsing, anomaly detection, and TIN surface generation.
              </p>
              <div className="space-y-2">
                {SAMPLE_TERRAIN_FIXTURES.map((fix) => (
                  <button
                    key={fix.id}
                    onClick={() => handleSelectFixture(fix.id)}
                    className={`w-full text-left p-3 rounded-lg border transition-all cursor-pointer ${
                      selectedFixtureId === fix.id && fileName === fix.fileName
                        ? 'bg-teal-50/70 border-teal-300 text-teal-950'
                        : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold">{fix.label}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-600 shrink-0">
                        {fix.fileName}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* File Upload */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3">
              <h3 className="text-sm font-bold text-slate-900">Upload Terrain / Survey File</h3>
              <p className="text-xs text-slate-600">
                Supported formats: <strong>CSV / TXT / XYZ</strong> elevation point tables (`.csv`, `.txt`, `.xyz`) and <strong>GeoJSON</strong> 3D Points or contour LineStrings (`.geojson`, `.json`).
              </p>
              <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-300 hover:border-teal-500 rounded-xl bg-slate-50 hover:bg-teal-50/30 transition-colors cursor-pointer">
                <Upload className="w-5 h-5 text-teal-700 mb-1.5" />
                <span className="text-xs font-semibold text-slate-800">
                  Choose CSV / XYZ / GeoJSON file
                </span>
                <span className="text-[11px] text-slate-500 mt-0.5">
                  Active file: <strong className="font-mono">{fileName}</strong>
                </span>
                <input
                  type="file"
                  accept=".csv,.txt,.xyz,.geojson,.json,.tif,.tiff,.xml,.asc,.dxf"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            {/* CSV Column Mapping Controls */}
            {parsedDataset.detectedFormat === 'CSV-ELEVATION-POINTS' && (
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900">CSV Column Mapping</h3>
                  <span className="text-[10px] font-mono text-slate-500">
                    Headers: {parsedDataset.detectedCsvHeaders.join(', ') || 'auto'}
                  </span>
                </div>
                <p className="text-xs text-slate-600">
                  Explicitly map which column represents X (Easting / Lon), Y (Northing / Lat), and Z (Elevation).
                </p>
                <div className="grid grid-cols-3 gap-2.5 text-xs">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      X / Easting Col
                    </label>
                    <input
                      type="text"
                      value={csvMapping.xColumn ?? parsedDataset.appliedCsvMapping?.xColumn ?? ''}
                      onChange={(e) =>
                        setCsvMapping((prev) => ({ ...prev, xColumn: e.target.value.trim() }))
                      }
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Y / Northing Col
                    </label>
                    <input
                      type="text"
                      value={csvMapping.yColumn ?? parsedDataset.appliedCsvMapping?.yColumn ?? ''}
                      onChange={(e) =>
                        setCsvMapping((prev) => ({ ...prev, yColumn: e.target.value.trim() }))
                      }
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Z / Elevation Col
                    </label>
                    <input
                      type="text"
                      value={csvMapping.zColumn ?? parsedDataset.appliedCsvMapping?.zColumn ?? ''}
                      onChange={(e) =>
                        setCsvMapping((prev) => ({ ...prev, zColumn: e.target.value.trim() }))
                      }
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-xs"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Manual Spot Elevation Entry */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3">
              <h3 className="text-sm font-bold text-slate-900">Add Manual Spot Elevation Point</h3>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">
                    X ({unitLabel})
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={manualX}
                    onChange={(e) => setManualX(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">
                    Y ({unitLabel})
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={manualY}
                    onChange={(e) => setManualY(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">
                    Z Elevation ({unitLabel})
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={manualZ}
                    onChange={(e) => setManualZ(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={manualDesc}
                  onChange={(e) => setManualDesc(e.target.value)}
                  placeholder="Point classification..."
                  className="flex-1 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
                <button
                  onClick={handleAddManualPoint}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-teal-400" />
                  <span>Add Point</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Source Inspection Summary & Point Table */}
          <div className="lg:col-span-7 space-y-5">
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Source Terrain Inspection Report
                  </h3>
                  <p className="text-xs text-slate-500">
                    File: <span className="font-mono font-semibold text-slate-700">{parsedDataset.fileName}</span> ({parsedDataset.fileSizeBytes.toLocaleString()} bytes)
                  </p>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
                    parsedDataset.isValid
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border-rose-200'
                  }`}
                >
                  {parsedDataset.detectedFormat}
                </span>
              </div>

              {/* Key Source Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase block">
                    Valid Elevation Pts
                  </span>
                  <span className="text-base font-bold text-slate-900 tabular-nums">
                    {parsedDataset.sourcePoints.length}
                  </span>
                  <span className="text-[11px] text-slate-500 block">
                    {parsedDataset.skippedRecordCount} skipped
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase block">
                    Source Z Range
                  </span>
                  <span className="text-base font-bold text-slate-900 tabular-nums">
                    {parsedDataset.rawExtents
                      ? `${parsedDataset.rawExtents.minZ.toFixed(2)} – ${parsedDataset.rawExtents.maxZ.toFixed(2)}`
                      : 'N/A'}
                  </span>
                  <span className="text-[11px] text-teal-700 font-semibold block">
                    Relief: {parsedDataset.rawExtents ? parsedDataset.rawExtents.relief.toFixed(2) : '0.00'}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase block">
                    Detected CRS
                  </span>
                  <span className="text-xs font-bold text-slate-900 truncate block mt-0.5">
                    {parsedDataset.detectedHorizontalCRS}
                  </span>
                  <span className="text-[11px] text-slate-500 block">
                    Units: {parsedDataset.detectedHorizontalUnit}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase block">
                    Quality Flags
                  </span>
                  <span className="text-base font-bold text-slate-900 tabular-nums">
                    {parsedDataset.duplicatePointIds.length + parsedDataset.outlierPointIds.length}
                  </span>
                  <span className="text-[11px] text-slate-500 block">
                    {parsedDataset.duplicatePointIds.length} dup · {parsedDataset.outlierPointIds.length} outlier
                  </span>
                </div>
              </div>

              {/* Errors & Warnings */}
              {(parsedDataset.errors.length > 0 || parsedDataset.warnings.length > 0) && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Inspection Diagnostics ({parsedDataset.errors.length + parsedDataset.warnings.length})
                  </h4>
                  <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                    {parsedDataset.errors.map((err) => (
                      <div
                        key={err.id}
                        className="p-3 rounded-lg border text-xs flex items-start gap-2.5 bg-rose-50 border-rose-200 text-rose-950"
                      >
                        <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                        <div className="font-bold">
                          [{err.code}] {err.message}
                        </div>
                      </div>
                    ))}
                    {parsedDataset.warnings.map((warn) => (
                      <div
                        key={warn.id}
                        className="p-3 rounded-lg border text-xs flex items-start gap-2.5 bg-amber-50 border-amber-200 text-amber-950"
                      >
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <div className="space-y-0.5">
                          <div className="font-bold">
                            [{warn.code}] {warn.message}
                          </div>
                          {warn.remedy && (
                            <div className="text-[11px] opacity-90">Remedy: {warn.remedy}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Source Points Preview Table */}
              {parsedDataset.sourcePoints.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Source Elevation Points ({parsedDataset.sourcePoints.length})
                    </h4>
                    <button
                      onClick={() => setActiveTab('calibrate')}
                      className="text-xs font-semibold text-teal-700 hover:text-teal-900 cursor-pointer"
                    >
                      Proceed to Step 2: Calibrate CRS, Units & Filter Outliers →
                    </button>
                  </div>
                  <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-lg">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-100 text-slate-600 sticky top-0">
                        <tr>
                          <th className="py-2 px-2.5 font-semibold">Point ID</th>
                          <th className="py-2 px-2.5 font-semibold">Raw X</th>
                          <th className="py-2 px-2.5 font-semibold">Raw Y</th>
                          <th className="py-2 px-2.5 font-semibold">Raw Z (Elev)</th>
                          <th className="py-2 px-2.5 font-semibold">Quality Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {parsedDataset.sourcePoints.map((pt) => {
                          const isExcluded = calibration.excludedPointIds.includes(pt.id);
                          const isDup = parsedDataset.duplicatePointIds.includes(pt.id);
                          const isOutlier = parsedDataset.outlierPointIds.includes(pt.id);
                          return (
                            <tr
                              key={pt.id}
                              className={
                                isExcluded
                                  ? 'bg-slate-100 text-slate-400 line-through'
                                  : isDup || isOutlier
                                  ? 'bg-amber-50/70'
                                  : 'hover:bg-slate-50'
                              }
                            >
                              <td className="py-1.5 px-2.5 font-mono font-semibold">{pt.id}</td>
                              <td className="py-1.5 px-2.5 font-mono tabular-nums">{pt.rawX}</td>
                              <td className="py-1.5 px-2.5 font-mono tabular-nums">{pt.rawY}</td>
                              <td className="py-1.5 px-2.5 font-mono font-bold tabular-nums">
                                {pt.rawZ}
                              </td>
                              <td className="py-1.5 px-2.5">
                                {isOutlier ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                    Outlier Z Spike
                                  </span>
                                ) : isDup ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                    Duplicate XY
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-emerald-700 font-medium">
                                    Normal ({pt.classification})
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: CALIBRATE CRS, UNITS, DATUM & POINT FILTER */}
      {activeTab === 'calibrate' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6 space-y-5">
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
              <h3 className="text-base font-bold text-slate-900">
                Coordinate System, Units & Vertical Datum Calibration
              </h3>
              <p className="text-xs text-slate-600">
                Plotify never silently guesses coordinate systems, units, or vertical datums. Confirm how source coordinates map to your project parcel ({project.plotWidth}×{project.plotLength} {unitLabel}).
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Source Horizontal CRS
                  </label>
                  <select
                    value={calibration.horizontalCRS}
                    onChange={(e) =>
                      setCalibration((prev) => ({
                        ...prev,
                        horizontalCRS: e.target.value as TerrainAlignmentAndCalibration['horizontalCRS'],
                      }))
                    }
                    className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  >
                    <option value="PROJECT_LOCAL">PROJECT_LOCAL (Local Site Grid X/Y)</option>
                    <option value="PROJECTED_CARTESIAN">PROJECTED_CARTESIAN (Easting / Northing Planar)</option>
                    <option value="WGS84_GEOGRAPHIC_LON_LAT">
                      WGS84_GEOGRAPHIC_LON_LAT (GPS Degrees Lon/Lat → Projected)
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Vertical Elevation Datum
                  </label>
                  <select
                    value={calibration.verticalDatum}
                    onChange={(e) =>
                      setCalibration((prev) => ({
                        ...prev,
                        verticalDatum: e.target.value as TerrainAlignmentAndCalibration['verticalDatum'],
                      }))
                    }
                    className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  >
                    <option value="LOCAL_SURVEY_BENCHMARK">
                      LOCAL_SURVEY_BENCHMARK (Relative Site Benchmark)
                    </option>
                    <option value="PROJECT_BENCHMARK_ZERO">
                      PROJECT_BENCHMARK_ZERO (Project Floor Zero Datum)
                    </option>
                    <option value="ORTHOMETRIC_SEA_LEVEL">
                      ORTHOMETRIC_SEA_LEVEL (Mean Sea Level / NAVD88 / ODN)
                    </option>
                    <option value="WGS84_ELLIPSOIDAL_HEIGHT">
                      WGS84_ELLIPSOIDAL_HEIGHT (GPS Ellipsoidal Height)
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Source Horizontal Unit (X/Y)
                  </label>
                  <select
                    value={calibration.horizontalUnit}
                    onChange={(e) =>
                      setCalibration((prev) => ({
                        ...prev,
                        horizontalUnit: e.target.value as TerrainAlignmentAndCalibration['horizontalUnit'],
                      }))
                    }
                    disabled={calibration.horizontalCRS === 'WGS84_GEOGRAPHIC_LON_LAT'}
                    className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs disabled:opacity-60"
                  >
                    <option value="METRE">Metres (m)</option>
                    <option value="FOOT">Feet (ft)</option>
                    <option value="MILLIMETRE">Millimetres (mm)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Source Elevation Unit (Z)
                  </label>
                  <select
                    value={calibration.verticalUnit}
                    onChange={(e) =>
                      setCalibration((prev) => ({
                        ...prev,
                        verticalUnit: e.target.value as TerrainAlignmentAndCalibration['verticalUnit'],
                      }))
                    }
                    className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  >
                    <option value="METRE">Metres (m)</option>
                    <option value="FOOT">Feet (ft)</option>
                    <option value="MILLIMETRE">Millimetres (mm)</option>
                  </select>
                </div>
              </div>

              {/* Site Alignment & TIN Parameters */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100 text-xs">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Site Alignment Mode
                  </label>
                  <select
                    value={calibration.alignmentMode}
                    onChange={(e) =>
                      setCalibration((prev) => ({
                        ...prev,
                        alignmentMode: e.target.value as TerrainAlignmentAndCalibration['alignmentMode'],
                      }))
                    }
                    className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  >
                    <option value="preserve-local">Preserve Local Coordinates (0..Plot)</option>
                    <option value="align-min-extents-to-plot-origin">Align Min Extents to (0,0)</option>
                    <option value="manual-origin-offset">Manual Origin Offset (X0, Y0)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Contour Interval ({unitLabel})
                  </label>
                  <input
                    type="number"
                    step="0.25"
                    min="0.1"
                    value={calibration.contourInterval}
                    onChange={(e) =>
                      setCalibration((prev) => ({
                        ...prev,
                        contourInterval: Math.max(0.1, Number(e.target.value) || 0.5),
                      }))
                    }
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Max TIN Edge Length ({unitLabel})
                  </label>
                  <input
                    type="number"
                    step="5"
                    min="2"
                    value={calibration.maxTriangleEdgeLength}
                    onChange={(e) =>
                      setCalibration((prev) => ({
                        ...prev,
                        maxTriangleEdgeLength: Math.max(2, Number(e.target.value) || 35),
                      }))
                    }
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-xs"
                  />
                </div>
              </div>

              {/* Mandatory Confirmation Checkboxes */}
              <div className="p-3.5 rounded-xl bg-teal-50/70 border border-teal-200 space-y-2.5">
                <label className="flex items-start gap-2.5 text-xs text-teal-950 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={calibration.userConfirmedUnitsAndCRS}
                    onChange={(e) =>
                      setCalibration((prev) => ({
                        ...prev,
                        userConfirmedUnitsAndCRS: e.target.checked,
                      }))
                    }
                    className="mt-0.5 rounded border-teal-300 text-teal-700"
                  />
                  <span>
                    <strong>Confirm Horizontal CRS & Linear Units:</strong> I verify that source X/Y coordinates use{' '}
                    <code className="font-mono font-bold">{calibration.horizontalCRS}</code> and{' '}
                    <code className="font-mono font-bold">{calibration.horizontalUnit}</code>, and elevation Z uses{' '}
                    <code className="font-mono font-bold">{calibration.verticalUnit}</code>.
                  </span>
                </label>

                <label className="flex items-start gap-2.5 text-xs text-teal-950 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={calibration.userConfirmedVerticalDatum}
                    onChange={(e) =>
                      setCalibration((prev) => ({
                        ...prev,
                        userConfirmedVerticalDatum: e.target.checked,
                      }))
                    }
                    className="mt-0.5 rounded border-teal-300 text-teal-700"
                  />
                  <span>
                    <strong>Confirm Vertical Elevation Datum:</strong> I verify that Z elevations are referenced to{' '}
                    <code className="font-mono font-bold">{calibration.verticalDatum}</code> (offset:{' '}
                    {calibration.verticalOffsetInTargetUnit} {unitLabel}).
                  </span>
                </label>
              </div>
            </div>
          </div>

          {/* Right Column: Point Filter & Anomaly Exclusion Inspector */}
          <div className="lg:col-span-6 space-y-5">
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Point Quality & Outlier Filter
                  </h3>
                  <p className="text-xs text-slate-500">
                    Exclude outlier spikes or duplicate points before generating the Delaunay TIN surface.
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab('visualize')}
                  className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Open 2D Contour & TIN View →
                </button>
              </div>

              <div className="max-h-96 overflow-y-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-100 text-slate-600 sticky top-0">
                    <tr>
                      <th className="py-2 px-2.5 font-semibold">Include</th>
                      <th className="py-2 px-2.5 font-semibold">ID</th>
                      <th className="py-2 px-2.5 font-semibold">Raw (X, Y)</th>
                      <th className="py-2 px-2.5 font-semibold">Raw Z</th>
                      <th className="py-2 px-2.5 font-semibold">Anomaly / Classification</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedDataset.sourcePoints.map((pt) => {
                      const isExcluded = calibration.excludedPointIds.includes(pt.id);
                      const isOutlier = parsedDataset.outlierPointIds.includes(pt.id);
                      const isDup = parsedDataset.duplicatePointIds.includes(pt.id);
                      return (
                        <tr
                          key={pt.id}
                          className={
                            isExcluded
                              ? 'bg-slate-100 text-slate-400'
                              : isOutlier || isDup
                              ? 'bg-amber-50/80'
                              : 'hover:bg-slate-50'
                          }
                        >
                          <td className="py-1.5 px-2.5">
                            <input
                              type="checkbox"
                              checked={!isExcluded}
                              onChange={() => handleToggleExcludePoint(pt.id)}
                              className="rounded border-slate-300 text-teal-700 cursor-pointer"
                            />
                          </td>
                          <td className="py-1.5 px-2.5 font-mono font-semibold">{pt.id}</td>
                          <td className="py-1.5 px-2.5 font-mono tabular-nums">
                            ({pt.rawX}, {pt.rawY})
                          </td>
                          <td className="py-1.5 px-2.5 font-mono font-bold tabular-nums">
                            {pt.rawZ}
                          </td>
                          <td className="py-1.5 px-2.5">
                            {isOutlier ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                Statistical Z Outlier Spike
                              </span>
                            ) : isDup ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                Duplicate XY Coordinate
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-500">
                                {pt.classification}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STEP 3: 2D TOPOGRAPHIC CONTOUR/TIN MAP, SECTIONS & APPLY */}
      {activeTab === 'visualize' && modelingResult && (
        <div className="space-y-6">
          {/* Blocking Errors Banner if any */}
          {modelingResult.errors.length > 0 && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-rose-900 font-bold text-xs">
                <XCircle className="w-4 h-4 text-rose-600" />
                <span>
                  Surface Generation / Application Blocked ({modelingResult.errors.length})
                </span>
              </div>
              {modelingResult.errors.map((b) => (
                <div key={b.id} className="text-xs text-rose-800 pl-6">
                  • <strong>[{b.code}]</strong> {b.message}
                </div>
              ))}
            </div>
          )}

          {/* Topographic Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 text-xs">
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[10px] font-semibold text-slate-400 uppercase block">
                Elevation Range
              </span>
              <span className="text-sm font-bold text-slate-900 tabular-nums mt-0.5 block">
                {modelingResult.analysis.minElevation.toFixed(2)} –{' '}
                {modelingResult.analysis.maxElevation.toFixed(2)} {unitLabel}
              </span>
              <span className="text-[11px] text-teal-700 font-semibold">
                Mean: {modelingResult.analysis.meanElevation.toFixed(2)} {unitLabel}
              </span>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[10px] font-semibold text-slate-400 uppercase block">
                Total Site Relief
              </span>
              <span className="text-base font-bold text-slate-900 tabular-nums mt-0.5 block">
                {modelingResult.analysis.elevationRelief.toFixed(2)} {unitLabel}
              </span>
              <span className="text-[11px] text-slate-500">
                Aspect: {modelingResult.analysis.dominantAspectCardinal}
              </span>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[10px] font-semibold text-slate-400 uppercase block">
                Mean / Max Slope
              </span>
              <span className="text-sm font-bold text-slate-900 tabular-nums mt-0.5 block">
                {modelingResult.analysis.meanSlopePercent.toFixed(1)}% /{' '}
                {modelingResult.analysis.maxSlopePercent.toFixed(1)}%
              </span>
              <span className="text-[11px] text-slate-500">
                {modelingResult.analysis.meanSlopeDegrees.toFixed(1)}° mean grade
              </span>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[10px] font-semibold text-slate-400 uppercase block">
                TIN Mesh & Contours
              </span>
              <span className="text-sm font-bold text-slate-900 tabular-nums mt-0.5 block">
                {modelingResult.surfaceMesh?.triangles.length || 0} Triangles
              </span>
              <span className="text-[11px] text-teal-700 font-semibold">
                {modelingResult.surfaceMesh?.derivedContours.length || 0} Contour segs
              </span>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[10px] font-semibold text-slate-400 uppercase block">
                Building Pad Relief
              </span>
              <span className="text-sm font-bold text-slate-900 tabular-nums mt-0.5 block">
                {modelingResult.analysis.buildingFootprintRelief.footprintLevelDifference !== null
                  ? `${modelingResult.analysis.buildingFootprintRelief.footprintLevelDifference.toFixed(2)} ${unitLabel}`
                  : 'No rooms covered'}
              </span>
              <span className="text-[11px] text-slate-500">
                {modelingResult.analysis.buildingFootprintRelief.coveredCornersCount}/
                {modelingResult.analysis.buildingFootprintRelief.totalCornersChecked} corners on TIN
              </span>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[10px] font-semibold text-slate-400 uppercase block">
                Plot TIN Coverage
              </span>
              <span className="text-base font-bold text-slate-900 tabular-nums mt-0.5 block">
                {modelingResult.analysis.plotCoveragePercent}%
              </span>
              <span className="text-[11px] text-slate-500">
                {modelingResult.analysis.surfaceGenerated ? 'Delaunay TIN' : 'Points Only'}
              </span>
            </div>
          </div>

          {/* Main Visualization Grid: 2D Interactive Topographic Map + Controls & Section Profiles */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left 7 cols: 2D Topographic SVG Canvas */}
            <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    2D Topographic Site Plan, TIN Mesh & Building Footprint Overlay
                  </h3>
                  <p className="text-xs text-slate-500">
                    Click anywhere on the site plan to query exact planar-interpolated TIN elevation.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <label className="inline-flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showContoursIn2D}
                      onChange={(e) => setShowContoursIn2D(e.target.checked)}
                      className="rounded border-slate-300 text-teal-700"
                    />
                    <span>Contours</span>
                  </label>
                  <label className="inline-flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showTINWireframe}
                      onChange={(e) => setShowTINWireframe(e.target.checked)}
                      className="rounded border-slate-300 text-teal-700"
                    />
                    <span>TIN Mesh</span>
                  </label>
                  <label className="inline-flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showElevationPoints}
                      onChange={(e) => setShowElevationPoints(e.target.checked)}
                      className="rounded border-slate-300 text-teal-700"
                    />
                    <span>Survey Points</span>
                  </label>
                </div>
              </div>

              {/* Interactive SVG Canvas */}
              {(() => {
                const mesh = modelingResult.surfaceMesh;
                const pw = project.plotWidth;
                const pl = project.plotLength;
                const minX = Math.min(0, mesh?.bounds.minX ?? 0) - pw * 0.08;
                const maxX = Math.max(pw, mesh?.bounds.maxX ?? pw) + pw * 0.08;
                const minY = Math.min(0, mesh?.bounds.minY ?? 0) - pl * 0.08;
                const maxY = Math.max(pl, mesh?.bounds.maxY ?? pl) + pl * 0.08;
                const viewW = Math.max(10, maxX - minX);
                const viewH = Math.max(10, maxY - minY);

                const groundRooms = (project.floorPlan?.rooms || []).filter(
                  (r) => r.floorLevel === 1
                );

                const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const relX = (e.clientX - rect.left) / rect.width;
                  const relY = (e.clientY - rect.top) / rect.height;
                  const siteX = Number((minX + relX * viewW).toFixed(2));
                  const siteY = Number((minY + relY * viewH).toFixed(2));
                  setQueryPoint({ x: siteX, y: siteY });
                };

                return (
                  <div className="space-y-3">
                    <div className="bg-slate-950 rounded-xl p-3 border border-slate-800 overflow-hidden">
                      <svg
                        viewBox={`${minX} ${minY} ${viewW} ${viewH}`}
                        className="w-full h-96 cursor-crosshair select-none"
                        onClick={handleSvgClick}
                      >
                        {/* Plot Parcel Boundary */}
                        <rect
                          x={0}
                          y={0}
                          width={pw}
                          height={pl}
                          fill="rgba(20, 184, 166, 0.06)"
                          stroke="#14b8a6"
                          strokeWidth={viewW * 0.004}
                          strokeDasharray={`${viewW * 0.012} ${viewW * 0.008}`}
                        />

                        {/* Ground-Floor Building Rooms Footprint */}
                        {groundRooms.map((room) => (
                          <g key={room.id}>
                            <rect
                              x={room.x}
                              y={room.y}
                              width={room.width}
                              height={room.length}
                              fill="rgba(56, 189, 248, 0.18)"
                              stroke="#38bdf8"
                              strokeWidth={viewW * 0.003}
                            />
                            <text
                              x={room.x + room.width / 2}
                              y={room.y + room.length / 2}
                              fill="#e0f2fe"
                              fontSize={viewW * 0.022}
                              textAnchor="middle"
                              dominantBaseline="middle"
                            >
                              {room.name}
                            </text>
                          </g>
                        ))}

                        {/* Delaunay TIN Triangles */}
                        {showTINWireframe &&
                          mesh &&
                          mesh.triangles.map((tri) => {
                            const p0 = mesh.vertices[tri.v0Index];
                            const p1 = mesh.vertices[tri.v1Index];
                            const p2 = mesh.vertices[tri.v2Index];
                            if (!p0 || !p1 || !p2) return null;
                            return (
                              <polygon
                                key={tri.id}
                                points={`${p0.x},${p0.y} ${p1.x},${p1.y} ${p2.x},${p2.y}`}
                                fill="rgba(16, 185, 129, 0.05)"
                                stroke="rgba(148, 163, 184, 0.28)"
                                strokeWidth={viewW * 0.0018}
                              />
                            );
                          })}

                        {/* Derived Contour Lines */}
                        {showContoursIn2D &&
                          mesh &&
                          mesh.derivedContours.map((seg, idx) => (
                            <line
                              key={`contour-${idx}`}
                              x1={seg.x1}
                              y1={seg.y1}
                              x2={seg.x2}
                              y2={seg.y2}
                              stroke={seg.isMajor ? '#34d399' : '#0d9488'}
                              strokeWidth={seg.isMajor ? viewW * 0.0045 : viewW * 0.0022}
                              opacity={seg.isMajor ? 0.95 : 0.75}
                            />
                          ))}

                        {/* Surveyed Spot Elevation Points */}
                        {showElevationPoints &&
                          modelingResult.calibratedPoints.map((pt) => (
                            <g key={pt.id}>
                              <circle
                                cx={pt.x}
                                cy={pt.y}
                                r={pt.isExcluded ? viewW * 0.006 : viewW * 0.009}
                                fill={pt.isExcluded ? '#64748b' : '#2dd4bf'}
                                stroke="#0f172a"
                                strokeWidth={viewW * 0.002}
                              />
                              {!pt.isExcluded && (
                                <text
                                  x={pt.x + viewW * 0.012}
                                  y={pt.y - viewW * 0.008}
                                  fill="#cbd5e1"
                                  fontSize={viewW * 0.02}
                                  fontFamily="monospace"
                                >
                                  {pt.z.toFixed(1)}
                                </text>
                              )}
                            </g>
                          ))}

                        {/* Interactive Clicked Query Marker */}
                        {queryPoint && (
                          <g>
                            <circle
                              cx={queryPoint.x}
                              cy={queryPoint.y}
                              r={viewW * 0.013}
                              fill="none"
                              stroke="#f43f5e"
                              strokeWidth={viewW * 0.004}
                            />
                            <circle
                              cx={queryPoint.x}
                              cy={queryPoint.y}
                              r={viewW * 0.005}
                              fill="#f43f5e"
                            />
                          </g>
                        )}
                      </svg>
                    </div>

                    {/* Interactive Point Query Result Bar */}
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-rose-600" />
                        {queryPoint ? (
                          <span>
                            Queried Site Coordinate:{' '}
                            <strong className="font-mono">
                              X = {queryPoint.x} {unitLabel}, Y = {queryPoint.y} {unitLabel}
                            </strong>
                          </span>
                        ) : (
                          <span className="text-slate-500">
                            Click anywhere inside the topographic map above to inspect TIN elevation at that coordinate.
                          </span>
                        )}
                      </div>
                      {queryPoint && (
                        <div>
                          {queriedElevation !== null ? (
                            <span className="px-2.5 py-1 rounded bg-emerald-100 text-emerald-950 font-mono font-bold">
                              Interpolated Z = {queriedElevation.toFixed(3)} {unitLabel}
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded bg-amber-100 text-amber-950 font-semibold">
                              Outside TIN Hull / Gap — No Fabricated Elevation
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Right 5 cols: Section Profile Charts & Safe Project Apply/Remove */}
            <div className="lg:col-span-5 space-y-5">
              {/* Section Profiles */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-teal-700" />
                  <h3 className="text-sm font-bold text-slate-900">
                    Topographic Cross-Section Profiles
                  </h3>
                </div>
                <p className="text-xs text-slate-500">
                  Ground elevation profile sliced across the Delaunay TIN along the plot centerlines vs. mean site ground datum ({modelingResult.analysis.meanElevation.toFixed(2)} {unitLabel}).
                </p>

                {[
                  modelingResult.analysis.primarySectionWestEast,
                  modelingResult.analysis.primarySectionNorthSouth,
                ].map((sec) => {
                  const validSamples = sec.samples.filter((s) => s.elevation !== null);
                  const minZ = modelingResult.analysis.minElevation;
                  const maxZ = modelingResult.analysis.maxElevation;
                  const zSpan = Math.max(1, maxZ - minZ);
                  const meanZ = modelingResult.analysis.meanElevation;
                  const datumY = 75 - ((meanZ - minZ) / zSpan) * 55;

                  const polylinePts = sec.samples
                    .filter((s) => s.elevation !== null)
                    .map((s) => {
                      const px = (s.distanceAlongSection / Math.max(1, sec.totalLength)) * 280 + 10;
                      const py = 75 - (((s.elevation as number) - minZ) / zSpan) * 55;
                      return `${px.toFixed(1)},${py.toFixed(1)}`;
                    })
                    .join(' ');

                  return (
                    <div
                      key={sec.label}
                      className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-800">{sec.label}</span>
                        <span className="font-mono text-[11px] text-slate-500">
                          Length: {sec.totalLength} {unitLabel}
                        </span>
                      </div>
                      {validSamples.length >= 2 ? (
                        <svg viewBox="0 0 300 90" className="w-full h-24 bg-slate-900 rounded-md">
                          {/* Mean building datum reference line */}
                          <line
                            x1={10}
                            y1={datumY}
                            x2={290}
                            y2={datumY}
                            stroke="#38bdf8"
                            strokeWidth="1"
                            strokeDasharray="4 3"
                          />
                          {/* Terrain Ground Profile Line */}
                          <polyline
                            fill="none"
                            stroke="#34d399"
                            strokeWidth="2.5"
                            points={polylinePts}
                          />
                        </svg>
                      ) : (
                        <div className="text-[11px] text-amber-800 bg-amber-50 p-2 rounded">
                          Insufficient TIN intersection along this section line.
                        </div>
                      )}
                      <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                        <span>Min Z: {minZ.toFixed(2)} {unitLabel}</span>
                        <span className="text-sky-600">--- Mean Datum ({meanZ.toFixed(2)} {unitLabel})</span>
                        <span>Max Z: {maxZ.toFixed(2)} {unitLabel}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Safe Apply / Replace / Remove Controls */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
                <h3 className="text-sm font-bold text-slate-900">
                  Save & Synchronize Terrain with Project
                </h3>
                <p className="text-xs text-slate-600">
                  Applying the terrain model creates an automatic rollback checkpoint first, stores the calibrated TIN surface & provenance on the project, and enables 3D terrain rendering without altering any room, structural, IFC, or CAD data.
                </p>

                <div className="space-y-2 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showSurfaceIn3D}
                      onChange={(e) => setShowSurfaceIn3D(e.target.checked)}
                      className="rounded border-slate-300 text-teal-700"
                    />
                    <span>Render Delaunay TIN surface & contours in 3D Building Viewer</span>
                  </label>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs font-medium text-slate-700">
                      3D Display Vertical Exaggeration:
                    </span>
                    <select
                      value={verticalExaggerationDisplayOnly}
                      onChange={(e) => setVerticalExaggerationDisplayOnly(Number(e.target.value))}
                      className="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-mono"
                    >
                      <option value={1}>1.0× (True 1:1 Scale)</option>
                      <option value={1.5}>1.5× (Subtle Relief Emphasis — Display Only)</option>
                      <option value={2}>2.0× (Visual Study Exaggeration — Display Only)</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-2">
                  <button
                    onClick={handleApplyToProject}
                    disabled={!modelingResult.success}
                    className="flex-1 py-2.5 px-4 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:cursor-not-allowed"
                  >
                    <CheckCircle2 className="w-4 h-4 text-teal-400" />
                    <span>
                      {project.terrainModeling?.surfaceMesh
                        ? 'Replace Project Terrain Model (Safe Checkpoint)'
                        : 'Apply Terrain Model to Project'}
                    </span>
                  </button>

                  {project.terrainModeling && (
                    <button
                      onClick={handleRemoveFromProject}
                      className="py-2.5 px-3.5 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                      <span>Remove Terrain</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STEP 4: SUPPORT MATRIX & PROVENANCE */}
      {activeTab === 'matrix' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              P43 Terrain & Topographic Format Support Matrix
            </h3>
            <p className="text-xs text-slate-600">
              Plotify documents exactly which topographic formats and surface generation methods are implemented and verified vs. unsupported formats.
            </p>
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-100 text-slate-700">
                  <tr>
                    <th className="py-2.5 px-3 font-semibold">Format</th>
                    <th className="py-2.5 px-3 font-semibold">Status</th>
                    <th className="py-2.5 px-3 font-semibold">Capabilities & Conversion Guidance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {supportProfile.supportedFormats.map((fmt) => (
                    <tr key={fmt.format} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                        {fmt.format}
                        <span className="block text-[10px] text-slate-400 font-normal">
                          {fmt.extensions.join(', ')}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border bg-emerald-50 text-emerald-800 border-emerald-200">
                          SUPPORTED
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 leading-relaxed">
                        {fmt.description}
                      </td>
                    </tr>
                  ))}
                  {supportProfile.recognizedButUnsupportedFormats.map((fmt) => (
                    <tr key={fmt.format} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                        {fmt.format}
                        <span className="block text-[10px] text-slate-400 font-normal">
                          {fmt.detectionMethod}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border bg-rose-50 text-rose-800 border-rose-200">
                          UNSUPPORTED
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 leading-relaxed">
                        {fmt.guidance}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              Active Project Terrain Provenance Ledger
            </h3>
            {project.terrainModeling ? (
              <div className="space-y-3 text-xs">
                <div className="p-3 rounded-lg bg-teal-50 border border-teal-200 text-teal-950">
                  <div className="font-bold">
                    Active Source: {project.terrainModeling.sourceFileName}
                  </div>
                  <div className="text-[11px] mt-0.5">
                    Format: {project.terrainModeling.sourceFormat} · Applied{' '}
                    {new Date(project.terrainModeling.appliedAt).toLocaleString()}
                  </div>
                  <div className="text-[11px] mt-1 font-mono">
                    Transform: {project.terrainModeling.appliedTransformSummary.crsTransformationUsed}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                  <div className="font-bold text-slate-800">Calibration & Datum Record</div>
                  <div className="text-[11px] text-slate-600">
                    CRS: {project.terrainModeling.calibration.horizontalCRS} · Units:{' '}
                    {project.terrainModeling.calibration.horizontalUnit}/
                    {project.terrainModeling.calibration.verticalUnit}
                  </div>
                  <div className="text-[11px] text-slate-600">
                    Vertical Datum: {project.terrainModeling.calibration.verticalDatum}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Valid Points Used: {project.terrainModeling.analysis.validPointCount} (
                    {project.terrainModeling.analysis.excludedPointCount} excluded)
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                No terrain model is currently saved on this project. Import a dataset and click "Apply Terrain Model to Project" in Step 3 to record provenance.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
