import { setTimeout } from 'node:timers/promises';

import tracer from 'dd-trace';
import PQueue from 'p-queue';

import { getLogger, stringifyError } from '@nangohq/utils';

import type { OrchestratorClient } from './client.js';
import type { OrchestratorTask } from './types.js';
import type { Result } from '@nangohq/utils';

const logger = getLogger('orchestrator.clients.processor');

export class OrchestratorProcessor {
    private handler: (task: OrchestratorTask) => Promise<Result<void>>;
    private groupKey: string;
    private orchestratorClient: OrchestratorClient;
    private queue: PQueue;
    private status: 'running' | 'stopping' | 'stopped';

    constructor({
        orchestratorClient,
        groupKey,
        maxConcurrency,
        handler
    }: {
        handler: (task: OrchestratorTask) => Promise<Result<void>>;
        orchestratorClient: OrchestratorClient;
        groupKey: string;
        maxConcurrency: number;
    }) {
        this.status = 'stopped';
        this.handler = handler;
        this.groupKey = groupKey;
        this.orchestratorClient = orchestratorClient;
        this.queue = new PQueue({ concurrency: maxConcurrency });
    }

    public start(): void {
        this.status = 'running';
        void this.processingLoop();
    }

    public async stop(): Promise<void> {
        const waitUntilStopped = async (): Promise<void> => {
            await this.queue.onIdle();
            while (this.status !== 'stopped') {
                await setTimeout(100); // Wait until the processing loop exits
            }
        };
        this.status = 'stopping';
        await waitUntilStopped();
    }

    public queueSize(): number {
        return this.queue.size;
    }

    private async processingLoop(): Promise<void> {
        while (this.status === 'running') {
            // wait for the queue to have space before dequeuing more tasks
            await this.queue.onSizeLessThan(this.queue.concurrency);
            const available = this.queue.concurrency - this.queue.size;
            const limit = available + this.queue.concurrency; // fetching more than available to keep the queue full
            const tasks = await this.orchestratorClient.dequeue({ groupKey: this.groupKey, limit, longPolling: true });
            if (tasks.isErr()) {
                logger.error(`failed to dequeue tasks: ${stringifyError(tasks.error)}`);
                await setTimeout(1000); // wait for a bit before retrying to avoid hammering the server in case of repetitive errors
                continue;
            }
            for (const task of tasks.value) {
                const active = tracer.scope().active();
                const span = tracer.startSpan('processor.process', {
                    ...(active ? { childOf: active } : {}),
                    tags: { 'task.id': task.id }
                });
                void this.processTask(task)
                    .catch((err: unknown) => span.setTag('error', err))
                    .finally(() => span.finish());
            }
        }
        this.status = 'stopped';
        return;
    }

    private async processTask(task: OrchestratorTask): Promise<void> {
        await this.queue.add(async () => {
            const active = tracer.scope().active();
            const span = tracer.startSpan('processor.process.task', {
                ...(active ? { childOf: active } : {}),
                tags: { 'task.id': task.id }
            });
            try {
                const res = await this.handler(task);
                if (res.isErr()) {
                    const setFailed = await this.orchestratorClient.failed({ taskId: task.id, error: res.error });
                    if (setFailed.isErr()) {
                        logger.error(`failed to set task ${task.id} as failed`, setFailed.error);
                        span.setTag('error', setFailed);
                    } else {
                        span.setTag('error', res.error);
                    }
                }
            } catch (err) {
                const error = err instanceof Error ? err : new Error(stringifyError(err));
                logger.error(`Failed to process task ${task.id}`, error);
                const setFailed = await this.orchestratorClient.failed({ taskId: task.id, error });
                if (setFailed.isErr()) {
                    logger.error(`failed to set task ${task.id} as failed. Unknown error`, setFailed.error);
                    span.setTag('error', setFailed);
                } else {
                    span.setTag('error', error);
                }
            } finally {
                span.finish();
            }
        });
    }
}
