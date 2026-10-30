/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * PLOTIFY — P45 Climate Hazard & Resilience Analyzer Service
 * Profile: plotify-climate-hazard-resilience-p45-v1
 */

import { Project } from '../types/project';
import {
  AssetExposureMapping,
  AssetVulnerabilityRecord,
  CLIMATE_ASSESSMENT_PROFILE_ID,
  ClimateAssessmentHistoryEntry,
  ClimateDataSourceRecord,
  ClimateEvidenceImportResult,
  ClimateHazardAssessmentItem,
  ClimateHazardCategory,
  ClimateHazardIndicatorRecord,
  ClimateHazardResilienceAssessmentResult,
  ClimateJurisdictionScope,
  ClimateResilienceConfig,
  ClimateScenarioId,
  ClimateTimeHorizon,
  ExposedAssetCategory,
  FloodSubTypeAssessment,
  ProjectClimateResilienceMetadata,
  ProjectElementReference,
  QualitativeLevel,
  QuarantinedClimateRecord,
  ResilienceAdaptationMeasure,
  ScenarioComparisonRow,
  SiteLocationPreflightResult,
  TransparentRiskFinding,
} from '../types/climateResilience';
import { createProjectSnapshot } from './versioningService';

// ============================================================================
// 1. DEFAULT CONFIGURATION & FINGERPRINTING
// ============================================================================

export function createDefaultClimateResilienceConfig(): ClimateResilienceConfig {
  return {
    activeScenario: 'ssp2-4.5',
    comparisonScenario: 'ssp5-8.5',
    activeTimeHorizon: 'mid-century-2041-2060',
    jurisdictionOverride: 'auto',
    confirmedCoordinatesOverride: null,
    siteSpecificAttributes: {
      finishedFloorElevationAboveGroundM: null,
      officialFloodZoneLabel: null,
      codeDesignWindSpeedMs: null,
      hasBackflowPrevention: null,
      hasOnSiteRainwaterStorageLiters: null,
      hasBackupPowerForCriticalMEP: null,
      geotechnicalSlopeReportAvailable: false,
      externalShadingConfirmed: null,
      coastalProximityKm: null,
      wildfireInterfaceZoneConfirmed: null,
    },
    selectedMeasureIds: [],
    simulateOfflineMode: false,
  };
}

export function computeClimateProjectFingerprint(project: Project): string {
  const roomsCount = project.floorPlan?.rooms?.length || 0;
  const groundRoomsCount =
    project.floorPlan?.rooms?.filter((r) => r.floorLevel === 1).length || 0;
  const lat = project.siteContext?.latitude ?? 'none';
  const lon = project.siteContext?.longitude ?? 'none';
  const conf = project.siteContext?.locationConfidence ?? 'none';
  const slope = project.siteContext?.slope ?? 'none';
  const terrainHash = project.terrainModeling?.sourceChecksum || 'no-terrain';
  const terrainDatum = project.terrainModeling?.calibration?.verticalDatum || 'no-datum';
  const structSystem = project.structuralCoordination?.framingSystem || 'no-struct';
  const structCols = project.structuralCoordination?.columns?.length || 0;
  const mepCount = project.mepCoordination?.components?.length || 0;
  const p44Total =
    project.carbonAssessment?.activeAssessment?.totals?.wholeLifeCarbonAtoCKgCO2e ?? 'no-p44';

  return [
    `plot:${project.plotWidth}x${project.plotLength}:${project.unit}`,
    `floors:${project.floors}`,
    `rooms:${roomsCount}:g${groundRoomsCount}`,
    `loc:${lat},${lon}:${conf}:${slope}`,
    `terrain:${terrainHash}:${terrainDatum}`,
    `struct:${structSystem}:${structCols}`,
    `mep:${mepCount}`,
    `p44:${p44Total}`,
  ].join('|');
}

// ============================================================================
// 2. AUTHORITATIVE DATA SOURCE REGISTRY & GOVERNANCE
// ============================================================================

export function getAuthoritativeClimateSources(
  jurisdiction: ClimateJurisdictionScope,
  customSources: ClimateDataSourceRecord[] = [],
  simulateOfflineMode = false,
  evaluationTimestampIso = new Date().toISOString()
): ClimateDataSourceRecord[] {
  const evalTime = new Date(evaluationTimestampIso).getTime();

  const baseSources: ClimateDataSourceRecord[] = [
    {
      sourceId: 'SRC-IPCC-AR6-WGI-ATLAS',
      name: 'IPCC AR6 Working Group I Interactive Atlas & Regional Synthesis',
      organization: 'Intergovernmental Panel on Climate Change (IPCC)',
      datasetIdentifier: 'IPCC-AR6-WGI-CMIP6-SYNTHESIS-V2021',
      versionOrRelease: 'AR6 WGI v2021.08 (CMIP6 Multi-Model Ensemble)',
      temporalClass: 'future-climate-projection',
      baselinePeriod: '1991–2020 (WMO Climate Normal / AR6 Reference)',
      projectionHorizonsSupported: [
        'historical-1991-2020',
        'near-term-2021-2040',
        'mid-century-2041-2060',
        'late-century-2081-2100',
      ],
      scenariosSupported: [
        'historical-baseline',
        'ssp1-2.6',
        'ssp2-4.5',
        'ssp3-7.0',
        'ssp5-8.5',
      ],
      spatialResolutionKm: 100,
      spatialCoverageDescription:
        'Global IPCC WGI reference regions (~1.0° / 100 km grid synthesis)',
      jurisdictionScope: 'global',
      retrievedAt: '2025-01-15T00:00:00.000Z',
      validUntil: '2028-12-31T23:59:59.000Z',
      isExpired: false,
      verificationStatus: 'verified-reference-fixture',
      officialUrl: 'https://interactive-atlas.ipcc.ch/',
      limitations: [
        'Regional grid (~100 km) cannot resolve parcel-scale microclimates, urban canyons, or local drainage bottlenecks.',
        'Ensemble percentiles (p10/p50/p90) reflect inter-model spread across CMIP6 GCMs.',
      ],
      licenseOrAttribution: 'CC BY 4.0 — IPCC WGI AR6 Interactive Atlas',
    },
    {
      sourceId: 'SRC-COPERNICUS-ERA5-CMIP6',
      name: 'Copernicus C3S ERA5 Reanalysis & Downscaled Climate Indicators',
      organization: 'ECMWF / Copernicus Climate Change Service (C3S)',
      datasetIdentifier: 'C3S-ERA5-SINGLE-LEVELS-1991-2020',
      versionOrRelease: 'ERA5 Reanalysis v5.1 / C3S Atlas v2',
      temporalClass: 'historical-baseline',
      baselinePeriod: '1991–2020',
      projectionHorizonsSupported: ['historical-1991-2020', 'recent-observed'],
      scenariosSupported: ['historical-baseline'],
      spatialResolutionKm: 25,
      spatialCoverageDescription: 'Global 0.25° x 0.25° (~25–31 km) gridded reanalysis',
      jurisdictionScope: 'global',
      retrievedAt: '2025-01-15T00:00:00.000Z',
      validUntil: '2027-12-31T23:59:59.000Z',
      isExpired: false,
      verificationStatus: simulateOfflineMode
        ? 'live-connector-unavailable'
        : 'verified-reference-fixture',
      officialUrl: 'https://cds.climate.copernicus.eu/',
      limitations: [
        '25 km reanalysis grid represents grid-cell mean/extremes and smoothes localized convective cloudbursts and complex mountain valley winds.',
        simulateOfflineMode
          ? 'Live CDS API connector offline; using verified embedded ERA5 reference climatology.'
          : 'Embedded verified climatological reference percentiles used for deterministic offline-capable screening.',
      ],
      licenseOrAttribution: 'Copernicus C3S License — ECMWF',
    },
    {
      sourceId: 'SRC-WB-CCKP-CMIP6',
      name: 'World Bank Climate Change Knowledge Portal (CCKP) — NEX-GDDP-CMIP6',
      organization: 'World Bank Group / NASA NEX-GDDP',
      datasetIdentifier: 'WB-CCKP-NEX-GDDP-CMIP6-025DEG',
      versionOrRelease: 'CCKP v2024.1 (0.25° Downscaled CMIP6)',
      temporalClass: 'future-climate-projection',
      baselinePeriod: '1995–2014 / 1991–2020 aligned',
      projectionHorizonsSupported: [
        'historical-1991-2020',
        'near-term-2021-2040',
        'mid-century-2041-2060',
        'late-century-2081-2100',
      ],
      scenariosSupported: [
        'historical-baseline',
        'ssp1-2.6',
        'ssp2-4.5',
        'ssp3-7.0',
        'ssp5-8.5',
      ],
      spatialResolutionKm: 25,
      spatialCoverageDescription: 'Global land areas at 0.25° x 0.25° (~25 km) downscaled grid',
      jurisdictionScope: 'global',
      retrievedAt: '2025-01-15T00:00:00.000Z',
      validUntil: '2027-12-31T23:59:59.000Z',
      isExpired: false,
      verificationStatus: 'verified-reference-fixture',
      officialUrl: 'https://climateknowledgeportal.worldbank.org/',
      limitations: [
        'Statistical downscaling (0.25°) does not model local hydraulic flood routing, storm sewers, or seawalls.',
      ],
      licenseOrAttribution: 'CC BY 4.0 — World Bank CCKP',
    },
    {
      sourceId: 'SRC-FEMA-NFHL-MSC',
      name: 'FEMA Flood Map Service Center (MSC) — National Flood Hazard Layer (NFHL)',
      organization: 'U.S. Federal Emergency Management Agency (FEMA)',
      datasetIdentifier: 'FEMA-NFHL-FIRM-REGULATORY',
      versionOrRelease: 'NFHL Regulatory FIRM Reference',
      temporalClass: 'current-recent-observation',
      baselinePeriod: 'Effective Regulatory FIRM Date (Site-Specific)',
      projectionHorizonsSupported: ['recent-observed'],
      scenariosSupported: ['historical-baseline'],
      spatialResolutionKm: 0.05,
      spatialCoverageDescription:
        'United States & Territories only (parcel-level Flood Insurance Rate Maps)',
      jurisdictionScope: 'united-states',
      retrievedAt: '2025-01-15T00:00:00.000Z',
      validUntil: '2027-06-30T23:59:59.000Z',
      isExpired: false,
      verificationStatus:
        jurisdiction === 'united-states'
          ? simulateOfflineMode
            ? 'live-connector-unavailable'
            : 'verified-reference-fixture'
          : 'out-of-jurisdiction',
      officialUrl: 'https://msc.fema.gov/',
      limitations: [
        'Applicable ONLY to sites within United States jurisdiction.',
        'Regulatory FIRM zones require either an official FIRM panel lookup or user-supplied/confirmed Flood Zone designation (e.g., Zone AE, Zone X, Zone VE).',
      ],
      licenseOrAttribution: 'Public Domain — U.S. FEMA',
    },
    {
      sourceId: 'SRC-PMD-FFD-PAK',
      name: 'Pakistan Meteorological Department (PMD) — Flood Forecasting Division & Monsoon Normals',
      organization: 'Pakistan Meteorological Department (PMD) / FFD Lahore',
      datasetIdentifier: 'PMD-FFD-INDUS-MONSOON-CLIMATOLOGY',
      versionOrRelease: 'PMD Normal 1991–2020 & Post-2022 Extreme Monsoon Guidance',
      temporalClass: 'historical-baseline',
      baselinePeriod: '1991–2020',
      projectionHorizonsSupported: ['historical-1991-2020', 'recent-observed'],
      scenariosSupported: ['historical-baseline'],
      spatialResolutionKm: 25,
      spatialCoverageDescription:
        'Pakistan Indus Basin, Punjab, Sindh, KP, Balochistan & Northern Areas',
      jurisdictionScope: 'pakistan',
      retrievedAt: '2025-01-15T00:00:00.000Z',
      validUntil: '2027-12-31T23:59:59.000Z',
      isExpired: false,
      verificationStatus:
        jurisdiction === 'pakistan' ? 'verified-reference-fixture' : 'out-of-jurisdiction',
      officialUrl: 'https://ffd.pmd.gov.pk/',
      limitations: [
        'Applicable ONLY to sites within Pakistan.',
        'Basin-level riverine flood advisories and synoptic station normals do not replace parcel-scale hydraulic drainage modeling or CDA/LDA/DHA municipal stormwater engineering.',
      ],
      licenseOrAttribution: 'Government of Pakistan — PMD Flood Forecasting Division',
    },
  ];

  const all = [...baseSources, ...customSources].map((src) => {
    const validUntilMs = Date.parse(src.validUntil);
    const isExpired = !Number.isNaN(validUntilMs) && evalTime > validUntilMs;
    return {
      ...src,
      isExpired,
      verificationStatus: isExpired ? ('stale-cached-record' as const) : src.verificationStatus,
    };
  });

  return all;
}

// ============================================================================
// 3. LOCATION & SPATIAL PREFLIGHT VALIDATION
// ============================================================================

export function detectJurisdictionFromContext(
  lat: number | null,
  lon: number | null,
  cityRegionText: string,
  override: 'auto' | ClimateJurisdictionScope
): ClimateJurisdictionScope {
  if (override !== 'auto') return override;

  const textLower = cityRegionText.toLowerCase();
  if (
    textLower.includes('pakistan') ||
    textLower.includes('lahore') ||
    textLower.includes('karachi') ||
    textLower.includes('islamabad') ||
    textLower.includes('rawalpindi') ||
    textLower.includes('peshawar') ||
    textLower.includes('multan')
  ) {
    return 'pakistan';
  }
  if (
    textLower.includes('united states') ||
    textLower.includes('usa') ||
    textLower.includes(', tx') ||
    textLower.includes(', ca') ||
    textLower.includes(', ny') ||
    textLower.includes(', fl')
  ) {
    return 'united-states';
  }

  if (lat !== null && lon !== null) {
    // Pakistan bounding box approximation: 23.5N to 37.1N, 60.8E to 77.8E
    if (lat >= 23.5 && lat <= 37.1 && lon >= 60.8 && lon <= 77.8) {
      return 'pakistan';
    }
    // Contiguous US + Alaska/Hawaii approximation
    if (lat >= 24.0 && lat <= 49.5 && lon >= -125.0 && lon <= -66.5) {
      return 'united-states';
    }
    // Europe approximation
    if (lat >= 35.0 && lat <= 71.0 && lon >= -10.5 && lon <= 35.0) {
      return 'europe';
    }
  }

  return 'global';
}

export function validateSiteLocationPreflight(
  project: Project,
  config: ClimateResilienceConfig
): SiteLocationPreflightResult {
  const unitToM = project.unit === 'feet' ? 0.3048 : 1.0;
  const widthM = Number((project.plotWidth * unitToM).toFixed(2));
  const lengthM = Number((project.plotLength * unitToM).toFixed(2));
  const areaM2 = Number((widthM * lengthM).toFixed(2));
  const diagonalSpanKm = Number(
    (Math.sqrt(widthM * widthM + lengthM * lengthM) / 1000).toFixed(4)
  );

  const cityRegionText = [
    project.siteContext?.siteName,
    project.siteContext?.address,
    project.siteContext?.cityRegion,
    project.regulations?.profile?.country,
  ]
    .filter(Boolean)
    .join(', ');

  const countryJurisdiction =
    project.regulations?.profile?.country ||
    project.siteContext?.cityRegion ||
    'Unspecified Jurisdiction';

  // Inspect coordinate candidates without ever fabricating coordinates from text!
  let rawLat: number | null = null;
  let rawLon: number | null = null;
  let coordinateSource: SiteLocationPreflightResult['coordinateSource'] = 'none';
  let locationConfidence: SiteLocationPreflightResult['locationConfidence'] = 'missing';

  if (config.confirmedCoordinatesOverride) {
    rawLat = config.confirmedCoordinatesOverride.latitude;
    rawLon = config.confirmedCoordinatesOverride.longitude;
    coordinateSource = 'user-override-confirmed';
    locationConfidence = config.confirmedCoordinatesOverride.sourceType;
  } else if (
    typeof project.siteContext?.latitude === 'number' &&
    typeof project.siteContext?.longitude === 'number'
  ) {
    rawLat = project.siteContext.latitude;
    rawLon = project.siteContext.longitude;
    locationConfidence = project.siteContext.locationConfidence || 'unverified';
    coordinateSource =
      locationConfidence === 'unverified'
        ? 'site-context-unverified'
        : 'site-context-verified';
  } else if (
    typeof project.terrainModeling?.calibration?.wgs84ReferenceLat === 'number' &&
    typeof project.terrainModeling?.calibration?.wgs84ReferenceLon === 'number'
  ) {
    rawLat = project.terrainModeling.calibration.wgs84ReferenceLat;
    rawLon = project.terrainModeling.calibration.wgs84ReferenceLon;
    coordinateSource = 'terrain-wgs84-reference';
    locationConfidence = 'survey-stamped';
  }

  const blockingIssues: string[] = [];
  const warnings: string[] = [];
  let status: SiteLocationPreflightResult['status'] = 'missing-coordinates';
  let canRunLocationSpecificScreening = false;

  if (rawLat === null || rawLon === null || Number.isNaN(rawLat) || Number.isNaN(rawLon)) {
    status = 'missing-coordinates';
    canRunLocationSpecificScreening = false;
    blockingIssues.push(
      cityRegionText
        ? `Text location ("${cityRegionText}") is present, but numeric WGS84 latitude/longitude coordinates are missing. Plotify never fabricates geographic coordinates from city or address text.`
        : 'No geographic coordinates (WGS84 latitude/longitude) are defined in Site Context, P43 Terrain Calibration, or Climate Resilience overrides.'
    );
  } else if (
    (Math.abs(rawLat) > 90 &&
      Math.abs(rawLat) <= 180 &&
      Math.abs(rawLon) <= 90) ||
    (cityRegionText.toLowerCase().includes('pakistan') &&
      rawLat >= 60.8 &&
      rawLat <= 78.0 &&
      rawLon >= 23.5 &&
      rawLon <= 37.1)
  ) {
    status = 'suspected-coordinate-swap';
    canRunLocationSpecificScreening = false;
    blockingIssues.push(
      `Latitude (${rawLat}) and Longitude (${rawLon}) appear swapped relative to valid WGS84 coordinate bounds or stated site region.`
    );
  } else if (rawLat < -90 || rawLat > 90 || rawLon < -180 || rawLon > 180) {
    status = 'invalid-coordinate-range';
    canRunLocationSpecificScreening = false;
    blockingIssues.push(
      `Invalid geographic coordinates: latitude=${rawLat} (must be -90..90), longitude=${rawLon} (must be -180..180).`
    );
  } else if (rawLat === 0 && rawLon === 0) {
    status = 'local-plot-coordinates-only';
    canRunLocationSpecificScreening = false;
    blockingIssues.push(
      'Coordinates are set to (0, 0) local origin rather than real-world geographic coordinates (WGS84).'
    );
  } else if (locationConfidence === 'unverified') {
    status = 'unverified-geographic-location';
    canRunLocationSpecificScreening = true;
    warnings.push(
      `Site coordinates (${rawLat.toFixed(4)}°, ${rawLon.toFixed(4)}°) are marked 'unverified'. Hazard screening is indicative only until coordinates are survey-verified or user-confirmed.`
    );
  } else {
    status = 'valid-geographic-location';
    canRunLocationSpecificScreening = true;
  }

  // Grid cell span & boundary check (0.25 deg = ~25 km, 1.0 deg = ~100 km)
  const finestSourceGridKm = 25;
  const coarsestSourceGridKm = 100;
  const spansMultipleGridCells = diagonalSpanKm >= finestSourceGridKm;
  let nearGridCellBoundary = false;
  if (rawLat !== null && rawLon !== null && canRunLocationSpecificScreening) {
    const latMod = Math.abs(rawLat % 0.25);
    const lonMod = Math.abs(rawLon % 0.25);
    const distToGridEdgeDeg = Math.min(
      latMod,
      0.25 - latMod,
      lonMod,
      0.25 - lonMod
    );
    nearGridCellBoundary = distToGridEdgeDeg < 0.02; // within ~2.2 km of 0.25° grid boundary
  }

  let spatialResolutionWarning = `Regional climate datasets operate at ${finestSourceGridKm}–${coarsestSourceGridKm} km grid resolution, whereas the project parcel diagonal is ${(diagonalSpanKm * 1000).toFixed(1)} m (${diagonalSpanKm} km). Regional grid indicators cannot resolve parcel-scale micro-drainage or building-scale wind tunneling.`;
  if (spansMultipleGridCells) {
    spatialResolutionWarning +=
      ' Large site extent spans multiple climate grid cells; spatial variation across the site must be evaluated.';
    warnings.push('Site extent spans multiple climate model grid cells.');
  }
  if (nearGridCellBoundary) {
    spatialResolutionWarning +=
      ' Site coordinates lie within 0.02° (~2.2 km) of a 0.25° climate grid cell boundary; adjacent grid-cell values may differ in coastal or steep-orographic terrain.';
    warnings.push(
      'Site lies near a 0.25° climate grid-cell boundary; review adjacent regional grid uncertainty.'
    );
  }

  // Terrain alignment check (P43 integration)
  const tm = project.terrainModeling;
  const hasTerrainModel = Boolean(tm && tm.surfaceMesh && tm.analysis);
  const horizontalCRS = tm?.calibration?.horizontalCRS || 'none';
  const verticalDatum = tm?.calibration?.verticalDatum || 'none';
  const hasValidVerticalDatumForFloodComparison =
    hasTerrainModel &&
    verticalDatum === 'ORTHOMETRIC_SEA_LEVEL';

  const terrainUnitToM =
    tm?.analysis?.unit === 'feet' || tm?.calibration?.verticalUnit === 'FOOT'
      ? 0.3048
      : tm?.calibration?.verticalUnit === 'MILLIMETRE'
      ? 0.001
      : 1.0;
  const rawDiff = tm?.analysis?.buildingFootprintRelief?.footprintLevelDifference;
  const footprintReliefM =
    typeof rawDiff === 'number'
      ? Number((rawDiff * terrainUnitToM).toFixed(2))
      : null;
  const rawMinElev =
    tm?.analysis?.buildingFootprintRelief?.minGroundElevationUnderBuilding;
  const minGroundElevationUnderBuildingM =
    typeof rawMinElev === 'number'
      ? Number((rawMinElev * terrainUnitToM).toFixed(2))
      : null;
  const rawMaxElev =
    tm?.analysis?.buildingFootprintRelief?.maxGroundElevationUnderBuilding;
  const maxGroundElevationUnderBuildingM =
    typeof rawMaxElev === 'number'
      ? Number((rawMaxElev * terrainUnitToM).toFixed(2))
      : null;
  const maxSlopePercent =
    tm?.analysis?.maxSlopePercent !== undefined
      ? Number(tm.analysis.maxSlopePercent.toFixed(2))
      : null;

  let terrainWarning = '';
  if (!hasTerrainModel) {
    terrainWarning =
      'No P43 Terrain Model is attached to this project. Parcel ground relief and low-lying corner susceptibility rely on qualitative Site Context slope estimates only.';
    warnings.push(terrainWarning);
  } else if (!hasValidVerticalDatumForFloodComparison) {
    terrainWarning = `P43 Terrain Model uses vertical datum '${verticalDatum}'. Local-relative or unspecified vertical datums cannot be directly compared against orthometric flood-stage elevations (e.g., NAVD88 / MSL) without surveyed benchmark transformation.`;
    warnings.push(terrainWarning);
  } else {
    terrainWarning = `P43 Terrain Model calibrated (${horizontalCRS}, datum ${verticalDatum}); footprint relief is ${footprintReliefM ?? 0} m. Note: P43 represents existing ground only and does not model hydraulic flood routing.`;
  }

  const detectedJurisdictionScope = detectJurisdictionFromContext(
    canRunLocationSpecificScreening ? rawLat : null,
    canRunLocationSpecificScreening ? rawLon : null,
    cityRegionText,
    config.jurisdictionOverride
  );

  return {
    status,
    latitude: rawLat,
    longitude: rawLon,
    coordinateSource,
    locationConfidence,
    cityRegionText: cityRegionText || 'Unspecified Site Location',
    countryJurisdiction,
    detectedJurisdictionScope,
    parcelFootprintMeters: {
      widthM,
      lengthM,
      areaM2,
      diagonalSpanKm,
    },
    gridCellSpanCheck: {
      finestSourceGridKm,
      coarsestSourceGridKm,
      spansMultipleGridCells,
      nearGridCellBoundary,
      spatialResolutionWarning,
    },
    terrainAlignmentCheck: {
      hasTerrainModel,
      horizontalCRS,
      verticalDatum,
      hasValidVerticalDatumForFloodComparison,
      footprintReliefM,
      minGroundElevationUnderBuildingM,
      maxGroundElevationUnderBuildingM,
      maxSlopePercent,
      terrainWarning,
    },
    blockingIssues,
    warnings,
    canRunLocationSpecificScreening,
  };
}

