import https from 'https';
import axios from 'axios';
import fs from 'fs';
import npa from 'npm-package-arg';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import semver from 'semver';
import { spawn } from 'child_process';
import promptly from 'promptly';
import chalk from 'chalk';
import type { NangoModel } from '@nangohq/shared';
import { cloudHost, stagingHost } from '@nangohq/shared';
import * as dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

export const NANGO_INTEGRATIONS_LOCATION = process.env['NANGO_INTEGRATIONS_LOCATION'] || './nango-integrations';

let parsedHostport = process.env['NANGO_HOSTPORT'] || 'http://localhost:3003';

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

export function checkEnvVars(optionalHostport?: string) {
    const hostport = optionalHostport || process.env['NANGO_HOSTPORT'] || 'http://localhost:3003';
    if (hostport === 'http://localhost:3003') {
        console.log(`Assuming you are running Nango on localhost:3003 because you did not set the NANGO_HOSTPORT env var.\n\n`);
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

export async function upgradeAction() {
    try {
        const resolved = npa('nango');
        const { version } = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));
        const response = await axios.get(`https://registry.npmjs.org/${resolved.name}`);
        const latestVersion = response.data['dist-tags'].latest;

        if (semver.gt(latestVersion, version)) {
            console.log(chalk.red(`A new version of ${resolved.name} is available: ${latestVersion}`));
            const cwd = process.cwd();

            const upgrade = await promptly.confirm('Would you like to upgrade? (yes/no)');

            if (upgrade) {
                console.log(chalk.yellow(`Upgrading ${resolved.name} to version ${latestVersion}...`));
                const child = spawn('npm', ['install', '--no-audit', `nango@${latestVersion}`], {
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

export async function getConnection(providerConfigKey: string, connectionId: string, headers?: Record<string, string | boolean>) {
    checkEnvVars();
    const url = hostport + `/connection/${connectionId}`;
    return await axios
        .get(url, { params: { provider_config_key: providerConfigKey }, headers: enrichHeaders(headers), httpsAgent: httpsAgent() })
        .then((res) => {
            return res.data;
        })
        .catch((err) => {
            console.log(`❌ ${err.response?.data.error || JSON.stringify(err)}`);
        });
}

export function enrichHeaders(headers: Record<string, string | number | boolean> = {}) {
    if ((process.env['NANGO_HOSTPORT'] === cloudHost || process.env['NANGO_HOSTPORT'] === stagingHost) && process.env['NANGO_SECRET_KEY']) {
        // For Nango Cloud (unified)
        headers['Authorization'] = 'Bearer ' + process.env['NANGO_SECRET_KEY'];
    } else if (process.env['NANGO_SECRET_KEY']) {
        // For Nango OSS
        headers['Authorization'] = 'Basic ' + Buffer.from(process.env['NANGO_SECRET_KEY'] + ':').toString('base64');
    }

    headers['Accept-Encoding'] = 'application/json';

    return headers;
}

export function httpsAgent() {
    return new https.Agent({
        rejectUnauthorized: false
    });
}

export function getFieldType(rawField: string | NangoModel): string {
    if (typeof rawField === 'string') {
        let field = rawField;
        let hasNull = false;
        let hasUndefined = false;
        let tsType = '';
        if (field.indexOf('null') !== -1) {
            field = field.replace(/\s*\|\s*null\s*/g, '');
            hasNull = true;
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
        }

        if (hasNull) {
            tsType = `${tsType} | null`;
        }

        if (hasUndefined) {
            tsType = `${tsType} | undefined`;
        }
        return tsType;
    } else {
        const nestedFields = Object.keys(rawField)
            .map((fieldName: string) => `  ${fieldName}: ${getFieldType(rawField[fieldName] as string | NangoModel)};`)
            .join('\n');
        return `{\n${nestedFields}\n}`;
    }
}

export function buildInterfaces(models: NangoModel): (string | undefined)[] {
    const interfaceDefinitions = Object.keys(models).map((modelName: string) => {
        if (modelName.charAt(0) === '_') {
            return;
        }
        const fields = models[modelName] as NangoModel;
        const singularModelName = modelName.charAt(modelName.length - 1) === 's' ? modelName.slice(0, -1) : modelName;
        const interfaceName = `${singularModelName.charAt(0).toUpperCase()}${singularModelName.slice(1)}`;
        const fieldDefinitions = Object.keys(fields)
            .map((fieldName: string) => {
                const fieldModel = fields[fieldName] as string | NangoModel;
                const fieldType = getFieldType(fieldModel);
                return `  ${fieldName}: ${fieldType};`;
            })
            .join('\n');
        const interfaceDefinition = `export interface ${interfaceName} {\n${fieldDefinitions}\n}\n`;
        return interfaceDefinition;
    });

    return interfaceDefinitions;
}
