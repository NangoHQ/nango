import type { Result } from '@nangohq/utils';
import { stringifyError, getLogger } from '@nangohq/utils';
import type { OrchestratorClient } from './client.js';
import type { OrchestratorTask } from './types.js';
import PQueue from 'p-queue';
import type { Tracer } from 'dd-trace';

const logger = getLogger('orchestrator.clients.processor');

export class OrchestratorProcessor {
    private handler: (task: OrchestratorTask) => Promise<Result<void>>;
    private groupKey: string;
    private orchestratorClient: OrchestratorClient;
    private queue: PQueue;
    private stopped: boolean;
    private terminatedTimer: NodeJS.Timeout | null = null;

    constructor({
        handler,
        opts
    }: {
        handler: (task: OrchestratorTask) => Promise<Result<void>>;
        opts: { orchestratorClient: OrchestratorClient; groupKey: string; maxConcurrency: number; checkForTerminatedInterval?: number };
    }) {
        this.stopped = true;
        this.handler = handler;
        this.groupKey = opts.groupKey;
        this.orchestratorClient = opts.orchestratorClient;
        this.queue = new PQueue({ concurrency: opts.maxConcurrency });
    }

    public start(ctx: { tracer: Tracer }) {
        this.stopped = false;
        void this.processingLoop(ctx);
    }

    public stop() {
        this.stopped = true;
        if (this.terminatedTimer) {
            clearInterval(this.terminatedTimer);
        }
    }

    public queueSize() {
        return this.queue.size;
    }

    private async processingLoop(ctx: { tracer: Tracer }) {
        while (!this.stopped) {
            // wait for the queue to have space before dequeuing more tasks
            await this.queue.onSizeLessThan(this.queue.concurrency);
            const available = this.queue.concurrency - this.queue.size;
            const limit = available + this.queue.concurrency; // fetching more than available to keep the queue full
            const tasks = await this.orchestratorClient.dequeue({ groupKey: this.groupKey, limit, longPolling: true });
            if (tasks.isErr()) {
                logger.error(`failed to dequeue tasks: ${stringifyError(tasks.error)}`);
                await new Promise((resolve) => setTimeout(resolve, 1000)); // wait for a bit before retrying to avoid hammering the server in case of repetitive errors
                continue;
            }
            for (const task of tasks.value) {
                const active = ctx.tracer.scope().active();
                const span = ctx.tracer.startSpan('processor.process', {
                    ...(active ? { childOf: active } : {}),
                    tags: { 'task.id': task.id }
                });
                void this.processTask(task, ctx)
                    .catch((err: unknown) => span.setTag('error', err))
                    .finally(() => span.finish());
            }
        }
        return;
    }

    private async processTask(task: OrchestratorTask, ctx: { tracer: Tracer }): Promise<void> {
        await this.queue.add(async () => {
            const active = ctx.tracer.scope().active();
            const span = ctx.tracer.startSpan('processor.process.task', {
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
