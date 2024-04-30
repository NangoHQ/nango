import { logger } from '../utils.js';
import { client } from './client.js';
import { indices } from './schema.js';

export async function start() {
    logger.info('🔄 OpenSearch service starting...');

    await migrateMapping();

    logger.info('✅ OpenSearch');
}

export async function migrateMapping() {
    try {
        await Promise.all(
            indices.map(async (index) => {
                logger.info(`Migrating index "${index.index}"...`);
                const exists = await client.indices.exists({ index: index.index });
                if (!exists.body) {
                    logger.info(`  creating index "${index.index}"...`);
                    await client.indices.create({ index: index.index, body: index.body! });
                }

                logger.info(`  mapping index "${index.index}"...`);
                return await client.indices.putMapping({ index: index.index, body: index.body!.mappings! }, { ignore: [404] });
            })
        );
    } catch (err) {
        logger.error(err);
        throw new Error('failed_to_init_opensearch');
    }
}

export async function deleteIndex() {
    try {
        await Promise.all(
            indices.map(async (index) => {
                await client.indices.delete({
                    index: index.index,
                    ignore_unavailable: true
                });
            })
        );
    } catch (err) {
        logger.error(err);
        throw new Error('failed_to_deleteIndex');
    }
}
