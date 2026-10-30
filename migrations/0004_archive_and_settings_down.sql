-- ============================================================================
-- Migration 0004: Archive Ingestion Audit & Validation Ledger
-- Down Migration (Reverse)
-- ============================================================================

DROP POLICY IF EXISTS tenant_isolation_policy_archives ON archive_ingestion_jobs;
DROP TABLE IF EXISTS archive_ingestion_jobs;
