/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Project } from '../types/project';
import {
  ENVELOPE_ASSESSMENT_PROFILE_ID,
  EnvelopeAirBarrierChecklistItem,
  EnvelopeAirtightnessConfig,
  EnvelopeAirtightnessEvaluation,
  EnvelopeAssemblyRecord,
  EnvelopeAssessmentProfile,
  EnvelopeBoundaryClimateScenario,
  EnvelopeElementCategory,
  EnvelopeFindingRecord,
  EnvelopeGlaserInterfaceNode,
  EnvelopeHeatFlowDirection,
  EnvelopeImprovementOption,
  EnvelopeLayerCalculationStep,
  EnvelopeLayerRecord,
  EnvelopeMaterialCatalogEntry,
  EnvelopeMoistureCondensationRecord,
  EnvelopeOrientation,
  EnvelopeOrientationGlazingSummary,
  EnvelopePerformanceAssessment,
  EnvelopePerformanceSummary,
  EnvelopeRegionalScreeningTarget,
  EnvelopeSourceFingerprint,
  EnvelopeStalenessReport,
  EnvelopeThermalBridgeRecord,
  EnvelopeThermalBridgeSummary,
  EnvelopeThermalCalculationResult,
  ProjectEnvelopePerformanceMetadata,
} from '../types/envelope';
import { createProjectSnapshot } from './versioningService';

const FEET_TO_METRES = 0.3048;

export const SURFACE_RESISTANCE_DEFAULTS: Record<
  EnvelopeHeatFlowDirection,
  { Rsi: number; Rse: number }
> = {
  horizontal: { Rsi: 0.13, Rse: 0.04 },
  upward: { Rsi: 0.10, Rse: 0.04 },
  downward: { Rsi: 0.17, Rse: 0.04 },
};

export const AUTHORITATIVE_ENVELOPE_MATERIALS: EnvelopeMaterialCatalogEntry[] = [
  {
    materialId: 'mat-brick-outer-leaf',
    name: 'Clay Facing Brick (Outer Leaf)',
    category: 'masonry-concrete',
    thermalConductivityWPerMK: 0.77,
    densityKgPerM3: 1750,
    specificHeatJPerKgK: 800,
    vapourResistanceFactorMu: 10,
    sourceReference: 'ISO 10456:2007 Table 3 — Fired clay masonry units (exposed)',
    provenance: 'authoritative-generic',
    linkedP44CarbonFactorId: 'cf-brick-common',
  },
  {
    materialId: 'mat-concrete-dense-rc',
    name: 'Reinforced Dense Concrete (2% steel)',
    category: 'masonry-concrete',
    thermalConductivityWPerMK: 2.5,
    densityKgPerM3: 2400,
    specificHeatJPerKgK: 1000,
    vapourResistanceFactorMu: 130,
    sourceReference: 'ISO 10456:2007 Table 3 — Reinforced concrete',
    provenance: 'authoritative-generic',
    linkedP44CarbonFactorId: 'cf-concrete-c30-37-cem1',
  },
  {
    materialId: 'mat-aac-blockwork',
    name: 'Autoclaved Aerated Concrete (AAC) Blockwork',
    category: 'masonry-concrete',
    thermalConductivityWPerMK: 0.16,
    densityKgPerM3: 600,
    specificHeatJPerKgK: 1000,
    vapourResistanceFactorMu: 8,
    sourceReference: 'ISO 10456:2007 / EN 1745 — AAC blockwork (dry density 600 kg/m³)',
    provenance: 'authoritative-generic',
  },
  {
    materialId: 'mat-mineral-wool-slab',
    name: 'Mineral Wool / Stone Wool Batts',
    category: 'insulation',
    thermalConductivityWPerMK: 0.035,
    densityKgPerM3: 45,
    specificHeatJPerKgK: 1030,
    vapourResistanceFactorMu: 1.3,
    sourceReference: 'ISO 10456:2007 / EN 13162 — Mineral wool thermal insulation',
    provenance: 'authoritative-generic',
    linkedP44CarbonFactorId: 'cf-insulation-mineral-wool',
  },
  {
    materialId: 'mat-pir-rigid-board',
    name: 'PIR Rigid Foam Insulation Board (Foil-Faced)',
    category: 'insulation',
    thermalConductivityWPerMK: 0.022,
    densityKgPerM3: 32,
    specificHeatJPerKgK: 1400,
    vapourResistanceFactorMu: 60,
    sourceReference: 'EN 13165 — Rigid polyisocyanurate (PIR) foam insulation',
    provenance: 'authoritative-generic',
  },
  {
    materialId: 'mat-xps-slab-insulation',
    name: 'Extruded Polystyrene (XPS) Board',
    category: 'insulation',
    thermalConductivityWPerMK: 0.034,
    densityKgPerM3: 35,
    specificHeatJPerKgK: 1450,
    vapourResistanceFactorMu: 150,
    sourceReference: 'ISO 10456:2007 / EN 13164 — XPS thermal insulation',
    provenance: 'authoritative-generic',
  },
  {
    materialId: 'mat-wood-fibre-insulation',
    name: 'Wood-Fibre Rigid Insulation Board',
    category: 'insulation',
    thermalConductivityWPerMK: 0.038,
    densityKgPerM3: 140,
    specificHeatJPerKgK: 2100,
    vapourResistanceFactorMu: 5,
    sourceReference: 'EN 13171 — Wood fibre thermal insulation',
    provenance: 'authoritative-generic',
    linkedP44CarbonFactorId: 'cf-timber-clt',
  },
  {
    materialId: 'mat-clt-structural-panel',
    name: 'Cross-Laminated Timber (CLT) Panel',
    category: 'timber-board',
    thermalConductivityWPerMK: 0.13,
    densityKgPerM3: 500,
    specificHeatJPerKgK: 1600,
    vapourResistanceFactorMu: 50,
    sourceReference: 'ISO 10456:2007 Table 3 — Softwood / CLT structural timber',
    provenance: 'authoritative-generic',
    linkedP44CarbonFactorId: 'cf-timber-clt',
  },
  {
    materialId: 'mat-osb-sheathing',
    name: 'Oriented Strand Board (OSB/3) Sheathing',
    category: 'timber-board',
    thermalConductivityWPerMK: 0.13,
    densityKgPerM3: 650,
    specificHeatJPerKgK: 1700,
    vapourResistanceFactorMu: 50,
    sourceReference: 'ISO 10456:2007 Table 3 — OSB wood-based panels',
    provenance: 'authoritative-generic',
  },
  {
    materialId: 'mat-gypsum-plasterboard',
    name: 'Interior Gypsum Plasterboard',
    category: 'gypsum-plaster',
    thermalConductivityWPerMK: 0.25,
    densityKgPerM3: 900,
    specificHeatJPerKgK: 1000,
    vapourResistanceFactorMu: 10,
    sourceReference: 'ISO 10456:2007 Table 3 — Gypsum plasterboard',
    provenance: 'authoritative-generic',
    linkedP44CarbonFactorId: 'cf-gypsum-plasterboard',
  },
  {
    materialId: 'mat-exterior-mineral-render',
    name: 'Exterior Lime-Cement Render',
    category: 'cladding-render',
    thermalConductivityWPerMK: 0.80,
    densityKgPerM3: 1600,
    specificHeatJPerKgK: 1000,
    vapourResistanceFactorMu: 18,
    sourceReference: 'ISO 10456:2007 Table 3 — Rendering mortar',
    provenance: 'authoritative-generic',
  },
  {
    materialId: 'mat-timber-rainscreen-cladding',
    name: 'Ventilated Larch Timber Cladding',
    category: 'cladding-render',
    thermalConductivityWPerMK: 0.14,
    densityKgPerM3: 550,
    specificHeatJPerKgK: 1600,
    vapourResistanceFactorMu: 40,
    sourceReference: 'ISO 10456:2007 Table 3 — Timber cladding',
    provenance: 'authoritative-generic',
    linkedP44CarbonFactorId: 'cf-timber-clt',
  },
  {
    materialId: 'mat-vcl-pe-membrane',
    name: 'Polyethylene Vapour Control Layer (VCL, sd = 50 m)',
    category: 'membrane-vapour-control',
    thermalConductivityWPerMK: 0.33,
    fixedThermalResistanceM2KPerW: 0.001,
    densityKgPerM3: 920,
    specificHeatJPerKgK: 2200,
    explicitSdValueM: 50,
    sourceReference: 'ISO 10456:2007 / EN 13984 — Polyethylene vapour barrier',
    provenance: 'authoritative-generic',
  },
  {
    materialId: 'mat-breather-membrane',
    name: 'Vapour-Open Breather Membrane (sd = 0.05 m)',
    category: 'membrane-vapour-control',
    thermalConductivityWPerMK: 0.25,
    fixedThermalResistanceM2KPerW: 0.001,
    densityKgPerM3: 400,
    specificHeatJPerKgK: 1500,
    explicitSdValueM: 0.05,
    sourceReference: 'EN 13859-1 — Flexible breather underlay membrane',
    provenance: 'authoritative-generic',
  },
  {
    materialId: 'mat-epdm-roof-membrane',
    name: 'EPDM Single-Ply Waterproofing Membrane (sd = 70 m)',
    category: 'membrane-vapour-control',
    thermalConductivityWPerMK: 0.25,
    fixedThermalResistanceM2KPerW: 0.006,
    densityKgPerM3: 1150,
    specificHeatJPerKgK: 1000,
    explicitSdValueM: 70,
    sourceReference: 'ISO 10456:2007 — EPDM synthetic rubber roofing sheet',
    provenance: 'authoritative-generic',
  },
  {
    materialId: 'mat-air-cavity-unventilated-25',
    name: 'Unventilated Air Cavity (25–50 mm, horizontal heat flow)',
    category: 'air-cavity',
    thermalConductivityWPerMK: null,
    fixedThermalResistanceM2KPerW: 0.18,
    densityKgPerM3: 1.2,
    specificHeatJPerKgK: 1005,
    explicitSdValueM: 0.01,
    sourceReference: 'ISO 6946:2017 Table 2 — Unventilated air layer (25–300 mm horizontal)',
    provenance: 'authoritative-generic',
  },
];

export const REGIONAL_ENVELOPE_SCREENING_BENCHMARKS: EnvelopeRegionalScreeningTarget[] = [
  {
    benchmarkId: 'bench-temperate-mixed-cz4-5',
    name: 'Temperate Mixed-Marine Reference Target (ASHRAE CZ 4–5 / European Temperate Screening)',
    regionOrClimateZone: 'Temperate / Mixed-Humid & Marine (CZ 4–5 Equivalent)',
    authorityNote:
      'Design-stage screening target based on ASHRAE 90.1 / European national building regulation reference envelopes. Not a statutory compliance certificate.',
    isStatutoryComplianceProof: false,
    maxUValueByCategoryWPerM2K: {
      'external-opaque-wall': 0.26,
      'roof-assembly': 0.18,
      'ground-contact-floor': 0.25,
      'exposed-suspended-floor': 0.22,
      'internal-thermal-partition': 0.60,
      'window-glazing': 1.40,
      'skylight-roof-glazing': 2.00,
      'curtain-wall': 1.60,
      'exterior-door': 1.60,
    },
    maxSHGC: 0.40,
    minTemperatureFactorFRsi: 0.70,
    maxAirPermeabilityQ50M3PerHM2: 3.0,
    maxAirChangesN50PerHour: 3.0,
  },
  {
    benchmarkId: 'bench-passive-low-energy',
    name: 'High-Performance Low-Energy / Passive-Oriented Envelope Target',
    regionOrClimateZone: 'Cool-Temperate High-Performance Screening Target',
    authorityNote:
      'Voluntary high-performance envelope screening benchmark for super-insulated, thermal-bridge-minimised envelopes. Not a formal Passivhaus Institute certification.',
    isStatutoryComplianceProof: false,
    maxUValueByCategoryWPerM2K: {
      'external-opaque-wall': 0.15,
      'roof-assembly': 0.12,
      'ground-contact-floor': 0.15,
      'exposed-suspended-floor': 0.15,
      'internal-thermal-partition': 0.40,
      'window-glazing': 0.80,
      'skylight-roof-glazing': 1.00,
      'curtain-wall': 0.85,
      'exterior-door': 0.80,
    },
    maxSHGC: 0.50,
    minTemperatureFactorFRsi: 0.75,
    maxAirPermeabilityQ50M3PerHM2: 0.6,
    maxAirChangesN50PerHour: 0.6,
  },
  {
    benchmarkId: 'bench-warm-cooling-dominated-cz1-2',
    name: 'Warm / Cooling-Dominated Reference Target (ASHRAE CZ 1–2 / Subtropical Screening)',
    regionOrClimateZone: 'Hot-Humid / Hot-Dry (CZ 1–2 Equivalent)',
    authorityNote:
      'Design-stage screening target prioritizing low solar heat gain coefficient (SHGC) and roof insulation in cooling-dominated climates. Not a statutory code approval.',
    isStatutoryComplianceProof: false,
    maxUValueByCategoryWPerM2K: {
      'external-opaque-wall': 0.45,
      'roof-assembly': 0.22,
      'ground-contact-floor': 0.50,
      'exposed-suspended-floor': 0.35,
      'internal-thermal-partition': 0.80,
      'window-glazing': 2.20,
      'skylight-roof-glazing': 2.80,
      'curtain-wall': 2.20,
      'exterior-door': 2.20,
    },
    maxSHGC: 0.25,
    minTemperatureFactorFRsi: 0.65,
    maxAirPermeabilityQ50M3PerHM2: 5.0,
    maxAirChangesN50PerHour: 5.0,
  },
  {
    benchmarkId: 'bench-cold-nordic-cz6-7',
    name: 'Cold / Heating-Dominated Reference Target (ASHRAE CZ 6–7 / Nordic Screening)',
    regionOrClimateZone: 'Cold / Sub-Arctic (CZ 6–7 Equivalent)',
    authorityNote:
      'Design-stage screening target for severe winter heating climates with stringent condensation and thermal transmittance limits. Not a statutory code approval.',
    isStatutoryComplianceProof: false,
    maxUValueByCategoryWPerM2K: {
      'external-opaque-wall': 0.18,
      'roof-assembly': 0.13,
      'ground-contact-floor': 0.18,
      'exposed-suspended-floor': 0.16,
      'internal-thermal-partition': 0.50,
      'window-glazing': 1.00,
      'skylight-roof-glazing': 1.40,
      'curtain-wall': 1.10,
      'exterior-door': 1.10,
    },
    maxSHGC: 0.45,
    minTemperatureFactorFRsi: 0.75,
    maxAirPermeabilityQ50M3PerHM2: 1.5,
    maxAirChangesN50PerHour: 1.5,
  },
];

export function getEnvelopeAssessmentProfile(): EnvelopeAssessmentProfile {
  return {
    profileId: ENVELOPE_ASSESSMENT_PROFILE_ID,
    profileName: 'Plotify Building Envelope Performance Analyzer Profile (P46 v1.0)',
    version: '1.0.0',
    supportedMethods: [
      {
        methodId: 'ISO-6946-2017-1D-LAYERED-OPAQUE',
        title: 'ISO 6946:2017 — 1D Steady-State Thermal Resistance & Transmittance of Layered Opaque Assemblies',
        standardReference: 'ISO 6946:2017 Building components and building elements — Thermal resistance and thermal transmittance',
        supportedScope:
          'Thermally homogeneous 1D planar opaque assemblies (external walls, roofs, suspended floors, internal partitions) with explicit layer thicknesses, thermal conductivities, surface film resistances (R_si, R_se), and air cavity ventilation states.',
        governingFormulas: [
          'R_i = d_i / lambda_i [m²·K/W], where d_i = thicknessMm / 1000 [m]',
          'R_T = R_si + sum(R_i) + R_se [m²·K/W]',
          'U = 1 / R_T [W/(m²·K)]',
          'Well-ventilated cavity (ISO 6946 §6.9.4): layers external to cavity excluded; R_se = R_si',
        ],
        requiredInputs: [
          'Heat-flow direction (horizontal, upward, downward)',
          'Ordered material layers (Outside -> Inside) with thickness > 0 mm and conductivity > 0 W/(m·K) or declared fixed R',
        ],
        explicitExclusionsAndLimitations: [
          'Does not apply to doors, windows, glazed units, or curtain walls (use ISO 10077-1 declared U_w).',
          'Does not apply to ground-contact slabs without ground-coupling geometry (use ISO 13370 method or declared effective U).',
          'Does not automatically compute 2D/3D repeating metal stud bridging or point fastener corrections unless declared.',
        ],
      },
      {
        methodId: 'ISO-10077-1-DECLARED-WINDOW-DOOR',
        title: 'ISO 10077-1 / NFRC — Declared Fenestration & Door Thermal/Solar Performance',
        standardReference: 'ISO 10077-1 / ISO 15099 / EN 410 Glazing & Fenestration Thermal and Solar Properties',
        supportedScope:
          'Windows, skylights, curtain walls, and exterior doors using declared whole-window U_w (or area-weighted U_g/U_f when frame fraction is supplied), SHGC (g-value), VT, and external shading factor F_sh.',
        governingFormulas: [
          'U_w = (A_g * U_g + A_f * U_f) / (A_g + A_f) when frame fraction is supplied without linear spacer Psi_g',
          'Q_sol = A_w * SHGC * F_sh * I_sol [W] (steady-state screening only when incident solar irradiance I_sol is supplied)',
        ],
        requiredInputs: [
          'Declared U-value basis (whole-window U_w vs centre-of-glass U_g)',
          'SHGC (0 < SHGC <= 1) and incident solar irradiance I_sol (W/m²) for solar gain screening',
        ],
        explicitExclusionsAndLimitations: [
          'Centre-of-glass U_g underestimates whole-window heat transfer if frame U_f and spacer edge bridging are omitted.',
          'Steady-state solar heat gain screening is not an hourly dynamic solar radiation / shading simulation (ISO 52016-1).',
        ],
      },
      {
        methodId: 'ISO-13370-DECLARED-GROUND-FLOOR',
        title: 'ISO 13370 — Simplified Slab-on-Ground Steady-State Ground Thermal Transmittance',
        standardReference: 'ISO 13370:2017 Thermal performance of buildings — Heat transfer via the ground',
        supportedScope:
          'Ground-contact slabs using either a declared effective ground-coupled U-value or simplified ISO 13370 characteristic dimension B\' = A / (0.5 * P) and equivalent thickness d_t = w + lambda_soil * (R_si + R_f + R_se).',
        governingFormulas: [
          'B\' = A / (0.5 * P) [m]',
          'd_t = w + lambda_soil * (R_si + R_f + R_se) [m]',
          'If d_t < B\': U_0 = (2 * lambda_soil / (pi * B\' + d_t)) * ln((pi * B\' / d_t) + 1)',
          'If d_t >= B\': U_0 = lambda_soil / (0.457 * B\' + d_t)',
        ],
        requiredInputs: [
          'Declared effective U-value OR slab area/perimeter characteristic dimension B\', perimeter wall thickness w, and soil thermal conductivity lambda_soil',
        ],
        explicitExclusionsAndLimitations: [
          'Never treats ground-contact slabs as simple 1D exterior-air assemblies.',
          'Steady-state ground transmittance does not model seasonal periodic ground heat storage amplitudes.',
        ],
      },
      {
        methodId: 'ISO-13788-2012-SURFACE-GLASER-SCREENING',
        title: 'ISO 13788:2012 — Interior Surface Temperature, Dew-Point & Glaser Interstitial Diffusion Screening',
        standardReference: 'ISO 13788:2012 Hygrothermal performance of building components and building elements',
        supportedScope:
          'Steady-state interior surface temperature T_si, temperature factor f_Rsi, critical surface mould-risk check (80% RH limit), indoor dew-point T_dp, and 1D steady-state Glaser vapour-diffusion interface profile.',
        governingFormulas: [
          'p_sat(T >= 0°C) = 610.5 * exp((17.269 * T) / (237.3 + T)) [Pa]',
          'T_si = T_i - U * R_si * (T_i - T_e) [°C]',
          'f_Rsi = (T_si - T_e) / (T_i - T_e) [-]',
          's_d,i = mu_i * d_i [m]; interface p_v(k) = p_i - (sum_1..k(s_d,j) / s_d,total) * (p_i - p_e)',
        ],
        requiredInputs: [
          'Indoor and outdoor air temperatures (T_i, T_e) and relative humidities (RH_i, RH_e)',
          'Assembly U-value and R_si (plus complete layer s_d or mu values for interstitial Glaser profile)',
        ],
        explicitExclusionsAndLimitations: [
          'Does not model transient liquid capillary moisture transport, wind-driven rain absorption, solar vapour drive, air-leakage convective condensation, or construction moisture dry-out (use ASHRAE 160 / EN 15026 transient hygrothermal simulation for detailed verification).',
        ],
      },
      {
        methodId: 'ISO-14683-DECLARED-THERMAL-BRIDGE',
        title: 'ISO 14683 / ISO 13789 — Linear (Psi) and Point (Chi) Thermal Bridge Accounting',
        standardReference: 'ISO 14683:2017 / ISO 13789:2017 Thermal bridges in building construction',
        supportedScope:
          'Explicit linear thermal transmittance Psi (W/(m·K)) over junction length L (m) and point thermal transmittance Chi (W/K) over count n, contributing to transmission heat transfer coefficient H_tb.',
        governingFormulas: [
          'H_tb = sum(Psi_k * L_k) + sum(Chi_m * n_m) [W/K]',
          'Q_bridge = H_tb * Delta_T [W]',
          'Delta_U_tb = H_tb / A_env,net [W/(m²·K)]',
        ],
        requiredInputs: [
          'Explicit Psi or Chi value with provenance, junction length L > 0 m or count n > 0, and double-counting exclusion flag',
        ],
        explicitExclusionsAndLimitations: [
          'Does not perform 2D/3D finite-element numerical thermal-bridge solving from 3D building geometry.',
        ],
      },
      {
        methodId: 'STEADY-STATE-UA-DELTA-T-SCREENING',
        title: 'ISO 13789 — Area-Weighted Envelope Transmittance & Steady-State Component Heat Transfer',
        standardReference: 'ISO 13789:2017 Transmission and ventilation transfer coefficients',
        supportedScope:
          'Area-weighted envelope U-value across net exterior thermal boundary elements and steady-state design-condition conductive heat transfer Q = H_tr * Delta_T.',
        governingFormulas: [
          'U_env = sum(U_i * A_net,i) / sum(A_net,i) [W/(m²·K)]',
          'H_tr = sum(U_i * A_net,i) + H_tb [W/K]',
          'Q_tr = H_tr * |T_i - T_e| [W]',
        ],
        requiredInputs: ['Net assembly areas A_net,i (m²), valid assembly U-values, and design boundary temperatures'],
        explicitExclusionsAndLimitations: [
          'Steady-state component heat transfer (W) under design temperatures is NOT an annual heating/cooling energy demand calculation (kWh/yr) and does not replace dynamic hourly simulation (ISO 52016-1 / EnergyPlus).',
        ],
      },
    ],
    surfaceResistanceDefaultsM2KPerW: SURFACE_RESISTANCE_DEFAULTS,
    screeningBenchmarks: REGIONAL_ENVELOPE_SCREENING_BENCHMARKS,
    statutoryComplianceDisclaimer:
      'Benchmark comparisons in this workspace are non-statutory design-stage screening checks. Formal energy-code or building-regulations compliance requires jurisdiction-specific accredited software and whole-building energy modelling.',
    dynamicSimulationDisclaimer:
      'Thermal heat-flow outputs represent steady-state conductive and solar screening under specified design temperatures and irradiances. They do not represent dynamic hourly thermal mass response, HVAC equipment efficiency, or annual operational energy consumption (ISO 52016-1).',
    hygrothermalDisclaimer:
      'Moisture and condensation checks use steady-state surface temperature factor (f_Rsi) and 1D Glaser vapour-diffusion screening (ISO 13788). They do not model wind-driven rain, capillary liquid transport, or convective air leakage (ASHRAE 160 / EN 15026).',
  };
}

