import { describe, expect, it } from 'vitest';

import { INTERNAL_SERVICE_AUDIENCE_JOBS, INTERNAL_SERVICE_AUDIENCE_RUNNER, INTERNAL_SERVICE_TOKEN_ISSUER } from './constants.js';
import { createInternalServiceToken, isJwtShape, verifyInternalServiceToken } from './token.js';

const signingKey = 'test-signing-key';

describe('createInternalServiceToken', () => {
    it('returns null when the signing key is unset', () => {
        expect(createInternalServiceToken({ taskId: 'task-1' }, undefined)).toBeNull();
    });

    it('mints a JWT with iss, aud, op, and task_id', () => {
        const token = createInternalServiceToken({ taskId: 'task-1', issuedAt: 1_700_000_000, expiresInSecs: 60 }, signingKey);
        expect(token).toBeTruthy();
        expect(isJwtShape(token!)).toBe(true);

        const payload = JSON.parse(Buffer.from(token!.split('.')[1]!, 'base64url').toString('utf8')) as Record<string, unknown>;
        expect(payload['iss']).toBe(INTERNAL_SERVICE_TOKEN_ISSUER);
        expect(payload['aud']).toBe(INTERNAL_SERVICE_AUDIENCE_JOBS);
        expect(payload['op']).toBe('task');
        expect(payload['task_id']).toBe('task-1');
        expect(payload['exp']).toBe(1_700_000_060);
    });

    it('mints a node JWT with node_id', () => {
        const token = createInternalServiceToken({ op: 'node', nodeId: '7', issuedAt: 1_700_000_000, expiresInSecs: 3600 }, signingKey);
        const payload = JSON.parse(Buffer.from(token!.split('.')[1]!, 'base64url').toString('utf8')) as Record<string, unknown>;
        expect(payload['op']).toBe('node');
        expect(payload['node_id']).toBe('7');
        expect(payload['task_id']).toBeUndefined();
        expect(payload['exp']).toBe(1_700_003_600);
    });
});

describe('verifyInternalServiceToken', () => {
    it('accepts a runner-audience task token minted with the same key', () => {
        const token = createInternalServiceToken({ taskId: 'task-1', audience: INTERNAL_SERVICE_AUDIENCE_RUNNER, expiresInSecs: 120 }, signingKey);
        const result = verifyInternalServiceToken(token!, INTERNAL_SERVICE_AUDIENCE_RUNNER, signingKey);
        expect(result).toMatchObject({
            ok: true,
            kind: 'hmac',
            audience: INTERNAL_SERVICE_AUDIENCE_RUNNER,
            op: 'task',
            taskId: 'task-1'
        });
        expect(verifyInternalServiceToken(token!, INTERNAL_SERVICE_AUDIENCE_JOBS, signingKey)).toEqual({ ok: false, reason: 'wrong_audience' });
    });

    it('accepts a task token minted with the same key and audience', () => {
        const token = createInternalServiceToken({ taskId: 'task-1', expiresInSecs: 120 }, signingKey);
        const result = verifyInternalServiceToken(token!, INTERNAL_SERVICE_AUDIENCE_JOBS, signingKey);
        expect(result).toEqual({
            ok: true,
            kind: 'hmac',
            subject: INTERNAL_SERVICE_TOKEN_ISSUER,
            audience: INTERNAL_SERVICE_AUDIENCE_JOBS,
            op: 'task',
            taskId: 'task-1'
        });
    });

    it('accepts a node token minted with the same key and audience', () => {
        const token = createInternalServiceToken({ op: 'node', nodeId: '7', expiresInSecs: 120 }, signingKey);
        const result = verifyInternalServiceToken(token!, INTERNAL_SERVICE_AUDIENCE_JOBS, signingKey);
        expect(result).toEqual({
            ok: true,
            kind: 'hmac',
            subject: INTERNAL_SERVICE_TOKEN_ISSUER,
            audience: INTERNAL_SERVICE_AUDIENCE_JOBS,
            op: 'node',
            nodeId: '7'
        });
    });

    it('rejects a token for a different audience', () => {
        const token = createInternalServiceToken({ taskId: 'task-1', expiresInSecs: 120 }, signingKey);
        expect(verifyInternalServiceToken(token!, 'orchestrator', signingKey)).toEqual({ ok: false, reason: 'wrong_audience' });
    });

    it('rejects an expired token', () => {
        const token = createInternalServiceToken({ taskId: 'task-1', issuedAt: 1_000, expiresInSecs: 1 }, signingKey);
        expect(verifyInternalServiceToken(token!, INTERNAL_SERVICE_AUDIENCE_JOBS, signingKey)).toEqual({ ok: false, reason: 'expired' });
    });

    it('rejects a token signed with a different key', () => {
        const token = createInternalServiceToken({ taskId: 'task-1', expiresInSecs: 120 }, signingKey);
        expect(verifyInternalServiceToken(token!, INTERNAL_SERVICE_AUDIENCE_JOBS, 'other')).toEqual({
            ok: false,
            reason: 'bad_signature'
        });
    });

    it('returns no_signing_key when the signing key is unset', () => {
        const token = createInternalServiceToken({ taskId: 'task-1', expiresInSecs: 120 }, signingKey);
        expect(verifyInternalServiceToken(token!, INTERNAL_SERVICE_AUDIENCE_JOBS, undefined)).toEqual({ ok: false, reason: 'no_signing_key' });
    });

    it('returns not_jwt when the token is not JWT-shaped', () => {
        expect(verifyInternalServiceToken('shared-secret', INTERNAL_SERVICE_AUDIENCE_JOBS, signingKey)).toEqual({ ok: false, reason: 'not_jwt' });
    });

    it('returns malformed_claims when required claims are missing', () => {
        const token = createInternalServiceToken({ op: 'node', nodeId: '', expiresInSecs: 120 }, signingKey);
        expect(verifyInternalServiceToken(token!, INTERNAL_SERVICE_AUDIENCE_JOBS, signingKey)).toEqual({ ok: false, reason: 'malformed_claims' });
    });
});
