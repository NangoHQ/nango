import { generateKeyPairSync } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    exportRunnerPublicKey,
    INTERNAL_SERVICE_AUDIENCE_JOBS,
    INTERNAL_SERVICE_AUDIENCE_RUNNER,
    INTERNAL_SERVICE_ISSUER_JOBS,
    INTERNAL_SERVICE_NODE_TOKEN_EXPIRES_SECS,
    INTERNAL_SERVICE_TOKEN_DEFAULT_EXPIRES_SECS,
    INTERNAL_SERVICE_TOKEN_TTL_SECS,
    keyRegistryFromPublicKeys,
    nodeSubject,
    taskSubject,
    verifyInternalServiceCredential,
    verifyInternalServiceToken,
    verifyRunnerDispatchToken
} from '@nangohq/internal-auth';

import { assertRunnerAuthMaterial, mintRunnerAuthEnv, mintRunnerDispatchToken, runnerAuth } from './internal-auth.js';

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

describe('runnerAuth', () => {
    it('returns no token when nothing is configured', async () => {
        const auth = await runnerAuth('task-1', {} as NangoProps);
        expect(auth.internalAuthToken).toBeUndefined();
        expect(auth.nangoProps.taskAuthToken).toBeUndefined();
    });

    it('mints a jobs-audience token when the signing key is set', async () => {
        mockEnvs.NANGO_INTERNAL_AUTH_SIGNING_KEY = 'sign';
        const issuedAt = Math.floor(Date.now() / 1000);
        const { internalAuthToken, nangoProps } = await runnerAuth('task-1', {} as NangoProps);
        expect(internalAuthToken).toEqual(expect.any(String));
        expect(nangoProps.taskAuthToken).toBeUndefined();
        const auth = verifyInternalServiceToken(internalAuthToken!, 'jobs', 'sign');
        expect(auth).toMatchObject({ kind: 'hmac', op: 'task', taskId: 'task-1', audience: 'jobs' });
        const payload = JSON.parse(Buffer.from(internalAuthToken!.split('.')[1] ?? '', 'base64url').toString('utf8')) as { exp: number };
        expect(payload.exp).toBeGreaterThanOrEqual(issuedAt + INTERNAL_SERVICE_TOKEN_DEFAULT_EXPIRES_SECS);
        expect(payload.exp).toBeLessThan(issuedAt + INTERNAL_SERVICE_TOKEN_DEFAULT_EXPIRES_SECS + 5);
    });

    it('uses killAfterMs plus a buffer when lifecycle is set', async () => {
        mockEnvs.NANGO_INTERNAL_AUTH_SIGNING_KEY = 'sign';
        const issuedAt = Math.floor(Date.now() / 1000);
        const { internalAuthToken } = await runnerAuth('task-1', { lifecycle: { killAfterMs: 5_000, interruptAfterMs: 1_000 } } as NangoProps);
        if (!internalAuthToken) {
            throw new Error('expected a token');
        }
        const payload = JSON.parse(Buffer.from(internalAuthToken.split('.')[1] ?? '', 'base64url').toString('utf8')) as { exp: number };
        expect(payload.exp).toBeGreaterThanOrEqual(issuedAt + 60);
        expect(payload.exp).toBeLessThan(issuedAt + INTERNAL_SERVICE_TOKEN_DEFAULT_EXPIRES_SECS);
    });

    it('uses the bounded expiry when killAfterMs is 0', async () => {
        mockEnvs.NANGO_INTERNAL_AUTH_SIGNING_KEY = 'sign';
        const issuedAt = Math.floor(Date.now() / 1000);
        const { internalAuthToken } = await runnerAuth('task-1', { lifecycle: { killAfterMs: 0, interruptAfterMs: 0 } } as NangoProps);
        if (!internalAuthToken) {
            throw new Error('expected a token');
        }
        const payload = JSON.parse(Buffer.from(internalAuthToken.split('.')[1] ?? '', 'base64url').toString('utf8')) as { exp: number };
        expect(payload.exp).toBeGreaterThanOrEqual(issuedAt + 60);
        expect(payload.exp).toBeLessThan(issuedAt + 65);
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

        const { internalAuthToken: taskToken } = await runnerAuth('task-1', {} as NangoProps);
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

    it('adds a scoped capability token and keeps secretKey until omit is enabled', async () => {
        const { publicKey, privateKey } = generateKeyPairSync('ed25519');
        const pem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
        const raw = Buffer.from(publicKey.export({ format: 'der', type: 'spki' }))
            .subarray(12)
            .toString('base64url');
        mockEnvs.NANGO_INTERNAL_AUTH_JOBS_PRIVATE_KEY = pem;
        mockEnvs.NANGO_INTERNAL_AUTH_JOBS_KEY_ID = 'jobs-2026-09';
        const registry = keyRegistryFromPublicKeys([{ kid: 'jobs-2026-09', publicKey: raw }], INTERNAL_SERVICE_ISSUER_JOBS);
        const props = {
            secretKey: 'environment-secret',
            scriptType: 'sync',
            environmentId: 9,
            nangoConnectionId: 3,
            syncId: 'sync-1'
        } as NangoProps;

        const { nangoProps: dispatched, internalAuthToken } = await runnerAuth('task-1', props);

        expect(dispatched.secretKey).toBe('environment-secret');
        expect(internalAuthToken).toEqual(expect.any(String));
        expect(dispatched.taskAuthToken).toBe(internalAuthToken);
        const auth = await verifyInternalServiceCredential(dispatched.taskAuthToken!, 'persist', { registry });
        expect(auth).toMatchObject({
            kind: 'jwt',
            sub: taskSubject('task-1'),
            res: { environmentId: 9, connectionId: 3, syncId: 'sync-1' },
            scopes: expect.arrayContaining(['persist:records', 'jobs:heartbeat'])
        });
    });

    it('omits secretKey when NANGO_INTERNAL_AUTH_OMIT_SECRET_KEY is set', async () => {
        const { privateKey } = generateKeyPairSync('ed25519');
        const pem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
        mockEnvs.NANGO_INTERNAL_AUTH_JOBS_PRIVATE_KEY = pem;
        mockEnvs.NANGO_INTERNAL_AUTH_JOBS_KEY_ID = 'jobs-2026-09';
        mockEnvs.NANGO_INTERNAL_AUTH_OMIT_SECRET_KEY = true;
        const props = { secretKey: 'environment-secret', scriptType: 'sync', environmentId: 9 } as NangoProps;

        const { nangoProps: dispatched, internalAuthToken } = await runnerAuth('task-1', props);

        expect(dispatched.secretKey).toBeUndefined();
        expect(internalAuthToken).toEqual(expect.any(String));
        expect(dispatched.taskAuthToken).toBe(internalAuthToken);
    });

    it('keeps secretKey when no capability token can be minted', async () => {
        mockEnvs.NANGO_INTERNAL_AUTH_SIGNING_KEY = 'sign';
        const props = { secretKey: 'environment-secret', scriptType: 'sync' } as NangoProps;
        const { nangoProps: dispatched, internalAuthToken } = await runnerAuth('task-1', props);
        expect(dispatched.secretKey).toBe('environment-secret');
        expect(dispatched.taskAuthToken).toBeUndefined();
        expect(internalAuthToken).toEqual(expect.any(String));
    });
});
