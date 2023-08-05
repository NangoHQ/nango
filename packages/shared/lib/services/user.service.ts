import db from '../db/database.js';
import type { User } from '../models/Admin.js';

class UserService {
    async getUserById(id: number): Promise<User | null> {
        const result = await db.knex.withSchema(db.schema()).select('*').from<User>(`_nango_users`).where({ id });

        if (result == null || result.length == 0 || result[0] == null) {
            return null;
        }

        return result[0];
    }

    async getUsersByAccountId(accountId: number): Promise<User[]> {
        const result = await db.knex.withSchema(db.schema()).select('*').from<User>(`_nango_users`).where({ account_id: accountId });

        if (result == null || result.length == 0 || result[0] == null) {
            return [];
        }

        return result;
    }

    async getByAccountId(accountId: number): Promise<User[]> {
        const result = await db.knex.withSchema(db.schema()).select('*').from<User>(`_nango_users`).where({ account_id: accountId });

        return result || [];
    }

    async getUserByEmail(email: string): Promise<User | null> {
        const result = await db.knex.withSchema(db.schema()).select('*').from<User>(`_nango_users`).where({ email: email });

        if (result == null || result.length == 0 || result[0] == null) {
            return null;
        }

        return result[0];
    }

    async getUserByResetPasswordToken(link: string): Promise<User | null> {
        const result = await db.knex.withSchema(db.schema()).select('*').from<User>(`_nango_users`).where({ reset_password_token: link });

        if (result == null || result.length == 0 || result[0] == null) {
            return null;
        }

        return result[0];
    }

    async createUser(email: string, name: string, hashedPassword: string, salt: string, accountId: number): Promise<User | null> {
        const result: void | Pick<User, 'id'> = await db.knex
            .withSchema(db.schema())
            .from<User>(`_nango_users`)
            .insert({ email: email, name: name, hashed_password: hashedPassword, salt: salt, account_id: accountId }, ['id']);

        if (Array.isArray(result) && result.length === 1 && result[0] != null && 'id' in result[0]) {
            const userId = result[0]['id'];
            return this.getUserById(userId);
        }

        return null;
    }

    async editUser(user: User) {
        return db.knex.withSchema(db.schema()).from<User>(`_nango_users`).where({ id: user.id }).update({
            reset_password_token: user.reset_password_token,
            hashed_password: user.hashed_password
        });
    }
}

export default new UserService();
