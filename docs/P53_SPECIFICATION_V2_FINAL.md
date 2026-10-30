# PLOTIFY ARCHITECTURE INTELLIGENCE OS
## P53 FINAL BACKEND SPECIFICATION & IMPLEMENTATION READINESS CONTRACT
### Version: 2.1.0-FINAL | Package ID: P53-FINALIZATION-2026-01

**Status:** FINALIZED SPECIFICATION (Awaiting User Implementation Authorization)  
**Target Engine:** PostgreSQL 16.2+ (x86_64 / aarch64)  
**Required Database Extensions:** `pgcrypto`  
**Classification:** Production-Conscious Persistence Architecture  

---

## 1. PROJECT PRESERVATION & GOVERNANCE

1. **Frontend Preservation:** The existing React 19 / TypeScript / Vite 8 frontend codebase, components, 3D visualization, floor plan editor, design studio, and client-side calculators remain 100% preserved. No existing client features or tests are refactored.
2. **Roadmap P1–P75:** Preserved in its entirety. Items P54–P56 remain strictly deferred and uncommitted.
3. **Non-Destructive Guarantee:** Existing local data structures in `src/types/project.ts` and `src/services/storage.ts` are respected as the canonical frontend contract.
4. **Offline-First Continuity:** The browser application operates fully offline with localStorage by default. Multi-tenant cloud persistence is an optional, feature-flagged enhancement activated via `VITE_USE_CLOUD_STORAGE=true`.

---

## 2. CRITICAL SPECIFICATION RESOLUTIONS & CERTAINTY MATRIX

Every technical aspect is explicitly categorized into **Design Decisions**, **Documented Engine Behaviors**, or **Live Test Verifications**:

| Aspect | Technical Specification | Category | Verification Requirement |
|---|---|:---:|---|
| **Tenant Setting Key** | `app.current_tenant_id` | **Design Decision** | Bound in both SQL RLS policies and `withTenantContext()` helper. |
| **RLS Policy on SELECT** | Silent filter returning 0 rows (`[]`) when unauthorized | **Documented Behavior** | PostgreSQL RLS `USING` filter silently excludes non-matching rows. |
| **RLS Policy on INSERT** | SQLSTATE `42501` (`insufficient_privilege`) when cross-tenant | **Documented Engine Behavior** | PostgreSQL raises `42501` ("new row violates row-level security policy for table...") on `WITH CHECK` violation. |
| **Role Privilege Enforcement** | SQLSTATE `42501` (`insufficient_privilege`) on DDL by `plotify_app` | **Documented Behavior** | Standard PostgreSQL grant restriction. |
| **Migration Advisory Lock** | `SELECT pg_advisory_xact_lock(hashtext('plotify_schema_migrations_lock'))` | **Design Decision** | Transaction-scoped; auto-releases on commit/rollback/disconnect. |
| **Migration Checksum Drift** | SHA-256 hash validation before executing DDL; hard fail-stop | **Design Decision** | Application error `ERR_MIGRATION_CHECKSUM_MISMATCH`; 0 DB changes. |
| **Snapshot Concurrency** | Row-level project lock (`SELECT id FROM projects WHERE id = $1 FOR UPDATE`) | **Design Decision** | Serializes concurrent snapshot revision calculation. |
| **Snapshot Concurrency Backstop**| Constraint `UNIQUE (project_id, revision)` | **Documented Behavior** | PostgreSQL raises SQLSTATE `23505` if duplicate revision attempted. |
| **10 Concurrent Snapshots** | 10 distinct contiguous revisions `[1..10]` generated with 0 deadlocks | **Live Test Required** | Requires Gate 3 test `G3-INT-08` on live PostgreSQL instance. |
| **Archive Ingestion Limits** | Maximum 100 projects, 50 MB uncompressed JSON payload | **Design Decision** | Pre-validation in Node.js before database interaction. |
| **Archive Atomicity** | Single `BEGIN ... COMMIT` block; complete `ROLLBACK` on error | **Live Test Required** | Requires Gate 3 test `G3-INT-09` with synthetic crash injection. |
| **Rollback Semantics** | Single-step `rollbackLastMigration` vs complete reverse sequence | **Design Decision** | Single-step drops 0004 only; full sequence drops all 7 tables in reverse order. |

---

## 3. RELATIONAL SCHEMA & MIGRATION SPECIFICATION

The persistence tier consists of 7 tables executed across 4 sequential, reversible migrations:

```
[organizations] (Tenant Boundary)
       │
       ├──< [organization_memberships] >── [users]
       │                                     │
       ├──< [projects]                       └──< [user_settings]
       │       │
       │       └──< [project_snapshots]
       │
[schema_migrations] (Migration Ledger)
```

### Migration Sequence:

