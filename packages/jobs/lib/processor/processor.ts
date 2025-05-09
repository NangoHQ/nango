import { getLogger } from '@nangohq/utils';
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
                maxConcurrency: 200
            });
            syncWorker.start();

            const actionWorker = new ProcessorWorker({
                orchestratorUrl: this.orchestratorServiceUrl,
                groupKey: 'action',
                maxConcurrency: 200
            });
            actionWorker.start();

            const webhookWorker = new ProcessorWorker({
                orchestratorUrl: this.orchestratorServiceUrl,
                groupKey: 'webhook',
                maxConcurrency: 50
            });
            webhookWorker.start();

            const onEventWorker = new ProcessorWorker({
                orchestratorUrl: this.orchestratorServiceUrl,
                groupKey: 'on-event',
                maxConcurrency: 50
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
