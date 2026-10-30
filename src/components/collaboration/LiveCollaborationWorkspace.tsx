/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * PLOTIFY — P50 Live Multi-User Design Collaboration Workspace
 * Profile Identifier: plotify-live-collaboration-p50-v1
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Users,
  ShieldCheck,
  AlertTriangle,
  Wifi,
  WifiOff,
  RefreshCw,
  MessageSquare,
  Bookmark,
  UserPlus,
  KeyRound,
  Lock,
  CheckCircle2,
  XCircle,
  Clock,
  GitMerge,
  Eye,
  Send,
  Glasses,
  Layers,
  ArrowLeft,
  Terminal,
  Radio,
  History,
  Trash2,
  Plus,
} from 'lucide-react';
import { Project } from '../../types/project';
import {
  AuthenticatedCollaboratorIdentity,
  CollaborationConflictRecord,
  CollaborationRole,
  ConflictResolutionChoice,
  LIVE_COLLABORATION_PROFILE_ID,
  OperationAcknowledgement,
  SharedViewpointBroadcast,
} from '../../types/liveCollaboration';
import {
  AuthoritativeTestHarnessCollaborationHub,
  COLLABORATION_ROLE_CAPABILITY_MATRIX,
  TestHarnessCollaborationClientProvider,
  UnconfiguredProductionCollaborationProvider,
  canCollaboratorPerformAction,
  canCollaboratorModifyAnnotation,
  evaluateCollaborationBackendReadiness,
  getCollaborationSecurityGuard,
  syncProjectWithCollaborationWorkspace,
} from '../../services/liveCollaborationService';

interface LiveCollaborationWorkspaceProps {
  project: Project;
  projects: Project[];
  onSelectProject: (projectId: string) => void;
  onUpdateProject: (updated: Project) => void;
  onBackToOverview: () => void;
  onOpenVRReview?: () => void;
}

type WorkspaceTab =
  | 'overview-readiness'
  | 'annotations-threads'
  | 'co-review-p49'
  | 'members-invitations'
  | 'offline-snapshots';

interface SandboxPersona {
  id: string;
  displayName: string;
  email: string;
  defaultRole: CollaborationRole;
  sessionId: string;
}

const SANDBOX_PERSONAS: SandboxPersona[] = [
  {
    id: 'usr-owner-elena',
    displayName: 'Elena Vance (Lead Architect)',
    email: 'elena.vance@plotify.arch',
    defaultRole: 'owner',
    sessionId: 'sess-elena-01',
  },
  {
    id: 'usr-editor-marcus',
    displayName: 'Marcus Chen (Senior Designer)',
    email: 'marcus.chen@plotify.arch',
    defaultRole: 'editor',
    sessionId: 'sess-marcus-01',
  },
  {
    id: 'usr-reviewer-priya',
    displayName: 'Dr. Priya Nair (Envelope & Facade Reviewer)',
    email: 'priya.nair@plotify.arch',
    defaultRole: 'reviewer',
    sessionId: 'sess-priya-01',
  },
  {
    id: 'usr-viewer-liam',
    displayName: "Liam O'Connor (Client Representative)",
    email: 'liam.oconnor@client.org',
    defaultRole: 'viewer',
    sessionId: 'sess-liam-01',
  },
];

