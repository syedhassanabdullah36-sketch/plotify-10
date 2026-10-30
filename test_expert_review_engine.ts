/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  initializeProfessionalReviews,
  addProfessionalReviewItem,
  updateFindingResolution,
  generateReviewDossierMarkdown,
  exportReviewRegisterCSV,
  REVIEW_DISCIPLINE_LABELS,
} from './src/services/expertReviewService';
import { Project } from './src/types/project';
import {
  ReviewDiscipline,
  ReviewStatus,
  FindingPriority,
  FindingResolutionStatus,
  ProfessionalReviewItem,
} from './src/types/review';

console.log('================================================================');
console.log('PLOTIFY PROMPT 21: PROFESSIONAL VALIDATION & EXPERT REVIEW TEST');
console.log('================================================================\n');

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`  ✓ ${message}`);
}

const baseProject: Project = {
  id: 'proj-expert-review-01',
  name: 'Harbor Horizon Mixed-Use & Residential',
  projectType: 'other',
  plotWidth: 100,
  plotLength: 150,
  unit: 'feet',
  roadFacing: 'South',
  floors: 3,
  rooms: {
    livingRoom: 4,
    bedrooms: 6,
    bathrooms: 4,
    kitchen: 2,
    diningRoom: 2,
    balcony: 2,
    garage: 1,
    customRooms: [],
  },
  budget: 1500000,
  currency: 'USD',
  notes: 'Testing Professional Validation & Expert Review Framework',
  status: 'Schematic Design',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  floorPlan: {
    rooms: [
      {
        id: 'rm-101',
        name: 'Ground Retail Lobby',
        type: 'living',
        x: 10,
        y: 10,
        width: 35,
        length: 40,
        floorLevel: 1,
      },
      {
        id: 'rm-102',
        name: 'Primary Egress Vestibule',
        type: 'balcony',
        x: 50,
        y: 10,
        width: 15,
        length: 20,
        floorLevel: 1,
      },
      {
        id: 'rm-201',
        name: 'Residential Suite A',
        type: 'bedroom',
        x: 10,
        y: 10,
        width: 30,
        length: 30,
        floorLevel: 2,
      },
    ],
  },
};

// -----------------------------------------------------------------------------
// TEST SUITE 1: Professional Review Initialization & Baseline Seeding
// -----------------------------------------------------------------------------
console.log('TEST SUITE 1: Baseline Review Seeding & Discipline Scope');

const seededRegister = initializeProfessionalReviews(baseProject);

assert(Boolean(seededRegister), 'Register successfully initialized');
assert(seededRegister.items.length >= 3, 'Baseline register contains initial discipline reviews');
assert(seededRegister.items.some(i => i.discipline === 'architecture_spatial'), 'Architecture review baseline created');
assert(seededRegister.items.some(i => i.discipline === 'structural_engineering'), 'Structural review baseline created');
assert(seededRegister.items.some(i => i.discipline === 'mep_engineering'), 'MEP review baseline created');
assert(seededRegister.summary.totalReviews === seededRegister.items.length, 'Summary total count reflects seeded items');
assert(seededRegister.disciplineSummaries.architecture_spatial !== undefined, 'Architecture summary generated');
assert(seededRegister.disciplineSummaries.structural_engineering !== undefined, 'Structural summary generated');

// -----------------------------------------------------------------------------
// TEST SUITE 2: Adding Scoped Expert Reviews
// -----------------------------------------------------------------------------
console.log('\nTEST SUITE 2: Scoped Expert Review Item Registration');