#### `0001_initial_schema.sql` (and `0001_initial_schema_down.sql`)
- Enables extension `pgcrypto`.
- Creates `schema_migrations` (`version` PK, `name`, `checksum`, `executed_at`, `execution_time_ms`).
- Creates `organizations` (`id` UUID PK, `slug` VARCHAR UNIQUE, `name` VARCHAR, timestamps).
- Creates `users` (`id` UUID PK, `email` VARCHAR UNIQUE, `full_name` VARCHAR, `avatar_url` TEXT, timestamps).
- Creates `organization_memberships` (`organization_id` FK, `user_id` FK, `role` VARCHAR, PK `(organization_id, user_id)`).
- Down Script: Drops `organization_memberships`, `users`, `organizations`, `schema_migrations`.

#### `0002_rls_and_tenancy.sql` (and `0002_rls_and_tenancy_down.sql`)
- Creates `projects` (`id` UUID PK, `organization_id` FK, `name`, `project_type`, `status`, `unit`, `budget`, `currency`, `data` JSONB, timestamps).
- Creates `user_settings` (`id` UUID PK, `user_id` FK, `organization_id` FK, `settings` JSONB, timestamps, UNIQUE `(user_id, organization_id)`).
- Indexes: `idx_projects_org_id`, `idx_user_settings_lookup`.
- Enables & forces RLS on `organizations`, `organization_memberships`, `projects`, `user_settings`.
- Creates RLS policies checking `organization_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid`.
- Down Script: Drops RLS policies, drops `user_settings`, drops `projects`.

#### `0003_snapshot_sequencing.sql` (and `0003_snapshot_sequencing_down.sql`)
- Creates `project_snapshots` (`id` UUID PK, `project_id` FK, `organization_id` FK, `revision` INT, `version_tag`, `label`, `description`, `trigger`, `author_id` FK, `metrics` JSONB, `project_data` JSONB, `checksum`, timestamps).
- Constraint: `CONSTRAINT uq_project_snapshots_revision UNIQUE (project_id, revision)`.
- Indexes: `idx_snapshots_project_revision` on `(project_id, revision DESC)`, `idx_snapshots_org_id`.
- Enables & forces RLS on `project_snapshots`.
- Down Script: Drops RLS policy, drops `project_snapshots`.

#### `0004_archive_and_settings.sql` (and `0004_archive_and_settings_down.sql`)
- Adds archive validation helper trigger and status tracking for bulk import operations.
- Down Script: Drops archive helper functions and triggers.

---

## 4. DATABASE ROLES & ACCESS CONTROL (`scripts/init_roles.sql`)

```sql
-- 1. Migrator Role (DDL Execution & Ledger Ownership)
CREATE ROLE plotify_migrator WITH LOGIN PASSWORD '...';
GRANT CONNECT ON DATABASE plotify_db TO plotify_migrator;
GRANT USAGE, CREATE ON SCHEMA public TO plotify_migrator;

-- 2. Application Role (Runtime DML Only)
CREATE ROLE plotify_app WITH LOGIN PASSWORD '...' 
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
GRANT CONNECT ON DATABASE plotify_db TO plotify_app;
GRANT USAGE ON SCHEMA public TO plotify_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO plotify_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO plotify_app;

-- Explicit Security Boundaries
REVOKE ALL ON TABLE schema_migrations FROM plotify_app;
REVOKE CREATE ON SCHEMA public FROM plotify_app;
```

---

## 5. RUNTIME BACKEND ARCHITECTURE & FRONTEND ADAPTER

### Backend Module Layout:
- `server/db/pool.ts`: Configures `pg.Pool` for `plotify_app` and separate single-client connection for `plotify_migrator`.
- `server/db/tenantContext.ts`:
  ```typescript
  export async function withTenantContext<T>(
    pool: Pool,
    tenantId: string,
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT set_config($1, $2, true)', ['app.current_tenant_id', tenantId]);
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
  ```
- `server/db/migrator.ts`: Implements advisory xact-locking, SHA-256 checksum validation, and forward/reverse migration runners.
- `server/services/snapshotService.ts`: Implements row-locked revision calculation:
  ```typescript
  // 1. Lock parent project
  await client.query('SELECT id FROM projects WHERE id = $1 FOR UPDATE', [projectId]);
  // 2. Compute revision
  const res = await client.query('SELECT COALESCE(MAX(revision), 0) + 1 AS next_rev FROM project_snapshots WHERE project_id = $1', [projectId]);
  // 3. Insert snapshot
  ```
- `server/services/archiveIngestionService.ts`: Ingests archives with pre-validation (< 100 projects, < 50 MB) inside an atomic transaction.

### Frontend API Proxy & Storage Adapter:
- Express API routes mounted under `/api/projects`:
  - `GET /api/projects`: Fetches tenant projects.
  - `POST /api/projects`: Upserts project JSONB payload.
  - `POST /api/projects/:id/snapshots`: Atomic snapshot creation.
- In `src/services/storage.ts`:
  ```typescript
  export const isCloudPersistenceActive = (): boolean => {
    return typeof import.meta !== 'undefined' && Boolean(import.meta.env?.VITE_USE_CLOUD_STORAGE);
  };
  ```
  If false, storage runs completely in localStorage. If true, loads and syncs via `/api/projects`.

