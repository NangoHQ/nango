import type { Request, Response, NextFunction } from 'express';
import * as crypto from 'node:crypto';
import * as uuid from 'uuid';
import simpleOauth2 from 'simple-oauth2';
import { OAuth1Client } from '../clients/oauth1.client.js';
import {
    getAdditionalAuthorizationParams,
    getConnectionMetadataFromCallbackRequest,
    missesInterpolationParam,
    getConnectionMetadataFromTokenResponse
} from '../utils/utils.js';
import type { Template as ProviderTemplate, TemplateOAuth2 as ProviderTemplateOAuth2 } from '@nangohq/types';
import type {
    Config as ProviderConfig,
    OAuthSession,
    OAuth1RequestTokenResult,
    OAuth2Credentials,
    ConnectionConfig,
    ConnectionUpsertResponse,
    Environment,
    Account
} from '@nangohq/shared';
import {
    getConnectionConfig,
    interpolateStringFromObject,
    getOauthCallbackUrl,
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
    ErrorSourceEnum
} from '@nangohq/shared';
import publisher from '../clients/publisher.client.js';
import * as WSErrBuilder from '../utils/web-socket-error.js';
import oAuthSessionService from '../services/oauth-session.service.js';
import type { LogContext } from '@nangohq/logs';
import { defaultOperationExpiration, logContextGetter } from '@nangohq/logs';
import { errorToObject, stringifyError } from '@nangohq/utils';
import type { RequestLocals } from '../utils/express.js';
import { connectionCreated as connectionCreatedHook, connectionCreationFailed as connectionCreationFailedHook } from '../hooks/hooks.js';

