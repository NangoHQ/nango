import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import chalk from 'chalk';
import jscodeshift from 'jscodeshift';

import { printDebug } from '../../utils.js';
import { NANGO_VERSION } from '../../version.js';
import { compileAllFiles } from '../compile.service.js';
import { loadYamlAndGenerate } from '../model.service.js';
import verificationService from '../verification.service.js';

import type { Collection } from 'jscodeshift';

export async function migrateToZeroYaml({ fullPath, debug }: { fullPath: string; debug: boolean }) {
    await verificationService.necessaryFilesExist({ fullPath, autoConfirm: true, debug });
    const { success } = await compileAllFiles({ fullPath, debug });
    if (!success) {
        console.log(chalk.red('Failed to compile. Exiting'));
        process.exitCode = 1;
        return;
    }

    const parsed = loadYamlAndGenerate({ fullPath, debug });
    if (!parsed) {
        process.exitCode = 1;
        return;
    }

    await addPackageJson({ fullPath, debug });

    for (const integration of parsed.integrations) {
        for (const sync of integration.syncs) {
            const content = await getContent({ fullPath, integrationId: integration.providerConfigKey, scriptType: 'syncs', scriptName: sync.name });
            //             content = content.replace(
            //                 /import type.*models";/,
            //                 `import { createSync } from 'nango';
            // import { z } from 'zod';
            // import type { NangoSync } from 'nango';`
            //             );

            //             content.replace(
            //                 /export default async function fetchData.*/,
            //                 `export default createSync({
            //     description: '${sync.description.replaceAll("'", "\'")}',
            //     version: '${sync.version}',
            //     endpoints: [{ method: 'GET', path: '/example/github/issues', group: 'Issues' }],
            //     runs: '${sync.runs}',
            //     autoStart: ${sync.auto_start},
            //     syncType: '${sync.sync_type}',
            //     trackDeletes: ${sync.track_deletes},
            //     models: {
            //         GithubIssue: issueSchema
            //     },

            //     // Sync execution
            //     exec: async (nango) => {
            //       Function content
            // });`
            //             );

            const j = jscodeshift.withParser('ts');
            const root = j(content);

            // Add import { createSync } from 'nango'; if not present
            const hasCreateSyncImport =
                root
                    .find(j.ImportDeclaration)
                    .filter((path) => {
                        return (
                            path.node.source.value === 'nango' &&
                            Array.isArray(path.node.specifiers) &&
                            path.node.specifiers.some((spec) => spec.type === 'ImportSpecifier' && spec.imported && spec.imported.name === 'createSync')
                        );
                    })
                    .size() > 0;

            if (!hasCreateSyncImport) {
                const importDecl = j.importDeclaration([j.importSpecifier(j.identifier('createSync'))], j.literal('nango'));
                root.get().node.program.body.unshift(importDecl);
            }

            addZodImport(root, j);

            // Wrap default function
            root.find(j.ExportDefaultDeclaration).forEach((path) => {
                const func = path.node.declaration;
                if (func.type === 'FunctionDeclaration') {
                    // Create an object with exec property as the function expression
                    const execArrow = j.arrowFunctionExpression(func.params, func.body);
                    execArrow.async = true;
                    const execProp = j.objectProperty(j.identifier('exec'), execArrow);
                    const descriptionProp = j.objectProperty(j.identifier('description'), j.stringLiteral(sync.description));
                    const versionProp = j.objectProperty(j.identifier('version'), j.stringLiteral(sync.version || '0.0.1'));
                    const runsProp = j.objectProperty(j.identifier('runs'), j.stringLiteral(sync.runs));
                    const autoStartProp = j.objectProperty(j.identifier('autoStart'), j.booleanLiteral(sync.auto_start));
                    const syncTypeProp = j.objectProperty(j.identifier('syncType'), j.stringLiteral(sync.sync_type));
                    const trackDeletesProp = j.objectProperty(j.identifier('trackDeletes'), j.booleanLiteral(sync.track_deletes));
                    const props = [descriptionProp, versionProp, runsProp, autoStartProp, syncTypeProp, trackDeletesProp];
                    if (Array.isArray(sync.scopes) && sync.scopes.length > 0) {
                        const scopesProp = j.objectProperty(j.identifier('scopes'), j.arrayExpression(sync.scopes.map((s) => j.stringLiteral(s))));
                        props.push(scopesProp);
                    }
                    props.push(execProp);
                    const obj = j.objectExpression(props);
                    path.replace(j.exportDefaultDeclaration(j.callExpression(j.identifier('createSync'), [obj])));
                }
            });

            const transformed = root.toSource();

            // Append transformed code after line 55
            const targetFile = path.join(fullPath, integration.providerConfigKey, 'syncs', `${sync.name}.v2.ts`);
            await fs.promises.writeFile(targetFile, transformed);
        }
    }

    // await fs.promises.rm(path.join(fullPath, 'nango.yaml'));
    // await fs.promises.rm(path.join(fullPath, 'models.ts'));

    await runNpmInstall(fullPath);
}

