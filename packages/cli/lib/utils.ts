import axios, { AxiosError } from 'axios';
import fs from 'fs';
import os from 'os';
import npa from 'npm-package-arg';
import Module from 'node:module';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import semver from 'semver';
import { spawn } from 'child_process';
import promptly from 'promptly';
import chalk from 'chalk';
import * as dotenv from 'dotenv';
import { state } from './state.js';
import https from 'node:https';
import type { NangoConnection } from '@nangohq/types';
import { NANGO_VERSION } from './version.js';
import { cloudHost } from './constants.js';
import type { PackageJson } from 'type-fest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const require = Module.createRequire(import.meta.url);

dotenv.config();

export const NANGO_INTEGRATIONS_LOCATION = process.env['NANGO_INTEGRATIONS_LOCATION'] || './';
export const isCI = process.env['CI'];
const IGNORE_UPGRADE_FOR = 86400 * 1000;

let parsedHostport = process.env['NANGO_HOSTPORT'] || cloudHost;

if (parsedHostport.slice(-1) === '/') {
    parsedHostport = parsedHostport.slice(0, -1);
}

export const hostport = parsedHostport;

export function printDebug(message: string) {
    console.log(chalk.gray(message));
}

export function isLocallyInstalled(packageName: string, debug = false) {
    try {
        let dir = __dirname;
        const npxCacheDir = path.join(os.homedir(), '.npm/_npx');

        while (dir !== path.resolve(dir, '..')) {
            const packageJsonPath = path.resolve(dir, 'package.json');

            if (dir.startsWith(npxCacheDir)) {
                if (debug) {
                    printDebug(`Ignoring npx cache directory: ${dir} while trying to find if nango is locally installed.`);
                }
            } else if (fs.existsSync(packageJsonPath)) {
                const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as PackageJson;

                const dependencies = packageJson.dependencies || {};
                const devDependencies = packageJson.devDependencies || {};

                if (packageName in dependencies || packageName in devDependencies) {
                    return true;
                }
            }

            dir = path.resolve(dir, '..');
        }

        return false;
    } catch (err) {
        console.error(`Error checking if package is installed`, err);
        return false;
    }
}

export async function upgradeAction(debug = false) {
    const isRunViaNpx = process.argv.some((arg) => arg.includes('npx'));
    const locallyInstalled = isLocallyInstalled('nango', debug);

    if (debug) {
        printDebug(`Is run via npx: ${isRunViaNpx}. Is locally installed: ${locallyInstalled}`);
    }

    if (!locallyInstalled && isRunViaNpx) {
        console.log(
            chalk.red(`It appears you are running nango via npx. We recommend installing nango globally ("npm install nango -g") and running it directly.`)
        );
        process.exit(1);
    }

    if (process.env['NANGO_CLI_UPGRADE_MODE'] === 'ignore') {
        return;
    }

    const ignoreState = state.get('lastIgnoreUpgrade');
    if (typeof ignoreState === 'number' && ignoreState > Date.now() - IGNORE_UPGRADE_FOR) {
        if (debug) {
            printDebug(`Upgrade action skipped.`);
        }
        return;
    }

    try {
        const resolved = npa('nango');
        const version = NANGO_VERSION;
        if (debug) {
            printDebug(`Version ${version} of nango is installed.`);
        }
        const response = await http.get(`https://registry.npmjs.org/${resolved.name}`);
        const latestVersion = response.data['dist-tags'].latest;

        if (debug) {
            printDebug(`Latest version of ${resolved.name} is ${latestVersion}.`);
        }

        if (!semver.gt(latestVersion, version)) {
            return;
        }

        console.log(chalk.red(`A new version of ${resolved.name} is available: ${latestVersion}`));
        const cwd = process.cwd();

        const upgrade = process.env['NANGO_CLI_UPGRADE_MODE'] === 'auto' || (await promptly.confirm('Would you like to upgrade? (yes/no)'));

        if (!upgrade) {
            state.set('lastIgnoreUpgrade', Date.now());
            return;
        }

        console.log(chalk.yellow(`Upgrading ${resolved.name} to version ${latestVersion}...`));

        const packagePath = getPackagePath();
        const usePnpm = path.resolve(packagePath, '..').includes('.pnpm');

        let args: string[] = [];

        if (usePnpm) {
            if (locallyInstalled) {
                args = ['add', `nango@${latestVersion}`];
            } else {
                args = ['add', '-g', `nango@${latestVersion}`];
            }
        } else {
            if (locallyInstalled) {
                args = ['install', '--no-audit', '--save', `nango@${latestVersion}`];
            } else {
                args = ['install', '-g', '--no-audit', `nango@${latestVersion}`];
            }
        }

        if (debug) {
            printDebug(`Running npm ${args.join(' ')}`);
        }

        const child = spawn('npm', args, {
            cwd,
            detached: false,
            stdio: 'inherit'
        });
        await new Promise((resolve, reject) => {
            child.on('exit', (code) => {
                if (code !== 0) {
                    reject(new Error(`Upgrade process exited with code ${code}`));
                    return;
                }
                resolve(true);
                console.log(chalk.green(`Successfully upgraded ${resolved.name} to version ${latestVersion}`));
            });

            child.on('error', reject);
        });
    } catch (err: any) {
        console.error(`An error occurred: ${err.message}`);
    }
}

