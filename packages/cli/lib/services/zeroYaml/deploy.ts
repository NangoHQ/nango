import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import type { NangoYamlParsed, OnEventScriptsByProvider, ScriptFileType, IncomingFlowConfig, NangoConfigMetadata, OnEventType } from '@nangohq/types';
import { resolveTsFileLocation } from '../compile.service.js';

import { printDebug, parseSecretKey } from '../../utils.js';
import type { DeployOptions } from '../../types.js';
import type { JSONSchema7 } from 'json-schema';
import { loadSchemaJson } from '../model.service.js';

import { rebuildParsed } from './rebuild.js';

export async function deploy({
    fullPath,
    options,
    environmentName,
    debug = false
}: {
    fullPath: string;
    options: DeployOptions;
    environmentName: string;
    debug?: boolean;
}) {
    const { version, sync: optionalSyncName, action: optionalActionName } = options;

    // const singleDeployMode = Boolean(optionalSyncName || optionalActionName);

    // const nangoYamlBody = '';
    const parsed = await rebuildParsed({ fullPath, debug });

    await parseSecretKey(environmentName, debug);

    const postData = createPackage({ parsed, fullPath, debug, version, optionalSyncName, optionalActionName });
    if (!postData) {
        return;
    }
}

function createPackage({
    parsed,
    fullPath,
    debug,
    version = '',
    optionalSyncName,
    optionalActionName
}: {
    parsed: NangoYamlParsed;
    fullPath: string;
    debug: boolean;
    version?: string | undefined;
    optionalSyncName?: string | undefined;
    optionalActionName?: string | undefined;
}): { flowConfigs: IncomingFlowConfig[]; onEventScriptsByProvider: OnEventScriptsByProvider[] | undefined; jsonSchema: JSONSchema7 } | null {
    const postData: IncomingFlowConfig[] = [];
    const onEventScriptsByProvider: OnEventScriptsByProvider[] | undefined = optionalActionName || optionalSyncName ? undefined : []; // only load on-event scripts if we're not deploying a single sync or action

    for (const integration of parsed.integrations) {
        const { providerConfigKey, onEventScripts } = integration;

        if (onEventScriptsByProvider) {
            const scripts: OnEventScriptsByProvider['scripts'] = [];
            for (const event of Object.keys(onEventScripts) as OnEventType[]) {
                for (const scriptName of onEventScripts[event]) {
                    const files = loadScriptFiles({ scriptName: scriptName, providerConfigKey, fullPath, type: 'on-events' });
                    if (!files) {
                        console.log(chalk.red(`No script files found for "${scriptName}"`));
                        return null;
                    }
                    scripts.push({ name: scriptName, fileBody: files, event });
                }
            }

            if (scripts.length > 0) {
                onEventScriptsByProvider.push({ providerConfigKey, scripts });
            }
        }

        if (!optionalActionName) {
            for (const sync of integration.syncs) {
                if (optionalSyncName && optionalSyncName !== sync.name) {
                    continue;
                }

                const metadata: NangoConfigMetadata = {};
                if (sync.description) {
                    metadata['description'] = sync.description;
                }
                if (sync.scopes) {
                    metadata['scopes'] = sync.scopes;
                }

                const files = loadScriptFiles({ scriptName: sync.name, providerConfigKey, fullPath, type: 'syncs' });
                if (!files) {
                    console.log(chalk.red(`No script files found for "${sync.name}"`));
                    return null;
                }
                if (debug) {
                    printDebug(`Scripts files found for ${sync.name}`);
                }

                const body: IncomingFlowConfig = {
                    syncName: sync.name,
                    providerConfigKey,
                    models: sync.output || [],
                    version: version || sync.version,
                    runs: sync.runs,
                    track_deletes: sync.track_deletes,
                    auto_start: sync.auto_start,
                    attributes: {},
                    metadata: metadata,
                    input: sync.input || undefined,
                    sync_type: sync.sync_type,
                    type: sync.type,
                    fileBody: files,
                    model_schema: sync.usedModels.map((name) => parsed.models.get(name)!),
                    endpoints: sync.endpoints,
                    webhookSubscriptions: sync.webhookSubscriptions
                };

                postData.push(body);
            }
        }

        if (!optionalSyncName) {
            for (const action of integration.actions) {
                if (optionalActionName && optionalActionName !== action.name) {
                    continue;
                }

                const metadata = {} as NangoConfigMetadata;
                if (action.description) {
                    metadata['description'] = action.description;
                }
                if (action.scopes) {
                    metadata['scopes'] = action.scopes;
                }

                const files = loadScriptFiles({ scriptName: action.name, providerConfigKey, fullPath, type: 'actions' });
                if (!files) {
                    console.log(chalk.red(`No script files found for "${action.name}"`));
                    return null;
                }
                if (debug) {
                    printDebug(`Scripts files found for "${action.name}"`);
                }

                const body: IncomingFlowConfig = {
                    syncName: action.name,
                    providerConfigKey,
                    models: action.output || [],
                    version: version || action.version,
                    runs: '',
                    metadata: metadata,
                    input: action.input || undefined,
                    type: action.type,
                    fileBody: files,
                    model_schema: action.usedModels.map((name) => parsed.models.get(name)!),
                    endpoints: action.endpoint ? [action.endpoint] : [],
                    track_deletes: false
                };

                postData.push(body);
            }
        }
    }

    if (debug && onEventScriptsByProvider) {
        for (const onEventScriptByProvider of onEventScriptsByProvider) {
            const { providerConfigKey, scripts } = onEventScriptByProvider;

            for (const script of scripts) {
                const { name } = script;

                printDebug(`on-events script found for ${providerConfigKey} with name ${name}`);
            }
        }
    }

    const jsonSchema = loadSchemaJson({ fullPath });
    if (!jsonSchema) {
        return null;
    }

    return { flowConfigs: postData, onEventScriptsByProvider, jsonSchema };
}

