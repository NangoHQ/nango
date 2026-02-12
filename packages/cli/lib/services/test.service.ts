import { exec } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import readline from 'readline';

import axios from 'axios';
import chalk from 'chalk';
import ejs from 'ejs';

import { Spinner } from '../utils/spinner.js';
import { printDebug } from '../utils.js';
import { compileAll } from '../zeroYaml/compile.js';
import { buildDefinitions } from '../zeroYaml/definitions.js';

const execAsync = promisify(exec);

export interface IntegrationDefinition {
    syncs: Record<string, { output: string | string[] }>;
    actions: Record<string, { output: string | null }>;
}

export interface ValidateFiltersResult {
    valid: boolean;
    error?: string;
    filteredIntegrations: Record<string, IntegrationDefinition>;
}

/**
 * Validates and filters integrations based on provided filter criteria.
 * This is a pure function that can be easily unit tested.
 */
export function validateAndFilterIntegrations({
    integrations,
    integrationId,
    syncName,
    actionName
}: {
    integrations: Record<string, IntegrationDefinition>;
    integrationId?: string | undefined;
    syncName?: string | undefined;
    actionName?: string | undefined;
}): ValidateFiltersResult {
    let filtered = { ...integrations };

    // Filter by integration ID
    if (integrationId) {
        if (!filtered[integrationId]) {
            return { valid: false, error: `Integration "${integrationId}" not found`, filteredIntegrations: {} };
        }
        filtered = { [integrationId]: filtered[integrationId] };
    }

    // Filter by sync name - only keep integrations that have this sync
    if (syncName) {
        const integrationsWithSync: Record<string, IntegrationDefinition> = {};
        for (const [key, integration] of Object.entries(filtered)) {
            if (integration.syncs && syncName in integration.syncs) {
                integrationsWithSync[key] = integration;
            }
        }
        if (Object.keys(integrationsWithSync).length === 0) {
            return { valid: false, error: `Sync "${syncName}" not found`, filteredIntegrations: {} };
        }
        filtered = integrationsWithSync;
    }

    // Filter by action name - only keep integrations that have this action
    if (actionName) {
        const integrationsWithAction: Record<string, IntegrationDefinition> = {};
        for (const [key, integration] of Object.entries(filtered)) {
            if (integration.actions && actionName in integration.actions) {
                integrationsWithAction[key] = integration;
            }
        }
        if (Object.keys(integrationsWithAction).length === 0) {
            return { valid: false, error: `Action "${actionName}" not found`, filteredIntegrations: {} };
        }
        filtered = integrationsWithAction;
    }

    return { valid: true, filteredIntegrations: filtered };
}

/**
 * Determines if a sync should be processed for test generation.
 * When actionName is specified, syncs should be skipped (user only wants action tests).
 * When syncName is specified, only the matching sync should be processed.
 */
export function shouldProcessSync({
    currentSyncName,
    syncName,
    actionName
}: {
    currentSyncName: string;
    syncName: string | undefined;
    actionName: string | undefined;
}): boolean {
    // Skip all syncs if actionName is specified (user only wants action tests)
    if (actionName) {
        return false;
    }
    // Skip non-matching syncs if syncName is specified
    if (syncName && currentSyncName !== syncName) {
        return false;
    }
    return true;
}

/**
 * Determines if an action should be processed for test generation.
 * When syncName is specified, actions should be skipped (user only wants sync tests).
 * When actionName is specified, only the matching action should be processed.
 */
export function shouldProcessAction({
    currentActionName,
    syncName,
    actionName
}: {
    currentActionName: string;
    syncName: string | undefined;
    actionName: string | undefined;
}): boolean {
    // Skip all actions if syncName is specified (user only wants sync tests)
    if (syncName) {
        return false;
    }
    // Skip non-matching actions if actionName is specified
    if (actionName && currentActionName !== actionName) {
        return false;
    }
    return true;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const VITE_CONFIG_TEMPLATE = path.resolve(__dirname, '../templates/vite.config.ejs');
const VITEST_SETUP_TEMPLATE = path.resolve(__dirname, '../templates/vitest.setup.ejs');
const SYNC_TEMPLATE_PATH = path.resolve(__dirname, '../templates/sync-test-template.ejs');
const ACTION_TEMPLATE_PATH = path.resolve(__dirname, '../templates/action-test-template.ejs');

function askQuestion(query: string): Promise<boolean> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question(query + ' (y/N): ', (answer) => {
            rl.close();
            resolve(/^y(es)?$/i.test(answer.trim()));
        });
    });
}

