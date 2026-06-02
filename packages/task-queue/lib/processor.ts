import { setTimeout } from 'node:timers/promises';

import PQueue from 'p-queue';

import { stringifyError } from '@nangohq/utils';

import { taskTypeFromName } from './types.js';

import type { AnyTaskDefinition, TaskContext } from './types.js';
import type { Scheduler, Task } from '@nangohq/scheduler';
import type { Result, StrictLogger } from '@nangohq/utils';
import type { JsonValue } from 'type-fest';

function toJsonError(err: unknown): JsonValue {
    if (err instanceof Error) {
        return { name: err.name, message: err.message };
    }
    return { message: stringifyError(err) };
}

/**
 * In-process consumer: polls the scheduler for ready tasks, dispatches each to its handler
 * (looked up by `type`, encoded in the task name), and reports success/failure back.
 */
export class TaskProcessor {
    private readonly scheduler: Scheduler;
    private readonly definitions: Map<string, AnyTaskDefinition>;
    private readonly groupKeyPattern: string;
    private readonly pollIntervalMs: number;
    private readonly queue: PQueue;
    private readonly logger: StrictLogger;
    private status: 'running' | 'stopping' | 'stopped' = 'stopped';

    constructor({
        scheduler,
        definitions,
        groupKeyPattern = '*',
        maxConcurrency = 10,
        pollIntervalMs = 1000,
        logger
    }: {
        scheduler: Scheduler;
        definitions: Map<string, AnyTaskDefinition>;
        groupKeyPattern?: string;
        maxConcurrency?: number;
        pollIntervalMs?: number;
        logger: StrictLogger;
    }) {
        this.scheduler = scheduler;
        this.definitions = definitions;
        this.groupKeyPattern = groupKeyPattern;
        this.pollIntervalMs = pollIntervalMs;
        this.queue = new PQueue({ concurrency: maxConcurrency });
        this.logger = logger;
    }

    public start(): void {
        if (this.status === 'running') {
            return;
        }
        this.status = 'running';
        void this.processingLoop();
    }

    public async stop(): Promise<void> {
        if (this.status === 'stopped') {
            return;
        }
        // Defined before the assignment below so TS doesn't narrow `this.status` to 'stopping'
        // inside the loop — the processing loop flips it to 'stopped' once it exits.
        const waitUntilStopped = async (): Promise<void> => {
            while (this.status !== 'stopped') {
                await setTimeout(100);
            }
            // Drain the tasks that were already claimed/running
            await this.queue.onIdle();
        };
        this.status = 'stopping';
        await waitUntilStopped();
    }

    private async processingLoop(): Promise<void> {
        while (this.status === 'running') {
            // Only claim as many tasks as there are free worker slots
            const free = this.queue.concurrency - this.queue.pending - this.queue.size;
            if (free <= 0) {
                // Wait until a worker frees up rather than sleeping a fixed interval, so a saturated
                // queue refills as soon as there's capacity instead of leaving workers idle.
                await this.waitForCapacity();
                continue;
            }
            const res = await this.scheduler.dequeue({ groupKeyPattern: this.groupKeyPattern, limit: free });
            if (res.isErr()) {
                this.logger.error(`[tasks] failed to dequeue: ${stringifyError(res.error)}`);
                await setTimeout(this.pollIntervalMs);
                continue;
            }
            if (res.value.length === 0) {
                await setTimeout(this.pollIntervalMs);
                continue;
            }
            for (const task of res.value) {
                void this.processTask(task);
            }
        }
        this.status = 'stopped';
    }

    // Resolve when a queued task finishes (a worker frees) or after pollIntervalMs as a safety net.
    private waitForCapacity(): Promise<void> {
        return new Promise<void>((resolve) => {
            let settled = false;
            const ac = new AbortController();
            const finish = (): void => {
                if (settled) {
                    return;
                }
                settled = true;
                this.queue.off('completed', finish);
                this.queue.off('next', finish);
                ac.abort();
                resolve();
            };
            this.queue.on('completed', finish);
            this.queue.on('next', finish);
            // On timeout -> finish; on abort (a worker freed first) the timer rejects -> finish is a
            // no-op thanks to the `settled` guard.
            void setTimeout(this.pollIntervalMs, undefined, { signal: ac.signal }).then(finish, finish);
        });
    }

    private async processTask(task: Task): Promise<void> {
        await this.queue.add(async () => {
            const type = taskTypeFromName(task.name);
            const def = this.definitions.get(type);
            if (!def) {
                this.logger.error(`[tasks] no handler registered for type '${type}' (task ${task.id})`);
                await this.markFailed(task.id, { message: `No handler registered for task type '${type}'` });
                return;
            }

            const parsed = def.schema.safeParse(task.payload);
            if (!parsed.success) {
                this.logger.error(`[tasks] invalid payload for '${type}' (task ${task.id}): ${parsed.error.message}`);
                await this.markFailed(task.id, { message: `Invalid payload: ${parsed.error.message}` });
                return;
            }

            const ctx: TaskContext = { taskId: task.id, attempt: task.retryCount, logger: this.logger };
            try {
                const result = await def.handle(parsed.data, ctx);
                if (result.isErr()) {
                    await this.markFailed(task.id, toJsonError(result.error));
                } else {
                    await this.markSucceeded(task.id);
                }
            } catch (err) {
                this.logger.error(`[tasks] handler threw for '${type}' (task ${task.id}): ${stringifyError(err)}`);
                await this.markFailed(task.id, toJsonError(err));
            }
        });
    }

    // Transitioning a task's state can itself fail (e.g. a DB error). Surface it instead of dropping
    // it, otherwise a task can silently stay STARTED until its timeout expires.
    private async markFailed(taskId: string, error: JsonValue): Promise<void> {
        await this.logIfErr(this.scheduler.fail({ taskId, error }), taskId, 'failed');
    }

    private async markSucceeded(taskId: string): Promise<void> {
        await this.logIfErr(this.scheduler.succeed({ taskId, output: null }), taskId, 'succeeded');
    }

    private async logIfErr(transition: Promise<Result<Task>>, taskId: string, target: string): Promise<void> {
        const res = await transition;
        if (res.isErr()) {
            this.logger.error(`[tasks] could not mark task ${taskId} as ${target}: ${stringifyError(res.error)}`);
        }
    }
}
