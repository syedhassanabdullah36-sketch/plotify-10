import { FloorPlanRoom, MeasurementUnit, Project } from '../../types/project';

export interface BoundaryViolation {
  roomId: string;
  roomName: string;
  overflowTop: number;
  overflowBottom: number;
  overflowLeft: number;
  overflowRight: number;
}

export interface OverlapCollision {
  room1Id: string;
  room1Name: string;
  room2Id: string;
  room2Name: string;
  overlapArea: number;
}

export interface FloorMetrics {
  totalBuiltArea: number;
  plotArea: number;
  coverageRatio: number; // percentage, e.g. 45.2%
  openArea: number;
  unit: MeasurementUnit;
  unitLabel: string;
  areaLabel: string;
}

/**
 * Snap a value to the nearest step (e.g. 0.5 or 1.0)
 */
export function snapValue(value: number, step: number = 0.5): number {
  if (step <= 0) return value;
  const inv = 1 / step;
  return Math.round(value * inv) / inv;
}

/**
 * Check if a room violates the plot boundary [0, plotWidth] x [0, plotLength]
 */
export function checkBoundaryViolations(
  room: FloorPlanRoom,
  plotWidth: number,
  plotLength: number
): BoundaryViolation | null {
  const overflowLeft = Math.max(0, -room.x);
  const overflowTop = Math.max(0, -room.y);
  const overflowRight = Math.max(0, room.x + room.width - plotWidth);
  const overflowBottom = Math.max(0, room.y + room.length - plotLength);

  if (overflowLeft > 0.01 || overflowTop > 0.01 || overflowRight > 0.01 || overflowBottom > 0.01) {
    return {
      roomId: room.id,
      roomName: room.name,
      overflowLeft: Number(overflowLeft.toFixed(1)),
      overflowTop: Number(overflowTop.toFixed(1)),
      overflowRight: Number(overflowRight.toFixed(1)),
      overflowBottom: Number(overflowBottom.toFixed(1)),
    };
  }
  return null;
}

/**
 * Detect all pairwise room overlaps on the same floor level
 */
export function checkRoomOverlaps(rooms: FloorPlanRoom[]): OverlapCollision[] {
  const collisions: OverlapCollision[] = [];

  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i];
      const b = rooms[j];

      if (a.floorLevel !== b.floorLevel) continue;

      // Axis-Aligned Bounding Box (AABB) intersection check with tolerance
      const xOverlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
      const yOverlap = Math.max(0, Math.min(a.y + a.length, b.y + b.length) - Math.max(a.y, b.y));

      if (xOverlap > 0.05 && yOverlap > 0.05) {
        collisions.push({
          room1Id: a.id,
          room1Name: a.name,
          room2Id: b.id,
          room2Name: b.name,
          overlapArea: Number((xOverlap * yOverlap).toFixed(1)),
        });
      }
    }
  }

  return collisions;
}

/**
 * Calculate total built area, coverage ratio, and remaining open plot area
 */
export function calculateFloorMetrics(
  rooms: FloorPlanRoom[],
  plotWidth: number,
  plotLength: number,
  unit: MeasurementUnit,
  currentFloor: number
): FloorMetrics {
  const floorRooms = rooms.filter((r) => r.floorLevel === currentFloor);
  const totalBuiltArea = floorRooms.reduce((sum, r) => sum + r.width * r.length, 0);
  const plotArea = plotWidth * plotLength;
  const coverageRatio = plotArea > 0 ? (totalBuiltArea / plotArea) * 100 : 0;
  const openArea = Math.max(0, plotArea - totalBuiltArea);
  const unitLabel = unit === 'feet' ? 'sq ft' : 'm²';

  return {
    totalBuiltArea: Number(totalBuiltArea.toFixed(1)),
    plotArea: Number(plotArea.toFixed(1)),
    coverageRatio: Number(coverageRatio.toFixed(1)),
    openArea: Number(openArea.toFixed(1)),
    unit,
    unitLabel,
    areaLabel: `${totalBuiltArea.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${unitLabel}`,
  };
}

/**
 * Palette colors for room types
 */
export const ROOM_TYPE_CONFIG: {
  [key: string]: { label: string; defaultColor: string; defaultW: number; defaultL: number };
} = {
  living: { label: 'Living Room', defaultColor: '#f1f5f9', defaultW: 16, defaultL: 20 },
  bedroom: { label: 'Bedroom', defaultColor: '#e0f2fe', defaultW: 12, defaultL: 14 },
  kitchen: { label: 'Kitchen', defaultColor: '#fef3c7', defaultW: 10, defaultL: 12 },
  bathroom: { label: 'Bathroom', defaultColor: '#ccfbf1', defaultW: 8, defaultL: 10 },
  dining: { label: 'Dining Room', defaultColor: '#f3e8ff', defaultW: 12, defaultL: 14 },
  office: { label: 'Home Office', defaultColor: '#e0e7ff', defaultW: 10, defaultL: 12 },
  balcony: { label: 'Balcony / Terrace', defaultColor: '#ecfdf5', defaultW: 6, defaultL: 12 },
  garage: { label: 'Garage', defaultColor: '#e2e8f0', defaultW: 12, defaultL: 20 },
  laundry: { label: 'Laundry', defaultColor: '#f1f5f9', defaultW: 6, defaultL: 8 },
  storage: { label: 'Storage', defaultColor: '#f8fafc', defaultW: 6, defaultL: 6 },
  custom: { label: 'Custom Space', defaultColor: '#fae8ff', defaultW: 10, defaultL: 10 },
};

