import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { flags } from '@nangohq/utils';

import { recordMock } from '../middleware/audit/testing.js';
import { connectionCreatedActor, noteConnectionUpsert, oauthAuthType, recordConnectionCreated } from './auditConnection.js';

import type { Request } from 'express';

vi.mock('../audit.js', async (importOriginal) => (await import('../middleware/audit/testing.js')).auditModuleMock(importOriginal as never));

describe('recordConnectionCreated (hook-side emitter, unit)', () => {
    const params = {
        connectionId: 'conn-42',
        providerConfigKey: 'algolia-prod',
        operation: 'creation' as const,
        account: { id: 42, uuid: 'acc-uuid' },
        environment: { id: 9, uuid: 'e0000000-0000-4000-8000-000000000001', name: 'dev' },
        auditAttribution: { kind: 'no-attribution', reason: 'no request' } as const
    };

    beforeEach(() => {
        recordMock.mockReset().mockResolvedValue(undefined);
        flags.hasAuditTrail = true;
    });

    afterEach(() => {
        flags.hasAuditTrail = false;
    });

    it('records the threaded actor + context, connection target and creation metadata', async () => {
        await recordConnectionCreated({
            ...params,
            auditAttribution: {
                kind: 'request' as const,
                actor: { type: 'api_key', id: '5', display: 'ci-key' },
                context: { ip: '203.0.113.7', userAgent: 'vitest' }
            }
        });
        expect(recordMock).toHaveBeenCalledTimes(1);
        expect(recordMock.mock.calls[0]?.[0]).toMatchObject({
            resource: 'connection',
            action: 'created',
            outcome: 'success',
            accountId: 42,
            environment: { id: 'e0000000-0000-4000-8000-000000000001', display: 'dev' },
            actor: { type: 'api_key', id: '5', display: 'ci-key' },
            targets: [{ type: 'connection', id: 'conn-42' }],
            context: { ip: '203.0.113.7', userAgent: 'vitest' }
        });
        expect(recordMock.mock.calls[0]?.[0].metadata).toEqual({ providerConfigKey: 'algolia-prod' });
    });

    it('names nobody when no request is behind the creation', async () => {
        await recordConnectionCreated(params);
        expect(recordMock).toHaveBeenCalledTimes(1);
        expect(recordMock.mock.calls[0]?.[0]).toMatchObject({
            resource: 'connection',
            action: 'created',
            accountId: 42,
            environment: { id: 'e0000000-0000-4000-8000-000000000001', display: 'dev' },
            actor: { type: 'unknown', id: 'unknown', display: 'unknown' },
            context: {},
            targets: [{ type: 'connection', id: 'conn-42' }]
        });
    });

    it('attributes the end user when the request identified no caller, as on the OAuth callback', async () => {
        await recordConnectionCreated({
            ...params,
            endUser: { endUserId: 'customer-user-1', email: 'buyer@customer.com', tags: null },
            auditAttribution: {
                kind: 'request' as const,
                actor: { type: 'unknown', id: 'unknown', display: 'unknown' },
                context: { ip: '203.0.113.7', userAgent: 'chrome' }
            }
        });
        expect(recordMock.mock.calls[0]?.[0]).toMatchObject({
            accountId: 42,
            environment: { id: 'e0000000-0000-4000-8000-000000000001', display: 'dev' },
            actor: { type: 'connect_session', id: 'customer-user-1', display: 'buyer@customer.com' },
            context: { ip: '203.0.113.7', userAgent: 'chrome' }
        });
    });

    it('records the end user without a display when the customer gave us no email', async () => {
        await recordConnectionCreated({
            ...params,
            endUser: { endUserId: 'customer-user-2', email: null, tags: null },
            auditAttribution: { kind: 'request' as const, actor: { type: 'unknown', id: 'unknown', display: 'unknown' }, context: {} }
        });
        expect(recordMock.mock.calls[0]?.[0].actor).toEqual({ type: 'connect_session', id: 'customer-user-2' });
    });

    it('keeps the caller the request identified over the end user attached to the connection', async () => {
        await recordConnectionCreated({
            ...params,
            endUser: { endUserId: 'customer-user-1', email: 'buyer@customer.com', tags: null },
            auditAttribution: { kind: 'request' as const, actor: { type: 'api_key', id: '5', display: 'ci-key' }, context: {} }
        });
        expect(recordMock.mock.calls[0]?.[0]).toMatchObject({ actor: { type: 'api_key', id: '5', display: 'ci-key' } });
    });

    it('stays unknown when neither the request nor the connection names anyone', async () => {
        await recordConnectionCreated({
            ...params,
            auditAttribution: { kind: 'request' as const, actor: { type: 'unknown', id: 'unknown', display: 'unknown' }, context: { ip: '203.0.113.7' } }
        });
        expect(recordMock.mock.calls[0]?.[0]).toMatchObject({
            accountId: 42,
            actor: { type: 'unknown', id: 'unknown' },
            context: { ip: '203.0.113.7' }
        });
    });

    it.each(['override', 'refresh', 'unknown'] as const)('records nothing when the upsert reported %s', async (operation) => {
        await recordConnectionCreated({ ...params, operation });
        expect(recordMock).not.toHaveBeenCalled();
    });

    it('records nothing when the account is not entitled', async () => {
        flags.hasAuditTrail = false;
        await recordConnectionCreated(params);
        expect(recordMock).not.toHaveBeenCalled();
    });
});

