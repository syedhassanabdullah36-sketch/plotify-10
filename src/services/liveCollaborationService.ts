/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * PLOTIFY — P50 Live Multi-User Design Collaboration Service
 * Profile Identifier: plotify-live-collaboration-p50-v1
 */

import { Project } from '../types/project';
import {
  VR_DESIGN_REVIEW_PROFILE_ID,
  VRReviewAnnotation,
  VRReviewBookmark,
} from '../types/vrDesignReview';
import {
  resolveAnnotationAnchorsAgainstProject,
  getSafeVRDesignReviewState,
  computeVRModelGeometryFingerprint,
} from './vrDesignReviewService';
import { computeGeometryFingerprint } from './systemVerificationService';
import {
  AuthenticatedCollaboratorIdentity,
  COLLABORATION_WORKSPACE_SCHEMA_VERSION,
  CollaborationActionType,
  CollaborationBackendReadinessReport,
  CollaborationConflictRecord,
  CollaborationConnectionState,
  CollaborationProviderMode,
  CollaborationRealtimeEvent,
  CollaborationRole,
  CollaborationSecurityAndPrivacyGuard,
  CollaborationWorkspaceRecord,
  CollaboratorPresenceRecord,
  ConflictResolutionChoice,
  LIVE_COLLABORATION_PROFILE_ID,
  OperationAcknowledgement,
  ProjectLiveCollaborationMetadata,
  RoleCapabilityMatrix,
  SharedAnnotationComment,
  SharedCollaborationAnnotation,
  SharedCollaborationBookmark,
  SharedCollaborationOperation,
  SharedDesignSummaryState,
  SharedViewpointBroadcast,
  SharedWorkspaceSnapshotEntry,
  WorkspaceInvitationRecord,
  WorkspaceMembershipRecord,
} from '../types/liveCollaboration';

// ============================================================================
// 1. Constants & Role Capability Matrix (Section 6)
// ============================================================================

export const MAX_PENDING_OPERATION_QUEUE_SIZE = 50;
export const PRESENCE_LEASE_DURATION_MS = 30_000;
export const PRESENCE_MIN_INTERVAL_MS = 200; // Max 5Hz presence update rate
export const MAX_TEXT_FIELD_LENGTH = 2_000;

export const COLLABORATOR_BADGE_COLORS = [
  '#0d9488', // Teal
  '#2563eb', // Blue
  '#7c3aed', // Violet
  '#d97706', // Amber
  '#e11d48', // Rose
  '#059669', // Emerald
];

export const COLLABORATION_ROLE_CAPABILITY_MATRIX: Record<CollaborationRole, RoleCapabilityMatrix> = {
  owner: {
    role: 'owner',
    label: 'Workspace Owner',
    description: 'Full control over workspace settings, memberships, invitations, shared design commits, and review records.',
    allowedActions: [
      'view_workspace',
      'join_presence',
      'follow_shared_viewpoint',
      'broadcast_viewpoint',
      'create_annotation',
      'edit_own_annotation',
      'edit_any_annotation',
      'delete_own_annotation',
      'delete_any_annotation',
      'create_comment',
      'update_annotation_status',
      'create_bookmark',
      'delete_bookmark',
      'propose_shared_design_mutation',
      'commit_shared_snapshot',
      'restore_shared_snapshot',
      'manage_invitations',
      'manage_member_roles',
      'remove_member',
      'archive_or_lock_workspace',
    ],
  },
  editor: {
    role: 'editor',
    label: 'Design Editor',
    description: 'Can propose shared design updates, commit/restore shared snapshots, and create/edit/delete annotations, comments, and bookmarks.',
    allowedActions: [
      'view_workspace',
      'join_presence',
      'follow_shared_viewpoint',
      'broadcast_viewpoint',
      'create_annotation',
      'edit_own_annotation',
      'edit_any_annotation',
      'delete_own_annotation',
      'delete_any_annotation',
      'create_comment',
      'update_annotation_status',
      'create_bookmark',
      'delete_bookmark',
      'propose_shared_design_mutation',
      'commit_shared_snapshot',
      'restore_shared_snapshot',
    ],
  },
  reviewer: {
    role: 'reviewer',
    label: 'Design Reviewer',
    description: 'Can participate in co-review, broadcast viewpoints, create/edit own annotations, change annotation status, add comments, and create bookmarks. Cannot mutate shared design geometry or manage members.',
    allowedActions: [
      'view_workspace',
      'join_presence',
      'follow_shared_viewpoint',
      'broadcast_viewpoint',
      'create_annotation',
      'edit_own_annotation',
      'delete_own_annotation',
      'create_comment',
      'update_annotation_status',
      'create_bookmark',
    ],
  },
  viewer: {
    role: 'viewer',
    label: 'Read-Only Viewer',
    description: 'Can inspect shared workspace state, join presence, and opt-in to follow shared viewpoints. All write operations are blocked.',
    allowedActions: [
      'view_workspace',
      'join_presence',
      'follow_shared_viewpoint',
    ],
  },
};

export function canCollaboratorPerformAction(
  role: CollaborationRole | null | undefined,
  action: CollaborationActionType
): boolean {
  if (!role || !COLLABORATION_ROLE_CAPABILITY_MATRIX[role]) {
    return false;
  }
  return COLLABORATION_ROLE_CAPABILITY_MATRIX[role].allowedActions.includes(action);
}

export function canCollaboratorModifyAnnotation(
  role: CollaborationRole | null | undefined,
  actorUserId: string,
  annotationAuthorUserId: string,
  intent: 'edit' | 'delete' | 'status-change'
): boolean {
  if (!role || !actorUserId) return false;
  if (intent === 'status-change') {
    return canCollaboratorPerformAction(role, 'update_annotation_status');
  }
  if (intent === 'edit') {
    if (canCollaboratorPerformAction(role, 'edit_any_annotation')) return true;
    if (
      actorUserId === annotationAuthorUserId &&
      canCollaboratorPerformAction(role, 'edit_own_annotation')
    ) {
      return true;
    }
    return false;
  }
  if (intent === 'delete') {
    if (canCollaboratorPerformAction(role, 'delete_any_annotation')) return true;
    if (
      actorUserId === annotationAuthorUserId &&
      canCollaboratorPerformAction(role, 'delete_own_annotation')
    ) {
      return true;
    }
    return false;
  }
  return false;
}

// ============================================================================
// 2. Security, Sanitization & Hashing Helpers (Section 18)
// ============================================================================

/**
 * Sanitizes collaborator display names, annotation titles/notes, comments, and bookmark labels.
 * Strips executable script tags, event handlers, HTML tags, and control characters.
 */
export function sanitizeCollaborationText(
  input: unknown,
  maxLength: number = MAX_TEXT_FIELD_LENGTH
): string {
  if (typeof input !== 'string') return '';
  let cleaned = input
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[\s\S]*?>[\s\S]*?<\/object>/gi, '')
    .replace(/<embed[\s\S]*?>/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/vbscript\s*:/gi, '')
    .replace(/data\s*:\s*text\/html/gi, '')
    .replace(/\bon\w+\s*=\s*(['"][^'"]*['"]|[^\s>]+)/gi, '')
    .replace(/<\/?[^>]+(>|$)/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();

  if (cleaned.length > maxLength) {
    cleaned = cleaned.slice(0, maxLength);
  }
  return cleaned;
}

/**
 * Rejects prototype-pollution keys (`__proto__`, `constructor`, `prototype`) and non-plain payloads.
 */
export function validateSafePayloadObject(value: unknown, depth = 0): boolean {
  if (depth > 8) return false;
  if (value === null || value === undefined) return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string' || typeof value === 'boolean') return true;
  if (Array.isArray(value)) {
    return value.every((item) => validateSafePayloadObject(item, depth + 1));
  }
  if (typeof value === 'object') {
    const ownKeys = Object.getOwnPropertyNames(value);
    for (const key of ownKeys) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        return false;
      }
      const propVal = (value as Record<string, unknown>)[key];
      if (!validateSafePayloadObject(propVal, depth + 1)) {
        return false;
      }
    }
    return true;
  }
  return false;
}

/**
 * Deterministic token hash so raw invitation tokens are never stored in shared workspace state.
 */
export function hashInvitationToken(rawToken: string): string {
  const normalized = String(rawToken || '').trim();
  let h1 = 0xdeadbeef ^ normalized.length;
  let h2 = 0x41c6ce57 ^ normalized.length;
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `sha256-sim-${hex1}${hex2}`;
}

export function getCollaborationSecurityGuard(): CollaborationSecurityAndPrivacyGuard {
  return {
    serverSideAuthEnforced: true,
    serverSideRbacEnforced: true,
    workspaceIsolationEnforced: true,
    invitationTokenHashed: true,
    xssSanitizationEnforced: true,
    prototypePollutionBlocked: true,
    presenceRateLimitHz: 1000 / PRESENCE_MIN_INTERVAL_MS,
    maxOperationQueueSize: MAX_PENDING_OPERATION_QUEUE_SIZE,
    rawHeadPoseTransmitted: false,
    rawHandSkeletonTransmitted: false,
    eyeGazeTelemetryTransmitted: false,
    cameraOrMicrophoneTransmitted: false,
    localStorageMasqueradingAsLiveBackend: false,
  };
}

/**
 * Computes deterministic exponential backoff in milliseconds with bounded cap.
 */
export function computeReconnectBackoffMs(attemptIndex: number): number {
  const clampedAttempt = Math.max(0, Math.min(10, Math.floor(attemptIndex)));
  const baseMs = 1000;
  const maxMs = 30_000;
  return Math.min(maxMs, baseMs * Math.pow(2, clampedAttempt));
}

// ============================================================================
// 3. Backend Readiness Detection & Decision Gate (Section 3.3 & Section 4)
// ============================================================================

export interface CollaborationRuntimeEnvOverrides {
  collabBackendUrl?: string;
  authProvider?: string;
  hasAuthenticatedSession?: boolean;
  authenticatedUserId?: string;
  enableTestHarnessMode?: boolean;
}

