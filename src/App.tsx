/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Sidebar, ActiveTab } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { ProjectsView } from './components/ProjectsView';
import { ProjectFormView } from './components/ProjectFormView';
import { ProjectOverviewView } from './components/ProjectOverviewView';
import { SettingsView } from './components/SettingsView';
import { DeleteModal } from './components/DeleteModal';
import { FloorPlanEditor } from './components/floorplan/FloorPlanEditor';
import { Building3DViewer } from './components/viewer3d/Building3DViewer';
import { DesignStudioView } from './components/designstudio/DesignStudioView';
import { FutureImpactSimulator } from './components/impact/FutureImpactSimulator';
import { CostIntelligenceWorkspace } from './components/cost/CostIntelligenceWorkspace';
import { EvidenceLedgerWorkspace } from './components/evidence/EvidenceLedgerWorkspace';
import { DocumentationWorkspace } from './components/documentation/DocumentationWorkspace';
import { SiteContextWorkspace } from './components/site/SiteContextWorkspace';
import { BriefWorkspace } from './components/brief/BriefWorkspace';
import { RegulatoryWorkspace } from './components/regulations/RegulatoryWorkspace';
import { StructuralCoordinationWorkspace } from './components/structural/StructuralCoordinationWorkspace';
import { MEPCoordinationWorkspace } from './components/mep/MEPCoordinationWorkspace';
import { OpenBIMWorkspace } from './components/ifc/OpenBIMWorkspace';
import { CADExchangeWorkspace } from './components/cad/CADExchangeWorkspace';
import { TerrainModelingWorkspace } from './components/terrain/TerrainModelingWorkspace';
import { WholeLifeCarbonWorkspace } from './components/carbon/WholeLifeCarbonWorkspace';
import { ClimateResilienceWorkspace } from './components/climate/ClimateResilienceWorkspace';
import { EnvelopePerformanceWorkspace } from './components/envelope/EnvelopePerformanceWorkspace';
import { SiteLogisticsWorkspace } from './components/logistics/SiteLogisticsWorkspace';
import { ARSiteVisualizationWorkspace } from './components/ar/ARSiteVisualizationWorkspace';
import { VRDesignReviewWorkspace } from './components/vr/VRDesignReviewWorkspace';
import { LiveCollaborationWorkspace } from './components/collaboration/LiveCollaborationWorkspace';
import { DecisionTwinBadge } from './components/decisiontwin/DecisionTwinBadge';
import { DecisionTwinDrawer } from './components/decisiontwin/DecisionTwinDrawer';
import { ConstraintGraphBadge } from './components/constraints/ConstraintGraphBadge';
import { ConstraintGraphDrawer } from './components/constraints/ConstraintGraphDrawer';
import { VersionWorkspaceModal } from './components/versioning/VersionWorkspaceModal';
import { SystemHealthModal } from './components/security/SystemHealthModal';
import { VerificationCenterModal } from './components/verification/VerificationCenterModal';
import { ProfessionalReviewModal } from './components/review/ProfessionalReviewModal';
import { ControlledPilotModal } from './components/pilot/ControlledPilotModal';
import { OperationalReadinessModal } from './components/readiness/OperationalReadinessModal';
import { evaluateDecisionTwin } from './services/decisionTwinService';
import { evaluateConstraintGraph } from './services/constraintGraphService';
import { DecisionTwinState } from './types/decisionTwin';
import { ConstraintGraphState } from './types/constraintGraph';
import { Project, AppSettings, FloorPlanRoom } from './types/project';
import {
  loadSettings,
  saveSettings,
  loadProjectsAsync,
  createProjectAsync,
  updateProjectAsync,
  deleteProjectAsync,
  resetProjectsToSamplesAsync,
  clearAllProjectsAsync,
  importProjectsAsync,
  isCloudPersistenceEnabled,
  getCloudPersistenceStatus,
} from './services/storage';
import { CheckCircle2, AlertCircle, Info, ChevronRight, Network, FileText, Compass, Scale, Grid, Wrench, History, ShieldCheck, Award, UserCheck, FlaskConical, Rocket } from 'lucide-react';

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [settings, setSettings] = useState<AppSettings>(loadSettings());
  const [currentTab, setCurrentTab] = useState<ActiveTab>('dashboard');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isDecisionTwinOpen, setIsDecisionTwinOpen] = useState(false);
  const [isConstraintGraphOpen, setIsConstraintGraphOpen] = useState(false);
  const [isVersionWorkspaceOpen, setIsVersionWorkspaceOpen] = useState(false);
  const [isSystemHealthOpen, setIsSystemHealthOpen] = useState(false);
  const [isVerificationCenterOpen, setIsVerificationCenterOpen] = useState(false);
  const [isProfessionalReviewOpen, setIsProfessionalReviewOpen] = useState(false);
  const [isPilotModalOpen, setIsPilotModalOpen] = useState(false);
  const [isOperationalReadinessOpen, setIsOperationalReadinessOpen] = useState(false);
  const [versionWorkspaceTab, setVersionWorkspaceTab] = useState<'timeline' | 'diff' | 'recovery' | 'collaboration'>('timeline');
  const [selectedRoomFromGraph, setSelectedRoomFromGraph] = useState<string | null>(null);
  const [floorPlanDraft, setFloorPlanDraft] = useState<{
    rooms: FloorPlanRoom[];
    isModified: boolean;
  } | null>(null);

  // Toast notifications
  const [toast, setToast] = useState<{
    id: number;
    message: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ id: Date.now(), message, type });
  };

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      setToast(null);
    }, 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  // Refresh projects via active persistence adapter (localStorage or PostgreSQL cloud)
  const refreshProjects = useCallback(async () => {
    try {
      const loaded = await loadProjectsAsync();
      setProjects(loaded);
    } catch (err: any) {
      console.error('[Persistence] Error loading projects:', err);
      showToast(err.message || 'Failed to load projects.', 'error');
    }
  }, []);

  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  const selectedProject = projects.find((p) => p.id === selectedProjectId) || null;

  // Evaluate Architectural Decision Twin deterministically
  const twinState: DecisionTwinState | null = useMemo(() => {
    if (!selectedProject) return null;
    const isEditingThisProject = currentTab === 'floor-plan' && Boolean(floorPlanDraft?.isModified);
    return evaluateDecisionTwin(
      selectedProject,
      isEditingThisProject && floorPlanDraft ? floorPlanDraft.rooms : undefined,
      { isDraftModified: isEditingThisProject }
    );
  }, [selectedProject, currentTab, floorPlanDraft]);

  // Evaluate Plotify Living Constraint Graph deterministically
  const constraintGraphState: ConstraintGraphState | null = useMemo(() => {
    if (!selectedProject) return null;
    const isEditingThisProject = currentTab === 'floor-plan' && Boolean(floorPlanDraft?.isModified);
    return evaluateConstraintGraph(selectedProject, {
      draftRooms: isEditingThisProject && floorPlanDraft ? floorPlanDraft.rooms : undefined,
      isDraftPending: isEditingThisProject,
    });
  }, [selectedProject, currentTab, floorPlanDraft]);

  // Handlers
  const handleNavigate = (tab: ActiveTab) => {
    if (tab !== 'floor-plan') setFloorPlanDraft(null);
    setCurrentTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleViewProject = (project: Project) => {
    setFloorPlanDraft(null);
    setSelectedProjectId(project.id);
    setCurrentTab('overview');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleEditProject = (project: Project) => {
    setFloorPlanDraft(null);
    setSelectedProjectId(project.id);
    setCurrentTab('edit-project');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenFloorPlan = (project: Project) => {
    if (selectedProjectId !== project.id) setFloorPlanDraft(null);
    setSelectedProjectId(project.id);
    setCurrentTab('floor-plan');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpen3DViewer = (project: Project) => {
    setFloorPlanDraft(null);
    setSelectedProjectId(project.id);
    setCurrentTab('viewer-3d');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenDesignStudio = (project: Project) => {
    setFloorPlanDraft(null);
    setSelectedProjectId(project.id);
    setCurrentTab('design-studio');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenImpactSimulator = (project: Project) => {
    setFloorPlanDraft(null);
    setSelectedProjectId(project.id);
    setCurrentTab('impact-simulator');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenCostPlanning = (project: Project) => {
    setFloorPlanDraft(null);
    setSelectedProjectId(project.id);
    setCurrentTab('cost-planning');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenEvidenceLedger = (project: Project) => {
    setFloorPlanDraft(null);
    setSelectedProjectId(project.id);
    setCurrentTab('evidence-traceability');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenDocumentation = (project: Project) => {
    setFloorPlanDraft(null);
    setSelectedProjectId(project.id);
    setCurrentTab('documentation');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenSiteContext = (project: Project) => {
    setFloorPlanDraft(null);
    setSelectedProjectId(project.id);
    setCurrentTab('site-context');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenBrief = (project: Project) => {
    setFloorPlanDraft(null);
    setSelectedProjectId(project.id);
    setCurrentTab('brief');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenRegulations = (project: Project) => {
    setFloorPlanDraft(null);
    setSelectedProjectId(project.id);
    setCurrentTab('regulations');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenStructural = (project: Project) => {
    setFloorPlanDraft(null);
    setSelectedProjectId(project.id);
    setCurrentTab('structural');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenMEP = (project: Project) => {
    setFloorPlanDraft(null);
    setSelectedProjectId(project.id);
    setCurrentTab('mep-coordination');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenIFC = (project?: Project) => {
    setFloorPlanDraft(null);
    if (project) {
      setSelectedProjectId(project.id);
    }
    setCurrentTab('openbim-ifc');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenCAD = (project?: Project) => {
    setFloorPlanDraft(null);
    if (project) {
      setSelectedProjectId(project.id);
    }
    setCurrentTab('cad-exchange');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenTerrain = (project?: Project) => {
    setFloorPlanDraft(null);
    if (project) {
      setSelectedProjectId(project.id);
    }
    setCurrentTab('terrain-modeling');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenCarbon = (project?: Project) => {
    setFloorPlanDraft(null);
    if (project) {
      setSelectedProjectId(project.id);
    } else if (!selectedProjectId && projects.length > 0) {
      setSelectedProjectId(projects[0].id);
    }
    setCurrentTab('whole-life-carbon');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenClimateResilience = (project?: Project) => {
    setFloorPlanDraft(null);
    if (project) {
      setSelectedProjectId(project.id);
    } else if (!selectedProjectId && projects.length > 0) {
      setSelectedProjectId(projects[0].id);
    }
    setCurrentTab('climate-resilience');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenEnvelopePerformance = (project?: Project) => {
    setFloorPlanDraft(null);
    if (project) {
      setSelectedProjectId(project.id);
    } else if (!selectedProjectId && projects.length > 0) {
      setSelectedProjectId(projects[0].id);
    }
    setCurrentTab('envelope-performance');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenSiteLogistics = (project?: Project) => {
    setFloorPlanDraft(null);
    if (project) {
      setSelectedProjectId(project.id);
    } else if (!selectedProjectId && projects.length > 0) {
      setSelectedProjectId(projects[0].id);
    }
    setCurrentTab('site-logistics');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenARSite = (project?: Project) => {
    setFloorPlanDraft(null);
    if (project) {
      setSelectedProjectId(project.id);
    } else if (!selectedProjectId && projects.length > 0) {
      setSelectedProjectId(projects[0].id);
    }
    setCurrentTab('ar-site');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenVRReview = (project?: Project) => {
    setFloorPlanDraft(null);
    if (project) {
      setSelectedProjectId(project.id);
    } else if (!selectedProjectId && projects.length > 0) {
      setSelectedProjectId(projects[0].id);
    }
    setCurrentTab('vr-review');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenLiveCollaboration = (project?: Project) => {
    setFloorPlanDraft(null);
    if (project) {
      setSelectedProjectId(project.id);
    } else if (!selectedProjectId && projects.length > 0) {
      setSelectedProjectId(projects[0].id);
    }
    setCurrentTab('live-collaboration');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenVersionWorkspace = (
    project: Project,
    tab: 'timeline' | 'diff' | 'recovery' | 'collaboration' = 'timeline'
  ) => {
    setSelectedProjectId(project.id);
    setVersionWorkspaceTab(tab);
    setIsVersionWorkspaceOpen(true);
  };

  const handleRestoreProject = async (restoredProject: Project): Promise<boolean> => {
    try {
      const ok = await updateProjectAsync(restoredProject);
      if (!ok) {
        showToast('Failed to restore project.', 'error');
        return false;
      }
      await refreshProjects();
      setSelectedProjectId(restoredProject.id);
      setFloorPlanDraft(null);
      showToast(`Restored version of "${restoredProject.name}".`, 'success');
      return true;
    } catch (err: any) {
      showToast(err.message || 'Failed to restore project.', 'error');
      return false;
    }
  };

  const handleCreateNew = () => {
    setFloorPlanDraft(null);
    setSelectedProjectId(null);
    setCurrentTab('new-project');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSaveNewProject = async (
    data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>
  ) => {
    try {
      const created = await createProjectAsync(data);
      await refreshProjects();
      setSelectedProjectId(created.id);
      setCurrentTab('overview');
      const mode = isCloudPersistenceEnabled() ? 'to PostgreSQL cloud' : 'locally';
      showToast(`Project "${created.name}" created and saved ${mode}!`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to create project.', 'error');
    }
  };

  const handleSaveUpdatedProject = async (updated: Project) => {
    try {
      const ok = await updateProjectAsync(updated);
      if (ok) {
        await refreshProjects();
        setSelectedProjectId(updated.id);
        setCurrentTab('overview');
        showToast(`Changes to "${updated.name}" saved!`, 'success');
      } else {
        showToast('Failed to update project.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to update project.', 'error');
    }
  };

  const handleSaveFloorPlan = async (rooms: FloorPlanRoom[]) => {
    if (!selectedProject) return;

    const updatedProject: Project = {
      ...selectedProject,
      floorPlan: {
        rooms,
        gridSnap: 0.5,
        showGrid: true,
      },
    };

    try {
      const ok = await updateProjectAsync(updatedProject);
      if (ok) {
        setFloorPlanDraft(null);
        await refreshProjects();
        showToast(`2D Floor-Plan saved for "${selectedProject.name}"!`, 'success');
      } else {
        showToast('Failed to save 2D floor-plan.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to save 2D floor-plan.', 'error');
    }
  };

  const handleDraftChange = useCallback((rooms: FloorPlanRoom[], isModified: boolean) => {
    setFloorPlanDraft((prev) => {
      if (prev && prev.isModified === isModified && prev.rooms === rooms) {
        return prev;
      }
      return { rooms, isModified };
    });
  }, []);

  const handleDeleteTrigger = (project: Project) => {
    setProjectToDelete(project);
  };

  const handleConfirmDelete = async () => {
    if (!projectToDelete) return;
    const name = projectToDelete.name;
    try {
      await deleteProjectAsync(projectToDelete.id);
      await refreshProjects();
      setProjectToDelete(null);

      // If currently viewing or editing this project, navigate to projects list
      if (selectedProjectId === projectToDelete.id) {
        setSelectedProjectId(null);
        setCurrentTab('projects');
      }

      showToast(`Deleted project "${name}".`, 'info');
    } catch (err: any) {
      showToast(err.message || 'Failed to delete project.', 'error');
    }
  };

  const handleDuplicateProject = async (project: Project) => {
    const clonedData: Omit<Project, 'id' | 'createdAt' | 'updatedAt'> = {
      ...project,
      name: `${project.name} (Copy)`,
      status: 'Drafting',
    };
    try {
      const created = await createProjectAsync(clonedData);
      await refreshProjects();
      setSelectedProjectId(created.id);
      setCurrentTab('overview');
      showToast(`Created duplicate of "${project.name}".`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to duplicate project.', 'error');
    }
  };

  const isPersistenceActionInFlightRef = React.useRef(false);

  const handleRestoreSamples = async (): Promise<boolean> => {
    if (isPersistenceActionInFlightRef.current) return false;
    isPersistenceActionInFlightRef.current = true;
    try {
      const restored = await resetProjectsToSamplesAsync();
      setProjects(restored);
      setSelectedProjectId(null);
      setFloorPlanDraft(null);
      setCurrentTab('dashboard');
      showToast('Loaded architectural demo projects with 2D & 3D models.', 'success');
      return true;
    } catch (err: any) {
      showToast(err.message || 'Failed to restore sample projects.', 'error');
      return false;
    } finally {
      isPersistenceActionInFlightRef.current = false;
    }
  };

  const handleClearAllData = async (): Promise<boolean> => {
    if (isPersistenceActionInFlightRef.current) return false;
    isPersistenceActionInFlightRef.current = true;
    try {
      await clearAllProjectsAsync();
      setProjects([]);
      setSelectedProjectId(null);
      setFloorPlanDraft(null);
      setCurrentTab('dashboard');
      const modeLabel = isCloudPersistenceEnabled() ? 'cloud' : 'local';
      showToast(`All ${modeLabel} project data cleared.`, 'info');
      return true;
    } catch (err: any) {
      showToast(err.message || 'Failed to clear project data.', 'error');
      return false;
    } finally {
      isPersistenceActionInFlightRef.current = false;
    }
  };

  const handleImportProjects = async (imported: Project[]): Promise<boolean> => {
    if (isPersistenceActionInFlightRef.current) return false;
    isPersistenceActionInFlightRef.current = true;
    try {
      const saved = await importProjectsAsync(imported);
      setProjects(saved);
      setSelectedProjectId(null);
      setFloorPlanDraft(null);
      setCurrentTab('projects');
      showToast(`Imported ${saved.length} architectural projects!`, 'success');
      return true;
    } catch (err: any) {
      showToast(err.message || 'Failed to import projects.', 'error');
      return false;
    } finally {
      isPersistenceActionInFlightRef.current = false;
    }
  };

  const handleRecalculateDecisionTwin = useCallback(async (): Promise<boolean> => {
    if (isPersistenceActionInFlightRef.current) return false;
    isPersistenceActionInFlightRef.current = true;
    try {
      const loaded = await loadProjectsAsync();
      setProjects(loaded);
      showToast('Decision Twin dependencies recomputed.', 'info');
      return true;
    } catch (err: any) {
      console.error('[DecisionTwin] Error recomputing from persistence:', err);
      showToast(err.message || 'Failed to recompute Decision Twin from persistence.', 'error');
      return false;
    } finally {
      isPersistenceActionInFlightRef.current = false;
    }
  }, []);

  const handleReevaluateConstraintGraph = useCallback(async (): Promise<boolean> => {
    if (isPersistenceActionInFlightRef.current) return false;
    isPersistenceActionInFlightRef.current = true;
    try {
      const loaded = await loadProjectsAsync();
      setProjects(loaded);
      showToast('Living Constraint Graph re-evaluated from project state.', 'info');
      return true;
    } catch (err: any) {
      console.error('[ConstraintGraph] Error re-evaluating from persistence:', err);
      showToast(err.message || 'Failed to re-evaluate Constraint Graph from persistence.', 'error');
      return false;
    } finally {
      isPersistenceActionInFlightRef.current = false;
    }
  }, []);

  const handleUpdateSettings = (newSettings: AppSettings) => {
    saveSettings(newSettings);
    setSettings(newSettings);
    showToast('Application preferences updated.', 'success');
  };

  // Breadcrumb path computation
  const getBreadcrumbTitle = () => {
    switch (currentTab) {
      case 'dashboard':
        return 'Dashboard';
      case 'projects':
        return 'Projects';
      case 'new-project':
        return 'New Project Specification';
      case 'overview':
        return selectedProject ? selectedProject.name : 'Project Overview';
      case 'edit-project':
        return selectedProject ? `Edit: ${selectedProject.name}` : 'Edit Project';
      case 'floor-plan':
        return selectedProject ? `${selectedProject.name} · 2D Floor Plan` : '2D Floor Plan';
      case 'viewer-3d':
        return selectedProject ? `${selectedProject.name} · 3D Building Engine` : '3D Building Engine';
      case 'design-studio':
        return selectedProject ? `${selectedProject.name} · Facade & Interior Studio` : 'Design Studio';
      case 'impact-simulator':
        return selectedProject ? `${selectedProject.name} · Future-Impact Simulator & Optimizer` : 'Future-Impact Simulator';
      case 'cost-planning':
        return selectedProject ? `${selectedProject.name} · Cost Intelligence & Construction Planning` : 'Cost Intelligence';
      case 'evidence-traceability':
        return selectedProject ? `${selectedProject.name} · Proof-Carrying Evidence Ledger` : 'Evidence Ledger';
      case 'documentation':
        return selectedProject ? `${selectedProject.name} · Documentation & Project Handoff` : 'Documentation';
      case 'site-context':
        return selectedProject ? `${selectedProject.name} · Site & Context Intelligence` : 'Site & Context';
      case 'brief':
        return selectedProject ? `${selectedProject.name} · Architectural Brief & Space Programming` : 'Architectural Brief';
      case 'regulations':
        return selectedProject ? `${selectedProject.name} · Building Regulations Intelligence` : 'Building Regulations';
      case 'structural':
        return selectedProject ? `${selectedProject.name} · Structural Coordination` : 'Structural Coordination';
      case 'mep-coordination':
        return selectedProject ? `${selectedProject.name} · MEP Coordination & Clashes` : 'MEP Coordination';
      case 'openbim-ifc':
        return selectedProject ? `${selectedProject.name} · OpenBIM & IFC Interoperability` : 'OpenBIM & IFC Interoperability';
      case 'cad-exchange':
        return selectedProject ? `${selectedProject.name} · CAD Drawing Exchange (DXF)` : 'CAD Drawing Exchange (DXF)';
      case 'terrain-modeling':
        return selectedProject ? `${selectedProject.name} · Terrain & Topographic Site Modeling` : 'Terrain & Topographic Site Modeling';
      case 'whole-life-carbon':
        return selectedProject ? `${selectedProject.name} · Embodied & Whole-Life Carbon Assessment` : 'Embodied & Whole-Life Carbon Assessment';
      case 'climate-resilience':
        return selectedProject ? `${selectedProject.name} · Climate Hazard & Resilience Analyzer` : 'Climate Hazard & Resilience Analyzer';
      case 'envelope-performance':
        return selectedProject ? `${selectedProject.name} · Building Envelope Performance Analyzer` : 'Building Envelope Performance Analyzer';
      case 'site-logistics':
        return selectedProject ? `${selectedProject.name} · Construction Site Logistics Planner` : 'Construction Site Logistics Planner';
      case 'ar-site':
        return selectedProject ? `${selectedProject.name} · Augmented Reality Site Visualization` : 'Augmented Reality Site Visualization';
      case 'settings':
        return 'Settings & Storage';
      default:
        return 'Dashboard';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row antialiased">
      {/* Toast Notification */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 bg-slate-900 text-white rounded-xl shadow-lg border border-slate-700 text-xs font-medium animate-in fade-in slide-in-from-bottom-2 duration-200"
        >
          {toast.type === 'success' && (
            <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
          )}
          {toast.type === 'error' && (
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          )}
          {toast.type === 'info' && (
            <Info className="w-4 h-4 text-cyan-400 shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <DeleteModal
        isOpen={Boolean(projectToDelete)}
        project={projectToDelete}
        onConfirm={handleConfirmDelete}
        onCancel={() => setProjectToDelete(null)}
      />

      {/* Navigation Sidebar */}
      <Sidebar
        currentTab={currentTab}
        onNavigate={handleNavigate}
        projectCount={projects.length}
        isMobileOpen={isMobileNavOpen}
        setIsMobileOpen={setIsMobileNavOpen}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header / Breadcrumbs Bar */}
        <header className="hidden md:flex items-center justify-between px-8 py-3.5 bg-white border-b border-slate-200 sticky top-0 z-20">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <button
              onClick={() => handleNavigate('dashboard')}
              className="flex items-center gap-2 hover:text-slate-900 transition-colors cursor-pointer group"
            >
              <span className="font-bold text-slate-900 text-sm">Plotify</span>
              <span className="text-[10px] text-teal-700 font-semibold uppercase tracking-wider hidden lg:inline">
                AI-Powered Architectural Intelligence
              </span>
            </button>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-semibold text-slate-800 truncate max-w-md">
              {getBreadcrumbTitle()}
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs">
            {selectedProject && constraintGraphState && (
              <ConstraintGraphBadge
                state={constraintGraphState}
                onClick={() => setIsConstraintGraphOpen(true)}
              />
            )}

            {selectedProject && twinState && (
              <DecisionTwinBadge
                state={twinState}
                onClick={() => setIsDecisionTwinOpen(true)}
              />
            )}

            {selectedProject && (
              <button
                onClick={() => handleOpenVersionWorkspace(selectedProject, 'timeline')}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold border border-slate-200 transition-colors cursor-pointer"
                title="Open Project Version History, Trade Diff & Safe Recovery"
              >
                <History className="w-3.5 h-3.5 text-teal-700" />
                <span className="hidden lg:inline">Revisions & Diff</span>
                <span className="lg:hidden">Revs</span>
              </button>
            )}

            {selectedProject && (
              <button
                onClick={() => setIsVerificationCenterOpen(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 rounded-lg text-xs font-semibold border border-amber-200 transition-colors cursor-pointer"
                title="System-Wide Verification & Release Controls"
              >
                <Award className="w-3.5 h-3.5 text-amber-700" />
                <span className="hidden lg:inline">Verify & Release</span>
                <span className="lg:hidden">Verify</span>
              </button>
            )}

            {selectedProject && (
              <button
                onClick={() => setIsProfessionalReviewOpen(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-900 rounded-lg text-xs font-semibold border border-teal-200 transition-colors cursor-pointer"
                title="Professional Review Register & Expert Validation"
              >
                <UserCheck className="w-3.5 h-3.5 text-teal-700" />
                <span className="hidden lg:inline">Expert Review</span>
                <span className="lg:hidden">Review</span>
              </button>
            )}

            <button
              onClick={() => setIsSystemHealthOpen(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg text-xs font-semibold border border-emerald-200 transition-colors cursor-pointer"
              title="System Health, Storage Quota & Disaster Recovery"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
              <span className="hidden lg:inline">System & Security</span>
              <span className="lg:hidden">Security</span>
            </button>

            <button
              onClick={() => setIsPilotModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 rounded-lg text-xs font-semibold border border-indigo-200 transition-colors cursor-pointer"
              title="Open Controlled Pilot & Real-World Feedback System"
            >
              <FlaskConical className="w-3.5 h-3.5 text-indigo-700" />
              <span className="hidden lg:inline">Pilot System</span>
              <span className="lg:hidden">Pilot</span>
            </button>

            <button
              onClick={() => setIsOperationalReadinessOpen(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-900 rounded-lg text-xs font-semibold border border-sky-200 transition-colors cursor-pointer"
              title="Release Preparation & Operational Readiness Center"
            >
              <Rocket className="w-3.5 h-3.5 text-sky-700" />
              <span className="hidden lg:inline">Operational Readiness</span>
              <span className="lg:hidden">Readiness</span>
            </button>

            <div className="text-slate-500 tabular-nums hidden sm:flex items-center">
              <span className="text-slate-400">Unit:</span>{' '}
              <span className="capitalize font-medium text-slate-700 ml-1">
                {settings.defaultUnit}
              </span>
              <span className="mx-2 text-slate-300">·</span>
              <span className="text-slate-400">Role:</span>{' '}
              <span className="capitalize font-medium text-slate-700 ml-1">
                {settings.role}
              </span>
            </div>

            {currentTab !== 'new-project' && (
              <button
                onClick={handleCreateNew}
                className="px-3 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-800 rounded-lg font-semibold transition-colors border border-teal-200 cursor-pointer"
              >
                + New Project
              </button>
            )}
          </div>
        </header>

        {/* Mobile Status Bar */}
        {selectedProject && (
          <div className="md:hidden px-4 py-2 bg-white border-b border-slate-200 flex items-center justify-between gap-2 overflow-x-auto">
            <span className="text-xs font-semibold text-slate-700 truncate max-w-[130px]">
              {selectedProject.name}
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => handleOpenVersionWorkspace(selectedProject, 'timeline')}
                className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-md text-[11px] font-semibold border border-slate-200 transition-colors cursor-pointer"
                title="Open Revisions"
              >
                <History className="w-3 h-3 text-teal-700" />
                <span>Revs</span>
              </button>
              {constraintGraphState && (
                <ConstraintGraphBadge
                  state={constraintGraphState}
                  onClick={() => setIsConstraintGraphOpen(true)}
                  compact
                />
              )}
              {twinState && (
                <DecisionTwinBadge
                  state={twinState}
                  onClick={() => setIsDecisionTwinOpen(true)}
                  compact
                />
              )}
            </div>
          </div>
        )}

        {/* Viewport content */}
        <main className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto">
          {currentTab === 'dashboard' && (
            <DashboardView
              projects={projects}
              onCreateNew={handleCreateNew}
              onViewProject={handleViewProject}
              onEditProject={handleEditProject}
              onDeleteProject={handleDeleteTrigger}
              onRestoreSamples={handleRestoreSamples}
              onOpenFloorPlan={handleOpenFloorPlan}
              onOpen3DViewer={handleOpen3DViewer}
              onOpenDesignStudio={handleOpenDesignStudio}
              onOpenImpactSimulator={handleOpenImpactSimulator}
              onOpenCostPlanning={handleOpenCostPlanning}
              onOpenDocumentation={handleOpenDocumentation}
            />
          )}

          {currentTab === 'projects' && (
            <ProjectsView
              projects={projects}
              onCreateNew={handleCreateNew}
              onViewProject={handleViewProject}
              onEditProject={handleEditProject}
              onDeleteProject={handleDeleteTrigger}
              onOpenFloorPlan={handleOpenFloorPlan}
              onOpen3DViewer={handleOpen3DViewer}
              onOpenDesignStudio={handleOpenDesignStudio}
              onOpenImpactSimulator={handleOpenImpactSimulator}
              onOpenCostPlanning={handleOpenCostPlanning}
              onOpenDocumentation={handleOpenDocumentation}
              onOpenIFC={() => handleOpenIFC()}
              onOpenCAD={() => handleOpenCAD()}
              onOpenTerrain={() => handleOpenTerrain()}
              onOpenCarbon={() => handleOpenCarbon()}
              onOpenClimateResilience={() => handleOpenClimateResilience()}
              onOpenEnvelopePerformance={() => handleOpenEnvelopePerformance()}
              onOpenSiteLogistics={() => handleOpenSiteLogistics()}
              onOpenARSite={() => handleOpenARSite()}
              onOpenVRReview={() => handleOpenVRReview()}
              onOpenLiveCollaboration={() => handleOpenLiveCollaboration()}
            />
          )}

          {currentTab === 'new-project' && (
            <ProjectFormView
              onSave={handleSaveNewProject}
              onUpdate={handleSaveUpdatedProject}
              onCancel={() => handleNavigate(projects.length > 0 ? 'dashboard' : 'projects')}
              defaultUnit={settings.defaultUnit}
              defaultCurrency={settings.defaultCurrency}
            />
          )}

          {currentTab === 'edit-project' && selectedProject && (
            <ProjectFormView
              initialProject={selectedProject}
              onSave={handleSaveNewProject}
              onUpdate={handleSaveUpdatedProject}
              onCancel={() => handleNavigate('overview')}
              defaultUnit={settings.defaultUnit}
              defaultCurrency={settings.defaultCurrency}
            />
          )}

          {currentTab === 'overview' && selectedProject && (
            <ProjectOverviewView
              project={selectedProject}
              onBack={() => handleNavigate('projects')}
              onEdit={handleEditProject}
              onDelete={handleDeleteTrigger}
              onDuplicate={handleDuplicateProject}
              onOpenFloorPlan={handleOpenFloorPlan}
              onOpen3DViewer={handleOpen3DViewer}
              onOpenDesignStudio={handleOpenDesignStudio}
              onOpenImpactSimulator={handleOpenImpactSimulator}
              onOpenCostPlanning={handleOpenCostPlanning}
              onOpenEvidenceLedger={handleOpenEvidenceLedger}
              onOpenDocumentation={handleOpenDocumentation}
              onOpenSiteContext={handleOpenSiteContext}
              onOpenBrief={handleOpenBrief}
              onOpenRegulations={handleOpenRegulations}
              onOpenStructural={handleOpenStructural}
              onOpenMEP={handleOpenMEP}
              onOpenIFC={handleOpenIFC}
              onOpenCAD={handleOpenCAD}
              onOpenTerrain={handleOpenTerrain}
              onOpenCarbon={handleOpenCarbon}
              onOpenClimateResilience={handleOpenClimateResilience}
              onOpenEnvelopePerformance={handleOpenEnvelopePerformance}
              onOpenSiteLogistics={handleOpenSiteLogistics}
              onOpenARSite={handleOpenARSite}
              onOpenVRReview={handleOpenVRReview}
              onOpenLiveCollaboration={handleOpenLiveCollaboration}
              onOpenDecisionTwin={() => setIsDecisionTwinOpen(true)}
              onOpenConstraintGraph={() => setIsConstraintGraphOpen(true)}
              onOpenVersionWorkspace={handleOpenVersionWorkspace}
              onOpenSystemHealth={() => setIsSystemHealthOpen(true)}
              onOpenVerificationCenter={() => setIsVerificationCenterOpen(true)}
              onOpenProfessionalReview={() => setIsProfessionalReviewOpen(true)}
              onOpenPilotSystem={() => setIsPilotModalOpen(true)}
              onOpenOperationalReadiness={() => setIsOperationalReadinessOpen(true)}
            />
          )}

          {currentTab === 'floor-plan' && selectedProject && (
            <FloorPlanEditor
              project={selectedProject}
              onSaveProjectFloorPlan={handleSaveFloorPlan}
              onBack={() => handleNavigate('overview')}
              onOpen3D={() => handleOpen3DViewer(selectedProject)}
              onOpenDesignStudio={() => handleOpenDesignStudio(selectedProject)}
              onOpenDecisionTwin={() => setIsDecisionTwinOpen(true)}
              onOpenConstraintGraph={() => setIsConstraintGraphOpen(true)}
              onDraftChange={handleDraftChange}
              initialSelectedRoomId={selectedRoomFromGraph}
            />
          )}

          {currentTab === 'viewer-3d' && selectedProject && (
            <Building3DViewer
              project={selectedProject}
              onBack={() => handleNavigate('overview')}
              onOpen2DEditor={handleOpenFloorPlan}
              onOpenDesignStudio={handleOpenDesignStudio}
              onOpenDecisionTwin={() => setIsDecisionTwinOpen(true)}
            />
          )}

          {currentTab === 'design-studio' && selectedProject && (
            <DesignStudioView
              project={selectedProject}
              onSaveProject={handleSaveUpdatedProject}
              onBack={() => handleNavigate('overview')}
              onOpen3DViewer={handleOpen3DViewer}
              onOpenFloorPlan={handleOpenFloorPlan}
              onOpenDecisionTwin={() => setIsDecisionTwinOpen(true)}
              onShowToast={showToast}
            />
          )}

          {currentTab === 'impact-simulator' && selectedProject && (
            <FutureImpactSimulator
              project={selectedProject}
              onSaveProject={handleSaveUpdatedProject}
              onBack={() => handleNavigate('overview')}
              onOpenFloorPlan={handleOpenFloorPlan}
              onOpen3DViewer={handleOpen3DViewer}
              onOpenDesignStudio={handleOpenDesignStudio}
              onOpenDecisionTwin={() => setIsDecisionTwinOpen(true)}
              onOpenConstraintGraph={() => setIsConstraintGraphOpen(true)}
              onShowToast={showToast}
            />
          )}

          {currentTab === 'cost-planning' && selectedProject && (
            <CostIntelligenceWorkspace
              project={selectedProject}
              onSaveProject={handleSaveUpdatedProject}
              onBack={() => handleNavigate('overview')}
              onOpenFloorPlan={handleOpenFloorPlan}
              onOpen3DViewer={handleOpen3DViewer}
              onOpenDesignStudio={handleOpenDesignStudio}
              onOpenDecisionTwin={() => setIsDecisionTwinOpen(true)}
              onOpenConstraintGraph={() => setIsConstraintGraphOpen(true)}
              onOpenEvidenceLedger={handleOpenEvidenceLedger}
              onShowToast={showToast}
            />
          )}

          {currentTab === 'evidence-traceability' && selectedProject && (
            <EvidenceLedgerWorkspace
              project={selectedProject}
              onBack={() => handleNavigate('overview')}
              onOpenFloorPlan={handleOpenFloorPlan}
              onOpen3DViewer={handleOpen3DViewer}
              onOpenDesignStudio={handleOpenDesignStudio}
              onOpenDecisionTwin={() => setIsDecisionTwinOpen(true)}
              onOpenConstraintGraph={() => setIsConstraintGraphOpen(true)}
              onOpenCostPlanning={handleOpenCostPlanning}
              onOpenImpactSimulator={handleOpenImpactSimulator}
              onSaveProject={handleSaveUpdatedProject}
              onShowToast={showToast}
            />
          )}

          {currentTab === 'documentation' && selectedProject && (
            <DocumentationWorkspace
              project={selectedProject}
              onBack={() => handleNavigate('overview')}
              onOpenFloorPlan={handleOpenFloorPlan}
              onOpenCostPlanning={handleOpenCostPlanning}
              onOpenDesignStudio={handleOpenDesignStudio}
              onOpenEvidenceLedger={handleOpenEvidenceLedger}
              onSaveProject={handleSaveUpdatedProject}
              onShowToast={showToast}
            />
          )}

          {currentTab === 'documentation' && !selectedProject && (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-4 max-w-lg mx-auto mt-12 shadow-xs">
              <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-500 mx-auto flex items-center justify-center">
                <FileText className="w-6 h-6 text-slate-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">No Project Selected</h3>
                <p className="text-xs text-slate-500 mt-1">Please select an architectural project to view and export its documentation packages.</p>
              </div>
              <button
                onClick={() => handleNavigate('projects')}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors"
              >
                Go to Projects
              </button>
            </div>
          )}

          {currentTab === 'site-context' && selectedProject && (
            <SiteContextWorkspace
              project={selectedProject}
              onBack={() => handleNavigate('overview')}
              onOpenFloorPlan={handleOpenFloorPlan}
              onOpenEvidenceLedger={handleOpenEvidenceLedger}
              onOpenDocumentation={handleOpenDocumentation}
              onSaveProject={handleSaveUpdatedProject}
              onShowToast={showToast}
            />
          )}

          {currentTab === 'site-context' && !selectedProject && (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-4 max-w-lg mx-auto mt-12 shadow-xs">
              <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-500 mx-auto flex items-center justify-center">
                <Compass className="w-6 h-6 text-slate-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">No Project Selected</h3>
                <p className="text-xs text-slate-500 mt-1">Please select an architectural project to view and evaluate its site and context intelligence.</p>
              </div>
              <button
                onClick={() => handleNavigate('projects')}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors"
              >
                Go to Projects
              </button>
            </div>
          )}

          {currentTab === 'brief' && selectedProject && (
            <BriefWorkspace
              project={selectedProject}
              onUpdateProject={handleSaveUpdatedProject}
              onBack={() => handleNavigate('overview')}
              onOpenFloorPlan={handleOpenFloorPlan}
              onOpenEvidenceLedger={handleOpenEvidenceLedger}
              onOpenDocumentation={handleOpenDocumentation}
              showToast={showToast}
            />
          )}

          {currentTab === 'brief' && !selectedProject && (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-4 max-w-lg mx-auto mt-12 shadow-xs">
              <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-500 mx-auto flex items-center justify-center">
                <FileText className="w-6 h-6 text-slate-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">No Project Selected</h3>
                <p className="text-xs text-slate-500 mt-1">Please select an architectural project to view and program its architectural brief.</p>
              </div>
              <button
                onClick={() => handleNavigate('projects')}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors"
              >
                Go to Projects
              </button>
            </div>
          )}

          {currentTab === 'regulations' && selectedProject && (
            <RegulatoryWorkspace
              project={selectedProject}
              onUpdateProject={handleSaveUpdatedProject}
              onBack={() => handleNavigate('overview')}
              onOpenFloorPlan={() => handleOpenFloorPlan(selectedProject)}
            />
          )}

          {currentTab === 'regulations' && !selectedProject && (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-4 max-w-lg mx-auto mt-12 shadow-xs">
              <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-500 mx-auto flex items-center justify-center">
                <Scale className="w-6 h-6 text-slate-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">No Project Selected</h3>
                <p className="text-xs text-slate-500 mt-1">Please select an architectural project to view and assess building regulations and statutory code intelligence.</p>
              </div>
              <button
                onClick={() => handleNavigate('projects')}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors"
              >
                Go to Projects
              </button>
            </div>
          )}

          {currentTab === 'structural' && selectedProject && (
            <StructuralCoordinationWorkspace
              project={selectedProject}
              onUpdateProject={handleSaveUpdatedProject}
              onBack={() => handleNavigate('overview')}
              onOpenFloorPlan={handleOpenFloorPlan}
              onOpenEvidenceLedger={handleOpenEvidenceLedger}
              onOpenDocumentation={handleOpenDocumentation}
              showToast={showToast}
            />
          )}

          {currentTab === 'structural' && !selectedProject && (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-4 max-w-lg mx-auto mt-12 shadow-xs">
              <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-500 mx-auto flex items-center justify-center">
                <Grid className="w-6 h-6 text-slate-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">No Project Selected</h3>
                <p className="text-xs text-slate-500 mt-1">Please select an architectural project to coordinate structural grids, columns, and engineering reviews.</p>
              </div>
              <button
                onClick={() => handleNavigate('projects')}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors"
              >
                Go to Projects
              </button>
            </div>
          )}

          {currentTab === 'mep-coordination' && selectedProject && (
            <MEPCoordinationWorkspace
              project={selectedProject}
              onUpdateProject={handleSaveUpdatedProject}
              onBack={() => handleNavigate('overview')}
              onOpenFloorPlan={handleOpenFloorPlan}
              onOpenStructural={handleOpenStructural}
              onOpenDocumentation={handleOpenDocumentation}
              showToast={showToast}
            />
          )}

          {currentTab === 'mep-coordination' && !selectedProject && (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-4 max-w-lg mx-auto mt-12 shadow-xs">
              <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-500 mx-auto flex items-center justify-center">
                <Wrench className="w-6 h-6 text-slate-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">No Project Selected</h3>
                <p className="text-xs text-slate-500 mt-1">Please select an architectural project to coordinate mechanical, electrical, and plumbing routes & clashes.</p>
              </div>
              <button
                onClick={() => handleNavigate('projects')}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors"
              >
                Go to Projects
              </button>
            </div>
          )}

          {currentTab === 'openbim-ifc' && (
            <OpenBIMWorkspace
              project={selectedProject}
              defaultUnit={settings.defaultUnit}
              defaultCurrency={settings.defaultCurrency}
              onBack={() => handleNavigate(selectedProject ? 'overview' : 'projects')}
              onCreateImportedProject={handleSaveNewProject}
              onUpdateProject={handleSaveUpdatedProject}
              onOpenFloorPlan={handleOpenFloorPlan}
              onOpen3DViewer={handleOpen3DViewer}
              onOpenStructural={handleOpenStructural}
              onShowToast={showToast}
            />
          )}

          {currentTab === 'cad-exchange' && (
            <CADExchangeWorkspace
              project={selectedProject}
              defaultUnit={settings.defaultUnit}
              defaultCurrency={settings.defaultCurrency}
              onBack={() => handleNavigate(selectedProject ? 'overview' : 'projects')}
              onCreateImportedProject={handleSaveNewProject}
              onUpdateProject={handleSaveUpdatedProject}
              onOpenFloorPlan={handleOpenFloorPlan}
              onOpen3DViewer={handleOpen3DViewer}
              onOpenStructural={handleOpenStructural}
              onOpenIFC={handleOpenIFC}
              onShowToast={showToast}
            />
          )}

          {currentTab === 'terrain-modeling' && (
            <TerrainModelingWorkspace
              project={selectedProject}
              defaultUnit={settings.defaultUnit}
              onBack={() => handleNavigate(selectedProject ? 'overview' : 'projects')}
              onUpdateProject={handleSaveUpdatedProject}
              onOpenFloorPlan={handleOpenFloorPlan}
              onOpen3DViewer={handleOpen3DViewer}
              onOpenSiteContext={handleOpenSiteContext}
              onOpenIFC={handleOpenIFC}
              onOpenCAD={handleOpenCAD}
              onShowToast={showToast}
            />
          )}

          {currentTab === 'whole-life-carbon' && (selectedProject || projects[0]) && (
            <WholeLifeCarbonWorkspace
              project={selectedProject || projects[0]}
              onUpdateProject={handleSaveUpdatedProject}
              onBack={() => handleNavigate(selectedProject ? 'overview' : 'projects')}
            />
          )}

          {currentTab === 'climate-resilience' && (selectedProject || projects[0]) && (
            <ClimateResilienceWorkspace
              project={selectedProject || projects[0]}
              onUpdateProject={handleSaveUpdatedProject}
              onBack={() => handleNavigate(selectedProject ? 'overview' : 'projects')}
              onOpenSiteContext={handleOpenSiteContext}
              onOpenTerrain={handleOpenTerrain}
              onOpenCarbon={handleOpenCarbon}
              onOpenVersionWorkspace={handleOpenVersionWorkspace}
              onShowToast={showToast}
            />
          )}

          {currentTab === 'envelope-performance' && (selectedProject || projects[0]) && (
            <EnvelopePerformanceWorkspace
              project={selectedProject || projects[0]}
              onUpdateProject={handleSaveUpdatedProject}
              onBack={() => handleNavigate(selectedProject ? 'overview' : 'projects')}
              onOpenSiteContext={handleOpenSiteContext}
              onOpenCarbon={handleOpenCarbon}
              onOpenClimateResilience={handleOpenClimateResilience}
              onOpenIFC={handleOpenIFC}
              onOpenVersionWorkspace={handleOpenVersionWorkspace}
              onShowToast={showToast}
            />
          )}

          {currentTab === 'site-logistics' && (selectedProject || projects[0]) && (
            <SiteLogisticsWorkspace
              project={selectedProject || projects[0]}
              onUpdateProject={handleSaveUpdatedProject}
              onBack={() => handleNavigate(selectedProject ? 'overview' : 'projects')}
              onOpenSiteContext={handleOpenSiteContext}
              onOpenTerrain={handleOpenTerrain}
              onOpenCarbon={handleOpenCarbon}
              onOpenClimateResilience={handleOpenClimateResilience}
              onOpenEnvelopePerformance={handleOpenEnvelopePerformance}
              onOpenIFC={handleOpenIFC}
              onOpenCAD={handleOpenCAD}
              onOpenVersionWorkspace={handleOpenVersionWorkspace}
              onShowToast={showToast}
            />
          )}

          {currentTab === 'ar-site' && (selectedProject || projects[0]) && (
            <ARSiteVisualizationWorkspace
              project={selectedProject || projects[0]}
              onUpdateProject={handleSaveUpdatedProject}
              onBack={() => handleNavigate(selectedProject ? 'overview' : 'projects')}
              onOpenFloorPlan={handleOpenFloorPlan}
              onOpen3DViewer={handleOpen3DViewer}
              onOpenTerrain={handleOpenTerrain}
              onOpenEnvelopePerformance={handleOpenEnvelopePerformance}
              onOpenSiteLogistics={handleOpenSiteLogistics}
              onOpenIFC={handleOpenIFC}
              onOpenCAD={handleOpenCAD}
              onOpenVersionWorkspace={handleOpenVersionWorkspace}
              onShowToast={showToast}
            />
          )}

          {currentTab === 'vr-review' && (
            <VRDesignReviewWorkspace
              project={selectedProject || projects[0] || null}
              projects={projects}
              onSelectProject={(proj) => setSelectedProjectId(proj.id)}
              onUpdateProject={handleSaveUpdatedProject}
              onBack={() => handleNavigate(selectedProject ? 'overview' : 'projects')}
              onOpenFloorPlan={handleOpenFloorPlan}
              onOpen3DViewer={handleOpen3DViewer}
              onOpenIFC={handleOpenIFC}
              onOpenCAD={handleOpenCAD}
              onOpenTerrain={handleOpenTerrain}
              onOpenCarbon={handleOpenCarbon}
              onOpenClimateResilience={handleOpenClimateResilience}
              onOpenEnvelopePerformance={handleOpenEnvelopePerformance}
              onOpenSiteLogistics={handleOpenSiteLogistics}
              onOpenARSite={handleOpenARSite}
              onOpenLiveCollaboration={handleOpenLiveCollaboration}
              onOpenVersionWorkspace={handleOpenVersionWorkspace}
              onShowToast={showToast}
            />
          )}

          {currentTab === 'live-collaboration' && (selectedProject || projects[0]) && (
            <LiveCollaborationWorkspace
              project={selectedProject || projects[0]}
              projects={projects}
              onSelectProject={(projectId) => setSelectedProjectId(projectId)}
              onUpdateProject={handleSaveUpdatedProject}
              onBackToOverview={() => handleNavigate(selectedProject ? 'overview' : 'projects')}
              onOpenVRReview={() => handleOpenVRReview(selectedProject || projects[0])}
            />
          )}

          {currentTab === 'settings' && (
            <SettingsView
              settings={settings}
              projects={projects}
              onUpdateSettings={handleUpdateSettings}
              onRestoreSamples={handleRestoreSamples}
              onClearAllData={handleClearAllData}
              onImportProjects={handleImportProjects}
              onOpenSystemHealth={() => setIsSystemHealthOpen(true)}
            />
          )}
        </main>
      </div>

      {/* Architectural Decision Twin Drawer */}
      {selectedProject && twinState && (
        <DecisionTwinDrawer
          isOpen={isDecisionTwinOpen}
          onClose={() => setIsDecisionTwinOpen(false)}
          twinState={twinState}
          onRecalculate={handleRecalculateDecisionTwin}
          onNavigateTo2D={() => {
            setIsDecisionTwinOpen(false);
            handleOpenFloorPlan(selectedProject);
          }}
          onNavigateTo3D={() => {
            setIsDecisionTwinOpen(false);
            handleOpen3DViewer(selectedProject);
          }}
          onNavigateToDesign={() => {
            setIsDecisionTwinOpen(false);
            handleOpenDesignStudio(selectedProject);
          }}
          onOpenConstraintGraph={() => {
            setIsDecisionTwinOpen(false);
            setIsConstraintGraphOpen(true);
          }}
        />
      )}

      {/* Living Constraint Graph Drawer */}
      {selectedProject && constraintGraphState && (
        <ConstraintGraphDrawer
          isOpen={isConstraintGraphOpen}
          onClose={() => setIsConstraintGraphOpen(false)}
          graphState={constraintGraphState}
          project={selectedProject}
          onNavigateFloorPlan={() => {
            setIsConstraintGraphOpen(false);
            handleOpenFloorPlan(selectedProject);
          }}
          onNavigateEditProject={() => {
            setIsConstraintGraphOpen(false);
            handleEditProject(selectedProject);
          }}
          onNavigate3DViewer={() => {
            setIsConstraintGraphOpen(false);
            handleOpen3DViewer(selectedProject);
          }}
          onOpenDecisionTwin={() => {
            setIsConstraintGraphOpen(false);
            setIsDecisionTwinOpen(true);
          }}
          onSelectRoom={(roomId) => {
            setSelectedRoomFromGraph(roomId);
            setIsConstraintGraphOpen(false);
            handleOpenFloorPlan(selectedProject);
          }}
          onReevaluate={handleReevaluateConstraintGraph}
        />
      )}

      {/* Project Version History, Trade Diff & Safe Recovery Workspace */}
      {selectedProject && (
        <VersionWorkspaceModal
          project={selectedProject}
          isOpen={isVersionWorkspaceOpen}
          initialTab={versionWorkspaceTab}
          onClose={() => setIsVersionWorkspaceOpen(false)}
          onRestoreProject={handleRestoreProject}
          onShowToast={showToast}
        />
      )}

      {/* Production Infrastructure, Security & Disaster Recovery Modal */}
      <SystemHealthModal
        isOpen={isSystemHealthOpen}
        onClose={() => setIsSystemHealthOpen(false)}
        projects={projects}
        activeProject={selectedProject}
        onProjectsUpdated={refreshProjects}
        showToast={showToast}
      />

      {/* Verification & Release Control Center */}
      {selectedProject && (
        <VerificationCenterModal
          project={selectedProject}
          isOpen={isVerificationCenterOpen}
          onClose={() => setIsVerificationCenterOpen(false)}
          onShowToast={showToast}
          onNavigateToFloorPlan={() => {
            setIsVerificationCenterOpen(false);
            handleOpenFloorPlan(selectedProject);
          }}
          onNavigateToStructural={() => {
            setIsVerificationCenterOpen(false);
            handleOpenStructural(selectedProject);
          }}
          onNavigateToMEP={() => {
            setIsVerificationCenterOpen(false);
            handleOpenMEP(selectedProject);
          }}
        />
      )}

      {/* Professional Review Register & Expert Validation Workspace */}
      {selectedProject && (
        <ProfessionalReviewModal
          project={selectedProject}
          isOpen={isProfessionalReviewOpen}
          onClose={() => setIsProfessionalReviewOpen(false)}
          onUpdateProject={handleSaveUpdatedProject}
          onShowToast={showToast}
          onOpenFloorPlan={() => {
            setIsProfessionalReviewOpen(false);
            handleOpenFloorPlan(selectedProject);
          }}
          onOpenStructural={() => {
            setIsProfessionalReviewOpen(false);
            handleOpenStructural(selectedProject);
          }}
          onOpenMEP={() => {
            setIsProfessionalReviewOpen(false);
            handleOpenMEP(selectedProject);
          }}
        />
      )}

      {/* Controlled Pilot & Real-World Feedback System */}
      <ControlledPilotModal
        isOpen={isPilotModalOpen}
        onClose={() => setIsPilotModalOpen(false)}
        activeProject={selectedProject}
      />

      {/* Release Preparation & Operational Readiness Center */}
      <OperationalReadinessModal
        isOpen={isOperationalReadinessOpen}
        onClose={() => setIsOperationalReadinessOpen(false)}
        activeProject={selectedProject}
      />
    </div>
  );
}
