import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    INTERNAL_SERVICE_IDLE_TOKEN_EXPIRES_SECS,
    INTERNAL_SERVICE_REGISTER_TOKEN_EXPIRES_SECS,
    INTERNAL_SERVICE_TOKEN_DEFAULT_EXPIRES_SECS,
    verifyInternalServiceToken
} from '@nangohq/internal-auth';

import { mintRunnerAuthEnv, mintTaskAuthToken } from './internal-auth.js';

const { mockEnvs } = vi.hoisted(() => ({
    mockEnvs: {
        NANGO_INTERNAL_AUTH_SIGNING_KEY: undefined as string | undefined
    }
}));

vi.mock('./env.js', () => ({
    envs: mockEnvs
}));

afterEach(() => {
    mockEnvs.NANGO_INTERNAL_AUTH_SIGNING_KEY = undefined;
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

describe('mintRunnerAuthEnv', () => {
    it('returns nothing when the signing key is unset', () => {
        expect(mintRunnerAuthEnv(7)).toEqual({});
    });

    it('mints node-bound register and idle tokens when the signing key is set', () => {
        mockEnvs.NANGO_INTERNAL_AUTH_SIGNING_KEY = 'sign';
        const issuedAt = Math.floor(Date.now() / 1000);
        const env = mintRunnerAuthEnv(7);
        expect(Object.keys(env).sort()).toEqual(['NANGO_INTERNAL_AUTH_IDLE_TOKEN', 'NANGO_INTERNAL_AUTH_REGISTER_TOKEN']);

        const register = verifyInternalServiceToken(env['NANGO_INTERNAL_AUTH_REGISTER_TOKEN']!, 'jobs', 'sign');
        expect(register).toMatchObject({ kind: 'hmac', op: 'register', nodeId: '7', audience: 'jobs' });
        const idle = verifyInternalServiceToken(env['NANGO_INTERNAL_AUTH_IDLE_TOKEN']!, 'jobs', 'sign');
        expect(idle).toMatchObject({ kind: 'hmac', op: 'idle', nodeId: '7', audience: 'jobs' });

        const registerPayload = JSON.parse(Buffer.from(env['NANGO_INTERNAL_AUTH_REGISTER_TOKEN']!.split('.')[1] ?? '', 'base64url').toString('utf8')) as {
            exp: number;
        };
        expect(registerPayload.exp).toBeGreaterThanOrEqual(issuedAt + INTERNAL_SERVICE_REGISTER_TOKEN_EXPIRES_SECS);
        expect(registerPayload.exp).toBeLessThan(issuedAt + INTERNAL_SERVICE_REGISTER_TOKEN_EXPIRES_SECS + 5);

        const idlePayload = JSON.parse(Buffer.from(env['NANGO_INTERNAL_AUTH_IDLE_TOKEN']!.split('.')[1] ?? '', 'base64url').toString('utf8')) as {
            exp: number;
        };
        expect(idlePayload.exp).toBeGreaterThanOrEqual(issuedAt + INTERNAL_SERVICE_IDLE_TOKEN_EXPIRES_SECS);
        expect(idlePayload.exp).toBeLessThan(issuedAt + INTERNAL_SERVICE_IDLE_TOKEN_EXPIRES_SECS + 5);
    });
});
