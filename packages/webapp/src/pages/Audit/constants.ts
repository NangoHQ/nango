import { formatKeyToLabel } from '@/utils/utils';

import type { FilterOption } from '@/components/patterns/FilterMultiSelect';
import type { ApiAuditTrailEvent, AuditAction, AuditActionOf, AuditEventKey, AuditResource, AuditScope } from '@nangohq/types';

/**
 * Runtime twin of the audit event vocabulary, which `@nangohq/types` carries as types only. Kept in
 * step by the checks below, as `PUBLIC_ENVIRONMENT_SCOPES` does in `@nangohq/authz`.
 */
const actionsByResource = {
    connection: ['created', 'updated', 'metadata_updated', 'refreshed', 'deleted'],
    sync: ['enabled', 'disabled', 'paused', 'started', 'triggered', 'cancelled', 'frequency_changed', 'variant_created', 'variant_deleted'],
    function: ['deployed', 'upgraded', 'deleted'],
    integration: ['created', 'updated', 'deleted'],
    api_key: ['created', 'updated', 'deleted'],
    member: ['invited', 'invite_accepted', 'invite_declined', 'invite_revoked', 'role_changed', 'removed'],
    team: ['updated'],
    user: ['updated'],
    environment: ['created', 'updated', 'variables_changed', 'webhook_urls_changed', 'webhook_signing_key_rotated', 'deleted'],
    app_auth: ['login', 'logout', 'signup', 'password_changed', 'password_reset'],
    mfa: ['enrolled', 'enabled', 'disabled', 'verified', 'recovery_regenerated'],
    billing: [
        'plan_changed',
        'trial_extended',
        'details_changed',
        'payment_method_added',
        'payment_method_removed',
        'spend_alert_changed',
        'spend_alert_removed'
    ],
    audit_trail: ['exported', 'queried']
} as const satisfies { [R in AuditResource]: readonly AuditActionOf<R>[] };

type ListedEvent = { [R in AuditResource]: `${R}.${(typeof actionsByResource)[R][number]}` }[AuditResource];
true satisfies [Exclude<AuditEventKey, ListedEvent>] extends [never] ? true : never;

const resourceLabels: Record<AuditResource, string> = {
    connection: 'Connection',
    sync: 'Sync',
    function: 'Function',
    integration: 'Integration',
    api_key: 'API key',
    member: 'Member',
    team: 'Team',
    user: 'User',
    environment: 'Environment',
    app_auth: 'Authentication',
    mfa: 'MFA',
    billing: 'Billing',
    audit_trail: 'Audit trail'
};

export const ALL = 'all';

export type ResourceFilter = AuditResource | typeof ALL;
export type ActionFilter = AuditAction | typeof ALL;

export const resourceOptions: FilterOption<ResourceFilter>[] = [
    { value: ALL, label: 'All' },
    ...(Object.keys(actionsByResource) as AuditResource[]).map((resource) => ({ value: resource, label: resourceLabels[resource] }))
];

export function actionOptionsFor(resource: AuditResource): FilterOption<ActionFilter>[] {
    return [{ value: ALL, label: 'All' }, ...actionsByResource[resource].map((action) => ({ value: action, label: formatKeyToLabel(action) }))];
}

export function actorLabel(actor: ApiAuditTrailEvent['actor']): string {
    return actor.display ?? `${actor.type} ${actor.id}`;
}

export function viaLabel(via: ApiAuditTrailEvent['via']): string | undefined {
    return via?.map((entry) => `${entry.display ?? entry.id} (${entry.type}${entry.actorId ? `, actor ${entry.actorId}` : ''})`).join(', ');
}

export function resourceLabel(resource: ApiAuditTrailEvent['resource']): string {
    return resourceLabels[resource] ?? resource;
}

export function actionLabel(event: Pick<ApiAuditTrailEvent, 'action'>): string {
    return event.action.replace(/_/g, ' ');
}

export function targetsLabel(targets: ApiAuditTrailEvent['targets']): string {
    return targets.map((target) => target.display ?? target.id).join(', ') || '—';
}

export function targetTypesLabel(targets: ApiAuditTrailEvent['targets']): string {
    return [...new Set(targets.map((target) => target.type))].join(', ');
}

const scopeLabels: Record<AuditScope, string> = {
    account: 'Account',
    environment: 'Environment'
};

export function scopeLabel(scope: ApiAuditTrailEvent['scope']): string {
    return scopeLabels[scope];
}

// The scope column says why this is empty, so the cell no longer stands in for it.
export function environmentLabel(environment: ApiAuditTrailEvent['environment']): string {
    return environment?.display ?? '—';
}
