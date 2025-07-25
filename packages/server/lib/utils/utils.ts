import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { serializeError } from 'serialize-error';

import { getFeatureFlagsClient } from '@nangohq/kvstore';
import { OrchestratorClient } from '@nangohq/nango-orchestrator';
import { NangoError, Orchestrator, getOrchestratorUrl, interpolateString, userService } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import type { DBUser, Provider, ProviderJwt, ProviderTwoStep } from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type { Request } from 'express';

const BINARY_CONTENT_TYPES = [
    'image/png',
    'video/',
    'audio/',
    'application/',
    'text/',
    'font/',
    'model/',
    'message/',
    'chemical/',
    'x-world/',
    'application/octet-stream'
];

export const featureFlags = await getFeatureFlagsClient();

/** @deprecated TODO delete this */
export async function getUserFromSession(req: Request<any>): Promise<Result<DBUser, NangoError>> {
    const sessionUser = req.user;
    if (!sessionUser) {
        const error = new NangoError('user_not_found');

        return Err(error);
    }

    const user = await userService.getUserById(sessionUser.id);
    if (!user) {
        const error = new NangoError('user_not_found');
        return Err(error);
    }

    return Ok(user);
}

export function dirname() {
    return path.dirname(fileURLToPath(import.meta.url));
}

/**
 * A helper function to check if replacers contains all necessary params to interpolate string.
 * interpolateString('Hello ${name} of ${age} years", {name: 'Tester'}) -> returns false
 */
export function missesInterpolationParam(str: string, replacers: Record<string, any>) {
    const strWithoutConnectionConfig = str.replace(/connectionConfig\./g, '');
    const interpolatedStr = interpolateString(strWithoutConnectionConfig, replacers);
    return /\${([^{}]*)}/g.test(interpolatedStr);
}

/**
 * A helper function to check if any string in an object misses interpolation params.
 * For example:
 * missesInterpolationParamInObject({ context: 'stores/${storeHash}', response_type: 'code' }, { storeHash: 'abc123' }) -> returns false
 * missesInterpolationParamInObject({ context: 'stores/${storeHash}', response_type: 'code' }, {}) -> returns true
 */
export function missesInterpolationParamInObject(params: Record<string, any>, replacers: Record<string, any>) {
    return Object.values(params).some((param) => {
        if (typeof param === 'string') {
            return missesInterpolationParam(param, replacers);
        }
        return false;
    });
}
/**
 * A helper function to extract the additional authorization parameters from the frontend Auth request.
 */
export function getAdditionalAuthorizationParams(params: any): Record<string, string | undefined> {
    if (!params || typeof params !== 'object') {
        return {};
    }

    const arr = Object.entries(params).filter(([_, v]) => typeof v === 'string'); // Filter strings
    const obj = Object.fromEntries(arr) as Record<string, string | undefined>;
    Object.keys(obj).forEach((key) => (obj[key] = obj[key] === 'undefined' ? undefined : obj[key])); // Detect undefined values to override template auth params.
    return obj;
}

/**
 * A helper function to extract the additional connection metadata returned from the Provider in the callback request.
 */
export function getConnectionMetadataFromCallbackRequest(queryParams: any, provider: Provider): Record<string, string> {
    if (!queryParams || !provider.redirect_uri_metadata) {
        return {};
    }

    const whitelistedKeys = provider.redirect_uri_metadata;

    // Filter out non-strings & non-whitelisted keys.
    const arr = Object.entries(queryParams).filter(([k, v]) => typeof v === 'string' && whitelistedKeys.includes(k));

    return arr != null && arr.length > 0 ? (Object.fromEntries(arr) as Record<string, string>) : {};
}

export function parseConnectionConfigParamsFromTemplate(provider: Provider): string[] {
    if (
        provider.token_url ||
        provider.authorization_url ||
        provider.proxy?.base_url ||
        provider.proxy?.headers ||
        provider.proxy?.connection_config ||
        provider.proxy?.verification ||
        provider.authorization_params ||
        provider.token_params
    ) {
        const cleanParamName = (param: string) => param.replace('${connectionConfig.', '').replace('}', '');
        const tokenUrlMatches = typeof provider.token_url === 'string' ? provider.token_url.match(/\${connectionConfig\.([^{}]*)}/g) || [] : [];
        const authorizationUrlMatches = provider.authorization_url?.match(/\${connectionConfig\.([^{}]*)}/g) || [];
        const connectionConfigMatches = provider.proxy?.connection_config
            ? Object.values(provider.proxy?.connection_config).flatMap((param) =>
                  typeof param === 'string' ? param.match(/\${connectionConfig\.([^{}]*)}/g) || [] : []
              )
            : [];

        const authorizationParamsMatches = provider.authorization_params
            ? Object.values(provider.authorization_params).flatMap((param) =>
                  typeof param === 'string' ? param.match(/\${connectionConfig\.([^{}]*)}/g) || [] : []
              )
            : [];

        const tokenParamsMatches = provider.token_params
            ? Object.values(provider.token_params).flatMap((param) => (typeof param === 'string' ? param.match(/\${connectionConfig\.([^{}]*)}/g) || [] : []))
            : [];

        const proxyBaseUrlMatches = provider.proxy?.base_url.match(/\${connectionConfig\.([^{}]*)}/g) || [];
        const proxyHeaderMatches = provider.proxy?.headers
            ? Array.from(new Set(Object.values(provider.proxy.headers).flatMap((header) => header.match(/\${connectionConfig\.([^{}]*)}/g) || [])))
            : [];
        const proxyMatches = [...proxyBaseUrlMatches, ...proxyHeaderMatches].filter(
            // we ignore config params in proxy attributes that are also in the
            // - token response metadata
            // - redirect url metadata
            // - connection_configuration - this is what is parsed from the post connection script
            (param) =>
                ![
                    ...(provider.token_response_metadata || []),
                    ...(provider.redirect_uri_metadata || []),
                    ...(provider.connection_configuration || []),
                    ...(provider.webhook_response_metadata || [])
                ].includes(cleanParamName(param))
        );
        const proxyVerificationMatches = [
            ...(provider.proxy?.verification?.endpoints
                ? provider.proxy.verification.endpoints.flatMap((param) =>
                      typeof param === 'string' ? param.match(/\${connectionConfig\.([^{}]*)}/g) || [] : []
                  )
                : []),
            ...(provider.proxy?.verification?.base_url_override?.match(/\${connectionConfig\.([^{}]*)}/g) || [])
        ];

        return [
            ...tokenUrlMatches,
            ...authorizationUrlMatches,
            ...connectionConfigMatches,
            ...authorizationParamsMatches,
            ...tokenParamsMatches,
            ...proxyMatches,
            ...proxyVerificationMatches
        ]
            .map(cleanParamName)
            .filter((value, index, array) => array.indexOf(value) === index); // remove duplicates
    }

    return [];
}

