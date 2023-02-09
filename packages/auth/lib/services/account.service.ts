import type { Account } from '../models.js';
import db from '../db/database.js';

class AccountService {
    async getAccountBySecret(secret: string): Promise<Account | null> {
        let result = await db.knex.withSchema(db.schema()).select('*').from<Account>(`_nango_accounts`).where({ secret_key: secret });

        if (result == null || result.length == 0 || result[0] == null) {
            return null;
        }

        return result[0];
    }

    async getAccountByPublicKey(publicKey: string): Promise<Account | null> {
        let result = await db.knex.withSchema(db.schema()).select('*').from<Account>(`_nango_accounts`).where({ public_key: publicKey });

        if (result == null || result.length == 0 || result[0] == null) {
            return null;
        }

        return result[0];
    }

    async getAccountByEmail(email: string): Promise<Account | null> {
        let result = await db.knex.withSchema(db.schema()).select('*').from<Account>(`_nango_accounts`).where({ email: email });

        if (result == null || result.length == 0 || result[0] == null) {
            return null;
        }

        return result[0];
    }

    async getAccountById(id: number): Promise<Account | null> {
        let result = await db.knex.withSchema(db.schema()).select('*').from<Account>(`_nango_accounts`).where({ id: id });

        if (result == null || result.length == 0 || result[0] == null) {
            return null;
        }

        return result[0];
    }

    async createAccount(email: string): Promise<Account | null> {
        let result: void | Pick<Account, 'id'> = await db.knex.withSchema(db.schema()).from<Account>(`_nango_accounts`).insert({ email: email }, ['id']);

        if (Array.isArray(result) && result.length === 1 && result[0] != null && 'id' in result[0]) {
            let accountId = result[0]['id'];
            return await this.getAccountById(accountId);
        }

        return null;
    }
}

export default new AccountService();
