import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import tracer from 'dd-trace';

import { Err, Ok, isEnterprise } from '@nangohq/utils';

import { mapExecCaughtError } from './execErrorMapping.js';
import { logger } from './logger.js';
import { MapLocks } from './sdk/locks.js';
import { NangoActionRunner, NangoSyncRunner, instrumentSDK } from './sdk/sdk.js';
import { fromSuperJsonPayload, runHarnessRpcLoop, sendInit, toSuperJsonPayload } from './subprocessRpc/host.js';

import type { Locks } from './sdk/locks.js';
import type { SuperJsonPayload } from './subprocessRpc/protocol.js';
import type { ExecutionError } from '@nangohq/runner-sdk';
import type { NangoProps, Result, RunnerOutput } from '@nangohq/types';

function resolveBootstrapPath(): string {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    return path.join(__dirname, '../../deno/bootstrap.ts');
}

function snapshotNangoReadable(nango: NangoActionRunner | NangoSyncRunner): Record<string, unknown> {
    const base: Record<string, unknown> = {
        connectionId: nango.connectionId,
        providerConfigKey: nango.providerConfigKey,
        environmentId: nango.environmentId,
        environmentName: nango.environmentName,
        scriptType: nango.scriptType,
        activityLogId: nango.activityLogId,
        syncId: nango.syncId,
        nangoConnectionId: nango.nangoConnectionId,
        syncJobId: nango.syncJobId,
        provider: nango.provider,
        integrationConfig: nango.integrationConfig,
        syncConfig: nango.syncConfig,
        isCLI: nango.isCLI,
        runnerFlags: nango.runnerFlags,
        telemetryBag: { ...nango.telemetryBag }
    };
    if (nangoPropsIsSyncLike(nango)) {
        const s = nango as NangoSyncRunner;
        base['variant'] = s.variant;
        base['lastSyncDate'] = s.lastSyncDate;
        base['track_deletes'] = s.track_deletes;
    }
    return base;
}

function nangoPropsIsSyncLike(nango: NangoActionRunner | NangoSyncRunner): boolean {
    return 'variant' in nango && typeof nango.variant === 'string';
}

/**
 * Run integration script in a Deno subprocess; the Node harness holds secrets and real SDK via RPC.
 */
export async function execSubprocess({
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

    const filename = `${nangoProps.syncConfig.sync_name}-${nangoProps.providerConfigKey}.cjs`;

    const denoBin = process.env['DENO_PATH'] || 'deno';
    const bootstrapPath = process.env['NANGO_DENO_BOOTSTRAP_PATH'] || resolveBootstrapPath();
    const allowRoot = process.env['LAMBDA_TASK_ROOT'] || process.cwd();

    return await tracer.trace('nango.runner.execSubprocess', async (span) => {
        span.setTag('execMode', 'subprocess-deno')
            .setTag('accountId', nangoProps.team?.id)
            .setTag('environmentId', nangoProps.environmentId)
            .setTag('connectionId', nangoProps.connectionId)
            .setTag('providerConfigKey', nangoProps.providerConfigKey)
            .setTag('syncId', nangoProps.syncId);

        const tmpFile = path.join(os.tmpdir(), `nango-user-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.cjs`);
        await fs.promises.writeFile(tmpFile, code, 'utf8');

        const initPayload: SuperJsonPayload = toSuperJsonPayload({
            snapshot: snapshotNangoReadable(nango),
            nangoProps: {
                scriptType: nangoProps.scriptType,
                syncConfig: nangoProps.syncConfig
            },
            codeParams: codeParams ?? {},
            isEnterprise,
            userCodePath: tmpFile
        });

        const args = ['run', '--no-prompt', '--quiet', `--allow-read=${allowRoot}`, `--allow-read=${os.tmpdir()}`, bootstrapPath, tmpFile];

        const child = childProcess.spawn(denoBin, args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: {
                ...process.env,
                NANGO_SUBPROCESS_CHILD: '1'
            }
        });

        const abortHandler = () => {
            try {
                child.kill('SIGTERM');
                setTimeout(() => {
                    if (!child.killed) {
                        child.kill('SIGKILL');
                    }
                }, 2_000).unref();
            } catch {
                //
            }
        };
        abortController.signal.addEventListener('abort', abortHandler, { once: true });

        child.stderr?.on('data', (chunk: Buffer) => {
            logger.info(`deno stderr: ${chunk.toString().slice(0, 2000)}`);
        });

        try {
            const loopPromise = runHarnessRpcLoop(child, nango);
            sendInit(child, initPayload);

            const done = await loopPromise;

            if (done.ok) {
                const partial = fromSuperJsonPayload<{ output: unknown }>(done.result);
                const merged = mergeHostRunnerOutput(nangoProps, nango, partial);
                return Ok(merged);
            }
            const errObj = fromSuperJsonPayload<unknown>(done.error);
            return Err(mapExecCaughtError(errObj, nango, filename, span));
        } catch (err) {
            return Err(mapExecCaughtError(err, nango, filename, span));
        } finally {
            abortController.signal.removeEventListener('abort', abortHandler);
            try {
                await nango.releaseAllLocks();
            } catch (releaseErr) {
                logger.warning('Failed to release all locks', { reason: releaseErr });
            }
            try {
                await fs.promises.unlink(tmpFile);
            } catch {
                //
            }
            span.finish();
        }
    });
}

function mergeHostRunnerOutput(nangoProps: NangoProps, nango: NangoActionRunner | NangoSyncRunner, partial: { output: unknown }): RunnerOutput {
    if (nangoProps.scriptType === 'on-event') {
        return {
            output: partial.output,
            telemetryBag: nango.telemetryBag
        };
    }
    return {
        output: partial.output,
        telemetryBag: nango.telemetryBag,
        checkpoints: nango.getCheckpointRange()
    };
}
