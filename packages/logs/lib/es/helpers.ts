import { client } from './client.js';
import { indices } from './schema.js';
import { logger } from '@nangohq/shared';

export async function migrateMapping() {
    try {
        console.log('on mapping', indices);
        await Promise.all(
            indices.map((index) => {
                return client.indices.create(index, { ignore: [400] });
            })
        );
    } catch (err) {
        logger.error(err);
        throw new Error('failed_to_init_elasticsearch');
    }
}
