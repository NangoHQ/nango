import fs from 'node:fs';
import path from 'node:path';

import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import axios from 'axios';
import chalk from 'chalk';
import ora from 'ora';
import promptly from 'promptly';

import { printDebug } from '../utils.js';

import type { NodePath } from '@babel/traverse';
import type { ImportDeclaration } from '@babel/types';

// Handle ESM/CJS interop for @babel/traverse
const traverse = (_traverse as typeof _traverse & { default?: typeof _traverse }).default ?? _traverse;

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

interface CloneOptions {
    fullPath: string;
    template: string;
    debug: boolean;
    force: boolean;
    autoConfirm: boolean;
}

interface ParsedTemplate {
    integration: string;
    type?: ParsedTemplateType;
    scriptName?: string;
}

type ParsedTemplateType = 'actions' | 'syncs';

/**
 * Parse a template string like "github", "github/actions", or "github/actions/list-repos"
 */
function parseTemplatePath(templatePath: string): ParsedTemplate {
    const parts = templatePath.split('/');

    if (parts.length === 1) {
        return { integration: parts[0]! };
    }

    if (parts.length === 2) {
        const type = parts[1] as ParsedTemplateType;
        if (!['actions', 'syncs'].includes(type)) {
            throw new Error(`Invalid template type: ${type}. Must be one of: actions, syncs`);
        }
        return { integration: parts[0]!, type };
    }

    if (parts.length === 3) {
        const type = parts[1] as ParsedTemplateType;
        if (!['actions', 'syncs'].includes(type)) {
            throw new Error(`Invalid template type: ${type}. Must be one of: actions, syncs`);
        }
        const scriptName = parts[2];
        if (!scriptName) {
            throw new Error(`Invalid template format: script name is required`);
        }
        return { integration: parts[0]!, type, scriptName };
    }

    throw new Error(`Invalid template format: ${templatePath}. Expected format: "integration", "integration/type", or "integration/type/script-name"`);
}

/**
 * Get GitHub API headers, including auth token if available
 */
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

/**
 * Fetch directory contents from GitHub API
 */
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
                throw new Error(`Template not found: ${urlPath}`);
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

        traverse(ast, {
            ImportDeclaration(nodePath: NodePath<ImportDeclaration>) {
                const source = nodePath.node.source.value;
                // Only collect relative imports (starting with . or ..)
                if (source.startsWith('./') || source.startsWith('../')) {
                    imports.push(source);
                }
            }
        });
    } catch {
        // If parsing fails, return empty array - file might have syntax errors
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
    // Get the directory of the importing file
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

    // Add initial files
    for (const file of initialFiles) {
        allFiles.set(file.relativePath, file);
        if (file.relativePath.endsWith('.ts')) {
            filesToProcess.push(file.relativePath);
        }
    }

    // Process files and collect dependencies
    while (filesToProcess.length > 0) {
        const filePath = filesToProcess.pop()!;

        if (processedFiles.has(filePath)) {
            continue;
        }
        processedFiles.add(filePath);

        // Fetch file content to analyze imports
        let content: string;
        try {
            // Check cache first
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

        // Parse imports
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

            // Skip if already tracked
            if (allFiles.has(resolvedPath)) {
                continue;
            }

            // Check if file exists on GitHub
            try {
                const depContent = await fetchFileContent(resolvedPath, debug);
                contentCache.set(resolvedPath, depContent);

                // Determine if this is a script (in actions/syncs/on-events folders)
                const isScript = /\/(actions|syncs|on-events)\/[^/]+\.ts$/.test(resolvedPath);
                allFiles.set(resolvedPath, { relativePath: resolvedPath, isScript });
                filesToProcess.push(resolvedPath);

                printDebug(`Added dependency: ${resolvedPath}`, debug);
            } catch {
                printDebug(`Dependency not found on GitHub: ${resolvedPath}`, debug);
            }
        }
    }

    return Array.from(allFiles.values());
}

/**
 * Check if integration exists in the remote repository
 */
async function validateIntegrationExists(integration: string, debug: boolean): Promise<boolean> {
    try {
        await fetchGitHubDirectory(integration, debug);
        return true;
    } catch (err) {
        // Re-throw rate limit errors so they're handled properly
        if (err instanceof GitHubRateLimitError) {
            throw err;
        }
        return false;
    }
}

interface FilesToClone {
    files: { relativePath: string; isScript: boolean }[];
    contentCache: Map<string, string>;
}

/**
 * Get all files to clone based on the parsed template, including dependencies
 */
