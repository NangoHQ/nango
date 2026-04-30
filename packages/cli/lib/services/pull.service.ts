import fs from 'node:fs';
import path from 'node:path';

import chalk from 'chalk';

import { GitHubNotFoundError, collectDependencies, fetchFileContent } from '../utils/githubTemplates.js';
import { checkExistingFiles, updateIndexFile } from '../utils/integrationFiles.js';
import { Spinner } from '../utils/spinner.js';
import { parseSecretKey, printDebug, resolveHostport } from '../utils.js';

import type { ScriptTypeLiteral } from '@nangohq/types';

const scriptTypeToFolder: Record<ScriptTypeLiteral, 'syncs' | 'actions' | 'on-events'> = {
    sync: 'syncs',
    action: 'actions',
    'on-event': 'on-events'
};

const folderToScriptType: Record<'syncs' | 'actions' | 'on-events', ScriptTypeLiteral> = {
    syncs: 'sync',
    actions: 'action',
    'on-events': 'on-event'
};

export function isValidName(segment: string): boolean {
    return /^[a-zA-Z0-9_-]+$/.test(segment);
}

interface PullOptionsBase {
    fullPath: string;
    integrationId: string;
    name: string;
    type?: ScriptTypeLiteral | undefined;
    debug: boolean;
    force: boolean;
    autoConfirm: boolean;
    interactive?: boolean;
}

interface PullFunctionOptions extends PullOptionsBase {
    environmentName: string;
}

type PullCatalogOptions = PullOptionsBase;

export async function pullFunction(options: PullFunctionOptions): Promise<boolean> {
    const { fullPath, environmentName, integrationId, name, type, debug, force, autoConfirm, interactive = true } = options;

    if (!isValidName(integrationId)) {
        console.log(chalk.red(`Invalid integration name: '${integrationId}'.`));
        return false;
    }

    if (!isValidName(name)) {
        console.log(chalk.red(`Invalid function name: '${name}'.`));
        return false;
    }

    const spinner = new Spinner({ interactive }).start(`Pulling ${environmentName}/${integrationId}/${name}`);

    try {
        await parseSecretKey(environmentName, debug);

        const url = new URL('/functions/pull', resolveHostport(environmentName));
        url.searchParams.set('integrationId', integrationId);
        url.searchParams.set('name', name);
        url.searchParams.set('env', environmentName);
        if (type) {
            url.searchParams.set('type', type);
        }
        printDebug(`Fetching deployed function from ${url}`, debug);

        const res = await fetch(url, { headers: { authorization: `Bearer ${process.env['NANGO_SECRET_KEY']}` } });
        const body = (await res.json().catch(() => null)) as { type: ScriptTypeLiteral; code: string } | { error: { code: string; message?: string } } | null;

        if (!res.ok || !body || 'error' in body) {
            const errCode = body && 'error' in body ? body.error.code : String(res.status);
            const errMessage = body && 'error' in body ? (body.error.message ?? 'Unknown error') : 'Unknown error';
            spinner.fail(`Failed to pull '${name}'`);
            console.log(chalk.red(`\n${errMessage} ${chalk.gray(`(${errCode})`)}`));
            if (errCode === 'ambiguous_function') {
                console.log(chalk.gray(`Re-run with --sync, --action, or --on-event to disambiguate.`));
            }
            return false;
        }

        const folder = scriptTypeToFolder[body.type];
        if (!folder) {
            spinner.fail(`Failed to pull '${name}'`);
            console.log(chalk.red(`\nUnexpected function type returned by server: ${String(body.type)}`));
            return false;
        }

        spinner.succeed(`Fetched function code`);

        const relativePath = `${integrationId}/${folder}/${name}.ts`;
        const file = { relativePath, isScript: true };

        const { proceed, filesToSkip } = await checkExistingFiles(fullPath, [file], force, autoConfirm, debug, interactive);
        if (!proceed) {
            console.log(chalk.yellow('Pull cancelled.'));
            return false;
        }

        if (filesToSkip.has(relativePath)) {
            console.log(chalk.yellow(`Skipped: ${relativePath}`));
            return true;
        }

        const localPath = path.join(fullPath, relativePath);
        await fs.promises.mkdir(path.dirname(localPath), { recursive: true });
        await fs.promises.writeFile(localPath, body.code, 'utf-8');

        await updateIndexFile(fullPath, [file], debug);

        console.log('');
        console.log(chalk.green(`Successfully pulled: ${relativePath}`));

        return true;
    } catch (err) {
        spinner.fail('Pull failed');
        if (err instanceof Error) {
            console.log(chalk.red(`\nError: ${err.message}`));
        }
        return false;
    }
}

