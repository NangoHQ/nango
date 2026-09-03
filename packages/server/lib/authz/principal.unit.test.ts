import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { accountTarget, authorize, environmentTarget, ROLES } from '@nangohq/authz';
import { flags } from '@nangohq/utils';

import { buildPrincipal, principalFor } from './principal.js';

import type { RequestLocals } from '../utils/express.js';
import type { ApiKeyPrincipal, DBTeam, DBUser } from '@nangohq/types';
import type * as NangoUtils from '@nangohq/utils';

// `flagHasPlan` is a const export, so it can only be varied per test through the module mock.
const planFlag = vi.hoisted(() => ({ enabled: true }));
vi.mock('@nangohq/utils', async () => {
    const actual: typeof NangoUtils = await vi.importActual('@nangohq/utils');
    return {
        ...actual,
        get flagHasPlan() {
            return planFlag.enabled;
        }
    };
});

const account = { id: 1 } as DBTeam;
const prodEnv = { id: 5, account_id: 1, is_production: true };
const devEnv = { id: 9, account_id: 1, is_production: false };

function key(scopes: string[], environmentIds: number[], source: ApiKeyPrincipal['source'] = 'customer_key'): ApiKeyPrincipal {
    return { type: 'api_key', source, accountId: 1, scopes, environmentIds };
}

function locals(over: Partial<RequestLocals>): Partial<RequestLocals> {
    return { account, plan: { has_rbac: true } as RequestLocals['plan'], ...over };
}

describe('buildPrincipal', () => {
    const originalFlag = flags.hasAuthRoles;
    beforeAll(() => {
        flags.hasAuthRoles = true;
    });
    afterAll(() => {
        flags.hasAuthRoles = originalFlag;
    });

    it('returns null without an account', () => {
        expect(buildPrincipal({})).toBeNull();
    });

    it('returns null when nothing authenticated', () => {
        expect(buildPrincipal(locals({}))).toBeNull();
    });

    describe('session users', () => {
        it('carries the grants of its role', () => {
            const principal = buildPrincipal(locals({ user: { id: 7, role: 'production_support', email: 'a@b.c' } as DBUser }));
            expect(principal?.grants).toEqual(ROLES.production_support);
            expect(principal?.subject).toEqual({ type: 'user', id: '7', display: 'a@b.c' });
        });

        it('reaches everything when the flag is off', () => {
            flags.hasAuthRoles = false;
            const principal = buildPrincipal(locals({ user: { id: 7, role: 'production_support', email: 'a@b.c' } as DBUser }));
            flags.hasAuthRoles = true;
            expect(authorize(principal!, 'environment:settings:read_secret', environmentTarget(prodEnv))).toBe(true);
        });

        it('reaches everything when the plan has no rbac', () => {
            const principal = buildPrincipal({
                account,
                plan: { has_rbac: false } as RequestLocals['plan'],
                user: { id: 7, role: 'production_support', email: 'a@b.c' } as DBUser
            });
            expect(authorize(principal!, 'environment:settings:read_secret', environmentTarget(prodEnv))).toBe(true);
        });

        it('applies the role when plans are not in play at all', () => {
            planFlag.enabled = false;
            const principal = buildPrincipal({ account, plan: null, user: { id: 7, role: 'production_support', email: 'a@b.c' } as DBUser });
            planFlag.enabled = true;
            expect(authorize(principal!, 'environment:settings:read_secret', environmentTarget(prodEnv))).toBe(false);
        });
    });

    describe('api keys', () => {
        it('binds environment scopes to the environments the key is bound to', () => {
            const principal = buildPrincipal(locals({ apiKeyPrincipal: key(['environment:connections:read'], [5]) }))!;
            expect(authorize(principal, 'environment:connections:read', environmentTarget(prodEnv))).toBe(true);
            expect(authorize(principal, 'environment:connections:read', environmentTarget(devEnv))).toBe(false);
        });

        it('binds account scopes to the account, mirroring targetForScope', () => {
            const principal = buildPrincipal(locals({ apiKeyPrincipal: key(['account:environments:create'], [5]) }))!;
            expect(authorize(principal, 'account:environments:create', accountTarget(1))).toBe(true);
        });

        it('keeps each plane to its own target', () => {
            const principal = buildPrincipal(locals({ apiKeyPrincipal: key(['environment:connections:read', 'account:environments:create'], [5]) }))!;
            expect(authorize(principal, 'account:environments:create', environmentTarget(prodEnv))).toBe(false);
            expect(authorize(principal, 'environment:connections:read', accountTarget(1))).toBe(false);
        });

        it('carries both planes at once', () => {
            const principal = buildPrincipal(locals({ apiKeyPrincipal: key(['environment:connections:read', 'account:environments:create'], [5]) }))!;
            expect(principal.grants).toHaveLength(2);
            expect(authorize(principal, 'environment:connections:read', environmentTarget(prodEnv))).toBe(true);
            expect(authorize(principal, 'account:environments:create', accountTarget(1))).toBe(true);
        });

        it('resolves wildcards without reaching a private scope', () => {
            const principal = buildPrincipal(locals({ apiKeyPrincipal: key(['environment:*'], [5]) }))!;
            expect(authorize(principal, 'environment:connections:read', environmentTarget(prodEnv))).toBe(true);
            expect(authorize(principal, 'environment:settings:read_secret', environmentTarget(prodEnv))).toBe(false);
        });

        it('reaches every environment it is bound to', () => {
            const principal = buildPrincipal(locals({ apiKeyPrincipal: key(['environment:connections:read'], [5, 9]) }))!;
            expect(authorize(principal, 'environment:connections:read', environmentTarget(prodEnv))).toBe(true);
            expect(authorize(principal, 'environment:connections:read', environmentTarget(devEnv))).toBe(true);
        });

        it('never reaches another account', () => {
            const principal = buildPrincipal(locals({ apiKeyPrincipal: key(['environment:*'], [5]) }))!;
            expect(authorize(principal, 'environment:connections:read', environmentTarget({ ...prodEnv, account_id: 2 }))).toBe(false);
        });

        it('names a connect session as its own subject', () => {
            const principal = buildPrincipal(locals({ apiKeyPrincipal: key(['environment:integrations:list'], [5], 'connect_session') }))!;
            expect(principal.subject.type).toBe('connect_session');
        });
    });

    it('principalFor computes once and keeps it on locals', () => {
        const l = locals({ user: { id: 7, role: 'administrator', email: 'a@b.c' } as DBUser });
        const first = principalFor(l);
        expect(l.principal).toBe(first);
        expect(principalFor(l)).toBe(first);
    });
});
