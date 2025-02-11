import type { ApiError, Endpoint, CursorOffset, GetCursorSuccess } from '@nangohq/types';
import { validateRequest } from '@nangohq/utils';
import type { EndpointRequest, EndpointResponse, RouteHandler, Route } from '@nangohq/utils';
import { records } from '@nangohq/records';
import { getCursorRequestParser } from './validate.js';

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

const handler = async (req: EndpointRequest<GetCursor>, res: EndpointResponse<GetCursor>) => {
    const {
        params: { nangoConnectionId },
        query: { model, offset }
    } = req;
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

export const routeHandler: RouteHandler<GetCursor> = {
    method,
    path,
    validate,
    handler
};
