import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { metrics, Ok } from '@nangohq/utils';

import { auditAccountApiKeyCreated, auditApiKeyDeleted, auditPublicApiKeyCreated, auditPublicApiKeyDeleted } from './apiKey.middleware.js';
import {
    fakeReq,
    fakeRes,
    getApiKeyDisplayNameMock,
    getEnvironmentByIdMock,
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
        getApiKeyDisplayNameMock.mockReset().mockResolvedValue(Ok('ci-key'));
    });

    afterEach(() => {
        resetAuditMocks();
    });

    it('api key delete: resolves the display name scoped to the caller account and environment', async () => {
        const event = await runAudit(auditApiKeyDeleted, fakeReq({ params: { keyId: '2551' } }), fakeRes(locals));
        expect(event).toMatchObject({
            resource: 'api_key',
            action: 'deleted',
            accountId: 42,
            environment: { id: 9, display: 'dev' },
            targets: [{ type: 'api_key', id: '2551', display: 'ci-key' }]
        });
        // Scoped by account and environment, so one customer's key id can never name another's key.
        expect(getApiKeyDisplayNameMock).toHaveBeenCalledWith(expect.anything(), 2551, 9, 42);
    });

    it('api key delete: a malformed key id records the attempt without a lookup', async () => {
        const event = await runAudit(auditApiKeyDeleted, fakeReq({ params: { keyId: '-1' } }), fakeRes(locals));
        expect(event).toMatchObject({ resource: 'api_key', action: 'deleted', accountId: 42 });
        expect(getApiKeyDisplayNameMock).not.toHaveBeenCalled();
    });

    it('public api key create: names the environment the key was made in, not the one it authenticated against', async () => {
        const req = fakeReq({ body: { environment_id: 12, display_name: 'ci-key' } });
        const res = fakeRes(secretKeyLocals);
        await new Promise<void>((resolve) => auditPublicApiKeyCreated(req, res, () => resolve()));
        res.json({ data: { id: 2551, display_name: 'ci-key', scopes: ['environment:*'] } });
        res.emit('finish');
        await vi.waitFor(() => expect(recordMock).toHaveBeenCalled());
        const event = recordMock.mock.calls[0]?.[0];
        expect(event).toMatchObject({
            resource: 'api_key',
            action: 'created',
            outcome: 'success',
            accountId: 42,
            environment: { id: 12, display: 'prod' },
            targets: [{ type: 'api_key', id: '2551', display: 'ci-key' }],
            metadata: { displayName: 'ci-key', scopes: ['environment:*'] }
        });
        expect(event?.metadata).not.toHaveProperty('environmentId');
    });

    it('public api key delete: an environment key is separable from an account key by the environment alone', async () => {
        const envKey = await runAudit(auditPublicApiKeyDeleted, fakeReq({ body: { environment_id: 12, key_id: 2551 } }), fakeRes(secretKeyLocals));
        recordMock.mockClear();
        const accountKey = await runAudit(auditAccountApiKeyCreated, fakeReq({ body: { display_name: 'acct-key' } }), fakeRes(locals));
        expect(envKey).toMatchObject({ resource: 'api_key', action: 'deleted', accountId: 42, environment: { id: 12, display: 'prod' } });
        expect(accountKey?.environment).toBeNull();
    });

    it('public api key create: an environment id sent as a string still resolves, as the endpoint accepts it', async () => {
        const event = await runAudit(auditPublicApiKeyCreated, fakeReq({ body: { environment_id: '12', display_name: 'ci-key' } }), fakeRes(secretKeyLocals));
        expect(event).toMatchObject({ resource: 'api_key', action: 'created', accountId: 42, environment: { id: 12, display: 'prod' } });
        expect(getEnvironmentByIdMock).toHaveBeenCalledWith(12, 42);
    });

    it.each([
        ['a boolean', true],
        ['an empty string', ''],
        ['null', null],
        ['an array', []],
        ['zero', 0],
        ['a negative', -1],
        ['a fraction', 1.5]
    ])('public api key create: %s is not an environment id', async (_name, environment_id) => {
        const event = await runAudit(auditPublicApiKeyCreated, fakeReq({ body: { environment_id, display_name: 'ci-key' } }), fakeRes(secretKeyLocals));
        expect(event).toMatchObject({ resource: 'api_key', action: 'created', accountId: 42 });
        expect(event?.environment).toBeNull();
        expect(getEnvironmentByIdMock).not.toHaveBeenCalled();
    });

    it("public api key create: another account's environment is never named", async () => {
        getEnvironmentByIdMock.mockResolvedValue(null);
        const event = await runAudit(auditPublicApiKeyCreated, fakeReq({ body: { environment_id: 999, display_name: 'ci-key' } }), fakeRes(secretKeyLocals));
        expect(event).toMatchObject({ resource: 'api_key', action: 'created', accountId: 42 });
        expect(event?.environment).toBeNull();
        expect(getEnvironmentByIdMock).toHaveBeenCalledWith(999, 42);
    });

    it('public api key create: an environment lookup failure still records the event, and counts the degradation', async () => {
        const increment = vi.spyOn(metrics, 'increment');
        getEnvironmentByIdMock.mockRejectedValue(new Error('db down'));
        const event = await runAudit(auditPublicApiKeyCreated, fakeReq({ body: { environment_id: 12, display_name: 'ci-key' } }), fakeRes(secretKeyLocals));
        expect(event).toMatchObject({ resource: 'api_key', action: 'created', accountId: 42 });
        expect(event?.environment).toBeNull();
        expect(increment).toHaveBeenCalledWith(metrics.Types.AUDIT_EVENT_ENRICHMENT_FAILED, 1, { field: 'environment', resource: 'api_key' });
    });
});
