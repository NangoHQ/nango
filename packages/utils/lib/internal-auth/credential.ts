import { readFileSync } from 'node:fs';

import { getLogger } from '../logger.js';

const logger = getLogger('internalAuth');

export type EnvRecord = Record<string, string | undefined>;

const FILE_CREDENTIAL_NON_JWT_TTL_MS = 30_000;
const FILE_CREDENTIAL_EXPIRY_SKEW_MS = 60_000;
const FILE_CREDENTIAL_RETRY_MS = 1_000;

interface FileCredentialCacheEntry {
    token: string;
    refreshAtMs: number;
}

const fileCredentialCache = new Map<string, FileCredentialCacheEntry>();

export function isInternalAuthRequired(env: EnvRecord = process.env): boolean {
    return env['NANGO_INTERNAL_AUTH_REQUIRED']?.toLowerCase() === 'true';
}

function tokenRefreshAtMs(token: string, nowMs: number): number {
    const payloadPart = token.split('.')[1];
    if (payloadPart) {
        try {
            const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')) as { exp?: unknown };
            if (typeof payload.exp === 'number') {
                const expMs = payload.exp * 1000;
                const ttlMs = expMs - nowMs;
                if (ttlMs <= 0) {
                    return nowMs;
                }
                return Math.min(nowMs + ttlMs * 0.8, expMs - FILE_CREDENTIAL_EXPIRY_SKEW_MS);
            }
        } catch {
            // Static file contents are not JWTs; refresh on a short TTL.
        }
    }
    return nowMs + FILE_CREDENTIAL_NON_JWT_TTL_MS;
}

function readFileCredential(filePath: string, nowMs: number): string | null {
    const cached = fileCredentialCache.get(filePath);
    if (cached && nowMs < cached.refreshAtMs) {
        return cached.token;
    }

    try {
        const fromFile = readFileSync(filePath, 'utf8').trim();
        if (fromFile) {
            fileCredentialCache.set(filePath, { token: fromFile, refreshAtMs: tokenRefreshAtMs(fromFile, nowMs) });
            return fromFile;
        }
        fileCredentialCache.delete(filePath);
        return null;
    } catch (err) {
        if (cached) {
            cached.refreshAtMs = nowMs + FILE_CREDENTIAL_RETRY_MS;
            return cached.token;
        }
        logger.warning('Unable to read NANGO_INTERNAL_AUTH_TOKEN_FILE; treating as no credential', { path: filePath, error: err });
        return null;
    }
}

/**
 * Control-plane / register-idle credential. Never throws: a missing or unreadable file is treated
 * as no credential so a default deploy stays a no-op.
 *
 * Projected ServiceAccount tokens are cached and re-read near expiry so routeFetch does not block
 * the event loop on every orchestrator call.
 */
export function getInternalServiceCredential(env: EnvRecord = process.env): string | null {
    const filePath = env['NANGO_INTERNAL_AUTH_TOKEN_FILE']?.trim();
    if (filePath) {
        const fromFile = readFileCredential(filePath, Date.now());
        if (fromFile) {
            return fromFile;
        }
    }

    const token = env['NANGO_INTERNAL_AUTH_TOKEN']?.trim();
    return token || null;
}

export function clearInternalServiceCredentialCache(): void {
    fileCredentialCache.clear();
}

export function getInternalAuthSigningKey(env: EnvRecord = process.env): string | null {
    const key = env['NANGO_INTERNAL_AUTH_SIGNING_KEY']?.trim();
    return key || null;
}

export function getInternalAuthBearerHeader(token: string | null | undefined): Record<string, string> {
    if (!token) {
        return {};
    }
    return { Authorization: `Bearer ${token}` };
}
