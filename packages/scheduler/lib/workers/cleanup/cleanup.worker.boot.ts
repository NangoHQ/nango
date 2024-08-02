import '../../tracer.js';
import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import { CleanupChild } from './cleanup.worker.js';
import { DatabaseClient } from '../../db/client.js';
import { logger } from '../../utils/logger.js';

if (!isMainThread && parentPort) {
    const { url, schema } = workerData;
    if (!url || !schema) {
        throw new Error('Missing required database url and schema for cleanup worker');
    }
    const dbClient = new DatabaseClient({ url, schema, poolMax: 10 });
    new CleanupChild(parentPort, dbClient.db);
} else {
    logger.error('Failed to start cleanup in worker thread');
}
