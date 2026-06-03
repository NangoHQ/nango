import { randomUUID } from 'node:crypto';

import { DatabaseClient, Scheduler, defaultDatabaseClientOptions, defaultSchedulerConfig } from '@nangohq/scheduler';
import { Err, Ok, getLogger, report, stringifyError } from '@nangohq/utils';

import { TaskProcessor } from './processor.js';
import { TASK_TYPE_SEPARATOR, buildTaskName, resolveTaskOptions } from './types.js';

import type { AnyTaskDefinition, EnqueueBatchItem, EnqueueDiscardReason, EnqueueOverrides, PayloadOf } from './types.js';
import type { ImmediateProps, SchedulerConfig, Task, TaskState } from '@nangohq/scheduler';
import type { Result, StrictLogger } from '@nangohq/utils';
import type { JsonObject } from 'type-fest';

export interface TaskQueueOptions<Defs extends readonly AnyTaskDefinition[]> {
    definitions: Defs;
    /** Postgres connection string. */
    dbUrl: string;
    /** Dedicated schema, isolated from other scheduler instances (e.g. `nango_tasks`). */
    dbSchema: string;
    dbPoolMax?: number;
    dbSsl?: boolean;
    applicationName?: string;
    /** Max tasks processed concurrently by this instance's processor. */
    processorMaxConcurrency?: number;
    /** How often the processor polls for ready tasks (ms). Defaults to the processor's own default. */
    processorPollIntervalMs?: number;
    /** Override the scheduler daemon config (e.g. shorter tick intervals in tests). */
    schedulerConfig?: SchedulerConfig;
    logger?: StrictLogger;
}

/**
 * A durable, retryable task queue (backed by `@nangohq/scheduler`) wired to a set of task
 * definitions. Fully typed: `enqueue(type, payload)` is checked against the definitions, and the
 * processor dispatches dequeued tasks to the matching handler.
 */
export class TaskQueue<const Defs extends readonly AnyTaskDefinition[]> {
    private readonly definitions: Map<string, AnyTaskDefinition>;
    private readonly dbClient: DatabaseClient;
    private readonly scheduler: Scheduler;
    private readonly processor: TaskProcessor;
    private readonly logger: StrictLogger;

    constructor(opts: TaskQueueOptions<Defs>) {
        this.logger = opts.logger ?? getLogger('tasks');

        this.definitions = new Map();
        for (const def of opts.definitions) {
            if (def.type.includes(TASK_TYPE_SEPARATOR)) {
                throw new Error(`Task type '${def.type}' cannot contain '${TASK_TYPE_SEPARATOR}' (it is used to encode the type in the task name)`);
            }
            if (this.definitions.has(def.type)) {
                throw new Error(`Duplicate task definition for type '${def.type}'`);
            }
            this.definitions.set(def.type, def);
        }

        this.dbClient = new DatabaseClient({
            ...defaultDatabaseClientOptions,
            url: opts.dbUrl,
            schema: opts.dbSchema,
            poolMax: opts.dbPoolMax ?? defaultDatabaseClientOptions.poolMax,
            ssl: opts.dbSsl ? { rejectUnauthorized: false } : false,
            applicationName: opts.applicationName ?? defaultDatabaseClientOptions.applicationName
        });

        const logState =
            (state: TaskState) =>
            (task: Task): void => {
                this.logger.debug(`[tasks] ${state} ${task.groupKey} (${task.id})`);
            };
        this.scheduler = new Scheduler({
            db: this.dbClient.db,
            on: {
                CREATED: logState('CREATED'),
                STARTED: logState('STARTED'),
                SUCCEEDED: logState('SUCCEEDED'),
                FAILED: logState('FAILED'),
                EXPIRED: logState('EXPIRED'),
                CANCELLED: logState('CANCELLED')
            },
            onError: (err) => {
                report(err);
                this.logger.error(`[tasks] scheduler error: ${stringifyError(err)}`);
            },
            // A daemon error is reported above but must not take the whole queue (and its host process)
            // down: keep ticking so a transient failure self-heals on the next tick.
            continueOnError: true,
            config: opts.schedulerConfig ?? defaultSchedulerConfig,
            logger: this.logger
        });

        this.processor = new TaskProcessor({
            scheduler: this.scheduler,
            definitions: this.definitions,
            ...(opts.processorMaxConcurrency !== undefined ? { maxConcurrency: opts.processorMaxConcurrency } : {}),
            ...(opts.processorPollIntervalMs !== undefined ? { pollIntervalMs: opts.processorPollIntervalMs } : {}),
            logger: this.logger
        });
    }

