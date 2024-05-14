import type { Endpoint } from '../api';
import type { MessageState, OperationRow } from './messages';

export type SearchLogs = Endpoint<{
    Method: 'POST';
    Path: '/api/v1/logs/search';
    Querystring: { env: string };
    Body: { limit?: number; states?: SearchLogsState[] };
    Success: {
        data: OperationRow[];
        pagination: { total: number };
    };
}>;

export type SearchLogsState = 'all' | MessageState;

export type SearchLogsData = SearchLogs['Success']['data'][0];

export type GetOperation = Endpoint<{
    Method: 'GET';
    Path: `/api/v1/logs/:operationId`;
    Querystring: { env: string };
    Params: { operationId: string };
    Success: {
        data: OperationRow;
    };
}>;
