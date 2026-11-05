import fs from 'node:fs';
import path from 'node:path';

import chalk from 'chalk';
import columnify from 'columnify';
import promptly from 'promptly';
import * as z from 'zod';

import { cliFetch } from '../tls.js';
import { getCliHeaders, parseSecretKey, printDebug, resolveHostport } from '../utils.js';
import { Err, Ok } from '../utils/result.js';
import { Spinner } from '../utils/spinner.js';
import { NANGO_VERSION } from '../version.js';
import { tsToJsPath } from './compile.js';
import { parseIntegrationDefinitions } from './definitions.js';
import { normalizeProjectRelativePath, resolveProjectPath } from './project-path.js';
import { ReadableError } from './utils.js';

import type { DeployOptions } from '../types.js';
import type { FunctionConfig, ParsedIntegrationDefinitions } from './definitions.js';
import type { ResolvedProjectPath } from './project-path.js';
import type {
    ApiError,
    CLIDeployFlowConfig,
    FunctionReconciliationScope,
    NangoConfigMetadata,
    NangoYamlParsed,
    OnEventScriptsByProvider,
    OnEventType,
    PostDeploy,
    PostDeployConfirmation,
    PostFunctionDeploymentBundle,
    PostFunctionDeploymentBundlePreview,
    Result,
    ScriptDifferences,
    ScriptFileType
} from '@nangohq/types';

type LegacyPackage = Pick<PostDeployConfirmation['Body'], 'flowConfigs' | 'onEventScriptsByProvider' | 'deployMode'>;
type FunctionsBundle = PostFunctionDeploymentBundle['Body'];
type Deployment = { kind: 'legacy'; package: LegacyPackage } | { kind: 'functions'; bundle: FunctionsBundle };
type DeploymentPlan = Deployment[];
type DeploymentConfirmation =
    | { kind: 'legacy'; value: ScriptDifferences; deployment: Extract<Deployment, { kind: 'legacy' }> }
    | { kind: 'functions'; value: PostFunctionDeploymentBundlePreview['Success']; deployment: Extract<Deployment, { kind: 'functions' }> };
type DeploymentResult = {
    deployed: { integrationId: string; name: string; version?: string | undefined }[];
    deleted: { integrationId: string; name: string }[];
};
type DeploymentSelection =
    | { kind: 'legacy'; integrationId?: string | undefined; syncName?: string | undefined; actionName?: string | undefined }
    | { kind: 'functions'; reconciliationScope: FunctionReconciliationScope };

