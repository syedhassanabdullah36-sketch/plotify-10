/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import http from 'http';
import {
  isUuid,
  legacyToCloudUuid,
  cloudUuidToLegacy,
  normalizeProjectForCloud,
  normalizeProjectFromCloud,
} from './src/utils/idMapping';
import {
  configureApiClient,
  setAuthSession,
  getAuthSession,
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  checkApiHealth,
  AuthRequiredError,
  TenantRequiredError,
  ApiError,
} from './src/services/apiClient';
import {
  isCloudPersistenceEnabled,
  setCloudPersistenceOverride,
  getCloudPersistenceStatus,
  loadProjects,
  saveProjects,
  INITIAL_SAMPLE_PROJECTS,
  pushProjectToCloud,
  fetchProjectsFromCloud,
  loadProjectsAsync,
  createProjectAsync,
  updateProjectAsync,
  deleteProjectAsync,
  resetProjectsToSamplesAsync,
  clearAllProjectsAsync,
  importProjectsAsync,
  getProjectPersistenceAdapter,
  cloudStorageAdapter,
} from './src/services/storage';
import {
  exportSystemArchiveForBackend,
  ingestSystemArchiveToBackend,
} from './src/services/backupService';
import {
  getProjectSnapshots,
  createProjectSnapshotAsync,
  listProjectSnapshotsAsync,
  deleteProjectSnapshotAsync,
  executeSafeRestoreAsync,
  exportProjectRevisionBundleAsync,
  importProjectRevisionBundleAsync,
} from './src/services/versioningService';
import { evaluateDecisionTwin } from './src/services/decisionTwinService';
import { evaluateConstraintGraph } from './src/services/constraintGraphService';

console.log('================================================================');
console.log('PLOTIFY — P53 STAGE 2: CLIENT API ADAPTER & STORAGE TESTS');
console.log('Mode: Typed Client Audit, UUID Normalization & Storage Isolation');
console.log('================================================================\n');

interface TestAssertion {
  num: number;
  name: string;
  passed: boolean;
  details?: string;
}

const results: TestAssertion[] = [];

function assert(num: number, name: string, condition: boolean, details?: string) {
  results.push({ num, name, passed: condition, details });
  if (condition) {
    console.log(`  ✓ Test ${num}: ${name}`);
  } else {
    console.error(`  ✗ Test ${num}: ${name}${details ? ` — ${details}` : ''}`);
  }
}

