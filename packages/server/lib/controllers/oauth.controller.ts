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
import {
    ProviderConfig,
    ProviderTemplate,
    ProviderTemplateOAuth2,
    ProviderAuthModes,
    OAuthSession,
    OAuth1RequestTokenResult
} from '../models.js';
import logger from '../utils/logger.js';
import type { NextFunction } from 'express';
import errorManager from '../utils/error.manager.js';
import providerClientManager from '../clients/provider.client.js';
import wsClient from '../clients/web-socket.client.js';
import { WSErrBuilder } from '../utils/web-socket-error.js';
import analytics from '../utils/analytics.js';
import cache from '../services/cache.service.js';


class OAuthController {

    public async oauthRequest(req: Request, res: Response, _: NextFunction) {
        let accountId = getAccount(res);
        const { providerConfigKey } = req.params;
        let connectionId = req.query['connection_id'] as string | undefined;
        let wsClientId = req.query['ws_client_id'] as string | undefined;

        try {
            if (!wsClientId) {
                analytics.track('server:pre_ws_oauth', accountId);
            }

            let callbackUrl = await getOauthCallbackUrl(accountId);
            let connectionConfig = req.query['params'] != null ? getConnectionConfig(req.query['params']) : {};

            if (connectionId == null) {
                return wsClient.notifyErr(res, wsClientId, providerConfigKey, connectionId, WSErrBuilder.MissingConnectionId());
            } else if (providerConfigKey == null) {
                return wsClient.notifyErr(res, wsClientId, providerConfigKey, connectionId, WSErrBuilder.MissingProviderConfigKey());
            }
            connectionId = connectionId.toString();

            let config = await configService.getProviderConfig(providerConfigKey, accountId);

            if (config == null) {
                return wsClient.notifyErr(res, wsClientId, providerConfigKey, connectionId, WSErrBuilder.UnknownProviderConfigKey(providerConfigKey));
            }

            let template: ProviderTemplate;
            try {
                template = configService.getTemplate(config.provider);
            } catch {
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
            await cache.set(session.id, session);

            if (config?.oauth_client_id == null || config?.oauth_client_secret == null || config.oauth_scopes == null) {
                return wsClient.notifyErr(res, wsClientId, providerConfigKey, connectionId, WSErrBuilder.InvalidProviderConfig(providerConfigKey));
            }

            logger.info(
                `OAuth request - mode: ${template.auth_mode}, provider: ${config.provider}, key: ${config.unique_key}, connection ID: ${connectionId}, auth URL: ${template.authorization_url}, callback URL: ${callbackUrl}`
            );

            if (template.auth_mode === ProviderAuthModes.OAuth2) {
                return this.oauth2Request(template as ProviderTemplateOAuth2, config, session, res, connectionConfig, callbackUrl);
            } else if (template.auth_mode === ProviderAuthModes.OAuth1) {
                return this.oauth1Request(template, config, session, res, callbackUrl);
            }

            return wsClient.notifyErr(res, wsClientId, providerConfigKey, connectionId, WSErrBuilder.UnkownAuthMode(template.auth_mode));
        } catch (e) {
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
        callbackUrl: string
    ) {
        const oauth2Template = template as ProviderTemplateOAuth2;
        let wsClientId = session.webSocketClientId;
        let providerConfigKey = session.providerConfigKey;
        let connectionId = session.connectionId;

        if (missesInterpolationParam(template.authorization_url, connectionConfig)) {
            return wsClient.notifyErr(
                res,
                wsClientId,
                providerConfigKey,
                connectionId,
                WSErrBuilder.InvalidConnectionConfig(template.authorization_url, JSON.stringify(connectionConfig))
            );
        }

        if (missesInterpolationParam(template.token_url, connectionConfig)) {
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

            return wsClient.notifyErr(res, wsClientId, providerConfigKey, connectionId, WSErrBuilder.UnkownGrantType(grandType));
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
            errorManager.report(new Error('token_retrieval_error'), {
                accountId: session.accountId,
                metadata: e as { statusCode: number; data?: any }
            });
            return wsClient.notifyErr(res, wsClientId, providerConfigKey, connectionId, WSErrBuilder.TokenError());
        }

        const sessionData = await cache.get(session.id) as OAuthSession;
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

        if (state == null) {
            let e = new Error('No state found in callback');
            errorManager.report(e, { metadata: errorManager.getExpressRequestContext(req) });
            throw e;
        }

        const session = await cache.get(state as string) as OAuthSession;

        if (session == null) {
            throw new Error('No session found for state: ' + state);
        } else {
            await cache.delete(state as string);
        }

        let wsClientId = session.webSocketClientId;
        let providerConfigKey = session.providerConfigKey;
        let connectionId = session.connectionId;

        try {
            logger.debug(`Received callback for ${session.providerConfigKey} (connection: ${session.connectionId}) - full callback URI: ${req.originalUrl}"`);

            const template = configService.getTemplate(session.provider);
            const config = (await configService.getProviderConfig(session.providerConfigKey, session.accountId))!;

            logger.info(
                `OAuth callback - mode: ${template.auth_mode}, provider: ${config.provider}, key: ${config.unique_key}, connection ID: ${session.connectionId}`
            );

            if (session.authMode === ProviderAuthModes.OAuth2) {
                return this.oauth2Callback(template as ProviderTemplateOAuth2, config, session, req, res);
            } else if (session.authMode === ProviderAuthModes.OAuth1) {
                return this.oauth1Callback(template, config, session, req, res);
            }

            return wsClient.notifyErr(res, wsClientId, providerConfigKey, connectionId, WSErrBuilder.UnkownAuthMode(session.authMode));
        } catch (e) {
            errorManager.report(e, {
                accountId: session?.accountId,
                metadata: errorManager.getExpressRequestContext(req)
            });
            return wsClient.notifyErr(res, wsClientId, providerConfigKey, connectionId, WSErrBuilder.UnkownError());
        }
    }

    private async oauth2Callback(template: ProviderTemplateOAuth2, config: ProviderConfig, session: OAuthSession, req: Request, res: Response) {
        const { code } = req.query;
        let providerConfigKey = session.providerConfigKey;
        let connectionId = session.connectionId;
        let wsClientId = session.webSocketClientId;
        let callbackMetadata = getConnectionMetadataFromCallbackRequest(req.query, template);

        if (!code) {
            return wsClient.notifyErr(res, wsClientId, providerConfigKey, connectionId, WSErrBuilder.InvalidCallback());
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
            var rawCredentials: object;
            if (providerClientManager.shouldUseProviderClient(session.provider)) {
                rawCredentials = await providerClientManager.getToken(config, code as string);
            } else {
                let accessToken = await simpleOAuthClient.getToken({
                    code: code as string,
                    redirect_uri: session.callbackUrl,
                    ...additionalTokenParams
                });
                rawCredentials = accessToken.token;
            }

            logger.debug(`OAuth 2 for ${providerConfigKey} (connection ${connectionId}) successful.`);

            let tokenMetadata = getConnectionMetadataFromTokenResponse(rawCredentials, template);

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

            return wsClient.notifySuccess(res, wsClientId, providerConfigKey, connectionId);
        } catch (e) {
            errorManager.report(e, { accountId: session.accountId });
            return wsClient.notifyErr(res, wsClientId, providerConfigKey, connectionId, WSErrBuilder.UnkownError());
        }
    }

    private oauth1Callback(template: ProviderTemplate, config: ProviderConfig, session: OAuthSession, req: Request, res: Response) {
        const { oauth_token, oauth_verifier } = req.query;
        let providerConfigKey = session.providerConfigKey;
        let connectionId = session.connectionId;
        let wsClientId = session.webSocketClientId;
        let metadata = getConnectionMetadataFromCallbackRequest(req.query, template);

        if (!oauth_token || !oauth_verifier) {
            return wsClient.notifyErr(res, wsClientId, providerConfigKey, connectionId, WSErrBuilder.InvalidCallback());
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
                return wsClient.notifySuccess(res, wsClientId, providerConfigKey, connectionId);
            })
            .catch((e) => {
                errorManager.report(e, { accountId: session.accountId });
                return wsClient.notifyErr(res, wsClientId, providerConfigKey, connectionId, WSErrBuilder.UnkownError());
            });
    }
}

export default new OAuthController();
