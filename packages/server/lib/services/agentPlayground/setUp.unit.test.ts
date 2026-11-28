import { describe, expect, it } from 'vitest';

import { existingIntegrationFor } from './setUp.js';

describe('existingIntegrationFor', () => {
    it('prefers the one keyed by the provider name, then an older pg- one, then the oldest', () => {
        const integrations = [
            { unique_key: 'pg-slack', provider: 'slack', missing_fields: [] },
            { unique_key: 'slack', provider: 'slack', missing_fields: [] },
            { unique_key: 'old-calendar', provider: 'google-calendar', missing_fields: [] },
            { unique_key: 'pg-google-calendar', provider: 'google-calendar', missing_fields: [] },
            { unique_key: 'new-github', provider: 'github', missing_fields: [] },
            { unique_key: 'newer-github', provider: 'github', missing_fields: [] }
        ];

        expect(existingIntegrationFor(integrations, 'slack')?.unique_key).toBe('slack');
        expect(existingIntegrationFor(integrations, 'google-calendar')?.unique_key).toBe('pg-google-calendar');
        expect(existingIntegrationFor(integrations, 'github')?.unique_key).toBe('new-github');
        expect(existingIntegrationFor(integrations, 'linear')).toBeUndefined();
    });

    it('prefers a complete integration, and falls back to an incomplete one', () => {
        const integrations = [
            { unique_key: 'slack', provider: 'slack', missing_fields: ['oauth_client_secret'] },
            { unique_key: 'slack-prod', provider: 'slack', missing_fields: [] },
            { unique_key: 'linear', provider: 'linear', missing_fields: ['oauth_client_id'] }
        ];

        expect(existingIntegrationFor(integrations, 'slack')?.unique_key).toBe('slack-prod');
        expect(existingIntegrationFor(integrations, 'linear')?.unique_key).toBe('linear');
    });
});
