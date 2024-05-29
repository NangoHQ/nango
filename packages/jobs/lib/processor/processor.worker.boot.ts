import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import { getLogger } from '@nangohq/utils';
import { ProcessorChild } from './processor.worker.js';

const logger = getLogger('Scheduler.monitor');

if (!isMainThread && parentPort) {
    new ProcessorChild(parentPort, workerData);
} else {
    logger.error('Processor should not be instantiated in the main thread');
}
