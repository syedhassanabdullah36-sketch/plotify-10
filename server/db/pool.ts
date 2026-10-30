/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import { Pool, PoolConfig } from 'pg';

let appPool: Pool | null = null;
let migratorPool: Pool | null = null;

export type DatabaseRole = 'app' | 'migrator';
export type PostgresSslMode = 'disable' | 'require' | 'verify-ca' | 'verify-full';

const ALLOWED_SSL_MODES: ReadonlySet<string> = new Set([
  'disable',
  'require',
  'verify-ca',
  'verify-full',
]);

export interface DatabaseConfigOptions {
  env?: NodeJS.ProcessEnv;
  requireCredentials?: boolean;
}

export class DatabaseConfigError extends Error {
  public readonly code: string;

  constructor(message: string, code: string = 'ERR_DB_CONFIG') {
    super(message);
    this.name = 'DatabaseConfigError';
    this.code = code;
  }
}

/**
 * Disallowed hardcoded/placeholder passwords that must never be used.
 */
export const INSECURE_DEFAULT_PASSWORDS: ReadonlySet<string> = new Set([
  'plotify_app_secure_pass',
  'plotify_migrator_secure_pass',
  'changeme',
]);

function isInsecureDefaultPassword(password: string): boolean {
  const normalized = password.trim().toLowerCase();
  return INSECURE_DEFAULT_PASSWORDS.has(normalized);
}

function isProductionLikeEnvironment(
  env: NodeJS.ProcessEnv,
  requireCredentialsOverride?: boolean
): boolean {
  if (typeof requireCredentialsOverride === 'boolean') {
    return requireCredentialsOverride;
  }
  const nodeEnv = (env.NODE_ENV || '').trim().toLowerCase();
  return (
    nodeEnv === 'production' ||
    nodeEnv === 'staging' ||
    env.PLOTIFY_REQUIRE_DB_CREDENTIALS === 'true'
  );
}

/**
 * Masks credentials in a PostgreSQL connection URL so secrets are never logged.
 */
