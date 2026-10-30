/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import express, { Express, Request, Response, NextFunction } from 'express';
import { authenticateUser, authorizeTenantMembership } from './middleware/auth';
import { sanitizeDatabaseErrorMessage } from './db/pool';
import { projectsRouter } from './routes/projects';
import { snapshotsRouter } from './routes/snapshots';
import { archivesRouter } from './routes/archives';

export interface CreateAppOptions {
  jsonBodyLimit?: string | number;
  archiveBodyLimit?: string | number;
  trustProxy?: boolean | number | string;
  rateLimitWindowMs?: number;
  rateLimitMaxRequests?: number;
  archiveRateLimitMaxRequests?: number;
}

const SAFE_REQUEST_ID_REGEX = /^[A-Za-z0-9._-]{8,64}$/;
const JWT_LIKE_REGEX = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/;
const MAX_TRACKED_RATE_LIMIT_KEYS = 5000;

/**
 * Validates a client-provided X-Request-Id header or generates a fresh UUIDv4.
 * Rejects control characters, spaces, oversized strings, and JWT-shaped strings.
 */
export function resolveSafeRequestId(rawHeader: unknown): string {
  if (typeof rawHeader === 'string') {
    const trimmed = rawHeader.trim();
    if (
      SAFE_REQUEST_ID_REGEX.test(trimmed) &&
      !JWT_LIKE_REGEX.test(trimmed)
    ) {
      return trimmed;
    }
  }
  return crypto.randomUUID();
}

function parseTrustProxySetting(
  explicitOption?: boolean | number | string,
  envVal?: string
): boolean | number | string {
  if (explicitOption !== undefined) {
    return explicitOption;
  }
  if (!envVal || envVal.trim().length === 0) {
    return false;
  }
  const normalized = envVal.trim().toLowerCase();
  if (normalized === 'false' || normalized === '0') {
    return false;
  }
  if (normalized === 'true') {
    return 1; // Trust first hop only rather than arbitrary spoofed chains
  }
  if (/^\d+$/.test(normalized)) {
    return parseInt(normalized, 10);
  }
  return envVal.trim();
}

