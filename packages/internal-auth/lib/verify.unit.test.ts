import { describe, expect, it } from 'vitest';

import { INTERNAL_SERVICE_AUDIENCE_JOBS, INTERNAL_SERVICE_AUDIENCE_ORCHESTRATOR } from './constants.js';
import { createInternalServiceToken } from './token.js';
import { verifyInternalServiceCredential } from './verify.js';

const signingKey = 'test-signing-key';

describe('verifyInternalServiceCredential', () => {
    it('accepts a static token', () => {
        const auth = verifyInternalServiceCredential('shared-secret', INTERNAL_SERVICE_AUDIENCE_ORCHESTRATOR, {
            staticToken: 'shared-secret'
        });
        expect(auth).toEqual({ kind: 'static', subject: 'static', audience: INTERNAL_SERVICE_AUDIENCE_ORCHESTRATOR });
    });

    it('rejects a mismatched static token', () => {
        const auth = verifyInternalServiceCredential('wrong', INTERNAL_SERVICE_AUDIENCE_ORCHESTRATOR, {
            staticToken: 'shared-secret'
        });
        expect(auth).toBeNull();
    });

    it('accepts an HMAC task JWT', () => {
        const token = createInternalServiceToken({ taskId: 'task-1', expiresInSecs: 120 }, signingKey);
        expect(token).toEqual(expect.any(String));
        if (!token) {
            return;
        }
        const auth = verifyInternalServiceCredential(token, INTERNAL_SERVICE_AUDIENCE_JOBS, { signingKey });
        expect(auth?.kind).toBe('hmac');
        expect(auth?.taskId).toBe('task-1');
    });

    it('does not fall through from a JWT-shaped value to static compare', () => {
        const jwtShaped = 'aaa.bbb.ccc';
        const auth = verifyInternalServiceCredential(jwtShaped, INTERNAL_SERVICE_AUDIENCE_ORCHESTRATOR, {
            staticToken: jwtShaped,
            signingKey
        });
        expect(auth).toBeNull();
    });

    it('does not fall through from a JWT when the signing key is unset', () => {
        const token = createInternalServiceToken({ taskId: 'task-1', expiresInSecs: 120 }, signingKey);
        expect(token).toEqual(expect.any(String));
        if (!token) {
            return;
        }
        const auth = verifyInternalServiceCredential(token, INTERNAL_SERVICE_AUDIENCE_JOBS, {
            staticToken: token
        });
        expect(auth).toBeNull();
    });

    it('rejects an expired HMAC JWT', () => {
        const token = createInternalServiceToken({ taskId: 'task-1', expiresInSecs: -1 }, signingKey);
        expect(token).toEqual(expect.any(String));
        if (!token) {
            return;
        }
        const auth = verifyInternalServiceCredential(token, INTERNAL_SERVICE_AUDIENCE_JOBS, { signingKey });
        expect(auth).toBeNull();
    });
});
