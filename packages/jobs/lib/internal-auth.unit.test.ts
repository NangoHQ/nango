import { generateKeyPairSync } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    exportRunnerPublicKey,
    INTERNAL_SERVICE_AUDIENCE_JOBS,
    INTERNAL_SERVICE_AUDIENCE_PERSIST,
    INTERNAL_SERVICE_AUDIENCE_RUNNER,
    INTERNAL_SERVICE_AUDIENCE_SERVER,
    INTERNAL_SERVICE_ISSUER_JOBS,
    INTERNAL_SERVICE_NODE_TOKEN_EXPIRES_SECS,
    INTERNAL_SERVICE_TOKEN_DEFAULT_EXPIRES_SECS,
    INTERNAL_SERVICE_TOKEN_TTL_SECS,
    keyRegistryFromPublicKeys,
    nodeSubject,
    taskScopesForScriptType,
    taskSubject,
    verifyInternalServiceCredential,
    verifyInternalServiceToken,
    verifyRunnerDispatchToken,
    verifyTaskCapabilityToken
} from '@nangohq/internal-auth';

import { assertRunnerAuthMaterial, mintRunnerAuthEnv, mintRunnerDispatchToken, mintTaskAuthToken, runnerAuth } from './internal-auth.js';

import type { NangoProps } from '@nangohq/types';

const { mockEnvs } = vi.hoisted(() => ({
    mockEnvs: {
        NANGO_INTERNAL_AUTH_SIGNING_KEY: undefined as string | undefined,
        NANGO_INTERNAL_AUTH_REQUIRED: false,
        NANGO_INTERNAL_AUTH_JOBS_PRIVATE_KEY: undefined as string | undefined,
        NANGO_INTERNAL_AUTH_JOBS_KEY_ID: undefined as string | undefined,
        NANGO_INTERNAL_AUTH_JOBS_PUBLIC_KEYS: undefined as { kid: string; publicKey: string }[] | undefined,
        NANGO_INTERNAL_AUTH_OMIT_SECRET_KEY: false
    }
}));

vi.mock('./env.js', () => ({
    envs: mockEnvs
}));

afterEach(() => {
    mockEnvs.NANGO_INTERNAL_AUTH_SIGNING_KEY = undefined;
    mockEnvs.NANGO_INTERNAL_AUTH_REQUIRED = false;
    mockEnvs.NANGO_INTERNAL_AUTH_JOBS_PRIVATE_KEY = undefined;
    mockEnvs.NANGO_INTERNAL_AUTH_JOBS_KEY_ID = undefined;
    mockEnvs.NANGO_INTERNAL_AUTH_JOBS_PUBLIC_KEYS = undefined;
    mockEnvs.NANGO_INTERNAL_AUTH_OMIT_SECRET_KEY = false;
});

function capabilityProps(scriptType: NangoProps['scriptType']): NangoProps {
    return {
        scriptType,
        secretKey: 'sk',
        connectionId: 'conn-1',
        nangoConnectionId: 9,
        environmentId: 4,
        environmentName: 'dev',
        providerConfigKey: 'google',
        provider: 'google',
        team: { id: 1, name: 'team' },
        ...(scriptType === 'sync' || scriptType === 'webhook' ? { syncId: '11111111-1111-4111-8111-111111111111' } : {}),
        syncConfig: {} as NangoProps['syncConfig'],
        activityLogId: 'log-1',
        debug: false,
        startedAt: new Date(),
        endUser: null,
        runnerFlags: {} as NangoProps['runnerFlags'],
        logger: { level: 'info' }
    };
}

