import { fileURLToPath } from 'url';
import path, { resolve } from 'path';
import type { Request, Response } from 'express';
import accountService from '../services/account.service.js';
import type { Account, ProviderTemplate, User } from '../models.js';
import logger from './logger.js';
import type { WSErr } from './web-socket-error.js';
import userService from '../services/user.service.js';
import { NangoError } from './error.js';
import { readFileSync } from 'fs';

export const localhostUrl: string = 'http://localhost:3003';
const accountIdLocalsKey = 'nangoAccountId';

export enum NodeEnv {
    Dev = 'development',
    Staging = 'staging',
    Prod = 'production'
}

type PackageJson = {
    version: string;
};

export function isDev() {
    return process.env['NODE_ENV'] === NodeEnv.Dev;
}

export function isStaging() {
    return process.env['NODE_ENV'] === NodeEnv.Staging;
}

export function isProd() {
    return process.env['NODE_ENV'] === NodeEnv.Prod;
}

export enum UserType {
    Local = 'localhost',
    SelfHosted = 'self-hosted',
    Cloud = 'cloud'
}

export function isCloud() {
    return process.env['NANGO_CLOUD']?.toLowerCase() === 'true';
}

export function isBasicAuthEnabled() {
    return !isCloud() && process.env['NANGO_DASHBOARD_USERNAME'] && process.env['NANGO_DASHBOARD_PASSWORD'];
}

export function dirname() {
    return path.dirname(fileURLToPath(import.meta.url));
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

export function getBaseUrl() {
    return process.env['NANGO_SERVER_URL'] || localhostUrl;
}

export async function getOauthCallbackUrl(accountId?: number) {
    let globalCallbackUrl = getGlobalOAuthCallbackUrl();

    if (isCloud() && accountId != null) {
        let account: Account | null = await accountService.getAccountById(accountId);
        return account?.callback_url || globalCallbackUrl;
    }

    return globalCallbackUrl;
}

export function getGlobalOAuthCallbackUrl() {
    return process.env['NANGO_CALLBACK_URL'] || getBaseUrl() + '/oauth/callback';
}

export function isApiAuthenticated(res: Response): boolean {
    return res.locals != null && accountIdLocalsKey in res.locals && Number.isInteger(res.locals[accountIdLocalsKey]);
}

export function isUserAuthenticated(req: Request): boolean {
    return req.isAuthenticated() && req.user != null && req.user.id != null;
}

export async function getUserAndAccountFromSesstion(req: Request): Promise<{ user: User; account: Account }> {
    let sessionUser = req.user;

    if (sessionUser == null) {
        throw new NangoError('user_not_found');
    }

    let user = await userService.getUserById(sessionUser.id);

    if (user == null) {
        throw new NangoError('user_not_found');
    }

    let account = await accountService.getAccountById(user.account_id);

    if (account == null) {
        throw new NangoError('account_not_found');
    }

    return { user: user, account: account };
}

export function getAccount(res: Response): number {
    if (res.locals == null || !(accountIdLocalsKey in res.locals)) {
        throw new NangoError('account_not_set_in_locals');
    }

    let accountId = res.locals[accountIdLocalsKey];

    if (Number.isInteger(accountId)) {
        return accountId;
    } else {
        throw new NangoError('account_malformed_in_locals');
    }
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

export function isTokenExpired(expireDate: Date): boolean {
    let currDate = new Date();
    let dateDiffMs = expireDate.getTime() - currDate.getTime();
    return dateDiffMs < 15 * 60 * 1000;
}

export function setAccount(accountId: number, res: Response) {
    res.locals[accountIdLocalsKey] = accountId;
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
        var r = replacers[b];
        return typeof r === 'string' || typeof r === 'number' ? (r as string) : a; // Typecast needed to make TypeScript happy
    });
}

/**
 * A helper function to check if replacers contains all necessary params to interpolate string.
 * interpolateString('Hello ${name} of ${age} years", {name: 'Tester'}) -> returns false
 */
export function missesInterpolationParam(str: string, replacers: Record<string, any>) {
    let interpolatedStr = interpolateString(str, replacers);
    return /\${([^{}]*)}/g.test(interpolatedStr);
}

/**
 * A helper function to extract the additional connection configuration options from the frontend Auth request.
 */
export function getConnectionConfig(queryParams: any): Record<string, string> {
    var arr = Object.entries(queryParams);
    arr = arr.filter(([_, v]) => typeof v === 'string'); // Filter strings
    arr = arr.map(([k, v]) => [`connectionConfig.params.${k}`, v]); // Format keys to 'connectionConfig.params.[key]'
    return Object.fromEntries(arr) as Record<string, string>;
}

/**
 * A helper function to extract the additional connection metadata returned from the Provider in the callback request.
 */
export function getConnectionMetadataFromCallbackRequest(queryParams: any, template: ProviderTemplate): Record<string, string> {
    if (!queryParams || !template.redirect_uri_metadata) {
        return {};
    }

    let whitelistedKeys = template.redirect_uri_metadata;

    // Filter out non-strings & non-whitelisted keys.
    let arr = Object.entries(queryParams).filter(([k, v]) => typeof v === 'string' && whitelistedKeys.includes(k));

    return arr != null && arr.length > 0 ? (Object.fromEntries(arr) as Record<string, string>) : {};
}

/**
 * A helper function to extract the additional connection metadata returned from the Provider in the token response.
 */