export async function deploy({
    fullPath,
    options,
    environmentName,
    file,
    interactive
}: {
    fullPath: string;
    options: DeployOptions;
    environmentName: string;
    interactive: boolean;
    file?: string | undefined;
}): Promise<Result<boolean>> {
    const { env, version, debug } = options;
    const spinnerFactory = new Spinner({ interactive });

    if (options.sync && options.action) {
        console.log(chalk.red('The --sync and --action options cannot be used together.'));
        return Err('invalid_options');
    }

    const validArguments = validateDeployArguments({ environment: environmentName, file, options });
    if (validArguments.isErr()) {
        console.log(chalk.red(validArguments.error.message));
        return Err(validArguments.error);
    }
    if (options.sync || options.action) {
        console.log(chalk.yellow('--sync and --action are deprecated. Use `nango deploy <environment> <file>` to deploy a single script.'));
    }

    const plan: DeploymentPlan = [];
    const spinnerPackage = spinnerFactory.start('Packaging');
    try {
        const def = await parseIntegrationDefinitions({ fullPath, debug });
        if (def.isErr()) {
            spinnerPackage.fail();
            console.log('');
            console.log(def.error instanceof ReadableError ? def.error.toText() : chalk.red(def.error.message));
            return Err(def.error);
        }
        if (
            options.integration &&
            !def.value.integrations.some((integration) => integration.providerConfigKey === options.integration) &&
            !def.value.functions.some((config) => config.integrationId === options.integration)
        ) {
            spinnerPackage.fail();
            console.log(chalk.red(`No local definitions found for integration "${options.integration}".`));
            return Err('no_data');
        }

        const selections =
            file !== undefined
                ? planFileDeployment({ fullPath, file, parsed: def.value }).map((selection) => [selection])
                : Ok(planDeployment({ parsed: def.value, options }));
        if (selections.isErr()) {
            spinnerPackage.fail();
            console.log(chalk.red(selections.error.message));
            return Err('no_data');
        }

        for (const selection of selections.value) {
            if (selection.kind === 'legacy') {
                const postData = await createLegacyPackage({
                    parsed: def.value,
                    fullPath,
                    debug,
                    version,
                    optionalIntegrationId: selection.integrationId,
                    optionalSyncName: selection.syncName,
                    optionalActionName: selection.actionName
                });
                if (postData.isErr()) {
                    spinnerPackage.fail();
                    console.log(chalk.red(postData.error.message));
                    return Err('no_data');
                }
                plan.push({ kind: 'legacy', package: postData.value });
            } else {
                const bundle = await createFunctionsBundle({
                    fullPath,
                    functionConfigs: def.value.functions,
                    reconciliationScope: selection.reconciliationScope
                });
                if (bundle.isErr()) {
                    spinnerPackage.fail();
                    console.log(chalk.red(bundle.error.message));
                    return Err('no_data');
                }
                plan.push({ kind: 'functions', bundle: bundle.value });
            }
        }
        if (plan.length === 0) {
            spinnerPackage.fail();
            console.log(chalk.red('No functions to deploy.'));
            return Err('no_data');
        }

        spinnerPackage.succeed();
    } catch (err) {
        spinnerPackage.fail();
        console.error(chalk.red('Unknown error'), err);
        return Err('failed');
    }

    if (version && plan.some((deployment) => deployment.kind === 'functions')) {
        console.log(chalk.yellow('The --version option only applies to syncs/actions; it has no effect on functions.'));
    }

    // Get the private key before reaching the API
    await parseSecretKey(environmentName, debug);

    const nangoYamlBody = '';
    const sdkVersion = `${NANGO_VERSION}-zero`;

    const hostport = resolveHostport(env);

    // Check remote state
    const spinnerState = spinnerFactory.start(`Acquiring remote state ${chalk.gray(`(${new URL(hostport).origin})`)}`);
    const confirmations: DeploymentConfirmation[] = [];
    try {
        const confirmationResults = await Promise.all(plan.map((deployment) => previewDeployment({ deployment, hostport, debug, sdkVersion })));
        for (const confirmationRes of confirmationResults) {
            if (confirmationRes.isErr()) {
                spinnerState.fail();
                console.log(chalk.red(confirmationRes.error.message));
                return Err(confirmationRes.error);
            }
            confirmations.push(confirmationRes.value);
        }
        spinnerState.succeed();
    } catch {
        spinnerState.fail();
        return Err('failed');
    }

    const deploySource = resolveDeploySource();
    const autoconfirm = process.env['NANGO_DEPLOY_AUTO_CONFIRM'] === 'true' || options.autoConfirm;
    const confirmed = await handleConfirmation({
        autoconfirm,
        allowDestructive: options.allowDestructive || false,
        confirmations,
        interactive
    });
    if (confirmed.isErr()) {
        return Err('not_confirmed');
    }

    console.log('');
    // Actual deploy
    const total = plan.reduce(
        (count, deployment) =>
            count +
            (deployment.kind === 'legacy'
                ? deployment.package.flowConfigs.length + (deployment.package.onEventScriptsByProvider?.reduce((v, t) => v + t.scripts.length, 0) || 0)
                : deployment.bundle.functions.length),
        0
    );
    const spinnerDeploy = spinnerFactory.start(`Deploying ${total} functions`);
    const results: DeploymentResult[] = [];
    // Deployments are intentionally not atomic: completed ones are not rolled back on failure.
    for (const [failedIndex, confirmation] of confirmations.entries()) {
        const deployRes = await executeDeployment({ confirmation, hostport, debug, nangoYamlBody, sdkVersion, source: deploySource });
        if (deployRes.isErr()) {
            spinnerDeploy.fail();
            printDeploymentMessage(results);
            console.log(chalk.red(deployRes.error.message));
            console.log(chalk.red(failedIndex > 0 ? 'Deployment partially completed.' : 'Deployment failed.'));
            for (const [index, { kind }] of confirmations.entries()) {
                const status = index < failedIndex ? 'completed' : index === failedIndex ? 'failed' : 'not attempted';
                console.log(`- ${kind === 'legacy' ? 'Syncs/actions/on-events' : 'Functions'}: ${status}`);
            }
            console.log(chalk.yellow('The failed request may have applied changes. Check remote state before retrying.'));
            return Err('failed_to_deploy');
        }
        results.push(deployRes.value);
    }
    spinnerDeploy.succeed('Deployed');
    if (results.every((result) => result.deployed.length + result.deleted.length === 0)) {
        console.log(chalk.gray('No changes were deployed.'));
    } else {
        printDeploymentMessage(results);
    }
    return Ok(true);
}

