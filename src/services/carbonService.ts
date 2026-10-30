import { Project } from '../types/project';
import {
  CarbonAssessmentProfile,
  CarbonAssessmentScopeClassification,
  CarbonBiogenicSummary,
  CarbonCalculationTrace,
  CarbonDataQualitySummary,
  CarbonDeclaredUnit,
  CarbonElementCategory,
  CarbonFactorImportResult,
  CarbonFactorQuarantineRecord,
  CarbonFactorRecord,
  CarbonHotspotRecord,
  CarbonInventoryExtractionWarning,
  CarbonLifecycleModuleCode,
  CarbonLifecycleModuleResult,
  CarbonMaterialInventoryItem,
  CarbonModuleDSummary,
  CarbonOperationalEnergyInput,
  CarbonOperationalWaterInput,
  CarbonReductionOpportunity,
  CarbonSiteConstructionInput,
  CarbonUnitConversionResult,
  CarbonValidationIssue,
  ProjectCarbonAssessmentMetadata,
  WholeLifeCarbonAssessment,
} from '../types/carbon';
import { createProjectSnapshot } from './versioningService';

export const SUPPORTED_CARBON_ASSESSMENT_PROFILE: CarbonAssessmentProfile = {
  profileId: 'plotify-whole-life-carbon-p44-v1',
  profileName: 'Plotify Embodied & Whole-Life Carbon Assessment Profile (P44 v1.0)',
  version: '1.0.0',
  methodologyReferences: [
    'BS EN 15978:2011 Sustainability of construction works — Assessment of environmental performance of buildings',
    'RICS Whole Life Carbon Assessment (WLCA) for the Built Environment, 2nd Edition (2024)',
    'BS EN 15804+A2:2019 Environmental Product Declarations — Core rules for construction products',
    'ISO 14040:2006 & ISO 14044:2006 Environmental management — Life cycle assessment',
    'Inventory of Carbon and Energy (ICE) Database v3.0 (Circular Ecology / University of Bath)',
  ],
  defaultReferenceStudyPeriodYears: 60,
  supportedModules: [
    {
      code: 'A0',
      stageGroup: 'Upfront (A0-A5)',
      title: 'A0 Pre-Construction Stage',
      description: 'Preliminary site investigations, temporary enabling works, and pre-construction activities.',
      includedInUpfrontTotal: true,
      includedInEmbodiedTotal: true,
      includedInOperationalTotal: false,
      includedInWholeLifeACTotal: true,
      reportedSeparatelyBeyondBoundary: false,
    },
    {
      code: 'A1-A3',
      stageGroup: 'Upfront (A0-A5)',
      title: 'A1–A3 Product Stage (Cradle-to-Gate)',
      description: 'Raw material supply (A1), transport to manufacturer (A2), and manufacturing (A3).',
      includedInUpfrontTotal: true,
      includedInEmbodiedTotal: true,
      includedInOperationalTotal: false,
      includedInWholeLifeACTotal: true,
      reportedSeparatelyBeyondBoundary: false,
    },
    {
      code: 'A4',
      stageGroup: 'Upfront (A0-A5)',
      title: 'A4 Transport to Project Site',
      description: 'Transportation of building materials and components from factory gate to construction site.',
      includedInUpfrontTotal: true,
      includedInEmbodiedTotal: true,
      includedInOperationalTotal: false,
      includedInWholeLifeACTotal: true,
      reportedSeparatelyBeyondBoundary: false,
    },
    {
      code: 'A5',
      stageGroup: 'Upfront (A0-A5)',
      title: 'A5 Construction & Installation Process',
      description: 'On-site construction energy/processes and embodied carbon of construction site material waste.',
      includedInUpfrontTotal: true,
      includedInEmbodiedTotal: true,
      includedInOperationalTotal: false,
      includedInWholeLifeACTotal: true,
      reportedSeparatelyBeyondBoundary: false,
    },
    {
      code: 'B1',
      stageGroup: 'In-Use Embodied (B1-B5)',
      title: 'B1 Use Stage Release / Carbonation',
      description: 'Fugitive refrigerant emissions, material emissions in use, or documented carbonation.',
      includedInUpfrontTotal: false,
      includedInEmbodiedTotal: true,
      includedInOperationalTotal: false,
      includedInWholeLifeACTotal: true,
      reportedSeparatelyBeyondBoundary: false,
    },
    {
      code: 'B2-B5',
      stageGroup: 'In-Use Embodied (B1-B5)',
      title: 'B2–B5 Maintenance, Repair, Replacement & Refurbishment',
      description: 'Recurring embodied carbon from component replacements (B4) and maintenance over the Reference Study Period.',
      includedInUpfrontTotal: false,
      includedInEmbodiedTotal: true,
      includedInOperationalTotal: false,
      includedInWholeLifeACTotal: true,
      reportedSeparatelyBeyondBoundary: false,
    },
    {
      code: 'B6',
      stageGroup: 'Operational (B6-B8)',
      title: 'B6 Operational Energy Use',
      description: 'Regulated and unregulated building energy consumption over the Reference Study Period.',
      includedInUpfrontTotal: false,
      includedInEmbodiedTotal: false,
      includedInOperationalTotal: true,
      includedInWholeLifeACTotal: true,
      reportedSeparatelyBeyondBoundary: false,
    },
    {
      code: 'B7',
      stageGroup: 'Operational (B6-B8)',
      title: 'B7 Operational Water Use',
      description: 'Potable water supply and wastewater treatment emissions over the Reference Study Period.',
      includedInUpfrontTotal: false,
      includedInEmbodiedTotal: false,
      includedInOperationalTotal: true,
      includedInWholeLifeACTotal: true,
      reportedSeparatelyBeyondBoundary: false,
    },
    {
      code: 'B8',
      stageGroup: 'Operational (B6-B8)',
      title: 'B8 User Activities (Optional)',
      description: 'Building user activities not covered in B6/B7 when explicitly entered.',
      includedInUpfrontTotal: false,
      includedInEmbodiedTotal: false,
      includedInOperationalTotal: true,
      includedInWholeLifeACTotal: true,
      reportedSeparatelyBeyondBoundary: false,
    },
    {
      code: 'C1-C4',
      stageGroup: 'End of Life (C1-C4)',
      title: 'C1–C4 End-of-Life Stage',
      description: 'Deconstruction/demolition (C1), transport to waste processing (C2), waste processing (C3), and disposal (C4).',
      includedInUpfrontTotal: false,
      includedInEmbodiedTotal: true,
      includedInOperationalTotal: false,
      includedInWholeLifeACTotal: true,
      reportedSeparatelyBeyondBoundary: false,
    },
    {
      code: 'D',
      stageGroup: 'Beyond Boundary (D)',
      title: 'Module D Benefits & Loads Beyond System Boundary',
      description: 'Potential net benefits/loads from reuse, recovery, recycling, or exported energy. Reported strictly separately.',
      includedInUpfrontTotal: false,
      includedInEmbodiedTotal: false,
      includedInOperationalTotal: false,
      includedInWholeLifeACTotal: false,
      reportedSeparatelyBeyondBoundary: true,
    },
  ],
  supportedDeclaredUnits: ['kg', 'tonne', 'm2', 'm3', 'm', 'item', 'kWh', 'm3-water', 'tonne-km'],
  unitConversionRules: [
    '1 tonne = 1,000 kg (exact).',
    'Area (m2) to Volume (m3) requires an explicit positive thicknessM (m3 = m2 * thicknessM).',
    'Volume (m3) to Mass (kg) requires an explicit positive densityKgPerM3 (kg = m3 * densityKgPerM3).',
    'Area (m2) to Mass (kg) requires both thicknessM and densityKgPerM3 (kg = m2 * thicknessM * densityKgPerM3).',
    'Incompatible unit pairs without required physical properties are rejected and flagged as validation errors.',
  ],
  biogenicAccountingPolicy:
    'Biogenic carbon sequestered in bio-based materials (e.g., timber) during A1-A3 is tracked separately and balanced by biogenic carbon release in C3-C4 at End-of-Life per EN 15804+A2 / EN 15978 so sequestered carbon is never double-counted or permanently credited without end-of-life release.',
  moduleDPolicy:
    'Module D circularity benefits and loads beyond the system boundary are reported in a dedicated summary and are never subtracted from Upfront (A0-A5), Embodied (A-C), or Whole-Life (A-C) totals.',
  missingDataPolicy:
    'Lifecycle modules lacking required inputs (such as B6 Operational Energy or B7 Operational Water when no consumption data is supplied) are marked "unavailable" or "unassessed" with null emissions — never silently reported as 0 kgCO2e.',
  knownExclusionsAndLimitations: [
    'Plotify P44 is a deterministic Whole-Life Carbon calculation and scenario engine, not a third-party EPD verification body or dynamic hourly BEM (Building Energy Modeling) thermal solver.',
    '2D CAD reference geometry (P42) without 3D thickness/height metadata is never silently converted into 3D material volumes.',
    'Existing-ground terrain TIN surfaces (P43) without a proposed grading design and soil haul schedule are never silently converted into excavation carbon.',
  ],
};

