import db from '@nangohq/database';

import { createAccount } from './account.seeder.js';
import { createEnvironmentSeed } from './environment.seeder.js';
import { seedUser } from './user.seeder.js';
import { createPlan } from '../services/plans/plans.js';
import secretService from '../services/secret.service.js';

import type { DBAPISecret, DBEnvironment, DBPlan, DBTeam, DBUser } from '@nangohq/types';

export async function seedAccountEnvAndUser(): Promise<{ account: DBTeam; env: DBEnvironment; secret: DBAPISecret; user: DBUser; plan: DBPlan }> {
    const account = await createAccount();
    const env = await createEnvironmentSeed(account.id, 'dev');
    const secret = (await secretService.getDefaultSecretForEnv(db.knex, env.id)).unwrap();
    const plan = (await createPlan(db.knex, { account_id: account.id, name: 'free' })).unwrap();
    const user = await seedUser(account.id);
    return { account, env, secret, user, plan };
}
