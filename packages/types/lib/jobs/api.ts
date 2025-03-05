import type { JsonValue } from 'type-fest';
import type { ApiError, Endpoint } from '../api';
import type { RunnerOutputError } from '../runner';
import type { NangoProps } from '../runner/sdk';

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
