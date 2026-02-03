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
