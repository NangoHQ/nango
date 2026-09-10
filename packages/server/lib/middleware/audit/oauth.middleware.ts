import { makeAuditTarget, recordAuditEvent } from '../../audit.js';
import { canRecordAuditTrail } from '../../utils/auditTrail.js';
import { Audit, auditable, auditRequestFields, resolveActor } from './auditable.js';

import type { RequestLocals } from '../../utils/express.js';
import type { GetOAuthHandoffCallback, PostOAuthApprove, PostOAuthDeny } from '@nangohq/types';
import type { RequestHandler } from 'express';

export const auditOAuthApproved = auditable<PostOAuthApprove>({
    policy: Audit.auditable({ resource: 'oauth_grant', action: 'approved', scope: 'account' }),
    targetFromResponse: (response) => makeAuditTarget('oauth_grant', response.data.grantId)
});
export const auditOAuthDenied = auditable<PostOAuthDeny>({
    policy: Audit.auditable({ resource: 'oauth_grant', action: 'denied', scope: 'account' })
});

const handoffPolicy: GetOAuthHandoffCallback['Audit'] = Audit.auditable({ resource: 'oauth_session', action: 'established', scope: 'account' });
export const auditOAuthSession: RequestHandler<any, any, any, any, RequestLocals> = (req, res, next) => {
    res.on('finish', () => {
        // This callback establishes its principal inside the transaction and responds with a 303.
        if (res.statusCode !== 303 || !res.locals.account) return;
        void (async () => {
            if (!(await canRecordAuditTrail(res.locals.plan))) return;
            await recordAuditEvent({
                ...handoffPolicy,
                occurredAt: new Date().toISOString(),
                accountId: res.locals.account.id,
                environment: null,
                actor: resolveActor(res.locals),
                targets: [],
                outcome: 'success',
                ...auditRequestFields(req, res.locals.account.id)
            });
        })().catch(() => {
            /* Audit sink failure must not alter authentication. */
        });
    });
    next();
};
