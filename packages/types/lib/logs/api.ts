import type { ApiError, Endpoint } from '../api';
import type { OperationRow } from './messages';

export type ListOperations = Endpoint<{
    Params: { env: string };
    Error: ApiError<'invalid_query_params'>;
    Success: {
        data: OperationRow[];
    };
}>;
