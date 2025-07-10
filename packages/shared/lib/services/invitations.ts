import * as uuid from 'uuid';

import db from '@nangohq/database';
import { isEnterprise } from '@nangohq/utils';

import type { Knex } from '@nangohq/database';
import type { DBInvitation } from '@nangohq/types';

const INVITE_EMAIL_EXPIRATION = 7 * 24 * 60 * 60 * 1000;

export async function expirePreviousInvitations({ email, accountId, trx }: { email: string; accountId: number; trx: Knex }) {
    const result = await trx
        .from<DBInvitation>(`_nango_invited_users`)
        .where({
            email,
            account_id: accountId,
            accepted: false
        })
        .update({
            expires_at: new Date(),
            updated_at: new Date()
        });
    return result;
}

export async function inviteEmail({
    email,
    name,
    accountId,
    invitedByUserId,
    trx
}: {
    email: string;
    name: string;
    accountId: number;
    invitedByUserId: number;
    trx: Knex;
}) {
    const token = uuid.v4();
    const expires_at = new Date(new Date().getTime() + INVITE_EMAIL_EXPIRATION);

    const result = await trx
        .from<DBInvitation>(`_nango_invited_users`)
        .insert({
            email,
            name,
            account_id: accountId,
            invited_by: invitedByUserId,
            token,
            expires_at
        })
        .returning('*');

    if (!result || result.length == 0 || result[0] == null) {
        return null;
    }

    return result[0];
}

export async function listInvitations({ accountId }: { accountId: number }): Promise<DBInvitation[]> {
    const date = new Date();

    const result = await db.knex
        .select('*')
        .from<DBInvitation>(`_nango_invited_users`)
        .where({ account_id: accountId, accepted: false })
        .whereRaw('expires_at > ?', date);

    return result || [];
}

export async function acceptInvitation(token: string) {
    return await db.knex.from<DBInvitation>(`_nango_invited_users`).where({ token }).update({ accepted: true, expires_at: new Date(), updated_at: new Date() });
}

export async function declineInvitation(token: string) {
    return await db.knex
        .from<DBInvitation>(`_nango_invited_users`)
        .where({ token })
        .update({ accepted: false, expires_at: new Date(), updated_at: new Date() });
}

export async function getInvitation(token: string): Promise<DBInvitation | null> {
    const now = new Date();

    if (isEnterprise && process.env['NANGO_ADMIN_INVITE_TOKEN'] === token) {
        return {
            id: 1,
            email: '',
            name: '',
            account_id: 0,
            invited_by: 0,
            token: '',
            expires_at: now,
            accepted: true,
            created_at: now,
            updated_at: now
        };
    }

    const result = await db.knex
        .select('*')
        .from<DBInvitation>(`_nango_invited_users`)
        .where({ token, accepted: false })
        .whereRaw('expires_at > ?', now)
        .first();

    return result || null;
}

export async function deleteExpiredInvitations({ limit, olderThan }: { limit: number; olderThan: number }): Promise<number> {
    const dateThreshold = new Date();
    dateThreshold.setDate(dateThreshold.getDate() - olderThan);

    return await db.knex
        .from<DBInvitation>('_nango_invited_users')
        .whereIn('id', function (sub) {
            sub.select('id').from<DBInvitation>('_nango_invited_users').where('expires_at', '<=', dateThreshold.toISOString()).limit(limit);
        })
        .delete();
}
