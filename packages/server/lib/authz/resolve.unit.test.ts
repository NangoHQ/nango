import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { flags } from '@nangohq/utils';

import { authorizes } from './resolve.js';

import type { RequestLocals } from '../utils/express.js';
import type { ApiKeyPrincipal, DBEnvironment, DBPlan, DBTeam, DBUser } from '@nangohq/types';

const account = { id: 1 } as DBTeam;
const environment = { id: 5, account_id: 1, is_production: true } as DBEnvironment;
const plan = { has_rbac: true } as DBPlan;

describe('authorizes', () => {
    const originalFlag = flags.hasAuthRoles;
    beforeEach(() => {
        flags.hasAuthRoles = true;
    });
    afterEach(() => {
        flags.hasAuthRoles = originalFlag;
    });

    it('lets a key-authenticated caller through, since it carries no role', () => {
        const apiKeyPrincipal: ApiKeyPrincipal = { type: 'api_key', source: 'customer_key', accountId: 1, scopes: ['environment:*'], environmentIds: [5] };
        const locals: Partial<RequestLocals> = { account, plan, environment, apiKeyPrincipal };
        expect(authorizes(locals, 'environment:settings:update')).toBe(true);
    });

    it('denies a scope the role holds outside production but not in it', () => {
        const user = { id: 7, role: 'production_support', email: 'a@b.c' } as DBUser;
        expect(authorizes({ account, plan, environment, user }, 'environment:settings:read_secret')).toBe(false);
    });

    // Guessing an environment would silently widen a role: `env:non-production` grants `environment:*`,
    // so treating a missing environment as non-production hands out the whole namespace.
    it('throws when an environment scope is checked with no environment resolved', () => {
        const user = { id: 7, role: 'production_support', email: 'a@b.c' } as DBUser;
        expect(() => authorizes({ account, plan, user }, 'environment:settings:read_secret')).toThrow(/scope_requires_environment/);
    });

    // The routes that resolve no environment are the ones asking about the account.
    it('answers an account scope with no environment resolved', () => {
        const user = { id: 7, role: 'production_support', email: 'a@b.c' } as DBUser;
        expect(authorizes({ account, plan, user }, 'account:audit_trail:read')).toBe(true);
        expect(authorizes({ account, plan, user }, 'account:team:update')).toBe(false);
    });

    it('still evaluates the role when a session user is present', () => {
        const locals: Partial<RequestLocals> = {
            account,
            plan,
            environment,
            user: { id: 7, role: 'development_full_access', email: 'a@b.c' } as DBUser
        };
        expect(authorizes(locals, 'environment:settings:update')).toBe(false);
    });
});
