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

import { mintRunnerAuthEnv, mintRunnerDispatchToken, mintTaskAuthToken } from './internal-auth.js';

const { mockEnvs } = vi.hoisted(() => ({
    mockEnvs: {
        NANGO_INTERNAL_AUTH_SIGNING_KEY: undefined as string | undefined,
        NANGO_INTERNAL_AUTH_REQUIRED: false,
        NANGO_INTERNAL_AUTH_JOBS_PRIVATE_KEY: undefined as string | undefined,
        NANGO_INTERNAL_AUTH_JOBS_KEY_ID: undefined as string | undefined,
        NANGO_INTERNAL_AUTH_JOBS_PUBLIC_KEYS: undefined as string | undefined
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
});

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
        mockEnvs.NANGO_INTERNAL_AUTH_JOBS_PUBLIC_KEYS = `jobs-2026-09:${raw}`;
        mockEnvs.NANGO_INTERNAL_AUTH_REQUIRED = true;

        const env = await mintRunnerAuthEnv(7);
        expect(env['NANGO_INTERNAL_AUTH_JOBS_PUBLIC_KEYS']).toBe(`jobs-2026-09:${raw}`);
        expect(env['NANGO_INTERNAL_AUTH_RUNNER_PUBLIC_KEY']).toBe(exportRunnerPublicKey('sign'));
        expect(env).not.toHaveProperty('NANGO_INTERNAL_AUTH_JOBS_PRIVATE_KEY');
        expect(env).not.toHaveProperty('NANGO_INTERNAL_AUTH_JOBS_KEY_ID');
        expect(env).not.toHaveProperty('NANGO_INTERNAL_AUTH_SIGNING_KEY');

        const registry = keyRegistryFromPublicKeys(env['NANGO_INTERNAL_AUTH_JOBS_PUBLIC_KEYS'], INTERNAL_SERVICE_ISSUER_JOBS);
        const auth = await verifyInternalServiceCredential(env['NANGO_INTERNAL_AUTH_RUNNER_NODE_TOKEN']!, INTERNAL_SERVICE_AUDIENCE_JOBS, { registry });
        expect(auth).toMatchObject({ kind: 'jwt', sub: nodeSubject('7'), issuer: INTERNAL_SERVICE_ISSUER_JOBS });
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
        const registry = keyRegistryFromPublicKeys(`jobs-2026-09:${raw}`, INTERNAL_SERVICE_ISSUER_JOBS);
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
