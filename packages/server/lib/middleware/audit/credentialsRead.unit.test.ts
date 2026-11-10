import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Ok } from '@nangohq/utils';

import { auditAccountApiKeysCredentialsRead, auditApiKeysCredentialsRead, auditPublicApiKeyCredentialsRead } from './apiKey.middleware.js';
import { auditConnectionCredentialsRead } from './connection.middleware.js';
import { auditPublicEnvironmentCredentialsRead } from './environment.middleware.js';
import { auditDeprecatedProviderConfigCredentialsRead, auditPublicIntegrationCredentialsRead } from './integration.middleware.js';
import {
    customerKeySearchMock,
    fakeReq,
    fakeRes,
    getEnvironmentByUuidMock,
    installAuditMockDefaults,
    locals,
    recordMock,
    resetAuditMocks,
    runAudit,
    secretKeyLocals
} from './testing.js';

import type { RequestHandler } from 'express';

vi.mock('../../audit.js', async (importOriginal) => (await import('./testing.js')).auditModuleMock(importOriginal as never));
vi.mock('@nangohq/shared', async (importOriginal) => (await import('./testing.js')).sharedModuleMock(importOriginal as never));

const envUuid = '00000000-0000-4000-8000-000000000012';
const keyUuid = '00000000-0000-4000-8000-000000002551';

function read(...targets: { id: string; display?: string }[]) {
    return { credentialsRead: { targets } };
}

/** Runs the middleware and the handler's response, and returns whether an event was recorded. */
async function run(handler: RequestHandler, req: any, res: any, body?: unknown): Promise<boolean> {
    await new Promise<void>((resolve) => handler(req, res, () => resolve()));
    if (body !== undefined) {
        res.json(body);
    }
    res.emit('finish');
    // The finish listener is async; give it a turn before concluding nothing was recorded.
    await new Promise((resolve) => setTimeout(resolve, 10));
    return recordMock.mock.calls.length > 0;
}

