import { describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { seeders } from '@nangohq/shared';
import { getTestConfig } from '@nangohq/shared/lib/seeders/config.seeder.js';

import * as HaloPsaWebhookRouting from './halo-psa-webhook-routing.js';
import { InternalNango } from './internal-nango.js';

function getNangoMock({ webhookSecret }: { webhookSecret?: string } = {}) {
    const integration = getTestConfig({
        provider: 'halo-psa',
        custom: webhookSecret ? { webhookSecret } : {}
    });

    const mock = vi.fn().mockResolvedValue({ connectionIds: ['halo-connection'], connectionMetadata: {} });
    const nangoMock = new InternalNango({
        team: seeders.getTestTeam(),
        environment: seeders.getTestEnvironment(),
        plan: seeders.getTestPlan(),
        integration,
        logContextGetter
    });
    nangoMock.executeScriptForWebhooks = mock;

    return { mock, nangoMock };
}

function basicAuth(password: string) {
    return `Basic ${Buffer.from(`nango:${password}`).toString('base64')}`;
}

describe('haloPsaWebhookRouting', () => {
    it('routes a standard Halo webhook using connectionId and webhookType query params', async () => {
        const { mock, nangoMock } = getNangoMock();
        const body = {
            ticket: { id: 123, summary: 'Printer on fire' },
            action: { id: 456, outcome: 'New Ticket Logged' }
        };

        const result = await HaloPsaWebhookRouting.default(nangoMock, {}, body, JSON.stringify(body), {
            connectionId: 'halo-connection',
            webhookType: 'ticket.created'
        });

        expect(result.isOk()).toBe(true);
        expect(mock).toHaveBeenCalledOnce();
        expect(mock).toHaveBeenCalledWith({
            body: {
                ...body,
                nango: {
                    connectionId: 'halo-connection',
                    webhookType: 'ticket.created'
                }
            },
            webhookTypeValue: 'ticket.created',
            connectionIdentifierValue: 'halo-connection',
            propName: 'connectionId'
        });
    });

    it('routes a custom Halo payload using body fields', async () => {
        const { mock, nangoMock } = getNangoMock();
        const body = {
            connectionId: 'body-connection',
            type: 'ticket.updated',
            ticketId: 123
        };

        const result = await HaloPsaWebhookRouting.default(nangoMock, {}, body, JSON.stringify(body));

        expect(result.isOk()).toBe(true);
        expect(mock).toHaveBeenCalledOnce();
        expect(mock).toHaveBeenCalledWith(
            expect.objectContaining({
                webhookTypeValue: 'ticket.updated',
                connectionIdentifierValue: 'body-connection'
            })
        );
    });

    it('wraps batched Halo events for onWebhook scripts', async () => {
        const { mock, nangoMock } = getNangoMock();
        const body = [{ ticket: { id: 123 } }, { ticket: { id: 456 } }];

        const result = await HaloPsaWebhookRouting.default(nangoMock, {}, body, JSON.stringify(body), {
            connectionId: 'halo-connection',
            webhookType: 'ticket.batch'
        });

        expect(result.isOk()).toBe(true);
        expect(mock).toHaveBeenCalledWith(
            expect.objectContaining({
                body: {
                    events: body,
                    nango: {
                        connectionId: 'halo-connection',
                        webhookType: 'ticket.batch'
                    }
                }
            })
        );
    });

    it('rejects Halo webhooks that do not identify a Nango connection', async () => {
        const { mock, nangoMock } = getNangoMock();
        const body = { ticketId: 123 };

        const result = await HaloPsaWebhookRouting.default(nangoMock, {}, body, JSON.stringify(body));

        expect(result.isErr()).toBe(true);
        expect(mock).not.toHaveBeenCalled();
    });

    it('accepts Halo Basic Auth when the password matches the configured webhook secret', async () => {
        const { mock, nangoMock } = getNangoMock({ webhookSecret: 'secret-from-nango' });
        const body = { connectionId: 'halo-connection', type: 'ticket.created' };

        const result = await HaloPsaWebhookRouting.default(nangoMock, { authorization: basicAuth('secret-from-nango') }, body, JSON.stringify(body));

        expect(result.isOk()).toBe(true);
        expect(mock).toHaveBeenCalledOnce();
    });

    it('rejects Halo Basic Auth when a webhook secret is configured but the password does not match', async () => {
        const { mock, nangoMock } = getNangoMock({ webhookSecret: 'secret-from-nango' });
        const body = { connectionId: 'halo-connection', type: 'ticket.created' };

        const result = await HaloPsaWebhookRouting.default(nangoMock, { authorization: basicAuth('wrong-secret') }, body, JSON.stringify(body));

        expect(result.isErr()).toBe(true);
        expect(mock).not.toHaveBeenCalled();
    });
});
