/*
 * Copyright (c) 2022 Nango, all rights reserved.
 */

import * as crypto from 'node:crypto';
import express from 'express';
import * as uuid from 'uuid';
import simpleOauth2 from 'simple-oauth2';
import { IntegrationTemplateOAuth2, IntegrationAuthModes, OAuthSession, OAuthSessionStore, OAuth1RequestTokenResult } from './types.js';
import { getSimpleOAuth2ClientConfig } from './oauth2.client.js';
import { PizzlyOAuth1Client } from './oauth1.client.js';
import logger from './logger.js';
import integrationsManager from './integrations.manager.js';
import connectionsManager from './connections.manager.js';
import type { IntegrationTemplate } from './types.js';
import db from './database.js';
import type { Integration } from './integration.model.js';
import { html } from './utils.js';

// A simple HTTP(S) server that implements an OAuth 1.0a and OAuth 2.0 dance
// Yes the code is not very beautiful but IMHO this reflects OAuth:
// It is not rocket science, but 100 things can go wrong in 100 different places.
// At least this implementation is all in 2 files + 2 libraries, there is worse out there :)
//
// If you land here because you are debugging an OAuth flow with Pizzly I highly recommend you
// set main_server_log_level = debug if you have not done so and try again. It prints tons
// of useful stuff for you.
//
// If you are debuggig an issue with OAuth 2.0 also set the env variable
// DEBUG=*simple-oauth2*
// This prints additional useful details.

class PizzlyServer {
    port: number;
    callbackUrl: string;
    sessionStore: OAuthSessionStore = {};
    app = express();
    errDesc = {
        missing_connection_id: () => 'Missing connectionId.',
        missing_integration: () => 'Missing integration unique key.',
        unknown_integration: (integrationName: string) => `No config for the integration "${integrationName}".`,
        integration_config_err: (integrationName: string) => `Config for integration "${integrationName}" is missing params (cliend ID, secret and/or scopes).`,
        grant_type_err: (grantType: string) => `The grant type "${grantType}" is not supported by this OAuth flow.`,
        req_token_err: (error: string) => `Error in the request token step of the OAuth 1.0a flow. Error: ${error}`,
        auth_mode_err: (auth_mode: string) => `Auth mode ${auth_mode}not supported.`,
        state_err: (state: string) => `Invalid state parameter passed in the callback: ${state}`,
        token_err: (err: string) => `Error storing/retrieving token: ${err}.`,
        callback_err: (err: string) => `Did not get oauth_token and/or oauth_verifier in the callback: ${err}.`
    };

    constructor() {
        this.port = this.port = 3003; // TODO: uncomment -> process.env['PORT'] || 3004;
        this.callbackUrl = (process.env['HOST'] || `http://localhost:${this.port}`) + '/oauth/callback';
    }

    start() {
        this.app.get('/oauth/connect/:integrationName', async (req, res) => {
            return this.oauthRequest(req, res);
        });

        this.app.get('/oauth/callback', async (req, res) => {
            return this.oauthCallback(req, res);
        });

        this.app.listen(this.port);

        logger.info(`OAuth server started, listening on port ${this.port}. OAuth callback URL: ${this.callbackUrl}`);
    }

    async oauthRequest(req: any, res: any) {
        const { integrationName } = req.params;
        let { connectionId } = req.query;
        connectionId = connectionId as string;

        if (!connectionId) {
            return html(logger, res, integrationName, connectionId, 'missing_connection_id', this.errDesc['missing_connection_id']());
        } else if (!integrationName) {
            return html(logger, res, integrationName, connectionId, 'missing_integration', this.errDesc['missing_integration']());
        }
        connectionId = connectionId.toString();

        let integrationConfig = await integrationsManager.getIntegrationConfig(integrationName);

        let integrationTemplate: IntegrationTemplate;
        try {
            integrationTemplate = integrationsManager.getIntegrationTemplate(integrationConfig!.type);
        } catch {
            return html(logger, res, integrationName, connectionId, 'unknown_integration', this.errDesc['unknown_integration'](integrationName));
        }

        const session: OAuthSession = {
            integrationName: integrationName,
            connectionId: connectionId as string,
            callbackUrl: this.callbackUrl,
            authMode: integrationTemplate.auth_mode,
            codeVerifier: crypto.randomBytes(24).toString('hex'),
            id: uuid.v1()
        };
        this.sessionStore[session.id] = session;

        if (integrationConfig?.oauth_client_id == null || integrationConfig?.oauth_client_secret == null || integrationConfig.oauth_scopes == null) {
            return html(logger, res, integrationName, connectionId, 'integration_config_err', this.errDesc['integration_config_err'](integrationName));
        }

        if (integrationTemplate.auth_mode === IntegrationAuthModes.OAuth2) {
            return this.oauth2Request(integrationTemplate, integrationConfig, session, res);
        } else if (integrationTemplate.auth_mode === IntegrationAuthModes.OAuth1) {
            return this.oauth1Request(integrationTemplate, integrationConfig, session, res);
        }

        let authMode = integrationTemplate.auth_mode;
        return html(logger, res, integrationName, connectionId, 'auth_mode_err', this.errDesc['auth_mode_err'](authMode));
    }

