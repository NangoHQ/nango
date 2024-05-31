import type { ApiError, Endpoint } from '../../api.js';
import type { Connection } from '../db.js';
import type { ActiveLog } from '../../notification/active-logs/db.js';

export type GetConnection = Endpoint<{
    Method: 'GET';
    Params: {
        connectionId: string;
    };
    Querystring: {
        env: string;
        provider_config_key: string;
        force_refresh?: 'true' | 'false';
    };
    Path: '/api/v1/connection/:connectionId';
    Error:
        | ApiError<'unknown_connection'>
        | ApiError<'missing_provider_config'>
        | ApiError<'unknown_provider'>
        | ApiError<'missing_connection'>
        | ApiError<'unknown_provider_config'>;
    Success: {
        provider: string | null;
        connection: Connection;
        errorLog: ActiveLog | null;
    };
}>;
