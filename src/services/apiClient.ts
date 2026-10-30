/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Project } from '../types/project';
import {
  legacyToCloudUuid,
  normalizeProjectForCloud,
  normalizeProjectFromCloud,
} from '../utils/idMapping';

export interface AuthSession {
  token: string;
  tenantId: string;
  userId?: string;
  userEmail?: string;
}

export interface ApiClientConfig {
  baseUrl?: string;
  timeoutMs?: number;
}

export class ApiError extends Error {
  public status: number;
  public code?: string;
  public details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class AuthRequiredError extends ApiError {
  constructor(message = 'Authentication required: No active session configured.') {
    super(message, 401, 'ERR_AUTH_REQUIRED');
    this.name = 'AuthRequiredError';
  }
}

export class TenantRequiredError extends ApiError {
  constructor(message = 'Tenant context required: No active organization selected.') {
    super(message, 400, 'ERR_TENANT_REQUIRED');
    this.name = 'TenantRequiredError';
  }
}

const SESSION_STORAGE_KEY = 'plotify_auth_session_v1';

// In-memory session state with optional tab-scoped sessionStorage rehydration
let currentSession: AuthSession | null = null;
let clientConfig: ApiClientConfig = {
  baseUrl: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) || '',
  timeoutMs: 15000,
};

/**
 * Rehydrates session from browser tab sessionStorage if available.
 */
export function loadStoredSession(): AuthSession | null {
  if (currentSession) return currentSession;
  try {
    if (typeof sessionStorage !== 'undefined') {
      const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.token === 'string' && typeof parsed.tenantId === 'string') {
          currentSession = parsed;
          return parsed;
        }
      }
    }
  } catch {
    // Ignore sessionStorage errors
  }
  return null;
}

/**
 * Configures the API client connection parameters.
 */
export function configureApiClient(config: Partial<ApiClientConfig>): void {
  clientConfig = { ...clientConfig, ...config };
}

/**
 * Sets the active authenticated session.
 * Stores in tab-scoped sessionStorage for continuity across reloads.
 */
export function setAuthSession(session: AuthSession | null): void {
  currentSession = session;
  try {
    if (typeof sessionStorage !== 'undefined') {
      if (session) {
        sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
      } else {
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
      }
    }
  } catch {
    // Ignore storage errors
  }
}

/**
 * Retrieves the currently active session.
 */
export function getAuthSession(): AuthSession | null {
  if (!currentSession) {
    loadStoredSession();
  }
  return currentSession;
}

/**
 * Checks whether both authentication token and tenant selector are configured.
 */
export function isAuthSessionConfigured(): boolean {
  if (!currentSession) {
    loadStoredSession();
  }
  return Boolean(currentSession?.token && currentSession?.tenantId);
}

/**
 * Internal helper to dispatch typed HTTP requests with timeout and error handling.
 */