describe('mintTaskAuthToken', () => {
    it('returns null when the signing key is unset', async () => {
        expect(await mintTaskAuthToken('task-1', {})).toBeNull();
    });

    it('mints a jobs-audience token when the signing key is set', async () => {
        mockEnvs.NANGO_INTERNAL_AUTH_SIGNING_KEY = 'sign';
        const issuedAt = Math.floor(Date.now() / 1000);
        const token = await mintTaskAuthToken('task-1', {});
        expect(token).toBeTruthy();
        if (!token) {
            return;
        }
        const auth = verifyInternalServiceToken(token, 'jobs', 'sign');
        expect(auth).toMatchObject({ kind: 'hmac', op: 'task', taskId: 'task-1', audience: 'jobs' });
        const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as { exp: number };
        expect(payload.exp).toBeGreaterThanOrEqual(issuedAt + INTERNAL_SERVICE_TOKEN_DEFAULT_EXPIRES_SECS);
        expect(payload.exp).toBeLessThan(issuedAt + INTERNAL_SERVICE_TOKEN_DEFAULT_EXPIRES_SECS + 5);
    });

    it('uses killAfterMs plus a buffer when lifecycle is set', async () => {
        mockEnvs.NANGO_INTERNAL_AUTH_SIGNING_KEY = 'sign';
        const issuedAt = Math.floor(Date.now() / 1000);
        const token = await mintTaskAuthToken('task-1', { lifecycle: { killAfterMs: 5_000, interruptAfterMs: 1_000 } });
        if (!token) {
            throw new Error('expected a token');
        }
        const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as { exp: number };
        expect(payload.exp).toBeGreaterThanOrEqual(issuedAt + 60);
        expect(payload.exp).toBeLessThan(issuedAt + INTERNAL_SERVICE_TOKEN_DEFAULT_EXPIRES_SECS);
    });

    it('uses the bounded expiry when killAfterMs is 0', async () => {
        mockEnvs.NANGO_INTERNAL_AUTH_SIGNING_KEY = 'sign';
        const issuedAt = Math.floor(Date.now() / 1000);
        const token = await mintTaskAuthToken('task-1', { lifecycle: { killAfterMs: 0, interruptAfterMs: 0 } });
        if (!token) {
            throw new Error('expected a token');
        }
        const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as { exp: number };
        expect(payload.exp).toBeGreaterThanOrEqual(issuedAt + 60);
        expect(payload.exp).toBeLessThan(issuedAt + 65);
    });
});

