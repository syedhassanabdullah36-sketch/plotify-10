/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * PLOTIFY — P45 Climate Hazard & Resilience Analyzer Workspace
 * 7-Stage Guided Workflow:
 *  1. Site & Scope
 *  2. Data Readiness
 *  3. Hazard Explorer
 *  4. Exposure & Vulnerability
 *  5. Risk Findings
 *  6. Resilience Options
 *  7. Report & Provenance
 */

import React, { useState, useMemo } from 'react';
import {
  ArrowLeft,
  CloudRain,
  ThermometerSun,
  Waves,
  Wind,
  Flame,
  Mountain,
  Droplets,
  Snowflake,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Info,
  Database,
  Upload,
  Download,
  Save,
  RotateCcw,
  Layers,
  Leaf,
  MapPin,
  FileText,
  Sliders,
  Eye,
} from 'lucide-react';
import { Project } from '../../types/project';
import {
  CLIMATE_ASSESSMENT_PROFILE_ID,
  ClimateDataSourceRecord,
  ClimateHazardCategory,
  ClimateHazardIndicatorRecord,
  ClimateJurisdictionScope,
  ClimateResilienceConfig,
  ClimateScenarioId,
  ClimateTimeHorizon,
  QualitativeLevel,
  QuarantinedClimateRecord,
} from '../../types/climateResilience';
import {
  applyClimateAssessmentToProject,
  applySelectedResilienceMeasuresToProject,
  checkClimateAssessmentStaleness,
  createDefaultClimateResilienceConfig,
  exportClimateResilienceCSV,
  exportClimateResilienceJSON,
  exportClimateResilienceMarkdownReport,
  importClimateEvidencePayload,
  removeClimateAssessmentFromProject,
  runClimateHazardResilienceAssessment,
} from '../../services/climateResilienceService';

