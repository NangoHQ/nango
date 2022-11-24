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
import { interpolateString } from './utils.js';
import type winston from 'winston';
import logger from './logger.js';
import integrationsManager from './integrations.manager.js';
import connectionsManager from './connections.manager.js';
import type { IntegrationTemplate } from './types.js';
import db from './database.js';

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

export function startOAuthServer() {
    const errDesc = {
        missing_connection_id: () => 'Missing connectionId.',
        missing_integration: () => 'Missing integration unique key.',
        unknown_integration: (integrationName: string) => `No config for the integration "${integrationName}".`,
        integration_config_err: (integrationName: string) => `Config for integration "${integrationName}" is missing params (cliend ID, secret and/or scopes).`,
        grant_type_err: (grantType: string) => `The grant type "${grantType}" is not supported by this OAuth flow.`,
        oauth1_request_token: (error: string) => `Error in the request token step of the OAuth 1.0a flow. Error: ${error}`,
        auth_mode_err: (auth_mode: string) => `Auth mode ${auth_mode}not supported.`,
        state_err: (state: string) => `Invalid state parameter passed in the callback: ${state}`,
        token_err: (err: string) => `Error storing/retrieving token: ${err}.`,
        callback_err: (err: string) => `Did not get oauth_token and/or oauth_verifier in the callback: ${err}.`
    };

    const port = 3003; // TODO: uncomment -> process.env['PORT'] || 3004;
    const oAuthCallbackUrl = (process.env['HOST'] || `http://localhost:${port}`) + '/oauth/callback';

    app.get('/oauth/connect/:integrationName', async (req, res) => {
        const { integrationName } = req.params;
        let { connectionId } = req.query;
        connectionId = connectionId as string;

        if (!connectionId) {
            return sendResultHTML(logger, res, integrationName, connectionId, 'missing_connection_id', errDesc['missing_connection_id']());
        } else if (!integrationName) {
            return sendResultHTML(logger, res, integrationName, connectionId, 'missing_integration', errDesc['missing_integration']());
        }
        connectionId = connectionId.toString();

        let integrationConfig = await integrationsManager.getIntegrationConfig(integrationName);

        let integrationTemplate: IntegrationTemplate;
        try {
            integrationTemplate = integrationsManager.getIntegrationTemplate(integrationConfig!.type);
        } catch {
            return sendResultHTML(logger, res, integrationName, connectionId, 'unknown_integration', errDesc['unknown_integration'](integrationName));
        }

        const authState = uuid.v1();
        const sessionData = {
            integrationName: integrationName,
            connectionId: connectionId as string,
            callbackUrl: oAuthCallbackUrl,
            authMode: integrationTemplate.auth_mode,
            codeVerifier: crypto.randomBytes(24).toString('hex')
        };
        sessionStore[authState] = sessionData;

        if (integrationConfig?.oauth_client_id == null || integrationConfig?.oauth_client_secret == null || integrationConfig.oauth_scopes == null) {
            return sendResultHTML(logger, res, integrationName, connectionId, 'integration_config_err', errDesc['integration_config_err'](integrationName));
        }

        if (integrationTemplate.auth_mode === IntegrationAuthModes.OAuth2) {
            const oAuth2AuthConfig = integrationTemplate as IntegrationTemplateOAuth2;

            if (
                oAuth2AuthConfig.token_params === undefined ||
                oAuth2AuthConfig.token_params.grant_type === undefined ||
                oAuth2AuthConfig.token_params.grant_type === 'authorization_code'
            ) {
                let additionalAuthParams: Record<string, string> = {};
                if (integrationTemplate.authorization_params) {
                    additionalAuthParams = integrationTemplate.authorization_params;
                }

                // We always implement PKCE, no matter whether the server requires it or not
                const code_challenge = crypto
                    .createHash('sha256')
                    .update(sessionData.codeVerifier)
                    .digest('base64')
                    .replace(/\+/g, '-')
                    .replace(/\//g, '_')
                    .replace(/=+$/, '');
                additionalAuthParams['code_challenge'] = code_challenge;
                additionalAuthParams['code_challenge_method'] = 'S256';

                const simpleOAuthClient = new simpleOauth2.AuthorizationCode(getSimpleOAuth2ClientConfig(integrationConfig, integrationTemplate));
                const authorizationUri = simpleOAuthClient.authorizeURL({
                    redirect_uri: oAuthCallbackUrl,
                    scope: integrationConfig.oauth_scopes,
                    state: authState,
                    ...additionalAuthParams
                });

                logger.debug(`OAuth 2.0 for ${integrationName} (connection ${connectionId}) - redirecting to: ${authorizationUri}`);

                res.redirect(authorizationUri);
            } else {
                let grandType = oAuth2AuthConfig.token_params.grant_type;
                return sendResultHTML(logger, res, integrationName, connectionId, 'grant_type_err', errDesc['grant_type_err'](grandType));
            }
        } else if (integrationTemplate.auth_mode === IntegrationAuthModes.OAuth1) {
            // In OAuth 2 we are guaranteed that the state parameter will be sent back to us
            // for the entire journey. With OAuth 1.0a we have to register the callback URL
            // in a first step and will get called back there. We need to manually include the state
            // param there, otherwise we won't be able to identify the user in the callback
            const callbackParams = new URLSearchParams({
                state: authState
            });
            const oAuth1CallbackURL = `${oAuthCallbackUrl}?${callbackParams.toString()}`;

            const oAuth1Client = new PizzlyOAuth1Client(integrationConfig, integrationTemplate, oAuth1CallbackURL);

            let tokenResult: OAuth1RequestTokenResult | undefined;
            try {
                tokenResult = await oAuth1Client.getOAuthRequestToken();
            } catch (error) {
                let errStr = JSON.stringify(error, undefined, 2);
                return sendResultHTML(logger, res, integrationName, connectionId as string, 'oauth1_request_token', errDesc['oauth1_request_token'](errStr));
            }

            const sessionData = sessionStore[authState]!;
            sessionData.request_token_secret = tokenResult.request_token_secret;
            const redirectUrl = oAuth1Client.getAuthorizationURL(tokenResult);

            logger.debug(`OAuth 1.0a for ${integrationName} (connection: ${connectionId}) - request token success. Redirecting user to: ${redirectUrl}`);

            // All worked, let's redirect the user to the authorization page
            return res.redirect(redirectUrl);
        } else {
            let authMode = integrationTemplate.auth_mode;
            return sendResultHTML(logger, res, integrationName, connectionId, 'auth_mode_err', errDesc['auth_mode_err'](authMode));
        }
    });

    app.get('/oauth/callback', async (req, res) => {
        const { state } = req.query;
        const sessionData = sessionStore[state as string] as OAuthSession;
        let integrationName = sessionData.integrationName;
        let connectionId = sessionData.connectionId;
        let authMode = sessionData.authMode;
        delete sessionStore[state as string];

        if (state == null || sessionData == null || integrationName == null) {
            let stateStr = (state as string) || '';
            return sendResultHTML(logger, res, integrationName, connectionId, 'state_err', errDesc['state_err'](stateStr));
        }

        logger.debug(`Received OAuth callback for ${integrationName} (connection: ${connectionId}) - full callback URI: ${req.originalUrl}"`);

        const integrationTemplate = integrationsManager.getIntegrationTemplate(integrationName);
        const integrationConfig = await integrationsManager.getIntegrationConfig(integrationName);

        if (authMode === IntegrationAuthModes.OAuth2) {
            const { code } = req.query;

            if (!code) {
                let errStr = JSON.stringify(req.query);
                return sendResultHTML(logger, res, integrationName, connectionId, 'callback_err', errDesc['callback_err'](errStr));
            }

            const simpleOAuthClient = new simpleOauth2.AuthorizationCode(getSimpleOAuth2ClientConfig(integrationConfig!, integrationTemplate));

            let additionalTokenParams: Record<string, string> = {};
            if (integrationTemplate.token_params !== undefined) {
                // We need to remove grant_type, simpleOAuth2 handles that for us
                const deepCopy = JSON.parse(JSON.stringify(integrationTemplate.token_params));
                delete deepCopy.grant_type;
                additionalTokenParams = deepCopy;
            }

            // We always implement PKCE, no matter whether the server requires it or not
            additionalTokenParams['code_verifier'] = sessionData.codeVerifier;

            try {
                const accessToken = await simpleOAuthClient.getToken({
                    code: code as string,
                    redirect_uri: sessionData.callbackUrl,
                    ...additionalTokenParams
                });

                logger.debug(`OAuth 2 for ${integrationName} (connection ${connectionId}) successful.`);

                connectionsManager.upsertConnection(connectionId, integrationName, accessToken.token, IntegrationAuthModes.OAuth2);

                return sendResultHTML(logger, res, integrationName, connectionId, '', '');
            } catch (e) {
                return sendResultHTML(logger, res, integrationName, connectionId, 'token_err', errDesc['token_err'](JSON.stringify(e)));
            }
        } else if (authMode === IntegrationAuthModes.OAuth1) {
            const { oauth_token, oauth_verifier } = req.query;

            if (!oauth_token || !oauth_verifier) {
                let errStr = JSON.stringify(req.query);
                return sendResultHTML(logger, res, integrationName, connectionId, 'callback_err', errDesc['callback_err'](errStr));
            }

            const oauth_token_secret = sessionData.request_token_secret!;

            const oAuth1Client = new PizzlyOAuth1Client(integrationConfig!, integrationTemplate, '');
            oAuth1Client
                .getOAuthAccessToken(oauth_token as string, oauth_token_secret, oauth_verifier as string)
                .then((accessTokenResult) => {
                    logger.debug(`OAuth 1.0a for ${integrationName} (connection: ${connectionId}) successful.`);

                    connectionsManager.upsertConnection(connectionId, integrationName, accessTokenResult, IntegrationAuthModes.OAuth1);
                    return sendResultHTML(logger, res, integrationName, connectionId, '', '');
                })
                .catch((e) => {
                    let errStr = JSON.stringify(e);
                    return sendResultHTML(logger, res, integrationName, connectionId, 'token_err', errDesc['token_err'](errStr));
                });
        } else {
            return sendResultHTML(logger, res, integrationName, connectionId, 'auth_mode_err', errDesc['auth_mode_err'](authMode));
        }
    });

    app.listen(port);

    logger.info(`OAuth server started, listening on port ${port}. OAuth callback URL: ${oAuthCallbackUrl}`);
}

// Yes including a full HTML template here in a string goes against many best practices.
// Yet it also felt wrong to add another dependency to simply parse 1 template.
// If you have an idea on how to improve this feel free to submit a pull request.
function sendResultHTML(logger: winston.Logger, res: any, integrationName: string, userId: string, error: string | null, errorDesc: string | null) {
    const resultHTMLTemplate = `
<!--
Pizzly OAuth flow callback. Read more about how to use it at: https://github.com/NangoHQ/Pizzly
-->
<html>
  <head>
    <meta charset="utf-8" />
    <title>Authorization callback</title>
  </head>
  <body>
    <noscript>JavaScript is required to proceed with the authentication.</noscript>
    <script type="text/javascript">
      window.integrationName = \`\${integrationName}\`;
      window.userId = \`\${userId}\`;
      window.authError = \'\${error}\';
      window.authErrorDescription = \'\${errorDesc}\';

      const message = {};

      if (window.authError !== '') {
        message.eventType = 'AUTHORIZATION_FAILED';
        message.data = {
            userId: window.userId,
            integrationName: window.integrationName,
            error: {
                type: window.authError,
                message: window.authErrorDescription
            }
        };
      } else {
        console.log('I have success!');
        message.eventType = 'AUTHORIZATION_SUCEEDED';
        message.data = { userId: window.userId, integrationName: window.integrationName };
      }

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
        integrationName: integrationName,
        userId: userId,
        error: error?.replace('\n', '\\n'),
        errorDesc: errorDesc?.replace('\n', '\\n')
    });

    if (error) {
        logger.debug(`Got an error in the OAuth flow for integration "${integrationName}" and userId "${userId}": ${error} - ${errorDesc}`);
        res.status(500);
    } else {
        res.status(200);
    }
    res.set('Content-Type', 'text/html');
    res.send(Buffer.from(resultHTML));
}

const app = express();
const sessionStore: OAuthSessionStore = {};
await db.knex.raw(`CREATE SCHEMA IF NOT EXISTS ${db.schema()}`);
await db.migrate(process.env['PIZZLY_DB_MIGRATION_FOLDER'] || './lib/db/migrations');
startOAuthServer();
