import type { Endpoint } from '../api';
import type { MessageRow, MessageState, OperationRow } from './messages';

export type SearchOperations = Endpoint<{
    Method: 'POST';
    Path: '/api/v1/logs/operations';
    Querystring: { env: string };
    Body: {
        limit?: number;
        states?: SearchOperationsState[];
        types?: SearchOperationsType[];
        integrations?: SearchOperationsIntegration[] | undefined;
        period?: SearchOperationsPeriod;
    };
    Success: {
        data: OperationRow[];
        pagination: { total: number };
    };
}>;
export type SearchOperationsState = 'all' | MessageState;
export type SearchOperationsType = OperationRow['operation'];
// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
export type SearchOperationsIntegration = 'all' | string;
export interface SearchOperationsPeriod {
    before: string;
    after: string;
}
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

export type SearchMessages = Endpoint<{
    Method: 'POST';
    Path: '/api/v1/logs/messages';
    Querystring: { env: string };
    Body: { operationId: string; limit?: number; states?: SearchOperationsState[]; search?: string | undefined };
    Success: {
        data: MessageRow[];
        pagination: { total: number };
    };
}>;
export type SearchMessagesData = SearchMessages['Success']['data'][0];

export type SearchFilters = Endpoint<{
    Method: 'POST';
    Path: '/api/v1/logs/filters';
    Querystring: { env: string };
    Body: { category: 'config' | 'syncConfig' | 'connection'; search?: string | undefined };
    Success: {
        data: { key: string; doc_count: number }[];
    };
}>;
export type SearchFiltersData = SearchMessages['Success']['data'][0];
