import { describe, expect, it } from 'vitest';

import { authorizeIn } from './authorize.js';
import { ROLES } from './roles.js';
import { isAccountScope, ISSUABLE_SCOPES, PRIVATE_SCOPES } from './scopes.js';

import type { Role } from '@nangohq/types';

const ACCOUNT_ID = 1;
const prod = { id: 5, account_id: ACCOUNT_ID, is_production: true };
const dev = { id: 9, account_id: ACCOUNT_ID, is_production: false };

const ALL_SCOPES = [...ISSUABLE_SCOPES, ...PRIVATE_SCOPES];
const ENVIRONMENT_SCOPES = ALL_SCOPES.filter((scope) => !isAccountScope(scope));
const ACCOUNT_SCOPES = ALL_SCOPES.filter(isAccountScope);
const ROLE_NAMES = Object.keys(ROLES) as Role[];

function allows(role: Role, scope: (typeof ALL_SCOPES)[number], environment: typeof prod): boolean {
    return authorizeIn({ subject: { type: 'user', id: 'role' }, accountId: ACCOUNT_ID, grants: ROLES[role] }, scope, environment);
}

const denied = (role: Role, scopes: typeof ALL_SCOPES, environment: typeof prod) => scopes.filter((scope) => !allows(role, scope, environment));
const allowed = (role: Role, scopes: typeof ALL_SCOPES, environment: typeof prod) => scopes.filter((scope) => allows(role, scope, environment));

describe('administrator', () => {
    it('reaches everything, production included', () => {
        expect(denied('administrator', ENVIRONMENT_SCOPES, prod)).toEqual([]);
        expect(denied('administrator', ACCOUNT_SCOPES, dev)).toEqual([]);
    });
});

describe('production_support', () => {
    // Snapshotted rather than derived from `ROLES`, which would assert the table against itself.
    it('keeps only these reads in production', () => {
        expect(allowed('production_support', ENVIRONMENT_SCOPES, prod)).toMatchInlineSnapshot(`
          [
            "environment:integrations:list",
            "environment:integrations:read",
            "environment:connections:list",
            "environment:connections:read",
            "environment:syncs:execute",
            "environment:functions:list",
            "environment:functions:read",
            "environment:logs:read",
            "environment:api_keys:list",
            "environment:settings:read",
          ]
        `);
    });

    it('reaches the whole namespace outside production', () => {
        expect(denied('production_support', ENVIRONMENT_SCOPES, dev)).toEqual([]);
    });

    it('holds the audit trail and nothing else on the account', () => {
        expect(allowed('production_support', ACCOUNT_SCOPES, dev)).toEqual(['account:audit_trail:read']);
    });
});

describe('development_full_access', () => {
    it('reaches no production and no account', () => {
        expect(allowed('development_full_access', ENVIRONMENT_SCOPES, prod)).toEqual([]);
        expect(allowed('development_full_access', ACCOUNT_SCOPES, dev)).toEqual([]);
    });

    it('reaches the whole namespace outside production', () => {
        expect(denied('development_full_access', ENVIRONMENT_SCOPES, dev)).toEqual([]);
    });
});

describe('every role', () => {
    it.each(ROLE_NAMES)('%s selects environments by tier, never by id', (role) => {
        const selectors = ROLES[role].flatMap((grant) => grant.where);
        expect(selectors.filter((where) => /^env:\d+$/.test(where))).toEqual([]);
    });
});
