import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Info,
  Layers,
  Leaf,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Zap,
} from 'lucide-react';
import { Project } from '../../types/project';
import {
  CarbonElementCategory,
  CarbonFactorImportResult,
  CarbonFactorRecord,
  CarbonMaterialInventoryItem,
  CarbonOperationalEnergyInput,
  CarbonOperationalWaterInput,
  CarbonSiteConstructionInput,
  WholeLifeCarbonAssessment,
} from '../../types/carbon';
import {
  applyCarbonAssessmentToProject,
  createInitialProjectCarbonAssessment,
  deriveProjectCarbonInventory,
  evaluateWholeLifeCarbonAssessment,
  exportCarbonAssessmentReport,
  getAllAvailableCarbonFactors,
  parseAndValidateCarbonFactorsImport,
  removeCarbonAssessmentFromProject,
  SUPPORTED_CARBON_ASSESSMENT_PROFILE,
} from '../../services/carbonService';

interface WholeLifeCarbonWorkspaceProps {
  project: Project;
  onUpdateProject: (updatedProject: Project) => void;
  onBack: () => void;
}

type WorkspaceStage =
  | '1-scope-boundary'
  | '2-inventory'
  | '3-factors-epd'
  | '4-lifecycle-modules'
  | '5-hotspots-scenarios'
  | '6-quality-export';

const ELEMENT_CATEGORY_LABELS: Record<CarbonElementCategory, string> = {
  'substructure-foundation': 'Substructure & Foundations',
  'superstructure-frame': 'Superstructure Frame (Columns/Beams)',
  'superstructure-upper-floors': 'Superstructure Upper Floors',
  'superstructure-roof': 'Superstructure Roof',
  'external-walls-facade': 'External Walls & Facade',
  'windows-external-doors': 'Windows & External Doors',
  'internal-walls-partitions': 'Internal Walls & Partitions',
  'internal-finishes': 'Internal Finishes',
  'mep-services': 'MEP Building Services',
  'external-works-site': 'External Works & Site',
};

const SAMPLE_CSV_FACTORS = `factorId,name,materialOrFuelCategory,sourceOrganisation,sourceReference,declaredUnit,gwpValueKgCO2ePerUnit,publicationYear,region,densityKgPerM3,defaultServiceLifeYears,coveredModules
custom-epd-hempcrete-block,Precast Hemp-Lime Bio-Composite Block,Masonry & Facade,ISO/EN 15804 Producer Declaration,EPD-HEMP-2024-01,kg,0.085,2024,Europe,330,60,A1-A3
invalid-factor-missing-gwp,Corrupted Factor Row Without GWP,Concrete,Unknown,,invalid-unit,NaN,2024,Global,-100,0,A1-A3`;

