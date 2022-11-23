/*
 * Copyright (c) 2022 Nango, all rights reserved.
 */

import * as crypto from 'node:crypto';
import express from 'express';
import * as uuid from 'uuid';
import simpleOauth2 from 'simple-oauth2';
import { IntegrationTemplateOAuth2, IntegrationAuthModes, OAuthSession, OAuthSessionStore } from './types.js';
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
    const oAuthCallbackUrl = (process.env['HOST'] || 'localhost') + '/oauth/callback'; // TODO: add env variable

    const port = process.env['PORT'] || 3004;

    app.get('/oauth/connect/:integrationName', async (req, res) => {
        const { integrationName } = req.params;
        let { connectionId } = req.query;
        connectionId = connectionId as string;

        if (!connectionId) {
            return sendResultHTML(
                logger,
                res,
                integrationName,
                connectionId,
                'missing_connection_id',
                'Authentication failed: Missing connectionId, it is required and cannot be an empty string.'
            );
        } else if (!integrationName) {
            return sendResultHTML(
                logger,
                res,
                integrationName,
                connectionId,
                'missing_integration',
                'Authentication failed: Missing integration identifier, it is required and cannot be an empty string.'
            );
        }
        connectionId = connectionId.toString();

        let integrationTemplate: IntegrationTemplate;
        try {
            integrationTemplate = integrationsManager.getIntegrationTemplate(integrationName);
        } catch {
            return sendResultHTML(
                logger,
                res,
                integrationName,
                connectionId,
                'unknown_integration',
                `Authentication failed: This Pizzly instance does not have a configuration for the integration "${integrationName}". Do you have a typo?`
            );
        }

        let integrationConfig = await integrationsManager.getIntegrationConfig(integrationName);

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
            return sendResultHTML(
                logger,
                res,
                integrationName,
                connectionId,
                'invalid_integration_configuration',
                `Authentication failed: The configuration for integration "${integrationName}" is missing required parameters. All of these must be present: oauth_client_id (got: ${integrationConfig?.oauth_client_id}), oauth_client_secret (got: ${integrationConfig?.oauth_client_secret}) and oauth_scopes (got: ${integrationConfig?.oauth_scopes}).`
            );
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

                logger.debug(
                    `OAuth 2.0 flow for "${integrationName}" and userId "${connectionId}" - redirecting user to the following URL for authorization: ${authorizationUri}`
                );

                res.redirect(authorizationUri);
            } else {
                return sendResultHTML(
                    logger,
                    res,
                    integrationName,
                    connectionId,
                    'unsupported_grant_type',
                    `Authentication failed: The grant type "${oAuth2AuthConfig.token_params.grant_type}" is not supported by this OAuth flow. Please check the documentation or contact support.`
                );
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

            oAuth1Client
                .getOAuthRequestToken()
                .then((tokenResult) => {
                    const sessionData = sessionStore[authState]!;
                    sessionData.request_token_secret = tokenResult.request_token_secret;
                    const redirectUrl = oAuth1Client.getAuthorizationURL(tokenResult);

                    logger.debug(
                        `OAuth 1.0a flow for "${integrationName}" and userId "${connectionId}" - request token call completed successfully. Redirecting user to the following URL for authorization: ${redirectUrl}`
                    );

                    // All worked, let's redirect the user to the authorization page
                    res.redirect(redirectUrl);
                })
                .catch((error) => {
                    return sendResultHTML(
                        logger,
                        res,
                        integrationName,
                        connectionId as string,
                        'oauth1_request_token',
                        `Authentication failed: The external server returned an error in the request token step of the OAuth 1.0a flow. Error: ${JSON.stringify(
                            error,
                            undefined,
                            2
                        )}`
                    );
                });
        } else {
            return sendResultHTML(
                logger,
                res,
                integrationName,
                connectionId,
                'unsupported_auth_mode',
                `Authentication failed: The integration "${integrationName}" is configured to use auth mode "${integrationTemplate.auth_mode}" which is not supported by the OAuth flow (only OAuth1 and OAuth2 integrations are supported). Please check the documentation for how to pass in auth credentials for your auth mode or contact support.`
            );
        }
    });

    app.get('/oauth/callback', async (req, res) => {
        const { state } = req.query;
        const sessionData = sessionStore[state as string] as OAuthSession;
        delete sessionStore[state as string];

        if (state == null || sessionData == null || sessionData.integrationName == null) {
            return sendResultHTML(
                logger,
                res,
                sessionData.integrationName,
                sessionData.connectionId,
                'invalid_state_callback',
                `Authorization failed: The external server did not send a valid state parameter back in the callback. Got state: ${state}`
            );
        }

        logger.debug(
            `Received OAuth callback for "${sessionData.integrationName}" and userId "${sessionData.connectionId}" - full callback URI was: ${req.originalUrl}"`
        );

        const integrationTemplate = integrationsManager.getIntegrationTemplate(sessionData.integrationName);
        const integrationConfig = await integrationsManager.getIntegrationConfig(sessionData.integrationName);

        if (sessionData.authMode === IntegrationAuthModes.OAuth2) {
            const { code } = req.query;

            if (!code) {
                let errorType = '';
                let errorMessage = '';
                const { error } = req.query;
                if (error) {
                    errorType = 'external_callback_error';
                    errorMessage = `Authorization failed: The external OAuth 2 server responded with error in the callback: ${error} => The full callback URI was: ${req.originalUrl}`;
                } else {
                    errorType = 'unknown_external_callback_error';
                    errorMessage = `Authorization failed: The external OAuth2 server did not provide an authorization code in the callback. Unfortunately no additional errors were reported by the server. The full callback URI was: ${req.originalUrl}`;
                }
                return sendResultHTML(logger, res, sessionData.integrationName, sessionData.connectionId, errorType, errorMessage);
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

                logger.debug(
                    `OAuth 2 flow for "${sessionData.integrationName}" and userId "${
                        sessionData.connectionId
                    }" - completed successfully. Received access token: ${JSON.stringify(accessToken, undefined, 2)}`
                );

                try {
                    connectionsManager.upsertConnection(sessionData.connectionId, sessionData.integrationName, accessToken.token, IntegrationAuthModes.OAuth2);
                } catch (e) {
                    return sendResultHTML(
                        logger,
                        res,
                        sessionData.integrationName,
                        sessionData.connectionId,
                        'token_storage_error',
                        `Authentication succeeded but token storage failed: There was a problem storing the access token for user "${
                            sessionData.connectionId
                        }" and integration "${sessionData.integrationName}". Got this error: ${
                            (e as Error).message
                        }.\nToken response from server was: ${JSON.stringify(accessToken, undefined, 2)}`
                    );
                }

                return sendResultHTML(logger, res, sessionData.integrationName, sessionData.connectionId, '', '');
            } catch (e) {
                const errorE = e as Error;
                return sendResultHTML(
                    logger,
                    res,
                    sessionData.integrationName,
                    sessionData.connectionId,
                    'token_retrieval_error',
                    `Authentication failed: There was a problem exchanging the OAuth 2 authorization code for an access token. Got this error: ${errorE.name} - ${errorE.message}`
                );
            }
        } else if (sessionData.authMode === IntegrationAuthModes.OAuth1) {
            const { oauth_token, oauth_verifier } = req.query;

            if (!oauth_token || !oauth_verifier) {
                let errorType = '';
                let errorMessage = '';
                const { error } = req.query;
                if (error) {
                    errorType = 'external_callback_error';
                    errorMessage = `Authorization failed: The external OAuth 1.0a server responded with error in the callback: ${error} => The full callback URI was: ${req.originalUrl}`;
                } else {
                    errorType = 'unknown_external_callback_error';
                    errorMessage = `Authorization failed: The external OAuth 1.0a server did not provide an oauth_token and/or an oauth_verifier in the callback. Unfortunately no additional errors were reported by the server. The full callback URI was: ${req.originalUrl}`;
                }
                return sendResultHTML(logger, res, sessionData.integrationName, sessionData.connectionId, errorType, errorMessage);
            }

            const oauth_token_secret = sessionData.request_token_secret!;

            const oAuth1Client = new PizzlyOAuth1Client(integrationConfig!, integrationTemplate, '');
            oAuth1Client
                .getOAuthAccessToken(oauth_token as string, oauth_token_secret, oauth_verifier as string)
                .then((accessTokenResult) => {
                    logger.debug(
                        `OAuth 1.0a flow for "${sessionData.integrationName}" and userId "${
                            sessionData.connectionId
                        }" - completed successfully. Received access token: ${JSON.stringify(accessTokenResult, undefined, 2)}`
                    );

                    try {
                        connectionsManager.upsertConnection(
                            sessionData.connectionId,
                            sessionData.integrationName,
                            accessTokenResult,
                            IntegrationAuthModes.OAuth1
                        );
                    } catch (e) {
                        return sendResultHTML(
                            logger,
                            res,
                            sessionData.integrationName,
                            sessionData.connectionId,
                            'token_storage_error',
                            `Authentication succeeded but token storage failed: There was a problem storing the access token for user "${
                                sessionData.connectionId
                            }" and integration "${sessionData.integrationName}". Got this error: ${
                                (e as Error).message
                            }.\nToken response from server was: ${JSON.stringify(accessTokenResult, undefined, 2)}`
                        );
                    }
                    return sendResultHTML(logger, res, sessionData.integrationName, sessionData.connectionId, '', '');
                })
                .catch((error) => {
                    return sendResultHTML(
                        logger,
                        res,
                        sessionData.integrationName,
                        sessionData.connectionId,
                        'access_token_retrieval_error',
                        `Authentication failed: There was a problem exchanging the OAuth 1.0a request token for an access token. Got this error: ${error}`
                    );
                });
        } else {
            return sendResultHTML(
                logger,
                res,
                sessionData.integrationName,
                sessionData.connectionId,
                'unsupported_auth_mode_callback',
                `Authentication failed: The callback was called with an unsupported auth mode. You are seeing ghosts, this should never ever happen. Please contact support, thanks! Got this mode: ${sessionData.authMode}`
            );
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
await db.migrate(process.env['PIZZLY_DB_MIGRATION_FOLDER'] || '../db/migrations');
startOAuthServer();
