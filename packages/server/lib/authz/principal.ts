import { issuedGrant, ROLES } from '@nangohq/authz';
import { flagHasPlan, flags } from '@nangohq/utils';

import type { RequestLocals } from '../utils/express.js';
import type { Grant, Principal, PrincipalSubject, ScopeSelector, WhereSelector } from '@nangohq/authz';
import type { ApiKeyPrincipal, Role } from '@nangohq/types';

/** What a caller reaches when RBAC does not apply: the flag is off, or the plan has no RBAC. */
const UNRESTRICTED: Grant[] = [
    { can: ['environment:*'], where: ['env:*'] },
    { can: ['account:*'], where: ['account'] }
];

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
            grants: rbacApplies(locals) ? ROLES[user.role] : UNRESTRICTED
        };
    }

    const key = locals.apiKeyPrincipal;
    if (key) {
        return { subject: subjectForKey(key), accountId: account.id, grants: grantsForKey(key) };
    }

    return null;
}

/** The grants a role carries, with no request behind them. The caller supplies the target to evaluate against. */
export function principalForRole(role: Role, accountId: number, plan?: { has_rbac: boolean } | null): Principal {
    return {
        subject: { type: 'user', id: 'role' },
        accountId,
        grants: rbacApplies({ plan: plan ?? null }) ? ROLES[role] : UNRESTRICTED
    };
}

/** `buildPrincipal`, computed once per request and kept on locals for later handlers. */
export function principalFor(locals: Partial<RequestLocals>): Principal | null {
    if (locals.principal === undefined) {
        locals.principal = buildPrincipal(locals);
    }
    return locals.principal;
}
