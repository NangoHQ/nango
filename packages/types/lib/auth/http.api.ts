import type { ApiError, Endpoint } from '../api';
import type { ConnectionConfig } from '../connection/db';

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
    Error:
        | ApiError<'invalid_body'>
        | ApiError<'invalid_query_params'>
        | ApiError<'unknown_provider_config'>
        | ApiError<'invalid_auth_mode'>
        | ApiError<'missing_token_url'>
        | ApiError<'no_data_returned_from_token_request'>
        | ApiError<'callback_not_confirmed'>
        | ApiError<'missing_connection_config_param'>;
    Success: never;
}>;
