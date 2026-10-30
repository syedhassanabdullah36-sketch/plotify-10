/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Pool, PoolClient } from 'pg';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Canonical PostgreSQL session/transaction configuration parameter used by
 * all Row-Level Security (RLS) policies in migrations 0002, 0003, and 0004.
 */
export const TENANT_CONTEXT_SETTING = 'app.current_tenant_id' as const;

export class TenantContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenantContextError';
  }
}

/**
 * Validates whether a tenant string conforms to a valid UUID.
 */
export function isValidTenantId(tenantId: string): boolean {
  if (!tenantId || typeof tenantId !== 'string') return false;
  return UUID_REGEX.test(tenantId.trim());
}

/**
 * Executes a callback within a single transaction with a transaction-scoped
 * tenant context setting (`app.current_tenant_id`).
 *
 * If tenantId is omitted, empty, or invalid, the function rejects immediately
 * to guarantee fail-closed execution before any queries touch the database.
 */
export async function withTenantContext<T>(
  pool: Pool,
  tenantId: string,
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  if (!isValidTenantId(tenantId)) {
    throw new TenantContextError(
      `Invalid tenant ID: "${tenantId}". Must be a non-empty valid UUID string.`
    );
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // set_config with is_local = true ensures the setting applies only to the current transaction
    await client.query('SELECT set_config($1, $2, true)', [
      TENANT_CONTEXT_SETTING,
      tenantId.trim(),
    ]);

    const result = await callback(client);

    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Ignore rollback error if connection was terminated so root cause err is preserved
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Sets tenant context on an existing client connection within an already-active transaction.
 */
export async function setTenantContextOnClient(
  client: PoolClient,
  tenantId: string
): Promise<void> {
  if (!isValidTenantId(tenantId)) {
    throw new TenantContextError(
      `Invalid tenant ID: "${tenantId}". Must be a non-empty valid UUID string.`
    );
  }
  await client.query('SELECT set_config($1, $2, true)', [
    TENANT_CONTEXT_SETTING,
    tenantId.trim(),
  ]);
}
