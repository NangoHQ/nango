import { IntegrationServiceInterface, NangoIntegrationData, NangoSync, localFileService } from '@nangohq/shared';

class IntegrationService implements IntegrationServiceInterface {
    async runScript(
        syncName: string,
        _activityLogId: number | undefined,
        nango: NangoSync,
        _integrationData: NangoIntegrationData,
        _environmentId: number,
        _writeToDb: boolean,
        isAction: boolean,
        optionalLoadLocation?: string,
        input?: object
    ): Promise<any> {
        try {
            const script: string | null = localFileService.getIntegrationFile(syncName, optionalLoadLocation);

            if (!script) {
                const content = `Unable to find integration file for ${syncName}`;

                console.error(content);
            }

            try {
                const wrappedScript = `
                    (function() {
                        var module = { exports: {} };
                        var exports = module.exports;
                        ${script}
                        return module.exports.default || module.exports;
                    })();
                `;

                const scriptExports: any = eval(wrappedScript);
                if (scriptExports && typeof scriptExports === 'function') {
                    const results = isAction ? await scriptExports(nango, input) : await scriptExports(nango);
                    return results;
                } else {
                    const content = `There is no default export that is a function for ${syncName}`;
                    console.error(content);

                    return null;
                }
            } catch (err: any) {
                console.error(err);

                return null;
            }
        } catch (err) {
            const errorMessage = JSON.stringify(err, ['message', 'name', 'stack'], 2);
            const content = `The script failed to load for ${syncName} with the following error: ${errorMessage}`;

            console.error(content);

            return null;
        }
    }
}

export default new IntegrationService();
