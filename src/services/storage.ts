import { Project, AppSettings } from '../types/project';
import { safeStorageSetItem } from './storageGuard';
import { safeJsonParse } from '../utils/securityUtils';

const PROJECTS_STORAGE_KEY = 'architecture_intelligence_os_projects_v1';
const SETTINGS_STORAGE_KEY = 'architecture_intelligence_os_settings_v1';

export const INITIAL_SAMPLE_PROJECTS: Project[] = [
  {
    id: 'proj-001',
    name: 'The Highridge Residence',
    projectType: 'house',
    plotWidth: 50,
    plotLength: 90,
    unit: 'feet',
    roadFacing: 'North',
    floors: 2,
    rooms: {
      bedrooms: 4,
      bathrooms: 3,
      kitchen: 1,
      livingRoom: 2,
      diningRoom: 1,
      homeOffice: 1,
      balcony: 2,
      garage: 2,
      laundry: 1,
      storage: 1,
      customRooms: [{ name: 'Wine Cellar', count: 1 }],
    },
    floorPlan: {
      rooms: [
        {
          id: 'room-hr-01',
          name: 'Main Living Room',
          type: 'living',
          x: 5,
          y: 8,
          width: 18,
          length: 22,
          color: '#f1f5f9',
          floorLevel: 1,
        },
        {
          id: 'room-hr-02',
          name: 'Kitchen & Pantry',
          type: 'kitchen',
          x: 25,
          y: 8,
          width: 14,
          length: 16,
          color: '#fef3c7',
          floorLevel: 1,
        },
        {
          id: 'room-hr-03',
          name: 'Dining Hall',
          type: 'dining',
          x: 25,
          y: 26,
          width: 14,
          length: 14,
          color: '#f3e8ff',
          floorLevel: 1,
        },
        {
          id: 'room-hr-04',
          name: 'Home Office',
          type: 'office',
          x: 5,
          y: 32,
          width: 12,
          length: 14,
          color: '#e0e7ff',
          floorLevel: 1,
        },
        {
          id: 'room-hr-05',
          name: 'Guest Bathroom',
          type: 'bathroom',
          x: 19,
          y: 32,
          width: 8,
          length: 10,
          color: '#ccfbf1',
          floorLevel: 1,
        },
        {
          id: 'room-hr-06',
          name: 'Master Suite',
          type: 'bedroom',
          x: 6,
          y: 10,
          width: 18,
          length: 20,
          color: '#e0f2fe',
          floorLevel: 2,
        },
        {
          id: 'room-hr-07',
          name: 'Master Bathroom',
          type: 'bathroom',
          x: 26,
          y: 10,
          width: 10,
          length: 12,
          color: '#ccfbf1',
          floorLevel: 2,
        },
        {
          id: 'room-hr-08',
          name: 'Bedroom 2',
          type: 'bedroom',
          x: 6,
          y: 32,
          width: 14,
          length: 15,
          color: '#e0f2fe',
          floorLevel: 2,
        },
      ],
      gridSnap: 0.5,
      showGrid: true,
    },
    budget: 680000,
    currency: 'USD',
    notes: 'Sloped terrain with 4-foot drop towards rear. Maximize natural daylight from East elevation. Client requests double-height ceiling in main living area.',
    status: 'Schematic Design',
    activeAlternativeId: 'alt-001-a',
    applyDesignTo3D: true,
    designAlternatives: [
      {
        id: 'alt-001-a',
        name: 'Option A — Nordic Timber & Slate',
        description: 'Warm vertical cedar battens with honed slate foundation base and cantilevered solar shading.',
        createdAt: '2026-10-18T10:00:00.000Z',
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
          notes: 'Cedar cladding naturally treated for UV resistance. 3-foot overhang on North/East facades.',
        },
        interiors: {
          'room-hr-01': {
            roomId: 'room-hr-01',
            roomName: 'Main Living Room',
            style: 'Scandinavian',
            paletteName: 'Warm White Oak & Plaster',
            wallColor: '#f8fafc',
            wallFinish: 'limewash-mineral',
            floorFinish: 'light-oak-plank',
            ceilingFinish: 'smooth-white',
            furnitureStyle: 'scandinavian-clean',
            lightingMood: 'natural-zenithal',
            storageStyle: 'floor-to-ceiling-concealed',
            designPriority: 'simplicity',
            notes: 'Spacious open double-height layout with natural light washed against limewash plaster.',
          },
          'room-hr-02': {
            roomId: 'room-hr-02',
            roomName: 'Kitchen & Pantry',
            style: 'Modern Luxury',
            paletteName: 'Smoked Walnut & Quartzite',
            wallColor: '#f1f5f9',
            wallFinish: 'matte-plaster',
            floorFinish: 'polished-concrete',
            ceilingFinish: 'recessed-cove',
            furnitureStyle: 'built-in-bespoke',
            lightingMood: 'gallery-directional-3000k',
            storageStyle: 'floor-to-ceiling-concealed',
            designPriority: 'functionality',
            notes: 'Concealed handleless cabinetry with monolithic waterfall stone island.',
          },
        },
      },
      {
        id: 'alt-001-b',
        name: 'Option B — Minimalist Stucco & Charcoal',
        description: 'Crisp monolithic white mineral plaster envelope with dark anodized aluminum reveals and motorized louvers.',
        createdAt: '2026-10-19T14:30:00.000Z',
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
          notes: 'High solar reflectance plaster surface reducing thermal load. Frameless glazing flush with outer wall.',
        },
        interiors: {
          'room-hr-01': {
            roomId: 'room-hr-01',
            roomName: 'Main Living Room',
            style: 'Minimalist',
            paletteName: 'Monochrome Travertine & Slate',
            wallColor: '#f8fafc',
            wallFinish: 'matte-plaster',
            floorFinish: 'honed-travertine',
            ceilingFinish: 'smooth-white',
            furnitureStyle: 'minimalist-low',
            lightingMood: 'recessed-linear-cove',
            storageStyle: 'floor-to-ceiling-concealed',
            designPriority: 'simplicity',
            notes: 'Low profile linear seating and perimeter acoustic shadow gaps.',
          },
        },
      },
    ],
    createdAt: '2026-09-14T10:30:00.000Z',
    updatedAt: '2026-10-18T14:15:00.000Z',
  },
  {
    id: 'proj-002',
    name: 'Metropolitan Terraced Penthouse',
    projectType: 'apartment',
    plotWidth: 22,
    plotLength: 35,
    unit: 'metres',
    roadFacing: 'South',
    floors: 1,
    rooms: {
      bedrooms: 3,
      bathrooms: 2,
      kitchen: 1,
      livingRoom: 1,
      diningRoom: 1,
      homeOffice: 1,
      balcony: 1,
      garage: 0,
      laundry: 1,
    },
    floorPlan: {
      rooms: [
        {
          id: 'room-mp-01',
          name: 'Living Space',
          type: 'living',
          x: 2,
          y: 3,
          width: 8,
          length: 10,
          color: '#f1f5f9',
          floorLevel: 1,
        },
        {
          id: 'room-mp-02',
          name: 'Kitchen & Dining',
          type: 'kitchen',
          x: 11,
          y: 3,
          width: 6,
          length: 8,
          color: '#fef3c7',
          floorLevel: 1,
        },
        {
          id: 'room-mp-03',
          name: 'Primary Bedroom',
          type: 'bedroom',
          x: 2,
          y: 15,
          width: 6,
          length: 7,
          color: '#e0f2fe',
          floorLevel: 1,
        },
        {
          id: 'room-mp-04',
          name: 'Bathroom',
          type: 'bathroom',
          x: 9,
          y: 15,
          width: 4,
          length: 5,
          color: '#ccfbf1',
          floorLevel: 1,
        },
      ],
      gridSnap: 0.5,
      showGrid: true,
    },
    budget: 450000,
    currency: 'EUR',
    notes: 'Urban retrofit with cantilevered balcony on south facade. Preserving existing structural concrete columns.',
    status: 'Concept Feasibility',
    createdAt: '2026-10-02T08:00:00.000Z',
    updatedAt: '2026-10-19T11:45:00.000Z',
  },
  {
    id: 'proj-003',
    name: 'Coastal Pavilion Studio',
    projectType: 'other',
    customProjectType: 'Studio & Guest Annex',
    plotWidth: 35,
    plotLength: 60,
    unit: 'feet',
    roadFacing: 'West',
    floors: 1,
    rooms: {
      bedrooms: 1,
      bathrooms: 1,
      kitchen: 1,
      livingRoom: 1,
      diningRoom: 0,
      homeOffice: 1,
      balcony: 1,
      garage: 0,
      laundry: 0,
    },
    floorPlan: {
      rooms: [
        {
          id: 'room-cp-01',
          name: 'Open Studio Living',
          type: 'living',
          x: 4,
          y: 6,
          width: 14,
          length: 18,
          color: '#f1f5f9',
          floorLevel: 1,
        },
        {
          id: 'room-cp-02',
          name: 'Kitchenette',
          type: 'kitchen',
          x: 20,
          y: 6,
          width: 8,
          length: 10,
          color: '#fef3c7',
          floorLevel: 1,
        },
        {
          id: 'room-cp-03',
          name: 'Bathroom',
          type: 'bathroom',
          x: 20,
          y: 18,
          width: 7,
          length: 8,
          color: '#ccfbf1',
          floorLevel: 1,
        },
      ],
      gridSnap: 0.5,
      showGrid: true,
    },
    budget: 185000,
    currency: 'USD',
    notes: 'Detached accessory dwelling unit. Timber frame construction with high saline corrosion resistance.',
    status: 'Drafting',
    createdAt: '2026-10-15T16:20:00.000Z',
    updatedAt: '2026-10-21T09:10:00.000Z',
  },
];

