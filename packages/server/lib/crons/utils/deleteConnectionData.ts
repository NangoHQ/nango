import db from '@nangohq/database';
import { connectionService } from '@nangohq/shared';

import { batchDelete } from './batchDelete.js';
import { deleteConnectSessionData } from './deleteConnectSessionData.js';
import { deleteSyncData } from './deleteSyncData.js';

import type { BatchDeleteSharedOptions } from './batchDelete.js';
import type { DBConnectSession } from '../../services/connectSession.service.js';
import type { Sync } from '@nangohq/shared';
import type { DBConnection, DBSyncConfig } from '@nangohq/types';

export async function deleteConnectionData(connection: DBConnection, opts: BatchDeleteSharedOptions) {
    const { logger } = opts;
    logger.info('Deleting connection...', connection.id, connection.connection_id);

    const resSyncs = await db.knex
        .select<
            {
                sync: Sync;
                syncConfig: DBSyncConfig;
            }[]
        >(db.knex.raw('row_to_json(_nango_syncs.*) as sync'), db.knex.raw('row_to_json(_nango_sync_configs.*) as "syncConfig"'))
        .from<Sync>('_nango_syncs')
        .join('_nango_sync_configs', '_nango_sync_configs.id', '_nango_syncs.sync_config_id')
        .where({ nango_connection_id: connection.id });

    for (const res of resSyncs) {
        await deleteSyncData(res.sync, res.syncConfig, opts);
    }

    await batchDelete({
        ...opts,
        name: 'connect_sessions < connection',
        deleteFn: async () => {
            const connectSessions = await db.knex.from<DBConnectSession>('connect_sessions').where({ connection_id: connection.id }).limit(opts.limit);

            for (const connectSession of connectSessions) {
                await deleteConnectSessionData(connectSession, opts);
            }

            return connectSessions.length;
        }
    });

    await connectionService.hardDelete(connection.id);
}
