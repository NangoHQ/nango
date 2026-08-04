import { describe, expect, it } from 'vitest';

import { getVisibleIntegrationConfigValues } from './integrationConfig';

import type { SimplifiedJSONSchema } from '@nangohq/types';

describe('getVisibleIntegrationConfigValues', () => {
    it('returns declared visible fields without form-only OAuth credentials', () => {
        const schema: Record<string, SimplifiedJSONSchema> = {
            apiKey: { type: 'string', title: 'API Key', description: '', order: 1, automated: false },
            mode: { type: 'string', title: 'Mode', description: '', order: 2, automated: false },
            customUrl: {
                type: 'string',
                title: 'Custom URL',
                description: '',
                order: 3,
                automated: false,
                visible_when: { field: 'mode', equals: 'custom' }
            }
        };

        expect(
            getVisibleIntegrationConfigValues(schema, {
                apiKey: 'secret',
                mode: 'default',
                customUrl: 'https://hidden.example.com',
                oauthClientId: 'client-id',
                oauthClientSecret: 'client-secret',
                oauthScopes: 'messages'
            })
        ).toEqual({ apiKey: 'secret', mode: 'default' });
    });
});
