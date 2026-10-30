# Plotify — Deployment & Configuration Guide

**Application:** Plotify — AI-Powered Architectural Intelligence  
**Architecture:** Single-Page Application (SPA) on React 19 + TypeScript + Vite + Tailwind CSS v4  
**Current Release Version:** v1.0.0-rc1  
**Target Environments:** Development, Staging / Preview, Production  

---

## 1. Environment Configurations

| Setting | Development | Staging / Preview | Production | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **PORT** | `3000` | Cloud Run / Container Port | Standard HTTPS (443 / 80) | Port 3000 enforced for dev |
| **HOST** | `0.0.0.0` | `0.0.0.0` | Container / Ingress Host | Binds to all interfaces |
| **Data Persistence** | Browser `localStorage` | Browser `localStorage` | Browser `localStorage` (Isolated) | Client-side zero-leak storage |
| **Build Mode** | `development` (HMR off) | `production` (`vite build`) | `production` (`vite build`) | Minified ES modules |
| **Source Maps** | Inline / Enabled | Disabled for security | Disabled | Eliminates bundle leakage |
| **API Proxy** | Server-side `/api/*` | Server-side `/api/*` | Server-side `/api/*` | Zero client-side API secrets |

### Environment Variables Validation
Plotify adheres to strict client-side and backend credential protection:
- **No API secrets or backend database credentials may be exposed in client code (`VITE_...`).**
- Any future AI features or proxy calls run server-side via Express routes without exposing keys in frontend bundles.
- **Database Credentials (`P2-02` Fail-Closed Enforcement):**
  - No fallback passwords exist in application code or SQL provisioning scripts.
  - In `production` and `staging` environments (`NODE_ENV=production` / `staging`), missing database credentials (`PGPASSWORD` / `APP_DATABASE_URL` / `DATABASE_URL` for `plotify_app`, and `PGMIGRATOR_PASSWORD` / `MIGRATOR_DATABASE_URL` for `plotify_migrator`) cause `getDatabaseConfig()` and `validateDatabaseStartupConfig()` to fail closed immediately with `DatabaseConfigError` (`ERR_DB_CREDENTIALS_REQUIRED`).
  - Legacy placeholder strings (`plotify_app_secure_pass`, `plotify_migrator_secure_pass`, `changeme`) are explicitly rejected in all environments (`ERR_DB_INSECURE_CREDENTIAL`).
  - When provisioning roles via `scripts/init_roles.sql`, supply strong passwords via PostgreSQL session settings (`plotify.migrator_password` and `plotify.app_password`).
- **Gateway & Database Hardening (`P2-03`):**
  - **JWT Issuer & Audience (`JWT_ISSUER`, `JWT_AUDIENCE`, `JWT_REQUIRE_ISS_AUD`):** When `JWT_ISSUER` / `JWT_AUDIENCE` are set, `createJwtToken()` automatically embeds them and `verifyJwtToken()` enforces exact matching. Setting `JWT_REQUIRE_ISS_AUD=true` fails closed if either `JWT_ISSUER` or `JWT_AUDIENCE` is unset.
  - **Endpoint-Scoped Body Limits (`JSON_BODY_LIMIT`, `ARCHIVE_BODY_LIMIT`):** Authentication and tenant authorization execute before body parsing on `/api`. Standard project/snapshot routes default to `2mb` (`JSON_BODY_LIMIT`), while `/api/archives/ingest` defaults to `50mb` (`ARCHIVE_BODY_LIMIT`), returning HTTP `413` (`ERR_PAYLOAD_TOO_LARGE`) on oversized requests.
  - **Rate Limiting & Proxy Trust (`TRUST_PROXY`, `RATE_LIMIT_*`):** `TRUST_PROXY` defaults to `false` (ignoring spoofed `X-Forwarded-For` headers unless explicitly enabled behind a trusted reverse proxy). Bounded single-instance rate limiting enforces `RATE_LIMIT_MAX_REQUESTS` (default `300` / 60s) on `/api` and `RATE_LIMIT_ARCHIVE_MAX_REQUESTS` (default `30` / 60s) on `/api/archives` with HTTP `429` (`ERR_RATE_LIMITED`). Multi-instance horizontal deployments should pair this with an upstream edge/WAF or shared Redis rate limiter.
  - **Request Correlation & Log Redaction (`X-Request-Id`):** Valid client `X-Request-Id` values (`/^[A-Za-z0-9._-]{8,64}$/`, non-JWT) are preserved; missing or unsafe values are replaced with a fresh UUIDv4. Error logs redact passwords, connection URLs, Bearer headers, raw JWTs, and CR/LF characters.
  - **PostgreSQL TLS (`PGSSLMODE`, `PGSSLROOTCERT`, `PGSSLROOTCERT_PEM`):** Supports `disable`, `require`, `verify-ca`, and `verify-full` with `rejectUnauthorized: true`. Disabling certificate verification (`PGSSLREJECTUNAUTHORIZED=false` or `sslmode=no-verify`) is rejected with `ERR_DB_INSECURE_TLS`.