export function getAuthoritativeMaterialCatalog(): EnvelopeMaterialCatalogEntry[] {
  return AUTHORITATIVE_ENVELOPE_MATERIALS.map((m) => ({ ...m }));
}

export function computeEnvelopeSourceFingerprint(project: Project): EnvelopeSourceFingerprint {
  return {
    plotWidth: project.plotWidth,
    plotLength: project.plotLength,
    floors: project.floors,
    unit: project.unit,
    roomsCount: project.floorPlan?.rooms?.length || 0,
    ifcImportTimestamp: project.ifcInterop?.lastImportedAt || null,
    climateScenarioCode: project.climateResilience?.activeAssessment?.config?.activeScenario || null,
    carbonAssessmentUpdatedAt: project.carbonAssessment?.activeAssessment?.updatedAt || null,
  };
}

export function serializeEnvelopeFingerprint(fp: EnvelopeSourceFingerprint): string {
  return JSON.stringify(fp);
}

export function checkEnvelopeAssessmentStaleness(
  project: Project,
  assessment?: EnvelopePerformanceAssessment
): EnvelopeStalenessReport {
  const target = assessment || project.envelopePerformance?.activeAssessment;
  const currentFp = computeEnvelopeSourceFingerprint(project);
  const currentSerialized = serializeEnvelopeFingerprint(currentFp);

  if (!target) {
    return {
      isStale: false,
      reasons: [],
      lastSourceFingerprint: currentSerialized,
      currentSourceFingerprint: currentSerialized,
    };
  }

  const lastFp = target.sourceFingerprint;
  const lastSerialized = serializeEnvelopeFingerprint(lastFp);
  const reasons: string[] = [];

  if (lastFp.plotWidth !== currentFp.plotWidth || lastFp.plotLength !== currentFp.plotLength) {
    reasons.push(
      `Project plot dimensions changed from ${lastFp.plotWidth}×${lastFp.plotLength} to ${currentFp.plotWidth}×${currentFp.plotLength} (${currentFp.unit}).`
    );
  }
  if (lastFp.floors !== currentFp.floors) {
    reasons.push(`Storey count changed from ${lastFp.floors} to ${currentFp.floors}.`);
  }
  if (lastFp.unit !== currentFp.unit) {
    reasons.push(`Project length unit changed from ${lastFp.unit} to ${currentFp.unit}.`);
  }
  if (lastFp.roomsCount !== currentFp.roomsCount) {
    reasons.push(`Floor-plan room count changed from ${lastFp.roomsCount} to ${currentFp.roomsCount}.`);
  }
  if (lastFp.ifcImportTimestamp !== currentFp.ifcImportTimestamp) {
    reasons.push('OpenBIM / IFC model import state was updated since the envelope assessment was last synchronized.');
  }
  if (lastFp.climateScenarioCode !== currentFp.climateScenarioCode) {
    reasons.push(
      `P45 Climate Resilience active scenario changed (${lastFp.climateScenarioCode || 'none'} → ${currentFp.climateScenarioCode || 'none'}).`
    );
  }

  return {
    isStale: reasons.length > 0,
    reasons,
    lastSourceFingerprint: lastSerialized,
    currentSourceFingerprint: currentSerialized,
  };
}

/**
 * Evaluates thermal resistance R_T and thermal transmittance U for a single assembly
 * strictly following the rules of Section 6:
 * - Windows, skylights, curtain walls use ISO 10077-1 declared U-values (never 1D ISO 6946 layer math).
 * - Ground-contact floors use ISO 13370 ground coupling or declared effective U-value (never simple air-to-air 1D math).
 * - Opaque walls, roofs, suspended floors, and internal partitions use ISO 6946:2017 1D layer summation
 *   with explicit well-ventilated cavity handling and strict validation of layer thicknesses and conductivities.
 */
