# PLOTIFY ARCHITECTURE INTELLIGENCE OS
## P53 SPECIFICATION V2.0 (PROPOSAL)
### Multi-Tenant PostgreSQL Persistence, Row-Level Security, and Snapshot Architecture

**Status:** PROPOSED (Pending Formal User Approval)  
**Package:** P53-FINAL-RECOVERY-AND-REBUILD-2026-01  
**Target Engine:** PostgreSQL 16.2+ (x86_64 / aarch64)  
**Required Extensions:** `pgcrypto`  
**Document Revision:** 2.0.0-PROPOSAL  
**Author:** AI Studio Senior Database Architect & Application Security Reviewer  

---

## 1. ARCHITECTURAL OVERVIEW & PRINCIPLES

The P53 persistence architecture transitions Plotify from an isolated client-side localStorage state to a production-grade, multi-tenant relational persistence tier on PostgreSQL 16+.

### Core Tenets
1. **Zero-Trust Multi-Tenancy:** Isolation is enforced natively at the database engine level via PostgreSQL Row-Level Security (RLS) and transaction-scoped configuration variables (`SET LOCAL`).
2. **Deterministic Immutability:** Project snapshots are append-only historical records sequenced via row-level locks on the parent project. Revisions never renumber or mutate.
3. **Fail-Closed Execution:** Any query executed without a valid tenant context, or with an empty string, evaluates to `NULL` and yields zero matching records.
4. **Least-Privilege Role Separation:** DDL operations and migrations are strictly isolated to the `plotify_migrator` role. The web runtime connects as `plotify_app`, possessing only DML privileges with `NOBYPASSRLS`.
5. **Zero-Regression Frontend Contract:** The client application (React 19 / Vite SPA) retains its local schema structure and mock-free verification suites. A backend REST/JSON adapter bridges the frontend `Project` and `ProjectSnapshot` types to the PostgreSQL tables without breaking existing frontend code.

---

## 2. RELATIONAL SCHEMA DESIGN & OBJECT INVENTORY

### Table Inventory (7 Relational Tables)

```
[organizations] (Root Tenant)
       │
       ├──< [organization_memberships] >── [users]
       │                                     │
       ├──< [projects]                       └──< [user_settings]
       │       │
       │       └──< [project_snapshots]
       │
[schema_migrations] (Migration Ledger)
```

#### 1. `schema_migrations`
- `version` (VARCHAR(32), PRIMARY KEY) — Sequential identifier (e.g., `0001`, `0002`).
- `name` (VARCHAR(255), NOT NULL) — Descriptive migration name.
- `checksum` (CHAR(64), NOT NULL) — SHA-256 hash of the migration script content.
- `executed_at` (TIMESTAMPTZ, NOT NULL DEFAULT clock_timestamp()) — Execution timestamp.
- `execution_time_ms` (INTEGER, NOT NULL) — Duration of migration execution.

#### 2. `organizations`
- `id` (UUID, PRIMARY KEY DEFAULT gen_random_uuid())
- `slug` (VARCHAR(64), NOT NULL UNIQUE)
- `name` (VARCHAR(255), NOT NULL)
- `created_at` (TIMESTAMPTZ, NOT NULL DEFAULT clock_timestamp())
- `updated_at` (TIMESTAMPTZ, NOT NULL DEFAULT clock_timestamp())

#### 3. `users`
- `id` (UUID, PRIMARY KEY DEFAULT gen_random_uuid())
- `email` (VARCHAR(255), NOT NULL UNIQUE)
- `full_name` (VARCHAR(255), NOT NULL)
- `avatar_url` (TEXT)
- `created_at` (TIMESTAMPTZ, NOT NULL DEFAULT clock_timestamp())
- `updated_at` (TIMESTAMPTZ, NOT NULL DEFAULT clock_timestamp())

