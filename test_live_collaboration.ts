/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * PLOTIFY — P50 Live Multi-User Design Collaboration Verification Suite
 * Suite 22: Verifies Groups A through L from the P50 specification.
 */

import assert from 'assert';
import { INITIAL_SAMPLE_PROJECTS } from './src/services/storage';
import {
  COLLABORATION_WORKSPACE_SCHEMA_VERSION,
  LIVE_COLLABORATION_PROFILE_ID,
  AuthenticatedCollaboratorIdentity,
} from './src/types/liveCollaboration';
import {
  AuthoritativeTestHarnessCollaborationHub,
  TestHarnessCollaborationClientProvider,
  UnconfiguredProductionCollaborationProvider,
  canCollaboratorPerformAction,
  computeReconnectBackoffMs,
  evaluateCollaborationBackendReadiness,
  getCollaborationSecurityGuard,
  hashInvitationToken,
  reconcileWorkspaceAnnotationsWithProjectGeometry,
  sanitizeCollaborationText,
  syncProjectWithCollaborationWorkspace,
  validateSafePayloadObject,
} from './src/services/liveCollaborationService';
import {
  createVRReviewAnnotation,
  createDefaultVRDesignReviewConfig,
  applyVRDesignReviewStateToProject,
} from './src/services/vrDesignReviewService';
import {
  createProjectSnapshot,
  executeSafeRestore,
} from './src/services/versioningService';
import {
  createInitialProjectCarbonAssessment,
  applyCarbonAssessmentToProject,
} from './src/services/carbonService';
import {
  createDefaultClimateResilienceConfig,
  runClimateHazardResilienceAssessment,
  applyClimateAssessmentToProject,
} from './src/services/climateResilienceService';
import {
  createInitialEnvelopeAssessment,
  applyEnvelopeAssessmentToProject,
} from './src/services/envelopeService';
import {
  initializeSiteLogisticsPlan,
  applySiteLogisticsPlanToProject,
} from './src/services/siteLogisticsService';

console.log('================================================================');
console.log('PLOTIFY — P50 LIVE MULTI-USER DESIGN COLLABORATION VERIFICATION');
console.log('Profile ID: plotify-live-collaboration-p50-v1');
console.log('================================================================\n');

function makeIdentity(
  userId: string,
  displayName: string,
  email: string,
  sessionId = `sess-${userId}`
): AuthenticatedCollaboratorIdentity {
  const now = Date.now();
  return {
    userId,
    displayName,
    email,
    organizationId: 'org-plotify-verify',
    sessionId,
    authVerified: true,
    authProvider: 'test-harness-verified',
    authenticatedAt: new Date(now).toISOString(),
    tokenExpiresAt: new Date(now + 3600_000).toISOString(),
  };
}

// ============================================================================
// Group A: Backend Readiness & Honest Gating
// ============================================================================
console.log('• Group A: Backend Readiness & Honest Production Gating...');
{
  const defaultReadiness = evaluateCollaborationBackendReadiness();
  assert.strictEqual(defaultReadiness.profileId, LIVE_COLLABORATION_PROFILE_ID);
  assert.strictEqual(defaultReadiness.decisionPath, 'Path-C-No-Configured-Backend');
  assert.strictEqual(defaultReadiness.productionLiveReady, false);
  assert.strictEqual(defaultReadiness.connectionState, 'backend-not-configured');
  assert.strictEqual(defaultReadiness.activeProviderMode, 'production-unconfigured');
  assert.strictEqual(defaultReadiness.isTestHarnessOnly, false);
  assert.strictEqual(
    defaultReadiness.topLineStatus,
    'FOUNDATION IMPLEMENTED — BACKEND CONFIGURATION REQUIRED'
  );
  assert.ok(defaultReadiness.missingPrerequisites.length >= 2);

  // Partial configuration (Path B) must also fail closed
  const partialReadiness = evaluateCollaborationBackendReadiness({
    collabBackendUrl: 'wss://collab.plotify.example/ws',
    authProvider: '',
  });
  assert.strictEqual(partialReadiness.decisionPath, 'Path-B-Partial-Backend');
  assert.strictEqual(partialReadiness.productionLiveReady, false);
  assert.strictEqual(partialReadiness.connectionState, 'backend-not-configured');

  // UnconfiguredProductionCollaborationProvider fails closed on operation submission
  const prodProvider = new UnconfiguredProductionCollaborationProvider();
  assert.strictEqual(prodProvider.getConnectionState(), 'backend-not-configured');
  const blockedAck = prodProvider.submitOperation({
    operationId: 'op-prod-1',
    workspaceId: 'ws-1',
    actorUserId: 'usr-1',
    actorSessionId: 'sess-1',
    operationType: 'annotation:create',
    targetEntityId: 'ann-1',
    baseWorkspaceRevision: 1,
    baseEntityRevision: 0,
    payload: { title: 'Test' },
    createdAt: new Date().toISOString(),
  });
  assert.strictEqual(blockedAck.accepted, false);
  assert.strictEqual(blockedAck.deliveryState, 'failed');
  assert.strictEqual(blockedAck.errorCode, 'BACKEND_NOT_CONFIGURED');

  // Test harness readiness explicitly reports isTestHarnessOnly: true and productionLiveReady: false
  const harnessReadiness = evaluateCollaborationBackendReadiness({
    enableTestHarnessMode: true,
    hasAuthenticatedSession: true,
    authenticatedUserId: 'usr-owner',
  });
  assert.strictEqual(harnessReadiness.isTestHarnessOnly, true);
  assert.strictEqual(harnessReadiness.productionLiveReady, false);
  assert.strictEqual(harnessReadiness.activeProviderMode, 'development-test-harness-provider');
}
console.log('  ✓ Group A passed');

