import { generateKeyPairSync } from 'node:crypto';

import express from 'express';
import { describe, expect, it } from 'vitest';

import { verifyInternalServiceCredential } from '../authenticate.js';
import { keyRegistryFromPublicKeys } from '../core/registry.js';
import { createRunnerDispatchToken, exportRunnerPublicKey } from '../legacy/ed25519.js';
import { createInternalServiceToken } from '../legacy/token.js';
import { mint } from '../nango/mint.js';
import {
    INTERNAL_SERVICE_AUDIENCE_JOBS,
    INTERNAL_SERVICE_AUDIENCE_RUNNER,
    INTERNAL_SERVICE_ISSUER_JOBS,
    INTERNAL_SERVICE_ISSUER_SERVER,
    nodeSubject,
    taskSubject
} from '../nango/principals.js';
import { taskScopesForScriptType } from '../nango/scopes.js';
import { internalServiceAuthMiddleware } from './middleware.js';
import { isNodeBoundAuth, requireBinding, routeParam } from './requires.js';

import type { InternalServiceCredentials } from '../authenticate.js';
import type { InternalAuthEnvs } from '../nango/env.js';
import type { InternalServiceAuth } from '../nango/principals.js';

const TASK_ID = '11111111-1111-4111-8111-111111111111';

function ed25519Material(): { pem: string; raw: string } {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const pem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
    const raw = Buffer.from(publicKey.export({ format: 'der', type: 'spki' }))
        .subarray(12)
        .toString('base64url');
    return { pem, raw };
}

function envsFor(raw: string): InternalAuthEnvs {
    return {
        NANGO_INTERNAL_AUTH_REQUIRED: true,
        NANGO_INTERNAL_AUTH_JOBS_PUBLIC_KEYS: [{ kid: 'jobs-2026-09', publicKey: raw }],
        NANGO_INTERNAL_AUTH_SIGNING_KEY: 'sign'
    };
}

async function listen(server: ReturnType<typeof express>) {
    return await new Promise<{ url: string; close: () => Promise<void> }>((resolve) => {
        const httpServer = server.listen(0, '127.0.0.1', () => {
            const address = httpServer.address();
            const port = typeof address === 'object' && address ? address.port : 0;
            resolve({
                url: `http://127.0.0.1:${port}`,
                close: () =>
                    new Promise((done) => {
                        httpServer.close(() => done());
                    })
            });
        });
    });
}

