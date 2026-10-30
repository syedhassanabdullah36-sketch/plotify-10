import { RoadFacingSide, MeasurementUnit } from './project';

export type SiteLocationConfidence =
  | 'user-observation'
  | 'survey-stamped'
  | 'municipal-cadastral'
  | 'unverified';

export type TopographySlope =
  | 'flat-under-2-pct'
  | 'gentle-2-to-5-pct'
  | 'moderate-5-to-10-pct'
  | 'steep-over-10-pct';

export interface SiteAccessPoint {
  id: string;
  type: 'vehicular' | 'pedestrian' | 'service';
  side: RoadFacingSide;
  offsetAlongSide: number; // distance in units from corner (top-left along side)
  width: number;
  name: string;
}

export type ObstacleType =
  | 'tree'
  | 'utility-pole'
  | 'easement'
  | 'rock-outcrop'
  | 'inspection-chamber'
  | 'other';

export type PreservationStatus =
  | 'preserve-mandatory'
  | 'preserve-preferred'
  | 'removable'
  | 'unknown';

export interface SiteObstacle {
  id: string;
  name: string;
  type: ObstacleType;
  x: number; // coordinate from plot top-left (0,0) in project units
  y: number;
  width: number;
  length: number;
  preservationStatus: PreservationStatus;
  notes?: string;
}

export interface NeighborContext {
  side: 'North' | 'South' | 'East' | 'West';
  description: string;
  heightTiers:
    | 'vacant-ground'
    | 'single-storey'
    | 'two-storey'
    | 'three-plus-storey'
    | 'commercial-industrial';
  privacyConcern: boolean;
  noiseExposure: boolean;
}

export interface SiteSetbacks {
  front: number; // in project.unit (along road-facing side)
  rear: number;
  sideLeft: number;
  sideRight: number;
  source: 'user-specified' | 'standard-guideline' | 'unverified-default';
  notes?: string;
}

export interface EnvironmentalFactors {
  prevailingWindDirection?: RoadFacingSide | 'Variable';
  primaryNoiseSource?: string;
  primaryNoiseSide?: RoadFacingSide;
  dustOrExposureNotes?: string;
  vegetationShadeNotes?: string;
}

export interface SitePhotoAttachment {
  id: string;
  title: string;
  caption: string;
  dataUrl?: string; // base64 thumbnail or SVG data
  observationDate: string;
  facingDirection?: RoadFacingSide;
}

export interface SiteContextData {
  siteName?: string;
  address?: string;
  cityRegion?: string;
  latitude?: number;
  longitude?: number;
  locationConfidence: SiteLocationConfidence;
  northOrientationOffsetDeg: number; // 0 = True North aligned with top of plot, 90 = East, etc.
  slope: TopographySlope;
  slopeDirection: RoadFacingSide | 'None';
  levelDifferenceEstimate?: number; // e.g. 1.5 ft or 0.5 m
  accessPoints: SiteAccessPoint[];
  obstacles: SiteObstacle[];
  neighbors: NeighborContext[];
  setbacks: SiteSetbacks;
  environmental: EnvironmentalFactors;
  photos: SitePhotoAttachment[];
  generalNotes?: string;
  updatedAt: string;
}

export interface BuildingPlacementBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  length: number;
  groundArea: number;
  hasRooms: boolean;
}

export interface SiteConstraintCheck {
  id: string;
  category: 'boundary' | 'setback' | 'obstacle' | 'access' | 'topography' | 'environmental';
  title: string;
  status: 'pass' | 'warning' | 'conflict' | 'not-assessed';
  details: string;
  formulaOrRule: string;
  inputsUsed: Record<string, unknown>;
  recommendation?: string;
  requiresProfessionalReview: string;
}

export interface SolarOrientationAnalysis {
  northOrientationOffsetDeg: number;
  solarOrientationDescription: string;
  facadeSunExposure: {
    northFacade: 'shaded-ambient' | 'diffuse-daylight' | 'moderate';
    southFacade: 'direct-high-solar-gain' | 'moderate' | 'limited';
    eastFacade: 'morning-sun-light' | 'moderate' | 'shaded';
    westFacade: 'afternoon-heat-glare-risk' | 'moderate' | 'shaded';
  };
  passiveSolarRecommendations: string[];
  crossVentilationFeasibility: 'high' | 'moderate' | 'limited' | 'unassessed';
  acousticBufferRecommendations: string[];
}
