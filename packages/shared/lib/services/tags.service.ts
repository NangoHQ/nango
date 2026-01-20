import { Err, Ok } from '@nangohq/utils';

import type { Knex } from '@nangohq/database';
import type { ConnectSession, DBConnection, DBEnvironment, DBTeam, Result, Tags } from '@nangohq/types';

export async function updateConnectionTags(
    db: Knex,
    { connection, tags }: { connection: Pick<DBConnection, 'id'>; account: DBTeam; environment: DBEnvironment; tags: Tags }
): Promise<Result<boolean>> {
    return await db<DBConnection>('_nango_connections').where({ id: connection.id }).update({ tags });
}

export async function syncTagsToConnection(
    db: Knex,
    {
        connectSession,
        connection,
        account,
        environment
    }: { connectSession: ConnectSession; connection: DBConnection; account: DBTeam; environment: DBEnvironment }
): Promise<Result<boolean>> {
    if (!connectSession.tags) {
        return Ok(false);
    }
    const updateRes = await updateConnectionTags(db, {
        account,
        environment,
        connection,
        tags: connectSession.tags
    });
    // TODO: Error handling
    // if (updateRes.isErr()) {
    // return Err(updateRes.error);
    // }

    if (!updateRes) {
        return Err('Failed to update connection tags');
    }

    // Mutate the connection object so callers have the updated tags
    connection.tags = connectSession.tags;

    return Ok(true);
}
