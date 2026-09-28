import { describe, expect, it } from 'vitest';

import { INTERNAL_SERVICE_AUDIENCE_JOBS, INTERNAL_SERVICE_AUDIENCE_ORCHESTRATOR, INTERNAL_SERVICE_AUDIENCE_RUNNER } from './constants.js';
import { exportRunnerPublicKey } from './ed25519.js';
import { createInternalServiceToken, createRunnerDispatchToken } from './token.js';
import { verifyInternalServiceCredential } from './verify.js';

const signingKey = 'test-signing-key';

describe('verifyInternalServiceCredential', () => {
    it('accepts a static token', async () => {
        const auth = await verifyInternalServiceCredential('shared-secret', INTERNAL_SERVICE_AUDIENCE_ORCHESTRATOR, {
            staticToken: 'shared-secret'
        });
        expect(auth).toEqual({ kind: 'static', subject: 'static', audience: INTERNAL_SERVICE_AUDIENCE_ORCHESTRATOR });
    });

    it('rejects a mismatched static token', async () => {
        const auth = await verifyInternalServiceCredential('wrong', INTERNAL_SERVICE_AUDIENCE_ORCHESTRATOR, {
            staticToken: 'shared-secret'
        });
        expect(auth).toBeNull();
    });

    it('accepts an HMAC task JWT', async () => {
        const token = createInternalServiceToken({ taskId: 'task-1', expiresInSecs: 120 }, signingKey);
        expect(token).toEqual(expect.any(String));
        if (!token) {
            return;
        }
        const auth = await verifyInternalServiceCredential(token, INTERNAL_SERVICE_AUDIENCE_JOBS, { signingKey });
        expect(auth?.kind).toBe('hmac');
        expect(auth?.taskId).toBe('task-1');
    });

    it('does not fall through from a JWT-shaped value to static compare', async () => {
        const jwtShaped = 'aaa.bbb.ccc';
        const auth = await verifyInternalServiceCredential(jwtShaped, INTERNAL_SERVICE_AUDIENCE_ORCHESTRATOR, {
            staticToken: jwtShaped,
            signingKey
        });
        expect(auth).toBeNull();
    });

    it('does not fall through from a JWT when the signing key is unset', async () => {
        const token = createInternalServiceToken({ taskId: 'task-1', expiresInSecs: 120 }, signingKey);
        expect(token).toEqual(expect.any(String));
        if (!token) {
            return;
        }
        const auth = await verifyInternalServiceCredential(token, INTERNAL_SERVICE_AUDIENCE_JOBS, {
            staticToken: token
        });
        expect(auth).toBeNull();
    });

    it('rejects an expired HMAC JWT', async () => {
        const token = createInternalServiceToken({ taskId: 'task-1', expiresInSecs: -1 }, signingKey);
        expect(token).toEqual(expect.any(String));
        if (!token) {
            return;
        }
        const auth = await verifyInternalServiceCredential(token, INTERNAL_SERVICE_AUDIENCE_JOBS, { signingKey });
        expect(auth).toBeNull();
    });

    it('accepts an EdDSA runner dispatch token with the public key and rejects HMAC minting with that public key', async () => {
        const token = createRunnerDispatchToken({ taskId: 'task-1', expiresInSecs: 120 }, signingKey);
        const runnerPublicKey = exportRunnerPublicKey(signingKey);
        expect(token).toEqual(expect.any(String));
        expect(runnerPublicKey).toEqual(expect.any(String));
        if (!token || !runnerPublicKey) {
            return;
        }
        const auth = await verifyInternalServiceCredential(token, INTERNAL_SERVICE_AUDIENCE_RUNNER, { runnerPublicKey });
        expect(auth).toMatchObject({ kind: 'eddsa', op: 'task', taskId: 'task-1', audience: INTERNAL_SERVICE_AUDIENCE_RUNNER });
        expect(await verifyInternalServiceCredential(token, INTERNAL_SERVICE_AUDIENCE_RUNNER, { signingKey })).toBeNull();

        const hmac = createInternalServiceToken({ audience: INTERNAL_SERVICE_AUDIENCE_RUNNER, taskId: 'task-1', expiresInSecs: 120 }, runnerPublicKey);
        expect(hmac).toEqual(expect.any(String));
        if (!hmac) {
            return;
        }
        expect(await verifyInternalServiceCredential(hmac, INTERNAL_SERVICE_AUDIENCE_RUNNER, { runnerPublicKey })).toBeNull();
    });
});
