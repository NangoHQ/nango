import db from '@nangohq/database';
import { accountService, userService } from '@nangohq/shared';

import type { DBUser } from '@nangohq/types';
import type { Knex } from 'knex';

/** Refresh the principal from database truth for both dashboard and OAuth authorization sessions. */
export async function loadSessionIdentity(userId: number, accountId?: number, trx: Knex = db.knex) {
    const user = trx === db.knex ? await userService.getUserById(userId, true) : await trx<DBUser>('_nango_users').where({ id: userId }).first();
    if (!user || user.suspended || (accountId !== undefined && user.account_id !== accountId)) return null;
    const account = await accountService.getAccountById(trx, user.account_id);
    return account ? { user, account } : null;
}