interface ClimateResilienceWorkspaceProps {
  project: Project;
  onUpdateProject: (updated: Project) => void;
  onBack: () => void;
  onOpenSiteContext?: (project: Project) => void;
  onOpenTerrain?: (project: Project) => void;
  onOpenCarbon?: (project: Project) => void;
  onOpenVersionWorkspace?: (
    project: Project,
    tab?: 'timeline' | 'diff' | 'recovery' | 'collaboration'
  ) => void;
  onShowToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

type WorkspaceStage =
  | 'site-scope'
  | 'data-readiness'
  | 'hazard-explorer'
  | 'exposure-vulnerability'
  | 'risk-findings'
  | 'resilience-options'
  | 'report-provenance';

const SCENARIO_LABELS: Record<ClimateScenarioId, string> = {
  'historical-baseline': 'Historical Baseline (1991–2020)',
  'ssp1-2.6': 'SSP1-2.6 (Low Emissions / Sustainability)',
  'ssp2-4.5': 'SSP2-4.5 (Intermediate Mitigation)',
  'ssp3-7.0': 'SSP3-7.0 (High Regional Rivalry)',
  'ssp5-8.5': 'SSP5-8.5 (Very High Fossil-Intensive)',
  'user-custom-scenario': 'User Custom Scenario',
};

const HORIZON_LABELS: Record<ClimateTimeHorizon, string> = {
  'historical-1991-2020': 'Historical Normal (1991–2020)',
  'recent-observed': 'Recent Observed Record',
  'near-term-2021-2040': 'Near-Term Projection (2021–2040)',
  'mid-century-2041-2060': 'Mid-Century Projection (2041–2060)',
  'late-century-2081-2100': 'Late-Century Projection (2081–2100)',
  'custom-horizon': 'Custom Time Horizon',
};

function getQualitativeBadgeStyle(level: QualitativeLevel): {
  bg: string;
  text: string;
  border: string;
  label: string;
} {
  switch (level) {
    case 'very-high':
      return {
        bg: 'bg-rose-100',
        text: 'text-rose-900',
        border: 'border-rose-300',
        label: 'VERY HIGH',
      };
    case 'high':
      return {
        bg: 'bg-orange-100',
        text: 'text-orange-900',
        border: 'border-orange-300',
        label: 'HIGH',
      };
    case 'moderate':
      return {
        bg: 'bg-amber-100',
        text: 'text-amber-900',
        border: 'border-amber-300',
        label: 'MODERATE',
      };
    case 'low':
      return {
        bg: 'bg-emerald-50',
        text: 'text-emerald-800',
        border: 'border-emerald-200',
        label: 'LOW',
      };
    case 'very-low':
      return {
        bg: 'bg-teal-50',
        text: 'text-teal-800',
        border: 'border-teal-200',
        label: 'VERY LOW',
      };
    case 'insufficient-evidence':
      return {
        bg: 'bg-purple-50',
        text: 'text-purple-900',
        border: 'border-purple-200',
        label: 'INSUFFICIENT EVIDENCE',
      };
    case 'unassessed':
    default:
      return {
        bg: 'bg-slate-100',
        text: 'text-slate-700',
        border: 'border-slate-300',
        label: 'UNASSESSED',
      };
  }
}

function getHazardIcon(category: ClimateHazardCategory) {
  switch (category) {
    case 'extreme-heat':
      return ThermometerSun;
    case 'extreme-precipitation':
      return CloudRain;
    case 'flooding':
      return Waves;
    case 'drought-water-stress':
      return Droplets;
    case 'severe-wind-cyclone':
      return Wind;
    case 'wildfire-weather':
      return Flame;
    case 'slope-erosion-landslide':
      return Mountain;
    case 'cold-freeze-thaw-snow':
    default:
      return Snowflake;
  }
}

export const ClimateResilienceWorkspace: React.FC<
  ClimateResilienceWorkspaceProps
> = ({
  project,
  onUpdateProject,
  onBack,
  onOpenSiteContext,
  onOpenTerrain,
  onOpenCarbon,
  onOpenVersionWorkspace,
  onShowToast,
}) => {
  const [activeStage, setActiveStage] = useState<WorkspaceStage>('site-scope');

  const [config, setConfig] = useState<ClimateResilienceConfig>(() =>
    project.climateResilience?.config
      ? {
          ...project.climateResilience.config,
          siteSpecificAttributes: {
            ...createDefaultClimateResilienceConfig().siteSpecificAttributes,
            ...project.climateResilience.config.siteSpecificAttributes,
          },
        }
      : createDefaultClimateResilienceConfig()
  );

  const [customIndicators, setCustomIndicators] = useState<
    ClimateHazardIndicatorRecord[]
  >(() => project.climateResilience?.customIndicators || []);

  const [customSources, setCustomSources] = useState<ClimateDataSourceRecord[]>(
    () => project.climateResilience?.customSources || []
  );

  const [quarantinedImports, setQuarantinedImports] = useState<
    QuarantinedClimateRecord[]
  >(() => project.climateResilience?.quarantinedImports || []);

  // Coordinate confirmation form state
  const [coordLatInput, setCoordLatInput] = useState<string>(
    config.confirmedCoordinatesOverride?.latitude !== undefined
      ? String(config.confirmedCoordinatesOverride.latitude)
      : project.siteContext?.latitude !== undefined
      ? String(project.siteContext.latitude)
      : ''
  );
  const [coordLonInput, setCoordLonInput] = useState<string>(
    config.confirmedCoordinatesOverride?.longitude !== undefined
      ? String(config.confirmedCoordinatesOverride.longitude)
      : project.siteContext?.longitude !== undefined
      ? String(project.siteContext.longitude)
      : ''
  );
  const [coordSourceType, setCoordSourceType] = useState<
    'survey-stamped' | 'municipal-cadastral' | 'user-observation'
  >(config.confirmedCoordinatesOverride?.sourceType || 'survey-stamped');
  const [coordNote, setCoordNote] = useState<string>(
    config.confirmedCoordinatesOverride?.confirmationNote || ''
  );

  // Import evidence state
  const [importPayloadText, setImportPayloadText] = useState<string>('');
  const [importMessage, setImportMessage] = useState<string | null>(null);

  // Live deterministic assessment computation
  const assessment = useMemo(
    () =>
      runClimateHazardResilienceAssessment(
        project,
        config,
        customIndicators,
        customSources
      ),
    [project, config, customIndicators, customSources]
  );

  const staleness = useMemo(
    () => checkClimateAssessmentStaleness(project),
    [project]
  );

  const handleConfirmCoordinates = () => {
    const lat = Number(coordLatInput);
    const lon = Number(coordLonInput);
    if (
      coordLatInput.trim() === '' ||
      coordLonInput.trim() === '' ||
      Number.isNaN(lat) ||
      Number.isNaN(lon)
    ) {
      onShowToast?.(
        'Please enter numeric WGS84 latitude and longitude values.',
        'error'
      );
      return;
    }
    setConfig((prev) => ({
      ...prev,
      confirmedCoordinatesOverride: {
        latitude: lat,
        longitude: lon,
        sourceType: coordSourceType,
        confirmationNote:
          coordNote.trim() || `Confirmed in P45 Workspace (${coordSourceType})`,
      },
    }));
    onShowToast?.(
      `Site coordinates (${lat}, ${lon}) applied for P45 preflight validation.`,
      'info'
    );
  };

  const handleClearCoordinateOverride = () => {
    setConfig((prev) => ({
      ...prev,
      confirmedCoordinatesOverride: null,
    }));
    onShowToast?.('Cleared coordinate override; reverting to Site Context.', 'info');
  };

  const handleToggleMeasure = (measureId: string) => {
    setConfig((prev) => {
      const exists = prev.selectedMeasureIds.includes(measureId);
      const next = exists
        ? prev.selectedMeasureIds.filter((id) => id !== measureId)
        : [...prev.selectedMeasureIds, measureId];
      return {
        ...prev,
        selectedMeasureIds: next,
      };
    });
  };

  const handleSaveAssessmentToProject = () => {
    const updated = applyClimateAssessmentToProject(
      project,
      assessment,
      customIndicators,
      customSources,
      quarantinedImports,
      true
    );
    onUpdateProject(updated);
    onShowToast?.(
      'Saved P45 Climate Hazard & Resilience assessment with rollback checkpoint.',
      'success'
    );
  };

  const handleApplyMeasuresToProject = () => {
    const updated = applySelectedResilienceMeasuresToProject(project, config);
    setConfig(updated.climateResilience!.config);
    onUpdateProject(updated);
    onShowToast?.(
      `Applied ${config.selectedMeasureIds.length} resilience adaptation measure(s) to project with rollback checkpoint.`,
      'success'
    );
  };

  const handleRemoveAssessment = () => {
    const updated = removeClimateAssessmentFromProject(project);
    onUpdateProject(updated);
    onShowToast?.(
      'Removed P45 Climate Resilience metadata (checkpoint created).',
      'info'
    );
  };

  const handleImportCustomEvidence = () => {
    const res = importClimateEvidencePayload(importPayloadText, 'auto');
    if (res.quarantinedRecords.length > 0) {
      setQuarantinedImports((prev) => [...res.quarantinedRecords, ...prev]);
    }
    if (res.importedIndicators.length > 0) {
      setCustomIndicators((prev) => [...prev, ...res.importedIndicators]);
      setCustomSources((prev) => [...prev, ...res.importedSources]);
      setImportMessage(
        `Imported ${res.importedIndicators.length} valid indicator(s). Quarantined ${res.quarantinedRecords.length} malformed record(s).`
      );
      onShowToast?.(
        `Imported ${res.importedIndicators.length} custom climate indicator(s).`,
        'success'
      );
    } else {
      setImportMessage(
        `Import rejected: ${res.errors.join(' ')} (${res.quarantinedRecords.length} record(s) quarantined).`
      );
      onShowToast?.('No valid climate records found in import payload.', 'error');
    }
  };

  const handleDownloadFile = (
    content: string,
    filename: string,
    mimeType: string
  ) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const stages: Array<{ id: WorkspaceStage; number: number; label: string }> = [
    { id: 'site-scope', number: 1, label: 'Site & Scope' },
    { id: 'data-readiness', number: 2, label: 'Data Readiness' },
    { id: 'hazard-explorer', number: 3, label: 'Hazard Explorer' },
    { id: 'exposure-vulnerability', number: 4, label: 'Exposure & Vulnerability' },
    { id: 'risk-findings', number: 5, label: 'Risk Findings' },
    { id: 'resilience-options', number: 6, label: 'Resilience Options' },
    { id: 'report-provenance', number: 7, label: 'Report & Provenance' },
  ];

  const pre = assessment.locationPreflight;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Overview</span>
            </button>
            <span className="text-slate-300">·</span>
            <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-sky-100 text-sky-900 rounded border border-sky-200">
              {CLIMATE_ASSESSMENT_PROFILE_ID}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <CloudRain className="w-6 h-6 text-sky-700" />
            <span>P45 — Climate Hazard & Resilience Analyzer</span>
          </h1>
          <p className="text-xs text-slate-600 max-w-3xl">
            Multi-hazard screening separating climate hazards, site/building exposure, asset
            vulnerability, adaptive capacity, and residual risk across historical baselines and
            CMIP6 future scenarios.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onOpenSiteContext && (
            <button
              onClick={() => onOpenSiteContext(project)}
              className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg cursor-pointer"
            >
              Site Context (P33)
            </button>
          )}
          {onOpenTerrain && (
            <button
              onClick={() => onOpenTerrain(project)}
              className="px-3 py-1.5 text-xs font-semibold text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg cursor-pointer"
            >
              Terrain Model (P43)
            </button>
          )}
          {onOpenCarbon && (
            <button
              onClick={() => onOpenCarbon(project)}
              className="px-3 py-1.5 text-xs font-semibold text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg cursor-pointer"
            >
              Whole-Life Carbon (P44)
            </button>
          )}
          <button
            onClick={handleSaveAssessmentToProject}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs cursor-pointer"
          >
            <Save className="w-3.5 h-3.5 text-teal-400" />
            <span>Save Assessment & Checkpoint</span>
          </button>
        </div>
      </div>

