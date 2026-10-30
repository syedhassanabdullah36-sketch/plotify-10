-- ============================================================================
-- Migration 0003: Project Snapshots & Revision Sequencing
-- Down Migration (Reverse)
-- ============================================================================

DROP POLICY IF EXISTS tenant_isolation_policy_snapshots ON project_snapshots;
DROP TABLE IF EXISTS project_snapshots;
