import type { ApiError, Endpoint } from '../api';
import type { MessageState, OperationRow } from './messages';

export type SearchLogs = Endpoint<{
    Method: 'POST';
    Path: '/api/v1/logs/search';
    Querystring: { env: string };
    Body: { limit?: number; states?: SearchLogsState[] };
    Error: ApiError<'invalid_query_params'>;
    Success: {
        data: OperationRow[];
        pagination: { total: number };
    };
}>;

export type SearchLogsState = 'all' | MessageState;

export type SearchLogsData = SearchLogs['Success']['data'][0];
