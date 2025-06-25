import * as crypto from 'node:crypto';

import simpleOauth2 from 'simple-oauth2';
import * as uuid from 'uuid';

import db from '@nangohq/database';
import { defaultOperationExpiration, endUserToMeta, logContextGetter } from '@nangohq/logs';
import {
    ErrorSourceEnum,
    LogActionEnum,
    configService,
    connectionService,
    environmentService,
    errorManager,
    getConnectionConfig,
    getConnectionMetadataFromTokenResponse,
    getProvider,
    hmacService,
    interpolateObjectValues,
    interpolateStringFromObject,
    linkConnection,
    makeUrl,
    oauth2Client,
    providerClientManager
} from '@nangohq/shared';
import { errorToObject, metrics, stringifyError } from '@nangohq/utils';

import { OAuth1Client } from '../clients/oauth1.client.js';
import publisher from '../clients/publisher.client.js';
import { connectionCreated as connectionCreatedHook, connectionCreationFailed as connectionCreationFailedHook } from '../hooks/hooks.js';
import { getConnectSession } from '../services/connectSession.service.js';
import oAuthSessionService from '../services/oauth-session.service.js';
import { errorRestrictConnectionId, isIntegrationAllowed } from '../utils/auth.js';
import { hmacCheck } from '../utils/hmac.js';
import { authHtml } from '../utils/html.js';
import {
    getAdditionalAuthorizationParams,
    getConnectionMetadataFromCallbackRequest,
    missesInterpolationParam,
    missesInterpolationParamInObject,
    stringifyEnrichedError
} from '../utils/utils.js';
import * as WSErrBuilder from '../utils/web-socket-error.js';

import type { ConnectSessionAndEndUser } from '../services/connectSession.service.js';
import type { RequestLocals } from '../utils/express.js';
import type { LogContext } from '@nangohq/logs';
import type { Config as ProviderConfig, ConnectionUpsertResponse, OAuth1RequestTokenResult, OAuth2Credentials, OAuthSession } from '@nangohq/shared';
import type { ConnectionConfig, DBEnvironment, DBTeam, Provider, ProviderCustom, ProviderGithubApp, ProviderOAuth2 } from '@nangohq/types';
import type { NextFunction, Request, Response } from 'express';

