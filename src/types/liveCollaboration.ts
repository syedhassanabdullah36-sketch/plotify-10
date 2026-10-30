/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * PLOTIFY — P50 Live Multi-User Design Collaboration
 * Profile Identifier: plotify-live-collaboration-p50-v1
 *
 * Scope & Honesty Contract:
 * - P50 provides the Live Multi-User Design Collaboration architecture, domain model,
 *   provider boundary, role-based access control (RBAC), workspace membership & invitations,
 *   compare-and-set revisioned shared state, conflict detection & resolution, ephemeral
 *   presence, shared P49 review annotations/comments/bookmarks, and offline/reconnection
 *   synchronization.
 * - Production Honesty Gate (Section 3.3 Path C & Section 4):
 *   When no real authenticated shared collaboration backend is configured in the runtime
 *   environment, production live mode reports `backend-not-configured` and remains disabled.
 *   Plotify NEVER fakes production multi-user collaboration using localStorage, BroadcastChannel,
 *   or unauthenticated mocks disguised as live cloud sessions.
 * - Development / Verification Multi-Client Test Harness:
 *   An explicit, clearly labelled `development-test-harness-provider` (`isTestHarnessOnly: true`)
 *   is provided for deterministic multi-client verification (Groups A–L) and interactive
 *   sandbox inspection, with unmistakable UI disclosure that it is a local in-memory multi-client
 *   test harness rather than a production cloud backend.
 */

import {
  VRAnnotationAnchorResolutionStatus,
  VRAnnotationCategory,
  VRAnnotationPriority,
  VRAnnotationStatus,
  VRInspectableElementType,
  VRReviewAnnotation,
  VRReviewBookmark,
  VRScalePreset,
  VRWorkspaceMode,
} from './vrDesignReview';

export const LIVE_COLLABORATION_PROFILE_ID = 'plotify-live-collaboration-p50-v1' as const;
export const COLLABORATION_WORKSPACE_SCHEMA_VERSION = 'plotify-collab-workspace-v1' as const;

/**
 * Section 4.1: Explicit Session / Connection / Readiness States.
 * Must distinguish between unconfigured backend, connecting, authenticated, connected,
 * reconnecting, read-only, permission-denied, offline, session-ended, and backend-error.
 */
export type CollaborationConnectionState =
  | 'backend-not-configured'
  | 'connecting'
  | 'authenticated'
  | 'connected'
  | 'reconnecting'
  | 'read-only'
  | 'permission-denied'
  | 'offline'
  | 'session-ended'
  | 'backend-error';

export type CollaborationProviderMode =
  | 'production-unconfigured'
  | 'production-live-provider'
  | 'development-test-harness-provider';

export interface CollaborationBackendReadinessReport {
  profileId: typeof LIVE_COLLABORATION_PROFILE_ID;
  evaluatedAt: string;
  decisionPath: 'Path-A-Configured-Backend' | 'Path-B-Partial-Backend' | 'Path-C-No-Configured-Backend';
  productionLiveReady: boolean;
  connectionState: CollaborationConnectionState;
  activeProviderMode: CollaborationProviderMode;
  isTestHarnessOnly: boolean;
  configuredBackendUrl: string | null;
  configuredAuthProvider: string | null;
  hasAuthenticatedSession: boolean;
  authenticatedUserId: string | null;
  topLineStatus:
    | 'LIVE COLLABORATION READY'
    | 'FOUNDATION IMPLEMENTED — BACKEND CONFIGURATION REQUIRED';
  missingPrerequisites: string[];
  honestyDisclosure: string;
}

/**
 * Section 6: Roles & Permission Model (RBAC).
 */
export type CollaborationRole = 'owner' | 'editor' | 'reviewer' | 'viewer';

export type CollaborationActionType =
  | 'view_workspace'
  | 'join_presence'
  | 'follow_shared_viewpoint'
  | 'broadcast_viewpoint'
  | 'create_annotation'
  | 'edit_own_annotation'
  | 'edit_any_annotation'
  | 'delete_own_annotation'
  | 'delete_any_annotation'
  | 'create_comment'
  | 'update_annotation_status'
  | 'create_bookmark'
  | 'delete_bookmark'
  | 'propose_shared_design_mutation'
  | 'commit_shared_snapshot'
  | 'restore_shared_snapshot'
  | 'manage_invitations'
  | 'manage_member_roles'
  | 'remove_member'
  | 'archive_or_lock_workspace';

export interface RoleCapabilityMatrix {
  role: CollaborationRole;
  label: string;
  description: string;
  allowedActions: CollaborationActionType[];
}

