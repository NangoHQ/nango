import { metrics, validateRequest } from '@nangohq/utils';

import { telemetryBodySchema, telemetryParamsSchema } from './validate.js';

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
    const byCallsite = Map.groupBy(dataTransferEvents, (event) => event.callsite);

    for (const [callsite, callsiteEvents] of byCallsite) {
        const bytesSent = callsiteEvents.reduce((acc, event) => Math.min(acc + event.bytesSent, Number.MAX_SAFE_INTEGER), 0);
        const bytesReceived = callsiteEvents.reduce((acc, event) => Math.min(acc + event.bytesReceived, Number.MAX_SAFE_INTEGER), 0);

        if (callsite === 'proxy') {
            metrics.increment(metrics.Types.PROXY_REQUEST_SIZE_IN_BYTES, bytesSent, { callsite: 'runner' });
            metrics.increment(metrics.Types.PROXY_RESPONSE_SIZE_IN_BYTES, bytesReceived, { callsite: 'runner' });
        } else {
            metrics.increment(metrics.Types.RUNNER_UNCONTROLLED_FETCH_REQUEST_SIZE_BYTES, bytesSent);
            metrics.increment(metrics.Types.RUNNER_UNCONTROLLED_FETCH_RESPONSE_SIZE_BYTES, bytesReceived);
        }
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
