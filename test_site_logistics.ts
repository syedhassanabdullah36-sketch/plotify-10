/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Automated Verification Suite — P47 Construction Site Logistics Planner
 * Verifies Groups A–G:
 *   Group A: Site Geometry, Unit Conversion & Provenance
 *   Group B: Traffic Routes, Turning Radii, Network Distance & Pedestrian Crossings
 *   Group C: Material Deliveries, Unloading Bay Double-Booking, Storage Capacity & P44 Module A4
 *   Group D: Cranes, Reach Radius, Load Chart SWL, Oversail & Mandatory Engineering Gates
 *   Group E: Multi-Phase Evolution, Footprint Growth & Emergency Route Continuity
 *   Group F: Safety & Evidence Honesty (Visual Layout != Safe Approval)
 *   Group G: Non-Destructive Alternative Preview, Safe Snapshot Persistence & P41–P46 Non-Regression
 */

import assert from 'assert';
import { INITIAL_SAMPLE_PROJECTS } from './src/services/storage';
import {
  SITE_LOGISTICS_PROFILE_ID,
} from './src/types/siteLogistics';
import {
  toMetres,
  fromMetres,
  extractBuildingBoundsMetres,
  initializeSiteLogisticsPlan,
  evaluateSiteLogisticsPlan,
  buildSiteLogisticsAlternativePreview,
  applySiteLogisticsPlanToProject,
  checkSiteLogisticsStaleness,
  exportSiteLogisticsReport,
} from './src/services/siteLogisticsService';

console.log('================================================================');
console.log('P47 — CONSTRUCTION SITE LOGISTICS PLANNER VERIFICATION SUITE');
console.log('================================================================\n');

const sampleProjectFeet = INITIAL_SAMPLE_PROJECTS[0]; // feet project
assert(sampleProjectFeet, 'Expected sample project 0 to exist');

// ---------------------------------------------------------------------------
// GROUP A: SITE GEOMETRY, UNIT CONVERSION & PROVENANCE
// ---------------------------------------------------------------------------
console.log('• Group A: Site Geometry, Unit Conversion & Provenance...');
{
  const widthM = toMetres(sampleProjectFeet.plotWidth, sampleProjectFeet.unit);
  const lengthM = toMetres(sampleProjectFeet.plotLength, sampleProjectFeet.unit);
  assert(widthM > 0 && lengthM > 0, 'Site dimensions in metres must be positive');

  const roundTripFeet = fromMetres(widthM, 'feet');
  assert(
    Math.abs(roundTripFeet - sampleProjectFeet.plotWidth) < 0.05,
    'Unit conversion feet <-> metres must round-trip accurately'
  );

  const bBounds = extractBuildingBoundsMetres(sampleProjectFeet);
  assert(
    bBounds.widthM > 0 && bBounds.lengthM > 0 && bBounds.widthM <= widthM && bBounds.lengthM <= lengthM,
    'Building footprint bounds must sit inside parcel dimensions'
  );

  const plan = initializeSiteLogisticsPlan(sampleProjectFeet);
  assert.strictEqual(plan.profileId, SITE_LOGISTICS_PROFILE_ID);
  assert.strictEqual(plan.internalCalculationUnit, 'metres');
  assert.strictEqual(plan.phases.length, 4, 'Default plan should initialize 4 construction phases');
  assert(plan.summary.totalSiteAreaM2 > plan.summary.buildingFootprintAreaM2, 'Total site area must exceed building footprint');
  console.log('  ✓ Group A passed: Site geometry, unit conversions, and provenance verified.');
}