describe('requireBinding', () => {
    it('accepts a jobs task JWT and an HMAC task token on the matching task id', async () => {
        const { pem, raw } = ed25519Material();
        const envs = envsFor(raw);
        const server = express();
        server.use(internalServiceAuthMiddleware({ audience: INTERNAL_SERVICE_AUDIENCE_JOBS, envs }));
        server.put(
            '/tasks/:taskId',
            requireBinding(envs, 'taskId', (req) => routeParam(req, 'taskId')),
            (_req, res) => {
                res.status(204).end();
            }
        );
        const jwt = await mint(
            { iss: INTERNAL_SERVICE_ISSUER_JOBS, kid: 'jobs-2026-09', privateKey: pem },
            {
                sub: taskSubject(TASK_ID),
                aud: INTERNAL_SERVICE_AUDIENCE_JOBS,
                ttlSecs: 60,
                res: { environmentId: 4, connectionId: 9 },
                scopes: taskScopesForScriptType('action')
            }
        );
        const hmac = createInternalServiceToken({ taskId: TASK_ID, expiresInSecs: 60 }, envs.NANGO_INTERNAL_AUTH_SIGNING_KEY);
        const { url, close } = await listen(server);
        try {
            const jwtRes = await fetch(`${url}/tasks/${TASK_ID}`, { method: 'PUT', headers: { Authorization: `Bearer ${jwt}` } });
            const hmacRes = await fetch(`${url}/tasks/${TASK_ID}`, { method: 'PUT', headers: { Authorization: `Bearer ${hmac}` } });
            expect(jwtRes.status).toBe(204);
            expect(hmacRes.status).toBe(204);
        } finally {
            await close();
        }
    });

    it('rejects a node token on a task route', async () => {
        const { pem, raw } = ed25519Material();
        const envs = envsFor(raw);
        const server = express();
        server.use(internalServiceAuthMiddleware({ audience: INTERNAL_SERVICE_AUDIENCE_JOBS, envs }));
        server.put(
            '/tasks/:taskId',
            requireBinding(envs, 'taskId', (req) => routeParam(req, 'taskId')),
            (_req, res) => {
                res.status(204).end();
            }
        );
        const token = await mint(
            { iss: INTERNAL_SERVICE_ISSUER_JOBS, kid: 'jobs-2026-09', privateKey: pem },
            { sub: nodeSubject('1'), aud: INTERNAL_SERVICE_AUDIENCE_JOBS, ttlSecs: 60 }
        );
        const { url, close } = await listen(server);
        try {
            const res = await fetch(`${url}/tasks/${TASK_ID}`, { method: 'PUT', headers: { Authorization: `Bearer ${token}` } });
            expect(res.status).toBe(401);
        } finally {
            await close();
        }
    });

    it('rejects a capability token for a different environment', async () => {
        const { pem, raw } = ed25519Material();
        const envs = envsFor(raw);
        const server = express();
        server.use(internalServiceAuthMiddleware({ audience: INTERNAL_SERVICE_AUDIENCE_JOBS, envs }));
        server.get(
            '/environment/:environmentId',
            requireBinding(envs, 'environmentId', (req) => routeParam(req, 'environmentId')),
            (_req, res) => {
                res.status(204).end();
            }
        );
        const jwt = await mint(
            { iss: INTERNAL_SERVICE_ISSUER_JOBS, kid: 'jobs-2026-09', privateKey: pem },
            {
                sub: taskSubject(TASK_ID),
                aud: INTERNAL_SERVICE_AUDIENCE_JOBS,
                ttlSecs: 60,
                res: { environmentId: 4, connectionId: 9 },
                scopes: taskScopesForScriptType('action')
            }
        );
        const { url, close } = await listen(server);
        try {
            const mismatch = await fetch(`${url}/environment/9`, { headers: { Authorization: `Bearer ${jwt}` } });
            const match = await fetch(`${url}/environment/4`, { headers: { Authorization: `Bearer ${jwt}` } });
            expect(mismatch.status).toBe(401);
            expect(match.status).toBe(204);
        } finally {
            await close();
        }
    });

    it('does not treat res on a node JWT as an environment binding', async () => {
        const { pem, raw } = ed25519Material();
        const envs = envsFor(raw);
        const server = express();
        server.use(internalServiceAuthMiddleware({ audience: INTERNAL_SERVICE_AUDIENCE_JOBS, envs }));
        server.get(
            '/environment/:environmentId',
            requireBinding(envs, 'environmentId', (req) => routeParam(req, 'environmentId')),
            (_req, res) => {
                res.status(204).end();
            }
        );
        const token = await mint(
            { iss: INTERNAL_SERVICE_ISSUER_JOBS, kid: 'jobs-2026-09', privateKey: pem },
            {
                sub: nodeSubject('1'),
                aud: INTERNAL_SERVICE_AUDIENCE_JOBS,
                ttlSecs: 60,
                res: { environmentId: 4, connectionId: 9 },
                scopes: taskScopesForScriptType('action')
            }
        );
        const { url, close } = await listen(server);
        try {
            const res = await fetch(`${url}/environment/4`, { headers: { Authorization: `Bearer ${token}` } });
            expect(res.status).toBe(401);
        } finally {
            await close();
        }
    });
});

async function verifiedAuth(token: string | null, audience: string, creds: InternalServiceCredentials): Promise<InternalServiceAuth> {
    if (!token) {
        throw new Error('expected a token');
    }
    const auth = await verifyInternalServiceCredential(token, audience, creds);
    if (!auth) {
        throw new Error('expected verified auth');
    }
    return auth;
}

