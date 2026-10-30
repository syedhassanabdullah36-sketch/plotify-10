# P47 — Construction Site Logistics Planner Specification

## 1. Profile & Architectural Scope
- **Profile ID**: `plotify-site-logistics-p47-v1`
- **Discipline Role**: Evidence-based construction site logistics planning, phased spatial allocation, vehicle & pedestrian segregation, timed delivery booking, crane & heavy plant placement screening, temporary welfare/utilities coordination, and non-destructive alternative comparison.
- **Core Honesty Principle**: A visually clear 2D site layout is **not** proof of safe lifting, adequate ground-bearing capacity, highway compliance, or an approved construction method statement. Every critical engineering, geotechnical, utility, and lifting assumption requires an explicit verification status gate (`verified_approved`, `declared_pending_verification`, or `missing_evidence_blocker`).

## 2. Internal Coordinate & Unit System
- **Internal Calculation Unit**: Metres (`1 ft = 0.3048 m`).
- **Coordinate System**: Top-left parcel origin `(0, 0)` with `+X` East/Width and `+Y` South/Length in metres.
- **Building Footprint Extraction**: Automatically extracts the ground-floor bounding box in metres from `project.floorPlan.rooms` (or setback-derived envelope when no rooms are placed) without mutating project geometry.
- **Staleness Tracking**: Computes a deterministic fingerprint (`computeSiteLogisticsFingerprint`) across parcel dimensions, units, road orientation, storeys, floor plan rooms, site obstacles, access points, P43 terrain slope, P42 CAD entities, P41 IFC elements, and P46 envelope assemblies.

## 3. Spatial, Schedule & Safety Conflict Engine (12 Categories)
1. **Boundary & Setback Violations**: Flags access gates, storage zones, welfare cabins, or crane outriggers protruding outside `[0, siteWidthM] × [0, siteLengthM]`.
2. **Access Gate & Highway Permits**: Flags missing highway crossover permits (`blocker`), unconfirmed sightline visibility splays (`warning`), or unpermitted vehicle classes (`conflict`).
3. **Vehicle Route Geometry, Width, Turning & Gradient**:
   - Compares actual network path length against straight-line distance (`tortuosityFactor`) and estimates transit time with reversing marshalling penalties.
   - Verifies corridor width and minimum inner turning radius against `VEHICLE_DESIGN_CATALOG` reference classes.
   - Flags unmarshalled reversing manoeuvres (`blocker`), missing wheel-wash (`warning`), and haul route gradients exceeding 10% (`conflict`).
4. **Pedestrian-Vehicle Segregation & Crossings**:
   - Enforces `>= 1.20 m` walkway width and physical barriers (`blocker` if unsegregated shared surface).
   - Geometrically intersects pedestrian segments with vehicle segments in shared phases and flags any crossing not within `2.5 m` of a designated controlled crossing point (`conflict`).
5. **Storage, Laydown & Unloading Zones**:
   - Detects zone-to-zone overlaps, building footprint overlaps, restricted tree/easement encroachments, and route obstructions.
   - Enforces weather protection for moisture-sensitive/fragile P46 glazing packs and 110% spill containment bunds for COSHH stores.
6. **Delivery Schedule & Bay Congestion**:
   - Detects out-of-hours arrival windows, unloading bay double-booking on the same date/overlapping time window, inactive phase bays, and storage capacity overflows.
7. **Cranes, Heavy Plant & Lifting Safety Gates**:
   - Computes required Euclidean lift radius from crane center to pickup bay and target drop coordinate (`requiredLiftRadiusM <= operatingRadiusM`).
   - Flags `blocker` when geotechnical ground-bearing sign-off, Appointed Person Lift Plan, manufacturer load-chart SWL at radius, or subsurface PAS 128 utility clearance is missing, or when gross hook load exceeds SWL.
   - Flags unlicensed crane boom oversail beyond parcel boundaries (`conflict`).
8. **Temporary Facilities, Utilities & Emergency Routes**:
   - Verifies welfare potable water/power connections, existing buried/overhead service standoff buffers, and continuous unobstructed `>= 3.70 m` fire appliance access across all construction phases.

## 4. Cross-Discipline Integration (P41–P46)
- **P41 (OpenBIM / IFC)** & **P42 (CAD / DXF)**: Preserves imported elements and CAD reference constraints without destructive edits.
- **P43 (Terrain & Topography)**: Evaluates maximum site slope (%) against temporary haul road gradient limits without fabricating soil bearing capacity.
- **P44 (Whole-Life Carbon — Module A4)**: Computes deterministic transport emissions (`t·km × factor`) only for deliveries with explicitly declared one-way distance and emission factor.
- **P45 (Climate Resilience)**: Surfaces high/extreme climate hazards (cloudburst pluvial flooding, high wind) into site logistics risk findings.
- **P46 (Building Envelope)**: Links fragile glazing and facade cladding assemblies to covered vertical stillage zones.
