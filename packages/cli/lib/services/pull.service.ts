import fs from 'node:fs';
import path from 'node:path';

import chalk from 'chalk';

import { cliFetch } from '../tls.js';
import { parseSecretKey, printDebug, resolveHostport } from '../utils.js';
import { checkExistingFiles, updateIndexFile } from '../utils/integrationFiles.js';
import { Spinner } from '../utils/spinner.js';

import type { ScriptTypeLiteral } from '@nangohq/types';

const scriptTypeToFolder: Record<ScriptTypeLiteral, 'syncs' | 'actions' | 'on-events'> = {
    sync: 'syncs',
    action: 'actions',
    'on-event': 'on-events'
};

export function isUnsafeName(segment: string): boolean {
    if (!segment) return true;
    if (segment === '.' || segment === '..') return true;
    if (segment.includes('/') || segment.includes('\\')) return true;
    return false;
}

interface PullOptions {
    fullPath: string;
    environmentName: string;
    integrationId: string;
    name: string;
    type?: ScriptTypeLiteral | undefined;
    debug: boolean;
    force: boolean;
    autoConfirm: boolean;
    interactive?: boolean;
}

export async function pullFunction(options: PullOptions): Promise<boolean> {
    const { environmentName, integrationId, name } = options;
    return await pullCode({
        ...options,
        label: `${environmentName}/${integrationId}/${name}`,
        endpoint: `/integrations/${encodeURIComponent(integrationId)}/functions/${encodeURIComponent(name)}/code`
    });
}

export async function pullFromCatalog(options: PullOptions): Promise<boolean> {
    const { integrationId, name } = options;
    return await pullCode({
        ...options,
        label: `catalog/${integrationId}/${name}`,
        endpoint: `/providers/${encodeURIComponent(integrationId)}/templates/${encodeURIComponent(name)}/code`,
        // Servers released before the catalog endpoint answer with a bare 404.
        missingRouteMessage: "This Nango instance doesn't support pulling from the catalog"
    });
}

async function pullCode(
    options: PullOptions & {
        label: string;
        endpoint: string;
        missingRouteMessage?: string;
    }
): Promise<boolean> {
    const {
        fullPath,
        environmentName,
        integrationId,
        name,
        type,
        debug,
        force,
        autoConfirm,
        interactive = true,
        label,
        endpoint,
        missingRouteMessage
    } = options;

    if (isUnsafeName(integrationId)) {
        console.log(chalk.red(`Invalid integration name: '${integrationId}'.`));
        return false;
    }

    if (isUnsafeName(name)) {
        console.log(chalk.red(`Invalid function name: '${name}'.`));
        return false;
    }

    const spinner = new Spinner({ interactive }).start(`Pulling ${label}`);

    try {
        await parseSecretKey(environmentName, debug);

        const url = new URL(endpoint, resolveHostport(environmentName));
        if (type) {
            url.searchParams.set('type', type);
        }
        printDebug(`Fetching function code from ${url.href}`, debug);

        const res = await cliFetch(url, { headers: { authorization: `Bearer ${process.env['NANGO_SECRET_KEY']}` } });
        const body = (await res.json().catch(() => null)) as { type: ScriptTypeLiteral; code: string } | { error: { code: string; message?: string } } | null;

        if (res.status === 404 && !body && missingRouteMessage) {
            spinner.fail(`Failed to pull '${name}'`);
            console.log(chalk.red(`\n${missingRouteMessage}`));
            return false;
        }

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
