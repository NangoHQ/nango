import type { Scope } from '@nangohq/authz';
import type { Action, Permission, Scope as RbacTier, Resource } from '@nangohq/types';

export type Plane = 'account' | 'environment';

/**
 * The permission each scope replaces.
 *
 * The dashboard receives `AllowedPermissions`, keyed by the RBAC vocabulary, so `buildPermissions` has
 * to answer each permission from the grants that replaced it. Authorization itself does not read this.
 * It goes away when the webapp asks about scopes instead.
 */
export const PERMISSION_BY_SCOPE: Partial<Record<Scope, [Resource, Action]>> = {
    // account plane
    'account:team:update': ['team', 'update'],
    'account:team:users:update': ['team_member', 'update'],
    'account:team:users:delete': ['team_member', 'delete'],
    'account:invites:create': ['invite', 'create'],
    'account:invites:delete': ['invite', 'delete'],
    'account:connect_ui:update': ['connect_ui_settings', 'update'],
    'account:billing:payment_methods:list': ['billing', '*'],
    'account:billing:payment_methods:create': ['billing', '*'],
    'account:billing:payment_methods:delete': ['billing', '*'],
    'account:plan:update': ['plan', 'update'],
    'account:audit_trail:read': ['audit_trail', 'read'],
    'account:api_keys:create': ['account_key', '*'],
    'account:api_keys:list': ['account_key', '*'],
    'account:api_keys:delete': ['account_key', '*'],
    'account:environments:create': ['environment', 'create'],
    'account:environments:set_production': ['environment_production_flag', 'update'],
    // environment plane. `:list` and `:read` both map to the legacy `read` — the private grammar has
    // no list action, so one permission guards the collection and the item alike.
    'environment:integrations:list': ['integration', 'read'],
    'environment:integrations:read': ['integration', 'read'],
    'environment:integrations:update': ['integration', 'update'],
    'environment:integrations:delete': ['integration', 'delete'],
    'environment:connections:list': ['connection', 'read'],
    'environment:connections:read': ['connection', 'read'],
    'environment:connections:update': ['connection', 'update'],
    'environment:connections:delete': ['connection', 'delete'],
    'environment:connections:read_credentials': ['connection_credential', 'read'],
    'environment:functions:list': ['flow', 'read'],
    'environment:functions:read': ['flow', 'read'],
    'environment:functions:delete': ['flow', 'delete'],
    // `canWriteProdFlows` guards deploy/upgrade and enable/disable/frequency alike.
    'environment:deploy': ['flow', 'update'],
    'environment:syncs:update': ['flow', 'update'],
    'environment:logs:read': ['log', 'read'],
    'environment:syncs:execute': ['sync_command', 'update'],
    'environment:settings:read': ['environment', 'read'],
    'environment:settings:update': ['environment', 'update'],
    'environment:delete': ['environment', 'delete'],
    'environment:api_keys:list': ['environment_key', 'read'],
    'environment:api_keys:update': ['environment_key', 'update'],
    'environment:settings:read_secret': ['secret_key', 'read'],
    'environment:variables:update': ['environment_variable', 'update'],
    'environment:webhooks:update': ['webhook', 'update']
};

const planeForTier = (tier: RbacTier): Plane => (tier === 'global' ? 'account' : 'environment');

/** Keyed with `|` so it cannot be misread as a scope: `webhook|update|environment` is not `environment:webhooks:update`. */
const permissionKey = (resource: Resource, action: Action): string => `${resource}|${action}`;

const byPermission = new Map<string, Scope[]>();
for (const [scope, [resource, action]] of Object.entries(PERMISSION_BY_SCOPE) as [Scope, [Resource, Action]][]) {
    const key = permissionKey(resource, action);
    byPermission.set(key, [...(byPermission.get(key) ?? []), scope]);
}

/**
 * The scopes that replace `permission`, or an empty list where the new model has no equivalent.
 * More than one scope can map to a single permission: the legacy grammar has no `list` action, so
 * `{integration, read}` guards both the collection and the item.
 */
export function scopesForPermission(permission: Permission): Scope[] {
    return byPermission.get(permissionKey(permission.resource, permission.action)) ?? [];
}

export function planeForPermission(permission: Permission): Plane {
    return planeForTier(permission.scope);
}
