import { flags } from '@nangohq/utils';

import { evaluator } from './evaluator.js';
import { permissions } from './permissions.js';

import type { Permission } from './types.js';
import type { Role } from '@nangohq/types';

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

export async function buildPermissions(role: Role): Promise<Record<string, boolean>> {
    if (!flags.hasAuthRoles) {
        return Object.fromEntries(Object.keys(permissions).map((key) => [key, true]));
    }
    const entries = await Promise.all(Object.entries(permissions).map(async ([key, perm]) => [key, await evaluator.evaluate(role, perm)]));
    return Object.fromEntries(entries);
}
