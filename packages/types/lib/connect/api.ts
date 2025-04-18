import type { Endpoint } from '../api.js';

export interface ConnectSessionInput {
    allowed_integrations?: string[] | undefined;
    integrations_config_defaults?:
        | Record<
              string,
              {
                  user_scopes?: string | undefined;
                  authorization_params?: Record<string, string> | undefined;
                  connection_config?:
                      | {
                            [key: string]: unknown;
                            oauth_scopes_override?: string | undefined;
                        }
                      | undefined;
              }
          >
        | undefined;
    end_user: {
        id: string;
        email?: string | undefined;
        display_name?: string | undefined;
    };
    organization?:
        | {
              id: string;
              display_name?: string | undefined;
          }
        | undefined;
}
export type ConnectSessionOutput = ConnectSessionInput & {
    isReconnecting?: boolean;
};

export type PostConnectSessions = Endpoint<{
    Method: 'POST';
    Path: '/connect/sessions';
    Body: ConnectSessionInput;
    Success: {
        data: {
            token: string;
            expires_at: string;
        };
    };
}>;

export type PostPublicConnectSessionsReconnect = Endpoint<{
    Method: 'POST';
    Path: '/connect/sessions/reconnect';
    Body: {
        connection_id: string;
        integration_id: string;
        integrations_config_defaults?: ConnectSessionInput['integrations_config_defaults'];
        end_user?: ConnectSessionInput['end_user'] | undefined;
        organization?: ConnectSessionInput['organization'];
    };
    Success: {
        data: {
            token: string;
            expires_at: string;
        };
    };
}>;

export type GetConnectSession = Endpoint<{
    Method: 'GET';
    Path: '/connect/session';
    Success: {
        data: ConnectSessionOutput;
    };
}>;

export type DeleteConnectSession = Endpoint<{
    Method: 'DELETE';
    Path: '/connect/session';
    Success: never;
}>;

export type PostInternalConnectSessions = Endpoint<{
    Method: 'POST';
    Path: '/api/v1/connect/sessions';
    Success: PostConnectSessions['Success'];
    Body: Pick<ConnectSessionInput, 'allowed_integrations' | 'end_user' | 'organization' | 'integrations_config_defaults'>;
}>;

export type PostPublicConnectTelemetry = Endpoint<{
    Method: 'POST';
    Path: '/connect/telemetry';
    Body: {
        token: string;
        event:
            | 'open'
            | 'view:list'
            | 'view:integration'
            | 'view:unknown_error'
            | 'view:credentials_error'
            | 'view:success'
            | 'click:integration'
            | 'click:doc'
            | 'click:doc_section'
            | 'click:connect'
            | 'click:close'
            | 'click:finish'
            | 'click:outside'
            | 'popup:blocked_by_browser'
            | 'popup:closed_early';
        timestamp: Date;
        dimensions?: { integration?: string | undefined } | undefined;
    };
    // We use sendBeacon, it expects no response
    Success: never;
}>;
