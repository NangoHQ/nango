import { flagHasPlan, flags } from '@nangohq/utils';

import type { DBPlan } from '@nangohq/types';

type AuditTrailEntitlement = 'has_audit_trail_control_plane' | 'has_audit_trail_ui';

function isEntitled(plan: Partial<Pick<DBPlan, AuditTrailEntitlement>> | null | undefined, entitlement: AuditTrailEntitlement): boolean {
    if (!flags.hasAuditTrail) {
        return false;
    }
    // Deployments without plans have nothing to read an entitlement from, so the deployment flag is the only gate.
    if (!flagHasPlan) {
        return true;
    }
    return plan?.[entitlement] === true;
}

/** Whether the account's activity is recorded at all. */
export function canRecordAuditTrail(plan: Pick<DBPlan, 'has_audit_trail_control_plane'> | null | undefined): boolean {
    return isEntitled(plan, 'has_audit_trail_control_plane');
}

/** Whether the account can reach its own trail, through the dashboard or export. */
export function canViewAuditTrail(plan: Pick<DBPlan, 'has_audit_trail_ui'> | null | undefined): boolean {
    return isEntitled(plan, 'has_audit_trail_ui');
}
