/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { getAppPool, sanitizeDatabaseErrorMessage } from '../db/pool';
import { isValidTenantId, withTenantContext } from '../db/tenantContext';

export interface AuthenticatedUser {
  id: string;
  email?: string;
  roles?: string[];
  organizationId?: string;
}

export interface TenantContext {
  id: string;
  role: string;
}

export interface JwtVerificationOptions {
  issuer?: string;
  audience?: string;
  clockSkewSec?: number;
  requireIssuerAndAudience?: boolean;
}

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      tenant?: TenantContext;
      requestId?: string;
    }
  }
}

export type MembershipChecker = (
  userId: string,
  organizationId: string
) => Promise<string | null>;

/**
 * Default database membership checker querying organization_memberships table.
 * Executes inside withTenantContext so that PostgreSQL FORCE ROW LEVEL SECURITY
 * on organization_memberships evaluates within a transaction-scoped
 * app.current_tenant_id setting on the same client connection, while strictly
 * requiring a matching (user_id, organization_id) membership row.
 */
export async function defaultDbMembershipChecker(
  userId: string,
  organizationId: string,
  pool: Pool = getAppPool()
): Promise<string | null> {
  if (!isValidTenantId(userId) || !isValidTenantId(organizationId)) {
    return null;
  }

  const normalizedUserId = userId.trim();
  const normalizedOrgId = organizationId.trim();

  try {
    return await withTenantContext(pool, normalizedOrgId, async (client) => {
      const res = await client.query<{ role: string }>(
        `SELECT role FROM organization_memberships 
         WHERE user_id = $1 AND organization_id = $2`,
        [normalizedUserId, normalizedOrgId]
      );
      if (res.rows.length === 0) return null;
      const role = res.rows[0]?.role;
      return typeof role === 'string' && role.trim().length > 0 ? role.trim() : null;
    });
  } catch (err) {
    console.error('[Auth] Database membership check error:', sanitizeDatabaseErrorMessage(err));
    return null;
  }
}

// Configurable membership checker (injectable for testing and custom providers)
let activeMembershipChecker: MembershipChecker = defaultDbMembershipChecker;

export function setMembershipChecker(checker: MembershipChecker): void {
  activeMembershipChecker = checker;
}

export function resetMembershipChecker(): void {
  activeMembershipChecker = defaultDbMembershipChecker;
}

export const ALLOWED_JWT_ALGORITHM = 'HS256' as const;
export const MAX_JWT_LIFETIME_SEC = 24 * 60 * 60; // 24 hours maximum token lifetime
export const CLOCK_SKEW_SEC = 300; // 5 minutes permissible clock skew
const BASE64URL_SEGMENT_REGEX = /^[A-Za-z0-9_-]+$/;
const SHA256_DIGEST_BYTES = 32;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isCanonicalBase64UrlSegment(segment: string): boolean {
  if (!segment || !BASE64URL_SEGMENT_REGEX.test(segment)) {
    return false;
  }
  const decoded = Buffer.from(segment, 'base64url');
  return decoded.length > 0 && decoded.toString('base64url') === segment;
}

/**
 * Verifies HMAC-SHA256 (HS256) signed JWT tokens using Node's standard crypto module.
 * Enforces:
 * - Canonical 3-part base64url structure
 * - Explicit header validation (alg === 'HS256', rejecting 'none' and unexpected algorithms)
 * - Length-validated constant-time signature verification via crypto.timingSafeEqual
 * - Mandatory expiration (exp), maximum lifetime bounds, and iat/nbf validity
 * - Configurable issuer (iss) and audience (aud) validation
 * - Mandatory UUID subject (sub) and strict validation of identity/organization claims
 */
