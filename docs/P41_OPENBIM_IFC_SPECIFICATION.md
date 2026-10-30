# P41 — OpenBIM & IFC Interoperability Specification

**Roadmap Scope:** P41 (Account B | P41–P50 Expansion Roadmap)  
**Profile Identifier:** `plotify-ifc-profile-v1`  
**Intermediate Model Version:** `plotify-ifc-ir-v1`

---

## 1. Purpose & Honest Interoperability Scope

Plotify's OpenBIM & IFC Interoperability module establishes a deterministic, auditable bridge between supported Industry Foundation Classes (IFC) STEP files (`ISO-10303-21`) and Plotify's architectural building model.

Rather than claiming universal compatibility with all IFC schemas, representations, and external BIM authoring workflows, Plotify implements a **documented, verified subset** with explicit warnings, preserved provenance metadata, and user-controlled import mapping.

---

## 2. Supported IFC Schemas & File Envelopes

- **Supported Schemas:** `IFC2X3`, `IFC4` (via `FILE_SCHEMA` in ISO 10303-21 `HEADER;`).
- **Unsupported Schemas:** `IFC4X3`, `IFC4X2`, `IFC2X2`, `IFC2X`, IFC-XML (`.ifcXML`), and IFC-ZIP (`.ifcZIP`) are explicitly rejected with a structured `UNSUPPORTED_SCHEMA` or `INVALID_ENVELOPE` error.
- **Safety Limits:**
  - Maximum upload size: `15 MB` (`15,728,640` bytes).
  - Maximum parsed STEP instances: `50,000` entities.
  - All string literals (`Name`, `Description`, `ObjectType`, property values) are sanitized against control characters and HTML/script tags (`<`, `>`) and capped at 240 characters.

---

## 3. Entity Support Profile

| IFC Entity | Support Level | Plotify Mapping / Handling |
| :--- | :--- | :--- |
| `IFCPROJECT` | **Full** | Mapped to project name, description, unit assignment, and `projectGlobalId` provenance. |
| `IFCSITE` | **Full** | Mapped to plot width/length dimensions (`plotWidth`, `plotLength`) and `siteGlobalId` provenance. |
| `IFCBUILDING` | **Full** | Mapped to building container metadata and `buildingGlobalId` provenance. |
| `IFCBUILDINGSTOREY` | **Full** | Sorted by `Elevation` (`0` = 1st Floor, `1` = 2nd Floor, etc.) and mapped to `project.floors` and room/column floor indices. |
| `IFCSPACE` | **Full** | Mapped to `FloorPlanRoom` (`name`, `type`, `floor`, `x`, `y`, `width`, `length`, `color`) when backed by rectangular `IfcExtrudedAreaSolid` (`IfcRectangleProfileDef` or axis-aligned 4-point `IfcArbitraryClosedProfileDef`) or `IfcBoundingBox` / `Qto_SpaceBaseQuantities`. |
| `IFCCOLUMN` | **Full** | Mapped to `StructuralColumn` (`label`, `floor`, `x`, `y`, `width`, `depth`, `profile`) when backed by `IfcRectangleProfileDef` or `IfcCircleProfileDef`. |
| `IFCBEAM` | **Partial (Metadata + Framing)** | Informs `project.structuralCoordination.framingSystem` and is preserved in `unmappedPreservedEntities` with full GlobalId and property sets. |
| `IFCWALL`, `IFCWALLSTANDARDCASE` | **Partial (Metadata Only)** | Plotify derives walls implicitly from room boundaries. Explicit IFC wall instances are preserved in `unmappedPreservedEntities` (GlobalId, Name, Storey, Material, Psets) without fabricating standalone wall solids. |
| `IFCSLAB`, `IFCDOOR`, `IFCWINDOW`, `IFCROOF`, `IFCOVERING` | **Partial (Metadata Only)** | Preserved in `unmappedPreservedEntities` with full GlobalId, storey containment, material associations, and property sets. |
| `IFCRELAGGREGATES`, `IFCRELCONTAINEDINSPATIALSTRUCTURE` | **Full** | Resolved to build the spatial hierarchy (`IfcProject -> IfcSite -> IfcBuilding -> IfcBuildingStorey -> Elements`). |
| `IFCRELDEFINESBYPROPERTIES`, `IFCPROPERTYSET`, `IFCELEMENTQUANTITY` | **Full** | Attached to target entities (`Pset_*` and `Qto_*`) and inspected for room classification and base quantities. |
| `IFCRELASSOCIATESMATERIAL`, `IFCMATERIAL`, `IFCMATERIALLAYERSET` | **Partial** | Extracted and attached to `IFCEntityRecord.materials`. |
| `IFCRELASSOCIATESCLASSIFICATION`, `IFCCLASSIFICATIONREFERENCE` | **Partial** | Extracted and attached to `IFCEntityRecord.classifications`. |
| `IFCSTAIR`, `IFCRAMP`, `IFCCURTAINWALL`, `IFCFURNISHINGELEMENT`, `IFCFLOWSEGMENT`, `IFCDISTRIBUTIONELEMENT` | **Unsupported** | Explicitly reported in `unsupportedEntityCounts` and `warnings`; never fabricated. |

