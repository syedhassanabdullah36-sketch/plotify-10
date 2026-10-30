/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  ArrowLeft,
  Layers,
  Thermometer,
  Sun,
  Droplets,
  Wind,
  Sliders,
  FileText,
  Save,
  RefreshCw,
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Info,
  Download,
  History,
  Leaf,
  CloudRain,
  Compass,
  FileCode2,
} from 'lucide-react';
import { Project } from '../../types/project';
import {
  EnvelopeAssemblyRecord,
  EnvelopeCavityVentilationState,
  EnvelopeElementCategory,
  EnvelopeLayerRecord,
  EnvelopeOrientation,
  EnvelopePerformanceAssessment,
} from '../../types/envelope';
import {
  AUTHORITATIVE_ENVELOPE_MATERIALS,
  REGIONAL_ENVELOPE_SCREENING_BENCHMARKS,
  applyEnvelopeAssessmentToProject,
  buildImprovedEnvelopeScenarioPreview,
  checkEnvelopeAssessmentStaleness,
  createInitialEnvelopeAssessment,
  exportEnvelopeAssessmentReport,
  getEnvelopeAssessmentProfile,
  recomputeEnvelopeAssessment,
} from '../../services/envelopeService';

interface EnvelopePerformanceWorkspaceProps {
  project: Project;
  onUpdateProject: (updated: Project) => void;
  onBack: () => void;
  onOpenSiteContext?: (project: Project) => void;
  onOpenCarbon?: (project: Project) => void;
  onOpenClimateResilience?: (project: Project) => void;
  onOpenIFC?: (project: Project) => void;
  onOpenVersionWorkspace?: (project: Project) => void;
  onShowToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

type WorkspaceStage =
  | 'inventory'
  | 'builder'
  | 'thermal'
  | 'glazing-solar'
  | 'moisture-airtightness'
  | 'scenarios'
  | 'findings-report';

export const EnvelopePerformanceWorkspace: React.FC<EnvelopePerformanceWorkspaceProps> = ({
  project,
  onUpdateProject,
  onBack,
  onOpenSiteContext,
  onOpenCarbon,
  onOpenClimateResilience,
  onOpenIFC,
  onOpenVersionWorkspace,
  onShowToast,
}) => {
  const profile = useMemo(() => getEnvelopeAssessmentProfile(), []);

  const [draftAssessment, setDraftAssessment] = useState<EnvelopePerformanceAssessment>(() => {
    if (project.envelopePerformance?.activeAssessment) {
      return recomputeEnvelopeAssessment(project, project.envelopePerformance.activeAssessment);
    }
    return createInitialEnvelopeAssessment(project);
  });

  const [activeStage, setActiveStage] = useState<WorkspaceStage>('inventory');
  const [selectedAssemblyId, setSelectedAssemblyId] = useState<string>(
    () => draftAssessment.assemblies[0]?.assemblyId || ''
  );
  const [selectedCatalogMaterialId, setSelectedCatalogMaterialId] = useState<string>(
    AUTHORITATIVE_ENVELOPE_MATERIALS[0].materialId
  );
  const [findingCategoryFilter, setFindingCategoryFilter] = useState<string>('all');
  const [exportPreviewFormat, setExportPreviewFormat] = useState<'markdown' | 'json' | 'csv'>('markdown');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(
    !project.envelopePerformance?.activeAssessment
  );

  // Sync if project switches
  useEffect(() => {
    if (project.envelopePerformance?.activeAssessment) {
      const recomputed = recomputeEnvelopeAssessment(
        project,
        project.envelopePerformance.activeAssessment
      );
      setDraftAssessment(recomputed);
      setSelectedAssemblyId((prev) =>
        recomputed.assemblies.some((a) => a.assemblyId === prev)
          ? prev
          : recomputed.assemblies[0]?.assemblyId || ''
      );
      setHasUnsavedChanges(false);
    } else {
      const initial = createInitialEnvelopeAssessment(project);
      setDraftAssessment(initial);
      setSelectedAssemblyId(initial.assemblies[0]?.assemblyId || '');
      setHasUnsavedChanges(true);
    }
  }, [project.id]);

  const staleness = useMemo(
    () => checkEnvelopeAssessmentStaleness(project, draftAssessment),
    [project, draftAssessment]
  );

  const selectedAssembly = useMemo(
    () =>
      draftAssessment.assemblies.find((a) => a.assemblyId === selectedAssemblyId) ||
      draftAssessment.assemblies[0] ||
      null,
    [draftAssessment.assemblies, selectedAssemblyId]
  );

  const activeBenchmark = useMemo(
    () =>
      REGIONAL_ENVELOPE_SCREENING_BENCHMARKS.find(
        (b) => b.benchmarkId === draftAssessment.activeBenchmarkId
      ) || REGIONAL_ENVELOPE_SCREENING_BENCHMARKS[0],
    [draftAssessment.activeBenchmarkId]
  );

  const improvedPreview = useMemo(
    () => buildImprovedEnvelopeScenarioPreview(project, draftAssessment),
    [project, draftAssessment]
  );

  const updateDraft = (updater: (prev: EnvelopePerformanceAssessment) => EnvelopePerformanceAssessment) => {
    setDraftAssessment((prev) => {
      const nextRaw = updater(prev);
      return recomputeEnvelopeAssessment(project, nextRaw);
    });
    setHasUnsavedChanges(true);
  };

  const handleSaveToProject = (saveAsScenario: boolean = false) => {
    const updatedProject = applyEnvelopeAssessmentToProject(project, draftAssessment, {
      saveAsScenario,
    });
    onUpdateProject(updatedProject);
    setDraftAssessment(updatedProject.envelopePerformance!.activeAssessment);
    setHasUnsavedChanges(false);
    onShowToast?.(
      saveAsScenario
        ? 'Envelope assessment saved to project and archived as a named scenario.'
        : 'Building Envelope Performance assessment saved with pre-apply version snapshot.',
      'success'
    );
  };

  const handleRebuildFromGeometry = () => {
    const fresh = createInitialEnvelopeAssessment(project, draftAssessment.assessmentName);
    setDraftAssessment(fresh);
    setSelectedAssemblyId(fresh.assemblies[0]?.assemblyId || '');
    setHasUnsavedChanges(true);
    onShowToast?.('Re-synchronized envelope assembly inventory from current project geometry.', 'info');
  };

  const handleDownloadExport = (format: 'json' | 'csv' | 'markdown') => {
    const content = exportEnvelopeAssessmentReport(project, draftAssessment, format);
    const ext = format === 'markdown' ? 'md' : format;
    const mime =
      format === 'json'
        ? 'application/json'
        : format === 'csv'
          ? 'text/csv'
          : 'text/markdown';
    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-envelope-p46.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    onShowToast?.(`Exported envelope performance report as ${ext.toUpperCase()}.`, 'success');
  };

  const handleUpdateAssembly = (
    assemblyId: string,
    patch: Partial<EnvelopeAssemblyRecord>
  ) => {
    updateDraft((prev) => ({
      ...prev,
      assemblies: prev.assemblies.map((a) =>
        a.assemblyId === assemblyId ? { ...a, ...patch, provenance: 'project-defined' } : a
      ),
    }));
  };

  const handleAddLayerFromCatalog = () => {
    if (!selectedAssembly) return;
    const catMat = AUTHORITATIVE_ENVELOPE_MATERIALS.find(
      (m) => m.materialId === selectedCatalogMaterialId
    );
    if (!catMat) return;

    const nextOrder = selectedAssembly.layers.length + 1;
    const newLayer: EnvelopeLayerRecord = {
      layerId: `${selectedAssembly.assemblyId}-layer-${Date.now()}`,
      orderIndex: nextOrder,
      name: catMat.name,
      materialCategory: catMat.category,
      thicknessMm: catMat.category === 'membrane-vapour-control' ? 1 : catMat.category === 'insulation' ? 100 : 50,
      thermalConductivityWPerMK: catMat.thermalConductivityWPerMK,
      fixedThermalResistanceM2KPerW: catMat.fixedThermalResistanceM2KPerW ?? null,
      cavityVentilation: catMat.category === 'air-cavity' ? 'unventilated' : 'none',
      densityKgPerM3: catMat.densityKgPerM3,
      specificHeatJPerKgK: catMat.specificHeatJPerKgK,
      vapourResistanceFactorMu: catMat.vapourResistanceFactorMu ?? null,
      explicitSdValueM: catMat.explicitSdValueM ?? null,
      linkedP44CarbonFactorId: catMat.linkedP44CarbonFactorId,
      sourceNote: catMat.sourceReference,
    };

    handleUpdateAssembly(selectedAssembly.assemblyId, {
      layers: [...selectedAssembly.layers, newLayer],
    });
  };

  const handleUpdateLayer = (
    assemblyId: string,
    layerId: string,
    patch: Partial<EnvelopeLayerRecord>
  ) => {
    const target = draftAssessment.assemblies.find((a) => a.assemblyId === assemblyId);
    if (!target) return;
    handleUpdateAssembly(assemblyId, {
      layers: target.layers.map((l) => (l.layerId === layerId ? { ...l, ...patch } : l)),
    });
  };

  const handleDeleteLayer = (assemblyId: string, layerId: string) => {
    const target = draftAssessment.assemblies.find((a) => a.assemblyId === assemblyId);
    if (!target) return;
    const remaining = target.layers
      .filter((l) => l.layerId !== layerId)
      .map((l, idx) => ({ ...l, orderIndex: idx + 1 }));
    handleUpdateAssembly(assemblyId, { layers: remaining });
  };

  const handleApplyImprovedScenarioToDraft = () => {
    setDraftAssessment({
      ...improvedPreview,
      assessmentId: draftAssessment.assessmentId,
      assessmentName: `${draftAssessment.assessmentName} (Upgraded)`,
    });
    setHasUnsavedChanges(true);
    onShowToast?.('Applied selected envelope improvements to active draft assessment.', 'success');
  };

  const stages: Array<{ id: WorkspaceStage; label: string; icon: React.ElementType }> = [
    { id: 'inventory', label: '1. Envelope Inventory', icon: Layers },
    { id: 'builder', label: '2. Assembly Builder', icon: Sliders },
    { id: 'thermal', label: '3. Thermal & Bridges', icon: Thermometer },
    { id: 'glazing-solar', label: '4. Glazing & Solar', icon: Sun },
    { id: 'moisture-airtightness', label: '5. Moisture & Air', icon: Droplets },
    { id: 'scenarios', label: '6. Scenarios & Carbon', icon: Leaf },
    { id: 'findings-report', label: '7. Findings & Report', icon: FileText },
  ];

  const s = draftAssessment.summary;
  const bs = draftAssessment.bridgeSummary;

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      {/* Top Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Project</span>
            </button>
            <span className="text-slate-300" aria-hidden="true">·</span>
            <span className="text-xs font-medium text-slate-500">
              Profile: {profile.profileId} (ISO 6946 / ISO 13788 / ISO 10077-1)
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Building Envelope Performance Analyzer — {project.name}
          </h1>
          <p className="text-xs text-slate-500">
            Deterministic assembly R/U-value evaluation, glazing & solar screening, linear/point thermal bridges, ISO 13788 dew-point & Glaser diffusion checks, and P44 embodied carbon trade-offs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onOpenSiteContext && (
            <button
              onClick={() => onOpenSiteContext(project)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              <Compass className="w-3.5 h-3.5 text-teal-700" />
              <span>Site & Orientation</span>
            </button>
          )}
          {onOpenClimateResilience && (
            <button
              onClick={() => onOpenClimateResilience(project)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              <CloudRain className="w-3.5 h-3.5 text-sky-700" />
              <span>P45 Climate Hazards</span>
            </button>
          )}
          {onOpenCarbon && (
            <button
              onClick={() => onOpenCarbon(project)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              <Leaf className="w-3.5 h-3.5 text-emerald-700" />
              <span>P44 Carbon</span>
            </button>
          )}
          {onOpenVersionWorkspace && (
            <button
              onClick={() => onOpenVersionWorkspace(project)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              <History className="w-3.5 h-3.5 text-slate-600" />
              <span>Snapshots</span>
            </button>
          )}
          <button
            onClick={() => handleSaveToProject(false)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            <Save className="w-3.5 h-3.5 text-teal-400" />
            <span>{hasUnsavedChanges ? 'Save Envelope Assessment' : 'Saved to Project'}</span>
          </button>
        </div>
      </div>

      {/* Staleness Warning Banner */}
      {staleness.isStale && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs text-amber-900">
              <div className="font-bold">Upstream Project Geometry or Climate Context Changed</div>
              <ul className="list-disc list-inside text-amber-800 space-y-0.5">
                {staleness.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          </div>
          <button
            onClick={handleRebuildFromGeometry}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-950 bg-amber-200/80 hover:bg-amber-300/80 rounded-lg transition-colors cursor-pointer shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Re-Synchronize Inventory</span>
          </button>
        </div>
      )}

      {/* Non-Statutory Screening & Steady-State Scope Banner */}
      <div className="bg-slate-900 text-slate-100 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="text-xs font-semibold text-teal-300">
            Methodological Governance · Non-Statutory Screening · Steady-State Physics
          </div>
          <p className="text-xs text-slate-300 leading-relaxed max-w-4xl">
            {profile.statutoryComplianceDisclaimer} {profile.dynamicSimulationDisclaimer}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 shrink-0">
          <label className="text-xs text-slate-300 font-medium">Screening Benchmark:</label>
          <select
            value={draftAssessment.activeBenchmarkId}
            onChange={(e) =>
              updateDraft((prev) => ({ ...prev, activeBenchmarkId: e.target.value }))
            }
            className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-hidden focus:border-teal-400"
          >
            {REGIONAL_ENVELOPE_SCREENING_BENCHMARKS.map((b) => (
              <option key={b.benchmarkId} value={b.benchmarkId}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Key Metrics Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <div className="text-xs text-slate-500 font-medium">Net Envelope Area</div>
          <div className="text-lg font-bold text-slate-900 tabular-nums mt-1">
            {s.totalNetEnvelopeAreaM2.toFixed(1)} m²
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            Gross {s.totalGrossEnvelopeAreaM2.toFixed(1)} m² · WWR {s.overallWindowToWallRatioPercent ?? 0}%
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <div className="text-xs text-slate-500 font-medium">Mean U-Value (1D)</div>
          <div className="text-lg font-bold text-slate-900 tabular-nums mt-1">
            {s.areaWeightedEnvelopeUWPerM2K !== null
              ? `${s.areaWeightedEnvelopeUWPerM2K.toFixed(3)} W/m²K`
              : 'Incomplete'}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            Wall {s.areaWeightedOpaqueWallUWPerM2K?.toFixed(2) ?? '—'} · Roof {s.areaWeightedRoofUWPerM2K?.toFixed(2) ?? '—'}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <div className="text-xs text-slate-500 font-medium">Effective U (with Bridges)</div>
          <div className="text-lg font-bold text-teal-800 tabular-nums mt-1">
            {s.effectiveEnvelopeUWithBridgesWPerM2K !== null
              ? `${s.effectiveEnvelopeUWithBridgesWPerM2K.toFixed(3)} W/m²K`
              : 'Incomplete'}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            Bridge ΔU +{bs.equivalentDeltaUWPerM2K?.toFixed(3) ?? '0.000'} W/m²K
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <div className="text-xs text-slate-500 font-medium">Heating Design Q_tr</div>
          <div className="text-lg font-bold text-slate-900 tabular-nums mt-1">
            {s.heatingDesignConductiveHeatLossW !== null
              ? `${s.heatingDesignConductiveHeatLossW.toFixed(0)} W`
              : '—'}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            H_tr {s.transmissionHeatTransferCoeffWPerK?.toFixed(1) ?? '—'} W/K · ΔT {s.heatingDesignDeltaTK} K
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <div className="text-xs text-slate-500 font-medium">Glazing Solar Gain Q_sol</div>
          <div className="text-lg font-bold text-amber-800 tabular-nums mt-1">
            {s.steadyStateSolarHeatGainW !== null
              ? `${s.steadyStateSolarHeatGainW.toFixed(0)} W`
              : 'Unavailable'}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            Mean SHGC {s.areaWeightedGlazingSHGC?.toFixed(2) ?? '—'} · Win U {s.areaWeightedGlazingUWPerM2K?.toFixed(2) ?? '—'}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <div className="text-xs text-slate-500 font-medium">Moisture & Findings</div>
          <div className="text-lg font-bold text-slate-900 tabular-nums mt-1">
            {draftAssessment.findings.length} Findings
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {draftAssessment.moistureRecords.filter((m) => m.status !== 'assessed-pass').length} Condensation/Mould Alerts
          </div>
        </div>
      </div>

      {/* Stage Navigation Tabs */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200 overflow-x-auto">
        {stages.map((st) => {
          const Icon = st.icon;
          const isActive = activeStage === st.id;
          return (
            <button
              key={st.id}
              onClick={() => setActiveStage(st.id)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-teal-700' : 'text-slate-400'}`} />
              <span>{st.label}</span>
            </button>
          );
        })}
      </div>

      {/* STAGE 1: ENVELOPE INVENTORY */}
      {activeStage === 'inventory' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  01. Building Envelope Assembly Inventory & Area Accounting
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Explicit accounting of gross surface area, subtracted window/door openings, and net thermal boundary area. Provenance distinguishes project-defined, IFC-imported, and illustrative templates.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {onOpenIFC && (
                  <button
                    onClick={() => onOpenIFC(project)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg cursor-pointer"
                  >
                    <FileCode2 className="w-3.5 h-3.5 text-teal-700" />
                    <span>OpenBIM / IFC</span>
                  </button>
                )}
                <button
                  onClick={handleRebuildFromGeometry}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Reset to Project Geometry</span>
                </button>
              </div>
            </div>

            {draftAssessment.extractionWarnings.length > 0 && (
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1 text-xs text-slate-600">
                <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-teal-700" />
                  <span>Provenance & Deduplication Notes</span>
                </div>
                <ul className="list-disc list-inside space-y-0.5">
                  {draftAssessment.extractionWarnings.map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold">
                    <th className="py-2.5 px-3">Assembly Name</th>
                    <th className="py-2.5 px-3">Category</th>
                    <th className="py-2.5 px-3">Orientation</th>
                    <th className="py-2.5 px-3">Boundary</th>
                    <th className="py-2.5 px-3 text-right">Gross Area (m²)</th>
                    <th className="py-2.5 px-3 text-right">Openings (m²)</th>
                    <th className="py-2.5 px-3 text-right">Net Area (m²)</th>
                    <th className="py-2.5 px-3 text-right">R_T (m²K/W)</th>
                    <th className="py-2.5 px-3 text-right">U (W/m²K)</th>
                    <th className="py-2.5 px-3">Provenance</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {draftAssessment.assemblies.map((asm) => {
                    const tr = asm.thermalResult;
                    const targetU = activeBenchmark.maxUValueByCategoryWPerM2K[asm.category];
                    const uExceeds =
                      tr?.uValueWPerM2K !== null &&
                      tr?.uValueWPerM2K !== undefined &&
                      targetU !== undefined &&
                      tr.uValueWPerM2K > targetU;

                    return (
                      <tr key={asm.assemblyId} className="hover:bg-slate-50/80">
                        <td className="py-3 px-3 font-semibold text-slate-900">
                          <div>{asm.name}</div>
                          <div className="text-[11px] text-slate-400 font-normal">
                            {asm.areaDerivationNote}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-slate-600">{asm.category}</td>
                        <td className="py-3 px-3 text-slate-700">{asm.orientation}</td>
                        <td className="py-3 px-3 text-slate-600">{asm.boundaryCondition}</td>
                        <td className="py-3 px-3 text-right tabular-nums">
                          <input
                            type="number"
                            min={0.1}
                            step={0.5}
                            value={asm.grossAreaM2}
                            onChange={(e) =>
                              handleUpdateAssembly(asm.assemblyId, {
                                grossAreaM2: Math.max(0, Number(e.target.value) || 0),
                              })
                            }
                            className="w-20 text-right px-2 py-1 bg-white border border-slate-200 rounded-md tabular-nums"
                          />
                        </td>
                        <td className="py-3 px-3 text-right tabular-nums">
                          <input
                            type="number"
                            min={0}
                            step={0.5}
                            value={asm.openingAreaSubtractedM2}
                            onChange={(e) =>
                              handleUpdateAssembly(asm.assemblyId, {
                                openingAreaSubtractedM2: Math.max(0, Number(e.target.value) || 0),
                              })
                            }
                            className="w-18 text-right px-2 py-1 bg-white border border-slate-200 rounded-md tabular-nums"
                          />
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-slate-900 tabular-nums">
                          {asm.netAreaM2.toFixed(2)}
                        </td>
                        <td className="py-3 px-3 text-right tabular-nums text-slate-700">
                          {tr?.totalResistanceRTM2KPerW !== null && tr?.totalResistanceRTM2KPerW !== undefined
                            ? tr.totalResistanceRTM2KPerW.toFixed(2)
                            : '—'}
                        </td>
                        <td
                          className={`py-3 px-3 text-right font-bold tabular-nums ${
                            tr?.uValueWPerM2K === null
                              ? 'text-red-600'
                              : uExceeds
                                ? 'text-amber-700'
                                : 'text-teal-800'
                          }`}
                        >
                          {tr?.uValueWPerM2K !== null && tr?.uValueWPerM2K !== undefined
                            ? tr.uValueWPerM2K.toFixed(3)
                            : tr?.status || 'Invalid'}
                        </td>
                        <td className="py-3 px-3 text-slate-500">{asm.provenance}</td>
                        <td className="py-3 px-3 text-right">
                          <button
                            onClick={() => {
                              setSelectedAssemblyId(asm.assemblyId);
                              setActiveStage(
                                asm.category === 'window-glazing' || asm.category === 'curtain-wall'
                                  ? 'glazing-solar'
                                  : 'builder'
                              );
                            }}
                            className="text-xs font-semibold text-teal-700 hover:text-teal-900 cursor-pointer"
                          >
                            Configure →
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* STAGE 2: ASSEMBLY BUILDER */}
      {activeStage === 'builder' && selectedAssembly && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Assembly Selector */}
          <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900">Select Envelope Assembly</h3>
            <div className="space-y-2">
              {draftAssessment.assemblies.map((asm) => {
                const isSelected = asm.assemblyId === selectedAssembly.assemblyId;
                const u = asm.thermalResult?.uValueWPerM2K;
                return (
                  <button
                    key={asm.assemblyId}
                    onClick={() => setSelectedAssemblyId(asm.assemblyId)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold truncate">{asm.name}</span>
                      <span
                        className={`text-xs font-mono shrink-0 ${
                          isSelected ? 'text-teal-300' : 'text-teal-800'
                        }`}
                      >
                        {u !== null && u !== undefined ? `U = ${u.toFixed(3)}` : 'Incomplete'}
                      </span>
                    </div>
                    <div
                      className={`text-[11px] mt-1 ${
                        isSelected ? 'text-slate-300' : 'text-slate-500'
                      }`}
                    >
                      {asm.category} · {asm.orientation} · Net {asm.netAreaM2.toFixed(1)} m²
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Column: Layer Editor & Formula Trace */}
          <div className="lg:col-span-8 bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-900">{selectedAssembly.name}</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Method: {selectedAssembly.thermalResult?.methodUsed} · Heat Flow: {selectedAssembly.heatFlowDirection} (R_si = {selectedAssembly.thermalResult?.RsiM2KPerW} / R_se = {selectedAssembly.thermalResult?.RseM2KPerW} m²K/W)
                </p>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-400">Calculated Transmittance</div>
                <div className="text-xl font-bold text-teal-800 tabular-nums">
                  {selectedAssembly.thermalResult?.uValueWPerM2K !== null &&
                  selectedAssembly.thermalResult?.uValueWPerM2K !== undefined
                    ? `${selectedAssembly.thermalResult.uValueWPerM2K.toFixed(3)} W/(m²·K)`
                    : 'Incomplete / Invalid'}
                </div>
              </div>
            </div>

            {/* Ground-Contact Floor Specific Controls (ISO 13370) */}
            {selectedAssembly.category === 'ground-contact-floor' && (
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <div className="text-xs font-bold text-slate-900">
                  ISO 13370 Ground-Contact Floor Coupling Parameters
                </div>
                <p className="text-xs text-slate-600">
                  Ground-contact slabs exchange heat through underlying soil pathways rather than exterior air. Select ISO 13370 simplified slab-on-ground parameters or enter a declared effective ground U-value.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-500 font-medium mb-1">Ground Method</label>
                    <select
                      value={selectedAssembly.groundFloor?.groundCalculationMethod || 'iso-13370-slab-on-ground-simplified'}
                      onChange={(e) =>
                        handleUpdateAssembly(selectedAssembly.assemblyId, {
                          groundFloor: {
                            ...(selectedAssembly.groundFloor || {}),
                            groundCalculationMethod: e.target.value as any,
                          },
                        })
                      }
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg"
                    >
                      <option value="iso-13370-slab-on-ground-simplified">ISO 13370 Slab-on-Ground</option>
                      <option value="declared-effective-u-value">Declared Effective Ground U</option>
                      <option value="unmodelled-ground-coupling">Unmodelled (Block 1D Air Math)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-500 font-medium mb-1">Char. Dim B&apos; (m)</label>
                    <input
                      type="number"
                      step={0.1}
                      value={selectedAssembly.groundFloor?.slabCharacteristicDimensionBM ?? 6.0}
                      onChange={(e) =>
                        handleUpdateAssembly(selectedAssembly.assemblyId, {
                          groundFloor: {
                            ...(selectedAssembly.groundFloor || {
                              groundCalculationMethod: 'iso-13370-slab-on-ground-simplified',
                            }),
                            slabCharacteristicDimensionBM: Number(e.target.value),
                          },
                        })
                      }
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 font-medium mb-1">Soil λ (W/mK)</label>
                    <input
                      type="number"
                      step={0.1}
                      value={selectedAssembly.groundFloor?.soilThermalConductivityWPerMK ?? 2.0}
                      onChange={(e) =>
                        handleUpdateAssembly(selectedAssembly.assemblyId, {
                          groundFloor: {
                            ...(selectedAssembly.groundFloor || {
                              groundCalculationMethod: 'iso-13370-slab-on-ground-simplified',
                            }),
                            soilThermalConductivityWPerMK: Number(e.target.value),
                          },
                        })
                      }
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 font-medium mb-1">Declared U (if used)</label>
                    <input
                      type="number"
                      step={0.01}
                      value={selectedAssembly.groundFloor?.declaredEffectiveUValueWPerM2K ?? ''}
                      placeholder="e.g. 0.18"
                      onChange={(e) =>
                        handleUpdateAssembly(selectedAssembly.assemblyId, {
                          groundFloor: {
                            ...(selectedAssembly.groundFloor || {
                              groundCalculationMethod: 'declared-effective-u-value',
                            }),
                            declaredEffectiveUValueWPerM2K: e.target.value ? Number(e.target.value) : null,
                          },
                        })
                      }
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg tabular-nums"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Add Material Layer Bar */}
            {selectedAssembly.category !== 'window-glazing' &&
              selectedAssembly.category !== 'curtain-wall' &&
              selectedAssembly.category !== 'skylight-roof-glazing' && (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">
                        Add Reference Layer:
                      </span>
                      <select
                        value={selectedCatalogMaterialId}
                        onChange={(e) => setSelectedCatalogMaterialId(e.target.value)}
                        className="flex-1 text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5"
                      >
                        {AUTHORITATIVE_ENVELOPE_MATERIALS.map((m) => (
                          <option key={m.materialId} value={m.materialId}>
                            {m.name} ({m.thermalConductivityWPerMK ? `λ = ${m.thermalConductivityWPerMK} W/mK` : `R = ${m.fixedThermalResistanceM2KPerW} m²K/W`})
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      onClick={handleAddLayerFromCatalog}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5 text-teal-400" />
                      <span>Append Layer</span>
                    </button>
                  </div>

                  {/* Layer Stack Table (Ordered Outside -> Inside) */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold">
                          <th className="py-2 px-2"># (Out→In)</th>
                          <th className="py-2 px-2">Material Layer Name</th>
                          <th className="py-2 px-2 text-right">d (mm)</th>
                          <th className="py-2 px-2 text-right">λ (W/mK)</th>
                          <th className="py-2 px-2">Cavity State</th>
                          <th className="py-2 px-2 text-right">μ / s_d</th>
                          <th className="py-2 px-2 text-right">R_i (m²K/W)</th>
                          <th className="py-2 px-2 text-center">Bridged</th>
                          <th className="py-2 px-2 text-right">Remove</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedAssembly.layers.map((layer) => {
                          const step = selectedAssembly.thermalResult?.layerSteps.find(
                            (s) => s.layerId === layer.layerId
                          );
                          return (
                            <tr
                              key={layer.layerId}
                              className={
                                step && !step.includedInThermalSum
                                  ? 'bg-slate-100/70 text-slate-400'
                                  : 'hover:bg-slate-50'
                              }
                            >
                              <td className="py-2.5 px-2 font-mono">{layer.orderIndex}</td>
                              <td className="py-2.5 px-2">
                                <input
                                  type="text"
                                  value={layer.name}
                                  onChange={(e) =>
                                    handleUpdateLayer(selectedAssembly.assemblyId, layer.layerId, {
                                      name: e.target.value,
                                    })
                                  }
                                  className="w-full px-2 py-1 bg-white border border-slate-200 rounded-md text-slate-900 font-medium"
                                />
                              </td>
                              <td className="py-2.5 px-2 text-right">
                                <input
                                  type="number"
                                  step={1}
                                  value={layer.thicknessMm}
                                  onChange={(e) =>
                                    handleUpdateLayer(selectedAssembly.assemblyId, layer.layerId, {
                                      thicknessMm: Number(e.target.value),
                                    })
                                  }
                                  className="w-16 text-right px-1.5 py-1 bg-white border border-slate-200 rounded-md tabular-nums text-slate-900"
                                />
                              </td>
                              <td className="py-2.5 px-2 text-right">
                                <input
                                  type="number"
                                  step={0.005}
                                  value={layer.thermalConductivityWPerMK ?? ''}
                                  placeholder="Fixed R"
                                  onChange={(e) =>
                                    handleUpdateLayer(selectedAssembly.assemblyId, layer.layerId, {
                                      thermalConductivityWPerMK:
                                        e.target.value === '' ? null : Number(e.target.value),
                                    })
                                  }
                                  className="w-18 text-right px-1.5 py-1 bg-white border border-slate-200 rounded-md tabular-nums text-slate-900"
                                />
                              </td>
                              <td className="py-2.5 px-2">
                                <select
                                  value={layer.cavityVentilation || 'none'}
                                  onChange={(e) =>
                                    handleUpdateLayer(selectedAssembly.assemblyId, layer.layerId, {
                                      cavityVentilation: e.target.value as EnvelopeCavityVentilationState,
                                    })
                                  }
                                  className="px-1.5 py-1 bg-white border border-slate-200 rounded-md text-slate-700"
                                >
                                  <option value="none">Solid Layer</option>
                                  <option value="unventilated">Unventilated Cavity</option>
                                  <option value="slightly-ventilated">Slightly Ventilated</option>
                                  <option value="well-ventilated">Well-Ventilated (Rainscreen)</option>
                                </select>
                              </td>
                              <td className="py-2.5 px-2 text-right tabular-nums">
                                {step?.calculatedSdM !== null && step?.calculatedSdM !== undefined
                                  ? `s_d=${step.calculatedSdM.toFixed(2)}m`
                                  : '—'}
                              </td>
                              <td className="py-2.5 px-2 text-right font-mono font-semibold text-slate-800">
                                {step?.includedInThermalSum
                                  ? step.calculatedResistanceM2KPerW?.toFixed(3) ?? 'Err'
                                  : 'Bypassed'}
                              </td>
                              <td className="py-2.5 px-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={Boolean(layer.hasInhomogeneousFastenersOrStuds)}
                                  onChange={(e) =>
                                    handleUpdateLayer(selectedAssembly.assemblyId, layer.layerId, {
                                      hasInhomogeneousFastenersOrStuds: e.target.checked,
                                    })
                                  }
                                  title="Flag repeating studs or mechanical fasteners in this layer"
                                />
                              </td>
                              <td className="py-2.5 px-2 text-right">
                                <button
                                  onClick={() =>
                                    handleDeleteLayer(selectedAssembly.assemblyId, layer.layerId)
                                  }
                                  className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                                  title="Remove layer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

            {/* Validation Errors & Warnings */}
            {(selectedAssembly.thermalResult?.validationErrors.length || 0) > 0 && (
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-900 space-y-1">
                <div className="font-bold">Validation Errors (Calculation Blocked)</div>
                <ul className="list-disc list-inside space-y-0.5">
                  {selectedAssembly.thermalResult?.validationErrors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            {(selectedAssembly.thermalResult?.warnings.length || 0) > 0 && (
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 space-y-1">
                <div className="font-bold">Methodological Warnings</div>
                <ul className="list-disc list-inside space-y-0.5">
                  {selectedAssembly.thermalResult?.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Step-by-Step Formula Trace */}
            <div className="p-4 bg-slate-900 text-slate-100 rounded-xl space-y-2">
              <div className="text-xs font-semibold text-teal-300">
                Auditable Calculation Formula Trace ({selectedAssembly.thermalResult?.methodUsed})
              </div>
              <div className="space-y-1 font-mono text-[11px] text-slate-300">
                {selectedAssembly.thermalResult?.formulaTrace.map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STAGE 3: THERMAL ANALYSIS & THERMAL BRIDGES */}
      {activeStage === 'thermal' && (
        <div className="space-y-6">
          {/* Category Heat-Loss Breakdown */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
            <h2 className="text-base font-bold text-slate-900">
              03. Area-Weighted Envelope Transmittance & Steady-State Conductive Heat Transfer
            </h2>
            <p className="text-xs text-slate-500">
              Component conductive heat transfer screening Q = U × A_net × ΔT under Heating Design (ΔT = {s.heatingDesignDeltaTK} K) and Cooling Design (ΔT = {s.coolingDesignDeltaTK} K). Note: Steady-state heat flow (W) is not annual operational energy consumption (kWh/yr).
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold">
                    <th className="py-2.5 px-3">Envelope Element Category</th>
                    <th className="py-2.5 px-3 text-right">Net Area (m²)</th>
                    <th className="py-2.5 px-3 text-right">Conductance UA (W/K)</th>
                    <th className="py-2.5 px-3 text-right">Share of H_tr (%)</th>
                    <th className="py-2.5 px-3 text-right">Heating Design Loss (W)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {s.categoryHeatLossBreakdown.map((row) => (
                    <tr key={row.category} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-semibold text-slate-900">{row.category}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums">{row.netAreaM2.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-slate-800">
                        {row.uaWPerK.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-teal-800 font-medium">
                        {row.shareOfTransmissionPercent.toFixed(1)}%
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums font-bold text-slate-900">
                        {row.heatingHeatLossW.toFixed(0)} W
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50/90 font-semibold text-slate-900 border-t border-slate-200">
                    <td className="py-2.5 px-3">Linear & Point Thermal Bridges (H_tb)</td>
                    <td className="py-2.5 px-3 text-right">—</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">
                      {bs.totalBridgeHeatTransferCoeffWPerK.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-amber-800">
                      {s.transmissionHeatTransferCoeffWPerK && s.transmissionHeatTransferCoeffWPerK > 0
                        ? ((bs.totalBridgeHeatTransferCoeffWPerK / s.transmissionHeatTransferCoeffWPerK) * 100).toFixed(1)
                        : '0.0'}
                      %
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums">
                      {bs.heatingDesignBridgeHeatFlowW?.toFixed(0) ?? 0} W
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Linear & Point Thermal Bridge Register */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Linear (Ψ × L) & Point (Χ × n) Thermal Bridge Register (ISO 14683)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Explicitly tracks junction linear transmittances and prevents double-counting when a bridge is already embedded in an assembly U-value.
                </p>
              </div>
              <div className="text-xs font-semibold text-slate-700">
                Total H_tb = {bs.totalBridgeHeatTransferCoeffWPerK.toFixed(2)} W/K · Equivalent ΔU_tb = +{bs.equivalentDeltaUWPerM2K?.toFixed(3) ?? '0.000'} W/(m²·K)
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold">
                    <th className="py-2.5 px-3">Junction Name</th>
                    <th className="py-2.5 px-3">Junction Type</th>
                    <th className="py-2.5 px-3 text-right">Ψ (W/mK)</th>
                    <th className="py-2.5 px-3 text-right">Length L (m)</th>
                    <th className="py-2.5 px-3 text-center">In Assembly U?</th>
                    <th className="py-2.5 px-3 text-right">H_tb (W/K)</th>
                    <th className="py-2.5 px-3 text-right">Heating Flow (W)</th>
                    <th className="py-2.5 px-3">Provenance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {draftAssessment.thermalBridges.map((tb) => {
                    const evalRow = bs.bridgeBreakdown.find((b) => b.bridgeId === tb.bridgeId);
                    return (
                      <tr key={tb.bridgeId} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-semibold text-slate-900">{tb.name}</td>
                        <td className="py-2.5 px-3 text-slate-600">{tb.junctionType}</td>
                        <td className="py-2.5 px-3 text-right">
                          <input
                            type="number"
                            step={0.01}
                            min={0}
                            value={tb.psiValueWPerMK ?? 0}
                            onChange={(e) =>
                              updateDraft((prev) => ({
                                ...prev,
                                thermalBridges: prev.thermalBridges.map((item) =>
                                  item.bridgeId === tb.bridgeId
                                    ? { ...item, psiValueWPerMK: Number(e.target.value) }
                                    : item
                                ),
                              }))
                            }
                            className="w-18 text-right px-2 py-1 bg-white border border-slate-200 rounded-md tabular-nums"
                          />
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <input
                            type="number"
                            step={0.5}
                            min={0}
                            value={tb.lengthM}
                            onChange={(e) =>
                              updateDraft((prev) => ({
                                ...prev,
                                thermalBridges: prev.thermalBridges.map((item) =>
                                  item.bridgeId === tb.bridgeId
                                    ? { ...item, lengthM: Number(e.target.value) }
                                    : item
                                ),
                              }))
                            }
                            className="w-18 text-right px-2 py-1 bg-white border border-slate-200 rounded-md tabular-nums"
                          />
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={tb.alreadyIncludedInAssemblyUValue}
                            onChange={(e) =>
                              updateDraft((prev) => ({
                                ...prev,
                                thermalBridges: prev.thermalBridges.map((item) =>
                                  item.bridgeId === tb.bridgeId
                                    ? { ...item, alreadyIncludedInAssemblyUValue: e.target.checked }
                                    : item
                                ),
                              }))
                            }
                            title="Exclude from H_tb if already included in 1D assembly U-value"
                          />
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-800">
                          {evalRow?.hTbWPerK !== null && evalRow?.hTbWPerK !== undefined
                            ? evalRow.hTbWPerK.toFixed(2)
                            : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold tabular-nums text-slate-900">
                          {evalRow?.heatingHeatFlowW !== null && evalRow?.heatingHeatFlowW !== undefined
                            ? `${evalRow.heatingHeatFlowW.toFixed(0)} W`
                            : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500">{tb.provenance}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* STAGE 4: GLAZING & SOLAR */}
      {activeStage === 'glazing-solar' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
            <h2 className="text-base font-bold text-slate-900">
              04. Fenestration U-Value Basis, SHGC, Orientation WWR & Solar Gain Screening
            </h2>
            <p className="text-xs text-slate-500">
              Distinguishes whole-window U_w (including frame and edge spacer) from centre-of-glass U_g. Steady-state solar heat gain screening Q_sol = A_w × SHGC × F_sh × I_sol is computed only for orientations with declared solar irradiance.
            </p>

            {/* Orientation WWR Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold">
                    <th className="py-2.5 px-3">Facade Orientation</th>
                    <th className="py-2.5 px-3 text-right">Gross Wall (m²)</th>
                    <th className="py-2.5 px-3 text-right">Glazing Area (m²)</th>
                    <th className="py-2.5 px-3 text-right">Net Opaque Wall (m²)</th>
                    <th className="py-2.5 px-3 text-right">WWR (%)</th>
                    <th className="py-2.5 px-3 text-right">Mean U_win (W/m²K)</th>
                    <th className="py-2.5 px-3 text-right">Mean SHGC</th>
                    <th className="py-2.5 px-3 text-right">Solar I_sol (W/m²)</th>
                    <th className="py-2.5 px-3 text-right">Steady-State Q_sol (W)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {s.orientationBreakdown.map((ori) => (
                    <tr key={ori.orientation} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-semibold text-slate-900">{ori.orientation}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums">{ori.grossOpaqueWallAreaM2.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums font-medium">{ori.glazingAreaM2.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums">{ori.netOpaqueWallAreaM2.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums font-bold text-teal-800">
                        {ori.windowToWallRatioPercent !== null ? `${ori.windowToWallRatioPercent.toFixed(1)}%` : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums">
                        {ori.areaWeightedGlazingUWPerM2K?.toFixed(2) ?? '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums">
                        {ori.areaWeightedSHGC?.toFixed(2) ?? '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums">
                        {ori.incidentSolarIrradianceWPerM2 !== null ? `${ori.incidentSolarIrradianceWPerM2}` : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums font-bold text-amber-800">
                        {ori.steadyStateSolarGainW !== null ? `${ori.steadyStateSolarGainW.toFixed(0)} W` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Individual Glazing Assembly Editor */}
            <div className="pt-4 border-t border-slate-100 space-y-3">
              <h3 className="text-sm font-bold text-slate-900">Glazed Assembly Properties (ISO 10077-1 / EN 410)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {draftAssessment.assemblies
                  .filter(
                    (a) =>
                      a.category === 'window-glazing' ||
                      a.category === 'curtain-wall' ||
                      a.category === 'skylight-roof-glazing'
                  )
                  .map((win) => {
                    const gs = win.glazingSolar!;
                    return (
                      <div
                        key={win.assemblyId}
                        className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900">{win.name}</span>
                          <span className="text-slate-500">
                            {win.orientation} · {win.netAreaM2.toFixed(2)} m²
                          </span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                          <div>
                            <label className="block text-[11px] text-slate-500 mb-1">U-Value Basis</label>
                            <select
                              value={gs?.uValueBasis || 'whole-window-Uw'}
                              onChange={(e) =>
                                handleUpdateAssembly(win.assemblyId, {
                                  glazingSolar: {
                                    ...gs,
                                    uValueBasis: e.target.value as any,
                                  },
                                })
                              }
                              className="w-full px-2 py-1 bg-white border border-slate-200 rounded-md"
                            >
                              <option value="whole-window-Uw">Whole-Window (Uw)</option>
                              <option value="centre-of-glass-Ug">Centre-of-Glass (Ug)</option>
                              <option value="unverified-unknown">Unverified</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-500 mb-1">U (W/m²K)</label>
                            <input
                              type="number"
                              step={0.05}
                              value={gs?.declaredUValueWPerM2K ?? ''}
                              onChange={(e) =>
                                handleUpdateAssembly(win.assemblyId, {
                                  glazingSolar: {
                                    ...gs,
                                    declaredUValueWPerM2K:
                                      e.target.value === '' ? null : Number(e.target.value),
                                  },
                                })
                              }
                              className="w-full px-2 py-1 bg-white border border-slate-200 rounded-md tabular-nums"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-500 mb-1">SHGC (0–1)</label>
                            <input
                              type="number"
                              step={0.02}
                              min={0.05}
                              max={1}
                              value={gs?.solarHeatGainCoefficientSHGC ?? ''}
                              onChange={(e) =>
                                handleUpdateAssembly(win.assemblyId, {
                                  glazingSolar: {
                                    ...gs,
                                    solarHeatGainCoefficientSHGC:
                                      e.target.value === '' ? null : Number(e.target.value),
                                  },
                                })
                              }
                              className="w-full px-2 py-1 bg-white border border-slate-200 rounded-md tabular-nums"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-500 mb-1">Shading F_sh</label>
                            <input
                              type="number"
                              step={0.05}
                              min={0}
                              max={1}
                              value={gs?.externalShadingFactorFsh ?? 1.0}
                              onChange={(e) =>
                                handleUpdateAssembly(win.assemblyId, {
                                  glazingSolar: {
                                    ...gs,
                                    externalShadingFactorFsh: Number(e.target.value),
                                  },
                                })
                              }
                              className="w-full px-2 py-1 bg-white border border-slate-200 rounded-md tabular-nums"
                            />
                          </div>
                        </div>
                        {win.thermalResult?.warnings && win.thermalResult.warnings.length > 0 && (
                          <div className="text-[11px] text-amber-800 bg-amber-50 p-2 rounded-md border border-amber-200">
                            {win.thermalResult.warnings.join(' ')}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STAGE 5: MOISTURE & AIRTIGHTNESS */}
      {activeStage === 'moisture-airtightness' && (
        <div className="space-y-6">
          {/* Boundary Condition Selector & Surface/Interstitial Condensation Table */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  05. Dew-Point, Surface Temperature Factor (f_Rsi) & Glaser Interstitial Diffusion Screening (ISO 13788)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {profile.hygrothermalDisclaimer}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-slate-600">Boundary Condition:</label>
                <select
                  value={draftAssessment.activeScenarioId}
                  onChange={(e) =>
                    updateDraft((prev) => ({ ...prev, activeScenarioId: e.target.value }))
                  }
                  className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-medium text-slate-900"
                >
                  {draftAssessment.climateScenarios.map((sc) => (
                    <option key={sc.scenarioId} value={sc.scenarioId}>
                      {sc.name} ({sc.indoorTempC}°C/{sc.indoorRelativeHumidityPercent}% RH in, {sc.outdoorTempC}°C out)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold">
                    <th className="py-2.5 px-3">Assembly</th>
                    <th className="py-2.5 px-3 text-right">U (W/m²K)</th>
                    <th className="py-2.5 px-3 text-right">Surface T_si (°C)</th>
                    <th className="py-2.5 px-3 text-right">Dew Point T_dp (°C)</th>
                    <th className="py-2.5 px-3 text-right">Margin (°C)</th>
                    <th className="py-2.5 px-3 text-right">f_Rsi</th>
                    <th className="py-2.5 px-3 text-right">f_Rsi,min</th>
                    <th className="py-2.5 px-3">Surface Screening</th>
                    <th className="py-2.5 px-3">Glaser Interstitial Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {draftAssessment.moistureRecords.map((mr) => (
                    <tr
                      key={mr.assemblyId}
                      onClick={() => setSelectedAssemblyId(mr.assemblyId)}
                      className="hover:bg-slate-50 cursor-pointer"
                    >
                      <td className="py-2.5 px-3 font-semibold text-slate-900">{mr.assemblyName}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums">
                        {mr.uValueWPerM2K?.toFixed(3) ?? '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums font-semibold">
                        {mr.interiorSurfaceTempC !== null ? `${mr.interiorSurfaceTempC.toFixed(2)}°C` : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-slate-600">
                        {mr.indoorDewPointTempC !== null ? `${mr.indoorDewPointTempC.toFixed(2)}°C` : '—'}
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right tabular-nums font-bold ${
                          mr.dewPointMarginC !== null && mr.dewPointMarginC <= 0
                            ? 'text-red-600'
                            : 'text-teal-800'
                        }`}
                      >
                        {mr.dewPointMarginC !== null
                          ? `${mr.dewPointMarginC >= 0 ? '+' : ''}${mr.dewPointMarginC.toFixed(2)}°C`
                          : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums font-mono">
                        {mr.temperatureFactorFRsi?.toFixed(3) ?? '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums font-mono text-slate-500">
                        {mr.criticalMinimumFRsi?.toFixed(3) ?? '—'}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={
                            mr.status === 'assessed-pass'
                              ? 'text-emerald-700 font-semibold'
                              : mr.status === 'incomplete-inputs'
                                ? 'text-slate-400'
                                : 'text-red-600 font-bold'
                          }
                        >
                          {mr.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">{mr.interstitialStatus}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Glaser Profile Inspector for Selected Assembly */}
            {selectedAssembly && (
              <div className="pt-4 border-t border-slate-100 space-y-3">
                {(() => {
                  const mr = draftAssessment.moistureRecords.find(
                    (m) => m.assemblyId === selectedAssembly.assemblyId
                  );
                  if (!mr || mr.glaserProfile.length === 0) return null;
                  return (
                    <div className="space-y-2">
                      <div className="text-xs font-bold text-slate-900">
                        1D Glaser Vapour-Diffusion Interface Profile (Inside → Outside): {selectedAssembly.name}
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                              <th className="py-2 px-3">Interface Node</th>
                              <th className="py-2 px-3 text-right">Cum. R (m²K/W)</th>
                              <th className="py-2 px-3 text-right">Cum. s_d (m)</th>
                              <th className="py-2 px-3 text-right">Temp T_k (°C)</th>
                              <th className="py-2 px-3 text-right">p_sat (Pa)</th>
                              <th className="py-2 px-3 text-right">Actual p_v (Pa)</th>
                              <th className="py-2 px-3">Interface Condensation Check</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {mr.glaserProfile.map((node) => (
                              <tr key={node.interfaceIndex}>
                                <td className="py-2 px-3 font-medium text-slate-800">{node.label}</td>
                                <td className="py-2 px-3 text-right font-mono">{node.cumulativeRFromInsideM2KPerW.toFixed(3)}</td>
                                <td className="py-2 px-3 text-right font-mono">{node.cumulativeSdFromInsideM.toFixed(2)}</td>
                                <td className="py-2 px-3 text-right tabular-nums">{node.temperatureC.toFixed(2)}°C</td>
                                <td className="py-2 px-3 text-right tabular-nums">{node.saturationVapourPressurePa.toFixed(0)} Pa</td>
                                <td className="py-2 px-3 text-right tabular-nums">{node.actualVapourPressurePa.toFixed(0)} Pa</td>
                                <td className="py-2 px-3">
                                  {node.condensationAtInterface ? (
                                    <span className="text-red-600 font-bold">Risk (p_v &gt; p_sat)</span>
                                  ) : (
                                    <span className="text-emerald-700">Clear (p_v &le; p_sat)</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Airtightness & Air-Barrier Continuity Checklist */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Wind className="w-4 h-4 text-teal-700" />
                  <span>Airtightness & Air-Barrier Continuity Screening (ISO 9972 / ISO 13789)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Explicitly distinguishes measured fan-pressurization (blower-door) test data from scenario assumptions or untested states.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
              <div>
                <label className="block text-slate-500 font-medium mb-1">Airtightness Provenance</label>
                <select
                  value={draftAssessment.airtightness.provenance}
                  onChange={(e) =>
                    updateDraft((prev) => ({
                      ...prev,
                      airtightness: {
                        ...prev.airtightness,
                        provenance: e.target.value as any,
                      },
                    }))
                  }
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg"
                >
                  <option value="user-scenario-assumption">User Scenario Assumption (Untested)</option>
                  <option value="modelled-estimate">Modelled Estimate</option>
                  <option value="manufacturer-claim">System Manufacturer Claim</option>
                  <option value="measured-pressurization-test">Measured Blower-Door Test (ISO 9972)</option>
                  <option value="unavailable-untested">Unavailable / Not Specified</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-500 font-medium mb-1">Air Changes n_50 (h⁻¹ @ 50 Pa)</label>
                <input
                  type="number"
                  step={0.1}
                  min={0.1}
                  disabled={draftAssessment.airtightness.provenance === 'unavailable-untested'}
                  value={draftAssessment.airtightness.n50AirChangesPerHour ?? ''}
                  onChange={(e) =>
                    updateDraft((prev) => ({
                      ...prev,
                      airtightness: {
                        ...prev.airtightness,
                        n50AirChangesPerHour: e.target.value === '' ? null : Number(e.target.value),
                      },
                    }))
                  }
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg tabular-nums"
                />
              </div>
              <div>
                <label className="block text-slate-500 font-medium mb-1">Conditioned Volume V (m³)</label>
                <input
                  type="number"
                  step={10}
                  min={10}
                  value={draftAssessment.airtightness.conditionedVolumeM3}
                  onChange={(e) =>
                    updateDraft((prev) => ({
                      ...prev,
                      airtightness: {
                        ...prev.airtightness,
                        conditionedVolumeM3: Math.max(10, Number(e.target.value) || 10),
                      },
                    }))
                  }
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg tabular-nums"
                />
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="text-slate-400">Screening Infiltration Loss</div>
                <div className="text-sm font-bold text-slate-900 mt-0.5 tabular-nums">
                  {draftAssessment.airtightnessEvaluation.heatingInfiltrationHeatLossW !== null
                    ? `${draftAssessment.airtightnessEvaluation.heatingInfiltrationHeatLossW.toFixed(0)} W (${draftAssessment.airtightnessEvaluation.infiltrationHeatLossCoeffWPerK} W/K)`
                    : 'Not Evaluated'}
                </div>
                <div className="text-[11px] text-slate-500">
                  q_50 = {draftAssessment.airtightnessEvaluation.q50M3PerHM2 ?? '—'} m³/(h·m²)
                </div>
              </div>
            </div>

            {/* Air Barrier Continuity Checklist */}
            <div className="space-y-2 pt-2">
              <div className="text-xs font-bold text-slate-800">Primary Air-Barrier Junction Continuity Checklist</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {draftAssessment.airtightness.airBarrierContinuityChecklist.map((item) => (
                  <div
                    key={item.itemId}
                    className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-start justify-between gap-3 text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="font-semibold text-slate-900">{item.junctionName}</div>
                      <div className="text-[11px] text-slate-500">{item.notes}</div>
                    </div>
                    <select
                      value={item.status}
                      onChange={(e) =>
                        updateDraft((prev) => ({
                          ...prev,
                          airtightness: {
                            ...prev.airtightness,
                            airBarrierContinuityChecklist:
                              prev.airtightness.airBarrierContinuityChecklist.map((c) =>
                                c.itemId === item.itemId ? { ...c, status: e.target.value as any } : c
                              ),
                          },
                        }))
                      }
                      className="px-2 py-1 bg-white border border-slate-200 rounded-md text-xs shrink-0"
                    >
                      <option value="continuous-verified">Continuous Verified</option>
                      <option value="detailed-not-tested">Detailed (Not Tested)</option>
                      <option value="discontinuous-risk">Discontinuous Risk</option>
                      <option value="unassessed">Unassessed</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STAGE 6: SCENARIOS & IMPROVEMENTS (WITH P44 CARBON LINK) */}
      {activeStage === 'scenarios' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  06. Evidence-Backed Envelope Improvements & P44 Embodied Carbon Trade-Offs
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Toggle candidate envelope upgrades to preview their non-destructive effect on area-weighted U-value, peak conductive heat loss, and upfront embodied carbon (Modules A1–A3).
                </p>
              </div>
              <button
                onClick={handleApplyImprovedScenarioToDraft}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Apply Selected Upgrades to Active Draft</span>
              </button>
            </div>

            {/* Side-by-Side Comparison Banner */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-slate-900 text-white rounded-xl">
              <div>
                <div className="text-xs text-slate-400">Effective Envelope U (with Bridges)</div>
                <div className="text-base font-bold mt-1 tabular-nums">
                  Baseline: {s.effectiveEnvelopeUWithBridgesWPerM2K?.toFixed(3) ?? '—'} → Preview:{' '}
                  <span className="text-teal-300">
                    {improvedPreview.summary.effectiveEnvelopeUWithBridgesWPerM2K?.toFixed(3) ?? '—'} W/(m²·K)
                  </span>
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Heating Design Conductive Loss Q_tr</div>
                <div className="text-base font-bold mt-1 tabular-nums">
                  Baseline: {s.heatingDesignConductiveHeatLossW?.toFixed(0) ?? '—'} W → Preview:{' '}
                  <span className="text-teal-300">
                    {improvedPreview.summary.heatingDesignConductiveHeatLossW?.toFixed(0) ?? '—'} W
                  </span>
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Upfront Embodied Carbon Trade-Off (P44)</div>
                <div className="text-base font-bold mt-1 tabular-nums text-amber-300">
                  +
                  {draftAssessment.improvementOptions
                    .filter((o) => o.selectedForScenario)
                    .reduce((acc, o) => acc + (o.estimatedUpfrontCarbonDeltaKgCO2e || 0), 0)}{' '}
                  kgCO₂e (A1–A3 increment)
                </div>
              </div>
            </div>

            {/* Improvement Options Cards */}
            <div className="space-y-3">
              {draftAssessment.improvementOptions.map((opt) => (
                <div
                  key={opt.optionId}
                  className={`p-4 rounded-xl border transition-colors ${
                    opt.selectedForScenario
                      ? 'bg-teal-50/60 border-teal-300'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={opt.selectedForScenario}
                        onChange={(e) =>
                          updateDraft((prev) => ({
                            ...prev,
                            improvementOptions: prev.improvementOptions.map((item) =>
                              item.optionId === opt.optionId
                                ? { ...item, selectedForScenario: e.target.checked }
                                : item
                            ),
                          }))
                        }
                        className="mt-1"
                      />
                      <div className="space-y-1">
                        <div className="text-sm font-bold text-slate-900">{opt.title}</div>
                        <p className="text-xs text-slate-600">{opt.proposedChangeDescription}</p>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 pt-1">
                          <span className="font-mono font-semibold text-slate-800">
                            {opt.beforeMetricLabel} → {opt.projectedAfterMetricLabel}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="text-teal-800 font-semibold">
                            Saves {opt.estimatedTransmissionReductionWPerK.toFixed(2)} W/K ({opt.estimatedHeatingPeakReductionW} W peak heating)
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="text-emerald-800 font-medium">
                            P44 Carbon Delta: +{opt.estimatedUpfrontCarbonDeltaKgCO2e ?? 0} kgCO₂e ({opt.embodiedCarbonTradeoffStatus})
                          </span>
                        </div>
                        <ul className="list-disc list-inside text-[11px] text-slate-500 pt-1">
                          {opt.technicalCaveatsAndMoistureCheck.map((c, idx) => (
                            <li key={idx}>{c}</li>
                          ))}
                        </ul>
                      </div>
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* STAGE 7: FINDINGS & REPORT */}
      {activeStage === 'findings-report' && (
        <div className="space-y-6">
          {/* Traceable Findings Register */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  07. Traceable Envelope Findings & Structured Engineering Report
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Every finding links directly to affected envelope element IDs, governing physical metrics, benchmark thresholds, and methodological limitations.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={findingCategoryFilter}
                  onChange={(e) => setFindingCategoryFilter(e.target.value)}
                  className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5"
                >
                  <option value="all">All Categories ({draftAssessment.findings.length})</option>
                  <option value="thermal-transmittance">Thermal Transmittance</option>
                  <option value="window-solar-wwr">Glazing & Solar / WWR</option>
                  <option value="thermal-bridging">Thermal Bridging</option>
                  <option value="condensation-moisture">Condensation & Moisture</option>
                  <option value="airtightness-infiltration">Airtightness</option>
                  <option value="data-completeness">Data Completeness</option>
                </select>
              </div>
            </div>

            <div className="space-y-3">
              {draftAssessment.findings
                .filter((f) => findingCategoryFilter === 'all' || f.category === findingCategoryFilter)
                .map((finding) => (
                  <div
                    key={finding.findingId}
                    className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-1.5 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-slate-900 text-sm">{finding.title}</span>
                      <span className="text-slate-500 font-medium">
                        Severity: <strong className="uppercase text-slate-800">{finding.severity}</strong> · {finding.category} · Evidence: {finding.evidenceStrength}
                      </span>
                    </div>
                    <div className="text-slate-700">
                      <strong>Governing Metric:</strong> {finding.governingInputsAndMetric}
                    </div>
                    <div className="text-slate-600">
                      <strong>Benchmark Comparison:</strong> {finding.benchmarkComparison}
                    </div>
                    <div className="text-teal-900 font-medium">
                      <strong>Recommendation:</strong> {finding.recommendationSummary}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Affected Elements: {finding.affectedElementIds.join(', ')} · Limitations: {finding.uncertaintiesAndLimitations.join(' ')}
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Export & Report Preview */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Export Building Envelope Performance Package
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Includes full assembly inventory, layer-by-layer R/U traces, ISO 13788 Glaser moisture tables, thermal bridges, P44 carbon trade-offs, and mandatory non-statutory disclaimers.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => handleDownloadExport('markdown')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Markdown (.md)</span>
                </button>
                <button
                  onClick={() => handleDownloadExport('csv')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download CSV (.csv)</span>
                </button>
                <button
                  onClick={() => handleDownloadExport('json')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-teal-400" />
                  <span>Download JSON (.json)</span>
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500 font-medium">Preview Format:</span>
              {(['markdown', 'csv', 'json'] as const).map((fmt) => (
                <button
                  key={fmt}
                  onClick={() => setExportPreviewFormat(fmt)}
                  className={`px-2.5 py-1 rounded-md font-medium uppercase cursor-pointer ${
                    exportPreviewFormat === fmt
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {fmt}
                </button>
              ))}
            </div>

            <pre className="p-4 bg-slate-900 text-slate-100 rounded-xl text-[11px] font-mono overflow-x-auto max-h-96 leading-relaxed">
              {exportEnvelopeAssessmentReport(project, draftAssessment, exportPreviewFormat)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};