async function previewDeployment({
    deployment,
    hostport,
    debug,
    sdkVersion
}: {
    deployment: Deployment;
    hostport: string;
    debug: boolean;
    sdkVersion: string;
}): Promise<Result<DeploymentConfirmation>> {
    if (deployment.kind === 'legacy') {
        const result = await postLegacyConfirmation({ hostport, body: { ...deployment.package, reconcile: false, debug, sdkVersion } });
        return result.map((value): DeploymentConfirmation => ({ kind: 'legacy', value, deployment }));
    }
    const result = await previewFunctionsDeployment({ hostport, body: deployment.bundle });
    return result.map((value): DeploymentConfirmation => ({ kind: 'functions', value, deployment }));
}

async function executeDeployment({
    confirmation,
    hostport,
    debug,
    nangoYamlBody,
    sdkVersion,
    source
}: {
    confirmation: DeploymentConfirmation;
    hostport: string;
    debug: boolean;
    nangoYamlBody: string;
    sdkVersion: string;
    source: 'standalone' | 'repo';
}): Promise<Result<DeploymentResult>> {
    try {
        if (confirmation.kind === 'legacy') {
            const { deployment, value } = confirmation;
            const result = await postLegacyDeploy({ hostport, body: { ...deployment.package, reconcile: true, debug, nangoYamlBody, sdkVersion, source } });
            return result.map((deployed) => ({
                deployed: deployed.map(({ providerConfigKey, name, version }) => ({ integrationId: providerConfigKey, name, version })),
                // The legacy API only returns deployed entries.
                // Getting deleted entries from the confirmation response instead.
                deleted: [...value.deletedSyncs, ...value.deletedActions, ...value.deletedOnEventScripts].map(({ providerConfigKey, name }) => ({
                    integrationId: providerConfigKey,
                    name
                }))
            }));
        }
        const result = await deployFunctions({ hostport, body: confirmation.deployment.bundle });
        return result.map((value) => ({ deployed: [...value.created, ...value.updated], deleted: value.deleted }));
    } catch (err) {
        return Err(new Error(`Unexpected deploy response:\n${err instanceof Error ? err.message : String(err)}`));
    }
}

function planDeployment({ parsed, options }: { parsed: ParsedIntegrationDefinitions; options: DeployOptions }): DeploymentSelection[] {
    const { integration: integrationId, sync: syncName, action: actionName } = options;
    if (syncName || actionName) {
        return [{ kind: 'legacy', integrationId, syncName, actionName }];
    }

    const integrations = integrationId ? parsed.integrations.filter((integration) => integration.providerConfigKey === integrationId) : parsed.integrations;
    const hasLegacyScripts = integrations.some(
        (integration) =>
            integration.syncs.length > 0 || integration.actions.length > 0 || Object.values(integration.onEventScripts).some((scripts) => scripts.length > 0)
    );
    const hasFunctions = parsed.functions.some((config) => !integrationId || config.integrationId === integrationId);

    const selections: DeploymentSelection[] = [];
    if (hasLegacyScripts) {
        selections.push({ kind: 'legacy', integrationId });
    }
    if (hasFunctions) {
        selections.push({ kind: 'functions', reconciliationScope: integrationId ? { kind: 'integration', integrationId } : { kind: 'environment' } });
    }
    return selections;
}

const environmentNameSchema = z
    .string()
    .regex(/^[a-z0-9_-]+$/)
    .max(255);

