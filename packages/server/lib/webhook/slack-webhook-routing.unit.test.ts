import crypto from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { seeders } from '@nangohq/shared';
import { getTestConfig } from '@nangohq/shared/lib/seeders/config.seeder.js';

import { InternalNango } from './internal-nango.js';
import * as SlackWebhookRouting from './slack-webhook-routing.js';

import type { NangoError } from '@nangohq/shared';

const SIGNING_SECRET = 'slack-signing-secret';

function makeNango(mock = vi.fn(), { webhookSecret }: { webhookSecret?: string } = {}) {
    const integration = getTestConfig({ provider: 'slack', ...(webhookSecret ? { custom: { webhookSecret } } : {}) });
    const nango = new InternalNango({
        team: seeders.getTestTeam(),
        environment: seeders.getTestEnvironment(),
        plan: seeders.getTestPlan(),
        integration,
        request: { method: 'POST', path: '/webhook', headers: {}, query: {}, body: null },
        logContextGetter
    });
    nango.executeScriptForWebhooks = mock;
    const markUnverified = vi.spyOn(nango, 'markUnverified').mockImplementation(() => undefined);
    return { nango, mock, markUnverified };
}

function sign(rawBody: string, timestamp: number, secret = SIGNING_SECRET) {
    const digest = crypto.createHmac('sha256', secret).update(`v0:${timestamp}:${rawBody}`, 'utf8').digest('hex');
    return {
        'x-slack-signature': `v0=${digest}`,
        'x-slack-request-timestamp': String(timestamp)
    };
}

function now() {
    return Math.floor(Date.now() / 1000);
}

function errType(result: { isErr: () => boolean; error?: unknown }) {
    return (result as { error: NangoError }).error.type;
}

const interactivityPayload = {
    type: 'block_actions',
    team_id: 'T123ABC',
    team: { id: 'T123ABC', domain: 'testworkspace' },
    actions: [{ action_id: 'button_click', type: 'button' }]
};

