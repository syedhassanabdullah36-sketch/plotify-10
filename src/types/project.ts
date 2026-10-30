export type ProjectType = 'house' | 'apartment' | 'other';

export type MeasurementUnit = 'feet' | 'metres';

export type RoadFacingSide =
  | 'North'
  | 'South'
  | 'East'
  | 'West'
  | 'North-East'
  | 'North-West'
  | 'South-East'
  | 'South-West'
  | 'Corner / Multiple Roads';

export type ProjectStatus =
  | 'Drafting'
  | 'Concept Feasibility'
  | 'Schematic Design'
  | 'Client Review'
  | 'Permit Review'
  | 'Approved';

export type Currency = 'USD' | 'EUR' | 'GBP' | 'CAD' | 'AUD' | 'INR' | 'AED' | 'CHF';

export interface RoomConfig {
  bedrooms: number;
  bathrooms: number;
  kitchen: number;
  livingRoom: number;
  diningRoom?: number;
  homeOffice?: number;
  balcony?: number;
  garage?: number;
  laundry?: number;
  storage?: number;
  customRooms?: Array<{ name: string; count: number }>;
}

export interface FloorPlanRoom {
  id: string;
  name: string;
  type: string; // 'bedroom' | 'bathroom' | 'kitchen' | 'living' | 'dining' | 'office' | 'balcony' | 'garage' | 'custom'
  x: number; // in plot units from top-left (0,0)
  y: number; // in plot units
  width: number; // in plot units
  length: number; // in plot units (height on 2D plan)
  color?: string;
  floorLevel: number; // 1, 2, 3...
}

export interface FloorPlanData {
  rooms: FloorPlanRoom[];
  gridSnap?: number; // e.g. 0.5 or 1 unit
  showGrid?: boolean;
}

export interface FacadeConcept {
  style: 'Modern' | 'Contemporary' | 'Minimalist' | 'Traditional' | 'Industrial' | 'Mediterranean';
  primaryMaterial: 'plaster' | 'brick' | 'stone' | 'concrete' | 'timber' | 'glass';
  accentMaterial: 'plaster' | 'brick' | 'stone' | 'concrete' | 'timber' | 'glass';
  paletteName: string;
  primaryColor: string; // hex
  accentColor: string; // hex
  windowTrimColor: string; // hex
  roofTrimColor: string; // hex
  windowStyle: 'floor-to-ceiling' | 'ribbon-horizontal' | 'divided-pane' | 'frameless-minimal' | 'recessed-shading';
  entranceStyle: 'minimal-pivot' | 'canopy-cantilever' | 'recessed-portal' | 'timber-porch' | 'glass-atrium';
  shadingStyle: 'deep-overhangs' | 'motorized-louvers' | 'timber-pergola' | 'brise-soleil' | 'none';
  elevationView: 'perspective' | 'front-elevation' | 'corner-hero' | 'dusk-illumination';
  costTier: 'Economic' | 'Balanced Mid-Range' | 'High-End Architectural' | 'Ultra Luxury';
  notes: string;
}

export interface InteriorRoomConcept {
  roomId: string;
  roomName: string;
  style: 'Scandinavian' | 'Minimalist' | 'Modern Luxury' | 'Japandi' | 'Industrial Chic' | 'Warm Contemporary';
  paletteName: string;
  wallColor: string; // hex
  wallFinish: 'matte-plaster' | 'limewash-mineral' | 'timber-slats' | 'exposed-brick' | 'acoustic-felt';
  floorFinish: 'light-oak-plank' | 'smoked-walnut' | 'polished-concrete' | 'honed-travertine' | 'terrazzo-aggregate';
  ceilingFinish: 'smooth-white' | 'exposed-joists' | 'recessed-cove' | 'timber-coffered';
  furnitureStyle: 'minimalist-low' | 'scandinavian-clean' | 'mid-century-curved' | 'modular-italian' | 'built-in-bespoke';
  lightingMood: 'warm-ambient-2700k' | 'gallery-directional-3000k' | 'recessed-linear-cove' | 'natural-zenithal';
  storageStyle: 'floor-to-ceiling-concealed' | 'open-slotted-shelving' | 'floating-credenza' | 'minimal-recessed';
  designPriority: 'functionality' | 'simplicity' | 'acoustic-warmth' | 'durability-family' | 'biophilic-light';
  notes: string;
}