const newReviewItemData = {
  discipline: 'accessibility_universal' as ReviewDiscipline,
  title: 'Level 1 Primary Egress & Door Vestibule Clearances',
  scopeAndLimitations: 'Egress path width, door swing clearances, and threshold bevels per ANSI A117.1.',
  targetSubject: 'Door Vestibule 102 & Level 1 Corridor',
  reviewerName: 'C. Vance, AIA CPAC',
  reviewerRole: 'Accessibility Consultant',
  reviewerCredentials: 'AIA, CPAC',
  reviewDate: new Date().toISOString(),
  status: 'changes-required' as ReviewStatus,
  generalComments: 'Reviewed against ANSI A117.1 Section 404 door clearances.',
  findings: [
    {
      id: `fnd-access-01`,
      reviewItemId: `rev-temp-01`,
      title: 'Vestibule Door Strike Margin Inadequate',
      discipline: 'accessibility_universal' as ReviewDiscipline,
      priority: 'high' as FindingPriority,
      description: 'Door strike side pull clearance requires 18 in minimum, current geometry only allows 12 in.',
      evidenceLinks: [
        {
          id: 'ev-access-01',
          evidenceType: 'drawing_room' as const,
          targetId: 'rm-102',
          targetLabel: 'Egress Vestibule Room Geometry',
          capturedValue: '15 x 20 ft',
        },
      ],
      correctiveActionRequired: 'Shift vestibule partition 6 inches West or reverse swing direction.',
      assigneeRole: 'Lead Architect',
      resolutionStatus: 'open' as FindingResolutionStatus,
    },
  ],
};

const updatedRegister = addProfessionalReviewItem(seededRegister, baseProject, newReviewItemData);

assert(updatedRegister.items.length === seededRegister.items.length + 1, 'Review item added to register');
const addedItem = updatedRegister.items.find(i => i.title.includes('Door Vestibule Clearances'));
assert(Boolean(addedItem), 'New accessibility review found in register');
assert(addedItem?.status === 'changes-required', 'Review item status correctly set to changes-required');
assert(addedItem?.findings.length === 1, 'Finding properly registered under accessibility review');
assert(updatedRegister.summary.changesRequiredCount >= 1, 'Summary reflects changes-required count');
assert(updatedRegister.summary.openFindingsCount >= 1, 'Summary reflects open findings count');

// -----------------------------------------------------------------------------
// TEST SUITE 3: Finding Resolution Workflow
// -----------------------------------------------------------------------------
console.log('\nTEST SUITE 3: Finding Lifecycle & Resolution Tracking');

const findingId = addedItem!.findings[0].id;
const reviewId = addedItem!.id;

// Step A: Mark as proposed correction
const regWithProposed = updateFindingResolution(
  updatedRegister,
  reviewId,
  findingId,
  {
    status: 'proposed-correction',
    notes: 'Architect adjusted wall partition 8 inches West in rev 1.2 plan.',
    resolvedBy: 'Lead Architect',
  }
);

const proposedFinding = regWithProposed.items
  .find(i => i.id === reviewId)!
  .findings.find(f => f.id === findingId)!;

assert(proposedFinding.resolutionStatus === 'proposed-correction', 'Finding updated to proposed-correction');
assert(proposedFinding.resolutionNotes?.includes('8 inches West') ?? false, 'Resolution notes recorded');

// Step B: Peer reviewer verifies resolution
const regWithResolved = updateFindingResolution(
  regWithProposed,
  reviewId,
  findingId,
  {
    status: 'verified-resolved',
    notes: 'Field clearance confirmed at 20 inches, exceeding ANSI minimum.',
    resolvedBy: 'Accessibility Consultant',
  }
);

const resolvedFinding = regWithResolved.items
  .find(i => i.id === reviewId)!
  .findings.find(f => f.id === findingId)!;

assert(resolvedFinding.resolutionStatus === 'verified-resolved', 'Finding successfully verified as resolved');
assert(Boolean(resolvedFinding.resolvedAt), 'Resolved timestamp is populated');
assert(regWithResolved.summary.openFindingsCount < updatedRegister.summary.openFindingsCount, 'Open findings counter decreased');

// -----------------------------------------------------------------------------
// TEST SUITE 4: Staleness Detection & Geometry Fingerprinting
// -----------------------------------------------------------------------------
console.log('\nTEST SUITE 4: Staleness Detection & Geometry Change Invalidation');

// Attach register to baseProject
const projectWithReviews: Project = {
  ...baseProject,
  expertReviews: regWithResolved,
};

// Check with unchanged geometry
const registerRechecked = initializeProfessionalReviews(projectWithReviews);
assert(registerRechecked.items.every(i => !i.isPotentiallyOutdated), 'All reviews are fresh with original geometry');