/**
 * Section 5: Identity & Authentication Model.
 */
export interface AuthenticatedCollaboratorIdentity {
  userId: string; // Stable server-verified user ID
  displayName: string;
  email?: string;
  organizationId?: string;
  sessionId: string; // Tab/device session ID
  authVerified: boolean;
  authProvider: 'jwt-bearer' | 'oauth-oidc' | 'test-harness-verified';
  authenticatedAt: string;
  tokenExpiresAt: string;
}

/**
 * Section 7: Workspace Membership & Invitation Model.
 */
export type MembershipStatus = 'active' | 'suspended' | 'revoked' | 'removed';

export interface WorkspaceMembershipRecord {
  membershipId: string;
  workspaceId: string;
  userId: string;
  displayName: string;
  email?: string;
  role: CollaborationRole;
  status: MembershipStatus;
  invitedByUserId: string;
  joinedAt: string;
  updatedAt: string;
  revokedAt?: string;
  revokedReason?: string;
}

export type InvitationStatus = 'pending' | 'accepted' | 'declined' | 'revoked' | 'expired';

export interface WorkspaceInvitationRecord {
  invitationId: string;
  workspaceId: string;
  projectId: string;
  targetEmailOrUserId: string;
  assignedRole: CollaborationRole;
  status: InvitationStatus;
  tokenHash: string; // Never store raw secret token in shared read state
  createdByUserId: string;
  createdAt: string;
  expiresAt: string;
  maxUses: number; // default 1 (single-use)
  useCount: number;
  acceptedByUserId?: string;
  acceptedAt?: string;
  declinedAt?: string;
  revokedByUserId?: string;
  revokedAt?: string;
}

/**
 * Section 10: Presence & Co-Review Model (Ephemeral State).
 * Privacy Guard (Section 18): No continuous raw VR head-pose/hand-joint streaming,
 * no camera/mic capture, no biometric/gaze telemetry.
 */
export type CollaboratorActivityState = 'active' | 'idle' | 'away' | 'disconnected';

export type CollaborationActiveSurface =
  | 'collaboration-hub'
  | 'floor-plan-2d'
  | 'building-3d'
  | 'vr-design-review-p49'
  | 'cross-discipline-review';

export interface CollaboratorPresenceRecord {
  presenceId: string; // `${workspaceId}:${userId}:${sessionId}`
  workspaceId: string;
  userId: string;
  sessionId: string;
  displayName: string;
  role: CollaborationRole;
  badgeColorHex: string;
  activityState: CollaboratorActivityState;
  activeSurface: CollaborationActiveSurface;
  activeMode?: VRWorkspaceMode | '2d-plan' | '3d-orbit';
  activeFloorLevel: number | 'all';
  selectedRoomId: string | null;
  selectedElementId: string | null;
  activeBookmarkId: string | null;
  coarseViewpoint?: {
    positionMetres: { x: number; y: number; z: number };
    yawDegrees: number;
    scalePreset: VRScalePreset;
  };
  followingUserId: string | null;
  lastHeartbeatAt: string;
  leaseExpiresAt: string;
  privacyGuard: {
    rawHeadPoseStreamed: false;
    rawHandJointsStreamed: false;
    eyeTrackingStreamed: false;
    cameraOrMicStreamed: false;
  };
}

/**
 * Section 11: Shared Review Annotations, Comments & Discussion Threads.
 */
export interface SharedAnnotationComment {
  commentId: string;
  annotationId: string;
  workspaceId: string;
  authorUserId: string;
  authorDisplayName: string;
  authorRole: CollaborationRole;
  body: string;
  createdAt: string;
  updatedAt: string;
  isDeletedTombstone: boolean;
}

export interface SharedAnnotationAuditEntry {
  entryId: string;
  timestamp: string;
  actorUserId: string;
  actorDisplayName: string;
  actorRole: CollaborationRole;
  action: 'created' | 'updated-content' | 'status-changed' | 'priority-changed' | 'comment-added' | 'deleted-tombstone';
  previousRevision: number;
  newRevision: number;
  summary: string;
}

