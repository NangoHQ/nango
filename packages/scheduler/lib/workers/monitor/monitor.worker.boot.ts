import '../../tracer.js';
import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import { MonitorChild } from './monitor.worker.js';
import { DatabaseClient } from '../../db/client.js';
import { logger } from '../../utils/logger.js';

if (!isMainThread && parentPort) {
    const { url, schema } = workerData;
    if (!url || !schema) {
        throw new Error('Missing required database url and schema for monitor worker');
    }
    const dbClient = new DatabaseClient({ url, schema, poolMax: 10 });
    new MonitorChild(parentPort, dbClient.db);
} else {
    logger.error('Failed to start monitor in worker thread');
}
