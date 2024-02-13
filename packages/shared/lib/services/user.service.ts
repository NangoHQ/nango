import db from '../db/database.js';
import * as uuid from 'uuid';
import type { User, InviteUser } from '../models/Admin.js';

class UserService {
    async getUserById(id: number): Promise<User | null> {
        const result = await db.knex.withSchema(db.schema()).select('*').from<User>(`_nango_users`).where({ id });

        if (result == null || result.length == 0 || result[0] == null) {
            return null;
        }

        if (result[0].suspended) {
            return null;
        }

        return result[0];
    }

    async getUsersByAccountId(accountId: number): Promise<User[]> {
        const result = await db.knex
            .withSchema(db.schema())
            .select('id', 'name', 'email', 'suspended')
            .from<User>(`_nango_users`)
            .where({ account_id: accountId });

        if (result == null || result.length == 0 || result[0] == null) {
            return [];
        }

        return result;
    }

    async getAnUserByAccountId(accountId: number): Promise<User | null> {
        const result = await db.knex
            .withSchema(db.schema())
            .select('*')
            .from<User>(`_nango_users`)
            .where({ account_id: accountId })
            .orderBy('id', 'asc')
            .limit(1);

        if (result == null || result.length == 0 || result[0] == null) {
            return null;
        }

        return result[0];
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
        const result: Pick<User, 'id'> = await db.knex
            .withSchema(db.schema())
            .from<User>(`_nango_users`)
            .insert({ email: email, name: name, hashed_password: hashedPassword, salt: salt, account_id: accountId }, ['id']);

        if (Array.isArray(result) && result.length === 1 && result[0] != null && 'id' in result[0]) {
            const userId = result[0]['id'];
            return this.getUserById(userId);
        }

        return null;
    }

    async editUserPassword(user: User) {
        return db.knex.withSchema(db.schema()).from<User>(`_nango_users`).where({ id: user.id }).update({
            reset_password_token: user.reset_password_token,
            hashed_password: user.hashed_password
        });
    }

    async editUserName(name: string, id: number) {
        return db.knex.withSchema(db.schema()).from<User>(`_nango_users`).where({ id }).update({ name, updated_at: new Date() });
    }

    async changePassword(newPassword: string, oldPassword: string, id: number) {
        return db.knex.withSchema(db.schema()).from<User>(`_nango_users`).where({ id }).update({
            hashed_password: newPassword,
            salt: oldPassword
        });
    }

    async suspendUser(id: number) {
        if (id !== null && id !== undefined) {
            await db.knex.withSchema(db.schema()).from<User>(`_nango_users`).where({ id }).update({ suspended: true, suspended_at: new Date() });
        }
    }

    async inviteUser(email: string, name: string, accountId: number, inviter_id: number) {
        const token = uuid.v4();
        const expires_at = new Date(new Date().getTime() + 7 * 24 * 60 * 60 * 1000);

        const result = await db.knex
            .withSchema(db.schema())
            .from<InviteUser>(`_nango_invited_users`)
            .insert({
                email,
                name,
                account_id: accountId,
                invited_by: inviter_id,
                token,
                expires_at
            })
            .returning('*');

        if (result == null || result.length == 0 || result[0] == null) {
            return null;
        }

        return result[0];
    }

    async getInvitedUsersByAccountId(accountId: number): Promise<InviteUser[]> {
        const date = new Date();

        const result = await db.knex
            .withSchema(db.schema())
            .select('*')
            .from<InviteUser>(`_nango_invited_users`)
            .where({ account_id: accountId })
            .whereRaw('expires_at > ?', date);

        return result || [];
    }

    async getInvitedUserByToken(token: string): Promise<InviteUser | null> {
        const date = new Date();

        const result = await db.knex
            .withSchema(db.schema())
            .select('*')
            .from<InviteUser>(`_nango_invited_users`)
            .where({ token })
            .whereRaw('expires_at > ?', date);

        if (result == null || result.length == 0 || result[0] == null) {
            return null;
        }

        return result[0];
    }

    async markAcceptedInvite(token: string) {
        const result = await db.knex.withSchema(db.schema()).from<InviteUser>(`_nango_invited_users`).where({ token }).update({ accepted: true });

        return result;
    }
}

export default new UserService();
