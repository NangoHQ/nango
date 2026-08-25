import { accountTarget, authorizeAny, environmentTarget } from '@nangohq/authz';
import { metrics } from '@nangohq/utils';

import { planeForPermission, scopesForPermission } from './legacyScopes.js';
import { principalFor } from './principal.js';

import type { RequestLocals } from '../utils/express.js';
import type { Plane } from './legacyScopes.js';
import type { Scope, Target } from '@nangohq/authz';
import type { CustomerKeyScope, Permission } from '@nangohq/types';

function targetFor(locals: Partial<RequestLocals>, plane: Plane): Target | null {
    const account = locals.account;
    if (!account) {
        return null;
    }
    if (plane === 'account') {
        return accountTarget(account.id);
    }
    const environment = locals.environment;
    return environment ? environmentTarget(environment) : null;
}

/**
 * Compares the grant model against the answer the request actually used, and counts the difference.
 * Nothing here changes what the caller is allowed to do — the count is the gate on the flip.
 */
export function recordRoleDivergence({ locals, permission, legacy }: { locals: Partial<RequestLocals>; permission: Permission; legacy: boolean }): void {
    const tags = { resource: permission.resource, action: permission.action, tier: permission.scope };

    const principal = principalFor(locals);
    const scopes = scopesForPermission(permission);
    const target = targetFor(locals, planeForPermission(permission));
    if (!principal || !target || scopes.length === 0) {
        metrics.increment(metrics.Types.AUTHZ_ROLE_UNMAPPED, 1, tags);
        return;
    }

    if (authorizeAny(principal, scopes, target) !== legacy) {
        metrics.increment(metrics.Types.AUTHZ_ROLE_DIVERGENCE, 1, { ...tags, expected: String(legacy) });
    }
}

export function recordScopeDivergence({
    locals,
    requiredScopes,
    legacy
}: {
    locals: Partial<RequestLocals>;
    requiredScopes: readonly CustomerKeyScope[];
    legacy: boolean;
}): void {
    const tags = { scope: requiredScopes.join('|') };

    const principal = principalFor(locals);
    // Every scope in a withAnyScope set shares a plane, so the first decides the target.
    const target = targetFor(locals, requiredScopes[0]?.startsWith('account:') ? 'account' : 'environment');
    if (!principal || !target || requiredScopes.length === 0) {
        metrics.increment(metrics.Types.AUTHZ_ROLE_UNMAPPED, 1, tags);
        return;
    }

    if (authorizeAny(principal, requiredScopes as readonly Scope[], target) !== legacy) {
        metrics.increment(metrics.Types.AUTHZ_ROLE_DIVERGENCE, 1, { ...tags, expected: String(legacy) });
    }
}
