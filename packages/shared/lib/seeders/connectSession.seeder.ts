import type { ConnectSession } from '@nangohq/types';

export function getTestConnectSession(override?: Partial<ConnectSession>): ConnectSession {
    return {
        id: 1,
        accountId: 1,
        environmentId: 1,
        endUserId: null,
        connectionId: null,
        allowedIntegrations: null,
        integrationsConfigDefaults: null,
        operationId: 'op-123',
        overrides: null,
        endUser: null,
        tags: null,
        createdAt: new Date(),
        updatedAt: null,
        ...override
    };
}