// ============================================================================
// Group B: Identity, Authentication & Session Lifecycle
// ============================================================================
console.log('• Group B: Identity, Authentication & Session Lifecycle...');
{
  const hub = new AuthoritativeTestHarnessCollaborationHub();
  const baseProject = structuredClone(INITIAL_SAMPLE_PROJECTS[0]);
  const owner = makeIdentity('usr-owner', 'Elena Vance', 'elena@plotify.arch');

  const created = hub.createWorkspace(baseProject, owner, 'ws-auth-test');
  assert.strictEqual(created.ok, true);

  // Unauthenticated client cannot connect
  const unauthRead = hub.getWorkspaceForMember('ws-auth-test', 'usr-unknown', 'sess-none');
  assert.strictEqual(unauthRead.ok, false);
  if (!unauthRead.ok) {
    assert.strictEqual(unauthRead.errorCode, 'UNAUTHENTICATED');
  }

  // Authenticated owner connects cleanly
  const ownerClient = new TestHarnessCollaborationClientProvider(hub, owner, 'ws-auth-test');
  const connRes = ownerClient.connect();
  assert.strictEqual(connRes.ok, true);
  assert.strictEqual(ownerClient.getConnectionState(), 'connected');

  // Expire session token mid-session -> client transitions to read-only and writes are rejected
  hub.expireSessionToken(owner.userId, owner.sessionId);
  assert.strictEqual(ownerClient.getConnectionState(), 'read-only');

  const expiredWrite = ownerClient.submitOperation({
    operationType: 'annotation:create',
    targetEntityId: 'ann-after-expire',
    baseWorkspaceRevision: 1,
    baseEntityRevision: 0,
    payload: { title: 'Should fail after token expiry', note: 'Expired session' },
  });
  assert.strictEqual(expiredWrite.accepted, false);
  assert.strictEqual(expiredWrite.errorCode, 'AUTH_EXPIRED');
}
console.log('  ✓ Group B passed');

