import { OrchestratorClient, OrchestratorProcessor } from '@nangohq/nango-orchestrator';
import { getLogger } from '@nangohq/utils';

import { envs } from '../env.js';
import { handler } from './handler.js';

const logger = getLogger('jobs.processor');

export class Processor {
    private processors: OrchestratorProcessor[];

    constructor(orchestratorServiceUrl: string) {
        const orchestratorClient = new OrchestratorClient({ baseUrl: orchestratorServiceUrl });

        const processorConfigs = [
            { groupKey: 'sync', maxConcurrency: envs.SYNC_PROCESSOR_MAX_CONCURRENCY },
            { groupKey: 'action', maxConcurrency: envs.ACTION_PROCESSOR_MAX_CONCURRENCY },
            { groupKey: 'webhook', maxConcurrency: envs.WEBHOOK_PROCESSOR_MAX_CONCURRENCY },
            { groupKey: 'on-event', maxConcurrency: envs.ONEVENT_PROCESSOR_MAX_CONCURRENCY }
        ];

        this.processors = processorConfigs
            .filter((config) => config.maxConcurrency > 0)
            .map(
                (config) =>
                    new OrchestratorProcessor({
                        handler,
                        orchestratorClient,
                        groupKey: config.groupKey,
                        maxConcurrency: config.maxConcurrency
                    })
            );
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