describe('runnerAuth', () => {
    function jobsKey(): { pem: string; raw: string } {
        const { publicKey, privateKey } = generateKeyPairSync('ed25519');
        return {
            pem: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
            raw: Buffer.from(publicKey.export({ format: 'der', type: 'spki' }))
                .subarray(12)
                .toString('base64url')
        };
    }

    it('keeps the secret and omits taskAuthToken when no Ed25519 jobs key is configured', async () => {
        mockEnvs.NANGO_INTERNAL_AUTH_SIGNING_KEY = 'sign';
        const props = capabilityProps('sync');
        const result = await runnerAuth('task-1', props);
        expect(result.nangoProps.taskAuthToken).toBeUndefined();
        expect(result.nangoProps.secretKey).toBe('sk');
        expect(result.nangoProps).toBe(props);
        expect(result.internalAuthToken).toEqual(expect.any(String));
        expect(verifyInternalServiceToken(result.internalAuthToken!, 'jobs', 'sign')).toMatchObject({ kind: 'hmac', op: 'task', taskId: 'task-1' });
    });

    it('mints one capability token for the runner and for jobs, with the scopes for the script type', async () => {
        const { pem, raw } = jobsKey();
        mockEnvs.NANGO_INTERNAL_AUTH_JOBS_PRIVATE_KEY = pem;
        mockEnvs.NANGO_INTERNAL_AUTH_JOBS_KEY_ID = 'jobs-2026-09';
        const registry = keyRegistryFromPublicKeys([{ kid: 'jobs-2026-09', publicKey: raw }], INTERNAL_SERVICE_ISSUER_JOBS);

        const sync = await runnerAuth('task-sync', capabilityProps('sync'));
        expect(sync.nangoProps.taskAuthToken).toBe(sync.internalAuthToken);
        expect(sync.nangoProps.secretKey).toBe('sk');
        const syncAuth = await verifyTaskCapabilityToken(sync.internalAuthToken!, INTERNAL_SERVICE_AUDIENCE_PERSIST, registry);
        expect(syncAuth?.scopes).toEqual(taskScopesForScriptType('sync'));
        expect(syncAuth?.res).toEqual({ environmentId: 4, connectionId: 9, syncId: '11111111-1111-4111-8111-111111111111' });
        expect(await verifyTaskCapabilityToken(sync.internalAuthToken!, INTERNAL_SERVICE_AUDIENCE_SERVER, registry)).toMatchObject({ sub: 'task:task-sync' });
        expect(await verifyTaskCapabilityToken(sync.internalAuthToken!, INTERNAL_SERVICE_AUDIENCE_JOBS, registry)).toMatchObject({ sub: 'task:task-sync' });

        const action = await runnerAuth('task-action', capabilityProps('action'));
        const actionAuth = await verifyTaskCapabilityToken(action.internalAuthToken!, INTERNAL_SERVICE_AUDIENCE_SERVER, registry);
        expect(actionAuth?.scopes).toEqual(taskScopesForScriptType('action'));
        expect(actionAuth?.scopes).not.toContain('persist:records');
        expect(actionAuth?.res).toEqual({ environmentId: 4, connectionId: 9 });
    });

    it('verifies the sync and action tokens for persist and the server', async () => {
        const { pem, raw } = jobsKey();
        mockEnvs.NANGO_INTERNAL_AUTH_JOBS_PRIVATE_KEY = pem;
        mockEnvs.NANGO_INTERNAL_AUTH_JOBS_KEY_ID = 'jobs-2026-09';
        const registry = keyRegistryFromPublicKeys([{ kid: 'jobs-2026-09', publicKey: raw }], INTERNAL_SERVICE_ISSUER_JOBS);

        for (const scriptType of ['sync', 'action'] as const) {
            const props = capabilityProps(scriptType);
            const { internalAuthToken } = await runnerAuth(`task-${scriptType}`, props);
            expect(internalAuthToken).toEqual(expect.any(String));
            if (!internalAuthToken) {
                return;
            }
            const res = {
                environmentId: props.environmentId,
                connectionId: props.nangoConnectionId,
                ...(props.syncId ? { syncId: props.syncId } : {})
            };
            for (const audience of [INTERNAL_SERVICE_AUDIENCE_PERSIST, INTERNAL_SERVICE_AUDIENCE_SERVER]) {
                const auth = await verifyTaskCapabilityToken(internalAuthToken, audience, registry);
                expect(auth?.res).toEqual(res);
                expect(auth?.scopes).toEqual(taskScopesForScriptType(scriptType));
            }
        }
    });

    it('removes secretKey when omit is set, and refuses to dispatch when no Ed25519 key can mint a token', async () => {
        mockEnvs.NANGO_INTERNAL_AUTH_OMIT_SECRET_KEY = true;
        await expect(runnerAuth('task-1', capabilityProps('action'))).rejects.toThrow(/NANGO_INTERNAL_AUTH_OMIT_SECRET_KEY/);

        const { pem, raw } = jobsKey();
        mockEnvs.NANGO_INTERNAL_AUTH_JOBS_PRIVATE_KEY = pem;
        mockEnvs.NANGO_INTERNAL_AUTH_JOBS_KEY_ID = 'jobs-2026-09';
        mockEnvs.NANGO_INTERNAL_AUTH_OMIT_SECRET_KEY = true;
        const registry = keyRegistryFromPublicKeys([{ kid: 'jobs-2026-09', publicKey: raw }], INTERNAL_SERVICE_ISSUER_JOBS);
        const result = await runnerAuth('task-1', capabilityProps('action'));
        expect(result.nangoProps.secretKey).toBeUndefined();
        expect(result.nangoProps).not.toHaveProperty('secretKey');
        expect(result.nangoProps.taskAuthToken).toBe(result.internalAuthToken);
        expect(await verifyTaskCapabilityToken(result.internalAuthToken!, INTERNAL_SERVICE_AUDIENCE_SERVER, registry)).toMatchObject({
            scopes: taskScopesForScriptType('action')
        });
    });
});

