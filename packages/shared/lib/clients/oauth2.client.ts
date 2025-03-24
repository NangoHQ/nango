import Boom from '@hapi/boom';
import { AuthorizationCode } from 'simple-oauth2';

import { httpAgent, httpsAgent, redactHeaders } from '@nangohq/utils';

import { LogActionEnum } from '../models/Telemetry.js';
import connectionsManager from '../services/connection.service.js';
import { NangoError } from '../utils/error.js';
import errorManager, { ErrorSourceEnum } from '../utils/error.manager.js';
import { encodeParameters, interpolateString } from '../utils/utils.js';

import type { ServiceResponse } from '../models/Generic.js';
import type { Config as ProviderConfig, OAuth2Credentials } from '../models/index.js';
import type { LogContextStateless } from '@nangohq/logs';
import type { DBConnectionDecrypted, Provider, ProviderOAuth2 } from '@nangohq/types';
import type { AccessToken, ModuleOptions, WreckHttpOptions } from 'simple-oauth2';
import type { Merge } from 'type-fest';

// we specify these agents as getters so that they aren't cloned by simple-oauth2,
// because as agent objects grow during usage the clone operation becomes very slow
const agentConfig = {
    get http() {
        return httpAgent;
    },
    get https() {
        return httpsAgent;
    },
    get httpsAllowUnauthorized() {
        return httpsAgent;
    }
};

export function getSimpleOAuth2ClientConfig(
    providerConfig: ProviderConfig,
    provider: Provider,
    connectionConfig: Record<string, string>
): Merge<ModuleOptions, { http: WreckHttpOptions }> {
    const templateTokenUrl = typeof provider.token_url === 'string' ? provider.token_url : (provider.token_url!['OAUTH2'] as string);
    const tokenUrl = makeUrl(templateTokenUrl, connectionConfig, provider.token_url_skip_encode);
    const authorizeUrl = makeUrl(provider.authorization_url!, connectionConfig, provider.authorization_url_skip_encode);

    const headers = { 'User-Agent': 'Nango' };

    const authConfig = provider as ProviderOAuth2;

    return {
        client: {
            id: providerConfig.oauth_client_id,
            secret: providerConfig.oauth_client_secret
        },
        http: {
            headers,
            // @ts-expect-error agents are not specified in the types, but are available as an option
            agents: agentConfig
        },
        auth: {
            tokenHost: tokenUrl.origin,
            tokenPath: tokenUrl.pathname,
            authorizeHost: authorizeUrl.origin,
            authorizePath: authorizeUrl.pathname
        },
        options: {
            authorizationMethod: authConfig.authorization_method || 'body',
            bodyFormat: authConfig.body_format || 'form',
            // @ts-expect-error seems unused ?
            scopeSeparator: provider.scope_separator || ' '
        }
    };
}

