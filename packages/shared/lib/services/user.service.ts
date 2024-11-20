import db from '@nangohq/database';
import * as uuid from 'uuid';
import type { Result } from '@nangohq/utils';
import { Ok, Err } from '@nangohq/utils';
import type { DBUser } from '@nangohq/types';

const VERIFICATION_EMAIL_EXPIRATION = 3 * 24 * 60 * 60 * 1000;

class UserService {
    async getUserById(id: number): Promise<DBUser | null> {
        const result = await db.knex.select<DBUser>('*').from<DBUser>(`_nango_users`).where({ id, suspended: false }).first();

        return result || null;
    }

    async getUserByUuid(uuid: string): Promise<DBUser | null> {
        const result = await db.knex.select('*').from<DBUser>(`_nango_users`).where({ uuid }).first();

        return result || null;
    }

    async getUserByToken(token: string): Promise<Result<DBUser>> {
        const result = await db.knex.select<DBUser>('_nango_users.*').from<DBUser>(`_nango_users`).where({ email_verification_token: token }).first();

        if (result) {
            const expired = result.email_verification_token_expires_at
                ? new Date(result.email_verification_token_expires_at).getTime() < new Date().getTime()
                : false;
            if (expired) {
                return Err(new Error('token_expired'));
            }
            return Ok(result);
        }

        return Err(new Error('user_not_found'));
    }

    async refreshEmailVerificationToken(expiredToken: string): Promise<DBUser | null> {
        const newToken = uuid.v4();
        const expires_at = new Date(new Date().getTime() + VERIFICATION_EMAIL_EXPIRATION);

        const result = await db.knex
            .from<DBUser>(`_nango_users`)
            .where({ email_verification_token: expiredToken })
            .update({
                email_verification_token: newToken,
                email_verification_token_expires_at: expires_at
            })
            .returning('*');

        return result[0] || null;
    }

    async getUsersByAccountId(accountId: number): Promise<DBUser[]> {
        const result = await db.knex.select('*').from<DBUser>(`_nango_users`).where({ account_id: accountId, suspended: false });

        return result;
    }

    async countUsers(accountId: number): Promise<number> {
        const result = await db.knex
            .select(db.knex.raw('COUNT(id) as total'))
            .from<DBUser>(`_nango_users`)
            .where({ account_id: accountId, suspended: false })
            .first();

        return result.total ? parseInt(result.total, 10) : 0;
    }

    async getAnUserByAccountId(accountId: number): Promise<DBUser | null> {
        const result = await db.knex
            .select('*')
            .from<DBUser>(`_nango_users`)
            .where({
                account_id: accountId,
                suspended: false
            })
            .orderBy('id', 'asc')
            .limit(1);

        if (result == null || result.length == 0 || result[0] == null) {
            return null;
        }

        return result[0];
    }

    async getUserByEmail(email: string): Promise<DBUser | null> {
        const result = await db.knex.select('*').from<DBUser>(`_nango_users`).where({ email: email }).first();

        return result || null;
    }

    async getUserByResetPasswordToken(link: string): Promise<DBUser | null> {
        const result = await db.knex.select('*').from<DBUser>(`_nango_users`).where({ reset_password_token: link }).first();

        return result || null;
    }

    async createUser({
        email,
        name,
        hashed_password = '',
        salt = '',
        account_id,
        email_verified
    }: {
        email: string;
        name: string;
        hashed_password?: string;
        salt?: string;
        account_id: number;
        email_verified: boolean;
    }): Promise<DBUser | null> {
        const expires_at = new Date(new Date().getTime() + VERIFICATION_EMAIL_EXPIRATION);
        const result: Pick<DBUser, 'id'>[] = await db.knex
            .from<DBUser>('_nango_users')
            .insert({
                email,
                name,
                hashed_password,
                salt,
                account_id,
                email_verified,
                email_verification_token: email_verified ? null : uuid.v4(),
                email_verification_token_expires_at: email_verified ? null : expires_at
            })
            .returning('id');

        if (result.length === 1 && result[0]?.id) {
            const userId = result[0].id;
            return this.getUserById(userId);
        }

        return null;
    }

    async editUserPassword(user: Pick<DBUser, 'id' | 'reset_password_token' | 'hashed_password'>) {
        return db.knex.from<DBUser>(`_nango_users`).where({ id: user.id }).update({
            reset_password_token: user.reset_password_token,
            hashed_password: user.hashed_password
        });
    }

    async changePassword(newPassword: string, oldPassword: string, id: number) {
        return db.knex.from<DBUser>(`_nango_users`).where({ id }).update({
            hashed_password: newPassword,
            salt: oldPassword
        });
    }

    async suspendUser(id: number) {
        if (id !== null && id !== undefined) {
            await db.knex.from<DBUser>(`_nango_users`).where({ id }).update({ suspended: true, suspended_at: new Date() });
        }
    }

    async verifyUserEmail(id: number) {
        return db.knex.from<DBUser>(`_nango_users`).where({ id }).update({ email_verified: true, email_verification_token: null });
    }

    async update({ id, ...data }: { id: number } & Omit<Partial<DBUser>, 'id'>): Promise<DBUser | null> {
        const [up] = await db.knex
            .from<DBUser>(`_nango_users`)
            .update({ ...data, updated_at: new Date() })
            .where({ id })
            .returning('*');
        return up || null;
    }
}

export default new UserService();