// ============================================================================
// Group C & Group D: Workspace Membership, RBAC & Invitations Lifecycle
// ============================================================================
console.log('• Group C & D: Workspace Membership, RBAC & Invitations Lifecycle...');
{
  const hub = new AuthoritativeTestHarnessCollaborationHub();
  const project = structuredClone(INITIAL_SAMPLE_PROJECTS[0]);

  const owner = makeIdentity('usr-owner', 'Elena Owner', 'elena@plotify.arch');
  const editor = makeIdentity('usr-editor', 'Marcus Editor', 'marcus@plotify.arch');
  const reviewer = makeIdentity('usr-reviewer', 'Priya Reviewer', 'priya@plotify.arch');
  const viewer = makeIdentity('usr-viewer', 'Liam Viewer', 'liam@plotify.arch');
  const outsider = makeIdentity('usr-outsider', 'Mallory Outsider', 'mallory@external.org');

  const wsRes = hub.createWorkspace(project, owner, 'ws-rbac-test');
  assert.strictEqual(wsRes.ok, true);

  // Create invitations as owner
  const invEditor = hub.createInvitation({
    workspaceId: 'ws-rbac-test',
    actorUserId: owner.userId,
    actorSessionId: owner.sessionId,
    targetEmailOrUserId: editor.email!,
    assignedRole: 'editor',
  });
  assert.strictEqual(invEditor.ok, true);
  if (!invEditor.ok) throw new Error('Expected editor invite creation to succeed');

  // Verify raw token is NOT stored in workspace invitation record
  assert.notStrictEqual(invEditor.invitation.tokenHash, invEditor.rawInviteToken);
  assert.strictEqual(
    invEditor.invitation.tokenHash,
    hashInvitationToken(invEditor.rawInviteToken)
  );

  // Outsider attempting to accept Editor's bound invitation must be rejected
  const wrongUserAccept = hub.acceptInvitation({
    workspaceId: 'ws-rbac-test',
    invitationId: invEditor.invitation.invitationId,
    rawInviteToken: invEditor.rawInviteToken,
    joiningIdentity: outsider,
  });
  assert.strictEqual(wrongUserAccept.ok, false);

  // Wrong token must be rejected
  const wrongTokenAccept = hub.acceptInvitation({
    workspaceId: 'ws-rbac-test',
    invitationId: invEditor.invitation.invitationId,
    rawInviteToken: 'forged-token-123',
    joiningIdentity: editor,
  });
  assert.strictEqual(wrongTokenAccept.ok, false);

  // Valid acceptance by Editor succeeds
  const validEditorAccept = hub.acceptInvitation({
    workspaceId: 'ws-rbac-test',
    invitationId: invEditor.invitation.invitationId,
    rawInviteToken: invEditor.rawInviteToken,
    joiningIdentity: editor,
  });
  assert.strictEqual(validEditorAccept.ok, true);

  // Single-use invitation cannot be reused a second time
  const reuseAccept = hub.acceptInvitation({
    workspaceId: 'ws-rbac-test',
    invitationId: invEditor.invitation.invitationId,
    rawInviteToken: invEditor.rawInviteToken,
    joiningIdentity: editor,
  });
  assert.strictEqual(reuseAccept.ok, false);

  // Expired invitation is rejected
  const expiredInv = hub.createInvitation({
    workspaceId: 'ws-rbac-test',
    actorUserId: owner.userId,
    actorSessionId: owner.sessionId,
    targetEmailOrUserId: reviewer.email!,
    assignedRole: 'reviewer',
    expiresInMs: -5000, // already expired
  });
  assert.strictEqual(expiredInv.ok, true);
  if (expiredInv.ok) {
    const expiredAccept = hub.acceptInvitation({
      workspaceId: 'ws-rbac-test',
      invitationId: expiredInv.invitation.invitationId,
      rawInviteToken: expiredInv.rawInviteToken,
      joiningIdentity: reviewer,
    });
    assert.strictEqual(expiredAccept.ok, false);
  }

  // Revoked invitation is rejected
  const revocableInv = hub.createInvitation({
    workspaceId: 'ws-rbac-test',
    actorUserId: owner.userId,
    actorSessionId: owner.sessionId,
    targetEmailOrUserId: reviewer.email!,
    assignedRole: 'reviewer',
  });
  assert.strictEqual(revocableInv.ok, true);
  if (revocableInv.ok) {
    const revRes = hub.revokeInvitation({
      workspaceId: 'ws-rbac-test',
      invitationId: revocableInv.invitation.invitationId,
      actorUserId: owner.userId,
      actorSessionId: owner.sessionId,
    });
    assert.strictEqual(revRes.ok, true);

    const revokedAccept = hub.acceptInvitation({
      workspaceId: 'ws-rbac-test',
      invitationId: revocableInv.invitation.invitationId,
      rawInviteToken: revocableInv.rawInviteToken,
      joiningIdentity: reviewer,
    });
    assert.strictEqual(revokedAccept.ok, false);
  }

  // Now invite and join Reviewer and Viewer properly
  const invReviewer = hub.createInvitation({
    workspaceId: 'ws-rbac-test',
    actorUserId: owner.userId,
    actorSessionId: owner.sessionId,
    targetEmailOrUserId: reviewer.email!,
    assignedRole: 'reviewer',
  });
  if (invReviewer.ok) {
    hub.acceptInvitation({
      workspaceId: 'ws-rbac-test',
      invitationId: invReviewer.invitation.invitationId,
      rawInviteToken: invReviewer.rawInviteToken,
      joiningIdentity: reviewer,
    });
  }

  const invViewer = hub.createInvitation({
    workspaceId: 'ws-rbac-test',
    actorUserId: owner.userId,
    actorSessionId: owner.sessionId,
    targetEmailOrUserId: viewer.email!,
    assignedRole: 'viewer',
  });
  if (invViewer.ok) {
    hub.acceptInvitation({
      workspaceId: 'ws-rbac-test',
      invitationId: invViewer.invitation.invitationId,
      rawInviteToken: invViewer.rawInviteToken,
      joiningIdentity: viewer,
    });
  }

  // Connect all 4 clients
  const ownerClient = new TestHarnessCollaborationClientProvider(hub, owner, 'ws-rbac-test');
  const editorClient = new TestHarnessCollaborationClientProvider(hub, editor, 'ws-rbac-test');
  const reviewerClient = new TestHarnessCollaborationClientProvider(hub, reviewer, 'ws-rbac-test');
  const viewerClient = new TestHarnessCollaborationClientProvider(hub, viewer, 'ws-rbac-test');

  ownerClient.connect();
  editorClient.connect();
  reviewerClient.connect();
  viewerClient.connect();

  assert.strictEqual(ownerClient.getConnectionState(), 'connected');
  assert.strictEqual(editorClient.getConnectionState(), 'connected');
  assert.strictEqual(reviewerClient.getConnectionState(), 'connected');
  assert.strictEqual(viewerClient.getConnectionState(), 'read-only');

  // Editor cannot create invitations or change member roles
  const editorInviteAttempt = hub.createInvitation({
    workspaceId: 'ws-rbac-test',
    actorUserId: editor.userId,
    actorSessionId: editor.sessionId,
    targetEmailOrUserId: 'someone@plotify.arch',
    assignedRole: 'viewer',
  });
  assert.strictEqual(editorInviteAttempt.ok, false);

  // Viewer cannot create annotations, comments, bookmarks, viewpoints, or snapshots
  const viewerAnnAttempt = viewerClient.submitOperation({
    operationType: 'annotation:create',
    targetEntityId: 'ann-viewer-blocked',
    baseWorkspaceRevision: 1,
    baseEntityRevision: 0,
    payload: { title: 'Viewer unauthorized note' },
  });
  assert.strictEqual(viewerAnnAttempt.accepted, false);
  assert.strictEqual(viewerAnnAttempt.errorCode, 'PERMISSION_DENIED');

  // Reviewer CAN create own annotation, comment, and bookmark, but CANNOT mutate shared design summary or commit snapshots
  const reviewerAnn = reviewerClient.submitOperation({
    operationType: 'annotation:create',
    targetEntityId: 'ann-reviewer-1',
    baseWorkspaceRevision: reviewerClient.getWorkspaceSnapshot()!.workspaceRevision,
    baseEntityRevision: 0,
    payload: {
      title: 'Reviewer Glazing Observation',
      note: 'Check thermal break alignment on Floor 1.',
      priority: 'high',
      targetFloorLevel: 1,
    },
  });
  assert.strictEqual(reviewerAnn.accepted, true);

  const reviewerDesignAttempt = reviewerClient.submitOperation({
    operationType: 'design-summary:update',
    targetEntityId: 'design-summary',
    baseWorkspaceRevision: reviewerClient.getWorkspaceSnapshot()!.workspaceRevision,
    baseEntityRevision: 1,
    payload: { sharedNotes: 'Reviewer trying to mutate design summary' },
  });
  assert.strictEqual(reviewerDesignAttempt.accepted, false);
  assert.strictEqual(reviewerDesignAttempt.errorCode, 'PERMISSION_DENIED');

  // Owner creates an annotation; Reviewer CANNOT edit or delete Owner's annotation, but Editor CAN
  const ownerAnn = ownerClient.submitOperation({
    operationType: 'annotation:create',
    targetEntityId: 'ann-owner-1',
    baseWorkspaceRevision: ownerClient.getWorkspaceSnapshot()!.workspaceRevision,
    baseEntityRevision: 0,
    payload: {
      title: 'Owner Structural Grid Note',
      note: 'Verify column bay spacing.',
      priority: 'medium',
      targetFloorLevel: 1,
    },
  });
  assert.strictEqual(ownerAnn.accepted, true);

  const reviewerEditOwnerAnn = reviewerClient.submitOperation({
    operationType: 'annotation:update',
    targetEntityId: 'ann-owner-1',
    baseWorkspaceRevision: reviewerClient.getWorkspaceSnapshot()!.workspaceRevision,
    baseEntityRevision: 1,
    payload: { title: 'Reviewer trying to overwrite Owner note' },
  });
  assert.strictEqual(reviewerEditOwnerAnn.accepted, false);
  assert.strictEqual(reviewerEditOwnerAnn.errorCode, 'PERMISSION_DENIED');

  // Editor CAN update Owner's annotation
  const editorEditOwnerAnn = editorClient.submitOperation({
    operationType: 'annotation:update',
    targetEntityId: 'ann-owner-1',
    baseWorkspaceRevision: editorClient.getWorkspaceSnapshot()!.workspaceRevision,
    baseEntityRevision: 1,
    payload: { title: 'Owner Structural Grid Note (Updated by Editor)' },
  });
  assert.strictEqual(editorEditOwnerAnn.accepted, true);
  assert.strictEqual(editorEditOwnerAnn.newEntityRevision, 2);

  // Live role downgrade: Owner downgrades Editor to Viewer -> Editor immediately transitions to read-only and cannot write
  const downgradeRes = hub.updateMemberRole({
    workspaceId: 'ws-rbac-test',
    actorUserId: owner.userId,
    actorSessionId: owner.sessionId,
    targetUserId: editor.userId,
    newRole: 'viewer',
  });
  assert.strictEqual(downgradeRes.ok, true);
  assert.strictEqual(editorClient.getConnectionState(), 'read-only');

  const downgradedWrite = editorClient.submitOperation({
    operationType: 'annotation:create',
    targetEntityId: 'ann-after-downgrade',
    baseWorkspaceRevision: editorClient.getWorkspaceSnapshot()!.workspaceRevision,
    baseEntityRevision: 0,
    payload: { title: 'Blocked after downgrade to viewer' },
  });
  assert.strictEqual(downgradedWrite.accepted, false);
  assert.strictEqual(downgradedWrite.errorCode, 'PERMISSION_DENIED');

  // Live membership revocation: Owner revokes Viewer -> Viewer transitions to permission-denied
  const revokeMemRes = hub.revokeMembership({
    workspaceId: 'ws-rbac-test',
    actorUserId: owner.userId,
    actorSessionId: owner.sessionId,
    targetUserId: viewer.userId,
    reason: 'Access ended',
  });
  assert.strictEqual(revokeMemRes.ok, true);
  assert.strictEqual(viewerClient.getConnectionState(), 'permission-denied');
}
console.log('  ✓ Group C & D passed');