export function validateDeployArguments({
    environment,
    file,
    options
}: {
    environment: string;
    file?: string | undefined;
    options: DeployOptions;
}): Result<void> {
    if (!environmentNameSchema.safeParse(environment).success) {
        return Err(new Error(`'${environment}' is not a valid environment name. Usage: nango deploy <environment> [file]`));
    }
    if (file === undefined) {
        return Ok(undefined);
    }
    if (file.trim() === '') {
        return Err(new Error('The file argument is empty.'));
    }
    if (options.sync || options.action || options.integration) {
        return Err(new Error('A file cannot be combined with --sync, --action or --integration.'));
    }
    return Ok(undefined);
}

function planFileDeployment({ fullPath, file, parsed }: { fullPath: string; file: string; parsed: ParsedIntegrationDefinitions }): Result<DeploymentSelection> {
    const tsFile = file.replace(/\.js$/, '.ts');
    const resolved = resolveProjectPath({ projectRoot: fullPath, filePath: path.isAbsolute(tsFile) ? path.relative(fullPath, tsFile) : tsFile });
    if (!resolved) {
        return Err(new Error(`'${file}' must be inside the project folder.`));
    }

    const entryPoint = parsed.entryPoints.find((candidate) => normalizeProjectRelativePath(candidate.filePath) === resolved.relative);
    if (!entryPoint) {
        return Err(new Error(`'${file}' is not a script. Make sure it is imported from index.ts.`));
    }

    const { integrationId, name } = entryPoint;
    switch (entryPoint.type) {
        case 'function':
            return Ok({ kind: 'functions', reconciliationScope: { kind: 'function', integrationId, name } });
        case 'sync':
            return Ok({ kind: 'legacy', integrationId, syncName: name });
        case 'action':
            return Ok({ kind: 'legacy', integrationId, actionName: name });
        case 'on-event':
            return Err(
                new Error(
                    `'${file}' is an on-event script and can't be deployed on its own. Use \`nango deploy <environment> --integration ${integrationId}\` or deploy the whole project.`
                )
            );
    }
}

async function createFunctionsBundle({
    fullPath,
    functionConfigs,
    reconciliationScope
}: {
    fullPath: string;
    functionConfigs: FunctionConfig[];
    reconciliationScope: FunctionReconciliationScope;
}): Promise<Result<FunctionsBundle>> {
    const selectedConfigs = functionConfigs.filter((config) => {
        switch (reconciliationScope.kind) {
            case 'environment':
                return true;
            case 'function':
                return config.integrationId === reconciliationScope.integrationId && config.name === reconciliationScope.name;
            case 'integration':
                return config.integrationId === reconciliationScope.integrationId;
        }
    });
    if (reconciliationScope.kind === 'function' && selectedConfigs.length === 0) {
        return Err(new Error(`No compiled function found for "${reconciliationScope.name}"`));
    }

    const functions: FunctionsBundle['functions'] = [];
    for (const config of selectedConfigs) {
        const { filePath, ...artifact } = config;
        const sourcePath = resolveProjectPath({ projectRoot: fullPath, filePath });
        if (!sourcePath) {
            return Err(new Error(`Function source path "${filePath}" must be within the project directory`));
        }
        const fileBody = await loadScriptFiles({
            fullPath,
            scriptName: config.name,
            providerConfigKey: config.integrationId,
            type: 'functions',
            sourcePath
        });
        if (!fileBody) {
            return Err(new Error(`No function files found for "${config.name}"`));
        }
        functions.push({ ...artifact, fileBody });
    }

    return Ok({ reconciliationScope, functions });
}

/**
 * Maps NangoYamlParsed (which is a list of integrations and its function definitions) into the shape expected by the API,
 * while also loading the content of the related script files.
 * It also supports filtering by integration, sync or action name for single deploys.
 */
async function createLegacyPackage({
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
}): Promise<Result<LegacyPackage>> {
    printDebug('Packaging', debug);

    const postData: CLIDeployFlowConfig[] = [];
    const onEventScriptsByProvider: OnEventScriptsByProvider[] | undefined = optionalActionName || optionalSyncName ? undefined : []; // only load on-event scripts if we're not deploying a single sync or action
    const hasSingleScript = Boolean(optionalSyncName || optionalActionName);
    const deployMode: 'all' | 'single' | 'integration' = hasSingleScript ? 'single' : optionalIntegrationId ? 'integration' : 'all';

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
                        return Err(new Error(`No function files found for "${scriptName}"`));
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
                    webhookSubscriptions: sync.webhookSubscriptions,
                    models_json_schema: sync.json_schema,
                    features: sync.features
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
                    track_deletes: false,
                    models_json_schema: action.json_schema,
                    features: action.features
                };

                postData.push(body);
            }
        }
    }

    if (postData.length <= 0) {
        return Err(new Error('No syncs or actions to deploy'));
    }

    return Ok({
        flowConfigs: postData,
        onEventScriptsByProvider,
        deployMode
    });
}

