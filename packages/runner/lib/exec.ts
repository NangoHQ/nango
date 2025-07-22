import { Buffer } from 'buffer';
import * as crypto from 'crypto';
import * as vm from 'node:vm';
import * as url from 'url';

import { isAxiosError } from 'axios';
import * as botbuilder from 'botbuilder';
import tracer from 'dd-trace';
import * as soap from 'soap';
import * as unzipper from 'unzipper';
import * as zod from 'zod';

import { ActionError, SDKError } from '@nangohq/runner-sdk';
import { errorToObject, truncateJson } from '@nangohq/utils';

import { logger } from './logger.js';
import { Locks } from './sdk/locks.js';
import { NangoActionRunner, NangoSyncRunner, instrumentSDK } from './sdk/sdk.js';

import type { CreateAnyResponse, NangoActionBase, NangoSyncBase } from '@nangohq/runner-sdk';
import type { NangoProps, RunnerOutput } from '@nangohq/types';

interface ScriptExports {
    onWebhookPayloadReceived?: (nango: NangoSyncBase, payload?: object) => Promise<unknown>;
    default: ((nango: NangoActionBase, payload?: object) => Promise<unknown>) | CreateAnyResponse;
}

export async function exec({
    nangoProps,
    code,
    codeParams,
    abortController = new AbortController(),
    locks = new Locks()
}: {
    nangoProps: NangoProps;
    code: string;
    codeParams?: object | undefined;
    abortController?: AbortController;
    locks?: Locks;
}): Promise<RunnerOutput> {
    const rawNango = (() => {
        switch (nangoProps.scriptType) {
            case 'sync':
            case 'webhook':
                return new NangoSyncRunner(nangoProps, { locks });
            case 'action':
            case 'on-event':
                return new NangoActionRunner(nangoProps, { locks });
        }
    })();
    const nango = process.env['NANGO_TELEMETRY_SDK'] ? instrumentSDK(rawNango) : rawNango;
    nango.abortSignal = abortController.signal;

    const wrappedCode = `(function() { var module = { exports: {} }; var exports = module.exports; ${code}
        return module.exports;
    })();
    `;

    const filename = `${nangoProps.syncConfig.sync_name}-${nangoProps.providerConfigKey}.cjs`;

    return await tracer.trace<Promise<RunnerOutput>>('nango.runner.exec', async (span) => {
        span.setTag('accountId', nangoProps.team?.id)
            .setTag('environmentId', nangoProps.environmentId)
            .setTag('connectionId', nangoProps.connectionId)
            .setTag('providerConfigKey', nangoProps.providerConfigKey)
            .setTag('syncId', nangoProps.syncId);

        try {
            const script = new vm.Script(wrappedCode, {
                filename
            });
            const sandbox: vm.Context = {
                console,
                require: (moduleName: string) => {
                    switch (moduleName) {
                        case 'url':
                            return url;
                        case 'crypto':
                            return crypto;
                        case 'zod':
                            return zod;
                        case 'botbuilder':
                            return botbuilder;
                        case 'soap':
                            return soap;
                        case 'unzipper':
                            return unzipper;
                        default:
                            throw new Error(`Module '${moduleName}' is not allowed`);
                    }
                },
                Buffer,
                setTimeout,
                Error,
                URL,
                URLSearchParams
            };

            const context = vm.createContext(sandbox);
            const scriptExports = script.runInContext(context) as ScriptExports;

            const def = scriptExports.default;
            const isZeroYaml = typeof def === 'object';
            const isNangoYaml = !isZeroYaml && typeof scriptExports.default === 'function';

            if (!isZeroYaml && !isNangoYaml) {
                throw new Error(`Invalid script exports`);
            }
            if (isZeroYaml && (!nangoProps.syncConfig.sdk_version || !nangoProps.syncConfig.sdk_version.includes('-zero'))) {
                throw new Error(`Invalid script configuration`);
            }

            if (nangoProps.scriptType === 'webhook') {
                if (isZeroYaml) {
                    const payload = def;
                    if (payload.type !== 'sync') {
                        throw new Error('Incorrect script loaded for webhook');
                    }
                    if (!payload.onWebhook) {
                        throw new Error(`Missing onWebhook function`);
                    }

                    const output = await payload.onWebhook(nango as any, codeParams);
                    return { success: true, response: output, error: null };
                } else {
                    if (!scriptExports.onWebhookPayloadReceived) {
                        const content = `There is no onWebhookPayloadReceived export for ${nangoProps.syncId}`;

                        throw new Error(content);
                    }

                    const output = await scriptExports.onWebhookPayloadReceived(nango as NangoSyncRunner, codeParams);
                    return { success: true, response: output, error: null };
                }
            }

            // Action
            if (nangoProps.scriptType === 'action') {
                let inputParams = codeParams;
                if (typeof codeParams === 'object' && Object.keys(codeParams).length === 0) {
                    inputParams = undefined;
                }

                let output: unknown;
                if (isZeroYaml) {
                    const payload = def;
                    if (payload.type !== 'action') {
                        throw new Error('Incorrect script loaded for action');
                    }
                    if (!payload.exec) {
                        throw new Error(`Missing exec function`);
                    }
                    output = await payload.exec(nango as any, codeParams);
                } else {
                    output = await def(nango, inputParams);
                }

                return { success: true, response: output, error: null };
            }

            // Action
            if (nangoProps.scriptType === 'on-event') {
                let output: unknown;
                if (isZeroYaml) {
                    const payload = def;
                    if (payload.type !== 'onEvent') {
                        throw new Error('Incorrect script loaded for action');
                    }
                    if (!payload.exec) {
                        throw new Error(`Missing exec function`);
                    }
                    output = await payload.exec(nango as any);
                } else {
                    output = await def(nango);
                }
                return { success: true, response: output, error: null };
            }

            // Sync
            if (isZeroYaml) {
                const payload = def;
                if (payload.type !== 'sync') {
                    throw new Error('Incorrect script loaded for sync');
                }
                if (!payload.exec) {
                    throw new Error(`Missing exec function`);
                }

                await payload.exec(nango as any);
                return { success: true, response: true, error: null };
            } else {
                await def(nango);
                return { success: true, response: true, error: null };
            }
        } catch (err) {
            if (err instanceof ActionError) {
                // It's not a mistake, we don't want to report user generated error
                // span.setTag('error', error);
                const { type, payload } = err;
                return {
                    success: false,
                    error: {
                        type,
                        payload: truncateJson(
                            Array.isArray(payload) || (typeof payload !== 'object' && payload !== null) ? { message: payload } : payload || {}
                        ), // TODO: fix ActionError so payload is always an object
                        status: 500
                    },
                    response: null
                };
            }

            if (err instanceof SDKError) {
                span.setTag('error', err);
                return {
                    success: false,
                    error: {
                        type: err.code,
                        payload: truncateJson(err.payload),
                        status: 500
                    },
                    response: null
                };
            } else if (isAxiosError<unknown, unknown>(err)) {
                // isAxiosError lets us use something the shape of an axios error in
                // testing, which is handy with how strongly typed everything is

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

                    return {
                        success: false,
                        error: {
                            type: 'script_http_error',
                            payload: responseBody,
                            status: err.response.status,
                            additional_properties: {
                                upstream_response: {
                                    status: err.response.status,
                                    headers,
                                    body: responseBody
                                }
                            }
                        },
                        response: null
                    };
                } else {
                    const tmp = errorToObject(err);
                    return {
                        success: false,
                        error: {
                            type: 'script_network_error',
                            payload: truncateJson({ name: tmp.name || 'Error', code: tmp.code, message: tmp.message }),
                            status: 500
                        },
                        response: null
                    };
                }
            } else if (err instanceof Error) {
                const tmp = errorToObject(err);
                span.setTag('error', tmp);

                return {
                    success: false,
                    error: {
                        type: 'script_internal_error',
                        payload: truncateJson({ name: tmp.name || 'Error', code: tmp.code, message: tmp.message }),
                        status: 500
                    },
                    response: null
                };
            } else {
                const tmp = errorToObject(!err || typeof err !== 'object' ? new Error(JSON.stringify(err)) : err);
                span.setTag('error', tmp);

                const stacktrace = tmp.stack
                    ? tmp.stack
                          .split('\n')
                          .filter((s, i) => i === 0 || s.includes(filename))
                          .map((s) => s.trim())
                          .slice(0, 5) // max 5 lines
                    : [];

                return {
                    success: false,
                    error: {
                        type: 'script_internal_error',
                        payload: truncateJson({
                            name: tmp.name || 'Error',
                            code: tmp.code,
                            message: tmp.message,
                            ...(stacktrace.length > 0 ? { stacktrace } : {})
                        }),
                        status: 500
                    },
                    response: null
                };
            }
        } finally {
            try {
                await nango.releaseAllLocks();
            } catch (err) {
                logger.warning('Failed to release all locks', { reason: err });
            }
            span.finish();
        }
    });
}