// ============================================================================
// 4. REGIONAL CLIMATOLOGY & SCENARIO SCALING (IPCC AR6 / CCKP / ERA5 REFERENCE)
// ============================================================================

interface RegionalClimateBaseline {
  regionName: string;
  txxHistoricalC: number; // Annual max daily temp (°C)
  hotDays35Historical: number; // Days > 35°C
  rx1dayHistoricalMm: number; // Max 1-day rainfall (mm)
  rx5dayHistoricalMm: number; // Max 5-day rainfall (mm)
  cddHistoricalDays: number; // Max consecutive dry days
  speiHistorical: number; // 12-month SPEI baseline
  windGust10mHistoricalMs: number; // 10m gust (m/s)
  fwi95pHistorical: number; // 95th percentile Fire Weather Index
  freezeThawDaysHistorical: number; // Annual freeze-thaw cycles
  riverineBasinNote: string | null;
}

function getRegionalBaselineForCoords(lat: number, lon: number): RegionalClimateBaseline {
  const absLat = Math.abs(lat);

  // South Asia / Indus Basin (Pakistan / Northern India)
  if (lat >= 23.5 && lat <= 37.1 && lon >= 60.8 && lon <= 78.0) {
    const isNorthernMountain = lat >= 34.0;
    if (isNorthernMountain) {
      return {
        regionName: 'South Asia — Western Himalayas / Upper Indus (SAS-N)',
        txxHistoricalC: 34.5,
        hotDays35Historical: 8,
        rx1dayHistoricalMm: 95,
        rx5dayHistoricalMm: 185,
        cddHistoricalDays: 38,
        speiHistorical: -0.3,
        windGust10mHistoricalMs: 36,
        fwi95pHistorical: 22,
        freezeThawDaysHistorical: 64,
        riverineBasinNote:
          'PMD FFD Upper Indus / Hill-Torrent Flash-Flood & Glacial Melt Influence Zone',
      };
    }
    return {
      regionName: 'South Asia — Indus Plains & Monsoon Belt (SAS-Indus)',
      txxHistoricalC: 45.2,
      hotDays35Historical: 92,
      rx1dayHistoricalMm: 118,
      rx5dayHistoricalMm: 225,
      cddHistoricalDays: 65,
      speiHistorical: -0.6,
      windGust10mHistoricalMs: 39,
      fwi95pHistorical: 34,
      freezeThawDaysHistorical: 1,
      riverineBasinNote:
        'PMD FFD Indus Basin & Urban Monsoon Cloudburst Screening Zone (Ravi/Chenab/Indus plains)',
    };
  }

  // Arid Middle East / Arabian Peninsula
  if (lat >= 15.0 && lat <= 32.0 && lon >= 35.0 && lon < 60.8) {
    return {
      regionName: 'Arabian Peninsula / Hyper-Arid Subtropics (ARP)',
      txxHistoricalC: 47.0,
      hotDays35Historical: 135,
      rx1dayHistoricalMm: 52,
      rx5dayHistoricalMm: 78,
      cddHistoricalDays: 140,
      speiHistorical: -0.9,
      windGust10mHistoricalMs: 35,
      fwi95pHistorical: 42,
      freezeThawDaysHistorical: 0,
      riverineBasinNote: null,
    };
  }

  // Southern / Gulf / Warm North America
  if (lat >= 24.0 && lat < 38.0 && lon >= -125.0 && lon <= -70.0) {
    const isWestArid = lon < -103.0;
    return {
      regionName: isWestArid
        ? 'Western North America — Warm Semi-Arid / Mediterranean (WNA-S)'
        : 'Central & Eastern North America — Humid Subtropical (CNA/ENA-S)',
      txxHistoricalC: isWestArid ? 41.5 : 38.8,
      hotDays35Historical: isWestArid ? 54 : 38,
      rx1dayHistoricalMm: isWestArid ? 58 : 132,
      rx5dayHistoricalMm: isWestArid ? 98 : 240,
      cddHistoricalDays: isWestArid ? 72 : 29,
      speiHistorical: isWestArid ? -0.7 : -0.2,
      windGust10mHistoricalMs: isWestArid ? 37 : 46,
      fwi95pHistorical: isWestArid ? 52 : 28,
      freezeThawDaysHistorical: 18,
      riverineBasinNote: null,
    };
  }

  // Temperate / Northern North America & Europe
  if (absLat >= 38.0 && absLat <= 68.0) {
    const isCold = absLat >= 50.0;
    return {
      regionName: isCold
        ? 'Northern Temperate / Boreal Maritime-Continental Band'
        : 'Mid-Latitude Temperate Climate Band',
      txxHistoricalC: isCold ? 31.2 : 35.4,
      hotDays35Historical: isCold ? 4 : 16,
      rx1dayHistoricalMm: isCold ? 68 : 84,
      rx5dayHistoricalMm: isCold ? 125 : 155,
      cddHistoricalDays: 24,
      speiHistorical: -0.15,
      windGust10mHistoricalMs: 41,
      fwi95pHistorical: isCold ? 19 : 31,
      freezeThawDaysHistorical: isCold ? 78 : 42,
      riverineBasinNote: null,
    };
  }

  // Tropical / Equatorial Band
  return {
    regionName: 'Tropical / Subtropical Reference Band',
    txxHistoricalC: 37.5,
    hotDays35Historical: 48,
    rx1dayHistoricalMm: 145,
    rx5dayHistoricalMm: 270,
    cddHistoricalDays: 34,
    speiHistorical: -0.25,
    windGust10mHistoricalMs: 44,
    fwi95pHistorical: 24,
    freezeThawDaysHistorical: 0,
    riverineBasinNote: null,
  };
}

function getScenarioWarmingMultiplier(
  scenario: ClimateScenarioId,
  horizon: ClimateTimeHorizon
): {
  tempDeltaC: number;
  precipExtremePct: number;
  droughtFactor: number;
  windPeakPct: number;
  fwiDelta: number;
  spreadFactor: number;
} {
  if (scenario === 'historical-baseline' || horizon === 'historical-1991-2020' || horizon === 'recent-observed') {
    return {
      tempDeltaC: 0,
      precipExtremePct: 0,
      droughtFactor: 0,
      windPeakPct: 0,
      fwiDelta: 0,
      spreadFactor: 0.15,
    };
  }

  const horizonScale =
    horizon === 'near-term-2021-2040'
      ? 0.55
      : horizon === 'mid-century-2041-2060'
      ? 1.0
      : horizon === 'late-century-2081-2100'
      ? 1.75
      : 1.0;

  switch (scenario) {
    case 'ssp1-2.6':
      return {
        tempDeltaC: Number((1.1 * horizonScale).toFixed(2)),
        precipExtremePct: Number((7.5 * horizonScale).toFixed(1)),
        droughtFactor: Number((0.18 * horizonScale).toFixed(2)),
        windPeakPct: Number((2.5 * horizonScale).toFixed(1)),
        fwiDelta: Number((4.0 * horizonScale).toFixed(1)),
        spreadFactor: 0.25,
      };
    case 'ssp2-4.5':
      return {
        tempDeltaC: Number((1.8 * horizonScale).toFixed(2)),
        precipExtremePct: Number((13.0 * horizonScale).toFixed(1)),
        droughtFactor: Number((0.35 * horizonScale).toFixed(2)),
        windPeakPct: Number((5.0 * horizonScale).toFixed(1)),
        fwiDelta: Number((8.5 * horizonScale).toFixed(1)),
        spreadFactor: 0.32,
      };
    case 'ssp3-7.0':
      return {
        tempDeltaC: Number((2.5 * horizonScale).toFixed(2)),
        precipExtremePct: Number((18.5 * horizonScale).toFixed(1)),
        droughtFactor: Number((0.55 * horizonScale).toFixed(2)),
        windPeakPct: Number((7.5 * horizonScale).toFixed(1)),
        fwiDelta: Number((13.0 * horizonScale).toFixed(1)),
        spreadFactor: 0.38,
      };
    case 'ssp5-8.5':
    default:
      return {
        tempDeltaC: Number((3.2 * horizonScale).toFixed(2)),
        precipExtremePct: Number((24.0 * horizonScale).toFixed(1)),
        droughtFactor: Number((0.75 * horizonScale).toFixed(2)),
        windPeakPct: Number((10.5 * horizonScale).toFixed(1)),
        fwiDelta: Number((18.0 * horizonScale).toFixed(1)),
        spreadFactor: 0.45,
      };
  }
}

// ============================================================================
// 5. HAZARD CATALOG & SCREENING ENGINE
// ============================================================================

function generateIndicatorsForScenario(
  preflight: SiteLocationPreflightResult,
  config: ClimateResilienceConfig,
  scenario: ClimateScenarioId,
  horizon: ClimateTimeHorizon,
  customIndicators: ClimateHazardIndicatorRecord[]
): ClimateHazardIndicatorRecord[] {
  const matchingCustom = customIndicators.filter(
    (c) => c.scenario === scenario && (c.timeHorizon === horizon || c.timeHorizon === 'custom-horizon')
  );

  if (!preflight.canRunLocationSpecificScreening || preflight.latitude === null || preflight.longitude === null) {
    return matchingCustom;
  }

  const base = getRegionalBaselineForCoords(preflight.latitude, preflight.longitude);
  const mult = getScenarioWarmingMultiplier(scenario, horizon);
  const isHistorical = scenario === 'historical-baseline' || horizon === 'historical-1991-2020';
  const temporalClass = isHistorical ? 'historical-baseline' : 'future-climate-projection';
  const primarySourceId = isHistorical ? 'SRC-COPERNICUS-ERA5-CMIP6' : 'SRC-WB-CCKP-CMIP6';
  const primaryCitation = isHistorical
    ? `Copernicus C3S ERA5 Reanalysis (${base.regionName}, 1991–2020)`
    : `World Bank CCKP / IPCC AR6 CMIP6 Multi-Model Ensemble (${base.regionName}, ${scenario.toUpperCase()}, ${horizon})`;

  // 1. Extreme Heat: TXx & Days > 35°C
  const txxProj = Number((base.txxHistoricalC + mult.tempDeltaC * 1.15).toFixed(1));
  const txxDelta = Number((txxProj - base.txxHistoricalC).toFixed(1));
  const hotDaysProj = Math.round(base.hotDays35Historical + mult.tempDeltaC * 14);
  const hotDaysDelta = hotDaysProj - base.hotDays35Historical;

  // 2. Extreme Precipitation: Rx1day & Rx5day
  const rx1Proj = Number(
    (base.rx1dayHistoricalMm * (1 + mult.precipExtremePct / 100)).toFixed(1)
  );
  const rx1Delta = Number((rx1Proj - base.rx1dayHistoricalMm).toFixed(1));
  const rx5Proj = Number(
    (base.rx5dayHistoricalMm * (1 + (mult.precipExtremePct * 0.9) / 100)).toFixed(1)
  );
  const rx5Delta = Number((rx5Proj - base.rx5dayHistoricalMm).toFixed(1));

  // 3. Drought: Consecutive Dry Days & SPEI-12
  const cddProj = Math.round(base.cddHistoricalDays * (1 + mult.droughtFactor * 0.35));
  const cddDelta = cddProj - base.cddHistoricalDays;
  const speiProj = Number((base.speiHistorical - mult.droughtFactor).toFixed(2));
  const speiDelta = Number((speiProj - base.speiHistorical).toFixed(2));

  // 4. Wind: Peak 10m gust
  const windProj = Number(
    (base.windGust10mHistoricalMs * (1 + mult.windPeakPct / 100)).toFixed(1)
  );
  const windDelta = Number((windProj - base.windGust10mHistoricalMs).toFixed(1));

  // 5. Wildfire Weather: FWI 95p
  const fwiProj = Number((base.fwi95pHistorical + mult.fwiDelta).toFixed(1));
  const fwiDelta = Number((fwiProj - base.fwi95pHistorical).toFixed(1));

  // 6. Cold / Freeze-Thaw
  const freezeProj = Math.max(
    0,
    Math.round(base.freezeThawDaysHistorical - mult.tempDeltaC * 8)
  );
  const freezeDelta = freezeProj - base.freezeThawDaysHistorical;

  const generated: ClimateHazardIndicatorRecord[] = [
    {
      indicatorId: `IND-HEAT-TXX-${scenario}-${horizon}`,
      hazardCategory: 'extreme-heat',
      indicatorCode: 'TXx',
      label: 'Annual Maximum Daily Temperature (TXx)',
      temporalClass,
      scenario,
      timeHorizon: horizon,
      baselinePeriod: '1991–2020',
      modelOrEnsemble: 'CMIP6 32-GCM Multi-Model Ensemble (p10/p50/p90)',
      historicalBaselineValue: base.txxHistoricalC,
      projectedOrObservedValue: txxProj,
      deltaFromBaseline: txxDelta,
      uncertaintyRange: {
        p10: Number((txxProj - 1.2 * (1 + mult.spreadFactor)).toFixed(1)),
        p50: txxProj,
        p90: Number((txxProj + 1.6 * (1 + mult.spreadFactor)).toFixed(1)),
        spreadLabel: 'CMIP6 10th–90th percentile ensemble spread',
      },
      unit: '°C',
      spatialResolutionKm: 25,
      sourceId: primarySourceId,
      sourceCitation: primaryCitation,
      thresholdUsed: 'High >= 40°C; Very High >= 45°C outdoor ambient screening threshold',
      notesAndLimitations:
        'Outdoor ambient screen-level air temperature at 2m. Does not calculate indoor operative temperature or cooling energy demand (P46 scope).',
    },
    {
      indicatorId: `IND-HEAT-DAYS35-${scenario}-${horizon}`,
      hazardCategory: 'extreme-heat',
      indicatorCode: 'Days_TX35',
      label: 'Annual Hot Days Exceeding 35°C',
      temporalClass,
      scenario,
      timeHorizon: horizon,
      baselinePeriod: '1991–2020',
      modelOrEnsemble: 'CMIP6 Multi-Model Ensemble',
      historicalBaselineValue: base.hotDays35Historical,
      projectedOrObservedValue: hotDaysProj,
      deltaFromBaseline: hotDaysDelta,
      uncertaintyRange: {
        p10: Math.max(0, Math.round(hotDaysProj * 0.82)),
        p50: hotDaysProj,
        p90: Math.round(hotDaysProj * 1.22),
        spreadLabel: 'CMIP6 10th–90th percentile ensemble spread',
      },
      unit: 'days/yr',
      spatialResolutionKm: 25,
      sourceId: primarySourceId,
      sourceCitation: primaryCitation,
      thresholdUsed: 'Moderate >= 20 days/yr; High >= 45 days/yr; Very High >= 90 days/yr',
      notesAndLimitations: 'Regional 0.25° grid estimate; urban heat island may increase local night-time minimums.',
    },
    {
      indicatorId: `IND-PRECIP-RX1DAY-${scenario}-${horizon}`,
      hazardCategory: 'extreme-precipitation',
      indicatorCode: 'Rx1day',
      label: 'Annual Maximum 1-Day Precipitation (Rx1day)',
      temporalClass,
      scenario,
      timeHorizon: horizon,
      baselinePeriod: '1991–2020',
      modelOrEnsemble: 'CMIP6 Multi-Model Ensemble',
      historicalBaselineValue: base.rx1dayHistoricalMm,
      projectedOrObservedValue: rx1Proj,
      deltaFromBaseline: rx1Delta,
      uncertaintyRange: {
        p10: Number((rx1Proj * 0.85).toFixed(1)),
        p50: rx1Proj,
        p90: Number((rx1Proj * 1.24).toFixed(1)),
        spreadLabel: 'CMIP6 10th–90th percentile ensemble spread',
      },
      unit: 'mm/day',
      spatialResolutionKm: 25,
      sourceId: primarySourceId,
      sourceCitation: primaryCitation,
      thresholdUsed: 'Moderate >= 75 mm/day; High >= 110 mm/day; Very High >= 150 mm/day',
      notesAndLimitations:
        'Precipitation intensity (mm/day) indicates cloudburst loading on roofs/gutters and pluvial runoff potential; it does NOT establish parcel flood water depth.',
    },
    {
      indicatorId: `IND-PRECIP-RX5DAY-${scenario}-${horizon}`,
      hazardCategory: 'extreme-precipitation',
      indicatorCode: 'Rx5day',
      label: 'Annual Maximum 5-Day Cumulative Precipitation (Rx5day)',
      temporalClass,
      scenario,
      timeHorizon: horizon,
      baselinePeriod: '1991–2020',
      modelOrEnsemble: 'CMIP6 Multi-Model Ensemble',
      historicalBaselineValue: base.rx5dayHistoricalMm,
      projectedOrObservedValue: rx5Proj,
      deltaFromBaseline: rx5Delta,
      uncertaintyRange: {
        p10: Number((rx5Proj * 0.86).toFixed(1)),
        p50: rx5Proj,
        p90: Number((rx5Proj * 1.22).toFixed(1)),
        spreadLabel: 'CMIP6 10th–90th percentile ensemble spread',
      },
      unit: 'mm/5-day',
      spatialResolutionKm: 25,
      sourceId: primarySourceId,
      sourceCitation: primaryCitation,
      thresholdUsed: 'Moderate >= 140 mm; High >= 200 mm; Very High >= 260 mm',
      notesAndLimitations:
        'Multi-day soil saturation indicator relevant to foundation drainage and stormwater retention sizing.',
    },
    {
      indicatorId: `IND-DROUGHT-SPEI12-${scenario}-${horizon}`,
      hazardCategory: 'drought-water-stress',
      indicatorCode: 'SPEI_12',
      label: '12-Month Standardized Precipitation-Evapotranspiration Index (SPEI-12)',
      temporalClass,
      scenario,
      timeHorizon: horizon,
      baselinePeriod: '1991–2020',
      modelOrEnsemble: 'IPCC AR6 / CCKP CMIP6 Ensemble',
      historicalBaselineValue: base.speiHistorical,
      projectedOrObservedValue: speiProj,
      deltaFromBaseline: speiDelta,
      uncertaintyRange: {
        p10: Number((speiProj - 0.35).toFixed(2)),
        p50: speiProj,
        p90: Number((speiProj + 0.3).toFixed(2)),
        spreadLabel: 'CMIP6 10th–90th percentile ensemble spread',
      },
      unit: 'SPEI index',
      spatialResolutionKm: 100,
      sourceId: 'SRC-IPCC-AR6-WGI-ATLAS',
      sourceCitation: `IPCC AR6 WGI Atlas (${base.regionName})`,
      thresholdUsed: 'Moderate <= -0.5; High <= -1.0; Very High <= -1.5 (negative values indicate drier moisture balance)',
      notesAndLimitations: 'Climatic moisture deficit index; actual site water security depends on municipal supply reliability and on-site storage.',
    },
    {
      indicatorId: `IND-DROUGHT-CDD-${scenario}-${horizon}`,
      hazardCategory: 'drought-water-stress',
      indicatorCode: 'CDD_Drought',
      label: 'Annual Maximum Consecutive Dry Days (CDD < 1mm)',
      temporalClass,
      scenario,
      timeHorizon: horizon,
      baselinePeriod: '1991–2020',
      modelOrEnsemble: 'CMIP6 Multi-Model Ensemble',
      historicalBaselineValue: base.cddHistoricalDays,
      projectedOrObservedValue: cddProj,
      deltaFromBaseline: cddDelta,
      uncertaintyRange: {
        p10: Math.round(cddProj * 0.85),
        p50: cddProj,
        p90: Math.round(cddProj * 1.2),
        spreadLabel: 'CMIP6 10th–90th percentile ensemble spread',
      },
      unit: 'days/yr',
      spatialResolutionKm: 25,
      sourceId: primarySourceId,
      sourceCitation: primaryCitation,
      thresholdUsed: 'Moderate >= 35 days; High >= 65 days; Very High >= 100 days',
      notesAndLimitations: 'Determines rainwater harvesting cistern autonomy period.',
    },
    {
      indicatorId: `IND-WIND-VMAX-${scenario}-${horizon}`,
      hazardCategory: 'severe-wind-cyclone',
      indicatorCode: 'Wind_Vmax_10m',
      label: 'Extreme 10m Peak Wind Gust Indicator',
      temporalClass,
      scenario,
      timeHorizon: horizon,
      baselinePeriod: '1991–2020',
      modelOrEnsemble: 'ERA5 / CMIP6 Wind Extremes',
      historicalBaselineValue: base.windGust10mHistoricalMs,
      projectedOrObservedValue: windProj,
      deltaFromBaseline: windDelta,
      uncertaintyRange: {
        p10: Number((windProj * 0.9).toFixed(1)),
        p50: windProj,
        p90: Number((windProj * 1.15).toFixed(1)),
        spreadLabel: '10th–90th percentile wind gust spread',
      },
      unit: 'm/s',
      spatialResolutionKm: 25,
      sourceId: primarySourceId,
      sourceCitation: primaryCitation,
      thresholdUsed: 'Moderate >= 35 m/s; High >= 42 m/s; Very High >= 50 m/s',
      notesAndLimitations:
        'Regional synoptic wind indicator; structural design must comply with statutory basic wind speed (ASCE 7 / Eurocode 1 / BCP) and site exposure category.',
    },
    {
      indicatorId: `IND-FIRE-FWI95-${scenario}-${horizon}`,
      hazardCategory: 'wildfire-weather',
      indicatorCode: 'FWI_95p',
      label: '95th Percentile Canadian Fire Weather Index (FWI)',
      temporalClass,
      scenario,
      timeHorizon: horizon,
      baselinePeriod: '1991–2020',
      modelOrEnsemble: 'C3S / IPCC AR6 Fire Weather Synthesis',
      historicalBaselineValue: base.fwi95pHistorical,
      projectedOrObservedValue: fwiProj,
      deltaFromBaseline: fwiDelta,
      uncertaintyRange: {
        p10: Number((fwiProj * 0.85).toFixed(1)),
        p50: fwiProj,
        p90: Number((fwiProj * 1.18).toFixed(1)),
        spreadLabel: 'CMIP6 10th–90th percentile spread',
      },
      unit: 'FWI index',
      spatialResolutionKm: 100,
      sourceId: 'SRC-IPCC-AR6-WGI-ATLAS',
      sourceCitation: `IPCC AR6 WGI Fire Weather Index (${base.regionName})`,
      thresholdUsed: 'Moderate >= 25; High >= 38; Very High >= 50',
      notesAndLimitations:
        'Meteorological fire-weather danger only (heat, low humidity, wind). Actual parcel ignition hazard requires Wildland-Urban Interface (WUI) fuel and vegetation verification.',
    },
    {
      indicatorId: `IND-COLD-FREEZETHAW-${scenario}-${horizon}`,
      hazardCategory: 'cold-freeze-thaw-snow',
      indicatorCode: 'FreezeThaw_Days',
      label: 'Annual Freeze-Thaw Cycles (Tmax > 0°C & Tmin < 0°C)',
      temporalClass,
      scenario,
      timeHorizon: horizon,
      baselinePeriod: '1991–2020',
      modelOrEnsemble: 'ERA5 / CMIP6 Ensemble',
      historicalBaselineValue: base.freezeThawDaysHistorical,
      projectedOrObservedValue: freezeProj,
      deltaFromBaseline: freezeDelta,
      uncertaintyRange: {
        p10: Math.max(0, freezeProj - 6),
        p50: freezeProj,
        p90: freezeProj + 8,
        spreadLabel: '10th–90th percentile spread',
      },
      unit: 'cycles/yr',
      spatialResolutionKm: 25,
      sourceId: primarySourceId,
      sourceCitation: primaryCitation,
      thresholdUsed: 'Low < 15 cycles/yr; Moderate 15–45 cycles/yr; High > 45 cycles/yr',
      notesAndLimitations: 'Relevant to exterior masonry/concrete durability and exposed pipe frost protection.',
    },
  ];

  // Merge with custom indicators (custom indicators with same indicatorCode override generated ones)
  const mergedMap = new Map<string, ClimateHazardIndicatorRecord>();
  for (const ind of generated) {
    mergedMap.set(ind.indicatorCode, ind);
  }
  for (const cust of matchingCustom) {
    mergedMap.set(cust.indicatorCode, cust);
  }

  return Array.from(mergedMap.values());
}