export function getConnectionMetadataFromTokenResponse(params: any, template: ProviderTemplate): Record<string, string> {
    if (!params || !template.token_response_metadata) {
        return {};
    }

    let whitelistedKeys = template.token_response_metadata;

    // Filter out non-strings & non-whitelisted keys.
    let arr = Object.entries(params).filter(([k, v]) => typeof v === 'string' && whitelistedKeys.includes(k));

    return arr != null && arr.length > 0 ? (Object.fromEntries(arr) as Record<string, string>) : {};
}

/**
 * A version of JSON.parse that detects Date strings and transforms them back into
 * Date objects. This depends on how dates were serialized obviously.
 *
 * @remarks
 * Source: https://stackoverflow.com/questions/3143070/javascript-regex-iso-datetime
 */
export function parseJsonDateAware(input: string) {
    const dateFormat =
        /(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z))/;
    // @ts-ignore
    return JSON.parse(input, (key, value) => {
        if (typeof value === 'string' && dateFormat.test(value)) {
            return new Date(value);
        }

        return value;
    });
}

/**
 *
 * @remarks
 * Yes including a full HTML template here in a string goes against many best practices.
 * Yet it also felt wrong to add another dependency to simply parse 1 template.
 * If you have an idea on how to improve this feel free to submit a pull request.
 */
function html(res: any, error: boolean) {
    const resultHTML = `
<!--
Nango OAuth flow callback. Read more about how to use it at: https://github.com/NangoHQ/nango
-->
<html>
  <head>
    <meta charset="utf-8" />
    <title>Authorization callback</title>
  </head>
  <body>
    <noscript>JavaScript is required to proceed with the authentication.</noscript>
    <script type="text/javascript">
      // Close the modal
      window.setTimeout(function() {
        window.close()
      }, 300);
    </script>
  </body>
</html>
`;

    if (error) {
        res.status(500);
    } else {
        res.status(200);
    }
    res.set('Content-Type', 'text/html');
    res.send(Buffer.from(resultHTML));
}

function oldErrorHtml(res: any, wsErr: WSErr) {
    const resultHTMLTemplate = `
<!--
Nango OAuth flow callback. Read more about how to use it at: https://github.com/NangoHQ/nango
-->
<html>
  <head>
    <meta charset="utf-8" />
    <title>Authorization callback</title>
  </head>
  <body>
    <noscript>JavaScript is required to proceed with the authentication.</noscript>
    <script type="text/javascript">
      window.authErrorType = \'\${errorType}\';
      window.authErrorDesc = \'\${errorDesc}\';

      const message = {};
      message.eventType = 'AUTHORIZATION_FAILED';
      message.data = {
        error: {
            type: window.authErrorType,
            message: window.authErrorDesc
        }
      };

      // Tell the world what happened
      window.opener && window.opener.postMessage(message, '*');

      // Close the modal
      window.setTimeout(function() {
        window.close()
      }, 300);
    </script>
  </body>
</html>
`;
    const resultHTML = interpolateString(resultHTMLTemplate, {
        errorType: wsErr.type.replace('\n', '\\n'),
        errorDesc: wsErr.message.replace('\n', '\\n')
    });

    logger.debug(`Got an error in the OAuth flow: ${wsErr.type} - ${wsErr.message}`);
    res.status(500);
    res.set('Content-Type', 'text/html');
    res.send(Buffer.from(resultHTML));
}

/**
 *
 * Legacy method to support old frontend SDKs.
 */
export function errorHtml(res: any, wsClientId: string | undefined, wsErr: WSErr) {
    if (wsClientId != null) {
        return html(res, true);
    } else {
        return oldErrorHtml(res, wsErr);
    }
}

/**
 *
 * Legacy method to support old frontend SDKs.
 */
export function successHtml(res: any, wsClientId: string | undefined, providerConfigKey: string, connectionId: string) {
    if (wsClientId != null) {
        return html(res, false);
    } else {
        return oldSuccessHtml(res, providerConfigKey, connectionId);
    }
}

/**
 *
 * Legacy method to support old frontend SDKs.
 */
function oldSuccessHtml(res: any, providerConfigKey: string, connectionId: string) {
    const resultHTMLTemplate = `
<!--
Nango OAuth flow callback. Read more about how to use it at: https://github.com/NangoHQ/nango
-->
<html>
  <head>
    <meta charset="utf-8" />
    <title>Authorization callback</title>
  </head>
  <body>
    <noscript>JavaScript is required to proceed with the authentication.</noscript>
    <script type="text/javascript">
      window.providerConfigKey = \`\${providerConfigKey}\`;
      window.connectionId = \`\${connectionId}\`;

      const message = {};
      message.eventType = 'AUTHORIZATION_SUCEEDED';
      message.data = { connectionId: window.connectionId, providerConfigKey: window.providerConfigKey };

      // Tell the world what happened
      window.opener && window.opener.postMessage(message, '*');

      // Close the modal
      window.setTimeout(function() {
        window.close()
      }, 300);
    </script>
  </body>
</html>
`;
    const resultHTML = interpolateString(resultHTMLTemplate, {
        providerConfigKey: providerConfigKey,
        connectionId: connectionId
    });

    res.status(200);
    res.set('Content-Type', 'text/html');
    res.send(Buffer.from(resultHTML));
}

export function resetPasswordSecret() {
    return process.env['NANGO_ADMIN_KEY'] || 'nango';
}

export function packageJsonFile(): PackageJson {
    return JSON.parse(readFileSync(resolve(process.cwd(), 'package.json')).toString('utf-8'));
}
