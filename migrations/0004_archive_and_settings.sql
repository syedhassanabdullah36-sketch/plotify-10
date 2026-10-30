-- ============================================================================
-- Migration 0004: Archive Ingestion Audit & Validation Ledger
-- Up Migration
-- ============================================================================

CREATE TABLE IF NOT EXISTS archive_ingestion_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  archive_name VARCHAR(255) NOT NULL,
  project_count INTEGER NOT NULL CHECK (project_count > 0 AND project_count <= 100),
  payload_size_bytes BIGINT NOT NULL CHECK (payload_size_bytes <= 52428800), -- 50 MB limit
  status VARCHAR(32) NOT NULL DEFAULT 'completed' CHECK (status IN ('in_progress', 'completed', 'failed', 'rolled_back')),
  checksum CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_archive_jobs_org_id ON archive_ingestion_jobs(organization_id);

ALTER TABLE archive_ingestion_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE archive_ingestion_jobs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_policy_archives ON archive_ingestion_jobs;
CREATE POLICY tenant_isolation_policy_archives ON archive_ingestion_jobs
  FOR ALL
  TO plotify_app
  USING (organization_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
