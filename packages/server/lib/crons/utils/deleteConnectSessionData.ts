import db from '@nangohq/database';

import { batchDelete } from './batchDelete.js';

import type { BatchDeleteSharedOptions } from './batchDelete.js';
import type { DBConnectSession } from '../../services/connectSession.service.js';
import type { OAuthSession } from '@nangohq/shared';

export async function deleteConnectSessionData(connectSession: DBConnectSession, opts: BatchDeleteSharedOptions) {
    const { logger } = opts;
    logger.info('Deleting connect session...', connectSession.id);

    await batchDelete({
        ...opts,
        name: 'oauth_sessions < connect_session',
        deleteFn: async () => {
            const oauthSessionsDeletedCount = await db.knex
                .from<OAuthSession>('_nango_oauth_sessions')
                .where({ connectSessionId: connectSession.id })
                .limit(opts.limit)
                .delete();

            return oauthSessionsDeletedCount;
        }
    });

    await db.knex.from<DBConnectSession>('connect_sessions').where({ id: connectSession.id }).delete();
}