export function verifyJwtToken(
  token: string,
  secret: string = process.env.JWT_SECRET || '',
  options?: JwtVerificationOptions
): AuthenticatedUser | null {
  if (!secret || typeof secret !== 'string' || secret.trim().length === 0) {
    return null; // Fail closed if no secret configured
  }
  if (!token || typeof token !== 'string' || /\s/.test(token)) {
    return null;
  }

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, signatureB64] = parts;
  if (
    !isCanonicalBase64UrlSegment(headerB64) ||
    !isCanonicalBase64UrlSegment(payloadB64) ||
    !isCanonicalBase64UrlSegment(signatureB64)
  ) {
    return null;
  }

  // 1. Decode and strictly validate JWT header before trusting token metadata
  let header: unknown;
  try {
    const headerJson = Buffer.from(headerB64, 'base64url').toString('utf8');
    header = JSON.parse(headerJson);
  } catch {
    return null;
  }

  if (!isPlainObject(header)) {
    return null;
  }

  // Strictly enforce HS256; reject 'none', asymmetric algorithms, or missing/non-string alg
  if (header.alg !== ALLOWED_JWT_ALGORITHM) {
    return null;
  }

  // If typ is provided, it must be 'JWT' (case-insensitive per RFC 7519 Section 5.1)
  if (
    header.typ !== undefined &&
    (typeof header.typ !== 'string' || header.typ.toUpperCase() !== 'JWT')
  ) {
    return null;
  }

  // Reject tokens declaring unsupported critical header extensions
  if (header.crit !== undefined) {
    return null;
  }

  // 2. Constant-time cryptographic signature verification (pinned to HMAC-SHA256)
  const providedSigBuf = Buffer.from(signatureB64, 'base64url');
  if (providedSigBuf.length !== SHA256_DIGEST_BYTES) {
    return null;
  }

  const expectedSigBuf = crypto
    .createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest();

  if (
    providedSigBuf.length !== expectedSigBuf.length ||
    !crypto.timingSafeEqual(providedSigBuf, expectedSigBuf)
  ) {
    return null;
  }

  // 3. Decode and validate payload claims
  let payload: unknown;
  try {
    const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf8');
    payload = JSON.parse(payloadJson);
  } catch {
    return null;
  }

  if (!isPlainObject(payload)) {
    return null;
  }

  const clockSkewSec =
    typeof options?.clockSkewSec === 'number' &&
    Number.isFinite(options.clockSkewSec) &&
    options.clockSkewSec >= 0
      ? options.clockSkewSec
      : CLOCK_SKEW_SEC;

  // 3a. Mandatory expiration check (exp claim is strictly required)
  if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp) || payload.exp <= 0) {
    return null;
  }

  const nowMs = Date.now();
  if (nowMs >= payload.exp * 1000) {
    return null; // Expired
  }

  // Reject if expiration extends beyond now + max lifetime + clock skew
  if (payload.exp * 1000 > nowMs + (MAX_JWT_LIFETIME_SEC + clockSkewSec) * 1000) {
    return null;
  }

  // 3b. Issued-at (iat) validation (if present, must be valid and within lifetime bounds)
  if (payload.iat !== undefined) {
    if (typeof payload.iat !== 'number' || !Number.isFinite(payload.iat) || payload.iat <= 0) {
      return null;
    }
    if (payload.iat * 1000 > nowMs + clockSkewSec * 1000) {
      return null; // Issued in the future beyond acceptable clock skew
    }
    if (payload.exp < payload.iat) {
      return null; // exp cannot precede iat
    }
    if (payload.exp - payload.iat > MAX_JWT_LIFETIME_SEC) {
      return null; // Stated validity duration exceeds max lifetime
    }
  }

  // 3c. Not-before (nbf) validation (if present, must be numeric and active within clock skew)
  if (payload.nbf !== undefined) {
    if (typeof payload.nbf !== 'number' || !Number.isFinite(payload.nbf) || payload.nbf <= 0) {
      return null;
    }
    if (nowMs + clockSkewSec * 1000 < payload.nbf * 1000) {
      return null; // Token not yet valid
    }
    if (payload.nbf > payload.exp) {
      return null; // nbf cannot be after exp
    }
  }

  // 3d. Issuer (iss) and Audience (aud) validation
  // Reject invalid empty-string issuer/audience configurations immediately
  if (options?.issuer !== undefined && options.issuer.trim().length === 0) {
    return null;
  }
  if (options?.audience !== undefined && options.audience.trim().length === 0) {
    return null;
  }
  if (process.env.JWT_ISSUER !== undefined && process.env.JWT_ISSUER.length > 0 && process.env.JWT_ISSUER.trim().length === 0) {
    return null;
  }
  if (process.env.JWT_AUDIENCE !== undefined && process.env.JWT_AUDIENCE.length > 0 && process.env.JWT_AUDIENCE.trim().length === 0) {
    return null;
  }

  const configuredIssuer =
    options?.issuer !== undefined
      ? options.issuer.trim()
      : process.env.JWT_ISSUER && process.env.JWT_ISSUER.trim().length > 0
      ? process.env.JWT_ISSUER.trim()
      : undefined;

  const configuredAudience =
    options?.audience !== undefined
      ? options.audience.trim()
      : process.env.JWT_AUDIENCE && process.env.JWT_AUDIENCE.trim().length > 0
      ? process.env.JWT_AUDIENCE.trim()
      : undefined;

  const requireIssAud =
    options?.requireIssuerAndAudience === true ||
    process.env.JWT_REQUIRE_ISS_AUD === 'true';

  if (requireIssAud && (!configuredIssuer || !configuredAudience)) {
    return null; // Strict issuer/audience mode requires both JWT_ISSUER and JWT_AUDIENCE to be configured
  }

  if (payload.iss !== undefined) {
    if (typeof payload.iss !== 'string' || payload.iss.trim().length === 0) {
      return null;
    }
  }
  if (configuredIssuer !== undefined && payload.iss !== configuredIssuer) {
    return null;
  }

  if (payload.aud !== undefined) {
    const validAudString = typeof payload.aud === 'string' && payload.aud.trim().length > 0;
    const validAudArray =
      Array.isArray(payload.aud) &&
      payload.aud.length > 0 &&
      payload.aud.every((item) => typeof item === 'string' && item.trim().length > 0);
    if (!validAudString && !validAudArray) {
      return null;
    }
  }
  if (configuredAudience !== undefined) {
    const audMatches =
      payload.aud === configuredAudience ||
      (Array.isArray(payload.aud) && payload.aud.includes(configuredAudience));
    if (!audMatches) {
      return null;
    }
  }

  // 3f. Subject (sub) identity validation: required and must be a valid RFC 4122 UUID
  if (typeof payload.sub !== 'string' || !isValidTenantId(payload.sub)) {
    return null;
  }

  // 3g. Optional email claim validation
  let normalizedEmail: string | undefined;
  if (payload.email !== undefined) {
    if (typeof payload.email !== 'string' || payload.email.trim().length === 0) {
      return null;
    }
    normalizedEmail = payload.email.trim();
  }

  // 3h. Optional roles claim validation
  let normalizedRoles: string[] = [];
  if (payload.roles !== undefined) {
    if (
      !Array.isArray(payload.roles) ||
      !payload.roles.every((r) => typeof r === 'string' && r.trim().length > 0)
    ) {
      return null;
    }
    normalizedRoles = payload.roles.map((r) => (r as string).trim());
  }

  // 3i. Optional organization/tenant binding claim validation (orgId / organizationId / tenantId)
  const orgClaimCandidates = [
    payload.organizationId,
    payload.orgId,
    payload.tenantId,
  ].filter((v) => v !== undefined);

  let boundOrganizationId: string | undefined;
  if (orgClaimCandidates.length > 0) {
    for (const candidate of orgClaimCandidates) {
      if (typeof candidate !== 'string' || !isValidTenantId(candidate)) {
        return null;
      }
      const trimmed = candidate.trim();
      if (
        boundOrganizationId !== undefined &&
        boundOrganizationId.toLowerCase() !== trimmed.toLowerCase()
      ) {
        return null; // Conflicting organization claims in token
      }
      boundOrganizationId = trimmed;
    }
  }

  const verifiedUser: AuthenticatedUser = {
    id: payload.sub.trim(),
    email: normalizedEmail,
    roles: normalizedRoles,
  };
  if (boundOrganizationId !== undefined) {
    verifiedUser.organizationId = boundOrganizationId;
  }

  return verifiedUser;
}