export const BUILT_IN_CARBON_FACTORS: CarbonFactorRecord[] = [
  {
    factorId: 'ice-rc-c30-37-cem1',
    name: 'Ready-Mix Concrete C30/37 (100% CEM I Portland Cement, 2% Steel Rebar)',
    materialOrFuelCategory: 'Concrete & Cementitious',
    applicableElementCategories: ['substructure-foundation', 'superstructure-frame', 'superstructure-upper-floors', 'superstructure-roof'],
    sourceOrganisation: 'Circular Ecology / University of Bath',
    sourceReference: 'ICE Database v3.0 — Concrete C30/37 CEM I with 150 kg/m3 reinforcement allowance',
    sourceHierarchyTier: '4-authoritative-generic',
    verificationStatus: 'authoritative-generic',
    region: 'UK / Global Reference',
    publicationYear: 2019,
    declaredUnit: 'kg',
    gwpValueKgCO2ePerUnit: 0.159,
    gwpMetric: 'GWP-fossil',
    coveredModules: ['A1-A3'],
    biogenicStorageKgCO2ePerUnit: 0,
    biogenicEndOfLifeReleaseKgCO2ePerUnit: 0,
    endOfLifeC1C4KgCO2ePerUnit: 0.014,
    moduleDBenefitKgCO2ePerUnit: -0.008,
    densityKgPerM3: 2400,
    defaultServiceLifeYears: 60,
    defaultWasteRatePercent: 5,
    defaultTransportDistanceKm: 50,
    licenseAndAttribution: 'ICE Database v3.0 (CC BY-NC-ND / Open Reference Benchmark)',
    exclusionsAndNotes: 'Generic cradle-to-gate factor including standard reinforcement allowance.',
  },
  {
    factorId: 'epd-rc-c30-37-ggbs50',
    name: 'Low-Carbon Concrete C30/37 (50% GGBS Cement Replacement, 2% Recycled Rebar)',
    materialOrFuelCategory: 'Concrete & Cementitious',
    applicableElementCategories: ['substructure-foundation', 'superstructure-frame', 'superstructure-upper-floors', 'superstructure-roof'],
    sourceOrganisation: 'European Concrete Platform / Verified Reference EPD Benchmark',
    sourceReference: 'EN 15804+A2 Reference EPD — C30/37 50% GGBS Mix',
    epdRegistrationNumber: 'S-P-09412-REF',
    sourceHierarchyTier: '1-product-epd',
    verificationStatus: 'verified-epd',
    region: 'Europe / International',
    publicationYear: 2023,
    validUntilYear: 2028,
    declaredUnit: 'kg',
    gwpValueKgCO2ePerUnit: 0.102,
    gwpMetric: 'GWP-total',
    coveredModules: ['A1-A3'],
    biogenicStorageKgCO2ePerUnit: 0,
    biogenicEndOfLifeReleaseKgCO2ePerUnit: 0,
    endOfLifeC1C4KgCO2ePerUnit: 0.013,
    moduleDBenefitKgCO2ePerUnit: -0.010,
    densityKgPerM3: 2400,
    defaultServiceLifeYears: 60,
    defaultWasteRatePercent: 5,
    defaultTransportDistanceKm: 50,
    licenseAndAttribution: 'EN 15804+A2 Published EPD Reference Dataset',
    exclusionsAndNotes: 'Requires extended curing time on site compared to CEM I mixes.',
  },
  {
    factorId: 'ice-steel-sections-bof',
    name: 'Structural Steel Sections (Global Average BOF/EAF Mix, ~40% Recycled Content)',
    materialOrFuelCategory: 'Metals & Structural Steel',
    applicableElementCategories: ['superstructure-frame', 'superstructure-roof'],
    sourceOrganisation: 'Circular Ecology / Worldsteel',
    sourceReference: 'ICE Database v3.0 — Steel, Structural Sections',
    sourceHierarchyTier: '4-authoritative-generic',
    verificationStatus: 'authoritative-generic',
    region: 'Global Reference',
    publicationYear: 2019,
    declaredUnit: 'kg',
    gwpValueKgCO2ePerUnit: 1.55,
    gwpMetric: 'GWP-fossil',
    coveredModules: ['A1-A3'],
    biogenicStorageKgCO2ePerUnit: 0,
    biogenicEndOfLifeReleaseKgCO2ePerUnit: 0,
    endOfLifeC1C4KgCO2ePerUnit: 0.025,
    moduleDBenefitKgCO2ePerUnit: -0.62,
    densityKgPerM3: 7850,
    defaultServiceLifeYears: 60,
    defaultWasteRatePercent: 2,
    defaultTransportDistanceKm: 250,
    licenseAndAttribution: 'ICE Database v3.0 / Worldsteel LCI',
  },
  {
    factorId: 'epd-steel-sections-eaf-renewable',
    name: 'Electric Arc Furnace (EAF) Structural Steel (95% Scrap + Renewable Electricity)',
    materialOrFuelCategory: 'Metals & Structural Steel',
    applicableElementCategories: ['superstructure-frame', 'superstructure-roof'],
    sourceOrganisation: 'European EAF Steel Producer EPD Benchmark',
    sourceReference: 'EN 15804+A2 Verified EPD — Low-Carbon EAF Structural Sections',
    epdRegistrationNumber: 'EPD-IBU-20230184-REF',
    sourceHierarchyTier: '1-product-epd',
    verificationStatus: 'verified-epd',
    region: 'Europe / North America',
    publicationYear: 2023,
    validUntilYear: 2028,
    declaredUnit: 'kg',
    gwpValueKgCO2ePerUnit: 0.68,
    gwpMetric: 'GWP-total',
    coveredModules: ['A1-A3'],
    biogenicStorageKgCO2ePerUnit: 0,
    biogenicEndOfLifeReleaseKgCO2ePerUnit: 0,
    endOfLifeC1C4KgCO2ePerUnit: 0.025,
    moduleDBenefitKgCO2ePerUnit: -0.15,
    densityKgPerM3: 7850,
    defaultServiceLifeYears: 60,
    defaultWasteRatePercent: 2,
    defaultTransportDistanceKm: 300,
    licenseAndAttribution: 'IBU / EN 15804+A2 Published EPD Benchmark',
    exclusionsAndNotes: 'Verify regional mill availability for required section sizes.',
  },
  {
    factorId: 'epd-mass-timber-clt-glulam',
    name: 'Engineered Mass Timber (CLT / Glulam Structural Elements, Sustainably Certified)',
    materialOrFuelCategory: 'Timber & Bio-Based',
    applicableElementCategories: ['superstructure-frame', 'superstructure-upper-floors', 'superstructure-roof', 'external-walls-facade'],
    sourceOrganisation: 'Wood for Good / EN 15804+A2 Timber EPD',
    sourceReference: 'EN 15804+A2 CLT & Glulam Structural Timber Dataset',
    epdRegistrationNumber: 'S-P-04755-REF',
    sourceHierarchyTier: '1-product-epd',
    verificationStatus: 'verified-epd',
    region: 'Europe / UK / Global',
    publicationYear: 2022,
    validUntilYear: 2027,
    declaredUnit: 'kg',
    gwpValueKgCO2ePerUnit: 0.437,
    gwpMetric: 'GWP-fossil',
    coveredModules: ['A1-A3'],
    biogenicStorageKgCO2ePerUnit: -1.64,
    biogenicEndOfLifeReleaseKgCO2ePerUnit: 1.64,
    endOfLifeC1C4KgCO2ePerUnit: 0.045,
    moduleDBenefitKgCO2ePerUnit: -0.28,
    densityKgPerM3: 480,
    defaultServiceLifeYears: 60,
    defaultWasteRatePercent: 4,
    defaultTransportDistanceKm: 400,
    licenseAndAttribution: 'EN 15804+A2 Timber Industry EPD Reference',
    exclusionsAndNotes: 'Biogenic storage (-1.64 kgCO2e/kg) is balanced by +1.64 kgCO2e/kg release in C3-C4 per EN 15978.',
  },
  {
    factorId: 'ice-clay-brick-masonry',
    name: 'Fired Clay Facing Brick & Mortar Cavity Wall Leaf',
    materialOrFuelCategory: 'Masonry & Facade',
    applicableElementCategories: ['external-walls-facade', 'internal-walls-partitions'],
    sourceOrganisation: 'Circular Ecology / Brick Development Association',
    sourceReference: 'ICE Database v3.0 — Clay Brick & Cement Mortar',
    sourceHierarchyTier: '4-authoritative-generic',
    verificationStatus: 'authoritative-generic',
    region: 'UK / Global Reference',
    publicationYear: 2019,
    declaredUnit: 'kg',
    gwpValueKgCO2ePerUnit: 0.213,
    gwpMetric: 'GWP-fossil',
    coveredModules: ['A1-A3'],
    biogenicStorageKgCO2ePerUnit: 0,
    biogenicEndOfLifeReleaseKgCO2ePerUnit: 0,
    endOfLifeC1C4KgCO2ePerUnit: 0.012,
    moduleDBenefitKgCO2ePerUnit: -0.006,
    densityKgPerM3: 1900,
    defaultServiceLifeYears: 60,
    defaultWasteRatePercent: 8,
    defaultTransportDistanceKm: 120,
    licenseAndAttribution: 'ICE Database v3.0',
  },
  {
    factorId: 'ice-aac-blockwork-plaster',
    name: 'Autoclaved Aerated Concrete (AAC) Blockwork & Mineral Render',
    materialOrFuelCategory: 'Masonry & Facade',
    applicableElementCategories: ['external-walls-facade', 'internal-walls-partitions'],
    sourceOrganisation: 'Circular Ecology / University of Bath',
    sourceReference: 'ICE Database v3.0 — Autoclaved Aerated Concrete Blockwork',
    sourceHierarchyTier: '4-authoritative-generic',
    verificationStatus: 'authoritative-generic',
    region: 'Global Reference',
    publicationYear: 2019,
    declaredUnit: 'kg',
    gwpValueKgCO2ePerUnit: 0.28,
    gwpMetric: 'GWP-fossil',
    coveredModules: ['A1-A3'],
    biogenicStorageKgCO2ePerUnit: 0,
    biogenicEndOfLifeReleaseKgCO2ePerUnit: 0,
    endOfLifeC1C4KgCO2ePerUnit: 0.015,
    moduleDBenefitKgCO2ePerUnit: -0.005,
    densityKgPerM3: 650,
    defaultServiceLifeYears: 60,
    defaultWasteRatePercent: 6,
    defaultTransportDistanceKm: 100,
    licenseAndAttribution: 'ICE Database v3.0',
  },
  {
    factorId: 'ice-natural-stone-cladding',
    name: 'Natural Dimension Stone Facade Cladding & Backing Support',
    materialOrFuelCategory: 'Masonry & Facade',
    applicableElementCategories: ['external-walls-facade', 'internal-finishes'],
    sourceOrganisation: 'Circular Ecology / Natural Stone Federation',
    sourceReference: 'ICE Database v3.0 — Limestone/Sandstone Dimension Stone',
    sourceHierarchyTier: '4-authoritative-generic',
    verificationStatus: 'authoritative-generic',
    region: 'Global Reference',
    publicationYear: 2019,
    declaredUnit: 'kg',
    gwpValueKgCO2ePerUnit: 0.09,
    gwpMetric: 'GWP-fossil',
    coveredModules: ['A1-A3'],
    biogenicStorageKgCO2ePerUnit: 0,
    biogenicEndOfLifeReleaseKgCO2ePerUnit: 0,
    endOfLifeC1C4KgCO2ePerUnit: 0.010,
    moduleDBenefitKgCO2ePerUnit: -0.004,
    densityKgPerM3: 2500,
    defaultServiceLifeYears: 60,
    defaultWasteRatePercent: 5,
    defaultTransportDistanceKm: 180,
    licenseAndAttribution: 'ICE Database v3.0',
  },
  {
    factorId: 'ice-double-glazed-aluminium-window',
    name: 'Double-Glazed Thermally Broken Aluminium Window / Curtain Wall Assembly',
    materialOrFuelCategory: 'Glazing & Fenestration',
    applicableElementCategories: ['windows-external-doors', 'external-walls-facade'],
    sourceOrganisation: 'RICS WLCA / ICE Reference',
    sourceReference: 'ICE v3.0 / CIBSE TM65 Fenestration Assembly (Double Glazed, Virgin-Mix Alu Frame)',
    sourceHierarchyTier: '4-authoritative-generic',
    verificationStatus: 'authoritative-generic',
    region: 'Global Reference',
    publicationYear: 2021,
    declaredUnit: 'm2',
    gwpValueKgCO2ePerUnit: 165.0,
    gwpMetric: 'GWP-fossil',
    coveredModules: ['A1-A3'],
    biogenicStorageKgCO2ePerUnit: 0,
    biogenicEndOfLifeReleaseKgCO2ePerUnit: 0,
    endOfLifeC1C4KgCO2ePerUnit: 6.5,
    moduleDBenefitKgCO2ePerUnit: -42.0,
    densityKgPerM3: 1100,
    defaultServiceLifeYears: 30,
    defaultWasteRatePercent: 2,
    defaultTransportDistanceKm: 200,
    licenseAndAttribution: 'ICE v3.0 / RICS WLCA Benchmark',
  },
  {
    factorId: 'epd-timber-alu-composite-window',
    name: 'Low-Carbon Timber-Aluminium Composite Window Assembly (Recycled Hydro CIRCAL Alu)',
    materialOrFuelCategory: 'Glazing & Fenestration',
    applicableElementCategories: ['windows-external-doors'],
    sourceOrganisation: 'European Fenestration EPD Benchmark',
    sourceReference: 'EN 15804+A2 Timber-Alu Composite Window EPD',
    epdRegistrationNumber: 'EPD-WIN-2023-088-REF',
    sourceHierarchyTier: '1-product-epd',
    verificationStatus: 'verified-epd',
    region: 'Europe / UK',
    publicationYear: 2023,
    validUntilYear: 2028,
    declaredUnit: 'm2',
    gwpValueKgCO2ePerUnit: 88.0,
    gwpMetric: 'GWP-fossil',
    coveredModules: ['A1-A3'],
    biogenicStorageKgCO2ePerUnit: -18.5,
    biogenicEndOfLifeReleaseKgCO2ePerUnit: 18.5,
    endOfLifeC1C4KgCO2ePerUnit: 4.8,
    moduleDBenefitKgCO2ePerUnit: -19.0,
    densityKgPerM3: 900,
    defaultServiceLifeYears: 35,
    defaultWasteRatePercent: 2,
    defaultTransportDistanceKm: 250,
    licenseAndAttribution: 'EN 15804+A2 Fenestration EPD Reference',
  },
  {
    factorId: 'ice-gypsum-stud-partition',
    name: 'Internal Partition Wall (2x12.5mm Gypsum Plasterboard on Light Gauge Steel Stud + Acoustic Infill)',
    materialOrFuelCategory: 'Internal Partitions & Drylining',
    applicableElementCategories: ['internal-walls-partitions'],
    sourceOrganisation: 'Circular Ecology / Gypsum Products Development Association',
    sourceReference: 'ICE v3.0 Composite Partition Assembly per m2 wall area',
    sourceHierarchyTier: '4-authoritative-generic',
    verificationStatus: 'authoritative-generic',
    region: 'Global Reference',
    publicationYear: 2019,
    declaredUnit: 'm2',
    gwpValueKgCO2ePerUnit: 24.5,
    gwpMetric: 'GWP-fossil',
    coveredModules: ['A1-A3'],
    biogenicStorageKgCO2ePerUnit: 0,
    biogenicEndOfLifeReleaseKgCO2ePerUnit: 0,
    endOfLifeC1C4KgCO2ePerUnit: 2.1,
    moduleDBenefitKgCO2ePerUnit: -3.2,
    densityKgPerM3: 320,
    defaultServiceLifeYears: 30,
    defaultWasteRatePercent: 10,
    defaultTransportDistanceKm: 100,
    licenseAndAttribution: 'ICE Database v3.0',
  },
  {
    factorId: 'epd-timber-stud-recycled-gypsum-partition',
    name: 'Low-Carbon Timber Stud Partition with High-Recycled Gypsum Board & Wood-Fibre Acoustic Batts',
    materialOrFuelCategory: 'Internal Partitions & Drylining',
    applicableElementCategories: ['internal-walls-partitions'],
    sourceOrganisation: 'Drylining & Bio-Insulation EPD Benchmark',
    sourceReference: 'EN 15804+A2 Timber Stud + Recycled Gypsum Partition System',
    epdRegistrationNumber: 'S-P-08119-REF',
    sourceHierarchyTier: '1-product-epd',
    verificationStatus: 'verified-epd',
    region: 'Europe / UK',
    publicationYear: 2023,
    validUntilYear: 2028,
    declaredUnit: 'm2',
    gwpValueKgCO2ePerUnit: 13.2,
    gwpMetric: 'GWP-fossil',
    coveredModules: ['A1-A3'],
    biogenicStorageKgCO2ePerUnit: -11.4,
    biogenicEndOfLifeReleaseKgCO2ePerUnit: 11.4,
    endOfLifeC1C4KgCO2ePerUnit: 1.8,
    moduleDBenefitKgCO2ePerUnit: -1.5,
    densityKgPerM3: 280,
    defaultServiceLifeYears: 30,
    defaultWasteRatePercent: 8,
    defaultTransportDistanceKm: 120,
    licenseAndAttribution: 'EN 15804+A2 Published EPD Reference',
  },
  {
    factorId: 'ice-floor-finish-porcelain-screed',
    name: 'Vitrified Porcelain Tile Flooring on Cement-Sand Screed Bed',
    materialOrFuelCategory: 'Internal Finishes',
    applicableElementCategories: ['internal-finishes'],
    sourceOrganisation: 'Circular Ecology / ICE v3.0',
    sourceReference: 'ICE Database v3.0 — Ceramic/Porcelain Tile + 50mm Screed',
    sourceHierarchyTier: '4-authoritative-generic',
    verificationStatus: 'authoritative-generic',
    region: 'Global Reference',
    publicationYear: 2019,
    declaredUnit: 'm2',
    gwpValueKgCO2ePerUnit: 29.8,
    gwpMetric: 'GWP-fossil',
    coveredModules: ['A1-A3'],
    biogenicStorageKgCO2ePerUnit: 0,
    biogenicEndOfLifeReleaseKgCO2ePerUnit: 0,
    endOfLifeC1C4KgCO2ePerUnit: 2.4,
    moduleDBenefitKgCO2ePerUnit: -0.9,
    densityKgPerM3: 2000,
    defaultServiceLifeYears: 25,
    defaultWasteRatePercent: 7,
    defaultTransportDistanceKm: 150,
    licenseAndAttribution: 'ICE Database v3.0',
  },
  {
    factorId: 'epd-floor-finish-engineered-oak',
    name: 'FSC Engineered Oak Timber Flooring on Cork Acoustic Underlay',
    materialOrFuelCategory: 'Internal Finishes',
    applicableElementCategories: ['internal-finishes'],
    sourceOrganisation: 'European Parquet Federation (FEP) EPD',
    sourceReference: 'EN 15804+A2 Multi-layer Parquet Flooring EPD',
    epdRegistrationNumber: 'EPD-FEP-20220112-REF',
    sourceHierarchyTier: '1-product-epd',
    verificationStatus: 'verified-epd',
    region: 'Europe / Global',
    publicationYear: 2022,
    validUntilYear: 2027,
    declaredUnit: 'm2',
    gwpValueKgCO2ePerUnit: 11.4,
    gwpMetric: 'GWP-fossil',
    coveredModules: ['A1-A3'],
    biogenicStorageKgCO2ePerUnit: -14.2,
    biogenicEndOfLifeReleaseKgCO2ePerUnit: 14.2,
    endOfLifeC1C4KgCO2ePerUnit: 1.5,
    moduleDBenefitKgCO2ePerUnit: -2.1,
    densityKgPerM3: 650,
    defaultServiceLifeYears: 30,
    defaultWasteRatePercent: 5,
    defaultTransportDistanceKm: 200,
    licenseAndAttribution: 'FEP / IBU Published EPD Reference',
  },
  {
    factorId: 'cibse-mep-residential-commercial-services',
    name: 'MEP Building Services Allowance (HVAC, Electrical, Plumbing & Fire Protection per m2 GIA)',
    materialOrFuelCategory: 'MEP Building Services',
    applicableElementCategories: ['mep-services'],
    sourceOrganisation: 'CIBSE TM65 / RICS WLCA Benchmark',
    sourceReference: 'CIBSE TM65 Embodied Carbon in Building Services — Mixed Residential/Commercial Baseline',
    sourceHierarchyTier: '4-authoritative-generic',
    verificationStatus: 'authoritative-generic',
    region: 'UK / Global Reference',
    publicationYear: 2021,
    declaredUnit: 'm2',
    gwpValueKgCO2ePerUnit: 75.0,
    gwpMetric: 'GWP-fossil',
    coveredModules: ['A1-A3'],
    biogenicStorageKgCO2ePerUnit: 0,
    biogenicEndOfLifeReleaseKgCO2ePerUnit: 0,
    endOfLifeC1C4KgCO2ePerUnit: 4.5,
    moduleDBenefitKgCO2ePerUnit: -12.0,
    defaultServiceLifeYears: 20,
    defaultWasteRatePercent: 3,
    defaultTransportDistanceKm: 250,
    licenseAndAttribution: 'CIBSE TM65 / RICS WLCA 2nd Ed Benchmark',
  },
  {
    factorId: 'defra-road-freight-hgv-average',
    name: 'Road Freight Transport — Average Heavy Goods Vehicle (HGV, >17t, Average Laden)',
    materialOrFuelCategory: 'Transport (A4)',
    applicableElementCategories: [
      'substructure-foundation',
      'superstructure-frame',
      'superstructure-upper-floors',
      'superstructure-roof',
      'external-walls-facade',
      'windows-external-doors',
      'internal-walls-partitions',
      'internal-finishes',
      'mep-services',
      'external-works-site',
    ],
    sourceOrganisation: 'UK DESNZ / DEFRA Greenhouse Gas Conversion Factors',
    sourceReference: 'DEFRA 2024 Freighting Goods — All HGVs (kgCO2e per tonne-km)',
    sourceHierarchyTier: '3-regional-national-db',
    verificationStatus: 'authoritative-generic',
    region: 'UK / Europe Reference',
    publicationYear: 2024,
    declaredUnit: 'tonne-km',
    gwpValueKgCO2ePerUnit: 0.105,
    gwpMetric: 'GWP-fossil',
    coveredModules: ['A4'],
    licenseAndAttribution: 'UK Government DESNZ / DEFRA Conversion Factors (Open Government Licence)',
  },
  {
    factorId: 'grid-electricity-average-reference',
    name: 'National Grid Electricity (Location-Based Reference Grid Mix)',
    materialOrFuelCategory: 'Operational Energy (B6)',
    applicableElementCategories: ['mep-services'],
    sourceOrganisation: 'IEA / DEFRA / EPA eGRID Reference Benchmark',
    sourceReference: 'National Grid Electricity Consumption + T&D Losses (kgCO2e/kWh)',
    sourceHierarchyTier: '3-regional-national-db',
    verificationStatus: 'authoritative-generic',
    region: 'International Reference',
    publicationYear: 2024,
    declaredUnit: 'kWh',
    gwpValueKgCO2ePerUnit: 0.225,
    gwpMetric: 'GWP-fossil',
    coveredModules: ['B6'],
    licenseAndAttribution: 'IEA / DEFRA 2024 Grid Factor Reference',
  },
  {
    factorId: 'grid-electricity-high-renewable-ppa',
    name: 'Low-Carbon Decarbonised Grid / Certified Renewable PPA Electricity',
    materialOrFuelCategory: 'Operational Energy (B6)',
    applicableElementCategories: ['mep-services'],
    sourceOrganisation: 'RICS WLCA Decarbonised Grid Scenario',
    sourceReference: 'High-Renewable Grid Electricity Factor (kgCO2e/kWh)',
    sourceHierarchyTier: '3-regional-national-db',
    verificationStatus: 'authoritative-generic',
    region: 'International Reference',
    publicationYear: 2024,
    declaredUnit: 'kWh',
    gwpValueKgCO2ePerUnit: 0.055,
    gwpMetric: 'GWP-fossil',
    coveredModules: ['B6'],
    licenseAndAttribution: 'RICS WLCA 2024 Grid Scenario',
  },
  {
    factorId: 'fuel-natural-gas-boiler',
    name: 'Natural Gas Thermal Fuel (Gross CV, Space Heating & DHW)',
    materialOrFuelCategory: 'Operational Energy (B6)',
    applicableElementCategories: ['mep-services'],
    sourceOrganisation: 'UK DESNZ / DEFRA Greenhouse Gas Conversion Factors',
    sourceReference: 'DEFRA 2024 Fuels — Natural Gas (kgCO2e/kWh)',
    sourceHierarchyTier: '3-regional-national-db',
    verificationStatus: 'authoritative-generic',
    region: 'International Reference',
    publicationYear: 2024,
    declaredUnit: 'kWh',
    gwpValueKgCO2ePerUnit: 0.183,
    gwpMetric: 'GWP-fossil',
    coveredModules: ['B6'],
    licenseAndAttribution: 'UK DESNZ / DEFRA 2024',
  },
  {
    factorId: 'water-potable-supply-and-wastewater',
    name: 'Mains Potable Water Supply & Wastewater Treatment Combined',
    materialOrFuelCategory: 'Operational Water (B7)',
    applicableElementCategories: ['mep-services'],
    sourceOrganisation: 'UK DESNZ / DEFRA Water Supply & Treatment',
    sourceReference: 'DEFRA 2024 Water Supply (0.177) + Water Treatment (0.201) = 0.378 kgCO2e/m3',
    sourceHierarchyTier: '3-regional-national-db',
    verificationStatus: 'authoritative-generic',
    region: 'International Reference',
    publicationYear: 2024,
    declaredUnit: 'm3-water',
    gwpValueKgCO2ePerUnit: 0.378,
    gwpMetric: 'GWP-fossil',
    coveredModules: ['B7'],
    licenseAndAttribution: 'UK DESNZ / DEFRA 2024',
  },
];

export function getAllAvailableCarbonFactors(customFactors: CarbonFactorRecord[] = []): CarbonFactorRecord[] {
  const map = new Map<string, CarbonFactorRecord>();
  for (const factor of BUILT_IN_CARBON_FACTORS) {
    map.set(factor.factorId, factor);
  }
  for (const custom of customFactors) {
    map.set(custom.factorId, custom);
  }
  return Array.from(map.values());
}

/**
 * Converts an inventory quantity (`kg`, `tonne`, `m2`, `m3`, `m`, `item`) into the factor's `declaredUnit`.
 * Never silently guesses missing physical properties (`densityKgPerM3`, `thicknessM`).
 */
