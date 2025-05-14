import fs from 'node:fs';
import path from 'node:path';

import chalk from 'chalk';
import promptly from 'promptly';

import { rebuildParsed } from './rebuild.js';
import { Err, Ok } from '../utils/result.js';
import { hostport, isCI, parseSecretKey, printDebug } from '../utils.js';

import type { DeployOptions } from '../types.js';
import type {
    CLIDeployFlowConfig,
    NangoConfigMetadata,
    NangoYamlParsed,
    OnEventScriptsByProvider,
    OnEventType,
    PostDeploy,
    PostDeployConfirmation,
    Result,
    ScriptFileType
} from '@nangohq/types';
import type { JSONSchema7 } from 'json-schema';

export async function deploy({
    fullPath,
    options,
    environmentName
}: {
    fullPath: string;
    options: DeployOptions;
    environmentName: string;
}): Promise<Result<boolean>> {
    const { version, sync: optionalSyncName, action: optionalActionName, debug } = options;

    // Prepare retro-compat json
    const parsed = await rebuildParsed({ fullPath, debug });
    if (parsed.isErr()) {
        return Err(parsed.error);
    }

    await parseSecretKey(environmentName, debug);

    // Create deploy package
    const postData = await createPackage({ parsed: parsed.value, fullPath, debug, version, optionalSyncName, optionalActionName });
    if (postData.isErr()) {
        return Err('no_data');
    }

    const nangoYamlBody = '';

    // Check remote state
    const confirmationRes = await postConfirmation({
        body: { ...postData.value, reconcile: false, debug }
    });
    if (confirmationRes.isErr()) {
        return Err(confirmationRes.error);
    }

    const autoconfirm = process.env['NANGO_DEPLOY_AUTO_CONFIRM'] !== 'true' && !options.autoConfirm;
    await handleConfirmation({ autoconfirm, allowDestructive: options.allowDestructive || false, confirmation: confirmationRes.value });

    // Actual deploy
    const deployRes = await postDeploy({
        body: { ...postData.value, reconcile: true, debug, nangoYamlBody }
    });
    if (deployRes.isErr()) {
        return deployRes;
    }

    console.log(chalk.green('Deployed'));
    return Ok(true);
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
}): Promise<
    Result<{
        flowConfigs: CLIDeployFlowConfig[];
        onEventScriptsByProvider: OnEventScriptsByProvider[] | undefined;
        jsonSchema: JSONSchema7 | undefined;
    }>
