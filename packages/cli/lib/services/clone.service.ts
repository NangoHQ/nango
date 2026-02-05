import fs from 'node:fs';
import path from 'node:path';

import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import axios from 'axios';
import chalk from 'chalk';
import promptly from 'promptly';

import { Spinner } from '../utils/spinner.js';
import { printDebug } from '../utils.js';

import type { NodePath } from '@babel/traverse';
import type { ImportDeclaration } from '@babel/types';

// GitHub API for directory listings (rate limited: 60/hour unauthenticated, 5000/hour with token)
const GITHUB_API_BASE = 'https://api.github.com/repos/NangoHQ/integration-templates/contents/integrations';
// Raw content URL for file downloads (no practical rate limit)
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/NangoHQ/integration-templates/main/integrations';

interface GitHubDirectoryItem {
    name: string;
    path: string;
    type: 'file' | 'dir' | 'symlink';
}

class GitHubRateLimitError extends Error {
    constructor(resetTime?: number) {
        const resetDate = resetTime ? new Date(resetTime * 1000) : null;
        const resetMsg = resetDate ? ` Rate limit resets at ${resetDate.toLocaleTimeString()}.` : '';
        super(`GitHub API rate limit exceeded.${resetMsg} Set GITHUB_TOKEN environment variable to increase the limit.`);
        this.name = 'GitHubRateLimitError';
    }
}

class GitHubNotFoundError extends Error {
    constructor(path: string) {
        super(`Template not found: ${path}`);
        this.name = 'GitHubNotFoundError';
    }
}

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
        if (!(err instanceof GitHubNotFoundError) && !(err instanceof Error && err.message.startsWith('File not found'))) {
            throw err;
        }
    }

    // Neither directory nor file exists
    throw new GitHubNotFoundError(templatePath);
}

function getGitHubHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'nango-cli'
    };

    const token = process.env['GITHUB_TOKEN'];
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
}

async function fetchGitHubDirectory(urlPath: string, debug: boolean): Promise<GitHubDirectoryItem[]> {
    const url = `${GITHUB_API_BASE}/${urlPath}`;
    printDebug(`Fetching GitHub directory: ${url}`, debug);

    try {
        const response = await axios.get<GitHubDirectoryItem[]>(url, {
            headers: getGitHubHeaders()
        });
        return response.data;
    } catch (err) {
        if (axios.isAxiosError(err)) {
            if (err.response?.status === 403) {
                const resetTime = err.response.headers['x-ratelimit-reset'];
                throw new GitHubRateLimitError(resetTime ? Number(resetTime) : undefined);
            }
            if (err.response?.status === 404) {
                throw new GitHubNotFoundError(urlPath);
            }
        }
        throw err;
    }
}

/**
 * Fetch file content from GitHub raw URL
 * Uses raw.githubusercontent.com which has higher rate limits than the API
 */
async function fetchFileContent(urlPath: string, debug: boolean): Promise<string> {
    const url = `${GITHUB_RAW_BASE}/${urlPath}`;
    printDebug(`Fetching file: ${url}`, debug);

    try {
        const response = await axios.get<string>(url, {
            headers: { 'User-Agent': 'nango-cli' },
            responseType: 'text'
        });
        return response.data;
    } catch (err) {
        if (axios.isAxiosError(err)) {
            if (err.response?.status === 404) {
                throw new Error(`File not found: ${urlPath}`);
            }
            if (err.response?.status === 403) {
                throw new GitHubRateLimitError();
            }
        }
        throw err;
    }
}

/**
 * Recursively fetch all files from a directory in the GitHub repository.
 * Returns file paths relative to the integrations root (e.g., "github/actions/list-repos.ts")
 */
