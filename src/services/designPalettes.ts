import { FacadeConcept, InteriorRoomConcept, DesignAlternative, Project, FloorPlanRoom } from '../types/project';

export interface MaterialSwatch {
  id: string;
  name: string;
  type: 'exterior' | 'interior-wall' | 'interior-floor';
  hex: string;
  roughness: number;
  metalness: number;
  description: string;
  bestPairing: string;
}

export const EXTERIOR_MATERIALS: Array<{
  id: FacadeConcept['primaryMaterial'];
  label: string;
  description: string;
  defaultHex: string;
  roughness: number;
  textureHint: string;
}> = [
  {
    id: 'plaster',
    label: 'Architectural Stucco / Plaster',
    description: 'Crisp monolithic mineral finish with fine grain texture and clean light-reflective surface.',
    defaultHex: '#f8fafc',
    roughness: 0.9,
    textureHint: 'Smooth mineral skim-coat',
  },
  {
    id: 'brick',
    label: 'Linear Facing Brick',
    description: 'Textured horizontal kiln-fired clay masonry with warm terracotta and earth tones.',
    defaultHex: '#b45309',
    roughness: 0.88,
    textureHint: 'Long-format Roman clay bricks',
  },
  {
    id: 'stone',
    label: 'Natural Ashlar Stone',
    description: 'Honed limestone or slate cladding with natural veining and timeless durability.',
    defaultHex: '#d6d3d1',
    roughness: 0.82,
    textureHint: 'Precision-sawn rectilinear stone',
  },
  {
    id: 'concrete',
    label: 'Board-Formed Concrete',
    description: 'Exposed architectural fair-faced concrete with subtle timber tie-hole indentations.',
    defaultHex: '#94a3b8',
    roughness: 0.78,
    textureHint: 'Architectural cast-in-place concrete',
  },
  {
    id: 'timber',
    label: 'Thermal Wood / Cedar Siding',
    description: 'Vertical thermally modified timber rainscreen with natural warm wood grain.',
    defaultHex: '#b4845c',
    roughness: 0.65,
    textureHint: 'Vertical open-jointed cedar battens',
  },
  {
    id: 'glass',
    label: 'Structural Glass Curtain Wall',
    description: 'Low-iron architectural glazing with slimline thermal break mullions.',
    defaultHex: '#38bdf8',
    roughness: 0.1,
    textureHint: 'Double-glazed solar control panels',
  },
];

export const FACADE_STYLES: Array<{
  id: FacadeConcept['style'];
  label: string;
  description: string;
  recommendedMaterials: string;
  historicalContext: string;
}> = [
  {
    id: 'Modern',
    label: 'Modern',
    description: 'Geometric rectilinear volumes, flat or low-pitch roofs, cantilevered overhangs, and continuous ribbon windows.',
    recommendedMaterials: 'Board-formed concrete, dark metal cladding, and glass curtain walls.',
    historicalContext: 'Rooted in Bauhaus and mid-20th-century functionalism.',
  },
  {
    id: 'Contemporary',
    label: 'Contemporary',
    description: 'Fluid organic massing, asymmetrical facades, warm mixed materials, and integrated passive biophilic design.',
    recommendedMaterials: 'Charcoal zinc panels, cedar siding, and large format limestone.',
    historicalContext: 'Current global architectural practice focusing on light and sustainable envelopes.',
  },
  {
    id: 'Minimalist',
    label: 'Minimalist',
    description: 'Purist planar compositions, concealed joints, hidden gutters, and deep focus on shadow lines and negative space.',
    recommendedMaterials: 'Crisp white lime plaster, honed light stone, and frameless flush glazing.',
    historicalContext: 'Inspired by Japanese spatial philosophy and Swiss reductionist architecture.',
  },
  {
    id: 'Traditional',
    label: 'Traditional',
    description: 'Pitched gables, symmetrical window bays, articulated cornices, and tactile natural masonry.',
    recommendedMaterials: 'Classic handmade brickwork, slate roofing, and framed casement windows.',
    historicalContext: 'Reflecting regional craftsmanship and classical residential proportions.',
  },
  {
    id: 'Industrial',
    label: 'Industrial',
    description: 'Exposed structural steel columns, black divided-light warehouse glazing, and reclaimed weathered brickwork.',
    recommendedMaterials: 'Weathered Corten steel, dark brick, and wire-cast glass.',
    historicalContext: 'Originating from urban loft conversions and industrial manufacturing architecture.',
  },
  {
    id: 'Mediterranean',
    label: 'Mediterranean',
    description: 'Thick insulating thermal walls, arched porticos, warm terracotta accents, and sheltered courtyard shading.',
    recommendedMaterials: 'Textured earthy lime wash, terracotta tile trims, and natural sandstone.',
    historicalContext: 'Climate-responsive architecture of coastal Southern Europe and the Aegean.',
  },
];