export interface SharedCollaborationAnnotation {
  annotationId: string;
  workspaceId: string;
  projectId: string;
  reviewSessionId: string;
  revision: number; // Monotonically increasing revision for compare-and-set
  title: string;
  note: string;
  category: VRAnnotationCategory;
  priority: VRAnnotationPriority;
  status: VRAnnotationStatus;
  targetElementId?: string;
  targetElementType?: VRInspectableElementType;
  targetRoomId?: string;
  targetRoomName?: string;
  targetFloorLevel: number;
  anchorPositionLocalPlotUnits: { x: number; y: number; z: number };
  anchorPositionMetresAt1To1: { x: number; y: number; z: number };
  sourceGeometryFingerprint: string;
  anchorResolutionStatus: VRAnnotationAnchorResolutionStatus;
  anchorResolutionMessage: string;
  authorUserId: string;
  authorDisplayName: string;
  authorRole: CollaborationRole;
  lastModifiedByUserId: string;
  lastModifiedByDisplayName: string;
  createdAt: string;
  updatedAt: string;
  isDeletedTombstone: boolean;
  deletedByUserId?: string;
  deletedAt?: string;
  comments: SharedAnnotationComment[];
  auditTrail: SharedAnnotationAuditEntry[];
  provenanceDisclaimer: string;
  isVerifiedEngineeringRisk: false; // Strictly false per P49 & P50 Section 11.4
}

/**
 * Section 12: Integration with P49 Shared Viewpoints & Bookmarks.
 */
export interface SharedCollaborationBookmark extends VRReviewBookmark {
  workspaceId: string;
  revision: number;
  authorUserId: string;
  authorDisplayName: string;
  authorRole: CollaborationRole;
  isDeletedTombstone: boolean;
}

export interface SharedViewpointBroadcast {
  broadcastId: string;
  workspaceId: string;
  senderUserId: string;
  senderDisplayName: string;
  senderRole: CollaborationRole;
  label: string;
  activeSurface: CollaborationActiveSurface;
  targetFloorLevel: number | 'all';
  targetRoomId?: string;
  cameraPositionMetres: { x: number; y: number; z: number };
  lookAtTargetMetres: { x: number; y: number; z: number };
  yawDegrees: number;
  scalePreset: VRScalePreset;
  requiresRecipientOptIn: true; // Never force-move another user's VR/3D camera without confirmation
  broadcastedAt: string;
}

/**
 * Section 8 & 9: Shared State Architecture, Revisions, Operations & Conflict Handling.
 */
export type DeliveryAcknowledgementState =
  | 'locally-edited'
  | 'queued'
  | 'sent'
  | 'accepted'
  | 'rejected'
  | 'conflicted'
  | 'failed'
  | 'synchronized';

export type SharedOperationType =
  | 'annotation:create'
  | 'annotation:update'
  | 'annotation:status-change'
  | 'annotation:delete'
  | 'comment:create'
  | 'bookmark:create'
  | 'bookmark:delete'
  | 'viewpoint:broadcast'
  | 'design-summary:update'
  | 'snapshot:commit';

export interface SharedDesignSummaryState {
  revision: number;
  projectName: string;
  projectStatus: string;
  activeAlternativeId: string | null;
  activeScenarioId: string | null;
  geometryFingerprint: string;
  floorCount: number;
  roomCount: number;
  roomSummaries: Array<{
    roomId: string;
    name: string;
    type: string;
    floorLevel: number;
    width: number;
    length: number;
    revision: number;
  }>;
  sharedNotes: string;
  lastModifiedByUserId: string;
  lastModifiedByDisplayName: string;
  updatedAt: string;
}

export interface SharedWorkspaceSnapshotEntry {
  snapshotId: string;
  workspaceId: string;
  workspaceRevision: number;
  label: string;
  description: string;
  committedByUserId: string;
  committedByDisplayName: string;
  committedByRole: CollaborationRole;
  geometryFingerprint: string;
  annotationCount: number;
  bookmarkCount: number;
  designSummarySnapshot: SharedDesignSummaryState;
  createdAt: string;
}

export interface SharedCollaborationOperation {
  operationId: string; // Client-generated UUID/idempotency key
  workspaceId: string;
  actorUserId: string;
  actorSessionId: string;
  operationType: SharedOperationType;
  targetEntityId: string;
  baseWorkspaceRevision: number;
  baseEntityRevision: number;
  payload: Record<string, unknown>;
  createdAt: string;
}

export type ConflictReasonCode =
  | 'STALE_ENTITY_REVISION'
  | 'STALE_WORKSPACE_REVISION'
  | 'TARGET_DELETED_TOMBSTONE'
  | 'CONCURRENT_ROOM_EDIT'
  | 'CONCURRENT_ANNOTATION_EDIT';

export type ConflictResolutionChoice =
  | 'keep-server-version'
  | 'reapply-local-on-latest'
  | 'save-as-new-comment-or-note';

