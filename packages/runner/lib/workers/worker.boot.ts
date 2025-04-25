import '../tracer.js';
import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import type { WorkerProps } from './worker.js';
import { RunnerChild } from './worker.js';
import { logger } from '../logger.js';

if (!isMainThread && parentPort) {
    const props: WorkerProps = workerData;
    new RunnerChild({ parent: parentPort, props });
} else {
    logger.error('Failed to start runner worker thread');
}
