-- ============================================================================
-- PLOTIFY ARCHITECTURE INTELLIGENCE OS
-- P53: Database Role Provisioning and Least Privilege Setup
-- Target Engine: PostgreSQL 16+
-- ============================================================================

-- Ensure script is idempotent and requires externally supplied passwords via psql -v variables
-- or PostgreSQL session settings:
-- Example (psql -v variable substitution with safe SQL literal quoting):
--   psql -v ON_ERROR_STOP=1 \
--     -v migrator_password="<STRONG_MIGRATOR_PASSWORD>" \
--     -v app_password="<STRONG_APP_PASSWORD>" \
--     -f scripts/init_roles.sql
--
-- Example (PostgreSQL session settings):
--   psql -v ON_ERROR_STOP=1 \
--     -c "SET plotify.migrator_password = '<STRONG_MIGRATOR_PASSWORD>'; SET plotify.app_password = '<STRONG_APP_PASSWORD>';" \
--     -f scripts/init_roles.sql

\if :{?migrator_password}
SELECT set_config('plotify.migrator_password', :'migrator_password', false);
\endif
\if :{?app_password}
SELECT set_config('plotify.app_password', :'app_password', false);
\endif

DO $$
DECLARE
  v_migrator_password TEXT := NULLIF(btrim(current_setting('plotify.migrator_password', true)), '');
  v_app_password TEXT := NULLIF(btrim(current_setting('plotify.app_password', true)), '');
BEGIN
  IF v_migrator_password IS NULL OR v_app_password IS NULL THEN
    RAISE EXCEPTION 'Missing required role passwords. Supply -v migrator_password=... -v app_password=... or set session settings plotify.migrator_password and plotify.app_password before running scripts/init_roles.sql.';
  END IF;

  IF lower(v_migrator_password) IN ('plotify_migrator_secure_pass', 'changeme')
     OR lower(v_app_password) IN ('plotify_app_secure_pass', 'changeme') THEN
    RAISE EXCEPTION 'Refusing to provision database roles with disallowed default placeholder passwords.';
  END IF;

  -- 1. Create Migration Role if not exists
  -- This role owns the DDL, migrations ledger, and schema definitions
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'plotify_migrator') THEN
    CREATE ROLE plotify_migrator WITH LOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE;
  END IF;
  EXECUTE format(
    'ALTER ROLE plotify_migrator WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L',
    v_migrator_password
  );

  -- 2. Create Application Runtime Role if not exists
  -- This role is restricted to DML only, NOBYPASSRLS, and NOSUPERUSER
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'plotify_app') THEN
    CREATE ROLE plotify_app WITH LOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOBYPASSRLS;
  END IF;
  EXECUTE format(
    'ALTER ROLE plotify_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD %L',
    v_app_password
  );

  -- 3. Database-level CONNECT and CREATE (for trusted pgcrypto extension in 0001)
  EXECUTE format('GRANT CONNECT, CREATE ON DATABASE %I TO plotify_migrator', current_database());
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO plotify_app', current_database());
END
$$;

-- Schema Permissions
GRANT USAGE, CREATE ON SCHEMA public TO plotify_migrator;
GRANT USAGE ON SCHEMA public TO plotify_app;

-- Grant DML to application role on existing and future public tables (including tables created by plotify_migrator)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO plotify_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO plotify_app;
ALTER DEFAULT PRIVILEGES FOR ROLE plotify_migrator IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO plotify_app;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO plotify_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO plotify_app;
ALTER DEFAULT PRIVILEGES FOR ROLE plotify_migrator IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO plotify_app;

-- Explicitly deny DDL & migration table to runtime application role
REVOKE CREATE ON SCHEMA public FROM plotify_app;
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'schema_migrations') THEN
    REVOKE ALL ON TABLE schema_migrations FROM plotify_app;
  END IF;
END
$$;