// ============================================================================
// Group E: Presence & Ephemeral Session State
// ============================================================================
console.log('• Group E: Presence, Rate Throttling, Lease Expiry & Privacy Guard...');
{
  const hub = new AuthoritativeTestHarnessCollaborationHub();
  const project = structuredClone(INITIAL_SAMPLE_PROJECTS[0]);
  const owner = makeIdentity('usr-owner', 'Elena Owner', 'elena@plotify.arch');
  hub.createWorkspace(project, owner, 'ws-presence-test');

  const p1 = hub.updatePresence({
    workspaceId: 'ws-presence-test',
    userId: owner.userId,
    sessionId: owner.sessionId,
    activityState: 'active',
    activeSurface: 'vr-design-review-p49',
    activeFloorLevel: 2,
    selectedRoomId: 'room-hr-06',
    coarseViewpoint: {
      positionMetres: { x: 3.25, y: 1.65, z: 6.1 },
      yawDegrees: 45,
      scalePreset: '1:1',
    },
  });
  assert.strictEqual(p1.ok, true);
  if (p1.ok) {
    assert.strictEqual(p1.throttled, false);
    assert.strictEqual(p1.presence.privacyGuard.rawHeadPoseStreamed, false);
    assert.strictEqual(p1.presence.privacyGuard.rawHandJointsStreamed, false);
    assert.strictEqual(p1.presence.privacyGuard.eyeTrackingStreamed, false);
    assert.strictEqual(p1.presence.privacyGuard.cameraOrMicStreamed, false);
  }

  // Immediate rapid second update within 200ms is throttled
  const p2 = hub.updatePresence({
    workspaceId: 'ws-presence-test',
    userId: owner.userId,
    sessionId: owner.sessionId,
    activeFloorLevel: 1,
  });
  assert.strictEqual(p2.ok, true);
  if (p2.ok) {
    assert.strictEqual(p2.throttled, true);
  }

  assert.strictEqual(hub.getActivePresenceList('ws-presence-test').length, 1);

  // Lease expiration sweep cleans up expired presence
  const futureMs = Date.now() + 60_000;
  const swept = hub.sweepExpiredPresenceLeases('ws-presence-test', futureMs);
  assert.strictEqual(swept, 1);
  assert.strictEqual(hub.getActivePresenceList('ws-presence-test', futureMs).length, 0);
}
console.log('  ✓ Group E passed');