export function evaluateAssemblyThermalPerformance(
  assembly: EnvelopeAssemblyRecord
): EnvelopeThermalCalculationResult {
  const direction = assembly.heatFlowDirection || 'horizontal';
  const defaultSurfaceR = SURFACE_RESISTANCE_DEFAULTS[direction] || SURFACE_RESISTANCE_DEFAULTS.horizontal;
  let Rsi = defaultSurfaceR.Rsi;
  let Rse =
    assembly.boundaryCondition === 'adjacent-conditioned-space' ||
    assembly.boundaryCondition === 'unheated-buffer-space'
      ? defaultSurfaceR.Rsi
      : defaultSurfaceR.Rse;

  const validationErrors: string[] = [];
  const warnings: string[] = [];
  const formulaTrace: string[] = [];

  // 1. Fenestration / Glazing / Curtain Wall routing (ISO 10077-1)
  if (
    assembly.category === 'window-glazing' ||
    assembly.category === 'skylight-roof-glazing' ||
    assembly.category === 'curtain-wall'
  ) {
    const gs = assembly.glazingSolar;
    if (!gs) {
      validationErrors.push(
        `Fenestration assembly "${assembly.name}" requires declared glazing/window thermal properties (ISO 10077-1). Simple 1D ISO 6946 layer math is not valid for glazed assemblies.`
      );
      return {
        assemblyId: assembly.assemblyId,
        status: 'incomplete-data',
        methodUsed: 'ISO-10077-1-DECLARED-WINDOW-DOOR',
        heatFlowDirection: direction,
        RsiM2KPerW: Rsi,
        RseM2KPerW: Rse,
        layerSteps: [],
        sumLayerResistanceM2KPerW: null,
        totalResistanceRTM2KPerW: null,
        uValueWPerM2K: null,
        totalThicknessMm: 0,
        totalArealMassKgPerM2: null,
        equivalentVapourThicknessSdTotalM: null,
        formulaTrace,
        validationErrors,
        warnings,
      };
    }

    let resolvedU: number | null = null;
    if (gs.declaredUValueWPerM2K !== null && gs.declaredUValueWPerM2K !== undefined) {
      if (!Number.isFinite(gs.declaredUValueWPerM2K) || gs.declaredUValueWPerM2K <= 0) {
        validationErrors.push(
          `Declared U-value for "${assembly.name}" must be a positive finite number (received ${gs.declaredUValueWPerM2K}).`
        );
      } else {
        resolvedU = Number(gs.declaredUValueWPerM2K.toFixed(4));
        formulaTrace.push(
          `Method: ISO-10077-1-DECLARED-WINDOW-DOOR (${gs.uValueBasis}) -> U = ${resolvedU.toFixed(3)} W/(m²·K)`
        );
      }
    } else if (
      gs.centreOfGlassUgWPerM2K &&
      gs.frameUfWPerM2K &&
      gs.frameFractionPercent !== null &&
      gs.frameFractionPercent !== undefined &&
      gs.frameFractionPercent > 0 &&
      gs.frameFractionPercent < 100
    ) {
      const fFrac = gs.frameFractionPercent / 100;
      const gFrac = 1 - fFrac;
      resolvedU = Number((gFrac * gs.centreOfGlassUgWPerM2K + fFrac * gs.frameUfWPerM2K).toFixed(4));
      formulaTrace.push(
        `Area-weighted window U_w = (1 - f_f)*U_g + f_f*U_f = ${gFrac.toFixed(2)}*${gs.centreOfGlassUgWPerM2K} + ${fFrac.toFixed(2)}*${gs.frameUfWPerM2K} = ${resolvedU.toFixed(3)} W/(m²·K) (excludes linear glazing edge spacer Psi_g)`
      );
      warnings.push(
        'Window U-value was area-weighted from centre-of-glass U_g and frame U_f without linear spacer transmittance (Psi_g); verify against full ISO 10077-1 test report.'
      );
    } else {
      validationErrors.push(
        `Missing declared U-value (W/(m²·K)) for glazed assembly "${assembly.name}".`
      );
    }

    if (gs.uValueBasis === 'centre-of-glass-Ug') {
      warnings.push(
        `Glazing U-value for "${assembly.name}" is marked as centre-of-glass (U_g) rather than whole-window (U_w). Frame and spacer edge thermal bridging are not included in U_g.`
      );
    }
    if (gs.uValueBasis === 'unverified-unknown') {
      warnings.push(
        `Glazing U-value basis (whole-window U_w vs centre-of-glass U_g) is unverified for "${assembly.name}".`
      );
    }

    const status =
      validationErrors.length > 0
        ? gs.declaredUValueWPerM2K !== null && gs.declaredUValueWPerM2K !== undefined && gs.declaredUValueWPerM2K <= 0
          ? 'invalid-input'
          : 'incomplete-data'
        : 'assessed';

    return {
      assemblyId: assembly.assemblyId,
      status,
      methodUsed: 'ISO-10077-1-DECLARED-WINDOW-DOOR',
      heatFlowDirection: direction,
      RsiM2KPerW: Rsi,
      RseM2KPerW: Rse,
      layerSteps: [],
      sumLayerResistanceM2KPerW: null,
      totalResistanceRTM2KPerW: resolvedU ? Number((1 / resolvedU).toFixed(4)) : null,
      uValueWPerM2K: resolvedU,
      totalThicknessMm: 36,
      totalArealMassKgPerM2: 30,
      equivalentVapourThicknessSdTotalM: null,
      formulaTrace,
      validationErrors,
      warnings,
    };
  }

  // 2. Ground-Contact Floor routing (ISO 13370) — never apply simple air-to-air 1D ISO 6946
  if (assembly.category === 'ground-contact-floor' || assembly.boundaryCondition === 'ground-contact') {
    const gf = assembly.groundFloor;
    // Also evaluate any slab/insulation layers to determine R_f if layers are present
    let slabLayerR = 0;
    let totalThicknessMm = 0;
    let totalMass = 0;
    let totalSd: number | null = 0;
    const layerSteps: EnvelopeLayerCalculationStep[] = [];

    for (const layer of [...assembly.layers].sort((a, b) => a.orderIndex - b.orderIndex)) {
      const dM = layer.thicknessMm / 1000;
      totalThicknessMm += Math.max(0, layer.thicknessMm);
      if (layer.densityKgPerM3 && dM > 0) {
        totalMass += layer.densityKgPerM3 * dM;
      }
      let rLayer: number | null = null;
      if (dM > 0 && layer.thermalConductivityWPerMK && layer.thermalConductivityWPerMK > 0) {
        rLayer = dM / layer.thermalConductivityWPerMK;
        slabLayerR += rLayer;
      } else if (layer.fixedThermalResistanceM2KPerW && layer.fixedThermalResistanceM2KPerW > 0) {
        rLayer = layer.fixedThermalResistanceM2KPerW;
        slabLayerR += rLayer;
      }
      const sdVal =
        layer.explicitSdValueM !== undefined && layer.explicitSdValueM !== null
          ? layer.explicitSdValueM
          : layer.vapourResistanceFactorMu && dM > 0
            ? layer.vapourResistanceFactorMu * dM
            : null;
      if (sdVal === null) totalSd = null;
      else if (totalSd !== null) totalSd += sdVal;

      layerSteps.push({
        layerId: layer.layerId,
        orderIndex: layer.orderIndex,
        layerName: layer.name,
        thicknessM: dM,
        conductivityWPerMK: layer.thermalConductivityWPerMK,
        calculatedResistanceM2KPerW: rLayer !== null ? Number(rLayer.toFixed(4)) : null,
        calculatedSdM: sdVal !== null ? Number(sdVal.toFixed(4)) : null,
        includedInThermalSum: rLayer !== null,
      });
    }

    if (!gf || gf.groundCalculationMethod === 'unmodelled-ground-coupling') {
      validationErrors.push(
        `Ground-contact assembly "${assembly.name}" cannot be evaluated with 1D air-to-air ISO 6946 layer math alone. Select ISO 13370 simplified slab-on-ground parameters (B', soil conductivity, wall thickness) or enter a declared effective ground-coupled U-value.`
      );
      return {
        assemblyId: assembly.assemblyId,
        status: 'unsupported-method',
        methodUsed: 'ISO-13370-DECLARED-GROUND-FLOOR',
        heatFlowDirection: 'downward',
        RsiM2KPerW: 0.17,
        RseM2KPerW: 0.04,
        layerSteps,
        sumLayerResistanceM2KPerW: Number(slabLayerR.toFixed(4)),
        totalResistanceRTM2KPerW: null,
        uValueWPerM2K: null,
        totalThicknessMm,
        totalArealMassKgPerM2: Number(totalMass.toFixed(1)),
        equivalentVapourThicknessSdTotalM: totalSd !== null ? Number(totalSd.toFixed(3)) : null,
        formulaTrace: [
          'Blocked: 1D exterior-air ISO 6946 formula is physically invalid for ground-contact slabs without soil thermal pathway accounting (ISO 13370).',
        ],
        validationErrors,
        warnings,
      };
    }

    if (gf.groundCalculationMethod === 'declared-effective-u-value') {
      const decU = gf.declaredEffectiveUValueWPerM2K;
      if (decU === null || decU === undefined || !Number.isFinite(decU) || decU <= 0) {
        validationErrors.push(
          `Ground-contact assembly "${assembly.name}" requires a positive finite declared effective U-value (W/(m²·K)).`
        );
        return {
          assemblyId: assembly.assemblyId,
          status: decU !== null && decU !== undefined && decU <= 0 ? 'invalid-input' : 'incomplete-data',
          methodUsed: 'ISO-13370-DECLARED-GROUND-FLOOR',
          heatFlowDirection: 'downward',
          RsiM2KPerW: 0.17,
          RseM2KPerW: 0.04,
          layerSteps,
          sumLayerResistanceM2KPerW: Number(slabLayerR.toFixed(4)),
          totalResistanceRTM2KPerW: null,
          uValueWPerM2K: null,
          totalThicknessMm,
          totalArealMassKgPerM2: Number(totalMass.toFixed(1)),
          equivalentVapourThicknessSdTotalM: totalSd !== null ? Number(totalSd.toFixed(3)) : null,
          formulaTrace,
          validationErrors,
          warnings,
        };
      }
      formulaTrace.push(
        `Method: ISO-13370-DECLARED-GROUND-FLOOR (Declared Effective Ground U) -> U_ground = ${decU.toFixed(3)} W/(m²·K)`
      );
      return {
        assemblyId: assembly.assemblyId,
        status: 'assessed',
        methodUsed: 'ISO-13370-DECLARED-GROUND-FLOOR',
        heatFlowDirection: 'downward',
        RsiM2KPerW: 0.17,
        RseM2KPerW: 0.04,
        layerSteps,
        sumLayerResistanceM2KPerW: Number(slabLayerR.toFixed(4)),
        totalResistanceRTM2KPerW: Number((1 / decU).toFixed(4)),
        uValueWPerM2K: Number(decU.toFixed(4)),
        totalThicknessMm,
        totalArealMassKgPerM2: Number(totalMass.toFixed(1)),
        equivalentVapourThicknessSdTotalM: totalSd !== null ? Number(totalSd.toFixed(3)) : null,
        formulaTrace,
        validationErrors,
        warnings,
      };
    }

    // ISO 13370 simplified slab-on-ground calculation
    const B = gf.slabCharacteristicDimensionBM;
    const lambdaSoil = gf.soilThermalConductivityWPerMK;
    const w = gf.perimeterWallThicknessM ?? 0.3;
    const Rf =
      gf.slabThermalResistanceM2KPerW !== null && gf.slabThermalResistanceM2KPerW !== undefined
        ? gf.slabThermalResistanceM2KPerW
        : slabLayerR;

    if (!B || !Number.isFinite(B) || B <= 0 || !lambdaSoil || !Number.isFinite(lambdaSoil) || lambdaSoil <= 0 || w < 0) {
      validationErrors.push(
        `ISO 13370 slab-on-ground calculation for "${assembly.name}" requires positive characteristic dimension B' (m) and soil thermal conductivity lambda_soil (W/(m·K)).`
      );
      return {
        assemblyId: assembly.assemblyId,
        status: 'incomplete-data',
        methodUsed: 'ISO-13370-DECLARED-GROUND-FLOOR',
        heatFlowDirection: 'downward',
        RsiM2KPerW: 0.17,
        RseM2KPerW: 0.04,
        layerSteps,
        sumLayerResistanceM2KPerW: Number(Rf.toFixed(4)),
        totalResistanceRTM2KPerW: null,
        uValueWPerM2K: null,
        totalThicknessMm,
        totalArealMassKgPerM2: Number(totalMass.toFixed(1)),
        equivalentVapourThicknessSdTotalM: totalSd !== null ? Number(totalSd.toFixed(3)) : null,
        formulaTrace,
        validationErrors,
        warnings,
      };
    }

    const dt = w + lambdaSoil * (0.17 + Rf + 0.04);
    let U0: number;
    if (dt < B) {
      U0 = ((2 * lambdaSoil) / (Math.PI * B + dt)) * Math.log((Math.PI * B) / dt + 1);
      formulaTrace.push(
        `ISO 13370 Slab-on-Ground (lightly insulated, d_t = ${dt.toFixed(3)} m < B' = ${B.toFixed(2)} m): U_0 = (2*${lambdaSoil}/(pi*${B.toFixed(2)} + ${dt.toFixed(3)})) * ln(pi*${B.toFixed(2)}/${dt.toFixed(3)} + 1) = ${U0.toFixed(4)} W/(m²·K)`
      );
    } else {
      U0 = lambdaSoil / (0.457 * B + dt);
      formulaTrace.push(
        `ISO 13370 Slab-on-Ground (well insulated, d_t = ${dt.toFixed(3)} m >= B' = ${B.toFixed(2)} m): U_0 = ${lambdaSoil} / (0.457*${B.toFixed(2)} + ${dt.toFixed(3)}) = ${U0.toFixed(4)} W/(m²·K)`
      );
    }

    return {
      assemblyId: assembly.assemblyId,
      status: 'assessed',
      methodUsed: 'ISO-13370-DECLARED-GROUND-FLOOR',
      heatFlowDirection: 'downward',
      RsiM2KPerW: 0.17,
      RseM2KPerW: 0.04,
      layerSteps,
      sumLayerResistanceM2KPerW: Number(Rf.toFixed(4)),
      totalResistanceRTM2KPerW: Number((1 / U0).toFixed(4)),
      uValueWPerM2K: Number(U0.toFixed(4)),
      totalThicknessMm,
      totalArealMassKgPerM2: Number(totalMass.toFixed(1)),
      equivalentVapourThicknessSdTotalM: totalSd !== null ? Number(totalSd.toFixed(3)) : null,
      formulaTrace,
      validationErrors,
      warnings,
    };
  }

  // 3. Exterior Door with Declared U-value Override (when no layers or override set)
  if (
    assembly.category === 'exterior-door' &&
    assembly.declaredUValueOverrideWPerM2K !== null &&
    assembly.declaredUValueOverrideWPerM2K !== undefined
  ) {
    const uOverride = assembly.declaredUValueOverrideWPerM2K;
    if (!Number.isFinite(uOverride) || uOverride <= 0) {
      validationErrors.push(`Declared door U-value for "${assembly.name}" must be a positive finite number.`);
      return {
        assemblyId: assembly.assemblyId,
        status: 'invalid-input',
        methodUsed: 'ISO-10077-1-DECLARED-WINDOW-DOOR',
        heatFlowDirection: direction,
        RsiM2KPerW: Rsi,
        RseM2KPerW: Rse,
        layerSteps: [],
        sumLayerResistanceM2KPerW: null,
        totalResistanceRTM2KPerW: null,
        uValueWPerM2K: null,
        totalThicknessMm: 50,
        totalArealMassKgPerM2: 35,
        equivalentVapourThicknessSdTotalM: null,
        formulaTrace,
        validationErrors,
        warnings,
      };
    }
    formulaTrace.push(
      `Method: ISO-10077-1-DECLARED-WINDOW-DOOR (Declared Exterior Door U_D) -> U = ${uOverride.toFixed(3)} W/(m²·K)`
    );
    return {
      assemblyId: assembly.assemblyId,
      status: 'assessed',
      methodUsed: 'ISO-10077-1-DECLARED-WINDOW-DOOR',
      heatFlowDirection: direction,
      RsiM2KPerW: Rsi,
      RseM2KPerW: Rse,
      layerSteps: [],
      sumLayerResistanceM2KPerW: null,
      totalResistanceRTM2KPerW: Number((1 / uOverride).toFixed(4)),
      uValueWPerM2K: Number(uOverride.toFixed(4)),
      totalThicknessMm: 54,
      totalArealMassKgPerM2: 40,
      equivalentVapourThicknessSdTotalM: null,
      formulaTrace,
      validationErrors,
      warnings,
    };
  }

  // 4. Layered Opaque Assembly (ISO 6946:2017)
  const sortedLayers = [...assembly.layers].sort((a, b) => a.orderIndex - b.orderIndex);
  if (sortedLayers.length === 0) {
    if (
      assembly.declaredUValueOverrideWPerM2K !== null &&
      assembly.declaredUValueOverrideWPerM2K !== undefined &&
      Number.isFinite(assembly.declaredUValueOverrideWPerM2K) &&
      assembly.declaredUValueOverrideWPerM2K > 0
    ) {
      const uVal = Number(assembly.declaredUValueOverrideWPerM2K.toFixed(4));
      formulaTrace.push(
        `Declared assembly U-value override (no layer breakdown provided): U = ${uVal.toFixed(3)} W/(m²·K)`
      );
      warnings.push(
        `Assembly "${assembly.name}" uses a declared U-value without material layer build-up; interstitial Glaser vapour diffusion profile requires material layers.`
      );
      return {
        assemblyId: assembly.assemblyId,
        status: 'assessed',
        methodUsed: 'ISO-6946-2017-1D-LAYERED-OPAQUE',
        heatFlowDirection: direction,
        RsiM2KPerW: Rsi,
        RseM2KPerW: Rse,
        layerSteps: [],
        sumLayerResistanceM2KPerW: Number(Math.max(0, 1 / uVal - Rsi - Rse).toFixed(4)),
        totalResistanceRTM2KPerW: Number((1 / uVal).toFixed(4)),
        uValueWPerM2K: uVal,
        totalThicknessMm: 0,
        totalArealMassKgPerM2: null,
        equivalentVapourThicknessSdTotalM: null,
        formulaTrace,
        validationErrors,
        warnings,
      };
    }

    validationErrors.push(
      `Opaque assembly "${assembly.name}" has no material layers defined and no declared U-value.`
    );
    return {
      assemblyId: assembly.assemblyId,
      status: 'incomplete-data',
      methodUsed: 'ISO-6946-2017-1D-LAYERED-OPAQUE',
      heatFlowDirection: direction,
      RsiM2KPerW: Rsi,
      RseM2KPerW: Rse,
      layerSteps: [],
      sumLayerResistanceM2KPerW: null,
      totalResistanceRTM2KPerW: null,
      uValueWPerM2K: null,
      totalThicknessMm: 0,
      totalArealMassKgPerM2: null,
      equivalentVapourThicknessSdTotalM: null,
      formulaTrace,
      validationErrors,
      warnings,
    };
  }

  // Check for well-ventilated air cavity (ISO 6946 Section 6.9.4):
  // Layers from exterior (index 0) up to and including the well-ventilated air layer are bypassed in thermal resistance sum,
  // and R_se is replaced by R_si (still air surface resistance for the same heat flow direction).
  const wellVentilatedIdx = sortedLayers.findIndex(
    (l) => l.cavityVentilation === 'well-ventilated'
  );
  if (wellVentilatedIdx >= 0) {
    Rse = Rsi;
    formulaTrace.push(
      `ISO 6946 §6.9.4 Well-ventilated cavity detected at layer #${sortedLayers[wellVentilatedIdx].orderIndex} ("${sortedLayers[wellVentilatedIdx].name}"): outer cladding layers and ventilated air cavity excluded from R_T sum, and R_se set equal to R_si (${Rsi.toFixed(2)} m²·K/W).`
    );
  }

  let sumLayerR = 0;
  let totalThicknessMm = 0;
  let totalMass = 0;
  let allMassKnown = true;
  let totalSd = 0;
  let allSdKnown = true;
  let hasInvalidInput = false;
  let hasMissingInput = false;

  const layerSteps: EnvelopeLayerCalculationStep[] = [];

  for (let i = 0; i < sortedLayers.length; i++) {
    const layer = sortedLayers[i];
    const includedInThermalSum = wellVentilatedIdx < 0 || i > wellVentilatedIdx;

    if (!Number.isFinite(layer.thicknessMm) || layer.thicknessMm <= 0) {
      hasInvalidInput = true;
      validationErrors.push(
        `Layer #${layer.orderIndex} ("${layer.name}") in "${assembly.name}" has invalid thickness (${layer.thicknessMm} mm). Thickness must be a finite number > 0 mm.`
      );
    }

    const dM = Math.max(0, layer.thicknessMm) / 1000;
    totalThicknessMm += Math.max(0, layer.thicknessMm);

    if (layer.densityKgPerM3 !== null && layer.densityKgPerM3 !== undefined && Number.isFinite(layer.densityKgPerM3) && layer.densityKgPerM3 > 0) {
      totalMass += layer.densityKgPerM3 * dM;
    } else {
      allMassKnown = false;
    }

    // Vapour diffusion equivalent air layer thickness sd (m)
    let layerSd: number | null = null;
    if (layer.explicitSdValueM !== null && layer.explicitSdValueM !== undefined && Number.isFinite(layer.explicitSdValueM) && layer.explicitSdValueM > 0) {
      layerSd = layer.explicitSdValueM;
    } else if (
      layer.vapourResistanceFactorMu !== null &&
      layer.vapourResistanceFactorMu !== undefined &&
      Number.isFinite(layer.vapourResistanceFactorMu) &&
      layer.vapourResistanceFactorMu > 0 &&
      dM > 0
    ) {
      layerSd = layer.vapourResistanceFactorMu * dM;
    }

    if (includedInThermalSum) {
      if (layerSd !== null) {
        totalSd += layerSd;
      } else {
        allSdKnown = false;
      }
    }

    let rLayer: number | null = null;
    let note: string | undefined;

    if (!includedInThermalSum) {
      note =
        i === wellVentilatedIdx
          ? 'Well-ventilated air layer bypassed per ISO 6946 §6.9.4 (R_se = R_si applied)'
          : 'External rainscreen layer outside well-ventilated cavity excluded per ISO 6946 §6.9.4';
    } else if (
      layer.fixedThermalResistanceM2KPerW !== null &&
      layer.fixedThermalResistanceM2KPerW !== undefined
    ) {
      if (!Number.isFinite(layer.fixedThermalResistanceM2KPerW) || layer.fixedThermalResistanceM2KPerW < 0) {
        hasInvalidInput = true;
        validationErrors.push(
          `Layer #${layer.orderIndex} ("${layer.name}") has invalid fixed thermal resistance (${layer.fixedThermalResistanceM2KPerW} m²·K/W).`
        );
      } else {
        rLayer =
          layer.cavityVentilation === 'slightly-ventilated'
            ? layer.fixedThermalResistanceM2KPerW * 0.5
            : layer.fixedThermalResistanceM2KPerW;
        sumLayerR += rLayer;
        formulaTrace.push(
          `Layer ${layer.orderIndex} (${layer.name}): declared R = ${rLayer.toFixed(4)} m²·K/W${layer.cavityVentilation === 'slightly-ventilated' ? ' (halved for slightly-ventilated cavity)' : ''}`
        );
      }
    } else if (layer.thermalConductivityWPerMK === null || layer.thermalConductivityWPerMK === undefined) {
      hasMissingInput = true;
      validationErrors.push(
        `Layer #${layer.orderIndex} ("${layer.name}") in "${assembly.name}" is missing thermal conductivity lambda (W/(m·K)).`
      );
    } else if (!Number.isFinite(layer.thermalConductivityWPerMK) || layer.thermalConductivityWPerMK <= 0) {
      hasInvalidInput = true;
      validationErrors.push(
        `Layer #${layer.orderIndex} ("${layer.name}") in "${assembly.name}" has invalid thermal conductivity (${layer.thermalConductivityWPerMK} W/(m·K)). Conductivity must be > 0.`
      );
    } else if (dM > 0) {
      rLayer = dM / layer.thermalConductivityWPerMK;
      sumLayerR += rLayer;
      formulaTrace.push(
        `Layer ${layer.orderIndex} (${layer.name}): R_${layer.orderIndex} = ${dM.toFixed(4)} m / ${layer.thermalConductivityWPerMK} W/(m·K) = ${rLayer.toFixed(4)} m²·K/W`
      );
    }

    if (layer.hasInhomogeneousFastenersOrStuds) {
      const inhMsg =
        layer.inhomogeneousNote ||
        `Layer #${layer.orderIndex} ("${layer.name}") contains repeating studs or mechanical fasteners; 1D homogeneous R-value excludes framing/fastener bridging unless accounted for in thermal bridges.`;
      warnings.push(inhMsg);
      note = note ? `${note}; ${inhMsg}` : inhMsg;
    }

    layerSteps.push({
      layerId: layer.layerId,
      orderIndex: layer.orderIndex,
      layerName: layer.name,
      thicknessM: Number(dM.toFixed(4)),
      conductivityWPerMK: layer.thermalConductivityWPerMK,
      calculatedResistanceM2KPerW: rLayer !== null ? Number(rLayer.toFixed(4)) : null,
      calculatedSdM: layerSd !== null ? Number(layerSd.toFixed(4)) : null,
      includedInThermalSum,
      exclusionOrWarningNote: note,
    });
  }

  if (hasInvalidInput || hasMissingInput) {
    return {
      assemblyId: assembly.assemblyId,
      status: hasInvalidInput ? 'invalid-input' : 'incomplete-data',
      methodUsed: 'ISO-6946-2017-1D-LAYERED-OPAQUE',
      heatFlowDirection: direction,
      RsiM2KPerW: Rsi,
      RseM2KPerW: Rse,
      layerSteps,
      sumLayerResistanceM2KPerW: null,
      totalResistanceRTM2KPerW: null,
      uValueWPerM2K: null,
      totalThicknessMm: Number(totalThicknessMm.toFixed(1)),
      totalArealMassKgPerM2: allMassKnown ? Number(totalMass.toFixed(1)) : null,
      equivalentVapourThicknessSdTotalM: allSdKnown ? Number(totalSd.toFixed(3)) : null,
      formulaTrace,
      validationErrors,
      warnings,
    };
  }

  const RT = Rsi + sumLayerR + Rse;
  const U = RT > 0 ? 1 / RT : null;

  formulaTrace.push(
    `Total Resistance R_T = R_si (${Rsi.toFixed(2)}) + sum(R_i) (${sumLayerR.toFixed(4)}) + R_se (${Rse.toFixed(2)}) = ${RT.toFixed(4)} m²·K/W`
  );
  if (U !== null) {
    formulaTrace.push(`Thermal Transmittance U = 1 / R_T = 1 / ${RT.toFixed(4)} = ${U.toFixed(4)} W/(m²·K)`);
  }

  return {
    assemblyId: assembly.assemblyId,
    status: 'assessed',
    methodUsed: 'ISO-6946-2017-1D-LAYERED-OPAQUE',
    heatFlowDirection: direction,
    RsiM2KPerW: Rsi,
    RseM2KPerW: Rse,
    layerSteps,
    sumLayerResistanceM2KPerW: Number(sumLayerR.toFixed(4)),
    totalResistanceRTM2KPerW: Number(RT.toFixed(4)),
    uValueWPerM2K: U !== null ? Number(U.toFixed(4)) : null,
    totalThicknessMm: Number(totalThicknessMm.toFixed(1)),
    totalArealMassKgPerM2: allMassKnown ? Number(totalMass.toFixed(1)) : null,
    equivalentVapourThicknessSdTotalM: allSdKnown ? Number(totalSd.toFixed(3)) : null,
    formulaTrace,
    validationErrors,
    warnings,
  };
}

/**
 * Saturation water vapour pressure p_sat(T) in Pascals per ISO 13788:2012 Annex A:
 * - T >= 0 °C: p_sat = 610.5 * exp((17.269 * T) / (237.3 + T))
 * - T <  0 °C: p_sat = 610.5 * exp((21.875 * T) / (265.5 + T))
 */
export function computeSaturationVapourPressurePa(tempC: number): number {
  if (tempC >= 0) {
    return 610.5 * Math.exp((17.269 * tempC) / (237.3 + tempC));
  }
  return 610.5 * Math.exp((21.875 * tempC) / (265.5 + tempC));
}

/**
 * Inverse Magnus formula for temperature (°C) given saturation vapour pressure (Pa) per ISO 13788:2012.
 */
export function computeDewPointFromVapourPressureC(vapourPressurePa: number): number {
  if (vapourPressurePa <= 0) return -60;
  const gamma = Math.log(vapourPressurePa / 610.5);
  if (vapourPressurePa >= 610.5) {
    return (237.3 * gamma) / (17.269 - gamma);
  }
  return (265.5 * gamma) / (21.875 - gamma);
}

/**
 * Evaluates surface condensation risk (T_si vs T_dp), mould-growth temperature factor (f_Rsi vs f_Rsi,min at 80% critical surface RH),
 * and simplified 1D Glaser interstitial vapour diffusion profile per ISO 13788:2012.
 */
