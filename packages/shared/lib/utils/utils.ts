import path from 'path';
import { fileURLToPath } from 'url';
import { isEnterprise, isStaging, isProd, localhostUrl, cloudHost, stagingHost } from '@nangohq/utils';
import type { Environment } from '../models/Environment.js';
import environmentService from '../services/environment.service.js';
import type { Connection } from '../models/Connection.js';

export { cloudHost, stagingHost };

export enum UserType {
    Local = 'localhost',
    SelfHosted = 'self-hosted',
    Cloud = 'cloud'
}

export enum NodeEnv {
    Dev = 'development',
    Staging = 'staging',
    Prod = 'production'
}

export function getPort() {
    if (process.env['SERVER_PORT']) {
        return +process.env['SERVER_PORT'];
    } else if (process.env['PORT']) {
        return +process.env['PORT']; // For Heroku (dynamic port)
    } else if (process.env['NANGO_PORT']) {
        return +process.env['NANGO_PORT']; // more friendly cli port name
    } else {
        return 3003;
    }
}

export function getServerPort() {
    if (process.env['SERVER_PORT']) {
        return +process.env['SERVER_PORT'];
    } else if (process.env['PORT']) {
        return +process.env['PORT']; // For Heroku (dynamic port)
    } else if (process.env['NANGO_PORT']) {
        return +process.env['NANGO_PORT']; // more friendly cli port name
    } else {
        return 3003;
    }
}

export function getPersistAPIUrl() {
    return process.env['PERSIST_SERVICE_URL'] || 'http://localhost:3007';
}

export function getJobsUrl() {
    return process.env['JOBS_SERVICE_URL'] || 'http://localhost:3005';
}

function getServerHost() {
    return process.env['SERVER_HOST'] || process.env['SERVER_RUN_MODE'] === 'DOCKERIZED' ? 'http://nango-server' : 'http://localhost';
}

export function getServerBaseUrl() {
    return getServerHost() + `:${getServerPort()}`;
}

export function getRedisUrl() {
    return process.env['NANGO_REDIS_URL'] || undefined;
}

export function getOrchestratorUrl() {
    return process.env['ORCHESTRATOR_SERVICE_URL'] || `http://localhost:${process.env['NANGO_ORCHESTRATOR_PORT'] || 3008}`;
}

export function isValidHttpUrl(str: string) {
    try {
        new URL(str);
        return true;
    } catch {
        return false;
    }
}

export function dirname(thisFile?: string) {
    return path.dirname(fileURLToPath(thisFile || import.meta.url));
}

export function parseTokenExpirationDate(expirationDate: any): Date {
    if (expirationDate instanceof Date) {
        return expirationDate;
    }

    // UNIX timestamp
    if (typeof expirationDate === 'number') {
        return new Date(expirationDate * 1000);
    }

    // ISO 8601 string
    return new Date(expirationDate);
}

export function isTokenExpired(expireDate: Date, bufferInSeconds: number): boolean {
    const currDate = new Date();
    const dateDiffMs = expireDate.getTime() - currDate.getTime();
    return dateDiffMs < bufferInSeconds * 1000;
}

/**
 * Get Oauth callback url base url.
 * @desc for ease of use with APIs that require a secure redirect
 * redirectmeto is automatically used. This is intentioned
 * for local development
 * @see https://github.com/kodie/redirectmeto
 */
export function getLocalOAuthCallbackUrlBaseUrl() {
    return 'https://redirectmeto.com/' + localhostUrl;
}

export function getApiUrl() {
    if (isStaging) {
        return stagingHost;
    } else if (isEnterprise) {
        return process.env['NANGO_SERVER_URL'] as string;
    } else if (isProd) {
        return cloudHost;
    }
    return getServerBaseUrl();
}

export function getGlobalOAuthCallbackUrl() {
    const baseUrl = process.env['NANGO_SERVER_URL'] || getLocalOAuthCallbackUrlBaseUrl();
    return baseUrl + '/oauth/callback';
}

export function getGlobalAppCallbackUrl() {
    const baseUrl = process.env['NANGO_SERVER_URL'] || getLocalOAuthCallbackUrlBaseUrl();
    return baseUrl + '/app-auth/connect';
}

export function getGlobalWebhookReceiveUrl() {
    const baseUrl = process.env['NANGO_SERVER_URL'] || getLocalOAuthCallbackUrlBaseUrl();
    return baseUrl + '/webhook';
}

export async function getOauthCallbackUrl(environmentId?: number) {
    const globalCallbackUrl = getGlobalOAuthCallbackUrl();

    if (environmentId != null) {
        const environment: Environment | null = await environmentService.getById(environmentId);
        return environment?.callback_url || globalCallbackUrl;
    }

    return globalCallbackUrl;
}

export function getAppCallbackUrl(_environmentId?: number) {
    const globalAppCallbackUrl = getGlobalAppCallbackUrl();

    // TODO add this to settings and make it configurable
    return globalAppCallbackUrl;
}

/**
 * Get any custom path for the websockets server.
 * Defaults to '/' for backwards compatibility
 *
 * @returns the path for the websockets server
 */
export function getWebsocketsPath(): string {
    return process.env['NANGO_SERVER_WEBSOCKETS_PATH'] || '/';
}

/**
 * A helper function to interpolate a string.
 * interpolateString('Hello ${name} of ${age} years", {name: 'Tester', age: 234}) -> returns 'Hello Tester of age 234 years'
 *
 * @remarks
 * Copied from https://stackoverflow.com/a/1408373/250880
 */
export function interpolateString(str: string, replacers: Record<string, any>) {
    return str.replace(/\${([^{}]*)}/g, (a, b) => {
        const r = replacers[b];
        return typeof r === 'string' || typeof r === 'number' ? (r as string) : a; // Typecast needed to make TypeScript happy
    });
}

export function interpolateStringFromObject(str: string, replacers: Record<string, any>) {
    return str.replace(/\${([^{}]*)}/g, (a, b) => {
        const r = b.split('.').reduce((o: Record<string, any>, i: string) => o[i], replacers);
        return typeof r === 'string' || typeof r === 'number' ? (r as string) : a;
    });
}

export function connectionCopyWithParsedConnectionConfig(connection: Connection) {
    const connectionCopy = Object.assign({}, connection);

    const rawConfig: Record<string, string> = connectionCopy.connection_config;

    if (!rawConfig || Object.keys(rawConfig).length === 0) {
        return connectionCopy;
    }

    const parsedConfig: Record<string, string> = {};

    Object.keys(rawConfig).forEach(function (key) {
        const newKey = key.replace('connectionConfig.', '');
        const value = rawConfig[key];

        if (newKey && value) {
            parsedConfig[newKey] = value;
        }
    });

    connectionCopy.connection_config = parsedConfig;
    return connectionCopy;
}

export function mapProxyBaseUrlInterpolationFormat(baseUrl: string | undefined): string | undefined {
    // Maps the format that is used in providers.yaml (inherited from oauth), to the format of the Connection model.
    return baseUrl ? baseUrl.replace('connectionConfig', 'connection_config') : baseUrl;
}

export function interpolateIfNeeded(str: string, replacers: Record<string, any>) {
    if (str.includes('${')) {
        return interpolateStringFromObject(str, replacers);
    } else {
        return str;
    }
}

export function getConnectionConfig(queryParams: any): Record<string, string> {
    const arr = Object.entries(queryParams).filter(([, v]) => typeof v === 'string'); // Filter strings
    return Object.fromEntries(arr) as Record<string, string>;
}