    /** Run the scheduler's migrations into the configured schema. */
    migrate(): Promise<void> {
        return this.dbClient.migrate();
    }

    /** Bring the queue online: start the scheduler daemons and the processor loop. */
    start(): void {
        this.scheduler.start();
        this.processor.start();
    }

    /** Stop the processor, scheduler, and close the DB connection. */
    async stop(): Promise<void> {
        await this.processor.stop();
        await this.scheduler.stop();
        await this.dbClient.destroy();
    }

    /** Enqueue a task. Fully typed against the registered definitions. */
    async enqueue<T extends Defs[number]['type']>(type: T, payload: PayloadOf<Defs, T>, overrides?: EnqueueOverrides): Promise<Result<{ taskId: string }>> {
        const def = this.definitions.get(type);
        if (!def) {
            return Err(new Error(`No task definition for type '${type}'`));
        }
        const parsed = def.schema.safeParse(payload);
        if (!parsed.success) {
            return Err(new Error(`Invalid payload for task '${type}': ${parsed.error.message}`));
        }

        const options = resolveTaskOptions(def, overrides);
        const groupKey = overrides?.groupKey ?? (typeof def.groupKey === 'function' ? def.groupKey(parsed.data) : (def.groupKey ?? type));
        const props = {
            name: buildTaskName(type, randomUUID()),
            payload: parsed.data as JsonObject,
            groupKey,
            groupMaxConcurrency: options.groupMaxConcurrency,
            retryMax: options.retryMax,
            retryCount: 0,
            createdToStartedTimeoutSecs: options.createdToStartedTimeoutSecs,
            startedToCompletedTimeoutSecs: options.startedToCompletedTimeoutSecs,
            heartbeatTimeoutSecs: options.heartbeatTimeoutSecs,
            ownerKey: null,
            retryKey: null
        };

        const res = overrides?.startsAfter ? await this.scheduler.at({ ...props, startsAfter: overrides.startsAfter }) : await this.scheduler.immediate(props);
        if (res.isErr()) {
            return Err(res.error);
        }
        return Ok({ taskId: res.value.id });
    }

    /**
     * Enqueue many tasks (of any registered types) in a single transaction. Every item is validated
     * first — if any payload is invalid, nothing is enqueued and an Err is returned. Items that would
     * exceed a group's cap are reported in `discarded` (by input index) rather than failing the batch.
     * Immediate only (no `startsAfter`).
     */
    async enqueueBatch(
        items: EnqueueBatchItem<Defs>[]
    ): Promise<Result<{ created: { index: number; taskId: string }[]; discarded: { index: number; reason: EnqueueDiscardReason }[] }>> {
        if (items.length === 0) {
            return Ok({ created: [], discarded: [] });
        }

        const propsList: ImmediateProps[] = [];
        const nameToIndex = new Map<string, number>();
        for (const [index, item] of items.entries()) {
            const def = this.definitions.get(item.type);
            if (!def) {
                return Err(new Error(`No task definition for type '${item.type}'`));
            }
            const parsed = def.schema.safeParse(item.payload);
            if (!parsed.success) {
                return Err(new Error(`Invalid payload for task '${item.type}' at index ${index}: ${parsed.error.message}`));
            }
            const options = resolveTaskOptions(def);
            const groupKey = item.groupKey ?? (typeof def.groupKey === 'function' ? def.groupKey(parsed.data) : (def.groupKey ?? item.type));
            const name = buildTaskName(item.type, randomUUID());
            nameToIndex.set(name, index);
            propsList.push({
                name,
                payload: parsed.data as JsonObject,
                groupKey,
                groupMaxConcurrency: options.groupMaxConcurrency,
                retryMax: options.retryMax,
                retryCount: 0,
                createdToStartedTimeoutSecs: options.createdToStartedTimeoutSecs,
                startedToCompletedTimeoutSecs: options.startedToCompletedTimeoutSecs,
                heartbeatTimeoutSecs: options.heartbeatTimeoutSecs,
                ownerKey: null,
                retryKey: null
            });
        }

        const res = await this.scheduler.immediateBatch(propsList);
        if (res.isErr()) {
            return Err(res.error);
        }
        return Ok({
            created: res.value.created.map((t) => ({ index: nameToIndex.get(t.name) ?? -1, taskId: t.id })),
            discarded: res.value.discarded.map((d) => ({ index: nameToIndex.get(d.props.name) ?? -1, reason: d.reason }))
        });
    }
}