async function pathExists(path: string): Promise<boolean> {
    try {
        await fs.access(path);
        return true;
    } catch {
        return false;
    }
}

async function firstExistingPath(paths: string[]): Promise<string | null> {
    for (const p of paths) {
        if (await pathExists(p)) {
            return p;
        }
    }

    return null;
}

async function findUpFilename(filename: string, fromDir: string): Promise<string | null> {
    let currentDir = fromDir;

    while (true) {
        const potentialPath = path.join(currentDir, filename);
        if (await pathExists(potentialPath)) {
            return potentialPath;
        }

        const parentDir = path.dirname(currentDir);
        if (parentDir === currentDir) {
            return null;
        }

        currentDir = parentDir;
    }
}

async function getProjectRoot(): Promise<string> {
    const cwd = process.cwd();
    const packageJsonPath = await findUpFilename('package.json', cwd);
    return packageJsonPath ? path.dirname(packageJsonPath) : cwd;
}

async function fetchLatestVersions(packages: string[], debug: boolean): Promise<Record<string, string>> {
    const versions: Record<string, string> = {};

    for (const pkg of packages) {
        try {
            const response = await axios.get(`https://registry.npmjs.org/${pkg}`, {
                timeout: 5000
            });
            const latestVersion = response.data['dist-tags'].latest;
            versions[pkg] = latestVersion;
        } catch (err: any) {
            if (debug) {
                printDebug(`Failed to fetch latest version for ${pkg}: ${err}`);
            }
        }
    }

    return versions;
}

async function injectTestDependencies({ debug }: { debug: boolean }): Promise<void> {
    const rootPath = await getProjectRoot();
    const packageJsonPath = path.resolve(rootPath, 'package.json');
    if (!(await pathExists(packageJsonPath))) {
        if (debug) {
            printDebug(`package.json not found at ${packageJsonPath}. Skipping dependency injection.`);
        }
        return;
    }

    try {
        const packageJsonContent = await fs.readFile(packageJsonPath, 'utf8');
        const packageJson = JSON.parse(packageJsonContent);

        let needsUpdate = false;

        packageJson.scripts = packageJson.scripts || {};
        if (!packageJson.scripts.test || packageJson.scripts.test.trim() === '') {
            if (debug) {
                printDebug('Injecting test script: vitest');
            }
            packageJson.scripts.test = 'vitest';
            needsUpdate = true;
        }

        packageJson.devDependencies = packageJson.devDependencies || {};

        // dependencies for vitest config files
        const depPackages = ['vitest'];

        const missingDeps = depPackages.filter((pkg) => !packageJson.devDependencies[pkg]);

        if (missingDeps.length === 0) {
            if (debug) {
                printDebug('All required dependencies already present in package.json. Skipping dependency injection.');
            }
            if (needsUpdate) {
                await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf8');
                if (debug) {
                    printDebug(`package.json updated at ${packageJsonPath} (scripts only)`);
                }
            }
            return;
        }

        const requiredDeps: Record<string, string> = {};

        if (debug) {
            printDebug('Attempting to fetch latest versions from npm registry...');
        }

        const latestDeps = missingDeps.length > 0 ? await fetchLatestVersions(missingDeps, debug) : {};

        for (const pkg of missingDeps) {
            requiredDeps[pkg] = latestDeps[pkg] ? latestDeps[pkg] : 'latest';
        }

        if (debug) {
            printDebug(`Fetched latest versions: ${JSON.stringify(latestDeps)}`);
        }

        for (const [dep, version] of Object.entries(requiredDeps)) {
            packageJson.devDependencies[dep] = version;
            needsUpdate = true;
            if (debug) {
                printDebug(`Adding dependency: ${dep}@${version}`);
            }
        }

        if (needsUpdate) {
            await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf8');
            if (debug) {
                printDebug(`package.json updated at ${packageJsonPath}`);
            }

            if (debug) {
                printDebug(`Running npm install in project root`);
            }
            await execAsync('npm install', { cwd: rootPath });
        } else if (debug) {
            printDebug(`All required dependencies already present in package.json`);
        }
    } catch (err: any) {
        if (debug) {
            printDebug(`Error injecting test dependencies: ${err}`);
        }
        throw err;
    }
}

