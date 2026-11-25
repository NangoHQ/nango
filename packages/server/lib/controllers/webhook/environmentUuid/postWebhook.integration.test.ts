import crypto from 'node:crypto';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import db from '@nangohq/database';
import { externalWebhookService, seeders } from '@nangohq/shared';
import { envs } from '@nangohq/webhooks/dist/envs.js';

import { runServer } from '../../../utils/tests.js';
import { InternalNango } from '../../../webhook/internal-nango.js';

let api: Awaited<ReturnType<typeof runServer>>;

const WEBHOOKS_PLAN = { has_webhooks_forward: true, has_webhooks_script: true };

const SECRET = `whsec_${Buffer.from('connection-secret-24-bytes!').toString('base64')}`;

function svixHeaders(rawBody: string): Record<string, string> {
    const id = 'msg_2KWPBgLlAfxdpx2AI54pPJ85f4W';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const key = Buffer.from(SECRET.replace(/^whsec_/, ''), 'base64');
    const signature = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest('base64');
    return { 'content-type': 'application/json', 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': `v1,${signature}` };
}

async function post(path: string, body: unknown, headers: Record<string, string> = {}) {
    const rawBody = JSON.stringify(body);
    const res = await fetch(`${api.url}${path}`, { method: 'POST', body: rawBody, headers: { ...svixHeaders(rawBody), ...headers } });
    return { status: res.status, json: (await res.json().catch(() => null)) as unknown };
}

/**
 * A server standing in for the customer's webhook URL, collecting what Nango forwards to it. It listens on the
 * machine's private address because Nango never delivers to loopback.
 */
async function webhookReceiver() {
    const host = Object.values(networkInterfaces())
        .flat()
        .find((address) => address?.family === 'IPv4' && !address.internal)?.address;
    if (!host) {
        throw new Error('webhookReceiver: no private IPv4 address to listen on');
    }
    const received: { headers: Record<string, string | string[] | undefined>; body: unknown }[] = [];
    const server = createServer((req, res) => {
        let raw = '';
        req.on('data', (chunk) => (raw += chunk));
        req.on('end', () => {
            received.push({ headers: req.headers, body: JSON.parse(raw) });
            res.end();
        });
    });
    await new Promise<void>((resolve) => server.listen(0, host, resolve));
    const address = server.address() as { port: number };
    return { url: `http://${host}:${address.port}/hook`, received, close: () => server.close() };
}

describe('POST /webhook/:environmentUuid/:providerConfigKey{/:eventType}', () => {
    const outboundPolicy = envs.NANGO_OUTBOUND_URL_POLICY;

    beforeAll(async () => {
        // The webhook receiver listens on a private address, which the default outbound policy blocks.
        envs.NANGO_OUTBOUND_URL_POLICY = { blockPrivateIps: false };
        api = await runServer();
    });
    afterAll(() => {
        envs.NANGO_OUTBOUND_URL_POLICY = outboundPolicy;
        api.server.close();
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('accepts a Vanta delivery posted to <webhook URL>/<event type>', async () => {
        const { env } = await seeders.seedAccountEnvAndUser({ plan: WEBHOOKS_PLAN });
        await seeders.createConfigSeed(env, 'vanta', 'vanta');
        await seeders.createConnectionSeed({ env, provider: 'vanta', connectionId: 'vanta-conn', metadata: { webhookSecret: SECRET } });

        const execute = vi.spyOn(InternalNango.prototype, 'executeScriptForWebhooks');
        const receiver = await webhookReceiver();
        await externalWebhookService.upsert(db.knex, { environment_id: env.id, data: { primary_url: receiver.url } });

        try {
            const res = await post(`/webhook/${env.uuid}/vanta/v1.questionnaire.created?nangoConnectionId=vanta-conn`, { questionnaire: { id: '123' } });

            expect(res).toEqual({ status: 200, json: { status: 'success' } });
            expect(execute).toHaveBeenCalledWith(expect.objectContaining({ webhookTypeValue: 'v1.questionnaire.created' }));
            await expect.poll(() => receiver.received.length).toBe(1);
            expect(receiver.received[0]!.body).toEqual({
                from: 'vanta',
                providerConfigKey: 'vanta',
                type: 'forward',
                connectionId: 'vanta-conn',
                eventType: 'v1.questionnaire.created',
                payload: { questionnaire: { id: '123' } }
            });
            expect(receiver.received[0]!.headers['x-nango-webhook-event-type']).toBe('v1.questionnaire.created');
        } finally {
            receiver.close();
        }
    });

    it('rejects a Vanta delivery without an event type in the URL', async () => {
        const { env } = await seeders.seedAccountEnvAndUser({ plan: WEBHOOKS_PLAN });
        await seeders.createConfigSeed(env, 'vanta', 'vanta');
        await seeders.createConnectionSeed({ env, provider: 'vanta', connectionId: 'vanta-conn', metadata: { webhookSecret: SECRET } });

        const res = await post(`/webhook/${env.uuid}/vanta?nangoConnectionId=vanta-conn`, { questionnaire: { id: '123' } });

        expect(res).toEqual({ status: 400, json: { error: 'Webhook URL is missing the event type as its last path segment' } });
    });

    it('rejects a path after the integration for a provider that does not send the event type in the URL', async () => {
        const { env } = await seeders.seedAccountEnvAndUser({ plan: WEBHOOKS_PLAN });
        await seeders.createConfigSeed(env, 'incident', 'incident-io');

        const res = await post(`/webhook/${env.uuid}/incident/public_incident.incident_created_v2?nangoConnectionId=c1`, { event_type: 'x' });

        expect(res).toEqual({ status: 404, json: { error: { code: 'unknown_webhook_path' } } });
    });

    it('rejects an event type that is not a plain identifier', async () => {
        const { env } = await seeders.seedAccountEnvAndUser({ plan: WEBHOOKS_PLAN });
        await seeders.createConfigSeed(env, 'vanta', 'vanta');

        const res = await post(`/webhook/${env.uuid}/vanta/${encodeURIComponent('v1 questionnaire<created>')}?nangoConnectionId=vanta-conn`, {});

        expect(res.status).toBe(400);
        expect(res.json).toMatchObject({ error: { code: 'invalid_uri_params' } });
    });

    it('does not match more than one segment after the integration', async () => {
        const { env } = await seeders.seedAccountEnvAndUser({ plan: WEBHOOKS_PLAN });
        await seeders.createConfigSeed(env, 'vanta', 'vanta');

        const res = await post(`/webhook/${env.uuid}/vanta/v1/questionnaire.created?nangoConnectionId=vanta-conn`, {});

        expect(res.status).toBe(404);
    });
});
