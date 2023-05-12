import db from '../db/database.js';
import { Account, encryptionManager } from '@nangohq/shared';

class AccountService {
    private accountSecrets: { [key: string]: number } = {};

    async cacheAccountSecrets(): Promise<void> {
        let accounts = await db.knex.withSchema(db.schema()).select('*').from<Account>(`_nango_accounts`);

        let accountSecrets: { [key: string]: number } = {};

        for (let account of accounts) {
            let decryptedAccount = encryptionManager.decryptAccount(account);

            if (decryptedAccount != null) {
                accountSecrets[decryptedAccount.secret_key] = decryptedAccount.id;
            }
        }

        this.accountSecrets = accountSecrets;
    }

    private addToAccountSecretCache(account: Account) {
        this.accountSecrets[account.secret_key] = account.id;
    }

    async getAccountBySecretKey(secretKey: string): Promise<Account | null> {
        let accountId = this.accountSecrets[secretKey];
        return accountId != null ? await this.getAccountById(accountId) : null;
    }

    async getAccountByPublicKey(publicKey: string): Promise<Account | null> {
        let result = await db.knex.withSchema(db.schema()).select('*').from<Account>(`_nango_accounts`).where({ public_key: publicKey });

        if (result == null || result.length == 0 || result[0] == null) {
            return null;
        }

        return encryptionManager.decryptAccount(result[0]);
    }

    async getAccountById(id: number): Promise<Account | null> {
        let result = await db.knex.withSchema(db.schema()).select('*').from<Account>(`_nango_accounts`).where({ id: id });

        if (result == null || result.length == 0 || result[0] == null) {
            return null;
        }

        return encryptionManager.decryptAccount(result[0]);
    }

    async createAccount(name: string): Promise<Account | null> {
        let result: void | Pick<Account, 'id'> = await db.knex.withSchema(db.schema()).from<Account>(`_nango_accounts`).insert({ name: name }, ['id']);

        if (Array.isArray(result) && result.length === 1 && result[0] != null && 'id' in result[0]) {
            let accountId = result[0]['id'];
            let account = await this.getAccountById(accountId);

            if (account != null) {
                let encryptedAccount = encryptionManager.encryptAccount(account);
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
}

export default new AccountService();
