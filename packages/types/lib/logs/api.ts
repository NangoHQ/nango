import type { Endpoint } from '../api';
import type { MessageState, OperationRow } from './messages';

export type SearchOperations = Endpoint<{
    Method: 'POST';
    Path: '/api/v1/logs/operations';
    Querystring: { env: string };
    Body: { limit?: number; states?: SearchOperationsState[] };
    Success: {
        data: OperationRow[];
        pagination: { total: number };
    };
}>;

export type SearchOperationsState = 'all' | MessageState;

export type SearchOperationsData = SearchOperations['Success']['data'][0];

export type GetOperation = Endpoint<{
    Method: 'GET';
    Path: `/api/v1/logs/operations/:operationId`;
    Querystring: { env: string };
    Params: { operationId: string };
    Success: {
        data: OperationRow;
    };
}>;
