import type { TaskProps } from './models/tasks';
import type { JsonValue } from 'type-fest';

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
}

export interface SchedulingProps {
    taskProps: Omit<TaskProps, 'startsAfter'>;
    scheduling: 'immediate';
}
