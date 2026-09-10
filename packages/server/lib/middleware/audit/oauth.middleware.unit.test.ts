import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { auditOAuthApproved, auditOAuthDenied, auditOAuthSession } from './oauth.middleware.js';
import { fakeReq, fakeRes, installAuditMockDefaults, locals, recordMock, resetAuditMocks, runAudit } from './testing.js';

vi.mock('../../audit.js', async (importOriginal) => (await import('./testing.js')).auditModuleMock(importOriginal as never));
vi.mock('@nangohq/shared', async (importOriginal) => (await import('./testing.js')).sharedModuleMock(importOriginal as never));

describe('OAuth audit policy', () => {
    beforeEach(installAuditMockDefaults);
    afterEach(resetAuditMocks);

    it('records approved product grant without credential-bearing request or response data', async () => {
        const req = fakeReq({ params: { uid: 'sensitive-interaction' }, body: { csrfToken: 'sensitive-csrf' } });
        const res = fakeRes(locals);
        await new Promise<void>((resolve) => auditOAuthApproved(req, res, () => resolve()));
        res.json({ data: { grantId: 'product-grant-id', redirectUrl: 'https://id.nango.dev/oauth/authorize/secret' } });
        res.emit('finish');
        await vi.waitFor(() => expect(recordMock).toHaveBeenCalled());
        const event = recordMock.mock.calls[0]![0];
        expect(event).toMatchObject({
            accountId: 42,
            environment: null,
            scope: 'account',
            resource: 'oauth_grant',
            action: 'approved',
            outcome: 'success',
            actor: { type: 'user', id: '7' },
            targets: [{ type: 'oauth_grant', id: 'product-grant-id' }]
        });
        expect(JSON.stringify(event)).not.toMatch(/sensitive|secret|id\.nango/);
    });

    it.each([200, 403, 500])('records consent denial and failure outcomes (%i)', async (status) => {
        const event = await runAudit(auditOAuthDenied, fakeReq(), fakeRes(locals, status));
        expect(event).toMatchObject({
            accountId: 42,
            environment: null,
            scope: 'account',
            resource: 'oauth_grant',
            action: 'denied',
            outcome: status === 200 ? 'success' : status === 403 ? 'denied' : 'failure',
            actor: { type: 'user', id: '7' }
        });
    });

    it('records session establishment after the callback resolves its identity', async () => {
        const res = fakeRes({}, 303);
        await new Promise<void>((resolve) => auditOAuthSession(fakeReq({ query: { code: 'secret' } }), res, () => resolve()));
        res.locals = locals;
        res.emit('finish');
        await vi.waitFor(() => expect(recordMock).toHaveBeenCalled());
        expect(recordMock.mock.calls[0]![0]).toMatchObject({
            accountId: 42,
            environment: null,
            action: 'established',
            outcome: 'success',
            actor: { type: 'user', id: '7' }
        });
        expect(JSON.stringify(recordMock.mock.calls)).not.toContain('secret');
    });
});
