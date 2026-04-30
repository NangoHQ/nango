import db from '@nangohq/database';

import { createAccount } from './account.seeder.js';
import { createEnvironmentSeed } from './environment.seeder.js';
import { seedUser } from './user.seeder.js';
import customerKeyService from '../services/customerKey.service.js';
import { createPlan } from '../services/plans/plans.js';
import secretService from '../services/secret.service.js';

import type { DBAPISecret, DBCustomerKey, DBEnvironment, DBPlan, DBTeam, DBUser } from '@nangohq/types';

export async function seedAccountEnvAndUser({ plan: planOverride }: { plan?: Partial<DBPlan> } = {}): Promise<{
    account: DBTeam;
    env: DBEnvironment;
    secret: DBAPISecret;
    apiKey: DBCustomerKey;
    user: DBUser;
    plan: DBPlan;
}> {
    const account = await createAccount();
    const env = await createEnvironmentSeed(account.id, 'dev');
    const secret = (await secretService.getInternalSecretForEnv(db.knex, env.id)).unwrap();
    const apiKeys = (await customerKeyService.getApiKeysByEnv(db.knex, env.id)).unwrap();
    const apiKey = apiKeys[0]!;
    const plan = (await createPlan(db.knex, { account_id: account.id, name: 'free', ...planOverride })).unwrap();
    const user = await seedUser(account.id);
    return { account, env, secret, apiKey, user, plan };
}
