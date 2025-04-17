import db from '@nangohq/database';

import { batchDelete } from './batchDelete.js';
import { deleteConnectionData } from './deleteConnectionData.js';

import type { BatchDeleteSharedOptions } from './batchDelete.js';
import type { DBConnection, DBEndUser } from '@nangohq/types';

export async function deleteEndUserData(endUser: DBEndUser, opts: BatchDeleteSharedOptions) {
    const { logger } = opts;
    logger.info('Deleting end user...', endUser.id, endUser.email);

    await batchDelete({
        ...opts,
        name: 'connections < end_user',
        deleteFn: async () => {
            const connections = await db.knex.from<DBConnection>('_nango_connections').where({ end_user_id: endUser.id }).limit(opts.limit);

            for (const connection of connections) {
                await deleteConnectionData(connection, opts);
            }

            return connections.length;
        }
    });
}