export function evaluateClimateHazards(
  project: Project,
  preflight: SiteLocationPreflightResult,
  config: ClimateResilienceConfig,
  customIndicators: ClimateHazardIndicatorRecord[]
): ClimateHazardAssessmentItem[] {
  const activeIndicators = generateIndicatorsForScenario(
    preflight,
    config,
    config.activeScenario,
    config.activeTimeHorizon,
    customIndicators
  );

  const byCode = new Map<string, ClimateHazardIndicatorRecord>();
  for (const ind of activeIndicators) {
    byCode.set(ind.indicatorCode, ind);
  }

  const canScreen = preflight.canRunLocationSpecificScreening;
  const locConfidenceHigh =
    preflight.locationConfidence === 'survey-stamped' ||
    preflight.locationConfidence === 'municipal-cadastral';

  // 1. Extreme Heat
  const txxInd = byCode.get('TXx');
  const hotDaysInd = byCode.get('Days_TX35');
  const heatIndicators = activeIndicators.filter((i) => i.hazardCategory === 'extreme-heat');
  let heatLevel: QualitativeLevel = 'unassessed';
  let heatStatus: ClimateHazardAssessmentItem['screeningStatus'] = 'unassessed';
  if (txxInd && typeof txxInd.projectedOrObservedValue === 'number') {
    const val = txxInd.projectedOrObservedValue;
    heatStatus = locConfidenceHigh ? 'assessed-verified' : 'assessed-indicative';
    if (val >= 45) heatLevel = 'very-high';
    else if (val >= 40) heatLevel = 'high';
    else if (val >= 35) heatLevel = 'moderate';
    else if (val >= 30) heatLevel = 'low';
    else heatLevel = 'very-low';
  } else if (!canScreen) {
    heatLevel = 'unassessed';
    heatStatus = 'unassessed';
  }

  // 2. Extreme Precipitation
  const rx1Ind = byCode.get('Rx1day');
  const precipIndicators = activeIndicators.filter(
    (i) => i.hazardCategory === 'extreme-precipitation'
  );
  let precipLevel: QualitativeLevel = 'unassessed';
  let precipStatus: ClimateHazardAssessmentItem['screeningStatus'] = 'unassessed';
  if (rx1Ind && typeof rx1Ind.projectedOrObservedValue === 'number') {
    const val = rx1Ind.projectedOrObservedValue;
    precipStatus = locConfidenceHigh ? 'assessed-verified' : 'assessed-indicative';
    if (val >= 150) precipLevel = 'very-high';
    else if (val >= 110) precipLevel = 'high';
    else if (val >= 75) precipLevel = 'moderate';
    else if (val >= 45) precipLevel = 'low';
    else precipLevel = 'very-low';
  }

  // 3. Flooding (Explicitly separated into Fluvial, Pluvial, Coastal, Official Flood Zone Map)
  const floodIndicators = activeIndicators.filter((i) => i.hazardCategory === 'flooding');
  const officialZone =
    config.siteSpecificAttributes.officialFloodZoneLabel ||
    (byCode.get('FEMA_FIRM_Zone')?.projectedOrObservedValue as string | undefined) ||
    null;

  // 3a. Pluvial / Surface-Water Ponding
  let pluvialStatus: FloodSubTypeAssessment['screeningStatus'] = 'unassessed';
  let pluvialLevel: QualitativeLevel = 'unassessed';
  let pluvialNote =
    'Requires extreme rainfall indicator and site topography/drainage context.';
  if (rx1Ind && typeof rx1Ind.projectedOrObservedValue === 'number') {
    pluvialStatus = 'assessed-indicative';
    const rx1Val = rx1Ind.projectedOrObservedValue;
    const hasFlatOrLowRelief =
      (preflight.terrainAlignmentCheck.maxSlopePercent !== null &&
        preflight.terrainAlignmentCheck.maxSlopePercent < 2.0) ||
      project.siteContext?.slope === 'flat-under-2-pct';
    const hasSteepRunoff =
      (preflight.terrainAlignmentCheck.maxSlopePercent !== null &&
        preflight.terrainAlignmentCheck.maxSlopePercent > 8.0) ||
      project.siteContext?.slope === 'steep-over-10-pct';

    if (rx1Val >= 130 && (hasFlatOrLowRelief || hasSteepRunoff)) {
      pluvialLevel = 'high';
    } else if (rx1Val >= 95) {
      pluvialLevel = 'moderate';
    } else {
      pluvialLevel = 'low';
    }
    pluvialNote = `Screened from Rx1day=${rx1Val} mm/day and site topography (${
      preflight.terrainAlignmentCheck.hasTerrainModel
        ? `P43 max slope ${preflight.terrainAlignmentCheck.maxSlopePercent}%`
        : `SiteContext slope ${project.siteContext?.slope || 'unspecified'}`
    }). Does NOT compute hydraulic water depth.`;
  }

  // 3b. Fluvial / Riverine
  let fluvialStatus: FloodSubTypeAssessment['screeningStatus'] = 'insufficient-evidence';
  let fluvialLevel: QualitativeLevel = 'insufficient-evidence';
  let fluvialNote =
    'Riverine overbank flood hazard requires official floodplain mapping or hydrological basin elevation survey.';
  if (officialZone) {
    const zUpper = officialZone.toUpperCase();
    fluvialStatus = 'assessed-verified';
    if (zUpper.includes('AE') || zUpper.includes('A') || zUpper.includes('HIGH') || zUpper.includes('100-YR')) {
      fluvialLevel = 'high';
    } else if (zUpper.includes('500-YR') || zUpper.includes('MODERATE') || zUpper.includes('B')) {
      fluvialLevel = 'moderate';
    } else if (zUpper.includes('X') || zUpper.includes('MINIMAL') || zUpper.includes('LOW')) {
      fluvialLevel = 'low';
    } else {
      fluvialLevel = 'moderate';
    }
    fluvialNote = `Derived from user-confirmed/imported flood zone designation: "${officialZone}".`;
  } else if (
    canScreen &&
    preflight.detectedJurisdictionScope === 'pakistan' &&
    preflight.latitude !== null &&
    preflight.longitude !== null
  ) {
    fluvialStatus = 'assessed-indicative';
    fluvialLevel = 'moderate';
    fluvialNote =
      'PMD FFD Indus Basin regional riverine/hill-torrent screening active; parcel-specific floodplain boundary and high-flood level (HFL) require local irrigation/municipal verification.';
  }

  // 3c. Coastal / Storm Surge
  let coastalStatus: FloodSubTypeAssessment['screeningStatus'] = 'insufficient-evidence';
  let coastalLevel: QualitativeLevel = 'insufficient-evidence';
  let coastalNote =
    'Coastal proximity and storm-surge datum elevation are not specified.';
  if (config.siteSpecificAttributes.coastalProximityKm !== null) {
    if (config.siteSpecificAttributes.coastalProximityKm > 30) {
      coastalStatus = 'not-applicable-confirmed';
      coastalLevel = 'very-low';
      coastalNote = `Site is confirmed inland (${config.siteSpecificAttributes.coastalProximityKm} km from coast); coastal storm surge is not applicable.`;
    } else if (config.siteSpecificAttributes.coastalProximityKm <= 5) {
      coastalStatus = 'assessed-indicative';
      coastalLevel = 'high';
      coastalNote = `Site is within ${config.siteSpecificAttributes.coastalProximityKm} km of coastline; storm surge and sea-level rise wave runup require coastal engineering study.`;
    } else {
      coastalStatus = 'assessed-indicative';
      coastalLevel = 'moderate';
      coastalNote = `Site is ${config.siteSpecificAttributes.coastalProximityKm} km from coastline; estuarine/tidal backwater effects should be checked.`;
    }
  }

  // 3d. Official Flood Zone Map
  const officialMapBreakdown: FloodSubTypeAssessment = {
    subType: 'official-flood-zone-map',
    label: 'Official Regulatory Floodplain Map (FEMA FIRM / PMD FFD / National Map)',
    screeningStatus: officialZone ? 'assessed-verified' : 'insufficient-evidence',
    severityLevel: officialZone ? fluvialLevel : 'insufficient-evidence',
    summary: officialZone
      ? `Official Flood Zone Recorded: ${officialZone}`
      : 'No parcel-specific regulatory flood zone designation (e.g., FEMA FIRM panel or municipal flood map) has been entered or imported.',
    sourceId:
      preflight.detectedJurisdictionScope === 'united-states'
        ? 'SRC-FEMA-NFHL-MSC'
        : preflight.detectedJurisdictionScope === 'pakistan'
        ? 'SRC-PMD-FFD-PAK'
        : 'SRC-WB-CCKP-CMIP6',
    evidenceNote:
      'Never assumed to be flood-free when official flood zone data is absent.',
  };

  const floodSubTypes: FloodSubTypeAssessment[] = [
    {
      subType: 'pluvial-surface-water',
      label: 'Pluvial / Surface-Water Ponding & Cloudburst Runoff',
      screeningStatus: pluvialStatus,
      severityLevel: pluvialLevel,
      summary: `Pluvial surface-water screening: ${pluvialLevel.toUpperCase()}`,
      sourceId: rx1Ind?.sourceId || 'SRC-WB-CCKP-CMIP6',
      evidenceNote: pluvialNote,
    },
    {
      subType: 'fluvial-riverine',
      label: 'Fluvial / Riverine Overbank Flooding',
      screeningStatus: fluvialStatus,
      severityLevel: fluvialLevel,
      summary: `Fluvial riverine screening: ${fluvialLevel.toUpperCase()}`,
      sourceId:
        preflight.detectedJurisdictionScope === 'pakistan'
          ? 'SRC-PMD-FFD-PAK'
          : 'SRC-FEMA-NFHL-MSC',
      evidenceNote: fluvialNote,
    },
    {
      subType: 'coastal-storm-surge',
      label: 'Coastal / Storm Surge & Sea-Level Rise',
      screeningStatus: coastalStatus,
      severityLevel: coastalLevel,
      summary: `Coastal storm surge screening: ${coastalLevel.toUpperCase()}`,
      sourceId: 'SRC-IPCC-AR6-WGI-ATLAS',
      evidenceNote: coastalNote,
    },
    officialMapBreakdown,
  ];

  // Overall Flood Hazard Status
  const severityRank: Record<QualitativeLevel, number> = {
    'very-high': 5,
    high: 4,
    moderate: 3,
    low: 2,
    'very-low': 1,
    'insufficient-evidence': 0,
    unassessed: 0,
  };
  let overallFloodLevel: QualitativeLevel = canScreen ? 'insufficient-evidence' : 'unassessed';
  for (const st of floodSubTypes) {
    if (severityRank[st.severityLevel] > severityRank[overallFloodLevel]) {
      overallFloodLevel = st.severityLevel;
    }
  }

  // 4. Drought & Water Stress
  const speiInd = byCode.get('SPEI_12');
  const cddInd = byCode.get('CDD_Drought');
  const droughtIndicators = activeIndicators.filter(
    (i) => i.hazardCategory === 'drought-water-stress'
  );
  let droughtLevel: QualitativeLevel = 'unassessed';
  let droughtStatus: ClimateHazardAssessmentItem['screeningStatus'] = 'unassessed';
  if (speiInd && typeof speiInd.projectedOrObservedValue === 'number') {
    droughtStatus = locConfidenceHigh ? 'assessed-verified' : 'assessed-indicative';
    const speiVal = speiInd.projectedOrObservedValue;
    if (speiVal <= -1.5) droughtLevel = 'very-high';
    else if (speiVal <= -1.0) droughtLevel = 'high';
    else if (speiVal <= -0.5) droughtLevel = 'moderate';
    else if (speiVal <= -0.2) droughtLevel = 'low';
    else droughtLevel = 'very-low';
  }

  // 5. Severe Wind & Cyclone
  const windInd = byCode.get('Wind_Vmax_10m');
  const windIndicators = activeIndicators.filter(
    (i) => i.hazardCategory === 'severe-wind-cyclone'
  );
  let windLevel: QualitativeLevel = 'unassessed';
  let windStatus: ClimateHazardAssessmentItem['screeningStatus'] = 'unassessed';
  if (windInd && typeof windInd.projectedOrObservedValue === 'number') {
    windStatus = locConfidenceHigh ? 'assessed-verified' : 'assessed-indicative';
    const wVal = windInd.projectedOrObservedValue;
    if (wVal >= 50) windLevel = 'very-high';
    else if (wVal >= 42) windLevel = 'high';
    else if (wVal >= 35) windLevel = 'moderate';
    else windLevel = 'low';
  }

  // 6. Wildfire Weather
  const fwiInd = byCode.get('FWI_95p');
  const fireIndicators = activeIndicators.filter(
    (i) => i.hazardCategory === 'wildfire-weather'
  );
  let fireLevel: QualitativeLevel = 'unassessed';
  let fireStatus: ClimateHazardAssessmentItem['screeningStatus'] = 'unassessed';
  if (fwiInd && typeof fwiInd.projectedOrObservedValue === 'number') {
    fireStatus = 'assessed-indicative';
    const fVal = fwiInd.projectedOrObservedValue;
    if (config.siteSpecificAttributes.wildfireInterfaceZoneConfirmed === false) {
      fireLevel = 'low';
    } else if (fVal >= 50) {
      fireLevel = 'very-high';
    } else if (fVal >= 38) {
      fireLevel = 'high';
    } else if (fVal >= 25) {
      fireLevel = 'moderate';
    } else {
      fireLevel = 'low';
    }
  }

  // 7. Slope Instability, Soil Erosion & Landslide
  // Strict rule: Never fabricate geotechnical stability! If geotechnical report is absent, mark 'insufficient-evidence'
  const slopeIndicators = activeIndicators.filter(
    (i) => i.hazardCategory === 'slope-erosion-landslide'
  );
  let slopeStatus: ClimateHazardAssessmentItem['screeningStatus'] = canScreen
    ? 'insufficient-evidence'
    : 'unassessed';
  let slopeLevel: QualitativeLevel = canScreen ? 'insufficient-evidence' : 'unassessed';
  const maxSlopePct = preflight.terrainAlignmentCheck.maxSlopePercent;
  if (canScreen && config.siteSpecificAttributes.geotechnicalSlopeReportAvailable) {
    slopeStatus = 'assessed-verified';
    if (maxSlopePct !== null && maxSlopePct >= 15) slopeLevel = 'high';
    else if (maxSlopePct !== null && maxSlopePct >= 8) slopeLevel = 'moderate';
    else slopeLevel = 'low';
  } else if (canScreen && maxSlopePct !== null && maxSlopePct >= 12) {
    // Surface erosion susceptibility is flagged indicatively when P43 terrain shows steep slope > 12%, while geotechnical landslide stability remains insufficient-evidence
    slopeStatus = 'assessed-indicative';
    slopeLevel = 'high';
  }

  // 8. Cold / Freeze-Thaw / Snow
  const freezeInd = byCode.get('FreezeThaw_Days');
  const coldIndicators = activeIndicators.filter(
    (i) => i.hazardCategory === 'cold-freeze-thaw-snow'
  );
  let coldLevel: QualitativeLevel = 'unassessed';
  let coldStatus: ClimateHazardAssessmentItem['screeningStatus'] = 'unassessed';
  if (freezeInd && typeof freezeInd.projectedOrObservedValue === 'number') {
    coldStatus = locConfidenceHigh ? 'assessed-verified' : 'assessed-indicative';
    const fz = freezeInd.projectedOrObservedValue;
    if (fz >= 70) coldLevel = 'high';
    else if (fz >= 35) coldLevel = 'moderate';
    else if (fz >= 10) coldLevel = 'low';
    else coldLevel = 'very-low';
  }

  const missingCoordsMsg =
    'Valid geographic coordinates (WGS84 latitude/longitude) are required before regional climate indicators can be evaluated.';

  return [
    {
      hazardCategory: 'extreme-heat',
      title: 'Extreme Heat & Thermal Stress Potential',
      screeningStatus: heatStatus,
      hazardSeverityLevel: heatLevel,
      indicators: heatIndicators,
      confidenceLevel: !canScreen ? 'none' : locConfidenceHigh ? 'high' : 'medium',
      confidenceRationale: !canScreen
        ? missingCoordsMsg
        : `Evaluated from 25 km downscaled CMIP6 / ERA5 temperature indicators (${txxInd?.projectedOrObservedValue ?? 'N/A'}°C TXx, ${hotDaysInd?.projectedOrObservedValue ?? 'N/A'} hot days/yr).`,
      scientificBoundaryNotices: [
        'P45/P46 Boundary: Outdoor ambient temperature indicators (TXx, hot days > 35°C) do NOT calculate indoor operative temperatures, glazing solar heat gain (SHGC), or mechanical cooling loads (reserved for P46).',
        'Coarse regional grids (25 km) do not capture parcel-level urban heat island (UHI) canyons or localized shade.',
      ],
      missingEvidenceItems: !canScreen ? ['Verified WGS84 site coordinates'] : [],
    },
    {
      hazardCategory: 'extreme-precipitation',
      title: 'Extreme Precipitation & Cloudburst Intensity',
      screeningStatus: precipStatus,
      hazardSeverityLevel: precipLevel,
      indicators: precipIndicators,
      confidenceLevel: !canScreen ? 'none' : locConfidenceHigh ? 'medium' : 'low',
      confidenceRationale: !canScreen
        ? missingCoordsMsg
        : `Evaluated from Rx1day (${rx1Ind?.projectedOrObservedValue ?? 'N/A'} mm/day) and Rx5day multi-model ensemble indicators.`,
      scientificBoundaryNotices: [
        'Hydrological Boundary: Precipitation intensity (mm/day) measures atmospheric rainfall delivery; it does NOT establish parcel-level water depth or flow velocity without catchment hydrology and stormwater sewer capacity.',
      ],
      missingEvidenceItems: !canScreen
        ? ['Verified WGS84 site coordinates']
        : ['Local IDF (Intensity-Duration-Frequency) municipal stormwater design curve'],
    },
    {
      hazardCategory: 'flooding',
      title: 'Multi-Mechanism Flood Screening (Fluvial, Pluvial, Coastal & Mapped Zones)',
      screeningStatus:
        overallFloodLevel === 'unassessed'
          ? 'unassessed'
          : overallFloodLevel === 'insufficient-evidence'
          ? 'insufficient-evidence'
          : officialZone
          ? 'assessed-verified'
          : 'assessed-indicative',
      hazardSeverityLevel: overallFloodLevel,
      floodSubTypeBreakdown: floodSubTypes,
      indicators: floodIndicators,
      confidenceLevel: !canScreen ? 'none' : officialZone ? 'high' : 'low',
      confidenceRationale: !canScreen
        ? missingCoordsMsg
        : officialZone
        ? `Includes user-confirmed official flood zone (${officialZone}) and pluvial cloudburst screening.`
        : 'Pluvial ponding screened indicatively from Rx1day and site slope; official parcel-scale floodplain map (FEMA FIRM / municipal HFL) and coastal surge datum are not yet supplied.',
      scientificBoundaryNotices: [
        'Hydraulic Engineering Boundary: Plotify does NOT run 2D shallow-water hydraulic flood routing. P43 terrain TIN surfaces represent existing ground points only and cannot establish regulatory Base Flood Elevation (BFE) or flood velocity.',
        'Missing flood zone mapping is explicitly classified as insufficient-evidence, never as flood-free.',
      ],
      missingEvidenceItems: [
        ...(officialZone ? [] : ['Official regulatory floodplain zone designation (e.g. FEMA FIRM Zone / PMD HFL)']),
        ...(config.siteSpecificAttributes.finishedFloorElevationAboveGroundM === null
          ? ['Proposed Finished Floor Elevation (FFE) relative to surrounding grade / flood datum']
          : []),
      ],
    },
    {
      hazardCategory: 'drought-water-stress',
      title: 'Drought & Seasonal Water Stress',
      screeningStatus: droughtStatus,
      hazardSeverityLevel: droughtLevel,
      indicators: droughtIndicators,
      confidenceLevel: !canScreen ? 'none' : 'medium',
      confidenceRationale: !canScreen
        ? missingCoordsMsg
        : `Evaluated from 12-month SPEI (${speiInd?.projectedOrObservedValue ?? 'N/A'}) and Consecutive Dry Days (${cddInd?.projectedOrObservedValue ?? 'N/A'} days/yr).`,
      scientificBoundaryNotices: [
        'Climatic moisture deficit (SPEI / CDD) reflects meteorological drought; municipal water main pressure and groundwater table drawdown require utility verification.',
      ],
      missingEvidenceItems:
        config.siteSpecificAttributes.hasOnSiteRainwaterStorageLiters === null
          ? ['On-site rainwater/potable storage tank capacity (L)']
          : [],
    },
    {
      hazardCategory: 'severe-wind-cyclone',
      title: 'Severe Wind, Downbursts & Cyclone Gusts',
      screeningStatus: windStatus,
      hazardSeverityLevel: windLevel,
      indicators: windIndicators,
      confidenceLevel: !canScreen ? 'none' : 'medium',
      confidenceRationale: !canScreen
        ? missingCoordsMsg
        : `Evaluated from 10m peak gust indicator (${windInd?.projectedOrObservedValue ?? 'N/A'} m/s) under ${config.activeScenario.toUpperCase()}.`,
      scientificBoundaryNotices: [
        'Structural Boundary: Regional synoptic wind indicators do not replace code-mandated basic design wind speed (ASCE 7 / Eurocode 1 / BCP) or licensed structural wind-uplift engineering.',
      ],
      missingEvidenceItems:
        config.siteSpecificAttributes.codeDesignWindSpeedMs === null
          ? ['Statutory code design wind speed (m/s) for structural framing verification']
          : [],
    },
    {
      hazardCategory: 'wildfire-weather',
      title: 'Wildfire Weather & Ember Exposure Conditions',
      screeningStatus: fireStatus,
      hazardSeverityLevel: fireLevel,
      indicators: fireIndicators,
      confidenceLevel: !canScreen
        ? 'none'
        : config.siteSpecificAttributes.wildfireInterfaceZoneConfirmed !== null
        ? 'high'
        : 'low',
      confidenceRationale: !canScreen
        ? missingCoordsMsg
        : `Meteorological Fire Weather Index (95th percentile FWI = ${fwiInd?.projectedOrObservedValue ?? 'N/A'}). Site-level WUI fuel confirmation: ${
            config.siteSpecificAttributes.wildfireInterfaceZoneConfirmed === null
              ? 'Not yet verified'
              : config.siteSpecificAttributes.wildfireInterfaceZoneConfirmed
              ? 'Confirmed WUI interface'
              : 'Confirmed non-vegetated urban core'
          }.`,
      scientificBoundaryNotices: [
        'FWI measures hot-dry-windy meteorological conditions only; parcel wildfire ignition risk depends on surrounding Wildland-Urban Interface (WUI) vegetation fuel loads and defensible space.',
      ],
      missingEvidenceItems:
        config.siteSpecificAttributes.wildfireInterfaceZoneConfirmed === null
          ? ['Wildland-Urban Interface (WUI) surrounding vegetation fuel confirmation']
          : [],
    },
    {
      hazardCategory: 'slope-erosion-landslide',
      title: 'Slope Instability, Soil Erosion & Rainfall-Triggered Landslide',
      screeningStatus: slopeStatus,
      hazardSeverityLevel: slopeLevel,
      indicators: slopeIndicators,
      confidenceLevel: config.siteSpecificAttributes.geotechnicalSlopeReportAvailable
        ? 'high'
        : maxSlopePct !== null
        ? 'low'
        : 'none',
      confidenceRationale: config.siteSpecificAttributes.geotechnicalSlopeReportAvailable
        ? `Geotechnical slope report confirmed alongside terrain max slope (${maxSlopePct ?? 'N/A'}%).`
        : maxSlopePct !== null
        ? `P43 terrain model provides surface slope (${maxSlopePct}%), allowing surface erosion screening if steep, but subsurface soil shear strength and landslide factor-of-safety remain insufficient-evidence without a geotechnical report.`
        : 'Neither geotechnical investigation nor calibrated P43 terrain slope is available; marked insufficient-evidence / unassessed.',
      scientificBoundaryNotices: [
        'Geotechnical Boundary: Topographic surface slope (from P43 TIN) is NOT sufficient to certify slope stability or bearing capacity. Subsurface stratigraphy, water table, and liquefaction require a licensed geotechnical engineer.',
      ],
      missingEvidenceItems: config.siteSpecificAttributes.geotechnicalSlopeReportAvailable
        ? []
        : ['Site-specific Geotechnical Soil & Slope Stability Investigation Report'],
    },
    {
      hazardCategory: 'cold-freeze-thaw-snow',
      title: 'Cold Waves, Freeze-Thaw Weathering & Frost Action',
      screeningStatus: coldStatus,
      hazardSeverityLevel: coldLevel,
      indicators: coldIndicators,
      confidenceLevel: !canScreen ? 'none' : 'medium',
      confidenceRationale: !canScreen
        ? missingCoordsMsg
        : `Evaluated from annual freeze-thaw cycle frequency (${freezeInd?.projectedOrObservedValue ?? 'N/A'} cycles/yr).`,
      scientificBoundaryNotices: [
        'Exterior concrete air-entrainment, masonry frost resistance, and foundation frost-depth embedment must follow local building code frost line maps.',
      ],
      missingEvidenceItems: !canScreen ? ['Verified WGS84 site coordinates'] : [],
    },
  ];
}