export function convertInventoryQuantityToDeclaredUnit(params: {
  quantity: number;
  sourceUnit: 'kg' | 'tonne' | 'm2' | 'm3' | 'm' | 'item';
  targetUnit: CarbonDeclaredUnit;
  thicknessM?: number;
  densityKgPerM3?: number;
}): CarbonUnitConversionResult {
  const { quantity, sourceUnit, targetUnit, thicknessM, densityKgPerM3 } = params;

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return {
      valid: false,
      sourceQuantity: quantity,
      sourceUnit,
      targetUnit,
      errorReason: `Inventory quantity must be a finite positive number (received ${quantity}).`,
    };
  }

  const hasValidThickness = typeof thicknessM === 'number' && Number.isFinite(thicknessM) && thicknessM > 0;
  const hasValidDensity = typeof densityKgPerM3 === 'number' && Number.isFinite(densityKgPerM3) && densityKgPerM3 > 0;

  // Compute massKg whenever possible for A4 transport calculations
  let massKg: number | undefined;
  if (sourceUnit === 'kg') {
    massKg = quantity;
  } else if (sourceUnit === 'tonne') {
    massKg = quantity * 1000;
  } else if (sourceUnit === 'm3' && hasValidDensity) {
    massKg = quantity * densityKgPerM3!;
  } else if (sourceUnit === 'm2' && hasValidThickness && hasValidDensity) {
    massKg = quantity * thicknessM! * densityKgPerM3!;
  }

  if (sourceUnit === targetUnit) {
    return {
      valid: true,
      sourceQuantity: quantity,
      sourceUnit,
      targetUnit,
      convertedQuantity: quantity,
      massKg,
      conversionFormula: `Direct unit match: ${quantity.toFixed(3)} ${sourceUnit}`,
    };
  }

  // Mass <-> Mass
  if (sourceUnit === 'kg' && targetUnit === 'tonne') {
    const converted = quantity / 1000;
    return {
      valid: true,
      sourceQuantity: quantity,
      sourceUnit,
      targetUnit,
      convertedQuantity: converted,
      massKg: quantity,
      conversionFormula: `${quantity.toFixed(2)} kg / 1000 = ${converted.toFixed(4)} tonnes`,
    };
  }
  if (sourceUnit === 'tonne' && targetUnit === 'kg') {
    const converted = quantity * 1000;
    return {
      valid: true,
      sourceQuantity: quantity,
      sourceUnit,
      targetUnit,
      convertedQuantity: converted,
      massKg: converted,
      conversionFormula: `${quantity.toFixed(3)} tonnes × 1000 = ${converted.toFixed(1)} kg`,
    };
  }

  // Area <-> Volume
  if (sourceUnit === 'm2' && targetUnit === 'm3') {
    if (!hasValidThickness) {
      return {
        valid: false,
        sourceQuantity: quantity,
        sourceUnit,
        targetUnit,
        errorReason: `Cannot convert area (m2) to volume (m3) without a positive element thickness (thicknessM).`,
      };
    }
    const converted = quantity * thicknessM!;
    return {
      valid: true,
      sourceQuantity: quantity,
      sourceUnit,
      targetUnit,
      convertedQuantity: converted,
      massKg,
      conversionFormula: `${quantity.toFixed(2)} m2 × ${thicknessM} m thickness = ${converted.toFixed(3)} m3`,
    };
  }
  if (sourceUnit === 'm3' && targetUnit === 'm2') {
    if (!hasValidThickness) {
      return {
        valid: false,
        sourceQuantity: quantity,
        sourceUnit,
        targetUnit,
        errorReason: `Cannot convert volume (m3) to area (m2) without a positive element thickness (thicknessM).`,
      };
    }
    const converted = quantity / thicknessM!;
    return {
      valid: true,
      sourceQuantity: quantity,
      sourceUnit,
      targetUnit,
      convertedQuantity: converted,
      massKg,
      conversionFormula: `${quantity.toFixed(3)} m3 / ${thicknessM} m thickness = ${converted.toFixed(2)} m2`,
    };
  }

  // Volume <-> Mass
  if (sourceUnit === 'm3' && (targetUnit === 'kg' || targetUnit === 'tonne')) {
    if (!hasValidDensity) {
      return {
        valid: false,
        sourceQuantity: quantity,
        sourceUnit,
        targetUnit,
        errorReason: `Cannot convert volume (m3) to ${targetUnit} without a positive material density (densityKgPerM3).`,
      };
    }
    const kg = quantity * densityKgPerM3!;
    const converted = targetUnit === 'kg' ? kg : kg / 1000;
    return {
      valid: true,
      sourceQuantity: quantity,
      sourceUnit,
      targetUnit,
      convertedQuantity: converted,
      massKg: kg,
      conversionFormula:
        targetUnit === 'kg'
          ? `${quantity.toFixed(3)} m3 × ${densityKgPerM3} kg/m3 = ${kg.toFixed(1)} kg`
          : `(${quantity.toFixed(3)} m3 × ${densityKgPerM3} kg/m3) / 1000 = ${converted.toFixed(3)} tonnes`,
    };
  }
  if ((sourceUnit === 'kg' || sourceUnit === 'tonne') && targetUnit === 'm3') {
    if (!hasValidDensity) {
      return {
        valid: false,
        sourceQuantity: quantity,
        sourceUnit,
        targetUnit,
        errorReason: `Cannot convert ${sourceUnit} to volume (m3) without a positive material density (densityKgPerM3).`,
      };
    }
    const kg = sourceUnit === 'kg' ? quantity : quantity * 1000;
    const converted = kg / densityKgPerM3!;
    return {
      valid: true,
      sourceQuantity: quantity,
      sourceUnit,
      targetUnit,
      convertedQuantity: converted,
      massKg: kg,
      conversionFormula: `${kg.toFixed(1)} kg / ${densityKgPerM3} kg/m3 = ${converted.toFixed(3)} m3`,
    };
  }

  // Area <-> Mass
  if (sourceUnit === 'm2' && (targetUnit === 'kg' || targetUnit === 'tonne')) {
    if (!hasValidThickness || !hasValidDensity) {
      return {
        valid: false,
        sourceQuantity: quantity,
        sourceUnit,
        targetUnit,
        errorReason: `Cannot convert area (m2) to ${targetUnit} without both positive thicknessM (${thicknessM ?? 'missing'}) and positive densityKgPerM3 (${densityKgPerM3 ?? 'missing'}).`,
      };
    }
    const kg = quantity * thicknessM! * densityKgPerM3!;
    const converted = targetUnit === 'kg' ? kg : kg / 1000;
    return {
      valid: true,
      sourceQuantity: quantity,
      sourceUnit,
      targetUnit,
      convertedQuantity: converted,
      massKg: kg,
      conversionFormula:
        targetUnit === 'kg'
          ? `${quantity.toFixed(2)} m2 × ${thicknessM} m × ${densityKgPerM3} kg/m3 = ${kg.toFixed(1)} kg`
          : `(${quantity.toFixed(2)} m2 × ${thicknessM} m × ${densityKgPerM3} kg/m3) / 1000 = ${converted.toFixed(3)} tonnes`,
    };
  }

  return {
    valid: false,
    sourceQuantity: quantity,
    sourceUnit,
    targetUnit,
    errorReason: `Incompatible unit conversion from "${sourceUnit}" to "${targetUnit}". No valid physical conversion rule applies.`,
  };
}

const VALID_DECLARED_UNITS = new Set<CarbonDeclaredUnit>([
  'kg',
  'tonne',
  'm2',
  'm3',
  'm',
  'item',
  'kWh',
  'm3-water',
  'tonne-km',
]);

const VALID_MODULE_CODES = new Set<CarbonLifecycleModuleCode>([
  'A0',
  'A1-A3',
  'A4',
  'A5',
  'B1',
  'B2-B5',
  'B6',
  'B7',
  'B8',
  'C1-C4',
  'D',
]);

const VALID_ELEMENT_CATEGORIES = new Set<CarbonElementCategory>([
  'substructure-foundation',
  'superstructure-frame',
  'superstructure-upper-floors',
  'superstructure-roof',
  'external-walls-facade',
  'windows-external-doors',
  'internal-walls-partitions',
  'internal-finishes',
  'mep-services',
  'external-works-site',
]);

/**
 * Parses and validates user-supplied CSV or JSON carbon factor / EPD records.
 * Invalid, incomplete, duplicate, or out-of-range records are quarantined rather than silently imported.
 */
export function parseAndValidateCarbonFactorsImport(
  rawContent: string,
  sourceFileName: string,
  existingFactorIds: string[] = BUILT_IN_CARBON_FACTORS.map((f) => f.factorId)
): CarbonFactorImportResult {
  const importedAt = new Date().toISOString();
  const trimmed = rawContent.trim();
  const isJson = sourceFileName.toLowerCase().endsWith('.json') || trimmed.startsWith('[') || trimmed.startsWith('{');
  const format: 'csv' | 'json' = isJson ? 'json' : 'csv';

  const validFactors: CarbonFactorRecord[] = [];
  const quarantinedRecords: CarbonFactorQuarantineRecord[] = [];
  const warnings: string[] = [];
  const seenIds = new Set<string>(existingFactorIds);

  let rawRows: Record<string, unknown>[] = [];

  if (format === 'json') {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        rawRows = parsed;
      } else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).factors)) {
        rawRows = (parsed as { factors: Record<string, unknown>[] }).factors;
      } else if (parsed && typeof parsed === 'object') {
        rawRows = [parsed as Record<string, unknown>];
      } else {
        quarantinedRecords.push({
          rowIndex: 0,
          rawIdentifier: sourceFileName,
          reasons: ['JSON root must be an array of factor objects or an object containing a "factors" array.'],
          rawPayload: {},
        });
      }
    } catch (err) {
      quarantinedRecords.push({
        rowIndex: 0,
        rawIdentifier: sourceFileName,
        reasons: [`Malformed JSON syntax: ${err instanceof Error ? err.message : String(err)}`],
        rawPayload: {},
      });
    }
  } else {
    const lines = trimmed
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'));

    if (lines.length < 2) {
      quarantinedRecords.push({
        rowIndex: 0,
        rawIdentifier: sourceFileName,
        reasons: ['CSV factor import requires a header row and at least one data row.'],
        rawPayload: {},
      });
    } else {
      const headers = lines[0].split(',').map((h) => h.trim());
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map((c) => c.trim());
        const rowObj: Record<string, unknown> = {};
        headers.forEach((h, idx) => {
          rowObj[h] = cols[idx] ?? '';
        });
        rawRows.push(rowObj);
      }
    }
  }

  rawRows.forEach((row, index) => {
    const rowNumber = index + 1;
    const reasons: string[] = [];

    const factorId = String(row.factorId ?? row.id ?? '').trim();
    const name = String(row.name ?? '').trim();
    const sourceOrganisation = String(row.sourceOrganisation ?? row.source ?? '').trim();
    const sourceReference = String(row.sourceReference ?? row.reference ?? '').trim();
    const declaredUnitRaw = String(row.declaredUnit ?? row.unit ?? '').trim() as CarbonDeclaredUnit;
    const gwpRaw = Number(row.gwpValueKgCO2ePerUnit ?? row.gwp ?? NaN);
    const pubYearRaw = Number(row.publicationYear ?? row.year ?? new Date().getFullYear());
    const region = String(row.region ?? 'Unspecified Region').trim();

    if (!factorId) {
      reasons.push('Missing required "factorId".');
    } else if (seenIds.has(factorId)) {
      reasons.push(`Duplicate factorId "${factorId}" conflicts with an existing or earlier factor record.`);
    }

    if (!name) {
      reasons.push('Missing required factor "name".');
    }

    if (!sourceOrganisation || !sourceReference) {
      reasons.push('Both "sourceOrganisation" and "sourceReference" are required for factor traceability.');
    }

    if (!VALID_DECLARED_UNITS.has(declaredUnitRaw)) {
      reasons.push(
        `Unsupported declaredUnit "${declaredUnitRaw}". Supported units: ${Array.from(VALID_DECLARED_UNITS).join(', ')}.`
      );
    }

    if (!Number.isFinite(gwpRaw) || gwpRaw < 0) {
      reasons.push(`"gwpValueKgCO2ePerUnit" must be a finite non-negative number (received "${row.gwpValueKgCO2ePerUnit ?? row.gwp}").`);
    }

    if (!Number.isFinite(pubYearRaw) || pubYearRaw < 1990 || pubYearRaw > 2100) {
      reasons.push(`"publicationYear" must be between 1990 and 2100 (received "${row.publicationYear ?? row.year}").`);
    }

    // Parse coveredModules
    let coveredModules: CarbonLifecycleModuleCode[] = ['A1-A3'];
    if (Array.isArray(row.coveredModules)) {
      coveredModules = row.coveredModules.map((m) => String(m).trim() as CarbonLifecycleModuleCode);
    } else if (typeof row.coveredModules === 'string' && row.coveredModules.trim().length > 0) {
      coveredModules = row.coveredModules
        .split(/[;|]/)
        .map((m) => m.trim() as CarbonLifecycleModuleCode)
        .filter(Boolean);
    }
    const invalidModules = coveredModules.filter((m) => !VALID_MODULE_CODES.has(m));
    if ( coveredModules.length === 0 || invalidModules.length > 0) {
      reasons.push(`Invalid coveredModules: ${invalidModules.join(', ') || 'empty'}.`);
    }

    // Optional numeric fields validation
    const densityRaw =
      row.densityKgPerM3 !== undefined && row.densityKgPerM3 !== '' ? Number(row.densityKgPerM3) : undefined;
    if (densityRaw !== undefined && (!Number.isFinite(densityRaw) || densityRaw <= 0)) {
      reasons.push(`"densityKgPerM3" must be a positive finite number when provided.`);
    }

    const serviceLifeRaw =
      row.defaultServiceLifeYears !== undefined && row.defaultServiceLifeYears !== ''
        ? Number(row.defaultServiceLifeYears)
        : undefined;
    if (serviceLifeRaw !== undefined && (!Number.isFinite(serviceLifeRaw) || serviceLifeRaw <= 0)) {
      reasons.push(`"defaultServiceLifeYears" must be a positive number of years when provided.`);
    }

    if (reasons.length > 0) {
      quarantinedRecords.push({
        rowIndex: rowNumber,
        rawIdentifier: factorId || name || `Row #${rowNumber}`,
        reasons,
        rawPayload: row,
      });
      return;
    }

    seenIds.add(factorId);

    let applicableCategories: CarbonElementCategory[] = [
      'substructure-foundation',
      'superstructure-frame',
      'superstructure-upper-floors',
      'external-walls-facade',
      'internal-walls-partitions',
      'internal-finishes',
    ];
    if (Array.isArray(row.applicableElementCategories)) {
      const filtered = row.applicableElementCategories
        .map((c) => String(c).trim() as CarbonElementCategory)
        .filter((c) => VALID_ELEMENT_CATEGORIES.has(c));
      if (filtered.length > 0) applicableCategories = filtered;
    }

    const biogenicStorage =
      row.biogenicStorageKgCO2ePerUnit !== undefined && row.biogenicStorageKgCO2ePerUnit !== ''
        ? Number(row.biogenicStorageKgCO2ePerUnit)
        : 0;
    const biogenicRelease =
      row.biogenicEndOfLifeReleaseKgCO2ePerUnit !== undefined && row.biogenicEndOfLifeReleaseKgCO2ePerUnit !== ''
        ? Number(row.biogenicEndOfLifeReleaseKgCO2ePerUnit)
        : Math.abs(biogenicStorage);

    const endOfLifeFactor =
      row.endOfLifeC1C4KgCO2ePerUnit !== undefined && row.endOfLifeC1C4KgCO2ePerUnit !== ''
        ? Number(row.endOfLifeC1C4KgCO2ePerUnit)
        : undefined;

    const moduleDFactor =
      row.moduleDBenefitKgCO2ePerUnit !== undefined && row.moduleDBenefitKgCO2ePerUnit !== ''
        ? Number(row.moduleDBenefitKgCO2ePerUnit)
        : undefined;

    const epdReg = row.epdRegistrationNumber ? String(row.epdRegistrationNumber).trim() : undefined;

    validFactors.push({
      factorId,
      name,
      materialOrFuelCategory: String(row.materialOrFuelCategory ?? 'User Imported Material').trim(),
      applicableElementCategories: applicableCategories,
      sourceOrganisation,
      sourceReference,
      epdRegistrationNumber: epdReg,
      sourceHierarchyTier: '5-user-scenario',
      verificationStatus: 'user-imported-unverified',
      region,
      publicationYear: pubYearRaw,
      declaredUnit: declaredUnitRaw,
      gwpValueKgCO2ePerUnit: gwpRaw,
      gwpMetric:
        row.gwpMetric === 'GWP-total' || row.gwpMetric === 'GWP-biogenic' ? row.gwpMetric : 'GWP-fossil',
      coveredModules,
      biogenicStorageKgCO2ePerUnit: Number.isFinite(biogenicStorage) ? biogenicStorage : 0,
      biogenicEndOfLifeReleaseKgCO2ePerUnit: Number.isFinite(biogenicRelease) ? biogenicRelease : 0,
      endOfLifeC1C4KgCO2ePerUnit: endOfLifeFactor !== undefined && Number.isFinite(endOfLifeFactor) ? endOfLifeFactor : undefined,
      moduleDBenefitKgCO2ePerUnit: moduleDFactor !== undefined && Number.isFinite(moduleDFactor) ? moduleDFactor : undefined,
      densityKgPerM3: densityRaw,
      defaultServiceLifeYears: serviceLifeRaw ?? 60,
      defaultWasteRatePercent:
        row.defaultWasteRatePercent !== undefined && Number.isFinite(Number(row.defaultWasteRatePercent))
          ? Number(row.defaultWasteRatePercent)
          : 5,
      defaultTransportDistanceKm:
        row.defaultTransportDistanceKm !== undefined && Number.isFinite(Number(row.defaultTransportDistanceKm))
          ? Number(row.defaultTransportDistanceKm)
          : 100,
      licenseAndAttribution: String(row.licenseAndAttribution ?? 'User-imported custom factor record').trim(),
      exclusionsAndNotes: row.exclusionsAndNotes ? String(row.exclusionsAndNotes).trim() : undefined,
      userConfirmedUnverified: false,
    });
  });

  if (validFactors.length > 0) {
    warnings.push(
      `${validFactors.length} imported factor(s) are marked "user-imported-unverified" and require explicit user confirmation before being treated as verified datasets.`
    );
  }

  return {
    sourceFileName,
    importedAt,
    format,
    validFactors,
    quarantinedRecords,
    warnings,
  };
}

/**
 * Deterministically extracts building element & material quantities from the Plotify project model,
 * P41 IFC preserved elements (with duplicate prevention), and structural coordination data,
 * while refusing to fabricate 3D volumes from P42 2D CAD lines or P43 terrain elevation meshes.
 */
