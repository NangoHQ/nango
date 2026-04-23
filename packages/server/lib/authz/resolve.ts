import { permissions } from '@nangohq/authz';
import { flagHasPlan, flags } from '@nangohq/utils';

import { evaluator } from './evaluator.js';

import type { AllowedPermissions, Permission, Role } from '@nangohq/types';

/**
 * Resolve a permission for the current request.
 * Returns true (allowed) when the feature flag is off, no session user exists (API key auth),
 * or the account's plan doesn't have RBAC enabled.
 */
export async function resolve(locals: { user?: { role: Role }; plan?: { has_rbac: boolean } | null }, permission: Permission): Promise<boolean> {
    if (!flags.hasAuthRoles) return true;
    if (flagHasPlan && (!locals.plan || !locals.plan.has_rbac)) return true;
    const user = locals.user;
    if (!user) return true;
    return evaluator.evaluate(user.role, permission);
}

/**
 * Check if the current user can read production secrets for the given environment.
 * Non-production environments always allow reading secrets.
 */
export async function canReadProdSecret(
    locals: { user?: { role: Role }; plan?: { has_rbac: boolean } | null },
    environment: { is_production: boolean }
): Promise<boolean> {
    return !environment.is_production || (await resolve(locals, permissions.canReadProdSecretKey));
}

export async function buildPermissions(role: Role, plan?: { has_rbac: boolean } | null): Promise<AllowedPermissions> {
    const result: AllowedPermissions = {};
    const bypass = !flags.hasAuthRoles || (flagHasPlan && (!plan || !plan.has_rbac));
    for (const perm of Object.values(permissions)) {
        const allowed = bypass || (await evaluator.evaluate(role, perm));
        if (!allowed) continue;

        if (!result[perm.resource]) {
            result[perm.resource] = {};
        }
        const byScope = result[perm.resource]!;
        if (!byScope[perm.scope]) {
            byScope[perm.scope] = [];
        }
        byScope[perm.scope]!.push(perm.action);
    }
    return result;
}
