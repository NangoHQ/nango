import * as fs from 'fs';
import type { MessagePort } from 'node:worker_threads';
import { Worker, isMainThread } from 'node:worker_threads';
import { getLogger, stringifyError } from '@nangohq/utils';
import { OrchestratorClient, OrchestratorProcessor } from '@nangohq/nango-orchestrator';
import type { TaskType } from '@nangohq/nango-orchestrator';
import { handler } from './handler.js';
import tracer from 'dd-trace';

const logger = getLogger('jobs.processor.worker');

export class ProcessorWorker {
    private worker: Worker | null;
    constructor({ orchestratorUrl, groupKey, maxConcurrency }: { orchestratorUrl: string; groupKey: TaskType; maxConcurrency: number }) {
        if (isMainThread) {
            const url = new URL('../../dist/processor/processor.worker.boot.js', import.meta.url);
            if (!fs.existsSync(url)) {
                throw new Error(`Processor worker boot script not found at ${url.href}`);
            }
            this.worker = new Worker(url, { workerData: { orchestratorUrl, groupKey, maxConcurrency } });
            this.worker.on('error', (err) => {
                logger.error(`ProcessorWorker exited with error: ${stringifyError(err)}`);
            });
            this.worker.on('exit', (code) => {
                if (code !== 0) {
                    logger.error(`ProcessorWorker exited with exit code: ${code}`);
                }
            });
        } else {
            throw new Error('ProcessorWorker should be instantiated in the main thread');
        }
    }

    start(): void {
        this.worker?.postMessage('start');
    }

    stop(): void {
        if (this.worker) {
            this.worker.postMessage('stop');
            this.worker = null;
        }
    }
}

export class ProcessorChild {
    private parent: MessagePort;
    private processor: OrchestratorProcessor;
    private opts: {
        orchestratorUrl: string;
        groupKey: string;
        maxConcurrency: number;
    };

    constructor(parent: MessagePort, workerData: { orchestratorUrl: string; groupKey: string; maxConcurrency: number }) {
        if (isMainThread) {
            throw new Error('Processor should not be instantiated in the main thread');
        }
        if (!workerData.orchestratorUrl || !workerData.groupKey || workerData.maxConcurrency <= 0) {
            throw new Error(
                `Missing required options for processor worker. Expecting orchestratorUrl, groupKey, maxConcurrency > 0, got: ${JSON.stringify(workerData)}`
            );
        }
        this.opts = workerData;
        this.parent = parent;
        this.parent.on('message', (msg: 'start' | 'stop') => {
            switch (msg) {
                case 'start':
                    this.start();
                    break;
                case 'stop':
                    this.stop();
                    break;
            }
        });
        const client = new OrchestratorClient({ baseUrl: this.opts.orchestratorUrl });
        this.processor = new OrchestratorProcessor({
            handler,
            opts: {
                orchestratorClient: client,
                groupKey: this.opts.groupKey,
                maxConcurrency: this.opts.maxConcurrency
            }
        });
    }

    start(): void {
        logger.info(`Starting Processor: ${JSON.stringify(this.opts)}`);
        this.processor.start({ tracer });
    }

    stop(): void {
        logger.info(`Stopping Processor: ${JSON.stringify(this.opts)}`);
        this.processor.stop();
    }
}
