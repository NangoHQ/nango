import fs from 'node:fs';
import path from 'node:path';

import chalk from 'chalk';
import columnify from 'columnify';
import ora from 'ora';
import promptly from 'promptly';

import { buildDefinitions } from './definitions.js';
import { Err, Ok } from '../utils/result.js';
import { hostport, isCI, parseSecretKey, printDebug } from '../utils.js';
import { NANGO_VERSION } from '../version.js';
import { ReadableError } from './utils.js';
import { loadSchemaJson } from '../services/model.service.js';

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

type Package = Pick<PostDeployConfirmation['Body'], 'flowConfigs' | 'onEventScriptsByProvider' | 'singleDeployMode' | 'jsonSchema'>;

export async function deploy({
    fullPath,
    options,
    environmentName
}: {
    fullPath: string;
    options: DeployOptions;
    environmentName: string;
}): Promise<Result<boolean>> {
    const { version, debug } = options;

    let pkg: Package;
    const spinnerPackage = ora({ text: 'Packaging' }).start();
    try {
        // Prepare retro-compat json
        const def = await buildDefinitions({ fullPath, debug });
        if (def.isErr()) {
            spinnerPackage.fail();
            console.log('');
            console.log(def.error instanceof ReadableError ? def.error.toText() : chalk.red(def.error.message));
            return Err(def.error);
        }

        // Create deploy package
        const postData = await createPackage({
            parsed: def.value,
            fullPath,
            debug,
            version,
            optionalIntegrationId: options.integration,
            optionalSyncName: options.sync,
            optionalActionName: options.action
        });
        if (postData.isErr()) {
            spinnerPackage.fail();
            console.log(chalk.red(postData.error.message));
            return Err('no_data');
        }

        pkg = postData.value;
        spinnerPackage.succeed();
    } catch (err) {
        spinnerPackage.fail();
        console.error(chalk.red('Unknown error'), err);
        return Err('failed');
    }

    // Get the private key before reaching the API
    await parseSecretKey(environmentName, debug);

    const nangoYamlBody = '';
    const sdkVersion = `${NANGO_VERSION}-zero`;

    // Check remote state
    const spinnerState = ora({ text: `Acquiring remote state ${chalk.gray(`(${new URL(hostport).origin})`)}` }).start();
    let confirmation: ScriptDifferences;
    try {
        const confirmationRes = await postConfirmation({
            body: { ...pkg, reconcile: false, debug, sdkVersion }
        });
        if (confirmationRes.isErr()) {
            spinnerState.fail();
            console.log(chalk.red(confirmationRes.error.message));
            return Err(confirmationRes.error);
        }

        confirmation = confirmationRes.value;
        spinnerState.succeed();
    } catch {
        spinnerState.fail();
        return Err('failed');
    }

    const autoconfirm = process.env['NANGO_DEPLOY_AUTO_CONFIRM'] !== 'true' && !options.autoConfirm;
    const confirmed = await handleConfirmation({ autoconfirm, allowDestructive: options.allowDestructive || false, confirmation });
    if (confirmed.isErr()) {
        return Err('not_confirmed');
    }

    console.log('');
    // Actual deploy
    const total = pkg.flowConfigs.length + (pkg.onEventScriptsByProvider?.reduce((v, t) => v + t.scripts.length, 0) || 0);
    const spinnerDeploy = ora({ text: `Deploying`, suffixText: `${total} scripts` }).start();
    try {
        const deployRes = await postDeploy({
            body: { ...pkg, reconcile: true, debug, nangoYamlBody, sdkVersion }
        });
        if (deployRes.isErr()) {
            spinnerDeploy.fail();
            console.log(chalk.red(deployRes.error.message));
            return Err('failed_to_deploy');
        }

        spinnerDeploy.succeed('Deployed');
        console.log(chalk.green(deployRes.value));
        return Ok(true);
    } catch {
        spinnerDeploy.fail();
        return Err('failed');
    }
}

