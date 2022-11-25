import type { Request, Response } from 'express';
import * as crypto from 'node:crypto';
import * as uuid from 'uuid';
import simpleOauth2 from 'simple-oauth2';
import { getSimpleOAuth2ClientConfig } from '../oauth2.client.js';
import { PizzlyOAuth1Client } from '../oauth1.client.js';
import integrationsManager from '../services/config.service.js';
import connectionsManager from '../services/connection.service.js';
import { html, getOauthCallbackUrl } from '../utils/utils.js';
import {
    IntegrationConfig,
    IntegrationTemplate,
    IntegrationTemplateOAuth2,
    IntegrationAuthModes,
    OAuthSession,
    OAuth1RequestTokenResult,
    OAuthSessionStore
} from '../models.js';
import logger from '../utils/logger.js';

class OAuthController {
    sessionStore: OAuthSessionStore = {};
    errDesc = {
        missing_connection_id: () => 'Missing connectionId.',
        missing_integration: () => 'Missing integration unique key.',
        unknown_integration: (integrationKey: string) => `No config for the integration "${integrationKey}".`,
        integration_config_err: (integrationKey: string) => `Config for integration "${integrationKey}" is missing params (cliend ID, secret and/or scopes).`,
        grant_type_err: (grantType: string) => `The grant type "${grantType}" is not supported by this OAuth flow.`,
        req_token_err: (error: string) => `Error in the request token step of the OAuth 1.0a flow. Error: ${error}`,
        auth_mode_err: (auth_mode: string) => `Auth mode ${auth_mode}not supported.`,
        state_err: (state: string) => `Invalid state parameter passed in the callback: ${state}`,
        token_err: (err: string) => `Error storing/retrieving token: ${err}.`,
        callback_err: (err: string) => `Did not get oauth_token and/or oauth_verifier in the callback: ${err}.`
    };
    callbackUrl = getOauthCallbackUrl();

    public async oauthRequest(req: Request, res: Response) {
        const { integrationKey } = req.params;
        let connectionId = req.query['connection_id'];
        connectionId = connectionId as string;

        if (connectionId == null) {
            return html(logger, res, integrationKey, connectionId, 'missing_connection_id', this.errDesc['missing_connection_id']());
        } else if (integrationKey == null) {
            return html(logger, res, integrationKey, connectionId, 'missing_integration', this.errDesc['missing_integration']());
        }
        connectionId = connectionId.toString();

        let integrationConfig = await integrationsManager.getIntegrationConfig(integrationKey);

        let integrationTemplate: IntegrationTemplate;
        try {
            integrationTemplate = integrationsManager.getIntegrationTemplate(integrationConfig!.type);
        } catch {
            return html(logger, res, integrationKey, connectionId, 'unknown_integration', this.errDesc['unknown_integration'](integrationKey));
        }

        const session: OAuthSession = {
            integrationKey: integrationKey,
            connectionId: connectionId as string,
            callbackUrl: this.callbackUrl,
            authMode: integrationTemplate.auth_mode,
            codeVerifier: crypto.randomBytes(24).toString('hex'),
            id: uuid.v1()
        };
        this.sessionStore[session.id] = session;

        if (integrationConfig?.oauth_client_id == null || integrationConfig?.oauth_client_secret == null || integrationConfig.oauth_scopes == null) {
            return html(logger, res, integrationKey, connectionId, 'integration_config_err', this.errDesc['integration_config_err'](integrationKey));
        }

        if (integrationTemplate.auth_mode === IntegrationAuthModes.OAuth2) {
            return this.oauth2Request(integrationTemplate, integrationConfig, session, res);
        } else if (integrationTemplate.auth_mode === IntegrationAuthModes.OAuth1) {
            return this.oauth1Request(integrationTemplate, integrationConfig, session, res);
        }

        let authMode = integrationTemplate.auth_mode;
        return html(logger, res, integrationKey, connectionId, 'auth_mode_err', this.errDesc['auth_mode_err'](authMode));
    }

    private oauth2Request(integrationTemplate: IntegrationTemplate, config: IntegrationConfig, session: OAuthSession, res: any) {
        const template = integrationTemplate as IntegrationTemplateOAuth2;

        if (template.token_params == undefined || template.token_params.grant_type == undefined || template.token_params.grant_type == 'authorization_code') {
            let additionalAuthParams: Record<string, string> = {};
            if (template.authorization_params) {
                additionalAuthParams = template.authorization_params;
            }

            // We always implement PKCE, no matter whether the server requires it or not
            const h = crypto.createHash('sha256').update(session.codeVerifier).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
            additionalAuthParams['code_challenge'] = h;
            additionalAuthParams['code_challenge_method'] = 'S256';

            const simpleOAuthClient = new simpleOauth2.AuthorizationCode(getSimpleOAuth2ClientConfig(config, integrationTemplate));
            const authorizationUri = simpleOAuthClient.authorizeURL({
                redirect_uri: this.callbackUrl,
                scope: config.oauth_scopes,
                state: session.id,
                ...additionalAuthParams
            });

            logger.debug(`OAuth 2.0 for ${session.integrationKey} (connection ${session.connectionId}) - redirecting to: ${authorizationUri}`);

            res.redirect(authorizationUri);
        } else {
            let grandType = template.token_params.grant_type;
            return html(logger, res, session.integrationKey, session.connectionId, 'grant_type_err', this.errDesc['grant_type_err'](grandType));
        }
    }

