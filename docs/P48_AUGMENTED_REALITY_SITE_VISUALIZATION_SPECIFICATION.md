# Plotify P48 — Augmented Reality Site Visualization Specification

- **Profile ID**: `plotify-ar-site-visualization-p48-v1`
- **Roadmap Position**: P48 (Post-P41 IFC, P42 CAD, P43 Terrain, P44 Whole-Life Carbon, P45 Climate Resilience, P46 Building Envelope, P47 Construction Site Logistics)
- **Scope Boundary**: Implements P48 Augmented Reality Site Visualization only. Does not implement P49 (Immersive VR Design Review) or P50 (Live Multi-User Design Collaboration).

---

## 1. Core Architectural & Honesty Principles

1. **Three Explicit Viewing Modes (Zero Silent Substitution)**:
   - **Mode A — Immersive AR (`immersive_ar_webxr`)**: Uses genuine WebXR Device API `immersive-ar` sessions (`navigator.xr.requestSession('immersive-ar')`) with `local-floor` / `local` reference spaces and optional `hit-test` surface detection when supported by device hardware, browser, secure context, and permissions.
   - **Mode B — Standard 3D Site Preview (`standard_3d_site_preview`)**: Non-AR interactive Three.js 3D viewport with studio lighting and orbit camera presets.
   - **Mode C — Manually Calibrated Placement Preview (`manually_calibrated_placement_preview`)**: Non-AR interactive 3D metric placement and calibration studio showing the normalized `1:1` (or `1:10`–`1:100` tabletop) model on a metric calibration grid with anchor ring, yaw compass heading, X/Y/Z metre offsets, and a `1.75 m` human scale reference figure.
2. **Visual Overlay Only — Not a Survey or Set-Out Instrument**:
   - Local hit-test and manually calibrated placements are always marked `isGeospatiallyRegistered: false`.
   - Typical visual-inertial odometry (VIO) or manual alignment drift is `±0.10 m` to `±1.50 m+`. The system never claims survey-grade GNSS/RTK boundary registration or construction set-out accuracy.
3. **Privacy & Permission Discipline**:
   - Capability detection (`detectARCapabilities`) never requests camera access or starts an XR session on page load.
   - Camera / spatial-tracking access is requested strictly upon an explicit user click gesture (`triggeredByUserGesture: true`).
   - Raw camera frames and environmental point clouds/meshes are never captured, stored, or uploaded (`rawCameraFramesStoredOrUploaded: false`, `environmentMeshStoredOrUploaded: false`).

---

## 2. Unit Normalization & Coordinate System Contract

- **WebXR Metric Standard**: WebXR `immersive-ar` defines `1.0` scene unit as `1.0 metre` in a right-handed coordinate frame (`+X` East/Right, `+Y` Up, `-Z` North/Forward).
- **Single-Pass Unit Conversion (`getUnitToMetresFactor`)**:
  - Projects in `feet` convert via `0.3048` (`1 ft = 0.3048 m`).
  - Projects in `metres` convert via `1.0`.
  - Applied **exactly once** when computing `uniformScaleMetresPerProjectUnit = unitToMetresFactor * scaleFactor`.
- **Scale Presets (`AR_SCALE_PRESET_FACTORS`)**:
  - `1:1` (`1.0` — full-scale on-site visualization)
  - `1:10` (`0.1`), `1:20` (`0.05`), `1:50` (`0.02`), `1:100` (`0.01` — miniature tabletop models)
- **Anchor Origin Modes (`ARAnchorOriginMode`)**:
  - `plot_center`: Centers plot footprint at `(0, 0, 0)` with ground base at `Y = 0`.
  - `plot_southwest_corner`: Shifts model by `(+widthM/2 * scaleFactor, 0, -lengthM/2 * scaleFactor)` so the SW plot corner sits at the anchor origin `(0, 0, 0)`.
  - `road_frontage_center`: Places the center of the primary road-facing edge at `(0, 0, 0)`.

---

## 3. Cross-Discipline Layer Compatibility (P41–P47)

- **Building Massing & Shell**: Reuses `buildBuilding3DModel` from `src/components/viewer3d/building3dGeometry.ts` for rooms, walls, slabs, and conceptual openings.
- **Structural Columns (P34 / P41)**: Renders structural framing posts in 3D/AR.
- **Terrain & Topography (P43)**: Renders Delaunay TIN surface triangles and contour lines (`P43_TerrainSurface`).
- **Building Envelope Highlights (P46)**: Renders thermal perimeter highlight markers (`P46_EnvelopeHighlights`) reflecting effective U-value and condensation risk status.
- **Construction Site Logistics (P47)**: Renders active phase laydown/exclusion zones, vehicle haul routes, pedestrian routes, and crane mast / operating radius rings (`P47_SiteLogisticsOverlay`).
- **CAD 2D Filter (P42)**: Unmapped 2D-only DXF reference entities without 3D extrusion height are counted and reported in preflight warnings without fabricating 3D geometry.

---

## 4. Hardware Verification Disclosure

- Automated unit, integration, and mocked WebXR lifecycle tests (`test_ar_site_visualization.ts`, Suite 20) verify capability routing, metric unit conversion, placement transformation matrices, session state transitions, tracking loss handling, P41–P47 layer integration, and teardown resource cleanup.
- Physical mobile AR hardware testing (ARCore/ARKit passthrough camera & physical plane hit-testing) was **not performed** in the cloud container build environment and is explicitly disclosed in all generated P48 reports.