export const WholeLifeCarbonWorkspace: React.FC<WholeLifeCarbonWorkspaceProps> = ({
  project,
  onUpdateProject,
  onBack,
}) => {
  const initialAssessment = useMemo<WholeLifeCarbonAssessment>(() => {
    if (project.carbonAssessment?.activeAssessment) {
      return project.carbonAssessment.activeAssessment;
    }
    return createInitialProjectCarbonAssessment(project);
  }, [project]);

  const [activeStage, setActiveStage] = useState<WorkspaceStage>('1-scope-boundary');
  const [assessmentName, setAssessmentName] = useState<string>(initialAssessment.assessmentName);
  const [referenceStudyPeriodYears, setReferenceStudyPeriodYears] = useState<number>(
    initialAssessment.referenceStudyPeriodYears
  );
  const [grossInternalFloorAreaM2, setGrossInternalFloorAreaM2] = useState<number>(
    initialAssessment.grossInternalFloorAreaM2
  );
  const [treatedFloorAreaM2, setTreatedFloorAreaM2] = useState<number>(
    initialAssessment.treatedFloorAreaM2
  );
  const [occupantsCount, setOccupantsCount] = useState<number>(initialAssessment.occupantsCount ?? 4);
  const [includeBiogenicInTotals, setIncludeBiogenicInTotals] = useState<boolean>(
    initialAssessment.includeBiogenicInTotals
  );

  const [inventory, setInventory] = useState<CarbonMaterialInventoryItem[]>(initialAssessment.inventory);
  const [customFactors, setCustomFactors] = useState<CarbonFactorRecord[]>(initialAssessment.customFactors);
  const [operationalEnergy, setOperationalEnergy] = useState<CarbonOperationalEnergyInput>(
    initialAssessment.operationalEnergy
  );
  const [operationalWater, setOperationalWater] = useState<CarbonOperationalWaterInput>(
    initialAssessment.operationalWater
  );
  const [siteAndInUseInputs, setSiteAndInUseInputs] = useState<CarbonSiteConstructionInput>(
    initialAssessment.siteAndInUseInputs
  );
  const [extractionWarnings, setExtractionWarnings] = useState(initialAssessment.extractionWarnings);

  const [factorImportHistory, setFactorImportHistory] = useState<CarbonFactorImportResult[]>(
    project.carbonAssessment?.factorImportHistory ?? []
  );
  const [rawFactorImportText, setRawFactorImportText] = useState<string>('');
  const [factorImportFileName, setFactorImportFileName] = useState<string>('custom-factors.csv');
  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'warning' | 'error' | 'info';
    message: string;
  } | null>(null);

  // Live deterministic evaluation of the working assessment
  const workingAssessment = useMemo<WholeLifeCarbonAssessment>(() => {
    return evaluateWholeLifeCarbonAssessment({
      assessmentId: initialAssessment.assessmentId,
      assessmentName,
      createdAt: initialAssessment.createdAt,
      referenceStudyPeriodYears,
      grossInternalFloorAreaM2,
      treatedFloorAreaM2,
      occupantsCount,
      inventory,
      customFactors,
      operationalEnergy,
      operationalWater,
      siteAndInUseInputs,
      includeBiogenicInTotals,
      extractionWarnings,
    });
  }, [
    initialAssessment.assessmentId,
    initialAssessment.createdAt,
    assessmentName,
    referenceStudyPeriodYears,
    grossInternalFloorAreaM2,
    treatedFloorAreaM2,
    occupantsCount,
    inventory,
    customFactors,
    operationalEnergy,
    operationalWater,
    siteAndInUseInputs,
    includeBiogenicInTotals,
    extractionWarnings,
  ]);

  const allFactors = useMemo(() => getAllAvailableCarbonFactors(customFactors), [customFactors]);
  const materialFactors = useMemo(
    () => allFactors.filter((f) => f.coveredModules.includes('A1-A3')),
    [allFactors]
  );
  const electricityFactors = useMemo(
    () => allFactors.filter((f) => f.coveredModules.includes('B6') && f.declaredUnit === 'kWh' && f.factorId.startsWith('grid-')),
    [allFactors]
  );

  const handleResyncFromProjectModel = () => {
    const derived = deriveProjectCarbonInventory(project);
    setGrossInternalFloorAreaM2(derived.grossInternalFloorAreaM2);
    setTreatedFloorAreaM2(derived.treatedFloorAreaM2);
    setInventory(derived.inventory);
    setExtractionWarnings(derived.warnings);
    setStatusBanner({
      type: 'info',
      message: `Re-synchronized ${derived.inventory.length} building inventory elements from project geometry (${derived.grossInternalFloorAreaM2} m² GFA).`,
    });
  };

  const handleUpdateInventoryItem = (
    itemId: string,
    patch: Partial<CarbonMaterialInventoryItem>
  ) => {
    setInventory((prev) =>
      prev.map((item) => (item.itemId === itemId ? { ...item, ...patch } : item))
    );
  };

  const handleAddInventoryItem = () => {
    const newItem: CarbonMaterialInventoryItem = {
      itemId: `inv-user-${Date.now()}`,
      elementName: 'Custom Building Element',
      elementCategory: 'superstructure-frame',
      sourceType: 'user-entered',
      sourceDescription: 'User-entered custom element quantity',
      quantity: 25,
      quantityUnit: 'm3',
      assignedFactorId: 'ice-rc-c30-37-cem1',
      mappingConfidence: 'high',
      serviceLifeYears: 60,
      transportDistanceKm: 60,
      transportFactorId: 'defra-road-freight-hgv-average',
      wasteRatePercent: 5,
      includeEndOfLife: true,
      includeModuleD: true,
    };
    setInventory((prev) => [...prev, newItem]);
  };

  const handleRemoveInventoryItem = (itemId: string) => {
    setInventory((prev) => prev.filter((i) => i.itemId !== itemId));
  };

  const handleImportFactors = () => {
    if (!rawFactorImportText.trim()) {
      setStatusBanner({
        type: 'warning',
        message: 'Paste CSV or JSON factor records before running validation and import.',
      });
      return;
    }
    const existingIds = allFactors.map((f) => f.factorId);
    const result = parseAndValidateCarbonFactorsImport(
      rawFactorImportText,
      factorImportFileName,
      existingIds
    );
    setFactorImportHistory((prev) => [result, ...prev]);
    if (result.validFactors.length > 0) {
      setCustomFactors((prev) => [...prev, ...result.validFactors]);
    }
    setStatusBanner({
      type: result.quarantinedRecords.length > 0 ? 'warning' : 'success',
      message: `Factor import complete: ${result.validFactors.length} valid factor(s) imported, ${result.quarantinedRecords.length} invalid record(s) quarantined.`,
    });
  };

  const handleConfirmUnverifiedFactor = (factorId: string, confirmed: boolean) => {
    setCustomFactors((prev) =>
      prev.map((f) => (f.factorId === factorId ? { ...f, userConfirmedUnverified: confirmed } : f))
    );
  };

  const handleApplyOpportunity = (targetItemId: string | undefined, proposedFactorId: string) => {
    if (!targetItemId) return;
    handleUpdateInventoryItem(targetItemId, { assignedFactorId: proposedFactorId });
    setStatusBanner({
      type: 'success',
      message: `Applied low-carbon specification (${proposedFactorId}) to working scenario.`,
    });
  };

  const handleSaveToProject = (saveAsScenario: boolean) => {
    try {
      const scenarioToSave = saveAsScenario
        ? {
            ...workingAssessment,
            assessmentId: `wlc-scen-${Date.now()}`,
            assessmentName: `${assessmentName} (Saved Scenario)`,
          }
        : workingAssessment;

      const { updatedProject, snapshotId } = applyCarbonAssessmentToProject(
        project,
        scenarioToSave,
        {
          saveAsScenario,
          factorImportHistory,
        }
      );
      onUpdateProject(updatedProject);
      setStatusBanner({
        type: 'success',
        message: `Saved Whole-Life Carbon Assessment to project (Pre-apply rollback checkpoint ${snapshotId.slice(0, 8)} created).`,
      });
    } catch (err) {
      setStatusBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to apply carbon assessment.',
      });
    }
  };

  const handleRemoveFromProject = () => {
    const { updatedProject, snapshotId } = removeCarbonAssessmentFromProject(project);
    onUpdateProject(updatedProject);
    setStatusBanner({
      type: 'info',
      message: `Removed persisted Carbon Assessment from project (Rollback checkpoint ${snapshotId.slice(0, 8)} created).`,
    });
  };

  const handleDownloadReport = (format: 'json' | 'markdown' | 'csv') => {
    const exported = exportCarbonAssessmentReport(project, workingAssessment, format);
    const blob = new Blob([exported.content], { type: exported.mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exported.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const scopeBadgeStyle =
    workingAssessment.scopeClassification === 'Whole-life assessment within a documented scope'
      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
      : workingAssessment.scopeClassification === 'Partially assessed lifecycle'
        ? 'bg-blue-50 text-blue-800 border-blue-200'
        : workingAssessment.scopeClassification === 'Preliminary screening estimate'
          ? 'bg-amber-50 text-amber-800 border-amber-200'
          : 'bg-red-50 text-red-800 border-red-200';

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      {/* Top Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex items-start gap-3">
              <button
                onClick={onBack}
                className="mt-1 p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                title="Back to Project Overview"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-900 text-emerald-100">
                    P44 • Whole-Life Carbon
                  </span>
                  <span className={`text-xs font-medium px-2.5 py-0.5 rounded border ${scopeBadgeStyle}`}>
                    {workingAssessment.scopeClassification}
                  </span>
                  <span className="text-xs text-slate-500">
                    Profile: {SUPPORTED_CARBON_ASSESSMENT_PROFILE.profileId}
                  </span>
                </div>
                <h1 className="text-xl font-bold text-slate-900 mt-1">
                  Embodied & Whole-Life Carbon Assessment — {project.name}
                </h1>
                <p className="text-xs text-slate-600 mt-0.5">
                  {workingAssessment.scopeClassificationReason}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => handleSaveToProject(false)}
                disabled={workingAssessment.scopeClassification === 'Not assessable with current data'}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50 transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                Apply Assessment to Project
              </button>
              <button
                onClick={() => handleSaveToProject(true)}
                disabled={workingAssessment.scopeClassification === 'Not assessable with current data'}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                Save as Scenario
              </button>
              <button
                onClick={() => handleDownloadReport('markdown')}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Export Audit Report
              </button>
            </div>
          </div>

          {/* KPI Strip */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4 pt-4 border-t border-slate-100">
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-200/80">
              <div className="text-[11px] font-medium text-slate-500 uppercase">
                Upfront Carbon (A0–A5)
              </div>
              <div className="text-lg font-bold text-slate-900 mt-0.5">
                {workingAssessment.totals.upfrontCarbonA0toA5TCO2e.toFixed(2)} tCO₂e
              </div>
              <div className="text-xs text-slate-600">
                {workingAssessment.totals.upfrontIntensityKgCO2ePerM2Gfa !== null
                  ? `${workingAssessment.totals.upfrontIntensityKgCO2ePerM2Gfa} kgCO₂e/m² GFA`
                  : 'N/A per m²'}
              </div>
            </div>

            <div className="bg-slate-50 rounded-lg p-3 border border-slate-200/80">
              <div className="text-[11px] font-medium text-slate-500 uppercase">
                Total Embodied (A–C)
              </div>
              <div className="text-lg font-bold text-slate-900 mt-0.5">
                {workingAssessment.totals.embodiedCarbonAtoCTCO2e.toFixed(2)} tCO₂e
              </div>
              <div className="text-xs text-slate-600">
                {workingAssessment.totals.embodiedIntensityKgCO2ePerM2Gfa !== null
                  ? `${workingAssessment.totals.embodiedIntensityKgCO2ePerM2Gfa} kgCO₂e/m² GFA`
                  : 'N/A per m²'}
              </div>
            </div>

            <div className="bg-slate-50 rounded-lg p-3 border border-slate-200/80">
              <div className="text-[11px] font-medium text-slate-500 uppercase">
                Operational (B6–B8, {referenceStudyPeriodYears}y)
              </div>
              <div className="text-lg font-bold text-slate-900 mt-0.5">
                {workingAssessment.totals.operationalCarbonB6toB8TCO2e !== null
                  ? `${workingAssessment.totals.operationalCarbonB6toB8TCO2e.toFixed(2)} tCO₂e`
                  : 'Unavailable'}
              </div>
              <div className="text-xs text-slate-600">
                {workingAssessment.totals.operationalIntensityKgCO2ePerM2GfaPerYear !== null
                  ? `${workingAssessment.totals.operationalIntensityKgCO2ePerM2GfaPerYear} kgCO₂e/m²/yr`
                  : 'Not assumed as 0'}
              </div>
            </div>

            <div className="bg-emerald-50/70 rounded-lg p-3 border border-emerald-200">
              <div className="text-[11px] font-semibold text-emerald-800 uppercase">
                Whole-Life Total (A–C)
              </div>
              <div className="text-lg font-bold text-emerald-950 mt-0.5">
                {workingAssessment.totals.wholeLifeCarbonAtoCTCO2e.toFixed(2)} tCO₂e
              </div>
              <div className="text-xs text-emerald-800">
                {workingAssessment.totals.wholeLifeIntensityKgCO2ePerM2Gfa !== null
                  ? `${workingAssessment.totals.wholeLifeIntensityKgCO2ePerM2Gfa} kgCO₂e/m² GFA`
                  : 'N/A per m²'}
              </div>
            </div>

            <div className="bg-indigo-50/60 rounded-lg p-3 border border-indigo-200">
              <div className="text-[11px] font-semibold text-indigo-800 uppercase">
                Module D (Separate)
              </div>
              <div className="text-lg font-bold text-indigo-950 mt-0.5">
                {workingAssessment.moduleDSummary.netModuleDBenefitOrLoadTCO2e !== null
                  ? `${workingAssessment.moduleDSummary.netModuleDBenefitOrLoadTCO2e.toFixed(2)} tCO₂e`
                  : 'Unassessed'}
              </div>
              <div className="text-[11px] text-indigo-700">
                Never deducted from A–C
              </div>
            </div>
          </div>

          {/* 6-Stage Navigation Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto mt-4 pt-2">
            {(
              [
                ['1-scope-boundary', '1. Scope & Boundary'],
                ['2-inventory', `2. Material Inventory (${inventory.length})`],
                ['3-factors-epd', `3. Carbon Factors & EPDs (${allFactors.length})`],
                ['4-lifecycle-modules', '4. Lifecycle Modules (A0–D)'],
                ['5-hotspots-scenarios', `5. Hotspots & Reductions (${workingAssessment.reductionOpportunities.length})`],
                ['6-quality-export', '6. Data Quality, Audit & Export'],
              ] as [WorkspaceStage, string][]
            ).map(([stageId, label]) => (
              <button
                key={stageId}
                onClick={() => setActiveStage(stageId)}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  activeStage === stageId
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6 space-y-6">
        {statusBanner && (
          <div
            className={`p-3.5 rounded-lg border flex items-center justify-between text-xs font-medium ${
              statusBanner.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : statusBanner.type === 'warning'
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : statusBanner.type === 'error'
                    ? 'bg-red-50 border-red-200 text-red-900'
                    : 'bg-blue-50 border-blue-200 text-blue-900'
            }`}
          >
            <span>{statusBanner.message}</span>
            <button
              onClick={() => setStatusBanner(null)}
              className="text-slate-500 hover:text-slate-800 ml-4 underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* STAGE 1: ASSESSMENT SCOPE & BOUNDARY SETUP */}
        {activeStage === '1-scope-boundary' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-6 space-y-5">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Assessment Scope, Reference Study Period & Normalization Metrics
                </h2>
                <p className="text-xs text-slate-600 mt-1">
                  Configure the assessment boundary per BS EN 15978 and RICS WLCA 2nd Edition. All replacement cycles (B4) and operational modules (B6–B8) are evaluated over the Reference Study Period.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Assessment Name
                  </label>
                  <input
                    type="text"
                    value={assessmentName}
                    onChange={(e) => setAssessmentName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Reference Study Period (Years)
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={120}
                    value={referenceStudyPeriodYears}
                    onChange={(e) => setReferenceStudyPeriodYears(Math.max(1, Number(e.target.value) || 60))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                  <span className="text-[11px] text-slate-500">
                    Standard RICS WLCA / EN 15978 default is 60 years.
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Gross Internal Floor Area — GIA / GFA (m²)
                  </label>
                  <input
                    type="number"
                    min={1}
                    step="0.5"
                    value={grossInternalFloorAreaM2}
                    onChange={(e) => setGrossInternalFloorAreaM2(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Treated Floor Area (m²) & Design Occupants
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      min={1}
                      value={treatedFloorAreaM2}
                      onChange={(e) => setTreatedFloorAreaM2(Math.max(0, Number(e.target.value) || 0))}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      title="Treated Floor Area (m²)"
                    />
                    <input
                      type="number"
                      min={1}
                      value={occupantsCount}
                      onChange={(e) => setOccupantsCount(Math.max(1, Number(e.target.value) || 1))}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      title="Occupants Count"
                    />
                  </div>
                </div>
              </div>

              {/* Biogenic Accounting Policy Toggle */}
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold text-slate-900">
                      Biogenic Carbon Accounting Mode (EN 15804+A2 / EN 15978)
                    </h3>
                    <p className="text-xs text-slate-600 mt-0.5">
                      When enabled, biogenic carbon uptake in A1–A3 (e.g. timber) is included alongside mandatory balancing biogenic release in C3–C4 so permanent sequestration is never double-counted.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={includeBiogenicInTotals}
                    onChange={(e) => setIncludeBiogenicInTotals(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                  />
                </div>
                <div className="text-xs font-mono text-slate-700 bg-white px-3 py-2 rounded border border-slate-200">
                  A1–A3 Biogenic Storage: {workingAssessment.biogenicSummary.totalBiogenicStorageA1A3KgCO2e.toLocaleString()} kgCO₂e | C3–C4 EoL Release: +{workingAssessment.biogenicSummary.totalBiogenicReleaseC3C4KgCO2e.toLocaleString()} kgCO₂e | Net A–C Biogenic Balance: {workingAssessment.biogenicSummary.netBiogenicBalanceAtoCKgCO2e} kgCO₂e
                </div>
              </div>

              {/* Optional Site & In-Use Stage Inputs (A0, A5a, B1, B2-B3) */}
              <div className="border-t border-slate-200 pt-4 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Optional Site & In-Use Lifecycle Allowances (A0, A5a, B1, B2–B3)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/60 space-y-2">
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                      <input
                        type="checkbox"
                        checked={siteAndInUseInputs.enableA0PreConstruction}
                        onChange={(e) =>
                          setSiteAndInUseInputs((prev) => ({
                            ...prev,
                            enableA0PreConstruction: e.target.checked,
                            a0PreConstructionKgCO2e: prev.a0PreConstructionKgCO2e ?? 1500,
                          }))
                        }
                      />
                      Include A0 Pre-Construction Stage (kgCO₂e)
                    </label>
                    {siteAndInUseInputs.enableA0PreConstruction && (
                      <input
                        type="number"
                        min={0}
                        value={siteAndInUseInputs.a0PreConstructionKgCO2e ?? 0}
                        onChange={(e) =>
                          setSiteAndInUseInputs((prev) => ({
                            ...prev,
                            a0PreConstructionKgCO2e: Math.max(0, Number(e.target.value) || 0),
                          }))
                        }
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white"
                      />
                    )}
                  </div>

                  <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/60 space-y-2">
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                      <input
                        type="checkbox"
                        checked={siteAndInUseInputs.enableA5SiteActivities}
                        onChange={(e) =>
                          setSiteAndInUseInputs((prev) => ({
                            ...prev,
                            enableA5SiteActivities: e.target.checked,
                            a5DirectSiteProcessKgCO2e: prev.a5DirectSiteProcessKgCO2e ?? 3200,
                          }))
                        }
                      />
                      Include A5a Direct On-Site Plant/Energy (kgCO₂e)
                    </label>
                    {siteAndInUseInputs.enableA5SiteActivities && (
                      <input
                        type="number"
                        min={0}
                        value={siteAndInUseInputs.a5DirectSiteProcessKgCO2e ?? 0}
                        onChange={(e) =>
                          setSiteAndInUseInputs((prev) => ({
                            ...prev,
                            a5DirectSiteProcessKgCO2e: Math.max(0, Number(e.target.value) || 0),
                          }))
                        }
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white"
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Supported Profile & Boundary Rules */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-700" />
                <h3 className="text-sm font-bold text-slate-900">
                  Methodology & Governance Rules
                </h3>
              </div>
              <div className="space-y-2 text-xs text-slate-600">
                <p className="font-semibold text-slate-800">Reference Standards:</p>
                <ul className="list-disc pl-4 space-y-1">
                  {SUPPORTED_CARBON_ASSESSMENT_PROFILE.methodologyReferences.map((ref, i) => (
                    <li key={i}>{ref}</li>
                  ))}
                </ul>
              </div>
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1.5">
                <div className="font-bold flex items-center gap-1.5">
                  <Info className="w-4 h-4 shrink-0" />
                  Non-Negotiable Accounting Guards
                </div>
                <p>• Missing operational energy (B6) or water (B7) is marked <strong>unavailable</strong>, never silently 0.</p>
                <p>• Module D benefits are reported strictly separately and never deducted from A–C totals.</p>
                <p>• Incompatible units without explicit thickness (m) or density (kg/m³) are rejected.</p>
              </div>
            </div>
          </div>
        )}

        {/* STAGE 2: MATERIAL & ELEMENT INVENTORY */}
        {activeStage === '2-inventory' && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Building Element & Material Quantity Inventory
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Every quantity is linked to its provenance (`model-derived-geometry`, `ifc-preserved-element`, `user-entered`, or `default-assumption`) and validated before unit conversion.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleResyncFromProjectModel}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Re-Sync from Project Geometry
                </button>
                <button
                  onClick={handleAddInventoryItem}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Element
                </button>
              </div>
            </div>

            {extractionWarnings.length > 0 && (
              <div className="space-y-1.5">
                {extractionWarnings.map((w, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 flex items-start gap-2"
                  >
                    <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-mono font-semibold text-slate-900">[{w.code}]</span>{' '}
                      {w.message}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] font-bold uppercase text-slate-500">
                    <th className="py-2.5 pr-3">Element & Provenance</th>
                    <th className="py-2.5 px-2">Category</th>
                    <th className="py-2.5 px-2">Quantity</th>
                    <th className="py-2.5 px-2">Unit</th>
                    <th className="py-2.5 px-2">Thickness (m)</th>
                    <th className="py-2.5 px-2">Lifespan (yr)</th>
                    <th className="py-2.5 px-2">Assigned Carbon Factor / EPD</th>
                    <th className="py-2.5 pl-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {inventory.map((item) => (
                    <tr key={item.itemId} className="hover:bg-slate-50/80">
                      <td className="py-3 pr-3">
                        <input
                          type="text"
                          value={item.elementName}
                          onChange={(e) =>
                            handleUpdateInventoryItem(item.itemId, { elementName: e.target.value })
                          }
                          className="font-semibold text-slate-900 bg-transparent border-b border-transparent focus:border-slate-400 focus:outline-none w-full"
                        />
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px]">
                            {item.sourceType}
                          </span>
                          <span className="text-[11px] text-slate-500 truncate max-w-xs">
                            {item.sourceDescription}
                          </span>
                        </div>
                      </td>

                      <td className="py-3 px-2">
                        <select
                          value={item.elementCategory}
                          onChange={(e) =>
                            handleUpdateInventoryItem(item.itemId, {
                              elementCategory: e.target.value as CarbonElementCategory,
                            })
                          }
                          className="px-2 py-1 border border-slate-300 rounded text-xs bg-white"
                        >
                          {Object.entries(ELEMENT_CATEGORY_LABELS).map(([k, lbl]) => (
                            <option key={k} value={k}>
                              {lbl}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="py-3 px-2">
                        <input
                          type="number"
                          step="0.1"
                          value={item.quantity}
                          onChange={(e) =>
                            handleUpdateInventoryItem(item.itemId, {
                              quantity: Number(e.target.value),
                            })
                          }
                          className="w-20 px-2 py-1 border border-slate-300 rounded text-xs"
                        />
                      </td>

                      <td className="py-3 px-2">
                        <select
                          value={item.quantityUnit}
                          onChange={(e) =>
                            handleUpdateInventoryItem(item.itemId, {
                              quantityUnit: e.target.value as CarbonMaterialInventoryItem['quantityUnit'],
                            })
                          }
                          className="px-2 py-1 border border-slate-300 rounded text-xs bg-white"
                        >
                          <option value="m2">m²</option>
                          <option value="m3">m³</option>
                          <option value="kg">kg</option>
                          <option value="tonne">tonne</option>
                          <option value="m">m</option>
                          <option value="item">item</option>
                        </select>
                      </td>

                      <td className="py-3 px-2">
                        <input
                          type="number"
                          step="0.01"
                          placeholder="—"
                          value={item.thicknessM ?? ''}
                          onChange={(e) =>
                            handleUpdateInventoryItem(item.itemId, {
                              thicknessM: e.target.value === '' ? undefined : Number(e.target.value),
                            })
                          }
                          className="w-16 px-2 py-1 border border-slate-300 rounded text-xs"
                        />
                      </td>

                      <td className="py-3 px-2">
                        <input
                          type="number"
                          min={5}
                          max={120}
                          value={item.serviceLifeYears ?? 60}
                          onChange={(e) =>
                            handleUpdateInventoryItem(item.itemId, {
                              serviceLifeYears: Math.max(1, Number(e.target.value) || 60),
                            })
                          }
                          className="w-16 px-2 py-1 border border-slate-300 rounded text-xs"
                        />
                      </td>

                      <td className="py-3 px-2">
                        <select
                          value={item.assignedFactorId ?? ''}
                          onChange={(e) =>
                            handleUpdateInventoryItem(item.itemId, {
                              assignedFactorId: e.target.value || undefined,
                            })
                          }
                          className="w-64 px-2 py-1 border border-slate-300 rounded text-xs bg-white"
                        >
                          <option value="">-- Unmapped (Excluded from Totals) --</option>
                          {materialFactors.map((f) => (
                            <option key={f.factorId} value={f.factorId}>
                              [{f.verificationStatus === 'verified-epd' ? 'EPD' : f.verificationStatus === 'user-imported-unverified' ? 'USER' : 'GENERIC'}] {f.name} ({f.gwpValueKgCO2ePerUnit} kgCO₂e/{f.declaredUnit})
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="py-3 pl-2 text-right">
                        <button
                          onClick={() => handleRemoveInventoryItem(item.itemId)}
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded"
                          title="Remove Element"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* STAGE 3: CARBON FACTOR & EPD REGISTRY & IMPORT */}
        {activeStage === '3-factors-epd' && (
          <div className="space-y-6">
            {/* Import Panel */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Import Custom Carbon Factors / EPD Dataset (CSV or JSON)
                  </h2>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Every imported factor is validated for required provenance, declared unit, and finite GWP values. Invalid records are quarantined; valid imports are tagged <code className="font-mono">user-imported-unverified</code> until explicitly confirmed.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setFactorImportFileName('sample-epd-batch.csv');
                    setRawFactorImportText(SAMPLE_CSV_FACTORS);
                  }}
                  className="text-xs font-semibold text-emerald-700 hover:underline"
                >
                  Load Sample CSV (1 Valid + 1 Corrupted Row)
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 space-y-2">
                  <textarea
                    rows={5}
                    value={rawFactorImportText}
                    onChange={(e) => setRawFactorImportText(e.target.value)}
                    placeholder="Paste CSV or JSON carbon factor records here..."
                    className="w-full p-3 text-xs font-mono border border-slate-300 rounded-lg"
                  />
                  <div className="flex items-center justify-between">
                    <input
                      type="text"
                      value={factorImportFileName}
                      onChange={(e) => setFactorImportFileName(e.target.value)}
                      className="px-2.5 py-1.5 text-xs border border-slate-300 rounded"
                      placeholder="Source filename"
                    />
                    <button
                      onClick={handleImportFactors}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-700 text-white hover:bg-emerald-800"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Validate & Import Factors
                    </button>
                  </div>
                </div>

                <div className="bg-slate-50 rounded-lg border border-slate-200 p-4 text-xs space-y-2">
                  <div className="font-bold text-slate-800">Import Quarantine & Validation Log</div>
                  {factorImportHistory.length === 0 ? (
                    <p className="text-slate-500">No custom factor imports run in this session yet.</p>
                  ) : (
                    factorImportHistory.slice(0, 2).map((hist, i) => (
                      <div key={i} className="space-y-1.5 border-b border-slate-200 pb-2 last:border-0">
                        <div className="font-semibold text-slate-900">
                          {hist.sourceFileName} ({hist.format.toUpperCase()})
                        </div>
                        <div className="text-emerald-700">
                          ✓ {hist.validFactors.length} valid factor(s) imported
                        </div>
                        {hist.quarantinedRecords.length > 0 && (
                          <div className="text-red-700 space-y-1">
                            <div>✕ {hist.quarantinedRecords.length} record(s) quarantined:</div>
                            {hist.quarantinedRecords.map((q, qi) => (
                              <div key={qi} className="pl-2 text-[11px] bg-red-50 p-1.5 rounded">
                                <strong>{q.rawIdentifier}:</strong> {q.reasons.join(' ')}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Factor Registry Table */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
              <h3 className="text-sm font-bold text-slate-900">
                Active Carbon Factor & EPD Registry ({allFactors.length} Records)
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] font-bold uppercase text-slate-500">
                      <th className="py-2 pr-3">Factor Name & ID</th>
                      <th className="py-2 px-2">Source & Hierarchy Tier</th>
                      <th className="py-2 px-2">Verification</th>
                      <th className="py-2 px-2">Declared Unit</th>
                      <th className="py-2 px-2">GWP (kgCO₂e/unit)</th>
                      <th className="py-2 px-2">Density (kg/m³)</th>
                      <th className="py-2 pl-2">Biogenic / Module D</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-xs">
                    {allFactors.map((f) => (
                      <tr key={f.factorId} className="hover:bg-slate-50">
                        <td className="py-2.5 pr-3">
                          <div className="font-semibold text-slate-900">{f.name}</div>
                          <div className="font-mono text-[11px] text-slate-500">
                            {f.factorId} {f.epdRegistrationNumber ? `• EPD: ${f.epdRegistrationNumber}` : ''}
                          </div>
                        </td>
                        <td className="py-2.5 px-2">
                          <div className="text-slate-800">{f.sourceOrganisation}</div>
                          <div className="text-[11px] text-slate-500">
                            {f.sourceReference} ({f.publicationYear}, {f.region})
                          </div>
                        </td>
                        <td className="py-2.5 px-2">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                              f.verificationStatus === 'verified-epd'
                                ? 'bg-emerald-100 text-emerald-800'
                                : f.verificationStatus === 'authoritative-generic'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {f.verificationStatus}
                          </span>
                          {f.verificationStatus === 'user-imported-unverified' && (
                            <label className="flex items-center gap-1 mt-1 text-[11px] text-slate-700">
                              <input
                                type="checkbox"
                                checked={Boolean(f.userConfirmedUnverified)}
                                onChange={(e) =>
                                  handleConfirmUnverifiedFactor(f.factorId, e.target.checked)
                                }
                              />
                              Confirm user factor
                            </label>
                          )}
                        </td>
                        <td className="py-2.5 px-2 font-mono">{f.declaredUnit}</td>
                        <td className="py-2.5 px-2 font-bold text-slate-900">
                          {f.gwpValueKgCO2ePerUnit}
                        </td>
                        <td className="py-2.5 px-2 font-mono">
                          {f.densityKgPerM3 ?? '—'}
                        </td>
                        <td className="py-2.5 pl-2 text-[11px] text-slate-600">
                          <div>Biogenic A1–A3: {f.biogenicStorageKgCO2ePerUnit ?? 0}</div>
                          <div>Module D: {f.moduleDBenefitKgCO2ePerUnit ?? '—'}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* STAGE 4: LIFECYCLE MODULE BREAKDOWN & OPERATIONAL B6/B7 */}
        {activeStage === '4-lifecycle-modules' && (
          <div className="space-y-6">
            {/* Operational Energy (B6) & Water (B7) Configuration */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-600" />
                    <h3 className="text-sm font-bold text-slate-900">
                      Module B6 — Operational Energy Use ({referenceStudyPeriodYears}-Year RSP)
                    </h3>
                  </div>
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                    <input
                      type="checkbox"
                      checked={operationalEnergy.enabled}
                      onChange={(e) =>
                        setOperationalEnergy((prev) => ({
                          ...prev,
                          enabled: e.target.checked,
                          sourceType: e.target.checked ? 'user-entered' : 'unavailable',
                          annualElectricityKwhPerYear:
                            prev.annualElectricityKwhPerYear ??
                            Math.round(grossInternalFloorAreaM2 * 45),
                        }))
                      }
                    />
                    Enable B6 Operational Energy
                  </label>
                </div>

                {!operationalEnergy.enabled ? (
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
                    B6 is currently marked <strong>unavailable</strong>. Plotify never assumes missing operational energy equals <code className="font-mono">0 kgCO₂e</code>. Enable B6 above to enter annual electricity or fuel demand.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Annual Grid Electricity (kWh/yr)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={operationalEnergy.annualElectricityKwhPerYear ?? 0}
                        onChange={(e) =>
                          setOperationalEnergy((prev) => ({
                            ...prev,
                            annualElectricityKwhPerYear: Math.max(0, Number(e.target.value) || 0),
                          }))
                        }
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Grid Electricity Factor
                      </label>
                      <select
                        value={operationalEnergy.electricityGridFactorId ?? 'grid-electricity-average-reference'}
                        onChange={(e) =>
                          setOperationalEnergy((prev) => ({
                            ...prev,
                            electricityGridFactorId: e.target.value,
                          }))
                        }
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                      >
                        {electricityFactors.map((f) => (
                          <option key={f.factorId} value={f.factorId}>
                            {f.name} ({f.gwpValueKgCO2ePerUnit} kgCO₂e/kWh)
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Annual Thermal Fuel / Gas (kWh/yr)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={operationalEnergy.annualFuelThermalKwhPerYear ?? 0}
                        onChange={(e) =>
                          setOperationalEnergy((prev) => ({
                            ...prev,
                            annualFuelThermalKwhPerYear: Math.max(0, Number(e.target.value) || 0),
                          }))
                        }
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Exported On-Site Renewable (kWh/yr → Module D)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={operationalEnergy.onSiteRenewableExportedKwhPerYear ?? 0}
                        onChange={(e) =>
                          setOperationalEnergy((prev) => ({
                            ...prev,
                            onSiteRenewableExportedKwhPerYear: Math.max(0, Number(e.target.value) || 0),
                          }))
                        }
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-blue-600" />
                    <h3 className="text-sm font-bold text-slate-900">
                      Module B7 — Operational Water Use ({referenceStudyPeriodYears}-Year RSP)
                    </h3>
                  </div>
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                    <input
                      type="checkbox"
                      checked={operationalWater.enabled}
                      onChange={(e) =>
                        setOperationalWater((prev) => ({
                          ...prev,
                          enabled: e.target.checked,
                          sourceType: e.target.checked ? 'user-entered' : 'unavailable',
                          annualPotableWaterM3PerYear:
                            prev.annualPotableWaterM3PerYear ?? Math.round(occupantsCount * 45),
                        }))
                      }
                    />
                    Enable B7 Operational Water
                  </label>
                </div>

                {!operationalWater.enabled ? (
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
                    B7 is currently marked <strong>unavailable</strong>. Enable B7 above to enter annual potable water supply & treatment demand (m³/yr).
                  </div>
                ) : (
                  <div className="space-y-3 text-xs">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Annual Potable Water Consumption (m³/yr)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={operationalWater.annualPotableWaterM3PerYear ?? 0}
                        onChange={(e) =>
                          setOperationalWater((prev) => ({
                            ...prev,
                            annualPotableWaterM3PerYear: Math.max(0, Number(e.target.value) || 0),
                          }))
                        }
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
                      />
                    </div>
                    <p className="text-slate-500">
                      Evaluated using DEFRA Mains Water Supply & Wastewater Treatment combined factor (0.378 kgCO₂e/m³).
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Lifecycle Module Table */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
              <h2 className="text-base font-bold text-slate-900">
                EN 15978 / RICS WLCA Lifecycle Module Ledger (Modules A0–C4 + Separate Module D)
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] font-bold uppercase text-slate-500">
                      <th className="py-2.5 pr-3">Module</th>
                      <th className="py-2.5 px-2">Lifecycle Stage</th>
                      <th className="py-2.5 px-2">Status</th>
                      <th className="py-2.5 px-2 text-right">Emissions (kgCO₂e)</th>
                      <th className="py-2.5 px-2 text-right">Emissions (tCO₂e)</th>
                      <th className="py-2.5 px-2 text-right">Intensity (kgCO₂e/m²)</th>
                      <th className="py-2.5 pl-3">Status & Boundary Explanation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-xs">
                    {workingAssessment.moduleResults.map((mod) => (
                      <tr
                        key={mod.moduleCode}
                        className={mod.moduleCode === 'D' ? 'bg-indigo-50/40 font-medium' : 'hover:bg-slate-50'}
                      >
                        <td className="py-3 pr-3 font-mono font-bold text-slate-900">
                          {mod.moduleCode}
                        </td>
                        <td className="py-3 px-2 text-slate-800">{mod.title}</td>
                        <td className="py-3 px-2">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                              mod.status === 'assessed'
                                ? 'bg-emerald-100 text-emerald-800'
                                : mod.status === 'partially-assessed'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {mod.status}
                          </span>
                        </td>
                        <td className="py-3 px-2 text-right font-mono font-semibold text-slate-900">
                          {mod.emissionsKgCO2e !== null
                            ? mod.emissionsKgCO2e.toLocaleString()
                            : 'Unavailable / Unassessed'}
                        </td>
                        <td className="py-3 px-2 text-right font-mono text-slate-700">
                          {mod.emissionsTCO2e !== null ? mod.emissionsTCO2e.toFixed(3) : '—'}
                        </td>
                        <td className="py-3 px-2 text-right font-mono text-slate-700">
                          {mod.intensityKgCO2ePerM2Gfa !== null ? mod.intensityKgCO2ePerM2Gfa : '—'}
                        </td>
                        <td className="py-3 pl-3 text-slate-600">{mod.statusExplanation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Auditable Calculation Trace Table */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
              <h3 className="text-sm font-bold text-slate-900">
                Auditable Calculation Traces ({workingAssessment.calculationTraces.length} Traces)
              </h3>
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] font-bold uppercase text-slate-500 sticky top-0 bg-white">
                      <th className="py-2 pr-2">Mod</th>
                      <th className="py-2 px-2">Element</th>
                      <th className="py-2 px-2">Unit Conversion Trace</th>
                      <th className="py-2 px-2">Factor & Formula</th>
                      <th className="py-2 pl-2 text-right">Result (kgCO₂e)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {workingAssessment.calculationTraces.map((trace) => (
                      <tr key={trace.traceId} className="hover:bg-slate-50">
                        <td className="py-2 pr-2 font-mono font-bold text-slate-800">
                          {trace.moduleCode}
                        </td>
                        <td className="py-2 px-2 text-slate-900 font-medium">
                          {trace.elementName}
                        </td>
                        <td className="py-2 px-2 font-mono text-[11px] text-slate-600">
                          {trace.conversionExplanation}
                        </td>
                        <td className="py-2 px-2 text-[11px] text-slate-700">
                          <div className="font-medium">{trace.factorName}</div>
                          <div className="font-mono text-slate-500">{trace.formulaDescription}</div>
                        </td>
                        <td className="py-2 pl-2 text-right font-mono font-bold text-slate-900">
                          {trace.emissionsKgCO2e.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* STAGE 5: HOTSPOTS & EXPLAINABLE CARBON-REDUCTION SCENARIOS */}
        {activeStage === '5-hotspots-scenarios' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Hotspots by Category */}
              <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
                <h2 className="text-base font-bold text-slate-900">
                  Carbon Hotspots by Building Element Category (A–C)
                </h2>
                <div className="space-y-3">
                  {workingAssessment.hotspotsByCategory.map((h) => (
                    <div key={h.categoryOrItemId} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-800">
                          #{h.rank} {h.label}
                        </span>
                        <span className="font-mono text-slate-700">
                          {(h.emissionsKgCO2e / 1000).toFixed(2)} tCO₂e ({h.shareOfAssessedWholeLifePercent}%)
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-600 rounded-full"
                          style={{ width: `${Math.min(100, Math.max(2, h.shareOfAssessedWholeLifePercent))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Hotspots by Individual Item */}
              <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
                <h2 className="text-base font-bold text-slate-900">
                  Top Inventory Item Contributors
                </h2>
                <div className="space-y-2.5">
                  {workingAssessment.hotspotsByItem.slice(0, 6).map((h) => (
                    <div
                      key={h.categoryOrItemId}
                      className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-bold text-slate-900">
                          #{h.rank} {h.label}
                        </div>
                        <div className="text-[11px] text-slate-500">{h.primaryFactorName}</div>
                      </div>
                      <div className="text-right font-mono">
                        <div className="font-bold text-slate-900">
                          {h.emissionsKgCO2e.toLocaleString()} kgCO₂e
                        </div>
                        <div className="text-[11px] text-emerald-700">
                          {h.shareOfAssessedWholeLifePercent}% of Whole-Life
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Explainable Carbon-Reduction Opportunities */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Explainable Carbon-Reduction Opportunities (Deterministic Material & Specification Substitutions)
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Every opportunity is computed directly from your mapped inventory quantities, replacement cycles, and verified EPD / benchmark alternatives. Applying an opportunity updates the working scenario without mutating unrelated project geometry.
                </p>
              </div>

              {workingAssessment.reductionOpportunities.length === 0 ? (
                <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
                  All mapped building elements are already using the lowest-carbon verified EPD specifications in the active registry.
                </div>
              ) : (
                <div className="space-y-3">
                  {workingAssessment.reductionOpportunities.map((opp) => (
                    <div
                      key={opp.opportunityId}
                      className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800">
                            Save {(opp.estimatedSavingKgCO2e / 1000).toFixed(2)} tCO₂e (-{opp.estimatedSavingPercentOfItem}% on element / -{opp.estimatedSavingPercentOfWholeLife}% Whole-Life)
                          </span>
                          <span className="text-[11px] font-mono text-slate-500">
                            Confidence: {opp.confidenceLevel.toUpperCase()} • Affects {opp.affectedModules.join(', ')}
                          </span>
                        </div>
                        <h3 className="text-sm font-bold text-slate-900">{opp.title}</h3>
                        <div className="text-xs font-mono text-slate-700 bg-white p-2 rounded border border-slate-200">
                          {opp.explanationFormula}
                        </div>
                        <ul className="text-[11px] text-slate-600 list-disc pl-4 space-y-0.5">
                          {opp.technicalTradeoffsAndCaveats.map((caveat, ci) => (
                            <li key={ci}>{caveat}</li>
                          ))}
                        </ul>
                      </div>

                      <div className="shrink-0">
                        <button
                          onClick={() => handleApplyOpportunity(opp.targetItemId, opp.proposedFactorId)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-700 text-white hover:bg-emerald-800"
                        >
                          <Leaf className="w-3.5 h-3.5" />
                          Apply to Working Scenario
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Saved Scenarios Comparison */}
            {(project.carbonAssessment?.savedScenarios?.length ?? 0) > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
                <h3 className="text-sm font-bold text-slate-900">
                  Saved Project Carbon Scenarios Comparison
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-[11px] font-bold uppercase text-slate-500">
                        <th className="py-2 pr-3">Scenario Name</th>
                        <th className="py-2 px-2">Scope Classification</th>
                        <th className="py-2 px-2 text-right">Upfront A0–A5 (tCO₂e)</th>
                        <th className="py-2 px-2 text-right">Embodied A–C (tCO₂e)</th>
                        <th className="py-2 px-2 text-right">Whole-Life A–C (tCO₂e)</th>
                        <th className="py-2 pl-2 text-right">Intensity (kgCO₂e/m²)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {project.carbonAssessment!.savedScenarios.map((scen) => (
                        <tr key={scen.assessmentId}>
                          <td className="py-2.5 pr-3 font-semibold text-slate-900">
                            {scen.assessmentName}
                          </td>
                          <td className="py-2.5 px-2">{scen.scopeClassification}</td>
                          <td className="py-2.5 px-2 text-right font-mono">
                            {scen.totals.upfrontCarbonA0toA5TCO2e.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono">
                            {scen.totals.embodiedCarbonAtoCTCO2e.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono font-bold text-emerald-800">
                            {scen.totals.wholeLifeCarbonAtoCTCO2e.toFixed(2)}
                          </td>
                          <td className="py-2.5 pl-2 text-right font-mono">
                            {scen.totals.wholeLifeIntensityKgCO2ePerM2Gfa ?? '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* STAGE 6: DATA QUALITY, VALIDATION, PROVENANCE & EXPORT */}
        {activeStage === '6-quality-export' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
                <h2 className="text-base font-bold text-slate-900">
                  Data Quality & Provenance Breakdown
                </h2>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="text-slate-500">Inventory Completeness</div>
                    <div className="text-lg font-bold text-slate-900 mt-0.5">
                      {workingAssessment.dataQuality.mappedInventoryItems} / {workingAssessment.dataQuality.totalInventoryItems} ({workingAssessment.dataQuality.inventoryCompletenessPercent}%)
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="text-slate-500">Uncertainty Rating</div>
                    <div className="text-lg font-bold uppercase text-slate-900 mt-0.5">
                      {workingAssessment.dataQuality.overallUncertaintyRating}
                    </div>
                  </div>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="font-semibold text-slate-800">
                    Embodied Emissions Share by Factor Verification Tier:
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 rounded bg-emerald-50 border border-emerald-200">
                      Verified Product EPD: <strong>{workingAssessment.dataQuality.emissionsShareByFactorVerification.verifiedEpdPercent}%</strong>
                    </div>
                    <div className="p-2 rounded bg-blue-50 border border-blue-200">
                      Authoritative Generic: <strong>{workingAssessment.dataQuality.emissionsShareByFactorVerification.authoritativeGenericPercent}%</strong>
                    </div>
                    <div className="p-2 rounded bg-amber-50 border border-amber-200">
                      User Unverified: <strong>{workingAssessment.dataQuality.emissionsShareByFactorVerification.userImportedUnverifiedPercent}%</strong>
                    </div>
                    <div className="p-2 rounded bg-slate-100 border border-slate-200">
                      Scenario Assumption: <strong>{workingAssessment.dataQuality.emissionsShareByFactorVerification.scenarioAssumptionPercent}%</strong>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="font-semibold text-slate-800">
                    Embodied Emissions Share by Quantity Source:
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 rounded bg-slate-50 border border-slate-200">
                      Model-Derived Geometry: <strong>{workingAssessment.dataQuality.emissionsShareByQuantitySource.modelDerivedPercent}%</strong>
                    </div>
                    <div className="p-2 rounded bg-slate-50 border border-slate-200">
                      P41 IFC Preserved Elements: <strong>{workingAssessment.dataQuality.emissionsShareByQuantitySource.ifcPreservedPercent}%</strong>
                    </div>
                    <div className="p-2 rounded bg-slate-50 border border-slate-200">
                      User-Entered Quantities: <strong>{workingAssessment.dataQuality.emissionsShareByQuantitySource.userEnteredPercent}%</strong>
                    </div>
                    <div className="p-2 rounded bg-slate-50 border border-slate-200">
                      Default Assumptions: <strong>{workingAssessment.dataQuality.emissionsShareByQuantitySource.defaultAssumptionPercent}%</strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* Validation Issues Register */}
              <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
                <h2 className="text-base font-bold text-slate-900">
                  Validation & Boundary Audit Register ({workingAssessment.validationIssues.length})
                </h2>
                <div className="space-y-2.5 max-h-80 overflow-y-auto">
                  {workingAssessment.validationIssues.map((issue) => (
                    <div
                      key={issue.issueId}
                      className={`p-3 rounded-lg border text-xs ${
                        issue.severity === 'error'
                          ? 'bg-red-50 border-red-200 text-red-900'
                          : issue.severity === 'warning'
                            ? 'bg-amber-50 border-amber-200 text-amber-900'
                            : 'bg-slate-50 border-slate-200 text-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-2 font-bold">
                        {issue.severity === 'error' || issue.severity === 'warning' ? (
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        )}
                        <span>[{issue.code}]</span>
                        {issue.moduleCode && (
                          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white/80">
                            Module {issue.moduleCode}
                          </span>
                        )}
                      </div>
                      <p className="mt-1">{issue.message}</p>
                      <p className="mt-1 text-[11px] opacity-80">
                        Remediation: {issue.remediationHint}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Export & Safe Persistence Controls */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900">
                  Audit Report Export & Safe Project Persistence
                </h3>
                <p className="text-xs text-slate-600">
                  Export full calculation traces, factor provenance, and boundary disclosures, or remove persisted carbon assessment metadata with an automatic rollback checkpoint.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => handleDownloadReport('json')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Export JSON
                </button>
                <button
                  onClick={() => handleDownloadReport('markdown')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export Markdown Report
                </button>
                <button
                  onClick={() => handleDownloadReport('csv')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  Export CSV Traces
                </button>
                {project.carbonAssessment && (
                  <button
                    onClick={handleRemoveFromProject}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Remove Saved Assessment
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
