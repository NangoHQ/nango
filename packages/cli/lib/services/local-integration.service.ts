import { NangoError, formatScriptError, IntegrationServiceInterface, NangoIntegrationData, NangoSync, NangoProps, localFileService } from '@nangohq/shared';
import * as vm from 'vm';
import * as url from 'url';
import * as crypto from 'crypto';
import { Buffer } from 'buffer';

class IntegrationService implements IntegrationServiceInterface {
    async runScript(
        syncName: string,
        _syncId: string,
        _activityLogId: number | undefined,
        nangoProps: NangoProps,
        _integrationData: NangoIntegrationData,
        _environmentId: number,
        _writeToDb: boolean,
        isInvokedImmediately: boolean,
        isWebhook: boolean,
        optionalLoadLocation?: string,
        input?: object
    ): Promise<any> {
        try {
            const nango = new NangoSync(nangoProps);
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
                        return module.exports;
                    })();
                `;

                const scriptObj = new vm.Script(wrappedScript);
                const sandbox = {
                    console,
                    require: (moduleName: string) => {
                        switch (moduleName) {
                            case 'url':
                                return url;
                            case 'crypto':
                                return crypto;
                            default:
                                throw new Error(`Module '${moduleName}' is not allowed`);
                        }
                    },
                    Buffer
                };

                const context = vm.createContext(sandbox);
                const scriptExports: any = scriptObj.runInContext(context);

                if (scriptExports.default && typeof scriptExports.default === 'function') {
                    const results = isInvokedImmediately ? await scriptExports.default(nango, input) : await scriptExports.default(nango);
                    return { success: true, error: null, response: results };
                } else {
                    const content = `There is no default export that is a function for ${syncName}`;

                    return { success: false, error: new NangoError(content, 500), response: null };
                }
            } catch (err: any) {
                let errorType = 'sync_script_failure';
                if (isWebhook) {
                    errorType = 'webhook_script_failure';
                } else if (isInvokedImmediately) {
                    errorType = 'action_script_failure';
                }

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