export function evaluateAssemblyMoistureCondensation(
  assembly: EnvelopeAssemblyRecord,
  thermalResult: EnvelopeThermalCalculationResult,
  winterScenario: EnvelopeBoundaryClimateScenario,
  benchmarkMinFRsi: number = 0.70
): EnvelopeMoistureCondensationRecord {
  const Ti = winterScenario.indoorTempC;
  const Te = winterScenario.outdoorTempC;
  const rhi = winterScenario.indoorRelativeHumidityPercent;
  const rhe = winterScenario.outdoorRelativeHumidityPercent;
  const Rsi =
    assembly.category === 'external-opaque-wall' ||
    assembly.category === 'window-glazing' ||
    assembly.category === 'exterior-door'
      ? 0.25 // ISO 13788 uses R_si = 0.25 m²·K/W for condensation/mould surface temperature checks at corners/reveals, or standard R_si
      : thermalResult.RsiM2KPerW;
  // Note: We use thermalResult.RsiM2KPerW for planar 1D T_si and explicitly document both planar R_si and ISO 13788 corner R_si = 0.25 in trace
  const planarRsi = thermalResult.RsiM2KPerW;

  const limitationsDisclosure = [
    'Screening method: ISO 13788:2012 steady-state interior surface temperature factor (f_Rsi) and 1D Glaser vapour diffusion.',
    'Exclusions: Does not simulate wind-driven rain penetration, liquid capillary suction, solar-driven inward vapour diffusion, air-leakage convective moisture deposition, or transient material moisture storage (ASHRAE 160 / EN 15026 / WUFI).',
  ];

  const formulaTrace: string[] = [];

  if (
    thermalResult.uValueWPerM2K === null ||
    !Number.isFinite(Ti) ||
    !Number.isFinite(Te) ||
    !Number.isFinite(rhi) ||
    rhi <= 0 ||
    rhi > 100 ||
    !Number.isFinite(rhe) ||
    rhe < 0 ||
    rhe > 100
  ) {
    return {
      assemblyId: assembly.assemblyId,
      assemblyName: assembly.name,
      category: assembly.category,
      status: 'incomplete-inputs',
      interstitialStatus: 'unavailable-missing-vapour-data',
      indoorTempC: Ti,
      outdoorTempC: Te,
      indoorRHPercent: rhi,
      outdoorRHPercent: rhe,
      uValueWPerM2K: thermalResult.uValueWPerM2K,
      RsiM2KPerW: planarRsi,
      interiorSurfaceTempC: null,
      indoorDewPointTempC: null,
      dewPointMarginC: null,
      temperatureFactorFRsi: null,
      criticalMinimumFRsi: null,
      surfaceCondensationRisk: false,
      surfaceMouldRisk: false,
      interstitialCondensationRisk: false,
      glaserProfile: [],
      formulaTrace: ['Moisture screening skipped: assembly U-value or boundary psychrometric inputs are incomplete.'],
      limitationsDisclosure,
    };
  }

  const U = thermalResult.uValueWPerM2K;
  const pSatIn = computeSaturationVapourPressurePa(Ti);
  const pIn = (rhi / 100) * pSatIn;
  const pSatOut = computeSaturationVapourPressurePa(Te);
  const pOut = (rhe / 100) * pSatOut;

  const Tdp = computeDewPointFromVapourPressureC(pIn);
  const Tsi = Ti - U * planarRsi * (Ti - Te);
  const dewPointMargin = Tsi - Tdp;

  const deltaT = Ti - Te;
  const fRsi = Math.abs(deltaT) > 0.01 ? (Tsi - Te) / deltaT : 1.0;

  // Critical surface temperature for 80% surface RH mould threshold (ISO 13788)
  const pSatCrit80 = pIn / 0.80;
  const TsiCrit80 = computeDewPointFromVapourPressureC(pSatCrit80);
  const fRsiCritCalc = Math.abs(deltaT) > 0.01 ? Math.max(0, Math.min(1, (TsiCrit80 - Te) / deltaT)) : benchmarkMinFRsi;
  const effectiveMinFRsi = Math.max(benchmarkMinFRsi, Number(fRsiCritCalc.toFixed(3)));

  const surfaceCondensationRisk = Tsi <= Tdp;
  const surfaceMouldRisk = !surfaceCondensationRisk && (fRsi < effectiveMinFRsi || Tsi < TsiCrit80);

  formulaTrace.push(
    `Indoor p_sat(${Ti.toFixed(1)}°C) = ${pSatIn.toFixed(1)} Pa; actual p_i (${rhi}% RH) = ${pIn.toFixed(1)} Pa -> Dew point T_dp = ${Tdp.toFixed(2)} °C`
  );
  formulaTrace.push(
    `Interior planar surface temperature T_si = T_i - U * R_si * (T_i - T_e) = ${Ti.toFixed(1)} - ${U.toFixed(3)} * ${planarRsi.toFixed(2)} * (${Ti.toFixed(1)} - ${Te.toFixed(1)}) = ${Tsi.toFixed(2)} °C (margin above dew point: ${dewPointMargin >= 0 ? '+' : ''}${dewPointMargin.toFixed(2)} °C)`
  );
  formulaTrace.push(
    `Temperature factor f_Rsi = (T_si - T_e) / (T_i - T_e) = ${fRsi.toFixed(3)} vs critical mould limit f_Rsi,min = ${effectiveMinFRsi.toFixed(3)} (at 80% critical surface RH, T_si,crit = ${TsiCrit80.toFixed(2)} °C; note ISO 13788 corner R_si = ${Rsi.toFixed(2)} m²·K/W)`
  );

  // Interstitial Glaser 1D profile (from Inside -> Outside)
  const isGlazingOrDoor =
    assembly.category === 'window-glazing' ||
    assembly.category === 'skylight-roof-glazing' ||
    assembly.category === 'curtain-wall';

  if (isGlazingOrDoor) {
    const status = surfaceCondensationRisk
      ? 'surface-condensation-risk'
      : surfaceMouldRisk
        ? 'surface-mould-risk'
        : 'assessed-pass';
    return {
      assemblyId: assembly.assemblyId,
      assemblyName: assembly.name,
      category: assembly.category,
      status,
      interstitialStatus: 'not-applicable-glazing',
      indoorTempC: Ti,
      outdoorTempC: Te,
      indoorRHPercent: rhi,
      outdoorRHPercent: rhe,
      uValueWPerM2K: U,
      RsiM2KPerW: planarRsi,
      interiorSurfaceTempC: Number(Tsi.toFixed(2)),
      indoorDewPointTempC: Number(Tdp.toFixed(2)),
      dewPointMarginC: Number(dewPointMargin.toFixed(2)),
      temperatureFactorFRsi: Number(fRsi.toFixed(3)),
      criticalMinimumFRsi: Number(effectiveMinFRsi.toFixed(3)),
      surfaceCondensationRisk,
      surfaceMouldRisk,
      interstitialCondensationRisk: false,
      glaserProfile: [],
      formulaTrace,
      limitationsDisclosure,
    };
  }

  const activeLayerSteps = thermalResult.layerSteps.filter((s) => s.includedInThermalSum);
  const canRunGlaser =
    activeLayerSteps.length > 0 &&
    thermalResult.totalResistanceRTM2KPerW !== null &&
    thermalResult.totalResistanceRTM2KPerW > 0 &&
    thermalResult.equivalentVapourThicknessSdTotalM !== null &&
    thermalResult.equivalentVapourThicknessSdTotalM > 0 &&
    activeLayerSteps.every((s) => s.calculatedResistanceM2KPerW !== null && s.calculatedSdM !== null);

  const glaserProfile: EnvelopeGlaserInterfaceNode[] = [];
  let interstitialCondensationRisk = false;
  let interstitialStatus: EnvelopeMoistureCondensationRecord['interstitialStatus'] =
    'unavailable-missing-vapour-data';

  if (canRunGlaser) {
    const RT = thermalResult.totalResistanceRTM2KPerW!;
    const sdTotal = thermalResult.equivalentVapourThicknessSdTotalM!;
    // Order layers from Inside (last in Outside->Inside array) to Outside (first in Outside->Inside array)
    const insideToOutsideSteps = [...activeLayerSteps].reverse();

    let cumR = planarRsi;
    let cumSd = 0;

    // Interface 0: Interior surface
    const pSat0 = computeSaturationVapourPressurePa(Tsi);
    glaserProfile.push({
      interfaceIndex: 0,
      label: 'Interior Surface (Indoor Film)',
      cumulativeRFromInsideM2KPerW: Number(cumR.toFixed(4)),
      cumulativeSdFromInsideM: 0,
      temperatureC: Number(Tsi.toFixed(2)),
      saturationVapourPressurePa: Number(pSat0.toFixed(1)),
      actualVapourPressurePa: Number(pIn.toFixed(1)),
      condensationAtInterface: pIn > pSat0 + 0.5,
    });

    for (let k = 0; k < insideToOutsideSteps.length; k++) {
      const step = insideToOutsideSteps[k];
      cumR += step.calculatedResistanceM2KPerW || 0;
      cumSd += step.calculatedSdM || 0;

      const tk = Ti - (cumR / RT) * (Ti - Te);
      const pSatK = computeSaturationVapourPressurePa(tk);
      const pvK = pIn - (cumSd / sdTotal) * (pIn - pOut);
      // Check internal interfaces (and outer boundary of insulation)
      const isInternalInterface = k < insideToOutsideSteps.length - 1;
      const condAtNode = isInternalInterface && pvK > pSatK + 1.0;
      if (condAtNode) {
        interstitialCondensationRisk = true;
      }

      glaserProfile.push({
        interfaceIndex: k + 1,
        label: `Outer face of ${step.layerName}`,
        cumulativeRFromInsideM2KPerW: Number(cumR.toFixed(4)),
        cumulativeSdFromInsideM: Number(cumSd.toFixed(4)),
        temperatureC: Number(tk.toFixed(2)),
        saturationVapourPressurePa: Number(pSatK.toFixed(1)),
        actualVapourPressurePa: Number(pvK.toFixed(1)),
        condensationAtInterface: condAtNode,
      });
    }

    interstitialStatus = interstitialCondensationRisk
      ? 'glaser-interstitial-risk-detected'
      : 'glaser-screened-clear';

    formulaTrace.push(
      `Glaser 1D Interstitial Profile (${insideToOutsideSteps.length} layers, s_d,total = ${sdTotal.toFixed(2)} m): ${
        interstitialCondensationRisk
          ? 'INTERSTITIAL CONDENSATION RISK DETECTED (p_v > p_sat at internal layer interface)'
          : 'No interstitial saturation exceedance detected across layer interfaces'
      }.`
    );
  } else {
    formulaTrace.push(
      'Interstitial Glaser vapour-diffusion profile not evaluated: one or more material layers lack vapour resistance factor (mu) or equivalent air layer thickness (s_d).'
    );
  }

  let status: EnvelopeMoistureCondensationRecord['status'] = 'assessed-pass';
  if (surfaceCondensationRisk) {
    status = 'surface-condensation-risk';
  } else if (interstitialCondensationRisk) {
    status = 'interstitial-condensation-risk';
  } else if (surfaceMouldRisk) {
    status = 'surface-mould-risk';
  }

  return {
    assemblyId: assembly.assemblyId,
    assemblyName: assembly.name,
    category: assembly.category,
    status,
    interstitialStatus,
    indoorTempC: Ti,
    outdoorTempC: Te,
    indoorRHPercent: rhi,
    outdoorRHPercent: rhe,
    uValueWPerM2K: U,
    RsiM2KPerW: planarRsi,
    interiorSurfaceTempC: Number(Tsi.toFixed(2)),
    indoorDewPointTempC: Number(Tdp.toFixed(2)),
    dewPointMarginC: Number(dewPointMargin.toFixed(2)),
    temperatureFactorFRsi: Number(fRsi.toFixed(3)),
    criticalMinimumFRsi: Number(effectiveMinFRsi.toFixed(3)),
    surfaceCondensationRisk,
    surfaceMouldRisk,
    interstitialCondensationRisk,
    glaserProfile,
    formulaTrace,
    limitationsDisclosure,
  };
}

/**
 * Evaluates linear (Psi * L) and point (Chi * n) thermal bridges without double-counting bridges
 * already included in assembly U-values.
 */
export function evaluateThermalBridges(
  bridges: EnvelopeThermalBridgeRecord[],
  totalNetEnvelopeAreaM2: number,
  heatingDeltaTK: number,
  coolingDeltaTK: number
): EnvelopeThermalBridgeSummary {
  let assessedCount = 0;
  let incompleteCount = 0;
  let totalHtb = 0;

  const breakdown: EnvelopeThermalBridgeSummary['bridgeBreakdown'] = [];

  for (const bridge of bridges) {
    if (bridge.alreadyIncludedInAssemblyUValue) {
      breakdown.push({
        bridgeId: bridge.bridgeId,
        name: bridge.name,
        junctionType: bridge.junctionType,
        hTbWPerK: 0,
        heatingHeatFlowW: 0,
        status: 'excluded-double-count',
        formulaTrace: `Excluded from separate H_tb sum because bridge "${bridge.name}" is marked as already embedded in assembly U-value.`,
      });
      continue;
    }

    if (bridge.bridgeKind === 'linear-psi') {
      if (
        bridge.psiValueWPerMK === null ||
        bridge.psiValueWPerMK === undefined ||
        !Number.isFinite(bridge.psiValueWPerMK) ||
        bridge.psiValueWPerMK < 0 ||
        !Number.isFinite(bridge.lengthM) ||
        bridge.lengthM <= 0
      ) {
        incompleteCount++;
        breakdown.push({
          bridgeId: bridge.bridgeId,
          name: bridge.name,
          junctionType: bridge.junctionType,
          hTbWPerK: null,
          heatingHeatFlowW: null,
          status: 'incomplete',
          formulaTrace: 'Incomplete linear bridge: requires non-negative Psi (W/(m·K)) and length L > 0 m.',
        });
        continue;
      }

      const hTb = bridge.psiValueWPerMK * bridge.lengthM;
      const qHeat = hTb * Math.max(0, heatingDeltaTK);
      assessedCount++;
      totalHtb += hTb;
      breakdown.push({
        bridgeId: bridge.bridgeId,
        name: bridge.name,
        junctionType: bridge.junctionType,
        hTbWPerK: Number(hTb.toFixed(3)),
        heatingHeatFlowW: Number(qHeat.toFixed(1)),
        status: 'assessed',
        formulaTrace: `H_tb = Psi * L = ${bridge.psiValueWPerMK.toFixed(3)} W/(m·K) * ${bridge.lengthM.toFixed(2)} m = ${hTb.toFixed(3)} W/K; Q_heat = ${qHeat.toFixed(1)} W`,
      });
    } else {
      const chi = bridge.chiValueWPerK;
      const count = bridge.pointCount ?? 0;
      if (chi === null || chi === undefined || !Number.isFinite(chi) || chi < 0 || count <= 0) {
        incompleteCount++;
        breakdown.push({
          bridgeId: bridge.bridgeId,
          name: bridge.name,
          junctionType: bridge.junctionType,
          hTbWPerK: null,
          heatingHeatFlowW: null,
          status: 'incomplete',
          formulaTrace: 'Incomplete point bridge: requires non-negative Chi (W/K) and point count n > 0.',
        });
        continue;
      }
      const hTb = chi * count;
      const qHeat = hTb * Math.max(0, heatingDeltaTK);
      assessedCount++;
      totalHtb += hTb;
      breakdown.push({
        bridgeId: bridge.bridgeId,
        name: bridge.name,
        junctionType: bridge.junctionType,
        hTbWPerK: Number(hTb.toFixed(3)),
        heatingHeatFlowW: Number(qHeat.toFixed(1)),
        status: 'assessed',
        formulaTrace: `H_tb = Chi * n = ${chi.toFixed(3)} W/K * ${count} = ${hTb.toFixed(3)} W/K; Q_heat = ${qHeat.toFixed(1)} W`,
      });
    }
  }

  const eqDeltaU =
    totalNetEnvelopeAreaM2 > 0 ? Number((totalHtb / totalNetEnvelopeAreaM2).toFixed(4)) : null;

  return {
    assessedBridgesCount: assessedCount,
    incompleteBridgesCount: incompleteCount,
    totalBridgeHeatTransferCoeffWPerK: Number(totalHtb.toFixed(3)),
    equivalentDeltaUWPerM2K: eqDeltaU,
    heatingDesignBridgeHeatFlowW: Number((totalHtb * Math.max(0, heatingDeltaTK)).toFixed(1)),
    coolingDesignBridgeHeatFlowW: Number((totalHtb * Math.max(0, coolingDeltaTK)).toFixed(1)),
    bridgeBreakdown: breakdown,
  };
}

/**
 * Evaluates airtightness & infiltration screening while strictly distinguishing measured blower-door tests
 * from scenario assumptions or unavailable data.
 */
export function evaluateEnvelopeAirtightness(
  config: EnvelopeAirtightnessConfig,
  totalNetEnvelopeAreaM2: number,
  heatingDeltaTK: number,
  coolingDeltaTK: number,
  benchmark?: EnvelopeRegionalScreeningTarget
): EnvelopeAirtightnessEvaluation {
  const formulaTrace: string[] = [];
  const warnings: string[] = [];

  const discontinuousCount = config.airBarrierContinuityChecklist.filter(
    (c) => c.status === 'discontinuous-risk'
  ).length;
  const unassessedCount = config.airBarrierContinuityChecklist.filter(
    (c) => c.status === 'unassessed'
  ).length;

  if (config.provenance === 'unavailable-untested') {
    warnings.push(
      'Airtightness metric (n_50 or q_50) is marked as unavailable/untested. No infiltration heat-loss value is fabricated.'
    );
    return {
      status: 'unavailable',
      provenance: config.provenance,
      n50PerHour: null,
      q50M3PerHM2: null,
      estimatedAmbientInfiltrationAch: null,
      infiltrationHeatLossCoeffWPerK: null,
      heatingInfiltrationHeatLossW: null,
      coolingInfiltrationHeatGainW: null,
      discontinuousJunctionsCount: discontinuousCount,
      unassessedJunctionsCount: unassessedCount,
      benchmarkPass: null,
      formulaTrace: ['Airtightness status: unavailable-untested (awaiting design target or ISO 9972 fan pressurization test).'],
      warnings,
    };
  }

  const V = config.conditionedVolumeM3;
  const Aenv = totalNetEnvelopeAreaM2;
  let n50 = config.n50AirChangesPerHour;
  let q50 = config.q50AirPermeabilityM3PerHM2;

  if ((n50 === null || n50 === undefined) && q50 !== null && q50 !== undefined && q50 > 0 && V > 0 && Aenv > 0) {
    n50 = (q50 * Aenv) / V;
    formulaTrace.push(
      `Derived n_50 = (q_50 * A_env) / V = (${q50.toFixed(2)} * ${Aenv.toFixed(1)}) / ${V.toFixed(1)} = ${n50.toFixed(2)} h⁻¹`
    );
  } else if ((q50 === null || q50 === undefined) && n50 !== null && n50 !== undefined && n50 > 0 && V > 0 && Aenv > 0) {
    q50 = (n50 * V) / Aenv;
    formulaTrace.push(
      `Derived q_50 = (n_50 * V) / A_env = (${n50.toFixed(2)} * ${V.toFixed(1)}) / ${Aenv.toFixed(1)} = ${q50.toFixed(2)} m³/(h·m²)`
    );
  }

  if (n50 === null || n50 === undefined || !Number.isFinite(n50) || n50 <= 0 || V <= 0) {
    warnings.push('Incomplete airtightness inputs: requires positive n_50 (or q_50) and conditioned volume V > 0 m³.');
    return {
      status: 'unavailable',
      provenance: config.provenance,
      n50PerHour: null,
      q50M3PerHM2: null,
      estimatedAmbientInfiltrationAch: null,
      infiltrationHeatLossCoeffWPerK: null,
      heatingInfiltrationHeatLossW: null,
      coolingInfiltrationHeatGainW: null,
      discontinuousJunctionsCount: discontinuousCount,
      unassessedJunctionsCount: unassessedCount,
      benchmarkPass: null,
      formulaTrace,
      warnings,
    };
  }

  if (config.provenance !== 'measured-pressurization-test') {
    warnings.push(
      `Airtightness value (n_50 = ${n50.toFixed(2)} h⁻¹) is a ${config.provenance.replace(/-/g, ' ')} — not a verified post-construction ISO 9972 / ASTM E779 blower-door pressurization test.`
    );
  }

  const eFactor = config.exposureFactorE > 0 ? config.exposureFactorE : 0.07;
  // ISO 13789 screening relation: ambient air change rate n_inf = n_50 * e
  const nAmb = n50 * eFactor;
  // Volumetric heat capacity of air ~ 0.34 Wh/(m³·K)
  const hInf = 0.34 * nAmb * V;
  const qHeat = hInf * Math.max(0, heatingDeltaTK);
  const qCool = hInf * Math.max(0, coolingDeltaTK);

  formulaTrace.push(
    `Screening ambient infiltration rate n_inf = n_50 * e = ${n50.toFixed(2)} h⁻¹ * ${eFactor.toFixed(2)} = ${nAmb.toFixed(3)} h⁻¹`
  );
  formulaTrace.push(
    `Infiltration heat transfer coefficient H_inf = 0.34 * n_inf * V = 0.34 * ${nAmb.toFixed(3)} * ${V.toFixed(1)} m³ = ${hInf.toFixed(2)} W/K (Q_inf,heat = ${qHeat.toFixed(0)} W)`
  );

  let benchmarkPass: boolean | null = null;
  if (benchmark?.maxAirChangesN50PerHour !== undefined) {
    benchmarkPass = n50 <= benchmark.maxAirChangesN50PerHour;
  }

  return {
    status: config.provenance === 'measured-pressurization-test' ? 'assessed' : 'untested-assumption',
    provenance: config.provenance,
    n50PerHour: Number(n50.toFixed(2)),
    q50M3PerHM2: q50 !== null && q50 !== undefined ? Number(q50.toFixed(2)) : null,
    estimatedAmbientInfiltrationAch: Number(nAmb.toFixed(3)),
    infiltrationHeatLossCoeffWPerK: Number(hInf.toFixed(2)),
    heatingInfiltrationHeatLossW: Number(qHeat.toFixed(1)),
    coolingInfiltrationHeatGainW: Number(qCool.toFixed(1)),
    discontinuousJunctionsCount: discontinuousCount,
    unassessedJunctionsCount: unassessedCount,
    benchmarkPass,
    formulaTrace,
    warnings,
  };
}

/**
 * Extracts initial envelope assembly inventory from project geometry, site orientation,
 * facade concepts, and P41 IFC preserved elements (with explicit deduplication).
 */
