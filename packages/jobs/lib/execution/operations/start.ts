import tracer from 'dd-trace';

import { localFileService, remoteFileService } from '@nangohq/shared';
import { Err, integrationFilesAreRemote, isCloud, Ok, stringifyError } from '@nangohq/utils';

import { getRuntimeAdapter } from '../../runtime/runtimes.js';

import type { LogContext } from '@nangohq/logs';
import type { NangoProps, RoutingContext } from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type { JsonValue } from 'type-fest';

export async function startScript({
    taskId,
    nangoProps,
    routingContext,
    input,
    logCtx
}: {
    taskId: string;
    nangoProps: NangoProps;
    routingContext: RoutingContext;
    input?: JsonValue | undefined;
    logCtx: LogContext;
}): Promise<Result<void>> {
    return tracer.trace(
        'runScript',
        {
            tags: {
                accountId: nangoProps.team?.id,
                environmentId: nangoProps.environmentId,
                connectionId: nangoProps.connectionId,
                providerConfigKey: nangoProps.providerConfigKey,
                syncId: nangoProps.syncId,
                syncName: nangoProps.syncConfig.sync_name
            }
        },
        async (span) => {
            try {
                const integrationData = { fileLocation: nangoProps.syncConfig.file_location };
                const script: string | null =
                    isCloud || integrationFilesAreRemote
                        ? await tracer.trace('runScript.getFile', async () => remoteFileService.getFile(integrationData.fileLocation))
                        : localFileService.getIntegrationFile({
                              syncConfig: nangoProps.syncConfig,
                              providerConfigKey: nangoProps.providerConfigKey
                          });

                if (!script) {
                    throw new Error(`Unable to find integration file`);
                }
                if (!nangoProps.team) {
                    throw new Error(`No team provided (instead ${nangoProps.team})`);
                }

                const runtimeAdapter = await tracer.trace('runScript.getRuntimeAdapter', async () => getRuntimeAdapter({ nangoProps, routingContext }));
                if (runtimeAdapter.isErr()) {
                    throw runtimeAdapter.error;
                }
                const res = await runtimeAdapter.value.invoke({
                    taskId,
                    nangoProps,
                    code: script,
                    codeParams: (input as object) || {},
                    routingContext
                });

                if (res.isErr()) {
                    throw res.error;
                }

                return Ok(undefined);
            } catch (err) {
                span?.setTag('error', err);
                const errMessage = `Error starting function '${nangoProps.syncConfig.sync_name}': ${stringifyError(err, { pretty: true })}`;
                void logCtx.error(errMessage, { error: err });
                return Err(errMessage);
            }
        }
    );
}
