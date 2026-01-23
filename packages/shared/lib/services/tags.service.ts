import { Err, Ok } from '@nangohq/utils';

import { validateTags } from './tags/utils.js';

import type { Knex } from '@nangohq/database';
import type { DBConnection, Result, Tags } from '@nangohq/types';

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