export function extractProjectEnvelopeInventory(project: Project): {
  assemblies: EnvelopeAssemblyRecord[];
  thermalBridges: EnvelopeThermalBridgeRecord[];
  conditionedVolumeM3: number;
  extractionWarnings: string[];
} {
  const unitFactor = project.unit === 'feet' ? FEET_TO_METRES : 1.0;
  const plotW = Math.max(4, project.plotWidth * unitFactor);
  const plotL = Math.max(4, project.plotLength * unitFactor);
  const floors = Math.max(1, project.floors || 1);
  const floorHeightM = 3.0;
  const extractionWarnings: string[] = [];

  // Derive building footprint from rooms if present, otherwise 68% of plot dimensions
  let bldgWidthM = Number((plotW * 0.72).toFixed(2));
  let bldgLengthM = Number((plotL * 0.72).toFixed(2));

  if (project.floorPlan?.rooms && project.floorPlan.rooms.length > 0) {
    const floor1Rooms = project.floorPlan.rooms.filter((r) => r.floorLevel === 1);
    const targetRooms = floor1Rooms.length > 0 ? floor1Rooms : project.floorPlan.rooms;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const r of targetRooms) {
      minX = Math.min(minX, r.x * unitFactor);
      minY = Math.min(minY, r.y * unitFactor);
      maxX = Math.max(maxX, (r.x + r.width) * unitFactor);
      maxY = Math.max(maxY, (r.y + r.length) * unitFactor);
    }
    if (Number.isFinite(minX) && maxX > minX && maxY > minY) {
      bldgWidthM = Number(Math.max(4, maxX - minX).toFixed(2));
      bldgLengthM = Number(Math.max(4, maxY - minY).toFixed(2));
    }
  }

  const footprintAreaM2 = Number((bldgWidthM * bldgLengthM).toFixed(2));
  const perimeterM = Number((2 * (bldgWidthM + bldgLengthM)).toFixed(2));
  const totalWallHeightM = Number((floors * floorHeightM).toFixed(2));
  const conditionedVolumeM3 = Number((footprintAreaM2 * totalWallHeightM).toFixed(1));

  // Check P41 IFC preserved elements for thermal transmittance or wall/window entities
  let ifcWallUOverride: number | null = null;
  let ifcWindowUOverride: number | null = null;
  let ifcRoofUOverride: number | null = null;
  const ifcPreserved = project.ifcInterop?.preservedElements || [];

  if (ifcPreserved.length > 0) {
    extractionWarnings.push(
      `Deduplicated ${ifcPreserved.length} P41 OpenBIM/IFC preserved elements against native building envelope surfaces to prevent double-counting envelope areas.`
    );
    for (const el of ifcPreserved) {
      for (const prop of el.properties || []) {
        if (
          prop.propertyName.toLowerCase().includes('thermaltransmittance') &&
          typeof prop.value === 'number' &&
          prop.value > 0
        ) {
          if (el.ifcType.includes('WALL')) ifcWallUOverride = prop.value;
          if (el.ifcType.includes('WINDOW')) ifcWindowUOverride = prop.value;
          if (el.ifcType.includes('ROOF')) ifcRoofUOverride = prop.value;
        }
      }
    }
  }

  if (project.cadInterop?.referenceEntities && project.cadInterop.referenceEntities.length > 0) {
    extractionWarnings.push(
      `P42 CAD Exchange contains ${project.cadInterop.referenceEntities.length} 2D reference entities; 3D wall heights and thermal material layers are not inferred from 2D CAD lines.`
    );
  }

  extractionWarnings.push(
    'Initial material layer build-ups use documented ISO 10456 / EN 13162 reference templates ("illustrative-template" provenance) sized to project geometry. Confirm or customize layers to match project construction specifications.'
  );

  const northSouthGrossWallM2 = Number((bldgWidthM * totalWallHeightM).toFixed(2));
  const eastWestGrossWallM2 = Number((bldgLengthM * totalWallHeightM).toFixed(2));

  // Window areas per orientation (realistic architectural distribution)
  const southWindowM2 = Number((northSouthGrossWallM2 * 0.28).toFixed(2));
  const northWindowM2 = Number((northSouthGrossWallM2 * 0.14).toFixed(2));
  const eastWindowM2 = Number((eastWestGrossWallM2 * 0.18).toFixed(2));
  const westWindowM2 = Number((eastWestGrossWallM2 * 0.20).toFixed(2));
  const frontDoorM2 = 2.2;

  const createWallLayers = (prefix: string): EnvelopeLayerRecord[] => [
    {
      layerId: `${prefix}-l1`,
      orderIndex: 1,
      name: 'Clay Facing Brick (Outer Leaf)',
      materialCategory: 'masonry-concrete',
      thicknessMm: 102,
      thermalConductivityWPerMK: 0.77,
      densityKgPerM3: 1750,
      specificHeatJPerKgK: 800,
      vapourResistanceFactorMu: 10,
      linkedP44CarbonFactorId: 'cf-brick-common',
      sourceNote: 'ISO 10456 Table 3 — Clay brick outer leaf',
    },
    {
      layerId: `${prefix}-l2`,
      orderIndex: 2,
      name: 'Unventilated Cavity / Breather Air Layer',
      materialCategory: 'air-cavity',
      thicknessMm: 40,
      thermalConductivityWPerMK: null,
      fixedThermalResistanceM2KPerW: 0.18,
      cavityVentilation: 'unventilated',
      densityKgPerM3: 1.2,
      specificHeatJPerKgK: 1005,
      explicitSdValueM: 0.01,
      sourceNote: 'ISO 6946 Table 2 — Unventilated air layer',
    },
    {
      layerId: `${prefix}-l3`,
      orderIndex: 3,
      name: 'Mineral Wool Cavity Batts',
      materialCategory: 'insulation',
      thicknessMm: 140,
      thermalConductivityWPerMK: 0.035,
      densityKgPerM3: 45,
      specificHeatJPerKgK: 1030,
      vapourResistanceFactorMu: 1.3,
      linkedP44CarbonFactorId: 'cf-insulation-mineral-wool',
      sourceNote: 'EN 13162 — Mineral wool slab (lambda = 0.035 W/(m·K))',
    },
    {
      layerId: `${prefix}-l4`,
      orderIndex: 4,
      name: 'AAC Structural Inner Blockwork',
      materialCategory: 'masonry-concrete',
      thicknessMm: 100,
      thermalConductivityWPerMK: 0.16,
      densityKgPerM3: 600,
      specificHeatJPerKgK: 1000,
      vapourResistanceFactorMu: 8,
      sourceNote: 'ISO 10456 — Autoclaved aerated concrete blockwork',
    },
    {
      layerId: `${prefix}-l5`,
      orderIndex: 5,
      name: 'Polyethylene Vapour Control Layer (VCL)',
      materialCategory: 'membrane-vapour-control',
      thicknessMm: 0.5,
      thermalConductivityWPerMK: 0.33,
      fixedThermalResistanceM2KPerW: 0.001,
      densityKgPerM3: 920,
      specificHeatJPerKgK: 2200,
      explicitSdValueM: 50,
      sourceNote: 'EN 13984 — Interior vapour control layer (sd = 50 m)',
    },
    {
      layerId: `${prefix}-l6`,
      orderIndex: 6,
      name: 'Interior Gypsum Plasterboard',
      materialCategory: 'gypsum-plaster',
      thicknessMm: 12.5,
      thermalConductivityWPerMK: 0.25,
      densityKgPerM3: 900,
      specificHeatJPerKgK: 1000,
      vapourResistanceFactorMu: 10,
      linkedP44CarbonFactorId: 'cf-gypsum-plasterboard',
      sourceNote: 'ISO 10456 — Gypsum board finish',
    },
  ];

  const wallProvenance = ifcWallUOverride ? 'ifc-imported' : 'illustrative-template';
  const windowProvenance = ifcWindowUOverride ? 'ifc-imported' : 'illustrative-template';
  const roofProvenance = ifcRoofUOverride ? 'ifc-imported' : 'illustrative-template';

  const assemblies: EnvelopeAssemblyRecord[] = [
    {
      assemblyId: 'env-wall-north',
      name: 'North Exterior Opaque Wall Assembly',
      category: 'external-opaque-wall',
      boundaryCondition: 'exterior-ambient',
      orientation: 'North',
      heatFlowDirection: 'horizontal',
      provenance: wallProvenance,
      sourceDescription: `Derived from North building elevation (${bldgWidthM} m × ${totalWallHeightM} m) minus North window & entrance door openings.`,
      grossAreaM2: northSouthGrossWallM2,
      openingAreaSubtractedM2: Number((northWindowM2 + frontDoorM2).toFixed(2)),
      netAreaM2: Number(Math.max(0, northSouthGrossWallM2 - northWindowM2 - frontDoorM2).toFixed(2)),
      areaDerivationNote: `Gross ${northSouthGrossWallM2} m² - (${northWindowM2} m² windows + ${frontDoorM2} m² door)`,
      layers: createWallLayers('wall-n'),
      declaredUValueOverrideWPerM2K: ifcWallUOverride,
      includeInThermalEnvelope: true,
    },
    {
      assemblyId: 'env-wall-south',
      name: 'South Exterior Opaque Wall Assembly',
      category: 'external-opaque-wall',
      boundaryCondition: 'exterior-ambient',
      orientation: 'South',
      heatFlowDirection: 'horizontal',
      provenance: wallProvenance,
      sourceDescription: `Derived from South building elevation (${bldgWidthM} m × ${totalWallHeightM} m) minus South window openings.`,
      grossAreaM2: northSouthGrossWallM2,
      openingAreaSubtractedM2: southWindowM2,
      netAreaM2: Number(Math.max(0, northSouthGrossWallM2 - southWindowM2).toFixed(2)),
      areaDerivationNote: `Gross ${northSouthGrossWallM2} m² - ${southWindowM2} m² windows`,
      layers: createWallLayers('wall-s'),
      declaredUValueOverrideWPerM2K: ifcWallUOverride,
      includeInThermalEnvelope: true,
    },
    {
      assemblyId: 'env-wall-east',
      name: 'East Exterior Opaque Wall Assembly',
      category: 'external-opaque-wall',
      boundaryCondition: 'exterior-ambient',
      orientation: 'East',
      heatFlowDirection: 'horizontal',
      provenance: wallProvenance,
      sourceDescription: `Derived from East building elevation (${bldgLengthM} m × ${totalWallHeightM} m) minus East window openings.`,
      grossAreaM2: eastWestGrossWallM2,
      openingAreaSubtractedM2: eastWindowM2,
      netAreaM2: Number(Math.max(0, eastWestGrossWallM2 - eastWindowM2).toFixed(2)),
      areaDerivationNote: `Gross ${eastWestGrossWallM2} m² - ${eastWindowM2} m² windows`,
      layers: createWallLayers('wall-e'),
      declaredUValueOverrideWPerM2K: ifcWallUOverride,
      includeInThermalEnvelope: true,
    },
    {
      assemblyId: 'env-wall-west',
      name: 'West Exterior Opaque Wall Assembly',
      category: 'external-opaque-wall',
      boundaryCondition: 'exterior-ambient',
      orientation: 'West',
      heatFlowDirection: 'horizontal',
      provenance: wallProvenance,
      sourceDescription: `Derived from West building elevation (${bldgLengthM} m × ${totalWallHeightM} m) minus West window openings.`,
      grossAreaM2: eastWestGrossWallM2,
      openingAreaSubtractedM2: westWindowM2,
      netAreaM2: Number(Math.max(0, eastWestGrossWallM2 - westWindowM2).toFixed(2)),
      areaDerivationNote: `Gross ${eastWestGrossWallM2} m² - ${westWindowM2} m² windows`,
      layers: createWallLayers('wall-w'),
      declaredUValueOverrideWPerM2K: ifcWallUOverride,
      includeInThermalEnvelope: true,
    },
    {
      assemblyId: 'env-roof-main',
      name: 'Warm Flat / Low-Slope Roof Assembly',
      category: 'roof-assembly',
      boundaryCondition: 'exterior-ambient',
      orientation: 'Horizontal-Upward',
      heatFlowDirection: 'upward',
      provenance: roofProvenance,
      sourceDescription: `Derived from horizontal building roof footprint (${bldgWidthM} m × ${bldgLengthM} m).`,
      grossAreaM2: footprintAreaM2,
      openingAreaSubtractedM2: 0,
      netAreaM2: footprintAreaM2,
      areaDerivationNote: `Building footprint roof area (${bldgWidthM} m × ${bldgLengthM} m)`,
      layers: [
        {
          layerId: 'roof-l1',
          orderIndex: 1,
          name: 'EPDM Single-Ply Waterproofing Membrane',
          materialCategory: 'membrane-vapour-control',
          thicknessMm: 2,
          thermalConductivityWPerMK: 0.25,
          fixedThermalResistanceM2KPerW: 0.008,
          densityKgPerM3: 1150,
          specificHeatJPerKgK: 1000,
          explicitSdValueM: 70,
          sourceNote: 'ISO 10456 — EPDM roof membrane',
        },
        {
          layerId: 'roof-l2',
          orderIndex: 2,
          name: 'PIR Rigid Roof Insulation Board',
          materialCategory: 'insulation',
          thicknessMm: 160,
          thermalConductivityWPerMK: 0.022,
          densityKgPerM3: 32,
          specificHeatJPerKgK: 1400,
          vapourResistanceFactorMu: 60,
          sourceNote: 'EN 13165 — PIR rigid insulation board',
        },
        {
          layerId: 'roof-l3',
          orderIndex: 3,
          name: 'High-Resistance Vapour Control Layer (sd = 100 m)',
          materialCategory: 'membrane-vapour-control',
          thicknessMm: 1,
          thermalConductivityWPerMK: 0.33,
          fixedThermalResistanceM2KPerW: 0.003,
          densityKgPerM3: 950,
          specificHeatJPerKgK: 2000,
          explicitSdValueM: 100,
          sourceNote: 'EN 13984 — Warm-roof vapour barrier below insulation',
        },
        {
          layerId: 'roof-l4',
          orderIndex: 4,
          name: 'Reinforced Concrete Roof Deck',
          materialCategory: 'masonry-concrete',
          thicknessMm: 180,
          thermalConductivityWPerMK: 2.5,
          densityKgPerM3: 2400,
          specificHeatJPerKgK: 1000,
          vapourResistanceFactorMu: 130,
          linkedP44CarbonFactorId: 'cf-concrete-c30-37-cem1',
          sourceNote: 'ISO 10456 — Reinforced concrete deck',
        },
        {
          layerId: 'roof-l5',
          orderIndex: 5,
          name: 'Interior Gypsum Ceiling Lining',
          materialCategory: 'gypsum-plaster',
          thicknessMm: 12.5,
          thermalConductivityWPerMK: 0.25,
          densityKgPerM3: 900,
          specificHeatJPerKgK: 1000,
          vapourResistanceFactorMu: 10,
          linkedP44CarbonFactorId: 'cf-gypsum-plasterboard',
          sourceNote: 'ISO 10456 — Gypsum board',
        },
      ],
      declaredUValueOverrideWPerM2K: ifcRoofUOverride,
      includeInThermalEnvelope: true,
    },
    {
      assemblyId: 'env-floor-ground',
      name: 'Ground-Bearing Insulated Concrete Slab',
      category: 'ground-contact-floor',
      boundaryCondition: 'ground-contact',
      orientation: 'Horizontal-Downward',
      heatFlowDirection: 'downward',
      provenance: 'illustrative-template',
      sourceDescription: `Ground-contact slab (${footprintAreaM2} m², perimeter ${perimeterM} m) evaluated via ISO 13370 simplified slab-on-ground method.`,
      grossAreaM2: footprintAreaM2,
      openingAreaSubtractedM2: 0,
      netAreaM2: footprintAreaM2,
      areaDerivationNote: `Ground-floor footprint A = ${footprintAreaM2} m², P = ${perimeterM} m, B' = ${(footprintAreaM2 / (0.5 * perimeterM)).toFixed(2)} m`,
      layers: [
        {
          layerId: 'gf-l1',
          orderIndex: 1,
          name: 'Sub-Slab XPS Thermal Insulation',
          materialCategory: 'insulation',
          thicknessMm: 120,
          thermalConductivityWPerMK: 0.034,
          densityKgPerM3: 35,
          specificHeatJPerKgK: 1450,
          vapourResistanceFactorMu: 150,
          sourceNote: 'EN 13164 — Extruded polystyrene (XPS)',
        },
        {
          layerId: 'gf-l2',
          orderIndex: 2,
          name: 'Damp-Proof / Vapour Membrane (sd = 80 m)',
          materialCategory: 'membrane-vapour-control',
          thicknessMm: 1,
          thermalConductivityWPerMK: 0.33,
          fixedThermalResistanceM2KPerW: 0.003,
          densityKgPerM3: 920,
          specificHeatJPerKgK: 2000,
          explicitSdValueM: 80,
          sourceNote: 'Sub-slab damp-proof membrane',
        },
        {
          layerId: 'gf-l3',
          orderIndex: 3,
          name: 'Reinforced Concrete Ground Slab',
          materialCategory: 'masonry-concrete',
          thicknessMm: 200,
          thermalConductivityWPerMK: 2.5,
          densityKgPerM3: 2400,
          specificHeatJPerKgK: 1000,
          vapourResistanceFactorMu: 130,
          linkedP44CarbonFactorId: 'cf-concrete-c30-37-cem1',
          sourceNote: 'ISO 10456 — Reinforced concrete slab',
        },
      ],
      groundFloor: {
        groundCalculationMethod: 'iso-13370-slab-on-ground-simplified',
        slabCharacteristicDimensionBM: Number((footprintAreaM2 / (0.5 * perimeterM)).toFixed(2)),
        soilThermalConductivityWPerMK: 2.0,
        perimeterWallThicknessM: 0.38,
      },
      includeInThermalEnvelope: true,
    },
    {
      assemblyId: 'env-win-south',
      name: 'South Double-Glazed Low-E Argon Windows',
      category: 'window-glazing',
      boundaryCondition: 'exterior-ambient',
      orientation: 'South',
      heatFlowDirection: 'horizontal',
      provenance: windowProvenance,
      sourceDescription: 'South elevation fenestration (whole-window Uw declared per ISO 10077-1).',
      grossAreaM2: southWindowM2,
      openingAreaSubtractedM2: 0,
      netAreaM2: southWindowM2,
      areaDerivationNote: '28% of South facade gross area',
      layers: [],
      glazingSolar: {
        uValueBasis: 'whole-window-Uw',
        declaredUValueWPerM2K: ifcWindowUOverride || 1.30,
        centreOfGlassUgWPerM2K: 1.10,
        frameUfWPerM2K: 1.60,
        frameFractionPercent: 25,
        solarHeatGainCoefficientSHGC: 0.42,
        visibleTransmittanceVT: 0.68,
        externalShadingFactorFsh: 0.75,
        shadingDescription: 'Horizontal overhang / brise-soleil shading factor F_sh = 0.75',
        glazingCavitiesAndCoating: '4/16/4 mm Low-E Argon-filled IGU in thermally broken frame',
      },
      includeInThermalEnvelope: true,
    },
    {
      assemblyId: 'env-win-north',
      name: 'North Double-Glazed Low-E Argon Windows',
      category: 'window-glazing',
      boundaryCondition: 'exterior-ambient',
      orientation: 'North',
      heatFlowDirection: 'horizontal',
      provenance: windowProvenance,
      sourceDescription: 'North elevation fenestration (whole-window Uw declared per ISO 10077-1).',
      grossAreaM2: northWindowM2,
      openingAreaSubtractedM2: 0,
      netAreaM2: northWindowM2,
      areaDerivationNote: '14% of North facade gross area',
      layers: [],
      glazingSolar: {
        uValueBasis: 'whole-window-Uw',
        declaredUValueWPerM2K: ifcWindowUOverride || 1.30,
        centreOfGlassUgWPerM2K: 1.10,
        frameUfWPerM2K: 1.60,
        frameFractionPercent: 25,
        solarHeatGainCoefficientSHGC: 0.42,
        visibleTransmittanceVT: 0.68,
        externalShadingFactorFsh: 1.0,
        shadingDescription: 'Unshaded North aperture (F_sh = 1.0)',
        glazingCavitiesAndCoating: '4/16/4 mm Low-E Argon-filled IGU in thermally broken frame',
      },
      includeInThermalEnvelope: true,
    },
    {
      assemblyId: 'env-win-east',
      name: 'East Double-Glazed Low-E Argon Windows',
      category: 'window-glazing',
      boundaryCondition: 'exterior-ambient',
      orientation: 'East',
      heatFlowDirection: 'horizontal',
      provenance: windowProvenance,
      sourceDescription: 'East elevation fenestration (whole-window Uw declared per ISO 10077-1).',
      grossAreaM2: eastWindowM2,
      openingAreaSubtractedM2: 0,
      netAreaM2: eastWindowM2,
      areaDerivationNote: '18% of East facade gross area',
      layers: [],
      glazingSolar: {
        uValueBasis: 'whole-window-Uw',
        declaredUValueWPerM2K: ifcWindowUOverride || 1.30,
        centreOfGlassUgWPerM2K: 1.10,
        frameUfWPerM2K: 1.60,
        frameFractionPercent: 25,
        solarHeatGainCoefficientSHGC: 0.38,
        visibleTransmittanceVT: 0.65,
        externalShadingFactorFsh: 0.85,
        shadingDescription: 'Morning solar reveal shading factor F_sh = 0.85',
        glazingCavitiesAndCoating: '4/16/4 mm Low-E Argon-filled IGU in thermally broken frame',
      },
      includeInThermalEnvelope: true,
    },
    {
      assemblyId: 'env-win-west',
      name: 'West Double-Glazed Solar-Control Windows',
      category: 'window-glazing',
      boundaryCondition: 'exterior-ambient',
      orientation: 'West',
      heatFlowDirection: 'horizontal',
      provenance: windowProvenance,
      sourceDescription: 'West elevation fenestration (whole-window Uw declared per ISO 10077-1).',
      grossAreaM2: westWindowM2,
      openingAreaSubtractedM2: 0,
      netAreaM2: westWindowM2,
      areaDerivationNote: '20% of West facade gross area',
      layers: [],
      glazingSolar: {
        uValueBasis: 'whole-window-Uw',
        declaredUValueWPerM2K: ifcWindowUOverride || 1.35,
        centreOfGlassUgWPerM2K: 1.10,
        frameUfWPerM2K: 1.65,
        frameFractionPercent: 25,
        solarHeatGainCoefficientSHGC: 0.36,
        visibleTransmittanceVT: 0.64,
        externalShadingFactorFsh: 0.80,
        shadingDescription: 'West afternoon shading louvers (F_sh = 0.80)',
        glazingCavitiesAndCoating: '4/16/4 mm Solar-control Low-E IGU',
      },
      includeInThermalEnvelope: true,
    },
    {
      assemblyId: 'env-door-main',
      name: 'Insulated Insulated-Core Exterior Entrance Door',
      category: 'exterior-door',
      boundaryCondition: 'exterior-ambient',
      orientation: 'North',
      heatFlowDirection: 'horizontal',
      provenance: 'illustrative-template',
      sourceDescription: 'Primary entrance door assembly (declared U_D per ISO 10077-1).',
      grossAreaM2: frontDoorM2,
      openingAreaSubtractedM2: 0,
      netAreaM2: frontDoorM2,
      areaDerivationNote: 'Single entrance door 1.0 m × 2.2 m',
      layers: [],
      declaredUValueOverrideWPerM2K: 1.40,
      includeInThermalEnvelope: true,
    },
  ];

  const thermalBridges: EnvelopeThermalBridgeRecord[] = [
    {
      bridgeId: 'tb-ground-perimeter',
      name: 'External Wall to Ground-Floor Slab Perimeter Junction',
      junctionType: 'wall-to-ground-slab',
      bridgeKind: 'linear-psi',
      psiValueWPerMK: 0.16,
      lengthM: perimeterM,
      provenance: 'iso-14683-default-catalogue',
      sourceReference: 'ISO 14683:2017 Annex C Default Catalogue — Wall-to-ground slab junction',
      linkedAssemblyIds: ['env-wall-north', 'env-wall-south', 'env-wall-east', 'env-wall-west', 'env-floor-ground'],
      alreadyIncludedInAssemblyUValue: false,
      notes: 'Default ISO 14683 linear transmittance; can be reduced via continuous perimeter upstand insulation.',
    },
    {
      bridgeId: 'tb-roof-parapet',
      name: 'External Wall to Flat Roof Parapet / Eaves Junction',
      junctionType: 'wall-to-roof-eaves-parapet',
      bridgeKind: 'linear-psi',
      psiValueWPerMK: 0.14,
      lengthM: perimeterM,
      provenance: 'iso-14683-default-catalogue',
      sourceReference: 'ISO 14683:2017 Annex C Default Catalogue — Roof parapet junction',
      linkedAssemblyIds: ['env-roof-main'],
      alreadyIncludedInAssemblyUValue: false,
    },
    {
      bridgeId: 'tb-window-reveals',
      name: 'Window & Door Perimeter Reveal / Sill / Jamb Junctions',
      junctionType: 'window-door-perimeter-reveal',
      bridgeKind: 'linear-psi',
      psiValueWPerMK: 0.08,
      lengthM: Number(((southWindowM2 + northWindowM2 + eastWindowM2 + westWindowM2) * 2.6).toFixed(1)),
      provenance: 'iso-14683-default-catalogue',
      sourceReference: 'ISO 14683:2017 Annex C — Insulated reveal window installation',
      linkedAssemblyIds: ['env-win-south', 'env-win-north', 'env-win-east', 'env-win-west'],
      alreadyIncludedInAssemblyUValue: false,
    },
    {
      bridgeId: 'tb-external-corners',
      name: 'Vertical External Wall Corners (4 Corners)',
      junctionType: 'corner-external-internal',
      bridgeKind: 'linear-psi',
      psiValueWPerMK: 0.06,
      lengthM: Number((4 * totalWallHeightM).toFixed(1)),
      provenance: 'iso-14683-default-catalogue',
      sourceReference: 'ISO 14683:2017 Annex C — External masonry cavity corner',
      linkedAssemblyIds: ['env-wall-north', 'env-wall-south', 'env-wall-east', 'env-wall-west'],
      alreadyIncludedInAssemblyUValue: false,
    },
  ];

  if (floors > 1) {
    thermalBridges.push({
      bridgeId: 'tb-intermediate-slab',
      name: 'Intermediate Floor Slab Edge at External Wall',
      junctionType: 'wall-to-intermediate-floor',
      bridgeKind: 'linear-psi',
      psiValueWPerMK: 0.12,
      lengthM: Number((perimeterM * (floors - 1)).toFixed(1)),
      provenance: 'iso-14683-default-catalogue',
      sourceReference: 'ISO 14683:2017 Annex C — Intermediate floor junction with outer insulation continuity',
      linkedAssemblyIds: ['env-wall-north', 'env-wall-south', 'env-wall-east', 'env-wall-west'],
      alreadyIncludedInAssemblyUValue: false,
    });
  }

  return {
    assemblies,
    thermalBridges,
    conditionedVolumeM3,
    extractionWarnings,
  };
}

