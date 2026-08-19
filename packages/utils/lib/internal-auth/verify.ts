import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { Agent, fetch as undiciFetch } from 'undici';

import { getLogger } from '../logger.js';
import { stringTimingSafeEqual } from '../string.js';
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

type FetchLike = typeof undiciFetch;

export interface VerifyInternalServiceCredentialDeps {
    env?: EnvRecord;
    fetch?: FetchLike;
    readFileSync?: typeof readFileSync;
}

interface TokenReviewCacheEntry {
    auth: InternalServiceAuth;
    expiresAtMs: number;
}

const tokenReviewCache = new Map<string, TokenReviewCacheEntry>();

export function isInCluster(env: EnvRecord = process.env): boolean {
    return Boolean(env['KUBERNETES_SERVICE_HOST']);
}

function tokenReviewCacheKey(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}

function evictExpiredTokenReviewCache(nowMs: number): void {
    for (const [key, entry] of tokenReviewCache) {
        if (entry.expiresAtMs <= nowMs) {
            tokenReviewCache.delete(key);
        }
    }
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

async function tokenReview(token: string, audience: string, deps: VerifyInternalServiceCredentialDeps): Promise<InternalServiceAuth | null> {
    const env = deps.env ?? process.env;
    if (!isInCluster(env)) {
        return null;
    }

    const nowMs = Date.now();
    evictExpiredTokenReviewCache(nowMs);
    const cached = tokenReviewCache.get(tokenReviewCacheKey(token));
    if (cached && cached.expiresAtMs > nowMs + TOKEN_REVIEW_SKEW_SECS * 1000 && cached.auth.audience === audience) {
        return cached.auth;
    }

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
            init.dispatcher = new Agent({
                connectTimeout: TOKEN_REVIEW_CONNECT_TIMEOUT_MS,
                headersTimeout: TOKEN_REVIEW_TIMEOUT_MS,
                bodyTimeout: TOKEN_REVIEW_TIMEOUT_MS,
                connect: { ca, timeout: TOKEN_REVIEW_CONNECT_TIMEOUT_MS }
            });
        }
        const res = await fetchFn(url, init);
        if (!res.ok) {
            logger.warning('TokenReview request failed', { status: res.status });
            return null;
        }
        const body = (await res.json()) as {
            status?: { authenticated?: boolean; user?: { username?: string }; audiences?: string[] };
        };
        if (!body.status?.authenticated) {
            return null;
        }
        if (!body.status.audiences?.includes(audience)) {
            return null;
        }
        const auth: InternalServiceAuth = {
            kind: 'kubernetes',
            subject: body.status.user?.username || 'kubernetes',
            audience
        };
        const expiresAtMs = jwtExpiryMs(token) ?? Date.now() + 5 * 60 * 1000;
        tokenReviewCache.set(tokenReviewCacheKey(token), { auth, expiresAtMs });
        return auth;
    } catch (err) {
        logger.warning('TokenReview threw; treating as unauthenticated', { error: err });
        return null;
    }
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
        const reviewed = await tokenReview(token, audience, { ...deps, env });
        if (reviewed) {
            return reviewed;
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
}
