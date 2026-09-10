import { describe, expect, it } from 'vitest';

import { oauthConsentDecisionSchema, oauthConsentInteractionSchema, oauthLoginHandoffSuccessSchema } from './contracts.js';

describe('OAuth consent contracts', () => {
    it('accepts bounded multi-resource interaction data', () => {
        expect(
            oauthConsentInteractionSchema.safeParse({
                interactionId: 'interaction-id',
                expiresAt: new Date(Date.now() + 60_000).toISOString(),
                csrfToken: 'x'.repeat(32),
                client: { name: 'Example client', hostname: 'client.example.com', verified: false },
                callbackHostname: 'client.example.com',
                account: { name: 'Example account' },
                resources: [
                    { resource: 'https://api.example.com/mcp', hostname: 'api.example.com', scopes: ['environment:*'] },
                    { resource: 'https://agents.example.com/mcp', hostname: 'agents.example.com', scopes: ['agent-session:*'] }
                ]
            }).success
        ).toBe(true);
    });

    it('rejects unknown fields and verified client claims', () => {
        const base = {
            interactionId: 'interaction-id',
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
            csrfToken: 'x'.repeat(32),
            client: { name: 'Example client', hostname: 'client.example.com', verified: true },
            callbackHostname: 'client.example.com',
            account: { name: 'Example account' },
            resources: [{ resource: 'https://api.example.com/mcp', hostname: 'api.example.com', scopes: ['environment:*'] }],
            authorizationUrl: 'https://issuer.example.com/oauth/authorize?secret=value'
        };
        expect(oauthConsentInteractionSchema.safeParse(base).success).toBe(false);
    });

    it('requires strong handoff and CSRF values', () => {
        expect(oauthConsentDecisionSchema.safeParse({ csrfToken: 'short' }).success).toBe(false);
        expect(oauthLoginHandoffSuccessSchema.safeParse({ data: { consumeUrl: 'https://id.nango.dev/oauth/consent/id/handoff', code: 'short' } }).success).toBe(
            false
        );
    });
});
