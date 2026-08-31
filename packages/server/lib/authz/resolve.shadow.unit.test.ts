import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { flags, metrics } from '@nangohq/utils';

import { canReadProdSecret, resolve } from './resolve.js';

import type { RequestLocals } from '../utils/express.js';
import type { DBEnvironment, DBPlan, DBTeam, DBUser } from '@nangohq/types';
import type { MockInstance } from 'vitest';

const account = { id: 1 } as DBTeam;
const environment = { id: 5, account_id: 1, is_production: true } as DBEnvironment;
const plan = { has_rbac: true } as DBPlan;
const user = { id: 7, role: 'administrator', email: 'a@b.c' } as DBUser;
const locals: Partial<RequestLocals> = { account, plan, environment, user };

describe('checks made inside handlers are compared too', () => {
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

    const comparisons = () =>
        increment.mock.calls.filter(([type]) => type === metrics.Types.AUTHZ_ROLE_COMPARISON).map(([, , tags]) => tags as Record<string, string>);

    it('records a comparison for a permission checked outside a route guard', async () => {
        await resolve(locals, { resource: 'connection_credential', action: 'read', scope: 'production' });
        expect(comparisons()).toEqual([{ resource: 'connection_credential', action: 'read', tier: 'production', result: 'agree' }]);
    });

    it('records the secret-key check that only ever runs in a handler', async () => {
        await canReadProdSecret(locals, environment);
        expect(comparisons().map((t) => `${t['resource']}/${t['action']}`)).toEqual(['secret_key/read']);
    });

    it('records nothing extra for a non-production secret read, which never consults the role', async () => {
        await canReadProdSecret(locals, { is_production: false } as DBEnvironment);
        expect(comparisons()).toEqual([]);
    });

    it('records exactly once per check', async () => {
        await resolve(locals, { resource: 'log', action: 'read', scope: 'production' });
        expect(comparisons()).toHaveLength(1);
    });
});