export async function generateSyncTest({
    integration,
    syncName,
    modelName,
    writePath,
    debug
}: {
    integration: string;
    syncName: string;
    modelName: string | string[];
    writePath: string;
    debug: boolean;
}): Promise<string> {
    const data = {
        integration,
        syncName,
        modelName
    };

    if (debug) {
        printDebug(`Generating sync test for ${integration}/${syncName} with data: ${JSON.stringify(data, null, 2)}`);
    }

    const templateSource = await fs.readFile(SYNC_TEMPLATE_PATH, 'utf8');
    const result = ejs.render(templateSource, data);

    const testDir = path.resolve(writePath, `${integration}/tests`);
    await fs.mkdir(testDir, { recursive: true });

    const outputPath = path.resolve(testDir, `${integration}-${syncName}.test.ts`);
    await fs.writeFile(outputPath, result);

    if (debug) {
        printDebug(`Test file created at ${outputPath}`);
    }

    return outputPath;
}

export async function generateActionTest({
    integration,
    actionName,
    output,
    writePath,
    debug
}: {
    integration: string;
    actionName: string;
    output: string | null;
    writePath: string;
    debug: boolean;
}): Promise<string> {
    const data = {
        integration,
        actionName,
        output
    };

    if (debug) {
        printDebug(`Generating action test for ${integration}/${actionName} with data: ${JSON.stringify(data, null, 2)}`);
    }

    const templateSource = await fs.readFile(ACTION_TEMPLATE_PATH, 'utf8');
    const result = ejs.render(templateSource, data);

    const testDir = path.resolve(writePath, `${integration}/tests`);
    await fs.mkdir(testDir, { recursive: true });

    const outputPath = path.resolve(testDir, `${integration}-${actionName}.test.ts`);
    await fs.writeFile(outputPath, result);

    if (debug) {
        printDebug(`Test file created at ${outputPath}`);
    }

    return outputPath;
}

async function generateTestConfigs({ debug, force = false }: { debug: boolean; force?: boolean }): Promise<boolean> {
    try {
        const rootPath = await getProjectRoot();

        if (debug) {
            printDebug(`Resolved project root: ${rootPath}`);
            printDebug(`Generating config files in: ${rootPath}`);
        }

        const viteConfigPath = path.resolve(rootPath, 'vite.config.ts');
        const vitestSetupPath = path.resolve(rootPath, 'vitest.setup.ts');

        const viteTemplate = await fs.readFile(VITE_CONFIG_TEMPLATE, 'utf8');
        const vitestTemplateSource = await fs.readFile(VITEST_SETUP_TEMPLATE, 'utf8');

        const vitestTemplate = ejs.render(vitestTemplateSource);

        if (force || !(await pathExists(viteConfigPath))) {
            await fs.writeFile(viteConfigPath, viteTemplate);
            if (debug) printDebug(`Created/Overwritten vite.config.ts at ${viteConfigPath}`);
        } else if (debug) {
            printDebug(`vite.config.ts already exists and force is not enabled, skipping`);
        }

        if (force || !(await pathExists(vitestSetupPath))) {
            await fs.writeFile(vitestSetupPath, vitestTemplate);
            if (debug) printDebug(`Created/Overwritten vitest.setup.ts at ${vitestSetupPath}`);
        } else if (debug) {
            printDebug(`vitest.setup.ts already exists and force is not enabled, skipping`);
        }

        return true;
    } catch (err: any) {
        console.error(chalk.red(`Config generation failed: ${err}`));
        return false;
    }
}

