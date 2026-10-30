/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'child_process';
import { runSystemVerification, computeGeometryFingerprint } from '../src/services/systemVerificationService';
import { INITIAL_SAMPLE_PROJECTS } from '../src/services/storage';

interface TestSuiteResult {
  name: string;
  command: string;
  status: 'passed' | 'failed';
  durationMs: number;
  outputSummary: string;
}

console.log('================================================================');
console.log('PLOTIFY — SYSTEM-WIDE VERIFICATION & RELEASE CONTROLS RUNNER');
console.log('================================================================\n');

const testSuites = [
  { name: '1. Security & Storage Persistence', script: 'test_security_persistence.ts' },
  { name: '2. Project Versions & Safe Rollback', script: 'test_versioning_engine.ts' },
  { name: '3. MEP Coordination & Clash Detection', script: 'test_mep_engine.ts' },
  { name: '4. Structural Framing & Column Grid', script: 'test_structural_engine.ts' },
  { name: '5. Building Regulations & Zoning Engine', script: 'test_regulatory_engine.ts' },
  { name: '6. Site Context & Solar Microclimate', script: 'test_site_engine.ts' },
  { name: '7. Architectural Brief & Space Program', script: 'test_brief_engine.ts' },
  { name: '8. Proof-Carrying Evidence Ledger', script: 'test_evidence_engine.ts' },
  { name: '9. Executive Documentation & Handoff', script: 'test_documentation_engine.ts' },
  { name: '10. Professional Review & Expert Validation', script: 'test_expert_review_engine.ts' },
  { name: '11. Controlled Pilot & Feedback System', script: 'test_pilot_system.ts' },
  { name: '12. Release Preparation & Operational Readiness', script: 'test_release_readiness.ts' },
  { name: '13. OpenBIM & IFC Interoperability (P41)', script: 'test_ifc_interoperability.ts' },
  { name: '14. CAD Drawing Exchange (P42)', script: 'test_cad_exchange.ts' },
  { name: '15. Terrain & Topographic Site Modeling (P43)', script: 'test_terrain_modeling.ts' },
  { name: '16. Embodied & Whole-Life Carbon Assessment (P44)', script: 'test_carbon_assessment.ts' },
  { name: '17. Climate Hazard & Resilience Analyzer (P45)', script: 'test_climate_resilience.ts' },
  { name: '18. Building Envelope Performance Analyzer (P46)', script: 'test_envelope_performance.ts' },
  { name: '19. Construction Site Logistics Planner (P47)', script: 'test_site_logistics.ts' },
  { name: '20. Augmented Reality Site Visualization (P48)', script: 'test_ar_site_visualization.ts' },
  { name: '21. Immersive VR Design Review (P49)', script: 'test_vr_design_review.ts' },
  { name: '22. Live Multi-User Design Collaboration (P50)', script: 'test_live_collaboration.ts' },
];

const results: TestSuiteResult[] = [];
let allPassed = true;

for (const suite of testSuites) {
  process.stdout.write(`• Running ${suite.name}... `);
  const start = Date.now();
  try {
    const stdout = execSync(`npx tsx ${suite.script}`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    const durationMs = Date.now() - start;
    results.push({
      name: suite.name,
      command: `npx tsx ${suite.script}`,
      status: 'passed',
      durationMs,
      outputSummary: 'All assertions verified successfully.',
    });
    console.log(`✓ PASSED (${durationMs} ms)`);
  } catch (err: any) {
    const durationMs = Date.now() - start;
    allPassed = false;
    results.push({
      name: suite.name,
      command: `npx tsx ${suite.script}`,
      status: 'failed',
      durationMs,
      outputSummary: err.stderr || err.stdout || err.message,
    });
    console.log(`✗ FAILED (${durationMs} ms)`);
  }
}

// 23. Direct System Verification Evaluation on Sample Projects
console.log('\n• Running 23. Multi-Project System Verification & Release Gate Audit...');
const auditStart = Date.now();
let sampleAuditPassed = true;

for (const project of INITIAL_SAMPLE_PROJECTS) {
  const report = runSystemVerification(project);
  if (!report.overallPassed) {
    sampleAuditPassed = false;
    console.log(`  ✗ Project "${project.name}" blocked with ${report.summary.blockingDefects} defects.`);
  } else {
    console.log(`  ✓ Project "${project.name}": Health ${report.healthScore}%, Schematic Gate: ${report.releaseGates.concept_schematic.eligible ? 'CLEAR' : 'BLOCKED'}, DD Gate: ${report.releaseGates.design_development.eligible ? 'CLEAR' : 'BLOCKED'}`);
  }
}

const auditDuration = Date.now() - auditStart;
results.push({
  name: '23. System Verification & Release Gates',
  command: 'runSystemVerification(INITIAL_SAMPLE_PROJECTS)',
  status: sampleAuditPassed ? 'passed' : 'failed',
  durationMs: auditDuration,
  outputSummary: `Audited ${INITIAL_SAMPLE_PROJECTS.length} sample projects.`,
});

if (!sampleAuditPassed) allPassed = false;

// Summary Table
console.log('\n================================================================');
console.log('VERIFICATION MATRIX & RELEASE READINESS SUMMARY');
console.log('================================================================');

console.table(
  results.map((r) => ({
    'Test Discipline': r.name,
    Status: r.status.toUpperCase(),
    'Duration (ms)': r.durationMs,
  }))
);

const totalTime = results.reduce((acc, r) => acc + r.durationMs, 0);
console.log(`Total Verification Execution Time: ${(totalTime / 1000).toFixed(2)}s`);
console.log(`Overall System Health: ${allPassed ? 'ALL DISCIPLINE CHECKS PASSED' : 'DEFECTS DETECTED'}`);
console.log('================================================================\n');

if (!allPassed) {
  process.exit(1);
} else {
  console.log('✓ System-wide verification and release controls verified successfully!\n');
  process.exit(0);
}