describe('noteConnectionUpsert', () => {
    const upsert = (operation: 'creation' | 'override') => ({
        operation: operation as never,
        connectionId: 'conn-1',
        providerConfigKey: 'github',
        account: { id: 1, uuid: 'uuid-1' },
        environment: { id: 2, uuid: 'e0000000-0000-4000-8000-000000000002', name: 'dev' }
    });

    it('records what the handler reports', () => {
        const req = {} as Request;
        noteConnectionUpsert(req, upsert('creation'));
        expect(req.audit?.connectionUpsert?.operation).toBe('creation');
    });

    // A CUSTOM OAuth install completes with a second upsert that reports `override`; letting it win would
    // drop the creation the route audit exists to record.
    it('does not let a later override erase a creation from the same request', () => {
        const req = {} as Request;
        noteConnectionUpsert(req, upsert('creation'));
        noteConnectionUpsert(req, upsert('override'));
        expect(req.audit?.connectionUpsert?.operation).toBe('creation');
    });

    it('still records an override when that is all the request did', () => {
        const req = {} as Request;
        noteConnectionUpsert(req, upsert('override'));
        expect(req.audit?.connectionUpsert?.operation).toBe('override');
    });
});

describe('connectionCreatedActor', () => {
    const unknown = { type: 'unknown', id: 'unknown', display: 'unknown' } as const;
    const endUser = { endUserId: 'customer-user-1', email: 'buyer@customer.com', tags: null };

    it('names the connect session and the end user it carries', () => {
        expect(connectionCreatedActor(unknown, endUser, 'connectSession')).toEqual({
            type: 'connect_session',
            id: 'customer-user-1',
            display: 'buyer@customer.com'
        });
    });

    it('names the connect session even when it carries no end user', () => {
        expect(connectionCreatedActor(unknown, null, 'connectSession')).toEqual({ type: 'connect_session', id: 'unknown' });
    });

    it('names the public key when the flow started with one', () => {
        expect(connectionCreatedActor(unknown, undefined, 'publicKey')).toEqual({ type: 'public_key', id: 'unknown' });
    });

    it('names nobody when no oauth session was behind the creation', () => {
        expect(connectionCreatedActor(unknown, undefined, undefined)).toEqual({ type: 'unknown', id: 'unknown', display: 'unknown' });
    });
});

describe('oauthAuthType', () => {
    it('names a public key start, which no connect session can explain', () => {
        expect(oauthAuthType({ connectSessionId: null })).toBe('publicKey');
    });

    it('names the connect session that started the flow', () => {
        expect(oauthAuthType({ connectSessionId: 7 })).toBe('connectSession');
    });
});
