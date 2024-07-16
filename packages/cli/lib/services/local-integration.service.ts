import type { IntegrationServiceInterface, RunScriptOptions, RunnerOutput } from '@nangohq/shared';
import { ActionError, NangoError, formatScriptError, NangoSync, localFileService, validateData } from '@nangohq/shared';
import * as vm from 'node:vm';
import * as url from 'node:url';
import * as crypto from 'node:crypto';
import * as zod from 'zod';
import { Buffer } from 'node:buffer';

class IntegrationService implements IntegrationServiceInterface {
    async cancelScript() {
        return Promise.resolve();
    }

    async runScript({ syncName, nangoProps, isInvokedImmediately, isWebhook, optionalLoadLocation, input }: RunScriptOptions): Promise<RunnerOutput> {
        const nango = new NangoSync(nangoProps);
        try {
            await nango.log(`Executing -> integration:"${nangoProps.provider}" script:"${syncName}"`);

            const script: string | null = localFileService.getIntegrationFile(syncName, nangoProps.providerConfigKey, optionalLoadLocation);
            const isAction = isInvokedImmediately && !isWebhook;

            if (!script) {
                const content = `Unable to find script file for "${syncName}"`;
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
                            case 'zod':
                                return zod;
                            default:
                                throw new Error(`Module '${moduleName}' is not allowed`);
                        }
                    },
                    Buffer,
                    setTimeout
                };

                const context = vm.createContext(sandbox);
                const scriptExports: any = scriptObj.runInContext(context);

                if (!scriptExports.default || !(typeof scriptExports.default === 'function')) {
                    const content = `There is no default export that is a function for ${syncName}`;
                    return { success: false, error: new NangoError(content, 500), response: null };
                }

                if (isAction) {
                    // Validate action input against json schema
                    const valInput = validateData({
                        version: nangoProps.syncConfig.version || '1',
                        input: input,
                        modelName: nangoProps.syncConfig.input,
                        jsonSchema: nangoProps.syncConfig.models_json_schema
                    });
                    if (Array.isArray(valInput)) {
                        await nango.log('Invalid action input. Use `--validation` option to see the details', { level: 'warn' });
                        if (nangoProps.runnerFlags.validateActionInput) {
                            return {
                                success: false,
                                response: null,
                                error: new NangoError('invalid_action_input', { data: input, validation: valInput, model: nangoProps.syncConfig.input })
                            };
                        }
                    }

                    const output = await scriptExports.default(nango, input);

                    // Validate action output against json schema
                    const modelNameOutput = nangoProps.syncConfig.models.length > 0 ? nangoProps.syncConfig.models[0] : undefined;
                    const valOutput = validateData({
                        version: nangoProps.syncConfig.version || '1',
                        input: output,
                        modelName: modelNameOutput,
                        jsonSchema: nangoProps.syncConfig.models_json_schema
                    });
                    if (Array.isArray(valOutput)) {
                        await nango.log('Invalid action output. Use `--validation` option to see the details', { level: 'warn' });
                        if (nangoProps.runnerFlags.validateActionOutput) {
                            return {
                                success: false,
                                response: null,
                                error: new NangoError('invalid_action_output', { data: output, validation: valOutput, model: modelNameOutput })
                            };
                        }
                    }

                    return { success: true, error: null, response: output };
                }

                const results = await scriptExports.default(nango);
                return { success: true, error: null, response: results };
            } catch (err) {
                // TODO merge this back with the main integration service
                if (err instanceof ActionError) {
                    return {
                        success: false,
                        error: {
                            type: err.type,
                            payload: err.payload || {},
                            status: 500
                        },
                        response: null
                    };
                } else if (err instanceof NangoError) {
                    return { success: false, error: err, response: null };
                }

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
        } finally {
            await nango.log(`Done`);
        }
    }
}

export default new IntegrationService();
