import type { ApiError, Endpoint, GetRecordsSuccess } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, RouteHandler, Route } from '@nangohq/utils';
import { records } from '@nangohq/records';
import { validateGetRecords } from './validate.js';

type GetRecords = Endpoint<{
    Method: typeof method;
    Path: typeof path;
    Params: {
        environmentId: number;
        nangoConnectionId: number;
    };
    Querystring: {
        model: string;
        externalIds: string[];
        cursor: string;
    };
    Error: ApiError<'get_records_failed'>;
    Success: GetRecordsSuccess;
}>;

export const path = '/environment/:environmentId/connection/:nangoConnectionId/records';
const method = 'GET';

const validate = validateGetRecords<GetRecords>();

const handler = async (req: EndpointRequest<GetRecords>, res: EndpointResponse<GetRecords>) => {
    const {
        params: { nangoConnectionId },
        query: { model, externalIds, cursor }
    } = req;
    const result = await records.getRecords({
        connectionId: nangoConnectionId,
        model,
        cursor,
        externalIds,
        limit: 100
    });

    if (result.isOk()) {
        res.json(result.value);
    } else {
        res.status(500).json({ error: { code: 'get_records_failed', message: `Failed to get records: ${result.error.message}` } });
    }
    return;
};

export const route: Route<GetRecords> = { path, method };

export const routeHandler: RouteHandler<GetRecords> = {
    method,
    path,
    validate,
    handler
};