/**
 * Helper to generate a valid test or session JWT token.
 * Defaults to 1-hour expiration if exp is omitted.
 * Automatically populates iss and aud if JWT_ISSUER / JWT_AUDIENCE are configured
 * and not explicitly overridden in payload.
 */
export function createJwtToken(
  payload: {
    sub: string;
    email?: string;
    roles?: string[];
    exp?: number;
    iat?: number;
    nbf?: number;
    iss?: string;
    aud?: string | string[];
    organizationId?: string;
    orgId?: string;
    tenantId?: string;
  },
  secret: string = process.env.JWT_SECRET || ''
): string {
  if (!secret) throw new Error('JWT_SECRET must be configured to generate tokens.');
  const nowSec = Math.floor(Date.now() / 1000);
  const iat = typeof payload.iat === 'number' ? payload.iat : nowSec;
  const exp = typeof payload.exp === 'number' ? payload.exp : iat + 3600; // Default 1 hour lifetime

  const defaultIss =
    payload.iss === undefined && process.env.JWT_ISSUER && process.env.JWT_ISSUER.trim().length > 0
      ? process.env.JWT_ISSUER.trim()
      : undefined;
  const defaultAud =
    payload.aud === undefined &&
    process.env.JWT_AUDIENCE &&
    process.env.JWT_AUDIENCE.trim().length > 0
      ? process.env.JWT_AUDIENCE.trim()
      : undefined;

  const fullPayload = {
    ...(defaultIss ? { iss: defaultIss } : {}),
    ...(defaultAud ? { aud: defaultAud } : {}),
    ...payload,
    iat,
    exp,
  };

  const header = { alg: ALLOWED_JWT_ALGORITHM, typ: 'JWT' };
  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');

  const signatureB64 = crypto
    .createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');

  return `${headerB64}.${payloadB64}.${signatureB64}`;
}

