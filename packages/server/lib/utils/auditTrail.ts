import { getFlags } from '@nangohq/feature-flags';
import { flagHasPlan, flags } from '@nangohq/utils';

import type { DBPlan } from '@nangohq/types';

type AuditTrailEntitlement = 'has_audit_trail_control_plane' | 'has_audit_trail_access';

async function isEntitled(
    accountUuid: string,
    plan: Partial<Pick<DBPlan, AuditTrailEntitlement>> | null | undefined,
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
    return plan?.[entitlement] === true;
}

/** Whether the account's activity is recorded at all. */
export async function canRecordAuditTrail(accountUuid: string, plan: Pick<DBPlan, 'has_audit_trail_control_plane'> | null | undefined): Promise<boolean> {
    return await isEntitled(accountUuid, plan, 'has_audit_trail_control_plane');
}

/** Whether the account can reach its own trail, through the dashboard, the API or export. */
export async function canAccessAuditTrail(accountUuid: string, plan: Pick<DBPlan, 'has_audit_trail_access'> | null | undefined): Promise<boolean> {
    return await isEntitled(accountUuid, plan, 'has_audit_trail_access');
}
