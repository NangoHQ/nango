import db from '@nangohq/database';
import { getFlags } from '@nangohq/feature-flags';
import { getPlanSafe } from '@nangohq/shared';
import { flagHasPlan, flags } from '@nangohq/utils';

import type { DBPlan } from '@nangohq/types';
import type { Request } from 'express';

type AuditTrailEntitlement = 'has_audit_trail_control_plane' | 'has_audit_trail_access';
type EntitlementPlan = Partial<Pick<DBPlan, AuditTrailEntitlement>> | null | undefined;

async function isEntitled(
    accountUuid: string,
    loadPlan: () => EntitlementPlan | Promise<EntitlementPlan>,
    entitlement: AuditTrailEntitlement
): Promise<boolean> {
    // No plans layer, so no entitlement to read — the deployment opt-in is the only way in (local dev
    // sets it, self-hosted does not). Opposite of `hasRbac`, which reads plan-less as unrestricted.
    if (!flagHasPlan) {
        return flags.hasAuditTrail;
    }
    if (!(await getFlags().isAuditTrailEnabled(accountUuid))) {
        return false;
    }
    const plan = await loadPlan();
    return plan?.[entitlement] === true;
}

/** Whether the account's activity is recorded at all. */
export async function canRecordAuditTrail(accountUuid: string, plan: Pick<DBPlan, 'has_audit_trail_control_plane'> | null | undefined): Promise<boolean> {
    return await isEntitled(accountUuid, () => plan, 'has_audit_trail_control_plane');
}

/** For emitters with no request behind them, so no `res.locals.plan` to read the entitlement from. */
export async function canRecordAuditTrailForAccount(account: { id: number; uuid: string }): Promise<boolean> {
    return await isEntitled(account.uuid, () => getPlanSafe(db.knex, { accountId: account.id }), 'has_audit_trail_control_plane');
}

/** Whether the account can reach its own trail, through the dashboard, the API or export. */
export async function canAccessAuditTrail(accountUuid: string, plan: Pick<DBPlan, 'has_audit_trail_access'> | null | undefined): Promise<boolean> {
    return await isEntitled(accountUuid, () => plan, 'has_audit_trail_access');
}

/**
 * A customer is held to the access entitlement; an impersonating operator to ingestion instead, since an
 * unrecorded account has no trail and an empty page would read as a broken one.
 */
export async function canViewAuditTrail(
    req: Pick<Request, 'session'>,
    accountUuid: string,
    plan: Pick<DBPlan, 'has_audit_trail_control_plane' | 'has_audit_trail_access'> | null | undefined
): Promise<boolean> {
    return req.session?.impersonatedBy ? await canRecordAuditTrail(accountUuid, plan) : await canAccessAuditTrail(accountUuid, plan);
}
