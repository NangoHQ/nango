import crypto from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { seeders } from '@nangohq/shared';
import { getTestConfig } from '@nangohq/shared/lib/seeders/config.seeder.js';

import * as GranolaWebhookRouting from './granola-webhook-routing.js';
import { InternalNango } from './internal-nango.js';

import type { GranolaWebhookPayload } from './types.js';

const CONNECTION_ID = 'my-connection-id';
const SIGNING_KEY = Buffer.alloc(32, 7);
const SIGNING_SECRET = `whsec_${SIGNING_KEY.toString('base64')}`;
const OTHER_SIGNING_KEY = Buffer.alloc(32, 9);

function getNangoMock({
    connectionSecret = SIGNING_SECRET,
    connectionExists = true
}: {
    connectionSecret?: unknown;
    connectionExists?: boolean;
} = {}) {
    const integration = getTestConfig({ provider: 'granola' });
    const nango = new InternalNango({
        team: seeders.getTestTeam(),
        environment: seeders.getTestEnvironment(),
        plan: seeders.getTestPlan(),
        integration,
        logContextGetter
    });
    const getConnection = vi
        .spyOn(nango, 'getConnectionForWebhook')
        .mockResolvedValue(
            connectionExists ? { connectionId: CONNECTION_ID, metadata: connectionSecret !== null ? { webhookSecret: connectionSecret } : null } : null
        );
    const execute = vi.spyOn(nango, 'executeScriptForWebhooks').mockResolvedValue({
        connectionIds: [CONNECTION_ID],
        connectionMetadata: {}
    });

    return { nango, getConnection, execute };
}

function getSignedHeaders(rawBody: string, key: Buffer = SIGNING_KEY, timestamp = Math.floor(Date.now() / 1000)): Record<string, string> {
    const msgId = 'evt_8f1c2a4e';
    const payload = `${msgId}.${timestamp}.${rawBody}`;
    const signature = crypto.createHmac('sha256', key).update(payload).digest('base64');

    return {
        'webhook-id': msgId,
        'webhook-timestamp': String(timestamp),
        'webhook-signature': `v1,${signature}`
    };
}

function getBody(overrides?: Partial<GranolaWebhookPayload>): GranolaWebhookPayload {
    return {
        event_id: 'evt_8f1c2a4e',
        event_type: 'note.generated',
        note_id: 'not_1d3tmYTlCICgjy',
        occurred_at: '2026-01-27T15:30:00Z',
        ...overrides
    };
}

