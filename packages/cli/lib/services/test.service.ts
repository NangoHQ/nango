import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ejs from 'ejs';
import yaml from 'js-yaml';
import chalk from 'chalk';
import readline from 'readline';

import { printDebug } from '../utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const VITE_CONFIG_TEMPLATE = path.resolve(__dirname, '../templates/vite.config.ejs');
const VITEST_SETUP_TEMPLATE = path.resolve(__dirname, '../templates/vitest.setup.ejs');
const SYNC_TEMPLATE_PATH = path.resolve(__dirname, '../templates/sync-test-template.ejs');
const ACTION_TEMPLATE_PATH = path.resolve(__dirname, '../templates/action-test-template.ejs');

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

        // Check for config files and ask about overwrite
        const rootPath = await getProjectRoot();
        const viteConfigPath = path.resolve(rootPath, 'vite.config.ts');
        const vitestSetupPath = path.resolve(rootPath, 'vitest.setup.ts');

        const viteExists = await fileExists(viteConfigPath);
        const vitestExists = await fileExists(vitestSetupPath);

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

        const configPath = path.resolve(absolutePath, `nango.yaml`);
        const configContent = await fs.readFile(configPath, 'utf8');
        const config: any = yaml.load(configContent);
        const { integrations } = config;

        const integrationsToProcess = integrationId ? { [integrationId]: integrations[integrationId] } : integrations;

        if (integrationId && !integrationsToProcess[integrationId]) {
            console.error(chalk.red(`Integration "${integrationId}" not found in nango.yaml`));
            return false;
        }

        for (const integration of Object.keys(integrationsToProcess)) {
            if (debug) {
                printDebug(`Processing integration: ${integration}`);
            }

            const { syncs, actions } = integrationsToProcess[integration];

            for (const syncName of Object.keys(syncs || {})) {
                const sync = syncs[syncName];
                const mockPath = path.resolve(absolutePath, `${integration}/mocks/${syncName}`);

                if (await directoryExists(mockPath)) {
                    await generateSyncTest({
                        integration,
                        syncName,
                        modelName: sync.output,
                        writePath: absolutePath,
                        debug
                    });
                } else if (debug) {
                    printDebug(`No mocks found for sync ${syncName}, skipping test generation`);
                }
            }

            for (const actionName of Object.keys(actions || {})) {
                const action = actions[actionName];
                const mockPath = path.resolve(absolutePath, `${integration}/mocks/${actionName}`);

                if (await directoryExists(mockPath)) {
                    await generateActionTest({
                        integration,
                        actionName,
                        output: action.output,
                        writePath: absolutePath,
                        debug
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

async function directoryExists(path: string): Promise<boolean> {
    try {
        await fs.access(path);
        return true;
    } catch {
        return false;
    }
}

async function generateSyncTest({
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
}) {
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
}

async function generateActionTest({
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
}) {
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
}

async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

async function getProjectRoot(): Promise<string> {
    const cwd = process.cwd();
    if (cwd.endsWith('nango-integrations') || cwd.includes('nango-integrations/')) {
        const potentialRoot = path.resolve(cwd, '..');
        if (await fileExists(path.join(potentialRoot, 'package.json'))) {
            return potentialRoot;
        }
    }

    const packageJsonPath = await findUpFilename('package.json', cwd);
    return packageJsonPath ? path.dirname(packageJsonPath) : cwd;
}

async function findUpFilename(filename: string, fromDir: string): Promise<string | null> {
    let currentDir = fromDir;

    while (true) {
        const potentialPath = path.join(currentDir, filename);
        if (await fileExists(potentialPath)) {
            return potentialPath;
        }

        const parentDir = path.dirname(currentDir);
        if (parentDir === currentDir) {
            return null;
        }

        currentDir = parentDir;
    }
}

export async function generateTestConfigs({ debug, force = false }: { debug: boolean; force?: boolean }): Promise<boolean> {
    try {
        const rootPath = await getProjectRoot();

        if (debug) {
            printDebug(`Resolved project root: ${rootPath}`);
            printDebug(`Generating config files in: ${rootPath}`);
        }

        const viteConfigPath = path.resolve(rootPath, 'vite.config.ts');
        const vitestSetupPath = path.resolve(rootPath, 'vitest.setup.ts');

        const viteTemplate = await fs.readFile(VITE_CONFIG_TEMPLATE, 'utf8');
        const vitestTemplate = await fs.readFile(VITEST_SETUP_TEMPLATE, 'utf8');

        if (force || !(await fileExists(viteConfigPath))) {
            await fs.writeFile(viteConfigPath, viteTemplate);
            if (debug) printDebug(`Created/Overwritten vite.config.ts at ${viteConfigPath}`);
        } else if (debug) {
            printDebug(`vite.config.ts already exists and force is not enabled, skipping`);
        }

        if (force || !(await fileExists(vitestSetupPath))) {
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
