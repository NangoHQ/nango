import { formatKeyToLabel } from '@/utils/utils';

import type { FilterOption } from '@/components/patterns/FilterMultiSelect';
import type { AuditAction, AuditResource } from '@nangohq/types';

/**
 * The actions each resource can be recorded with. Hand-maintained against the emit side's
 * `AuditResourceAction` union, which lives in a server package the dashboard can't import — so a new
 * audited event has to be added here too, or it stays unfilterable. `Record<AuditResource, …>` at least
 * makes a new *resource* a compile error. An empty list means nothing is emitted for that resource yet.
 */
const actionsByResource: Record<AuditResource, readonly AuditAction[]> = {
    connection: ['updated', 'metadata_updated', 'refreshed', 'deleted'],
    integration: ['updated', 'deleted'],
    function: ['deleted'],
    api_key: ['updated', 'deleted'],
    sync: ['enabled', 'disabled', 'frequency_changed', 'variant_created', 'variant_deleted'],
    member: ['role_changed', 'removed'],
    team: ['updated'],
    user: ['updated'],
    environment: ['updated', 'variables_changed', 'webhook_urls_changed', 'deleted'],
    billing: ['plan_changed', 'trial_extended', 'details_changed', 'payment_method_added', 'payment_method_removed'],
    app_auth: ['password_changed'],
    mfa: ['enrolled', 'enabled', 'disabled', 'verified', 'recovery_regenerated'],
    audit_log: []
};

const resourceLabels: Record<AuditResource, string> = {
    connection: 'Connection',
    integration: 'Integration',
    function: 'Function',
    api_key: 'API key',
    sync: 'Sync',
    member: 'Member',
    team: 'Team',
    user: 'User',
    environment: 'Environment',
    billing: 'Billing',
    app_auth: 'Authentication',
    mfa: 'MFA',
    audit_log: 'Audit log'
};

export const ALL = 'all';

export type ResourceFilter = AuditResource | typeof ALL;
export type ActionFilter = AuditAction | typeof ALL;

// Resources with nothing to record are left out rather than offered as a filter that matches nothing.
export const resourceOptions: FilterOption<ResourceFilter>[] = [
    { value: ALL, label: 'All' },
    ...(Object.keys(actionsByResource) as AuditResource[]).flatMap((resource) =>
        actionsByResource[resource].length > 0 ? [{ value: resource, label: resourceLabels[resource] }] : []
    )
];

export function actionOptionsFor(resource: AuditResource): FilterOption<ActionFilter>[] {
    return [{ value: ALL, label: 'All' }, ...actionsByResource[resource].map((action) => ({ value: action, label: formatKeyToLabel(action) }))];
}