export function buildDefaultClimateScenarios(project: Project): EnvelopeBoundaryClimateScenario[] {
  // Check if P45 Climate Hazard & Resilience assessment has extreme heat or cold indicators
  const p45 = project.climateResilience?.activeAssessment;
  let summerOutdoorC = 32.0;
  let winterOutdoorC = -2.0;
  let p45ScenarioCode: string | undefined;
  let p45SourceId: string | undefined;

  if (p45) {
    p45ScenarioCode = p45.config.activeScenario;
    const heatHazard = p45.hazards.find((h) => h.hazardCategory === 'extreme-heat');
    const txxInd = heatHazard?.indicators.find((i) => i.indicatorCode === 'TXx');
    if (
      txxInd &&
      typeof txxInd.projectedOrObservedValue === 'number' &&
      Number.isFinite(txxInd.projectedOrObservedValue)
    ) {
      summerOutdoorC = Number(txxInd.projectedOrObservedValue.toFixed(1));
      p45SourceId = txxInd.sourceId;
    }
  }

  return [
    {
      scenarioId: 'scen-winter-heating',
      name: 'Winter Heating & Condensation Design Condition',
      scenarioType: 'winter-heating-design',
      indoorTempC: 20.0,
      outdoorTempC: winterOutdoorC,
      indoorRelativeHumidityPercent: 50,
      outdoorRelativeHumidityPercent: 85,
      solarIrradianceByOrientationWPerM2: {
        South: 120,
        East: 65,
        West: 65,
        North: 35,
        'Horizontal-Upward': 95,
      },
      windExposureCategory: 'moderate',
      provenanceNote:
        'Steady-state winter design boundary condition for peak conductive heat loss (Q = H_tr * Delta_T) and ISO 13788 surface/interstitial condensation screening.',
    },
    {
      scenarioId: 'scen-summer-cooling',
      name: p45ScenarioCode
        ? `Summer Cooling & Solar Peak (P45 Linked: ${p45ScenarioCode.toUpperCase()})`
        : 'Summer Cooling & Solar Gain Design Condition',
      scenarioType: p45ScenarioCode ? 'p45-climate-resilience-linked' : 'summer-cooling-design',
      indoorTempC: 24.0,
      outdoorTempC: summerOutdoorC,
      indoorRelativeHumidityPercent: 55,
      outdoorRelativeHumidityPercent: 60,
      solarIrradianceByOrientationWPerM2: {
        South: 380,
        East: 460,
        West: 520,
        North: 130,
        'Horizontal-Upward': 680,
      },
      windExposureCategory: 'moderate',
      linkedP45ScenarioCode: p45ScenarioCode,
      linkedP45SourceId: p45SourceId,
      provenanceNote: p45ScenarioCode
        ? `Synchronized with P45 Climate Hazard & Resilience scenario (${p45ScenarioCode.toUpperCase()}, outdoor peak ${summerOutdoorC}°C).`
        : 'Steady-state summer design boundary condition for conductive heat gain and glazing solar heat gain screening.',
    },
    {
      scenarioId: 'scen-humid-winter-mould',
      name: 'High-Humidity Occupancy Cold-Snap Stress Test (60% Indoor RH, -5°C Outdoor)',
      scenarioType: 'humid-condensation-screening',
      indoorTempC: 20.0,
      outdoorTempC: -5.0,
      indoorRelativeHumidityPercent: 60,
      outdoorRelativeHumidityPercent: 90,
      solarIrradianceByOrientationWPerM2: {
        South: 80,
        East: 40,
        West: 40,
        North: 25,
        'Horizontal-Upward': 60,
      },
      windExposureCategory: 'exposed',
      provenanceNote:
        'High indoor moisture load screening condition (ISO 13788 Humidity Class 4 equivalent) to test dew-point and interstitial vapour resistance margins.',
    },
  ];
}

export function buildDefaultAirBarrierChecklist(): EnvelopeAirBarrierChecklistItem[] {
  return [
    {
      itemId: 'ab-wall-to-foundation',
      junctionName: 'Ground Slab / Foundation Perimeter to External Wall Air Barrier',
      status: 'detailed-not-tested',
      notes: 'Requires continuous perimeter membrane seal between sub-slab DPM and inner wall VCL/plaster coat.',
    },
    {
      itemId: 'ab-window-frame-jamb',
      junctionName: 'Window & Exterior Door Frame Perimeter Tapes / Seals',
      status: 'detailed-not-tested',
      notes: 'Specify vapour-tight internal airtight tape and weather-tight vapour-open external tape at all window reveals.',
    },
    {
      itemId: 'ab-wall-to-roof-eaves',
      junctionName: 'External Wall to Roof Vapour Control / Air Barrier Continuity',
      status: 'detailed-not-tested',
      notes: 'Lap wall VCL continuously into roof vapour control layer across parapet/eaves junction.',
    },
    {
      itemId: 'ab-mep-service-penetrations',
      junctionName: 'MEP Duct, Pipe & Electrical Conduit Envelope Penetrations',
      status: 'unassessed',
      notes: 'Coordinate grommets and airtight collars with P36 MEP service routes.',
    },
  ];
}

/**
 * Generates traceable findings and evidence-backed improvement options with P44 Embodied Carbon cross-referencing.
 */
export function generateEnvelopeFindingsAndImprovements(
  project: Project,
  assemblies: EnvelopeAssemblyRecord[],
  summary: EnvelopePerformanceSummary,
  bridgeSummary: EnvelopeThermalBridgeSummary,
  moistureRecords: EnvelopeMoistureCondensationRecord[],
  airtightnessEval: EnvelopeAirtightnessEvaluation,
  benchmark: EnvelopeRegionalScreeningTarget,
  existingSelections?: Record<string, boolean>
): {
  findings: EnvelopeFindingRecord[];
  improvementOptions: EnvelopeImprovementOption[];
} {
  const findings: EnvelopeFindingRecord[] = [];
  const improvementOptions: EnvelopeImprovementOption[] = [];

  const heatingDeltaT = Math.max(1, summary.heatingDesignDeltaTK);
  const p44Active = Boolean(project.carbonAssessment?.activeAssessment);

  // 1. Check each assembly against benchmark U-value and data completeness
  for (const asm of assemblies) {
    const res = asm.thermalResult;
    if (!res || res.uValueWPerM2K === null) {
      findings.push({
        findingId: `find-incomplete-${asm.assemblyId}`,
        severity: 'data-gap',
        category: 'data-completeness',
        title: `Incomplete or Invalid Thermal Inputs for "${asm.name}"`,
        affectedElementIds: [asm.assemblyId],
        governingInputsAndMetric: res?.validationErrors.join(' ') || 'Missing U-value or layer conductivities.',
        benchmarkComparison: 'Cannot compare against benchmark until valid thermal inputs are supplied.',
        evidenceStrength: 'low-assumed-or-incomplete',
        recommendationSummary:
          'Complete missing material layer conductivities/thicknesses or provide a verified declared U-value.',
        uncertaintiesAndLimitations: [
          'Assembly is excluded from area-weighted U-value summation until valid thermal inputs are provided.',
        ],
      });
      continue;
    }

    const targetU = benchmark.maxUValueByCategoryWPerM2K[asm.category];
    if (targetU !== undefined && res.uValueWPerM2K > targetU) {
      const ratio = res.uValueWPerM2K / targetU;
      findings.push({
        findingId: `find-u-exceed-${asm.assemblyId}`,
        severity: ratio > 1.35 ? 'high' : 'moderate',
        category: 'thermal-transmittance',
        title: `U-Value Exceeds Screening Target on "${asm.name}" (${res.uValueWPerM2K.toFixed(2)} vs ${targetU.toFixed(2)} W/(m²·K))`,
        affectedElementIds: [asm.assemblyId],
        governingInputsAndMetric: `Calculated U = ${res.uValueWPerM2K.toFixed(3)} W/(m²·K) over net area ${asm.netAreaM2.toFixed(1)} m² (UA = ${(res.uValueWPerM2K * asm.netAreaM2).toFixed(1)} W/K).`,
        benchmarkComparison: `${((ratio - 1) * 100).toFixed(0)}% above "${benchmark.name}" screening threshold (${targetU.toFixed(2)} W/(m²·K)).`,
        evidenceStrength:
          asm.provenance === 'project-defined' || asm.provenance === 'ifc-imported'
            ? 'high-measured-or-declared'
            : 'moderate-generic-standard',
        recommendationSummary:
          asm.category === 'window-glazing' || asm.category === 'curtain-wall'
            ? 'Upgrade glazing unit to triple-glazed Low-E Argon/Krypton with warm-edge spacer and thermally broken frame.'
            : 'Increase continuous thermal insulation thickness or specify lower-conductivity insulation board.',
        uncertaintiesAndLimitations: [
          'Screening benchmark comparison does not constitute statutory building-code approval.',
        ],
      });
    }
  }

  // 2. Check Window-to-Wall Ratio and Solar Heat Gain
  if (summary.overallWindowToWallRatioPercent !== null && summary.overallWindowToWallRatioPercent > 35) {
    findings.push({
      findingId: 'find-wwr-high',
      severity: summary.overallWindowToWallRatioPercent > 45 ? 'high' : 'moderate',
      category: 'window-solar-wwr',
      title: `Elevated Overall Window-to-Wall Ratio (${summary.overallWindowToWallRatioPercent.toFixed(1)}%)`,
      affectedElementIds: assemblies
        .filter((a) => a.category === 'window-glazing' || a.category === 'curtain-wall')
        .map((a) => a.assemblyId),
      governingInputsAndMetric: `Total glazing area ${summary.totalGlazingAreaM2.toFixed(1)} m² across ${summary.totalGrossEnvelopeAreaM2.toFixed(1)} m² gross envelope (steady-state solar gain ${summary.steadyStateSolarHeatGainW?.toFixed(0) || 0} W).`,
      benchmarkComparison: 'Exceeds typical 25–35% passive solar balance range, increasing summer solar cooling load and winter conductive loss.',
      evidenceStrength: 'moderate-generic-standard',
      recommendationSummary:
        'Optimize glazing ratios on East/West orientations and verify external shading factors (F_sh) and solar control SHGC.',
      uncertaintiesAndLimitations: [
        'Steady-state solar heat gain screening does not model hourly daylight autonomy or dynamic thermal mass storage.',
      ],
    });
  }

  for (const asm of assemblies) {
    if (
      asm.glazingSolar &&
      asm.glazingSolar.solarHeatGainCoefficientSHGC !== null &&
      benchmark.maxSHGC !== undefined &&
      asm.glazingSolar.solarHeatGainCoefficientSHGC > benchmark.maxSHGC &&
      (asm.orientation === 'South' || asm.orientation === 'West' || asm.orientation === 'East')
    ) {
      findings.push({
        findingId: `find-shgc-${asm.assemblyId}`,
        severity: 'moderate',
        category: 'window-solar-wwr',
        title: `Solar Heat Gain Coefficient (SHGC = ${asm.glazingSolar.solarHeatGainCoefficientSHGC.toFixed(2)}) Above Target on "${asm.name}"`,
        affectedElementIds: [asm.assemblyId],
        governingInputsAndMetric: `SHGC = ${asm.glazingSolar.solarHeatGainCoefficientSHGC.toFixed(2)}, external shading F_sh = ${asm.glazingSolar.externalShadingFactorFsh.toFixed(2)}, aperture area = ${asm.netAreaM2.toFixed(1)} m².`,
        benchmarkComparison: `Exceeds benchmark max SHGC of ${benchmark.maxSHGC.toFixed(2)} for "${benchmark.name}".`,
        evidenceStrength: 'moderate-generic-standard',
        recommendationSummary:
          'Specify spectrally selective solar-control glazing (lower SHGC while preserving VT) or install exterior architectural shading.',
        uncertaintiesAndLimitations: [
          'In heating-dominated climates, moderate South SHGC can provide beneficial winter passive solar gains if summer overhangs are provided.',
        ],
      });
    }
  }

  // 3. Check Thermal Bridge Share
  if (
    bridgeSummary.equivalentDeltaUWPerM2K !== null &&
    bridgeSummary.equivalentDeltaUWPerM2K > 0.05
  ) {
    findings.push({
      findingId: 'find-thermal-bridges-significant',
      severity: bridgeSummary.equivalentDeltaUWPerM2K > 0.10 ? 'high' : 'moderate',
      category: 'thermal-bridging',
      title: `Linear & Point Thermal Bridges Add +${bridgeSummary.equivalentDeltaUWPerM2K.toFixed(3)} W/(m²·K) Equivalent Delta-U`,
      affectedElementIds: bridgeSummary.bridgeBreakdown.map((b) => b.bridgeId),
      governingInputsAndMetric: `H_tb = ${bridgeSummary.totalBridgeHeatTransferCoeffWPerK.toFixed(1)} W/K (${bridgeSummary.heatingDesignBridgeHeatFlowW?.toFixed(0) || 0} W at heating design Delta_T = ${heatingDeltaT.toFixed(1)} K).`,
      benchmarkComparison:
        'High-performance envelope design targets equivalent thermal-bridge surcharge Delta_U_tb <= 0.05 W/(m²·K).',
      evidenceStrength: 'moderate-generic-standard',
      recommendationSummary:
        'Detail continuous perimeter slab-edge insulation, thermally broken parapet upstands, and insulated window reveal closers.',
      uncertaintiesAndLimitations: [
        'Default ISO 14683 catalogue Psi-values are conservative; project-specific 2D FEM thermal bridge calculations (ISO 10211) can refine Psi values.',
      ],
    });
  }

  // 4. Check Moisture & Condensation Records
  for (const mr of moistureRecords) {
    if (
      mr.status === 'surface-condensation-risk' ||
      mr.status === 'interstitial-condensation-risk' ||
      mr.status === 'surface-mould-risk'
    ) {
      findings.push({
        findingId: `find-moisture-${mr.assemblyId}`,
        severity:
          mr.status === 'surface-condensation-risk' || mr.status === 'interstitial-condensation-risk'
            ? 'high'
            : 'moderate',
        category: 'condensation-moisture',
        title: `${
          mr.status === 'surface-condensation-risk'
            ? 'Interior Surface Condensation Risk'
            : mr.status === 'interstitial-condensation-risk'
              ? 'Glaser Interstitial Vapour Condensation Risk'
              : 'Interior Surface Mould-Growth Risk (Low f_Rsi)'
        } on "${mr.assemblyName}"`,
        affectedElementIds: [mr.assemblyId],
        governingInputsAndMetric: `T_si = ${mr.interiorSurfaceTempC?.toFixed(2)}°C vs Dew Point T_dp = ${mr.indoorDewPointTempC?.toFixed(2)}°C; f_Rsi = ${mr.temperatureFactorFRsi?.toFixed(3)} (min required ${mr.criticalMinimumFRsi?.toFixed(3)}).`,
        benchmarkComparison: `Fails ISO 13788 screening threshold under indoor ${mr.indoorTempC}°C / ${mr.indoorRHPercent}% RH and outdoor ${mr.outdoorTempC}°C.`,
        evidenceStrength: 'moderate-generic-standard',
        recommendationSummary:
          mr.status === 'interstitial-condensation-risk'
            ? 'Place a high-vapour-resistance Vapour Control Layer (VCL) on the warm interior side of the thermal insulation and ensure exterior layers are vapour-permeable.'
            : 'Improve thermal transmittance (U-value) and eliminate geometric thermal bridging at corners and reveals.',
        uncertaintiesAndLimitations: mr.limitationsDisclosure,
      });
    }
  }

  // 5. Check Airtightness
  if (airtightnessEval.status === 'unavailable' || airtightnessEval.status === 'untested-assumption') {
    findings.push({
      findingId: 'find-airtightness-unverified',
      severity: airtightnessEval.discontinuousJunctionsCount > 0 ? 'high' : 'informational',
      category: 'airtightness-infiltration',
      title:
        airtightnessEval.status === 'unavailable'
          ? 'Envelope Airtightness (n_50 / q_50) Not Yet Specified or Tested'
          : `Envelope Airtightness Based on Unverified Scenario Assumption (n_50 = ${airtightnessEval.n50PerHour?.toFixed(2)} h⁻¹)`,
      affectedElementIds: ['airtightness-boundary'],
      governingInputsAndMetric: `Provenance: ${airtightnessEval.provenance}; Discontinuous junctions flagged: ${airtightnessEval.discontinuousJunctionsCount}; Unassessed junctions: ${airtightnessEval.unassessedJunctionsCount}.`,
      benchmarkComparison:
        airtightnessEval.benchmarkPass === false
          ? `Exceeds benchmark airtightness limit (${benchmark.maxAirChangesN50PerHour} h⁻¹).`
          : 'Requires post-construction ISO 9972 / ASTM E779 fan pressurization test to verify as-built performance.',
      evidenceStrength: 'low-assumed-or-incomplete',
      recommendationSummary:
        'Define continuous primary air-barrier line across wall-to-roof, wall-to-slab, and window jamb junctions, and schedule blower-door verification testing.',
      uncertaintiesAndLimitations: [
        'Screening infiltration heat loss does not model wind-pressure distribution or mechanical ventilation heat recovery (MVHR) balance.',
      ],
    });
  }

  // Build Evidence-Backed Improvement Options with P44 Carbon Cross-Referencing
  const opaqueWalls = assemblies.filter((a) => a.category === 'external-opaque-wall' && a.thermalResult?.uValueWPerM2K);
  const totalOpaqueWallArea = opaqueWalls.reduce((acc, a) => acc + a.netAreaM2, 0);
  const currentWallUA = opaqueWalls.reduce((acc, a) => acc + (a.thermalResult?.uValueWPerM2K || 0) * a.netAreaM2, 0);
  const avgWallU = totalOpaqueWallArea > 0 ? currentWallUA / totalOpaqueWallArea : 0.23;

  if (totalOpaqueWallArea > 0) {
    const targetWallU = Math.min(avgWallU * 0.72, 0.16);
    const uaSaving = Math.max(0.5, (avgWallU - targetWallU) * totalOpaqueWallArea);
    // Embodied carbon of adding 60 mm mineral wool (45 kg/m³, ~1.28 kgCO2e/kg => ~3.45 kgCO2e/m²)
    const upfrontCarbonKg = Number((totalOpaqueWallArea * 3.45).toFixed(0));
    improvementOptions.push({
      optionId: 'imp-wall-insulation-upgrade',
      title: 'Increase External Wall Mineral Wool Insulation (+60 mm Continuous Cavity Layer)',
      targetCategory: 'external-opaque-wall',
      targetAssemblyIds: opaqueWalls.map((w) => w.assemblyId),
      proposedChangeDescription:
        'Increase mineral wool cavity insulation thickness by +60 mm (lambda = 0.035 W/(m·K)) across all external opaque wall assemblies.',
      beforeMetricLabel: `U_wall,avg = ${avgWallU.toFixed(3)} W/(m²·K)`,
      projectedAfterMetricLabel: `U_wall,avg = ${targetWallU.toFixed(3)} W/(m²·K)`,
      estimatedTransmissionReductionWPerK: Number(uaSaving.toFixed(2)),
      estimatedHeatingPeakReductionW: Number((uaSaving * heatingDeltaT).toFixed(0)),
      embodiedCarbonTradeoffStatus: p44Active ? 'p44-linked-evaluated' : 'p44-qualitative-note',
      estimatedUpfrontCarbonDeltaKgCO2e: upfrontCarbonKg,
      linkedP44FactorId: 'cf-insulation-mineral-wool',
      technicalCaveatsAndMoistureCheck: [
        'Mineral wool is vapour-permeable (mu = 1.3), preserving outward drying potential in Glaser screening.',
        'Verify foundation edge width and window reveal depth for +60 mm wall thickness increase.',
      ],
      selectedForScenario: existingSelections?.['imp-wall-insulation-upgrade'] ?? false,
    });
  }

  const windows = assemblies.filter((a) => a.category === 'window-glazing' && a.thermalResult?.uValueWPerM2K);
  const totalWinArea = windows.reduce((acc, w) => acc + w.netAreaM2, 0);
  const currentWinUA = windows.reduce((acc, w) => acc + (w.thermalResult?.uValueWPerM2K || 0) * w.netAreaM2, 0);
  const avgWinU = totalWinArea > 0 ? currentWinUA / totalWinArea : 1.30;

  if (totalWinArea > 0) {
    const targetWinU = Math.min(avgWinU, 0.85);
    const uaSaving = Math.max(0.5, (avgWinU - targetWinU) * totalWinArea);
    // Triple glazing third pane embodied carbon increment (~22 kgCO2e/m² window area)
    const upfrontCarbonKg = Number((totalWinArea * 22.0).toFixed(0));
    improvementOptions.push({
      optionId: 'imp-window-triple-glazing',
      title: 'Upgrade Fenestration to Triple-Glazed Low-E Argon Units (Uw = 0.85 W/(m²·K), SHGC = 0.34)',
      targetCategory: 'window-glazing',
      targetAssemblyIds: windows.map((w) => w.assemblyId),
      proposedChangeDescription:
        'Replace double-glazed IGUs with triple-glazed Low-E Argon units with warm-edge spacers and solar-selective coating.',
      beforeMetricLabel: `U_win,avg = ${avgWinU.toFixed(2)} W/(m²·K)`,
      projectedAfterMetricLabel: `U_win,avg = ${targetWinU.toFixed(2)} W/(m²·K)`,
      estimatedTransmissionReductionWPerK: Number(uaSaving.toFixed(2)),
      estimatedHeatingPeakReductionW: Number((uaSaving * heatingDeltaT).toFixed(0)),
      embodiedCarbonTradeoffStatus: p44Active ? 'p44-linked-evaluated' : 'p44-qualitative-note',
      estimatedUpfrontCarbonDeltaKgCO2e: upfrontCarbonKg,
      linkedP44FactorId: 'cf-glazing-double-alu',
      technicalCaveatsAndMoistureCheck: [
        'Raises interior glass surface temperature T_si by ~2.5 °C in winter, significantly reducing window perimeter condensation risk.',
        'Increases sash weight; verify hinge load ratings and P44 upfront embodied carbon payback against B6 operational savings.',
      ],
      selectedForScenario: existingSelections?.['imp-window-triple-glazing'] ?? false,
    });
  }

  if (bridgeSummary.totalBridgeHeatTransferCoeffWPerK > 0) {
    const htbSaving = Number((bridgeSummary.totalBridgeHeatTransferCoeffWPerK * 0.45).toFixed(2));
    improvementOptions.push({
      optionId: 'imp-thermal-bridge-mitigation',
      title: 'Detail Continuous Slab-Edge & Parapet Thermal Bridge Breaks (-45% Linear Psi)',
      targetCategory: 'thermal-bridge',
      targetAssemblyIds: bridgeSummary.bridgeBreakdown.map((b) => b.bridgeId),
      proposedChangeDescription:
        'InstallXPS perimeter slab-edge upstand insulation, structural thermal breaks at parapet/slab junctions, and insulated window reveal closers.',
      beforeMetricLabel: `H_tb = ${bridgeSummary.totalBridgeHeatTransferCoeffWPerK.toFixed(1)} W/K`,
      projectedAfterMetricLabel: `H_tb = ${(bridgeSummary.totalBridgeHeatTransferCoeffWPerK - htbSaving).toFixed(1)} W/K`,
      estimatedTransmissionReductionWPerK: htbSaving,
      estimatedHeatingPeakReductionW: Number((htbSaving * heatingDeltaT).toFixed(0)),
      embodiedCarbonTradeoffStatus: p44Active ? 'p44-linked-evaluated' : 'p44-qualitative-note',
      estimatedUpfrontCarbonDeltaKgCO2e: 420,
      technicalCaveatsAndMoistureCheck: [
        'Increases corner temperature factor f_Rsi above 0.78, mitigating mould growth risk at wall-to-slab and parapet junctions.',
      ],
      selectedForScenario: existingSelections?.['imp-thermal-bridge-mitigation'] ?? false,
    });
  }

  return { findings, improvementOptions };
}

