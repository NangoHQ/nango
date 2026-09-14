import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { auditMemberInviteAccepted, auditMemberInvited, auditMemberInviteDeclined, auditMemberInviteRevoked } from './member.middleware.js';
import {
    fakeReq,
    fakeRes,
    getAccountByIdMock,
    getInvitationMock,
    getPlanSafeMock,
    installAuditMockDefaults,
    locals,
    recordMock,
    resetAuditMocks,
    runAudit
} from './testing.js';

vi.mock('../../audit.js', async (importOriginal) => (await import('./testing.js')).auditModuleMock(importOriginal as never));
vi.mock('@nangohq/shared', async (importOriginal) => (await import('./testing.js')).sharedModuleMock(importOriginal as never));

describe('member audit middleware (unit)', () => {
    beforeEach(() => {
        installAuditMockDefaults();
        // invite accept/decline resolve the audited account from the invitation (see AuditSpec.account).
        getInvitationMock.mockReset().mockResolvedValue({ account_id: 100, email: 'dev@example.com', role: 'administrator' });
        getAccountByIdMock.mockReset().mockResolvedValue({ id: 100, uuid: 'inviting-acc-uuid', name: 'Inviting Team' });
    });

    afterEach(() => {
        resetAuditMocks();
    });

    it('member invited: one target per email, account-scoped (environment null)', async () => {
        const req = fakeReq({ body: { emails: ['alice@example.com', 'bob@example.com'], role: 'administrator' } });
        const event = await runAudit(auditMemberInvited, req, fakeRes(locals));
        expect(event).toMatchObject({
            resource: 'member',
            action: 'invited',
            outcome: 'success',
            accountId: 42,
            scope: 'account',
            environment: null,
            actor: { type: 'user', id: '7', display: 'dev@example.com' },
            targets: [
                { type: 'member', id: 'alice@example.com', display: 'alice@example.com' },
                { type: 'member', id: 'bob@example.com', display: 'bob@example.com' }
            ],
            metadata: { role: 'administrator' }
        });
    });

    it('member invited: a non-string role is omitted rather than recorded', async () => {
        const req = fakeReq({ body: { emails: ['alice@example.com'], role: { admin: true } } });
        const event = await runAudit(auditMemberInvited, req, fakeRes(locals));
        expect(event).toMatchObject({ resource: 'member', action: 'invited', accountId: 42, scope: 'account', environment: null });
        expect(event?.metadata).toBeUndefined();
    });

    it('invite revoked: the revoked email is the target, account-scoped', async () => {
        const req = fakeReq({ body: { email: 'revoke-me@example.com' } });
        const event = await runAudit(auditMemberInviteRevoked, req, fakeRes(locals));
        expect(event).toMatchObject({
            resource: 'member',
            action: 'invite_revoked',
            outcome: 'success',
            accountId: 42,
            scope: 'account',
            environment: null,
            targets: [{ type: 'member', id: 'revoke-me@example.com', display: 'revoke-me@example.com' }]
        });
    });

    it('invite accepted: recorded under the inviting team, actor and target are the accepting member', async () => {
        const req = fakeReq({ params: { id: 'invite-token' } });
        const event = await runAudit(auditMemberInviteAccepted, req, fakeRes(locals));
        expect(getInvitationMock).toHaveBeenCalledWith('invite-token');
        expect(event).toMatchObject({
            resource: 'member',
            action: 'invite_accepted',
            outcome: 'success',
            // The inviting team (from the invitation), not the accepter's own account (42).
            accountId: 100,
            scope: 'account',
            environment: null,
            actor: { type: 'user', id: '7', display: 'dev@example.com' },
            targets: [{ type: 'member', id: '7', display: 'dev@example.com' }]
        });
    });

    it('invite accepted: the entitlement is resolved for the inviting team, not the caller account', async () => {
        // The caller is account 42; the invitation attributes the event to team 100. The gate has to read
        // team 100's entitlement, so the plan lookup must be for that account and not the caller's.
        const req = fakeReq({ params: { id: 'invite-token' } });
        const event = await runAudit(auditMemberInviteAccepted, req, fakeRes(locals));
        expect(event).toMatchObject({ resource: 'member', action: 'invite_accepted', accountId: 100 });
        expect(getPlanSafeMock).toHaveBeenCalledWith(expect.anything(), { accountId: 100 });
    });

    it('invite declined: recorded under the inviting team, actor and target are the declining member', async () => {
        const req = fakeReq({ params: { id: 'invite-token' } });
        const event = await runAudit(auditMemberInviteDeclined, req, fakeRes(locals));
        expect(event).toMatchObject({
            resource: 'member',
            action: 'invite_declined',
            outcome: 'success',
            accountId: 100,
            scope: 'account',
            environment: null,
            actor: { type: 'user', id: '7', display: 'dev@example.com' },
            targets: [{ type: 'member', id: '7', display: 'dev@example.com' }]
        });
    });

    it('invite accept for an unknown invitation records nothing (no account to attribute to)', async () => {
        getInvitationMock.mockResolvedValue(null);
        const req = fakeReq({ params: { id: 'missing-token' } });
        const res = fakeRes(locals);
        await new Promise<void>((resolve) => auditMemberInviteAccepted(req, res, () => resolve()));
        res.emit('finish');
        await new Promise((resolve) => setImmediate(resolve));
        expect(recordMock).not.toHaveBeenCalled();
    });

    it('failed invite acceptance (4xx): target still resolved from the session, outcome failure', async () => {
        const req = fakeReq({ params: { id: 'invite-token' } });
        const event = await runAudit(auditMemberInviteAccepted, req, fakeRes(locals, 400));
        expect(event).toMatchObject({
            resource: 'member',
            action: 'invite_accepted',
            outcome: 'failure',
            accountId: 100,
            scope: 'account',
            environment: null,
            targets: [{ type: 'member', id: '7', display: 'dev@example.com' }]
        });
    });
});
