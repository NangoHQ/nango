import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { metrics } from '@nangohq/utils';

import { recordRoleDivergence } from './shadow.js';

import type { RequestLocals } from '../utils/express.js';
import type { DBEnvironment, DBTeam, DBUser, Permission } from '@nangohq/types';
import type { MockInstance } from 'vitest';

const account = { id: 1 } as DBTeam;
const environment = { id: 5, account_id: 1, is_production: true } as DBEnvironment;
const user = { id: 7, role: 'administrator', email: 'a@b.c' } as DBUser;

describe('recordRoleDivergence', () => {
    let increment: MockInstance<typeof metrics.increment>;
    beforeEach(() => {
        increment = vi.spyOn(metrics, 'increment').mockImplementation(() => undefined);
    });
    afterEach(() => {
        increment.mockRestore();
    });

    const reasons = () =>
        increment.mock.calls.filter(([type]) => type === metrics.Types.AUTHZ_ROLE_UNMAPPED).map(([, , tags]) => (tags as { reason: string }).reason);

    const record = (permission: Permission, locals: Partial<RequestLocals>) => recordRoleDivergence({ locals, permission, legacy: true });

    it('reports a permission the map cannot resolve, the case that blinds a route forever', () => {
        record({ resource: '*', action: '*', scope: 'global' }, { account, environment, user });
        expect(reasons()).toEqual(['no_scope_mapping']);
    });

    it('reports a missing principal separately', () => {
        record({ resource: 'log', action: 'read', scope: 'production' }, { account, environment });
        expect(reasons()).toEqual(['no_principal']);
    });

    it('reports a missing target separately', () => {
        record({ resource: 'log', action: 'read', scope: 'production' }, { account, user });
        expect(reasons()).toEqual(['no_target']);
    });

    it('records nothing when it can compare', () => {
        record({ resource: 'log', action: 'read', scope: 'production' }, { account, environment, user });
        expect(reasons()).toEqual([]);
    });
});
