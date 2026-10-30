# P43 — Terrain & Topographic Site Modeling Specification

**Roadmap Feature:** P43 of P41–P50 (Account B)  
**Status:** Implemented & Verified  
**Core Principle:** A visually convincing terrain surface is not proof of survey accuracy. Source elevations are preserved separately from derived TIN surfaces and contours, coordinate systems and vertical datums are never silently guessed, and precision is never fabricated.

---

## 1. Supported vs. Unsupported Terrain Formats

| Format Identifier | File Extensions | Support Level | Implementation & Conversion Notes |
| :--- | :--- | :--- | :--- |
| `CSV-ELEVATION-POINTS` | `.csv`, `.tsv`, `.txt`, `.xyz` | `SUPPORTED` | Deterministic parsing of tabular `X,Y,Z` (`Easting,Northing,Elevation` or `Lon,Lat,Elevation`) spot-elevation survey files with explicit column mapping, delimiter selection, duplicate-coordinate detection, and robust median/MAD outlier spike detection. |
| `GEOJSON-TOPOGRAPHY` | `.geojson`, `.json` | `SUPPORTED` | Deterministic parsing of GeoJSON `FeatureCollection` / `Feature` datasets containing 3D `Point` (`[x,y,z]`), `MultiPoint`, or elevation-tagged contour `LineString` / `Polygon` vertices (`properties.elevation` / `z` / `elev`). |
| `GEOTIFF-DEM-UNSUPPORTED` | `.tif`, `.tiff` | `UNSUPPORTED` | Binary raster GeoTIFF DEM files (`II*\0` / `MM\0*` magic bytes) are explicitly detected and rejected with conversion instructions (`gdal_translate -of XYZ input.tif output.csv`). |
| `LANDXML-TIN-UNSUPPORTED` | `.xml`, `.landxml` | `UNSUPPORTED` | Civil LandXML `<Surface>` / `<TIN>` files are explicitly detected and rejected with instructions to export survey points or breaklines as CSV (`X,Y,Z`) or GeoJSON. |
| `ESRI-ASCII-GRID-UNSUPPORTED` | `.asc`, `.grd` | `UNSUPPORTED` | ESRI ASCII Grid raster headers (`ncols`, `nrows`, `xllcorner`, `cellsize`) are explicitly detected and rejected with conversion guidance. |
| `CAD-2D-NO-ELEVATION` | `.dxf`, `.dwg` | `UNSUPPORTED` | 2D CAD drawings without valid 3D elevation points are blocked from generating fabricated terrain surfaces; users are directed to P42 CAD Drawing Exchange for 2D plan geometry. |

---

## 2. Coordinate Systems, Units, and Vertical Datum Rules

1. **No Silent Coordinate or Unit Guessing**:
   - Every imported dataset records `detectedHorizontalCRS` (`LOCAL_CARTESIAN`, `PROJECTED_EN`, `WGS84_GEOGRAPHIC_LON_LAT`, or `UNSPECIFIED`), `detectedHorizontalUnit`, `detectedVerticalUnit`, and `detectedVerticalDatum` (`LOCAL_SITE_DATUM`, `MEAN_SEA_LEVEL_ORTHOMETRIC`, `ELLIPSOIDAL_WGS84`, or `UNSPECIFIED`).
   - If units, horizontal CRS, or vertical datum are `UNSPECIFIED` or ambiguous, surface generation and project application are blocked (`UNCONFIRMED_UNITS_OR_CRS`, `UNCONFIRMED_VERTICAL_DATUM`) until the user explicitly confirms them.
2. **Geographic Lon/Lat vs. Planar Coordinates**:
   - Plotify never treats `WGS84_GEOGRAPHIC_LON_LAT` degrees as linear metres or feet.
   - When `WGS84_GEOGRAPHIC_LON_LAT` is confirmed, `projectWGS84LonLatToLocalMetres()` applies an explicit local tangent-plane (equirectangular cos-lat) metric projection anchored at the dataset reference origin (`111,132.92 m/deg` meridional, `111,412.84 * cos(lat) m/deg` parallel) and records a clear warning that official cadastral/civil submittals require a local projected grid (UTM / State Plane / National Grid).
3. **Site Alignment Modes**:
   - `preserve-coordinates`: Retains source planar coordinates directly in the project coordinate frame (`0..plotWidth` × `0..plotLength`).
   - `origin-min-extents`: Shifts the terrain bounding box minimum `(minX, minY)` to `(0, 0)`.
   - `center-on-plot`: Centers the terrain bounding box on `(plotWidth / 2, plotLength / 2)`.
   - `manual-offset`: Applies user-specified `offsetX`, `offsetY`, and orthogonal rotation (`0°`, `90°`, `180°`, `270°`).

---

## 3. Deterministic Surface Generation, Contours & Interpolation

1. **2D Bowyer–Watson Delaunay Triangulation (`DELAUNAY_TIN_PLANAR`)**:
   - Requires at least 3 non-collinear calibrated points (`validPointsUsed >= 3`).
   - If fewer than 3 valid points or collinear points are provided, surface generation is blocked (`INSUFFICIENT_VALID_POINTS` or `DEGENERATE_COLLINEAR_POINTS`) and `Method` is set to `INSUFFICIENT_DATA_POINTS_ONLY`.
   - Applies `maxTriangleEdgeLength` gap filtering to prevent long sliver triangles from bridging across un-surveyed concavities or sparse perimeter gaps.
2. **Piecewise-Planar Barycentric Elevation Query (`interpolateElevationOnTIN`)**:
   - Queries any `(x, y)` coordinate against the active TIN triangles using barycentric coordinates.
   - Returns `{ elevation, triangleId, slopeDegrees, aspectDegrees }` when inside a valid TIN triangle, or `null` when outside the TIN hull or inside an un-surveyed gap (never fabricates extrapolated elevations).
3. **Derived Contour Line Slicing**:
   - Contours are derived deterministically by intersecting horizontal planes at multiples of `contourInterval` with each TIN triangle's three edges, tagging major contours every `majorContourEvery` intervals.
4. **Topographic Cross-Section Profiles**:
   - Computes West–East (`Y = plotLength / 2`) and North–South (`X = plotWidth / 2`) centerline ground elevation profiles alongside the building footprint datum (`meanZ`).

---

## 4. Safe Project Persistence, Coexistence & Rollback

- **Provenance Separation**: Source survey points (`SourceTerrainPoint` with `rawX, rawY, rawZ`) are stored separately from calibrated points (`CalibratedTerrainPoint`) and derived TIN triangles/contours (`TerrainSurfaceMesh`).
- **Pre-Mutation Snapshot**: Both `applyTerrainModelToProject` and `removeTerrainModelFromProject` create an immutable project snapshot (`createProjectSnapshot`) before modifying `project.terrainModeling`.
- **Non-Destructive Coexistence**: Applying, replacing, or removing a terrain model preserves `floorPlan`, `structuralCoordination`, `mepCoordination`, `brief`, `regulations`, `budget`, `designAlternatives`, `scenarios`, `ifcInterop` (P41), and `cadInterop` (P42).

---

## 5. Explicit Non-Claims

Plotify P43 does **not** claim:
- Licensed land-surveyor boundary or topographic certification
- Geotechnical subsurface soil/bearing-capacity engineering
- Civil stormwater / hydrological flood routing or retaining-wall structural design
- Geostatistical kriging or bicubic spline extrapolation outside surveyed point extents