// Modify project geometry (e.g. room resized from 35 to 48)
const modifiedProject: Project = {
  ...projectWithReviews,
  floorPlan: {
    rooms: [
      {
        ...projectWithReviews.floorPlan!.rooms[0],
        width: 48,
      },
      ...projectWithReviews.floorPlan!.rooms.slice(1),
    ],
  },
};

const outdatedRegister = initializeProfessionalReviews(modifiedProject);
assert(
  outdatedRegister.items.some(i => i.isPotentiallyOutdated),
  'Reviews detected as potentially outdated after geometry modification'
);
assert(
  outdatedRegister.summary.expiredCount >= 1,
  'Expired/superseded count updated after geometry change'
);

// -----------------------------------------------------------------------------
// TEST SUITE 5: Dossier Markdown Generation & Statutory Disclaimers
// -----------------------------------------------------------------------------
console.log('\nTEST SUITE 5: Executive Review Dossier Markdown Audit Export');

const markdownDossier = generateReviewDossierMarkdown(regWithResolved, baseProject);

assert(typeof markdownDossier === 'string' && markdownDossier.length > 500, 'Markdown dossier generated');
assert(markdownDossier.includes('# PLOTIFY — PROFESSIONAL REVIEW REGISTER & EXPERT VALIDATION DOSSIER'), 'Dossier contains correct header');
assert(markdownDossier.includes('STATUTORY & PROFESSIONAL BOUNDARIES NOTICE'), 'Statutory disclaimer prominently present in dossier');
assert(markdownDossier.includes('Accessibility Consultant'), 'Reviewer role documented');
assert(markdownDossier.includes('ANSI A117.1'), 'Scope details included in markdown dossier');
assert(markdownDossier.includes('Discipline Review Register'), 'Discipline register section exists');

// -----------------------------------------------------------------------------
// TEST SUITE 6: RFC-4180 CSV Register Export
// -----------------------------------------------------------------------------
console.log('\nTEST SUITE 6: RFC-4180 CSV Register Export');

const csvData = exportReviewRegisterCSV(regWithResolved, baseProject);

assert(typeof csvData === 'string' && csvData.length > 200, 'CSV export generated');
assert(csvData.includes('"Review ID","Discipline","Review Title"'), 'CSV has correct RFC-4180 headers');
assert(csvData.includes('Accessibility & Universal Design'), 'CSV rows contain accessibility discipline label');

// -----------------------------------------------------------------------------
// TEST SUITE 7: Discipline Labels Coverage
// -----------------------------------------------------------------------------
console.log('\nTEST SUITE 7: Discipline Labels Coverage Verification');

const disciplines: ReviewDiscipline[] = [
  'architecture_spatial',
  'building_regulations',
  'accessibility_universal',
  'structural_engineering',
  'mep_engineering',
  'cost_construction',
  'environmental_sustainability',
];

for (const d of disciplines) {
  const label = REVIEW_DISCIPLINE_LABELS[d];
  assert(Boolean(label) && label.length > 0, `Discipline label registered for ${d}: "${label}"`);
}

// -----------------------------------------------------------------------------
// TEST SUITE 8: Defensive Empty/Malformed Project Guard
// -----------------------------------------------------------------------------
console.log('\nTEST SUITE 8: Defensive Boundary Conditions');

const minimalProject: Project = {
  id: 'proj-empty',
  name: 'Blank Site',
  projectType: 'other',
  plotWidth: 50,
  plotLength: 50,
  unit: 'metres',
  roadFacing: 'East',
  floors: 1,
  rooms: {
    livingRoom: 0,
    bedrooms: 0,
    bathrooms: 0,
    kitchen: 0,
    diningRoom: 0,
    balcony: 0,
    garage: 0,
    customRooms: [],
  },
  budget: 100000,
  currency: 'EUR',
  notes: '',
  status: 'Drafting',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const blankRegister = initializeProfessionalReviews(minimalProject);
assert(blankRegister.items.length >= 1, 'Handles project with no floor plan gracefully');
const blankDossier = generateReviewDossierMarkdown(blankRegister, minimalProject);
assert(blankDossier.includes('Blank Site'), 'Dossier generates cleanly for empty floor plan');

console.log('\n================================================================');
console.log('✅ ALL 8 PROFESSIONAL REVIEW & EXPERT VALIDATION TESTS PASSED!');
console.log('================================================================\n');
