import { OrchestratorClient, OrchestratorProcessor } from '@nangohq/nango-orchestrator';
import { getLogger } from '@nangohq/utils';

import { envs } from '../env.js';
import { handler } from './handler.js';

const logger = getLogger('jobs.processor');

export class Processor {
    private processors: OrchestratorProcessor[];

    constructor(orchestratorServiceUrl: string) {
        const orchestratorClient = new OrchestratorClient({ baseUrl: orchestratorServiceUrl });
        this.processors = [
            envs.SYNC_PROCESSOR_MAX_CONCURRENCY > 0 &&
                new OrchestratorProcessor({
                    handler,
                    orchestratorClient: orchestratorClient,
                    groupKey: 'sync',
                    maxConcurrency: envs.SYNC_PROCESSOR_MAX_CONCURRENCY
                }),
            envs.ACTION_PROCESSOR_MAX_CONCURRENCY > 0 &&
                new OrchestratorProcessor({
                    handler,
                    orchestratorClient: orchestratorClient,
                    groupKey: 'action',
                    maxConcurrency: envs.ACTION_PROCESSOR_MAX_CONCURRENCY
                }),
            envs.WEBHOOK_PROCESSOR_MAX_CONCURRENCY > 0 &&
                new OrchestratorProcessor({
                    handler,
                    orchestratorClient: orchestratorClient,
                    groupKey: 'webhook',
                    maxConcurrency: envs.WEBHOOK_PROCESSOR_MAX_CONCURRENCY
                }),
            envs.ONEVENT_PROCESSOR_MAX_CONCURRENCY > 0 &&
                new OrchestratorProcessor({
                    handler,
                    orchestratorClient: orchestratorClient,
                    groupKey: 'on-event',
                    maxConcurrency: envs.ONEVENT_PROCESSOR_MAX_CONCURRENCY
                }).filter(Boolean)
        ];
    }

    start() {
        logger.info('Starting task processors');
        this.processors.forEach((p) => p.start());
    }

    async stop() {
        logger.info('Stopping task processors');
        await Promise.all(this.processors.map((p) => p.stop()));
    }
}
