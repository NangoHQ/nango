import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { auditConnectionCreated, auditConnectionUpdated, auditPublicConnectionDeleted } from './connection.middleware.js';
import { fakeReq, fakeRes, installAuditMockDefaults, locals, resetAuditMocks, runAudit, secretKeyLocals } from './testing.js';

vi.mock('../../audit.js', async (importOriginal) => (await import('./testing.js')).auditModuleMock(importOriginal as never));
vi.mock('@nangohq/shared', async (importOriginal) => (await import('./testing.js')).sharedModuleMock(importOriginal as never));

describe('connection audit middleware (unit)', () => {
    beforeEach(() => {
        installAuditMockDefaults();
    });

    afterEach(() => {
        resetAuditMocks();
    });

    it('marks an event reached through an impersonation session, naming the Nango account', async () => {
        const req = fakeReq({
            params: { connectionId: 'conn-1' },
            query: { provider_config_key: 'algolia' },
            session: { impersonatedBy: { accountId: 1, accountName: 'Nango', actorId: 7 } }
        });
        const event = await runAudit(auditConnectionUpdated, req, fakeRes(locals));
        expect(event).toMatchObject({ accountId: 42, via: [{ type: 'impersonation', id: '1', display: 'Nango', actorId: '7' }] });
        expect(event?.via?.[0]).not.toHaveProperty('actorDisplay');
    });

    it("leaves the impersonating account's own trail unmarked", async () => {
        const req = fakeReq({
            params: { connectionId: 'conn-1' },
            query: { provider_config_key: 'algolia' },
            // locals.account is 42, so this is Nango acting on Nango — nothing to say.
            session: { impersonatedBy: { accountId: 42, accountName: 'Nango' } }
        });
        const event = await runAudit(auditConnectionUpdated, req, fakeRes(locals));
        expect(event).toMatchObject({ accountId: 42 });
        expect(event).not.toHaveProperty('via');
    });

    it('connection update: records changed field names + provider, never the submitted value', async () => {
        const req = fakeReq({
            params: { connectionId: 'conn-1' },
            query: { provider_config_key: 'algolia' },
            body: { webhook_url_override: 'https://leaked-value.test/hook' }
        });
        const event = await runAudit(auditConnectionUpdated, req, fakeRes(locals));
        expect(event).toMatchObject({
            resource: 'connection',
            action: 'updated',
            outcome: 'success',
            targets: [{ type: 'connection', id: 'conn-1' }],
            metadata: { providerConfigKey: 'algolia', changedFields: ['webhook_url_override'] }
        });
        expect(JSON.stringify(event)).not.toContain('leaked-value');
    });

    it('connection create: a failed attempt names the integration from the path and the connection from the query', async () => {
        const req = fakeReq({ params: { providerConfigKey: 'algolia' }, query: { connection_id: 'conn-a' } });
        const event = await runAudit(auditConnectionCreated, req, fakeRes(locals, 400));
        expect(event).toMatchObject({
            resource: 'connection',
            action: 'created',
            outcome: 'failure',
            accountId: 42,
            environment: { id: 'e0000000-0000-4000-8000-000000000009', display: 'dev' },
            targets: [{ type: 'connection', id: 'conn-a' }],
            metadata: { providerConfigKey: 'algolia' }
        });
    });

    it('connection create: a failed attempt on POST /connections reads the body instead', async () => {
        const req = fakeReq({ body: { provider_config_key: 'algolia', connection_id: 'conn-b' } });
        const event = await runAudit(auditConnectionCreated, req, fakeRes(locals, 400));
        expect(event).toMatchObject({
            outcome: 'failure',
            accountId: 42,
            targets: [{ type: 'connection', id: 'conn-b' }],
            metadata: { providerConfigKey: 'algolia' }
        });
    });

    it('connection create: no caller-supplied connection id leaves the target empty, never a placeholder', async () => {
        const event = await runAudit(auditConnectionCreated, fakeReq({ params: { providerConfigKey: 'algolia' } }), fakeRes(locals, 400));
        expect(event).toMatchObject({ resource: 'connection', action: 'created', outcome: 'failure', accountId: 42 });
        expect(event?.targets).toEqual([]);
        expect(event?.metadata).toEqual({ providerConfigKey: 'algolia' });
    });

    it('connection create: the OAuth callback carries neither, so it still records the attempt and nothing more', async () => {
        const event = await runAudit(auditConnectionCreated, fakeReq({ body: undefined }), fakeRes(locals, 400));
        expect(event).toMatchObject({ resource: 'connection', action: 'created', outcome: 'failure', accountId: 42, targets: [] });
        expect(event?.metadata).toBeUndefined();
    });

    it('connection create: what the handler upserted wins over the request', async () => {
        const req = fakeReq({
            params: { providerConfigKey: 'from-path' },
            query: { connection_id: 'from-query' },
            audit: {
                connectionUpsert: {
                    operation: 'creation',
                    connectionId: 'conn-real',
                    providerConfigKey: 'algolia',
                    account: locals.account,
                    environment: locals.environment
                }
            }
        });
        const event = await runAudit(auditConnectionCreated, req, fakeRes(locals));
        expect(event).toMatchObject({
            outcome: 'success',
            targets: [{ type: 'connection', id: 'conn-real' }],
            metadata: { providerConfigKey: 'algolia' }
        });
    });

    it('resolves an api_key actor (secret-key auth) rather than a user', async () => {
        const req = fakeReq({ params: { connectionId: 'conn-1' }, query: { provider_config_key: 'algolia' } });
        const event = await runAudit(auditPublicConnectionDeleted, req, fakeRes(secretKeyLocals));
        expect(event).toMatchObject({
            resource: 'connection',
            action: 'deleted',
            accountId: 42,
            environment: { id: 'e0000000-0000-4000-8000-000000000009', display: 'dev' },
            actor: { type: 'api_key', id: 'c0000000-0000-4000-8000-000000000005', display: 'ci-key' },
            targets: [{ type: 'connection', id: 'conn-1' }],
            metadata: { providerConfigKey: 'algolia' }
        });
    });
});
