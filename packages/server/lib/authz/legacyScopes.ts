import type { Scope } from '@nangohq/authz';
import type { Action, Permission, Scope as RbacTier, Resource } from '@nangohq/types';

export type Plane = 'account' | 'environment';

/**
 * Scope -> the legacy permission it replaces, and the plane it is evaluated on. The deny map has no
 * opinion on anything absent here.
 *
 * The plane is explicit because it cannot be derived: `account:environments:create` is account-plane
 * while `account:environments:delete` is environment-plane, and both use the same legacy resource.
 *
 * Deleted together with ROLE_DENY_MAP once the private API authorizes through `authorize()`.
 */
export const LEGACY_SCOPES: Partial<Record<Scope, [Resource, Action, Plane]>> = {
    // account plane
    'account:team:update': ['team', 'update', 'account'],
    'account:team:users:update': ['team_member', 'update', 'account'],
    'account:team:users:delete': ['team_member', 'delete', 'account'],
    'account:invites:create': ['invite', 'create', 'account'],
    'account:invites:delete': ['invite', 'delete', 'account'],
    'account:connect_ui:update': ['connect_ui_settings', 'update', 'account'],
    'account:billing:payment_methods:list': ['billing', '*', 'account'],
    'account:billing:payment_methods:create': ['billing', '*', 'account'],
    'account:billing:payment_methods:delete': ['billing', '*', 'account'],
    'account:plan:update': ['plan', 'update', 'account'],
    'account:audit_trail:read': ['audit_trail', 'read', 'account'],
    'account:api_keys:create': ['account_key', '*', 'account'],
    'account:api_keys:list': ['account_key', '*', 'account'],
    'account:api_keys:delete': ['account_key', '*', 'account'],
    'account:environments:create': ['environment', 'create', 'account'],
    'account:environments:set_production': ['environment_production_flag', 'update', 'account'],
    // environment plane. `:list` and `:read` both map to the legacy `read` — the private grammar has
    // no list action, so one permission guards the collection and the item alike.
    'environment:integrations:list': ['integration', 'read', 'environment'],
    'environment:integrations:read': ['integration', 'read', 'environment'],
    'environment:integrations:update': ['integration', 'update', 'environment'],
    'environment:integrations:delete': ['integration', 'delete', 'environment'],
    'environment:connections:list': ['connection', 'read', 'environment'],
    'environment:connections:read': ['connection', 'read', 'environment'],
    'environment:connections:update': ['connection', 'update', 'environment'],
    'environment:connections:delete': ['connection', 'delete', 'environment'],
    'environment:connections:read_credentials': ['connection_credential', 'read', 'environment'],
    'environment:functions:list': ['flow', 'read', 'environment'],
    'environment:functions:read': ['flow', 'read', 'environment'],
    'environment:functions:delete': ['flow', 'delete', 'environment'],
    // `canWriteProdFlows` guards deploy/upgrade and enable/disable/frequency alike.
    'environment:deploy': ['flow', 'update', 'environment'],
    'environment:syncs:update': ['flow', 'update', 'environment'],
    'environment:logs:read': ['log', 'read', 'environment'],
    'environment:syncs:execute': ['sync_command', 'update', 'environment'],
    'environment:settings:read': ['environment', 'read', 'environment'],
    'environment:settings:update': ['environment', 'update', 'environment'],
    'account:environments:delete': ['environment', 'delete', 'environment'],
    'account:environments:api_keys:list': ['environment_key', 'read', 'environment'],
    'account:environments:api_keys:update': ['environment_key', 'update', 'environment'],
    'environment:settings:read_secret': ['secret_key', 'read', 'environment'],
    'environment:variables:update': ['environment_variable', 'update', 'environment'],
    'environment:webhooks:update': ['webhook', 'update', 'environment']
};

const planeForTier = (tier: RbacTier): Plane => (tier === 'global' ? 'account' : 'environment');

/** Keyed with `|` so it cannot be misread as a scope: `webhook|update|environment` is not `environment:webhooks:update`. */
const permissionKey = (resource: Resource, action: Action, plane: Plane): string => `${resource}|${action}|${plane}`;

const byPermission = new Map<string, Scope[]>();
for (const [scope, [resource, action, plane]] of Object.entries(LEGACY_SCOPES) as [Scope, [Resource, Action, Plane]][]) {
    const key = permissionKey(resource, action, plane);
    byPermission.set(key, [...(byPermission.get(key) ?? []), scope]);
}

/**
 * The scopes that replace `permission`, or an empty list where the new model has no equivalent.
 * More than one scope can map to a single permission: the legacy grammar has no `list` action, so
 * `{integration, read}` guards both the collection and the item.
 */
export function scopesForPermission(permission: Permission): Scope[] {
    return byPermission.get(permissionKey(permission.resource, permission.action, planeForTier(permission.scope))) ?? [];
}

export function planeForPermission(permission: Permission): Plane {
    return planeForTier(permission.scope);
}
