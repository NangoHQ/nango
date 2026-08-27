import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { flags } from '@nangohq/utils';

import { resolve } from './resolve.js';

import type { RequestLocals } from '../utils/express.js';
import type { ApiKeyPrincipal, DBEnvironment, DBPlan, DBTeam, DBUser } from '@nangohq/types';

const account = { id: 1 } as DBTeam;
const environment = { id: 5, account_id: 1, is_production: true } as DBEnvironment;
const plan = { has_rbac: true } as DBPlan;

describe('resolve', () => {
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
        expect(resolve(locals, { resource: 'environment', action: 'update', scope: 'production' })).toBe(true);
    });

    it('still evaluates the role when a session user is present', () => {
        const locals: Partial<RequestLocals> = {
            account,
            plan,
            environment,
            user: { id: 7, role: 'development_full_access', email: 'a@b.c' } as DBUser
        };
        expect(resolve(locals, { resource: 'environment', action: 'update', scope: 'production' })).toBe(false);
    });
});