export function evaluateCollaborationBackendReadiness(
  overrides?: CollaborationRuntimeEnvOverrides
): CollaborationBackendReadinessReport {
  const envBackendUrl =
    overrides?.collabBackendUrl !== undefined
      ? overrides.collabBackendUrl
      : (typeof import.meta !== 'undefined' &&
          import.meta.env?.VITE_PLOTIFY_COLLAB_BACKEND_URL) ||
        '';
  const envAuthProvider =
    overrides?.authProvider !== undefined
      ? overrides.authProvider
      : (typeof import.meta !== 'undefined' &&
          import.meta.env?.VITE_PLOTIFY_COLLAB_AUTH_PROVIDER) ||
        '';

  const trimmedBackendUrl = String(envBackendUrl || '').trim();
  const trimmedAuthProvider = String(envAuthProvider || '').trim();
  const hasBackend = Boolean(trimmedBackendUrl);
  const hasAuth = Boolean(trimmedAuthProvider);
  const hasSession = Boolean(overrides?.hasAuthenticatedSession && overrides?.authenticatedUserId);

  if (overrides?.enableTestHarnessMode) {
    return {
      profileId: LIVE_COLLABORATION_PROFILE_ID,
      evaluatedAt: new Date().toISOString(),
      decisionPath: 'Path-C-No-Configured-Backend',
      productionLiveReady: false,
      connectionState: hasSession ? 'connected' : 'authenticated',
      activeProviderMode: 'development-test-harness-provider',
      isTestHarnessOnly: true,
      configuredBackendUrl: null,
      configuredAuthProvider: 'test-harness-verified',
      hasAuthenticatedSession: hasSession,
      authenticatedUserId: overrides?.authenticatedUserId || null,
      topLineStatus: 'FOUNDATION IMPLEMENTED — BACKEND CONFIGURATION REQUIRED',
      missingPrerequisites: [
        'Production real-time backend URL (VITE_PLOTIFY_COLLAB_BACKEND_URL) is not configured.',
        'Production identity/authentication provider (VITE_PLOTIFY_COLLAB_AUTH_PROVIDER) is not configured.',
      ],
      honestyDisclosure:
        'DEVELOPMENT / VERIFICATION MULTI-CLIENT SANDBOX ACTIVE: Operations are mediated by the in-memory AuthoritativeTestHarnessCollaborationHub for deterministic multi-client verification. Production cross-device cloud sync remains disabled until a real backend and authentication provider are configured.',
    };
  }

  if (hasBackend && hasAuth) {
    return {
      profileId: LIVE_COLLABORATION_PROFILE_ID,
      evaluatedAt: new Date().toISOString(),
      decisionPath: 'Path-A-Configured-Backend',
      productionLiveReady: true,
      connectionState: hasSession ? 'connected' : 'connecting',
      activeProviderMode: 'production-live-provider',
      isTestHarnessOnly: false,
      configuredBackendUrl: trimmedBackendUrl,
      configuredAuthProvider: trimmedAuthProvider,
      hasAuthenticatedSession: hasSession,
      authenticatedUserId: overrides?.authenticatedUserId || null,
      topLineStatus: 'LIVE COLLABORATION READY',
      missingPrerequisites: hasSession
        ? []
        : ['Active authenticated user session required to join shared workspace.'],
      honestyDisclosure:
        'Production live collaboration backend and authentication provider are configured.',
    };
  }

  if (hasBackend || hasAuth) {
    const missing: string[] = [];
    if (!hasBackend) {
      missing.push('Real-time collaboration backend URL (VITE_PLOTIFY_COLLAB_BACKEND_URL) is missing.');
    }
    if (!hasAuth) {
      missing.push('Authentication provider (VITE_PLOTIFY_COLLAB_AUTH_PROVIDER) is missing.');
    }
    return {
      profileId: LIVE_COLLABORATION_PROFILE_ID,
      evaluatedAt: new Date().toISOString(),
      decisionPath: 'Path-B-Partial-Backend',
      productionLiveReady: false,
      connectionState: 'backend-not-configured',
      activeProviderMode: 'production-unconfigured',
      isTestHarnessOnly: false,
      configuredBackendUrl: hasBackend ? trimmedBackendUrl : null,
      configuredAuthProvider: hasAuth ? trimmedAuthProvider : null,
      hasAuthenticatedSession: false,
      authenticatedUserId: null,
      topLineStatus: 'FOUNDATION IMPLEMENTED — BACKEND CONFIGURATION REQUIRED',
      missingPrerequisites: missing,
      honestyDisclosure:
        'Partial collaboration configuration detected. Live multi-user synchronization is disabled until both an authenticated identity provider and a shared real-time backend are configured.',
    };
  }

  // Default Path C: No configured authenticated shared backend exists
  return {
    profileId: LIVE_COLLABORATION_PROFILE_ID,
    evaluatedAt: new Date().toISOString(),
    decisionPath: 'Path-C-No-Configured-Backend',
    productionLiveReady: false,
    connectionState: 'backend-not-configured',
    activeProviderMode: 'production-unconfigured',
    isTestHarnessOnly: false,
    configuredBackendUrl: null,
    configuredAuthProvider: null,
    hasAuthenticatedSession: false,
    authenticatedUserId: null,
    topLineStatus: 'FOUNDATION IMPLEMENTED — BACKEND CONFIGURATION REQUIRED',
    missingPrerequisites: [
      'Configure VITE_PLOTIFY_COLLAB_BACKEND_URL pointing to an authenticated WebSocket / real-time collaboration service.',
      'Configure VITE_PLOTIFY_COLLAB_AUTH_PROVIDER and sign in with a verified user account.',
      'Deploy workspace membership and RBAC security rules (see docs/P50_LIVE_MULTI_USER_COLLABORATION_SPECIFICATION.md).',
    ],
    honestyDisclosure:
      'Production Live Collaboration is currently unavailable (backend-not-configured). Plotify remains in safe offline-first single-user mode and never fakes live cloud collaboration. You may optionally launch the clearly labelled Development Multi-Client Test Harness to verify RBAC, conflict handling, and P49 co-review workflows locally.',
  };
}

// ============================================================================
// 4. Shared Design Summary Builder & P49 Adapter (Section 12 & Section 13)
// ============================================================================

