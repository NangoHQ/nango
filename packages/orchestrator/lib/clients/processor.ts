import type { Result } from '@nangohq/utils';
import { Err, stringifyError, getLogger } from '@nangohq/utils';
import type { OrchestratorClient } from './client.js';
import type { ClientError, OrchestratorTask } from './types.js';
import type { JsonValue } from 'type-fest';
import PQueue from 'p-queue';
import type { Tracer } from 'dd-trace';
import type { ApiError } from '@nangohq/types';

const logger = getLogger('orchestrator.clients.processor');

export class OrchestratorProcessor {
    private handler: (task: OrchestratorTask) => Promise<Result<JsonValue>>;
    private groupKey: string;
    private orchestratorClient: OrchestratorClient;
    private queue: PQueue;
    private stopped: boolean;
    private abortControllers: Map<string, AbortController>;
    private terminatedTimer: NodeJS.Timeout | null = null;
    private checkForTerminatedInterval: number;

    constructor({
        handler,
        opts
    }: {
        handler: (task: OrchestratorTask) => Promise<Result<JsonValue>>;
        opts: { orchestratorClient: OrchestratorClient; groupKey: string; maxConcurrency: number; checkForTerminatedInterval?: number };
    }) {
        this.stopped = true;
        this.handler = handler;
        this.groupKey = opts.groupKey;
        this.orchestratorClient = opts.orchestratorClient;
        this.queue = new PQueue({ concurrency: opts.maxConcurrency });
        this.abortControllers = new Map();
        this.checkForTerminatedInterval = opts.checkForTerminatedInterval || 1000;
    }

    public start(ctx: { tracer: Tracer }) {
        this.stopped = false;
        this.terminatedTimer = setInterval(async () => {
            await this.checkForTerminatedTasks();
        }, this.checkForTerminatedInterval); // checking for cancelled/expired doesn't require to be very responsive so we can do it on an interval
        void this.processingLoop(ctx);
    }

    public stop() {
        this.stopped = true;
        if (this.terminatedTimer) {
            clearInterval(this.terminatedTimer);
        }
    }

    private async checkForTerminatedTasks() {
        if (this.stopped || this.abortControllers.size <= 0) {
            return;
        }
        const ids = Array.from(this.abortControllers.keys());
        const search = await this.orchestratorClient.searchTasks({ ids });
        if (search.isErr()) {
            return Err(search.error);
        }
        for (const task of search.value) {
            // if task is already in a terminal state, invoke the abort signal
            if (['FAILED', 'EXPIRED', 'CANCELLED', 'SUCCEEDED'].includes(task.state)) {
                const abortController = this.abortControllers.get(task.id);
                if (abortController) {
                    if (!abortController.signal.aborted) {
                        abortController.abort();
                    }
                    this.abortControllers.delete(task.id);
                }
            }
        }
        return;
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
        let heartbeat: NodeJS.Timeout;
        this.abortControllers.set(task.id, task.abortController);
        await this.queue.add(async () => {
            const active = ctx.tracer.scope().active();
            const span = ctx.tracer.startSpan('processor.process.task', {
                ...(active ? { childOf: active } : {}),
                tags: { 'task.id': task.id }
            });
            try {
                if (task.abortController.signal.aborted) {
                    // task was aborted while waiting in the queue
                    logger.info(`task ${task.id} was aborted before processing started`);
                    return;
                }
                heartbeat = this.heartbeat(task);
                const res = await this.handler(task);
                if (res.isErr()) {
                    if (task.abortController.signal.aborted) {
                        // task was aborted. No need to set it as failed
                        return;
                    }

                    const setFailed = await this.orchestratorClient.failed({ taskId: task.id, error: res.error });
                    if (setFailed.isErr()) {
                        throwIfPayloadTooBig(setFailed.error);
                        logger.error(`failed to set task ${task.id} as failed`, setFailed.error);
                        span.setTag('error', setFailed);
                    } else {
                        span.setTag('error', res.error);
                    }
                } else {
                    const setSucceed = await this.orchestratorClient.succeed({ taskId: task.id, output: res.value });
                    if (setSucceed.isErr()) {
                        throwIfPayloadTooBig(setSucceed.error);
                        logger.error(`failed to set task ${task.id} as succeeded`, setSucceed.error);
                        span.setTag('error', setSucceed);
                    }
                }
            } catch (err: unknown) {
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
                this.abortControllers.delete(task.id);
                clearInterval(heartbeat);
                span.finish();
            }
        });
    }

    private heartbeat(task: OrchestratorTask): NodeJS.Timeout {
        return setInterval(async () => {
            const res = await this.orchestratorClient.heartbeat({ taskId: task.id });
            if (res.isErr()) {
                logger.error(`failed to send heartbeat for task ${task.id}`, res.error);
            }
        }, 300_000);
    }
}

// We don't have access to NangoError so we have to create a temp error
class PayloadTooBigError extends Error {
    type = 'action_output_too_big';
    override message = 'Output is too big';
}

function throwIfPayloadTooBig(err: ClientError) {
    if (err.payload && typeof err.payload === 'object' && 'response' in err.payload && err.payload['response'] && typeof err.payload['response'] === 'object') {
        const res = err.payload['response'] as unknown as ApiError<string>;
        if (res.error.code === 'payload_too_big') {
            throw new PayloadTooBigError();
        }
    }
}