describe('Granola webhook routing', () => {
    it('routes a webhook after validating its signature', async () => {
        const { nango, getConnection, execute } = getNangoMock();
        const body = getBody();
        const rawBody = JSON.stringify(body);

        const result = await GranolaWebhookRouting.default(nango, getSignedHeaders(rawBody), body, rawBody, { nangoConnectionId: CONNECTION_ID });

        expect(result.isOk()).toBe(true);
        expect(getConnection).toHaveBeenCalledWith(CONNECTION_ID);
        expect(execute).toHaveBeenCalledWith({
            body,
            webhookType: 'event_type',
            connectionIdentifierValue: CONNECTION_ID,
            propName: 'connectionId'
        });
    });

    it('rejects a webhook with no connection id', async () => {
        const { nango, getConnection, execute } = getNangoMock();
        const body = getBody();
        const rawBody = JSON.stringify(body);

        const result = await GranolaWebhookRouting.default(nango, getSignedHeaders(rawBody), body, rawBody, {});

        expect(result.isErr()).toBe(true);
        expect(getConnection).not.toHaveBeenCalled();
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a signed delivery whose connection id does not match a real connection', async () => {
        const { nango, getConnection, execute } = getNangoMock({ connectionExists: false });
        const body = getBody();
        const rawBody = JSON.stringify(body);

        // A validly-shaped signature is not enough on its own -- Standard Webhooks signatures don't bind to a
        // destination, so this must be rejected on the connection lookup, not accepted as "unroutable but ok".
        const result = await GranolaWebhookRouting.default(nango, getSignedHeaders(rawBody), body, rawBody, { nangoConnectionId: CONNECTION_ID });

        expect(result.isErr()).toBe(true);
        expect(getConnection).toHaveBeenCalledWith(CONNECTION_ID);
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects an unauthenticated request without looking up the connection', async () => {
        const { nango, getConnection, execute } = getNangoMock({ connectionExists: false });
        const body = getBody();

        const result = await GranolaWebhookRouting.default(nango, {}, body, JSON.stringify(body), { nangoConnectionId: CONNECTION_ID });

        expect(result.isErr()).toBe(true);
        expect(getConnection).not.toHaveBeenCalled();
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a webhook when the connection has no secret configured', async () => {
        const { nango, execute } = getNangoMock({ connectionSecret: null });
        const body = getBody();
        const rawBody = JSON.stringify(body);

        const result = await GranolaWebhookRouting.default(nango, getSignedHeaders(rawBody), body, rawBody, { nangoConnectionId: CONNECTION_ID });

        expect(result.isErr()).toBe(true);
        expect(execute).not.toHaveBeenCalled();
    });

    it("rejects a delivery signed with a different connection's secret", async () => {
        const { nango, execute } = getNangoMock({ connectionSecret: SIGNING_SECRET });
        const body = getBody();
        const rawBody = JSON.stringify(body);

        // signed with a different connection's secret -- must not validate against this one, since a shared
        // or mismatched secret would let a delivery for one connection be replayed against another.
        const result = await GranolaWebhookRouting.default(nango, getSignedHeaders(rawBody, OTHER_SIGNING_KEY), body, rawBody, {
            nangoConnectionId: CONNECTION_ID
        });

        expect(result.isErr()).toBe(true);
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects an invalid connection webhook secret', async () => {
        const { nango, execute } = getNangoMock({ connectionSecret: ['invalid-secret'] });
        const body = getBody();
        const rawBody = JSON.stringify(body);

        const result = await GranolaWebhookRouting.default(nango, getSignedHeaders(rawBody), body, rawBody, { nangoConnectionId: CONNECTION_ID });

        expect(result.isErr()).toBe(true);
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a tampered signed payload before dispatch', async () => {
        const { nango, execute } = getNangoMock();
        const body = getBody();
        const rawBody = JSON.stringify(body);

        const result = await GranolaWebhookRouting.default(nango, getSignedHeaders(rawBody), body, `${rawBody} `, { nangoConnectionId: CONNECTION_ID });

        expect(result.isErr()).toBe(true);
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a stale signed payload before dispatch', async () => {
        const { nango, execute } = getNangoMock();
        const body = getBody();
        const rawBody = JSON.stringify(body);
        const staleTimestamp = Math.floor(Date.now() / 1000) - 301;

        const result = await GranolaWebhookRouting.default(nango, getSignedHeaders(rawBody, SIGNING_KEY, staleTimestamp), body, rawBody, {
            nangoConnectionId: CONNECTION_ID
        });

        expect(result.isErr()).toBe(true);
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects an invalid signature before dispatch', async () => {
        const { nango, execute } = getNangoMock();
        const body = getBody();
        const rawBody = JSON.stringify(body);
        const headers = { ...getSignedHeaders(rawBody), 'webhook-signature': `v1,${Buffer.alloc(32).toString('base64')}` };

        const result = await GranolaWebhookRouting.default(nango, headers, body, rawBody, { nangoConnectionId: CONNECTION_ID });

        expect(result.isErr()).toBe(true);
        expect(execute).not.toHaveBeenCalled();
    });

    it('forwards the full body and connection ids on success', async () => {
        const { nango } = getNangoMock();
        const body = getBody({ event_type: 'note.edited', data: { changed_fields: ['summary'] } });
        const rawBody = JSON.stringify(body);

        const result = await GranolaWebhookRouting.default(nango, getSignedHeaders(rawBody), body, rawBody, { nangoConnectionId: CONNECTION_ID });

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
});