export function deriveProjectCarbonInventory(project: Project): {
  grossInternalFloorAreaM2: number;
  treatedFloorAreaM2: number;
  inventory: CarbonMaterialInventoryItem[];
  warnings: CarbonInventoryExtractionWarning[];
} {
  const warnings: CarbonInventoryExtractionWarning[] = [];
  const inventory: CarbonMaterialInventoryItem[] = [];

  const unitScaleToM = project.unit === 'feet' ? 0.3048 : 1.0;
  const areaScaleToM2 = project.unit === 'feet' ? 0.09290304 : 1.0;
  const floors = Math.max(1, project.floors || 1);
  const storeyHeightM = 3.1;

  const rooms = project.floorPlan?.rooms ?? [];
  let singleFloorRoomAreaM2 = 0;
  let internalRoomPerimeterM = 0;

  for (const room of rooms) {
    if (Number.isFinite(room.width) && Number.isFinite(room.length) && room.width > 0 && room.length > 0) {
      const wM = room.width * unitScaleToM;
      const lM = room.length * unitScaleToM;
      singleFloorRoomAreaM2 += wM * lM;
      internalRoomPerimeterM += 2 * (wM + lM);
    }
  }

  const plotFootprintM2 =
    Math.max(1, project.plotWidth * unitScaleToM) * Math.max(1, project.plotLength * unitScaleToM) * 0.55;

  let grossInternalFloorAreaM2: number;
  let footprintAreaM2: number;
  let buildingSourceType: CarbonMaterialInventoryItem['sourceType'] = 'model-derived-geometry';

  if (singleFloorRoomAreaM2 > 0) {
    // Check whether rooms already include multiple floors or represent the plan footprint
    footprintAreaM2 = singleFloorRoomAreaM2;
    grossInternalFloorAreaM2 = Number((footprintAreaM2 * floors).toFixed(2));
  } else {
    footprintAreaM2 = Number(plotFootprintM2.toFixed(2));
    grossInternalFloorAreaM2 = Number((footprintAreaM2 * floors).toFixed(2));
    buildingSourceType = 'default-assumption';
    warnings.push({
      code: 'NO_FLOOR_PLAN_ROOMS_GEOMETRY',
      severity: 'warning',
      sourceDomain: 'geometry',
      message:
        'Project has no finalized 2D floor-plan rooms; baseline areas were estimated from plot dimensions (55% site coverage assumption) and marked as default-assumption.',
    });
  }

  const treatedFloorAreaM2 = Number((grossInternalFloorAreaM2 * 0.9).toFixed(2));

  // Determine primary facade material from designAlternatives if present
  const activeAlt = project.designAlternatives?.[0];
  const facadeMaterial = activeAlt?.facade?.primaryMaterial ?? 'brick';
  let facadeFactorId = 'ice-clay-brick-masonry';
  let facadeThicknessM = 0.215;
  if (facadeMaterial === 'concrete') {
    facadeFactorId = 'ice-rc-c30-37-cem1';
    facadeThicknessM = 0.2;
  } else if (facadeMaterial === 'timber') {
    facadeFactorId = 'epd-mass-timber-clt-glulam';
    facadeThicknessM = 0.18;
  } else if (facadeMaterial === 'stone') {
    facadeFactorId = 'ice-natural-stone-cladding';
    facadeThicknessM = 0.15;
  } else if (facadeMaterial === 'plaster') {
    facadeFactorId = 'ice-aac-blockwork-plaster';
    facadeThicknessM = 0.2;
  }

  // 1. Substructure & Ground Floor Slab
  inventory.push({
    itemId: 'inv-substructure-slab',
    elementName: 'Substructure Ground Bearing Slab & Strip Footings',
    elementCategory: 'substructure-foundation',
    sourceType: buildingSourceType,
    sourceDescription: `Footprint area (${footprintAreaM2.toFixed(1)} m2) × 0.25m structural slab/footing equivalent thickness`,
    quantity: Number(footprintAreaM2.toFixed(2)),
    quantityUnit: 'm2',
    thicknessM: 0.25,
    assignedFactorId: 'ice-rc-c30-37-cem1',
    mappingConfidence: buildingSourceType === 'model-derived-geometry' ? 'high' : 'low',
    serviceLifeYears: 60,
    transportDistanceKm: 50,
    transportFactorId: 'defra-road-freight-hgv-average',
    wasteRatePercent: 5,
    includeEndOfLife: true,
    includeModuleD: true,
  });

  // 2. Superstructure Upper Floor Slabs (if multi-storey)
  const framingSystem = project.structuralCoordination?.framingSystem ?? 'reinforced-concrete-frame';
  const isSteelFraming = framingSystem === 'structural-steel-frame';
  const isTimberFraming = framingSystem === 'mass-timber-post-beam' || framingSystem === 'light-timber-framing';
  if (floors > 1) {
    const upperFloorsAreaM2 = Number((footprintAreaM2 * (floors - 1)).toFixed(2));
    const upperSlabFactorId = isTimberFraming ? 'epd-mass-timber-clt-glulam' : 'ice-rc-c30-37-cem1';
    inventory.push({
      itemId: 'inv-superstructure-upper-slabs',
      elementName: `Suspended Upper Floor Slabs (${floors - 1} Upper Floor${floors > 2 ? 's' : ''})`,
      elementCategory: 'superstructure-upper-floors',
      sourceType: buildingSourceType,
      sourceDescription: `${floors - 1} upper storey(s) × ${footprintAreaM2.toFixed(1)} m2 footprint`,
      quantity: upperFloorsAreaM2,
      quantityUnit: 'm2',
      thicknessM: 0.2,
      assignedFactorId: upperSlabFactorId,
      mappingConfidence: buildingSourceType === 'model-derived-geometry' ? 'high' : 'low',
      serviceLifeYears: 60,
      transportDistanceKm: 50,
      transportFactorId: 'defra-road-freight-hgv-average',
      wasteRatePercent: 5,
      includeEndOfLife: true,
      includeModuleD: true,
    });
  }

  // 3. Superstructure Frame (Columns & Beams from structuralCoordination if present, otherwise baseline frame)
  const columns = project.structuralCoordination?.columns ?? [];
  const beams = project.structuralCoordination?.beams ?? [];
  const frameFactorId = isSteelFraming
    ? 'ice-steel-sections-bof'
    : isTimberFraming
      ? 'epd-mass-timber-clt-glulam'
      : 'ice-rc-c30-37-cem1';

  if (columns.length > 0 || beams.length > 0) {
    let frameVolumeM3 = 0;
    for (const col of columns) {
      const wM = (col.width || 0.35) * unitScaleToM;
      const dM = (col.depth || 0.35) * unitScaleToM;
      frameVolumeM3 += wM * dM * storeyHeightM * floors;
    }
    for (const beam of beams) {
      const wM = (beam.profileWidth || 0.3) * unitScaleToM;
      const dM = (beam.profileDepth || 0.45) * unitScaleToM;
      const spanM = Math.max(1, Math.hypot(beam.endX - beam.startX, beam.endY - beam.startY) * unitScaleToM);
      frameVolumeM3 += wM * dM * spanM * floors;
    }
    if (frameVolumeM3 > 0) {
      inventory.push({
        itemId: 'inv-structural-frame-elements',
        elementName: `Structural Frame Columns (${columns.length}) & Beams (${beams.length})`,
        elementCategory: 'superstructure-frame',
        sourceType: 'model-derived-geometry',
        sourceDescription: `Derived from Structural Coordination (${columns.length} columns, ${beams.length} beams across ${floors} floor(s))`,
        quantity: Number(frameVolumeM3.toFixed(3)),
        quantityUnit: 'm3',
        assignedFactorId: frameFactorId,
        mappingConfidence: 'high',
        serviceLifeYears: 60,
        transportDistanceKm: isSteelFraming ? 250 : 60,
        transportFactorId: 'defra-road-freight-hgv-average',
        wasteRatePercent: isSteelFraming ? 2 : 5,
        includeEndOfLife: true,
        includeModuleD: true,
      });
    }
  } else {
    const estimatedFrameVolumeM3 = Number((grossInternalFloorAreaM2 * 0.045).toFixed(3));
    inventory.push({
      itemId: 'inv-structural-frame-baseline',
      elementName: 'Superstructure Columns & Primary Beams',
      elementCategory: 'superstructure-frame',
      sourceType: buildingSourceType,
      sourceDescription: `Structural frame volume derived from ${grossInternalFloorAreaM2.toFixed(1)} m2 GFA (0.045 m3/m2 structural frame ratio)`,
      quantity: estimatedFrameVolumeM3,
      quantityUnit: 'm3',
      assignedFactorId: frameFactorId,
      mappingConfidence: 'medium',
      serviceLifeYears: 60,
      transportDistanceKm: 60,
      transportFactorId: 'defra-road-freight-hgv-average',
      wasteRatePercent: 5,
      includeEndOfLife: true,
      includeModuleD: true,
    });
  }

  // 4. Roof Structure
  inventory.push({
    itemId: 'inv-superstructure-roof',
    elementName: 'Roof Slab / Deck Structure & Weatherproofing',
    elementCategory: 'superstructure-roof',
    sourceType: buildingSourceType,
    sourceDescription: `Roof footprint area (${footprintAreaM2.toFixed(1)} m2) × 0.22m structural roof thickness`,
    quantity: Number(footprintAreaM2.toFixed(2)),
    quantityUnit: 'm2',
    thicknessM: 0.22,
    assignedFactorId: isTimberFraming ? 'epd-mass-timber-clt-glulam' : 'ice-rc-c30-37-cem1',
    mappingConfidence: buildingSourceType === 'model-derived-geometry' ? 'high' : 'low',
    serviceLifeYears: 60,
    transportDistanceKm: 60,
    transportFactorId: 'defra-road-freight-hgv-average',
    wasteRatePercent: 5,
    includeEndOfLife: true,
    includeModuleD: true,
  });

  // 5. External Envelope Walls & Glazing
  const externalPerimeterM = 4 * Math.sqrt(footprintAreaM2) * 1.12;
  const grossFacadeAreaM2 = externalPerimeterM * storeyHeightM * floors;
  const glazingRatio = activeAlt?.facade?.windowStyle === 'floor-to-ceiling' ? 0.35 : 0.22;
  const windowAreaM2 = Number((grossFacadeAreaM2 * glazingRatio).toFixed(2));
  const opaqueWallAreaM2 = Number((grossFacadeAreaM2 * (1 - glazingRatio)).toFixed(2));

  inventory.push({
    itemId: 'inv-external-walls-opaque',
    elementName: `Opaque External Facade Walls (${facadeMaterial.toUpperCase()} Primary Cladding)`,
    elementCategory: 'external-walls-facade',
    sourceType: buildingSourceType,
    sourceDescription: `Gross facade (${grossFacadeAreaM2.toFixed(1)} m2) minus ${Math.round(glazingRatio * 100)}% glazing ratio`,
    quantity: opaqueWallAreaM2,
    quantityUnit: 'm2',
    thicknessM: facadeThicknessM,
    assignedFactorId: facadeFactorId,
    mappingConfidence: buildingSourceType === 'model-derived-geometry' ? 'high' : 'low',
    serviceLifeYears: 60,
    transportDistanceKm: 120,
    transportFactorId: 'defra-road-freight-hgv-average',
    wasteRatePercent: 6,
    includeEndOfLife: true,
    includeModuleD: true,
  });

  inventory.push({
    itemId: 'inv-windows-external-doors',
    elementName: 'External Windows, Glazed Doors & Frames',
    elementCategory: 'windows-external-doors',
    sourceType: buildingSourceType,
    sourceDescription: `External fenestration area (${Math.round(glazingRatio * 100)}% of facade envelope)`,
    quantity: windowAreaM2,
    quantityUnit: 'm2',
    thicknessM: 0.05,
    assignedFactorId: 'ice-double-glazed-aluminium-window',
    mappingConfidence: 'medium',
    serviceLifeYears: 30,
    transportDistanceKm: 200,
    transportFactorId: 'defra-road-freight-hgv-average',
    wasteRatePercent: 2,
    includeEndOfLife: true,
    includeModuleD: true,
  });

  // 6. Internal Partitions
  const netInternalPartitionLengthM =
    internalRoomPerimeterM > 0 ? internalRoomPerimeterM * 0.55 : externalPerimeterM * 1.4;
  const internalPartitionAreaM2 = Number((netInternalPartitionLengthM * storeyHeightM * floors * 0.85).toFixed(2));
  inventory.push({
    itemId: 'inv-internal-partitions',
    elementName: 'Internal Room Partitions & Drylining',
    elementCategory: 'internal-walls-partitions',
    sourceType: buildingSourceType,
    sourceDescription: `Derived from internal room wall perimeters across ${floors} floor(s)`,
    quantity: Math.max(10, internalPartitionAreaM2),
    quantityUnit: 'm2',
    thicknessM: 0.125,
    assignedFactorId: 'ice-gypsum-stud-partition',
    mappingConfidence: buildingSourceType === 'model-derived-geometry' ? 'high' : 'low',
    serviceLifeYears: 30,
    transportDistanceKm: 100,
    transportFactorId: 'defra-road-freight-hgv-average',
    wasteRatePercent: 8,
    includeEndOfLife: true,
    includeModuleD: true,
  });

  // 7. Internal Floor Finishes
  inventory.push({
    itemId: 'inv-internal-floor-finishes',
    elementName: 'Internal Floor Finishes & Acoustic Screed',
    elementCategory: 'internal-finishes',
    sourceType: buildingSourceType,
    sourceDescription: `Treated internal floor area (${treatedFloorAreaM2.toFixed(1)} m2)`,
    quantity: treatedFloorAreaM2,
    quantityUnit: 'm2',
    thicknessM: 0.05,
    assignedFactorId: 'ice-floor-finish-porcelain-screed',
    mappingConfidence: 'medium',
    serviceLifeYears: 25,
    transportDistanceKm: 150,
    transportFactorId: 'defra-road-freight-hgv-average',
    wasteRatePercent: 7,
    includeEndOfLife: true,
    includeModuleD: true,
  });

  // 8. MEP Building Services
  inventory.push({
    itemId: 'inv-mep-building-services',
    elementName: 'MEP Building Services (HVAC, Electrical, Plumbing & Controls)',
    elementCategory: 'mep-services',
    sourceType: project.mepCoordination ? 'model-derived-geometry' : 'default-assumption',
    sourceDescription: `GIA-normalized MEP services allowance across ${grossInternalFloorAreaM2.toFixed(1)} m2 (CIBSE TM65 baseline)`,
    quantity: grossInternalFloorAreaM2,
    quantityUnit: 'm2',
    assignedFactorId: 'cibse-mep-residential-commercial-services',
    mappingConfidence: 'medium',
    serviceLifeYears: 20,
    transportDistanceKm: 250,
    transportFactorId: 'defra-road-freight-hgv-average',
    wasteRatePercent: 3,
    includeEndOfLife: true,
    includeModuleD: true,
  });

  // 9. P41 OpenBIM / IFC Preserved Elements Check (with strict duplicate prevention)
  if (project.ifcInterop) {
    const mappedGlobalIds = new Set(project.ifcInterop.idMappings.map((m) => m.sourceGlobalId));
    const preserved = project.ifcInterop.preservedElements ?? [];
    let skippedDuplicateCount = 0;

    for (const elem of preserved) {
      if (mappedGlobalIds.has(elem.globalId) || elem.preservationStatus === 'imported-and-editable') {
        skippedDuplicateCount++;
        continue;
      }

      const validQuantities = (elem.quantities ?? []).filter(
        (q) => Number.isFinite(q.value) && q.value > 0
      );
      if (validQuantities.length === 0) continue;

      const primaryQty = validQuantities[0];
      let qtyUnit: 'm2' | 'm3' | 'm' | 'item' = 'item';
      if (primaryQty.quantityType === 'volume') qtyUnit = 'm3';
      else if (primaryQty.quantityType === 'area') qtyUnit = 'm2';
      else if (primaryQty.quantityType === 'length') qtyUnit = 'm';

      let category: CarbonElementCategory = 'superstructure-frame';
      let defaultFactor = 'ice-rc-c30-37-cem1';
      let thicknessM: number | undefined;

      if (elem.ifcType === 'IFCWALL' || elem.ifcType === 'IFCWALLSTANDARDCASE') {
        category = 'external-walls-facade';
        defaultFactor = 'ice-clay-brick-masonry';
        if (qtyUnit === 'm2') thicknessM = 0.2;
      } else if (elem.ifcType === 'IFCSLAB') {
        category = 'superstructure-upper-floors';
        defaultFactor = 'ice-rc-c30-37-cem1';
        if (qtyUnit === 'm2') thicknessM = 0.2;
      } else if (elem.ifcType === 'IFUROOF' || elem.ifcType === 'IFCROOF') {
        category = 'superstructure-roof';
        defaultFactor = 'ice-rc-c30-37-cem1';
        if (qtyUnit === 'm2') thicknessM = 0.22;
      } else if (elem.ifcType === 'IFCWINDOW' || elem.ifcType === 'IFCDOOR') {
        category = 'windows-external-doors';
        defaultFactor = 'ice-double-glazed-aluminium-window';
      }

      if (qtyUnit === 'm2' || qtyUnit === 'm3') {
        inventory.push({
          itemId: `inv-ifc-${elem.globalId}`,
          elementName: `IFC Preserved ${elem.ifcType}: ${elem.name}`,
          elementCategory: category,
          sourceType: 'ifc-preserved-element',
          sourceReferenceId: elem.globalId,
          sourceDescription: `P41 IFC preserved element (${elem.ifcType}, GlobalId ${elem.globalId}, materials: ${elem.materials.join(', ') || 'unspecified'})`,
          quantity: Number(primaryQty.value.toFixed(3)),
          quantityUnit: qtyUnit,
          thicknessM,
          assignedFactorId: defaultFactor,
          mappingConfidence: elem.materials.length > 0 ? 'high' : 'medium',
          serviceLifeYears: 60,
          transportDistanceKm: 80,
          transportFactorId: 'defra-road-freight-hgv-average',
          wasteRatePercent: 5,
          includeEndOfLife: true,
          includeModuleD: true,
        });
      }
    }

    if (skippedDuplicateCount > 0) {
      warnings.push({
        code: 'IFC_DUPLICATE_PREVENTED',
        severity: 'info',
        sourceDomain: 'ifc',
        message: `${skippedDuplicateCount} P41 IFC element(s) already mapped to native Plotify rooms/columns/beams were excluded from duplicate IFC extraction to prevent double counting.`,
      });
    }
  }

  // 10. P42 CAD Drawing Exchange Boundary Check
  if (project.cadInterop && (project.cadInterop.referenceEntities?.length ?? 0) > 0) {
    warnings.push({
      code: 'CAD_2D_VOLUME_NOT_INFERRED',
      severity: 'info',
      sourceDomain: 'cad',
      message: `Project contains ${project.cadInterop.referenceEntities.length} P42 2D CAD reference entity(ies). Plotify P44 does not fabricate 3D wall/slab volumes or material masses from 2D CAD lines/polylines without explicit 3D thickness, height, and material metadata.`,
    });
  }

  // 11. P43 Terrain & Topographic Site Modeling Boundary Check
  if (project.terrainModeling) {
    warnings.push({
      code: 'TERRAIN_EXCAVATION_NOT_INFERRED',
      severity: 'info',
      sourceDomain: 'terrain',
      message: `Project contains P43 Terrain & Topographic Site Modeling (${project.terrainModeling.sourcePointCount} elevation points). Existing-ground topography alone does not define proposed cut/fill earthwork volumes; enter explicit pre-construction/earthwork emissions in A0/A5 if required.`,
    });
  }

  return {
    grossInternalFloorAreaM2,
    treatedFloorAreaM2,
    inventory,
    warnings,
  };
}

/**
 * Evaluates a complete, deterministic Whole-Life Carbon Assessment for the given inventory,
 * custom factors, operational energy/water inputs, and study period.
 */