---

## 6. EXECUTABLE ACCEPTANCE CRITERIA

### A. Offline / In-Memory Acceptance Criteria (Gate 2 — No Database Required)
- **O-AC-1:** All 4 migration files compute consistent SHA-256 hashes matching the manifest.
- **O-AC-2:** SQL AST check verifies that `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` are present on all tenant tables.
- **O-AC-3:** Migration dependency graph is topologically sorted (`0001` → `0002` → `0003` → `0004`).
- **O-AC-4:** In-memory archive validation correctly rejects payloads exceeding 100 projects or 50 MB.
- **O-AC-5:** All 13 client verification disciplines and project release gates in `npm test` continue to pass 100%.

### B. Live PostgreSQL Acceptance Criteria (Gate 3 — Disposable Test DB Required)
- **L-AC-1 (`G3-INT-01`):** Migrations apply cleanly to blank DB; exactly 7 tables created; `schema_migrations` records 4 entries.
- **L-AC-2 (`G3-INT-02`):** Running migrations a second time executes 0 DDL statements.
- **L-AC-3 (`G3-INT-03`):** 1-byte alteration in migration file throws `ERR_MIGRATION_CHECKSUM_MISMATCH` and commits 0 changes.
- **L-AC-4 (`G3-INT-04`):** Two concurrent runners serialize cleanly using `pg_advisory_xact_lock`.
- **L-AC-5 (`G3-INT-05`):** Cross-tenant SELECT, UPDATE, DELETE return 0 rows under `plotify_app`.
- **L-AC-6 (`G3-INT-06`):** Cross-tenant INSERT fails with SQLSTATE `42501` (`insufficient_privilege` with message "new row violates row-level security policy for table...").
- **L-AC-7 (`G3-INT-07`):** Missing or empty `app.current_tenant_id` returns 0 rows (fail-closed).
- **L-AC-8 (`G3-INT-08`):** 10 concurrent snapshot workers generate sequential revisions `1..10` without gaps or deadlocks.
- **L-AC-9 (`G3-INT-09`):** Synthetic error on snapshot #4 of 5 triggers complete transaction `ROLLBACK` (0 records created).
- **L-AC-10 (`G3-INT-10`):** `plotify_app` attempting DDL is rejected with SQLSTATE `42501` (`insufficient_privilege`).
- **L-AC-11 (`G3-INT-11`):** `rollbackLastMigration()` drops only migration 0004; remaining 6 tables remain intact.

---

## 7. FILE CREATION & MODIFICATION MANIFEST

### Dependencies to Install (Requires Authorization):
- `pg` (`^8.13.0`): Production Node.js PostgreSQL driver with connection pooling.
- `@types/pg` (`^8.11.0`, DevDependency): TypeScript types for `pg`.

### Files to Create:
1. `scripts/init_roles.sql`
2. `migrations/0001_initial_schema.sql` & `0001_initial_schema_down.sql`
3. `migrations/0002_rls_and_tenancy.sql` & `0002_rls_and_tenancy_down.sql`
4. `migrations/0003_snapshot_sequencing.sql` & `0003_snapshot_sequencing_down.sql`
5. `migrations/0004_archive_and_settings.sql` & `0004_archive_and_settings_down.sql`
6. `server/db/pool.ts`
7. `server/db/tenantContext.ts`
8. `server/db/migrator.ts`
9. `server/services/snapshotService.ts`
10. `server/services/archiveIngestionService.ts`
11. `test_p53_gate2_isolated.ts` (Offline verification runner)
12. `test_p53_gate3_integration.ts` (Live PostgreSQL integration test suite)

### Files to Modify:
- `package.json`: Add `pg` and `@types/pg`.
- `.env.example`: Add `DATABASE_URL=`, `PGHOST=`, `PGPORT=5432`, `PGDATABASE=`, `PGUSER=`, `PGPASSWORD=`.
- `src/services/storage.ts`: Add non-breaking cloud synchronization adapter toggle.

---

## 8. EXECUTABLE VERIFICATION COMMANDS (Current Environment)

These commands can be run immediately to verify zero regressions in the existing codebase:

```bash
# 1. Run all 13 existing architectural & client verification disciplines
npm test

# 2. Verify strict TypeScript compilation with zero errors
npm run lint

# 3. Verify production Vite bundle compilation
npm run build
```

Once Stage 4 is implemented, offline verification runs via:
```bash
npx tsx test_p53_gate2_isolated.ts
```

---

## 9. USER APPROVAL GATES (NEXT ACTION)

To proceed, the user must provide explicit authorization for:
- **Approval A (Implementation Authorization):** Authorize installing `pg` and creating the 12 files listed in Section 7.
- **Approval B (Database Authorization):** Once Stage 4 and Gate 2 are complete, authorize access to an isolated PostgreSQL 16+ instance for Gate 3 integration testing.