describe('mintRunnerDispatchToken', () => {
    it('returns null when the signing key is unset', async () => {
        expect(await mintRunnerDispatchToken({ taskId: 'task-1' })).toBeNull();
    });

    it('mints a runner-audience EdDSA token that verifies with the public key, not the jobs master', async () => {
        mockEnvs.NANGO_INTERNAL_AUTH_SIGNING_KEY = 'sign';
        const token = await mintRunnerDispatchToken({ taskId: 'task-1' });
        const publicKey = exportRunnerPublicKey('sign');
        expect(token).toBeTruthy();
        expect(publicKey).toBeTruthy();
        if (!token || !publicKey) {
            return;
        }
        expect(verifyRunnerDispatchToken(token, INTERNAL_SERVICE_AUDIENCE_RUNNER, publicKey)).toMatchObject({
            kind: 'eddsa',
            op: 'task',
            taskId: 'task-1',
            audience: INTERNAL_SERVICE_AUDIENCE_RUNNER
        });
        expect(verifyInternalServiceToken(token, INTERNAL_SERVICE_AUDIENCE_RUNNER, 'sign')).toMatchObject({ ok: false });
        expect(verifyRunnerDispatchToken(token, 'jobs', publicKey)).toMatchObject({ ok: false });
    });
});

describe('mintRunnerAuthEnv', () => {
    it('returns nothing when the signing key is unset', async () => {
        expect(await mintRunnerAuthEnv(7)).toEqual({});
    });

    it('returns nothing when only jobs public keys are set', async () => {
        mockEnvs.NANGO_INTERNAL_AUTH_JOBS_PUBLIC_KEYS = [{ kid: 'jobs-2026-09', publicKey: 'cHVibGlj' }];
        mockEnvs.NANGO_INTERNAL_AUTH_REQUIRED = true;
        expect(await mintRunnerAuthEnv(7)).toEqual({});
    });

    it('injects a node-bound jobs JWT and the Ed25519 public key, never a minting secret', async () => {
        mockEnvs.NANGO_INTERNAL_AUTH_SIGNING_KEY = 'sign';
        mockEnvs.NANGO_INTERNAL_AUTH_REQUIRED = true;
        const issuedAt = Math.floor(Date.now() / 1000);
        const env = await mintRunnerAuthEnv(7);
        const publicKey = exportRunnerPublicKey('sign');
        expect(env['NANGO_INTERNAL_AUTH_RUNNER_PUBLIC_KEY']).toBe(publicKey);
        expect(env).not.toHaveProperty('NANGO_INTERNAL_AUTH_SIGNING_KEY');
        expect(env).not.toHaveProperty('NANGO_INTERNAL_AUTH_TOKEN');
        expect(env['NANGO_INTERNAL_AUTH_REQUIRED']).toBe('true');

        const auth = verifyInternalServiceToken(env['NANGO_INTERNAL_AUTH_RUNNER_NODE_TOKEN']!, 'jobs', 'sign');
        expect(auth).toMatchObject({ kind: 'hmac', op: 'node', nodeId: '7', audience: 'jobs' });

        const payload = JSON.parse(Buffer.from(env['NANGO_INTERNAL_AUTH_RUNNER_NODE_TOKEN']!.split('.')[1] ?? '', 'base64url').toString('utf8')) as {
            exp: number;
        };
        expect(payload.exp).toBeGreaterThanOrEqual(issuedAt + INTERNAL_SERVICE_NODE_TOKEN_EXPIRES_SECS);
        expect(payload.exp).toBeLessThan(issuedAt + INTERNAL_SERVICE_NODE_TOKEN_EXPIRES_SECS + 5);
    });

    it('injects a workload node token and jobs public keys, never the private key', async () => {
        const { publicKey, privateKey } = generateKeyPairSync('ed25519');
        const pem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
        const raw = Buffer.from(publicKey.export({ format: 'der', type: 'spki' }))
            .subarray(12)
            .toString('base64url');
        mockEnvs.NANGO_INTERNAL_AUTH_SIGNING_KEY = 'sign';
        mockEnvs.NANGO_INTERNAL_AUTH_JOBS_PRIVATE_KEY = pem;
        mockEnvs.NANGO_INTERNAL_AUTH_JOBS_KEY_ID = 'jobs-2026-09';
        mockEnvs.NANGO_INTERNAL_AUTH_JOBS_PUBLIC_KEYS = [{ kid: 'jobs-2026-09', publicKey: raw }];
        mockEnvs.NANGO_INTERNAL_AUTH_REQUIRED = true;

        const env = await mintRunnerAuthEnv(7);
        expect(env['NANGO_INTERNAL_AUTH_JOBS_PUBLIC_KEYS']).toBe(JSON.stringify([{ kid: 'jobs-2026-09', publicKey: raw }]));
        expect(env['NANGO_INTERNAL_AUTH_RUNNER_PUBLIC_KEY']).toBe(exportRunnerPublicKey('sign'));
        expect(env).not.toHaveProperty('NANGO_INTERNAL_AUTH_JOBS_PRIVATE_KEY');
        expect(env).not.toHaveProperty('NANGO_INTERNAL_AUTH_JOBS_KEY_ID');
        expect(env).not.toHaveProperty('NANGO_INTERNAL_AUTH_SIGNING_KEY');

        const registry = keyRegistryFromPublicKeys(
            JSON.parse(env['NANGO_INTERNAL_AUTH_JOBS_PUBLIC_KEYS']!) as { kid: string; publicKey: string }[],
            INTERNAL_SERVICE_ISSUER_JOBS
        );
        const auth = await verifyInternalServiceCredential(env['NANGO_INTERNAL_AUTH_RUNNER_NODE_TOKEN']!, INTERNAL_SERVICE_AUDIENCE_JOBS, { registry });
        expect(auth).toMatchObject({ kind: 'jwt', sub: nodeSubject('7'), issuer: INTERNAL_SERVICE_ISSUER_JOBS });
    });
});

