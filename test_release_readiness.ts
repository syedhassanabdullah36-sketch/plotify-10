/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import {
  DEFAULT_RELEASE_CHECKLIST,
  DEFAULT_DEPLOYMENT_PROFILE,
  RELEASE_DOMAIN_LABELS,
  calculateReleasePreparationSummary,
  validateClientSecurityAndSecrets,
  generateSupportDiagnosticBundle,
  exportReleaseChecklistCSV,
  generateReleaseDossierMarkdown,
} from './src/services/readinessService';
import { Project } from './src/types/project';
import { ReleaseChecklistDomain, ReleaseChecklistItem } from './src/types/readiness';

console.log('================================================================');
console.log('PLOTIFY PROMPT 23: RELEASE PREPARATION & READINESS TEST');
console.log('================================================================\n');

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`  ✓ ${message}`);
}

const testProject: Project = {
  id: 'proj-release-readiness-01',
  name: 'Summit View Eco-Residence',
  projectType: 'house',
  plotWidth: 70,
  plotLength: 100,
  unit: 'feet',
  roadFacing: 'East',
  floors: 2,
  rooms: {
    livingRoom: 1,
    bedrooms: 4,
    bathrooms: 3,
    kitchen: 1,
    diningRoom: 1,
    balcony: 1,
    garage: 1,
    customRooms: [],
  },
  budget: 750000,
  currency: 'USD',
  notes: 'Release Preparation and Operational Readiness Testing',
  status: 'Schematic Design',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  floorPlan: {
    rooms: [
      {
        id: 'rm-01',
        name: 'Great Room',
        type: 'living',
        x: 10,
        y: 10,
        width: 25,
        length: 30,
        floorLevel: 1,
      },
      {
        id: 'rm-02',
        name: 'Gourmet Kitchen',
        type: 'kitchen',
        x: 35,
        y: 10,
        width: 20,
        length: 20,
        floorLevel: 1,
      },
    ],
  },
};

// -----------------------------------------------------------------------------
// TEST SUITE 1: 9-Domain Release Checklist Coverage
// -----------------------------------------------------------------------------
console.log('TEST SUITE 1: 9-Domain Release Checklist Coverage');

const expectedDomains: ReleaseChecklistDomain[] = [
  'build-deployment',
  'security-privacy',
  'data-recovery',
  'user-documentation',
  'defect-tracking',
  'expert-reviews',
  'operational-monitoring',
  'rollback-planning',
  'regulatory-boundaries',
];

expectedDomains.forEach((domain) => {
  assert(Boolean(RELEASE_DOMAIN_LABELS[domain]), `Domain label registered for: ${domain}`);
  const domainItems = DEFAULT_RELEASE_CHECKLIST.filter((i) => i.domain === domain);
  assert(domainItems.length >= 1, `Domain ${domain} has at least 1 verified checklist item`);
});

assert(DEFAULT_RELEASE_CHECKLIST.length >= 15, 'Release checklist contains comprehensive criteria set');
const mandatoryItems = DEFAULT_RELEASE_CHECKLIST.filter((i) => i.mandatoryForRelease);
assert(mandatoryItems.length >= 12, 'Mandatory release criteria identified');

// -----------------------------------------------------------------------------
// TEST SUITE 2: Release Preparation Summary & Blockers Engine
// -----------------------------------------------------------------------------
console.log('\nTEST SUITE 2: Release Readiness Summary & Gate Calculations');

const summary = calculateReleasePreparationSummary(DEFAULT_RELEASE_CHECKLIST);

assert(summary.totalItemsCount === DEFAULT_RELEASE_CHECKLIST.length, 'Total checklist count matches');
assert(summary.readyCount > 0, 'Ready items count is positive');
assert(summary.mandatoryReadyPercent >= 80, `Mandatory readiness percentage (${summary.mandatoryReadyPercent}%) exceeds threshold`);
assert(summary.blockingReasons.length === 0, 'Zero blocking reasons on mandatory criteria');
assert(summary.overallReadyForReleaseCandidate === true, 'Overall ready for release candidate verified');

// Test blocker detection with mock unready mandatory item
const mockChecklistWithBlocker: ReleaseChecklistItem[] = [
  ...DEFAULT_RELEASE_CHECKLIST,
  {
    id: 'mock-blocker-01',
    domain: 'build-deployment',
    title: 'Mock Mandatory Build Failure',
    description: 'Testing blocker detection',
    status: 'blocked',
    evidence: 'Simulated pipeline failure',
    mandatoryForRelease: true,
  },
];

