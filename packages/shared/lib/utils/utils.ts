import path from 'path';
import { fileURLToPath } from 'url';

import get from 'lodash-es/get.js';

import { cloudHost, isEnterprise, isProd, isStaging, localhostUrl, stagingHost } from '@nangohq/utils';

import type { DBConnection, Provider } from '@nangohq/types';

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

export function parseTokenExpirationDate(expirationDate: any): Date | undefined {
    if (expirationDate instanceof Date) {
        return expirationDate;
    }

    // UNIX timestamp
    if (typeof expirationDate === 'number') {
        return new Date(expirationDate * 1000);
    }

    if (typeof expirationDate === 'string') {
        // ISO 8601 string
        const date = new Date(expirationDate);
        if (!isNaN(date.getTime())) {
            return date;
        }

        // Check for "D+:HH:MM" format (e.g., "177:05:38")(tableau expire in value)
        if (/^\d+:\d{2}:\d{2}$/.test(expirationDate)) {
            return parseDayHourMinuteDuration(expirationDate);
        }
    }

    return undefined;
}

function parseDayHourMinuteDuration(timeStr: string): Date | undefined {
    // sample estimatedTimeToExpire: "estimatedTimeToExpiration": "177:05:38"
    const parts = timeStr.split(':');
    if (parts.length !== 3) return undefined;

    const [daysStr, hoursStr, minutesStr] = parts;
    const days = Number(daysStr);
    const hours = Number(hoursStr);
    const minutes = Number(minutesStr);

    const isValidDayCount = (n: number) => !isNaN(n) && n >= 0;
    const isValidHourValue = (n: number) => !isNaN(n) && n >= 0 && n < 24;
    const isValidMinuteValue = (n: number) => !isNaN(n) && n >= 0 && n < 60;

    if (isValidDayCount(days) && isValidHourValue(hours) && isValidMinuteValue(minutes)) {
        const totalMilliseconds = ((days * 24 + hours) * 60 + minutes) * 60 * 1000;
        return new Date(Date.now() + totalMilliseconds);
    }

    return undefined;
}

export function isTokenExpired(expireDate: Date | undefined, bufferInSeconds: number): boolean {
    if (!expireDate) {
        throw new Error('expireDate is required');
    }
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

export function getProvidersUrl() {
    return `${getApiUrl()}/providers.json`;
}

export function getGlobalOAuthCallbackUrl() {
    const baseUrl = process.env['NANGO_SERVER_URL'] || getLocalOAuthCallbackUrlBaseUrl();
    return baseUrl + '/oauth/callback';
}

export function getGlobalWebhookReceiveUrl() {
    const baseUrl = process.env['NANGO_SERVER_URL'] || getLocalOAuthCallbackUrlBaseUrl();
    return baseUrl + '/webhook';
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
export function interpolateString(str: string, replacers: Record<string, any>): string {
    str = str.replace(/\${base64\((.*?)\)}/g, (_, inner) => {
        const resolvedInner = interpolateString(inner, replacers);
        return Buffer.from(resolvedInner).toString('base64');
    });

    const interpolated = str.replace(/\${([^{}]*)}/g, (a, b) => {
        if (b === 'now') {
            return new Date().toISOString();
        }
        if (b.startsWith('base64(')) {
            return a;
        }
        const r = resolveKey(b, replacers);
        return typeof r === 'string' || typeof r === 'number' ? (r as string) : a; // Typecast needed to make TypeScript happy
    });

    return interpolated;
}
function resolveKey(key: string, replacers: Record<string, any>): any {
    const keys = key.split('.');
    let value = replacers;

    for (const part of keys) {
        if (value && part in value) {
            value = value[part];
        } else {
            return undefined;
        }
    }

    return value;
}
export function interpolateStringFromObject(str: string, replacers: Record<string, any>): string {
    str = str.replace(/\${base64\((.*?)\)}/g, (_, inner) => {
        const resolvedInner = interpolateStringFromObject(inner, replacers);
        return Buffer.from(resolvedInner).toString('base64');
    });

    const interpolated = str.replace(/\${([^{}]*)}/g, (a, b) => {
        const r = b.split('.').reduce((o: Record<string, any>, i: string) => o[i], replacers);
        return typeof r === 'string' || typeof r === 'number' ? (r as string) : a;
    });
    return interpolated;
}

export function interpolateObjectValues(obj: Record<string, string | undefined>, connectionConfig: Record<string, any>): Record<string, string | undefined> {
    const interpolated: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string') {
            interpolated[key] = interpolateStringFromObject(value, { connectionConfig });
        } else {
            interpolated[key] = value;
        }
    }
    return interpolated;
}

export function interpolateObject(obj: Record<string, any>, dynamicValues: Record<string, any>): Record<string, any> {
    const interpolated: Record<string, any> = {};

    for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string') {
            interpolated[key] = interpolateString(value, dynamicValues);
        } else if (typeof value === 'object' && value !== null) {
            interpolated[key] = interpolateObject(value, dynamicValues);
        } else {
            interpolated[key] = value;
        }
    }

    return interpolated;
}

export function stripCredential(obj: any): any {
    if (typeof obj === 'string') {
        return obj.replace(/credentials\./g, '');
    } else if (typeof obj === 'object' && obj !== null) {
        const strippedObject: any = {};
        for (const [key, value] of Object.entries(obj)) {
            strippedObject[key] = stripCredential(value);
        }
        return strippedObject;
    }
    return obj;
}

