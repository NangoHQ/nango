import db from '../db/database.js';
import type { Account } from '../models/Admin';
import { LogActionEnum } from '../models/Activity.js';
import errorManager, { ErrorSourceEnum } from '../utils/error.manager.js';

class AccountService {
    async getAccountById(id: number): Promise<Account | null> {
        try {
            const result = await db.knex.withSchema(db.schema()).select('*').from<Account>(`_nango_accounts`).where({ id: id });

            if (result == null || result.length == 0 || result[0] == null) {
                return null;
            }

            return result[0];
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
            await db.knex.withSchema(db.schema()).update({ name, updated_at: new Date() }).from<Account>(`_nango_accounts`).where({ id });
        } catch (e) {
            errorManager.report(e, {
                source: ErrorSourceEnum.PLATFORM,
                operation: LogActionEnum.DATABASE,
                accountId: id
            });
        }
    }
}

export default new AccountService();
