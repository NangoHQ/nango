import { makeDataTransferEvent } from '@nangohq/shared';
import { validateRequest } from '@nangohq/utils';

import { telemetryBodySchema, telemetryParamsSchema } from './validate.js';
import { pubsub } from '../../../pubsub.js';

import type { AuthLocals } from '../../../middleware/auth.middleware.js';
import type { PostRunnerTelemetry } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, Route, RouteHandler } from '@nangohq/utils';

const path = '/environment/:environmentId/runner/telemetry';
const method = 'POST';

const validate = validateRequest<PostRunnerTelemetry>({
    parseParams: (data) => telemetryParamsSchema.parse(data),
    parseBody: (data: unknown) => telemetryBodySchema.parse(data)
});

const handler = (_req: EndpointRequest, res: EndpointResponse<PostRunnerTelemetry, AuthLocals>) => {
    const { account, environment } = res.locals;
    const body = res.locals.parsedBody;

    const dataTransferEvents = body.events
        .filter((event) => event.type === 'data_transfer')
        .map((event) =>
            makeDataTransferEvent({
                pkg: 'runner',
                callsite: event.callsite,
                accountId: account.id,
                connectionId: event.connectionId,
                integrationId: event.integrationId,
                environmentId: environment.id,
                environmentName: environment.name,
                meteredBytes: { sent: event.bytesSent, received: event.bytesReceived },
                ...(event.syncId !== undefined ? { syncId: event.syncId } : {}),
                count: event.count
            })
        );

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
