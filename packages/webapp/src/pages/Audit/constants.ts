// Relative, not `@/`: the root vitest config has no alias, and this module is reachable from a unit test.
import { formatKeyToLabel } from '../../utils/utils';

import type { FilterOption } from '@/components/patterns/FilterMultiSelect';
import type { ApiAuditTrailEvent, AuditAction, AuditActionOf, AuditEventKey, AuditResource } from '@nangohq/types';

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

const allResources = Object.keys(actionsByResource) as AuditResource[];

const byLabel = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label);

export const resourceOptions: FilterOption<ResourceFilter>[] = [
    { value: ALL, label: 'All' },
    ...allResources.map((resource) => ({ value: resource, label: resourceLabels[resource] })).sort(byLabel)
];

export const resourceValues: ResourceFilter[] = [ALL, ...allResources];
export const actionValues: ActionFilter[] = [ALL, ...new Set(allResources.flatMap((resource) => actionsByResource[resource] as readonly AuditAction[]))];

export function actionOptionsForResources(resources: AuditResource[]): FilterOption<ActionFilter>[] {
    const scope = resources.length ? resources : allResources;
    const actions = new Set(scope.flatMap((resource) => actionsByResource[resource] as readonly AuditAction[]));
    const options = [...actions].map((action) => ({ value: action, label: formatKeyToLabel(action) })).sort(byLabel);
    return [{ value: ALL, label: 'All' }, ...options];
}

function selectionLabel<T>(values: T[], toLabel: (value: T) => string): string {
    return values.length ? values.map(toLabel).join(', ') : 'All';
}

export function resourceSelectionLabel(resources: AuditResource[]): string {
    return selectionLabel(resources, (resource) => resourceLabels[resource]);
}

export function actionSelectionLabel(actions: AuditAction[]): string {
    return selectionLabel(actions, formatKeyToLabel);
}

/** The API rejects `actions` without `resources`, so an action-only filter names the resources that declare it. */
export function resourcesOwningActions(actions: AuditAction[]): AuditResource[] {
    return allResources.filter((resource) => (actionsByResource[resource] as readonly AuditAction[]).some((action) => actions.includes(action)));
}

export function actorLabel(actor: ApiAuditTrailEvent['actor']): string {
    return actor.display ?? `${actor.type} ${actor.id}`;
}

export function viaLabel(via: ApiAuditTrailEvent['via']): string | undefined {
    return via?.map((entry) => `${entry.display ?? entry.id} (${entry.type}${entry.actorId ? `, actor ${entry.actorId}` : ''})`).join(', ');
}

// Display names, not the raw `resource.action` key — that stays available in the drawer's JSON and the CSV.
export function eventLabel(event: Pick<ApiAuditTrailEvent, 'resource' | 'action'>): string {
    // Falls back to the raw key: a newer backend can send a resource this build has no label for.
    return `${resourceLabels[event.resource] ?? event.resource} · ${formatKeyToLabel(event.action)}`;
}

/** First target plus a count, so a deploy touching a dozen functions still occupies one row. */
export function targetsSummary(targets: ApiAuditTrailEvent['targets']): { first: string; rest: number } | null {
    const [first, ...rest] = targets.map((target) => target.display ?? target.id);
    return first ? { first, rest: rest.length } : null;
}

export function environmentLabel(event: Pick<ApiAuditTrailEvent, 'environment' | 'scope'>): string {
    if (event.environment) {
        return event.environment.display;
    }
    // An environment-scoped event can store a null environment, and `scope` is absent before NAN-6802.
    return event.scope === 'environment' ? '—' : 'Account-level';
}
