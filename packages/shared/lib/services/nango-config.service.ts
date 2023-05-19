import fs from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
// @ts-ignore
import translateCron from 'friendly-node-cron';
import type { NangoConfig } from '../integrations/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function loadNangoConfig(): NangoConfig | null {
    try {
        const yamlConfig = fs.readFileSync(path.resolve(__dirname, '../nango-integrations/nango.yaml'), 'utf8');
        const configData: NangoConfig = yaml.load(yamlConfig) as unknown as NangoConfig;

        return configData;
    } catch (error) {
        console.log('no nango.yaml config found');
    }

    return null;
}

export function checkForIntegrationFile(syncName: string) {
    return fs.existsSync(path.resolve(__dirname, `../nango-integrations/${syncName}.js`));
}

export async function getIntegrationClass(syncName: string) {
    try {
        const integrationPath = path.resolve(__dirname, `../nango-integrations/${syncName}.js`) + `?v=${Math.random().toString(36).substring(3)}`;
        const { default: integrationCode } = await import(integrationPath);
        const integrationClass = new integrationCode();

        return integrationClass;
    } catch (error) {
        console.error(error);
    }

    return null;
}

export function getCronExpression(runs: string): string {
    // human to cron doesn't get this for some reason
    if (runs === 'every half hour') {
        return '0 */30 * * * *';
    }

    if (runs === 'every quarter hour') {
        return '0 */15 * * * *';
    }

    if (runs === 'every hour') {
        return '0 * * * * *';
    }

    const cron = translateCron(runs);
    console.log(cron);

    return cron;
}
