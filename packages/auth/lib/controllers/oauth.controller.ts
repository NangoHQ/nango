import type { Request, Response } from 'express';
import * as crypto from 'node:crypto';
import * as uuid from 'uuid';
import simpleOauth2 from 'simple-oauth2';
import { getSimpleOAuth2ClientConfig } from '../clients/oauth2.client.js';
import { OAuth1Client } from '../clients/oauth1.client.js';
import configService from '../services/config.service.js';
import connectionService from '../services/connection.service.js';
import {
    errorHtml,
    successHtml,
    getOauthCallbackUrl,
    getConnectionConfig,
    getConnectionMetadata,
    missesInterpolationParam,
    getAccount
} from '../utils/utils.js';
import {
    ProviderConfig,
    ProviderTemplate,
    ProviderTemplateOAuth2,
    ProviderAuthModes,
    OAuthSession,
    OAuth1RequestTokenResult,
    OAuthSessionStore
} from '../models.js';
import logger from '../utils/logger.js';
import type { NextFunction } from 'express';
import errorManager from '../utils/error.manager.js';
import providerClientManager from '../clients/provider.client.js';
import webSocketClient, { WSErrType, WSErrParams } from '../clients/web-socket.client.js';

class OAuthController {
    sessionStore: OAuthSessionStore = {};

    templates: { [key: string]: ProviderTemplate } = configService.getTemplates();

    public async oauthRequest(req: Request, res: Response, _: NextFunction) {
        try {
            let accountId = getAccount(res);
            let callbackUrl = await getOauthCallbackUrl(accountId);
            const { providerConfigKey } = req.params;
            let connectionId = req.query['connection_id'] as string;
            let wsClientId = req.query['ws_client_id'] as string;
            let connectionConfig = req.query['params'] != null ? getConnectionConfig(req.query['params']) : {};

            if (connectionId == null) {
                webSocketClient.notifyError(wsClientId, providerConfigKey, connectionId, WSErrType.MissingConnectionId);
                return errorHtml(res);
            } else if (providerConfigKey == null) {
                webSocketClient.notifyError(wsClientId, providerConfigKey, connectionId, WSErrType.NoProviderConfigKey);
                return errorHtml(res);
            }
            connectionId = connectionId.toString();

            let config = await configService.getProviderConfig(providerConfigKey, accountId);

            if (config == null) {
                webSocketClient.notifyError(wsClientId, providerConfigKey, connectionId, WSErrType.NoProviderConfigKey, {
                    [WSErrParams.ProviderKey]: providerConfigKey
                });
                return errorHtml(res);
            }

            let template: ProviderTemplate;
            try {
                template = this.templates[config.provider]!;
            } catch {
                webSocketClient.notifyError(wsClientId, providerConfigKey, connectionId, WSErrType.UnkownConfigKey, {
                    [WSErrParams.ProviderKey]: providerConfigKey
                });
                return errorHtml(res);
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
            this.sessionStore[session.id] = session;

            if (config?.oauth_client_id == null || config?.oauth_client_secret == null || config.oauth_scopes == null) {
                webSocketClient.notifyError(wsClientId, providerConfigKey, connectionId, WSErrType.ProviderConfig, {
                    [WSErrParams.ProviderKey]: providerConfigKey
                });
                return errorHtml(res);
            }

            logger.info(
                `OAuth request - mode: ${template.auth_mode}, provider: ${config.provider}, key: ${config.unique_key}, connection ID: ${connectionId}, auth URL: ${template.authorization_url}, callback URL: ${callbackUrl}`
            );

            if (template.auth_mode === ProviderAuthModes.OAuth2) {
                return this.oauth2Request(template as ProviderTemplateOAuth2, config, session, res, connectionConfig, callbackUrl);
            } else if (template.auth_mode === ProviderAuthModes.OAuth1) {
                return this.oauth1Request(template, config, session, res, callbackUrl);
            }

            webSocketClient.notifyError(wsClientId, providerConfigKey, connectionId, WSErrType.AuthMode, {
                [WSErrParams.AuthMode]: template.auth_mode
            });
            return errorHtml(res);
        } catch (e) {
            errorManager.report(e, getAccount(res));
            return errorHtml(res);
        }
    }

    private async oauth2Request(
        template: ProviderTemplateOAuth2,
        providerConfig: ProviderConfig,
        session: OAuthSession,
        res: Response,
        connectionConfig: Record<string, string>,
        callbackUrl: string
    ) {
        const oauth2Template = template as ProviderTemplateOAuth2;
        let wsClientId = session.webSocketClientId;
        let providerConfigKey = session.providerConfigKey;
        let connectionId = session.connectionId;

        if (missesInterpolationParam(template.authorization_url, connectionConfig)) {
            webSocketClient.notifyError(wsClientId, providerConfigKey, connectionId, WSErrType.UrlParam, {
                [WSErrParams.Url]: template.authorization_url,
                [WSErrParams.ConnectionConfig]: JSON.stringify(connectionConfig)
            });
            return errorHtml(res);
        }

        if (missesInterpolationParam(template.token_url, connectionConfig)) {
            webSocketClient.notifyError(wsClientId, providerConfigKey, connectionId, WSErrType.UrlParam, {
                [WSErrParams.Url]: template.token_url,
                [WSErrParams.ConnectionConfig]: JSON.stringify(connectionConfig)
            });
            return errorHtml(res);
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
                const h = crypto.createHash('sha256').update(session.codeVerifier).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
                additionalAuthParams['code_challenge'] = h;
                additionalAuthParams['code_challenge_method'] = 'S256';
            }

            const simpleOAuthClient = new simpleOauth2.AuthorizationCode(getSimpleOAuth2ClientConfig(providerConfig, template, connectionConfig));
            const authorizationUri = simpleOAuthClient.authorizeURL({
                redirect_uri: callbackUrl,
                scope: providerConfig.oauth_scopes.split(',').join(oauth2Template.scope_separator || ' '),
                state: session.id,
                ...additionalAuthParams
            });

            logger.debug(`OAuth 2.0 for ${providerConfigKey} (connection ${connectionId}) - redirecting to: ${authorizationUri}`);

            res.redirect(authorizationUri);
        } else {
            let grandType = oauth2Template.token_params.grant_type;

            webSocketClient.notifyError(wsClientId, providerConfigKey, connectionId, WSErrType.GrantType, {
                [WSErrParams.GrantType]: grandType
            });
            return errorHtml(res);
        }
    }

