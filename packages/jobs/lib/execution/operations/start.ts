import tracer from 'dd-trace';

import { connectionService, localFileService, remoteFileService } from '@nangohq/shared';
import { Err, Ok, integrationFilesAreRemote, isCloud, stringifyError } from '@nangohq/utils';

import { getRunner } from '../../runner/runner.js';

import type { LogContext } from '@nangohq/logs';
import type { NangoProps } from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type { JsonValue } from 'type-fest';

export async function startScript({
    taskId,
    nangoProps,
    input,
    logCtx
}: {
    taskId: string;
    nangoProps: NangoProps;
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
            const content = `Unable to find integration file for ${nangoProps.syncConfig.sync_name}`;
            void logCtx.error(content);
            return Err('Unable to find integration file');
        }
        if (!nangoProps.team) {
            return Err(`No team provided (instead ${nangoProps.team})`);
        }

        const runner = await getRunner(nangoProps.team.id);
        if (runner.isErr()) {
            return Err(runner.error);
        }

        const res = await runner.value.client.start.mutate({
            taskId: taskId,
            nangoProps,
            code: script,
            codeParams: (input as object) || {}
        });

        if (!res) {
            span.setTag('error', true);
            return Err(`Error starting script for sync ${nangoProps.syncId}`);
        }

        await connectionService.trackExecution(nangoProps.nangoConnectionId);
        return Ok(undefined);
    } catch (err) {
        span.setTag('error', err);
        const errMessage = `Error starting integration '${nangoProps.syncConfig.sync_name}': ${stringifyError(err, { pretty: true })}`;
        void logCtx.error(errMessage, { error: err });
        return Err(errMessage);
    } finally {
        span.finish();
    }
}
