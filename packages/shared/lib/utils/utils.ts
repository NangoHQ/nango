import type { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import type { ProxyConfiguration } from '../models/Proxy.js';
import type { GetRecordsRequestConfig } from '../models/Sync.js';
import { NangoError } from './error.js';
import type { User } from '../models/Admin.js';

export const localhostUrl = 'http://localhost:3003';
const accountIdLocalsKey = 'nangoAccountId';

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

export function isCloud() {
    return process.env['NANGO_CLOUD']?.toLowerCase() === 'true';
}

export function isStaging() {
    return process.env['NODE_ENV'] === NodeEnv.Staging;
}

export function getPort() {
    if (process.env['SERVER_PORT'] != null) {
        return +process.env['SERVER_PORT'];
    } else if (process.env['PORT'] != null) {
        return +process.env['PORT']; // For Heroku (dynamic port)
    } else {
        return 3003;
    }
}

export function getServerPort() {
    return process.env['SERVER_PORT'] != null ? +process.env['SERVER_PORT'] : 3003;
}

export function isDev() {
    return process.env['NODE_ENV'] === NodeEnv.Dev;
}

export function isProd() {
    return process.env['NODE_ENV'] === NodeEnv.Prod;
}

export function isBasicAuthEnabled() {
    return !isCloud() && process.env['NANGO_DASHBOARD_USERNAME'] && process.env['NANGO_DASHBOARD_PASSWORD'];
}

function getServerHost() {
    return process.env['SERVER_HOST'] || process.env['SERVER_RUN_MODE'] === 'DOCKERIZED' ? 'http://nango-server' : 'http://localhost';
}

export function getServerBaseUrl() {
    return getServerHost() + `:${getServerPort()}`;
}

export function isValidHttpUrl(str: string) {
    const pattern = new RegExp(
        '^(https?:\\/\\/)?' + // protocol
            '((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|localhost|' + // domain name
            '((\\d{1,3}\\.){3}\\d{1,3}))' + // OR ip (v4) address
            '(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*' + // port and path
            '(\\?[;&a-z\\d%_.~+=-]*)?' + // query string
            '(\\#[-a-z\\d_]*)?$',
        'i'
    ); // fragment locator
    return !!pattern.test(str);
}

export function dirname() {
    return path.dirname(fileURLToPath(import.meta.url));
}

export const validateProxyConfiguration = (config: ProxyConfiguration) => {
    const requiredParams: Array<keyof ProxyConfiguration> = ['endpoint', 'providerConfigKey', 'connectionId'];

    requiredParams.forEach((param) => {
        if (typeof config[param] === 'undefined') {
            throw new Error(`${param} is missing and is required to make a proxy call!`);
        }
    });
};

export const validateSyncRecordConfiguration = (config: GetRecordsRequestConfig) => {
    const requiredParams: Array<keyof GetRecordsRequestConfig> = ['model', 'providerConfigKey', 'connectionId'];

    requiredParams.forEach((param) => {
        if (typeof config[param] === 'undefined') {
            throw new Error(`${param} is missing and is required to make a proxy call!`);
        }
    });
};

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

export function isTokenExpired(expireDate: Date): boolean {
    const currDate = new Date();
    const dateDiffMs = expireDate.getTime() - currDate.getTime();
    return dateDiffMs < 15 * 60 * 1000;
}

export function getBaseUrl() {
    return process.env['NANGO_SERVER_URL'] || localhostUrl;
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

export function interpolateIfNeeded(str: string, replacers: Record<string, any>) {
    if (str.includes('${')) {
        return interpolateStringFromObject(str, replacers);
    } else {
        return str;
    }
}

export function setAccount(accountId: number, res: Response) {
    res.locals[accountIdLocalsKey] = accountId;
}

export function getAccount(res: Response): number {
    if (res.locals == null || !(accountIdLocalsKey in res.locals)) {
        throw new NangoError('account_not_set_in_locals');
    }

    const accountId = res.locals[accountIdLocalsKey];

    if (Number.isInteger(accountId)) {
        return accountId;
    } else {
        throw new NangoError('account_malformed_in_locals');
    }
}

export function isApiAuthenticated(res: Response): boolean {
    return res.locals != null && accountIdLocalsKey in res.locals && Number.isInteger(res.locals[accountIdLocalsKey]);
}

export function isUserAuthenticated(req: Request): boolean {
    const user = req.user as User;
    return req.isAuthenticated() && user != null && user.id != null;
}
