import type { Endpoint, ApiError } from '../api.js';

export type PostConnectSessions = Endpoint<{
    Method: 'POST';
    Path: '/connect/sessions';
    Body: {
        end_user: {
            id: string;
            email: string;
            display_name?: string | undefined;
        };
        organization?:
            | {
                  id: string;
                  display_name?: string | undefined;
              }
            | undefined;
        allowed_integrations?: string[] | undefined;
        integrations_config_defaults?: Record<string, { connection_config: Record<string, unknown> }> | undefined;
    };
    Error: ApiError<'forbidden' | 'invalid_body' | 'invalid_query_params' | 'internal_error'>;
    Success: {
        data: {
            token: string;
            expires_at: Date;
        };
    };
}>;

export type GetConnectSession = Endpoint<{
    Method: 'GET';
    Path: '/connect/session';
    Error: ApiError<'forbidden' | 'invalid_body' | 'invalid_query_params' | 'internal_error'>;
    Success: {
        data: {
            allowed_integrations?: string[] | undefined;
            integrations_config_defaults?: Record<string, { connection_config: Record<string, unknown> }> | undefined;
            end_user: {
                id: string;
                email: string;
                display_name?: string | undefined;
            };
            organization?:
                | {
                      id: string;
                      display_name?: string | undefined;
                  }
                | undefined;
        };
    };
}>;
