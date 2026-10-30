/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ReleaseChecklistDomain =
  | 'build-deployment'
  | 'security-privacy'
  | 'data-recovery'
  | 'user-documentation'
  | 'defect-tracking'
  | 'expert-reviews'
  | 'operational-monitoring'
  | 'rollback-planning'
  | 'regulatory-boundaries';

export type ReleaseChecklistStatus =
  | 'ready'
  | 'not-ready'
  | 'blocked'
  | 'not-assessed'
  | 'not-applicable';

export interface ReleaseChecklistItem {
  id: string;
  domain: ReleaseChecklistDomain;
  title: string;
  description: string;
  status: ReleaseChecklistStatus;
  evidence: string;
  mandatoryForRelease: boolean;
  reviewedDate?: string;
  reviewerRole?: string;
}

export interface DeploymentConfigProfile {
  environment: 'development' | 'staging' | 'production';
  version: string;
  hostPort: string;
  bundleTarget: string;
  clientStorageIsolation: boolean;
  zeroClientSecretsVerified: boolean;
  cspEnabled: boolean;
  lastBuildVerificationTime: string;
}

export interface SupportDiagnosticBundle {
  diagnosticId: string;
  generatedAt: string;
  appVersion: string;
  projectId?: string;
  projectName?: string;
  geometryFingerprint?: string;
  unitSystem: string;
  roomCount: number;
  environment: {
    browser: string;
    operatingSystem: string;
    screenResolution?: string;
    webGlSupported: boolean;
    storageQuotaUsageBytes?: number;
    storageQuotaLimitBytes?: number;
  };
  activeMilestones: {
    schematicDesignGate: boolean;
    verificationPassStatus: boolean;
  };
  sanitizationNotice: string;
}

export interface ReleasePreparationSummary {
  totalItemsCount: number;
  readyCount: number;
  notReadyCount: number;
  blockedCount: number;
  notAssessedCount: number;
  notApplicableCount: number;
  mandatoryReadyPercent: number;
  overallReadyForReleaseCandidate: boolean;
  blockingReasons: string[];
}
