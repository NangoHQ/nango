import { Err, Ok } from '@nangohq/utils';

import { validateTags } from './tags/utils.js';

import type { Knex } from '@nangohq/database';
import type { ConnectSession, DBConnection, Result, Tags } from '@nangohq/types';

export { normalizeTags, validateTags } from './tags/utils.js';

type ConnectionWithTags = Pick<DBConnection, 'id' | 'tags'>;

/**
 * Validates, normalizes, and updates tags for a connection.
 * Mutates the connection object with the normalized tags and returns it.
 */
export async function updateConnectionTags<T extends ConnectionWithTags>(db: Knex, { connection, tags }: { connection: T; tags: Tags }): Promise<Result<T>> {
    const validation = validateTags(tags);
    if (!validation.valid) {
        return Err(validation.error);
    }

    await db<DBConnection>('_nango_connections').where({ id: connection.id }).update({ tags: validation.tags });

    // Mutate the connection object with the normalized tags
    connection.tags = validation.tags;

    return Ok(connection);
}

/**
 * Syncs tags from a connect session to a connection.
 * If the session has tags, updates the connection with normalized tags.
 */
export async function syncTagsToConnection<T extends ConnectionWithTags>(
    db: Knex,
    { connectSession, connection }: { connectSession: ConnectSession; connection: T }
): Promise<Result<T | null>> {
    if (Object.keys(connectSession.tags).length === 0) {
        return Ok(null);
    }

    return await updateConnectionTags(db, { connection, tags: connectSession.tags });
}