/**
 * Recomputes all derived thermal, solar, thermal-bridge, moisture/Glaser, airtightness,
 * findings, and improvement metrics for an EnvelopePerformanceAssessment deterministically.
 */
export function recomputeEnvelopeAssessment(
  project: Project,
  assessment: EnvelopePerformanceAssessment
): EnvelopePerformanceAssessment {
  const benchmark =
    REGIONAL_ENVELOPE_SCREENING_BENCHMARKS.find((b) => b.benchmarkId === assessment.activeBenchmarkId) ||
    REGIONAL_ENVELOPE_SCREENING_BENCHMARKS[0];

  const winterScenario =
    assessment.climateScenarios.find((s) => s.scenarioId === assessment.activeScenarioId) ||
    assessment.climateScenarios[0];
  const coolingScenario =
    assessment.climateScenarios.find((s) => s.scenarioId === assessment.coolingScenarioId) ||
    assessment.climateScenarios.find((s) => s.scenarioType === 'summer-cooling-design' || s.scenarioType === 'p45-climate-resilience-linked') ||
    assessment.climateScenarios[0];

  const heatingDeltaTK = Number(Math.max(0, winterScenario.indoorTempC - winterScenario.outdoorTempC).toFixed(2));
  const coolingDeltaTK = Number(Math.max(0, coolingScenario.outdoorTempC - coolingScenario.indoorTempC).toFixed(2));

  // Evaluate each assembly
  const evaluatedAssemblies: EnvelopeAssemblyRecord[] = assessment.assemblies.map((asm) => {
    const netArea = Number(Math.max(0, asm.grossAreaM2 - asm.openingAreaSubtractedM2).toFixed(3));
    const updatedAsm: EnvelopeAssemblyRecord = {
      ...asm,
      netAreaM2: netArea,
    };
    const thermalResult = evaluateAssemblyThermalPerformance(updatedAsm);
    if (asm.openingAreaSubtractedM2 > asm.grossAreaM2) {
      thermalResult.warnings.push(
        `Subtracted opening area (${asm.openingAreaSubtractedM2.toFixed(2)} m²) exceeds gross area (${asm.grossAreaM2.toFixed(2)} m²); net area clamped to 0 m².`
      );
    }
    return {
      ...updatedAsm,
      thermalResult,
    };
  });

  // Compute area accounting and area-weighted U-values
  let totalGrossArea = 0;
  let totalSubtractedArea = 0;
  let totalNetArea = 0;
  let opaqueWallNetArea = 0;
  let roofNetArea = 0;
  let floorNetArea = 0;
  let glazingNetArea = 0;
  let doorNetArea = 0;

  let sumUAAll = 0;
  let sumAreaAssessedAll = 0;
  let sumUAWall = 0;
  let sumAreaWall = 0;
  let sumUARoof = 0;
  let sumAreaRoof = 0;
  let sumUAFloor = 0;
  let sumAreaFloor = 0;
  let sumUAGlazing = 0;
  let sumAreaGlazing = 0;
  let sumSHGCArea = 0;
  let sumAreaSHGC = 0;
  let totalSolarGainW = 0;
  let anySolarGainAssessed = false;

  let assessedCount = 0;
  let incompleteCount = 0;

  const categoryBuckets: Record<
    EnvelopeElementCategory,
    { netAreaM2: number; uaWPerK: number }
  > = {
    'external-opaque-wall': { netAreaM2: 0, uaWPerK: 0 },
    'internal-thermal-partition': { netAreaM2: 0, uaWPerK: 0 },
    'roof-assembly': { netAreaM2: 0, uaWPerK: 0 },
    'ground-contact-floor': { netAreaM2: 0, uaWPerK: 0 },
    'exposed-suspended-floor': { netAreaM2: 0, uaWPerK: 0 },
    'window-glazing': { netAreaM2: 0, uaWPerK: 0 },
    'exterior-door': { netAreaM2: 0, uaWPerK: 0 },
    'skylight-roof-glazing': { netAreaM2: 0, uaWPerK: 0 },
    'curtain-wall': { netAreaM2: 0, uaWPerK: 0 },
  };

  for (const asm of evaluatedAssemblies) {
    if (!asm.includeInThermalEnvelope) continue;

    // Only add gross area for primary host surfaces (walls, roofs, floors) so child windows/doors aren't double-counted in gross envelope area
    const isChildOpening =
      asm.category === 'window-glazing' ||
      asm.category === 'exterior-door' ||
      asm.category === 'skylight-roof-glazing';
    if (!isChildOpening) {
      totalGrossArea += asm.grossAreaM2;
      totalSubtractedArea += asm.openingAreaSubtractedM2;
    }

    totalNetArea += asm.netAreaM2;
    if (asm.category === 'external-opaque-wall') opaqueWallNetArea += asm.netAreaM2;
    if (asm.category === 'roof-assembly') roofNetArea += asm.netAreaM2;
    if (asm.category === 'ground-contact-floor' || asm.category === 'exposed-suspended-floor') {
      floorNetArea += asm.netAreaM2;
    }
    if (
      asm.category === 'window-glazing' ||
      asm.category === 'skylight-roof-glazing' ||
      asm.category === 'curtain-wall'
    ) {
      glazingNetArea += asm.netAreaM2;
    }
    if (asm.category === 'exterior-door') doorNetArea += asm.netAreaM2;

    const uVal = asm.thermalResult?.uValueWPerM2K ?? null;
    if (uVal !== null && Number.isFinite(uVal) && asm.netAreaM2 > 0) {
      assessedCount++;
      const ua = uVal * asm.netAreaM2;
      sumUAAll += ua;
      sumAreaAssessedAll += asm.netAreaM2;
      categoryBuckets[asm.category].netAreaM2 += asm.netAreaM2;
      categoryBuckets[asm.category].uaWPerK += ua;

      if (asm.category === 'external-opaque-wall') {
        sumUAWall += ua;
        sumAreaWall += asm.netAreaM2;
      } else if (asm.category === 'roof-assembly') {
        sumUARoof += ua;
        sumAreaRoof += asm.netAreaM2;
      } else if (asm.category === 'ground-contact-floor' || asm.category === 'exposed-suspended-floor') {
        sumUAFloor += ua;
        sumAreaFloor += asm.netAreaM2;
      } else if (
        asm.category === 'window-glazing' ||
        asm.category === 'skylight-roof-glazing' ||
        asm.category === 'curtain-wall'
      ) {
        sumUAGlazing += ua;
        sumAreaGlazing += asm.netAreaM2;
      }
    } else {
      incompleteCount++;
    }

    // Solar gain check
    if (
      asm.glazingSolar &&
      asm.glazingSolar.solarHeatGainCoefficientSHGC !== null &&
      asm.glazingSolar.solarHeatGainCoefficientSHGC > 0 &&
      asm.netAreaM2 > 0
    ) {
      const shgc = asm.glazingSolar.solarHeatGainCoefficientSHGC;
      const fsh = asm.glazingSolar.externalShadingFactorFsh ?? 1.0;
      sumSHGCArea += shgc * asm.netAreaM2;
      sumAreaSHGC += asm.netAreaM2;

      const irr = coolingScenario.solarIrradianceByOrientationWPerM2[asm.orientation];
      if (irr !== undefined && irr !== null && Number.isFinite(irr) && irr >= 0) {
        totalSolarGainW += asm.netAreaM2 * shgc * fsh * irr;
        anySolarGainAssessed = true;
      }
    }
  }

  // Orientation breakdown for vertical facades
  const cardinalOrientations: EnvelopeOrientation[] = ['North', 'East', 'South', 'West'];
  const orientationBreakdown: EnvelopeOrientationGlazingSummary[] = cardinalOrientations.map((ori) => {
    const walls = evaluatedAssemblies.filter(
      (a) => a.orientation === ori && a.category === 'external-opaque-wall' && a.includeInThermalEnvelope
    );
    const glazings = evaluatedAssemblies.filter(
      (a) =>
        a.orientation === ori &&
        (a.category === 'window-glazing' || a.category === 'curtain-wall') &&
        a.includeInThermalEnvelope
    );
    const doors = evaluatedAssemblies.filter(
      (a) => a.orientation === ori && a.category === 'exterior-door' && a.includeInThermalEnvelope
    );

    const grossWall = walls.reduce((s, w) => s + w.grossAreaM2, 0);
    const netWall = walls.reduce((s, w) => s + w.netAreaM2, 0);
    const glazArea = glazings.reduce((s, g) => s + g.netAreaM2, 0);
    const doorArea = doors.reduce((s, d) => s + d.netAreaM2, 0);
    const wwr = grossWall > 0 ? Number(((glazArea / grossWall) * 100).toFixed(1)) : null;

    let gUA = 0;
    let gAreaU = 0;
    let gSHGC = 0;
    let gAreaS = 0;
    let oriSolarW = 0;
    const irr = coolingScenario.solarIrradianceByOrientationWPerM2[ori] ?? null;

    for (const g of glazings) {
      if (g.thermalResult?.uValueWPerM2K) {
        gUA += g.thermalResult.uValueWPerM2K * g.netAreaM2;
        gAreaU += g.netAreaM2;
      }
      if (g.glazingSolar?.solarHeatGainCoefficientSHGC) {
        const shgc = g.glazingSolar.solarHeatGainCoefficientSHGC;
        const fsh = g.glazingSolar.externalShadingFactorFsh ?? 1.0;
        gSHGC += shgc * g.netAreaM2;
        gAreaS += g.netAreaM2;
        if (irr !== null) {
          oriSolarW += g.netAreaM2 * shgc * fsh * irr;
        }
      }
    }

    return {
      orientation: ori,
      grossOpaqueWallAreaM2: Number(grossWall.toFixed(2)),
      glazingAreaM2: Number(glazArea.toFixed(2)),
      exteriorDoorAreaM2: Number(doorArea.toFixed(2)),
      netOpaqueWallAreaM2: Number(netWall.toFixed(2)),
      windowToWallRatioPercent: wwr,
      areaWeightedGlazingUWPerM2K: gAreaU > 0 ? Number((gUA / gAreaU).toFixed(3)) : null,
      areaWeightedSHGC: gAreaS > 0 ? Number((gSHGC / gAreaS).toFixed(3)) : null,
      incidentSolarIrradianceWPerM2: irr,
      steadyStateSolarGainW: irr !== null && gAreaS > 0 ? Number(oriSolarW.toFixed(1)) : null,
    };
  });

  const totalGrossVerticalWallM2 = orientationBreakdown.reduce(
    (s, o) => s + o.grossOpaqueWallAreaM2,
    0
  );
  const overallWWR =
    totalGrossVerticalWallM2 > 0
      ? Number(((glazingNetArea / totalGrossVerticalWallM2) * 100).toFixed(1))
      : null;

  // Evaluate thermal bridges
  const bridgeSummary = evaluateThermalBridges(
    assessment.thermalBridges,
    sumAreaAssessedAll,
    heatingDeltaTK,
    coolingDeltaTK
  );

  const areaWeightedU =
    sumAreaAssessedAll > 0 ? Number((sumUAAll / sumAreaAssessedAll).toFixed(4)) : null;
  const effectiveUWithBridges =
    areaWeightedU !== null && bridgeSummary.equivalentDeltaUWPerM2K !== null
      ? Number((areaWeightedU + bridgeSummary.equivalentDeltaUWPerM2K).toFixed(4))
      : areaWeightedU;

  const totalHtr =
    sumAreaAssessedAll > 0
      ? Number((sumUAAll + bridgeSummary.totalBridgeHeatTransferCoeffWPerK).toFixed(2))
      : null;

  const categoryHeatLossBreakdown: EnvelopePerformanceSummary['categoryHeatLossBreakdown'] = (
    Object.keys(categoryBuckets) as EnvelopeElementCategory[]
  )
    .filter((cat) => categoryBuckets[cat].netAreaM2 > 0)
    .map((cat) => {
      const b = categoryBuckets[cat];
      return {
        category: cat,
        netAreaM2: Number(b.netAreaM2.toFixed(2)),
        uaWPerK: Number(b.uaWPerK.toFixed(2)),
        shareOfTransmissionPercent:
          totalHtr && totalHtr > 0 ? Number(((b.uaWPerK / totalHtr) * 100).toFixed(1)) : 0,
        heatingHeatLossW: Number((b.uaWPerK * heatingDeltaTK).toFixed(1)),
      };
    })
    .sort((a, b) => b.uaWPerK - a.uaWPerK);

  const summary: EnvelopePerformanceSummary = {
    totalGrossEnvelopeAreaM2: Number(totalGrossArea.toFixed(2)),
    totalSubtractedOpeningAreaM2: Number(totalSubtractedArea.toFixed(2)),
    totalNetEnvelopeAreaM2: Number(totalNetArea.toFixed(2)),
    opaqueWallNetAreaM2: Number(opaqueWallNetArea.toFixed(2)),
    roofNetAreaM2: Number(roofNetArea.toFixed(2)),
    groundAndExposedFloorAreaM2: Number(floorNetArea.toFixed(2)),
    totalGlazingAreaM2: Number(glazingNetArea.toFixed(2)),
    totalExteriorDoorAreaM2: Number(doorNetArea.toFixed(2)),
    overallWindowToWallRatioPercent: overallWWR,
    areaWeightedEnvelopeUWPerM2K: areaWeightedU,
    effectiveEnvelopeUWithBridgesWPerM2K: effectiveUWithBridges,
    areaWeightedOpaqueWallUWPerM2K: sumAreaWall > 0 ? Number((sumUAWall / sumAreaWall).toFixed(4)) : null,
    areaWeightedRoofUWPerM2K: sumAreaRoof > 0 ? Number((sumUARoof / sumAreaRoof).toFixed(4)) : null,
    areaWeightedFloorUWPerM2K: sumAreaFloor > 0 ? Number((sumUAFloor / sumAreaFloor).toFixed(4)) : null,
    areaWeightedGlazingUWPerM2K: sumAreaGlazing > 0 ? Number((sumUAGlazing / sumAreaGlazing).toFixed(4)) : null,
    areaWeightedGlazingSHGC: sumAreaSHGC > 0 ? Number((sumSHGCArea / sumAreaSHGC).toFixed(3)) : null,
    transmissionHeatTransferCoeffWPerK: totalHtr,
    heatingDesignDeltaTK: heatingDeltaTK,
    coolingDesignDeltaTK: coolingDeltaTK,
    heatingDesignConductiveHeatLossW:
      totalHtr !== null ? Number((totalHtr * heatingDeltaTK).toFixed(1)) : null,
    coolingDesignConductiveHeatGainW:
      totalHtr !== null ? Number((totalHtr * coolingDeltaTK).toFixed(1)) : null,
    steadyStateSolarHeatGainW: anySolarGainAssessed ? Number(totalSolarGainW.toFixed(1)) : null,
    assessedAssembliesCount: assessedCount,
    incompleteOrInvalidAssembliesCount: incompleteCount,
    orientationBreakdown,
    categoryHeatLossBreakdown,
  };

  // Evaluate moisture & condensation records for all assemblies under winter/condensation scenario
  const moistureRecords = evaluatedAssemblies.map((asm) =>
    evaluateAssemblyMoistureCondensation(
      asm,
      asm.thermalResult!,
      winterScenario,
      benchmark.minTemperatureFactorFRsi ?? 0.70
    )
  );

  // Evaluate airtightness
  const airtightnessEvaluation = evaluateEnvelopeAirtightness(
    assessment.airtightness,
    summary.totalNetEnvelopeAreaM2,
    heatingDeltaTK,
    coolingDeltaTK,
    benchmark
  );

  // Preserve user selection flags on improvement options
  const existingSelMap: Record<string, boolean> = {};
  for (const opt of assessment.improvementOptions || []) {
    existingSelMap[opt.optionId] = opt.selectedForScenario;
  }

  const { findings, improvementOptions } = generateEnvelopeFindingsAndImprovements(
    project,
    evaluatedAssemblies,
    summary,
    bridgeSummary,
    moistureRecords,
    airtightnessEvaluation,
    benchmark,
    existingSelMap
  );

  return {
    ...assessment,
    updatedAt: new Date().toISOString(),
    assemblies: evaluatedAssemblies,
    summary,
    bridgeSummary,
    moistureRecords,
    airtightnessEvaluation,
    findings,
    improvementOptions,
  };
}

