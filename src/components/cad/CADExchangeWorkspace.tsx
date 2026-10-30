import React, { useState, useMemo } from 'react';
import {
  ArrowLeft,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Download,
  RefreshCw,
  Layers,
  PenTool,
  Box,
  ShieldCheck,
  Info,
  Play,
  FileCode2,
  Eye,
  Sliders,
  CheckSquare,
  Square,
} from 'lucide-react';
import { Project, MeasurementUnit, Currency, ProjectType } from '../../types/project';
import {
  CADDrawingModel,
  CADLayerMappingRule,
  CADCalibrationOptions,
  CADLayerTargetRole,
  CADExportOptions,
  CADExportReport,
  CADRoundTripComparison,
  CADLengthUnit,
} from '../../types/cad';
import {
  getSupportedCADProfile,
  parseDXFToDrawingModel,
  buildDefaultLayerMappingRules,
  mapCADDrawingToPlotify,
  buildNewProjectFromCADMapping,
  applyCADMappingToExistingProject,
  exportProjectToDXF,
  compareCADRoundTrip,
  SAMPLE_CAD_FIXTURES,
} from '../../services/cadService';

interface CADExchangeWorkspaceProps {
  project: Project | null;
  defaultUnit: MeasurementUnit;
  defaultCurrency: Currency;
  onBack: () => void;
  onCreateImportedProject: (data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void> | void;
  onUpdateProject: (updated: Project) => Promise<void> | void;
  onOpenFloorPlan?: (project: Project) => void;
  onOpen3DViewer?: (project: Project) => void;
  onOpenStructural?: (project: Project) => void;
  onOpenIFC?: (project?: Project) => void;
  onShowToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

type WorkspaceTab = 'import' | 'export' | 'profile';

const LAYER_ROLE_OPTIONS: { value: CADLayerTargetRole; label: string }[] = [
  { value: 'plot-boundary', label: 'Plot / Site Boundary' },
  { value: 'room-space', label: 'Room / Space Polygon' },
  { value: 'structural-column', label: 'Structural Column Marker' },
  { value: 'structural-beam', label: 'Structural Beam Line' },
  { value: 'structural-grid', label: 'Structural Grid Axis' },
  { value: 'reference-only', label: 'Reference Linework / Annotations' },
  { value: 'ignore', label: 'Ignore Layer' },
];

const SOURCE_UNIT_OPTIONS: { value: Exclude<CADLengthUnit, 'UNITLESS'>; label: string }[] = [
  { value: 'MILLIMETRE', label: 'Millimetres (mm)' },
  { value: 'CENTIMETRE', label: 'Centimetres (cm)' },
  { value: 'METRE', label: 'Metres (m)' },
  { value: 'INCH', label: 'Inches (in)' },
  { value: 'FOOT', label: 'Feet (ft)' },
];

export const CADExchangeWorkspace: React.FC<CADExchangeWorkspaceProps> = ({
  project,
  defaultUnit,
  defaultCurrency,
  onBack,
  onCreateImportedProject,
  onUpdateProject,
  onOpenFloorPlan,
  onOpen3DViewer,
  onOpenIFC,
  onShowToast,
}) => {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('import');
  const supportProfile = useMemo(() => getSupportedCADProfile(), []);

  // Import state
  const [drawingModel, setDrawingModel] = useState<CADDrawingModel | null>(null);
  const [layerRules, setLayerRules] = useState<CADLayerMappingRule[]>([]);
  const [calibration, setCalibration] = useState<CADCalibrationOptions>({
    effectiveSourceUnit: 'METRE',
    userConfirmedUnitWhenUnitless: true,
    scaleMultiplier: 1.0,
    targetPlotifyUnit: project?.unit || defaultUnit,
    omittedEntityHandles: [],
    normalizeOriginToZero: true,
  });

  // Apply configuration state
  const [applyTarget, setApplyTarget] = useState<'new' | 'existing'>(project ? 'existing' : 'new');
  const [applyMode, setApplyMode] = useState<'merge-append' | 'replace-geometry'>('merge-append');
  const [newProjectName, setNewProjectName] = useState<string>('Imported CAD Project');
  const [newProjectType, setNewProjectType] = useState<ProjectType>('house');

  // Export & Round-trip state
  const [exportOptions, setExportOptions] = useState<CADExportOptions>({
    exportUnit: 'PROJECT_UNIT',
    floorFilter: 'all',
    includePlotBoundary: true,
    includeSiteSetbacks: true,
    includeRoomPolylines: true,
    includeRoomLabels: true,
    includeStructuralGrid: true,
    includeStructuralColumnsAndBeams: true,
  });
  const [exportResult, setExportResult] = useState<{
    dxfContent: string;
    report: CADExportReport;
  } | null>(null);
  const [roundTripResult, setRoundTripResult] = useState<CADRoundTripComparison | null>(null);

  // Load a CAD file or fixture
  const handleLoadCADContent = (fileName: string, rawContent: string) => {
    const parsed = parseDXFToDrawingModel({
      fileName,
      fileSizeBytes: rawContent.length,
      rawContent,
    });
    setDrawingModel(parsed);
    const defaultRules = buildDefaultLayerMappingRules(parsed);
    setLayerRules(defaultRules);

    const isUnitless = parsed.metadata.detectedUnit === 'UNITLESS';
    const initialSourceUnit: Exclude<CADLengthUnit, 'UNITLESS'> =
      parsed.metadata.detectedUnit === 'UNITLESS'
        ? parsed.metadata.computedExtents && parsed.metadata.computedExtents.width > 500
          ? 'MILLIMETRE'
          : 'METRE'
        : parsed.metadata.detectedUnit;

    setCalibration({
      effectiveSourceUnit: initialSourceUnit,
      userConfirmedUnitWhenUnitless: !isUnitless,
      scaleMultiplier: 1.0,
      targetPlotifyUnit: project?.unit || defaultUnit,
      omittedEntityHandles: [],
      normalizeOriginToZero: true,
    });

    const cleanName = fileName.replace(/\.(dxf|dwg|ifc)$/i, '').replace(/[_-]+/g, ' ');
    setNewProjectName(`${cleanName} (CAD Import)`);

    if (parsed.isValid) {
      onShowToast?.(
        `Parsed "${fileName}" (${parsed.entities.length} CAD entities across ${parsed.layers.length} layers).`,
        'info'
      );
    } else {
      const errMsg = parsed.errors[0]?.message || `Cannot import "${fileName}".`;
      onShowToast?.(errMsg, 'error');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      handleLoadCADContent(file.name, content);
    };
    reader.readAsText(file);
  };

  // Compute live mapping result whenever drawingModel, layerRules, or calibration change
  const mappingResult = useMemo(() => {
    if (!drawingModel || !drawingModel.isValid) return null;
    return mapCADDrawingToPlotify(drawingModel, layerRules, calibration);
  }, [drawingModel, layerRules, calibration]);

  const handleUpdateLayerRule = (
    layerName: string,
    updates: Partial<CADLayerMappingRule>
  ) => {
    setLayerRules((prev) =>
      prev.map((rule) =>
        rule.layerName === layerName ? { ...rule, ...updates } : rule
      )
    );
  };

  const handleToggleOmitHandle = (handle: string) => {
    setCalibration((prev) => {
      const current = prev.omittedEntityHandles || [];
      const next = current.includes(handle)
        ? current.filter((h) => h !== handle)
        : [...current, handle];
      return {
        ...prev,
        omittedEntityHandles: next,
      };
    });
  };

  const handleApplyCADMapping = async () => {
    if (!drawingModel || !mappingResult) return;

    if (
      drawingModel.metadata.detectedUnit === 'UNITLESS' &&
      !calibration.userConfirmedUnitWhenUnitless
    ) {
      onShowToast?.(
        'Please explicitly confirm the drawing measurement unit before applying this unitless DXF file.',
        'error'
      );
      return;
    }

    if (!mappingResult.success) {
      onShowToast?.(
        mappingResult.report.errors[0]?.message || 'CAD mapping has unresolved validation errors.',
        'error'
      );
      return;
    }

    try {
      if (applyTarget === 'new' || !project) {
        const createdPayload = buildNewProjectFromCADMapping(
          mappingResult,
          project?.currency || defaultCurrency
        );
        createdPayload.name = newProjectName.trim() || createdPayload.name;
        createdPayload.projectType = newProjectType;
        await onCreateImportedProject(createdPayload);
      } else {
        const { updatedProject, safetySnapshotId } = applyCADMappingToExistingProject(
          project,
          mappingResult,
          applyMode
        );
        await onUpdateProject(updatedProject);
        onShowToast?.(
          `Applied CAD drawing to "${project.name}" (${
            applyMode === 'merge-append' ? 'merged safely' : 'replaced geometry'
          }, safety checkpoint ${safetySnapshotId.slice(0, 8)} created).`,
          'success'
        );
      }
    } catch (err: any) {
      onShowToast?.(err.message || 'Failed to apply CAD mapping.', 'error');
    }
  };

  const handleGenerateDXFExport = () => {
    if (!project) return;
    const res = exportProjectToDXF(project, exportOptions);
    setExportResult(res);
    const rt = compareCADRoundTrip(project, exportOptions);
    setRoundTripResult(rt.comparison);
    onShowToast?.(
      `Generated verified ASCII DXF for "${project.name}" (${res.report.totalEntitiesWritten} entities).`,
      res.report.validationResult.isValid ? 'success' : 'error'
    );
  };

  const handleDownloadDXF = () => {
    if (!exportResult) return;
    const blob = new Blob([exportResult.dxfContent], { type: 'application/dxf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportResult.report.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const isUnitless = drawingModel?.metadata.detectedUnit === 'UNITLESS';

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
          <span className="text-slate-300">|</span>
          <div>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-teal-700" />
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                CAD Drawing Exchange (DXF / DWG Interop)
              </h1>
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-teal-50 text-teal-800 border border-teal-200 rounded-md">
                P42 Verified Subset
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Deterministic ASCII DXF inspection, unit calibration, layer-to-room mapping, 2D preview, and round-trip CAD exchange.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onOpenIFC && (
            <button
              onClick={() => onOpenIFC(project || undefined)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors cursor-pointer"
              title="Switch to P41 OpenBIM & IFC 3D Model Exchange"
            >
              <FileCode2 className="w-3.5 h-3.5 text-teal-700" />
              <span>OpenBIM / IFC (P41)</span>
            </button>
          )}
          {project && onOpenFloorPlan && (
            <button
              onClick={() => onOpenFloorPlan(project)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              <PenTool className="w-3.5 h-3.5 text-teal-700" />
              <span>2D Plan Editor</span>
            </button>
          )}
          {project && onOpen3DViewer && (
            <button
              onClick={() => onOpen3DViewer(project)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              <Box className="w-3.5 h-3.5 text-teal-700" />
              <span>3D Viewer</span>
            </button>
          )}
        </div>
      </div>

      {/* Honest Scope Disclosure Banner */}
      <div className="bg-slate-900 text-white rounded-xl p-4 border border-slate-800 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-teal-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="text-xs font-bold text-white flex flex-wrap items-center gap-2">
                <span>Honest CAD Interoperability Scope</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-teal-500/20 text-teal-300 border border-teal-400/30">
                  ASCII DXF (R12–2018) Supported
                </span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/30">
                  Binary DWG Requires DXF Conversion
                </span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                Plotify natively parses and exports standards-compliant <strong>ASCII DXF</strong> drawings (<code className="text-teal-300">LWPOLYLINE</code>, <code className="text-teal-300">POLYLINE</code>, <code className="text-teal-300">LINE</code>, <code className="text-teal-300">CIRCLE</code>, <code className="text-teal-300">ARC</code>, <code className="text-teal-300">TEXT/MTEXT</code>, <code className="text-teal-300">INSERT</code>). Proprietary binary <strong>.DWG</strong> files are detected by header signature (<code className="text-amber-300">AC10xx</code>) and require saving as ASCII DXF in your CAD tool before import.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Mode Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
        <button
          onClick={() => setActiveTab('import')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
            activeTab === 'import'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Upload className="w-3.5 h-3.5 text-teal-400" />
          <span>1. Import, Calibrate, Map & Preview DXF</span>
        </button>

        <button
          onClick={() => setActiveTab('export')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
            activeTab === 'export'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Download className="w-3.5 h-3.5 text-teal-400" />
          <span>2. DXF Export, Validation & Round-Trip</span>
        </button>

        <button
          onClick={() => setActiveTab('profile')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
            activeTab === 'profile'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Info className="w-3.5 h-3.5 text-teal-400" />
          <span>3. Support Matrix & CAD/IFC Provenance</span>
        </button>
      </div>

      {/* TAB 1: IMPORT, INSPECT, CALIBRATE, MAP & PREVIEW */}
      {activeTab === 'import' && (
        <div className="space-y-6">
          {/* Step 1: Upload or Load Sample CAD Fixture */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Step 1 — Select ASCII DXF Drawing or Verification Fixture
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Upload a <code className="font-mono text-slate-700">.dxf</code> file (or test <code className="font-mono text-slate-700">.dwg</code> binary signature detection) or load a built-in architectural CAD test drawing.
                </p>
              </div>

              <label className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-xs cursor-pointer transition-colors self-start">
                <Upload className="w-4 h-4 text-teal-400" />
                <span>Upload CAD File (.dxf / .dwg)</span>
                <input
                  type="file"
                  accept=".dxf,.dwg,.ifc"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            {/* Built-in Verification Fixtures */}
            <div className="pt-3 border-t border-slate-100">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Built-In CAD Verification Fixtures
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {SAMPLE_CAD_FIXTURES.map((fixture) => (
                  <button
                    key={fixture.id}
                    onClick={() => handleLoadCADContent(fixture.fileName, fixture.content)}
                    className="p-3 text-left rounded-lg border border-slate-200 hover:border-teal-400 hover:bg-teal-50/40 transition-colors cursor-pointer"
                  >
                    <div className="text-xs font-bold text-slate-900">{fixture.fileName}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{fixture.label}</div>
                  </button>
                ))}

                <button
                  onClick={() =>
                    handleLoadCADContent('proprietary_plan.dwg', 'AC1032\x00\x00\x00BINARY_DWG_PAYLOAD')
                  }
                  className="p-3 text-left rounded-lg border border-rose-200 bg-rose-50/30 hover:border-rose-400 transition-colors cursor-pointer"
                >
                  <div className="text-xs font-bold text-rose-900">
                    Binary DWG Header (.dwg)
                  </div>
                  <div className="text-[11px] text-rose-700 mt-0.5">
                    Tests AC1032 binary DWG signature detection & honest DXF conversion guidance
                  </div>
                </button>
              </div>
            </div>
          </div>

          {/* Preflight Rejection / Conversion Guidance Card */}
          {drawingModel && !drawingModel.isValid && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-5 space-y-3">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-rose-950">
                    CAD Preflight Blocked: {drawingModel.metadata.fileName} (
                    {drawingModel.metadata.detectedFormat})
                  </h3>
                  {drawingModel.errors.map((err) => (
                    <p key={err.id} className="text-xs text-rose-800 leading-relaxed">
                      [{err.code}] {err.message}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Drawing Inspection & Unit Calibration */}
          {drawingModel && drawingModel.isValid && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left 5 cols: Drawing Summary & Coordinate/Unit Calibration */}
              <div className="lg:col-span-5 space-y-5">
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <Sliders className="w-4 h-4 text-teal-700" />
                      <h3 className="text-sm font-bold text-slate-900">
                        Step 2 — Unit & Coordinate Calibration
                      </h3>
                    </div>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                      {drawingModel.metadata.acadVersionLabel}
                    </span>
                  </div>

                  {/* Unitless Warning Banner */}
                  {isUnitless && (
                    <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 space-y-2">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <div className="text-xs text-amber-900">
                          <span className="font-bold block">
                            Unitless Drawing Detected ($INSUNITS = 0)
                          </span>
                          Plotify never silently guesses CAD units. Inspect the raw coordinate span below (
                          {drawingModel.metadata.computedExtents?.width.toFixed(1) || 0} ×{' '}
                          {drawingModel.metadata.computedExtents?.length.toFixed(1) || 0} raw CAD units) and confirm the source unit.
                        </div>
                      </div>
                      <label className="flex items-center gap-2 text-xs font-semibold text-amber-950 cursor-pointer pt-1">
                        <input
                          type="checkbox"
                          checked={calibration.userConfirmedUnitWhenUnitless}
                          onChange={(e) =>
                            setCalibration((prev) => ({
                              ...prev,
                              userConfirmedUnitWhenUnitless: e.target.checked,
                            }))
                          }
                          className="rounded border-amber-400 text-teal-700 focus:ring-teal-500"
                        />
                        <span>I confirm the selected source measurement unit is accurate</span>
                      </label>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                      <span className="text-[10px] text-slate-400 font-semibold uppercase block">
                        File & Entities
                      </span>
                      <span className="font-bold text-slate-900 truncate block">
                        {drawingModel.metadata.fileName}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {drawingModel.entities.length} supported · {drawingModel.layers.length} layers
                      </span>
                    </div>

                    <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                      <span className="text-[10px] text-slate-400 font-semibold uppercase block">
                        Raw CAD Extents
                      </span>
                      <span className="font-bold text-slate-900 tabular-nums block">
                        {drawingModel.metadata.computedExtents?.width.toFixed(2) || 0} ×{' '}
                        {drawingModel.metadata.computedExtents?.length.toFixed(2) || 0}
                      </span>
                      <span className="text-[11px] text-slate-500 tabular-nums">
                        Header Unit: {drawingModel.metadata.detectedUnit}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-3 pt-1">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Effective Source CAD Drawing Unit
                      </label>
                      <select
                        value={calibration.effectiveSourceUnit}
                        onChange={(e) =>
                          setCalibration((prev) => ({
                            ...prev,
                            effectiveSourceUnit: e.target.value as Exclude<CADLengthUnit, 'UNITLESS'>,
                          }))
                        }
                        className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                      >
                        {SOURCE_UNIT_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Scale Multiplier
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0.001"
                          value={calibration.scaleMultiplier}
                          onChange={(e) =>
                            setCalibration((prev) => ({
                              ...prev,
                              scaleMultiplier: Math.max(0.0001, parseFloat(e.target.value) || 1.0),
                            }))
                          }
                          className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Target Plotify Unit
                        </label>
                        <select
                          value={calibration.targetPlotifyUnit}
                          onChange={(e) =>
                            setCalibration((prev) => ({
                              ...prev,
                              targetPlotifyUnit: e.target.value as MeasurementUnit,
                            }))
                          }
                          className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                        >
                          <option value="metres">Metres (m)</option>
                          <option value="feet">Feet (ft)</option>
                        </select>
                      </div>
                    </div>

                    {mappingResult && (
                      <div className="p-3 bg-teal-50/70 border border-teal-200 rounded-lg text-xs text-teal-950 space-y-1">
                        <div className="font-bold flex items-center justify-between">
                          <span>Calibrated Plot Envelope:</span>
                          <span className="tabular-nums">
                            {mappingResult.mappedProjectSpec.plotWidth} ×{' '}
                            {mappingResult.mappedProjectSpec.plotLength}{' '}
                            {mappingResult.targetUnit === 'feet' ? 'ft' : 'm'}
                          </span>
                        </div>
                        <div className="text-[11px] text-teal-800 flex items-center justify-between">
                          <span>Unit Scale Factor:</span>
                          <span className="font-mono">
                            ×{mappingResult.report.appliedUnitScaleFactor}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Step 3: Layer Mapping Rules */}
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-teal-700" />
                      <h3 className="text-sm font-bold text-slate-900">
                        Step 3 — CAD Layer-to-Plotify Mapping
                      </h3>
                    </div>
                    <span className="text-[11px] text-slate-500">
                      {layerRules.filter((r) => r.selectedForImport).length}/{layerRules.length} active
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 text-[10px] font-semibold text-slate-400 uppercase">
                          <th className="py-2 pr-2">Use</th>
                          <th className="py-2 px-2">Layer Name</th>
                          <th className="py-2 px-2">Target Role</th>
                          <th className="py-2 pl-2 text-center">Floor</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {layerRules.map((rule) => {
                          const layerMeta = drawingModel.layers.find(
                            (l) => l.name === rule.layerName
                          );
                          return (
                            <tr key={rule.layerName} className="hover:bg-slate-50/80">
                              <td className="py-2 pr-2">
                                <input
                                  type="checkbox"
                                  checked={rule.selectedForImport}
                                  onChange={(e) =>
                                    handleUpdateLayerRule(rule.layerName, {
                                      selectedForImport: e.target.checked,
                                    })
                                  }
                                  className="rounded border-slate-300 text-teal-700"
                                />
                              </td>
                              <td className="py-2 px-2">
                                <div className="font-bold text-slate-800">{rule.layerName}</div>
                                {layerMeta && (
                                  <div className="text-[10px] text-slate-400">
                                    {layerMeta.entityCount} entities
                                  </div>
                                )}
                              </td>
                              <td className="py-2 px-2">
                                <select
                                  value={rule.targetRole}
                                  onChange={(e) =>
                                    handleUpdateLayerRule(rule.layerName, {
                                      targetRole: e.target.value as CADLayerTargetRole,
                                    })
                                  }
                                  className="w-full py-1 px-2 text-xs bg-slate-50 border border-slate-200 rounded text-slate-800"
                                >
                                  {LAYER_ROLE_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="py-2 pl-2 text-center">
                                <input
                                  type="number"
                                  min={1}
                                  max={10}
                                  value={rule.targetFloorLevel}
                                  onChange={(e) =>
                                    handleUpdateLayerRule(rule.layerName, {
                                      targetFloorLevel: Math.max(
                                        1,
                                        parseInt(e.target.value, 10) || 1
                                      ),
                                    })
                                  }
                                  className="w-12 py-1 px-1.5 text-center text-xs bg-slate-50 border border-slate-200 rounded text-slate-800"
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Right 7 cols: Interactive 2D CAD & Room Mapping Preview + Candidate Inspector */}
              <div className="lg:col-span-7 space-y-5">
                {mappingResult && (
                  <>
                    {/* 2D Visual Preview */}
                    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                        <div className="flex items-center gap-2">
                          <Eye className="w-4 h-4 text-teal-700" />
                          <h3 className="text-sm font-bold text-slate-900">
                            Step 4 — Interactive 2D CAD & Room Mapping Preview
                          </h3>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-[11px]">
                          <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold">
                            {mappingResult.mappedRooms.length} Mapped Rooms
                          </span>
                          {mappingResult.report.rejectedRoomCandidatesCount > 0 && (
                            <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-semibold">
                              {mappingResult.report.rejectedRoomCandidatesCount} Non-Rectilinear / Open Flagged
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">
                            {mappingResult.mappedColumns.length} Columns
                          </span>
                        </div>
                      </div>

                      {/* SVG Canvas */}
                      <div className="bg-slate-950 rounded-xl p-4 flex items-center justify-center overflow-hidden border border-slate-800">
                        {(() => {
                          const plotW = Math.max(mappingResult.mappedProjectSpec.plotWidth, 10);
                          const plotL = Math.max(mappingResult.mappedProjectSpec.plotLength, 10);
                          const pad = Math.max(plotW, plotL) * 0.12;
                          const vbMinX = -pad;
                          const vbMinY = -pad;
                          const vbW = plotW + pad * 2;
                          const vbH = plotL + pad * 2;

                          return (
                            <svg
                              viewBox={`${vbMinX} ${vbMinY} ${vbW} ${vbH}`}
                              className="w-full h-72 max-h-80"
                              aria-label="CAD Drawing to Plotify Floor Plan Preview"
                            >
                              {/* Plot Envelope */}
                              <rect
                                x={0}
                                y={0}
                                width={plotW}
                                height={plotL}
                                fill="rgba(20, 184, 166, 0.06)"
                                stroke="#14b8a6"
                                strokeWidth={Math.max(plotW, plotL) * 0.006}
                                strokeDasharray={`${Math.max(plotW, plotL) * 0.02} ${Math.max(plotW, plotL) * 0.01}`}
                              />

                              {/* Mapped Rooms */}
                              {mappingResult.mappedRooms.map((room) => (
                                <g key={room.id}>
                                  <rect
                                    x={room.x}
                                    y={room.y}
                                    width={room.width}
                                    height={room.length}
                                    fill={room.color || '#ccfbf1'}
                                    fillOpacity={0.75}
                                    stroke="#0f766e"
                                    strokeWidth={Math.max(plotW, plotL) * 0.005}
                                  />
                                  <text
                                    x={room.x + room.width / 2}
                                    y={room.y + room.length / 2}
                                    textAnchor="middle"
                                    dominantBaseline="middle"
                                    fill="#0f172a"
                                    fontSize={Math.max(plotW, plotL) * 0.032}
                                    fontWeight="bold"
                                  >
                                    {room.name} (F{room.floorLevel})
                                  </text>
                                </g>
                              ))}

                              {/* Structural Columns */}
                              {mappingResult.mappedColumns.map((col) => (
                                <circle
                                  key={col.id}
                                  cx={col.x}
                                  cy={col.y}
                                  r={Math.max(plotW, plotL) * 0.015}
                                  fill="#f59e0b"
                                  stroke="#fff"
                                  strokeWidth={Math.max(plotW, plotL) * 0.003}
                                />
                              ))}
                            </svg>
                          );
                        })()}
                      </div>

                      {/* Candidate Room & Geometry Validation Table with Omit Controls */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                            Candidate Room Polylines & Validation Controls
                          </h4>
                          <span className="text-[11px] text-slate-500">
                            Uncheck any candidate to omit it from room creation
                          </span>
                        </div>

                        <div className="overflow-x-auto border border-slate-200 rounded-lg">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-semibold text-slate-500 uppercase">
                                <th className="py-2 px-3">Include</th>
                                <th className="py-2 px-3">Room / Handle</th>
                                <th className="py-2 px-3">Layer · Floor</th>
                                <th className="py-2 px-3">Dimensions</th>
                                <th className="py-2 px-3">Geometry Validation</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {mappingResult.candidateRooms.map((cand) => (
                                <tr
                                  key={cand.entityId}
                                  className={
                                    cand.isEligible && !cand.isOmittedByUser
                                      ? 'bg-white'
                                      : 'bg-slate-50/80 text-slate-500'
                                  }
                                >
                                  <td className="py-2 px-3">
                                    <button
                                      onClick={() => handleToggleOmitHandle(cand.handle)}
                                      disabled={!cand.isEligible}
                                      className="inline-flex items-center gap-1 text-xs font-medium cursor-pointer disabled:opacity-40"
                                      title={
                                        cand.isEligible
                                          ? 'Toggle whether to import this room'
                                          : 'Invalid geometry is automatically excluded from room creation'
                                      }
                                    >
                                      {cand.isEligible && !cand.isOmittedByUser ? (
                                        <CheckSquare className="w-4 h-4 text-teal-700" />
                                      ) : (
                                        <Square className="w-4 h-4 text-slate-400" />
                                      )}
                                    </button>
                                  </td>
                                  <td className="py-2 px-3">
                                    <div className="font-bold text-slate-900">
                                      {cand.inferredName}
                                    </div>
                                    <div className="text-[10px] text-slate-400 font-mono">
                                      #{cand.handle} ({cand.inferredRoomType})
                                    </div>
                                  </td>
                                  <td className="py-2 px-3">
                                    <span className="font-medium text-slate-700">
                                      {cand.layer}
                                    </span>{' '}
                                    · F{cand.floorLevel}
                                  </td>
                                  <td className="py-2 px-3 tabular-nums">
                                    {cand.mappedRoom.width} × {cand.mappedRoom.length}{' '}
                                    {mappingResult.targetUnit === 'feet' ? 'ft' : 'm'}
                                  </td>
                                  <td className="py-2 px-3">
                                    <span
                                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                        cand.isEligible
                                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                          : 'bg-rose-50 text-rose-800 border border-rose-200'
                                      }`}
                                    >
                                      {cand.isEligible ? 'Valid Rectilinear' : 'Rejected / Reference'}
                                    </span>
                                    <div className="text-[11px] text-slate-600 mt-0.5">
                                      {cand.eligibilityReason}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>

                    {/* Step 5: Safe Application Panel */}
                    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-teal-700" />
                          <h3 className="text-sm font-bold text-slate-900">
                            Step 5 — Safely Apply Mapped CAD Model
                          </h3>
                        </div>
                        <span className="text-[11px] text-teal-800 font-semibold">
                          Preserves P41 IFC & All Unrelated Project Domains
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                          onClick={() => setApplyTarget('new')}
                          className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                            applyTarget === 'new'
                              ? 'border-teal-600 bg-teal-50/50'
                              : 'border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <div className="text-xs font-bold text-slate-900">
                            Create New Plotify Project
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Initialize a fresh project from the calibrated plot, rooms, and columns.
                          </div>
                        </button>

                        <button
                          onClick={() => project && setApplyTarget('existing')}
                          disabled={!project}
                          className={`p-3 rounded-xl border text-left transition-colors cursor-pointer disabled:opacity-40 ${
                            applyTarget === 'existing' && project
                              ? 'border-teal-600 bg-teal-50/50'
                              : 'border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <div className="text-xs font-bold text-slate-900">
                            Apply to Active Project ({project ? project.name : 'None Selected'})
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Automatically creates a rollback snapshot before merging or updating rooms.
                          </div>
                        </button>
                      </div>

                      {applyTarget === 'new' ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                              New Project Name
                            </label>
                            <input
                              type="text"
                              value={newProjectName}
                              onChange={(e) => setNewProjectName(e.target.value)}
                              className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                              Building Typology
                            </label>
                            <select
                              value={newProjectType}
                              onChange={(e) => setNewProjectType(e.target.value as ProjectType)}
                              className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                            >
                              <option value="house">Residential House / Villa</option>
                              <option value="apartment">Multi-Unit Apartment</option>
                              <option value="other">Commercial / Mixed-Use</option>
                            </select>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                          <button
                            onClick={() => setApplyMode('merge-append')}
                            className={`p-2.5 rounded-lg border text-left text-xs cursor-pointer ${
                              applyMode === 'merge-append'
                                ? 'border-teal-600 bg-teal-50/60 font-semibold text-teal-950'
                                : 'border-slate-200 text-slate-700'
                            }`}
                          >
                            <div>Merge & Preserve Existing Rooms</div>
                            <div className="text-[11px] font-normal text-slate-500">
                              Appends mapped CAD rooms and columns while keeping existing project rooms intact.
                            </div>
                          </button>
                          <button
                            onClick={() => setApplyMode('replace-geometry')}
                            className={`p-2.5 rounded-lg border text-left text-xs cursor-pointer ${
                              applyMode === 'replace-geometry'
                                ? 'border-teal-600 bg-teal-50/60 font-semibold text-teal-950'
                                : 'border-slate-200 text-slate-700'
                            }`}
                          >
                            <div>Replace Floor Plan with Mapped CAD Rooms</div>
                            <div className="text-[11px] font-normal text-slate-500">
                              Replaces 2D rooms with the calibrated CAD layout while keeping Brief, Budget, MEP, and P41 IFC intact.
                            </div>
                          </button>
                        </div>
                      )}

                      <div className="flex items-center justify-end pt-2">
                        <button
                          onClick={handleApplyCADMapping}
                          disabled={
                            Boolean(isUnitless && !calibration.userConfirmedUnitWhenUnitless)
                          }
                          className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5 text-teal-400" />
                          <span>
                            {applyTarget === 'new'
                              ? 'Create Project from CAD Drawing'
                              : `Apply CAD Mapping to "${project?.name}"`}
                          </span>
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: DXF EXPORT, INDEPENDENT VALIDATION & ROUND-TRIP */}
      {activeTab === 'export' && (
        <div className="space-y-6">
          {!project ? (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center space-y-3">
              <FileSpreadsheet className="w-8 h-8 text-slate-400 mx-auto" />
              <h3 className="text-base font-bold text-slate-900">
                Select a Project to Export to ASCII DXF
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Open a project from the Projects list or import a DXF drawing in Tab 1 first to generate a standards-compliant ASCII DXF package.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Export Configuration (5 cols) */}
              <div className="lg:col-span-5 space-y-4">
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <h3 className="text-sm font-bold text-slate-900">
                      ASCII DXF Export Options ({project.name})
                    </h3>
                    <span className="text-[11px] font-semibold text-teal-700">
                      AutoCAD 2000 (AC1015)
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Export Drawing Units ($INSUNITS)
                    </label>
                    <select
                      value={exportOptions.exportUnit}
                      onChange={(e) =>
                        setExportOptions((prev) => ({
                          ...prev,
                          exportUnit: e.target.value as CADExportOptions['exportUnit'],
                        }))
                      }
                      className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                    >
                      <option value="PROJECT_UNIT">Match Project Unit ({project.unit})</option>
                      <option value="METRE">Metres ($INSUNITS = 6)</option>
                      <option value="MILLIMETRE">Millimetres ($INSUNITS = 4)</option>
                      <option value="FOOT">Feet ($INSUNITS = 2)</option>
                    </select>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="text-[11px] font-semibold text-slate-400 uppercase">
                      Exported CAD Layers
                    </div>
                    {[
                      {
                        key: 'includePlotBoundary',
                        label: 'A-SITE-BNDY (Plot Envelope LWPOLYLINE)',
                      },
                      {
                        key: 'includeSiteSetbacks',
                        label: 'A-SITE-SETB (Buildable Envelope Setbacks)',
                      },
                      {
                        key: 'includeRoomPolylines',
                        label: 'A-AREA-F* (Closed Room Polylines per Storey)',
                      },
                      {
                        key: 'includeRoomLabels',
                        label: 'A-ANNO-F* (Room Name & Area Annotations)',
                      },
                      {
                        key: 'includeStructuralGrid',
                        label: 'S-GRID (Structural Reference Axes)',
                      },
                      {
                        key: 'includeStructuralColumnsAndBeams',
                        label: 'S-COLS / S-BEAM (Structural Columns & Beams)',
                      },
                    ].map((item) => (
                      <label
                        key={item.key}
                        className="flex items-center gap-2 text-slate-700 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(
                            exportOptions[item.key as keyof CADExportOptions]
                          )}
                          onChange={(e) =>
                            setExportOptions((prev) => ({
                              ...prev,
                              [item.key]: e.target.checked,
                            }))
                          }
                          className="rounded border-slate-300 text-teal-700"
                        />
                        <span>{item.label}</span>
                      </label>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    <button
                      onClick={handleGenerateDXFExport}
                      className="flex-1 py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-2 cursor-pointer transition-colors"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-teal-400" />
                      <span>Generate & Validate DXF</span>
                    </button>

                    {exportResult && (
                      <button
                        onClick={handleDownloadDXF}
                        className="py-2.5 px-4 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download .DXF</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Validation & Round-Trip Verification Results (7 cols) */}
              <div className="lg:col-span-7 space-y-4">
                {exportResult ? (
                  <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <h3 className="text-sm font-bold text-slate-900">
                        Independent DXF Structural Validation Report
                      </h3>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          exportResult.report.validationResult.isValid
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-rose-50 text-rose-800 border border-rose-200'
                        }`}
                      >
                        {exportResult.report.validationResult.isValid
                          ? 'ALL CHECKS PASSED'
                          : 'VALIDATION ISSUES'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                      <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                        <span className="text-[10px] text-slate-400 font-semibold uppercase block">
                          Rooms Exported
                        </span>
                        <span className="text-base font-bold text-slate-900 tabular-nums">
                          {exportResult.report.exportedCounts.roomPolylines}
                        </span>
                      </div>
                      <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                        <span className="text-[10px] text-slate-400 font-semibold uppercase block">
                          Grid & Beams
                        </span>
                        <span className="text-base font-bold text-slate-900 tabular-nums">
                          {exportResult.report.exportedCounts.gridLines +
                            exportResult.report.exportedCounts.beams}
                        </span>
                      </div>
                      <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                        <span className="text-[10px] text-slate-400 font-semibold uppercase block">
                          Columns
                        </span>
                        <span className="text-base font-bold text-slate-900 tabular-nums">
                          {exportResult.report.exportedCounts.columns}
                        </span>
                      </div>
                      <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                        <span className="text-[10px] text-slate-400 font-semibold uppercase block">
                          Total Entities
                        </span>
                        <span className="text-base font-bold text-teal-700 tabular-nums">
                          {exportResult.report.totalEntitiesWritten}
                        </span>
                      </div>
                    </div>

                    {roundTripResult && (
                      <div className="pt-3 border-t border-slate-100 space-y-2">
                        <div className="text-xs font-bold text-slate-900">
                          Deterministic Round-Trip Re-Import Verification (Plotify → DXF → Plotify)
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                          <div className="p-2 rounded bg-teal-50/60 border border-teal-200">
                            <span className="text-[10px] text-teal-700 font-semibold uppercase block">
                              Round-Trip Status
                            </span>
                            <span className="font-bold text-teal-950">
                              {roundTripResult.passed ? 'PASSED' : 'DISCREPANCIES'}
                            </span>
                          </div>
                          <div className="p-2 rounded bg-teal-50/60 border border-teal-200">
                            <span className="text-[10px] text-teal-700 font-semibold uppercase block">
                              Rooms Matched
                            </span>
                            <span className="font-bold text-teal-950">
                              {roundTripResult.preservedHandlesMatched}/{roundTripResult.totalRoomsCompared} Rooms
                            </span>
                          </div>
                          <div className="p-2 rounded bg-teal-50/60 border border-teal-200">
                            <span className="text-[10px] text-teal-700 font-semibold uppercase block">
                              Max Dimension Drift
                            </span>
                            <span className="font-bold text-teal-950">
                              {roundTripResult.maxDimensionDelta.toFixed(4)} units
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-xs text-slate-500">
                    Click <strong>Generate & Validate DXF</strong> to run the deterministic ASCII DXF exporter, structural validator, and round-trip re-import check.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: SUPPORT MATRIX & CAD/IFC PROVENANCE LEDGER */}
      {activeTab === 'profile' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
              P42 CAD Drawing Exchange Support Matrix
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <div className="font-bold text-slate-800 mb-1">Fully Supported CAD Formats</div>
                {supportProfile.fullySupportedFormats.map((fmt) => (
                  <div
                    key={fmt.format}
                    className="p-2.5 rounded-lg bg-emerald-50/50 border border-emerald-200 mb-2"
                  >
                    <div className="font-bold text-emerald-950">{fmt.format}</div>
                    <div className="text-[11px] text-emerald-800 mt-0.5">
                      Versions: {fmt.versions.join(', ')}
                    </div>
                    <p className="text-[11px] text-slate-600 mt-1">{fmt.description}</p>
                  </div>
                ))}
              </div>

              <div>
                <div className="font-bold text-slate-800 mb-1">
                  Recognized Formats Requiring Conversion or Dedicated Workspace
                </div>
                {supportProfile.recognizedButUnsupportedFormats.map((fmt) => (
                  <div
                    key={fmt.format}
                    className="p-2.5 rounded-lg bg-amber-50/40 border border-amber-200 mb-2"
                  >
                    <div className="font-bold text-amber-950">{fmt.format}</div>
                    <p className="text-[11px] text-slate-700 mt-0.5">{fmt.guidance}</p>
                  </div>
                ))}
              </div>

              <div>
                <div className="font-bold text-slate-800 mb-1">Known Architectural Limitations</div>
                <ul className="list-disc list-inside space-y-1 text-slate-600">
                  {supportProfile.knownLimitations.map((lim, i) => (
                    <li key={i}>{lim}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
              Project CAD & OpenBIM (P41) Coexistence Ledger
            </h3>

            {project ? (
              <div className="space-y-3 text-xs">
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                  <div className="font-bold text-slate-900">P42 CAD Provenance Status</div>
                  {project.cadInterop?.lastImportReport ? (
                    <>
                      <div className="text-slate-600">
                        Last Import:{' '}
                        <strong>{project.cadInterop.lastImportReport.fileName}</strong>
                      </div>
                      <div className="text-slate-600">
                        Tracked CAD Provenance Links:{' '}
                        <strong>{project.cadInterop.provenanceMappings.length}</strong>
                      </div>
                      <div className="text-slate-600">
                        Preserved Reference Entities:{' '}
                        <strong>{project.cadInterop.referenceEntities.length}</strong>
                      </div>
                    </>
                  ) : (
                    <div className="text-slate-500">
                      No CAD drawing imported into this project yet.
                    </div>
                  )}
                </div>

                <div className="p-3 rounded-lg bg-teal-50/50 border border-teal-200 space-y-1">
                  <div className="font-bold text-teal-950">P41 OpenBIM & IFC Coexistence</div>
                  {project.ifcInterop?.lastImportReport ? (
                    <div className="text-teal-900">
                      Active P41 IFC Metadata Preserved:{' '}
                      <strong>{project.ifcInterop.lastImportReport.fileName}</strong> (
                      {project.ifcInterop.idMappings.length} GlobalIds intact)
                    </div>
                  ) : (
                    <div className="text-teal-800">
                      Compatible with P41 OpenBIM & IFC 3D model exchange without ID collision.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                Select a project to inspect its CAD and IFC provenance records.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
