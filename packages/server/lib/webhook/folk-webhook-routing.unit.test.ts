import crypto from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { seeders } from '@nangohq/shared';
import { getTestConfig } from '@nangohq/shared/lib/seeders/config.seeder.js';

import * as FolkWebhookRouting from './folk-webhook-routing.js';
import { InternalNango } from './internal-nango.js';

import type { NangoError } from '@nangohq/shared';

const CONNECTION_ID = 'conn-1';
const SIGNING_KEY = Buffer.alloc(32, 9);
const SECRET = `whsec_${SIGNING_KEY.toString('base64')}`;

function makeNango({
    integrationSecret,
    connectionSecret,
    connectionExists = true
}: { integrationSecret?: string; connectionSecret?: string; connectionExists?: boolean } = {}) {
    const integration = getTestConfig({ provider: 'folk', ...(integrationSecret ? { custom: { webhookSecret: integrationSecret } } : {}) });
    const nango = new InternalNango({
        team: seeders.getTestTeam(),
        environment: seeders.getTestEnvironment(),
        plan: seeders.getTestPlan(),
        integration,
        request: { method: 'POST', path: '/webhook', headers: {}, query: {}, body: null },
        logContextGetter
    });

    const getConnection = vi
        .spyOn(nango, 'getConnectionForWebhook')
        .mockResolvedValue(connectionExists ? { connectionId: CONNECTION_ID, metadata: connectionSecret ? { webhookSecret: connectionSecret } : null } : null);
    const execute = vi.fn().mockResolvedValue({ connectionIds: [CONNECTION_ID], connectionMetadata: {} });
    nango.executeScriptForWebhooks = execute;
    const markUnverified = vi.spyOn(nango, 'markUnverified').mockImplementation(() => undefined);

    return { nango, getConnection, execute, markUnverified };
}

function signedHeaders(rawBody: string, secret = SECRET) {
    const timestamp = Math.floor(Date.now() / 1000);
    const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
    const signature = crypto.createHmac('sha256', key).update(`msg_1.${timestamp}.${rawBody}`).digest('base64');

    return { 'webhook-id': 'msg_1', 'webhook-timestamp': String(timestamp), 'webhook-signature': `v1,${signature}` };
}

function errType(result: unknown) {
    return (result as { error: NangoError }).error.type;
}

const body = { type: 'contact.created' };
const rawBody = JSON.stringify(body);
const query = { nangoConnectionId: CONNECTION_ID };

describe('folk-webhook-routing', () => {
    it('routes a webhook signed with the connection secret', async () => {
        const { nango, execute } = makeNango({ connectionSecret: SECRET });

        const result = await FolkWebhookRouting.default(nango, signedHeaders(rawBody), body as never, rawBody, query);

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledOnce();
    });

    it('falls back to the integration secret when the connection has none', async () => {
        const { nango, execute } = makeNango({ integrationSecret: SECRET });

        const result = await FolkWebhookRouting.default(nango, signedHeaders(rawBody), body as never, rawBody, query);

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledOnce();
    });

    it('rejects an unknown connection before returning a forwardable success', async () => {
        // A 200 with no connection ids is forwarded to the environment webhook urls, so an
        // unresolvable connection id must not skip validation.
        const { nango, execute } = makeNango({ integrationSecret: SECRET, connectionExists: false });

        const result = await FolkWebhookRouting.default(nango, {}, body as never, rawBody, query);

        expect(result.isErr()).toBe(true);
        expect(errType(result)).toBe('webhook_invalid_signature');
        expect(execute).not.toHaveBeenCalled();
    });

    it('acknowledges an unknown connection once the signature checks out, without forwarding', async () => {
        const { nango, execute } = makeNango({ integrationSecret: SECRET, connectionExists: false });

        const result = await FolkWebhookRouting.default(nango, signedHeaders(rawBody), body as never, rawBody, query);

        expect(result.isOk()).toBe(true);
        expect(result.unwrap().statusCode).toBe(204);
        expect(result.unwrap()).not.toHaveProperty('toForward');
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a tampered body', async () => {
        const { nango, execute } = makeNango({ connectionSecret: SECRET });

        const result = await FolkWebhookRouting.default(nango, signedHeaders(rawBody), body as never, `${rawBody} `, query);

        expect(result.isErr()).toBe(true);
        expect(errType(result)).toBe('webhook_invalid_signature');
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a missing connection id', async () => {
        const { nango, execute } = makeNango({ connectionSecret: SECRET });

        const result = await FolkWebhookRouting.default(nango, signedHeaders(rawBody), body as never, rawBody, {});

        expect(result.isErr()).toBe(true);
        expect(errType(result)).toBe('webhook_missing_connection_id');
        expect(execute).not.toHaveBeenCalled();
    });

    it('marks the webhook unverified and still routes it when no secret is configured', async () => {
        const { nango, execute, markUnverified } = makeNango();

        const result = await FolkWebhookRouting.default(nango, {}, body as never, rawBody, query);

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledOnce();
        expect(markUnverified).toHaveBeenCalledWith({
            reason: 'folk_missing_webhook_secret',
            remediation: 'Set webhookSecret in the connection metadata'
        });
    });
});
