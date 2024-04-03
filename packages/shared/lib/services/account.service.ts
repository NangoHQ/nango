import db from '../db/database.js';
import type { Account } from '../models/Admin.js';
import type { Environment } from '../models/Environment.js';
import { LogActionEnum } from '../models/Activity.js';
import environmentService from './environment.service.js';
import errorManager, { ErrorSourceEnum } from '../utils/error.manager.js';

class AccountService {
    async getAccountById(id: number): Promise<Account | null> {
        try {
            const result = await db.knex.select('*').from<Account>(`_nango_accounts`).where({ id: id }).first();
            return result || null;
        } catch (e) {
            errorManager.report(e, {
                source: ErrorSourceEnum.PLATFORM,
                operation: LogActionEnum.DATABASE,
                accountId: id
            });

            return null;
        }
    }

    async editAccount(name: string, id: number): Promise<void> {
        try {
            await db.knex.update({ name, updated_at: new Date() }).from<Account>(`_nango_accounts`).where({ id });
        } catch (e) {
            errorManager.report(e, {
                source: ErrorSourceEnum.PLATFORM,
                operation: LogActionEnum.DATABASE,
                accountId: id
            });
        }
    }

    async getAccountByUUID(uuid: string): Promise<Account | null> {
        try {
            const result = await db.knex.select('*').from<Account>(`_nango_accounts`).where({ uuid }).first();
            return result || null;
        } catch (e) {
            errorManager.report(e, {
                source: ErrorSourceEnum.PLATFORM,
                operation: LogActionEnum.DATABASE
            });

            return null;
        }
    }

    async getAccountAndEnvironmentIdByUUID(targetAccountUUID: string, targetEnvironment: string): Promise<{ accountId: number; environmentId: number } | null> {
        const account = await db.knex.select('id').from<Account>(`_nango_accounts`).where({ uuid: targetAccountUUID });

        if (account == null || account.length == 0 || account[0] == null) {
            return null;
        }

        const accountId = account[0].id;

        const environment = await db.knex.select('id').from<Environment>(`_nango_environments`).where({
            account_id: accountId,
            name: targetEnvironment
        });

        if (environment == null || environment.length == 0 || environment[0] == null) {
            return null;
        }

        return { accountId, environmentId: environment[0].id };
    }

    async getUUIDFromAccountId(accountId: number): Promise<string | null> {
        const account = await db.knex.select('uuid').from<Account>(`_nango_accounts`).where({ id: accountId });

        if (account == null || account.length == 0 || account[0] == null) {
            return null;
        }

        return account[0].uuid;
    }

    async getOrCreateAccount(name: string): Promise<Account> {
        const account: Account[] = await db.knex.select('id').from<Account>(`_nango_accounts`).where({ name });

        if (account == null || account.length == 0 || !account[0]) {
            const newAccount: Account[] = await db.knex.insert({ name, created_at: new Date() }).into<Account>(`_nango_accounts`).returning('*');

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
     * @desc create a new account and assign to the default environmenets
     */
    async createAccount(name: string): Promise<Account | null> {
        const result: void | Pick<Account, 'id'> = await db.knex.from<Account>(`_nango_accounts`).insert({ name: name }, ['id']);

        if (Array.isArray(result) && result.length === 1 && result[0] != null && 'id' in result[0]) {
            await environmentService.createDefaultEnvironments(result[0]['id']);

            return result[0];
        }

        return null;
    }

    async editCustomer(is_capped: boolean, accountId: number): Promise<void> {
        try {
            await db.knex.update({ is_capped }).from<Account>(`_nango_accounts`).where({ id: accountId });
        } catch (e) {
            errorManager.report(e, {
                source: ErrorSourceEnum.PLATFORM,
                operation: LogActionEnum.DATABASE,
                accountId
            });
        }
    }
}

export default new AccountService();