async function createPackage({
    parsed,
    fullPath,
    debug,
    version = '',
    optionalIntegrationId,
    optionalSyncName,
    optionalActionName
}: {
    parsed: NangoYamlParsed;
    fullPath: string;
    debug: boolean;
    version?: string | undefined;
    optionalIntegrationId?: string | undefined;
    optionalSyncName?: string | undefined;
    optionalActionName?: string | undefined;
}): Promise<Result<Package>> {
    printDebug('Packaging', debug);

    const postData: CLIDeployFlowConfig[] = [];
    const onEventScriptsByProvider: OnEventScriptsByProvider[] | undefined = optionalActionName || optionalSyncName ? undefined : []; // only load on-event scripts if we're not deploying a single sync or action
    const singleDeployMode = Boolean(optionalSyncName || optionalActionName);

    for (const integration of parsed.integrations) {
        const { providerConfigKey, onEventScripts } = integration;

        if (optionalIntegrationId && integration.providerConfigKey !== optionalIntegrationId) {
            continue;
        }

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
                    runs: sync.runs,
                    track_deletes: sync.track_deletes,
                    auto_start: sync.auto_start,
                    attributes: {},
                    metadata: metadata,
                    input: sync.input || undefined,
                    sync_type: sync.sync_type,
                    type: sync.type,
                    fileBody: files,
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
                    runs: null,
                    metadata: metadata,
                    input: action.input || undefined,
                    type: action.type,
                    fileBody: files,
                    endpoints: action.endpoint ? [action.endpoint] : [],
                    track_deletes: false
                };

                postData.push(body);
            }
        }
    }

    if (postData.length <= 0) {
        return Err(new Error('No scripts to deploy'));
    }

    const jsonSchema = loadSchemaJson({ fullPath });
    if (!jsonSchema) {
        return Err(new Error('Failed to load schema.json'));
    }

    return Ok({
        flowConfigs: postData,
        onEventScriptsByProvider,
        jsonSchema,
        singleDeployMode
    });
}

/**
 * Load source and bundled files
 */
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

/**
 * Load bundled file
 */
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
    const filePath = path.join(fullPath, 'build', `${providerConfigKey}_${type}_${scriptName}.cjs`);

    try {
        const content = await fs.promises.readFile(filePath, 'utf8');
        return content;
    } catch (err) {
        console.error(chalk.red(`Error loading file ${filePath}`), err instanceof Error ? err.message : err);
        return null;
    }
}

/**
 * Load main source file
 * nb: this is a legacy thing but it should bundle every import too otherwise it's useless
 */
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

/**
 * Call Nango api to get the state of the deploy
 */
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
            return Err(new Error(`Error checking state:\n${json.error.message} ${chalk.gray(`(${json.error.code})`)}`));
        }

        return Ok(json);
    } catch (err) {
        const errorMessage = getFetchError(err);
        return Err(new Error(`Error checking state:\n${errorMessage}`));
    }
}

/**
 * Call Nango api to actually deploy
 */
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
            return Err(new Error(`Error deploying:\n${json.error.message} ${chalk.gray(`(${json.error.code})`)}`));
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
        return Err(new Error(`Error deploying the scripts:\n${errorMessage}`));
    }
}

/**
 * Handle state, display plan and eventually ask for confirmation if destructive
 */
