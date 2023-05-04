import type { Request, Response } from 'express';
import * as crypto from 'node:crypto';
import * as uuid from 'uuid';
import simpleOauth2 from 'simple-oauth2';
import { getSimpleOAuth2ClientConfig } from '../clients/oauth2.client.js';
import { OAuth1Client } from '../clients/oauth1.client.js';
import configService from '../services/config.service.js';
import connectionService from '../services/connection.service.js';
import {
    getOauthCallbackUrl,
    getConnectionConfig,
    getConnectionMetadataFromCallbackRequest,
    missesInterpolationParam,
    getAccount,
    getConnectionMetadataFromTokenResponse
} from '../utils/utils.js';
import { ProviderConfig, ProviderTemplate, ProviderTemplateOAuth2, ProviderAuthModes, OAuthSession, OAuth1RequestTokenResult } from '../models.js';
import { LogData, LogLevel, LogAction, updateAppLogs, updateAppLogsAndWrite } from '../utils/file-logger.js';
import type { NextFunction } from 'express';
import errorManager from '../utils/error.manager.js';
import providerClientManager from '../clients/provider.client.js';
import wsClient from '../clients/web-socket.client.js';
import { WSErrBuilder } from '../utils/web-socket-error.js';
import analytics from '../utils/analytics.js';
import oAuthSessionService from '../services/oauth-session.service.js';
import hmacService from '../services/hmac.service.js';

