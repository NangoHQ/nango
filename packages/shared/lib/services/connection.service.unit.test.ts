import { describe, expect, it } from 'vitest';

import connectionService from './connection.service.js';

import type { ProviderTwoStep, TwoStepCredentials } from '@nangohq/types';

describe('connection.service parseRawCredentials', () => {
    describe('TWO_STEP token_expires_in_ms', () => {
        it('token_expires_in_ms = 0 => no expiresAt (infinite token); change this test if you change that logic', () => {
            const template: ProviderTwoStep = {
                display_name: 'Test',
                docs: 'https://example.com',
                auth_mode: 'TWO_STEP',
                token_response: {
                    token: 'access_token'
                },
                token_expires_in_ms: 0
            };
            const rawCreds = { access_token: 'some-token' };

            const result = connectionService.parseRawCredentials(rawCreds, 'TWO_STEP', template) as TwoStepCredentials;

            expect(result.type).toBe('TWO_STEP');
            expect(result.expires_at).toBeUndefined();
        });
    });
});
