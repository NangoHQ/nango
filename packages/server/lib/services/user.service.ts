import db from '../db/database.js';
import type { User } from '../models.js';

class UserService {
    async getUserById(id: number): Promise<User | null> {
        let result = await db.knex.withSchema(db.schema()).select('*').from<User>(`_nango_users`).where({ id: id });

        if (result == null || result.length == 0 || result[0] == null) {
            return null;
        }

        return result[0];
    }

    async getUserByEmail(email: string): Promise<User | null> {
        let result = await db.knex.withSchema(db.schema()).select('*').from<User>(`_nango_users`).where({ email: email });

        if (result == null || result.length == 0 || result[0] == null) {
            return null;
        }

        return result[0];
    }

    async createUser(email: string, name: string, hashedPassword: string, salt: string, accountId: number): Promise<User | null> {
        let result: void | Pick<User, 'id'> = await db.knex
            .withSchema(db.schema())
            .from<User>(`_nango_users`)
            .insert({ email: email, name: name, hashed_password: hashedPassword, salt: salt, account_id: accountId }, ['id']);

        if (Array.isArray(result) && result.length === 1 && result[0] != null && 'id' in result[0]) {
            let userId = result[0]['id'];
            return this.getUserById(userId);
        }

        return null;
    }
}

export default new UserService();