    // In OAuth 2 we are guaranteed that the state parameter will be sent back to us
    // for the entire journey. With OAuth 1.0a we have to register the callback URL
    // in a first step and will get called back there. We need to manually include the state
    // param there, otherwise we won't be able to identify the user in the callback
    private async oauth1Request(template: ProviderTemplate, config: ProviderConfig, session: OAuthSession, res: Response, callbackUrl: string) {
        const callbackParams = new URLSearchParams({
            state: session.id
        });
        let wsClientId = session.webSocketClientId;
        let providerConfigKey = session.providerConfigKey;
        let connectionId = session.connectionId;

        const oAuth1CallbackURL = `${callbackUrl}?${callbackParams.toString()}`;

        const oAuth1Client = new OAuth1Client(config, template, oAuth1CallbackURL);

        let tokenResult: OAuth1RequestTokenResult | undefined;
        try {
            tokenResult = await oAuth1Client.getOAuthRequestToken();
        } catch (e) {
            errorManager.report(e, session.accountId);
            webSocketClient.notifyError(wsClientId, providerConfigKey, connectionId, WSErrType.RequestToken, {
                [WSErrParams.Error]: JSON.stringify(e, undefined, 2)
            });
            return errorHtml(res);
        }

        const sessionData = this.sessionStore[session.id]!;
        sessionData.request_token_secret = tokenResult.request_token_secret;
        const redirectUrl = oAuth1Client.getAuthorizationURL(tokenResult);

        logger.debug(
            `OAuth 1.0a for ${session.providerConfigKey} (connection: ${session.connectionId}). Request token success. Redirecting to: ${redirectUrl}`
        );

        // All worked, let's redirect the user to the authorization page
        return res.redirect(redirectUrl);
    }

