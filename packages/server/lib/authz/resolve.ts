import { accountTarget, authorizeAny, environmentTarget, permissions } from '@nangohq/authz';

import { planeForPermission, scopesForPermission } from './permissionScopes.js';
import { principalFor, principalForRole } from './principal.js';

import type { RequestLocals } from '../utils/express.js';
import type { Principal, Target } from '@nangohq/authz';
import type { AllowedPermissions, Permission, Role } from '@nangohq/types';

/**
 * The permission's tier decides the plane. The environment in locals supplies the id when there is one;
 * no role grant selects a specific environment, so a synthetic id is never compared against.
 */
function targetFor(locals: Partial<RequestLocals>, permission: Permission, accountId: number): Target {
    if (planeForPermission(permission) === 'account') {
        return accountTarget(accountId);
    }
    const environment = locals.environment;
    return environment
        ? environmentTarget(environment)
        : { type: 'environment', accountId, environment: { id: 0, is_production: permission.scope === 'production' } };
}

function allows(principal: Principal, locals: Partial<RequestLocals>, permission: Permission, accountId: number): boolean {
    const scopes = scopesForPermission(permission);
    if (scopes.length === 0) {
        // Unreachable while `permissionScopes.unit.test.ts` pins full coverage. Allowing keeps a gap from
        // locking people out of routes they could always reach.
        return true;
    }
    return authorizeAny(principal, scopes, targetFor(locals, permission, accountId));
}

/**
 * Whether the caller may do `permission`. Callers with no principal — no session and no key — are
 * allowed, as they always have been: there is no role to evaluate.
 */
export function resolve(locals: Partial<RequestLocals>, permission: Permission): boolean {
    // Roles belong to people. A request carrying an API key instead of a session has no role to
    // evaluate, and the private API has always let those through.
    if (!locals.user) {
        return true;
    }
    const principal = principalFor(locals);
    if (!principal) {
        return true;
    }
    return allows(principal, locals, permission, principal.accountId);
}

/** Non-production environments always allow reading secrets. */
export function canReadProdSecret(locals: Partial<RequestLocals>, environment: { is_production: boolean }): boolean {
    return !environment.is_production || resolve(locals, permissions.canReadProdSecretKey);
}

/**
 * What a role may do, for the dashboard to show or hide on. Derived from the same grants the server
 * authorizes with, so the two cannot drift.
 */
export function buildPermissions(role: Role, plan?: { has_rbac: boolean } | null): AllowedPermissions {
    // The question is what the role may do, not which account it belongs to.
    const accountId = 0;
    const principal = principalForRole(role, accountId, plan);
    const result: AllowedPermissions = {};

    for (const permission of Object.values(permissions)) {
        if (!allows(principal, {}, permission, accountId)) {
            continue;
        }
        const byTier = (result[permission.resource] ??= {});
        (byTier[permission.scope] ??= []).push(permission.action);
    }
    return result;
}
