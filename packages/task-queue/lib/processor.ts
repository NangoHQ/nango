import { setTimeout } from 'node:timers/promises';

import PQueue from 'p-queue';

import { stringifyError } from '@nangohq/utils';

import { taskTypeFromName } from './types.js';

import type { AnyTaskDefinition, TaskContext } from './types.js';
import type { Scheduler, Task } from '@nangohq/scheduler';
import type { StrictLogger } from '@nangohq/utils';
import type { JsonValue } from 'type-fest';

function toJsonError(err: unknown): JsonValue {
    if (err instanceof Error) {
        return { name: err.name, message: err.message };
    }
    return { message: stringifyError(err) };
}

/**
 * In-process consumer: polls the scheduler for ready tasks, dispatches each to its handler
 * (looked up by `groupKey`, which equals the task type), and reports success/failure back.
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
            await this.queue.onIdle();
            while (this.status !== 'stopped') {
                await setTimeout(100);
            }
        };
        this.status = 'stopping';
        await waitUntilStopped();
    }

    private async processingLoop(): Promise<void> {
        while (this.status === 'running') {
            await this.queue.onSizeLessThan(this.queue.concurrency);
            const available = this.queue.concurrency - this.queue.size;
            // fetch more than the immediately-available slots to keep the queue full
            const limit = available + this.queue.concurrency;
            const res = await this.scheduler.dequeue({ groupKeyPattern: this.groupKeyPattern, limit });
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

    private async processTask(task: Task): Promise<void> {
        await this.queue.add(async () => {
            const type = taskTypeFromName(task.name);
            const def = this.definitions.get(type);
            if (!def) {
                this.logger.error(`[tasks] no handler registered for type '${type}' (task ${task.id})`);
                await this.scheduler.fail({ taskId: task.id, error: { message: `No handler registered for task type '${type}'` } });
                return;
            }

            const parsed = def.schema.safeParse(task.payload);
            if (!parsed.success) {
                this.logger.error(`[tasks] invalid payload for '${type}' (task ${task.id}): ${parsed.error.message}`);
                await this.scheduler.fail({ taskId: task.id, error: { message: `Invalid payload: ${parsed.error.message}` } });
                return;
            }

            const ctx: TaskContext = { taskId: task.id, attempt: task.retryCount, logger: this.logger };
            try {
                const result = await def.handle(parsed.data, ctx);
                if (result.isErr()) {
                    await this.scheduler.fail({ taskId: task.id, error: toJsonError(result.error) });
                } else {
                    await this.scheduler.succeed({ taskId: task.id, output: null });
                }
            } catch (err) {
                this.logger.error(`[tasks] handler threw for '${task.groupKey}' (task ${task.id}): ${stringifyError(err)}`);
                await this.scheduler.fail({ taskId: task.id, error: toJsonError(err) });
            }
        });
    }
}
