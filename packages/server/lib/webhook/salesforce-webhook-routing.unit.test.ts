import { beforeEach, describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { seeders } from '@nangohq/shared';
import { getTestConfig } from '@nangohq/shared/lib/seeders/config.seeder.js';

import { InternalNango } from './internal-nango.js';
import * as SalesforceWebhookRouting from './salesforce-webhook-routing.js';

import type { NangoError } from '@nangohq/shared';

const flagMocks = vi.hoisted(() => ({ allowUnauthorizedSalesforceWebhook: vi.fn() }));

vi.mock('@nangohq/feature-flags', () => ({
    getFlags: () => ({ allowUnauthorizedSalesforceWebhook: flagMocks.allowUnauthorizedSalesforceWebhook })
}));

const CONNECTION_SECRET = 'connection-secret-0123456789';
const INTEGRATION_SECRET = 'integration-secret-0123456789';
const body = { nango: { connectionId: 'conn-1', eventType: 'account.updated' } };
const rawBody = JSON.stringify(body);

function errType(result: unknown) {
    return (result as { error: NangoError }).error.type;
}

function makeNango({ integrationSecret, connectionSecret }: { integrationSecret?: string; connectionSecret?: unknown } = {}) {
    const integration = getTestConfig({ provider: 'salesforce', ...(integrationSecret ? { custom: { webhookSecret: integrationSecret } } : {}) });
    const nango = new InternalNango({
        team: seeders.getTestTeam(),
        environment: seeders.getTestEnvironment(),
        plan: seeders.getTestPlan(),
        integration,
        request: { method: 'POST', path: '/webhook', headers: {}, query: {}, body: null },
        logContextGetter
    });

    vi.spyOn(nango, 'getConnectionForWebhook').mockResolvedValue({
        connectionId: 'conn-1',
        metadata: connectionSecret === undefined ? null : ({ webhookSecret: connectionSecret } as never)
    });
    const execute = vi.fn().mockResolvedValue({ connectionIds: ['conn-1'], connectionMetadata: {} });
    nango.executeScriptForWebhooks = execute;
    const markUnverified = vi.spyOn(nango, 'markUnverified').mockImplementation(() => undefined);

    return { nango, execute, markUnverified };
}

describe('salesforce-webhook-routing', () => {
    beforeEach(() => {
        flagMocks.allowUnauthorizedSalesforceWebhook.mockReset();
        flagMocks.allowUnauthorizedSalesforceWebhook.mockResolvedValue(false);
    });

    it('routes a webhook carrying the connection secret', async () => {
        const { nango, execute, markUnverified } = makeNango({ connectionSecret: CONNECTION_SECRET, integrationSecret: INTEGRATION_SECRET });

        const result = await SalesforceWebhookRouting.default(nango, { 'x-nango-webhook-secret': CONNECTION_SECRET }, body, rawBody, {});

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledOnce();
        expect(markUnverified).not.toHaveBeenCalled();
    });

    it('does not accept the integration secret when the connection has its own', async () => {
        const { nango, execute } = makeNango({ connectionSecret: CONNECTION_SECRET, integrationSecret: INTEGRATION_SECRET });

        const result = await SalesforceWebhookRouting.default(nango, { 'x-nango-webhook-secret': INTEGRATION_SECRET }, body, rawBody, {});

        expect(errType(result)).toBe('webhook_invalid_signature');
        expect(execute).not.toHaveBeenCalled();
    });

    it('falls back to the integration secret', async () => {
        const { nango, execute } = makeNango({ integrationSecret: INTEGRATION_SECRET });

        const result = await SalesforceWebhookRouting.default(nango, { 'x-nango-webhook-secret': INTEGRATION_SECRET }, body, rawBody, {});

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledOnce();
    });

    it('rejects a missing secret when one is configured, even with the flag on', async () => {
        flagMocks.allowUnauthorizedSalesforceWebhook.mockResolvedValue(true);
        const { nango, execute } = makeNango({ connectionSecret: CONNECTION_SECRET });

        const result = await SalesforceWebhookRouting.default(nango, {}, body, rawBody, {});

        expect(errType(result)).toBe('webhook_missing_signature');
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a non string connection secret', async () => {
        const { nango } = makeNango({ connectionSecret: 42 });

        expect(errType(await SalesforceWebhookRouting.default(nango, {}, body, rawBody, {}))).toBe('webhook_invalid_secret');
    });

    it('rejects an unverified webhook when the account is not allowed', async () => {
        const { nango, execute, markUnverified } = makeNango();

        const result = await SalesforceWebhookRouting.default(nango, {}, body, rawBody, {});

        expect(errType(result)).toBe('webhook_invalid_secret');
        expect(markUnverified).toHaveBeenCalledOnce();
        expect(execute).not.toHaveBeenCalled();
    });

    it('routes an unverified webhook when the account is allowed', async () => {
        flagMocks.allowUnauthorizedSalesforceWebhook.mockResolvedValue(true);
        const { nango, execute, markUnverified } = makeNango();

        const result = await SalesforceWebhookRouting.default(nango, {}, body, rawBody, {});

        expect(result.isOk()).toBe(true);
        expect(markUnverified).toHaveBeenCalledWith(expect.objectContaining({ reason: 'salesforce_missing_webhook_secret' }));
        expect(execute).toHaveBeenCalledOnce();
    });
});
