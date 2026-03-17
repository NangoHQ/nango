import tracer from 'dd-trace';

import { connectionService, localFileService, remoteFileService } from '@nangohq/shared';
import { Err, Ok, integrationFilesAreRemote, isCloud, stringifyError } from '@nangohq/utils';

import { getRuntimeAdapter } from '../../runtime/runtimes.js';

import type { LogContext } from '@nangohq/logs';
import type { NangoProps, RuntimeContext } from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type { JsonValue } from 'type-fest';

export async function startScript({
    taskId,
    nangoProps,
    runtimeContext,
    input,
    logCtx
}: {
    taskId: string;
    nangoProps: NangoProps;
    runtimeContext: RuntimeContext;
    input?: JsonValue | undefined;
    logCtx: LogContext;
}): Promise<Result<void>> {
    const span = tracer
        .startSpan('runScript')
        .setTag('accountId', nangoProps.team?.id)
        .setTag('environmentId', nangoProps.environmentId)
        .setTag('connectionId', nangoProps.connectionId)
        .setTag('providerConfigKey', nangoProps.providerConfigKey)
        .setTag('syncId', nangoProps.syncId)
        .setTag('syncName', nangoProps.syncConfig.sync_name);

    try {
        const integrationData = { fileLocation: nangoProps.syncConfig.file_location };
        const script: string | null =
            isCloud || integrationFilesAreRemote
                ? await remoteFileService.getFile(integrationData.fileLocation)
                : localFileService.getIntegrationFile({
                      syncConfig: nangoProps.syncConfig,
                      providerConfigKey: nangoProps.providerConfigKey,
                      scriptType: nangoProps.scriptType
                  });

        if (!script) {
            throw new Error(`Unable to find integration file`);
        }
        if (!nangoProps.team) {
            throw new Error(`No team provided (instead ${nangoProps.team})`);
        }

        const runtimeAdapter = await getRuntimeAdapter({ nangoProps, runtimeContext });
        if (runtimeAdapter.isErr()) {
            throw runtimeAdapter.error;
        }
        const res = await runtimeAdapter.value.invoke({
            taskId,
            nangoProps,
            code: script,
            codeParams: (input as object) || {}
        });

        if (res.isErr()) {
            throw res.error;
        }

        await connectionService.trackExecution(nangoProps.nangoConnectionId);
        return Ok(undefined);
    } catch (err) {
        span.setTag('error', err);
        const errMessage = `Error starting function '${nangoProps.syncConfig.sync_name}': ${stringifyError(err, { pretty: true })}`;
        void logCtx.error(errMessage, { error: err });
        return Err(errMessage);
    } finally {
        span.finish();
    }
}