export const CURATED_FACADE_PALETTES = [
  {
    name: 'Nordic Cedar & Matte Slate',
    style: 'Modern' as const,
    primaryMaterial: 'timber' as const,
    accentMaterial: 'stone' as const,
    primaryColor: '#b4845c',
    accentColor: '#475569',
    windowTrimColor: '#1e293b',
    roofTrimColor: '#0f172a',
    costTier: 'High-End Architectural' as const,
    shadingStyle: 'deep-overhangs' as const,
    windowStyle: 'floor-to-ceiling' as const,
    entranceStyle: 'canopy-cantilever' as const,
  },
  {
    name: 'Mineral White & Warm Travertine',
    style: 'Minimalist' as const,
    primaryMaterial: 'plaster' as const,
    accentMaterial: 'stone' as const,
    primaryColor: '#f8fafc',
    accentColor: '#d6d3d1',
    windowTrimColor: '#334155',
    roofTrimColor: '#cbd5e1',
    costTier: 'Balanced Mid-Range' as const,
    shadingStyle: 'motorized-louvers' as const,
    windowStyle: 'frameless-minimal' as const,
    entranceStyle: 'recessed-portal' as const,
  },
  {
    name: 'Brutalist Raw Concrete & Smoked Glass',
    style: 'Industrial' as const,
    primaryMaterial: 'concrete' as const,
    accentMaterial: 'glass' as const,
    primaryColor: '#94a3b8',
    accentColor: '#0f172a',
    windowTrimColor: '#020617',
    roofTrimColor: '#334155',
    costTier: 'High-End Architectural' as const,
    shadingStyle: 'brise-soleil' as const,
    windowStyle: 'ribbon-horizontal' as const,
    entranceStyle: 'minimal-pivot' as const,
  },
  {
    name: 'Terracotta Earth & Coastal Lime',
    style: 'Mediterranean' as const,
    primaryMaterial: 'brick' as const,
    accentMaterial: 'plaster' as const,
    primaryColor: '#c2410c',
    accentColor: '#fef3c7',
    windowTrimColor: '#78350f',
    roofTrimColor: '#9a3412',
    costTier: 'Balanced Mid-Range' as const,
    shadingStyle: 'timber-pergola' as const,
    windowStyle: 'divided-pane' as const,
    entranceStyle: 'timber-porch' as const,
  },
];

export const INTERIOR_FLOOR_FINISHES: Array<{
  id: InteriorRoomConcept['floorFinish'];
  label: string;
  hex: string;
  description: string;
}> = [
  {
    id: 'light-oak-plank',
    label: 'White Oak Engineered Timber',
    hex: '#d4b996',
    description: 'Wide plank European white oak with subtle wire-brushed matte oil finish.',
  },
  {
    id: 'smoked-walnut',
    label: 'Smoked American Walnut',
    hex: '#5c4033',
    description: 'Deep grain rich dark walnut offering luxurious acoustic damping and warmth.',
  },
  {
    id: 'polished-concrete',
    label: 'Honed Architectural Concrete',
    hex: '#94a3b8',
    description: 'Satin-finish screed with aggregate exposure, ideal for radiant underfloor heating.',
  },
  {
    id: 'honed-travertine',
    label: 'Vein-Cut Honed Travertine',
    hex: '#ede5d8',
    description: 'Warm cream natural porous stone filled and honed for timeless tactile elegance.',
  },
  {
    id: 'terrazzo-aggregate',
    label: 'Custom Venetian Terrazzo',
    hex: '#e2e8f0',
    description: 'Marble and quartz chips bound in mineral cement with seamless high-durability surface.',
  },
];

