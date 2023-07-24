import https from 'https';
import axios from 'axios';
import fs from 'fs';
import * as os from 'os';
import npa from 'npm-package-arg';
import Module from 'node:module';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import semver from 'semver';
import util from 'util';
import { exec, spawn } from 'child_process';
import promptly from 'promptly';
import chalk from 'chalk';
import type { NangoModel } from '@nangohq/shared';
import { cloudHost, stagingHost, nangoConfigFile } from '@nangohq/shared';
import * as dotenv from 'dotenv';
import { init, generate, tsc } from './sync.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const require = Module.createRequire(import.meta.url);

dotenv.config();

const execPromise = util.promisify(exec);

export const NANGO_INTEGRATIONS_NAME = 'nango-integrations';
export const NANGO_INTEGRATIONS_LOCATION = process.env['NANGO_INTEGRATIONS_LOCATION'] || './';

export const port = process.env['NANGO_PORT'] || '3003';
let parsedHostport = process.env['NANGO_HOSTPORT'] || cloudHost;

if (parsedHostport.slice(-1) === '/') {
    parsedHostport = parsedHostport.slice(0, -1);
}

export const hostport = parsedHostport;

export function setCloudHost() {
    process.env['NANGO_HOSTPORT'] = cloudHost;
}

export function setStagingHost() {
    process.env['NANGO_HOSTPORT'] = stagingHost;
}

export function printDebug(message: string) {
    console.log(chalk.gray(message));
}

export async function isGlobal(packageName: string) {
    try {
        const { stdout } = await execPromise(`npm list -g --depth=0 ${packageName}`);

        return stdout.includes(packageName);
    } catch (err) {
        console.error(`Error checking if package is global: ${err}`);
        return false;
    }
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
                const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

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
        console.error(`Error checking if package is installed: ${err}`);
        return false;
    }
}

export function checkEnvVars(optionalHostport?: string) {
    const hostport = optionalHostport || process.env['NANGO_HOSTPORT'] || `http://localhost:${port}`;

    if (hostport === `http://localhost:${port}`) {
        console.log(`Assuming you are running Nango on localhost:${port} because you did not set the NANGO_HOSTPORT env var.\n\n`);
    } else if (hostport === cloudHost || hostport === stagingHost) {
        if (!process.env['NANGO_SECRET_KEY']) {
            console.log(`Assuming you are using Nango Cloud but you are missing the NANGO_SECRET_KEY env var.`);
        } else if (hostport === cloudHost) {
            console.log(`Assuming you are using Nango Cloud (because you set the NANGO_HOSTPORT env var to https://api.nango.dev).`);
        } else if (hostport === stagingHost) {
            console.log(`Assuming you are using Nango Cloud (because you set the NANGO_HOSTPORT env var to https://api.staging.nango.dev).`);
        }
    } else {
        console.log(`Assuming you are self-hosting Nango (because you set the NANGO_HOSTPORT env var to ${hostport}).`);
    }
}

