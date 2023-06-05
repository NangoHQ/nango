import fs from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import type { NangoConfig, SimplifiedNangoIntegration, NangoSyncConfig, NangoSyncModel } from '../integrations/index.js';
import ms from 'ms';

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
        console.log(error);
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

            syncs.push({ name: syncName, runs: sync.runs, intervals: getIntervals(sync.runs, new Date()), returns: sync.returns, models });
        }
        output.push({ providerConfigKey, syncs });
    }

    return output;
}

export function getOffset(interval: string, date: Date): number {
    const intervalMilliseconds = ms(interval);

    const nowMilliseconds = date.getMinutes() * 60 * 1000 + date.getSeconds() * 1000 + date.getMilliseconds();

    const offset = nowMilliseconds % intervalMilliseconds;

    return offset;
}

/**
 * Get Interval
 * @desc get the interval based on the runs property in the yaml. The offset
 * should be the amount of time that the interval should be offset by.
 * If the time is 1536 and the interval is 30m then the next time the sync should run is 1606
 * and then 1636 etc. The offset should be based on the interval and should never be
 * greater than the interval
 */
export function getInterval(runs: string, date: Date): { interval: string; offset: number } {
    if (runs === 'every half hour') {
        return { interval: '30m', offset: getOffset('30m', date) };
    }

    if (runs === 'every quarter hour') {
        return { interval: '15m', offset: getOffset('15m', date) };
    }

    if (runs === 'every hour') {
        return { interval: '1h', offset: getOffset('1h', date) };
    }

    const interval = runs.replace('every ', '');

    if (ms(interval) < ms('5m')) {
        throw new Error('interval must be greater than 5 minutes');
    }

    const offset = getOffset(interval, date);

    return { interval, offset };
}

export function getIntervals(runs: string, date: Date) {
    const { interval, offset } = getInterval(runs, date);

    const msInterval = ms(interval);
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const intervals = [];
    let start = offset;

    while (start < 86400000) {
        const currentTimestamp = startOfDay.getTime() + start;
        const currentDateTime = new Date(currentTimestamp);

        intervals.push({
            ms: currentTimestamp,
            readable: formatDateToUSFormat(currentDateTime.toISOString())
        });

        start += msInterval;
    }

    return intervals;
}

function formatDateToUSFormat(dateString: string): string {
    const date = new Date(dateString);
    const options: Intl.DateTimeFormatOptions = {
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        hour12: true
    };

    const formattedDate = date.toLocaleString('en-US', options);

    return formattedDate;
}