/**
 * Load source and bundled files
 */
async function loadScriptFiles({
    fullPath,
    scriptName,
    providerConfigKey,
    type,
    sourcePath
}: {
    fullPath: string;
    scriptName: string;
    providerConfigKey: string;
    type: ScriptFileType;
    sourcePath?: ResolvedProjectPath;
}): Promise<{ js: string; ts: string } | null> {
    const js = await loadScriptJsFile({
        fullPath,
        scriptName,
        providerConfigKey,
        type,
        ...(sourcePath ? { sourcePath: sourcePath.relative } : {})
    });
    if (!js) {
        return null;
    }

    const ts = await loadScriptTsFile({
        fullPath,
        scriptName,
        providerConfigKey,
        type,
        ...(sourcePath ? { sourceFilePath: sourcePath.absolute } : {})
    });
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
    type,
    sourcePath
}: {
    scriptName: string;
    type: ScriptFileType;
    providerConfigKey: string;
    fullPath: string;
    sourcePath?: string;
}): Promise<string | null> {
    const filePath = sourcePath
        ? path.join(fullPath, 'build', tsToJsPath(sourcePath.replace(/\.ts$/, '.js')))
        : path.join(fullPath, 'build', `${providerConfigKey}_${type}_${scriptName}.cjs`);

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
    type,
    sourceFilePath
}: {
    fullPath: string;
    scriptName: string;
    providerConfigKey: string;
    type: ScriptFileType;
    sourceFilePath?: string;
}): Promise<string | null> {
    const filePath = sourceFilePath || path.join(fullPath, providerConfigKey, type, `${scriptName}.ts`);

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
async function postLegacyConfirmation({
    hostport,
    body
}: {
    hostport: string;
    body: PostDeployConfirmation['Body'];
}): Promise<Result<PostDeployConfirmation['Success']>> {
    const url = new URL('/sync/deploy/confirmation', hostport);

    try {
        const res = await cliFetch(url, {
            method: 'POST',
            body: JSON.stringify(body),
            headers: new Headers({
                ...getCliHeaders(),
                authorization: `Bearer ${process.env['NANGO_SECRET_KEY']}`,
                'content-type': 'application/json'
            })
        });

        const json = (await res.json()) as PostDeployConfirmation['Reply'];
        if ('error' in json) {
            return Err(
                new Error(
                    `Error checking state:\n${json.error.message || 'Error'} ${chalk.gray(`(${json.error.code})`)}${json.error.errors ? `\n${json.error.errors.map((e) => `- ${e.message}`).join('\n')}` : ''}`
                )
            );
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
async function postLegacyDeploy({ hostport, body }: { hostport: string; body: PostDeploy['Body'] }): Promise<Result<PostDeploy['Success']>> {
    const url = new URL('/sync/deploy', hostport);

    try {
        const res = await cliFetch(url, {
            method: 'POST',
            body: JSON.stringify(body),
            headers: new Headers({
                ...getCliHeaders(),
                authorization: `Bearer ${process.env['NANGO_SECRET_KEY']}`,
                'content-type': 'application/json'
            })
        });

        const json = (await res.json()) as PostDeploy['Reply'];
        if ('error' in json) {
            return Err(new Error(`Error deploying:\n${json.error.message} ${chalk.gray(`(${json.error.code})`)}`));
        }

        return Ok(json);
    } catch (err) {
        const errorMessage = getFetchError(err);
        return Err(new Error(`Error deploying:\n${errorMessage}`));
    }
}

function formatFunctionsDeploymentError(error: ApiError<string>['error']): string {
    const details = error.errors?.map((issue) => {
        const path = 'path' in issue ? issue.path.join('.') : '';
        return `- ${path ? `${path}: ` : ''}${issue.message}`;
    });
    return [`${error.message || 'Error'} ${chalk.gray(`(${error.code})`)}`, ...(details ?? [])].join('\n');
}

async function previewFunctionsDeployment({
    hostport,
    body
}: {
    hostport: string;
    body: PostFunctionDeploymentBundlePreview['Body'];
}): Promise<Result<PostFunctionDeploymentBundlePreview['Success']>> {
    const url = new URL('/functions/deployments/bundle/preview', hostport);

    try {
        const res = await cliFetch(url, {
            method: 'POST',
            body: JSON.stringify(body),
            headers: new Headers({
                ...getCliHeaders(),
                authorization: `Bearer ${process.env['NANGO_SECRET_KEY']}`,
                'content-type': 'application/json'
            })
        });

        const json = (await res.json()) as PostFunctionDeploymentBundlePreview['Reply'];
        if ('error' in json) {
            return Err(new Error(`Error checking functions state:\n${formatFunctionsDeploymentError(json.error)}`));
        }

        return Ok(json);
    } catch (err) {
        return Err(new Error(`Error checking functions state:\n${getFetchError(err)}`));
    }
}

async function deployFunctions({
    hostport,
    body
}: {
    hostport: string;
    body: PostFunctionDeploymentBundle['Body'];
}): Promise<Result<PostFunctionDeploymentBundle['Success']>> {
    const url = new URL('/functions/deployments/bundle', hostport);

    try {
        const res = await cliFetch(url, {
            method: 'POST',
            body: JSON.stringify(body),
            headers: new Headers({
                ...getCliHeaders(),
                authorization: `Bearer ${process.env['NANGO_SECRET_KEY']}`,
                'content-type': 'application/json'
            })
        });

        const json = (await res.json()) as PostFunctionDeploymentBundle['Reply'];
        if ('error' in json) {
            return Err(new Error(`Error deploying functions:\n${formatFunctionsDeploymentError(json.error)}`));
        }

        return Ok(json);
    } catch (err) {
        return Err(new Error(`Error deploying functions:\n${getFetchError(err)}`));
    }
}

function printDeploymentMessage(results: DeploymentResult[]): void {
    const deployed = results.flatMap((result) => result.deployed);
    const deleted = results.flatMap((result) => result.deleted);
    const messages: string[] = [];
    if (deployed.length > 0) {
        messages.push(
            `Successfully deployed: \r\n${deployed.map((func) => `- ${func.integrationId} → ${func.name}${func.version ? `@v${func.version}` : ''}`).join('\r\n')}`
        );
    }
    if (deleted.length > 0) {
        messages.push(`Successfully removed: \r\n${deleted.map((func) => `- ${func.integrationId} → ${func.name}`).join('\r\n')}`);
    }
    if (messages.length > 0) {
        console.log(chalk.green(messages.join('\r\n')));
    }
}

type RenderedConfirmation = { rows: ReturnType<typeof summaryMessageColumns>[]; requiresConfirmation: boolean };

function renderLegacyConfirmation(confirmation: PostDeployConfirmation['Success']): RenderedConfirmation {
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
    const scriptSummaries = [
        { name: 'Actions', newItems: newActions, updatedItems: updatedActions, deleteItems: deletedActions },
        { name: 'OnEvents', newItems: newOnEventScripts, updatedItems: updatedOnEventScripts, deleteItems: deletedOnEventScripts }
    ];
    const summaries = [{ name: 'Syncs', newItems: newSyncs, updatedItems: updatedSyncs, deleteItems: deletedSyncs }, ...scriptSummaries];
    if (
        deletedModels.length === 0 &&
        summaries.every(({ newItems, updatedItems, deleteItems }) => newItems.length + updatedItems.length + deleteItems.length === 0)
    ) {
        return { rows: [], requiresConfirmation: false };
    }
    let deletedSyncsConnectionsCount = 0;

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

    for (const { name, newItems, deleteItems } of scriptSummaries) {
        if (newItems.length === 0 && deleteItems.length === 0) {
            continue;
        }
        console.log('');
        console.log(shortSummaryMessage({ name, newItems, deleteItems }));
        for (const item of newItems) {
            console.log(` ${chalk.green('+')} ${item.providerConfigKey} → ${item.name}`);
        }
        for (const item of deleteItems) {
            console.log(` ${chalk.red('-')} ${item.providerConfigKey} → ${item.name}`);
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

    return {
        rows: summaries.map(summaryMessageColumns),
        requiresConfirmation: deletedSyncsConnectionsCount > 0 || deletedModels.length > 0
    };
}

function renderFunctionsConfirmation(confirmation: PostFunctionDeploymentBundlePreview['Success']): RenderedConfirmation {
    const { created, updated, deleted } = confirmation;

    if (created.length + updated.length + deleted.length === 0) {
        return { rows: [], requiresConfirmation: false };
    } else if (created.length > 0 || deleted.length > 0) {
        console.log('');
        console.log(shortSummaryMessage({ name: 'Functions', newItems: created, deleteItems: deleted }));
        for (const func of created) {
            console.log(` ${chalk.green('+')} ${func.integrationId} → ${func.name}`);
        }
        for (const func of deleted) {
            console.log(` ${chalk.red('-')} ${func.integrationId} → ${func.name}`);
        }
    }

    return {
        rows: [summaryMessageColumns({ name: 'Functions', newItems: created, updatedItems: updated, deleteItems: deleted })],
        requiresConfirmation: deleted.length > 0
    };
}

async function handleConfirmation({
    autoconfirm,
    allowDestructive,
    confirmations,
    interactive
}: {
    autoconfirm: boolean;
    allowDestructive: boolean;
    confirmations: DeploymentConfirmation[];
    interactive: boolean;
}): Promise<Result<boolean>> {
    console.log('');
    console.log('', chalk.underline('Nango will perform this plan:'));
    const summaries = confirmations.map((confirmation) =>
        confirmation.kind === 'legacy' ? renderLegacyConfirmation(confirmation.value) : renderFunctionsConfirmation(confirmation.value)
    );
    const rows = summaries.flatMap((summary) => summary.rows);
    if (rows.length > 0) {
        console.log('');
        console.log('', chalk.underline('Summary'));
        console.log(
            columnify(rows, {
                showHeaders: false,
                minWidth: 18,
                config: { name: { dataTransform: (value) => `\u2063\u2063${value}` } }
            })
        );
        console.log('');
    } else {
        console.log('');
        console.log(chalk.gray.italic('  No changes'));
    }

    if (!summaries.some((summary) => summary.requiresConfirmation)) {
        if (rows.length > 0) {
            console.log(chalk.grey('No destructive changes, proceeding without confirmation'));
        }
        return Ok(true);
    }

    if (autoconfirm && allowDestructive) {
        console.log(chalk.yellow('allowDestructive flag is on, proceeding without confirmation'));
        return Ok(true);
    }

    if (!interactive) {
        console.log(chalk.red('Nothing was deployed. Confirm the deploy by passing the --auto-confirm and --allow-destructive flags. Exiting'));
        return Err('is_ci');
    }

    try {
        const wait = await promptly.confirm(`Are you sure you want to continue y/n?`);
        if (!wait) {
            console.log(chalk.yellow('Deploy aborted. Exiting'));
            return Err('not_confirmed');
        }
    } catch {
        console.log('');
        console.log(chalk.yellow('Deploy aborted. Exiting'));
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

function summaryMessageColumns({
    name,
    newItems,
    updatedItems,
    deleteItems
}: {
    name: string;
    newItems: unknown[];
    updatedItems: unknown[];
    deleteItems: unknown[];
}) {
    return {
        name: ` ↳ ${name}`,
        create: chalk.gray(`to create [ ${chalk.green(`${newItems.length}`)} ]`),
        update: chalk.gray(`to update [ ${chalk.cyan(`${updatedItems.length}`)} ]`),
        delete: chalk.gray(`to delete [ ${chalk.red(`${deleteItems.length}`)} ]`)
    };
}
function shortSummaryMessage({ name, newItems, deleteItems }: { name: string; newItems: unknown[]; deleteItems: unknown[] }): string {
    return ` [${name} ${chalk.green(`+${newItems.length}`)} ${chalk.red(`-${deleteItems.length}`)}]`;
}

function resolveDeploySource(): 'standalone' | 'repo' {
    const val = process.env['NANGO_DEPLOY_SOURCE'];
    return val === 'standalone' ? 'standalone' : 'repo';
}
