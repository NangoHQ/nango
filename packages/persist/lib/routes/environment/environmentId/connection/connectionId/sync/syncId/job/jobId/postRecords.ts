import type { ApiError, Endpoint } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, RouteHandler } from '@nangohq/utils';
import { persistRecords, recordsPath } from '../../../../../../../../../records.js';
import { validateRecords } from './validate.js';

type PostRecords = Endpoint<{
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
    Error: ApiError<'post_records_failed'>;
    Success: never;
}>;

const path = recordsPath;
const method = 'POST';

const validate = validateRecords<PostRecords>();

const handler = async (req: EndpointRequest<PostRecords>, res: EndpointResponse<PostRecords>) => {
    const {
        params: { environmentId, nangoConnectionId, syncId, syncJobId },
        body: { model, records, providerConfigKey, connectionId, activityLogId }
    } = req;
    const result = await persistRecords({
        persistType: 'save',
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
        res.status(500).json({ error: { code: 'post_records_failed', message: `Failed to save records: ${result.error.message}` } });
    }
    return;
};

export const routeHandler: RouteHandler<PostRecords> = {
    method,
    path,
    validate,
    handler
};