describe('assertRunnerAuthMaterial', () => {
    it('rejects REQUIRED when jobs has nothing to mint', () => {
        expect(() => assertRunnerAuthMaterial({ required: true })).toThrow(/no private key or HMAC signing key/);
        expect(() => assertRunnerAuthMaterial({ required: true, privateKey: 'pem' })).toThrow(/no private key or HMAC signing key/);
    });

    it('allows REQUIRED when a signing key or jobs private key is set', () => {
        expect(() => assertRunnerAuthMaterial({ required: true, signingKey: 'sign' })).not.toThrow();
        expect(() => assertRunnerAuthMaterial({ required: true, privateKey: 'pem', keyId: 'jobs-2026-09' })).not.toThrow();
        expect(() => assertRunnerAuthMaterial({ required: false })).not.toThrow();
    });
});

describe('unified mint', () => {
    it('prefers a workload task token and a task-bound dispatch token when the jobs private key is set', async () => {
        const { publicKey, privateKey } = generateKeyPairSync('ed25519');
        const pem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
        const raw = Buffer.from(publicKey.export({ format: 'der', type: 'spki' }))
            .subarray(12)
            .toString('base64url');
        mockEnvs.NANGO_INTERNAL_AUTH_SIGNING_KEY = 'sign';
        mockEnvs.NANGO_INTERNAL_AUTH_JOBS_PRIVATE_KEY = pem;
        mockEnvs.NANGO_INTERNAL_AUTH_JOBS_KEY_ID = 'jobs-2026-09';
        const registry = keyRegistryFromPublicKeys([{ kid: 'jobs-2026-09', publicKey: raw }], INTERNAL_SERVICE_ISSUER_JOBS);
        const issuedAt = Math.floor(Date.now() / 1000);

        const taskToken = await mintTaskAuthToken('task-1', {});
        expect(taskToken).toEqual(expect.any(String));
        const taskAuth = await verifyInternalServiceCredential(taskToken!, INTERNAL_SERVICE_AUDIENCE_JOBS, { registry });
        expect(taskAuth).toMatchObject({ kind: 'jwt', sub: taskSubject('task-1'), issuer: INTERNAL_SERVICE_ISSUER_JOBS });

        const dispatch = await mintRunnerDispatchToken({ taskId: 'task-1' });
        expect(dispatch).toEqual(expect.any(String));
        const dispatchAuth = await verifyInternalServiceCredential(dispatch!, INTERNAL_SERVICE_AUDIENCE_RUNNER, { registry });
        expect(dispatchAuth).toMatchObject({ kind: 'jwt', sub: taskSubject('task-1'), issuer: INTERNAL_SERVICE_ISSUER_JOBS });
        const payload = JSON.parse(Buffer.from(dispatch!.split('.')[1] ?? '', 'base64url').toString('utf8')) as { exp: number };
        expect(payload.exp).toBeGreaterThanOrEqual(issuedAt + INTERNAL_SERVICE_TOKEN_TTL_SECS);
        expect(payload.exp).toBeLessThan(issuedAt + INTERNAL_SERVICE_TOKEN_TTL_SECS + 5);
    });
});
