import type { ApiError, DeleteRecordsSuccess, Endpoint, MergingStrategy } from '@nangohq/types';
import { validateRequest } from '@nangohq/utils';
import type { EndpointRequest, EndpointResponse, RouteHandler, Route } from '@nangohq/utils';
import { persistRecords, recordsPath } from '../../../../../../../../../records.js';
import { recordsRequestParser } from './validate.js';

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

const handler = async (req: EndpointRequest<DeleteRecords>, res: EndpointResponse<DeleteRecords>) => {
    const { environmentId, nangoConnectionId, syncId, syncJobId }: DeleteRecords['Params'] = req.params;
    const { model, records, providerConfigKey, connectionId, activityLogId, merging }: DeleteRecords['Body'] = req.body;
    const result = await persistRecords({
        persistType: 'delete',
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
        res.status(500).json({ error: { code: 'delete_records_failed', message: `Failed to delete records: ${result.error.message}` } });
    }
    return;
};

export const route: Route<DeleteRecords> = { path, method };

export const routeHandler: RouteHandler<DeleteRecords> = {
    method,
    path,
    validate,
    handler
};
