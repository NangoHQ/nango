import type { Knex } from '@nangohq/database';
import db from '@nangohq/database';
import type { DBInvitation } from '@nangohq/types';
import * as uuid from 'uuid';

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

    const result = await db.knex.select('*').from<DBInvitation>(`_nango_invited_users`).where({ account_id: accountId }).whereRaw('expires_at > ?', date);

    return result || [];
}