async function apiFetch<T>(
  endpoint: string,
  options: RequestInit & { requiresAuth?: boolean } = {}
): Promise<T> {
  const { requiresAuth = true, headers: customHeaders, ...fetchOpts } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(customHeaders as Record<string, string>),
  };

  if (requiresAuth) {
    if (!currentSession?.token) {
      throw new AuthRequiredError();
    }
    if (!currentSession?.tenantId) {
      throw new TenantRequiredError();
    }

    headers['Authorization'] = `Bearer ${currentSession.token}`;
    headers['X-Tenant-ID'] = currentSession.tenantId;
  }

  const url = `${clientConfig.baseUrl}${endpoint}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), clientConfig.timeoutMs);

  try {
    const response = await fetch(url, {
      ...fetchOpts,
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const data = isJson ? await response.json() : null;

    if (!response.ok) {
      const errorMessage =
        data?.error || `HTTP ${response.status}: ${response.statusText}`;
      const errorCode = data?.code || `ERR_HTTP_${response.status}`;
      throw new ApiError(errorMessage, response.status, errorCode, data?.details);
    }

    return data as T;
  } catch (err: any) {
    clearTimeout(timeoutId);

    if (err instanceof ApiError) {
      throw err;
    }

    if (err.name === 'AbortError') {
      throw new ApiError(
        `Request timeout after ${clientConfig.timeoutMs}ms. Server transaction outcome is unconfirmed; safe to retry idempotent operation.`,
        408,
        'ERR_REQUEST_TIMEOUT',
        { outcomeUnknown: true, retryable: true }
      );
    }

    throw new ApiError(
      `Network request failed: ${err.message || 'Unknown network error'}`,
      0,
      'ERR_NETWORK_FAILURE'
    );
  }
}

// -----------------------------------------------------------------------------
// Typed API Endpoints
// -----------------------------------------------------------------------------

/**
 * Public health check endpoint.
 */
export async function checkApiHealth(): Promise<{ status: string; package: string }> {
  return apiFetch<{ status: string; package: string }>('/api/health', {
    method: 'GET',
    requiresAuth: false,
  });
}

export interface ListProjectsParams {
  limit?: number;
  offset?: number;
}

export interface ListProjectsResponse {
  projects: Project[];
  total?: number;
  limit?: number;
  offset?: number;
}

/**
 * Lists projects for the active tenant with optional pagination.
 * Automatically restores legacy local IDs if previously mapped.
 */
export async function listProjects(params?: ListProjectsParams): Promise<Project[]> {
  const queryParts: string[] = [];
  if (params?.limit !== undefined) {
    queryParts.push(`limit=${encodeURIComponent(params.limit)}`);
  }
  if (params?.offset !== undefined) {
    queryParts.push(`offset=${encodeURIComponent(params.offset)}`);
  }
  const queryString = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';

  const res = await apiFetch<ListProjectsResponse>(`/api/projects${queryString}`, {
    method: 'GET',
    requiresAuth: true,
  });

  return (res.projects || []).map(normalizeProjectFromCloud);
}

/**
 * Fetches a single project by ID.
 * Supports querying by legacy ID or cloud UUID.
 */
export async function getProject(id: string): Promise<Project> {
  const cloudId = legacyToCloudUuid(id);
  const res = await apiFetch<{ project: Project }>(`/api/projects/${cloudId}`, {
    method: 'GET',
    requiresAuth: true,
  });

  return normalizeProjectFromCloud(res.project);
}

/**
 * Creates a project in the cloud persistence tier.
 * Normalizes project identifier to UUID while preserving legacy mapping.
 * Mutation is NOT retried automatically.
 */
export async function createProject(project: Project): Promise<Project> {
  const normalized = normalizeProjectForCloud(project);
  const res = await apiFetch<{ project: Project }>('/api/projects', {
    method: 'POST',
    body: JSON.stringify(normalized),
    requiresAuth: true,
  });

  return normalizeProjectFromCloud(res.project);
}

/**
 * Updates an existing project in the cloud.
 * Normalizes project identifier to UUID while preserving legacy mapping.
 * Mutation is NOT retried automatically.
 */
export async function updateProject(
  id: string,
  updates: Partial<Project>
): Promise<Project> {
  const cloudId = legacyToCloudUuid(id);
  const res = await apiFetch<{ project: Project }>(`/api/projects/${cloudId}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
    requiresAuth: true,
  });

  return normalizeProjectFromCloud(res.project);
}

/**
 * Removes a project from the cloud.
 * Mutation is NOT retried automatically.
 */
export async function deleteProject(id: string): Promise<{ success: boolean; id: string }> {
  const cloudId = legacyToCloudUuid(id);
  return apiFetch<{ success: boolean; id: string }>(`/api/projects/${cloudId}`, {
    method: 'DELETE',
    requiresAuth: true,
  });
}

/**
 * Atomically imports/upserts a batch of projects in a single server transaction.
 */