export async function pullFromCatalog(options: PullCatalogOptions): Promise<boolean> {
    const { fullPath, integrationId, name, type, debug, force, autoConfirm, interactive = true } = options;

    if (!isValidName(integrationId)) {
        console.log(chalk.red(`Invalid integration name: '${integrationId}'.`));
        return false;
    }

    if (!isValidName(name)) {
        console.log(chalk.red(`Invalid function name: '${name}'.`));
        return false;
    }

    const spinner = new Spinner({ interactive }).start(`Pulling catalog/${integrationId}/${name}`);

    try {
        const contentCache = new Map<string, string>();

        const foldersToProbe: ('syncs' | 'actions' | 'on-events')[] = type ? [scriptTypeToFolder[type]] : ['syncs', 'actions', 'on-events'];

        const probeResults = await Promise.allSettled(
            foldersToProbe.map(async (folder) => {
                const candidatePath = `${integrationId}/${folder}/${name}.ts`;
                const content = await fetchFileContent(candidatePath, debug);
                return { folder, candidatePath, content };
            })
        );

        const matches: { folder: 'syncs' | 'actions' | 'on-events'; candidatePath: string; content: string }[] = [];
        for (const result of probeResults) {
            if (result.status === 'fulfilled') {
                matches.push(result.value);
                contentCache.set(result.value.candidatePath, result.value.content);
            } else if (!(result.reason instanceof GitHubNotFoundError)) {
                throw result.reason;
            }
        }

        if (matches.length === 0) {
            spinner.fail(`Failed to pull '${name}'`);
            console.log(chalk.red(`\nFunction '${name}' not found in catalog for integration '${integrationId}'.`));
            console.log(chalk.gray(`Browse available templates at https://github.com/NangoHQ/integration-templates`));
            return false;
        }

        if (matches.length > 1) {
            const matchedTypes = matches.map((m) => folderToScriptType[m.folder]).join(', ');
            spinner.fail(`Failed to pull '${name}'`);
            console.log(chalk.red(`\nMultiple functions named '${name}' exist for '${integrationId}' (${matchedTypes}).`));
            console.log(chalk.gray(`Re-run with --sync, --action, or --on-event to disambiguate.`));
            return false;
        }

        const match = matches[0]!;
        spinner.succeed(`Fetched function code`);

        const initialFiles: { relativePath: string; isScript: boolean }[] = [{ relativePath: match.candidatePath, isScript: true }];

        const mdPath = `${integrationId}/${match.folder}/${name}.md`;
        try {
            const mdContent = await fetchFileContent(mdPath, debug);
            contentCache.set(mdPath, mdContent);
            initialFiles.push({ relativePath: mdPath, isScript: false });
            printDebug(`Found companion documentation: ${mdPath}`, debug);
        } catch (err) {
            if (!(err instanceof GitHubNotFoundError)) {
                throw err;
            }
            printDebug(`No companion documentation found for ${mdPath}`, debug);
        }

        const files = await collectDependencies(initialFiles, integrationId, debug, contentCache);

        const { proceed, filesToSkip } = await checkExistingFiles(fullPath, files, force, autoConfirm, debug, interactive);
        if (!proceed) {
            console.log(chalk.yellow('Pull cancelled.'));
            return false;
        }

        let writtenCount = 0;
        for (const file of files) {
            if (filesToSkip.has(file.relativePath)) {
                continue;
            }

            const content = contentCache.has(file.relativePath) ? contentCache.get(file.relativePath)! : await fetchFileContent(file.relativePath, debug);

            const localPath = path.join(fullPath, file.relativePath);
            await fs.promises.mkdir(path.dirname(localPath), { recursive: true });
            await fs.promises.writeFile(localPath, content, 'utf-8');
            writtenCount++;
        }

        await updateIndexFile(
            fullPath,
            files.filter((f) => !filesToSkip.has(f.relativePath)),
            debug
        );

        console.log('');
        console.log(chalk.green(`Successfully pulled '${name}' from catalog (${writtenCount} file${writtenCount === 1 ? '' : 's'})`));

        return true;
    } catch (err) {
        spinner.fail('Pull failed');
        if (err instanceof Error) {
            console.log(chalk.red(`\nError: ${err.message}`));
        }
        return false;
    }
}
