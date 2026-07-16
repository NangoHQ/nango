import crypto from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { seeders } from '@nangohq/shared';
import { getTestConfig } from '@nangohq/shared/lib/seeders/config.seeder.js';

import * as GitlabWebhookRouting from './gitlab-webhook-routing.js';
import { InternalNango } from './internal-nango.js';

const CONNECTION_ID = 'my-connection-id';
const SIGNING_KEY = Buffer.alloc(32, 7);
const SIGNING_TOKEN = `whsec_${SIGNING_KEY.toString('base64')}`;
const LEGACY_TOKEN = 'legacy-webhook-token';

function getNangoMock(webhookSecret: unknown = SIGNING_TOKEN) {
    const nango = new InternalNango({
        team: seeders.getTestTeam(),
        environment: seeders.getTestEnvironment(),
        plan: seeders.getTestPlan(),
        integration: getTestConfig({ provider: 'gitlab' }),
        logContextGetter
    });
    const getConnection = vi.spyOn(nango, 'getConnectionForWebhook').mockResolvedValue({
        connectionId: CONNECTION_ID,
        metadata: webhookSecret === null ? null : { webhookSecret }
    });
    const execute = vi.spyOn(nango, 'executeScriptForWebhooks').mockResolvedValue({
        connectionIds: [CONNECTION_ID],
        connectionMetadata: {}
    });

    return { nango, getConnection, execute };
}

function getSignedHeaders(rawBody: string, timestamp = Math.floor(Date.now() / 1000)): Record<string, string> {
    const webhookId = 'webhook-id';
    const payload = `${webhookId}.${timestamp}.${rawBody}`;
    const signature = crypto.createHmac('sha256', SIGNING_KEY).update(payload).digest('base64');

    return {
        'webhook-id': webhookId,
        'webhook-timestamp': String(timestamp),
        'webhook-signature': `v1,${signature}`,
        'x-gitlab-event': 'Issue Hook'
    };
}

