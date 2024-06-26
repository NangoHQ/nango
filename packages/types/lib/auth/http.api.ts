import type { ApiError, Endpoint } from '../api';
import type { ConnectionConfig } from '../connection/db';

export interface ConnectionIdentifiers {
    connectionId: string;
    providerConfigKey: string;
}

export type TbaAuthorization = Endpoint<{
    Method: 'POST';
    Body: {
        token_id: string;
        token_secret: string;
    };
    QueryParams: {
        connectionId: string;
        connectionConfig: ConnectionConfig;
    };
    Params: {
        providerConfigKey: string;
    };
    Path: '/auth/tba';
    Error: ApiError<'invalid_body'> | ApiError<'invalid_query_params'>;
    Success: ConnectionIdentifiers;
}>;
