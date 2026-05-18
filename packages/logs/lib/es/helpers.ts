import { errors as esErrors } from '@elastic/elasticsearch';
import { errors as osErrors } from '@opensearch-project/opensearch';

import { Err, Ok, isTest } from '@nangohq/utils';

import { envs } from '../env.js';
import { putIsmPolicies } from '../opensearch/ismPolicies.js';
import { client } from '../storage/client.js';
import { logger } from '../utils.js';
import { getDailyIndexPipeline, indexMessages, indexOperations, policyMessages, policyOperations } from './schema.js';
import { getFormattedMessage, getFormattedOperation } from '../models/helpers.js';
import { createMessage } from '../models/messages.js';
import { createOperation } from '../models/operations.js';

import type { Result } from '@nangohq/utils';
import type { Client as OpenSearchClient } from '@opensearch-project/opensearch';

function isConnectionError(err: unknown): boolean {
    return err instanceof esErrors.ConnectionError || err instanceof osErrors.ConnectionError || err instanceof osErrors.NoLivingConnectionsError;
}

/** Best-effort details for OpenSearch/Elasticsearch API errors (logged; not returned to callers). */
function formatLogsStorageInitError(err: unknown): string {
    if (err instanceof osErrors.ResponseError) {
        const body = typeof err.body === 'object' && err.body !== null ? err.body : err.meta?.body;
        return `HTTP ${err.statusCode}: ${JSON.stringify(body)}`;
    }
    if (err instanceof esErrors.ResponseError) {
        const body = typeof err.body === 'object' && err.body !== null ? err.body : err.meta?.body;
        return `HTTP ${err.statusCode}: ${JSON.stringify(body)}`;
    }
    if (err instanceof Error) {
        return err.message;
    }
    return String(err);
}

export async function start() {
    if (!envs.NANGO_LOGS_ENABLED) {
        logger.warning('Logs storage is disabled, skipping');
        return;
    }

    logger.info(`🔄 Logs storage (${envs.NANGO_LOGS_PROVIDER}) starting...`);

    const res = await migrateMapping();

    if (res.isErr()) {
        if (res.error.message === 'failed_to_connect_logs_storage') {
            logger.error('❌ Logs storage connection failed. Skipping migration');
            return;
        } else {
            logger.error('❌ Logs storage initialization failed');
            throw res.error;
        }
    }
    logger.info(`✅ Logs storage (${envs.NANGO_LOGS_PROVIDER})`);
}

export async function migrateMapping(): Promise<Result<void>> {
    try {
        if (envs.NANGO_LOGS_PROVIDER === 'opensearch') {
            await migrateMappingOpenSearch();
        } else {
            await migrateMappingElasticsearch();
        }
        return Ok(undefined);
    } catch (err) {
        const errMsg = isConnectionError(err) ? 'failed_to_connect_logs_storage' : 'failed_to_init_logs_storage';
        logger.error(`${errMsg}: ${formatLogsStorageInitError(err)}`, err);
        return Err(errMsg);
    }
}

async function migrateMappingElasticsearch(): Promise<void> {
    const es = client;
    for (const index of [indexMessages, indexOperations]) {
        logger.info(`Migrating index "${index.index}"...`);
        const isMessages = index.index.includes('messages');

        logger.info(`  Updating policy`);
        await es.ilm.putLifecycle(isMessages ? policyMessages : policyOperations);

        const existsTemplate = await es.indices.existsIndexTemplate({ name: `${index.index}-template` });
        logger.info(`  ${existsTemplate ? 'updating' : 'creating'} index template "${index.index}"...`);

        await es.indices.putIndexTemplate({
            name: `${index.index}-template`,
            index_patterns: `${index.index}.*`,
            template: {
                settings: index.settings!,
                mappings: index.mappings!,
                aliases: { [index.index]: {} }
            }
        });

        logger.info(`  Updating pipeline`);
        await es.ingest.putPipeline(getDailyIndexPipeline(index.index));

        const existsAlias = await es.indices.exists({ index: index.index });
        if (!existsAlias) {
            logger.info(`  Inserting dummy record`);
            if (index.index.includes('messages')) {
                await createMessage(getFormattedMessage({ parentId: '-1', accountId: 0 }));
            } else {
                await createOperation(getFormattedOperation({ id: '-1', accountId: 0, operation: { type: 'sync', action: 'run' } }));
            }
        }
    }
}

async function migrateMappingOpenSearch(): Promise<void> {
    await putIsmPolicies(client as unknown as OpenSearchClient);

    for (const index of [indexMessages, indexOperations]) {
        logger.info(`Migrating index "${index.index}"...`);

        const existsTemplate = await client.indices.existsIndexTemplate({ name: `${index.index}-template` });
        logger.info(`  ${existsTemplate ? 'updating' : 'creating'} index template "${index.index}"...`);

        // OpenSearch JS client requires `name` + `body` (body holds index_patterns + template). Elasticsearch-style flat params are rejected.
        const pattern = `${index.index}.*`;
        await client.indices.putIndexTemplate({
            name: `${index.index}-template`,
            body: {
                index_patterns: [pattern],
                template: {
                    settings: index.settings!,
                    mappings: index.mappings!,
                    aliases: { [index.index]: {} }
                }
            }
        });

        logger.info(`  Updating pipeline`);
        const pipeline = getDailyIndexPipeline(index.index);
        await client.ingest.putPipeline({
            id: pipeline.id,
            body: {
                description: pipeline.description ?? 'Daily index',
                processors: pipeline.processors ?? []
            }
        });

        const existsAlias = await client.indices.exists({ index: index.index });
        if (!existsAlias) {
            logger.info(`  Inserting dummy record`);
            if (index.index.includes('messages')) {
                await createMessage(getFormattedMessage({ parentId: '-1', accountId: 0 }));
            } else {
                await createOperation(getFormattedOperation({ id: '-1', accountId: 0, operation: { type: 'sync', action: 'run' } }));
            }
        }
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
