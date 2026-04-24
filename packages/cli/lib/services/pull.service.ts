import fs from 'node:fs';
import path from 'node:path';

import chalk from 'chalk';

import { checkExistingFiles, updateIndexFile } from '../utils/integrationFiles.js';
import { Err, Ok } from '../utils/result.js';
import { Spinner } from '../utils/spinner.js';
import { parseSecretKey, printDebug, resolveHostport } from '../utils.js';

import type { Result } from '@nangohq/types';

interface PullOptions {
    fullPath: string;
    integrationId: string;
    type: 'syncs' | 'actions' | 'on-events';
    name: string;
    environmentName?: string | undefined;
    debug: boolean;
    force: boolean;
    autoConfirm: boolean;
    interactive?: boolean;
}

function getFetchError(err: unknown): string {
    return err instanceof TypeError && err.cause && err.cause instanceof AggregateError && 'code' in err.cause
        ? (err.cause.code as string)
        : err instanceof Error
          ? err.message
          : 'Unknown error';
}

async function fetchSource(url: URL, headers: Record<string, string>): Promise<Result<string>> {
    try {
        const res = await fetch(url, { headers });
        if (!res.ok) {
            const body: unknown = await res.json();
            let message = 'Unknown error';
            let code = String(res.status);
            if (body !== null && typeof body === 'object' && 'error' in body) {
                const err = body.error;
                if (err !== null && typeof err === 'object') {
                    if ('message' in err && typeof err.message === 'string') message = err.message;
                    if ('code' in err && typeof err.code === 'string') code = err.code;
                }
            }
            return Err(new Error(`${message} ${chalk.gray(`(${code})`)}`));
        }
        return Ok(await res.text());
    } catch (err) {
        return Err(new Error(getFetchError(err)));
    }
}

export async function pullFunction(options: PullOptions): Promise<boolean> {
    const { fullPath, integrationId, type, name, environmentName, debug, force, autoConfirm, interactive = true } = options;
    const spinnerFactory = new Spinner({ interactive });

    const spinner = spinnerFactory.start(`Pulling ${integrationId}/${type}/${name}`);

    try {
        const hostport = resolveHostport();
        const url = new URL('/functions/pull', hostport);
        url.searchParams.set('integrationId', integrationId);
        url.searchParams.set('type', type);
        url.searchParams.set('name', name);

        const headers: Record<string, string> = {};

        if (environmentName) {
            await parseSecretKey(environmentName, debug);
            url.searchParams.set('env', environmentName);
            printDebug(`Fetching deployed function from ${url}`, debug);
            headers['authorization'] = `Bearer ${process.env['NANGO_SECRET_KEY']}`;
        } else {
            printDebug(`Fetching catalog function from ${url}`, debug);
            if (process.env['NANGO_SECRET_KEY']) {
                headers['authorization'] = `Bearer ${process.env['NANGO_SECRET_KEY']}`;
            }
        }

        const result = await fetchSource(url, headers);
        if (result.isErr()) {
            spinner.fail(`Failed to pull '${name}'`);
            console.log(chalk.red(`\n${result.error.message}`));
            return false;
        }

        spinner.succeed(`Fetched function code`);

        const relativePath = `${integrationId}/${type}/${name}.ts`;
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
        await fs.promises.writeFile(localPath, result.value, 'utf-8');

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