---

## 4. Geometry & Coordinate System Rules

1. **Supported Geometry Representations:**
   - `IfcExtrudedAreaSolid` swept from `IfcRectangleProfileDef` (`XDim`, `YDim`).
   - `IfcExtrudedAreaSolid` swept from `IfcCircleProfileDef` (`Radius`) for circular structural columns.
   - `IfcExtrudedAreaSolid` swept from axis-aligned 4-point rectangular `IfcArbitraryClosedProfileDef` (`IfcPolyline`).
   - `IfcBoundingBox` (`XDim`, `YDim`, `ZDim`).
2. **Unsupported Geometry Representations:**
   - `IfcFacetedBrep`, `IfcTriangulatedFaceSet`, `IfcPolygonalFaceSet`, `IfcBooleanClippingResult`, `IfcBooleanResult`, `IfcSweptDiskSolid`, `IfcAdvancedBrep`, and non-rectangular polygons are **never approximated or fabricated**. Entities using these representations emit an `UNSUPPORTED_GEOMETRY` warning and are preserved as metadata-only records.
3. **Coordinate Convention:**
   - Plotify stores `FloorPlanRoom` coordinates (`x`, `y`) at the top-left corner of the room rectangle on the plot, whereas IFC `IfcRectangleProfileDef` is centered at its local placement origin unless offset by `Position`.
   - On import, center-origin `IfcRectangleProfileDef` placements are converted to Plotify top-left room coordinates (`x = centerX - width/2`, `y = centerY - length/2`), and `IfcColumn` placements preserve center coordinates (`x`, `y`) matching `StructuralColumn`.
   - On export, Plotify room coordinates are converted back to center-origin `IfcRectangleProfileDef` placements (`x + width/2`, `y + length/2`) so exported IFC models and round-trip re-imports remain spatially aligned.

---

## 5. Unit Detection & Conversion Rules

- Plotify inspects `IFCUNITASSIGNMENT` and `IFCSIUNIT` / `IFCCONVERSIONBASEDUNIT` for `.LENGTHUNIT.`:
  - `METRE` (`1.0 m` per unit)
  - `MILLIMETRE` (`0.001 m` per unit)
  - `CENTIMETRE` (`0.01 m` per unit)
  - `FOOT` (`0.3048 m` per unit)
  - `INCH` (`0.0254 m` per unit)
- If no length unit is declared in the file, Plotify defaults to `METRE` (`1.0 m`) and emits a `UNIT_FALLBACK` warning.
- All imported dimensions are converted to the target Plotify project unit (`feet` or `meters`) with 0.01 precision.

---

## 6. Safe Application & Provenance Preservation

- **Source vs. Internal IDs:** Every mapped room or column receives a clean Plotify internal ID (`ifc-room-*`, `ifc-col-*`) while storing its source IFC `GlobalId`, `#stepId`, `ifcType`, and `storeyName` in `project.ifcInterop.elementProvenance`.
- **Safe Application to Existing Projects:**
  - Before applying an IFC mapping to an existing project, `applyIFCMappingToExistingProject` automatically creates a `pre-restore-safety` snapshot in `versioningService` so the user can roll back at any time.
  - Unrelated Plotify domains (`siteContext`, `brief`, `regulations`, `mepCoordination`, `costPlanning`, `designAlternatives`, `scenarios`) remain untouched.
  - Existing rooms and columns can either be **merged** (`mergeStrategy: 'merge-preserve'`, skipping GlobalId collisions) or **replaced** (`mergeStrategy: 'replace-mapped-domains'`).

---

## 7. IFC Export & Round-Trip Rules

- `exportProjectToIFC` generates a standards-conforming ISO 10303-21 STEP file (`IFC4` or `IFC2X3`) containing:
  - Spatial hierarchy: `IFCPROJECT` -> `IFCSITE` -> `IFCBUILDING` -> `IFCBUILDINGSTOREY` (one per floor).
  - `IFCSPACE` with `IfcExtrudedAreaSolid` (`IfcRectangleProfileDef`), `Pset_SpaceCommon`, and `Qto_SpaceBaseQuantities`.
  - `IFCCOLUMN` with `IfcExtrudedAreaSolid` (`IfcRectangleProfileDef` or `IfcCircleProfileDef`) and `Pset_ColumnCommon`.
- If a Plotify element has prior IFC provenance in `project.ifcInterop.elementProvenance`, its original `GlobalId` is reused on export; otherwise, a deterministic 22-character base64 IFC `GlobalId` is generated from `(projectId, elementId)`.
- `validateIFCFileStructure` independently verifies the `ISO-10303-21;` / `HEADER;` / `DATA;` / `END-ISO-10303-21;` envelope, checks for duplicate `#stepId` definitions, verifies that all `#ref` pointers resolve, and checks spatial hierarchy completeness.
