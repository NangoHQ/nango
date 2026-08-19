import { describe, expect, it } from 'vitest';

import { INTERNAL_SERVICE_AUDIENCE_JOBS, INTERNAL_SERVICE_AUDIENCE_ORCHESTRATOR } from './constants.js';
import { createInternalServiceToken } from './token.js';
import { clearTokenReviewCache, isInCluster, verifyInternalServiceCredential } from './verify.js';

const signingEnv = { NANGO_INTERNAL_AUTH_SIGNING_KEY: 'test-signing-key' };

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
        const auth = await verifyInternalServiceCredential(token!, INTERNAL_SERVICE_AUDIENCE_JOBS, { env: signingEnv });
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
        clearTokenReviewCache();
        const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
        const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
        const token = `${header}.${payload}.sig`;

        const fetch = () =>
            Promise.resolve(
                new Response(
                    JSON.stringify({
                        status: {
                            authenticated: true,
                            user: { username: 'system:serviceaccount:nango:jobs' },
                            audiences: [INTERNAL_SERVICE_AUDIENCE_JOBS]
                        }
                    }),
                    {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' }
                    }
                )
            );

        const auth = await verifyInternalServiceCredential(token, INTERNAL_SERVICE_AUDIENCE_JOBS, {
            env: { KUBERNETES_SERVICE_HOST: '10.0.0.1', KUBERNETES_SERVICE_PORT: '443' },
            fetch: fetch as never,
            readFileSync: ((path: string) => {
                if (String(path).endsWith('token')) return 'sa-token';
                return '-----BEGIN CERTIFICATE-----\nca\n-----END CERTIFICATE-----';
            }) as never
        });
        expect(auth).toEqual({
            kind: 'kubernetes',
            subject: 'system:serviceaccount:nango:jobs',
            audience: INTERNAL_SERVICE_AUDIENCE_JOBS
        });
    });

    it('rejects an unauthenticated TokenReview', async () => {
        clearTokenReviewCache();
        const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url');
        const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
        const token = `${header}.${payload}.sig`;

        const fetch = () =>
            Promise.resolve(
                new Response(JSON.stringify({ status: { authenticated: false } }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                })
            );

        const auth = await verifyInternalServiceCredential(token, INTERNAL_SERVICE_AUDIENCE_ORCHESTRATOR, {
            env: { KUBERNETES_SERVICE_HOST: '10.0.0.1' },
            fetch: fetch as never,
            readFileSync: (() => 'x') as never
        });
        expect(auth).toBeNull();
    });

    it('rejects an authenticated TokenReview whose audiences do not include the requested audience', async () => {
        clearTokenReviewCache();
        const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url');
        const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
        const token = `${header}.${payload}.sig`;

        const fetch = () =>
            Promise.resolve(
                new Response(
                    JSON.stringify({
                        status: {
                            authenticated: true,
                            user: { username: 'system:serviceaccount:nango:jobs' },
                            audiences: [INTERNAL_SERVICE_AUDIENCE_JOBS]
                        }
                    }),
                    {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' }
                    }
                )
            );

        const auth = await verifyInternalServiceCredential(token, INTERNAL_SERVICE_AUDIENCE_ORCHESTRATOR, {
            env: { KUBERNETES_SERVICE_HOST: '10.0.0.1' },
            fetch: fetch as never,
            readFileSync: (() => 'x') as never
        });
        expect(auth).toBeNull();
    });
});

describe('isInCluster', () => {
    it('is false without KUBERNETES_SERVICE_HOST', () => {
        expect(isInCluster({})).toBe(false);
    });
});
