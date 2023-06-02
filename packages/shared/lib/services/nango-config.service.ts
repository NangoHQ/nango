import fs from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
// @ts-ignore
import translateCron from 'friendly-node-cron';
import type { NangoConfig, SimplifiedNangoIntegration, NangoSyncConfig, NangoSyncModel } from '../integrations/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const SYNC_FILE_EXTENSION = 'js';

export function loadNangoConfig(loadLocation?: string): NangoConfig | null {
    const location = loadLocation || path.resolve(__dirname, '../nango-integrations/nango.yaml');

    try {
        const yamlConfig = fs.readFileSync(location, 'utf8');
        const configData: NangoConfig = yaml.load(yamlConfig) as unknown as NangoConfig;

        return configData;
    } catch (error) {
        console.log(`no nango.yaml config found at ${location}`);
    }

    return null;
}

export function loadSimplifiedConfig(loadLocation?: string): SimplifiedNangoIntegration[] | null {
    try {
        const configData: NangoConfig = loadNangoConfig(loadLocation) as NangoConfig;

        if (!configData) {
            return null;
        }
        const config = convertConfigObject(configData);

        return config;
    } catch (error) {
        console.log('no nango.yaml config found');
    }

    return null;
}

export function checkForIntegrationFile(syncName: string) {
    const nangoIntegrationsDirPath = path.resolve(__dirname, '../nango-integrations');
    const distDirPath = path.resolve(nangoIntegrationsDirPath, 'dist');

    if (!fs.existsSync(nangoIntegrationsDirPath)) {
        return {
            result: false,
            path: nangoIntegrationsDirPath
        };
    }

    if (!fs.existsSync(distDirPath)) {
        return {
            result: false,
            path: distDirPath
        };
    }

    const filePath = path.resolve(distDirPath, `${syncName}.${SYNC_FILE_EXTENSION}`);
    let realPath;
    try {
        realPath = fs.realpathSync(filePath);
    } catch (err) {
        realPath = filePath;
    }

    return {
        result: fs.existsSync(realPath),
        path: realPath
    };
}

export async function getIntegrationClass(syncName: string, setIntegrationPath?: string) {
    try {
        const filePath = setIntegrationPath || path.resolve(__dirname, `../nango-integrations/dist/${syncName}.${SYNC_FILE_EXTENSION}`);
        const realPath = fs.realpathSync(filePath) + `?v=${Math.random().toString(36).substring(3)}`;
        const { default: integrationCode } = await import(realPath);
        const integrationClass = new integrationCode();

        return integrationClass;
    } catch (error) {
        console.error(error);
    }

    return null;
}

export function convertConfigObject(config: NangoConfig): SimplifiedNangoIntegration[] {
    const output = [];

    for (const providerConfigKey in config.integrations) {
        const syncs = [];
        const integration = config.integrations[providerConfigKey];
        for (const syncName in integration) {
            const sync: NangoSyncConfig = integration[syncName] as NangoSyncConfig;
            const models: NangoSyncModel[] = [];
            sync.returns.forEach((model) => {
                const modelFields = [];
                const modelData = config.models[model] || config.models[`${model.slice(0, -1)}`];
                for (const fieldName in modelData) {
                    const fieldType = modelData[fieldName];
                    if (typeof fieldType === 'object') {
                        for (const subFieldName in fieldType) {
                            const subFieldType = fieldType[subFieldName];
                            modelFields.push({ name: `${fieldName}.${subFieldName}`, type: subFieldType as string });
                        }
                    } else {
                        modelFields.push({ name: fieldName, type: fieldType as string });
                    }
                }
                models.push({ name: model, fields: [modelFields] });
            });
            const { humanReadable } = getInterval(sync.runs);
            syncs.push({ name: syncName, runs: sync.runs, intervalExpression: humanReadable, returns: sync.returns, models });
        }
        output.push({ providerConfigKey, syncs });
    }

    return output;
}

export function getCronExpression(runs: string): string {
    if (runs === 'every half hour') {
        return '*/30 * * * *';
    }

    if (runs === 'every quarter hour') {
        return '*/15 * * * *';
    }

    if (runs === 'every hour') {
        return '0 * * * *';
    }

    const cron = translateCron(runs);

    return cron.slice(2);
}

export function getInterval(runs: string): { interval: string; offset: number; humanReadable: string } {
    const now = new Date();
    const milliseconds = now.getMinutes() * 60000 + now.getSeconds() * 1000 + now.getMilliseconds();

    if (runs === 'every half hour') {
        return { interval: '30m', offset: milliseconds, humanReadable: `30m ${milliseconds} offset` };
    }

    if (runs === 'every quarter hour') {
        return { interval: '15m', offset: milliseconds, humanReadable: `15m ${milliseconds} offset` };
    }

    if (runs === 'every hour') {
        return { interval: '1h', offset: milliseconds, humanReadable: `1h ${milliseconds} offset` };
    }

    const interval = runs.replace('every ', '');

    return { interval, offset: milliseconds, humanReadable: `${interval} ${milliseconds} offset` };
}
