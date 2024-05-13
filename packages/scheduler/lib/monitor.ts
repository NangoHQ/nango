import { isMainThread, parentPort } from 'node:worker_threads';
import { getLogger } from '@nangohq/utils';
import { MonitorChild } from './monitor.worker.js';

const logger = getLogger('Scheduler.monitor');

if (!isMainThread && parentPort) {
    new MonitorChild(parentPort);
} else {
    logger.error('Failed to start monitor in worker thread');
}
