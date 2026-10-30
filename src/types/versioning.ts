/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Project, MeasurementUnit } from './project';

export type SnapshotTrigger =
  | 'manual'
  | 'auto-checkpoint'
  | 'pre-restore-safety'
  | 'import';

export type CollaboratorRole =
  | 'architect'
  | 'structural-engineer'
  | 'mep-engineer'
  | 'cost-planner'
  | 'client-representative'
  | 'general-contractor';

export interface CollaboratorProfile {
  id: string;
  name: string;
  role: CollaboratorRole;
  roleTitle: string;
  initials: string;
  avatarColor: string;
}

export interface SnapshotMetrics {
  plotArea: number;
  unit: MeasurementUnit;
  roomCount: number;
  totalGFA: number;
  floors: number;
  budget: number;
  estimatedCost: number;
  structuralColumnCount: number;
  mepComponentCount: number;
  mepClashCount: number;
  status: string;
}

export interface ProjectSnapshot {
  id: string;
  projectId: string;
  revisionNumber: number;
  versionTag: string;
  label: string;
  description: string;
  trigger: SnapshotTrigger;
  timestamp: string;
  author: CollaboratorProfile;
  metrics: SnapshotMetrics;
  projectData: Project;
  checksum: string;
}

export type DiffCategory =
  | 'boundaries'
  | 'rooms'
  | 'structure'
  | 'mep'
  | 'cost'
  | 'regulations'
  | 'finishes'
  | 'general';

export type ChangeType = 'added' | 'removed' | 'modified' | 'unchanged';

export interface DiffChangeItem {
  id: string;
  category: DiffCategory;
  type: ChangeType;
  target: string;
  description: string;
  oldValue?: string | number | boolean;
  newValue?: string | number | boolean;
  severity: 'info' | 'notice' | 'warning' | 'critical';
}

export interface CategoryDiffSummary {
  category: DiffCategory;
  categoryTitle: string;
  addedCount: number;
  removedCount: number;
  modifiedCount: number;
  changes: DiffChangeItem[];
}

export interface ProjectDiffReport {
  sourceId: string;
  sourceLabel: string;
  sourceTimestamp: string;
  targetId: string;
  targetLabel: string;
  targetTimestamp: string;
  totalChanges: number;
  categories: Record<DiffCategory, CategoryDiffSummary>;
  summaryNotes: string[];
}

export interface RestoreValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  repairedFields: string[];
}

export interface ProjectRevisionBundle {
  plotifyBundleVersion: '1.0';
  projectId: string;
  projectName: string;
  exportedAt: string;
  exportedBy: CollaboratorProfile;
  snapshots: ProjectSnapshot[];
  activeProject: Project;
}
