import crypto from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { seeders } from '@nangohq/shared';
import { getTestConfig } from '@nangohq/shared/lib/seeders/config.seeder.js';

import * as BambooHrWebhookRouting from './bamboohr-webhook-routing.js';
import { InternalNango } from './internal-nango.js';

import type { BambooHrWebhookPayload } from './types.js';

const CONNECTION_ID = 'my-connection-id';
const OTHER_CONNECTION_ID = 'someone-elses-connection-id';
const CONNECTION_SECRET = 'bamboohr-test-webhook-private-key';
const OTHER_CONNECTION_SECRET = 'another-bamboohr-test-private-key';
const QUERY = { nangoConnectionId: CONNECTION_ID };
const TIMESTAMP = '2026-01-31T18:42:00+0000';
// BambooHR sends the signature timestamp in Unix seconds
const SIGNED_AT = String(Math.floor(Date.now() / 1000));

function getNangoMock({ connectionSecret = CONNECTION_SECRET, connectionExists = true }: { connectionSecret?: unknown; connectionExists?: boolean } = {}) {
    const integration = getTestConfig({ provider: 'bamboohr' });
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

function getSignedHeaders(rawBody: string, secret: string = CONNECTION_SECRET, timestamp: string = SIGNED_AT): Record<string, string> {
    const signature = crypto.createHmac('sha256', secret).update(`${rawBody}${timestamp}`).digest('hex');
    return {
        'x-bamboohr-timestamp': timestamp,
        'x-bamboohr-signature': signature
    };
}

function getBody(overrides?: Partial<BambooHrWebhookPayload>): BambooHrWebhookPayload {
    return {
        type: 'employee.updated',
        timestamp: TIMESTAMP,
        data: { companyId: '12345', employeeId: '67890', changedFields: ['firstName'] },
        ...overrides
    };
}

describe('BambooHR webhook routing', () => {
    it("routes by nangoConnectionId, verified against that connection's own secret", async () => {
        const { nango, getConnection, execute } = getNangoMock();
        const body = getBody();
        const rawBody = JSON.stringify(body);

        const result = await BambooHrWebhookRouting.default(nango, getSignedHeaders(rawBody), body, rawBody, QUERY);

        expect(result.isOk()).toBe(true);
        expect(getConnection).toHaveBeenCalledWith(CONNECTION_ID);
        expect(execute).toHaveBeenCalledWith({
            payload: body,
            webhookType: 'type',
            connectionIdentifierValue: CONNECTION_ID,
            propName: 'connectionId'
        });
    });

    it('routes field-based payloads the same way', async () => {
        const { nango, execute } = getNangoMock();
        const body: BambooHrWebhookPayload = {
            employees: [{ id: '12345', action: 'Updated', changedFields: ['First Name'], fields: { 'First Name': 'Bryony' }, timestamp: TIMESTAMP }]
        };
        const rawBody = JSON.stringify(body);

        const result = await BambooHrWebhookRouting.default(nango, getSignedHeaders(rawBody), body, rawBody, QUERY);

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledOnce();
    });

    it('rejects a webhook without nangoConnectionId', async () => {
        const { nango, getConnection, execute } = getNangoMock();
        const body = getBody();
        const rawBody = JSON.stringify(body);

        const result = await BambooHrWebhookRouting.default(nango, getSignedHeaders(rawBody), body, rawBody, {});

        expect(result.isErr() && result.error).toMatchObject({ type: 'webhook_missing_connection_id' });
        expect(getConnection).not.toHaveBeenCalled();
        expect(execute).not.toHaveBeenCalled();
    });

    it("rejects redirecting a delivery signed for one connection to another connection's nangoConnectionId", async () => {
        const { nango, execute } = getNangoMock();
        const body = getBody();
        const rawBody = JSON.stringify(body);

        const result = await BambooHrWebhookRouting.default(nango, getSignedHeaders(rawBody), body, rawBody, { nangoConnectionId: OTHER_CONNECTION_ID });

        expect(result.isErr() && result.error).toMatchObject({ type: 'webhook_invalid_signature' });
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects when the connection has no webhook secret', async () => {
        const { nango, execute } = getNangoMock({ connectionSecret: null });
        const body = getBody();
        const rawBody = JSON.stringify(body);

        const result = await BambooHrWebhookRouting.default(nango, getSignedHeaders(rawBody), body, rawBody, QUERY);

        // Same error as a wrong signature, so the endpoint doesn't reveal which connections exist or have a secret.
        expect(result.isErr() && result.error).toMatchObject({ type: 'webhook_invalid_signature' });
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects when the connection does not exist', async () => {
        const { nango, execute } = getNangoMock({ connectionExists: false });
        const body = getBody();
        const rawBody = JSON.stringify(body);

        const result = await BambooHrWebhookRouting.default(nango, getSignedHeaders(rawBody), body, rawBody, QUERY);

        expect(result.isErr() && result.error).toMatchObject({ type: 'webhook_invalid_signature' });
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a webhook missing signature headers', async () => {
        const { nango, getConnection, execute } = getNangoMock();
        const body = getBody();

        const result = await BambooHrWebhookRouting.default(nango, {}, body, JSON.stringify(body), QUERY);

        expect(result.isErr() && result.error).toMatchObject({ type: 'webhook_missing_signature' });
        expect(getConnection).not.toHaveBeenCalled();
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects an invalid signature', async () => {
        const { nango, execute } = getNangoMock();
        const body = getBody();
        const rawBody = JSON.stringify(body);

        const result = await BambooHrWebhookRouting.default(nango, getSignedHeaders(rawBody, 'wrong-secret'), body, rawBody, QUERY);

        expect(result.isErr()).toBe(true);
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a tampered body', async () => {
        const { nango, execute } = getNangoMock();
        const body = getBody();
        const rawBody = JSON.stringify(body);
        const tamperedBody = getBody({ data: { companyId: '12345', employeeId: 'someone-else' } });
        const tampered = JSON.stringify(tamperedBody);

        const result = await BambooHrWebhookRouting.default(nango, getSignedHeaders(rawBody), tamperedBody, tampered, QUERY);

        expect(result.isErr()).toBe(true);
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a signature computed over a different timestamp', async () => {
        const { nango, execute } = getNangoMock();
        const body = getBody();
        const rawBody = JSON.stringify(body);
        const headers = { ...getSignedHeaders(rawBody), 'x-bamboohr-timestamp': String(Number(SIGNED_AT) + 1) };

        const result = await BambooHrWebhookRouting.default(nango, headers, body, rawBody, QUERY);

        expect(result.isErr()).toBe(true);
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a stale timestamp even when the signature matches', async () => {
        const { nango, execute } = getNangoMock();
        const body = getBody();
        const rawBody = JSON.stringify(body);
        const stale = String(Number(SIGNED_AT) - 10 * 60);

        const result = await BambooHrWebhookRouting.default(nango, getSignedHeaders(rawBody, CONNECTION_SECRET, stale), body, rawBody, QUERY);

        expect(result.isErr()).toBe(true);
        expect(execute).not.toHaveBeenCalled();
    });
});
