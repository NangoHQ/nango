import fs from 'node:fs';
import path from 'node:path';

import chalk from 'chalk';

import { checkExistingFiles, updateIndexFile } from '../utils/integrationFiles.js';
import { Spinner } from '../utils/spinner.js';
import { parseSecretKey, printDebug, resolveHostport } from '../utils.js';

import type { ScriptTypeLiteral } from '@nangohq/types';

const scriptTypeToFolder: Record<ScriptTypeLiteral, 'syncs' | 'actions' | 'on-events'> = {
    sync: 'syncs',
    action: 'actions',
    'on-event': 'on-events'
};

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
    const { fullPath, environmentName, integrationId, name, type, debug, force, autoConfirm, interactive = true } = options;
    const spinner = new Spinner({ interactive }).start(`Pulling ${environmentName}/${integrationId}/${name}`);

    try {
        await parseSecretKey(environmentName, debug);

        const url = new URL('/functions/pull', resolveHostport());
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
                console.log(chalk.gray(`Re-run with --type sync|action|on-event to disambiguate.`));
            }
            return false;
        }

        spinner.succeed(`Fetched function code`);

        const relativePath = `${integrationId}/${scriptTypeToFolder[body.type]}/${name}.ts`;
        const file = { relativePath, isScript: true };

        const { proceed, filesToSkip } = await checkExistingFiles(fullPath, [file], force, autoConfirm, debug);
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
