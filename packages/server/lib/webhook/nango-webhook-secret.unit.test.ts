import { describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { seeders } from '@nangohq/shared';
import { getTestConfig } from '@nangohq/shared/lib/seeders/config.seeder.js';

import * as AffinityWebhookRouting from './affinity-webhook-routing.js';
import * as FilloutWebhookRouting from './fillout-webhook-routing.js';
import { InternalNango } from './internal-nango.js';
import { verifyNangoWebhookSecret, withoutNangoWebhookSecret } from './nango-webhook-secret.js';
import * as ShipstationWebhookRouting from './shipstation-webhook-routing.js';

import type { WebhookHandler } from './types.js';
import type { NangoError } from '@nangohq/shared';

const SECRET = 'a-long-enough-webhook-secret';

function errType(result: unknown) {
    return (result as { error: NangoError }).error.type;
}

describe('verifyNangoWebhookSecret', () => {
    it('accepts the secret in the header', () => {
        expect(verifyNangoWebhookSecret({ secret: SECRET, headers: { 'x-nango-webhook-secret': SECRET } }).isOk()).toBe(true);
    });

    it('accepts the secret in the query param', () => {
        expect(verifyNangoWebhookSecret({ secret: SECRET, headers: {}, query: { nangoWebhookSecret: SECRET } }).isOk()).toBe(true);
    });

    it('rejects when no secret is configured', () => {
        const result = verifyNangoWebhookSecret({ secret: undefined, headers: { 'x-nango-webhook-secret': SECRET } });
        expect(errType(result)).toBe('webhook_invalid_secret');
    });

    it('rejects a configured secret that is too short to be safe', () => {
        const result = verifyNangoWebhookSecret({ secret: 'short', headers: { 'x-nango-webhook-secret': 'short' } });
        expect(errType(result)).toBe('webhook_invalid_secret');
    });

    it('rejects a missing secret', () => {
        expect(errType(verifyNangoWebhookSecret({ secret: SECRET, headers: {} }))).toBe('webhook_missing_signature');
    });

    it('rejects a wrong secret, including one of a different length', () => {
        expect(errType(verifyNangoWebhookSecret({ secret: SECRET, headers: { 'x-nango-webhook-secret': `${SECRET}x` } }))).toBe('webhook_invalid_signature');
        expect(errType(verifyNangoWebhookSecret({ secret: SECRET, headers: {}, query: { nangoWebhookSecret: 'nope' } }))).toBe('webhook_invalid_signature');
    });

    it('strips the query param so it does not reach functions', () => {
        expect(withoutNangoWebhookSecret({ nangoWebhookSecret: SECRET, other: '1' })).toEqual({ other: '1' });
    });
});

function makeNango(provider: string, secret?: string) {
    const integration = getTestConfig({ provider, ...(secret ? { custom: { webhookSecret: secret } } : {}) });
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
    return { nango, execute };
}

describe.each<{ provider: string; route: WebhookHandler; body: unknown }>([
    { provider: 'affinity', route: AffinityWebhookRouting.default, body: { type: 'list_entry.created', body: {}, sent_at: 1 } },
    { provider: 'fillout', route: FilloutWebhookRouting.default, body: { type: 'submission', formId: 'form-1' } },
    { provider: 'shipstation', route: ShipstationWebhookRouting.default, body: { resource_type: 'ORDER_NOTIFY', resource_url: 'https://x?storeID=1' } }
])('$provider webhook routing', ({ provider, route, body }) => {
    const rawBody = JSON.stringify(body);

    it('routes a webhook carrying the secret', async () => {
        const { nango, execute } = makeNango(provider, SECRET);

        const result = await route(nango, { 'x-nango-webhook-secret': SECRET }, body, rawBody, {});

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledOnce();
    });

    it('rejects a webhook without the secret before dispatching', async () => {
        const { nango, execute } = makeNango(provider, SECRET);

        const result = await route(nango, {}, body, rawBody, {});

        expect(errType(result)).toBe('webhook_missing_signature');
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects every webhook when the integration has no secret', async () => {
        const { nango, execute } = makeNango(provider);

        const result = await route(nango, { 'x-nango-webhook-secret': SECRET }, body, rawBody, {});

        expect(errType(result)).toBe('webhook_invalid_secret');
        expect(execute).not.toHaveBeenCalled();
    });
});