// ============================================================================
// Group F & Group G: Shared Annotations, Comments & Concurrent Conflict Handling
// ============================================================================
console.log('• Group F & G: Shared Annotations, Comments & Concurrent Conflict Handling...');
{
  const hub = new AuthoritativeTestHarnessCollaborationHub();
  const project = structuredClone(INITIAL_SAMPLE_PROJECTS[0]);
  const owner = makeIdentity('usr-owner', 'Elena Owner', 'elena@plotify.arch');
  const editor = makeIdentity('usr-editor', 'Marcus Editor', 'marcus@plotify.arch');

  hub.createWorkspace(project, owner, 'ws-conflict-test');
  const inv = hub.createInvitation({
    workspaceId: 'ws-conflict-test',
    actorUserId: owner.userId,
    actorSessionId: owner.sessionId,
    targetEmailOrUserId: editor.email!,
    assignedRole: 'editor',
  });
  if (inv.ok) {
    hub.acceptInvitation({
      workspaceId: 'ws-conflict-test',
      invitationId: inv.invitation.invitationId,
      rawInviteToken: inv.rawInviteToken,
      joiningIdentity: editor,
    });
  }

  const clientA = new TestHarnessCollaborationClientProvider(hub, owner, 'ws-conflict-test');
  const clientB = new TestHarnessCollaborationClientProvider(hub, editor, 'ws-conflict-test');
  clientA.connect();
  clientB.connect();

  // Client A creates an annotation (Rev 1)
  const createAck = clientA.submitOperation({
    operationType: 'annotation:create',
    targetEntityId: 'ann-shared-100',
    baseWorkspaceRevision: 1,
    baseEntityRevision: 0,
    payload: {
      title: 'Initial Roof Parapet Detail',
      note: 'Check coping slope.',
      priority: 'critical-observation',
      targetFloorLevel: 2,
    },
  });
  assert.strictEqual(createAck.accepted, true);
  assert.strictEqual(createAck.newEntityRevision, 1);

  const createdAnn = clientB
    .getWorkspaceSnapshot()!
    .annotations.find((a) => a.annotationId === 'ann-shared-100')!;
  assert.strictEqual(createdAnn.isVerifiedEngineeringRisk, false);

  // Client B adds a comment -> advances annotation to Rev 2
  const commentAck = clientB.submitOperation({
    operationType: 'comment:create',
    targetEntityId: 'ann-shared-100',
    baseWorkspaceRevision: clientB.getWorkspaceSnapshot()!.workspaceRevision,
    baseEntityRevision: 1,
    payload: { body: 'Confirmed parapet flashing height is 250mm.' },
  });
  assert.strictEqual(commentAck.accepted, true);
  assert.strictEqual(commentAck.newEntityRevision, 2);

  // Concurrent Edit-vs-Edit Conflict:
  // Both Client A and Client B read Rev 2. Client A updates first (to Rev 3).
  const editAAck = clientA.submitOperation({
    operationType: 'annotation:update',
    targetEntityId: 'ann-shared-100',
    baseWorkspaceRevision: clientA.getWorkspaceSnapshot()!.workspaceRevision,
    baseEntityRevision: 2,
    payload: { title: 'Parapet Detail — Updated by Elena (Rev 3)' },
  });
  assert.strictEqual(editAAck.accepted, true);
  assert.strictEqual(editAAck.newEntityRevision, 3);

  // Client B submits update against stale baseEntityRevision: 2 -> MUST conflict and NOT overwrite Rev 3
  const editBAck = clientB.submitOperation({
    operationType: 'annotation:update',
    targetEntityId: 'ann-shared-100',
    baseWorkspaceRevision: clientB.getWorkspaceSnapshot()!.workspaceRevision,
    baseEntityRevision: 2, // Stale!
    payload: { title: 'Parapet Detail — Concurrent Edit by Marcus' },
  });
  assert.strictEqual(editBAck.accepted, false);
  assert.strictEqual(editBAck.deliveryState, 'conflicted');
  assert.strictEqual(editBAck.errorCode, 'VERSION_CONFLICT');
  assert.ok(editBAck.conflict);
  assert.strictEqual(editBAck.conflict!.reasonCode, 'CONCURRENT_ANNOTATION_EDIT');

  // Verify server preserved Client A's Rev 3 title
  const serverAnnAfterConflict = clientA
    .getWorkspaceSnapshot()!
    .annotations.find((a) => a.annotationId === 'ann-shared-100')!;
  assert.strictEqual(serverAnnAfterConflict.title, 'Parapet Detail — Updated by Elena (Rev 3)');
  assert.strictEqual(serverAnnAfterConflict.revision, 3);

  // Client B resolves conflict using 'reapply-local-on-latest' -> advances to Rev 4
  const resolveRes = clientB.resolveConflict(
    editBAck.conflict!.conflictId,
    'reapply-local-on-latest'
  );
  assert.strictEqual(resolveRes.ok, true);
  const serverAnnAfterResolve = clientA
    .getWorkspaceSnapshot()!
    .annotations.find((a) => a.annotationId === 'ann-shared-100')!;
  assert.strictEqual(
    serverAnnAfterResolve.title,
    'Parapet Detail — Concurrent Edit by Marcus'
  );
  assert.strictEqual(serverAnnAfterResolve.revision, 4);

  // Edit-vs-Delete Conflict: Client A deletes annotation (tombstone), Client B tries to update it
  const delAck = clientA.submitOperation({
    operationType: 'annotation:delete',
    targetEntityId: 'ann-shared-100',
    baseWorkspaceRevision: clientA.getWorkspaceSnapshot()!.workspaceRevision,
    baseEntityRevision: 4,
    payload: {},
  });
  assert.strictEqual(delAck.accepted, true);

  const editOnDeletedAck = clientB.submitOperation({
    operationType: 'annotation:update',
    targetEntityId: 'ann-shared-100',
    baseWorkspaceRevision: clientB.getWorkspaceSnapshot()!.workspaceRevision,
    baseEntityRevision: 4,
    payload: { title: 'Editing a deleted annotation' },
  });
  assert.strictEqual(editOnDeletedAck.accepted, false);
  assert.strictEqual(editOnDeletedAck.deliveryState, 'conflicted');
  assert.strictEqual(editOnDeletedAck.conflict?.reasonCode, 'TARGET_DELETED_TOMBSTONE');

  // Resolve tombstone conflict by saving as a new coordination note
  const forkRes = clientB.resolveConflict(
    editOnDeletedAck.conflict!.conflictId,
    'save-as-new-comment-or-note'
  );
  assert.strictEqual(forkRes.ok, true);
}
console.log('  ✓ Group F & G passed');