export function evaluateWholeLifeCarbonAssessment(params: {
  assessmentId?: string;
  assessmentName?: string;
  createdAt?: string;
  referenceStudyPeriodYears: number;
  grossInternalFloorAreaM2: number;
  treatedFloorAreaM2?: number;
  occupantsCount?: number;
  inventory: CarbonMaterialInventoryItem[];
  customFactors?: CarbonFactorRecord[];
  operationalEnergy: CarbonOperationalEnergyInput;
  operationalWater: CarbonOperationalWaterInput;
  siteAndInUseInputs?: CarbonSiteConstructionInput;
  includeBiogenicInTotals?: boolean;
  extractionWarnings?: CarbonInventoryExtractionWarning[];
}): WholeLifeCarbonAssessment {
  const nowIso = new Date().toISOString();
  const assessmentId = params.assessmentId ?? `wlc-${Date.now()}`;
  const assessmentName = params.assessmentName?.trim() || 'Baseline Whole-Life Carbon Assessment';
  const createdAt = params.createdAt ?? nowIso;
  const referenceStudyPeriodYears = Math.max(1, Math.round(params.referenceStudyPeriodYears || 60));
  const grossInternalFloorAreaM2 = Number.isFinite(params.grossInternalFloorAreaM2) && params.grossInternalFloorAreaM2 > 0
    ? params.grossInternalFloorAreaM2
    : 0;
  const treatedFloorAreaM2 =
    params.treatedFloorAreaM2 && params.treatedFloorAreaM2 > 0
      ? params.treatedFloorAreaM2
      : Number((grossInternalFloorAreaM2 * 0.9).toFixed(2));
  const includeBiogenicInTotals = params.includeBiogenicInTotals ?? false;
  const customFactors = params.customFactors ?? [];
  const allFactors = getAllAvailableCarbonFactors(customFactors);
  const factorMap = new Map<string, CarbonFactorRecord>(allFactors.map((f) => [f.factorId, f]));

  const siteAndInUseInputs: CarbonSiteConstructionInput = params.siteAndInUseInputs ?? {
    enableA0PreConstruction: false,
    enableA5SiteActivities: false,
    enableB1InUseRelease: false,
    enableB2B3MaintenanceRepair: false,
    enableB8UserActivities: false,
  };

  const calculationTraces: CarbonCalculationTrace[] = [];
  const validationIssues: CarbonValidationIssue[] = [];
  const extractionWarnings = [...(params.extractionWarnings ?? [])];

  // Surface extraction warnings in validationIssues if relevant
  for (const w of extractionWarnings) {
    if (w.code === 'CAD_2D_VOLUME_NOT_INFERRED' || w.code === 'TERRAIN_EXCAVATION_NOT_INFERRED' || w.code === 'IFC_DUPLICATE_PREVENTED') {
      validationIssues.push({
        issueId: `val-ext-${w.code}`,
        severity: 'info',
        code: w.code,
        message: w.message,
        remediationHint: 'Informational boundary check preserving data integrity across P41–P44.',
      });
    }
  }

  if (grossInternalFloorAreaM2 <= 0) {
    validationIssues.push({
      issueId: 'val-missing-gfa',
      severity: 'warning',
      code: 'MISSING_GFA_REFERENCE',
      message: 'Gross Internal Floor Area (GFA) is 0 or missing; carbon intensity metrics (kgCO2e/m2) cannot be normalized.',
      remediationHint: 'Provide a positive Gross Internal Floor Area (m2) or add rooms to the floor plan.',
    });
  }

  // Module accumulators
  let a1a3TotalKg = 0;
  let a4TotalKg = 0;
  let a5MaterialWasteKg = 0;
  let b4ReplacementTotalKg = 0;
  let c1c4TotalKg = 0;
  let moduleDMaterialRecyclingKg = 0;

  let totalBiogenicStorageA1A3Kg = 0;
  let totalBiogenicReleaseC3C4Kg = 0;
  let biogenicItemsCount = 0;

  let mappedInventoryItems = 0;
  let unmappedInventoryItems = 0;
  let invalidConversionItems = 0;

  // Emissions share accumulators for data quality
  let verifiedEpdKg = 0;
  let authoritativeGenericKg = 0;
  let userImportedUnverifiedKg = 0;
  let scenarioAssumptionKg = 0;

  let modelDerivedKg = 0;
  let ifcPreservedKg = 0;
  let costScheduleDerivedKg = 0;
  let userEnteredKg = 0;
  let defaultAssumptionKg = 0;

  const itemEmissionsMap = new Map<string, { item: CarbonMaterialInventoryItem; totalACTg: number; factorName: string }>();
  const categoryEmissionsMap = new Map<CarbonElementCategory, number>();

  for (const item of params.inventory) {
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      invalidConversionItems++;
      validationIssues.push({
        issueId: `val-qty-${item.itemId}`,
        severity: 'error',
        code: 'ZERO_OR_NEGATIVE_QUANTITY',
        itemId: item.itemId,
        message: `Inventory item "${item.elementName}" has a non-positive or invalid quantity (${item.quantity} ${item.quantityUnit}).`,
        remediationHint: 'Enter a finite positive quantity for this building element.',
      });
      continue;
    }

    if (!item.assignedFactorId || !factorMap.has(item.assignedFactorId)) {
      unmappedInventoryItems++;
      validationIssues.push({
        issueId: `val-unmapped-${item.itemId}`,
        severity: 'warning',
        code: 'UNMAPPED_INVENTORY_ITEM',
        moduleCode: 'A1-A3',
        itemId: item.itemId,
        message: `Inventory item "${item.elementName}" (${item.quantity} ${item.quantityUnit}) is not mapped to a valid carbon factor and is excluded from calculated totals.`,
        remediationHint: 'Assign a compatible carbon factor or EPD record to include this element in the assessment.',
      });
      continue;
    }

    const factor = factorMap.get(item.assignedFactorId)!;
    const effectiveDensity = item.densityOverrideKgPerM3 ?? factor.densityKgPerM3;

    const conversion = convertInventoryQuantityToDeclaredUnit({
      quantity: item.quantity,
      sourceUnit: item.quantityUnit,
      targetUnit: factor.declaredUnit,
      thicknessM: item.thicknessM,
      densityKgPerM3: effectiveDensity,
    });

    if (!conversion.valid || conversion.convertedQuantity === undefined) {
      invalidConversionItems++;
      validationIssues.push({
        issueId: `val-conv-${item.itemId}`,
        severity: 'error',
        code: 'UNIT_CONVERSION_ERROR',
        moduleCode: 'A1-A3',
        itemId: item.itemId,
        message: `Unit conversion failed for "${item.elementName}": ${conversion.errorReason}`,
        remediationHint: 'Provide the required physical property (thicknessM or densityKgPerM3) or select a factor with a matching declared unit.',
      });
      continue;
    }

    mappedInventoryItems++;

    if (factor.verificationStatus === 'user-imported-unverified' && !factor.userConfirmedUnverified) {
      validationIssues.push({
        issueId: `val-unverified-factor-${item.itemId}`,
        severity: 'warning',
        code: 'UNVERIFIED_USER_FACTOR',
        moduleCode: 'A1-A3',
        itemId: item.itemId,
        message: `Item "${item.elementName}" uses user-imported unverified factor "${factor.name}" (${factor.sourceReference}).`,
        remediationHint: 'Confirm the custom factor provenance or replace with a verified EPD / authoritative generic factor.',
      });
    }

    const convertedQty = conversion.convertedQuantity;

    // A1-A3 Product Stage
    const fossilA1A3Kg = convertedQty * factor.gwpValueKgCO2ePerUnit;
    const itemBiogenicStorageKg = convertedQty * (factor.biogenicStorageKgCO2ePerUnit ?? 0);
    const itemBiogenicReleaseKg =
      item.includeEndOfLife || includeBiogenicInTotals
        ? convertedQty * (factor.biogenicEndOfLifeReleaseKgCO2ePerUnit ?? Math.abs(factor.biogenicStorageKgCO2ePerUnit ?? 0))
        : 0;

    if (itemBiogenicStorageKg !== 0) {
      biogenicItemsCount++;
      totalBiogenicStorageA1A3Kg += itemBiogenicStorageKg;
      totalBiogenicReleaseC3C4Kg += itemBiogenicReleaseKg;

      if (includeBiogenicInTotals && !item.includeEndOfLife) {
        validationIssues.push({
          issueId: `val-biogenic-eol-${item.itemId}`,
          severity: 'warning',
          code: 'BIOGENIC_BALANCE_CHECK',
          moduleCode: 'C1-C4',
          itemId: item.itemId,
          message: `Biogenic storage (${itemBiogenicStorageKg.toFixed(1)} kgCO2e) is included in A1–A3 for "${item.elementName}", so end-of-life biogenic release is automatically enforced to prevent crediting permanent storage without C3–C4 accounting.`,
          remediationHint: 'Keep End-of-Life C1–C4 enabled for bio-based materials per EN 15978.',
        });
      }
    }

    const effectiveA1A3Kg = includeBiogenicInTotals ? fossilA1A3Kg + itemBiogenicStorageKg : fossilA1A3Kg;
    a1a3TotalKg += effectiveA1A3Kg;

    calculationTraces.push({
      traceId: `trace-a1a3-${item.itemId}`,
      moduleCode: 'A1-A3',
      itemId: item.itemId,
      elementName: item.elementName,
      elementCategory: item.elementCategory,
      quantitySourceType: item.sourceType,
      rawQuantity: item.quantity,
      rawUnit: item.quantityUnit,
      convertedQuantity: Number(convertedQty.toFixed(4)),
      declaredUnit: factor.declaredUnit,
      conversionExplanation: conversion.conversionFormula ?? '',
      factorId: factor.factorId,
      factorName: factor.name,
      factorSourceReference: factor.sourceReference,
      factorVerificationStatus: factor.verificationStatus,
      factorValueKgCO2ePerUnit: factor.gwpValueKgCO2ePerUnit,
      formulaDescription: `${convertedQty.toFixed(3)} ${factor.declaredUnit} × ${factor.gwpValueKgCO2ePerUnit} kgCO2e/${factor.declaredUnit}${
        includeBiogenicInTotals && itemBiogenicStorageKg !== 0
          ? ` + (${itemBiogenicStorageKg.toFixed(1)} kgCO2e biogenic)`
          : ''
      }`,
      emissionsKgCO2e: Number(effectiveA1A3Kg.toFixed(2)),
      biogenicStorageKgCO2e: Number(itemBiogenicStorageKg.toFixed(2)),
      biogenicReleaseKgCO2e: 0,
      assumptions: [item.sourceDescription],
    });

    // A4 Transport to site
    const transportDistanceKm = item.transportDistanceKm ?? factor.defaultTransportDistanceKm ?? 80;
    const transportFactor = factorMap.get(item.transportFactorId ?? 'defra-road-freight-hgv-average') ??
      factorMap.get('defra-road-freight-hgv-average')!;
    let itemA4Kg = 0;

    if (transportDistanceKm > 0 && conversion.massKg && conversion.massKg > 0) {
      const massTonnes = conversion.massKg / 1000;
      const tonneKm = massTonnes * transportDistanceKm;
      itemA4Kg = tonneKm * transportFactor.gwpValueKgCO2ePerUnit;
      a4TotalKg += itemA4Kg;

      calculationTraces.push({
        traceId: `trace-a4-${item.itemId}`,
        moduleCode: 'A4',
        itemId: item.itemId,
        elementName: `${item.elementName} (Site Transport)`,
        elementCategory: item.elementCategory,
        quantitySourceType: item.sourceType,
        rawQuantity: Number(massTonnes.toFixed(3)),
        rawUnit: 'tonne',
        convertedQuantity: Number(tonneKm.toFixed(2)),
        declaredUnit: 'tonne-km',
        conversionExplanation: `${massTonnes.toFixed(3)} tonnes × ${transportDistanceKm} km = ${tonneKm.toFixed(2)} tonne-km`,
        factorId: transportFactor.factorId,
        factorName: transportFactor.name,
        factorSourceReference: transportFactor.sourceReference,
        factorVerificationStatus: transportFactor.verificationStatus,
        factorValueKgCO2ePerUnit: transportFactor.gwpValueKgCO2ePerUnit,
        formulaDescription: `${tonneKm.toFixed(2)} tonne-km × ${transportFactor.gwpValueKgCO2ePerUnit} kgCO2e/tonne-km`,
        emissionsKgCO2e: Number(itemA4Kg.toFixed(2)),
        biogenicStorageKgCO2e: 0,
        biogenicReleaseKgCO2e: 0,
        assumptions: [`Road freight transport distance: ${transportDistanceKm} km`],
      });
    }

    // A5 Construction material waste
    const wasteRatePercent = item.wasteRatePercent ?? factor.defaultWasteRatePercent ?? 5;
    let itemA5WasteKg = 0;
    if (wasteRatePercent > 0) {
      const wasteFraction = wasteRatePercent / 100;
      itemA5WasteKg = (fossilA1A3Kg + itemA4Kg) * wasteFraction;
      a5MaterialWasteKg += itemA5WasteKg;

      calculationTraces.push({
        traceId: `trace-a5-${item.itemId}`,
        moduleCode: 'A5',
        itemId: item.itemId,
        elementName: `${item.elementName} (Site Material Waste ${wasteRatePercent}%)`,
        elementCategory: item.elementCategory,
        quantitySourceType: item.sourceType,
        rawQuantity: wasteRatePercent,
        rawUnit: '%',
        convertedQuantity: Number((convertedQty * wasteFraction).toFixed(4)),
        declaredUnit: factor.declaredUnit,
        conversionExplanation: `${wasteRatePercent}% site waste factor applied to A1–A4 embodied emissions`,
        factorId: factor.factorId,
        factorName: factor.name,
        factorSourceReference: factor.sourceReference,
        factorVerificationStatus: factor.verificationStatus,
        factorValueKgCO2ePerUnit: factor.gwpValueKgCO2ePerUnit,
        formulaDescription: `(${fossilA1A3Kg.toFixed(1)} + ${itemA4Kg.toFixed(1)}) kgCO2e × ${wasteRatePercent}%`,
        emissionsKgCO2e: Number(itemA5WasteKg.toFixed(2)),
        biogenicStorageKgCO2e: 0,
        biogenicReleaseKgCO2e: 0,
        assumptions: [`Site waste rate: ${wasteRatePercent}%`],
      });
    }

    // C1-C4 End of Life
    let itemC1C4Kg = 0;
    const eolPerUnit = factor.endOfLifeC1C4KgCO2ePerUnit ?? 0;
    if (item.includeEndOfLife || (includeBiogenicInTotals && itemBiogenicStorageKg !== 0)) {
      const fossilEolKg = item.includeEndOfLife ? convertedQty * eolPerUnit : 0;
      const enforcedBioReleaseKg =
        includeBiogenicInTotals && itemBiogenicStorageKg !== 0
          ? convertedQty * (factor.biogenicEndOfLifeReleaseKgCO2ePerUnit ?? Math.abs(factor.biogenicStorageKgCO2ePerUnit ?? 0))
          : 0;
      itemC1C4Kg = fossilEolKg + enforcedBioReleaseKg;
      c1c4TotalKg += itemC1C4Kg;

      calculationTraces.push({
        traceId: `trace-c1c4-${item.itemId}`,
        moduleCode: 'C1-C4',
        itemId: item.itemId,
        elementName: `${item.elementName} (End-of-Life C1–C4)`,
        elementCategory: item.elementCategory,
        quantitySourceType: item.sourceType,
        rawQuantity: item.quantity,
        rawUnit: item.quantityUnit,
        convertedQuantity: Number(convertedQty.toFixed(4)),
        declaredUnit: factor.declaredUnit,
        conversionExplanation: conversion.conversionFormula ?? '',
        factorId: factor.factorId,
        factorName: factor.name,
        factorSourceReference: factor.sourceReference,
        factorVerificationStatus: factor.verificationStatus,
        factorValueKgCO2ePerUnit: eolPerUnit,
        formulaDescription: `${convertedQty.toFixed(3)} ${factor.declaredUnit} × ${eolPerUnit} kgCO2e/${factor.declaredUnit}${
          enforcedBioReleaseKg !== 0 ? ` + ${enforcedBioReleaseKg.toFixed(1)} kgCO2e biogenic EoL balance` : ''
        }`,
        emissionsKgCO2e: Number(itemC1C4Kg.toFixed(2)),
        biogenicStorageKgCO2e: 0,
        biogenicReleaseKgCO2e: Number(enforcedBioReleaseKg.toFixed(2)),
        assumptions: ['End-of-life deconstruction, waste processing & disposal (C1–C4)'],
      });
    }

    // B2-B5 Component Replacement Cycles (B4)
    const serviceLifeYears = item.serviceLifeYears ?? factor.defaultServiceLifeYears ?? 60;
    let itemB4Kg = 0;
    if (serviceLifeYears > 0 && serviceLifeYears < referenceStudyPeriodYears) {
      const replacementCycles = Math.max(0, Math.ceil(referenceStudyPeriodYears / serviceLifeYears) - 1);
      if (replacementCycles > 0) {
        const singleCycleKg = fossilA1A3Kg + itemA4Kg + itemA5WasteKg + convertedQty * eolPerUnit;
        itemB4Kg = singleCycleKg * replacementCycles;
        b4ReplacementTotalKg += itemB4Kg;

        calculationTraces.push({
          traceId: `trace-b4-${item.itemId}`,
          moduleCode: 'B2-B5',
          itemId: item.itemId,
          elementName: `${item.elementName} (${replacementCycles} Replacement Cycle${replacementCycles > 1 ? 's' : ''} over ${referenceStudyPeriodYears} yrs)`,
          elementCategory: item.elementCategory,
          quantitySourceType: item.sourceType,
          rawQuantity: replacementCycles,
          rawUnit: 'item',
          convertedQuantity: replacementCycles,
          declaredUnit: 'item',
          conversionExplanation: `ceil(${referenceStudyPeriodYears} yr RSP / ${serviceLifeYears} yr lifespan) - 1 = ${replacementCycles} cycle(s)`,
          factorId: factor.factorId,
          factorName: factor.name,
          factorSourceReference: factor.sourceReference,
          factorVerificationStatus: factor.verificationStatus,
          factorValueKgCO2ePerUnit: Number(singleCycleKg.toFixed(2)),
          formulaDescription: `${replacementCycles} cycle(s) × ${singleCycleKg.toFixed(1)} kgCO2e/cycle`,
          emissionsKgCO2e: Number(itemB4Kg.toFixed(2)),
          biogenicStorageKgCO2e: 0,
          biogenicReleaseKgCO2e: 0,
          assumptions: [
            `Component service life: ${serviceLifeYears} years; Reference Study Period: ${referenceStudyPeriodYears} years`,
          ],
        });
      }
    } else if (serviceLifeYears > referenceStudyPeriodYears) {
      validationIssues.push({
        issueId: `val-lifespan-${item.itemId}`,
        severity: 'info',
        code: 'SERVICE_LIFE_EXCEEDS_STUDY_PERIOD',
        moduleCode: 'B2-B5',
        itemId: item.itemId,
        message: `Component "${item.elementName}" has a service life (${serviceLifeYears} yrs) exceeding the Reference Study Period (${referenceStudyPeriodYears} yrs); 0 B4 replacements scheduled.`,
        remediationHint: 'No action required unless a longer Reference Study Period is desired.',
      });
    }

    // Module D (strictly separate!)
    if (item.includeModuleD && typeof factor.moduleDBenefitKgCO2ePerUnit === 'number') {
      const itemModuleDKg = convertedQty * factor.moduleDBenefitKgCO2ePerUnit;
      moduleDMaterialRecyclingKg += itemModuleDKg;

      calculationTraces.push({
        traceId: `trace-d-${item.itemId}`,
        moduleCode: 'D',
        itemId: item.itemId,
        elementName: `${item.elementName} (Module D Recycling/Recovery Potential)`,
        elementCategory: item.elementCategory,
        quantitySourceType: item.sourceType,
        rawQuantity: item.quantity,
        rawUnit: item.quantityUnit,
        convertedQuantity: Number(convertedQty.toFixed(4)),
        declaredUnit: factor.declaredUnit,
        conversionExplanation: conversion.conversionFormula ?? '',
        factorId: factor.factorId,
        factorName: factor.name,
        factorSourceReference: factor.sourceReference,
        factorVerificationStatus: factor.verificationStatus,
        factorValueKgCO2ePerUnit: factor.moduleDBenefitKgCO2ePerUnit,
        formulaDescription: `${convertedQty.toFixed(3)} ${factor.declaredUnit} × ${factor.moduleDBenefitKgCO2ePerUnit} kgCO2e/${factor.declaredUnit} (Reported Separately)`,
        emissionsKgCO2e: Number(itemModuleDKg.toFixed(2)),
        biogenicStorageKgCO2e: 0,
        biogenicReleaseKgCO2e: 0,
        assumptions: ['Module D circularity benefit/load beyond system boundary — never subtracted from A–C totals'],
      });
    }

    // Aggregate item embodied A-C total for hotspots and data quality shares
    const itemTotalACKg = effectiveA1A3Kg + itemA4Kg + itemA5WasteKg + itemB4Kg + itemC1C4Kg;
    itemEmissionsMap.set(item.itemId, { item, totalACTg: itemTotalACKg, factorName: factor.name });
    categoryEmissionsMap.set(
      item.elementCategory,
      (categoryEmissionsMap.get(item.elementCategory) ?? 0) + itemTotalACKg
    );

    const positiveWeightKg = Math.max(0, itemTotalACKg);
    if (factor.verificationStatus === 'verified-epd') verifiedEpdKg += positiveWeightKg;
    else if (factor.verificationStatus === 'authoritative-generic') authoritativeGenericKg += positiveWeightKg;
    else if (factor.verificationStatus === 'user-imported-unverified') userImportedUnverifiedKg += positiveWeightKg;
    else scenarioAssumptionKg += positiveWeightKg;

    if (item.sourceType === 'model-derived-geometry') modelDerivedKg += positiveWeightKg;
    else if (item.sourceType === 'ifc-preserved-element') ifcPreservedKg += positiveWeightKg;
    else if (item.sourceType === 'cost-schedule-derived') costScheduleDerivedKg += positiveWeightKg;
    else if (item.sourceType === 'user-entered') userEnteredKg += positiveWeightKg;
    else defaultAssumptionKg += positiveWeightKg;
  }

  // Optional A0 Pre-construction
  let a0Status: CarbonLifecycleModuleResult['status'] = 'unassessed';
  let a0EmissionsKg: number | null = null;
  if (
    siteAndInUseInputs.enableA0PreConstruction &&
    typeof siteAndInUseInputs.a0PreConstructionKgCO2e === 'number' &&
    Number.isFinite(siteAndInUseInputs.a0PreConstructionKgCO2e) &&
    siteAndInUseInputs.a0PreConstructionKgCO2e >= 0
  ) {
    a0Status = 'assessed';
    a0EmissionsKg = siteAndInUseInputs.a0PreConstructionKgCO2e;
    calculationTraces.push({
      traceId: 'trace-a0-site',
      moduleCode: 'A0',
      elementName: 'Pre-Construction Site Investigations & Enabling Works',
      quantitySourceType: 'user-entered',
      rawQuantity: 1,
      rawUnit: 'item',
      convertedQuantity: 1,
      declaredUnit: 'item',
      conversionExplanation: 'Direct user-entered A0 allowance',
      factorId: 'user-a0-allowance',
      factorName: 'A0 Pre-Construction Allowance',
      factorSourceReference: siteAndInUseInputs.a0BasisNote || 'User-entered A0 pre-construction input',
      factorVerificationStatus: 'scenario-assumption',
      factorValueKgCO2ePerUnit: a0EmissionsKg,
      formulaDescription: `1 item × ${a0EmissionsKg.toFixed(1)} kgCO2e`,
      emissionsKgCO2e: Number(a0EmissionsKg.toFixed(2)),
      biogenicStorageKgCO2e: 0,
      biogenicReleaseKgCO2e: 0,
      assumptions: [siteAndInUseInputs.a0BasisNote || 'User-defined A0 pre-construction emissions'],
    });
  }

  // Optional A5 direct site process emissions
  let a5DirectSiteKg = 0;
  if (
    siteAndInUseInputs.enableA5SiteActivities &&
    typeof siteAndInUseInputs.a5DirectSiteProcessKgCO2e === 'number' &&
    Number.isFinite(siteAndInUseInputs.a5DirectSiteProcessKgCO2e) &&
    siteAndInUseInputs.a5DirectSiteProcessKgCO2e > 0
  ) {
    a5DirectSiteKg = siteAndInUseInputs.a5DirectSiteProcessKgCO2e;
    calculationTraces.push({
      traceId: 'trace-a5-site-process',
      moduleCode: 'A5',
      elementName: 'A5a On-Site Construction Plant & Temporary Site Energy',
      quantitySourceType: 'user-entered',
      rawQuantity: 1,
      rawUnit: 'item',
      convertedQuantity: 1,
      declaredUnit: 'item',
      conversionExplanation: 'Direct site plant/energy input',
      factorId: 'user-a5-site-process',
      factorName: 'On-Site Construction Process Allowance',
      factorSourceReference: 'User-entered A5a site energy/plant input',
      factorVerificationStatus: 'scenario-assumption',
      factorValueKgCO2ePerUnit: a5DirectSiteKg,
      formulaDescription: `${a5DirectSiteKg.toFixed(1)} kgCO2e direct site construction process`,
      emissionsKgCO2e: Number(a5DirectSiteKg.toFixed(2)),
      biogenicStorageKgCO2e: 0,
      biogenicReleaseKgCO2e: 0,
      assumptions: ['User-entered on-site construction energy and machinery emissions'],
    });
  }
  const a5TotalKg = a5MaterialWasteKg + a5DirectSiteKg;

  // Optional B1 In-Use Release
  let b1Status: CarbonLifecycleModuleResult['status'] = 'unassessed';
  let b1EmissionsKg: number | null = null;
  if (
    siteAndInUseInputs.enableB1InUseRelease &&
    typeof siteAndInUseInputs.b1RefrigerantOrMaterialReleaseKgCO2e === 'number' &&
    Number.isFinite(siteAndInUseInputs.b1RefrigerantOrMaterialReleaseKgCO2e)
  ) {
    b1Status = 'assessed';
    b1EmissionsKg = siteAndInUseInputs.b1RefrigerantOrMaterialReleaseKgCO2e;
    calculationTraces.push({
      traceId: 'trace-b1-inuse',
      moduleCode: 'B1',
      elementName: 'B1 In-Use Fugitive Refrigerant / Carbonation Balance',
      quantitySourceType: 'user-entered',
      rawQuantity: 1,
      rawUnit: 'item',
      convertedQuantity: 1,
      declaredUnit: 'item',
      conversionExplanation: 'Direct B1 in-use input over RSP',
      factorId: 'user-b1-input',
      factorName: 'B1 Use Stage Emissions / Carbonation',
      factorSourceReference: 'User-entered B1 input',
      factorVerificationStatus: 'scenario-assumption',
      factorValueKgCO2ePerUnit: b1EmissionsKg,
      formulaDescription: `${b1EmissionsKg.toFixed(1)} kgCO2e over ${referenceStudyPeriodYears} yrs`,
      emissionsKgCO2e: Number(b1EmissionsKg.toFixed(2)),
      biogenicStorageKgCO2e: 0,
      biogenicReleaseKgCO2e: 0,
      assumptions: ['User-entered B1 use-stage release/carbonation over Reference Study Period'],
    });
  }

  // Optional B2-B3 maintenance addition to B2-B5
  let b2b3MaintenanceKg = 0;
  if (
    siteAndInUseInputs.enableB2B3MaintenanceRepair &&
    typeof siteAndInUseInputs.b2B3AnnualMaintenanceKgCO2ePerYear === 'number' &&
    Number.isFinite(siteAndInUseInputs.b2B3AnnualMaintenanceKgCO2ePerYear) &&
    siteAndInUseInputs.b2B3AnnualMaintenanceKgCO2ePerYear > 0
  ) {
    b2b3MaintenanceKg = siteAndInUseInputs.b2B3AnnualMaintenanceKgCO2ePerYear * referenceStudyPeriodYears;
    calculationTraces.push({
      traceId: 'trace-b2b3-maintenance',
      moduleCode: 'B2-B5',
      elementName: 'B2–B3 Routine Maintenance & Minor Repairs',
      quantitySourceType: 'user-entered',
      rawQuantity: siteAndInUseInputs.b2B3AnnualMaintenanceKgCO2ePerYear,
      rawUnit: 'kg/yr',
      convertedQuantity: referenceStudyPeriodYears,
      declaredUnit: 'item',
      conversionExplanation: `${siteAndInUseInputs.b2B3AnnualMaintenanceKgCO2ePerYear} kgCO2e/yr × ${referenceStudyPeriodYears} yrs`,
      factorId: 'user-b2b3-allowance',
      factorName: 'Annual Maintenance & Repair Allowance',
      factorSourceReference: 'User-entered B2-B3 maintenance input',
      factorVerificationStatus: 'scenario-assumption',
      factorValueKgCO2ePerUnit: siteAndInUseInputs.b2B3AnnualMaintenanceKgCO2ePerYear,
      formulaDescription: `${siteAndInUseInputs.b2B3AnnualMaintenanceKgCO2ePerYear} kgCO2e/yr × ${referenceStudyPeriodYears} yrs`,
      emissionsKgCO2e: Number(b2b3MaintenanceKg.toFixed(2)),
      biogenicStorageKgCO2e: 0,
      biogenicReleaseKgCO2e: 0,
      assumptions: [`Evaluated over ${referenceStudyPeriodYears}-year Reference Study Period`],
    });
  }
  const b2b5TotalKg = b4ReplacementTotalKg + b2b3MaintenanceKg;

  // B6 Operational Energy Use (Never silently 0 if unavailable!)
  let b6Status: CarbonLifecycleModuleResult['status'] = 'unavailable';
  let b6EmissionsKg: number | null = null;
  let exportedRenewableModuleDBenefitKg = 0;

  const opEnergy = params.operationalEnergy;
  const hasValidElectricity =
    opEnergy.enabled &&
    opEnergy.sourceType !== 'unavailable' &&
    typeof opEnergy.annualElectricityKwhPerYear === 'number' &&
    Number.isFinite(opEnergy.annualElectricityKwhPerYear) &&
    opEnergy.annualElectricityKwhPerYear >= 0;
  const hasValidFuel =
    opEnergy.enabled &&
    opEnergy.sourceType !== 'unavailable' &&
    typeof opEnergy.annualFuelThermalKwhPerYear === 'number' &&
    Number.isFinite(opEnergy.annualFuelThermalKwhPerYear) &&
    opEnergy.annualFuelThermalKwhPerYear > 0;

  if (hasValidElectricity || hasValidFuel) {
    b6Status = 'assessed';
    let b6AccumKg = 0;

    const gridFactor =
      factorMap.get(opEnergy.electricityGridFactorId ?? 'grid-electricity-average-reference') ??
      factorMap.get('grid-electricity-average-reference')!;

    // Optional grid decarbonisation adjustment over RSP
    const decarbRate =
      typeof opEnergy.gridDecarbonisationFactorPercentPerYear === 'number' &&
      opEnergy.gridDecarbonisationFactorPercentPerYear > 0 &&
      opEnergy.gridDecarbonisationFactorPercentPerYear <= 5
        ? opEnergy.gridDecarbonisationFactorPercentPerYear / 100
        : 0;

    let effectiveRspMultiplier = referenceStudyPeriodYears;
    if (decarbRate > 0) {
      let sum = 0;
      for (let yr = 0; yr < referenceStudyPeriodYears; yr++) {
        sum += Math.pow(1 - decarbRate, yr);
      }
      effectiveRspMultiplier = sum;
    }

    if (hasValidElectricity && opEnergy.annualElectricityKwhPerYear! > 0) {
      const lifetimeElecKwh = opEnergy.annualElectricityKwhPerYear! * effectiveRspMultiplier;
      const elecKg = lifetimeElecKwh * gridFactor.gwpValueKgCO2ePerUnit;
      b6AccumKg += elecKg;

      calculationTraces.push({
        traceId: 'trace-b6-electricity',
        moduleCode: 'B6',
        elementName: 'B6 Operational Grid Electricity Use',
        quantitySourceType: opEnergy.sourceType,
        rawQuantity: opEnergy.annualElectricityKwhPerYear!,
        rawUnit: 'kWh/yr',
        convertedQuantity: Number(lifetimeElecKwh.toFixed(1)),
        declaredUnit: 'kWh',
        conversionExplanation: `${opEnergy.annualElectricityKwhPerYear!.toFixed(0)} kWh/yr × ${effectiveRspMultiplier.toFixed(2)} effective RSP years`,
        factorId: gridFactor.factorId,
        factorName: gridFactor.name,
        factorSourceReference: gridFactor.sourceReference,
        factorVerificationStatus: gridFactor.verificationStatus,
        factorValueKgCO2ePerUnit: gridFactor.gwpValueKgCO2ePerUnit,
        formulaDescription: `${lifetimeElecKwh.toFixed(0)} kWh × ${gridFactor.gwpValueKgCO2ePerUnit} kgCO2e/kWh`,
        emissionsKgCO2e: Number(elecKg.toFixed(2)),
        biogenicStorageKgCO2e: 0,
        biogenicReleaseKgCO2e: 0,
        assumptions: [
          `Source: ${opEnergy.sourceType}; RSP: ${referenceStudyPeriodYears} years`,
          ...(opEnergy.assumptionsNote ? [opEnergy.assumptionsNote] : []),
        ],
      });
    }

    if (hasValidFuel && opEnergy.annualFuelThermalKwhPerYear! > 0) {
      const fuelFactor =
        factorMap.get(opEnergy.fuelFactorId ?? 'fuel-natural-gas-boiler') ??
        factorMap.get('fuel-natural-gas-boiler')!;
      const lifetimeFuelKwh = opEnergy.annualFuelThermalKwhPerYear! * referenceStudyPeriodYears;
      const fuelKg = lifetimeFuelKwh * fuelFactor.gwpValueKgCO2ePerUnit;
      b6AccumKg += fuelKg;

      calculationTraces.push({
        traceId: 'trace-b6-fuel',
        moduleCode: 'B6',
        elementName: 'B6 Operational Thermal Fuel Use',
        quantitySourceType: opEnergy.sourceType,
        rawQuantity: opEnergy.annualFuelThermalKwhPerYear!,
        rawUnit: 'kWh/yr',
        convertedQuantity: Number(lifetimeFuelKwh.toFixed(1)),
        declaredUnit: 'kWh',
        conversionExplanation: `${opEnergy.annualFuelThermalKwhPerYear!.toFixed(0)} kWh/yr × ${referenceStudyPeriodYears} years`,
        factorId: fuelFactor.factorId,
        factorName: fuelFactor.name,
        factorSourceReference: fuelFactor.sourceReference,
        factorVerificationStatus: fuelFactor.verificationStatus,
        factorValueKgCO2ePerUnit: fuelFactor.gwpValueKgCO2ePerUnit,
        formulaDescription: `${lifetimeFuelKwh.toFixed(0)} kWh × ${fuelFactor.gwpValueKgCO2ePerUnit} kgCO2e/kWh`,
        emissionsKgCO2e: Number(fuelKg.toFixed(2)),
        biogenicStorageKgCO2e: 0,
        biogenicReleaseKgCO2e: 0,
        assumptions: [`Source: ${opEnergy.sourceType}; RSP: ${referenceStudyPeriodYears} years`],
      });
    }

    // Exported on-site renewable energy goes strictly to Module D, never subtracted from B6!
    if (
      typeof opEnergy.onSiteRenewableExportedKwhPerYear === 'number' &&
      Number.isFinite(opEnergy.onSiteRenewableExportedKwhPerYear) &&
      opEnergy.onSiteRenewableExportedKwhPerYear > 0
    ) {
      const lifetimeExportKwh = opEnergy.onSiteRenewableExportedKwhPerYear * effectiveRspMultiplier;
      exportedRenewableModuleDBenefitKg = -1 * lifetimeExportKwh * gridFactor.gwpValueKgCO2ePerUnit;

      calculationTraces.push({
        traceId: 'trace-d-exported-renewable',
        moduleCode: 'D',
        elementName: 'Module D Exported On-Site Renewable Electricity Benefit',
        quantitySourceType: opEnergy.sourceType,
        rawQuantity: opEnergy.onSiteRenewableExportedKwhPerYear,
        rawUnit: 'kWh/yr',
        convertedQuantity: Number(lifetimeExportKwh.toFixed(1)),
        declaredUnit: 'kWh',
        conversionExplanation: `${opEnergy.onSiteRenewableExportedKwhPerYear.toFixed(0)} kWh/yr × ${effectiveRspMultiplier.toFixed(2)} effective RSP years`,
        factorId: gridFactor.factorId,
        factorName: gridFactor.name,
        factorSourceReference: gridFactor.sourceReference,
        factorVerificationStatus: gridFactor.verificationStatus,
        factorValueKgCO2ePerUnit: -gridFactor.gwpValueKgCO2ePerUnit,
        formulaDescription: `-${lifetimeExportKwh.toFixed(0)} kWh × ${gridFactor.gwpValueKgCO2ePerUnit} kgCO2e/kWh (Reported in Module D)`,
        emissionsKgCO2e: Number(exportedRenewableModuleDBenefitKg.toFixed(2)),
        biogenicStorageKgCO2e: 0,
        biogenicReleaseKgCO2e: 0,
        assumptions: ['Exported renewable energy is reported in Module D per EN 15978 and not deducted from B6'],
      });
    }

    b6EmissionsKg = b6AccumKg;
  } else {
    validationIssues.push({
      issueId: 'val-missing-b6',
      severity: 'info',
      code: 'MISSING_OPERATIONAL_ENERGY_B6',
      moduleCode: 'B6',
      message:
        'Module B6 (Operational Energy Use) has no energy demand input and is marked "unavailable" (never silently reported as 0 kgCO2e).',
      remediationHint: 'Enable B6 Operational Energy and enter annual electricity/fuel consumption (kWh/yr) to include operational energy.',
    });
  }

  // B7 Operational Water Use (Never silently 0 if unavailable!)
  let b7Status: CarbonLifecycleModuleResult['status'] = 'unavailable';
  let b7EmissionsKg: number | null = null;
  const opWater = params.operationalWater;
  if (
    opWater.enabled &&
    opWater.sourceType !== 'unavailable' &&
    typeof opWater.annualPotableWaterM3PerYear === 'number' &&
    Number.isFinite(opWater.annualPotableWaterM3PerYear) &&
    opWater.annualPotableWaterM3PerYear > 0
  ) {
    b7Status = 'assessed';
    const waterFactor =
      factorMap.get(opWater.waterSupplyAndTreatmentFactorId ?? 'water-potable-supply-and-wastewater') ??
      factorMap.get('water-potable-supply-and-wastewater')!;
    const lifetimeWaterM3 = opWater.annualPotableWaterM3PerYear * referenceStudyPeriodYears;
    b7EmissionsKg = lifetimeWaterM3 * waterFactor.gwpValueKgCO2ePerUnit;

    calculationTraces.push({
      traceId: 'trace-b7-water',
      moduleCode: 'B7',
      elementName: 'B7 Operational Potable Water Supply & Treatment',
      quantitySourceType: opWater.sourceType,
      rawQuantity: opWater.annualPotableWaterM3PerYear,
      rawUnit: 'm3-water/yr',
      convertedQuantity: Number(lifetimeWaterM3.toFixed(1)),
      declaredUnit: 'm3-water',
      conversionExplanation: `${opWater.annualPotableWaterM3PerYear.toFixed(1)} m3/yr × ${referenceStudyPeriodYears} years`,
      factorId: waterFactor.factorId,
      factorName: waterFactor.name,
      factorSourceReference: waterFactor.sourceReference,
      factorVerificationStatus: waterFactor.verificationStatus,
      factorValueKgCO2ePerUnit: waterFactor.gwpValueKgCO2ePerUnit,
      formulaDescription: `${lifetimeWaterM3.toFixed(1)} m3 × ${waterFactor.gwpValueKgCO2ePerUnit} kgCO2e/m3`,
      emissionsKgCO2e: Number(b7EmissionsKg.toFixed(2)),
      biogenicStorageKgCO2e: 0,
      biogenicReleaseKgCO2e: 0,
      assumptions: [`Source: ${opWater.sourceType}; RSP: ${referenceStudyPeriodYears} years`],
    });
  } else {
    validationIssues.push({
      issueId: 'val-missing-b7',
      severity: 'info',
      code: 'MISSING_OPERATIONAL_WATER_B7',
      moduleCode: 'B7',
      message:
        'Module B7 (Operational Water Use) has no water demand input and is marked "unavailable" (never silently reported as 0 kgCO2e).',
      remediationHint: 'Enable B7 Operational Water and enter annual potable water consumption (m3/yr) to include operational water.',
    });
  }

  // B8 Optional User Activities
  let b8Status: CarbonLifecycleModuleResult['status'] = 'unassessed';
  let b8EmissionsKg: number | null = null;
  if (
    siteAndInUseInputs.enableB8UserActivities &&
    typeof siteAndInUseInputs.b8AnnualUserActivitiesKgCO2ePerYear === 'number' &&
    Number.isFinite(siteAndInUseInputs.b8AnnualUserActivitiesKgCO2ePerYear) &&
    siteAndInUseInputs.b8AnnualUserActivitiesKgCO2ePerYear > 0
  ) {
    b8Status = 'assessed';
    b8EmissionsKg = siteAndInUseInputs.b8AnnualUserActivitiesKgCO2ePerYear * referenceStudyPeriodYears;
    calculationTraces.push({
      traceId: 'trace-b8-user',
      moduleCode: 'B8',
      elementName: 'B8 Occupant / User Activities',
      quantitySourceType: 'user-entered',
      rawQuantity: siteAndInUseInputs.b8AnnualUserActivitiesKgCO2ePerYear,
      rawUnit: 'kgCO2e/yr',
      convertedQuantity: referenceStudyPeriodYears,
      declaredUnit: 'item',
      conversionExplanation: `${siteAndInUseInputs.b8AnnualUserActivitiesKgCO2ePerYear} kgCO2e/yr × ${referenceStudyPeriodYears} yrs`,
      factorId: 'user-b8-allowance',
      factorName: 'B8 User Activity Allowance',
      factorSourceReference: 'User-entered B8 input',
      factorVerificationStatus: 'scenario-assumption',
      factorValueKgCO2ePerUnit: siteAndInUseInputs.b8AnnualUserActivitiesKgCO2ePerYear,
      formulaDescription: `${siteAndInUseInputs.b8AnnualUserActivitiesKgCO2ePerYear} kgCO2e/yr × ${referenceStudyPeriodYears} yrs`,
      emissionsKgCO2e: Number(b8EmissionsKg.toFixed(2)),
      biogenicStorageKgCO2e: 0,
      biogenicReleaseKgCO2e: 0,
      assumptions: [`Evaluated over ${referenceStudyPeriodYears}-year Reference Study Period`],
    });
  }

  const totalInventoryCount = params.inventory.length;
  const inventoryCoveragePercent =
    totalInventoryCount > 0 ? Number(((mappedInventoryItems / totalInventoryCount) * 100).toFixed(1)) : 0;
  const embodiedModuleStatus: CarbonLifecycleModuleResult['status'] =
    mappedInventoryItems === 0
      ? 'unassessed'
      : mappedInventoryItems === totalInventoryCount
        ? 'assessed'
        : 'partially-assessed';

  const makeModuleResult = (
    code: CarbonLifecycleModuleCode,
    status: CarbonLifecycleModuleResult['status'],
    emissionsKg: number | null,
    coveragePercent: number,
    explanation: string
  ): CarbonLifecycleModuleResult => {
    const def = SUPPORTED_CARBON_ASSESSMENT_PROFILE.supportedModules.find((m) => m.code === code)!;
    const tracesForMod = calculationTraces.filter((t) => t.moduleCode === code).length;
    const roundedKg = emissionsKg !== null ? Number(emissionsKg.toFixed(2)) : null;
    const roundedT = roundedKg !== null ? Number((roundedKg / 1000).toFixed(4)) : null;
    const intensity =
      roundedKg !== null && grossInternalFloorAreaM2 > 0
        ? Number((roundedKg / grossInternalFloorAreaM2).toFixed(2))
        : null;

    return {
      moduleCode: code,
      title: def.title,
      stageGroup: def.stageGroup,
      status,
      emissionsKgCO2e: roundedKg,
      emissionsTCO2e: roundedT,
      intensityKgCO2ePerM2Gfa: intensity,
      traceCount: tracesForMod,
      coverageRatioPercent: coveragePercent,
      statusExplanation: explanation,
    };
  };

  const netModuleDKg = moduleDMaterialRecyclingKg + exportedRenewableModuleDBenefitKg;
  const hasModuleDTraces = calculationTraces.some((t) => t.moduleCode === 'D');

  const moduleResults: CarbonLifecycleModuleResult[] = [
    makeModuleResult(
      'A0',
      a0Status,
      a0EmissionsKg,
      a0Status === 'assessed' ? 100 : 0,
      a0Status === 'assessed'
        ? 'Assessed from explicit user pre-construction input.'
        : 'Unassessed — no pre-construction A0 allowance entered.'
    ),
    makeModuleResult(
      'A1-A3',
      embodiedModuleStatus,
      mappedInventoryItems > 0 ? a1a3TotalKg : null,
      inventoryCoveragePercent,
      mappedInventoryItems > 0
        ? `Assessed across ${mappedInventoryItems}/${totalInventoryCount} inventory item(s).`
        : 'No valid mapped inventory items available for A1–A3.'
    ),
    makeModuleResult(
      'A4',
      embodiedModuleStatus,
      mappedInventoryItems > 0 ? a4TotalKg : null,
      inventoryCoveragePercent,
      mappedInventoryItems > 0
        ? 'Assessed from element mass (tonnes) × transport distance (km) × freight mode factor.'
        : 'No valid mapped inventory items available for A4.'
    ),
    makeModuleResult(
      'A5',
      embodiedModuleStatus === 'unassessed' && a5DirectSiteKg === 0 ? 'unassessed' : embodiedModuleStatus,
      mappedInventoryItems > 0 || a5DirectSiteKg > 0 ? a5TotalKg : null,
      inventoryCoveragePercent,
      mappedInventoryItems > 0
        ? `Includes construction site material waste${a5DirectSiteKg > 0 ? ' plus direct site energy/process' : ''}.`
        : 'No valid mapped inventory items or site construction inputs available for A5.'
    ),
    makeModuleResult(
      'B1',
      b1Status,
      b1EmissionsKg,
      b1Status === 'assessed' ? 100 : 0,
      b1Status === 'assessed'
        ? 'Assessed from user-entered B1 in-use emissions/carbonation input.'
        : 'Unassessed — no B1 refrigerant leakage or carbonation input entered.'
    ),
    makeModuleResult(
      'B2-B5',
      embodiedModuleStatus,
      mappedInventoryItems > 0 || b2b3MaintenanceKg > 0 ? b2b5TotalKg : null,
      inventoryCoveragePercent,
      mappedInventoryItems > 0
        ? `Assessed component replacement cycles (B4) over ${referenceStudyPeriodYears}-year Reference Study Period.`
        : 'No valid mapped inventory items available for B2–B5.'
    ),
    makeModuleResult(
      'B6',
      b6Status,
      b6EmissionsKg,
      b6Status === 'assessed' ? 100 : 0,
      b6Status === 'assessed'
        ? `Assessed operational energy over ${referenceStudyPeriodYears}-year Reference Study Period.`
        : 'Unavailable — annual operational energy demand (kWh/yr) has not been provided.'
    ),
    makeModuleResult(
      'B7',
      b7Status,
      b7EmissionsKg,
      b7Status === 'assessed' ? 100 : 0,
      b7Status === 'assessed'
        ? `Assessed operational potable water & wastewater treatment over ${referenceStudyPeriodYears}-year RSP.`
        : 'Unavailable — annual potable water demand (m3/yr) has not been provided.'
    ),
    makeModuleResult(
      'B8',
      b8Status,
      b8EmissionsKg,
      b8Status === 'assessed' ? 100 : 0,
      b8Status === 'assessed'
        ? `Assessed user activity emissions over ${referenceStudyPeriodYears}-year RSP.`
        : 'Unassessed — optional B8 user activity emissions not enabled.'
    ),
    makeModuleResult(
      'C1-C4',
      embodiedModuleStatus,
      mappedInventoryItems > 0 ? c1c4TotalKg : null,
      inventoryCoveragePercent,
      mappedInventoryItems > 0
        ? 'Assessed end-of-life deconstruction, waste processing, and disposal.'
        : 'No valid mapped inventory items available for C1–C4.'
    ),
    makeModuleResult(
      'D',
      hasModuleDTraces ? 'assessed' : 'unassessed',
      hasModuleDTraces ? netModuleDKg : null,
      hasModuleDTraces ? inventoryCoveragePercent : 0,
      hasModuleDTraces
        ? 'Reported strictly separately beyond the building lifecycle boundary (never subtracted from A–C totals).'
        : 'Unassessed — no Module D recycling or exported energy benefits active.'
    ),
  ];

  // Aggregate totals strictly within A-C boundaries
  const upfrontCarbonA0toA5KgCO2e = Number(
    ((a0EmissionsKg ?? 0) + a1a3TotalKg + a4TotalKg + a5TotalKg).toFixed(2)
  );
  const embodiedCarbonAtoCKgCO2e = Number(
    (upfrontCarbonA0toA5KgCO2e + (b1EmissionsKg ?? 0) + b2b5TotalKg + c1c4TotalKg).toFixed(2)
  );

  const hasAnyOperationalAssessed = b6Status === 'assessed' || b7Status === 'assessed' || b8Status === 'assessed';
  const operationalCarbonB6toB8KgCO2e = hasAnyOperationalAssessed
    ? Number(((b6EmissionsKg ?? 0) + (b7EmissionsKg ?? 0) + (b8EmissionsKg ?? 0)).toFixed(2))
    : null;

  const wholeLifeCarbonAtoCKgCO2e = Number(
    (embodiedCarbonAtoCKgCO2e + (operationalCarbonB6toB8KgCO2e ?? 0)).toFixed(2)
  );

  // Hotspots by Category & Item
  const denominatorKg = Math.max(1, wholeLifeCarbonAtoCKgCO2e);
  const hotspotsByCategory: CarbonHotspotRecord[] = Array.from(categoryEmissionsMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([cat, kg], idx) => ({
      rank: idx + 1,
      categoryOrItemId: cat,
      label: cat
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' '),
      kind: 'element-category',
      emissionsKgCO2e: Number(kg.toFixed(2)),
      shareOfAssessedWholeLifePercent: Number(((kg / denominatorKg) * 100).toFixed(1)),
    }));

  const hotspotsByItem: CarbonHotspotRecord[] = Array.from(itemEmissionsMap.values())
    .sort((a, b) => b.totalACTg - a.totalACTg)
    .map((entry, idx) => ({
      rank: idx + 1,
      categoryOrItemId: entry.item.itemId,
      label: entry.item.elementName,
      kind: 'inventory-item',
      emissionsKgCO2e: Number(entry.totalACTg.toFixed(2)),
      shareOfAssessedWholeLifePercent: Number(((entry.totalACTg / denominatorKg) * 100).toFixed(1)),
      primaryFactorName: entry.factorName,
    }));

  // Generate explainable Carbon Reduction Opportunities
  const reductionOpportunities = generateCarbonReductionOpportunities({
    inventory: params.inventory,
    factorMap,
    referenceStudyPeriodYears,
    wholeLifeCarbonAtoCKgCO2e,
  });

  // Data Quality & Scope Classification
  const totalWeightedEmbodiedKg = Math.max(
    1,
    verifiedEpdKg + authoritativeGenericKg + userImportedUnverifiedKg + scenarioAssumptionKg
  );
  const totalSourceWeightedKg = Math.max(
    1,
    modelDerivedKg + ifcPreservedKg + costScheduleDerivedKg + userEnteredKg + defaultAssumptionKg
  );

  const assessedModules = moduleResults
    .filter((m) => m.status === 'assessed' || m.status === 'partially-assessed')
    .map((m) => m.moduleCode);
  const unassessedOrUnavailableModules = moduleResults
    .filter((m) => m.status === 'unassessed' || m.status === 'unavailable')
    .map((m) => m.moduleCode);

  let scopeClassification: CarbonAssessmentScopeClassification;
  let scopeClassificationReason: string;

  if (mappedInventoryItems === 0 || grossInternalFloorAreaM2 <= 0) {
    scopeClassification = 'Not assessable with current data';
    scopeClassificationReason =
      'No valid mapped material inventory items or positive Gross Internal Floor Area are currently available.';
  } else if (
    unmappedInventoryItems === 0 &&
    invalidConversionItems === 0 &&
    b6Status === 'assessed' &&
    b7Status === 'assessed'
  ) {
    scopeClassification = 'Whole-life assessment within a documented scope';
    scopeClassificationReason =
      'All inventory items are mapped with valid unit conversions across embodied stages (A1–A5, B2–B5, C1–C4) and operational energy/water modules (B6, B7) are assessed over the Reference Study Period.';
  } else if (defaultAssumptionKg / totalSourceWeightedKg > 0.5 || inventoryCoveragePercent < 60) {
    scopeClassification = 'Preliminary screening estimate';
    scopeClassificationReason =
      'Over 50% of embodied emissions rely on early-stage default geometry assumptions or fewer than 60% of inventory items are mapped.';
  } else {
    scopeClassification = 'Partially assessed lifecycle';
    scopeClassificationReason =
      `Embodied stages (A1–A5, B2–B5, C1–C4) are assessed (${inventoryCoveragePercent}% inventory mapped), while operational modules (${[
        b6Status !== 'assessed' ? 'B6 Energy' : null,
        b7Status !== 'assessed' ? 'B7 Water' : null,
      ]
        .filter(Boolean)
        .join(', ') || 'optional stages'}) or unmapped items remain unassessed.`;
  }

  const overallUncertaintyRating: CarbonDataQualitySummary['overallUncertaintyRating'] =
    scopeClassification === 'Whole-life assessment within a documented scope' &&
    userImportedUnverifiedKg / totalWeightedEmbodiedKg < 0.2
      ? 'low'
      : scopeClassification === 'Partially assessed lifecycle'
        ? 'moderate'
        : 'high';

  const dataQuality: CarbonDataQualitySummary = {
    totalInventoryItems: totalInventoryCount,
    mappedInventoryItems,
    unmappedInventoryItems,
    invalidConversionItems,
    inventoryCompletenessPercent: inventoryCoveragePercent,
    emissionsShareByFactorVerification: {
      verifiedEpdPercent: Number(((verifiedEpdKg / totalWeightedEmbodiedKg) * 100).toFixed(1)),
      authoritativeGenericPercent: Number(((authoritativeGenericKg / totalWeightedEmbodiedKg) * 100).toFixed(1)),
      userImportedUnverifiedPercent: Number(((userImportedUnverifiedKg / totalWeightedEmbodiedKg) * 100).toFixed(1)),
      scenarioAssumptionPercent: Number(((scenarioAssumptionKg / totalWeightedEmbodiedKg) * 100).toFixed(1)),
    },
    emissionsShareByQuantitySource: {
      modelDerivedPercent: Number(((modelDerivedKg / totalSourceWeightedKg) * 100).toFixed(1)),
      ifcPreservedPercent: Number(((ifcPreservedKg / totalSourceWeightedKg) * 100).toFixed(1)),
      costScheduleDerivedPercent: Number(((costScheduleDerivedKg / totalSourceWeightedKg) * 100).toFixed(1)),
      userEnteredPercent: Number(((userEnteredKg / totalSourceWeightedKg) * 100).toFixed(1)),
      defaultAssumptionPercent: Number(((defaultAssumptionKg / totalSourceWeightedKg) * 100).toFixed(1)),
    },
    assessedModules,
    unassessedOrUnavailableModules,
    overallUncertaintyRating,
    qualityNarrative: `${mappedInventoryItems} of ${totalInventoryCount} inventory items mapped (${inventoryCoveragePercent}%). ${
      b6Status === 'assessed' ? 'B6 Operational Energy is assessed.' : 'B6 Operational Energy is unavailable.'
    } ${b7Status === 'assessed' ? 'B7 Operational Water is assessed.' : 'B7 Operational Water is unavailable.'}`,
  };

  const biogenicSummary: CarbonBiogenicSummary = {
    biogenicAccountingMethod: includeBiogenicInTotals
      ? 'en15978-balanced-a1a3-c3c4'
      : 'fossil-only-biogenic-excluded',
    totalBiogenicStorageA1A3KgCO2e: Number(totalBiogenicStorageA1A3Kg.toFixed(2)),
    totalBiogenicReleaseC3C4KgCO2e: Number(totalBiogenicReleaseC3C4Kg.toFixed(2)),
    netBiogenicBalanceAtoCKgCO2e: Number((totalBiogenicStorageA1A3Kg + totalBiogenicReleaseC3C4Kg).toFixed(2)),
    biogenicItemsCount,
    policyNote: includeBiogenicInTotals
      ? 'Biogenic carbon uptake in A1–A3 is balanced by end-of-life release in C3–C4 per EN 15978 (net A–C biogenic balance = 0 kgCO2e).'
      : 'Totals reflect fossil GWP; biogenic storage and end-of-life release are reported separately above.',
  };

  const moduleDSummary: CarbonModuleDSummary = {
    status: hasModuleDTraces ? 'assessed' : 'unassessed',
    netModuleDBenefitOrLoadKgCO2e: hasModuleDTraces ? Number(netModuleDKg.toFixed(2)) : null,
    netModuleDBenefitOrLoadTCO2e: hasModuleDTraces ? Number((netModuleDKg / 1000).toFixed(4)) : null,
    exportedRenewableEnergyBenefitKgCO2e: Number(exportedRenewableModuleDBenefitKg.toFixed(2)),
    materialRecyclingReuseBenefitKgCO2e: Number(moduleDMaterialRecyclingKg.toFixed(2)),
    separationGuaranteeNote:
      'Module D circularity and exported energy benefits/loads beyond the system boundary are strictly separated and never subtracted from Upfront (A0–A5), Embodied (A–C), or Whole-Life (A–C) totals.',
  };

  return {
    assessmentId,
    assessmentName,
    profileId: 'plotify-whole-life-carbon-p44-v1',
    createdAt,
    updatedAt: nowIso,
    referenceStudyPeriodYears,
    grossInternalFloorAreaM2,
    treatedFloorAreaM2,
    occupantsCount: params.occupantsCount,
    scopeClassification,
    scopeClassificationReason,
    inventory: params.inventory,
    customFactors,
    operationalEnergy: params.operationalEnergy,
    operationalWater: params.operationalWater,
    siteAndInUseInputs,
    includeBiogenicInTotals,
    moduleResults,
    totals: {
      upfrontCarbonA0toA5KgCO2e,
      upfrontCarbonA0toA5TCO2e: Number((upfrontCarbonA0toA5KgCO2e / 1000).toFixed(4)),
      upfrontIntensityKgCO2ePerM2Gfa:
        grossInternalFloorAreaM2 > 0 ? Number((upfrontCarbonA0toA5KgCO2e / grossInternalFloorAreaM2).toFixed(2)) : null,
      embodiedCarbonAtoCKgCO2e,
      embodiedCarbonAtoCTCO2e: Number((embodiedCarbonAtoCKgCO2e / 1000).toFixed(4)),
      embodiedIntensityKgCO2ePerM2Gfa:
        grossInternalFloorAreaM2 > 0 ? Number((embodiedCarbonAtoCKgCO2e / grossInternalFloorAreaM2).toFixed(2)) : null,
      operationalCarbonB6toB8KgCO2e,
      operationalCarbonB6toB8TCO2e:
        operationalCarbonB6toB8KgCO2e !== null ? Number((operationalCarbonB6toB8KgCO2e / 1000).toFixed(4)) : null,
      operationalIntensityKgCO2ePerM2GfaPerYear:
        operationalCarbonB6toB8KgCO2e !== null && grossInternalFloorAreaM2 > 0
          ? Number((operationalCarbonB6toB8KgCO2e / grossInternalFloorAreaM2 / referenceStudyPeriodYears).toFixed(2))
          : null,
      wholeLifeCarbonAtoCKgCO2e,
      wholeLifeCarbonAtoCTCO2e: Number((wholeLifeCarbonAtoCKgCO2e / 1000).toFixed(4)),
      wholeLifeIntensityKgCO2ePerM2Gfa:
        grossInternalFloorAreaM2 > 0
          ? Number((wholeLifeCarbonAtoCKgCO2e / grossInternalFloorAreaM2).toFixed(2))
          : null,
      wholeLifePerOccupantKgCO2e:
        params.occupantsCount && params.occupantsCount > 0
          ? Number((wholeLifeCarbonAtoCKgCO2e / params.occupantsCount).toFixed(2))
          : null,
    },
    biogenicSummary,
    moduleDSummary,
    calculationTraces,
    hotspotsByCategory,
    hotspotsByItem,
    reductionOpportunities,
    validationIssues,
    extractionWarnings,
    dataQuality,
  };
}

