import crypto from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { seeders } from '@nangohq/shared';
import { getTestConfig } from '@nangohq/shared/lib/seeders/config.seeder.js';

import { InternalNango } from './internal-nango.js';
import * as QuickBooksWebhookRouting from './quickbooks-webhook-routing.js';

const REALM_ID = '9341454977738491';
const VERIFIER_TOKEN = 'intuit-verifier-token';
const CONNECTION_ID = 'connection-id';

function getNangoMock(webhookSecret: string | null = VERIFIER_TOKEN) {
    const integration = getTestConfig({
        provider: 'quickbooks',
        ...(webhookSecret === null ? {} : { custom: { webhookSecret } })
    });
    const nango = new InternalNango({
        team: seeders.getTestTeam(),
        environment: seeders.getTestEnvironment(),
        plan: seeders.getTestPlan(),
        integration,
        request: { method: 'POST', path: '/webhook', headers: {}, query: {}, body: null },
        logContextGetter
    });
    const execute = vi.spyOn(nango, 'executeScriptForWebhooks').mockResolvedValue({
        connectionIds: [CONNECTION_ID],
        connectionMetadata: {}
    });

    return { nango, execute };
}

function signedHeaders(rawBody: string): Record<string, string> {
    const signature = crypto.createHmac('sha256', VERIFIER_TOKEN).update(rawBody).digest('base64');
    return { 'intuit-signature': signature };
}

const BODY = {
    eventNotifications: [
        {
            realmId: REALM_ID,
            dataChangeEvent: {
                entities: [{ name: 'Invoice', id: '145', operation: 'Update' as const, lastUpdated: '2026-10-07T22:00:00.000Z' }]
            }
        }
    ]
};

describe('QuickBooks webhook routing', () => {
    it('routes a signed webhook to the connection for its realm', async () => {
        const { nango, execute } = getNangoMock();
        const rawBody = JSON.stringify(BODY);

        const result = await QuickBooksWebhookRouting.default(nango, signedHeaders(rawBody), BODY, rawBody);

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledWith({
            payload: BODY,
            webhookTypeValue: 'Invoice',
            connectionIdentifierValue: REALM_ID,
            propName: 'realmId'
        });
        if (result.isOk()) {
            expect(result.value).toMatchObject({
                content: { status: 'success' },
                statusCode: 200,
                connectionIds: [CONNECTION_ID],
                toForward: BODY
            });
        }
    });

    it('rejects a webhook with no signature', async () => {
        const { nango, execute } = getNangoMock();

        const result = await QuickBooksWebhookRouting.default(nango, {}, BODY, JSON.stringify(BODY));

        expect(result.isErr()).toBe(true);
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a webhook with an invalid signature', async () => {
        const { nango, execute } = getNangoMock();

        const result = await QuickBooksWebhookRouting.default(nango, { 'intuit-signature': 'not-the-signature' }, BODY, JSON.stringify(BODY));

        expect(result.isErr()).toBe(true);
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a webhook when no verifier token is configured', async () => {
        const { nango, execute } = getNangoMock(null);
        const rawBody = JSON.stringify(BODY);

        const result = await QuickBooksWebhookRouting.default(nango, signedHeaders(rawBody), BODY, rawBody);

        expect(result.isErr()).toBe(true);
        expect(execute).not.toHaveBeenCalled();
    });

    it('acknowledges an empty event list without dispatching', async () => {
        const { nango, execute } = getNangoMock();
        const body = { eventNotifications: [] };
        const rawBody = JSON.stringify(body);

        const result = await QuickBooksWebhookRouting.default(nango, signedHeaders(rawBody), body, rawBody);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value.statusCode).toBe(200);
            expect(result.value).not.toHaveProperty('toForward');
        }
        expect(execute).not.toHaveBeenCalled();
    });
});