class OAuthController {
    public async oauthRequest(req: Request, res: Response, _: NextFunction) {
        const accountId = getAccount(res);
        const { providerConfigKey } = req.params;
        let connectionId = req.query['connection_id'] as string | undefined;
        const wsClientId = req.query['ws_client_id'] as string | undefined;

        const log = {
            level: 'info' as LogLevel,
            success: false,
            action: 'oauth' as LogAction,
            start: Date.now(),
            end: Date.now(),
            timestamp: Date.now(),
            connectionId: connectionId as string,
            providerConfigKey: providerConfigKey as string,
            messages: [] as LogData['messages'],
            message: '',
            provider: '',
            sessionId: ''
        };

        try {
            if (!wsClientId) {
                analytics.track('server:pre_ws_oauth', accountId);
            }

            const callbackUrl = await getOauthCallbackUrl(accountId);
            const connectionConfig = req.query['params'] != null ? getConnectionConfig(req.query['params']) : {};

            if (connectionId == null) {
                updateAppLogsAndWrite(log, 'error', {
                    timestamp: Date.now(),
                    content: WSErrBuilder.MissingConnectionId().message
                });

                return wsClient.notifyErr(res, wsClientId, providerConfigKey, connectionId, WSErrBuilder.MissingConnectionId());
            } else if (providerConfigKey == null) {
                updateAppLogsAndWrite(log, 'error', {
                    timestamp: Date.now(),
                    content: WSErrBuilder.MissingProviderConfigKey().message
                });

                return wsClient.notifyErr(res, wsClientId, providerConfigKey, connectionId, WSErrBuilder.MissingProviderConfigKey());
            }
            connectionId = connectionId.toString();

            if (hmacService.isEnabled()) {
                const hmac = req.query['hmac'] as string | undefined;
                if (!hmac) {
                    updateAppLogsAndWrite(log, 'error', {
                        timestamp: Date.now(),
                        content: WSErrBuilder.MissingHmac().message
                    });

                    return wsClient.notifyErr(res, wsClientId, providerConfigKey, connectionId, WSErrBuilder.MissingHmac());
                }
                const verified = hmacService.verify(hmac, providerConfigKey, connectionId);
                if (!verified) {
                    updateAppLogsAndWrite(log, 'error', {
                        timestamp: Date.now(),
                        content: WSErrBuilder.InvalidHmac().message
                    });

                    return wsClient.notifyErr(res, wsClientId, providerConfigKey, connectionId, WSErrBuilder.InvalidHmac());
                }
            }

            updateAppLogs(log, 'info', {
                content: 'Authorization URL request from the client',
                timestamp: Date.now(),
                authMode: '',
                url: callbackUrl,
                connectionId,
                params: {
                    ...connectionConfig,
                    hmacEnabled: hmacService.isEnabled() === true
                }
            });

            const config = await configService.getProviderConfig(providerConfigKey, accountId);

            log.provider = String(config?.provider);

            if (config == null) {
                updateAppLogsAndWrite(log, 'error', {
                    content: WSErrBuilder.UnknownProviderConfigKey(providerConfigKey).message,
                    timestamp: Date.now(),
                    authMode: '',
                    url: callbackUrl,
                    connectionId
                });

                return wsClient.notifyErr(res, wsClientId, providerConfigKey, connectionId, WSErrBuilder.UnknownProviderConfigKey(providerConfigKey));
            }

            let template: ProviderTemplate;
            try {
                template = configService.getTemplate(config.provider);
            } catch {
                updateAppLogsAndWrite(log, 'error', {
                    content: WSErrBuilder.UnkownProviderTemplate(config.provider).message,
                    timestamp: Date.now(),
                    authMode: '',
                    url: callbackUrl,
                    connectionId
                });

                return wsClient.notifyErr(res, wsClientId, providerConfigKey, connectionId, WSErrBuilder.UnkownProviderTemplate(config.provider));
            }

            const session: OAuthSession = {
                providerConfigKey: providerConfigKey,
                provider: config.provider,
                connectionId: connectionId as string,
                callbackUrl: callbackUrl,
                authMode: template.auth_mode,
                codeVerifier: crypto.randomBytes(24).toString('hex'),
                id: uuid.v1(),
                connectionConfig: connectionConfig,
                accountId: accountId,
                webSocketClientId: wsClientId
            };

            log.sessionId = session.id;

            if (config?.oauth_client_id == null || config?.oauth_client_secret == null || config.oauth_scopes == null) {
                updateAppLogsAndWrite(log, 'error', {
                    content: WSErrBuilder.InvalidProviderConfig(providerConfigKey).message,
                    timestamp: Date.now(),
                    authMode: template.auth_mode,
                    url: callbackUrl,
                    connectionId
                });

                return wsClient.notifyErr(res, wsClientId, providerConfigKey, connectionId, WSErrBuilder.InvalidProviderConfig(providerConfigKey));
            }

            if (template.auth_mode === ProviderAuthModes.OAuth2) {
                return this.oauth2Request(template as ProviderTemplateOAuth2, config, session, res, connectionConfig, callbackUrl, log);
            } else if (template.auth_mode === ProviderAuthModes.OAuth1) {
                return this.oauth1Request(template, config, session, res, callbackUrl, log);
            }

            updateAppLogsAndWrite(log, 'error', {
                content: WSErrBuilder.UnkownAuthMode(template.auth_mode).message,
                timestamp: Date.now(),
                authMode: '',
                url: callbackUrl,
                connectionId
            });

            return wsClient.notifyErr(res, wsClientId, providerConfigKey, connectionId, WSErrBuilder.UnkownAuthMode(template.auth_mode));
        } catch (e) {
            updateAppLogsAndWrite(log, 'error', {
                content: WSErrBuilder.UnkownError().message,
                timestamp: Date.now(),
                authMode: '',
                url: '',
                connectionId
            });

            errorManager.report(e, { accountId: accountId });

            return wsClient.notifyErr(res, wsClientId, providerConfigKey, connectionId, WSErrBuilder.UnkownError());
        }
    }

