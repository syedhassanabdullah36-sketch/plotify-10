/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import http from 'http';
import crypto from 'crypto';
import { createApp, resolveSafeRequestId } from './server/app';
import { getAppPool } from './server/db/pool';
import {
  createJwtToken,
  verifyJwtToken,
  defaultDbMembershipChecker,
  setMembershipChecker,
  resetMembershipChecker,
} from './server/middleware/auth';
import { getCloudPersistenceStatus } from './src/services/storage';

console.log('================================================================');
console.log('PLOTIFY — P53 STAGE 1: HTTP API GATEWAY & AUTHENTICATION TESTS');
console.log('Mode: Isolated In-Memory HTTP Server & Offline Middleware Audit');
console.log('================================================================\n');

const TEST_SECRET = 'stage1_test_secret_for_verification_only_12345';
process.env.JWT_SECRET = TEST_SECRET;

const ALICE_ID = '11111111-1111-4111-8111-111111111111';
const BOB_ID = '22222222-2222-4222-8222-222222222222';
const TENANT_ALPHA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT_BETA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TENANT_GAMMA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

// Setup mock membership validator for offline testing
setMembershipChecker(async (userId: string, orgId: string) => {
  if (userId === ALICE_ID && orgId === TENANT_ALPHA) return 'owner';
  if (userId === BOB_ID && orgId === TENANT_BETA) return 'member';
  return null; // Denied for any other pair
});

interface ApiAssertion {
  testNumber: number;
  description: string;
  passed: boolean;
  details?: string;
}

const assertions: ApiAssertion[] = [];

function assert(num: number, desc: string, condition: boolean, details?: string) {
  assertions.push({ testNumber: num, description: desc, passed: condition, details });
  if (condition) {
    console.log(`  ✓ Test ${num}: ${desc}`);
  } else {
    console.error(`  ✗ Test ${num}: ${desc}${details ? ` — ${details}` : ''}`);
  }
}

