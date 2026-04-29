import fs from 'node:fs';
import path from 'node:path';

import chalk from 'chalk';

import { GitHubNotFoundError, collectDependencies, fetchDirectoryRecursively, fetchFileContent, fetchGitHubDirectory } from '../utils/githubTemplates.js';
import { checkExistingFiles, updateIndexFile } from '../utils/integrationFiles.js';
import { Spinner } from '../utils/spinner.js';
import { printDebug } from '../utils.js';

interface CloneOptions {
    fullPath: string;
    templatePath: string;
    debug: boolean;
    force: boolean;
    autoConfirm: boolean;
    interactive?: boolean;
}

interface ResolvedTemplatePath {
    type: 'directory' | 'file';
    path: string;
    mdPath?: string | undefined;
    integration: string;
}

/**
 * Resolve a template path by checking what exists in the remote repository.
 * - If the path matches a directory, returns type: 'directory'
 * - If the path doesn't exist but {path}.ts exists, returns type: 'file' with optional .md
 * - Throws GitHubNotFoundError if neither exists
 */
async function resolveTemplatePath(templatePath: string, debug: boolean): Promise<ResolvedTemplatePath> {
    const integration = templatePath.split('/')[0];
    if (!integration) {
        throw new Error('Template path cannot be empty');
    }

    // First, try to fetch as a directory
    try {
        await fetchGitHubDirectory(templatePath, debug);
        printDebug(`Path "${templatePath}" resolved as directory`, debug);
        return { type: 'directory', path: templatePath, integration };
    } catch (err) {
        if (!(err instanceof GitHubNotFoundError)) {
            throw err; // Re-throw rate limits, network errors, etc.
        }
        // Directory doesn't exist, try as file
    }

    const tsPath = `${templatePath}.ts`;
    try {
        await fetchFileContent(tsPath, debug);
        printDebug(`Path "${templatePath}" resolved as file: ${tsPath}`, debug);

        // Check if companion .md file exists
        const mdPath = `${templatePath}.md`;
        let hasMdFile = false;
        try {
            await fetchFileContent(mdPath, debug);
            hasMdFile = true;
            printDebug(`Found companion documentation: ${mdPath}`, debug);
        } catch {
            printDebug(`No companion documentation found for ${templatePath}`, debug);
        }

        return {
            type: 'file',
            path: tsPath,
            mdPath: hasMdFile ? mdPath : undefined,
            integration
        };
    } catch (err) {
        if (!(err instanceof GitHubNotFoundError)) {
            throw err;
        }
    }

    // Neither directory nor file exists
    throw new GitHubNotFoundError(templatePath);
}

interface FilesToClone {
    files: { relativePath: string; isScript: boolean }[];
    contentCache: Map<string, string>;
}

/**
 * Get all files to clone based on the resolved template path, including dependencies
 */
async function getFilesToClone(resolved: ResolvedTemplatePath, debug: boolean): Promise<FilesToClone> {
    const files: { relativePath: string; isScript: boolean }[] = [];
    const { type, path: resolvedPath, mdPath, integration } = resolved;

    if (type === 'file') {
        const isScript = /\/(actions|syncs)\/[^/]+\.ts$/.test(resolvedPath);
        files.push({ relativePath: resolvedPath, isScript });
        if (mdPath) {
            files.push({ relativePath: mdPath, isScript: false });
        }
    } else {
        const dirFiles = await fetchDirectoryRecursively(resolvedPath, debug);
        files.push(...dirFiles);
    }

    // Collect dependencies for all TypeScript files
    const contentCache = new Map<string, string>();
    const filesWithDependencies = await collectDependencies(files, integration, debug, contentCache);

    return { files: filesWithDependencies, contentCache };
}

/**
 * Main clone function - clones integration templates from the integration-templates repository
 */
export async function cloneTemplate(options: CloneOptions): Promise<boolean> {
    const { fullPath, templatePath, debug, force, autoConfirm, interactive = true } = options;
    const spinnerFactory = new Spinner({ interactive });

    const spinner = spinnerFactory.start(`Resolving template path: ${templatePath}`);

    try {
        const resolved = await resolveTemplatePath(templatePath, debug);
        printDebug(`Resolved template path: ${JSON.stringify(resolved)}`, debug);
        spinner.text = `Fetching file list for: ${templatePath}`;

        const { files, contentCache } = await getFilesToClone(resolved, debug);
        if (files.length === 0) {
            spinner.fail(`No files found for template: ${templatePath}`);
            return false;
        }

        printDebug(`Found ${files.length} files to clone`, debug);
        spinner.succeed(`Found ${files.length} files to clone`);

        const { proceed, filesToSkip } = await checkExistingFiles(fullPath, files, force, autoConfirm, debug, interactive);
        if (!proceed) {
            console.log(chalk.yellow('Clone cancelled.'));
            return false;
        }

        const downloadSpinner = spinnerFactory.start('Downloading files');
        let downloadedCount = 0;
        let skippedCount = 0;

        for (const file of files) {
            if (filesToSkip.has(file.relativePath)) {
                skippedCount++;
                continue;
            }

            downloadSpinner.text = `Downloading: ${file.relativePath}`;

            try {
                let content: string;
                if (contentCache.has(file.relativePath)) {
                    content = contentCache.get(file.relativePath)!;
                } else {
                    content = await fetchFileContent(file.relativePath, debug);
                }
                const localPath = path.join(fullPath, file.relativePath);

                // Ensure directory exists
                await fs.promises.mkdir(path.dirname(localPath), { recursive: true });

                await fs.promises.writeFile(localPath, content, 'utf-8');
                downloadedCount++;
            } catch (err) {
                downloadSpinner.fail(`Failed to download: ${file.relativePath}`);
                if (err instanceof Error) {
                    console.log(chalk.red(`  Error: ${err.message}`));
                }
                return false;
            }
        }

        downloadSpinner.succeed(`Downloaded ${downloadedCount} files${skippedCount > 0 ? ` (${skippedCount} skipped)` : ''}`);

        // Update index.ts
        const indexSpinner = spinnerFactory.start('Updating index.ts');
        await updateIndexFile(
            fullPath,
            files.filter((f) => !filesToSkip.has(f.relativePath)),
            debug
        );
        indexSpinner.succeed('Updated index.ts');

        console.log('');
        console.log(chalk.green(`Successfully cloned template: ${templatePath}`));
        console.log(chalk.gray(`\nFiles written to: ${fullPath}`));

        const scriptFiles = files.filter((f) => f.isScript && !filesToSkip.has(f.relativePath));
        if (scriptFiles.length > 0) {
            console.log(chalk.gray(`\nScripts added:`));
            for (const file of scriptFiles) {
                console.log(chalk.gray(`  - ${file.relativePath}`));
            }
        }

        console.log(`\nNext steps:`);
        console.log(`  1. Review and customize the pulled scripts`);
        console.log(`  2. Run 'nango dev' to compile and watch for changes`);
        console.log(`  3. Run 'nango deploy <environment>' to deploy`);

        return true;
    } catch (err) {
        spinner.fail('Clone failed');
        if (err instanceof Error) {
            console.log(chalk.red(`\nError: ${err.message}`));
        }
        return false;
    }
}
