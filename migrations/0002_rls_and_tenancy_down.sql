-- ============================================================================
-- Migration 0002: Projects, User Settings & Row-Level Security
-- Down Migration (Reverse)
-- ============================================================================

DROP POLICY IF EXISTS tenant_isolation_policy_settings ON user_settings;
DROP POLICY IF EXISTS tenant_isolation_policy_projects ON projects;
DROP POLICY IF EXISTS tenant_isolation_policy_memberships ON organization_memberships;
DROP POLICY IF EXISTS tenant_isolation_policy_orgs ON organizations;

DROP TABLE IF EXISTS user_settings;
DROP TABLE IF EXISTS projects;

ALTER TABLE IF EXISTS organization_memberships NO FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS organization_memberships DISABLE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS organizations NO FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS organizations DISABLE ROW LEVEL SECURITY;
