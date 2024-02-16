import type { NangoProps, RunnerOutput } from '@nangohq/shared';
import { ActionError, NangoSync, NangoAction, instrumentSDK, SpanTypes } from '@nangohq/shared';
import { syncAbortControllers } from './state.js';
import { Buffer } from 'buffer';
import * as vm from 'vm';
import * as url from 'url';
import * as crypto from 'crypto';
import * as zod from 'zod';
import { tracer } from './tracer.js';

export async function exec(
    nangoProps: NangoProps,
    isInvokedImmediately: boolean,
    isWebhook: boolean,
    code: string,
    codeParams?: object
): Promise<RunnerOutput> {
    const isAction = isInvokedImmediately && !isWebhook;

    const abortController = new AbortController();

    if (!isInvokedImmediately && nangoProps.syncId) {
        syncAbortControllers.set(nangoProps.syncId, abortController);
    }

    const rawNango = isAction ? new NangoAction(nangoProps) : new NangoSync(nangoProps);

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

    return tracer.trace(SpanTypes.RUNNER_EXEC, async (span) => {
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
                        default:
                            throw new Error(`Module '${moduleName}' is not allowed`);
                    }
                },
                Buffer,
                setTimeout
            };
            const context = vm.createContext(sandbox);
            const scriptExports = script.runInContext(context);

            if (isWebhook) {
                if (!scriptExports.onWebhookPayloadReceived) {
                    const content = `There is no onWebhookPayloadReceived export for ${nangoProps.syncId}`;

                    throw new Error(content);
                }

                return await scriptExports.onWebhookPayloadReceived(nango, codeParams);
            } else {
                if (!scriptExports.default || typeof scriptExports.default !== 'function') {
                    throw new Error(`Default exports is not a function but a ${typeof scriptExports.default}`);
                }
                if (isAction) {
                    return await scriptExports.default(nango, codeParams);
                } else {
                    return await scriptExports.default(nango);
                }
            }
        } catch (error: any) {
            if (error instanceof ActionError) {
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
            } else {
                throw new Error(`Error executing code '${error}'`);
            }
        } finally {
            span.finish();
        }
    });
}
