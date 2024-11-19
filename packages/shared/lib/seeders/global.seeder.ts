import { seedUser } from './user.seeder.js';
import { createEnvironmentSeed } from './environment.seeder.js';
import { createAccount } from './account.seeder.js';
import type { DBEnvironment, DBTeam, DBUser } from '@nangohq/types';

export async function seedAccountEnvAndUser(): Promise<{ account: DBTeam; env: DBEnvironment; user: DBUser }> {
    const account = await createAccount();
    const env = await createEnvironmentSeed(account.id, 'dev');
    const user = await seedUser(account.id);
    return { account, env, user };
}
