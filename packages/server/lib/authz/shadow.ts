import { accountTarget, authorize, authorizeAny, environmentTarget } from '@nangohq/authz';
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
 *
 * This is the signal that matters: roles are a deny map today, so the allow-list has to enumerate a
 * complement, and over-denial is how that goes wrong.
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

/**
 * Both sides read the same stored scopes with the same wildcard semantics, so this should sit at zero
 * from the first deploy. Movement means `buildPrincipal` derived the grants wrong, not that the grant
 * model disagrees — a different bug with a different fix.
 */
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
    // Each scope carries its own plane, so a mixed any-of set gets a target per scope.
    const targeted = requiredScopes.map((scope) => ({ scope, target: targetFor(locals, scope.startsWith('account:') ? 'account' : 'environment') }));
    if (!principal || requiredScopes.length === 0 || targeted.some(({ target }) => !target)) {
        metrics.increment(metrics.Types.AUTHZ_KEY_DERIVATION_UNMAPPED, 1, tags);
        return;
    }

    if (targeted.some(({ scope, target }) => authorize(principal, scope as Scope, target!)) !== legacy) {
        metrics.increment(metrics.Types.AUTHZ_KEY_DERIVATION_DIVERGENCE, 1, { ...tags, expected: String(legacy) });
    }
}
