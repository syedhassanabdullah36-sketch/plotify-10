import React from 'react';
import {
  ArrowLeft,
  Edit3,
  Trash2,
  Share2,
  Printer,
  Calendar,
  Layers,
  Building,
  Coins,
  FileText,
  Compass,
  CheckCircle2,
  Copy,
  PenTool,
  Box,
  Palette,
  Sparkles,
  Network,
  GitFork,
  AlertCircle,
  Clock,
  Scale,
  DollarSign,
  FileCheck2,
  Grid,
  ShieldAlert,
  Wrench,
  History,
  GitBranch,
  ShieldCheck,
  Award,
  UserCheck,
  FlaskConical,
  Rocket,
  FileCode2,
  FileSpreadsheet,
  Mountain,
  Leaf,
  CloudRain,
  Thermometer,
  Truck,
  Camera,
  Glasses,
  Users,
} from 'lucide-react';
import { Project } from '../types/project';
import { formatArea, formatCurrency, formatDate, getStatusStyle } from '../utils/formatters';
import { PlotDiagram } from './PlotDiagram';
import { MilestoneNotice } from './MilestoneNotice';
import { evaluateConstraintGraph } from '../services/constraintGraphService';
import { generateProjectEvidenceRecords } from '../services/evidenceEngine';
import { evaluateSiteConstraints, initializeProjectSiteContext } from '../services/siteIntelligenceService';
import {
  initializeProjectBrief,
  calculateSpaceProgramSummary,
  compareBriefWithFloorPlan,
  validateBrief,
} from '../services/briefService';
import {
  initializeProjectRegulations,
  evaluateProjectRegulations,
} from '../services/regulatoryService';
import { evaluateStructuralCoordination } from '../services/structuralService';
import { evaluateMEPClashes } from '../services/mepClashService';
import { getProjectSnapshots } from '../services/versioningService';

interface ProjectOverviewViewProps {
  project: Project;
  onBack: () => void;
  onEdit: (project: Project) => void;
  onDelete: (project: Project) => void;
  onDuplicate: (project: Project) => void;
  onOpenFloorPlan: (project: Project) => void;
  onOpen3DViewer: (project: Project) => void;
  onOpenDesignStudio?: (project: Project) => void;
  onOpenDecisionTwin?: (project: Project) => void;
  onOpenConstraintGraph?: (project: Project) => void;
  onOpenImpactSimulator?: (project: Project) => void;
  onOpenCostPlanning?: (project: Project) => void;
  onOpenEvidenceLedger?: (project: Project) => void;
  onOpenDocumentation?: (project: Project) => void;
  onOpenSiteContext?: (project: Project) => void;
  onOpenBrief?: (project: Project) => void;
  onOpenRegulations?: (project: Project) => void;
  onOpenStructural?: (project: Project) => void;
  onOpenMEP?: (project: Project) => void;
  onOpenIFC?: (project: Project) => void;
  onOpenCAD?: (project: Project) => void;
  onOpenTerrain?: (project: Project) => void;
  onOpenCarbon?: (project: Project) => void;
  onOpenClimateResilience?: (project: Project) => void;
  onOpenEnvelopePerformance?: (project: Project) => void;
  onOpenSiteLogistics?: (project: Project) => void;
  onOpenARSite?: (project: Project) => void;
  onOpenVRReview?: (project: Project) => void;
  onOpenLiveCollaboration?: (project: Project) => void;
  onOpenVersionWorkspace?: (project: Project, tab?: 'timeline' | 'diff' | 'recovery' | 'collaboration') => void;
  onOpenSystemHealth?: () => void;
  onOpenVerificationCenter?: () => void;
  onOpenProfessionalReview?: () => void;
  onOpenPilotSystem?: () => void;
  onOpenOperationalReadiness?: () => void;
}