> {
    printDebug('Packaging', debug);

    const postData: CLIDeployFlowConfig[] = [];
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
                        return Err('no_script');
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
                    return Err('no_script');
                }

                const body: CLIDeployFlowConfig = {
                    syncName: sync.name,
                    providerConfigKey,
                    models: sync.output || [],
                    version: version || sync.version,
                    runs: null,
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
                    return Err('no_script');
                }

                const body: CLIDeployFlowConfig = {
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

    return Ok({
        flowConfigs: postData,
        onEventScriptsByProvider,
        jsonSchema: undefined
    });
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
    const filePath = path.join(fullPath, 'build', providerConfigKey, type, `${scriptName}.mjs`);

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

async function postConfirmation({ body }: { body: PostDeployConfirmation['Body'] }): Promise<Result<PostDeployConfirmation['Success']>> {
    const url = new URL('/sync/deploy/confirmation', hostport);
    console.log('Checking remote state');

    try {
        const res = await fetch(url, {
            method: 'POST',
            body: JSON.stringify(body),
            headers: new Headers({
                authorization: `Bearer ${process.env['NANGO_SECRET_KEY']}`,
                'content-type': 'application/json'
            })
        });

        const json = (await res.json()) as PostDeployConfirmation['Reply'];
        if ('error' in json) {
            console.log(chalk.red(`Error checking state with the following error:`), json.error);
            return Err('err');
        }

        return Ok(json);
    } catch (err) {
        const errorMessage = JSON.stringify(err, ['message', 'name', 'stack'], 2);
        console.log(chalk.red(`Error checking state with the following error:`), errorMessage);
        return Err('err');
    }
}

async function postDeploy({ body }: { body: PostDeploy['Body'] }): Promise<Result<boolean>> {
    const url = new URL('/sync/deploy', hostport);
    console.log('Deploying', body.flowConfigs.length, 'scripts, to', url.href);

    try {
        const res = await fetch(url, {
            method: 'POST',
            body: JSON.stringify(body),
            headers: new Headers({
                authorization: `Bearer ${process.env['NANGO_SECRET_KEY']}`,
                'content-type': 'application/json'
            })
        });

        const json = (await res.json()) as PostDeploy['Reply'];
        if ('error' in json) {
            console.log(chalk.red(`Error deploying the scripts with the following error:`), json.error);
            return Err('err');
        }

        if (json.length === 0) {
            console.log(chalk.green(`Successfully removed the syncs/actions.`));
        } else {
            const nameAndVersions = json.map((result) => `${result.name}@v${result.version}`);
            console.log(
                chalk.green(
                    `Successfully deployed the scripts: \r\n${nameAndVersions
                        .map((row) => {
                            return `- ${row}`;
                        })
                        .join('\r\n')}`
                )
            );
        }
        return Ok(true);
    } catch (err) {
        const errorMessage = JSON.stringify(err, ['message', 'name', 'stack'], 2);
        console.log(chalk.red(`Error deploying the scripts with the following error:`), errorMessage);
        return Err('err');
    }
}

async function handleConfirmation({
    autoconfirm,
    allowDestructive,
    confirmation
}: {
    autoconfirm: boolean;
    allowDestructive: boolean;
    confirmation: PostDeployConfirmation['Success'];
}): Promise<Result<boolean>> {
    // Show response in term
    console.log(chalk.grey(JSON.stringify(confirmation, null, 2)));

    const { newSyncs, deletedSyncs, deletedModels } = confirmation;

    for (const sync of newSyncs) {
        const syncMessage =
            sync.connections === 0 || !sync.auto_start
                ? 'The sync will be added to your Nango instance if you deploy.'
                : `Nango will start syncing the corresponding data for ${sync.connections} existing connections.`;
        console.log(chalk.yellow(`Sync "${sync.name}" is new. ${syncMessage}`));
    }

    let deletedSyncsConnectionsCount = 0;
    for (const sync of deletedSyncs) {
        console.log(
            chalk.red(
                `Sync "${sync.name}" has been removed. It will stop running and the corresponding data will be deleted for ${sync.connections} existing connections.`
            )
        );
        deletedSyncsConnectionsCount += sync.connections || 0;
    }

    if (deletedModels.length > 0) {
        console.log(chalk.red(`The following models have been removed: ${deletedModels.join(', ')}. `));
        console.log(
            chalk.red(
                "WARNING: Renaming a model is the equivalent of deleting the old model and creating a new one. Records from the old model won't be transferred to the new model. Consider running a full sync to transfer records."
            )
        );
    }

    const shouldConfirmDestructive = deletedSyncsConnectionsCount > 0 || deletedModels.length > 0;
    if (!shouldConfirmDestructive) {
        console.log(chalk.blue('Not a destructive operation, proceeding without confirmation'));

        return Ok(true);
    }

    if (autoconfirm && !shouldConfirmDestructive) {
        console.log(chalk.yellow('autoconfirm flag is on, proceeding without confirmation'));

        return Ok(true);
    } else if (autoconfirm && shouldConfirmDestructive && allowDestructive) {
        console.log(chalk.yellow('allowDestructive flag is on, proceeding without confirmation'));

        return Ok(true);
    }

    // Can't do anything here
    if (isCI) {
        console.log(
            chalk.red(
                `Syncs/Actions were not deployed. Confirm the deploy by passing the --auto-confirm flag${shouldConfirmDestructive ? ' and --allow-destructive flag' : ''}. Exiting`
            )
        );
        return Err('is_ci');
    }

    const wait = await promptly.confirm(`Are you sure you want to continue y/n?`);
    if (!wait) {
        console.log(chalk.red('Syncs/Actions were not deployed. Exiting'));
        return Err('not_confirmed');
    }

    return Ok(true);
}
