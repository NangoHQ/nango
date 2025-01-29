import type { ApiError, Endpoint } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, RouteHandler, Route } from '@nangohq/utils';
import type { CursorOffset } from '@nangohq/records';
import { records } from '@nangohq/records';
import { validateCursor } from './validate.js';

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
    Success: {
        cursor?: string;
    };
}>;

export const path = '/environment/:environmentId/connection/:nangoConnectionId/cursor';
const method = 'GET';

const validate = validateCursor<GetCursor>();

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
