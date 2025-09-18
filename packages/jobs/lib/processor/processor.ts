import { OrchestratorClient, OrchestratorProcessor } from '@nangohq/nango-orchestrator';
import { getLogger } from '@nangohq/utils';

import { envs } from '../env.js';
import { handler } from './handler.js';

const logger = getLogger('jobs.processor');

export class Processor {
    private processors: OrchestratorProcessor[];

    constructor(orchestratorServiceUrl: string) {
        const orchestratorClient = new OrchestratorClient({ baseUrl: orchestratorServiceUrl });

        const processorConfigs = envs.JOB_PROCESSOR_CONFIG;

        this.processors = processorConfigs
            .filter((config) => config.maxConcurrency > 0)
            .map(
                (config) =>
                    new OrchestratorProcessor({
                        handler,
                        orchestratorClient,
                        groupKey: config.groupKeyPattern,
                        maxConcurrency: config.maxConcurrency
                    })
            );
    }

    start() {
        logger.info(`Starting ${this.processors.length} task processors`);
        this.processors.forEach((p) => p.start());
    }

    async stop() {
        logger.info('Stopping task processors');
        await Promise.all(this.processors.map((p) => p.stop()));
    }
}
