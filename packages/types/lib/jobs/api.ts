import type { ApiError, Endpoint } from '../api.js';
import type { RunnerOutputError } from '../runner/index.js';
import type { NangoProps, TelemetryBagJSON } from '../runner/sdk.js';
import type { JsonValue } from 'type-fest';

export type PostHeartbeat = Endpoint<{
    Method: 'POST';
    Path: '/tasks/:taskId/heartbeat';
    Params: {
        taskId: string;
    };
    Body: never;
    Error: ApiError<'heartbeat_failed'>;
    Success: never;
}>;

export type PutTask = Endpoint<{
    Method: 'PUT';
    Path: '/tasks/:taskId';
    Params: {
        taskId: string;
    };
    Body: {
        nangoProps?: NangoProps | undefined;
        error?: RunnerOutputError | undefined;
        output?: JsonValue | undefined;
        telemetryBag?: TelemetryBagJSON | undefined;
    };
    Error: ApiError<'put_task_failed'>;
    Success: never;
}>;

export type PostRegister = Endpoint<{
    Method: 'POST';
    Path: '/runners/:nodeId/register';
    Params: {
        nodeId: number;
    };
    Body: {
        url: string;
    };
    Error: ApiError<'register_failed'>;
    Success: { status: 'ok' };
}>;

export type PostIdle = Endpoint<{
    Method: 'POST';
    Path: '/runners/:nodeId/idle';
    Params: {
        nodeId: number;
    };
    Error: ApiError<'idle_failed'>;
    Success: { status: 'ok' };
}>;
