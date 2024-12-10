import type { InternalNango as Nango } from './post-connection.js';
import { getLogger } from '@nangohq/utils';

export default async function execute(nango: Nango) {
    const user = await nango.getDbUser();
    const connection = await nango.getConnection();

    if (user === null) {
        const logger = getLogger('post-connection:harvest');
        logger.info('No user with email found for post-connection logic');
        return;
    }

    const emailConnection = `${connection.connection_id}-${user.email}`;
    await nango.updateConnectionConfig({ emailConnection });
}
