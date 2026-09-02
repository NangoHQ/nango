import db from '@nangohq/database';
import { accountService, getPlanSafe, userService } from '@nangohq/shared';

import { auditEventDropped, makeAuditTarget as makeTarget, recordAuditEvent } from '../../audit.js';
import { canRecordAuditTrail } from '../../utils/auditTrail.js';
import { Audit, auditable, auditRequestFields, logger, outcomeFromStatus } from './auditable.js';

import type { AuditEvent, MfaVerifiedMetadata } from '@nangohq/audit';
import type { DeleteMFA, PostMFAActivation, PostMFAEnrollment, PostMFALoginVerification, PostMFARecoveryCodes } from '@nangohq/types';
import type { Request, RequestHandler, Response } from 'express';

// MFA factors are per-user and account-scoped; the acting user is always the target. No metadata is
// recorded — the request bodies carry only TOTP/recovery codes, which must never be persisted.
export const auditMfaEnrolled = auditable<PostMFAEnrollment>({
    policy: Audit.auditable({ resource: 'mfa', action: 'enrolled', scope: 'account' }),
    target: (_req, locals) => makeTarget('user', locals.user?.id, locals.user?.email)
});

export const auditMfaEnabled = auditable<PostMFAActivation>({
    policy: Audit.auditable({ resource: 'mfa', action: 'enabled', scope: 'account' }),
    target: (_req, locals) => makeTarget('user', locals.user?.id, locals.user?.email)
});

export const auditMfaDisabled = auditable<DeleteMFA>({
    policy: Audit.auditable({ resource: 'mfa', action: 'disabled', scope: 'account' }),
    target: (_req, locals) => makeTarget('user', locals.user?.id, locals.user?.email)
});

export const auditMfaRecoveryRegenerated = auditable<PostMFARecoveryCodes>({
    policy: Audit.auditable({ resource: 'mfa', action: 'recovery_regenerated', scope: 'account' }),
    target: (_req, locals) => makeTarget('user', locals.user?.id, locals.user?.email)
});

// The login-verify route runs BEFORE authentication (the user is mid-login), so res.locals carries no
// user or account and the standard locals-based auditable() can't attribute the event — and emit()
// early-returns without an account. Resolve the acting user from the pending-login session (it still
// exists at middleware entry; the controller deletes it once verification succeeds), load their
// account directly, and emit an `mfa`/`verified` event on finish for both success and failure.
export const auditMfaVerified: RequestHandler = (req, res, next) => {
    // Capture the pending user synchronously — the controller clears the pending session on success.
    const userId = req.session.pendingMfaLogin?.userId;
    res.on('finish', () => {
        void emitMfaVerified(req, res, userId);
    });
    next();
};

const METHOD_BY_TYPE = { code: 'totp', recoveryCode: 'recovery_code' } as const;

// Anchor the event's resource/action to the endpoint's declared Audit policy so this dedicated middleware
// can't drift from it — the typed auditable() specs get the same guarantee for free via AuditSpec.policy.
const mfaVerifiedPolicy: PostMFALoginVerification['Audit'] = { kind: 'audit', resource: 'mfa', action: 'verified', scope: 'account' };

async function emitMfaVerified(req: Request, res: Response, pendingUserId: number | undefined): Promise<void> {
    const occurredAt = new Date().toISOString();
    try {
        // Attribute to the pending-login user captured at middleware entry — equal to req.user on success,
        // and the only attribution available on failure. No pending challenge means there is nothing to audit.
        if (pendingUserId == null) {
            return;
        }
        const user = await userService.getUserById(pendingUserId, true);
        if (!user) {
            return;
        }
        const account = await accountService.getAccountById(db.knex, user.account_id);
        if (!account) {
            return;
        }
        // Runs before authentication, so there is no res.locals.plan to read the entitlement from.
        if (!(await canRecordAuditTrail(account.uuid, await getPlanSafe(db.knex, { accountId: account.id })))) {
            return;
        }
        const bodyType = (req.body as Partial<PostMFALoginVerification['Body']>)?.type;
        const method: MfaVerifiedMetadata['method'] | undefined =
            typeof bodyType === 'string' && Object.hasOwn(METHOD_BY_TYPE, bodyType) ? METHOD_BY_TYPE[bodyType] : undefined;
        const event: AuditEvent = {
            occurredAt,
            accountId: account.id,
            scope: mfaVerifiedPolicy.scope,
            environment: null,
            actor: { type: 'user', id: String(user.id), display: user.email },
            resource: mfaVerifiedPolicy.resource,
            action: mfaVerifiedPolicy.action,
            targets: [{ type: 'user', id: String(user.id), display: user.email }],
            ...auditRequestFields(req, account.id),
            outcome: outcomeFromStatus(res.statusCode),
            ...(method ? { metadata: { method } } : {})
        };
        await recordAuditEvent(event);
    } catch (err) {
        logger.error(`failed to emit mfa verify audit event`, err);
        auditEventDropped('mfa', 'build_failed');
    }
}
