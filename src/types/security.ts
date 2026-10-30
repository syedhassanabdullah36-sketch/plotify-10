/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Project, AppSettings } from './project';
import { ProjectSnapshot } from './versioning';

export interface StorageQuotaInfo {
  usedBytes: number;
  estimatedTotalBytes: number;
  percentageUsed: number;
  isNearLimit: boolean;
  projectCount: number;
  snapshotCount: number;
  lastCalculatedAt: string;
}

export interface StorageIntegrityIssue {
  severity: 'error' | 'warning' | 'info';
  projectId?: string;
  projectName?: string;
  field?: string;
  message: string;
  remediation?: string;
  autoFixable?: boolean;
}

export interface StorageIntegrityAuditResult {
  passed: boolean;
  auditedAt: string;
  totalProjectsAudited: number;
  totalSnapshotsAudited: number;
  errorsCount: number;
  warningsCount: number;
  issues: StorageIntegrityIssue[];
  schemaVersion: number;
}

export interface PlotifySystemBackup {
  formatVersion: 'plotify-backup-v1';
  exportedAt: string;
  appVersion: string;
  checksum: string;
  environment: {
    origin: string;
    userAgent: string;
    storageEngine: 'localStorage';
  };
  data: {
    projects: Project[];
    settings: AppSettings;
    snapshots: Record<string, ProjectSnapshot[]>;
    metadata: {
      totalProjects: number;
      totalSnapshots: number;
      exportSummary: string;
    };
  };
}

export interface BackupValidationResult {
  isValid: boolean;
  formatVersion?: string;
  exportedAt?: string;
  projectCount: number;
  snapshotCount: number;
  checksumMatch: boolean;
  warnings: string[];
  errors: string[];
  dryRunSummary?: {
    newProjects: string[];
    overwritingProjects: string[];
    safeToProceed: boolean;
  };
}

export interface AnonymizationOptions {
  maskProjectName: boolean;
  maskBudget: boolean;
  maskNotes: boolean;
  stripAlternativeAuthorNames: boolean;
  genericRoomLabels: boolean;
}

export interface SystemHealthStatus {
  status: 'healthy' | 'warning' | 'critical';
  storageQuota: StorageQuotaInfo;
  integrityAudit: StorageIntegrityAuditResult;
  securityChecks: {
    cspActive: boolean;
    storageAirGapped: boolean;
    credentialsExposed: boolean;
    offlineCapable: boolean;
    schemaVersion: number;
  };
}
