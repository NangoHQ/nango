import type { Knex } from 'knex';
import type { ActiveLog } from '@nangohq/types';
import { Ok, Err } from '@nangohq/utils';
import type { Result } from '@nangohq/utils';

import db from '../../db/database.js';

const DB_TABLE = '_nango_active_logs';

type ErrorNotification = Required<Pick<ActiveLog, 'type' | 'action' | 'connection_id' | 'activity_log_id' | 'log_id' | 'active'>>;
type SyncErrorNotification = ErrorNotification & Required<Pick<ActiveLog, 'sync_id'>>;

export const errorNotificationService = {
    auth: {
        create: async ({ type, action, connection_id, activity_log_id, log_id, active }: ErrorNotification): Promise<Result<ActiveLog>> => {
            return await db.knex.transaction(async (trx) => {
                await errorNotificationService.auth.clear({ connection_id, trx });
                const created = await trx
                    .from<ActiveLog>(DB_TABLE)
                    .insert({
                        type,
                        action,
                        connection_id,
                        activity_log_id,
                        log_id,
                        active
                    })
                    .returning('*');

                if (created?.[0]) {
                    return Ok(created[0]);
                } else {
                    return Err('Failed to create notification');
                }
            });
        },
        get: async (id: number): Promise<ActiveLog | null> => {
            return await db.knex.from<ActiveLog>(DB_TABLE).where({ type: 'auth', connection_id: id, active: true }).first();
        },
        clear: async ({ connection_id, trx }: { connection_id: ActiveLog['connection_id']; trx?: Knex.Transaction }): Promise<void> => {
            if (trx) {
                await trx.from<ActiveLog>(DB_TABLE).where({ type: 'auth', connection_id }).delete();
            } else {
                await db.knex.from<ActiveLog>(DB_TABLE).where({ type: 'auth', connection_id }).delete();
            }
        }
    },
    sync: {
        create: async ({ type, action, sync_id, connection_id, activity_log_id, log_id, active }: SyncErrorNotification): Promise<Result<ActiveLog>> => {
            return await db.knex.transaction(async (trx) => {
                await errorNotificationService.sync.clear({ sync_id, connection_id, trx });
                const created = await trx
                    .from<ActiveLog>(DB_TABLE)
                    .insert({
                        type,
                        action,
                        sync_id,
                        connection_id,
                        activity_log_id,
                        log_id,
                        active
                    })
                    .returning('*');

                if (created?.[0]) {
                    return Ok(created[0]);
                } else {
                    return Err('Failed to create notification');
                }
            });
        },
        clear: async ({
            sync_id,
            connection_id,
            trx
        }: {
            sync_id: ActiveLog['sync_id'];
            connection_id: ActiveLog['connection_id'];
            trx?: Knex.Transaction;
        }): Promise<void> => {
            if (trx) {
                await trx.from<ActiveLog>(DB_TABLE).where({ type: 'sync', sync_id, connection_id }).delete();
            } else {
                await db.knex.from<ActiveLog>(DB_TABLE).where({ type: 'sync', sync_id, connection_id }).delete();
            }
        },
        clearBySyncId: async ({ sync_id }: Pick<SyncErrorNotification, 'sync_id'>): Promise<void> => {
            await db.knex.from<ActiveLog>(DB_TABLE).where({ type: 'sync', sync_id }).delete();
        }
    }
};
