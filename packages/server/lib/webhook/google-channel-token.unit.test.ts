import { describe, expect, it } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { NangoError, seeders } from '@nangohq/shared';
import { getTestConfig } from '@nangohq/shared/lib/seeders/config.seeder.js';

import { validateGoogleChannelToken } from './google-channel-token.js';
import { InternalNango } from './internal-nango.js';

import type { IntegrationConfig } from '@nangohq/types';

function nangoFor(integration: IntegrationConfig): InternalNango {
    return new InternalNango({
        team: seeders.getTestTeam(),
        environment: seeders.getTestEnvironment(),
        plan: seeders.getTestPlan(),
        integration,
        request: { method: 'POST', path: '/webhook', headers: {}, query: {}, body: null },
        logContextGetter
    });
}

describe('validateGoogleChannelToken', () => {
    it('skips verification when no webhook secret is configured', () => {
        const integration = getTestConfig({ provider: 'google-drive' });

        const result = validateGoogleChannelToken(nangoFor(integration), {});

        expect(result.isOk()).toBe(true);
    });

    it('rejects a missing token when a webhook secret is configured', () => {
        const integration = getTestConfig({ provider: 'google-drive', custom: { webhookSecret: 'channel-secret' } });

        const result = validateGoogleChannelToken(nangoFor(integration), {});

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(NangoError);
            expect((result.error as NangoError).type).toBe('webhook_missing_token');
        }
    });

    it('rejects a mismatched token', () => {
        const integration = getTestConfig({ provider: 'google-drive', custom: { webhookSecret: 'channel-secret' } });

        const result = validateGoogleChannelToken(nangoFor(integration), { 'x-goog-channel-token': 'wrong' });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(NangoError);
            expect((result.error as NangoError).type).toBe('webhook_invalid_signature');
        }
    });

    it('accepts a matching token', () => {
        const integration = getTestConfig({ provider: 'google-drive', custom: { webhookSecret: 'channel-secret' } });

        const result = validateGoogleChannelToken(nangoFor(integration), { 'x-goog-channel-token': 'channel-secret' });

        expect(result.isOk()).toBe(true);
    });

    it('rejects a truthy non-string webhook secret', () => {
        const integration = getTestConfig({
            provider: 'google-drive',
            custom: { webhookSecret: 1 as unknown as string }
        });

        const result = validateGoogleChannelToken(nangoFor(integration), { 'x-goog-channel-token': 'channel-secret' });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(NangoError);
            expect((result.error as NangoError).type).toBe('webhook_invalid_signature');
        }
    });
});
