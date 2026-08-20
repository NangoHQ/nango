import { describe, expect, it } from 'vitest';

import { INTERNAL_SERVICE_AUDIENCE_JOBS, INTERNAL_SERVICE_TOKEN_ISSUER } from './constants.js';
import { createInternalServiceToken, isJwtShape, verifyInternalServiceToken } from './token.js';

const env = { NANGO_INTERNAL_AUTH_SIGNING_KEY: 'test-signing-key' };

describe('createInternalServiceToken', () => {
    it('returns null when the signing key is unset', () => {
        expect(createInternalServiceToken({ taskId: 'task-1' }, {})).toBeNull();
    });

    it('mints a JWT with iss, aud, op, and task_id', () => {
        const token = createInternalServiceToken({ taskId: 'task-1', issuedAt: 1_700_000_000, expiresInSecs: 60 }, env);
        expect(token).toBeTruthy();
        expect(isJwtShape(token!)).toBe(true);

        const payload = JSON.parse(Buffer.from(token!.split('.')[1]!, 'base64url').toString('utf8')) as Record<string, unknown>;
        expect(payload['iss']).toBe(INTERNAL_SERVICE_TOKEN_ISSUER);
        expect(payload['aud']).toBe(INTERNAL_SERVICE_AUDIENCE_JOBS);
        expect(payload['op']).toBe('task');
        expect(payload['task_id']).toBe('task-1');
        expect(payload['exp']).toBe(1_700_000_060);
    });

    it('mints a register JWT with node_id', () => {
        const token = createInternalServiceToken({ op: 'register', nodeId: '7', issuedAt: 1_700_000_000, expiresInSecs: 3600 }, env);
        const payload = JSON.parse(Buffer.from(token!.split('.')[1]!, 'base64url').toString('utf8')) as Record<string, unknown>;
        expect(payload['op']).toBe('register');
        expect(payload['node_id']).toBe('7');
        expect(payload['task_id']).toBeUndefined();
        expect(payload['exp']).toBe(1_700_003_600);
    });

    it('mints an idle JWT with node_id', () => {
        const token = createInternalServiceToken({ op: 'idle', nodeId: '7', issuedAt: 1_700_000_000, expiresInSecs: 120 }, env);
        const payload = JSON.parse(Buffer.from(token!.split('.')[1]!, 'base64url').toString('utf8')) as Record<string, unknown>;
        expect(payload['op']).toBe('idle');
        expect(payload['node_id']).toBe('7');
        expect(payload['task_id']).toBeUndefined();
    });
});

describe('verifyInternalServiceToken', () => {
    it('accepts a task token minted with the same key and audience', () => {
        const token = createInternalServiceToken({ taskId: 'task-1', expiresInSecs: 120 }, env);
        const auth = verifyInternalServiceToken(token!, INTERNAL_SERVICE_AUDIENCE_JOBS, env);
        expect(auth).toEqual({
            kind: 'hmac',
            subject: INTERNAL_SERVICE_TOKEN_ISSUER,
            audience: INTERNAL_SERVICE_AUDIENCE_JOBS,
            op: 'task',
            taskId: 'task-1'
        });
    });

    it('accepts a register token minted with the same key and audience', () => {
        const token = createInternalServiceToken({ op: 'register', nodeId: '7', expiresInSecs: 120 }, env);
        const auth = verifyInternalServiceToken(token!, INTERNAL_SERVICE_AUDIENCE_JOBS, env);
        expect(auth).toEqual({
            kind: 'hmac',
            subject: INTERNAL_SERVICE_TOKEN_ISSUER,
            audience: INTERNAL_SERVICE_AUDIENCE_JOBS,
            op: 'register',
            nodeId: '7'
        });
    });

    it('rejects a token for a different audience', () => {
        const token = createInternalServiceToken({ taskId: 'task-1', expiresInSecs: 120 }, env);
        expect(verifyInternalServiceToken(token!, 'orchestrator', env)).toBeNull();
    });

    it('rejects an expired token', () => {
        const token = createInternalServiceToken({ taskId: 'task-1', issuedAt: 1_000, expiresInSecs: 1 }, env);
        expect(verifyInternalServiceToken(token!, INTERNAL_SERVICE_AUDIENCE_JOBS, env)).toBeNull();
    });

    it('rejects a token signed with a different key', () => {
        const token = createInternalServiceToken({ taskId: 'task-1', expiresInSecs: 120 }, env);
        expect(verifyInternalServiceToken(token!, INTERNAL_SERVICE_AUDIENCE_JOBS, { NANGO_INTERNAL_AUTH_SIGNING_KEY: 'other' })).toBeNull();
    });

    it('returns null when the signing key is unset', () => {
        const token = createInternalServiceToken({ taskId: 'task-1', expiresInSecs: 120 }, env);
        expect(verifyInternalServiceToken(token!, INTERNAL_SERVICE_AUDIENCE_JOBS, {})).toBeNull();
    });
});