describe('credentials read audit middleware (unit)', () => {
    beforeEach(() => {
        installAuditMockDefaults();
        getEnvironmentByUuidMock.mockReset().mockResolvedValue({ id: 12, uuid: envUuid, name: 'prod' });
        customerKeySearchMock.mockReset().mockResolvedValue(Ok([{ id: 2551, display_name: 'ci-key' }]));
    });

    afterEach(() => {
        resetAuditMocks();
    });

    describe('recorded only when the handler reported returning credentials', () => {
        it('a read that returned no credentials records nothing', async () => {
            expect(await run(auditConnectionCredentialsRead, fakeReq({ params: { connectionId: 'conn-1' } }), fakeRes(locals))).toBe(false);
        });

        it('a read that returned credentials records what the handler reported', async () => {
            const req = fakeReq({ params: { connectionId: 'conn-1' }, query: { provider_config_key: 'github' }, audit: read({ id: 'conn-1' }) });
            const event = await runAudit(auditConnectionCredentialsRead, req, fakeRes(locals));
            expect(event).toMatchObject({
                resource: 'connection',
                action: 'credentials_read',
                accountId: 42,
                environment: { id: 'e0000000-0000-4000-8000-000000000009', display: 'dev' },
                actor: { type: 'user', id: '7' },
                outcome: 'success',
                targets: [{ type: 'connection', id: 'conn-1' }],
                metadata: { providerConfigKey: 'github' }
            });
        });

        it('a list names every entity the handler reported', async () => {
            const otherKey = '00000000-0000-4000-8000-000000002552';
            const req = fakeReq({ audit: read({ id: keyUuid, display: 'ci-key' }, { id: otherKey }) });
            const event = await runAudit(auditApiKeysCredentialsRead, req, fakeRes(locals));
            expect(event).toMatchObject({
                resource: 'api_key',
                action: 'credentials_read',
                accountId: 42,
                environment: { id: 'e0000000-0000-4000-8000-000000000009', display: 'dev' },
                outcome: 'success',
                targets: [
                    { type: 'api_key', id: keyUuid, display: 'ci-key' },
                    { type: 'api_key', id: otherKey }
                ]
            });
        });

        it('an empty list returned no credentials, so it records nothing', async () => {
            expect(await run(auditApiKeysCredentialsRead, fakeReq({ audit: read() }), fakeRes(locals))).toBe(false);
        });

        it('a response that failed after the handler reported the read records nothing', async () => {
            const req = fakeReq({ params: { connectionId: 'conn-1' }, audit: read({ id: 'conn-1' }) });
            expect(await run(auditConnectionCredentialsRead, req, fakeRes(locals, 500))).toBe(false);
        });

        it('a dashboard api key list with masked secrets records nothing', async () => {
            expect(await run(auditApiKeysCredentialsRead, fakeReq(), fakeRes(locals))).toBe(false);
        });

        it('a denial is not recorded when the caller did not ask for credentials', async () => {
            expect(await run(auditConnectionCredentialsRead, fakeReq({ params: { connectionId: 'conn-1' } }), fakeRes(locals, 403))).toBe(false);
        });
    });

    describe('explicit request for credentials', () => {
        it('asking but getting no credentials back records nothing', async () => {
            const req = fakeReq({ params: { uniqueKey: 'github' }, query: { include: ['webhook', 'credentials'] } });
            expect(await run(auditPublicIntegrationCredentialsRead, req, fakeRes(secretKeyLocals))).toBe(false);
        });

        it('asking and getting credentials records the integration and the key that read it', async () => {
            const req = fakeReq({ params: { uniqueKey: 'github' }, query: { include: 'credentials' }, audit: read({ id: 'github', display: 'GitHub' }) });
            const event = await runAudit(auditPublicIntegrationCredentialsRead, req, fakeRes(secretKeyLocals));
            expect(event).toMatchObject({
                resource: 'integration',
                action: 'credentials_read',
                accountId: 42,
                environment: { id: 'e0000000-0000-4000-8000-000000000009', display: 'dev' },
                actor: { type: 'api_key', id: 'c0000000-0000-4000-8000-000000000005', display: 'ci-key' },
                outcome: 'success',
                targets: [{ type: 'integration', id: 'github', display: 'GitHub' }]
            });
        });

        it('a denial without asking records nothing', async () => {
            const req = fakeReq({ params: { uniqueKey: 'github' }, query: { include: 'webhook' } });
            expect(await run(auditPublicIntegrationCredentialsRead, req, fakeRes(secretKeyLocals, 403))).toBe(false);
        });

        it('asking and being denied is recorded as the attempt, naming the integration from the path', async () => {
            const req = fakeReq({ params: { uniqueKey: 'github' }, query: { include: 'credentials' } });
            const event = await runAudit(auditPublicIntegrationCredentialsRead, req, fakeRes(secretKeyLocals, 403));
            expect(event).toMatchObject({ accountId: 42, outcome: 'denied', targets: [{ type: 'integration', id: 'github' }] });
        });

        it('deprecated config read: only include_creds=true counts as asking', async () => {
            const plain = fakeReq({ params: { providerConfigKey: 'github' }, query: {} });
            expect(await run(auditDeprecatedProviderConfigCredentialsRead, plain, fakeRes(secretKeyLocals, 403))).toBe(false);

            const asked = fakeReq({ params: { providerConfigKey: 'github' }, query: { include_creds: 'true' } });
            const event = await runAudit(auditDeprecatedProviderConfigCredentialsRead, asked, fakeRes(secretKeyLocals, 403));
            expect(event).toMatchObject({
                resource: 'integration',
                action: 'credentials_read',
                accountId: 42,
                outcome: 'denied',
                targets: [{ type: 'integration', id: 'github' }]
            });
        });

        it('public environment read: the environment read becomes the event environment', async () => {
            const accountKeyLocals = { ...secretKeyLocals, environment: undefined };
            const req = fakeReq({
                params: { environmentUuid: envUuid },
                query: { with_secrets: 'true' },
                audit: { credentialsRead: { targets: [{ id: envUuid, display: 'prod' }], environment: { uuid: envUuid, name: 'prod' } } }
            });
            const event = await runAudit(auditPublicEnvironmentCredentialsRead, req, fakeRes(accountKeyLocals));
            expect(event).toMatchObject({
                resource: 'environment',
                action: 'credentials_read',
                accountId: 42,
                environment: { id: envUuid, display: 'prod' },
                targets: [{ type: 'environment', id: envUuid, display: 'prod' }]
            });
        });

        it('public environment read: a denied request with a malformed environment uuid records no target', async () => {
            const req = fakeReq({ params: { environmentUuid: 'not-a-uuid' }, query: { with_secrets: 'true' } });
            const event = await runAudit(auditPublicEnvironmentCredentialsRead, req, fakeRes(secretKeyLocals, 403));
            expect(event).toMatchObject({ accountId: 42, outcome: 'denied', targets: [] });
        });

        it('public environment read: a denied with_secrets request names the environment from the path', async () => {
            const req = fakeReq({ params: { environmentUuid: envUuid }, query: { with_secrets: 'true' } });
            const event = await runAudit(auditPublicEnvironmentCredentialsRead, req, fakeRes(secretKeyLocals, 403));
            expect(event).toMatchObject({ accountId: 42, outcome: 'denied', targets: [{ type: 'environment', id: envUuid }] });
        });
    });

    describe('endpoints that always return the secret record every outcome', () => {
        it('public api key read records a denial, naming the key and the environment from the path', async () => {
            const req = fakeReq({ params: { environmentUuid: envUuid, keyUuid } });
            const event = await runAudit(auditPublicApiKeyCredentialsRead, req, fakeRes(secretKeyLocals, 403));
            expect(event).toMatchObject({
                resource: 'api_key',
                action: 'credentials_read',
                accountId: 42,
                outcome: 'denied',
                environment: { id: envUuid, display: 'prod' },
                targets: [{ type: 'api_key', id: keyUuid, display: 'ci-key' }]
            });
        });

        it('account api key list is account-scoped and names every returned key', async () => {
            await run(auditAccountApiKeysCredentialsRead, fakeReq(), fakeRes(locals), { data: [{ uuid: keyUuid, display_name: 'ci-key' }] });
            expect(recordMock.mock.calls[0]?.[0]).toMatchObject({
                resource: 'api_key',
                action: 'credentials_read',
                accountId: 42,
                scope: 'account',
                environment: null,
                outcome: 'success',
                targets: [{ type: 'api_key', id: keyUuid, display: 'ci-key' }]
            });
        });
    });
});
