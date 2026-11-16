import { generateKeyPairSync } from 'node:crypto';

import express from 'express';
import { importPKCS8, SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';

import { verifyInternalServiceCredential } from '../authenticate.js';
import { keyRegistryFromPublicKeys } from '../core/registry.js';
import { createRunnerDispatchToken, exportRunnerPublicKey } from '../legacy/ed25519.js';
import { createInternalServiceToken } from '../legacy/token.js';
import { mint } from '../nango/mint.js';
import {
    INTERNAL_SERVICE_AUDIENCE_JOBS,
    INTERNAL_SERVICE_AUDIENCE_PERSIST,
    INTERNAL_SERVICE_AUDIENCE_RUNNER,
    INTERNAL_SERVICE_AUDIENCE_SERVER,
    INTERNAL_SERVICE_ISSUER_JOBS,
    INTERNAL_SERVICE_ISSUER_SERVER,
    nodeSubject,
    taskSubject
} from '../nango/principals.js';
import { taskScopesForScriptType } from '../nango/scopes.js';
import { verify } from '../nango/verify.js';
import { ed25519TestMaterial, mintTaskCapabilityToken } from '../testing.js';
import { internalServiceAuthMiddleware } from './middleware.js';
import { bindingsFrom, hasScope, isNodeBoundAuth, isResourceBound, isTaskBoundAuth, requireParamBinding, requireScope, routeParam } from './requires.js';

import type { InternalServiceCredentials } from '../authenticate.js';
import type { KeyRegistry } from '../core/registry.js';
import type { InternalAuthEnvs } from '../nango/env.js';
import type { InternalServiceAuth, TaskCapabilityResource } from '../nango/principals.js';
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

describe('requireParamBinding', () => {
    it('accepts a jobs task JWT and an HMAC task token on the matching task id', async () => {
        const { pem, raw } = ed25519Material();
        const envs = envsFor(raw);
        const server = express();
        server.use(internalServiceAuthMiddleware({ audience: INTERNAL_SERVICE_AUDIENCE_JOBS, envs }));
        server.put('/tasks/:taskId', requireParamBinding(envs, 'taskId'), (_req, res) => {
            res.status(204).end();
        });
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
        server.put('/tasks/:taskId', requireParamBinding(envs, 'taskId'), (_req, res) => {
            res.status(204).end();
        });
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
        server.get('/environment/:environmentId', requireParamBinding(envs, 'environmentId'), (_req, res) => {
            res.status(204).end();
        });
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
        server.get('/environment/:environmentId', requireParamBinding(envs, 'environmentId'), (_req, res) => {
            res.status(204).end();
        });
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

const RESOURCE: TaskCapabilityResource = { environmentId: 9, connectionId: 1, syncId: 'sync-a' };

function taskJwt(): InternalServiceAuth {
    return {
        kind: 'jwt',
        subject: taskSubject(TASK_ID),
        audience: INTERNAL_SERVICE_AUDIENCE_JOBS,
        issuer: INTERNAL_SERVICE_ISSUER_JOBS,
        sub: taskSubject(TASK_ID),
        res: RESOURCE,
        scopes: ['persist:log']
    };
}

describe('routeParam', () => {
    it('returns a non-empty string param', () => {
        expect(routeParam({ params: { taskId: TASK_ID } } as unknown as Request, 'taskId')).toBe(TASK_ID);
        expect(routeParam({ params: { taskId: '' } } as unknown as Request, 'taskId')).toBeUndefined();
        expect(routeParam({ params: {} } as unknown as Request, 'taskId')).toBeUndefined();
    });
});

describe('bindingsFrom', () => {
    it('copies the task id and resource fields from a jobs task JWT', () => {
        expect(bindingsFrom(taskJwt())).toEqual({
            taskId: TASK_ID,
            environmentId: 9,
            connectionId: 1,
            syncId: 'sync-a'
        });
    });
});

describe('isResourceBound', () => {
    it('matches numeric ids only as numbers and syncId only as a string', () => {
        const auth = taskJwt();
        expect(isResourceBound(auth, 'environmentId', 9)).toBe(true);
        expect(isResourceBound(auth, 'environmentId', '9')).toBe(false);
        expect(isResourceBound(auth, 'syncId', 'sync-a')).toBe(true);
        expect(isResourceBound(auth, 'environmentId', undefined)).toBe(false);
        expect(isResourceBound(auth, 'syncId', undefined)).toBe(false);

        const nodeJwt: InternalServiceAuth = {
            kind: 'jwt',
            subject: nodeSubject('1'),
            audience: INTERNAL_SERVICE_AUDIENCE_JOBS,
            issuer: INTERNAL_SERVICE_ISSUER_JOBS,
            sub: nodeSubject('1'),
            res: RESOURCE
        };
        const serviceJwt: InternalServiceAuth = {
            kind: 'jwt',
            subject: INTERNAL_SERVICE_ISSUER_JOBS,
            audience: INTERNAL_SERVICE_AUDIENCE_JOBS,
            issuer: INTERNAL_SERVICE_ISSUER_JOBS,
            sub: INTERNAL_SERVICE_ISSUER_JOBS,
            res: RESOURCE
        };
        expect(isResourceBound(nodeJwt, 'environmentId', 9)).toBe(false);
        expect(isResourceBound(serviceJwt, 'environmentId', 9)).toBe(false);
    });
});

describe('hasScope', () => {
    it('accepts a known scope on a task JWT that carries res', () => {
        expect(hasScope(taskJwt(), 'persist:log')).toBe(true);
    });

    it('rejects a task JWT with no res, an empty scopes array, and a non-task JWT', () => {
        const { res: _res, ...noRes } = taskJwt();
        expect(hasScope(noRes, 'persist:log')).toBe(false);
        expect(hasScope({ ...taskJwt(), scopes: [] }, 'persist:log')).toBe(false);

        const nodeJwt: InternalServiceAuth = {
            kind: 'jwt',
            subject: nodeSubject('1'),
            audience: INTERNAL_SERVICE_AUDIENCE_JOBS,
            issuer: INTERNAL_SERVICE_ISSUER_JOBS,
            sub: nodeSubject('1'),
            res: RESOURCE,
            scopes: ['persist:log']
        };
        expect(hasScope(nodeJwt, 'persist:log')).toBe(false);
    });
});

describe('isTaskBoundAuth', () => {
    it('matches a jobs task JWT to its own task id', () => {
        const auth = taskJwt();
        expect(isTaskBoundAuth(auth, TASK_ID)).toBe(true);
        expect(isTaskBoundAuth(auth, 'other')).toBe(false);
    });

    it('matches an HMAC task token and a legacy EdDSA task token to their own task id', () => {
        const hmac: InternalServiceAuth = {
            kind: 'hmac',
            subject: TASK_ID,
            audience: INTERNAL_SERVICE_AUDIENCE_JOBS,
            op: 'task',
            taskId: TASK_ID
        };
        const eddsa: InternalServiceAuth = {
            kind: 'eddsa',
            subject: TASK_ID,
            audience: INTERNAL_SERVICE_AUDIENCE_RUNNER,
            op: 'task',
            taskId: TASK_ID
        };
        expect(isTaskBoundAuth(hmac, TASK_ID)).toBe(true);
        expect(isTaskBoundAuth(eddsa, TASK_ID)).toBe(true);
    });

    it('rejects a node token and a server-issued JWT', () => {
        const nodeJwt: InternalServiceAuth = {
            kind: 'jwt',
            subject: nodeSubject('1'),
            audience: INTERNAL_SERVICE_AUDIENCE_JOBS,
            issuer: INTERNAL_SERVICE_ISSUER_JOBS,
            sub: nodeSubject('1')
        };
        const serverJwt: InternalServiceAuth = {
            kind: 'jwt',
            subject: taskSubject(TASK_ID),
            audience: INTERNAL_SERVICE_AUDIENCE_JOBS,
            issuer: INTERNAL_SERVICE_ISSUER_SERVER,
            sub: taskSubject(TASK_ID)
        };
        expect(isTaskBoundAuth(nodeJwt, TASK_ID)).toBe(false);
        expect(isTaskBoundAuth(serverJwt, TASK_ID)).toBe(false);
    });

    it('returns false for an undefined or empty task id', () => {
        const auth = taskJwt();
        expect(isTaskBoundAuth(auth, undefined)).toBe(false);
        expect(isTaskBoundAuth(auth, '')).toBe(false);
    });
});

const KID = 'jobs-2026-09';
const SCOPE_AUDIENCES = [INTERNAL_SERVICE_AUDIENCE_JOBS, INTERNAL_SERVICE_AUDIENCE_PERSIST, INTERNAL_SERVICE_AUDIENCE_SERVER] as const;
const scopeEnvs: InternalAuthEnvs = { NANGO_INTERNAL_AUTH_REQUIRED: true };

function scopeRegistry(iss: typeof INTERNAL_SERVICE_ISSUER_JOBS | typeof INTERNAL_SERVICE_ISSUER_SERVER, raw: string, kid = KID): KeyRegistry {
    return keyRegistryFromPublicKeys([{ kid, publicKey: raw }], iss);
}

async function signCustom(privateKeyPem: string, payload: Record<string, unknown>): Promise<string> {
    const key = await importPKCS8(privateKeyPem, 'EdDSA');
    const iat = Math.floor(Date.now() / 1000);
    return await new SignJWT(payload)
        .setProtectedHeader({ alg: 'EdDSA', typ: 'JWT', kid: KID })
        .setIssuer(INTERNAL_SERVICE_ISSUER_JOBS)
        .setSubject(taskSubject(TASK_ID))
        .setAudience([...SCOPE_AUDIENCES])
        .setIssuedAt(iat)
        .setExpirationTime(iat + 60)
        .sign(key);
}

function scopedJobsApp() {
    const server = express();
    server.use(internalServiceAuthMiddleware({ audience: INTERNAL_SERVICE_AUDIENCE_JOBS, envs: scopeEnvs }));
    server.put('/tasks/:taskId', requireParamBinding(scopeEnvs, 'taskId'), requireScope(scopeEnvs, 'jobs:putTask'), (_req, res) => {
        res.status(204).end();
    });
    server.post('/tasks/:taskId/heartbeat', requireParamBinding(scopeEnvs, 'taskId'), requireScope(scopeEnvs, 'jobs:heartbeat'), (_req, res) => {
        res.status(201).end();
    });
    return server;
}

function scopeOnlyApp() {
    const server = express();
    server.use(internalServiceAuthMiddleware({ audience: INTERNAL_SERVICE_AUDIENCE_JOBS, envs: scopeEnvs }));
    server.put('/tasks/:taskId', requireScope(scopeEnvs, 'jobs:putTask'), (_req, res) => {
        res.status(204).end();
    });
    return server;
}

describe('requireScope', () => {
    it('always accepts an HMAC task token, and accepts a scope-less Ed25519 task JWT until PR 5', async () => {
        scopeEnvs.NANGO_INTERNAL_AUTH_REQUIRED = true;
        scopeEnvs.NANGO_INTERNAL_AUTH_SIGNING_KEY = 'sign';
        const { pem, raw } = ed25519TestMaterial();
        scopeEnvs.NANGO_INTERNAL_AUTH_JOBS_PUBLIC_KEYS = [{ kid: KID, publicKey: raw }];
        const hmac = createInternalServiceToken({ taskId: TASK_ID, expiresInSecs: 120 }, scopeEnvs.NANGO_INTERNAL_AUTH_SIGNING_KEY);
        if (!hmac) {
            throw new Error('expected an HMAC task token');
        }
        const scopeLess = await mint(
            { iss: INTERNAL_SERVICE_ISSUER_JOBS, kid: KID, privateKey: pem },
            { sub: taskSubject(TASK_ID), aud: INTERNAL_SERVICE_AUDIENCE_JOBS, ttlSecs: 60 }
        );
        const { url, close } = await listen(scopedJobsApp());
        try {
            for (const token of [hmac, scopeLess]) {
                const put = await fetch(`${url}/tasks/${TASK_ID}`, { method: 'PUT', headers: { Authorization: `Bearer ${token}` } });
                const heartbeat = await fetch(`${url}/tasks/${TASK_ID}/heartbeat`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
                expect(put.status).toBe(204);
                expect(heartbeat.status).toBe(201);
            }
        } finally {
            await close();
            scopeEnvs.NANGO_INTERNAL_AUTH_SIGNING_KEY = undefined;
            scopeEnvs.NANGO_INTERNAL_AUTH_JOBS_PUBLIC_KEYS = undefined;
        }
    });

    it('rejects a task JWT with scopes but no res, and an explicit empty scopes array', async () => {
        scopeEnvs.NANGO_INTERNAL_AUTH_REQUIRED = true;
        const { pem, raw } = ed25519TestMaterial();
        scopeEnvs.NANGO_INTERNAL_AUTH_JOBS_PUBLIC_KEYS = [{ kid: KID, publicKey: raw }];
        const registry = scopeRegistry(INTERNAL_SERVICE_ISSUER_JOBS, raw);
        const scopesOnly = await mint(
            { iss: INTERNAL_SERVICE_ISSUER_JOBS, kid: KID, privateKey: pem },
            { sub: taskSubject(TASK_ID), aud: INTERNAL_SERVICE_AUDIENCE_JOBS, ttlSecs: 60, scopes: taskScopesForScriptType('action') }
        );
        const emptyScopes = await signCustom(pem, { res: RESOURCE, scopes: [] });
        const scopesOnlyAuth = (await verify(scopesOnly, INTERNAL_SERVICE_AUDIENCE_JOBS, registry)).auth;
        expect(hasScope(scopesOnlyAuth ?? undefined, 'persist:log')).toBe(false);
        const { url, close } = await listen(scopedJobsApp());
        try {
            for (const token of [scopesOnly, emptyScopes]) {
                const put = await fetch(`${url}/tasks/${TASK_ID}`, { method: 'PUT', headers: { Authorization: `Bearer ${token}` } });
                expect(put.status).toBe(401);
            }
        } finally {
            await close();
            scopeEnvs.NANGO_INTERNAL_AUTH_JOBS_PUBLIC_KEYS = undefined;
        }
    });

    it('rejects an Ed25519 task JWT that has scopes but not the route scope', async () => {
        scopeEnvs.NANGO_INTERNAL_AUTH_REQUIRED = true;
        const { pem, raw } = ed25519TestMaterial();
        scopeEnvs.NANGO_INTERNAL_AUTH_JOBS_PUBLIC_KEYS = [{ kid: KID, publicKey: raw }];
        const token = await mintTaskCapabilityToken({
            privateKey: pem,
            taskId: TASK_ID,
            res: RESOURCE,
            scopes: taskScopesForScriptType('action').filter((scope) => scope !== 'jobs:heartbeat'),
            aud: INTERNAL_SERVICE_AUDIENCE_JOBS
        });
        const { url, close } = await listen(scopedJobsApp());
        try {
            const put = await fetch(`${url}/tasks/${TASK_ID}`, { method: 'PUT', headers: { Authorization: `Bearer ${token}` } });
            const heartbeat = await fetch(`${url}/tasks/${TASK_ID}/heartbeat`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
            expect(put.status).toBe(204);
            expect(heartbeat.status).toBe(401);
        } finally {
            await close();
            scopeEnvs.NANGO_INTERNAL_AUTH_JOBS_PUBLIC_KEYS = undefined;
        }
    });

    it('rejects a node HMAC token and the static token', async () => {
        scopeEnvs.NANGO_INTERNAL_AUTH_REQUIRED = true;
        scopeEnvs.NANGO_INTERNAL_AUTH_SIGNING_KEY = 'sign';
        scopeEnvs.NANGO_INTERNAL_AUTH_TOKEN = 'static-secret';
        const node = createInternalServiceToken({ op: 'node', nodeId: '1', expiresInSecs: 120 }, scopeEnvs.NANGO_INTERNAL_AUTH_SIGNING_KEY);
        if (!node) {
            throw new Error('expected a node token');
        }
        const { url, close } = await listen(scopeOnlyApp());
        try {
            const nodeRes = await fetch(`${url}/tasks/${TASK_ID}`, { method: 'PUT', headers: { Authorization: `Bearer ${node}` } });
            const staticRes = await fetch(`${url}/tasks/${TASK_ID}`, { method: 'PUT', headers: { Authorization: 'Bearer static-secret' } });
            expect(nodeRes.status).toBe(401);
            expect(staticRes.status).toBe(401);
        } finally {
            await close();
            scopeEnvs.NANGO_INTERNAL_AUTH_SIGNING_KEY = undefined;
            scopeEnvs.NANGO_INTERNAL_AUTH_TOKEN = undefined;
        }
    });

    it('does not apply the scope-less fallback to a node JWT', async () => {
        scopeEnvs.NANGO_INTERNAL_AUTH_REQUIRED = true;
        const { pem, raw } = ed25519TestMaterial();
        scopeEnvs.NANGO_INTERNAL_AUTH_JOBS_PUBLIC_KEYS = [{ kid: KID, publicKey: raw }];
        const scopeLessNode = await mint(
            { iss: INTERNAL_SERVICE_ISSUER_JOBS, kid: KID, privateKey: pem },
            { sub: nodeSubject('1'), aud: INTERNAL_SERVICE_AUDIENCE_JOBS, ttlSecs: 60 }
        );
        const { url, close } = await listen(scopeOnlyApp());
        try {
            const res = await fetch(`${url}/tasks/${TASK_ID}`, { method: 'PUT', headers: { Authorization: `Bearer ${scopeLessNode}` } });
            expect(res.status).toBe(401);
        } finally {
            await close();
            scopeEnvs.NANGO_INTERNAL_AUTH_JOBS_PUBLIC_KEYS = undefined;
        }
    });

    it('accepts an eddsa task token when the task id matches', async () => {
        scopeEnvs.NANGO_INTERNAL_AUTH_REQUIRED = true;
        const signingKey = 'sign';
        const publicKey = exportRunnerPublicKey(signingKey);
        if (!publicKey) {
            throw new Error('expected a runner public key');
        }
        scopeEnvs.NANGO_INTERNAL_AUTH_RUNNER_PUBLIC_KEY = publicKey;
        const token = createRunnerDispatchToken({ taskId: TASK_ID, expiresInSecs: 120 }, signingKey);
        if (!token) {
            throw new Error('expected an eddsa task token');
        }
        const server = express();
        server.use(internalServiceAuthMiddleware({ audience: INTERNAL_SERVICE_AUDIENCE_RUNNER, envs: scopeEnvs }));
        server.put('/tasks/:taskId', requireParamBinding(scopeEnvs, 'taskId'), requireScope(scopeEnvs, 'jobs:putTask'), (_req, res) => {
            res.status(204).end();
        });
        const { url, close } = await listen(server);
        try {
            const res = await fetch(`${url}/tasks/${TASK_ID}`, { method: 'PUT', headers: { Authorization: `Bearer ${token}` } });
            expect(res.status).toBe(204);
        } finally {
            await close();
            scopeEnvs.NANGO_INTERNAL_AUTH_RUNNER_PUBLIC_KEY = undefined;
        }
    });
});