export interface DesignAlternative {
  id: string;
  name: string; // e.g. "Option A — Nordic Minimal Timber & Glass"
  description?: string;
  createdAt: string;
  facade: FacadeConcept;
  interiors: Record<string, InteriorRoomConcept>; // keyed by roomId
}

import { DesignScenario } from './scenario';
import { CostPlanningState } from './costPlanning';
import { SiteContextData } from './siteContext';
import { ArchitecturalBriefData } from './brief';
import { RegulatoryState } from './regulations';
import { StructuralCoordinationData } from './structural';
import { MEPCoordinationData } from './mep';
import { ProfessionalReviewRegister } from './review';
import { ProjectIFCInteropMetadata } from './ifc';
import { ProjectCADInteropMetadata } from './cad';
import { ProjectTerrainModelingMetadata } from './terrain';
import { ProjectCarbonAssessmentMetadata } from './carbon';
import { ProjectClimateResilienceMetadata } from './climateResilience';
import { ProjectEnvelopePerformanceMetadata } from './envelope';
import { ProjectSiteLogisticsMetadata } from './siteLogistics';
import { ProjectARSiteVisualizationMetadata } from './arSiteVisualization';
import { ProjectVRDesignReviewMetadata } from './vrDesignReview';
import { ProjectLiveCollaborationMetadata } from './liveCollaboration';

export interface Project {
  id: string;
  name: string;
  projectType: ProjectType;
  customProjectType?: string;
  plotWidth: number;
  plotLength: number;
  unit: MeasurementUnit;
  roadFacing: RoadFacingSide;
  floors: number;
  rooms: RoomConfig;
  budget: number;
  currency: Currency;
  notes: string;
  status: ProjectStatus;
  floorPlan?: FloorPlanData;
  designAlternatives?: DesignAlternative[];
  activeAlternativeId?: string;
  applyDesignTo3D?: boolean;
  scenarios?: DesignScenario[];
  activeScenarioId?: string;
  costPlanning?: CostPlanningState;
  siteContext?: SiteContextData;
  brief?: ArchitecturalBriefData;
  regulations?: RegulatoryState;
  structuralCoordination?: StructuralCoordinationData;
  mepCoordination?: MEPCoordinationData;
  expertReviews?: ProfessionalReviewRegister;
  ifcInterop?: ProjectIFCInteropMetadata;
  cadInterop?: ProjectCADInteropMetadata;
  terrainModeling?: ProjectTerrainModelingMetadata;
  carbonAssessment?: ProjectCarbonAssessmentMetadata;
  climateResilience?: ProjectClimateResilienceMetadata;
  envelopePerformance?: ProjectEnvelopePerformanceMetadata;
  siteLogistics?: ProjectSiteLogisticsMetadata;
  arSiteVisualization?: ProjectARSiteVisualizationMetadata;
  vrDesignReview?: ProjectVRDesignReviewMetadata;
  liveCollaboration?: ProjectLiveCollaborationMetadata;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectFormData {
  name: string;
  projectType: ProjectType;
  customProjectType?: string;
  plotWidth: string; // string in form for easy numeric typing
  plotLength: string;
  unit: MeasurementUnit;
  roadFacing: RoadFacingSide;
  floors: number;
  rooms: RoomConfig;
  budget: string;
  currency: Currency;
  notes: string;
  status: ProjectStatus;
}

export interface AppSettings {
  defaultUnit: MeasurementUnit;
  defaultCurrency: Currency;
  role: 'architect' | 'homeowner';
}
