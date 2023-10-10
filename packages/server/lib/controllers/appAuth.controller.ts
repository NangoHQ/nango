import type { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import * as uuid from 'uuid';
import * as crypto from 'node:crypto';
import type { LogLevel } from '@nangohq/shared';
import {
    environmentService,
    AuthCredentials,
    NangoError,
    SyncClient,
    findActivityLogBySession,
    errorManager,
    analytics,
    createActivityLogAndLogMessage,
    createActivityLogMessage,
    updateSuccess as updateSuccessActivityLog,
    AuthModes as ProviderAuthModes,
    configService,
    connectionService,
    createActivityLogMessageAndEnd,
    AuthModes,
    ErrorSourceEnum,
    LogActionEnum
} from '@nangohq/shared';
import { missesInterpolationParam } from '../utils/utils.js';
import { WSErrBuilder } from '../utils/web-socket-error.js';
import oAuthSessionService from '../services/oauth-session.service.js';
import wsClient from '../clients/web-socket.client.js';

class AppAuthController {
    async connect(req: Request, res: Response, _next: NextFunction) {
        const installation_id = req.query['installation_id'] as string | undefined;
        const state = req.query['state'] as string;

        if (!state || !installation_id) {
            res.sendStatus(400);
            return;
        }

        const session = await oAuthSessionService.findById(state);

        if (!session) {
            res.sendStatus(404);
            return;
        } else {
            await oAuthSessionService.delete(session.id);
        }
        const accountId = (await environmentService.getAccountIdFromEnvironment(session.environmentId)) as number;

        analytics.track('server:pre_appauth', accountId);

        const { providerConfigKey, connectionId, webSocketClientId: wsClientId, environmentId } = session;
        const activityLogId = await findActivityLogBySession(session.id);

        try {
            if (!providerConfigKey) {
                errorManager.errRes(res, 'missing_connection');

                return;
            }

            if (!connectionId) {
                errorManager.errRes(res, 'missing_connection_id');

                return;
            }

            const config = await configService.getProviderConfig(providerConfigKey as string, environmentId);

            if (config == null) {
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    activity_log_id: activityLogId as number,
                    content: `Error during API Key auth: config not found`,
                    timestamp: Date.now()
                });

                errorManager.errRes(res, 'unknown_provider_config');

                return;
            }

            const template = await configService.getTemplate(config?.provider as string);

            if (template.auth_mode !== AuthModes.App) {
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    activity_log_id: activityLogId as number,
                    timestamp: Date.now(),
                    content: `Provider ${config?.provider} does not support app creation`
                });

                errorManager.errRes(res, 'invalid_auth_mode');

                return;
            }

            const connectionConfig = {
                installation_id: installation_id,
                app_id: config?.oauth_client_id
            };

            if (missesInterpolationParam(template.token_url, connectionConfig)) {
                await createActivityLogMessage({
                    level: 'error',
                    activity_log_id: activityLogId as number,
                    content: WSErrBuilder.InvalidConnectionConfig(template.token_url, JSON.stringify(connectionConfig)).message,
                    timestamp: Date.now(),
                    auth_mode: template.auth_mode,
                    url: req.originalUrl,
                    params: {
                        ...connectionConfig
                    }
                });

                return wsClient.notifyErr(
                    res,
                    wsClientId,
                    providerConfigKey,
                    connectionId,
                    WSErrBuilder.InvalidConnectionConfig(template.token_url, JSON.stringify(connectionConfig))
                );
            }

            const { success, error, response: credentials } = await connectionService.getAppCredentials(template, config, connectionConfig);

            if (!success || !credentials) {
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    activity_log_id: activityLogId as number,
                    content: `Error during app token retrieval call: ${error?.message}`,
                    timestamp: Date.now()
                });

                return wsClient.notifyErr(res, wsClientId, providerConfigKey, connectionId, error as NangoError);
            }

            await updateSuccessActivityLog(activityLogId as number, true);

            const [updatedConnection] = await connectionService.upsertConnection(
                connectionId,
                providerConfigKey,
                session.provider,
                credentials as unknown as AuthCredentials,
                connectionConfig,
                environmentId,
                accountId
            );

            if (updatedConnection) {
                const syncClient = await SyncClient.getInstance();
                await syncClient?.initiate(updatedConnection.id);
            }

            await createActivityLogMessageAndEnd({
                level: 'info',
                activity_log_id: activityLogId as number,
                content: 'App connection was successful and credentials were saved',
                timestamp: Date.now()
            });

            return wsClient.notifySuccess(res, wsClientId, providerConfigKey, connectionId);
        } catch (err) {
            const prettyError = JSON.stringify(err, ['message', 'name'], 2);

            const content = WSErrBuilder.UnkownError().message + '\n' + prettyError;

            await createActivityLogMessage({
                level: 'error',
                activity_log_id: activityLogId as number,
                content,
                timestamp: Date.now(),
                auth_mode: AuthModes.App,
                url: req.originalUrl
            });

            return wsClient.notifyErr(res, wsClientId, providerConfigKey, connectionId, WSErrBuilder.UnkownError(prettyError));
        }
    }

    /**
     * App Webhook
     * @desc receive a POST request from an app installation with
     * the information to be able to obtain an access token to make requests
     */
    public async webhook(req: Request, res: Response, _: NextFunction) {
        if (!req.body) {
            return res.sendStatus(400);
        }

        if (req.body.action === 'created') {
            const { installation } = req.body;
            const { id: installationId, account } = installation;
            const { access_tokens_url, app_id } = installation;
            const { sender } = req.body;
            const { id: senderId, login: senderLogin } = sender;

            const config = await configService.getConfigByClientId(app_id);

            if (config == null) {
                const errorMessage = `No provider config found for app id: ${app_id}`;
                const e = new Error(errorMessage);

                errorManager.report(e, {
                    source: ErrorSourceEnum.PLATFORM,
                    operation: LogActionEnum.AUTH,
                    metadata: errorManager.getExpressRequestContext(req)
                });
                return res.sendStatus(404);
            }

            const log = {
                level: 'info' as LogLevel,
                success: false,
                action: LogActionEnum.AUTH,
                start: Date.now(),
                end: Date.now(),
                timestamp: Date.now(),
                connection_id: '',
                provider_config_key: config.unique_key,
                environment_id: config.environment_id
            };

            await createActivityLogAndLogMessage(log, {
                level: 'debug',
                content: `Received app webhook from ${config.unique_key}`,
                state: senderId,
                timestamp: Date.now(),
                url: req.originalUrl,
                params: {
                    installation: JSON.stringify(installation),
                    installationId,
                    account: JSON.stringify(account),
                    senderId,
                    senderLogin
                }
            });

            const privateKeyBase64 = config.oauth_client_secret;

            let privateKey = Buffer.from(privateKeyBase64, 'base64').toString('utf8');
            privateKey = privateKey.replace('-----BEGIN RSA PRIVATE KEY-----', '-----BEGIN RSA PRIVATE KEY-----\n');
            privateKey = privateKey.replace('-----END RSA PRIVATE KEY-----', '\n-----END RSA PRIVATE KEY-----');
            privateKey = privateKey.replace(/(.{64})/g, '$1\n');

            const now = Math.floor(Date.now() / 1000);
            const expiration = now + 10 * 60;

            const payload = {
                iat: now,
                exp: expiration,
                iss: app_id
            };

            const token = jwt.sign(payload, privateKey, { algorithm: 'RS256' });

            try {
                const tokenResponse = await axios.post(
                    access_tokens_url,
                    {},
                    {
                        headers: {
                            Authorization: `Bearer ${token}`,
                            Accept: 'application/vnd.github.v3+json'
                        }
                    }
                );

                await oAuthSessionService.create({
                    provider: config.provider,
                    providerConfigKey: config.unique_key,
                    environmentId: config.environment_id,
                    callbackUrl: '',
                    authMode: ProviderAuthModes.App,
                    codeVerifier: crypto.randomBytes(24).toString('hex'),
                    id: uuid.v1(),
                    connectionConfig: {
                        credentials: tokenResponse.data,
                        access_tokens_url,
                        app_id
                    },
                    connectionId: '',
                    webSocketClientId: installationId
                });
            } catch (e) {
                console.log(e);
            }
        }

        res.sendStatus(200);

        return;
    }
}

export default new AppAuthController();
