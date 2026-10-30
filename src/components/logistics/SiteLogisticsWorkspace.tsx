/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * P47 — Construction Site Logistics Planner Workspace
 * Interactive 2D Site Logistics Canvas, Phased Traffic & Pedestrian Routing,
 * Material Storage & Delivery Scheduling, Crane & Lifting Safety Gates,
 * Conflict & Risk Inspector, Non-Destructive Alternative Comparison, and Report Export.
 */

import React, { useState, useMemo } from 'react';
import {
  ArrowLeft,
  Truck,
  HardHat,
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  Layers,
  Calendar,
  MapPin,
  Package,
  Compass,
  Download,
  Save,
  RotateCcw,
  Plus,
  Trash2,
  GitCompare,
  History,
  FileCode2,
  FileSpreadsheet,
  Mountain,
  Leaf,
  CloudRain,
  Thermometer,
  Eye,
  Wrench,
  Flame,
} from 'lucide-react';
import { Project } from '../../types/project';
import {
  SiteLogisticsPlan,
  LogisticsApprovalStatus,
  VehicleCategory,
  PedestrianBarrierType,
  LogisticsZoneCategory,
  DeliveryMaterialType,
  LogisticsAlternativePreview,
  SiteLogisticsZoneRecord,
  DeliveryRequirementRecord,
  LiftingOperationPlan,
} from '../../types/siteLogistics';
import {
  initializeSiteLogisticsPlan,
  evaluateSiteLogisticsPlan,
  buildSiteLogisticsAlternativePreview,
  applySiteLogisticsPlanToProject,
  checkSiteLogisticsStaleness,
  exportSiteLogisticsReport,
  getActiveBuildingBoundsForPhase,
  VEHICLE_DESIGN_CATALOG,
} from '../../services/siteLogisticsService';

