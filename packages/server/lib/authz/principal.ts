import { authorize, issuedGrant, ROLES, targetForScope } from '@nangohq/authz';
import { flagHasPlan, flags } from '@nangohq/utils';

import type { RequestLocals } from '../utils/express.js';
import type { Grant, Principal, PrincipalSubject, Scope, ScopeSelector, WhereSelector } from '@nangohq/authz';
import type { ApiKeyPrincipal, Role } from '@nangohq/types';

function rbacApplies(locals: { plan?: { has_rbac: boolean } | null }): boolean {
    if (!flags.hasAuthRoles) {
        return false;
    }
    return !flagHasPlan || Boolean(locals.plan?.has_rbac);
}

/**
 * Generates grants from an API key based on its scopes and environment IDs.
 */
function grantsForKey(key: ApiKeyPrincipal): Grant[] {
    const selectors = key.scopes as ScopeSelector[];
    const environments = key.environmentIds.map((id): WhereSelector => `env:${id}`);

    return [
        issuedGrant(
            selectors.filter((scope) => scope.startsWith('environment:')),
            environments
        ),
        issuedGrant(
            selectors.filter((scope) => scope.startsWith('account:')),
            ['account']
        )
    ].filter((grant) => grant.can.length > 0);
}

function subjectForKey(key: ApiKeyPrincipal): PrincipalSubject {
    return {
        type: key.source === 'connect_session' ? 'connect_session' : 'api_key',
        id: String(key.keyId ?? key.source),
        ...(key.displayName ? { display: key.displayName } : {})
    };
}

/**
 * The grants behind the current request, or null when nothing authenticated well enough to have any.
 * Roles authorize from this; the key path compares against the legacy answer and counts.
 */
export function buildPrincipal(locals: Partial<RequestLocals>): Principal | null {
    const account = locals.account;
    if (!account) {
        return null;
    }

    const user = locals.user;
    if (user) {
        return {
            subject: { type: 'user', id: String(user.id), display: user.email },
            accountId: account.id,
            grants: grantsForRole(user.role, locals.plan)
        };
    }

    const key = locals.apiKeyPrincipal;
    if (key) {
        return { subject: subjectForKey(key), accountId: account.id, grants: grantsForKey(key) };
    }

    return null;
}

/** Administrator grants when RBAC does not apply. */
export function grantsForRole(role: Role, plan?: { has_rbac: boolean } | null): readonly Grant[] {
    return ROLES[rbacApplies({ plan: plan ?? null }) ? role : 'administrator'];
}

/** `buildPrincipal`, computed once per request and kept on locals for later handlers. */
export function principalFor(locals: Partial<RequestLocals>): Principal | null {
    if (locals.principal === undefined) {
        locals.principal = buildPrincipal(locals);
    }
    return locals.principal;
}

export class MissingPrincipalError extends Error {
    readonly scope: Scope;

    constructor(scope: Scope) {
        super('missing_principal');
        this.name = 'MissingPrincipalError';
        this.scope = scope;
    }
}

export function principalCan(locals: Partial<RequestLocals>, scope: Scope): boolean {
    const principal = principalFor(locals);
    if (!principal) {
        throw new MissingPrincipalError(scope);
    }
    return authorize(principal, scope, targetForScope(scope, principal.accountId, locals.environment ?? null));
}
