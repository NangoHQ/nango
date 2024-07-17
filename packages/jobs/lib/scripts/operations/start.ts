import type { Result } from '@nangohq/utils';
import { Err, Ok, integrationFilesAreRemote, isCloud, isProd, stringifyError } from '@nangohq/utils';
import tracer from 'dd-trace';
import type { LogContext } from '@nangohq/logs';
import type { NangoProps } from '@nangohq/shared';
import { localFileService, remoteFileService } from '@nangohq/shared';
import { getOrStartRunner, getRunnerId } from '../../runner/runner.js';
import type { ScriptProps } from '../types.js';

export async function startScript({
    scriptProps,
    nangoProps,
    input,
    logCtx
}: {
    scriptProps: ScriptProps;
    nangoProps: NangoProps;
    input?: object | undefined;
    logCtx: LogContext;
}): Promise<Result<void>> {
    const span = tracer
        .startSpan('runScript')
        .setTag('accountId', nangoProps.accountId)
        .setTag('environmentId', nangoProps.environmentId)
        .setTag('connectionId', nangoProps.connectionId)
        .setTag('providerConfigKey', nangoProps.providerConfigKey)
        .setTag('syncId', nangoProps.syncId)
        .setTag('syncName', scriptProps.syncConfig.sync_name);

    try {
        const integrationData = { fileLocation: nangoProps.syncConfig.file_location };
        const environmentId = nangoProps.environmentId;
        const script: string | null =
            isCloud || integrationFilesAreRemote
                ? await remoteFileService.getFile(integrationData.fileLocation, environmentId)
                : localFileService.getIntegrationFile(scriptProps.syncConfig.sync_name, nangoProps.providerConfigKey);

        if (!script) {
            const content = `Unable to find integration file for ${scriptProps.syncConfig.sync_name}`;
            await logCtx.error(content);
            return Err('Unable to find integration file');
        }

        if (nangoProps.accountId == null) {
            return Err(`No accountId provided (instead ${nangoProps.accountId})`);
        }

        // a runner per account in prod only
        const runnerId = isProd ? getRunnerId(`${nangoProps.accountId}`) : getRunnerId('default');
        // fallback to default runner if account runner isn't ready yet
        const runner = await getOrStartRunner(runnerId).catch(() => getOrStartRunner(getRunnerId('default')));

        const res = await runner.client.start.mutate({
            taskId: scriptProps.taskId,
            nangoProps,
            code: script,
            codeParams: input as object
        });

        if (!res) {
            span.setTag('error', true);
            return Err(`Error starting script for sync ${nangoProps.syncId}`);
        }
        return Ok(undefined);
    } catch (err) {
        span.setTag('error', err);
        const errMessage = `Error starting integration '${scriptProps.syncConfig.sync_name}': ${stringifyError(err, { pretty: true })}`;
        await logCtx.error(errMessage, { error: err });
        return Err(errMessage);
    } finally {
        span.finish();
    }
}
