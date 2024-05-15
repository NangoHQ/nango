import type { TaskProps, taskStates } from './models/tasks';

type JsonLiteral = string | number | boolean | null;
export type Json = JsonLiteral | { [key: string]: Json } | Json[];

export type TaskState = (typeof taskStates)[number];

export interface Task {
    readonly id: string;
    readonly name: string;
    readonly payload: Json;
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
    readonly output: Json | null;
    readonly terminated: boolean;
}

export interface SchedulingProps {
    taskProps: Omit<TaskProps, 'startsAfter'>;
    scheduling: 'immediate';
}
