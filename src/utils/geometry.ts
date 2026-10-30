import { FloorPlanData, FloorPlanValidation, PlanRoom, RoomType } from '../types/floorplan';
import { MeasurementUnit } from '../types/project';

/**
 * Snap coordinate to nearest grid increment
 */
export function snapToGrid(value: number, step: number = 0.5): number {
  return Math.round(value / step) * step;
}

/**
 * Room Type Specifications with default dimensions per unit
 */
export const ROOM_PRESETS: Record<
  RoomType,
  {
    name: string;
    defaultWidthFeet: number;
    defaultLengthFeet: number;
    defaultWidthMetres: number;
    defaultLengthMetres: number;
    fillColor: string;
    strokeColor: string;
    textColor: string;
  }
> = {
  living: {
    name: 'Living Room',
    defaultWidthFeet: 18,
    defaultLengthFeet: 14,
    defaultWidthMetres: 5.5,
    defaultLengthMetres: 4.2,
    fillColor: '#f0fdfa', // teal-50
    strokeColor: '#0d9488', // teal-600
    textColor: '#134e4a',
  },
  bedroom: {
    name: 'Primary Bedroom',
    defaultWidthFeet: 14,
    defaultLengthFeet: 12,
    defaultWidthMetres: 4.2,
    defaultLengthMetres: 3.6,
    fillColor: '#f8fafc', // slate-50
    strokeColor: '#475569', // slate-600
    textColor: '#1e293b',
  },
  kitchen: {
    name: 'Kitchen',
    defaultWidthFeet: 12,
    defaultLengthFeet: 10,
    defaultWidthMetres: 3.6,
    defaultLengthMetres: 3.0,
    fillColor: '#fffbeb', // amber-50
    strokeColor: '#d97706', // amber-600
    textColor: '#78350f',
  },
  dining: {
    name: 'Dining Room',
    defaultWidthFeet: 12,
    defaultLengthFeet: 10,
    defaultWidthMetres: 3.6,
    defaultLengthMetres: 3.0,
    fillColor: '#fef3c7', // amber-100
    strokeColor: '#b45309', // amber-700
    textColor: '#78350f',
  },
  bathroom: {
    name: 'Bathroom',
    defaultWidthFeet: 8,
    defaultLengthFeet: 6,
    defaultWidthMetres: 2.4,
    defaultLengthMetres: 1.8,
    fillColor: '#eff6ff', // blue-50
    strokeColor: '#2563eb', // blue-600
    textColor: '#1e3a8a',
  },
  office: {
    name: 'Home Office',
    defaultWidthFeet: 11,
    defaultLengthFeet: 10,
    defaultWidthMetres: 3.3,
    defaultLengthMetres: 3.0,
    fillColor: '#f0fdf4', // emerald-50
    strokeColor: '#16a34a', // emerald-600
    textColor: '#14532d',
  },
  hallway: {
    name: 'Foyer / Hallway',
    defaultWidthFeet: 10,
    defaultLengthFeet: 5,
    defaultWidthMetres: 3.0,
    defaultLengthMetres: 1.5,
    fillColor: '#fafaf9', // warm-gray
    strokeColor: '#78716c',
    textColor: '#44403c',
  },
  balcony: {
    name: 'Balcony / Terrace',
    defaultWidthFeet: 12,
    defaultLengthFeet: 6,
    defaultWidthMetres: 3.6,
    defaultLengthMetres: 1.8,
    fillColor: '#ecfdf5',
    strokeColor: '#059669',
    textColor: '#064e3b',
  },
  utility: {
    name: 'Laundry / Utility',
    defaultWidthFeet: 8,
    defaultLengthFeet: 6,
    defaultWidthMetres: 2.4,
    defaultLengthMetres: 1.8,
    fillColor: '#f5f3ff', // purple-50
    strokeColor: '#7c3aed',
    textColor: '#4c1d95',
  },
  custom: {
    name: 'Custom Space',
    defaultWidthFeet: 10,
    defaultLengthFeet: 10,
    defaultWidthMetres: 3.0,
    defaultLengthMetres: 3.0,
    fillColor: '#f1f5f9',
    strokeColor: '#64748b',
    textColor: '#334155',
  },
};

