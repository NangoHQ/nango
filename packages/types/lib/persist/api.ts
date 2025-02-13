import type { MergingStrategy, NangoRecord } from '../record/api.js';

export interface PostRecordsSuccess {
    nextMerging: MergingStrategy;
}

export interface PutRecordsSuccess {
    nextMerging: MergingStrategy;
}

export interface DeleteRecordsSuccess {
    nextMerging: MergingStrategy;
}

export interface GetCursorSuccess {
    cursor?: string;
}

export interface GetRecordsSuccess {
    records: NangoRecord[];
    nextCursor?: string;
}