    public async oauthCallback(req: Request, res: Response, _: NextFunction) {
        const { state } = req.query;
        const session: OAuthSession = this.sessionStore[state as string] as OAuthSession;

        let wsClientId = session.webSocketClientId;
        let providerConfigKey = session.providerConfigKey;
        let connectionId = session.connectionId;

        try {
            delete this.sessionStore[state as string];

            if (state == null || session == null || session.providerConfigKey == null) {
                webSocketClient.notifyError(wsClientId, providerConfigKey, connectionId, WSErrType.State, {
                    [WSErrParams.State]: (state as string) || ''
                });
                return errorHtml(res);
            }

            logger.debug(`Received callback for ${session.providerConfigKey} (connection: ${session.connectionId}) - full callback URI: ${req.originalUrl}"`);

            const template = this.templates[session.provider]!;
            const config = (await configService.getProviderConfig(session.providerConfigKey, session.accountId))!;

            logger.info(
                `OAuth callback - mode: ${template.auth_mode}, provider: ${config.provider}, key: ${config.unique_key}, connection ID: ${session.connectionId}`
            );

            if (session.authMode === ProviderAuthModes.OAuth2) {
                return this.oauth2Callback(template as ProviderTemplateOAuth2, config, session, req, res);
            } else if (session.authMode === ProviderAuthModes.OAuth1) {
                return this.oauth1Callback(template, config, session, req, res);
            }

            webSocketClient.notifyError(wsClientId, providerConfigKey, connectionId, WSErrType.AuthMode, {
                [WSErrParams.AuthMode]: session.authMode
            });
            return errorHtml(res);
        } catch (e) {
            errorManager.report(e, session != null ? session.accountId : undefined);
            return errorHtml(res);
        }
    }

    private async oauth2Callback(template: ProviderTemplateOAuth2, config: ProviderConfig, session: OAuthSession, req: Request, res: Response) {
        const { code } = req.query;
        let providerConfigKey = session.providerConfigKey;
        let connectionId = session.connectionId;
        let wsClientId = session.webSocketClientId;
        let metadata = getConnectionMetadata(req.query, template);

        if (!code) {
            webSocketClient.notifyError(wsClientId, providerConfigKey, connectionId, WSErrType.Callback, {
                [WSErrParams.Error]: JSON.stringify(req.query)
            });
            return errorHtml(res);
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

        try {
            var token: object;
            if (providerClientManager.shouldUseProviderClient(session.provider)) {
                token = await providerClientManager.getToken(config, code as string);
            } else {
                let accessToken = await simpleOAuthClient.getToken({
                    code: code as string,
                    redirect_uri: session.callbackUrl,
                    ...additionalTokenParams
                });
                token = accessToken.token;
            }

            logger.debug(`OAuth 2 for ${providerConfigKey} (connection ${connectionId}) successful.`);

            connectionService.upsertConnection(
                connectionId,
                providerConfigKey,
                session.provider,
                token,
                ProviderAuthModes.OAuth2,
                session.connectionConfig,
                session.accountId,
                metadata
            );

            webSocketClient.notifySuccess(wsClientId, providerConfigKey, connectionId);
            return successHtml(res);
        } catch (e) {
            errorManager.report(e, session ? session.accountId : undefined);

            webSocketClient.notifyError(wsClientId, providerConfigKey, connectionId, WSErrType.Token, {
                [WSErrParams.Error]: JSON.stringify(e)
            });
            return errorHtml(res);
        }
    }

    private oauth1Callback(template: ProviderTemplate, config: ProviderConfig, session: OAuthSession, req: Request, res: Response) {
        const { oauth_token, oauth_verifier } = req.query;
        let providerConfigKey = session.providerConfigKey;
        let connectionId = session.connectionId;
        let wsClientId = session.webSocketClientId;
        let metadata = getConnectionMetadata(req.query, template);

        if (!oauth_token || !oauth_verifier) {
            webSocketClient.notifyError(wsClientId, providerConfigKey, connectionId, WSErrType.Callback, {
                [WSErrParams.Error]: JSON.stringify(req.query)
            });
            return errorHtml(res);
        }

        const oauth_token_secret = session.request_token_secret!;

        const oAuth1Client = new OAuth1Client(config, template, '');
        oAuth1Client
            .getOAuthAccessToken(oauth_token as string, oauth_token_secret, oauth_verifier as string)
            .then((accessTokenResult) => {
                logger.debug(`OAuth 1.0a for ${providerConfigKey} (connection: ${connectionId}) successful.`);

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
                webSocketClient.notifySuccess(wsClientId, providerConfigKey, connectionId);
                return successHtml(res);
            })
            .catch((e) => {
                errorManager.report(e, session.accountId);
                webSocketClient.notifyError(wsClientId, providerConfigKey, connectionId, WSErrType.Token, {
                    [WSErrParams.Error]: JSON.stringify(e)
                });
                return errorHtml(res);
            });
    }
}

export default new OAuthController();
