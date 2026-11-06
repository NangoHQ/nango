import { importPKCS8, SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';

import { keyRegistryFromPublicKeys } from '../core/registry.js';
import { hasScope, isResourceBound } from '../express/requires.js';
import { ed25519TestMaterial, mintTaskCapabilityToken } from '../testing.js';
import { mint } from './mint.js';
import {
    INTERNAL_SERVICE_AUDIENCE_JOBS,
    INTERNAL_SERVICE_AUDIENCE_PERSIST,
    INTERNAL_SERVICE_AUDIENCE_SERVER,
    INTERNAL_SERVICE_ISSUER_JOBS,
    INTERNAL_SERVICE_ISSUER_SERVER,
    nodeSubject,
    taskSubject
} from './principals.js';
import { TASK_CAPABILITY_SCOPES, taskScopesForScriptType } from './scopes.js';
import { verify, verifyTaskCapabilityToken } from './verify.js';

import type { KeyRegistry } from '../core/registry.js';
import type { TaskCapabilityResource } from './principals.js';

const KID = 'jobs-2026-09';
const TASK_ID = '11111111-1111-4111-8111-111111111111';
const RESOURCE: TaskCapabilityResource = { environmentId: 9, connectionId: 1, syncId: 'sync-a' };
const AUDIENCES = [INTERNAL_SERVICE_AUDIENCE_JOBS, INTERNAL_SERVICE_AUDIENCE_PERSIST, INTERNAL_SERVICE_AUDIENCE_SERVER] as const;
const SYNC_ONLY = ['persist:records', 'persist:cursor', 'persist:sync-conflict'] as const;

function registryFor(iss: typeof INTERNAL_SERVICE_ISSUER_JOBS | typeof INTERNAL_SERVICE_ISSUER_SERVER, raw: string, kid = KID): KeyRegistry {
    return keyRegistryFromPublicKeys([{ kid, publicKey: raw }], iss);
}

async function signCustom(privateKeyPem: string, payload: Record<string, unknown>): Promise<string> {
    const key = await importPKCS8(privateKeyPem, 'EdDSA');
    const iat = Math.floor(Date.now() / 1000);
    return await new SignJWT(payload)
        .setProtectedHeader({ alg: 'EdDSA', typ: 'JWT', kid: KID })
        .setIssuer(INTERNAL_SERVICE_ISSUER_JOBS)
        .setSubject(taskSubject(TASK_ID))
        .setAudience([...AUDIENCES])
        .setIssuedAt(iat)
        .setExpirationTime(iat + 60)
        .sign(key);
}

describe('T1', () => {
    it('verifies a minted token for jobs, persist, and server and carries res and scopes unchanged', async () => {
        const { pem, raw } = ed25519TestMaterial();
        const registry = registryFor(INTERNAL_SERVICE_ISSUER_JOBS, raw);
        const syncScopes = taskScopesForScriptType('sync');
        const actionScopes = taskScopesForScriptType('action');
        expect(syncScopes).toEqual([...TASK_CAPABILITY_SCOPES]);
        expect(taskScopesForScriptType('webhook')).toEqual(syncScopes);
        for (const scope of SYNC_ONLY) {
            expect(actionScopes).not.toContain(scope);
        }
        expect(actionScopes).toEqual(expect.arrayContaining(['persist:log', 'jobs:putTask', 'jobs:heartbeat', 'api:action:trigger']));
        expect(actionScopes).not.toContain('api:proxy');
        expect(taskScopesForScriptType('on-event')).toEqual(actionScopes);
        expect(taskScopesForScriptType('function')).toEqual(actionScopes);

        const token = await mintTaskCapabilityToken({ privateKey: pem, taskId: TASK_ID, res: RESOURCE, scopes: actionScopes });
        for (const audience of AUDIENCES) {
            const auth = await verifyTaskCapabilityToken(token, audience, registry);
            expect(auth).toMatchObject({
                kind: 'jwt',
                issuer: INTERNAL_SERVICE_ISSUER_JOBS,
                sub: taskSubject(TASK_ID),
                audience,
                res: RESOURCE,
                scopes: actionScopes
            });
        }

        const withUnknown = await signCustom(pem, { res: RESOURCE, scopes: actionScopes, note: 'ignore-me' });
        const ignored = await verifyTaskCapabilityToken(withUnknown, INTERNAL_SERVICE_AUDIENCE_PERSIST, registry);
        expect(ignored?.res).toEqual(RESOURCE);
        expect(ignored?.scopes).toEqual(actionScopes);

        const withFutureScope = await signCustom(pem, { res: RESOURCE, scopes: ['persist:log', 'future:thing'] });
        const future = await verifyTaskCapabilityToken(withFutureScope, INTERNAL_SERVICE_AUDIENCE_JOBS, registry);
        expect(future).not.toBeNull();
        if (!future) {
            return;
        }
        expect(future.scopes).toEqual(['persist:log']);
        expect(hasScope(future, 'persist:log')).toBe(true);
        expect(hasScope(future, 'jobs:putTask')).toBe(false);

        for (const scopes of [
            ['persist:log', ''],
            ['persist:log', 1]
        ]) {
            const token = await signCustom(pem, { res: RESOURCE, scopes });
            expect(await verifyTaskCapabilityToken(token, INTERNAL_SERVICE_AUDIENCE_JOBS, registry)).toBeNull();
        }
    });
});

describe('T2', () => {
    it('rejects a res claim whose environmentId, connectionId, or syncId has the wrong type', async () => {
        const { pem, raw } = ed25519TestMaterial();
        const registry = registryFor(INTERNAL_SERVICE_ISSUER_JOBS, raw);
        const scopes = taskScopesForScriptType('action');
        const badResources = [
            { environmentId: '9', connectionId: 1 },
            { environmentId: 0, connectionId: 1 },
            { environmentId: -1, connectionId: 1 },
            { environmentId: 9, connectionId: 0 },
            { environmentId: 9, connectionId: -3 },
            { environmentId: 9, connectionId: 1, syncId: '' },
            { environmentId: 9, connectionId: 1, syncId: 4 }
        ];
        for (const res of badResources) {
            const token = await signCustom(pem, { res, scopes });
            expect(await verifyTaskCapabilityToken(token, INTERNAL_SERVICE_AUDIENCE_JOBS, registry)).toBeNull();
        }
    });

    it('rejects a scopes claim that is not an array of strings, including an empty array', async () => {
        const { pem, raw } = ed25519TestMaterial();
        const registry = registryFor(INTERNAL_SERVICE_ISSUER_JOBS, raw);
        for (const scopes of ['persist:log', { log: true }, []]) {
            const token = await signCustom(pem, { res: RESOURCE, scopes });
            expect(await verifyTaskCapabilityToken(token, INTERNAL_SERVICE_AUDIENCE_JOBS, registry)).toBeNull();
        }
    });

    it('refuses to mint a res claim that verification would reject', async () => {
        const { pem } = ed25519TestMaterial();
        const signer = { iss: INTERNAL_SERVICE_ISSUER_JOBS, kid: KID, privateKey: pem } as const;
        const base = { sub: taskSubject(TASK_ID), aud: INTERNAL_SERVICE_AUDIENCE_JOBS, ttlSecs: 60, scopes: taskScopesForScriptType('action') };
        await expect(mint(signer, { ...base, res: { environmentId: 0, connectionId: 1 } })).rejects.toThrow(/positive environmentId/);
        await expect(mint(signer, { ...base, res: { environmentId: 9, connectionId: -1 } })).rejects.toThrow(/positive environmentId/);
        await expect(mint(signer, { ...base, res: { environmentId: 9, connectionId: 1, syncId: '' } })).rejects.toThrow(/syncId/);
    });
});

describe('T3', () => {
    it('rejects an expired token, an unknown kid, and a token issued by service:server', async () => {
        const jobs = ed25519TestMaterial();
        const registry = registryFor(INTERNAL_SERVICE_ISSUER_JOBS, jobs.raw);
        const scopes = taskScopesForScriptType('sync');

        const expired = await mintTaskCapabilityToken({
            privateKey: jobs.pem,
            taskId: TASK_ID,
            res: RESOURCE,
            scopes,
            ttlSecs: -1
        });
        expect(await verifyTaskCapabilityToken(expired, INTERNAL_SERVICE_AUDIENCE_JOBS, registry)).toBeNull();

        const unknownKid = await mint(
            { iss: INTERNAL_SERVICE_ISSUER_JOBS, kid: 'jobs-unknown', privateKey: jobs.pem },
            { sub: taskSubject(TASK_ID), aud: [...AUDIENCES], ttlSecs: 60, res: RESOURCE, scopes }
        );
        expect(await verifyTaskCapabilityToken(unknownKid, INTERNAL_SERVICE_AUDIENCE_JOBS, registry)).toBeNull();

        const server = ed25519TestMaterial();
        const serverToken = await mint(
            { iss: INTERNAL_SERVICE_ISSUER_SERVER, kid: 'server-2026-09', privateKey: server.pem },
            { sub: taskSubject(TASK_ID), aud: [...AUDIENCES], ttlSecs: 60, res: RESOURCE, scopes }
        );
        const serverRegistry = registryFor(INTERNAL_SERVICE_ISSUER_SERVER, server.raw, 'server-2026-09');
        expect(await verifyTaskCapabilityToken(serverToken, INTERNAL_SERVICE_AUDIENCE_SERVER, serverRegistry)).toBeNull();
    });
});

describe('T4', () => {
    it('does not let a node token or a service token pass hasScope or isResourceBound', async () => {
        const { pem, raw } = ed25519TestMaterial();
        const registry = registryFor(INTERNAL_SERVICE_ISSUER_JOBS, raw);
        const scopes = taskScopesForScriptType('sync');
        const task = await verifyTaskCapabilityToken(
            await mintTaskCapabilityToken({ privateKey: pem, taskId: TASK_ID, res: RESOURCE, scopes }),
            INTERNAL_SERVICE_AUDIENCE_JOBS,
            registry
        );
        expect(task).not.toBeNull();
        if (!task) {
            return;
        }
        expect(hasScope(task, 'persist:records')).toBe(true);
        expect(isResourceBound(task, 'environmentId', RESOURCE.environmentId)).toBe(true);
        expect(isResourceBound(task, 'connectionId', RESOURCE.connectionId)).toBe(true);
        expect(isResourceBound(task, 'syncId', RESOURCE.syncId)).toBe(true);
        expect(isResourceBound(task, 'syncId', 'sync-b')).toBe(false);
        expect(isResourceBound(task, 'environmentId', undefined)).toBe(false);
        expect(isResourceBound(task, 'syncId', undefined)).toBe(false);

        for (const sub of [nodeSubject('1'), INTERNAL_SERVICE_ISSUER_JOBS, INTERNAL_SERVICE_ISSUER_SERVER]) {
            const token = await mint(
                { iss: INTERNAL_SERVICE_ISSUER_JOBS, kid: KID, privateKey: pem },
                { sub, aud: INTERNAL_SERVICE_AUDIENCE_JOBS, ttlSecs: 60, res: RESOURCE, scopes }
            );
            const auth = (await verify(token, INTERNAL_SERVICE_AUDIENCE_JOBS, registry)).auth;
            expect(auth).not.toBeNull();
            expect(hasScope(auth ?? undefined, 'persist:records')).toBe(false);
            expect(isResourceBound(auth ?? undefined, 'environmentId', RESOURCE.environmentId)).toBe(false);
            expect(isResourceBound(auth ?? undefined, 'connectionId', RESOURCE.connectionId)).toBe(false);
            expect(isResourceBound(auth ?? undefined, 'syncId', RESOURCE.syncId)).toBe(false);
            expect(await verifyTaskCapabilityToken(token, INTERNAL_SERVICE_AUDIENCE_JOBS, registry)).toBeNull();
        }
    });
});