export const DEFAULT_SETTINGS: AppSettings = {
  defaultUnit: 'feet',
  defaultCurrency: 'USD',
  role: 'architect',
};

// Safe reading from localStorage with prototype pollution prevention
export function loadProjects(): Project[] {
  try {
    if (typeof localStorage === 'undefined') {
      return INITIAL_SAMPLE_PROJECTS;
    }
    const raw = localStorage.getItem(PROJECTS_STORAGE_KEY);
    if (!raw) {
      // First run: save and return initial sample projects
      saveProjects(INITIAL_SAMPLE_PROJECTS);
      return INITIAL_SAMPLE_PROJECTS;
    }
    const parsed = safeJsonParse<unknown[]>(raw, []);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      console.warn('[Storage] Projects storage contained empty or invalid data, preserving initial samples');
      saveProjects(INITIAL_SAMPLE_PROJECTS);
      return INITIAL_SAMPLE_PROJECTS;
    }
    // Clean and validate objects
    return parsed.filter(
      (item): item is Project =>
        item !== null &&
        typeof item === 'object' &&
        typeof (item as Project).id === 'string' &&
        typeof (item as Project).name === 'string' &&
        typeof (item as Project).plotWidth === 'number' &&
        (item as Project).plotWidth > 0 &&
        typeof (item as Project).plotLength === 'number' &&
        (item as Project).plotLength > 0
    );
  } catch (error) {
    console.error('[Storage] Failed to load projects from localStorage:', error);
    return INITIAL_SAMPLE_PROJECTS;
  }
}