export const INTERIOR_WALL_FINISHES: Array<{
  id: InteriorRoomConcept['wallFinish'];
  label: string;
  defaultHex: string;
  description: string;
}> = [
  {
    id: 'matte-plaster',
    label: 'Ultra-Matte Mineral Plaster',
    defaultHex: '#f8fafc',
    description: 'Zero-sheen chalky surface absorbing glare and softening wall shadows.',
  },
  {
    id: 'limewash-mineral',
    label: 'Artisanal Breathable Limewash',
    defaultHex: '#f1f5f9',
    description: 'Textured cloud-like patina with organic tonal variations and natural breathability.',
  },
  {
    id: 'timber-slats',
    label: 'Acoustic White Oak Slats',
    defaultHex: '#c2a679',
    description: 'Vertical natural wood acoustic panelling with felt backing for sound absorption.',
  },
  {
    id: 'exposed-brick',
    label: 'Cleaned Architectural Brick',
    defaultHex: '#b45309',
    description: 'Feature masonry wall providing tactile weight and historic loft character.',
  },
  {
    id: 'acoustic-felt',
    label: 'Recycled PET Acoustic Fabric',
    defaultHex: '#cbd5e1',
    description: 'Textile-wrapped sound-dampening architectural wall panels.',
  },
];

export const INTERIOR_STYLES: Array<{
  id: InteriorRoomConcept['style'];
  label: string;
  description: string;
}> = [
  {
    id: 'Scandinavian',
    label: 'Scandinavian',
    description: 'Light woods, crisp white walls, functional simplicity, natural daylight emphasis, and cozy hygge accents.',
  },
  {
    id: 'Japandi',
    label: 'Japandi (Wabi-Sabi)',
    description: 'Harmonious fusion of Scandinavian functionality and Japanese rustic minimalism; low profiles and earthy craftsmanship.',
  },
  {
    id: 'Minimalist',
    label: 'Minimalist',
    description: 'Strict reduction of visual clutter, flush door jambs, hidden storage, clean light reveals, and curated statement pieces.',
  },
  {
    id: 'Modern Luxury',
    label: 'Modern Luxury',
    description: 'Rich bookmatched marble, bronze architectural trim, velvet textiles, integrated cove illumination, and bespoke millwork.',
  },
  {
    id: 'Warm Contemporary',
    label: 'Warm Contemporary',
    description: 'Welcoming layered textures, rounded organic furniture silhouettes, warm neutral palettes, and tactile linen drapery.',
  },
  {
    id: 'Industrial Chic',
    label: 'Industrial Chic',
    description: 'Exposed structural ductwork and concrete columns balanced with soft leather seating, blackened steel, and gallery lighting.',
  },
];

/**
 * Creates default initial room interior concept
 */
