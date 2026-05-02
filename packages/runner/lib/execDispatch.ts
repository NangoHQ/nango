import { Buffer } from 'buffer';

import { isEnterprise } from '@nangohq/utils';

import type { NangoActionRunner, NangoSyncRunner } from './sdk/sdk.js';
import type { CreateAnyResponse } from '@nangohq/runner-sdk';
import type { NangoProps, RunnerOutput } from '@nangohq/types';

export interface ScriptExports {
    onWebhookPayloadReceived?: (nango: NangoSyncRunner, payload?: object) => Promise<unknown>;
    default: ((nango: NangoActionRunner | NangoSyncRunner, payload?: object) => Promise<unknown>) | CreateAnyResponse;
}

export function parseExports(scriptExports: unknown): ScriptExports {
    return scriptExports as ScriptExports;
}

/**
 * Validates export shape and runs the same routing as {@link ../exec.ts} VM execution (sans VM).
 */
export async function dispatchUserScript({
    nangoProps,
    nango,
    scriptExports: raw,
    codeParams
}: {
    nangoProps: NangoProps;
    nango: NangoActionRunner | NangoSyncRunner;
    scriptExports: ScriptExports;
    codeParams?: object | undefined;
}): Promise<RunnerOutput> {
    const def = raw.default;
    const isZeroYaml = typeof def === 'object';
    const isNangoYaml = !isZeroYaml && typeof raw.default === 'function';

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

            const output = await payload.onWebhook(nango as NangoSyncRunner, codeParams);
            return {
                output,
                telemetryBag: nango.telemetryBag,
                checkpoints: nango.getCheckpointRange()
            };
        }
        if (!raw.onWebhookPayloadReceived) {
            const content = `There is no onWebhookPayloadReceived export for ${nangoProps.syncId}`;
            throw new Error(content);
        }

        const output = await raw.onWebhookPayloadReceived(nango as NangoSyncRunner, codeParams);
        return {
            output,
            telemetryBag: nango.telemetryBag,
            checkpoints: nango.getCheckpointRange()
        };
    }

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
            output = await payload.exec(nango, codeParams);
        } else {
            output = await def(nango, inputParams);
        }

        if (output) {
            const stringifiedOutput = JSON.stringify(output);
            const outputSizeInBytes = Buffer.byteLength(stringifiedOutput, 'utf8');
            const maxSizeInBytes = 2 * 1024 * 1024; // 2MB
            if (!isEnterprise) {
                if (outputSizeInBytes > maxSizeInBytes) {
                    throw new Error(
                        `Output size is too large: ${outputSizeInBytes} bytes. Maximum allowed size is ${maxSizeInBytes} bytes (2MB). See the deprecation announcement: https://nango.dev/docs/updates/dev#august-22%2C-2025`
                    );
                }
            }
        }

        return {
            output,
            telemetryBag: nango.telemetryBag,
            checkpoints: nango.getCheckpointRange()
        };
    }

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
            output = await payload.exec(nango as never);
        } else {
            output = await def(nango);
        }
        return { output, telemetryBag: nango.telemetryBag };
    }

    if (isZeroYaml) {
        const payload = def;
        if (payload.type !== 'sync') {
            throw new Error('Incorrect script loaded for sync');
        }
        if (!payload.exec) {
            throw new Error(`Missing exec function`);
        }

        await payload.exec(nango as never);
        return {
            output: true,
            telemetryBag: nango.telemetryBag,
            checkpoints: nango.getCheckpointRange()
        };
    }

    await def(nango);
    return {
        output: true,
        telemetryBag: nango.telemetryBag,
        checkpoints: nango.getCheckpointRange()
    };
}