async function fetchDirectoryRecursively(dirPath: string, debug: boolean): Promise<{ relativePath: string; isScript: boolean }[]> {
    const files: { relativePath: string; isScript: boolean }[] = [];

    const contents = await fetchGitHubDirectory(dirPath, debug);

    for (const item of contents) {
        if (item.type === 'dir') {
            const subFiles = await fetchDirectoryRecursively(item.path.replace(/^integrations\//, ''), debug);
            files.push(...subFiles);
        } else if (item.type === 'file') {
            const relativePath = item.path.replace(/^integrations\//, '');
            // Determine if this is a script (in actions/syncs folders)
            const isScript = /\/(actions|syncs)\/[^/]+\.ts$/.test(relativePath);
            files.push({ relativePath, isScript });
        }
    }

    return files;
}

/**
 * Parse local imports from a TypeScript file content using Babel
 * Returns relative import paths (starting with ./ or ../)
 */
function parseLocalImports(content: string): string[] {
    const imports: string[] = [];

    try {
        const ast = parse(content, {
            sourceType: 'module',
            plugins: ['typescript']
        });

        const traverseFn = (traverse as any).default || traverse;
        traverseFn(ast, {
            ImportDeclaration(nodePath: NodePath<ImportDeclaration>) {
                const source = nodePath.node.source.value;
                // Only collect relative imports (starting with . or ..)
                if (source.startsWith('./') || source.startsWith('../')) {
                    imports.push(source);
                }
            }
        });
    } catch {
        return [];
    }

    return imports;
}

/**
 * Resolve a relative import path to an absolute path within the integration
 * @param importPath - The import path (e.g., '../mappers/toCompany.js')
 * @param fromFilePath - The file containing the import (e.g., 'hubspot/actions/create-company.ts')
 * @returns The resolved path (e.g., 'hubspot/mappers/toCompany.ts') or null if outside integration
 */
function resolveImportPath(importPath: string, fromFilePath: string): string | null {
    const fromDir = path.dirname(fromFilePath);

    // Resolve the import path relative to the importing file's directory
    // Convert .js extension to .ts (TypeScript source)
    const tsPath = importPath.replace(/\.js$/, '.ts');
    const resolved = path.normalize(path.join(fromDir, tsPath));

    // Ensure the resolved path stays within the integration (no leading ..)
    if (resolved.startsWith('..')) {
        return null;
    }

    return resolved;
}

/**
 * Recursively collect all dependencies for a set of files
 * Also caches file content to avoid double-fetching
 */
async function collectDependencies(
    initialFiles: { relativePath: string; isScript: boolean }[],
    integration: string,
    debug: boolean,
    contentCache: Map<string, string>
): Promise<{ relativePath: string; isScript: boolean }[]> {
    const allFiles = new Map<string, { relativePath: string; isScript: boolean }>();
    const processedFiles = new Set<string>();
    const filesToProcess: string[] = [];

    for (const file of initialFiles) {
        allFiles.set(file.relativePath, file);
        if (file.relativePath.endsWith('.ts')) {
            filesToProcess.push(file.relativePath);
        }
    }

    while (filesToProcess.length > 0) {
        const filePath = filesToProcess.pop()!;

        if (processedFiles.has(filePath)) {
            continue;
        }
        processedFiles.add(filePath);

        let content: string;
        try {
            if (contentCache.has(filePath)) {
                content = contentCache.get(filePath)!;
            } else {
                content = await fetchFileContent(filePath, debug);
                contentCache.set(filePath, content);
            }
        } catch {
            printDebug(`Could not fetch ${filePath} for dependency analysis`, debug);
            continue;
        }

        const imports = parseLocalImports(content);
        printDebug(`Found ${imports.length} local imports in ${filePath}: ${imports.join(', ')}`, debug);

        for (const importPath of imports) {
            const resolvedPath = resolveImportPath(importPath, filePath);

            if (!resolvedPath) {
                printDebug(`Skipping import ${importPath} - resolves outside integration`, debug);
                continue;
            }

            // Check if this is a file within our integration
            if (!resolvedPath.startsWith(integration + '/')) {
                printDebug(`Skipping import ${importPath} - outside integration folder`, debug);
                continue;
            }

            if (allFiles.has(resolvedPath)) {
                continue;
            }

            // Check if file exists on GitHub
            try {
                const depContent = await fetchFileContent(resolvedPath, debug);
                contentCache.set(resolvedPath, depContent);

                // Dependencies are never scripts (they're helpers/mappers/etc.)
                allFiles.set(resolvedPath, { relativePath: resolvedPath, isScript: false });
                filesToProcess.push(resolvedPath);

                printDebug(`Added dependency: ${resolvedPath}`, debug);
            } catch {
                printDebug(`Dependency not found on GitHub: ${resolvedPath}`, debug);
            }
        }
    }

    return Array.from(allFiles.values());
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
 * Check for existing files to avoid accidental overwrites and prompt user if needed
 */
async function checkExistingFiles(
    fullPath: string,
    files: { relativePath: string; isScript: boolean }[],
    force: boolean,
    autoConfirm: boolean,
    debug: boolean
): Promise<{ proceed: boolean; filesToSkip: Set<string> }> {
    const existingFiles: string[] = [];
    const filesToSkip = new Set<string>();

    for (const file of files) {
        const localPath = path.join(fullPath, file.relativePath);
        if (fs.existsSync(localPath)) {
            existingFiles.push(file.relativePath);
        }
    }

    if (existingFiles.length === 0) {
        return { proceed: true, filesToSkip };
    }

    if (force) {
        printDebug(`Force mode: overwriting ${existingFiles.length} existing files`, debug);
        return { proceed: true, filesToSkip };
    }

    console.log(chalk.yellow(`\nThe following files already exist:`));
    for (const file of existingFiles) {
        console.log(chalk.yellow(`  - ${file}`));
    }

    if (autoConfirm) {
        console.log(chalk.yellow(`Auto-confirm enabled: overwriting files`));
        return { proceed: true, filesToSkip };
    }

    const answer = await promptly.prompt(chalk.yellow(`\nDo you want to overwrite these files? (yes/no/skip): `), { default: 'no' });

    if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
        return { proceed: true, filesToSkip };
    }

    if (answer.toLowerCase() === 'skip' || answer.toLowerCase() === 's') {
        for (const file of existingFiles) {
            filesToSkip.add(file);
        }
        return { proceed: true, filesToSkip };
    }

    return { proceed: false, filesToSkip };
}

/**
 * Update the index.ts file with new imports
 */
async function updateIndexFile(fullPath: string, files: { relativePath: string; isScript: boolean }[], debug: boolean): Promise<void> {
    const indexPath = path.join(fullPath, 'index.ts');
    let indexContent = '';

    if (fs.existsSync(indexPath)) {
        indexContent = await fs.promises.readFile(indexPath, 'utf-8');
    }

    const scriptFiles = files.filter((f) => f.isScript && f.relativePath.endsWith('.ts'));
    const newImports: string[] = [];

    for (const file of scriptFiles) {
        // Convert path like "github/actions/list-repos.ts" to "./github/actions/list-repos.js"
        const importPath = './' + file.relativePath.replace(/\.ts$/, '.js');
        const importStatement = `import '${importPath}';`;

        if (!indexContent.includes(importPath)) {
            newImports.push(importStatement);
        }
    }

    if (newImports.length > 0) {
        printDebug(`Adding ${newImports.length} new imports to index.ts`, debug);
        const updatedContent = indexContent.trim() + '\n' + newImports.join('\n') + '\n';
        await fs.promises.writeFile(indexPath, updatedContent, 'utf-8');
    }
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

        const { proceed, filesToSkip } = await checkExistingFiles(fullPath, files, force, autoConfirm, debug);
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
