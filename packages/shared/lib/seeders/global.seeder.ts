import type { User } from '../models/index.js';
import { seedUser } from './user.seeder.js';
import { createEnvironmentSeed } from './environment.seeder.js';
import { createAccount } from './account.seeder.js';
import type { DBEnvironment, DBTeam } from '@nangohq/types';

export async function seedAccountEnvAndUser(): Promise<{ account: DBTeam; env: DBEnvironment; user: User }> {
    const account = await createAccount();
    const env = await createEnvironmentSeed(account.id, 'dev');
    const user = await seedUser(account.id);
    return { account, env, user };
}