export function createDefaultRoomConcept(room: FloorPlanRoom, styleVariant: 'A' | 'B' = 'A'): InteriorRoomConcept {
  const isVariantA = styleVariant === 'A';
  return {
    roomId: room.id,
    roomName: room.name,
    style: isVariantA ? 'Scandinavian' : 'Warm Contemporary',
    paletteName: isVariantA ? 'Nordic White Oak & Light Plaster' : 'Warm Clay & Smoked Walnut',
    wallColor: isVariantA ? '#f8fafc' : '#f1f5f9',
    wallFinish: isVariantA ? 'limewash-mineral' : 'matte-plaster',
    floorFinish: isVariantA ? 'light-oak-plank' : 'smoked-walnut',
    ceilingFinish: 'smooth-white',
    furnitureStyle: isVariantA ? 'scandinavian-clean' : 'modular-italian',
    lightingMood: isVariantA ? 'natural-zenithal' : 'warm-ambient-2700k',
    storageStyle: 'floor-to-ceiling-concealed',
    designPriority: isVariantA ? 'simplicity' : 'functionality',
    notes: `Tailored for ${room.name} (${room.width}×${room.length} area). Focus on daylight distribution and uncluttered flow.`,
  };
}

/**
 * Creates a default design alternative for a project
 */
export function createDefaultDesignAlternative(
  project: Project,
  name: string,
  variant: 'A' | 'B' | 'C' = 'A'
): DesignAlternative {
  const rooms = project.floorPlan?.rooms || [];
  const interiors: Record<string, InteriorRoomConcept> = {};

  rooms.forEach((r) => {
    interiors[r.id] = createDefaultRoomConcept(r, variant === 'B' ? 'B' : 'A');
  });

  const now = new Date().toISOString();

  if (variant === 'A') {
    return {
      id: `alt-${Date.now()}-A`,
      name,
      description: 'Nordic timber rainscreen combined with honed slate base and continuous glass openings.',
      createdAt: now,
      facade: {
        style: 'Modern',
        primaryMaterial: 'timber',
        accentMaterial: 'stone',
        paletteName: 'Nordic Cedar & Matte Slate',
        primaryColor: '#b4845c',
        accentColor: '#475569',
        windowTrimColor: '#1e293b',
        roofTrimColor: '#0f172a',
        windowStyle: 'floor-to-ceiling',
        entranceStyle: 'canopy-cantilever',
        shadingStyle: 'deep-overhangs',
        elevationView: 'perspective',
        costTier: 'High-End Architectural',
        notes: `Design focuses on natural wood warmth balanced with slate base for durability against moisture. Solar shading configured for ${project.roadFacing} orientation.`,
      },
      interiors,
    };
  }

  if (variant === 'B') {
    return {
      id: `alt-${Date.now()}-B`,
      name,
      description: 'Minimalist white mineral plaster with dark charcoal accents and flush frameless glazing.',
      createdAt: now,
      facade: {
        style: 'Minimalist',
        primaryMaterial: 'plaster',
        accentMaterial: 'concrete',
        paletteName: 'Mineral White & Architectural Concrete',
        primaryColor: '#f8fafc',
        accentColor: '#94a3b8',
        windowTrimColor: '#334155',
        roofTrimColor: '#cbd5e1',
        windowStyle: 'frameless-minimal',
        entranceStyle: 'recessed-portal',
        shadingStyle: 'motorized-louvers',
        elevationView: 'front-elevation',
        costTier: 'Balanced Mid-Range',
        notes: 'Monolithic plaster skin with recessed portal entrance. High light reflectivity reduces cooling loads.',
      },
      interiors,
    };
  }

  return {
    id: `alt-${Date.now()}-C`,
    name,
    description: 'Contemporary clay brickwork with raw steel accents and expansive divided-pane windows.',
    createdAt: now,
    facade: {
      style: 'Industrial',
      primaryMaterial: 'brick',
      accentMaterial: 'concrete',
      paletteName: 'Linear Terracotta & Exposed Concrete',
      primaryColor: '#b45309',
      accentColor: '#64748b',
      windowTrimColor: '#0f172a',
      roofTrimColor: '#1e293b',
      windowStyle: 'divided-pane',
      entranceStyle: 'minimal-pivot',
      shadingStyle: 'brise-soleil',
      elevationView: 'perspective',
      costTier: 'Balanced Mid-Range',
      notes: 'Tactile Roman brickwork offering high thermal mass and rich weathering resistance over time.',
    },
    interiors,
  };
}
