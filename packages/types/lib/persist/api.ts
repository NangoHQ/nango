import type { ApiError, Endpoint } from '../api.js';
import type { Checkpoint } from '../checkpoint/types.js';
import type { MessageRowInsert } from '../logs/messages.js';
import type { MergingStrategy, NangoRecord } from '../record/api.js';

interface LogBody {
    activityLogId: string;
    log: Omit<MessageRowInsert, 'accountId'>;
}

export type PostLog = Endpoint<{
    Method: 'POST';
    Path: '/environment/:environmentId/log';
    Params: {
        environmentId: number;
    };
    Body: LogBody;
    Error: ApiError<'post_log_failed'>;
    Success: never;
}>;

type WithTags<T> = T & { integrationId: string; connectionId: string; syncId?: string | undefined };

export type RunnerDataTransferTelemetry = WithTags<{
    type: 'data_transfer';
    callsite: 'proxy' | 'uncontrolled_fetch' | 'persist_records' | 'persist_logs';
    bytesSent: number;
    bytesReceived: number;
    count: number;
}>;

// NOTE: discriminated union on `type`; add more telemetry types as needed.
export type RunnerTelemetry = RunnerDataTransferTelemetry;

export type PostRunnerTelemetry = Endpoint<{
    Method: 'POST';
    Path: '/environment/:environmentId/runner/telemetry';
    Params: {
        environmentId: number;
    };
    Body: {
        events: RunnerTelemetry[];
    };
    Error: ApiError<'post_runner_telemetry_failed'>;
    Success: never;
}>;

export interface PostRecordsSuccess {
    nextMerging: MergingStrategy;
}

export interface PutRecordsSuccess {
    nextMerging: MergingStrategy;
}

export interface DeleteRecordsSuccess {
    nextMerging: MergingStrategy;
}

export interface DeleteOutdatedRecordsSuccess {
    deletedKeys: string[];
}

export interface DeleteHardAllRecordsSuccess {
    deletedCount: number;
    hasMore: boolean;
}

export interface GetCursorSuccess {
    cursor?: string;
}

export interface GetRecordsSuccess {
    records: NangoRecord[];
    nextCursor?: string;
}

export interface GetCheckpointSuccess {
    checkpoint: Checkpoint;
    version: number;
    deletedAt: string | null;
}

export interface PutCheckpointSuccess {
    checkpoint: Checkpoint;
    version: number;
}

export interface GetTaskAbortSuccess {
    aborted: boolean;
}

export type PutTaskAbort = Endpoint<{
    Method: 'PUT';
    Path: '/environment/:environmentId/runner/task/:taskId/abort';
    Params: {
        environmentId: number;
        taskId: string;
    };
    Error: ApiError<'put_task_abort_failed'>;
    Success: never;
}>;

export type GetTaskAbort = Endpoint<{
    Method: 'GET';
    Path: '/environment/:environmentId/runner/task/:taskId/abort';
    Params: {
        environmentId: number;
        taskId: string;
    };
    Error: ApiError<'get_task_abort_failed'>;
    Success: GetTaskAbortSuccess;
}>;

export type PutSyncConflict = Endpoint<{
    Method: 'PUT';
    Path: '/environment/:environmentId/runner/sync-conflict';
    Params: {
        environmentId: number;
    };
    Body: {
        scriptType: 'sync';
        syncId: string;
        refresh?: boolean;
    };
    Error: ApiError<'sync_conflict' | 'put_sync_conflict_failed'>;
    Success: never;
}>;

export type DeleteSyncConflict = Endpoint<{
    Method: 'DELETE';
    Path: '/environment/:environmentId/runner/sync-conflict';
    Params: {
        environmentId: number;
    };
    Body: {
        scriptType: 'sync';
        syncId: string;
    };
    Error: ApiError<'delete_sync_conflict_failed'>;
    Success: never;
}>;

export interface TryAcquireLockSuccess {
    acquired: boolean;
}

export type PostRunnerLockTryAcquire = Endpoint<{
    Method: 'POST';
    Path: '/environment/:environmentId/runner/locks/try-acquire';
    Params: {
        environmentId: number;
    };
    Body: {
        owner: string;
        key: string;
        ttlMs: number;
    };
    Error: ApiError<'try_acquire_lock_failed'>;
    Success: TryAcquireLockSuccess;
}>;

export interface ReleaseLockSuccess {
    released: boolean;
}

export type PostRunnerLockRelease = Endpoint<{
    Method: 'POST';
    Path: '/environment/:environmentId/runner/locks/release';
    Params: {
        environmentId: number;
    };
    Body: {
        owner: string;
        key: string;
    };
    Error: ApiError<'release_lock_failed'>;
    Success: ReleaseLockSuccess;
}>;

export type PostRunnerLockReleaseAll = Endpoint<{
    Method: 'POST';
    Path: '/environment/:environmentId/runner/locks/release-all';
    Params: {
        environmentId: number;
    };
    Body: {
        owner: string;
    };
    Error: ApiError<'release_all_locks_failed'>;
    Success: never;
}>;

export interface HasLockSuccess {
    hasLock: boolean;
}

export type GetRunnerLock = Endpoint<{
    Method: 'GET';
    Path: '/environment/:environmentId/runner/locks';
    Params: {
        environmentId: number;
    };
    Querystring: {
        owner: string;
        key: string;
    };
    Error: ApiError<'has_lock_failed'>;
    Success: HasLockSuccess;
}>;
