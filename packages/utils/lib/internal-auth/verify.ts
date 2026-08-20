import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { Agent, fetch as undiciFetch } from 'undici';

import { getLogger } from '../logger.js';
import { once } from '../once.js';
import { stringTimingSafeEqual } from '../string.js';
import { INTERNAL_SERVICE_TOKEN_ISSUER } from './constants.js';
import { getInternalServiceCredential } from './credential.js';
import { isJwtShape, verifyInternalServiceToken } from './token.js';

import type { InternalServiceAuth } from './constants.js';
import type { EnvRecord } from './credential.js';

const logger = getLogger('internalAuth');

const SA_TOKEN_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/token';
const SA_CA_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt';
const TOKEN_REVIEW_SKEW_SECS = 60;
const TOKEN_REVIEW_TIMEOUT_MS = 10_000;
const TOKEN_REVIEW_CONNECT_TIMEOUT_MS = 5_000;
const TOKEN_REVIEW_NEGATIVE_TTL_MS = 30_000;
const TOKEN_REVIEW_POSITIVE_FALLBACK_TTL_MS = 5 * 60 * 1000;
const TOKEN_REVIEW_CACHE_MAX_ENTRIES = 1024;
const TOKEN_REVIEW_REFILL_PER_SEC = 16;

/** Concurrent TokenReview calls to the Kubernetes API. Unique JWTs otherwise occupy one in-flight slot each. */
export const TOKEN_REVIEW_MAX_IN_FLIGHT = 8;
/** Burst of TokenReview calls allowed per process before further JWTs are treated as unauthenticated. */
export const TOKEN_REVIEW_RATE_BURST = 32;

type FetchLike = typeof undiciFetch;

export interface VerifyInternalServiceCredentialDeps {
    env?: EnvRecord;
    fetch?: FetchLike;
    readFileSync?: typeof readFileSync;
}

interface TokenReviewCacheEntry {
    auth: InternalServiceAuth | null;
    expiresAtMs: number;
}

const tokenReviewCache = new Map<string, TokenReviewCacheEntry>();
const tokenReviewInFlight = new Map<string, Promise<InternalServiceAuth | null>>();
let tokenReviewInFlightCount = 0;
let tokenReviewPermits = TOKEN_REVIEW_RATE_BURST;
let tokenReviewLastRefillMs = 0;

const warnTokenReviewLimited = once(() => {
    logger.warning('TokenReview rate limit reached; treating excess JWT credentials as unauthenticated');
});

// Cluster CA is process-lifetime; a per-request Agent would leak sockets.
let tokenReviewAgent: Agent | undefined;
let tokenReviewAgentCa: string | undefined;

function getTokenReviewAgent(ca: string): Agent {
    if (tokenReviewAgent && tokenReviewAgentCa === ca) {
        return tokenReviewAgent;
    }
    const previous = tokenReviewAgent;
    tokenReviewAgent = new Agent({
        connectTimeout: TOKEN_REVIEW_CONNECT_TIMEOUT_MS,
        headersTimeout: TOKEN_REVIEW_TIMEOUT_MS,
        bodyTimeout: TOKEN_REVIEW_TIMEOUT_MS,
        connect: { ca, timeout: TOKEN_REVIEW_CONNECT_TIMEOUT_MS }
    });
    tokenReviewAgentCa = ca;
    if (previous) {
        void previous.close();
    }
    return tokenReviewAgent;
}

export function isInCluster(env: EnvRecord = process.env): boolean {
    return Boolean(env['KUBERNETES_SERVICE_HOST']);
}

function tokenReviewCacheKey(token: string, audience: string): string {
    return `${createHash('sha256').update(token).digest('hex')}:${audience}`;
}

function cacheGet(key: string): TokenReviewCacheEntry | undefined {
    const entry = tokenReviewCache.get(key);
    if (!entry) {
        return undefined;
    }
    tokenReviewCache.delete(key);
    tokenReviewCache.set(key, entry);
    return entry;
}

function cacheSet(key: string, entry: TokenReviewCacheEntry): void {
    if (tokenReviewCache.has(key)) {
        tokenReviewCache.delete(key);
    } else {
        while (tokenReviewCache.size >= TOKEN_REVIEW_CACHE_MAX_ENTRIES) {
            const oldest = tokenReviewCache.keys().next().value;
            if (oldest === undefined) {
                break;
            }
            tokenReviewCache.delete(oldest);
        }
    }
    tokenReviewCache.set(key, entry);
}

function getCachedTokenReview(key: string, nowMs: number): InternalServiceAuth | null | undefined {
    const cached = cacheGet(key);
    if (!cached) {
        return undefined;
    }
    if (cached.auth) {
        if (cached.expiresAtMs <= nowMs + TOKEN_REVIEW_SKEW_SECS * 1000) {
            tokenReviewCache.delete(key);
            return undefined;
        }
        return cached.auth;
    }
    if (cached.expiresAtMs <= nowMs) {
        tokenReviewCache.delete(key);
        return undefined;
    }
    return null;
}

function takeTokenReviewPermit(nowMs: number): boolean {
    if (tokenReviewLastRefillMs === 0) {
        tokenReviewLastRefillMs = nowMs;
        tokenReviewPermits = TOKEN_REVIEW_RATE_BURST;
    }
    const elapsedSecs = (nowMs - tokenReviewLastRefillMs) / 1000;
    tokenReviewPermits = Math.min(TOKEN_REVIEW_RATE_BURST, tokenReviewPermits + elapsedSecs * TOKEN_REVIEW_REFILL_PER_SEC);
    tokenReviewLastRefillMs = nowMs;
    if (tokenReviewPermits < 1) {
        return false;
    }
    tokenReviewPermits -= 1;
    return true;
}