export function maskConnectionString(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  try {
    const parsed = new URL(rawUrl);
    if (parsed.password) {
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    return rawUrl.replace(/(:\/\/[^:/@\s]+:)([^@\s]+)(@)/g, '$1***$3');
  }
}

/**
 * Redacts connection string passwords, key=value password patterns, Bearer tokens,
 * raw JWT tokens, control characters, and any known environment secrets from error
 * messages before logging or surfacing.
 */
export function sanitizeDatabaseErrorMessage(
  errOrMessage: unknown,
  additionalSecrets: string[] = []
): string {
  const rawMessage =
    errOrMessage instanceof Error
      ? errOrMessage.message
      : typeof errOrMessage === 'string'
      ? errOrMessage
      : String(errOrMessage ?? 'Unknown database error');

  let sanitized = rawMessage
    // Strip CR/LF control characters to prevent log entry forging
    .replace(/[\r\n]+/g, ' ')
    // Redact postgres://user:pass@host connection strings
    .replace(/(postgres(?:ql)?:\/\/[^:/@\s]+:)([^@\s]+)(@)/gi, '$1***$3')
    // Redact password=... or password: ... patterns
    .replace(/(password\s*[=:]\s*['"]?)([^'"\s,;]+)(['"]?)/gi, '$1***$3')
    // Redact Authorization Bearer tokens
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1[REDACTED]')
    // Redact raw 3-part base64url JWTs (eyJ...)
    .replace(/\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, '[REDACTED_JWT]');

  const candidateSecrets = [
    process.env.PGPASSWORD,
    process.env.PGMIGRATOR_PASSWORD,
    process.env.TEST_APP_PASSWORD,
    process.env.JWT_SECRET,
    ...additionalSecrets,
  ].filter((s): s is string => typeof s === 'string' && s.trim().length > 0);

  for (const secret of candidateSecrets) {
    if (sanitized.includes(secret)) {
      sanitized = sanitized.split(secret).join('***');
    }
  }

  return sanitized;
}

/**
 * Resolves and validates PostgreSQL TLS/SSL settings from environment variables
 * and optional connection URL search params without weakening certificate verification.
 */
function resolvePostgresSslConfig(
  env: NodeJS.ProcessEnv,
  urlSslMode?: string | null
): PoolConfig['ssl'] {
  const rawMode = (env.PGSSLMODE ?? urlSslMode ?? '').trim().toLowerCase();
  const rawRejectUnauth = (env.PGSSLREJECTUNAUTHORIZED ?? '').trim().toLowerCase();

  // Never allow disabling TLS certificate verification in configuration
  if (rawRejectUnauth === 'false' || rawRejectUnauth === '0') {
    throw new DatabaseConfigError(
      'Disabling TLS certificate verification (PGSSLREJECTUNAUTHORIZED=false) is prohibited.',
      'ERR_DB_INSECURE_TLS'
    );
  }

  if (!rawMode) {
    return undefined;
  }

  if (rawMode === 'no-verify') {
    throw new DatabaseConfigError(
      'Insecure sslmode "no-verify" is prohibited. Use "require", "verify-ca", or "verify-full".',
      'ERR_DB_INSECURE_TLS'
    );
  }

  if (!ALLOWED_SSL_MODES.has(rawMode)) {
    throw new DatabaseConfigError(
      `Unsupported PGSSLMODE "${rawMode}". Allowed modes: disable, require, verify-ca, verify-full.`,
      'ERR_DB_INVALID_CONFIG'
    );
  }

  if (rawMode === 'disable') {
    return false;
  }

  let caCert: string | undefined;
  if (env.PGSSLROOTCERT_PEM && env.PGSSLROOTCERT_PEM.trim().length > 0) {
    caCert = env.PGSSLROOTCERT_PEM.trim();
  } else if (env.PGSSLROOTCERT && env.PGSSLROOTCERT.trim().length > 0) {
    const certPath = env.PGSSLROOTCERT.trim();
    if (!fs.existsSync(certPath)) {
      throw new DatabaseConfigError(
        'Configured PGSSLROOTCERT file path does not exist.',
        'ERR_DB_INVALID_CONFIG'
      );
    }
    const content = fs.readFileSync(certPath, 'utf8').trim();
    if (!content) {
      throw new DatabaseConfigError(
        'Configured PGSSLROOTCERT file is empty.',
        'ERR_DB_INVALID_CONFIG'
      );
    }
    caCert = content;
  }

  return {
    rejectUnauthorized: true,
    ...(caCert ? { ca: caCert } : {}),
  };
}

/**
 * Builds and validates PostgreSQL PoolConfig for 'app' (plotify_app) or 'migrator' (plotify_migrator).
 * - Never falls back to hardcoded passwords.
 * - Rejects known insecure placeholder passwords in all environments.
 * - Fails closed in production/staging if explicit credentials are missing.
 * - Validates optional TLS/SSL configuration without allowing insecure certificate bypasses.
 */
export function getDatabaseConfig(
  role: DatabaseRole = 'app',
  options?: DatabaseConfigOptions
): PoolConfig {
  const env = options?.env ?? process.env;
  const isProdLike = isProductionLikeEnvironment(env, options?.requireCredentials);
  const nodeEnvLabel = (env.NODE_ENV || 'strict').trim() || 'strict';

  const rawConnectionString =
    role === 'migrator'
      ? env.MIGRATOR_DATABASE_URL ?? env.DATABASE_MIGRATOR_URL ?? env.DATABASE_URL
      : env.APP_DATABASE_URL ?? env.DATABASE_APP_URL ?? env.DATABASE_URL;

  if (rawConnectionString !== undefined && rawConnectionString.trim().length > 0) {
    const connectionString = rawConnectionString.trim();
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(connectionString);
    } catch {
      throw new DatabaseConfigError(
        `Invalid database connection URL format for role "${role}".`,
        'ERR_DB_INVALID_CONFIG'
      );
    }

    const protocol = parsedUrl.protocol.toLowerCase();
    if (protocol !== 'postgres:' && protocol !== 'postgresql:') {
      throw new DatabaseConfigError(
        `Unsupported database URL protocol "${parsedUrl.protocol}" for role "${role}". Expected postgres: or postgresql:.`,
        'ERR_DB_INVALID_CONFIG'
      );
    }

    if (parsedUrl.port) {
      const urlPort = Number(parsedUrl.port);
      if (!Number.isInteger(urlPort) || urlPort < 1 || urlPort > 65535) {
        throw new DatabaseConfigError(
          `Invalid port in database connection URL for role "${role}".`,
          'ERR_DB_INVALID_CONFIG'
        );
      }
    }

    const dbName = parsedUrl.pathname.replace(/^\/+/, '').trim();
    if (!dbName) {
      throw new DatabaseConfigError(
        `Database connection URL for role "${role}" is missing a database name.`,
        'ERR_DB_INVALID_CONFIG'
      );
    }

    const decodedUser = decodeURIComponent(parsedUrl.username || '').trim();
    const decodedPassword = decodeURIComponent(parsedUrl.password || '');

    if (decodedPassword && isInsecureDefaultPassword(decodedPassword)) {
      throw new DatabaseConfigError(
        `Refusing to use insecure default password in connection URL for database role "${role}".`,
        'ERR_DB_INSECURE_CREDENTIAL'
      );
    }

    if (isProdLike && (!decodedUser || !decodedPassword || decodedPassword.trim().length === 0)) {
      throw new DatabaseConfigError(
        `Missing database username or password in connection URL for role "${role}" in ${nodeEnvLabel} mode.`,
        'ERR_DB_CREDENTIALS_REQUIRED'
      );
    }

    const sslConfig = resolvePostgresSslConfig(env, parsedUrl.searchParams.get('sslmode'));

    return {
      connectionString,
      ...(sslConfig !== undefined ? { ssl: sslConfig } : {}),
      max: role === 'migrator' ? 2 : 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    };
  }

  // Discrete PG* environment variable resolution
  if (env.PGHOST !== undefined && env.PGHOST.trim().length === 0) {
    throw new DatabaseConfigError(
      'PGHOST cannot be empty or whitespace when specified.',
      'ERR_DB_INVALID_CONFIG'
    );
  }

  const rawPort = env.PGPORT !== undefined ? env.PGPORT.trim() : '5432';
  if (!/^\d+$/.test(rawPort)) {
    throw new DatabaseConfigError(
      'Invalid PGPORT configuration. Must be an integer between 1 and 65535.',
      'ERR_DB_INVALID_CONFIG'
    );
  }
  const port = parseInt(rawPort, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new DatabaseConfigError(
      'Invalid PGPORT configuration. Must be an integer between 1 and 65535.',
      'ERR_DB_INVALID_CONFIG'
    );
  }

  if (env.PGDATABASE !== undefined && env.PGDATABASE.trim().length === 0) {
    throw new DatabaseConfigError(
      'PGDATABASE cannot be empty or whitespace when specified.',
      'ERR_DB_INVALID_CONFIG'
    );
  }

  const rawUser = role === 'migrator' ? env.PGMIGRATOR_USER : env.PGUSER;
  if (rawUser !== undefined && rawUser.trim().length === 0) {
    throw new DatabaseConfigError(
      `Database user environment variable for role "${role}" cannot be empty or whitespace.`,
      'ERR_DB_INVALID_CONFIG'
    );
  }

  const rawPassword = role === 'migrator' ? env.PGMIGRATOR_PASSWORD : env.PGPASSWORD;
  if (rawPassword !== undefined) {
    if (rawPassword.trim().length === 0) {
      throw new DatabaseConfigError(
        `Database password environment variable for role "${role}" cannot be empty or whitespace.`,
        'ERR_DB_CREDENTIALS_REQUIRED'
      );
    }
    if (isInsecureDefaultPassword(rawPassword)) {
      throw new DatabaseConfigError(
        `Refusing to use insecure default password for database role "${role}". Configure a strong secret via environment variables.`,
        'ERR_DB_INSECURE_CREDENTIAL'
      );
    }
  } else if (isProdLike) {
    const requiredVar =
      role === 'migrator'
        ? 'PGMIGRATOR_PASSWORD or MIGRATOR_DATABASE_URL'
        : 'PGPASSWORD or DATABASE_URL';
    throw new DatabaseConfigError(
      `Missing required database credentials (${requiredVar}) for role "${role}" in ${nodeEnvLabel} mode.`,
      'ERR_DB_CREDENTIALS_REQUIRED'
    );
  }

  const sslConfig = resolvePostgresSslConfig(env, null);
  const host = (env.PGHOST || '127.0.0.1').trim();
  const database = (env.PGDATABASE || 'plotify_db').trim();
  const user =
    role === 'migrator'
      ? env.PGMIGRATOR_USER?.trim() || 'plotify_migrator'
      : env.PGUSER?.trim() || 'plotify_app';

  return {
    host,
    port,
    database,
    user,
    password: rawPassword,
    ...(sslConfig !== undefined ? { ssl: sslConfig } : {}),
    max: role === 'migrator' ? 2 : 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };
}

