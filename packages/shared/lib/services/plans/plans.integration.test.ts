import { beforeAll, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';

import { seedAccountEnvAndUser } from '../../seeders/global.seeder.js';
import { getPlan, handlePlanChanged } from './plans.js';

describe('handlePlanChanged', () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    it('reports no change when the plan is already the one requested', async () => {
        const { account, plan } = await seedAccountEnvAndUser();

        const res = await handlePlanChanged(db.knex, account, { newPlanCode: plan.name, orbSubscriptionId: 'orb_sub_1' });

        // Callers react to a plan change — clearing the spend alert — so an unchanged plan has to
        // be distinguishable from a real move.
        expect(res.unwrap()).toBe(false);
    });

    it('reports a change and applies the new plan', async () => {
        const { account } = await seedAccountEnvAndUser();

        const res = await handlePlanChanged(db.knex, account, { newPlanCode: 'growth-v2', orbSubscriptionId: 'orb_sub_2' });

        expect(res.unwrap()).toBe(true);
        const updated = await getPlan(db.knex, { accountId: account.id });
        expect(updated.unwrap().name).toBe('growth-v2');
        expect(updated.unwrap().orb_subscription_id).toBe('orb_sub_2');
    });
});
