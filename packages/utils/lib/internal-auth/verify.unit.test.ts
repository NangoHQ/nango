import { afterEach, describe, expect, it } from 'vitest';

import { INTERNAL_SERVICE_AUDIENCE_JOBS, INTERNAL_SERVICE_AUDIENCE_ORCHESTRATOR } from './constants.js';
import { createInternalServiceToken } from './token.js';
import { clearTokenReviewCache, isInCluster, TOKEN_REVIEW_MAX_IN_FLIGHT, TOKEN_REVIEW_RATE_BURST, verifyInternalServiceCredential } from './verify.js';

const signingEnv = { NANGO_INTERNAL_AUTH_SIGNING_KEY: 'test-signing-key' };
const clusterEnv = { KUBERNETES_SERVICE_HOST: '10.0.0.1', KUBERNETES_SERVICE_PORT: '443' };
const readSaFiles = ((path: string) => {
    if (String(path).endsWith('token')) return 'sa-token';
    return '-----BEGIN CERTIFICATE-----\nca\n-----END CERTIFICATE-----';
}) as never;

afterEach(() => {
    clearTokenReviewCache();
});

function rs256Jwt(sig = 'sig'): string {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
    return `${header}.${payload}.${sig}`;
}

type FetchCalls = { count: number; signal?: AbortSignal };

function unauthenticatedFetch(calls: FetchCalls) {
    return ((_url: unknown, init?: { signal?: AbortSignal }) => {
        calls.count += 1;
        if (init?.signal) {
            calls.signal = init.signal;
        }
        return Promise.resolve(
            new Response(JSON.stringify({ status: { authenticated: false } }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            })
        );
    }) as never;
}

function authenticatedFetch(audience: string) {
    return (() =>
        Promise.resolve(
            new Response(
                JSON.stringify({
                    status: {
                        authenticated: true,
                        user: { username: 'system:serviceaccount:nango:jobs' },
                        audiences: [audience]
                    }
                }),
                {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                }
            )
        )) as never;
}

