import db from '@nangohq/database';
import { LogActionEnum } from '../models/Telemetry.js';
import environmentService from './environment.service.js';
import errorManager, { ErrorSourceEnum } from '../utils/error.manager.js';
import type { DBEnvironment, DBTeam } from '@nangohq/types';

class AccountService {
    async getAccountById(id: number): Promise<DBTeam | null> {
        try {
            const result = await db.knex.select('*').from<DBTeam>(`_nango_accounts`).where({ id: id }).first();
            return result || null;
        } catch (err) {
            errorManager.report(err, {
                source: ErrorSourceEnum.PLATFORM,
                operation: LogActionEnum.DATABASE,
                accountId: id
            });

            return null;
        }
    }

    async editAccount({ name, id }: { name: string; id: number }): Promise<void> {
        await db.knex.update({ name, updated_at: new Date() }).from<DBTeam>(`_nango_accounts`).where({ id });
    }

    async getAccountByUUID(uuid: string): Promise<DBTeam | null> {
        const result = await db.knex.select('*').from<DBTeam>(`_nango_accounts`).where({ uuid }).first();

        return result || null;
    }

    async getAccountAndEnvironmentIdByUUID(targetAccountUUID: string, targetEnvironment: string): Promise<{ accountId: number; environmentId: number } | null> {
        const account = await db.knex.select('id').from<DBTeam>(`_nango_accounts`).where({ uuid: targetAccountUUID });

        if (account == null || account.length == 0 || account[0] == null) {
            return null;
        }

        const accountId = account[0].id;

        const environment = await db.knex.select('id').from<DBEnvironment>(`_nango_environments`).where({
            account_id: accountId,
            name: targetEnvironment
        });

        if (environment == null || environment.length == 0 || environment[0] == null) {
            return null;
        }

        return { accountId, environmentId: environment[0].id };
    }

    async getUUIDFromAccountId(accountId: number): Promise<string | null> {
        const account = await db.knex.select('uuid').from<DBTeam>(`_nango_accounts`).where({ id: accountId });

        if (account == null || account.length == 0 || account[0] == null) {
            return null;
        }

        return account[0].uuid;
    }

    async getOrCreateAccount(name: string): Promise<DBTeam> {
        const account: DBTeam[] = await db.knex.select('id').from<DBTeam>(`_nango_accounts`).where({ name });

        if (account == null || account.length == 0 || !account[0]) {
            const newAccount: DBTeam[] = await db.knex.insert({ name, created_at: new Date() }).into<DBTeam>(`_nango_accounts`).returning('*');

            if (!newAccount || newAccount.length == 0 || !newAccount[0]) {
                throw new Error('Failed to create account');
            }

            await environmentService.createDefaultEnvironments(newAccount[0]['id']);

            return newAccount[0];
        }

        return account[0];
    }

    /**
     * Create Account
     * @desc create a new account and assign to the default environments
     */
    async createAccount(name: string): Promise<DBTeam | null> {
        const result = await db.knex.from<DBTeam>(`_nango_accounts`).insert({ name }).returning('*');

        if (result[0]?.id) {
            await environmentService.createDefaultEnvironments(result[0].id);

            return result[0];
        }

        return null;
    }

    /**
     * Create Account without default environments
     * @desc create a new account and assign to the default environments
     */
    async createAccountWithoutEnvironments(name: string): Promise<DBTeam | null> {
        const result = await db.knex.from<DBTeam>(`_nango_accounts`).insert({ name }).returning('*');
        return result[0] || null;
    }

    async editCustomer(is_capped: boolean, accountId: number): Promise<void> {
        await db.knex.update({ is_capped }).from<DBTeam>(`_nango_accounts`).where({ id: accountId });
    }
}

export default new AccountService();
