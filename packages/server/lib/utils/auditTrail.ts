import { getFlags } from '@nangohq/feature-flags';
import { flagHasPlan, flags } from '@nangohq/utils';

import type { DBPlan } from '@nangohq/types';

type AuditTrailEntitlement = 'has_audit_trail_control_plane' | 'has_audit_trail_ui';

async function isEntitled(
    accountUuid: string,
    plan: Partial<Pick<DBPlan, AuditTrailEntitlement>> | null | undefined,
    entitlement: AuditTrailEntitlement
): Promise<boolean> {
    // Without the plans layer there is no entitlement to read and nothing for the rollout to target,
    // so an explicit deployment opt-in is the only way in — that is how local development enables the
    // trail, and why self-hosted stays off. Deliberately the opposite of `hasRbac`, which treats a
    // plan-less deployment as unrestricted. Scoping it here also means the env var cannot weaken the
    // rollout flag or the entitlement anywhere they apply.
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

/** Whether the account can reach its own trail, through the dashboard or export. */
export async function canViewAuditTrail(accountUuid: string, plan: Pick<DBPlan, 'has_audit_trail_ui'> | null | undefined): Promise<boolean> {
    return await isEntitled(accountUuid, plan, 'has_audit_trail_ui');
}