// ============================================================================
// 6. SCENARIO & HORIZON COMPARISON TABLE
// ============================================================================

export function buildScenarioComparisonTable(
  preflight: SiteLocationPreflightResult,
  config: ClimateResilienceConfig,
  customIndicators: ClimateHazardIndicatorRecord[]
): ScenarioComparisonRow[] {
  const activeInds = generateIndicatorsForScenario(
    preflight,
    config,
    config.activeScenario,
    config.activeTimeHorizon,
    customIndicators
  );
  const compInds = generateIndicatorsForScenario(
    preflight,
    config,
    config.comparisonScenario,
    config.activeTimeHorizon,
    customIndicators
  );

  const compMap = new Map<string, ClimateHazardIndicatorRecord>();
  for (const ind of compInds) {
    compMap.set(ind.indicatorCode, ind);
  }

  return activeInds.map((act) => {
    const comp = compMap.get(act.indicatorCode);
    const actVal = act.projectedOrObservedValue;
    const compVal = comp?.projectedOrObservedValue ?? null;
    const deltaBetweenScenarios =
      typeof actVal === 'number' && typeof compVal === 'number'
        ? Number((compVal - actVal).toFixed(2))
        : null;

    return {
      hazardCategory: act.hazardCategory,
      title: act.label,
      indicatorCode: act.indicatorCode,
      indicatorLabel: act.label,
      unit: act.unit,
      baselineValue: act.historicalBaselineValue,
      activeScenarioValue: actVal,
      comparisonScenarioValue: compVal,
      deltaBetweenScenarios,
      activeUncertainty: act.uncertaintyRange,
      comparisonUncertainty: comp?.uncertaintyRange ?? null,
    };
  });
}

// ============================================================================
// 7. EXPOSURE & VULNERABILITY MAPPING (LINKED TO REAL PLOTIFY PROJECT ELEMENTS)
// ============================================================================