async function runStage2Tests(): Promise<void> {
  // ---------------------------------------------------------------------------
  // 1. UUID vs Legacy ID Validation & Conversion
  // ---------------------------------------------------------------------------
  const legacyId1 = 'proj-001';
  const legacyId2 = 'proj-002';
  const existingUuid = '123e4567-e89b-12d3-a456-426614174000';

  assert(1, 'isUuid accurately identifies valid RFC 4122 UUID', isUuid(existingUuid));
  assert(2, 'isUuid rejects legacy identifiers (proj-001)', !isUuid(legacyId1));

  const cloudUuid1 = legacyToCloudUuid(legacyId1);
  const cloudUuid2 = legacyToCloudUuid(legacyId2);

  assert(3, 'legacyToCloudUuid generates a valid RFC 4122 UUID', isUuid(cloudUuid1));
  assert(4, 'legacyToCloudUuid is 100% deterministic', cloudUuid1 === legacyToCloudUuid(legacyId1));
  assert(5, 'legacyToCloudUuid preserves existing UUIDs unchanged', legacyToCloudUuid(existingUuid) === existingUuid);
  assert(6, 'Distinct legacy IDs produce distinct cloud UUIDs (no sample collision)', cloudUuid1 !== cloudUuid2);

  // ---------------------------------------------------------------------------
  // 2. Bidirectional Mapping & Normalization
  // ---------------------------------------------------------------------------
  const restoredId = cloudUuidToLegacy(cloudUuid1);
  assert(7, 'cloudUuidToLegacy accurately restores the original legacy ID', restoredId === legacyId1);

  const sample = INITIAL_SAMPLE_PROJECTS[0];
  const normalizedForCloud = normalizeProjectForCloud(sample);
  assert(8, 'normalizeProjectForCloud sets project.id to valid UUID', isUuid(normalizedForCloud.id));
  assert(9, 'normalizeProjectForCloud preserves original local ID in metadata', (normalizedForCloud as any).legacyId === sample.id);

  const restoredFromCloud = normalizeProjectFromCloud(normalizedForCloud);
  assert(10, 'normalizeProjectFromCloud restores exact local project ID without data loss', restoredFromCloud.id === sample.id);

  // ---------------------------------------------------------------------------
  // 3. API Client Authentication Guards (Pre-Network Checks)
  // ---------------------------------------------------------------------------
  setAuthSession(null);

  let caughtAuthErr = false;
  try {
    await listProjects();
  } catch (err: any) {
    if (err instanceof AuthRequiredError && err.status === 401) {
      caughtAuthErr = true;
    }
  }
  assert(11, 'listProjects() fails closed with AuthRequiredError when unauthenticated', caughtAuthErr);

  setAuthSession({ token: 'test.jwt.token', tenantId: '' });
  let caughtTenantErr = false;
  try {
    await listProjects();
  } catch (err: any) {
    if (err instanceof TenantRequiredError && err.status === 400) {
      caughtTenantErr = true;
    }
  }
  assert(12, 'listProjects() fails closed with TenantRequiredError when tenantId is empty', caughtTenantErr);

  // ---------------------------------------------------------------------------
  // 4. HTTP Error Handling against In-Memory Test Server
  // ---------------------------------------------------------------------------
  let simulatedStatus = 200;
  let simulatedBody: any = { status: 'healthy', package: 'P53' };

  const testServer = http.createServer((req, res) => {
    res.writeHead(simulatedStatus, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(simulatedBody));
  });

  await new Promise<void>((resolve) => testServer.listen(0, '127.0.0.1', resolve));
  const testPort = (testServer.address() as any).port;
  const testBaseUrl = `http://127.0.0.1:${testPort}`;

  configureApiClient({ baseUrl: testBaseUrl, timeoutMs: 3000 });
  setAuthSession({
    token: 'valid.test.token',
    tenantId: '00000000-0000-4000-8000-000000000001',
  });

  try {
    // Test 200 OK
    simulatedStatus = 200;
    simulatedBody = { status: 'healthy', package: 'P53-STAGE2' };
    const health = await checkApiHealth();
    assert(13, 'Public checkApiHealth() parses 200 OK successfully', health.status === 'healthy');

    // Test 403 Forbidden
    simulatedStatus = 403;
    simulatedBody = { error: 'Forbidden: Access denied to organization', code: 'ERR_TENANT_FORBIDDEN' };
    let caught403 = false;
    try {
      await listProjects();
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 403 && err.code === 'ERR_TENANT_FORBIDDEN') {
        caught403 = true;
      }
    }
    assert(14, 'API client correctly parses HTTP 403 Forbidden with custom error code', caught403);

    // Test 404 Not Found
    simulatedStatus = 404;
    simulatedBody = { error: 'Project not found', code: 'ERR_NOT_FOUND' };
    let caught404 = false;
    try {
      await getProject('proj-999');
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 404) {
        caught404 = true;
      }
    }
    assert(15, 'API client correctly parses HTTP 404 Not Found', caught404);

    // Test 500 Internal Server Error
    simulatedStatus = 500;
    simulatedBody = { error: 'An internal server error occurred.', code: 'ERR_INTERNAL' };
    let caught500 = false;
    try {
      await deleteProject('proj-001');
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 500) {
        caught500 = true;
      }
    }
    assert(16, 'API client safely surfaces sanitized HTTP 500 server errors', caught500);
  } finally {
    testServer.close();
  }

  // ---------------------------------------------------------------------------
  // 5. Storage Integration & Feature-Flag Safety
  // ---------------------------------------------------------------------------
  assert(
    17,
    'isCloudPersistenceEnabled() is false by default in this environment',
    isCloudPersistenceEnabled() === false
  );

  const status = getCloudPersistenceStatus();
  assert(
    18,
    'getCloudPersistenceStatus() confirms localStorage active and cloud disabled',
    status.isCloudActive === false &&
      status.provider === 'local_storage' &&
      status.status === 'disabled'
  );

  // Local data safety check
  const localProjectsBefore = loadProjects();
  assert(19, 'loadProjects() continues reading from localStorage safely', localProjectsBefore.length > 0);

  // Cloud sync attempt when disabled fails safely without corrupting local data
  const pushRes = await pushProjectToCloud(localProjectsBefore[0]);
  assert(
    20,
    'pushProjectToCloud() safely rejects when cloud mode is disabled',
    pushRes.success === false && Boolean(pushRes.error)
  );

  const fetchRes = await fetchProjectsFromCloud();
  assert(
    21,
    'fetchProjectsFromCloud() safely rejects when cloud mode is disabled',
    fetchRes.success === false && Boolean(fetchRes.error)
  );

  const localProjectsAfter = loadProjects();
  assert(
    22,
    'Local projects in localStorage remain 100% intact after cloud push/fetch rejections',
    localProjectsAfter.length === localProjectsBefore.length &&
      localProjectsAfter[0].id === localProjectsBefore[0].id
  );

  // ---------------------------------------------------------------------------
  // Persistence Adapter & Frontend–Backend Integration Tests
  // ---------------------------------------------------------------------------
  const asyncProjects = await loadProjectsAsync();
  assert(
    23,
    'loadProjectsAsync() resolves local projects safely when cloud mode is disabled',
    asyncProjects.length === localProjectsBefore.length && asyncProjects[0].name === localProjectsBefore[0].name
  );

  const activeAdapter = getProjectPersistenceAdapter();
  assert(
    24,
    'getProjectPersistenceAdapter() returns localStorageAdapter by default',
    activeAdapter.provider === 'local_storage'
  );

  setAuthSession(null);
  let cloudAdapterRejectedWithoutSession = false;
  try {
    await cloudStorageAdapter.createProject(localProjectsBefore[0]);
  } catch (err) {
    if (err instanceof AuthRequiredError) {
      cloudAdapterRejectedWithoutSession = true;
    }
  }
  assert(
    25,
    'cloudStorageAdapter.createProject fails closed with AuthRequiredError without silent fallback to local storage',
    cloudAdapterRejectedWithoutSession
  );

  const backendArchive = exportSystemArchiveForBackend('Integration Test Export');
  assert(
    26,
    'exportSystemArchiveForBackend() formats items with cloud UUIDs within 100 project limit',
    backendArchive.items.length <= 100 &&
      backendArchive.items.length > 0 &&
      isUuid(backendArchive.items[0].project.id)
  );

  const ingestRes = await ingestSystemArchiveToBackend();
  assert(
    27,
    'ingestSystemArchiveToBackend() safely rejects when cloud mode is disabled',
    ingestRes.success === false && Boolean(ingestRes.error)
  );

  const snapshots = await listProjectSnapshotsAsync(localProjectsBefore[0]);
  assert(
    28,
    'listProjectSnapshotsAsync() returns local snapshot records when cloud mode is disabled',
    Array.isArray(snapshots)
  );

  // ---------------------------------------------------------------------------
  // 6. P1-03: Complete Cloud & Local-First Persistence Integration Regression Suite
  // ---------------------------------------------------------------------------
  console.log('\n--- Running P1-03 Cloud & Local-First Persistence Integration Tests ---');

  // Install an inspectable in-memory localStorage mock for Node test runtime
  const localStoreMap = new Map<string, string>();
  let localWriteCount = 0;
  const isPersistenceDataKey = (key: string) =>
    key === 'architecture_intelligence_os_projects_v1' ||
    key.startsWith('plotify_snapshots_v1_');
  const mockLocalStorage = {
    get length() {
      return localStoreMap.size;
    },
    key(index: number) {
      return Array.from(localStoreMap.keys())[index] ?? null;
    },
    getItem(key: string) {
      return localStoreMap.has(key) ? localStoreMap.get(key)! : null;
    },
    setItem(key: string, value: string) {
      if (isPersistenceDataKey(key)) {
        localWriteCount++;
      }
      localStoreMap.set(key, String(value));
    },
    removeItem(key: string) {
      if (isPersistenceDataKey(key)) {
        localWriteCount++;
      }
      localStoreMap.delete(key);
    },
    clear() {
      localWriteCount++;
      localStoreMap.clear();
    },
  };
  (globalThis as any).localStorage = mockLocalStorage;

  // 6A. Verify Local-First Mode (cloud disabled) preserves local persistence behavior
  setCloudPersistenceOverride(false);
  const localRestoredSamples = await resetProjectsToSamplesAsync();
  assert(
    29,
    'P1-03 Local-First: resetProjectsToSamplesAsync() persists 3 sample projects to localStorage',
    localRestoredSamples.length === 3 &&
      loadProjects().length === 3 &&
      localStoreMap.has('architecture_intelligence_os_projects_v1')
  );

  const customImportedProject = {
    ...INITIAL_SAMPLE_PROJECTS[0],
    id: 'proj-local-import-01',
    name: 'Local Imported Villa',
    plotWidth: 64,
  };
  const localImported = await importProjectsAsync([customImportedProject]);
  assert(
    30,
    'P1-03 Local-First: importProjectsAsync() persists imported projects to localStorage',
    localImported.length === 1 &&
      loadProjects().length === 1 &&
      loadProjects()[0].name === 'Local Imported Villa'
  );

  // Local-first snapshot create, safe restore, bundle export/import, and delete
  const createdLocalSnap = await createProjectSnapshotAsync(localImported[0], {
    trigger: 'manual',
    label: 'Local Milestone v1',
    versionTag: 'v1.0-local',
    description: 'Local test checkpoint',
  });
  const localSnapsAfterCreate = await listProjectSnapshotsAsync(localImported[0]);
  const mutatedLocalDraft = {
    ...localImported[0],
    name: 'Local Imported Villa (Edited Draft)',
    plotWidth: 80,
  };
  await updateProjectAsync(mutatedLocalDraft);

  const localRestoreRes = await executeSafeRestoreAsync(mutatedLocalDraft, createdLocalSnap);
  if (localRestoreRes.success && localRestoreRes.restoredProject) {
    await updateProjectAsync(localRestoreRes.restoredProject);
  }
  const localSnapsAfterRestore = await listProjectSnapshotsAsync(localImported[0]);
  const hasLocalPreRestoreSafety = localSnapsAfterRestore.some(
    (s) => s.trigger === 'pre-restore-safety'
  );
  const localDeleteOk = await deleteProjectSnapshotAsync(
    localImported[0].id,
    createdLocalSnap.id
  );
  assert(
    31,
    'P1-03 Local-First: VersionWorkspace async create, safe restore (with safety backup), and delete work in localStorage',
    localSnapsAfterCreate.some((s) => s.id === createdLocalSnap.id) &&
      localRestoreRes.success &&
      loadProjects()[0].name === 'Local Imported Villa' &&
      hasLocalPreRestoreSafety &&
      localDeleteOk === true
  );

  await clearAllProjectsAsync();
  const rawAfterLocalClear = localStoreMap.get('architecture_intelligence_os_projects_v1');
  assert(
    32,
    'P1-03 Local-First: clearAllProjectsAsync() writes empty project array to localStorage',
    rawAfterLocalClear === '[]'
  );

  // Seed known local state before switching to Cloud Mode so we can verify Cloud Mode NEVER mutates localStorage
  await resetProjectsToSamplesAsync();
  const localSnapshotBeforeCloudMode = new Map(localStoreMap);

  // 6B. Start stateful in-memory Cloud API server with tenant isolation & failure injection
  const TENANT_A = '00000000-0000-4000-8000-000000000001';
  const TENANT_B = '00000000-0000-4000-8000-000000000002';
  const VALID_TOKEN = 'valid.cloud.jwt';

  const cloudProjectsByTenant = new Map<string, Map<string, any>>();
  const cloudSnapshotsByTenant = new Map<string, Map<string, any[]>>();
  cloudProjectsByTenant.set(TENANT_A, new Map());
  cloudProjectsByTenant.set(TENANT_B, new Map());
  cloudSnapshotsByTenant.set(TENANT_A, new Map());
  cloudSnapshotsByTenant.set(TENANT_B, new Map());

  let failNextCloudWrite = false;
  let failBatchOnIndex: number | null = null;
  let delayNextBatchMs = 0;
  let cloudRequestsCount = {
    getProjects: 0,
    postProjects: 0,
    putProjects: 0,
    deleteProjects: 0,
    getSnapshots: 0,
    postSnapshots: 0,
    batchImport: 0,
    batchReset: 0,
    batchClear: 0,
    batchSnapshots: 0,
  };

  const p103Server = http.createServer((req, res) => {
    const authHeader = req.headers['authorization'];
    const tenantHeader = req.headers['x-tenant-id'] as string | undefined;

    if (authHeader !== `Bearer ${VALID_TOKEN}`) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized', code: 'ERR_AUTH_REQUIRED' }));
      return;
    }

    if (!tenantHeader || (tenantHeader !== TENANT_A && tenantHeader !== TENANT_B)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden: Invalid tenant membership', code: 'ERR_TENANT_FORBIDDEN' }));
      return;
    }

    const tenantProjects = cloudProjectsByTenant.get(tenantHeader)!;
    const tenantSnapshots = cloudSnapshotsByTenant.get(tenantHeader)!;
    const urlObj = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = urlObj.pathname;

    let bodyRaw = '';
    req.on('data', (chunk) => {
      bodyRaw += chunk;
    });
    req.on('end', () => {
      const body = bodyRaw ? JSON.parse(bodyRaw) : {};

      if (failNextCloudWrite && req.method !== 'GET') {
        failNextCloudWrite = false;
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Simulated cloud write failure', code: 'ERR_CLOUD_WRITE_FAILED' }));
        return;
      }

      // GET /api/projects
      if (req.method === 'GET' && pathname === '/api/projects') {
        cloudRequestsCount.getProjects++;
        const list = Array.from(tenantProjects.values());
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ projects: list, total: list.length, limit: 50, offset: 0 }));
        return;
      }

      // POST /api/projects/batch (Transactional batch upsert)
      if (req.method === 'POST' && pathname === '/api/projects/batch') {
        cloudRequestsCount.batchImport++;
        const items = Array.isArray(body.projects) ? body.projects : null;
        if (!items || items.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid projects array', code: 'ERR_VALIDATION_FAILED' }));
          return;
        }
        const stagedProjects = new Map(tenantProjects);
        let stagedPostCount = 0;
        let stagedPutCount = 0;
        const upsertedList: any[] = [];
        for (let i = 0; i < items.length; i++) {
          if (failBatchOnIndex !== null && i === failBatchOnIndex) {
            failBatchOnIndex = null;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Simulated mid-batch DB failure at index ${i}`, code: 'ERR_BATCH_TRANSACTION_ABORTED' }));
            return;
          }
          const item = items[i];
          if (!item || typeof item.id !== 'string' || !item.name || Number(item.plotWidth) <= 0 || Number(item.plotLength) <= 0) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Invalid project at index ${i}`, code: 'ERR_VALIDATION_FAILED' }));
            return;
          }
          const existing = stagedProjects.get(item.id);
          if (existing) {
            stagedPutCount++;
            const updated = { ...existing, ...item, id: item.id, organizationId: tenantHeader };
            stagedProjects.set(item.id, updated);
            upsertedList.push(updated);
          } else {
            stagedPostCount++;
            const created = { ...item, id: item.id, organizationId: tenantHeader };
            stagedProjects.set(item.id, created);
            upsertedList.push(created);
          }
        }
        // Commit atomic transaction
        tenantProjects.clear();
        for (const [k, v] of stagedProjects.entries()) tenantProjects.set(k, v);
        cloudRequestsCount.postProjects += stagedPostCount;
        cloudRequestsCount.putProjects += stagedPutCount;
        const respond = () => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ projects: upsertedList, count: upsertedList.length }));
        };
        if (delayNextBatchMs > 0) {
          const d = delayNextBatchMs;
          delayNextBatchMs = 0;
          setTimeout(respond, d);
        } else {
          respond();
        }
        return;
      }

      // POST /api/projects/reset-samples (Transactional sample reset)
      if (req.method === 'POST' && pathname === '/api/projects/reset-samples') {
        cloudRequestsCount.batchReset++;
        const items = Array.isArray(body.projects) ? body.projects : null;
        if (!items || items.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid sample projects array', code: 'ERR_VALIDATION_FAILED' }));
          return;
        }
        const stagedProjects = new Map<string, any>();
        const stagedSnapshots = new Map(tenantSnapshots);
        let stagedPostCount = 0;
        let stagedPutCount = 0;
        const sampleIds = new Set<string>();
        const upsertedList: any[] = [];
        for (let i = 0; i < items.length; i++) {
          if (failBatchOnIndex !== null && i === failBatchOnIndex) {
            failBatchOnIndex = null;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Simulated mid-reset DB failure at index ${i}`, code: 'ERR_RESET_TRANSACTION_ABORTED' }));
            return;
          }
          const item = items[i];
          if (!item || typeof item.id !== 'string' || !item.name) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Invalid sample project at index ${i}`, code: 'ERR_VALIDATION_FAILED' }));
            return;
          }
          sampleIds.add(item.id);
          if (tenantProjects.has(item.id)) {
            stagedPutCount++;
          } else {
            stagedPostCount++;
          }
          const stored = { ...item, id: item.id, organizationId: tenantHeader };
          stagedProjects.set(item.id, stored);
          upsertedList.push(stored);
        }
        let deletedNonSamples = 0;
        for (const existingId of tenantProjects.keys()) {
          if (!sampleIds.has(existingId)) {
            deletedNonSamples++;
            stagedSnapshots.delete(existingId);
          }
        }
        // Commit atomic transaction
        tenantProjects.clear();
        for (const [k, v] of stagedProjects.entries()) tenantProjects.set(k, v);
        tenantSnapshots.clear();
        for (const [k, v] of stagedSnapshots.entries()) tenantSnapshots.set(k, v);
        cloudRequestsCount.postProjects += stagedPostCount;
        cloudRequestsCount.putProjects += stagedPutCount;
        cloudRequestsCount.deleteProjects += deletedNonSamples;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ projects: upsertedList, count: upsertedList.length }));
        return;
      }

      // DELETE /api/projects (Transactional clear all tenant projects)
      if (req.method === 'DELETE' && pathname === '/api/projects') {
        cloudRequestsCount.batchClear++;
        const confirmed =
          body?.confirm === true ||
          urlObj.searchParams.get('confirm') === 'true' ||
          req.headers['x-confirm-clear'] === 'true';
        if (!confirmed) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Explicit confirmation required', code: 'ERR_CONFIRMATION_REQUIRED' }));
          return;
        }
        if (failBatchOnIndex !== null) {
          failBatchOnIndex = null;
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Simulated clear-all transaction failure', code: 'ERR_CLEAR_TRANSACTION_ABORTED' }));
          return;
        }
        const deletedCount = tenantProjects.size;
        tenantProjects.clear();
        tenantSnapshots.clear();
        cloudRequestsCount.deleteProjects += deletedCount;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, deletedCount }));
        return;
      }

      // POST /api/projects
      if (req.method === 'POST' && pathname === '/api/projects') {
        cloudRequestsCount.postProjects++;
        const id = body.id;
        const stored = { ...body, id, organizationId: tenantHeader };
        tenantProjects.set(id, stored);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ project: stored }));
        return;
      }

      // PUT /api/projects/:id
      const projMatch = pathname.match(/^\/api\/projects\/([^/]+)$/);
      if (projMatch && req.method === 'PUT') {
        cloudRequestsCount.putProjects++;
        const id = projMatch[1];
        const existing = tenantProjects.get(id);
        if (!existing) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Project not found', code: 'ERR_PROJECT_NOT_FOUND' }));
          return;
        }
        const updated = { ...existing, ...body, id, organizationId: tenantHeader };
        tenantProjects.set(id, updated);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ project: updated }));
        return;
      }

      // DELETE /api/projects/:id
      if (projMatch && req.method === 'DELETE') {
        cloudRequestsCount.deleteProjects++;
        const id = projMatch[1];
        if (!tenantProjects.has(id)) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Project not found', code: 'ERR_PROJECT_NOT_FOUND' }));
          return;
        }
        tenantProjects.delete(id);
        tenantSnapshots.delete(id);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, id }));
        return;
      }

      // POST /api/projects/:id/snapshots/batch (Transactional snapshot batch import)
      const snapBatchMatch = pathname.match(/^\/api\/projects\/([^/]+)\/snapshots\/batch$/);
      if (snapBatchMatch && req.method === 'POST') {
        cloudRequestsCount.batchSnapshots++;
        const projectId = snapBatchMatch[1];
        if (!tenantProjects.has(projectId)) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Parent project not found', code: 'ERR_PROJECT_NOT_FOUND' }));
          return;
        }
        const items = Array.isArray(body.snapshots) ? body.snapshots : null;
        if (!items || items.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid snapshots batch array', code: 'ERR_VALIDATION_FAILED' }));
          return;
        }
        const existingList = (tenantSnapshots.get(projectId) || []).slice();
        const stagedList = existingList.slice();
        let nextRev = stagedList.reduce((max, s) => Math.max(max, s.revision), 0) + 1;
        let createdCount = 0;

        for (let i = 0; i < items.length; i++) {
          if (failBatchOnIndex !== null && i === failBatchOnIndex) {
            failBatchOnIndex = null;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Simulated mid-batch snapshot failure at index ${i}`, code: 'ERR_SNAPSHOT_BATCH_ABORTED' }));
            return;
          }
          const item = items[i];
          if (!item || !item.label || !item.projectData || !item.projectData.name || Number(item.projectData.plotWidth) <= 0) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Invalid snapshot item at index ${i}`, code: 'ERR_VALIDATION_FAILED' }));
            return;
          }
          const clientSnapId = item.clientSnapshotId || item.id;
          const vTag = item.versionTag || `v${nextRev}.0`;
          const alreadyExists = stagedList.some(
            (s) =>
              (clientSnapId && (s.id === clientSnapId || s.metrics?.sourceSnapshotId === clientSnapId)) ||
              (s.version_tag === vTag && s.label === item.label)
          );
          if (alreadyExists) {
            continue;
          }
          const record = {
            id: `00000000-0000-4000-8000-${String(100000000000 + nextRev)}`,
            project_id: projectId,
            organization_id: tenantHeader,
            revision: nextRev,
            version_tag: vTag,
            label: item.label,
            description: item.description || '',
            trigger: item.trigger || 'manual',
            author_id: null,
            metrics: { ...(item.metrics || {}), ...(clientSnapId ? { sourceSnapshotId: clientSnapId } : {}) },
            project_data: item.projectData,
            checksum: `sha256-rev-${nextRev}`,
            created_at: item.createdAt || new Date().toISOString(),
          };
          stagedList.push(record);
          nextRev++;
          createdCount++;
        }

        tenantSnapshots.set(projectId, stagedList);
        cloudRequestsCount.postSnapshots += createdCount;
        const sortedDesc = stagedList.slice().sort((a, b) => b.revision - a.revision);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            snapshots: sortedDesc,
            importedCount: createdCount,
            createdCount,
            skippedCount: items.length - createdCount,
          })
        );
        return;
      }

      // GET /api/projects/:id/snapshots
      const snapMatch = pathname.match(/^\/api\/projects\/([^/]+)\/snapshots$/);
      if (snapMatch && req.method === 'GET') {
        cloudRequestsCount.getSnapshots++;
        const projectId = snapMatch[1];
        const list = (tenantSnapshots.get(projectId) || []).slice().sort((a, b) => b.revision - a.revision);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ snapshots: list }));
        return;
      }

      // POST /api/projects/:id/snapshots
      if (snapMatch && req.method === 'POST') {
        cloudRequestsCount.postSnapshots++;
        const projectId = snapMatch[1];
        if (!tenantProjects.has(projectId)) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Parent project not found', code: 'ERR_PROJECT_NOT_FOUND' }));
          return;
        }
        const existingList = tenantSnapshots.get(projectId) || [];
        const nextRev = existingList.reduce((max, s) => Math.max(max, s.revision), 0) + 1;
        const record = {
          id: `00000000-0000-4000-8000-${String(100000000000 + nextRev)}`,
          project_id: projectId,
          organization_id: tenantHeader,
          revision: nextRev,
          version_tag: body.versionTag || `v${nextRev}.0`,
          label: body.label,
          description: body.description || '',
          trigger: body.trigger || 'manual',
          author_id: null,
          metrics: body.metrics || {},
          project_data: body.projectData,
          checksum: `sha256-rev-${nextRev}`,
          created_at: new Date().toISOString(),
        };
        existingList.push(record);
        tenantSnapshots.set(projectId, existingList);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ snapshot: record }));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    });
  });

  await new Promise<void>((resolve) => p103Server.listen(0, '127.0.0.1', resolve));
  const p103Port = (p103Server.address() as any).port;
  configureApiClient({ baseUrl: `http://127.0.0.1:${p103Port}`, timeoutMs: 3000 });
  setAuthSession({ token: VALID_TOKEN, tenantId: TENANT_A });
  setCloudPersistenceOverride(true);
  localWriteCount = 0;

  try {
    // Test 33: Cloud Mode resetProjectsToSamplesAsync() uses cloud API and does NOT write to localStorage
    const cloudSamples = await resetProjectsToSamplesAsync();
    const tenantACloudProjects = cloudProjectsByTenant.get(TENANT_A)!;
    assert(
      33,
      'P1-03 Cloud Mode: resetProjectsToSamplesAsync() persists samples to cloud API without writing to localStorage',
      cloudSamples.length === 3 &&
        tenantACloudProjects.size === 3 &&
        cloudRequestsCount.postProjects === 3 &&
        localWriteCount === 0
    );

    // Test 34: Cloud Mode importProjectsAsync() updates existing & creates new projects in cloud without writing to localStorage
    const cloudImportPayload = [
      { ...INITIAL_SAMPLE_PROJECTS[0], name: 'Highridge Cloud Updated' },
      { ...INITIAL_SAMPLE_PROJECTS[1], id: 'proj-cloud-new-04', name: 'New Cloud Tower', plotWidth: 45, plotLength: 75 },
    ];
    const cloudImported = await importProjectsAsync(cloudImportPayload);
    assert(
      34,
      'P1-03 Cloud Mode: importProjectsAsync() upserts projects to cloud API without writing to localStorage',
      cloudImported.length === 2 &&
        tenantACloudProjects.size === 4 &&
        cloudRequestsCount.putProjects === 1 &&
        cloudRequestsCount.postProjects === 4 &&
        localWriteCount === 0
    );

    // Test 35: Cloud Mode Decision-Twin & Constraint-Graph recalculation via loadProjectsAsync() fetches from cloud, not localStorage
    // Modify localStorage directly to prove recalculation reads from cloud and not stale localStorage
    localStoreMap.set('architecture_intelligence_os_projects_v1', JSON.stringify([{ ...INITIAL_SAMPLE_PROJECTS[0], name: 'STALE LOCAL PROJECT' }]));
    const prevGetProjectsCount = cloudRequestsCount.getProjects;
    const recomputedProjects = await loadProjectsAsync();
    const updatedSample0 = recomputedProjects.find((p) => p.id === 'proj-001')!;
    const twinAfterRecompute = evaluateDecisionTwin(updatedSample0);
    const graphAfterRecompute = evaluateConstraintGraph(updatedSample0);
    assert(
      35,
      'P1-03 Cloud Mode: Decision-Twin and Constraint-Graph recalculation loads fresh cloud state instead of stale localStorage',
      cloudRequestsCount.getProjects === prevGetProjectsCount + 1 &&
        recomputedProjects.length === 4 &&
        twinAfterRecompute.projectName === 'Highridge Cloud Updated' &&
        graphAfterRecompute.projectId === 'proj-001'
    );
    // Restore localStoreMap to snapshot before cloud mode
    localStoreMap.set(
      'architecture_intelligence_os_projects_v1',
      localSnapshotBeforeCloudMode.get('architecture_intelligence_os_projects_v1')!
    );
    localWriteCount = 0;

    // Test 36: Cloud Mode VersionWorkspace snapshot creation & listing use cloud API without writing to localStorage
    const targetProject = updatedSample0;
    const emptyCloudSnaps = await listProjectSnapshotsAsync(targetProject);
    const createdCloudSnap = await createProjectSnapshotAsync(targetProject, {
      trigger: 'manual',
      label: 'Cloud Schematic Baseline',
      versionTag: 'v1.0-cloud',
      description: 'Saved in PostgreSQL cloud',
    });
    const listedCloudSnaps = await listProjectSnapshotsAsync(targetProject);
    assert(
      36,
      'P1-03 Cloud Mode: createProjectSnapshotAsync & listProjectSnapshotsAsync use cloud API and never seed/write localStorage',
      emptyCloudSnaps.length === 0 &&
        createdCloudSnap.revisionNumber === 1 &&
        listedCloudSnaps.length === 1 &&
        listedCloudSnaps[0].label === 'Cloud Schematic Baseline' &&
        localWriteCount === 0
    );

    // Test 37: Cloud Mode executeSafeRestoreAsync records pre-restore-safety snapshot in cloud and restores project via cloud update
    const editedCloudProject = {
      ...targetProject,
      name: 'Highridge Post-Edit Draft',
      plotWidth: 72,
    };
    await updateProjectAsync(editedCloudProject);
    const cloudRestoreResult = await executeSafeRestoreAsync(editedCloudProject, createdCloudSnap);
    let restoredInCloudOk = false;
    if (cloudRestoreResult.success && cloudRestoreResult.restoredProject) {
      restoredInCloudOk = await updateProjectAsync(cloudRestoreResult.restoredProject);
    }
    const snapsAfterCloudRestore = await listProjectSnapshotsAsync(targetProject);
    const reloadedAfterRestore = (await loadProjectsAsync()).find((p) => p.id === targetProject.id)!;
    assert(
      37,
      'P1-03 Cloud Mode: executeSafeRestoreAsync records pre-restore-safety in cloud and restores project state in cloud',
      cloudRestoreResult.success &&
        restoredInCloudOk &&
        snapsAfterCloudRestore.length === 2 &&
        snapsAfterCloudRestore.some((s) => s.trigger === 'pre-restore-safety' && s.revisionNumber === 2) &&
        reloadedAfterRestore.name === 'Highridge Cloud Updated' &&
        reloadedAfterRestore.plotWidth === targetProject.plotWidth &&
        localWriteCount === 0
    );

    // Test 38: Cloud Mode export & import revision bundle uses cloud API without writing to localStorage
    const exportedBundle = await exportProjectRevisionBundleAsync(targetProject);
    const externalBundle = {
      ...exportedBundle,
      snapshots: [
        ...exportedBundle.snapshots,
        {
          ...exportedBundle.snapshots[0],
          id: 'external-snap-99',
          revisionNumber: 3,
          versionTag: 'v2.0-consultant',
          label: 'Consultant Structural Update',
        },
      ],
    };
    const importedBundleRes = await importProjectRevisionBundleAsync(
      targetProject,
      JSON.stringify(externalBundle)
    );
    assert(
      38,
      'P1-03 Cloud Mode: exportProjectRevisionBundleAsync & importProjectRevisionBundleAsync persist new snapshots to cloud without localStorage writes',
      exportedBundle.snapshots.length === 2 &&
        importedBundleRes.importedCount === 1 &&
        importedBundleRes.snapshots.length === 3 &&
        importedBundleRes.snapshots.some((s) => s.label === 'Consultant Structural Update') &&
        localWriteCount === 0
    );

    // Test 39: Cloud Mode deleteProjectSnapshotAsync rejects cleanly (no backend DELETE contract for immutable revisions) without mutating localStorage
    let caughtImmutableDeleteError = false;
    try {
      await deleteProjectSnapshotAsync(targetProject.id, createdCloudSnap.id);
    } catch (err: any) {
      if (err.message && err.message.includes('immutable')) {
        caughtImmutableDeleteError = true;
      }
    }
    assert(
      39,
      'P1-03 Cloud Mode: deleteProjectSnapshotAsync rejects cleanly for immutable cloud revisions without touching localStorage',
      caughtImmutableDeleteError && localWriteCount === 0
    );

    // Test 40: Cloud write failures surface errors and do NOT overwrite cloud or local data
    const cloudCountBeforeFail = tenantACloudProjects.size;
    failNextCloudWrite = true;
    let caughtImportFailure = false;
    try {
      await importProjectsAsync([{ ...INITIAL_SAMPLE_PROJECTS[0], id: 'proj-fail-99', name: 'Should Fail' }]);
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 500) {
        caughtImportFailure = true;
      }
    }

    failNextCloudWrite = true;
    let caughtSnapshotFailure = false;
    try {
      await createProjectSnapshotAsync(targetProject, {
        trigger: 'manual',
        label: 'Should Fail Snapshot',
      });
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 500) {
        caughtSnapshotFailure = true;
      }
    }
    const snapsCountAfterFailedCreate = (await listProjectSnapshotsAsync(targetProject)).length;
    assert(
      40,
      'P1-03 Cloud Mode: Failed cloud writes surface ApiError(500) and never corrupt cloud or local data',
      caughtImportFailure &&
        caughtSnapshotFailure &&
        tenantACloudProjects.size === cloudCountBeforeFail &&
        snapsCountAfterFailedCreate === 3 &&
        localWriteCount === 0
    );

    // Test 41: Tenant isolation & authentication enforcement across P1-03 operations
    setAuthSession({ token: VALID_TOKEN, tenantId: TENANT_B });
    const tenantBLoaded = await loadProjectsAsync();
    setAuthSession({ token: VALID_TOKEN, tenantId: '00000000-0000-4000-8000-000000000099' });
    let caughtForbiddenTenant = false;
    try {
      await resetProjectsToSamplesAsync();
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 403) {
        caughtForbiddenTenant = true;
      }
    }
    setAuthSession({ token: VALID_TOKEN, tenantId: TENANT_A });
    assert(
      41,
      'P1-03 Cloud Mode: Tenant B cannot see Tenant A projects and unauthorized tenant is rejected with HTTP 403',
      tenantBLoaded.length === 0 &&
        tenantACloudProjects.size === 4 &&
        caughtForbiddenTenant
    );

    // Test 42: Cloud Mode clearAllProjectsAsync() deletes all tenant projects in cloud without touching localStorage
    await clearAllProjectsAsync();
    const afterCloudClear = await loadProjectsAsync();
    assert(
      42,
      'P1-03 Cloud Mode: clearAllProjectsAsync() deletes all tenant projects in cloud without mutating localStorage',
      afterCloudClear.length === 0 &&
        tenantACloudProjects.size === 0 &&
        localWriteCount === 0 &&
        localStoreMap.get('architecture_intelligence_os_projects_v1') ===
          localSnapshotBeforeCloudMode.get('architecture_intelligence_os_projects_v1')
    );

    // ---------------------------------------------------------------------------
    // 10. P2-04 Transactional Cloud Batch Operations & Failure Recovery (Tests 43–48)
    // ---------------------------------------------------------------------------
    console.log('\n--- Section 10: P2-04 Transactional Cloud Batch Operations & Recovery ---');

    // Test 43: P2-04 importProjectsAsync() mid-batch failure rolls back entire batch (item #1 not committed if item #2 fails)
    const batchImportBeforeCount = tenantACloudProjects.size; // 0
    failBatchOnIndex = 1; // Item #0 succeeds in staging, Item #1 fails -> rollback
    let caughtMidBatchImportError = false;
    try {
      await importProjectsAsync([
        { ...INITIAL_SAMPLE_PROJECTS[0], id: 'proj-atomic-01', name: 'Atomic Batch 1' },
        { ...INITIAL_SAMPLE_PROJECTS[1], id: 'proj-atomic-02', name: 'Atomic Batch 2' },
      ]);
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 500) {
        caughtMidBatchImportError = true;
      }
    }
    assert(
      43,
      'P2-04 Cloud Batch: importProjectsAsync() mid-batch failure rolls back item #0 and leaves 0 partial commits',
      caughtMidBatchImportError &&
        tenantACloudProjects.size === batchImportBeforeCount &&
        !tenantACloudProjects.has('proj-atomic-01') &&
        localWriteCount === 0
    );

    // Test 44: P2-04 resetProjectsToSamplesAsync() mid-reset failure preserves existing tenant projects
    await importProjectsAsync([
      { ...INITIAL_SAMPLE_PROJECTS[0], id: 'proj-custom-keep', name: 'Custom Tenant Project' },
    ]);
    failBatchOnIndex = 2; // Fail on 3rd sample project during reset
    let caughtMidResetError = false;
    try {
      await resetProjectsToSamplesAsync();
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 500) {
        caughtMidResetError = true;
      }
    }
    const projectsAfterFailedReset = await loadProjectsAsync();
    assert(
      44,
      'P2-04 Cloud Batch: resetProjectsToSamplesAsync() mid-reset failure preserves existing custom project without partial sample overwrite',
      caughtMidResetError &&
        tenantACloudProjects.size === 1 &&
        projectsAfterFailedReset.length === 1 &&
        projectsAfterFailedReset[0].id === 'proj-custom-keep' &&
        projectsAfterFailedReset[0].name === 'Custom Tenant Project'
    );

    // Test 45: P2-04 clearAllProjectsAsync() mid-transaction failure preserves tenant projects & Tenant B remains isolated
    setAuthSession({ token: VALID_TOKEN, tenantId: TENANT_B });
    await importProjectsAsync([{ ...INITIAL_SAMPLE_PROJECTS[1], id: 'proj-tenant-b-01', name: 'Tenant B Fortress' }]);
    setAuthSession({ token: VALID_TOKEN, tenantId: TENANT_A });
    failBatchOnIndex = 0; // Trigger clear-all failure
    let caughtClearFailure = false;
    try {
      await clearAllProjectsAsync();
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 500) {
        caughtClearFailure = true;
      }
    }
    const tenantBProjectsMap = cloudProjectsByTenant.get(TENANT_B)!;
    assert(
      45,
      'P2-04 Cloud Batch: clearAllProjectsAsync() failure preserves Tenant A projects and successful clear never touches Tenant B',
      caughtClearFailure &&
        tenantACloudProjects.size === 1 &&
        tenantBProjectsMap.size === 1
    );

    // Test 46: P2-04 importProjectRevisionBundleAsync() pre-validates corrupted snapshot items and rolls back mid-batch snapshot failures
    const validResetProjects = await resetProjectsToSamplesAsync();
    const baseProj = validResetProjects[0];
    const baseSnap = await createProjectSnapshotAsync(baseProj, {
      trigger: 'manual',
      label: 'Base Snapshot R1',
      versionTag: 'v1.0',
    });
    const validBundleObj = await exportProjectRevisionBundleAsync(baseProj);

    // 46a: Corrupted 2nd snapshot in bundle (invalid plotWidth: -10) rejected before any API call
    const corruptedBundle = {
      ...validBundleObj,
      snapshots: [
        ...validBundleObj.snapshots,
        {
          ...validBundleObj.snapshots[0],
          id: 'snap-valid-new-1',
          revisionNumber: 2,
          versionTag: 'v2.0',
          label: 'Valid New Snapshot',
        },
        {
          ...validBundleObj.snapshots[0],
          id: 'snap-corrupt-new-2',
          revisionNumber: 3,
          versionTag: 'v3.0',
          label: 'Corrupt Snapshot',
          projectData: { ...baseProj, plotWidth: -10 },
        },
      ],
    };
    const batchSnapCountBeforeCorrupt = cloudRequestsCount.batchSnapshots;
    let caughtCorruptBundle = false;
    try {
      await importProjectRevisionBundleAsync(baseProj, JSON.stringify(corruptedBundle));
    } catch (err: any) {
      if (err.message && err.message.includes('Invalid snapshot')) {
        caughtCorruptBundle = true;
      }
    }

    // 46b: Mid-batch server failure on 2nd new snapshot rolls back 1st new snapshot
    const twoNewSnapsBundle = {
      ...validBundleObj,
      snapshots: [
        ...validBundleObj.snapshots,
        {
          ...validBundleObj.snapshots[0],
          id: 'snap-atomic-new-1',
          revisionNumber: 2,
          versionTag: 'v2.0-atomic',
          label: 'Atomic Snap 1',
        },
        {
          ...validBundleObj.snapshots[0],
          id: 'snap-atomic-new-2',
          revisionNumber: 3,
          versionTag: 'v3.0-atomic',
          label: 'Atomic Snap 2',
        },
      ],
    };
    failBatchOnIndex = 1; // Fail on 2nd new snapshot in batch
    let caughtMidSnapBatchError = false;
    try {
      await importProjectRevisionBundleAsync(baseProj, JSON.stringify(twoNewSnapsBundle));
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 500) {
        caughtMidSnapBatchError = true;
      }
    }
    const snapsAfterFailedBundle = await listProjectSnapshotsAsync(baseProj);
    assert(
      46,
      'P2-04 Cloud Batch: importProjectRevisionBundleAsync() blocks corrupted items pre-flight and rolls back mid-batch server failures',
      caughtCorruptBundle &&
        cloudRequestsCount.batchSnapshots === batchSnapCountBeforeCorrupt + 1 &&
        caughtMidSnapBatchError &&
        snapsAfterFailedBundle.length === 1 &&
        snapsAfterFailedBundle[0].id === baseSnap.id
    );

    // Test 47: P2-04 Deterministic retry idempotency across batch import, reset, clear, and revision bundle import
    const bundleImportFirst = await importProjectRevisionBundleAsync(baseProj, JSON.stringify(twoNewSnapsBundle));
    const bundleImportRetry = await importProjectRevisionBundleAsync(baseProj, JSON.stringify(twoNewSnapsBundle));
    const retryProjectsPayload = [
      { ...baseProj, name: 'Idempotent Retry Name' },
      { ...INITIAL_SAMPLE_PROJECTS[1], id: 'proj-idem-new', name: 'Idempotent New Project' },
    ];
    const importFirst = await importProjectsAsync(retryProjectsPayload);
    const importSecond = await importProjectsAsync(retryProjectsPayload);
    assert(
      47,
      'P2-04 Cloud Batch: Retrying importProjectRevisionBundleAsync() and importProjectsAsync() is idempotent without duplicate records',
      bundleImportFirst.importedCount === 2 &&
        bundleImportRetry.importedCount === 0 &&
        bundleImportRetry.snapshots.length === 3 &&
        importFirst.length === 2 &&
        importSecond.length === 2 &&
        tenantACloudProjects.size === 4
    );

    // Test 48: P2-04 Client timeout (ERR_REQUEST_TIMEOUT / outcomeUnknown) surfaces explicit ambiguity and recovers cleanly on retry
    configureApiClient({ baseUrl: `http://127.0.0.1:${p103Port}`, timeoutMs: 80 });
    delayNextBatchMs = 250; // Server commits transaction but response arrives after client timeout
    let caughtTimeoutError: ApiError | null = null;
    const timeoutBatchPayload = [
      { ...INITIAL_SAMPLE_PROJECTS[0], id: 'proj-timeout-recover', name: 'Committed Before Timeout' },
    ];
    try {
      await importProjectsAsync(timeoutBatchPayload);
    } catch (err: any) {
      if (err instanceof ApiError) {
        caughtTimeoutError = err;
      }
    }
    // Wait for delayed server response to finish
    await new Promise((r) => setTimeout(r, 220));
    configureApiClient({ baseUrl: `http://127.0.0.1:${p103Port}`, timeoutMs: 3000 });
    // Retry the same batch after timeout — idempotent upsert succeeds cleanly without duplicate state
    const recoveredAfterTimeout = await importProjectsAsync(timeoutBatchPayload);
    const loadedAfterTimeoutRetry = await loadProjectsAsync();
    assert(
      48,
      'P2-04 Cloud Batch: Client timeout surfaces ERR_REQUEST_TIMEOUT with outcomeUnknown=true and idempotent retry recovers cleanly',
      caughtTimeoutError !== null &&
        caughtTimeoutError.code === 'ERR_REQUEST_TIMEOUT' &&
        caughtTimeoutError.status === 408 &&
        (caughtTimeoutError.details as Record<string, unknown> | undefined)?.outcomeUnknown === true &&
        recoveredAfterTimeout.length === 1 &&
        recoveredAfterTimeout[0].id === 'proj-timeout-recover' &&
        loadedAfterTimeoutRetry.find((p) => p.id === 'proj-timeout-recover')?.name === 'Committed Before Timeout' &&
        tenantACloudProjects.size === 5
    );
  } finally {
    setCloudPersistenceOverride(null);
    p103Server.close();
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log('P53 STAGE 2 CLIENT INTEGRATION TEST SUMMARY');
  console.log('================================================================');

  const passedCount = results.filter((r) => r.passed).length;
  const totalCount = results.length;
  const allPassed = passedCount === totalCount;

  console.log(`Total Stage 2 Tests        : ${totalCount}`);
  console.log(`Tests Passed               : ${passedCount}`);
  console.log(`Tests Failed               : ${totalCount - passedCount}`);
  console.log(`Stage 2 Verification Status: ${allPassed ? 'PASSED (100%)' : 'FAILED'}`);
  console.log('================================================================');

  if (!allPassed) {
    process.exit(1);
  }
}

runStage2Tests().catch((err) => {
  console.error('[Stage 2 Test Runner] Fatal error:', err);
  process.exit(1);
});
