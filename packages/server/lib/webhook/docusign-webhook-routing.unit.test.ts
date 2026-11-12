import crypto from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { seeders } from '@nangohq/shared';
import { getTestConfig } from '@nangohq/shared/lib/seeders/config.seeder.js';

import * as DocusignWebhookRouting from './docusign-webhook-routing.js';
import { InternalNango } from './internal-nango.js';

import type { NangoError } from '@nangohq/shared';

const KEY = 'docusign-connect-hmac-key-one=';
const OTHER_KEY = 'docusign-connect-hmac-key-two=';

const envelopeEvent = {
    event: 'envelope-completed',
    apiVersion: 'v2.1',
    configurationId: 10001,
    generatedDateTime: '2026-11-09T12:00:00.000Z',
    data: { accountId: 'account-1', userId: 'user-1', envelopeId: 'envelope-1' }
};
const rawBody = JSON.stringify(envelopeEvent);

function sign(key: string, body: string = rawBody) {
    return crypto.createHmac('sha256', key).update(body, 'utf8').digest('base64');
}

function errType(result: unknown) {
    return (result as { error: NangoError }).error.type;
}

function value(result: unknown) {
    return (result as { value: { connectionIds: string[]; toForward: unknown } }).value;
}

function makeNango({ webhookSecret, allowUnverifiedWebhooks = false }: { webhookSecret?: string; allowUnverifiedWebhooks?: boolean } = {}) {
    const nango = new InternalNango({
        team: seeders.getTestTeam(),
        environment: seeders.getTestEnvironment(),
        plan: seeders.getTestPlan(),
        integration: getTestConfig({
            provider: 'docusign',
            allow_unverified_webhooks: allowUnverifiedWebhooks,
            ...(webhookSecret ? { custom: { webhookSecret } } : {})
        }),
        request: { method: 'POST', path: '/webhook', headers: {}, query: {}, body: null },
        logContextGetter
    });
    const execute = vi.fn(() => Promise.resolve({ connectionIds: ['conn-1'], connectionMetadata: {} }));
    nango.executeScriptForWebhooks = execute;
    return { nango, execute };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('docusign webhook routing', () => {
    it('routes a signed event by data.accountId, using the event as webhook type', async () => {
        const { nango, execute } = makeNango({ webhookSecret: KEY });

        const result = await DocusignWebhookRouting.default(nango, { 'x-docusign-signature-1': sign(KEY) }, envelopeEvent, rawBody);

        expect(value(result).connectionIds).toEqual(['conn-1']);
        expect(value(result).toForward).toEqual(envelopeEvent);
        expect(execute).toHaveBeenCalledWith({ payload: envelopeEvent, webhookType: 'event', connectionIdentifier: 'data.accountId', propName: 'accountId' });
    });

    it('accepts a match on any of the signature headers', async () => {
        const { nango } = makeNango({ webhookSecret: KEY });

        const headers = { 'x-docusign-signature-1': sign(OTHER_KEY), 'x-docusign-signature-2': sign(KEY) };
        const result = await DocusignWebhookRouting.default(nango, headers, envelopeEvent, rawBody);

        expect(value(result).connectionIds).toEqual(['conn-1']);
    });

    it('rejects a tampered body or a different key', async () => {
        const { nango, execute } = makeNango({ webhookSecret: KEY });

        const tampered = JSON.stringify({ ...envelopeEvent, event: 'envelope-voided' });
        expect(errType(await DocusignWebhookRouting.default(nango, { 'x-docusign-signature-1': sign(KEY) }, envelopeEvent, tampered))).toBe(
            'webhook_invalid_signature'
        );
        expect(errType(await DocusignWebhookRouting.default(nango, { 'x-docusign-signature-1': sign(OTHER_KEY) }, envelopeEvent, rawBody))).toBe(
            'webhook_invalid_signature'
        );
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects an unsigned event when a secret is set, even if unverified webhooks are allowed', async () => {
        const { nango, execute } = makeNango({ webhookSecret: KEY, allowUnverifiedWebhooks: true });

        expect(errType(await DocusignWebhookRouting.default(nango, {}, envelopeEvent, rawBody))).toBe('webhook_missing_signature');
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects events when no secret is set, unless the integration allows unverified webhooks', async () => {
        const rejected = makeNango();
        expect(errType(await DocusignWebhookRouting.default(rejected.nango, {}, envelopeEvent, rawBody))).toBe('webhook_invalid_secret');
        expect(rejected.execute).not.toHaveBeenCalled();

        const allowed = makeNango({ allowUnverifiedWebhooks: true });
        expect(value(await DocusignWebhookRouting.default(allowed.nango, {}, envelopeEvent, rawBody)).connectionIds).toEqual(['conn-1']);
        expect(allowed.nango.unverified?.reason).toBe('docusign_missing_webhook_secret');
    });
});