export interface CollaborationConflictRecord {
  conflictId: string;
  workspaceId: string;
  operationId: string;
  operationType: SharedOperationType;
  targetEntityId: string;
  reasonCode: ConflictReasonCode;
  message: string;
  baseEntityRevision: number;
  currentServerEntityRevision: number;
  localProposedValue: Record<string, unknown>;
  serverAuthoritativeValue: Record<string, unknown>;
  detectedAt: string;
  resolved: boolean;
  resolutionChoice?: ConflictResolutionChoice;
  resolvedAt?: string;
}

export interface OperationAcknowledgement {
  operationId: string;
  workspaceId: string;
  deliveryState: DeliveryAcknowledgementState;
  accepted: boolean;
  newWorkspaceRevision?: number;
  newEntityRevision?: number;
  errorCode?:
    | 'NONE'
    | 'UNAUTHENTICATED'
    | 'AUTH_EXPIRED'
    | 'PERMISSION_DENIED'
    | 'MEMBERSHIP_REVOKED'
    | 'WORKSPACE_NOT_FOUND'
    | 'WORKSPACE_LOCKED'
    | 'VERSION_CONFLICT'
    | 'RATE_LIMIT_EXCEEDED'
    | 'PAYLOAD_INVALID'
    | 'PAYLOAD_TOO_LARGE'
    | 'BACKEND_NOT_CONFIGURED';
  errorMessage?: string;
  conflict?: CollaborationConflictRecord;
  acknowledgedAt: string;
}

/**
 * Authoritative Collaboration Workspace Record (Durable Shared State).
 */
export interface CollaborationWorkspaceRecord {
  schemaVersion: typeof COLLABORATION_WORKSPACE_SCHEMA_VERSION;
  profileId: typeof LIVE_COLLABORATION_PROFILE_ID;
  workspaceId: string;
  projectId: string;
  workspaceName: string;
  ownerUserId: string;
  isLockedOrArchived: boolean;
  workspaceRevision: number;
  designSummary: SharedDesignSummaryState;
  memberships: WorkspaceMembershipRecord[];
  invitations: WorkspaceInvitationRecord[];
  annotations: SharedCollaborationAnnotation[];
  bookmarks: SharedCollaborationBookmark[];
  viewpointBroadcasts: SharedViewpointBroadcast[];
  snapshots: SharedWorkspaceSnapshotEntry[];
  processedOperationIds: string[]; // Bounded idempotency log
  createdAt: string;
  updatedAt: string;
}

/**
 * Real-time Event Envelope delivered to subscribed clients.
 */
export type CollaborationRealtimeEventType =
  | 'workspace:initial-sync'
  | 'workspace:operation-applied'
  | 'presence:updated'
  | 'presence:left'
  | 'membership:changed'
  | 'invitation:changed'
  | 'viewpoint:broadcasted'
  | 'session:auth-expired'
  | 'session:membership-revoked';

export interface CollaborationRealtimeEvent {
  eventId: string;
  workspaceId: string;
  eventType: CollaborationRealtimeEventType;
  workspaceRevision: number;
  actorUserId: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

/**
 * Privacy & Security Guard State (Section 18).
 */
export interface CollaborationSecurityAndPrivacyGuard {
  serverSideAuthEnforced: boolean;
  serverSideRbacEnforced: boolean;
  workspaceIsolationEnforced: boolean;
  invitationTokenHashed: boolean;
  xssSanitizationEnforced: boolean;
  prototypePollutionBlocked: boolean;
  presenceRateLimitHz: number;
  maxOperationQueueSize: number;
  rawHeadPoseTransmitted: false;
  rawHandSkeletonTransmitted: false;
  eyeGazeTelemetryTransmitted: false;
  cameraOrMicrophoneTransmitted: false;
  localStorageMasqueradingAsLiveBackend: false;
}

/**
 * Local Project Metadata Extension for P50 (`project.liveCollaboration`).
 * Stores local draft references & last known audit summary without claiming
 * that localStorage is a multi-user backend.
 */
export interface ProjectLiveCollaborationMetadata {
  version: 'plotify-live-collaboration-meta-v1';
  profileId: typeof LIVE_COLLABORATION_PROFILE_ID;
  linkedWorkspaceId: string | null;
  lastKnownWorkspaceRevision: number;
  lastSyncedGeometryFingerprint: string;
  cachedAnnotationsCount: number;
  cachedBookmarksCount: number;
  lastReadinessStatus: CollaborationConnectionState;
  updatedAt: string;
}
