import type { NangoProps, RunnerOutput } from '@nangohq/shared';
import { AxiosError } from 'axios';
import { ActionError, NangoSync, NangoAction, instrumentSDK, SpanTypes, validateData, NangoError } from '@nangohq/shared';
import { syncAbortControllers } from './state.js';
import { Buffer } from 'buffer';
import * as vm from 'node:vm';
import * as url from 'url';
import * as crypto from 'crypto';
import * as zod from 'zod';
import * as botbuilder from 'botbuilder';
import tracer from 'dd-trace';
import { metrics, stringifyError } from '@nangohq/utils';
import { logger } from './utils.js';

export async function exec(
    nangoProps: NangoProps,
    scriptType: 'sync' | 'action' | 'webhook' | 'post-connection-script',
    code: string,
    codeParams?: object
): Promise<RunnerOutput> {
    const abortController = new AbortController();

    if (scriptType == 'sync' && nangoProps.syncId) {
        syncAbortControllers.set(nangoProps.syncId, abortController);
    }

    const rawNango = scriptType === 'action' ? new NangoAction(nangoProps) : new NangoSync(nangoProps);

    const nango = process.env['NANGO_TELEMETRY_SDK'] ? instrumentSDK(rawNango) : rawNango;

    nango.abortSignal = abortController.signal;

    const wrappedCode = `
        (function() {
            var module = { exports: {} };
            var exports = module.exports;
            ${code}
            return module.exports;
        })();
    `;

    return await tracer.trace<Promise<RunnerOutput>>(SpanTypes.RUNNER_EXEC, async (span) => {
        span.setTag('accountId', nangoProps.accountId)
            .setTag('environmentId', nangoProps.environmentId)
            .setTag('connectionId', nangoProps.connectionId)
            .setTag('providerConfigKey', nangoProps.providerConfigKey)
            .setTag('syncId', nangoProps.syncId);

        try {
            const script = new vm.Script(wrappedCode);
            const sandbox = {
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
                        default:
                            throw new Error(`Module '${moduleName}' is not allowed`);
                    }
                },
                Buffer,
                setTimeout
            };

            const context = vm.createContext(sandbox);
            const scriptExports = script.runInContext(context);

            if (scriptType === 'webhook') {
                if (!scriptExports.onWebhookPayloadReceived) {
                    const content = `There is no onWebhookPayloadReceived export for ${nangoProps.syncId}`;

                    throw new Error(content);
                }

                return await scriptExports.onWebhookPayloadReceived(nango, codeParams);
            }

            if (!scriptExports.default || typeof scriptExports.default !== 'function') {
                throw new Error(`Default exports is not a function but a ${typeof scriptExports.default}`);
            }
            if (scriptType === 'action') {
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

                const output = await scriptExports.default(nango, inputParams);

                // Validate action output against json schema
                const valOutput = validateData({
                    version: nangoProps.syncConfig.version || '1',
                    input: output,
                    modelName: nangoProps.syncConfig.models.length > 0 ? nangoProps.syncConfig.models[0] : undefined,
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

                return output;
            } else {
                return await scriptExports.default(nango);
            }
        } catch (error) {
            if (error instanceof ActionError) {
                // It's not a mistake, we don't want to report user generated error
                // span.setTag('error', error);
                const { type, payload } = error;
                return {
                    success: false,
                    error: {
                        type,
                        payload: payload || {},
                        status: 500
                    },
                    response: null
                };
            } else if (error instanceof NangoError) {
                throw error;
            } else {
                if (error instanceof AxiosError && error.response?.data) {
                    const errorResponse = error.response.data.payload || error.response.data;
                    span.setTag('error', errorResponse);
                    throw new Error(JSON.stringify(errorResponse));
                }

                span.setTag('error', error);
                throw new Error(`Error executing code '${stringifyError(error)}'`);
            }
        } finally {
            span.finish();
        }
    });
}
