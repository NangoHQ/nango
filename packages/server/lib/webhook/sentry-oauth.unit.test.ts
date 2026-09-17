import crypto from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { seeders } from '@nangohq/shared';
import { getTestConfig } from '@nangohq/shared/lib/seeders/config.seeder.js';

import { InternalNango } from './internal-nango.js';
import * as SentryOauthWebhookRouting from './sentry-oauth.js';

import type { NangoError } from '@nangohq/shared';

const CLIENT_SECRET = 'sentry-client-secret';

function makeNango({ clientSecret }: { clientSecret?: string } = { clientSecret: CLIENT_SECRET }) {
    const integration = getTestConfig({ provider: 'sentry-oauth' });
    integration.oauth_client_secret = clientSecret as string;

    const nango = new InternalNango({
        team: seeders.getTestTeam(),
        environment: seeders.getTestEnvironment(),
        plan: seeders.getTestPlan(),
        integration,
        request: { method: 'POST', path: '/webhook', headers: {}, query: {}, body: null },
        logContextGetter
    });
    const execute = vi.fn().mockResolvedValue({ connectionIds: ['conn-1'], connectionMetadata: {} });
    nango.executeScriptForWebhooks = execute;
    const markUnverified = vi.spyOn(nango, 'markUnverified').mockImplementation(() => undefined);

    return { nango, execute, markUnverified };
}

function sign(body: unknown, secret = CLIENT_SECRET) {
    return crypto.createHmac('sha256', secret).update(JSON.stringify(body), 'utf8').digest('hex');
}

function errType(result: unknown) {
    return (result as { error: NangoError }).error.type;
}

const body = { action: 'triggered', installation: { uuid: 'inst-1', id: 'inst-1' } };

describe('sentry-oauth webhook routing', () => {
    it('routes a correctly signed webhook', async () => {
        const { nango, execute, markUnverified } = makeNango();

        const result = await SentryOauthWebhookRouting.default(nango, { 'sentry-hook-signature': sign(body) }, body, JSON.stringify(body));

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledOnce();
        expect(markUnverified).not.toHaveBeenCalled();
    });

    it('rejects an unsigned webhook when a client secret is configured', async () => {
        const { nango, execute, markUnverified } = makeNango();

        const result = await SentryOauthWebhookRouting.default(nango, {}, body, JSON.stringify(body));

        expect(result.isErr()).toBe(true);
        expect(errType(result)).toBe('webhook_missing_signature');
        expect(execute).not.toHaveBeenCalled();
        expect(markUnverified).not.toHaveBeenCalled();
    });

    it('does not reach connection creation on an unsigned installation webhook', async () => {
        const { nango, execute } = makeNango();
        const installation = { action: 'created', actor: { id: 7 }, installation: { uuid: 'inst-1', id: 'inst-1' } };

        const result = await SentryOauthWebhookRouting.default(nango, { 'sentry-hook-resource': 'installation' }, installation, JSON.stringify(installation));

        expect(result.isErr()).toBe(true);
        expect(errType(result)).toBe('webhook_missing_signature');
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects an invalid signature', async () => {
        const { nango, execute } = makeNango();

        const result = await SentryOauthWebhookRouting.default(nango, { 'sentry-hook-signature': sign(body, 'wrong-secret') }, body, JSON.stringify(body));

        expect(result.isErr()).toBe(true);
        expect(errType(result)).toBe('webhook_invalid_signature');
        expect(execute).not.toHaveBeenCalled();
    });

    it('marks the webhook unverified and still routes it when no client secret is configured', async () => {
        const { nango, execute, markUnverified } = makeNango({ clientSecret: '' });

        const result = await SentryOauthWebhookRouting.default(nango, {}, body, JSON.stringify(body));

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledOnce();
        expect(markUnverified).toHaveBeenCalledWith({
            reason: 'sentry_missing_client_secret',
            remediation: 'Set the client secret on the integration'
        });
    });
});
