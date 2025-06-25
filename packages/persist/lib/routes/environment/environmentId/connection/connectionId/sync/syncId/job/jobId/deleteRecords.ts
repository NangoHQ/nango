import { validateRequest } from '@nangohq/utils';

import { recordsRequestParser } from './validate.js';
import { persistRecords, recordsPath } from '../../../../../../../../../records.js';

import type { AuthLocals } from '../../../../../../../../../middleware/auth.middleware.js';
import type { ApiError, DeleteRecordsSuccess, Endpoint, MergingStrategy } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, Route, RouteHandler } from '@nangohq/utils';

type DeleteRecords = Endpoint<{
    Method: typeof method;
    Path: typeof path;
    Params: {
        environmentId: number;
        nangoConnectionId: number;
        syncId: string;
        syncJobId: number;
    };
    Body: {
        model: string;
        records: Record<string, any>[];
        providerConfigKey: string;
        connectionId: string;
        activityLogId: string;
        merging: MergingStrategy;
    };
    Error: ApiError<'delete_records_failed'>;
    Success: DeleteRecordsSuccess;
}>;

const path = recordsPath;
const method = 'DELETE';

const validate = validateRequest<DeleteRecords>(recordsRequestParser);

const handler = async (_req: EndpointRequest, res: EndpointResponse<DeleteRecords, AuthLocals>) => {
    const { environmentId, nangoConnectionId, syncId, syncJobId }: DeleteRecords['Params'] = res.locals.parsedParams;
    const { model, records, providerConfigKey, activityLogId, merging }: DeleteRecords['Body'] = res.locals.parsedBody;
    const { account, plan } = res.locals;
    const result = await persistRecords({
        plan,
        persistType: 'delete',
        environmentId,
        accountId: account.id,
        connectionId: nangoConnectionId,
        providerConfigKey,
        syncId,
        syncJobId,
        model,
        records,
        activityLogId,
        merging
    });
    if (result.isOk()) {
        res.status(200).send({ nextMerging: result.value });
    } else {
        res.status(500).json({ error: { code: 'delete_records_failed', message: `Failed to delete records: ${result.error.message}` } });
    }
    return;
};

export const route: Route<DeleteRecords> = { path, method };

export const routeHandler: RouteHandler<DeleteRecords, AuthLocals> = {
    method,
    path,
    validate,
    handler
};