export function stripStepResponse(obj: any): any {
    if (typeof obj === 'string') {
        return obj.replace(/step\d+\./g, '');
    } else if (typeof obj === 'object' && obj !== null) {
        const strippedObject: any = {};
        for (const [key, value] of Object.entries(obj)) {
            strippedObject[key] = stripStepResponse(value);
        }
        return strippedObject;
    }
    return obj;
}

export function extractStepNumber(str: string): number | null {
    const match = str.match(/\${step(\d+)\..*?}/);

    if (match && match[1]) {
        const stepNumber = parseInt(match[1], 10);
        return stepNumber;
    }

    return null;
}

export function getStepResponse(stepNumber: number, stepResponses: any[]): Record<string, any> {
    if (stepResponses && stepResponses.length > stepNumber - 1 && stepResponses[stepNumber - 1]) {
        return stepResponses[stepNumber - 1];
    }
    return {};
}

export function extractValueByPath(obj: Record<string, any>, path: string): any {
    return get(obj, path);
}

export function connectionCopyWithParsedConnectionConfig(connection: Pick<DBConnection, 'connection_config'>) {
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
    return baseUrl ? baseUrl.replace(/connectionConfig/g, 'connection_config') : baseUrl;
}

export function interpolateIfNeeded(str: string, replacers: Record<string, any>) {
    if (str.includes('${')) {
        if (str.includes('||')) {
            const parts = str.split('||').map((part) => part.trim());
            const left = parts[0] ? interpolateStringFromObject(parts[0], replacers) : undefined;

            if (left && left !== parts[0]) {
                return left;
            }

            return parts[1] ? interpolateStringFromObject(parts[1], replacers) : '';
        }

        return interpolateStringFromObject(str, replacers);
    }

    return str;
}

export function getConnectionConfig(queryParams: any): Record<string, string> {
    const arr = Object.entries(queryParams).filter(([, v]) => typeof v === 'string'); // Filter strings
    return Object.fromEntries(arr) as Record<string, string>;
}

export function encodeParameters(params: Record<string, any>): Record<string, string> {
    return Object.fromEntries(Object.entries(params).map(([key, value]) => [key, encodeURIComponent(String(value))]));
}

/**
 * A helper function to extract the additional connection metadata returned from the Provider in the token response.
 * It can parse booleans or strings only
 */
export function getConnectionMetadataFromTokenResponse(params: any, provider: Provider): Record<string, any> {
    if (!params || !provider.token_response_metadata) {
        return {};
    }

    const whitelistedKeys = provider.token_response_metadata;

    const getValueFromDotNotation = (obj: any, key: string): any => {
        return key.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);
    };

    // Filter out non-strings, non-booleans & non-whitelisted keys.
    const arr = Object.entries(params).filter(([k, v]) => {
        const isStringValueOrBoolean = typeof v === 'string' || typeof v === 'boolean';
        if (isStringValueOrBoolean && whitelistedKeys.includes(k)) {
            return true;
        }
        // Check for dot notation keys
        const dotNotationValue = getValueFromDotNotation(params, k);
        return isStringValueOrBoolean && whitelistedKeys.includes(dotNotationValue);
    });

    // Add support for dot notation keys
    const dotNotationArr = whitelistedKeys
        .map((key) => {
            const value = getValueFromDotNotation(params, key);
            const isStringValueOrBoolean = typeof value === 'string' || typeof value === 'boolean';
            return isStringValueOrBoolean ? [key, value] : null;
        })
        .filter(Boolean);

    const combinedArr: [string, any][] = [...arr, ...dotNotationArr].filter((item) => item !== null) as [string, any][];

    return combinedArr.length > 0 ? (Object.fromEntries(combinedArr) as Record<string, any>) : {};
}

export function makeUrl(template: string, config: Record<string, any>, skipEncodeKeys: string[] = []): URL {
    const cleanTemplate = template.replace(/connectionConfig\./g, '');
    const encodedParams = skipEncodeKeys.includes('base_url') ? config : encodeParameters(config);
    const interpolatedUrl = interpolateString(cleanTemplate, encodedParams);
    return new URL(interpolatedUrl);
}

export function formatPem(pem: string, type: 'CERTIFICATE' | 'PRIVATE KEY'): string {
    if (!pem || typeof pem !== 'string') {
        throw new Error('Invalid PEM input: must be a non-empty string');
    }

    const normalized = pem
        .replace(/\r\n/g, '\n')
        .replace(/^\s+|\s+$/g, '')
        .replace(/-----(BEGIN|END) [^-]+-----/g, '')
        .replace(/\s+/g, '');

    if (!normalized) {
        throw new Error('PEM content is empty after normalization');
    }

    if (!/^[a-zA-Z0-9+/=]+$/.test(normalized)) {
        throw new Error('PEM contains invalid characters (must be base64)');
    }

    const chunked = normalized.match(/.{1,64}/g);
    if (!chunked) {
        throw new Error('Failed to chunk PEM content');
    }

    return `-----BEGIN ${type}-----\n${chunked.join('\n')}\n-----END ${type}-----\n`;
}
