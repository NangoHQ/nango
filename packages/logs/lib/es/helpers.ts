import { errors as esErrors } from '@elastic/elasticsearch';
import { errors as osErrors } from '@opensearch-project/opensearch';

import { Err, isTest, Ok } from '@nangohq/utils';

import { envs } from '../env.js';
import { getFormattedMessage, getFormattedOperation } from '../models/helpers.js';
import { createMessage } from '../models/messages.js';
import { createOperation } from '../models/operations.js';
import { client, logsStorage } from '../storage/client.js';
import { logger } from '../utils.js';
import { getDailyIndexPipeline, indexMessages, indexOperations, policyMessages, policyOperations } from './schema.js';

import type { Result } from '@nangohq/utils';

function isConnectionError(err: unknown): boolean {
    return err instanceof esErrors.ConnectionError || err instanceof osErrors.ConnectionError || err instanceof osErrors.NoLivingConnectionsError;
}

/** Sanitized error summary for init failure logs (no raw SDK objects or response bodies). */
function formatLogsStorageInitError(err: unknown): string {
    if (err instanceof osErrors.ResponseError) {
        return `${err.constructor.name} statusCode=${err.statusCode} message=${err.message}`;
    }
    if (err instanceof esErrors.ResponseError) {
        return `${err.constructor.name} statusCode=${err.statusCode} message=${err.message}`;
    }
    if (err instanceof Error) {
        return `${err.constructor.name} message=${err.message}`;
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
        await logsStorage.setupPolicies({ messagesPolicy: policyMessages, operationsPolicy: policyOperations });
        await migrateIndexTemplatesAndPipelines();
        return Ok(undefined);
    } catch (err) {
        const errMsg = isConnectionError(err) ? 'failed_to_connect_logs_storage' : 'failed_to_init_logs_storage';
        logger.error(`${errMsg}: ${formatLogsStorageInitError(err)}`);
        return Err(errMsg);
    }
}

async function migrateIndexTemplatesAndPipelines(): Promise<void> {
    for (const index of [indexMessages, indexOperations]) {
        logger.info(`Migrating index "${index.index}"...`);

        const existsTemplate = await client.indices.existsIndexTemplate({ name: `${index.index}-template` });
        logger.info(`  ${existsTemplate ? 'updating' : 'creating'} index template "${index.index}"...`);

        await client.indices.putIndexTemplate({
            name: `${index.index}-template`,
            index_patterns: `${index.index}.*`,
            template: {
                settings: index.settings! as Record<string, unknown>,
                mappings: index.mappings! as Record<string, unknown>,
                aliases: { [index.index]: {} }
            }
        });

        logger.info(`  Updating pipeline`);
        await client.ingest.putPipeline(getDailyIndexPipeline(index.index));

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
