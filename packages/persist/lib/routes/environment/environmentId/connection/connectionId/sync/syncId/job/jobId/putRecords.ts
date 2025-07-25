import { validateRequest } from '@nangohq/utils';

import { recordsRequestParser } from './validate.js';
import { persistRecords, recordsPath } from '../../../../../../../../../records.js';

import type { AuthLocals } from '../../../../../../../../../middleware/auth.middleware.js';
import type { ApiError, Endpoint, MergingStrategy, PutRecordsSuccess } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, RouteHandler } from '@nangohq/utils';

type PutRecords = Endpoint<{
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
    Error: ApiError<'put_records_failed'>;
    Success: PutRecordsSuccess;
}>;

const path = recordsPath;
const method = 'PUT';

const validate = validateRequest<PutRecords>(recordsRequestParser);

const handler = async (_req: EndpointRequest, res: EndpointResponse<PutRecords, AuthLocals>) => {
    const { environmentId, nangoConnectionId, syncId, syncJobId }: PutRecords['Params'] = res.locals.parsedParams;
    const { model, records, providerConfigKey, activityLogId, merging }: PutRecords['Body'] = res.locals.parsedBody;
    const { account, plan } = res.locals;
    const result = await persistRecords({
        plan,
        persistType: 'update',
        accountId: account.id,
        environmentId,
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
        res.status(500).json({ error: { code: 'put_records_failed', message: `Failed to update records: ${result.error.message}` } });
    }
    return;
};

export const routeHandler: RouteHandler<PutRecords, AuthLocals> = {
    method,
    path,
    validate,
    handler
};
