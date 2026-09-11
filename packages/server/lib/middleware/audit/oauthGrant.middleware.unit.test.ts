import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { auditOAuthGrantApproved, auditOAuthGrantDenied, auditOAuthGrantsRevoked, recordOAuthGrantRevocation } from './oauthGrant.middleware.js';
import { fakeReq, fakeRes, installAuditMockDefaults, recordMock, resetAuditMocks, runAudit } from './testing.js';

vi.mock('../../audit.js', async (importOriginal) => (await import('./testing.js')).auditModuleMock(importOriginal as never));
vi.mock('@nangohq/shared', async (importOriginal) => (await import('./testing.js')).sharedModuleMock(importOriginal as never));

const consentFacts: NonNullable<Express.AuditFacts['oauthConsent']> = {
    userId: 7,
    userEmail: 'dev@example.com',
    accountId: 42,
    clientHostname: 'client.example.com',
    resourceHostnames: ['mcp.example.com'],
    scopes: ['environment:*'],
    productGrantId: 'grant-1'
};

describe('OAuth grant audit middleware (unit)', () => {
    beforeEach(() => {
        installAuditMockDefaults();
    });

    afterEach(() => {
        resetAuditMocks();
    });

    it('records an approved product grant with bounded display metadata', async () => {
        const event: unknown = await runAudit(auditOAuthGrantApproved, fakeReq({ audit: { oauthConsent: consentFacts } }), fakeRes({}));

        expect(event).toMatchObject({
            resource: 'oauth_grant',
            action: 'approved',
            outcome: 'success',
            accountId: 42,
            scope: 'account',
            environment: null,
            actor: { type: 'user', id: '7', display: 'dev@example.com' },
            targets: [{ type: 'oauth_grant', id: 'grant-1' }],
            metadata: {
                clientHostname: 'client.example.com',
                resourceHostnames: ['mcp.example.com'],
                scopes: ['environment:*']
            }
        });
    });

    it('records a rejected denial against the client when no grant exists', async () => {
        const facts = { ...consentFacts, productGrantId: undefined };
        const event: unknown = await runAudit(auditOAuthGrantDenied, fakeReq({ audit: { oauthConsent: facts } }), fakeRes({}, 403));

        expect(event).toMatchObject({
            resource: 'oauth_grant',
            action: 'denied',
            outcome: 'denied',
            accountId: 42,
            scope: 'account',
            environment: null,
            actor: { type: 'user', id: '7', display: 'dev@example.com' },
            targets: [{ type: 'oauth_client', id: 'client.example.com', display: 'client.example.com' }]
        });
    });

    it('records password-triggered revocation after the handler succeeds', async () => {
        const event: unknown = await runAudit(
            auditOAuthGrantsRevoked,
            fakeReq({
                audit: {
                    oauthGrantRevocations: {
                        userId: 7,
                        userEmail: 'dev@example.com',
                        accountId: 42,
                        grants: [{ id: 'grant-1', resourceHostnames: ['mcp.example.com'], scopes: ['environment:*'] }]
                    }
                }
            }),
            fakeRes({})
        );

        expect(event).toMatchObject({
            resource: 'oauth_grant',
            action: 'revoked',
            outcome: 'success',
            accountId: 42,
            scope: 'account',
            environment: null,
            actor: { type: 'user', id: '7', display: 'dev@example.com' },
            targets: [{ type: 'oauth_grant', id: 'grant-1' }],
            metadata: { resourceHostnames: ['mcp.example.com'], scopes: ['environment:*'] }
        });
    });

    it('records token revocation without persisting the client id or resource URLs', async () => {
        await recordOAuthGrantRevocation(
            {
                id: 'grant-1',
                accountId: 42,
                userId: 7,
                userEmail: 'dev@example.com',
                resources: [{ resource: 'https://mcp.example.com/mcp', scopes: ['environment:*'] }]
            },
            { clientId: 'https://client.example.com/oauth/metadata.json', ip: '203.0.113.7', userAgent: 'vitest' }
        );

        expect(recordMock).toHaveBeenCalledWith(
            expect.objectContaining({
                resource: 'oauth_grant',
                action: 'revoked',
                outcome: 'success',
                accountId: 42,
                scope: 'account',
                environment: null,
                actor: { type: 'unknown', id: 'client.example.com', display: 'client.example.com' },
                targets: [{ type: 'oauth_grant', id: 'grant-1' }],
                context: { interface: 'api', ip: '203.0.113.7', userAgent: 'vitest' },
                metadata: {
                    clientHostname: 'client.example.com',
                    resourceHostnames: ['mcp.example.com'],
                    scopes: ['environment:*']
                }
            })
        );
        expect(JSON.stringify(recordMock.mock.calls.at(-1)?.[0])).not.toContain('/oauth/metadata.json');
        expect(JSON.stringify(recordMock.mock.calls.at(-1)?.[0])).not.toContain('/mcp');
    });
});
