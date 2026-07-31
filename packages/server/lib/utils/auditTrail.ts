import { getFlags } from '@nangohq/feature-flags';
import { flagHasPlan, flags } from '@nangohq/utils';

import type { DBPlan } from '@nangohq/types';

type AuditTrailEntitlement = 'has_audit_trail_control_plane' | 'has_audit_trail_ui';

async function isEntitled(
    accountUuid: string,
    plan: Partial<Pick<DBPlan, AuditTrailEntitlement>> | null | undefined,
    entitlement: AuditTrailEntitlement
): Promise<boolean> {
    // The deployment switch is passed as the flag's default, so it is what a deployment without Unleash
    // (self-hosted, local) resolves to, and what an Unleash outage falls back to.
    if (!(await getFlags().isAuditTrailEnabled(accountUuid, flags.hasAuditTrail))) {
        return false;
    }
    // Deployments without plans have nothing to read an entitlement from.
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
