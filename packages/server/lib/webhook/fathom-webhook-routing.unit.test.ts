import crypto from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { seeders } from '@nangohq/shared';
import { getTestConfig } from '@nangohq/shared/lib/seeders/config.seeder.js';

import * as FathomWebhookRouting from './fathom-webhook-routing.js';
import { InternalNango } from './internal-nango.js';

import type { FathomWebhookResponse } from './types.js';

const CONNECTION_ID = 'my-connection-id';
const OTHER_CONNECTION_ID = 'someone-elses-connection-id';
const EMAIL = 'recorder@example.com';
const SIGNING_KEY = Buffer.alloc(32, 7);
const SIGNING_SECRET = `whsec_${SIGNING_KEY.toString('base64')}`;
const CONNECTION_SIGNING_KEY = Buffer.alloc(32, 9);
const CONNECTION_SIGNING_SECRET = `whsec_${CONNECTION_SIGNING_KEY.toString('base64')}`;
// A second connection with its own distinct secret, so replay/redirect tests can prove a
// delivery signed for CONNECTION_ID's secret is rejected when routed at this one instead.
const OTHER_CONNECTION_SIGNING_KEY = Buffer.alloc(32, 11);
const OTHER_CONNECTION_SIGNING_SECRET = `whsec_${OTHER_CONNECTION_SIGNING_KEY.toString('base64')}`;

