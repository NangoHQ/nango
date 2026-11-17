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
    Error: ApiError<'missing_key' | 'invalid_key' | 'invalid_request' | 'license_expired' | 'server_error'>;
    Success: never;
}>;

export const route: Route<GetExport> = { path, method };

const DAY_MS = 24 * 60 * 60 * 1000;
const startOf = (day: string) => new Date(`${day}T00:00:00.000Z`);
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Both are UTC days. `from` is the first day in the file and `to` is the first day that is not. A day the installation
 * no longer keeps is rejected, because the file would say that nothing happened on it.
 */
// Stops at a badly written day, so the range checks below only see real days.
const day = z.iso.date({ error: 'must be a day written as YYYY-MM-DD', abort: true });

const querySchema = (retentionDays: number) =>
    z
        .strictObject({ from: day, to: day })
        .refine(({ from }) => startOf(from).getTime() >= startOf(today()).getTime() - retentionDays * DAY_MS, {
            path: ['from'],
            message: `the installation only keeps ${retentionDays} days of telemetry`
        })
        .refine(({ from, to }) => from < to, { path: ['to'], message: '`to` must be after `from`' })
        .refine(({ from, to }) => startOf(to).getTime() - startOf(from).getTime() <= MANUAL_TELEMETRY_EXPORT_MAX_DAYS * DAY_MS, {
            path: ['to'],
            message: `an export holds at most ${MANUAL_TELEMETRY_EXPORT_MAX_DAYS} days`
        })
        .refine(({ to }) => startOf(to).getTime() <= Date.now() - DAY_SETTLE_MINUTES * 60_000, {
            path: ['to'],
            message: 'the last day of the range is not complete yet'
        });

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

const handler = ({ knex, schema, installationId, privateKeyPem, metrics, licenseGraceUntil }: ManualTelemetryExportConfig) => {
    return async (_req: EndpointRequest, res: EndpointResponse<GetExport>): Promise<void> => {
        if (licenseGraceUntil <= new Date()) {
            sendError(res, { status: 403, code: 'license_expired', message: `the grace period of the license ended on ${licenseGraceUntil.toISOString()}` });
            return;
        }
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
    const query = querySchema(config.retentionDays);
    return { ...route, validate: validateRequest<GetExport>({ parseQuery: (input) => query.parse(input) }), handler: handler(config) };
};
