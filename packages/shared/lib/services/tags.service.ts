import { Err, Ok } from '@nangohq/utils';

import { connectionTagsSchema } from './tags/schema.js';

import type { Knex } from '@nangohq/database';
import type { DBConnection, Result, Tags } from '@nangohq/types';

export { TAG_KEY_MAX_LENGTH, TAG_MAX_COUNT, TAG_VALUE_MAX_LENGTH, connectionTagsKeySchema, connectionTagsSchema } from './tags/schema.js';

type ConnectionWithTags = Pick<DBConnection, 'id' | 'tags'>;

/**
 * Validates, normalizes, and updates tags for a connection.
 * Mutates the connection object with the normalized tags and returns it.
 */
export async function updateConnectionTags<T extends ConnectionWithTags>(db: Knex, { connection, tags }: { connection: T; tags: Tags }): Promise<Result<T>> {
    const result = connectionTagsSchema.safeParse(tags);
    if (!result.success) {
        return Err(result.error.issues[0]?.message ?? 'Invalid tags');
    }

    await db<DBConnection>('_nango_connections').where({ id: connection.id }).update({ tags: result.data });

    // Mutate the connection object with the normalized tags
    connection.tags = result.data;

    return Ok(connection);
}
