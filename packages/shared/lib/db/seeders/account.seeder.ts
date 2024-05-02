import { v4 as uuid } from 'uuid';
import type { Account, Environment, User } from '../../models/index.js';
import accountService from '../../services/account.service.js';
import { seedUser } from './user.seeder.js';
import { createEnvironmentSeed } from './environment.seeder.js';

export async function createAccount(): Promise<Account> {
    const acc = await accountService.createAccount(uuid());
    if (!acc) {
        throw new Error('failed_to_create_account');
    }
    return acc;
}

export async function seedAccountEnvAndUser(): Promise<{ account: Account; env: Environment; user: User }> {
    const account = await createAccount();
    const env = await createEnvironmentSeed(account.id, 'dev');
    const user = await seedUser(account.id);
    return { account, env, user };
}
