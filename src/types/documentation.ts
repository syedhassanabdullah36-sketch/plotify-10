import { Project, MeasurementUnit, Currency } from './project';
import { EvidenceAuditSummary } from './evidence';
import { CostSummaryMetrics, CostLineItem, ConstructionPhase } from './costPlanning';

export type DocumentType =
  | 'project-summary'
  | 'room-schedule'
  | 'cost-estimate'
  | 'design-specification'
  | 'evidence-audit'
  | 'complete-dossier';

export type ExportFormat = 'print' | 'pdf' | 'csv' | 'markdown' | 'json';

export interface DocumentMeta {
  id: string;
  type: DocumentType;
  title: string;
  description: string;
  generatedAt: string;
  sourceGeometryHash: string;
  projectVersion: string;
  isStale: boolean;
  staleReason?: string;
  supportedFormats: ExportFormat[];
}

export interface RoomScheduleEntry {
  id: string;
  name: string;
  type: string;
  floorLevel: number;
  width: number;
  length: number;
  area: number;
  unit: string;
  dimensionsFormatted: string;
  areaFormatted: string;
  hasBoundaryViolation: boolean;
  hasOverlap: boolean;
  notes?: string;
}

export interface FloorScheduleGroup {
  floorLevel: number;
  floorLabel: string;
  roomCount: number;
  totalFloorArea: number;
  totalFloorAreaFormatted: string;
  rooms: RoomScheduleEntry[];
}

export interface RoomScheduleDocumentData {
  projectId: string;
  projectName: string;
  unit: MeasurementUnit;
  unitLabel: string;
  unitAreaLabel: string;
  plotDimensionsFormatted: string;
  plotArea: number;
  plotAreaFormatted: string;
  totalMeasuredRoomArea: number; // sum of usable room interiors
  totalMeasuredRoomAreaFormatted: string;
  estimatedGrossBuiltArea: number; // including wall allowances
  estimatedGrossBuiltAreaFormatted: string;
  groundFloorFootprint: number;
  groundFloorFootprintFormatted: string;
  groundCoveragePercent: number;
  floorAreaRatio: number;
  floorGroups: FloorScheduleGroup[];
  totalRoomsCount: number;
  unresolvedGeometryWarnings: string[];
}

export interface CostReportDocumentData {
  projectId: string;
  projectName: string;
  scenarioName: string;
  currency: Currency;
  targetBudget: number;
  estimatedTotal: number;
  subtotal: number;
  contingencyRatePercent: number;
  contingencyAmount: number;
  taxRatePercent: number;
  taxAmount: number;
  budgetVariance: number;
  budgetVariancePercent: number;
  budgetStatus: 'within-budget' | 'over-budget' | 'incomplete';
  lineItems: CostLineItem[];
  phases: ConstructionPhase[];
  isStale: boolean;
  staleReason?: string;
  rateDate?: string;
  location: string;
}

export interface DesignSpecDocumentData {
  projectId: string;
  projectName: string;
  activeAlternativeId?: string;
  activeAlternativeName: string;
  facadeStyle: string;
  primaryMaterial: string;
  accentMaterial: string;
  primaryColor: string;
  accentColor: string;
  windowTrimColor: string;
  roofTrimColor: string;
  windowStyle: string;
  entranceStyle: string;
  shadingStyle: string;
  elevationView: string;
  interiorRoomSchedules: Array<{
    roomId: string;
    roomName: string;
    style: string;
    wallColor: string;
    wallFinish: string;
    floorFinish: string;
    ceilingFinish: string;
    lightingMood: string;
    designPriority: string;
    notes?: string;
  }>;
  alternativeCount: number;
}
