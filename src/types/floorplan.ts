import { MeasurementUnit } from './project';

export type RoomType =
  | 'bedroom'
  | 'bathroom'
  | 'kitchen'
  | 'living'
  | 'dining'
  | 'office'
  | 'hallway'
  | 'balcony'
  | 'utility'
  | 'custom';

export interface PlanRoom {
  id: string;
  name: string;
  type: RoomType;
  x: number; // in plot units (feet or metres)
  y: number; // in plot units
  width: number; // in plot units
  length: number; // in plot units
  color?: string;
}

export interface PlanWall {
  id: string;
  name: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness: number; // in plot units (e.g. 0.5 ft or 0.15 m)
}

export type OpeningType = 'door' | 'window';

export interface PlanOpening {
  id: string;
  type: OpeningType;
  name: string;
  x: number;
  y: number;
  width: number; // e.g. 3 ft door, 4 ft window
  rotation: 0 | 90 | 180 | 270;
  swingDirection?: 'left' | 'right';
}

export interface FloorPlanData {
  version: number;
  floorNumber: number;
  rooms: PlanRoom[];
  walls: PlanWall[];
  openings: PlanOpening[];
  notes?: string;
  updatedAt: string;
}

export interface FloorPlanValidation {
  isValid: boolean;
  hasWarnings: boolean;
  boundaryViolations: Array<{
    roomId: string;
    roomName: string;
    issue: string;
  }>;
  overlapViolations: Array<{
    roomAId: string;
    roomAName: string;
    roomBId: string;
    roomBName: string;
  }>;
  dimensionViolations: Array<{
    roomId: string;
    roomName: string;
    issue: string;
  }>;
  totalRoomArea: number;
  plotArea: number;
  coveragePercent: number;
}
