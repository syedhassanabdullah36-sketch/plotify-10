# P42 — CAD Drawing Exchange Specification & Architecture

## 1. Overview & Mission

**P42 — CAD Drawing Exchange** provides a deterministic, transparent, and non-destructive workflow for importing, inspecting, calibrating, mapping, validating, previewing, applying, and exporting 2D architectural CAD drawings in Plotify while coexisting cleanly with **P41 OpenBIM & IFC Interoperability**.

---

## 2. Honest Format & Entity Support Matrix

| Format / Feature | Status | Details |
| :--- | :--- | :--- |
| **ASCII DXF (`AC1009` R12 through `AC1032` 2018)** | **Supported (Import & Export)** | Native group-code state-machine parser (`HEADER`, `TABLES/LAYER`, `BLOCKS`, `ENTITIES`, `EOF`) and deterministic ASCII DXF generator. |
| **Binary DXF (`AutoCAD Binary DXF`)** | **Detected & Rejected with Guidance** | Preflight signature check detects binary DXF header and provides step-by-step instructions to re-save as ASCII DXF. |
| **Proprietary Binary DWG (`.dwg`, `AC1012`–`AC1032`)** | **Detected & Rejected with Guidance** | Preflight signature check detects `AC10xx` binary magic bytes and directs the user to export ASCII DXF from AutoCAD (`SAVEAS` / `DXFOUT`), LibreCAD, QCAD, or BricsCAD. |
| **IFC STEP (`.ifc`, `ISO-10303-21`)** | **Redirected to P41 OpenBIM** | Preflight detects IFC files and directs the user to the P41 OpenBIM & IFC Interoperability workspace. |

### Supported DXF Entity Subset

| DXF Entity | Import Handling | Export Handling |
| :--- | :--- | :--- |
| `LWPOLYLINE` | Closed rectilinear 4-corner polylines map to `FloorPlanRoom` or `PlotBoundary`. Open polylines map to wall linework or flagged geometry. | Exported for Plot Envelope (`A-SITE-BOUNDARY`), Setbacks (`A-SITE-SETBACK`), and Room Polygons (`A-AREA-F*`). |
| `POLYLINE` + `VERTEX` + `SEQEND` | Legacy vertex sequences assembled and evaluated identically to `LWPOLYLINE`. | Normalized to `LWPOLYLINE` on export. |
| `LINE` | Extracted as wall reference segments (`CADPreservedWallLine`) or plot boundary segments. | Exported for derived wall centerlines (`A-WALL-F*`) and structural grid axes (`S-GRID`). |
| `CIRCLE` | Extracted as structural column markers (`StructuralColumn`) when on a column layer. | Exported on `S-COLS-F*` for structural columns. |
| `ARC` | Preserved in drawing summary and layer statistics; flagged if placed on a room polygon layer. | Represented via room/wall segments. |
| `TEXT` / `MTEXT` | Matched spatially (point-in-polygon) to enclosing room polygons to infer room names and `RoomType` categories. | Exported on `A-ANNO-TEXT` at each room centroid with room name and area. |
| `INSERT` | Resolved against `BLOCKS` definitions with translation (`x, y`), scale (`xScale, yScale`), and rotation (`rotationDeg`); column blocks map to `StructuralColumn`. | Columns exported as standard `CIRCLE` markers. |
| `HATCH`, `SPLINE`, `3DSOLID`, `MESH`, `LEADER`, `XREF` | Counted and disclosed in `unsupportedEntityCounts` without failing import. | Not exported. |

---

## 3. Coordinate, Unit & Scale Calibration

1. **Header Inspection**: Reads `$INSUNITS` (`1` = Inches, `2` = Feet, `4` = Millimetres, `5` = Centimetres, `6` = Metres, `0` = Unitless) and `$MEASUREMENT`.
2. **No Silent Unit Guessing**: When `$INSUNITS === 0` (`unitless`) or missing, `unitRequiresConfirmation` is set to `true` and the UI blocks application until the user explicitly confirms the source unit (`mm`, `cm`, `m`, `in`, `ft`, or custom scale factor).
3. **Origin Alignment**: Supports `align-min-extents` (shifts minimum drawing bounding box to `(0, 0)`), `preserve-origin`, and `manual-offset`.

---

## 4. Safe Application, Coexistence with P41 IFC & Rollback Protection

- **New Project Creation**: `buildNewProjectFromCADMapping` constructs a complete `Project` with calibrated plot dimensions, validated `FloorPlanRoom[]`, derived `RoomRequirements`, `StructuralColumn[]`, and `cadInterop` provenance metadata.
- **Applying to Existing Project**: `applyCADMappingToExistingProject` automatically creates a `pre-restore-safety` checkpoint via `createProjectSnapshot` before applying changes.
- **Full Domain Preservation**: Both `merge-preserve` and `replace-mapped` modes explicitly preserve `existingProject.ifcInterop` (P41 OpenBIM & IFC metadata, GlobalId mappings, and preserved IFC elements), `brief`, `budget`, `siteContext`, `regulations`, `mepCoordination`, `designAlternatives`, `scenarios`, and `expertReviews`.

---

## 5. Future Cross-Account Integration Notes (Account A + Account B)

- `Project.cadInterop` is an optional additive field on `Project` (`src/types/project.ts`) alongside `Project.ifcInterop`.
- `cadService.ts` derives updated `RoomRequirements` counts when rooms are imported, which cleanly feeds into `briefService.ts` (P30) and `versioningService.ts` (P39) without modifying Account A's internal modules.
