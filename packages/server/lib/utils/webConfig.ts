import path from 'node:path';
import fs from 'node:fs';
import { basePublicUrl, baseUrl, isProd, webSubdirectory } from '@nangohq/utils';
import { dirname } from './utils.js';

export interface WindowEnv {
    API_URL: string;
    WEB_BASE_URL: string;
    WEB_BASE_PATH: string;
    PUBLIC_SENTRY_KEY: string;
    PUBLIC_POSTHOG_KEY: string;
    PUBLIC_POSTHOG_HOST: string;
}

export function generateWebappConfig() {
    const configObject: WindowEnv = {
        API_URL: baseUrl,
        WEB_BASE_URL: basePublicUrl,
        WEB_BASE_PATH: webSubdirectory,
        PUBLIC_SENTRY_KEY: process.env['PUBLIC_SENTRY_KEY'] || '',
        PUBLIC_POSTHOG_KEY: process.env['PUBLIC_POSTHOG_KEY'] || '',
        PUBLIC_POSTHOG_HOST: process.env['PUBLIC_POSTHOG_HOST'] || ''
    };

    const configString = `window._env = ${JSON.stringify(configObject, null, 2)};`;

    const web = path.join(dirname(), '../../../webapp/', isProd ? 'build' : 'public');
    const filePath = path.join(web, 'env.js');
    fs.writeFileSync(filePath, configString);

    // Change index.html
    const fp = path.join(web, 'index.html');
    if (webSubdirectory !== '/') {
        const index = fs.readFileSync(fp);
        fs.writeFileSync(fp, index.toString().replace('base href="/"', `base href="${webSubdirectory}/"`));
    }
}

generateWebappConfig();
