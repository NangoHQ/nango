import type { IntegrationServiceInterface, RunScriptOptions, ServiceResponse } from '@nangohq/shared';
import { integrationFilesAreRemote, isCloud, isProd, stringifyError } from '@nangohq/utils';
import { localFileService, remoteFileService, NangoError, formatScriptError } from '@nangohq/shared';
import type { Runner } from './runner/runner.js';
import { getOrStartRunner, getRunnerId } from './runner/runner.js';
import tracer from 'dd-trace';
import { logContextGetter } from '@nangohq/logs';

interface ScriptObject {
    runner: Runner;
    activityLogId: number | undefined;
    cancelled?: boolean;
}

class IntegrationService implements IntegrationServiceInterface {
    public runningScripts: Map<string, ScriptObject>;

    constructor() {
        this.runningScripts = new Map();
    }

    async cancelScript(syncId: string): Promise<void> {
        const scriptObject = this.runningScripts.get(syncId);

        if (!scriptObject) {
            return;
        }

        const { runner, activityLogId } = scriptObject;
        this.runningScripts.set(syncId, { ...scriptObject, cancelled: true });

        const res = await runner.client.cancel.mutate({
            syncId
        });

        if (res.isErr()) {
            if (activityLogId) {
                const logCtx = logContextGetter.getStateLess({ id: String(activityLogId) });
                await logCtx.error('Failed to cancel script');
            }
        }
    }

    async runScript({
        syncName,
        syncId,
        activityLogId,
        nangoProps,
        writeToDb,
        isInvokedImmediately,
        isWebhook,
        optionalLoadLocation,
        input
    }: RunScriptOptions): Promise<ServiceResponse> {
        const span = tracer
            .startSpan('runScript')
            .setTag('accountId', nangoProps.accountId)
            .setTag('environmentId', nangoProps.environmentId)
            .setTag('connectionId', nangoProps.connectionId)
            .setTag('providerConfigKey', nangoProps.providerConfigKey)
            .setTag('syncId', nangoProps.syncId)
            .setTag('syncName', syncName);

        const logCtx = activityLogId ? logContextGetter.getStateLess({ id: String(activityLogId) }) : null;
        try {
            const integrationData = { fileLocation: nangoProps.syncConfig.file_location };
            const environmentId = nangoProps.environmentId;
            const script: string | null =
                (isCloud || integrationFilesAreRemote) && !optionalLoadLocation
                    ? await remoteFileService.getFile(integrationData.fileLocation, environmentId)
                    : localFileService.getIntegrationFile(syncName, nangoProps.providerConfigKey, optionalLoadLocation);

            if (!script) {
                const content = `Unable to find integration file for ${syncName}`;

                if (writeToDb) {
                    await logCtx?.error(content);
                }

                const error = new NangoError('Unable to find integration file', 404);

                return { success: false, error, response: null };
            }

            if (nangoProps.accountId == null) {
                throw new Error(`No accountId provided (instead ${nangoProps.accountId})`);
            }

            const accountId = nangoProps.accountId;
            // a runner per account in prod only
            const runnerId = isProd ? getRunnerId(`${accountId}`) : getRunnerId('default');
            // fallback to default runner if account runner isn't ready yet
            const runner = await getOrStartRunner(runnerId).catch(() => getOrStartRunner(getRunnerId('default')));

            this.runningScripts.set(syncId, { runner, activityLogId });

            const runSpan = tracer.startSpan('runner.run', { childOf: span }).setTag('runnerId', runner.id);
            try {
                // TODO: request sent to the runner for it to run the script is synchronous.
                // TODO: Make the request return immediately and have the runner ping the job service when it's done.
                // https://github.com/trpc/trpc/blob/66d7db60e59b7c758709175a53765c9db0563dc0/packages/tests/server/abortQuery.test.ts#L26
                const res = await runner.client.run.mutate({
                    nangoProps,
                    code: script,
                    codeParams: input as object,
                    isInvokedImmediately,
                    isWebhook
                });

                if (res && res.response && res.response.cancelled) {
                    const error = new NangoError('script_cancelled');
                    runSpan.setTag('error', error);

                    return { success: false, error, response: null };
                }

                // TODO handle errors from the runner more gracefully and this service doesn't have to handle them
                if (res && !res.success && res.error) {
                    const { error } = res;
                    runSpan.setTag('error', error);

                    const err = new NangoError(error.type, error.payload, error.status);

                    return { success: false, error: err, response: null };
                }

                return { success: true, error: null, response: res };
            } catch (err) {
                runSpan.setTag('error', err);

                const scriptObject = this.runningScripts.get(syncId);

                if (scriptObject) {
                    const { cancelled } = scriptObject;

                    if (cancelled) {
                        this.runningScripts.delete(syncId);
                        return { success: false, error: new NangoError('script_cancelled'), response: null };
                    }
                }

                let errorType = 'sync_script_failure';
                if (isWebhook) {
                    errorType = 'webhook_script_failure';
                } else if (isInvokedImmediately) {
                    errorType = 'action_script_failure';
                }
                const { success, error, response } = formatScriptError(err, errorType, syncName);

                if (writeToDb) {
                    await logCtx?.error(error.message, { error });
                }
                return { success, error, response };
            } finally {
                runSpan.finish();
            }
        } catch (err) {
            span.setTag('error', err);
            const errorMessage = stringifyError(err, { pretty: true });
            const content = `There was an error running integration '${syncName}': ${errorMessage}`;

            if (writeToDb) {
                await logCtx?.error(content, { error: err });
            }

            return { success: false, error: new NangoError(content, 500), response: null };
        } finally {
            this.runningScripts.delete(syncId);
            span.finish();
        }
    }
}

export default new IntegrationService();
