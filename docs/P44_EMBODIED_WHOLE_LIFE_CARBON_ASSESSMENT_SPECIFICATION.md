# P44 — Embodied & Whole-Life Carbon Assessment Specification

## 1. Overview & Supported Carbon Assessment Profile

Plotify **P44 (`plotify-whole-life-carbon-p44-v1`)** implements a deterministic, auditable Embodied & Whole-Life Carbon Assessment engine aligned with the structure of:

- **BS EN 15978:2011** (*Sustainability of construction works — Assessment of environmental performance of buildings — Calculation method*)
- **RICS Whole Life Carbon Assessment (WLCA) for the Built Environment, 2nd Edition (2024)**
- **BS EN 15804+A2:2019** (*Environmental Product Declarations — Core rules for construction products*)
- **ISO 14040:2006 / ISO 14044:2006** (*Life cycle assessment principles and requirements*)

Plotify P44 is a transparent engineering calculation and scenario-comparison engine. It does not claim third-party EPD verification authority, statutory certification, or dynamic hourly thermal simulation.

---

## 2. Supported Lifecycle Modules & System Boundary

| Module | Group | Title | Boundary & Aggregation Rule |
| :--- | :--- | :--- | :--- |
| **A0** | Upfront (`A0–A5`) | Pre-Construction Stage | Included in Upfront (`A0–A5`), Embodied (`A–C`), and Whole-Life (`A–C`) when assessed; marked `unassessed` (`null`) when not entered. |
| **A1–A3** | Upfront (`A0–A5`) | Product Stage (Cradle-to-Gate) | Derived from mapped inventory quantities converted to factor `declaredUnit` × `gwpValueKgCO2ePerUnit`. |
| **A4** | Upfront (`A0–A5`) | Transport to Project Site | Derived from element mass (`tonnes`) × transport distance (`km`) × freight factor (`kgCO2e/tonne-km`). |
| **A5** | Upfront (`A0–A5`) | Construction & Installation | Material waste emissions (`(A1–A3 + A4) × wasteRatePercent`) plus optional direct on-site energy/plant (`A5a`). |
| **B1** | In-Use Embodied (`B1–B5`) | Use Stage Release / Carbonation | Assessed when user enters fugitive refrigerant or carbonation balance; otherwise `unassessed` (`null`). |
| **B2–B5** | In-Use Embodied (`B1–B5`) | Maintenance, Repair & Replacement | Component replacement cycles over the Reference Study Period (`max(0, ceil(RSP / serviceLifeYears) - 1)`) plus optional annual maintenance. |
| **B6** | Operational (`B6–B8`) | Operational Energy Use | Assessed over the Reference Study Period when annual electricity/fuel consumption (`kWh/yr`) is provided; strictly marked `unavailable` (`null`, never `0`) when missing. |
| **B7** | Operational (`B6–B8`) | Operational Water Use | Assessed over the Reference Study Period when annual potable water (`m3/yr`) is provided; strictly marked `unavailable` (`null`, never `0`) when missing. |
| **B8** | Operational (`B6–B8`) | User Activities | Optional occupant activity emissions; marked `unassessed` (`null`) when not enabled. |
| **C1–C4** | End of Life (`C1–C4`) | Deconstruction, Processing & Disposal | Assessed from `endOfLifeC1C4KgCO2ePerUnit` plus mandatory biogenic EoL release balance when biogenic carbon is included in totals. |
| **D** | Beyond Boundary (`D`) | Reuse, Recovery, Recycling & Exported Energy | **Reported strictly separately.** Never subtracted from Upfront (`A0–A5`), Embodied (`A–C`), or Whole-Life (`A–C`) totals. |

---

## 3. Unit Conversion & Physical Property Governance

Supported declared units: `kg`, `tonne`, `m2`, `m3`, `m`, `item`, `kWh`, `m3-water`, `tonne-km`.

- `1 tonne = 1,000 kg`
- `m2 -> m3`: requires positive `thicknessM` (`volumeM3 = areaM2 × thicknessM`)
- `m3 -> kg`: requires positive `densityKgPerM3` (`massKg = volumeM3 × densityKgPerM3`)
- `m2 -> kg`: requires both positive `thicknessM` and positive `densityKgPerM3` (`massKg = areaM2 × thicknessM × densityKgPerM3`)
- Any cross-dimensional unit conversion lacking required physical properties is rejected (`valid: false`) and recorded as a `UNIT_CONVERSION_ERROR` validation issue.

---

## 4. P41 / P42 / P43 Cross-Feature Integrity Rules

1. **P41 OpenBIM & IFC Interoperability (`project.ifcInterop`)**:
   - IFC entities already mapped to native Plotify rooms, columns, or beams (`project.ifcInterop.idMappings`) are never extracted a second time from `preservedElements` (preventing double counting and logging `IFC_DUPLICATE_PREVENTED`).
   - Unmapped read-only `preservedElements` with explicit finite IFC quantities (`area` or `volume`) are included as `ifc-preserved-element` inventory items with full GlobalId traceability.
2. **P42 CAD Drawing Exchange (`project.cadInterop`)**:
   - 2D CAD lines, polylines, and arcs lack 3D height, thickness, and material metadata. Plotify P44 never fabricates 3D material volumes from 2D CAD reference geometry (`CAD_2D_VOLUME_NOT_INFERRED`).
3. **P43 Terrain & Topographic Site Modeling (`project.terrainModeling`)**:
   - Existing-ground survey points and Delaunay TIN meshes do not define a proposed excavation/grading prism or soil haul schedule. Plotify P44 never fabricates earthwork carbon from existing-ground terrain alone (`TERRAIN_EXCAVATION_NOT_INFERRED`).
