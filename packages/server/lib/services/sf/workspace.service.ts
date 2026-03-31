import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { mkdtemp, mkdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { NANGO_VERSION } from '@nangohq/utils';

import type { SfFunctionType } from '@nangohq/types';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

const sfRoot = process.env['NANGO_SF_WORKDIR'] || path.join(os.tmpdir(), 'nango-sf');
const templateRoot = process.env['NANGO_SF_TEMPLATE_PROJECT_PATH'] || path.join(sfRoot, 'template', NANGO_VERSION);
const workspacesRoot = path.join(sfRoot, 'workspaces');

let templateInitialization: Promise<string> | null = null;

export interface SfWorkspace {
    workspacePath: string;
    entryTsPath: string;
    virtualScriptPath: string;
    compiledScriptPath: string;
}

export async function createSfWorkspace({
    integrationId,
    functionName,
    functionType,
    code
}: {
    integrationId: string;
    functionName: string;
    functionType: SfFunctionType;
    code: string;
}): Promise<SfWorkspace> {
    const templatePath = await ensureTemplateProject();

    await mkdir(workspacesRoot, { recursive: true });
    const workspacePath = await mkdtemp(path.join(workspacesRoot, 'ws-'));

    try {
        await copyTemplate({ templatePath, workspacePath });
        await symlinkNodeModules({ templatePath, workspacePath });

        const folderName = `${functionType}s`;
        const virtualScriptPath = `${integrationId}/${folderName}/${functionName}.ts`;
        const scriptPath = path.join(workspacePath, virtualScriptPath);

        await mkdir(path.dirname(scriptPath), { recursive: true });
        await writeFile(scriptPath, code, 'utf8');

        const indexContent = `import './${integrationId}/${folderName}/${functionName}.js';\n`;
        await writeFile(path.join(workspacePath, 'index.ts'), indexContent, 'utf8');

        return {
            workspacePath,
            entryTsPath: scriptPath,
            virtualScriptPath,
            compiledScriptPath: `build/${integrationId}_${folderName}_${functionName}.cjs`
        };
    } catch (error) {
        await rm(workspacePath, { recursive: true, force: true });
        throw error;
    }
}

export async function cleanupSfWorkspace(workspacePath: string): Promise<void> {
    await rm(workspacePath, { recursive: true, force: true });
}

async function copyTemplate({ templatePath, workspacePath }: { templatePath: string; workspacePath: string }): Promise<void> {
    await fs.promises.cp(templatePath, workspacePath, {
        recursive: true,
        force: true,
        filter: (sourcePath) => path.basename(sourcePath) !== 'node_modules'
    });
}

async function symlinkNodeModules({ templatePath, workspacePath }: { templatePath: string; workspacePath: string }): Promise<void> {
    const sourceNodeModules = path.join(templatePath, 'node_modules');
    const targetNodeModules = path.join(workspacePath, 'node_modules');

    try {
        await symlink(sourceNodeModules, targetNodeModules, 'dir');
    } catch {
        await rm(targetNodeModules, { recursive: true, force: true });
        await symlink(sourceNodeModules, targetNodeModules, 'dir');
    }
}

async function ensureTemplateProject(): Promise<string> {
    if (!templateInitialization) {
        templateInitialization = initializeTemplateProject().catch((error) => {
            templateInitialization = null;
            throw error;
        });
    }

    return templateInitialization;
}

async function initializeTemplateProject(): Promise<string> {
    await mkdir(templateRoot, { recursive: true });

    const packageJsonPath = path.join(templateRoot, 'package.json');
    const nodeModulesPath = path.join(templateRoot, 'node_modules');
    const hasPackageJson = fs.existsSync(packageJsonPath);
    const hasNodeModules = fs.existsSync(nodeModulesPath);

    if (!hasPackageJson) {
        const exampleFolder = resolveNangoExampleFolder();
        await fs.promises.cp(exampleFolder, templateRoot, {
            recursive: true,
            force: true,
            filter: (sourcePath) => path.basename(sourcePath) !== 'node_modules'
        });

        const envExample = path.join(templateRoot, '.env.example');
        const envFile = path.join(templateRoot, '.env');
        if (fs.existsSync(envExample) && !fs.existsSync(envFile)) {
            await rename(envExample, envFile);
        }

        await pinTemplateNangoVersion(packageJsonPath);
    }

    if (!hasNodeModules) {
        await execFileAsync('npm', ['install', '--no-audit', '--no-fund', '--no-progress'], {
            cwd: templateRoot,
            timeout: 10 * 60 * 1000,
            maxBuffer: 1024 * 1024 * 10
        });
    }

    return templateRoot;
}

function resolveNangoExampleFolder(): string {
    const nangoPackageJson = require.resolve('nango/package.json');
    const nangoRoot = path.dirname(nangoPackageJson);
    const exampleFolder = path.join(nangoRoot, 'example');
    if (!fs.existsSync(exampleFolder)) {
        throw new Error(`Unable to locate Nango example project at ${exampleFolder}`);
    }
    return exampleFolder;
}

async function pinTemplateNangoVersion(packageJsonPath: string): Promise<void> {
    const packageJsonRaw = await readFile(packageJsonPath, 'utf8');
    const packageJson = JSON.parse(packageJsonRaw) as {
        devDependencies?: Record<string, string>;
    };

    if (!packageJson.devDependencies) {
        packageJson.devDependencies = {};
    }
    packageJson.devDependencies['nango'] = NANGO_VERSION;

    await writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf8');
}
