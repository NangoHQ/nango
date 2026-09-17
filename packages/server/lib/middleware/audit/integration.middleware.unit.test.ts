import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { auditIntegrationCreated, auditIntegrationDeleted, auditIntegrationUpdated, auditPublicIntegrationDeleted } from './integration.middleware.js';
import { fakeReq, fakeRes, getIntegrationSummaryMock, installAuditMockDefaults, locals, recordMock, resetAuditMocks, runAudit } from './testing.js';

vi.mock('../../audit.js', async (importOriginal) => (await import('./testing.js')).auditModuleMock(importOriginal as never));
vi.mock('@nangohq/shared', async (importOriginal) => (await import('./testing.js')).sharedModuleMock(importOriginal as never));

describe('integration audit middleware (unit)', () => {
    beforeEach(() => {
        installAuditMockDefaults();
        getIntegrationSummaryMock.mockReset().mockResolvedValue({ provider: 'algolia', display_name: 'Algolia Prod' });
    });

    afterEach(() => {
        resetAuditMocks();
    });

    it.each([
        ['private', auditIntegrationDeleted, { providerConfigKey: 'algolia-prod' }],
        ['public', auditPublicIntegrationDeleted, { uniqueKey: 'algolia-prod' }]
    ])('integration delete (%s): captures the provider and the name before the row is gone', async (_surface, handler, params) => {
        const event = await runAudit(handler, fakeReq({ params }), fakeRes(locals));
        expect(event).toMatchObject({
            resource: 'integration',
            action: 'deleted',
            outcome: 'success',
            accountId: 42,
            environment: { id: 'e0000000-0000-4000-8000-000000000009', display: 'dev' },
            targets: [{ type: 'integration', id: 'algolia-prod', display: 'Algolia Prod' }],
            metadata: { provider: 'algolia' }
        });
        expect(getIntegrationSummaryMock).toHaveBeenCalledWith(9, 'algolia-prod');
    });

    it('integration delete: a failed lookup still records the deletion', async () => {
        getIntegrationSummaryMock.mockRejectedValue(new Error('db down'));
        const event = await runAudit(auditIntegrationDeleted, fakeReq({ params: { providerConfigKey: 'algolia-prod' } }), fakeRes(locals));
        expect(event).toMatchObject({ resource: 'integration', action: 'deleted', accountId: 42, targets: [{ type: 'integration', id: 'algolia-prod' }] });
        expect(event?.targets?.[0]).not.toHaveProperty('display');
        expect(event?.metadata).toBeUndefined();
    });

    it('integration update: records the provider next to the changed fields, never a credential value', async () => {
        const req = fakeReq({ params: { providerConfigKey: 'algolia-prod' }, body: { credentials: { client_secret: 'super-secret-value' } } });
        const event = await runAudit(auditIntegrationUpdated, req, fakeRes(locals));
        expect(event?.metadata).toEqual({ provider: 'algolia', changedFields: ['credentials'] });
        expect(JSON.stringify(event)).not.toContain('super-secret-value');
    });

    it('integration create: takes the display from the response, since the key may be derived from the provider', async () => {
        const req = fakeReq({ body: { provider: 'unauthenticated' } });
        const res = fakeRes(locals);
        await new Promise<void>((resolve) => auditIntegrationCreated(req, res, () => resolve()));
        res.json({ data: { unique_key: 'unauthenticated', display_name: 'Unauthenticated' } });
        res.emit('finish');
        await vi.waitFor(() => expect(recordMock).toHaveBeenCalled());
        expect(recordMock.mock.calls[0]?.[0]).toMatchObject({
            resource: 'integration',
            action: 'created',
            accountId: 42,
            targets: [{ type: 'integration', id: 'unauthenticated', display: 'Unauthenticated' }],
            metadata: { provider: 'unauthenticated' }
        });
    });
});