export async function batchUpsertProjects(projects: Project[]): Promise<Project[]> {
  const normalizedProjects = projects.map((p) => {
    if (p && typeof p.id === 'string' && p.id.trim().length > 0) {
      return normalizeProjectForCloud(p);
    }
    return p;
  });

  const res = await apiFetch<{ projects: Project[]; count: number }>('/api/projects/batch', {
    method: 'POST',
    body: JSON.stringify({ projects: normalizedProjects }),
    requiresAuth: true,
  });

  return (res.projects || []).map(normalizeProjectFromCloud);
}

/**
 * Atomically restores sample projects and removes non-sample tenant projects
 * in a single server transaction.
 */
export async function resetSampleProjectsInCloud(samples: Project[]): Promise<Project[]> {
  const normalizedSamples = samples.map(normalizeProjectForCloud);
  const res = await apiFetch<{ projects: Project[]; deletedCount: number }>(
    '/api/projects/reset-samples',
    {
      method: 'POST',
      body: JSON.stringify({ projects: normalizedSamples }),
      requiresAuth: true,
    }
  );

  return (res.projects || []).map(normalizeProjectFromCloud);
}

/**
 * Atomically deletes all projects and snapshots belonging to the active tenant
 * in a single server transaction.
 */
export async function clearAllProjectsInCloud(): Promise<{
  success: boolean;
  deletedCount: number;
}> {
  return apiFetch<{ success: boolean; deletedCount: number }>('/api/projects', {
    method: 'DELETE',
    headers: { 'X-Confirm-Clear': 'true' },
    body: JSON.stringify({ confirm: true }),
    requiresAuth: true,
  });
}

/**
 * Lists snapshot revisions for a project.
 */
export async function listSnapshots(projectId: string): Promise<unknown[]> {
  const cloudId = legacyToCloudUuid(projectId);
  const res = await apiFetch<{ snapshots: unknown[] }>(
    `/api/projects/${cloudId}/snapshots`,
    {
      method: 'GET',
      requiresAuth: true,
    }
  );

  return res.snapshots || [];
}

/**
 * Atomically generates a project snapshot revision.
 * Mutation is NOT retried automatically.
 */
export async function createSnapshot(
  projectId: string,
  payload: {
    label: string;
    versionTag?: string;
    description?: string;
    trigger?: string;
    metrics?: Record<string, unknown>;
    projectData: Project;
  }
): Promise<unknown> {
  const cloudId = legacyToCloudUuid(projectId);
  const normalizedData = normalizeProjectForCloud(payload.projectData);

  const res = await apiFetch<{ snapshot: unknown }>(
    `/api/projects/${cloudId}/snapshots`,
    {
      method: 'POST',
      body: JSON.stringify({
        ...payload,
        projectData: normalizedData,
      }),
      requiresAuth: true,
    }
  );

  return res.snapshot;
}

/**
 * Atomically imports a batch of project snapshots in a single database transaction.
 */
export async function createSnapshotsBatch(
  projectId: string,
  snapshots: Array<{
    clientSnapshotId?: string;
    revisionNumber?: number;
    versionTag?: string;
    label: string;
    description?: string;
    trigger?: string;
    metrics?: Record<string, unknown>;
    projectData: Project;
  }>
): Promise<{ importedCount: number; snapshots: unknown[] }> {
  const cloudId = legacyToCloudUuid(projectId);
  const normalizedSnapshots = snapshots.map((s) => ({
    ...s,
    projectData:
      s.projectData && typeof s.projectData === 'object'
        ? normalizeProjectForCloud({
            ...s.projectData,
            id: s.projectData.id || projectId,
          })
        : s.projectData,
  }));

  return apiFetch<{ importedCount: number; snapshots: unknown[] }>(
    `/api/projects/${cloudId}/snapshots/batch`,
    {
      method: 'POST',
      body: JSON.stringify({ snapshots: normalizedSnapshots }),
      requiresAuth: true,
    }
  );
}

/**
 * Ingests an architectural archive payload.
 * Mutation is NOT retried automatically.
 */
export async function ingestArchive(payload: unknown): Promise<unknown> {
  return apiFetch('/api/archives/ingest', {
    method: 'POST',
    body: JSON.stringify(payload),
    requiresAuth: true,
  });
}

