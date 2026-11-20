import tracer from 'dd-trace';

import { insertMetricsBatch } from '../../../clickhouse/metrics.js';
import { requestBody } from '../../../middleware/installation-token.middleware.js';
import { sendUploadError } from '../../../uploads/errors.js';
import { readUpload } from '../../../uploads/reader.js';

import type { InstallationMetricRow } from '../../../clickhouse/metrics.js';
import type { InstallationLocals } from '../../../middleware/installation-token.middleware.js';
import type { UploadApiErrorCode } from '../../../uploads/errors.js';
import type { ClickHouseClient } from '@clickhouse/client';
import type { ApiError, Endpoint } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, Route, RouteHandler } from '@nangohq/utils';
import type { NextFunction } from 'express';

const path = '/v1/telemetry/uploads';
const method = 'POST';

type PostUploads = Endpoint<{
    Method: typeof method;
    Path: typeof path;
    Body: { installationId: string; rows: InstallationMetricRow[] };
    Error: ApiError<UploadApiErrorCode>;
    Success: { rows: number };
}>;

export const route: Route<PostUploads> = { path, method };

const validate = (req: EndpointRequest, res: EndpointResponse<PostUploads, InstallationLocals>, next: NextFunction): void => {
    readUpload(requestBody(req))
        .then((upload) => {
            if (upload.isErr()) {
                sendUploadError(res, upload.error.code, upload.error.message, { installationId: res.locals.installation.uuid });
                return;
            }
            res.locals.parsedBody = upload.value;
            next();
        })
        .catch(next);
};

const handler = (clickhouse: ClickHouseClient) => {
    return async (_req: EndpointRequest, res: EndpointResponse<PostUploads, InstallationLocals>): Promise<void> => {
        const installationId = res.locals.installation.uuid;
        const { installationId: named, rows } = res.locals.parsedBody;
        tracer.scope().active()?.addTags({ 'nango.installationId': installationId, 'nango.upload.rows': rows.length });
        if (named !== installationId) {
            sendUploadError(res, 'installation_mismatch', 'the header names another installation than the token', { installationId });
            return;
        }

        const inserted = await insertMetricsBatch(clickhouse, { installationId, rows });
        if (inserted.isErr()) {
            sendUploadError(res, 'insert_failed', 'the upload could not be stored', { installationId, cause: inserted.error });
            return;
        }

        res.status(200).json({ rows: rows.length });
    };
};

export const routeHandler = (clickhouse: ClickHouseClient): RouteHandler<PostUploads, InstallationLocals> => {
    return { ...route, validate, handler: handler(clickhouse) };
};
