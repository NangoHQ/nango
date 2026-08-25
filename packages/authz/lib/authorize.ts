import { expandIssuable } from './scopes.js';
import { isIssuableWhere, whereContains } from './where.js';

import type { Scope, ScopeSelector } from './scopes.js';
import type { Target, WhereSelector } from './where.js';

export interface Grant {
    can: ScopeSelector[];
    where: WhereSelector[];
}

export interface PrincipalSubject {
    type: 'user' | 'api_key' | 'connect_session';
    id: string;
    display?: string;
}

export interface Principal {
    subject: PrincipalSubject;
    accountId: number;
    grants: Grant[];
}

/** Whether any granted selector covers `required`. */
export function scopeMatches(granted: readonly ScopeSelector[], required: Scope): boolean {
    for (const scope of granted) {
        if (scope === required || scope === '*') {
            return true;
        }
        if (scope.endsWith(':*') && required.startsWith(scope.slice(0, -1))) {
            return true;
        }
    }
    return false;
}

export function authorize(principal: Principal, scope: Scope, target: Target): boolean {
    if (principal.accountId !== target.accountId) {
        return false;
    }
    return principal.grants.some((grant) => scopeMatches(grant.can, scope) && grant.where.some((where) => whereContains(where, target)));
}

/** Any-of. */
export function authorizeAny(principal: Principal, scopes: readonly Scope[], target: Target): boolean {
    return scopes.some((scope) => authorize(principal, scope, target));
}

/**
 * A grant for a credential issued to a customer.
 * Selectors are resolved here rather than trusted, so a stored wildcard can never reach a private scope
 * or a tier. Anything unresolvable is dropped, leaving a grant that authorizes nothing.
 */
export function issuedGrant(scopes: readonly ScopeSelector[], where: readonly WhereSelector[]): Grant {
    return { can: expandIssuable(scopes), where: where.filter(isIssuableWhere) };
}

/** A principal for a credential issued to a customer, such as an API key. */
export function issuedPrincipal({
    subject,
    accountId,
    scopes,
    where
}: {
    subject: PrincipalSubject;
    accountId: number;
    scopes: readonly ScopeSelector[];
    where: readonly WhereSelector[];
}): Principal {
    return { subject, accountId, grants: [issuedGrant(scopes, where)] };
}
