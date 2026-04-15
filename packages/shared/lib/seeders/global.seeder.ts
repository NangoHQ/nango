import db from '@nangohq/database';

import { createAccount } from './account.seeder.js';
import { createEnvironmentSeed } from './environment.seeder.js';
import { seedUser } from './user.seeder.js';
import customerKeyService from '../services/customerKey.service.js';
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

/**
 * Same as seedAccountEnvAndUser but returns the secret from customer_keys instead of api_secrets.
 * Used to test the new auth path that resolves keys from customer_keys first.
 */
export async function seedAccountEnvAndUserV2(): Promise<{ account: DBTeam; env: DBEnvironment; secret: { secret: string }; user: DBUser; plan: DBPlan }> {
    const account = await createAccount();
    const env = await createEnvironmentSeed(account.id, 'dev');
    const keys = (await customerKeyService.getApiKeysByEnv(db.knex, env.id)).unwrap();
    const defaultKey = keys[0];
    if (!defaultKey) {
        throw new Error('No customer API key found for environment');
    }
    const plan = (await createPlan(db.knex, { account_id: account.id, name: 'free' })).unwrap();
    const user = await seedUser(account.id);
    return { account, env, secret: { secret: defaultKey.secret }, user, plan };
}
