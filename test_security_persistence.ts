/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { computeStringChecksum, sanitizeText, sanitizeNumber, sanitizeUntrustedObject, safeJsonParse } from './src/utils/securityUtils';
import { auditStorageIntegrity } from './src/services/storageGuard';
import { anonymizeProject } from './src/services/privacyService';
import { INITIAL_SAMPLE_PROJECTS } from './src/services/storage';
import { Project } from './src/types/project';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${msg}`);
  }
}

console.log('--- TEST SUITE: SECURITY UTILITIES & CHECKSUMS ---');

// 1. Checksum Tests
const chk1 = computeStringChecksum('plotify-payload-sample');
const chk2 = computeStringChecksum('plotify-payload-sample');
const chk3 = computeStringChecksum('plotify-payload-altered');
assert(chk1.length === 8, 'Checksum produces 8-char hex string');
assert(chk1 === chk2, 'Checksum is deterministic for identical input');
assert(chk1 !== chk3, 'Checksum changes when input changes');

// 2. Input Sanitization Tests
const rawScript = '<script>alert("xss")</script>Client Villa Name<script>evil()</script>';
const cleanText = sanitizeText(rawScript, 50);
assert(!cleanText.includes('<script>'), 'Strips <script> tags from string input');
assert(!cleanText.includes('evil()'), 'Strips malicious script content');
assert(cleanText.includes('Client Villa Name'), 'Preserves legitimate architectural naming');

const clampedNum = sanitizeNumber(-10, 0, 1000, 50);
assert(clampedNum === 0, 'Clamps negative numbers to configured minimum');

const boundedNum = sanitizeNumber(999999999, 0, 5000000, 100);
assert(boundedNum === 5000000, 'Clamps oversized numbers to configured maximum');

// 3. Prototype Pollution Prevention
const maliciousPayload = JSON.parse('{"name":"Safe Project","__proto__":{"polluted":true},"nested":{"constructor":{"bad":true},"title":"Test"}}');
const sanitizedObj = sanitizeUntrustedObject(maliciousPayload);
assert(!Object.prototype.hasOwnProperty('polluted'), 'Prototype pollution prevented on Object prototype');
assert(sanitizedObj.name === 'Safe Project', 'Preserves legitimate properties on sanitized objects');

// 4. Safe JSON Parser
const parsedSafe = safeJsonParse<{ id: string; name: string } | null>('{"id":"proj-999","name":"Secure Villa"}', null);
assert(parsedSafe !== null && parsedSafe.id === 'proj-999', 'Parses valid JSON safely');

const parsedFallback = safeJsonParse('{"bad-json-syntax', { fallback: true });
assert(parsedFallback.fallback === true, 'Returns fallback on corrupt JSON input without throwing');

console.log('\n--- TEST SUITE: STORAGE INTEGRITY AUDITING ---');

// 5. Integrity Audit on healthy sample projects
const auditResult1 = auditStorageIntegrity(INITIAL_SAMPLE_PROJECTS);
assert(auditResult1.passed === true, 'Healthy sample projects pass integrity audit');
assert(auditResult1.errorsCount === 0, 'Zero errors on standard project records');

// 6. Integrity Audit detecting corrupted project data
const corruptedProjects: Project[] = [
  {
    ...INITIAL_SAMPLE_PROJECTS[0],
    id: 'corrupt-1',
    plotWidth: -20, // Invalid width
    plotLength: 0,  // Invalid length
  },
  {
    ...INITIAL_SAMPLE_PROJECTS[1],
    id: 'corrupt-2',
    floorPlan: {
      rooms: [
        { id: 'dup-1', name: 'Room 1', type: 'living', x: 0, y: 0, width: 10, length: 10, color: '#000', floorLevel: 1 },
        { id: 'dup-1', name: 'Room 2', type: 'kitchen', x: 10, y: 0, width: -5, length: 10, color: '#000', floorLevel: 1 }, // duplicate ID & negative width
      ],
      gridSnap: 0.5,
      showGrid: true,
    },
  },
];

const auditResult2 = auditStorageIntegrity(corruptedProjects);
assert(auditResult2.passed === false, 'Detects corrupted project records');
assert(auditResult2.errorsCount > 0, 'Reports errors for negative plot dimensions and non-positive room sizes');
assert(auditResult2.issues.some((i) => i.field === 'plotWidth'), 'Specifically flags invalid plotWidth');
assert(auditResult2.issues.some((i) => i.field === 'plotLength'), 'Specifically flags invalid plotLength');

console.log('\n--- TEST SUITE: PRIVACY ANONYMIZATION ---');

// 7. Project Anonymizer for Public Tenders
const sample = INITIAL_SAMPLE_PROJECTS[0];
const anonymized = anonymizeProject(sample, {
  maskProjectName: true,
  maskBudget: true,
  maskNotes: true,
  stripAlternativeAuthorNames: true,
  genericRoomLabels: true,
});

assert(anonymized.name.startsWith('Architectural Study [REF-'), 'Masks client project name with study reference code');
assert(anonymized.budget === 0, 'Redacts client target budget to 0');
assert(anonymized.notes.includes('redacted'), 'Replaces confidential architect/client notes with redaction notice');
assert(Boolean(anonymized.floorPlan?.rooms[0]?.name.startsWith('Spatial Cell')), 'Replaces room names with generic spatial labels');
assert(anonymized.plotWidth === sample.plotWidth, 'Preserves geometric plot width for accurate spatial analysis');
assert(anonymized.plotLength === sample.plotLength, 'Preserves geometric plot length for accurate spatial analysis');

console.log(`\n========================================`);
console.log(`TOTAL TESTS: ${passed + failed}`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${failed}`);
console.log(`========================================`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log('All Production Infrastructure & Security tests passed cleanly!\n');
}
