/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  History,
  GitCommit,
  GitBranch,
  RotateCcw,
  Users,
  Download,
  Upload,
  Bookmark,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Eye,
  ArrowRight,
  Clock,
  Layers,
  Box,
  Wrench,
  DollarSign,
  Scale,
  ShieldCheck,
  ShieldAlert,
  Info,
  ChevronRight,
  X,
  FileCode,
  Sparkles,
} from 'lucide-react';
import { Project } from '../../types/project';
import {
  ProjectSnapshot,
  CollaboratorProfile,
  SnapshotTrigger,
  DiffCategory,
  ProjectDiffReport,
} from '../../types/versioning';
import {
  listProjectSnapshotsAsync,
  createProjectSnapshotAsync,
  deleteProjectSnapshotAsync,
  executeSafeRestoreAsync,
  exportProjectRevisionBundleAsync,
  importProjectRevisionBundleAsync,
  getActiveCollaborator,
  setActiveCollaborator,
  DEFAULT_COLLABORATORS,
} from '../../services/versioningService';
import { computeProjectDiff } from '../../services/versionDiffEngine';
import { SnapshotCreateModal } from './SnapshotCreateModal';
import { RestoreConfirmModal } from './RestoreConfirmModal';
import { formatDate } from '../../utils/formatters';

interface VersionWorkspaceModalProps {
  project: Project;
  isOpen: boolean;
  onClose: () => void;
  onRestoreProject: (restoredProject: Project) => void | Promise<boolean | void>;
  onShowToast: (message: string, type: 'success' | 'error' | 'info') => void;
  initialTab?: 'timeline' | 'diff' | 'recovery' | 'collaboration';
}

