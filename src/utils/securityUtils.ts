/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Deterministic hash/checksum generator using 32-bit FNV-1a with hex encoding.
 * Operates synchronously and reliably in all browser and Node/testing environments.
 */
export function computeStringChecksum(str: string): string {
  let hval = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hval ^= str.charCodeAt(i);
    hval += (hval << 1) + (hval << 4) + (hval << 7) + (hval << 8) + (hval << 24);
  }
  return (hval >>> 0).toString(16).padStart(8, '0');
}

/**
 * Validates untrusted input strings:
 * - Trims whitespace
 * - Strips dangerous HTML tags or script injection sequences
 * - Enforces length boundaries to prevent memory/UI DOS
 */
export function sanitizeText(input: unknown, maxLength = 500, fallback = ''): string {
  if (typeof input !== 'string') return fallback;
  const stripped = input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/[<>]/g, '')
    .trim();
  return stripped.slice(0, maxLength);
}

/**
 * Sanitizes numeric input with finite and bounds checks.
 */
export function sanitizeNumber(input: unknown, min = 0, max = 100000000, fallback = 0): number {
  if (typeof input !== 'number' || isNaN(input) || !isFinite(input)) {
    return fallback;
  }
  return Math.min(Math.max(input, min), max);
}

/**
 * Deeply validates an object to prevent prototype pollution attacks (__proto__, constructor, prototype).
 */
export function sanitizeUntrustedObject<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeUntrustedObject) as unknown as T;
  }

  const cleanObj: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      console.warn(`[SecurityGuard] Blocked potentially malicious property: "${key}"`);
      continue;
    }
    cleanObj[key] = sanitizeUntrustedObject(value);
  }

  return cleanObj as T;
}

/**
 * Safe JSON parser with prototype pollution protection and fallback handling.
 */
export function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw || typeof raw !== 'string') {
    return fallback;
  }
  try {
    const parsed = JSON.parse(raw);
    return sanitizeUntrustedObject(parsed);
  } catch (error) {
    console.warn('[SecurityGuard] JSON parse error handled safely:', error);
    return fallback;
  }
}
