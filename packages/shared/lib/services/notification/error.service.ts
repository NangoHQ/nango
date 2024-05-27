import type { UINotification } from '@nangohq/types';
import { Ok, Err } from '@nangohq/utils';
import type { Result } from '@nangohq/utils';

import db from '../../db/database.js';

const DB_TABLE = '_nango_ui_notifications';

interface AuthNotification {
    type: string;
    action: string;
    connection_id: number;
    activity_log_id: number;
    log_id: string;
    active: boolean;
}

interface SyncNotification extends AuthNotification {
    sync_id: string;
}

export const errorNotificationService = {
    auth: {
        create: async ({ type, action, connection_id, activity_log_id, log_id, active }: AuthNotification): Promise<Result<UINotification>> => {
            await errorNotificationService.auth.invalidate({ connection_id });
            const created = await db.knex
                .from<UINotification>(DB_TABLE)
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
        },
        invalidate: async ({ connection_id }: Required<Pick<AuthNotification, 'connection_id'>>): Promise<void> => {
            await db.knex.from<UINotification>(DB_TABLE).where({ type: 'auth', connection_id }).update({ active: false });
        }
    },
    sync: {
        create: async ({ type, action, sync_id, connection_id, activity_log_id, log_id, active }: SyncNotification): Promise<Result<UINotification>> => {
            await errorNotificationService.sync.invalidate({ sync_id, connection_id });
            const created = await db.knex
                .from<UINotification>(DB_TABLE)
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
        },
        invalidate: async ({ sync_id, connection_id }: Required<Pick<SyncNotification, 'sync_id' | 'connection_id'>>): Promise<void> => {
            await db.knex.from<UINotification>(DB_TABLE).where({ type: 'sync', sync_id, connection_id }).update({ active: false });
        }
    }
};