class OAuthController {
    public async oauthRequest(req: Request, res: Response<any, Required<RequestLocals>>, _next: NextFunction) {
        const { account, environment, connectSession } = res.locals;
        const environmentId = environment.id;
        const { providerConfigKey } = req.params;
        const receivedConnectionId = req.query['connection_id'] as string | undefined;
        let connectionId = receivedConnectionId || connectionService.generateConnectionId();
        const wsClientId = req.query['ws_client_id'] as string | undefined;
        let userScope = req.query['user_scope'] as string | undefined;
        const isConnectSession = res.locals['authType'] === 'connectSession';

        if (isConnectSession && receivedConnectionId) {
            errorRestrictConnectionId(res);
            return;
        }

        let logCtx: LogContext | undefined;

        try {
            logCtx =
                isConnectSession && connectSession.operationId
                    ? logContextGetter.get({ id: connectSession.operationId, accountId: account.id })
                    : await logContextGetter.create(
                          {
                              operation: { type: 'auth', action: 'create_connection' },
                              meta: { authType: 'oauth', connectSession: endUserToMeta(res.locals.endUser) },
                              expiresAt: defaultOperationExpiration.auth()
                          },
                          { account, environment }
                      );

            const callbackUrl = await environmentService.getOauthCallbackUrl(environmentId);
            const connectionConfig = req.query['params'] != null ? getConnectionConfig(req.query['params']) : {};
            let authorizationParams = req.query['authorization_params'] != null ? getAdditionalAuthorizationParams(req.query['authorization_params']) : {};
            const overrideCredentials = req.query['credentials'] != null ? getAdditionalAuthorizationParams(req.query['credentials']) : {};

            if (providerConfigKey == null) {
                const error = WSErrBuilder.MissingProviderConfigKey();
                void logCtx.error(error.message);
                await logCtx.failed();

                await publisher.notifyErr(res, wsClientId, providerConfigKey, receivedConnectionId, error);
                return;
            }

            if (environment.hmac_enabled && !isConnectSession) {
                const hmac = req.query['hmac'] as string | undefined;
                if (!hmac) {
                    const error = WSErrBuilder.MissingHmac();
                    void logCtx.error(error.message);
                    await logCtx.failed();

                    await publisher.notifyErr(res, wsClientId, providerConfigKey, receivedConnectionId, error);
                    return;
                }

                const verified = hmacService.verify({ receivedDigest: hmac, environment, values: [providerConfigKey, receivedConnectionId] });
                if (!verified) {
                    const error = WSErrBuilder.InvalidHmac();
                    void logCtx.error(error.message);
                    await logCtx.failed();

                    await publisher.notifyErr(res, wsClientId, providerConfigKey, receivedConnectionId, error);
                    return;
                }
            }

            void logCtx.info('Authorization URL request from the client');

            const config = await configService.getProviderConfig(providerConfigKey, environmentId);

            if (config == null) {
                const error = WSErrBuilder.UnknownProviderConfigKey(providerConfigKey);
                void logCtx.error(error.message);
                await logCtx.failed();

                await publisher.notifyErr(res, wsClientId, providerConfigKey, connectionId, error);
                return;
            }

            await logCtx.enrichOperation({ integrationId: config.id!, integrationName: config.unique_key, providerName: config.provider });

            const provider = getProvider(config.provider);
            if (!provider) {
                const error = WSErrBuilder.UnknownProviderTemplate(config.provider);
                void logCtx.error(error.message);
                await logCtx.failed();

                await publisher.notifyErr(res, wsClientId, providerConfigKey, connectionId, error);
                return;
            }

            if (!(await isIntegrationAllowed({ config, res, logCtx }))) {
                return;
            }

            if (isConnectSession) {
                // Session token always win
                const defaults = connectSession.integrationsConfigDefaults?.[config.unique_key];
                userScope = defaults?.user_scopes || undefined;

                // Reconnect mechanism
                if (connectSession.connectionId) {
                    const connection = await connectionService.getConnectionById(connectSession.connectionId);
                    if (!connection) {
                        void logCtx.error('Invalid connection');
                        await logCtx.failed();
                        res.status(400).send({ error: { code: 'invalid_connection' } });
                        return;
                    }
                    connectionId = connection?.connection_id;
                }
                if (defaults?.authorization_params) {
                    authorizationParams = defaults.authorization_params;
                }
            }

            const session: OAuthSession = {
                providerConfigKey: providerConfigKey,
                provider: config.provider,
                connectionId,
                callbackUrl: callbackUrl,
                authMode: provider.auth_mode,
                codeVerifier: crypto.randomBytes(24).toString('hex'),
                id: uuid.v1(),
                connectSessionId: connectSession ? connectSession.id : null,
                connectionConfig,
                environmentId,
                webSocketClientId: wsClientId,
                activityLogId: logCtx.id
            };

            if (userScope) {
                session.connectionConfig['user_scope'] = userScope;
            }

            // certain providers need the credentials to be specified in the config
            if (overrideCredentials && (overrideCredentials['oauth_client_id_override'] || overrideCredentials['oauth_client_secret_override'])) {
                if (overrideCredentials['oauth_client_id_override']) {
                    config.oauth_client_id = overrideCredentials['oauth_client_id_override'];

                    session.connectionConfig = {
                        ...session.connectionConfig,
                        oauth_client_id_override: config.oauth_client_id
                    };
                }
                if (overrideCredentials['oauth_client_secret_override']) {
                    config.oauth_client_secret = overrideCredentials['oauth_client_secret_override'];

                    session.connectionConfig = {
                        ...session.connectionConfig,
                        oauth_client_secret_override: config.oauth_client_secret
                    };
                }

                const obfuscatedClientSecret = config.oauth_client_secret ? config.oauth_client_secret.slice(0, 4) + '***' : '';

                void logCtx.info('Credentials override', {
                    oauth_client_id: config.oauth_client_id,
                    oauth_client_secret: obfuscatedClientSecret
                });
            }

            if (isConnectSession) {
                const defaults = connectSession.integrationsConfigDefaults?.[config.unique_key];
                if (defaults?.connectionConfig?.oauth_scopes_override) {
                    config.oauth_scopes = defaults?.connectionConfig.oauth_scopes_override;
                }
            } else if (connectionConfig['oauth_scopes_override']) {
                config.oauth_scopes = connectionConfig['oauth_scopes_override'];
            }

            if (provider.auth_mode !== 'APP' && (config.oauth_client_id == null || config.oauth_client_secret == null)) {
                const error = WSErrBuilder.InvalidProviderConfig(providerConfigKey);
                void logCtx.error(error.message);
                await logCtx.failed();

                await publisher.notifyErr(res, wsClientId, providerConfigKey, connectionId, error);
                return;
            }

            if (provider.auth_mode === 'OAUTH2') {
                await this.oauth2Request({
                    provider: provider as ProviderOAuth2,
                    providerConfig: config,
                    session,
                    res,
                    connectionConfig,
                    authorizationParams,
                    callbackUrl,
                    userScope,
                    logCtx
                });
                return;
            } else if (provider.auth_mode === 'APP' || provider.auth_mode === 'CUSTOM') {
                await this.appRequest(provider, config, session, res, authorizationParams, logCtx);
                return;
            } else if (provider.auth_mode === 'OAUTH1') {
                await this.oauth1Request(provider, config, session, res, callbackUrl, logCtx);
                return;
            }

            const error = WSErrBuilder.UnknownAuthMode(provider.auth_mode);
            void logCtx.error(error.message);
            await logCtx.failed();

            await publisher.notifyErr(res, wsClientId, providerConfigKey, connectionId, error);
            return;
        } catch (err) {
            const prettyError = stringifyError(err, { pretty: true });
            const error = WSErrBuilder.UnknownError();
            if (logCtx) {
                void logCtx.error(error.message, { error: err });
                await logCtx.failed();
            }

            errorManager.report(err, {
                source: ErrorSourceEnum.PLATFORM,
                operation: LogActionEnum.AUTH,
                environmentId,
                metadata: { providerConfigKey, connectionId }
            });

            return publisher.notifyErr(res, wsClientId, providerConfigKey, receivedConnectionId, WSErrBuilder.UnknownError(prettyError));
        }
    }

