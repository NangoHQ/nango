import type { ApiError, Endpoint } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, RouteHandler, Route } from '@nangohq/utils';
import { persistRecords, recordsPath } from '../../../../../../../../../records.js';
import { validateRecords } from './validate.js';
import type { MergingStrategy } from '@nangohq/records';

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
    Success: {
        nextMerging: MergingStrategy;
    };
}>;

const path = recordsPath;
const method = 'DELETE';

const validate = validateRecords<DeleteRecords>();

const handler = async (req: EndpointRequest<DeleteRecords>, res: EndpointResponse<DeleteRecords>) => {
    const {
        params: { environmentId, nangoConnectionId, syncId, syncJobId },
        body: { model, records, providerConfigKey, connectionId, activityLogId, merging }
    } = req;
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