export function saveProjects(projects: Project[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    safeStorageSetItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
  } catch (error) {
    console.error('[Storage] Failed to save projects to localStorage:', error);
  }
}

export function getProjectById(id: string): Project | undefined {
  const projects = loadProjects();
  return projects.find((p) => p.id === id);
}

export function createProject(project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Project {
  const projects = loadProjects();
  const now = new Date().toISOString();
  const newProject: Project = {
    ...project,
    id: `proj-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    createdAt: now,
    updatedAt: now,
  };
  projects.unshift(newProject);
  saveProjects(projects);
  return newProject;
}

export function updateProject(updated: Project): boolean {
  const projects = loadProjects();
  const index = projects.findIndex((p) => p.id === updated.id);
  if (index === -1) return false;

  projects[index] = {
    ...updated,
    updatedAt: new Date().toISOString(),
  };
  saveProjects(projects);
  return true;
}

export function deleteProject(id: string): boolean {
  const projects = loadProjects();
  const filtered = projects.filter((p) => p.id !== id);
  if (filtered.length === projects.length) return false;
  saveProjects(filtered);
  return true;
}

export function resetProjectsToSamples(): Project[] {
  saveProjects(INITIAL_SAMPLE_PROJECTS);
  return INITIAL_SAMPLE_PROJECTS;
}

export function clearAllProjects(): void {
  saveProjects([]);
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = safeJsonParse<Partial<AppSettings>>(raw, {});
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    safeStorageSetItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('[Storage] Failed to save settings:', error);
  }
}

import {
  isAuthSessionConfigured,
  getAuthSession,
  listProjects as apiListProjects,
  getProject as apiGetProject,
  createProject as apiCreateProject,
  updateProject as apiUpdateProject,
  deleteProject as apiDeleteProject,
  batchUpsertProjects as apiBatchUpsertProjects,
  resetSampleProjectsInCloud as apiResetSampleProjectsInCloud,
  clearAllProjectsInCloud as apiClearAllProjectsInCloud,
  ApiError,
  AuthRequiredError,
  TenantRequiredError,
} from './apiClient';
import { legacyToCloudUuid } from '../utils/idMapping';

let cloudPersistenceOverride: boolean | null = null;

/**
 * Allows deterministic runtime/test override of the cloud persistence flag.
 * Pass `null` to restore default environment-variable evaluation.
 */
export function setCloudPersistenceOverride(enabled: boolean | null): void {
  cloudPersistenceOverride = enabled;
}

/**
 * Checks whether cloud persistence is enabled via environment feature flag.
 * Default: FALSE (Preserving offline-first localStorage).
 */
export function isCloudPersistenceEnabled(): boolean {
  if (cloudPersistenceOverride !== null) {
    return cloudPersistenceOverride;
  }
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return import.meta.env.VITE_USE_CLOUD_STORAGE === 'true';
  }
  if (typeof process !== 'undefined' && process.env) {
    return process.env.VITE_USE_CLOUD_STORAGE === 'true';
  }
  return false;
}

export interface CloudPersistenceStatus {
  isCloudActive: boolean;
  provider: 'local_storage' | 'postgresql';
  status: 'disabled' | 'unauthenticated' | 'ready';
  tenantId: string | null;
}

/**
 * P53 Cloud Persistence Status Query:
 * Offline-first localStorage remains the active and primary persistence provider by default.
 */
export function getCloudPersistenceStatus(): CloudPersistenceStatus {
  const isCloudActive = isCloudPersistenceEnabled();
  const session = getAuthSession();

  if (!isCloudActive) {
    return {
      isCloudActive: false,
      provider: 'local_storage',
      status: 'disabled',
      tenantId: null,
    };
  }

  return {
    isCloudActive: true,
    provider: 'postgresql',
    status: isAuthSessionConfigured() ? 'ready' : 'unauthenticated',
    tenantId: session?.tenantId || null,
  };
}

/**
 * Safely fetches projects from cloud without overwriting local storage unless
 * cloud persistence is enabled and the response is validated.
 */
export async function fetchProjectsFromCloud(): Promise<{
  success: boolean;
  projects?: Project[];
  error?: string;
}> {
  if (!isCloudPersistenceEnabled()) {
    return {
      success: false,
      error: 'Cloud persistence is disabled (VITE_USE_CLOUD_STORAGE != true).',
    };
  }

  if (!isAuthSessionConfigured()) {
    return {
      success: false,
      error: 'Cannot fetch from cloud: No active authenticated session configured.',
    };
  }

  try {
    const cloudProjects = await apiListProjects();
    return { success: true, projects: cloudProjects };
  } catch (err: any) {
    console.error('[Storage Cloud Sync] Failed to fetch cloud projects:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Safely pushes a single local project to the cloud persistence layer
 * without deleting or altering the local storage state.
 */
export async function pushProjectToCloud(project: Project): Promise<{
  success: boolean;
  project?: Project;
  error?: string;
}> {
  if (!isCloudPersistenceEnabled()) {
    return {
      success: false,
      error: 'Cloud persistence is disabled.',
    };
  }

  if (!isAuthSessionConfigured()) {
    return {
      success: false,
      error: 'No active authenticated session configured.',
    };
  }

  try {
    const saved = await apiCreateProject(project);
    return { success: true, project: saved };
  } catch (err: any) {
    console.error('[Storage Cloud Sync] Failed to push project to cloud:', err.message);
    return { success: false, error: err.message };
  }
}

// -----------------------------------------------------------------------------
// Unified Project Persistence Adapter
// -----------------------------------------------------------------------------

export interface ProjectPersistenceAdapter {
  provider: 'local_storage' | 'postgresql';
  loadProjects(): Promise<Project[]>;
  getProjectById(id: string): Promise<Project | undefined>;
  createProject(project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'> | Project): Promise<Project>;
  updateProject(updated: Project): Promise<boolean>;
  deleteProject(id: string): Promise<boolean>;
  resetProjectsToSamples(): Promise<Project[]>;
  clearAllProjects(): Promise<void>;
  importProjects(projects: Project[]): Promise<Project[]>;
}

export const localStorageAdapter: ProjectPersistenceAdapter = {
  provider: 'local_storage',
  async loadProjects(): Promise<Project[]> {
    return loadProjects();
  },
  async getProjectById(id: string): Promise<Project | undefined> {
    return getProjectById(id);
  },
  async createProject(project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'> | Project): Promise<Project> {
    return createProject(project as any);
  },
  async updateProject(updated: Project): Promise<boolean> {
    return updateProject(updated);
  },
  async deleteProject(id: string): Promise<boolean> {
    return deleteProject(id);
  },
  async resetProjectsToSamples(): Promise<Project[]> {
    return resetProjectsToSamples();
  },
  async clearAllProjects(): Promise<void> {
    clearAllProjects();
  },
  async importProjects(projects: Project[]): Promise<Project[]> {
    if (!Array.isArray(projects) || projects.length === 0) {
      return [];
    }
    const now = new Date().toISOString();
    const seenLocalIds = new Set<string>();
    const normalized = projects.map((item, idx) => {
      if (!item || typeof item !== 'object') {
        throw new Error(`Invalid project at index #${idx + 1}.`);
      }
      if (!item.name || typeof item.name !== 'string' || item.name.trim().length === 0) {
        throw new Error(`Project at index #${idx + 1} is missing a valid name.`);
      }
      const resolvedId =
        item.id && typeof item.id === 'string' && item.id.trim().length > 0
          ? item.id.trim()
          : `proj-import-${idx + 1}-${item.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      if (seenLocalIds.has(resolvedId)) {
        throw new Error(`Duplicate project ID "${resolvedId}" in import batch.`);
      }
      seenLocalIds.add(resolvedId);
      return {
        ...item,
        id: resolvedId,
        createdAt: item.createdAt || now,
        updatedAt: item.updatedAt || now,
      };
    });
    saveProjects(normalized);
    return normalized;
  },
};

export const cloudStorageAdapter: ProjectPersistenceAdapter = {
  provider: 'postgresql',
  async loadProjects(): Promise<Project[]> {
    if (!isAuthSessionConfigured()) {
      throw new AuthRequiredError('Cloud persistence active: An authenticated session is required to load projects.');
    }
    return apiListProjects();
  },
  async getProjectById(id: string): Promise<Project | undefined> {
    if (!isAuthSessionConfigured()) {
      throw new AuthRequiredError('Cloud persistence active: An authenticated session is required to get project details.');
    }
    try {
      return await apiGetProject(id);
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 404) {
        return undefined;
      }
      throw err;
    }
  },
  async createProject(project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'> | Project): Promise<Project> {
    if (!isAuthSessionConfigured()) {
      throw new AuthRequiredError('Cloud persistence active: An authenticated session is required to create a project.');
    }
    const fullProject: Project = {
      id: (project as any).id || `proj-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      createdAt: (project as any).createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...(project as any),
    };
    return apiCreateProject(fullProject);
  },
  async updateProject(updated: Project): Promise<boolean> {
    if (!isAuthSessionConfigured()) {
      throw new AuthRequiredError('Cloud persistence active: An authenticated session is required to update a project.');
    }
    await apiUpdateProject(updated.id, updated);
    return true;
  },
  async deleteProject(id: string): Promise<boolean> {
    if (!isAuthSessionConfigured()) {
      throw new AuthRequiredError('Cloud persistence active: An authenticated session is required to delete a project.');
    }
    const res = await apiDeleteProject(id);
    return res.success;
  },
  async resetProjectsToSamples(): Promise<Project[]> {
    if (!isAuthSessionConfigured()) {
      throw new AuthRequiredError('Cloud persistence active: An authenticated session is required to restore sample projects.');
    }
    return apiResetSampleProjectsInCloud(INITIAL_SAMPLE_PROJECTS);
  },
  async clearAllProjects(): Promise<void> {
    if (!isAuthSessionConfigured()) {
      throw new AuthRequiredError('Cloud persistence active: An authenticated session is required to clear projects.');
    }
    await apiClearAllProjectsInCloud();
  },
  async importProjects(projects: Project[]): Promise<Project[]> {
    if (!isAuthSessionConfigured()) {
      throw new AuthRequiredError('Cloud persistence active: An authenticated session is required to import projects.');
    }
    if (!Array.isArray(projects) || projects.length === 0) {
      return [];
    }
    const now = new Date().toISOString();
    const preparedProjects: Project[] = projects.map((item, idx) => {
      if (!item || typeof item !== 'object') {
        return item;
      }
      const deterministicFallbackId = `proj-import-${idx + 1}-${String(item.name || 'untitled')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')}-${item.plotWidth || 0}x${item.plotLength || 0}`;
      return {
        ...item,
        id:
          typeof item.id === 'string' && item.id.trim().length > 0
            ? item.id.trim()
            : deterministicFallbackId,
        createdAt: item.createdAt || now,
        updatedAt: now,
      };
    });

    return apiBatchUpsertProjects(preparedProjects);
  },
};


