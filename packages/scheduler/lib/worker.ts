import { setTimeout } from 'node:timers/promises';

import { stringifyError } from '@nangohq/utils';

import type { Scheduler } from './scheduler.js';
import type { Task } from './types.js';
import type { JsonObject, JsonValue } from 'type-fest';

export interface SchedulerWorkerHandlerResult {
    output: JsonValue;
}

export interface SchedulerWorkerHandler {
    groupKeyPattern: string;
    limit: number;
    heartbeatIntervalMs?: number;
    toFailureOutput?: (err: unknown, task: Task) => JsonValue;
    handle: (task: Task) => Promise<SchedulerWorkerHandlerResult>;
    handleAbort?: (task: Task) => Promise<SchedulerWorkerHandlerResult>;
}

export interface SchedulerWorkerErrorContext {
    phase: 'dequeue' | 'handle' | 'handleAbort' | 'heartbeat' | 'succeed' | 'fail';
    groupKeyPattern: string;
    task?: Task | undefined;
}

export interface SchedulerWorkerOptions {
    scheduler: Scheduler;
    handlers: SchedulerWorkerHandler[];
    pollIntervalMs?: number;
    onError?: (err: Error, context: SchedulerWorkerErrorContext) => void;
}

const defaultPollIntervalMs = 1000;
const defaultHeartbeatIntervalMs = 10_000;

export class SchedulerWorker {
    private readonly scheduler: Scheduler;
    private readonly handlers: SchedulerWorkerHandler[];
    private readonly pollIntervalMs: number;
    private readonly onError: (err: Error, context: SchedulerWorkerErrorContext) => void;
    private ac = new AbortController();
    private stopped = true;
    private loopPromises: Promise<void>[] = [];

    constructor({ scheduler, handlers, pollIntervalMs = defaultPollIntervalMs, onError = () => {} }: SchedulerWorkerOptions) {
        this.scheduler = scheduler;
        this.handlers = handlers;
        this.pollIntervalMs = pollIntervalMs;
        this.onError = onError;
    }

    start(): void {
        if (!this.stopped) {
            return;
        }

        this.stopped = false;
        this.ac = new AbortController();
        this.loopPromises = this.handlers.map((handler) => this.loop(handler));
    }

    async stop(): Promise<void> {
        if (this.stopped) {
            return;
        }

        this.stopped = true;
        this.ac.abort();
        await Promise.allSettled(this.loopPromises);
    }

    private async loop(handler: SchedulerWorkerHandler): Promise<void> {
        while (!this.stopped) {
            try {
                const dequeued = await this.scheduler.dequeue({ groupKeyPattern: handler.groupKeyPattern, limit: handler.limit });
                if (dequeued.isErr()) {
                    this.reportError(dequeued.error, { phase: 'dequeue', groupKeyPattern: handler.groupKeyPattern });
                    await this.sleep(this.pollIntervalMs);
                    continue;
                }

                if (dequeued.value.length === 0) {
                    await this.sleep(this.pollIntervalMs);
                    continue;
                }

                await Promise.allSettled(dequeued.value.map((task) => this.runTask(handler, task)));
            } catch (err) {
                this.reportError(err, { phase: 'dequeue', groupKeyPattern: handler.groupKeyPattern });
                await this.sleep(this.pollIntervalMs);
            }
        }
    }

    private async runTask(handler: SchedulerWorkerHandler, task: Task): Promise<void> {
        const stopHeartbeat = this.startHeartbeat(handler, task);
        const phase = isAbortTask(task) ? 'handleAbort' : 'handle';
        try {
            const result = await this.handleTask(handler, task);
            await this.succeedTask(handler, task, result.output);
        } catch (err) {
            this.reportError(err, { phase, groupKeyPattern: handler.groupKeyPattern, task });
            await this.failTask(handler, task, err);
        } finally {
            stopHeartbeat();
        }
    }

    private async handleTask(handler: SchedulerWorkerHandler, task: Task): Promise<SchedulerWorkerHandlerResult> {
        if (!isAbortTask(task)) {
            return await handler.handle(task);
        }

        if (!handler.handleAbort) {
            return { output: null };
        }

        return await handler.handleAbort(task);
    }

    private async succeedTask(handler: SchedulerWorkerHandler, task: Task, output: JsonValue): Promise<void> {
        try {
            const succeeded = await this.scheduler.succeed({ taskId: task.id, output });
            if (succeeded.isErr()) {
                this.reportError(succeeded.error, { phase: 'succeed', groupKeyPattern: handler.groupKeyPattern, task });
            }
        } catch (err) {
            this.reportError(err, { phase: 'succeed', groupKeyPattern: handler.groupKeyPattern, task });
        }
    }

    private async failTask(handler: SchedulerWorkerHandler, task: Task, err: unknown): Promise<void> {
        try {
            const failed = await this.scheduler.fail({ taskId: task.id, error: handler.toFailureOutput?.(err, task) ?? toTaskError(err) });
            if (failed.isErr()) {
                this.reportError(failed.error, { phase: 'fail', groupKeyPattern: handler.groupKeyPattern, task });
            }
        } catch (failErr) {
            this.reportError(failErr, { phase: 'fail', groupKeyPattern: handler.groupKeyPattern, task });
        }
    }

    private startHeartbeat(handler: SchedulerWorkerHandler, task: Task): () => void {
        const intervalMs = handler.heartbeatIntervalMs ?? defaultHeartbeatIntervalMs;
        let inFlight = false;
        const interval = setInterval(() => {
            if (inFlight || this.stopped) {
                return;
            }
            inFlight = true;
            void this.scheduler
                .heartbeat({ taskId: task.id })
                .then((res) => {
                    if (res.isErr()) {
                        this.reportError(res.error, { phase: 'heartbeat', groupKeyPattern: handler.groupKeyPattern, task });
                    }
                })
                .catch((err: unknown) => {
                    this.reportError(err, { phase: 'heartbeat', groupKeyPattern: handler.groupKeyPattern, task });
                })
                .finally(() => {
                    inFlight = false;
                });
        }, intervalMs);

        return () => clearInterval(interval);
    }

    private async sleep(ms: number): Promise<void> {
        try {
            await setTimeout(ms, undefined, { signal: this.ac.signal });
        } catch (err) {
            if (!isAbortError(err)) {
                throw err;
            }
        }
    }

    private reportError(err: unknown, context: SchedulerWorkerErrorContext): void {
        try {
            this.onError(toError(err), context);
        } catch {
            // Worker error observers should not stop the worker loop.
        }
    }
}

function toTaskError(err: unknown): JsonObject {
    return { message: toError(err).message };
}

function toError(err: unknown): Error {
    if (err instanceof Error) {
        return err;
    }
    if (typeof err === 'string') {
        return new Error(err);
    }

    return new Error(stringifyError(err));
}

function isAbortError(err: unknown): boolean {
    return err instanceof Error && err.name === 'AbortError';
}

function isAbortTask(task: Task): boolean {
    return task.payload['type'] === 'abort';
}
