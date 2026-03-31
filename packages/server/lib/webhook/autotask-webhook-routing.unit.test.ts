import { describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { seeders } from '@nangohq/shared';
import { getTestConfig } from '@nangohq/shared/lib/seeders/config.seeder.js';

import * as AutotaskWebhookRouting from './autotask-webhook-routing.js';
import { InternalNango } from './internal-nango.js';

import type { AutotaskWebhookPayload } from './types.js';

describe('Autotask webhook routing', () => {
    it('Should route ticket create webhook by Guid and EntityType', async () => {
        const integration = getTestConfig({ provider: 'autotask' });

        const mock = vi.fn();
        const nangoMock = new InternalNango({
            team: seeders.getTestTeam(),
            environment: seeders.getTestEnvironment(),
            plan: seeders.getTestPlan(),
            integration,
            logContextGetter
        });
        nangoMock.executeScriptForWebhooks = mock;

        const body: AutotaskWebhookPayload = {
            Action: 'Create',
            Guid: 'a1da62a4-2c49-40a8-8183-69994ce5b3eb',
            EntityType: 'Ticket',
            Id: 351181,
            Fields: {
                TicketNumber: 'T20250915.0001'
            },
            EventTime: '2025-09-15T14:57:50Z',
            SequenceNumber: 1,
            PersonId: 30691780
        };

        const headers = { 'x-hook-signature': 'sha1=fakesignature' };
        const rawBody = JSON.stringify(body);

        const result = await AutotaskWebhookRouting.default(nangoMock as unknown as InternalNango, headers, body, rawBody);

        expect(result.isOk()).toBe(true);
        expect(mock).toHaveBeenCalledOnce();
        expect(mock).toHaveBeenCalledWith({
            body,
            webhookType: 'EntityType',
            connectionIdentifier: 'Guid',
            propName: 'metadata.webhookGuid'
        });
    });

    it('Should route ticket update webhook by Guid and EntityType', async () => {
        const integration = getTestConfig({ provider: 'autotask' });

        const mock = vi.fn();
        const nangoMock = new InternalNango({
            team: seeders.getTestTeam(),
            environment: seeders.getTestEnvironment(),
            plan: seeders.getTestPlan(),
            integration,
            logContextGetter
        });
        nangoMock.executeScriptForWebhooks = mock;

        const body: AutotaskWebhookPayload = {
            Action: 'Update',
            Guid: 'd0046a73-76a0-41c4-a634-4b7fce7e43ec',
            EntityType: 'Ticket',
            Id: 351182,
            Fields: {
                TicketNumber: 'T20250915.0002',
                Status: '5'
            },
            EventTime: '2025-09-15T15:10:00Z',
            SequenceNumber: 2,
            PersonId: 30691780
        };

        const headers = {};
        const rawBody = JSON.stringify(body);

        const result = await AutotaskWebhookRouting.default(nangoMock as unknown as InternalNango, headers, body, rawBody);

        expect(result.isOk()).toBe(true);
        expect(mock).toHaveBeenCalledOnce();
        expect(mock).toHaveBeenCalledWith({
            body,
            webhookType: 'EntityType',
            connectionIdentifier: 'Guid',
            propName: 'metadata.webhookGuid'
        });
    });

    it('Should route ticket delete webhook by Guid and EntityType', async () => {
        const integration = getTestConfig({ provider: 'autotask' });

        const mock = vi.fn();
        const nangoMock = new InternalNango({
            team: seeders.getTestTeam(),
            environment: seeders.getTestEnvironment(),
            plan: seeders.getTestPlan(),
            integration,
            logContextGetter
        });
        nangoMock.executeScriptForWebhooks = mock;

        const body: AutotaskWebhookPayload = {
            Action: 'Delete',
            Guid: 'a1da62a4-2c49-40a8-8183-69994ce5b3eb',
            EntityType: 'Ticket',
            Id: 351181,
            Fields: {},
            EventTime: '2025-09-15T16:00:00Z',
            SequenceNumber: 3,
            PersonId: 30691780
        };

        const headers = { 'x-hook-signature': 'sha1=anotherfakesig' };
        const rawBody = JSON.stringify(body);

        const result = await AutotaskWebhookRouting.default(nangoMock as unknown as InternalNango, headers, body, rawBody);

        expect(result.isOk()).toBe(true);
        expect(mock).toHaveBeenCalledOnce();
        expect(mock).toHaveBeenCalledWith({
            body,
            webhookType: 'EntityType',
            connectionIdentifier: 'Guid',
            propName: 'metadata.webhookGuid'
        });
    });

    it('Should forward the full body for webhook forwarding', async () => {
        const integration = getTestConfig({ provider: 'autotask' });

        const mock = vi.fn();
        const nangoMock = new InternalNango({
            team: seeders.getTestTeam(),
            environment: seeders.getTestEnvironment(),
            plan: seeders.getTestPlan(),
            integration,
            logContextGetter
        });
        nangoMock.executeScriptForWebhooks = mock;

        const body: AutotaskWebhookPayload = {
            Action: 'Create',
            Guid: 'a1da62a4-2c49-40a8-8183-69994ce5b3eb',
            EntityType: 'Ticket',
            Id: 999999,
            Fields: {
                TicketNumber: 'T20250915.9999'
            },
            EventTime: '2025-09-15T17:00:00Z',
            SequenceNumber: 1,
            PersonId: 30691780
        };

        const rawBody = JSON.stringify(body);

        const result = await AutotaskWebhookRouting.default(nangoMock as unknown as InternalNango, {}, body, rawBody);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            const value = result.value as { toForward: unknown; statusCode: number; content: unknown };
            expect(value.toForward).toEqual(body);
            expect(value.statusCode).toBe(200);
            expect(value.content).toEqual({ status: 'success' });
        }
    });
});