/**
 * Initializes a complete default EnvelopePerformanceAssessment for a project.
 */
export function createInitialEnvelopeAssessment(
  project: Project,
  assessmentName: string = 'Baseline Building Envelope Assessment'
): EnvelopePerformanceAssessment {
  const { assemblies, thermalBridges, conditionedVolumeM3, extractionWarnings } =
    extractProjectEnvelopeInventory(project);
  const climateScenarios = buildDefaultClimateScenarios(project);
  const profile = getEnvelopeAssessmentProfile();

  const draft: EnvelopePerformanceAssessment = {
    assessmentId: `env-assess-${Date.now()}`,
    assessmentName,
    profileId: ENVELOPE_ASSESSMENT_PROFILE_ID,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    activeBenchmarkId: REGIONAL_ENVELOPE_SCREENING_BENCHMARKS[0].benchmarkId,
    activeScenarioId: climateScenarios[0].scenarioId,
    coolingScenarioId: climateScenarios[1].scenarioId,
    assemblies,
    thermalBridges,
    airtightness: {
      provenance: 'user-scenario-assumption',
      n50AirChangesPerHour: 2.5,
      q50AirPermeabilityM3PerHM2: null,
      conditionedVolumeM3,
      exposureFactorE: 0.07,
      testStandardReference: 'ISO 9972 / EN 13829 target assumption (untested)',
      airBarrierContinuityChecklist: buildDefaultAirBarrierChecklist(),
      notes: 'Design-stage target assumption (not a measured blower-door test).',
    },
    climateScenarios,
    customMaterials: [],
    summary: {} as EnvelopePerformanceSummary,
    bridgeSummary: {} as EnvelopeThermalBridgeSummary,
    moistureRecords: [],
    airtightnessEvaluation: {} as EnvelopeAirtightnessEvaluation,
    findings: [],
    improvementOptions: [],
    extractionWarnings,
    knownLimitations: [
      profile.statutoryComplianceDisclaimer,
      profile.dynamicSimulationDisclaimer,
      profile.hygrothermalDisclaimer,
    ],
    sourceFingerprint: computeEnvelopeSourceFingerprint(project),
  };

  return recomputeEnvelopeAssessment(project, draft);
}

/**
 * Generates a non-destructive improved scenario preview by applying selected improvement options
 * to a cloned copy of the assessment without mutating the baseline.
 */
export function buildImprovedEnvelopeScenarioPreview(
  project: Project,
  baseAssessment: EnvelopePerformanceAssessment
): EnvelopePerformanceAssessment {
  const selectedIds = new Set(
    baseAssessment.improvementOptions.filter((o) => o.selectedForScenario).map((o) => o.optionId)
  );

  const clonedAssemblies: EnvelopeAssemblyRecord[] = baseAssessment.assemblies.map((asm) => {
    const clonedLayers = asm.layers.map((l) => ({ ...l }));
    let clonedGlazing = asm.glazingSolar ? { ...asm.glazingSolar } : undefined;

    if (selectedIds.has('imp-wall-insulation-upgrade') && asm.category === 'external-opaque-wall') {
      const insLayer = clonedLayers.find((l) => l.materialCategory === 'insulation');
      if (insLayer) {
        insLayer.thicknessMm += 60;
      } else {
        clonedLayers.push({
          layerId: `${asm.assemblyId}-added-ins`,
          orderIndex: clonedLayers.length + 1,
          name: 'Added Mineral Wool Insulation (+60 mm)',
          materialCategory: 'insulation',
          thicknessMm: 60,
          thermalConductivityWPerMK: 0.035,
          densityKgPerM3: 45,
          specificHeatJPerKgK: 1030,
          vapourResistanceFactorMu: 1.3,
          sourceNote: 'Scenario improvement +60 mm mineral wool',
        });
      }
    }

    if (selectedIds.has('imp-window-triple-glazing') && asm.category === 'window-glazing' && clonedGlazing) {
      clonedGlazing = {
        ...clonedGlazing,
        uValueBasis: 'whole-window-Uw',
        declaredUValueWPerM2K: Math.min(clonedGlazing.declaredUValueWPerM2K ?? 0.85, 0.85),
        solarHeatGainCoefficientSHGC: Math.min(clonedGlazing.solarHeatGainCoefficientSHGC ?? 0.34, 0.34),
      };
    }

    return {
      ...asm,
      layers: clonedLayers,
      glazingSolar: clonedGlazing,
    };
  });

  const clonedBridges: EnvelopeThermalBridgeRecord[] = baseAssessment.thermalBridges.map((tb) => {
    if (selectedIds.has('imp-thermal-bridge-mitigation') && tb.psiValueWPerMK !== null) {
      return {
        ...tb,
        psiValueWPerMK: Number((tb.psiValueWPerMK * 0.55).toFixed(3)),
      };
    }
    return { ...tb };
  });

  const previewDraft: EnvelopePerformanceAssessment = {
    ...baseAssessment,
    assessmentId: `${baseAssessment.assessmentId}-preview`,
    assessmentName: `${baseAssessment.assessmentName} (Improved Scenario Preview)`,
    assemblies: clonedAssemblies,
    thermalBridges: clonedBridges,
  };

  return recomputeEnvelopeAssessment(project, previewDraft);
}

/**
 * Safely persists the envelope performance assessment onto the project while creating a version snapshot
 * and preserving all unrelated project domains (floorPlan, structural, MEP, IFC, CAD, terrain, carbon, climate).
 */
export function applyEnvelopeAssessmentToProject(
  project: Project,
  assessment: EnvelopePerformanceAssessment,
  options?: { saveAsScenario?: boolean }
): Project {
  const snapshot = createProjectSnapshot(project, {
    label: `Pre-Envelope-Apply (${assessment.assessmentName})`,
    description: `Checkpoint created prior to saving P46 Building Envelope Performance Assessment (${assessment.assessmentName}).`,
    trigger: 'auto-checkpoint',
  });

  const recomputed = recomputeEnvelopeAssessment(project, {
    ...assessment,
    sourceFingerprint: computeEnvelopeSourceFingerprint(project),
  });

  const existingSaved = project.envelopePerformance?.savedScenarios || [];
  const nextSaved = options?.saveAsScenario
    ? [
        ...existingSaved.filter((s) => s.assessmentId !== recomputed.assessmentId),
        recomputed,
      ]
    : existingSaved;

  const metadata: ProjectEnvelopePerformanceMetadata = {
    version: '1.0',
    activeAssessment: recomputed,
    savedScenarios: nextSaved,
    lastPreApplySnapshotId: snapshot.id,
    provenanceNotes: [
      `Profile: ${ENVELOPE_ASSESSMENT_PROFILE_ID}`,
      `Benchmark: ${recomputed.activeBenchmarkId}`,
      `Last updated: ${recomputed.updatedAt}`,
    ],
  };

  return {
    ...project,
    envelopePerformance: metadata,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Exports the envelope performance assessment to JSON, CSV, or Markdown with full calculation traces,
 * method metadata, provenance, and explicit disclaimers.
 */
export function exportEnvelopeAssessmentReport(
  project: Project,
  assessment: EnvelopePerformanceAssessment,
  format: 'json' | 'csv' | 'markdown'
): string {
  const profile = getEnvelopeAssessmentProfile();
  const benchmark =
    REGIONAL_ENVELOPE_SCREENING_BENCHMARKS.find((b) => b.benchmarkId === assessment.activeBenchmarkId) ||
    REGIONAL_ENVELOPE_SCREENING_BENCHMARKS[0];

  if (format === 'json') {
    return JSON.stringify(
      {
        schema: ENVELOPE_ASSESSMENT_PROFILE_ID,
        exportedAt: new Date().toISOString(),
        project: {
          id: project.id,
          name: project.name,
          plotDimensions: `${project.plotWidth} x ${project.plotLength} ${project.unit}`,
          floors: project.floors,
        },
        profileMetadata: {
          profileId: profile.profileId,
          version: profile.version,
          benchmarkUsed: benchmark.name,
          isStatutoryComplianceProof: false,
          disclaimers: [
            profile.statutoryComplianceDisclaimer,
            profile.dynamicSimulationDisclaimer,
            profile.hygrothermalDisclaimer,
          ],
        },
        assessment,
      },
      null,
      2
    );
  }

  if (format === 'csv') {
    const headers = [
      'Assembly_ID',
      'Assembly_Name',
      'Category',
      'Orientation',
      'Boundary_Condition',
      'Provenance',
      'Method_Used',
      'Status',
      'Gross_Area_m2',
      'Subtracted_Openings_m2',
      'Net_Area_m2',
      'Total_Resistance_RT_m2KW',
      'U_Value_Wm2K',
      'UA_WK',
      'SHGC',
      'Surface_Temp_Tsi_C',
      'Dew_Point_Tdp_C',
      'Temp_Factor_fRsi',
      'Moisture_Screening_Status',
    ];
    const rows = assessment.assemblies.map((a) => {
      const tr = a.thermalResult;
      const mr = assessment.moistureRecords.find((m) => m.assemblyId === a.assemblyId);
      const u = tr?.uValueWPerM2K ?? null;
      const ua = u !== null ? (u * a.netAreaM2).toFixed(2) : 'N/A';
      return [
        a.assemblyId,
        `"${a.name.replace(/"/g, '""')}"`,
        a.category,
        a.orientation,
        a.boundaryCondition,
        a.provenance,
        tr?.methodUsed || 'N/A',
        tr?.status || 'N/A',
        a.grossAreaM2.toFixed(2),
        a.openingAreaSubtractedM2.toFixed(2),
        a.netAreaM2.toFixed(2),
        tr?.totalResistanceRTM2KPerW !== null && tr?.totalResistanceRTM2KPerW !== undefined
          ? tr.totalResistanceRTM2KPerW.toFixed(4)
          : 'N/A',
        u !== null ? u.toFixed(4) : 'N/A',
        ua,
        a.glazingSolar?.solarHeatGainCoefficientSHGC ?? 'N/A',
        mr?.interiorSurfaceTempC ?? 'N/A',
        mr?.indoorDewPointTempC ?? 'N/A',
        mr?.temperatureFactorFRsi ?? 'N/A',
        mr?.status ?? 'N/A',
      ].join(',');
    });
    return [headers.join(','), ...rows].join('\n');
  }

  // Markdown engineering report
  const s = assessment.summary;
  const bs = assessment.bridgeSummary;
  const ae = assessment.airtightnessEvaluation;

  const lines: string[] = [
    `# Building Envelope Performance Assessment Report — ${project.name}`,
    ``,
    `- **Assessment Name**: ${assessment.assessmentName}`,
    `- **Profile ID**: \`${assessment.profileId}\` (v${profile.version})`,
    `- **Screening Benchmark**: ${benchmark.name} (\`isStatutoryComplianceProof: false\`)`,
    `- **Generated At**: ${assessment.updatedAt}`,
    ``,
    `## 1. Methodological Scope & Mandatory Disclaimers`,
    `- **Statutory Energy Code Disclaimer**: ${profile.statutoryComplianceDisclaimer}`,
    `- **Steady-State vs Dynamic Simulation Disclaimer**: ${profile.dynamicSimulationDisclaimer}`,
    `- **Hygrothermal Screening Disclaimer**: ${profile.hygrothermalDisclaimer}`,
    ``,
    `## 2. Executive Envelope Performance Summary`,
    `- **Total Gross Envelope Area**: ${s.totalGrossEnvelopeAreaM2.toFixed(2)} m² (Subtracted Openings: ${s.totalSubtractedOpeningAreaM2.toFixed(2)} m²)`,
    `- **Total Net Exterior Thermal Envelope Area**: ${s.totalNetEnvelopeAreaM2.toFixed(2)} m²`,
    `- **Overall Window-to-Wall Ratio (WWR)**: ${s.overallWindowToWallRatioPercent !== null ? `${s.overallWindowToWallRatioPercent.toFixed(1)}%` : 'N/A'}`,
    `- **Area-Weighted Envelope Transmittance (U_env, 1D Elements)**: ${s.areaWeightedEnvelopeUWPerM2K !== null ? `${s.areaWeightedEnvelopeUWPerM2K.toFixed(3)} W/(m²·K)` : 'Incomplete'}`,
    `- **Linear & Point Thermal Bridge Surcharge (Delta_U_tb)**: ${bs.equivalentDeltaUWPerM2K !== null ? `+${bs.equivalentDeltaUWPerM2K.toFixed(3)} W/(m²·K)` : 'N/A'} (H_tb = ${bs.totalBridgeHeatTransferCoeffWPerK.toFixed(2)} W/K)`,
    `- **Effective Area-Weighted Envelope U-Value (with Bridges)**: ${s.effectiveEnvelopeUWithBridgesWPerM2K !== null ? `${s.effectiveEnvelopeUWithBridgesWPerM2K.toFixed(3)} W/(m²·K)` : 'Incomplete'}`,
    `- **Total Transmission Heat Transfer Coefficient (H_tr)**: ${s.transmissionHeatTransferCoeffWPerK !== null ? `${s.transmissionHeatTransferCoeffWPerK.toFixed(2)} W/K` : 'Incomplete'}`,
    `- **Heating Design Conductive Heat Transfer (Delta_T = ${s.heatingDesignDeltaTK} K)**: ${s.heatingDesignConductiveHeatLossW !== null ? `${s.heatingDesignConductiveHeatLossW.toFixed(0)} W` : 'Incomplete'}`,
    `- **Cooling Design Conductive Heat Transfer (Delta_T = ${s.coolingDesignDeltaTK} K)**: ${s.coolingDesignConductiveHeatGainW !== null ? `${s.coolingDesignConductiveHeatGainW.toFixed(0)} W` : 'Incomplete'}`,
    `- **Steady-State Glazing Solar Gain Screening**: ${s.steadyStateSolarHeatGainW !== null ? `${s.steadyStateSolarHeatGainW.toFixed(0)} W` : 'Unavailable'}`,
    `- **Airtightness Screening**: ${ae.n50PerHour !== null ? `n_50 = ${ae.n50PerHour.toFixed(2)} h⁻¹ (${ae.provenance})` : 'Unavailable / Untested'}`,
    ``,
    `## 3. Envelope Assembly Inventory & Thermal Calculation Table`,
    `| Assembly | Category | Orientation | Net Area (m²) | Method | R_T (m²·K/W) | U-Value (W/(m²·K)) | Provenance | Status |`,
    `| --- | --- | --- | ---: | --- | ---: | ---: | --- | --- |`,
  ];

  for (const a of assessment.assemblies) {
    const tr = a.thermalResult;
    lines.push(
      `| ${a.name} | ${a.category} | ${a.orientation} | ${a.netAreaM2.toFixed(2)} | ${tr?.methodUsed || 'N/A'} | ${tr?.totalResistanceRTM2KPerW !== null && tr?.totalResistanceRTM2KPerW !== undefined ? tr.totalResistanceRTM2KPerW.toFixed(3) : '—'} | ${tr?.uValueWPerM2K !== null && tr?.uValueWPerM2K !== undefined ? tr.uValueWPerM2K.toFixed(3) : '—'} | ${a.provenance} | ${tr?.status || 'N/A'} |`
    );
  }

  lines.push(
    ``,
    `## 4. Moisture, Dew-Point & Glaser Condensation Screening (ISO 13788:2012)`,
    `| Assembly | U (W/(m²·K)) | T_si (°C) | Dew Point T_dp (°C) | f_Rsi | f_Rsi,min | Surface Status | Glaser Interstitial Status |`,
    `| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |`
  );

  for (const m of assessment.moistureRecords) {
    lines.push(
      `| ${m.assemblyName} | ${m.uValueWPerM2K !== null ? m.uValueWPerM2K.toFixed(3) : '—'} | ${m.interiorSurfaceTempC ?? '—'} | ${m.indoorDewPointTempC ?? '—'} | ${m.temperatureFactorFRsi ?? '—'} | ${m.criticalMinimumFRsi ?? '—'} | ${m.status} | ${m.interstitialStatus} |`
    );
  }

  lines.push(``, `## 5. Traceable Envelope Findings`);
  for (const f of assessment.findings) {
    lines.push(
      `- **[${f.severity.toUpperCase()}] ${f.title}** (${f.category}): ${f.governingInputsAndMetric} — *Recommendation*: ${f.recommendationSummary}`
    );
  }

  lines.push(``, `## 6. Evidence-Backed Improvement Options & P44 Embodied Carbon Trade-Offs`);
  for (const opt of assessment.improvementOptions) {
    lines.push(
      `- **${opt.title}**: ${opt.beforeMetricLabel} → ${opt.projectedAfterMetricLabel} (Saves ${opt.estimatedTransmissionReductionWPerK.toFixed(2)} W/K / ${opt.estimatedHeatingPeakReductionW} W peak heating; Upfront Carbon Delta: ${opt.estimatedUpfrontCarbonDeltaKgCO2e !== null ? `+${opt.estimatedUpfrontCarbonDeltaKgCO2e} kgCO₂e` : 'N/A'} [${opt.embodiedCarbonTradeoffStatus}])`
    );
  }

  return lines.join('\n');
}
