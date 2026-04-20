import { isAxiosError } from 'axios';

import { ActionError, ExecutionError, SDKError } from '@nangohq/runner-sdk';
import { errorToObject, truncateJson } from '@nangohq/utils';

import type { NangoActionRunner, NangoSyncRunner } from './sdk/sdk.js';

export function formatStackTrace(stack: string | undefined, filename: string): string[] {
    if (!stack) {
        return [];
    }
    return stack
        .split('\n')
        .filter((s, i) => i === 0 || s.includes(filename))
        .map((s) => s.trim())
        .slice(0, 10);
}

function isCrossProcessActionError(err: unknown): err is { type: string; payload?: Record<string, unknown> } {
    return (
        typeof err === 'object' &&
        err !== null &&
        (err as Record<string, unknown>)['__crossProcessActionError'] === true &&
        typeof (err as Record<string, unknown>)['type'] === 'string'
    );
}

export function mapExecCaughtError(
    err: unknown,
    nango: NangoActionRunner | NangoSyncRunner,
    filename: string,
    span: { setTag(key: string, value: unknown): void }
): ExecutionError {
    if (isCrossProcessActionError(err)) {
        return new ExecutionError({
            type: err.type,
            payload: truncateJson(err.payload || {}),
            status: 500,
            telemetryBag: nango.telemetryBag,
            checkpoints: nango.getCheckpointRange()
        });
    }

    if (err instanceof ActionError) {
        const { type, payload } = err;
        return new ExecutionError({
            type,
            payload: truncateJson(Array.isArray(payload) || (typeof payload !== 'object' && payload !== null) ? { message: payload } : payload || {}),
            status: 500,
            telemetryBag: nango.telemetryBag,
            checkpoints: nango.getCheckpointRange()
        });
    }

    if (err instanceof SDKError) {
        span.setTag('error', err);
        return new ExecutionError({
            type: err.code,
            payload: truncateJson(err.payload),
            status: 500,
            telemetryBag: nango.telemetryBag,
            checkpoints: nango.getCheckpointRange()
        });
    }

    if (
        typeof err === 'object' &&
        err !== null &&
        'message' in err &&
        typeof (err as Record<string, unknown>)['message'] === 'string' &&
        !isAxiosError(err) &&
        !(err instanceof Error)
    ) {
        const o = err as Record<string, unknown>;
        span.setTag('error', o);
        return new ExecutionError({
            type: 'script_internal_error',
            payload: truncateJson({
                name: o['name'],
                message: o['message'],
                stack: o['stack']
            }),
            status: 500,
            telemetryBag: nango.telemetryBag,
            checkpoints: nango.getCheckpointRange()
        });
    }

    if (isAxiosError<unknown, unknown>(err)) {
        span.setTag('error', err);
        if (err.response) {
            const maybeData = err.response.data;

            let errorResponse: unknown = {};
            if (maybeData && typeof maybeData === 'object' && 'payload' in maybeData) {
                errorResponse = maybeData.payload as Record<string, unknown>;
            } else {
                errorResponse = maybeData;
            }

            const headers = Object.fromEntries(
                Object.entries(err.response.headers)
                    .map<[string, string]>(([k, v]) => [k.toLowerCase(), String(v)])
                    .filter(([k]) => k === 'content-type' || k.startsWith('x-rate'))
            );

            const responseBody: Record<string, unknown> = truncateJson(
                errorResponse && typeof errorResponse === 'object' ? (errorResponse as Record<string, unknown>) : { message: errorResponse }
            );

            let type = 'script_http_error';
            if (err.response.status === 429 && err.response.config.url) {
                const url = new URL(err.response.config.url);
                if (url.hostname === 'api.nango.dev' || url.hostname === 'localhost') {
                    type = 'script_api_rate_limit_error';
                }
            }

            return new ExecutionError({
                type,
                payload: responseBody,
                status: err.response.status,
                additional_properties: {
                    upstream_response: {
                        status: err.response.status,
                        headers,
                        body: responseBody
                    }
                },
                telemetryBag: nango.telemetryBag,
                checkpoints: nango.getCheckpointRange()
            });
        }
        const tmp = errorToObject(err);
        const stacktrace = formatStackTrace(tmp.stack, filename);

        return new ExecutionError({
            type: 'script_network_error',
            payload: truncateJson({
                name: tmp.name || 'Error',
                code: tmp.code,
                message: tmp.message,
                ...(stacktrace.length > 0 ? { stacktrace } : {})
            }),
            status: 500,
            telemetryBag: nango.telemetryBag,
            checkpoints: nango.getCheckpointRange()
        });
    }

    if (err instanceof Error) {
        const tmp = errorToObject(err);
        span.setTag('error', tmp);

        const stacktrace = formatStackTrace(tmp.stack, filename);

        return new ExecutionError({
            type: 'script_internal_error',
            payload: truncateJson({
                name: tmp.name || 'Error',
                code: tmp.code,
                message: tmp.message,
                ...(stacktrace.length > 0 ? { stacktrace } : {})
            }),
            status: 500,
            telemetryBag: nango.telemetryBag,
            checkpoints: nango.getCheckpointRange()
        });
    }

    const tmp = errorToObject(!err || typeof err !== 'object' ? new Error(JSON.stringify(err)) : err);
    span.setTag('error', tmp);

    const stacktrace = formatStackTrace(tmp.stack, filename);

    return new ExecutionError({
        type: 'script_internal_error',
        payload: truncateJson({
            name: tmp.name || 'Error',
            code: tmp.code,
            message: tmp.message,
            ...(stacktrace.length > 0 ? { stacktrace } : {})
        }),
        status: 500,
        telemetryBag: nango.telemetryBag,
        checkpoints: nango.getCheckpointRange()
    });
}
