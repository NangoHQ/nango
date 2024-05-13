import type { TaskProps, taskStates } from './models/tasks';

type JsonValue = string | number | boolean | null;
type JsonArray = JsonValue[] | JsonObject[];
export interface JsonObject {
    [key: string]: JsonValue | JsonObject | JsonArray;
}

export type TaskState = (typeof taskStates)[number];

export interface Task {
    readonly id: string;
    readonly name: string;
    readonly payload: JsonObject;
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
    readonly output: JsonObject | null;
    readonly terminated: boolean;
}

export interface SchedulingProps {
    taskProps: Omit<TaskProps, 'startsAfter'>;
    scheduling: 'immediate';
}
