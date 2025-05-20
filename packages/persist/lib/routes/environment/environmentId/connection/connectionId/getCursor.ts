import { records } from '@nangohq/records';
import { validateRequest } from '@nangohq/utils';

import { getCursorRequestParser } from './validate.js';

import type { AuthLocals } from '../../../../../middleware/auth.middleware.js';
import type { ApiError, CursorOffset, Endpoint, GetCursorSuccess } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, Route, RouteHandler } from '@nangohq/utils';

type GetCursor = Endpoint<{
    Method: typeof method;
    Path: typeof path;
    Params: {
        environmentId: number;
        nangoConnectionId: number;
    };
    Querystring: {
        model: string;
        offset: CursorOffset;
    };
    Error: ApiError<'get_cursor_failed' | 'cursor_not_found'>;
    Success: GetCursorSuccess;
}>;

export const path = '/environment/:environmentId/connection/:nangoConnectionId/cursor';
const method = 'GET';

const validate = validateRequest<GetCursor>(getCursorRequestParser);

const handler = async (_req: EndpointRequest, res: EndpointResponse<GetCursor, AuthLocals>) => {
    const {
        params: { nangoConnectionId },
        query: { model, offset }
    } = res.locals;
    const result = await records.getCursor({
        connectionId: nangoConnectionId,
        model,
        offset
    });
    if (result.isOk()) {
        res.json(result.value ? { cursor: result.value } : {});
    } else {
        res.status(500).json({ error: { code: 'get_cursor_failed', message: `Failed to get cursor: ${result.error.message}` } });
    }
    return;
};

export const route: Route<GetCursor> = { path, method };

export const routeHandler: RouteHandler<GetCursor, AuthLocals> = {
    method,
    path,
    validate,
    handler
};