- See `.env.example` for baseline environment variable placeholders.

---

## 2. Build & Verification Commands

All release candidates must pass the complete verification pipeline before deployment:

```bash
# 1. Static Type Checking & Linting
npm run lint

# 2. Complete 12-Discipline Verification Suite
npm test

# 3. Production Compilation & Asset Bundling
npm run build

# 4. Preview Built Artifacts Locally
npm run preview

# 5. Offline Gate 1 / Stage 1 / Stage 2 / Gate 2 Backend & Persistence Audits
npm run test:api
npm run test:stage2
npm run test:gate2

# 6. Gate 3 Live PostgreSQL 16+ Integration Suite (Requires Isolated Test DB)
npm run test:gate3
```

### Gate 3 Isolated PostgreSQL 16+ Setup & Execution Contract (`P2-07`)
- **Safety Guard (`validateTestDatabaseTarget`):**
  - Refuses to connect unless `TEST_DATABASE_URL` (or `DATABASE_URL` when `ALLOW_TEST_DB=true`) targets a local/test host (`localhost`, `127.0.0.1`, `::1`, `host.docker.internal`, `postgres`, `db`, `*.local`, `*.test`), blocks cloud/managed database hostnames (`amazonaws.com`, `google`, `cloudsql`, `rds`, `azure`, `digitalocean`, `supabase.co`, `neon.tech`, `elephantsql`, `heroku`), and requires the database name to contain `test` or `isolated` (e.g., `plotify_test`).
- **Role Initialization (`scripts/init_roles.sql`):**
  - Must be executed against a blank isolated test database (`plotify_test`) before running Gate 3 so that `G3-INT-01` applies all 4 migrations from a clean state (`appliedCount === 4`):
    ```bash
    psql "postgres://postgres@127.0.0.1:5432/plotify_test" \
      -v ON_ERROR_STOP=1 \
      -v migrator_password="<STRONG_MIGRATOR_PASSWORD>" \
      -v app_password="<STRONG_APP_PASSWORD>" \
      -f scripts/init_roles.sql
    ```
- **Gate 3 Runner Environment Variables:**
  - `TEST_DATABASE_URL`: PostgreSQL connection URL for `plotify_migrator` (`migratorPool`), used for DDL migrations (`G3-INT-01`..`04`, `G3-INT-11`) and test fixture seeding/verification.
  - `TEST_APP_DATABASE_URL`: PostgreSQL connection URL for `plotify_app` (`appPool`, `NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`), used for RLS, DML, and privilege-boundary verification (`G3-INT-05`..`10`, `G3-INT-12`..`16`). Alternatively, if `TEST_APP_DATABASE_URL` is omitted, `TEST_APP_PASSWORD` (and optional `TEST_APP_USER`, default `plotify_app`) derives `appDbUrl` from `TEST_DATABASE_URL`.
  - `ALLOW_TEST_DB`: Must be `'true'` if falling back to `DATABASE_URL` when `TEST_DATABASE_URL` is unset.

### Build Artifacts
Running `npm run build` produces the `dist/` directory containing:
- `dist/index.html`: Entry point with strict Content Security Policy (CSP).
- `dist/assets/*.js`: Code-split ES modules (React, Three.js, Lucide).
- `dist/assets/*.css`: Tailwind CSS v4 utility classes.

---

## 3. Deployment Targets & Infrastructure

Plotify can be served from any modern static asset CDN or containerized web server:

### Option A: Static CDN Hosting (Recommended for Client-Side SPA)
- **Targets:** Cloudflare Pages, Vercel, AWS S3 + CloudFront, Google Cloud Storage + Cloud CDN.
- **Routing:** All non-asset routes must rewrite to `/index.html` (Single Page Application fallback).
- **HTTP Headers:**
  - `Content-Security-Policy`: Matches CSP in `index.html`.
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Cache-Control: public, max-age=31536000, immutable` for hashed assets in `/assets/`.
  - `Cache-Control: no-cache` for `index.html`.

### Option B: Containerized Cloud Run / Node.js Host
- Run via standard Node 22 / Express static file server serving `/dist`.
- Container memory threshold: 512MB RAM minimum (1GB recommended for Three.js 3D rendering clients).

---

## 4. Rollback & Recovery Procedures

If a deployment exhibits regressions:
1. **Immediate CDN Rollback:** In Cloudflare Pages or Cloud Run, re-point the active release tag to the previous stable release commit.
2. **Local Client Data Preservation:**
   - Plotify versions and projects are stored in the client's browser `localStorage`.
   - Reverting the web application bundle does **not** corrupt or wipe existing client projects, provided the schema migrations in `src/services/storage.ts` remain backward-compatible.
3. **Disaster Recovery:** If user encounters an issue, they can export their project as JSON before clearing browser cache.