export const VersionWorkspaceModal: React.FC<VersionWorkspaceModalProps> = ({
  project,
  isOpen,
  onClose,
  onRestoreProject,
  onShowToast,
  initialTab = 'timeline',
}) => {
  const [activeTab, setActiveTab] = useState<'timeline' | 'diff' | 'recovery' | 'collaboration'>(initialTab);
  const [snapshots, setSnapshots] = useState<ProjectSnapshot[]>([]);
  const [filterTrigger, setFilterTrigger] = useState<string>('all');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [snapshotToRestore, setSnapshotToRestore] = useState<ProjectSnapshot | null>(null);
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const isMutatingRef = React.useRef(false);

  // Diff inspection states
  const [diffSourceId, setDiffSourceId] = useState<string>('');
  const [diffTargetId, setDiffTargetId] = useState<string>('current');
  const [diffCategoryFilter, setDiffCategoryFilter] = useState<string>('all');

  // Collaborator profile state
  const [activeCollab, setActiveCollab] = useState<CollaboratorProfile>(getActiveCollaborator());

  // Reload snapshots whenever project or modal opens via active persistence provider
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    listProjectSnapshotsAsync(project)
      .then((loaded) => {
        if (cancelled) return;
        setSnapshots(loaded);
        if (loaded.length > 0 && !diffSourceId) {
          setDiffSourceId(loaded[0].id);
        }
      })
      .catch((err: any) => {
        if (cancelled) return;
        console.error('[VersionWorkspaceModal] Failed to load snapshots:', err);
        onShowToast(err.message || 'Failed to load project revisions.', 'error');
      });

    return () => {
      cancelled = true;
    };
  }, [project, isOpen]);

  // Filtered snapshot timeline
  const filteredSnapshots = useMemo(() => {
    if (filterTrigger === 'all') return snapshots;
    return snapshots.filter((s) => s.trigger === filterTrigger);
  }, [snapshots, filterTrigger]);

  // Compute active diff between selected versions
  const diffReport: ProjectDiffReport | null = useMemo(() => {
    if (!diffSourceId) return null;

    let sourceProj: Project | null = null;
    let sourceLabel = '';
    let sourceTime = '';

    if (diffSourceId === 'current') {
      sourceProj = project;
      sourceLabel = 'Current Working Draft';
      sourceTime = project.updatedAt;
    } else {
      const found = snapshots.find((s) => s.id === diffSourceId);
      if (found) {
        sourceProj = found.projectData;
        sourceLabel = `Rev #${found.revisionNumber} (${found.versionTag}: ${found.label})`;
        sourceTime = found.timestamp;
      }
    }

    let targetProj: Project | null = null;
    let targetLabel = '';
    let targetTime = '';

    if (diffTargetId === 'current') {
      targetProj = project;
      targetLabel = 'Current Working Draft';
      targetTime = project.updatedAt;
    } else {
      const found = snapshots.find((s) => s.id === diffTargetId);
      if (found) {
        targetProj = found.projectData;
        targetLabel = `Rev #${found.revisionNumber} (${found.versionTag}: ${found.label})`;
        targetTime = found.timestamp;
      }
    }

    if (!sourceProj || !targetProj) return null;

    return computeProjectDiff(sourceProj, targetProj, {
      sourceLabel,
      targetLabel,
      sourceTimestamp: sourceTime,
      targetTimestamp: targetTime,
    });
  }, [diffSourceId, diffTargetId, project, snapshots]);

  if (!isOpen) return null;

  // Handlers
  const handleCreateSnapshot = async (params: {
    trigger: SnapshotTrigger;
    label: string;
    description: string;
    versionTag: string;
    author: CollaboratorProfile;
  }) => {
    if (isMutatingRef.current) return;
    isMutatingRef.current = true;
    setIsMutating(true);
    try {
      const snap = await createProjectSnapshotAsync(project, params);
      const updated = await listProjectSnapshotsAsync(project);
      setSnapshots(updated);
      setDiffSourceId(snap.id);
      onShowToast(`Milestone Snapshot "${snap.label}" recorded successfully.`, 'success');
    } catch (err: any) {
      onShowToast(err.message || 'Failed to record milestone snapshot.', 'error');
    } finally {
      isMutatingRef.current = false;
      setIsMutating(false);
    }
  };

  const handleDeleteSnapshot = async (snapshotId: string, label: string) => {
    if (isMutatingRef.current) return;
    isMutatingRef.current = true;
    setIsMutating(true);
    try {
      const deleted = await deleteProjectSnapshotAsync(project.id, snapshotId);
      if (deleted) {
        const updated = await listProjectSnapshotsAsync(project);
        setSnapshots(updated);
        onShowToast(`Snapshot "${label}" deleted.`, 'info');
      } else {
        onShowToast(`Snapshot "${label}" could not be found.`, 'error');
      }
    } catch (err: any) {
      onShowToast(err.message || `Failed to delete snapshot "${label}".`, 'error');
    } finally {
      isMutatingRef.current = false;
      setIsMutating(false);
    }
  };

  const handleExecuteRestore = async (snap: ProjectSnapshot) => {
    if (isMutatingRef.current) return;
    isMutatingRef.current = true;
    setIsMutating(true);
    try {
      const result = await executeSafeRestoreAsync(project, snap, activeCollab);
      if (!result.success || !result.restoredProject) {
        onShowToast(`Failed to restore revision: ${result.validation.errors.join('; ')}`, 'error');
        return;
      }

      // Apply restored project via active persistence adapter
      const restoreOk = await onRestoreProject(result.restoredProject);
      if (restoreOk === false) {
        return;
      }

      const updated = await listProjectSnapshotsAsync(result.restoredProject);
      setSnapshots(updated);
      onShowToast(
        `Project successfully restored to Revision #${snap.revisionNumber} (${snap.versionTag}). Automatic safety backup captured.`,
        'success'
      );
    } catch (err: any) {
      onShowToast(err.message || 'Failed to restore project revision.', 'error');
    } finally {
      isMutatingRef.current = false;
      setIsMutating(false);
    }
  };

  const handleExportBundle = async () => {
    if (isMutatingRef.current) return;
    isMutatingRef.current = true;
    setIsMutating(true);
    try {
      const bundle = await exportProjectRevisionBundleAsync(project, activeCollab);
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(bundle, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute(
        'download',
        `${project.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-revisions-${Date.now()}.plotify-rev.json`
      );
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      onShowToast('Project revision bundle exported successfully.', 'success');
    } catch (err: any) {
      onShowToast(err.message || 'Failed to export revision bundle.', 'error');
    } finally {
      isMutatingRef.current = false;
      setIsMutating(false);
    }
  };

  const handleImportBundle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || isMutatingRef.current) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      if (isMutatingRef.current) return;
      isMutatingRef.current = true;
      setIsMutating(true);
      try {
        const content = event.target?.result as string;
        const imported = await importProjectRevisionBundleAsync(project, content);
        setSnapshots(imported.snapshots);
        onShowToast(`Imported ${imported.importedCount} snapshot(s) from external bundle.`, 'success');
      } catch (err: any) {
        onShowToast(err.message || 'Failed to import revision bundle.', 'error');
      } finally {
        isMutatingRef.current = false;
        setIsMutating(false);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleCollaboratorChange = (collab: CollaboratorProfile) => {
    setActiveCollab(collab);
    setActiveCollaborator(collab);
    onShowToast(`Active author switched to ${collab.name} (${collab.roleTitle})`, 'info');
  };

  const latestSafetySnapshot = snapshots.find((s) => s.trigger === 'pre-restore-safety');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-6xl h-[92vh] flex flex-col overflow-hidden">
        {/* Top Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-slate-900 text-teal-400 flex items-center justify-center font-bold shadow-xs">
              <History className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 leading-tight">
                  Project Version History & Collaboration Engine
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-teal-100 text-teal-800">
                  {snapshots.length} Snapshots
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Project: <strong className="text-slate-800">{project.name}</strong> • Immutable checkpoints, deterministic trade diffs, safe recovery, and multidisciplinary coordination
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-end sm:self-auto">
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs hover:shadow transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-teal-400" />
              <span>Save Milestone</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer"
              title="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 border-b border-slate-200 bg-white flex items-center gap-6 shrink-0 overflow-x-auto">
          <button
            onClick={() => setActiveTab('timeline')}
            className={`py-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'timeline'
                ? 'border-teal-600 text-teal-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <GitCommit className="w-4 h-4" />
            <span>Revision Timeline</span>
            <span className="text-[10px] px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded-full font-mono">
              {snapshots.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('diff')}
            className={`py-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'diff'
                ? 'border-teal-600 text-teal-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <GitBranch className="w-4 h-4" />
            <span>Deep Diff Inspector</span>
            {diffReport && diffReport.totalChanges > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 bg-amber-100 text-amber-800 rounded-full font-bold">
                {diffReport.totalChanges} changes
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('recovery')}
            className={`py-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'recovery'
                ? 'border-teal-600 text-teal-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <RotateCcw className="w-4 h-4" />
            <span>Safe Recovery & Restore</span>
            {latestSafetySnapshot && (
              <span className="text-[10px] px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded-full">
                Safety Backup Ready
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('collaboration')}
            className={`py-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'collaboration'
                ? 'border-teal-600 text-teal-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Team Collaboration & Cloud Architecture</span>
          </button>
        </div>

        {/* Workspace Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
          {/* TAB 1: REVISION TIMELINE */}
          {activeTab === 'timeline' && (
            <div className="space-y-6 max-w-5xl mx-auto">
              {/* Filter & Subheader Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg text-xs font-medium text-slate-600">
                  <span className="px-2 text-[11px] font-semibold text-slate-400">Trigger Filter:</span>
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'manual', label: 'Milestones' },
                    { id: 'pre-restore-safety', label: 'Safety Backups' },
                    { id: 'auto-checkpoint', label: 'Auto-Checkpoints' },
                  ].map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setFilterTrigger(f.id)}
                      className={`px-2.5 py-1 rounded-md text-xs transition-colors cursor-pointer ${
                        filterTrigger === f.id
                          ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                          : 'hover:text-slate-900'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Showing {filteredSnapshots.length} of {snapshots.length} historical checkpoints</span>
                </div>
              </div>

              {/* Current Working Draft Banner */}
              <div className="bg-white border-2 border-teal-500/80 rounded-xl p-4 shadow-xs relative overflow-hidden">
                <div className="absolute top-0 right-0 px-3 py-1 bg-teal-600 text-white text-[10px] font-bold tracking-wider uppercase rounded-bl-lg">
                  Active Working Project
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-teal-100 text-teal-900 font-mono text-xs font-bold">
                        Working Draft
                      </span>
                      <h4 className="font-bold text-slate-900 text-sm">
                        {project.name}
                      </h4>
                      <span className="text-slate-400">•</span>
                      <span className="text-xs text-slate-500">
                        Last modified: {formatDate(project.updatedAt)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600">
                      Unfrozen live project state. Geometry modifications in 2D or 3D are active here.
                    </p>
                    <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-slate-500">
                      <span>Plot: <strong className="text-slate-700">{project.plotWidth}×{project.plotLength} {project.unit}</strong></span>
                      <span>•</span>
                      <span>Rooms: <strong className="text-slate-700">{project.floorPlan?.rooms?.length || 0}</strong></span>
                      <span>•</span>
                      <span>Columns: <strong className="text-slate-700">{project.structuralCoordination?.columns?.length || 0}</strong></span>
                      <span>•</span>
                      <span>MEP Clashes: <strong className="text-slate-700">{project.mepCoordination?.clashes?.length || 0}</strong></span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setIsCreateModalOpen(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors cursor-pointer"
                    >
                      <Bookmark className="w-3.5 h-3.5 text-teal-700" />
                      <span>Freeze as Milestone</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Snapshot Timeline Cards */}
              <div className="space-y-4">
                {filteredSnapshots.map((snap) => {
                  const isPreRestore = snap.trigger === 'pre-restore-safety';
                  const isMilestone = snap.trigger === 'manual';

                  return (
                    <div
                      key={snap.id}
                      className={`bg-white border rounded-xl p-5 shadow-xs transition-all hover:shadow-md ${
                        isPreRestore
                          ? 'border-amber-300/80 bg-amber-50/20'
                          : 'border-slate-200'
                      }`}
                    >
                      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                        <div className="space-y-2 flex-1">
                          {/* Tags & Header */}
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="px-2 py-0.5 rounded-md bg-slate-900 text-teal-400 font-mono text-xs font-bold">
                              {snap.versionTag}
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-mono text-[11px] font-semibold">
                              Rev #{snap.revisionNumber}
                            </span>

                            {isMilestone && (
                              <span className="px-2 py-0.5 rounded-md bg-teal-50 text-teal-800 border border-teal-200 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                                <Bookmark className="w-2.5 h-2.5 text-teal-700" />
                                <span>Milestone</span>
                              </span>
                            )}

                            {isPreRestore && (
                              <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                                <ShieldCheck className="w-2.5 h-2.5 text-amber-700" />
                                <span>Safety Backup</span>
                              </span>
                            )}

                            {snap.trigger === 'auto-checkpoint' && (
                              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 text-[10px] font-medium">
                                Auto Checkpoint
                              </span>
                            )}

                            <span className="text-slate-300">•</span>
                            <span className="text-xs text-slate-500">
                              {formatDate(snap.timestamp)}
                            </span>
                          </div>

                          {/* Title & Description */}
                          <div>
                            <h4 className="text-sm font-bold text-slate-900">
                              {snap.label}
                            </h4>
                            {snap.description && (
                              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                                {snap.description}
                              </p>
                            )}
                          </div>

                          {/* Metrics Strip */}
                          <div className="flex flex-wrap items-center gap-3 pt-2 text-[11px] text-slate-600 bg-slate-50 px-3 py-2 rounded-lg border border-slate-100">
                            <div className="flex items-center gap-1">
                              <span className="text-slate-400">Plot:</span>
                              <strong className="text-slate-800">{snap.metrics.plotArea} sq {snap.metrics.unit}</strong>
                            </div>
                            <span className="text-slate-300">|</span>
                            <div className="flex items-center gap-1">
                              <span className="text-slate-400">Rooms:</span>
                              <strong className="text-slate-800">{snap.metrics.roomCount}</strong>
                            </div>
                            <span className="text-slate-300">|</span>
                            <div className="flex items-center gap-1">
                              <span className="text-slate-400">GFA:</span>
                              <strong className="text-slate-800">{snap.metrics.totalGFA} sq {snap.metrics.unit}</strong>
                            </div>
                            <span className="text-slate-300">|</span>
                            <div className="flex items-center gap-1">
                              <span className="text-slate-400">Columns:</span>
                              <strong className="text-slate-800">{snap.metrics.structuralColumnCount}</strong>
                            </div>
                            <span className="text-slate-300">|</span>
                            <div className="flex items-center gap-1">
                              <span className="text-slate-400">MEP Clashes:</span>
                              <strong className={snap.metrics.mepClashCount > 0 ? 'text-amber-700' : 'text-emerald-700'}>
                                {snap.metrics.mepClashCount}
                              </strong>
                            </div>
                            <span className="text-slate-300">|</span>
                            <div className="flex items-center gap-1">
                              <span className="text-slate-400">Phase:</span>
                              <strong className="text-slate-800">{snap.metrics.status}</strong>
                            </div>
                          </div>

                          {/* Author Attribution */}
                          <div className="flex items-center gap-2 pt-1">
                            <div
                              className={`w-5 h-5 rounded-full text-white flex items-center justify-center font-bold text-[9px] shrink-0 ${snap.author.avatarColor}`}
                            >
                              {snap.author.initials}
                            </div>
                            <span className="text-xs text-slate-700 font-medium">
                              {snap.author.name}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              ({snap.author.roleTitle})
                            </span>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex flex-row lg:flex-col items-center lg:items-end gap-2 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100">
                          <button
                            onClick={() => {
                              setDiffSourceId(snap.id);
                              setDiffTargetId('current');
                              setActiveTab('diff');
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors cursor-pointer"
                            title="Compare this historical snapshot against current working draft"
                          >
                            <GitBranch className="w-3.5 h-3.5 text-teal-700" />
                            <span>Compare with Current</span>
                          </button>

                          <button
                            onClick={() => {
                              setSnapshotToRestore(snap);
                              setIsRestoreModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-amber-100 hover:text-amber-900 hover:border-amber-300 border border-slate-200 rounded-lg transition-colors cursor-pointer"
                            title="Restore working project to this snapshot revision"
                          >
                            <RotateCcw className="w-3.5 h-3.5 text-amber-700" />
                            <span>Restore This Version</span>
                          </button>

                          <button
                            onClick={() => handleDeleteSnapshot(snap.id, snap.label)}
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                            title="Delete snapshot"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: DEEP DIFF INSPECTOR */}
          {activeTab === 'diff' && (
            <div className="space-y-6 max-w-5xl mx-auto">
              {/* Diff Controls Header */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="w-full sm:w-1/2 space-y-1">
                    <label className="block text-xs font-semibold text-slate-700">
                      Base (Source) Version:
                    </label>
                    <select
                      value={diffSourceId}
                      onChange={(e) => setDiffSourceId(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-medium border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
                    >
                      <option value="current">Current Working Draft</option>
                      {snapshots.map((s) => (
                        <option key={s.id} value={s.id}>
                          Rev #{s.revisionNumber} ({s.versionTag}: {s.label})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="text-slate-400 font-bold shrink-0 hidden sm:block">
                    <ArrowRight className="w-5 h-5 text-teal-600" />
                  </div>

                  <div className="w-full sm:w-1/2 space-y-1">
                    <label className="block text-xs font-semibold text-slate-700">
                      Comparison (Target) Version:
                    </label>
                    <select
                      value={diffTargetId}
                      onChange={(e) => setDiffTargetId(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-medium border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
                    >
                      <option value="current">Current Working Draft</option>
                      {snapshots.map((s) => (
                        <option key={s.id} value={s.id}>
                          Rev #{s.revisionNumber} ({s.versionTag}: {s.label})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Diff Summary Strip */}
                {diffReport && (
                  <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">
                        Total Geometric & Spec Changes:
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                          diffReport.totalChanges > 0
                            ? 'bg-amber-100 text-amber-900'
                            : 'bg-emerald-100 text-emerald-900'
                        }`}
                      >
                        {diffReport.totalChanges} change(s)
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] text-slate-400">Filter Category:</span>
                      <select
                        value={diffCategoryFilter}
                        onChange={(e) => setDiffCategoryFilter(e.target.value)}
                        className="px-2.5 py-1 text-xs border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-teal-500"
                      >
                        <option value="all">All Disciplines</option>
                        <option value="boundaries">Plot Boundaries</option>
                        <option value="rooms">Rooms & Spatial Program</option>
                        <option value="structure">Structural Grid & Columns</option>
                        <option value="mep">MEP Services & Clashes</option>
                        <option value="cost">Cost & Budget</option>
                        <option value="regulations">Regulations & Zoning</option>
                        <option value="finishes">Finishes & Alternatives</option>
                        <option value="general">Metadata & Status</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Diff Categories & Items */}
              {diffReport && (
                <div className="space-y-4">
                  {(Object.keys(diffReport.categories) as DiffCategory[])
                    .filter((catKey) => diffCategoryFilter === 'all' || diffCategoryFilter === catKey)
                    .map((catKey) => {
                      const cat = diffReport.categories[catKey];
                      if (cat.changes.length === 0 && diffCategoryFilter === 'all') return null;

                      return (
                        <div
                          key={catKey}
                          className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs"
                        >
                          <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {catKey === 'boundaries' && <Box className="w-4 h-4 text-teal-700" />}
                              {catKey === 'rooms' && <Layers className="w-4 h-4 text-teal-700" />}
                              {catKey === 'structure' && <Box className="w-4 h-4 text-blue-700" />}
                              {catKey === 'mep' && <Wrench className="w-4 h-4 text-amber-700" />}
                              {catKey === 'cost' && <DollarSign className="w-4 h-4 text-emerald-700" />}
                              {catKey === 'regulations' && <Scale className="w-4 h-4 text-purple-700" />}
                              <span className="font-bold text-xs text-slate-800">
                                {cat.categoryTitle}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 text-[11px]">
                              {cat.addedCount > 0 && (
                                <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold">
                                  +{cat.addedCount} Added
                                </span>
                              )}
                              {cat.removedCount > 0 && (
                                <span className="px-2 py-0.5 rounded bg-red-100 text-red-800 font-semibold">
                                  -{cat.removedCount} Removed
                                </span>
                              )}
                              {cat.modifiedCount > 0 && (
                                <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">
                                  ~{cat.modifiedCount} Modified
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="p-4 space-y-3">
                            {cat.changes.length === 0 ? (
                              <div className="text-xs text-slate-400 italic py-2 text-center">
                                No detected changes in this category between the two revisions.
                              </div>
                            ) : (
                              cat.changes.map((change) => {
                                let badgeColor = 'bg-slate-100 text-slate-700';
                                if (change.type === 'added') badgeColor = 'bg-emerald-50 text-emerald-800 border border-emerald-200';
                                if (change.type === 'removed') badgeColor = 'bg-red-50 text-red-800 border border-red-200';
                                if (change.type === 'modified') badgeColor = 'bg-amber-50 text-amber-800 border border-amber-200';

                                return (
                                  <div
                                    key={change.id}
                                    className="p-3 bg-slate-50/70 border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                                  >
                                    <div className="space-y-1">
                                      <div className="flex items-center gap-2">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${badgeColor}`}>
                                          {change.type}
                                        </span>
                                        <span className="font-bold text-slate-900">
                                          {change.target}
                                        </span>
                                      </div>
                                      <p className="text-slate-600 leading-relaxed text-xs">
                                        {change.description}
                                      </p>
                                    </div>

                                    {(change.oldValue !== undefined || change.newValue !== undefined) && (
                                      <div className="flex items-center gap-2 text-[11px] font-mono bg-white px-2.5 py-1.5 rounded border border-slate-200 shrink-0 self-start sm:self-auto">
                                        {change.oldValue !== undefined && (
                                          <span className="text-red-700 line-through">
                                            {String(change.oldValue)}
                                          </span>
                                        )}
                                        {change.oldValue !== undefined && change.newValue !== undefined && (
                                          <ArrowRight className="w-3 h-3 text-slate-400" />
                                        )}
                                        {change.newValue !== undefined && (
                                          <span className="text-emerald-700 font-bold">
                                            {String(change.newValue)}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      );
                    })}

                  {diffReport.totalChanges === 0 && (
                    <div className="p-8 bg-white border border-slate-200 rounded-xl text-center space-y-2">
                      <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                      <h4 className="font-bold text-slate-900 text-sm">
                        Identical Project State
                      </h4>
                      <p className="text-xs text-slate-500 max-w-md mx-auto">
                        The selected revisions have identical spatial boundaries, room coordinates, structural columns, and MEP coordination specifications.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: SAFE RESTORE & RECOVERY CENTER */}
          {activeTab === 'recovery' && (
            <div className="space-y-6 max-w-4xl mx-auto">
              {/* Safety Overview Banner */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-6 h-6 text-amber-700" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-slate-900">
                      Non-Destructive Safe Rollback Architecture
                    </h3>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Restoring an earlier project version never results in unrecoverable data loss. Plotify automatically captures an immutable <code className="bg-slate-100 text-slate-800 px-1 py-0.5 rounded font-mono text-[11px]">pre-restore-safety</code> snapshot before any restore operation is executed, allowing you to instantly undo or revert back.
                    </p>
                  </div>
                </div>

                {/* Instant Undo / Safety Revert Banner */}
                {latestSafetySnapshot ? (
                  <div className="p-4 bg-teal-50 border border-teal-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-teal-200/70 text-teal-900 font-mono text-[10px] font-bold uppercase">
                          Latest Safety Checkpoint Available
                        </span>
                        <span className="text-xs text-teal-800">
                          Captured {formatDate(latestSafetySnapshot.timestamp)}
                        </span>
                      </div>
                      <div className="font-bold text-xs text-slate-900">
                        {latestSafetySnapshot.label}
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setSnapshotToRestore(latestSafetySnapshot);
                        setIsRestoreModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-800 hover:bg-teal-900 rounded-lg shadow-xs transition-colors shrink-0 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Revert to Pre-Restore State</span>
                    </button>
                  </div>
                ) : (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500">
                    No active pre-restore safety snapshots currently exist for this project. They will be generated automatically when a restore action is triggered.
                  </div>
                )}
              </div>

              {/* Guided Recovery Selector */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
                <h4 className="font-bold text-slate-900 text-sm">
                  Select Snapshot for Verified Restoration
                </h4>
                <div className="space-y-3">
                  {snapshots.map((s) => (
                    <div
                      key={s.id}
                      className="p-4 border border-slate-200 hover:border-teal-400 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50 hover:bg-teal-50/20 transition-all"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-slate-900 text-teal-400 font-mono text-xs font-bold">
                            {s.versionTag}
                          </span>
                          <span className="font-bold text-xs text-slate-900">
                            {s.label}
                          </span>
                          <span className="text-slate-400">•</span>
                          <span className="text-xs text-slate-500">
                            {formatDate(s.timestamp)}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Author: <strong className="text-slate-700">{s.author.name}</strong> • Rooms: {s.metrics.roomCount} • Clashes: {s.metrics.mepClashCount}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => {
                            setSnapshotToRestore(s);
                            setIsRestoreModalOpen(true);
                          }}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-lg transition-colors cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Initiate Restore</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: TEAM COLLABORATION & CLOUD ARCHITECTURE */}
          {activeTab === 'collaboration' && (
            <div className="space-y-6 max-w-4xl mx-auto">
              {/* Active Collaborator Switcher */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Local Collaborator Persona & Disciplinary Attribution
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Select which project stakeholder profile is actively creating snapshots and authoring change notes.
                    </p>
                  </div>
                  <div className="px-2.5 py-1 rounded bg-teal-50 border border-teal-200 text-teal-800 text-xs font-semibold">
                    Current: {activeCollab.name}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {DEFAULT_COLLABORATORS.map((collab) => {
                    const isSelected = activeCollab.id === collab.id;
                    return (
                      <button
                        key={collab.id}
                        type="button"
                        onClick={() => handleCollaboratorChange(collab)}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'border-teal-500 bg-teal-50/60 shadow-xs'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-8 h-8 rounded-full text-white flex items-center justify-center font-bold text-xs shrink-0 ${collab.avatarColor}`}
                          >
                            {collab.initials}
                          </div>
                          <div className="truncate">
                            <div className="text-xs font-bold text-slate-900 truncate">
                              {collab.name}
                            </div>
                            <div className="text-[10px] text-slate-500 truncate">
                              {collab.roleTitle}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Asynchronous Revision Bundle Exchange */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Asynchronous Team Revision Exchange (.plotify-rev.json)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Share complete snapshot timelines, trade comments, and clash histories with outside consultants and clients without requiring server accounts.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 border border-slate-200 rounded-xl bg-slate-50/50 space-y-3">
                    <div className="font-semibold text-xs text-slate-900 flex items-center gap-2">
                      <Download className="w-4 h-4 text-teal-700" />
                      <span>Export Revision Bundle</span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      Packages all {snapshots.length} historical snapshots, author tags, and geometry into a standalone JSON bundle file.
                    </p>
                    <button
                      onClick={handleExportBundle}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-teal-400" />
                      <span>Download .plotify-rev.json</span>
                    </button>
                  </div>

                  <div className="p-4 border border-slate-200 rounded-xl bg-slate-50/50 space-y-3">
                    <div className="font-semibold text-xs text-slate-900 flex items-center gap-2">
                      <Upload className="w-4 h-4 text-teal-700" />
                      <span>Import External Bundle</span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      Import revision checkpoints exported from another machine or consultant and merge them into this project's timeline.
                    </p>
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition-colors cursor-pointer">
                      <Upload className="w-3.5 h-3.5 text-slate-500" />
                      <span>Choose Bundle File</span>
                      <input
                        type="file"
                        accept=".json,.plotify-rev.json"
                        onChange={handleImportBundle}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              </div>

              {/* Cloud Collaboration Infrastructure Disclosure */}
              <div className="bg-slate-900 text-white rounded-xl p-6 shadow-md space-y-5">
                <div className="flex items-start gap-3.5">
                  <div className="p-2.5 bg-teal-500/20 text-teal-400 rounded-xl border border-teal-500/30 shrink-0">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-teal-400">
                        Engineering Boundary Disclosure
                      </span>
                      <span className="text-slate-500">•</span>
                      <span className="text-xs text-slate-400">Local-First Storage</span>
                    </div>
                    <h3 className="text-base font-bold text-white mt-0.5">
                      Cloud Multi-User Synchronization Architecture
                    </h3>
                    <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                      Plotify currently operates in a local-first client browser storage model (using browser localStorage with JSON export/import). To provide authentic concurrent multi-user synchronization without simulated mock websockets, the following 6 cloud architectural pillars must be deployed:
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs pt-2 border-t border-slate-800">
                  <div className="p-3.5 bg-slate-800/80 rounded-lg border border-slate-700 space-y-1.5">
                    <div className="font-bold text-teal-300 flex items-center gap-2">
                      <span>1. Centralized Auth & Tenant Identity</span>
                    </div>
                    <p className="text-slate-400 text-[11px] leading-relaxed">
                      Requires Google Workspace OAuth or Firebase Authentication with tenant isolation, cryptographic JWT tokens, and verified organizational affiliations.
                    </p>
                  </div>

                  <div className="p-3.5 bg-slate-800/80 rounded-lg border border-slate-700 space-y-1.5">
                    <div className="font-bold text-teal-300 flex items-center gap-2">
                      <span>2. Spatial CRDT / Operational Transformation</span>
                    </div>
                    <p className="text-slate-400 text-[11px] leading-relaxed">
                      Requires Conflict-Free Replicated Data Types (such as Yjs or Automerge) to mathematically resolve simultaneous room coordinate drags and wall resizing without race conditions.
                    </p>
                  </div>

                  <div className="p-3.5 bg-slate-800/80 rounded-lg border border-slate-700 space-y-1.5">
                    <div className="font-bold text-teal-300 flex items-center gap-2">
                      <span>3. Persistent WebSocket Relay Mesh</span>
                    </div>
                    <p className="text-slate-400 text-[11px] leading-relaxed">
                      Requires a scalable server-authoritative WebSocket cluster (e.g. Node.js ws, Liveblocks, or PartyKit) for sub-50ms peer cursor presence and broadcast events.
                    </p>
                  </div>

                  <div className="p-3.5 bg-slate-800/80 rounded-lg border border-slate-700 space-y-1.5">
                    <div className="font-bold text-teal-300 flex items-center gap-2">
                      <span>4. Multi-Disciplinary Semantic Merge</span>
                    </div>
                    <p className="text-slate-400 text-[11px] leading-relaxed">
                      Requires domain-aware architectural 3-way merge engines (preventing Last-Write-Wins from silently wiping structural column shifts when an architect moves a partition).
                    </p>
                  </div>

                  <div className="p-3.5 bg-slate-800/80 rounded-lg border border-slate-700 space-y-1.5">
                    <div className="font-bold text-teal-300 flex items-center gap-2">
                      <span>5. Cloud Persistence & Blob Store</span>
                    </div>
                    <p className="text-slate-400 text-[11px] leading-relaxed">
                      Requires Cloud Firestore or PostgreSQL (Cloud SQL) with Google Cloud Storage for versioned asset backups, 3D glTF models, and vector drawing archives.
                    </p>
                  </div>

                  <div className="p-3.5 bg-slate-800/80 rounded-lg border border-slate-700 space-y-1.5">
                    <div className="font-bold text-teal-300 flex items-center gap-2">
                      <span>6. Role-Based Access Control (RBAC)</span>
                    </div>
                    <p className="text-slate-400 text-[11px] leading-relaxed">
                      Granular permission levels separating Principal Architects (approval authority), Engineering Consultants (structural/MEP edit rights), and Clients (view & sign-off only).
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Snapshot Create Modal */}
      <SnapshotCreateModal
        project={project}
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSave={handleCreateSnapshot}
      />

      {/* Restore Confirm Modal */}
      <RestoreConfirmModal
        currentProject={project}
        snapshotToRestore={snapshotToRestore}
        isOpen={isRestoreModalOpen}
        onClose={() => {
          setIsRestoreModalOpen(false);
          setSnapshotToRestore(null);
        }}
        onConfirmRestore={handleExecuteRestore}
        onOpenDiffPeek={(src, tgt) => {
          if (snapshotToRestore) {
            setDiffSourceId(snapshotToRestore.id);
            setDiffTargetId('current');
            setActiveTab('diff');
          }
        }}
      />
    </div>
  );
};
