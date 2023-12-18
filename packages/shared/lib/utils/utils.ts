import type { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { NangoError } from './error.js';
import type { User, Account } from '../models/Admin.js';
import type { Environment } from '../models/Environment.js';
import environmentService from '../services/environment.service.js';
import userService from '../services/user.service.js';
import type { Connection } from '../models/Connection.js';
import type { ServiceResponse } from '../models/Generic.js';

const PORT = process.env['SERVER_PORT'] || 3003;
export const localhostUrl = `http://localhost:${PORT}`;
export const cloudHost = 'https://api.nango.dev';
export const stagingHost = 'https://api-staging.nango.dev';

const accountIdLocalsKey = 'nangoAccountId';
const environmentIdLocalsKey = 'nangoEnvironmentId';

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

export const JAVASCRIPT_PRIMITIVES = ['string', 'number', 'boolean', 'bigint', 'symbol', 'undefined', 'object', 'null'];

export function getEnv() {
    if (isStaging()) {
        return NodeEnv.Staging;
    } else if (isProd()) {
        return NodeEnv.Prod;
    } else {
        return NodeEnv.Dev;
    }
}

export function isCloud() {
    return process.env['NANGO_CLOUD']?.toLowerCase() === 'true';
}

export function isStaging() {
    return process.env['NODE_ENV'] === NodeEnv.Staging;
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

export function getRedisUrl() {
    return process.env['NANGO_REDIS_URL'] || undefined;
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

export function getBaseUrl() {
    return process.env['NANGO_SERVER_URL'] || localhostUrl;
}

export function getBasePublicUrl() {
    if (process.env['NANGO_SERVER_PUBLIC_URL']) {
        return process.env['NANGO_SERVER_PUBLIC_URL'].replace('api.', 'app.');
    } else {
        return getBaseUrl();
    }
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
    if (isStaging()) {
        return stagingHost;
    } else if (isProd()) {
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
        const environment: Environment | null = await environmentService.getByAccountIdAndEnvironment(environmentId);
        return environment?.callback_url || globalCallbackUrl;
    }

    return globalCallbackUrl;
}

export async function getAppCallbackUrl(_environmentId?: number) {
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

    Object.keys(rawConfig).forEach(function (key, _) {
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

export function setAccount(accountId: number, res: Response) {
    res.locals[accountIdLocalsKey] = accountId;
}

export function setEnvironmentId(environmentId: number, res: Response) {
    res.locals[environmentIdLocalsKey] = environmentId;
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

export function getEnvironmentId(res: Response): number {
    if (res.locals == null || !(environmentIdLocalsKey in res.locals)) {
        throw new NangoError('environment_not_set_in_locals');
    }

    const environmentId = res.locals[environmentIdLocalsKey];

    if (Number.isInteger(environmentId)) {
        return environmentId;
    } else {
        throw new NangoError('environment_malformed_in_locals');
    }
}

export async function getEnvironmentAndAccountId(
    res: Response,
    req: Request
): Promise<ServiceResponse<{ accountId: number; environmentId: number; isWeb: boolean }>> {
    if (req.user) {
        const { response: accountInfo, success, error } = await getAccountIdAndEnvironmentIdFromSession(req);
        if (!success || accountInfo == null) {
            return { response: null, error, success: false };
        }
        const response = { ...accountInfo, isWeb: true };

        return { response, error: null, success: true };
    } else {
        const accountId = getAccount(res);
        const environmentId = getEnvironmentId(res);

        const response = { accountId, environmentId, isWeb: false };
        return Promise.resolve({ response, error: null, success: true });
    }
}

export async function getAccountIdAndEnvironmentIdFromSession(req: Request): Promise<ServiceResponse<{ accountId: number; environmentId: number }>> {
    const sessionUser = req.user as User;
    const currentEnvironment = req.cookies['env'] || 'dev';

    if (sessionUser == null) {
        const error = new NangoError('user_not_found');
        return { response: null, error, success: false };
    }

    const user = await userService.getUserById(sessionUser.id);

    if (user == null) {
        const error = new NangoError('user_not_found');
        return { response: null, error, success: false };
    }

    const environmentAndAccount = await environmentService.getAccountAndEnvironmentById(user.account_id, currentEnvironment);

    if (environmentAndAccount == null) {
        const error = new NangoError('account_not_found');
        return { response: null, error, success: false };
    }

    const { account, environment } = environmentAndAccount as { account: Account; environment: Environment };

    const response = { accountId: account.id, environmentId: environment.id };

    return { response, error: null, success: true };
}

export function isApiAuthenticated(res: Response): boolean {
    return res.locals != null && accountIdLocalsKey in res.locals && Number.isInteger(res.locals[accountIdLocalsKey]);
}

export function isUserAuthenticated(req: Request): boolean {
    const user = req.user as User;
    return typeof req.isAuthenticated === 'function' && req.isAuthenticated() && user != null && user.id != null;
}

export function getConnectionConfig(queryParams: any): Record<string, string> {
    const arr = Object.entries(queryParams).filter(([_, v]) => typeof v === 'string'); // Filter strings
    return Object.fromEntries(arr) as Record<string, string>;
}