describe('slack-webhook-routing', () => {
    it('forwards interactivity payload with exact content-type', async () => {
        const { nango, mock } = makeNango();

        const result = await SlackWebhookRouting.default(
            nango as unknown as InternalNango,
            { 'content-type': 'application/x-www-form-urlencoded' },
            { payload: JSON.stringify(interactivityPayload) },
            ''
        );

        expect(result.isOk()).toBe(true);
        expect(result.unwrap().statusCode).toBe(200);
        expect(mock).toHaveBeenCalledOnce();
    });

    it('forwards interactivity payload when content-type includes charset (Slack button clicks)', async () => {
        const { nango, mock } = makeNango();

        const result = await SlackWebhookRouting.default(
            nango as unknown as InternalNango,
            { 'content-type': 'application/x-www-form-urlencoded; charset=utf-8' },
            { payload: JSON.stringify(interactivityPayload) },
            ''
        );

        expect(result.isOk()).toBe(true);
        expect(result.unwrap().statusCode).toBe(200);
        expect(mock).toHaveBeenCalledOnce();
    });

    it('forwards JSON Events API payload (application/json)', async () => {
        const { nango, mock } = makeNango();

        const body = { type: 'event_callback', team_id: 'T123ABC', event: { type: 'message' } };

        const result = await SlackWebhookRouting.default(nango as unknown as InternalNango, { 'content-type': 'application/json' }, body, '');

        expect(result.isOk()).toBe(true);
        expect(result.unwrap().statusCode).toBe(200);
        expect(mock).toHaveBeenCalledOnce();
    });

    it('responds to url_verification challenge without calling executeScriptForWebhooks', async () => {
        const { nango, mock } = makeNango();

        const result = await SlackWebhookRouting.default(
            nango as unknown as InternalNango,
            { 'content-type': 'application/json' },
            { type: 'url_verification', challenge: 'abc123' },
            ''
        );

        expect(result.isOk()).toBe(true);
        expect(result.unwrap().statusCode).toBe(200);
        expect(result.unwrap().content).toBe('abc123');
        expect(mock).not.toHaveBeenCalled();
    });

    describe('signature verification', () => {
        const eventBody = { type: 'event_callback', team_id: 'T123ABC', event: { type: 'message' } };
        const rawBody = JSON.stringify(eventBody);

        it('routes a correctly signed webhook', async () => {
            const { nango, mock, markUnverified } = makeNango(vi.fn(), { webhookSecret: SIGNING_SECRET });

            const result = await SlackWebhookRouting.default(
                nango as unknown as InternalNango,
                { 'content-type': 'application/json', ...sign(rawBody, now()) },
                eventBody,
                rawBody
            );

            expect(result.isOk()).toBe(true);
            expect(mock).toHaveBeenCalledOnce();
            expect(markUnverified).not.toHaveBeenCalled();
        });

        it('rejects a webhook with no signature headers before dispatch', async () => {
            const { nango, mock } = makeNango(vi.fn(), { webhookSecret: SIGNING_SECRET });

            const result = await SlackWebhookRouting.default(nango as unknown as InternalNango, { 'content-type': 'application/json' }, eventBody, rawBody);

            expect(result.isErr()).toBe(true);
            expect(errType(result)).toBe('webhook_missing_signature');
            expect(mock).not.toHaveBeenCalled();
        });

        it('rejects an invalid signature before dispatch', async () => {
            const { nango, mock } = makeNango(vi.fn(), { webhookSecret: SIGNING_SECRET });
            const headers = { 'content-type': 'application/json', ...sign(rawBody, now(), 'wrong-secret') };

            const result = await SlackWebhookRouting.default(nango as unknown as InternalNango, headers, eventBody, rawBody);

            expect(result.isErr()).toBe(true);
            expect(errType(result)).toBe('webhook_invalid_signature');
            expect(mock).not.toHaveBeenCalled();
        });

        it('rejects a signature over a tampered body', async () => {
            const { nango, mock } = makeNango(vi.fn(), { webhookSecret: SIGNING_SECRET });
            const headers = { 'content-type': 'application/json', ...sign(rawBody, now()) };

            const result = await SlackWebhookRouting.default(nango as unknown as InternalNango, headers, eventBody, `${rawBody} `);

            expect(result.isErr()).toBe(true);
            expect(errType(result)).toBe('webhook_invalid_signature');
            expect(mock).not.toHaveBeenCalled();
        });

        it('rejects a stale timestamp even when the signature matches', async () => {
            const { nango, mock } = makeNango(vi.fn(), { webhookSecret: SIGNING_SECRET });
            const stale = now() - 6 * 60;
            const headers = { 'content-type': 'application/json', ...sign(rawBody, stale) };

            const result = await SlackWebhookRouting.default(nango as unknown as InternalNango, headers, eventBody, rawBody);

            expect(result.isErr()).toBe(true);
            expect(errType(result)).toBe('webhook_invalid_signature');
            expect(mock).not.toHaveBeenCalled();
        });

        it('verifies the form encoded body Slack actually signed', async () => {
            const { nango, mock } = makeNango(vi.fn(), { webhookSecret: SIGNING_SECRET });
            const form = `payload=${encodeURIComponent(JSON.stringify(interactivityPayload))}`;
            const headers = { 'content-type': 'application/x-www-form-urlencoded', ...sign(form, now()) };

            const result = await SlackWebhookRouting.default(
                nango as unknown as InternalNango,
                headers,
                { payload: JSON.stringify(interactivityPayload) },
                form
            );

            expect(result.isOk()).toBe(true);
            expect(mock).toHaveBeenCalledOnce();
        });

        it('does not answer the url_verification challenge on a forged request', async () => {
            const { nango, mock } = makeNango(vi.fn(), { webhookSecret: SIGNING_SECRET });
            const challenge = { type: 'url_verification', challenge: 'abc123' };

            const result = await SlackWebhookRouting.default(
                nango as unknown as InternalNango,
                { 'content-type': 'application/json' },
                challenge,
                JSON.stringify(challenge)
            );

            expect(result.isErr()).toBe(true);
            expect(mock).not.toHaveBeenCalled();
        });

        it('answers the url_verification challenge when correctly signed', async () => {
            const { nango } = makeNango(vi.fn(), { webhookSecret: SIGNING_SECRET });
            const challenge = { type: 'url_verification', challenge: 'abc123' };
            const raw = JSON.stringify(challenge);

            const result = await SlackWebhookRouting.default(
                nango as unknown as InternalNango,
                { 'content-type': 'application/json', ...sign(raw, now()) },
                challenge,
                raw
            );

            expect(result.isOk()).toBe(true);
            expect(result.unwrap().content).toBe('abc123');
        });

        it('rejects when a secret is set but the raw body is unavailable', async () => {
            const { nango, mock } = makeNango(vi.fn(), { webhookSecret: SIGNING_SECRET });
            const headers = { 'content-type': 'application/json', ...sign(rawBody, now()) };

            const result = await SlackWebhookRouting.default(nango as unknown as InternalNango, headers, eventBody, '');

            expect(result.isErr()).toBe(true);
            expect(errType(result)).toBe('webhook_invalid_signature');
            expect(mock).not.toHaveBeenCalled();
        });

        it('marks the webhook unverified and still routes it when no secret is configured', async () => {
            const { nango, mock, markUnverified } = makeNango();

            const result = await SlackWebhookRouting.default(nango as unknown as InternalNango, { 'content-type': 'application/json' }, eventBody, rawBody);

            expect(result.isOk()).toBe(true);
            expect(mock).toHaveBeenCalledOnce();
            expect(markUnverified).toHaveBeenCalledWith({
                reason: 'slack_missing_signing_secret',
                remediation: 'Set the Slack signing secret on the integration'
            });
        });
    });
});
