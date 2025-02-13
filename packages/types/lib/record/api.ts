import type { ApiError, Endpoint } from '../api';

export type RecordLastAction = 'ADDED' | 'UPDATED' | 'DELETED' | 'added' | 'updated' | 'deleted';
export type CombinedFilterAction = `${RecordLastAction},${RecordLastAction}`;

export interface RecordMetadata {
    first_seen_at: string;
    last_modified_at: string;
    last_action: RecordLastAction;
    deleted_at: string | null;
    cursor: string;
}

export type NangoRecord<T extends Record<string, any> = Record<string, any>> = {
    [key: string]: any;
    id: string | number;
    _nango_metadata: RecordMetadata;
} & T;

export type MergingStrategy = { strategy: 'override' } | { strategy: 'ignore_if_modified_after_cursor'; cursor?: string | undefined };

export type CursorOffset = 'first' | 'last';

export type GetPublicRecords = Endpoint<{
    Method: 'GET';
    Path: `/records`;
    Headers: {
        'connection-id': string;
        'provider-config-key': string;
    };
    Error: ApiError<'unknown_connection'>;
    Querystring: {
        model: string;
        delta?: string | undefined;
        modified_after?: string | undefined;
        limit?: number | undefined;
        filter?: RecordLastAction | CombinedFilterAction | undefined;
        cursor?: string | undefined;
        ids?: string[] | undefined;
    };
    Success: {
        next_cursor: string | null;
        records: NangoRecord[];
    };
}>;
