import { Client } from '@elastic/elasticsearch';
import { envs } from '../env.js';
import { logger } from '@nangohq/shared';
import { migrateMapping } from './helpers.js';

export const client = new Client({
    nodes: envs.NANGO_LOGS_ES_URL,
    requestTimeout: 5000,
    maxRetries: 1,
    auth: { username: envs.NANGO_LOGS_ES_USER, password: envs.NANGO_LOGS_ES_PWD }
});

export async function start() {
    logger.info('Elasticsearch service starting');

    await migrateMapping();
}