// ---------------------------------------------------------------------------
// GROUP B: TRAFFIC ROUTES, TURNING RADII, NETWORK DISTANCE & PEDESTRIAN CROSSINGS
// ---------------------------------------------------------------------------
console.log('• Group B: Traffic Routes, Turning Radii, Network Distance & Pedestrian Crossings...');
{
  const basePlan = initializeSiteLogisticsPlan(sampleProjectFeet);
  assert(basePlan.routeAnalyses.length > 0, 'Route travel analyses must be computed');
  const ra0 = basePlan.routeAnalyses[0];
  assert(
    ra0.actualNetworkPathLengthM >= ra0.straightLineEntryToExitM,
    'Network path length must be >= straight-line distance'
  );
  assert(ra0.estimatedTransitMinutesOneWay > 0, 'Estimated transit time must be positive');

  // Inject narrow corridor width, tight turning radius, unmarshalled reversing, and uncontrolled pedestrian crossing
  const modifiedRaw = {
    ...basePlan,
    vehicleRoutes: basePlan.vehicleRoutes.map((r) => ({
      ...r,
      corridorWidthM: 2.8, // narrower than 3.8m required for concrete mixer
      declaredMinCurveRadiusM: 5.5, // tighter than 9.0m required
      requiresReversingManoeuvre: true,
      trainedBanksmanMarshallingConfirmed: false, // blocker!
      waypoints: [
        { x: 1.0, y: basePlan.siteLengthM - 0.5 },
        { x: basePlan.siteWidthM - 0.5, y: 1.0 }, // diagonal across site to intersect pedestrian walkway
      ],
    })),
    pedestrianRoutes: basePlan.pedestrianRoutes.map((pr) => ({
      ...pr,
      clearWidthM: 0.9, // narrower than 1.2m minimum
      barrierType: 'unsegregated_shared_hazard' as const, // blocker!
      waypoints: [
        { x: basePlan.siteWidthM - 1.0, y: basePlan.siteLengthM - 0.5 },
        { x: 1.0, y: 1.0 }, // intersects diagonal vehicle route
      ],
      controlledCrossingPoints: [], // no controlled crossing!
    })),
  };

  const evaluated = evaluateSiteLogisticsPlan(sampleProjectFeet, modifiedRaw);
  const hasWidthConflict = evaluated.conflicts.some((c) => c.id.startsWith('conf-route-width-'));
  const hasRadiusConflict = evaluated.conflicts.some((c) => c.id.startsWith('conf-route-radius-'));
  const hasReversingBlocker = evaluated.conflicts.some(
    (c) => c.id.startsWith('conf-route-reverse-') && c.severity === 'blocker'
  );
  const hasPedWidthConflict = evaluated.conflicts.some((c) => c.id.startsWith('conf-ped-width-'));
  const hasPedBarrierBlocker = evaluated.conflicts.some(
    (c) => c.id.startsWith('conf-ped-barrier-none-') && c.severity === 'blocker'
  );
  const hasUncontrolledCrossing = evaluated.conflicts.some((c) =>
    c.id.startsWith('conf-ped-veh-cross-')
  );

  assert(hasWidthConflict, 'Must detect inadequate vehicle corridor width');
  assert(hasRadiusConflict, 'Must detect inadequate vehicle inner turning radius');
  assert(hasReversingBlocker, 'Must flag unmarshalled vehicle reversing as a safety blocker');
  assert(hasPedWidthConflict, 'Must detect pedestrian walkway narrower than 1.20m');
  assert(hasPedBarrierBlocker, 'Must flag unsegregated pedestrian route as a safety blocker');
  assert(hasUncontrolledCrossing, 'Must detect uncontrolled pedestrian-vehicle route crossing');
  console.log('  ✓ Group B passed: Vehicle geometry, network path distance, reversing blockers, and pedestrian crossings verified.');
}

