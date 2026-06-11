import { validateRequest } from '@nangohq/utils';

import { telemetryBodySchema, telemetryParamsSchema } from './validate.js';
import { pubsub } from '../../../pubsub.js';

import type { AuthLocals } from '../../../middleware/auth.middleware.js';
import type { DBEnvironment, DBTeam, PostRunnerTelemetry, RunnerDataTransferTelemetry, UsageDataTransferEvent } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, Route, RouteHandler } from '@nangohq/utils';

const path = '/environment/:environmentId/runner/telemetry';
const method = 'POST';

const validate = validateRequest<PostRunnerTelemetry>({
    parseParams: (data) => telemetryParamsSchema.parse(data),
    parseBody: (data: unknown) => telemetryBodySchema.parse(data)
});

function makeDataTransferEvent(
    account: DBTeam,
    environment: DBEnvironment,
    event: RunnerDataTransferTelemetry,
    direction: 'ingress' | 'egress'
): Omit<UsageDataTransferEvent, 'idempotencyKey' | 'createdAt'> {
    return {
        subject: 'usage',
        type: 'usage.data_transfer',
        payload: {
            value: direction === 'ingress' ? event.bytesReceived : event.bytesSent,
            properties: {
                accountId: account.id,
                environmentId: environment.id,
                environmentName: environment.name,
                integrationId: event.integrationId,
                connectionId: event.connectionId,
                package: 'runner',
                callsite: event.callsite,
                direction,
                ...(event.syncId ? { syncId: event.syncId } : {})
            }
        }
    };
}

const handler = (_req: EndpointRequest, res: EndpointResponse<PostRunnerTelemetry, AuthLocals>) => {
    const { account, environment } = res.locals;
    const body = res.locals.parsedBody;

    const dataTransferEvents = body.events
        .filter((event) => event.type === 'data_transfer')
        .flatMap((event) => [
            ...(event.bytesSent > 0 ? [makeDataTransferEvent(account, environment, event, 'egress')] : []),
            ...(event.bytesReceived > 0 ? [makeDataTransferEvent(account, environment, event, 'ingress')] : [])
        ]);

    if (dataTransferEvents.length > 0) {
        void pubsub.publisher.publishBatch({ subject: 'usage', events: dataTransferEvents });
    }

    res.status(204).send();
    return;
};

export const route: Route<PostRunnerTelemetry> = { method, path };

export const routeHandler: RouteHandler<PostRunnerTelemetry, AuthLocals> = {
    ...route,
    validate,
    handler
};
