import crypto from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { seeders } from '@nangohq/shared';
import { getTestConfig } from '@nangohq/shared/lib/seeders/config.seeder.js';

import * as FathomWebhookRouting from './fathom-webhook-routing.js';
import { InternalNango } from './internal-nango.js';

import type { FathomWebhookResponse } from './types.js';

const CONNECTION_ID = 'my-connection-id';
const EMAIL = 'recorder@example.com';
const SIGNING_KEY = Buffer.alloc(32, 7);
const SIGNING_SECRET = `whsec_${SIGNING_KEY.toString('base64')}`;

function getNangoMock({ webhookSecret = SIGNING_SECRET }: { webhookSecret?: string | null } = {}) {
    const integration = getTestConfig({ provider: 'fathom', ...(webhookSecret !== null && { custom: { webhookSecret } }) });
    const nango = new InternalNango({
        team: seeders.getTestTeam(),
        environment: seeders.getTestEnvironment(),
        plan: seeders.getTestPlan(),
        integration,
        logContextGetter
    });
    const execute = vi.spyOn(nango, 'executeScriptForWebhooks').mockResolvedValue({
        connectionIds: [CONNECTION_ID],
        connectionMetadata: {}
    });

    return { nango, execute };
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
    it('routes by nangoConnectionId when present in the query, ignoring the email', async () => {
        const { nango, execute } = getNangoMock();
        const body = getBody();
        const rawBody = JSON.stringify(body);

        const result = await FathomWebhookRouting.default(nango, getSignedHeaders(rawBody), body, rawBody, { nangoConnectionId: CONNECTION_ID });

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledWith({
            body,
            connectionIdentifierValue: CONNECTION_ID,
            propName: 'connectionId'
        });
    });

    it('falls back to matching by recorded_by.email when no nangoConnectionId is in the query', async () => {
        const { nango, execute } = getNangoMock();
        const body = getBody();
        const rawBody = JSON.stringify(body);

        const result = await FathomWebhookRouting.default(nango, getSignedHeaders(rawBody), body, rawBody, {});

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledWith({
            body,
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

    it('allows a webhook when no secret is configured', async () => {
        const { nango, execute } = getNangoMock({ webhookSecret: null });
        const body = getBody();

        const result = await FathomWebhookRouting.default(nango, {}, body, JSON.stringify(body), { nangoConnectionId: CONNECTION_ID });

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledOnce();
    });
});