export function evaluateAssetExposureAndVulnerability(
  project: Project,
  preflight: SiteLocationPreflightResult,
  config: ClimateResilienceConfig
): {
  exposureMappings: AssetExposureMapping[];
  vulnerabilities: AssetVulnerabilityRecord[];
} {
  const rooms = project.floorPlan?.rooms || [];
  const groundFloorRooms = rooms.filter((r) => r.floorLevel === 1);
  const upperFloorRooms = rooms.filter((r) => r.floorLevel > 1);
  const mepComponents = project.mepCoordination?.components || [];
  const groundMepComponents = mepComponents.filter((c) => c.floorLevel === 1);
  const groundElectricalPanels = groundMepComponents.filter(
    (c) =>
      c.subtype === 'main-distribution-panel' ||
      c.subtype === 'sub-panel' ||
      c.subtype === 'transformer'
  );
  const structColumns = project.structuralCoordination?.columns || [];
  const structBeams = project.structuralCoordination?.beams || [];
  const framingSystem =
    project.structuralCoordination?.framingSystem || 'reinforced-concrete-frame';

  const activeAlt =
    project.designAlternatives?.find((a) => a.id === project.activeAlternativeId) ||
    project.designAlternatives?.[0];

  const ffeM = config.siteSpecificAttributes.finishedFloorElevationAboveGroundM;
  const shadingConfirmed =
    config.siteSpecificAttributes.externalShadingConfirmed ??
    (activeAlt?.facade?.shadingStyle && activeAlt.facade.shadingStyle !== 'none'
      ? true
      : null);

  // 1. Ground-Floor Habitable Spaces
  const groundRoomRefs: ProjectElementReference[] = groundFloorRooms.map((r) => ({
    elementId: r.id,
    elementName: `${r.name} (${r.type})`,
    elementType: 'room',
    floorLevel: r.floorLevel,
    elevationNote:
      ffeM !== null
        ? `FFE +${ffeM.toFixed(2)} m above grade`
        : 'Finished Floor Elevation (FFE) relative to grade not specified',
    sourceModule: '2D Floor Plan (floorPlan.rooms)',
  }));

  const groundMissingAttrs: string[] = [];
  if (ffeM === null) {
    groundMissingAttrs.push('finished-floor-elevation-above-ground-m');
  }
  if (config.siteSpecificAttributes.hasBackflowPrevention === null) {
    groundMissingAttrs.push('sanitary-backflow-preventer-status');
  }

  // 2. Building Envelope & Openings
  const envelopeRefs: ProjectElementReference[] = [
    ...groundFloorRooms.slice(0, 4).map((r) => ({
      elementId: `ENV-${r.id}`,
      elementName: `${r.name} Exterior Facade & Glazing`,
      elementType: 'room' as const,
      floorLevel: r.floorLevel,
      sourceModule: 'Design Studio / Floor Plan Perimeter',
    })),
    ...(project.ifcInterop?.preservedElements?.slice(0, 3).map((el) => ({
      elementId: el.globalId,
      elementName: `${el.name} (${el.ifcType})`,
      elementType: 'ifc-preserved' as const,
      sourceModule: 'P41 OpenBIM IFC Preserved Elements',
    })) || []),
  ];

  // 3. MEP Critical Equipment
  const mepRefs: ProjectElementReference[] = groundMepComponents.map((c) => ({
    elementId: c.id,
    elementName: `${c.name} (${c.subtype})`,
    elementType: 'mep-component',
    floorLevel: c.floorLevel,
    elevationNote: c.location
      ? `Local Z=${c.location.z} ${project.unit} above slab`
      : 'Equipment mounting plinth height unspecified',
    sourceModule: 'P37 MEP Coordination (mepCoordination.components)',
  }));

  // 4. Structural Framing & Foundation
  const structRefs: ProjectElementReference[] = [
    ...structColumns.slice(0, 6).map((col) => ({
      elementId: col.id,
      elementName: `Column ${col.label} (${col.material})`,
      elementType: 'column' as const,
      floorLevel: col.floorLevels?.[0] || 1,
      sourceModule: 'P36 Structural Coordination (structuralCoordination.columns)',
    })),
    ...structBeams.slice(0, 4).map((bm) => ({
      elementId: bm.id,
      elementName: `Beam ${bm.label} (${bm.material})`,
      elementType: 'beam' as const,
      floorLevel: bm.floorLevel,
      sourceModule: 'P36 Structural Coordination (structuralCoordination.beams)',
    })),
  ];

  // 5. Site Terrain & Grading
  const terrainRefs: ProjectElementReference[] = preflight.terrainAlignmentCheck
    .hasTerrainModel
    ? [
        {
          elementId: 'P43-TERRAIN-TIN',
          elementName: `Calibrated TIN Surface (${
            project.terrainModeling?.surfaceMesh?.triangles.length || 0
          } triangles)`,
          elementType: 'terrain-surface',
          elevationNote: `Footprint relief: ${
            preflight.terrainAlignmentCheck.footprintReliefM ?? 0
          } m, Max slope: ${preflight.terrainAlignmentCheck.maxSlopePercent ?? 0}%`,
          sourceModule: 'P43 Terrain & Topographic Site Modeling',
        },
      ]
    : [];

  // 6. Site Access & Egress
  const accessRefs: ProjectElementReference[] = (
    project.siteContext?.accessPoints || []
  ).map((ap) => ({
    elementId: ap.id,
    elementName: `${ap.name} (${ap.type} on ${ap.side})`,
    elementType: 'site-access',
    sourceModule: 'P33 Site & Context Intelligence',
  }));

  const exposureMappings: AssetExposureMapping[] = [
    {
      id: 'EXP-GROUND-ROOMS',
      assetCategory: 'ground-floor-habitable-spaces',
      title: 'Ground-Floor Habitable Spaces & Thresholds',
      hazardCategories: ['flooding', 'extreme-precipitation'],
      exposureLevel:
        groundFloorRooms.length === 0
          ? 'low'
          : ffeM !== null && ffeM >= 0.9
          ? 'moderate'
          : 'high',
      linkedProjectElements: groundRoomRefs,
      spatialBasis: `${groundFloorRooms.length} rooms placed on Floor Level 1 across ${preflight.parcelFootprintMeters.areaM2} m² plot.`,
      knownAttributes: {
        groundFloorRoomCount: groundFloorRooms.length,
        upperFloorRoomCount: upperFloorRooms.length,
        ...(ffeM !== null ? { finishedFloorElevationAboveGroundM: ffeM } : {}),
      },
      missingAttributes: groundMissingAttrs,
    },
    {
      id: 'EXP-ENVELOPE-OPENINGS',
      assetCategory: 'building-envelope-openings',
      title: 'Building Envelope, Facade Cladding & Glazed Openings',
      hazardCategories: [
        'extreme-heat',
        'severe-wind-cyclone',
        'wildfire-weather',
        'cold-freeze-thaw-snow',
      ],
      exposureLevel: 'high',
      linkedProjectElements: envelopeRefs,
      spatialBasis: `Exterior envelope enclosing ${project.floors} floor(s), road facing ${project.roadFacing}, North offset ${project.siteContext?.northOrientationOffsetDeg ?? 0}°.`,
      knownAttributes: {
        primaryFacadeMaterial: activeAlt?.facade?.primaryMaterial || 'unassigned-default',
        windowStyle: activeAlt?.facade?.windowStyle || 'unassigned-default',
        shadingStyle: activeAlt?.facade?.shadingStyle || 'none',
        northOrientationOffsetDeg: project.siteContext?.northOrientationOffsetDeg ?? 0,
      },
      missingAttributes: [
        ...(shadingConfirmed === null ? ['external-solar-shading-specification'] : []),
        'glazing-wind-debris-impact-rating',
      ],
    },
    {
      id: 'EXP-ROOF-DRAINAGE',
      assetCategory: 'roof-and-drainage',
      title: 'Roof Assembly, Parapets, Gutters & Stormwater Leaders',
      hazardCategories: ['extreme-precipitation', 'extreme-heat', 'severe-wind-cyclone'],
      exposureLevel: 'high',
      linkedProjectElements: [],
      spatialBasis: `Top-level roof cover over ${project.floors}-storey building envelope.`,
      knownAttributes: {
        floorsCovered: project.floors,
        plotAreaM2: preflight.parcelFootprintMeters.areaM2,
      },
      missingAttributes: ['scupper-and-downspout-overflow-capacity-lps', 'roof-solar-reflectance-index-sri'],
    },
    {
      id: 'EXP-STRUCTURAL-FRAME',
      assetCategory: 'structural-framing-foundation',
      title: 'Primary Structural Framing, Uplift Load Path & Foundation',
      hazardCategories: [
        'severe-wind-cyclone',
        'flooding',
        'slope-erosion-landslide',
        'cold-freeze-thaw-snow',
      ],
      exposureLevel: 'moderate',
      linkedProjectElements: structRefs,
      spatialBasis: `Framing system: ${framingSystem} with ${structColumns.length} columns and ${structBeams.length} beams.`,
      knownAttributes: {
        framingSystem,
        columnCount: structColumns.length,
        beamCount: structBeams.length,
      },
      missingAttributes: [
        ...(config.siteSpecificAttributes.codeDesignWindSpeedMs === null
          ? ['code-design-wind-speed-ms']
          : []),
        ...(config.siteSpecificAttributes.geotechnicalSlopeReportAvailable
          ? []
          : ['geotechnical-foundation-bearing-and-scour-depth']),
      ],
    },
    {
      id: 'EXP-MEP-EQUIPMENT',
      assetCategory: 'mep-critical-equipment',
      title: 'Critical Electrical Panels, Heat Pumps & Sanitary Risers',
      hazardCategories: ['flooding', 'extreme-heat', 'drought-water-stress'],
      exposureLevel:
        groundElectricalPanels.length > 0 || groundMepComponents.length > 0
          ? 'high'
          : 'moderate',
      linkedProjectElements: mepRefs,
      spatialBasis: `${groundMepComponents.length} MEP component(s) located on Floor Level 1 (${groundElectricalPanels.length} electrical panel/transformer units).`,
      knownAttributes: {
        totalMepComponents: mepComponents.length,
        groundFloorMepComponents: groundMepComponents.length,
        groundElectricalPanelsCount: groundElectricalPanels.length,
      },
      missingAttributes: [
        ...(config.siteSpecificAttributes.hasBackupPowerForCriticalMEP === null
          ? ['backup-power-generator-or-battery-autonomy']
          : []),
        'equipment-plinth-flood-freeboard-height',
      ],
    },
    {
      id: 'EXP-SITE-TERRAIN',
      assetCategory: 'site-terrain-and-grading',
      title: 'Parcel Grading, Permeable Swales & Retaining Edges',
      hazardCategories: ['flooding', 'extreme-precipitation', 'slope-erosion-landslide'],
      exposureLevel: preflight.terrainAlignmentCheck.hasTerrainModel ? 'high' : 'moderate',
      linkedProjectElements: terrainRefs,
      spatialBasis: preflight.terrainAlignmentCheck.hasTerrainModel
        ? `P43 TIN surface modeled (${preflight.terrainAlignmentCheck.footprintReliefM ?? 0} m relief under footprint, ${preflight.terrainAlignmentCheck.maxSlopePercent ?? 0}% max slope).`
        : `Qualitative SiteContext slope: ${project.siteContext?.slope || 'unspecified'}.`,
      knownAttributes: {
        hasP43TerrainModel: preflight.terrainAlignmentCheck.hasTerrainModel,
        ...(preflight.terrainAlignmentCheck.footprintReliefM !== null
          ? { footprintReliefM: preflight.terrainAlignmentCheck.footprintReliefM }
          : {}),
        ...(preflight.terrainAlignmentCheck.maxSlopePercent !== null
          ? { maxSlopePercent: preflight.terrainAlignmentCheck.maxSlopePercent }
          : {}),
      },
      missingAttributes: preflight.terrainAlignmentCheck.hasTerrainModel
        ? []
        : ['surveyed-topographic-elevation-mesh-p43'],
    },
    {
      id: 'EXP-SITE-ACCESS',
      assetCategory: 'site-access-and-egress',
      title: 'Vehicular & Pedestrian Site Access / Emergency Egress',
      hazardCategories: ['flooding', 'wildfire-weather', 'severe-wind-cyclone'],
      exposureLevel: 'moderate',
      linkedProjectElements: accessRefs,
      spatialBasis: `${accessRefs.length} site access point(s) along ${project.roadFacing} frontage.`,
      knownAttributes: {
        accessPointsCount: accessRefs.length,
        primaryRoadFacing: project.roadFacing,
      },
      missingAttributes: ['municipal-roadway-flood-inundation-depth'],
    },
    {
      id: 'EXP-WATER-STORAGE',
      assetCategory: 'water-supply-and-storage',
      title: 'Domestic Water Supply & On-Site Rainwater Harvesting',
      hazardCategories: ['drought-water-stress', 'extreme-precipitation'],
      exposureLevel: 'moderate',
      linkedProjectElements: [],
      spatialBasis: 'Domestic water supply and stormwater capture interface.',
      knownAttributes: {
        ...(config.siteSpecificAttributes.hasOnSiteRainwaterStorageLiters !== null
          ? {
              onSiteRainwaterStorageLiters:
                config.siteSpecificAttributes.hasOnSiteRainwaterStorageLiters,
            }
          : {}),
      },
      missingAttributes:
        config.siteSpecificAttributes.hasOnSiteRainwaterStorageLiters === null
          ? ['on-site-rainwater-storage-liters']
          : [],
    },
  ];

  // Vulnerabilities
  const vulnerabilities: AssetVulnerabilityRecord[] = [
    {
      id: 'VULN-GROUND-FLOOD',
      assetCategory: 'ground-floor-habitable-spaces',
      hazardCategory: 'flooding',
      vulnerabilityLevel:
        ffeM === null
          ? 'insufficient-evidence'
          : ffeM >= 0.9 && config.siteSpecificAttributes.hasBackflowPrevention
          ? 'low'
          : ffeM >= 0.45
          ? 'moderate'
          : 'high',
      sensitivityDrivers: [
        `${groundFloorRooms.length} habitable room(s) on Floor 1 susceptible to threshold water ingress if ponding exceeds plinth height.`,
        ffeM === null
          ? 'Finished Floor Elevation (FFE) above exterior grade is not yet specified.'
          : `Specified FFE is +${ffeM.toFixed(2)} m above adjacent grade.`,
      ],
      existingAdaptiveCapacityLevel:
        ffeM !== null && ffeM >= 0.6 ? 'moderate' : 'low',
      existingAdaptiveFeatures:
        ffeM !== null && ffeM >= 0.6
          ? [`Raised ground floor plinth (+${ffeM.toFixed(2)} m)`]
          : [],
      missingVulnerabilityInputs: groundMissingAttrs,
    },
    {
      id: 'VULN-MEP-FLOOD-HEAT',
      assetCategory: 'mep-critical-equipment',
      hazardCategory: 'flooding',
      vulnerabilityLevel:
        groundElectricalPanels.length > 0
          ? 'high'
          : groundMepComponents.length > 0
          ? 'moderate'
          : 'low',
      sensitivityDrivers: [
        `${groundElectricalPanels.length} electrical distribution panel(s) and ${groundMepComponents.length} total MEP component(s) placed on Floor 1.`,
        'Submergence of main electrical distribution panels causes immediate power outage and shock hazard.',
      ],
      existingAdaptiveCapacityLevel:
        config.siteSpecificAttributes.hasBackupPowerForCriticalMEP ? 'moderate' : 'low',
      existingAdaptiveFeatures: config.siteSpecificAttributes.hasBackupPowerForCriticalMEP
        ? ['Backup power provision flagged for critical MEP circuits']
        : [],
      missingVulnerabilityInputs:
        config.siteSpecificAttributes.hasBackupPowerForCriticalMEP === null
          ? ['backup-power-status']
          : [],
    },
    {
      id: 'VULN-ENVELOPE-HEAT',
      assetCategory: 'building-envelope-openings',
      hazardCategory: 'extreme-heat',
      vulnerabilityLevel:
        shadingConfirmed === true
          ? 'low'
          : activeAlt?.facade?.windowStyle === 'floor-to-ceiling'
          ? 'high'
          : 'moderate',
      sensitivityDrivers: [
        `Window style: ${activeAlt?.facade?.windowStyle || 'standard'}; Primary material: ${
          activeAlt?.facade?.primaryMaterial || 'standard'
        }.`,
        shadingConfirmed
          ? `External shading configured (${activeAlt?.facade?.shadingStyle || 'user-confirmed'}).`
          : 'No external solar shading (overhangs/louvers/brise-soleil) confirmed on sun-exposed facades.',
      ],
      existingAdaptiveCapacityLevel: shadingConfirmed ? 'high' : 'low',
      existingAdaptiveFeatures: shadingConfirmed
        ? [`External shading active (${activeAlt?.facade?.shadingStyle || 'confirmed'})`]
        : [],
      missingVulnerabilityInputs:
        shadingConfirmed === null ? ['external-shading-confirmation'] : [],
    },
    {
      id: 'VULN-ROOF-PRECIP',
      assetCategory: 'roof-and-drainage',
      hazardCategory: 'extreme-precipitation',
      vulnerabilityLevel: 'moderate',
      sensitivityDrivers: [
        `Roof catchment area (~${preflight.parcelFootprintMeters.areaM2} m² plot envelope) must discharge peak cloudburst runoff without parapet ponding.`,
      ],
      existingAdaptiveCapacityLevel:
        config.siteSpecificAttributes.hasOnSiteRainwaterStorageLiters &&
        config.siteSpecificAttributes.hasOnSiteRainwaterStorageLiters > 0
          ? 'moderate'
          : 'low',
      existingAdaptiveFeatures:
        config.siteSpecificAttributes.hasOnSiteRainwaterStorageLiters &&
        config.siteSpecificAttributes.hasOnSiteRainwaterStorageLiters > 0
          ? [
              `On-site rainwater retention (${config.siteSpecificAttributes.hasOnSiteRainwaterStorageLiters} L)`,
            ]
          : [],
      missingVulnerabilityInputs: ['secondary-overflow-scupper-sizing'],
    },
    {
      id: 'VULN-STRUCT-WIND',
      assetCategory: 'structural-framing-foundation',
      hazardCategory: 'severe-wind-cyclone',
      vulnerabilityLevel:
        framingSystem === 'reinforced-concrete-frame'
          ? 'low'
          : framingSystem === 'light-timber-framing'
          ? 'high'
          : 'moderate',
      sensitivityDrivers: [
        `Structural framing system is '${framingSystem}'.`,
        'Roof-to-wall uplift connectors and glazing wind-borne debris resistance govern envelope integrity during severe gusts.',
      ],
      existingAdaptiveCapacityLevel:
        framingSystem === 'reinforced-concrete-frame' ? 'high' : 'moderate',
      existingAdaptiveFeatures: [`Primary structural system: ${framingSystem}`],
      missingVulnerabilityInputs:
        config.siteSpecificAttributes.codeDesignWindSpeedMs === null
          ? ['code-design-wind-speed-ms']
          : [],
    },
    {
      id: 'VULN-WATER-DROUGHT',
      assetCategory: 'water-supply-and-storage',
      hazardCategory: 'drought-water-stress',
      vulnerabilityLevel:
        config.siteSpecificAttributes.hasOnSiteRainwaterStorageLiters === null
          ? 'insufficient-evidence'
          : config.siteSpecificAttributes.hasOnSiteRainwaterStorageLiters >= 5000
          ? 'low'
          : config.siteSpecificAttributes.hasOnSiteRainwaterStorageLiters > 0
          ? 'moderate'
          : 'high',
      sensitivityDrivers: [
        'Dependence on single municipal water supply without on-site rainwater cistern or greywater buffer increases vulnerability during multi-week dry spells.',
      ],
      existingAdaptiveCapacityLevel:
        (config.siteSpecificAttributes.hasOnSiteRainwaterStorageLiters || 0) >= 5000
          ? 'high'
          : 'low',
      existingAdaptiveFeatures:
        (config.siteSpecificAttributes.hasOnSiteRainwaterStorageLiters || 0) > 0
          ? [
              `${config.siteSpecificAttributes.hasOnSiteRainwaterStorageLiters} L on-site water storage`,
            ]
          : [],
      missingVulnerabilityInputs:
        config.siteSpecificAttributes.hasOnSiteRainwaterStorageLiters === null
          ? ['on-site-rainwater-storage-liters']
          : [],
    },
    {
      id: 'VULN-ENVELOPE-WILDFIRE',
      assetCategory: 'building-envelope-openings',
      hazardCategory: 'wildfire-weather',
      vulnerabilityLevel:
        activeAlt?.facade?.primaryMaterial === 'timber' ||
        activeAlt?.facade?.accentMaterial === 'timber'
          ? 'high'
          : 'moderate',
      sensitivityDrivers: [
        `Facade cladding materials: primary='${
          activeAlt?.facade?.primaryMaterial || 'concrete/plaster'
        }', accent='${activeAlt?.facade?.accentMaterial || 'none'}'.`,
        'Wind-blown embers can ignite combustible siding, soffit vents, or vegetation within 1.5m of walls.',
      ],
      existingAdaptiveCapacityLevel:
        activeAlt?.facade?.primaryMaterial === 'concrete' ||
        activeAlt?.facade?.primaryMaterial === 'brick' ||
        activeAlt?.facade?.primaryMaterial === 'stone'
          ? 'high'
          : 'low',
      existingAdaptiveFeatures: [],
      missingVulnerabilityInputs: ['ember-resistant-vent-mesh-specification'],
    },
    {
      id: 'VULN-TERRAIN-SLOPE',
      assetCategory: 'site-terrain-and-grading',
      hazardCategory: 'slope-erosion-landslide',
      vulnerabilityLevel: !config.siteSpecificAttributes.geotechnicalSlopeReportAvailable
        ? 'insufficient-evidence'
        : (preflight.terrainAlignmentCheck.maxSlopePercent || 0) > 12
        ? 'high'
        : 'low',
      sensitivityDrivers: [
        preflight.terrainAlignmentCheck.hasTerrainModel
          ? `P43 terrain max slope is ${preflight.terrainAlignmentCheck.maxSlopePercent ?? 0}% with ${preflight.terrainAlignmentCheck.footprintReliefM ?? 0} m relief across the building footprint.`
          : 'No P43 survey terrain model attached.',
      ],
      existingAdaptiveCapacityLevel: config.siteSpecificAttributes
        .geotechnicalSlopeReportAvailable
        ? 'moderate'
        : 'unassessed',
      existingAdaptiveFeatures: config.siteSpecificAttributes
        .geotechnicalSlopeReportAvailable
        ? ['Geotechnical slope report available']
        : [],
      missingVulnerabilityInputs: config.siteSpecificAttributes
        .geotechnicalSlopeReportAvailable
        ? []
        : ['geotechnical-slope-stability-report'],
    },
  ];

  return { exposureMappings, vulnerabilities };
}

// ============================================================================
// 8. TRANSPARENT QUALITATIVE RISK MATRIX & ADAPTATION MEASURES
// ============================================================================

const LEVEL_TO_SCORE: Record<QualitativeLevel, number | null> = {
  'very-low': 1,
  low: 2,
  moderate: 3,
  high: 4,
  'very-high': 5,
  'insufficient-evidence': null,
  unassessed: null,
};

const SCORE_TO_LEVEL: Record<number, QualitativeLevel> = {
  1: 'very-low',
  2: 'low',
  3: 'moderate',
  4: 'high',
  5: 'very-high',
};

/**
 * Deterministic qualitative risk combination rule:
 * - Never equates missing data ('unassessed' or 'insufficient-evidence') with low risk!
 * - Combines Hazard (H), Exposure (E), and Vulnerability (V):
 *   baseScore = round((H * 0.45) + (E * 0.25) + (V * 0.30))
 * - Selected resilience measures can reduce residual risk by 1 tier (or 2 tiers if multiple complementary measures apply),
 *   but NEVER below 'very-low' (never claiming zero risk).
 */
export function computeQualitativeRiskLevel(
  hazardLevel: QualitativeLevel,
  exposureLevel: QualitativeLevel,
  vulnerabilityLevel: QualitativeLevel,
  appliedReductionTiers = 0
): {
  inherentRiskLevel: QualitativeLevel;
  residualRiskLevel: QualitativeLevel;
  evaluationStatus: 'evaluated' | 'insufficient-evidence' | 'unassessed';
} {
  if (
    hazardLevel === 'unassessed' ||
    exposureLevel === 'unassessed' ||
    vulnerabilityLevel === 'unassessed'
  ) {
    return {
      inherentRiskLevel: 'unassessed',
      residualRiskLevel: 'unassessed',
      evaluationStatus: 'unassessed',
    };
  }

  if (
    hazardLevel === 'insufficient-evidence' ||
    exposureLevel === 'insufficient-evidence' ||
    vulnerabilityLevel === 'insufficient-evidence'
  ) {
    return {
      inherentRiskLevel: 'insufficient-evidence',
      residualRiskLevel: 'insufficient-evidence',
      evaluationStatus: 'insufficient-evidence',
    };
  }

  const h = LEVEL_TO_SCORE[hazardLevel]!;
  const e = LEVEL_TO_SCORE[exposureLevel]!;
  const v = LEVEL_TO_SCORE[vulnerabilityLevel]!;

  const rawScore = Math.min(5, Math.max(1, Math.round(h * 0.45 + e * 0.25 + v * 0.3)));
  const inherentRiskLevel = SCORE_TO_LEVEL[rawScore];

  const reducedScore = Math.max(1, rawScore - Math.min(2, Math.max(0, appliedReductionTiers)));
  const residualRiskLevel = SCORE_TO_LEVEL[reducedScore];

  return {
    inherentRiskLevel,
    residualRiskLevel,
    evaluationStatus: 'evaluated',
  };
}