/**
 * Authentication Middleware:
 * Extracts Bearer token, validates cryptographic signature, and attaches req.user.
 * Rejects unauthenticated requests with HTTP 401.
 */
export function authenticateUser(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Unauthorized: Missing or malformed Authorization header.',
      code: 'ERR_UNAUTHENTICATED',
    });
    return;
  }

  const token = authHeader.slice(7).trim();
  if (!token || /\s/.test(token)) {
    res.status(401).json({
      error: 'Unauthorized: Missing or malformed Authorization header.',
      code: 'ERR_UNAUTHENTICATED',
    });
    return;
  }

  const secret = process.env.JWT_SECRET;

  if (!secret || secret.trim().length === 0) {
    // If no JWT_SECRET is configured, fail closed
    res.status(401).json({
      error: 'Unauthorized: Authentication service is unconfigured or unavailable.',
      code: 'ERR_AUTH_UNCONFIGURED',
    });
    return;
  }

  const verifiedUser = verifyJwtToken(token, secret);
  if (!verifiedUser) {
    res.status(401).json({
      error: 'Unauthorized: Invalid or expired token.',
      code: 'ERR_INVALID_TOKEN',
    });
    return;
  }

  req.user = verifiedUser;
  next();
}

/**
 * Tenant Authorization Middleware:
 * Resolves requested tenant ID, verifies that it is a valid UUID, and verifies
 * that the authenticated user has an active membership in that tenant.
 * Rejects unauthorized tenant access with HTTP 403.
 */
export async function authorizeTenantMembership(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.user || !req.user.id || !isValidTenantId(req.user.id)) {
    res.status(401).json({
      error: 'Unauthorized: Authentication required before tenant authorization.',
      code: 'ERR_UNAUTHENTICATED',
    });
    return;
  }

  // Tenant ID selector from header, query param, or route param
  const requestedTenantId =
    (req.headers['x-tenant-id'] as string) ||
    (req.query.tenantId as string) ||
    (req.params.tenantId as string);

  if (!requestedTenantId) {
    res.status(400).json({
      error: 'Bad Request: Missing required tenant selector (header X-Tenant-ID or query tenantId).',
      code: 'ERR_MISSING_TENANT_ID',
    });
    return;
  }

  if (!isValidTenantId(requestedTenantId)) {
    res.status(400).json({
      error: `Bad Request: Tenant ID "${requestedTenantId}" is not a valid UUID.`,
      code: 'ERR_INVALID_TENANT_UUID',
    });
    return;
  }

  // If the token explicitly binds the session to a specific organization claim, enforce match
  if (
    req.user.organizationId &&
    req.user.organizationId.toLowerCase() !== requestedTenantId.trim().toLowerCase()
  ) {
    res.status(403).json({
      error: `Forbidden: Token organization scope does not match requested organization "${requestedTenantId}".`,
      code: 'ERR_TENANT_MEMBERSHIP_DENIED',
    });
    return;
  }

  try {
    const role = await activeMembershipChecker(req.user.id, requestedTenantId);

    if (!role) {
      res.status(403).json({
        error: `Forbidden: User "${req.user.id}" is not an authorized member of organization "${requestedTenantId}".`,
        code: 'ERR_TENANT_MEMBERSHIP_DENIED',
      });
      return;
    }

    req.tenant = {
      id: requestedTenantId,
      role,
    };
    next();
  } catch (err) {
    console.error('[Auth] Error verifying tenant membership:', sanitizeDatabaseErrorMessage(err));
    res.status(500).json({
      error: 'Internal Server Error: Failed to verify tenant authorization.',
      code: 'ERR_INTERNAL_AUTH_ERROR',
    });
  }
}