export async function verifyNecessaryFiles(autoConfirm: boolean, debug = false, checkDist = false) {
    const cwd = process.cwd();
    if (debug) {
        printDebug(`Current full working directory is read as: ${cwd}`);
    }
    const currentDirectorySplit = cwd.split(/[\/\\]/);
    const currentDirectory = currentDirectorySplit[currentDirectorySplit.length - 1];

    if (debug) {
        printDebug(`Current stripped directory is read as: ${currentDirectory}`);
    }

    if (currentDirectory !== NANGO_INTEGRATIONS_NAME) {
        console.log(chalk.red(`You must run this command in the ${NANGO_INTEGRATIONS_NAME} directory.`));
        process.exit(1);
    }

    if (!fs.existsSync(`./${nangoConfigFile}`)) {
        const install = autoConfirm
            ? true
            : await promptly.confirm(`No ${nangoConfigFile} file was found. Would you like to create some default integrations and build them? (yes/no)`);

        if (install) {
            if (debug) {
                printDebug(`Running init, generate, and tsc to create ${nangoConfigFile} file, generate the integration files and then compile them.`);
            }
            init(debug);
            await generate(debug);
            tsc(debug);
        } else {
            console.log(chalk.red(`Exiting...`));
            process.exit(1);
        }
    } else {
        if (debug) {
            printDebug(`Found ${nangoConfigFile} file successfully.`);
        }
    }

    if (!checkDist) {
        return;
    }

    const distDir = './dist';

    if (!fs.existsSync(distDir)) {
        if (debug) {
            printDebug("Dist directory doesn't exist.");
        }
        const createDist = autoConfirm
            ? true
            : await promptly.confirm(`No dist directory was found. Would you like to create it and create default integrations? (yes/no)`);

        if (createDist) {
            if (debug) {
                printDebug(`Creating the dist directory and generating the default integration files.`);
            }
            fs.mkdirSync(distDir);
            await generate(debug);
            await tsc(debug);
        }
    } else {
        const files = fs.readdirSync(distDir);
        if (files.length === 0) {
            if (debug) {
                printDebug(`Dist directory exists but is empty.`);
            }
            const compile = autoConfirm
                ? true
                : await promptly.confirm(`The dist directory is empty. Would you like to generate the default integrations? (yes/no)`);

            if (compile) {
                if (debug) {
                    printDebug(`Generating the default integration files.`);
                }
                await tsc(debug);
            }
        }
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
    try {
        const resolved = npa('nango');
        const { version } = JSON.parse(fs.readFileSync(path.resolve(getNangoRootPath(debug) as string, 'package.json'), 'utf8'));
        if (debug) {
            printDebug(`Version ${version} of nango is installed.`);
        }
        const response = await axios.get(`https://registry.npmjs.org/${resolved.name}`);
        const latestVersion = response.data['dist-tags'].latest;

        if (debug) {
            printDebug(`Latest version of ${resolved.name} is ${latestVersion}.`);
        }

        if (semver.gt(latestVersion, version)) {
            console.log(chalk.red(`A new version of ${resolved.name} is available: ${latestVersion}`));
            const cwd = process.cwd();

            const upgrade = process.env['NANGO_CLI_UPGRADE_MODE'] === 'auto' || (await promptly.confirm('Would you like to upgrade? (yes/no)'));

            if (upgrade) {
                console.log(chalk.yellow(`Upgrading ${resolved.name} to version ${latestVersion}...`));

                const args = locallyInstalled
                    ? ['install', '--no-audit', '--save', `nango@${latestVersion}`]
                    : ['install', '-g', '--no-audit', `nango@${latestVersion}`];

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
            }
        }
    } catch (error: any) {
        console.error(`An error occurred: ${error.message}`);
    }
}

export async function getConnection(providerConfigKey: string, connectionId: string, setHeaders?: Record<string, string | boolean>, debug = false) {
    const url = process.env['NANGO_HOSTPORT'] + `/connection/${connectionId}`;
    const headers = enrichHeaders(setHeaders);
    if (debug) {
        printDebug(`getConnection endpoint to the URL: ${url} with headers: ${JSON.stringify(headers, null, 2)}`);
    }
    return await axios
        .get(url, { params: { provider_config_key: providerConfigKey }, headers, httpsAgent: httpsAgent() })
        .then((res) => {
            return res.data;
        })
        .catch((err) => {
            console.log(`❌ ${err.response?.data.error || JSON.stringify(err)}`);
        });
}

export async function getSyncNamesWithProvider(debug = false) {
    const url = process.env['NANGO_HOSTPORT'] + `/sync/names`;
    const headers = enrichHeaders();
    if (debug) {
        printDebug(`getConnection endpoint to the URL: ${url} with headers: ${JSON.stringify(headers, null, 2)}`);
    }
    return await axios
        .get(url, { headers, httpsAgent: httpsAgent() })
        .then((res) => {
            return res.data;
        })
        .catch((err) => {
            console.log(`❌ ${err.response?.data.error || JSON.stringify(err)}`);
        });
}

export async function getProviderBySyncName(params: Record<string, string>, debug = false) {
    const url = process.env['NANGO_HOSTPORT'] + `/sync/provider`;
    const headers = enrichHeaders();
    if (debug) {
        printDebug(
            `getProviderBySyncName endpoint to the URL: ${url} with headers: ${JSON.stringify(headers, null, 2)} with params: ${JSON.stringify(
                params,
                null,
                2
            )}}`
        );
    }
    return await axios
        .get(url, { params, headers, httpsAgent: httpsAgent() })
        .then((res) => {
            return res.data;
        })
        .catch((err) => {
            console.log(`❌ ${err.response?.data.error || JSON.stringify(err)}`);
        });
}

export function enrichHeaders(headers: Record<string, string | number | boolean> = {}) {
    headers['Authorization'] = 'Bearer ' + process.env['NANGO_SECRET_KEY'];

    headers['Accept-Encoding'] = 'application/json';

    return headers;
}

export function httpsAgent() {
    return new https.Agent({
        rejectUnauthorized: false
    });
}

export function getFieldType(rawField: string | NangoModel, debug = false): string {
    if (typeof rawField === 'string') {
        let field = rawField;
        let hasNull = false;
        let hasUndefined = false;
        let tsType = '';
        if (field.indexOf('null') !== -1) {
            field = field.replace(/\s*\|\s*null\s*/g, '');
            hasNull = true;
        }

        if (field === 'undefined') {
            if (debug) {
                printDebug(`Field is defined undefined which isn't recommended.`);
            }
            return 'undefined';
        }

        if (field.indexOf('undefined') !== -1) {
            field = field.replace(/\s*\|\s*undefined\s*/g, '');
            hasUndefined = true;
        }

        switch (field) {
            case 'boolean':
            case 'bool':
                tsType = 'boolean';
                break;
            case 'string':
                tsType = 'string';
                break;
            case 'char':
                tsType = 'string';
                break;
            case 'integer':
            case 'int':
            case 'number':
                tsType = 'number';
                break;
            case 'date':
                tsType = 'Date';
                break;
            default:
                tsType = field;
        }

        if (hasNull) {
            tsType = `${tsType} | null`;
        }

        if (hasUndefined) {
            tsType = `${tsType} | undefined`;
        }
        return tsType;
    } else {
        try {
            const nestedFields = Object.keys(rawField)
                .map((fieldName: string) => `  ${fieldName}: ${getFieldType(rawField[fieldName] as string | NangoModel)};`)
                .join('\n');
            return `{\n${nestedFields}\n}`;
        } catch (_) {
            console.log(chalk.red(`Failed to parse field ${rawField} so just returning it back as a string`));
            return String(rawField);
        }
    }
}

export function buildInterfaces(models: NangoModel, debug = false): (string | undefined)[] {
    const interfaceDefinitions = Object.keys(models).map((modelName: string) => {
        const fields = models[modelName] as NangoModel;
        const singularModelName = modelName.charAt(modelName.length - 1) === 's' ? modelName.slice(0, -1) : modelName;
        const interfaceName = `${singularModelName.charAt(0).toUpperCase()}${singularModelName.slice(1)}`;
        let extendsClause = '';
        const fieldDefinitions = Object.keys(fields)
            .filter((fieldName: string) => {
                if (fieldName === '__extends') {
                    const fieldModel = fields[fieldName] as unknown as string;
                    const multipleExtends = fieldModel.split(',').map((e) => e.trim());
                    extendsClause = ` extends ${multipleExtends.join(', ')}`;
                    return false;
                }
                return true;
            })
            .map((fieldName: string) => {
                const fieldModel = fields[fieldName] as string | NangoModel;
                const fieldType = getFieldType(fieldModel, debug);
                return `  ${fieldName}: ${fieldType};`;
            })
            .join('\n');
        const interfaceDefinition = `export interface ${interfaceName}${extendsClause} {\n${fieldDefinitions}\n}\n`;
        return interfaceDefinition;
    });

    return interfaceDefinitions;
}

export function getNangoRootPath(debug = false) {
    const packagePath = getPackagePath(debug);
    if (!packagePath) {
        if (debug) {
            printDebug('Could not find nango cli root path locally');
        }
        return null;
    }

    if (debug) {
        printDebug(`Found the nango cli root path at ${path.resolve(packagePath, '..')}`);
    }

    return path.resolve(packagePath, '..');
}

function getPackagePath(debug = false) {
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
    } catch (e) {
        throw new Error(
            'Could not find nango package. Please make sure it is installed in your project or installed globally. Reach out to us in the Slack community if you continue to have issues!'
        );
    }
}