    public async oauth2RequestCC(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        const { environment, account, connectSession } = res.locals;
        const { providerConfigKey } = req.params;
        const receivedConnectionId = req.query['connection_id'] as string | undefined;
        let connectionId = receivedConnectionId || connectionService.generateConnectionId();
        const connectionConfig: ConnectionConfig = req.query['params'] != null ? getConnectionConfig(req.query['params']) : {};
        const body = req.body;
        const isConnectSession = res.locals['authType'] === 'connectSession';

        if (!body.client_id) {
            errorManager.errRes(res, 'missing_client_id');

            return;
        }

        if (!body.client_secret) {
            errorManager.errRes(res, 'missing_client_secret');

            return;
        }

        const { client_id, client_secret, client_certificate, client_private_key }: Record<string, string> = body;

        if (isConnectSession && receivedConnectionId) {
            errorRestrictConnectionId(res);
            return;
        }

        let logCtx: LogContext | undefined;

        try {
            logCtx =
                isConnectSession && connectSession.operationId
                    ? logContextGetter.get({ id: connectSession.operationId, accountId: account.id })
                    : await logContextGetter.create(
                          {
                              operation: { type: 'auth', action: 'create_connection' },
                              meta: { authType: 'oauth2CC', connectSession: endUserToMeta(res.locals.endUser) },
                              expiresAt: defaultOperationExpiration.auth()
                          },
                          { account, environment }
                      );

            if (!providerConfigKey) {
                errorManager.errRes(res, 'missing_connection');

                return;
            }

            if (!isConnectSession) {
                const hmac = req.query['hmac'] as string | undefined;

                const checked = await hmacCheck({ environment, logCtx, providerConfigKey, connectionId, hmac, res });
                if (!checked) {
                    return;
                }
            }

            const config = await configService.getProviderConfig(providerConfigKey, environment.id);
            if (!config) {
                void logCtx.error('Unknown provider config');
                await logCtx.failed();

                errorManager.errRes(res, 'unknown_provider_config');

                return;
            }

            const provider = getProvider(config.provider);
            if (!provider) {
                void logCtx.error('Unknown provider');
                await logCtx.failed();
                res.status(404).send({ error: { code: 'unknown_provider_template' } });
                return;
            }

            const tokenUrl = typeof provider.token_url === 'string' ? provider.token_url : (provider.token_url?.['OAUTH2'] as string);

            if (provider.auth_mode !== 'OAUTH2_CC') {
                void logCtx.error('Provider does not support OAuth2 client credentials creation', { provider: config.provider });
                await logCtx.failed();

                errorManager.errRes(res, 'invalid_auth_mode');

                return;
            }

            if (!(await isIntegrationAllowed({ config, res, logCtx }))) {
                return;
            }

            if (isConnectSession) {
                const defaults = connectSession.integrationsConfigDefaults?.[config.unique_key];

                // Reconnect mechanism
                if (connectSession.connectionId) {
                    const connection = await connectionService.getConnectionById(connectSession.connectionId);
                    if (!connection) {
                        void logCtx.error('Invalid connection');
                        await logCtx.failed();
                        res.status(400).send({ error: { code: 'invalid_connection' } });
                        return;
                    }
                    connectionId = connection?.connection_id;
                }

                if (defaults?.authorization_params) {
                    connectionConfig['authorization_params'] = defaults.authorization_params;
                }
            }

            if (missesInterpolationParam(tokenUrl, connectionConfig)) {
                const error = WSErrBuilder.InvalidConnectionConfig(tokenUrl, JSON.stringify(connectionConfig));
                void logCtx.error(error.message, { connectionConfig });
                await logCtx.failed();

                errorManager.errRes(res, error.message);
                return;
            }

            await logCtx.enrichOperation({ integrationId: config.id!, integrationName: config.unique_key, providerName: config.provider });

            const {
                success,
                error,
                response: credentials
            } = await connectionService.getOauthClientCredentials({
                provider: provider as ProviderOAuth2,
                client_id,
                client_secret,
                connectionConfig,
                logCtx,
                client_certificate,
                client_private_key
            });

            if (!success || !credentials) {
                void logCtx.error('Error during OAuth2 client credentials creation', { error, provider: config.provider });
                await logCtx.failed();

                errorManager.errRes(res, 'oauth2_cc_error');

                return;
            }

            const [updatedConnection] = await connectionService.upsertConnection({
                connectionId,
                providerConfigKey,
                parsedRawCredentials: credentials,
                connectionConfig,
                environmentId: environment.id
            });
            if (!updatedConnection) {
                res.status(500).send({ error: { code: 'server_error', message: 'failed to create connection' } });
                void logCtx.error('Failed to create connection');
                await logCtx.failed();
                return;
            }

            if (isConnectSession) {
                await linkConnection(db.knex, { endUserId: connectSession.endUserId, connection: updatedConnection.connection });
            }

            await logCtx.enrichOperation({ connectionId: updatedConnection.connection.id, connectionName: updatedConnection.connection.connection_id });
            void logCtx.info('OAuth2 client credentials creation was successful');
            await logCtx.success();
            void connectionCreatedHook(
                {
                    connection: updatedConnection.connection,
                    environment,
                    account,
                    auth_mode: 'OAUTH2_CC',
                    operation: updatedConnection.operation,
                    endUser: isConnectSession ? res.locals['endUser'] : undefined
                },
                account,
                config,
                logContextGetter
            );

            metrics.increment(metrics.Types.AUTH_SUCCESS, 1, { auth_mode: provider.auth_mode });

            res.status(200).send({ providerConfigKey: providerConfigKey, connectionId: connectionId });
        } catch (err) {
            const prettyError = stringifyError(err, { pretty: true });

            void connectionCreationFailedHook(
                {
                    connection: { connection_id: receivedConnectionId!, provider_config_key: providerConfigKey! },
                    environment,
                    account,
                    auth_mode: 'OAUTH2_CC',
                    error: {
                        type: 'unknown',
                        description: `Error during Unauth create: ${prettyError}`
                    },
                    operation: 'unknown'
                },
                account
            );
            if (logCtx) {
                void logCtx.error('Error during OAuth2 client credentials creation', { error: err });
                await logCtx.failed();
            }

            errorManager.report(err, {
                source: ErrorSourceEnum.PLATFORM,
                operation: LogActionEnum.AUTH,
                environmentId: environment.id,
                metadata: {
                    providerConfigKey,
                    connectionId: receivedConnectionId
                }
            });

            metrics.increment(metrics.Types.AUTH_FAILURE, 1, { auth_mode: 'OAUTH2_CC' });

            next(err);
        }
    }