    oauth2Request(integrationTemplate: IntegrationTemplate, config: Integration, session: OAuthSession, res: any) {
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

            logger.debug(`OAuth 2.0 for ${session.integrationName} (connection ${session.connectionId}) - redirecting to: ${authorizationUri}`);

            res.redirect(authorizationUri);
        } else {
            let grandType = template.token_params.grant_type;
            return html(logger, res, session.integrationName, session.connectionId, 'grant_type_err', this.errDesc['grant_type_err'](grandType));
        }
    }

    // In OAuth 2 we are guaranteed that the state parameter will be sent back to us
    // for the entire journey. With OAuth 1.0a we have to register the callback URL
    // in a first step and will get called back there. We need to manually include the state
    // param there, otherwise we won't be able to identify the user in the callback
    async oauth1Request(template: IntegrationTemplate, config: Integration, session: OAuthSession, res: any) {
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
            return html(logger, res, session.integrationName, session.connectionId as string, 'req_token_err', this.errDesc['req_token_err'](errStr));
        }

        const sessionData = this.sessionStore[session.id]!;
        sessionData.request_token_secret = tokenResult.request_token_secret;
        const redirectUrl = oAuth1Client.getAuthorizationURL(tokenResult);

        logger.debug(`OAuth 1.0a for ${session.integrationName} (connection: ${session.connectionId}). Request token success. Redirecting to: ${redirectUrl}`);

        // All worked, let's redirect the user to the authorization page
        return res.redirect(redirectUrl);
    }

    async oauthCallback(req: any, res: any) {
        const { state } = req.query;
        const session: OAuthSession = this.sessionStore[state as string] as OAuthSession;
        delete this.sessionStore[state as string];

        if (state == null || session == null || session.integrationName == null) {
            let stateStr = (state as string) || '';
            return html(logger, res, session.integrationName, session.connectionId, 'state_err', this.errDesc['state_err'](stateStr));
        }

        logger.debug(`Received callback for ${session.integrationName} (connection: ${session.connectionId}) - full callback URI: ${req.originalUrl}"`);

        const integrationTemplate = integrationsManager.getIntegrationTemplate(session.integrationName);
        const integrationConfig = await integrationsManager.getIntegrationConfig(session.integrationName);

        if (session.authMode === IntegrationAuthModes.OAuth2) {
            return this.oauth2Callback(integrationTemplate, integrationConfig!, session, req, res);
        } else if (session.authMode === IntegrationAuthModes.OAuth1) {
            return this.oauth1Callback(integrationTemplate, integrationConfig!, session, req, res);
        }

        return html(logger, res, session.integrationName, session.connectionId, 'auth_mode_err', this.errDesc['auth_mode_err'](session.authMode));
    }

    async oauth2Callback(template: IntegrationTemplate, config: Integration, session: OAuthSession, req: any, res: any) {
        const { code } = req.query;
        let integrationName = session.integrationName;
        let connectionId = session.connectionId;

        if (!code) {
            let errStr = JSON.stringify(req.query);
            return html(logger, res, integrationName, connectionId, 'callback_err', this.errDesc['callback_err'](errStr));
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

            logger.debug(`OAuth 2 for ${integrationName} (connection ${connectionId}) successful.`);

            connectionsManager.upsertConnection(connectionId, integrationName, accessToken.token, IntegrationAuthModes.OAuth2);

            return html(logger, res, integrationName, connectionId, '', '');
        } catch (e) {
            return html(logger, res, integrationName, connectionId, 'token_err', this.errDesc['token_err'](JSON.stringify(e)));
        }
    }

    oauth1Callback(template: IntegrationTemplate, config: Integration, session: OAuthSession, req: any, res: any) {
        const { oauth_token, oauth_verifier } = req.query;
        let integrationName = session.integrationName;
        let connectionId = session.connectionId;

        if (!oauth_token || !oauth_verifier) {
            let errStr = JSON.stringify(req.query);
            return html(logger, res, integrationName, connectionId, 'callback_err', this.errDesc['callback_err'](errStr));
        }

        const oauth_token_secret = session.request_token_secret!;

        const oAuth1Client = new PizzlyOAuth1Client(config, template, '');
        oAuth1Client
            .getOAuthAccessToken(oauth_token as string, oauth_token_secret, oauth_verifier as string)
            .then((accessTokenResult) => {
                logger.debug(`OAuth 1.0a for ${integrationName} (connection: ${connectionId}) successful.`);

                connectionsManager.upsertConnection(connectionId, integrationName, accessTokenResult, IntegrationAuthModes.OAuth1);
                return html(logger, res, integrationName, connectionId, '', '');
            })
            .catch((e) => {
                let errStr = JSON.stringify(e);
                return html(logger, res, integrationName, connectionId, 'token_err', this.errDesc['token_err'](errStr));
            });
    }
}

await db.knex.raw(`CREATE SCHEMA IF NOT EXISTS ${db.schema()}`);
await db.migrate(process.env['PIZZLY_DB_MIGRATION_FOLDER'] || './lib/db/migrations');
new PizzlyServer().start();
