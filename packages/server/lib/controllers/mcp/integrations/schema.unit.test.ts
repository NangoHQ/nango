import { describe, expect, it } from 'vitest';

import { integrationsCreateOutputSchema, integrationsGetOutputSchema, integrationsListOutputSchema } from './schema.js';

const integrationSummary = {
    unique_key: 'github',
    provider: 'github',
    display_name: 'GitHub',
    logo: 'https://example.com/github.svg',
    forward_webhooks: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z'
};

describe('integration MCP output schemas', () => {
    it('validates the shared integration summary for list and create outputs', () => {
        expect(integrationsListOutputSchema.safeParse({ data: [integrationSummary] }).success).toBe(true);
        expect(integrationsCreateOutputSchema.safeParse({ data: integrationSummary }).success).toBe(true);
    });

    it('extends the shared integration summary with get-only details', () => {
        const getOutput = {
            data: {
                ...integrationSummary,
                webhook_url: 'https://example.com/webhook',
                credentials: {
                    type: 'OAUTH2',
                    client_id: 'client-id',
                    client_secret: 'client-secret',
                    scopes: null,
                    webhook_secret: null
                }
            }
        };

        expect(integrationsGetOutputSchema.safeParse(getOutput).success).toBe(true);
        expect(integrationsCreateOutputSchema.safeParse(getOutput).success).toBe(false);
    });
});
