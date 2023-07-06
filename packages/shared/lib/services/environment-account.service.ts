import db from '../db/database.js';
import encryptionManager from '../utils/encryption.manager.js';
import accountService from './account.service.js';
import type { Environment } from '../models/Environment.js';
import type { Account } from '../models/Account.js';

const TABLE = '_nango_environments';

interface EnvironmentAccount {
    accountId: number;
    environment: string;
}

interface EnvironmentAccountSecrets {
    [key: string]: EnvironmentAccount;
}
class EnvironmentAccountService {
    private accountEnvironmentSecrets: EnvironmentAccountSecrets = {} as EnvironmentAccountSecrets;

    async cacheSecrets(): Promise<void> {
        const environmentAccounts = await db.knex.withSchema(db.schema()).select('*').from<Environment>(TABLE);

        const accountEnvironmentSecrets: EnvironmentAccountSecrets = {};

        for (const environmentAccount of environmentAccounts) {
            const decryptedEnvironmentAccount = encryptionManager.decryptEnvironment(environmentAccount);

            if (decryptedEnvironmentAccount != null) {
                accountEnvironmentSecrets[decryptedEnvironmentAccount.secret_key] = {
                    accountId: decryptedEnvironmentAccount.account_id,
                    environment: decryptedEnvironmentAccount.name
                };
            }
        }

        this.accountEnvironmentSecrets = accountEnvironmentSecrets;
    }

    private addToAccountSecretCache(accountEnvironment: Environment) {
        this.accountEnvironmentSecrets[accountEnvironment.secret_key] = {
            accountId: accountEnvironment.account_id,
            environment: accountEnvironment.name
        };
    }

    async getAccountBySecretKey(secretKey: string): Promise<Account | null> {
        const { accountId } = this.accountEnvironmentSecrets[secretKey] as EnvironmentAccount;
        return accountId != null ? await accountService.getAccountById(accountId) : null;
    }

    async getAccountByPublicKey(publicKey: string): Promise<Account | null> {
        const result = await db.knex.withSchema(db.schema()).select('*').from<Environment>(TABLE).where({ public_key: publicKey });

        if (result == null || result.length == 0 || result[0] == null) {
            return null;
        }

        return encryptionManager.decryptAccount(result[0]);
    }

    async getByAccountIdAndEnvironment(account_id: number, environment: string): Promise<Environment | null> {
        try {
            const result = await db.knex.withSchema(db.schema()).select('*').from<Environment>(TABLE).where({ account_id, name: environment });

            if (result == null || result.length == 0 || result[0] == null) {
                return null;
            }

            return encryptionManager.decryptEnvironment(result[0]);
        } catch (e) {
            console.log(e);
            return null;
        }
    }

    async createAccount(name: string): Promise<Account | null> {
        const result: void | Pick<Account, 'id'> = await db.knex.withSchema(db.schema()).from<Account>(`_nango_accounts`).insert({ name: name }, ['id']);

        if (Array.isArray(result) && result.length === 1 && result[0] != null && 'id' in result[0]) {
            const accountId = result[0]['id'];
            const account = await this.getAccountById(accountId);

            if (account != null) {
                const encryptedAccount = encryptionManager.encryptAccount(account);
                await db.knex.withSchema(db.schema()).from<Account>(`_nango_accounts`).where({ id: accountId }).update(encryptedAccount, ['id']);
                this.addToAccountSecretCache(account);
                return account;
            }
        }

        return null;
    }

    async editAccount(accountId: number, name: string, ownerId: number): Promise<Account | null> {
        return db.knex.withSchema(db.schema()).from<Account>(`_nango_accounts`).where({ id: accountId }).update({ name: name, owner_id: ownerId }, ['id']);
    }

    async editAccountCallbackUrl(callbackUrl: string, accountId: number): Promise<Account | null> {
        return db.knex.withSchema(db.schema()).from<Account>(`_nango_accounts`).where({ id: accountId }).update({ callback_url: callbackUrl }, ['id']);
    }

    async editAccountWebhookUrl(webhookUrl: string, accountId: number): Promise<Account | null> {
        return db.knex.withSchema(db.schema()).from<Account>(`_nango_accounts`).where({ id: accountId }).update({ webhook_url: webhookUrl }, ['id']);
    }

    async getWebhookUrl(accountId: number): Promise<string | null> {
        const result = await db.knex.withSchema(db.schema()).select('webhook_url').from<Account>(`_nango_accounts`).where({ id: accountId });

        if (result == null || result.length == 0 || result[0] == null) {
            return null;
        }

        return result[0].webhook_url;
    }
}

export default new EnvironmentAccountService();
