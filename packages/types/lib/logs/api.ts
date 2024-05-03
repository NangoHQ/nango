import type { ApiError, Endpoint } from '../api';
import type { OperationRow } from './messages';

export type SearchLogs = Endpoint<{
    Method: 'POST';
    Path: '/api/v1/logs/search';
    Querystring: { env: string };
    Body: { limit?: number };
    Error: ApiError<'invalid_query_params'>;
    Success: {
        data: OperationRow[];
        pagination: { total: number };
    };
}>;