      {/* Staleness Alert if saved assessment is outdated */}
      {staleness.isStale && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 space-y-0.5">
              <div className="font-bold">
                Saved Climate Assessment Is Stale Relative to Current Project State
              </div>
              <ul className="list-disc list-inside text-amber-800">
                {staleness.staleReasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          </div>
          <button
            onClick={handleSaveAssessmentToProject}
            className="px-3 py-1.5 bg-amber-900 hover:bg-amber-800 text-white rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer"
          >
            Re-Save Updated Assessment
          </button>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
            Location Preflight
          </span>
          <span
            className={`text-xs font-bold mt-1 inline-block px-2 py-0.5 rounded border ${
              pre.canRunLocationSpecificScreening
                ? pre.status === 'valid-geographic-location'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-amber-50 text-amber-800 border-amber-200'
                : 'bg-rose-50 text-rose-800 border-rose-200'
            }`}
          >
            {pre.status.replace(/-/g, ' ').toUpperCase()}
          </span>
          <span className="text-[11px] text-slate-500 block mt-1 truncate">
            {pre.latitude !== null && pre.longitude !== null
              ? `${pre.latitude.toFixed(3)}°, ${pre.longitude.toFixed(3)}°`
              : 'Coordinates missing'}
          </span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
            Active Scenario
          </span>
          <span className="text-sm font-bold text-slate-900 mt-1 block uppercase">
            {config.activeScenario}
          </span>
          <span className="text-[11px] text-slate-500 block mt-0.5 truncate">
            {config.activeTimeHorizon}
          </span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
            Hazards Screened
          </span>
          <span className="text-lg font-bold text-slate-900 tabular-nums mt-0.5 block">
            {assessment.summaryCounts.hazardsAssessed} /{' '}
            {assessment.summaryCounts.totalHazardsCataloged}
          </span>
          <span className="text-[11px] text-purple-700 font-medium block">
            {assessment.summaryCounts.hazardsInsufficientOrUnassessed} insufficient/unassessed
          </span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
            High / Very High Risk
          </span>
          <span
            className={`text-lg font-bold tabular-nums mt-0.5 block ${
              assessment.summaryCounts.highOrVeryHighRiskFindings > 0
                ? 'text-rose-700'
                : 'text-slate-900'
            }`}
          >
            {assessment.summaryCounts.highOrVeryHighRiskFindings} Findings
          </span>
          <span className="text-[11px] text-slate-500 block">
            {assessment.summaryCounts.moderateRiskFindings} moderate risk
          </span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
            Evidence Gaps
          </span>
          <span className="text-lg font-bold text-purple-900 tabular-nums mt-0.5 block">
            {assessment.summaryCounts.unassessedRiskFindings} Findings
          </span>
          <span className="text-[11px] text-slate-500 block">
            Never treated as low risk
          </span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
            Resilience Measures
          </span>
          <span className="text-lg font-bold text-teal-800 tabular-nums mt-0.5 block">
            {assessment.summaryCounts.selectedAdaptationMeasures} Selected
          </span>
          <span className="text-[11px] text-slate-500 block">
            of {assessment.adaptationMeasures.length} options
          </span>
        </div>
      </div>

      {/* 7-Stage Step Navigation */}
      <nav
        aria-label="Climate Hazard and Resilience Workflow Stages"
        className="bg-white p-2 rounded-xl border border-slate-200 shadow-2xs flex flex-wrap gap-1.5"
      >
        {stages.map((st) => {
          const isCurrent = activeStage === st.id;
          return (
            <button
              key={st.id}
              onClick={() => setActiveStage(st.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                isCurrent
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full text-[11px] flex items-center justify-center font-bold ${
                  isCurrent
                    ? 'bg-teal-400 text-slate-950'
                    : 'bg-slate-200 text-slate-700'
                }`}
              >
                {st.number}
              </span>
              <span>{st.label}</span>
            </button>
          );
        })}
      </nav>

      {/* =================================================================== */}
      {/* STAGE 1: SITE & SCOPE                                               */}
      {/* =================================================================== */}
      {activeStage === 'site-scope' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left 7 cols: Location Preflight & Coordinate Confirmation */}
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-sky-700" />
                  <h2 className="text-sm font-bold text-slate-900">
                    Site Location & Spatial Preflight Validation
                  </h2>
                </div>
                <span className="text-xs font-mono text-slate-500">
                  Source: {pre.coordinateSource}
                </span>
              </div>

              {pre.blockingIssues.length > 0 && (
                <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-rose-900">
                    <ShieldAlert className="w-4 h-4 text-rose-700 shrink-0" />
                    <span>Location Preflight Blocking Issue(s)</span>
                  </div>
                  <ul className="list-disc list-inside text-xs text-rose-800 space-y-1">
                    {pre.blockingIssues.map((iss, idx) => (
                      <li key={idx}>{iss}</li>
                    ))}
                  </ul>
                </div>
              )}

              {pre.warnings.length > 0 && (
                <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                    <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                    <span>Spatial Resolution & Coordinate Warnings</span>
                  </div>
                  <ul className="list-disc list-inside text-xs text-amber-800 space-y-1">
                    {pre.warnings.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80">
                  <span className="text-[10px] font-semibold uppercase text-slate-400 block">
                    WGS84 Latitude / Longitude
                  </span>
                  <span className="font-bold text-slate-900 font-mono mt-0.5 block">
                    {pre.latitude !== null && pre.longitude !== null
                      ? `${pre.latitude.toFixed(4)}°, ${pre.longitude.toFixed(4)}°`
                      : 'Not Set'}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80">
                  <span className="text-[10px] font-semibold uppercase text-slate-400 block">
                    Location Confidence
                  </span>
                  <span className="font-bold text-slate-900 capitalize mt-0.5 block">
                    {pre.locationConfidence.replace(/-/g, ' ')}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80">
                  <span className="text-[10px] font-semibold uppercase text-slate-400 block">
                    Detected Jurisdiction
                  </span>
                  <span className="font-bold text-slate-900 uppercase mt-0.5 block">
                    {pre.detectedJurisdictionScope}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80">
                  <span className="text-[10px] font-semibold uppercase text-slate-400 block">
                    Parcel Footprint (m)
                  </span>
                  <span className="font-bold text-slate-900 tabular-nums mt-0.5 block">
                    {pre.parcelFootprintMeters.widthM} m ×{' '}
                    {pre.parcelFootprintMeters.lengthM} m
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80">
                  <span className="text-[10px] font-semibold uppercase text-slate-400 block">
                    Climate Grid vs Parcel
                  </span>
                  <span className="font-bold text-slate-900 tabular-nums mt-0.5 block">
                    25–100 km grid vs {pre.parcelFootprintMeters.diagonalSpanKm} km
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80">
                  <span className="text-[10px] font-semibold uppercase text-slate-400 block">
                    P43 Terrain Datum
                  </span>
                  <span className="font-bold text-slate-900 mt-0.5 block truncate">
                    {pre.terrainAlignmentCheck.hasTerrainModel
                      ? `${pre.terrainAlignmentCheck.verticalDatum} (${pre.terrainAlignmentCheck.footprintReliefM}m relief)`
                      : 'No P43 Surface'}
                  </span>
                </div>
              </div>

              {/* Explicit Coordinate Confirmation Form */}
              <div className="pt-4 border-t border-slate-200 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-bold text-slate-900">
                      Confirm or Supply Verified Geographic Coordinates (WGS84)
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Plotify never guesses coordinates from a city name. Supply or confirm numeric
                      latitude (-90..90) and longitude (-180..180).
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setCoordLatInput('31.5204');
                        setCoordLonInput('74.3587');
                        setCoordSourceType('survey-stamped');
                        setCoordNote('Lahore, Pakistan (Indus Basin Reference Site)');
                      }}
                      className="px-2 py-1 text-[11px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded cursor-pointer"
                    >
                      Fill Lahore Benchmark
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCoordLatInput('29.7604');
                        setCoordLonInput('-95.3698');
                        setCoordSourceType('municipal-cadastral');
                        setCoordNote('Houston, TX (US Gulf Subtropical Reference Site)');
                      }}
                      className="px-2 py-1 text-[11px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded cursor-pointer"
                    >
                      Fill Houston Benchmark
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label
                      htmlFor="p45-lat-input"
                      className="block text-[11px] font-semibold text-slate-700 mb-1"
                    >
                      Latitude (°N/S, -90 to 90)
                    </label>
                    <input
                      id="p45-lat-input"
                      type="number"
                      step="0.0001"
                      value={coordLatInput}
                      onChange={(e) => setCoordLatInput(e.target.value)}
                      placeholder="e.g. 31.5204"
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="p45-lon-input"
                      className="block text-[11px] font-semibold text-slate-700 mb-1"
                    >
                      Longitude (°E/W, -180 to 180)
                    </label>
                    <input
                      id="p45-lon-input"
                      type="number"
                      step="0.0001"
                      value={coordLonInput}
                      onChange={(e) => setCoordLonInput(e.target.value)}
                      placeholder="e.g. 74.3587"
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="p45-coord-source"
                      className="block text-[11px] font-semibold text-slate-700 mb-1"
                    >
                      Verification Evidence Basis
                    </label>
                    <select
                      id="p45-coord-source"
                      value={coordSourceType}
                      onChange={(e) =>
                        setCoordSourceType(
                          e.target.value as
                            | 'survey-stamped'
                            | 'municipal-cadastral'
                            | 'user-observation'
                        )
                      }
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                    >
                      <option value="survey-stamped">Survey-Stamped Benchmark</option>
                      <option value="municipal-cadastral">Municipal Cadastral Parcel</option>
                      <option value="user-observation">User Observation</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleConfirmCoordinates}
                    className="px-3.5 py-1.5 bg-sky-700 hover:bg-sky-800 text-white rounded-lg text-xs font-semibold cursor-pointer"
                  >
                    Confirm Coordinates for Screening
                  </button>
                  {config.confirmedCoordinatesOverride && (
                    <button
                      type="button"
                      onClick={handleClearCoordinateOverride}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium cursor-pointer"
                    >
                      Clear Override
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right 5 cols: Scenario, Horizon & Site-Specific Resilience Attributes */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <Sliders className="w-4 h-4 text-teal-700" />
                <h2 className="text-sm font-bold text-slate-900">
                  Climate Scenario, Time Horizon & Site Attributes
                </h2>
              </div>

              <div className="space-y-3">
                <div>
                  <label
                    htmlFor="p45-active-scenario"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Primary Evaluation Scenario (CMIP6 SSP)
                  </label>
                  <select
                    id="p45-active-scenario"
                    value={config.activeScenario}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        activeScenario: e.target.value as ClimateScenarioId,
                      }))
                    }
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg font-medium"
                  >
                    {Object.entries(SCENARIO_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="p45-comp-scenario"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Comparison Scenario (Side-by-Side Sensitivity)
                  </label>
                  <select
                    id="p45-comp-scenario"
                    value={config.comparisonScenario}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        comparisonScenario: e.target.value as ClimateScenarioId,
                      }))
                    }
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg font-medium"
                  >
                    {Object.entries(SCENARIO_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="p45-time-horizon"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Projection Time Horizon
                  </label>
                  <select
                    id="p45-time-horizon"
                    value={config.activeTimeHorizon}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        activeTimeHorizon: e.target.value as ClimateTimeHorizon,
                      }))
                    }
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg font-medium"
                  >
                    {Object.entries(HORIZON_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Site-Specific Engineering Attributes */}
              <div className="pt-3 border-t border-slate-100 space-y-3">
                <h3 className="text-xs font-bold text-slate-900">
                  Site-Specific Engineering Attributes (Leave blank if unknown)
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label
                      htmlFor="p45-ffe-input"
                      className="block text-[11px] font-medium text-slate-600 mb-1"
                    >
                      Ground Floor FFE Above Grade (m)
                    </label>
                    <input
                      id="p45-ffe-input"
                      type="number"
                      step="0.05"
                      value={
                        config.siteSpecificAttributes
                          .finishedFloorElevationAboveGroundM ?? ''
                      }
                      onChange={(e) => {
                        const val =
                          e.target.value === '' ? null : Number(e.target.value);
                        setConfig((prev) => ({
                          ...prev,
                          siteSpecificAttributes: {
                            ...prev.siteSpecificAttributes,
                            finishedFloorElevationAboveGroundM: val,
                          },
                        }));
                      }}
                      placeholder="Unknown (null)"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="p45-flood-zone-input"
                      className="block text-[11px] font-medium text-slate-600 mb-1"
                    >
                      Official Flood Zone (FEMA / PMD)
                    </label>
                    <input
                      id="p45-flood-zone-input"
                      type="text"
                      value={
                        config.siteSpecificAttributes.officialFloodZoneLabel ?? ''
                      }
                      onChange={(e) => {
                        const val =
                          e.target.value.trim() === ''
                            ? null
                            : e.target.value.trim();
                        setConfig((prev) => ({
                          ...prev,
                          siteSpecificAttributes: {
                            ...prev.siteSpecificAttributes,
                            officialFloodZoneLabel: val,
                          },
                        }));
                      }}
                      placeholder="e.g. Zone AE / Zone X / Unmapped"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="p45-rainwater-input"
                      className="block text-[11px] font-medium text-slate-600 mb-1"
                    >
                      On-Site Rainwater Storage (Liters)
                    </label>
                    <input
                      id="p45-rainwater-input"
                      type="number"
                      step="500"
                      value={
                        config.siteSpecificAttributes
                          .hasOnSiteRainwaterStorageLiters ?? ''
                      }
                      onChange={(e) => {
                        const val =
                          e.target.value === '' ? null : Number(e.target.value);
                        setConfig((prev) => ({
                          ...prev,
                          siteSpecificAttributes: {
                            ...prev.siteSpecificAttributes,
                            hasOnSiteRainwaterStorageLiters: val,
                          },
                        }));
                      }}
                      placeholder="Unknown (null)"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="p45-wind-input"
                      className="block text-[11px] font-medium text-slate-600 mb-1"
                    >
                      Code Design Wind Speed (m/s)
                    </label>
                    <input
                      id="p45-wind-input"
                      type="number"
                      step="1"
                      value={
                        config.siteSpecificAttributes.codeDesignWindSpeedMs ?? ''
                      }
                      onChange={(e) => {
                        const val =
                          e.target.value === '' ? null : Number(e.target.value);
                        setConfig((prev) => ({
                          ...prev,
                          siteSpecificAttributes: {
                            ...prev.siteSpecificAttributes,
                            codeDesignWindSpeedMs: val,
                          },
                        }));
                      }}
                      placeholder="Unknown (null)"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 pt-2 text-xs">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(
                        config.siteSpecificAttributes.hasBackflowPrevention
                      )}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          siteSpecificAttributes: {
                            ...prev.siteSpecificAttributes,
                            hasBackflowPrevention: e.target.checked,
                          },
                        }))
                      }
                    />
                    <span>Sanitary Backflow Valve Confirmed</span>
                  </label>

                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={
                        config.siteSpecificAttributes
                          .geotechnicalSlopeReportAvailable
                      }
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          siteSpecificAttributes: {
                            ...prev.siteSpecificAttributes,
                            geotechnicalSlopeReportAvailable: e.target.checked,
                          },
                        }))
                      }
                    />
                    <span>Geotechnical Slope Report Available</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* STAGE 2: DATA READINESS                                             */}
      {/* =================================================================== */}
      {activeStage === 'data-readiness' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-sky-700" />
                <h2 className="text-sm font-bold text-slate-900">
                  Authoritative Climate & Hazard Data Source Registry
                </h2>
              </div>
              <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(config.simulateOfflineMode)}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      simulateOfflineMode: e.target.checked,
                    }))
                  }
                />
                <span>Simulate Offline / Live Connector Outage</span>
              </label>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold">
                    <th className="py-2.5 px-3">Source ID & Name</th>
                    <th className="py-2.5 px-3">Temporal Class</th>
                    <th className="py-2.5 px-3">Baseline Period</th>
                    <th className="py-2.5 px-3">Grid Resolution</th>
                    <th className="py-2.5 px-3">Jurisdiction Scope</th>
                    <th className="py-2.5 px-3">Verification Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {assessment.dataSources.map((src) => (
                    <tr key={src.sourceId} className="hover:bg-slate-50/70">
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-900">{src.name}</div>
                        <div className="text-[11px] font-mono text-slate-500">
                          {src.sourceId} · {src.versionOrRelease}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {src.limitations[0]}
                        </div>
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] text-slate-700">
                        {src.temporalClass}
                      </td>
                      <td className="py-3 px-3 text-slate-700">{src.baselinePeriod}</td>
                      <td className="py-3 px-3 font-semibold tabular-nums text-slate-800">
                        {src.spatialResolutionKm} km
                      </td>
                      <td className="py-3 px-3 uppercase font-semibold text-[11px] text-slate-700">
                        {src.jurisdictionScope}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold border ${
                            src.verificationStatus === 'verified-reference-fixture' ||
                            src.verificationStatus === 'user-imported-evidence'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : src.verificationStatus === 'out-of-jurisdiction'
                              ? 'bg-slate-100 text-slate-600 border-slate-200'
                              : 'bg-amber-50 text-amber-800 border-amber-200'
                          }`}
                        >
                          {src.verificationStatus}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Custom Evidence Import & Quarantine Panel */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Upload className="w-4 h-4 text-teal-700" />
                <h3 className="text-sm font-bold text-slate-900">
                  Import Site-Specific Climate Evidence (JSON or CSV with Validation & Quarantine)
                </h3>
              </div>
              <button
                type="button"
                onClick={() =>
                  setImportPayloadText(
                    `hazardCategory,indicatorCode,label,scenario,timeHorizon,historicalBaselineValue,projectedOrObservedValue,unit,spatialResolutionKm,sourceId,sourceCitation\nextreme-heat,TXx,Site Station Max Daily Temperature,ssp2-4.5,mid-century-2041-2060,44.0,46.8,°C,5,SRC-USER-STATION,Local Meteorological Station Downscaled Report`
                  )
                }
                className="px-2.5 py-1 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded cursor-pointer"
              >
                Load Sample Valid CSV
              </button>
            </div>

            <textarea
              rows={4}
              value={importPayloadText}
              onChange={(e) => setImportPayloadText(e.target.value)}
              placeholder="Paste JSON array or CSV rows (hazardCategory,indicatorCode,label,scenario,timeHorizon,historicalBaselineValue,projectedOrObservedValue,unit...)"
              className="w-full p-3 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg"
            />

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleImportCustomEvidence}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold cursor-pointer"
              >
                Validate & Import Evidence
              </button>
              {importMessage && (
                <span className="text-xs font-medium text-slate-700">
                  {importMessage}
                </span>
              )}
            </div>

            {quarantinedImports.length > 0 && (
              <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 space-y-2">
                <div className="text-xs font-bold text-amber-900">
                  Quarantined Climate Evidence Records ({quarantinedImports.length}) — Excluded from Calculations
                </div>
                <ul className="text-xs text-amber-800 space-y-1 font-mono">
                  {quarantinedImports.slice(0, 5).map((q, idx) => (
                    <li key={idx}>
                      Row {q.rowOrItemIndex}: {q.rejectionReason} — {q.rawRecord}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* STAGE 3: HAZARD EXPLORER                                            */}
      {/* =================================================================== */}
      {activeStage === 'hazard-explorer' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {assessment.hazards.map((haz) => {
              const Icon = getHazardIcon(haz.hazardCategory);
              const badge = getQualitativeBadgeStyle(haz.hazardSeverityLevel);

              return (
                <div
                  key={haz.hazardCategory}
                  className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-3"
                >
                  <div className="flex items-start justify-between gap-2 pb-2 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4 text-sky-700 shrink-0" />
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">
                          {haz.title}
                        </h3>
                        <span className="text-[11px] font-mono text-slate-500">
                          Status: {haz.screeningStatus} · Confidence: {haz.confidenceLevel}
                        </span>
                      </div>
                    </div>
                    <span
                      className={`px-2.5 py-0.5 rounded text-[11px] font-bold border ${badge.bg} ${badge.text} ${badge.border}`}
                    >
                      {badge.label}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600">{haz.confidenceRationale}</p>

                  {/* Flood Sub-Types Breakdown if Flooding */}
                  {haz.floodSubTypeBreakdown && (
                    <div className="space-y-1.5 pt-1">
                      <div className="text-[11px] font-bold uppercase text-slate-500">
                        Flood Mechanism Separation (Never Conflated):
                      </div>
                      {haz.floodSubTypeBreakdown.map((sub) => {
                        const subBadge = getQualitativeBadgeStyle(sub.severityLevel);
                        return (
                          <div
                            key={sub.subType}
                            className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80 text-xs space-y-1"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-slate-800">
                                {sub.label}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold border ${subBadge.bg} ${subBadge.text} ${subBadge.border}`}
                              >
                                {subBadge.label}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-600">{sub.evidenceNote}</p>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Quantitative Indicators */}
                  {haz.indicators.length > 0 && (
                    <div className="space-y-2 pt-1">
                      {haz.indicators.map((ind) => (
                        <div
                          key={ind.indicatorId}
                          className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80 text-xs"
                        >
                          <div className="flex items-center justify-between font-semibold text-slate-800">
                            <span>
                              {ind.label} ({ind.indicatorCode})
                            </span>
                            <span className="font-mono text-sky-900">
                              {ind.projectedOrObservedValue} {ind.unit}
                              {ind.deltaFromBaseline !== null && (
                                <span className="text-slate-500 ml-1">
                                  ({ind.deltaFromBaseline >= 0 ? '+' : ''}
                                  {ind.deltaFromBaseline} vs {ind.baselinePeriod})
                                </span>
                              )}
                            </span>
                          </div>
                          {ind.uncertaintyRange && (
                            <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                              Ensemble Spread: p10={ind.uncertaintyRange.p10} · p50=
                              {ind.uncertaintyRange.p50} · p90={ind.uncertaintyRange.p90}{' '}
                              {ind.unit} ({ind.spatialResolutionKm} km grid)
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Scientific Boundary Notices */}
                  <div className="p-2.5 rounded-lg bg-sky-50/70 border border-sky-100 text-[11px] text-sky-950 space-y-1">
                    {haz.scientificBoundaryNotices.map((notice, nIdx) => (
                      <div key={nIdx} className="flex items-start gap-1.5">
                        <Info className="w-3.5 h-3.5 text-sky-700 shrink-0 mt-0.5" />
                        <span>{notice}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Scenario & Time Horizon Comparison Table */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-3">
            <h3 className="text-sm font-bold text-slate-900">
              Scenario Comparison Table ({config.activeScenario.toUpperCase()} vs{' '}
              {config.comparisonScenario.toUpperCase()} at {config.activeTimeHorizon})
            </h3>
            {assessment.scenarioComparison.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold">
                      <th className="py-2.5 px-3">Indicator</th>
                      <th className="py-2.5 px-3 text-right">
                        Historical Baseline (1991–2020)
                      </th>
                      <th className="py-2.5 px-3 text-right">
                        Active ({config.activeScenario.toUpperCase()})
                      </th>
                      <th className="py-2.5 px-3 text-right">
                        Comparison ({config.comparisonScenario.toUpperCase()})
                      </th>
                      <th className="py-2.5 px-3 text-right">Scenario Delta</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {assessment.scenarioComparison.map((row) => (
                      <tr key={row.indicatorCode}>
                        <td className="py-2.5 px-3 font-medium text-slate-900">
                          {row.indicatorLabel} ({row.unit})
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                          {row.baselineValue ?? 'N/A'} {row.unit}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold tabular-nums text-sky-900">
                          {row.activeScenarioValue ?? 'N/A'} {row.unit}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold tabular-nums text-amber-900">
                          {row.comparisonScenarioValue ?? 'N/A'} {row.unit}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                          {row.deltaBetweenScenarios !== null
                            ? `${row.deltaBetweenScenarios >= 0 ? '+' : ''}${row.deltaBetweenScenarios} ${row.unit}`
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                Confirm valid site coordinates in Stage 1 or import custom indicator evidence in
                Stage 2 to populate quantitative scenario comparisons.
              </p>
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* STAGE 4: EXPOSURE & VULNERABILITY                                   */}
      {/* =================================================================== */}
      {activeStage === 'exposure-vulnerability' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Layers className="w-4 h-4 text-teal-700" />
              <h2 className="text-sm font-bold text-slate-900">
                Project Asset Exposure Mapping (Linked to Actual Plotify Elements)
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {assessment.exposureMappings.map((exp) => {
                const badge = getQualitativeBadgeStyle(exp.exposureLevel);
                return (
                  <div
                    key={exp.id}
                    className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900">{exp.title}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border ${badge.bg} ${badge.text} ${badge.border}`}
                      >
                        EXPOSURE: {badge.label}
                      </span>
                    </div>
                    <p className="text-slate-600">{exp.spatialBasis}</p>

                    {exp.linkedProjectElements.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold uppercase text-slate-400 block">
                          Linked Project Elements ({exp.linkedProjectElements.length}):
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {exp.linkedProjectElements.slice(0, 6).map((el) => (
                            <span
                              key={el.elementId}
                              className="px-2 py-0.5 bg-white border border-slate-200 rounded text-[11px] text-slate-700"
                            >
                              {el.elementName}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {exp.missingAttributes.length > 0 && (
                      <div className="p-2 rounded bg-purple-50 border border-purple-200 text-[11px] text-purple-900">
                        <strong>Missing / Unverified Attributes:</strong>{' '}
                        {exp.missingAttributes.join(', ')}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-4">
            <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
              Asset Sensitivity, Vulnerability & Existing Adaptive Capacity
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {assessment.vulnerabilities.map((vuln) => {
                const vBadge = getQualitativeBadgeStyle(vuln.vulnerabilityLevel);
                return (
                  <div
                    key={vuln.id}
                    className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 uppercase">
                        {vuln.assetCategory.replace(/-/g, ' ')} × {vuln.hazardCategory}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border ${vBadge.bg} ${vBadge.text} ${vBadge.border}`}
                      >
                        VULN: {vBadge.label}
                      </span>
                    </div>
                    <ul className="list-disc list-inside text-slate-600 space-y-1">
                      {vuln.sensitivityDrivers.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                    <div className="text-[11px] text-teal-900 font-medium">
                      Existing Adaptive Capacity: {vuln.existingAdaptiveCapacityLevel.toUpperCase()}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* STAGE 5: RISK FINDINGS                                              */}
      {/* =================================================================== */}
      {activeStage === 'risk-findings' && (
        <div className="space-y-4">
          {assessment.riskFindings.map((finding) => {
            const inhBadge = getQualitativeBadgeStyle(finding.inherentRiskLevel);
            const resBadge = getQualitativeBadgeStyle(finding.residualRiskLevel);

            return (
              <div
                key={finding.findingId}
                className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono font-bold text-slate-500">
                        {finding.findingId}
                      </span>
                      <span className="text-xs text-slate-400">·</span>
                      <span className="text-xs font-semibold text-sky-800 uppercase">
                        {finding.hazardCategory}
                        {finding.floodSubType ? ` (${finding.floodSubType})` : ''}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 mt-0.5">
                      {finding.title}
                    </h3>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2.5 py-1 rounded text-[11px] font-bold border ${inhBadge.bg} ${inhBadge.text} ${inhBadge.border}`}
                    >
                      Inherent: {inhBadge.label}
                    </span>
                    <span className="text-xs text-slate-400">→</span>
                    <span
                      className={`px-2.5 py-1 rounded text-[11px] font-bold border ${resBadge.bg} ${resBadge.text} ${resBadge.border}`}
                    >
                      Residual: {resBadge.label}
                    </span>
                  </div>
                </div>

                {/* Component Separation Bar */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                  <div className="p-2 bg-slate-50 rounded border border-slate-200/70">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">
                      1. Hazard Level
                    </span>
                    <span className="font-bold text-slate-800 uppercase">
                      {finding.hazardLevel}
                    </span>
                  </div>
                  <div className="p-2 bg-slate-50 rounded border border-slate-200/70">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">
                      2. Exposure Level
                    </span>
                    <span className="font-bold text-slate-800 uppercase">
                      {finding.exposureLevel}
                    </span>
                  </div>
                  <div className="p-2 bg-slate-50 rounded border border-slate-200/70">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">
                      3. Vulnerability
                    </span>
                    <span className="font-bold text-slate-800 uppercase">
                      {finding.vulnerabilityLevel}
                    </span>
                  </div>
                  <div className="p-2 bg-slate-50 rounded border border-slate-200/70">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">
                      4. Adaptive Cap.
                    </span>
                    <span className="font-bold text-slate-800 uppercase">
                      {finding.adaptiveCapacityLevel}
                    </span>
                  </div>
                  <div className="p-2 bg-slate-50 rounded border border-slate-200/70">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">
                      5. Consequence
                    </span>
                    <span className="font-bold text-slate-800 truncate block">
                      {finding.consequenceCategory.replace(/-/g, ' ')}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-slate-700">
                  <strong>Consequence:</strong> {finding.consequenceDescription}
                </p>

                {/* Rule & Evidence Trace */}
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/80 text-[11px] space-y-1 font-mono text-slate-700">
                  <div>
                    <strong>Rule Trace:</strong> {finding.ruleAndThresholdTrace.ruleId} —{' '}
                    {finding.ruleAndThresholdTrace.ruleExpression}
                  </div>
                  <div>
                    <strong>Captured Inputs:</strong>{' '}
                    {JSON.stringify(finding.ruleAndThresholdTrace.inputsUsed)}
                  </div>
                  <div>
                    <strong>Limitations & Specialist Review:</strong>{' '}
                    {finding.ruleAndThresholdTrace.limitations[0]} (Requires:{' '}
                    {finding.requiresSpecialistEngineering})
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* =================================================================== */}
      {/* STAGE 6: RESILIENCE OPTIONS (WITH PREVIEW & P44 CARBON CONTEXT)     */}
      {/* =================================================================== */}
      {activeStage === 'resilience-options' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-sm font-bold text-slate-900">
                Explainable Resilience & Adaptation Measures (Preview Before Apply)
              </h2>
              <p className="text-xs text-slate-600">
                Select candidate adaptation measures to preview their effect on vulnerability,
                residual risk, project parameters, and P44 Whole-Life Carbon trade-offs.
              </p>
            </div>
            <button
              type="button"
              disabled={config.selectedMeasureIds.length === 0}
              onClick={handleApplyMeasuresToProject}
              className="px-4 py-2 bg-teal-700 hover:bg-teal-800 disabled:bg-slate-300 text-white rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              Apply {config.selectedMeasureIds.length} Selected Measure(s) & Checkpoint
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {assessment.adaptationMeasures.map((meas) => {
              return (
                <div
                  key={meas.measureId}
                  className={`rounded-xl border p-5 transition-all space-y-3 ${
                    meas.selectedByUser
                      ? 'bg-teal-50/40 border-teal-400 shadow-xs'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={meas.selectedByUser}
                        onChange={() => handleToggleMeasure(meas.measureId)}
                        className="mt-1 w-4 h-4 accent-teal-700"
                      />
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold text-slate-900">
                            {meas.title}
                          </span>
                          <span className="px-2 py-0.5 text-[10px] font-mono bg-slate-100 text-slate-700 rounded">
                            {meas.measureId}
                          </span>
                          <span className="px-2 py-0.5 text-[10px] font-semibold bg-sky-100 text-sky-900 rounded">
                            {meas.applicabilityStatus}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-1">
                          {meas.designActionSummary}
                        </p>
                      </div>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs pt-2">
                    {/* Expected Risk Reduction */}
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/80 space-y-1">
                      <span className="text-[10px] font-bold uppercase text-slate-400 block">
                        Vulnerability & Residual Risk Effect
                      </span>
                      <div className="font-semibold text-slate-800">
                        Vulnerability: {meas.expectedVulnerabilityReduction.fromLevel.toUpperCase()}{' '}
                        → {meas.expectedVulnerabilityReduction.toLevel.toUpperCase()}
                      </div>
                      <p className="text-[11px] text-slate-600">
                        {meas.expectedVulnerabilityReduction.qualitativeBenefitSummary}
                      </p>
                    </div>

                    {/* Preview Parameter Diff */}
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/80 space-y-1">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-slate-400">
                        <Eye className="w-3.5 h-3.5 text-teal-700" />
                        <span>Parameter Preview ({meas.projectParameterPreview.targetModule})</span>
                      </div>
                      <div className="font-mono text-[11px] text-teal-900 font-semibold">
                        {meas.projectParameterPreview.previewDiffSummary}
                      </div>
                      <p className="text-[11px] text-slate-600">
                        {meas.projectParameterPreview.parameterChangeDescription}
                      </p>
                    </div>

                    {/* P44 Embodied Carbon Trade-Off */}
                    <div className="p-3 rounded-lg bg-emerald-50/60 border border-emerald-200 space-y-1">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-emerald-800">
                        <Leaf className="w-3.5 h-3.5 text-emerald-700" />
                        <span>P44 Whole-Life Carbon Trade-Off</span>
                      </div>
                      <div className="font-semibold text-emerald-950">
                        Direction: {meas.embodiedCarbonTradeOff.estimatedEmbodiedCarbonDirection}
                        {meas.embodiedCarbonTradeOff.estimatedDeltaKgCO2eRange &&
                          ` (${meas.embodiedCarbonTradeOff.estimatedDeltaKgCO2eRange.minKgCO2e} to ${meas.embodiedCarbonTradeOff.estimatedDeltaKgCO2eRange.maxKgCO2e} kgCO₂e)`}
                      </div>
                      <p className="text-[11px] text-emerald-900">
                        {meas.embodiedCarbonTradeOff.p44CrossReferenceNote}
                      </p>
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-500 flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
                    <span>
                      <strong>Residual Risk Note:</strong> {meas.residualRiskAfterMeasure}
                    </span>
                    <span>
                      <strong>Sign-Off:</strong> {meas.professionalSignOffRequired}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* STAGE 7: REPORT & PROVENANCE                                        */}
      {/* =================================================================== */}
      {activeStage === 'report-provenance' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-sky-700" />
                <h2 className="text-sm font-bold text-slate-900">
                  Export Climate Hazard & Resilience Assessment Package
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    handleDownloadFile(
                      exportClimateResilienceJSON(project, assessment),
                      `${project.id}-climate-resilience-p45.json`,
                      'application/json'
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-teal-400" />
                  <span>Export JSON</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleDownloadFile(
                      exportClimateResilienceCSV(assessment),
                      `${project.id}-climate-risk-findings-p45.csv`,
                      'text/csv'
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-slate-600" />
                  <span>Export Risk Table CSV</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleDownloadFile(
                      exportClimateResilienceMarkdownReport(project, assessment),
                      `${project.id}-climate-resilience-report-p45.md`,
                      'text/markdown'
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-900 border border-sky-200 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-sky-700" />
                  <span>Export Markdown Dossier</span>
                </button>
              </div>
            </div>

            {/* Mandatory Scope & Engineering Disclaimers */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-teal-700" />
                <span>Mandatory Scientific & Engineering Scope Disclaimers</span>
              </div>
              <ul className="list-disc list-inside text-xs text-slate-600 space-y-1">
                {assessment.scopeAndMethodologyDisclaimers.map((disc, i) => (
                  <li key={i}>{disc}</li>
                ))}
              </ul>
            </div>

            {/* Persistence & Rollback Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
              <div className="text-xs text-slate-500">
                Saved Assessments in History:{' '}
                <strong>
                  {project.climateResilience?.assessmentHistory?.length || 0}
                </strong>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {onOpenVersionWorkspace && (
                  <button
                    type="button"
                    onClick={() => onOpenVersionWorkspace(project, 'timeline')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-teal-700" />
                    <span>Open Version Checkpoints & Rollback</span>
                  </button>
                )}
                {project.climateResilience && (
                  <button
                    type="button"
                    onClick={handleRemoveAssessment}
                    className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 rounded-lg text-xs font-semibold cursor-pointer"
                  >
                    Remove Climate Resilience Data
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
