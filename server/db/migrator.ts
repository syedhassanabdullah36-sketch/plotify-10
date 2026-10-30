/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Pool, PoolClient } from 'pg';

export interface MigrationFile {
  version: string;
  name: string;
  upPath: string;
  downPath: string;
  upSql: string;
  downSql: string;
  checksum: string;
}

export interface AppliedMigrationRecord {
  version: string;
  name: string;
  checksum: string;
  executed_at: Date;
  execution_time_ms: number;
}

export interface MigrationRunResult {
  appliedCount: number;
  appliedVersions: string[];
  skippedCount: number;
  durationMs: number;
}

export interface RollbackResult {
  rolledBackVersion: string;
  durationMs: number;
}

export class ChecksumDriftError extends Error {
  public readonly code = 'ERR_MIGRATION_CHECKSUM_MISMATCH';
  constructor(
    public readonly version: string,
    public readonly expectedChecksum: string,
    public readonly actualChecksum: string
  ) {
    super(
      `Migration checksum mismatch detected for version "${version}". ` +
      `Recorded in database: ${expectedChecksum}, Current file SHA-256: ${actualChecksum}. ` +
      `Halting execution to prevent schema corruption.`
    );
    this.name = 'ChecksumDriftError';
  }
}

/**
 * Computes deterministic SHA-256 checksum of normalized SQL string.
 */
export function computeSqlChecksum(sqlContent: string): string {
  return crypto.createHash('sha256').update(sqlContent, 'utf8').digest('hex');
}

/**
 * Loads and discovers all migration pairs in the migrations directory.
 */
export function loadMigrationFiles(migrationsDir: string = path.resolve(process.cwd(), 'migrations')): MigrationFile[] {
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory does not exist: ${migrationsDir}`);
  }

  const allFiles = fs.readdirSync(migrationsDir);
  const upFiles = allFiles
    .filter((f) => f.endsWith('.sql') && !f.endsWith('_down.sql'))
    .sort();

  return upFiles.map((upFile) => {
    const match = upFile.match(/^(\d{4})_(.+)\.sql$/);
    if (!match) {
      throw new Error(`Invalid migration filename format: "${upFile}". Expected "0001_name.sql".`);
    }

    const version = match[1];
    const name = match[2];
    const upPath = path.join(migrationsDir, upFile);
    const downFile = `${version}_${name}_down.sql`;
    const downPath = path.join(migrationsDir, downFile);

    if (!fs.existsSync(downPath)) {
      throw new Error(`Missing required down-migration file: "${downFile}" for version ${version}.`);
    }

    const upSql = fs.readFileSync(upPath, 'utf8');
    const downSql = fs.readFileSync(downPath, 'utf8');
    const checksum = computeSqlChecksum(upSql);

    return {
      version,
      name,
      upPath,
      downPath,
      upSql,
      downSql,
      checksum,
    };
  });
}

/**
 * Initializes the schema_migrations ledger if not present.
 */
export async function ensureMigrationsTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(32) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      checksum CHAR(64) NOT NULL,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      execution_time_ms INTEGER NOT NULL
    );
  `);
}

/**
 * Runs pending migrations under a transaction-scoped advisory lock.
 */
export async function runMigrations(
  pool: Pool,
  options: { migrationsDir?: string; dryRun?: boolean } = {}
): Promise<MigrationRunResult> {
  const migrations = loadMigrationFiles(options.migrationsDir);
  const client = await pool.connect();
  const startTime = Date.now();

  try {
    await client.query('BEGIN');

    // Acquire transaction-scoped advisory lock (auto-releases on COMMIT or ROLLBACK)
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('plotify_schema_migrations_lock'))`);

    await ensureMigrationsTable(client);

    // Fetch existing applied migrations
    const ledgerRes = await client.query<AppliedMigrationRecord>(
      `SELECT version, name, checksum, executed_at, execution_time_ms FROM schema_migrations ORDER BY version ASC`
    );
    const appliedMap = new Map<string, AppliedMigrationRecord>();
    for (const row of ledgerRes.rows) {
      appliedMap.set(row.version, row);
    }

    // Step 1: Verify all previously applied migrations match current checksums (drift check)
    for (const m of migrations) {
      const recorded = appliedMap.get(m.version);
      if (recorded) {
        if (recorded.checksum !== m.checksum) {
          throw new ChecksumDriftError(m.version, recorded.checksum, m.checksum);
        }
      }
    }

    // Step 2: Apply pending migrations in sequence
    const appliedVersions: string[] = [];
    let skippedCount = 0;

    for (const m of migrations) {
      if (appliedMap.has(m.version)) {
        skippedCount++;
        continue;
      }

      if (options.dryRun) {
        appliedVersions.push(m.version);
        continue;
      }

      const migrationStart = Date.now();
      await client.query(m.upSql);
      const executionTimeMs = Date.now() - migrationStart;

      await client.query(
        `INSERT INTO schema_migrations (version, name, checksum, executed_at, execution_time_ms)
         VALUES ($1, $2, $3, clock_timestamp(), $4)`,
        [m.version, m.name, m.checksum, executionTimeMs]
      );

      appliedVersions.push(m.version);
    }

    await client.query('COMMIT');

    return {
      appliedCount: appliedVersions.length,
      appliedVersions,
      skippedCount,
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Rolls back the latest applied migration.
 */
export async function rollbackLastMigration(
  pool: Pool,
  options: { migrationsDir?: string } = {}
): Promise<RollbackResult> {
  const migrations = loadMigrationFiles(options.migrationsDir);
  const migrationMap = new Map(migrations.map((m) => [m.version, m]));

  const client = await pool.connect();
  const startTime = Date.now();

  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('plotify_schema_migrations_lock'))`);

    await ensureMigrationsTable(client);

    const latestRes = await client.query<{ version: string; name: string }>(
      `SELECT version, name FROM schema_migrations ORDER BY version DESC LIMIT 1`
    );

    if (latestRes.rows.length === 0) {
      await client.query('COMMIT');
      return { rolledBackVersion: 'none', durationMs: Date.now() - startTime };
    }

    const { version, name } = latestRes.rows[0];
    const migration = migrationMap.get(version);

    if (!migration) {
      throw new Error(`Cannot rollback version "${version}". Missing local down-migration script.`);
    }

    // Execute down SQL
    await client.query(migration.downSql);

    // Delete record from ledger
    await client.query(`DELETE FROM schema_migrations WHERE version = $1`, [version]);

    await client.query('COMMIT');

    return {
      rolledBackVersion: version,
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Rolls back all applied migrations in reverse topological order.
 */
export async function rollbackAllMigrations(
  pool: Pool,
  options: { migrationsDir?: string } = {}
): Promise<string[]> {
  const rolledBack: string[] = [];
  while (true) {
    const res = await rollbackLastMigration(pool, options);
    if (res.rolledBackVersion === 'none') break;
    rolledBack.push(res.rolledBackVersion);
  }
  return rolledBack;
}
