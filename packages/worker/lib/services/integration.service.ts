import { NodeVM } from 'vm2';
import { NangoIntegrationData, getIntegrationFile, createActivityLogMessage, NangoHelper, fileService, isCloud } from '@nangohq/shared';

class IntegrationService {
    async runScript(syncName: string, activityLogId: number, nango: NangoHelper, integrationData: NangoIntegrationData): Promise<any> {
        try {
            const script: string | null = isCloud() ? await fileService.getFile(integrationData.fileLocation as string) : getIntegrationFile(syncName);

            if (!script) {
                await createActivityLogMessage({
                    level: 'error',
                    activity_log_id: activityLogId,
                    content: `Unable to find integration file for ${syncName}`,
                    timestamp: Date.now()
                });

                return null;
            }

            try {
                const vm = new NodeVM({
                    console: 'inherit',
                    sandbox: { nango },
                    require: {
                        external: true,
                        builtin: ['url', 'crypto'],
                        root: './'
                    }
                });

                const scriptExports = vm.run(script as string);

                if (typeof scriptExports.default === 'function') {
                    const results = await scriptExports.default(nango);

                    return results;
                } else {
                    await createActivityLogMessage({
                        level: 'error',
                        activity_log_id: activityLogId,
                        content: `There is no default export that is a function for ${syncName}`,
                        timestamp: Date.now()
                    });

                    return null;
                }
            } catch (err) {
                const prettyError = JSON.stringify(err, ['message', 'name', 'stack'], 2);

                const errorMessage = typeof err === 'object' && Object.keys(err as object).length > 0 ? prettyError : String(err);

                await createActivityLogMessage({
                    level: 'error',
                    activity_log_id: activityLogId,
                    content: `The script failed to execute for ${syncName} with the following error: ${errorMessage}`,
                    timestamp: Date.now()
                });

                return null;
            }
        } catch (err) {
            const errorMessage = JSON.stringify(err, ['message', 'name', 'stack'], 2);

            await createActivityLogMessage({
                level: 'error',
                activity_log_id: activityLogId,
                content: `The script failed to load for ${syncName} with the following error: ${errorMessage}`,
                timestamp: Date.now()
            });

            return null;
        }
    }
}

export default new IntegrationService();