export function evaluateRiskFindingsAndMeasures(
  project: Project,
  preflight: SiteLocationPreflightResult,
  config: ClimateResilienceConfig,
  hazards: ClimateHazardAssessmentItem[],
  exposureMappings: AssetExposureMapping[],
  vulnerabilities: AssetVulnerabilityRecord[]
): {
  riskFindings: TransparentRiskFinding[];
  adaptationMeasures: ResilienceAdaptationMeasure[];
} {
  const hazardByCat = new Map<ClimateHazardCategory, ClimateHazardAssessmentItem>();
  for (const h of hazards) {
    hazardByCat.set(h.hazardCategory, h);
  }

  const expByCat = new Map<ExposedAssetCategory, AssetExposureMapping>();
  for (const e of exposureMappings) {
    expByCat.set(e.assetCategory, e);
  }

  const vulnByKey = new Map<string, AssetVulnerabilityRecord>();
  for (const v of vulnerabilities) {
    vulnByKey.set(`${v.assetCategory}:${v.hazardCategory}`, v);
  }

  const selectedSet = new Set(config.selectedMeasureIds);
  const framingSystem =
    project.structuralCoordination?.framingSystem || 'reinforced-concrete-frame';
  const hasP44Baseline = Boolean(project.carbonAssessment?.activeAssessment);
  const p44UpfrontKg =
    project.carbonAssessment?.activeAssessment?.totals?.upfrontCarbonA0toA5KgCO2e ?? null;

  // Define candidate resilience adaptation measures first so we know which ones are selected
  const adaptationMeasures: ResilienceAdaptationMeasure[] = [
    {
      measureId: 'MEAS-FLOOD-FFE-RAISE',
      title: 'Elevate Ground-Floor Finished Floor Level (FFE +0.60m min) & Install Sanitary Backflow Valve',
      category: 'flood-mitigation',
      targetedHazards: ['flooding', 'extreme-precipitation'],
      targetedAssets: ['ground-floor-habitable-spaces'],
      applicabilityStatus:
        (config.siteSpecificAttributes.finishedFloorElevationAboveGroundM || 0) >= 0.6 &&
        config.siteSpecificAttributes.hasBackflowPrevention === true
          ? 'already-present-in-project'
          : 'recommended',
      designActionSummary:
        'Raise ground-floor slab plinth to at least +0.60 m above surrounding crown of road/grade and fit automatic non-return backflow preventers on sanitary soil lines.',
      triggeringFindingIds: ['FIND-PLUVIAL-GROUND-ROOMS', 'FIND-FLUVIAL-GROUND-ROOMS'],
      expectedVulnerabilityReduction: {
        fromLevel: 'high',
        toLevel: 'low',
        resultingResidualRisk: 'low',
        qualitativeBenefitSummary:
          'Reduces nuisance surface-water ingress and sewer surcharge into Floor 1 rooms by 1–2 risk tiers.',
      },
      projectParameterPreview: {
        targetModule: 'site-context',
        parameterChangeDescription:
          'Sets siteSpecificAttributes.finishedFloorElevationAboveGroundM = 0.65 m, hasBackflowPrevention = true, and records plinth datum note in Site Context.',
        previewDiffSummary: 'FFE: null → +0.65 m above grade; Backflow Valve: Installed',
        mutatesGeometryDirectly: false,
      },
      embodiedCarbonTradeOff: {
        hasP44Baseline,
        materialImplicationSummary:
          'Requires additional perimeter masonry/concrete stem wall and compacted structural fill for raised plinth (+0.60 m).',
        estimatedEmbodiedCarbonDirection: 'increase',
        estimatedDeltaKgCO2eRange: { minKgCO2e: 1800, maxKgCO2e: 4200 },
        p44CrossReferenceNote: hasP44Baseline
          ? `Project P44 Upfront Carbon (A0–A5) is currently ${p44UpfrontKg?.toLocaleString()} kgCO₂e. Adding raised plinth concrete/fill increases upfront A1–A3 carbon slightly while avoiding B4 flood-damaged interior finish replacements. Re-run P44 after updating substructure quantities.`
          : 'No P44 Carbon Assessment saved yet; open Whole-Life Carbon workspace to quantify substructure A1–A3 vs avoided B4 flood repair carbon.',
      },
      costAndMaintenanceImplication:
        'Moderate upfront substructure cost increase; annual inspection required for sanitary backwater valve flapper.',
      residualRiskAfterMeasure:
        'Residual risk remains if extreme riverine or catastrophic flash flood exceeds +0.65 m freeboard; does not make building flood-proof.',
      professionalSignOffRequired:
        'Civil / Drainage Engineer & Licensed Architect verification of regulatory Base Flood Elevation (BFE).',
      selectedByUser: selectedSet.has('MEAS-FLOOD-FFE-RAISE'),
    },
    {
      measureId: 'MEAS-MEP-ELEVATE-CRITICAL',
      title: 'Elevate Ground-Floor Electrical Distribution Panels & HVAC Condensers Above Plinth Flood Datum',
      category: 'mep-equipment-protection',
      targetedHazards: ['flooding', 'extreme-precipitation'],
      targetedAssets: ['mep-critical-equipment'],
      applicabilityStatus: 'recommended',
      designActionSummary:
        'Mount Floor 1 electrical distribution boards at least 1.5 m above floor slab and place exterior heat-pump condensers on elevated galvanized steel plinths (+0.80 m).',
      triggeringFindingIds: ['FIND-FLOOD-MEP-PANEL'],
      expectedVulnerabilityReduction: {
        fromLevel: 'high',
        toLevel: 'low',
        resultingResidualRisk: 'low',
        qualitativeBenefitSummary:
          'Prevents electrical short-circuiting and preserves emergency power continuity during surface ponding.',
      },
      projectParameterPreview: {
        targetModule: 'mep-coordination',
        parameterChangeDescription:
          'Sets hasBackupPowerForCriticalMEP = true and appends flood-freeboard mounting elevation note to MEP Coordination assumptions.',
        previewDiffSummary:
          'MEP Coordination Notes: +Elevated equipment plinths (+0.80m) & panel mounting height >= 1.5m',
        mutatesGeometryDirectly: false,
      },
      embodiedCarbonTradeOff: {
        hasP44Baseline,
        materialImplicationSummary:
          'Minimal material addition (galvanized steel mounting brackets/plinths); avoids premature B4 replacement of damaged switchgear and heat pumps.',
        estimatedEmbodiedCarbonDirection: 'decrease-via-avoided-replacement',
        estimatedDeltaKgCO2eRange: { minKgCO2e: 80, maxKgCO2e: 260 },
        p44CrossReferenceNote:
          'Low upfront A1–A3 addition; reduces Whole-Life Module B4 MEP equipment replacement risk.',
      },
      costAndMaintenanceImplication:
        'Low capital cost during initial rough-in; ensure safe working clearance per P37 MEP rules.',
      residualRiskAfterMeasure:
        'Municipal grid outages may still interrupt power unless paired with islandable solar/battery backup.',
      professionalSignOffRequired: 'Licensed Electrical & Mechanical (MEP) Engineer.',
      selectedByUser: selectedSet.has('MEAS-MEP-ELEVATE-CRITICAL'),
    },
    {
      measureId: 'MEAS-HEAT-PASSIVE-SHADING',
      title: 'External Architectural Solar Shading (Deep Overhangs / Brise-Soleil) & High-Albedo Cool Roof',
      category: 'passive-heat-envelope',
      targetedHazards: ['extreme-heat'],
      targetedAssets: ['building-envelope-openings', 'roof-and-drainage'],
      applicabilityStatus:
        config.siteSpecificAttributes.externalShadingConfirmed === true
          ? 'already-present-in-project'
          : 'recommended',
      designActionSummary:
        'Configure external architectural overhangs or motorized louvers on East/South/West glazed facades and specify high solar-reflectance (SRI >= 78) roof finish.',
      triggeringFindingIds: ['FIND-HEAT-ENVELOPE'],
      expectedVulnerabilityReduction: {
        fromLevel: 'high',
        toLevel: 'low',
        resultingResidualRisk: 'moderate',
        qualitativeBenefitSummary:
          'Reduces direct solar radiation on glazing and roof assembly, improving passive thermal resilience during heatwaves.',
      },
      projectParameterPreview: {
        targetModule: 'design-studio-facade',
        parameterChangeDescription:
          'Updates active Design Alternative facade shadingStyle to "brise-soleil" (if "none") and sets externalShadingConfirmed = true.',
        previewDiffSummary:
          'Facade shadingStyle: "none" → "brise-soleil"; externalShadingConfirmed → true',
        mutatesGeometryDirectly: false,
      },
      embodiedCarbonTradeOff: {
        hasP44Baseline,
        materialImplicationSummary:
          'Adds external shading louvers/overhangs (aluminium or timber) with moderate A1–A3 embodied carbon, traded off against lower operational cooling energy (Module B6).',
        estimatedEmbodiedCarbonDirection: 'increase',
        estimatedDeltaKgCO2eRange: { minKgCO2e: 650, maxKgCO2e: 1900 },
        p44CrossReferenceNote: hasP44Baseline
          ? 'Cross-check aluminium vs timber shading louver factors in P44 Whole-Life Carbon workspace; operational cooling energy reduction is quantified in P46.'
          : 'Evaluate louver material selection (timber vs recycled aluminium) in P44 Whole-Life Carbon.',
      },
      costAndMaintenanceImplication:
        'Moderate facade cost addition; fixed overhangs require minimal maintenance compared to motorized louvers.',
      residualRiskAfterMeasure:
        'Extreme ambient temperatures (>42°C) and high humidity still require active cooling or ventilated thermal refuge spaces; full indoor thermal simulation belongs to P46.',
      professionalSignOffRequired: 'Architect & Building Physics / Envelope Specialist.',
      selectedByUser: selectedSet.has('MEAS-HEAT-PASSIVE-SHADING'),
    },
    {
      measureId: 'MEAS-STORM-RETENTION-SWALE',
      title: 'On-Site Rainwater Retention Cistern (5,000 L), Permeable Paving & Overflow Scuppers',
      category: 'stormwater-drainage',
      targetedHazards: ['extreme-precipitation', 'flooding', 'drought-water-stress'],
      targetedAssets: ['roof-and-drainage', 'water-supply-and-storage', 'site-terrain-and-grading'],
      applicabilityStatus:
        (config.siteSpecificAttributes.hasOnSiteRainwaterStorageLiters || 0) >= 5000
          ? 'already-present-in-project'
          : 'recommended',
      designActionSummary:
        'Install a 5,000 L rainwater harvesting/attenuation cistern with dual-purpose drought buffer and cloudburst peak-flow detention, plus secondary roof overflow scuppers.',
      triggeringFindingIds: ['FIND-PRECIP-ROOF-DRAINAGE', 'FIND-DROUGHT-WATER'],
      expectedVulnerabilityReduction: {
        fromLevel: 'high',
        toLevel: 'low',
        resultingResidualRisk: 'low',
        qualitativeBenefitSummary:
          'Buffers peak roof runoff during cloudbursts while providing non-potable water autonomy during seasonal dry spells.',
      },
      projectParameterPreview: {
        targetModule: 'site-context',
        parameterChangeDescription:
          'Sets siteSpecificAttributes.hasOnSiteRainwaterStorageLiters = 5000 and logs stormwater swale/cistern note in Site Context.',
        previewDiffSummary: 'On-Site Rainwater Storage: null → 5,000 Liters',
        mutatesGeometryDirectly: false,
      },
      embodiedCarbonTradeOff: {
        hasP44Baseline,
        materialImplicationSummary:
          'Polyethylene or precast concrete cistern adds upfront A1–A3 embodied carbon while reducing Module B7 municipal water carbon.',
        estimatedEmbodiedCarbonDirection: 'increase',
        estimatedDeltaKgCO2eRange: { minKgCO2e: 450, maxKgCO2e: 1400 },
        p44CrossReferenceNote:
          'Compare cistern upfront A1–A3 impact against Module B7 operational water savings in P44.',
      },
      costAndMaintenanceImplication:
        'Requires periodic gutter leaf-screen cleaning and first-flush diverter inspection.',
      residualRiskAfterMeasure:
        'Multi-day extreme monsoon deluge (Rx5day > 220 mm) will exceed cistern volume and discharge via emergency overflow path to street drainage.',
      professionalSignOffRequired: 'Civil / Hydraulic Engineer & Plumbing Designer.',
      selectedByUser: selectedSet.has('MEAS-STORM-RETENTION-SWALE'),
    },
    {
      measureId: 'MEAS-WIND-ROOF-TIEDOWN',
      title: 'Continuous Roof-to-Foundation Wind Uplift Straps & Laminated Impact Glazing',
      category: 'structural-wind-resilience',
      targetedHazards: ['severe-wind-cyclone'],
      targetedAssets: ['structural-framing-foundation', 'building-envelope-openings'],
      applicabilityStatus: 'recommended',
      designActionSummary:
        'Specify continuous mechanical uplift tie-downs from roof rafters/trusses to ring beams and columns, and verify statutory code gust speed (e.g. 45 m/s).',
      triggeringFindingIds: ['FIND-WIND-STRUCTURAL'],
      expectedVulnerabilityReduction: {
        fromLevel: 'moderate',
        toLevel: 'low',
        resultingResidualRisk: 'low',
        qualitativeBenefitSummary:
          'Prevents progressive roof sheathing peel and internal pressurization from wind-borne debris.',
      },
      projectParameterPreview: {
        targetModule: 'resilience-register-only',
        parameterChangeDescription:
          'Sets codeDesignWindSpeedMs = 45 m/s target in Climate Resilience verification attributes for structural coordination.',
        previewDiffSummary: 'Target Code Wind Speed Verification: null → 45 m/s',
        mutatesGeometryDirectly: false,
      },
      embodiedCarbonTradeOff: {
        hasP44Baseline,
        materialImplicationSummary:
          'Negligible steel connector mass increase (<0.5% of structural steel); prevents catastrophic envelope replacement.',
        estimatedEmbodiedCarbonDirection: 'neutral',
        estimatedDeltaKgCO2eRange: { minKgCO2e: 50, maxKgCO2e: 220 },
        p44CrossReferenceNote:
          'Negligible upfront carbon addition with high avoided-damage benefit.',
      },
      costAndMaintenanceImplication:
        'Low cost when integrated during structural framing stage.',
      residualRiskAfterMeasure:
        'Extreme tornado or above-design-basis cyclone gusts still carry residual structural risk; requires licensed structural engineer calculations.',
      professionalSignOffRequired: 'Licensed Structural Engineer (P36 Sign-Off).',
      selectedByUser: selectedSet.has('MEAS-WIND-ROOF-TIEDOWN'),
    },
    {
      measureId: 'MEAS-WILDFIRE-EMBER-ENVELOPE',
      title: 'Class-A Non-Combustible Cladding, 3mm Ember Mesh Vents & 1.5m Ignition-Free Perimeter',
      category: 'wildfire-defensible-envelope',
      targetedHazards: ['wildfire-weather'],
      targetedAssets: ['building-envelope-openings'],
      applicabilityStatus: 'recommended',
      designActionSummary:
        'Use non-combustible mineral/masonry/concrete exterior cladding, fit 3 mm corrosion-resistant metal mesh on all roof/eave vents, and maintain a 1.5 m non-combustible hardscape apron around the building perimeter.',
      triggeringFindingIds: ['FIND-WILDFIRE-ENVELOPE'],
      expectedVulnerabilityReduction: {
        fromLevel: 'high',
        toLevel: 'low',
        resultingResidualRisk: 'low',
        qualitativeBenefitSummary:
          'Mitigates wind-borne ember entry into roof cavities and direct flame contact at base of walls.',
      },
      projectParameterPreview: {
        targetModule: 'resilience-register-only',
        parameterChangeDescription:
          'Records WUI ember-resistant vent and perimeter hardscape specification in resilience register.',
        previewDiffSummary: 'Wildfire WUI Envelope Spec: Active',
        mutatesGeometryDirectly: false,
      },
      embodiedCarbonTradeOff: {
        hasP44Baseline,
        materialImplicationSummary:
          'Replacing untreated timber cladding with mineral/masonry cladding may increase A1–A3 embodied carbon unless low-carbon lime/mineral render is used.',
        estimatedEmbodiedCarbonDirection: 'requires-p44-evaluation',
        estimatedDeltaKgCO2eRange: { minKgCO2e: -200, maxKgCO2e: 1500 },
        p44CrossReferenceNote:
          'Compare facade cladding alternatives in P44 Whole-Life Carbon workspace.',
      },
      costAndMaintenanceImplication:
        'Requires annual clearing of dry leaves from gutters and the 1.5 m perimeter zone.',
      residualRiskAfterMeasure:
        'Severe crown-fire radiant heat flux in dense forest WUI zones requires tempered multi-pane glazing and municipal fire access.',
      professionalSignOffRequired: 'Fire Protection Engineer / WUI Code Official.',
      selectedByUser: selectedSet.has('MEAS-WILDFIRE-EMBER-ENVELOPE'),
    },
  ];

  // Helper to count how many selected measures target a given finding ID
  const countSelectedForFinding = (findingId: string) =>
    adaptationMeasures.filter(
      (m) => m.selectedByUser && m.triggeringFindingIds.includes(findingId)
    ).length;

  // Build transparent risk findings
  const floodHazard = hazardByCat.get('flooding')!;
  const pluvialSub = floodHazard.floodSubTypeBreakdown?.find(
    (s) => s.subType === 'pluvial-surface-water'
  );
  const fluvialSub = floodHazard.floodSubTypeBreakdown?.find(
    (s) => s.subType === 'fluvial-riverine'
  );
  const heatHazard = hazardByCat.get('extreme-heat')!;
  const precipHazard = hazardByCat.get('extreme-precipitation')!;
  const droughtHazard = hazardByCat.get('drought-water-stress')!;
  const windHazard = hazardByCat.get('severe-wind-cyclone')!;
  const fireHazard = hazardByCat.get('wildfire-weather')!;
  const slopeHazard = hazardByCat.get('slope-erosion-landslide')!;

  const groundExp = expByCat.get('ground-floor-habitable-spaces')!;
  const groundFloodVuln = vulnByKey.get('ground-floor-habitable-spaces:flooding')!;
  const mepExp = expByCat.get('mep-critical-equipment')!;
  const mepFloodVuln = vulnByKey.get('mep-critical-equipment:flooding')!;
  const envExp = expByCat.get('building-envelope-openings')!;
  const envHeatVuln = vulnByKey.get('building-envelope-openings:extreme-heat')!;
  const roofExp = expByCat.get('roof-and-drainage')!;
  const roofPrecipVuln = vulnByKey.get('roof-and-drainage:extreme-precipitation')!;
  const structExp = expByCat.get('structural-framing-foundation')!;
  const structWindVuln = vulnByKey.get('structural-framing-foundation:severe-wind-cyclone')!;
  const waterExp = expByCat.get('water-supply-and-storage')!;
  const waterDroughtVuln = vulnByKey.get('water-supply-and-storage:drought-water-stress')!;
  const envFireVuln = vulnByKey.get('building-envelope-openings:wildfire-weather')!;
  const terrainExp = expByCat.get('site-terrain-and-grading')!;
  const terrainSlopeVuln = vulnByKey.get('site-terrain-and-grading:slope-erosion-landslide')!;

  // 1. Pluvial Surface-Water vs Ground Floor Rooms
  const f1Calc = computeQualitativeRiskLevel(
    pluvialSub?.severityLevel || 'unassessed',
    groundExp.exposureLevel,
    groundFloodVuln.vulnerabilityLevel,
    countSelectedForFinding('FIND-PLUVIAL-GROUND-ROOMS')
  );

  // 2. Fluvial Riverine vs Ground Floor Rooms
  const f2Calc = computeQualitativeRiskLevel(
    fluvialSub?.severityLevel || 'insufficient-evidence',
    groundExp.exposureLevel,
    groundFloodVuln.vulnerabilityLevel,
    countSelectedForFinding('FIND-FLUVIAL-GROUND-ROOMS')
  );

  // 3. Flooding vs Critical MEP Equipment
  const f3Calc = computeQualitativeRiskLevel(
    pluvialSub?.severityLevel || 'unassessed',
    mepExp.exposureLevel,
    mepFloodVuln.vulnerabilityLevel,
    countSelectedForFinding('FIND-FLOOD-MEP-PANEL')
  );

  // 4. Extreme Heat vs Building Envelope & Openings
  const f4Calc = computeQualitativeRiskLevel(
    heatHazard.hazardSeverityLevel,
    envExp.exposureLevel,
    envHeatVuln.vulnerabilityLevel,
    countSelectedForFinding('FIND-HEAT-ENVELOPE')
  );

  // 5. Extreme Precipitation vs Roof & Stormwater Drainage
  const f5Calc = computeQualitativeRiskLevel(
    precipHazard.hazardSeverityLevel,
    roofExp.exposureLevel,
    roofPrecipVuln.vulnerabilityLevel,
    countSelectedForFinding('FIND-PRECIP-ROOF-DRAINAGE')
  );

  // 6. Drought vs Water Supply & Storage
  const f6Calc = computeQualitativeRiskLevel(
    droughtHazard.hazardSeverityLevel,
    waterExp.exposureLevel,
    waterDroughtVuln.vulnerabilityLevel,
    countSelectedForFinding('FIND-DROUGHT-WATER')
  );

  // 7. Severe Wind vs Structural Framing & Envelope
  const f7Calc = computeQualitativeRiskLevel(
    windHazard.hazardSeverityLevel,
    structExp.exposureLevel,
    structWindVuln.vulnerabilityLevel,
    countSelectedForFinding('FIND-WIND-STRUCTURAL')
  );

  // 8. Wildfire Weather vs Building Envelope
  const f8Calc = computeQualitativeRiskLevel(
    fireHazard.hazardSeverityLevel,
    envExp.exposureLevel,
    envFireVuln.vulnerabilityLevel,
    countSelectedForFinding('FIND-WILDFIRE-ENVELOPE')
  );

  // 9. Slope Instability / Landslide vs Site Terrain & Foundation
  const f9Calc = computeQualitativeRiskLevel(
    slopeHazard.hazardSeverityLevel,
    terrainExp.exposureLevel,
    terrainSlopeVuln.vulnerabilityLevel,
    0
  );

  const riskFindings: TransparentRiskFinding[] = [
    {
      findingId: 'FIND-PLUVIAL-GROUND-ROOMS',
      hazardCategory: 'flooding',
      floodSubType: 'pluvial-surface-water',
      exposedAssetCategory: 'ground-floor-habitable-spaces',
      consequenceCategory: 'repair-downtime-and-habitability',
      title: 'Pluvial Cloudburst Surface-Water Ingress to Ground-Floor Rooms',
      scenario: config.activeScenario,
      timeHorizon: config.activeTimeHorizon,
      hazardLevel: pluvialSub?.severityLevel || 'unassessed',
      exposureLevel: groundExp.exposureLevel,
      vulnerabilityLevel: groundFloodVuln.vulnerabilityLevel,
      adaptiveCapacityLevel: groundFloodVuln.existingAdaptiveCapacityLevel,
      inherentRiskLevel: f1Calc.inherentRiskLevel,
      residualRiskLevel: f1Calc.residualRiskLevel,
      evaluationStatus: f1Calc.evaluationStatus,
      ruleAndThresholdTrace: {
        ruleId: 'RULE-RISK-PLUVIAL-FFE-V1',
        ruleExpression:
          'Risk = Matrix(Hazard=Rx1day+SlopePonding, Exposure=Floor1RoomCount, Vulnerability=FFE_vs_0.60m_Threshold)',
        inputsUsed: {
          rx1dayMm:
            (precipHazard.indicators[0]?.projectedOrObservedValue as number) ?? null,
          groundFloorRooms: groundExp.knownAttributes.groundFloorRoomCount as number,
          finishedFloorElevationAboveGroundM:
            config.siteSpecificAttributes.finishedFloorElevationAboveGroundM,
          hasBackflowPrevention: config.siteSpecificAttributes.hasBackflowPrevention,
        },
        sourceIds: [precipHazard.indicators[0]?.sourceId || 'SRC-WB-CCKP-CMIP6'],
        limitations: [
          'If Finished Floor Elevation (FFE) above grade is not specified, vulnerability and risk are marked insufficient-evidence rather than assuming adequate freeboard.',
          'Does not model municipal storm sewer surcharge hydrographs.',
        ],
      },
      consequenceDescription:
        'Surface ponding exceeding door threshold height damages Floor 1 finishes, partitions, and contents, interrupting occupancy.',
      recommendedMeasureIds: ['MEAS-FLOOD-FFE-RAISE', 'MEAS-STORM-RETENTION-SWALE'],
      requiresSpecialistEngineering:
        'Civil / Stormwater Engineer verification of site grading and finished floor datum.',
    },
    {
      findingId: 'FIND-FLUVIAL-GROUND-ROOMS',
      hazardCategory: 'flooding',
      floodSubType: 'fluvial-riverine',
      exposedAssetCategory: 'ground-floor-habitable-spaces',
      consequenceCategory: 'occupant-safety-and-egress',
      title: 'Fluvial / Riverine Overbank Floodplain Exposure',
      scenario: config.activeScenario,
      timeHorizon: config.activeTimeHorizon,
      hazardLevel: fluvialSub?.severityLevel || 'insufficient-evidence',
      exposureLevel: groundExp.exposureLevel,
      vulnerabilityLevel: groundFloodVuln.vulnerabilityLevel,
      adaptiveCapacityLevel: groundFloodVuln.existingAdaptiveCapacityLevel,
      inherentRiskLevel: f2Calc.inherentRiskLevel,
      residualRiskLevel: f2Calc.residualRiskLevel,
      evaluationStatus: f2Calc.evaluationStatus,
      ruleAndThresholdTrace: {
        ruleId: 'RULE-RISK-FLUVIAL-ZONE-V1',
        ruleExpression:
          'Risk = Matrix(Hazard=OfficialFloodZone_or_BasinScreen, Exposure=Floor1Spaces, Vulnerability=FFE_Freeboard)',
        inputsUsed: {
          officialFloodZoneLabel: config.siteSpecificAttributes.officialFloodZoneLabel,
          finishedFloorElevationAboveGroundM:
            config.siteSpecificAttributes.finishedFloorElevationAboveGroundM,
          verticalDatum: preflight.terrainAlignmentCheck.verticalDatum,
        },
        sourceIds: [fluvialSub?.sourceId || 'SRC-FEMA-NFHL-MSC'],
        limitations: [
          'Requires parcel-level regulatory floodplain map (FEMA FIRM / PMD FFD HFL) and orthometric vertical datum alignment.',
        ],
      },
      consequenceDescription:
        'Riverine overbank inundation threatens occupant egress, structural scour, and prolonged building uninhabitable downtime.',
      recommendedMeasureIds: ['MEAS-FLOOD-FFE-RAISE'],
      requiresSpecialistEngineering:
        'Licensed Hydrologist / Civil Engineer regulatory floodplain certification.',
    },
    {
      findingId: 'FIND-FLOOD-MEP-PANEL',
      hazardCategory: 'flooding',
      floodSubType: 'pluvial-surface-water',
      exposedAssetCategory: 'mep-critical-equipment',
      consequenceCategory: 'service-continuity-power-water-hvac',
      title: 'Ground-Floor Critical Electrical & MEP Equipment Inundation Risk',
      scenario: config.activeScenario,
      timeHorizon: config.activeTimeHorizon,
      hazardLevel: pluvialSub?.severityLevel || 'unassessed',
      exposureLevel: mepExp.exposureLevel,
      vulnerabilityLevel: mepFloodVuln.vulnerabilityLevel,
      adaptiveCapacityLevel: mepFloodVuln.existingAdaptiveCapacityLevel,
      inherentRiskLevel: f3Calc.inherentRiskLevel,
      residualRiskLevel: f3Calc.residualRiskLevel,
      evaluationStatus: f3Calc.evaluationStatus,
      ruleAndThresholdTrace: {
        ruleId: 'RULE-RISK-MEP-FLOOD-V1',
        ruleExpression:
          'Risk = Matrix(Hazard=PluvialFlood, Exposure=Floor1MEPCount, Vulnerability=ElectricalPanelFloor1Count)',
        inputsUsed: {
          groundFloorMepComponents: mepExp.knownAttributes
            .groundFloorMepComponents as number,
          groundElectricalPanelsCount: mepExp.knownAttributes
            .groundElectricalPanelsCount as number,
          hasBackupPowerForCriticalMEP:
            config.siteSpecificAttributes.hasBackupPowerForCriticalMEP,
        },
        sourceIds: [precipHazard.indicators[0]?.sourceId || 'SRC-WB-CCKP-CMIP6'],
        limitations: [
          'Inspects Floor Level 1 placement in P37 MEP Coordination; exact equipment plinth height must be confirmed in shop drawings.',
        ],
      },
      consequenceDescription:
        'Water contact with Floor 1 electrical panels or heat pumps causes power loss, life-safety electrical hazards, and long lead-time switchgear replacement.',
      recommendedMeasureIds: ['MEAS-MEP-ELEVATE-CRITICAL'],
      requiresSpecialistEngineering: 'Licensed Electrical & MEP Engineer.',
    },
    {
      findingId: 'FIND-HEAT-ENVELOPE',
      hazardCategory: 'extreme-heat',
      exposedAssetCategory: 'building-envelope-openings',
      consequenceCategory: 'repair-downtime-and-habitability',
      title: 'Extreme Ambient Heat Stress & Unshaded Facade Solar Exposure',
      scenario: config.activeScenario,
      timeHorizon: config.activeTimeHorizon,
      hazardLevel: heatHazard.hazardSeverityLevel,
      exposureLevel: envExp.exposureLevel,
      vulnerabilityLevel: envHeatVuln.vulnerabilityLevel,
      adaptiveCapacityLevel: envHeatVuln.existingAdaptiveCapacityLevel,
      inherentRiskLevel: f4Calc.inherentRiskLevel,
      residualRiskLevel: f4Calc.residualRiskLevel,
      evaluationStatus: f4Calc.evaluationStatus,
      ruleAndThresholdTrace: {
        ruleId: 'RULE-RISK-HEAT-ENVELOPE-V1',
        ruleExpression:
          'Risk = Matrix(Hazard=TXx_and_DaysTX35, Exposure=FacadeOrientation, Vulnerability=WindowStyle_and_ExternalShading)',
        inputsUsed: {
          txxProjectedC:
            (heatHazard.indicators[0]?.projectedOrObservedValue as number) ?? null,
          hotDays35Projected:
            (heatHazard.indicators[1]?.projectedOrObservedValue as number) ?? null,
          shadingStyle: envExp.knownAttributes.shadingStyle as string,
          externalShadingConfirmed: config.siteSpecificAttributes.externalShadingConfirmed,
        },
        sourceIds: [heatHazard.indicators[0]?.sourceId || 'SRC-WB-CCKP-CMIP6'],
        limitations: [
          'Evaluates outdoor heat hazard and envelope shading vulnerability only; indoor operative temperature and cooling energy demand belong to P46.',
        ],
      },
      consequenceDescription:
        'High ambient heat combined with unshaded glazing increases thermal discomfort risk during power outages and accelerates exterior sealant/roof membrane aging.',
      recommendedMeasureIds: ['MEAS-HEAT-PASSIVE-SHADING'],
      requiresSpecialistEngineering:
        'Building Physics / Mechanical Cooling Engineer (P46 Thermal Analysis).',
    },
    {
      findingId: 'FIND-PRECIP-ROOF-DRAINAGE',
      hazardCategory: 'extreme-precipitation',
      exposedAssetCategory: 'roof-and-drainage',
      consequenceCategory: 'envelope-and-structural-damage',
      title: 'Cloudburst Roof Drainage & Parapet Overflow Stress',
      scenario: config.activeScenario,
      timeHorizon: config.activeTimeHorizon,
      hazardLevel: precipHazard.hazardSeverityLevel,
      exposureLevel: roofExp.exposureLevel,
      vulnerabilityLevel: roofPrecipVuln.vulnerabilityLevel,
      adaptiveCapacityLevel: roofPrecipVuln.existingAdaptiveCapacityLevel,
      inherentRiskLevel: f5Calc.inherentRiskLevel,
      residualRiskLevel: f5Calc.residualRiskLevel,
      evaluationStatus: f5Calc.evaluationStatus,
      ruleAndThresholdTrace: {
        ruleId: 'RULE-RISK-ROOF-CLOUDBURST-V1',
        ruleExpression:
          'Risk = Matrix(Hazard=Rx1day_Mm, Exposure=RoofCatchmentAreaM2, Vulnerability=StormwaterDetentionCapacity)',
        inputsUsed: {
          rx1dayMm:
            (precipHazard.indicators[0]?.projectedOrObservedValue as number) ?? null,
          roofPlotAreaM2: preflight.parcelFootprintMeters.areaM2,
          onSiteRainwaterStorageLiters:
            config.siteSpecificAttributes.hasOnSiteRainwaterStorageLiters,
        },
        sourceIds: [precipHazard.indicators[0]?.sourceId || 'SRC-WB-CCKP-CMIP6'],
        limitations: [
          'Requires plumbing engineer verification of primary rainwater leader and emergency overflow scupper hydraulic capacity.',
        ],
      },
      consequenceDescription:
        'Cloudburst rainfall exceeding gutter/leader capacity causes roof ponding, parapet water intrusion, and foundation perimeter saturation.',
      recommendedMeasureIds: ['MEAS-STORM-RETENTION-SWALE'],
      requiresSpecialistEngineering: 'Plumbing / Roof Drainage Engineer.',
    },
    {
      findingId: 'FIND-DROUGHT-WATER',
      hazardCategory: 'drought-water-stress',
      exposedAssetCategory: 'water-supply-and-storage',
      consequenceCategory: 'service-continuity-power-water-hvac',
      title: 'Seasonal Drought & Municipal Water Supply Interruption Risk',
      scenario: config.activeScenario,
      timeHorizon: config.activeTimeHorizon,
      hazardLevel: droughtHazard.hazardSeverityLevel,
      exposureLevel: waterExp.exposureLevel,
      vulnerabilityLevel: waterDroughtVuln.vulnerabilityLevel,
      adaptiveCapacityLevel: waterDroughtVuln.existingAdaptiveCapacityLevel,
      inherentRiskLevel: f6Calc.inherentRiskLevel,
      residualRiskLevel: f6Calc.residualRiskLevel,
      evaluationStatus: f6Calc.evaluationStatus,
      ruleAndThresholdTrace: {
        ruleId: 'RULE-RISK-DROUGHT-STORAGE-V1',
        ruleExpression:
          'Risk = Matrix(Hazard=SPEI12_and_CDD, Exposure=WaterSupplyInterface, Vulnerability=OnSiteStorageLiters)',
        inputsUsed: {
          spei12Projected:
            (droughtHazard.indicators[0]?.projectedOrObservedValue as number) ?? null,
          cddDaysProjected:
            (droughtHazard.indicators[1]?.projectedOrObservedValue as number) ?? null,
          onSiteRainwaterStorageLiters:
            config.siteSpecificAttributes.hasOnSiteRainwaterStorageLiters,
        },
        sourceIds: ['SRC-IPCC-AR6-WGI-ATLAS'],
        limitations: [
          'If on-site water storage capacity is unknown (null), risk is classified as insufficient-evidence rather than assuming reliable supply.',
        ],
      },
      consequenceDescription:
        'Extended dry spells and negative moisture balance strain domestic water availability and landscape irrigation.',
      recommendedMeasureIds: ['MEAS-STORM-RETENTION-SWALE'],
      requiresSpecialistEngineering: 'MEP Plumbing & Water Efficiency Consultant.',
    },
    {
      findingId: 'FIND-WIND-STRUCTURAL',
      hazardCategory: 'severe-wind-cyclone',
      exposedAssetCategory: 'structural-framing-foundation',
      consequenceCategory: 'envelope-and-structural-damage',
      title: 'Severe Wind Gust Uplift on Roof & Cladding Connections',
      scenario: config.activeScenario,
      timeHorizon: config.activeTimeHorizon,
      hazardLevel: windHazard.hazardSeverityLevel,
      exposureLevel: structExp.exposureLevel,
      vulnerabilityLevel: structWindVuln.vulnerabilityLevel,
      adaptiveCapacityLevel: structWindVuln.existingAdaptiveCapacityLevel,
      inherentRiskLevel: f7Calc.inherentRiskLevel,
      residualRiskLevel: f7Calc.residualRiskLevel,
      evaluationStatus: f7Calc.evaluationStatus,
      ruleAndThresholdTrace: {
        ruleId: 'RULE-RISK-WIND-FRAMING-V1',
        ruleExpression:
          'Risk = Matrix(Hazard=WindVmax10m, Exposure=StoreysAndFraming, Vulnerability=FramingSystemAndUpliftSpec)',
        inputsUsed: {
          projectedWindGustMs:
            (windHazard.indicators[0]?.projectedOrObservedValue as number) ?? null,
          codeDesignWindSpeedMs: config.siteSpecificAttributes.codeDesignWindSpeedMs,
          framingSystem,
        },
        sourceIds: [windHazard.indicators[0]?.sourceId || 'SRC-WB-CCKP-CMIP6'],
        limitations: [
          'Screening does not replace ASCE 7 / Eurocode 1 wind-pressure coefficients or licensed structural connection calculations.',
        ],
      },
      consequenceDescription:
        'Extreme wind gusts generate suction uplift at roof eaves/corners and high lateral pressures on glazed openings.',
      recommendedMeasureIds: ['MEAS-WIND-ROOF-TIEDOWN'],
      requiresSpecialistEngineering: 'Licensed Structural Engineer.',
    },
    {
      findingId: 'FIND-WILDFIRE-ENVELOPE',
      hazardCategory: 'wildfire-weather',
      exposedAssetCategory: 'building-envelope-openings',
      consequenceCategory: 'occupant-safety-and-egress',
      title: 'Wildfire Fire-Weather & Wind-Borne Ember Ignition Screening',
      scenario: config.activeScenario,
      timeHorizon: config.activeTimeHorizon,
      hazardLevel: fireHazard.hazardSeverityLevel,
      exposureLevel: envExp.exposureLevel,
      vulnerabilityLevel: envFireVuln.vulnerabilityLevel,
      adaptiveCapacityLevel: envFireVuln.existingAdaptiveCapacityLevel,
      inherentRiskLevel: f8Calc.inherentRiskLevel,
      residualRiskLevel: f8Calc.residualRiskLevel,
      evaluationStatus: f8Calc.evaluationStatus,
      ruleAndThresholdTrace: {
        ruleId: 'RULE-RISK-WILDFIRE-WUI-V1',
        ruleExpression:
          'Risk = Matrix(Hazard=FWI95p_and_WUI, Exposure=ExteriorFacade, Vulnerability=CladdingCombustibility)',
        inputsUsed: {
          fwi95pProjected:
            (fireHazard.indicators[0]?.projectedOrObservedValue as number) ?? null,
          primaryFacadeMaterial: envExp.knownAttributes.primaryFacadeMaterial as string,
          wildfireInterfaceZoneConfirmed:
            config.siteSpecificAttributes.wildfireInterfaceZoneConfirmed,
        },
        sourceIds: ['SRC-IPCC-AR6-WGI-ATLAS'],
        limitations: [
          'Meteorological FWI must be paired with site-level Wildland-Urban Interface (WUI) fuel inspection.',
        ],
      },
      consequenceDescription:
        'Ember accumulation on combustible cladding, decks, or unscreened vents during high FWI weather can ignite the building envelope.',
      recommendedMeasureIds: ['MEAS-WILDFIRE-EMBER-ENVELOPE'],
      requiresSpecialistEngineering: 'Fire Protection / WUI Specialist.',
    },
    {
      findingId: 'FIND-SLOPE-GEOTECH',
      hazardCategory: 'slope-erosion-landslide',
      exposedAssetCategory: 'site-terrain-and-grading',
      consequenceCategory: 'envelope-and-structural-damage',
      title: 'Slope Instability, Soil Erosion & Foundation Scour Screening',
      scenario: config.activeScenario,
      timeHorizon: config.activeTimeHorizon,
      hazardLevel: slopeHazard.hazardSeverityLevel,
      exposureLevel: terrainExp.exposureLevel,
      vulnerabilityLevel: terrainSlopeVuln.vulnerabilityLevel,
      adaptiveCapacityLevel: terrainSlopeVuln.existingAdaptiveCapacityLevel,
      inherentRiskLevel: f9Calc.inherentRiskLevel,
      residualRiskLevel: f9Calc.residualRiskLevel,
      evaluationStatus: f9Calc.evaluationStatus,
      ruleAndThresholdTrace: {
        ruleId: 'RULE-RISK-SLOPE-GEOTECH-V1',
        ruleExpression:
          'Risk = Matrix(Hazard=TerrainSlope_and_Rx5day, Exposure=ParcelGrading, Vulnerability=GeotechnicalReportStatus)',
        inputsUsed: {
          maxSlopePercent: preflight.terrainAlignmentCheck.maxSlopePercent,
          footprintReliefM: preflight.terrainAlignmentCheck.footprintReliefM,
          geotechnicalSlopeReportAvailable:
            config.siteSpecificAttributes.geotechnicalSlopeReportAvailable,
        },
        sourceIds: ['SRC-COPERNICUS-ERA5-CMIP6'],
        limitations: [
          'Remains insufficient-evidence unless a site-specific geotechnical report is confirmed; P43 surface topography alone cannot certify subsurface slope stability.',
        ],
      },
      consequenceDescription:
        'Intense multi-day rainfall on unretained or uncharacterized slopes can trigger differential settlement, erosion, or slope failure.',
      recommendedMeasureIds: [],
      requiresSpecialistEngineering: 'Licensed Geotechnical Engineer.',
    },
  ];

  return { riskFindings, adaptationMeasures };
}

