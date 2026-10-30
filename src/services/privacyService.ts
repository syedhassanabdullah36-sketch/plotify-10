/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Project } from '../types/project';
import { AnonymizationOptions } from '../types/security';

export const DEFAULT_ANONYMIZATION_OPTIONS: AnonymizationOptions = {
  maskProjectName: true,
  maskBudget: true,
  maskNotes: true,
  stripAlternativeAuthorNames: true,
  genericRoomLabels: false,
};

/**
 * Creates a sanitized, privacy-safe copy of a project suitable for
 * public tender, academic review, or contractor bidding.
 */
export function anonymizeProject(project: Project, options: AnonymizationOptions = DEFAULT_ANONYMIZATION_OPTIONS): Project {
  const anonymized: Project = JSON.parse(JSON.stringify(project));

  if (options.maskProjectName) {
    const code = project.id.slice(-6).toUpperCase();
    anonymized.name = `Architectural Study [REF-${code}]`;
  }

  if (options.maskBudget) {
    anonymized.budget = 0;
    if (anonymized.notes) {
      anonymized.notes = anonymized.notes.replace(/\$\d[\d,.]*/g, '[BUDGET REDACTED]');
    }
  }

  if (options.maskNotes) {
    anonymized.notes = 'Confidential client notes redacted for external review.';
  }

  if (options.genericRoomLabels && anonymized.floorPlan?.rooms) {
    anonymized.floorPlan.rooms = anonymized.floorPlan.rooms.map((r, i) => ({
      ...r,
      name: `Spatial Cell ${i + 1} (${r.type})`,
    }));
  }

  // Sanitize design alternatives
  if (anonymized.designAlternatives) {
    anonymized.designAlternatives = anonymized.designAlternatives.map((alt, i) => ({
      ...alt,
      name: `Design Scheme Option ${String.fromCharCode(65 + i)}`,
      description: options.maskNotes ? 'Architectural design alternative specifications.' : alt.description,
      facade: {
        ...alt.facade,
        notes: options.maskNotes ? 'Material specifications provided upon contract award.' : alt.facade.notes,
      },
    }));
  }

  return anonymized;
}

/**
 * Generates a Privacy & Data Governance summary of local storage.
 */
export function getPrivacySummary(projects: Project[]) {
  const totalProjects = projects.length;
  let totalWithBudgets = 0;
  let totalWithNotes = 0;

  projects.forEach((p) => {
    if (p.budget && p.budget > 0) totalWithBudgets++;
    if (p.notes && p.notes.trim().length > 0) totalWithNotes++;
  });

  return {
    storageModel: 'Local Air-Gapped (Browser LocalStorage)',
    telemetryActive: false,
    externalAnalytics: false,
    cloudSyncStatus: 'None (Local client-only execution)',
    retainedData: {
      totalProjects,
      projectsWithFinancials: totalWithBudgets,
      projectsWithCustomNotes: totalWithNotes,
    },
    privacyPosture: 'Zero-cloud transmission: all spatial coordinates, room schedules, and financial models remain on the host device unless manually exported as a JSON bundle.',
  };
}