interface SiteLogisticsWorkspaceProps {
  project: Project;
  onUpdateProject: (updated: Project) => void;
  onBack: () => void;
  onOpenSiteContext?: (project: Project) => void;
  onOpenTerrain?: (project: Project) => void;
  onOpenCarbon?: (project: Project) => void;
  onOpenClimateResilience?: (project: Project) => void;
  onOpenEnvelopePerformance?: (project: Project) => void;
  onOpenIFC?: (project: Project) => void;
  onOpenCAD?: (project: Project) => void;
  onOpenVersionWorkspace?: (
    project: Project,
    tab?: 'timeline' | 'diff' | 'recovery' | 'collaboration'
  ) => void;
  onShowToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

type WorkspaceSubTab =
  | 'canvas-layout'
  | 'routes-access'
  | 'zones-storage'
  | 'deliveries-schedule'
  | 'cranes-lifting'
  | 'facilities-utilities'
  | 'conflicts-risks'
  | 'alternatives-export';

export const SiteLogisticsWorkspace: React.FC<SiteLogisticsWorkspaceProps> = ({
  project,
  onUpdateProject,
  onBack,
  onOpenSiteContext,
  onOpenTerrain,
  onOpenCarbon,
  onOpenClimateResilience,
  onOpenEnvelopePerformance,
  onOpenIFC,
  onOpenCAD,
  onOpenVersionWorkspace,
  onShowToast,
}) => {
  const [draftPlan, setDraftPlan] = useState<SiteLogisticsPlan>(() =>
    initializeSiteLogisticsPlan(project)
  );
  const [activeSubTab, setActiveSubTab] = useState<WorkspaceSubTab>('canvas-layout');
  const [selectedPhaseId, setSelectedPhaseId] = useState<string>(
    draftPlan.activePhaseId || draftPlan.phases[0]?.id || 'phase-3-superstructure'
  );
  const [selectedElementId, setSelectedElementId] = useState<string | null>(
    draftPlan.equipmentPlacements[0]?.id || draftPlan.logisticsZones[0]?.id || null
  );
  const [alternativePreviews, setAlternativePreviews] = useState<LogisticsAlternativePreview[]>(
    project.siteLogistics?.savedAlternatives || []
  );
  const [exportFormat, setExportFormat] = useState<'markdown' | 'json' | 'csv'>('markdown');

  // Layer visibility toggles for 2D SVG canvas
  const [layers, setLayers] = useState({
    buildingAndSetbacks: true,
    accessAndVehicleRoutes: true,
    pedestrianRoutes: true,
    storageAndStagingZones: true,
    cranesAndReachCircles: true,
    facilitiesAndUtilities: true,
    emergencyAndRestrictions: true,
    conflictMarkers: true,
  });

  const staleness = useMemo(
    () => checkSiteLogisticsStaleness(project, draftPlan),
    [project, draftPlan]
  );

  const activePhase = useMemo(
    () => draftPlan.phases.find((p) => p.id === selectedPhaseId) || draftPlan.phases[0],
    [draftPlan.phases, selectedPhaseId]
  );

  const activePhaseSummary = useMemo(
    () =>
      draftPlan.phaseSummaries.find((ps) => ps.phaseId === selectedPhaseId) ||
      draftPlan.phaseSummaries[0],
    [draftPlan.phaseSummaries, selectedPhaseId]
  );

  const updateAndEvaluatePlan = (updater: (prev: SiteLogisticsPlan) => SiteLogisticsPlan) => {
    setDraftPlan((prev) => {
      const nextRaw = updater(prev);
      return evaluateSiteLogisticsPlan(project, nextRaw);
    });
  };

  const handleSaveToProject = () => {
    const { updatedProject, snapshotId } = applySiteLogisticsPlanToProject(
      project,
      draftPlan,
      alternativePreviews
    );
    onUpdateProject(updatedProject);
    setDraftPlan(updatedProject.siteLogistics!.activePlan);
    onShowToast?.(
      `Saved Construction Site Logistics Plan (Safety checkpoint ${snapshotId.slice(0, 8)} created).`,
      'success'
    );
  };

  const handleResetToDefault = () => {
    const cleanProject: Project = { ...project, siteLogistics: undefined };
    const fresh = initializeSiteLogisticsPlan(cleanProject);
    setDraftPlan(fresh);
    setSelectedPhaseId(fresh.activePhaseId);
    onShowToast?.('Reset site logistics plan to project baseline geometry.', 'info');
  };

  const handleGenerateOptimizedAlternative = (preset: 'segregated-loop' | 'jit-compact-staging' | 'relocate-crane-clear') => {
    let preview: LogisticsAlternativePreview;
    if (preset === 'segregated-loop') {
      preview = buildSiteLogisticsAlternativePreview(project, draftPlan, {
        name: 'Option A — Physical Pedestrian Barriers & Widened Haul Corridor',
        upgradePedestrianBarriersToPhysical: true,
        provideWheelWashAtExits: true,
        overrideRouteWidthsM: Object.fromEntries(
          draftPlan.vehicleRoutes.map((r) => [r.id, Math.max(r.corridorWidthM, 4.2)])
        ),
      });
    } else if (preset === 'jit-compact-staging') {
      const firstDel = draftPlan.deliveries[0];
      preview = buildSiteLogisticsAlternativePreview(project, draftPlan, {
        name: 'Option B — Staggered Delivery Windows & Relocated Laydown Yard',
        relocateZoneOffsetsM: draftPlan.logisticsZones[1]
          ? { [draftPlan.logisticsZones[1].id]: { dxM: -0.4, dyM: 0.3 } }
          : undefined,
        rescheduleDeliveryWindows: firstDel
          ? {
              [firstDel.id]: {
                arrivalWindowStart: '08:00',
                arrivalWindowEnd: '09:30',
              },
            }
          : undefined,
      });
    } else {
      const firstEq = draftPlan.equipmentPlacements[0];
      preview = buildSiteLogisticsAlternativePreview(project, draftPlan, {
        name: 'Option C — Crane Repositioned & Reduced Slew Radius Inside Boundary',
        relocateEquipmentOffsetsM: firstEq
          ? {
              [firstEq.id]: {
                dxM: 0.5,
                dyM: 0.5,
                operatingRadiusM: Math.max(5.0, Number((firstEq.operatingRadiusM - 1.2).toFixed(1))),
              },
            }
          : undefined,
      });
    }

    setAlternativePreviews((prev) => [preview, ...prev]);
    onShowToast?.(`Generated non-destructive preview: "${preview.title}"`, 'info');
  };

  const handlePromoteAlternativeToDraft = (preview: LogisticsAlternativePreview) => {
    setDraftPlan(evaluateSiteLogisticsPlan(project, preview.candidatePlan));
    onShowToast?.(
      `Loaded "${preview.title}" into active draft workspace. Click "Save Logistics Plan" to persist.`,
      'success'
    );
  };

  const handleDownloadExport = () => {
    const content = exportSiteLogisticsReport(project, draftPlan, exportFormat);
    const mime =
      exportFormat === 'json'
        ? 'application/json'
        : exportFormat === 'csv'
        ? 'text/csv'
        : 'text/markdown';
    const ext = exportFormat === 'markdown' ? 'md' : exportFormat;
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-site-logistics-p47.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    onShowToast?.(`Exported P47 Site Logistics report (${ext.toUpperCase()}).`, 'success');
  };

  // Compute SVG Canvas Coordinate Transform
  const padM = Math.max(2.5, Math.max(draftPlan.siteWidthM, draftPlan.siteLengthM) * 0.14);
  const viewBoxW = draftPlan.siteWidthM + padM * 2;
  const viewBoxH = draftPlan.siteLengthM + padM * 2;
  const activeBldgBounds = getActiveBuildingBoundsForPhase(draftPlan.buildingBoundsM, activePhase);

  const phaseFilteredConflicts = useMemo(
    () =>
      draftPlan.conflicts.filter(
        (c) => c.phaseId === 'all_phases' || c.phaseId === selectedPhaseId
      ),
    [draftPlan.conflicts, selectedPhaseId]
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Top Navigation & Discipline Interop Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Overview</span>
            </button>
            <span className="text-slate-300">·</span>
            <span className="text-xs text-slate-500 font-mono">{draftPlan.profileId}</span>
            <span className="text-slate-300">·</span>
            <span className="text-xs text-slate-600">
              Internal Calculation Unit: <strong>metres</strong> (Project Unit: {project.unit})
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Truck className="w-6 h-6 text-teal-700 shrink-0" />
            <span>Construction Site Logistics Planner</span>
          </h1>
          <p className="text-xs text-slate-600 max-w-3xl">
            Deterministic site access, vehicle & pedestrian segregation, material laydown capacity, delivery window scheduling, crane reach & ground-bearing safety gates, and phase evolution for{' '}
            <strong className="text-slate-900">{project.name}</strong>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onOpenSiteContext && (
            <button
              onClick={() => onOpenSiteContext(project)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              <Compass className="w-3.5 h-3.5 text-teal-700" />
              <span>Site Context</span>
            </button>
          )}
          {onOpenTerrain && (
            <button
              onClick={() => onOpenTerrain(project)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              <Mountain className="w-3.5 h-3.5 text-teal-700" />
              <span>P43 Terrain</span>
            </button>
          )}
          {onOpenCarbon && (
            <button
              onClick={() => onOpenCarbon(project)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              <Leaf className="w-3.5 h-3.5 text-emerald-700" />
              <span>P44 Carbon (A4)</span>
            </button>
          )}
          {onOpenClimateResilience && (
            <button
              onClick={() => onOpenClimateResilience(project)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              <CloudRain className="w-3.5 h-3.5 text-sky-700" />
              <span>P45 Climate</span>
            </button>
          )}
          {onOpenEnvelopePerformance && (
            <button
              onClick={() => onOpenEnvelopePerformance(project)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              <Thermometer className="w-3.5 h-3.5 text-teal-700" />
              <span>P46 Envelope</span>
            </button>
          )}
          {onOpenVersionWorkspace && (
            <button
              onClick={() => onOpenVersionWorkspace(project, 'timeline')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              <History className="w-3.5 h-3.5 text-teal-700" />
              <span>Snapshots</span>
            </button>
          )}
          <button
            onClick={handleResetToDefault}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
            <span>Reset Baseline</span>
          </button>
          <button
            onClick={handleSaveToProject}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            <Save className="w-3.5 h-3.5 text-teal-400" />
            <span>Save Logistics Plan</span>
          </button>
        </div>
      </div>

      {/* Staleness Warning Banner if Upstream Geometry Changed */}
      {staleness.isStale && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
              <span>Upstream Project Geometry or Site Context Changed Since Last Evaluation</span>
            </div>
            <ul className="text-xs text-amber-800 list-disc list-inside space-y-0.5">
              {staleness.reasons.map((r, idx) => (
                <li key={idx}>{r}</li>
              ))}
            </ul>
          </div>
          <button
            onClick={() => setDraftPlan(evaluateSiteLogisticsPlan(project, draftPlan))}
            className="px-3.5 py-2 bg-amber-900 hover:bg-amber-800 text-white text-xs font-semibold rounded-lg shrink-0 cursor-pointer"
          >
            Re-Synchronize & Evaluate
          </button>
        </div>
      )}

      {/* Key Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-medium text-slate-500">Total Parcel / Bldg Footprint</div>
          <div className="text-base font-bold text-slate-900 tabular-nums mt-1">
            {draftPlan.summary.totalSiteAreaM2.toFixed(0)} m² / {draftPlan.summary.buildingFootprintAreaM2.toFixed(0)} m²
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {draftPlan.siteWidthM.toFixed(1)} × {draftPlan.siteLengthM.toFixed(1)} m parcel
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-medium text-slate-500">Phase Exterior Utilization</div>
          <div className="text-base font-bold text-teal-800 tabular-nums mt-1">
            {activePhaseSummary ? `${activePhaseSummary.exteriorSiteUtilizationPct.toFixed(1)}%` : '0%'}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {activePhaseSummary?.totalAllocatedLogisticsFootprintM2.toFixed(1)} /{' '}
            {activePhaseSummary?.netAvailableExteriorSiteAreaM2.toFixed(1)} m² net yard
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-medium text-slate-500">Safety Blockers</div>
          <div
            className={`text-base font-bold tabular-nums mt-1 ${
              draftPlan.summary.blockerCount > 0 ? 'text-rose-700' : 'text-emerald-700'
            }`}
          >
            {draftPlan.summary.blockerCount} Blocker{draftPlan.summary.blockerCount === 1 ? '' : 's'}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {draftPlan.summary.unverifiedEvidenceGatesCount} unverified evidence gates
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-medium text-slate-500">Spatial & Schedule Conflicts</div>
          <div
            className={`text-base font-bold tabular-nums mt-1 ${
              draftPlan.summary.conflictCount > 0 ? 'text-amber-700' : 'text-slate-900'
            }`}
          >
            {draftPlan.summary.conflictCount} Conflict{draftPlan.summary.conflictCount === 1 ? '' : 's'} ·{' '}
            {draftPlan.summary.warningCount} Warn
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {phaseFilteredConflicts.length} active in selected phase
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-medium text-slate-500">Deliveries & A4 Transport</div>
          <div className="text-base font-bold text-slate-900 tabular-nums mt-1">
            {draftPlan.summary.totalDeliveriesScheduled} Loads ({draftPlan.transportCarbonSummary.totalScheduledPayloadTonnes.toFixed(0)} t)
          </div>
          <div className="text-[11px] text-emerald-700 mt-0.5">
            {draftPlan.transportCarbonSummary.estimatedModuleA4TransportKgCO2e !== null
              ? `${draftPlan.transportCarbonSummary.estimatedModuleA4TransportKgCO2e.toFixed(1)} kgCO₂e (A4)`
              : 'Factors needed for A4'}
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-medium text-slate-500">Readiness Determination</div>
          <div
            className={`text-xs font-bold mt-1.5 leading-snug ${
              draftPlan.summary.overallReadinessStatus === 'blocked_critical_safety_or_conflict'
                ? 'text-rose-700'
                : draftPlan.summary.overallReadinessStatus ===
                  'conditional_pending_professional_verification'
                ? 'text-amber-700'
                : 'text-emerald-700'
            }`}
          >
            {draftPlan.summary.overallReadinessStatus === 'blocked_critical_safety_or_conflict'
              ? 'Blocked — Resolve Safety/Spatial Clashes'
              : draftPlan.summary.overallReadinessStatus ===
                'conditional_pending_professional_verification'
              ? 'Conditional — Sign-Off Required'
              : 'Preliminary Layout Aligned'}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Not a substitute for Temporary Works design
          </div>
        </div>
      </div>

      {/* Construction Phase Selector Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
            <Calendar className="w-4 h-4 text-teal-700" />
            <span>Active Construction Phase Evolution</span>
          </div>
          {activePhase && (
            <div className="text-xs text-slate-600">
              <span>{activePhase.startDateIso} to {activePhase.endDateIso}</span>
              <span className="mx-2 text-slate-300">·</span>
              <span>Hours: {activePhase.workingHoursStart}–{activePhase.workingHoursEnd}</span>
              <span className="mx-2 text-slate-300">·</span>
              <span>Active Bldg Footprint: {(activePhase.activeBuildingFootprintRatio * 100).toFixed(0)}%</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {draftPlan.phases.map((ph) => {
            const ps = draftPlan.phaseSummaries.find((s) => s.phaseId === ph.id);
            const isSelected = ph.id === selectedPhaseId;
            return (
              <button
                key={ph.id}
                onClick={() => {
                  setSelectedPhaseId(ph.id);
                  updateAndEvaluatePlan((prev) => ({ ...prev, activePhaseId: ph.id }));
                }}
                className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200'
                }`}
              >
                <div className="text-xs font-bold truncate">{ph.name}</div>
                <div
                  className={`text-[11px] mt-1 flex items-center justify-between ${
                    isSelected ? 'text-slate-300' : 'text-slate-500'
                  }`}
                >
                  <span>Util: {ps?.exteriorSiteUtilizationPct.toFixed(0)}%</span>
                  <span>·</span>
                  <span>
                    {ps?.activeBlockerCount || 0} Blk / {ps?.activeConflictCount || 0} Conf
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Workspace Sub-Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-xl border border-slate-200">
        {[
          { id: 'canvas-layout', label: '2D Site Logistics Plan', icon: Layers },
          { id: 'routes-access', label: `Access & Routes (${draftPlan.vehicleRoutes.length + draftPlan.pedestrianRoutes.length})`, icon: MapPin },
          { id: 'zones-storage', label: `Storage & Bays (${draftPlan.logisticsZones.length})`, icon: Package },
          { id: 'deliveries-schedule', label: `Deliveries (${draftPlan.deliveries.length})`, icon: Calendar },
          { id: 'cranes-lifting', label: `Cranes & Lifting (${draftPlan.equipmentPlacements.length})`, icon: HardHat },
          { id: 'facilities-utilities', label: `Welfare, Utilities & Fire (${draftPlan.temporaryFacilities.length + draftPlan.utilityRequirements.length})`, icon: Wrench },
          { id: 'conflicts-risks', label: `Conflicts & Safety Gates (${draftPlan.conflicts.length})`, icon: ShieldAlert },
          { id: 'alternatives-export', label: 'Alternatives & Export', icon: GitCompare },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as WorkspaceSubTab)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                active
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${active ? 'text-teal-700' : 'text-slate-500'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* SUB-TAB 1: 2D INTERACTIVE SITE LOGISTICS CANVAS */}
      {activeSubTab === 'canvas-layout' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left 8 Cols: Interactive 2D SVG Site Logistics Canvas */}
          <div className="lg:col-span-8 bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Phased 2D Site Logistics Plan — {activePhase?.name}
                </h3>
                <p className="text-xs text-slate-500">
                  Click any zone, crane, cabin, or route on the plan to inspect and adjust coordinates, capacities, or safety gates.
                </p>
              </div>
              <div className="text-xs text-slate-500 font-mono">
                Road Frontage: <strong className="text-slate-800">{project.roadFacing}</strong>
              </div>
            </div>

            {/* Layer Toggle Controls */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-500 font-medium flex items-center gap-1">
                <Eye className="w-3.5 h-3.5" /> Layers:
              </span>
              {[
                { key: 'buildingAndSetbacks', label: 'Building Footprint' },
                { key: 'accessAndVehicleRoutes', label: 'Vehicle Routes' },
                { key: 'pedestrianRoutes', label: 'Pedestrian Walkways' },
                { key: 'storageAndStagingZones', label: 'Storage & Bays' },
                { key: 'cranesAndReachCircles', label: 'Crane & Reach Circle' },
                { key: 'facilitiesAndUtilities', label: 'Welfare & Utilities' },
                { key: 'emergencyAndRestrictions', label: 'Emergency & No-Go' },
                { key: 'conflictMarkers', label: 'Conflict Callouts' },
              ].map((l) => {
                const isOn = layers[l.key as keyof typeof layers];
                return (
                  <button
                    key={l.key}
                    onClick={() =>
                      setLayers((prev) => ({
                        ...prev,
                        [l.key]: !prev[l.key as keyof typeof layers],
                      }))
                    }
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors cursor-pointer ${
                      isOn
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {l.label}
                  </button>
                );
              })}
            </div>

            {/* SVG Site Plan Viewport */}
            <div className="bg-slate-900 rounded-xl p-4 overflow-hidden border border-slate-800">
              <svg
                viewBox={`${-padM} ${-padM} ${viewBoxW} ${viewBoxH}`}
                className="w-full h-[460px] select-none"
                role="img"
                aria-label="2D Construction Site Logistics Plan"
              >
                <defs>
                  <pattern id="siteGridM" width="2" height="2" patternUnits="userSpaceOnUse">
                    <path
                      d="M 2 0 L 0 0 0 2"
                      fill="none"
                      stroke="#1e293b"
                      strokeWidth="0.06"
                    />
                  </pattern>
                  <pattern
                    id="restrictedHatch"
                    width="0.8"
                    height="0.8"
                    patternTransform="rotate(45 0 0)"
                    patternUnits="userSpaceOnUse"
                  >
                    <line x1="0" y1="0" x2="0" y2="0.8" stroke="#f43f5e" strokeWidth="0.14" />
                  </pattern>
                </defs>

                {/* Parcel Background & 2m Metric Grid */}
                <rect
                  x={0}
                  y={0}
                  width={draftPlan.siteWidthM}
                  height={draftPlan.siteLengthM}
                  fill="#0f172a"
                />
                <rect
                  x={0}
                  y={0}
                  width={draftPlan.siteWidthM}
                  height={draftPlan.siteLengthM}
                  fill="url(#siteGridM)"
                />

                {/* Property Boundary Perimeter Hoarding Line */}
                <rect
                  x={0}
                  y={0}
                  width={draftPlan.siteWidthM}
                  height={draftPlan.siteLengthM}
                  fill="none"
                  stroke="#94a3b8"
                  strokeWidth="0.16"
                  strokeDasharray="0.5 0.25"
                />

                {/* Dimension Labels */}
                <text
                  x={draftPlan.siteWidthM * 0.5}
                  y={-0.7}
                  textAnchor="middle"
                  fill="#cbd5e1"
                  fontSize="0.55"
                  fontWeight="bold"
                >
                  North Boundary · {draftPlan.siteWidthM.toFixed(2)} m
                </text>
                <text
                  x={draftPlan.siteWidthM * 0.5}
                  y={draftPlan.siteLengthM + 1.1}
                  textAnchor="middle"
                  fill="#38bdf8"
                  fontSize="0.55"
                  fontWeight="bold"
                >
                  South Boundary · Primary Road Frontage ({project.roadFacing})
                </text>

                {/* Restricted No-Go / Tree Protection / Easement Zones */}
                {layers.emergencyAndRestrictions &&
                  draftPlan.siteRestrictions
                    .filter((r) => r.activePhaseIds.includes(selectedPhaseId))
                    .map((res) => (
                      <g
                        key={res.id}
                        onClick={() => setSelectedElementId(res.id)}
                        className="cursor-pointer"
                      >
                        <rect
                          x={res.bounds.x}
                          y={res.bounds.y}
                          width={res.bounds.widthM}
                          height={res.bounds.lengthM}
                          fill="url(#restrictedHatch)"
                          stroke="#f43f5e"
                          strokeWidth="0.12"
                        />
                        <text
                          x={res.bounds.x + res.bounds.widthM * 0.5}
                          y={res.bounds.y + res.bounds.lengthM * 0.5}
                          textAnchor="middle"
                          fill="#fda4af"
                          fontSize="0.42"
                          fontWeight="bold"
                        >
                          {res.name}
                        </text>
                      </g>
                    ))}

                {/* Active Building Construction Footprint */}
                {layers.buildingAndSetbacks && (
                  <g>
                    {/* Full Ultimate Building Envelope Outline */}
                    <rect
                      x={draftPlan.buildingBoundsM.x}
                      y={draftPlan.buildingBoundsM.y}
                      width={draftPlan.buildingBoundsM.widthM}
                      height={draftPlan.buildingBoundsM.lengthM}
                      fill="none"
                      stroke="#475569"
                      strokeWidth="0.08"
                      strokeDasharray="0.3 0.3"
                    />
                    {/* Phase Active Building Footprint */}
                    <rect
                      x={activeBldgBounds.x}
                      y={activeBldgBounds.y}
                      width={activeBldgBounds.widthM}
                      height={activeBldgBounds.lengthM}
                      fill="#1e293b"
                      stroke="#cbd5e1"
                      strokeWidth="0.16"
                    />
                    <text
                      x={activeBldgBounds.x + activeBldgBounds.widthM * 0.5}
                      y={activeBldgBounds.y + activeBldgBounds.lengthM * 0.46}
                      textAnchor="middle"
                      fill="#f8fafc"
                      fontSize="0.55"
                      fontWeight="bold"
                    >
                      ACTIVE BUILDING WORKZONE
                    </text>
                    <text
                      x={activeBldgBounds.x + activeBldgBounds.widthM * 0.5}
                      y={activeBldgBounds.y + activeBldgBounds.lengthM * 0.58}
                      textAnchor="middle"
                      fill="#94a3b8"
                      fontSize="0.42"
                    >
                      {activeBldgBounds.widthM.toFixed(1)} × {activeBldgBounds.lengthM.toFixed(1)} m ({project.floors}F)
                    </text>
                  </g>
                )}

                {/* Vehicle Haul Routes */}
                {layers.accessAndVehicleRoutes &&
                  draftPlan.vehicleRoutes
                    .filter((r) => r.activePhaseIds.includes(selectedPhaseId))
                    .map((route) => {
                      const pts = route.waypoints.map((p) => `${p.x},${p.y}`).join(' ');
                      return (
                        <g
                          key={route.id}
                          onClick={() => setSelectedElementId(route.id)}
                          className="cursor-pointer"
                        >
                          {/* Swept corridor width band */}
                          <polyline
                            points={pts}
                            fill="none"
                            stroke="rgba(245, 158, 11, 0.22)"
                            strokeWidth={route.corridorWidthM}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          {/* Centerline */}
                          <polyline
                            points={pts}
                            fill="none"
                            stroke="#f59e0b"
                            strokeWidth="0.16"
                            strokeDasharray="0.4 0.25"
                          />
                        </g>
                      );
                    })}

                {/* Emergency Fire / Egress Routes */}
                {layers.emergencyAndRestrictions &&
                  draftPlan.emergencyRoutes
                    .filter(
                      (er) =>
                        er.mustRemainUnobstructedAllPhases ||
                        er.activePhaseIds.includes(selectedPhaseId)
                    )
                    .map((er) => {
                      const pts = er.waypoints.map((p) => `${p.x},${p.y}`).join(' ');
                      return (
                        <g key={er.id}>
                          <polyline
                            points={pts}
                            fill="none"
                            stroke="#ef4444"
                            strokeWidth="0.14"
                            strokeDasharray="0.25 0.25"
                          />
                        </g>
                      );
                    })}

                {/* Pedestrian Walkways */}
                {layers.pedestrianRoutes &&
                  draftPlan.pedestrianRoutes
                    .filter((pr) => pr.activePhaseIds.includes(selectedPhaseId))
                    .map((pr) => {
                      const pts = pr.waypoints.map((p) => `${p.x},${p.y}`).join(' ');
                      return (
                        <g
                          key={pr.id}
                          onClick={() => setSelectedElementId(pr.id)}
                          className="cursor-pointer"
                        >
                          <polyline
                            points={pts}
                            fill="none"
                            stroke="rgba(16, 185, 129, 0.28)"
                            strokeWidth={pr.clearWidthM}
                            strokeLinecap="round"
                          />
                          <polyline
                            points={pts}
                            fill="none"
                            stroke="#10b981"
                            strokeWidth="0.12"
                          />
                          {pr.controlledCrossingPoints.map((cp, idx) => (
                            <circle
                              key={idx}
                              cx={cp.x}
                              cy={cp.y}
                              r={0.45}
                              fill="#10b981"
                              stroke="#ffffff"
                              strokeWidth="0.08"
                            />
                          ))}
                        </g>
                      );
                    })}

                {/* Material Storage, Laydown, Unloading & Waste Zones */}
                {layers.storageAndStagingZones &&
                  draftPlan.logisticsZones
                    .filter((z) => z.activePhaseIds.includes(selectedPhaseId))
                    .map((z) => {
                      const isSelected = selectedElementId === z.id;
                      const strokeColor =
                        z.category === 'loading_unloading_bay'
                          ? '#f59e0b'
                          : z.category === 'waste_skip_recycling'
                          ? '#a855f7'
                          : '#14b8a6';
                      const fillColor =
                        z.category === 'loading_unloading_bay'
                          ? 'rgba(245, 158, 11, 0.24)'
                          : z.category === 'waste_skip_recycling'
                          ? 'rgba(168, 85, 247, 0.24)'
                          : 'rgba(20, 184, 166, 0.24)';
                      return (
                        <g
                          key={z.id}
                          onClick={() => setSelectedElementId(z.id)}
                          className="cursor-pointer"
                        >
                          <rect
                            x={z.bounds.x}
                            y={z.bounds.y}
                            width={z.bounds.widthM}
                            height={z.bounds.lengthM}
                            fill={fillColor}
                            stroke={isSelected ? '#ffffff' : strokeColor}
                            strokeWidth={isSelected ? '0.2' : '0.12'}
                            rx="0.15"
                          />
                          <text
                            x={z.bounds.x + z.bounds.widthM * 0.5}
                            y={z.bounds.y + z.bounds.lengthM * 0.48}
                            textAnchor="middle"
                            fill="#f8fafc"
                            fontSize="0.4"
                            fontWeight="bold"
                          >
                            {z.name.split('—')[0].trim()}
                          </text>
                          <text
                            x={z.bounds.x + z.bounds.widthM * 0.5}
                            y={z.bounds.y + z.bounds.lengthM * 0.72}
                            textAnchor="middle"
                            fill="#cbd5e1"
                            fontSize="0.34"
                          >
                            {z.usableCapacityM2} m²
                          </text>
                        </g>
                      );
                    })}

                {/* Temporary Welfare / Office Facilities */}
                {layers.facilitiesAndUtilities &&
                  draftPlan.temporaryFacilities
                    .filter((f) => f.activePhaseIds.includes(selectedPhaseId))
                    .map((fac) => {
                      const isSelected = selectedElementId === fac.id;
                      return (
                        <g
                          key={fac.id}
                          onClick={() => setSelectedElementId(fac.id)}
                          className="cursor-pointer"
                        >
                          <rect
                            x={fac.bounds.x}
                            y={fac.bounds.y}
                            width={fac.bounds.widthM}
                            height={fac.bounds.lengthM}
                            fill="rgba(56, 189, 248, 0.26)"
                            stroke={isSelected ? '#ffffff' : '#38bdf8'}
                            strokeWidth={isSelected ? '0.2' : '0.12'}
                            rx="0.15"
                          />
                          <text
                            x={fac.bounds.x + fac.bounds.widthM * 0.5}
                            y={fac.bounds.y + fac.bounds.lengthM * 0.52}
                            textAnchor="middle"
                            fill="#e0f2fe"
                            fontSize="0.38"
                            fontWeight="bold"
                          >
                            Welfare ({fac.storeys}F)
                          </text>
                        </g>
                      );
                    })}

                {/* Cranes, Plant & Operating Reach Circles */}
                {layers.cranesAndReachCircles &&
                  draftPlan.equipmentPlacements
                    .filter((eq) => eq.activePhaseIds.includes(selectedPhaseId))
                    .map((eq) => {
                      const cx = eq.baseBounds.x + eq.baseBounds.widthM * 0.5;
                      const cy = eq.baseBounds.y + eq.baseBounds.lengthM * 0.5;
                      const isSelected = selectedElementId === eq.id;
                      return (
                        <g
                          key={eq.id}
                          onClick={() => setSelectedElementId(eq.id)}
                          className="cursor-pointer"
                        >
                          {/* Operating Slewing Reach Circle */}
                          <circle
                            cx={cx}
                            cy={cy}
                            r={eq.operatingRadiusM}
                            fill="rgba(250, 204, 21, 0.05)"
                            stroke="#facc15"
                            strokeWidth="0.12"
                            strokeDasharray="0.45 0.3"
                          />
                          {/* Exclusion Zone Circle */}
                          <circle
                            cx={cx}
                            cy={cy}
                            r={eq.exclusionZoneRadiusM}
                            fill="none"
                            stroke="#fb7185"
                            strokeWidth="0.09"
                            strokeDasharray="0.2 0.2"
                          />
                          {/* Base / Outrigger Mat Footprint */}
                          <rect
                            x={eq.baseBounds.x}
                            y={eq.baseBounds.y}
                            width={eq.baseBounds.widthM}
                            height={eq.baseBounds.lengthM}
                            fill="rgba(250, 204, 21, 0.35)"
                            stroke={isSelected ? '#ffffff' : '#facc15'}
                            strokeWidth={isSelected ? '0.2' : '0.14'}
                          />
                          <text
                            x={cx}
                            y={cy + 0.15}
                            textAnchor="middle"
                            fill="#fef08a"
                            fontSize="0.4"
                            fontWeight="bold"
                          >
                            CRANE (R={eq.operatingRadiusM}m)
                          </text>
                        </g>
                      );
                    })}

                {/* Site Access Gates on Boundary */}
                {layers.accessAndVehicleRoutes &&
                  draftPlan.accessPoints
                    .filter((ap) => ap.activePhaseIds.includes(selectedPhaseId))
                    .map((ap) => {
                      const gx =
                        ap.boundarySide === 'North' || ap.boundarySide === 'South'
                          ? ap.offsetAlongSideM
                          : ap.boundarySide === 'West'
                          ? -0.35
                          : draftPlan.siteWidthM - 0.15;
                      const gy =
                        ap.boundarySide === 'South'
                          ? draftPlan.siteLengthM - 0.25
                          : ap.boundarySide === 'North'
                          ? -0.25
                          : ap.offsetAlongSideM;
                      const gw =
                        ap.boundarySide === 'North' || ap.boundarySide === 'South'
                          ? ap.clearWidthM
                          : 0.5;
                      const gh =
                        ap.boundarySide === 'North' || ap.boundarySide === 'South'
                          ? 0.5
                          : ap.clearWidthM;
                      return (
                        <g
                          key={ap.id}
                          onClick={() => setSelectedElementId(ap.id)}
                          className="cursor-pointer"
                        >
                          <rect
                            x={gx}
                            y={gy}
                            width={gw}
                            height={gh}
                            fill="#22c55e"
                            stroke="#ffffff"
                            strokeWidth="0.08"
                          />
                          <text
                            x={gx + gw * 0.5}
                            y={gy - 0.3}
                            textAnchor="middle"
                            fill="#86efac"
                            fontSize="0.38"
                            fontWeight="bold"
                          >
                            {ap.name.split('—')[0].trim()} ({ap.clearWidthM}m)
                          </text>
                        </g>
                      );
                    })}

                {/* Conflict & Blocker Spatial Callout Markers */}
                {layers.conflictMarkers &&
                  phaseFilteredConflicts
                    .filter((c) => c.spatialLocation)
                    .map((c) => (
                      <g key={c.id}>
                        <circle
                          cx={c.spatialLocation!.x}
                          cy={c.spatialLocation!.y}
                          r={0.55}
                          fill={c.severity === 'blocker' ? '#e11d48' : '#d97706'}
                          stroke="#ffffff"
                          strokeWidth="0.1"
                        />
                        <text
                          x={c.spatialLocation!.x}
                          y={c.spatialLocation!.y + 0.18}
                          textAnchor="middle"
                          fill="#ffffff"
                          fontSize="0.48"
                          fontWeight="bold"
                        >
                          !
                        </text>
                      </g>
                    ))}
              </svg>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-600 pt-1">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-slate-800 border border-slate-400 inline-block" />
                Active Building Workzone
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-amber-500/40 border border-amber-500 inline-block" />
                Vehicle Corridor & Unloading Bay
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-emerald-500/40 border border-emerald-500 inline-block" />
                Segregated Pedestrian Route
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-teal-500/40 border border-teal-500 inline-block" />
                Material Storage / Laydown
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-yellow-400/30 border border-yellow-500 inline-block" />
                Crane Reach Circle
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-rose-600 inline-block" />
                Blocker / Conflict Location
              </span>
            </div>
          </div>

          {/* Right 4 Cols: Selected Element Inspector + Active Phase Conflicts */}
          <div className="lg:col-span-4 space-y-4">
            {/* Quick Inspector */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
              <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2.5">
                Interactive Element Inspector
              </h3>

              {(() => {
                const selZone = draftPlan.logisticsZones.find((z) => z.id === selectedElementId);
                const selEq = draftPlan.equipmentPlacements.find((e) => e.id === selectedElementId);
                const selRoute = draftPlan.vehicleRoutes.find((r) => r.id === selectedElementId);

                if (selZone) {
                  return (
                    <div className="space-y-3 text-xs">
                      <div className="font-bold text-slate-900">{selZone.name}</div>
                      <div className="text-slate-500">
                        Category: {selZone.category.replace(/_/g, ' ')} · Provenance: {selZone.provenance}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="space-y-1">
                          <span className="text-slate-500 font-medium">X Offset (m)</span>
                          <input
                            type="number"
                            step="0.5"
                            value={selZone.bounds.x}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              updateAndEvaluatePlan((prev) => ({
                                ...prev,
                                logisticsZones: prev.logisticsZones.map((z) =>
                                  z.id === selZone.id
                                    ? { ...z, bounds: { ...z.bounds, x: val } }
                                    : z
                                ),
                              }));
                            }}
                            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md"
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-slate-500 font-medium">Y Offset (m)</span>
                          <input
                            type="number"
                            step="0.5"
                            value={selZone.bounds.y}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              updateAndEvaluatePlan((prev) => ({
                                ...prev,
                                logisticsZones: prev.logisticsZones.map((z) =>
                                  z.id === selZone.id
                                    ? { ...z, bounds: { ...z.bounds, y: val } }
                                    : z
                                ),
                              }));
                            }}
                            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md"
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-slate-500 font-medium">Width (m)</span>
                          <input
                            type="number"
                            step="0.5"
                            min="1"
                            value={selZone.bounds.widthM}
                            onChange={(e) => {
                              const val = Math.max(1, Number(e.target.value));
                              updateAndEvaluatePlan((prev) => ({
                                ...prev,
                                logisticsZones: prev.logisticsZones.map((z) =>
                                  z.id === selZone.id
                                    ? {
                                        ...z,
                                        bounds: { ...z.bounds, widthM: val },
                                        usableCapacityM2: Number((val * z.bounds.lengthM).toFixed(1)),
                                      }
                                    : z
                                ),
                              }));
                            }}
                            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md"
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-slate-500 font-medium">Length (m)</span>
                          <input
                            type="number"
                            step="0.5"
                            min="1"
                            value={selZone.bounds.lengthM}
                            onChange={(e) => {
                              const val = Math.max(1, Number(e.target.value));
                              updateAndEvaluatePlan((prev) => ({
                                ...prev,
                                logisticsZones: prev.logisticsZones.map((z) =>
                                  z.id === selZone.id
                                    ? {
                                        ...z,
                                        bounds: { ...z.bounds, lengthM: val },
                                        usableCapacityM2: Number((z.bounds.widthM * val).toFixed(1)),
                                      }
                                    : z
                                ),
                              }));
                            }}
                            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md"
                          />
                        </label>
                      </div>

                      <label className="block space-y-1">
                        <span className="text-slate-500 font-medium">Ground-Bearing Verification Gate</span>
                        <select
                          value={selZone.groundBearingStatus}
                          onChange={(e) => {
                            const status = e.target.value as LogisticsApprovalStatus;
                            updateAndEvaluatePlan((prev) => ({
                              ...prev,
                              logisticsZones: prev.logisticsZones.map((z) =>
                                z.id === selZone.id ? { ...z, groundBearingStatus: status } : z
                              ),
                            }));
                          }}
                          className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md"
                        >
                          <option value="verified_approved">Verified & Signed Off</option>
                          <option value="declared_pending_verification">Declared (Pending Verification)</option>
                          <option value="missing_evidence_blocker">Missing Geotechnical Evidence (Blocker)</option>
                        </select>
                      </label>
                    </div>
                  );
                }

                if (selEq) {
                  return (
                    <div className="space-y-3 text-xs">
                      <div className="font-bold text-slate-900">{selEq.name}</div>
                      <div className="grid grid-cols-3 gap-2">
                        <label className="space-y-1">
                          <span className="text-slate-500 font-medium">Base X (m)</span>
                          <input
                            type="number"
                            step="0.5"
                            value={selEq.baseBounds.x}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              updateAndEvaluatePlan((prev) => ({
                                ...prev,
                                equipmentPlacements: prev.equipmentPlacements.map((eq) =>
                                  eq.id === selEq.id
                                    ? { ...eq, baseBounds: { ...eq.baseBounds, x: val } }
                                    : eq
                                ),
                              }));
                            }}
                            className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-md"
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-slate-500 font-medium">Base Y (m)</span>
                          <input
                            type="number"
                            step="0.5"
                            value={selEq.baseBounds.y}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              updateAndEvaluatePlan((prev) => ({
                                ...prev,
                                equipmentPlacements: prev.equipmentPlacements.map((eq) =>
                                  eq.id === selEq.id
                                    ? { ...eq, baseBounds: { ...eq.baseBounds, y: val } }
                                    : eq
                                ),
                              }));
                            }}
                            className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-md"
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-slate-500 font-medium">Radius (m)</span>
                          <input
                            type="number"
                            step="0.5"
                            min="3"
                            value={selEq.operatingRadiusM}
                            onChange={(e) => {
                              const val = Math.max(3, Number(e.target.value));
                              updateAndEvaluatePlan((prev) => ({
                                ...prev,
                                equipmentPlacements: prev.equipmentPlacements.map((eq) =>
                                  eq.id === selEq.id ? { ...eq, operatingRadiusM: val } : eq
                                ),
                              }));
                            }}
                            className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-md"
                          />
                        </label>
                      </div>

                      <label className="block space-y-1">
                        <span className="text-slate-500 font-medium">Geotechnical / Outrigger Bearing Gate</span>
                        <select
                          value={selEq.groundBearingApprovalStatus}
                          onChange={(e) => {
                            const status = e.target.value as LogisticsApprovalStatus;
                            updateAndEvaluatePlan((prev) => ({
                              ...prev,
                              equipmentPlacements: prev.equipmentPlacements.map((eq) =>
                                eq.id === selEq.id
                                  ? { ...eq, groundBearingApprovalStatus: status }
                                  : eq
                              ),
                            }));
                          }}
                          className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md"
                        >
                          <option value="verified_approved">Verified & Signed Off</option>
                          <option value="declared_pending_verification">Declared (Pending Verification)</option>
                          <option value="missing_evidence_blocker">Missing Geotechnical Evidence (Blocker)</option>
                        </select>
                      </label>

                      <label className="block space-y-1">
                        <span className="text-slate-500 font-medium">Appointed Person Lift Plan Gate</span>
                        <select
                          value={selEq.certifiedLiftPlanApprovalStatus}
                          onChange={(e) => {
                            const status = e.target.value as LogisticsApprovalStatus;
                            updateAndEvaluatePlan((prev) => ({
                              ...prev,
                              equipmentPlacements: prev.equipmentPlacements.map((eq) =>
                                eq.id === selEq.id
                                  ? { ...eq, certifiedLiftPlanApprovalStatus: status }
                                  : eq
                              ),
                            }));
                          }}
                          className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md"
                        >
                          <option value="verified_approved">Verified & Signed Off</option>
                          <option value="declared_pending_verification">Declared (Pending Verification)</option>
                          <option value="missing_evidence_blocker">Missing Lift Plan Sign-Off (Blocker)</option>
                        </select>
                      </label>
                    </div>
                  );
                }

                if (selRoute) {
                  return (
                    <div className="space-y-3 text-xs">
                      <div className="font-bold text-slate-900">{selRoute.name}</div>
                      <label className="block space-y-1">
                        <span className="text-slate-500 font-medium">Corridor Width (m)</span>
                        <input
                          type="number"
                          step="0.1"
                          min="2.5"
                          value={selRoute.corridorWidthM}
                          onChange={(e) => {
                            const val = Math.max(2.0, Number(e.target.value));
                            updateAndEvaluatePlan((prev) => ({
                              ...prev,
                              vehicleRoutes: prev.vehicleRoutes.map((r) =>
                                r.id === selRoute.id ? { ...r, corridorWidthM: val } : r
                              ),
                            }));
                          }}
                          className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md"
                        />
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selRoute.trainedBanksmanMarshallingConfirmed}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            updateAndEvaluatePlan((prev) => ({
                              ...prev,
                              vehicleRoutes: prev.vehicleRoutes.map((r) =>
                                r.id === selRoute.id
                                  ? { ...r, trainedBanksmanMarshallingConfirmed: checked }
                                  : r
                              ),
                            }));
                          }}
                        />
                        <span>Trained Traffic Marshall / Banksman Confirmed</span>
                      </label>
                    </div>
                  );
                }

                return (
                  <p className="text-xs text-slate-500">
                    Click any zone, crane, or route on the 2D canvas to edit its placement and safety verification gates.
                  </p>
                );
              })()}
            </div>

            {/* Active Phase Conflict Feed */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <h3 className="text-sm font-bold text-slate-900">
                  Phase Safety & Spatial Checks ({phaseFilteredConflicts.length})
                </h3>
                <button
                  onClick={() => setActiveSubTab('conflicts-risks')}
                  className="text-xs font-semibold text-teal-700 hover:underline cursor-pointer"
                >
                  Full Register →
                </button>
              </div>

              {phaseFilteredConflicts.length === 0 ? (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start gap-2.5 text-xs text-emerald-900">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">Zero Conflicts in Active Phase</div>
                    <p className="text-emerald-800 mt-0.5">
                      All active zones, routes, crane radii, and delivery windows pass geometric and schedule screening for {activePhase?.name}.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                  {phaseFilteredConflicts.map((c) => (
                    <div
                      key={c.id}
                      className={`p-3 rounded-lg border text-xs space-y-1 ${
                        c.severity === 'blocker'
                          ? 'bg-rose-50 border-rose-200 text-rose-950'
                          : c.severity === 'conflict'
                          ? 'bg-amber-50 border-amber-200 text-amber-950'
                          : 'bg-slate-50 border-slate-200 text-slate-800'
                      }`}
                    >
                      <div className="font-bold flex items-center justify-between gap-2">
                        <span>{c.title}</span>
                        <span className="uppercase text-[10px] font-mono shrink-0">
                          {c.severity}
                        </span>
                      </div>
                      <p className="text-[11px] opacity-90">{c.description}</p>
                      <div className="text-[11px] font-medium pt-1">
                        Fix: {c.remediationGuidance}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: ACCESS GATES, VEHICLE ROUTES & PEDESTRIAN SEGREGATION */}
      {activeSubTab === 'routes-access' && (
        <div className="space-y-6">
          {/* Vehicle Routes Table & Controls */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Vehicle Haul Routes, Swept Corridor Screening & Network Travel Analysis
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Compares actual waypoint network distance against straight-line distance, evaluates corridor widths & inner turning radii against vehicle design classes, and checks reversing marshalling & wheel-wash controls.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                    <th className="py-2.5 px-3">Vehicle Route</th>
                    <th className="py-2.5 px-3">Design Vehicle Class</th>
                    <th className="py-2.5 px-3">Corridor Width (m)</th>
                    <th className="py-2.5 px-3">Inner Radius (m)</th>
                    <th className="py-2.5 px-3">Network vs Direct</th>
                    <th className="py-2.5 px-3">Safety Controls</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {draftPlan.vehicleRoutes.map((route) => {
                    const ra = draftPlan.routeAnalyses.find((a) => a.routeId === route.id);
                    const std = VEHICLE_DESIGN_CATALOG[route.designVehicleCategory];
                    return (
                      <tr key={route.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-3 font-bold text-slate-900">{route.name}</td>
                        <td className="py-3 px-3">
                          <select
                            value={route.designVehicleCategory}
                            onChange={(e) => {
                              const cat = e.target.value as VehicleCategory;
                              const newStd = VEHICLE_DESIGN_CATALOG[cat];
                              updateAndEvaluatePlan((prev) => ({
                                ...prev,
                                vehicleRoutes: prev.vehicleRoutes.map((r) =>
                                  r.id === route.id
                                    ? {
                                        ...r,
                                        designVehicleCategory: cat,
                                        requiredMinCorridorWidthM: newStd.minCorridorWidthM,
                                        requiredMinInnerTurningRadiusM: newStd.minInnerTurningRadiusM,
                                      }
                                    : r
                                ),
                              }));
                            }}
                            className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-md text-xs"
                          >
                            {Object.values(VEHICLE_DESIGN_CATALOG).map((v) => (
                              <option key={v.category} value={v.category}>
                                {v.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              step="0.1"
                              value={route.corridorWidthM}
                              onChange={(e) => {
                                const val = Math.max(2.0, Number(e.target.value));
                                updateAndEvaluatePlan((prev) => ({
                                  ...prev,
                                  vehicleRoutes: prev.vehicleRoutes.map((r) =>
                                    r.id === route.id ? { ...r, corridorWidthM: val } : r
                                  ),
                                }));
                              }}
                              className="w-16 px-2 py-1 bg-slate-50 border border-slate-200 rounded-md tabular-nums"
                            />
                            <span className="text-slate-400">
                              (min {std.minCorridorWidthM.toFixed(1)}m)
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              step="0.5"
                              value={route.declaredMinCurveRadiusM ?? 10}
                              onChange={(e) => {
                                const val = Math.max(2.0, Number(e.target.value));
                                updateAndEvaluatePlan((prev) => ({
                                  ...prev,
                                  vehicleRoutes: prev.vehicleRoutes.map((r) =>
                                    r.id === route.id ? { ...r, declaredMinCurveRadiusM: val } : r
                                  ),
                                }));
                              }}
                              className="w-16 px-2 py-1 bg-slate-50 border border-slate-200 rounded-md tabular-nums"
                            />
                            <span className="text-slate-400">
                              (min {std.minInnerTurningRadiusM.toFixed(1)}m)
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-3 tabular-nums text-slate-700">
                          {ra ? (
                            <div>
                              <strong>{ra.actualNetworkPathLengthM.toFixed(1)} m</strong> vs{' '}
                              {ra.straightLineEntryToExitM.toFixed(1)} m direct
                              <div className="text-[11px] text-slate-500">
                                {ra.estimatedTransitMinutesOneWay.toFixed(1)} min @ {ra.assumedAverageSpeedKmh} km/h
                              </div>
                            </div>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-3 px-3 space-y-1">
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={route.trainedBanksmanMarshallingConfirmed}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                updateAndEvaluatePlan((prev) => ({
                                  ...prev,
                                  vehicleRoutes: prev.vehicleRoutes.map((r) =>
                                    r.id === route.id
                                      ? { ...r, trainedBanksmanMarshallingConfirmed: checked }
                                      : r
                                  ),
                                }));
                              }}
                            />
                            <span>Banksman Marshalling</span>
                          </label>
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={route.wheelWashProvidedAtExit}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                updateAndEvaluatePlan((prev) => ({
                                  ...prev,
                                  vehicleRoutes: prev.vehicleRoutes.map((r) =>
                                    r.id === route.id
                                      ? { ...r, wheelWashProvidedAtExit: checked }
                                      : r
                                  ),
                                }));
                              }}
                            />
                            <span>Wheel-Wash at Exit</span>
                          </label>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pedestrian Walkways & Segregation Controls */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Pedestrian Walkways & Vehicle Segregation Barriers
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Verifies ≥ 1.20 m clear walkway width, physical barrier protection, and controlled crossing points wherever pedestrian paths intersect vehicle routes.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                    <th className="py-2.5 px-3">Pedestrian Route</th>
                    <th className="py-2.5 px-3">Clear Width (m)</th>
                    <th className="py-2.5 px-3">Segregation Barrier Type</th>
                    <th className="py-2.5 px-3">Covered / Lighting</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {draftPlan.pedestrianRoutes.map((pr) => (
                    <tr key={pr.id}>
                      <td className="py-3 px-3 font-bold text-slate-900">{pr.name}</td>
                      <td className="py-3 px-3">
                        <input
                          type="number"
                          step="0.1"
                          value={pr.clearWidthM}
                          onChange={(e) => {
                            const val = Math.max(0.6, Number(e.target.value));
                            updateAndEvaluatePlan((prev) => ({
                              ...prev,
                              pedestrianRoutes: prev.pedestrianRoutes.map((p) =>
                                p.id === pr.id ? { ...p, clearWidthM: val } : p
                              ),
                            }));
                          }}
                          className="w-20 px-2 py-1 bg-slate-50 border border-slate-200 rounded-md tabular-nums"
                        />
                      </td>
                      <td className="py-3 px-3">
                        <select
                          value={pr.barrierType}
                          onChange={(e) => {
                            const bt = e.target.value as PedestrianBarrierType;
                            updateAndEvaluatePlan((prev) => ({
                              ...prev,
                              pedestrianRoutes: prev.pedestrianRoutes.map((p) =>
                                p.id === pr.id ? { ...p, barrierType: bt } : p
                              ),
                            }));
                          }}
                          className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-md text-xs"
                        >
                          <option value="physical_jersey_or_water_filled_barrier">
                            Physical Jersey / Water-Filled Barrier
                          </option>
                          <option value="fixed_handrail_fencing">
                            Fixed Handrail & Mesh Fencing
                          </option>
                          <option value="painted_line_only_insufficient">
                            Painted Line Only (Warning — Insufficient)
                          </option>
                          <option value="unsegregated_shared_hazard">
                            Unsegregated Shared Surface (Safety Blocker)
                          </option>
                        </select>
                      </td>
                      <td className="py-3 px-3 text-slate-600">
                        Covered: {pr.weatherProtectedCovered ? 'Yes' : 'No'} · 110V Lighting:{' '}
                        {pr.lightingProvided ? 'Yes' : 'No'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: MATERIAL STORAGE, LAYDOWN & UNLOADING ZONES */}
      {activeSubTab === 'zones-storage' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Material Storage, Laydown Stillage, Unloading Bays & Waste Compounds
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Manage spatial bounds, usable capacity (m²), ground-bearing pressure verification (kPa), weather protection, and COSHH containment.
              </p>
            </div>
            <button
              onClick={() => {
                const newZone: SiteLogisticsZoneRecord = {
                  id: `zone-custom-${Date.now()}`,
                  name: `Zone ${draftPlan.logisticsZones.length + 1} — Supplemental Material Staging`,
                  category: 'material_storage',
                  bounds: { x: 1.0, y: 1.0, widthM: 2.5, lengthM: 2.5 },
                  usableCapacityM2: 6.25,
                  maxStackHeightM: 2.0,
                  groundBearingRequirementKPa: 50,
                  verifiedGroundBearingCapacityKPa: 95,
                  groundBearingStatus: 'verified_approved',
                  handlingSensitivity: 'weatherproof_covered_required',
                  weatherProtectionProvided: true,
                  containmentBundProvided: false,
                  activePhaseIds: draftPlan.phases.map((p) => p.id),
                  provenance: 'user_declared_plan',
                  notes: 'User-added supplemental material storage zone.',
                };
                updateAndEvaluatePlan((prev) => ({
                  ...prev,
                  logisticsZones: [...prev.logisticsZones, newZone],
                }));
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg cursor-pointer self-start"
            >
              <Plus className="w-3.5 h-3.5 text-teal-400" />
              <span>Add Logistics Zone</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                  <th className="py-2.5 px-3">Zone Name & Category</th>
                  <th className="py-2.5 px-3">Position X, Y (m)</th>
                  <th className="py-2.5 px-3">Size W × L (m)</th>
                  <th className="py-2.5 px-3">Capacity (m²)</th>
                  <th className="py-2.5 px-3">Ground Bearing (Req / Ver kPa)</th>
                  <th className="py-2.5 px-3">Protection</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {draftPlan.logisticsZones.map((z) => (
                  <tr key={z.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-900">{z.name}</div>
                      <div className="text-[11px] text-slate-500">
                        {z.category.replace(/_/g, ' ')} · {z.handlingSensitivity.replace(/_/g, ' ')}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="0.5"
                          value={z.bounds.x}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            updateAndEvaluatePlan((prev) => ({
                              ...prev,
                              logisticsZones: prev.logisticsZones.map((item) =>
                                item.id === z.id
                                  ? { ...item, bounds: { ...item.bounds, x: val } }
                                  : item
                              ),
                            }));
                          }}
                          className="w-14 px-1.5 py-1 bg-slate-50 border border-slate-200 rounded tabular-nums"
                        />
                        <input
                          type="number"
                          step="0.5"
                          value={z.bounds.y}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            updateAndEvaluatePlan((prev) => ({
                              ...prev,
                              logisticsZones: prev.logisticsZones.map((item) =>
                                item.id === z.id
                                  ? { ...item, bounds: { ...item.bounds, y: val } }
                                  : item
                              ),
                            }));
                          }}
                          className="w-14 px-1.5 py-1 bg-slate-50 border border-slate-200 rounded tabular-nums"
                        />
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="0.5"
                          min="1"
                          value={z.bounds.widthM}
                          onChange={(e) => {
                            const val = Math.max(1, Number(e.target.value));
                            updateAndEvaluatePlan((prev) => ({
                              ...prev,
                              logisticsZones: prev.logisticsZones.map((item) =>
                                item.id === z.id
                                  ? {
                                      ...item,
                                      bounds: { ...item.bounds, widthM: val },
                                      usableCapacityM2: Number((val * item.bounds.lengthM).toFixed(1)),
                                    }
                                  : item
                              ),
                            }));
                          }}
                          className="w-14 px-1.5 py-1 bg-slate-50 border border-slate-200 rounded tabular-nums"
                        />
                        <span>×</span>
                        <input
                          type="number"
                          step="0.5"
                          min="1"
                          value={z.bounds.lengthM}
                          onChange={(e) => {
                            const val = Math.max(1, Number(e.target.value));
                            updateAndEvaluatePlan((prev) => ({
                              ...prev,
                              logisticsZones: prev.logisticsZones.map((item) =>
                                item.id === z.id
                                  ? {
                                      ...item,
                                      bounds: { ...item.bounds, lengthM: val },
                                      usableCapacityM2: Number((item.bounds.widthM * val).toFixed(1)),
                                    }
                                  : item
                              ),
                            }));
                          }}
                          className="w-14 px-1.5 py-1 bg-slate-50 border border-slate-200 rounded tabular-nums"
                        />
                      </div>
                    </td>
                    <td className="py-3 px-3 font-bold tabular-nums text-slate-800">
                      {z.usableCapacityM2} m²
                    </td>
                    <td className="py-3 px-3 tabular-nums">
                      <div>
                        {z.groundBearingRequirementKPa ?? '—'} /{' '}
                        {z.verifiedGroundBearingCapacityKPa ?? 'Unverified'} kPa
                      </div>
                      <div className="text-[11px] text-slate-500">{z.groundBearingStatus}</div>
                    </td>
                    <td className="py-3 px-3">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={z.weatherProtectionProvided}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            updateAndEvaluatePlan((prev) => ({
                              ...prev,
                              logisticsZones: prev.logisticsZones.map((item) =>
                                item.id === z.id
                                  ? { ...item, weatherProtectionProvided: checked }
                                  : item
                              ),
                            }));
                          }}
                        />
                        <span>Weatherproofed</span>
                      </label>
                    </td>
                    <td className="py-3 px-3 text-right">
                      {draftPlan.logisticsZones.length > 1 && (
                        <button
                          onClick={() =>
                            updateAndEvaluatePlan((prev) => ({
                              ...prev,
                              logisticsZones: prev.logisticsZones.filter((item) => item.id !== z.id),
                            }))
                          }
                          className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                          title="Remove zone"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-TAB 4: DELIVERIES SCHEDULE & MODULE A4 TRANSPORT ALIGNMENT */}
      {activeSubTab === 'deliveries-schedule' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Timed Material Delivery Booking Schedule & Unloading Bay Allocation
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Detects double-booked unloading bays, out-of-hours arrival windows, storage capacity overflows, and computes optional P44 Module A4 transport emissions when distance and factor are explicitly declared.
                </p>
              </div>
              <button
                onClick={() => {
                  const newDel: DeliveryRequirementRecord = {
                    id: `del-custom-${Date.now()}`,
                    title: 'MEP Plant & Air Handling Unit Delivery',
                    materialType: 'mep_plant_and_ductwork',
                    phaseId: selectedPhaseId,
                    scheduledDateIso: activePhase?.startDateIso || '2026-10-05',
                    arrivalWindowStart: '13:30',
                    arrivalWindowEnd: '15:00',
                    dwellDurationMinutes: 45,
                    vehicleCategory: 'rigid_flatbed_10m',
                    vehicleCountInWindow: 1,
                    grossPayloadTonnes: 6.5,
                    requiredStorageAreaM2: 4.5,
                    targetAccessPointId: draftPlan.accessPoints[0]?.id || 'gate-1-vehicular',
                    targetVehicleRouteId: draftPlan.vehicleRoutes[0]?.id || 'vroute-1-main',
                    targetUnloadingZoneId: draftPlan.logisticsZones[0]?.id || 'zone-1-unloading',
                    targetStorageZoneId: draftPlan.logisticsZones[1]?.id || null,
                    requiresCraneLiftId: draftPlan.equipmentPlacements[0]?.id || null,
                    oneWayTransportDistanceKm: 45,
                    transportEmissionFactorKgCO2ePerTonneKm: 0.089,
                    justInTimeDelivery: true,
                    holdingAreaFallbackConfirmed: true,
                    notes: 'Booked via gate controller.',
                  };
                  updateAndEvaluatePlan((prev) => ({
                    ...prev,
                    deliveries: [...prev.deliveries, newDel],
                  }));
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg cursor-pointer self-start"
              >
                <Plus className="w-3.5 h-3.5 text-teal-400" />
                <span>Add Scheduled Delivery</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                    <th className="py-2.5 px-3">Delivery Package</th>
                    <th className="py-2.5 px-3">Date & Window</th>
                    <th className="py-2.5 px-3">Vehicle & Payload</th>
                    <th className="py-2.5 px-3">Storage Req (m²)</th>
                    <th className="py-2.5 px-3">Unloading Bay</th>
                    <th className="py-2.5 px-3">Module A4 (km · Factor)</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {draftPlan.deliveries.map((del) => (
                    <tr key={del.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-900">{del.title}</div>
                        <div className="text-[11px] text-slate-500">
                          Phase: {draftPlan.phases.find((p) => p.id === del.phaseId)?.name || del.phaseId}
                        </div>
                      </td>
                      <td className="py-3 px-3 space-y-1">
                        <input
                          type="date"
                          value={del.scheduledDateIso}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateAndEvaluatePlan((prev) => ({
                              ...prev,
                              deliveries: prev.deliveries.map((d) =>
                                d.id === del.id ? { ...d, scheduledDateIso: val } : d
                              ),
                            }));
                          }}
                          className="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs block"
                        />
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={del.arrivalWindowStart}
                            onChange={(e) => {
                              const val = e.target.value;
                              updateAndEvaluatePlan((prev) => ({
                                ...prev,
                                deliveries: prev.deliveries.map((d) =>
                                  d.id === del.id ? { ...d, arrivalWindowStart: val } : d
                                ),
                              }));
                            }}
                            className="w-14 px-1.5 py-0.5 bg-slate-50 border border-slate-200 rounded tabular-nums"
                          />
                          <span>–</span>
                          <input
                            type="text"
                            value={del.arrivalWindowEnd}
                            onChange={(e) => {
                              const val = e.target.value;
                              updateAndEvaluatePlan((prev) => ({
                                ...prev,
                                deliveries: prev.deliveries.map((d) =>
                                  d.id === del.id ? { ...d, arrivalWindowEnd: val } : d
                                ),
                              }));
                            }}
                            className="w-14 px-1.5 py-0.5 bg-slate-50 border border-slate-200 rounded tabular-nums"
                          />
                        </div>
                      </td>
                      <td className="py-3 px-3 tabular-nums">
                        <div className="font-semibold text-slate-800">
                          {del.vehicleCountInWindow} × {VEHICLE_DESIGN_CATALOG[del.vehicleCategory].label.split('(')[0]}
                        </div>
                        <div className="text-slate-500">{del.grossPayloadTonnes} tonnes/load</div>
                      </td>
                      <td className="py-3 px-3">
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          value={del.requiredStorageAreaM2}
                          onChange={(e) => {
                            const val = Math.max(0, Number(e.target.value));
                            updateAndEvaluatePlan((prev) => ({
                              ...prev,
                              deliveries: prev.deliveries.map((d) =>
                                d.id === del.id ? { ...d, requiredStorageAreaM2: val } : d
                              ),
                            }));
                          }}
                          className="w-16 px-2 py-1 bg-slate-50 border border-slate-200 rounded tabular-nums"
                        />
                      </td>
                      <td className="py-3 px-3 text-slate-700">
                        {draftPlan.logisticsZones.find((z) => z.id === del.targetUnloadingZoneId)?.name.split('—')[0] ||
                          del.targetUnloadingZoneId}
                      </td>
                      <td className="py-3 px-3 tabular-nums text-slate-700">
                        {del.oneWayTransportDistanceKm !== null &&
                        del.transportEmissionFactorKgCO2ePerTonneKm !== null ? (
                          <div>
                            {del.oneWayTransportDistanceKm} km · {del.transportEmissionFactorKgCO2ePerTonneKm} kgCO₂e/t·km
                            <div className="text-[11px] text-emerald-700 font-semibold">
                              ={(
                                del.vehicleCountInWindow *
                                del.grossPayloadTonnes *
                                del.oneWayTransportDistanceKm *
                                del.transportEmissionFactorKgCO2ePerTonneKm
                              ).toFixed(1)}{' '}
                              kgCO₂e
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400">Not declared</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right">
                        {draftPlan.deliveries.length > 1 && (
                          <button
                            onClick={() =>
                              updateAndEvaluatePlan((prev) => ({
                                ...prev,
                                deliveries: prev.deliveries.filter((d) => d.id !== del.id),
                              }))
                            }
                            className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                            title="Delete delivery"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs text-emerald-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="font-bold">P44 Module A4 Transport Carbon Alignment: </span>
                <span>{draftPlan.transportCarbonSummary.transparencyNote}</span>
              </div>
              <div className="font-mono font-bold shrink-0">
                Total A4:{' '}
                {draftPlan.transportCarbonSummary.estimatedModuleA4TransportKgCO2e !== null
                  ? `${draftPlan.transportCarbonSummary.estimatedModuleA4TransportKgCO2e.toFixed(2)} kgCO₂e`
                  : 'N/A'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 5: CRANES, HEAVY PLANT & LIFTING SAFETY GATES */}
      {activeSubTab === 'cranes-lifting' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Cranes, Heavy Plant Placements & Mandatory Engineering Safety Gates
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Enforces mandatory verification gates for geotechnical outrigger/base bearing pressure, Appointed Person Lift Plan sign-off, underground utility clearance, and property boundary oversail agreements.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                    <th className="py-2.5 px-3">Equipment / Crane</th>
                    <th className="py-2.5 px-3">Radius & Base (m)</th>
                    <th className="py-2.5 px-3">Bearing (Req / Ver kPa)</th>
                    <th className="py-2.5 px-3">Geotechnical Gate</th>
                    <th className="py-2.5 px-3">Appointed Person Lift Plan</th>
                    <th className="py-2.5 px-3">Underground Utility Survey</th>
                    <th className="py-2.5 px-3">Oversail License</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {draftPlan.equipmentPlacements.map((eq) => (
                    <tr key={eq.id}>
                      <td className="py-3 px-3 font-bold text-slate-900">{eq.name}</td>
                      <td className="py-3 px-3 tabular-nums">
                        R = {eq.operatingRadiusM} m · Outriggers {eq.outriggerSpreadWidthM}×
                        {eq.outriggerSpreadLengthM} m
                      </td>
                      <td className="py-3 px-3 tabular-nums">
                        {eq.requiredGroundBearingKPa ?? '—'} /{' '}
                        {eq.verifiedGroundBearingKPa ?? 'Unverified'} kPa
                      </td>
                      <td className="py-3 px-3">
                        <select
                          value={eq.groundBearingApprovalStatus}
                          onChange={(e) => {
                            const st = e.target.value as LogisticsApprovalStatus;
                            updateAndEvaluatePlan((prev) => ({
                              ...prev,
                              equipmentPlacements: prev.equipmentPlacements.map((item) =>
                                item.id === eq.id
                                  ? { ...item, groundBearingApprovalStatus: st }
                                  : item
                              ),
                            }));
                          }}
                          className="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs"
                        >
                          <option value="verified_approved">Verified & Signed Off</option>
                          <option value="declared_pending_verification">Pending Verification</option>
                          <option value="missing_evidence_blocker">Missing Evidence (Blocker)</option>
                        </select>
                      </td>
                      <td className="py-3 px-3">
                        <select
                          value={eq.certifiedLiftPlanApprovalStatus}
                          onChange={(e) => {
                            const st = e.target.value as LogisticsApprovalStatus;
                            updateAndEvaluatePlan((prev) => ({
                              ...prev,
                              equipmentPlacements: prev.equipmentPlacements.map((item) =>
                                item.id === eq.id
                                  ? { ...item, certifiedLiftPlanApprovalStatus: st }
                                  : item
                              ),
                            }));
                          }}
                          className="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs"
                        >
                          <option value="verified_approved">Verified & Signed Off</option>
                          <option value="declared_pending_verification">Pending Verification</option>
                          <option value="missing_evidence_blocker">Missing Lift Plan (Blocker)</option>
                        </select>
                      </td>
                      <td className="py-3 px-3">
                        <select
                          value={eq.undergroundServiceClearanceStatus}
                          onChange={(e) => {
                            const st = e.target.value as LogisticsApprovalStatus;
                            updateAndEvaluatePlan((prev) => ({
                              ...prev,
                              equipmentPlacements: prev.equipmentPlacements.map((item) =>
                                item.id === eq.id
                                  ? { ...item, undergroundServiceClearanceStatus: st }
                                  : item
                              ),
                            }));
                          }}
                          className="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs"
                        >
                          <option value="verified_approved">PAS 128 Survey Cleared</option>
                          <option value="declared_pending_verification">Pending Survey</option>
                          <option value="missing_evidence_blocker">Unverified Subsurface (Blocker)</option>
                        </select>
                      </td>
                      <td className="py-3 px-3">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={eq.oversailLicenseApproved}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              updateAndEvaluatePlan((prev) => ({
                                ...prev,
                                equipmentPlacements: prev.equipmentPlacements.map((item) =>
                                  item.id === eq.id
                                    ? { ...item, oversailLicenseApproved: checked }
                                    : item
                                ),
                              }));
                            }}
                          />
                          <span>Approved</span>
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Lifting Operations Schedule */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Critical & Routine Lifting Operations Schedule
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Validates required Euclidean lift radius against crane operating reach and checks gross hook load against declared manufacturer load-chart SWL at radius.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                    <th className="py-2.5 px-3">Lifting Operation</th>
                    <th className="py-2.5 px-3">Gross Load (t)</th>
                    <th className="py-2.5 px-3">Declared SWL at Radius (t)</th>
                    <th className="py-2.5 px-3">Req Lift Radius (m)</th>
                    <th className="py-2.5 px-3">Max Wind Limit (m/s)</th>
                    <th className="py-2.5 px-3">Appointed Person Sign-Off</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {draftPlan.liftingOperations.map((lift) => (
                    <tr key={lift.id}>
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-900">{lift.name}</div>
                        <div className="text-[11px] text-slate-500">{lift.loadDescription}</div>
                      </td>
                      <td className="py-3 px-3">
                        <input
                          type="number"
                          step="0.2"
                          min="0.1"
                          value={lift.grossLoadWeightTonnes}
                          onChange={(e) => {
                            const val = Math.max(0.1, Number(e.target.value));
                            updateAndEvaluatePlan((prev) => ({
                              ...prev,
                              liftingOperations: prev.liftingOperations.map((l) =>
                                l.id === lift.id ? { ...l, grossLoadWeightTonnes: val } : l
                              ),
                            }));
                          }}
                          className="w-16 px-2 py-1 bg-slate-50 border border-slate-200 rounded tabular-nums"
                        />
                      </td>
                      <td className="py-3 px-3">
                        <input
                          type="number"
                          step="0.2"
                          min="0.1"
                          value={lift.declaredRatedCapacityAtRadiusTonnes ?? 3.5}
                          onChange={(e) => {
                            const val = Math.max(0.1, Number(e.target.value));
                            updateAndEvaluatePlan((prev) => ({
                              ...prev,
                              liftingOperations: prev.liftingOperations.map((l) =>
                                l.id === lift.id
                                  ? { ...l, declaredRatedCapacityAtRadiusTonnes: val }
                                  : l
                              ),
                            }));
                          }}
                          className="w-16 px-2 py-1 bg-slate-50 border border-slate-200 rounded tabular-nums"
                        />
                      </td>
                      <td className="py-3 px-3 font-bold tabular-nums text-slate-800">
                        {lift.requiredLiftRadiusM.toFixed(2)} m
                      </td>
                      <td className="py-3 px-3 tabular-nums text-slate-700">
                        {lift.windSpeedOperationalLimitMs} m/s
                      </td>
                      <td className="py-3 px-3">
                        <select
                          value={lift.appointedPersonSignOffStatus}
                          onChange={(e) => {
                            const st = e.target.value as LogisticsApprovalStatus;
                            updateAndEvaluatePlan((prev) => ({
                              ...prev,
                              liftingOperations: prev.liftingOperations.map((l) =>
                                l.id === lift.id ? { ...l, appointedPersonSignOffStatus: st } : l
                              ),
                            }));
                          }}
                          className="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs"
                        >
                          <option value="verified_approved">Signed Off (LOLER / BS 7121)</option>
                          <option value="declared_pending_verification">Pending Method Statement</option>
                          <option value="missing_evidence_blocker">Missing Sign-Off (Blocker)</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 6: WELFARE FACILITIES, TEMPORARY UTILITIES & EMERGENCY ACCESS */}
      {activeSubTab === 'facilities-utilities' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              Temporary Welfare Facilities & Site Accommodation
            </h3>
            <div className="space-y-3">
              {draftPlan.temporaryFacilities.map((fac) => (
                <div
                  key={fac.id}
                  className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5 text-xs"
                >
                  <div className="font-bold text-slate-900">{fac.name}</div>
                  <div className="text-slate-600">
                    Footprint: {fac.bounds.widthM} × {fac.bounds.lengthM} m ({fac.storeys} Storeys) · Max Occupancy: {fac.maxOccupancyPersons} Operatives
                  </div>
                  <div className="text-slate-500">
                    Power: {fac.requiresPowerConnection ? 'Required' : 'No'} · Potable Water:{' '}
                    {fac.requiresPotableWater ? 'Required' : 'No'} · Foul Drainage:{' '}
                    {fac.requiresFoulDrainage ? 'Required' : 'No'}
                  </div>
                </div>
              ))}
            </div>

            <h3 className="text-base font-bold text-slate-900 pt-2">
              Emergency Fire Appliance & Egress Corridors
            </h3>
            <div className="space-y-3">
              {draftPlan.emergencyRoutes.map((er) => (
                <div
                  key={er.id}
                  className="p-4 bg-rose-50/50 rounded-xl border border-rose-200 space-y-1.5 text-xs"
                >
                  <div className="font-bold text-rose-950 flex items-center gap-1.5">
                    <Flame className="w-4 h-4 text-rose-600" />
                    <span>{er.name}</span>
                  </div>
                  <div className="text-rose-900">
                    Clear Width: {er.minClearWidthM.toFixed(2)} m · Clear Height:{' '}
                    {er.minClearHeightM.toFixed(2)} m · Unobstructed All Phases:{' '}
                    {er.mustRemainUnobstructedAllPhases ? 'Mandatory' : 'Phase-Specific'}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              Temporary Site Utilities & Existing Buried/Overhead Service Hazards
            </h3>
            <div className="space-y-3">
              {draftPlan.utilityRequirements.map((u) => (
                <div
                  key={u.id}
                  className={`p-4 rounded-xl border space-y-2 text-xs ${
                    u.isExistingHazardToProtect
                      ? 'bg-amber-50/60 border-amber-200'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="font-bold text-slate-900">{u.name}</div>
                  <div className="text-slate-600">
                    Service: {u.serviceType.replace(/_/g, ' ')} · Safety Buffer:{' '}
                    {u.safetyClearanceBufferM} m · {u.capacityDescription}
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-slate-500">Permit / Utility Survey Status:</span>
                    <select
                      value={u.permitOrUtilitySurveyStatus}
                      onChange={(e) => {
                        const st = e.target.value as LogisticsApprovalStatus;
                        updateAndEvaluatePlan((prev) => ({
                          ...prev,
                          utilityRequirements: prev.utilityRequirements.map((item) =>
                            item.id === u.id ? { ...item, permitOrUtilitySurveyStatus: st } : item
                          ),
                        }));
                      }}
                      className="px-2 py-1 bg-white border border-slate-200 rounded text-xs"
                    >
                      <option value="verified_approved">Verified & Protected</option>
                      <option value="declared_pending_verification">Pending Survey</option>
                      <option value="missing_evidence_blocker">Unverified Service Hazard (Blocker)</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 7: CONFLICTS, SAFETY BLOCKERS & RISK REGISTER */}
      {activeSubTab === 'conflicts-risks' && (
        <div className="space-y-6">
          {/* Risk Findings */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              Executive Construction Logistics Risk Findings & Verification Gates
            </h3>
            {draftPlan.riskFindings.length === 0 ? (
              <p className="text-xs text-emerald-800 bg-emerald-50 p-3.5 rounded-lg border border-emerald-200">
                No high-severity logistics risk findings triggered. Continue enforcing standard site safety and Temporary Works inspections.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {draftPlan.riskFindings.map((rf) => (
                  <div
                    key={rf.id}
                    className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-1.5 text-xs"
                  >
                    <div className="font-bold text-slate-900">{rf.headline}</div>
                    <p className="text-slate-600">{rf.rationale}</p>
                    <div className="text-teal-900 font-medium pt-1">
                      Mitigation: {rf.mitigationAction}
                    </div>
                    <div className="text-slate-500">
                      Sign-Off Gate: <strong>{rf.verificationGateRequired}</strong>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Complete Conflicts Register */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              Complete Spatial, Schedule & Safety Blocker Register ({draftPlan.conflicts.length})
            </h3>
            {draftPlan.conflicts.length === 0 ? (
              <p className="text-xs text-slate-600">
                Zero spatial or schedule conflicts detected across all construction phases.
              </p>
            ) : (
              <div className="space-y-3">
                {draftPlan.conflicts.map((c) => (
                  <div
                    key={c.id}
                    className={`p-4 rounded-xl border text-xs space-y-1.5 ${
                      c.severity === 'blocker'
                        ? 'bg-rose-50 border-rose-200 text-rose-950'
                        : c.severity === 'conflict'
                        ? 'bg-amber-50 border-amber-200 text-amber-950'
                        : 'bg-slate-50 border-slate-200 text-slate-800'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-sm">{c.title}</span>
                      <span className="font-mono uppercase text-[11px]">
                        {c.severity} · {c.category.replace(/_/g, ' ')} · Phase: {c.phaseId}
                      </span>
                    </div>
                    <p>{c.description}</p>
                    {(c.measuredValue || c.requiredThreshold) && (
                      <div className="text-[11px] font-mono">
                        Measured: {c.measuredValue || 'N/A'} · Required Threshold:{' '}
                        {c.requiredThreshold || 'N/A'}
                      </div>
                    )}
                    <div className="font-semibold pt-1">
                      Remediation: {c.remediationGuidance}
                    </div>
                    <div className="text-[11px] opacity-80">
                      Competent Professional Sign-Off Required: {c.requiresCompetentProfessionalSignOff}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 8: NON-DESTRUCTIVE ALTERNATIVES & STRUCTURED EXPORT */}
      {activeSubTab === 'alternatives-export' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left 7 Cols: Non-Destructive Alternative Comparison */}
          <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Non-Destructive Logistics Alternative Preview & Comparison
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Simulate candidate site layout and delivery scheduling modifications side-by-side without overwriting your active project state.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleGenerateOptimizedAlternative('segregated-loop')}
                className="px-3 py-2 bg-teal-50 hover:bg-teal-100 text-teal-900 border border-teal-200 rounded-lg text-xs font-semibold cursor-pointer"
              >
                + Preview Option A: Physical Barriers & Widened Haul Route
              </button>
              <button
                onClick={() => handleGenerateOptimizedAlternative('jit-compact-staging')}
                className="px-3 py-2 bg-teal-50 hover:bg-teal-100 text-teal-900 border border-teal-200 rounded-lg text-xs font-semibold cursor-pointer"
              >
                + Preview Option B: Staggered Deliveries & Shifted Laydown
              </button>
              <button
                onClick={() => handleGenerateOptimizedAlternative('relocate-crane-clear')}
                className="px-3 py-2 bg-teal-50 hover:bg-teal-100 text-teal-900 border border-teal-200 rounded-lg text-xs font-semibold cursor-pointer"
              >
                + Preview Option C: Repositioned Crane & Reduced Oversail
              </button>
            </div>

            {alternativePreviews.length === 0 ? (
              <div className="p-6 bg-slate-50 rounded-xl border border-slate-200 text-center text-xs text-slate-500">
                Click any button above to generate a non-destructive candidate layout comparison.
              </div>
            ) : (
              <div className="space-y-3">
                {alternativePreviews.map((alt) => (
                  <div
                    key={alt.id}
                    className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-900">{alt.title}</span>
                      <button
                        onClick={() => handlePromoteAlternativeToDraft(alt)}
                        className="px-3 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-md font-semibold cursor-pointer"
                      >
                        Load into Active Draft
                      </button>
                    </div>
                    <ul className="space-y-0.5 text-slate-600 list-disc list-inside">
                      {alt.comparisonSummary.map((line, idx) => (
                        <li key={idx}>{line}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right 5 Cols: Report Export & Cross-Discipline Provenance */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-4">
              <h3 className="text-base font-bold text-slate-900">
                Export Site Logistics Plan & Audit Report
              </h3>
              <div className="flex items-center gap-2">
                {(['markdown', 'json', 'csv'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => setExportFormat(fmt)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase border cursor-pointer ${
                      exportFormat === fmt
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    {fmt}
                  </button>
                ))}
                <button
                  onClick={handleDownloadExport}
                  className="ml-auto inline-flex items-center gap-1.5 px-4 py-1.5 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-semibold cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </button>
              </div>

              <pre className="p-3 bg-slate-900 text-slate-100 rounded-lg text-[11px] font-mono overflow-x-auto max-h-64">
                {exportSiteLogisticsReport(project, draftPlan, exportFormat)}
              </pre>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-2 text-xs">
              <h4 className="font-bold text-slate-900">
                Cross-Discipline Provenance & Engineering Boundaries
              </h4>
              <ul className="space-y-1 text-slate-600 list-disc list-inside">
                {draftPlan.crossDisciplineContext.provenanceNotes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
                {draftPlan.assumptionsAndLimitations.map((a, i) => (
                  <li key={`lim-${i}`}>{a}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