const ALTERNATIVE_FACTOR_RULES: Record<
  string,
  {
    proposedFactorId: string;
    title: string;
    confidenceLevel: 'high' | 'medium' | 'low';
    tradeoffs: string[];
  }
> = {
  'ice-rc-c30-37-cem1': {
    proposedFactorId: 'epd-rc-c30-37-ggbs50',
    title: 'Specify 50% GGBS Low-Carbon Concrete Mix (CEM III/A Equivalent)',
    confidenceLevel: 'high',
    tradeoffs: [
      'Requires slightly longer early-age striking/curing times on site.',
      'Maintains identical 2,400 kg/m3 structural density and C30/37 compressive strength class.',
    ],
  },
  'ice-steel-sections-bof': {
    proposedFactorId: 'epd-steel-sections-eaf-renewable',
    title: 'Switch from Global BOF Steel to Renewable-Powered EAF Structural Steel (95% Scrap)',
    confidenceLevel: 'high',
    tradeoffs: [
      'Requires early procurement specification of EAF mill certificates (EN 15804+A2 EPD).',
      'Identical structural section geometry and 7,850 kg/m3 density.',
    ],
  },
  'ice-double-glazed-aluminium-window': {
    proposedFactorId: 'epd-timber-alu-composite-window',
    title: 'Substitute Virgin Aluminium Windows with Timber-Aluminium Composite Frames',
    confidenceLevel: 'medium',
    tradeoffs: [
      'Reduces A1–A3 fenestration embodied carbon by ~46% and extends typical frame service life from 30 to 35 years.',
      'Verify facade fire-rating and acoustic compliance for buildings above 18m.',
    ],
  },
  'ice-gypsum-stud-partition': {
    proposedFactorId: 'epd-timber-stud-recycled-gypsum-partition',
    title: 'Adopt Timber Stud Partitions with High-Recycled Gypsum & Wood-Fibre Acoustic Infill',
    confidenceLevel: 'high',
    tradeoffs: [
      'Lower A1–A3 embodied carbon across both initial fit-out and B4 mid-life replacement cycles.',
      'Requires moisture-resistant detailing in wet zones.',
    ],
  },
  'ice-floor-finish-porcelain-screed': {
    proposedFactorId: 'epd-floor-finish-engineered-oak',
    title: 'Replace Porcelain Tile on Cement Screed with FSC Engineered Timber Flooring on Cork Underlay',
    confidenceLevel: 'medium',
    tradeoffs: [
      'Eliminates high-kiln-energy vitrified tile and wet cement screed bed in dry habitable rooms.',
      'Not suitable for wet bathrooms/utility rooms; retain tile in wet zones.',
    ],
  },
};