// ============================================================================
// Group H: P49 Immersive VR Design Review Integration
// ============================================================================
console.log('• Group H: P49 Immersive VR Design Review Integration...');
{
  let project = structuredClone(INITIAL_SAMPLE_PROJECTS[0]);
  const vrConfig = createDefaultVRDesignReviewConfig(project);
  const vrNoteRes = createVRReviewAnnotation(
    project,
    vrConfig,
    {
      title: 'P49 Master Suite Daylight Check',
      note: 'Inspect east window sill height in VR.',
      category: 'spatial-layout-observation',
      priority: 'high',
      targetRoomId: 'room-hr-06',
      targetFloorLevel: 2,
      anchorPositionLocalPlotUnits: { x: 10, y: 14, z: 3 },
    },
    'vr-sess-001'
  );
  assert.ok(vrNoteRes.annotation);

  const applied = applyVRDesignReviewStateToProject(
    project,
    {
      config: vrConfig,
      annotations: [vrNoteRes.annotation!],
      bookmarks: [],
    },
    false
  );
  project = applied.updatedProject;

  const hub = new AuthoritativeTestHarnessCollaborationHub();
  const owner = makeIdentity('usr-owner', 'Elena Owner', 'elena@plotify.arch');
  const wsRes = hub.createWorkspace(project, owner, 'ws-p49-bridge');
  assert.strictEqual(wsRes.ok, true);
  if (wsRes.ok) {
    assert.strictEqual(wsRes.workspace.annotations.length, 1);
    assert.strictEqual(
      wsRes.workspace.annotations[0].title,
      'P49 Master Suite Daylight Check'
    );
    assert.strictEqual(wsRes.workspace.annotations[0].isVerifiedEngineeringRisk, false);

    // Simulate deleting target room 'room-hr-06' from project and reconciling anchors
    const modifiedProject = structuredClone(project);
    modifiedProject.floorPlan!.rooms = modifiedProject.floorPlan!.rooms.filter(
      (r) => r.id !== 'room-hr-06'
    );
    const reconciled = reconcileWorkspaceAnnotationsWithProjectGeometry(
      wsRes.workspace,
      modifiedProject
    );
    assert.strictEqual(reconciled[0].anchorResolutionStatus, 'unresolved-target-removed');
  }
}
console.log('  ✓ Group H passed');

