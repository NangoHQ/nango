import { getLogger } from '@nangohq/utils';

import { envs } from '../env.js';
import { ProcessorWorker } from './processor.worker.js';

const logger = getLogger('jobs.processor');

export class Processor {
    private orchestratorServiceUrl: string;
    private workers: ProcessorWorker[];

    constructor(orchestratorServiceUrl: string) {
        this.orchestratorServiceUrl = orchestratorServiceUrl;
        this.workers = [];
    }

    start() {
        logger.info('Starting task processors');
        try {
            const syncWorker = new ProcessorWorker({
                orchestratorUrl: this.orchestratorServiceUrl,
                groupKey: 'sync',
                maxConcurrency: envs.SYNC_PROCESSOR_MAX_CONCURRENCY
            });
            syncWorker.start();

            const actionWorker = new ProcessorWorker({
                orchestratorUrl: this.orchestratorServiceUrl,
                groupKey: 'action',
                maxConcurrency: envs.ACTION_PROCESSOR_MAX_CONCURRENCY
            });
            actionWorker.start();

            const webhookWorker = new ProcessorWorker({
                orchestratorUrl: this.orchestratorServiceUrl,
                groupKey: 'webhook',
                maxConcurrency: envs.WEBHOOK_PROCESSOR_MAX_CONCURRENCY
            });
            webhookWorker.start();

            const onEventWorker = new ProcessorWorker({
                orchestratorUrl: this.orchestratorServiceUrl,
                groupKey: 'on-event',
                maxConcurrency: envs.ONEVENT_PROCESSOR_MAX_CONCURRENCY
            });
            onEventWorker.start();

            this.workers = [syncWorker, actionWorker, webhookWorker, onEventWorker];
        } catch (err) {
            logger.error(err);
        }
    }

    stop() {
        if (this.workers) {
            this.workers.forEach((worker) => worker.stop());
        }
    }
}