describe('Gitlab webhook routing', () => {
    it('routes a webhook after validating its signing token', async () => {
        const { nango, getConnection, execute } = getNangoMock();
        const body = { object_kind: 'issue', project: { id: 42 } };
        const rawBody = JSON.stringify(body);

        const result = await GitlabWebhookRouting.default(nango, getSignedHeaders(rawBody), body, rawBody, {
            nangoConnectionId: CONNECTION_ID
        });

        expect(result.isOk()).toBe(true);
        expect(getConnection).toHaveBeenCalledWith(CONNECTION_ID);
        expect(execute).toHaveBeenCalledWith({
            body,
            webhookHeaderValue: 'Issue Hook',
            connectionIdentifierValue: CONNECTION_ID,
            propName: 'connectionId'
        });
    });

    it('falls back to the connection id in the body', async () => {
        const { nango, getConnection } = getNangoMock(null);
        const body = { object_kind: 'merge_request', nangoConnectionId: CONNECTION_ID };
        const rawBody = JSON.stringify(body);

        const result = await GitlabWebhookRouting.default(nango, { 'x-gitlab-event': 'Merge Request Hook' }, body, rawBody, {});

        expect(result.isOk()).toBe(true);
        expect(getConnection).toHaveBeenCalledWith(CONNECTION_ID);
    });

    it('allows a webhook when the connection has no secret', async () => {
        const { nango, execute } = getNangoMock(null);
        const body = { object_kind: 'note' };

        const result = await GitlabWebhookRouting.default(nango, { 'x-gitlab-event': 'Note Hook' }, body, JSON.stringify(body), {
            nangoConnectionId: CONNECTION_ID
        });

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledOnce();
    });

    it('accepts the legacy X-Gitlab-Token as a fallback', async () => {
        const { nango, execute } = getNangoMock(LEGACY_TOKEN);
        const body = { object_kind: 'issue' };

        const result = await GitlabWebhookRouting.default(
            nango,
            { 'x-gitlab-token': LEGACY_TOKEN, 'x-gitlab-event': 'Issue Hook' },
            body,
            JSON.stringify(body),
            { nangoConnectionId: CONNECTION_ID }
        );

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledOnce();
    });

    it('rejects a tampered signed payload before dispatch', async () => {
        const { nango, execute } = getNangoMock();
        const body = { object_kind: 'issue' };
        const rawBody = JSON.stringify(body);

        const result = await GitlabWebhookRouting.default(nango, getSignedHeaders(rawBody), body, `${rawBody} `, {
            nangoConnectionId: CONNECTION_ID
        });

        expect(result.isErr()).toBe(true);
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a stale signed payload before dispatch', async () => {
        const { nango, execute } = getNangoMock();
        const body = { object_kind: 'issue' };
        const rawBody = JSON.stringify(body);
        const staleTimestamp = Math.floor(Date.now() / 1000) - 301;

        const result = await GitlabWebhookRouting.default(nango, getSignedHeaders(rawBody, staleTimestamp), body, rawBody, {
            nangoConnectionId: CONNECTION_ID
        });

        expect(result.isErr()).toBe(true);
        expect(execute).not.toHaveBeenCalled();
    });

    it('does not downgrade to the legacy token when a signature is present', async () => {
        const { nango, execute } = getNangoMock();
        const body = { object_kind: 'issue' };
        const rawBody = JSON.stringify(body);
        const headers = { ...getSignedHeaders(rawBody), 'webhook-signature': 'v1,invalid', 'x-gitlab-token': SIGNING_TOKEN };

        const result = await GitlabWebhookRouting.default(nango, headers, body, rawBody, { nangoConnectionId: CONNECTION_ID });

        expect(result.isErr()).toBe(true);
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects an invalid legacy token before dispatch', async () => {
        const { nango, execute } = getNangoMock(LEGACY_TOKEN);
        const body = { object_kind: 'issue' };

        const result = await GitlabWebhookRouting.default(
            nango,
            { 'x-gitlab-token': 'wrong-token', 'x-gitlab-event': 'Issue Hook' },
            body,
            JSON.stringify(body),
            { nangoConnectionId: CONNECTION_ID }
        );

        expect(result.isErr()).toBe(true);
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a webhook with no verification header when a secret is configured', async () => {
        const { nango, execute } = getNangoMock();
        const body = { object_kind: 'issue' };

        const result = await GitlabWebhookRouting.default(nango, { 'x-gitlab-event': 'Issue Hook' }, body, JSON.stringify(body), {
            nangoConnectionId: CONNECTION_ID
        });

        expect(result.isErr()).toBe(true);
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects an invalid connection webhook secret', async () => {
        const { nango, execute } = getNangoMock(['invalid-secret']);
        const body = { object_kind: 'issue' };

        const result = await GitlabWebhookRouting.default(nango, getSignedHeaders(JSON.stringify(body)), body, JSON.stringify(body), {
            nangoConnectionId: CONNECTION_ID
        });

        expect(result.isErr()).toBe(true);
        expect(execute).not.toHaveBeenCalled();
    });

    it('returns success without dispatch when the connection does not exist', async () => {
        const { nango, getConnection, execute } = getNangoMock();
        getConnection.mockResolvedValue(null);
        const body = { object_kind: 'issue' };

        const result = await GitlabWebhookRouting.default(nango, {}, body, JSON.stringify(body), {
            nangoConnectionId: CONNECTION_ID
        });

        expect(result.isOk()).toBe(true);
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a webhook with no connection id', async () => {
        const { nango, getConnection, execute } = getNangoMock();

        const result = await GitlabWebhookRouting.default(nango, {}, { object_kind: 'issue' }, '{}', {});

        expect(result.isErr()).toBe(true);
        expect(getConnection).not.toHaveBeenCalled();
        expect(execute).not.toHaveBeenCalled();
    });

    it('forwards the full body on success', async () => {
        const { nango } = getNangoMock(null);
        const body = { object_kind: 'issue', project: { id: 7 } };

        const result = await GitlabWebhookRouting.default(nango, {}, body, JSON.stringify(body), {
            nangoConnectionId: CONNECTION_ID
        });

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
