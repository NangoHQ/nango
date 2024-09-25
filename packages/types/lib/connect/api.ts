import type { Endpoint, ApiError } from '../api.js';
import type { ConnectSessionToken } from './session.js';

export type PostConnectSessions = Endpoint<{
    Method: 'POST';
    Path: '/connect/sessions';
    Body: {
        linkedProfile: {
            profileId: string;
            email?: string | undefined;
            displayName?: string | undefined;
            organization?:
                | {
                      organizationId: string;
                      displayName?: string | undefined;
                  }
                | undefined;
        };
        allowedIntegrations?: string[] | undefined;
        integrationsConfigDefaults?: Record<string, { connectionConfig: Record<string, unknown> }> | undefined;
    };
    Error: ApiError<'forbidden' | 'invalid_request' | 'internal_error'>;
    Success: ConnectSessionToken;
}>;