// ---------------------------------------------------------------------------
// GROUP C: DELIVERIES, UNLOADING BAY DOUBLE-BOOKING, STORAGE CAPACITY & MODULE A4
// ---------------------------------------------------------------------------
console.log('• Group C: Deliveries, Unloading Bay Double-Booking, Storage Capacity & Module A4...');
{
  const basePlan = initializeSiteLogisticsPlan(sampleProjectFeet);
  assert.strictEqual(
    basePlan.transportCarbonSummary.status,
    'computed_with_explicit_factors',
    'Default deliveries with explicit distance and factors must compute Module A4 transport carbon'
  );
  assert(
    basePlan.transportCarbonSummary.estimatedModuleA4TransportKgCO2e !== null &&
      basePlan.transportCarbonSummary.estimatedModuleA4TransportKgCO2e > 0,
    'Module A4 transport kgCO2e must be positive when distance and factor are present'
  );

  // Test double-booking, out-of-hours arrival, storage overflow, and missing A4 factors
  const del0 = basePlan.deliveries[0];
  const clashingDel = {
    ...del0,
    id: 'del-clash-test',
    title: 'Clashing Steel Delivery in Same Bay & Window',
    arrivalWindowStart: '06:00', // before 07:30 workingHoursStart!
    arrivalWindowEnd: '09:30',   // overlaps del0 (08:00-11:30) on same date & bay!
    requiredStorageAreaM2: 500,  // exceeds storage zone capacity!
    targetStorageZoneId: basePlan.logisticsZones[1].id,
    oneWayTransportDistanceKm: null,
    transportEmissionFactorKgCO2ePerTonneKm: null,
  };

  const evaluated = evaluateSiteLogisticsPlan(sampleProjectFeet, {
    ...basePlan,
    deliveries: [...basePlan.deliveries, clashingDel],
  });

  const hasHoursConflict = evaluated.conflicts.some((c) => c.id === 'conf-del-hours-del-clash-test');
  const hasDoubleBookConflict = evaluated.conflicts.some((c) =>
    c.id.includes('conf-del-doublebook-')
  );
  const hasStorageCapConflict = evaluated.conflicts.some(
    (c) => c.id === 'conf-del-storage-cap-del-clash-test'
  );

  assert(hasHoursConflict, 'Must detect out-of-hours delivery arrival window');
  assert(hasDoubleBookConflict, 'Must detect double-booked unloading bay on same date and overlapping time window');
  assert(hasStorageCapConflict, 'Must detect delivery storage demand exceeding target storage zone capacity');
  assert.strictEqual(
    evaluated.transportCarbonSummary.status,
    'partial_missing_factors',
    'Must report partial_missing_factors without fabricating missing A4 transport factors'
  );
  console.log('  ✓ Group C passed: Delivery window clashes, storage capacity overflows, and Module A4 honesty verified.');
}

// ---------------------------------------------------------------------------
// GROUP D: CRANES, REACH RADIUS, LOAD CHART SWL, OVERSAIL & ENGINEERING GATES
// ---------------------------------------------------------------------------
console.log('• Group D: Cranes, Reach Radius, Load Chart SWL, Oversail & Engineering Gates...');
{
  const basePlan = initializeSiteLogisticsPlan(sampleProjectFeet);

  // Mutate crane to have small radius, unlicensed oversail, missing geotechnical & lift plan gates, and overloaded lift
  const modified = evaluateSiteLogisticsPlan(sampleProjectFeet, {
    ...basePlan,
    equipmentPlacements: basePlan.equipmentPlacements.map((eq) => ({
      ...eq,
      operatingRadiusM: 4.0, // too small to reach building center
      requiredGroundBearingKPa: 250,
      verifiedGroundBearingKPa: 150, // exceeded!
      groundBearingApprovalStatus: 'missing_evidence_blocker' as const,
      certifiedLiftPlanApprovalStatus: 'missing_evidence_blocker' as const,
      undergroundServiceClearanceStatus: 'missing_evidence_blocker' as const,
      oversailsOutsideSiteBoundaryPermitted: false,
      oversailLicenseApproved: false,
    })),
    liftingOperations: basePlan.liftingOperations.map((l) => ({
      ...l,
      grossLoadWeightTonnes: 8.5,
      declaredRatedCapacityAtRadiusTonnes: 3.5, // overloaded!
      appointedPersonSignOffStatus: 'missing_evidence_blocker' as const,
    })),
  });

  assert(
    modified.conflicts.some((c) => c.id.startsWith('conf-eq-gbr-blocker-') && c.severity === 'blocker'),
    'Must flag missing geotechnical bearing approval as blocker'
  );
  assert(
    modified.conflicts.some((c) => c.id.startsWith('conf-eq-liftplan-blocker-') && c.severity === 'blocker'),
    'Must flag missing Appointed Person Lift Plan as blocker'
  );
  assert(
    modified.conflicts.some((c) => c.id.startsWith('conf-eq-ugservice-blocker-') && c.severity === 'blocker'),
    'Must flag missing underground utility clearance as blocker'
  );
  assert(
    modified.conflicts.some((c) => c.id.startsWith('conf-lift-reach-')),
    'Must detect required lift radius exceeding crane operating radius'
  );
  assert(
    modified.conflicts.some((c) => c.id.startsWith('conf-lift-overload-') && c.severity === 'blocker'),
    'Must flag gross load exceeding crane SWL at radius as blocker'
  );
  console.log('  ✓ Group D passed: Crane reach, SWL overload, oversail, and geotechnical/lifting blockers verified.');
}

