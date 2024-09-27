import type { Endpoint } from '../api.js';

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

export type DeleteConnectSession = Endpoint<{
    Method: 'DELETE';
    Path: '/connect/session';
    Success: never;
}>;
