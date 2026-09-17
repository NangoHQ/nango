import { describe, expect, it } from 'vitest';

import { INTERNAL_SERVICE_AUDIENCE_JOBS, INTERNAL_SERVICE_AUDIENCE_RUNNER } from './constants.js';
import { exportRunnerPublicKey, runnerPublicKeyFromEnv } from './ed25519.js';
import { createInternalServiceToken, createRunnerDispatchToken, verifyInternalServiceToken, verifyRunnerDispatchToken } from './token.js';

describe('exportRunnerPublicKey', () => {
    it('returns null when the jobs signing key is unset', () => {
        expect(exportRunnerPublicKey(undefined)).toBeNull();
        expect(exportRunnerPublicKey(null)).toBeNull();
        expect(exportRunnerPublicKey('')).toBeNull();
        expect(exportRunnerPublicKey('   ')).toBeNull();
    });

    it('is deterministic for the same jobs signing key', () => {
        expect(exportRunnerPublicKey('sign')).toBe(exportRunnerPublicKey('sign'));
        expect(exportRunnerPublicKey('sign')).toEqual(expect.any(String));
        expect(exportRunnerPublicKey('sign')).not.toBe('sign');
        expect(exportRunnerPublicKey('sign')).not.toBe(exportRunnerPublicKey('other'));
    });
});

describe('createRunnerDispatchToken', () => {
    it('returns null when the jobs signing key is unset', () => {
        expect(createRunnerDispatchToken({ taskId: 'task-1' }, undefined)).toBeNull();
    });

    it('mints an EdDSA runner-audience token that verifies with the public key', () => {
        const token = createRunnerDispatchToken({ taskId: 'task-1', expiresInSecs: 120 }, 'sign');
        const publicKey = exportRunnerPublicKey('sign');
        expect(token).toEqual(expect.any(String));
        expect(publicKey).toEqual(expect.any(String));
        if (!token || !publicKey) {
            return;
        }
        expect(JSON.parse(Buffer.from(token.split('.')[0] ?? '', 'base64url').toString('utf8'))).toMatchObject({ alg: 'EdDSA' });
        expect(verifyRunnerDispatchToken(token, INTERNAL_SERVICE_AUDIENCE_RUNNER, publicKey)).toMatchObject({
            ok: true,
            kind: 'eddsa',
            op: 'task',
            taskId: 'task-1',
            audience: INTERNAL_SERVICE_AUDIENCE_RUNNER
        });
        expect(verifyRunnerDispatchToken(token, INTERNAL_SERVICE_AUDIENCE_JOBS, publicKey)).toMatchObject({ ok: false, reason: 'wrong_audience' });
        expect(verifyInternalServiceToken(token, INTERNAL_SERVICE_AUDIENCE_RUNNER, 'sign')).toMatchObject({ ok: false });
    });

    it('rejects a non-canonical base64url signature segment', () => {
        const token = createRunnerDispatchToken({ taskId: 'task-1', expiresInSecs: 120 }, 'sign');
        const publicKey = exportRunnerPublicKey('sign');
        expect(token).toEqual(expect.any(String));
        expect(publicKey).toEqual(expect.any(String));
        if (!token || !publicKey) {
            return;
        }
        const [header, payload, signature] = token.split('.');
        expect(header && payload && signature).toBeTruthy();
        if (!header || !payload || !signature) {
            return;
        }

        expect(verifyRunnerDispatchToken(`${header}.${payload}.${signature}!`, INTERNAL_SERVICE_AUDIENCE_RUNNER, publicKey)).toMatchObject({
            ok: false,
            reason: 'bad_signature'
        });
        expect(verifyRunnerDispatchToken(`${header}.${payload}.${signature}=`, INTERNAL_SERVICE_AUDIENCE_RUNNER, publicKey)).toMatchObject({
            ok: false,
            reason: 'bad_signature'
        });

        // Same alphabet, non-zero unused low bits on the last sextet: regex passes, re-encode does not.
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
        const last = signature.at(-1);
        expect(last).toEqual(expect.any(String));
        if (!last) {
            return;
        }
        const idx = alphabet.indexOf(last);
        const mutatedLast = alphabet[(idx & ~3) + ((idx + 1) % 4)];
        const mutated = `${signature.slice(0, -1)}${mutatedLast}`;
        expect(mutated).toMatch(/^[A-Za-z0-9_-]+$/);
        expect(Buffer.from(mutated, 'base64url').toString('base64url')).not.toBe(mutated);
        expect(verifyRunnerDispatchToken(`${header}.${payload}.${mutated}`, INTERNAL_SERVICE_AUDIENCE_RUNNER, publicKey)).toMatchObject({
            ok: false,
            reason: 'bad_signature'
        });
    });

    it('cannot mint a token the runner accepts using only the public key', () => {
        const publicKey = exportRunnerPublicKey('sign');
        expect(publicKey).toEqual(expect.any(String));
        if (!publicKey) {
            return;
        }
        const forgedFromPublicKeyAsMaster = createRunnerDispatchToken({ taskId: 'victim-task', expiresInSecs: 120 }, publicKey);
        expect(forgedFromPublicKeyAsMaster).toEqual(expect.any(String));
        if (!forgedFromPublicKeyAsMaster) {
            return;
        }
        expect(verifyRunnerDispatchToken(forgedFromPublicKeyAsMaster, INTERNAL_SERVICE_AUDIENCE_RUNNER, publicKey)).toMatchObject({
            ok: false,
            reason: 'bad_signature'
        });

        const hmacForged = createInternalServiceToken({ audience: INTERNAL_SERVICE_AUDIENCE_RUNNER, taskId: 'victim-task', expiresInSecs: 120 }, publicKey);
        expect(hmacForged).toEqual(expect.any(String));
        if (!hmacForged) {
            return;
        }
        expect(verifyRunnerDispatchToken(hmacForged, INTERNAL_SERVICE_AUDIENCE_RUNNER, publicKey)).toMatchObject({ ok: false });
    });

    it('cannot construct a private key from runner-held public key material', () => {
        const publicKey = exportRunnerPublicKey('sign');
        expect(publicKey).toEqual(expect.any(String));
        if (!publicKey) {
            return;
        }
        expect(runnerPublicKeyFromEnv(publicKey)?.type).toBe('public');
        expect(exportRunnerPublicKey(publicKey)).not.toBe(exportRunnerPublicKey('sign'));
    });
});
