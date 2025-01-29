import type { ApiError, Endpoint } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, RouteHandler } from '@nangohq/utils';
import { persistRecords, recordsPath } from '../../../../../../../../../records.js';
import { validateRecords } from './validate.js';
import type { MergingStrategy } from '@nangohq/records';

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
    Success: {
        nextMerging: MergingStrategy;
    };
}>;

const path = recordsPath;
const method = 'PUT';

const validate = validateRecords<PutRecords>();

const handler = async (req: EndpointRequest<PutRecords>, res: EndpointResponse<PutRecords>) => {
    const {
        params: { environmentId, nangoConnectionId, syncId, syncJobId },
        body: { model, records, providerConfigKey, connectionId, activityLogId, merging }
    } = req;
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
