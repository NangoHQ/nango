import db from '@nangohq/database';

import { createAccount } from './account.seeder.js';
import { createEnvironmentSeed } from './environment.seeder.js';
import { seedUser } from './user.seeder.js';
import { createPlan } from '../services/plans/plans.js';

import type { DBEnvironment, DBPlan, DBTeam, DBUser } from '@nangohq/types';

export async function seedAccountEnvAndUser(): Promise<{ account: DBTeam; env: DBEnvironment; user: DBUser; plan: DBPlan }> {
    const account = await createAccount();
    const env = await createEnvironmentSeed(account.id, 'dev');
    const plan = (await createPlan(db.knex, { account_id: account.id, name: 'test' })).unwrap();
    const user = await seedUser(account.id);
    return { account, env, user, plan };
}