export async function getConnection(
    providerConfigKey: string,
    connectionId: string,
    setHeaders?: Record<string, string | boolean>,
    debug = false
): Promise<NangoConnection | undefined> {
    const url = process.env['NANGO_HOSTPORT'] + `/connection/${connectionId}`;
    const headers = enrichHeaders(setHeaders);
    if (debug) {
        printDebug(`getConnection endpoint to the URL: ${url} with headers: ${JSON.stringify(headers, null, 2)}`);
    }

    try {
        const res = await http.get(url, { params: { provider_config_key: providerConfigKey }, headers });
        return res.data;
    } catch (err) {
        console.log(`❌ ${err instanceof AxiosError ? JSON.stringify(err.response?.data.error) : JSON.stringify(err, ['message'])}`);
        return;
    }
}

export async function getConfig(providerConfigKey: string, debug = false) {
    const url = process.env['NANGO_HOSTPORT'] + `/config/${providerConfigKey}`;
    const headers = enrichHeaders();
    if (debug) {
        printDebug(`getConfig endpoint to the URL: ${url} with headers: ${JSON.stringify(headers, null, 2)}`);
    }
    return await http
        .get(url, { headers })
        .then((res) => {
            return res.data;
        })
        .catch((err: unknown) => {
            console.log(`❌ ${err instanceof AxiosError ? err.response?.data.error : JSON.stringify(err, ['message'])}`);
        });
}

export function enrichHeaders(headers: Record<string, string | number | boolean> = {}) {
    headers['Authorization'] = 'Bearer ' + process.env['NANGO_SECRET_KEY'];

    headers['Accept-Encoding'] = 'application/json';

    return headers;
}

const defaultHttpsAgent = new https.Agent({ keepAlive: true, rejectUnauthorized: false });
export const http = axios.create({
    httpsAgent: defaultHttpsAgent,
    headers: { 'User-Agent': getUserAgent() }
});

export function getUserAgent(): string {
    const clientVersion = NANGO_VERSION;
    const nodeVersion = process.versions.node;

    const osName = os.platform().replace(' ', '_');
    const osVersion = os.release().replace(' ', '_');
    return `nango-cli/${clientVersion} (${osName}/${osVersion}; node.js/${nodeVersion})`;
}

export function getNangoRootPath(debug = false): string {
    const packagePath = getPackagePath(debug);
    const rootPath = path.resolve(packagePath, '..');

    if (debug) {
        printDebug(`Found the nango cli root path at ${rootPath}`);
    }

    return rootPath;
}

function getPackagePath(debug = false): string {
    if (isCI || process.env['VITEST']) {
        return path.join(__dirname);
    }

    try {
        if (isLocallyInstalled('nango', debug)) {
            if (debug) {
                printDebug('Found locally installed nango');
            }
            return path.resolve(__dirname, '../package.json');
        }
        const packageMainPath = require.resolve('nango');
        const packagePath = path.dirname(packageMainPath);

        if (debug) {
            printDebug(`Found nango at ${packagePath}`);
        }

        return packagePath;
    } catch {
        throw new Error(
            'Could not find nango package. Please make sure it is installed in your project or installed globally. Reach out to us in the Slack community if you continue to have issues!'
        );
    }
}

export async function parseSecretKey(environment: string, debug = false): Promise<void> {
    if (process.env[`NANGO_SECRET_KEY_${environment.toUpperCase()}`]) {
        if (debug) {
            printDebug(`Environment is set to ${environment}, setting NANGO_SECRET_KEY to NANGO_SECRET_KEY_${environment.toUpperCase()}.`);
        }
        process.env['NANGO_SECRET_KEY'] = process.env[`NANGO_SECRET_KEY_${environment.toUpperCase()}`];
    }

    if (!process.env['NANGO_SECRET_KEY']) {
        console.log(chalk.red(`NANGO_SECRET_KEY_${environment.toUpperCase()} environment variable is not set. Please set it now`));
        try {
            const secretKey = await promptly.prompt('Secret Key: ');
            if (secretKey) {
                process.env['NANGO_SECRET_KEY'] = secretKey;
            } else {
                return;
            }
        } catch (err) {
            console.log('Error occurred while trying to prompt for secret key:', err);
            process.exit(1);
        }
    }
}

/**
 * Convert Windows backslash paths to slash paths.
 * From https://github.com/sindresorhus/slash/blob/main/index.js
 */
export function slash(path: string) {
    const isExtendedLengthPath = path.startsWith('\\\\?\\');
    if (isExtendedLengthPath) {
        return path;
    }
    return path.replace(/\\/g, '/');
}
