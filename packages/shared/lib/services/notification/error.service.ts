import db from '@nangohq/database';
import { Err, Ok } from '@nangohq/utils';

import type { ActiveLog } from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type { Knex } from 'knex';

const DB_TABLE = '_nango_active_logs';
const SYNC_TABLE = '_nango_syncs';
const SYNC_CONFIG_TABLE = '_nango_sync_configs';

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
        clear: async ({ connection_id, trx = db.knex }: { connection_id: ActiveLog['connection_id']; trx?: Knex.Transaction | Knex }): Promise<number> => {
            const deletedCount = await trx.from<ActiveLog>(DB_TABLE).where({ type: 'auth', connection_id, active: true }).delete();
            return deletedCount;
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
        clearBySyncId: async ({ sync_id, trx = db.knex }: Pick<SyncErrorNotification, 'sync_id'> & { trx?: Knex.Transaction | Knex }): Promise<void> => {
            await trx.from<ActiveLog>(DB_TABLE).where({ type: 'sync', sync_id }).delete();
        },
        clearBySyncIds: async ({ sync_ids, trx = db.knex }: { sync_ids: string[]; trx?: Knex.Transaction | Knex }): Promise<void> => {
            if (sync_ids.length === 0) {
                return;
            }
            await trx.from<ActiveLog>(DB_TABLE).where({ type: 'sync' }).whereIn('sync_id', sync_ids).delete();
        },
        /**
         * Clear By Sync Config Id
         * @description Clear all sync notifications by sync config id. This is used
         * when disabling a sync at the integration level. Any active logs are
         * no longer relevant because the sync is disabled.
         * Scoped to the environment so a sync config id from another
         * environment or account never matches.
         */
        clearBySyncConfig: async ({ sync_config_id, environment_id }: { sync_config_id: number; environment_id: number }): Promise<void> => {
            const query = db.knex
                .from<ActiveLog>(DB_TABLE)
                .join(SYNC_TABLE, `${SYNC_TABLE}.id`, '=', `${DB_TABLE}.sync_id`)
                .join(SYNC_CONFIG_TABLE, `${SYNC_CONFIG_TABLE}.id`, '=', `${SYNC_TABLE}.sync_config_id`)
                .where({ [`${DB_TABLE}.type`]: 'sync', [`${DB_TABLE}.active`]: true })
                .andWhere({
                    [`${SYNC_TABLE}.sync_config_id`]: sync_config_id,
                    [`${SYNC_TABLE}.deleted`]: false,
                    [`${SYNC_CONFIG_TABLE}.environment_id`]: environment_id
                });

            await query.delete();
        }
    }
};
