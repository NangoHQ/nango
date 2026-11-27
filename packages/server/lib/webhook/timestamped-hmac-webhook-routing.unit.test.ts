import crypto from 'node:crypto';

import qs from 'qs';
import { describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { seeders } from '@nangohq/shared';
import { getTestConfig } from '@nangohq/shared/lib/seeders/config.seeder.js';

import { connectionIdSchema } from '../helpers/validation.js';
import elevenLabsWebhookRouting from './elevenlabs-webhook-routing.js';
import { InternalNango } from './internal-nango.js';
import pylonWebhookRouting from './pylon-webhook-routing.js';
import workOSWebhookRouting from './workos-webhook-routing.js';
import zendeskWebhookRouting from './zendesk-webhook-routing.js';

import type { WebhookHandler } from './types.js';

const CONNECTION_ID = 'my-connection-id';
const OTHER_CONNECTION_ID = 'someone-elses-connection-id';
const CONNECTION_SECRET = 'connection-webhook-secret';
const OTHER_CONNECTION_SECRET = 'another-connections-secret';
const QUERY = { nangoConnectionId: CONNECTION_ID };
// Allowed by connectionIdSchema.
const AWKWARD_CONNECTION_ID = 'tenant:1/a b@x+y';

function getNangoMock({
    provider,
    connectionSecret = CONNECTION_SECRET as unknown,
    connectionExists = true
}: {
    provider: string;
    connectionSecret?: unknown;
    connectionExists?: boolean;
}) {
    const nango = new InternalNango({
        team: seeders.getTestTeam(),
        environment: seeders.getTestEnvironment(),
        plan: seeders.getTestPlan(),
        integration: getTestConfig({ provider }),
        request: { method: 'POST', path: '/webhook', headers: {}, query: {}, body: null },
        logContextGetter
    });
    const getConnection = vi.spyOn(nango, 'getConnectionForWebhook').mockImplementation((connectionId: string) => {
        if (connectionId === OTHER_CONNECTION_ID) {
            return Promise.resolve({ connectionId: OTHER_CONNECTION_ID, metadata: { webhookSecret: OTHER_CONNECTION_SECRET } });
        }
        if (!connectionExists) {
            return Promise.resolve(null);
        }
        return Promise.resolve({ connectionId: CONNECTION_ID, metadata: connectionSecret !== null ? { webhookSecret: connectionSecret } : null });
    });
    const execute = vi.spyOn(nango, 'executeScriptForWebhooks').mockResolvedValue({ connectionIds: [CONNECTION_ID], connectionMetadata: {} });

    return { nango, getConnection, execute };
}

function hmac(secret: string, payload: string, digest: 'hex' | 'base64' = 'hex'): string {
    return crypto.createHmac('sha256', secret).update(payload).digest(digest);
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

interface Case {
    provider: string;
    route: WebhookHandler;
    body: Record<string, unknown>;
    webhookType: string | undefined;
    /** Headers for a delivery signed `ageSeconds` ago. */
    sign: (rawBody: string, options?: { secret?: string; ageSeconds?: number }) => Record<string, string>;
    /** Older than the provider accepts. */
    staleSeconds: number;
}

const ELEVENLABS: Case = {
    provider: 'elevenlabs',
    route: elevenLabsWebhookRouting,
    body: { type: 'post_call_transcription', event_timestamp: 1763900000, data: { agent_id: 'agent_1', conversation_id: 'conv_1' } },
    webhookType: 'type',
    sign: (rawBody, { secret = CONNECTION_SECRET, ageSeconds = 0 } = {}) => {
        const timestamp = String(nowSeconds() - ageSeconds);
        return { 'elevenlabs-signature': `t=${timestamp},v0=${hmac(secret, `${timestamp}.${rawBody}`)}` };
    },
    staleSeconds: 31 * 60
};

const cases: Case[] = [
    {
        provider: 'pylon',
        route: pylonWebhookRouting,
        body: { issue_id: 'issue_123', title: 'Printer on fire' },
        webhookType: undefined,
        sign: (rawBody, { secret = CONNECTION_SECRET, ageSeconds = 0 } = {}) => {
            const timestamp = String(nowSeconds() - ageSeconds);
            return { 'x-pylon-timestamp': timestamp, 'x-pylon-signature-v2': hmac(secret, `${timestamp}.${rawBody}`) };
        },
        staleSeconds: 6 * 60
    },
    ELEVENLABS,
    {
        provider: 'workos',
        route: workOSWebhookRouting,
        body: { id: 'event_01H2GNQD5B7G5R8Q3J9V6X2K1M', event: 'dsync.user.created', data: { id: 'directory_user_1' }, created_at: '2026-11-23T15:00:00.000Z' },
        webhookType: 'event',
        sign: (rawBody, { secret = CONNECTION_SECRET, ageSeconds = 0 } = {}) => {
            const timestamp = String(Date.now() - ageSeconds * 1000);
            return { 'workos-signature': `t=${timestamp}, v1=${hmac(secret, `${timestamp}.${rawBody}`)}` };
        },
        staleSeconds: 4 * 60
    },
    {
        provider: 'zendesk',
        route: zendeskWebhookRouting,
        body: { type: 'zen:event-type:ticket.created', account_id: 12514403, id: 'evt_1', detail: { id: '35436' } },
        webhookType: 'type',
        sign: (rawBody, { secret = CONNECTION_SECRET, ageSeconds = 0 } = {}) => {
            const timestamp = new Date((nowSeconds() - ageSeconds) * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
            return { 'x-zendesk-webhook-signature-timestamp': timestamp, 'x-zendesk-webhook-signature': hmac(secret, `${timestamp}${rawBody}`, 'base64') };
        },
        staleSeconds: 6 * 60
    }
];

describe.each(cases)('$provider webhook routing', ({ provider, route, body, webhookType, sign, staleSeconds }) => {
    const rawBody = JSON.stringify(body);

    it("routes a delivery by nangoConnectionId, verified against that connection's own secret", async () => {
        const { nango, getConnection, execute } = getNangoMock({ provider });

        const result = await route(nango, sign(rawBody), body, rawBody, QUERY);

        expect(result.isOk()).toBe(true);
        expect(getConnection).toHaveBeenCalledWith(CONNECTION_ID);
        expect(execute).toHaveBeenCalledWith({
            payload: body,
            ...(webhookType ? { webhookType } : {}),
            connectionIdentifierValue: CONNECTION_ID,
            propName: 'connectionId'
        });
        expect(result.isOk() && result.value).toMatchObject({ statusCode: 200, connectionIds: [CONNECTION_ID], toForward: body });
    });

    // A connection id may hold characters a URL treats specially. The webhook URL carries it URL-encoded, and the
    // server's query parser (qs, see server.ts) decodes it before the router sees it.
    it.each([
        ['percent-encoded', encodeURIComponent(AWKWARD_CONNECTION_ID)],
        ['form-encoded', new URLSearchParams({ id: AWKWARD_CONNECTION_ID }).toString().slice('id='.length)]
    ])('routes by a connection id with characters a URL makes awkward, sent %s', async (_encoding, encoded) => {
        expect(connectionIdSchema.parse(AWKWARD_CONNECTION_ID)).toBe(AWKWARD_CONNECTION_ID);
        const query = qs.parse(`nangoConnectionId=${encoded}`) as Record<string, string>;
        expect(query).toEqual({ nangoConnectionId: AWKWARD_CONNECTION_ID });
        const { nango, getConnection, execute } = getNangoMock({ provider });

        const result = await route(nango, sign(rawBody), body, rawBody, query);

        expect(result.isOk()).toBe(true);
        expect(getConnection).toHaveBeenCalledWith(AWKWARD_CONNECTION_ID);
        expect(execute).toHaveBeenCalledWith(expect.objectContaining({ connectionIdentifierValue: AWKWARD_CONNECTION_ID }));
    });

    it('rejects a webhook without nangoConnectionId', async () => {
        const { nango, getConnection, execute } = getNangoMock({ provider });

        const result = await route(nango, sign(rawBody), body, rawBody, {});

        expect(result.isErr() && result.error).toMatchObject({ type: 'webhook_missing_connection_id' });
        expect(getConnection).not.toHaveBeenCalled();
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a webhook without a signature', async () => {
        const { nango, getConnection, execute } = getNangoMock({ provider });

        const result = await route(nango, {}, body, rawBody, QUERY);

        expect(result.isErr() && result.error).toMatchObject({ type: 'webhook_missing_signature' });
        expect(getConnection).not.toHaveBeenCalled();
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a signature made with another connection’s secret', async () => {
        const { nango, execute } = getNangoMock({ provider });

        const result = await route(nango, sign(rawBody, { secret: OTHER_CONNECTION_SECRET }), body, rawBody, QUERY);

        expect(result.isErr() && result.error).toMatchObject({ type: 'webhook_invalid_signature' });
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a tampered body', async () => {
        const { nango, execute } = getNangoMock({ provider });
        const tampered = JSON.stringify({ ...body, injected: true });

        const result = await route(nango, sign(rawBody), JSON.parse(tampered), tampered, QUERY);

        expect(result.isErr() && result.error).toMatchObject({ type: 'webhook_invalid_signature' });
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a delivery signed longer ago than the provider allows', async () => {
        const { nango, execute } = getNangoMock({ provider });

        const result = await route(nango, sign(rawBody, { ageSeconds: staleSeconds }), body, rawBody, QUERY);

        expect(result.isErr() && result.error).toMatchObject({ type: 'webhook_invalid_signature' });
        expect(execute).not.toHaveBeenCalled();
    });

    // An unknown connection, one without a secret and a wrong signature look the same, so the endpoint
    // can't be used to tell which connections exist or have a secret.
    it.each([
        ['does not exist', { connectionExists: false }],
        ['has no webhook secret', { connectionSecret: null }],
        ['has a secret that is not a string', { connectionSecret: 1234567890123456 }]
    ])('rejects when the connection %s, like a wrong signature', async (_case, options) => {
        const { nango, execute } = getNangoMock({ provider, ...options });

        const result = await route(nango, sign(rawBody), body, rawBody, QUERY);

        expect(result.isErr() && result.error).toMatchObject({ type: 'webhook_invalid_signature' });
        expect(execute).not.toHaveBeenCalled();
    });
});

describe('provider specifics', () => {
    it('pylon does not accept the legacy body-only x-pylon-signature', async () => {
        const { nango, execute } = getNangoMock({ provider: 'pylon' });
        const body = { issue_id: 'issue_123' };
        const rawBody = JSON.stringify(body);

        const result = await pylonWebhookRouting(nango, { 'x-pylon-signature': hmac(CONNECTION_SECRET, rawBody) }, body, rawBody, QUERY);

        expect(result.isErr() && result.error).toMatchObject({ type: 'webhook_missing_signature' });
        expect(execute).not.toHaveBeenCalled();
    });

    it('elevenlabs accepts a delivery signed 20 minutes ago, inside its 30 minute window', async () => {
        const { nango, execute } = getNangoMock({ provider: 'elevenlabs' });
        const elevenlabs = ELEVENLABS;
        const rawBody = JSON.stringify(elevenlabs.body);

        const result = await elevenlabs.route(nango, elevenlabs.sign(rawBody, { ageSeconds: 20 * 60 }), elevenlabs.body, rawBody, QUERY);

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledOnce();
    });

    it('elevenlabs accepts any one of several v0 signatures', async () => {
        const { nango, execute } = getNangoMock({ provider: 'elevenlabs' });
        const body = { type: 'post_call_audio', event_timestamp: 1763900000, data: {} };
        const rawBody = JSON.stringify(body);
        const timestamp = String(nowSeconds());
        const header = `t=${timestamp},v0=${hmac(OTHER_CONNECTION_SECRET, `${timestamp}.${rawBody}`)},v0=${hmac(CONNECTION_SECRET, `${timestamp}.${rawBody}`)}`;

        const result = await elevenLabsWebhookRouting(nango, { 'elevenlabs-signature': header }, body, rawBody, QUERY);

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledOnce();
    });

    it('workos reads its timestamp as milliseconds, so one sent in seconds is stale', async () => {
        const { nango, execute } = getNangoMock({ provider: 'workos' });
        const body = { id: 'event_1', event: 'user.created', data: {}, created_at: '2026-11-23T15:00:00.000Z' };
        const rawBody = JSON.stringify(body);
        const timestamp = String(nowSeconds());

        const result = await workOSWebhookRouting(
            nango,
            { 'workos-signature': `t=${timestamp}, v1=${hmac(CONNECTION_SECRET, `${timestamp}.${rawBody}`)}` },
            body,
            rawBody,
            QUERY
        );

        expect(result.isErr() && result.error).toMatchObject({ type: 'webhook_invalid_signature' });
        expect(execute).not.toHaveBeenCalled();
    });

    it('zendesk rejects a timestamp that is not a date', async () => {
        const { nango, execute } = getNangoMock({ provider: 'zendesk' });
        const body = { type: 'zen:event-type:ticket.created' };
        const rawBody = JSON.stringify(body);
        const timestamp = 'not-a-date';

        const result = await zendeskWebhookRouting(
            nango,
            { 'x-zendesk-webhook-signature-timestamp': timestamp, 'x-zendesk-webhook-signature': hmac(CONNECTION_SECRET, `${timestamp}${rawBody}`, 'base64') },
            body,
            rawBody,
            QUERY
        );

        expect(result.isErr() && result.error).toMatchObject({ type: 'webhook_invalid_signature' });
        expect(execute).not.toHaveBeenCalled();
    });

    it('zendesk routes a trigger webhook whose body has no type', async () => {
        const { nango, execute } = getNangoMock({ provider: 'zendesk' });
        const body = { ticket_id: '35436', status: 'open' };
        const rawBody = JSON.stringify(body);
        const timestamp = new Date().toISOString();

        const result = await zendeskWebhookRouting(
            nango,
            { 'x-zendesk-webhook-signature-timestamp': timestamp, 'x-zendesk-webhook-signature': hmac(CONNECTION_SECRET, `${timestamp}${rawBody}`, 'base64') },
            body,
            rawBody,
            QUERY
        );

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledWith(expect.objectContaining({ payload: body, webhookType: 'type' }));
    });
});
