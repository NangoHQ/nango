import { describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { seeders } from '@nangohq/shared';
import { getTestConfig } from '@nangohq/shared/lib/seeders/config.seeder.js';

import { InternalNango } from './internal-nango.js';
import postHogWebhookRouting from './posthog-webhook-routing.js';
import supabaseWebhookRouting from './supabase-webhook-routing.js';
import telegramWebhookRouting from './telegram-webhook-routing.js';

import type { WebhookHandler } from './types.js';

const CONNECTION_ID = 'my-connection-id';
const CONNECTION_SECRET = 'a-connection-secret-of-32-chars!';
const QUERY = { nangoConnectionId: CONNECTION_ID };

function getNangoMock({
    provider,
    connectionSecret = CONNECTION_SECRET as unknown,
    connectionExists = true,
    allowUnverified = false
}: {
    provider: string;
    connectionSecret?: unknown;
    connectionExists?: boolean;
    allowUnverified?: boolean;
}) {
    const nango = new InternalNango({
        team: seeders.getTestTeam(),
        environment: seeders.getTestEnvironment(),
        plan: seeders.getTestPlan(),
        integration: { ...getTestConfig({ provider }), allow_unverified_webhooks: allowUnverified },
        request: { method: 'POST', path: '/webhook', headers: {}, query: {}, body: null },
        logContextGetter
    });
    const getConnection = vi
        .spyOn(nango, 'getConnectionForWebhook')
        .mockResolvedValue(
            connectionExists ? { connectionId: CONNECTION_ID, metadata: connectionSecret !== null ? { webhookSecret: connectionSecret } : null } : null
        );
    const execute = vi.spyOn(nango, 'executeScriptForWebhooks').mockResolvedValue({ connectionIds: [CONNECTION_ID], connectionMetadata: {} });

    return { nango, getConnection, execute };
}

interface Case {
    provider: string;
    route: WebhookHandler;
    body: Record<string, unknown>;
    secretHeader: string;
    dispatched: Record<string, unknown>;
}

const POSTHOG_BODY = { event: { uuid: '0193', event: '$pageview', distinct_id: 'user-1', properties: {} }, person: { id: 'person-1' } };
const SUPABASE_BODY = { type: 'INSERT', table: 'orders', schema: 'public', record: { id: 1 }, old_record: null };
const TELEGRAM_BODY = { update_id: 10000, message: { message_id: 1, chat: { id: 1111, type: 'private' }, text: 'hi' } };

const cases: Case[] = [
    {
        provider: 'posthog',
        route: postHogWebhookRouting,
        body: POSTHOG_BODY,
        secretHeader: 'x-nango-webhook-secret',
        dispatched: { webhookType: 'event.event' }
    },
    { provider: 'supabase', route: supabaseWebhookRouting, body: SUPABASE_BODY, secretHeader: 'x-nango-webhook-secret', dispatched: { webhookType: 'type' } },
    {
        provider: 'telegram',
        route: telegramWebhookRouting,
        body: TELEGRAM_BODY,
        secretHeader: 'x-telegram-bot-api-secret-token',
        dispatched: { webhookTypeValue: 'message' }
    }
];

describe.each(cases)('$provider webhook routing', ({ provider, route, body, secretHeader, dispatched }) => {
    const rawBody = JSON.stringify(body);

    it("routes by nangoConnectionId when the caller sends that connection's secret", async () => {
        const { nango, getConnection, execute } = getNangoMock({ provider });

        const result = await route(nango, { [secretHeader]: CONNECTION_SECRET }, body, rawBody, QUERY);

        expect(result.isOk()).toBe(true);
        expect(getConnection).toHaveBeenCalledWith(CONNECTION_ID);
        expect(execute).toHaveBeenCalledWith({ payload: body, ...dispatched, connectionIdentifierValue: CONNECTION_ID, propName: 'connectionId' });
        expect(result.isOk() && result.value).toMatchObject({ statusCode: 200, connectionIds: [CONNECTION_ID], toForward: body });
    });

    it('rejects a webhook without nangoConnectionId', async () => {
        const { nango, getConnection, execute } = getNangoMock({ provider });

        const result = await route(nango, { [secretHeader]: CONNECTION_SECRET }, body, rawBody, {});

        expect(result.isErr() && result.error).toMatchObject({ type: 'webhook_missing_connection_id' });
        expect(getConnection).not.toHaveBeenCalled();
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a webhook without a secret', async () => {
        const { nango, execute } = getNangoMock({ provider });

        const result = await route(nango, {}, body, rawBody, QUERY);

        expect(result.isErr() && result.error).toMatchObject({ type: 'webhook_missing_signature' });
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a wrong secret, even when the integration allows unverified webhooks', async () => {
        const { nango, execute } = getNangoMock({ provider, allowUnverified: true });

        const result = await route(nango, { [secretHeader]: 'not-the-connection-secret-value' }, body, rawBody, QUERY);

        expect(result.isErr() && result.error).toMatchObject({ type: 'webhook_invalid_signature' });
        expect(execute).not.toHaveBeenCalled();
    });

    // An unknown connection and one without a secret look like a wrong secret, so the endpoint can't be used
    // to tell which connections exist or have a secret.
    it.each([
        ['does not exist', { connectionExists: false }],
        ['has no webhook secret', { connectionSecret: null }],
        ['has a secret that is not a string', { connectionSecret: 1234567890123456 }],
        ['has a secret shorter than 16 characters', { connectionSecret: 'short' }]
    ])('rejects when the connection %s, like a wrong secret', async (_case, options) => {
        const { nango, execute } = getNangoMock({ provider, ...options });

        const result = await route(nango, { [secretHeader]: CONNECTION_SECRET }, body, rawBody, QUERY);

        expect(result.isErr() && result.error).toMatchObject({ type: 'webhook_invalid_signature' });
        expect(execute).not.toHaveBeenCalled();
    });

    it('routes to a connection without a secret only when the integration allows unverified webhooks', async () => {
        const { nango, execute } = getNangoMock({ provider, connectionSecret: null, allowUnverified: true });

        const result = await route(nango, {}, body, rawBody, QUERY);

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledOnce();
    });
});

describe('telegram', () => {
    const rawBody = JSON.stringify(TELEGRAM_BODY);

    it('only accepts the secret in its own header', async () => {
        const { nango, execute } = getNangoMock({ provider: 'telegram' });

        const viaNangoHeader = await telegramWebhookRouting(nango, { 'x-nango-webhook-secret': CONNECTION_SECRET }, TELEGRAM_BODY, rawBody, QUERY);
        const viaQueryParam = await telegramWebhookRouting(nango, {}, TELEGRAM_BODY, rawBody, { ...QUERY, nangoWebhookSecret: CONNECTION_SECRET });

        expect(viaNangoHeader.isErr() && viaNangoHeader.error).toMatchObject({ type: 'webhook_missing_signature' });
        expect(viaQueryParam.isErr() && viaQueryParam.error).toMatchObject({ type: 'webhook_missing_signature' });
        expect(execute).not.toHaveBeenCalled();
    });

    it('uses the update kind as the webhook type', async () => {
        const { nango, execute } = getNangoMock({ provider: 'telegram' });
        const body = { update_id: 10001, callback_query: { id: 'cb-1', data: 'yes' } };

        const result = await telegramWebhookRouting(nango, { 'x-telegram-bot-api-secret-token': CONNECTION_SECRET }, body, JSON.stringify(body), QUERY);

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledWith(expect.objectContaining({ webhookTypeValue: 'callback_query' }));
    });

    it('routes an authenticated request without a parsed body, with no webhook type', async () => {
        const { nango, execute } = getNangoMock({ provider: 'telegram' });

        const result = await telegramWebhookRouting(nango, { 'x-telegram-bot-api-secret-token': CONNECTION_SECRET }, undefined as never, '', QUERY);

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledTimes(1);
        expect(execute.mock.calls[0]?.[0]).not.toHaveProperty('webhookTypeValue');
    });
});
