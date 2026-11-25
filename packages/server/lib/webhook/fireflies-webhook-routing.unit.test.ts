import crypto from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { seeders } from '@nangohq/shared';
import { getTestConfig } from '@nangohq/shared/lib/seeders/config.seeder.js';

import * as FirefliesWebhookRouting from './fireflies-webhook-routing.js';
import { InternalNango } from './internal-nango.js';

import type { FirefliesWebhookPayload } from './fireflies-webhook-routing.js';

const CONNECTION_ID = 'my-connection-id';
const OTHER_CONNECTION_ID = 'someone-elses-connection-id';
const CONNECTION_SECRET = 'fireflies-test-secret-1234';
const OTHER_CONNECTION_SECRET = 'another-fireflies-secret-1';
const QUERY = { nangoConnectionId: CONNECTION_ID };

function getNangoMock({ connectionSecret = CONNECTION_SECRET, connectionExists = true }: { connectionSecret?: unknown; connectionExists?: boolean } = {}) {
    const integration = getTestConfig({ provider: 'fireflies' });
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

function sign(rawBody: string, secret: string = CONNECTION_SECRET): string {
    return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

// Webhooks V2 prefix the digest with `sha256=`.
function getSignedHeaders(rawBody: string, secret: string = CONNECTION_SECRET): Record<string, string> {
    return { 'x-hub-signature': `sha256=${sign(rawBody, secret)}` };
}

function getBody(overrides?: Partial<FirefliesWebhookPayload>): FirefliesWebhookPayload {
    return {
        event: 'meeting.transcribed',
        timestamp: Date.now(),
        meeting_id: '01KAB2C3D4E5F6G7H8J9K0',
        ...overrides
    };
}

describe('Fireflies webhook routing', () => {
    it("routes a Webhooks V2 delivery by nangoConnectionId, verified against that connection's own secret", async () => {
        const { nango, getConnection, execute } = getNangoMock();
        const body = getBody();
        const rawBody = JSON.stringify(body);

        const result = await FirefliesWebhookRouting.default(nango, getSignedHeaders(rawBody), body, rawBody, QUERY);

        expect(result.isOk()).toBe(true);
        expect(getConnection).toHaveBeenCalledWith(CONNECTION_ID);
        expect(execute).toHaveBeenCalledWith({
            payload: body,
            webhookType: 'event',
            connectionIdentifierValue: CONNECTION_ID,
            propName: 'connectionId'
        });
    });

    it('routes a V1 delivery, signed with a bare digest, by its eventType', async () => {
        const { nango, execute } = getNangoMock();
        const body: FirefliesWebhookPayload = { meetingId: '01KAB2C3D4E5F6G7H8J9K0', eventType: 'Transcription completed' };
        const rawBody = JSON.stringify(body);

        const result = await FirefliesWebhookRouting.default(nango, { 'x-hub-signature': sign(rawBody) }, body, rawBody, QUERY);

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledWith(expect.objectContaining({ webhookType: 'eventType', connectionIdentifierValue: CONNECTION_ID }));
    });

    it.each([
        ['sent more than 5 minutes ago', () => getBody({ timestamp: Date.now() - 6 * 60 * 1000 })],
        [
            'without a timestamp',
            () => {
                const { timestamp: _timestamp, ...body } = getBody();
                return body;
            }
        ]
    ])('rejects a validly signed Webhooks V2 delivery %s, as a replay', async (_case, makeBody) => {
        const { nango, execute } = getNangoMock();
        const body = makeBody();
        const rawBody = JSON.stringify(body);

        const result = await FirefliesWebhookRouting.default(nango, getSignedHeaders(rawBody), body, rawBody, QUERY);

        expect(result.isErr() && result.error).toMatchObject({ type: 'webhook_invalid_signature' });
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a webhook without nangoConnectionId', async () => {
        const { nango, getConnection, execute } = getNangoMock();
        const body = getBody();
        const rawBody = JSON.stringify(body);

        const result = await FirefliesWebhookRouting.default(nango, getSignedHeaders(rawBody), body, rawBody, {});

        expect(result.isErr() && result.error).toMatchObject({ type: 'webhook_missing_connection_id' });
        expect(getConnection).not.toHaveBeenCalled();
        expect(execute).not.toHaveBeenCalled();
    });

    it("rejects redirecting a delivery signed for one connection to another connection's nangoConnectionId", async () => {
        const { nango, execute } = getNangoMock();
        const body = getBody();
        const rawBody = JSON.stringify(body);

        const result = await FirefliesWebhookRouting.default(nango, getSignedHeaders(rawBody), body, rawBody, { nangoConnectionId: OTHER_CONNECTION_ID });

        expect(result.isErr() && result.error).toMatchObject({ type: 'webhook_invalid_signature' });
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects when the connection has no webhook secret', async () => {
        const { nango, execute } = getNangoMock({ connectionSecret: null });
        const body = getBody();
        const rawBody = JSON.stringify(body);

        const result = await FirefliesWebhookRouting.default(nango, getSignedHeaders(rawBody), body, rawBody, QUERY);

        // Same error as a wrong signature, so the endpoint doesn't reveal which connections exist or have a secret.
        expect(result.isErr() && result.error).toMatchObject({ type: 'webhook_invalid_signature' });
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects when the connection does not exist', async () => {
        const { nango, execute } = getNangoMock({ connectionExists: false });
        const body = getBody();
        const rawBody = JSON.stringify(body);

        const result = await FirefliesWebhookRouting.default(nango, getSignedHeaders(rawBody), body, rawBody, QUERY);

        expect(result.isErr() && result.error).toMatchObject({ type: 'webhook_invalid_signature' });
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a webhook without a signature, as Fireflies sends when no secret is set', async () => {
        const { nango, getConnection, execute } = getNangoMock();
        const body = getBody();

        const result = await FirefliesWebhookRouting.default(nango, {}, body, JSON.stringify(body), QUERY);

        expect(result.isErr() && result.error).toMatchObject({ type: 'webhook_missing_signature' });
        expect(getConnection).not.toHaveBeenCalled();
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects an invalid signature', async () => {
        const { nango, execute } = getNangoMock();
        const body = getBody();
        const rawBody = JSON.stringify(body);

        const result = await FirefliesWebhookRouting.default(nango, getSignedHeaders(rawBody, 'wrong-secret-12345'), body, rawBody, QUERY);

        expect(result.isErr() && result.error).toMatchObject({ type: 'webhook_invalid_signature' });
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a tampered body', async () => {
        const { nango, execute } = getNangoMock();
        const body = getBody();
        const rawBody = JSON.stringify(body);
        const tamperedBody = getBody({ meeting_id: 'someone-elses-meeting' });
        const tampered = JSON.stringify(tamperedBody);

        const result = await FirefliesWebhookRouting.default(nango, getSignedHeaders(rawBody), tamperedBody, tampered, QUERY);

        expect(result.isErr() && result.error).toMatchObject({ type: 'webhook_invalid_signature' });
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a connection whose stored secret is not a string, rather than failing to sign with it', async () => {
        const { nango, execute } = getNangoMock({ connectionSecret: 1234567890123456 });
        const body = getBody();
        const rawBody = JSON.stringify(body);

        const result = await FirefliesWebhookRouting.default(nango, getSignedHeaders(rawBody, '1234567890123456'), body, rawBody, QUERY);

        expect(result.isErr() && result.error).toMatchObject({ type: 'webhook_invalid_signature' });
        expect(execute).not.toHaveBeenCalled();
    });
});
