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
    integrationId: string;
    name: string;
    type?: ScriptTypeLiteral | undefined;
    debug: boolean;
    force: boolean;
    autoConfirm: boolean;
    interactive?: boolean;
}

/** Sends the request, or returns why it could not be sent. */
type FetchCode = (pathAndQuery: string) => Promise<Response | { failure: string }>;

const SECRET_KEY_PREFIX = 'NANGO_SECRET_KEY_';

export async function pullFunction(options: PullOptions & { environmentName: string }): Promise<boolean> {
    const { environmentName, integrationId, name, debug } = options;
    return await pullCode({
        ...options,
        label: `${environmentName}/${integrationId}/${name}`,
        endpoint: `/integrations/${encodeURIComponent(integrationId)}/functions/${encodeURIComponent(name)}/code`,
        fetchCode: async (pathAndQuery) => {
            await parseSecretKey(environmentName, debug);
            return await fetchWithSecretKey(new URL(pathAndQuery, resolveHostport(environmentName)), process.env['NANGO_SECRET_KEY']!, debug);
        }
    });
}

/**
 * The catalog is the same in every environment, so any valid secret key works.
 * Keys are tried one after the other until one is accepted.
 */
export async function pullFromCatalog(options: PullOptions): Promise<boolean> {
    const { integrationId, name, debug } = options;
    return await pullCode({
        ...options,
        label: `catalog/${integrationId}/${name}`,
        endpoint: `/providers/${encodeURIComponent(integrationId)}/templates/${encodeURIComponent(name)}/code`,
        // Servers released before the catalog endpoint answer with a bare 404.
        missingRouteMessage: "This Nango instance doesn't support pulling from the catalog",
        fetchCode: async (pathAndQuery) => {
            for (const { environmentName, secretKey } of findSecretKeys()) {
                const res = await fetchWithSecretKey(new URL(pathAndQuery, resolveHostport(environmentName)), secretKey, debug);
                if (res.status !== 401 && res.status !== 403) {
                    return res;
                }
                printDebug(`Secret key for '${environmentName ?? 'default'}' was rejected, trying the next one`, debug);
            }
            return { failure: 'No valid Nango secret key found. Set NANGO_SECRET_KEY in your .env file.' };
        }
    });
}

function findSecretKeys(): { environmentName: string | undefined; secretKey: string }[] {
    const keys: { environmentName: string | undefined; secretKey: string }[] = [];
    if (process.env['NANGO_SECRET_KEY']) {
        keys.push({ environmentName: undefined, secretKey: process.env['NANGO_SECRET_KEY'] });
    }
    for (const [variable, value] of Object.entries(process.env)) {
        if (variable.startsWith(SECRET_KEY_PREFIX) && value) {
            keys.push({ environmentName: variable.slice(SECRET_KEY_PREFIX.length).toLowerCase(), secretKey: value });
        }
    }
    return keys;
}

async function fetchWithSecretKey(url: URL, secretKey: string, debug: boolean): Promise<Response> {
    printDebug(`Fetching function code from ${url.href}`, debug);
    return await cliFetch(url, { headers: { authorization: `Bearer ${secretKey}` } });
}

async function pullCode(
    options: PullOptions & {
        label: string;
        endpoint: string;
        fetchCode: FetchCode;
        missingRouteMessage?: string;
    }
): Promise<boolean> {
    const { fullPath, integrationId, name, type, debug, force, autoConfirm, interactive = true, label, endpoint, fetchCode, missingRouteMessage } = options;

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
        const res = await fetchCode(type ? `${endpoint}?${new URLSearchParams({ type }).toString()}` : endpoint);
        if ('failure' in res) {
            spinner.fail(`Failed to pull '${name}'`);
            console.log(chalk.red(`\n${res.failure}`));
            return false;
        }

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
