import { describe, expect, it } from 'vitest';

import { NangoError } from '@nangohq/shared';
import { getTestConfig } from '@nangohq/shared/lib/seeders/config.seeder.js';

import { validateGoogleChannelToken } from './google-channel-token.js';

describe('validateGoogleChannelToken', () => {
    it('skips verification when no webhook secret is configured', () => {
        const integration = getTestConfig({ provider: 'google-drive' });

        const result = validateGoogleChannelToken(integration, {});

        expect(result.isOk()).toBe(true);
    });

    it('rejects a missing token when a webhook secret is configured', () => {
        const integration = getTestConfig({ provider: 'google-drive', custom: { webhookSecret: 'channel-secret' } });

        const result = validateGoogleChannelToken(integration, {});

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(NangoError);
            expect(result.error.type).toBe('webhook_missing_token');
        }
    });

    it('rejects a mismatched token', () => {
        const integration = getTestConfig({ provider: 'google-drive', custom: { webhookSecret: 'channel-secret' } });

        const result = validateGoogleChannelToken(integration, { 'x-goog-channel-token': 'wrong' });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(NangoError);
            expect(result.error.type).toBe('webhook_invalid_signature');
        }
    });

    it('accepts a matching token', () => {
        const integration = getTestConfig({ provider: 'google-drive', custom: { webhookSecret: 'channel-secret' } });

        const result = validateGoogleChannelToken(integration, { 'x-goog-channel-token': 'channel-secret' });

        expect(result.isOk()).toBe(true);
    });
});
