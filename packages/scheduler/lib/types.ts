import type { JsonValue } from 'type-fest';
import type { TaskProps } from './models/tasks.js';

export const taskStates = ['CREATED', 'STARTED', 'SUCCEEDED', 'FAILED', 'EXPIRED', 'CANCELLED'] as const;
export type TaskState = (typeof taskStates)[number];
export type TaskTerminalState = Exclude<TaskState, 'CREATED' | 'STARTED'>;
export type TaskNonTerminalState = Exclude<TaskState, TaskTerminalState>;

export interface Task {
    readonly id: string;
    readonly name: string;
    readonly payload: JsonValue;
    readonly groupKey: string;
    readonly retryMax: number;
    readonly retryCount: number;
    readonly startsAfter: Date;
    readonly createdToStartedTimeoutSecs: number;
    readonly startedToCompletedTimeoutSecs: number;
    readonly heartbeatTimeoutSecs: number;
    readonly createdAt: Date;
    readonly state: TaskState;
    readonly lastStateTransitionAt: Date;
    readonly lastHeartbeatAt: Date;
    readonly output: JsonValue | null;
    readonly terminated: boolean;
    readonly scheduleId: string | null;
}

interface WithGroupKeyMaxConcurrency {
    groupKeyMaxConcurrency?: number | undefined;
}
export type ImmediateProps = Omit<TaskProps, 'startsAfter' | 'scheduleId'> & WithGroupKeyMaxConcurrency;
export type ScheduleProps = Omit<Schedule, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'> & WithGroupKeyMaxConcurrency;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const scheduleStates = ['PAUSED', 'STARTED', 'DELETED'] as const;
export type ScheduleState = (typeof scheduleStates)[number];

export interface Schedule {
    readonly id: string;
    readonly name: string;
    readonly state: ScheduleState;
    readonly startsAt: Date;
    readonly frequencyMs: number;
    readonly payload: JsonValue;
    readonly groupKey: string;
    readonly retryMax: number;
    readonly createdToStartedTimeoutSecs: number;
    readonly startedToCompletedTimeoutSecs: number;
    readonly heartbeatTimeoutSecs: number;
    readonly createdAt: Date;
    readonly updatedAt: Date;
    readonly deletedAt: Date | null;
    readonly lastScheduledTaskId: string | null;
}

export interface Group {
    readonly key: string;
    readonly maxConcurrency: number;
    readonly createdAt: Date;
    readonly updatedAt: Date;
    readonly lastTaskAddedAt: Date | null;
    readonly deletedAt: Date | null;
}
