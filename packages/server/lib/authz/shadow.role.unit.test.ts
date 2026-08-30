import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { flags, metrics } from '@nangohq/utils';

import { recordRoleDivergence } from './shadow.js';

import type { RequestLocals } from '../utils/express.js';
import type { DBEnvironment, DBPlan, DBTeam, DBUser, Permission } from '@nangohq/types';
import type { MockInstance } from 'vitest';

const account = { id: 1 } as DBTeam;
const environment = { id: 5, account_id: 1, is_production: true } as DBEnvironment;
const user = { id: 7, role: 'administrator', email: 'a@b.c' } as DBUser;
// Named explicitly so the role applies whether or not `flagHasPlan` is on: `rbacApplies` short-circuits
// on `!flagHasPlan`, so without a plan these tests would only assert what this environment happens to set.
const plan = { has_rbac: true } as DBPlan;

describe('recordRoleDivergence', () => {
    const originalFlag = flags.hasAuthRoles;
    let increment: MockInstance<typeof metrics.increment>;
    beforeEach(() => {
        flags.hasAuthRoles = true;
        increment = vi.spyOn(metrics, 'increment').mockImplementation(() => undefined);
    });
    afterEach(() => {
        flags.hasAuthRoles = originalFlag;
        increment.mockRestore();
    });

    const results = () =>
        increment.mock.calls.filter(([type]) => type === metrics.Types.AUTHZ_ROLE_COMPARISON).map(([, , tags]) => tags as { result: string; reason?: string });
    const reasons = () => results().map((tags) => tags.reason);

    const record = (permission: Permission, locals: Partial<RequestLocals>) => recordRoleDivergence({ locals, permission, legacy: true });

    it('reports a permission the map cannot resolve, the case that blinds a route forever', () => {
        record({ resource: '*', action: '*', scope: 'global' }, { account, plan, environment, user });
        expect(reasons()).toEqual(['no_scope_mapping']);
    });

    it('reports a missing principal separately', () => {
        record({ resource: 'log', action: 'read', scope: 'production' }, { account, plan, environment });
        expect(reasons()).toEqual(['no_principal']);
    });

    it('reports a missing target separately', () => {
        record({ resource: 'log', action: 'read', scope: 'production' }, { account, plan, user });
        expect(reasons()).toEqual(['no_target']);
    });

    it('counts a comparison it could make, so the graph has a denominator', () => {
        record({ resource: 'log', action: 'read', scope: 'production' }, { account, plan, environment, user });
        expect(results()).toEqual([{ resource: 'log', action: 'read', tier: 'production', result: 'agree' }]);
    });

    it('counts a disagreement as the same metric', () => {
        recordRoleDivergence({
            locals: { account, plan, environment, user: { ...user, role: 'development_full_access' } as DBUser },
            permission: { resource: 'log', action: 'read', scope: 'production' },
            legacy: true
        });
        expect(results().map((t) => t.result)).toEqual(['diverge']);
    });
});
