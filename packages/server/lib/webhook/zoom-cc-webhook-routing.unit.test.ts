import crypto from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { seeders } from '@nangohq/shared';
import { getTestConfig } from '@nangohq/shared/lib/seeders/config.seeder.js';

import { InternalNango } from './internal-nango.js';
import * as ZoomCcWebhookRouting from './zoom-cc-webhook-routing.js';

import type { ZoomWebhookPayload } from './types.js';

const CONNECTION_ID = 'my-connection-id';
const SECRET = 'a-secret-token-with-plenty-of-entropy';

function getNangoMock({ webhookSecret = SECRET }: { webhookSecret?: string | null } = {}) {
    const integration = getTestConfig({ provider: 'zoom-cc', ...(webhookSecret !== null && { custom: { webhookSecret } }) });
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

function getSignedHeaders(rawBody: string, secret: string = SECRET, timestamp = Math.floor(Date.now() / 1000)): Record<string, string> {
    const message = `v0:${timestamp}:${rawBody}`;
    const signature = `v0=${crypto.createHmac('sha256', secret).update(message).digest('hex')}`;

    return {
        'x-zm-signature': signature,
        'x-zm-request-timestamp': String(timestamp)
    };
}

function getBody(overrides?: Partial<ZoomWebhookPayload>): ZoomWebhookPayload {
    return {
        event: 'meeting.started',
        event_ts: 1626230691572,
        payload: {
            account_id: 'AAAAAABBBBB',
            object: { id: '123456789', uuid: 'abc-123' }
        },
        ...overrides
    };
}

describe('Zoom (Server-to-Server OAuth) webhook routing', () => {
    it('routes a webhook by payload.account_id after validating its signature', async () => {
        const { nango, execute } = getNangoMock();
        const body = getBody();
        const rawBody = JSON.stringify(body);

        const result = await ZoomCcWebhookRouting.default(nango, getSignedHeaders(rawBody), body, rawBody);

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledWith({
            payload: body,
            webhookType: 'event',
            connectionIdentifier: 'payload.account_id',
            propName: 'accountId'
        });
    });

    it('rejects a webhook when no secret is configured on the integration', async () => {
        const { nango, execute } = getNangoMock({ webhookSecret: null });
        const body = getBody();
        const rawBody = JSON.stringify(body);

        const result = await ZoomCcWebhookRouting.default(nango, getSignedHeaders(rawBody), body, rawBody);

        expect(result.isErr()).toBe(true);
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a webhook missing signature headers', async () => {
        const { nango, execute } = getNangoMock();
        const body = getBody();

        const result = await ZoomCcWebhookRouting.default(nango, {}, body, JSON.stringify(body));

        expect(result.isErr()).toBe(true);
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects an invalid signature', async () => {
        const { nango, execute } = getNangoMock();
        const body = getBody();
        const rawBody = JSON.stringify(body);
        const headers = { ...getSignedHeaders(rawBody), 'x-zm-signature': `v0=${'0'.repeat(64)}` };

        const result = await ZoomCcWebhookRouting.default(nango, headers, body, rawBody);

        expect(result.isErr()).toBe(true);
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a stale signature', async () => {
        const { nango, execute } = getNangoMock();
        const body = getBody();
        const rawBody = JSON.stringify(body);
        const staleTimestamp = Math.floor(Date.now() / 1000) - (90 * 60 + 1);

        const result = await ZoomCcWebhookRouting.default(nango, getSignedHeaders(rawBody, SECRET, staleTimestamp), body, rawBody);

        expect(result.isErr()).toBe(true);
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a tampered payload', async () => {
        const { nango, execute } = getNangoMock();
        const body = getBody();
        const rawBody = JSON.stringify(body);

        const result = await ZoomCcWebhookRouting.default(nango, getSignedHeaders(rawBody), body, `${rawBody} `);

        expect(result.isErr()).toBe(true);
        expect(execute).not.toHaveBeenCalled();
    });

    it('forwards the full body and connection ids on success', async () => {
        const { nango } = getNangoMock();
        const body = getBody({ event: 'meeting.ended' });
        const rawBody = JSON.stringify(body);

        const result = await ZoomCcWebhookRouting.default(nango, getSignedHeaders(rawBody), body, rawBody);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toMatchObject({
                content: { status: 'success' },
                statusCode: 200,
                connectionIds: [CONNECTION_ID],
                toForward: body
            });
        }
    });

    describe('endpoint.url_validation handshake', () => {
        it('answers the challenge with an HMAC of the plainToken, without routing to a connection', async () => {
            const { nango, execute } = getNangoMock();
            const body = getBody({ event: 'endpoint.url_validation', payload: { plainToken: 'qgg8vlvZRS6UYooatFL8Aw' } });
            const rawBody = JSON.stringify(body);

            const result = await ZoomCcWebhookRouting.default(nango, getSignedHeaders(rawBody), body, rawBody);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
                expect(result.value).toEqual({
                    content: {
                        plainToken: 'qgg8vlvZRS6UYooatFL8Aw',
                        encryptedToken: crypto.createHmac('sha256', SECRET).update('qgg8vlvZRS6UYooatFL8Aw').digest('hex')
                    },
                    statusCode: 200
                });
            }
            expect(execute).not.toHaveBeenCalled();
        });

        it('still requires a valid signature', async () => {
            const { nango, execute } = getNangoMock();
            const body = getBody({ event: 'endpoint.url_validation', payload: { plainToken: 'qgg8vlvZRS6UYooatFL8Aw' } });
            const rawBody = JSON.stringify(body);

            const result = await ZoomCcWebhookRouting.default(nango, {}, body, rawBody);

            expect(result.isErr()).toBe(true);
            expect(execute).not.toHaveBeenCalled();
        });

        it('rejects a validation event with no plainToken', async () => {
            const { nango, execute } = getNangoMock();
            const body = getBody({ event: 'endpoint.url_validation', payload: {} });
            const rawBody = JSON.stringify(body);

            const result = await ZoomCcWebhookRouting.default(nango, getSignedHeaders(rawBody), body, rawBody);

            expect(result.isErr()).toBe(true);
            expect(execute).not.toHaveBeenCalled();
        });
    });
});
