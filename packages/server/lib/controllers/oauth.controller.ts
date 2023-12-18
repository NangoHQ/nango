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
import {
    getConnectionConfig,
    connectionCreated as connectionCreatedHook,
    interpolateStringFromObject,
    getOauthCallbackUrl,
    getGlobalAppCallbackUrl,
    createActivityLog,
    createActivityLogMessageAndEnd,
    createActivityLogMessage,
    updateProvider as updateProviderActivityLog,
    updateSuccess as updateSuccessActivityLog,
    findActivityLogBySession,
    updateProviderConfigAndConnectionId as updateProviderConfigAndConnectionIdActivityLog,
    updateSessionId as updateSessionIdActivityLog,
    addEndTime as addEndTimeActivityLog,
    LogLevel,
    LogActionEnum,
    configService,
    connectionService,
    environmentService,
    Config as ProviderConfig,
    Template as ProviderTemplate,
    TemplateOAuth2 as ProviderTemplateOAuth2,
    AuthModes as ProviderAuthModes,
    OAuthSession,
    OAuth1RequestTokenResult,
    AuthCredentials,
    oauth2Client,
    getAccount,
    getEnvironmentId,
    providerClientManager,
    errorManager,
    analytics,
    metricsManager,
    MetricTypes,
    AnalyticsTypes,
    hmacService,
    ErrorSourceEnum
} from '@nangohq/shared';
import publisher from '../clients/publisher.client.js';
import { WSErrBuilder } from '../utils/web-socket-error.js';
import oAuthSessionService from '../services/oauth-session.service.js';

