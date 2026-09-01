import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    exportRunnerPublicKey,
    INTERNAL_SERVICE_AUDIENCE_RUNNER,
    INTERNAL_SERVICE_NODE_TOKEN_EXPIRES_SECS,
    INTERNAL_SERVICE_TOKEN_DEFAULT_EXPIRES_SECS,
    verifyInternalServiceToken,
    verifyRunnerDispatchToken
} from '@nangohq/internal-auth';

import { mintRunnerAuthEnv, mintRunnerDispatchToken, mintTaskAuthToken } from './internal-auth.js';

const { mockEnvs } = vi.hoisted(() => ({
    mockEnvs: {
        NANGO_INTERNAL_AUTH_SIGNING_KEY: undefined as string | undefined,
        NANGO_INTERNAL_AUTH_REQUIRED: false
    }
}));

vi.mock('./env.js', () => ({
    envs: mockEnvs
}));

afterEach(() => {
    mockEnvs.NANGO_INTERNAL_AUTH_SIGNING_KEY = undefined;
    mockEnvs.NANGO_INTERNAL_AUTH_REQUIRED = false;
});

describe('mintTaskAuthToken', () => {
    it('returns null when the signing key is unset', () => {
        expect(mintTaskAuthToken('task-1', {})).toBeNull();
    });

    it('mints a jobs-audience token when the signing key is set', () => {
        mockEnvs.NANGO_INTERNAL_AUTH_SIGNING_KEY = 'sign';
        const issuedAt = Math.floor(Date.now() / 1000);
        const token = mintTaskAuthToken('task-1', {});
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

    it('uses killAfterMs plus a buffer when lifecycle is set', () => {
        mockEnvs.NANGO_INTERNAL_AUTH_SIGNING_KEY = 'sign';
        const issuedAt = Math.floor(Date.now() / 1000);
        const token = mintTaskAuthToken('task-1', { lifecycle: { killAfterMs: 5_000, interruptAfterMs: 1_000 } });
        if (!token) {
            throw new Error('expected a token');
        }
        const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as { exp: number };
        expect(payload.exp).toBeGreaterThanOrEqual(issuedAt + 60);
        expect(payload.exp).toBeLessThan(issuedAt + INTERNAL_SERVICE_TOKEN_DEFAULT_EXPIRES_SECS);
    });

    it('uses the bounded expiry when killAfterMs is 0', () => {
        mockEnvs.NANGO_INTERNAL_AUTH_SIGNING_KEY = 'sign';
        const issuedAt = Math.floor(Date.now() / 1000);
        const token = mintTaskAuthToken('task-1', { lifecycle: { killAfterMs: 0, interruptAfterMs: 0 } });
        if (!token) {
            throw new Error('expected a token');
        }
        const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as { exp: number };
        expect(payload.exp).toBeGreaterThanOrEqual(issuedAt + 60);
        expect(payload.exp).toBeLessThan(issuedAt + 65);
    });
});

describe('mintRunnerDispatchToken', () => {
    it('returns null when the signing key is unset', () => {
        expect(mintRunnerDispatchToken({ taskId: 'task-1' })).toBeNull();
    });

    it('mints a runner-audience EdDSA token that verifies with the public key, not the jobs master', () => {
        mockEnvs.NANGO_INTERNAL_AUTH_SIGNING_KEY = 'sign';
        const token = mintRunnerDispatchToken({ taskId: 'task-1' });
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
    it('returns nothing when the signing key is unset', () => {
        expect(mintRunnerAuthEnv(7)).toEqual({});
    });

    it('injects a node-bound jobs JWT and the Ed25519 public key, never a minting secret', () => {
        mockEnvs.NANGO_INTERNAL_AUTH_SIGNING_KEY = 'sign';
        mockEnvs.NANGO_INTERNAL_AUTH_REQUIRED = true;
        const issuedAt = Math.floor(Date.now() / 1000);
        const env = mintRunnerAuthEnv(7);
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
});
