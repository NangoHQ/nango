import db from '@nangohq/database';
import { accountService, getInvitation, userService } from '@nangohq/shared';

import { makeAuditTarget as makeTarget, toAuditId as toId } from '../../audit.js';
import { Audit, auditable, resolveDisplay } from './auditable.js';
import { omitUndefined } from './input.js';
import { memberTarget } from './lookups.js';

import type { AuditTarget } from '@nangohq/audit';
import type { AcceptInvite, DeclineInvite, DeleteInvite, DeleteTeamUser, PatchTeamUser, PostInvite } from '@nangohq/types';
import type { Request } from 'express';

export const auditMemberInvited = auditable<PostInvite>({
    policy: Audit.auditable({ resource: 'member', action: 'invited', scope: 'account' }),
    // An invitee may not have an account at all, so the email is the only identity available.
    target: (req) =>
        Array.isArray(req.body.emails)
            ? req.body.emails.map((email) => makeTarget('member', email, email)).filter((t): t is AuditTarget => Boolean(t))
            : undefined,
    metadata: (req) => (req.body.role ? { role: req.body.role } : undefined)
});

// Accept/decline run under webAuth, so the acting user IS the invited member — the actor is resolved
// from the session and the target email comes from locals, keeping the member identity (email)
// consistent with the invited/revoked events. The invite token (req.params.id) is not a member identity.
export const auditMemberInviteAccepted = auditable<AcceptInvite>({
    policy: Audit.auditable({ resource: 'member', action: 'invite_accepted', scope: 'account' }),
    account: invitingAccount,
    target: (_req, locals) => makeTarget('member', locals.user?.id, locals.user?.email)
});

export const auditMemberInviteDeclined = auditable<DeclineInvite>({
    policy: Audit.auditable({ resource: 'member', action: 'invite_declined', scope: 'account' }),
    account: invitingAccount,
    target: (_req, locals) => makeTarget('member', locals.user?.id, locals.user?.email)
});

export const auditMemberInviteRevoked = auditable<DeleteInvite>({
    policy: Audit.auditable({ resource: 'member', action: 'invite_revoked', scope: 'account' }),
    target: (req) => makeTarget('member', req.body.email, req.body.email)
});

export const auditMemberRoleChanged = auditable<PatchTeamUser>({
    policy: Audit.auditable({ resource: 'member', action: 'role_changed', scope: 'account' }),
    target: memberTarget,
    metadata: async (req, locals) => {
        const role = req.body.role;
        let fromRole: string | undefined;
        const id = toId(req.params.id);
        if (id && locals.account) {
            const accountId = locals.account.id;
            fromRole = await resolveDisplay('member', async () => {
                const user = await userService.getUserByIdAndAccountId(Number(id), accountId);
                return user?.role;
            });
        }
        return omitUndefined({
            toRole: typeof role === 'string' ? role : undefined,
            fromRole: fromRole ? fromRole : undefined
        });
    }
});

export const auditMemberRemoved = auditable<DeleteTeamUser>({
    policy: Audit.auditable({ resource: 'member', action: 'removed', scope: 'account' }),
    target: memberTarget
});

// Recorded under the inviting team (like invited/revoked), not the invitee's own account: locals.account
// is the accepter's pre-existing account, so resolve the target account from the invitation instead. The
// invite still exists here (resolved before the handler consumes it).
async function invitingAccount(req: Request<{ id: string }>): Promise<{ id: number; uuid: string } | undefined> {
    const invitation = await getInvitation(req.params.id);
    if (!invitation) {
        return undefined;
    }
    return (await accountService.getAccountById(db.knex, invitation.account_id)) ?? undefined;
}