#### 4. `organization_memberships`
- `organization_id` (UUID, NOT NULL REFERENCES organizations(id) ON DELETE CASCADE)
- `user_id` (UUID, NOT NULL REFERENCES users(id) ON DELETE CASCADE)
- `role` (VARCHAR(32), NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')))
- `created_at` (TIMESTAMPTZ, NOT NULL DEFAULT clock_timestamp())
- PRIMARY KEY (`organization_id`, `user_id`)

#### 5. `projects`
- `id` (UUID, PRIMARY KEY DEFAULT gen_random_uuid())
- `organization_id` (UUID, NOT NULL REFERENCES organizations(id) ON DELETE CASCADE)
- `name` (VARCHAR(255), NOT NULL)
- `project_type` (VARCHAR(32), NOT NULL)
- `status` (VARCHAR(32), NOT NULL DEFAULT 'Drafting')
- `unit` (VARCHAR(16), NOT NULL DEFAULT 'feet')
- `budget` (NUMERIC(14, 2), NOT NULL DEFAULT 0.00)
- `currency` (VARCHAR(8), NOT NULL DEFAULT 'USD')
- `data` (JSONB, NOT NULL) — Stores the complete normalized Project state (floorPlan, designAlternatives, etc.)
- `created_at` (TIMESTAMPTZ, NOT NULL DEFAULT clock_timestamp())
- `updated_at` (TIMESTAMPTZ, NOT NULL DEFAULT clock_timestamp())

#### 6. `project_snapshots`
- `id` (UUID, PRIMARY KEY DEFAULT gen_random_uuid())
- `project_id` (UUID, NOT NULL REFERENCES projects(id) ON DELETE CASCADE)
- `organization_id` (UUID, NOT NULL REFERENCES organizations(id) ON DELETE CASCADE)
- `revision` (INTEGER, NOT NULL)
- `version_tag` (VARCHAR(64), NOT NULL)
- `label` (VARCHAR(255), NOT NULL)
- `description` (TEXT)
- `trigger` (VARCHAR(32), NOT NULL CHECK (trigger IN ('manual', 'auto-checkpoint', 'pre-restore-safety', 'import')))
- `author_id` (UUID REFERENCES users(id) ON DELETE SET NULL)
- `metrics` (JSONB, NOT NULL DEFAULT '{}'::jsonb)
- `project_data` (JSONB, NOT NULL)
- `checksum` (CHAR(64), NOT NULL)
- `created_at` (TIMESTAMPTZ, NOT NULL DEFAULT clock_timestamp())
- CONSTRAINT `uq_project_snapshots_revision` UNIQUE (`project_id`, `revision`)

#### 7. `user_settings`
- `id` (UUID, PRIMARY KEY DEFAULT gen_random_uuid())
- `user_id` (UUID, NOT NULL REFERENCES users(id) ON DELETE CASCADE)
- `organization_id` (UUID, NOT NULL REFERENCES organizations(id) ON DELETE CASCADE)
- `settings` (JSONB, NOT NULL DEFAULT '{}'::jsonb)
- `updated_at` (TIMESTAMPTZ, NOT NULL DEFAULT clock_timestamp())
- CONSTRAINT `uq_user_settings_user_org` UNIQUE (`user_id`, `organization_id`)

---

## 3. ROW-LEVEL SECURITY & TENANT CONTEXT DESIGN

### Decision: Standardized Variable Key
**Resolved Key:** `app.current_tenant_id`  
*Rationale:* "Tenant" unambiguously represents the isolation boundary across all services, matching both organizations and single-workspace entities.

### Transaction-Scoped Tenant Assignment
Before executing queries, the connection must establish the tenant context within the active transaction:
```sql
SET LOCAL app.current_tenant_id = '00000000-0000-0000-0000-000000000000';
```
Using `SET LOCAL` ensures that when the transaction terminates via `COMMIT` or `ROLLBACK`, the setting automatically reverts.

### Fail-Closed Expression
RLS policies must handle unset or blank strings safely by coercing empty values to `NULL`:
```sql
NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
```
When unset, `current_setting(..., true)` returns `NULL`. `NULLIF(NULL, '')` yields `NULL`. In SQL, `organization_id = NULL` evaluates to `UNKNOWN` (falsy), blocking all reads and writes.

### Policy Implementations
Every tenant-scoped table enables RLS and enforces it on table owners:
```sql
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON projects
  FOR ALL
  TO plotify_app
  USING (organization_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
```

### PostgreSQL Engine Error Behavior (Technical Clarification)
- **`USING` clause violation (SELECT, UPDATE, DELETE):** Silent filter. `SELECT` returns `[]`; `UPDATE`/`DELETE` returns `rowCount === 0`. No exception is raised.
- **`WITH CHECK` clause violation (INSERT, UPDATE):** Raises SQLSTATE `44000` (`check_violation`).
- **Permission denial (e.g. attempting DDL with `plotify_app`):** Raises SQLSTATE `42501` (`insufficient_privilege`).

---

## 4. SNAPSHOT REVISION CONCURRENCY & SERIALIZATION

To guarantee strictly contiguous revision numbers without collisions or race conditions:

### Atomicity Contract
1. Begin transaction.
2. Acquire exclusive row-level lock on the parent project:
   ```sql
   SELECT id FROM projects 
   WHERE id = $1 AND organization_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid 
   FOR UPDATE;
   ```
3. Calculate next revision:
   ```sql
   SELECT COALESCE(MAX(revision), 0) + 1 AS next_rev 
   FROM project_snapshots 
   WHERE project_id = $1 AND organization_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid;
   ```
4. Insert snapshot with computed `next_rev` and project JSON payload.
5. Commit transaction.

### Backstop Protection
The unique constraint `UNIQUE (project_id, revision)` guarantees that even if a thread bypasses locking, PostgreSQL rejects duplicate revisions with SQLSTATE `23505` (`unique_violation`).

---

## 5. MIGRATION RUNNER, CHECKSUMS, AND LOCKING

### Locking Primitive Decision
**Resolved Lock:** `SELECT pg_advisory_xact_lock(hashtext('plotify_schema_migrations_lock'));`  
*Rationale:* `pg_advisory_xact_lock` is transaction-scoped. It automatically releases upon transaction completion or unexpected disconnect, eliminating connection leakage risks inherent to session-level advisory locks.

### Checksum Validation Contract
- Every migration SQL file is hashed with SHA-256 before execution.
- If `schema_migrations` contains an entry for version `N`:
  - If stored hash matches calculated hash: Skip (already applied).
  - If stored hash DOES NOT match: Immediately abort migration process with `ERR_MIGRATION_CHECKSUM_MISMATCH`. Do NOT execute DDL.

### Rollback Contract
- `rollbackLastMigration()`: Rolls back ONLY the single latest applied migration script (`*_down.sql`).
- Complete reverse migration: Rolls back migrations in strictly reverse topological order (`0004_down` → `0003_down` → `0002_down` → `0001_down`).
- No `DROP TABLE ... CASCADE` in production scripts to avoid masking cross-table dependency faults.

---

## 6. ARCHIVE INGESTION LIMITS & ATOMICITY

### Decision: Ingestion Thresholds
**Max Projects per Archive:** 100 projects.  
**Max Uncompressed Payload Size:** 50 MB.  
*Rationale:* 100 projects with detailed vector floor plans and snapshots comfortably fit under 30 MB in JSON format, preventing Node.js event-loop exhaustion and memory spikes under Docker containers.

### Transactional Atomicity Contract
Ingestion runs within a single atomic database transaction:
1. Validate JSON schema, UUID formats, and project limits in memory.
2. If invalid: reject immediately with validation error (0 DB interactions).
3. If valid: `BEGIN` transaction.
4. Set tenant context: `SET LOCAL app.current_tenant_id = $1`.
5. Insert projects and associated snapshots.
6. If any record fails (constraint, format, or synthetic crash): issue `ROLLBACK`.
7. Verify that zero records were retained in the database.

---

## 7. DATABASE ROLES & ACCESS CONTROL

### Role Definitions (`scripts/init_roles.sql`)

```sql
-- 1. Migration Role (DDL Owner)
CREATE ROLE plotify_migrator WITH LOGIN PASSWORD '...';
GRANT CONNECT ON DATABASE plotify_db TO plotify_migrator;
GRANT USAGE, CREATE ON SCHEMA public TO plotify_migrator;

-- 2. Application Runtime Role (DML Only)
CREATE ROLE plotify_app WITH LOGIN PASSWORD '...' 
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
GRANT CONNECT ON DATABASE plotify_db TO plotify_app;
GRANT USAGE ON SCHEMA public TO plotify_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO plotify_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO plotify_app;

-- Explicitly Deny DDL and Migration Ledger to Application Role
REVOKE ALL ON TABLE schema_migrations FROM plotify_app;
REVOKE CREATE ON SCHEMA public FROM plotify_app;
```

---

## 8. BACKEND INTEGRATION & FRONTEND BOUNDARY

The existing client-side `Project` data model is preserved 100%. The future backend bridges the client through standard Express proxy endpoints:

- `GET /api/projects` → Returns `Project[]` for active tenant.
- `GET /api/projects/:id` → Returns single `Project`.
- `POST /api/projects` → Upserts project row and JSONB `data`.
- `POST /api/projects/:id/snapshots` → Creates locked revision snapshot.
- `GET /api/projects/:id/snapshots` → Returns snapshot history.

The frontend storage layer (`src/services/storage.ts`) can easily feature-flag between `localStorage` (offline/demo mode) and `/api/projects` (cloud persistence mode) without changing UI components.
