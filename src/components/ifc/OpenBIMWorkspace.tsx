/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useMemo } from 'react';
import {
  ArrowLeft,
  Upload,
  Download,
  FileCode,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Info,
  Layers,
  Box,
  PenTool,
  Grid,
  RefreshCw,
  ShieldCheck,
  FileCheck2,
  PlusCircle,
  GitMerge,
  XCircle,
  Database,
  Eye,
} from 'lucide-react';
import { Project, MeasurementUnit } from '../../types/project';
import {
  SupportedIFCSchema,
  IFCIntermediateModel,
  IFCMappingResult,
  IFCExportOptions,
  IFCExportReport,
  IFCRoundTripComparison,
} from '../../types/ifc';
import {
  getSupportedIFCProfile,
  parseIFCAsync,
  mapIFCIntermediateToPlotify,
  buildNewProjectFromIFCMapping,
  applyIFCMappingToExistingProject,
  exportProjectToIFC,
  compareIFCRoundTrip,
  SAMPLE_IFC_FIXTURES,
  DEFAULT_MAX_IFC_FILE_BYTES,
} from '../../services/ifcService';

interface OpenBIMWorkspaceProps {
  project: Project | null;
  defaultUnit: MeasurementUnit;
  defaultCurrency: Project['currency'];
  onBack: () => void;
  onCreateImportedProject: (
    newProjectData: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>
  ) => Promise<void>;
  onUpdateProject: (updated: Project) => Promise<void>;
  onOpenFloorPlan?: (project: Project) => void;
  onOpen3DViewer?: (project: Project) => void;
  onOpenStructural?: (project: Project) => void;
  onShowToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const OpenBIMWorkspace: React.FC<OpenBIMWorkspaceProps> = ({
  project,
  defaultUnit,
  defaultCurrency,
  onBack,
  onCreateImportedProject,
  onUpdateProject,
  onOpenFloorPlan,
  onOpen3DViewer,
  onOpenStructural,
  onShowToast,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'import' | 'export' | 'profile'>('import');
  const profile = useMemo(() => getSupportedIFCProfile(), []);

  // Import state
  const [selectedFixtureId, setSelectedFixtureId] = useState<string>(SAMPLE_IFC_FIXTURES[0].id);
  const [targetUnitPreference, setTargetUnitPreference] = useState<'auto' | MeasurementUnit>('auto');
  const [isParsing, setIsParsing] = useState(false);
  const [intermediateModel, setIntermediateModel] = useState<IFCIntermediateModel | null>(null);
  const [mappingResult, setMappingResult] = useState<IFCMappingResult | null>(null);
  const [applyMode, setApplyMode] = useState<'merge-append' | 'replace-geometry'>('merge-append');
  const [isApplying, setIsApplying] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Export & Round-trip state
  const [exportOptions, setExportOptions] = useState<IFCExportOptions>({
    schemaVersion: 'IFC4',
    includePerimeterWallsAndSlabs: true,
    includeStructuralElements: true,
    includePropertySets: true,
    includeBaseQuantities: true,
    authorName: 'Lead Architect',
    organizationName: 'Plotify OpenBIM Studio',
  });
  const [exportedContent, setExportedContent] = useState<string | null>(null);
  const [exportReport, setExportReport] = useState<IFCExportReport | null>(null);
  const [roundTripResult, setRoundTripResult] = useState<IFCRoundTripComparison | null>(null);
  const [showRawStepPreview, setShowRawStepPreview] = useState(false);

  const runParseAndMap = async (
    fileName: string,
    fileSizeBytes: number,
    rawContent: string,
    unitPref: 'auto' | MeasurementUnit = targetUnitPreference
  ) => {
    if (isParsing) {
      onShowToast('An IFC parse operation is already running.', 'info');
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsParsing(true);

    try {
      const ir = await parseIFCAsync({
        fileName,
        fileSizeBytes,
        rawContent,
        targetUnit: unitPref === 'auto' ? undefined : unitPref,
        signal: controller.signal,
      });

      setIntermediateModel(ir);

      if (ir.isValid) {
        const mapped = mapIFCIntermediateToPlotify(ir, {
          targetUnit: unitPref === 'auto' ? undefined : unitPref,
        });
        setMappingResult(mapped);
        onShowToast(
          `Parsed "${fileName}" (${ir.metadata.schemaIdentifier}): ${mapped.mappedRooms.length} space(s), ${mapped.mappedColumns.length} column(s) mapped.`,
          'success'
        );
      } else {
        setMappingResult(null);
        const firstErr = ir.errors[0]?.message || 'IFC validation failed.';
        onShowToast(firstErr, 'error');
      }
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to parse IFC file.', 'error');
    } finally {
      setIsParsing(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancelParse = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      onShowToast('IFC parsing cancelled.', 'info');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > DEFAULT_MAX_IFC_FILE_BYTES) {
      onShowToast(
        `File "${file.name}" (${(file.size / (1024 * 1024)).toFixed(2)} MB) exceeds the 15 MB limit.`,
        'error'
      );
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = typeof event.target?.result === 'string' ? event.target.result : '';
      await runParseAndMap(file.name, file.size, text);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.onerror = () => {
      onShowToast(`Failed to read file "${file.name}".`, 'error');
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const handleLoadSampleFixture = async () => {
    const fixture =
      SAMPLE_IFC_FIXTURES.find((f) => f.id === selectedFixtureId) || SAMPLE_IFC_FIXTURES[0];
    const byteSize = new Blob([fixture.content]).size;
    await runParseAndMap(fixture.fileName, byteSize, fixture.content);
  };

  const handleUnitPreferenceChange = (newPref: 'auto' | MeasurementUnit) => {
    setTargetUnitPreference(newPref);
    if (intermediateModel && intermediateModel.isValid) {
      const remapped = mapIFCIntermediateToPlotify(intermediateModel, {
        targetUnit: newPref === 'auto' ? undefined : newPref,
      });
      setMappingResult(remapped);
    }
  };

  const handleCreateNewProjectFromImport = async () => {
    if (!mappingResult || !mappingResult.success || isApplying) return;
    setIsApplying(true);
    try {
      const newProjectPayload = buildNewProjectFromIFCMapping(mappingResult, defaultCurrency);
      await onCreateImportedProject(newProjectPayload);
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to create project from IFC import.', 'error');
    } finally {
      setIsApplying(false);
    }
  };

  const handleApplyToExistingProject = async () => {
    if (!project || !mappingResult || !mappingResult.success || isApplying) return;
    setIsApplying(true);
    try {
      const { updatedProject } = applyIFCMappingToExistingProject(
        project,
        mappingResult,
        applyMode
      );
      await onUpdateProject(updatedProject);
      onShowToast(
        `Applied IFC model to "${project.name}" (${applyMode === 'merge-append' ? 'merged' : 'replaced geometry'}). Pre-import safety checkpoint saved.`,
        'success'
      );
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to apply IFC data to project.', 'error');
    } finally {
      setIsApplying(false);
    }
  };

  const handleGenerateExport = async () => {
    if (!project) {
      onShowToast('Select a project first to export to IFC.', 'error');
      return;
    }
    try {
      const { ifcContent, report } = exportProjectToIFC(project, exportOptions);
      setExportedContent(ifcContent);
      setExportReport(report);
      setRoundTripResult(null);

      // Persist lastExportReport on project ifcInterop metadata
      const updatedInterop = {
        version: 'plotify-ifc-meta-v1' as const,
        ...(project.ifcInterop || {
          idMappings: [],
          preservedElements: [],
          unsupportedEntitySummary: {},
        }),
        lastExportedAt: report.exportedAt,
        lastExportReport: report,
      };
      await onUpdateProject({
        ...project,
        ifcInterop: updatedInterop,
      });

      onShowToast(
        `Generated ${report.schemaVersion} STEP file (${report.totalEntitiesWritten} entities, validation: ${
          report.validationResult.isValid ? 'PASSED' : 'ISSUES'
        }).`,
        report.validationResult.isValid ? 'success' : 'error'
      );
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to generate IFC export.', 'error');
    }
  };

  const handleDownloadIFC = () => {
    if (!exportedContent || !exportReport) return;
    const blob = new Blob([exportedContent], { type: 'application/x-step' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportReport.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onShowToast(`Downloaded "${exportReport.fileName}".`, 'info');
  };

  const handleRunRoundTripCheck = () => {
    if (!project) return;
    try {
      const res = compareIFCRoundTrip(project, exportOptions);
      setExportedContent(res.exportedIfcContent);
      setExportReport(res.exportReport);
      setRoundTripResult(res.comparison);
      onShowToast(
        res.comparison.passed
          ? `Round-trip verification PASSED (${res.comparison.preservedGlobalIdsMatched}/${res.comparison.totalGlobalIdsCompared} GlobalIds & dimensions verified).`
          : 'Round-trip verification detected discrepancies.',
        res.comparison.passed ? 'success' : 'error'
      );
    } catch (err: any) {
      onShowToast(err?.message || 'Round-trip verification failed.', 'error');
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="space-y-1">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{project ? `Back to ${project.name}` : 'Back to Projects'}</span>
          </button>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              OpenBIM & IFC Interoperability
            </h1>
            <span className="px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider bg-teal-50 text-teal-800 border border-teal-200 rounded-md">
              P41 · IFC2X3 / IFC4 STEP Exchange
            </span>
          </div>
          <p className="text-xs text-slate-500 max-w-3xl">
            Inspect, validate, and map supported Industry Foundation Classes (ISO 10303-21 STEP) spatial hierarchies, spaces, and structural elements into Plotify with explicit unit conversion, non-destructive provenance tracking, and honest loss reporting.
          </p>
        </div>

        {project && (
          <div className="flex flex-wrap items-center gap-2">
            {onOpenFloorPlan && (
              <button
                onClick={() => onOpenFloorPlan(project)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors cursor-pointer"
              >
                <PenTool className="w-3.5 h-3.5 text-teal-700" />
                <span>2D Floor Plan</span>
              </button>
            )}
            {onOpen3DViewer && (
              <button
                onClick={() => onOpen3DViewer(project)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                <Box className="w-3.5 h-3.5 text-teal-600" />
                <span>3D Building View</span>
              </button>
            )}
            {onOpenStructural && (
              <button
                onClick={() => onOpenStructural(project)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                <Grid className="w-3.5 h-3.5 text-teal-700" />
                <span>Structural Grid</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Navigation Sub-tabs */}
      <div className="flex flex-wrap items-center gap-2 bg-white p-1.5 rounded-xl border border-slate-200 shadow-2xs">
        <button
          onClick={() => setActiveSubTab('import')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeSubTab === 'import'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Upload className="w-3.5 h-3.5 text-teal-400" />
          <span>1. Import, Inspect & Map IFC</span>
        </button>

        <button
          onClick={() => setActiveSubTab('export')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeSubTab === 'export'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Download className="w-3.5 h-3.5 text-teal-400" />
          <span>2. Export IFC & Round-Trip Verification</span>
        </button>

        <button
          onClick={() => setActiveSubTab('profile')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeSubTab === 'profile'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
          <span>3. Support Profile & Provenance Ledger</span>
        </button>
      </div>

      {/* =====================================================================
          TAB 1: IMPORT, INSPECT & MAP IFC
      ===================================================================== */}
      {activeSubTab === 'import' && (
        <div className="space-y-6">
          {/* Step A & B: File Selection, Sample Fixtures, and Unit Controls */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <FileCode className="w-4 h-4 text-teal-700" />
                  <h2 className="text-sm font-bold text-slate-900">
                    Select & Inspect IFC File (ISO 10303-21 STEP)
                  </h2>
                </div>
                <span className="text-[11px] font-mono text-slate-500">
                  Max {(profile.maxFileSizeBytes / (1024 * 1024)).toFixed(0)} MB · .ifc
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Local Device Upload */}
                <div className="p-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="text-xs font-bold text-slate-900">
                      Upload Local .ifc File
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                      Select an IFC2X3 or IFC4 STEP file from your computer. All input is parsed locally and sanitized as untrusted data.
                    </p>
                  </div>
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".ifc"
                      onChange={handleFileUpload}
                      className="hidden"
                      id="ifc-file-upload-input"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isParsing}
                      className="w-full py-2 px-3 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5 text-teal-400" />
                      <span>Choose .ifc File...</span>
                    </button>
                  </div>
                </div>

                {/* Built-in Reference Fixtures */}
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="text-xs font-bold text-slate-900">
                      Or Inspect Reference IFC Fixture
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Load a verified IFC4 (metric) or IFC2X3 (imperial feet) test model to inspect mapping & warnings.
                    </p>
                    <select
                      value={selectedFixtureId}
                      onChange={(e) => setSelectedFixtureId(e.target.value)}
                      className="mt-2 w-full py-1.5 px-2.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800"
                    >
                      {SAMPLE_IFC_FIXTURES.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={handleLoadSampleFixture}
                    disabled={isParsing}
                    className="w-full py-2 px-3 bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <FileCheck2 className="w-3.5 h-3.5" />
                    <span>Parse & Inspect Reference Model</span>
                  </button>
                </div>
              </div>

              {/* Target Unit Normalization Control & Cancellation */}
              <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-semibold text-slate-700">Target Project Unit:</span>
                  {(['auto', 'metres', 'feet'] as const).map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => handleUnitPreferenceChange(u)}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors cursor-pointer ${
                        targetUnitPreference === u
                          ? 'bg-teal-50 text-teal-900 border-teal-300'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {u === 'auto' ? 'Auto (Match Source)' : u === 'metres' ? 'Metres (m)' : 'Feet (ft)'}
                    </button>
                  ))}
                </div>

                {isParsing && (
                  <button
                    onClick={handleCancelParse}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 rounded-lg text-xs font-semibold cursor-pointer"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Cancel Parse</span>
                  </button>
                )}
              </div>
            </div>

            {/* Honest Scope & Support Summary Box */}
            <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Declared Exchange Profile
                </span>
                <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 rounded">
                  IFC2X3 & IFC4 Verified
                </span>
              </div>
              <ul className="text-xs text-slate-600 space-y-2 leading-relaxed">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 shrink-0 mt-0.5" />
                  <span>
                    <strong>Editable Spatial & Structural Mapping:</strong> <code className="font-mono text-[11px]">IfcProject → IfcSite → IfcBuilding → IfcBuildingStorey → IfcSpace</code> (axis-aligned <code className="font-mono text-[11px]">IfcExtrudedAreaSolid</code>) and <code className="font-mono text-[11px]">IfcColumn / IfcBeam</code>.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Info className="w-3.5 h-3.5 text-sky-600 shrink-0 mt-0.5" />
                  <span>
                    <strong>Read-Only Provenance Metadata:</strong> <code className="font-mono text-[11px]">IfcWall</code>, <code className="font-mono text-[11px]">IfcSlab</code>, <code className="font-mono text-[11px]">IfcDoor</code>, <code className="font-mono text-[11px]">IfcWindow</code>, <code className="font-mono text-[11px]">IfcPropertySet</code>, <code className="font-mono text-[11px]">IfcElementQuantity</code>, and <code className="font-mono text-[11px]">IfcMaterial</code> are retained in the project's IFC Provenance Ledger.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    <strong>Explicit Non-Fabrication Guarantee:</strong> Unsupported entities (<code className="font-mono text-[11px]">IfcStair</code>, <code className="font-mono text-[11px]">IfcRoof</code>, MEP flow segments) and freeform meshes (<code className="font-mono text-[11px]">IfcFacetedBrep</code>, <code className="font-mono text-[11px]">IfcTriangulatedFaceSet</code>) are never turned into fake geometry and are explicitly listed in the import report.
                  </span>
                </li>
              </ul>
            </div>
          </div>

          {/* Fatal Parse Errors Display */}
          {intermediateModel && !intermediateModel.isValid && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2 text-rose-900 font-bold text-sm">
                <AlertCircle className="w-4 h-4 text-rose-600" />
                <span>IFC File Rejected — Cannot Map to Project State</span>
              </div>
              <div className="space-y-1.5">
                {intermediateModel.errors.map((err) => (
                  <div
                    key={err.id}
                    className="p-3 bg-white rounded-lg border border-rose-200 text-xs text-rose-800 flex items-start justify-between gap-4"
                  >
                    <div>
                      <span className="font-mono font-bold text-[11px] px-1.5 py-0.5 bg-rose-100 rounded mr-2">
                        {err.code}
                      </span>
                      <span>{err.message}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Valid Inspection & Mapping Review (Steps C, D, E) */}
          {intermediateModel && intermediateModel.isValid && mappingResult && (
            <div className="space-y-6">
              {/* Summary Metrics Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                  <div className="text-[10px] font-bold uppercase text-slate-400">Schema</div>
                  <div className="text-sm font-bold text-slate-900 mt-0.5 font-mono">
                    {intermediateModel.metadata.normalizedSchema}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">
                    {intermediateModel.metadata.fileName}
                  </div>
                </div>

                <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                  <div className="text-[10px] font-bold uppercase text-slate-400">Units</div>
                  <div className="text-sm font-bold text-teal-800 mt-0.5">
                    {intermediateModel.metadata.sourceLengthUnit} → {mappingResult.targetUnit}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Factor ×{mappingResult.report.unitConversions[0]?.conversionFactor ?? 1}
                  </div>
                </div>

                <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                  <div className="text-[10px] font-bold uppercase text-slate-400">STEP Entities</div>
                  <div className="text-sm font-bold text-slate-900 mt-0.5 tabular-nums">
                    {mappingResult.report.totalStepEntitiesEncountered}
                  </div>
                  <div className="text-[11px] text-slate-500">Total statements</div>
                </div>

                <div className="bg-emerald-50/70 p-3.5 rounded-xl border border-emerald-200">
                  <div className="text-[10px] font-bold uppercase text-emerald-700">Mapped Editable</div>
                  <div className="text-sm font-bold text-emerald-900 mt-0.5 tabular-nums">
                    {mappingResult.report.entitiesMappedToEditableModel}
                  </div>
                  <div className="text-[11px] text-emerald-700">
                    {mappingResult.mappedRooms.length} spaces, {mappingResult.mappedColumns.length} cols
                  </div>
                </div>

                <div className="bg-sky-50/70 p-3.5 rounded-xl border border-sky-200">
                  <div className="text-[10px] font-bold uppercase text-sky-700">Read-Only Meta</div>
                  <div className="text-sm font-bold text-sky-900 mt-0.5 tabular-nums">
                    {mappingResult.report.entitiesPreservedAsReadOnlyMetadata}
                  </div>
                  <div className="text-[11px] text-sky-700">Walls/slabs/openings</div>
                </div>

                <div className="bg-amber-50/70 p-3.5 rounded-xl border border-amber-200">
                  <div className="text-[10px] font-bold uppercase text-amber-700">Unsupported</div>
                  <div className="text-sm font-bold text-amber-900 mt-0.5 tabular-nums">
                    {mappingResult.report.entitiesSkippedOrUnsupported}
                  </div>
                  <div className="text-[11px] text-amber-700">Omitted with warning</div>
                </div>

                <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                  <div className="text-[10px] font-bold uppercase text-slate-400">Storeys</div>
                  <div className="text-sm font-bold text-slate-900 mt-0.5 tabular-nums">
                    {mappingResult.report.mappedStoreysCount}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Plot {mappingResult.mappedProjectSpec.plotWidth}×{mappingResult.mappedProjectSpec.plotLength}
                  </div>
                </div>

                <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                  <div className="text-[10px] font-bold uppercase text-slate-400">Integrity Alerts</div>
                  <div className="text-sm font-bold text-slate-900 mt-0.5 tabular-nums">
                    {mappingResult.report.duplicateIdsDetected +
                      mappingResult.report.brokenReferencesDetected +
                      mappingResult.report.unrepresentableGeometryCount}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {mappingResult.report.warnings.length} total notices
                  </div>
                </div>
              </div>

              {/* Step E: User-Controlled Review & Apply Panel */}
              <div className="bg-white rounded-xl border-2 border-teal-600/30 p-6 shadow-xs space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 text-[10px] font-bold uppercase bg-teal-100 text-teal-900 rounded">
                        Review Complete
                      </span>
                      <h3 className="text-base font-bold text-slate-900">
                        Apply Validated IFC Import to Plotify
                      </h3>
                    </div>
                    <p className="text-xs text-slate-600 mt-1">
                      Choose whether to create a new standalone Plotify project from this IFC model or safely merge/apply it into your currently active project with an automatic pre-import version snapshot.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      onClick={handleCreateNewProjectFromImport}
                      disabled={isApplying}
                      className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
                    >
                      <PlusCircle className="w-4 h-4 text-teal-400" />
                      <span>Import as New Project ("{mappingResult.mappedProjectSpec.name}")</span>
                    </button>
                  </div>
                </div>

                {project && (
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                        <GitMerge className="w-4 h-4 text-teal-700" />
                        <span>Apply to Active Project: "{project.name}"</span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Automatically captures a rollback checkpoint in Revisions & Diff before updating. Preserves existing budget ({project.budget} {project.currency}), Cost Planning, Design Studio alternatives, and Reviews.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <select
                        value={applyMode}
                        onChange={(e) =>
                          setApplyMode(e.target.value as 'merge-append' | 'replace-geometry')
                        }
                        className="py-2 px-3 text-xs bg-white border border-slate-200 rounded-lg font-medium text-slate-800"
                      >
                        <option value="merge-append">
                          Merge & Append Spaces (Keep Existing {project.floorPlan?.rooms?.length || 0} Rooms)
                        </option>
                        <option value="replace-geometry">
                          Replace Floor Plan Geometry (Keep All Other Project Data)
                        </option>
                      </select>

                      <button
                        onClick={handleApplyToExistingProject}
                        disabled={isApplying}
                        className="px-4 py-2 bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
                      >
                        Apply to "{project.name}"
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Grid: Spatial Hierarchy & Mapped Spaces Table */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Spatial Structure Tree (4 cols) */}
                <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-teal-700" />
                      <h3 className="text-sm font-bold text-slate-900">
                        IFC Spatial Hierarchy
                      </h3>
                    </div>
                    <span className="text-[11px] font-mono text-slate-400">
                      IfcRelAggregates
                    </span>
                  </div>

                  <div className="text-xs space-y-2.5 font-mono">
                    {intermediateModel.spatialHierarchy.project && (
                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                        <div className="text-[10px] font-bold text-teal-700">
                          IFCPROJECT (#{intermediateModel.spatialHierarchy.project.stepId})
                        </div>
                        <div className="font-sans font-bold text-slate-900">
                          {intermediateModel.spatialHierarchy.project.name}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          GlobalId: {intermediateModel.spatialHierarchy.project.globalId}
                        </div>
                      </div>
                    )}

                    {intermediateModel.spatialHierarchy.site && (
                      <div className="pl-3 border-l-2 border-slate-200 space-y-2">
                        <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                          <div className="text-[10px] font-bold text-slate-600">
                            IFCSITE (#{intermediateModel.spatialHierarchy.site.stepId})
                          </div>
                          <div className="font-sans font-semibold text-slate-800">
                            {intermediateModel.spatialHierarchy.site.name}
                          </div>
                        </div>
                      </div>
                    )}

                    {intermediateModel.spatialHierarchy.building && (
                      <div className="pl-6 border-l-2 border-slate-200 space-y-2">
                        <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                          <div className="text-[10px] font-bold text-slate-600">
                            IFCBUILDING (#{intermediateModel.spatialHierarchy.building.stepId})
                          </div>
                          <div className="font-sans font-semibold text-slate-800">
                            {intermediateModel.spatialHierarchy.building.name}
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="pl-9 space-y-2">
                      {intermediateModel.spatialHierarchy.storeys.map((st) => (
                        <div
                          key={st.stepId}
                          className="p-2.5 rounded-lg bg-teal-50/50 border border-teal-200"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-teal-800">
                              IFCBUILDINGSTOREY (#{st.stepId})
                            </span>
                            <span className="text-[10px] font-sans font-bold px-1.5 py-0.5 bg-teal-100 text-teal-900 rounded">
                              → Floor {st.mappedFloorLevel}
                            </span>
                          </div>
                          <div className="font-sans font-bold text-slate-900 mt-0.5">
                            {st.name}
                          </div>
                          <div className="text-[11px] font-sans text-slate-600 mt-0.5">
                            Elev: {st.elevationInTargetUnits} {mappingResult.targetUnit} ·{' '}
                            {st.spaceStepIds.length} space(s) · {st.containedElementStepIds.length} element(s)
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Mapped Spaces & Structural Elements Preview (8 cols) */}
                <div className="lg:col-span-8 bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        Mapped Editable Spaces & Structural Elements
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        Source IFC identifiers are preserved separately from Plotify internal IDs.
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-teal-800 bg-teal-50 px-2.5 py-1 rounded-md border border-teal-200">
                      {mappingResult.mappedRooms.length} Spaces · {mappingResult.mappedColumns.length} Columns
                    </span>
                  </div>

                  {mappingResult.mappedRooms.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold">
                            <th className="py-2.5 px-3">Space Name</th>
                            <th className="py-2.5 px-3">Plotify Type</th>
                            <th className="py-2.5 px-3">Floor</th>
                            <th className="py-2.5 px-3 text-right">Origin (X, Y)</th>
                            <th className="py-2.5 px-3 text-right">Size (W × L)</th>
                            <th className="py-2.5 px-3 text-right">Area</th>
                            <th className="py-2.5 px-3">Source GlobalId</th>
                            <th className="py-2.5 px-3">Plotify ID</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {mappingResult.mappedRooms.map((rm) => {
                            const idMap = mappingResult.idMappings.find(
                              (m) => m.plotifyEntityId === rm.id
                            );
                            const unitShort = mappingResult.targetUnit === 'feet' ? 'ft' : 'm';
                            const areaShort = mappingResult.targetUnit === 'feet' ? 'sq ft' : 'm²';
                            return (
                              <tr key={rm.id} className="hover:bg-slate-50/80">
                                <td className="py-2.5 px-3 font-bold text-slate-900">
                                  {rm.name}
                                </td>
                                <td className="py-2.5 px-3 capitalize text-slate-700">
                                  {rm.type}
                                </td>
                                <td className="py-2.5 px-3 tabular-nums font-medium">
                                  Floor {rm.floorLevel}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono text-[11px]">
                                  ({rm.x}, {rm.y}) {unitShort}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-800">
                                  {rm.width} × {rm.length} {unitShort}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono text-teal-800 font-semibold">
                                  {(rm.width * rm.length).toFixed(1)} {areaShort}
                                </td>
                                <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                                  {idMap?.sourceGlobalId || '—'} (#{idMap?.sourceStepId})
                                </td>
                                <td className="py-2.5 px-3 font-mono text-[11px] text-teal-700">
                                  {rm.id}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="p-6 text-center bg-amber-50/60 border border-amber-200 rounded-lg text-xs text-amber-900">
                      No axis-aligned rectangular <code className="font-mono">IfcSpace</code> entities were found in this file. Plotify does not fabricate fake room geometry from unmapped meshes.
                    </div>
                  )}

                  {/* Data Integrity 4-Tier Preservation Breakdown */}
                  <div className="pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="p-3 rounded-lg bg-emerald-50/50 border border-emerald-200 space-y-1">
                      <div className="font-bold text-emerald-950">
                        1. Imported & Editable ({mappingResult.report.preservationBreakdown.importedAndEditable.length})
                      </div>
                      <ul className="text-[11px] text-emerald-900 space-y-0.5 pl-4 list-disc max-h-28 overflow-y-auto">
                        {mappingResult.report.preservationBreakdown.importedAndEditable.map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="p-3 rounded-lg bg-sky-50/50 border border-sky-200 space-y-1">
                      <div className="font-bold text-sky-950">
                        2. Imported Read-Only Metadata ({mappingResult.report.preservationBreakdown.importedNotEditable.length})
                      </div>
                      <ul className="text-[11px] text-sky-900 space-y-0.5 pl-4 list-disc max-h-28 overflow-y-auto">
                        {mappingResult.report.preservationBreakdown.importedNotEditable.length > 0 ? (
                          mappingResult.report.preservationBreakdown.importedNotEditable.map((item, i) => (
                            <li key={i}>{item}</li>
                          ))
                        ) : (
                          <li>None in this file</li>
                        )}
                      </ul>
                    </div>

                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                      <div className="font-bold text-slate-900">
                        3. Transformed or Normalized ({mappingResult.report.preservationBreakdown.transformedOrNormalized.length})
                      </div>
                      <ul className="text-[11px] text-slate-700 space-y-0.5 pl-4 list-disc max-h-28 overflow-y-auto">
                        {mappingResult.report.preservationBreakdown.transformedOrNormalized.map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="p-3 rounded-lg bg-amber-50/50 border border-amber-200 space-y-1">
                      <div className="font-bold text-amber-950">
                        4. Omitted / Unsupported ({mappingResult.report.preservationBreakdown.omittedUnsupported.length})
                      </div>
                      <ul className="text-[11px] text-amber-900 space-y-0.5 pl-4 list-disc max-h-28 overflow-y-auto">
                        {mappingResult.report.preservationBreakdown.omittedUnsupported.length > 0 ? (
                          mappingResult.report.preservationBreakdown.omittedUnsupported.map((item, i) => (
                            <li key={i}>{item}</li>
                          ))
                        ) : (
                          <li>Zero unsupported entities encountered</li>
                        )}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* Warnings & Notices Register */}
              {mappingResult.report.warnings.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      <h3 className="text-sm font-bold text-slate-900">
                        Import Warnings, Unsupported Entities & Normalization Log ({mappingResult.report.warnings.length})
                      </h3>
                    </div>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {mappingResult.report.warnings.map((w) => (
                      <div
                        key={w.id}
                        className={`p-3 rounded-lg border text-xs flex items-start justify-between gap-3 ${
                          w.severity === 'warning'
                            ? 'bg-amber-50/70 border-amber-200 text-amber-950'
                            : 'bg-slate-50 border-slate-200 text-slate-700'
                        }`}
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-white border border-slate-200">
                              {w.code}
                            </span>
                            {w.ifcType && (
                              <span className="font-mono text-[11px] font-semibold text-teal-800">
                                {w.ifcType} {w.stepId ? `#${w.stepId}` : ''}
                              </span>
                            )}
                          </div>
                          <p className="mt-1">{w.message}</p>
                          {w.remedy && (
                            <p className="text-[11px] text-slate-500 italic">
                              Remedy: {w.remedy}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          TAB 2: EXPORT IFC & ROUND-TRIP VERIFICATION
      ===================================================================== */}
      {activeSubTab === 'export' && (
        <div className="space-y-6">
          {!project ? (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center space-y-3">
              <FileCode className="w-8 h-8 text-slate-400 mx-auto" />
              <h3 className="text-base font-bold text-slate-900">No Active Project Selected</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Select an existing project from the Projects list or import an IFC model first to export supported Plotify building information to IFC4 or IFC2X3.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Export Options Panel */}
                <div className="lg:col-span-6 bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <Download className="w-4 h-4 text-teal-700" />
                      <h2 className="text-sm font-bold text-slate-900">
                        Export "{project.name}" to ISO 10303-21 IFC
                      </h2>
                    </div>
                    <span className="text-xs font-mono text-slate-500">
                      Unit: {project.unit}
                    </span>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Target IFC Schema Version
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {(['IFC4', 'IFC2X3'] as SupportedIFCSchema[]).map((sch) => (
                          <button
                            key={sch}
                            type="button"
                            onClick={() =>
                              setExportOptions((prev) => ({ ...prev, schemaVersion: sch }))
                            }
                            className={`py-2 px-3 rounded-lg font-bold border transition-all cursor-pointer ${
                              exportOptions.schemaVersion === sch
                                ? 'bg-teal-50 text-teal-900 border-teal-500 ring-1 ring-teal-500'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            {sch} (Coordination View)
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2 pt-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={exportOptions.includePerimeterWallsAndSlabs}
                          onChange={(e) =>
                            setExportOptions((prev) => ({
                              ...prev,
                              includePerimeterWallsAndSlabs: e.target.checked,
                            }))
                          }
                          className="rounded border-slate-300 text-teal-600"
                        />
                        <span className="text-slate-700 font-medium">
                          Export parametric <code className="font-mono text-[11px]">IfcSlab</code> & <code className="font-mono text-[11px]">IfcWallStandardCase</code> per space
                        </span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={exportOptions.includeStructuralElements}
                          onChange={(e) =>
                            setExportOptions((prev) => ({
                              ...prev,
                              includeStructuralElements: e.target.checked,
                            }))
                          }
                          className="rounded border-slate-300 text-teal-600"
                        />
                        <span className="text-slate-700 font-medium">
                          Export structural <code className="font-mono text-[11px]">IfcColumn</code> & <code className="font-mono text-[11px]">IfcBeam</code> framing
                        </span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={exportOptions.includePropertySets}
                          onChange={(e) =>
                            setExportOptions((prev) => ({
                              ...prev,
                              includePropertySets: e.target.checked,
                            }))
                          }
                          className="rounded border-slate-300 text-teal-600"
                        />
                        <span className="text-slate-700 font-medium">
                          Include <code className="font-mono text-[11px]">Pset_SpaceCommon</code> & <code className="font-mono text-[11px]">Pset_SiteCommon</code>
                        </span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={exportOptions.includeBaseQuantities}
                          onChange={(e) =>
                            setExportOptions((prev) => ({
                              ...prev,
                              includeBaseQuantities: e.target.checked,
                            }))
                          }
                          className="rounded border-slate-300 text-teal-600"
                        />
                        <span className="text-slate-700 font-medium">
                          Include <code className="font-mono text-[11px]">Qto_SpaceBaseQuantities</code> (NetFloorArea, Width, Length, Height, GrossVolume)
                        </span>
                      </label>
                    </div>

                    <div className="pt-3 flex flex-wrap items-center gap-2.5">
                      <button
                        onClick={handleGenerateExport}
                        className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors"
                      >
                        <FileCode className="w-4 h-4 text-teal-400" />
                        <span>Generate & Validate IFC</span>
                      </button>

                      <button
                        onClick={handleRunRoundTripCheck}
                        className="px-4 py-2.5 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors"
                      >
                        <RefreshCw className="w-4 h-4" />
                        <span>Verify Round-Trip Integrity</span>
                      </button>

                      {exportedContent && exportReport && (
                        <button
                          onClick={handleDownloadIFC}
                          className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors"
                        >
                          <Download className="w-4 h-4" />
                          <span>Download {exportReport.fileName}</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Export Validation & Omitted Data Report */}
                <div className="lg:col-span-6 bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <h3 className="text-sm font-bold text-slate-900">
                      Schema Validation & Honest Loss Report
                    </h3>
                    {exportReport && (
                      <span
                        className={`px-2 py-0.5 text-[10px] font-bold rounded border ${
                          exportReport.validationResult.isValid
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : 'bg-rose-50 text-rose-800 border-rose-200'
                        }`}
                      >
                        {exportReport.validationResult.isValid
                          ? 'STEP Schema & Ref Check PASSED'
                          : 'Validation Failed'}
                      </span>
                    )}
                  </div>

                  {exportReport ? (
                    <div className="space-y-4 text-xs">
                      <div className="grid grid-cols-3 gap-2">
                        <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                          <div className="text-[10px] text-slate-400 font-bold uppercase">
                            Entities Written
                          </div>
                          <div className="text-sm font-bold text-slate-900 tabular-nums">
                            {exportReport.totalEntitiesWritten}
                          </div>
                        </div>
                        <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                          <div className="text-[10px] text-slate-400 font-bold uppercase">
                            Spaces / Storeys
                          </div>
                          <div className="text-sm font-bold text-slate-900 tabular-nums">
                            {exportReport.exportedCounts.spaces} / {exportReport.exportedCounts.storeys}
                          </div>
                        </div>
                        <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                          <div className="text-[10px] text-slate-400 font-bold uppercase">
                            Unresolved Refs
                          </div>
                          <div className="text-sm font-bold text-emerald-700 tabular-nums">
                            {exportReport.validationResult.unresolvedReferences.length}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <div className="font-bold text-slate-800">
                          Information Not Exported to Coordination-View IFC:
                        </div>
                        {exportReport.omittedPlotifyInformation.map((item, idx) => (
                          <div
                            key={idx}
                            className="p-2.5 rounded-lg bg-amber-50/60 border border-amber-200 text-[11px] text-amber-950"
                          >
                            <strong>{item.domain}:</strong> {item.reason}
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center justify-between pt-2">
                        <span className="text-[11px] font-mono text-slate-500">
                          Checksum: {exportReport.checksum} · {(exportReport.fileSizeBytes / 1024).toFixed(1)} KB
                        </span>
                        <button
                          onClick={() => setShowRawStepPreview((p) => !p)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:underline cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>{showRawStepPreview ? 'Hide STEP File' : 'Inspect Raw STEP File'}</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">
                      Click "Generate & Validate IFC" or "Verify Round-Trip Integrity" to produce a standards-compliant STEP file and inspect the validation report.
                    </p>
                  )}
                </div>
              </div>

              {/* Raw STEP File Preview */}
              {showRawStepPreview && exportedContent && (
                <div className="bg-slate-900 text-slate-100 rounded-xl p-4 font-mono text-[11px] overflow-x-auto max-h-80">
                  <pre>{exportedContent}</pre>
                </div>
              )}

              {/* Round-Trip Verification Results Table */}
              {roundTripResult && (
                <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        Round-Trip Comparison Report (Export → Re-Import → Compare)
                      </h3>
                      <p className="text-xs text-slate-500">
                        Compares source Plotify spaces against re-imported IFC spaces by stable GlobalId, floor assignment, width, length, and net area (tolerance ±{roundTripResult.toleranceUsed} {project.unit}).
                      </p>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-md text-xs font-bold border ${
                        roundTripResult.passed
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-rose-50 text-rose-800 border-rose-200'
                      }`}
                    >
                      {roundTripResult.passed ? 'ROUND-TRIP VERIFIED' : 'DISCREPANCIES FOUND'}
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold">
                          <th className="py-2 px-3">Space Name</th>
                          <th className="py-2 px-3">GlobalId Preserved</th>
                          <th className="py-2 px-3">Floor (Src → Re)</th>
                          <th className="py-2 px-3 text-right">Width (Src → Re)</th>
                          <th className="py-2 px-3 text-right">Length (Src → Re)</th>
                          <th className="py-2 px-3 text-right">Area Δ</th>
                          <th className="py-2 px-3 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {roundTripResult.spaceComparisons.map((sc, i) => (
                          <tr key={i}>
                            <td className="py-2 px-3 font-bold text-slate-900">{sc.name}</td>
                            <td className="py-2 px-3 font-mono text-[11px] text-slate-600">
                              {sc.sourceGlobalId} ({sc.globalIdPreserved ? '✓' : '✗'})
                            </td>
                            <td className="py-2 px-3 tabular-nums">
                              {sc.sourceFloor} → {sc.reimportedFloor}
                            </td>
                            <td className="py-2 px-3 text-right font-mono">
                              {sc.sourceWidth} → {sc.reimportedWidth}
                            </td>
                            <td className="py-2 px-3 text-right font-mono">
                              {sc.sourceLength} → {sc.reimportedLength}
                            </td>
                            <td className="py-2 px-3 text-right font-mono">
                              {sc.areaDelta.toFixed(3)}
                            </td>
                            <td className="py-2 px-3 text-center">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  sc.withinTolerance
                                    ? 'bg-emerald-50 text-emerald-800'
                                    : 'bg-rose-50 text-rose-800'
                                }`}
                              >
                                {sc.withinTolerance ? 'MATCH' : 'DELTA'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* =====================================================================
          TAB 3: SUPPORT PROFILE & PROVENANCE LEDGER
      ===================================================================== */}
      {activeSubTab === 'profile' && (
        <div className="space-y-6">
          {/* Active Project Provenance Ledger (if present) */}
          {project?.ifcInterop && (
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-teal-700" />
                  <h3 className="text-sm font-bold text-slate-900">
                    Active Project IFC Provenance & ID Mapping Ledger ({project.name})
                  </h3>
                </div>
                <span className="text-xs font-semibold text-teal-800 bg-teal-50 px-2.5 py-0.5 rounded border border-teal-200">
                  {project.ifcInterop.idMappings.length} Tracked ID Mappings
                </span>
              </div>

              <div className="overflow-x-auto max-h-64">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold">
                      <th className="py-2 px-3">STEP #ID</th>
                      <th className="py-2 px-3">Source IFC GlobalId</th>
                      <th className="py-2 px-3">IFC Entity Type</th>
                      <th className="py-2 px-3">Source Name</th>
                      <th className="py-2 px-3">Plotify Target Type</th>
                      <th className="py-2 px-3">Plotify Internal ID</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {project.ifcInterop.idMappings.map((m, i) => (
                      <tr key={i}>
                        <td className="py-2 px-3 font-mono text-[11px]">#{m.sourceStepId}</td>
                        <td className="py-2 px-3 font-mono text-[11px] text-slate-700">
                          {m.sourceGlobalId}
                        </td>
                        <td className="py-2 px-3 font-mono text-[11px] font-bold text-teal-800">
                          {m.sourceIfcType}
                        </td>
                        <td className="py-2 px-3 font-medium text-slate-900">{m.sourceName}</td>
                        <td className="py-2 px-3 capitalize text-slate-600">{m.plotifyEntityType}</td>
                        <td className="py-2 px-3 font-mono text-[11px] text-teal-700">
                          {m.plotifyEntityId}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Full Declared Profile Specification */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-5">
            <div className="pb-3 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900">{profile.profileName}</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Profile ID: <code className="font-mono">{profile.profileId}</code> · Version {profile.profileVersion}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
              <div className="space-y-2">
                <div className="font-bold text-slate-900">Supported & Rejected Schemas</div>
                <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-lg">
                  <strong>Supported Schemas:</strong> {profile.supportedSchemas.join(', ')}
                </div>
                <div className="p-3 bg-rose-50/60 border border-rose-200 rounded-lg">
                  <strong>Explicitly Rejected Schemas:</strong> {profile.rejectedSchemas.join(', ')}
                </div>
              </div>

              <div className="space-y-2">
                <div className="font-bold text-slate-900">Supported Units & Exact Conversion Factors</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[11px] border border-slate-200 rounded-lg">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="py-1.5 px-2.5">Source Unit</th>
                        <th className="py-1.5 px-2.5 text-right">To Metres (m)</th>
                        <th className="py-1.5 px-2.5 text-right">To Feet (ft)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {profile.unitConversionRules.map((u) => (
                        <tr key={u.sourceUnit}>
                          <td className="py-1.5 px-2.5 font-bold">{u.sourceUnit}</td>
                          <td className="py-1.5 px-2.5 text-right">{u.toMetresFactor}</td>
                          <td className="py-1.5 px-2.5 text-right">{u.toFeetFactor.toFixed(6)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-2">
                <div className="font-bold text-slate-900">Supported Geometry Representations</div>
                <ul className="pl-4 list-disc space-y-1 text-slate-700">
                  {profile.supportedGeometryRepresentations.map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
              </div>

              <div className="space-y-2">
                <div className="font-bold text-slate-900">Unsupported Geometry Representations (Flagged)</div>
                <ul className="pl-4 list-disc space-y-1 text-slate-700">
                  {profile.unsupportedGeometryRepresentations.map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 space-y-2 text-xs">
              <div className="font-bold text-slate-900">Known Architectural & Model Limitations</div>
              <ul className="pl-4 list-disc space-y-1 text-slate-600">
                {profile.knownLimitations.map((lim, i) => (
                  <li key={i}>{lim}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
