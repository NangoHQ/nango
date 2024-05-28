import { envs } from '../env.js';
import { logContextGetter } from '../models/logContextGetter.js';
import { logger } from '../utils.js';
import { client } from './client.js';
import { getDailyIndexPipeline, indexMessages, policyRetention } from './schema.js';

export async function start() {
    if (!envs.NANGO_LOGS_ENABLED) {
        logger.warning('OpenSearch is disabled, skipping');
        return;
    }

    logger.info('🔄 OpenSearch service starting...');

    await migrateMapping();

    logger.info('✅ OpenSearch');
}

export async function migrateMapping() {
    try {
        const index = indexMessages;

        logger.info(`Migrating index "${index.index}"...`);

        // -- Policy
        logger.info(`  Updating policy`);
        await client.ilm.putLifecycle(policyRetention());

        // -- Index
        const exists = await client.indices.existsIndexTemplate({ name: `${index.index}-template` });
        logger.info(`  ${exists ? 'updating' : 'creating'} index template "${index.index}"...`);

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
        // Pipeline will automatically create an index base on a field
        // In our case we create a daily index based on "createdAt"
        logger.info(`  Updating pipeline`);
        await client.ingest.putPipeline(getDailyIndexPipeline(index.index));

        const ctx = await logContextGetter.create(
            { message: 'coucou', operation: { type: 'action' } },
            { account: { id: 1, name: 'a' }, environment: { id: 1, name: 'a' } }
        );
        await ctx.info('prout');
        await ctx.enrichOperation({ integrationId: 1 });
        await ctx.failed();

        await logContextGetter.create(
            { message: 'coucou', operation: { type: 'action' }, createdAt: '2024-05-08T12:51:32.213Z' },
            { account: { id: 1, name: 'a' }, environment: { id: 1, name: 'a' } }
        );
    } catch (err) {
        logger.error(err);
        throw new Error('failed_to_init_elasticsearch');
    }
}

export async function deleteIndex() {
    try {
        await client.indices.delete({
            index: indexMessages.index,
            ignore_unavailable: true
        });
    } catch (err) {
        logger.error(err);
        throw new Error('failed_to_deleteIndex');
    }
}
