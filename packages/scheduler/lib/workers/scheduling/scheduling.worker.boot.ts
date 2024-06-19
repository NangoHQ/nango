import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import { SchedulingChild } from './scheduling.worker.js';
import { DatabaseClient } from '../../db/client.js';
import { logger } from '../../utils/logger.js';

if (!isMainThread && parentPort) {
    const { url, schema } = workerData;
    if (!url || !schema) {
        throw new Error('Missing required database url and schema for scheduling worker');
    }
    const dbClient = new DatabaseClient({ url, schema, poolMax: 10 });
    new SchedulingChild(parentPort, dbClient.db);
} else {
    logger.error('Failed to start scheduling in worker thread');
}