describe('isNodeBoundAuth', () => {
    it('matches a jobs node JWT to its own node id', async () => {
        const { pem, raw } = ed25519Material();
        const registry = keyRegistryFromPublicKeys([{ kid: 'jobs-2026-09', publicKey: raw }], INTERNAL_SERVICE_ISSUER_JOBS);
        const token = await mint(
            { iss: INTERNAL_SERVICE_ISSUER_JOBS, kid: 'jobs-2026-09', privateKey: pem },
            { sub: nodeSubject('1'), aud: INTERNAL_SERVICE_AUDIENCE_JOBS, ttlSecs: 60 }
        );
        const auth = await verifiedAuth(token, INTERNAL_SERVICE_AUDIENCE_JOBS, { registry });
        expect(isNodeBoundAuth(auth, '1')).toBe(true);
        expect(isNodeBoundAuth(auth, '2')).toBe(false);
    });

    it('matches an HMAC node token and a legacy EdDSA node token to their own node id', async () => {
        const hmac = createInternalServiceToken({ op: 'node', nodeId: '1', expiresInSecs: 60 }, 'sign');
        const hmacAuth = await verifiedAuth(hmac, INTERNAL_SERVICE_AUDIENCE_JOBS, { signingKey: 'sign' });
        expect(isNodeBoundAuth(hmacAuth, '1')).toBe(true);

        const eddsa = createRunnerDispatchToken({ op: 'node', nodeId: '1', expiresInSecs: 60 }, 'sign');
        const publicKey = exportRunnerPublicKey('sign');
        const eddsaAuth = await verifiedAuth(eddsa, INTERNAL_SERVICE_AUDIENCE_RUNNER, { runnerPublicKey: publicKey ?? undefined });
        expect(isNodeBoundAuth(eddsaAuth, '1')).toBe(true);
    });

    it('rejects a task token and a server-issued JWT', async () => {
        const { pem, raw } = ed25519Material();
        const jobsRegistry = keyRegistryFromPublicKeys([{ kid: 'jobs-2026-09', publicKey: raw }], INTERNAL_SERVICE_ISSUER_JOBS);
        const taskJwt = await mint(
            { iss: INTERNAL_SERVICE_ISSUER_JOBS, kid: 'jobs-2026-09', privateKey: pem },
            { sub: taskSubject(TASK_ID), aud: INTERNAL_SERVICE_AUDIENCE_JOBS, ttlSecs: 60 }
        );
        const taskJwtAuth = await verifiedAuth(taskJwt, INTERNAL_SERVICE_AUDIENCE_JOBS, { registry: jobsRegistry });
        expect(isNodeBoundAuth(taskJwtAuth, '1')).toBe(false);

        const taskHmac = createInternalServiceToken({ taskId: TASK_ID, expiresInSecs: 60 }, 'sign');
        const taskHmacAuth = await verifiedAuth(taskHmac, INTERNAL_SERVICE_AUDIENCE_JOBS, { signingKey: 'sign' });
        expect(isNodeBoundAuth(taskHmacAuth, '1')).toBe(false);

        const serverRegistry = keyRegistryFromPublicKeys([{ kid: 'server-2026-09', publicKey: raw }], INTERNAL_SERVICE_ISSUER_SERVER);
        const serverJwt = await mint(
            { iss: INTERNAL_SERVICE_ISSUER_SERVER, kid: 'server-2026-09', privateKey: pem },
            { sub: nodeSubject('1'), aud: INTERNAL_SERVICE_AUDIENCE_JOBS, ttlSecs: 60 }
        );
        const serverAuth = await verifiedAuth(serverJwt, INTERNAL_SERVICE_AUDIENCE_JOBS, { registry: serverRegistry });
        expect(isNodeBoundAuth(serverAuth, '1')).toBe(false);
    });

    it('returns false for an undefined or empty node id', async () => {
        const { pem, raw } = ed25519Material();
        const registry = keyRegistryFromPublicKeys([{ kid: 'jobs-2026-09', publicKey: raw }], INTERNAL_SERVICE_ISSUER_JOBS);
        const token = await mint(
            { iss: INTERNAL_SERVICE_ISSUER_JOBS, kid: 'jobs-2026-09', privateKey: pem },
            { sub: nodeSubject('1'), aud: INTERNAL_SERVICE_AUDIENCE_JOBS, ttlSecs: 60 }
        );
        const auth = await verifiedAuth(token, INTERNAL_SERVICE_AUDIENCE_JOBS, { registry });
        expect(isNodeBoundAuth(auth, undefined)).toBe(false);
        expect(isNodeBoundAuth(auth, '')).toBe(false);
    });
});
