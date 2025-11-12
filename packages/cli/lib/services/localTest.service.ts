import fs from 'node:fs';
import path from 'node:path';
import * as vm from 'node:vm';
import * as url from 'url';

import * as zod from 'zod';

import { BASE_VARIANT } from '@nangohq/runner-sdk';

import { parse } from './config.service.js';
import { getIntegrationFile } from './dryrun.service.js';
import * as nangoScript from '../sdkScripts.js';
import { NangoActionMockBase, NangoSyncMockBase } from '../testMocks/utils.js';
import { printDebug } from '../utils.js';
import { buildDefinitions } from '../zeroYaml/definitions.js';
import { ReadableError } from '../zeroYaml/utils.js';

import type { GlobalOptions } from '../types.js';
import type { NangoProps, NangoYamlParsed, ParsedNangoAction, ParsedNangoSync, ScriptFileType } from '@nangohq/types';

interface LocalTestArgs extends GlobalOptions {
    sync: string;
    connectionId: string;
    input?: string;
    optionalEnvironment?: string;
    optionalProviderConfigKey?: string;
    variant?: string;
}

export type LocalTestResult =
    | { success: true; output: string }
    | {
          success: false;
          error: string;
          errorDetails?: string;
          details?: Record<string, unknown>;
      };

/**
 * LocalTestService executes scripts using mocked API responses from the mocks/ directory,
 * then validates the output against expected local data.
 *
 * This is useful for regression testing without making real API calls.
 *
 * Note: Requires mocked responses to be saved first using `dryrun --save-responses`.
 * Mocked responses are stored in: {integration}/mocks/nango/{method}/proxy/{endpoint}/{script}/{hash}.json
 */
export class LocalTestService {
    fullPath: string;
    isZeroYaml: boolean;

    constructor({ fullPath, isZeroYaml }: { fullPath: string; isZeroYaml: boolean }) {
        this.fullPath = fullPath;
        this.isZeroYaml = isZeroYaml;
    }

