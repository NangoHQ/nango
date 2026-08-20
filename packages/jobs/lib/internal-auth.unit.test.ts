import { afterEach, describe, expect, it } from 'vitest';

import { INTERNAL_SERVICE_TOKEN_DEFAULT_EXPIRES_SECS, verifyInternalServiceToken } from '@nangohq/utils';

import { mintTaskAuthToken } from './internal-auth.js';

const originalEnv = { ...process.env };

afterEach(() => {
    process.env = { ...originalEnv };
});

describe('mintTaskAuthToken', () => {
    it('returns null when the signing key is unset', () => {
        delete process.env['NANGO_INTERNAL_AUTH_SIGNING_KEY'];
        expect(mintTaskAuthToken('task-1', {})).toBeNull();
    });

    it('mints a jobs-audience token when the signing key is set', () => {
        process.env['NANGO_INTERNAL_AUTH_SIGNING_KEY'] = 'sign';
        const issuedAt = Math.floor(Date.now() / 1000);
        const token = mintTaskAuthToken('task-1', {});
        expect(token).toBeTruthy();
        if (!token) {
            return;
        }
        const auth = verifyInternalServiceToken(token, 'jobs', { NANGO_INTERNAL_AUTH_SIGNING_KEY: 'sign' });
        expect(auth).toMatchObject({ kind: 'hmac', taskId: 'task-1', audience: 'jobs' });
        const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as { exp: number };
        expect(payload.exp).toBeGreaterThanOrEqual(issuedAt + INTERNAL_SERVICE_TOKEN_DEFAULT_EXPIRES_SECS);
        expect(payload.exp).toBeLessThan(issuedAt + INTERNAL_SERVICE_TOKEN_DEFAULT_EXPIRES_SECS + 5);
    });

    it('uses killAfterMs plus a buffer when lifecycle is set', () => {
        process.env['NANGO_INTERNAL_AUTH_SIGNING_KEY'] = 'sign';
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
        process.env['NANGO_INTERNAL_AUTH_SIGNING_KEY'] = 'sign';
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
