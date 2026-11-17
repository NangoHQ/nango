import crypto from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { seeders } from '@nangohq/shared';
import { getTestConfig } from '@nangohq/shared/lib/seeders/config.seeder.js';

import { InternalNango } from './internal-nango.js';
import * as LayloWebhookRouting from './laylo-webhook-routing.js';

import type { LayloWebhookPayload } from './types.js';

const CONNECTION_ID = 'my-connection-id';
const OTHER_CONNECTION_ID = 'someone-elses-connection-id';
const CONNECTION_SECRET = 'connection-hmac-secret';
const OTHER_CONNECTION_SECRET = 'other-connection-hmac-secret';
const QUERY = { nangoConnectionId: CONNECTION_ID };

function getNangoMock({ connectionSecret = CONNECTION_SECRET, connectionExists = true }: { connectionSecret?: unknown; connectionExists?: boolean } = {}) {
    const integration = getTestConfig({ provider: 'laylo' });
    const nango = new InternalNango({
        team: seeders.getTestTeam(),
        environment: seeders.getTestEnvironment(),
        plan: seeders.getTestPlan(),
        integration,
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
    const execute = vi.spyOn(nango, 'executeScriptForWebhooks').mockResolvedValue({
        connectionIds: [CONNECTION_ID],
        connectionMetadata: {}
    });

    return { nango, getConnection, execute };
}

function getSignedHeaders(rawBody: string, secret: string = CONNECTION_SECRET, timestamp: number = Date.now()): Record<string, string> {
    const signature = crypto.createHmac('sha256', secret).update(`${timestamp}${rawBody}`).digest('base64');
    return {
        'x-laylo-timestamp': String(timestamp),
        'x-signature-256': signature
    };
}

function getBody(overrides?: Partial<LayloWebhookPayload>): LayloWebhookPayload {
    return {
        type: 'rsvp',
        email: 'test@test.com',
        phoneNumber: '+11112223333',
        productId: 'drop_id_12345',
        creatorId: 'creator_id_67890',
        ...overrides
    };
}

describe('Laylo webhook routing', () => {
    it("routes by nangoConnectionId, verified against that connection's own secret", async () => {
        const { nango, getConnection, execute } = getNangoMock();
        const body = getBody();
        const rawBody = JSON.stringify(body);

        const result = await LayloWebhookRouting.default(nango, getSignedHeaders(rawBody), body, rawBody, QUERY);

        expect(result.isOk()).toBe(true);
        expect(getConnection).toHaveBeenCalledWith(CONNECTION_ID);
        expect(execute).toHaveBeenCalledWith({
            payload: body,
            webhookType: 'type',
            connectionIdentifierValue: CONNECTION_ID,
            propName: 'connectionId'
        });
    });

    it('routes opt_out events the same way', async () => {
        const { nango, execute } = getNangoMock();
        const body: LayloWebhookPayload = { type: 'opt_out', email: 'test@test.com', phoneNumber: '+11112223333', creatorId: 'creator_id_67890' };
        const rawBody = JSON.stringify(body);

        const result = await LayloWebhookRouting.default(nango, getSignedHeaders(rawBody), body, rawBody, QUERY);

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledOnce();
    });

    it('rejects a webhook without nangoConnectionId', async () => {
        const { nango, getConnection, execute } = getNangoMock();
        const body = getBody();
        const rawBody = JSON.stringify(body);

        const result = await LayloWebhookRouting.default(nango, getSignedHeaders(rawBody), body, rawBody, {});

        expect(result.isErr()).toBe(true);
        expect(getConnection).not.toHaveBeenCalled();
        expect(execute).not.toHaveBeenCalled();
    });

    it("rejects redirecting a delivery signed for one connection to another connection's nangoConnectionId", async () => {
        const { nango, execute } = getNangoMock();
        const body = getBody();
        const rawBody = JSON.stringify(body);

        const result = await LayloWebhookRouting.default(nango, getSignedHeaders(rawBody), body, rawBody, { nangoConnectionId: OTHER_CONNECTION_ID });

        expect(result.isErr()).toBe(true);
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects when the connection has no webhook secret', async () => {
        const { nango, execute } = getNangoMock({ connectionSecret: null });
        const body = getBody();
        const rawBody = JSON.stringify(body);

        const result = await LayloWebhookRouting.default(nango, getSignedHeaders(rawBody), body, rawBody, QUERY);

        expect(result.isErr()).toBe(true);
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects when the connection does not exist', async () => {
        const { nango, execute } = getNangoMock({ connectionExists: false });
        const body = getBody();
        const rawBody = JSON.stringify(body);

        const result = await LayloWebhookRouting.default(nango, getSignedHeaders(rawBody), body, rawBody, QUERY);

        expect(result.isErr()).toBe(true);
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a webhook missing signature headers', async () => {
        const { nango, execute } = getNangoMock();
        const body = getBody();

        const result = await LayloWebhookRouting.default(nango, {}, body, JSON.stringify(body), QUERY);

        expect(result.isErr()).toBe(true);
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects an invalid signature', async () => {
        const { nango, execute } = getNangoMock();
        const body = getBody();
        const rawBody = JSON.stringify(body);

        const result = await LayloWebhookRouting.default(nango, getSignedHeaders(rawBody, 'wrong-secret'), body, rawBody, QUERY);

        expect(result.isErr()).toBe(true);
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a tampered body', async () => {
        const { nango, execute } = getNangoMock();
        const body = getBody();
        const rawBody = JSON.stringify(body);
        const tamperedBody = getBody({ creatorId: 'someone-else' });
        const tampered = JSON.stringify(tamperedBody);

        const result = await LayloWebhookRouting.default(nango, getSignedHeaders(rawBody), tamperedBody, tampered, QUERY);

        expect(result.isErr()).toBe(true);
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a stale timestamp even with a valid signature', async () => {
        const { nango, execute } = getNangoMock();
        const body = getBody();
        const rawBody = JSON.stringify(body);

        const result = await LayloWebhookRouting.default(
            nango,
            getSignedHeaders(rawBody, CONNECTION_SECRET, Date.now() - 10 * 60 * 1000),
            body,
            rawBody,
            QUERY
        );

        expect(result.isErr()).toBe(true);
        expect(execute).not.toHaveBeenCalled();
    });
});