    public async run(options: LocalTestArgs, debug = false): Promise<LocalTestResult> {
        const { sync: syncName, connectionId, variant } = options;

        if (!syncName) {
            return { success: false, error: 'Script name is required' };
        }

        const syncVariant = variant || BASE_VARIANT;

        if (!connectionId) {
            return { success: false, error: 'Connection id is required' };
        }

        // Parse config to find integration and script
        let parsed: NangoYamlParsed;
        if (this.isZeroYaml) {
            const def = await buildDefinitions({ fullPath: this.fullPath, debug });
            if (def.isErr()) {
                return {
                    success: false,
                    error: def.error instanceof ReadableError ? def.error.toText() : def.error.message
                };
            }
            parsed = def.value;
        } else {
            const parsing = parse(process.cwd(), debug);
            if (parsing.isErr()) {
                return { success: false, error: parsing.error.message };
            }

            parsed = parsing.value.parsed!;
        }

        if (options.optionalProviderConfigKey && !parsed.integrations.some((inte) => inte.providerConfigKey === options.optionalProviderConfigKey)) {
            return { success: false, error: `Integration "${options.optionalProviderConfigKey}" does not exist` };
        }

        let providerConfigKey: string | undefined;
        let isOnEventScript = false;

        // Find the appropriate script to run
        let scriptInfo: ParsedNangoSync | ParsedNangoAction | undefined;
        for (const integration of parsed.integrations) {
            if (options.optionalProviderConfigKey && integration.providerConfigKey !== options.optionalProviderConfigKey) {
                continue;
            }

            // Priority for syncs and actions
            for (const script of [...integration.syncs, ...integration.actions]) {
                if (script.name !== syncName) {
                    continue;
                }
                if (scriptInfo) {
                    return { success: false, error: `Multiple integrations contain a script named "${syncName}". Please use "--integration-id"` };
                }
                scriptInfo = script;
                providerConfigKey = integration.providerConfigKey;
            }

            // If nothing that could still be a on-event script
            if (!scriptInfo) {
                for (const script of Object.values(integration.onEventScripts).flat()) {
                    if (script !== syncName) {
                        continue;
                    }
                    if (isOnEventScript) {
                        return {
                            success: false,
                            error: `Multiple integrations contain a post connection script named "${syncName}". Please use "--integration-id"`
                        };
                    }
                    isOnEventScript = true;
                    providerConfigKey = integration.providerConfigKey;
                }
            }
        }

        if ((!scriptInfo && !isOnEventScript) || !providerConfigKey) {
            return {
                success: false,
                error: `No script matched "${syncName}"${options.optionalProviderConfigKey ? ` for integration "${options.optionalProviderConfigKey}"` : ''}`
            };
        }

        if (debug && scriptInfo) {
            printDebug(`Found integration ${providerConfigKey}, ${scriptInfo.type} ${scriptInfo.name}`);
        }

        let type: ScriptFileType = 'syncs';
        if (scriptInfo?.type === 'action') {
            type = 'actions';
        } else if (isOnEventScript) {
            type = 'on-events';
        }

        // Verify mocked responses exist
        const mocksResponseDir = path.resolve(this.fullPath, providerConfigKey, 'mocks', 'nango');
        if (!fs.existsSync(mocksResponseDir)) {
            return {
                success: false,
                error: `No mocked responses found at ${mocksResponseDir}. Run "dryrun ${syncName} ${connectionId} --save-responses" first to capture API responses.`
            };
        }

        // Get the compiled script using the same method as dryrun
        // For zero yaml, build/ is at the root; for regular yaml, dist/ is per-provider
        const loadLocation = this.isZeroYaml ? this.fullPath + '/' : path.resolve(this.fullPath, providerConfigKey) + '/';

        // Create minimal syncConfig for local testing (validation not needed)
        const syncConfig: NangoProps['syncConfig'] = {
            id: 0,
            sync_name: syncName,
            nango_config_id: 0,
            file_location: '',
            version: '1',
            models: scriptInfo?.output || [],
            active: true,
            runs: null,
            environment_id: 1,
            track_deletes: false,
            type: scriptInfo?.type || 'sync',
            auto_start: false,
            attributes: {},
            pre_built: false,
            is_public: false,
            metadata: {},
            input: null,
            sync_type: 'full',
            webhook_subscriptions: null,
            enabled: true,
            models_json_schema: null,
            created_at: new Date(),
            updated_at: new Date(),
            deleted_at: null,
            sdk_version: null
        };

        const nangoProps: NangoProps = {
            scriptType: type === 'syncs' ? 'sync' : type === 'actions' ? 'action' : 'on-event',
            host: 'http://localhost',
            secretKey: 'test-secret-key',
            team: { id: 1, name: 'test-team' },
            connectionId,
            environmentId: 1,
            environmentName: 'dev',
            activityLogId: 'test-activity-log-id',
            providerConfigKey,
            provider: providerConfigKey,
            syncVariant: syncVariant || BASE_VARIANT,
            nangoConnectionId: 1,
            syncConfig,
            runnerFlags: {
                validateActionInput: false,
                validateActionOutput: false,
                validateSyncRecords: false,
                validateSyncMetadata: false
            },
            logger: { level: 'off' },
            debug,
            startedAt: new Date(),
            endUser: null
        };

        const script = getIntegrationFile({
            syncName,
            nangoProps,
            location: loadLocation,
            isZeroYaml: this.isZeroYaml
        });

        if (!script) {
            return {
                success: false,
                error: `Unable to find compiled script file for "${syncName}"`
            };
        }

        try {
            // Execute the compiled script using vm.Script (same as dryrun)
            const filename = `${syncName}-${providerConfigKey}.js`;
            const wrappedCode = `(function() { var module = { exports: {} }; var exports = module.exports; ${script}
                return module.exports;
            })();
            `;

            const scriptObj = new vm.Script(wrappedCode, { filename });

            const sandbox = {
                console,
                require: (moduleName: string) => {
                    switch (moduleName) {
                        case 'url':
                            return url;
                        case 'crypto':
                            return crypto;
                        case 'nango':
                            return nangoScript;
                        case 'zod':
                            return zod;
                        default:
                            throw new Error(`Module "${moduleName}" is not available in local test mode`);
                    }
                }
            };

            const context = vm.createContext(sandbox);
            const scriptExports: { default?: any } = scriptObj.runInContext(context);

            if (!scriptExports.default) {
                return {
                    success: false,
                    error: `No default export found for "${syncName}"`
                };
            }

            // Determine the function to call based on the export type (same logic as dryrun)
            let scriptFunction: (nango: any, input: any) => Promise<any>;
            if (typeof scriptExports.default !== 'function') {
                // Zero yaml exports an object with type and exec properties
                const payload = scriptExports.default;
                if (!payload.exec || typeof payload.exec !== 'function') {
                    return {
                        success: false,
                        error: `Invalid script export for "${syncName}". Expected exec function.`
                    };
                }
                scriptFunction = payload.exec;
            } else {
                // Regular yaml exports a function directly
                scriptFunction = scriptExports.default;
            }

            // Create mock instance using the base classes (no vitest dependency)
            const integrationDir = path.resolve(this.fullPath, providerConfigKey);
            const MockClass = type === 'syncs' ? NangoSyncMockBase : NangoActionMockBase;
            const mockInstance = new MockClass({
                dirname: integrationDir,
                name: syncName,
                Model: scriptInfo?.output?.[0] || ''
            });

            // Get input and expected output from mocked files
            const input = await mockInstance.getInput();
            const expectedOutput = await mockInstance.getOutput();

            // Run the script
            const actualOutput = await scriptFunction(mockInstance, input);

            // Compare output
            const outputsMatch = JSON.stringify(actualOutput) === JSON.stringify(expectedOutput);

            if (outputsMatch) {
                return {
                    success: true,
                    output: 'Output matches expected result'
                };
            } else {
                return {
                    success: false,
                    error: 'Output does not match expected result',
                    details: {
                        expected: expectedOutput,
                        actual: actualOutput
                    }
                };
            }
        } catch (err: any) {
            return {
                success: false,
                error: `Test execution failed: ${err.message}`,
                errorDetails: err.stack
            };
        }
    }
}