export function generateCarbonReductionOpportunities(params: {
  inventory: CarbonMaterialInventoryItem[];
  factorMap: Map<string, CarbonFactorRecord>;
  referenceStudyPeriodYears: number;
  wholeLifeCarbonAtoCKgCO2e: number;
}): CarbonReductionOpportunity[] {
  const opportunities: CarbonReductionOpportunity[] = [];
  const wholeLifeDenom = Math.max(1, params.wholeLifeCarbonAtoCKgCO2e);

  for (const item of params.inventory) {
    if (!item.assignedFactorId) continue;
    const rule = ALTERNATIVE_FACTOR_RULES[item.assignedFactorId];
    if (!rule) continue;

    const currentFactor = params.factorMap.get(item.assignedFactorId);
    const proposedFactor = params.factorMap.get(rule.proposedFactorId);
    if (!currentFactor || !proposedFactor) continue;

    const currentConv = convertInventoryQuantityToDeclaredUnit({
      quantity: item.quantity,
      sourceUnit: item.quantityUnit,
      targetUnit: currentFactor.declaredUnit,
      thicknessM: item.thicknessM,
      densityKgPerM3: item.densityOverrideKgPerM3 ?? currentFactor.densityKgPerM3,
    });
    const proposedConv = convertInventoryQuantityToDeclaredUnit({
      quantity: item.quantity,
      sourceUnit: item.quantityUnit,
      targetUnit: proposedFactor.declaredUnit,
      thicknessM: item.thicknessM,
      densityKgPerM3: item.densityOverrideKgPerM3 ?? proposedFactor.densityKgPerM3,
    });

    if (!currentConv.valid || !proposedConv.valid || !currentConv.convertedQuantity || !proposedConv.convertedQuantity) {
      continue;
    }

    const wasteFraction = (item.wasteRatePercent ?? currentFactor.defaultWasteRatePercent ?? 5) / 100;
    const curCycles =
      (item.serviceLifeYears ?? currentFactor.defaultServiceLifeYears ?? 60) < params.referenceStudyPeriodYears
        ? Math.max(
            0,
            Math.ceil(
              params.referenceStudyPeriodYears /
                (item.serviceLifeYears ?? currentFactor.defaultServiceLifeYears ?? 60)
            ) - 1
          )
        : 0;
    const propCycles =
      (proposedFactor.defaultServiceLifeYears ?? 60) < params.referenceStudyPeriodYears
        ? Math.max(0, Math.ceil(params.referenceStudyPeriodYears / (proposedFactor.defaultServiceLifeYears ?? 60)) - 1)
        : 0;

    const curA1A5AndEoL =
      currentConv.convertedQuantity *
      (currentFactor.gwpValueKgCO2ePerUnit * (1 + wasteFraction) + (currentFactor.endOfLifeC1C4KgCO2ePerUnit ?? 0));
    const propA1A5AndEoL =
      proposedConv.convertedQuantity *
      (proposedFactor.gwpValueKgCO2ePerUnit * (1 + wasteFraction) + (proposedFactor.endOfLifeC1C4KgCO2ePerUnit ?? 0));

    const baselineKg = curA1A5AndEoL * (1 + curCycles);
    const proposedKg = propA1A5AndEoL * (1 + propCycles);
    const savingKg = baselineKg - proposedKg;

    if (savingKg <= 0) continue;

    opportunities.push({
      opportunityId: `opp-${item.itemId}-${proposedFactor.factorId}`,
      title: `${rule.title} — ${item.elementName}`,
      targetItemId: item.itemId,
      targetElementName: item.elementName,
      elementCategory: item.elementCategory,
      currentFactorId: currentFactor.factorId,
      currentFactorName: currentFactor.name,
      proposedFactorId: proposedFactor.factorId,
      proposedFactorName: proposedFactor.name,
      affectedModules: curCycles > 0 ? ['A1-A3', 'A5', 'B2-B5', 'C1-C4'] : ['A1-A3', 'A5', 'C1-C4'],
      baselineEmissionsKgCO2e: Number(baselineKg.toFixed(2)),
      proposedEmissionsKgCO2e: Number(proposedKg.toFixed(2)),
      estimatedSavingKgCO2e: Number(savingKg.toFixed(2)),
      estimatedSavingPercentOfItem: Number(((savingKg / Math.max(1, baselineKg)) * 100).toFixed(1)),
      estimatedSavingPercentOfWholeLife: Number(((savingKg / wholeLifeDenom) * 100).toFixed(1)),
      confidenceLevel: rule.confidenceLevel,
      technicalTradeoffsAndCaveats: rule.tradeoffs,
      explanationFormula: `Baseline: ${currentConv.convertedQuantity.toFixed(1)} ${currentFactor.declaredUnit} × ${currentFactor.gwpValueKgCO2ePerUnit} kgCO2e/${currentFactor.declaredUnit} (${1 + curCycles}x lifecycle) = ${baselineKg.toFixed(0)} kgCO2e vs Proposed: ${proposedConv.convertedQuantity.toFixed(1)} ${proposedFactor.declaredUnit} × ${proposedFactor.gwpValueKgCO2ePerUnit} kgCO2e/${proposedFactor.declaredUnit} (${1 + propCycles}x lifecycle) = ${proposedKg.toFixed(0)} kgCO2e.`,
    });
  }

  return opportunities.sort((a, b) => b.estimatedSavingKgCO2e - a.estimatedSavingKgCO2e);
}

