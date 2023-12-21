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
    formatScriptError
} from '@nangohq/shared';
import { getRunner, getRunnerId } from './runner/runner.js';
import tracer from './tracer.js';

class IntegrationService implements IntegrationServiceInterface {
    public runningScripts: { [key: string]: Context } = {};

    constructor() {
        this.sendHeartbeat();
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

            if (temporalContext) {
                this.runningScripts[syncId] = temporalContext;
            }
            if (nangoProps.accountId == null) {
                throw new Error(`No accountId provided (instead ${nangoProps.accountId})`);
            }

            const accountId = nangoProps.accountId;
            const runnerId = isProd() ? getRunnerId(`${accountId}`) : getRunnerId('default'); // a runner per account in prod only
            const runner = await getRunner(runnerId).catch((_) => getRunner(getRunnerId('default'))); // fallback to default runner if account runner isn't ready yet

            const runSpan = tracer.startSpan('runner.run', { childOf: span }).setTag('runnerId', runner.id);
            try {
                // TODO: request sent to the runner for it to run the script is synchronous.
                // TODO: Make the request return immediately and have the runner ping the job service when it's done.
                const res = await runner.client.run.mutate({
                    nangoProps,
                    code: script as string,
                    codeParams: input as object,
                    isInvokedImmediately,
                    isWebhook
                });
                return { success: true, error: null, response: res };
            } catch (err: any) {
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
            delete this.runningScripts[syncId];
            span.finish();
        }
    }

    private sendHeartbeat() {
        setInterval(() => {
            Object.keys(this.runningScripts).forEach((syncId) => {
                const context = this.runningScripts[syncId];

                context?.heartbeat();
            });
        }, 300000);
    }
}

export default new IntegrationService();