export const LiveCollaborationWorkspace: React.FC<LiveCollaborationWorkspaceProps> = ({
  project,
  projects,
  onSelectProject,
  onUpdateProject,
  onBackToOverview,
  onOpenVRReview,
}) => {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('overview-readiness');
  const [isSandboxMode, setIsSandboxMode] = useState<boolean>(false);
  const [activePersonaId, setActivePersonaId] = useState<string>(SANDBOX_PERSONAS[0].id);
  const [statusBannerMessage, setStatusBannerMessage] = useState<{
    text: string;
    tone: 'info' | 'success' | 'warning' | 'error';
  } | null>(null);

  // Unconfigured Production Provider (Path C default)
  const productionProvider = useMemo(
    () => new UnconfiguredProductionCollaborationProvider(),
    []
  );

  // Authoritative In-Memory Multi-Client Hub for Sandbox Verification
  const [sandboxEnv, setSandboxEnv] = useState<{
    hub: AuthoritativeTestHarnessCollaborationHub;
    clients: Record<string, TestHarnessCollaborationClientProvider>;
    workspaceId: string;
    issuedTokens: Record<string, string>;
  } | null>(null);

  const [tick, setTick] = useState(0);
  const forceRefresh = useCallback(() => setTick((t) => t + 1), []);

  // Form states for interactive testing
  const [newAnnotationTitle, setNewAnnotationTitle] = useState('');
  const [newAnnotationNote, setNewAnnotationNote] = useState('');
  const [newAnnotationPriority, setNewAnnotationPriority] = useState<
    'low' | 'medium' | 'high' | 'critical-observation'
  >('medium');
  const [newAnnotationFloor, setNewAnnotationFloor] = useState<number>(1);
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [inviteEmail, setInviteEmail] = useState('alex.rivera@consultant.arch');
  const [inviteRole, setInviteRole] = useState<CollaborationRole>('reviewer');
  const [newBookmarkLabel, setNewBookmarkLabel] = useState('');
  const [newSnapshotLabel, setNewSnapshotLabel] = useState('');
  const [pendingOptInBroadcast, setPendingOptInBroadcast] =
    useState<SharedViewpointBroadcast | null>(null);
  const [lastOperationAck, setLastOperationAck] = useState<OperationAcknowledgement | null>(
    null
  );

  // Initialize or reset sandbox when project changes or sandbox mode is enabled
  const initializeSandboxForProject = useCallback(() => {
    const hub = new AuthoritativeTestHarnessCollaborationHub();
    const now = new Date();
    const expires = new Date(now.getTime() + 4 * 3600 * 1000).toISOString();

    const makeIdentity = (p: SandboxPersona): AuthenticatedCollaboratorIdentity => ({
      userId: p.id,
      displayName: p.displayName,
      email: p.email,
      organizationId: 'org-plotify-studio',
      sessionId: p.sessionId,
      authVerified: true,
      authProvider: 'test-harness-verified',
      authenticatedAt: now.toISOString(),
      tokenExpiresAt: expires,
    });

    const ownerIdentity = makeIdentity(SANDBOX_PERSONAS[0]);
    const wsId = `ws-${project.id}-sandbox`;
    const created = hub.createWorkspace(project, ownerIdentity, wsId);
    if (!created.ok) return;

    const issuedTokens: Record<string, string> = {};

    // Invite and join Editor, Reviewer, and Viewer personas through real invitation flow
    for (const persona of SANDBOX_PERSONAS.slice(1)) {
      const invRes = hub.createInvitation({
        workspaceId: wsId,
        actorUserId: ownerIdentity.userId,
        actorSessionId: ownerIdentity.sessionId,
        targetEmailOrUserId: persona.email,
        assignedRole: persona.defaultRole,
      });
      if (invRes.ok) {
        issuedTokens[invRes.invitation.invitationId] = invRes.rawInviteToken;
        hub.acceptInvitation({
          workspaceId: wsId,
          invitationId: invRes.invitation.invitationId,
          rawInviteToken: invRes.rawInviteToken,
          joiningIdentity: makeIdentity(persona),
        });
      }
    }

    const clients: Record<string, TestHarnessCollaborationClientProvider> = {};
    for (const persona of SANDBOX_PERSONAS) {
      const identity = makeIdentity(persona);
      const client = new TestHarnessCollaborationClientProvider(hub, identity, wsId);
      client.connect();
      hub.updatePresence({
        workspaceId: wsId,
        userId: identity.userId,
        sessionId: identity.sessionId,
        activityState: 'active',
        activeSurface:
          persona.defaultRole === 'reviewer' ? 'vr-design-review-p49' : 'collaboration-hub',
        activeFloorLevel: 1,
        selectedRoomId: project.floorPlan?.rooms?.[0]?.id || null,
        coarseViewpoint: {
          positionMetres: { x: 4.5, y: 1.65, z: 8.2 },
          yawDegrees: 25,
          scalePreset: '1:1',
        },
        bypassThrottleForHeartbeat: true,
      });
      clients[persona.id] = client;
    }

    setSandboxEnv({ hub, clients, workspaceId: wsId, issuedTokens });
    setStatusBannerMessage({
      text: 'Initialized Development Multi-Client Test Harness with 4 verified collaborator sessions (Owner, Editor, Reviewer, Viewer).',
      tone: 'info',
    });
  }, [project]);

  useEffect(() => {
    if (isSandboxMode) {
      initializeSandboxForProject();
    } else {
      setSandboxEnv(null);
    }
  }, [isSandboxMode, project.id, initializeSandboxForProject]);

  const activeClient = useMemo(() => {
    if (!isSandboxMode || !sandboxEnv) return null;
    return sandboxEnv.clients[activePersonaId] || null;
  }, [isSandboxMode, sandboxEnv, activePersonaId, tick]);

  const readinessReport = useMemo(() => {
    if (!isSandboxMode) {
      return productionProvider.getReadinessReport();
    }
    return evaluateCollaborationBackendReadiness({
      enableTestHarnessMode: true,
      hasAuthenticatedSession: Boolean(activeClient),
      authenticatedUserId: activePersonaId,
    });
  }, [isSandboxMode, productionProvider, activeClient, activePersonaId, tick]);

  const workspaceSnapshot = useMemo(() => {
    if (!activeClient) return null;
    return activeClient.getWorkspaceSnapshot();
  }, [activeClient, tick]);

  const activePresenceList = useMemo(() => {
    if (!activeClient) return [];
    return activeClient.getPresenceList();
  }, [activeClient, tick]);

  const activeMemberRecord = useMemo(() => {
    if (!workspaceSnapshot) return null;
    return (
      workspaceSnapshot.memberships.find((m) => m.userId === activePersonaId) || null
    );
  }, [workspaceSnapshot, activePersonaId]);

  const activeRole: CollaborationRole | null =
    activeMemberRecord?.status === 'active' ? activeMemberRecord.role : null;

  const securityGuard = useMemo(() => getCollaborationSecurityGuard(), []);

  // Handlers
  const handleCreateAnnotation = () => {
    if (!isSandboxMode || !activeClient || !workspaceSnapshot) {
      const failedAck = productionProvider.submitOperation({
        operationId: `op-prod-block-${Date.now()}`,
        workspaceId: 'unconfigured',
        actorUserId: 'anonymous',
        actorSessionId: 'none',
        operationType: 'annotation:create',
        targetEntityId: 'none',
        baseWorkspaceRevision: 0,
        baseEntityRevision: 0,
        payload: { title: newAnnotationTitle },
        createdAt: new Date().toISOString(),
      });
      setLastOperationAck(failedAck);
      setStatusBannerMessage({
        text: failedAck.errorMessage || 'Backend not configured.',
        tone: 'error',
      });
      return;
    }

    const ack = activeClient.submitOperation({
      operationType: 'annotation:create',
      targetEntityId: `shared-ann-${Date.now().toString(36)}`,
      baseWorkspaceRevision: workspaceSnapshot.workspaceRevision,
      baseEntityRevision: 0,
      payload: {
        title: newAnnotationTitle.trim() || 'Shared Design Coordination Note',
        note:
          newAnnotationNote.trim() ||
          'Verify glazing mullion alignment and circulation clearance on Floor 1.',
        category: 'design-coordination-issue',
        priority: newAnnotationPriority,
        status: 'open',
        targetFloorLevel: newAnnotationFloor,
        targetRoomId: project.floorPlan?.rooms?.[0]?.id,
        targetRoomName: project.floorPlan?.rooms?.[0]?.name,
        anchorPositionLocalPlotUnits: { x: 8, y: 10, z: 0 },
        anchorPositionMetresAt1To1: { x: 2.44, y: 1.5, z: 3.05 },
      },
    });

    setLastOperationAck(ack);
    if (ack.accepted) {
      setNewAnnotationTitle('');
      setNewAnnotationNote('');
      setStatusBannerMessage({
        text: `Annotation accepted (Workspace Rev ${ack.newWorkspaceRevision}).`,
        tone: 'success',
      });
    } else if (ack.deliveryState === 'queued') {
      setNewAnnotationTitle('');
      setNewAnnotationNote('');
      setStatusBannerMessage({
        text: 'Client is currently offline — annotation queued locally (not marked accepted until reconnect).',
        tone: 'warning',
      });
    } else {
      setStatusBannerMessage({
        text: ack.errorMessage || 'Operation rejected by server RBAC.',
        tone: 'error',
      });
    }
    forceRefresh();
  };

  const handleStatusChange = (
    annotationId: string,
    currentRevision: number,
    newStatus: 'open' | 'in-review' | 'resolved' | 'needs-reverification'
  ) => {
    if (!activeClient || !workspaceSnapshot) return;
    const ack = activeClient.submitOperation({
      operationType: 'annotation:status-change',
      targetEntityId: annotationId,
      baseWorkspaceRevision: workspaceSnapshot.workspaceRevision,
      baseEntityRevision: currentRevision,
      payload: { status: newStatus },
    });
    setLastOperationAck(ack);
    if (!ack.accepted && ack.deliveryState !== 'queued') {
      setStatusBannerMessage({
        text: ack.errorMessage || 'Status update failed.',
        tone: 'error',
      });
    }
    forceRefresh();
  };

  const handleDeleteAnnotation = (annotationId: string, currentRevision: number) => {
    if (!activeClient || !workspaceSnapshot) return;
    const ack = activeClient.submitOperation({
      operationType: 'annotation:delete',
      targetEntityId: annotationId,
      baseWorkspaceRevision: workspaceSnapshot.workspaceRevision,
      baseEntityRevision: currentRevision,
      payload: {},
    });
    setLastOperationAck(ack);
    forceRefresh();
  };

  const handleAddComment = (annotationId: string, currentRevision: number) => {
    if (!activeClient || !workspaceSnapshot) return;
    const body = (commentInputs[annotationId] || '').trim();
    if (!body) return;
    const ack = activeClient.submitOperation({
      operationType: 'comment:create',
      targetEntityId: annotationId,
      baseWorkspaceRevision: workspaceSnapshot.workspaceRevision,
      baseEntityRevision: currentRevision,
      payload: { body },
    });
    setLastOperationAck(ack);
    if (ack.accepted || ack.deliveryState === 'queued') {
      setCommentInputs((prev) => ({ ...prev, [annotationId]: '' }));
    } else {
      setStatusBannerMessage({
        text: ack.errorMessage || 'Failed to add comment.',
        tone: 'error',
      });
    }
    forceRefresh();
  };

  const handleSimulateConcurrentEditConflict = (annotationId: string) => {
    if (!sandboxEnv || !activeClient || !workspaceSnapshot) return;
    const targetAnn = workspaceSnapshot.annotations.find(
      (a) => a.annotationId === annotationId && !a.isDeletedTombstone
    );
    if (!targetAnn) return;

    const baseRev = targetAnn.revision;
    const ownerClient = sandboxEnv.clients['usr-owner-elena'];
    const editorClient = sandboxEnv.clients['usr-editor-marcus'];

    // Step 1: Owner updates annotation at baseRev -> succeeds (moves server to baseRev + 1)
    ownerClient.submitOperation({
      operationType: 'annotation:update',
      targetEntityId: annotationId,
      baseWorkspaceRevision: workspaceSnapshot.workspaceRevision,
      baseEntityRevision: baseRev,
      payload: {
        title: `${targetAnn.title} [Elena Rev ${baseRev + 1}]`,
        note: `${targetAnn.note} — Updated by Lead Architect first.`,
      },
    });

    // Step 2: Active client (or Editor) submits stale edit against baseRev -> triggers CAS conflict
    const conflictingClient =
      activePersonaId === 'usr-owner-elena' ? editorClient : activeClient;
    const conflictAck = conflictingClient.submitOperation({
      operationType: 'annotation:update',
      targetEntityId: annotationId,
      baseWorkspaceRevision: workspaceSnapshot.workspaceRevision,
      baseEntityRevision: baseRev, // Stale revision!
      payload: {
        title: `${targetAnn.title} [Concurrent Proposal]`,
        note: `Concurrent edit proposed against stale revision ${baseRev}.`,
      },
    });

    setLastOperationAck(conflictAck);
    setStatusBannerMessage({
      text: `Simulated concurrent edit: Server preserved Rev ${baseRev + 1} and recorded a structured VERSION_CONFLICT for review.`,
      tone: 'warning',
    });
    forceRefresh();
  };

  const handleResolveConflict = (
    client: TestHarnessCollaborationClientProvider,
    conflict: CollaborationConflictRecord,
    choice: ConflictResolutionChoice
  ) => {
    const res = client.resolveConflict(conflict.conflictId, choice);
    if (res.ok) {
      setStatusBannerMessage({
        text: `Conflict resolved via '${choice}'.`,
        tone: 'success',
      });
    } else {
      setStatusBannerMessage({
        text: res.errorMessage || 'Could not resolve conflict.',
        tone: 'error',
      });
    }
    forceRefresh();
  };

  const handleBroadcastViewpoint = () => {
    if (!activeClient || !workspaceSnapshot) return;
    const ack = activeClient.submitOperation({
      operationType: 'viewpoint:broadcast',
      targetEntityId: `vp-${Date.now()}`,
      baseWorkspaceRevision: workspaceSnapshot.workspaceRevision,
      baseEntityRevision: 1,
      payload: {
        label: `${activeMemberRecord?.displayName || 'Collaborator'}'s P49 Review Viewpoint`,
        activeSurface: 'vr-design-review-p49',
        targetFloorLevel: 1,
        targetRoomId: project.floorPlan?.rooms?.[0]?.id,
        cameraPositionMetres: { x: 5.2, y: 1.65, z: 7.4 },
        lookAtTargetMetres: { x: 5.2, y: 1.5, z: 0 },
        yawDegrees: 15,
        scalePreset: '1:1',
      },
    });
    setLastOperationAck(ack);
    if (ack.accepted) {
      const latestWs = activeClient.getWorkspaceSnapshot();
      const latestVp = latestWs?.viewpointBroadcasts?.[0] || null;
      setPendingOptInBroadcast(latestVp);
      setStatusBannerMessage({
        text: 'Broadcasted viewpoint to workspace. Other collaborators receive an opt-in prompt (their camera is never force-moved).',
        tone: 'info',
      });
    } else {
      setStatusBannerMessage({
        text: ack.errorMessage || 'Viewpoint broadcast rejected.',
        tone: 'error',
      });
    }
    forceRefresh();
  };

  const handleCreateBookmark = () => {
    if (!activeClient || !workspaceSnapshot) return;
    const ack = activeClient.submitOperation({
      operationType: 'bookmark:create',
      targetEntityId: `shared-bm-${Date.now().toString(36)}`,
      baseWorkspaceRevision: workspaceSnapshot.workspaceRevision,
      baseEntityRevision: 0,
      payload: {
        label: newBookmarkLabel.trim() || 'Shared Atrium Perspective',
        presetType: 'custom-viewpoint',
        targetFloorLevel: 1,
        cameraPositionMetres: { x: 4.0, y: 1.65, z: 9.0 },
        lookAtTargetMetres: { x: 4.0, y: 1.5, z: 2.0 },
        scalePreset: '1:1',
      },
    });
    setLastOperationAck(ack);
    if (ack.accepted) {
      setNewBookmarkLabel('');
      setStatusBannerMessage({
        text: 'Shared viewpoint bookmark saved to workspace.',
        tone: 'success',
      });
    } else {
      setStatusBannerMessage({
        text: ack.errorMessage || 'Bookmark creation rejected.',
        tone: 'error',
      });
    }
    forceRefresh();
  };

  const handleSyncToProject = () => {
    if (!workspaceSnapshot || !activeClient) return;
    const synced = syncProjectWithCollaborationWorkspace(
      project,
      workspaceSnapshot,
      activeClient.getConnectionState()
    );
    onUpdateProject(synced);
    setStatusBannerMessage({
      text: `Synchronized ${synced.liveCollaboration?.cachedAnnotationsCount ?? 0} shared annotations and ${synced.liveCollaboration?.cachedBookmarksCount ?? 0} bookmarks to local project & P49 VR Design Review.`,
      tone: 'success',
    });
  };

  const handleCreateInvitation = () => {
    if (!sandboxEnv || !activeClient) return;
    const res = sandboxEnv.hub.createInvitation({
      workspaceId: sandboxEnv.workspaceId,
      actorUserId: activeClient.identity.userId,
      actorSessionId: activeClient.identity.sessionId,
      targetEmailOrUserId: inviteEmail.trim() || 'new.reviewer@plotify.arch',
      assignedRole: inviteRole,
    });
    if (res.ok) {
      sandboxEnv.issuedTokens[res.invitation.invitationId] = res.rawInviteToken;
      setStatusBannerMessage({
        text: `Created single-use hashed invitation for ${res.invitation.targetEmailOrUserId} (${res.invitation.assignedRole}).`,
        tone: 'success',
      });
    } else {
      setStatusBannerMessage({
        text: res.errorMessage,
        tone: 'error',
      });
    }
    forceRefresh();
  };

  const handleChangeMemberRole = (targetUserId: string, newRole: CollaborationRole) => {
    if (!sandboxEnv || !activeClient) return;
    const res = sandboxEnv.hub.updateMemberRole({
      workspaceId: sandboxEnv.workspaceId,
      actorUserId: activeClient.identity.userId,
      actorSessionId: activeClient.identity.sessionId,
      targetUserId,
      newRole,
    });
    if (res.ok) {
      setStatusBannerMessage({
        text: `Updated member ${res.membership.displayName} role to '${newRole}'.`,
        tone: 'success',
      });
    } else {
      setStatusBannerMessage({
        text: res.errorMessage,
        tone: 'error',
      });
    }
    forceRefresh();
  };

  const handleRevokeMember = (targetUserId: string) => {
    if (!sandboxEnv || !activeClient) return;
    const res = sandboxEnv.hub.revokeMembership({
      workspaceId: sandboxEnv.workspaceId,
      actorUserId: activeClient.identity.userId,
      actorSessionId: activeClient.identity.sessionId,
      targetUserId,
      reason: 'Revoked during workspace RBAC management.',
    });
    if (res.ok) {
      setStatusBannerMessage({
        text: `Revoked membership for ${res.membership.displayName}. Subsequent writes from that user are blocked.`,
        tone: 'warning',
      });
    } else {
      setStatusBannerMessage({
        text: res.errorMessage,
        tone: 'error',
      });
    }
    forceRefresh();
  };

  const allConflicts = useMemo(() => {
    if (!sandboxEnv) return [];
    const list: Array<{
      client: TestHarnessCollaborationClientProvider;
      conflict: CollaborationConflictRecord;
    }> = [];
    for (const c of Object.values(sandboxEnv.clients)) {
      for (const conf of c.getConflicts()) {
        if (!conf.resolved) {
          list.push({ client: c, conflict: conf });
        }
      }
    }
    return list;
  }, [sandboxEnv, tick]);

  const connectionState = activeClient
    ? activeClient.getConnectionState()
    : productionProvider.getConnectionState();

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      {/* Top Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <button
              onClick={onBackToOverview}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Project Overview</span>
            </button>
            <span className="text-slate-300">/</span>
            <span className="text-xs font-mono text-teal-700 font-semibold">
              {LIVE_COLLABORATION_PROFILE_ID}
            </span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <Users className="w-6 h-6 text-teal-700" />
            <span>Live Multi-User Design Collaboration (P50)</span>
          </h2>
          <p className="text-xs text-slate-500">
            Authenticated workspace membership, RBAC enforcement, versioned compare-and-set
            updates, conflict resolution, and P49 co-review synchronization.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Project Selector */}
          <select
            value={project.id}
            onChange={(e) => onSelectProject(e.target.value)}
            aria-label="Select Project"
            className="text-xs font-medium bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.unit})
              </option>
            ))}
          </select>

          {onOpenVRReview && (
            <button
              onClick={onOpenVRReview}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors cursor-pointer"
            >
              <Glasses className="w-3.5 h-3.5 text-teal-700" />
              <span>Open P49 VR Design Review</span>
            </button>
          )}

          <button
            onClick={() => setIsSandboxMode((prev) => !prev)}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
              isSandboxMode
                ? 'bg-amber-950 text-amber-100 border-amber-800 hover:bg-amber-900'
                : 'bg-slate-900 text-white border-slate-800 hover:bg-slate-800'
            }`}
          >
            <Terminal className="w-3.5 h-3.5 text-teal-400" />
            <span>
              {isSandboxMode
                ? 'Exit Dev Multi-Client Sandbox (Return to Production Gate)'
                : 'Launch Dev Multi-Client Test Harness (Sandbox)'}
            </span>
          </button>
        </div>
      </div>

      {/* Top-Line Honesty & Readiness Banner (Section 3.3 Path C & Section 4) */}
      <div
        className={`rounded-xl border p-4 shadow-2xs ${
          !isSandboxMode
            ? 'bg-amber-50/90 border-amber-300 text-amber-950'
            : 'bg-slate-900 border-slate-700 text-slate-100'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            {!isSandboxMode ? (
              <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            ) : (
              <Terminal className="w-5 h-5 text-teal-400 shrink-0 mt-0.5" />
            )}
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm bg-amber-200/80 text-amber-950">
                  {readinessReport.topLineStatus}
                </span>
                <span
                  className={`text-xs font-mono px-2 py-0.5 rounded-sm font-semibold ${
                    connectionState === 'connected'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : connectionState === 'backend-not-configured'
                      ? 'bg-amber-200 text-amber-950 border border-amber-400'
                      : connectionState === 'offline' || connectionState === 'reconnecting'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                  }`}
                >
                  state: {connectionState}
                </span>
                <span className="text-[11px] font-mono opacity-80">
                  provider: {readinessReport.activeProviderMode}
                </span>
              </div>
              <p className="text-xs leading-relaxed opacity-95">
                {readinessReport.honestyDisclosure}
              </p>
            </div>
          </div>

          {isSandboxMode && workspaceSnapshot && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleSyncToProject}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-teal-600 hover:bg-teal-500 text-white rounded-lg transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Sync Shared Review to Project</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Interactive Multi-Client Persona Bar (Visible only in Dev Sandbox Mode) */}
      {isSandboxMode && sandboxEnv && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-teal-600" />
                <span>Active Sandbox Collaborator Session Switcher (isTestHarnessOnly: true)</span>
              </h3>
              <p className="text-[11px] text-slate-500">
                Switch between independent authenticated client sessions to verify server-side
                RBAC, presence, invitations, and concurrent edit conflict handling.
              </p>
            </div>
            {workspaceSnapshot && (
              <div className="text-xs font-mono text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">
                Workspace Rev: <strong>#{workspaceSnapshot.workspaceRevision}</strong> | Active
                Role: <strong className="uppercase text-teal-700">{activeRole || 'NONE'}</strong>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {SANDBOX_PERSONAS.map((persona) => {
              const client = sandboxEnv.clients[persona.id];
              const isSelected = activePersonaId === persona.id;
              const memberRec = workspaceSnapshot?.memberships.find(
                (m) => m.userId === persona.id
              );
              const clientState = client?.getConnectionState() || 'disconnected';
              const queuedCount = client?.getPendingQueue().length || 0;

              return (
                <button
                  key={persona.id}
                  onClick={() => setActivePersonaId(persona.id)}
                  className={`text-left p-3 rounded-lg border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-teal-50/90 border-teal-600 ring-2 ring-teal-500/20'
                      : 'bg-slate-50 hover:bg-slate-100 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-bold text-slate-900 truncate">
                      {persona.displayName}
                    </span>
                    <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded-sm bg-slate-200 text-slate-800 font-semibold">
                      {memberRec?.status === 'revoked'
                        ? 'revoked'
                        : memberRec?.role || persona.defaultRole}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 truncate mt-0.5">
                    {persona.email}
                  </div>
                  <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-200/80 text-[10px] font-mono">
                    <span
                      className={
                        clientState === 'connected'
                          ? 'text-emerald-700 font-semibold'
                          : clientState === 'read-only'
                          ? 'text-blue-700 font-semibold'
                          : clientState === 'offline'
                          ? 'text-amber-700 font-semibold'
                          : 'text-rose-700 font-semibold'
                      }
                    >
                      ● {clientState}
                    </span>
                    {queuedCount > 0 && (
                      <span className="bg-amber-100 text-amber-900 px-1.5 py-0.2 rounded-sm font-semibold">
                        {queuedCount} queued
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Status Toast / Feedback Banner */}
      {statusBannerMessage && (
        <div
          className={`flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg border text-xs font-medium ${
            statusBannerMessage.tone === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : statusBannerMessage.tone === 'warning'
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : statusBannerMessage.tone === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-900'
              : 'bg-sky-50 border-sky-200 text-sky-900'
          }`}
        >
          <span>{statusBannerMessage.text}</span>
          <button
            onClick={() => setStatusBannerMessage(null)}
            className="text-xs underline opacity-75 hover:opacity-100 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 pb-2">
        {[
          {
            id: 'overview-readiness' as WorkspaceTab,
            label: 'Readiness & Security Policy',
            icon: ShieldCheck,
          },
          {
            id: 'annotations-threads' as WorkspaceTab,
            label: `Shared Annotations & Conflicts (${
              workspaceSnapshot?.annotations.filter((a) => !a.isDeletedTombstone).length ?? 0
            })`,
            icon: MessageSquare,
          },
          {
            id: 'co-review-p49' as WorkspaceTab,
            label: `Presence & P49 Co-Review (${activePresenceList.length})`,
            icon: Glasses,
          },
          {
            id: 'members-invitations' as WorkspaceTab,
            label: `Members & RBAC (${workspaceSnapshot?.memberships.length ?? 0})`,
            icon: UserPlus,
          },
          {
            id: 'offline-snapshots' as WorkspaceTab,
            label: `Offline Queue & Checkpoints (${workspaceSnapshot?.snapshots.length ?? 0})`,
            icon: History,
          },
        ].map((tab) => {
          const Icon = tab.icon;
          const isCurrent = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                isCurrent
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: Overview, Backend Readiness & Security Guard */}
      {activeTab === 'overview-readiness' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Backend Readiness Checklist */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Backend Architecture Decision Gate & Readiness Diagnostics
                </h3>
                <p className="text-xs text-slate-500">
                  Evaluated Path: <strong className="font-mono">{readinessReport.decisionPath}</strong>
                </p>
              </div>
              <span className="text-xs font-mono px-2.5 py-1 rounded-md bg-slate-100 text-slate-800 border border-slate-200">
                productionLiveReady: {String(readinessReport.productionLiveReady)}
              </span>
            </div>

            <div className="space-y-2.5">
              <div className="text-xs font-semibold text-slate-700">
                Required Prerequisites for Production Cross-Device Live Mode:
              </div>
              {readinessReport.missingPrerequisites.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-50/70 border border-amber-200 text-xs text-amber-950"
                >
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>{item}</span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Production Mode Behavior (Default)
                </div>
                <div className="text-xs font-bold text-slate-900">
                  Fails Closed (backend-not-configured)
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Blocks unauthenticated remote writes, never fabricates remote collaborators,
                  and keeps local single-user editing & P49 VR review fully functional.
                </p>
              </div>

              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Development Multi-Client Test Harness
                </div>
                <div className="text-xs font-bold text-slate-900">
                  Authoritative In-Memory Broker (Opt-In)
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Validates server-side RBAC, hashed single-use invitations, compare-and-set
                  revisions, conflict detection, and offline queue flush across multiple client
                  sessions.
                </p>
              </div>
            </div>

            {/* Cross-Discipline Non-Mutation Summary */}
            <div className="pt-3 border-t border-slate-100 space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-teal-600" />
                <span>P41–P49 Cross-Discipline Preservation Contract</span>
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Collaborative review operations synchronize shared annotations, comments,
                bookmarks, and design summaries without silently mutating P41 IFC provenance,
                P42 CAD exchange, P43 terrain elevations, P44 whole-life carbon assessments,
                P45 climate resilience scores, P46 envelope thermal metrics, P47 site logistics
                plans, or P48 AR site visualization states.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
                <div className="p-2 rounded-md bg-slate-50 border border-slate-200">
                  P41 IFC: {project.ifcInterop ? 'Preserved' : 'No Record'}
                </div>
                <div className="p-2 rounded-md bg-slate-50 border border-slate-200">
                  P44 Carbon: {project.carbonAssessment ? 'Preserved' : 'No Record'}
                </div>
                <div className="p-2 rounded-md bg-slate-50 border border-slate-200">
                  P46 Envelope: {project.envelopePerformance ? 'Preserved' : 'No Record'}
                </div>
                <div className="p-2 rounded-md bg-slate-50 border border-slate-200">
                  P49 VR Notes: {project.vrDesignReview?.annotations.length ?? 0} local
                </div>
              </div>
            </div>
          </div>

          {/* Privacy & Security Guard Panel (Section 18) */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Lock className="w-4 h-4 text-teal-700" />
              <h3 className="text-sm font-bold text-slate-900">
                Security & Privacy Guardrails
              </h3>
            </div>

            <ul className="space-y-2 text-xs text-slate-700">
              <li className="flex items-center justify-between py-1 border-b border-slate-100">
                <span>Server-Side Auth Enforced</span>
                <span className="font-mono font-semibold text-emerald-700">
                  {String(securityGuard.serverSideAuthEnforced)}
                </span>
              </li>
              <li className="flex items-center justify-between py-1 border-b border-slate-100">
                <span>Server-Side RBAC Enforced</span>
                <span className="font-mono font-semibold text-emerald-700">
                  {String(securityGuard.serverSideRbacEnforced)}
                </span>
              </li>
              <li className="flex items-center justify-between py-1 border-b border-slate-100">
                <span>Workspace Isolation Enforced</span>
                <span className="font-mono font-semibold text-emerald-700">
                  {String(securityGuard.workspaceIsolationEnforced)}
                </span>
              </li>
              <li className="flex items-center justify-between py-1 border-b border-slate-100">
                <span>Hashed Invite Tokens Only</span>
                <span className="font-mono font-semibold text-emerald-700">
                  {String(securityGuard.invitationTokenHashed)}
                </span>
              </li>
              <li className="flex items-center justify-between py-1 border-b border-slate-100">
                <span>XSS & Prototype Pollution Guard</span>
                <span className="font-mono font-semibold text-emerald-700">
                  {String(securityGuard.xssSanitizationEnforced)}
                </span>
              </li>
              <li className="flex items-center justify-between py-1 border-b border-slate-100">
                <span>Raw VR Head-Pose Streamed</span>
                <span className="font-mono font-semibold text-slate-900">
                  {String(securityGuard.rawHeadPoseTransmitted)} (Blocked)
                </span>
              </li>
              <li className="flex items-center justify-between py-1 border-b border-slate-100">
                <span>Hand-Joint / Eye Gaze Streamed</span>
                <span className="font-mono font-semibold text-slate-900">
                  {String(securityGuard.eyeGazeTelemetryTransmitted)} (Blocked)
                </span>
              </li>
              <li className="flex items-center justify-between py-1 border-b border-slate-100">
                <span>Camera / Mic Streamed</span>
                <span className="font-mono font-semibold text-slate-900">
                  {String(securityGuard.cameraOrMicrophoneTransmitted)} (Blocked)
                </span>
              </li>
              <li className="flex items-center justify-between py-1">
                <span>Presence Throttle Limit</span>
                <span className="font-mono font-semibold text-teal-700">
                  {securityGuard.presenceRateLimitHz} Hz max
                </span>
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* TAB 2: Shared Annotations, Threaded Comments & Conflict Resolution */}
      {activeTab === 'annotations-threads' && (
        <div className="space-y-6">
          {/* Conflict Resolution Alert Section */}
          {allConflicts.length > 0 && (
            <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-amber-950 font-bold text-sm">
                <GitMerge className="w-4 h-4 text-amber-700" />
                <span>
                  Active Version Conflicts Detected ({allConflicts.length}) — Silent Overwrite
                  Prevented
                </span>
              </div>
              <div className="space-y-2.5">
                {allConflicts.map(({ client, conflict }) => (
                  <div
                    key={conflict.conflictId}
                    className="bg-white rounded-lg border border-amber-200 p-3.5 space-y-2 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono font-semibold text-amber-900">
                        {conflict.reasonCode} • Entity: {conflict.targetEntityId}
                      </span>
                      <span className="font-mono text-slate-500">
                        Base Rev: {conflict.baseEntityRevision} vs Server Rev:{' '}
                        {conflict.currentServerEntityRevision}
                      </span>
                    </div>
                    <p className="text-slate-700">{conflict.message}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      <div className="p-2 rounded-md bg-slate-50 border border-slate-200">
                        <div className="font-semibold text-slate-600 mb-0.5">
                          Server Authoritative Value:
                        </div>
                        <pre className="text-[10px] font-mono whitespace-pre-wrap text-slate-800">
                          {JSON.stringify(conflict.serverAuthoritativeValue, null, 2)}
                        </pre>
                      </div>
                      <div className="p-2 rounded-md bg-amber-50/50 border border-amber-200">
                        <div className="font-semibold text-amber-900 mb-0.5">
                          Local Proposed Value:
                        </div>
                        <pre className="text-[10px] font-mono whitespace-pre-wrap text-amber-950">
                          {JSON.stringify(conflict.localProposedValue, null, 2)}
                        </pre>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pt-2">
                      <button
                        onClick={() =>
                          handleResolveConflict(client, conflict, 'keep-server-version')
                        }
                        className="px-2.5 py-1.5 rounded-md bg-slate-800 text-white font-semibold hover:bg-slate-700 cursor-pointer"
                      >
                        Keep Server Authoritative Version
                      </button>
                      <button
                        onClick={() =>
                          handleResolveConflict(client, conflict, 'reapply-local-on-latest')
                        }
                        className="px-2.5 py-1.5 rounded-md bg-teal-700 text-white font-semibold hover:bg-teal-600 cursor-pointer"
                      >
                        Reapply Local Proposal on Latest Revision
                      </button>
                      <button
                        onClick={() =>
                          handleResolveConflict(
                            client,
                            conflict,
                            'save-as-new-comment-or-note'
                          )
                        }
                        className="px-2.5 py-1.5 rounded-md bg-amber-700 text-white font-semibold hover:bg-amber-600 cursor-pointer"
                      >
                        Fork as Separate Coordination Note
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Create Shared Annotation Form */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Create Shared Model-Anchored Review Annotation
                </h3>
                <p className="text-xs text-slate-500">
                  Requires <code className="font-mono">owner</code>,{' '}
                  <code className="font-mono">editor</code>, or{' '}
                  <code className="font-mono">reviewer</code> role. Viewers and unconfigured
                  backends are rejected.
                </p>
              </div>
              {lastOperationAck && (
                <span className="text-[11px] font-mono px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200 text-slate-700">
                  Last Ack: <strong>{lastOperationAck.deliveryState}</strong> (
                  {lastOperationAck.errorCode || 'NONE'})
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Annotation Title
                </label>
                <input
                  type="text"
                  value={newAnnotationTitle}
                  onChange={(e) => setNewAnnotationTitle(e.target.value)}
                  placeholder="e.g., Check double-height living room glazing head detail"
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reviewer Priority (Non-Engineering)
                </label>
                <select
                  value={newAnnotationPriority}
                  onChange={(e) => setNewAnnotationPriority(e.target.value as any)}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical-observation">Critical Observation</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Target Floor
                </label>
                <input
                  type="number"
                  min={1}
                  max={project.floors}
                  value={newAnnotationFloor}
                  onChange={(e) => setNewAnnotationFloor(Number(e.target.value) || 1)}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 items-end">
              <div className="flex-1 w-full">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Observation Note
                </label>
                <input
                  type="text"
                  value={newAnnotationNote}
                  onChange={(e) => setNewAnnotationNote(e.target.value)}
                  placeholder="Detailed spatial or multi-discipline review note..."
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                />
              </div>
              <button
                onClick={handleCreateAnnotation}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-lg cursor-pointer shrink-0"
              >
                <Plus className="w-3.5 h-3.5 text-teal-400" />
                <span>Submit Shared Annotation</span>
              </button>
            </div>
          </div>

          {/* Shared Annotations List */}
          {!isSandboxMode ? (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center space-y-2">
              <WifiOff className="w-8 h-8 text-amber-600 mx-auto" />
              <div className="text-sm font-bold text-slate-900">
                Production Live Collaboration Backend Not Configured
              </div>
              <p className="text-xs text-slate-500 max-w-xl mx-auto">
                Click &ldquo;Launch Dev Multi-Client Test Harness (Sandbox)&rdquo; in the top
                bar to inspect and test shared annotations, threaded comments, and compare-and-set
                conflict handling across 4 collaborator roles.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {(workspaceSnapshot?.annotations || [])
                .filter((a) => !a.isDeletedTombstone)
                .map((ann) => {
                  const canEdit = canCollaboratorModifyAnnotation(
                    activeRole,
                    activePersonaId,
                    ann.authorUserId,
                    'edit'
                  );
                  const canChangeStatus = canCollaboratorModifyAnnotation(
                    activeRole,
                    activePersonaId,
                    ann.authorUserId,
                    'status-change'
                  );
                  const canDelete = canCollaboratorModifyAnnotation(
                    activeRole,
                    activePersonaId,
                    ann.authorUserId,
                    'delete'
                  );

                  return (
                    <div
                      key={ann.annotationId}
                      className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-bold text-slate-900">
                              {ann.title}
                            </span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-sm bg-teal-50 text-teal-800 border border-teal-200 font-semibold">
                              Rev #{ann.revision}
                            </span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-sm bg-slate-100 text-slate-700">
                              Status: {ann.status}
                            </span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-sm bg-amber-50 text-amber-900 border border-amber-200">
                              Priority: {ann.priority} (isVerifiedEngineeringRisk:{' '}
                              {String(ann.isVerifiedEngineeringRisk)})
                            </span>
                          </div>
                          <p className="text-xs text-slate-700">{ann.note}</p>
                          <div className="text-[11px] text-slate-500">
                            Author: <strong>{ann.authorDisplayName}</strong> ({ann.authorRole}) •
                            Floor {ann.targetFloorLevel} • Anchor:{' '}
                            <span className="font-mono">{ann.anchorResolutionStatus}</span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          {canChangeStatus && (
                            <select
                              value={ann.status}
                              onChange={(e) =>
                                handleStatusChange(
                                  ann.annotationId,
                                  ann.revision,
                                  e.target.value as any
                                )
                              }
                              aria-label="Annotation Status"
                              className="text-xs border border-slate-300 rounded-md px-2 py-1 bg-white"
                            >
                              <option value="open">open</option>
                              <option value="in-review">in-review</option>
                              <option value="resolved">resolved</option>
                              <option value="needs-reverification">
                                needs-reverification
                              </option>
                            </select>
                          )}

                          {canEdit && (
                            <button
                              onClick={() =>
                                handleSimulateConcurrentEditConflict(ann.annotationId)
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-md cursor-pointer"
                              title="Simulate two users editing this annotation simultaneously to trigger compare-and-set conflict detection"
                            >
                              <GitMerge className="w-3 h-3" />
                              <span>Test Concurrent Conflict</span>
                            </button>
                          )}

                          {canDelete && (
                            <button
                              onClick={() =>
                                handleDeleteAnnotation(ann.annotationId, ann.revision)
                              }
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md hover:bg-rose-50 cursor-pointer"
                              title="Delete Annotation (Tombstone)"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Threaded Comments */}
                      <div className="pt-2 border-t border-slate-100 space-y-2">
                        {ann.comments.length > 0 && (
                          <div className="space-y-1.5 pl-3 border-l-2 border-teal-200">
                            {ann.comments.map((cmt) => (
                              <div key={cmt.commentId} className="text-xs text-slate-700">
                                <span className="font-semibold text-slate-900">
                                  {cmt.authorDisplayName} ({cmt.authorRole}):
                                </span>{' '}
                                <span>{cmt.body}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={commentInputs[ann.annotationId] || ''}
                            onChange={(e) =>
                              setCommentInputs((prev) => ({
                                ...prev,
                                [ann.annotationId]: e.target.value,
                              }))
                            }
                            placeholder="Add threaded review comment..."
                            className="flex-1 px-3 py-1 text-xs border border-slate-200 rounded-md"
                          />
                          <button
                            onClick={() => handleAddComment(ann.annotationId, ann.revision)}
                            className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-md cursor-pointer"
                          >
                            <Send className="w-3 h-3" />
                            <span>Reply</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Ephemeral Presence & P49 Shared Viewpoints / Bookmarks */}
      {activeTab === 'co-review-p49' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Ephemeral Presence Panel */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Active Collaborator Presence (Ephemeral Lease State)
                </h3>
                <p className="text-xs text-slate-500">
                  Throttled coarse viewpoint & surface awareness. Raw VR head/hand/gaze streaming
                  is strictly disabled.
                </p>
              </div>
              <button
                onClick={handleBroadcastViewpoint}
                disabled={!isSandboxMode}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-teal-700 hover:bg-teal-600 disabled:opacity-40 text-white rounded-lg cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Broadcast My Viewpoint</span>
              </button>
            </div>

            {pendingOptInBroadcast && (
              <div className="p-3.5 rounded-lg bg-teal-50 border border-teal-200 space-y-2 text-xs">
                <div className="font-bold text-teal-950">
                  Incoming Shared Viewpoint Broadcast (Requires Explicit Opt-In):
                </div>
                <p className="text-teal-900">
                  <strong>{pendingOptInBroadcast.senderDisplayName}</strong> shared viewpoint{' '}
                  <em>&ldquo;{pendingOptInBroadcast.label}&rdquo;</em> at scale{' '}
                  <code className="font-mono">{pendingOptInBroadcast.scalePreset}</code> (
                  requiresRecipientOptIn: {String(pendingOptInBroadcast.requiresRecipientOptIn)}
                  ).
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setStatusBannerMessage({
                        text: `Adopted shared viewpoint "${pendingOptInBroadcast.label}" upon explicit user confirmation.`,
                        tone: 'success',
                      });
                      setPendingOptInBroadcast(null);
                    }}
                    className="px-3 py-1 rounded-md bg-teal-700 text-white font-semibold hover:bg-teal-600 cursor-pointer"
                  >
                    Confirm & Jump to Viewpoint
                  </button>
                  <button
                    onClick={() => setPendingOptInBroadcast(null)}
                    className="px-3 py-1 rounded-md bg-white border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 cursor-pointer"
                  >
                    Ignore (Keep Current Camera)
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-2.5">
              {activePresenceList.length === 0 ? (
                <div className="text-xs text-slate-500 py-4 text-center">
                  No active collaborator presence sessions (enable Sandbox to inspect presence).
                </div>
              ) : (
                activePresenceList.map((pres) => (
                  <div
                    key={pres.presenceId}
                    className="p-3 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: pres.badgeColorHex }}
                      />
                      <div>
                        <div className="text-xs font-bold text-slate-900">
                          {pres.displayName}{' '}
                          <span className="font-mono text-[10px] uppercase text-slate-500">
                            ({pres.role})
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-600">
                          Surface: <code className="font-mono">{pres.activeSurface}</code> •
                          Floor: {pres.activeFloorLevel} • Room:{' '}
                          {pres.selectedRoomId || 'Overview'}
                        </div>
                      </div>
                    </div>
                    <div className="text-right text-[10px] font-mono text-slate-500">
                      <div>state: {pres.activityState}</div>
                      <div>rawPose: {String(pres.privacyGuard.rawHeadPoseStreamed)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Shared P49 Bookmarks */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Shared P49 Review Bookmarks
                </h3>
                <p className="text-xs text-slate-500">
                  Synchronized viewpoint presets compatible with P49 Immersive VR Design Review.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newBookmarkLabel}
                onChange={(e) => setNewBookmarkLabel(e.target.value)}
                placeholder="New shared viewpoint bookmark title..."
                className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
              />
              <button
                onClick={handleCreateBookmark}
                disabled={!isSandboxMode}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white rounded-lg cursor-pointer"
              >
                <Bookmark className="w-3.5 h-3.5 text-teal-400" />
                <span>Add Bookmark</span>
              </button>
            </div>

            <div className="space-y-2">
              {(workspaceSnapshot?.bookmarks || [])
                .filter((b) => !b.isDeletedTombstone)
                .map((bm) => (
                  <div
                    key={bm.bookmarkId}
                    className="p-3 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-bold text-slate-900">{bm.label}</div>
                      <div className="text-[11px] text-slate-500">
                        Scale: {bm.scalePreset} • Floor: {bm.targetFloorLevel} • By:{' '}
                        {bm.authorDisplayName}
                      </div>
                    </div>
                    <span className="font-mono text-[10px] text-slate-500">
                      ({bm.cameraPositionMetres.x}m, {bm.cameraPositionMetres.y}m,{' '}
                      {bm.cameraPositionMetres.z}m)
                    </span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: Workspace Memberships, Invitations & RBAC Matrix */}
      {activeTab === 'members-invitations' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Members & Invitations */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
              Workspace Memberships & Single-Use Hashed Invitations
            </h3>

            {isSandboxMode && workspaceSnapshot ? (
              <>
                <div className="space-y-2">
                  {workspaceSnapshot.memberships.map((mem) => (
                    <div
                      key={mem.membershipId}
                      className="p-3 rounded-lg border border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <div>
                        <div className="font-bold text-slate-900">{mem.displayName}</div>
                        <div className="text-[11px] text-slate-500">
                          {mem.email} • Status: <strong>{mem.status}</strong>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={mem.role}
                          disabled={
                            !canCollaboratorPerformAction(activeRole, 'manage_member_roles') ||
                            mem.userId === workspaceSnapshot.ownerUserId
                          }
                          onChange={(e) =>
                            handleChangeMemberRole(
                              mem.userId,
                              e.target.value as CollaborationRole
                            )
                          }
                          aria-label="Member Role"
                          className="text-xs border border-slate-300 rounded-md px-2 py-1 bg-white"
                        >
                          <option value="owner">owner</option>
                          <option value="editor">editor</option>
                          <option value="reviewer">reviewer</option>
                          <option value="viewer">viewer</option>
                        </select>
                        {mem.userId !== workspaceSnapshot.ownerUserId &&
                          mem.status === 'active' &&
                          canCollaboratorPerformAction(activeRole, 'remove_member') && (
                            <button
                              onClick={() => handleRevokeMember(mem.userId)}
                              className="px-2 py-1 text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 rounded-md hover:bg-rose-100 cursor-pointer"
                            >
                              Revoke
                            </button>
                          )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Create Invite */}
                <div className="pt-3 border-t border-slate-100 space-y-2">
                  <div className="text-xs font-bold text-slate-800">
                    Issue New Single-Use Invitation (Owner Only)
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                    />
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as CollaborationRole)}
                      className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white"
                    >
                      <option value="editor">editor</option>
                      <option value="reviewer">reviewer</option>
                      <option value="viewer">viewer</option>
                    </select>
                    <button
                      onClick={handleCreateInvitation}
                      className="px-3 py-1.5 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800 cursor-pointer"
                    >
                      Create Invite
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-xs text-slate-500 py-4">
                Enable the Dev Multi-Client Sandbox to manage test memberships and invitations.
              </div>
            )}
          </div>

          {/* RBAC Matrix Reference */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-3">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
              Role-Based Access Control (RBAC) Capability Matrix
            </h3>
            <div className="space-y-2.5">
              {Object.values(COLLABORATION_ROLE_CAPABILITY_MATRIX).map((rc) => (
                <div
                  key={rc.role}
                  className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase text-slate-900">
                      {rc.label} ({rc.role})
                    </span>
                    <span className="text-[10px] font-mono text-teal-700">
                      {rc.allowedActions.length} capabilities
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600">{rc.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: Offline Queue, Reconnect & Shared Snapshots */}
      {activeTab === 'offline-snapshots' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Offline & Reconnection Controls */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
              Offline Queue & Bounded Reconnection Simulator
            </h3>
            <p className="text-xs text-slate-600">
              When a client disconnects, local operations are placed in the pending queue with{' '}
              <code className="font-mono">deliveryState: &apos;queued&apos;</code> and are never
              falsely marked <code className="font-mono">accepted</code> or{' '}
              <code className="font-mono">synchronized</code> until reconnected and acknowledged
              by the hub.
            </p>

            {isSandboxMode && activeClient ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => {
                      activeClient.simulateNetworkDisconnect();
                      setStatusBannerMessage({
                        text: `Simulated network drop for ${activeClient.identity.displayName}. New operations will queue locally.`,
                        tone: 'warning',
                      });
                      forceRefresh();
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white rounded-lg cursor-pointer"
                  >
                    <WifiOff className="w-3.5 h-3.5" />
                    <span>Simulate Network Drop (Go Offline)</span>
                  </button>

                  <button
                    onClick={() => {
                      const res = activeClient.reconnectAndSync();
                      setStatusBannerMessage({
                        text: `Reconnected (backoff ${res.backoffMs}ms) and flushed ${res.flushedResults.length} queued operation(s).`,
                        tone: 'success',
                      });
                      forceRefresh();
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg cursor-pointer"
                  >
                    <Wifi className="w-3.5 h-3.5" />
                    <span>Reconnect & Flush Pending Queue</span>
                  </button>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs font-mono space-y-1">
                  <div>Active Client State: {activeClient.getConnectionState()}</div>
                  <div>Pending Queued Operations: {activeClient.getPendingQueue().length}</div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-500">
                Launch the Dev Multi-Client Sandbox to test offline queueing and reconnection.
              </div>
            )}
          </div>

          {/* Shared Snapshots */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
              Shared Workspace Version Checkpoints
            </h3>
            {isSandboxMode && activeClient && workspaceSnapshot ? (
              <>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newSnapshotLabel}
                    onChange={(e) => setNewSnapshotLabel(e.target.value)}
                    placeholder="Checkpoint label (Owner / Editor only)..."
                    className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                  />
                  <button
                    onClick={() => {
                      const ack = activeClient.submitOperation({
                        operationType: 'snapshot:commit',
                        targetEntityId: `col-snap-${Date.now()}`,
                        baseWorkspaceRevision: workspaceSnapshot.workspaceRevision,
                        baseEntityRevision: workspaceSnapshot.snapshots.length,
                        payload: {
                          label:
                            newSnapshotLabel.trim() ||
                            `Shared Review Milestone Rev ${workspaceSnapshot.workspaceRevision}`,
                          description: 'Committed from P50 Live Collaboration Workspace.',
                        },
                      });
                      setLastOperationAck(ack);
                      if (ack.accepted) {
                        setNewSnapshotLabel('');
                        setStatusBannerMessage({
                          text: 'Committed shared workspace checkpoint.',
                          tone: 'success',
                        });
                      } else {
                        setStatusBannerMessage({
                          text: ack.errorMessage || 'Checkpoint commit rejected.',
                          tone: 'error',
                        });
                      }
                      forceRefresh();
                    }}
                    className="px-3.5 py-1.5 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800 cursor-pointer"
                  >
                    Commit Checkpoint
                  </button>
                </div>

                <div className="space-y-2">
                  {workspaceSnapshot.snapshots.map((snap) => (
                    <div
                      key={snap.snapshotId}
                      className="p-3 rounded-lg border border-slate-200 bg-slate-50 text-xs"
                    >
                      <div className="flex items-center justify-between font-bold text-slate-900">
                        <span>{snap.label}</span>
                        <span className="font-mono text-[10px] text-teal-700">
                          Workspace Rev #{snap.workspaceRevision}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Committed by {snap.committedByDisplayName} ({snap.committedByRole}) •{' '}
                        {snap.annotationCount} annotations • {snap.bookmarkCount} bookmarks
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-xs text-slate-500">
                Enable Sandbox Mode to inspect and commit shared workspace checkpoints.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
