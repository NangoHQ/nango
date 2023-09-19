import { NodeVM } from 'vm2';
import type { NangoIntegrationData } from '../../integrations/index.js';
import { getIntegrationFile, getRootDir } from '../nango-config.service.js';
import { createActivityLogMessage } from '../activity/activity.service.js';
import type { NangoSync } from '../../sdk/sync.js';
import fileService from '../file.service.js';
import { isCloud } from '../../utils/utils.js';

class IntegrationService {
    async runScript(
        syncName: string,
        activityLogId: number | undefined,
        nango: NangoSync,
        integrationData: NangoIntegrationData,
        environmentId: number,
        writeToDb: boolean,
        isAction: boolean,
        optionalLoadLocation?: string,
        input?: object
    ): Promise<any> {
        try {
            const script: string | null =
                isCloud() && !optionalLoadLocation
                    ? await fileService.getFile(integrationData.fileLocation as string, environmentId)
                    : getIntegrationFile(syncName, optionalLoadLocation);

            if (!script) {
                const content = `Unable to find integration file for ${syncName}`;

                if (activityLogId && writeToDb) {
                    await createActivityLogMessage({
                        level: 'error',
                        activity_log_id: activityLogId,
                        content,
                        timestamp: Date.now()
                    });
                } else {
                    console.error(content);
                }
            }

            if (!script && activityLogId && writeToDb) {
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
                        builtin: ['url', 'crypto']
                    }
                });

                const rootDir = getRootDir(optionalLoadLocation);
                const scriptExports = vm.run(script as string, `${rootDir}/*.js`);

                if (typeof scriptExports.default === 'function') {
                    const results = isAction ? await scriptExports.default(nango, input) : await scriptExports.default(nango);

                    return results;
                } else {
                    const content = `There is no default export that is a function for ${syncName}`;
                    if (activityLogId && writeToDb) {
                        await createActivityLogMessage({
                            level: 'error',
                            activity_log_id: activityLogId,
                            content,
                            timestamp: Date.now()
                        });
                    } else {
                        console.error(content);
                    }

                    return null;
                }
            } catch (err: any) {
                let content;
                if ('response' in err && 'data' in err.response) {
                    const message = JSON.stringify(err.response.data, null, 2);
                    content = `The script failed to execute for ${syncName} with the following error: ${message}`;
                } else {
                    const prettyError = JSON.stringify(err, ['message', 'name', 'stack'], 2);

                    const errorMessage = typeof err === 'object' && Object.keys(err as object).length > 0 ? prettyError : String(err);
                    content = `The script failed to execute for ${syncName} with the following error: ${errorMessage}`;
                }

                if (activityLogId && writeToDb) {
                    await createActivityLogMessage({
                        level: 'error',
                        activity_log_id: activityLogId,
                        content,
                        timestamp: Date.now()
                    });
                } else {
                    console.error(content);
                }

                return null;
            }
        } catch (err) {
            const errorMessage = JSON.stringify(err, ['message', 'name', 'stack'], 2);
            const content = `The script failed to load for ${syncName} with the following error: ${errorMessage}`;

            if (activityLogId && writeToDb) {
                await createActivityLogMessage({
                    level: 'error',
                    activity_log_id: activityLogId,
                    content,
                    timestamp: Date.now()
                });
            } else {
                console.error(content);
            }

            return null;
        }
    }
}

export default new IntegrationService();