// ============================================================================
// Group I: Offline Queue, Backoff & Idempotent Reconnect Flush
// ============================================================================
console.log('• Group I: Offline Queue, Exponential Backoff & Idempotent Reconnect...');
{
  assert.strictEqual(computeReconnectBackoffMs(0), 1000);
  assert.strictEqual(computeReconnectBackoffMs(1), 2000);
  assert.strictEqual(computeReconnectBackoffMs(2), 4000);
  assert.strictEqual(computeReconnectBackoffMs(10), 30000);

  const hub = new AuthoritativeTestHarnessCollaborationHub();
  const project = structuredClone(INITIAL_SAMPLE_PROJECTS[0]);
  const owner = makeIdentity('usr-owner', 'Elena Owner', 'elena@plotify.arch');
  hub.createWorkspace(project, owner, 'ws-offline-test');

  const client = new TestHarnessCollaborationClientProvider(hub, owner, 'ws-offline-test');
  client.connect();

  // Simulate network drop
  client.simulateNetworkDisconnect();
  assert.strictEqual(client.getConnectionState(), 'offline');

  // Operations while offline are queued (NOT accepted)
  const queuedAck1 = client.submitOperation({
    operationId: 'op-offline-idem-1',
    operationType: 'annotation:create',
    targetEntityId: 'ann-offline-1',
    baseWorkspaceRevision: 1,
    baseEntityRevision: 0,
    payload: { title: 'Offline Note 1', note: 'Created while disconnected' },
  });
  assert.strictEqual(queuedAck1.deliveryState, 'queued');
  assert.strictEqual(queuedAck1.accepted, false);
  assert.strictEqual(client.getPendingQueue().length, 1);

  // Reconnect and flush
  const reconn = client.reconnectAndSync();
  assert.strictEqual(reconn.reconnected, true);
  assert.strictEqual(reconn.flushedResults.length, 1);
  assert.strictEqual(reconn.flushedResults[0].accepted, true);
  assert.strictEqual(reconn.flushedResults[0].deliveryState, 'synchronized');
  assert.strictEqual(client.getPendingQueue().length, 0);

  // Resubmitting the exact same operationId ('op-offline-idem-1') is idempotent and does not duplicate
  const dupAck = client.submitOperation({
    operationId: 'op-offline-idem-1',
    operationType: 'annotation:create',
    targetEntityId: 'ann-offline-1',
    baseWorkspaceRevision: 1,
    baseEntityRevision: 0,
    payload: { title: 'Offline Note 1', note: 'Created while disconnected' },
  });
  assert.strictEqual(dupAck.accepted, true);
  assert.strictEqual(
    client.getWorkspaceSnapshot()!.annotations.filter((a) => a.annotationId === 'ann-offline-1')
      .length,
    1
  );
}
console.log('  ✓ Group I passed');

// ============================================================================
// Group J: Cross-Discipline Non-Mutation Preservation (P41–P48)
// ============================================================================
console.log('• Group J: Cross-Discipline Non-Mutation Preservation (P41–P48)...');
{
  let project = structuredClone(INITIAL_SAMPLE_PROJECTS[0]);
  const carbonAssessment = createInitialProjectCarbonAssessment(project);
  project = applyCarbonAssessmentToProject(project, carbonAssessment, {
    saveAsScenario: false,
  }).updatedProject;

  const climateConfig = createDefaultClimateResilienceConfig();
  const climateAssessment = runClimateHazardResilienceAssessment(project, climateConfig);
  project = applyClimateAssessmentToProject(project, climateAssessment, [], [], [], false);

  const envelopeAssessment = createInitialEnvelopeAssessment(project);
  project = applyEnvelopeAssessmentToProject(project, envelopeAssessment, {
    saveAsScenario: false,
  });

  const logisticsPlan = initializeSiteLogisticsPlan(project);
  project = applySiteLogisticsPlanToProject(project, logisticsPlan).updatedProject;

  const beforeCarbonJson = JSON.stringify(project.carbonAssessment);
  const beforeClimateJson = JSON.stringify(project.climateResilience);
  const beforeEnvelopeJson = JSON.stringify(project.envelopePerformance);
  const beforeLogisticsJson = JSON.stringify(project.siteLogistics);

  const hub = new AuthoritativeTestHarnessCollaborationHub();
  const owner = makeIdentity('usr-owner', 'Elena Owner', 'elena@plotify.arch');
  const wsRes = hub.createWorkspace(project, owner, 'ws-preserve-p41-p48');
  assert.strictEqual(wsRes.ok, true);

  if (wsRes.ok) {
    const syncedProject = syncProjectWithCollaborationWorkspace(
      project,
      wsRes.workspace,
      'connected'
    );
    assert.strictEqual(JSON.stringify(syncedProject.carbonAssessment), beforeCarbonJson);
    assert.strictEqual(JSON.stringify(syncedProject.climateResilience), beforeClimateJson);
    assert.strictEqual(JSON.stringify(syncedProject.envelopePerformance), beforeEnvelopeJson);
    assert.strictEqual(JSON.stringify(syncedProject.siteLogistics), beforeLogisticsJson);
    assert.strictEqual(
      syncedProject.liveCollaboration?.profileId,
      LIVE_COLLABORATION_PROFILE_ID
    );
  }
}
console.log('  ✓ Group J passed');

