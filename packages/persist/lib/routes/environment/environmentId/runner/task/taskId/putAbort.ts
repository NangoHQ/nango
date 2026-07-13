import { validateRequest } from '@nangohq/utils';

import * as coordination from '../../../../../../coordination/index.js';
import { taskAbortParamsSchema } from '../../validate.js';

import type { AuthLocals } from '../../../../../../middleware/auth.middleware.js';
import type { PutTaskAbort } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, Route, RouteHandler } from '@nangohq/utils';

const path = '/environment/:environmentId/runner/task/:taskId/abort';
const method = 'PUT';

const validate = validateRequest<PutTaskAbort>({
    parseParams: (data) => taskAbortParamsSchema.parse(data)
});

const handler = async (_req: EndpointRequest, res: EndpointResponse<PutTaskAbort, AuthLocals>) => {
    const {
        parsedParams: { taskId }
    } = res.locals;

    const result = await coordination.setAbortFlag(taskId);
    if (result.isErr()) {
        res.status(500).json({ error: { code: 'put_task_abort_failed', message: result.error.message } });
        return;
    }

    res.status(204).send();
};

export const route: Route<PutTaskAbort> = { method, path };

export const routeHandler: RouteHandler<PutTaskAbort, AuthLocals> = {
    ...route,
    validate,
    handler
};