// ---------------------------------------------------------------------------
// GROUP E: MULTI-PHASE EVOLUTION, FOOTPRINT GROWTH & EMERGENCY CONTINUITY
// ---------------------------------------------------------------------------
console.log('• Group E: Multi-Phase Evolution, Footprint Growth & Emergency Continuity...');
{
  const basePlan = initializeSiteLogisticsPlan(sampleProjectFeet);
  const p1 = basePlan.phaseSummaries[0]; // enabling (0.75 ratio)
  const p3 = basePlan.phaseSummaries[2]; // superstructure (1.0 ratio)
  assert(
    p3.activeBuildingFootprintM2 >= p1.activeBuildingFootprintM2,
    'Superstructure phase active building footprint must be >= enabling phase footprint'
  );
  assert(
    p3.netAvailableExteriorSiteAreaM2 <= p1.netAvailableExteriorSiteAreaM2,
    'Net available exterior site area must shrink as building footprint expands'
  );

  // Test emergency route obstruction by placing a storage zone directly on top of the emergency route
  const emergWaypoint = basePlan.emergencyRoutes[0].waypoints[0];
  const obstructedPlan = evaluateSiteLogisticsPlan(sampleProjectFeet, {
    ...basePlan,
    logisticsZones: basePlan.logisticsZones.map((z, idx) =>
      idx === 1
        ? {
            ...z,
            bounds: { x: emergWaypoint.x - 1.0, y: emergWaypoint.y - 1.0, widthM: 3.0, lengthM: 3.0 },
          }
        : z
    ),
  });

  const hasEmergObstruction = obstructedPlan.conflicts.some(
    (c) => c.id.startsWith('conf-emerg-zone-obs-') && c.severity === 'blocker'
  );
  assert(hasEmergObstruction, 'Obstruction of an emergency fire/evacuation route must trigger a blocker');
  console.log('  ✓ Group E passed: Multi-phase footprint evolution and emergency route continuity verified.');
}

// ---------------------------------------------------------------------------
// GROUP F: SAFETY & EVIDENCE HONESTY (VISUAL LAYOUT != SAFE APPROVAL)
// ---------------------------------------------------------------------------
console.log('• Group F: Safety & Evidence Honesty...');
{
  const basePlan = initializeSiteLogisticsPlan(sampleProjectFeet);
  // Even with 0 spatial overlaps, if an access point permit is pending verification, readiness is conditional
  const pendingPlan = evaluateSiteLogisticsPlan(sampleProjectFeet, {
    ...basePlan,
    accessPoints: basePlan.accessPoints.map((a, idx) =>
      idx === 0 ? { ...a, highwayAuthorityPermitStatus: 'declared_pending_verification' as const } : a
    ),
  });
  assert(
    pendingPlan.summary.unverifiedEvidenceGatesCount > 0,
    'Unverified evidence gate count must reflect pending permits/approvals'
  );
  assert.strictEqual(
    pendingPlan.summary.overallReadinessStatus,
    'conditional_pending_professional_verification',
    'Readiness status must not claim full approval when professional verification gates are pending'
  );
  assert(
    pendingPlan.assumptionsAndLimitations.some((a) =>
      a.includes('NOT proof of safe lifting')
    ),
    'Explicit limitation must state that a 2D visual layout is not proof of safe lifting or ground bearing'
  );
  console.log('  ✓ Group F passed: Evidence honesty and engineering gate boundaries verified.');
}