export function parseCredentialsParamsFromTemplate(provider: ProviderTwoStep | ProviderJwt): string[] {
    const cleanParamName = (param: string) => param.replace('${credentials.', '').replace('}', '');

    const extractCredentialParams = (params: Record<string, any>): string[] => {
        const matches: string[] = [];

        for (const value of Object.values(params)) {
            if (typeof value === 'string') {
                const foundMatches = value.match(/\${credentials\.([^{}]*)}/g) || [];
                const uniqueMatches = foundMatches.map((match) => match.split('.')[0] + '.' + match.split('.')[1]);
                matches.push(...uniqueMatches);
            } else if (typeof value === 'object' && value !== null) {
                matches.push(...extractCredentialParams(value)); // Recursively search in nested objects
            }
        }

        return matches;
    };

    const matches: string[] = [];

    if ('token_params' in provider && provider.token_params) {
        const tokenParamsMatches = extractCredentialParams(provider.token_params);
        matches.push(...tokenParamsMatches);
    }

    if ('token_headers' in provider && provider.token_headers) {
        const tokenHeadersMatches = extractCredentialParams(provider.token_headers);
        matches.push(...tokenHeadersMatches);
    }

    if ('token' in provider && provider.token) {
        const tokenMatches = extractCredentialParams(provider.token);
        matches.push(...tokenMatches);
    }

    if (
        'additional_steps' in provider &&
        Array.isArray(provider.additional_steps) &&
        provider.additional_steps.every((step) => typeof step === 'object' && step !== null)
    ) {
        const additionalSteps = extractCredentialParams(provider.additional_steps);
        matches.push(...additionalSteps);
    }

    return [...new Set(matches.map(cleanParamName))]; // Remove duplicates
}

/**
 * This can be used to convert the keys of a Json to snake case
 * @param payload This the json we want to convert from a camelCase a snake_case
 */

export function convertJsonKeysToSnakeCase<TReturn>(payload: Record<string, any>): TReturn | null {
    if (payload == null) {
        return null;
    }
    return Object.entries(payload).reduce((accum: any, current) => {
        const [key, value] = current;
        const newKey = key.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
        accum[newKey] = value;
        return accum;
    }, {});
}

/**
 *
 * @param payload The json we want to convert its keys to camelCase
 */

export function convertJsonKeysToCamelCase<TReturn>(payload: Record<string, any>): TReturn | null {
    if (payload == null) {
        return null;
    }
    return Object.entries(payload).reduce((accum: any, current) => {
        const [key, value] = current;
        const newKey = key.replace(/([-_][a-z])/g, (group) => group.toUpperCase().replace('-', '').replace('_', ''));
        accum[newKey] = value;
        return accum;
    }, {});
}

export function resetPasswordSecret() {
    return process.env['NANGO_ADMIN_KEY'] || 'nango';
}

export function getOrchestratorClient() {
    return new OrchestratorClient({ baseUrl: getOrchestratorUrl() });
}

export function getOrchestrator() {
    return new Orchestrator(getOrchestratorClient());
}

export function isBinaryContentType(contentType: string | undefined): boolean {
    if (!contentType) return false;
    return BINARY_CONTENT_TYPES.some((type) => contentType.startsWith(type));
}

export function stringifyEnrichedError(err: unknown, opts?: { pretty?: boolean; stack?: boolean }) {
    const serialized = serializeError(err);
    const allowedErrorProperties = ['name', 'message', 'provider_error_payload', ...(opts?.stack ? ['stack', 'cause'] : [])];

    const enriched: Record<string, unknown> = {
        ...serialized
    };

    // Handle Boom-style error objects like the ones use in simpleOauth2
    // These errors often contain valuable debugging information in `data.payload` that
    // wouldn't be included in standard error serialization. We explicitly extract this
    // as 'provider_error_payload' since it typically contains API-specific error details
    // that are useful for debugging.
    if (typeof err === 'object' && err != null) {
        const anyErr = err as any;

        const payload = anyErr.data?.payload;
        if (payload && typeof payload === 'object') {
            enriched['provider_error_payload'] = payload;
        }
    }
    const filtered: Record<string, unknown> = Object.fromEntries(Object.entries(enriched).filter(([key]) => allowedErrorProperties.includes(key)));
    return JSON.stringify(filtered, null, opts?.pretty ? 2 : undefined);
}
