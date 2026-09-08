import { describe, expect, it, vi } from 'vitest';

import { unverifiedWebhookMessage, warnUnverifiedWebhook } from './missing-secret.js';

const integration = { provider: 'folk', unique_key: 'folk-prod' };

describe('unverifiedWebhookMessage', () => {
    it('falls back to the integration remediation', () => {
        const message = unverifiedWebhookMessage(integration, { reason: 'folk_missing_webhook_secret' });

        expect(message).toContain('This webhook was not verified');
        expect(message).toContain('as if they came from folk');
        expect(message).toContain('Set the webhook secret on the integration to enable verification');
    });

    it('uses the remediation it is given', () => {
        const message = unverifiedWebhookMessage(integration, {
            reason: 'folk_missing_webhook_secret',
            remediation: 'Set webhookSecret in the connection metadata'
        });

        expect(message).toContain('Set webhookSecret in the connection metadata to enable verification');
        expect(message).not.toContain('Set the webhook secret on the integration');
    });
});

describe('warnUnverifiedWebhook', () => {
    it('warns on the log context it is handed rather than creating one', () => {
        const logCtx = { warn: vi.fn().mockResolvedValue(true) };

        warnUnverifiedWebhook(logCtx as any, integration, { reason: 'folk_missing_webhook_secret' });

        expect(logCtx.warn).toHaveBeenCalledOnce();
        expect(logCtx.warn).toHaveBeenCalledWith(expect.stringContaining('This webhook was not verified'), {
            provider: 'folk',
            integration: 'folk-prod',
            reason: 'folk_missing_webhook_secret'
        });
    });
});
