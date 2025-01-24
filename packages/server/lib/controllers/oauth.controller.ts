import type { Request, Response, NextFunction } from 'express';
import * as crypto from 'node:crypto';
import * as uuid from 'uuid';
import simpleOauth2 from 'simple-oauth2';
import { OAuth1Client } from '../clients/oauth1.client.js';
import {
    getAdditionalAuthorizationParams,
    getConnectionMetadataFromCallbackRequest,
    missesInterpolationParam,
    missesInterpolationParamInObject
} from '../utils/utils.js';
import type { DBEnvironment, DBTeam, Provider, ProviderOAuth2 } from '@nangohq/types';
import type {
    Config as ProviderConfig,
    OAuthSession,
    OAuth1RequestTokenResult,
    OAuth2Credentials,
    ConnectionConfig,
    ConnectionUpsertResponse
} from '@nangohq/shared';
import {
    getConnectionConfig,
    interpolateStringFromObject,
    LogActionEnum,
    configService,
    connectionService,
    environmentService,
    oauth2Client,
    providerClientManager,
    errorManager,
    analytics,
    telemetry,
    LogTypes,
    AnalyticsTypes,
    hmacService,
    ErrorSourceEnum,
    interpolateObjectValues,
    getProvider,
    linkConnection,
    getConnectionMetadataFromTokenResponse
} from '@nangohq/shared';
import publisher from '../clients/publisher.client.js';
import * as WSErrBuilder from '../utils/web-socket-error.js';
import oAuthSessionService from '../services/oauth-session.service.js';
import type { LogContext } from '@nangohq/logs';
import { defaultOperationExpiration, logContextGetter } from '@nangohq/logs';
import { errorToObject, stringifyError } from '@nangohq/utils';
import type { RequestLocals } from '../utils/express.js';
import { connectionCreated as connectionCreatedHook, connectionCreationFailed as connectionCreationFailedHook } from '../hooks/hooks.js';
import db from '@nangohq/database';
import type { ConnectSessionAndEndUser } from '../services/connectSession.service.js';
import { getConnectSession } from '../services/connectSession.service.js';
import { hmacCheck } from '../utils/hmac.js';
import { isIntegrationAllowed } from '../utils/auth.js';

