import { logContextGetter } from '@nangohq/logs';
import { records } from '@nangohq/records';
import { ENVS, metrics, parseEnvs, validateRequest } from '@nangohq/utils';

const envs = parseEnvs(ENVS);

import { getRecordsRequestParser } from './validate.js';

import type { AuthLocals } from '../../../../../middleware/auth.middleware.js';
import type { LogContextStateless } from '@nangohq/logs';
import type { ApiError, Endpoint, GetRecordsSuccess } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, Route, RouteHandler } from '@nangohq/utils';

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

const path = '/environment/:environmentId/connection/:nangoConnectionId/records';
const method = 'GET';

const validate = validateRequest<GetRecords>(getRecordsRequestParser);

const handler = async (_req: EndpointRequest, res: EndpointResponse<GetRecords, AuthLocals>) => {
    const {
        parsedParams: { nangoConnectionId },
        parsedQuery: { model, externalIds, cursor, limit, activityLogId }
    } = res.locals;

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
        const { budgetTruncated, ...response } = result.value;
        res.json(response);
        if (budgetTruncated) {
            metrics.increment(metrics.Types.RECORDS_BUDGET_TRUNCATE, 1, {
                accountId: account.id,
                service: 'persist',
                dryRun: String(envs.RECORDS_MAX_RESPONSE_SIZE_DRY_RUN)
            });
        }
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