async function runApiTestSuite(): Promise<void> {
  const app = createApp();
  const server = http.createServer(app);

  // Start server on an ephemeral random port
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const aliceToken = createJwtToken({ sub: ALICE_ID, email: 'alice@example.com' }, TEST_SECRET);
  const bobToken = createJwtToken({ sub: BOB_ID, email: 'bob@example.com' }, TEST_SECRET);
  const expiredToken = createJwtToken(
    { sub: ALICE_ID, email: 'alice@example.com', exp: Math.floor(Date.now() / 1000) - 60 },
    TEST_SECRET
  );
  const invalidSignatureToken = aliceToken.slice(0, -6) + 'xxxxxx';

  try {
    // -------------------------------------------------------------------------
    // 1. Unauthenticated Requests
    // -------------------------------------------------------------------------
    const res1 = await fetch(`${baseUrl}/api/projects`, {
      headers: { 'X-Tenant-ID': TENANT_ALPHA },
    });
    const body1 = await res1.json();
    assert(
      1,
      'Unauthenticated requests are rejected with HTTP 401',
      res1.status === 401 && body1.code === 'ERR_UNAUTHENTICATED',
      `Got ${res1.status} - ${JSON.stringify(body1)}`
    );

    // -------------------------------------------------------------------------
    // 2. Invalid & Expired Tokens
    // -------------------------------------------------------------------------
    const res2a = await fetch(`${baseUrl}/api/projects`, {
      headers: {
        Authorization: `Bearer ${invalidSignatureToken}`,
        'X-Tenant-ID': TENANT_ALPHA,
      },
    });
    const body2a = await res2a.json();

    const res2b = await fetch(`${baseUrl}/api/projects`, {
      headers: {
        Authorization: `Bearer ${expiredToken}`,
        'X-Tenant-ID': TENANT_ALPHA,
      },
    });
    const body2b = await res2b.json();

    assert(
      2,
      'Forged and expired JWT tokens are rejected with HTTP 401',
      res2a.status === 401 &&
        body2a.code === 'ERR_INVALID_TOKEN' &&
        res2b.status === 401 &&
        body2b.code === 'ERR_INVALID_TOKEN'
    );

    // -------------------------------------------------------------------------
    // 3. Authenticated User Without Tenant Membership (HTTP 403)
    // -------------------------------------------------------------------------
    // Alice is member of Alpha, but tries to access Beta
    const res3 = await fetch(`${baseUrl}/api/projects`, {
      headers: {
        Authorization: `Bearer ${aliceToken}`,
        'X-Tenant-ID': TENANT_BETA,
      },
    });
    const body3 = await res3.json();
    assert(
      3,
      'Authenticated user without tenant membership receives HTTP 403 Forbidden',
      res3.status === 403 && body3.code === 'ERR_TENANT_MEMBERSHIP_DENIED',
      `Got ${res3.status} - ${JSON.stringify(body3)}`
    );

    // -------------------------------------------------------------------------
    // 4. Missing Tenant Selector (HTTP 400)
    // -------------------------------------------------------------------------
    const res4 = await fetch(`${baseUrl}/api/projects`, {
      headers: {
        Authorization: `Bearer ${aliceToken}`,
      },
    });
    const body4 = await res4.json();
    assert(
      4,
      'Missing X-Tenant-ID selector is rejected with HTTP 400 Bad Request',
      res4.status === 400 && body4.code === 'ERR_MISSING_TENANT_ID'
    );

    // -------------------------------------------------------------------------
    // 5. Malformed Tenant UUID (HTTP 400)
    // -------------------------------------------------------------------------
    const res5 = await fetch(`${baseUrl}/api/projects`, {
      headers: {
        Authorization: `Bearer ${aliceToken}`,
        'X-Tenant-ID': "not-a-uuid-1' OR 1=1",
      },
    });
    const body5 = await res5.json();
    assert(
      5,
      'Malformed tenant identifier is rejected with HTTP 400 Bad Request',
      res5.status === 400 && body5.code === 'ERR_INVALID_TENANT_UUID'
    );

    // -------------------------------------------------------------------------
    // 6. Anti-Spoofing: Client Cannot Inject Arbitrary User ID
    // -------------------------------------------------------------------------
    // Bob sends a body claiming to be Alice, but his Bearer token is Bob's
    const res6 = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${bobToken}`,
        'X-Tenant-ID': TENANT_ALPHA, // Bob attempts to access Alpha pretending to be Alice
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Spoofed Project',
        claimedUserId: ALICE_ID,
      }),
    });
    const body6 = await res6.json();
    assert(
      6,
      'Client cannot spoof tenant membership by injecting forged IDs in request payload',
      res6.status === 403 && body6.code === 'ERR_TENANT_MEMBERSHIP_DENIED'
    );

    // -------------------------------------------------------------------------
    // 7. Request Body Validation (HTTP 400)
    // -------------------------------------------------------------------------
    const res7 = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${aliceToken}`,
        'X-Tenant-ID': TENANT_ALPHA,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: '', // Empty name should be rejected by route validator
      }),
    });
    const body7 = await res7.json();
    assert(
      7,
      'Invalid project body (empty name) is rejected with HTTP 400',
      res7.status === 400 && body7.code === 'ERR_VALIDATION_NAME'
    );

    // -------------------------------------------------------------------------
    // 8. Legacy Project ID Direct Submission Rejection (HTTP 400)
    // -------------------------------------------------------------------------
    const res8a = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${aliceToken}`,
        'X-Tenant-ID': TENANT_ALPHA,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: 'proj-001',
        name: 'Attempted Legacy ID Project',
      }),
    });
    const body8a = await res8a.json();

    const res8b = await fetch(`${baseUrl}/api/projects/proj-001`, {
      headers: {
        Authorization: `Bearer ${aliceToken}`,
        'X-Tenant-ID': TENANT_ALPHA,
      },
    });
    const body8b = await res8b.json();

    assert(
      8,
      'Legacy non-UUID project IDs (e.g. "proj-001") are rejected with HTTP 400 Bad Request',
      res8a.status === 400 &&
        body8a.code === 'ERR_INVALID_PROJECT_ID' &&
        res8b.status === 400 &&
        body8b.code === 'ERR_INVALID_ID'
    );

    // -------------------------------------------------------------------------
    // 9. Archive Boundary Limits Validation (HTTP 400)
    // -------------------------------------------------------------------------
    const res9 = await fetch(`${baseUrl}/api/archives/ingest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${aliceToken}`,
        'X-Tenant-ID': TENANT_ALPHA,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        archiveName: 'Oversized Archive',
        items: Array.from({ length: 105 }, (_, i) => ({
          project: { id: `proj-${i}`, name: `P${i}`, plotWidth: 50, plotLength: 100 },
        })),
      }),
    });
    const body9 = await res9.json();
    assert(
      9,
      'Archive payload exceeding 100 projects is rejected with HTTP 400',
      res9.status === 400 && body9.code === 'ERR_ARCHIVE_VALIDATION'
    );

    // -------------------------------------------------------------------------
    // 10. Public Health Check & Security Headers
    // -------------------------------------------------------------------------
    const res10 = await fetch(`${baseUrl}/api/health`);
    const body10 = await res10.json();
    const nosniff = res10.headers.get('x-content-type-options');
    const frameOptions = res10.headers.get('x-frame-options');

    assert(
      10,
      'Public /api/health endpoint is accessible with security headers without authentication',
      res10.status === 200 &&
        body10.status === 'healthy' &&
        nosniff === 'nosniff' &&
        frameOptions === 'SAMEORIGIN'
    );

    // -------------------------------------------------------------------------
    // 11. LocalStorage Continuity: Cloud Mode Remains Disabled
    // -------------------------------------------------------------------------
    const cloudStatus = getCloudPersistenceStatus();
    assert(
      11,
      'Existing localStorage persistence remains unchanged; cloud persistence is explicitly NOT IMPLEMENTED',
      cloudStatus.isCloudActive === false &&
        cloudStatus.provider === 'local_storage' &&
        cloudStatus.status === 'disabled'
    );
    // -------------------------------------------------------------------------
    // 12. Security Hardening: Mandatory JWT Expiration (exp)
    // -------------------------------------------------------------------------
    function createRawToken(payload: Record<string, unknown>, secret: string): string {
      const header = { alg: 'HS256', typ: 'JWT' };
      const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
      const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const signatureB64 = crypto
        .createHmac('sha256', secret)
        .update(`${headerB64}.${payloadB64}`)
        .digest('base64url');
      return `${headerB64}.${payloadB64}.${signatureB64}`;
    }

    const tokenWithoutExp = createRawToken({ sub: ALICE_ID, email: 'alice@example.com' }, TEST_SECRET);
    const res12 = await fetch(`${baseUrl}/api/projects`, {
      headers: {
        Authorization: `Bearer ${tokenWithoutExp}`,
        'X-Tenant-ID': TENANT_ALPHA,
      },
    });
    const body12 = await res12.json();
    assert(
      12,
      'Tokens missing mandatory "exp" claim are rejected with HTTP 401',
      res12.status === 401 && body12.code === 'ERR_INVALID_TOKEN'
    );

    // -------------------------------------------------------------------------
    // 13. Security Hardening: Maximum JWT Lifetime Enforced (<= 24h)
    // -------------------------------------------------------------------------
    const nowSec = Math.floor(Date.now() / 1000);
    const tokenExcessiveLifetime = createRawToken(
      { sub: ALICE_ID, exp: nowSec + 86400 * 30, iat: nowSec },
      TEST_SECRET
    );
    const res13 = await fetch(`${baseUrl}/api/projects`, {
      headers: {
        Authorization: `Bearer ${tokenExcessiveLifetime}`,
        'X-Tenant-ID': TENANT_ALPHA,
      },
    });
    const body13 = await res13.json();
    assert(
      13,
      'Tokens with lifetime exceeding maximum threshold (24h) are rejected with HTTP 401',
      res13.status === 401 && body13.code === 'ERR_INVALID_TOKEN'
    );

    // -------------------------------------------------------------------------
    // 14. Snapshots Endpoint Rejects Non-UUID Project Identifiers
    // -------------------------------------------------------------------------
    const res14a = await fetch(`${baseUrl}/api/projects/legacy-proj-123/snapshots`, {
      headers: {
        Authorization: `Bearer ${aliceToken}`,
        'X-Tenant-ID': TENANT_ALPHA,
      },
    });
    const body14a = await res14a.json();

    const res14b = await fetch(`${baseUrl}/api/projects/legacy-proj-123/snapshots`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${aliceToken}`,
        'X-Tenant-ID': TENANT_ALPHA,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        label: 'Test Snapshot',
        projectData: { id: 'dummy', name: 'Dummy' },
      }),
    });
    const body14b = await res14b.json();

    assert(
      14,
      'Snapshots GET and POST reject non-UUID project IDs with HTTP 400 Bad Request',
      res14a.status === 400 &&
        body14a.code === 'ERR_INVALID_PROJECT_ID' &&
        res14b.status === 400 &&
        body14b.code === 'ERR_INVALID_PROJECT_ID'
    );

    // -------------------------------------------------------------------------
    // 15. Project List Pagination Input Validation
    // -------------------------------------------------------------------------
    const res15a = await fetch(`${baseUrl}/api/projects?limit=-5`, {
      headers: {
        Authorization: `Bearer ${aliceToken}`,
        'X-Tenant-ID': TENANT_ALPHA,
      },
    });
    const body15a = await res15a.json();

    const res15b = await fetch(`${baseUrl}/api/projects?limit=999`, {
      headers: {
        Authorization: `Bearer ${aliceToken}`,
        'X-Tenant-ID': TENANT_ALPHA,
      },
    });
    const body15b = await res15b.json();

    const res15c = await fetch(`${baseUrl}/api/projects?offset=invalid`, {
      headers: {
        Authorization: `Bearer ${aliceToken}`,
        'X-Tenant-ID': TENANT_ALPHA,
      },
    });
    const body15c = await res15c.json();

    assert(
      15,
      'Invalid pagination parameters (negative limit, excessive limit >100, malformed offset) reject with HTTP 400',
      res15a.status === 400 &&
        body15a.code === 'ERR_INVALID_PAGINATION' &&
        res15b.status === 400 &&
        body15b.code === 'ERR_INVALID_PAGINATION' &&
        res15c.status === 400 &&
        body15c.code === 'ERR_INVALID_PAGINATION'
    );

    // -------------------------------------------------------------------------
    // 16. Project Creation Input Boundary & Non-Negative Budget Validation
    // -------------------------------------------------------------------------
    const res16a = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${aliceToken}`,
        'X-Tenant-ID': TENANT_ALPHA,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Valid Project',
        budget: -50000,
      }),
    });
    const body16a = await res16a.json();

    const res16b = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${aliceToken}`,
        'X-Tenant-ID': TENANT_ALPHA,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'A'.repeat(256),
      }),
    });
    const body16b = await res16b.json();

    assert(
      16,
      'Project creation rejects negative budgets and oversized names (>255 chars) with HTTP 400',
      res16a.status === 400 &&
        body16a.code === 'ERR_VALIDATION_BUDGET' &&
        res16b.status === 400 &&
        body16b.code === 'ERR_VALIDATION_NAME'
    );

    // -------------------------------------------------------------------------
    // 17–22. P0-01 Regression Suite: defaultDbMembershipChecker & RLS Context
    // -------------------------------------------------------------------------
    // Simulated PostgreSQL Pool enforcing FORCE ROW LEVEL SECURITY on organization_memberships:
    // Queries against organization_memberships return 0 rows unless executed inside an active
    // transaction where set_config('app.current_tenant_id', orgId, true) was set on the SAME client.
    interface RlsClientLog {
      clientId: number;
      queries: Array<{ sql: string; params?: unknown[]; activeTenant: string | null; inTx: boolean }>;
      released: boolean;
      leakedTenantOnRelease: string | null;
    }

    function createRlsEnforcingMockPool(options?: { failOnSetConfig?: boolean; failOnSelect?: boolean }) {
      const logs: RlsClientLog[] = [];
      let nextClientId = 1;
      // Seeded memberships in simulated DB
      const memberships = [
        { user_id: ALICE_ID, organization_id: TENANT_ALPHA, role: 'owner' },
        { user_id: BOB_ID, organization_id: TENANT_BETA, role: 'member' },
      ];

      // Shared physical connection state to detect session-level leaks across pool checkouts
      let persistedSessionTenant: string | null = null;

      const pool = {
        connect: async () => {
          const clientId = nextClientId++;
          let inTx = false;
          let txLocalTenant: string | null = null;
          const clientLog: RlsClientLog = {
            clientId,
            queries: [],
            released: false,
            leakedTenantOnRelease: null,
          };
          logs.push(clientLog);

          return {
            query: async (sqlText: string, params?: unknown[]) => {
              const normalizedSql = sqlText.replace(/\s+/g, ' ').trim();
              const effectiveTenant = inTx ? (txLocalTenant ?? persistedSessionTenant) : persistedSessionTenant;
              clientLog.queries.push({
                sql: normalizedSql,
                params,
                activeTenant: effectiveTenant,
                inTx,
              });

              if (normalizedSql === 'BEGIN') {
                inTx = true;
                txLocalTenant = null;
                return { rows: [], rowCount: 0 };
              }
              if (normalizedSql === 'COMMIT' || normalizedSql === 'ROLLBACK') {
                inTx = false;
                txLocalTenant = null;
                return { rows: [], rowCount: 0 };
              }
              if (normalizedSql.startsWith('SELECT set_config(')) {
                if (options?.failOnSetConfig) {
                  throw new Error('Simulated set_config failure');
                }
                const settingName = params?.[0];
                const settingVal = params?.[1] as string;
                const isLocal = normalizedSql.includes(', true)') || params?.[2] === true;
                if (settingName === 'app.current_tenant_id') {
                  if (isLocal) {
                    if (!inTx) {
                      throw new Error('set_config(..., true) called outside BEGIN transaction block');
                    }
                    txLocalTenant = settingVal;
                  } else {
                    persistedSessionTenant = settingVal;
                  }
                }
                return { rows: [{ set_config: settingVal }], rowCount: 1 };
              }
              if (normalizedSql.includes('FROM organization_memberships')) {
                if (options?.failOnSelect) {
                  throw new Error('Simulated membership query failure');
                }
                const queryUserId = params?.[0];
                const queryOrgId = params?.[1];
                // Enforce PostgreSQL FORCE ROW LEVEL SECURITY:
                // USING (organization_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
                if (!effectiveTenant) {
                  return { rows: [], rowCount: 0 };
                }
                const matching = memberships.filter(
                  (m) =>
                    m.organization_id === effectiveTenant &&
                    m.user_id === queryUserId &&
                    m.organization_id === queryOrgId
                );
                return {
                  rows: matching.map((m) => ({ role: m.role })),
                  rowCount: matching.length,
                };
              }
              return { rows: [], rowCount: 0 };
            },
            release: () => {
              clientLog.released = true;
              clientLog.leakedTenantOnRelease = txLocalTenant ?? persistedSessionTenant;
            },
          };
        },
      };

      return { pool: pool as any, logs, getPersistedSessionTenant: () => persistedSessionTenant };
    }

    // 17. Valid authenticated user with valid membership succeeds under RLS via withTenantContext
    const rlsSim1 = createRlsEnforcingMockPool();
    const aliceRole = await defaultDbMembershipChecker(ALICE_ID, TENANT_ALPHA, rlsSim1.pool);
    const log1 = rlsSim1.logs[0];
    const querySeq1 = log1?.queries.map((q) =>
      q.sql.startsWith('SELECT role FROM organization_memberships') ? 'SELECT_MEMBERSHIP' : q.sql
    );
    const selectEntry1 = log1?.queries.find((q) => q.sql.includes('FROM organization_memberships'));
    assert(
      17,
      'P0-01: defaultDbMembershipChecker establishes transaction-local tenant context before querying RLS-protected organization_memberships',
      aliceRole === 'owner' &&
        log1?.released === true &&
        JSON.stringify(querySeq1) ===
          JSON.stringify(['BEGIN', 'SELECT set_config($1, $2, true)', 'SELECT_MEMBERSHIP', 'COMMIT']) &&
        selectEntry1?.inTx === true &&
        selectEntry1?.activeTenant === TENANT_ALPHA
    );

    // 18. Authenticated user without membership in target organization is denied even with tenant context set
    const aliceInBetaRole = await defaultDbMembershipChecker(ALICE_ID, TENANT_BETA, rlsSim1.pool);
    const bobInGammaRole = await defaultDbMembershipChecker(BOB_ID, TENANT_GAMMA, rlsSim1.pool);
    assert(
      18,
      'P0-01: defaultDbMembershipChecker denies authenticated users who lack membership in the target organization',
      aliceInBetaRole === null && bobInGammaRole === null
    );

    // 19. Forged / malformed user ID or tenant ID is rejected before touching database
    const rlsSimInvalid = createRlsEnforcingMockPool();
    const invalidUserRes = await defaultDbMembershipChecker('not-a-uuid', TENANT_ALPHA, rlsSimInvalid.pool);
    const invalidOrgRes = await defaultDbMembershipChecker(ALICE_ID, 'not-a-uuid', rlsSimInvalid.pool);
    const emptyIdsRes = await defaultDbMembershipChecker('', '', rlsSimInvalid.pool);
    assert(
      19,
      'P0-01: defaultDbMembershipChecker rejects invalid or empty UUIDs fail-closed with zero database queries',
      invalidUserRes === null &&
        invalidOrgRes === null &&
        emptyIdsRes === null &&
        rlsSimInvalid.logs.length === 0
    );

    // 20. Database / tenant-context setup failure rolls back, releases connection, and fails closed
    const rlsSimSetConfigFail = createRlsEnforcingMockPool({ failOnSetConfig: true });
    const roleOnSetConfigFail = await defaultDbMembershipChecker(
      ALICE_ID,
      TENANT_ALPHA,
      rlsSimSetConfigFail.pool
    );
    const failLog1 = rlsSimSetConfigFail.logs[0];

    const rlsSimSelectFail = createRlsEnforcingMockPool({ failOnSelect: true });
    const roleOnSelectFail = await defaultDbMembershipChecker(
      ALICE_ID,
      TENANT_ALPHA,
      rlsSimSelectFail.pool
    );
    const failLog2 = rlsSimSelectFail.logs[0];

    assert(
      20,
      'P0-01: Database or tenant-context setup failure triggers ROLLBACK, releases client, and fails closed (null)',
      roleOnSetConfigFail === null &&
        failLog1?.released === true &&
        failLog1?.queries.some((q) => q.sql === 'ROLLBACK') &&
        roleOnSelectFail === null &&
        failLog2?.released === true &&
        failLog2?.queries.some((q) => q.sql === 'ROLLBACK')
    );

    // 21. Tenant context is transaction-local and never leaks across pooled connections or subsequent requests
    const allLogs = [...rlsSim1.logs, ...rlsSimSetConfigFail.logs, ...rlsSimSelectFail.logs];
    const anyLeakedContext = allLogs.some((l) => l.leakedTenantOnRelease !== null);
    assert(
      21,
      'P0-01: Transaction-local tenant context does not leak across pooled connections after COMMIT or ROLLBACK',
      !anyLeakedContext && rlsSim1.getPersistedSessionTenant() === null
    );

    // 22. End-to-End Express Route Authorization using defaultDbMembershipChecker across Projects, Snapshots & Archives
    setMembershipChecker((userId, orgId) =>
      defaultDbMembershipChecker(userId, orgId, rlsSim1.pool)
    );

    // 22a. Authorized member (Alice -> TENANT_ALPHA) passes authorizeTenantMembership on /api/projects (reaches pagination validation -> 400, not 403)
    const res22a = await fetch(`${baseUrl}/api/projects?limit=-1`, {
      headers: {
        Authorization: `Bearer ${aliceToken}`,
        'X-Tenant-ID': TENANT_ALPHA,
      },
    });
    const body22a = await res22a.json();

    // 22b. Unauthorized cross-tenant attempt on /api/projects (Alice -> TENANT_BETA) blocked at middleware with 403
    const res22b = await fetch(`${baseUrl}/api/projects`, {
      headers: {
        Authorization: `Bearer ${aliceToken}`,
        'X-Tenant-ID': TENANT_BETA,
      },
    });
    const body22b = await res22b.json();

    // 22c. Unauthorized cross-tenant attempt on /api/projects/:id/snapshots blocked with 403
    const res22c = await fetch(
      `${baseUrl}/api/projects/a1111111-1111-4111-8111-111111111111/snapshots`,
      {
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': TENANT_BETA,
        },
      }
    );
    const body22c = await res22c.json();

    // 22d. Unauthorized cross-tenant attempt on /api/archives/ingest blocked with 403
    const res22d = await fetch(`${baseUrl}/api/archives/ingest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${aliceToken}`,
        'X-Tenant-ID': TENANT_BETA,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ archiveName: 'Test', items: [] }),
    });
    const body22d = await res22d.json();

    assert(
      22,
      'P0-01: Express gateway with defaultDbMembershipChecker authorizes valid members and blocks cross-tenant access on projects, snapshots, and archives',
      res22a.status === 400 &&
        body22a.code === 'ERR_INVALID_PAGINATION' &&
        res22b.status === 403 &&
        body22b.code === 'ERR_TENANT_MEMBERSHIP_DENIED' &&
        res22c.status === 403 &&
        body22c.code === 'ERR_TENANT_MEMBERSHIP_DENIED' &&
        res22d.status === 403 &&
        body22d.code === 'ERR_TENANT_MEMBERSHIP_DENIED'
    );

    // -------------------------------------------------------------------------
    // 23–30. P1-01 Regression Suite: Project Unit & Currency Persistence (PUT -> GET)
    // -------------------------------------------------------------------------
    interface SimulatedProjectRow {
      id: string;
      organization_id: string;
      name: string;
      project_type: string;
      status: string;
      unit: string;
      budget: number;
      currency: string;
      data: Record<string, unknown>;
      created_at: Date;
      updated_at: Date;
    }

    interface SimulatedSnapshotRow {
      id: string;
      project_id: string;
      organization_id: string;
      revision: number;
      version_tag: string;
      label: string;
      description: string;
      trigger: string;
      author_id: string | null;
      metrics: Record<string, unknown>;
      project_data: Record<string, unknown>;
      checksum: string;
      created_at: Date;
    }

    const relationalProjectsTable = new Map<string, SimulatedProjectRow>();
    const relationalSnapshotsTable = new Map<string, SimulatedSnapshotRow>();
    let failNextProjectUpdate = false;
    let failNextArchiveProjectInsertOnSecondItem = false;
    let failOnSecondBatchProjectWrite = false;
    let failOnResetSamplesDelete = false;
    let failOnClearAllProjectsDelete = false;
    let failOnSecondSnapshotInsert = false;
    let archiveInsertCountInTx = 0;
    let batchProjectWriteCountInTx = 0;
    let snapshotInsertCountInTx = 0;
    let archiveDbQueriesExecuted = 0;
    let projectBatchDbQueriesExecuted = 0;

    const appPoolInstance = getAppPool();
    const originalAppPoolConnect = appPoolInstance.connect.bind(appPoolInstance);

    // Relational + RLS-enforcing mock on appPool.connect that maintains separate relational
    // columns (unit, currency, name, project_type, status, budget) and JSONB (data) column
    // plus project_snapshots with full BEGIN / COMMIT / ROLLBACK transaction snapshot semantics.
    (appPoolInstance as any).connect = async () => {
      let inTx = false;
      let txLocalTenant: string | null = null;
      let workingSet: Map<string, SimulatedProjectRow> | null = null;
      let workingSnapshots: Map<string, SimulatedSnapshotRow> | null = null;

      const cloneTable = (src: Map<string, SimulatedProjectRow>) => {
        const next = new Map<string, SimulatedProjectRow>();
        for (const [k, v] of src.entries()) {
          next.set(k, {
            ...v,
            data: JSON.parse(JSON.stringify(v.data)),
            created_at: new Date(v.created_at.getTime()),
            updated_at: new Date(v.updated_at.getTime()),
          });
        }
        return next;
      };

      const cloneSnapshots = (src: Map<string, SimulatedSnapshotRow>) => {
        const next = new Map<string, SimulatedSnapshotRow>();
        for (const [k, v] of src.entries()) {
          next.set(k, {
            ...v,
            metrics: JSON.parse(JSON.stringify(v.metrics)),
            project_data: JSON.parse(JSON.stringify(v.project_data)),
            created_at: new Date(v.created_at.getTime()),
          });
        }
        return next;
      };

      const memberships = [
        { user_id: ALICE_ID, organization_id: TENANT_ALPHA, role: 'owner' },
        { user_id: BOB_ID, organization_id: TENANT_BETA, role: 'member' },
      ];

      return {
        query: async (sqlText: string, params?: unknown[]) => {
          const sql = sqlText.replace(/\s+/g, ' ').trim();

          if (sql === 'BEGIN') {
            inTx = true;
            txLocalTenant = null;
            batchProjectWriteCountInTx = 0;
            snapshotInsertCountInTx = 0;
            workingSet = cloneTable(relationalProjectsTable);
            workingSnapshots = cloneSnapshots(relationalSnapshotsTable);
            return { rows: [], rowCount: 0 };
          }
          if (sql === 'COMMIT') {
            if (inTx && workingSet) {
              relationalProjectsTable.clear();
              for (const [k, v] of workingSet.entries()) {
                relationalProjectsTable.set(k, v);
              }
            }
            if (inTx && workingSnapshots) {
              relationalSnapshotsTable.clear();
              for (const [k, v] of workingSnapshots.entries()) {
                relationalSnapshotsTable.set(k, v);
              }
            }
            inTx = false;
            txLocalTenant = null;
            workingSet = null;
            workingSnapshots = null;
            return { rows: [], rowCount: 0 };
          }
          if (sql === 'ROLLBACK') {
            inTx = false;
            txLocalTenant = null;
            workingSet = null;
            workingSnapshots = null;
            return { rows: [], rowCount: 0 };
          }
          if (sql.startsWith('SELECT set_config(')) {
            const settingName = params?.[0];
            const settingVal = params?.[1] as string;
            if (settingName === 'app.current_tenant_id') {
              txLocalTenant = settingVal;
            }
            return { rows: [{ set_config: settingVal }], rowCount: 1 };
          }
          if (sql.includes('FROM organization_memberships')) {
            if (!inTx || !txLocalTenant) return { rows: [], rowCount: 0 };
            const userId = params?.[0];
            const orgId = params?.[1];
            const found = memberships.filter(
              (m) =>
                m.organization_id === txLocalTenant &&
                m.user_id === userId &&
                m.organization_id === orgId
            );
            return { rows: found.map((m) => ({ role: m.role })), rowCount: found.length };
          }

          const store = inTx && workingSet ? workingSet : relationalProjectsTable;
          const snapStore = inTx && workingSnapshots ? workingSnapshots : relationalSnapshotsTable;

          // RLS check for tenant tables
          if (!inTx || !txLocalTenant) {
            return { rows: [], rowCount: 0 };
          }

          if (sql.startsWith('INSERT INTO archive_ingestion_jobs')) {
            archiveDbQueriesExecuted++;
            return {
              rows: [{ id: '99999999-9999-4999-8999-999999999999' }],
              rowCount: 1,
            };
          }

          if (sql.startsWith('UPDATE archive_ingestion_jobs')) {
            archiveDbQueriesExecuted++;
            return { rows: [], rowCount: 1 };
          }

          if (sql.startsWith('SELECT * FROM project_snapshots')) {
            const projId = params?.[0] as string;
            const orgId = params?.[1] as string;
            const rows = Array.from(snapStore.values()).filter(
              (s) =>
                s.project_id === projId &&
                s.organization_id === txLocalTenant &&
                s.organization_id === orgId
            );
            if (sql.includes('ORDER BY revision DESC')) {
              rows.sort((a, b) => b.revision - a.revision);
            } else {
              rows.sort((a, b) => a.revision - b.revision);
            }
            return { rows, rowCount: rows.length };
          }

          if (sql.includes('SELECT COALESCE(MAX(revision), 0) + 1 AS next_rev FROM project_snapshots')) {
            const projId = params?.[0] as string;
            const orgId = params?.[1] as string;
            const rows = Array.from(snapStore.values()).filter(
              (s) =>
                s.project_id === projId &&
                s.organization_id === txLocalTenant &&
                s.organization_id === orgId
            );
            const maxRev = rows.reduce((m, r) => Math.max(m, r.revision), 0);
            return { rows: [{ next_rev: maxRev + 1 }], rowCount: 1 };
          }

          if (sql.startsWith('INSERT INTO project_snapshots')) {
            archiveDbQueriesExecuted++;
            snapshotInsertCountInTx++;
            if (failOnSecondSnapshotInsert && snapshotInsertCountInTx >= 2) {
              failOnSecondSnapshotInsert = false;
              throw new Error('Simulated database failure on snapshot batch item #2');
            }
            if (params && params.length >= 10) {
              const isArchiveInsert = params.length === 10;
              const project_id = params[0] as string;
              const organization_id = params[1] as string;
              const revision = Number(params[2]);
              const version_tag = params[3] as string;
              const label = params[4] as string;
              const description = params[5] as string;
              const trigger = params[6] as string;
              const author_id = isArchiveInsert ? null : ((params[7] as string | null) ?? null);
              const metricsRaw = (isArchiveInsert ? params[7] : params[8]) as string;
              const projectDataRaw = (isArchiveInsert ? params[8] : params[9]) as string;
              const checksum = (isArchiveInsert ? params[9] : params[10]) as string;

              if (organization_id !== txLocalTenant) {
                const err: any = new Error('new row violates row-level security policy for table "project_snapshots"');
                err.code = '42501';
                throw err;
              }

              if (sql.includes('ON CONFLICT (project_id, revision) DO NOTHING')) {
                const duplicateRev = Array.from(snapStore.values()).some(
                  (s) => s.project_id === project_id && s.revision === revision
                );
                if (duplicateRev) {
                  return { rows: [], rowCount: 0 };
                }
              }

              const id = crypto.randomUUID();
              const snapRow: SimulatedSnapshotRow = {
                id,
                project_id,
                organization_id,
                revision,
                version_tag,
                label,
                description,
                trigger,
                author_id,
                metrics: JSON.parse(metricsRaw || '{}'),
                project_data: JSON.parse(projectDataRaw || '{}'),
                checksum,
                created_at: new Date(),
              };
              snapStore.set(id, snapRow);
              return { rows: [snapRow], rowCount: 1 };
            }
            return { rows: [], rowCount: 1 };
          }

          if (sql.startsWith('DELETE FROM project_snapshots')) {
            if (sql.includes('WHERE project_id = $1 AND organization_id = $2')) {
              const projId = params?.[0] as string;
              const orgId = params?.[1] as string;
              let deleted = 0;
              for (const [k, v] of snapStore.entries()) {
                if (
                  v.project_id === projId &&
                  v.organization_id === txLocalTenant &&
                  v.organization_id === orgId
                ) {
                  snapStore.delete(k);
                  deleted++;
                }
              }
              return { rows: [], rowCount: deleted };
            }
            if (sql.includes('WHERE organization_id = $1')) {
              const orgId = params?.[0] as string;
              let deleted = 0;
              for (const [k, v] of snapStore.entries()) {
                if (v.organization_id === txLocalTenant && v.organization_id === orgId) {
                  snapStore.delete(k);
                  deleted++;
                }
              }
              return { rows: [], rowCount: deleted };
            }
          }

          if (sql.startsWith('INSERT INTO projects')) {
            projectBatchDbQueriesExecuted++;
            batchProjectWriteCountInTx++;
            if (failOnSecondBatchProjectWrite && batchProjectWriteCountInTx >= 2) {
              failOnSecondBatchProjectWrite = false;
              throw new Error('Simulated database failure on batch project write #2');
            }
            if (sql.includes('ON CONFLICT (id) DO UPDATE')) {
              archiveDbQueriesExecuted++;
              archiveInsertCountInTx++;
              if (failNextArchiveProjectInsertOnSecondItem && archiveInsertCountInTx >= 2) {
                failNextArchiveProjectInsertOnSecondItem = false;
                throw new Error('Simulated database storage failure on archive item #2');
              }
            }

            const [
              id,
              organization_id,
              name,
              project_type,
              status,
              unit,
              budget,
              currency,
              serializedData,
            ] = params as [string, string, string, string, string, string, number, string, string];

            if (organization_id !== txLocalTenant) {
              const err: any = new Error('new row violates row-level security policy for table "projects"');
              err.code = '42501';
              throw err;
            }

            // Enforce PK/RLS conflict if row exists in another tenant
            const existing = store.get(id);
            if (existing && existing.organization_id !== txLocalTenant) {
              const err: any = new Error('new row violates row-level security policy (USING expression) for table "projects"');
              err.code = '42501';
              throw err;
            }

            const now = new Date();
            const parsedIncomingData = JSON.parse(serializedData);
            const mergedData =
              existing && sql.includes('ON CONFLICT (id) DO UPDATE')
                ? { ...existing.data, ...parsedIncomingData }
                : parsedIncomingData;
            const row: SimulatedProjectRow = {
              id,
              organization_id,
              name,
              project_type,
              status,
              unit,
              budget: Number(budget),
              currency,
              data: mergedData,
              created_at: existing?.created_at || now,
              updated_at: now,
            };
            store.set(id, row);
            return {
              rows: [{ id, created_at: row.created_at, updated_at: now }],
              rowCount: 1,
            };
          }

          if (sql.startsWith('SELECT COUNT(*) AS count FROM projects')) {
            const orgId = params?.[0] as string;
            const visible = Array.from(store.values()).filter(
              (r) => r.organization_id === txLocalTenant && r.organization_id === orgId
            );
            return { rows: [{ count: String(visible.length) }], rowCount: 1 };
          }

          if (sql.includes('SELECT id FROM projects WHERE organization_id = $1 FOR UPDATE')) {
            projectBatchDbQueriesExecuted++;
            const orgId = params?.[0] as string;
            const visible = Array.from(store.values())
              .filter((r) => r.organization_id === txLocalTenant && r.organization_id === orgId)
              .map((r) => ({ id: r.id }));
            return { rows: visible, rowCount: visible.length };
          }

          if (sql.includes('FROM projects WHERE organization_id = $1 ORDER BY updated_at DESC')) {
            const orgId = params?.[0] as string;
            const limit = Number(params?.[1] ?? 50);
            const offset = Number(params?.[2] ?? 0);
            const visible = Array.from(store.values())
              .filter((r) => r.organization_id === txLocalTenant && r.organization_id === orgId)
              .slice(offset, offset + limit);
            return { rows: visible, rowCount: visible.length };
          }

          if (sql.startsWith('SELECT') && sql.includes('FROM projects WHERE id = $1 AND organization_id = $2')) {
            projectBatchDbQueriesExecuted++;
            const id = params?.[0] as string;
            const orgId = params?.[1] as string;
            const row = store.get(id);
            if (!row || row.organization_id !== txLocalTenant || row.organization_id !== orgId) {
              return { rows: [], rowCount: 0 };
            }
            return { rows: [row], rowCount: 1 };
          }

          if (sql.startsWith('UPDATE projects SET')) {
            projectBatchDbQueriesExecuted++;
            batchProjectWriteCountInTx++;
            if (failNextProjectUpdate) {
              failNextProjectUpdate = false;
              throw new Error('Simulated database failure during UPDATE projects');
            }
            if (failOnSecondBatchProjectWrite && batchProjectWriteCountInTx >= 2) {
              failOnSecondBatchProjectWrite = false;
              throw new Error('Simulated database failure on batch project write #2');
            }
            // Expect parameterized UPDATE with unit ($4) and currency ($6)
            const [
              name,
              project_type,
              status,
              unit,
              budget,
              currency,
              serializedData,
              id,
              orgId,
            ] = params as [string, string, string, string, number, string, string, string, string];

            const row = store.get(id);
            if (!row || row.organization_id !== txLocalTenant || row.organization_id !== orgId) {
              return { rows: [], rowCount: 0 };
            }
            row.name = name;
            row.project_type = project_type;
            row.status = status;
            row.unit = unit;
            row.budget = Number(budget);
            row.currency = currency;
            row.data = JSON.parse(serializedData);
            row.updated_at = new Date();
            return { rows: [], rowCount: 1 };
          }

          if (sql.startsWith('DELETE FROM projects')) {
            projectBatchDbQueriesExecuted++;
            if (failOnResetSamplesDelete) {
              failOnResetSamplesDelete = false;
              throw new Error('Simulated database failure while deleting non-sample project');
            }
            if (failOnClearAllProjectsDelete) {
              failOnClearAllProjectsDelete = false;
              throw new Error('Simulated database failure during clearAllProjects DELETE');
            }
            if (sql.includes('WHERE id = $1 AND organization_id = $2')) {
              const id = params?.[0] as string;
              const orgId = params?.[1] as string;
              const row = store.get(id);
              if (!row || row.organization_id !== txLocalTenant || row.organization_id !== orgId) {
                return { rows: [], rowCount: 0 };
              }
              store.delete(id);
              for (const [sk, sv] of snapStore.entries()) {
                if (sv.project_id === id && sv.organization_id === txLocalTenant) {
                  snapStore.delete(sk);
                }
              }
              return { rows: [], rowCount: 1 };
            }
            if (sql.includes('WHERE organization_id = $1')) {
              const orgId = params?.[0] as string;
              let deleted = 0;
              for (const [k, v] of store.entries()) {
                if (v.organization_id === txLocalTenant && v.organization_id === orgId) {
                  store.delete(k);
                  deleted++;
                }
              }
              return { rows: [], rowCount: deleted };
            }
          }

          return { rows: [], rowCount: 0 };
        },
        release: () => {},
      };
    };

    try {
      setMembershipChecker((userId, orgId) =>
        defaultDbMembershipChecker(userId, orgId, appPoolInstance)
      );

      const testProjectId = '12345678-1234-4234-8234-1234567890ab';

      // 23. Create initial project with unit='feet', currency='USD', and custom attributes
      const createRes = await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': TENANT_ALPHA,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: testProjectId,
          name: 'Highridge P1-01 Test Residence',
          projectType: 'house',
          status: 'Drafting',
          unit: 'feet',
          currency: 'USD',
          budget: 500000,
          plotWidth: 60,
          plotLength: 100,
          notes: 'Original architectural notes',
        }),
      });
      const createBody = await createRes.json();
      const dbRowInitial = relationalProjectsTable.get(testProjectId);
      assert(
        23,
        'P1-01: POST /api/projects persists initial unit and currency in both relational columns and JSONB data',
        createRes.status === 201 &&
          createBody.project?.unit === 'feet' &&
          createBody.project?.currency === 'USD' &&
          dbRowInitial?.unit === 'feet' &&
          dbRowInitial?.currency === 'USD' &&
          dbRowInitial?.data?.unit === 'feet' &&
          dbRowInitial?.data?.currency === 'USD'
      );

      // 24. Update ONLY unit ('feet' -> 'metres') and verify via PUT response, GET /:id, and GET /
      const updateUnitRes = await fetch(`${baseUrl}/api/projects/${testProjectId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': TENANT_ALPHA,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ unit: 'metres' }),
      });
      const updateUnitBody = await updateUnitRes.json();

      const getAfterUnitRes = await fetch(`${baseUrl}/api/projects/${testProjectId}`, {
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': TENANT_ALPHA,
        },
      });
      const getAfterUnitBody = await getAfterUnitRes.json();

      const listAfterUnitRes = await fetch(`${baseUrl}/api/projects`, {
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': TENANT_ALPHA,
        },
      });
      const listAfterUnitBody = await listAfterUnitRes.json();
      const dbRowAfterUnit = relationalProjectsTable.get(testProjectId);

      assert(
        24,
        'P1-01: PUT /api/projects/:id updating unit persists to relational & JSONB columns and returns updated unit on subsequent GETs while preserving currency & omitted fields',
        updateUnitRes.status === 200 &&
          updateUnitBody.project?.unit === 'metres' &&
          getAfterUnitRes.status === 200 &&
          getAfterUnitBody.project?.unit === 'metres' &&
          getAfterUnitBody.project?.currency === 'USD' &&
          getAfterUnitBody.project?.plotWidth === 60 &&
          getAfterUnitBody.project?.notes === 'Original architectural notes' &&
          listAfterUnitBody.projects?.[0]?.unit === 'metres' &&
          dbRowAfterUnit?.unit === 'metres' &&
          dbRowAfterUnit?.data?.unit === 'metres'
      );

      // 25. Update ONLY currency ('USD' -> 'EUR') and verify via PUT response and fresh GET
      const updateCurrencyRes = await fetch(`${baseUrl}/api/projects/${testProjectId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': TENANT_ALPHA,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ currency: 'EUR' }),
      });
      const updateCurrencyBody = await updateCurrencyRes.json();

      const getAfterCurrencyRes = await fetch(`${baseUrl}/api/projects/${testProjectId}`, {
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': TENANT_ALPHA,
        },
      });
      const getAfterCurrencyBody = await getAfterCurrencyRes.json();
      const dbRowAfterCurrency = relationalProjectsTable.get(testProjectId);

      assert(
        25,
        'P1-01: PUT /api/projects/:id updating currency persists to relational & JSONB columns and returns updated currency on subsequent GET while preserving unit="metres"',
        updateCurrencyRes.status === 200 &&
          updateCurrencyBody.project?.currency === 'EUR' &&
          getAfterCurrencyRes.status === 200 &&
          getAfterCurrencyBody.project?.currency === 'EUR' &&
          getAfterCurrencyBody.project?.unit === 'metres' &&
          getAfterCurrencyBody.project?.budget === 500000 &&
          dbRowAfterCurrency?.currency === 'EUR' &&
          dbRowAfterCurrency?.data?.currency === 'EUR'
      );

      // 26. Update BOTH unit ('feet') and currency ('GBP') together
      const updateBothRes = await fetch(`${baseUrl}/api/projects/${testProjectId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': TENANT_ALPHA,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ unit: 'feet', currency: 'GBP' }),
      });
      const updateBothBody = await updateBothRes.json();

      const getAfterBothRes = await fetch(`${baseUrl}/api/projects/${testProjectId}`, {
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': TENANT_ALPHA,
        },
      });
      const getAfterBothBody = await getAfterBothRes.json();

      const listAfterBothRes = await fetch(`${baseUrl}/api/projects`, {
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': TENANT_ALPHA,
        },
      });
      const listAfterBothBody = await listAfterBothRes.json();

      assert(
        26,
        'P1-01: PUT /api/projects/:id updating both unit and currency together persists both across fresh GET /:id and GET / requests',
        updateBothRes.status === 200 &&
          updateBothBody.project?.unit === 'feet' &&
          updateBothBody.project?.currency === 'GBP' &&
          getAfterBothBody.project?.unit === 'feet' &&
          getAfterBothBody.project?.currency === 'GBP' &&
          listAfterBothBody.projects?.[0]?.unit === 'feet' &&
          listAfterBothBody.projects?.[0]?.currency === 'GBP'
      );

      // 27. Partial update of unrelated fields (name, status) preserves unit='feet', currency='GBP', budget, and plot dimensions
      // First switch to 'metres' & 'CHF', then do a partial update of { name, status }
      await fetch(`${baseUrl}/api/projects/${testProjectId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': TENANT_ALPHA,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ unit: 'metres', currency: 'CHF' }),
      });

      const partialUpdateRes = await fetch(`${baseUrl}/api/projects/${testProjectId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': TENANT_ALPHA,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'Highridge Alpine Villa', status: 'Approved' }),
      });
      const partialUpdateBody = await partialUpdateRes.json();

      const getAfterPartialRes = await fetch(`${baseUrl}/api/projects/${testProjectId}`, {
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': TENANT_ALPHA,
        },
      });
      const getAfterPartialBody = await getAfterPartialRes.json();

      assert(
        27,
        'P1-01: Partial updates to name and status preserve existing unit ("metres"), currency ("CHF"), budget, and plot geometry without resetting to defaults',
        partialUpdateRes.status === 200 &&
          partialUpdateBody.project?.name === 'Highridge Alpine Villa' &&
          partialUpdateBody.project?.status === 'Approved' &&
          getAfterPartialBody.project?.unit === 'metres' &&
          getAfterPartialBody.project?.currency === 'CHF' &&
          getAfterPartialBody.project?.budget === 500000 &&
          getAfterPartialBody.project?.plotWidth === 60 &&
          getAfterPartialBody.project?.plotLength === 100
      );

      // 28. Reject invalid unit or currency values on PUT and POST with HTTP 400
      const invalidUnitPutRes = await fetch(`${baseUrl}/api/projects/${testProjectId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': TENANT_ALPHA,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ unit: 'yards' }),
      });
      const invalidUnitPutBody = await invalidUnitPutRes.json();

      const invalidCurrencyPutRes = await fetch(`${baseUrl}/api/projects/${testProjectId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': TENANT_ALPHA,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ currency: 'JPY' }),
      });
      const invalidCurrencyPutBody = await invalidCurrencyPutRes.json();

      const invalidUnitPostRes = await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': TENANT_ALPHA,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'Invalid Unit Project', unit: 'cubits' }),
      });
      const invalidUnitPostBody = await invalidUnitPostRes.json();

      const invalidCurrencyPostRes = await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': TENANT_ALPHA,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'Invalid Currency Project', currency: 'BTC' }),
      });
      const invalidCurrencyPostBody = await invalidCurrencyPostRes.json();

      assert(
        28,
        'P1-01: Invalid unit and currency values are rejected with HTTP 400 (ERR_VALIDATION_UNIT / ERR_VALIDATION_CURRENCY) without mutating stored data',
        invalidUnitPutRes.status === 400 &&
          invalidUnitPutBody.code === 'ERR_VALIDATION_UNIT' &&
          invalidCurrencyPutRes.status === 400 &&
          invalidCurrencyPutBody.code === 'ERR_VALIDATION_CURRENCY' &&
          invalidUnitPostRes.status === 400 &&
          invalidUnitPostBody.code === 'ERR_VALIDATION_UNIT' &&
          invalidCurrencyPostRes.status === 400 &&
          invalidCurrencyPostBody.code === 'ERR_VALIDATION_CURRENCY' &&
          relationalProjectsTable.get(testProjectId)?.unit === 'metres' &&
          relationalProjectsTable.get(testProjectId)?.currency === 'CHF'
      );

      // 29. Database failure during PUT /api/projects/:id triggers ROLLBACK and returns HTTP 500 without false success
      failNextProjectUpdate = true;
      const dbFailPutRes = await fetch(`${baseUrl}/api/projects/${testProjectId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': TENANT_ALPHA,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ unit: 'feet', currency: 'USD' }),
      });
      const dbFailPutBody = await dbFailPutRes.json();

      const getAfterDbFailRes = await fetch(`${baseUrl}/api/projects/${testProjectId}`, {
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': TENANT_ALPHA,
        },
      });
      const getAfterDbFailBody = await getAfterDbFailRes.json();

      assert(
        29,
        'P1-01: Database error during PUT /api/projects/:id returns HTTP 500 (ERR_DATABASE_UPDATE) and rolls back changes cleanly',
        dbFailPutRes.status === 500 &&
          dbFailPutBody.code === 'ERR_DATABASE_UPDATE' &&
          getAfterDbFailBody.project?.unit === 'metres' &&
          getAfterDbFailBody.project?.currency === 'CHF'
      );

      // 30. Cross-tenant isolation on PUT /api/projects/:id and GET /api/projects/:id
      const bobCrossTenantPutRes = await fetch(`${baseUrl}/api/projects/${testProjectId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${bobToken}`,
          'X-Tenant-ID': TENANT_BETA,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ unit: 'feet', currency: 'AUD' }),
      });
      const bobCrossTenantPutBody = await bobCrossTenantPutRes.json();

      const bobSpoofedTenantPutRes = await fetch(`${baseUrl}/api/projects/${testProjectId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${bobToken}`,
          'X-Tenant-ID': TENANT_ALPHA,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ unit: 'feet', currency: 'AUD' }),
      });
      const bobSpoofedTenantPutBody = await bobSpoofedTenantPutRes.json();

      assert(
        30,
        'P1-01: Cross-tenant PUT requests are blocked by RLS (404 in own tenant) and membership check (403 in target tenant), preserving project unit & currency',
        bobCrossTenantPutRes.status === 404 &&
          bobCrossTenantPutBody.code === 'ERR_PROJECT_NOT_FOUND' &&
          bobSpoofedTenantPutRes.status === 403 &&
          bobSpoofedTenantPutBody.code === 'ERR_TENANT_MEMBERSHIP_DENIED' &&
          relationalProjectsTable.get(testProjectId)?.unit === 'metres' &&
          relationalProjectsTable.get(testProjectId)?.currency === 'CHF'
      );

      // -----------------------------------------------------------------------
      // 31–36. P1-02 Regression Suite: Archive Ingestion Project ID UUID Validation
      // -----------------------------------------------------------------------

      // 31. Malformed / legacy non-UUID project.id is rejected with HTTP 400 before any archive DB query runs
      archiveDbQueriesExecuted = 0;
      const malformedArchiveRes = await fetch(`${baseUrl}/api/archives/ingest`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': TENANT_ALPHA,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          archiveVersion: '1.0',
          archiveName: 'Malformed ID Archive',
          exportedAt: new Date().toISOString(),
          items: [
            {
              project: {
                id: 'proj-001',
                name: 'Legacy ID Project',
                plotWidth: 50,
                plotLength: 90,
              },
            },
          ],
        }),
      });
      const malformedArchiveBody = await malformedArchiveRes.json();

      assert(
        31,
        'P1-02: POST /api/archives/ingest rejects malformed/legacy non-UUID project.id ("proj-001") with HTTP 400 (ERR_ARCHIVE_VALIDATION) before any archive database query executes',
        malformedArchiveRes.status === 400 &&
          malformedArchiveBody.code === 'ERR_ARCHIVE_VALIDATION' &&
          Array.isArray(malformedArchiveBody.details) &&
          malformedArchiveBody.details.some((d: string) => d.includes('RFC 4122 UUID')) &&
          archiveDbQueriesExecuted === 0
      );

      // 32. Missing or empty project.id is rejected with HTTP 400 before any archive DB query runs
      archiveDbQueriesExecuted = 0;
      const missingIdArchiveRes = await fetch(`${baseUrl}/api/archives/ingest`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': TENANT_ALPHA,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          archiveVersion: '1.0',
          archiveName: 'Missing ID Archive',
          exportedAt: new Date().toISOString(),
          items: [
            {
              project: {
                id: '   ',
                name: 'Whitespace ID Project',
                plotWidth: 40,
                plotLength: 80,
              },
            },
          ],
        }),
      });
      const missingIdArchiveBody = await missingIdArchiveRes.json();

      assert(
        32,
        'P1-02: POST /api/archives/ingest rejects missing or whitespace project.id with HTTP 400 (ERR_ARCHIVE_VALIDATION) before any archive database query executes',
        missingIdArchiveRes.status === 400 &&
          missingIdArchiveBody.code === 'ERR_ARCHIVE_VALIDATION' &&
          archiveDbQueriesExecuted === 0
      );

      // 33. Valid UUID project.id continues through validation and authorization and ingests atomically (HTTP 201)
      const validArchiveProjectId = '23456789-2345-4345-8345-234567890abc';
      archiveDbQueriesExecuted = 0;
      archiveInsertCountInTx = 0;
      const validArchiveRes = await fetch(`${baseUrl}/api/archives/ingest`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': TENANT_ALPHA,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          archiveVersion: '1.0',
          archiveName: 'Valid UUID Archive',
          exportedAt: new Date().toISOString(),
          items: [
            {
              project: {
                id: validArchiveProjectId,
                name: 'Ingested Cloud Villa',
                projectType: 'house',
                status: 'Approved',
                unit: 'metres',
                currency: 'EUR',
                budget: 720000,
                plotWidth: 55,
                plotLength: 95,
              },
              snapshots: [
                {
                  revision: 1,
                  versionTag: 'v1.0',
                  label: 'Initial Archive Snapshot',
                  trigger: 'import',
                  projectData: {
                    id: validArchiveProjectId,
                    name: 'Ingested Cloud Villa',
                    plotWidth: 55,
                    plotLength: 95,
                  },
                },
              ],
            },
          ],
        }),
      });
      const validArchiveBody = await validArchiveRes.json();

      assert(
        33,
        'P1-02: POST /api/archives/ingest accepts valid RFC 4122 UUID project.id, executes transactional ingestion, and returns HTTP 201',
        validArchiveRes.status === 201 &&
          validArchiveBody.result?.projectsIngested === 1 &&
          validArchiveBody.result?.snapshotsIngested === 1 &&
          relationalProjectsTable.get(validArchiveProjectId)?.name === 'Ingested Cloud Villa' &&
          archiveDbQueriesExecuted > 0
      );

      // 34. Valid-format but nonexistent UUID follows existing HTTP 404 not-found behavior
      const nonexistentUuid = '99999999-0000-4000-8000-000000000000';
      const getNonexistentRes = await fetch(`${baseUrl}/api/projects/${nonexistentUuid}`, {
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': TENANT_ALPHA,
        },
      });
      const getNonexistentBody = await getNonexistentRes.json();

      const putNonexistentRes = await fetch(`${baseUrl}/api/projects/${nonexistentUuid}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': TENANT_ALPHA,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'Ghost Project' }),
      });
      const putNonexistentBody = await putNonexistentRes.json();

      assert(
        34,
        'P1-02: Valid-format but nonexistent project UUID returns HTTP 404 (ERR_PROJECT_NOT_FOUND) on GET and PUT',
        getNonexistentRes.status === 404 &&
          getNonexistentBody.code === 'ERR_PROJECT_NOT_FOUND' &&
          putNonexistentRes.status === 404 &&
          putNonexistentBody.code === 'ERR_PROJECT_NOT_FOUND'
      );

      // 35. Cross-tenant archive ingestion remains blocked by authorization (403) and RLS protection (500 rollback without leaking existence)
      const bobCrossTenantAuthArchiveRes = await fetch(`${baseUrl}/api/archives/ingest`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${bobToken}`,
          'X-Tenant-ID': TENANT_ALPHA, // Bob is not a member of TENANT_ALPHA
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          archiveVersion: '1.0',
          archiveName: 'Unauthorized Tenant Archive',
          exportedAt: new Date().toISOString(),
          items: [
            {
              project: {
                id: validArchiveProjectId,
                name: 'Attempted Overwrite',
                plotWidth: 50,
                plotLength: 90,
              },
            },
          ],
        }),
      });
      const bobCrossTenantAuthArchiveBody = await bobCrossTenantAuthArchiveRes.json();

      // Bob in his own tenant (TENANT_BETA) attempts to ingest an archive colliding with Alice's project UUID (validArchiveProjectId)
      const bobRlsCollisionArchiveRes = await fetch(`${baseUrl}/api/archives/ingest`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${bobToken}`,
          'X-Tenant-ID': TENANT_BETA,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          archiveVersion: '1.0',
          archiveName: 'Cross-Tenant Collision Archive',
          exportedAt: new Date().toISOString(),
          items: [
            {
              project: {
                id: validArchiveProjectId,
                name: 'Hijacked by Bob',
                plotWidth: 50,
                plotLength: 90,
              },
            },
          ],
        }),
      });
      const bobRlsCollisionArchiveBody = await bobRlsCollisionArchiveRes.json();

      assert(
        35,
        'P1-02: Cross-tenant archive requests are blocked by membership authorization (HTTP 403) and RLS (HTTP 500 generic rollback without leaking existence or overwriting Tenant A data)',
        bobCrossTenantAuthArchiveRes.status === 403 &&
          bobCrossTenantAuthArchiveBody.code === 'ERR_TENANT_MEMBERSHIP_DENIED' &&
          bobRlsCollisionArchiveRes.status === 500 &&
          bobRlsCollisionArchiveBody.code === 'ERR_ARCHIVE_INGESTION_FAILED' &&
          relationalProjectsTable.get(validArchiveProjectId)?.organization_id === TENANT_ALPHA &&
          relationalProjectsTable.get(validArchiveProjectId)?.name === 'Ingested Cloud Villa'
      );

      // 36. Database errors unrelated to UUID validation retain HTTP 500 (ERR_ARCHIVE_INGESTION_FAILED) and roll back the batch atomically
      const batchItem1Id = '34567890-3456-4456-8456-345678901111';
      const batchItem2Id = '34567890-3456-4456-8456-345678902222';
      failNextArchiveProjectInsertOnSecondItem = true;
      archiveInsertCountInTx = 0;

      const dbFailArchiveRes = await fetch(`${baseUrl}/api/archives/ingest`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': TENANT_ALPHA,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          archiveVersion: '1.0',
          archiveName: 'Mid-Batch DB Failure Archive',
          exportedAt: new Date().toISOString(),
          items: [
            {
              project: {
                id: batchItem1Id,
                name: 'Batch Item 1 (Should Rollback)',
                plotWidth: 45,
                plotLength: 85,
              },
            },
            {
              project: {
                id: batchItem2Id,
                name: 'Batch Item 2 (Triggers DB Error)',
                plotWidth: 45,
                plotLength: 85,
              },
            },
          ],
        }),
      });
      const dbFailArchiveBody = await dbFailArchiveRes.json();

      assert(
        36,
        'P1-02: Database errors unrelated to UUID validation return HTTP 500 (ERR_ARCHIVE_INGESTION_FAILED) and roll back all items in the transaction',
        dbFailArchiveRes.status === 500 &&
          dbFailArchiveBody.code === 'ERR_ARCHIVE_INGESTION_FAILED' &&
          !relationalProjectsTable.has(batchItem1Id) &&
          !relationalProjectsTable.has(batchItem2Id)
      );

      // -----------------------------------------------------------------------
      // 37–46. P2-01 Regression Suite: JWT Verification Hardening & Integrity
      // -----------------------------------------------------------------------
      const signCustomJwt = (
        headerObj: unknown,
        payloadObj: unknown,
        secret: string = TEST_SECRET,
        algForHmac: 'sha256' | 'sha384' | 'sha512' | 'none' = 'sha256'
      ): string => {
        const hB64 = Buffer.from(JSON.stringify(headerObj)).toString('base64url');
        const pB64 = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
        if (algForHmac === 'none') {
          return `${hB64}.${pB64}.`;
        }
        const sigB64 = crypto
          .createHmac(algForHmac, secret)
          .update(`${hB64}.${pB64}`)
          .digest('base64url');
        return `${hB64}.${pB64}.${sigB64}`;
      };

      const validNowSec = Math.floor(Date.now() / 1000);

      // 37. Scenario 1: Valid, correctly signed HS256 token is accepted
      const validSignedToken = createJwtToken(
        {
          sub: ALICE_ID,
          email: 'alice@example.com',
          roles: ['owner', 'architect'],
          organizationId: TENANT_ALPHA,
        },
        TEST_SECRET
      );
      const verifiedValidUser = verifyJwtToken(validSignedToken, TEST_SECRET);
      assert(
        37,
        'P2-01 (1): Valid, correctly signed HS256 token is accepted with normalized identity, roles, and organizationId',
        verifiedValidUser !== null &&
          verifiedValidUser.id === ALICE_ID &&
          verifiedValidUser.email === 'alice@example.com' &&
          JSON.stringify(verifiedValidUser.roles) === JSON.stringify(['owner', 'architect']) &&
          verifiedValidUser.organizationId === TENANT_ALPHA
      );

      // 38. Scenario 2: Invalid signature tokens (wrong secret, tampered payload, 1-bit flipped 32-byte signature, wrong signature byte length) are rejected
      const wrongSecretToken = createJwtToken({ sub: ALICE_ID }, 'wrong_secret_key_99999');
      const [vH, vP, vS] = validSignedToken.split('.');
      const tamperedPayloadB64 = Buffer.from(
        JSON.stringify({ sub: BOB_ID, iat: validNowSec, exp: validNowSec + 3600 })
      ).toString('base64url');
      const tamperedPayloadToken = `${vH}.${tamperedPayloadB64}.${vS}`;

      const rawSigBytes = Buffer.from(vS, 'base64url');
      rawSigBytes[15] ^= 0x01; // Flip 1 bit while keeping exact 32-byte length
      const flippedBitSigB64 = rawSigBytes.toString('base64url');
      const flippedBitToken = `${vH}.${vP}.${flippedBitSigB64}`;

      const shortSigB64 = Buffer.alloc(16, 0xaa).toString('base64url');
      const longSigB64 = Buffer.alloc(64, 0xbb).toString('base64url');

      assert(
        38,
        'P2-01 (2): Invalid signatures (wrong secret, tampered payload, 1-bit flipped 32-byte digest, short/long digest) are rejected via constant-time check',
        verifyJwtToken(wrongSecretToken, TEST_SECRET) === null &&
          verifyJwtToken(tamperedPayloadToken, TEST_SECRET) === null &&
          verifyJwtToken(flippedBitToken, TEST_SECRET) === null &&
          verifyJwtToken(`${vH}.${vP}.${shortSigB64}`, TEST_SECRET) === null &&
          verifyJwtToken(`${vH}.${vP}.${longSigB64}`, TEST_SECRET) === null
      );

      // 39. Scenario 3: Unsupported or unexpected header algorithms and header metadata are rejected even when HMAC-signed with the valid secret
      const baseValidPayload = { sub: ALICE_ID, iat: validNowSec, exp: validNowSec + 3600 };
      const hs384HeaderToken = signCustomJwt({ alg: 'HS384', typ: 'JWT' }, baseValidPayload, TEST_SECRET, 'sha256');
      const hs512HeaderToken = signCustomJwt({ alg: 'HS512', typ: 'JWT' }, baseValidPayload, TEST_SECRET, 'sha512');
      const rs256HeaderToken = signCustomJwt({ alg: 'RS256', typ: 'JWT' }, baseValidPayload, TEST_SECRET, 'sha256');
      const missingAlgToken = signCustomJwt({ typ: 'JWT' }, baseValidPayload, TEST_SECRET, 'sha256');
      const numericAlgToken = signCustomJwt({ alg: 256, typ: 'JWT' }, baseValidPayload, TEST_SECRET, 'sha256');
      const badTypToken = signCustomJwt({ alg: 'HS256', typ: 'JWE' }, baseValidPayload, TEST_SECRET, 'sha256');
      const critHeaderToken = signCustomJwt(
        { alg: 'HS256', typ: 'JWT', crit: ['exp'] },
        baseValidPayload,
        TEST_SECRET,
        'sha256'
      );

      assert(
        39,
        'P2-01 (3): Unsupported/unexpected header alg (HS384, HS512, RS256, missing/numeric alg) and invalid typ/crit headers are rejected',
        verifyJwtToken(hs384HeaderToken, TEST_SECRET) === null &&
          verifyJwtToken(hs512HeaderToken, TEST_SECRET) === null &&
          verifyJwtToken(rs256HeaderToken, TEST_SECRET) === null &&
          verifyJwtToken(missingAlgToken, TEST_SECRET) === null &&
          verifyJwtToken(numericAlgToken, TEST_SECRET) === null &&
          verifyJwtToken(badTypToken, TEST_SECRET) === null &&
          verifyJwtToken(critHeaderToken, TEST_SECRET) === null
      );

      // 40. Scenario 4: alg: "none" / "None" / "NONE" tokens (unsigned or HMAC-signed) are strictly rejected
      const algNoneUnsigned = signCustomJwt({ alg: 'none', typ: 'JWT' }, baseValidPayload, TEST_SECRET, 'none');
      const algNoneSigned = signCustomJwt({ alg: 'none', typ: 'JWT' }, baseValidPayload, TEST_SECRET, 'sha256');
      const algNoneMixedCaseSigned = signCustomJwt({ alg: 'None', typ: 'JWT' }, baseValidPayload, TEST_SECRET, 'sha256');
      const algNoneUpperSigned = signCustomJwt({ alg: 'NONE', typ: 'JWT' }, baseValidPayload, TEST_SECRET, 'sha256');

      assert(
        40,
        'P2-01 (4): alg: "none" / "None" / "NONE" tokens (both unsigned and HMAC-signed) are strictly rejected',
        verifyJwtToken(algNoneUnsigned, TEST_SECRET) === null &&
          verifyJwtToken(algNoneSigned, TEST_SECRET) === null &&
          verifyJwtToken(algNoneMixedCaseSigned, TEST_SECRET) === null &&
          verifyJwtToken(algNoneUpperSigned, TEST_SECRET) === null
      );

      // 41. Scenario 5: Malformed header, payload, or signature segments are rejected fail-closed
      const nonJsonHeaderB64 = Buffer.from('not-json-header').toString('base64url');
      const nonJsonHeaderSig = crypto
        .createHmac('sha256', TEST_SECRET)
        .update(`${nonJsonHeaderB64}.${vP}`)
        .digest('base64url');
      const nonJsonPayloadB64 = Buffer.from('{bad-json').toString('base64url');
      const nonJsonPayloadSig = crypto
        .createHmac('sha256', TEST_SECRET)
        .update(`${vH}.${nonJsonPayloadB64}`)
        .digest('base64url');
      const arrayHeaderToken = signCustomJwt(['HS256'], baseValidPayload, TEST_SECRET, 'sha256');
      const arrayPayloadToken = signCustomJwt({ alg: 'HS256', typ: 'JWT' }, [baseValidPayload], TEST_SECRET, 'sha256');
      const paddedToken = `${vH}=.${vP}.${vS}`;

      assert(
        41,
        'P2-01 (5): Malformed headers, payloads, non-object JSON structures, and non-canonical base64url segments are rejected',
        verifyJwtToken(`${nonJsonHeaderB64}.${vP}.${nonJsonHeaderSig}`, TEST_SECRET) === null &&
          verifyJwtToken(`${vH}.${nonJsonPayloadB64}.${nonJsonPayloadSig}`, TEST_SECRET) === null &&
          verifyJwtToken(arrayHeaderToken, TEST_SECRET) === null &&
          verifyJwtToken(arrayPayloadToken, TEST_SECRET) === null &&
          verifyJwtToken(paddedToken, TEST_SECRET) === null &&
          verifyJwtToken('only.two', TEST_SECRET) === null &&
          verifyJwtToken(`${vH}.${vP}.${vS}.extra`, TEST_SECRET) === null &&
          verifyJwtToken(`..`, TEST_SECRET) === null
      );

      // 42. Scenario 6: Expired tokens, boundary exp === now, negative/NaN exp, and excessive lifetime are rejected
      const pastExpToken = createJwtToken({ sub: ALICE_ID, exp: validNowSec - 10 }, TEST_SECRET);
      const boundaryNowExpToken = createJwtToken({ sub: ALICE_ID, exp: validNowSec }, TEST_SECRET);
      const negativeExpToken = signCustomJwt(
        { alg: 'HS256', typ: 'JWT' },
        { sub: ALICE_ID, iat: validNowSec, exp: -500 },
        TEST_SECRET
      );
      const stringExpToken = signCustomJwt(
        { alg: 'HS256', typ: 'JWT' },
        { sub: ALICE_ID, iat: validNowSec, exp: String(validNowSec + 3600) },
        TEST_SECRET
      );

      assert(
        42,
        'P2-01 (6): Expired tokens (past exp, exp === now, negative exp, string exp) are rejected',
        verifyJwtToken(pastExpToken, TEST_SECRET) === null &&
          verifyJwtToken(boundaryNowExpToken, TEST_SECRET) === null &&
          verifyJwtToken(negativeExpToken, TEST_SECRET) === null &&
          verifyJwtToken(stringExpToken, TEST_SECRET) === null
      );

      // 43. Scenario 7: Applicable nbf, iat, issuer (iss), and audience (aud) checks are enforced accurately
      const futureNbfToken = createJwtToken(
        { sub: ALICE_ID, nbf: validNowSec + 600, exp: validNowSec + 3600 },
        TEST_SECRET
      );
      const activeNbfToken = createJwtToken(
        { sub: ALICE_ID, nbf: validNowSec - 30, exp: validNowSec + 3600 },
        TEST_SECRET
      );
      const nbfAfterExpToken = createJwtToken(
        { sub: ALICE_ID, nbf: validNowSec + 100, exp: validNowSec + 50 },
        TEST_SECRET
      );
      const nonNumericNbfToken = signCustomJwt(
        { alg: 'HS256', typ: 'JWT' },
        { sub: ALICE_ID, iat: validNowSec, nbf: 'soon', exp: validNowSec + 3600 },
        TEST_SECRET
      );
      const futureIatToken = createJwtToken(
        { sub: ALICE_ID, iat: validNowSec + 600, exp: validNowSec + 3600 },
        TEST_SECRET
      );
      const nonNumericIatToken = signCustomJwt(
        { alg: 'HS256', typ: 'JWT' },
        { sub: ALICE_ID, iat: 'invalid-iat', exp: validNowSec + 3600 },
        TEST_SECRET
      );

      const issAudToken = createJwtToken(
        {
          sub: ALICE_ID,
          iss: 'https://auth.plotify.ai',
          aud: ['plotify-cloud-api', 'plotify-collab'],
        },
        TEST_SECRET
      );
      const emptyIssToken = signCustomJwt(
        { alg: 'HS256', typ: 'JWT' },
        { sub: ALICE_ID, iat: validNowSec, exp: validNowSec + 3600, iss: '   ' },
        TEST_SECRET
      );
      const emptyAudToken = signCustomJwt(
        { alg: 'HS256', typ: 'JWT' },
        { sub: ALICE_ID, iat: validNowSec, exp: validNowSec + 3600, aud: [] },
        TEST_SECRET
      );

      assert(
        43,
        'P2-01 (7): nbf, iat, iss, and aud claims are validated (future nbf/iat and mismatched/malformed iss/aud rejected; matching accepted)',
        verifyJwtToken(futureNbfToken, TEST_SECRET) === null &&
          verifyJwtToken(activeNbfToken, TEST_SECRET)?.id === ALICE_ID &&
          verifyJwtToken(nbfAfterExpToken, TEST_SECRET) === null &&
          verifyJwtToken(nonNumericNbfToken, TEST_SECRET) === null &&
          verifyJwtToken(futureIatToken, TEST_SECRET) === null &&
          verifyJwtToken(nonNumericIatToken, TEST_SECRET) === null &&
          verifyJwtToken(emptyIssToken, TEST_SECRET) === null &&
          verifyJwtToken(emptyAudToken, TEST_SECRET) === null &&
          verifyJwtToken(issAudToken, TEST_SECRET, {
            issuer: 'https://auth.plotify.ai',
            audience: 'plotify-cloud-api',
          })?.id === ALICE_ID &&
          verifyJwtToken(issAudToken, TEST_SECRET, {
            issuer: 'https://wrong-issuer.example.com',
            audience: 'plotify-cloud-api',
          }) === null &&
          verifyJwtToken(issAudToken, TEST_SECRET, {
            issuer: 'https://auth.plotify.ai',
            audience: 'wrong-audience',
          }) === null &&
          verifyJwtToken(validSignedToken, TEST_SECRET, {
            issuer: 'https://auth.plotify.ai',
          }) === null
      );

      // 44. Scenario 8: Missing or malformed required identity (sub UUID) and organization/role claims are rejected
      const nonUuidSubToken = createJwtToken({ sub: 'user-legacy-001' }, TEST_SECRET);
      const emptySubToken = createJwtToken({ sub: '' }, TEST_SECRET);
      const sqlInjSubToken = createJwtToken({ sub: "11111111-1111-4111-8111-111111111111' OR '1'='1" }, TEST_SECRET);
      const badRolesToken = signCustomJwt(
        { alg: 'HS256', typ: 'JWT' },
        { sub: ALICE_ID, iat: validNowSec, exp: validNowSec + 3600, roles: 'admin' },
        TEST_SECRET
      );
      const badOrgClaimToken = createJwtToken(
        { sub: ALICE_ID, organizationId: 'not-a-valid-uuid' },
        TEST_SECRET
      );
      const conflictingOrgClaimsToken = createJwtToken(
        { sub: ALICE_ID, organizationId: TENANT_ALPHA, orgId: TENANT_BETA },
        TEST_SECRET
      );

      assert(
        44,
        'P2-01 (8): Missing or non-UUID sub, malformed roles, non-UUID organizationId, and conflicting org claims are rejected',
        verifyJwtToken(nonUuidSubToken, TEST_SECRET) === null &&
          verifyJwtToken(emptySubToken, TEST_SECRET) === null &&
          verifyJwtToken(sqlInjSubToken, TEST_SECRET) === null &&
          verifyJwtToken(badRolesToken, TEST_SECRET) === null &&
          verifyJwtToken(badOrgClaimToken, TEST_SECRET) === null &&
          verifyJwtToken(conflictingOrgClaimsToken, TEST_SECRET) === null
      );

      // 45. Scenario 9: Valid token with organizationId scope works with matching X-Tenant-ID and blocks mismatched X-Tenant-ID with HTTP 403
      const scopedAliceAlphaToken = createJwtToken(
        { sub: ALICE_ID, email: 'alice@example.com', organizationId: TENANT_ALPHA },
        TEST_SECRET
      );
      const scopedMatchRes = await fetch(`${baseUrl}/api/projects`, {
        headers: {
          Authorization: `Bearer ${scopedAliceAlphaToken}`,
          'X-Tenant-ID': TENANT_ALPHA,
        },
      });
      const scopedMismatchRes = await fetch(`${baseUrl}/api/projects`, {
        headers: {
          Authorization: `Bearer ${scopedAliceAlphaToken}`,
          'X-Tenant-ID': TENANT_BETA,
        },
      });
      const scopedMismatchBody = await scopedMismatchRes.json();

      assert(
        45,
        'P2-01 (9): Valid token preserves existing tenant authorization (200 OK on matching tenant, 403 Forbidden on mismatched tenant)',
        scopedMatchRes.status === 200 &&
          scopedMismatchRes.status === 403 &&
          scopedMismatchBody.code === 'ERR_TENANT_MEMBERSHIP_DENIED'
      );

      // 46. Scenario 10: Forged/invalid tokens (alg:none, HS512, non-UUID sub, future nbf) cannot bypass authenticateUser on protected routes and leak zero secret material
      const bypassAttempts = [
        algNoneSigned,
        algNoneUnsigned,
        hs512HeaderToken,
        nonUuidSubToken,
        futureNbfToken,
        flippedBitToken,
      ];
      let allBypassBlocked = true;
      for (const badTok of bypassAttempts) {
        const rProj = await fetch(`${baseUrl}/api/projects`, {
          headers: { Authorization: `Bearer ${badTok}`, 'X-Tenant-ID': TENANT_ALPHA },
        });
        const bProj = await rProj.json();
        const rSnap = await fetch(
          `${baseUrl}/api/projects/12345678-1234-4234-8234-1234567890ab/snapshots`,
          {
            headers: { Authorization: `Bearer ${badTok}`, 'X-Tenant-ID': TENANT_ALPHA },
          }
        );
        const rArch = await fetch(`${baseUrl}/api/archives/ingest`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${badTok}`,
            'X-Tenant-ID': TENANT_ALPHA,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ archiveName: 'Bypass Attempt', items: [] }),
        });

        const rawRespText = JSON.stringify(bProj);
        if (
          rProj.status !== 401 ||
          bProj.code !== 'ERR_INVALID_TOKEN' ||
          rSnap.status !== 401 ||
          rArch.status !== 401 ||
          rawRespText.includes(TEST_SECRET)
        ) {
          allBypassBlocked = false;
        }
      }

      assert(
        46,
        'P2-01 (10): Forged/invalid tokens cannot bypass authenticateUser on any protected route and leak zero secrets in HTTP 401 responses',
        allBypassBlocked
      );

      // -----------------------------------------------------------------------
      // 47–50. P2-03 Regression Suite: Gateway & Auth Configuration Hardening
      // -----------------------------------------------------------------------
      // 47. Area A: JWT_ISSUER / JWT_AUDIENCE auto-population & JWT_REQUIRE_ISS_AUD fail-closed enforcement
      const prevIss = process.env.JWT_ISSUER;
      const prevAud = process.env.JWT_AUDIENCE;
      const prevReqIssAud = process.env.JWT_REQUIRE_ISS_AUD;
      try {
        process.env.JWT_ISSUER = 'https://issuer.plotify.internal';
        process.env.JWT_AUDIENCE = 'plotify-api-prod';
        process.env.JWT_REQUIRE_ISS_AUD = 'true';

        // createJwtToken automatically embeds configured JWT_ISSUER and JWT_AUDIENCE
        const envBoundToken = createJwtToken({ sub: ALICE_ID }, TEST_SECRET);
        const verifiedEnvBound = verifyJwtToken(envBoundToken, TEST_SECRET);

        // Token created without iss/aud (like aliceToken) is rejected when JWT_ISSUER/JWT_AUDIENCE are configured
        const legacyUnboundRejected = verifyJwtToken(aliceToken, TEST_SECRET) === null;

        // If JWT_REQUIRE_ISS_AUD=true but JWT_ISSUER is unset, verifyJwtToken fails closed
        delete process.env.JWT_ISSUER;
        const missingConfiguredIssRejected = verifyJwtToken(envBoundToken, TEST_SECRET) === null;

        // Invalid whitespace issuer/audience options fail closed
        const emptyIssOptionRejected =
          verifyJwtToken(envBoundToken, TEST_SECRET, { issuer: '   ', audience: 'plotify-api-prod' }) === null;

        assert(
          47,
          'P2-03 (Area A): Configured JWT_ISSUER/JWT_AUDIENCE auto-populate in createJwtToken, enforce matching in verifyJwtToken, and fail closed under JWT_REQUIRE_ISS_AUD',
          verifiedEnvBound !== null &&
            verifiedEnvBound.id === ALICE_ID &&
            legacyUnboundRejected &&
            missingConfiguredIssRejected &&
            emptyIssOptionRejected
        );
      } finally {
        if (prevIss === undefined) delete process.env.JWT_ISSUER;
        else process.env.JWT_ISSUER = prevIss;
        if (prevAud === undefined) delete process.env.JWT_AUDIENCE;
        else process.env.JWT_AUDIENCE = prevAud;
        if (prevReqIssAud === undefined) delete process.env.JWT_REQUIRE_ISS_AUD;
        else process.env.JWT_REQUIRE_ISS_AUD = prevReqIssAud;
      }

      // 48. Area B: Endpoint-scoped request body limits (413 ERR_PAYLOAD_TOO_LARGE, 400 ERR_INVALID_JSON, pre-body auth)
      const bodyLimitApp = createApp({
        jsonBodyLimit: '1kb',
        archiveBodyLimit: '8kb',
      });
      const bodyLimitServer = http.createServer(bodyLimitApp);
      await new Promise<void>((resolve) => bodyLimitServer.listen(0, '127.0.0.1', () => resolve()));
      const bodyLimitUrl = `http://127.0.0.1:${(bodyLimitServer.address() as any).port}`;

      try {
        // 48a. Unauthenticated oversized payload is rejected with HTTP 401 BEFORE body parser buffers 413
        const unauthOversizedRes = await fetch(`${bodyLimitUrl}/api/projects`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Tenant-ID': TENANT_ALPHA },
          body: JSON.stringify({ name: 'X'.repeat(4096) }),
        });

        // 48b. Authenticated project payload exceeding 1kb jsonBodyLimit is rejected with HTTP 413 (ERR_PAYLOAD_TOO_LARGE)
        const oversizedProjectRes = await fetch(`${bodyLimitUrl}/api/projects`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${aliceToken}`,
            'X-Tenant-ID': TENANT_ALPHA,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name: 'ValidLengthName', notes: 'Y'.repeat(2048) }),
        });
        const oversizedProjectBody = await oversizedProjectRes.json();

        // 48c. Archive payload (3kb) > 1kb jsonBodyLimit but < 8kb archiveBodyLimit succeeds with HTTP 201 on /api/archives/ingest
        const mediumArchiveProjectId = '56789012-5678-4678-8678-567890123456';
        const mediumArchiveRes = await fetch(`${bodyLimitUrl}/api/archives/ingest`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${aliceToken}`,
            'X-Tenant-ID': TENANT_ALPHA,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            archiveVersion: '1.0',
            archiveName: 'Medium Valid Archive',
            exportedAt: new Date().toISOString(),
            items: [
              {
                project: {
                  id: mediumArchiveProjectId,
                  name: 'Archive Project Within 8KB',
                  plotWidth: 50,
                  plotLength: 80,
                  description: 'Z'.repeat(2000),
                },
              },
            ],
          }),
        });

        // 48d. Archive payload exceeding 8kb archiveBodyLimit is rejected with HTTP 413 (ERR_PAYLOAD_TOO_LARGE)
        const oversizedArchiveRes = await fetch(`${bodyLimitUrl}/api/archives/ingest`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${aliceToken}`,
            'X-Tenant-ID': TENANT_ALPHA,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            archiveVersion: '1.0',
            archiveName: 'Too Large Archive',
            exportedAt: new Date().toISOString(),
            items: [
              {
                project: {
                  id: mediumArchiveProjectId,
                  name: 'Oversized Archive Project',
                  plotWidth: 50,
                  plotLength: 80,
                  description: 'W'.repeat(12000),
                },
              },
            ],
          }),
        });
        const oversizedArchiveBody = await oversizedArchiveRes.json();

        // 48e. Malformed JSON syntax returns HTTP 400 (ERR_INVALID_JSON)
        const malformedJsonRes = await fetch(`${bodyLimitUrl}/api/projects`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${aliceToken}`,
            'X-Tenant-ID': TENANT_ALPHA,
            'Content-Type': 'application/json',
          },
          body: '{"name": "Broken JSON"',
        });
        const malformedJsonBody = await malformedJsonRes.json();

        assert(
          48,
          'P2-03 (Area B): Route-scoped body limits reject oversized bodies with HTTP 413 (ERR_PAYLOAD_TOO_LARGE), malformed JSON with HTTP 400 (ERR_INVALID_JSON), and block unauthenticated bodies with HTTP 401 first',
          unauthOversizedRes.status === 401 &&
            oversizedProjectRes.status === 413 &&
            oversizedProjectBody.code === 'ERR_PAYLOAD_TOO_LARGE' &&
            mediumArchiveRes.status === 201 &&
            oversizedArchiveRes.status === 413 &&
            oversizedArchiveBody.code === 'ERR_PAYLOAD_TOO_LARGE' &&
            malformedJsonRes.status === 400 &&
            malformedJsonBody.code === 'ERR_INVALID_JSON'
        );
      } finally {
        await new Promise<void>((resolve) => bodyLimitServer.close(() => resolve()));
      }

      // 49. Area C: Rate limiting & trusted proxy controls (X-Forwarded-For spoofing blocked when trustProxy=false)
      const rateLimitAppUntrustedProxy = createApp({
        trustProxy: false,
        rateLimitWindowMs: 60_000,
        rateLimitMaxRequests: 3,
        archiveRateLimitMaxRequests: 1,
      });
      const rlServer1 = http.createServer(rateLimitAppUntrustedProxy);
      await new Promise<void>((resolve) => rlServer1.listen(0, '127.0.0.1', () => resolve()));
      const rlUrl1 = `http://127.0.0.1:${(rlServer1.address() as any).port}`;

      const rateLimitAppTrustedProxy = createApp({
        trustProxy: 1,
        rateLimitWindowMs: 60_000,
        rateLimitMaxRequests: 2,
      });
      const rlServer2 = http.createServer(rateLimitAppTrustedProxy);
      await new Promise<void>((resolve) => rlServer2.listen(0, '127.0.0.1', () => resolve()));
      const rlUrl2 = `http://127.0.0.1:${(rlServer2.address() as any).port}`;

      try {
        // Send 4 requests with different spoofed X-Forwarded-For headers to untrusted-proxy server (limit=3)
        const rlStatuses: number[] = [];
        let fourthBody: any = null;
        let fourthRetryAfter: string | null = null;
        for (let i = 1; i <= 4; i++) {
          const r = await fetch(`${rlUrl1}/api/projects`, {
            headers: {
              Authorization: `Bearer ${aliceToken}`,
              'X-Tenant-ID': TENANT_ALPHA,
              'X-Forwarded-For': `203.0.113.${i}`, // Spoofed IP must be ignored when trustProxy=false
            },
          });
          rlStatuses.push(r.status);
          if (i === 4) {
            fourthBody = await r.json();
            fourthRetryAfter = r.headers.get('retry-after');
          }
        }

        // On trusted-proxy server (trustProxy=1, limit=2), distinct X-Forwarded-For IPs get separate buckets
        const tp1a = await fetch(`${rlUrl2}/api/projects`, {
          headers: {
            Authorization: `Bearer ${aliceToken}`,
            'X-Tenant-ID': TENANT_ALPHA,
            'X-Forwarded-For': '198.51.100.10',
          },
        });
        const tp1b = await fetch(`${rlUrl2}/api/projects`, {
          headers: {
            Authorization: `Bearer ${aliceToken}`,
            'X-Tenant-ID': TENANT_ALPHA,
            'X-Forwarded-For': '198.51.100.10',
          },
        });
        const tp1c = await fetch(`${rlUrl2}/api/projects`, {
          headers: {
            Authorization: `Bearer ${aliceToken}`,
            'X-Tenant-ID': TENANT_ALPHA,
            'X-Forwarded-For': '198.51.100.10',
          },
        });
        const tp2a = await fetch(`${rlUrl2}/api/projects`, {
          headers: {
            Authorization: `Bearer ${aliceToken}`,
            'X-Tenant-ID': TENANT_ALPHA,
            'X-Forwarded-For': '198.51.100.20',
          },
        });

        assert(
          49,
          'P2-03 (Area C): Rate limiter enforces HTTP 429 (ERR_RATE_LIMITED) with Retry-After, ignores spoofed X-Forwarded-For when trustProxy=false, and isolates client IPs when trustProxy=1',
          JSON.stringify(rlStatuses) === JSON.stringify([200, 200, 200, 429]) &&
            fourthBody?.code === 'ERR_RATE_LIMITED' &&
            Number(fourthRetryAfter) >= 1 &&
            tp1a.status === 200 &&
            tp1b.status === 200 &&
            tp1c.status === 429 &&
            tp2a.status === 200
        );
      } finally {
        await new Promise<void>((resolve) => rlServer1.close(() => resolve()));
        await new Promise<void>((resolve) => rlServer2.close(() => resolve()));
      }

      // 50. Area D: Request ID validation & safe replacement (resolveSafeRequestId & X-Request-Id header)
      const validCustomReqId = 'req-trace_2026-10-28.0001';
      const validReqIdRes = await fetch(`${baseUrl}/api/health`, {
        headers: { 'X-Request-Id': validCustomReqId },
      });
      const validReqIdHeader = validReqIdRes.headers.get('x-request-id');

      const maliciousReqIdInputs = [
        'bad id with spaces',
        'short',
        'a'.repeat(100),
        "req-123\r\nX-Injected: pwned",
        '<script>alert(1)</script>',
        aliceToken, // JWT-shaped string must not be echoed back as X-Request-Id
      ];
      let allMaliciousReplacedSafely = true;
      for (const badId of maliciousReqIdInputs) {
        const safeId = resolveSafeRequestId(badId);
        if (safeId === badId || !/^[0-9a-f-]{36}$/i.test(safeId)) {
          allMaliciousReplacedSafely = false;
        }
      }

      const jwtAsReqIdRes = await fetch(`${baseUrl}/api/health`, {
        headers: { 'X-Request-Id': aliceToken },
      });
      const echoedHeader = jwtAsReqIdRes.headers.get('x-request-id') || '';

      assert(
        50,
        'P2-03 (Area D): X-Request-Id preserves valid safe correlation IDs and replaces malformed, CRLF-injected, XSS, or JWT strings with a fresh UUIDv4',
        validReqIdHeader === validCustomReqId &&
          allMaliciousReplacedSafely &&
          echoedHeader !== aliceToken &&
          /^[0-9a-f-]{36}$/i.test(echoedHeader)
      );

      // -----------------------------------------------------------------------
      // 51–57. P2-04 Transactional Batch Operations & Failure Recovery Suite
      // -----------------------------------------------------------------------
      const p204Proj1 = '11111111-aaaa-4111-8111-111111111101';
      const p204Proj2 = '11111111-aaaa-4111-8111-111111111102';
      const p204Proj3 = '11111111-aaaa-4111-8111-111111111103';

      // 51. Valid multi-project batch import (create + update, preserving metadata, unit & currency)
      const batchImportRes1 = await fetch(`${baseUrl}/api/projects/batch`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': TENANT_ALPHA,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projects: [
            {
              id: p204Proj1,
              name: 'P2-04 Batch Project Alpha',
              projectType: 'house',
              status: 'Drafting',
              unit: 'metres',
              currency: 'EUR',
              budget: 620000,
              plotWidth: 40,
              plotLength: 80,
              customField: 'preserved-on-update',
            },
            {
              id: p204Proj2,
              name: 'P2-04 Batch Project Beta',
              projectType: 'villa',
              status: 'Completed',
              unit: 'feet',
              currency: 'GBP',
              budget: 950000,
              plotWidth: 65,
              plotLength: 110,
            },
          ],
        }),
      });
      const batchImportBody1 = await batchImportRes1.json();

      // Update p204Proj1 and add p204Proj3 in a second batch
      const batchImportRes2 = await fetch(`${baseUrl}/api/projects/batch`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': TENANT_ALPHA,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projects: [
            {
              id: p204Proj1,
              name: 'P2-04 Batch Project Alpha (Updated)',
              unit: 'feet',
              currency: 'CHF',
              budget: 710000,
              plotWidth: 40,
              plotLength: 80,
            },
            {
              id: p204Proj3,
              name: 'P2-04 Batch Project Gamma',
              projectType: 'commercial',
              unit: 'metres',
              currency: 'AED',
              budget: 1400000,
              plotWidth: 100,
              plotLength: 150,
            },
          ],
        }),
      });
      const batchImportBody2 = await batchImportRes2.json();
      const rowAlphaAfterUpdate = relationalProjectsTable.get(p204Proj1);

      assert(
        51,
        'P2-04 (1): POST /api/projects/batch atomically creates and updates multi-project batches while preserving metadata, units, and currencies',
        batchImportRes1.status === 200 &&
          batchImportBody1.count === 2 &&
          batchImportRes2.status === 200 &&
          batchImportBody2.count === 2 &&
          rowAlphaAfterUpdate?.name === 'P2-04 Batch Project Alpha (Updated)' &&
          rowAlphaAfterUpdate?.unit === 'feet' &&
          rowAlphaAfterUpdate?.currency === 'CHF' &&
          rowAlphaAfterUpdate?.data?.customField === 'preserved-on-update' &&
          relationalProjectsTable.has(p204Proj3)
      );

      // 52. Pre-mutation batch validation: invalid item in the middle of a batch, duplicate IDs, and cross-tenant organizationId execute zero DB queries
      const queriesBeforeInvalidBatch = projectBatchDbQueriesExecuted;
      const invalidMiddleBatchRes = await fetch(`${baseUrl}/api/projects/batch`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': TENANT_ALPHA,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projects: [
            {
              id: '11111111-aaaa-4111-8111-111111111104',
              name: 'Should Not Be Inserted',
              plotWidth: 50,
              plotLength: 80,
            },
            {
              id: 'not-a-valid-uuid',
              name: 'Invalid Second Item',
              plotWidth: 50,
              plotLength: 80,
            },
          ],
        }),
      });
      const invalidMiddleBatchBody = await invalidMiddleBatchRes.json();

      const dupBatchRes = await fetch(`${baseUrl}/api/projects/batch`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': TENANT_ALPHA,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projects: [
            { id: p204Proj1, name: 'Dup 1', plotWidth: 40, plotLength: 80 },
            { id: p204Proj1, name: 'Dup 2', plotWidth: 40, plotLength: 80 },
          ],
        }),
      });
      const dupBatchBody = await dupBatchRes.json();

      const crossTenantOrgBatchRes = await fetch(`${baseUrl}/api/projects/batch`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': TENANT_ALPHA,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projects: [
            {
              id: '11111111-aaaa-4111-8111-111111111105',
              name: 'Cross Tenant Attempt',
              organizationId: TENANT_BETA,
              plotWidth: 40,
              plotLength: 80,
            },
          ],
        }),
      });
      const crossTenantOrgBatchBody = await crossTenantOrgBatchRes.json();

      assert(
        52,
        'P2-04 (2): POST /api/projects/batch rejects invalid items in the middle of a batch, duplicate IDs (ERR_DUPLICATE_BATCH_PROJECT_ID), and cross-tenant org IDs (403) before any DB mutation',
        invalidMiddleBatchRes.status === 400 &&
          invalidMiddleBatchBody.code === 'ERR_INVALID_PROJECT_ID' &&
          !relationalProjectsTable.has('11111111-aaaa-4111-8111-111111111104') &&
          dupBatchRes.status === 400 &&
          dupBatchBody.code === 'ERR_DUPLICATE_BATCH_PROJECT_ID' &&
          crossTenantOrgBatchRes.status === 403 &&
          crossTenantOrgBatchBody.code === 'ERR_CROSS_TENANT_FORBIDDEN' &&
          projectBatchDbQueriesExecuted === queriesBeforeInvalidBatch
      );

      // 53. Mid-batch database failure and cross-tenant primary-key collision roll back the entire transaction
      const rollbackCandidateId = '11111111-aaaa-4111-8111-111111111106';
      failOnSecondBatchProjectWrite = true;
      const midFailBatchRes = await fetch(`${baseUrl}/api/projects/batch`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': TENANT_ALPHA,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projects: [
            {
              id: rollbackCandidateId,
              name: 'First Item Should Roll Back',
              plotWidth: 50,
              plotLength: 90,
            },
            {
              id: p204Proj1,
              name: 'Second Item Triggers DB Failure',
              plotWidth: 50,
              plotLength: 90,
            },
          ],
        }),
      });
      const midFailBatchBody = await midFailBatchRes.json();

      // Also test Bob (TENANT_BETA) trying to batch-upsert a project whose UUID belongs to Alice (TENANT_ALPHA)
      const bobRollbackCandidateId = '22222222-bbbb-4222-8222-222222222201';
      const bobCrossCollisionRes = await fetch(`${baseUrl}/api/projects/batch`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${bobToken}`,
          'X-Tenant-ID': TENANT_BETA,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projects: [
            {
              id: bobRollbackCandidateId,
              name: 'Bob Item 1 Should Roll Back On Item 2 Collision',
              plotWidth: 40,
              plotLength: 60,
            },
            {
              id: p204Proj1, // Owned by TENANT_ALPHA!
              name: 'Bob Overwrite Attempt on Tenant Alpha Project',
              plotWidth: 40,
              plotLength: 60,
            },
          ],
        }),
      });

      assert(
        53,
        'P2-04 (3): Simulated mid-batch DB failure and cross-tenant UUID collision roll back the entire POST /api/projects/batch transaction with zero partial commits',
        midFailBatchRes.status === 500 &&
          midFailBatchBody.code === 'ERR_DATABASE_BATCH_IMPORT' &&
          !relationalProjectsTable.has(rollbackCandidateId) &&
          relationalProjectsTable.get(p204Proj1)?.name === 'P2-04 Batch Project Alpha (Updated)' &&
          bobCrossCollisionRes.status === 500 &&
          !relationalProjectsTable.has(bobRollbackCandidateId) &&
          relationalProjectsTable.get(p204Proj1)?.organization_id === TENANT_ALPHA
      );

      // 54. POST /api/projects/reset-samples transactional behavior & failure rollback
      // Seed a project for Bob (TENANT_BETA) to verify Alice's sample reset never touches Tenant Beta
      const bobProjectUuid = '22222222-bbbb-4222-8222-222222222299';
      await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${bobToken}`,
          'X-Tenant-ID': TENANT_BETA,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: bobProjectUuid,
          name: 'Bob Protected Project',
          plotWidth: 50,
          plotLength: 80,
        }),
      });

      const sampleUuid1 = 'aaaaaaaa-0001-4000-8000-000000000001';
      const sampleUuid2 = 'aaaaaaaa-0002-4000-8000-000000000002';

      // Inject failure during non-sample deletion step of reset-samples: sample upserts must roll back!
      failOnResetSamplesDelete = true;
      const failedResetRes = await fetch(`${baseUrl}/api/projects/reset-samples`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': TENANT_ALPHA,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projects: [
            { id: sampleUuid1, name: 'Sample 1', plotWidth: 50, plotLength: 80 },
            { id: sampleUuid2, name: 'Sample 2', plotWidth: 60, plotLength: 90 },
          ],
        }),
      });

      const sample1ExistedAfterFailedReset = relationalProjectsTable.has(sampleUuid1);
      const nonSampleStillPresentAfterFailedReset = relationalProjectsTable.has(p204Proj1);

      // Now execute reset-samples cleanly
      const okResetRes = await fetch(`${baseUrl}/api/projects/reset-samples`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': TENANT_ALPHA,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projects: [
            { id: sampleUuid1, name: 'Sample 1', plotWidth: 50, plotLength: 80 },
            { id: sampleUuid2, name: 'Sample 2', plotWidth: 60, plotLength: 90 },
          ],
        }),
      });
      const okResetBody = await okResetRes.json();

      assert(
        54,
        'P2-04 (4): POST /api/projects/reset-samples rolls back completely on mid-reset failure, and on success atomically replaces only the active tenant projects while preserving other tenants',
        failedResetRes.status === 500 &&
          !sample1ExistedAfterFailedReset &&
          nonSampleStillPresentAfterFailedReset &&
          okResetRes.status === 200 &&
          okResetBody.projects?.length === 2 &&
          relationalProjectsTable.has(sampleUuid1) &&
          relationalProjectsTable.has(sampleUuid2) &&
          !relationalProjectsTable.has(p204Proj1) &&
          relationalProjectsTable.has(bobProjectUuid),
        `failedStatus=${failedResetRes.status}, sample1AfterFail=${sample1ExistedAfterFailedReset}, nonSampleAfterFail=${nonSampleStillPresentAfterFailedReset}, okStatus=${okResetRes.status}, okBody=${JSON.stringify(okResetBody)}, hasP204Proj1=${relationalProjectsTable.has(p204Proj1)}, hasBob=${relationalProjectsTable.has(bobProjectUuid)}`
      );

      // 55. POST /api/projects/:id/snapshots/batch transactional bundle import, validation, rollback & retry idempotency
      const snapBatchInvalidRes = await fetch(
        `${baseUrl}/api/projects/${sampleUuid1}/snapshots/batch`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${aliceToken}`,
            'X-Tenant-ID': TENANT_ALPHA,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            snapshots: [
              {
                clientSnapshotId: 'bundle-snap-1',
                revisionNumber: 1,
                versionTag: 'v1.0',
                label: 'Valid First Snapshot',
                trigger: 'import',
                projectData: {
                  id: sampleUuid1,
                  name: 'Sample 1',
                  plotWidth: 50,
                  plotLength: 80,
                  unit: 'feet',
                },
              },
              {
                clientSnapshotId: 'bundle-snap-2',
                revisionNumber: 2,
                versionTag: 'v2.0',
                label: 'Invalid Second Snapshot (bad dimensions)',
                trigger: 'import',
                projectData: {
                  id: sampleUuid1,
                  name: 'Sample 1',
                  plotWidth: -10,
                  plotLength: 80,
                  unit: 'feet',
                },
              },
            ],
          }),
        }
      );

      // Simulate mid-batch DB failure on 2nd snapshot insert: 1st snapshot must roll back
      failOnSecondSnapshotInsert = true;
      const snapBatchFailDbRes = await fetch(
        `${baseUrl}/api/projects/${sampleUuid1}/snapshots/batch`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${aliceToken}`,
            'X-Tenant-ID': TENANT_ALPHA,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            snapshots: [
              {
                clientSnapshotId: 'bundle-snap-1',
                revisionNumber: 1,
                versionTag: 'v1.0',
                label: 'Valid First Snapshot',
                trigger: 'import',
                projectData: {
                  id: sampleUuid1,
                  name: 'Sample 1',
                  plotWidth: 50,
                  plotLength: 80,
                  unit: 'feet',
                },
              },
              {
                clientSnapshotId: 'bundle-snap-2',
                revisionNumber: 2,
                versionTag: 'v2.0',
                label: 'Valid Second Snapshot',
                trigger: 'import',
                projectData: {
                  id: sampleUuid1,
                  name: 'Sample 1 v2',
                  plotWidth: 55,
                  plotLength: 85,
                  unit: 'feet',
                },
              },
            ],
          }),
        }
      );
      const snapsAfterRollback = Array.from(relationalSnapshotsTable.values()).filter(
        (s) => s.project_id === sampleUuid1
      );

      // Now succeed and then retry the exact same batch to verify idempotency
      const snapBatchSuccessRes = await fetch(
        `${baseUrl}/api/projects/${sampleUuid1}/snapshots/batch`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${aliceToken}`,
            'X-Tenant-ID': TENANT_ALPHA,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            snapshots: [
              {
                clientSnapshotId: 'bundle-snap-1',
                revisionNumber: 1,
                versionTag: 'v1.0',
                label: 'Valid First Snapshot',
                trigger: 'import',
                projectData: {
                  id: sampleUuid1,
                  name: 'Sample 1',
                  plotWidth: 50,
                  plotLength: 80,
                  unit: 'feet',
                },
              },
              {
                clientSnapshotId: 'bundle-snap-2',
                revisionNumber: 2,
                versionTag: 'v2.0',
                label: 'Valid Second Snapshot',
                trigger: 'import',
                projectData: {
                  id: sampleUuid1,
                  name: 'Sample 1 v2',
                  plotWidth: 55,
                  plotLength: 85,
                  unit: 'feet',
                },
              },
            ],
          }),
        }
      );
      const snapBatchSuccessBody = await snapBatchSuccessRes.json();

      // Retry exact same batch
      const snapBatchRetryRes = await fetch(
        `${baseUrl}/api/projects/${sampleUuid1}/snapshots/batch`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${aliceToken}`,
            'X-Tenant-ID': TENANT_ALPHA,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            snapshots: [
              {
                clientSnapshotId: 'bundle-snap-1',
                revisionNumber: 1,
                versionTag: 'v1.0',
                label: 'Valid First Snapshot',
                trigger: 'import',
                projectData: {
                  id: sampleUuid1,
                  name: 'Sample 1',
                  plotWidth: 50,
                  plotLength: 80,
                  unit: 'feet',
                },
              },
              {
                clientSnapshotId: 'bundle-snap-2',
                revisionNumber: 2,
                versionTag: 'v2.0',
                label: 'Valid Second Snapshot',
                trigger: 'import',
                projectData: {
                  id: sampleUuid1,
                  name: 'Sample 1 v2',
                  plotWidth: 55,
                  plotLength: 85,
                  unit: 'feet',
                },
              },
            ],
          }),
        }
      );
      const snapBatchRetryBody = await snapBatchRetryRes.json();

      assert(
        55,
        'P2-04 (5): POST /api/projects/:id/snapshots/batch validates pre-query, rolls back all revisions on mid-batch DB failure, sequences revisions 1..2, and is idempotent on retry',
        snapBatchInvalidRes.status === 400 &&
          snapBatchFailDbRes.status === 500 &&
          snapsAfterRollback.length === 0 &&
          snapBatchSuccessRes.status === 201 &&
          snapBatchSuccessBody.importedCount === 2 &&
          snapBatchSuccessBody.snapshots?.length === 2 &&
          snapBatchSuccessBody.snapshots[0].revision === 2 &&
          snapBatchSuccessBody.snapshots[1].revision === 1 &&
          snapBatchRetryRes.status === 201 &&
          snapBatchRetryBody.importedCount === 0 &&
          snapBatchRetryBody.snapshots?.length === 2
      );

      // 56. DELETE /api/projects requires confirmation, rolls back snapshots+projects on DB failure, and clears only the active tenant
      const unconfirmedClearRes = await fetch(`${baseUrl}/api/projects`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': TENANT_ALPHA,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      const unconfirmedClearBody = await unconfirmedClearRes.json();

      // Simulate failure on DELETE FROM projects after DELETE FROM project_snapshots: snapshots must be rolled back!
      failOnClearAllProjectsDelete = true;
      const failedClearRes = await fetch(`${baseUrl}/api/projects`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': TENANT_ALPHA,
          'X-Confirm-Clear': 'true',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ confirm: true }),
      });
      const snapsPreservedAfterFailedClear = Array.from(relationalSnapshotsTable.values()).filter(
        (s) => s.organization_id === TENANT_ALPHA
      );

      // Execute confirmed clear-all for TENANT_ALPHA
      const okClearRes = await fetch(`${baseUrl}/api/projects`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': TENANT_ALPHA,
          'X-Confirm-Clear': 'true',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ confirm: true }),
      });
      const okClearBody = await okClearRes.json();
      const alphaProjectsAfterClear = Array.from(relationalProjectsTable.values()).filter(
        (p) => p.organization_id === TENANT_ALPHA
      );
      const alphaSnapsAfterClear = Array.from(relationalSnapshotsTable.values()).filter(
        (s) => s.organization_id === TENANT_ALPHA
      );

      assert(
        56,
        'P2-04 (6): DELETE /api/projects requires explicit confirmation, rolls back both snapshots and projects on failure, and clears only the authenticated tenant',
        unconfirmedClearRes.status === 400 &&
          unconfirmedClearBody.code === 'ERR_CONFIRMATION_REQUIRED' &&
          failedClearRes.status === 500 &&
          snapsPreservedAfterFailedClear.length === 2 &&
          okClearRes.status === 200 &&
          okClearBody.success === true &&
          okClearBody.deletedCount === 2 &&
          alphaProjectsAfterClear.length === 0 &&
          alphaSnapsAfterClear.length === 0 &&
          relationalProjectsTable.has(bobProjectUuid)
      );

      // -----------------------------------------------------------------------
      // 57–61. P2-05 Verification Suite: Archive Re-Ingestion Consistency & Retry-Safety
      // -----------------------------------------------------------------------
      const p205ProjectUuid = '77777777-7777-4777-8777-777777777777';
      const p205SecondUuid = '88888888-8888-4888-8888-888888888888';

      // 57. Ingest a new project via archive and verify relational fields and JSONB data parity
      const p205InitialIngestRes = await fetch(`${baseUrl}/api/archives/ingest`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': TENANT_ALPHA,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          archiveVersion: '1.0',
          archiveName: 'P2-05 Initial Archive',
          exportedAt: new Date().toISOString(),
          tenantId: TENANT_ALPHA,
          items: [
            {
              project: {
                id: p205ProjectUuid,
                name: 'P2-05 Meridian Residence',
                projectType: 'house',
                status: 'Drafting',
                unit: 'feet',
                currency: 'USD',
                budget: 820000,
                plotWidth: 65,
                plotLength: 120,
                notes: 'Preserved engineering notes v1',
                localOriginalId: 'legacy-meridian-01',
                customField: { zoningCode: 'R-2A', seismicZone: 4 },
              },
              snapshots: [
                {
                  revision: 1,
                  versionTag: 'v1.0',
                  label: 'Baseline Archive Snapshot',
                  trigger: 'import',
                  projectData: {
                    id: p205ProjectUuid,
                    name: 'P2-05 Meridian Residence',
                    plotWidth: 65,
                    plotLength: 120,
                  },
                },
              ],
            },
          ],
        }),
      });
      const p205InitialBody = await p205InitialIngestRes.json();
      const p205InitialRow = relationalProjectsTable.get(p205ProjectUuid);

      const p205InitialGetRes = await fetch(`${baseUrl}/api/projects/${p205ProjectUuid}`, {
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': TENANT_ALPHA,
        },
      });
      const p205InitialGetBody = await p205InitialGetRes.json();

      assert(
        57,
        'P2-05 (1): Ingesting a new project via archive persists relational columns (project_type, unit, currency, status, budget) and JSONB data with normalized organizationId',
        p205InitialIngestRes.status === 201 &&
          p205InitialBody.result?.projectsIngested === 1 &&
          p205InitialBody.result?.snapshotsIngested === 1 &&
          p205InitialRow?.project_type === 'house' &&
          p205InitialRow?.unit === 'feet' &&
          p205InitialRow?.currency === 'USD' &&
          p205InitialRow?.status === 'Drafting' &&
          p205InitialRow?.budget === 820000 &&
          p205InitialRow?.data?.organizationId === TENANT_ALPHA &&
          p205InitialRow?.data?.notes === 'Preserved engineering notes v1' &&
          p205InitialRow?.data?.localOriginalId === 'legacy-meridian-01' &&
          p205InitialGetRes.status === 200 &&
          p205InitialGetBody.project?.projectType === 'house' &&
          p205InitialGetBody.project?.unit === 'feet' &&
          p205InitialGetBody.project?.currency === 'USD'
      );

      // 58. Re-ingest the same project ID with changed projectType, unit, and currency, then retrieve via GET /api/projects/:id and GET /api/projects
      // Also verify omitted optional fields and pre-existing JSONB properties (notes, localOriginalId, customField) are preserved
      const p205ReingestRes = await fetch(`${baseUrl}/api/archives/ingest`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': TENANT_ALPHA,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          archiveVersion: '1.0',
          archiveName: 'P2-05 Updated Archive',
          exportedAt: new Date().toISOString(),
          items: [
            {
              project: {
                id: p205ProjectUuid,
                name: 'P2-05 Meridian Commercial Complex',
                projectType: 'commercial',
                status: 'Approved',
                unit: 'metres',
                currency: 'CHF',
                budget: 1450000,
                plotWidth: 80,
                plotLength: 140,
                // Intentionally omit `notes`, `localOriginalId`, and `customField` to verify JSONB preservation on re-ingestion
              },
            },
          ],
        }),
      });
      const p205ReingestBody = await p205ReingestRes.json();
      const p205ReingestedRow = relationalProjectsTable.get(p205ProjectUuid);

      const p205GetAfterReingestRes = await fetch(`${baseUrl}/api/projects/${p205ProjectUuid}`, {
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': TENANT_ALPHA,
        },
      });
      const p205GetAfterReingestBody = await p205GetAfterReingestRes.json();

      const p205ListAfterReingestRes = await fetch(`${baseUrl}/api/projects`, {
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': TENANT_ALPHA,
        },
      });
      const p205ListAfterReingestBody = await p205ListAfterReingestRes.json();
      const listedReingestedProj = (p205ListAfterReingestBody.projects || []).find(
        (p: any) => p.id === p205ProjectUuid
      );

      // Re-ingest again omitting optional `unit`, `currency`, `projectType`, `status`, `budget` to verify existing relational values are preserved instead of resetting to defaults ('feet', 'USD', 'house', 'Drafting', 0)
      const p205MinimalReingestRes = await fetch(`${baseUrl}/api/archives/ingest`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': TENANT_ALPHA,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          archiveVersion: '1.0',
          archiveName: 'P2-05 Minimal Re-Ingest Archive',
          exportedAt: new Date().toISOString(),
          items: [
            {
              project: {
                id: p205ProjectUuid,
                name: 'P2-05 Meridian Commercial Complex Phase 2',
                plotWidth: 85,
                plotLength: 145,
              },
            },
          ],
        }),
      });
      const p205GetAfterMinimalRes = await fetch(`${baseUrl}/api/projects/${p205ProjectUuid}`, {
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': TENANT_ALPHA,
        },
      });
      const p205GetAfterMinimalBody = await p205GetAfterMinimalRes.json();

      assert(
        58,
        'P2-05 (2, 3, 5): Re-ingesting an existing project updates project_type, unit, currency, status, budget and JSONB in parity across GET /:id and GET /, while preserving omitted optional fields and existing JSONB properties',
        p205ReingestRes.status === 201 &&
          p205ReingestBody.result?.projectsIngested === 1 &&
          p205ReingestedRow?.project_type === 'commercial' &&
          p205ReingestedRow?.unit === 'metres' &&
          p205ReingestedRow?.currency === 'CHF' &&
          p205ReingestedRow?.status === 'Approved' &&
          p205ReingestedRow?.budget === 1450000 &&
          p205GetAfterReingestBody.project?.projectType === 'commercial' &&
          p205GetAfterReingestBody.project?.unit === 'metres' &&
          p205GetAfterReingestBody.project?.currency === 'CHF' &&
          p205GetAfterReingestBody.project?.status === 'Approved' &&
          p205GetAfterReingestBody.project?.budget === 1450000 &&
          p205GetAfterReingestBody.project?.notes === 'Preserved engineering notes v1' &&
          p205GetAfterReingestBody.project?.localOriginalId === 'legacy-meridian-01' &&
          p205GetAfterReingestBody.project?.customField?.zoningCode === 'R-2A' &&
          listedReingestedProj?.projectType === 'commercial' &&
          listedReingestedProj?.unit === 'metres' &&
          listedReingestedProj?.currency === 'CHF' &&
          p205MinimalReingestRes.status === 201 &&
          p205GetAfterMinimalBody.project?.name === 'P2-05 Meridian Commercial Complex Phase 2' &&
          p205GetAfterMinimalBody.project?.projectType === 'commercial' &&
          p205GetAfterMinimalBody.project?.unit === 'metres' &&
          p205GetAfterMinimalBody.project?.currency === 'CHF' &&
          p205GetAfterMinimalBody.project?.status === 'Approved' &&
          p205GetAfterMinimalBody.project?.budget === 1450000
      );

      // 59. Reject invalid unit, currency, negative budget, malformed project ID, and cross-tenant organizationId in archive payload with 400 ERR_ARCHIVE_VALIDATION
      archiveDbQueriesExecuted = 0;
      const p205InvalidUnitRes = await fetch(`${baseUrl}/api/archives/ingest`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': TENANT_ALPHA,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          archiveVersion: '1.0',
          archiveName: 'Invalid Unit Archive',
          exportedAt: new Date().toISOString(),
          items: [
            {
              project: {
                id: p205ProjectUuid,
                name: 'Bad Unit Project',
                unit: 'yards',
                plotWidth: 50,
                plotLength: 100,
              },
            },
          ],
        }),
      });
      const p205InvalidUnitBody = await p205InvalidUnitRes.json();

      const p205InvalidCurrencyRes = await fetch(`${baseUrl}/api/archives/ingest`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': TENANT_ALPHA,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          archiveVersion: '1.0',
          archiveName: 'Invalid Currency Archive',
          exportedAt: new Date().toISOString(),
          items: [
            {
              project: {
                id: p205ProjectUuid,
                name: 'Bad Currency Project',
                currency: 'JPY',
                plotWidth: 50,
                plotLength: 100,
              },
            },
          ],
        }),
      });
      const p205InvalidCurrencyBody = await p205InvalidCurrencyRes.json();

      const p205NegativeBudgetRes = await fetch(`${baseUrl}/api/archives/ingest`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': TENANT_ALPHA,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          archiveVersion: '1.0',
          archiveName: 'Negative Budget Archive',
          exportedAt: new Date().toISOString(),
          items: [
            {
              project: {
                id: p205ProjectUuid,
                name: 'Negative Budget Project',
                budget: -500,
                plotWidth: 50,
                plotLength: 100,
              },
            },
          ],
        }),
      });

      const p205CrossTenantOrgFieldRes = await fetch(`${baseUrl}/api/archives/ingest`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': TENANT_ALPHA,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          archiveVersion: '1.0',
          archiveName: 'Mismatched Org Archive',
          exportedAt: new Date().toISOString(),
          items: [
            {
              project: {
                id: p205ProjectUuid,
                organizationId: TENANT_BETA,
                name: 'Spoofed Org Field Project',
                plotWidth: 50,
                plotLength: 100,
              },
            },
          ],
        }),
      });
      const p205CrossTenantOrgFieldBody = await p205CrossTenantOrgFieldRes.json();

      assert(
        59,
        'P2-05 (4, 6): Archive validation rejects invalid unit ("yards"), invalid currency ("JPY"), negative budget, and mismatched project.organizationId with HTTP 400 (ERR_ARCHIVE_VALIDATION) and zero DB queries',
        p205InvalidUnitRes.status === 400 &&
          p205InvalidUnitBody.code === 'ERR_ARCHIVE_VALIDATION' &&
          p205InvalidCurrencyRes.status === 400 &&
          p205InvalidCurrencyBody.code === 'ERR_ARCHIVE_VALIDATION' &&
          p205NegativeBudgetRes.status === 400 &&
          p205CrossTenantOrgFieldRes.status === 400 &&
          p205CrossTenantOrgFieldBody.code === 'ERR_ARCHIVE_VALIDATION' &&
          archiveDbQueriesExecuted === 0 &&
          relationalProjectsTable.get(p205ProjectUuid)?.unit === 'metres' &&
          relationalProjectsTable.get(p205ProjectUuid)?.currency === 'CHF'
      );

      // 60. Simulated failure during multi-item archive re-ingestion rolls back all mutations (including item #1 re-ingestion update), and cross-tenant project ID collision is blocked
      archiveInsertCountInTx = 0;
      failNextArchiveProjectInsertOnSecondItem = true;
      const p205MidFailureRes = await fetch(`${baseUrl}/api/archives/ingest`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': TENANT_ALPHA,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          archiveVersion: '1.0',
          archiveName: 'P2-05 Mid-Failure Rollback Archive',
          exportedAt: new Date().toISOString(),
          items: [
            {
              project: {
                id: p205ProjectUuid,
                name: 'Uncommitted Re-Ingest Name',
                projectType: 'villa',
                unit: 'feet',
                currency: 'AED',
                plotWidth: 90,
                plotLength: 150,
              },
            },
            {
              project: {
                id: p205SecondUuid,
                name: 'Second Archive Item Triggering Failure',
                plotWidth: 60,
                plotLength: 100,
              },
            },
          ],
        }),
      });
      const p205RowAfterRollback = relationalProjectsTable.get(p205ProjectUuid);

      // Cross-tenant collision: Bob (TENANT_BETA) tries to re-ingest Alice's p205ProjectUuid
      const p205BobCollisionRes = await fetch(`${baseUrl}/api/archives/ingest`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${bobToken}`,
          'X-Tenant-ID': TENANT_BETA,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          archiveVersion: '1.0',
          archiveName: 'Bob Cross-Tenant Collision',
          exportedAt: new Date().toISOString(),
          items: [
            {
              project: {
                id: p205ProjectUuid,
                name: 'Bob Hijack Attempt',
                projectType: 'apartment',
                unit: 'feet',
                currency: 'CAD',
                plotWidth: 50,
                plotLength: 100,
              },
            },
          ],
        }),
      });

      assert(
        60,
        'P2-05 (6, 7): Mid-archive failure on item #2 rolls back re-ingestion changes to item #1 cleanly, and cross-tenant project UUID collision is blocked by RLS without modifying Tenant A data',
        p205MidFailureRes.status === 500 &&
          !relationalProjectsTable.has(p205SecondUuid) &&
          p205RowAfterRollback?.name === 'P2-05 Meridian Commercial Complex Phase 2' &&
          p205RowAfterRollback?.project_type === 'commercial' &&
          p205RowAfterRollback?.unit === 'metres' &&
          p205RowAfterRollback?.currency === 'CHF' &&
          p205BobCollisionRes.status === 500 &&
          relationalProjectsTable.get(p205ProjectUuid)?.organization_id === TENANT_ALPHA &&
          relationalProjectsTable.get(p205ProjectUuid)?.currency === 'CHF'
      );

      // 61. Retrying the same archive payload is idempotent and does not corrupt state or duplicate snapshot revisions
      const retryPayload = {
        archiveVersion: '1.0',
        archiveName: 'P2-05 Idempotent Retry Archive',
        exportedAt: new Date().toISOString(),
        items: [
          {
            project: {
              id: p205ProjectUuid,
              name: 'P2-05 Meridian Commercial Final',
              projectType: 'commercial',
              status: 'Approved',
              unit: 'metres',
              currency: 'CHF',
              budget: 1500000,
              plotWidth: 85,
              plotLength: 145,
            },
            snapshots: [
              {
                revision: 1, // Already ingested in Test 57
                versionTag: 'v1.0',
                label: 'Baseline Archive Snapshot',
                trigger: 'import',
                projectData: {
                  id: p205ProjectUuid,
                  name: 'P2-05 Meridian Residence',
                  plotWidth: 65,
                  plotLength: 120,
                },
              },
              {
                revision: 2, // New revision
                versionTag: 'v2.0',
                label: 'Commercial Conversion Snapshot',
                trigger: 'import',
                projectData: {
                  id: p205ProjectUuid,
                  name: 'P2-05 Meridian Commercial Final',
                  plotWidth: 85,
                  plotLength: 145,
                },
              },
            ],
          },
        ],
      };

      const retry1Res = await fetch(`${baseUrl}/api/archives/ingest`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': TENANT_ALPHA,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(retryPayload),
      });
      const retry1Body = await retry1Res.json();

      // Exact same payload retried a second time
      const retry2Res = await fetch(`${baseUrl}/api/archives/ingest`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'X-Tenant-ID': TENANT_ALPHA,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(retryPayload),
      });
      const retry2Body = await retry2Res.json();

      const snapsForP205 = Array.from(relationalSnapshotsTable.values()).filter(
        (s) => s.project_id === p205ProjectUuid && s.organization_id === TENANT_ALPHA
      );
      const alphaProjectsFinal = Array.from(relationalProjectsTable.values()).filter(
        (p) => p.organization_id === TENANT_ALPHA
      );

      assert(
        61,
        'P2-05 (8, 9): Retrying an archive payload is idempotent — updates project deterministically, skips existing snapshot revisions (ON CONFLICT DO NOTHING), reports accurate snapshotsIngested count, and creates zero duplicate rows',
        retry1Res.status === 201 &&
          retry1Body.result?.projectsIngested === 1 &&
          retry1Body.result?.snapshotsIngested === 1 && // Only rev 2 was newly inserted; rev 1 already existed
          retry2Res.status === 201 &&
          retry2Body.result?.projectsIngested === 1 &&
          retry2Body.result?.snapshotsIngested === 0 && // Both rev 1 and rev 2 already existed on second retry
          snapsForP205.length === 2 &&
          alphaProjectsFinal.length === 1 &&
          relationalProjectsTable.get(p205ProjectUuid)?.name === 'P2-05 Meridian Commercial Final' &&
          relationalProjectsTable.get(p205ProjectUuid)?.data?.notes === 'Preserved engineering notes v1'
      );
    } finally {
      (appPoolInstance as any).connect = originalAppPoolConnect;
    }
  } finally {
    // Teardown
    resetMembershipChecker();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log('P53 STAGE 1 API GATEWAY & AUTHENTICATION SUMMARY');
  console.log('================================================================');

  const passedCount = assertions.filter((a) => a.passed).length;
  const totalCount = assertions.length;
  const allPassed = passedCount === totalCount;

  console.log(`Total API Contract Tests   : ${totalCount}`);
  console.log(`Tests Passed               : ${passedCount}`);
  console.log(`Tests Failed               : ${totalCount - passedCount}`);
  console.log(`Stage 1 Verification Status: ${allPassed ? 'PASSED (100%)' : 'FAILED'}`);
  console.log('================================================================');

  if (!allPassed) {
    process.exit(1);
  }
}

runApiTestSuite().catch((err) => {
  console.error('[API Test Runner] Fatal error:', err);
  process.exit(1);
});