// ============================================================================
// Group K: Security, Workspace Isolation, XSS & Prototype Pollution Resistance
// ============================================================================
console.log('• Group K: Security, Isolation, XSS & Prototype Pollution Resistance...');
{
  const hub = new AuthoritativeTestHarnessCollaborationHub();
  const project = structuredClone(INITIAL_SAMPLE_PROJECTS[0]);
  const owner = makeIdentity('usr-owner', 'Elena Owner', 'elena@plotify.arch');
  const attacker = makeIdentity('usr-attacker', 'Attacker', 'attacker@evil.example');

  hub.createWorkspace(project, owner, 'ws-secret-isolated-999');
  hub.registerAuthenticatedIdentity(attacker);

  // Attacker guessing workspaceId is denied access
  const guessRes = hub.getWorkspaceForMember(
    'ws-secret-isolated-999',
    attacker.userId,
    attacker.sessionId
  );
  assert.strictEqual(guessRes.ok, false);
  if (!guessRes.ok) {
    assert.strictEqual(guessRes.errorCode, 'PERMISSION_DENIED');
  }

  // XSS sanitization strips script tags, event handlers, and javascript: URIs
  const dirtyText = `<script>alert("xss")</script><img src=x onerror="steal()">Check <a href="javascript:evil()">Facade</a>`;
  const cleaned = sanitizeCollaborationText(dirtyText);
  assert.ok(!cleaned.includes('<script>'));
  assert.ok(!cleaned.includes('onerror'));
  assert.ok(!cleaned.includes('javascript:'));
  assert.ok(cleaned.includes('Check Facade'));

  // Prototype pollution & non-finite payload validation
  const pollutedObj = Object.create(null);
  Object.defineProperty(pollutedObj, '__proto__', {
    value: { isAdmin: true },
    enumerable: true,
  });
  assert.strictEqual(validateSafePayloadObject(pollutedObj), false);
  assert.strictEqual(validateSafePayloadObject({ coord: NaN }), false);
  assert.strictEqual(validateSafePayloadObject({ coord: Infinity }), false);

  const guard = getCollaborationSecurityGuard();
  assert.strictEqual(guard.rawHeadPoseTransmitted, false);
  assert.strictEqual(guard.localStorageMasqueradingAsLiveBackend, false);
}
console.log('  ✓ Group K passed');

// ============================================================================
// Group L: Persistence & Safe Rollback Integration
// ============================================================================
console.log('• Group L: Persistence & Safe Rollback Integration...');
{
  const originalProject = structuredClone(INITIAL_SAMPLE_PROJECTS[0]);
  const preCollabSnapshot = createProjectSnapshot(originalProject, {
    label: 'Pre-P50 Collaboration Checkpoint',
    description: 'Snapshot prior to syncing shared workspace review notes.',
    trigger: 'manual',
  });

  const hub = new AuthoritativeTestHarnessCollaborationHub();
  const owner = makeIdentity('usr-owner', 'Elena Owner', 'elena@plotify.arch');
  hub.createWorkspace(originalProject, owner, 'ws-rollback-test');
  const client = new TestHarnessCollaborationClientProvider(hub, owner, 'ws-rollback-test');
  client.connect();

  client.submitOperation({
    operationType: 'annotation:create',
    targetEntityId: 'ann-rollback-1',
    baseWorkspaceRevision: 1,
    baseEntityRevision: 0,
    payload: { title: 'Note to be rolled back', note: 'Testing rollback' },
  });

  const syncedProject = syncProjectWithCollaborationWorkspace(
    originalProject,
    client.getWorkspaceSnapshot()!,
    'connected'
  );
  assert.strictEqual(syncedProject.liveCollaboration?.linkedWorkspaceId, 'ws-rollback-test');
  assert.strictEqual(syncedProject.vrDesignReview?.annotations.length, 1);

  const restoreRes = executeSafeRestore(syncedProject, preCollabSnapshot);
  assert.strictEqual(restoreRes.success, true);
  assert.strictEqual(restoreRes.restoredProject?.liveCollaboration, undefined);
}
console.log('  ✓ Group L passed');

console.log('\n================================================================');
console.log('ALL P50 LIVE MULTI-USER COLLABORATION CHECKS (GROUPS A–L) PASSED!');
console.log('================================================================\n');
