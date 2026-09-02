import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { metrics, Ok } from '@nangohq/utils';

import { auditAccountApiKeyCreated, auditApiKeyCreated, auditApiKeyDeleted, auditPublicApiKeyCreated, auditPublicApiKeyDeleted } from './apiKey.middleware.js';
import {
    fakeReq,
    fakeRes,
    getApiKeyByIdMock,
    getApiKeyByUuidMock,
    getEnvironmentByIdMock,
    getEnvironmentByUuidMock,
    installAuditMockDefaults,
    locals,
    recordMock,
    resetAuditMocks,
    runAudit,
    secretKeyLocals
} from './testing.js';

vi.mock('../../audit.js', async (importOriginal) => (await import('./testing.js')).auditModuleMock(importOriginal as never));
vi.mock('@nangohq/shared', async (importOriginal) => (await import('./testing.js')).sharedModuleMock(importOriginal as never));

describe('apiKey audit middleware (unit)', () => {
    beforeEach(() => {
        installAuditMockDefaults();
        getEnvironmentByIdMock.mockReset().mockResolvedValue({ id: 12, name: 'prod' });
        getEnvironmentByUuidMock.mockReset().mockResolvedValue({ id: 12, uuid: '00000000-0000-4000-8000-000000000012', name: 'prod' });
        getApiKeyByIdMock.mockReset().mockResolvedValue(Ok({ uuid: 'a2f1c0de-0000-4000-8000-000000000001', display_name: 'ci-key' }));
        getApiKeyByUuidMock.mockReset().mockResolvedValue(Ok({ id: 2551, display_name: 'ci-key' }));
    });

    afterEach(() => {
        resetAuditMocks();
    });

    it('api key delete: names the key by its uuid, resolved scoped to the caller account and environment', async () => {
        const event = await runAudit(auditApiKeyDeleted, fakeReq({ params: { keyId: '2551' } }), fakeRes(locals));
        expect(event).toMatchObject({
            resource: 'api_key',
            action: 'deleted',
            accountId: 42,
            environment: { id: 'e0000000-0000-4000-8000-000000000009', display: 'dev' },
            targets: [{ type: 'api_key', id: 'a2f1c0de-0000-4000-8000-000000000001', display: 'ci-key' }]
        });
        // Scoped by account and environment, so one customer's key id can never name another's key.
        expect(getApiKeyByIdMock).toHaveBeenCalledWith(expect.anything(), 2551, 9, 42);
    });

    it('api key delete: a malformed key id records the attempt without a lookup', async () => {
        const event = await runAudit(auditApiKeyDeleted, fakeReq({ params: { keyId: '-1' } }), fakeRes(locals));
        expect(event).toMatchObject({ resource: 'api_key', action: 'deleted', accountId: 42 });
        expect(getApiKeyByIdMock).not.toHaveBeenCalled();
    });

    it('public api key create: names the environment the key was made in, not the one it authenticated against', async () => {
        const req = fakeReq({ params: { environmentUuid: '00000000-0000-4000-8000-000000000012' }, body: { display_name: 'ci-key' } });
        const res = fakeRes(secretKeyLocals);
        await new Promise<void>((resolve) => auditPublicApiKeyCreated(req, res, () => resolve()));
        res.json({ data: { id: 2551, uuid: '00000000-0000-4000-8000-000000002551', display_name: 'ci-key', scopes: ['environment:*'] } });
        res.emit('finish');
        await vi.waitFor(() => expect(recordMock).toHaveBeenCalled());
        const event = recordMock.mock.calls[0]?.[0];
        expect(event).toMatchObject({
            resource: 'api_key',
            action: 'created',
            outcome: 'success',
            accountId: 42,
            environment: { id: '00000000-0000-4000-8000-000000000012', display: 'prod' },
            targets: [{ type: 'api_key', id: '00000000-0000-4000-8000-000000002551', display: 'ci-key' }],
            metadata: { displayName: 'ci-key', scopes: ['environment:*'] }
        });
        expect(event?.metadata).not.toHaveProperty('environmentId');
    });

    it('public api key delete: an environment key is separable from an account key by the environment alone', async () => {
        const envKey = await runAudit(
            auditPublicApiKeyDeleted,
            fakeReq({ params: { environmentUuid: '00000000-0000-4000-8000-000000000012', keyUuid: '00000000-0000-4000-8000-000000002551' } }),
            fakeRes(secretKeyLocals)
        );
        recordMock.mockClear();
        const accountKey = await runAudit(auditAccountApiKeyCreated, fakeReq({ body: { display_name: 'acct-key' } }), fakeRes(locals));
        expect(envKey).toMatchObject({
            resource: 'api_key',
            action: 'deleted',
            accountId: 42,
            environment: { id: '00000000-0000-4000-8000-000000000012', display: 'prod' }
        });
        expect(accountKey?.environment).toBeNull();
    });

    it.each([
        ['dashboard', 'auditApiKeyCreated'],
        ['account', 'auditAccountApiKeyCreated']
    ])('%s api key create: names the key by the uuid the response returns, not its internal id', async (_kind, name) => {
        const handler = name === 'auditApiKeyCreated' ? auditApiKeyCreated : auditAccountApiKeyCreated;
        const res = fakeRes(locals);
        await new Promise<void>((resolve) => handler(fakeReq({ body: { display_name: 'ci-key' } }), res, () => resolve()));
        res.json({ data: { id: 2551, uuid: '00000000-0000-4000-8000-000000002551', display_name: 'ci-key', scopes: ['environment:*'] } });
        res.emit('finish');
        await vi.waitFor(() => expect(recordMock).toHaveBeenCalled());

        expect(recordMock.mock.calls.at(-1)?.[0]).toMatchObject({
            resource: 'api_key',
            action: 'created',
            outcome: 'success',
            accountId: 42,
            targets: [{ type: 'api_key', id: '00000000-0000-4000-8000-000000002551', display: 'ci-key' }]
        });
    });

    it('public api key create: resolves the environment from its UUID path parameter', async () => {
        const environmentUuid = '00000000-0000-4000-8000-000000000012';
        const event = await runAudit(
            auditPublicApiKeyCreated,
            fakeReq({ params: { environmentUuid }, body: { display_name: 'ci-key' } }),
            fakeRes(secretKeyLocals)
        );
        expect(event).toMatchObject({
            resource: 'api_key',
            action: 'created',
            accountId: 42,
            environment: { id: '00000000-0000-4000-8000-000000000012', display: 'prod' }
        });
        expect(getEnvironmentByUuidMock).toHaveBeenCalledWith(environmentUuid, 42);
    });

    it.each([
        ['a boolean', true],
        ['an empty string', ''],
        ['null', null],
        ['an array', []],
        ['a malformed UUID', 'not-a-uuid']
    ])('public api key create: %s is not an environment UUID', async (_name, environmentUuid) => {
        const event = await runAudit(
            auditPublicApiKeyCreated,
            fakeReq({ params: { environmentUuid }, body: { display_name: 'ci-key' } }),
            fakeRes(secretKeyLocals)
        );
        expect(event).toMatchObject({ resource: 'api_key', action: 'created', accountId: 42 });
        expect(event?.environment).toBeNull();
        expect(getEnvironmentByUuidMock).not.toHaveBeenCalled();
    });

    it('public api key delete: malformed UUIDs do not trigger audit lookups', async () => {
        const event = await runAudit(
            auditPublicApiKeyDeleted,
            fakeReq({ params: { environmentUuid: 'not-a-uuid', keyUuid: 'also-not-a-uuid' } }),
            fakeRes(secretKeyLocals)
        );
        expect(event).toMatchObject({ resource: 'api_key', action: 'deleted', accountId: 42, environment: null, targets: [] });
        expect(getEnvironmentByUuidMock).not.toHaveBeenCalled();
        expect(getApiKeyByUuidMock).not.toHaveBeenCalled();
    });

    it("public api key create: another account's environment is never named", async () => {
        const environmentUuid = '00000000-0000-4000-8000-000000000999';
        getEnvironmentByUuidMock.mockResolvedValue(null);
        const event = await runAudit(
            auditPublicApiKeyCreated,
            fakeReq({ params: { environmentUuid }, body: { display_name: 'ci-key' } }),
            fakeRes(secretKeyLocals)
        );
        expect(event).toMatchObject({ resource: 'api_key', action: 'created', accountId: 42 });
        expect(event?.environment).toBeNull();
        expect(getEnvironmentByUuidMock).toHaveBeenCalledWith(environmentUuid, 42);
    });

    it('public api key create: an environment lookup failure still records the event, and counts the degradation', async () => {
        const increment = vi.spyOn(metrics, 'increment');
        getEnvironmentByUuidMock.mockRejectedValue(new Error('db down'));
        const event = await runAudit(
            auditPublicApiKeyCreated,
            fakeReq({ params: { environmentUuid: '00000000-0000-4000-8000-000000000012' }, body: { display_name: 'ci-key' } }),
            fakeRes(secretKeyLocals)
        );
        expect(event).toMatchObject({ resource: 'api_key', action: 'created', accountId: 42 });
        expect(event?.environment).toBeNull();
        expect(increment).toHaveBeenCalledWith(metrics.Types.AUDIT_EVENT_ENRICHMENT_FAILED, 1, { field: 'environment', resource: 'api_key' });
    });
});