function loadScriptFiles({
    fullPath,
    scriptName,
    providerConfigKey,
    type
}: {
    fullPath: string;
    scriptName: string;
    providerConfigKey: string;
    type: ScriptFileType;
}): { js: string; ts: string } | null {
    const js = loadScriptJsFile({ fullPath, scriptName, providerConfigKey });
    if (!js) {
        return null;
    }

    const ts = loadScriptTsFile({ fullPath, scriptName, providerConfigKey, type });
    if (!ts) {
        return null;
    }

    return { js, ts };
}

function loadScriptJsFile({ scriptName, providerConfigKey, fullPath }: { scriptName: string; providerConfigKey: string; fullPath: string }): string | null {
    const filePath = path.join(fullPath, 'dist', `${scriptName}.js`);
    const fileNameWithProviderConfigKey = filePath.replace(`.js`, `-${providerConfigKey}.js`);

    try {
        let realPath;
        if (fs.existsSync(fileNameWithProviderConfigKey)) {
            realPath = fs.realpathSync(fileNameWithProviderConfigKey);
        } else {
            realPath = fs.realpathSync(filePath);
        }
        const content = fs.readFileSync(realPath, 'utf8');

        return content;
    } catch (err) {
        console.error(chalk.red(`Error loading file ${filePath}`), err instanceof Error ? err.message : err);
        return null;
    }
}

function loadScriptTsFile({
    fullPath,
    scriptName,
    providerConfigKey,
    type
}: {
    fullPath: string;
    scriptName: string;
    providerConfigKey: string;
    type: ScriptFileType;
}): string | null {
    const dir = resolveTsFileLocation({ fullPath, scriptName, providerConfigKey, type });
    const filePath = path.join(dir, `${scriptName}.ts`);
    try {
        const tsIntegrationFileContents = fs.readFileSync(filePath, 'utf8');

        return tsIntegrationFileContents;
    } catch (err) {
        console.error(chalk.red(`Error loading file ${filePath}`), err);
        return null;
    }
}