    private async oauth2Request({
        provider,
        providerConfig,
        session,
        res,
        connectionConfig,
        authorizationParams,
        callbackUrl,
        userScope,
        logCtx
    }: {
        provider: ProviderOAuth2;
        providerConfig: ProviderConfig;
        session: OAuthSession;
        res: Response;
        connectionConfig: Record<string, string>;
        authorizationParams: Record<string, string | undefined>;
        callbackUrl: string;
        userScope?: string | undefined;
        logCtx: LogContext;
    }) {
        const channel = session.webSocketClientId;
        const providerConfigKey = session.providerConfigKey;
        const connectionId = session.connectionId;
        const tokenUrl = typeof provider.token_url === 'string' ? provider.token_url : (provider.token_url?.['OAUTH2'] as string);

        try {
            if (missesInterpolationParam(provider.authorization_url!, connectionConfig)) {
                const error = WSErrBuilder.InvalidConnectionConfig(provider.authorization_url!, JSON.stringify(connectionConfig));

                void logCtx.error(error.message, { connectionConfig });
                await logCtx.failed();

                await publisher.notifyErr(res, channel, providerConfigKey, connectionId, error);
                return;
            }

            if (missesInterpolationParam(tokenUrl, connectionConfig)) {
                const error = WSErrBuilder.InvalidConnectionConfig(tokenUrl, JSON.stringify(connectionConfig));
                void logCtx.error(error.message, { connectionConfig });
                await logCtx.failed();

                await publisher.notifyErr(res, channel, providerConfigKey, connectionId, error);
                return;
            }

            if (provider.authorization_params && missesInterpolationParamInObject(provider.authorization_params, connectionConfig)) {
                const error = WSErrBuilder.InvalidConnectionConfig('authorization_params', JSON.stringify(connectionConfig));
                void logCtx.error(error.message, { connectionConfig });
                await logCtx.failed();

                await publisher.notifyErr(res, channel, providerConfigKey, connectionId, error);
                return;
            }

            if (provider.token_params && missesInterpolationParamInObject(provider.token_params, connectionConfig)) {
                const error = WSErrBuilder.InvalidConnectionConfig('token_params', JSON.stringify(connectionConfig));
                void logCtx.error(error.message, { connectionConfig });
                await logCtx.failed();

                await publisher.notifyErr(res, channel, providerConfigKey, connectionId, error);
                return;
            }
            if (
                provider.token_params == undefined ||
                provider.token_params.grant_type == undefined ||
                provider.token_params.grant_type == 'authorization_code'
            ) {
                let allAuthParams: Record<string, string | undefined> = interpolateObjectValues(provider.authorization_params || {}, connectionConfig);

                // We always implement PKCE, no matter whether the server requires it or not,
                // unless it has been explicitly turned off for this template
                if (!provider.disable_pkce) {
                    const h = crypto
                        .createHash('sha256')
                        .update(session.codeVerifier)
                        .digest('base64')
                        .replace(/\+/g, '-')
                        .replace(/\//g, '_')
                        .replace(/=+$/, '');
                    allAuthParams['code_challenge'] = h;
                    allAuthParams['code_challenge_method'] = 'S256';
                }

                if (providerConfig.provider === 'slack' && userScope) {
                    allAuthParams['user_scope'] = userScope;
                }

                allAuthParams = { ...allAuthParams, ...authorizationParams }; // Auth params submitted in the request take precedence over the ones defined in the template (including if they are undefined).
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                Object.keys(allAuthParams).forEach((key) => (allAuthParams[key] === undefined ? delete allAuthParams[key] : {})); // Remove undefined values.

                await oAuthSessionService.create(session);

                const simpleOAuthClient = new simpleOauth2.AuthorizationCode(
                    oauth2Client.getSimpleOAuth2ClientConfig(providerConfig, provider, connectionConfig)
                );

                const scopeSeparator = provider.scope_separator || ' ';
                const scopes = providerConfig.oauth_scopes ? providerConfig.oauth_scopes.split(',').join(scopeSeparator) : '';

                let authorizationUri = simpleOAuthClient.authorizeURL({
                    redirect_uri: callbackUrl,
                    scope: scopes,
                    state: session.id,
                    ...allAuthParams
                });

                if (provider?.authorization_url_skip_encode?.includes('scopes')) {
                    const url = new URL(authorizationUri);
                    const queryParams = new URLSearchParams(url.search);
                    queryParams.delete('scope');
                    let newQuery = queryParams.toString();
                    if (scopes) {
                        newQuery = newQuery ? `${newQuery}&scope=${scopes}` : `scope=${scopes}`;
                    }
                    url.search = newQuery;
                    authorizationUri = url.toString();
                }

                if (provider.authorization_url_fragment) {
                    const urlObj = new URL(authorizationUri);
                    const { search } = urlObj;
                    urlObj.search = '';

                    authorizationUri = `${urlObj.toString()}#${provider.authorization_url_fragment}${search}`;
                }

                if (provider.authorization_url_replacements) {
                    const urlReplacements = provider.authorization_url_replacements || {};

                    Object.keys(provider.authorization_url_replacements).forEach((key) => {
                        const replacement = urlReplacements[key];
                        if (typeof replacement === 'string') {
                            authorizationUri = authorizationUri.replace(key, replacement);
                        }
                    });
                }

                if (provider.authorization_url_skip_empty) {
                    const url = new URL(authorizationUri);
                    const queryParams = new URLSearchParams(url.search);
                    // Remove any keys with undefined or empty string values
                    for (const [key, value] of queryParams.entries()) {
                        if (value === '') {
                            queryParams.delete(key);
                        }
                    }

                    url.search = queryParams.toString();
                    authorizationUri = url.toString();
                }

                void logCtx.info('Redirecting', {
                    authorizationUri,
                    providerConfigKey,
                    connectionId,
                    allAuthParams,
                    connectionConfig,
                    grantType: provider.token_params?.grant_type as string,
                    scopes: providerConfig.oauth_scopes ? providerConfig.oauth_scopes.split(',').join(provider.scope_separator || ' ') : ''
                });

                res.redirect(authorizationUri);
            } else {
                const grantType = provider.token_params.grant_type;
                const error = WSErrBuilder.UnknownGrantType(grantType);

                void logCtx.error('Redirecting', {
                    grantType,
                    basicAuthEnabled: provider.token_request_auth_method === 'basic',
                    connectionConfig
                });
                await logCtx.failed();

                await publisher.notifyErr(res, channel, providerConfigKey, connectionId, error);
                return;
            }
        } catch (err) {
            const prettyError = stringifyError(err, { pretty: true });

            const error = WSErrBuilder.UnknownError();

            void logCtx.error(WSErrBuilder.UnknownError().message, { error, connectionConfig });
            await logCtx.failed();

            return publisher.notifyErr(res, channel, providerConfigKey, connectionId, WSErrBuilder.UnknownError(prettyError));
        }
    }

    private async appRequest(
        provider: Provider,
        providerConfig: ProviderConfig,
        session: OAuthSession,
        res: Response,
        authorizationParams: Record<string, string | undefined>,
        logCtx: LogContext
    ) {
        const channel = session.webSocketClientId;
        const providerConfigKey = session.providerConfigKey;
        const connectionId = session.connectionId;

        const connectionConfig = {
            ...authorizationParams,
            appPublicLink: providerConfig.app_link
        };

        session.connectionConfig = connectionConfig as Record<string, string>;

        try {
            if (missesInterpolationParam(provider.authorization_url!, connectionConfig)) {
                const error = WSErrBuilder.InvalidConnectionConfig(provider.authorization_url!, JSON.stringify(connectionConfig));

                void logCtx.error(error.message, { ...connectionConfig });
                await logCtx.failed();

                await publisher.notifyErr(res, channel, providerConfigKey, connectionId, error);
                return;
            }

            await oAuthSessionService.create(session);

            const appUrl = interpolateStringFromObject(provider.authorization_url!, {
                connectionConfig
            });

            const params = new URLSearchParams({
                state: session.id
            });

            const authorizationUri = `${appUrl}?${params.toString()}`;

            void logCtx.info('Redirecting', { authorizationUri, providerConfigKey, connectionId, connectionConfig });

            res.redirect(authorizationUri);
        } catch (err) {
            const prettyError = stringifyError(err, { pretty: true });

            void logCtx.error('Unknown error', { connectionConfig });
            await logCtx.failed();

            return publisher.notifyErr(res, channel, providerConfigKey, connectionId, WSErrBuilder.UnknownError(prettyError));
        }
    }

    // In OAuth 2 we are guaranteed that the state parameter will be sent back to us
    // for the entire journey. With OAuth 1.0a we have to register the callback URL
    // in a first step and will get called back there. We need to manually include the state
    // param there, otherwise we won't be able to identify the user in the callback
    private async oauth1Request(provider: Provider, config: ProviderConfig, session: OAuthSession, res: Response, callbackUrl: string, logCtx: LogContext) {
        const callbackParams = new URLSearchParams({
            state: session.id
        });
        const channel = session.webSocketClientId;
        const providerConfigKey = session.providerConfigKey;
        const connectionId = session.connectionId;

        const oAuth1CallbackURL = `${callbackUrl}?${callbackParams.toString()}`;

        void logCtx.info('OAuth callback URL was retrieved', { url: oAuth1CallbackURL });

        const oAuth1Client = new OAuth1Client(config, provider, oAuth1CallbackURL);

        let tokenResult: OAuth1RequestTokenResult | undefined;
        try {
            tokenResult = await oAuth1Client.getOAuthRequestToken();
        } catch (err) {
            const error = errorToObject(err);
            errorManager.report(new Error('token_retrieval_error'), {
                source: ErrorSourceEnum.PLATFORM,
                operation: LogActionEnum.AUTH,
                environmentId: session.environmentId,
                metadata: error
            });

            const userError = WSErrBuilder.TokenError();
            void logCtx.error(userError.message, { error: err, url: oAuth1CallbackURL });
            await logCtx.failed();

            return publisher.notifyErr(res, channel, providerConfigKey, connectionId, userError);
        }

        session.requestTokenSecret = tokenResult.request_token_secret;
        await oAuthSessionService.create(session);
        const redirectUrl = oAuth1Client.getAuthorizationURL(tokenResult, oAuth1CallbackURL);

        void logCtx.info('Successfully requested token. Redirecting...', {
            providerConfigKey,
            connectionId,
            redirectUrl
        });

        // All worked, let's redirect the user to the authorization page
        return res.redirect(redirectUrl);
    }

    public async oauthCallback(req: Request, res: Response<any, any>, _: NextFunction) {
        const { state } = req.query;

        const installation_id = req.query['installation_id'] as string | undefined;
        const action = req.query['setup_action'] as string;

        if (!state && installation_id && action) {
            res.redirect(req.get('referer') || req.get('Referer') || req.headers.referer || 'https://github.com');
            return;
        }
        if (state == null) {
            const err = new Error('No state found in callback');

            errorManager.report(err, { source: ErrorSourceEnum.PLATFORM, operation: LogActionEnum.AUTH });
            authHtml({ res, error: err.message });
            return;
        }

        let session;
        try {
            session = await oAuthSessionService.findById(state as string);
        } catch (err) {
            errorManager.report(err, { source: ErrorSourceEnum.PLATFORM, operation: LogActionEnum.AUTH });
            authHtml({ res, error: 'invalid_oauth_state' });
            return;
        }

        if (session == null) {
            const err = new Error(`No session found for state: ${JSON.stringify(state)}`);

            errorManager.report(err, { source: ErrorSourceEnum.PLATFORM, operation: LogActionEnum.AUTH });
            authHtml({ res, error: err.message });
            return;
        } else {
            await oAuthSessionService.delete(state as string);
        }

        let logCtx: LogContext | undefined;

        const channel = session.webSocketClientId;
        const providerConfigKey = session.providerConfigKey;
        const connectionId = session.connectionId;

        try {
            const environment = await environmentService.getById(session.environmentId);
            const account = await environmentService.getAccountFromEnvironment(session.environmentId);
            if (!environment || !account) {
                const error = WSErrBuilder.EnvironmentOrAccountNotFound();
                await publisher.notifyErr(res, channel, providerConfigKey, connectionId, error);
                return;
            }

            logCtx = logContextGetter.get({ id: session.activityLogId, accountId: account.id });

            void logCtx.debug('Received callback', { providerConfigKey, connectionId });

            const provider = getProvider(session.provider);
            if (!provider) {
                const error = WSErrBuilder.UnknownProviderTemplate(session.provider);
                void logCtx.error(error.message);
                await logCtx.failed();
                await publisher.notifyErr(res, channel, providerConfigKey, connectionId, error);
                return;
            }

            const config = (await configService.getProviderConfig(session.providerConfigKey, session.environmentId))!;
            await logCtx.enrichOperation({ integrationId: config.id!, integrationName: config.unique_key, providerName: config.provider });

            if (session.authMode === 'OAUTH2' || session.authMode === 'CUSTOM') {
                await this.oauth2Callback(provider as ProviderOAuth2, config, session, req, res, environment, account, logCtx);
                return;
            } else if (session.authMode === 'OAUTH1') {
                await this.oauth1Callback(provider, config, session, req, res, environment, account, logCtx);
                return;
            }

            const error = WSErrBuilder.UnknownAuthMode(session.authMode);
            void logCtx.error(error.message, { url: req.originalUrl });
            await logCtx.failed();

            await publisher.notifyErr(res, channel, providerConfigKey, connectionId, error);
            return;
        } catch (err) {
            const prettyError = stringifyError(err, { pretty: true });

            errorManager.report(err, { source: ErrorSourceEnum.PLATFORM, operation: LogActionEnum.AUTH, environmentId: session.environmentId });

            void logCtx?.error('Unknown error', { error: err, url: req.originalUrl });
            await logCtx?.failed();

            metrics.increment(metrics.Types.AUTH_FAILURE, 1, { auth_mode: 'OAUTH2' });

            return publisher.notifyErr(res, channel, providerConfigKey, connectionId, WSErrBuilder.UnknownError(prettyError));
        }
    }

    private async oauth2Callback(
        provider: ProviderOAuth2 | ProviderCustom,
        config: ProviderConfig,
        session: OAuthSession,
        req: Request,
        res: Response,
        environment: DBEnvironment,
        account: DBTeam,
        logCtx: LogContext
    ) {
        const authCodeParam = provider.authorization_code_param_in_callback || 'code';
        const authorizationCode = req.query[authCodeParam] as string | undefined;

        const providerConfigKey = session.providerConfigKey;
        const connectionId = session.connectionId;
        const channel = session.webSocketClientId;
        const callbackMetadata = getConnectionMetadataFromCallbackRequest(req.query, provider);

        const installationId = req.query['installation_id'] as string | undefined;

        if (!authorizationCode) {
            const error = WSErrBuilder.InvalidCallbackOAuth2();
            void logCtx.error(error.message, {
                config: {
                    scopes: config.oauth_scopes,
                    basicAuthEnabled: provider.token_request_auth_method === 'basic',
                    tokenParams: provider.token_params as string
                },
                response: {
                    ...(req.query && { queryParams: req.query })
                }
            });
            await logCtx.failed();

            void connectionCreationFailedHook(
                {
                    connection: { connection_id: connectionId, provider_config_key: providerConfigKey },
                    environment,
                    account,
                    auth_mode: provider.auth_mode,
                    error: {
                        type: 'invalid_callback',
                        description: error.message
                    },
                    operation: 'unknown'
                },
                account,
                config
            );

            return publisher.notifyErr(res, channel, providerConfigKey, connectionId, error);
        }

        if (session.authMode === 'CUSTOM' && req.query['setup_action'] === 'update' && installationId) {
            // this means the update request was performed from the provider itself
            if (!req.query['state']) {
                res.redirect(req.get('referer') || req.get('Referer') || req.headers.referer || 'https://github.com');

                return;
            }

            // this could be a new connection that is actually using updated permissions
            // so we continue to upsert the connection to be sure
        }

        // check for oauth overrides in the connection config
        if (session.connectionConfig['oauth_client_id_override']) {
            config.oauth_client_id = session.connectionConfig['oauth_client_id_override'];
        }

        if (session.connectionConfig['oauth_client_secret_override']) {
            config.oauth_client_secret = session.connectionConfig['oauth_client_secret_override'];
        }

        if (session.connectionConfig['oauth_scopes']) {
            config.oauth_scopes = session.connectionConfig['oauth_scopes'];
        }

        const simpleOAuthClient = new simpleOauth2.AuthorizationCode(oauth2Client.getSimpleOAuth2ClientConfig(config, provider, session.connectionConfig));

        let additionalTokenParams: Record<string, string | undefined> = {};
        if (provider.token_params !== undefined) {
            // We need to remove grant_type, simpleOAuth2 handles that for us
            const deepCopy = JSON.parse(JSON.stringify(provider.token_params));
            additionalTokenParams = interpolateObjectValues(deepCopy, session.connectionConfig);
        }

        // We always implement PKCE, no matter whether the server requires it or not,
        // unless it has been explicitly disabled for this provider template
        if (!provider.disable_pkce) {
            additionalTokenParams['code_verifier'] = session.codeVerifier;
        }

        const headers: Record<string, string> = {};

        if (provider.token_request_auth_method === 'basic') {
            headers['Authorization'] = 'Basic ' + Buffer.from(config.oauth_client_id + ':' + config.oauth_client_secret).toString('base64');
        }

        try {
            let rawCredentials: object;

            void logCtx.info('Initiating token request', {
                provider: session.provider,
                providerConfigKey,
                connectionId,
                additionalTokenParams,
                authorizationCode,
                scopes: config.oauth_scopes,
                basicAuthEnabled: provider.token_request_auth_method === 'basic',
                tokenParams: provider.token_params
            });

            const tokenUrl = typeof provider.token_url === 'string' ? provider.token_url : (provider.token_url?.['OAUTH2'] as string);

            const interpolatedTokenUrl = makeUrl(tokenUrl, session.connectionConfig, provider.token_url_skip_encode);

            if (providerClientManager.shouldUseProviderClient(session.provider)) {
                rawCredentials = await providerClientManager.getToken(
                    config,
                    interpolatedTokenUrl.href,
                    authorizationCode,
                    session.callbackUrl,
                    session.codeVerifier
                );
            } else {
                const accessToken = await simpleOAuthClient.getToken(
                    {
                        code: authorizationCode,
                        redirect_uri: session.callbackUrl,
                        ...additionalTokenParams
                    },
                    {
                        headers
                    }
                );
                rawCredentials = accessToken.token;
            }

            void logCtx.info('Token response received', { provider: session.provider, providerConfigKey, connectionId });

            const tokenMetadata = getConnectionMetadataFromTokenResponse(rawCredentials, provider);

            let parsedRawCredentials: OAuth2Credentials;

            try {
                parsedRawCredentials = connectionService.parseRawCredentials(rawCredentials, 'OAUTH2', provider as ProviderOAuth2) as OAuth2Credentials;
            } catch (err) {
                void logCtx.error('The OAuth token response from the server could not be parsed - OAuth flow failed.', { error: err, rawCredentials });
                await logCtx.failed();

                void connectionCreationFailedHook(
                    {
                        connection: { connection_id: connectionId, provider_config_key: providerConfigKey },
                        environment,
                        account,
                        auth_mode: provider.auth_mode,
                        error: {
                            type: 'unable_to_parse_token_response',
                            description: 'OAuth2 token request failed, response from the server could not be parsed'
                        },
                        operation: 'unknown'
                    },
                    account,
                    config
                );

                await publisher.notifyErr(res, channel, providerConfigKey, connectionId, WSErrBuilder.UnknownError());
                return;
            }

            let connectionConfig: ConnectionConfig = {
                ...tokenMetadata,
                ...callbackMetadata,
                ...Object.keys(session.connectionConfig).reduce<Record<string, any>>((acc, key) => {
                    if (session.connectionConfig[key] !== '') {
                        acc[key] = session.connectionConfig[key];
                    } else if (key in tokenMetadata || key in callbackMetadata) {
                        acc[key] = tokenMetadata[key] || callbackMetadata[key];
                    } else {
                        acc[key] = '';
                    }
                    return acc;
                }, {})
            };

            let pending = false;

            if (provider.auth_mode === 'CUSTOM' && !connectionConfig['installation_id'] && !installationId) {
                pending = true;

                const custom = config.custom as Record<string, string>;
                connectionConfig = {
                    ...connectionConfig,
                    app_id: custom['app_id'],
                    pending,
                    pendingLog: logCtx.id
                };
            }

            if (provider.auth_mode === 'CUSTOM' && installationId) {
                connectionConfig = {
                    ...connectionConfig,
                    installation_id: installationId
                };
            }

            if (connectionConfig['oauth_client_id_override']) {
                parsedRawCredentials = {
                    ...parsedRawCredentials,
                    config_override: {
                        client_id: connectionConfig['oauth_client_id_override']
                    }
                };

                connectionConfig = Object.keys(session.connectionConfig).reduce((acc: Record<string, string>, key: string) => {
                    if (key !== 'oauth_client_id_override') {
                        acc[key] = connectionConfig[key] as string;
                    }
                    return acc;
                }, {});
            }

            if (connectionConfig['oauth_client_secret_override']) {
                parsedRawCredentials = {
                    ...parsedRawCredentials,
                    config_override: {
                        ...parsedRawCredentials.config_override,
                        client_secret: connectionConfig['oauth_client_secret_override']
                    }
                };

                connectionConfig = Object.keys(session.connectionConfig).reduce((acc: Record<string, string>, key: string) => {
                    if (key !== 'oauth_client_secret_override') {
                        acc[key] = connectionConfig[key] as string;
                    }
                    return acc;
                }, {});
            }

            if (connectionConfig['oauth_scopes_override']) {
                connectionConfig['oauth_scopes_override'] = !Array.isArray(connectionConfig['oauth_scopes_override'])
                    ? connectionConfig['oauth_scopes_override'].split(',')
                    : connectionConfig['oauth_scopes_override'];
            }

            const [updatedConnection] = await connectionService.upsertConnection({
                connectionId,
                providerConfigKey,
                parsedRawCredentials,
                connectionConfig,
                environmentId: session.environmentId
            });
            if (!updatedConnection) {
                void logCtx.error('Failed to create connection');
                await logCtx.failed();
                await publisher.notifyErr(res, channel, providerConfigKey, connectionId, WSErrBuilder.UnknownError('failed to create connection'));
                return;
            }

            let connectSession: ConnectSessionAndEndUser | undefined;
            if (session.connectSessionId) {
                const connectSessionRes = await getConnectSession(db.knex, {
                    id: session.connectSessionId,
                    accountId: account.id,
                    environmentId: environment.id
                });
                if (connectSessionRes.isErr()) {
                    void logCtx.error('Failed to get session');
                    await logCtx.failed();
                    await publisher.notifyErr(res, channel, providerConfigKey, connectionId, WSErrBuilder.UnknownError('failed to get session'));
                    return;
                }

                connectSession = connectSessionRes.value;
                await linkConnection(db.knex, { endUserId: connectSession.connectSession.endUserId, connection: updatedConnection.connection });
            }

            void logCtx.debug(
                `OAuth connection successful${provider.auth_mode === 'CUSTOM' && !installationId ? ' and request for app approval is pending' : ''}`,
                {
                    additionalTokenParams,
                    authorizationCode,
                    scopes: config.oauth_scopes,
                    basicAuthEnabled: provider.token_request_auth_method === 'basic',
                    tokenParams: provider.token_params
                }
            );

            await logCtx.enrichOperation({ connectionId: updatedConnection.connection.id, connectionName: updatedConnection.connection.connection_id });
            // don't initiate a sync if custom because this is the first step of the oauth flow
            const initiateSync = provider.auth_mode === 'CUSTOM' ? false : true;
            const runPostConnectionScript = true;
            void connectionCreatedHook(
                {
                    connection: updatedConnection.connection,
                    environment,
                    account,
                    auth_mode: provider.auth_mode,
                    operation: updatedConnection.operation,
                    endUser: connectSession?.endUser
                },
                account,
                config,
                logContextGetter,
                { initiateSync, runPostConnectionScript }
            );

            if (provider.auth_mode === 'CUSTOM' && installationId) {
                pending = false;
                const connCreatedHook = (res: ConnectionUpsertResponse) => {
                    void connectionCreatedHook(
                        {
                            connection: res.connection,
                            environment,
                            account,
                            auth_mode: provider.auth_mode,
                            operation: res.operation,
                            endUser: connectSession?.endUser
                        },
                        account,
                        config,
                        logContextGetter,
                        { initiateSync: true, runPostConnectionScript: false }
                    );
                };
                const createRes = await connectionService.getAppCredentialsAndFinishConnection(
                    connectionId,
                    config,
                    provider as unknown as ProviderGithubApp,
                    connectionConfig,
                    logCtx,
                    connCreatedHook
                );
                if (createRes.isErr()) {
                    void logCtx.error('Failed to create credentials');
                    await logCtx.failed();
                    await publisher.notifyErr(res, channel, providerConfigKey, connectionId, WSErrBuilder.UnknownError('failed to create credentials'));
                    return;
                }
            }

            await logCtx.success();

            metrics.increment(metrics.Types.AUTH_SUCCESS, 1, { auth_mode: provider.auth_mode });

            await publisher.notifySuccess(res, channel, providerConfigKey, connectionId, pending);
            return;
        } catch (err) {
            const prettyError = stringifyEnrichedError(err, { pretty: true });
            errorManager.report(err, {
                source: ErrorSourceEnum.PLATFORM,
                operation: LogActionEnum.AUTH,
                environmentId: session.environmentId,
                metadata: {
                    providerConfigKey,
                    connectionId
                }
            });

            const error = WSErrBuilder.UnknownError();
            void logCtx.error(error.message, { error: err });
            await logCtx.failed();

            void connectionCreationFailedHook(
                {
                    connection: { connection_id: connectionId, provider_config_key: providerConfigKey },
                    environment,
                    account,
                    auth_mode: provider.auth_mode,
                    error: {
                        type: 'unknown',
                        description: error.message + '\n' + prettyError
                    },
                    operation: 'unknown'
                },
                account,
                config
            );

            metrics.increment(metrics.Types.AUTH_FAILURE, 1, { auth_mode: 'OAUTH2' });

            return publisher.notifyErr(res, channel, providerConfigKey, connectionId, error);
        }
    }

    private async oauth1Callback(
        provider: Provider,
        config: ProviderConfig,
        session: OAuthSession,
        req: Request,
        res: Response,
        environment: DBEnvironment,
        account: DBTeam,
        logCtx: LogContext
    ) {
        const { oauth_token, oauth_verifier } = req.query;
        const providerConfigKey = session.providerConfigKey;
        const connectionId = session.connectionId;
        const channel = session.webSocketClientId;
        const metadata = getConnectionMetadataFromCallbackRequest(req.query, provider);

        if (!oauth_token || !oauth_verifier) {
            const error = WSErrBuilder.InvalidCallbackOAuth1();
            void logCtx.error(error.message);
            await logCtx.failed();

            void connectionCreationFailedHook(
                {
                    connection: { connection_id: connectionId, provider_config_key: providerConfigKey },
                    environment,
                    account,
                    auth_mode: provider.auth_mode,
                    error: {
                        type: 'invalid_callback',
                        description: error.message
                    },
                    operation: 'unknown'
                },
                account,
                config
            );

            return publisher.notifyErr(res, channel, providerConfigKey, connectionId, error);
        }

        const oauth_token_secret = session.requestTokenSecret!;

        const oAuth1Client = new OAuth1Client(config, provider, '');
        oAuth1Client
            .getOAuthAccessToken(oauth_token as string, oauth_token_secret, oauth_verifier as string)
            .then(async (accessTokenResult) => {
                const parsedAccessTokenResult = connectionService.parseRawCredentials(accessTokenResult, 'OAUTH1');

                const connectionConfig = {
                    ...metadata,
                    ...Object.keys(session.connectionConfig).reduce<Record<string, any>>((acc, key) => {
                        if (session.connectionConfig[key] !== '') {
                            acc[key] = session.connectionConfig[key];
                        } else if (key in metadata) {
                            acc[key] = metadata[key];
                        } else {
                            acc[key] = '';
                        }
                        return acc;
                    }, {})
                };

                const [updatedConnection] = await connectionService.upsertConnection({
                    connectionId,
                    providerConfigKey,
                    parsedRawCredentials: parsedAccessTokenResult,
                    connectionConfig,
                    environmentId: environment.id
                });
                if (!updatedConnection) {
                    void logCtx.error('Failed to create connection');
                    await logCtx.failed();
                    return publisher.notifyErr(res, channel, providerConfigKey, connectionId, WSErrBuilder.UnknownError('failed to create connection'));
                }

                let connectSession: ConnectSessionAndEndUser | undefined;
                if (session.connectSessionId) {
                    const connectSessionRes = await getConnectSession(db.knex, {
                        id: session.connectSessionId,
                        accountId: account.id,
                        environmentId: environment.id
                    });
                    if (connectSessionRes.isErr()) {
                        void logCtx.error('Failed to get session');
                        await logCtx.failed();
                        return publisher.notifyErr(res, channel, providerConfigKey, connectionId, WSErrBuilder.UnknownError('failed to get session'));
                    }

                    connectSession = connectSessionRes.value;
                    await linkConnection(db.knex, { endUserId: connectSession.connectSession.endUserId, connection: updatedConnection.connection });
                }

                void logCtx.info('OAuth connection was successful', { url: session.callbackUrl, providerConfigKey });

                await logCtx.enrichOperation({
                    connectionId: updatedConnection.connection.id,
                    connectionName: updatedConnection.connection.connection_id
                });
                // syncs not support for oauth1
                const initiateSync = false;
                const runPostConnectionScript = true;
                void connectionCreatedHook(
                    {
                        connection: updatedConnection.connection,
                        environment,
                        account,
                        auth_mode: provider.auth_mode,
                        operation: updatedConnection.operation,
                        endUser: connectSession?.endUser
                    },
                    account,
                    config,
                    logContextGetter,
                    { initiateSync, runPostConnectionScript }
                );
                await logCtx.success();

                metrics.increment(metrics.Types.AUTH_SUCCESS, 1, { auth_mode: provider.auth_mode });

                return publisher.notifySuccess(res, channel, providerConfigKey, connectionId);
            })
            .catch(async (err: unknown) => {
                errorManager.report(err, {
                    source: ErrorSourceEnum.PLATFORM,
                    operation: LogActionEnum.AUTH,
                    environmentId: session.environmentId,
                    metadata: {
                        ...metadata,
                        providerConfigKey: session.providerConfigKey,
                        connectionId: session.connectionId
                    }
                });
                const prettyError = stringifyError(err, { pretty: true });

                const error = WSErrBuilder.UnknownError();
                void logCtx.error(error.message);
                await logCtx.failed();

                void connectionCreationFailedHook(
                    {
                        connection: { connection_id: connectionId, provider_config_key: providerConfigKey },
                        environment,
                        account,
                        auth_mode: provider.auth_mode,
                        error: {
                            type: 'unknown',
                            description: error.message + '\n' + prettyError
                        },
                        operation: 'unknown'
                    },
                    account,
                    config
                );
                metrics.increment(metrics.Types.AUTH_FAILURE, 1, { auth_mode: 'OAUTH1' });

                return publisher.notifyErr(res, channel, providerConfigKey, connectionId, WSErrBuilder.UnknownError(prettyError));
            });
    }
}

export default new OAuthController();