async function handleConfirmation({
    autoconfirm,
    allowDestructive,
    confirmation
}: {
    autoconfirm: boolean;
    allowDestructive: boolean;
    confirmation: PostDeployConfirmation['Success'];
}): Promise<Result<boolean>> {
    const {
        newSyncs,
        updatedSyncs,
        deletedSyncs,
        newActions,
        updatedActions,
        deletedActions,
        newOnEventScripts,
        updatedOnEventScripts,
        deletedOnEventScripts,
        deletedModels
    } = confirmation;
    let deletedSyncsConnectionsCount = 0;

    console.log('');
    console.log('', chalk.underline('Nango will perform this plan:'));

    // Syncs
    if (newSyncs.length > 0 || deletedSyncs.length > 0) {
        console.log('');
        console.log(shortSummaryMessage({ name: 'Syncs', newItems: newSyncs, deleteItems: deletedSyncs }));

        const tmp = [];
        for (const sync of newSyncs) {
            const syncMessage =
                sync.connections === 0 || !sync.auto_start
                    ? chalk.gray('(0 impacted connections)')
                    : chalk.gray(`(${chalk.yellow(`${sync.connections} impacted connections`)})`);
            tmp.push({ name: ` ${chalk.green('+')} ${sync.providerConfigKey} → ${sync.name}`, msg: syncMessage });
        }

        for (const sync of deletedSyncs) {
            const syncMessage =
                sync.connections === 0 ? chalk.gray('(0 impacted connections)') : chalk.gray(`(${chalk.red(`${sync.connections} impacted connections`)})`);
            tmp.push({ name: ` ${chalk.red('-')} ${sync.providerConfigKey} → ${sync.name}`, msg: syncMessage });
            deletedSyncsConnectionsCount += sync.connections || 0;
        }
        const columns = columnify(tmp, {
            showHeaders: false,
            minWidth: 30,
            config: {
                name: {
                    dataTransform: (a) => {
                        return `\u2063\u2063${a}`;
                    }
                },
                msg: { align: 'right' }
            }
        });
        console.log(columns);
    }

    // Actions
    if (newActions.length > 0 || deletedActions.length > 0) {
        console.log('');
        console.log(shortSummaryMessage({ name: 'Actions', newItems: newActions, deleteItems: deletedActions }));
        for (const action of newActions) {
            console.log(` ${chalk.green('+')} ${action.providerConfigKey} → ${action.name}`);
        }
        for (const action of deletedActions) {
            console.log(` ${chalk.red('-')} ${action.providerConfigKey} → ${action.name}`);
        }
    }

    // OnEvents
    if (newOnEventScripts.length > 0 || deletedOnEventScripts.length > 0) {
        console.log('');
        console.log(shortSummaryMessage({ name: 'OnEvents', newItems: newOnEventScripts, deleteItems: deletedOnEventScripts }));
        for (const onEvent of newOnEventScripts) {
            console.log(` ${chalk.green('+')} ${onEvent.providerConfigKey} → ${onEvent.name}`);
        }
        for (const onEvent of deletedOnEventScripts) {
            console.log(` ${chalk.red('-')} ${onEvent.providerConfigKey} → ${onEvent.name}`);
        }
    }

    if (deletedModels.length > 0) {
        console.log(chalk.red(`The following models have been removed: ${deletedModels.join(', ')}. `));
        console.log(
            chalk.red(
                "WARNING: Renaming a model is the equivalent of deleting the old model and creating a new one. Records from the old model won't be transferred to the new model. Consider running a full sync to transfer records."
            )
        );
    }

    if (
        newSyncs.length <= 0 &&
        deletedSyncs.length <= 0 &&
        newActions.length <= 0 &&
        deletedActions.length <= 0 &&
        newOnEventScripts.length <= 0 &&
        deletedOnEventScripts.length <= 0 &&
        deletedModels.length <= 0
    ) {
        console.log('');
        console.log(chalk.gray.italic('  Only updates'));
    }

    console.log('');
    console.log('', chalk.underline('Summary'));
    const columns = columnify(
        [
            summaryMessageColumns({ name: 'Syncs', newItems: newSyncs, updatedItems: updatedSyncs, deleteItems: deletedSyncs }),
            summaryMessageColumns({ name: 'Actions', newItems: newActions, updatedItems: updatedActions, deleteItems: deletedActions }),
            summaryMessageColumns({ name: 'OnEvents', newItems: newOnEventScripts, updatedItems: updatedOnEventScripts, deleteItems: deletedOnEventScripts })
        ],
        {
            showHeaders: false,
            minWidth: 18,
            config: {
                name: {
                    dataTransform: (a) => {
                        return `\u2063\u2063${a}`;
                    }
                }
            }
        }
    );
    console.log(columns);
    console.log('');

    const shouldConfirmDestructive = deletedSyncsConnectionsCount > 0 || deletedModels.length > 0;
    if (!shouldConfirmDestructive) {
        console.log(chalk.grey('No sync deleted with active connections, proceeding without confirmation'));

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

function summaryMessageColumns({ name, newItems, updatedItems, deleteItems }: { name: string; newItems: any[]; updatedItems: any[]; deleteItems: any[] }): any {
    return {
        name: ` ↳ ${name}`,
        create: chalk.gray(`to create [ ${chalk.green(`${newItems.length}`)} ]`),
        update: chalk.gray(`to update [ ${chalk.cyan(`${updatedItems.length}`)} ]`),
        delete: chalk.gray(`to delete [ ${chalk.red(`${deleteItems.length}`)} ]`)
    };
}
function shortSummaryMessage({ name, newItems, deleteItems }: { name: string; newItems: any[]; deleteItems: any[] }): string {
    return ` [${name} ${chalk.green(`+${newItems.length}`)} ${chalk.red(`-${deleteItems.length}`)}]`;
}