/**
 * Generate a smart default non-overlapping floor plan from project configuration
 */
export function generateDefaultLayout(project: Project): FloorPlanRoom[] {
  const rooms: FloorPlanRoom[] = [];
  const unitFactor = project.unit === 'metres' ? 0.3048 : 1.0; // scale standard foot dims if metres
  const pw = project.plotWidth;
  const pl = project.plotLength;

  let curX = snapValue(Math.max(2 * unitFactor, pw * 0.08));
  let curY = snapValue(Math.max(2 * unitFactor, pl * 0.08));
  let maxHeightInRow = 0;
  let counter = 1;

  const addRoom = (type: string, name: string, floorLevel: number = 1) => {
    const config = ROOM_TYPE_CONFIG[type] || ROOM_TYPE_CONFIG.custom;
    const w = snapValue(Math.min(config.defaultW * unitFactor, pw * 0.45));
    const l = snapValue(Math.min(config.defaultL * unitFactor, pl * 0.45));

    // If room would overflow right boundary, wrap to next row
    if (curX + w > pw - 2 * unitFactor && curX > 5 * unitFactor) {
      curX = snapValue(Math.max(2 * unitFactor, pw * 0.08));
      curY = snapValue(curY + maxHeightInRow + 1 * unitFactor);
      maxHeightInRow = 0;
    }

    // Clamp inside boundary if possible
    const safeX = Math.min(curX, Math.max(0, pw - w));
    const safeY = Math.min(curY, Math.max(0, pl - l));

    rooms.push({
      id: `room-${Date.now()}-${counter++}-${Math.random().toString(36).substr(2, 4)}`,
      name,
      type,
      x: Number(safeX.toFixed(1)),
      y: Number(safeY.toFixed(1)),
      width: Number(w.toFixed(1)),
      length: Number(l.toFixed(1)),
      color: config.defaultColor,
      floorLevel,
    });

    curX = snapValue(curX + w + 1 * unitFactor);
    if (l > maxHeightInRow) maxHeightInRow = l;
  };

  // Add living & kitchen on Ground Floor (Floor 1)
  if (project.rooms.livingRoom > 0) {
    for (let i = 1; i <= project.rooms.livingRoom; i++) {
      addRoom('living', project.rooms.livingRoom === 1 ? 'Living Room' : `Living Room ${i}`, 1);
    }
  }

  if (project.rooms.kitchen > 0) {
    for (let i = 1; i <= project.rooms.kitchen; i++) {
      addRoom('kitchen', project.rooms.kitchen === 1 ? 'Kitchen' : `Kitchen ${i}`, 1);
    }
  }

  if (project.rooms.diningRoom && project.rooms.diningRoom > 0) {
    addRoom('dining', 'Dining Room', 1);
  }

  // Bedrooms: distribute across floors if multiple floors
  const totalBeds = project.rooms.bedrooms || 0;
  for (let i = 1; i <= totalBeds; i++) {
    // If multiple floors, place bedrooms 2+ on upper floors
    const floor = project.floors > 1 && i > 1 ? 2 : 1;
    addRoom('bedroom', totalBeds === 1 ? 'Master Bedroom' : `Bedroom ${i}`, floor);
  }

  // Bathrooms
  const totalBaths = project.rooms.bathrooms || 0;
  for (let i = 1; i <= totalBaths; i++) {
    const floor = project.floors > 1 && i > 1 ? 2 : 1;
    addRoom('bathroom', totalBaths === 1 ? 'Bathroom' : `Bathroom ${i}`, floor);
  }

  // Auxiliary
  if (project.rooms.homeOffice) addRoom('office', 'Home Office', 1);
  if (project.rooms.garage) addRoom('garage', 'Garage', 1);
  if (project.rooms.balcony) addRoom('balcony', 'Balcony', project.floors > 1 ? 2 : 1);

  // If no rooms in config, add a sensible default
  if (rooms.length === 0) {
    addRoom('living', 'Main Living Area', 1);
    addRoom('bedroom', 'Master Suite', 1);
    addRoom('bathroom', 'Full Bath', 1);
    addRoom('kitchen', 'Kitchen', 1);
  }

  return rooms;
}