export const ProjectOverviewView: React.FC<ProjectOverviewViewProps> = ({
  project,
  onBack,
  onEdit,
  onDelete,
  onDuplicate,
  onOpenFloorPlan,
  onOpen3DViewer,
  onOpenDesignStudio,
  onOpenDecisionTwin,
  onOpenConstraintGraph,
  onOpenImpactSimulator,
  onOpenCostPlanning,
  onOpenEvidenceLedger,
  onOpenDocumentation,
  onOpenSiteContext,
  onOpenBrief,
  onOpenRegulations,
  onOpenStructural,
  onOpenMEP,
  onOpenIFC,
  onOpenCAD,
  onOpenTerrain,
  onOpenCarbon,
  onOpenClimateResilience,
  onOpenEnvelopePerformance,
  onOpenSiteLogistics,
  onOpenARSite,
  onOpenVRReview,
  onOpenLiveCollaboration,
  onOpenVersionWorkspace,
  onOpenSystemHealth,
  onOpenVerificationCenter,
  onOpenProfessionalReview,
  onOpenPilotSystem,
  onOpenOperationalReadiness,
}) => {
  const { area, label: areaLabel } = formatArea(
    project.plotWidth,
    project.plotLength,
    project.unit
  );
  const statusStyle = getStatusStyle(project.status);
  const unitSuffix = project.unit === 'feet' ? 'ft' : 'm';
  const constraintState = evaluateConstraintGraph(project);
  const { summary: cSummary } = constraintState;
  const evidenceSummary = generateProjectEvidenceRecords(project);
  const siteContext = initializeProjectSiteContext(project);
  const siteConstraints = evaluateSiteConstraints(project);
  const siteConflicts = siteConstraints.filter(c => c.status === 'conflict').length;
  const sitePassing = siteConstraints.filter(c => c.status === 'pass').length;
  const projectBrief = initializeProjectBrief(project);
  const briefSummary = calculateSpaceProgramSummary(project, projectBrief);
  const briefNotices = validateBrief(project, projectBrief);
  const briefConflicts = briefNotices.filter(n => n.severity === 'conflict').length;
  const regState = initializeProjectRegulations(project);
  const regSummary = evaluateProjectRegulations(project, regState);
  const structCoord = evaluateStructuralCoordination(project);
  const mepCoord = evaluateMEPClashes(project);
  const snapshots = getProjectSnapshots(project);
  const latestSnapshot = snapshots.length > 0 ? snapshots[0] : null;

  const roomEntries = [
    { label: 'Bedrooms', count: project.rooms.bedrooms },
    { label: 'Bathrooms', count: project.rooms.bathrooms },
    { label: 'Kitchens', count: project.rooms.kitchen },
    { label: 'Living Rooms', count: project.rooms.livingRoom },
    { label: 'Dining Rooms', count: project.rooms.diningRoom },
    { label: 'Home Offices', count: project.rooms.homeOffice },
    { label: 'Balconies / Terraces', count: project.rooms.balcony },
    { label: 'Garage Spaces', count: project.rooms.garage },
    { label: 'Laundry Rooms', count: project.rooms.laundry },
    { label: 'Storage Units', count: project.rooms.storage },
  ].filter((item) => typeof item.count === 'number' && item.count > 0);

  const customRooms = project.rooms.customRooms || [];

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Top Header Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer self-start"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Projects</span>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => onOpenFloorPlan(project)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors cursor-pointer"
            title="Open interactive 2D floor-plan editor"
          >
            <PenTool className="w-3.5 h-3.5 text-teal-700" />
            <span>2D Plan</span>
          </button>

          <button
            onClick={() => onOpen3DViewer(project)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors cursor-pointer"
            title="Open 3D building model viewer"
          >
            <Box className="w-3.5 h-3.5 text-teal-600" />
            <span>3D View</span>
          </button>

          {onOpenDesignStudio && (
            <button
              onClick={() => onOpenDesignStudio(project)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-950 bg-teal-100/70 hover:bg-teal-200/70 border border-teal-300 rounded-lg transition-colors cursor-pointer"
              title="Open Facade & Interior Design Studio"
            >
              <Palette className="w-3.5 h-3.5 text-teal-700" />
              <span>Design Studio</span>
            </button>
          )}

          {onOpenImpactSimulator && (
            <button
              onClick={() => onOpenImpactSimulator(project)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-950 bg-teal-100/70 hover:bg-teal-200/70 border border-teal-300 rounded-lg transition-colors cursor-pointer"
              title="Open Future-Impact Simulator & Multi-Criteria Design Optimizer"
            >
              <Scale className="w-3.5 h-3.5 text-teal-800" />
              <span>Impact Simulator</span>
            </button>
          )}

          {onOpenCostPlanning && (
            <button
              onClick={() => onOpenCostPlanning(project)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-950 bg-teal-100/70 hover:bg-teal-200/70 border border-teal-300 rounded-lg transition-colors cursor-pointer"
              title="Open Cost Intelligence & Construction Planning Engine"
            >
              <DollarSign className="w-3.5 h-3.5 text-teal-800" />
              <span>Cost & Planning</span>
            </button>
          )}

          {onOpenEvidenceLedger && (
            <button
              onClick={() => onOpenEvidenceLedger(project)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-950 bg-teal-100/70 hover:bg-teal-200/70 border border-teal-300 rounded-lg transition-colors cursor-pointer"
              title="Open Proof-Carrying Design & Evidence Traceability Ledger"
            >
              <FileCheck2 className="w-3.5 h-3.5 text-teal-800" />
              <span>Evidence & Proofs</span>
            </button>
          )}

          {onOpenSiteContext && (
            <button
              onClick={() => onOpenSiteContext(project)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-950 bg-teal-100/70 hover:bg-teal-200/70 border border-teal-300 rounded-lg transition-colors cursor-pointer"
              title="Open Site & Context Intelligence Engine (Setbacks, North, Slope, Obstacles)"
            >
              <Compass className="w-3.5 h-3.5 text-teal-800" />
              <span>Site & Context</span>
            </button>
          )}

          {onOpenBrief && (
            <button
              onClick={() => onOpenBrief(project)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-950 bg-teal-100/70 hover:bg-teal-200/70 border border-teal-300 rounded-lg transition-colors cursor-pointer"
              title="Open Architectural Brief & Space Programming Engine"
            >
              <Layers className="w-3.5 h-3.5 text-teal-800" />
              <span>Brief & Program</span>
            </button>
          )}

          {onOpenRegulations && (
            <button
              onClick={() => onOpenRegulations(project)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-950 bg-teal-100/70 hover:bg-teal-200/70 border border-teal-300 rounded-lg transition-colors cursor-pointer"
              title="Open Building Regulations Intelligence & Statutory Code Engine"
            >
              <Scale className="w-3.5 h-3.5 text-teal-800" />
              <span>Regulations</span>
            </button>
          )}

          {onOpenDocumentation && (
            <button
              onClick={() => onOpenDocumentation(project)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg shadow-2xs transition-colors cursor-pointer"
              title="Open Documentation & Project Handoff Engine"
            >
              <FileText className="w-3.5 h-3.5 text-teal-700" />
              <span>Documentation</span>
            </button>
          )}

          {onOpenIFC && (
            <button
              onClick={() => onOpenIFC(project)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-950 bg-teal-100/80 hover:bg-teal-200/80 border border-teal-300 rounded-lg transition-colors cursor-pointer"
              title="Open OpenBIM & IFC Interoperability Workspace (Import, Inspect, Map, Export & Round-Trip)"
            >
              <FileCode2 className="w-3.5 h-3.5 text-teal-800" />
              <span>OpenBIM / IFC</span>
            </button>
          )}

          {onOpenCAD && (
            <button
              onClick={() => onOpenCAD(project)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-950 bg-teal-100/80 hover:bg-teal-200/80 border border-teal-300 rounded-lg transition-colors cursor-pointer"
              title="Open CAD Drawing Exchange Workspace (ASCII DXF Import, Unit Calibration, Layer Mapping, Export & Round-Trip)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-teal-800" />
              <span>CAD / DXF</span>
            </button>
          )}

          {onOpenTerrain && (
            <button
              onClick={() => onOpenTerrain(project)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-950 bg-teal-100/80 hover:bg-teal-200/80 border border-teal-300 rounded-lg transition-colors cursor-pointer"
              title="Open Terrain & Topographic Site Modeling Workspace (Elevation Survey CSV/GeoJSON, Delaunay TIN, Contours & Sections)"
            >
              <Mountain className="w-3.5 h-3.5 text-teal-800" />
              <span>Terrain & Site</span>
            </button>
          )}

          {onOpenCarbon && (
            <button
              onClick={() => onOpenCarbon(project)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-950 bg-emerald-100/80 hover:bg-emerald-200/80 border border-emerald-300 rounded-lg transition-colors cursor-pointer"
              title="Open Embodied & Whole-Life Carbon Assessment Workspace (EN 15978 / RICS WLCA Modules A0–C4 + Separate Module D)"
            >
              <Leaf className="w-3.5 h-3.5 text-emerald-800" />
              <span>Whole-Life Carbon</span>
            </button>
          )}

          {onOpenClimateResilience && (
            <button
              onClick={() => onOpenClimateResilience(project)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-sky-950 bg-sky-100/80 hover:bg-sky-200/80 border border-sky-300 rounded-lg transition-colors cursor-pointer"
              title="Open Climate Hazard & Resilience Analyzer Workspace (CMIP6 Scenarios, Multi-Hazard Screening, Exposure & Adaptation)"
            >
              <CloudRain className="w-3.5 h-3.5 text-sky-800" />
              <span>Climate & Resilience</span>
            </button>
          )}

          {onOpenEnvelopePerformance && (
            <button
              onClick={() => onOpenEnvelopePerformance(project)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-950 bg-teal-100/80 hover:bg-teal-200/80 border border-teal-300 rounded-lg transition-colors cursor-pointer"
              title="Open Building Envelope Performance Analyzer (ISO 6946 U-Value, Glazing SHGC/WWR, Thermal Bridges, ISO 13788 Dew-Point/Glaser & P44 Carbon Trade-Offs)"
            >
              <Thermometer className="w-3.5 h-3.5 text-teal-800" />
              <span>Envelope Analyzer</span>
            </button>
          )}

          {onOpenSiteLogistics && (
            <button
              onClick={() => onOpenSiteLogistics(project)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-950 bg-amber-100/80 hover:bg-amber-200/80 border border-amber-300 rounded-lg transition-colors cursor-pointer"
              title="Open Construction Site Logistics Planner (Phased Access, Haul & Pedestrian Routes, Laydown Zones, Delivery Windows & Crane Lifting Gates)"
            >
              <Truck className="w-3.5 h-3.5 text-amber-800" />
              <span>Site Logistics</span>
            </button>
          )}

          {onOpenARSite && (
            <button
              onClick={() => onOpenARSite(project)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-950 bg-teal-100/80 hover:bg-teal-200/80 border border-teal-300 rounded-lg transition-colors cursor-pointer"
              title="Open Augmented Reality Site Visualization (WebXR Immersive-AR Passthrough, 1:1 & Tabletop Metric Placement Calibration & P41–P47 Overlays)"
            >
              <Camera className="w-3.5 h-3.5 text-teal-800" />
              <span>AR Site View</span>
            </button>
          )}

          {onOpenVRReview && (
            <button
              onClick={() => onOpenVRReview(project)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-950 bg-teal-100/80 hover:bg-teal-200/80 border border-teal-300 rounded-lg transition-colors cursor-pointer"
              title="Open Immersive VR Design Review (WebXR Immersive-VR Walkthrough, Comfort Teleport, Model-Anchored Annotations & P41–P48 Overlays)"
            >
              <Glasses className="w-3.5 h-3.5 text-teal-800" />
              <span>VR Design Review</span>
            </button>
          )}

          {onOpenLiveCollaboration && (
            <button
              onClick={() => onOpenLiveCollaboration(project)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-950 bg-teal-100/80 hover:bg-teal-200/80 border border-teal-300 rounded-lg transition-colors cursor-pointer"
              title="Open Live Multi-User Design Collaboration (P50 — Workspace RBAC, Hashed Invitations, Compare-and-Set Conflict Handling & P49 Co-Review)"
            >
              <Users className="w-3.5 h-3.5 text-teal-800" />
              <span>Live Collaboration</span>
            </button>
          )}

          {onOpenDecisionTwin && (
            <button
              onClick={() => onOpenDecisionTwin(project)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors cursor-pointer"
              title="Inspect Architectural Decision Twin & Live Dependency Graph"
            >
              <Network className="w-3.5 h-3.5 text-slate-700" />
              <span>Decision Twin</span>
            </button>
          )}

          {onOpenVersionWorkspace && (
            <button
              onClick={() => onOpenVersionWorkspace(project)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-950 bg-teal-100/70 hover:bg-teal-200/70 border border-teal-300 rounded-lg transition-colors cursor-pointer"
              title="Open Project Version History, Revisions Timeline & Diff Engine"
            >
              <History className="w-3.5 h-3.5 text-teal-800" />
              <span>Revisions & Diff</span>
            </button>
          )}

          {onOpenSystemHealth && (
            <button
              onClick={onOpenSystemHealth}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-950 bg-emerald-100/70 hover:bg-emerald-200/70 border border-emerald-300 rounded-lg transition-colors cursor-pointer"
              title="Open System Health, Storage Quota & Disaster Recovery"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-800" />
              <span>Security & Health</span>
            </button>
          )}

          {onOpenVerificationCenter && (
            <button
              onClick={onOpenVerificationCenter}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-950 bg-amber-100/70 hover:bg-amber-200/70 border border-amber-300 rounded-lg transition-colors cursor-pointer"
              title="Open System-Wide Verification & Release Controls"
            >
              <Award className="w-3.5 h-3.5 text-amber-800" />
              <span>Verify & Release</span>
            </button>
          )}

          {onOpenProfessionalReview && (
            <button
              onClick={onOpenProfessionalReview}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-950 bg-teal-100/70 hover:bg-teal-200/70 border border-teal-300 rounded-lg transition-colors cursor-pointer"
              title="Open Professional Review Register & Expert Validation Framework"
            >
              <UserCheck className="w-3.5 h-3.5 text-teal-800" />
              <span>Expert Review</span>
            </button>
          )}

          {onOpenPilotSystem && (
            <button
              onClick={onOpenPilotSystem}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-950 bg-indigo-100/70 hover:bg-indigo-200/70 border border-indigo-300 rounded-lg transition-colors cursor-pointer"
              title="Open Controlled Pilot & Real-World Feedback System"
            >
              <FlaskConical className="w-3.5 h-3.5 text-indigo-800" />
              <span>Pilot System</span>
            </button>
          )}

          {onOpenOperationalReadiness && (
            <button
              onClick={onOpenOperationalReadiness}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-sky-950 bg-sky-100/70 hover:bg-sky-200/70 border border-sky-300 rounded-lg transition-colors cursor-pointer"
              title="Release Preparation & Operational Readiness Center"
            >
              <Rocket className="w-3.5 h-3.5 text-sky-800" />
              <span>Readiness</span>
            </button>
          )}

          <button
            onClick={() => onDuplicate(project)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
            title="Duplicate this project"
          >
            <Copy className="w-3.5 h-3.5 text-slate-500" />
            <span>Duplicate</span>
          </button>

          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
            title="Print project summary"
          >
            <Printer className="w-3.5 h-3.5 text-slate-500" />
            <span>Print Spec</span>
          </button>

          <button
            onClick={() => onEdit(project)}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            <Edit3 className="w-3.5 h-3.5 text-teal-400" />
            <span>Edit Project</span>
          </button>

          <button
            onClick={() => onDelete(project)}
            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
            title="Delete project"
            aria-label="Delete project"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Identity Banner */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mb-1.5">
              <span className="capitalize font-medium text-slate-700">
                {project.projectType === 'other'
                  ? project.customProjectType || 'Other Structure'
                  : project.projectType}
              </span>
              <span aria-hidden="true">·</span>
              <span>Created {formatDate(project.createdAt)}</span>
              <span aria-hidden="true">·</span>
              <span>Updated {formatDate(project.updatedAt)}</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              {project.name}
            </h1>
          </div>

          <span
            className={`px-3 py-1 text-xs font-semibold rounded-md border self-start ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}
          >
            {project.status}
          </span>
        </div>

        {/* Key Project Specification Highlights */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4 pt-5 border-t border-slate-100">
          <div>
            <div className="text-xs text-slate-400 font-medium">Plot Dimensions</div>
            <div className="text-base font-bold text-slate-900 tabular-nums mt-0.5">
              {project.plotWidth} × {project.plotLength} {unitSuffix}
            </div>
            <div className="text-xs text-teal-700 font-medium tabular-nums mt-0.5">
              {areaLabel}
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-400 font-medium">Floors & Storeys</div>
            <div className="text-base font-bold text-slate-900 tabular-nums mt-0.5">
              {project.floors} {project.floors === 1 ? 'Floor' : 'Floors'}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              {project.floors === 1 ? 'Single level' : `Multi-level envelope`}
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-400 font-medium">Primary Road Orientation</div>
            <div className="text-base font-bold text-slate-900 mt-0.5 flex items-center gap-1.5 truncate">
              <Compass className="w-4 h-4 text-teal-600 shrink-0" />
              <span className="truncate">{project.roadFacing}</span>
            </div>
            <div className="text-xs text-slate-500 mt-0.5">Facing elevation</div>
          </div>

          <div>
            <div className="text-xs text-slate-400 font-medium">Target Budget</div>
            <div className="text-base font-bold text-slate-900 tabular-nums mt-0.5">
              {project.budget > 0
                ? formatCurrency(project.budget, project.currency)
                : 'Not specified'}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">{project.currency} Base</div>
          </div>
        </div>
      </div>

      {/* Grid: Plot Geometry & Spatial Diagram on Left, Room Program on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Plot Geometry Diagram (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <PlotDiagram project={project} />
          
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button
              onClick={() => onOpenFloorPlan(project)}
              className="py-2.5 px-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs text-center"
            >
              <PenTool className="w-3.5 h-3.5 text-teal-400 shrink-0" />
              <span>2D Plan</span>
            </button>
            <button
              onClick={() => onOpen3DViewer(project)}
              className="py-2.5 px-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs text-center"
            >
              <Box className="w-3.5 h-3.5 text-teal-600 shrink-0" />
              <span>3D View</span>
            </button>
            {onOpenDesignStudio && (
              <button
                onClick={() => onOpenDesignStudio(project)}
                className="py-2.5 px-2 bg-teal-50 hover:bg-teal-100 border border-teal-200 text-teal-900 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs text-center"
              >
                <Palette className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                <span>Studio</span>
              </button>
            )}
            {onOpenStructural && (
              <button
                onClick={() => onOpenStructural(project)}
                className="py-2.5 px-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs text-center"
              >
                <Grid className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                <span>Structural</span>
              </button>
            )}
            {onOpenMEP && (
              <button
                onClick={() => onOpenMEP(project)}
                className="py-2.5 px-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs text-center"
              >
                <Wrench className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                <span>MEP & Clashes</span>
              </button>
            )}
          </div>

          {/* Architectural Decision Twin Status Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Network className="w-4 h-4 text-teal-700" />
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Decision Twin State</h4>
              </div>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-teal-50 text-teal-800 border border-teal-200">
                <CheckCircle2 className="w-3 h-3 text-teal-600" />
                Connected
              </span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Deterministic dependency graph actively connects project plot metrics, 2D plan geometry, 3D model engine, and design finishes.
            </p>
            {onOpenDecisionTwin && (
              <button
                onClick={() => onOpenDecisionTwin(project)}
                className="w-full py-2 px-3 bg-slate-50 hover:bg-teal-50 text-slate-800 hover:text-teal-900 border border-slate-200 hover:border-teal-300 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Network className="w-3.5 h-3.5 text-teal-700" />
                <span>Inspect Graph & Spatial FAR Analytics →</span>
              </button>
            )}
          </div>

          {/* Living Constraint Graph Status Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GitFork className="w-4 h-4 text-teal-700" />
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Living Constraint Graph
                </h4>
              </div>
              {cSummary.conflicts > 0 ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-800 border border-rose-200">
                  <AlertCircle className="w-3 h-3 text-rose-600" />
                  {cSummary.conflicts} Conflict{cSummary.conflicts > 1 ? 's' : ''}
                </span>
              ) : cSummary.pending > 0 ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                  <Clock className="w-3 h-3 text-amber-600" />
                  {cSummary.pending} Pending
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  {cSummary.passing}/{cSummary.total} Pass
                </span>
              )}
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Living constraint engine verifies parcel boundaries, multi-floor invariants, program requirements, and 2D-to-3D sync.
            </p>

            <div className="grid grid-cols-4 gap-1.5 py-1 text-center text-xs">
              <div className="p-1.5 bg-slate-50 rounded border border-slate-100">
                <div className="text-[10px] text-slate-400 font-semibold uppercase">Total</div>
                <div className="font-bold text-slate-800 tabular-nums">{cSummary.total}</div>
              </div>
              <div className="p-1.5 bg-emerald-50/70 rounded border border-emerald-100">
                <div className="text-[10px] text-emerald-700 font-semibold uppercase">Pass</div>
                <div className="font-bold text-emerald-800 tabular-nums">{cSummary.passing}</div>
              </div>
              <div className={`p-1.5 rounded border ${cSummary.conflicts > 0 ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-100'}`}>
                <div className={`text-[10px] font-semibold uppercase ${cSummary.conflicts > 0 ? 'text-rose-700' : 'text-slate-400'}`}>Conflict</div>
                <div className={`font-bold tabular-nums ${cSummary.conflicts > 0 ? 'text-rose-800' : 'text-slate-800'}`}>{cSummary.conflicts}</div>
              </div>
              <div className="p-1.5 bg-slate-50 rounded border border-slate-100">
                <div className="text-[10px] text-slate-400 font-semibold uppercase">N/A</div>
                <div className="font-bold text-slate-600 tabular-nums">{cSummary.notAssessed}</div>
              </div>
            </div>

            {onOpenConstraintGraph && (
              <button
                onClick={() => onOpenConstraintGraph(project)}
                className="w-full py-2 px-3 bg-slate-50 hover:bg-teal-50 text-slate-800 hover:text-teal-900 border border-slate-200 hover:border-teal-300 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <GitFork className="w-3.5 h-3.5 text-teal-700" />
                <span>Inspect Living Constraints & Rules →</span>
              </button>
            )}
          </div>

          {/* Proof-Carrying Design & Evidence Ledger Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FileCheck2 className="w-4 h-4 text-teal-700" />
                <h3 className="text-sm font-bold text-slate-900">Proof-Carrying Ledger</h3>
              </div>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200">
                {evidenceSummary.passCount}/{evidenceSummary.totalRecords} Passed
              </span>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Deterministic mathematical audit records with captured inputs, formula explanations, and stale-data tracking.
            </p>

            <div className="grid grid-cols-4 gap-1.5 py-1 text-center text-xs">
              <div className="p-1.5 bg-slate-50 rounded border border-slate-100">
                <div className="text-[10px] text-slate-400 font-semibold uppercase">Total</div>
                <div className="font-bold text-slate-800 tabular-nums">{evidenceSummary.totalRecords}</div>
              </div>
              <div className="p-1.5 bg-emerald-50/70 rounded border border-emerald-100">
                <div className="text-[10px] text-emerald-700 font-semibold uppercase">Pass</div>
                <div className="font-bold text-emerald-800 tabular-nums">{evidenceSummary.passCount}</div>
              </div>
              <div className={`p-1.5 rounded border ${evidenceSummary.conflictCount > 0 ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-100'}`}>
                <div className={`text-[10px] font-semibold uppercase ${evidenceSummary.conflictCount > 0 ? 'text-rose-700' : 'text-slate-400'}`}>Conflict</div>
                <div className={`font-bold tabular-nums ${evidenceSummary.conflictCount > 0 ? 'text-rose-800' : 'text-slate-800'}`}>{evidenceSummary.conflictCount}</div>
              </div>
              <div className={`p-1.5 rounded border ${evidenceSummary.staleCount > 0 ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-100'}`}>
                <div className={`text-[10px] font-semibold uppercase ${evidenceSummary.staleCount > 0 ? 'text-amber-700' : 'text-slate-400'}`}>Stale</div>
                <div className={`font-bold tabular-nums ${evidenceSummary.staleCount > 0 ? 'text-amber-800' : 'text-slate-800'}`}>{evidenceSummary.staleCount}</div>
              </div>
            </div>

            {onOpenEvidenceLedger && (
              <button
                onClick={() => onOpenEvidenceLedger(project)}
                className="w-full py-2 px-3 bg-teal-50 hover:bg-teal-100 text-teal-900 border border-teal-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <FileCheck2 className="w-3.5 h-3.5 text-teal-700" />
                <span>Review Evidence & Audit Records →</span>
              </button>
            )}
          </div>

          {/* Site & Context Intelligence Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Compass className="w-4 h-4 text-teal-700" />
                <h3 className="text-sm font-bold text-slate-900">Site & Context</h3>
              </div>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                siteConflicts > 0
                  ? 'bg-rose-50 text-rose-800 border-rose-200'
                  : 'bg-teal-50 text-teal-800 border-teal-200'
              }`}>
                {siteConflicts > 0 ? `${siteConflicts} Conflict${siteConflicts > 1 ? 's' : ''}` : `${sitePassing} Clearances OK`}
              </span>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Parcel orientation ({siteContext.northOrientationOffsetDeg}° True North), setbacks, preserved obstacles, and passive solar exposure.
            </p>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-[10px] text-slate-400 font-semibold block uppercase">Setbacks</span>
                <span className="font-bold text-slate-800">
                  F:{siteContext.setbacks.front}{unitSuffix} R:{siteContext.setbacks.rear}{unitSuffix}
                </span>
              </div>
              <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-[10px] text-slate-400 font-semibold block uppercase">Obstacles</span>
                <span className="font-bold text-slate-800">
                  {siteContext.obstacles.length} Feature{siteContext.obstacles.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-[10px] text-slate-400 font-semibold block uppercase">Slope</span>
                <span className="font-bold text-slate-800 capitalize">
                  {siteContext.slope.replace(/-/g, ' ')}
                </span>
              </div>
            </div>

            {onOpenSiteContext && (
              <button
                onClick={() => onOpenSiteContext(project)}
                className="w-full py-2 px-3 bg-teal-50 hover:bg-teal-100 text-teal-900 border border-teal-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Compass className="w-3.5 h-3.5 text-teal-700" />
                <span>Inspect Site Plan & Microclimate →</span>
              </button>
            )}
          </div>

          {/* Architectural Brief & Space Programming Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-teal-700" />
                <h3 className="text-sm font-bold text-slate-900">Brief & Space Program</h3>
              </div>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                  briefConflicts > 0
                    ? 'bg-rose-50 text-rose-800 border-rose-200'
                    : 'bg-teal-50 text-teal-800 border-teal-200'
                }`}
              >
                {briefConflicts > 0
                  ? `${briefConflicts} Unplaced Space${briefConflicts > 1 ? 's' : ''}`
                  : `${projectBrief.spaces.length} Spaces Programmed`}
              </span>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Programmed net space targets, occupancy requirements, circulation allowances, and real-time 2D plan reconciliation.
            </p>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-[10px] text-slate-400 font-semibold block uppercase">Target Net</span>
                <span className="font-bold text-slate-800 tabular-nums">
                  {briefSummary.totalTargetNetArea.toLocaleString()} {project.unit === 'feet' ? 'sq ft' : 'm²'}
                </span>
              </div>
              <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-[10px] text-slate-400 font-semibold block uppercase">Est. Gross</span>
                <span className="font-bold text-slate-800 tabular-nums">
                  {briefSummary.estimatedGrossInternalArea.toLocaleString()} {project.unit === 'feet' ? 'sq ft' : 'm²'}
                </span>
              </div>
              <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-[10px] text-slate-400 font-semibold block uppercase">Plot Fit</span>
                <span className="font-bold text-slate-800 uppercase">
                  {briefSummary.footprintFitStatus}
                </span>
              </div>
            </div>

            {onOpenBrief && (
              <button
                onClick={() => onOpenBrief(project)}
                className="w-full py-2 px-3 bg-teal-50 hover:bg-teal-100 text-teal-900 border border-teal-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5 text-teal-700" />
                <span>Open Brief & Program Workspace →</span>
              </button>
            )}
          </div>

          {/* Building Regulations Intelligence Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Scale className="w-4 h-4 text-teal-700" />
                <h3 className="text-sm font-bold text-slate-900">Building Regulations</h3>
              </div>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                  regSummary.counts.conflict > 0
                    ? 'bg-rose-50 text-rose-800 border-rose-200'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                }`}
              >
                {regSummary.counts.conflict > 0
                  ? `${regSummary.counts.conflict} Conflict${regSummary.counts.conflict > 1 ? 's' : ''}`
                  : `${regSummary.counts.pass} Passing Codes`}
              </span>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Automated statutory checks for zoning setbacks, maximum lot coverage, habitable room dimensions, and structural review flags.
            </p>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-[10px] text-slate-400 font-semibold block uppercase">Jurisdiction</span>
                <span className="font-bold text-slate-800 truncate block" title={regSummary.profile.country}>
                  {regSummary.profile.country || 'Unknown'}
                </span>
              </div>
              <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-[10px] text-slate-400 font-semibold block uppercase">Evaluated</span>
                <span className="font-bold text-slate-800 tabular-nums">
                  {regSummary.counts.total} Rules
                </span>
              </div>
              <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-[10px] text-slate-400 font-semibold block uppercase">In Review</span>
                <span className="font-bold text-slate-800 tabular-nums">
                  {regSummary.counts.needsReview} Items
                </span>
              </div>
            </div>

            {onOpenRegulations && (
              <button
                onClick={() => onOpenRegulations(project)}
                className="w-full py-2 px-3 bg-teal-50 hover:bg-teal-100 text-teal-900 border border-teal-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Scale className="w-3.5 h-3.5 text-teal-700" />
                <span>Open Building Regulations Engine →</span>
              </button>
            )}
          </div>

          {/* Structural Coordination & Engineering Review Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Grid className="w-4 h-4 text-teal-700" />
                <h3 className="text-sm font-bold text-slate-900">Structural Coordination</h3>
              </div>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                  structCoord.summary.issueCounts.conflict > 0
                    ? 'bg-rose-50 text-rose-800 border-rose-200'
                    : structCoord.summary.issueCounts.reviewRequired > 0
                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                }`}
              >
                {structCoord.summary.issueCounts.conflict > 0
                  ? `${structCoord.summary.issueCounts.conflict} Conflict${structCoord.summary.issueCounts.conflict > 1 ? 's' : ''}`
                  : `${structCoord.summary.totalColumns} Columns Placed`}
              </span>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Orthogonal reference grid, clear span limits ({structCoord.summary.maxMeasuredSpan.toFixed(1)} {unitSuffix} max), multi-floor load paths, and engineering review register.
            </p>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-[10px] text-slate-400 font-semibold block uppercase">Framing</span>
                <span className="font-bold text-slate-800 truncate block">
                  {(project.structuralCoordination?.framingSystem || 'Concrete/Timber').replace(/-/g, ' ')}
                </span>
              </div>
              <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-[10px] text-slate-400 font-semibold block uppercase">Max Span</span>
                <span className={`font-bold tabular-nums ${structCoord.summary.maxMeasuredSpan > (project.structuralCoordination?.maxUnsupportedSpanThreshold ?? 20) ? 'text-amber-700' : 'text-slate-800'}`}>
                  {structCoord.summary.maxMeasuredSpan.toFixed(1)} {unitSuffix}
                </span>
              </div>
              <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-[10px] text-slate-400 font-semibold block uppercase">Sign-Off</span>
                <span className="font-bold text-slate-800">
                  {project.structuralCoordination?.engineeringSignOff?.isSignedOff ? 'Stamped' : 'Pending'}
                </span>
              </div>
            </div>

            {onOpenStructural && (
              <button
                onClick={() => onOpenStructural(project)}
                className="w-full py-2 px-3 bg-teal-50 hover:bg-teal-100 text-teal-900 border border-teal-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Grid className="w-3.5 h-3.5 text-teal-700" />
                <span>Open Structural Coordination Workspace →</span>
              </button>
            )}
          </div>

          {/* MEP Coordination & Clash Detection Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Wrench className="w-4 h-4 text-teal-700" />
                <h3 className="text-sm font-bold text-slate-900">MEP Coordination & Clashes</h3>
              </div>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                  mepCoord.summary.clashCounts.hardClash > 0
                    ? 'bg-rose-50 text-rose-800 border-rose-200'
                    : mepCoord.summary.clashCounts.clearanceViolation > 0
                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                }`}
              >
                {mepCoord.summary.clashCounts.hardClash > 0
                  ? `${mepCoord.summary.clashCounts.hardClash} Hard Clash${mepCoord.summary.clashCounts.hardClash > 1 ? 'es' : ''}`
                  : mepCoord.summary.clashCounts.clearanceViolation > 0
                  ? `${mepCoord.summary.clashCounts.clearanceViolation} Clearance Alert${mepCoord.summary.clashCounts.clearanceViolation > 1 ? 's' : ''}`
                  : `${mepCoord.summary.totalComponents} Routes Cleared`}
              </span>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Spatial interference checks across HVAC supply/return ducts, electrical distribution panels & cable trays, and plumbing sanitary stacks.
            </p>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-[10px] text-slate-400 font-semibold block uppercase">Elements</span>
                <span className="font-bold text-slate-800 tabular-nums">
                  {mepCoord.summary.totalComponents} Placed
                </span>
              </div>
              <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-[10px] text-slate-400 font-semibold block uppercase">Hard Clashes</span>
                <span className={`font-bold tabular-nums ${mepCoord.summary.clashCounts.hardClash > 0 ? 'text-rose-600' : 'text-slate-800'}`}>
                  {mepCoord.summary.clashCounts.hardClash}
                </span>
              </div>
              <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-[10px] text-slate-400 font-semibold block uppercase">Clearances</span>
                <span className={`font-bold tabular-nums ${mepCoord.summary.clashCounts.clearanceViolation > 0 ? 'text-amber-600' : 'text-slate-800'}`}>
                  {mepCoord.summary.clashCounts.clearanceViolation}
                </span>
              </div>
            </div>

            {onOpenMEP && (
              <button
                onClick={() => onOpenMEP(project)}
                className="w-full py-2 px-3 bg-teal-50 hover:bg-teal-100 text-teal-900 border border-teal-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Wrench className="w-3.5 h-3.5 text-teal-700" />
                <span>Open MEP Coordination Engine →</span>
              </button>
            )}
          </div>

          {/* Documentation & Handoff Packages Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-teal-700" />
                <h3 className="text-sm font-bold text-slate-900">Documentation & Handoff</h3>
              </div>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                5 Packages
              </span>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Export publication-ready architectural dossiers, room schedules, elemental QTO bills of quantities, and audit ledgers.
            </p>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-[10px] text-slate-400 font-semibold block uppercase">Schedules</span>
                <span className="font-bold text-slate-800">{project.floorPlan?.rooms?.length || 0} Rooms Listed</span>
              </div>
              <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-[10px] text-slate-400 font-semibold block uppercase">Formats</span>
                <span className="font-bold text-slate-800">Print, PDF, CSV, MD</span>
              </div>
            </div>

            {onOpenDocumentation && (
              <button
                onClick={() => onOpenDocumentation(project)}
                className="w-full py-2 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              >
                <FileText className="w-3.5 h-3.5 text-teal-400" />
                <span>Open Documentation Workspace →</span>
              </button>
            )}
          </div>

          {/* OpenBIM & IFC Interoperability Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FileCode2 className="w-4 h-4 text-teal-700" />
                <h3 className="text-sm font-bold text-slate-900">OpenBIM & IFC Interop</h3>
              </div>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200">
                {project.ifcInterop?.lastImportReport
                  ? `${project.ifcInterop.lastImportReport.schemaIdentifier} Linked`
                  : 'IFC2X3 / IFC4'}
              </span>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Import, inspect, and deterministically map supported IFC building hierarchies, spaces, and structural columns, or export standards-conforming IFC4 STEP files.
            </p>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-[10px] text-slate-400 font-semibold block uppercase">Provenance</span>
                <span className="font-bold text-slate-800 truncate block">
                  {project.ifcInterop?.idMappings
                    ? `${project.ifcInterop.idMappings.length} GlobalIds`
                    : 'Ready to Map'}
                </span>
              </div>
              <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-[10px] text-slate-400 font-semibold block uppercase">Preserved</span>
                <span className="font-bold text-slate-800 truncate block">
                  {project.ifcInterop?.preservedElements
                    ? `${project.ifcInterop.preservedElements.length} IFC Entities`
                    : 'ISO 10303-21'}
                </span>
              </div>
            </div>

            {onOpenIFC && (
              <button
                onClick={() => onOpenIFC(project)}
                className="w-full py-2 px-3 bg-teal-50 hover:bg-teal-100 text-teal-900 border border-teal-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <FileCode2 className="w-3.5 h-3.5 text-teal-700" />
                <span>Open OpenBIM & IFC Workspace →</span>
              </button>
            )}
          </div>

          {/* CAD Drawing Exchange Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-teal-700" />
                <h3 className="text-sm font-bold text-slate-900">CAD Drawing Exchange</h3>
              </div>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200">
                {project.cadInterop?.lastImportReport
                  ? `${project.cadInterop.lastImportReport.acadVersionLabel}`
                  : 'ASCII DXF'}
              </span>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Import, calibrate units, map CAD layers to rooms and structural columns, or export standards-compliant ASCII DXF drawings.
            </p>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-[10px] text-slate-400 font-semibold block uppercase">CAD Links</span>
                <span className="font-bold text-slate-800 truncate block">
                  {project.cadInterop?.provenanceMappings
                    ? `${project.cadInterop.provenanceMappings.length} Entities`
                    : 'Ready to Map'}
                </span>
              </div>
              <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-[10px] text-slate-400 font-semibold block uppercase">References</span>
                <span className="font-bold text-slate-800 truncate block">
                  {project.cadInterop?.referenceEntities
                    ? `${project.cadInterop.referenceEntities.length} Preserved`
                    : 'DXF R12–2018'}
                </span>
              </div>
            </div>

            {onOpenCAD && (
              <button
                onClick={() => onOpenCAD(project)}
                className="w-full py-2 px-3 bg-teal-50 hover:bg-teal-100 text-teal-900 border border-teal-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-teal-700" />
                <span>Open CAD Drawing Exchange →</span>
              </button>
            )}
          </div>

          {/* Terrain & Topographic Site Modeling Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Mountain className="w-4 h-4 text-teal-700" />
                <h3 className="text-sm font-bold text-slate-900">Terrain & Topography</h3>
              </div>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200">
                {project.terrainModeling?.surfaceMesh
                  ? `${project.terrainModeling.surfaceMesh.triangles.length} TIN Tris`
                  : 'CSV / GeoJSON'}
              </span>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Import survey elevation points or GeoJSON topography, calibrate CRS & vertical datum, generate Delaunay TIN surfaces & contours, and inspect site-building elevation profiles.
            </p>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-[10px] text-slate-400 font-semibold block uppercase">Relief</span>
                <span className="font-bold text-slate-800 truncate block">
                  {project.terrainModeling?.analysis
                    ? `${project.terrainModeling.analysis.elevationRelief.toFixed(2)} ${unitSuffix}`
                    : 'Ready to Model'}
                </span>
              </div>
              <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-[10px] text-slate-400 font-semibold block uppercase">Contours</span>
                <span className="font-bold text-slate-800 truncate block">
                  {project.terrainModeling?.surfaceMesh
                    ? `${project.terrainModeling.surfaceMesh.derivedContours.length} Segments`
                    : 'Delaunay TIN'}
                </span>
              </div>
            </div>

            {onOpenTerrain && (
              <button
                onClick={() => onOpenTerrain(project)}
                className="w-full py-2 px-3 bg-teal-50 hover:bg-teal-100 text-teal-900 border border-teal-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Mountain className="w-3.5 h-3.5 text-teal-700" />
                <span>Open Terrain & Site Modeling →</span>
              </button>
            )}
          </div>

          {/* Embodied & Whole-Life Carbon Assessment Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Leaf className="w-4 h-4 text-emerald-700" />
                <h3 className="text-sm font-bold text-slate-900">Whole-Life Carbon</h3>
              </div>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                {project.carbonAssessment?.activeAssessment
                  ? `${project.carbonAssessment.activeAssessment.totals.wholeLifeCarbonAtoCTCO2e.toFixed(1)} tCO₂e`
                  : 'EN 15978 / WLCA'}
              </span>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Evaluate upfront (A0–A5), in-use replacement (B2–B5), operational energy/water (B6–B7), end-of-life (C1–C4), and separate Module D circularity with full EPD factor traceability.
            </p>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-[10px] text-slate-400 font-semibold block uppercase">Scope</span>
                <span className="font-bold text-slate-800 truncate block">
                  {project.carbonAssessment?.activeAssessment
                    ? project.carbonAssessment.activeAssessment.scopeClassification
                    : 'Ready to Assess'}
                </span>
              </div>
              <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-[10px] text-slate-400 font-semibold block uppercase">Intensity</span>
                <span className="font-bold text-slate-800 truncate block">
                  {project.carbonAssessment?.activeAssessment?.totals.wholeLifeIntensityKgCO2ePerM2Gfa
                    ? `${project.carbonAssessment.activeAssessment.totals.wholeLifeIntensityKgCO2ePerM2Gfa} kgCO₂e/m²`
                    : 'Modules A0–D'}
                </span>
              </div>
            </div>

            {onOpenCarbon && (
              <button
                onClick={() => onOpenCarbon(project)}
                className="w-full py-2 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Leaf className="w-3.5 h-3.5 text-emerald-700" />
                <span>Open Whole-Life Carbon Workspace →</span>
              </button>
            )}
          </div>

          {/* Climate Hazard & Resilience Analyzer Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <CloudRain className="w-4 h-4 text-sky-700" />
                <h3 className="text-sm font-bold text-slate-900">Climate & Resilience</h3>
              </div>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-sky-50 text-sky-800 border border-sky-200">
                {project.climateResilience?.activeAssessment
                  ? `${project.climateResilience.activeAssessment.config.activeScenario.toUpperCase()}`
                  : 'IPCC AR6 / CMIP6'}
              </span>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Multi-hazard climate screening (heat, cloudburst rainfall, fluvial/pluvial/coastal flooding, drought, wind, wildfire, slope) separating hazard, exposure, vulnerability, and residual risk.
            </p>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-[10px] text-slate-400 font-semibold block uppercase">Screened</span>
                <span className="font-bold text-slate-800 truncate block">
                  {project.climateResilience?.activeAssessment
                    ? `${project.climateResilience.activeAssessment.summaryCounts.hazardsAssessed}/${project.climateResilience.activeAssessment.summaryCounts.totalHazardsCataloged} Hazards`
                    : 'Ready to Screen'}
                </span>
              </div>
              <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-[10px] text-slate-400 font-semibold block uppercase">Adaptation</span>
                <span className="font-bold text-slate-800 truncate block">
                  {project.climateResilience?.activeAssessment
                    ? `${project.climateResilience.activeAssessment.summaryCounts.selectedAdaptationMeasures} Measures`
                    : 'P44 Linked'}
                </span>
              </div>
            </div>

            {onOpenClimateResilience && (
              <button
                onClick={() => onOpenClimateResilience(project)}
                className="w-full py-2 px-3 bg-sky-50 hover:bg-sky-100 text-sky-900 border border-sky-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <CloudRain className="w-3.5 h-3.5 text-sky-700" />
                <span>Open Climate Hazard & Resilience →</span>
              </button>
            )}
          </div>

          {/* Building Envelope Performance Analyzer Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Thermometer className="w-4 h-4 text-teal-700" />
                <h3 className="text-sm font-bold text-slate-900">Envelope Performance</h3>
              </div>
              <span className="text-[10px] font-semibold text-teal-800">
                {project.envelopePerformance?.activeAssessment?.summary?.effectiveEnvelopeUWithBridgesWPerM2K
                  ? `U_eff ${project.envelopePerformance.activeAssessment.summary.effectiveEnvelopeUWithBridgesWPerM2K.toFixed(2)} W/m²K`
                  : 'ISO 6946 / 13788'}
              </span>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Evaluate layered opaque assembly R/U-values, glazing SHGC & orientation WWR, linear/point thermal bridges, ISO 13788 dew-point & Glaser condensation screening, and P44 embodied carbon trade-offs.
            </p>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-[10px] text-slate-400 font-semibold block uppercase">Assemblies</span>
                <span className="font-bold text-slate-800 truncate block">
                  {project.envelopePerformance?.activeAssessment
                    ? `${project.envelopePerformance.activeAssessment.assemblies.length} Evaluated`
                    : 'Ready to Analyze'}
                </span>
              </div>
              <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-[10px] text-slate-400 font-semibold block uppercase">Heat Loss H_tr</span>
                <span className="font-bold text-slate-800 truncate block">
                  {project.envelopePerformance?.activeAssessment?.summary?.transmissionHeatTransferCoeffWPerK
                    ? `${project.envelopePerformance.activeAssessment.summary.transmissionHeatTransferCoeffWPerK.toFixed(1)} W/K`
                    : 'Steady-State'}
                </span>
              </div>
            </div>

            {onOpenEnvelopePerformance && (
              <button
                onClick={() => onOpenEnvelopePerformance(project)}
                className="w-full py-2 px-3 bg-teal-50 hover:bg-teal-100 text-teal-900 border border-teal-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Thermometer className="w-3.5 h-3.5 text-teal-700" />
                <span>Open Envelope Performance Analyzer →</span>
              </button>
            )}
          </div>

          {/* Construction Site Logistics Planner Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-amber-700" />
                <h3 className="text-sm font-bold text-slate-900">Site Logistics Planner</h3>
              </div>
              <span className="text-[10px] font-semibold text-amber-800">
                {project.siteLogistics?.activePlan
                  ? `${project.siteLogistics.activePlan.summary.totalPhases} Phases · ${project.siteLogistics.activePlan.summary.conflictCount} Conflicts`
                  : 'P47 Logistics'}
              </span>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Plan phased site access gates, vehicle & pedestrian segregation, material laydown capacity, delivery window booking, crane reach & ground-bearing safety gates, and temporary utilities.
            </p>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-[10px] text-slate-400 font-semibold block uppercase">Peak Yard Util</span>
                <span className="font-bold text-slate-800 truncate block">
                  {project.siteLogistics?.activePlan
                    ? `${project.siteLogistics.activePlan.summary.peakExteriorUtilizationPct.toFixed(1)}%`
                    : 'Ready to Plan'}
                </span>
              </div>
              <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-[10px] text-slate-400 font-semibold block uppercase">Safety Blockers</span>
                <span className="font-bold text-slate-800 truncate block">
                  {project.siteLogistics?.activePlan
                    ? `${project.siteLogistics.activePlan.summary.blockerCount} Active`
                    : 'Geotech & Lift Gates'}
                </span>
              </div>
            </div>

            {onOpenSiteLogistics && (
              <button
                onClick={() => onOpenSiteLogistics(project)}
                className="w-full py-2 px-3 bg-amber-50 hover:bg-amber-100 text-amber-950 border border-amber-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Truck className="w-3.5 h-3.5 text-amber-700" />
                <span>Open Construction Site Logistics Planner →</span>
              </button>
            )}
          </div>

          {/* P48 Augmented Reality Site Visualization Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-teal-700" />
                <h3 className="text-sm font-bold text-slate-900">AR Site Visualization</h3>
              </div>
              <span className="text-[10px] font-semibold text-teal-800">
                {project.arSiteVisualization?.savedConfig
                  ? `Scale ${project.arSiteVisualization.savedConfig.placement.scalePreset} · Saved`
                  : 'WebXR / 1:1 Metric'}
              </span>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Visualize normalized 1:1 metric or tabletop (1:10–1:100) building massing, P43 topography, and P47 logistics in WebXR immersive-ar or calibrated placement preview.
            </p>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-[10px] text-slate-400 font-semibold block uppercase">Metric Scale</span>
                <span className="font-bold text-slate-800 truncate block">
                  {project.arSiteVisualization?.savedConfig
                    ? project.arSiteVisualization.savedConfig.placement.scalePreset
                    : '1:1 Full-Scale'}
                </span>
              </div>
              <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-[10px] text-slate-400 font-semibold block uppercase">Alignment</span>
                <span className="font-bold text-slate-800 truncate block">
                  Local / Calibrated
                </span>
              </div>
            </div>

            {onOpenARSite && (
              <button
                onClick={() => onOpenARSite(project)}
                className="w-full py-2 px-3 bg-teal-50 hover:bg-teal-100 text-teal-900 border border-teal-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5 text-teal-700" />
                <span>Open AR Site Visualization Studio →</span>
              </button>
            )}
          </div>

          {/* Project Versions & Revisions History Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-teal-700" />
                <h3 className="text-sm font-bold text-slate-900">Version History & Diff</h3>
              </div>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200">
                {snapshots.length} Checkpoints
              </span>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Immutable project snapshots, deterministic multi-trade diff comparisons, and verified safe rollback recovery.
            </p>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-[10px] text-slate-400 font-semibold block uppercase">Latest Release</span>
                <span className="font-bold text-slate-800 truncate block">
                  {latestSnapshot ? `${latestSnapshot.versionTag} (${latestSnapshot.label})` : 'Initial Baseline'}
                </span>
              </div>
              <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-[10px] text-slate-400 font-semibold block uppercase">Author</span>
                <span className="font-bold text-slate-800 truncate block">
                  {latestSnapshot ? latestSnapshot.author.name : 'Lead Architect'}
                </span>
              </div>
            </div>

            {onOpenVersionWorkspace && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={() => onOpenVersionWorkspace(project, 'timeline')}
                  className="py-2 px-3 bg-teal-50 hover:bg-teal-100 text-teal-900 border border-teal-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <History className="w-3.5 h-3.5 text-teal-700" />
                  <span>Timeline</span>
                </button>
                <button
                  onClick={() => onOpenVersionWorkspace(project, 'diff')}
                  className="py-2 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                >
                  <GitBranch className="w-3.5 h-3.5 text-teal-400" />
                  <span>Trade Diff →</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Room Program & Specifications (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Design Concepts & Material Finishes Card */}
          {project.designAlternatives && project.designAlternatives.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Palette className="w-4 h-4 text-teal-600" />
                  <h3 className="text-sm font-bold text-slate-900">
                    Facade & Interior Concepts
                  </h3>
                </div>
                {onOpenDesignStudio && (
                  <button
                    onClick={() => onOpenDesignStudio(project)}
                    className="text-xs font-semibold text-teal-700 hover:text-teal-900 cursor-pointer"
                  >
                    Open Studio →
                  </button>
                )}
              </div>

              {(() => {
                const activeAlt =
                  project.designAlternatives.find((a) => a.id === project.activeAlternativeId) ||
                  project.designAlternatives[0];
                return (
                  <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-slate-900">
                          {activeAlt.name}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-teal-100 text-teal-800 font-semibold text-[10px]">
                          Active Concept
                        </span>
                      </div>
                      <div className="text-xs text-slate-500">
                        Style: <strong className="text-slate-700">{activeAlt.facade.style}</strong> · Cladding: <strong className="text-slate-700 capitalize">{activeAlt.facade.primaryMaterial}</strong> + <strong className="text-slate-700 capitalize">{activeAlt.facade.accentMaterial}</strong>
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {project.designAlternatives.length} alternative proposals saved
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div
                        className="w-7 h-7 rounded-md border border-slate-300 shadow-2xs"
                        style={{ backgroundColor: activeAlt.facade.primaryColor }}
                        title="Primary"
                      />
                      <div
                        className="w-7 h-7 rounded-md border border-slate-300 shadow-2xs"
                        style={{ backgroundColor: activeAlt.facade.accentColor }}
                        title="Accent"
                      />
                      <div
                        className="w-7 h-7 rounded-md border border-slate-300 shadow-2xs"
                        style={{ backgroundColor: activeAlt.facade.windowTrimColor }}
                        title="Trim"
                      />
                      <div
                        className="w-7 h-7 rounded-md border border-slate-300 shadow-2xs"
                        style={{ backgroundColor: activeAlt.facade.roofTrimColor }}
                        title="Roof"
                      />
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-teal-600" />
                <h3 className="text-sm font-bold text-slate-900">Programmed Spaces</h3>
              </div>
              <span className="text-xs text-slate-500">
                {roomEntries.reduce((sum, r) => sum + (r.count || 0), 0) +
                  customRooms.reduce((sum, r) => sum + r.count, 0)}{' '}
                Total Areas
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
              {roomEntries.map((room, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-slate-50 rounded-lg border border-slate-200/80 flex items-center justify-between"
                >
                  <span className="text-xs text-slate-700 font-medium">{room.label}</span>
                  <span className="text-sm font-bold text-slate-900 tabular-nums px-2 py-0.5 bg-white rounded-md border border-slate-200/60 shadow-2xs">
                    {room.count}
                  </span>
                </div>
              ))}

              {customRooms.map((room, idx) => (
                <div
                  key={`custom-${idx}`}
                  className="p-3 bg-teal-50/60 rounded-lg border border-teal-200/80 flex items-center justify-between"
                >
                  <span className="text-xs text-teal-900 font-medium">{room.name}</span>
                  <span className="text-sm font-bold text-teal-950 tabular-nums px-2 py-0.5 bg-white rounded-md border border-teal-200 shadow-2xs">
                    {room.count}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Future-Impact Simulator & Optimizer Feature Card */}
          <div className="bg-gradient-to-br from-teal-900 to-slate-900 rounded-xl p-6 text-white shadow-md relative overflow-hidden">
            <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1.5 max-w-xl">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md bg-teal-400/20 text-teal-300 font-bold text-[10px] tracking-wider uppercase border border-teal-400/30">
                    Design Intelligence
                  </span>
                  <span className="text-xs text-slate-300">
                    {project.scenarios?.length || 2} Scenarios Available
                  </span>
                </div>
                <h3 className="text-base font-bold text-white tracking-tight">
                  Future-Impact Simulator & Multi-Criteria Optimizer
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Synthesize alternative building programs, calculate deterministic embodied carbon takeoffs, model vertical expansion trade-offs, and discover Pareto-optimal design alternatives without modifying your project baseline.
                </p>
              </div>

              {onOpenImpactSimulator && (
                <button
                  onClick={() => onOpenImpactSimulator(project)}
                  className="px-4 py-2.5 bg-teal-400 hover:bg-teal-300 text-slate-950 font-bold text-xs rounded-xl shadow-sm transition-all transform hover:-translate-y-0.5 cursor-pointer whitespace-nowrap flex items-center gap-2 self-start sm:self-center"
                >
                  <Scale className="w-4 h-4 text-slate-900" />
                  <span>Launch Simulator →</span>
                </button>
              )}
            </div>
          </div>

          {/* Cost Intelligence & Construction Planning Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1.5 max-w-xl">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md bg-teal-100 text-teal-800 font-bold text-[10px] tracking-wider uppercase border border-teal-200">
                    Cost Intelligence
                  </span>
                  <span className="text-xs text-slate-500 font-semibold">
                    Target Budget: {formatCurrency(project.budget, project.currency)}
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-900 tracking-tight">
                  Cost Intelligence & Preliminary Construction Planning
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Generate geometry-derived bills of quantities, itemize materials, labour, equipment, and transport, inspect Pareto cost drivers, track budget variance, and configure construction phase schedules with predecessor dependency checks.
                </p>
              </div>

              {onOpenCostPlanning && (
                <button
                  onClick={() => onOpenCostPlanning(project)}
                  className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 self-start sm:self-center"
                >
                  <DollarSign className="w-4 h-4 text-teal-400" />
                  <span>Open Cost Workspace →</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Prominent 2D Engine Notice & Professional Limits */}
      <MilestoneNotice onOpenEditor={() => onOpenFloorPlan(project)} />
    </div>
  );
};