class OAuthController {
    public async oauthRequest(req: Request, res: Response, _next: NextFunction) {
        const accountId = getAccount(res);
        const environmentId = getEnvironmentId(res);
        const { providerConfigKey } = req.params;
        let connectionId = req.query['connection_id'] as string | undefined;
        const wsClientId = req.query['ws_client_id'] as string | undefined;
        const userScope = req.query['user_scope'] as string | undefined;

        const log = {
            level: 'info' as LogLevel,
            success: false,
            action: LogActionEnum.AUTH,
            start: Date.now(),
            end: Date.now(),
            timestamp: Date.now(),
            connection_id: connectionId as string,
            provider_config_key: providerConfigKey as string,
            environment_id: environmentId
        };

        const activityLogId = await createActivityLog(log);

        try {
            if (!wsClientId) {
                analytics.track(AnalyticsTypes.PRE_WS_OAUTH, accountId);
            }

            await metricsManager.capture(MetricTypes.AUTH_TOKEN_REQUEST_START, 'OAuth request process start', LogActionEnum.AUTH, {
                environmentId: String(environmentId),
                accountId: String(accountId),
                providerConfigKey: String(providerConfigKey),
                connectionId: String(connectionId)
            });

            const callbackUrl = await getOauthCallbackUrl(environmentId);
            const connectionConfig = req.query['params'] != null ? getConnectionConfig(req.query['params']) : {};
            const authorizationParams = req.query['authorization_params'] != null ? getAdditionalAuthorizationParams(req.query['authorization_params']) : {};

            if (connectionId == null) {
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    environment_id: environmentId,
                    activity_log_id: activityLogId as number,
                    timestamp: Date.now(),
                    content: WSErrBuilder.MissingConnectionId().message
                });

                return publisher.notifyErr(res, wsClientId, providerConfigKey, connectionId, WSErrBuilder.MissingConnectionId());
            } else if (providerConfigKey == null) {
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    environment_id: environmentId,
                    activity_log_id: activityLogId as number,
                    timestamp: Date.now(),
                    content: WSErrBuilder.MissingProviderConfigKey().message
                });

                return publisher.notifyErr(res, wsClientId, providerConfigKey, connectionId, WSErrBuilder.MissingProviderConfigKey());
            }

            connectionId = connectionId.toString();

            const hmacEnabled = await hmacService.isEnabled(environmentId);
            if (hmacEnabled) {
                const hmac = req.query['hmac'] as string | undefined;
                if (!hmac) {
                    await createActivityLogMessageAndEnd({
                        level: 'error',
                        environment_id: environmentId,
                        activity_log_id: activityLogId as number,
                        timestamp: Date.now(),
                        content: WSErrBuilder.MissingHmac().message
                    });

                    return publisher.notifyErr(res, wsClientId, providerConfigKey, connectionId, WSErrBuilder.MissingHmac());
                }
                const verified = await hmacService.verify(hmac, environmentId, providerConfigKey, connectionId);

                if (!verified) {
                    await createActivityLogMessageAndEnd({
                        level: 'error',
                        environment_id: environmentId,
                        activity_log_id: activityLogId as number,
                        timestamp: Date.now(),
                        content: WSErrBuilder.InvalidHmac().message
                    });

                    return publisher.notifyErr(res, wsClientId, providerConfigKey, connectionId, WSErrBuilder.InvalidHmac());
                }
            }

            await createActivityLogMessage({
                level: 'info',
                environment_id: environmentId,
                activity_log_id: activityLogId as number,
                content: 'Authorization URL request from the client',
                timestamp: Date.now(),
                url: callbackUrl,
                params: {
                    ...connectionConfig,
                    hmacEnabled
                }
            });

            const config = await configService.getProviderConfig(providerConfigKey, environmentId);

            await updateProviderActivityLog(activityLogId as number, String(config?.provider));

            if (config == null) {
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    environment_id: environmentId,
                    activity_log_id: activityLogId as number,
                    content: WSErrBuilder.UnknownProviderConfigKey(providerConfigKey).message,
                    timestamp: Date.now(),
                    url: callbackUrl
                });

                return publisher.notifyErr(res, wsClientId, providerConfigKey, connectionId, WSErrBuilder.UnknownProviderConfigKey(providerConfigKey));
            }

            let template: ProviderTemplate;
            try {
                template = configService.getTemplate(config.provider);
            } catch {
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    environment_id: environmentId,
                    activity_log_id: activityLogId as number,
                    content: WSErrBuilder.UnkownProviderTemplate(config.provider).message,
                    timestamp: Date.now(),
                    url: callbackUrl
                });

                return publisher.notifyErr(res, wsClientId, providerConfigKey, connectionId, WSErrBuilder.UnkownProviderTemplate(config.provider));
            }

            const session: OAuthSession = {
                providerConfigKey: providerConfigKey,
                provider: config.provider,
                connectionId: connectionId as string,
                callbackUrl: callbackUrl,
                authMode: template.auth_mode,
                codeVerifier: crypto.randomBytes(24).toString('hex'),
                id: uuid.v1(),
                connectionConfig,
                environmentId,
                webSocketClientId: wsClientId
            };

            if (userScope) {
                session.connectionConfig['user_scope'] = userScope;
            }

            await updateSessionIdActivityLog(activityLogId as number, session.id);

            if (config?.oauth_client_id == null || config?.oauth_client_secret == null || config.oauth_scopes == null) {
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    environment_id: environmentId,
                    activity_log_id: activityLogId as number,
                    content: WSErrBuilder.InvalidProviderConfig(providerConfigKey).message,
                    timestamp: Date.now(),
                    auth_mode: template.auth_mode,
                    url: callbackUrl
                });

                return publisher.notifyErr(res, wsClientId, providerConfigKey, connectionId, WSErrBuilder.InvalidProviderConfig(providerConfigKey));
            }

            if (template.auth_mode === ProviderAuthModes.OAuth2) {
                return this.oauth2Request(
                    template as ProviderTemplateOAuth2,
                    config,
                    session,
                    res,
                    connectionConfig,
                    authorizationParams,
                    callbackUrl,
                    activityLogId as number,
                    environmentId,
                    userScope
                );
            } else if (template.auth_mode === ProviderAuthModes.App) {
                const appCallBackUrl = getGlobalAppCallbackUrl();
                return this.appRequest(template, config, session, res, appCallBackUrl, activityLogId as number, environmentId);
            } else if (template.auth_mode === ProviderAuthModes.OAuth1) {
                return this.oauth1Request(template, config, session, res, callbackUrl, activityLogId as number, environmentId);
            }

            await createActivityLogMessageAndEnd({
                level: 'error',
                environment_id: environmentId,
                activity_log_id: activityLogId as number,
                content: WSErrBuilder.UnkownAuthMode(template.auth_mode).message,
                timestamp: Date.now(),
                url: callbackUrl
            });

            return publisher.notifyErr(res, wsClientId, providerConfigKey, connectionId, WSErrBuilder.UnkownAuthMode(template.auth_mode));
        } catch (e) {
            const prettyError = JSON.stringify(e, ['message', 'name'], 2);
            await createActivityLogMessage({
                level: 'error',
                environment_id: environmentId,
                activity_log_id: activityLogId as number,
                content: WSErrBuilder.UnkownError().message + '\n' + prettyError,
                timestamp: Date.now()
            });

            await errorManager.report(e, {
                source: ErrorSourceEnum.PLATFORM,
                operation: LogActionEnum.AUTH,
                environmentId,
                metadata: {
                    providerConfigKey,
                    connectionId
                }
            });

            return publisher.notifyErr(res, wsClientId, providerConfigKey, connectionId, WSErrBuilder.UnkownError(prettyError));
        }
    }

    private async oauth2Request(
        template: ProviderTemplateOAuth2,
        providerConfig: ProviderConfig,
        session: OAuthSession,
        res: Response,
        connectionConfig: Record<string, string>,
        authorizationParams: Record<string, string | undefined>,
        callbackUrl: string,
        activityLogId: number,
        environment_id: number,
        userScope?: string
    ) {
        const oauth2Template = template as ProviderTemplateOAuth2;
        const channel = session.webSocketClientId;
        const providerConfigKey = session.providerConfigKey;
        const connectionId = session.connectionId;

        try {
            if (missesInterpolationParam(template.authorization_url, connectionConfig)) {
                await createActivityLogMessage({
                    level: 'error',
                    environment_id,
                    activity_log_id: activityLogId as number,
                    content: WSErrBuilder.InvalidConnectionConfig(template.authorization_url, JSON.stringify(connectionConfig)).message,
                    timestamp: Date.now(),
                    auth_mode: template.auth_mode,
                    url: callbackUrl,
                    params: {
                        ...connectionConfig
                    }
                });

                return publisher.notifyErr(
                    res,
                    channel,
                    providerConfigKey,
                    connectionId,
                    WSErrBuilder.InvalidConnectionConfig(template.authorization_url, JSON.stringify(connectionConfig))
                );
            }

            if (missesInterpolationParam(template.token_url, connectionConfig)) {
                await createActivityLogMessage({
                    level: 'error',
                    environment_id,
                    activity_log_id: activityLogId as number,
                    content: WSErrBuilder.InvalidConnectionConfig(template.token_url, JSON.stringify(connectionConfig)).message,
                    timestamp: Date.now(),
                    auth_mode: template.auth_mode,
                    url: callbackUrl,
                    params: {
                        ...connectionConfig
                    }
                });

                return publisher.notifyErr(
                    res,
                    channel,
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
                Object.keys(allAuthParams).forEach((key) => (allAuthParams[key] === undefined ? delete allAuthParams[key] : {})); // Remove undefined values.

                await oAuthSessionService.create(session);

                const simpleOAuthClient = new simpleOauth2.AuthorizationCode(
                    oauth2Client.getSimpleOAuth2ClientConfig(providerConfig, template, connectionConfig)
                );

                const authorizationUri = simpleOAuthClient.authorizeURL({
                    redirect_uri: callbackUrl,
                    scope: providerConfig.oauth_scopes ? providerConfig.oauth_scopes.split(',').join(oauth2Template.scope_separator || ' ') : '',
                    state: session.id,
                    ...allAuthParams
                });

                await metricsManager.capture(MetricTypes.AUTH_TOKEN_REQUEST_CALLBACK_RECEIVED, 'OAuth2 callback url received', LogActionEnum.AUTH, {
                    environmentId: String(environment_id),
                    callbackUrl,
                    providerConfigKey: String(providerConfigKey),
                    provider: String(providerConfig.provider),
                    connectionId: String(connectionId),
                    authMode: String(template.auth_mode)
                });

                await createActivityLogMessage({
                    level: 'info',
                    environment_id,
                    activity_log_id: activityLogId as number,
                    content: `Redirecting to ${authorizationUri} for ${providerConfigKey} (connection ${connectionId})`,
                    timestamp: Date.now(),
                    url: callbackUrl,
                    auth_mode: template.auth_mode,
                    params: {
                        ...allAuthParams,
                        ...connectionConfig,
                        grant_type: oauth2Template.token_params?.grant_type as string,
                        scopes: providerConfig.oauth_scopes ? providerConfig.oauth_scopes.split(',').join(oauth2Template.scope_separator || ' ') : '',
                        external_api_url: authorizationUri
                    }
                });

                // if they exit the flow add an end time to have it on record
                await addEndTimeActivityLog(activityLogId as number);

                res.redirect(authorizationUri);
            } else {
                const grantType = oauth2Template.token_params.grant_type;

                await createActivityLogMessage({
                    level: 'error',
                    environment_id,
                    activity_log_id: activityLogId as number,
                    content: WSErrBuilder.UnkownGrantType(grantType).message,
                    timestamp: Date.now(),
                    auth_mode: template.auth_mode,
                    url: callbackUrl,
                    params: {
                        grant_type: grantType,
                        basic_auth_enabled: template.token_request_auth_method === 'basic',
                        ...connectionConfig
                    }
                });

                return publisher.notifyErr(res, channel, providerConfigKey, connectionId, WSErrBuilder.UnkownGrantType(grantType));
            }
        } catch (error: any) {
            const prettyError = JSON.stringify(error, ['message', 'name'], 2);

            const content = WSErrBuilder.UnkownError().message + '\n' + prettyError;

            await metricsManager.capture(MetricTypes.AUTH_TOKEN_REQUEST_FAILURE, `OAuth2 request process failed ${content}`, LogActionEnum.AUTH, {
                callbackUrl,
                environmentId: String(environment_id),
                providerConfigKey: String(providerConfigKey),
                connectionId: String(connectionId)
            });

            await createActivityLogMessage({
                level: 'error',
                environment_id,
                activity_log_id: activityLogId as number,
                content,
                timestamp: Date.now(),
                auth_mode: template.auth_mode,
                url: callbackUrl,
                params: {
                    ...connectionConfig
                }
            });

            return publisher.notifyErr(res, channel, providerConfigKey, connectionId, WSErrBuilder.UnkownError(prettyError));
        }
    }

    private async appRequest(
        template: ProviderTemplate,
        providerConfig: ProviderConfig,
        session: OAuthSession,
        res: Response,
        callbackUrl: string,
        activityLogId: number,
        environment_id: number
    ) {
        const channel = session.webSocketClientId;
        const providerConfigKey = session.providerConfigKey;
        const connectionId = session.connectionId;

        const connectionConfig = {
            appPublicLink: providerConfig.app_link
        };

        try {
            if (missesInterpolationParam(template.authorization_url, connectionConfig)) {
                await createActivityLogMessage({
                    level: 'error',
                    environment_id,
                    activity_log_id: activityLogId as number,
                    content: WSErrBuilder.InvalidConnectionConfig(template.authorization_url, JSON.stringify(connectionConfig)).message,
                    timestamp: Date.now(),
                    auth_mode: template.auth_mode,
                    url: callbackUrl,
                    params: {
                        ...connectionConfig
                    }
                });

                return publisher.notifyErr(
                    res,
                    channel,
                    providerConfigKey,
                    connectionId,
                    WSErrBuilder.InvalidConnectionConfig(template.authorization_url, JSON.stringify(connectionConfig))
                );
            }

            await oAuthSessionService.create(session);

            const appUrl = interpolateStringFromObject(template.authorization_url, {
                connectionConfig
            });

            const params = new URLSearchParams({
                state: session.id
            });

            const authorizationUri = `${appUrl}?${params.toString()}`;

            await createActivityLogMessage({
                level: 'info',
                environment_id,
                activity_log_id: activityLogId as number,
                content: `Redirecting to ${authorizationUri} for ${providerConfigKey} (connection ${connectionId})`,
                timestamp: Date.now(),
                url: callbackUrl,
                auth_mode: template.auth_mode,
                params: {
                    ...connectionConfig,
                    external_api_url: authorizationUri
                }
            });

            await addEndTimeActivityLog(activityLogId as number);

            res.redirect(authorizationUri);
        } catch (error: any) {
            const prettyError = JSON.stringify(error, ['message', 'name'], 2);

            const content = WSErrBuilder.UnkownError().message + '\n' + prettyError;

            await createActivityLogMessage({
                level: 'error',
                environment_id,
                activity_log_id: activityLogId as number,
                content,
                timestamp: Date.now(),
                auth_mode: template.auth_mode,
                url: callbackUrl,
                params: {
                    ...connectionConfig
                }
            });

            return publisher.notifyErr(res, channel, providerConfigKey, connectionId, WSErrBuilder.UnkownError(prettyError));
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
        activityLogId: number,
        environment_id: number
    ) {
        const callbackParams = new URLSearchParams({
            state: session.id
        });
        const channel = session.webSocketClientId;
        const providerConfigKey = session.providerConfigKey;
        const connectionId = session.connectionId;

        const oAuth1CallbackURL = `${callbackUrl}?${callbackParams.toString()}`;

        await createActivityLogMessage({
            level: 'info',
            environment_id,
            activity_log_id: activityLogId as number,
            content: `OAuth callback URL was retrieved`,
            timestamp: Date.now(),
            auth_mode: template.auth_mode,
            url: oAuth1CallbackURL
        });

        const oAuth1Client = new OAuth1Client(config, template, oAuth1CallbackURL);

        let tokenResult: OAuth1RequestTokenResult | undefined;
        try {
            tokenResult = await oAuth1Client.getOAuthRequestToken();
        } catch (e) {
            const error = e as { statusCode: number; data?: any };
            await errorManager.report(new Error('token_retrieval_error'), {
                source: ErrorSourceEnum.PLATFORM,
                operation: LogActionEnum.AUTH,
                environmentId: session.environmentId,
                metadata: error
            });

            await createActivityLogMessage({
                level: 'error',
                environment_id,
                activity_log_id: activityLogId as number,
                content: WSErrBuilder.TokenError().message,
                timestamp: Date.now(),
                auth_mode: template.auth_mode,
                url: oAuth1CallbackURL,
                params: {
                    ...error
                }
            });

            return publisher.notifyErr(res, channel, providerConfigKey, connectionId, WSErrBuilder.TokenError());
        }

        session.requestTokenSecret = tokenResult.request_token_secret;
        await oAuthSessionService.create(session);
        const redirectUrl = oAuth1Client.getAuthorizationURL(tokenResult);

        await createActivityLogMessage({
            level: 'info',
            environment_id,
            activity_log_id: activityLogId as number,
            content: `Request token for ${session.providerConfigKey} (connection: ${session.connectionId}) was a success. Redirecting to: ${redirectUrl}`,
            timestamp: Date.now(),
            auth_mode: template.auth_mode,
            url: oAuth1CallbackURL
        });

        // if they end the flow early, be sure to have an end time
        await addEndTimeActivityLog(activityLogId as number);

        await metricsManager.capture(MetricTypes.AUTH_TOKEN_REQUEST_CALLBACK_RECEIVED, 'OAuth1 callback url received', LogActionEnum.AUTH, {
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

    public async oauthCallback(req: Request, res: Response, _: NextFunction) {
        const { state } = req.query;

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

        const activityLogId = await findActivityLogBySession(session.id);

        const channel = session.webSocketClientId;
        const providerConfigKey = session.providerConfigKey;
        const connectionId = session.connectionId;

        await updateProviderConfigAndConnectionIdActivityLog(activityLogId as number, providerConfigKey, connectionId);

        try {
            await createActivityLogMessage({
                level: 'debug',
                environment_id: session.environmentId,
                activity_log_id: activityLogId as number,
                content: `Received callback from ${session.providerConfigKey} for connection ${session.connectionId}`,
                state: state as string,
                timestamp: Date.now(),
                url: req.originalUrl
            });

            const template = configService.getTemplate(session.provider);
            const config = (await configService.getProviderConfig(session.providerConfigKey, session.environmentId))!;

            if (session.authMode === ProviderAuthModes.OAuth2) {
                return this.oauth2Callback(template as ProviderTemplateOAuth2, config, session, req, res, activityLogId as number, session.environmentId);
            } else if (session.authMode === ProviderAuthModes.OAuth1) {
                return this.oauth1Callback(template, config, session, req, res, activityLogId as number, session.environmentId);
            }

            await createActivityLogMessage({
                level: 'error',
                environment_id: session.environmentId,
                activity_log_id: activityLogId as number,
                content: WSErrBuilder.UnkownAuthMode(session.authMode).message,
                state: state as string,
                timestamp: Date.now(),
                auth_mode: session.authMode,
                url: req.originalUrl
            });

            return publisher.notifyErr(res, channel, providerConfigKey, connectionId, WSErrBuilder.UnkownAuthMode(session.authMode));
        } catch (e) {
            const prettyError = JSON.stringify(e, ['message', 'name'], 2);

            await errorManager.report(e, {
                source: ErrorSourceEnum.PLATFORM,
                operation: LogActionEnum.AUTH,
                environmentId: session.environmentId,
                metadata: errorManager.getExpressRequestContext(req)
            });

            const content = WSErrBuilder.UnkownError().message + '\n' + prettyError;

            await createActivityLogMessage({
                level: 'error',
                environment_id: session.environmentId,
                activity_log_id: activityLogId as number,
                content,
                timestamp: Date.now(),
                params: {
                    ...errorManager.getExpressRequestContext(req)
                }
            });

            return publisher.notifyErr(res, channel, providerConfigKey, connectionId, WSErrBuilder.UnkownError(prettyError));
        }
    }

    private async oauth2Callback(
        template: ProviderTemplateOAuth2,
        config: ProviderConfig,
        session: OAuthSession,
        req: Request,
        res: Response,
        activityLogId: number,
        environment_id: number
    ) {
        const { code } = req.query;
        const providerConfigKey = session.providerConfigKey;
        const connectionId = session.connectionId;
        const channel = session.webSocketClientId;
        const callbackMetadata = getConnectionMetadataFromCallbackRequest(req.query, template);

        if (!code) {
            await createActivityLogMessage({
                level: 'error',
                environment_id,
                activity_log_id: activityLogId as number,
                content: WSErrBuilder.InvalidCallbackOAuth2().message,
                timestamp: Date.now(),
                params: {
                    scopes: config.oauth_scopes,
                    basic_auth_enabled: template.token_request_auth_method === 'basic',
                    token_params: template?.token_params as string
                }
            });

            await metricsManager.capture(MetricTypes.AUTH_TOKEN_REQUEST_FAILURE, 'OAuth2 token request failed with a missing code', LogActionEnum.AUTH, {
                environmentId: String(environment_id),
                providerConfigKey: String(providerConfigKey),
                provider: String(config.provider),
                connectionId: String(connectionId),
                authMode: String(template.auth_mode)
            });

            return publisher.notifyErr(res, channel, providerConfigKey, connectionId, WSErrBuilder.InvalidCallbackOAuth2());
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

            await createActivityLogMessage({
                level: 'info',
                environment_id,
                activity_log_id: activityLogId as number,
                content: `Initiating token request for ${session.provider} using ${providerConfigKey} for the connection ${connectionId}`,
                timestamp: Date.now(),
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

            await createActivityLogMessage({
                level: 'info',
                environment_id,
                activity_log_id: activityLogId as number,
                content: `Token response was received for ${session.provider} using ${providerConfigKey} for the connection ${connectionId}`,
                timestamp: Date.now()
            });

            const tokenMetadata = getConnectionMetadataFromTokenResponse(rawCredentials, template);

            let parsedRawCredentials: AuthCredentials;

            try {
                parsedRawCredentials = connectionService.parseRawCredentials(rawCredentials, ProviderAuthModes.OAuth2);
            } catch (e) {
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    environment_id,
                    activity_log_id: activityLogId as number,
                    content: `The OAuth token response from the server could not be parsed - OAuth flow failed. The server returned:\n${JSON.stringify(
                        rawCredentials
                    )}`,
                    timestamp: Date.now()
                });

                await metricsManager.capture(
                    MetricTypes.AUTH_TOKEN_REQUEST_FAILURE,
                    'OAuth2 token request failed, response from the server could not be parsed',
                    LogActionEnum.AUTH,
                    {
                        environmentId: String(environment_id),
                        providerConfigKey: String(providerConfigKey),
                        provider: String(config.provider),
                        connectionId: String(connectionId),
                        authMode: String(template.auth_mode)
                    }
                );

                return publisher.notifyErr(res, channel, providerConfigKey, connectionId, WSErrBuilder.UnkownError());
            }

            const accountId = (await environmentService.getAccountIdFromEnvironment(session.environmentId)) as number;

            const [updatedConnection] = await connectionService.upsertConnection(
                connectionId,
                providerConfigKey,
                session.provider,
                parsedRawCredentials,
                { ...session.connectionConfig, ...tokenMetadata, ...callbackMetadata },
                session.environmentId,
                accountId
            );

            await updateProviderActivityLog(activityLogId, session.provider);

            await createActivityLogMessageAndEnd({
                level: 'debug',
                environment_id,
                activity_log_id: activityLogId as number,
                content: `OAuth connection for ${providerConfigKey} was successful`,
                timestamp: Date.now(),
                auth_mode: template.auth_mode,
                params: {
                    ...additionalTokenParams,
                    code: code as string,
                    scopes: config.oauth_scopes,
                    basic_auth_enabled: template.token_request_auth_method === 'basic',
                    token_params: template?.token_params as string
                }
            });

            if (updatedConnection) {
                await connectionCreatedHook(
                    {
                        id: updatedConnection.id,
                        connection_id: connectionId,
                        provider_config_key: providerConfigKey,
                        environment_id
                    },
                    session.provider
                );
            }

            await updateSuccessActivityLog(activityLogId, true);

            await metricsManager.capture(MetricTypes.AUTH_TOKEN_REQUEST_SUCCESS, 'OAuth2 token request succeeded', LogActionEnum.AUTH, {
                environmentId: String(environment_id),
                providerConfigKey: String(providerConfigKey),
                provider: String(config.provider),
                connectionId: String(connectionId),
                authMode: String(template.auth_mode)
            });

            return publisher.notifySuccess(res, channel, providerConfigKey, connectionId);
        } catch (e) {
            const prettyError = JSON.stringify(e, ['message', 'name'], 2);
            await errorManager.report(e, {
                source: ErrorSourceEnum.PLATFORM,
                operation: LogActionEnum.AUTH,
                environmentId: session.environmentId,
                metadata: {
                    providerConfigKey: session.providerConfigKey,
                    connectionId: session.connectionId
                }
            });

            await metricsManager.capture(MetricTypes.AUTH_TOKEN_REQUEST_FAILURE, 'OAuth2 token request failed', LogActionEnum.AUTH, {
                environmentId: String(environment_id),
                providerConfigKey: String(providerConfigKey),
                provider: String(config.provider),
                connectionId: String(connectionId),
                authMode: String(template.auth_mode)
            });

            await createActivityLogMessageAndEnd({
                level: 'error',
                environment_id,
                activity_log_id: activityLogId as number,
                content: WSErrBuilder.UnkownError().message + '\n' + prettyError,
                timestamp: Date.now()
            });

            return publisher.notifyErr(res, channel, providerConfigKey, connectionId, WSErrBuilder.UnkownError(prettyError));
        }
    }

    private async oauth1Callback(
        template: ProviderTemplate,
        config: ProviderConfig,
        session: OAuthSession,
        req: Request,
        res: Response,
        activityLogId: number,
        environment_id: number
    ) {
        const { oauth_token, oauth_verifier } = req.query;
        const providerConfigKey = session.providerConfigKey;
        const connectionId = session.connectionId;
        const channel = session.webSocketClientId;
        const metadata = getConnectionMetadataFromCallbackRequest(req.query, template);

        if (!oauth_token || !oauth_verifier) {
            await createActivityLogMessageAndEnd({
                level: 'error',
                environment_id,
                activity_log_id: activityLogId as number,
                content: WSErrBuilder.InvalidCallbackOAuth1().message,
                timestamp: Date.now()
            });

            return publisher.notifyErr(res, channel, providerConfigKey, connectionId, WSErrBuilder.InvalidCallbackOAuth1());
        }

        const oauth_token_secret = session.requestTokenSecret!;

        const accountId = (await environmentService.getAccountIdFromEnvironment(session.environmentId)) as number;

        const oAuth1Client = new OAuth1Client(config, template, '');
        oAuth1Client
            .getOAuthAccessToken(oauth_token as string, oauth_token_secret, oauth_verifier as string)
            .then(async (accessTokenResult) => {
                const parsedAccessTokenResult = connectionService.parseRawCredentials(accessTokenResult, ProviderAuthModes.OAuth1);

                connectionService.upsertConnection(
                    connectionId,
                    providerConfigKey,
                    session.provider,
                    parsedAccessTokenResult,
                    { ...session.connectionConfig, ...metadata },
                    session.environmentId,
                    accountId
                );

                await updateSuccessActivityLog(activityLogId, true);

                await createActivityLogMessageAndEnd({
                    level: 'info',
                    environment_id,
                    activity_log_id: activityLogId as number,
                    content: `OAuth connection for ${providerConfigKey} was successful`,
                    timestamp: Date.now(),
                    auth_mode: template.auth_mode,
                    url: session.callbackUrl
                });

                await metricsManager.capture(MetricTypes.AUTH_TOKEN_REQUEST_SUCCESS, 'OAuth1 token request succeeded', LogActionEnum.AUTH, {
                    environmentId: String(environment_id),
                    providerConfigKey: String(providerConfigKey),
                    provider: String(config.provider),
                    connectionId: String(connectionId),
                    authMode: String(template.auth_mode)
                });

                return publisher.notifySuccess(res, channel, providerConfigKey, connectionId);
            })
            .catch(async (e) => {
                errorManager.report(e, {
                    source: ErrorSourceEnum.PLATFORM,
                    operation: LogActionEnum.AUTH,
                    environmentId: session.environmentId,
                    metadata: {
                        ...metadata,
                        providerConfigKey: session.providerConfigKey,
                        connectionId: session.connectionId
                    }
                });
                const prettyError = JSON.stringify(e, ['message', 'name'], 2);

                await metricsManager.capture(MetricTypes.AUTH_TOKEN_REQUEST_FAILURE, 'OAuth1 token request failed', LogActionEnum.AUTH, {
                    environmentId: String(environment_id),
                    providerConfigKey: String(providerConfigKey),
                    provider: String(config.provider),
                    connectionId: String(connectionId),
                    authMode: String(template.auth_mode)
                });

                await createActivityLogMessageAndEnd({
                    level: 'error',
                    environment_id,
                    activity_log_id: activityLogId as number,
                    content: WSErrBuilder.UnkownError().message + '\n' + prettyError,
                    timestamp: Date.now()
                });

                return publisher.notifyErr(res, channel, providerConfigKey, connectionId, WSErrBuilder.UnkownError(prettyError));
            });
    }
}

export default new OAuthController();