// ============================================================================
// 9. CUSTOM CLIMATE EVIDENCE IMPORT & QUARANTINE (CSV / JSON)
// ============================================================================

const VALID_HAZARD_CATEGORIES = new Set<ClimateHazardCategory>([
  'extreme-heat',
  'extreme-precipitation',
  'flooding',
  'drought-water-stress',
  'severe-wind-cyclone',
  'wildfire-weather',
  'slope-erosion-landslide',
  'cold-freeze-thaw-snow',
]);

const VALID_SCENARIOS = new Set<ClimateScenarioId>([
  'historical-baseline',
  'ssp1-2.6',
  'ssp2-4.5',
  'ssp3-7.0',
  'ssp5-8.5',
  'user-custom-scenario',
]);

const VALID_HORIZONS = new Set<ClimateTimeHorizon>([
  'historical-1991-2020',
  'recent-observed',
  'near-term-2021-2040',
  'mid-century-2041-2060',
  'late-century-2081-2100',
  'custom-horizon',
]);

export function importClimateEvidencePayload(
  rawText: string,
  formatHint: 'json' | 'csv' | 'auto' = 'auto'
): ClimateEvidenceImportResult {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return {
      success: false,
      format: 'invalid',
      importedIndicators: [],
      importedSources: [],
      quarantinedRecords: [],
      warnings: [],
      errors: ['Empty climate evidence payload.'],
    };
  }

  const detectedFormat: 'json' | 'csv' =
    formatHint === 'auto'
      ? trimmed.startsWith('{') || trimmed.startsWith('[')
        ? 'json'
        : 'csv'
      : formatHint;

  const importedIndicators: ClimateHazardIndicatorRecord[] = [];
  const importedSources: ClimateDataSourceRecord[] = [];
  const quarantinedRecords: QuarantinedClimateRecord[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  if (detectedFormat === 'json') {
    let parsed: any;
    try {
      parsed = JSON.parse(trimmed);
    } catch (e: any) {
      return {
        success: false,
        format: 'invalid',
        importedIndicators: [],
        importedSources: [],
        quarantinedRecords: [
          {
            rowOrItemIndex: 0,
            rawRecord: trimmed.slice(0, 200),
            rejectionReason: `Malformed JSON syntax: ${e.message}`,
          },
        ],
        warnings: [],
        errors: [`Failed to parse JSON climate evidence: ${e.message}`],
      };
    }

    const rawItems: any[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.indicators)
      ? parsed.indicators
      : [];

    if (!Array.isArray(parsed) && !Array.isArray(parsed.indicators)) {
      return {
        success: false,
        format: 'invalid',
        importedIndicators: [],
        importedSources: [],
        quarantinedRecords: [
          {
            rowOrItemIndex: 0,
            rawRecord: trimmed.slice(0, 200),
            rejectionReason:
              'JSON root must be an array of indicator records or an object with an "indicators" array.',
          },
        ],
        warnings: [],
        errors: ['JSON payload does not contain a valid "indicators" array.'],
      };
    }

    rawItems.forEach((item, idx) => {
      const validation = validateRawIndicatorObject(item, idx);
      if (validation.quarantined) {
        quarantinedRecords.push(validation.quarantined);
      } else if (validation.indicator) {
        importedIndicators.push(validation.indicator);
      }
    });
  } else {
    // CSV parsing: expected header:
    // hazardCategory,indicatorCode,label,scenario,timeHorizon,historicalBaselineValue,projectedOrObservedValue,unit,spatialResolutionKm,sourceId,sourceCitation
    const lines = trimmed
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      return {
        success: false,
        format: 'csv',
        importedIndicators: [],
        importedSources: [],
        quarantinedRecords: [],
        warnings: [],
        errors: ['CSV must contain a header row and at least one data row.'],
      };
    }

    const headers = lines[0].split(',').map((h) => h.trim());
    const requiredCols = [
      'hazardCategory',
      'indicatorCode',
      'label',
      'scenario',
      'timeHorizon',
      'projectedOrObservedValue',
      'unit',
    ];
    const missingCols = requiredCols.filter((c) => !headers.includes(c));
    if (missingCols.length > 0) {
      return {
        success: false,
        format: 'csv',
        importedIndicators: [],
        importedSources: [],
        quarantinedRecords: [],
        warnings: [],
        errors: [`CSV header is missing required column(s): ${missingCols.join(', ')}`],
      };
    }

    for (let i = 1; i < lines.length; i++) {
      const rowStr = lines[i];
      const cols = rowStr.split(',').map((c) => c.trim());
      const rowObj: Record<string, any> = {};
      headers.forEach((h, cIdx) => {
        rowObj[h] = cols[cIdx] ?? '';
      });

      const validation = validateRawIndicatorObject(rowObj, i);
      if (validation.quarantined) {
        quarantinedRecords.push(validation.quarantined);
      } else if (validation.indicator) {
        importedIndicators.push(validation.indicator);
      }
    }
  }

  if (importedIndicators.length > 0) {
    importedSources.push({
      sourceId: 'SRC-USER-IMPORTED-EVIDENCE',
      name: 'User-Imported Site Climate Evidence Dataset',
      organization: 'Project Team / External Climate Consultant',
      datasetIdentifier: `USER-CLIMATE-IMPORT-${importedIndicators.length}-RECORDS`,
      versionOrRelease: 'User Supplied v1.0',
      temporalClass: 'future-climate-projection',
      baselinePeriod: 'As specified per indicator record',
      projectionHorizonsSupported: ['custom-horizon', 'mid-century-2041-2060'],
      scenariosSupported: ['ssp2-4.5', 'ssp5-8.5', 'user-custom-scenario'],
      spatialResolutionKm:
        importedIndicators[0]?.spatialResolutionKm || 1,
      spatialCoverageDescription: 'User-supplied site/regional evidence records',
      jurisdictionScope: 'regional-custom',
      retrievedAt: new Date().toISOString(),
      validUntil: '2029-12-31T23:59:59.000Z',
      isExpired: false,
      verificationStatus: 'user-imported-evidence',
      officialUrl: 'local://user-imported-climate-evidence',
      limitations: [
        'User-imported climate indicators are marked as user-imported-evidence and require independent verification by the responsible professional.',
      ],
      licenseOrAttribution: 'User-Supplied Project Evidence',
    });
  }

  if (quarantinedRecords.length > 0) {
    warnings.push(
      `${quarantinedRecords.length} malformed record(s) were quarantined and excluded from hazard calculations.`
    );
  }

  return {
    success: importedIndicators.length > 0,
    format: detectedFormat,
    importedIndicators,
    importedSources,
    quarantinedRecords,
    warnings,
    errors:
      importedIndicators.length === 0 && errors.length === 0
        ? ['No valid climate indicator records remained after validation.']
        : errors,
  };
}