class OAuthController {
    public async oauthRequest(req: Request, res: Response<any, Required<RequestLocals>>, _next: NextFunction) {
        const { account, environment } = res.locals;
        const accountId = account.id;
        const environmentId = environment.id;
        const { providerConfigKey } = req.params;
        const receivedConnectionId = req.query['connection_id'] as string | undefined;
        let connectionId = receivedConnectionId || connectionService.generateConnectionId();
        const wsClientId = req.query['ws_client_id'] as string | undefined;
        let userScope = req.query['user_scope'] as string | undefined;
        const isConnectSession = res.locals['authType'] === 'connectSession';

        // if (isConnectSession && receivedConnectionId) {
        //     errorRestrictConnectionId(res);
        //     return;
        // }

        let logCtx: LogContext | undefined;

        try {
            logCtx = await logContextGetter.create(
                {
                    operation: { type: 'auth', action: 'create_connection' },
                    meta: { authType: 'oauth' },
                    expiresAt: defaultOperationExpiration.auth()
                },
                { account, environment }
            );
            if (!wsClientId) {
                void analytics.track(AnalyticsTypes.PRE_WS_OAUTH, accountId);
            }

            await telemetry.log(LogTypes.AUTH_TOKEN_REQUEST_START, 'OAuth request process start', LogActionEnum.AUTH, {
                environmentId: String(environmentId),
                accountId: String(accountId),
                providerConfigKey: String(providerConfigKey),
                connectionId
            });

            const callbackUrl = await environmentService.getOauthCallbackUrl(environmentId);
            const connectionConfig = req.query['params'] != null ? getConnectionConfig(req.query['params']) : {};
            const authorizationParams = req.query['authorization_params'] != null ? getAdditionalAuthorizationParams(req.query['authorization_params']) : {};
            const overrideCredentials = req.query['credentials'] != null ? getAdditionalAuthorizationParams(req.query['credentials']) : {};

            if (providerConfigKey == null) {
                const error = WSErrBuilder.MissingProviderConfigKey();
                await logCtx.error(error.message);
                await logCtx.failed();

                await publisher.notifyErr(res, wsClientId, providerConfigKey, receivedConnectionId, error);
                return;
            }

            if (environment.hmac_enabled && !isConnectSession) {
                const hmac = req.query['hmac'] as string | undefined;
                if (!hmac) {
                    const error = WSErrBuilder.MissingHmac();
                    await logCtx.error(error.message);
                    await logCtx.failed();

                    await publisher.notifyErr(res, wsClientId, providerConfigKey, receivedConnectionId, error);
                    return;
                }

                const verified = hmacService.verify({ receivedDigest: hmac, environment, values: [providerConfigKey, receivedConnectionId] });
                if (!verified) {
                    const error = WSErrBuilder.InvalidHmac();
                    await logCtx.error(error.message);
                    await logCtx.failed();

                    await publisher.notifyErr(res, wsClientId, providerConfigKey, receivedConnectionId, error);
                    return;
                }
            }

            await logCtx.info('Authorization URL request from the client');

            const config = await configService.getProviderConfig(providerConfigKey, environmentId);

            if (config == null) {
                const error = WSErrBuilder.UnknownProviderConfigKey(providerConfigKey);
                await logCtx.error(error.message);
                await logCtx.failed();

                await publisher.notifyErr(res, wsClientId, providerConfigKey, connectionId, error);
                return;
            }

            await logCtx.enrichOperation({ integrationId: config.id!, integrationName: config.unique_key, providerName: config.provider });

            const provider = getProvider(config.provider);
            if (!provider) {
                const error = WSErrBuilder.UnknownProviderTemplate(config.provider);
                await logCtx.error(error.message);
                await logCtx.failed();

                await publisher.notifyErr(res, wsClientId, providerConfigKey, connectionId, error);
                return;
            }

            if (!(await isIntegrationAllowed({ config, res, logCtx }))) {
                return;
            }

            if (isConnectSession) {
                // Session token always win
                const defaults = res.locals.connectSession.integrationsConfigDefaults?.[config.unique_key];
                userScope = defaults?.user_scopes || undefined;

                // Reconnect mechanism
                if (res.locals.connectSession.connectionId) {
                    const connection = await connectionService.getConnectionById(res.locals.connectSession.connectionId);
                    if (!connection) {
                        await logCtx.error('Invalid connection');
                        await logCtx.failed();
                        res.status(400).send({ error: { code: 'invalid_connection' } });
                        return;
                    }
                    connectionId = connection?.connection_id;
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
                connectSessionId: res.locals.connectSession ? res.locals.connectSession.id : null,
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

                await logCtx.info('Credentials override', {
                    oauth_client_id: config.oauth_client_id,
                    oauth_client_secret: obfuscatedClientSecret
                });
            }

            if (isConnectSession) {
                const defaults = res.locals.connectSession.integrationsConfigDefaults?.[config.unique_key];
                if (defaults?.connectionConfig.oauth_scopes_override) {
                    config.oauth_scopes = defaults?.connectionConfig.oauth_scopes_override;
                }
            } else if (connectionConfig['oauth_scopes_override']) {
                config.oauth_scopes = connectionConfig['oauth_scopes_override'];
            }

            if (provider.auth_mode !== 'APP' && (config.oauth_client_id == null || config.oauth_client_secret == null)) {
                const error = WSErrBuilder.InvalidProviderConfig(providerConfigKey);
                await logCtx.error(error.message);
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
                    environment_id: environmentId,
                    userScope,
                    logCtx
                });
                return;
            } else if (provider.auth_mode === 'APP' || provider.auth_mode === 'CUSTOM') {
                await this.appRequest(provider, config, session, res, authorizationParams, logCtx);
                return;
            } else if (provider.auth_mode === 'OAUTH1') {
                await this.oauth1Request(provider, config, session, res, callbackUrl, environmentId, logCtx);
                return;
            }

            const error = WSErrBuilder.UnknownAuthMode(provider.auth_mode);
            await logCtx.error(error.message);
            await logCtx.failed();

            await publisher.notifyErr(res, wsClientId, providerConfigKey, connectionId, error);
            return;
        } catch (err) {
            const prettyError = stringifyError(err, { pretty: true });
            const error = WSErrBuilder.UnknownError();
            if (logCtx) {
                await logCtx.error(error.message, { error: err });
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
        const { environment, account } = res.locals;
        const { providerConfigKey } = req.params;
        const receivedConnectionId = req.query['connection_id'] as string | undefined;
        let connectionId = receivedConnectionId || connectionService.generateConnectionId();
        const connectionConfig = req.query['params'] != null ? getConnectionConfig(req.query['params']) : {};
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

        const { client_id, client_secret }: Record<string, string> = body;

        // if (isConnectSession && receivedConnectionId) {
        //     errorRestrictConnectionId(res);
        //     return;
        // }

        let logCtx: LogContext | undefined;

        try {
            logCtx = await logContextGetter.create(
                {
                    operation: { type: 'auth', action: 'create_connection' },
                    meta: { authType: 'oauth2CC' },
                    expiresAt: defaultOperationExpiration.auth()
                },
                { account, environment }
            );
            void analytics.track(AnalyticsTypes.PRE_OAUTH2_CC_AUTH, account.id);

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
                await logCtx.error('Unknown provider config');
                await logCtx.failed();

                errorManager.errRes(res, 'unknown_provider_config');

                return;
            }

            const provider = getProvider(config.provider);
            if (!provider) {
                await logCtx.error('Unknown provider');
                await logCtx.failed();
                res.status(404).send({ error: { code: 'unknown_provider_template' } });
                return;
            }

            const tokenUrl = typeof provider.token_url === 'string' ? provider.token_url : (provider.token_url?.['OAUTH2'] as string);

            if (provider.auth_mode !== 'OAUTH2_CC') {
                await logCtx.error('Provider does not support OAuth2 client credentials creation', { provider: config.provider });
                await logCtx.failed();

                errorManager.errRes(res, 'invalid_auth_mode');

                return;
            }

            if (!(await isIntegrationAllowed({ config, res, logCtx }))) {
                return;
            }

            // Reconnect mechanism
            if (isConnectSession && res.locals.connectSession.connectionId) {
                const connection = await connectionService.getConnectionById(res.locals.connectSession.connectionId);
                if (!connection) {
                    await logCtx.error('Invalid connection');
                    await logCtx.failed();
                    res.status(400).send({ error: { code: 'invalid_connection' } });
                    return;
                }
                connectionId = connection?.connection_id;
            }

            if (missesInterpolationParam(tokenUrl, connectionConfig)) {
                const error = WSErrBuilder.InvalidConnectionConfig(tokenUrl, JSON.stringify(connectionConfig));
                await logCtx.error(error.message, { connectionConfig });
                await logCtx.failed();

                errorManager.errRes(res, error.message);
                return;
            }

            await logCtx.enrichOperation({ integrationId: config.id!, integrationName: config.unique_key, providerName: config.provider });

            const {
                success,
                error,
                response: credentials
            } = await connectionService.getOauthClientCredentials(provider as ProviderOAuth2, client_id, client_secret, connectionConfig);

            if (!success || !credentials) {
                await logCtx.error('Error during OAuth2 client credentials creation', { error, provider: config.provider });
                await logCtx.failed();

                errorManager.errRes(res, 'oauth2_cc_error');

                return;
            }

            const [updatedConnection] = await connectionService.upsertConnection({
                connectionId,
                providerConfigKey,
                provider: config.provider,
                parsedRawCredentials: credentials,
                connectionConfig,
                environmentId: environment.id,
                accountId: account.id
            });
            if (!updatedConnection) {
                res.status(500).send({ error: { code: 'server_error', message: 'failed to create connection' } });
                await logCtx.error('Failed to create connection');
                await logCtx.failed();
                return;
            }

            if (isConnectSession) {
                const session = res.locals.connectSession;
                await linkConnection(db.knex, { endUserId: session.endUserId, connection: updatedConnection.connection });
            }

            await logCtx.enrichOperation({ connectionId: updatedConnection.connection.id!, connectionName: updatedConnection.connection.connection_id });
            await logCtx.info('OAuth2 client credentials creation was successful');
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
                config.provider,
                logContextGetter,
                undefined,
                logCtx
            );

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
                'unknown',
                logCtx
            );
            if (logCtx) {
                await logCtx.error('Error during OAuth2 client credentials creation', { error: err });
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
        environment_id,
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
        environment_id: number;
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

                await logCtx.error(error.message, { connectionConfig });
                await logCtx.failed();

                await publisher.notifyErr(res, channel, providerConfigKey, connectionId, error);
                return;
            }

