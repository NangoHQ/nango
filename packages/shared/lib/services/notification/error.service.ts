import type { Knex } from 'knex';
import type { ActiveLog } from '@nangohq/types';
import { Ok, Err } from '@nangohq/utils';
import type { Result } from '@nangohq/utils';

import db from '@nangohq/database';

const DB_TABLE = '_nango_active_logs';
const SYNC_TABLE = '_nango_syncs';

type ErrorNotification = Required<Pick<ActiveLog, 'type' | 'action' | 'connection_id' | 'log_id' | 'active'>>;
type SyncErrorNotification = ErrorNotification & Required<Pick<ActiveLog, 'sync_id'>>;

export const errorNotificationService = {
    auth: {
        create: async ({ type, action, connection_id, log_id, active }: ErrorNotification): Promise<Result<ActiveLog>> => {
            return await db.knex.transaction(async (trx) => {
                await errorNotificationService.auth.clear({ connection_id, trx });
                const created = await trx
                    .from<ActiveLog>(DB_TABLE)
                    .insert({
                        type,
                        action,
                        connection_id,
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
        clear: async ({ connection_id, trx = db.knex }: { connection_id: ActiveLog['connection_id']; trx?: Knex.Transaction | Knex }): Promise<void> => {
            await trx.from<ActiveLog>(DB_TABLE).where({ type: 'auth', connection_id }).delete();
        }
    },
    sync: {
        create: async ({ type, action, sync_id, connection_id, log_id, active }: SyncErrorNotification): Promise<Result<ActiveLog>> => {
            return await db.knex.transaction(async (trx) => {
                await errorNotificationService.sync.clear({ sync_id, connection_id, trx });
                const created = await trx
                    .from<ActiveLog>(DB_TABLE)
                    .insert({
                        type,
                        action,
                        sync_id,
                        connection_id,
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
            trx = db.knex
        }: {
            sync_id: ActiveLog['sync_id'];
            connection_id: ActiveLog['connection_id'];
            trx?: Knex.Transaction | Knex;
        }): Promise<void> => {
            await trx.from<ActiveLog>(DB_TABLE).where({ type: 'sync', sync_id, connection_id }).delete();
        },
        clearBySyncId: async ({ sync_id }: Pick<SyncErrorNotification, 'sync_id'>): Promise<void> => {
            await db.knex.from<ActiveLog>(DB_TABLE).where({ type: 'sync', sync_id }).delete();
        },
        /**
         * Clear By Sync Config Id
         * @description Clear all sync notifications by sync config id. This is used
         * when disabling a sync at the integration level. Any active logs are
         * no longer relevant because the sync is disabled.
         */
        clearBySyncConfig: async ({ sync_config_id }: { sync_config_id: number }): Promise<void> => {
            const query = db.knex
                .from<ActiveLog>(DB_TABLE)
                .join(SYNC_TABLE, `${SYNC_TABLE}.id`, '=', `${DB_TABLE}.sync_id`)
                .where({ type: 'sync', active: true })
                .andWhere({ [`${SYNC_TABLE}.sync_config_id`]: sync_config_id, [`${SYNC_TABLE}.deleted`]: false });

            await query.delete();
        }
    }
};
