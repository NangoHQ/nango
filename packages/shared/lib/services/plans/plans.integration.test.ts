import { v4 as uuid } from 'uuid';
import { beforeAll, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';
import { ENVS, parseEnvs, roles } from '@nangohq/utils';

import { getPlanDefinition } from './definitions.js';
import { createPlan, handlePlanChanged } from './plans.js';
import { createAccount as createTestAccount } from '../../seeders/account.seeder.js';
import userService from '../user.service.js';

import type { DBUser } from '@nangohq/types';

const envs = parseEnvs(ENVS);
const nonDefaultRoles = roles.filter((role) => role !== envs.DEFAULT_USER_ROLE) as DBUser['role'][];
const [firstNonDefaultRole, secondNonDefaultRole] = nonDefaultRoles;

if (!firstNonDefaultRole || !secondNonDefaultRole) {
    throw new Error('Expected at least two non-default roles for plan tests');
}

describe('handlePlanChanged', () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    it('should reset non-default roles when downgrading to a plan without RBAC', async () => {
        const account = await createTestAccount();
        const growthPlan = getPlanDefinition('growth-v2');

        expect(growthPlan).toBeDefined();

        const createdPlan = await createPlan(db.knex, {
            account_id: account.id,
            name: 'growth-v2',
            ...growthPlan!.flags
        });
        expect(createdPlan.isOk()).toBe(true);

        await createUser({ accountId: account.id, role: envs.DEFAULT_USER_ROLE });
        const firstNonDefaultUser = await createUser({ accountId: account.id, role: firstNonDefaultRole });
        const secondNonDefaultUser = await createUser({ accountId: account.id, role: secondNonDefaultRole });

        const result = await db.knex.transaction(async (trx) => {
            return await handlePlanChanged(trx, account, {
                newPlanCode: 'starter-v2',
                orbSubscriptionId: 'sub_123'
            });
        });

        expect(result.isOk()).toBe(true);

        const updatedUsers = await db.knex
            .from<DBUser>('_nango_users')
            .select('id', 'role')
            .where('account_id', account.id)
            .whereIn('id', [firstNonDefaultUser.id, secondNonDefaultUser.id])
            .orderBy('id', 'asc');

        expect(updatedUsers).toEqual([
            { id: firstNonDefaultUser.id, role: envs.DEFAULT_USER_ROLE },
            { id: secondNonDefaultUser.id, role: envs.DEFAULT_USER_ROLE }
        ]);

        const updatedPlan = await db.knex.from('plans').select('name', 'has_rbac').where({ account_id: account.id }).first();

        expect(updatedPlan).toMatchObject({ name: 'starter-v2', has_rbac: false });
    });
});

async function createUser({ accountId, role }: { accountId: number; role: DBUser['role'] }): Promise<DBUser> {
    const id = uuid();
    const user = await userService.createUser({
        email: `${id}@example.com`,
        name: id,
        account_id: accountId,
        email_verified: true,
        role
    });

    expect(user).toBeTruthy();
    return user!;
}