/**
 * Validates database configuration at startup when running in production/staging
 * or when explicit credential verification is requested.
 */
export function validateDatabaseStartupConfig(options?: {
  env?: NodeJS.ProcessEnv;
  includeMigrator?: boolean;
}): void {
  const env = options?.env ?? process.env;
  getDatabaseConfig('app', { env, requireCredentials: true });
  if (options?.includeMigrator) {
    getDatabaseConfig('migrator', { env, requireCredentials: true });
  }
}

export function getAppPool(customConfig?: PoolConfig): Pool {
  if (!appPool) {
    appPool = new Pool(customConfig || getDatabaseConfig('app'));
    appPool.on('error', (err) => {
      console.warn(
        '[Database Pool: app] Client warning/error:',
        sanitizeDatabaseErrorMessage(err)
      );
    });
  }
  return appPool;
}

export function getMigratorPool(customConfig?: PoolConfig): Pool {
  if (!migratorPool) {
    migratorPool = new Pool(customConfig || getDatabaseConfig('migrator'));
    migratorPool.on('error', (err) => {
      console.warn(
        '[Database Pool: migrator] Client warning/error:',
        sanitizeDatabaseErrorMessage(err)
      );
    });
  }
  return migratorPool;
}

export async function closePools(): Promise<void> {
  if (appPool) {
    await appPool.end();
    appPool = null;
  }
  if (migratorPool) {
    await migratorPool.end();
    migratorPool = null;
  }
}
