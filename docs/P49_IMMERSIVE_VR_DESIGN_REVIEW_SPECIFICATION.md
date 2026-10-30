# P49 — Immersive VR Design Review Specification (`plotify-vr-design-review-p49-v1`)

## 1. Architecture & Responsibilities
- **`src/types/vrDesignReview.ts`**: Defines the P49 profile (`plotify-vr-design-review-p49-v1`), workspace modes (`immersive_vr_webxr`, `standard_3d_design_review`, `review_setup_calibration`), scale presets (`1:1`, `1:10`, `1:20`, `1:50`, `1:100`), locomotion settings (`teleport`, `snap-turn`, `seated-stationary`), raycast selection metadata (`VRInspectableMetadata`), model-anchored review annotations (`VRReviewAnnotation`), saved viewpoint bookmarks (`VRReviewBookmark`), cross-discipline read-only digests (`VRCrossDisciplineLayerSummary`), and strict privacy/security guards (`VRPrivacyAndSecurityGuard`).
- **`src/services/vrDesignReviewService.ts`**: Implements runtime WebXR `'immersive-vr'` capability probing (`detectVRCapabilities`), model preflight and complexity budget checks (`prepareVRModelPreflight`), single-pass metric scale normalization (`computeVRSceneTransform`), Three.js multi-discipline scene assembly (`buildVRDesignReviewThreeGroup`), controller/pointer ray target resolution (`resolveVRControllerRayTarget`), comfort teleport destination validation (`validateVRTeleportDestination`), snap-turn computation (`computeSnapTurnYaw`), annotation anchor resolution (`resolveAnnotationAnchorsAgainstProject`), session lifecycle management (`VRSessionController`), and snapshot-backed persistence (`applyVRDesignReviewStateToProject`).
- **`src/components/vr/VRDesignReviewWorkspace.tsx`**: Dedicated user-facing workspace with Mode A/B/C switching, interactive Three.js viewport with raycast selection and comfort teleportation, collapsible bottom control dock, P41–P48 layer inspector, annotation/bookmark panels, and Markdown/JSON report export.

## 2. WebXR Capability Detection & Session Lifecycle
- Runtime probing checks `window.isSecureContext`, WebGL context availability, `Permissions-Policy: xr-spatial-tracking`, document focus/visibility, and `navigator.xr.isSessionSupported('immersive-vr')`.
- VR support is never inferred from `navigator.userAgent`, screen width, or mobile status (`inferredFromUserAgent: false`).
- Session startup requires an intentional user gesture (`userGestureConfirmed: true`), negotiates `'local-floor'` (or `'bounded-floor'` / `'local'`) reference spaces, disables expensive real-time shadow maps during VR rendering, and restores prior `THREE.WebGLRenderer` settings upon session end, interruption, or component unmount.

## 3. Scale, Coordinate Conventions & Locomotion
- Preserves Plotify's coordinate contract: `+X` East across `plotWidth`, `+Y` vertical up in metres, `+Z` South across `plotLength`.
- Applies unit conversion (`feet -> 0.3048 m`, `metres -> 1.0 m`) and scale multiplier (`1:1 -> 1.0`, `1:10 -> 0.1`, `1:20 -> 0.05`, `1:50 -> 0.02`, `1:100 -> 0.01`) through one deterministic transformation path (`combinedScaleFactor = unitToMetresFactor * scaleMultiplier`).
- Comfort locomotion provides low-motion teleportation validated against room slabs, plot boundaries, perimeter walls, and structural columns, plus discrete snap-turn increments (`15°`, `30°`, `45°`, `60°`) and standing (`1.65 m`) / seated (`1.20 m`) eye-height calibration.

## 4. Model-Anchored Review Annotations & P41–P48 Coexistence
- Review annotations store normalized model-space coordinates (`anchorPositionLocalPlotUnits`, `anchorPositionMetresAt1To1`), optional target element/room IDs, `sourceGeometryFingerprint`, and `isVerifiedEngineeringRisk: false`.
- When upstream geometry changes or a target room/column is removed, `resolveAnnotationAnchorsAgainstProject` flags affected notes as `'stale-geometry-changed'` or `'unresolved-target-removed'` rather than silently reattaching them to unrelated elements.
- Reuses upstream P41–P48 contracts read-only: P41 IFC `GlobalId` provenance on rooms/columns, P42 exclusion of 2D-only CAD reference entities from 3D extrusion, P43 Terrain TIN mesh, P44 Whole-Life Carbon read-only summary (never fabricating spatial room heatmaps), P45 Climate Hazard read-only summary, P46 semantic facade ribbons, P47 Site Logistics zones/cranes with phase filtering, and P48 metric normalization while preserving `isGeospatiallyRegistered: false`.

## 5. Official Technical References
- MDN WebXR Device API: https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API
- MDN WebXR Permissions and Security: https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API/Permissions_and_security
- MDN WebXR Session Startup and Shutdown: https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API/Startup_and_shutdown
- MDN WebXR Application Lifecycle: https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API/Lifecycle
- MDN WebXR Inputs and Controllers: https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API/Inputs
- Three.js WebXRManager Documentation: https://threejs.org/docs/pages/WebXRManager.html
- W3C WebXR Device API Specification: https://www.w3.org/TR/webxr/

## 6. Hardware Verification Disclosure
- Physical VR headset testing was not performed in this environment. Automated unit and mocked WebXR lifecycle tests (`npx tsx test_vr_design_review.ts`) verify capability branches, transforms, locomotion, annotations, and teardown.
