import crypto from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { seeders } from '@nangohq/shared';
import { getTestConfig } from '@nangohq/shared/lib/seeders/config.seeder.js';

import { InternalNango } from './internal-nango.js';
import * as PagerDutyWebhookRouting from './pagerduty-webhook-routing.js';

import type { NangoError } from '@nangohq/shared';
import type { Metadata } from '@nangohq/types';

const CONNECTION_ID = 'conn-1';
const WEBHOOK_SECRET = 'pagerduty-webhook-secret';

function makeNango({ webhookSecret, connectionExists = true }: { webhookSecret?: Metadata[string]; connectionExists?: boolean } = {}) {
    const nango = new InternalNango({
        team: seeders.getTestTeam(),
        environment: seeders.getTestEnvironment(),
        plan: seeders.getTestPlan(),
        integration: getTestConfig({ provider: 'pagerduty' }),
        request: { method: 'POST', path: '/webhook', headers: {}, query: {}, body: null },
        logContextGetter
    });

    const getConnection = vi
        .spyOn(nango, 'getConnectionForWebhook')
        .mockResolvedValue(connectionExists ? { connectionId: CONNECTION_ID, metadata: webhookSecret === undefined ? null : { webhookSecret } } : null);
    const execute = vi.fn().mockResolvedValue({ connectionIds: [CONNECTION_ID], connectionMetadata: {} });
    nango.executeScriptForWebhooks = execute;
    const markUnverified = vi.spyOn(nango, 'markUnverified').mockImplementation(() => undefined);

    return { nango, getConnection, execute, markUnverified };
}

function sign(rawBody: string, secret = WEBHOOK_SECRET) {
    return `v1=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
}

function errType(result: unknown) {
    return (result as { error: NangoError }).error.type;
}

const body = { event: { event_type: 'incident.triggered' } };
const rawBody = JSON.stringify(body);
const idHeader = { 'x-nango-connection-id': CONNECTION_ID };

describe('pagerduty-webhook-routing', () => {
    it('routes a correctly signed webhook', async () => {
        const { nango, execute } = makeNango({ webhookSecret: WEBHOOK_SECRET });

        const result = await PagerDutyWebhookRouting.default(nango, { ...idHeader, 'x-pagerduty-signature': sign(rawBody) }, body as never, rawBody);

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledOnce();
    });

    it('accepts a single secret held in an array', async () => {
        const { nango, execute } = makeNango({ webhookSecret: [WEBHOOK_SECRET] });

        const result = await PagerDutyWebhookRouting.default(nango, { ...idHeader, 'x-pagerduty-signature': sign(rawBody) }, body as never, rawBody);

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledOnce();
    });

    it('picks the matching signature out of the header list', async () => {
        const { nango, execute } = makeNango({ webhookSecret: WEBHOOK_SECRET });
        const signatures = `v1=deadbeef, ${sign(rawBody)}`;

        const result = await PagerDutyWebhookRouting.default(nango, { ...idHeader, 'x-pagerduty-signature': signatures }, body as never, rawBody);

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledOnce();
    });

    it('rejects a missing signature before dispatch', async () => {
        const { nango, execute } = makeNango({ webhookSecret: WEBHOOK_SECRET });

        const result = await PagerDutyWebhookRouting.default(nango, idHeader, body as never, rawBody);

        expect(result.isErr()).toBe(true);
        expect(errType(result)).toBe('webhook_missing_signature');
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a forged signature before dispatch', async () => {
        const { nango, execute } = makeNango({ webhookSecret: WEBHOOK_SECRET });

        const result = await PagerDutyWebhookRouting.default(
            nango,
            { ...idHeader, 'x-pagerduty-signature': sign(rawBody, 'wrong-secret') },
            body as never,
            rawBody
        );

        expect(result.isErr()).toBe(true);
        expect(errType(result)).toBe('webhook_invalid_signature');
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a tampered body before dispatch', async () => {
        const { nango, execute } = makeNango({ webhookSecret: WEBHOOK_SECRET });

        const result = await PagerDutyWebhookRouting.default(nango, { ...idHeader, 'x-pagerduty-signature': sign(rawBody) }, body as never, `${rawBody} `);

        expect(result.isErr()).toBe(true);
        expect(errType(result)).toBe('webhook_invalid_signature');
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a non-string secret rather than keying an hmac with it', async () => {
        const { nango, execute } = makeNango({ webhookSecret: [123] as never });

        const result = await PagerDutyWebhookRouting.default(nango, { ...idHeader, 'x-pagerduty-signature': sign(rawBody) }, body as never, rawBody);

        expect(result.isErr()).toBe(true);
        expect(errType(result)).toBe('webhook_invalid_secret');
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects more than one configured secret', async () => {
        const { nango, execute } = makeNango({ webhookSecret: [WEBHOOK_SECRET, 'second'] });

        const result = await PagerDutyWebhookRouting.default(nango, { ...idHeader, 'x-pagerduty-signature': sign(rawBody) }, body as never, rawBody);

        expect(result.isErr()).toBe(true);
        expect(errType(result)).toBe('webhook_invalid_secret');
        expect(execute).not.toHaveBeenCalled();
    });

    it('does not forward or dispatch when the connection is unknown', async () => {
        // A 200 with no connection ids is forwarded to the environment webhook urls, and there is
        // no connection secret to verify against here, so this must not come back as a 200.
        const { nango, execute } = makeNango({ webhookSecret: WEBHOOK_SECRET, connectionExists: false });

        const result = await PagerDutyWebhookRouting.default(nango, idHeader, body as never, rawBody);

        expect(result.isOk()).toBe(true);
        expect(result.unwrap().statusCode).toBe(204);
        expect(result.unwrap()).not.toHaveProperty('toForward');
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a missing nango connection id header', async () => {
        const { nango, getConnection, execute } = makeNango({ webhookSecret: WEBHOOK_SECRET });

        const result = await PagerDutyWebhookRouting.default(nango, {}, body as never, rawBody);

        expect(result.isErr()).toBe(true);
        expect(errType(result)).toBe('webhook_missing_nango_connection_id');
        expect(getConnection).not.toHaveBeenCalled();
        expect(execute).not.toHaveBeenCalled();
    });

    it('marks the webhook unverified and still routes it when the connection has no secret', async () => {
        const { nango, execute, markUnverified } = makeNango();

        const result = await PagerDutyWebhookRouting.default(nango, idHeader, body as never, rawBody);

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledOnce();
        expect(markUnverified).toHaveBeenCalledWith({
            reason: 'pagerduty_missing_webhook_secret',
            remediation: 'Set webhookSecret in the connection metadata'
        });
    });
});
