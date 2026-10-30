# P50 — Live Multi-User Design Collaboration Specification

- **Profile Identifier**: `plotify-live-collaboration-p50-v1`
- **Schema Version**: `plotify-collab-workspace-v1`
- **Status**: `FOUNDATION IMPLEMENTED — BACKEND CONFIGURATION REQUIRED` (Path C Decision Gate)

---

## 1. Architecture & Decision Gate Summary (Section 3.3)

Plotify's default runtime environment operates as an offline-first browser application with optional REST persistence (`P53-STAGE1`), and has **no pre-configured authenticated real-time multi-user backend** (`VITE_PLOTIFY_COLLAB_BACKEND_URL` and `VITE_PLOTIFY_COLLAB_AUTH_PROVIDER` are unset by default).

In accordance with **Section 3.3 (Path C)** and **Section 4**:
1. **Production Mode Fails Closed (`backend-not-configured`)**:
   - Production mode never fabricates online collaborators, never claims local browser storage (`localStorage` / `BroadcastChannel`) is a cloud multi-user backend, and rejects remote write operations with `BACKEND_NOT_CONFIGURED`.
   - Local single-user design, P41–P48 engineering engines, and P49 Immersive VR Design Review remain 100% functional.
2. **Development / Verification Multi-Client Test Harness (`isTestHarnessOnly: true`)**:
   - `AuthoritativeTestHarnessCollaborationHub` and `TestHarnessCollaborationClientProvider` provide an in-memory authoritative server state machine and multi-client session controller for deterministic automated verification (Groups A–L) and interactive sandbox inspection.
   - The UI explicitly labels this mode as `development-test-harness-provider` (`isTestHarnessOnly: true`) so it can never be mistaken for production cross-device cloud collaboration.

---

## 2. Role-Based Access Control (RBAC) Matrix

| Capability Action | `owner` | `editor` | `reviewer` | `viewer` |
| :--- | :---: | :---: | :---: | :---: |
| `view_workspace` | Yes | Yes | Yes | Yes |
| `join_presence` | Yes | Yes | Yes | Yes |
| `follow_shared_viewpoint` | Yes | Yes | Yes | Yes |
| `broadcast_viewpoint` | Yes | Yes | Yes | No |
| `create_annotation` | Yes | Yes | Yes | No |
| `edit_own_annotation` | Yes | Yes | Yes | No |
| `edit_any_annotation` | Yes | Yes | No | No |
| `delete_own_annotation` | Yes | Yes | Yes | No |
| `delete_any_annotation` | Yes | Yes | No | No |
| `create_comment` | Yes | Yes | Yes | No |
| `update_annotation_status` | Yes | Yes | Yes | No |
| `create_bookmark` | Yes | Yes | Yes | No |
| `delete_bookmark` | Yes | Yes | No | No |
| `propose_shared_design_mutation` | Yes | Yes | No | No |
| `commit_shared_snapshot` | Yes | Yes | No | No |
| `restore_shared_snapshot` | Yes | Yes | No | No |
| `manage_invitations` | Yes | No | No | No |
| `manage_member_roles` | Yes | No | No | No |
| `remove_member` | Yes | No | No | No |
| `archive_or_lock_workspace` | Yes | No | No | No |

---

## 3. Shared State, Compare-and-Set (CAS) & Conflict Handling

- **Durable Shared State**:
  - `CollaborationWorkspaceRecord` (`workspaceRevision`, `designSummary`, `memberships`, `invitations`, `annotations`, `bookmarks`, `viewpointBroadcasts`, `snapshots`, `processedOperationIds`).
- **Ephemeral Presence State**:
  - `CollaboratorPresenceRecord` (`presenceId`, `activityState`, `activeSurface`, `activeFloorLevel`, `selectedRoomId`, `coarseViewpoint`, `lastHeartbeatAt`, `leaseExpiresAt`, `privacyGuard`).
- **Compare-and-Set & Conflict Detection**:
  - Mutations specify `operationId`, `baseWorkspaceRevision`, and `baseEntityRevision`.
  - If `baseEntityRevision !== currentServerEntityRevision`, the hub rejects silent overwrite and returns `deliveryState: 'conflicted'`, `errorCode: 'VERSION_CONFLICT'`, and a structured `CollaborationConflictRecord` with both `localProposedValue` and `serverAuthoritativeValue`.
  - If an annotation was deleted (`isDeletedTombstone: true`), concurrent edits or comments return `TARGET_DELETED_TOMBSTONE`.
  - Supported conflict resolutions:
    1. `keep-server-version`
    2. `reapply-local-on-latest`
    3. `save-as-new-comment-or-note`

---

## 4. Reference Backend Security Policy (Firestore / WebSocket / SQL)

When deploying a production backend (`Path A`), enforce the following server-side authorization invariants:

```javascript
// Reference Firestore / Real-Time Document Security Policy for P50
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isSignedIn() {
      return request.auth != null && request.auth.uid != null;
    }

    function getMember(workspaceId) {
      return get(/databases/$(database)/documents/collaborationWorkspaces/$(workspaceId)/memberships/$(request.auth.uid)).data;
    }

    function isActiveMember(workspaceId) {
      return isSignedIn() && getMember(workspaceId).status == 'active';
    }

    function hasRole(workspaceId, allowedRoles) {
      return isActiveMember(workspaceId) && (getMember(workspaceId).role in allowedRoles);
    }

    match /collaborationWorkspaces/{workspaceId} {
      allow read: if isActiveMember(workspaceId);
      allow create: if isSignedIn() && request.resource.data.ownerUserId == request.auth.uid;
      allow update: if hasRole(workspaceId, ['owner', 'editor'])
                    && request.resource.data.workspaceRevision == resource.data.workspaceRevision + 1;

      match /memberships/{userId} {
        allow read: if isActiveMember(workspaceId);
        allow write: if hasRole(workspaceId, ['owner']);
      }

      match /invitations/{invitationId} {
        allow read: if isActiveMember(workspaceId);
        allow create, update, delete: if hasRole(workspaceId, ['owner']);
      }

      match /annotations/{annotationId} {
        allow read: if isActiveMember(workspaceId);
        allow create: if hasRole(workspaceId, ['owner', 'editor', 'reviewer'])
                      && request.resource.data.authorUserId == request.auth.uid
                      && request.resource.data.isVerifiedEngineeringRisk == false;
        allow update: if hasRole(workspaceId, ['owner', 'editor'])
                      || (hasRole(workspaceId, ['reviewer']) && resource.data.authorUserId == request.auth.uid);
      }

      match /presence/{sessionId} {
        allow read: if isActiveMember(workspaceId);
        allow write: if isActiveMember(workspaceId)
                     && request.resource.data.userId == request.auth.uid
                     && request.resource.data.privacyGuard.rawHeadPoseStreamed == false;
      }
    }
  }
}
```
