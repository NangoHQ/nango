import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { auditMfaEnabled, auditMfaVerified } from './mfa.middleware.js';
import { fakeReq, fakeRes, getAccountByIdMock, getUserByIdMock, installAuditMockDefaults, locals, resetAuditMocks, runAudit } from './testing.js';

vi.mock('../../audit.js', async (importOriginal) => (await import('./testing.js')).auditModuleMock(importOriginal as never));
vi.mock('@nangohq/shared', async (importOriginal) => (await import('./testing.js')).sharedModuleMock(importOriginal as never));

describe('mfa audit middleware (unit)', () => {
    beforeEach(() => {
        installAuditMockDefaults();
        getUserByIdMock.mockReset().mockResolvedValue({ id: 7, email: 'dev@example.com', account_id: 42 });
        getAccountByIdMock.mockReset().mockResolvedValue({ id: 42, uuid: 'acc-uuid' });
    });

    afterEach(() => {
        resetAuditMocks();
    });

    it('mfa activation: failure outcome on a rejected code, and the submitted code is never recorded', async () => {
        const req = fakeReq({ body: { code: '000000' } });
        const event = await runAudit(auditMfaEnabled, req, fakeRes(locals, 400));
        expect(event).toMatchObject({
            resource: 'mfa',
            action: 'enabled',
            outcome: 'failure',
            accountId: 42,
            scope: 'account',
            environment: null,
            actor: { type: 'user', id: '7', display: 'dev@example.com' },
            targets: [{ type: 'user', id: '7', display: 'dev@example.com' }]
        });
        expect(JSON.stringify(event)).not.toContain('000000');
    });

    it.each([
        ['code', 'totp'],
        ['recoveryCode', 'recovery_code']
    ])('mfa login verify: records the method for type %s', async (type, method) => {
        const req = fakeReq({ body: { type }, session: { pendingMfaLogin: { userId: 7 } } });
        const event = await runAudit(auditMfaVerified, req, fakeRes(locals));
        expect(event).toMatchObject({ resource: 'mfa', action: 'verified', accountId: 42, scope: 'account', environment: null, metadata: { method } });
    });

    it('mfa login verify: a non-string type is not coerced into a method', async () => {
        const req = fakeReq({ body: { type: ['code'] }, session: { pendingMfaLogin: { userId: 7 } } });
        const event = await runAudit(auditMfaVerified, req, fakeRes(locals));
        expect(event).toMatchObject({ resource: 'mfa', action: 'verified', accountId: 42 });
        expect(event?.metadata).toBeUndefined();
    });
});
