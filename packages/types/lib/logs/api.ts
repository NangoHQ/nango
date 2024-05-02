import type { ApiError, Endpoint } from '../api';
import type { OperationRow } from './messages';

export type ListOperations = Endpoint<{
    Method: 'GET';
    Path: '/api/v1/logs/operations';
    Querystring: { env: string };
    Error: ApiError<'invalid_query_params'>;
    Success: {
        data: OperationRow[];
    };
}>;
