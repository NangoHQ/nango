import { exec } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import readline from 'readline';

import axios from 'axios';
import chalk from 'chalk';
import ejs from 'ejs';
import yaml from 'js-yaml';
import ora from 'ora';

import { printDebug } from '../utils.js';
import { NANGO_VERSION } from '../version.js';
import { compileAll } from '../zeroYaml/compile.js';
import { buildDefinitions } from '../zeroYaml/definitions.js';

const execAsync = promisify(exec);

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
    if (cwd.endsWith('nango-integrations') || cwd.includes('nango-integrations/')) {
        const currentPackageJson = path.join(cwd, 'package.json');
        if (await pathExists(currentPackageJson)) {
            return cwd;
        }

        const potentialRoot = path.resolve(cwd, '..');
        if (await pathExists(path.join(potentialRoot, 'package.json'))) {
            return potentialRoot;
        }
    }

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
    const sharedPackageJsonPath = path.resolve(__dirname, '../../../shared/package.json');
    let nangoSharedVersion = '0.49.0'; // fallback version
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
        const depPackages = ['vitest', 'lodash-es', 'parse-link-header', 'nango', '@nangohq/shared'];
        const typePackages = ['@types/lodash-es', '@types/parse-link-header'];

        const missingDeps = depPackages.filter((pkg) => !packageJson.devDependencies[pkg]);
        const missingTypes = typePackages.filter((pkg) => !packageJson.devDependencies[pkg]);

        if (missingDeps.length === 0 && missingTypes.length === 0) {
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
        const requiredTypes: Record<string, string> = {};

        try {
            const sharedPackageContent = await fs.readFile(sharedPackageJsonPath, 'utf8');
            const sharedPackageJson = JSON.parse(sharedPackageContent);
            nangoSharedVersion = sharedPackageJson.version;
        } catch (err: any) {
            if (debug) {
                printDebug(
                    `Failed to read shared package.json, using fallback version: ${nangoSharedVersion}. Error: ${err instanceof Error ? err.message : 'unknown error'}`
                );
            }
        }

        if (debug) {
            printDebug('Attempting to fetch latest versions from npm registry...');
        }

        try {
            const missingNonSpecialPackages = missingDeps.filter((pkg) => pkg !== 'nango' && pkg !== '@nangohq/shared');
            const latestDeps = missingNonSpecialPackages.length > 0 ? await fetchLatestVersions(missingNonSpecialPackages, debug) : {};
            const latestTypes = missingTypes.length > 0 ? await fetchLatestVersions(missingTypes, debug) : {};

            for (const pkg of missingDeps) {
                if (pkg === 'nango') {
                    requiredDeps[pkg] = `^${NANGO_VERSION}`;
                } else if (pkg === '@nangohq/shared') {
                    requiredDeps[pkg] = `^${nangoSharedVersion}`;
                } else {
                    requiredDeps[pkg] = latestDeps[pkg] ? `^${latestDeps[pkg]}` : 'latest';
                }
            }

            for (const pkg of missingTypes) {
                requiredTypes[pkg] = latestTypes[pkg] ? `^${latestTypes[pkg]}` : 'latest';
            }

            if (debug) {
                printDebug(`Using Nango version: ${NANGO_VERSION}`);
                printDebug(`Using @nangohq/shared version: ${nangoSharedVersion}`);
                printDebug(`Fetched latest versions: ${JSON.stringify({ ...latestDeps, ...latestTypes })}`);
            }
        } catch (err: any) {
            if (debug) {
                printDebug(`Failed to fetch latest versions, using 'latest' as fallback: ${err}`);
            }
            for (const pkg of missingDeps) {
                if (pkg === 'nango') {
                    requiredDeps[pkg] = `^${NANGO_VERSION}`;
                } else if (pkg === '@nangohq/shared') {
                    requiredDeps[pkg] = `^${nangoSharedVersion}`;
                } else {
                    requiredDeps[pkg] = 'latest';
                }
            }
            for (const pkg of missingTypes) {
                requiredTypes[pkg] = 'latest';
            }
        }

        for (const [dep, version] of Object.entries(requiredDeps)) {
            packageJson.devDependencies[dep] = version;
            needsUpdate = true;
            if (debug) {
                printDebug(`Adding dependency: ${dep}@${version}`);
            }
        }

        for (const [dep, version] of Object.entries(requiredTypes)) {
            packageJson.devDependencies[dep] = version;
            needsUpdate = true;
            if (debug) {
                printDebug(`Adding type dependency: ${dep}@${version}`);
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

async function generateSyncTest({
    integration,
    syncName,
    modelName,
    writePath,
    debug,
    isZeroYaml
}: {
    integration: string;
    syncName: string;
    modelName: string | string[];
    writePath: string;
    debug: boolean;
    isZeroYaml: boolean;
}) {
    const data = {
        integration,
        syncName,
        modelName,
        isZeroYaml
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
}

async function generateActionTest({
    integration,
    actionName,
    output,
    writePath,
    debug,
    isZeroYaml
}: {
    integration: string;
    actionName: string;
    output: string | null;
    writePath: string;
    debug: boolean;
    isZeroYaml: boolean;
}) {
    const data = {
        integration,
        actionName,
        output,
        isZeroYaml
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
}

async function generateTestConfigs({ debug, force = false, isZeroYaml }: { debug: boolean; force?: boolean; isZeroYaml: boolean }): Promise<boolean> {
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

        const vitestTemplate = ejs.render(vitestTemplateSource, { isZeroYaml });

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
    debug = false,
    autoConfirm = false
}: {
    absolutePath: string;
    integrationId?: string;
    debug?: boolean;
    autoConfirm?: boolean;
}): Promise<boolean> {
    try {
        if (debug) {
            printDebug(`Generating test files in ${absolutePath}`);
        }

        const nangoYamlPath = path.resolve(absolutePath, 'nango.yaml');
        const indexTsPath = path.resolve(absolutePath, 'index.ts');
        const hasNangoYaml = await pathExists(nangoYamlPath);
        const hasIndexTs = await pathExists(indexTsPath);
        const isZeroYaml = !hasNangoYaml && hasIndexTs;

        if (debug) {
            printDebug(`Detected zero yaml: ${isZeroYaml}`);
        }

        const spinner = ora({ text: 'Setting up test dependencies' }).start();
        try {
            await injectTestDependencies({ debug });
            spinner.succeed();
        } catch (err: any) {
            spinner.fail();
            console.error(chalk.red(`Failed to inject test dependencies: ${err}`));
            return false;
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

        await generateTestConfigs({ debug, force: forceOverwrite, isZeroYaml });

        let integrationsToProcess: Record<string, any>;

        if (isZeroYaml) {
            if (debug) {
                printDebug('Detected zero-yaml project, compiling TypeScript and parsing definitions');
            }

            // compile then use js definitions
            const compileResult = await compileAll({ fullPath: absolutePath, debug });
            if (compileResult.isErr()) {
                console.error(chalk.red(`Failed to compile TypeScript: ${compileResult.error}`));
                return false;
            }

            const defsResult = await buildDefinitions({ fullPath: absolutePath, debug });
            if (defsResult.isErr()) {
                console.error(chalk.red(`Failed to build definitions: ${defsResult.error}`));
                return false;
            }

            const parsed = defsResult.value;
            integrationsToProcess = {};

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
        } else {
            if (debug) {
                printDebug('Detected yaml project, parsing from nango.yaml');
            }
            const configPath = path.resolve(absolutePath, `nango.yaml`);
            const configContent = await fs.readFile(configPath, 'utf8');
            const config: any = yaml.load(configContent);
            const { integrations } = config;
            integrationsToProcess = integrations;
        }

        if (integrationId) {
            if (!integrationsToProcess[integrationId]) {
                console.error(chalk.red(`Integration "${integrationId}" not found`));
                return false;
            }
            integrationsToProcess = { [integrationId]: integrationsToProcess[integrationId] };
        }

        for (const integration of Object.keys(integrationsToProcess)) {
            if (debug) {
                printDebug(`Processing integration: ${integration}`);
            }

            const { syncs, actions } = integrationsToProcess[integration];

            for (const syncName of Object.keys(syncs || {})) {
                const sync = syncs[syncName];
                const mockPath = path.resolve(absolutePath, `${integration}/mocks/${syncName}`);

                if (await pathExists(mockPath)) {
                    await generateSyncTest({
                        integration,
                        syncName,
                        modelName: sync.output,
                        writePath: absolutePath,
                        debug,
                        isZeroYaml
                    });
                } else if (debug) {
                    printDebug(`No mocks found for sync ${syncName}, skipping test generation`);
                }
            }

            for (const actionName of Object.keys(actions || {})) {
                const action = actions[actionName];
                const mockPath = path.resolve(absolutePath, `${integration}/mocks/${actionName}`);

                if (await pathExists(mockPath)) {
                    await generateActionTest({
                        integration,
                        actionName,
                        output: action.output,
                        writePath: absolutePath,
                        debug,
                        isZeroYaml
                    });
                } else if (debug) {
                    printDebug(`No mocks found for action ${actionName}, skipping test generation`);
                }
            }
        }

        return true;
    } catch (err: any) {
        console.error(chalk.red(`Error generating tests: ${err}`));
        return false;
    }
}
