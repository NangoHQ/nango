import type { Result, StrictLogger } from '@nangohq/utils';
import type { z } from 'zod';

/** Tunable per-task scheduler knobs. All optional on a definition; defaults applied when omitted. */
export interface TaskOptions {
    retryMax: number;
    createdToStartedTimeoutSecs: number;
    startedToCompletedTimeoutSecs: number;
    heartbeatTimeoutSecs: number;
    groupMaxConcurrency: number;
}

export const DEFAULT_TASK_OPTIONS: TaskOptions = {
    retryMax: 3,
    // Measured from `startsAfter`, so this stays valid even for long-delayed tasks.
    createdToStartedTimeoutSecs: 300,
    startedToCompletedTimeoutSecs: 600,
    heartbeatTimeoutSecs: 120,
    groupMaxConcurrency: 0 // 0 = unlimited
};

export interface TaskContext {
    taskId: string;
    /** 0 on the first execution, incremented on each retry. */
    attempt: number;
    logger: StrictLogger;
}

export type TaskHandler<Payload> = (payload: Payload, ctx: TaskContext) => Promise<Result<void>>;

/**
 * The concurrency bucket for a task: a static key, or one derived from the payload.
 */
export type GroupKey<Payload> = string | ((payload: Payload) => string);

export interface TaskDefinition<Name extends string, Schema extends z.ZodType> extends Partial<TaskOptions> {
    /** The task type identifier */
    type: Name;
    /** The schema for the task payload */
    schema: Schema;
    /** The task handler */
    handle: TaskHandler<z.infer<Schema>>;
    /** The concurrency bucket for the task */
    groupKey?: GroupKey<z.infer<Schema>>;
}

/**
 * Loose shape used only as a generic constraint for collections of definitions
 */
export interface AnyTaskDefinition extends Partial<TaskOptions> {
    type: string;
    schema: z.ZodType;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handle: (payload: any, ctx: TaskContext) => Promise<Result<void>>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    groupKey?: GroupKey<any>;
}

export function defineTask<Name extends string, Schema extends z.ZodType>(def: TaskDefinition<Name, Schema>): TaskDefinition<Name, Schema> {
    return def;
}

/** Resolve effective options with precedence: overrides > definition > defaults. */
export function resolveTaskOptions(def: Partial<TaskOptions>, overrides?: Partial<TaskOptions>): TaskOptions {
    return {
        retryMax: overrides?.retryMax ?? def.retryMax ?? DEFAULT_TASK_OPTIONS.retryMax,
        createdToStartedTimeoutSecs:
            overrides?.createdToStartedTimeoutSecs ?? def.createdToStartedTimeoutSecs ?? DEFAULT_TASK_OPTIONS.createdToStartedTimeoutSecs,
        startedToCompletedTimeoutSecs:
            overrides?.startedToCompletedTimeoutSecs ?? def.startedToCompletedTimeoutSecs ?? DEFAULT_TASK_OPTIONS.startedToCompletedTimeoutSecs,
        heartbeatTimeoutSecs: overrides?.heartbeatTimeoutSecs ?? def.heartbeatTimeoutSecs ?? DEFAULT_TASK_OPTIONS.heartbeatTimeoutSecs,
        groupMaxConcurrency: overrides?.groupMaxConcurrency ?? def.groupMaxConcurrency ?? DEFAULT_TASK_OPTIONS.groupMaxConcurrency
    };
}

export type EnqueueOverrides = Omit<Partial<TaskOptions>, 'groupMaxConcurrency'> & {
    /** Defer execution: the task only becomes runnable at/after this time (e.g. "in 30 days"). */
    startsAfter?: Date;
    /** Concurrency bucket for this enqueue; overrides the definition's `groupKey`. */
    groupKey?: string;
};

export const TASK_TYPE_SEPARATOR = ':';

export function buildTaskName(type: string, uniqueId: string): string {
    return `${type}${TASK_TYPE_SEPARATOR}${uniqueId}`;
}

export function taskTypeFromName(name: string): string {
    const idx = name.indexOf(TASK_TYPE_SEPARATOR);
    return idx === -1 ? name : name.slice(0, idx);
}

/** Payload type of the definition whose `type` is `T`, derived from its Zod schema. */
export type PayloadOf<Defs extends readonly AnyTaskDefinition[], T extends string> =
    Extract<Defs[number], { type: T }> extends { schema: infer S extends z.ZodType } ? z.infer<S> : never;

export type EnqueueBatchItem<Defs extends readonly AnyTaskDefinition[]> = {
    [T in Defs[number]['type']]: {
        type: T;
        payload: PayloadOf<Defs, T>;
        /** Overrides the definition's `groupKey`. */
        groupKey?: string;
        /** Defer the task: only runnable at/after this time. Omit to run as soon as possible. */
        startsAfter?: Date;
    };
}[Defs[number]['type']];

export type EnqueueDiscardReason = 'capped' | 'duplicate';
