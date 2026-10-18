import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { metrics, Ok } from '@nangohq/utils';

import {
    auditAccountApiKeyCreated,
    auditApiKeyCreated,
    auditApiKeyDeleted,
    auditApiKeyUpdated,
    auditPublicApiKeyCreated,
    auditPublicApiKeyDeleted,
    auditPublicApiKeyUpdated
} from './apiKey.middleware.js';
import {
    customerKeySearchMock,
    fakeReq,
    fakeRes,
    getEnvironmentByIdMock,
    getEnvironmentByUuidMock,
    installAuditMockDefaults,
    locals,
    recordMock,
    resetAuditMocks,
    runAudit,
    secretKeyLocals
} from './testing.js';

import type { CustomerKeySearch } from '@nangohq/shared';

vi.mock('../../audit.js', async (importOriginal) => (await import('./testing.js')).auditModuleMock(importOriginal as never));
vi.mock('@nangohq/shared', async (importOriginal) => (await import('./testing.js')).sharedModuleMock(importOriginal as never));

describe('apiKey audit middleware (unit)', () => {
    beforeEach(() => {
        installAuditMockDefaults();
        getEnvironmentByIdMock.mockReset().mockResolvedValue({ id: 12, name: 'prod' });
        getEnvironmentByUuidMock.mockReset().mockResolvedValue({ id: 12, uuid: '00000000-0000-4000-8000-000000000012', name: 'prod' });
        customerKeySearchMock.mockReset().mockImplementation((_trx: unknown, filter: CustomerKeySearch) => {
            if (filter.type === 'environment' && filter.keyId !== undefined) {
                return Ok([{ uuid: 'a2f1c0de-0000-4000-8000-000000000001', display_name: 'ci-key' }]);
            }
            if (filter.type === 'environment' && filter.keyUuid !== undefined) {
                return Ok([{ id: 2551, display_name: 'ci-key' }]);
            }
            return Ok([]);
        });
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
        expect(customerKeySearchMock).toHaveBeenCalledWith(expect.anything(), { type: 'environment', environmentId: 9, accountId: 42, keyId: 2551 });
    });

    it('api key delete: a malformed key id records the attempt without a lookup', async () => {
        const event = await runAudit(auditApiKeyDeleted, fakeReq({ params: { keyId: '-1' } }), fakeRes(locals));
        expect(event).toMatchObject({ resource: 'api_key', action: 'deleted', accountId: 42 });
        expect(customerKeySearchMock).not.toHaveBeenCalled();
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
            environment: { id: '00000000-0000-4000-8000-000000000012', display: 'prod' },
            targets: [{ type: 'api_key', id: '00000000-0000-4000-8000-000000002551', display: 'ci-key' }]
        });
        expect(customerKeySearchMock).toHaveBeenCalledWith(expect.anything(), {
            type: 'environment',
            environmentId: 12,
            accountId: 42,
            keyUuid: '00000000-0000-4000-8000-000000002551'
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

    it('public api key update: names the key and environment from the path, and records the requested changes', async () => {
        const environmentUuid = '00000000-0000-4000-8000-000000000012';
        const keyUuid = '00000000-0000-4000-8000-000000002551';
        const invalidScopes = [23, { not: 'a scope' }, null];
        const event = await runAudit(
            auditPublicApiKeyUpdated,
            fakeReq({ params: { environmentUuid, keyUuid }, body: { display_name: 'renamed', scopes: ['environment:deploy', ...invalidScopes] } }),
            fakeRes(secretKeyLocals)
        );
        expect(event).toMatchObject({
            resource: 'api_key',
            action: 'updated',
            outcome: 'success',
            accountId: 42,
            environment: { id: environmentUuid, display: 'prod' },
            actor: { type: 'api_key', id: 'c0000000-0000-4000-8000-000000000005', display: 'ci-key' },
            targets: [{ type: 'api_key', id: keyUuid, display: 'ci-key' }],
            metadata: { displayName: 'renamed', scopes: ['environment:deploy'] } // invalid scopes are ignored
        });
        expect(customerKeySearchMock).toHaveBeenCalledWith(expect.anything(), { type: 'environment', environmentId: 12, accountId: 42, keyUuid });
    });

    it('public api key update: a denial still identifies the key and the attempted change', async () => {
        const environmentUuid = '00000000-0000-4000-8000-000000000012';
        const keyUuid = '00000000-0000-4000-8000-000000002551';
        const event = await runAudit(
            auditPublicApiKeyUpdated,
            fakeReq({ params: { environmentUuid, keyUuid }, body: { scopes: ['environment:*'] } }),
            fakeRes(secretKeyLocals, 403)
        );
        expect(event).toMatchObject({
            resource: 'api_key',
            action: 'updated',
            outcome: 'denied',
            accountId: 42,
            environment: { id: environmentUuid, display: 'prod' },
            targets: [{ type: 'api_key', id: keyUuid, display: 'ci-key' }],
            metadata: { scopes: ['environment:*'] }
        });
    });

    const publicKeyParams = { environmentUuid: '00000000-0000-4000-8000-000000000012', keyUuid: '00000000-0000-4000-8000-000000002551' };
    it.each([
        { name: 'dashboard api key create', handler: auditApiKeyCreated, action: 'created', params: {}, res: locals },
        {
            name: 'public api key create',
            handler: auditPublicApiKeyCreated,
            action: 'created',
            params: { environmentUuid: publicKeyParams.environmentUuid },
            res: secretKeyLocals
        },
        { name: 'account api key create', handler: auditAccountApiKeyCreated, action: 'created', params: {}, res: locals },
        { name: 'dashboard api key update', handler: auditApiKeyUpdated, action: 'updated', params: { keyId: '2551' }, res: locals },
        { name: 'public api key update', handler: auditPublicApiKeyUpdated, action: 'updated', params: publicKeyParams, res: secretKeyLocals }
    ])('$name: a missing body records the event without an enrichment failure', async ({ handler, action, params, res }) => {
        const increment = vi.spyOn(metrics, 'increment');
        const event = await runAudit(handler, fakeReq({ params, body: undefined }), fakeRes(res, 400));
        expect(event).toMatchObject({ resource: 'api_key', action, outcome: 'failure', accountId: 42 });
        expect(event?.metadata).toBeUndefined();
        expect(increment).not.toHaveBeenCalledWith(metrics.Types.AUDIT_EVENT_ENRICHMENT_FAILED, expect.anything(), expect.anything());
    });

    it.each([
        ['dashboard', auditApiKeyUpdated, { keyId: '2551' }, locals],
        ['public', auditPublicApiKeyUpdated, publicKeyParams, secretKeyLocals]
    ])('%s api key update: a missing body still names the key', async (_kind, handler, params, res) => {
        const event = await runAudit(handler, fakeReq({ params, body: undefined }), fakeRes(res, 400));
        expect(event?.targets).toMatchObject([{ type: 'api_key', display: 'ci-key' }]);
    });

    it('public api key delete: malformed UUIDs do not trigger audit lookups', async () => {
        const event = await runAudit(
            auditPublicApiKeyDeleted,
            fakeReq({ params: { environmentUuid: 'not-a-uuid', keyUuid: 'also-not-a-uuid' } }),
            fakeRes(secretKeyLocals)
        );
        expect(event).toMatchObject({ resource: 'api_key', action: 'deleted', accountId: 42, environment: null, targets: [] });
        expect(getEnvironmentByUuidMock).not.toHaveBeenCalled();
        expect(customerKeySearchMock).not.toHaveBeenCalled();
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