describe('verifyInternalServiceCredential', () => {
    it('accepts a static token', async () => {
        const auth = await verifyInternalServiceCredential('shared-secret', INTERNAL_SERVICE_AUDIENCE_ORCHESTRATOR, {
            env: { NANGO_INTERNAL_AUTH_TOKEN: 'shared-secret' }
        });
        expect(auth).toEqual({ kind: 'static', subject: 'static', audience: INTERNAL_SERVICE_AUDIENCE_ORCHESTRATOR });
    });

    it('rejects a mismatched static token', async () => {
        const auth = await verifyInternalServiceCredential('wrong', INTERNAL_SERVICE_AUDIENCE_ORCHESTRATOR, {
            env: { NANGO_INTERNAL_AUTH_TOKEN: 'shared-secret' }
        });
        expect(auth).toBeNull();
    });

    it('accepts an HMAC task JWT', async () => {
        const token = createInternalServiceToken({ taskId: 'task-1', expiresInSecs: 120 }, signingEnv);
        expect(token).toEqual(expect.any(String));
        if (!token) {
            return;
        }
        const auth = await verifyInternalServiceCredential(token, INTERNAL_SERVICE_AUDIENCE_JOBS, { env: signingEnv });
        expect(auth?.kind).toBe('hmac');
        expect(auth?.taskId).toBe('task-1');
    });

    it('falls through from a JWT to static compare when TokenReview is not configured', async () => {
        const jwtShaped = 'aaa.bbb.ccc';
        const auth = await verifyInternalServiceCredential(jwtShaped, INTERNAL_SERVICE_AUDIENCE_ORCHESTRATOR, {
            env: { NANGO_INTERNAL_AUTH_TOKEN: jwtShaped }
        });
        expect(auth?.kind).toBe('static');
    });

    it('accepts a Kubernetes TokenReview for an in-cluster JWT', async () => {
        const token = rs256Jwt();
        const auth = await verifyInternalServiceCredential(token, INTERNAL_SERVICE_AUDIENCE_JOBS, {
            env: clusterEnv,
            fetch: authenticatedFetch(INTERNAL_SERVICE_AUDIENCE_JOBS),
            readFileSync: readSaFiles
        });
        expect(auth).toEqual({
            kind: 'kubernetes',
            subject: 'system:serviceaccount:nango:jobs',
            audience: INTERNAL_SERVICE_AUDIENCE_JOBS
        });
    });

    it('rejects an unauthenticated TokenReview', async () => {
        const token = rs256Jwt();
        const calls = { count: 0 };
        const auth = await verifyInternalServiceCredential(token, INTERNAL_SERVICE_AUDIENCE_ORCHESTRATOR, {
            env: clusterEnv,
            fetch: unauthenticatedFetch(calls),
            readFileSync: readSaFiles
        });
        expect(auth).toBeNull();
        expect(calls.count).toBe(1);
    });

    it('rejects an authenticated TokenReview whose audiences do not include the requested audience', async () => {
        const token = rs256Jwt();
        const auth = await verifyInternalServiceCredential(token, INTERNAL_SERVICE_AUDIENCE_ORCHESTRATOR, {
            env: clusterEnv,
            fetch: authenticatedFetch(INTERNAL_SERVICE_AUDIENCE_JOBS),
            readFileSync: readSaFiles
        });
        expect(auth).toBeNull();
    });

    it('does not TokenReview nango-internal HMAC JWTs that fail local verification', async () => {
        const calls = { count: 0 };
        const token = createInternalServiceToken({ taskId: 'task-1', expiresInSecs: -1 }, signingEnv);
        expect(token).toEqual(expect.any(String));
        if (!token) {
            return;
        }
        const auth = await verifyInternalServiceCredential(token, INTERNAL_SERVICE_AUDIENCE_JOBS, {
            env: { ...clusterEnv, ...signingEnv },
            fetch: unauthenticatedFetch(calls),
            readFileSync: readSaFiles
        });
        expect(auth).toBeNull();
        expect(calls.count).toBe(0);
    });

    it('negatively caches a failed TokenReview so the same token does not call Kubernetes again', async () => {
        const token = rs256Jwt();
        const calls = { count: 0 };
        const deps = { env: clusterEnv, fetch: unauthenticatedFetch(calls), readFileSync: readSaFiles };
        await verifyInternalServiceCredential(token, INTERNAL_SERVICE_AUDIENCE_ORCHESTRATOR, deps);
        await verifyInternalServiceCredential(token, INTERNAL_SERVICE_AUDIENCE_ORCHESTRATOR, deps);
        expect(calls.count).toBe(1);
    });

    it('reuses an in-flight TokenReview for the same token', async () => {
        const token = rs256Jwt();
        const calls: FetchCalls = { count: 0 };
        const fetch = ((_url: unknown, init?: { signal?: AbortSignal }) => {
            calls.count += 1;
            if (init?.signal) {
                calls.signal = init.signal;
            }
            return new Promise<Response>((resolve) => {
                setTimeout(() => {
                    resolve(
                        new Response(JSON.stringify({ status: { authenticated: false } }), {
                            status: 200,
                            headers: { 'Content-Type': 'application/json' }
                        })
                    );
                }, 30);
            });
        }) as never;
        const deps = { env: clusterEnv, fetch, readFileSync: readSaFiles };
        const [first, second] = await Promise.all([
            verifyInternalServiceCredential(token, INTERNAL_SERVICE_AUDIENCE_ORCHESTRATOR, deps),
            verifyInternalServiceCredential(token, INTERNAL_SERVICE_AUDIENCE_ORCHESTRATOR, deps)
        ]);
        expect(first).toBeNull();
        expect(second).toBeNull();
        expect(calls.count).toBe(1);
        expect(calls.signal).toBeInstanceOf(AbortSignal);
    });

    it('caps concurrent TokenReview calls for unique tokens', async () => {
        const calls = { count: 0 };
        const fetch = () => {
            calls.count += 1;
            return new Promise<Response>((resolve) => {
                setTimeout(() => {
                    resolve(
                        new Response(JSON.stringify({ status: { authenticated: false } }), {
                            status: 200,
                            headers: { 'Content-Type': 'application/json' }
                        })
                    );
                }, 30);
            });
        };
        const deps = { env: clusterEnv, fetch: fetch as never, readFileSync: readSaFiles };
        const uniqueCount = TOKEN_REVIEW_MAX_IN_FLIGHT + 12;
        await Promise.all(
            Array.from({ length: uniqueCount }, (_, i) => verifyInternalServiceCredential(rs256Jwt(`sig-${i}`), INTERNAL_SERVICE_AUDIENCE_ORCHESTRATOR, deps))
        );
        expect(calls.count).toBe(TOKEN_REVIEW_MAX_IN_FLIGHT);
    });

    it('rate-limits sequential unique TokenReview tokens', async () => {
        const calls = { count: 0 };
        const deps = { env: clusterEnv, fetch: unauthenticatedFetch(calls), readFileSync: readSaFiles };
        const uniqueCount = TOKEN_REVIEW_RATE_BURST + 10;
        for (let i = 0; i < uniqueCount; i++) {
            await verifyInternalServiceCredential(rs256Jwt(`seq-${i}`), INTERNAL_SERVICE_AUDIENCE_ORCHESTRATOR, deps);
        }
        expect(calls.count).toBe(TOKEN_REVIEW_RATE_BURST);
    });

    it('passes an abort signal so TokenReview cannot hang the request', async () => {
        const token = rs256Jwt();
        const calls: FetchCalls = { count: 0 };
        await verifyInternalServiceCredential(token, INTERNAL_SERVICE_AUDIENCE_ORCHESTRATOR, {
            env: clusterEnv,
            fetch: unauthenticatedFetch(calls),
            readFileSync: readSaFiles
        });
        expect(calls.signal).toBeInstanceOf(AbortSignal);
    });
});

describe('isInCluster', () => {
    it('is false without KUBERNETES_SERVICE_HOST', () => {
        expect(isInCluster({})).toBe(false);
    });
});