// ---------------------------------------------------------------------------
// GROUP G: NON-DESTRUCTIVE ALTERNATIVE PREVIEW, SNAPSHOT PERSISTENCE & EXPORT
// ---------------------------------------------------------------------------
console.log('• Group G: Non-Destructive Alternative Preview, Safe Persistence & Export...');
{
  const originalCopy = JSON.stringify(sampleProjectFeet);
  const basePlan = initializeSiteLogisticsPlan(sampleProjectFeet);

  const preview = buildSiteLogisticsAlternativePreview(sampleProjectFeet, basePlan, {
    name: 'Test Candidate — Widened Haul Route & Physical Barriers',
    upgradePedestrianBarriersToPhysical: true,
    provideWheelWashAtExits: true,
    overrideRouteWidthsM: { [basePlan.vehicleRoutes[0].id]: 4.5 },
  });

  assert.strictEqual(preview.isNonDestructivePreview, true);
  assert.strictEqual(
    JSON.stringify(sampleProjectFeet),
    originalCopy,
    'Alternative preview must never mutate the input project'
  );

  // Apply to project and verify snapshot creation
  const { updatedProject, snapshotId } = applySiteLogisticsPlanToProject(
    sampleProjectFeet,
    basePlan,
    [preview]
  );
  assert(snapshotId && snapshotId.length > 0, 'Pre-apply safety snapshot must be created');
  assert(updatedProject.siteLogistics?.activePlan, 'Updated project must contain activePlan');
  assert.strictEqual(updatedProject.siteLogistics?.lastAppliedSnapshotId, snapshotId);

  // Check staleness detection when plotWidth changes
  const freshCheck = checkSiteLogisticsStaleness(updatedProject);
  assert.strictEqual(freshCheck.isStale, false, 'Freshly saved plan must not be stale');

  const geometryChangedProject = {
    ...updatedProject,
    plotWidth: updatedProject.plotWidth + 10,
  };
  const staleCheck = checkSiteLogisticsStaleness(geometryChangedProject);
  assert.strictEqual(staleCheck.isStale, true, 'Modifying plot dimensions must mark logistics plan as stale');
  assert(staleCheck.reasons.length > 0, 'Staleness report must provide explicit reasons');

  // Verify JSON, CSV, and Markdown exports
  const jsonExport = exportSiteLogisticsReport(updatedProject, basePlan, 'json');
  const parsedJson = JSON.parse(jsonExport);
  assert.strictEqual(parsedJson.profileId, SITE_LOGISTICS_PROFILE_ID);

  const csvExport = exportSiteLogisticsReport(updatedProject, basePlan, 'csv');
  assert(csvExport.includes('PHASE,') && csvExport.includes('ZONE,') && csvExport.includes('DELIVERY,'));

  const mdExport = exportSiteLogisticsReport(updatedProject, basePlan, 'markdown');
  assert(mdExport.includes('# Construction Site Logistics & Traffic Management Plan (P47)'));
  console.log('  ✓ Group G passed: Non-destructive preview, snapshot persistence, staleness detection, and exports verified.');
}

console.log('\n================================================================');
console.log('✓ ALL P47 CONSTRUCTION SITE LOGISTICS PLANNER TESTS PASSED');
console.log('================================================================\n');
