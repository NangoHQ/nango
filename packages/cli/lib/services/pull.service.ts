import fs from 'node:fs';
import path from 'node:path';

import axios from 'axios';
import chalk from 'chalk';
import ora from 'ora';
import promptly from 'promptly';

import { printDebug } from '../utils.js';

const GITHUB_API_BASE = 'https://api.github.com/repos/NangoHQ/integration-templates/contents/integrations';
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/NangoHQ/integration-templates/main/integrations';

interface GitHubContent {
    name: string;
    path: string;
    type: 'file' | 'dir' | 'symlink';
    download_url: string | null;
}

interface PullOptions {
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
 * Fetch directory contents from GitHub API
 */
async function fetchGitHubContents(urlPath: string, debug: boolean): Promise<GitHubContent[]> {
    const url = `${GITHUB_API_BASE}/${urlPath}`;
    printDebug(`Fetching GitHub contents: ${url}`, debug);

    try {
        const response = await axios.get<GitHubContent[]>(url, {
            headers: {
                Accept: 'application/vnd.github.v3+json',
                'User-Agent': 'nango-cli'
            }
        });
        return response.data;
    } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 404) {
            throw new Error(`Template not found: ${urlPath}`);
        }
        throw err;
    }
}

/**
 * Fetch file content from GitHub raw URL
 */
async function fetchFileContent(urlPath: string, debug: boolean): Promise<string> {
    const url = `${GITHUB_RAW_BASE}/${urlPath}`;
    printDebug(`Fetching file: ${url}`, debug);

    const response = await axios.get<string>(url, {
        headers: {
            'User-Agent': 'nango-cli'
        },
        responseType: 'text'
    });
    return response.data;
}

/**
 * Check if integration exists in the remote repository
 */
async function validateIntegrationExists(integration: string, debug: boolean): Promise<boolean> {
    try {
        await fetchGitHubContents(integration, debug);
        return true;
    } catch {
        return false;
    }
}

/**
 * Get all script files to pull based on the parsed template
 */
async function getFilesToPull(parsed: ParsedTemplate, debug: boolean): Promise<{ relativePath: string; isScript: boolean }[]> {
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
        const contents = await fetchGitHubContents(`${integration}/${type}`, debug);
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
                const contents = await fetchGitHubContents(`${integration}/${t}`, debug);
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

    return files;
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
 * Main pull function
 */
export async function pull(options: PullOptions): Promise<boolean> {
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

        // Get files to pull
        const files = await getFilesToPull(parsed, debug);
        if (files.length === 0) {
            spinner.fail(`No files found for template: ${template}`);
            return false;
        }

        printDebug(`Found ${files.length} files to pull`, debug);
        spinner.succeed(`Found ${files.length} files to pull`);

        // Check for existing files
        const { proceed, filesToSkip } = await checkExistingFiles(fullPath, files, force, autoConfirm, debug);
        if (!proceed) {
            console.log(chalk.yellow('Pull cancelled.'));
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
                const content = await fetchFileContent(file.relativePath, debug);
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
        console.log(chalk.green(`Successfully pulled template: ${template}`));
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
        spinner.fail('Pull failed');
        if (err instanceof Error) {
            console.log(chalk.red(`\nError: ${err.message}`));
        }
        return false;
    }
}
