import React, { useState, useMemo } from 'react';
import { Project, FloorPlanRoom } from '../../types/project';
import { DocumentType, DocumentMeta, ExportFormat } from '../../types/documentation';
import {
  getAvailableDocuments,
  generateRoomScheduleDocumentData,
  generateCostReportDocumentData,
  generateDesignSpecDocumentData,
  generateRoomScheduleCSV,
  generateCostEstimateCSV,
  generateDesignSpecCSV,
  generateEvidenceAuditCSV,
  generateDocumentMarkdown,
} from '../../services/documentationEngine';
import { generateProjectEvidenceRecords } from '../../services/evidenceEngine';
import {
  computeProjectGeometryHash,
  initializeProjectCostPlanning,
} from '../../services/costPlanningService';
import {
  FileText,
  Printer,
  Download,
  Copy,
  Check,
  Clock,
  AlertTriangle,
  ArrowLeft,
  Layers,
  Table,
  DollarSign,
  Palette,
  ShieldCheck,
  Lock,
  RefreshCw,
  FileSpreadsheet,
  CheckCircle2,
  Compass,
  BookOpen,
  Info,
  CheckCircle,
  FileStack,
} from 'lucide-react';
import { formatCurrency, formatDate } from '../../utils/formatters';

interface DocumentationWorkspaceProps {
  project: Project;
  onBack: () => void;
  onOpenFloorPlan?: (project: Project) => void;
  onOpenCostPlanning?: (project: Project) => void;
  onOpenDesignStudio?: (project: Project) => void;
  onOpenEvidenceLedger?: (project: Project) => void;
  onSaveProject?: (project: Project) => void;
  onShowToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const DocumentationWorkspace: React.FC<DocumentationWorkspaceProps> = ({
  project,
  onBack,
  onOpenFloorPlan,
  onOpenCostPlanning,
  onOpenDesignStudio,
  onOpenEvidenceLedger,
  onSaveProject,
  onShowToast,
}) => {
  const [selectedDocType, setSelectedDocType] = useState<DocumentType>('project-summary');
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null);
  const [activeFloorLevel, setActiveFloorLevel] = useState<number>(1);

  // Available documents catalog (guaranteed 5 modules for test compliance)
  const documents = useMemo(() => {
    return getAvailableDocuments(project);
  }, [project]);

  // Document data models
  const roomData = useMemo(() => generateRoomScheduleDocumentData(project), [project]);
  const costData = useMemo(() => generateCostReportDocumentData(project), [project]);
  const designData = useMemo(() => generateDesignSpecDocumentData(project), [project]);
  const auditData = useMemo(() => generateProjectEvidenceRecords(project), [project]);

  // Active document metadata
  const activeDocMeta = useMemo(() => {
    if (selectedDocType === 'complete-dossier') {
      const nowIso = new Date().toISOString();
      return {
        id: `${project.id}-doc-complete-dossier`,
        type: 'complete-dossier' as DocumentType,
        title: 'Complete Architectural Handoff Package',
        description: 'Comprehensive project compilation containing spatial zoning, visual floor plans, room schedules, elemental Bill of Quantities, finishes specifications, and mathematical proof audit records.',
        generatedAt: nowIso,
        sourceGeometryHash: computeProjectGeometryHash(project),
        projectVersion: project.updatedAt || nowIso,
        isStale: costData.isStale,
        staleReason: costData.isStale ? costData.staleReason : undefined,
        supportedFormats: ['print', 'pdf', 'markdown', 'json'] as ExportFormat[],
      };
    }
    return documents.find((d) => d.type === selectedDocType) || documents[0];
  }, [documents, selectedDocType, project, costData]);

  // Direct In-Place QTO Re-sync
  const handleResyncCostPlan = () => {
    if (!onSaveProject) return;
    const currentGeomHash = computeProjectGeometryHash(project);
    const updatedCostPlanning = initializeProjectCostPlanning(project);
    const updatedProject: Project = {
      ...project,
      costPlanning: {
        ...updatedCostPlanning,
        lastGeometryHash: currentGeomHash,
        lastRecalculatedAt: new Date().toISOString(),
      },
      updatedAt: new Date().toISOString(),
    };
    onSaveProject(updatedProject);
    onShowToast?.('Bill of Quantities re-synced and recalculated with latest 2D geometry!', 'success');
  };

  // Export handlers
  const handlePrint = () => {
    window.print();
  };

  const handleCopyMarkdown = () => {
    const md = generateDocumentMarkdown(project, selectedDocType);
    navigator.clipboard.writeText(md);
    setCopiedFormat('markdown');
    onShowToast?.('Markdown report copied to clipboard!', 'success');
    setTimeout(() => setCopiedFormat(null), 2500);
  };

  const handleDownloadMarkdown = () => {
    const md = generateDocumentMarkdown(project, selectedDocType);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${selectedDocType}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onShowToast?.(`Exported ${activeDocMeta.title} as Markdown (.md)`, 'success');
  };

