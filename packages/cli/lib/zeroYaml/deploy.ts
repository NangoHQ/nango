import fs from 'node:fs';
import path from 'node:path';

import chalk from 'chalk';
import figures from 'figures';
import ora from 'ora';
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
    ScriptDifferences,
    ScriptFileType
} from '@nangohq/types';
import type { JSONSchema7 } from 'json-schema';

interface Package {
    flowConfigs: CLIDeployFlowConfig[];
    onEventScriptsByProvider: OnEventScriptsByProvider[] | undefined;
    jsonSchema: JSONSchema7 | undefined;
}

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

    await parseSecretKey(environmentName, debug);

    let pkg: Package;
    const spinnerPackage = ora({ text: 'Packaging' }).start();
    try {
        // Prepare retro-compat json
        const parsed = await rebuildParsed({ fullPath, debug });
        if (parsed.isErr()) {
            spinnerPackage.fail('Failed to package');
            console.log(parsed.error.message);
            return Err(parsed.error);
        }

        // Create deploy package
        const postData = await createPackage({ parsed: parsed.value, fullPath, debug, version, optionalSyncName, optionalActionName });
        if (postData.isErr()) {
            spinnerPackage.fail('Failed to package');
            console.log(postData.error.message);
            return Err('no_data');
        }

        pkg = postData.value;
        spinnerPackage.succeed('Packaged');
    } catch {
        spinnerPackage.fail('Failed to package');
        return Err('failed');
    }

    const nangoYamlBody = '';

    // Check remote state
    const spinnerState = ora({ text: 'Acquire remote state' }).start();
    let confirmation: ScriptDifferences;
    try {
        const confirmationRes = await postConfirmation({
            body: { ...pkg, reconcile: false, debug }
        });
        if (confirmationRes.isErr()) {
            spinnerState.fail(chalk.red('Failed to acquire state'));
            console.log(confirmationRes.error.message);
            return Err(confirmationRes.error);
        }

        confirmation = confirmationRes.value;
        spinnerState.succeed('State acquired');
    } catch {
        spinnerState.fail(chalk.red('Failed to acquire state'));
        return Err('failed');
    }

    const autoconfirm = process.env['NANGO_DEPLOY_AUTO_CONFIRM'] !== 'true' && !options.autoConfirm;
    const confirmed = await handleConfirmation({ autoconfirm, allowDestructive: options.allowDestructive || false, confirmation });
    if (confirmed.isErr()) {
        return Err('not_confirmed');
    }

    // Actual deploy
    const spinnerDeploy = ora({ text: `Deploying`, suffixText: `${pkg.flowConfigs.length} scripts` }).start();
    try {
        const deployRes = await postDeploy({
            body: { ...pkg, reconcile: true, debug, nangoYamlBody }
        });
        if (deployRes.isErr()) {
            spinnerDeploy.fail('Failed to deploy');
            console.log(chalk.red(deployRes.error.message));
            return Err('failed_to_deploy');
        }

        spinnerDeploy.succeed('Deployed');
        console.log(chalk.green(deployRes.value));
        return Ok(true);
    } catch {
        spinnerDeploy.fail('Failed to deploy');
        return Err('failed');
    }
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
}): Promise<Result<Package>> {
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
                        return Err(new Error(`No script files found for "${scriptName}"`));
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
                    return Err(new Error(`No script files found for "${sync.name}"`));
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
                    return Err(new Error(`No script files found for "${action.name}"`));
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
            return Err(new Error(`Error checking state with the following error: ${JSON.stringify(json.error, null, 2)}`));
        }

        return Ok(json);
    } catch (err) {
        const errorMessage = getFetchError(err);
        return Err(new Error(`Error checking state with the following error: ${errorMessage}`));
    }
}

async function postDeploy({ body }: { body: PostDeploy['Body'] }): Promise<Result<string>> {
    const url = new URL('/sync/deploy', hostport);

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
            return Err(new Error(`Error deploying the scripts with the following error: ${JSON.stringify(json.error, null, 2)}`));
        }

        if (json.length === 0) {
            return Ok(`Successfully removed the syncs/actions.`);
        }

        const nameAndVersions = json.map((result) => `${result.name}@v${result.version}`);
        return Ok(
            `Successfully deployed the scripts: \r\n${nameAndVersions
                .map((row) => {
                    return `- ${row}`;
                })
                .join('\r\n')}`
        );
    } catch (err) {
        const errorMessage = getFetchError(err);
        return Err(new Error(`Error deploying the scripts with the following error: ${errorMessage}`));
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

    const c = confirmation;
    console.log(
        ` ${figures.triangleRightSmall} Syncs    ${chalk.green(`new [${c.newSyncs.length}]`)}, ${chalk.blue(`update [${c.updatedSyncs.length}]`)}, ${chalk.red(`delete [${c.deletedSyncs.length}]`)}`
    );
    if (c.deletedSyncs.length > 0) {
        console.log(
            c.deletedSyncs
                .map((row) => {
                    return chalk.red(`  ${figures.cross} Will delete script "${row.name}.ts", in ${row.providerConfigKey}`);
                })
                .join('\r\n')
        );
    }
    console.log(
        ` ${figures.triangleRightSmall} Actions  ${chalk.green(`new [${c.newActions.length}]`)}, ${chalk.blue(`update [${c.updatedActions.length}]`)}, ${chalk.red(`delete [${c.deletedActions.length}]`)}`
    );
    console.log(
        ` ${figures.triangleRightSmall} OnEvents ${chalk.green(`new [${c.newOnEventScripts.length}]`)}, ${chalk.blue(`update [${c.updatedOnEventScripts.length}]`)}, ${chalk.red(`delete [${c.deletedOnEventScripts.length}]`)}`
    );
    if (c.deletedModels.length > 0) {
        console.log(`- Models ${chalk.red(`delete [${c.deletedModels.length}]`)}`);
    }
    console.log('');

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
        console.log(chalk.grey('Not a destructive operation, proceeding without confirmation'));

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

    try {
        const wait = await promptly.confirm(`Are you sure you want to continue y/n?`);
        if (!wait) {
            console.log(chalk.yellow('Deployed aborted. Exiting'));
            return Err('not_confirmed');
        }
    } catch {
        console.log('');
        console.log(chalk.yellow('Deployed aborted. Exiting'));
        return Err('not_confirmed');
    }

    return Ok(true);
}

function getFetchError(err: unknown): string {
    return err instanceof TypeError && err.cause && err.cause instanceof AggregateError && 'code' in err.cause
        ? (err.cause.code as string)
        : err instanceof Error
          ? err.message
          : 'Unknown error';
}
