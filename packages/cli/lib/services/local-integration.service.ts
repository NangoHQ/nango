import { NangoError, formatScriptError, IntegrationServiceInterface, NangoIntegrationData, NangoSync, localFileService } from '@nangohq/shared';
import * as vm from 'vm';
import * as url from 'url';
import * as crypto from 'crypto';

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

                return { success: false, error: new NangoError(content, 500), response: null };
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

                const scriptObj = new vm.Script(wrappedScript);
                const sandbox = {
                    console: console,
                    require: (moduleName: string) => {
                        switch (moduleName) {
                            case 'url':
                                return url;
                            case 'crypto':
                                return crypto;
                            default:
                                throw new Error(`Module '${moduleName}' is not allowed`);
                        }
                    }
                };

                const context = vm.createContext(sandbox);
                const scriptExports: any = scriptObj.runInContext(context);

                if (scriptExports && typeof scriptExports === 'function') {
                    const results = isAction ? await scriptExports(nango, input) : await scriptExports(nango);
                    return { success: true, error: null, response: results };
                } else {
                    const content = `There is no default export that is a function for ${syncName}`;

                    return { success: false, error: new NangoError(content, 500), response: null };
                }
            } catch (err: any) {
                const errorType = isAction ? 'action_script_failure' : 'sync_script_failre';

                return formatScriptError(err, errorType, syncName);
            }
        } catch (err) {
            const errorMessage = JSON.stringify(err, ['message', 'name', 'stack'], 2);
            const content = `The script failed to load for ${syncName} with the following error: ${errorMessage}`;

            return { success: false, error: new NangoError(content, 500), response: null };
        }
    }
}

export default new IntegrationService();
