# PLOTIFY — P45 CLIMATE HAZARD & RESILIENCE ANALYZER SPECIFICATION

- **Profile Identifier**: `plotify-climate-hazard-resilience-p45-v1`
- **Account & Scope**: Account B | Locked Roadmap P45 of P41–P50
- **Core Principle**: Climate hazard screening is only credible when location, hazard source, time horizon, scenario, resolution, and project vulnerability assumptions are explicit. Never turn coarse climate data into fake parcel-level certainty.

---

## 1. Conceptual Separation (Non-Negotiable)

The P45 engine (`src/types/climateResilience.ts` and `src/services/climateResilienceService.ts`) explicitly separates six distinct risk dimensions:

1. **Climate Hazards** (`ClimateHazardAssessmentItem`): Physical atmospheric or hydro-meteorological events and long-term trends (`extreme-heat`, `extreme-precipitation`, `flooding`, `drought-water-stress`, `severe-wind-cyclone`, `wildfire-weather`, `slope-erosion-landslide`, `cold-freeze-thaw-snow`).
2. **Exposure** (`AssetExposureMapping`): Presence of actual Plotify project elements (`floorPlan.rooms` on Floor 1, `mepCoordination` electrical panels & HVAC equipment, `structuralCoordination` framing/columns/beams, `terrainModeling` ground relief, `siteContext` access points, `ifcInterop` preserved entities) in hazard-susceptible positions.
3. **Vulnerability** (`AssetVulnerabilityRecord`): Sensitivity of specific building elements, materials, elevations (e.g., Finished Floor Elevation `finishedFloorElevationAboveGroundM`), or openings to damage or disruption.
4. **Consequences** (`ConsequenceCategory`): Potential impacts on occupant safety/egress, service continuity (power/water/HVAC), envelope/structural damage, and repair downtime/habitability.
5. **Adaptive Capacity** (`existingAdaptiveCapacityLevel` & `ResilienceAdaptationMeasure`): Existing or user-selected resilience features (raised FFE plinth, backflow valve, elevated MEP plinths, external brise-soleil shading, 5,000 L rainwater retention cistern, roof uplift straps, ember-resistant vents).
6. **Residual Risk** (`residualRiskLevel`): Risk remaining after selected adaptation measures are evaluated—never reduced to zero or claimed as "hazard-proof".

---

## 2. Temporal & Scenario Governance

Every climate indicator (`ClimateHazardIndicatorRecord`) carries:
- **Temporal Classification** (`ClimateTemporalClass`): `'current-recent-observation'`, `'historical-baseline'`, `'short-term-forecast'`, or `'future-climate-projection'`.
- **Scenario Identifier** (`ClimateScenarioId`): `'historical-baseline'`, `'ssp1-2.6'`, `'ssp2-4.5'`, `'ssp3-7.0'`, `'ssp5-8.5'`, or `'user-custom-scenario'`.
- **Time Horizon** (`ClimateTimeHorizon`): `'historical-1991-2020'`, `'recent-observed'`, `'near-term-2021-2040'`, `'mid-century-2041-2060'`, `'late-century-2081-2100'`, or `'custom-horizon'`.
- **Ensemble Uncertainty Spread** (`ClimateUncertaintySpread`): `p10`, `p50`, and `p90` percentile values from the CMIP6 multi-model ensemble.

---

## 3. Authoritative Source Registry & Jurisdiction Rules

| Source ID | Dataset & Issuing Organization | Spatial Resolution | Jurisdiction Scope | Usage & Honest Limitations |
|---|---|---|---|---|
| `SRC-IPCC-AR6-WGI-ATLAS` | IPCC AR6 WGI Interactive Atlas & CMIP6 Synthesis | 100 km | `global` | Regional synthesis (~1.0° grid); cannot resolve parcel microclimates. |
| `SRC-COPERNICUS-ERA5-CMIP6` | Copernicus C3S ERA5 Reanalysis (1991–2020) | 25 km | `global` | 0.25° gridded reanalysis; smoothes local convective cloudbursts. |
| `SRC-WB-CCKP-CMIP6` | World Bank CCKP (NASA NEX-GDDP-CMIP6) | 25 km | `global` | Downscaled 0.25° projections; does not model local hydraulic flood routing. |
| `SRC-FEMA-NFHL-MSC` | U.S. FEMA Flood Map Service Center (NFHL) | 0.05 km | `united-states` | Marked `'out-of-jurisdiction'` outside the US; requires FIRM zone input. |
| `SRC-PMD-FFD-PAK` | Pakistan Meteorological Dept (PMD) Flood Forecasting Division | 25 km | `pakistan` | Marked `'out-of-jurisdiction'` outside Pakistan; basin-scale monsoon guidance. |

---

## 4. Scientific & Discipline Boundaries (P41 / P42 / P43 / P44 / P46)

- **P43 Terrain Boundary**: P43 Delaunay TIN surfaces represent existing ground elevation points only. Plotify never computes 2D hydraulic flood depth, velocity, or FEMA Base Flood Elevation (BFE) compliance solely from climate grids and P43 terrain. Local-relative vertical datums (`'local-relative'`) are flagged as incompatible with orthometric flood-stage comparisons.
- **P44 Whole-Life Carbon Boundary**: Each resilience adaptation measure includes `embodiedCarbonTradeOff`, cross-referencing the project's active P44 Whole-Life Carbon assessment (`project.carbonAssessment`) without duplicating P44's life-cycle calculation engine.
- **P46 Thermal & Energy Boundary**: Outdoor ambient temperature indicators (`TXx`, `Days_TX35`) screen exterior thermal stress and envelope shading exposure only. Indoor operative temperature, daylight autonomy, solar heat gain coefficient (SHGC), and HVAC energy demand are strictly reserved for P46.
- **Missing Data Rule**: Missing coordinates, unmapped flood zones, or unknown building attributes (`finishedFloorElevationAboveGroundM === null`, `geotechnicalSlopeReportAvailable === false`) produce `'unassessed'` or `'insufficient-evidence'`—never `'low'` or `'very-low'` risk.
