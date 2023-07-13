import db from '../db/database.js';
import type { Account } from '../models/Admin';

class AccountService {
    async getAccountById(id: number): Promise<Account | null> {
        try {
            const result = await db.knex.withSchema(db.schema()).select('*').from<Account>(`_nango_accounts`).where({ id: id });

            if (result == null || result.length == 0 || result[0] == null) {
                return null;
            }

            return result[0];
        } catch (e) {
            console.log(e);
            return null;
        }
    }

    async editAccount(accountId: number, name: string, ownerId: number): Promise<Account | null> {
        return db.knex.withSchema(db.schema()).from<Account>(`_nango_accounts`).where({ id: accountId }).update({ name: name, owner_id: ownerId }, ['id']);
    }
}

export default new AccountService();