            if (missesInterpolationParam(tokenUrl, connectionConfig)) {
                const error = WSErrBuilder.InvalidConnectionConfig(tokenUrl, JSON.stringify(connectionConfig));
                await logCtx.error(error.message, { connectionConfig });
                await logCtx.failed();

                await publisher.notifyErr(res, channel, providerConfigKey, connectionId, error);
                return;
            }

            if (provider.authorization_params && missesInterpolationParamInObject(provider.authorization_params, connectionConfig)) {
                const error = WSErrBuilder.InvalidConnectionConfig('authorization_params', JSON.stringify(connectionConfig));
                await logCtx.error(error.message, { connectionConfig });
                await logCtx.failed();

                await publisher.notifyErr(res, channel, providerConfigKey, connectionId, error);
                return;
            }

            if (provider.token_params && missesInterpolationParamInObject(provider.token_params, connectionConfig)) {
                const error = WSErrBuilder.InvalidConnectionConfig('token_params', JSON.stringify(connectionConfig));
                await logCtx.error(error.message, { connectionConfig });
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

                await telemetry.log(LogTypes.AUTH_TOKEN_REQUEST_CALLBACK_RECEIVED, 'OAuth2 callback url received', LogActionEnum.AUTH, {
                    environmentId: String(environment_id),
                    callbackUrl,
                    providerConfigKey: String(providerConfigKey),
                    provider: String(providerConfig.provider),
                    connectionId: String(connectionId),
                    authMode: String(provider.auth_mode)
                });

                await logCtx.info('Redirecting', {
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

                await logCtx.error('Redirecting', {
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
            const content = error.message + '\n' + prettyError;

            await telemetry.log(LogTypes.AUTH_TOKEN_REQUEST_FAILURE, `OAuth2 request process failed ${content}`, LogActionEnum.AUTH, {
                callbackUrl,
                environmentId: String(environment_id),
                providerConfigKey: String(providerConfigKey),
                connectionId: String(connectionId),
                level: 'error'
            });

            await logCtx.error(WSErrBuilder.UnknownError().message, { error, connectionConfig });
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

                await logCtx.error(error.message, { ...connectionConfig });
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

            await logCtx.info('Redirecting', { authorizationUri, providerConfigKey, connectionId, connectionConfig });

            res.redirect(authorizationUri);
        } catch (err) {
            const prettyError = stringifyError(err, { pretty: true });

            await logCtx.error('Unknown error', { connectionConfig });
            await logCtx.failed();

            return publisher.notifyErr(res, channel, providerConfigKey, connectionId, WSErrBuilder.UnknownError(prettyError));
        }
    }

    // In OAuth 2 we are guaranteed that the state parameter will be sent back to us
    // for the entire journey. With OAuth 1.0a we have to register the callback URL
    // in a first step and will get called back there. We need to manually include the state
    // param there, otherwise we won't be able to identify the user in the callback
    private async oauth1Request(
        provider: Provider,
        config: ProviderConfig,
        session: OAuthSession,
        res: Response,
        callbackUrl: string,
        environment_id: number,
        logCtx: LogContext
    ) {
        const callbackParams = new URLSearchParams({
            state: session.id
        });
        const channel = session.webSocketClientId;
        const providerConfigKey = session.providerConfigKey;
        const connectionId = session.connectionId;

        const oAuth1CallbackURL = `${callbackUrl}?${callbackParams.toString()}`;

        await logCtx.info('OAuth callback URL was retrieved', { url: oAuth1CallbackURL });

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
            await logCtx.error(userError.message, { error: err, url: oAuth1CallbackURL });
            await logCtx.failed();

            return publisher.notifyErr(res, channel, providerConfigKey, connectionId, userError);
        }

        session.requestTokenSecret = tokenResult.request_token_secret;
        await oAuthSessionService.create(session);
        const redirectUrl = oAuth1Client.getAuthorizationURL(tokenResult, oAuth1CallbackURL);

        await logCtx.info('Successfully requested token. Redirecting...', {
            providerConfigKey,
            connectionId,
            redirectUrl
        });

        await telemetry.log(LogTypes.AUTH_TOKEN_REQUEST_CALLBACK_RECEIVED, 'OAuth1 callback url received', LogActionEnum.AUTH, {
            environmentId: String(environment_id),
            callbackUrl,
            providerConfigKey: String(providerConfigKey),
            provider: config.provider,
            connectionId: String(connectionId),
            authMode: String(provider.auth_mode)
        });

        // All worked, let's redirect the user to the authorization page
        return res.redirect(redirectUrl);
    }

    public async oauthCallback(req: Request, res: Response<any, never>, _: NextFunction) {
        const { state } = req.query;

        const installation_id = req.query['installation_id'] as string | undefined;
        const action = req.query['setup_action'] as string;

        if (!state && installation_id && action) {
            res.redirect(req.get('referer') || req.get('Referer') || req.headers.referer || 'https://github.com');

            return;
        }

        if (state == null) {
            const errorMessage = 'No state found in callback';
            const e = new Error(errorMessage);

            errorManager.report(e, { source: ErrorSourceEnum.PLATFORM, operation: LogActionEnum.AUTH });
            return;
        }

        let session;
        try {
            session = await oAuthSessionService.findById(state as string);
        } catch (err) {
            errorManager.report(err, { source: ErrorSourceEnum.PLATFORM, operation: LogActionEnum.AUTH });
            errorManager.errRes(res, 'invalid_oauth_state');
            return;
        }

        if (session == null) {
            const e = new Error(`No session found for state: ${JSON.stringify(state)}`);

            errorManager.report(e, { source: ErrorSourceEnum.PLATFORM, operation: LogActionEnum.AUTH });
            return;
        } else {
            await oAuthSessionService.delete(state as string);
        }

        const logCtx = await logContextGetter.get({ id: session.activityLogId });

        const channel = session.webSocketClientId;
        const providerConfigKey = session.providerConfigKey;
        const connectionId = session.connectionId;

        try {
            await logCtx.debug('Received callback', { providerConfigKey, connectionId });

            const provider = getProvider(session.provider);
            if (!provider) {
                const error = WSErrBuilder.UnknownProviderTemplate(session.provider);
                await logCtx.error(error.message);
                await logCtx.failed();
                await publisher.notifyErr(res, channel, providerConfigKey, connectionId, error);
                return;
            }

            const config = (await configService.getProviderConfig(session.providerConfigKey, session.environmentId))!;
            await logCtx.enrichOperation({ integrationId: config.id!, integrationName: config.unique_key, providerName: config.provider });

            const environment = await environmentService.getById(session.environmentId);
            const account = await environmentService.getAccountFromEnvironment(session.environmentId);

            if (!environment || !account) {
                const error = WSErrBuilder.EnvironmentOrAccountNotFound();
                await logCtx.error(error.message);
                await logCtx.failed();

                await publisher.notifyErr(res, channel, providerConfigKey, connectionId, error);
                return;
            }

            if (session.authMode === 'OAUTH2' || session.authMode === 'CUSTOM') {
                await this.oauth2Callback(provider as ProviderOAuth2, config, session, req, res, environment, account, logCtx);
                return;
            } else if (session.authMode === 'OAUTH1') {
                await this.oauth1Callback(provider, config, session, req, res, environment, account, logCtx);
                return;
            }

            const error = WSErrBuilder.UnknownAuthMode(session.authMode);
            await logCtx.error(error.message, { url: req.originalUrl });
            await logCtx.failed();

            await publisher.notifyErr(res, channel, providerConfigKey, connectionId, error);
            return;
        } catch (err) {
            const prettyError = stringifyError(err, { pretty: true });

            errorManager.report(err, { source: ErrorSourceEnum.PLATFORM, operation: LogActionEnum.AUTH, environmentId: session.environmentId });

            await logCtx.error('Unknown error', { error: err, url: req.originalUrl });
            await logCtx.failed();

            return publisher.notifyErr(res, channel, providerConfigKey, connectionId, WSErrBuilder.UnknownError(prettyError));
        }
    }

    private async oauth2Callback(
        provider: ProviderOAuth2,
        config: ProviderConfig,
        session: OAuthSession,
        req: Request,
        res: Response,
        environment: DBEnvironment,
        account: DBTeam,
        logCtx: LogContext
    ) {
        const { code } = req.query;
        const providerConfigKey = session.providerConfigKey;
        const connectionId = session.connectionId;
        const channel = session.webSocketClientId;
        const callbackMetadata = getConnectionMetadataFromCallbackRequest(req.query, provider);

        const installationId = req.query['installation_id'] as string | undefined;

        if (!code) {
            const error = WSErrBuilder.InvalidCallbackOAuth2();
            await logCtx.error(error.message, {
                scopes: config.oauth_scopes,
                basicAuthEnabled: provider.token_request_auth_method === 'basic',
                tokenParams: provider.token_params as string
            });
            await logCtx.failed();

            await telemetry.log(LogTypes.AUTH_TOKEN_REQUEST_FAILURE, 'OAuth2 token request failed with a missing code', LogActionEnum.AUTH, {
                environmentId: String(environment.id),
                providerConfigKey: String(providerConfigKey),
                provider: String(config.provider),
                connectionId: String(connectionId),
                authMode: String(provider.auth_mode),
                level: 'error'
            });

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
                session.provider,
                logCtx
            );

            return publisher.notifyErr(res, channel, providerConfigKey, connectionId, error);
        }

        // no need to do anything here until the request is approved
        if (session.authMode === 'CUSTOM' && req.query['setup_action'] === 'update' && installationId) {
            // this means the update request was performed from the provider itself
            if (!req.query['state']) {
                res.redirect(req.get('referer') || req.get('Referer') || req.headers.referer || 'https://github.com');

                return;
            }

            await logCtx.info('Update request has been made', { provider: session.provider, providerConfigKey, connectionId });
            await logCtx.success();

            await publisher.notifySuccess(res, channel, providerConfigKey, connectionId);
            return;
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

            await logCtx.info('Initiating token request', {
                provider: session.provider,
                providerConfigKey,
                connectionId,
                additionalTokenParams,
                code,
                scopes: config.oauth_scopes,
                basicAuthEnabled: provider.token_request_auth_method === 'basic',
                tokenParams: provider.token_params
            });

            const tokenUrl = typeof provider.token_url === 'string' ? provider.token_url : (provider.token_url?.['OAUTH2'] as string);

            if (providerClientManager.shouldUseProviderClient(session.provider)) {
                rawCredentials = await providerClientManager.getToken(config, tokenUrl, code as string, session.callbackUrl, session.codeVerifier);
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

            await logCtx.info('Token response received', { provider: session.provider, providerConfigKey, connectionId });

            const tokenMetadata = getConnectionMetadataFromTokenResponse(rawCredentials, provider);

            let parsedRawCredentials: OAuth2Credentials;

            try {
                parsedRawCredentials = connectionService.parseRawCredentials(rawCredentials, 'OAUTH2') as OAuth2Credentials;
            } catch (err) {
                await logCtx.error('The OAuth token response from the server could not be parsed - OAuth flow failed.', { error: err, rawCredentials });
                await logCtx.failed();

                await telemetry.log(
                    LogTypes.AUTH_TOKEN_REQUEST_FAILURE,
                    'OAuth2 token request failed, response from the server could not be parsed',
                    LogActionEnum.AUTH,
                    {
                        environmentId: String(environment.id),
                        providerConfigKey: String(providerConfigKey),
                        provider: String(config.provider),
                        connectionId: String(connectionId),
                        authMode: String(provider.auth_mode),
                        level: 'error'
                    }
                );

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
                    session.provider,
                    logCtx
                );

                await publisher.notifyErr(res, channel, providerConfigKey, connectionId, WSErrBuilder.UnknownError());
                return;
            }

            let connectionConfig = {
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
                provider: session.provider,
                parsedRawCredentials,
                connectionConfig,
                environmentId: session.environmentId,
                accountId: account.id
            });
            if (!updatedConnection) {
                await logCtx.error('Failed to create connection');
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
                    await logCtx.error('Failed to get session');
                    await logCtx.failed();
                    await publisher.notifyErr(res, channel, providerConfigKey, connectionId, WSErrBuilder.UnknownError('failed to get session'));
                    return;
                }

                connectSession = connectSessionRes.value;
                await linkConnection(db.knex, { endUserId: connectSession.connectSession.endUserId, connection: updatedConnection.connection });
            }

            await logCtx.debug(
                `OAuth connection successful${provider.auth_mode === 'CUSTOM' && !installationId ? ' and request for app approval is pending' : ''}`,
                {
                    additionalTokenParams,
                    code,
                    scopes: config.oauth_scopes,
                    basicAuthEnabled: provider.token_request_auth_method === 'basic',
                    tokenParams: provider.token_params
                }
            );

            await logCtx.enrichOperation({ connectionId: updatedConnection.connection.id!, connectionName: updatedConnection.connection.connection_id });
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
                session.provider,
                logContextGetter,
                { initiateSync, runPostConnectionScript },
                logCtx
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
                        config.provider,
                        logContextGetter,
                        { initiateSync: true, runPostConnectionScript: false },
                        logCtx
                    );
                };
                await connectionService.getAppCredentialsAndFinishConnection(
                    connectionId,
                    config,
                    provider,
                    connectionConfig as ConnectionConfig,
                    logCtx,
                    connCreatedHook
                );
            }

            await telemetry.log(LogTypes.AUTH_TOKEN_REQUEST_SUCCESS, 'OAuth2 token request succeeded', LogActionEnum.AUTH, {
                environmentId: String(environment.id),
                providerConfigKey: String(providerConfigKey),
                provider: String(config.provider),
                connectionId: String(connectionId),
                authMode: String(provider.auth_mode)
            });

            await logCtx.success();

            await publisher.notifySuccess(res, channel, providerConfigKey, connectionId, pending);
            return;
        } catch (err) {
            const prettyError = stringifyError(err, { pretty: true });
            errorManager.report(err, {
                source: ErrorSourceEnum.PLATFORM,
                operation: LogActionEnum.AUTH,
                environmentId: session.environmentId,
                metadata: {
                    providerConfigKey,
                    connectionId
                }
            });

            await telemetry.log(LogTypes.AUTH_TOKEN_REQUEST_FAILURE, 'OAuth2 token request failed', LogActionEnum.AUTH, {
                environmentId: String(environment.id),
                providerConfigKey: String(providerConfigKey),
                provider: String(config.provider),
                connectionId: String(connectionId),
                authMode: String(provider.auth_mode),
                level: 'error'
            });

            const error = WSErrBuilder.UnknownError();
            await logCtx.error(error.message, { error: err });
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
                session.provider,
                logCtx
            );

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
            await logCtx.error(error.message);
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
                session.provider,
                logCtx
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
                    provider: session.provider,
                    parsedRawCredentials: parsedAccessTokenResult,
                    connectionConfig,
                    environmentId: environment.id,
                    accountId: account.id
                });
                if (!updatedConnection) {
                    await logCtx.error('Failed to create connection');
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
                        await logCtx.error('Failed to get session');
                        await logCtx.failed();
                        return publisher.notifyErr(res, channel, providerConfigKey, connectionId, WSErrBuilder.UnknownError('failed to get session'));
                    }

                    connectSession = connectSessionRes.value;
                    await linkConnection(db.knex, { endUserId: connectSession.connectSession.endUserId, connection: updatedConnection.connection });
                }

                await logCtx.info('OAuth connection was successful', { url: session.callbackUrl, providerConfigKey });

                await telemetry.log(LogTypes.AUTH_TOKEN_REQUEST_SUCCESS, 'OAuth1 token request succeeded', LogActionEnum.AUTH, {
                    environmentId: String(environment.id),
                    providerConfigKey: String(providerConfigKey),
                    provider: String(config.provider),
                    connectionId: String(connectionId),
                    authMode: String(provider.auth_mode)
                });

                await logCtx.enrichOperation({
                    connectionId: updatedConnection.connection.id!,
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
                    session.provider,
                    logContextGetter,
                    { initiateSync, runPostConnectionScript },
                    logCtx
                );
                await logCtx.success();

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

                await telemetry.log(LogTypes.AUTH_TOKEN_REQUEST_FAILURE, 'OAuth1 token request failed', LogActionEnum.AUTH, {
                    environmentId: String(environment.id),
                    providerConfigKey: String(providerConfigKey),
                    provider: String(config.provider),
                    connectionId: String(connectionId),
                    authMode: String(provider.auth_mode),
                    level: 'error'
                });

                const error = WSErrBuilder.UnknownError();
                await logCtx.error(error.message);
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
                    session.provider,
                    logCtx
                );

                return publisher.notifyErr(res, channel, providerConfigKey, connectionId, WSErrBuilder.UnknownError(prettyError));
            });
    }
}

export default new OAuthController();