class OAuthController {
    public async oauthRequest(req: Request, res: Response<any, Required<RequestLocals>>, _next: NextFunction) {
        const { account, environment } = res.locals;
        const accountId = account.id;
        const environmentId = environment.id;
        const { providerConfigKey } = req.params;
        let connectionId = req.query['connection_id'] as string | undefined;
        const wsClientId = req.query['ws_client_id'] as string | undefined;
        const userScope = req.query['user_scope'] as string | undefined;

        let logCtx: LogContext | undefined;

        try {
            logCtx = await logContextGetter.create(
                {
                    operation: { type: 'auth', action: 'create_connection' },
                    message: 'Create connection via OAuth',
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
                connectionId: String(connectionId)
            });

            const callbackUrl = await getOauthCallbackUrl(environmentId);
            const connectionConfig = req.query['params'] != null ? getConnectionConfig(req.query['params']) : {};
            const authorizationParams = req.query['authorization_params'] != null ? getAdditionalAuthorizationParams(req.query['authorization_params']) : {};
            const overrideCredentials = req.query['credentials'] != null ? getAdditionalAuthorizationParams(req.query['credentials']) : {};

            if (connectionId == null) {
                const error = WSErrBuilder.MissingConnectionId();
                await logCtx.error(error.message);
                await logCtx.failed();

                return publisher.notifyErr(res, wsClientId, providerConfigKey, connectionId, error);
            } else if (providerConfigKey == null) {
                const error = WSErrBuilder.MissingProviderConfigKey();
                await logCtx.error(error.message);
                await logCtx.failed();

                return publisher.notifyErr(res, wsClientId, providerConfigKey, connectionId, error);
            }

            connectionId = connectionId.toString();

            const hmacEnabled = await hmacService.isEnabled(environmentId);
            if (hmacEnabled) {
                const hmac = req.query['hmac'] as string | undefined;
                if (!hmac) {
                    const error = WSErrBuilder.MissingHmac();
                    await logCtx.error(error.message);
                    await logCtx.failed();

                    return publisher.notifyErr(res, wsClientId, providerConfigKey, connectionId, error);
                }
                const verified = await hmacService.verify(hmac, environmentId, providerConfigKey, connectionId);

                if (!verified) {
                    const error = WSErrBuilder.InvalidHmac();
                    await logCtx.error(error.message);
                    await logCtx.failed();

                    return publisher.notifyErr(res, wsClientId, providerConfigKey, connectionId, error);
                }
            }

            await logCtx.info('Authorization URL request from the client');

            const config = await configService.getProviderConfig(providerConfigKey, environmentId);

            if (config == null) {
                const error = WSErrBuilder.UnknownProviderConfigKey(providerConfigKey);
                await logCtx.error(error.message);
                await logCtx.failed();

                return publisher.notifyErr(res, wsClientId, providerConfigKey, connectionId, error);
            }

            await logCtx.enrichOperation({ integrationId: config.id!, integrationName: config.unique_key, providerName: config.provider });

            let template: ProviderTemplate;
            try {
                template = configService.getTemplate(config.provider);
            } catch {
                const error = WSErrBuilder.UnknownProviderTemplate(config.provider);
                await logCtx.error(error.message);
                await logCtx.failed();

                return publisher.notifyErr(res, wsClientId, providerConfigKey, connectionId, error);
            }

            const session: OAuthSession = {
                providerConfigKey: providerConfigKey,
                provider: config.provider,
                connectionId: connectionId,
                callbackUrl: callbackUrl,
                authMode: template.auth_mode,
                codeVerifier: crypto.randomBytes(24).toString('hex'),
                id: uuid.v1(),
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

            if (connectionConfig['oauth_scopes_override']) {
                config.oauth_scopes = connectionConfig['oauth_scopes_override'];
            }

            if (template.auth_mode !== 'APP' && (config.oauth_client_id == null || config.oauth_client_secret == null)) {
                const error = WSErrBuilder.InvalidProviderConfig(providerConfigKey);
                await logCtx.error(error.message);
                await logCtx.failed();

                return publisher.notifyErr(res, wsClientId, providerConfigKey, connectionId, error);
            }

            if (template.auth_mode === 'OAUTH2') {
                return this.oauth2Request({
                    template: template as ProviderTemplateOAuth2,
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
            } else if (template.auth_mode === 'APP' || template.auth_mode === 'CUSTOM') {
                return this.appRequest(template, config, session, res, authorizationParams, logCtx);
            } else if (template.auth_mode === 'OAUTH1') {
                return this.oauth1Request(template, config, session, res, callbackUrl, environmentId, logCtx);
            }

            const error = WSErrBuilder.UnknownAuthMode(template.auth_mode);
            await logCtx.error(error.message);
            await logCtx.failed();

            return publisher.notifyErr(res, wsClientId, providerConfigKey, connectionId, error);
        } catch (e) {
            const prettyError = stringifyError(e, { pretty: true });
            const error = WSErrBuilder.UnknownError();
            if (logCtx) {
                await logCtx.error(error.message, { error: e });
                await logCtx.failed();
            }

            errorManager.report(e, {
                source: ErrorSourceEnum.PLATFORM,
                operation: LogActionEnum.AUTH,
                environmentId,
                metadata: {
                    providerConfigKey,
                    connectionId
                }
            });

            return publisher.notifyErr(res, wsClientId, providerConfigKey, connectionId, WSErrBuilder.UnknownError(prettyError));
        }
    }

    public async oauth2RequestCC(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        const { environment, account } = res.locals;
        const { providerConfigKey } = req.params;
        const connectionId = req.query['connection_id'] as string | undefined;
        const connectionConfig = req.query['params'] != null ? getConnectionConfig(req.query['params']) : {};
        const body = req.body;

        if (!body.client_id) {
            errorManager.errRes(res, 'missing_client_id');

            return;
        }

        if (!body.client_secret) {
            errorManager.errRes(res, 'missing_client_secret');

            return;
        }

        const { client_id, client_secret }: Record<string, string> = body;

        let logCtx: LogContext | undefined;

        try {
            logCtx = await logContextGetter.create(
                {
                    operation: { type: 'auth', action: 'create_connection' },
                    message: 'Create connection via OAuth2 CC',
                    expiresAt: defaultOperationExpiration.auth()
                },
                { account, environment }
            );
            void analytics.track(AnalyticsTypes.PRE_OAUTH2_CC_AUTH, account.id);

            if (!providerConfigKey) {
                errorManager.errRes(res, 'missing_connection');

                return;
            }

            if (!connectionId) {
                errorManager.errRes(res, 'missing_connection_id');

                return;
            }

            const hmacEnabled = await hmacService.isEnabled(environment.id);
            if (hmacEnabled) {
                const hmac = req.query['hmac'] as string | undefined;
                if (!hmac) {
                    await logCtx.error('Missing HMAC in query params');
                    await logCtx.failed();

                    errorManager.errRes(res, 'missing_hmac');

                    return;
                }
                const verified = await hmacService.verify(hmac, environment.id, providerConfigKey, connectionId);
                if (!verified) {
                    await logCtx.error('Invalid HMAC');
                    await logCtx.failed();

                    errorManager.errRes(res, 'invalid_hmac');

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

            const template = configService.getTemplate(config.provider);
            const tokenUrl = typeof template.token_url === 'string' ? template.token_url : (template.token_url?.['OAUTH2'] as string);

            if (template.auth_mode !== 'OAUTH2_CC') {
                await logCtx.error('Provider does not support OAuth2 client credentials creation', { provider: config.provider });
                await logCtx.failed();

                errorManager.errRes(res, 'invalid_auth_mode');

                return;
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
            } = await connectionService.getOauthClientCredentials(template as ProviderTemplateOAuth2, client_id, client_secret, connectionConfig);

            if (!success || !credentials) {
                await logCtx.error('Error during OAuth2 client credentials creation', { error, provider: config.provider });
                await logCtx.failed();

                errorManager.errRes(res, 'oauth2_cc_error');

                return;
            }

            await logCtx.info('OAuth2 client credentials creation was successful');
            await logCtx.success();

            const [updatedConnection] = await connectionService.upsertConnection(
                connectionId,
                providerConfigKey,
                config.provider,
                credentials,
                connectionConfig,
                environment.id,
                account.id
            );

            if (updatedConnection) {
                await logCtx.enrichOperation({ connectionId: updatedConnection.connection.id!, connectionName: updatedConnection.connection.connection_id });
                void connectionCreatedHook(
                    {
                        connection: updatedConnection.connection,
                        environment,
                        account,
                        auth_mode: 'NONE',
                        operation: updatedConnection.operation
                    },
                    config.provider,
                    logContextGetter,
                    undefined,
                    logCtx
                );
            }

            res.status(200).send({ providerConfigKey: providerConfigKey, connectionId: connectionId });
        } catch (err) {
            const prettyError = stringifyError(err, { pretty: true });

            void connectionCreationFailedHook(
                {
                    connection: { connection_id: connectionId!, provider_config_key: providerConfigKey! },
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
                    connectionId
                }
            });

            next(err);
        }
    }

    private async oauth2Request({
        template,
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
        template: ProviderTemplateOAuth2;
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
        const oauth2Template = template;
        const channel = session.webSocketClientId;
        const providerConfigKey = session.providerConfigKey;
        const connectionId = session.connectionId;
        const tokenUrl = typeof template.token_url === 'string' ? template.token_url : (template.token_url?.['OAUTH2'] as string);

        try {
            if (missesInterpolationParam(template.authorization_url!, connectionConfig)) {
                const error = WSErrBuilder.InvalidConnectionConfig(template.authorization_url!, JSON.stringify(connectionConfig));

                await logCtx.error(error.message, { connectionConfig });
                await logCtx.failed();

                return publisher.notifyErr(res, channel, providerConfigKey, connectionId, error);
            }

            if (missesInterpolationParam(tokenUrl, connectionConfig)) {
                const error = WSErrBuilder.InvalidConnectionConfig(tokenUrl, JSON.stringify(connectionConfig));
                await logCtx.error(error.message, { connectionConfig });
                await logCtx.failed();

                return publisher.notifyErr(res, channel, providerConfigKey, connectionId, error);
            }

            if (
                oauth2Template.token_params == undefined ||
                oauth2Template.token_params.grant_type == undefined ||
                oauth2Template.token_params.grant_type == 'authorization_code'
            ) {
                let allAuthParams: Record<string, string | undefined> = oauth2Template.authorization_params || {};

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
                    oauth2Client.getSimpleOAuth2ClientConfig(providerConfig, template, connectionConfig)
                );

                let authorizationUri = simpleOAuthClient.authorizeURL({
                    redirect_uri: callbackUrl,
                    scope: providerConfig.oauth_scopes ? providerConfig.oauth_scopes.split(',').join(oauth2Template.scope_separator || ' ') : '',
                    state: session.id,
                    ...allAuthParams
                });

                if (template.authorization_url_replacements) {
                    const urlReplacements = template.authorization_url_replacements || {};

                    Object.keys(template.authorization_url_replacements).forEach((key) => {
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
                    authMode: String(template.auth_mode)
                });

                await logCtx.info('Redirecting', {
                    authorizationUri,
                    providerConfigKey,
                    connectionId,
                    allAuthParams,
                    connectionConfig,
                    grantType: oauth2Template.token_params?.grant_type as string,
                    scopes: providerConfig.oauth_scopes ? providerConfig.oauth_scopes.split(',').join(oauth2Template.scope_separator || ' ') : ''
                });

                res.redirect(authorizationUri);
            } else {
                const grantType = oauth2Template.token_params.grant_type;
                const error = WSErrBuilder.UnknownGrantType(grantType);

                await logCtx.error('Redirecting', {
                    grantType,
                    basicAuthEnabled: template.token_request_auth_method === 'basic',
                    connectionConfig
                });
                await logCtx.failed();

                return publisher.notifyErr(res, channel, providerConfigKey, connectionId, error);
            }
        } catch (err: any) {
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
        template: ProviderTemplate,
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
            if (missesInterpolationParam(template.authorization_url!, connectionConfig)) {
                const error = WSErrBuilder.InvalidConnectionConfig(template.authorization_url!, JSON.stringify(connectionConfig));

                await logCtx.error(error.message, { ...connectionConfig });
                await logCtx.failed();

                return publisher.notifyErr(res, channel, providerConfigKey, connectionId, error);
            }

            await oAuthSessionService.create(session);

            const appUrl = interpolateStringFromObject(template.authorization_url!, {
                connectionConfig
            });

            const params = new URLSearchParams({
                state: session.id
            });

            const authorizationUri = `${appUrl}?${params.toString()}`;

            await logCtx.info('Redirecting', { authorizationUri, providerConfigKey, connectionId, connectionConfig });

            res.redirect(authorizationUri);
        } catch (error) {
            const prettyError = stringifyError(error, { pretty: true });

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
        template: ProviderTemplate,
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

        const oAuth1Client = new OAuth1Client(config, template, oAuth1CallbackURL);

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
            providerConfigKey: session.providerConfigKey,
            connectionId: session.connectionId,
            redirectUrl
        });

        await telemetry.log(LogTypes.AUTH_TOKEN_REQUEST_CALLBACK_RECEIVED, 'OAuth1 callback url received', LogActionEnum.AUTH, {
            environmentId: String(environment_id),
            callbackUrl,
            providerConfigKey: String(providerConfigKey),
            provider: config.provider,
            connectionId: String(connectionId),
            authMode: String(template.auth_mode)
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

            errorManager.report(e, {
                source: ErrorSourceEnum.PLATFORM,
                operation: LogActionEnum.AUTH,
                metadata: errorManager.getExpressRequestContext(req)
            });
            return;
        }

        const session = await oAuthSessionService.findById(state as string);

        if (session == null) {
            const errorMessage = `No session found for state: ${state}`;
            const e = new Error(errorMessage);

            errorManager.report(e, {
                source: ErrorSourceEnum.PLATFORM,
                operation: LogActionEnum.AUTH,
                metadata: errorManager.getExpressRequestContext(req)
            });
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

            const template = configService.getTemplate(session.provider);
            const config = (await configService.getProviderConfig(session.providerConfigKey, session.environmentId))!;
            await logCtx.enrichOperation({ integrationId: config.id!, integrationName: config.unique_key, providerName: config.provider });

            const environment = await environmentService.getById(session.environmentId);
            const account = await environmentService.getAccountFromEnvironment(session.environmentId);

            if (!environment || !account) {
                const error = WSErrBuilder.EnvironmentOrAccountNotFound();

                return publisher.notifyErr(res, channel, providerConfigKey, connectionId, error);
            }

            if (session.authMode === 'OAUTH2' || session.authMode === 'CUSTOM') {
                return this.oauth2Callback(template as ProviderTemplateOAuth2, config, session, req, res, environment, account, logCtx);
            } else if (session.authMode === 'OAUTH1') {
                return this.oauth1Callback(template, config, session, req, res, environment, account, logCtx);
            }

            const error = WSErrBuilder.UnknownAuthMode(session.authMode);
            await logCtx.error(error.message, { url: req.originalUrl });
            await logCtx.failed();

            return publisher.notifyErr(res, channel, providerConfigKey, connectionId, error);
        } catch (err) {
            const prettyError = stringifyError(err, { pretty: true });

            errorManager.report(err, {
                source: ErrorSourceEnum.PLATFORM,
                operation: LogActionEnum.AUTH,
                environmentId: session.environmentId,
                metadata: errorManager.getExpressRequestContext(req)
            });

            await logCtx.error('Unknown error', { error: err, url: req.originalUrl });
            await logCtx.failed();

            return publisher.notifyErr(res, channel, providerConfigKey, connectionId, WSErrBuilder.UnknownError(prettyError));
        }
    }

    private async oauth2Callback(
        template: ProviderTemplateOAuth2,
        config: ProviderConfig,
        session: OAuthSession,
        req: Request,
        res: Response,
        environment: Environment,
        account: Account,
        logCtx: LogContext
    ) {
        const { code } = req.query;
        const providerConfigKey = session.providerConfigKey;
        const connectionId = session.connectionId;
        const channel = session.webSocketClientId;
        const callbackMetadata = getConnectionMetadataFromCallbackRequest(req.query, template);

        const installationId = req.query['installation_id'] as string | undefined;

        if (!code) {
            const error = WSErrBuilder.InvalidCallbackOAuth2();
            await logCtx.error(error.message, {
                scopes: config.oauth_scopes,
                basicAuthEnabled: template.token_request_auth_method === 'basic',
                tokenParams: template.token_params as string
            });
            await logCtx.failed();

            await telemetry.log(LogTypes.AUTH_TOKEN_REQUEST_FAILURE, 'OAuth2 token request failed with a missing code', LogActionEnum.AUTH, {
                environmentId: String(environment.id),
                providerConfigKey: String(providerConfigKey),
                provider: String(config.provider),
                connectionId: String(connectionId),
                authMode: String(template.auth_mode),
                level: 'error'
            });

            void connectionCreationFailedHook(
                {
                    connection: { connection_id: connectionId, provider_config_key: providerConfigKey },
                    environment,
                    account,
                    auth_mode: template.auth_mode,
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

            return publisher.notifySuccess(res, channel, providerConfigKey, connectionId);
        }

        // check for oauth overrides in the connnection config
        if (session.connectionConfig['oauth_client_id_override']) {
            config.oauth_client_id = session.connectionConfig['oauth_client_id_override'];
        }

        if (session.connectionConfig['oauth_client_secret_override']) {
            config.oauth_client_secret = session.connectionConfig['oauth_client_secret_override'];
        }

        if (session.connectionConfig['oauth_scopes']) {
            config.oauth_scopes = session.connectionConfig['oauth_scopes'];
        }

        const simpleOAuthClient = new simpleOauth2.AuthorizationCode(oauth2Client.getSimpleOAuth2ClientConfig(config, template, session.connectionConfig));

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

            await logCtx.info('Initiating token request', {
                provider: session.provider,
                providerConfigKey,
                connectionId,
                additionalTokenParams,
                code,
                scopes: config.oauth_scopes,
                basicAuthEnabled: template.token_request_auth_method === 'basic',
                tokenParams: template.token_params
            });

            const tokenUrl = typeof template.token_url === 'string' ? template.token_url : (template.token_url?.['OAUTH2'] as string);

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

            const tokenMetadata = getConnectionMetadataFromTokenResponse(rawCredentials, template);

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
                        authMode: String(template.auth_mode),
                        level: 'error'
                    }
                );

                void connectionCreationFailedHook(
                    {
                        connection: { connection_id: connectionId, provider_config_key: providerConfigKey },
                        environment,
                        account,
                        auth_mode: template.auth_mode,
                        error: {
                            type: 'unable_to_parse_token_response',
                            description: 'OAuth2 token request failed, response from the server could not be parsed'
                        },
                        operation: 'unknown'
                    },
                    session.provider,
                    logCtx
                );

                return publisher.notifyErr(res, channel, providerConfigKey, connectionId, WSErrBuilder.UnknownError());
            }

            let connectionConfig = { ...session.connectionConfig, ...tokenMetadata, ...callbackMetadata };

            let pending = false;

            if (template.auth_mode === 'CUSTOM' && !connectionConfig['installation_id'] && !installationId) {
                pending = true;

                const custom = config.custom as Record<string, string>;
                connectionConfig = {
                    ...connectionConfig,
                    app_id: custom['app_id'],
                    pending,
                    pendingLog: logCtx.id
                };
            }

            if (template.auth_mode === 'CUSTOM' && installationId) {
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

            const [updatedConnection] = await connectionService.upsertConnection(
                connectionId,
                providerConfigKey,
                session.provider,
                parsedRawCredentials,
                connectionConfig,
                session.environmentId,
                account.id
            );

            await logCtx.debug(
                `OAuth connection successful${template.auth_mode === 'CUSTOM' && !installationId ? ' and request for app approval is pending' : ''}`,
                {
                    additionalTokenParams,
                    code,
                    scopes: config.oauth_scopes,
                    basicAuthEnabled: template.token_request_auth_method === 'basic',
                    tokenParams: template.token_params
                }
            );

            if (updatedConnection) {
                await logCtx.enrichOperation({ connectionId: updatedConnection.connection.id!, connectionName: updatedConnection.connection.connection_id });
                // don't initiate a sync if custom because this is the first step of the oauth flow
                const initiateSync = template.auth_mode === 'CUSTOM' ? false : true;
                const runPostConnectionScript = true;
                void connectionCreatedHook(
                    {
                        connection: updatedConnection.connection,
                        environment,
                        account,
                        auth_mode: template.auth_mode,
                        operation: updatedConnection.operation
                    },
                    session.provider,
                    logContextGetter,
                    { initiateSync, runPostConnectionScript },
                    logCtx
                );
            }

            if (template.auth_mode === 'CUSTOM' && installationId) {
                pending = false;
                const connCreatedHook = (res: ConnectionUpsertResponse) => {
                    void connectionCreatedHook(
                        {
                            connection: res.connection,
                            environment,
                            account,
                            auth_mode: 'APP',
                            operation: res.operation
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
                    template,
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
                authMode: String(template.auth_mode)
            });

            await logCtx.success();

            return publisher.notifySuccess(res, channel, providerConfigKey, connectionId, pending);
        } catch (err) {
            const prettyError = stringifyError(err, { pretty: true });
            errorManager.report(err, {
                source: ErrorSourceEnum.PLATFORM,
                operation: LogActionEnum.AUTH,
                environmentId: session.environmentId,
                metadata: {
                    providerConfigKey: session.providerConfigKey,
                    connectionId: session.connectionId
                }
            });

            await telemetry.log(LogTypes.AUTH_TOKEN_REQUEST_FAILURE, 'OAuth2 token request failed', LogActionEnum.AUTH, {
                environmentId: String(environment.id),
                providerConfigKey: String(providerConfigKey),
                provider: String(config.provider),
                connectionId: String(connectionId),
                authMode: String(template.auth_mode),
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
                    auth_mode: template.auth_mode,
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
        template: ProviderTemplate,
        config: ProviderConfig,
        session: OAuthSession,
        req: Request,
        res: Response,
        environment: Environment,
        account: Account,
        logCtx: LogContext
    ) {
        const { oauth_token, oauth_verifier } = req.query;
        const providerConfigKey = session.providerConfigKey;
        const connectionId = session.connectionId;
        const channel = session.webSocketClientId;
        const metadata = getConnectionMetadataFromCallbackRequest(req.query, template);

        if (!oauth_token || !oauth_verifier) {
            const error = WSErrBuilder.InvalidCallbackOAuth1();
            await logCtx.error(error.message);
            await logCtx.failed();

            void connectionCreationFailedHook(
                {
                    connection: { connection_id: connectionId, provider_config_key: providerConfigKey },
                    environment,
                    account,
                    auth_mode: template.auth_mode,
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

        const oAuth1Client = new OAuth1Client(config, template, '');
        oAuth1Client
            .getOAuthAccessToken(oauth_token as string, oauth_token_secret, oauth_verifier as string)
            .then(async (accessTokenResult) => {
                const parsedAccessTokenResult = connectionService.parseRawCredentials(accessTokenResult, 'OAUTH1');

                const [updatedConnection] = await connectionService.upsertConnection(
                    connectionId,
                    providerConfigKey,
                    session.provider,
                    parsedAccessTokenResult,
                    { ...session.connectionConfig, ...metadata },
                    environment.id,
                    account.id
                );

                await logCtx.info('OAuth connection was successful', { url: session.callbackUrl, providerConfigKey });

                await telemetry.log(LogTypes.AUTH_TOKEN_REQUEST_SUCCESS, 'OAuth1 token request succeeded', LogActionEnum.AUTH, {
                    environmentId: String(environment.id),
                    providerConfigKey: String(providerConfigKey),
                    provider: String(config.provider),
                    connectionId: String(connectionId),
                    authMode: String(template.auth_mode)
                });

                if (updatedConnection) {
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
                            auth_mode: template.auth_mode,
                            operation: updatedConnection.operation
                        },
                        session.provider,
                        logContextGetter,
                        { initiateSync, runPostConnectionScript },
                        logCtx
                    );
                }
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
                    authMode: String(template.auth_mode),
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
                        auth_mode: template.auth_mode,
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
