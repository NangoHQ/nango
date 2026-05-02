import { Buffer } from 'buffer';
import * as crypto from 'crypto';
import * as vm from 'node:vm';
import * as url from 'url';

import * as botbuilder from 'botbuilder';
import tracer from 'dd-trace';
import * as soap from 'soap';
import * as unzipper from 'unzipper';
import * as zod from 'zod';

import { Err, Ok } from '@nangohq/utils';

import { dispatchUserScript, parseExports } from './execDispatch.js';
import { mapExecCaughtError } from './execErrorMapping.js';
import { logger } from './logger.js';
import { MapLocks } from './sdk/locks.js';
import { NangoActionRunner, NangoSyncRunner, instrumentSDK } from './sdk/sdk.js';

import type { Locks } from './sdk/locks.js';
import type { ExecutionError } from '@nangohq/runner-sdk';
import type { NangoProps, Result, RunnerOutput } from '@nangohq/types';

export async function exec({
    nangoProps,
    code,
    codeParams,
    abortController = new AbortController(),
    locks = new MapLocks()
}: {
    nangoProps: NangoProps;
    code: string;
    codeParams?: object | undefined;
    abortController?: AbortController;
    locks?: Locks;
}): Promise<Result<RunnerOutput, ExecutionError>> {
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

    return await tracer.trace<Promise<Result<RunnerOutput, ExecutionError>>>('nango.runner.exec', async (span) => {
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
                constructor: undefined,
                console: new Proxy(
                    {},
                    {
                        get: () => () => {}
                    }
                ),
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
            Object.setPrototypeOf(sandbox, null);

            const context = vm.createContext(sandbox, {
                codeGeneration: {
                    strings: false,
                    wasm: false
                }
            });
            const scriptExports = parseExports(script.runInContext(context));
            const output = await dispatchUserScript({ nangoProps, nango, scriptExports, codeParams });
            return Ok(output);
        } catch (err) {
            return Err(mapExecCaughtError(err, nango, filename, span));
        } finally {
            try {
                await nango.releaseAllLocks();
            } catch (releaseErr) {
                logger.warning('Failed to release all locks', { reason: releaseErr });
            }
            span.finish();
        }
    });
}
