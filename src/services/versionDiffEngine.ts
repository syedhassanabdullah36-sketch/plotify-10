/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Project, FloorPlanRoom } from '../types/project';
import {
  ProjectDiffReport,
  CategoryDiffSummary,
  DiffCategory,
  DiffChangeItem,
  ChangeType,
} from '../types/versioning';

/**
 * Deterministically computes deep, structured diff between two project versions.
 */
export function computeProjectDiff(
  source: Project,
  target: Project,
  options: {
    sourceLabel?: string;
    targetLabel?: string;
    sourceTimestamp?: string;
    targetTimestamp?: string;
  } = {}
): ProjectDiffReport {
  const sourceLabel = options.sourceLabel || source.name || 'Base Version';
  const targetLabel = options.targetLabel || target.name || 'Comparison Version';
  const sourceTimestamp = options.sourceTimestamp || source.updatedAt || source.createdAt || '';
  const targetTimestamp = options.targetTimestamp || target.updatedAt || target.createdAt || '';

  const categories: Record<DiffCategory, CategoryDiffSummary> = {
    boundaries: { category: 'boundaries', categoryTitle: 'Plot & Building Boundary', addedCount: 0, removedCount: 0, modifiedCount: 0, changes: [] },
    rooms: { category: 'rooms', categoryTitle: 'Rooms & Spatial Program', addedCount: 0, removedCount: 0, modifiedCount: 0, changes: [] },
    structure: { category: 'structure', categoryTitle: 'Structural Grid & Columns', addedCount: 0, removedCount: 0, modifiedCount: 0, changes: [] },
    mep: { category: 'mep', categoryTitle: 'MEP Services & Clashes', addedCount: 0, removedCount: 0, modifiedCount: 0, changes: [] },
    cost: { category: 'cost', categoryTitle: 'Budget & Cost Planning', addedCount: 0, removedCount: 0, modifiedCount: 0, changes: [] },
    regulations: { category: 'regulations', categoryTitle: 'Building Regulations & Zoning', addedCount: 0, removedCount: 0, modifiedCount: 0, changes: [] },
    finishes: { category: 'finishes', categoryTitle: 'Design Alternatives & Finishes', addedCount: 0, removedCount: 0, modifiedCount: 0, changes: [] },
    general: { category: 'general', categoryTitle: 'Project Metadata & Status', addedCount: 0, removedCount: 0, modifiedCount: 0, changes: [] },
  };

  function recordChange(
    category: DiffCategory,
    type: ChangeType,
    targetName: string,
    description: string,
    oldValue?: string | number | boolean,
    newValue?: string | number | boolean,
    severity: 'info' | 'notice' | 'warning' | 'critical' = 'info'
  ) {
    const item: DiffChangeItem = {
      id: `diff-${category}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      category,
      type,
      target: targetName,
      description,
      oldValue,
      newValue,
      severity,
    };
    categories[category].changes.push(item);
    if (type === 'added') categories[category].addedCount++;
    else if (type === 'removed') categories[category].removedCount++;
    else if (type === 'modified') categories[category].modifiedCount++;
  }

  // 1. Boundaries & General Geometry
  if (source.plotWidth !== target.plotWidth) {
    recordChange('boundaries', 'modified', 'Plot Width', `Plot width changed from ${source.plotWidth}${source.unit} to ${target.plotWidth}${target.unit}`, source.plotWidth, target.plotWidth, 'warning');
  }
  if (source.plotLength !== target.plotLength) {
    recordChange('boundaries', 'modified', 'Plot Length', `Plot length changed from ${source.plotLength}${source.unit} to ${target.plotLength}${target.unit}`, source.plotLength, target.plotLength, 'warning');
  }
  if (source.unit !== target.unit) {
    recordChange('boundaries', 'modified', 'Measurement Unit', `Unit changed from ${source.unit} to ${target.unit}`, source.unit, target.unit, 'critical');
  }
  if (source.roadFacing !== target.roadFacing) {
    recordChange('boundaries', 'modified', 'Road Orientation', `Road-facing frontage changed from ${source.roadFacing} to ${target.roadFacing}`, source.roadFacing, target.roadFacing, 'notice');
  }
  if (source.floors !== target.floors) {
    recordChange('boundaries', 'modified', 'Storey Count', `Building storeys changed from ${source.floors} to ${target.floors}`, source.floors, target.floors, 'critical');
  }

  // 2. Rooms & Floorplan
  const srcRooms = source.floorPlan?.rooms || [];
  const tgtRooms = target.floorPlan?.rooms || [];
  const srcRoomMap = new Map<string, FloorPlanRoom>(srcRooms.map(r => [r.id, r]));
  const tgtRoomMap = new Map<string, FloorPlanRoom>(tgtRooms.map(r => [r.id, r]));

  // Check added rooms
  for (const tgtRoom of tgtRooms) {
    if (!srcRoomMap.has(tgtRoom.id)) {
      recordChange(
        'rooms',
        'added',
        tgtRoom.name,
        `Added new room "${tgtRoom.name}" (${tgtRoom.type}, ${tgtRoom.width}×${tgtRoom.length} ${target.unit}, Level ${tgtRoom.floorLevel})`,
        undefined,
        `${tgtRoom.width * tgtRoom.length} sq ${target.unit}`,
        'info'
      );
    }
  }

  // Check removed rooms
  for (const srcRoom of srcRooms) {
    if (!tgtRoomMap.has(srcRoom.id)) {
      recordChange(
        'rooms',
        'removed',
        srcRoom.name,
        `Removed room "${srcRoom.name}" (${srcRoom.type}, ${srcRoom.width}×${srcRoom.length} ${source.unit}, Level ${srcRoom.floorLevel})`,
        `${srcRoom.width * srcRoom.length} sq ${source.unit}`,
        undefined,
        'warning'
      );
    }
  }

  // Check modified rooms
  for (const tgtRoom of tgtRooms) {
    const srcRoom = srcRoomMap.get(tgtRoom.id);
    if (srcRoom) {
      const dimChanged = srcRoom.width !== tgtRoom.width || srcRoom.length !== tgtRoom.length;
      const posChanged = srcRoom.x !== tgtRoom.x || srcRoom.y !== tgtRoom.y;
      const nameChanged = srcRoom.name !== tgtRoom.name;
      const levelChanged = srcRoom.floorLevel !== tgtRoom.floorLevel;
      const typeChanged = srcRoom.type !== tgtRoom.type;

      if (dimChanged) {
        const oldArea = srcRoom.width * srcRoom.length;
        const newArea = tgtRoom.width * tgtRoom.length;
        const delta = newArea - oldArea;
        const sign = delta > 0 ? '+' : '';
        recordChange(
          'rooms',
          'modified',
          `Room Dimensions: ${tgtRoom.name}`,
          `Dimensions changed from ${srcRoom.width}×${srcRoom.length} to ${tgtRoom.width}×${tgtRoom.length} (${sign}${delta.toFixed(1)} sq ${target.unit})`,
          `${srcRoom.width}×${srcRoom.length}`,
          `${tgtRoom.width}×${tgtRoom.length}`,
          Math.abs(delta) > 50 ? 'warning' : 'info'
        );
      }
      if (posChanged) {
        recordChange(
          'rooms',
          'modified',
          `Room Position: ${tgtRoom.name}`,
          `Position moved from (${srcRoom.x}, ${srcRoom.y}) to (${tgtRoom.x}, ${tgtRoom.y}) on Level ${tgtRoom.floorLevel}`,
          `(${srcRoom.x}, ${srcRoom.y})`,
          `(${tgtRoom.x}, ${tgtRoom.y})`,
          'info'
        );
      }
      if (nameChanged) {
        recordChange('rooms', 'modified', `Room Rename: ${srcRoom.name}`, `Renamed to "${tgtRoom.name}"`, srcRoom.name, tgtRoom.name, 'info');
      }
      if (levelChanged) {
        recordChange('rooms', 'modified', `Room Level: ${tgtRoom.name}`, `Relocated from Level ${srcRoom.floorLevel} to Level ${tgtRoom.floorLevel}`, srcRoom.floorLevel, tgtRoom.floorLevel, 'warning');
      }
      if (typeChanged) {
        recordChange('rooms', 'modified', `Room Type: ${tgtRoom.name}`, `Usage type changed from ${srcRoom.type} to ${tgtRoom.type}`, srcRoom.type, tgtRoom.type, 'notice');
      }
    }
  }

  // 3. Structural Grid & Elements
  const srcStruct = source.structuralCoordination;
  const tgtStruct = target.structuralCoordination;

  if (srcStruct && tgtStruct) {
    if (srcStruct.framingSystem !== tgtStruct.framingSystem) {
      recordChange('structure', 'modified', 'Structural Framing System', `Framing system changed from ${srcStruct.framingSystem} to ${tgtStruct.framingSystem}`, srcStruct.framingSystem, tgtStruct.framingSystem, 'critical');
    }
    const srcSpacing = srcStruct.grid?.baySpacingX;
    const tgtSpacing = tgtStruct.grid?.baySpacingX;
    if (srcSpacing !== undefined && tgtSpacing !== undefined && srcSpacing !== tgtSpacing) {
      recordChange('structure', 'modified', 'Structural Grid Spacing', `Grid bay module changed from ${srcSpacing} to ${tgtSpacing} ${target.unit}`, srcSpacing, tgtSpacing, 'notice');
    }
    const srcCols = srcStruct.columns || [];
    const tgtCols = tgtStruct.columns || [];
    if (srcCols.length !== tgtCols.length) {
      const diff = tgtCols.length - srcCols.length;
      recordChange(
        'structure',
        diff > 0 ? 'added' : 'removed',
        'Structural Columns',
        `Column count changed from ${srcCols.length} to ${tgtCols.length} (${diff > 0 ? `+${diff}` : diff} columns)`,
        srcCols.length,
        tgtCols.length,
        'warning'
      );
    }
  } else if (!srcStruct && tgtStruct) {
    recordChange('structure', 'added', 'Structural Model', 'Structural framing & column grid initialized in this revision', undefined, 'Initialized', 'notice');
  } else if (srcStruct && !tgtStruct) {
    recordChange('structure', 'removed', 'Structural Model', 'Structural coordination data removed in comparison version', 'Configured', undefined, 'warning');
  }

  // 4. MEP Services & Clashes
  const srcMEP = source.mepCoordination;
  const tgtMEP = target.mepCoordination;

  if (srcMEP && tgtMEP) {
    const srcComps = srcMEP.components || [];
    const tgtComps = tgtMEP.components || [];
    if (srcComps.length !== tgtComps.length) {
      const diff = tgtComps.length - srcComps.length;
      recordChange(
        'mep',
        diff > 0 ? 'added' : 'removed',
        'MEP Distribution Components',
        `MEP equipment and routing components count changed from ${srcComps.length} to ${tgtComps.length} (${diff > 0 ? `+${diff}` : diff})`,
        srcComps.length,
        tgtComps.length,
        'info'
      );
    }
    const srcClashes = srcMEP.clashes || [];
    const tgtClashes = tgtMEP.clashes || [];
    if (srcClashes.length !== tgtClashes.length) {
      const diff = tgtClashes.length - srcClashes.length;
      recordChange(
        'mep',
        diff > 0 ? 'added' : 'removed',
        'Clash Detection Findings',
        `Detected spatial clash findings changed from ${srcClashes.length} to ${tgtClashes.length} (${diff > 0 ? `+${diff} new clashes` : `${Math.abs(diff)} clashes resolved`})`,
        srcClashes.length,
        tgtClashes.length,
        diff > 0 ? 'critical' : 'notice'
      );
    }
  } else if (!srcMEP && tgtMEP) {
    recordChange('mep', 'added', 'MEP Coordination', 'MEP coordination routes & clash detection initialized', undefined, 'Initialized', 'notice');
  } else if (srcMEP && !tgtMEP) {
    recordChange('mep', 'removed', 'MEP Coordination', 'MEP coordination data removed', 'Configured', undefined, 'warning');
  }

  // 5. Cost Planning & Budget
  if (source.budget !== target.budget) {
    const diff = target.budget - source.budget;
    const sign = diff > 0 ? '+' : '';
    recordChange(
      'cost',
      'modified',
      'Client Budget Target',
      `Budget target changed from ${source.currency} ${source.budget.toLocaleString()} to ${target.currency} ${target.budget.toLocaleString()} (${sign}${diff.toLocaleString()})`,
      source.budget,
      target.budget,
      'warning'
    );
  }
  if (source.currency !== target.currency) {
    recordChange('cost', 'modified', 'Currency', `Project currency changed from ${source.currency} to ${target.currency}`, source.currency, target.currency, 'critical');
  }
  const srcCostEst = source.costPlanning?.targetBudget;
  const tgtCostEst = target.costPlanning?.targetBudget;
  if (srcCostEst !== undefined && tgtCostEst !== undefined && srcCostEst !== tgtCostEst) {
    recordChange('cost', 'modified', 'Cost Planning Target', `Target cost estimate changed from ${srcCostEst.toLocaleString()} to ${tgtCostEst.toLocaleString()}`, srcCostEst, tgtCostEst, 'notice');
  }

  // 6. Building Regulations & Zoning
  const srcReg = source.regulations;
  const tgtReg = target.regulations;
  if (srcReg && tgtReg) {
    if (srcReg.activeRulePack !== tgtReg.activeRulePack) {
      recordChange('regulations', 'modified', 'Active Statutory Rule Pack', `Rule pack changed from ${srcReg.activeRulePack} to ${tgtReg.activeRulePack}`, srcReg.activeRulePack, tgtReg.activeRulePack, 'warning');
    }
    if (srcReg.profile?.localAuthority !== tgtReg.profile?.localAuthority && (srcReg.profile?.localAuthority || tgtReg.profile?.localAuthority)) {
      recordChange('regulations', 'modified', 'Local Planning Authority', `Authority changed from ${srcReg.profile?.localAuthority || 'N/A'} to ${tgtReg.profile?.localAuthority || 'N/A'}`, srcReg.profile?.localAuthority, tgtReg.profile?.localAuthority, 'notice');
    }
  }

  // 7. Design Alternatives & Finishes
  if (source.activeAlternativeId !== target.activeAlternativeId) {
    recordChange('finishes', 'modified', 'Active Design Scheme', `Active design option switched from ${source.activeAlternativeId || 'Default'} to ${target.activeAlternativeId || 'Default'}`, source.activeAlternativeId, target.activeAlternativeId, 'notice');
  }
  const srcAlts = source.designAlternatives || [];
  const tgtAlts = target.designAlternatives || [];
  if (srcAlts.length !== tgtAlts.length) {
    recordChange('finishes', tgtAlts.length > srcAlts.length ? 'added' : 'removed', 'Design Alternatives', `Alternatives count changed from ${srcAlts.length} to ${tgtAlts.length}`, srcAlts.length, tgtAlts.length, 'info');
  }

  // 8. General Metadata & Status
  if (source.name !== target.name) {
    recordChange('general', 'modified', 'Project Title', `Renamed from "${source.name}" to "${target.name}"`, source.name, target.name, 'info');
  }
  if (source.projectType !== target.projectType) {
    recordChange('general', 'modified', 'Building Typology', `Typology changed from ${source.projectType} to ${target.projectType}`, source.projectType, target.projectType, 'warning');
  }
  if (source.status !== target.status) {
    recordChange('general', 'modified', 'Project Status / Phase', `Phase progressed from "${source.status}" to "${target.status}"`, source.status, target.status, 'notice');
  }
  if (source.notes !== target.notes && (source.notes || target.notes)) {
    recordChange('general', 'modified', 'Design Brief / Notes', 'Project brief and design directives were updated', undefined, undefined, 'info');
  }

  // Total changes & summary notes
  let totalChanges = 0;
  const summaryNotes: string[] = [];

  for (const catKey of Object.keys(categories) as DiffCategory[]) {
    const cat = categories[catKey];
    const catTotal = cat.addedCount + cat.removedCount + cat.modifiedCount;
    totalChanges += catTotal;
    if (catTotal > 0) {
      const parts: string[] = [];
      if (cat.addedCount > 0) parts.push(`+${cat.addedCount} added`);
      if (cat.removedCount > 0) parts.push(`-${cat.removedCount} removed`);
      if (cat.modifiedCount > 0) parts.push(`${cat.modifiedCount} modified`);
      summaryNotes.push(`${cat.categoryTitle}: ${parts.join(', ')}`);
    }
  }

  if (totalChanges === 0) {
    summaryNotes.push('No geometric, structural, or cost differences detected between these two versions.');
  }

  return {
    sourceId: source.id,
    sourceLabel,
    sourceTimestamp,
    targetId: target.id,
    targetLabel,
    targetTimestamp,
    totalChanges,
    categories,
    summaryNotes,
  };
}
