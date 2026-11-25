import crypto from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { seeders } from '@nangohq/shared';
import { getTestConfig } from '@nangohq/shared/lib/seeders/config.seeder.js';

import { InternalNango } from './internal-nango.js';
import route from './vanta-webhook-routing.js';

const CONNECTION_ID = 'my-connection-id';
const OTHER_CONNECTION_ID = 'someone-elses-connection-id';
const CONNECTION_SECRET = `whsec_${Buffer.from('connection-secret-24-bytes!').toString('base64')}`;
const OTHER_CONNECTION_SECRET = `whsec_${Buffer.from('another-secret-of-24-byte').toString('base64')}`;
const QUERY = { nangoConnectionId: CONNECTION_ID };
const EVENT_TYPE = 'v1.questionnaire.created';
const BODY = { questionnaire: { id: '123' } };
const RAW_BODY = JSON.stringify(BODY);

function getNangoMock({ connectionSecret = CONNECTION_SECRET as unknown, connectionExists = true } = {}) {
    const nango = new InternalNango({
        team: seeders.getTestTeam(),
        environment: seeders.getTestEnvironment(),
        plan: seeders.getTestPlan(),
        integration: getTestConfig({ provider: 'vanta' }),
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
    rawBody = RAW_BODY,
    secret = CONNECTION_SECRET,
    msgId = 'msg_2KWPBgLlAfxdpx2AI54pPJ85f4W',
    timestamp = Math.floor(Date.now() / 1000),
    prefix = 'svix'
}: { rawBody?: string; secret?: string; msgId?: string; timestamp?: number; prefix?: 'webhook' | 'svix' } = {}): Record<string, string> {
    const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
    const signature = crypto.createHmac('sha256', key).update(`${msgId}.${timestamp}.${rawBody}`).digest('base64');
    return { [`${prefix}-id`]: msgId, [`${prefix}-timestamp`]: String(timestamp), [`${prefix}-signature`]: `v1,${signature}` };
}

describe('Vanta webhook routing', () => {
    it("routes a delivery by nangoConnectionId, under the event type from the URL, verified against that connection's own secret", async () => {
        const { nango, getConnection, execute } = getNangoMock();

        const result = await route(nango, sign(), BODY, RAW_BODY, QUERY, EVENT_TYPE);

        expect(result.isOk() && result.value).toMatchObject({ statusCode: 200, connectionIds: [CONNECTION_ID], toForward: BODY });
        expect(getConnection).toHaveBeenCalledWith(CONNECTION_ID);
        expect(execute).toHaveBeenCalledWith({
            payload: BODY,
            webhookTypeValue: EVENT_TYPE,
            connectionIdentifierValue: CONNECTION_ID,
            propName: 'connectionId'
        });
    });

    it.each(['webhook', 'svix'] as const)('accepts the %s-* header names', async (prefix) => {
        const { nango, execute } = getNangoMock();

        const result = await route(nango, sign({ prefix }), BODY, RAW_BODY, QUERY, EVENT_TYPE);

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledOnce();
    });

    describe('rejects', () => {
        it('a webhook without nangoConnectionId', async () => {
            const { nango, getConnection, execute } = getNangoMock();

            const result = await route(nango, sign(), BODY, RAW_BODY, {}, EVENT_TYPE);

            expect(result.isErr() && result.error).toMatchObject({ type: 'webhook_missing_connection_id' });
            expect(getConnection).not.toHaveBeenCalled();
            expect(execute).not.toHaveBeenCalled();
        });

        it('a delivery without an event type in the URL, before looking up the connection', async () => {
            const { nango, getConnection, execute } = getNangoMock();

            const result = await route(nango, sign(), BODY, RAW_BODY, QUERY);

            expect(result.isErr() && result.error).toMatchObject({ type: 'webhook_missing_event_type' });
            expect(getConnection).not.toHaveBeenCalled();
            expect(execute).not.toHaveBeenCalled();
        });

        it.each(['svix-id', 'svix-timestamp', 'svix-signature'] as const)('a delivery without its %s, before looking up the connection', async (header) => {
            const { [header]: _removed, ...headers } = sign();

            // The answer must not depend on whether the connection exists or has a secret.
            for (const options of [{}, { connectionExists: false }, { connectionSecret: null }]) {
                const { nango, getConnection, execute } = getNangoMock(options);

                const result = await route(nango, headers, BODY, RAW_BODY, QUERY, EVENT_TYPE);

                expect(result.isErr() && result.error).toMatchObject({ type: 'webhook_missing_signature' });
                expect(getConnection).not.toHaveBeenCalled();
                expect(execute).not.toHaveBeenCalled();
            }
        });

        it('a signature made with another connection’s secret', async () => {
            const { nango, execute } = getNangoMock();

            const result = await route(nango, sign({ secret: OTHER_CONNECTION_SECRET }), BODY, RAW_BODY, QUERY, EVENT_TYPE);

            expect(result.isErr() && result.error).toMatchObject({ type: 'webhook_invalid_signature' });
            expect(execute).not.toHaveBeenCalled();
        });

        it('a tampered body', async () => {
            const { nango, execute } = getNangoMock();
            const tampered = JSON.stringify({ ...BODY, injected: true });

            const result = await route(nango, sign(), JSON.parse(tampered) as Record<string, unknown>, tampered, QUERY, EVENT_TYPE);

            expect(result.isErr() && result.error).toMatchObject({ type: 'webhook_invalid_signature' });
            expect(execute).not.toHaveBeenCalled();
        });

        it('a delivery signed more than 5 minutes ago', async () => {
            const { nango, execute } = getNangoMock();

            const result = await route(nango, sign({ timestamp: Math.floor(Date.now() / 1000) - 6 * 60 }), BODY, RAW_BODY, QUERY, EVENT_TYPE);

            expect(result.isErr() && result.error).toMatchObject({ type: 'webhook_invalid_signature' });
            expect(execute).not.toHaveBeenCalled();
        });

        // An unknown connection, one without a secret and a wrong signature look the same, so the endpoint
        // can't be used to tell which connections exist or have a secret.
        it.each([
            ['does not exist', { connectionExists: false }],
            ['has no webhook secret', { connectionSecret: null }],
            ['has a secret that is not a string', { connectionSecret: 1234567890123456 }]
        ])('a delivery whose connection %s, like a wrong signature', async (_case, options) => {
            const { nango, execute } = getNangoMock(options);

            const result = await route(nango, sign(), BODY, RAW_BODY, QUERY, EVENT_TYPE);

            expect(result.isErr() && result.error).toMatchObject({ type: 'webhook_invalid_signature' });
            expect(execute).not.toHaveBeenCalled();
        });
    });
});