/**
 * Returns the active project persistence adapter based on feature flag.
 */
export function getProjectPersistenceAdapter(): ProjectPersistenceAdapter {
  return isCloudPersistenceEnabled() ? cloudStorageAdapter : localStorageAdapter;
}

/**
 * Loads projects asynchronously via the active persistence adapter.
 */
export async function loadProjectsAsync(): Promise<Project[]> {
  return getProjectPersistenceAdapter().loadProjects();
}

/**
 * Retrieves a single project asynchronously via the active persistence adapter.
 */
export async function getProjectByIdAsync(id: string): Promise<Project | undefined> {
  return getProjectPersistenceAdapter().getProjectById(id);
}

/**
 * Creates a project asynchronously via the active persistence adapter.
 * Never silently writes to local storage when cloud write fails.
 */
export async function createProjectAsync(
  project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'> | Project
): Promise<Project> {
  return getProjectPersistenceAdapter().createProject(project);
}

/**
 * Updates a project asynchronously via the active persistence adapter.
 * Never silently writes to local storage when cloud write fails.
 */
export async function updateProjectAsync(updated: Project): Promise<boolean> {
  return getProjectPersistenceAdapter().updateProject(updated);
}

/**
 * Deletes a project asynchronously via the active persistence adapter.
 */
export async function deleteProjectAsync(id: string): Promise<boolean> {
  return getProjectPersistenceAdapter().deleteProject(id);
}

/**
 * Restores initial architectural sample projects via the active persistence adapter.
 * Never silently writes to local storage when cloud mode is active.
 */
export async function resetProjectsToSamplesAsync(): Promise<Project[]> {
  return getProjectPersistenceAdapter().resetProjectsToSamples();
}

/**
 * Clears all projects via the active persistence adapter.
 * Never silently clears only local storage when cloud mode is active.
 */
export async function clearAllProjectsAsync(): Promise<void> {
  return getProjectPersistenceAdapter().clearAllProjects();
}

/**
 * Imports an array of projects via the active persistence adapter.
 * Never silently writes to local storage when cloud mode is active.
 */
export async function importProjectsAsync(projects: Project[]): Promise<Project[]> {
  return getProjectPersistenceAdapter().importProjects(projects);
}



