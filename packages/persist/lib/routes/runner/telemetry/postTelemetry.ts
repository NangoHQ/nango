import { metrics, validateRequest } from '@nangohq/utils';

import { telemetryBodySchema, telemetryParamsSchema } from './validate.js';
import { logger } from '../../../logger.js';

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
    const { events } = res.locals.parsedBody;

    const dataTransferEvents = events.filter((event) => event.type === 'data_transfer');

    const totalBytesSent = dataTransferEvents.reduce((acc, event) => acc + event.bytesSent, 0);
    const totalBytesReceived = dataTransferEvents.reduce((acc, event) => acc + event.bytesReceived, 0);

    logger.info(`Received ${dataTransferEvents.length} data transfer events: ${totalBytesSent} bytes sent, ${totalBytesReceived} bytes received`);
    metrics.increment(metrics.Types.PROXY_REQUEST_SIZE_IN_BYTES, totalBytesSent, { callsite: 'runner' });
    metrics.increment(metrics.Types.PROXY_RESPONSE_SIZE_IN_BYTES, totalBytesReceived, { callsite: 'runner' });

    res.status(204).send();
    return;
};

export const route: Route<PostRunnerTelemetry> = { method, path };

export const routeHandler: RouteHandler<PostRunnerTelemetry, AuthLocals> = {
    ...route,
    validate,
    handler
};
