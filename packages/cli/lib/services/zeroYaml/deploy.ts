import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import type {
    NangoYamlParsed,
    OnEventScriptsByProvider,
    ScriptFileType,
    IncomingFlowConfig,
    NangoConfigMetadata,
    OnEventType,
    PostDeploy
} from '@nangohq/types';

import { printDebug, parseSecretKey, http, enrichHeaders, hostport } from '../../utils.js';
import type { DeployOptions } from '../../types.js';
import type { JSONSchema7 } from 'json-schema';
// import { loadSchemaJson } from '../model.service.js';

import { rebuildParsed } from './rebuild.js';
import type { AxiosResponse } from 'axios';
import { isAxiosError } from 'axios';

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

    const postData = await createPackage({ parsed, fullPath, debug, version, optionalSyncName, optionalActionName });
    if (!postData) {
        return;
    }

    const nangoYamlBody = '';

    const url = hostport + `/sync/deploy`;

    const bodyDeploy: PostDeploy['Body'] = { ...postData, reconcile: true, debug, nangoYamlBody };

    await postPackage(url, bodyDeploy);
}

async function createPackage({
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
}): Promise<{
    flowConfigs: IncomingFlowConfig[];
    onEventScriptsByProvider: OnEventScriptsByProvider[] | undefined;
    jsonSchema: JSONSchema7 | undefined;
} | null> {
    const postData: IncomingFlowConfig[] = [];
    const onEventScriptsByProvider: OnEventScriptsByProvider[] | undefined = optionalActionName || optionalSyncName ? undefined : []; // only load on-event scripts if we're not deploying a single sync or action

    for (const integration of parsed.integrations) {
        const { providerConfigKey, onEventScripts } = integration;

        if (onEventScriptsByProvider) {
            const scripts: OnEventScriptsByProvider['scripts'] = [];
            for (const event of Object.keys(onEventScripts) as OnEventType[]) {
                for (const scriptName of onEventScripts[event]) {
                    const files = await loadScriptFiles({ scriptName, providerConfigKey, fullPath, type: 'on-events' });
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

                const files = await loadScriptFiles({ scriptName: sync.name, providerConfigKey, fullPath, type: 'syncs' });
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

                const files = await loadScriptFiles({ scriptName: action.name, providerConfigKey, fullPath, type: 'actions' });
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

    // const jsonSchema = loadSchemaJson({ fullPath });
    // if (!jsonSchema) {
    //     return null;
    // }

    // console.log(postData);

    return {
        flowConfigs: postData,
        onEventScriptsByProvider,
        jsonSchema: undefined
    };
}

async function loadScriptFiles({
    fullPath,
    scriptName,
    providerConfigKey,
    type
}: {
    fullPath: string;
    scriptName: string;
    providerConfigKey: string;
    type: ScriptFileType;
}): Promise<{ js: string; ts: string } | null> {
    const js = await loadScriptJsFile({ fullPath, scriptName, providerConfigKey, type });
    if (!js) {
        return null;
    }

    const ts = await loadScriptTsFile({ fullPath, scriptName, providerConfigKey, type });
    if (!ts) {
        return null;
    }

    return { js, ts };
}

async function loadScriptJsFile({
    scriptName,
    providerConfigKey,
    fullPath,
    type
}: {
    scriptName: string;
    type: ScriptFileType;
    providerConfigKey: string;
    fullPath: string;
}): Promise<string | null> {
    const filePath = path.join(fullPath, 'dist', providerConfigKey, type, `${scriptName}.cjs`);

    try {
        const content = await fs.promises.readFile(filePath, 'utf8');
        return content;
    } catch (err) {
        console.error(chalk.red(`Error loading file ${filePath}`), err instanceof Error ? err.message : err);
        return null;
    }
}

async function loadScriptTsFile({
    fullPath,
    scriptName,
    providerConfigKey,
    type
}: {
    fullPath: string;
    scriptName: string;
    providerConfigKey: string;
    type: ScriptFileType;
}): Promise<string | null> {
    const filePath = path.join(fullPath, providerConfigKey, type, `${scriptName}.ts`);

    try {
        const content = await fs.promises.readFile(filePath, 'utf8');
        return content;
    } catch (err) {
        console.error(chalk.red(`Error loading file ${filePath}`), err instanceof Error ? err.message : err);
        return null;
    }
}

async function postPackage(url: string, body: PostDeploy['Body']) {
    console.log('Deploying', body.flowConfigs.length, 'scripts', ', to', url);
    try {
        const res = await http.post<any, AxiosResponse<PostDeploy['Success']>>(url, body, { headers: enrichHeaders() });
        if (res.data.length === 0) {
            console.log(chalk.green(`Successfully removed the syncs/actions.`));
        } else {
            const nameAndVersions = res.data.map((result) => `${result.name}@v${result.version}`);
            console.log(chalk.green(`Successfully deployed the scripts: ${nameAndVersions.join(', ')}!`));
        }
    } catch (err) {
        const errorMessage = isAxiosError(err) ? JSON.stringify(err.response?.data, null, 2) : JSON.stringify(err, ['message', 'name', 'stack'], 2);
        console.log(chalk.red(`Error deploying the scripts with the following error: ${errorMessage}`));
        process.exit(1);
    }
}
