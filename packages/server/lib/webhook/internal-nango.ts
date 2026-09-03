import get from 'lodash-es/get.js';

import { connectionService } from '@nangohq/shared';

import { dispatchWebhookExecutions } from './dispatch.js';

import type { DispatchContext } from './dispatch.js';
import type { LogContextGetter } from '@nangohq/logs';
import type { ConnectionInternal, DBConnectionDecrypted, DBEnvironment, DBIntegrationDecrypted, DBPlan, DBTeam, HttpRequest, Metadata } from '@nangohq/types';

export class InternalNango {
    readonly team: DBTeam;
    readonly environment: DBEnvironment;
    readonly plan?: DBPlan | undefined;
    readonly integration: DBIntegrationDecrypted;
    readonly request: HttpRequest;
    readonly logContextGetter: LogContextGetter;

    constructor(opts: {
        team: DBTeam;
        environment: DBEnvironment;
        plan?: DBPlan | undefined;
        integration: DBIntegrationDecrypted;
        request: HttpRequest;
        logContextGetter: LogContextGetter;
    }) {
        this.team = opts.team;
        this.environment = opts.environment;
        this.plan = opts.plan;
        this.integration = opts.integration;
        this.request = opts.request;
        this.logContextGetter = opts.logContextGetter;
    }

    async getConnectionForWebhook(connectionId: string): Promise<{ connectionId: string; metadata: Metadata | null } | null> {
        const { success, response: connection } = await connectionService.getConnection(connectionId, this.integration.unique_key, this.environment.id);

        if (!success || !connection) {
            return null;
        }

        return {
            connectionId: connection.connection_id,
            metadata: 'metadata' in connection ? connection.metadata : null
        };
    }

    async executeScriptForWebhooks({
        payload,
        webhookType,
        webhookHeaderValue,
        webhookTypeValue,
        connectionIdentifier,
        connectionIdentifierValue,
        propName
    }: {
        payload: Record<string, any>;
        webhookType?: string;
        webhookHeaderValue?: string;
        webhookTypeValue?: string;
        connectionIdentifier?: string;
        connectionIdentifierValue?: string;
        propName?: string;
    }): Promise<{ connectionIds: string[]; connectionMetadata: Record<string, Metadata | null> }> {
        let connections: DBConnectionDecrypted[] | null | ConnectionInternal[] = null;

        const identifierValue = connectionIdentifierValue || (connectionIdentifier ? get(payload, connectionIdentifier) : undefined);

        if (!connectionIdentifier && !identifierValue) {
            connections = await connectionService.getConnectionsByEnvironmentAndConfig(this.environment.id, this.integration.unique_key);
        } else if (!identifierValue) {
            return { connectionIds: [], connectionMetadata: {} };
        } else if (propName === 'connectionId') {
            const { success, response: connection } = await connectionService.getConnection(identifierValue, this.integration.unique_key, this.environment.id);

            if (success && connection) {
                connections = [connection];
            }
        } else if (propName && propName.includes('metadata.')) {
            const strippedMetadata = propName.replace('metadata.', '');
            connections = await connectionService.findConnectionsByMetadataValue({
                metadataProperty: strippedMetadata,
                payloadIdentifier: identifierValue,
                configId: this.integration.id,
                environmentId: this.environment.id
            });
        } else {
            connections = await connectionService.findConnectionsByConnectionConfigValue(
                propName || connectionIdentifier || '',
                identifierValue,
                this.environment.id,
                this.integration.id
            );
        }

        if (!connections || connections.length === 0) {
            return { connectionIds: [], connectionMetadata: {} };
        }

        // Disable all webhook executions, but still return the resolved connections.
        if (this.plan && !this.plan.has_webhooks_script) {
            return connectionResult(connections);
        }

        // Use webhookTypeValue if provided (direct value from headers), otherwise extract from payload.
        const type = webhookTypeValue || (webhookType ? get(payload, webhookType) : undefined);
        await dispatchWebhookExecutions({
            context: this.dispatchContext(),
            connections,
            type,
            webhookHeaderValue,
            payload
        });

        return connectionResult(connections);
    }

    private dispatchContext(): DispatchContext {
        return {
            team: this.team,
            environment: this.environment,
            integration: this.integration,
            request: this.request,
            logContextGetter: this.logContextGetter
        };
    }
}

function connectionResult(connections: (DBConnectionDecrypted | ConnectionInternal)[]): {
    connectionIds: string[];
    connectionMetadata: Record<string, Metadata | null>;
} {
    const connectionMetadata = connections.reduce<Record<string, Metadata | null>>((acc, connection) => {
        acc[connection.connection_id] = 'metadata' in connection ? connection.metadata : null;
        return acc;
    }, {});
    return { connectionIds: connections.map((connection) => connection.connection_id), connectionMetadata };
}