    private async oauth2Request(
        template: ProviderTemplateOAuth2,
        providerConfig: ProviderConfig,
        session: OAuthSession,
        res: Response,
        connectionConfig: Record<string, string>,
        callbackUrl: string,
        log: LogData
    ) {
        const oauth2Template = template as ProviderTemplateOAuth2;
        const wsClientId = session.webSocketClientId;
        const providerConfigKey = session.providerConfigKey;
        const connectionId = session.connectionId;

        try {
            if (missesInterpolationParam(template.authorization_url, connectionConfig)) {
                updateAppLogsAndWrite(log, 'error', {
                    content: WSErrBuilder.InvalidConnectionConfig(template.authorization_url, JSON.stringify(connectionConfig)).message,
                    timestamp: Date.now(),
                    authMode: template.auth_mode,
                    url: callbackUrl,
                    connectionId,
                    params: {
                        ...connectionConfig
                    }
                });

                return wsClient.notifyErr(
                    res,
                    wsClientId,
                    providerConfigKey,
                    connectionId,
                    WSErrBuilder.InvalidConnectionConfig(template.authorization_url, JSON.stringify(connectionConfig))
                );
            }

            if (missesInterpolationParam(template.token_url, connectionConfig)) {
                updateAppLogsAndWrite(log, 'error', {
                    content: WSErrBuilder.InvalidConnectionConfig(template.token_url, JSON.stringify(connectionConfig)).message,
                    timestamp: Date.now(),
                    authMode: template.auth_mode,
                    url: callbackUrl,
                    connectionId,
                    params: {
                        ...connectionConfig
                    }
                });

                return wsClient.notifyErr(
                    res,
                    wsClientId,
                    providerConfigKey,
                    connectionId,
                    WSErrBuilder.InvalidConnectionConfig(template.token_url, JSON.stringify(connectionConfig))
                );
            }

            if (
                oauth2Template.token_params == undefined ||
                oauth2Template.token_params.grant_type == undefined ||
                oauth2Template.token_params.grant_type == 'authorization_code'
            ) {
                let additionalAuthParams: Record<string, string> = {};
                if (oauth2Template.authorization_params) {
                    additionalAuthParams = oauth2Template.authorization_params;
                }

                // We always implement PKCE, no matter whether the server requires it or not,
                // unless it has been explicitly turned off for this template
                if (!template.disable_pkce) {
                    const h = crypto
                        .createHash('sha256')
                        .update(session.codeVerifier)
                        .digest('base64')
                        .replace(/\+/g, '-')
                        .replace(/\//g, '_')
                        .replace(/=+$/, '');
                    additionalAuthParams['code_challenge'] = h;
                    additionalAuthParams['code_challenge_method'] = 'S256';
                }

                await oAuthSessionService.create(session);

                const simpleOAuthClient = new simpleOauth2.AuthorizationCode(getSimpleOAuth2ClientConfig(providerConfig, template, connectionConfig));

                const authorizationUri = simpleOAuthClient.authorizeURL({
                    redirect_uri: callbackUrl,
                    scope: providerConfig.oauth_scopes.split(',').join(oauth2Template.scope_separator || ' '),
                    state: session.id,
                    ...additionalAuthParams
                });

                updateAppLogsAndWrite(log, 'info', {
                    content: `Redirecting to ${authorizationUri} for ${providerConfigKey} (connection ${connectionId})`,
                    timestamp: Date.now(),
                    providerConfigKey,
                    url: callbackUrl,
                    authMode: template.auth_mode,
                    connectionId,
                    params: {
                        ...additionalAuthParams,
                        ...connectionConfig,
                        grant_type: oauth2Template.token_params?.grant_type as string,
                        scopes: providerConfig.oauth_scopes.split(',').join(oauth2Template.scope_separator || ' '),
                        external_api_url: authorizationUri
                    }
                });

                res.redirect(authorizationUri);
            } else {
                const grantType = oauth2Template.token_params.grant_type;

                updateAppLogsAndWrite(log, 'error', {
                    content: WSErrBuilder.UnkownGrantType(grantType).message,
                    timestamp: Date.now(),
                    authMode: template.auth_mode,
                    url: callbackUrl,
                    connectionId,
                    params: {
                        grant_type: grantType,
                        basic_auth_enabled: template.token_request_auth_method === 'basic',
                        ...connectionConfig
                    }
                });

                return wsClient.notifyErr(res, wsClientId, providerConfigKey, connectionId, WSErrBuilder.UnkownGrantType(grantType));
            }
        } catch (error: any) {
            updateAppLogsAndWrite(log, 'error', {
                content: WSErrBuilder.UnkownError().message + ' ' + error.code ?? '',
                timestamp: Date.now(),
                authMode: template.auth_mode,
                url: callbackUrl,
                connectionId,
                params: {
                    ...connectionConfig
                }
            });

            return wsClient.notifyErr(res, wsClientId, providerConfigKey, connectionId, WSErrBuilder.UnkownError());
        }
    }

    // In OAuth 2 we are guaranteed that the state parameter will be sent back to us
    // for the entire journey. With OAuth 1.0a we have to register the callback URL
    // in a first step and will get called back there. We need to manually include the state
    // param there, otherwise we won't be able to identify the user in the callback
    private async oauth1Request(template: ProviderTemplate, config: ProviderConfig, session: OAuthSession, res: Response, callbackUrl: string, log: LogData) {
        const callbackParams = new URLSearchParams({
            state: session.id
        });
        const wsClientId = session.webSocketClientId;
        const providerConfigKey = session.providerConfigKey;
        const connectionId = session.connectionId;

        const oAuth1CallbackURL = `${callbackUrl}?${callbackParams.toString()}`;

        updateAppLogs(log, 'info', {
            content: `OAuth callback URL was retrieved`,
            timestamp: Date.now(),
            authMode: template.auth_mode,
            providerConfigKey,
            url: oAuth1CallbackURL,
            connectionId
        });

        const oAuth1Client = new OAuth1Client(config, template, oAuth1CallbackURL);

        let tokenResult: OAuth1RequestTokenResult | undefined;
        try {
            tokenResult = await oAuth1Client.getOAuthRequestToken();
        } catch (e) {
            const error = e as { statusCode: number; data?: any };
            errorManager.report(new Error('token_retrieval_error'), { accountId: session.accountId, metadata: error });

            updateAppLogsAndWrite(log, 'error', {
                content: WSErrBuilder.TokenError().message,
                timestamp: Date.now(),
                authMode: template.auth_mode,
                url: oAuth1CallbackURL,
                providerConfigKey,
                connectionId,
                params: {
                    ...error
                }
            });

            return wsClient.notifyErr(res, wsClientId, providerConfigKey, connectionId, WSErrBuilder.TokenError());
        }

        session.requestTokenSecret = tokenResult.request_token_secret;
        await oAuthSessionService.create(session);
        const redirectUrl = oAuth1Client.getAuthorizationURL(tokenResult);

        log.success = true;

        updateAppLogsAndWrite(log, 'info', {
            content: `Request token for ${session.providerConfigKey} (connection: ${session.connectionId}) was a success. Redirecting to: ${redirectUrl}`,
            timestamp: Date.now(),
            authMode: template.auth_mode,
            providerConfigKey,
            url: oAuth1CallbackURL,
            connectionId
        });

        // All worked, let's redirect the user to the authorization page
        return res.redirect(redirectUrl);
    }

    public async oauthCallback(req: Request, res: Response, _: NextFunction) {
        const { state } = req.query;

        const log = {
            level: 'info' as LogLevel,
            success: false,
            action: 'oauth' as LogAction,
            start: Date.now(),
            end: Date.now(),
            timestamp: Date.now(),
            connectionId: '',
            providerConfigKey: '',
            messages: [] as LogData['messages'],
            message: '',
            provider: '',
            sessionId: '',
            merge: true
        };

        if (state == null) {
            const errorMessage = 'No state found in callback';
            const e = new Error(errorMessage);

            updateAppLogsAndWrite(log, 'error', {
                content: WSErrBuilder.MissingConnectionId().message,
                timestamp: Date.now(),
                params: {
                    ...errorManager.getExpressRequestContext(req)
                }
            });

            errorManager.report(e, { metadata: errorManager.getExpressRequestContext(req) });
            return;
        }

        const session = await oAuthSessionService.findById(state as string);

        if (session == null) {
            const errorMessage = `No session found for state: ${state}`;
            const e = new Error(errorMessage);

            updateAppLogsAndWrite(log, 'error', {
                content: errorMessage,
                timestamp: Date.now(),
                params: {
                    ...errorManager.getExpressRequestContext(req)
                }
            });

            errorManager.report(e, { metadata: errorManager.getExpressRequestContext(req) });
            return;
        } else {
            await oAuthSessionService.delete(state as string);
        }

        const wsClientId = session.webSocketClientId;
        const providerConfigKey = session.providerConfigKey;
        const connectionId = session.connectionId;

        try {
            log.connectionId = connectionId;
            log.providerConfigKey = providerConfigKey;

            updateAppLogs(log, 'debug', {
                content: `Received callback from ${session.providerConfigKey} for connection ${session.connectionId}`,
                state: state as string,
                timestamp: Date.now(),
                providerConfigKey,
                url: req.originalUrl,
                connectionId
            });

            log.sessionId = session.id;

            const template = configService.getTemplate(session.provider);
            const config = (await configService.getProviderConfig(session.providerConfigKey, session.accountId))!;

            if (session.authMode === ProviderAuthModes.OAuth2) {
                return this.oauth2Callback(template as ProviderTemplateOAuth2, config, session, req, res, log);
            } else if (session.authMode === ProviderAuthModes.OAuth1) {
                return this.oauth1Callback(template, config, session, req, res, log);
            }

            updateAppLogsAndWrite(log, 'error', {
                content: WSErrBuilder.UnkownAuthMode(session.authMode).message,
                state: state as string,
                timestamp: Date.now(),
                authMode: session.authMode,
                url: req.originalUrl,
                connectionId,
                providerConfigKey
            });

            return wsClient.notifyErr(res, wsClientId, providerConfigKey, connectionId, WSErrBuilder.UnkownAuthMode(session.authMode));
        } catch (e) {
            errorManager.report(e, {
                accountId: session?.accountId,
                metadata: errorManager.getExpressRequestContext(req)
            });

            updateAppLogsAndWrite(log, 'error', {
                content: WSErrBuilder.UnkownError().message,
                connectionId,
                providerConfigKey,
                timestamp: Date.now(),
                params: {
                    ...errorManager.getExpressRequestContext(req)
                }
            });

            return wsClient.notifyErr(res, wsClientId, providerConfigKey, connectionId, WSErrBuilder.UnkownError());
        }
    }

    private async oauth2Callback(template: ProviderTemplateOAuth2, config: ProviderConfig, session: OAuthSession, req: Request, res: Response, log: LogData) {
        const { code } = req.query;
        const providerConfigKey = session.providerConfigKey;
        const connectionId = session.connectionId;
        const wsClientId = session.webSocketClientId;
        const callbackMetadata = getConnectionMetadataFromCallbackRequest(req.query, template);

        if (!code) {
            updateAppLogsAndWrite(log, 'error', {
                content: WSErrBuilder.InvalidCallbackOAuth2().message,
                timestamp: Date.now(),
                connectionId,
                providerConfigKey,
                params: {
                    scopes: config.oauth_scopes,
                    basic_auth_enabled: template.token_request_auth_method === 'basic',
                    token_params: template?.token_params as string
                }
            });

            return wsClient.notifyErr(res, wsClientId, providerConfigKey, connectionId, WSErrBuilder.InvalidCallbackOAuth2());
        }

        const simpleOAuthClient = new simpleOauth2.AuthorizationCode(getSimpleOAuth2ClientConfig(config, template, session.connectionConfig));

        let additionalTokenParams: Record<string, string> = {};
        if (template.token_params !== undefined) {
            // We need to remove grant_type, simpleOAuth2 handles that for us
            const deepCopy = JSON.parse(JSON.stringify(template.token_params));
            additionalTokenParams = deepCopy;
        }

        // We always implement PKCE, no matter whether the server requires it or not,
        // unless it has been explicitly disabled for this provider template
        if (!template.disable_pkce) {
            additionalTokenParams['code_verifier'] = session.codeVerifier;
        }

        const headers: Record<string, string> = {};

        if (template.token_request_auth_method === 'basic') {
            headers['Authorization'] = 'Basic ' + Buffer.from(config.oauth_client_id + ':' + config.oauth_client_secret).toString('base64');
        }

        try {
            let rawCredentials: object;

            updateAppLogs(log, 'info', {
                content: `Initiating token request for ${session.provider} using ${providerConfigKey} for the connection ${connectionId}`,
                timestamp: Date.now(),
                providerConfigKey,
                connectionId,
                params: {
                    ...additionalTokenParams,
                    code: code as string,
                    scopes: config.oauth_scopes,
                    basic_auth_enabled: template.token_request_auth_method === 'basic',
                    token_params: template?.token_params as string
                }
            });

            if (providerClientManager.shouldUseProviderClient(session.provider)) {
                rawCredentials = await providerClientManager.getToken(config, template.token_url, code as string, session.callbackUrl);
            } else {
                const accessToken = await simpleOAuthClient.getToken(
                    {
                        code: code as string,
                        redirect_uri: session.callbackUrl,
                        ...additionalTokenParams
                    },
                    {
                        headers
                    }
                );
                rawCredentials = accessToken.token;
            }

            log.success = true;

            updateAppLogs(log, 'info', {
                content: `Token response was received for ${session.provider} using ${providerConfigKey} for the connection ${connectionId}`,
                timestamp: Date.now(),
                providerConfigKey,
                connectionId
            });

            const tokenMetadata = getConnectionMetadataFromTokenResponse(rawCredentials, template);

            connectionService.upsertConnection(
                connectionId,
                providerConfigKey,
                session.provider,
                rawCredentials,
                ProviderAuthModes.OAuth2,
                session.connectionConfig,
                session.accountId,
                { ...callbackMetadata, ...tokenMetadata }
            );

            if (!log.provider) {
                log.provider = session.provider;
            }

            updateAppLogsAndWrite(log, 'debug', {
                content: `OAuth connection for ${providerConfigKey} was successful`,
                timestamp: Date.now(),
                authMode: template.auth_mode,
                providerConfigKey,
                connectionId,
                params: {
                    ...additionalTokenParams,
                    code: code as string,
                    scopes: config.oauth_scopes,
                    basic_auth_enabled: template.token_request_auth_method === 'basic',
                    token_params: template?.token_params as string
                }
            });

            return wsClient.notifySuccess(res, wsClientId, providerConfigKey, connectionId);
        } catch (e) {
            errorManager.report(e, { accountId: session.accountId });

            updateAppLogsAndWrite(log, 'error', {
                content: WSErrBuilder.UnkownError().message,
                connectionId,
                providerConfigKey,
                timestamp: Date.now()
            });

            return wsClient.notifyErr(res, wsClientId, providerConfigKey, connectionId, WSErrBuilder.UnkownError());
        }
    }

    private oauth1Callback(template: ProviderTemplate, config: ProviderConfig, session: OAuthSession, req: Request, res: Response, log: LogData) {
        const { oauth_token, oauth_verifier } = req.query;
        const providerConfigKey = session.providerConfigKey;
        const connectionId = session.connectionId;
        const wsClientId = session.webSocketClientId;
        const metadata = getConnectionMetadataFromCallbackRequest(req.query, template);

        if (!oauth_token || !oauth_verifier) {
            updateAppLogsAndWrite(log, 'error', {
                content: WSErrBuilder.InvalidCallbackOAuth1().message,
                connectionId,
                providerConfigKey,
                timestamp: Date.now()
            });

            return wsClient.notifyErr(res, wsClientId, providerConfigKey, connectionId, WSErrBuilder.InvalidCallbackOAuth1());
        }

        const oauth_token_secret = session.requestTokenSecret!;

        const oAuth1Client = new OAuth1Client(config, template, '');
        oAuth1Client
            .getOAuthAccessToken(oauth_token as string, oauth_token_secret, oauth_verifier as string)
            .then((accessTokenResult) => {
                connectionService.upsertConnection(
                    connectionId,
                    providerConfigKey,
                    session.provider,
                    accessTokenResult,
                    ProviderAuthModes.OAuth1,
                    session.connectionConfig,
                    session.accountId,
                    metadata
                );

                log.success = true;

                updateAppLogsAndWrite(log, 'info', {
                    content: `OAuth connection for ${providerConfigKey} was successful`,
                    timestamp: Date.now(),
                    authMode: template.auth_mode,
                    url: session.callbackUrl,
                    connectionId
                });

                return wsClient.notifySuccess(res, wsClientId, providerConfigKey, connectionId);
            })
            .catch((e) => {
                errorManager.report(e, { accountId: session.accountId });

                updateAppLogsAndWrite(log, 'error', {
                    content: WSErrBuilder.UnkownError().message,
                    connectionId,
                    providerConfigKey,
                    timestamp: Date.now()
                });

                return wsClient.notifyErr(res, wsClientId, providerConfigKey, connectionId, WSErrBuilder.UnkownError());
            });
    }
}

export default new OAuthController();
