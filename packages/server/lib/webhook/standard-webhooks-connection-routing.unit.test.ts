import crypto from 'node:crypto';

import qs from 'qs';
import { describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { seeders } from '@nangohq/shared';
import { getTestConfig } from '@nangohq/shared/lib/seeders/config.seeder.js';

import { connectionIdSchema } from '../helpers/validation.js';
import { InternalNango } from './internal-nango.js';
import {
    clerkWebhookRouting,
    incidentIoWebhookRouting,
    openaiWebhookRouting,
    postHogWebhookRouting,
    resendWebhookRouting
} from './standard-webhooks-connection-routing.js';

import type { WebhookHandler } from './types.js';

const CONNECTION_ID = 'my-connection-id';
const OTHER_CONNECTION_ID = 'someone-elses-connection-id';
const CONNECTION_SECRET = `whsec_${Buffer.from('connection-secret-24-bytes!').toString('base64')}`;
const OTHER_CONNECTION_SECRET = `whsec_${Buffer.from('another-secret-of-24-byte').toString('base64')}`;
const QUERY = { nangoConnectionId: CONNECTION_ID };
// Allowed by connectionIdSchema.
const AWKWARD_CONNECTION_ID = 'tenant:1/a b@x+y';

function getNangoMock({ provider = 'incident-io', connectionSecret = CONNECTION_SECRET as unknown, connectionExists = true } = {}) {
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

function sign({
    rawBody,
    secret = CONNECTION_SECRET,
    msgId = 'msg_2KWPBgLlAfxdpx2AI54pPJ85f4W',
    timestamp = Math.floor(Date.now() / 1000),
    prefix = 'webhook'
}: {
    rawBody: string;
    secret?: string;
    msgId?: string;
    timestamp?: number;
    prefix?: 'webhook' | 'svix';
}): Record<string, string> {
    const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
    const signature = crypto.createHmac('sha256', key).update(`${msgId}.${timestamp}.${rawBody}`).digest('base64');
    return { [`${prefix}-id`]: msgId, [`${prefix}-timestamp`]: String(timestamp), [`${prefix}-signature`]: `v1,${signature}` };
}

const INCIDENT_BODY = { event_type: 'public_incident.incident_created_v2', 'public_incident.incident_created_v2': { id: '01FCNDV6P870EA6S7TK1DSYDG0' } };

const providers: { provider: string; route: WebhookHandler; body: Record<string, unknown>; webhookType: string | undefined; prefix: 'webhook' | 'svix' }[] = [
    {
        provider: 'incident-io',
        route: incidentIoWebhookRouting,
        body: INCIDENT_BODY,
        webhookType: 'event_type',
        prefix: 'webhook'
    },
    {
        provider: 'clerk',
        route: clerkWebhookRouting,
        body: { type: 'user.created', object: 'event', data: { id: 'user_29w83sxmDNGwOuEthce5gg56FcC' }, timestamp: 1654012591835, instance_id: 'ins_123' },
        webhookType: 'type',
        prefix: 'svix'
    },
    {
        provider: 'resend',
        route: resendWebhookRouting,
        body: { type: 'email.sent', created_at: '2026-11-23T15:00:00.000Z', data: { email_id: 'e1' } },
        webhookType: 'type',
        prefix: 'svix'
    },
    {
        provider: 'openai',
        route: openaiWebhookRouting,
        body: { id: 'evt_685343a1381c819085d44c354e1b330e', object: 'event', type: 'response.completed', created_at: 1763900000, data: { id: 'resp_abc' } },
        webhookType: 'type',
        prefix: 'webhook'
    },
    {
        provider: 'posthog',
        route: postHogWebhookRouting,
        body: { event: { uuid: '0193a3c1-5a1e-7000-8000-000000000000', event: '$pageview', distinct_id: 'user-1', properties: {} }, person: { id: 'p1' } },
        webhookType: 'event.event',
        prefix: 'webhook'
    }
];

describe('Standard Webhooks connection routing', () => {
    it.each(providers)(
        "routes a $provider delivery by nangoConnectionId, verified against that connection's own secret",
        async ({ provider, route, body, webhookType, prefix }) => {
            const { nango, getConnection, execute } = getNangoMock({ provider });
            const rawBody = JSON.stringify(body);

            const result = await route(nango, sign({ rawBody, prefix }), body, rawBody, QUERY);

            expect(result.isOk()).toBe(true);
            expect(getConnection).toHaveBeenCalledWith(CONNECTION_ID);
            expect(execute).toHaveBeenCalledWith({
                payload: body,
                ...(webhookType ? { webhookType } : {}),
                connectionIdentifierValue: CONNECTION_ID,
                propName: 'connectionId'
            });
            expect(result.isOk() && result.value).toMatchObject({ statusCode: 200, connectionIds: [CONNECTION_ID], toForward: body });
        }
    );

    // A connection id may hold characters a URL treats specially. The webhook URL carries it URL-encoded, and the
    // server's query parser (qs, see server.ts) decodes it before the router sees it.
    it.each([
        ['percent-encoded', encodeURIComponent(AWKWARD_CONNECTION_ID)],
        ['form-encoded', new URLSearchParams({ id: AWKWARD_CONNECTION_ID }).toString().slice('id='.length)]
    ])('routes by a connection id with characters a URL makes awkward, sent %s', async (_encoding, encoded) => {
        expect(connectionIdSchema.parse(AWKWARD_CONNECTION_ID)).toBe(AWKWARD_CONNECTION_ID);
        const query = qs.parse(`nangoConnectionId=${encoded}`) as Record<string, string>;
        expect(query).toEqual({ nangoConnectionId: AWKWARD_CONNECTION_ID });

        const { nango, getConnection, execute } = getNangoMock();
        const body = INCIDENT_BODY;
        const rawBody = JSON.stringify(body);

        const result = await incidentIoWebhookRouting(nango, sign({ rawBody }), body, rawBody, query);

        expect(result.isOk()).toBe(true);
        expect(getConnection).toHaveBeenCalledWith(AWKWARD_CONNECTION_ID);
        expect(execute).toHaveBeenCalledWith(expect.objectContaining({ connectionIdentifierValue: AWKWARD_CONNECTION_ID }));
    });

    it.each(['webhook', 'svix'] as const)('accepts the %s-* header names', async (prefix) => {
        const { nango, execute } = getNangoMock();
        const body = INCIDENT_BODY;
        const rawBody = JSON.stringify(body);

        const result = await incidentIoWebhookRouting(nango, sign({ rawBody, prefix }), body, rawBody, QUERY);

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledOnce();
    });

    it('accepts a secret without the whsec_ prefix, as PostHog lets the user enter one', async () => {
        const secret = Buffer.from('posthog-secret-of-32-bytes-long!').toString('base64');
        const { nango, execute } = getNangoMock({ provider: 'posthog', connectionSecret: secret });
        const body = { event: { event: '$pageview' } };
        const rawBody = JSON.stringify(body);

        const result = await postHogWebhookRouting(nango, sign({ rawBody, secret }), body, rawBody, QUERY);

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledWith(expect.objectContaining({ webhookType: 'event.event' }));
    });

    it('accepts any one of several signatures, as sent while a secret is being rotated', async () => {
        const { nango, execute } = getNangoMock();
        const body = INCIDENT_BODY;
        const rawBody = JSON.stringify(body);
        const headers = sign({ rawBody });
        headers['webhook-signature'] = `v1,${Buffer.from('a-signature-from-the-old-secret').toString('base64')} ${headers['webhook-signature']}`;

        const result = await incidentIoWebhookRouting(nango, headers, body, rawBody, QUERY);

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledOnce();
    });

    describe.each(providers)('$provider rejects', ({ provider, route, body }) => {
        const rawBody = JSON.stringify(body);

        it('a webhook without nangoConnectionId', async () => {
            const { nango, getConnection, execute } = getNangoMock({ provider });

            const result = await route(nango, sign({ rawBody }), body, rawBody, {});

            expect(result.isErr() && result.error).toMatchObject({ type: 'webhook_missing_connection_id' });
            expect(getConnection).not.toHaveBeenCalled();
            expect(execute).not.toHaveBeenCalled();
        });

        it('a webhook without a signature', async () => {
            const { nango, getConnection, execute } = getNangoMock({ provider });

            const result = await route(nango, {}, body, rawBody, QUERY);

            expect(result.isErr() && result.error).toMatchObject({ type: 'webhook_missing_signature' });
            expect(getConnection).not.toHaveBeenCalled();
            expect(execute).not.toHaveBeenCalled();
        });

        it('a signature made with another connection’s secret', async () => {
            const { nango, execute } = getNangoMock({ provider });

            const result = await route(nango, sign({ rawBody, secret: OTHER_CONNECTION_SECRET }), body, rawBody, QUERY);

            expect(result.isErr() && result.error).toMatchObject({ type: 'webhook_invalid_signature' });
            expect(execute).not.toHaveBeenCalled();
        });

        it('a tampered body', async () => {
            const { nango, execute } = getNangoMock({ provider });
            const tampered = JSON.stringify({ ...body, injected: true });

            const result = await route(nango, sign({ rawBody }), JSON.parse(tampered), tampered, QUERY);

            expect(result.isErr() && result.error).toMatchObject({ type: 'webhook_invalid_signature' });
            expect(execute).not.toHaveBeenCalled();
        });

        it('a delivery signed more than 5 minutes ago', async () => {
            const { nango, execute } = getNangoMock({ provider });

            const result = await route(nango, sign({ rawBody, timestamp: Math.floor(Date.now() / 1000) - 6 * 60 }), body, rawBody, QUERY);

            expect(result.isErr() && result.error).toMatchObject({ type: 'webhook_invalid_signature' });
            expect(execute).not.toHaveBeenCalled();
        });
    });

    // An unknown connection, one without a secret and a wrong signature look the same, so the endpoint
    // can't be used to tell which connections exist or have a secret.
    it.each([
        ['does not exist', { connectionExists: false }],
        ['has no webhook secret', { connectionSecret: null }],
        ['has a secret that is not a string', { connectionSecret: 1234567890123456 }]
    ])('rejects when the connection %s, like a wrong signature', async (_case, options) => {
        const { nango, execute } = getNangoMock(options);
        const body = INCIDENT_BODY;
        const rawBody = JSON.stringify(body);

        const result = await incidentIoWebhookRouting(nango, sign({ rawBody }), body, rawBody, QUERY);

        expect(result.isErr() && result.error).toMatchObject({ type: 'webhook_invalid_signature' });
        expect(execute).not.toHaveBeenCalled();
    });

    it.each(['webhook-id', 'webhook-timestamp'] as const)('rejects a signature without its %s before looking up the connection', async (header) => {
        const body = INCIDENT_BODY;
        const rawBody = JSON.stringify(body);
        const { [header]: _removed, ...headers } = sign({ rawBody });

        // The answer must not depend on whether the connection exists or has a secret.
        for (const options of [{}, { connectionExists: false }, { connectionSecret: null }]) {
            const { nango, getConnection, execute } = getNangoMock(options);

            const result = await incidentIoWebhookRouting(nango, headers, body, rawBody, QUERY);

            expect(result.isErr() && result.error).toMatchObject({ type: 'webhook_missing_signature' });
            expect(getConnection).not.toHaveBeenCalled();
            expect(execute).not.toHaveBeenCalled();
        }
    });
});
