import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { flags } from '@nangohq/utils';

import { claimConnectionUpsert } from '../utils/audited.js';
import { recordConnectionCreated } from './auditConnection.js';

import type * as AuditModule from '../audit.js';
import type { RequestLocals } from '../utils/express.js';
import type { AuthOperationType, ConnectionAuthClaim } from '@nangohq/types';
import type { Response } from 'express';

const recordMock = vi.hoisted(() => vi.fn());
vi.mock('../audit.js', async (importOriginal) => {
    const actual = await importOriginal<typeof AuditModule>();
    return { ...actual, audit: { record: recordMock } };
});

describe('recordConnectionCreated (hook-side emitter, unit)', () => {
    const params = {
        connectionId: 'conn-42',
        providerConfigKey: 'algolia-prod',
        operation: 'creation' as const,
        account: { id: 42, uuid: 'acc-uuid' },
        environment: { id: 9, name: 'dev' },
        auditAttribution: { kind: 'no-attribution', reason: 'no request' } as const
    };

    beforeEach(() => {
        recordMock.mockReset().mockResolvedValue({ isErr: () => false });
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
            environment: { id: 9, display: 'dev' },
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
            environment: { id: 9, display: 'dev' },
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
            environment: { id: 9, display: 'dev' },
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

describe('claimConnectionUpsert', () => {
    const res = () => ({ locals: {} }) as unknown as Response<any, RequestLocals>;
    const claim = (operation: AuthOperationType): ConnectionAuthClaim => ({ operation, connectionId: 'conn-1', providerConfigKey: 'github' });

    it('records what the handler reports', () => {
        const target = res();
        claimConnectionUpsert(target, claim('creation'));
        expect(target.locals.auditClaim).toMatchObject({ operation: 'creation', connectionId: 'conn-1', providerConfigKey: 'github' });
    });

    // A CUSTOM OAuth install upserts twice in one request; the second must not turn the row into a
    // re-authorization.
    it('does not let a later override erase a creation from the same request', () => {
        const target = res();
        claimConnectionUpsert(target, claim('creation'));
        claimConnectionUpsert(target, claim('override'));
        expect(target.locals.auditClaim).toMatchObject({ operation: 'creation' });
    });

    it('still records an override when that is all the request did', () => {
        const target = res();
        claimConnectionUpsert(target, claim('override'));
        expect(target.locals.auditClaim).toMatchObject({ operation: 'override' });
    });
});
