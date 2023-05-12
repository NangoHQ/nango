import type { Connection, StoredConnection } from '../models/Connection.js';
import { schema } from '../database.js';

export async function getConnectionById(id: number): Promise<Pick<Connection, 'id' | 'connection_id' | 'provider_config_key' | 'account_id'> | null> {
    const result = await schema()
        .select('id', 'connection_id', 'provider_config_key', 'account_id')
        .from<StoredConnection>('_nango_connections')
        .where({ id: id });

    if (!result || result.length == 0 || !result[0]) {
        return null;
    }

    return result[0];
}
