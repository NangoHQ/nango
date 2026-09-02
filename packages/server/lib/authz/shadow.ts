import { accountTarget, authorize, environmentTarget } from '@nangohq/authz';
import { metrics } from '@nangohq/utils';

import { principalFor } from './principal.js';

import type { RequestLocals } from '../utils/express.js';
import type { Plane } from './permissionScopes.js';
import type { Scope, Target } from '@nangohq/authz';
import type { CustomerKeyScope } from '@nangohq/types';

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
 * The key path still authorizes from the legacy scope check, so its derivation stays shadowed until
 * `withScope` flips too.
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
    // `|` and `,` are dogstatsd field separators; a tag value containing either truncates the tag list.
    const tags = { scope: requiredScopes.join('/') };

    const principal = principalFor(locals);
    // Each scope carries its own plane, so a mixed any-of set gets a target per scope.
    const targeted = requiredScopes.map((scope) => ({ scope, target: targetFor(locals, scope.startsWith('account:') ? 'account' : 'environment') }));

    const compared = (result: string, extra?: Record<string, string>) =>
        metrics.increment(metrics.Types.AUTHZ_KEY_DERIVATION_COMPARISON, 1, { ...tags, result, ...extra });

    // No mapping step on this path: the required scope is already a scope.
    if (requiredScopes.length === 0) {
        compared('unmapped', { reason: 'no_scope_required' });
        return;
    }
    if (!principal) {
        compared('unmapped', { reason: 'no_principal' });
        return;
    }
    if (targeted.some(({ target }) => !target)) {
        compared('unmapped', { reason: 'no_target' });
        return;
    }

    if (targeted.some(({ scope, target }) => authorize(principal, scope as Scope, target!)) !== legacy) {
        compared('diverge', { expected: String(legacy) });
        return;
    }
    compared('agree');
}
