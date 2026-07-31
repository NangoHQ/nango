import { getFlags } from '@nangohq/feature-flags';
import { flagHasPlan, flags } from '@nangohq/utils';

import type { DBPlan } from '@nangohq/types';

type AuditTrailEntitlement = 'has_audit_trail_control_plane' | 'has_audit_trail_ui';

async function isEntitled(
    accountUuid: string,
    plan: Partial<Pick<DBPlan, AuditTrailEntitlement>> | null | undefined,
    entitlement: AuditTrailEntitlement
): Promise<boolean> {
    // Opt-in for deployments with no flag provider to roll out from, local above all. Bypasses the
    // rollout flag and the plan, so it is never set in cloud, where the flag is the kill switch.
    if (flags.hasAuditTrail) {
        return true;
    }
    if (!(await getFlags().isAuditTrailEnabled(accountUuid))) {
        return false;
    }
    // No plans to read an entitlement from, as on self-host. Same convention as `hasRbac`.
    if (!flagHasPlan) {
        return true;
    }
    return plan?.[entitlement] === true;
}

/** Whether the account's activity is recorded at all. */
export async function canRecordAuditTrail(accountUuid: string, plan: Pick<DBPlan, 'has_audit_trail_control_plane'> | null | undefined): Promise<boolean> {
    return await isEntitled(accountUuid, plan, 'has_audit_trail_control_plane');
}

/** Whether the account can reach its own trail, through the dashboard or export. */
export async function canViewAuditTrail(accountUuid: string, plan: Pick<DBPlan, 'has_audit_trail_ui'> | null | undefined): Promise<boolean> {
    return await isEntitled(accountUuid, plan, 'has_audit_trail_ui');
}
