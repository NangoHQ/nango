import type { ApiError, Endpoint, MergingStrategy, PutRecordsSuccess } from '@nangohq/types';
import { validateRequest } from '@nangohq/utils';
import type { EndpointRequest, EndpointResponse, RouteHandler } from '@nangohq/utils';
import { persistRecords, recordsPath } from '../../../../../../../../../records.js';
import { recordsRequestParser } from './validate.js';

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

const handler = async (req: EndpointRequest<PutRecords>, res: EndpointResponse<PutRecords>) => {
    const { environmentId, nangoConnectionId, syncId, syncJobId }: PutRecords['Params'] = req.params;
    const { model, records, providerConfigKey, connectionId, activityLogId, merging }: PutRecords['Body'] = req.body;
    const result = await persistRecords({
        persistType: 'update',
        environmentId,
        connectionId,
        providerConfigKey,
        nangoConnectionId,
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

export const routeHandler: RouteHandler<PutRecords> = {
    method,
    path,
    validate,
    handler
};
