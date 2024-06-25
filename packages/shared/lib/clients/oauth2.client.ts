import type { Config as ProviderConfig, OAuth2Credentials, Connection } from '../models/index.js';
import type { TemplateOAuth2 as ProviderTemplateOAuth2, Template as ProviderTemplate } from '@nangohq/types';
import type { AccessToken, ModuleOptions, WreckHttpOptions } from 'simple-oauth2';
import { AuthorizationCode } from 'simple-oauth2';
import connectionsManager from '../services/connection.service.js';
import type { ServiceResponse } from '../models/Generic.js';
import { LogActionEnum } from '../models/Telemetry.js';
import { interpolateString } from '../utils/utils.js';
import Boom from '@hapi/boom';
import { NangoError } from '../utils/error.js';
import errorManager, { ErrorSourceEnum } from '../utils/error.manager.js';
import { httpAgent, httpsAgent } from '@nangohq/utils';
import type { Merge } from 'type-fest';

export function getSimpleOAuth2ClientConfig(
    providerConfig: ProviderConfig,
    template: ProviderTemplate,
    connectionConfig: Record<string, string>
): Merge<ModuleOptions, { http: WreckHttpOptions }> {
    const templateTokenUrl = typeof template.token_url === 'string' ? template.token_url : (template.token_url!['OAUTH2'] as string);
    const strippedTokenUrl = templateTokenUrl.replace(/connectionConfig\./g, '');
    const tokenUrl = new URL(interpolateString(strippedTokenUrl, connectionConfig));
    const strippedAuthorizeUrl = template.authorization_url!.replace(/connectionConfig\./g, '');
    const authorizeUrl = new URL(interpolateString(strippedAuthorizeUrl, connectionConfig));
    const headers = { 'User-Agent': 'Nango' };

    const authConfig = template as ProviderTemplateOAuth2;

    return {
        client: {
            id: providerConfig.oauth_client_id,
            secret: providerConfig.oauth_client_secret
        },
        auth: {
            tokenHost: tokenUrl.origin,
            tokenPath: tokenUrl.pathname,
            authorizeHost: authorizeUrl.origin,
            authorizePath: authorizeUrl.pathname
        },
        http: {
            headers,
            // @ts-expect-error badly documented feature https://github.com/hapijs/wreck/blob/ba28b0420d6b0998cd8e61be7f3f8822129c88fe/lib/index.js#L34-L40
            agents:
                httpAgent && httpsAgent
                    ? {
                          http: httpAgent,
                          https: httpsAgent,
                          httpsAllowUnauthorized: httpsAgent
                      }
                    : undefined
        },
        options: {
            authorizationMethod: authConfig.authorization_method || 'body',
            bodyFormat: authConfig.body_format || 'form',
            // @ts-expect-error seems unused ?
            scopeSeparator: template.scope_separator || ' '
        }
    };
}

export async function getFreshOAuth2Credentials(
    connection: Connection,
    config: ProviderConfig,
    template: ProviderTemplateOAuth2
): Promise<ServiceResponse<OAuth2Credentials>> {
    const credentials = connection.credentials as OAuth2Credentials;
    if (credentials.config_override && credentials.config_override.client_id && credentials.config_override.client_secret) {
        config = {
            ...config,
            oauth_client_id: credentials.config_override.client_id,
            oauth_client_secret: credentials.config_override.client_secret
        };
    }
    const simpleOAuth2ClientConfig = getSimpleOAuth2ClientConfig(config, template, connection.connection_config);
    if (template.token_request_auth_method === 'basic') {
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
    if (template.refresh_params) {
        additionalParams = template.refresh_params;
    } else if (template.token_params) {
        additionalParams = template.token_params;
    }

    let rawNewAccessToken: AccessToken;

    try {
        rawNewAccessToken = await oldAccessToken.refresh(additionalParams);
    } catch (e: any) {
        let nangoErr: NangoError;
        let errorPayload;
        if ('data' in e && 'payload' in e.data) {
            errorPayload = e.data.payload;
        }

        if (Boom.isBoom(e)) {
            const payload = {
                external_message: e.message,
                external_request_details: e.output,
                dataMessage: errorPayload instanceof Buffer ? errorPayload.toString() : errorPayload
            };
            nangoErr = new NangoError(`refresh_token_external_error`, payload);
        } else {
            nangoErr = new NangoError(`refresh_token_external_error`, { message: e.message });
        }

        errorManager.report(nangoErr.message, {
            environmentId: connection.environment_id,
            source: ErrorSourceEnum.CUSTOMER,
            operation: LogActionEnum.AUTH,
            metadata: {
                connection,
                config,
                template
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
                connection,
                config,
                template
            }
        });
        return { success: false, error, response: null };
    }
}
