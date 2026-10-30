# PLOTIFY — P46: BUILDING ENVELOPE PERFORMANCE ANALYZER SPECIFICATION

- **Profile ID**: `plotify-envelope-performance-p46-v1`
- **Roadmap Position**: Account B | Locked Roadmap P46 of P41–P50
- **Version**: `1.0.0`

---

## 1. Methodological Scope & Governing Standards

| Method ID | Standard Reference | Supported Physical Scope | Explicit Exclusions & Limitations |
| :--- | :--- | :--- | :--- |
| `ISO-6946-2017-1D-LAYERED-OPAQUE` | ISO 6946:2017 | 1D steady-state thermal resistance ($R_i = d_i / \lambda_i$, $R_T = R_{si} + \sum R_i + R_{se}$) and transmittance ($U = 1 / R_T$) for planar layered opaque assemblies (walls, roofs, suspended floors, internal partitions). Includes ISO 6946 §6.9.4 well-ventilated cavity rule (external rainscreen layers bypassed and $R_{se} = R_{si}$). | Never applied to windows, glazed doors, curtain walls, or ground-coupled slabs without ground-coupling geometry. Does not perform 2D/3D repeating stud or point-fastener finite-element calculations unless explicitly declared. |
| `ISO-10077-1-DECLARED-WINDOW-DOOR` | ISO 10077-1 / EN 410 | Fenestration, skylights, curtain walls, and exterior doors using declared whole-window $U_w$ (or area-weighted $U_g / U_f$), SHGC ($g$-value), VT, and external shading factor $F_{sh}$. | Distinguishes whole-window $U_w$ from centre-of-glass $U_g$. Steady-state solar gain screening ($Q_{sol} = A_w \cdot SHGC \cdot F_{sh} \cdot I_{sol}$) is not an hourly dynamic simulation (ISO 52016-1). |
| `ISO-13370-DECLARED-GROUND-FLOOR` | ISO 13370:2017 | Ground-contact slabs using declared effective ground U-value or simplified ISO 13370 characteristic dimension $B' = A / (0.5 P)$ and equivalent thickness $d_t = w + \lambda_{soil}(R_{si} + R_f + R_{se})$. | Blocks simple 1D exterior-air ISO 6946 math when ground-coupling parameters are missing. Does not model monthly periodic ground storage amplitudes. |
| `ISO-13788-2012-SURFACE-GLASER-SCREENING` | ISO 13788:2012 | Interior surface temperature $T_{si} = T_i - U \cdot R_{si}(T_i - T_e)$, temperature factor $f_{Rsi} = (T_{si} - T_e)/(T_i - T_e)$, dew point $T_{dp}$ (Magnus formula), 80% critical surface RH mould-risk threshold ($f_{Rsi,min}$), and 1D Glaser interstitial vapour diffusion ($s_d = \mu \cdot d$). | Does not model transient liquid capillary suction, wind-driven rain penetration, solar vapour drive, or convective air-leakage moisture transport (ASHRAE 160 / EN 15026 / WUFI). |
| `ISO-14683-DECLARED-THERMAL-BRIDGE` | ISO 14683 / ISO 13789 | Linear ($\psi \cdot L$) and point ($\chi \cdot n$) thermal bridge heat transfer coefficient $H_{tb}$ and equivalent $\Delta U_{tb} = H_{tb} / A_{env,net}$. | Does not invent $\psi$-values from 3D geometry without a 2D/3D numerical solver. Includes explicit guard (`alreadyIncludedInAssemblyUValue`) to prevent double counting. |
| `STEADY-STATE-UA-DELTA-T-SCREENING` | ISO 13789:2017 | Area-weighted envelope transmittance $\bar{U}_{env} = \sum(U_i \cdot A_{net,i}) / \sum A_{net,i}$ and steady-state design conductive heat transfer $Q_{tr} = H_{tr} \cdot \Delta T$ (W). | Steady-state peak heat flow (W) is not annual heating/cooling operational energy demand ($\text{kWh/yr}$) and is never presented as statutory energy-code compliance proof. |

---

## 2. Surface Film Resistance Defaults (ISO 6946:2017 Table 1)

| Heat-Flow Direction | Internal Surface Resistance $R_{si}$ ($\text{m}^2\cdot\text{K/W}$) | External Surface Resistance $R_{se}$ ($\text{m}^2\cdot\text{K/W}$) |
| :--- | ---: | ---: |
| Horizontal (Walls, Windows, Doors) | `0.13` | `0.04` |
| Upward (Roofs, Skylights) | `0.10` | `0.04` |
| Downward (Suspended Floors) | `0.17` | `0.04` |

---

## 3. Cross-Feature Integration Contracts (P41–P45)

1. **P41 OpenBIM & IFC Interoperability (`project.ifcInterop`)**:
   - Inspects `preservedElements` for `Pset_WallCommon`, `Pset_WindowCommon`, and `Pset_RoofCommon` `ThermalTransmittance` properties and deduplicates IFC preserved entities against native envelope surfaces so envelope areas are never double-counted.
2. **P42 CAD Drawing Exchange (`project.cadInterop`)**:
   - 2D CAD lines/polylines are never silently extrapolated into 3D wall heights or thermal insulation layers; an explicit provenance warning is recorded when 2D CAD references exist.
3. **P43 Terrain & Topographic Site Modeling (`project.terrainModeling`)**:
   - Preserves terrain meshes, survey points, and calibration metadata untouched when envelope assessments are saved.
4. **P44 Embodied & Whole-Life Carbon Assessment (`project.carbonAssessment`)**:
   - Links material catalog entries and envelope improvement options (`imp-wall-insulation-upgrade`, `imp-window-triple-glazing`, `imp-thermal-bridge-mitigation`) to upfront embodied carbon increments ($\text{kgCO}_2\text{e}$ Modules A1–A3) so thermal upgrades can be weighed against embodied carbon impact.
5. **P45 Climate Hazard & Resilience Analyzer (`project.climateResilience`)**:
   - Synchronizes summer cooling design temperatures with P45 extreme-heat indicators (`TXx`) and active climate scenario metadata when available.
