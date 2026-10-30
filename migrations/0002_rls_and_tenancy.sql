-- ============================================================================
-- Migration 0002: Projects, User Settings & Row-Level Security
-- Up Migration
-- ============================================================================

-- 1. Projects Table
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  project_type VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'Drafting',
  unit VARCHAR(16) NOT NULL DEFAULT 'feet',
  budget NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  currency VARCHAR(8) NOT NULL DEFAULT 'USD',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_projects_organization_id ON projects(organization_id);

-- 2. User Settings Table
CREATE TABLE IF NOT EXISTS user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_user_settings_user_org UNIQUE (user_id, organization_id)
);

CREATE INDEX IF NOT EXISTS idx_user_settings_lookup ON user_settings(user_id, organization_id);

-- 3. Enable and Force Row Level Security (RLS) on Tenant Tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;

ALTER TABLE organization_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_memberships FORCE ROW LEVEL SECURITY;

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects FORCE ROW LEVEL SECURITY;

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings FORCE ROW LEVEL SECURITY;

-- 4. RLS Tenant Isolation Policies
DROP POLICY IF EXISTS tenant_isolation_policy_orgs ON organizations;
CREATE POLICY tenant_isolation_policy_orgs ON organizations
  FOR ALL
  TO plotify_app
  USING (id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation_policy_memberships ON organization_memberships;
CREATE POLICY tenant_isolation_policy_memberships ON organization_memberships
  FOR ALL
  TO plotify_app
  USING (organization_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation_policy_projects ON projects;
CREATE POLICY tenant_isolation_policy_projects ON projects
  FOR ALL
  TO plotify_app
  USING (organization_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation_policy_settings ON user_settings;
CREATE POLICY tenant_isolation_policy_settings ON user_settings
  FOR ALL
  TO plotify_app
  USING (organization_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
