-- ============================================================================
-- Migration 0003: Project Snapshots & Revision Sequencing
-- Up Migration
-- ============================================================================

CREATE TABLE IF NOT EXISTS project_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  version_tag VARCHAR(64) NOT NULL,
  label VARCHAR(255) NOT NULL,
  description TEXT,
  trigger VARCHAR(32) NOT NULL CHECK (trigger IN ('manual', 'auto-checkpoint', 'pre-restore-safety', 'import')),
  author_id UUID REFERENCES users(id) ON DELETE SET NULL,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  project_data JSONB NOT NULL,
  checksum CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_project_snapshots_revision UNIQUE (project_id, revision)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_project_revision ON project_snapshots(project_id, revision DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_organization_id ON project_snapshots(organization_id);

-- Enable & Force RLS
ALTER TABLE project_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_snapshots FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_policy_snapshots ON project_snapshots;
CREATE POLICY tenant_isolation_policy_snapshots ON project_snapshots
  FOR ALL
  TO plotify_app
  USING (organization_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