/**
 * Validates floor plan geometry against plot boundaries, dimension thresholds, and room-to-room overlap
 */
export function validateFloorPlan(
  plan: FloorPlanData,
  plotWidth: number,
  plotLength: number,
  unit: MeasurementUnit
): FloorPlanValidation {
  const boundaryViolations: FloorPlanValidation['boundaryViolations'] = [];
  const overlapViolations: FloorPlanValidation['overlapViolations'] = [];
  const dimensionViolations: FloorPlanValidation['dimensionViolations'] = [];

  const unitSuffix = unit === 'feet' ? 'ft' : 'm';
  let totalRoomArea = 0;

  // 1. Check each room's dimensions and plot boundary
  plan.rooms.forEach((room) => {
    // Dimension check
    if (room.width <= 0 || room.length <= 0) {
      dimensionViolations.push({
        roomId: room.id,
        roomName: room.name,
        issue: `Non-positive dimensions: width ${room.width} ${unitSuffix}, length ${room.length} ${unitSuffix}`,
      });
      return;
    }

    const roomArea = room.width * room.length;
    totalRoomArea += roomArea;

    // Boundary check
    const issues: string[] = [];
    if (room.x < 0) {
      issues.push(`extends ${Math.abs(room.x).toFixed(1)} ${unitSuffix} left of plot`);
    }
    if (room.y < 0) {
      issues.push(`extends ${Math.abs(room.y).toFixed(1)} ${unitSuffix} above top of plot`);
    }
    const rightEdge = room.x + room.width;
    if (rightEdge > plotWidth + 0.01) {
      issues.push(
        `extends ${(rightEdge - plotWidth).toFixed(1)} ${unitSuffix} beyond right plot line`
      );
    }
    const bottomEdge = room.y + room.length;
    if (bottomEdge > plotLength + 0.01) {
      issues.push(
        `extends ${(bottomEdge - plotLength).toFixed(1)} ${unitSuffix} beyond rear plot line`
      );
    }

    if (issues.length > 0) {
      boundaryViolations.push({
        roomId: room.id,
        roomName: room.name,
        issue: issues.join('; '),
      });
    }
  });

  // 2. Check for overlapping rooms (AABB collision detection)
  for (let i = 0; i < plan.rooms.length; i++) {
    for (let j = i + 1; j < plan.rooms.length; j++) {
      const r1 = plan.rooms[i];
      const r2 = plan.rooms[j];

      if (r1.width <= 0 || r1.length <= 0 || r2.width <= 0 || r2.length <= 0) continue;

      const overlapX = Math.min(r1.x + r1.width, r2.x + r2.width) - Math.max(r1.x, r2.x);
      const overlapY = Math.min(r1.y + r1.length, r2.y + r2.length) - Math.max(r1.y, r2.y);

      // Require a meaningful threshold (0.05 unit) to avoid touching walls being flagged as collisions
      if (overlapX > 0.05 && overlapY > 0.05) {
        overlapViolations.push({
          roomAId: r1.id,
          roomAName: r1.name,
          roomBId: r2.id,
          roomBName: r2.name,
        });
      }
    }
  }

  const plotArea = plotWidth * plotLength;
  const coveragePercent = plotArea > 0 ? (totalRoomArea / plotArea) * 100 : 0;

  const isValid =
    dimensionViolations.length === 0 &&
    boundaryViolations.length === 0 &&
    overlapViolations.length === 0;

  const hasWarnings =
    boundaryViolations.length > 0 || overlapViolations.length > 0 || coveragePercent > 80;

  return {
    isValid,
    hasWarnings,
    boundaryViolations,
    overlapViolations,
    dimensionViolations,
    totalRoomArea,
    plotArea,
    coveragePercent,
  };
}