/**
 * Creates a default initial Whole-Life Carbon Assessment for a project from its model geometry.
 */
export function createInitialProjectCarbonAssessment(project: Project): WholeLifeCarbonAssessment {
  const derived = deriveProjectCarbonInventory(project);
  return evaluateWholeLifeCarbonAssessment({
    assessmentName: `${project.name} — Baseline Whole-Life Carbon Assessment`,
    referenceStudyPeriodYears: SUPPORTED_CARBON_ASSESSMENT_PROFILE.defaultReferenceStudyPeriodYears,
    grossInternalFloorAreaM2: derived.grossInternalFloorAreaM2,
    treatedFloorAreaM2: derived.treatedFloorAreaM2,
    inventory: derived.inventory,
    customFactors: [],
    operationalEnergy: {
      enabled: false,
      sourceType: 'unavailable',
      electricityGridFactorId: 'grid-electricity-average-reference',
      fuelFactorId: 'fuel-natural-gas-boiler',
    },
    operationalWater: {
      enabled: false,
      sourceType: 'unavailable',
      waterSupplyAndTreatmentFactorId: 'water-potable-supply-and-wastewater',
    },
    extractionWarnings: derived.warnings,
  });
}

/**
 * Safely applies a Whole-Life Carbon Assessment to the project after creating a pre-apply rollback checkpoint.
 * Never mutates unrelated project domains (`floorPlan`, `ifcInterop`, `cadInterop`, `terrainModeling`, `costPlanning`, etc.).
 */
export function applyCarbonAssessmentToProject(
  project: Project,
  assessment: WholeLifeCarbonAssessment,
  options?: {
    saveAsScenario?: boolean;
    factorImportHistory?: CarbonFactorImportResult[];
  }
): {
  updatedProject: Project;
  snapshotId: string;
} {
  if (assessment.scopeClassification === 'Not assessable with current data') {
    throw new Error(
      'Cannot apply an invalid or non-assessable carbon assessment ("Not assessable with current data") to the project.'
    );
  }

  const snapshot = createProjectSnapshot(project, {
    trigger: 'auto-checkpoint',
    label: `Pre-P44 Whole-Life Carbon Assessment apply (${assessment.assessmentName})`,
    description: 'Automatic rollback checkpoint prior to applying P44 Whole-Life Carbon Assessment',
  });

  const existingScenarios = project.carbonAssessment?.savedScenarios ?? [];
  const nextScenarios = options?.saveAsScenario
    ? [
        ...existingScenarios.filter((s) => s.assessmentId !== assessment.assessmentId),
        assessment,
      ]
    : existingScenarios;

  const metadata: ProjectCarbonAssessmentMetadata = {
    version: '1.0',
    activeAssessment: assessment,
    savedScenarios: nextScenarios,
    factorImportHistory: options?.factorImportHistory ?? project.carbonAssessment?.factorImportHistory ?? [],
    lastPreApplySnapshotId: snapshot.id,
    provenanceNotes: [
      `Applied ${assessment.assessmentName} (${assessment.scopeClassification}) at ${new Date().toISOString()}`,
      `Profile: ${assessment.profileId}; Reference Study Period: ${assessment.referenceStudyPeriodYears} years; GFA: ${assessment.grossInternalFloorAreaM2} m2`,
    ],
  };

  const updatedProject: Project = {
    ...project,
    carbonAssessment: metadata,
    updatedAt: new Date().toISOString(),
  };

  return {
    updatedProject,
    snapshotId: snapshot.id,
  };
}

/**
 * Safely removes the P44 Whole-Life Carbon Assessment metadata from a project after creating a rollback checkpoint.
 */
export function removeCarbonAssessmentFromProject(project: Project): {
  updatedProject: Project;
  snapshotId: string;
} {
  const snapshot = createProjectSnapshot(project, {
    trigger: 'auto-checkpoint',
    label: 'Pre-P44 Whole-Life Carbon Assessment removal checkpoint',
    description: 'Automatic rollback checkpoint prior to removing P44 Whole-Life Carbon Assessment',
  });

  const updatedProject: Project = {
    ...project,
    carbonAssessment: undefined,
    updatedAt: new Date().toISOString(),
  };

  return {
    updatedProject,
    snapshotId: snapshot.id,
  };
}

/**
 * Exports a transparent, auditable Whole-Life Carbon Assessment report in JSON, Markdown, or CSV trace format.
 */
export function exportCarbonAssessmentReport(
  project: Project,
  assessment: WholeLifeCarbonAssessment,
  format: 'json' | 'markdown' | 'csv'
): {
  fileName: string;
  mimeType: string;
  content: string;
} {
  const safeSlug = project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project';

  if (format === 'json') {
    const payload = {
      reportType: 'Plotify P44 Embodied & Whole-Life Carbon Assessment Report',
      exportedAt: new Date().toISOString(),
      project: {
        id: project.id,
        name: project.name,
        unit: project.unit,
        floors: project.floors,
      },
      profile: SUPPORTED_CARBON_ASSESSMENT_PROFILE,
      assessment,
    };
    return {
      fileName: `${safeSlug}-whole-life-carbon-p44.json`,
      mimeType: 'application/json',
      content: JSON.stringify(payload, null, 2),
    };
  }

  if (format === 'csv') {
    const headers = [
      'traceId',
      'moduleCode',
      'elementName',
      'elementCategory',
      'quantitySourceType',
      'rawQuantity',
      'rawUnit',
      'convertedQuantity',
      'declaredUnit',
      'factorId',
      'factorName',
      'factorVerificationStatus',
      'factorValueKgCO2ePerUnit',
      'emissionsKgCO2e',
      'biogenicStorageKgCO2e',
      'biogenicReleaseKgCO2e',
      'formulaDescription',
    ];
    const rows = assessment.calculationTraces.map((t) =>
      [
        t.traceId,
        t.moduleCode,
        `"${t.elementName.replace(/"/g, '""')}"`,
        t.elementCategory ?? '',
        t.quantitySourceType,
        t.rawQuantity,
        t.rawUnit,
        t.convertedQuantity,
        t.declaredUnit,
        t.factorId,
        `"${t.factorName.replace(/"/g, '""')}"`,
        t.factorVerificationStatus,
        t.factorValueKgCO2ePerUnit,
        t.emissionsKgCO2e,
        t.biogenicStorageKgCO2e,
        t.biogenicReleaseKgCO2e,
        `"${t.formulaDescription.replace(/"/g, '""')}"`,
      ].join(',')
    );
    return {
      fileName: `${safeSlug}-carbon-calculation-traces-p44.csv`,
      mimeType: 'text/csv',
      content: [headers.join(','), ...rows].join('\n'),
    };
  }

  // Markdown executive & technical audit report
  const lines: string[] = [
    `# Whole-Life Carbon Assessment Report — ${project.name}`,
    ``,
    `- **Assessment Name:** ${assessment.assessmentName}`,
    `- **Scope Classification:** **${assessment.scopeClassification}**`,
    `- **Classification Basis:** ${assessment.scopeClassificationReason}`,
    `- **Assessment Profile:** ${SUPPORTED_CARBON_ASSESSMENT_PROFILE.profileName} (\`${assessment.profileId}\`)`,
    `- **Reference Study Period (RSP):** ${assessment.referenceStudyPeriodYears} years`,
    `- **Gross Internal Floor Area (GIA/GFA):** ${assessment.grossInternalFloorAreaM2.toFixed(2)} m2`,
    `- **Generated At:** ${assessment.updatedAt}`,
    ``,
    `## 1. Whole-Life Carbon Summary Totals (Modules A–C)`,
    ``,
    `| Metric | Total (kgCO2e) | Total (tCO2e) | Intensity (kgCO2e/m2 GFA) |`,
    `| --- | ---: | ---: | ---: |`,
    `| **Upfront Carbon (A0–A5)** | ${assessment.totals.upfrontCarbonA0toA5KgCO2e.toLocaleString()} | ${assessment.totals.upfrontCarbonA0toA5TCO2e.toFixed(2)} | ${assessment.totals.upfrontIntensityKgCO2ePerM2Gfa ?? 'N/A'} |`,
    `| **Total Embodied Carbon (A0–A5, B1–B5, C1–C4)** | ${assessment.totals.embodiedCarbonAtoCKgCO2e.toLocaleString()} | ${assessment.totals.embodiedCarbonAtoCTCO2e.toFixed(2)} | ${assessment.totals.embodiedIntensityKgCO2ePerM2Gfa ?? 'N/A'} |`,
    `| **Operational Carbon (B6–B8 over ${assessment.referenceStudyPeriodYears} yrs)** | ${assessment.totals.operationalCarbonB6toB8KgCO2e !== null ? assessment.totals.operationalCarbonB6toB8KgCO2e.toLocaleString() : 'Unavailable (Not Assessed)'} | ${assessment.totals.operationalCarbonB6toB8TCO2e !== null ? assessment.totals.operationalCarbonB6toB8TCO2e.toFixed(2) : 'Unavailable'} | ${assessment.totals.operationalIntensityKgCO2ePerM2GfaPerYear !== null ? `${assessment.totals.operationalIntensityKgCO2ePerM2GfaPerYear} kgCO2e/m2/yr` : 'Unavailable'} |`,
    `| **Whole-Life Carbon Total (Assessed A–C)** | **${assessment.totals.wholeLifeCarbonAtoCKgCO2e.toLocaleString()}** | **${assessment.totals.wholeLifeCarbonAtoCTCO2e.toFixed(2)}** | **${assessment.totals.wholeLifeIntensityKgCO2ePerM2Gfa ?? 'N/A'}** |`,
    ``,
    `## 2. Module D (Beyond System Boundary — Reported Strictly Separately)`,
    ``,
    `- **Status:** ${assessment.moduleDSummary.status}`,
    `- **Net Module D Benefit / Load:** ${assessment.moduleDSummary.netModuleDBenefitOrLoadKgCO2e !== null ? `${assessment.moduleDSummary.netModuleDBenefitOrLoadKgCO2e.toLocaleString()} kgCO2e (${assessment.moduleDSummary.netModuleDBenefitOrLoadTCO2e} tCO2e)` : 'Not Assessed'}`,
    `- **Material Recycling / Recovery Potential:** ${assessment.moduleDSummary.materialRecyclingReuseBenefitKgCO2e.toLocaleString()} kgCO2e`,
    `- **Exported Renewable Energy Benefit:** ${assessment.moduleDSummary.exportedRenewableEnergyBenefitKgCO2e.toLocaleString()} kgCO2e`,
    `- **Boundary Rule:** ${assessment.moduleDSummary.separationGuaranteeNote}`,
    ``,
    `## 3. Biogenic Carbon Accounting`,
    ``,
    `- **Method:** ${assessment.biogenicSummary.biogenicAccountingMethod}`,
    `- **Biogenic Storage in A1–A3:** ${assessment.biogenicSummary.totalBiogenicStorageA1A3KgCO2e.toLocaleString()} kgCO2e`,
    `- **Biogenic Release at End-of-Life C3–C4:** ${assessment.biogenicSummary.totalBiogenicReleaseC3C4KgCO2e.toLocaleString()} kgCO2e`,
    `- **Net Biogenic Balance (A–C):** ${assessment.biogenicSummary.netBiogenicBalanceAtoCKgCO2e.toLocaleString()} kgCO2e`,
    `- **Policy:** ${assessment.biogenicSummary.policyNote}`,
    ``,
    `## 4. Lifecycle Module Breakdown`,
    ``,
    `| Module | Stage Title | Status | Emissions (kgCO2e) | Intensity (kgCO2e/m2) | Notes |`,
    `| --- | --- | --- | ---: | ---: | --- |`,
    ...assessment.moduleResults.map(
      (m) =>
        `| **${m.moduleCode}** | ${m.title} | \`${m.status}\` | ${m.emissionsKgCO2e !== null ? m.emissionsKgCO2e.toLocaleString() : 'Unavailable / Unassessed'} | ${m.intensityKgCO2ePerM2Gfa !== null ? m.intensityKgCO2ePerM2Gfa : '—'} | ${m.statusExplanation} |`
    ),
    ``,
    `## 5. Top Carbon Hotspots & Reduction Opportunities`,
    ``,
    ...assessment.reductionOpportunities.map(
      (opp, idx) =>
        `${idx + 1}. **${opp.title}**: Saves **${opp.estimatedSavingKgCO2e.toLocaleString()} kgCO2e** (${opp.estimatedSavingPercentOfItem}% of element, ${opp.estimatedSavingPercentOfWholeLife}% of Whole-Life A–C). Formula: ${opp.explanationFormula}`
    ),
    ``,
    `## 6. Data Quality & Methodology Limitations`,
    ``,
    `- **Inventory Completeness:** ${assessment.dataQuality.mappedInventoryItems}/${assessment.dataQuality.totalInventoryItems} items mapped (${assessment.dataQuality.inventoryCompletenessPercent}%)`,
    `- **Uncertainty Rating:** ${assessment.dataQuality.overallUncertaintyRating.toUpperCase()}`,
    `- **Factor Verification Share:** Verified EPD ${assessment.dataQuality.emissionsShareByFactorVerification.verifiedEpdPercent}%, Authoritative Generic ${assessment.dataQuality.emissionsShareByFactorVerification.authoritativeGenericPercent}%, User Unverified ${assessment.dataQuality.emissionsShareByFactorVerification.userImportedUnverifiedPercent}%`,
    ...SUPPORTED_CARBON_ASSESSMENT_PROFILE.knownExclusionsAndLimitations.map((lim) => `- ${lim}`),
  ];

  return {
    fileName: `${safeSlug}-whole-life-carbon-report-p44.md`,
    mimeType: 'text/markdown',
    content: lines.join('\n'),
  };
}
