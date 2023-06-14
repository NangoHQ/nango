import { NodeVM } from 'vm2';
import type { NangoIntegrationData } from '../../integrations/index.js';
import { getIntegrationFile } from '../nango-config.service.js';
import { createActivityLogMessage } from '../activity.service.js';
import type { NangoSync } from '../../sdk/sync.js';
import fileService from '../file.service.js';
import { isCloud } from '../../utils/utils.js';

class IntegrationService {
    async runScript(
        syncName: string,
        activityLogId: number | undefined,
        nango: NangoSync,
        integrationData: NangoIntegrationData,
        optionalLoadLocation?: string
    ): Promise<any> {
        try {
            const script: string | null = isCloud()
                ? await fileService.getFile(integrationData.fileLocation as string)
                : getIntegrationFile(syncName, optionalLoadLocation);

            if (!script) {
                const content = `Unable to find integration file for ${syncName}`;

                if (activityLogId) {
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

            if (!script && activityLogId) {
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
                    const content = `There is no default export that is a function for ${syncName}`;
                    if (activityLogId) {
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
                const prettyError = JSON.stringify(err, ['message', 'name', 'stack'], 2);

                const errorMessage = typeof err === 'object' && Object.keys(err as object).length > 0 ? prettyError : String(err);
                const content = `The script failed to execute for ${syncName} with the following error: ${errorMessage}`;

                if (activityLogId) {
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

            if (activityLogId) {
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
