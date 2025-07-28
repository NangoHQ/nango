import { isTest } from '@nangohq/utils';

import { envs } from '../env.js';
import { logger } from '../utils.js';
import { client } from './client.js';
import { getDailyIndexPipeline, indexMessages, indexOperations, policyMessages, policyOperations } from './schema.js';
import { getFormattedMessage, getFormattedOperation } from '../models/helpers.js';
import { createMessage } from '../models/messages.js';
import { createOperation } from '../models/operations.js';

export async function start() {
    if (!envs.NANGO_LOGS_ENABLED) {
        logger.warning('Elasticsearch is disabled, skipping');
        return;
    }

    logger.info('🔄 Elasticsearch service starting...');

    await migrateMapping();

    logger.info('✅ Elasticsearch');
}

export async function migrateMapping() {
    try {
        for (const index of [indexMessages, indexOperations]) {
            logger.info(`Migrating index "${index.index}"...`);
            const isMessages = index.index.includes('messages');

            // -- Policy
            logger.info(`  Updating policy`);
            await client.ilm.putLifecycle(isMessages ? policyMessages : policyOperations);

            // -- Index
            const existsTemplate = await client.indices.existsIndexTemplate({ name: `${index.index}-template` });
            logger.info(`  ${existsTemplate ? 'updating' : 'creating'} index template "${index.index}"...`);

            await client.indices.putIndexTemplate({
                name: `${index.index}-template`,
                index_patterns: `${index.index}.*`,
                template: {
                    settings: index.settings!,
                    mappings: index.mappings!,
                    aliases: { [index.index]: {} }
                }
            });

            // -- Pipeline
            // Pipeline will automatically create an index based on a field
            // In our case we create a daily index based on "createdAt"
            logger.info(`  Updating pipeline`);
            await client.ingest.putPipeline(getDailyIndexPipeline(index.index));

            const existsAlias = await client.indices.exists({ index: index.index });
            if (!existsAlias) {
                // insert a dummy record to create first index
                logger.info(`  Inserting dummy record`);
                if (index.index.includes('messages')) {
                    await createMessage(getFormattedMessage({ parentId: '-1', accountId: 0 }));
                } else {
                    await createOperation(getFormattedOperation({ id: '-1', accountId: 0, operation: { type: 'sync', action: 'run' } }));
                }
            }
        }
    } catch (err) {
        logger.error(err);
        throw new Error('failed_to_init_elasticsearch');
    }
}

export async function deleteIndex({ prefix }: { prefix: string }) {
    if (!isTest) {
        throw new Error('Trying to delete stuff in prod');
    }

    try {
        const indices = await client.cat.indices({ format: 'json' });
        await Promise.all(
            indices.map(async (index) => {
                if (!index.index?.startsWith(prefix)) {
                    return;
                }

                await client.indices.delete({ index: index.index, ignore_unavailable: true });
            })
        );
    } catch (err) {
        logger.error(err);
        throw new Error('failed_to_deleteIndex');
    }
}