async function getFilesToClone(parsed: ParsedTemplate, debug: boolean): Promise<FilesToClone> {
    const files: { relativePath: string; isScript: boolean }[] = [];
    const { integration, type, scriptName } = parsed;

    // Always include models.ts if it exists
    try {
        await fetchFileContent(`${integration}/models.ts`, debug);
        files.push({ relativePath: `${integration}/models.ts`, isScript: false });
    } catch {
        printDebug(`No models.ts found for ${integration}`, debug);
    }

    if (scriptName && type) {
        // Pull a specific script
        files.push({ relativePath: `${integration}/${type}/${scriptName}.ts`, isScript: true });
        // Also try to get the markdown doc
        try {
            await fetchFileContent(`${integration}/${type}/${scriptName}.md`, debug);
            files.push({ relativePath: `${integration}/${type}/${scriptName}.md`, isScript: false });
        } catch {
            printDebug(`No documentation found for ${scriptName}`, debug);
        }
    } else if (type) {
        // Pull all scripts of a specific type
        const contents = await fetchGitHubDirectory(`${integration}/${type}`, debug);
        for (const item of contents) {
            if (item.type === 'file' && (item.name.endsWith('.ts') || item.name.endsWith('.md'))) {
                const isScript = item.name.endsWith('.ts');
                files.push({ relativePath: `${integration}/${type}/${item.name}`, isScript });
            }
        }
    } else {
        // Pull entire integration
        const types: ('actions' | 'syncs' | 'on-events')[] = ['actions', 'syncs', 'on-events'];
        for (const t of types) {
            try {
                const contents = await fetchGitHubDirectory(`${integration}/${t}`, debug);
                for (const item of contents) {
                    if (item.type === 'file' && (item.name.endsWith('.ts') || item.name.endsWith('.md'))) {
                        const isScript = item.name.endsWith('.ts');
                        files.push({ relativePath: `${integration}/${t}/${item.name}`, isScript });
                    }
                }
            } catch {
                printDebug(`No ${t} directory found for ${integration}`, debug);
            }
        }
    }

    // Collect dependencies for all TypeScript files
    // Use a content cache to avoid double-fetching files during download
    const contentCache = new Map<string, string>();
    const filesWithDependencies = await collectDependencies(files, integration, debug, contentCache);

    return { files: filesWithDependencies, contentCache };
}

/**
 * Check for existing files and prompt user if needed
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
    const { fullPath, template, debug, force, autoConfirm } = options;

    const spinner = ora({ text: `Parsing template: ${template}` }).start();

    try {
        // Parse the template
        const parsed = parseTemplatePath(template);
        printDebug(`Parsed template: ${JSON.stringify(parsed)}`, debug);
        spinner.text = `Validating integration: ${parsed.integration}`;

        // Validate the integration exists
        const exists = await validateIntegrationExists(parsed.integration, debug);
        if (!exists) {
            spinner.fail(`Integration not found: ${parsed.integration}`);
            console.log(chalk.red(`\nThe integration "${parsed.integration}" does not exist in the integration-templates repository.`));
            console.log(chalk.gray(`\nBrowse available integrations at: https://github.com/NangoHQ/integration-templates/tree/main/integrations`));
            return false;
        }

        spinner.text = `Fetching file list for: ${template}`;

        // Get files to clone (with their content cached to avoid double-fetching)
        const { files, contentCache } = await getFilesToClone(parsed, debug);
        if (files.length === 0) {
            spinner.fail(`No files found for template: ${template}`);
            return false;
        }

        printDebug(`Found ${files.length} files to clone`, debug);
        spinner.succeed(`Found ${files.length} files to clone`);

        // Check for existing files
        const { proceed, filesToSkip } = await checkExistingFiles(fullPath, files, force, autoConfirm, debug);
        if (!proceed) {
            console.log(chalk.yellow('Clone cancelled.'));
            return false;
        }

        // Download and write files
        const downloadSpinner = ora({ text: 'Downloading files...' }).start();
        let downloadedCount = 0;
        let skippedCount = 0;

        for (const file of files) {
            if (filesToSkip.has(file.relativePath)) {
                skippedCount++;
                continue;
            }

            downloadSpinner.text = `Downloading: ${file.relativePath}`;

            try {
                // Use cached content if available, otherwise fetch
                let content: string;
                if (contentCache.has(file.relativePath)) {
                    content = contentCache.get(file.relativePath)!;
                } else {
                    content = await fetchFileContent(file.relativePath, debug);
                }
                const localPath = path.join(fullPath, file.relativePath);

                // Ensure directory exists
                await fs.promises.mkdir(path.dirname(localPath), { recursive: true });

                // Write file
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
        const indexSpinner = ora({ text: 'Updating index.ts...' }).start();
        await updateIndexFile(
            fullPath,
            files.filter((f) => !filesToSkip.has(f.relativePath)),
            debug
        );
        indexSpinner.succeed('Updated index.ts');

        // Success summary
        console.log('');
        console.log(chalk.green(`Successfully cloned template: ${template}`));
        console.log(chalk.gray(`\nFiles written to: ${fullPath}`));

        const scriptFiles = files.filter((f) => f.isScript && !filesToSkip.has(f.relativePath));
        if (scriptFiles.length > 0) {
            console.log(chalk.gray(`\nScripts added:`));
            for (const file of scriptFiles) {
                console.log(chalk.gray(`  - ${file.relativePath}`));
            }
        }

        console.log(chalk.gray(`\nNext steps:`));
        console.log(chalk.gray(`  1. Review and customize the pulled scripts`));
        console.log(chalk.gray(`  2. Run 'nango dev' to compile and watch for changes`));
        console.log(chalk.gray(`  3. Run 'nango deploy <environment>' to deploy`));

        return true;
    } catch (err) {
        spinner.fail('Clone failed');
        if (err instanceof Error) {
            console.log(chalk.red(`\nError: ${err.message}`));
        }
        return false;
    }
}
