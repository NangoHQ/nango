import type { Context } from '@temporalio/activity';
import { NodeVM } from 'vm2';
import {
    IntegrationServiceInterface,
    createActivityLogMessage,
    getRootDir,
    NangoIntegrationData,
    NangoProps,
    NangoAction,
    NangoSync,
    localFileService,
    remoteFileService,
    isCloud,
    ServiceResponse,
    NangoError,
    formatScriptError
} from '@nangohq/shared';

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
        try {
            const nango = isInvokedImmediately && !isWebhook ? new NangoAction(nangoProps) : new NangoSync(nangoProps);
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

            try {
                if (temporalContext) {
                    this.runningScripts[syncId] = temporalContext;
                }

                const vm = new NodeVM({
                    console: 'inherit',
                    sandbox: { nango },
                    require: {
                        external: true,
                        builtin: ['url', 'crypto']
                    }
                });

                const rootDir = getRootDir(optionalLoadLocation);
                const scriptExports = vm.run(script as string, `${rootDir}/*.js`);

                if (isWebhook) {
                    if (!scriptExports.onWebhookPayloadReceived) {
                        const content = `There is no onWebhookPayloadReceived export for ${syncName}`;
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
                    }

                    const results = await scriptExports.onWebhookPayloadReceived(nango, input);

                    return { success: true, error: null, response: results };
                } else {
                    if (typeof scriptExports.default === 'function') {
                        const results = isInvokedImmediately ? await scriptExports.default(nango, input) : await scriptExports.default(nango);

                        return { success: true, error: null, response: results };
                    } else {
                        const content = `There is no default export that is a function for ${syncName}`;
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
                    }
                }
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
            }
        } catch (err) {
            const errorMessage = JSON.stringify(err, ['message', 'name', 'stack'], 2);
            const content = `The script failed to load for ${syncName} with the following error: ${errorMessage}`;

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