const blockedSummary = calculateReleasePreparationSummary(mockChecklistWithBlocker);
assert(blockedSummary.overallReadyForReleaseCandidate === false, 'Detects blocking mandatory items correctly');
assert(blockedSummary.blockingReasons.length >= 1, 'Records blocking reasons when mandatory item is unready');

// -----------------------------------------------------------------------------
// TEST SUITE 3: Zero Client-Side Secret Exposure Validation
// -----------------------------------------------------------------------------
console.log('\nTEST SUITE 3: Client Security & Zero-Secret Validation');

const securityCheck = validateClientSecurityAndSecrets();

assert(securityCheck.isSecure === true, 'Client security scan passed without secret leakage');
assert(securityCheck.findings.length === 0, 'Zero sensitive environment variables found in client scope');

// -----------------------------------------------------------------------------
// TEST SUITE 4: Sanitized Support Diagnostic Bundle
// -----------------------------------------------------------------------------
console.log('\nTEST SUITE 4: Sanitized Support Diagnostic Bundle Generator');

const diagnostics = generateSupportDiagnosticBundle(testProject);

assert(Boolean(diagnostics.diagnosticId), 'Diagnostic bundle assigned unique tracking ID');
assert(diagnostics.appVersion === 'v1.0.0-rc1', 'Diagnostic records application release candidate version');
assert(diagnostics.projectId === testProject.id, 'Diagnostic tracks project identifier');
assert(Boolean(diagnostics.geometryFingerprint), 'Diagnostic captures project geometry fingerprint');
assert(diagnostics.roomCount === 2, 'Diagnostic accurately counts rooms');
assert(diagnostics.environment.webGlSupported === true, 'Diagnostic checks WebGL status');
assert(diagnostics.sanitizationNotice.includes('CONFIDENTIALITY CONFIRMED'), 'Includes explicit confidentiality notice');

// Verify zero secret or personal data in diagnostic output
const serialized = JSON.stringify(diagnostics);
assert(!serialized.includes('password'), 'Diagnostics free of password fields');
assert(!serialized.includes('secret'), 'Diagnostics free of secret fields');
assert(!serialized.includes('token'), 'Diagnostics free of auth token fields');

// -----------------------------------------------------------------------------
// TEST SUITE 5: RFC-4180 CSV & Markdown Dossier Export
// -----------------------------------------------------------------------------
console.log('\nTEST SUITE 5: RFC-4180 CSV & Markdown Dossier Formatting');

const csv = exportReleaseChecklistCSV(DEFAULT_RELEASE_CHECKLIST);
assert(typeof csv === 'string' && csv.length > 200, 'CSV export generated');
assert(csv.includes('"Checklist ID","Domain","Title"'), 'CSV has valid RFC-4180 quoted headers');
assert(csv.includes('Build & Deployment Configuration'), 'CSV contains domain labels');

const markdownDossier = generateReleaseDossierMarkdown(DEFAULT_RELEASE_CHECKLIST, DEFAULT_DEPLOYMENT_PROFILE);
assert(typeof markdownDossier === 'string' && markdownDossier.length > 500, 'Markdown dossier generated');
assert(markdownDossier.includes('# PLOTIFY — RELEASE PREPARATION & OPERATIONAL READINESS DOSSIER'), 'Dossier header present');
assert(markdownDossier.includes('RELEASE PREPARATION & LEGAL BOUNDARIES NOTICE'), 'Statutory disclaimer notice present');
assert(markdownDossier.includes('Release Preparation Checklist Matrix'), 'Checklist matrix section present');
assert(markdownDossier.includes('docs/DEPLOYMENT_AND_CONFIGURATION.md'), 'References operational runbooks');

// -----------------------------------------------------------------------------
// TEST SUITE 6: Operational Documentation Files Verification
// -----------------------------------------------------------------------------
console.log('\nTEST SUITE 6: Operational Documentation Files Presence & Contents');

const requiredDocs = [
  'docs/DEPLOYMENT_AND_CONFIGURATION.md',
  'docs/PRIVACY_DATA_HANDLING.md',
  'docs/USER_GUIDE_AND_SUPPORT.md',
  'docs/BACKUP_AND_DISASTER_RECOVERY.md',
  'docs/OPERATIONAL_INCIDENT_RUNBOOK.md',
];

requiredDocs.forEach((docRelPath) => {
  const fullPath = path.resolve(process.cwd(), docRelPath);
  assert(fs.existsSync(fullPath), `Documentation file exists: ${docRelPath}`);
  const content = fs.readFileSync(fullPath, 'utf-8');
  assert(content.length > 300, `Documentation file ${docRelPath} has substantive content`);
});

console.log('\n================================================================');
console.log('✅ ALL 6 RELEASE PREPARATION & OPERATIONAL READINESS TESTS PASSED!');
console.log('================================================================\n');
