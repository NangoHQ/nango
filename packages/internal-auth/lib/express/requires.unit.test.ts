import { generateKeyPairSync } from 'node:crypto';

import express from 'express';
import { describe, expect, it } from 'vitest';

import { mint } from '../core/mint.js';
import { createInternalServiceToken } from '../legacy/token.js';
import { INTERNAL_SERVICE_AUDIENCE_JOBS, INTERNAL_SERVICE_ISSUER_JOBS, nodeSubject, taskSubject } from '../nango/principals.js';
import { taskScopesForScriptType } from '../nango/scopes.js';
import { internalServiceAuthMiddleware } from './middleware.js';
import { requireBinding } from './requires.js';

import type { InternalAuthEnvs } from '../nango/env.js';
import type { Request } from 'express';

const TASK_ID = '11111111-1111-4111-8111-111111111111';

function ed25519Material(): { pem: string; raw: string } {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const pem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
    const raw = Buffer.from(publicKey.export({ format: 'der', type: 'spki' }))
        .subarray(12)
        .toString('base64url');
    return { pem, raw };
}

function routeParam(req: Request, name: string): string | undefined {
    const value = req.params[name];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
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

    it('skips an HMAC token when the binding is absent and rejects a capability token for a different environment', async () => {
        const { pem, raw } = ed25519Material();
        const envs = envsFor(raw);
        const server = express();
        server.use(internalServiceAuthMiddleware({ audience: INTERNAL_SERVICE_AUDIENCE_JOBS, envs }));
        server.get(
            '/environment/:environmentId',
            requireBinding(envs, 'environmentId', (req) => routeParam(req, 'environmentId'), { allowAbsent: true }),
            (_req, res) => {
                res.status(204).end();
            }
        );
        const hmac = createInternalServiceToken({ taskId: TASK_ID, expiresInSecs: 60 }, envs.NANGO_INTERNAL_AUTH_SIGNING_KEY);
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
            const hmacRes = await fetch(`${url}/environment/9`, { headers: { Authorization: `Bearer ${hmac}` } });
            const mismatch = await fetch(`${url}/environment/9`, { headers: { Authorization: `Bearer ${jwt}` } });
            const match = await fetch(`${url}/environment/4`, { headers: { Authorization: `Bearer ${jwt}` } });
            expect(hmacRes.status).toBe(204);
            expect(mismatch.status).toBe(401);
            expect(match.status).toBe(204);
        } finally {
            await close();
        }
    });
});
