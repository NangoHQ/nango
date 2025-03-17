import type { ApiError, Endpoint, GetRecordsSuccess } from '@nangohq/types';
import { validateRequest } from '@nangohq/utils';
import type { EndpointRequest, EndpointResponse, RouteHandler, Route } from '@nangohq/utils';
import { records } from '@nangohq/records';
import { getRecordsRequestParser } from './validate.js';
import type { LogContextStateless } from '@nangohq/logs';
import { logContextGetter } from '@nangohq/logs';
import type { AuthLocals } from '../../../../../middleware/auth.middleware.js';

type GetRecords = Endpoint<{
    Method: typeof method;
    Path: typeof path;
    Params: {
        environmentId: number;
        nangoConnectionId: number;
    };
    Querystring: {
        model: string;
        externalIds?: string[] | undefined;
        cursor?: string | undefined;
        limit: number;
        // TODO: fix this to be only string
        activityLogId?: string | undefined;
    };
    Error: ApiError<'get_records_failed'>;
    Success: GetRecordsSuccess;
}>;

export const path = '/environment/:environmentId/connection/:nangoConnectionId/records';
const method = 'GET';

const validate = validateRequest<GetRecords>(getRecordsRequestParser);

const handler = async (req: EndpointRequest<GetRecords>, res: EndpointResponse<GetRecords, AuthLocals>) => {
    const {
        params: { nangoConnectionId },
        query: { model, externalIds, cursor, limit, activityLogId }
    } = req;

    let logCtx: LogContextStateless | undefined = undefined;
    const { account } = res.locals;
    if (activityLogId) {
        logCtx = logContextGetter.getStateLess({ id: String(activityLogId), accountId: account.id });
    }

    const result = await records.getRecords({
        connectionId: nangoConnectionId,
        model,
        cursor,
        externalIds,
        limit
    });

    if (result.isOk()) {
        void logCtx?.info(`Successfully found ${result.value.records.length} records`, {
            model,
            externalIds,
            limit
        });
        res.json(result.value);
    } else {
        res.status(500).json({ error: { code: 'get_records_failed', message: `Failed to get records: ${result.error.message}` } });
    }
    return;
};

export const route: Route<GetRecords> = { path, method };

export const routeHandler: RouteHandler<GetRecords, AuthLocals> = {
    method,
    path,
    validate,
    handler
};
