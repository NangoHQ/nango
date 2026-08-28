import { describe, expect, it } from 'vitest';

import { INTERNAL_SERVICE_AUDIENCE_JOBS, INTERNAL_SERVICE_AUDIENCE_RUNNER } from './constants.js';
import { deriveRunnerSigningKey, getInternalAuthBearerHeaderIfPresent } from './credential.js';
import { createInternalServiceToken, verifyInternalServiceToken } from './token.js';

describe('deriveRunnerSigningKey', () => {
    it('returns null when the jobs signing key is unset', () => {
        expect(deriveRunnerSigningKey(undefined)).toBeNull();
        expect(deriveRunnerSigningKey(null)).toBeNull();
        expect(deriveRunnerSigningKey('')).toBeNull();
        expect(deriveRunnerSigningKey('   ')).toBeNull();
    });

    it('is deterministic for the same jobs signing key', () => {
        expect(deriveRunnerSigningKey('sign')).toBe(deriveRunnerSigningKey('sign'));
        expect(deriveRunnerSigningKey('sign')).toEqual(expect.any(String));
        expect(deriveRunnerSigningKey('sign')).not.toBe('sign');
    });

    it('cannot verify a master-signed jobs JWT', () => {
        const derived = deriveRunnerSigningKey('sign');
        const token = createInternalServiceToken({ taskId: 'task-1', expiresInSecs: 120 }, 'sign');
        expect(token).toEqual(expect.any(String));
        if (!token || !derived) {
            return;
        }
        expect(verifyInternalServiceToken(token, INTERNAL_SERVICE_AUDIENCE_JOBS, derived)).toMatchObject({ ok: false });
        expect(verifyInternalServiceToken(token, INTERNAL_SERVICE_AUDIENCE_RUNNER, derived)).toMatchObject({ ok: false });
    });
});

describe('getInternalAuthBearerHeaderIfPresent', () => {
    it('omits the header when there is no token', () => {
        expect(getInternalAuthBearerHeaderIfPresent(null)).toEqual({});
        expect(getInternalAuthBearerHeaderIfPresent(undefined)).toEqual({});
        expect(getInternalAuthBearerHeaderIfPresent('')).toEqual({});
    });

    it('sets Authorization when a token is present', () => {
        expect(getInternalAuthBearerHeaderIfPresent('abc')).toEqual({ Authorization: 'Bearer abc' });
    });
});
