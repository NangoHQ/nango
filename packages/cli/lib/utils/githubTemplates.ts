import path from 'node:path';

import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import axios from 'axios';

import { printDebug } from '../utils.js';

import type { NodePath } from '@babel/traverse';
import type { ImportDeclaration } from '@babel/types';

// GitHub API for directory listings (rate limited: 60/hour unauthenticated, 5000/hour with token)
export const GITHUB_API_BASE = 'https://api.github.com/repos/NangoHQ/integration-templates/contents/integrations';
// Raw content URL for file downloads (no practical rate limit)
export const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/NangoHQ/integration-templates/main/integrations';

export interface GitHubDirectoryItem {
    name: string;
    path: string;
    type: 'file' | 'dir' | 'symlink';
}

export class GitHubRateLimitError extends Error {
    constructor(resetTime?: number) {
        const resetDate = resetTime ? new Date(resetTime * 1000) : null;
        const resetMsg = resetDate ? ` Rate limit resets at ${resetDate.toLocaleTimeString()}.` : '';
        super(`GitHub API rate limit exceeded.${resetMsg} Set GITHUB_TOKEN environment variable to increase the limit.`);
        this.name = 'GitHubRateLimitError';
    }
}

export class GitHubNotFoundError extends Error {
    constructor(path: string) {
        super(`Template not found: ${path}`);
        this.name = 'GitHubNotFoundError';
    }
}

export function getGitHubHeaders(): Record<string, string> {
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

export async function fetchGitHubDirectory(urlPath: string, debug: boolean): Promise<GitHubDirectoryItem[]> {
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
export async function fetchFileContent(urlPath: string, debug: boolean): Promise<string> {
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
                throw new GitHubNotFoundError(urlPath);
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
export async function fetchDirectoryRecursively(dirPath: string, debug: boolean): Promise<{ relativePath: string; isScript: boolean }[]> {
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
export function parseLocalImports(content: string): string[] {
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
export function resolveImportPath(importPath: string, fromFilePath: string): string | null {
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
export async function collectDependencies(
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
