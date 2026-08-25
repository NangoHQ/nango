import { validateRequest } from '@nangohq/utils';

import * as coordination from '../../../../../../coordination/index.js';
import { taskAbortParamsSchema } from '../../validate.js';

import type { AuthLocals } from '../../../../../../middleware/auth.middleware.js';
import type { GetTaskAbort } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, Route, RouteHandler } from '@nangohq/utils';

const path = '/environment/:environmentId/runner/task/:taskId/abort';
const method = 'GET';

const validate = validateRequest<GetTaskAbort>({
    parseParams: (data) => taskAbortParamsSchema.parse(data)
});

const handler = async (_req: EndpointRequest, res: EndpointResponse<GetTaskAbort, AuthLocals>) => {
    const {
        parsedParams: { taskId }
    } = res.locals;

    const result = await coordination.isAbortFlagSet(taskId);
    if (result.isErr()) {
        res.status(500).json({ error: { code: 'get_task_abort_failed', message: result.error.message } });
        return;
    }

    res.json({ aborted: result.value });
};

export const route: Route<GetTaskAbort> = { method, path };

export const routeHandler: RouteHandler<GetTaskAbort, AuthLocals> = {
    ...route,
    validate,
    handler
};