function getNangoMock({
    webhookSecret = SIGNING_SECRET,
    connectionSecret = CONNECTION_SIGNING_SECRET,
    connectionExists = true
}: { webhookSecret?: string | null; connectionSecret?: unknown; connectionExists?: boolean } = {}) {
    const integration = getTestConfig({ provider: 'fathom', ...(webhookSecret !== null && { custom: { webhookSecret } }) });
    const nango = new InternalNango({
        team: seeders.getTestTeam(),
        environment: seeders.getTestEnvironment(),
        plan: seeders.getTestPlan(),
        integration,
        request: { method: 'POST', path: '/webhook', headers: {}, query: {}, body: null },
        logContextGetter
    });
    // Keyed by the requested connection id, so a test can assert on routing to a *different*
    // connection than the one whose secret signed the delivery (the replay/redirect scenario),
    // instead of always resolving the same connection regardless of which id was asked for.
    const getConnection = vi.spyOn(nango, 'getConnectionForWebhook').mockImplementation((connectionId: string) => {
        if (connectionId === OTHER_CONNECTION_ID) {
            return Promise.resolve({ connectionId: OTHER_CONNECTION_ID, metadata: { webhookSecret: OTHER_CONNECTION_SIGNING_SECRET } });
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

function getBody(overrides?: Partial<FathomWebhookResponse>): FathomWebhookResponse {
    return {
        title: 'Weekly Sync',
        meeting_title: 'Weekly Sync',
        recording_id: 123,
        url: 'https://fathom.video/share/abc',
        share_url: 'https://fathom.video/share/abc',
        created_at: '2026-01-27T15:30:00Z',
        scheduled_start_time: '2026-01-27T15:00:00Z',
        scheduled_end_time: '2026-01-27T15:30:00Z',
        recording_start_time: '2026-01-27T15:00:00Z',
        recording_end_time: '2026-01-27T15:30:00Z',
        calendar_invitees_domains_type: 'only_internal',
        transcript_language: 'en',
        calendar_invitees: [],
        recorded_by: { name: 'Jane Doe', email: EMAIL, email_domain: 'example.com', team: null },
        transcript: null,
        action_items: null,
        ...overrides
    };
}

describe('Fathom webhook routing', () => {
    it("routes by nangoConnectionId when present in the query, verified against that connection's own secret", async () => {
        const { nango, getConnection, execute } = getNangoMock();
        const body = getBody();
        const rawBody = JSON.stringify(body);
        const headers = getSignedHeaders(rawBody, CONNECTION_SIGNING_KEY);

        const result = await FathomWebhookRouting.default(nango, headers, body, rawBody, { nangoConnectionId: CONNECTION_ID });

        expect(result.isOk()).toBe(true);
        expect(getConnection).toHaveBeenCalledWith(CONNECTION_ID);
        expect(execute).toHaveBeenCalledOnce();
        expect(execute).toHaveBeenCalledWith({
            payload: body,
            connectionIdentifierValue: CONNECTION_ID,
            propName: 'connectionId'
        });
    });

    it("rejects redirecting a delivery signed for one connection to a different connection's nangoConnectionId", async () => {
        // This is the replay/redirect scenario: Fathom never signs the destination URL, so a
        // delivery validly signed with CONNECTION_ID's own secret must not be accepted when the
        // query param is swapped to point at a different connection with its own distinct secret.
        const { nango, execute } = getNangoMock();
        const body = getBody();
        const rawBody = JSON.stringify(body);
        const headers = getSignedHeaders(rawBody, CONNECTION_SIGNING_KEY);

        const result = await FathomWebhookRouting.default(nango, headers, body, rawBody, { nangoConnectionId: OTHER_CONNECTION_ID });

        expect(result.isErr()).toBe(true);
        expect(execute).not.toHaveBeenCalled();
    });

    it("rejects routing by nangoConnectionId when signed with the shared integration secret instead of the connection's own secret", async () => {
        const { nango, execute } = getNangoMock();
        const body = getBody();
        const rawBody = JSON.stringify(body);
        const headers = getSignedHeaders(rawBody, SIGNING_KEY);

        const result = await FathomWebhookRouting.default(nango, headers, body, rawBody, { nangoConnectionId: CONNECTION_ID });

        expect(result.isErr()).toBe(true);
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects routing by nangoConnectionId when the connection has no webhook secret configured', async () => {
        const { nango, execute } = getNangoMock({ connectionSecret: null });
        const body = getBody();
        const rawBody = JSON.stringify(body);

        const result = await FathomWebhookRouting.default(nango, getSignedHeaders(rawBody, CONNECTION_SIGNING_KEY), body, rawBody, {
            nangoConnectionId: CONNECTION_ID
        });

        expect(result.isErr()).toBe(true);
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects routing by nangoConnectionId when the connection does not exist', async () => {
        const { nango, execute } = getNangoMock({ connectionExists: false });
        const body = getBody();
        const rawBody = JSON.stringify(body);

        const result = await FathomWebhookRouting.default(nango, getSignedHeaders(rawBody, CONNECTION_SIGNING_KEY), body, rawBody, {
            nangoConnectionId: CONNECTION_ID
        });

        expect(result.isErr()).toBe(true);
        expect(execute).not.toHaveBeenCalled();
    });

    it('falls back to matching by recorded_by.email when no nangoConnectionId is in the query', async () => {
        const { nango, execute } = getNangoMock();
        const body = getBody();
        const rawBody = JSON.stringify(body);

        const result = await FathomWebhookRouting.default(nango, getSignedHeaders(rawBody), body, rawBody, {});

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledOnce();
        expect(execute).toHaveBeenCalledWith({
            payload: body,
            connectionIdentifierValue: EMAIL,
            propName: 'metadata.emailAddress'
        });
    });

    it('rejects a webhook missing signature headers when a secret is configured', async () => {
        const { nango, execute } = getNangoMock();
        const body = getBody();

        const result = await FathomWebhookRouting.default(nango, {}, body, JSON.stringify(body), {});

        expect(result.isErr()).toBe(true);
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects an invalid signature', async () => {
        const { nango, execute } = getNangoMock();
        const body = getBody();
        const rawBody = JSON.stringify(body);
        const headers = { ...getSignedHeaders(rawBody), 'webhook-signature': `v1,${Buffer.alloc(32).toString('base64')}` };

        const result = await FathomWebhookRouting.default(nango, headers, body, rawBody, {});

        expect(result.isErr()).toBe(true);
        expect(execute).not.toHaveBeenCalled();
    });

    it('still allows the email fallback when no secret is configured', async () => {
        const { nango, execute } = getNangoMock({ webhookSecret: null });
        const body = getBody();

        const result = await FathomWebhookRouting.default(nango, {}, body, JSON.stringify(body), {});

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledOnce();
        expect(execute).toHaveBeenCalledWith({
            payload: body,
            connectionIdentifierValue: EMAIL,
            propName: 'metadata.emailAddress'
        });
    });
});
