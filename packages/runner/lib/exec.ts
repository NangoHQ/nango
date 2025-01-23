import type { NangoProps } from '@nangohq/shared';
import { AxiosError } from 'axios';
import { ActionError, NangoSync, NangoAction, instrumentSDK, SpanTypes, validateData, NangoError } from '@nangohq/shared';
import { Buffer } from 'buffer';
import * as vm from 'node:vm';
import * as url from 'url';
import * as crypto from 'crypto';
import * as zod from 'zod';
import * as soap from 'soap';
import * as botbuilder from 'botbuilder';
import tracer from 'dd-trace';
import { errorToObject, metrics, truncateJson } from '@nangohq/utils';
import { logger } from './utils.js';
import type { RunnerOutput } from '@nangohq/types';
import type { CreateAnyResponse } from '@nangohq/types/lib/scripts/api.js';

export async function exec(
    nangoProps: NangoProps,
    code: string,
    codeParams?: object,
    abortController: AbortController = new AbortController()
): Promise<RunnerOutput> {
    const rawNango = (() => {
        switch (nangoProps.scriptType) {
            case 'sync':
            case 'webhook':
                return new NangoSync(nangoProps);
            case 'action':
            case 'on-event':
                return new NangoAction(nangoProps);
        }
    })();
    const nango = process.env['NANGO_TELEMETRY_SDK'] ? instrumentSDK(rawNango) : rawNango;
    nango.abortSignal = abortController.signal;

    const wrappedCode = `(function() { var module = { exports: {} }; var exports = module.exports; ${code}
        return module.exports;
    })();
    `;

    const filename = `${nangoProps.syncConfig.sync_name}-${nangoProps.providerConfigKey}.js`;

    return await tracer.trace<Promise<RunnerOutput>>(SpanTypes.RUNNER_EXEC, async (span) => {
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
            const scriptExports = script.runInContext(context);

            const isZeroYaml =
                typeof scriptExports.default === 'object' &&
                typeof scriptExports.default.type === 'string' &&
                typeof scriptExports.default.params?.exec === 'function';
            const isNangoYaml = !isZeroYaml && typeof scriptExports.default === 'function';

            if (!isZeroYaml && !isNangoYaml) {
                throw new Error(`Invalid script exports`);
            }

            // -- Handle webhook scripts
            if (nangoProps.scriptType === 'webhook') {
                if (isZeroYaml) {
                    const payload: CreateAnyResponse = scriptExports.default;
                    if (payload.type !== 'sync') {
                        throw new Error('Incorrect script loaded for webhook');
                    }
                    if (!payload.params.onWebhook) {
                        throw new Error(`Missing onWebhook function`);
                    }

                    const output = await payload.params.onWebhook(nango as any, codeParams);
                    return { success: true, response: output, error: null };
                } else {
                    if (!scriptExports.onWebhookPayloadReceived) {
                        const content = `There is no onWebhookPayloadReceived export for ${nangoProps.syncId}`;
                        throw new Error(content);
                    }

                    const output = await scriptExports.onWebhookPayloadReceived(nango, codeParams);
                    return { success: true, response: output, error: null };
                }
            }

            // -- Handle action scripts
            if (nangoProps.scriptType === 'action') {
                let inputParams = codeParams;
                if (typeof codeParams === 'object' && Object.keys(codeParams).length === 0) {
                    inputParams = undefined;
                }

                // Validate action input against json schema
                const valInput = validateData({
                    version: nangoProps.syncConfig.version || '1',
                    input: inputParams,
                    modelName: nangoProps.syncConfig.input,
                    jsonSchema: nangoProps.syncConfig.models_json_schema
                });
                if (Array.isArray(valInput)) {
                    metrics.increment(metrics.Types.RUNNER_INVALID_ACTION_INPUT);
                    if (nangoProps.runnerFlags?.validateActionInput) {
                        span.setTag('error', new Error('invalid_action_input'));
                        return { success: false, response: null, error: { type: 'invalid_action_input', status: 400, payload: valInput } };
                    } else {
                        await nango.log('Invalid action input', { validation: valInput }, { level: 'warn' });
                        logger.error('data_validation_invalid_action_input');
                    }
                }

                let output: unknown;
                if (isZeroYaml) {
                    const payload: CreateAnyResponse = scriptExports.default;
                    if (payload.type !== 'action') {
                        throw new Error('Incorrect script loaded for action');
                    }
                    if (!payload.params.exec) {
                        throw new Error(`Missing exec function`);
                    }

                    output = await payload.params.exec(nango as any, codeParams);
                } else {
                    output = await scriptExports.default(nango, inputParams);
                }

                // Validate action output against json schema
                const valOutput = validateData({
                    version: nangoProps.syncConfig.version || '1',
                    input: output,
                    modelName: nangoProps.syncConfig.models && nangoProps.syncConfig.models.length > 0 ? nangoProps.syncConfig.models[0] : undefined,
                    jsonSchema: nangoProps.syncConfig.models_json_schema
                });
                if (Array.isArray(valOutput)) {
                    metrics.increment(metrics.Types.RUNNER_INVALID_ACTION_OUTPUT);
                    if (nangoProps.runnerFlags?.validateActionOutput) {
                        span.setTag('error', new Error('invalid_action_output'));
                        return {
                            success: false,
                            response: null,
                            error: { type: 'invalid_action_output', status: 400, payload: { output, validation: valOutput } }
                        };
                    } else {
                        await nango.log('Invalid action output', { output, validation: valOutput }, { level: 'warn' });
                        logger.error('data_validation_invalid_action_output');
                    }
                }

                return { success: true, response: output, error: null };
            }

            // -- Handle sync scripts
            if (isZeroYaml) {
                const payload: CreateAnyResponse = scriptExports.default;
                if (payload.type !== 'sync') {
                    throw new Error('Incorrect script loaded for sync');
                }
                if (!payload.params.exec) {
                    throw new Error(`Missing exec function`);
                }

                await payload.params.exec(nango as any);
            } else {
                await scriptExports.default(nango);
            }

            return { success: true, response: true, error: null };
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

            if (err instanceof NangoError) {
                span.setTag('error', err);
                return {
                    success: false,
                    error: {
                        type: err.type,
                        payload: truncateJson(err.payload),
                        status: err.status
                    },
                    response: null
                };
            } else if (err instanceof AxiosError) {
                span.setTag('error', err);
                if (err.response?.data) {
                    const errorResponse = err.response.data.payload || err.response.data;
                    return {
                        success: false,
                        error: {
                            type: 'script_http_error',
                            payload: truncateJson(typeof errorResponse === 'string' ? { message: errorResponse } : errorResponse),
                            status: err.response.status
                        },
                        response: null
                    };
                } else {
                    const tmp = errorToObject(err);
                    return {
                        success: false,
                        error: {
                            type: 'script_http_error',
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
            span.finish();
        }
    });
}
