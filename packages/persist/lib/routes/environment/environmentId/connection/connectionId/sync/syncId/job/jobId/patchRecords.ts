import type { ApiError, Endpoint } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, RouteHandler } from '@nangohq/utils';
import { persistRecords, recordsPath } from '../../../../../../../../../records.js';
import { validateRecords } from './validate.js';

type PatchRecords = Endpoint<{
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
    };
    Error: ApiError<'patch_records_failed'>;
    Success: never;
}>;

const path = recordsPath;
const method = 'PATCH';

const validate = validateRecords<PatchRecords>();

const handler = async (req: EndpointRequest<PatchRecords>, res: EndpointResponse<PatchRecords>) => {
    const {
        params: { environmentId, nangoConnectionId, syncId, syncJobId },
        body: { model, records, providerConfigKey, connectionId, activityLogId }
    } = req;
    const result = await persistRecords({
        persistType: 'patch',
        environmentId,
        connectionId,
        providerConfigKey,
        nangoConnectionId,
        syncId,
        syncJobId,
        model,
        records,
        activityLogId
    });
    if (result.isOk()) {
        res.status(204).send();
    } else {
        res.status(500).json({ error: { code: 'patch_records_failed', message: `Failed to save records: ${result.error.message}` } });
    }
    return;
};

export const routeHandler: RouteHandler<PatchRecords> = {
    method,
    path,
    validate,
    handler
};
