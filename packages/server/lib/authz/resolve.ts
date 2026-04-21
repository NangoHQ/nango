import { permissions } from '@nangohq/authz';
import { flags } from '@nangohq/utils';

import { evaluator } from './evaluator.js';

import type { AllowedPermissions, Permission, Role } from '@nangohq/types';

/**
 * Resolve a permission for the current request.
 * Returns true (allowed) when the feature flag is off or no session user exists (API key auth).
 */
export async function resolve(locals: { user?: { role: Role } }, permission: Permission): Promise<boolean> {
    if (!flags.hasAuthRoles) return true;
    const user = locals.user;
    if (!user) return true;
    return evaluator.evaluate(user.role, permission);
}

export async function buildPermissions(role: Role): Promise<AllowedPermissions> {
    const result: AllowedPermissions = {};
    for (const perm of Object.values(permissions)) {
        const allowed = !flags.hasAuthRoles || (await evaluator.evaluate(role, perm));
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