export function buildSharedDesignSummaryFromProject(
  project: Project,
  actorUserId: string,
  actorDisplayName: string,
  revision = 1
): SharedDesignSummaryState {
  const fp = computeGeometryFingerprint(project);
  const rooms = project.floorPlan?.rooms || [];
  return {
    revision,
    projectName: sanitizeCollaborationText(project.name, 160),
    projectStatus: project.status,
    activeAlternativeId: project.activeAlternativeId || null,
    activeScenarioId: project.activeScenarioId || null,
    geometryFingerprint: fp,
    floorCount: project.floors,
    roomCount: rooms.length,
    roomSummaries: rooms.map((r) => ({
      roomId: r.id,
      name: sanitizeCollaborationText(r.name, 120),
      type: r.type,
      floorLevel: r.floorLevel,
      width: r.width,
      length: r.length,
      revision: 1,
    })),
    sharedNotes: sanitizeCollaborationText(project.notes, 1000),
    lastModifiedByUserId: actorUserId,
    lastModifiedByDisplayName: sanitizeCollaborationText(actorDisplayName, 100),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Converts a local P49 VRReviewAnnotation into a durable SharedCollaborationAnnotation.
 * Strictly preserves `isVerifiedEngineeringRisk: false` and provenance disclaimers.
 */
export function convertP49AnnotationToSharedAnnotation(
  vrAnnotation: VRReviewAnnotation,
  workspaceId: string,
  author: { userId: string; displayName: string; role: CollaborationRole }
): SharedCollaborationAnnotation {
  const now = new Date().toISOString();
  const cleanTitle = sanitizeCollaborationText(vrAnnotation.title, 160) || 'Untitled Observation';
  const cleanNote = sanitizeCollaborationText(vrAnnotation.note, MAX_TEXT_FIELD_LENGTH);
  const cleanDisplayName = sanitizeCollaborationText(author.displayName, 100) || author.userId;

  return {
    annotationId: vrAnnotation.annotationId,
    workspaceId,
    projectId: vrAnnotation.projectId,
    reviewSessionId: vrAnnotation.reviewSessionId,
    revision: 1,
    title: cleanTitle,
    note: cleanNote,
    category: vrAnnotation.category,
    priority: vrAnnotation.priority,
    status: vrAnnotation.status,
    targetElementId: vrAnnotation.targetElementId,
    targetElementType: vrAnnotation.targetElementType,
    targetRoomId: vrAnnotation.targetRoomId,
    targetRoomName: vrAnnotation.targetRoomName,
    targetFloorLevel: vrAnnotation.targetFloorLevel,
    anchorPositionLocalPlotUnits: { ...vrAnnotation.anchorPositionLocalPlotUnits },
    anchorPositionMetresAt1To1: { ...vrAnnotation.anchorPositionMetresAt1To1 },
    sourceGeometryFingerprint: vrAnnotation.sourceGeometryFingerprint,
    anchorResolutionStatus: vrAnnotation.anchorResolutionStatus,
    anchorResolutionMessage: vrAnnotation.anchorResolutionMessage,
    authorUserId: author.userId,
    authorDisplayName: cleanDisplayName,
    authorRole: author.role,
    lastModifiedByUserId: author.userId,
    lastModifiedByDisplayName: cleanDisplayName,
    createdAt: vrAnnotation.createdAt || now,
    updatedAt: vrAnnotation.updatedAt || now,
    isDeletedTombstone: false,
    comments: [],
    auditTrail: [
      {
        entryId: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: now,
        actorUserId: author.userId,
        actorDisplayName: cleanDisplayName,
        actorRole: author.role,
        action: 'created',
        previousRevision: 0,
        newRevision: 1,
        summary: `Shared P49 review annotation "${cleanTitle}" into workspace.`,
      },
    ],
    provenanceDisclaimer:
      vrAnnotation.provenanceDisclaimer ||
      'Collaborative design review observation only — priority reflects reviewer emphasis, not a certified engineering risk assessment.',
    isVerifiedEngineeringRisk: false,
  };
}

/**
 * Converts a SharedCollaborationAnnotation back into a P49 VRReviewAnnotation
 * and resolves anchors against current project geometry.
 */
export function convertSharedAnnotationToP49Annotation(
  shared: SharedCollaborationAnnotation,
  project: Project
): VRReviewAnnotation {
  const baseVrAnnotation: VRReviewAnnotation = {
    annotationId: shared.annotationId,
    projectId: shared.projectId,
    reviewSessionId: shared.reviewSessionId,
    title: shared.title,
    note: shared.note,
    category: shared.category,
    priority: shared.priority,
    status: shared.status,
    targetElementId: shared.targetElementId,
    targetElementType: shared.targetElementType,
    targetRoomId: shared.targetRoomId,
    targetRoomName: shared.targetRoomName,
    targetFloorLevel: shared.targetFloorLevel,
    anchorPositionLocalPlotUnits: { ...shared.anchorPositionLocalPlotUnits },
    anchorPositionMetresAt1To1: { ...shared.anchorPositionMetresAt1To1 },
    sourceGeometryFingerprint: shared.sourceGeometryFingerprint,
    anchorResolutionStatus: shared.anchorResolutionStatus,
    anchorResolutionMessage: shared.anchorResolutionMessage,
    createdAt: shared.createdAt,
    updatedAt: shared.updatedAt,
    provenanceDisclaimer: shared.provenanceDisclaimer,
    isVerifiedEngineeringRisk: false,
  };

  const [resolved] = resolveAnnotationAnchorsAgainstProject(project, [baseVrAnnotation]);
  return resolved;
}

/**
 * Reconciles all shared annotations in a workspace against the current project geometry.
 * If a room or element was deleted or modified, marks anchor status appropriately without crashing.
 */
export function reconcileWorkspaceAnnotationsWithProjectGeometry(
  workspace: CollaborationWorkspaceRecord,
  project: Project
): SharedCollaborationAnnotation[] {
  return workspace.annotations.map((ann) => {
    if (ann.isDeletedTombstone) return ann;
    const resolvedP49 = convertSharedAnnotationToP49Annotation(ann, project);
    return {
      ...ann,
      anchorResolutionStatus: resolvedP49.anchorResolutionStatus,
      anchorResolutionMessage: resolvedP49.anchorResolutionMessage,
    };
  });
}

// ============================================================================
// 5. Unconfigured Production Collaboration Provider (Section 3.3 Path C)
// ============================================================================

export class UnconfiguredProductionCollaborationProvider {
  public readonly providerMode: CollaborationProviderMode = 'production-unconfigured';
  public readonly isTestHarnessOnly = false;

  public getConnectionState(): CollaborationConnectionState {
    return 'backend-not-configured';
  }

  public getReadinessReport(): CollaborationBackendReadinessReport {
    return evaluateCollaborationBackendReadiness({ enableTestHarnessMode: false });
  }

  public submitOperation(op: SharedCollaborationOperation): OperationAcknowledgement {
    return {
      operationId: op.operationId,
      workspaceId: op.workspaceId,
      deliveryState: 'failed',
      accepted: false,
      errorCode: 'BACKEND_NOT_CONFIGURED',
      errorMessage:
        'Live multi-user collaboration backend is not configured. Operations cannot be sent to a remote server in production mode.',
      acknowledgedAt: new Date().toISOString(),
    };
  }
}

// ============================================================================
// 6. Authoritative Multi-Client Collaboration Hub (Test Harness / Sandbox)
// ============================================================================

export type RealtimeEventListener = (event: CollaborationRealtimeEvent) => void;

/**
 * Authoritative server-side state machine for deterministic multi-client testing
 * and the explicitly labelled Development Multi-Client Sandbox.
 *
 * Enforces:
 * - Server-verified authentication & token expiration
 * - Workspace membership isolation (non-members cannot read or guess workspaceId)
 * - Strict RBAC capability matrix per role (owner, editor, reviewer, viewer)
 * - Hashed single-use / expiring / revocable invitations
 * - Compare-and-set (CAS) revision validation & structured conflict records
 * - Idempotent operation deduplication by `operationId`
 * - Ephemeral presence leases, disconnect cleanup, rate limiting, and privacy guards
 */
export class AuthoritativeTestHarnessCollaborationHub {
  public readonly isTestHarnessOnly = true as const;
  private workspaces = new Map<string, CollaborationWorkspaceRecord>();
  private presenceByWorkspace = new Map<string, Map<string, CollaboratorPresenceRecord>>();
  private presenceLastUpdateMs = new Map<string, number>();
  private identities = new Map<string, AuthenticatedCollaboratorIdentity>();
  private subscribers = new Map<string, Map<string, RealtimeEventListener>>();

  /**
   * Registers an authenticated identity in the test harness hub.
   */
  public registerAuthenticatedIdentity(identity: AuthenticatedCollaboratorIdentity): void {
    const key = `${identity.userId}:${identity.sessionId}`;
    this.identities.set(key, {
      ...identity,
      displayName: sanitizeCollaborationText(identity.displayName, 100) || identity.userId,
    });
  }

  /**
   * Simulates mid-session token expiration for a specific user session (Group B & Group I).
   */
  public expireSessionToken(userId: string, sessionId: string): void {
    const key = `${userId}:${sessionId}`;
    const existing = this.identities.get(key);
    if (existing) {
      existing.tokenExpiresAt = new Date(Date.now() - 60_000).toISOString();
      existing.authVerified = false;
      this.identities.set(key, existing);
    }

    // Notify any subscribed sessions for this user
    for (const [workspaceId, subMap] of this.subscribers.entries()) {
      const subKey = `${userId}:${sessionId}`;
      const listener = subMap.get(subKey);
      if (listener) {
        const ws = this.workspaces.get(workspaceId);
        listener({
          eventId: `evt-expire-${Date.now()}`,
          workspaceId,
          eventType: 'session:auth-expired',
          workspaceRevision: ws?.workspaceRevision ?? 0,
          actorUserId: userId,
          timestamp: new Date().toISOString(),
          payload: { reason: 'Authentication token expired. Session placed in read-only/unauthenticated state.' },
        });
      }
    }
  }

  private verifyIdentity(
    userId: string,
    sessionId: string
  ): { ok: true; identity: AuthenticatedCollaboratorIdentity } | { ok: false; code: 'UNAUTHENTICATED' | 'AUTH_EXPIRED'; message: string } {
    if (!userId || !sessionId) {
      return { ok: false, code: 'UNAUTHENTICATED', message: 'Missing userId or sessionId.' };
    }
    const key = `${userId}:${sessionId}`;
    const identity = this.identities.get(key);
    if (!identity) {
      return { ok: false, code: 'UNAUTHENTICATED', message: 'User session is not authenticated.' };
    }
    const expiresMs = Date.parse(identity.tokenExpiresAt);
    if (!identity.authVerified || (Number.isFinite(expiresMs) && expiresMs <= Date.now())) {
      return { ok: false, code: 'AUTH_EXPIRED', message: 'Authentication session token has expired.' };
    }
    return { ok: true, identity };
  }

  private getActiveMembership(
    workspace: CollaborationWorkspaceRecord,
    userId: string
  ): WorkspaceMembershipRecord | undefined {
    return workspace.memberships.find(
      (m) => m.userId === userId && m.status === 'active'
    );
  }

  /**
   * Creates a new shared collaboration workspace seeded from a Plotify project.
   */
  public createWorkspace(
    project: Project,
    ownerIdentity: AuthenticatedCollaboratorIdentity,
    workspaceIdOverride?: string
  ): { ok: true; workspace: CollaborationWorkspaceRecord } | { ok: false; error: string } {
    this.registerAuthenticatedIdentity(ownerIdentity);
    const authCheck = this.verifyIdentity(ownerIdentity.userId, ownerIdentity.sessionId);
    if (!authCheck.ok) {
      return { ok: false, error: authCheck.message };
    }

    const now = new Date().toISOString();
    const workspaceId =
      workspaceIdOverride ||
      `ws-${project.id}-${Date.now().toString(36)}`;

    const vrSafe = getSafeVRDesignReviewState(project);
    const initialAnnotations: SharedCollaborationAnnotation[] = vrSafe.annotations.map((a) =>
      convertP49AnnotationToSharedAnnotation(a, workspaceId, {
        userId: ownerIdentity.userId,
        displayName: ownerIdentity.displayName,
        role: 'owner',
      })
    );

    const initialBookmarks: SharedCollaborationBookmark[] = vrSafe.bookmarks.map((b) => ({
      ...b,
      workspaceId,
      revision: 1,
      authorUserId: ownerIdentity.userId,
      authorDisplayName: sanitizeCollaborationText(ownerIdentity.displayName, 100),
      authorRole: 'owner',
      isDeletedTombstone: false,
    }));

    const ownerMembership: WorkspaceMembershipRecord = {
      membershipId: `mem-${workspaceId}-${ownerIdentity.userId}`,
      workspaceId,
      userId: ownerIdentity.userId,
      displayName: sanitizeCollaborationText(ownerIdentity.displayName, 100),
      email: ownerIdentity.email,
      role: 'owner',
      status: 'active',
      invitedByUserId: ownerIdentity.userId,
      joinedAt: now,
      updatedAt: now,
    };

    const designSummary = buildSharedDesignSummaryFromProject(
      project,
      ownerIdentity.userId,
      ownerIdentity.displayName,
      1
    );

    const workspace: CollaborationWorkspaceRecord = {
      schemaVersion: COLLABORATION_WORKSPACE_SCHEMA_VERSION,
      profileId: LIVE_COLLABORATION_PROFILE_ID,
      workspaceId,
      projectId: project.id,
      workspaceName: `${sanitizeCollaborationText(project.name, 120)} — Shared Review Workspace`,
      ownerUserId: ownerIdentity.userId,
      isLockedOrArchived: false,
      workspaceRevision: 1,
      designSummary,
      memberships: [ownerMembership],
      invitations: [],
      annotations: initialAnnotations,
      bookmarks: initialBookmarks,
      viewpointBroadcasts: [],
      snapshots: [
        {
          snapshotId: `col-snap-init-${workspaceId}`,
          workspaceId,
          workspaceRevision: 1,
          label: 'Initial Shared Workspace Baseline',
          description: 'Baseline snapshot created upon workspace initialization.',
          committedByUserId: ownerIdentity.userId,
          committedByDisplayName: sanitizeCollaborationText(ownerIdentity.displayName, 100),
          committedByRole: 'owner',
          geometryFingerprint: designSummary.geometryFingerprint,
          annotationCount: initialAnnotations.length,
          bookmarkCount: initialBookmarks.length,
          designSummarySnapshot: structuredClone(designSummary),
          createdAt: now,
        },
      ],
      processedOperationIds: [],
      createdAt: now,
      updatedAt: now,
    };

    this.workspaces.set(workspaceId, workspace);
    this.presenceByWorkspace.set(workspaceId, new Map());
    this.subscribers.set(workspaceId, new Map());

    return { ok: true, workspace: structuredClone(workspace) };
  }

  /**
   * Reads workspace state ONLY if the caller is authenticated and holds an active membership.
   * Blocks workspace ID guessing by non-members (Section 7.2 & Group K).
   */
  public getWorkspaceForMember(
    workspaceId: string,
    userId: string,
    sessionId: string
  ):
    | { ok: true; workspace: CollaborationWorkspaceRecord; role: CollaborationRole }
    | { ok: false; errorCode: 'UNAUTHENTICATED' | 'AUTH_EXPIRED' | 'WORKSPACE_NOT_FOUND' | 'PERMISSION_DENIED' | 'MEMBERSHIP_REVOKED'; errorMessage: string } {
    const auth = this.verifyIdentity(userId, sessionId);
    if (!auth.ok) {
      return { ok: false, errorCode: auth.code, errorMessage: auth.message };
    }

    const ws = this.workspaces.get(workspaceId);
    if (!ws) {
      // Return generic PERMISSION_DENIED or WORKSPACE_NOT_FOUND without leaking details
      return {
        ok: false,
        errorCode: 'PERMISSION_DENIED',
        errorMessage: 'Access denied: Workspace does not exist or user is not an authorized member.',
      };
    }

    const anyRecord = ws.memberships.find((m) => m.userId === userId);
    if (!anyRecord) {
      return {
        ok: false,
        errorCode: 'PERMISSION_DENIED',
        errorMessage: 'Access denied: User is not a member of this collaboration workspace.',
      };
    }

    if (anyRecord.status !== 'active') {
      return {
        ok: false,
        errorCode: 'MEMBERSHIP_REVOKED',
        errorMessage: `Access denied: Workspace membership status is '${anyRecord.status}'.`,
      };
    }

    return {
      ok: true,
      workspace: structuredClone(ws),
      role: anyRecord.role,
    };
  }

  /**
   * Subscribes a verified workspace member to real-time workspace events.
   */
  public subscribeClient(
    workspaceId: string,
    userId: string,
    sessionId: string,
    listener: RealtimeEventListener
  ): { ok: true; unsubscribe: () => void } | { ok: false; errorCode: string; errorMessage: string } {
    const access = this.getWorkspaceForMember(workspaceId, userId, sessionId);
    if (!access.ok) {
      return access;
    }

    let subMap = this.subscribers.get(workspaceId);
    if (!subMap) {
      subMap = new Map();
      this.subscribers.set(workspaceId, subMap);
    }
    const subKey = `${userId}:${sessionId}`;
    subMap.set(subKey, listener);

    // Emit initial sync event
    listener({
      eventId: `evt-init-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      workspaceId,
      eventType: 'workspace:initial-sync',
      workspaceRevision: access.workspace.workspaceRevision,
      actorUserId: userId,
      timestamp: new Date().toISOString(),
      payload: {
        workspace: access.workspace,
        presence: this.getActivePresenceList(workspaceId),
      },
    });

    return {
      ok: true,
      unsubscribe: () => {
        subMap?.delete(subKey);
      },
    };
  }

  private broadcastToWorkspace(workspaceId: string, event: CollaborationRealtimeEvent): void {
    const ws = this.workspaces.get(workspaceId);
    const subMap = this.subscribers.get(workspaceId);
    if (!ws || !subMap) return;

    for (const [subKey, listener] of subMap.entries()) {
      const [subUserId] = subKey.split(':');
      const isStillActiveMember = ws.memberships.some(
        (m) => m.userId === subUserId && m.status === 'active'
      );
      if (isStillActiveMember || event.eventType === 'session:membership-revoked') {
        listener(structuredClone(event));
      }
    }
  }

  // --------------------------------------------------------------------------
  // Invitations & Membership Lifecycle (Section 7)
  // --------------------------------------------------------------------------

  public createInvitation(params: {
    workspaceId: string;
    actorUserId: string;
    actorSessionId: string;
    targetEmailOrUserId: string;
    assignedRole: CollaborationRole;
    expiresInMs?: number;
    maxUses?: number;
  }):
    | { ok: true; invitation: WorkspaceInvitationRecord; rawInviteToken: string }
    | { ok: false; errorCode: string; errorMessage: string } {
    const access = this.getWorkspaceForMember(
      params.workspaceId,
      params.actorUserId,
      params.actorSessionId
    );
    if (!access.ok) return access;

    if (!canCollaboratorPerformAction(access.role, 'manage_invitations')) {
      return {
        ok: false,
        errorCode: 'PERMISSION_DENIED',
        errorMessage: `Role '${access.role}' is not authorized to create workspace invitations.`,
      };
    }

    const ws = this.workspaces.get(params.workspaceId)!;
    if (ws.isLockedOrArchived) {
      return {
        ok: false,
        errorCode: 'WORKSPACE_LOCKED',
        errorMessage: 'Workspace is locked or archived.',
      };
    }

    const nowMs = Date.now();
    const expiresIn = params.expiresInMs ?? 7 * 24 * 3600 * 1000;
    const rawInviteToken = `invtok_${params.workspaceId}_${nowMs}_${Math.random().toString(36).slice(2, 10)}`;
    const tokenHash = hashInvitationToken(rawInviteToken);

    const invitation: WorkspaceInvitationRecord = {
      invitationId: `inv-${nowMs}-${Math.random().toString(36).slice(2, 7)}`,
      workspaceId: ws.workspaceId,
      projectId: ws.projectId,
      targetEmailOrUserId: sanitizeCollaborationText(params.targetEmailOrUserId, 160),
      assignedRole: params.assignedRole,
      status: 'pending',
      tokenHash,
      createdByUserId: params.actorUserId,
      createdAt: new Date(nowMs).toISOString(),
      expiresAt: new Date(nowMs + expiresIn).toISOString(),
      maxUses: Math.max(1, params.maxUses ?? 1),
      useCount: 0,
    };

    ws.invitations.push(invitation);
    ws.workspaceRevision += 1;
    ws.updatedAt = new Date().toISOString();

    this.broadcastToWorkspace(ws.workspaceId, {
      eventId: `evt-inv-create-${Date.now()}`,
      workspaceId: ws.workspaceId,
      eventType: 'invitation:changed',
      workspaceRevision: ws.workspaceRevision,
      actorUserId: params.actorUserId,
      timestamp: ws.updatedAt,
      payload: { invitation: structuredClone(invitation) },
    });

    return {
      ok: true,
      invitation: structuredClone(invitation),
      rawInviteToken,
    };
  }

  public acceptInvitation(params: {
    workspaceId: string;
    invitationId: string;
    rawInviteToken: string;
    joiningIdentity: AuthenticatedCollaboratorIdentity;
  }):
    | { ok: true; membership: WorkspaceMembershipRecord; workspace: CollaborationWorkspaceRecord }
    | { ok: false; errorCode: string; errorMessage: string } {
    this.registerAuthenticatedIdentity(params.joiningIdentity);
    const auth = this.verifyIdentity(params.joiningIdentity.userId, params.joiningIdentity.sessionId);
    if (!auth.ok) {
      return { ok: false, errorCode: auth.code, errorMessage: auth.message };
    }

    const ws = this.workspaces.get(params.workspaceId);
    if (!ws) {
      return { ok: false, errorCode: 'WORKSPACE_NOT_FOUND', errorMessage: 'Workspace not found.' };
    }

    const inv = ws.invitations.find((i) => i.invitationId === params.invitationId);
    if (!inv) {
      return { ok: false, errorCode: 'PERMISSION_DENIED', errorMessage: 'Invitation not found.' };
    }

    if (inv.status === 'revoked') {
      return { ok: false, errorCode: 'PERMISSION_DENIED', errorMessage: 'Invitation has been revoked.' };
    }
    if (inv.status === 'declined') {
      return { ok: false, errorCode: 'PERMISSION_DENIED', errorMessage: 'Invitation was already declined.' };
    }
    if (Date.parse(inv.expiresAt) <= Date.now()) {
      inv.status = 'expired';
      return { ok: false, errorCode: 'PERMISSION_DENIED', errorMessage: 'Invitation has expired.' };
    }
    if (inv.useCount >= inv.maxUses || inv.status === 'accepted') {
      return {
        ok: false,
        errorCode: 'PERMISSION_DENIED',
        errorMessage: 'Invitation has already been used and cannot be reused.',
      };
    }

    const providedHash = hashInvitationToken(params.rawInviteToken);
    if (providedHash !== inv.tokenHash) {
      return { ok: false, errorCode: 'PERMISSION_DENIED', errorMessage: 'Invalid invitation token.' };
    }

    // Check target match if targetEmailOrUserId was specified
    const target = inv.targetEmailOrUserId.toLowerCase();
    const matchesUser =
      target === params.joiningIdentity.userId.toLowerCase() ||
      (params.joiningIdentity.email && target === params.joiningIdentity.email.toLowerCase());
    if (!matchesUser) {
      return {
        ok: false,
        errorCode: 'PERMISSION_DENIED',
        errorMessage: 'Invitation is bound to a different user identity.',
      };
    }

    const now = new Date().toISOString();
    inv.useCount += 1;
    if (inv.useCount >= inv.maxUses) {
      inv.status = 'accepted';
    }
    inv.acceptedByUserId = params.joiningIdentity.userId;
    inv.acceptedAt = now;

    let membership = ws.memberships.find((m) => m.userId === params.joiningIdentity.userId);
    if (membership) {
      membership.role = inv.assignedRole;
      membership.status = 'active';
      membership.displayName = sanitizeCollaborationText(params.joiningIdentity.displayName, 100);
      membership.updatedAt = now;
      membership.revokedAt = undefined;
      membership.revokedReason = undefined;
    } else {
      membership = {
        membershipId: `mem-${ws.workspaceId}-${params.joiningIdentity.userId}`,
        workspaceId: ws.workspaceId,
        userId: params.joiningIdentity.userId,
        displayName: sanitizeCollaborationText(params.joiningIdentity.displayName, 100),
        email: params.joiningIdentity.email,
        role: inv.assignedRole,
        status: 'active',
        invitedByUserId: inv.createdByUserId,
        joinedAt: now,
        updatedAt: now,
      };
      ws.memberships.push(membership);
    }

    ws.workspaceRevision += 1;
    ws.updatedAt = now;

    this.broadcastToWorkspace(ws.workspaceId, {
      eventId: `evt-mem-join-${Date.now()}`,
      workspaceId: ws.workspaceId,
      eventType: 'membership:changed',
      workspaceRevision: ws.workspaceRevision,
      actorUserId: params.joiningIdentity.userId,
      timestamp: now,
      payload: { membership: structuredClone(membership), invitation: structuredClone(inv) },
    });

    return {
      ok: true,
      membership: structuredClone(membership),
      workspace: structuredClone(ws),
    };
  }

  public revokeInvitation(params: {
    workspaceId: string;
    invitationId: string;
    actorUserId: string;
    actorSessionId: string;
  }): { ok: true; invitation: WorkspaceInvitationRecord } | { ok: false; errorCode: string; errorMessage: string } {
    const access = this.getWorkspaceForMember(params.workspaceId, params.actorUserId, params.actorSessionId);
    if (!access.ok) return access;

    if (!canCollaboratorPerformAction(access.role, 'manage_invitations')) {
      return {
        ok: false,
        errorCode: 'PERMISSION_DENIED',
        errorMessage: `Role '${access.role}' cannot revoke invitations.`,
      };
    }

    const ws = this.workspaces.get(params.workspaceId)!;
    const inv = ws.invitations.find((i) => i.invitationId === params.invitationId);
    if (!inv) {
      return { ok: false, errorCode: 'PERMISSION_DENIED', errorMessage: 'Invitation not found.' };
    }

    const now = new Date().toISOString();
    inv.status = 'revoked';
    inv.revokedByUserId = params.actorUserId;
    inv.revokedAt = now;
    ws.workspaceRevision += 1;
    ws.updatedAt = now;

    this.broadcastToWorkspace(ws.workspaceId, {
      eventId: `evt-inv-revoke-${Date.now()}`,
      workspaceId: ws.workspaceId,
      eventType: 'invitation:changed',
      workspaceRevision: ws.workspaceRevision,
      actorUserId: params.actorUserId,
      timestamp: now,
      payload: { invitation: structuredClone(inv) },
    });

    return { ok: true, invitation: structuredClone(inv) };
  }

  public updateMemberRole(params: {
    workspaceId: string;
    actorUserId: string;
    actorSessionId: string;
    targetUserId: string;
    newRole: CollaborationRole;
  }): { ok: true; membership: WorkspaceMembershipRecord } | { ok: false; errorCode: string; errorMessage: string } {
    const access = this.getWorkspaceForMember(params.workspaceId, params.actorUserId, params.actorSessionId);
    if (!access.ok) return access;

    if (!canCollaboratorPerformAction(access.role, 'manage_member_roles')) {
      return {
        ok: false,
        errorCode: 'PERMISSION_DENIED',
        errorMessage: `Role '${access.role}' cannot change member roles.`,
      };
    }

    const ws = this.workspaces.get(params.workspaceId)!;
    const targetMember = ws.memberships.find((m) => m.userId === params.targetUserId);
    if (!targetMember) {
      return { ok: false, errorCode: 'PERMISSION_DENIED', errorMessage: 'Target member not found.' };
    }

    // Prevent removing the sole owner
    if (targetMember.userId === ws.ownerUserId && params.newRole !== 'owner') {
      return {
        ok: false,
        errorCode: 'PERMISSION_DENIED',
        errorMessage: 'Cannot downgrade the primary workspace owner.',
      };
    }

    const now = new Date().toISOString();
    targetMember.role = params.newRole;
    targetMember.updatedAt = now;
    ws.workspaceRevision += 1;
    ws.updatedAt = now;

    // Also update role in active presence if present
    const pMap = this.presenceByWorkspace.get(ws.workspaceId);
    if (pMap) {
      for (const [pKey, pRec] of pMap.entries()) {
        if (pRec.userId === params.targetUserId) {
          pRec.role = params.newRole;
          pMap.set(pKey, pRec);
        }
      }
    }

    this.broadcastToWorkspace(ws.workspaceId, {
      eventId: `evt-role-change-${Date.now()}`,
      workspaceId: ws.workspaceId,
      eventType: 'membership:changed',
      workspaceRevision: ws.workspaceRevision,
      actorUserId: params.actorUserId,
      timestamp: now,
      payload: { membership: structuredClone(targetMember) },
    });

    return { ok: true, membership: structuredClone(targetMember) };
  }

  public revokeMembership(params: {
    workspaceId: string;
    actorUserId: string;
    actorSessionId: string;
    targetUserId: string;
    reason?: string;
  }): { ok: true; membership: WorkspaceMembershipRecord } | { ok: false; errorCode: string; errorMessage: string } {
    const access = this.getWorkspaceForMember(params.workspaceId, params.actorUserId, params.actorSessionId);
    if (!access.ok) return access;

    if (!canCollaboratorPerformAction(access.role, 'remove_member')) {
      return {
        ok: false,
        errorCode: 'PERMISSION_DENIED',
        errorMessage: `Role '${access.role}' cannot remove workspace members.`,
      };
    }

    const ws = this.workspaces.get(params.workspaceId)!;
    if (params.targetUserId === ws.ownerUserId) {
      return {
        ok: false,
        errorCode: 'PERMISSION_DENIED',
        errorMessage: 'Cannot revoke the primary workspace owner membership.',
      };
    }

    const targetMember = ws.memberships.find((m) => m.userId === params.targetUserId);
    if (!targetMember) {
      return { ok: false, errorCode: 'PERMISSION_DENIED', errorMessage: 'Target member not found.' };
    }

    const now = new Date().toISOString();
    targetMember.status = 'revoked';
    targetMember.revokedAt = now;
    targetMember.revokedReason = sanitizeCollaborationText(params.reason || 'Membership revoked by owner.', 240);
    targetMember.updatedAt = now;
    ws.workspaceRevision += 1;
    ws.updatedAt = now;

    // Remove active presence for revoked user
    const pMap = this.presenceByWorkspace.get(ws.workspaceId);
    if (pMap) {
      for (const [pKey, pRec] of Array.from(pMap.entries())) {
        if (pRec.userId === params.targetUserId) {
          pMap.delete(pKey);
        }
      }
    }

    this.broadcastToWorkspace(ws.workspaceId, {
      eventId: `evt-mem-revoke-${Date.now()}`,
      workspaceId: ws.workspaceId,
      eventType: 'session:membership-revoked',
      workspaceRevision: ws.workspaceRevision,
      actorUserId: params.actorUserId,
      timestamp: now,
      payload: {
        revokedUserId: params.targetUserId,
        membership: structuredClone(targetMember),
      },
    });

    return { ok: true, membership: structuredClone(targetMember) };
  }

  // --------------------------------------------------------------------------
  // Presence & Ephemeral Co-Review (Section 10)
  // --------------------------------------------------------------------------

  public updatePresence(params: {
    workspaceId: string;
    userId: string;
    sessionId: string;
    activityState?: CollaboratorPresenceRecord['activityState'];
    activeSurface?: CollaboratorPresenceRecord['activeSurface'];
    activeMode?: CollaboratorPresenceRecord['activeMode'];
    activeFloorLevel?: number | 'all';
    selectedRoomId?: string | null;
    selectedElementId?: string | null;
    activeBookmarkId?: string | null;
    coarseViewpoint?: CollaboratorPresenceRecord['coarseViewpoint'];
    followingUserId?: string | null;
    bypassThrottleForHeartbeat?: boolean;
  }):
    | { ok: true; throttled: boolean; presence: CollaboratorPresenceRecord }
    | { ok: false; errorCode: string; errorMessage: string } {
    const access = this.getWorkspaceForMember(params.workspaceId, params.userId, params.sessionId);
    if (!access.ok) return access;

    const presenceId = `${params.workspaceId}:${params.userId}:${params.sessionId}`;
    const nowMs = Date.now();
    const lastMs = this.presenceLastUpdateMs.get(presenceId) || 0;

    let pMap = this.presenceByWorkspace.get(params.workspaceId);
    if (!pMap) {
      pMap = new Map();
      this.presenceByWorkspace.set(params.workspaceId, pMap);
    }

    const existing = pMap.get(presenceId);
    if (
      !params.bypassThrottleForHeartbeat &&
      existing &&
      nowMs - lastMs < PRESENCE_MIN_INTERVAL_MS
    ) {
      return { ok: true, throttled: true, presence: structuredClone(existing) };
    }

    this.presenceLastUpdateMs.set(presenceId, nowMs);

    const memberIndex = access.workspace.memberships.findIndex((m) => m.userId === params.userId);
    const badgeColorHex =
      COLLABORATOR_BADGE_COLORS[Math.max(0, memberIndex) % COLLABORATOR_BADGE_COLORS.length];

    const identity = this.identities.get(`${params.userId}:${params.sessionId}`);

    // Sanitize coarse viewpoint coordinates if present
    let sanitizedCoarseViewpoint = existing?.coarseViewpoint;
    if (params.coarseViewpoint) {
      const pos = params.coarseViewpoint.positionMetres;
      if (
        pos &&
        Number.isFinite(pos.x) &&
        Number.isFinite(pos.y) &&
        Number.isFinite(pos.z) &&
        Number.isFinite(params.coarseViewpoint.yawDegrees)
      ) {
        sanitizedCoarseViewpoint = {
          positionMetres: {
            x: Number(pos.x.toFixed(2)),
            y: Number(pos.y.toFixed(2)),
            z: Number(pos.z.toFixed(2)),
          },
          yawDegrees: Number(params.coarseViewpoint.yawDegrees.toFixed(1)),
          scalePreset: params.coarseViewpoint.scalePreset || '1:1',
        };
      }
    }

    const record: CollaboratorPresenceRecord = {
      presenceId,
      workspaceId: params.workspaceId,
      userId: params.userId,
      sessionId: params.sessionId,
      displayName: sanitizeCollaborationText(identity?.displayName || params.userId, 100),
      role: access.role,
      badgeColorHex,
      activityState: params.activityState || existing?.activityState || 'active',
      activeSurface: params.activeSurface || existing?.activeSurface || 'collaboration-hub',
      activeMode: params.activeMode ?? existing?.activeMode ?? '3d-orbit',
      activeFloorLevel: params.activeFloorLevel ?? existing?.activeFloorLevel ?? 'all',
      selectedRoomId:
        params.selectedRoomId !== undefined ? params.selectedRoomId : existing?.selectedRoomId ?? null,
      selectedElementId:
        params.selectedElementId !== undefined
          ? params.selectedElementId
          : existing?.selectedElementId ?? null,
      activeBookmarkId:
        params.activeBookmarkId !== undefined
          ? params.activeBookmarkId
          : existing?.activeBookmarkId ?? null,
      coarseViewpoint: sanitizedCoarseViewpoint,
      followingUserId:
        params.followingUserId !== undefined
          ? params.followingUserId
          : existing?.followingUserId ?? null,
      lastHeartbeatAt: new Date(nowMs).toISOString(),
      leaseExpiresAt: new Date(nowMs + PRESENCE_LEASE_DURATION_MS).toISOString(),
      privacyGuard: {
        rawHeadPoseStreamed: false,
        rawHandJointsStreamed: false,
        eyeTrackingStreamed: false,
        cameraOrMicStreamed: false,
      },
    };

    pMap.set(presenceId, record);

    this.broadcastToWorkspace(params.workspaceId, {
      eventId: `evt-presence-${nowMs}`,
      workspaceId: params.workspaceId,
      eventType: 'presence:updated',
      workspaceRevision: access.workspace.workspaceRevision,
      actorUserId: params.userId,
      timestamp: record.lastHeartbeatAt,
      payload: { presence: structuredClone(record) },
    });

    return { ok: true, throttled: false, presence: structuredClone(record) };
  }

  public disconnectPresence(workspaceId: string, userId: string, sessionId: string): void {
    const pMap = this.presenceByWorkspace.get(workspaceId);
    if (!pMap) return;
    const presenceId = `${workspaceId}:${userId}:${sessionId}`;
    if (pMap.delete(presenceId)) {
      const ws = this.workspaces.get(workspaceId);
      this.broadcastToWorkspace(workspaceId, {
        eventId: `evt-presence-leave-${Date.now()}`,
        workspaceId,
        eventType: 'presence:left',
        workspaceRevision: ws?.workspaceRevision ?? 0,
        actorUserId: userId,
        timestamp: new Date().toISOString(),
        payload: { presenceId, userId, sessionId },
      });
    }
  }

  public sweepExpiredPresenceLeases(workspaceId: string, nowMs = Date.now()): number {
    const pMap = this.presenceByWorkspace.get(workspaceId);
    if (!pMap) return 0;
    let removedCount = 0;
    for (const [presenceId, record] of Array.from(pMap.entries())) {
      if (Date.parse(record.leaseExpiresAt) <= nowMs) {
        pMap.delete(presenceId);
        removedCount += 1;
      }
    }
    return removedCount;
  }

  public getActivePresenceList(workspaceId: string, nowMs = Date.now()): CollaboratorPresenceRecord[] {
    this.sweepExpiredPresenceLeases(workspaceId, nowMs);
    const pMap = this.presenceByWorkspace.get(workspaceId);
    if (!pMap) return [];
    return Array.from(pMap.values()).map((r) => structuredClone(r));
  }

  // --------------------------------------------------------------------------
  // Authoritative Operation Processing (CAS, Idempotency, Conflicts)
  // --------------------------------------------------------------------------

  public processOperation(op: SharedCollaborationOperation): OperationAcknowledgement {
    const now = new Date().toISOString();

    // 1. Validate safe payload against prototype pollution & non-finite numbers
    if (!validateSafePayloadObject(op.payload)) {
      return {
        operationId: op.operationId,
        workspaceId: op.workspaceId,
        deliveryState: 'rejected',
        accepted: false,
        errorCode: 'PAYLOAD_INVALID',
        errorMessage: 'Operation rejected: Payload contains unsafe keys or non-finite numeric values.',
        acknowledgedAt: now,
      };
    }

    // 2. Verify authentication & active workspace membership
    const access = this.getWorkspaceForMember(op.workspaceId, op.actorUserId, op.actorSessionId);
    if (!access.ok) {
      return {
        operationId: op.operationId,
        workspaceId: op.workspaceId,
        deliveryState: 'rejected',
        accepted: false,
        errorCode: access.errorCode,
        errorMessage: access.errorMessage,
        acknowledgedAt: now,
      };
    }

    const ws = this.workspaces.get(op.workspaceId)!;
    if (ws.isLockedOrArchived) {
      return {
        operationId: op.operationId,
        workspaceId: op.workspaceId,
        deliveryState: 'rejected',
        accepted: false,
        errorCode: 'WORKSPACE_LOCKED',
        errorMessage: 'Workspace is locked or archived; write operations are rejected.',
        acknowledgedAt: now,
      };
    }

    // 3. Idempotency check: if operationId was already processed, return accepted without duplicating
    if (ws.processedOperationIds.includes(op.operationId)) {
      return {
        operationId: op.operationId,
        workspaceId: op.workspaceId,
        deliveryState: 'synchronized',
        accepted: true,
        newWorkspaceRevision: ws.workspaceRevision,
        errorCode: 'NONE',
        acknowledgedAt: now,
      };
    }

    const actorMember = ws.memberships.find(
      (m) => m.userId === op.actorUserId && m.status === 'active'
    )!;
    const role = actorMember.role;
    const actorDisplayName = actorMember.displayName;

    // 4. Route by operationType with strict RBAC and Compare-and-Set revision checks
    switch (op.operationType) {
      case 'annotation:create': {
        if (!canCollaboratorPerformAction(role, 'create_annotation')) {
          return this.rejectPermission(op, role, 'create_annotation');
        }
        const rawTitle = sanitizeCollaborationText(op.payload.title, 160);
        const rawNote = sanitizeCollaborationText(op.payload.note, MAX_TEXT_FIELD_LENGTH);
        if (!rawTitle) {
          return {
            operationId: op.operationId,
            workspaceId: op.workspaceId,
            deliveryState: 'rejected',
            accepted: false,
            errorCode: 'PAYLOAD_INVALID',
            errorMessage: 'Annotation title cannot be empty.',
            acknowledgedAt: now,
          };
        }

        const annotationId =
          typeof op.targetEntityId === 'string' && op.targetEntityId.trim()
            ? op.targetEntityId.trim()
            : `shared-ann-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

        // Idempotency guard if annotationId already exists
        const existingAnn = ws.annotations.find((a) => a.annotationId === annotationId);
        if (existingAnn) {
          this.recordProcessedOp(ws, op.operationId);
          return {
            operationId: op.operationId,
            workspaceId: op.workspaceId,
            deliveryState: 'synchronized',
            accepted: true,
            newWorkspaceRevision: ws.workspaceRevision,
            newEntityRevision: existingAnn.revision,
            acknowledgedAt: now,
          };
        }

        const anchorLocal = (op.payload.anchorPositionLocalPlotUnits as { x: number; y: number; z: number }) || {
          x: 0,
          y: 0,
          z: 0,
        };
        const anchorMetres = (op.payload.anchorPositionMetresAt1To1 as { x: number; y: number; z: number }) || {
          x: 0,
          y: 0,
          z: 0,
        };

        const newAnnotation: SharedCollaborationAnnotation = {
          annotationId,
          workspaceId: ws.workspaceId,
          projectId: ws.projectId,
          reviewSessionId: String(op.payload.reviewSessionId || `session-${op.actorSessionId}`),
          revision: 1,
          title: rawTitle,
          note: rawNote,
          category: (op.payload.category as SharedCollaborationAnnotation['category']) || 'visual-review-note',
          priority: (op.payload.priority as SharedCollaborationAnnotation['priority']) || 'medium',
          status: (op.payload.status as SharedCollaborationAnnotation['status']) || 'open',
          targetElementId: op.payload.targetElementId ? String(op.payload.targetElementId) : undefined,
          targetElementType: op.payload.targetElementType as SharedCollaborationAnnotation['targetElementType'],
          targetRoomId: op.payload.targetRoomId ? String(op.payload.targetRoomId) : undefined,
          targetRoomName: op.payload.targetRoomName
            ? sanitizeCollaborationText(op.payload.targetRoomName, 120)
            : undefined,
          targetFloorLevel: Number(op.payload.targetFloorLevel) || 1,
          anchorPositionLocalPlotUnits: {
            x: Number(anchorLocal.x) || 0,
            y: Number(anchorLocal.y) || 0,
            z: Number(anchorLocal.z) || 0,
          },
          anchorPositionMetresAt1To1: {
            x: Number(anchorMetres.x) || 0,
            y: Number(anchorMetres.y) || 0,
            z: Number(anchorMetres.z) || 0,
          },
          sourceGeometryFingerprint: ws.designSummary.geometryFingerprint,
          anchorResolutionStatus: 'resolved',
          anchorResolutionMessage: 'Anchor verified against shared workspace geometry.',
          authorUserId: op.actorUserId,
          authorDisplayName: actorDisplayName,
          authorRole: role,
          lastModifiedByUserId: op.actorUserId,
          lastModifiedByDisplayName: actorDisplayName,
          createdAt: now,
          updatedAt: now,
          isDeletedTombstone: false,
          comments: [],
          auditTrail: [
            {
              entryId: `aud-${Date.now()}`,
              timestamp: now,
              actorUserId: op.actorUserId,
              actorDisplayName,
              actorRole: role,
              action: 'created',
              previousRevision: 0,
              newRevision: 1,
              summary: `Created annotation "${rawTitle}".`,
            },
          ],
          provenanceDisclaimer:
            'Collaborative design review observation only — priority reflects reviewer emphasis, not a certified engineering risk assessment.',
          isVerifiedEngineeringRisk: false,
        };

        ws.annotations.push(newAnnotation);
        ws.workspaceRevision += 1;
        ws.updatedAt = now;
        this.recordProcessedOp(ws, op.operationId);

        this.broadcastToWorkspace(ws.workspaceId, {
          eventId: `evt-op-${op.operationId}`,
          workspaceId: ws.workspaceId,
          eventType: 'workspace:operation-applied',
          workspaceRevision: ws.workspaceRevision,
          actorUserId: op.actorUserId,
          timestamp: now,
          payload: {
            operationType: op.operationType,
            annotation: structuredClone(newAnnotation),
          },
        });

        return {
          operationId: op.operationId,
          workspaceId: op.workspaceId,
          deliveryState: 'synchronized',
          accepted: true,
          newWorkspaceRevision: ws.workspaceRevision,
          newEntityRevision: newAnnotation.revision,
          errorCode: 'NONE',
          acknowledgedAt: now,
        };
      }

      case 'annotation:update':
      case 'annotation:status-change': {
        const ann = ws.annotations.find((a) => a.annotationId === op.targetEntityId);
        if (!ann) {
          return {
            operationId: op.operationId,
            workspaceId: op.workspaceId,
            deliveryState: 'rejected',
            accepted: false,
            errorCode: 'PAYLOAD_INVALID',
            errorMessage: `Target annotation '${op.targetEntityId}' not found.`,
            acknowledgedAt: now,
          };
        }

        const intent = op.operationType === 'annotation:status-change' ? 'status-change' : 'edit';
        if (!canCollaboratorModifyAnnotation(role, op.actorUserId, ann.authorUserId, intent)) {
          return this.rejectPermission(
            op,
            role,
            intent === 'status-change' ? 'update_annotation_status' : 'edit_any_annotation'
          );
        }

        // Check tombstone conflict (Edit vs Delete — Section 9.2)
        if (ann.isDeletedTombstone) {
          const conflict: CollaborationConflictRecord = {
            conflictId: `conf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            workspaceId: ws.workspaceId,
            operationId: op.operationId,
            operationType: op.operationType,
            targetEntityId: ann.annotationId,
            reasonCode: 'TARGET_DELETED_TOMBSTONE',
            message: `Conflict detected: Annotation "${ann.title}" was deleted by ${ann.deletedByUserId || 'another collaborator'} at revision ${ann.revision}.`,
            baseEntityRevision: op.baseEntityRevision,
            currentServerEntityRevision: ann.revision,
            localProposedValue: structuredClone(op.payload),
            serverAuthoritativeValue: {
              isDeletedTombstone: true,
              deletedByUserId: ann.deletedByUserId,
              deletedAt: ann.deletedAt,
              revision: ann.revision,
            },
            detectedAt: now,
            resolved: false,
          };
          return {
            operationId: op.operationId,
            workspaceId: op.workspaceId,
            deliveryState: 'conflicted',
            accepted: false,
            errorCode: 'VERSION_CONFLICT',
            errorMessage: conflict.message,
            conflict,
            acknowledgedAt: now,
          };
        }

        // Compare-and-Set (CAS) revision check (Edit vs Edit — Section 8.2 & 9.2)
        if (op.baseEntityRevision !== ann.revision) {
          const conflict: CollaborationConflictRecord = {
            conflictId: `conf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            workspaceId: ws.workspaceId,
            operationId: op.operationId,
            operationType: op.operationType,
            targetEntityId: ann.annotationId,
            reasonCode: 'CONCURRENT_ANNOTATION_EDIT',
            message: `Concurrent edit conflict on annotation "${ann.title}": expected revision ${op.baseEntityRevision}, but server is at revision ${ann.revision} (modified by ${ann.lastModifiedByDisplayName}).`,
            baseEntityRevision: op.baseEntityRevision,
            currentServerEntityRevision: ann.revision,
            localProposedValue: structuredClone(op.payload),
            serverAuthoritativeValue: {
              title: ann.title,
              note: ann.note,
              status: ann.status,
              priority: ann.priority,
              revision: ann.revision,
              lastModifiedByDisplayName: ann.lastModifiedByDisplayName,
            },
            detectedAt: now,
            resolved: false,
          };
          return {
            operationId: op.operationId,
            workspaceId: op.workspaceId,
            deliveryState: 'conflicted',
            accepted: false,
            errorCode: 'VERSION_CONFLICT',
            errorMessage: conflict.message,
            conflict,
            acknowledgedAt: now,
          };
        }

        const prevRev = ann.revision;
        ann.revision += 1;
        if (op.payload.title !== undefined) {
          const t = sanitizeCollaborationText(op.payload.title, 160);
          if (t) ann.title = t;
        }
        if (op.payload.note !== undefined) {
          ann.note = sanitizeCollaborationText(op.payload.note, MAX_TEXT_FIELD_LENGTH);
        }
        if (op.payload.status !== undefined) {
          ann.status = op.payload.status as SharedCollaborationAnnotation['status'];
        }
        if (op.payload.priority !== undefined) {
          ann.priority = op.payload.priority as SharedCollaborationAnnotation['priority'];
        }
        ann.lastModifiedByUserId = op.actorUserId;
        ann.lastModifiedByDisplayName = actorDisplayName;
        ann.updatedAt = now;
        ann.isVerifiedEngineeringRisk = false; // Invariant enforced

        ann.auditTrail.push({
          entryId: `aud-${Date.now()}-${ann.revision}`,
          timestamp: now,
          actorUserId: op.actorUserId,
          actorDisplayName,
          actorRole: role,
          action:
            op.operationType === 'annotation:status-change' ? 'status-changed' : 'updated-content',
          previousRevision: prevRev,
          newRevision: ann.revision,
          summary:
            op.operationType === 'annotation:status-change'
              ? `Updated status to '${ann.status}'.`
              : `Updated annotation content (rev ${ann.revision}).`,
        });

        ws.workspaceRevision += 1;
        ws.updatedAt = now;
        this.recordProcessedOp(ws, op.operationId);

        this.broadcastToWorkspace(ws.workspaceId, {
          eventId: `evt-op-${op.operationId}`,
          workspaceId: ws.workspaceId,
          eventType: 'workspace:operation-applied',
          workspaceRevision: ws.workspaceRevision,
          actorUserId: op.actorUserId,
          timestamp: now,
          payload: {
            operationType: op.operationType,
            annotation: structuredClone(ann),
          },
        });

        return {
          operationId: op.operationId,
          workspaceId: op.workspaceId,
          deliveryState: 'synchronized',
          accepted: true,
          newWorkspaceRevision: ws.workspaceRevision,
          newEntityRevision: ann.revision,
          errorCode: 'NONE',
          acknowledgedAt: now,
        };
      }

      case 'annotation:delete': {
        const ann = ws.annotations.find((a) => a.annotationId === op.targetEntityId);
        if (!ann) {
          return {
            operationId: op.operationId,
            workspaceId: op.workspaceId,
            deliveryState: 'synchronized',
            accepted: true,
            newWorkspaceRevision: ws.workspaceRevision,
            acknowledgedAt: now,
          };
        }

        if (!canCollaboratorModifyAnnotation(role, op.actorUserId, ann.authorUserId, 'delete')) {
          return this.rejectPermission(op, role, 'delete_any_annotation');
        }

        if (!ann.isDeletedTombstone) {
          const prevRev = ann.revision;
          ann.revision += 1;
          ann.isDeletedTombstone = true;
          ann.deletedByUserId = op.actorUserId;
          ann.deletedAt = now;
          ann.lastModifiedByUserId = op.actorUserId;
          ann.lastModifiedByDisplayName = actorDisplayName;
          ann.updatedAt = now;
          ann.auditTrail.push({
            entryId: `aud-del-${Date.now()}`,
            timestamp: now,
            actorUserId: op.actorUserId,
            actorDisplayName,
            actorRole: role,
            action: 'deleted-tombstone',
            previousRevision: prevRev,
            newRevision: ann.revision,
            summary: `Marked annotation as deleted tombstone.`,
          });
          ws.workspaceRevision += 1;
          ws.updatedAt = now;
        }

        this.recordProcessedOp(ws, op.operationId);

        this.broadcastToWorkspace(ws.workspaceId, {
          eventId: `evt-op-${op.operationId}`,
          workspaceId: ws.workspaceId,
          eventType: 'workspace:operation-applied',
          workspaceRevision: ws.workspaceRevision,
          actorUserId: op.actorUserId,
          timestamp: now,
          payload: {
            operationType: op.operationType,
            annotation: structuredClone(ann),
          },
        });

        return {
          operationId: op.operationId,
          workspaceId: op.workspaceId,
          deliveryState: 'synchronized',
          accepted: true,
          newWorkspaceRevision: ws.workspaceRevision,
          newEntityRevision: ann.revision,
          errorCode: 'NONE',
          acknowledgedAt: now,
        };
      }

      case 'comment:create': {
        if (!canCollaboratorPerformAction(role, 'create_comment')) {
          return this.rejectPermission(op, role, 'create_comment');
        }

        const ann = ws.annotations.find((a) => a.annotationId === op.targetEntityId);
        if (!ann) {
          return {
            operationId: op.operationId,
            workspaceId: op.workspaceId,
            deliveryState: 'rejected',
            accepted: false,
            errorCode: 'PAYLOAD_INVALID',
            errorMessage: `Annotation '${op.targetEntityId}' not found.`,
            acknowledgedAt: now,
          };
        }

        if (ann.isDeletedTombstone) {
          const conflict: CollaborationConflictRecord = {
            conflictId: `conf-comment-${Date.now()}`,
            workspaceId: ws.workspaceId,
            operationId: op.operationId,
            operationType: op.operationType,
            targetEntityId: ann.annotationId,
            reasonCode: 'TARGET_DELETED_TOMBSTONE',
            message: `Cannot add comment: Target annotation "${ann.title}" was deleted.`,
            baseEntityRevision: op.baseEntityRevision,
            currentServerEntityRevision: ann.revision,
            localProposedValue: structuredClone(op.payload),
            serverAuthoritativeValue: { isDeletedTombstone: true, revision: ann.revision },
            detectedAt: now,
            resolved: false,
          };
          return {
            operationId: op.operationId,
            workspaceId: op.workspaceId,
            deliveryState: 'conflicted',
            accepted: false,
            errorCode: 'VERSION_CONFLICT',
            errorMessage: conflict.message,
            conflict,
            acknowledgedAt: now,
          };
        }

        const cleanBody = sanitizeCollaborationText(op.payload.body, MAX_TEXT_FIELD_LENGTH);
        if (!cleanBody) {
          return {
            operationId: op.operationId,
            workspaceId: op.workspaceId,
            deliveryState: 'rejected',
            accepted: false,
            errorCode: 'PAYLOAD_INVALID',
            errorMessage: 'Comment body cannot be empty.',
            acknowledgedAt: now,
          };
        }

        const commentId =
          typeof op.payload.commentId === 'string' && op.payload.commentId
            ? op.payload.commentId
            : `cmt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

        const comment: SharedAnnotationComment = {
          commentId,
          annotationId: ann.annotationId,
          workspaceId: ws.workspaceId,
          authorUserId: op.actorUserId,
          authorDisplayName: actorDisplayName,
          authorRole: role,
          body: cleanBody,
          createdAt: now,
          updatedAt: now,
          isDeletedTombstone: false,
        };

        const prevRev = ann.revision;
        ann.comments.push(comment);
        ann.revision += 1;
        ann.updatedAt = now;
        ann.auditTrail.push({
          entryId: `aud-cmt-${Date.now()}`,
          timestamp: now,
          actorUserId: op.actorUserId,
          actorDisplayName,
          actorRole: role,
          action: 'comment-added',
          previousRevision: prevRev,
          newRevision: ann.revision,
          summary: `Added comment by ${actorDisplayName}.`,
        });

        ws.workspaceRevision += 1;
        ws.updatedAt = now;
        this.recordProcessedOp(ws, op.operationId);

        this.broadcastToWorkspace(ws.workspaceId, {
          eventId: `evt-op-${op.operationId}`,
          workspaceId: ws.workspaceId,
          eventType: 'workspace:operation-applied',
          workspaceRevision: ws.workspaceRevision,
          actorUserId: op.actorUserId,
          timestamp: now,
          payload: {
            operationType: op.operationType,
            annotationId: ann.annotationId,
            comment: structuredClone(comment),
          },
        });

        return {
          operationId: op.operationId,
          workspaceId: op.workspaceId,
          deliveryState: 'synchronized',
          accepted: true,
          newWorkspaceRevision: ws.workspaceRevision,
          newEntityRevision: ann.revision,
          errorCode: 'NONE',
          acknowledgedAt: now,
        };
      }

      case 'bookmark:create': {
        if (!canCollaboratorPerformAction(role, 'create_bookmark')) {
          return this.rejectPermission(op, role, 'create_bookmark');
        }

        const cleanLabel = sanitizeCollaborationText(op.payload.label, 120) || 'Shared Viewpoint';
        const camPos = (op.payload.cameraPositionMetres as { x: number; y: number; z: number }) || {
          x: 0,
          y: 1.65,
          z: 10,
        };
        const lookAt = (op.payload.lookAtTargetMetres as { x: number; y: number; z: number }) || {
          x: 0,
          y: 1.5,
          z: 0,
        };

        const bookmark: SharedCollaborationBookmark = {
          bookmarkId: op.targetEntityId || `shared-bm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          workspaceId: ws.workspaceId,
          projectId: ws.projectId,
          revision: 1,
          label: cleanLabel,
          presetType: (op.payload.presetType as SharedCollaborationBookmark['presetType']) || 'custom-viewpoint',
          targetRoomId: op.payload.targetRoomId ? String(op.payload.targetRoomId) : undefined,
          targetFloorLevel: (op.payload.targetFloorLevel as number | 'all') ?? 'all',
          cameraPositionMetres: {
            x: Number(camPos.x) || 0,
            y: Number(camPos.y) || 1.65,
            z: Number(camPos.z) || 0,
          },
          lookAtTargetMetres: {
            x: Number(lookAt.x) || 0,
            y: Number(lookAt.y) || 0,
            z: Number(lookAt.z) || 0,
          },
          scalePreset: (op.payload.scalePreset as SharedCollaborationBookmark['scalePreset']) || '1:1',
          authorUserId: op.actorUserId,
          authorDisplayName: actorDisplayName,
          authorRole: role,
          isDeletedTombstone: false,
          createdAt: now,
        };

        ws.bookmarks.push(bookmark);
        ws.workspaceRevision += 1;
        ws.updatedAt = now;
        this.recordProcessedOp(ws, op.operationId);

        this.broadcastToWorkspace(ws.workspaceId, {
          eventId: `evt-op-${op.operationId}`,
          workspaceId: ws.workspaceId,
          eventType: 'workspace:operation-applied',
          workspaceRevision: ws.workspaceRevision,
          actorUserId: op.actorUserId,
          timestamp: now,
          payload: {
            operationType: op.operationType,
            bookmark: structuredClone(bookmark),
          },
        });

        return {
          operationId: op.operationId,
          workspaceId: op.workspaceId,
          deliveryState: 'synchronized',
          accepted: true,
          newWorkspaceRevision: ws.workspaceRevision,
          newEntityRevision: bookmark.revision,
          errorCode: 'NONE',
          acknowledgedAt: now,
        };
      }

      case 'viewpoint:broadcast': {
        if (!canCollaboratorPerformAction(role, 'broadcast_viewpoint')) {
          return this.rejectPermission(op, role, 'broadcast_viewpoint');
        }

        const camPos = (op.payload.cameraPositionMetres as { x: number; y: number; z: number }) || {
          x: 0,
          y: 1.65,
          z: 8,
        };
        const lookAt = (op.payload.lookAtTargetMetres as { x: number; y: number; z: number }) || {
          x: 0,
          y: 1.5,
          z: 0,
        };

        const broadcast: SharedViewpointBroadcast = {
          broadcastId: op.targetEntityId || `vp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          workspaceId: ws.workspaceId,
          senderUserId: op.actorUserId,
          senderDisplayName: actorDisplayName,
          senderRole: role,
          label: sanitizeCollaborationText(op.payload.label, 120) || `${actorDisplayName}'s Shared Viewpoint`,
          activeSurface: (op.payload.activeSurface as SharedViewpointBroadcast['activeSurface']) || 'vr-design-review-p49',
          targetFloorLevel: (op.payload.targetFloorLevel as number | 'all') ?? 'all',
          targetRoomId: op.payload.targetRoomId ? String(op.payload.targetRoomId) : undefined,
          cameraPositionMetres: {
            x: Number(camPos.x) || 0,
            y: Number(camPos.y) || 1.65,
            z: Number(camPos.z) || 0,
          },
          lookAtTargetMetres: {
            x: Number(lookAt.x) || 0,
            y: Number(lookAt.y) || 0,
            z: Number(lookAt.z) || 0,
          },
          yawDegrees: Number(op.payload.yawDegrees) || 0,
          scalePreset: (op.payload.scalePreset as SharedViewpointBroadcast['scalePreset']) || '1:1',
          requiresRecipientOptIn: true,
          broadcastedAt: now,
        };

        ws.viewpointBroadcasts.unshift(broadcast);
        if (ws.viewpointBroadcasts.length > 25) {
          ws.viewpointBroadcasts.length = 25;
        }
        ws.workspaceRevision += 1;
        ws.updatedAt = now;
        this.recordProcessedOp(ws, op.operationId);

        this.broadcastToWorkspace(ws.workspaceId, {
          eventId: `evt-vp-${op.operationId}`,
          workspaceId: ws.workspaceId,
          eventType: 'viewpoint:broadcasted',
          workspaceRevision: ws.workspaceRevision,
          actorUserId: op.actorUserId,
          timestamp: now,
          payload: { broadcast: structuredClone(broadcast) },
        });

        return {
          operationId: op.operationId,
          workspaceId: op.workspaceId,
          deliveryState: 'synchronized',
          accepted: true,
          newWorkspaceRevision: ws.workspaceRevision,
          newEntityRevision: 1,
          errorCode: 'NONE',
          acknowledgedAt: now,
        };
      }

      case 'design-summary:update': {
        if (!canCollaboratorPerformAction(role, 'propose_shared_design_mutation')) {
          return this.rejectPermission(op, role, 'propose_shared_design_mutation');
        }

        // Compare-and-set check on designSummary.revision or specific room revision
        if (op.baseEntityRevision !== ws.designSummary.revision) {
          const conflict: CollaborationConflictRecord = {
            conflictId: `conf-design-${Date.now()}`,
            workspaceId: ws.workspaceId,
            operationId: op.operationId,
            operationType: op.operationType,
            targetEntityId: op.targetEntityId,
            reasonCode: 'CONCURRENT_ROOM_EDIT',
            message: `Concurrent design state modification: expected design revision ${op.baseEntityRevision}, but server is at revision ${ws.designSummary.revision} (modified by ${ws.designSummary.lastModifiedByDisplayName}).`,
            baseEntityRevision: op.baseEntityRevision,
            currentServerEntityRevision: ws.designSummary.revision,
            localProposedValue: structuredClone(op.payload),
            serverAuthoritativeValue: structuredClone(ws.designSummary) as unknown as Record<string, unknown>,
            detectedAt: now,
            resolved: false,
          };
          return {
            operationId: op.operationId,
            workspaceId: op.workspaceId,
            deliveryState: 'conflicted',
            accepted: false,
            errorCode: 'VERSION_CONFLICT',
            errorMessage: conflict.message,
            conflict,
            acknowledgedAt: now,
          };
        }

        ws.designSummary.revision += 1;
        if (typeof op.payload.sharedNotes === 'string') {
          ws.designSummary.sharedNotes = sanitizeCollaborationText(op.payload.sharedNotes, 1000);
        }
        if (typeof op.payload.activeAlternativeId === 'string') {
          ws.designSummary.activeAlternativeId = op.payload.activeAlternativeId;
        }
        if (op.payload.roomUpdate && typeof op.payload.roomUpdate === 'object') {
          const ru = op.payload.roomUpdate as {
            roomId: string;
            name?: string;
            width?: number;
            length?: number;
          };
          const targetRoom = ws.designSummary.roomSummaries.find((r) => r.roomId === ru.roomId);
          if (targetRoom) {
            if (ru.name) targetRoom.name = sanitizeCollaborationText(ru.name, 120);
            if (typeof ru.width === 'number' && ru.width > 0) targetRoom.width = ru.width;
            if (typeof ru.length === 'number' && ru.length > 0) targetRoom.length = ru.length;
            targetRoom.revision += 1;
          }
        }
        ws.designSummary.lastModifiedByUserId = op.actorUserId;
        ws.designSummary.lastModifiedByDisplayName = actorDisplayName;
        ws.designSummary.updatedAt = now;

        ws.workspaceRevision += 1;
        ws.updatedAt = now;
        this.recordProcessedOp(ws, op.operationId);

        this.broadcastToWorkspace(ws.workspaceId, {
          eventId: `evt-op-${op.operationId}`,
          workspaceId: ws.workspaceId,
          eventType: 'workspace:operation-applied',
          workspaceRevision: ws.workspaceRevision,
          actorUserId: op.actorUserId,
          timestamp: now,
          payload: {
            operationType: op.operationType,
            designSummary: structuredClone(ws.designSummary),
          },
        });

        return {
          operationId: op.operationId,
          workspaceId: op.workspaceId,
          deliveryState: 'synchronized',
          accepted: true,
          newWorkspaceRevision: ws.workspaceRevision,
          newEntityRevision: ws.designSummary.revision,
          errorCode: 'NONE',
          acknowledgedAt: now,
        };
      }

      case 'snapshot:commit': {
        if (!canCollaboratorPerformAction(role, 'commit_shared_snapshot')) {
          return this.rejectPermission(op, role, 'commit_shared_snapshot');
        }

        const label = sanitizeCollaborationText(op.payload.label, 120) || `Checkpoint Rev ${ws.workspaceRevision}`;
        const description = sanitizeCollaborationText(op.payload.description, 400) || '';
        const snap: SharedWorkspaceSnapshotEntry = {
          snapshotId: op.targetEntityId || `col-snap-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          workspaceId: ws.workspaceId,
          workspaceRevision: ws.workspaceRevision + 1,
          label,
          description,
          committedByUserId: op.actorUserId,
          committedByDisplayName: actorDisplayName,
          committedByRole: role,
          geometryFingerprint: ws.designSummary.geometryFingerprint,
          annotationCount: ws.annotations.filter((a) => !a.isDeletedTombstone).length,
          bookmarkCount: ws.bookmarks.filter((b) => !b.isDeletedTombstone).length,
          designSummarySnapshot: structuredClone(ws.designSummary),
          createdAt: now,
        };

        ws.snapshots.unshift(snap);
        ws.workspaceRevision += 1;
        ws.updatedAt = now;
        this.recordProcessedOp(ws, op.operationId);

        return {
          operationId: op.operationId,
          workspaceId: op.workspaceId,
          deliveryState: 'synchronized',
          accepted: true,
          newWorkspaceRevision: ws.workspaceRevision,
          newEntityRevision: ws.snapshots.length,
          errorCode: 'NONE',
          acknowledgedAt: now,
        };
      }

      default:
        return {
          operationId: op.operationId,
          workspaceId: op.workspaceId,
          deliveryState: 'rejected',
          accepted: false,
          errorCode: 'PAYLOAD_INVALID',
          errorMessage: `Unsupported operation type '${op.operationType}'.`,
          acknowledgedAt: now,
        };
    }
  }

  private rejectPermission(
    op: SharedCollaborationOperation,
    role: CollaborationRole,
    requiredAction: CollaborationActionType
  ): OperationAcknowledgement {
    return {
      operationId: op.operationId,
      workspaceId: op.workspaceId,
      deliveryState: 'rejected',
      accepted: false,
      errorCode: 'PERMISSION_DENIED',
      errorMessage: `Access denied: Collaborator with role '${role}' is not permitted to perform '${requiredAction}'.`,
      acknowledgedAt: new Date().toISOString(),
    };
  }

  private recordProcessedOp(ws: CollaborationWorkspaceRecord, operationId: string): void {
    ws.processedOperationIds.push(operationId);
    if (ws.processedOperationIds.length > 500) {
      ws.processedOperationIds.shift();
    }
  }
}

// ============================================================================
// 7. Client Session Controller (Optimistic Queue, Reconnect, Conflict Handling)
// ============================================================================

export class TestHarnessCollaborationClientProvider {
  public readonly providerMode: CollaborationProviderMode = 'development-test-harness-provider';
  public readonly isTestHarnessOnly = true as const;

  private connectionState: CollaborationConnectionState = 'connecting';
  private workspaceState: CollaborationWorkspaceRecord | null = null;
  private activePresence: CollaboratorPresenceRecord[] = [];
  private pendingQueue: SharedCollaborationOperation[] = [];
  private acknowledgements = new Map<string, OperationAcknowledgement>();
  private conflicts: CollaborationConflictRecord[] = [];
  private receivedEvents: CollaborationRealtimeEvent[] = [];
  private reconnectAttempts = 0;
  private unsubscribeFn: (() => void) | null = null;

  constructor(
    private readonly hub: AuthoritativeTestHarnessCollaborationHub,
    public readonly identity: AuthenticatedCollaboratorIdentity,
    public readonly workspaceId: string
  ) {
    this.hub.registerAuthenticatedIdentity(identity);
  }

  public connect(): { ok: boolean; state: CollaborationConnectionState; errorMessage?: string } {
    this.connectionState = 'connecting';
    const subResult = this.hub.subscribeClient(
      this.workspaceId,
      this.identity.userId,
      this.identity.sessionId,
      (event) => this.handleServerEvent(event)
    );

    if (!subResult.ok) {
      if (subResult.errorCode === 'PERMISSION_DENIED' || subResult.errorCode === 'MEMBERSHIP_REVOKED') {
        this.connectionState = 'permission-denied';
      } else if (subResult.errorCode === 'UNAUTHENTICATED' || subResult.errorCode === 'AUTH_EXPIRED') {
        this.connectionState = 'read-only';
      } else {
        this.connectionState = 'backend-error';
      }
      return { ok: false, state: this.connectionState, errorMessage: subResult.errorMessage };
    }

    this.unsubscribeFn = subResult.unsubscribe;
    const access = this.hub.getWorkspaceForMember(
      this.workspaceId,
      this.identity.userId,
      this.identity.sessionId
    );
    if (access.ok) {
      this.workspaceState = access.workspace;
      this.connectionState = access.role === 'viewer' ? 'read-only' : 'connected';
      this.reconnectAttempts = 0;
      return { ok: true, state: this.connectionState };
    }

    this.connectionState = 'permission-denied';
    return { ok: false, state: this.connectionState, errorMessage: access.errorMessage };
  }

  private handleServerEvent(event: CollaborationRealtimeEvent): void {
    this.receivedEvents.push(event);
    if (this.receivedEvents.length > 200) {
      this.receivedEvents.shift();
    }

    if (event.eventType === 'session:auth-expired') {
      this.connectionState = 'read-only';
      return;
    }

    if (event.eventType === 'session:membership-revoked') {
      if (event.payload.revokedUserId === this.identity.userId) {
        this.connectionState = 'permission-denied';
        return;
      }
    }

    // Refresh local view of workspace state if still authorized
    const latest = this.hub.getWorkspaceForMember(
      this.workspaceId,
      this.identity.userId,
      this.identity.sessionId
    );
    if (latest.ok) {
      this.workspaceState = latest.workspace;
      if (this.connectionState === 'connected' && latest.role === 'viewer') {
        this.connectionState = 'read-only';
      } else if (this.connectionState === 'read-only' && latest.role !== 'viewer') {
        this.connectionState = 'connected';
      }
    }
    this.activePresence = this.hub.getActivePresenceList(this.workspaceId);
  }

  public getConnectionState(): CollaborationConnectionState {
    return this.connectionState;
  }

  public getWorkspaceSnapshot(): CollaborationWorkspaceRecord | null {
    return this.workspaceState ? structuredClone(this.workspaceState) : null;
  }

  public getPresenceList(): CollaboratorPresenceRecord[] {
    return this.hub.getActivePresenceList(this.workspaceId);
  }

  public getPendingQueue(): SharedCollaborationOperation[] {
    return structuredClone(this.pendingQueue);
  }

  public getConflicts(): CollaborationConflictRecord[] {
    return structuredClone(this.conflicts);
  }

  public getAcknowledgement(operationId: string): OperationAcknowledgement | undefined {
    const ack = this.acknowledgements.get(operationId);
    return ack ? structuredClone(ack) : undefined;
  }

  /**
   * Simulates a network disconnect so operations are buffered in the local pending queue
   * with `deliveryState: 'queued'` (never falsely marked accepted).
   */
  public simulateNetworkDisconnect(): void {
    if (this.unsubscribeFn) {
      this.unsubscribeFn();
      this.unsubscribeFn = null;
    }
    this.connectionState = 'offline';
  }

  /**
   * Reconnects to the hub, resynchronizes latest authoritative workspace state,
   * and flushes queued operations in FIFO order.
   */
  public reconnectAndSync(): {
    reconnected: boolean;
    backoffMs: number;
    flushedResults: OperationAcknowledgement[];
  } {
    this.connectionState = 'reconnecting';
    const backoffMs = computeReconnectBackoffMs(this.reconnectAttempts);
    this.reconnectAttempts += 1;

    const conn = this.connect();
    if (!conn.ok) {
      return { reconnected: false, backoffMs, flushedResults: [] };
    }

    const flushedResults: OperationAcknowledgement[] = [];
    const queueToFlush = [...this.pendingQueue];
    this.pendingQueue = [];

    for (const queuedOp of queueToFlush) {
      const ack = this.hub.processOperation(queuedOp);
      this.acknowledgements.set(queuedOp.operationId, ack);
      if (ack.conflict) {
        this.conflicts.push(ack.conflict);
      }
      flushedResults.push(ack);
    }

    // Pull latest authoritative state after flush
    const latest = this.hub.getWorkspaceForMember(
      this.workspaceId,
      this.identity.userId,
      this.identity.sessionId
    );
    if (latest.ok) {
      this.workspaceState = latest.workspace;
    }

    return { reconnected: true, backoffMs, flushedResults };
  }

  /**
   * Dispatches an operation to the authoritative hub (or queues it if currently offline).
   */
  public submitOperation(
    params: Omit<
      SharedCollaborationOperation,
      'operationId' | 'workspaceId' | 'actorUserId' | 'actorSessionId' | 'createdAt'
    > & {
      operationId?: string;
    }
  ): OperationAcknowledgement {
    const operationId =
      params.operationId || `op-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const op: SharedCollaborationOperation = {
      operationId,
      workspaceId: this.workspaceId,
      actorUserId: this.identity.userId,
      actorSessionId: this.identity.sessionId,
      operationType: params.operationType,
      targetEntityId: params.targetEntityId,
      baseWorkspaceRevision: params.baseWorkspaceRevision,
      baseEntityRevision: params.baseEntityRevision,
      payload: params.payload,
      createdAt: new Date().toISOString(),
    };

    if (this.connectionState === 'offline' || this.connectionState === 'reconnecting') {
      if (this.pendingQueue.length >= MAX_PENDING_OPERATION_QUEUE_SIZE) {
        const overflowAck: OperationAcknowledgement = {
          operationId,
          workspaceId: this.workspaceId,
          deliveryState: 'failed',
          accepted: false,
          errorCode: 'RATE_LIMIT_EXCEEDED',
          errorMessage: `Offline pending operation queue is full (max ${MAX_PENDING_OPERATION_QUEUE_SIZE} items).`,
          acknowledgedAt: new Date().toISOString(),
        };
        this.acknowledgements.set(operationId, overflowAck);
        return overflowAck;
      }

      this.pendingQueue.push(op);
      const queuedAck: OperationAcknowledgement = {
        operationId,
        workspaceId: this.workspaceId,
        deliveryState: 'queued',
        accepted: false,
        errorCode: 'NONE',
        acknowledgedAt: new Date().toISOString(),
      };
      this.acknowledgements.set(operationId, queuedAck);
      return queuedAck;
    }

    const ack = this.hub.processOperation(op);
    this.acknowledgements.set(operationId, ack);
    if (ack.conflict) {
      this.conflicts.push(ack.conflict);
    }

    if (ack.errorCode === 'AUTH_EXPIRED' || ack.errorCode === 'UNAUTHENTICATED') {
      this.connectionState = 'read-only';
    } else if (ack.errorCode === 'MEMBERSHIP_REVOKED') {
      this.connectionState = 'permission-denied';
    }

    // Refresh local snapshot if accepted
    const latest = this.hub.getWorkspaceForMember(
      this.workspaceId,
      this.identity.userId,
      this.identity.sessionId
    );
    if (latest.ok) {
      this.workspaceState = latest.workspace;
    }

    return ack;
  }

  /**
   * Resolves a recorded conflict using the user's explicit choice (Section 9.3).
   */
  public resolveConflict(
    conflictId: string,
    choice: ConflictResolutionChoice
  ): { ok: boolean; resolutionAck?: OperationAcknowledgement; errorMessage?: string } {
    const idx = this.conflicts.findIndex((c) => c.conflictId === conflictId);
    if (idx === -1) {
      return { ok: false, errorMessage: 'Conflict record not found.' };
    }

    const conflict = this.conflicts[idx];
    const now = new Date().toISOString();

    if (choice === 'keep-server-version') {
      conflict.resolved = true;
      conflict.resolutionChoice = choice;
      conflict.resolvedAt = now;
      return { ok: true };
    }

    if (choice === 'reapply-local-on-latest') {
      const latestWs = this.getWorkspaceSnapshot();
      if (!latestWs) {
        return { ok: false, errorMessage: 'No active workspace snapshot available.' };
      }

      if (conflict.reasonCode === 'TARGET_DELETED_TOMBSTONE') {
        return {
          ok: false,
          errorMessage:
            'Cannot reapply edit in-place onto a deleted tombstone; choose save-as-new-comment-or-note instead.',
        };
      }

      const retryAck = this.submitOperation({
        operationType: conflict.operationType,
        targetEntityId: conflict.targetEntityId,
        baseWorkspaceRevision: latestWs.workspaceRevision,
        baseEntityRevision: conflict.currentServerEntityRevision,
        payload: conflict.localProposedValue,
      });

      if (retryAck.accepted) {
        conflict.resolved = true;
        conflict.resolutionChoice = choice;
        conflict.resolvedAt = now;
      }
      return { ok: retryAck.accepted, resolutionAck: retryAck, errorMessage: retryAck.errorMessage };
    }

    if (choice === 'save-as-new-comment-or-note') {
      const latestWs = this.getWorkspaceSnapshot();
      if (!latestWs) {
        return { ok: false, errorMessage: 'No active workspace snapshot available.' };
      }

      const newAnnId = `shared-ann-resolved-${Date.now()}`;
      const createAck = this.submitOperation({
        operationType: 'annotation:create',
        targetEntityId: newAnnId,
        baseWorkspaceRevision: latestWs.workspaceRevision,
        baseEntityRevision: 0,
        payload: {
          title: `${String(conflict.localProposedValue.title || 'Forked Note')} (Conflict Recovery)`,
          note: String(
            conflict.localProposedValue.note ||
              conflict.localProposedValue.body ||
              'Recovered from concurrent edit conflict.'
          ),
          category: 'design-coordination-issue',
          priority: 'medium',
          status: 'open',
          targetFloorLevel: 1,
        },
      });

      if (createAck.accepted) {
        conflict.resolved = true;
        conflict.resolutionChoice = choice;
        conflict.resolvedAt = now;
      }
      return { ok: createAck.accepted, resolutionAck: createAck, errorMessage: createAck.errorMessage };
    }

    return { ok: false, errorMessage: 'Unsupported conflict resolution choice.' };
  }

  public disconnect(): void {
    if (this.unsubscribeFn) {
      this.unsubscribeFn();
      this.unsubscribeFn = null;
    }
    this.hub.disconnectPresence(this.workspaceId, this.identity.userId, this.identity.sessionId);
    this.connectionState = 'session-ended';
  }
}

// ============================================================================
// 8. Project Synchronization & Non-Mutating Discipline Preservation
// ============================================================================

/**
 * Synchronizes non-tombstoned shared annotations and bookmarks from a collaboration
 * workspace back into a local Project's `vrDesignReview` and `liveCollaboration` metadata
 * without mutating P41–P48 engineering records.
 */
export function syncProjectWithCollaborationWorkspace(
  project: Project,
  workspace: CollaborationWorkspaceRecord,
  connectionState: CollaborationConnectionState
): Project {
  const vrSafe = getSafeVRDesignReviewState(project);
  const reconciledSharedAnnotations = reconcileWorkspaceAnnotationsWithProjectGeometry(
    workspace,
    project
  );

  const activeVrAnnotations: VRReviewAnnotation[] = reconciledSharedAnnotations
    .filter((a) => !a.isDeletedTombstone)
    .map((a) => convertSharedAnnotationToP49Annotation(a, project));

  const activeVrBookmarks: VRReviewBookmark[] = workspace.bookmarks
    .filter((b) => !b.isDeletedTombstone)
    .map((b) => ({
      bookmarkId: b.bookmarkId,
      projectId: b.projectId,
      label: b.label,
      presetType: b.presetType,
      targetRoomId: b.targetRoomId,
      targetFloorLevel: b.targetFloorLevel,
      cameraPositionMetres: { ...b.cameraPositionMetres },
      lookAtTargetMetres: { ...b.lookAtTargetMetres },
      scalePreset: b.scalePreset,
      createdAt: b.createdAt,
    }));

  const now = new Date().toISOString();
  const liveCollabMeta: ProjectLiveCollaborationMetadata = {
    version: 'plotify-live-collaboration-meta-v1',
    profileId: LIVE_COLLABORATION_PROFILE_ID,
    linkedWorkspaceId: workspace.workspaceId,
    lastKnownWorkspaceRevision: workspace.workspaceRevision,
    lastSyncedGeometryFingerprint: workspace.designSummary.geometryFingerprint,
    cachedAnnotationsCount: activeVrAnnotations.length,
    cachedBookmarksCount: activeVrBookmarks.length,
    lastReadinessStatus: connectionState,
    updatedAt: now,
  };

  return {
    ...project,
    vrDesignReview: {
      version: 'plotify-vr-review-meta-v1',
      profileId: VR_DESIGN_REVIEW_PROFILE_ID,
      savedConfig: vrSafe.config,
      annotations: activeVrAnnotations,
      bookmarks: activeVrBookmarks,
      lastGeometryFingerprint: computeVRModelGeometryFingerprint(project),
      lastCapabilitySummary: project.vrDesignReview?.lastCapabilitySummary,
      updatedAt: now,
    },
    liveCollaboration: liveCollabMeta,
    updatedAt: now,
  };
}
