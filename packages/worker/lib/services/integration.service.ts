import { NodeVM } from 'vm2';
import { getIntegrationFile, createActivityLogMessage, NangoHelper } from '@nangohq/shared';

class IntegrationService {
    async runScript(syncName: string, activityLogId: number, nango: NangoHelper): Promise<any> {
        const script: string | null = getIntegrationFile(syncName);

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
                    builtin: ['fs', 'path'],
                    root: './'
                }
            });

            const scriptExports = vm.run(script);

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
            await createActivityLogMessage({
                level: 'error',
                activity_log_id: activityLogId,
                content: `The script failed to execute for ${syncName}`,
                timestamp: Date.now()
            });

            return null;
        }
    }
}

export default new IntegrationService();
