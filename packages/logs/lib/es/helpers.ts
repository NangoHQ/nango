import { client } from './client.js';
import { indices } from './schema.js';
import { logger } from '@nangohq/shared';

export async function migrateMapping() {
    try {
        await Promise.all(
            indices.map((index) => {
                return client.indices.putMapping({ index: index.index, properties: index.mappings!.properties }, { ignore: [404] });
            })
        );
    } catch (err) {
        logger.error(err);
        throw new Error('failed_to_init_elasticsearch');
    }
}