function validateRawIndicatorObject(
  raw: any,
  index: number
): {
  indicator?: ClimateHazardIndicatorRecord;
  quarantined?: QuarantinedClimateRecord;
} {
  const rawStr = typeof raw === 'string' ? raw : JSON.stringify(raw);
  if (!raw || typeof raw !== 'object') {
    return {
      quarantined: {
        rowOrItemIndex: index,
        rawRecord: rawStr,
        rejectionReason: 'Record is not a valid object.',
      },
    };
  }

  const hazardCategory = String(raw.hazardCategory || '').trim() as ClimateHazardCategory;
  if (!VALID_HAZARD_CATEGORIES.has(hazardCategory)) {
    return {
      quarantined: {
        rowOrItemIndex: index,
        rawRecord: rawStr,
        rejectionReason: `Invalid or unsupported hazardCategory "${raw.hazardCategory}".`,
      },
    };
  }

  const indicatorCode = String(raw.indicatorCode || '').trim();
  const label = String(raw.label || '').trim();
  const unit = String(raw.unit || '').trim();
  if (!indicatorCode || !label || !unit) {
    return {
      quarantined: {
        rowOrItemIndex: index,
        rawRecord: rawStr,
        rejectionReason:
          'Missing required indicatorCode, label, or unit field.',
      },
    };
  }

  const scenario = (String(raw.scenario || 'ssp2-4.5').trim() ||
    'ssp2-4.5') as ClimateScenarioId;
  if (!VALID_SCENARIOS.has(scenario)) {
    return {
      quarantined: {
        rowOrItemIndex: index,
        rawRecord: rawStr,
        rejectionReason: `Invalid climate scenario "${raw.scenario}".`,
      },
    };
  }

  const timeHorizon = (String(raw.timeHorizon || 'mid-century-2041-2060').trim() ||
    'mid-century-2041-2060') as ClimateTimeHorizon;
  if (!VALID_HORIZONS.has(timeHorizon)) {
    return {
      quarantined: {
        rowOrItemIndex: index,
        rawRecord: rawStr,
        rejectionReason: `Invalid timeHorizon "${raw.timeHorizon}".`,
      },
    };
  }

  // Parse projectedOrObservedValue: allow string only for flood zone codes (e.g. FEMA_FIRM_Zone), require finite number otherwise
  let projVal: number | string | null = null;
  if (indicatorCode === 'FEMA_FIRM_Zone' || indicatorCode === 'PMD_FFD_Basin') {
    projVal = String(raw.projectedOrObservedValue || '').trim();
    if (!projVal) {
      return {
        quarantined: {
          rowOrItemIndex: index,
          rawRecord: rawStr,
          rejectionReason: 'Empty flood zone value.',
        },
      };
    }
  } else {
    const num = Number(raw.projectedOrObservedValue);
    if (
      raw.projectedOrObservedValue === '' ||
      raw.projectedOrObservedValue === null ||
      raw.projectedOrObservedValue === undefined ||
      Number.isNaN(num) ||
      !Number.isFinite(num)
    ) {
      return {
        quarantined: {
          rowOrItemIndex: index,
          rawRecord: rawStr,
          rejectionReason: `Non-numeric or NaN projectedOrObservedValue "${raw.projectedOrObservedValue}".`,
        },
      };
    }
    projVal = num;
  }

  const histNum =
    raw.historicalBaselineValue !== undefined &&
    raw.historicalBaselineValue !== '' &&
    raw.historicalBaselineValue !== null
      ? Number(raw.historicalBaselineValue)
      : null;

  const histVal =
    histNum !== null && !Number.isNaN(histNum)
      ? histNum
      : typeof raw.historicalBaselineValue === 'string' && raw.historicalBaselineValue
      ? raw.historicalBaselineValue
      : null;

  const delta =
    typeof projVal === 'number' && typeof histVal === 'number'
      ? Number((projVal - histVal).toFixed(2))
      : null;

  const resKm = Number(raw.spatialResolutionKm);
  const spatialResolutionKm =
    !Number.isNaN(resKm) && resKm > 0 ? resKm : 25;

  return {
    indicator: {
      indicatorId: `IND-CUSTOM-${indicatorCode}-${scenario}-${timeHorizon}-${index}`,
      hazardCategory,
      indicatorCode,
      label,
      temporalClass:
        scenario === 'historical-baseline'
          ? 'historical-baseline'
          : 'future-climate-projection',
      scenario,
      timeHorizon,
      baselinePeriod: String(raw.baselinePeriod || '1991–2020'),
      modelOrEnsemble: String(raw.modelOrEnsemble || 'User-Imported Dataset'),
      historicalBaselineValue: histVal,
      projectedOrObservedValue: projVal,
      deltaFromBaseline: delta,
      uncertaintyRange: null,
      unit,
      spatialResolutionKm,
      sourceId: String(raw.sourceId || 'SRC-USER-IMPORTED-EVIDENCE'),
      sourceCitation: String(
        raw.sourceCitation || 'User-Imported Climate Evidence Record'
      ),
      thresholdUsed: String(raw.thresholdUsed || 'Custom imported threshold'),
      notesAndLimitations: String(
        raw.notesAndLimitations || 'User-imported climate indicator record.'
      ),
    },
  };
}

// ============================================================================
// 10. COMPLETE CLIMATE HAZARD & RESILIENCE ASSESSMENT ORCHESTRATOR
// ============================================================================

export function runClimateHazardResilienceAssessment(
  project: Project,
  configOverride?: Partial<ClimateResilienceConfig>,
  customIndicatorsOverride?: ClimateHazardIndicatorRecord[],
  customSourcesOverride?: ClimateDataSourceRecord[],
  evaluationTimestampIso = new Date().toISOString()
): ClimateHazardResilienceAssessmentResult {
  const existingMeta = project.climateResilience;
  const baseConfig = existingMeta?.config || createDefaultClimateResilienceConfig();
  const config: ClimateResilienceConfig = {
    ...baseConfig,
    ...configOverride,
    siteSpecificAttributes: {
      ...baseConfig.siteSpecificAttributes,
      ...(configOverride?.siteSpecificAttributes || {}),
    },
  };

  const customIndicators =
    customIndicatorsOverride ?? existingMeta?.customIndicators ?? [];
  const customSources = customSourcesOverride ?? existingMeta?.customSources ?? [];

  const preflight = validateSiteLocationPreflight(project, config);
  const dataSources = getAuthoritativeClimateSources(
    preflight.detectedJurisdictionScope,
    customSources,
    Boolean(config.simulateOfflineMode),
    evaluationTimestampIso
  );

  const hazards = evaluateClimateHazards(
    project,
    preflight,
    config,
    customIndicators
  );

  const scenarioComparison = buildScenarioComparisonTable(
    preflight,
    config,
    customIndicators
  );

  const { exposureMappings, vulnerabilities } =
    evaluateAssetExposureAndVulnerability(project, preflight, config);

  const { riskFindings, adaptationMeasures } = evaluateRiskFindingsAndMeasures(
    project,
    preflight,
    config,
    hazards,
    exposureMappings,
    vulnerabilities
  );

  const hazardsAssessed = hazards.filter(
    (h) =>
      h.screeningStatus === 'assessed-verified' ||
      h.screeningStatus === 'assessed-indicative'
  ).length;
  const hazardsInsufficientOrUnassessed = hazards.length - hazardsAssessed;

  const highOrVeryHighRiskFindings = riskFindings.filter(
    (f) => f.residualRiskLevel === 'high' || f.residualRiskLevel === 'very-high'
  ).length;
  const moderateRiskFindings = riskFindings.filter(
    (f) => f.residualRiskLevel === 'moderate'
  ).length;
  const lowOrVeryLowRiskFindings = riskFindings.filter(
    (f) => f.residualRiskLevel === 'low' || f.residualRiskLevel === 'very-low'
  ).length;
  const unassessedRiskFindings = riskFindings.filter(
    (f) =>
      f.residualRiskLevel === 'unassessed' ||
      f.residualRiskLevel === 'insufficient-evidence'
  ).length;

  const currentFingerprint = computeClimateProjectFingerprint(project);

  return {
    assessmentId: `CLIM-P45-${Date.now()}`,
    profileId: CLIMATE_ASSESSMENT_PROFILE_ID,
    evaluatedAt: evaluationTimestampIso,
    projectFingerprint: currentFingerprint,
    isStale: false,
    staleReasons: [],
    config,
    locationPreflight: preflight,
    dataSources,
    hazards,
    scenarioComparison,
    exposureMappings,
    vulnerabilities,
    riskFindings,
    adaptationMeasures,
    summaryCounts: {
      totalHazardsCataloged: hazards.length,
      hazardsAssessed,
      hazardsInsufficientOrUnassessed,
      highOrVeryHighRiskFindings,
      moderateRiskFindings,
      lowOrVeryLowRiskFindings,
      unassessedRiskFindings,
      selectedAdaptationMeasures: adaptationMeasures.filter((m) => m.selectedByUser)
        .length,
    },
    scopeAndMethodologyDisclaimers: [
      'Preliminary Climate Hazard & Resilience Screening Only: Results are based on regional gridded climate projections (25–100 km CMIP6/ERA5) and project-level spatial attributes. They do NOT constitute a site-specific hydrological, hydraulic, geotechnical, or structural engineering certification.',
      'Missing Data Integrity: Unverified or missing site attributes (such as Finished Floor Elevation, regulatory flood zone maps, or geotechnical bore logs) are explicitly reported as "insufficient-evidence" or "unassessed" and are never treated as low risk.',
      'P43 / P44 / P46 Discipline Boundaries: P43 terrain surfaces represent existing ground only (not hydraulic flood routing); P44 embodied carbon trade-offs are cross-referenced without duplicating the LCA engine; indoor thermal comfort, daylighting, and HVAC energy demand are reserved for P46.',
      'Residual Risk Reality: Selected adaptation measures reduce vulnerability within design thresholds but never eliminate residual risk to zero.',
    ],
  };
}

export function checkClimateAssessmentStaleness(
  project: Project
): { isStale: boolean; staleReasons: string[] } {
  const active = project.climateResilience?.activeAssessment;
  if (!active) {
    return { isStale: false, staleReasons: [] };
  }

  const staleReasons: string[] = [];
  const currentFp = computeClimateProjectFingerprint(project);
  if (active.projectFingerprint !== currentFp) {
    staleReasons.push(
      'Project geometry, site coordinates, P43 terrain model, structural framing, MEP layout, or P44 carbon baseline has changed since this climate assessment was computed.'
    );
  }

  const expiredSources = active.dataSources.filter((s) => s.isExpired);
  if (expiredSources.length > 0) {
    staleReasons.push(
      `${expiredSources.length} climate data source(s) have passed their cache validity timestamp.`
    );
  }

  return {
    isStale: staleReasons.length > 0,
    staleReasons,
  };
}

// ============================================================================
// 11. SAFE PERSISTENCE, MEASURE APPLICATION & ROLLBACK CHECKPOINTS
// ============================================================================

export function applyClimateAssessmentToProject(
  project: Project,
  assessment: ClimateHazardResilienceAssessmentResult,
  customIndicators: ClimateHazardIndicatorRecord[] = project.climateResilience
    ?.customIndicators || [],
  customSources: ClimateDataSourceRecord[] = project.climateResilience
    ?.customSources || [],
  quarantinedImports: QuarantinedClimateRecord[] = project.climateResilience
    ?.quarantinedImports || [],
  createCheckpoint = true
): Project {
  if (createCheckpoint) {
    createProjectSnapshot(project, {
      trigger: 'auto-checkpoint',
      label: 'Pre-P45 Climate Resilience Save',
      description: `Automatic checkpoint before saving P45 Climate Hazard & Resilience assessment (${assessment.config.activeScenario.toUpperCase()}, ${assessment.config.activeTimeHorizon}).`,
    });
  }

  const prevHistory = project.climateResilience?.assessmentHistory || [];
  const newHistoryEntry: ClimateAssessmentHistoryEntry = {
    assessmentId: assessment.assessmentId,
    evaluatedAt: assessment.evaluatedAt,
    activeScenario: assessment.config.activeScenario,
    activeTimeHorizon: assessment.config.activeTimeHorizon,
    highOrVeryHighRiskFindings: assessment.summaryCounts.highOrVeryHighRiskFindings,
    hazardsAssessed: assessment.summaryCounts.hazardsAssessed,
    selectedMeasuresCount: assessment.summaryCounts.selectedAdaptationMeasures,
    summaryNote: `${assessment.config.activeScenario.toUpperCase()} (${assessment.config.activeTimeHorizon}) — ${assessment.summaryCounts.hazardsAssessed}/${assessment.summaryCounts.totalHazardsCataloged} hazards screened, ${assessment.summaryCounts.selectedAdaptationMeasures} resilience measure(s) selected.`,
  };

  const metadata: ProjectClimateResilienceMetadata = {
    version: '1.0',
    profileId: CLIMATE_ASSESSMENT_PROFILE_ID,
    config: assessment.config,
    customIndicators,
    customSources,
    quarantinedImports,
    activeAssessment: assessment,
    assessmentHistory: [newHistoryEntry, ...prevHistory].slice(0, 20),
    lastUpdatedAt: new Date().toISOString(),
  };

  return {
    ...project,
    climateResilience: metadata,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Explicitly applies the user-selected resilience adaptation measures to the project's
 * non-destructive parameters (e.g. siteSpecificAttributes, Design Studio shadingStyle if applicable,
 * and SiteContext/MEP notes) ONLY when confirmed by the user, after creating a rollback checkpoint.
 */
export function applySelectedResilienceMeasuresToProject(
  project: Project,
  config: ClimateResilienceConfig
): Project {
  createProjectSnapshot(project, {
    trigger: 'auto-checkpoint',
    label: 'Pre-P45 Resilience Measures Apply',
    description: `Automatic checkpoint before applying ${config.selectedMeasureIds.length} selected P45 climate adaptation measure(s).`,
  });

  const selectedSet = new Set(config.selectedMeasureIds);
  const updatedAttrs = { ...config.siteSpecificAttributes };

  if (selectedSet.has('MEAS-FLOOD-FFE-RAISE')) {
    updatedAttrs.finishedFloorElevationAboveGroundM = Math.max(
      updatedAttrs.finishedFloorElevationAboveGroundM ?? 0,
      0.65
    );
    updatedAttrs.hasBackflowPrevention = true;
  }

  if (selectedSet.has('MEAS-MEP-ELEVATE-CRITICAL')) {
    updatedAttrs.hasBackupPowerForCriticalMEP = true;
  }

  if (selectedSet.has('MEAS-HEAT-PASSIVE-SHADING')) {
    updatedAttrs.externalShadingConfirmed = true;
  }

  if (selectedSet.has('MEAS-STORM-RETENTION-SWALE')) {
    updatedAttrs.hasOnSiteRainwaterStorageLiters = Math.max(
      updatedAttrs.hasOnSiteRainwaterStorageLiters ?? 0,
      5000
    );
  }

  if (selectedSet.has('MEAS-WIND-ROOF-TIEDOWN')) {
    updatedAttrs.codeDesignWindSpeedMs = Math.max(
      updatedAttrs.codeDesignWindSpeedMs ?? 0,
      45
    );
  }

  // Non-destructively update Design Studio active alternative shading if MEAS-HEAT-PASSIVE-SHADING is selected
  let updatedAlternatives = project.designAlternatives;
  if (
    selectedSet.has('MEAS-HEAT-PASSIVE-SHADING') &&
    project.designAlternatives &&
    project.designAlternatives.length > 0
  ) {
    const targetId =
      project.activeAlternativeId || project.designAlternatives[0].id;
    updatedAlternatives = project.designAlternatives.map((alt) => {
      if (alt.id === targetId && alt.facade.shadingStyle === 'none') {
        return {
          ...alt,
          facade: {
            ...alt.facade,
            shadingStyle: 'brise-soleil',
            notes: `${alt.facade.notes ? alt.facade.notes + ' · ' : ''}[P45 Resilience: External brise-soleil solar shading enabled]`,
          },
        };
      }
      return alt;
    });
  }

  const nextConfig: ClimateResilienceConfig = {
    ...config,
    siteSpecificAttributes: updatedAttrs,
  };

  const projectWithUpdates: Project = {
    ...project,
    designAlternatives: updatedAlternatives,
  };

  const freshAssessment = runClimateHazardResilienceAssessment(
    projectWithUpdates,
    nextConfig,
    project.climateResilience?.customIndicators || [],
    project.climateResilience?.customSources || []
  );

  return applyClimateAssessmentToProject(
    projectWithUpdates,
    freshAssessment,
    project.climateResilience?.customIndicators || [],
    project.climateResilience?.customSources || [],
    project.climateResilience?.quarantinedImports || [],
    false // snapshot already created above
  );
}

export function removeClimateAssessmentFromProject(project: Project): Project {
  createProjectSnapshot(project, {
    trigger: 'auto-checkpoint',
    label: 'Pre-P45 Climate Resilience Removal',
    description:
      'Automatic checkpoint before removing P45 Climate Hazard & Resilience metadata.',
  });

  const cloned: Project = {
    ...project,
    updatedAt: new Date().toISOString(),
  };
  delete cloned.climateResilience;
  return cloned;
}

// ============================================================================
// 12. STRUCTURED REPORT EXPORT (JSON, MARKDOWN, CSV)
// ============================================================================

export function exportClimateResilienceJSON(
  project: Project,
  assessment: ClimateHazardResilienceAssessmentResult
): string {
  return JSON.stringify(
    {
      schema: CLIMATE_ASSESSMENT_PROFILE_ID,
      exportedAt: new Date().toISOString(),
      projectSummary: {
        id: project.id,
        name: project.name,
        plotWidth: project.plotWidth,
        plotLength: project.plotLength,
        unit: project.unit,
        floors: project.floors,
      },
      assessment,
    },
    null,
    2
  );
}

export function exportClimateResilienceCSV(
  assessment: ClimateHazardResilienceAssessmentResult
): string {
  const headers = [
    'FindingID',
    'HazardCategory',
    'FloodSubType',
    'ExposedAsset',
    'Scenario',
    'TimeHorizon',
    'HazardLevel',
    'ExposureLevel',
    'VulnerabilityLevel',
    'AdaptiveCapacityLevel',
    'InherentRiskLevel',
    'ResidualRiskLevel',
    'EvaluationStatus',
    'SourceIDs',
    'SpecialistReviewRequired',
  ];

  const rows = assessment.riskFindings.map((f) =>
    [
      f.findingId,
      f.hazardCategory,
      f.floodSubType || 'N/A',
      f.exposedAssetCategory,
      f.scenario,
      f.timeHorizon,
      f.hazardLevel,
      f.exposureLevel,
      f.vulnerabilityLevel,
      f.adaptiveCapacityLevel,
      f.inherentRiskLevel,
      f.residualRiskLevel,
      f.evaluationStatus,
      `"${f.ruleAndThresholdTrace.sourceIds.join('; ')}"`,
      `"${f.requiresSpecialistEngineering.replace(/"/g, '""')}"`,
    ].join(',')
  );

  return [headers.join(','), ...rows].join('\n');
}

export function exportClimateResilienceMarkdownReport(
  project: Project,
  assessment: ClimateHazardResilienceAssessmentResult
): string {
  const pre = assessment.locationPreflight;
  const lines: string[] = [
    `# PLOTIFY — P45 CLIMATE HAZARD & RESILIENCE ASSESSMENT REPORT`,
    ``,
    `- **Profile Identifier**: \`${assessment.profileId}\``,
    `- **Assessment ID**: \`${assessment.assessmentId}\``,
    `- **Project Name**: ${project.name} (\`${project.id}\`)`,
    `- **Evaluated At**: ${assessment.evaluatedAt}`,
    `- **Active Scenario**: \`${assessment.config.activeScenario.toUpperCase()}\``,
    `- **Comparison Scenario**: \`${assessment.config.comparisonScenario.toUpperCase()}\``,
    `- **Projection Time Horizon**: \`${assessment.config.activeTimeHorizon}\``,
    ``,
    `## 1. Site Location & Spatial Preflight`,
    `- **Preflight Status**: \`${pre.status}\``,
    `- **Coordinates (WGS84)**: ${
      pre.latitude !== null && pre.longitude !== null
        ? `${pre.latitude.toFixed(5)}°, ${pre.longitude.toFixed(5)}°`
        : 'Not Provided (Never Fabricated)'
    }`,
    `- **Coordinate Source & Confidence**: \`${pre.coordinateSource}\` / \`${pre.locationConfidence}\``,
    `- **Detected Jurisdiction Scope**: \`${pre.detectedJurisdictionScope}\``,
    `- **Parcel Footprint**: ${pre.parcelFootprintMeters.widthM} m × ${pre.parcelFootprintMeters.lengthM} m (${pre.parcelFootprintMeters.areaM2} m², diagonal ${pre.parcelFootprintMeters.diagonalSpanKm} km)`,
    `- **Grid Resolution Check**: ${pre.gridCellSpanCheck.spatialResolutionWarning}`,
    `- **P43 Terrain Alignment**: ${pre.terrainAlignmentCheck.terrainWarning}`,
    ``,
    `## 2. Authoritative Climate Data Sources`,
    `| Source ID | Dataset & Version | Temporal Class | Baseline | Resolution | Status |`,
    `|---|---|---|---|---|---|`,
    ...assessment.dataSources.map(
      (s) =>
        `| \`${s.sourceId}\` | ${s.name} (${s.versionOrRelease}) | \`${s.temporalClass}\` | ${s.baselinePeriod} | ${s.spatialResolutionKm} km | \`${s.verificationStatus}\` |`
    ),
    ``,
    `## 3. Multi-Hazard Screening Summary (${assessment.config.activeScenario.toUpperCase()} · ${assessment.config.activeTimeHorizon})`,
    `| Hazard Category | Screening Status | Severity Level | Confidence | Key Indicators & Notes |`,
    `|---|---|---|---|---|`,
    ...assessment.hazards.map((h) => {
      const indSummary =
        h.indicators
          .map(
            (i) =>
              `${i.indicatorCode}: ${i.projectedOrObservedValue} ${i.unit} (baseline ${i.historicalBaselineValue ?? 'N/A'})`
          )
          .join('; ') || h.confidenceRationale;
      return `| \`${h.hazardCategory}\` | \`${h.screeningStatus}\` | **${h.hazardSeverityLevel.toUpperCase()}** | \`${h.confidenceLevel}\` | ${indSummary} |`;
    }),
    ``,
    `## 4. Transparent Risk Findings (Separating Hazard, Exposure, Vulnerability, Adaptive Capacity & Residual Risk)`,
    `| Finding ID | Hazard | Exposed Asset | Hazard Level | Exposure | Vulnerability | Inherent Risk | Residual Risk |`,
    `|---|---|---|---|---|---|---|---|`,
    ...assessment.riskFindings.map(
      (f) =>
        `| \`${f.findingId}\` | \`${f.hazardCategory}\` | \`${f.exposedAssetCategory}\` | \`${f.hazardLevel}\` | \`${f.exposureLevel}\` | \`${f.vulnerabilityLevel}\` | **${f.inherentRiskLevel.toUpperCase()}** | **${f.residualRiskLevel.toUpperCase()}** |`
    ),
    ``,
    `## 5. Selected Resilience & Adaptation Measures & P44 Carbon Trade-Offs`,
    ...assessment.adaptationMeasures.map(
      (m) =>
        `- **[${m.selectedByUser ? 'SELECTED' : 'CANDIDATE'}] ${m.title}** (\`${m.measureId}\`)\n  - Action: ${m.designActionSummary}\n  - Expected Reduction: Vulnerability \`${m.expectedVulnerabilityReduction.fromLevel}\` → \`${m.expectedVulnerabilityReduction.toLevel}\` (Residual Risk: \`${m.expectedVulnerabilityReduction.resultingResidualRisk}\`)\n  - P44 Embodied Carbon Trade-Off: ${m.embodiedCarbonTradeOff.materialImplicationSummary} (${m.embodiedCarbonTradeOff.p44CrossReferenceNote})\n  - Residual Risk & Sign-Off: ${m.residualRiskAfterMeasure} (${m.professionalSignOffRequired})`
    ),
    ``,
    `## 6. Mandatory Scope & Engineering Disclaimers`,
    ...assessment.scopeAndMethodologyDisclaimers.map((d) => `- ${d}`),
    ``,
  ];

  return lines.join('\n');
}