function jwtExpiryMs(token: string): number | null {
    const parts = token.split('.');
    if (parts.length !== 3 || !parts[1]) {
        return null;
    }
    try {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { exp?: unknown };
        if (typeof payload.exp !== 'number') {
            return null;
        }
        return payload.exp * 1000;
    } catch {
        return null;
    }
}

function isNangoInternalJwt(token: string): boolean {
    const payloadPart = token.split('.')[1];
    if (!payloadPart) {
        return false;
    }
    try {
        const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')) as { iss?: unknown };
        return payload.iss === INTERNAL_SERVICE_TOKEN_ISSUER;
    } catch {
        return false;
    }
}

async function performTokenReview(
    token: string,
    audience: string,
    cacheKey: string,
    deps: VerifyInternalServiceCredentialDeps,
    env: EnvRecord
): Promise<InternalServiceAuth | null> {
    const readFile = deps.readFileSync ?? readFileSync;
    let saToken: string;
    let ca: string;
    try {
        saToken = readFile(SA_TOKEN_PATH, 'utf8').trim();
        ca = readFile(SA_CA_PATH, 'utf8');
    } catch (err) {
        logger.warning('Kubernetes service account files unreadable; skipping TokenReview', { error: err });
        return null;
    }

    const host = env['KUBERNETES_SERVICE_HOST'];
    const port = env['KUBERNETES_SERVICE_PORT'] || '443';
    const url = `https://${host}:${port}/apis/authentication.k8s.io/v1/tokenreviews`;

    try {
        const fetchFn = deps.fetch ?? undiciFetch;
        const init: Parameters<FetchLike>[1] = {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${saToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                apiVersion: 'authentication.k8s.io/v1',
                kind: 'TokenReview',
                spec: { token, audiences: [audience] }
            }),
            signal: AbortSignal.timeout(TOKEN_REVIEW_TIMEOUT_MS)
        };
        if (!deps.fetch) {
            init.dispatcher = getTokenReviewAgent(ca);
        }
        const res = await fetchFn(url, init);
        if (!res.ok) {
            logger.warning('TokenReview request failed', { status: res.status });
            return null;
        }
        const body = (await res.json()) as {
            status?: { authenticated?: boolean; user?: { username?: string }; audiences?: string[] };
        };
        if (!body.status?.authenticated || !body.status.audiences?.includes(audience)) {
            cacheSet(cacheKey, { auth: null, expiresAtMs: Date.now() + TOKEN_REVIEW_NEGATIVE_TTL_MS });
            return null;
        }
        const auth: InternalServiceAuth = {
            kind: 'kubernetes',
            subject: body.status.user?.username || 'kubernetes',
            audience
        };
        const expiresAtMs = jwtExpiryMs(token) ?? Date.now() + TOKEN_REVIEW_POSITIVE_FALLBACK_TTL_MS;
        cacheSet(cacheKey, { auth, expiresAtMs });
        return auth;
    } catch (err) {
        logger.warning('TokenReview threw; treating as unauthenticated', { error: err });
        return null;
    }
}

/**
 * TokenReview is a cluster-wide API. Unique three-segment Bearers would otherwise force one call
 * per request (failed reviews are not reusable). Bound the cache, negatively cache definitive
 * rejects, cap concurrency/rate, and abort the HTTP call if the API is slow.
 */
async function tokenReview(token: string, audience: string, deps: VerifyInternalServiceCredentialDeps): Promise<InternalServiceAuth | null> {
    const env = deps.env ?? process.env;
    if (!isInCluster(env)) {
        return null;
    }

    const key = tokenReviewCacheKey(token, audience);
    const nowMs = Date.now();
    const cached = getCachedTokenReview(key, nowMs);
    if (cached !== undefined) {
        return cached;
    }

    const pending = tokenReviewInFlight.get(key);
    if (pending) {
        return pending;
    }

    if (tokenReviewInFlightCount >= TOKEN_REVIEW_MAX_IN_FLIGHT || !takeTokenReviewPermit(nowMs)) {
        warnTokenReviewLimited();
        return null;
    }

    tokenReviewInFlightCount += 1;
    const review = performTokenReview(token, audience, key, deps, env).finally(() => {
        tokenReviewInFlightCount -= 1;
        tokenReviewInFlight.delete(key);
    });
    tokenReviewInFlight.set(key, review);
    return review;
}

export async function verifyInternalServiceCredential(
    token: string,
    audience: string,
    deps: VerifyInternalServiceCredentialDeps = {}
): Promise<InternalServiceAuth | null> {
    const env = deps.env ?? process.env;

    if (isJwtShape(token)) {
        const hmac = verifyInternalServiceToken(token, audience, env);
        if (hmac) {
            return hmac;
        }
        if (!isNangoInternalJwt(token)) {
            const reviewed = await tokenReview(token, audience, { ...deps, env });
            if (reviewed) {
                return reviewed;
            }
        }
    }

    const expected = getInternalServiceCredential(env);
    if (expected && stringTimingSafeEqual(token, expected)) {
        return { kind: 'static', subject: 'static', audience };
    }

    return null;
}

export function clearTokenReviewCache(): void {
    tokenReviewCache.clear();
    tokenReviewInFlight.clear();
    tokenReviewInFlightCount = 0;
    tokenReviewPermits = TOKEN_REVIEW_RATE_BURST;
    tokenReviewLastRefillMs = 0;
    if (tokenReviewAgent) {
        void tokenReviewAgent.close();
        tokenReviewAgent = undefined;
        tokenReviewAgentCa = undefined;
    }
}
