import { describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { seeders } from '@nangohq/shared';
import { getTestConfig } from '@nangohq/shared/lib/seeders/config.seeder.js';

import { InternalNango } from './internal-nango.js';
import unauthenticatedWebhookRouting from './unauthenticated-webhook-routing.js';

describe('unauthenticatedWebhookRouting', () => {
    it('routes by metadata.fanoutKey when fanoutKey is present', async () => {
        const integration = getTestConfig({ provider: 'unauthenticated' });

        const mock = vi.fn().mockResolvedValueOnce({ connectionIds: ['conn-1'], connectionMetadata: {} });

        const nangoMock = new InternalNango({
            team: seeders.getTestTeam(),
            environment: seeders.getTestEnvironment(),
            plan: seeders.getTestPlan(),
            integration,
            logContextGetter,
            ingressRequestId: 'test-ingress-request-id'
        });
        nangoMock.executeScriptForWebhooks = mock;

        await unauthenticatedWebhookRouting(nangoMock as unknown as InternalNango, {}, { type: 'test.fanout', fanoutKey: 'batch-001' } as any, '');

        expect(mock).toHaveBeenCalledTimes(1);
        expect(mock).toHaveBeenCalledWith(
            expect.objectContaining({
                webhookType: 'type',
                connectionIdentifier: 'fanoutKey',
                propName: 'metadata.fanoutKey',
                body: expect.objectContaining({ type: 'test.fanout', fanoutKey: 'batch-001' })
            })
        );
    });

    it('falls back to connectionId routing when fanoutKey is missing', async () => {
        const integration = getTestConfig({ provider: 'unauthenticated' });

        const mock = vi.fn().mockResolvedValueOnce({ connectionIds: ['conn-1'], connectionMetadata: {} });

        const nangoMock = new InternalNango({
            team: seeders.getTestTeam(),
            environment: seeders.getTestEnvironment(),
            plan: seeders.getTestPlan(),
            integration,
            logContextGetter,
            ingressRequestId: 'test-ingress-request-id'
        });
        nangoMock.executeScriptForWebhooks = mock;

        await unauthenticatedWebhookRouting(nangoMock as unknown as InternalNango, {}, { type: 'test.fanout', connectionId: 'conn-1' } as any, '');

        expect(mock).toHaveBeenCalledTimes(1);
        expect(mock).toHaveBeenCalledWith(
            expect.objectContaining({
                webhookType: 'type',
                connectionIdentifier: 'connectionId',
                propName: 'connectionId',
                body: expect.objectContaining({ type: 'test.fanout', connectionId: 'conn-1' })
            })
        );
    });
});