export function createApp(options?: CreateAppOptions): Express {
  const app = express();

  const trustProxy = parseTrustProxySetting(options?.trustProxy, process.env.TRUST_PROXY);
  app.set('trust proxy', trustProxy);

  const jsonBodyLimit =
    options?.jsonBodyLimit ?? (process.env.JSON_BODY_LIMIT?.trim() || '2mb');
  const archiveBodyLimit =
    options?.archiveBodyLimit ?? (process.env.ARCHIVE_BODY_LIMIT?.trim() || '50mb');

  const rateLimitWindowMs =
    options?.rateLimitWindowMs ??
    (Number(process.env.RATE_LIMIT_WINDOW_MS) > 0
      ? Number(process.env.RATE_LIMIT_WINDOW_MS)
      : 60_000);
  const rateLimitMaxRequests =
    options?.rateLimitMaxRequests ??
    (Number(process.env.RATE_LIMIT_MAX_REQUESTS) > 0
      ? Number(process.env.RATE_LIMIT_MAX_REQUESTS)
      : 300);
  const archiveRateLimitMaxRequests =
    options?.archiveRateLimitMaxRequests ??
    (Number(process.env.RATE_LIMIT_ARCHIVE_MAX_REQUESTS) > 0
      ? Number(process.env.RATE_LIMIT_ARCHIVE_MAX_REQUESTS)
      : 30);

  // Security Headers & Safe Request Correlation ID
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = resolveSafeRequestId(req.headers['x-request-id']);
    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // Public Health Endpoint
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      package: 'P53-STAGE1',
      service: 'Plotify Architecture Intelligence OS API Gateway',
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    });
  });

  // Bounded Single-Instance In-Memory Rate Limiter (Untrusted-Proxy Safe)
  interface RateBucket {
    count: number;
    resetAtMs: number;
  }
  const generalBuckets = new Map<string, RateBucket>();
  const archiveBuckets = new Map<string, RateBucket>();

  function getClientIdentifier(req: Request): string {
    // Only use req.ip when trust proxy is explicitly enabled; otherwise bind to socket remoteAddress
    const socketAddr = req.socket?.remoteAddress || '127.0.0.1';
    const ip = trustProxy ? req.ip || socketAddr : socketAddr;
    return ip;
  }

  function enforceRateLimit(
    buckets: Map<string, RateBucket>,
    maxRequests: number,
    scopePrefix: string
  ) {
    return (req: Request, res: Response, next: NextFunction): void => {
      const now = Date.now();
      if (buckets.size >= MAX_TRACKED_RATE_LIMIT_KEYS) {
        for (const [k, v] of buckets.entries()) {
          if (now >= v.resetAtMs) {
            buckets.delete(k);
          }
        }
        if (buckets.size >= MAX_TRACKED_RATE_LIMIT_KEYS) {
          const oldestKey = buckets.keys().next().value;
          if (oldestKey !== undefined) {
            buckets.delete(oldestKey);
          }
        }
      }

      const key = `${scopePrefix}:${getClientIdentifier(req)}`;
      let bucket = buckets.get(key);
      if (!bucket || now >= bucket.resetAtMs) {
        bucket = { count: 0, resetAtMs: now + rateLimitWindowMs };
        buckets.set(key, bucket);
      }

      bucket.count += 1;
      const remaining = Math.max(0, maxRequests - bucket.count);
      res.setHeader('X-RateLimit-Limit', String(maxRequests));
      res.setHeader('X-RateLimit-Remaining', String(remaining));

      if (bucket.count > maxRequests) {
        const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAtMs - now) / 1000));
        res.setHeader('Retry-After', String(retryAfterSec));
        res.status(429).json({
          error: 'Too Many Requests: Rate limit exceeded. Please try again later.',
          code: 'ERR_RATE_LIMITED',
          requestId: req.requestId,
        });
        return;
      }

      next();
    };
  }

  // Protected API Routes: Rate Limit -> Authenticate -> Authorize Tenant BEFORE body parsing
  const protectedApi = express.Router();
  protectedApi.use(enforceRateLimit(generalBuckets, rateLimitMaxRequests, 'api'));
  protectedApi.use(authenticateUser);
  protectedApi.use(authorizeTenantMembership);

  const standardJsonParser = express.json({ limit: jsonBodyLimit });
  const standardUrlencodedParser = express.urlencoded({ extended: true, limit: jsonBodyLimit });
  const archiveJsonParser = express.json({ limit: archiveBodyLimit });

  // Mount API Sub-routers with endpoint-appropriate body limits
  protectedApi.use(
    '/projects/:id/snapshots',
    standardJsonParser,
    standardUrlencodedParser,
    snapshotsRouter
  );
  protectedApi.use(
    '/projects',
    standardJsonParser,
    standardUrlencodedParser,
    projectsRouter
  );
  protectedApi.use(
    '/archives',
    enforceRateLimit(archiveBuckets, archiveRateLimitMaxRequests, 'archive'),
    archiveJsonParser,
    archivesRouter
  );

  app.use('/api', protectedApi);

  // Global 404 Handler for API routes
  app.all('/api/*', (req: Request, res: Response) => {
    res.status(404).json({
      error: `API route not found: ${req.method} ${req.path}`,
      code: 'ERR_ROUTE_NOT_FOUND',
      requestId: req.requestId,
    });
  });

  // Centralized Error Handler (Zero Sensitive Info Leakage & Explicit 413/400 Handling)
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    console.error(
      `[API Gateway Error] [reqId=${req.requestId || 'unknown'}]:`,
      sanitizeDatabaseErrorMessage(err)
    );

    if (res.headersSent) {
      return next(err);
    }

    if (
      err?.type === 'entity.too.large' ||
      err?.status === 413 ||
      err?.statusCode === 413
    ) {
      res.status(413).json({
        error: 'Payload Too Large: Request body exceeds maximum allowed size.',
        code: 'ERR_PAYLOAD_TOO_LARGE',
        requestId: req.requestId,
      });
      return;
    }

    if (
      err?.type === 'entity.parse.failed' ||
      (err instanceof SyntaxError && (err as any).status === 400)
    ) {
      res.status(400).json({
        error: 'Bad Request: Malformed JSON payload.',
        code: 'ERR_INVALID_JSON',
        requestId: req.requestId,
      });
      return;
    }

    const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500;
    res.status(statusCode).json({
      error: 'An internal server error occurred.',
      code: 'ERR_INTERNAL_SERVER_ERROR',
      requestId: req.requestId,
    });
  });

  return app;
}

export const app = createApp();