async function getContent({
    fullPath,
    integrationId,
    scriptType,
    scriptName
}: {
    fullPath: string;
    integrationId: string;
    scriptType: 'syncs' | 'actions' | 'on-events';
    scriptName: string;
}): Promise<string> {
    const res = await fs.promises.readFile(path.join(fullPath, integrationId, scriptType, `${scriptName}.ts`));
    return res.toString();
}

/**
 * Adds a package.json file to the given directory if it doesn't exist
 * Otherwise, it updates the existing package.json file
 */
async function addPackageJson({ fullPath, debug }: { fullPath: string; debug: boolean }) {
    // Ensure package.json exists and has nango in devDependencies
    const packageJsonPath = path.join(fullPath, 'package.json');
    const examplePackageJsonPath = path.join(import.meta.dirname, '../../../example/package.json');
    let packageJsonExists = false;
    try {
        await fs.promises.access(packageJsonPath, fs.constants.F_OK);
        packageJsonExists = true;
    } catch (_err) {
        packageJsonExists = false;
    }

    if (!packageJsonExists) {
        printDebug('package.json does not exist', debug);
        await fs.promises.copyFile(examplePackageJsonPath, packageJsonPath);
    } else {
        printDebug('package.json exists, updating', debug);
        const pkgRaw = await fs.promises.readFile(packageJsonPath, 'utf-8');
        const pkg = JSON.parse(pkgRaw) as { devDependencies?: Record<string, string>; dependencies?: Record<string, string> };

        const examplePkgRaw = await fs.promises.readFile(examplePackageJsonPath, 'utf-8');
        const examplePkg = JSON.parse(examplePkgRaw);
        const zodVersion = (examplePkg.devDependencies && examplePkg.devDependencies['zod'])!;
        pkg.devDependencies = pkg.devDependencies || {};
        pkg.devDependencies['nango'] = NANGO_VERSION;
        pkg.devDependencies['zod'] = zodVersion;

        // Remove nango and zod from dependencies just in case they were added as prod
        if (pkg.dependencies?.['nango']) {
            delete pkg.dependencies['nango'];
        }
        if (pkg.dependencies?.['zod']) {
            delete pkg.dependencies['zod'];
        }
        await fs.promises.writeFile(packageJsonPath, JSON.stringify(pkg, null, 2));
    }
}

/**
 * Runs npm install in the given directory
 */
async function runNpmInstall(fullPath: string): Promise<void> {
    await new Promise((resolve, reject) => {
        const proc = spawn('npm', ['install', '--no-audit', '--no-fund', '--no-progress'], {
            cwd: fullPath,
            stdio: 'inherit',
            shell: true
        });
        proc.on('close', (code) => {
            if (code === 0) {
                resolve(undefined);
            } else {
                reject(new Error(`npm install failed with exit code ${code}`));
            }
        });
    });
}

/**
 * Adds an import for zod if it's not present
 */
function addZodImport(root: Collection, j: jscodeshift.JSCodeshift) {
    const hasZodImport =
        root
            .find(j.ImportDeclaration)
            .filter((path) => {
                return (
                    path.node.source.value === 'zod' &&
                    Array.isArray(path.node.specifiers) &&
                    path.node.specifiers.some((spec) => spec.type === 'ImportSpecifier' && spec.imported && spec.imported.name === 'z')
                );
            })
            .size() > 0;

    if (!hasZodImport) {
        const importDecl = j.importDeclaration([j.importSpecifier(j.identifier('z'))], j.literal('zod'));
        root.get().node.program.body.unshift(importDecl);
    }
}