export async function generateTests({
    absolutePath,
    integrationId,
    syncName,
    actionName,
    debug = false,
    autoConfirm = false,
    interactive = true
}: {
    absolutePath: string;
    integrationId?: string;
    syncName?: string;
    actionName?: string;
    debug?: boolean;
    autoConfirm?: boolean;
    interactive?: boolean;
}): Promise<{ success: boolean; generatedFiles: string[] }> {
    try {
        if (debug) {
            printDebug(`Generating test files in ${absolutePath}`);
        }

        const spinnerFactory = new Spinner({ interactive });
        const spinner = spinnerFactory.start('Setting up test dependencies');
        try {
            await injectTestDependencies({ debug });
            spinner.succeed();
        } catch (err: any) {
            spinner.fail();
            console.error(chalk.red(`Failed to inject test dependencies: ${err}`));
            return { success: false, generatedFiles: [] };
        }

        const rootPath = await getProjectRoot();
        const viteConfigPath = path.resolve(rootPath, 'vite.config.ts');
        const vitestSetupPath = path.resolve(rootPath, 'vitest.setup.ts');

        const viteExists = await pathExists(viteConfigPath);
        const vitestExists = await pathExists(vitestSetupPath);

        let forceOverwrite = true;

        if (viteExists || vitestExists) {
            if (autoConfirm) {
                forceOverwrite = true;
                if (debug) {
                    printDebug(`Auto-confirm enabled. Skipping prompt and overwriting existing config files.`);
                }
            } else {
                forceOverwrite = await askQuestion('Tests config files already exist. Do you want to overwrite them?');
            }
        }

        await generateTestConfigs({ debug, force: forceOverwrite });

        let integrationsToProcess: Record<string, any> = {};

        if (debug) {
            printDebug('Detected zero-yaml project, compiling TypeScript and parsing definitions');
        }

        // compile then use js definitions
        const compileResult = await compileAll({ fullPath: absolutePath, debug, interactive });
        if (compileResult.isErr()) {
            console.error(chalk.red(`Failed to compile TypeScript: ${compileResult.error}`));
            return { success: false, generatedFiles: [] };
        }

        const defsResult = await buildDefinitions({ fullPath: absolutePath, debug });
        if (defsResult.isErr()) {
            console.error(chalk.red(`Failed to build definitions: ${defsResult.error}`));
            return { success: false, generatedFiles: [] };
        }

        const parsed = defsResult.value;

        for (const integration of parsed.integrations) {
            integrationsToProcess[integration.providerConfigKey] = {
                syncs: {},
                actions: {}
            };

            for (const sync of integration.syncs) {
                integrationsToProcess[integration.providerConfigKey].syncs[sync.name] = {
                    output: sync.output
                };
            }

            for (const action of integration.actions) {
                integrationsToProcess[integration.providerConfigKey].actions[action.name] = {
                    output: action.output
                };
            }
        }

        const filterResult = validateAndFilterIntegrations({
            integrations: integrationsToProcess,
            integrationId,
            syncName,
            actionName
        });

        if (!filterResult.valid) {
            console.error(chalk.red(filterResult.error));
            return { success: false, generatedFiles: [] };
        }

        integrationsToProcess = filterResult.filteredIntegrations;

        const generatedFiles: string[] = [];

        for (const integration of Object.keys(integrationsToProcess)) {
            if (debug) {
                printDebug(`Processing integration: ${integration}`);
            }

            const { syncs, actions } = integrationsToProcess[integration];

            for (const currentSyncName of Object.keys(syncs || {})) {
                if (!shouldProcessSync({ currentSyncName, syncName, actionName })) {
                    continue;
                }
                const sync = syncs[currentSyncName];
                const mockCandidates = [
                    // New unified mocks format (saved by `nango dryrun --save`)
                    path.resolve(absolutePath, `${integration}/tests/${currentSyncName}.test.json`),
                    // Support mocks saved alongside previously generated tests
                    path.resolve(absolutePath, `${integration}/tests/${integration}-${currentSyncName}.test.json`),
                    // Legacy mocks format
                    path.resolve(absolutePath, `${integration}/mocks/${currentSyncName}`)
                ];
                const mockPath = await firstExistingPath(mockCandidates);

                if (mockPath) {
                    const filePath = await generateSyncTest({
                        integration,
                        syncName: currentSyncName,
                        modelName: sync.output,
                        writePath: absolutePath,
                        debug
                    });
                    generatedFiles.push(filePath);
                } else if (debug) {
                    const tried = mockCandidates.map((p) => path.relative(absolutePath, p)).join(', ');
                    printDebug(`No mocks found for sync ${currentSyncName}, skipping test generation (tried: ${tried})`);
                }
            }

            for (const currentActionName of Object.keys(actions || {})) {
                if (!shouldProcessAction({ currentActionName, syncName, actionName })) {
                    continue;
                }
                const action = actions[currentActionName];
                const mockCandidates = [
                    // New unified mocks format (saved by `nango dryrun --save`)
                    path.resolve(absolutePath, `${integration}/tests/${currentActionName}.test.json`),
                    // Support mocks saved alongside previously generated tests
                    path.resolve(absolutePath, `${integration}/tests/${integration}-${currentActionName}.test.json`),
                    // Legacy mocks format
                    path.resolve(absolutePath, `${integration}/mocks/${currentActionName}`)
                ];
                const mockPath = await firstExistingPath(mockCandidates);

                if (mockPath) {
                    const filePath = await generateActionTest({
                        integration,
                        actionName: currentActionName,
                        output: action.output,
                        writePath: absolutePath,
                        debug
                    });
                    generatedFiles.push(filePath);
                } else if (debug) {
                    const tried = mockCandidates.map((p) => path.relative(absolutePath, p)).join(', ');
                    printDebug(`No mocks found for action ${currentActionName}, skipping test generation (tried: ${tried})`);
                }
            }
        }

        return { success: true, generatedFiles };
    } catch (err: any) {
        console.error(chalk.red(`Error generating tests: ${err}`));
        return { success: false, generatedFiles: [] };
    }
}
