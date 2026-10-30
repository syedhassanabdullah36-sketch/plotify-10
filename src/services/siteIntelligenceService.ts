import { Project, FloorPlanRoom, RoadFacingSide } from '../types/project';
import {
  SiteContextData,
  SiteAccessPoint,
  SiteObstacle,
  NeighborContext,
  SiteSetbacks,
  BuildingPlacementBounds,
  SiteConstraintCheck,
  SolarOrientationAnalysis,
} from '../types/siteContext';

/**
 * Initializes or normalizes site context for a project, ensuring full backward compatibility
 */
export function initializeProjectSiteContext(project: Project): SiteContextData {
  if (project.siteContext) {
    return {
      ...project.siteContext,
      setbacks: project.siteContext.setbacks || getDefaultSetbacks(project),
      accessPoints: project.siteContext.accessPoints || [getDefaultAccessPoint(project)],
      obstacles: project.siteContext.obstacles || [],
      neighbors: project.siteContext.neighbors || getDefaultNeighbors(),
      environmental: project.siteContext.environmental || getDefaultEnvironmental(project),
      photos: project.siteContext.photos || [],
      updatedAt: project.siteContext.updatedAt || new Date().toISOString(),
    };
  }

  return {
    siteName: `${project.name} Parcel`,
    address: '',
    cityRegion: '',
    locationConfidence: 'user-observation',
    northOrientationOffsetDeg: getNorthAngleFromRoadFacing(project.roadFacing),
    slope: 'flat-under-2-pct',
    slopeDirection: 'None',
    levelDifferenceEstimate: 0,
    accessPoints: [getDefaultAccessPoint(project)],
    obstacles: [],
    neighbors: getDefaultNeighbors(),
    setbacks: getDefaultSetbacks(project),
    environmental: getDefaultEnvironmental(project),
    photos: [],
    generalNotes: '',
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Derives default setbacks in project measurement units
 */
export function getDefaultSetbacks(project: Project): SiteSetbacks {
  const isFeet = project.unit === 'feet';
  return {
    front: isFeet ? 15 : 4.5, // Standard municipal front yard setback
    rear: isFeet ? 10 : 3.0,
    sideLeft: isFeet ? 5 : 1.5,
    sideRight: isFeet ? 5 : 1.5,
    source: 'standard-guideline',
    notes: 'Default planning setbacks. Adjust based on local zoning regulations.',
  };
}

/**
 * Default vehicular and pedestrian access point aligned with road frontage
 */
export function getDefaultAccessPoint(project: Project): SiteAccessPoint {
  const isFeet = project.unit === 'feet';
  return {
    id: 'access-primary-01',
    type: 'vehicular',
    side: project.roadFacing,
    offsetAlongSide: Math.round(project.plotWidth * 0.35),
    width: isFeet ? 12 : 3.6,
    name: 'Main Vehicular Entrance Gate',
  };
}

/**
 * Default neighbor context across 4 cardinal directions
 */
export function getDefaultNeighbors(): NeighborContext[] {
  return [
    {
      side: 'North',
      description: 'Adjacent residential property',
      heightTiers: 'two-storey',
      privacyConcern: false,
      noiseExposure: false,
    },
    {
      side: 'South',
      description: 'Public road / access street',
      heightTiers: 'vacant-ground',
      privacyConcern: false,
      noiseExposure: true,
    },
    {
      side: 'East',
      description: 'Adjacent residential garden',
      heightTiers: 'single-storey',
      privacyConcern: false,
      noiseExposure: false,
    },
    {
      side: 'West',
      description: 'Neighbouring residential parcel',
      heightTiers: 'two-storey',
      privacyConcern: false,
      noiseExposure: false,
    },
  ];
}

/**
 * Default environmental baseline
 */
export function getDefaultEnvironmental(project: Project): {
  prevailingWindDirection: RoadFacingSide;
  primaryNoiseSource: string;
  primaryNoiseSide: RoadFacingSide;
} {
  return {
    prevailingWindDirection: 'South-West',
    primaryNoiseSource: 'Street traffic',
    primaryNoiseSide: project.roadFacing,
  };
}

/**
 * Derives nominal north angle (degrees) relative to plot top edge
 */
export function getNorthAngleFromRoadFacing(roadFacing: RoadFacingSide): number {
  switch (roadFacing) {
    case 'North':
      return 180; // Road at north, plot top faces North
    case 'South':
      return 0; // Road at south, plot top faces North
    case 'East':
      return 270;
    case 'West':
      return 90;
    case 'North-East':
      return 225;
    case 'North-West':
      return 135;
    case 'South-East':
      return 315;
    case 'South-West':
      return 45;
    default:
      return 0;
  }
}

/**
 * Deterministically computes the spatial bounding box of the ground floor building footprint
 */
export function computeBuildingPlacementBounds(project: Project): BuildingPlacementBounds {
  const rooms = (project.floorPlan?.rooms || []).filter((r) => (r.floorLevel || 1) === 1);

  if (rooms.length === 0) {
    return {
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
      width: 0,
      length: 0,
      groundArea: 0,
      hasRooms: false,
    };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let groundArea = 0;

  rooms.forEach((r) => {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.length);
    groundArea += r.width * r.length;
  });

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.round((maxX - minX) * 10) / 10,
    length: Math.round((maxY - minY) * 10) / 10,
    groundArea,
    hasRooms: true,
  };
}

/**
 * Evaluates spatial site constraints deterministically
 */
export function evaluateSiteConstraints(project: Project): SiteConstraintCheck[] {
  const site = initializeProjectSiteContext(project);
  const bounds = computeBuildingPlacementBounds(project);
  const checks: SiteConstraintCheck[] = [];
  const unitLabel = project.unit === 'feet' ? 'ft' : 'm';
  const unitAreaLabel = project.unit === 'feet' ? 'sq ft' : 'm²';

  // 1. Plot Parcel Boundary Enclosure Check
  if (!bounds.hasRooms) {
    checks.push({
      id: 'site-chk-boundary',
      category: 'boundary',
      title: 'Plot Parcel Boundary Enclosure',
      status: 'warning',
      details: 'No ground-level rooms placed. Place rooms on 2D floor plan to evaluate site boundary enclosure.',
      formulaOrRule: 'minX >= 0 ∧ minY >= 0 ∧ maxX <= plotWidth ∧ maxY <= plotLength',
      inputsUsed: {
        plotWidth: project.plotWidth,
        plotLength: project.plotLength,
        roomsCount: 0,
      },
      recommendation: 'Open 2D Floor Plan Editor to place ground-floor rooms within parcel boundaries.',
      requiresProfessionalReview: 'Physical Boundary Cadastral Survey',
    });
  } else {
    const exceedsLeft = bounds.minX < 0;
    const exceedsTop = bounds.minY < 0;
    const exceedsRight = bounds.maxX > project.plotWidth;
    const exceedsBottom = bounds.maxY > project.plotLength;
    const hasViolation = exceedsLeft || exceedsTop || exceedsRight || exceedsBottom;

    checks.push({
      id: 'site-chk-boundary',
      category: 'boundary',
      title: 'Plot Parcel Boundary Enclosure',
      status: hasViolation ? 'conflict' : 'pass',
      details: hasViolation
        ? `Building footprint protrudes beyond legal parcel boundary: Min X=${bounds.minX}${unitLabel}, Max X=${bounds.maxX}${unitLabel} (Parcel: 0 to ${project.plotWidth}${unitLabel}); Min Y=${bounds.minY}${unitLabel}, Max Y=${bounds.maxY}${unitLabel} (Parcel: 0 to ${project.plotLength}${unitLabel}).`
        : `Building footprint (${bounds.width} × ${bounds.length} ${unitLabel}, ${bounds.groundArea} ${unitAreaLabel}) is fully enclosed within parcel boundaries (${project.plotWidth} × ${project.plotLength} ${unitLabel}).`,
      formulaOrRule: 'minX >= 0 ∧ minY >= 0 ∧ maxX <= plotWidth ∧ maxY <= plotLength',
      inputsUsed: {
        footprintBounds: bounds,
        plotDimensions: { width: project.plotWidth, length: project.plotLength },
      },
      recommendation: hasViolation
        ? 'Relocate or resize protruding rooms to keep all walls within legal site boundaries.'
        : undefined,
      requiresProfessionalReview: 'Registered Land Surveyor & Project Architect',
    });
  }

  // 2. Setback Compliance Check
  if (!bounds.hasRooms) {
    checks.push({
      id: 'site-chk-setback',
      category: 'setback',
      title: 'Zoning & Access Setback Compliance',
      status: 'not-assessed',
      details: 'Pending room layout. Setback compliance will be calculated once building footprint is placed.',
      formulaOrRule: 'Building clearances >= Front, Rear, Side Setbacks',
      inputsUsed: { ...site.setbacks },
      requiresProfessionalReview: 'Municipal Zoning Ordinance Review',
    });
  } else {
    const s = site.setbacks;
    // Map road facing side to coordinate edge:
    // Standard convention: top edge (y=0) is Front for North road; bottom edge (y=plotLength) is Front for South road; etc.
    let frontClearance = bounds.minY;
    let rearClearance = project.plotLength - bounds.maxY;
    let sideLeftClearance = bounds.minX;
    let sideRightClearance = project.plotWidth - bounds.maxX;

    if (project.roadFacing.includes('South')) {
      frontClearance = project.plotLength - bounds.maxY;
      rearClearance = bounds.minY;
    } else if (project.roadFacing.includes('West')) {
      frontClearance = bounds.minX;
      rearClearance = project.plotWidth - bounds.maxX;
      sideLeftClearance = bounds.minY;
      sideRightClearance = project.plotLength - bounds.maxY;
    } else if (project.roadFacing.includes('East')) {
      frontClearance = project.plotWidth - bounds.maxX;
      rearClearance = bounds.minX;
      sideLeftClearance = bounds.minY;
      sideRightClearance = project.plotLength - bounds.maxY;
    }

    const frontViolation = frontClearance < s.front;
    const rearViolation = rearClearance < s.rear;
    const sideLeftViolation = sideLeftClearance < s.sideLeft;
    const sideRightViolation = sideRightClearance < s.sideRight;

    const violationsList: string[] = [];
    if (frontViolation) violationsList.push(`Front setback deficit: ${Math.round((s.front - frontClearance) * 10) / 10} ${unitLabel}`);
    if (rearViolation) violationsList.push(`Rear setback deficit: ${Math.round((s.rear - rearClearance) * 10) / 10} ${unitLabel}`);
    if (sideLeftViolation) violationsList.push(`Left side setback deficit: ${Math.round((s.sideLeft - sideLeftClearance) * 10) / 10} ${unitLabel}`);
    if (sideRightViolation) violationsList.push(`Right side setback deficit: ${Math.round((s.sideRight - sideRightClearance) * 10) / 10} ${unitLabel}`);

    checks.push({
      id: 'site-chk-setback',
      category: 'setback',
      title: 'Zoning & Access Setback Compliance',
      status: violationsList.length > 0 ? 'conflict' : 'pass',
      details: violationsList.length > 0
        ? `Footprint encroaches into designated setbacks: ${violationsList.join('; ')}.`
        : `Building clearances satisfy all designated setbacks (Front: ${Math.round(frontClearance * 10) / 10}/${s.front}${unitLabel}, Rear: ${Math.round(rearClearance * 10) / 10}/${s.rear}${unitLabel}, Sides: ${Math.round(sideLeftClearance * 10) / 10}/${s.sideLeft}${unitLabel} & ${Math.round(sideRightClearance * 10) / 10}/${s.sideRight}${unitLabel}).`,
      formulaOrRule: 'Actual Clearances >= Specified Setbacks',
      inputsUsed: {
        setbacksConfigured: s,
        clearancesObserved: { frontClearance, rearClearance, sideLeftClearance, sideRightClearance },
      },
      recommendation: violationsList.length > 0
        ? 'Shift building envelope inward to comply with front/rear/side setback buffers.'
        : undefined,
      requiresProfessionalReview: 'Governing Municipal Planning Authority',
    });
  }

  // 3. Obstacle & Existing Feature Clearance Check
  const obstacles = site.obstacles || [];
  if (obstacles.length === 0) {
    checks.push({
      id: 'site-chk-obstacle',
      category: 'obstacle',
      title: 'Existing Site Obstacles & Tree Preservation',
      status: 'pass',
      details: 'No existing site obstacles, protected trees, or easements recorded on this parcel.',
      formulaOrRule: 'Footprint ∩ Preserved Obstacles = ∅',
      inputsUsed: { obstaclesCount: 0 },
      requiresProfessionalReview: 'Site Arborist & Utility Locate Verification',
    });
  } else {
    const rooms = (project.floorPlan?.rooms || []).filter((r) => (r.floorLevel || 1) === 1);
    const conflicts: string[] = [];

    obstacles.forEach((obs) => {
      const isPreserved = obs.preservationStatus === 'preserve-mandatory' || obs.preservationStatus === 'preserve-preferred';
      if (!isPreserved) return;

      rooms.forEach((r) => {
        // AABB intersection check
        const overlapX = r.x < obs.x + obs.width && r.x + r.width > obs.x;
        const overlapY = r.y < obs.y + obs.length && r.y + r.length > obs.y;
        if (overlapX && overlapY) {
          conflicts.push(`Room "${r.name}" physically intersects protected feature "${obs.name}" (${obs.type})`);
        }
      });
    });

    checks.push({
      id: 'site-chk-obstacle',
      category: 'obstacle',
      title: 'Existing Site Obstacles & Tree Preservation',
      status: conflicts.length > 0 ? 'conflict' : 'pass',
      details: conflicts.length > 0
        ? `Spatial conflicts with preserved site features: ${conflicts.join('; ')}.`
        : `${obstacles.length} site feature(s) recorded; all protected elements maintain clear buffer from building footprint.`,
      formulaOrRule: 'Footprint ∩ Preserved Obstacles = ∅',
      inputsUsed: {
        obstaclesRecorded: obstacles.map((o) => ({ name: o.name, type: o.type, status: o.preservationStatus })),
        conflictsCount: conflicts.length,
      },
      recommendation: conflicts.length > 0
        ? 'Adjust building footprint to avoid protected root systems or utility easements.'
        : undefined,
      requiresProfessionalReview: 'Certified Consulting Arborist & Municipal Tree Officer',
    });
  }

  // 4. Access Alignment Check
  const accessPoints = site.accessPoints || [];
  const roadFacingSide = project.roadFacing;
  const accessOnRoad = accessPoints.some((a) => a.side === roadFacingSide);

  checks.push({
    id: 'site-chk-access',
    category: 'access',
    title: 'Site Access & Vehicular Approach',
    status: accessOnRoad ? 'pass' : 'warning',
    details: accessOnRoad
      ? `Primary site access (${accessPoints.find((a) => a.side === roadFacingSide)?.name}) is properly situated on designated road frontage (${roadFacingSide}).`
      : `No access point is currently placed along the designated primary road facing side (${roadFacingSide}). Access configuration requires verification.`,
    formulaOrRule: 'Primary Access Side == Primary Road Facing Frontage',
    inputsUsed: {
      roadFacingSide,
      accessPointsCount: accessPoints.length,
      accessPoints: accessPoints.map((a) => ({ name: a.name, side: a.side, type: a.type })),
    },
    recommendation: !accessOnRoad
      ? `Add an access point along ${roadFacingSide} frontage in the Site & Context workspace.`
      : undefined,
    requiresProfessionalReview: 'Civil Highway & Municipal Access Engineer',
  });

  // 5. Topography & Slope Evaluation
  const slope = site.slope;
  const isSteepOrModerate = slope === 'moderate-5-to-10-pct' || slope === 'steep-over-10-pct';

  checks.push({
    id: 'site-chk-topography',
    category: 'topography',
    title: 'Topography & Surface Drainage Assessment',
    status: isSteepOrModerate ? 'warning' : 'pass',
    details: isSteepOrModerate
      ? `Parcel exhibits ${slope.replace(/-/g, ' ')} (${site.slopeDirection !== 'None' ? `sloping towards ${site.slopeDirection}` : 'variable'}). Stepped strip foundations, cut-and-fill grading, or retaining walls may be required.`
      : `Parcel has ${slope.replace(/-/g, ' ')}, suitable for standard slab-on-grade or standard strip foundation construction.`,
    formulaOrRule: 'Slope Classification & Stepped Footing Invariant',
    inputsUsed: {
      slope: site.slope,
      slopeDirection: site.slopeDirection,
      levelDifference: site.levelDifferenceEstimate,
    },
    recommendation: isSteepOrModerate
      ? 'Commission a professional topographic contour survey and soil percolation test.'
      : undefined,
    requiresProfessionalReview: 'Geotechnical & Structural Foundation Engineer',
  });

  return checks;
}

/**
 * Deterministically evaluates solar orientation, sun trajectories, and passive heating/cooling
 */
export function evaluateSolarOrientation(project: Project): SolarOrientationAnalysis {
  const site = initializeProjectSiteContext(project);
  const northOffset = site.northOrientationOffsetDeg;

  // Compute facade solar exposure based on north rotation
  // Facade orientations:
  // North facade (top edge rotated by northOffset)
  const normDeg = ((northOffset % 360) + 360) % 360;

  let northExposure: 'shaded-ambient' | 'diffuse-daylight' | 'moderate' = 'diffuse-daylight';
  let southExposure: 'direct-high-solar-gain' | 'moderate' | 'limited' = 'direct-high-solar-gain';
  let eastExposure: 'morning-sun-light' | 'moderate' | 'shaded' = 'morning-sun-light';
  let westExposure: 'afternoon-heat-glare-risk' | 'moderate' | 'shaded' = 'afternoon-heat-glare-risk';

  // If north is pointing down (~180°), reverse north/south
  if (normDeg > 135 && normDeg < 225) {
    northExposure = 'moderate';
    southExposure = 'moderate';
  }

  const recommendations: string[] = [];
  recommendations.push(
    'Maximize south-facing fenestration (with overhangs) to capture low winter solar heat while blocking high summer sun.'
  );
  recommendations.push(
    'Position morning-use rooms (e.g., breakfast dining, master bedrooms) towards East/South-East for natural circadian daylight.'
  );
  recommendations.push(
    'Incorporate solar control louvers or deep brise-soleil on West facades to minimize late-afternoon thermal glare and cooling loads.'
  );
  recommendations.push(
    'Locate service, utility, and garage spaces along cooler North-facing elevations as thermal buffer zones.'
  );

  const acousticRecommendations: string[] = [];
  if (site.environmental.primaryNoiseSource) {
    acousticRecommendations.push(
      `Primary noise source identified as "${site.environmental.primaryNoiseSource}" on ${site.environmental.primaryNoiseSide || project.roadFacing} side. Specify acoustic laminated double glazing (STC ≥ 35) on facing elevations.`
    );
  }

  return {
    northOrientationOffsetDeg: normDeg,
    solarOrientationDescription: `Plot top edge rotated ${normDeg}° relative to True North. Primary road frontage faces ${project.roadFacing}.`,
    facadeSunExposure: {
      northFacade: northExposure,
      southFacade: southExposure,
      eastFacade: eastExposure,
      westFacade: westExposure,
    },
    passiveSolarRecommendations: recommendations,
    crossVentilationFeasibility: 'high',
    acousticBufferRecommendations: acousticRecommendations,
  };
}
