import type { Context } from '@temporalio/activity';
import {
    IntegrationServiceInterface,
    createActivityLogMessage,
    NangoIntegrationData,
    NangoProps,
    localFileService,
    remoteFileService,
    isCloud,
    isProd,
    ServiceResponse,
    NangoError,
    formatScriptError,
    isOk
} from '@nangohq/shared';
import { Runner, getOrStartRunner, getRunnerId } from './runner/runner.js';
import tracer from './tracer.js';

interface ScriptObject {
    context: Context | null;
    runner: Runner;
    activityLogId: number | undefined;
    cancelled?: boolean;
}

class IntegrationService implements IntegrationServiceInterface {
    public runningScripts: Map<string, ScriptObject>;

    constructor() {
        this.runningScripts = new Map();
        this.sendHeartbeat();
    }

    async cancelScript(syncId: string, environmentId: number): Promise<void> {
        const scriptObject = this.runningScripts.get(syncId);

        if (!scriptObject) {
            return;
        }

        const { runner, activityLogId } = scriptObject;

        const res = await runner.client.cancel.mutate({
            syncId
        });

        if (isOk(res)) {
            this.runningScripts.set(syncId, { ...scriptObject, cancelled: true });
        } else {
            if (activityLogId && environmentId) {
                await createActivityLogMessage({
                    level: 'error',
                    environment_id: environmentId,
                    activity_log_id: activityLogId,
                    content: `Failed to cancel script`,
                    timestamp: Date.now()
                });
            }
        }
    }

    async runScript(
        syncName: string,
        syncId: string,
        activityLogId: number | undefined,
        nangoProps: NangoProps,
        integrationData: NangoIntegrationData,
        environmentId: number,
        writeToDb: boolean,
        isInvokedImmediately: boolean,
        isWebhook: boolean,
        optionalLoadLocation?: string,
        input?: object,
        temporalContext?: Context
    ): Promise<ServiceResponse<any>> {
        const span = tracer
            .startSpan('runScript')
            .setTag('accountId', nangoProps.accountId)
            .setTag('environmentId', nangoProps.environmentId)
            .setTag('connectionId', nangoProps.connectionId)
            .setTag('providerConfigKey', nangoProps.providerConfigKey)
            .setTag('syncId', nangoProps.syncId)
            .setTag('syncName', syncName);
        try {
            const script: string | null =
                isCloud() && !optionalLoadLocation
                    ? await remoteFileService.getFile(integrationData.fileLocation as string, environmentId)
                    : localFileService.getIntegrationFile(syncName, optionalLoadLocation);

            if (!script) {
                const content = `Unable to find integration file for ${syncName}`;

                if (activityLogId && writeToDb) {
                    await createActivityLogMessage({
                        level: 'error',
                        environment_id: environmentId,
                        activity_log_id: activityLogId,
                        content,
                        timestamp: Date.now()
                    });
                }
            }

            if (!script && activityLogId && writeToDb) {
                await createActivityLogMessage({
                    level: 'error',
                    environment_id: environmentId,
                    activity_log_id: activityLogId,
                    content: `Unable to find integration file for ${syncName}`,
                    timestamp: Date.now()
                });

                const error = new NangoError('Unable to find integration file', 404);

                return { success: false, error, response: null };
            }

            if (nangoProps.accountId == null) {
                throw new Error(`No accountId provided (instead ${nangoProps.accountId})`);
            }

            const accountId = nangoProps.accountId;
            // a runner per account in prod only
            const runnerId = isProd() ? getRunnerId(`${accountId}`) : getRunnerId('default');
            // fallback to default runner if account runner isn't ready yet
            const runner = await getOrStartRunner(runnerId).catch(() => getOrStartRunner(getRunnerId('default')));

            if (temporalContext) {
                this.runningScripts.set(syncId, { context: temporalContext, runner, activityLogId });
            } else {
                this.runningScripts.set(syncId, { context: null, runner, activityLogId });
            }

            const runSpan = tracer.startSpan('runner.run', { childOf: span }).setTag('runnerId', runner.id);
            try {
                // TODO: request sent to the runner for it to run the script is synchronous.
                // TODO: Make the request return immediately and have the runner ping the job service when it's done.
                // https://github.com/trpc/trpc/blob/66d7db60e59b7c758709175a53765c9db0563dc0/packages/tests/server/abortQuery.test.ts#L26
                const res = await runner.client.run.mutate({
                    nangoProps,
                    code: script as string,
                    codeParams: input as object,
                    isInvokedImmediately,
                    isWebhook
                });

                if (res && res.response && res.response.cancelled) {
                    const error = new NangoError('script_cancelled');
                    return { success: false, error, response: null };
                }

                // TODO handle errors from the runner more gracefully and this service doesn't have to handle them
                if (res && !res.success && res.error) {
                    const { error } = res;

                    const err = new NangoError(error.type, error.payload, error.status);

                    return { success: false, error: err, response: null };
                }

                return { success: true, error: null, response: res };
            } catch (err: any) {
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

                if (activityLogId && writeToDb) {
                    await createActivityLogMessage({
                        level: 'error',
                        environment_id: environmentId,
                        activity_log_id: activityLogId,
                        content: error.message,
                        timestamp: Date.now()
                    });
                }
                return { success, error, response };
            } finally {
                runSpan.finish();
            }
        } catch (err) {
            span.setTag('error', err);
            const errorMessage = JSON.stringify(err, ['message', 'name', 'stack'], 2);
            const content = `There was an error running integration '${syncName}': ${errorMessage}`;

            if (activityLogId && writeToDb) {
                await createActivityLogMessage({
                    level: 'error',
                    environment_id: environmentId,
                    activity_log_id: activityLogId,
                    content,
                    timestamp: Date.now()
                });
            }

            return { success: false, error: new NangoError(content, 500), response: null };
        } finally {
            this.runningScripts.delete(syncId);
            span.finish();
        }
    }

    private sendHeartbeat() {
        setInterval(() => {
            Object.keys(this.runningScripts).forEach((syncId) => {
                const scriptObject = this.runningScripts.get(syncId);

                if (!scriptObject) {
                    return;
                }

                const { context } = scriptObject;

                context?.heartbeat();
            });
        }, 300000);
    }
}

export default new IntegrationService();
