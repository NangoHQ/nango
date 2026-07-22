import { setTimeout } from 'node:timers/promises';

import tracer from 'dd-trace';
import PQueue from 'p-queue';

import { getLogger, metrics, stringifyError } from '@nangohq/utils';

import type { OrchestratorClient } from './client.js';
import type { OrchestratorTask } from './types.js';
import type { Result } from '@nangohq/utils';
import type { Span } from 'dd-trace';

const logger = getLogger('orchestrator.clients.processor');

export class OrchestratorProcessor {
    private handler: (task: OrchestratorTask) => Promise<Result<void>>;
    private groupKeyPattern: string;
    private orchestratorClient: OrchestratorClient;
    private queue: PQueue;
    private status: 'running' | 'stopping' | 'stopped';

    constructor({
        orchestratorClient,
        groupKeyPattern,
        maxConcurrency,
        handler
    }: {
        handler: (task: OrchestratorTask) => Promise<Result<void>>;
        orchestratorClient: OrchestratorClient;
        groupKeyPattern: string;
        maxConcurrency: number;
    }) {
        this.status = 'stopped';
        this.handler = handler;
        this.groupKeyPattern = groupKeyPattern;
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
            const free = this.queue.concurrency - this.queue.pending - this.queue.size;
            if (free <= 0) {
                await this.waitForCapacity();
                continue;
            }
            const tasks = await this.orchestratorClient.dequeue({ groupKeyPattern: this.groupKeyPattern, limit: free, longPolling: true });
            if (tasks.isErr()) {
                logger.error(`failed to dequeue tasks: ${stringifyError(tasks.error)}`);
                await setTimeout(1000); // wait for a bit before retrying to avoid hammering the server in case of repetitive errors
                continue;
            }
            metrics.distribution(metrics.Types.ORCH_TASKS_DEQUEUED, tasks.value.length, { groupKeyPattern: this.groupKeyPattern });
            for (const task of tasks.value) {
                const active = tracer.scope().active();
                const span = tracer.startSpan('processor.process', {
                    ...(active ? { childOf: active } : {}),
                    tags: { 'task.id': task.id }
                });
                void this.processTask(task, span)
                    .catch((err: unknown) => span.setTag('error', err))
                    .finally(() => span.finish());
            }
        }
        this.status = 'stopped';
        return;
    }

    private waitForCapacity(): Promise<void> {
        return new Promise<void>((resolve) => {
            let settled = false;
            const onCapacity = () => {
                if (settled) {
                    return;
                }
                settled = true;
                this.queue.off('completed', onCapacity);
                this.queue.off('next', onCapacity);
                resolve();
            };
            this.queue.on('completed', onCapacity);
            this.queue.on('next', onCapacity);
            if (this.queue.pending + this.queue.size < this.queue.concurrency) {
                onCapacity();
            }
        });
    }

    private async processTask(task: OrchestratorTask, parentSpan: Span): Promise<void> {
        await this.queue.add(() =>
            tracer.trace('processor.process.task', { childOf: parentSpan, tags: { 'task.id': task.id } }, async (span) => {
                try {
                    const res = await this.handler(task);
                    if (res.isErr()) {
                        await this.reportFailure(task, res.error, span);
                    }
                } catch (err) {
                    const error = err instanceof Error ? err : new Error(stringifyError(err));
                    logger.error(`Failed to process task ${task.id}`, error);
                    await this.reportFailure(task, error, span);
                }
            })
        );
    }

    private async reportFailure(task: OrchestratorTask, error: Error, span?: Span): Promise<void> {
        span?.setTag('error', error);
        const setFailed = await this.orchestratorClient.failed({ taskId: task.id, error });
        if (setFailed.isErr()) {
            logger.error(`failed to set task ${task.id} as failed`, setFailed.error);
            span?.setTag('task.failed_report_error', setFailed.error.name);
        }
    }
}