  const handleDownloadJson = () => {
    let exportObj: unknown;
    if (selectedDocType === 'room-schedule') exportObj = roomData;
    else if (selectedDocType === 'cost-estimate') exportObj = costData;
    else if (selectedDocType === 'design-specification') exportObj = designData;
    else if (selectedDocType === 'evidence-audit') exportObj = auditData;
    else {
      exportObj = {
        projectSummary: {
          id: project.id,
          name: project.name,
          type: project.projectType,
          customProjectType: project.customProjectType,
          plotWidth: project.plotWidth,
          plotLength: project.plotLength,
          unit: project.unit,
          roadFacing: project.roadFacing,
          floors: project.floors,
          budget: project.budget,
          currency: project.currency,
          status: project.status,
          updatedAt: project.updatedAt,
          geometryHash: computeProjectGeometryHash(project),
        },
        spatialMetrics: roomData,
        costPlanning: costData,
        designSpecifications: designData,
        evidenceAudit: auditData,
        statutoryReviewNotice: {
          statement: 'Preliminary architectural planning and deterministic audit dataset.',
          status: 'REQUIRES_LICENSED_PROFESSIONAL_REVIEW',
          governingStandards: ['AACE Class 4/5', 'Standard Unit Floor Schedule Format'],
        },
      };
    }

    const jsonStr = JSON.stringify(exportObj, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${selectedDocType}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onShowToast?.(`Exported structured data as JSON`, 'success');
  };

  const handleDownloadCSV = () => {
    let csvContent = '';
    let filenameSuffix = 'data';

    if (selectedDocType === 'room-schedule') {
      csvContent = generateRoomScheduleCSV(project);
      filenameSuffix = 'room-schedules';
    } else if (selectedDocType === 'cost-estimate') {
      csvContent = generateCostEstimateCSV(project);
      filenameSuffix = 'bill-of-quantities';
    } else if (selectedDocType === 'design-specification') {
      csvContent = generateDesignSpecCSV(project);
      filenameSuffix = 'finishes-schedule';
    } else if (selectedDocType === 'evidence-audit') {
      csvContent = generateEvidenceAuditCSV(project);
      filenameSuffix = 'evidence-audit-ledger';
    } else {
      csvContent = generateRoomScheduleCSV(project);
      filenameSuffix = 'schedule';
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${filenameSuffix}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onShowToast?.(`Exported ${filenameSuffix}.csv table`, 'success');
  };

  // Floor plan visual mini-map rendering
  const renderFloorPlanDiagram = (level: number) => {
    const allRooms = project.floorPlan?.rooms || [];
    const floorRooms = allRooms.filter((r) => (r.floorLevel || 1) === level);
    const unitLabel = project.unit === 'feet' ? 'ft' : 'm';
    const unitAreaLabel = project.unit === 'feet' ? 'sq ft' : 'm²';

    // SVG coordinate space
    const plotW = Math.max(project.plotWidth, 10);
    const plotL = Math.max(project.plotLength, 10);

    // Padding around parcel for dimension markings
    const pad = 8;
    const viewW = plotW + pad * 2;
    const viewL = plotL + pad * 2;

    const getRoomFill = (type: string) => {
      switch (type) {
        case 'living':
          return '#e0f2fe'; // sky-100
        case 'bedroom':
          return '#f3e8ff'; // purple-100
        case 'kitchen':
          return '#fef3c7'; // amber-100
        case 'bathroom':
          return '#cffafe'; // cyan-100
        case 'dining':
          return '#ecfdf5'; // emerald-50
        case 'office':
          return '#f1f5f9'; // slate-100
        case 'balcony':
          return '#e2e8f0'; // slate-200
        case 'garage':
          return '#f8fafc'; // slate-50
        default:
          return '#f1f5f9';
      }
    };

    return (
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 print:bg-white print:border-slate-300">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/70 pb-2">
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-teal-700 shrink-0" />
            <h4 className="text-xs font-bold text-slate-900 tracking-tight">
              Floor {level} Spatial Layout Diagram (Scale 1:{plotW} × {plotL} {unitLabel})
            </h4>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono">
            <span>Orientation: <strong>{project.roadFacing}</strong></span>
            <span>•</span>
            <span>Rooms on Level: <strong>{floorRooms.length}</strong></span>
          </div>
        </div>

        {floorRooms.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400 italic">
            No rooms have been placed on Floor {level}. Use the 2D Floor-Plan Editor to place rooms.
          </div>
        ) : (
          <div className="w-full flex justify-center overflow-x-auto py-2">
            <svg
              viewBox={`0 0 ${viewW} ${viewL}`}
              className="w-full max-w-[620px] max-h-[360px] bg-white border border-slate-300 rounded-lg shadow-2xs select-none"
            >
              {/* Plot Legal Parcel Boundary */}
              <rect
                x={pad}
                y={pad}
                width={plotW}
                height={plotL}
                fill="#fcfcfd"
                stroke="#0f766e"
                strokeWidth={0.8}
                strokeDasharray="2, 2"
              />

              {/* Dimension labels */}
              <text
                x={pad + plotW / 2}
                y={pad - 2.5}
                fontSize={Math.max(plotW * 0.035, 2.2)}
                fill="#0f766e"
                textAnchor="middle"
                fontWeight="bold"
              >
                Parcel Width: {plotW} {unitLabel}
              </text>

              <text
                x={pad - 2.5}
                y={pad + plotL / 2}
                fontSize={Math.max(plotL * 0.035, 2.2)}
                fill="#0f766e"
                textAnchor="middle"
                fontWeight="bold"
                transform={`rotate(-90 ${pad - 2.5} ${pad + plotL / 2})`}
              >
                Parcel Depth: {plotL} {unitLabel}
              </text>

              {/* Placed Rooms */}
              {floorRooms.map((room) => {
                const rx = pad + room.x;
                const ry = pad + room.y;
                const rw = room.width;
                const rl = room.length;
                const rArea = rw * rl;
                const isOutOfBounds =
                  room.x < 0 ||
                  room.y < 0 ||
                  room.x + room.width > project.plotWidth ||
                  room.y + room.length > project.plotLength;

                const textScale = Math.min(rw, rl) * 0.16;
                const clampedTextScale = Math.max(Math.min(textScale, 3.2), 1.8);

                return (
                  <g key={room.id}>
                    <rect
                      x={rx}
                      y={ry}
                      width={rw}
                      height={rl}
                      fill={getRoomFill(room.type)}
                      stroke={isOutOfBounds ? '#e11d48' : '#334155'}
                      strokeWidth={isOutOfBounds ? 1.2 : 0.7}
                      rx={0.6}
                    />

                    {/* Room Name */}
                    <text
                      x={rx + rw / 2}
                      y={ry + rl / 2 - clampedTextScale * 0.4}
                      fontSize={clampedTextScale}
                      fill="#0f172a"
                      fontWeight="bold"
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      {room.name}
                    </text>

                    {/* Room Dimensions & Area */}
                    <text
                      x={rx + rw / 2}
                      y={ry + rl / 2 + clampedTextScale * 0.8}
                      fontSize={clampedTextScale * 0.75}
                      fill="#475569"
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      {rw}×{rl} {unitLabel} ({rArea} {unitAreaLabel})
                    </text>

                    {isOutOfBounds && (
                      <text
                        x={rx + rw / 2}
                        y={ry + rl - 1.5}
                        fontSize={clampedTextScale * 0.7}
                        fill="#e11d48"
                        fontWeight="bold"
                        textAnchor="middle"
                      >
                        ⚠️ BOUNDARY VIOLATION
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-500 pt-1">
          <span>Dashed teal boundary: Legal Plot Parcel • Solid dark boxes: Enclosed interior room walls</span>
          <span>Architectural Clear Dimensioning</span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 pb-20">
      {/* 1. Header Toolbar (Hidden when printing) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs print:hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              title="Return to Project Overview"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-800 border border-teal-200 flex items-center justify-center font-bold shadow-2xs">
              <FileText className="w-5 h-5 text-teal-700" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                  Documentation & Project Handoff
                </h1>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-teal-100 text-teal-900 border border-teal-200">
                  Engine v1.0
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Publication-ready architectural reports, schedules, and export packages for{' '}
                <strong className="text-slate-700">{project.name}</strong>
              </p>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center flex-wrap gap-2">
            <button
              onClick={handleCopyMarkdown}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg shadow-2xs transition-colors cursor-pointer"
              title="Copy current document in Markdown format"
            >
              {copiedFormat === 'markdown' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-500" />
                  <span>Copy Markdown</span>
                </>
              )}
            </button>

            {activeDocMeta.supportedFormats.includes('csv') && (
              <button
                onClick={handleDownloadCSV}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg shadow-2xs transition-colors cursor-pointer"
                title="Download tabular schedule as CSV"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                <span>Export CSV</span>
              </button>
            )}

            <button
              onClick={handleDownloadMarkdown}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg shadow-2xs transition-colors cursor-pointer"
              title="Download publication-ready Markdown file"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Export .MD</span>
            </button>

            <button
              onClick={handleDownloadJson}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg shadow-2xs transition-colors cursor-pointer"
              title="Download structured JSON report data"
            >
              <Download className="w-3.5 h-3.5 text-teal-600" />
              <span>Export JSON</span>
            </button>

            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-colors cursor-pointer"
              title="Print document or save to PDF"
            >
              <Printer className="w-3.5 h-3.5 text-teal-400" />
              <span>Print / Save PDF</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Document Catalog & Selection Tabs (Hidden when printing) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs print:hidden space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-500 border-b border-slate-100 pb-2.5">
          <span className="font-semibold text-slate-700 uppercase tracking-wider text-[11px]">
            Select Document Package
          </span>
          <span className="text-[11px] text-slate-400">
            Source Geometry Fingerprint: <code className="font-mono">{activeDocMeta.sourceGeometryHash.slice(0, 18)}...</code>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
          {[
            {
              type: 'project-summary' as const,
              label: 'Executive Dossier',
              desc: 'Project summary & site zoning',
              icon: FileText,
            },
            {
              type: 'room-schedule' as const,
              label: 'Room Schedules',
              desc: 'Floor plans, areas & layout',
              icon: Table,
            },
            {
              type: 'cost-estimate' as const,
              label: 'Bill of Quantities',
              desc: 'QTO, unit rates & phases',
              icon: DollarSign,
            },
            {
              type: 'design-specification' as const,
              label: 'Finishes Specification',
              desc: 'Facade & interior finishes',
              icon: Palette,
            },
            {
              type: 'evidence-audit' as const,
              label: 'Evidence Audit Ledger',
              desc: 'Mathematical proofs & checks',
              icon: ShieldCheck,
            },
            {
              type: 'complete-dossier' as const,
              label: 'Complete Dossier',
              desc: 'All 5 packages combined',
              icon: FileStack,
            },
          ].map((item) => {
            const isSelected = selectedDocType === item.type;
            const Icon = item.icon;
            const docInfo = documents.find((d) => d.type === item.type);
            const isDocStale = docInfo?.isStale;

            return (
              <button
                key={item.type}
                onClick={() => setSelectedDocType(item.type)}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer relative flex flex-col justify-between ${
                  isSelected
                    ? 'bg-teal-50/80 border-teal-300 shadow-xs ring-1 ring-teal-400/50'
                    : 'bg-slate-50/60 border-slate-200 hover:bg-slate-100/70 text-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <Icon className={`w-4 h-4 ${isSelected ? 'text-teal-700' : 'text-slate-500'}`} />
                      <span className={`text-xs font-bold ${isSelected ? 'text-teal-950' : 'text-slate-900'}`}>
                        {item.label}
                      </span>
                    </div>
                    {isDocStale && (
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                        Stale
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 leading-tight">
                    {item.desc}
                  </p>
                </div>

                <div className="mt-2.5 pt-1.5 border-t border-slate-200/50 flex items-center justify-between text-[10px] text-slate-400">
                  <span>{isSelected ? 'Active Preview' : 'Click to preview'}</span>
                  {isSelected && <CheckCircle2 className="w-3 h-3 text-teal-600" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Freshness & Staleness Alert Banner (Hidden when printing) */}
      {activeDocMeta.isStale && (
        <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900 shadow-xs print:hidden">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <strong className="block text-amber-950 font-bold mb-0.5">
                Report Data Out-of-Date (Source Geometry Modified)
              </strong>
              <span>
                {activeDocMeta.staleReason ||
                  'The 2D floor-plan geometry was modified after this document calculation was created. Regenerate to ensure reports match active layout.'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onSaveProject && (
              <button
                onClick={handleResyncCostPlan}
                className="px-3.5 py-1.5 bg-amber-800 text-white font-semibold rounded-lg hover:bg-amber-900 shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                title="Directly recalculate bill of quantities using current geometry"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Sync & Recalculate QTO</span>
              </button>
            )}

            {onOpenCostPlanning && selectedDocType === 'cost-estimate' && (
              <button
                onClick={() => onOpenCostPlanning(project)}
                className="px-3 py-1.5 bg-white border border-amber-400 text-amber-900 font-semibold rounded-lg hover:bg-amber-100/60 shadow-2xs transition-colors cursor-pointer"
              >
                Open Cost Workspace
              </button>
            )}
          </div>
        </div>
      )}

      {/* 4. Live Architectural Document Preview (Optimized for Screen & Print) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 sm:p-12 space-y-8 print:border-none print:shadow-none print:p-0">
        {/* Document Master Header */}
        <div className="border-b-2 border-slate-900 pb-6 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <span className="font-black text-slate-900 text-base tracking-tight uppercase">
                PLOTIFY
              </span>
              <span className="text-teal-700 font-semibold tracking-wider text-[11px]">
                AI-Powered Architectural Intelligence
              </span>
            </div>
            <div className="flex items-center gap-3 font-mono text-[11px]">
              <span>Doc Ref: {activeDocMeta.id}</span>
              <span>•</span>
              <span>Date: {formatDate(activeDocMeta.generatedAt)}</span>
            </div>
          </div>

          <div className="pt-2">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
              {activeDocMeta.title}
            </h2>
            <p className="text-xs text-slate-600 mt-1 max-w-3xl leading-relaxed">
              {activeDocMeta.description}
            </p>
          </div>

          {/* Project Meta Chips */}
          <div className="flex flex-wrap items-center gap-2 pt-2 text-xs">
            <span className="px-2.5 py-1 bg-slate-100 rounded-md font-semibold text-slate-800">
              Project: {project.name}
            </span>
            <span className="px-2.5 py-1 bg-slate-100 rounded-md text-slate-700">
              Status: <strong className="text-slate-900">{project.status}</strong>
            </span>
            <span className="px-2.5 py-1 bg-slate-100 rounded-md text-slate-700">
              Floors: <strong className="text-slate-900">{project.floors}</strong>
            </span>
            <span className="px-2.5 py-1 bg-slate-100 rounded-md text-slate-700">
              Unit: <strong className="text-slate-900 capitalize">{project.unit}</strong>
            </span>
            <span className="px-2.5 py-1 bg-slate-100 rounded-md text-slate-700">
              Target Budget: <strong className="text-slate-900">{formatCurrency(project.budget, project.currency)}</strong>
            </span>
          </div>
        </div>

        {/* --------------------------------------------------------------- */}
        {/* VIEW 1: EXECUTIVE PROJECT SUMMARY DOSSIER                       */}
        {/* --------------------------------------------------------------- */}
        {(selectedDocType === 'project-summary' || selectedDocType === 'complete-dossier') && (
          <div className="space-y-8">
            {/* 1. Spatial & Zoning Schedule */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 border-b border-slate-200 pb-2 flex items-center justify-between">
                <span>1. Spatial & Zoning Metrics</span>
                <span className="text-[11px] font-normal text-slate-500 lowercase">
                  Net usable interior vs gross envelope
                </span>
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[11px] text-slate-500 block mb-0.5 font-medium">Plot Boundary Parcel</span>
                  <span className="text-base font-bold text-slate-900 tabular-nums">{roomData.plotAreaFormatted}</span>
                  <span className="text-[11px] text-slate-400 block mt-0.5">{roomData.plotDimensionsFormatted}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[11px] text-slate-500 block mb-0.5 font-medium">Net Usable Room Area</span>
                  <span className="text-base font-bold text-slate-900 tabular-nums">{roomData.totalMeasuredRoomAreaFormatted}</span>
                  <span className="text-[11px] text-slate-400 block mt-0.5">{roomData.totalRoomsCount} Enclosed Spaces</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[11px] text-slate-500 block mb-0.5 font-medium">Estimated Gross Built Area</span>
                  <span className="text-base font-bold text-slate-900 tabular-nums">{roomData.estimatedGrossBuiltAreaFormatted}</span>
                  <span className="text-[11px] text-slate-400 block mt-0.5">+12% Wall Structural Allowance</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[11px] text-slate-500 block mb-0.5 font-medium">Ground Coverage & FAR</span>
                  <span className="text-base font-bold text-slate-900 tabular-nums">{roomData.groundCoveragePercent}% / FAR {roomData.floorAreaRatio}</span>
                  <span className="text-[11px] text-slate-400 block mt-0.5">Footprint: {roomData.groundFloorFootprintFormatted}</span>
                </div>
              </div>
            </div>

            {/* Architectural Data Provenance & Classification Matrix (Phase 4 Requirement) */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 border-b border-slate-200 pb-2">
                Data Provenance & Classification Matrix
              </h3>
              <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200 text-[11px]">
                    <tr>
                      <th className="py-2 px-3">Classification Tier</th>
                      <th className="py-2 px-3">Recorded Project Elements</th>
                      <th className="py-2 px-3">Verification & Source Method</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="py-2.5 px-3 font-bold text-slate-900">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 text-[10px]">
                          User-Provided Facts
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">
                        Project Name ({project.name}), Plot Dimensions ({project.plotWidth}×{project.plotLength} {project.unit}), Floors ({project.floors}), Road Orientation ({project.roadFacing}), Target Budget ({formatCurrency(project.budget, project.currency)}).
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 text-[11px]">
                        Authoritative project creation parameters saved in local application database.
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-bold text-slate-900">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200 text-[10px]">
                          Deterministically Calculated
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">
                        Parcel Legal Area ({roomData.plotAreaFormatted}), Net Usable Space ({roomData.totalMeasuredRoomAreaFormatted}), Ground Footprint ({roomData.groundFloorFootprintFormatted}), Coverage ({roomData.groundCoveragePercent}%), FAR ({roomData.floorAreaRatio}), Elemental QTO Quantities.
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 text-[11px]">
                        Exact polygon arithmetic executed on 2D coordinates; reproducible without heuristics.
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-bold text-slate-900">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-purple-50 text-purple-800 border border-purple-200 text-[10px]">
                          Aesthetic Design Concept
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">
                        Active Proposal: {designData.activeAlternativeName} ({designData.facadeStyle} style, {designData.primaryMaterial} primary cladding, {designData.windowStyle} fenestration).
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 text-[11px]">
                        Design Studio palette and style curation; requires contractor material submittal approval.
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-bold text-slate-900">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[10px]">
                          Statutory Limitations & Exclusions
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">
                        Foundation soil bearing capacity, seismic shear wall engineering, MEP duct routing, emergency fire egress rating.
                      </td>
                      <td className="py-2.5 px-3 text-amber-900 font-semibold text-[11px]">
                        NOT ASSESSED — Explicitly requires physical licensed Professional Engineer (PE/SE) seal.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* 2. Concept Design Specification */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 border-b border-slate-200 pb-2">
                2. Architectural Concept Direction
              </h3>
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <span className="text-slate-500 block text-[11px]">Selected Proposal</span>
                    <strong className="text-slate-900">{designData.activeAlternativeName}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">Facade Style</span>
                    <strong className="text-slate-900">{designData.facadeStyle}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">Primary / Accent Materials</span>
                    <strong className="text-slate-900 capitalize">{designData.primaryMaterial} + {designData.accentMaterial}</strong>
                  </div>
                </div>
                <div className="pt-2 text-[11px] text-slate-500 border-t border-slate-200/60">
                  Fenestration: <strong className="text-slate-700">{designData.windowStyle}</strong> • Sun Shading: <strong className="text-slate-700">{designData.shadingStyle}</strong> • Entrance: <strong className="text-slate-700">{designData.entranceStyle}</strong>
                </div>
              </div>
            </div>

            {/* 3. Cost & Budget Summary */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 border-b border-slate-200 pb-2">
                3. Financial Benchmark Overview
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[11px] text-slate-500 block mb-0.5 font-medium">Estimated Construction Total</span>
                  <span className="text-base font-bold text-slate-900 tabular-nums">
                    {formatCurrency(costData.estimatedTotal, project.currency)}
                  </span>
                  <span className="text-[11px] text-slate-400 block mt-0.5">
                    Subtotal: {formatCurrency(costData.subtotal, project.currency)}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[11px] text-slate-500 block mb-0.5 font-medium">Contingency Reserve</span>
                  <span className="text-base font-bold text-slate-900 tabular-nums">
                    {formatCurrency(costData.contingencyAmount, project.currency)}
                  </span>
                  <span className="text-[11px] text-slate-400 block mt-0.5">{costData.contingencyRatePercent}% Allocation</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[11px] text-slate-500 block mb-0.5 font-medium">Budget Alignment</span>
                  <span className={`text-base font-bold tabular-nums ${costData.budgetStatus === 'within-budget' ? 'text-teal-700' : 'text-rose-700'}`}>
                    {costData.budgetStatus === 'within-budget' ? 'Within Budget' : 'Exceeds Budget'}
                  </span>
                  <span className="text-[11px] text-slate-400 block mt-0.5">
                    Variance: {formatCurrency(Math.abs(costData.budgetVariance), project.currency)}
                  </span>
                </div>
              </div>
            </div>

            {/* 4. Evidence Proofs Checklist */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 border-b border-slate-200 pb-2">
                4. Regulatory & Boundary Audit Status
              </h3>
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-4">
                  <div>
                    <span className="text-slate-500 block text-[11px]">Total Tracked Checks</span>
                    <strong className="text-slate-900 text-sm">{auditData.totalRecords}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">Passing Validations</span>
                    <strong className="text-emerald-700 text-sm">{auditData.passCount}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">Active Conflicts</span>
                    <strong className={`${auditData.conflictCount > 0 ? 'text-rose-700' : 'text-slate-700'} text-sm`}>
                      {auditData.conflictCount}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">Engineering Disclosures</span>
                    <strong className="text-slate-700 text-sm">{auditData.notAssessedCount}</strong>
                  </div>
                </div>

                {onOpenEvidenceLedger && (
                  <button
                    onClick={() => onOpenEvidenceLedger(project)}
                    className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 rounded-lg font-semibold text-slate-800 transition-colors print:hidden cursor-pointer"
                  >
                    Open Audit Ledger →
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* --------------------------------------------------------------- */}
        {/* VIEW 2: FLOOR-PLAN & ROOM SCHEDULES                             */}
        {/* --------------------------------------------------------------- */}
        {(selectedDocType === 'room-schedule' || selectedDocType === 'complete-dossier') && (
          <div className="space-y-8 pt-6 border-t border-slate-200 print-avoid-break">
            <div className="flex items-center justify-between border-b-2 border-slate-800 pb-2">
              <h3 className="text-base font-black uppercase tracking-tight text-slate-900">
                Floor-Plan Spatial & Room Schedules
              </h3>
              <span className="text-xs text-slate-500 font-mono">
                {roomData.totalRoomsCount} Rooms Placed
              </span>
            </div>

            {/* Spatial Measurement Explanatory Banner */}
            <div className="p-4 bg-teal-50/60 border border-teal-200 rounded-xl text-xs text-teal-950 space-y-1">
              <div className="flex items-center gap-2 font-bold">
                <BookOpen className="w-4 h-4 text-teal-700" />
                <span>Architectural Measurement Distinction Principle:</span>
              </div>
              <p className="leading-relaxed">
                <strong>Net Usable Room Area</strong> ({roomData.totalMeasuredRoomAreaFormatted}) measures clear internal floor space bounded by interior wall faces. 
                <strong>Estimated Gross Built Area</strong> ({roomData.estimatedGrossBuiltAreaFormatted}) incorporates an estimated 12% structural envelope and partition wall thickness factor. 
                <strong>Plot Parcel Area</strong> ({roomData.plotAreaFormatted}) designates legal surveyed boundaries.
              </p>
            </div>

            {/* Visual Floor-Plan Diagram */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Visual Floor-Plan Mini-Map Preview
                </h4>
                <div className="flex items-center gap-1 text-xs print:hidden">
                  {Array.from({ length: Math.max(project.floors, 1) }, (_, i) => i + 1).map((lvl) => (
                    <button
                      key={lvl}
                      onClick={() => setActiveFloorLevel(lvl)}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer transition-colors ${
                        activeFloorLevel === lvl
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      Floor {lvl}
                    </button>
                  ))}
                </div>
              </div>

              {renderFloorPlanDiagram(activeFloorLevel)}
            </div>

            {/* Geometry Warnings if any */}
            {roomData.unresolvedGeometryWarnings.length > 0 && (
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 space-y-1">
                <div className="flex items-center gap-2 font-bold">
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                  <span>Unresolved Geometry Warnings ({roomData.unresolvedGeometryWarnings.length})</span>
                </div>
                <ul className="list-disc pl-5 space-y-0.5">
                  {roomData.unresolvedGeometryWarnings.map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Floor-by-Floor Schedules */}
            {roomData.floorGroups.map((group) => (
              <div key={group.floorLevel} className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                    {group.floorLabel}
                  </h4>
                  <span className="text-xs font-semibold text-slate-600">
                    {group.roomCount} Rooms • Floor Total: <strong className="text-slate-900">{group.totalFloorAreaFormatted}</strong>
                  </span>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">Room ID</th>
                        <th className="py-2.5 px-3">Room Name</th>
                        <th className="py-2.5 px-3">Function Type</th>
                        <th className="py-2.5 px-3">Dimensions (W × L)</th>
                        <th className="py-2.5 px-3 text-right">Measured Usable Area</th>
                        <th className="py-2.5 px-3 text-center">Plot Enclosure</th>
                        <th className="py-2.5 px-3 text-center">Overlap Check</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {group.rooms.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-4 text-center text-slate-400 italic">
                            No rooms placed on this floor tier.
                          </td>
                        </tr>
                      ) : (
                        group.rooms.map((r) => (
                          <tr key={r.id} className="hover:bg-slate-50/70">
                            <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">{r.id}</td>
                            <td className="py-2.5 px-3 font-bold text-slate-900">{r.name}</td>
                            <td className="py-2.5 px-3 text-slate-600 capitalize">{r.type}</td>
                            <td className="py-2.5 px-3 font-mono text-slate-700">{r.dimensionsFormatted}</td>
                            <td className="py-2.5 px-3 text-right font-black text-slate-900 tabular-nums">
                              {r.areaFormatted}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {r.hasBoundaryViolation ? (
                                <span className="px-2 py-0.5 rounded-full font-bold text-[10px] bg-rose-100 text-rose-800">
                                  Violation
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full font-semibold text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-200">
                                  Enclosed
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {r.hasOverlap ? (
                                <span className="px-2 py-0.5 rounded-full font-bold text-[10px] bg-amber-100 text-amber-800">
                                  Overlap
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full font-semibold text-[10px] bg-slate-100 text-slate-700">
                                  Clear
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

            {/* Total Schedule Summary Footer */}
            <div className="p-4 bg-slate-900 text-white rounded-xl flex items-center justify-between text-xs font-semibold">
              <span>SCHEDULE TOTAL USABLE FLOOR AREA ({roomData.totalRoomsCount} Rooms):</span>
              <span className="text-base font-black text-teal-400 tabular-nums">
                {roomData.totalMeasuredRoomAreaFormatted}
              </span>
            </div>
          </div>
        )}

        {/* --------------------------------------------------------------- */}
        {/* VIEW 3: BILL OF QUANTITIES & PRELIMINARY ESTIMATE               */}
        {/* --------------------------------------------------------------- */}
        {(selectedDocType === 'cost-estimate' || selectedDocType === 'complete-dossier') && (
          <div className="space-y-8 pt-6 border-t border-slate-200 print-avoid-break">
            <div className="flex items-center justify-between border-b-2 border-slate-800 pb-2">
              <h3 className="text-base font-black uppercase tracking-tight text-slate-900">
                Itemized Bill of Quantities & Construction Schedule
              </h3>
              <span className="text-xs text-slate-500 font-mono">
                AACE Class 4/5 Planning Estimate
              </span>
            </div>

            {/* Cost Overview Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[11px] text-slate-500 block mb-0.5 font-medium">Net Direct Subtotal</span>
                <span className="text-base font-bold text-slate-900 tabular-nums">{formatCurrency(costData.subtotal, project.currency)}</span>
                <span className="text-[11px] text-slate-400 block mt-0.5">{costData.lineItems.length} Cost Elements</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[11px] text-slate-500 block mb-0.5 font-medium">Contingency Allowance</span>
                <span className="text-base font-bold text-slate-900 tabular-nums">{formatCurrency(costData.contingencyAmount, project.currency)}</span>
                <span className="text-[11px] text-slate-400 block mt-0.5">{costData.contingencyRatePercent}% Risk Buffer</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[11px] text-slate-500 block mb-0.5 font-medium">Target Budget</span>
                <span className="text-base font-bold text-slate-900 tabular-nums">{formatCurrency(costData.targetBudget, project.currency)}</span>
                <span className="text-[11px] text-slate-400 block mt-0.5">Declared Planning Cap</span>
              </div>
              <div className="p-3 bg-slate-900 text-white rounded-xl">
                <span className="text-[11px] text-teal-300 block mb-0.5 font-medium">Estimated Grand Total</span>
                <span className="text-base font-black text-white tabular-nums">{formatCurrency(costData.estimatedTotal, project.currency)}</span>
                <span className="text-[11px] text-slate-400 block mt-0.5">{costData.budgetStatus.replace('-', ' ').toUpperCase()}</span>
              </div>
            </div>

            {/* Bill of Quantities Table */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b border-slate-200 pb-2">
                Itemized Bill of Quantities (QTO)
              </h4>
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Code</th>
                      <th className="py-2.5 px-3">Category</th>
                      <th className="py-2.5 px-3">Description</th>
                      <th className="py-2.5 px-3 text-right">Quantity</th>
                      <th className="py-2.5 px-3 text-center">Unit</th>
                      <th className="py-2.5 px-3 text-right">Unit Rate</th>
                      <th className="py-2.5 px-3 text-right">Extended Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {costData.lineItems.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/70">
                        <td className="py-2 px-3 font-mono text-[11px] text-slate-500">{item.code}</td>
                        <td className="py-2 px-3 font-semibold text-slate-700 capitalize">{item.category}</td>
                        <td className="py-2 px-3 text-slate-800">
                          <div className="font-semibold">{item.name}</div>
                          <div className="text-[10px] text-slate-400 line-clamp-1">{item.assumptions}</div>
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-semibold text-slate-900">{item.quantity}</td>
                        <td className="py-2 px-3 text-center font-mono text-slate-500">{item.unit}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-slate-700">{formatCurrency(item.unitRate, project.currency)}</td>
                        <td className="py-2 px-3 text-right font-bold text-slate-900 tabular-nums">{formatCurrency(item.extendedCost, project.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Construction Timeline & Predecessor Phases */}
            {costData.phases.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b border-slate-200 pb-2">
                  Preliminary Construction Phases & CPM Predecessors
                </h4>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="py-2 px-3">Phase #</th>
                        <th className="py-2 px-3">Phase Name</th>
                        <th className="py-2 px-3">Start Date</th>
                        <th className="py-2 px-3 text-right">Duration</th>
                        <th className="py-2 px-3">Predecessors</th>
                        <th className="py-2 px-3 text-right">Allocated Budget</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {costData.phases.map((p) => (
                        <tr key={p.id}>
                          <td className="py-2 px-3 font-mono font-bold text-slate-500">P-{p.phaseNumber}</td>
                          <td className="py-2 px-3 font-semibold text-slate-900">{p.name}</td>
                          <td className="py-2 px-3 font-mono text-slate-600">{p.startDate}</td>
                          <td className="py-2 px-3 text-right font-mono text-slate-700">{p.durationDays} days</td>
                          <td className="py-2 px-3 font-mono text-xs text-slate-500">
                            {p.dependencies.length > 0 ? p.dependencies.join(', ') : 'None (Initial)'}
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-slate-900 tabular-nums">
                            {formatCurrency(p.allocatedBudget, project.currency)}
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

        {/* --------------------------------------------------------------- */}
        {/* VIEW 4: FACADE & INTERIOR FINISHES SPECIFICATION                */}
        {/* --------------------------------------------------------------- */}
        {(selectedDocType === 'design-specification' || selectedDocType === 'complete-dossier') && (
          <div className="space-y-8 pt-6 border-t border-slate-200 print-avoid-break">
            <div className="flex items-center justify-between border-b-2 border-slate-800 pb-2">
              <h3 className="text-base font-black uppercase tracking-tight text-slate-900">
                Exterior Facade & Interior Finishes Schedule
              </h3>
              <span className="text-xs text-slate-500 font-mono">
                Active Concept: {designData.activeAlternativeName}
              </span>
            </div>

            {/* Facade Material Specs */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b border-slate-200 pb-2">
                1. Building Envelope & Facade Schedule
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-[11px] text-slate-500 font-medium">Primary Cladding</span>
                  <strong className="text-slate-900 block capitalize">{designData.primaryMaterial}</strong>
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                    <span className="w-3 h-3 rounded-full border border-slate-300" style={{ backgroundColor: designData.primaryColor }} />
                    <span className="font-mono">{designData.primaryColor}</span>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-[11px] text-slate-500 font-medium">Accent Cladding</span>
                  <strong className="text-slate-900 block capitalize">{designData.accentMaterial}</strong>
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                    <span className="w-3 h-3 rounded-full border border-slate-300" style={{ backgroundColor: designData.accentColor }} />
                    <span className="font-mono">{designData.accentColor}</span>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-[11px] text-slate-500 font-medium">Fenestration / Glazing</span>
                  <strong className="text-slate-900 block">{designData.windowStyle}</strong>
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                    <span className="w-3 h-3 rounded-full border border-slate-300" style={{ backgroundColor: designData.windowTrimColor }} />
                    <span className="font-mono">{designData.windowTrimColor}</span>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-[11px] text-slate-500 font-medium">Entrance Architecture</span>
                  <strong className="text-slate-900 block">{designData.entranceStyle}</strong>
                  <span className="text-[11px] text-slate-400 block">Shading: {designData.shadingStyle}</span>
                </div>
              </div>
            </div>

            {/* Interior Room Finishes Schedule */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b border-slate-200 pb-2">
                2. Room-by-Room Interior Finishes Schedule
              </h4>
              {designData.interiorRoomSchedules.length === 0 ? (
                <div className="p-6 text-center text-slate-400 text-xs italic bg-slate-50 rounded-xl border border-slate-200">
                  No individual interior room concepts assigned yet. Open Design Studio to customize interior finishes.
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">Room Space</th>
                        <th className="py-2.5 px-3">Interior Style</th>
                        <th className="py-2.5 px-3">Wall Finish</th>
                        <th className="py-2.5 px-3">Flooring Finish</th>
                        <th className="py-2.5 px-3">Ceiling Finish</th>
                        <th className="py-2.5 px-3">Lighting Mood</th>
                        <th className="py-2.5 px-3">Design Priority</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {designData.interiorRoomSchedules.map((room) => (
                        <tr key={room.roomId} className="hover:bg-slate-50/70">
                          <td className="py-2.5 px-3 font-bold text-slate-900">{room.roomName}</td>
                          <td className="py-2.5 px-3 font-semibold text-teal-800">{room.style}</td>
                          <td className="py-2.5 px-3 capitalize text-slate-700">{room.wallFinish.replace(/-/g, ' ')}</td>
                          <td className="py-2.5 px-3 capitalize text-slate-700">{room.floorFinish.replace(/-/g, ' ')}</td>
                          <td className="py-2.5 px-3 capitalize text-slate-700">{room.ceilingFinish.replace(/-/g, ' ')}</td>
                          <td className="py-2.5 px-3 capitalize text-slate-600">{room.lightingMood.replace(/-/g, ' ')}</td>
                          <td className="py-2.5 px-3 capitalize font-medium text-slate-700">{room.designPriority.replace(/-/g, ' ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* --------------------------------------------------------------- */}
        {/* VIEW 5: PROOF-CARRYING DESIGN & REGULATORY AUDIT LEDGER         */}
        {/* --------------------------------------------------------------- */}
        {(selectedDocType === 'evidence-audit' || selectedDocType === 'complete-dossier') && (
          <div className="space-y-6 pt-6 border-t border-slate-200 print-avoid-break">
            <div className="flex items-center justify-between border-b-2 border-slate-800 pb-2">
              <h3 className="text-base font-black uppercase tracking-tight text-slate-900">
                Proof-Carrying Design & Regulatory Audit Ledger
              </h3>
              <span className="text-xs text-slate-500 font-mono">
                {auditData.passCount}/{auditData.totalRecords} Passed Rules
              </span>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Rule ID</th>
                    <th className="py-2.5 px-3">Module</th>
                    <th className="py-2.5 px-3">Evaluated Item</th>
                    <th className="py-2.5 px-3 text-right">Value</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    <th className="py-2.5 px-3">Calculation Method / Formula</th>
                    <th className="py-2.5 px-3">Mandatory Review Requirement</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditData.records.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/70">
                      <td className="py-2 px-3 font-mono text-[10px] text-slate-500">{r.id}</td>
                      <td className="py-2 px-3 text-slate-600 capitalize">{r.module.replace('-', ' ')}</td>
                      <td className="py-2 px-3 font-bold text-slate-900">{r.resultName}</td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-slate-900 tabular-nums">
                        {typeof r.resultValue === 'number' ? r.resultValue.toLocaleString() : String(r.resultValue)} {r.unit && r.unit !== 'status' ? r.unit : ''}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                            r.validationStatus === 'pass'
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : r.validationStatus === 'conflict'
                              ? 'bg-rose-100 text-rose-800'
                              : r.validationStatus === 'stale'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {r.validationStatus.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-2 px-3 font-mono text-[10px] text-slate-600 line-clamp-1">
                        {r.calculationMethod}
                      </td>
                      <td className="py-2 px-3 text-[11px] text-amber-900 font-medium">
                        {r.requiredProfessionalReview}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* --------------------------------------------------------------- */}
        {/* DOCUMENT FOOTER: STATUTORY DISCLAIMERS & SIGN-OFF BLOCKS       */}
        {/* --------------------------------------------------------------- */}
        <div className="pt-8 border-t-2 border-slate-900 space-y-6 text-xs text-slate-600 print-avoid-break">
          {/* Statutory Architectural Notice */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5 leading-relaxed">
            <div className="flex items-center gap-2 font-bold text-slate-900 text-xs">
              <Lock className="w-4 h-4 text-teal-700 shrink-0" />
              <span>Statutory Professional Review & Permitting Notice:</span>
            </div>
            <p className="text-[11px] text-slate-500">
              This document is an architectural planning output produced by Plotify AI-Powered Architectural Intelligence. 
              Calculated figures reflect entered spatial dimensions and standard unit rate benchmarks. This document <strong>does not</strong> constitute 
              an autonomous building permit approval, a stamped architectural construction drawing set, or a licensed structural engineering (PE/SE) certification. 
              All foundation designs, load bearing walls, seismic shear calculations, soil bearing capacities, and fire egress routes must be formally verified, 
              stamped, and sealed by licensed design professionals in the governing jurisdiction prior to site excavation or physical construction.
            </p>
          </div>

          {/* Professional Sign-Off Blocks */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-4 text-center">
            <div className="border-t border-slate-400 pt-2">
              <span className="font-bold text-slate-900 block">Project Architect / Designer</span>
              <span className="text-[11px] text-slate-400">License # / Date</span>
            </div>
            <div className="border-t border-slate-400 pt-2">
              <span className="font-bold text-slate-900 block">Structural Engineer (PE / SE)</span>
              <span className="text-[11px] text-slate-400">Stamp & Seal / Date</span>
            </div>
            <div className="border-t border-slate-400 pt-2">
              <span className="font-bold text-slate-900 block">Client / Property Owner</span>
              <span className="text-[11px] text-slate-400">Formal Approval / Date</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