export async function getFreshOAuth2Credentials({
    connection,
    config,
    provider,
    logCtx
}: {
    connection: DBConnectionDecrypted;
    config: ProviderConfig;
    provider: ProviderOAuth2;
    logCtx: LogContextStateless;
}): Promise<ServiceResponse<OAuth2Credentials>> {
    const credentials = connection.credentials as OAuth2Credentials;
    if (credentials.config_override && credentials.config_override.client_id && credentials.config_override.client_secret) {
        config = {
            ...config,
            oauth_client_id: credentials.config_override.client_id,
            oauth_client_secret: credentials.config_override.client_secret
        };
    }
    const simpleOAuth2ClientConfig = getSimpleOAuth2ClientConfig(config, provider, connection.connection_config);
    if (provider.token_request_auth_method === 'basic') {
        const headers = {
            ...simpleOAuth2ClientConfig.http?.headers,
            Authorization: 'Basic ' + Buffer.from(config.oauth_client_id + ':' + config.oauth_client_secret).toString('base64')
        };
        simpleOAuth2ClientConfig.http.headers = headers;
    }
    const client = new AuthorizationCode(simpleOAuth2ClientConfig);
    const oldAccessToken = client.createToken({
        access_token: credentials.access_token,
        expires_at: credentials.expires_at,
        refresh_token: credentials.refresh_token
    });

    let additionalParams = {};
    if (provider.refresh_params) {
        additionalParams = provider.refresh_params;
    } else if (provider.token_params) {
        additionalParams = provider.token_params;
    }

    let rawNewAccessToken: AccessToken;
    const createdAt = new Date();
    const url = `${simpleOAuth2ClientConfig.auth.tokenHost}${simpleOAuth2ClientConfig.auth.tokenPath}`;

    try {
        rawNewAccessToken = await oldAccessToken.refresh(additionalParams);
        void logCtx.http(`POST ${url}`, {
            createdAt,
            request: {
                method: 'POST',
                url,
                headers: redactHeaders({ headers: simpleOAuth2ClientConfig.http.headers, valuesToFilter: [config.oauth_client_secret] })
            },
            response: { code: 200, headers: {} }
        });
    } catch (err) {
        let nangoErr: NangoError;
        if (Boom.isBoom(err)) {
            let errorPayload;
            if ('data' in err && 'payload' in err.data) {
                errorPayload = err.data.payload;
            }
            const payload = {
                dataMessage: errorPayload instanceof Buffer ? errorPayload.toString() : errorPayload
            };
            void logCtx.http(`POST ${url}`, {
                level: 'error',
                createdAt,
                request: {
                    method: 'POST',
                    url,
                    headers: redactHeaders({ headers: simpleOAuth2ClientConfig.http.headers, valuesToFilter: [config.oauth_client_secret] })
                },
                response: { code: err.output.statusCode, headers: err.output.headers as Record<string, any> },
                meta: { body: errorPayload instanceof Buffer ? errorPayload.toString() : errorPayload }
            });
            nangoErr = new NangoError(`refresh_token_external_error`, payload);
        } else {
            void logCtx.http(`POST ${url}`, {
                level: 'error',
                createdAt,
                request: { method: 'POST', url, headers: {} },
                response: undefined,
                error: err
            });
            nangoErr = new NangoError(`refresh_token_external_error`, { message: err instanceof Error ? err.message : 'unknown Error' });
        }

        errorManager.report(nangoErr.message, {
            environmentId: connection.environment_id,
            source: ErrorSourceEnum.CUSTOMER,
            operation: LogActionEnum.AUTH,
            metadata: {
                connectionId: connection.id,
                configId: config.id
            }
        });

        return { success: false, error: nangoErr, response: null };
    }

    let newCredentials: OAuth2Credentials;
    try {
        newCredentials = connectionsManager.parseRawCredentials(rawNewAccessToken.token, 'OAUTH2') as OAuth2Credentials;

        if (!newCredentials.refresh_token && credentials.refresh_token != null) {
            newCredentials.refresh_token = credentials.refresh_token;
        }

        if (credentials.config_override && credentials.config_override.client_id && credentials.config_override.client_secret) {
            newCredentials.config_override = {
                client_id: credentials.config_override.client_id,
                client_secret: credentials.config_override.client_secret
            };
        }

        return { success: true, error: null, response: newCredentials };
    } catch (err) {
        const error = new NangoError(`refresh_token_parsing_error`, { cause: err });
        errorManager.report(error.message, {
            environmentId: connection.environment_id,
            source: ErrorSourceEnum.CUSTOMER,
            operation: LogActionEnum.AUTH,
            metadata: {
                connectionId: connection.id,
                configId: config.id
            }
        });
        return { success: false, error, response: null };
    }
}

function makeUrl(template: string, config: Record<string, any>, skipEncodeKeys: string[] = []): URL {
    const cleanTemplate = template.replace(/connectionConfig\./g, '');
    const encodedParams = skipEncodeKeys.includes('base_url') ? config : encodeParameters(config);
    const interpolatedUrl = interpolateString(cleanTemplate, encodedParams);
    return new URL(interpolatedUrl);
}
