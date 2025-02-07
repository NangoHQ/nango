import type { ApiError, Endpoint, MergingStrategy, PostRecordsSuccess } from '@nangohq/types';
import { validateRequest } from '@nangohq/utils';
import type { EndpointRequest, EndpointResponse, RouteHandler } from '@nangohq/utils';
import { persistRecords, recordsPath } from '../../../../../../../../../records.js';
import { recordsRequestParser } from './validate.js';

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
        merging: MergingStrategy;
    };
    Error: ApiError<'post_records_failed'>;
    Success: PostRecordsSuccess;
}>;

const path = recordsPath;
const method = 'POST';

const validate = validateRequest<PostRecords>(recordsRequestParser);

const handler = async (req: EndpointRequest<PostRecords>, res: EndpointResponse<PostRecords>) => {
    const { environmentId, nangoConnectionId, syncId, syncJobId }: PostRecords['Params'] = req.params;
    const { model, records, providerConfigKey, connectionId, activityLogId, merging }: PostRecords['Body'] = req.body;
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
        activityLogId,
        merging: merging
    });
    if (result.isOk()) {
        res.status(200).send({ nextMerging: result.value });
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