    // In OAuth 2 we are guaranteed that the state parameter will be sent back to us
    // for the entire journey. With OAuth 1.0a we have to register the callback URL
    // in a first step and will get called back there. We need to manually include the state
    // param there, otherwise we won't be able to identify the user in the callback
    private async oauth1Request(template: IntegrationTemplate, config: IntegrationConfig, session: OAuthSession, res: any) {
        const callbackParams = new URLSearchParams({
            state: session.id
        });
        const oAuth1CallbackURL = `${this.callbackUrl}?${callbackParams.toString()}`;

        const oAuth1Client = new PizzlyOAuth1Client(config, template, oAuth1CallbackURL);

        let tokenResult: OAuth1RequestTokenResult | undefined;
        try {
            tokenResult = await oAuth1Client.getOAuthRequestToken();
        } catch (error) {
            let errStr = JSON.stringify(error, undefined, 2);
            return html(logger, res, session.integrationKey, session.connectionId as string, 'req_token_err', this.errDesc['req_token_err'](errStr));
        }

        const sessionData = this.sessionStore[session.id]!;
        sessionData.request_token_secret = tokenResult.request_token_secret;
        const redirectUrl = oAuth1Client.getAuthorizationURL(tokenResult);

        logger.debug(`OAuth 1.0a for ${session.integrationKey} (connection: ${session.connectionId}). Request token success. Redirecting to: ${redirectUrl}`);

        // All worked, let's redirect the user to the authorization page
        return res.redirect(redirectUrl);
    }

    public async oauthCallback(req: Request, res: Response) {
        const { state } = req.query;
        const session: OAuthSession = this.sessionStore[state as string] as OAuthSession;
        delete this.sessionStore[state as string];

        if (state == null || session == null || session.integrationKey == null) {
            let stateStr = (state as string) || '';
            return html(logger, res, session.integrationKey, session.connectionId, 'state_err', this.errDesc['state_err'](stateStr));
        }

        logger.debug(`Received callback for ${session.integrationKey} (connection: ${session.connectionId}) - full callback URI: ${req.originalUrl}"`);

        const integrationTemplate = integrationsManager.getIntegrationTemplate(session.integrationKey);
        const integrationConfig = await integrationsManager.getIntegrationConfig(session.integrationKey);

        if (session.authMode === IntegrationAuthModes.OAuth2) {
            return this.oauth2Callback(integrationTemplate, integrationConfig!, session, req, res);
        } else if (session.authMode === IntegrationAuthModes.OAuth1) {
            return this.oauth1Callback(integrationTemplate, integrationConfig!, session, req, res);
        }

        return html(logger, res, session.integrationKey, session.connectionId, 'auth_mode_err', this.errDesc['auth_mode_err'](session.authMode));
    }

    private async oauth2Callback(template: IntegrationTemplate, config: IntegrationConfig, session: OAuthSession, req: any, res: any) {
        const { code } = req.query;
        let integrationKey = session.integrationKey;
        let connectionId = session.connectionId;

        if (!code) {
            let errStr = JSON.stringify(req.query);
            return html(logger, res, integrationKey, connectionId, 'callback_err', this.errDesc['callback_err'](errStr));
        }

        const simpleOAuthClient = new simpleOauth2.AuthorizationCode(getSimpleOAuth2ClientConfig(config, template));

        let additionalTokenParams: Record<string, string> = {};
        if (template.token_params !== undefined) {
            // We need to remove grant_type, simpleOAuth2 handles that for us
            const deepCopy = JSON.parse(JSON.stringify(template.token_params));
            delete deepCopy.grant_type;
            additionalTokenParams = deepCopy;
        }

        // We always implement PKCE, no matter whether the server requires it or not
        additionalTokenParams['code_verifier'] = session.codeVerifier;

        try {
            const accessToken = await simpleOAuthClient.getToken({
                code: code as string,
                redirect_uri: session.callbackUrl,
                ...additionalTokenParams
            });

            logger.debug(`OAuth 2 for ${integrationKey} (connection ${connectionId}) successful.`);

            connectionsManager.upsertConnection(connectionId, integrationKey, accessToken.token, IntegrationAuthModes.OAuth2);

            return html(logger, res, integrationKey, connectionId, '', '');
        } catch (e) {
            return html(logger, res, integrationKey, connectionId, 'token_err', this.errDesc['token_err'](JSON.stringify(e)));
        }
    }

    private oauth1Callback(template: IntegrationTemplate, config: IntegrationConfig, session: OAuthSession, req: any, res: any) {
        const { oauth_token, oauth_verifier } = req.query;
        let integrationKey = session.integrationKey;
        let connectionId = session.connectionId;

        if (!oauth_token || !oauth_verifier) {
            let errStr = JSON.stringify(req.query);
            return html(logger, res, integrationKey, connectionId, 'callback_err', this.errDesc['callback_err'](errStr));
        }

        const oauth_token_secret = session.request_token_secret!;

        const oAuth1Client = new PizzlyOAuth1Client(config, template, '');
        oAuth1Client
            .getOAuthAccessToken(oauth_token as string, oauth_token_secret, oauth_verifier as string)
            .then((accessTokenResult) => {
                logger.debug(`OAuth 1.0a for ${integrationKey} (connection: ${connectionId}) successful.`);

                connectionsManager.upsertConnection(connectionId, integrationKey, accessTokenResult, IntegrationAuthModes.OAuth1);
                return html(logger, res, integrationKey, connectionId, '', '');
            })
            .catch((e) => {
                let errStr = JSON.stringify(e);
                return html(logger, res, integrationKey, connectionId, 'token_err', this.errDesc['token_err'](errStr));
            });
    }
}

export default new OAuthController();
