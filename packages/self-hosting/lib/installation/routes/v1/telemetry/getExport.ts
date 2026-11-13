import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';

import tracer from 'dd-trace';
import * as z from 'zod';

import { readMetricPages } from '@nangohq/hosted-telemetry';
import { validateRequest } from '@nangohq/utils';

import { sendError } from '../../../../cloud/errors.js';
import { logger } from '../../../../utils.js';
import { DAY_SETTLE_MINUTES, MANUAL_TELEMETRY_EXPORT_MAX_DAYS } from '../../../constants.js';
import { writeManualTelemetryExport } from '../../../manual-telemetry-export.js';

import type { ManualTelemetryExportConfig } from '../../../manual-telemetry-export.js';
import type { ApiError, Endpoint } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, Route, RouteHandler } from '@nangohq/utils';

const path = '/v1/telemetry/export';
const method = 'GET';

type GetExport = Endpoint<{
    Method: typeof method;
    Path: typeof path;
    Querystring: { from: string; to: string };
    Error: ApiError<'server_error'>;
    Success: never;
}>;

export const route: Route<GetExport> = { path, method };

const DAY_MS = 24 * 60 * 60 * 1000;
const startOf = (day: string) => new Date(`${day}T00:00:00.000Z`);

/** Both are UTC days. `from` is the first day in the file and `to` is the first day that is not. */
const querySchema = z
    .strictObject({ from: z.iso.date(), to: z.iso.date() })
    .refine(({ from, to }) => from < to, { path: ['to'], message: '`to` must be after `from`' })
    .refine(({ from, to }) => startOf(to).getTime() - startOf(from).getTime() <= MANUAL_TELEMETRY_EXPORT_MAX_DAYS * DAY_MS, {
        path: ['to'],
        message: `an export holds at most ${MANUAL_TELEMETRY_EXPORT_MAX_DAYS} days`
    })
    .refine(({ to }) => startOf(to).getTime() <= Date.now() - DAY_SETTLE_MINUTES * 60_000, {
        path: ['to'],
        message: 'the last day of the range is not complete yet'
    });

const validate = validateRequest<GetExport>({ parseQuery: (query) => querySchema.parse(query) });

/** Reads the first chunk now, so a source that fails at once fails before the response starts. */
async function primed(chunks: AsyncGenerator<string>): Promise<AsyncGenerator<string>> {
    const first = await chunks.next();
    return (async function* () {
        if (!first.done) {
            yield first.value;
            yield* chunks;
        }
    })();
}

const handler = ({ knex, schema, installationId, privateKeyPem, metrics }: ManualTelemetryExportConfig) => {
    return async (_req: EndpointRequest, res: EndpointResponse<GetExport>): Promise<void> => {
        const { from, to } = res.locals.parsedQuery;
        const range = { from: startOf(from), to: startOf(to) };
        const span = tracer.scope().active();
        span?.addTags({ 'nango.installationId': installationId, 'nango.export.from': from, 'nango.export.to': to });

        let chunks: AsyncGenerator<string>;
        try {
            chunks = await primed(
                writeManualTelemetryExport({
                    pages: readMetricPages(knex, { ...range, ...(schema && { schema }) }),
                    installationId,
                    privateKeyPem,
                    metrics,
                    ...range
                })
            );
        } catch (err) {
            sendError(res, { status: 500, code: 'server_error', message: 'the telemetry could not be read', cause: err });
            return;
        }

        res.status(200)
            .type('application/gzip')
            .setHeader('content-disposition', `attachment; filename="nango-telemetry-${installationId}-${from}-${to}.ndjson.gz"`);
        try {
            await pipeline(Readable.from(chunks), createGzip(), res);
        } catch (err) {
            // The response has started, so the status cannot change: the client gets a file without its trailer.
            if (err instanceof Error && 'code' in err && err.code === 'ERR_STREAM_PREMATURE_CLOSE') {
                logger.warning(`The client closed the connection before the end of the telemetry export from ${from} to ${to}`);
                return;
            }
            span?.setTag('error', err);
            logger.error(`The telemetry export from ${from} to ${to} stopped before its end`, err);
        }
    };
};

export const routeHandler = (config: ManualTelemetryExportConfig): RouteHandler<GetExport> => {
    return { ...route, validate, handler: handler(config) };
};
