import db from '@nangohq/database';
import * as uuid from 'uuid';
import type { Result } from '@nangohq/utils';
import { isEnterprise, Ok, Err } from '@nangohq/utils';
import type { User, InviteUser, Account } from '../models/Admin.js';

const VERIFICATION_EMAIL_EXPIRATION = 3 * 24 * 60 * 60 * 1000;
const INVITE_EMAIL_EXPIRATION = 7 * 24 * 60 * 60 * 1000;

class UserService {
    async getUserById(id: number): Promise<User | null> {
        const result = await db.knex.select('*').from<User>(`_nango_users`).where({ id });

        if (result == null || result.length == 0 || result[0] == null) {
            return null;
        }

        if (result[0].suspended) {
            return null;
        }

        return result[0];
    }

    async getUserByUuid(uuid: string): Promise<User | null> {
        const result = await db.knex.select('*').from<User>(`_nango_users`).where({ uuid }).first();

        return result || null;
    }

    async getUserAndAccountByToken(token: string): Promise<Result<User & Account & { account_id: number; user_id: number }>> {
        const result = await db.knex
            .select('*', '_nango_accounts.id as account_id', '_nango_users.id as user_id')
            .from<User>(`_nango_users`)
            .join('_nango_accounts', '_nango_accounts.id', '_nango_users.account_id')
            .where({ email_verification_token: token })
            .first();

        if (result) {
            const expired = new Date(result.email_verification_token_expires_at).getTime() < new Date().getTime();
            if (expired) {
                return Err(new Error('token_expired'));
            }
        }

        return Ok(result) || Err(new Error('user_not_found'));
    }

    async refreshEmailVerificationToken(expiredToken: string): Promise<User | null> {
        const newToken = uuid.v4();
        const expires_at = new Date(new Date().getTime() + VERIFICATION_EMAIL_EXPIRATION);

        const result = await db.knex
            .from<User>(`_nango_users`)
            .where({ email_verification_token: expiredToken })
            .update({
                email_verification_token: newToken,
                email_verification_token_expires_at: expires_at
            })
            .returning('*');

        return result[0] || null;
    }

    async getUsersByAccountId(accountId: number): Promise<User[]> {
        const result = await db.knex.select('id', 'name', 'email', 'suspended').from<User>(`_nango_users`).where({ account_id: accountId });

        if (result == null || result.length == 0 || result[0] == null) {
            return [];
        }

        return result;
    }

    async getAnUserByAccountId(accountId: number): Promise<User | null> {
        const result = await db.knex
            .select('*')
            .from<User>(`_nango_users`)
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

    async getUserByEmail(email: string): Promise<User | null> {
        const result = await db.knex.select('*').from<User>(`_nango_users`).where({ email: email });

        if (result == null || result.length == 0 || result[0] == null) {
            return null;
        }

        return result[0];
    }

    async getUserByResetPasswordToken(link: string): Promise<User | null> {
        const result = await db.knex.select('*').from<User>(`_nango_users`).where({ reset_password_token: link });

        if (result == null || result.length == 0 || result[0] == null) {
            return null;
        }

        return result[0];
    }

    async createUser(
        email: string,
        name: string,
        hashed_password: string,
        salt: string,
        account_id: number,
        email_verified: boolean = true
    ): Promise<User | null> {
        const expires_at = new Date(new Date().getTime() + VERIFICATION_EMAIL_EXPIRATION);
        const result: Pick<User, 'id'>[] = await db.knex
            .from<User>('_nango_users')
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

    async editUserPassword(user: User) {
        return db.knex.from<User>(`_nango_users`).where({ id: user.id }).update({
            reset_password_token: user.reset_password_token,
            hashed_password: user.hashed_password
        });
    }

    async editUserName(name: string, id: number) {
        return db.knex.from<User>(`_nango_users`).where({ id }).update({ name, updated_at: new Date() });
    }

    async changePassword(newPassword: string, oldPassword: string, id: number) {
        return db.knex.from<User>(`_nango_users`).where({ id }).update({
            hashed_password: newPassword,
            salt: oldPassword
        });
    }

    async suspendUser(id: number) {
        if (id !== null && id !== undefined) {
            await db.knex.from<User>(`_nango_users`).where({ id }).update({ suspended: true, suspended_at: new Date() });
        }
    }

    async verifyUserEmail(id: number) {
        return db.knex.from<User>(`_nango_users`).where({ id }).update({ email_verified: true, email_verification_token: null });
    }

    async inviteUser(email: string, name: string, accountId: number, inviter_id: number) {
        const token = uuid.v4();
        const expires_at = new Date(new Date().getTime() + INVITE_EMAIL_EXPIRATION);

        const result = await db.knex
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

        const result = await db.knex.select('*').from<InviteUser>(`_nango_invited_users`).where({ account_id: accountId }).whereRaw('expires_at > ?', date);

        return result || [];
    }

    async getInvitedUserByToken(token: string): Promise<InviteUser | null> {
        const date = new Date();

        if (isEnterprise && process.env['NANGO_ADMIN_INVITE_TOKEN'] === token) {
            return {
                id: 1,
                email: '',
                name: '',
                account_id: 0,
                invited_by: 0,
                token: '',
                expires_at: new Date(),
                accepted: true
            };
        }
        const result = await db.knex.select('*').from<InviteUser>(`_nango_invited_users`).where({ token }).whereRaw('expires_at > ?', date);

        if (result == null || result.length == 0 || result[0] == null) {
            return null;
        }

        return result[0];
    }

    async markAcceptedInvite(token: string) {
        const result = await db.knex.from<InviteUser>(`_nango_invited_users`).where({ token }).update({ accepted: true });

        return result;
    }
}

export default new UserService();
