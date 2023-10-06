import type { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import * as uuid from 'uuid';
import * as crypto from 'node:crypto';
import type { LogLevel } from '@nangohq/shared';
import {
    getAccount,
    getEnvironmentId,
    environmentService,
    AuthCredentials,
    AppCredentials,
    SyncClient,
    createActivityLog,
    errorManager,
    analytics,
    interpolateStringFromObject,
    createActivityLogAndLogMessage,
    createActivityLogMessage,
    updateSuccess as updateSuccessActivityLog,
    AuthModes as ProviderAuthModes,
    updateProvider as updateProviderActivityLog,
    configService,
    connectionService,
    createActivityLogMessageAndEnd,
    AuthModes,
    hmacService,
    ErrorSourceEnum,
    LogActionEnum
} from '@nangohq/shared';
import oAuthSessionService from '../services/oauth-session.service.js';

class AppAuthController {
    async create(req: Request, res: Response, next: NextFunction) {
        const accountId = getAccount(res);
        const environmentId = getEnvironmentId(res);
        const { providerConfigKey } = req.params;
        const connectionId = req.query['connection_id'] as string | undefined;

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
            analytics.track('server:pre_appauth', accountId);

            if (!providerConfigKey) {
                errorManager.errRes(res, 'missing_connection');

                return;
            }

            if (!connectionId) {
                errorManager.errRes(res, 'missing_connection_id');

                return;
            }

            const hmacEnabled = await hmacService.isEnabled(environmentId);
            if (hmacEnabled) {
                const hmac = req.query['hmac'] as string | undefined;
                if (!hmac) {
                    await createActivityLogMessageAndEnd({
                        level: 'error',
                        activity_log_id: activityLogId as number,
                        timestamp: Date.now(),
                        content: 'Missing HMAC in query params'
                    });

                    errorManager.errRes(res, 'missing_hmac');

                    return;
                }
                const verified = await hmacService.verify(hmac as string, environmentId, providerConfigKey as string, connectionId as string);
                if (!verified) {
                    await createActivityLogMessageAndEnd({
                        level: 'error',
                        activity_log_id: activityLogId as number,
                        timestamp: Date.now(),
                        content: 'Invalid HMAC'
                    });

                    errorManager.errRes(res, 'invalid_hmac');

                    return;
                }
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

            await updateProviderActivityLog(activityLogId as number, String(config?.provider));

            await createActivityLogMessage({
                level: 'info',
                activity_log_id: activityLogId as number,
                content: `App connection creation was successful`,
                timestamp: Date.now()
            });

            await updateSuccessActivityLog(activityLogId as number, true);

            await connectionService.upsertUnauthConnection(
                connectionId as string,
                providerConfigKey as string,
                config?.provider as string,
                environmentId,
                accountId
            );

            const appUrl = interpolateStringFromObject(template.authorization_url, {
                connectionConfig: {
                    appPublicLink: config.app_link
                }
            });

            res.status(200).send({
                redirectUrl: appUrl,
                providerConfigKey: providerConfigKey as string,
                connectionId: connectionId as string
            });
        } catch (err) {
            const prettyError = JSON.stringify(err, ['message', 'name'], 2);

            await createActivityLogMessage({
                level: 'error',
                activity_log_id: activityLogId as number,
                content: `Error during Unauth create: ${prettyError}`,
                timestamp: Date.now()
            });

            await errorManager.report(err, {
                source: ErrorSourceEnum.PLATFORM,
                operation: LogActionEnum.AUTH,
                environmentId,
                metadata: {
                    providerConfigKey,
                    connectionId
                }
            });
            next(err);
        }
    }
    public async reconcile(req: Request, res: Response, _: NextFunction) {
        if (!req.body) {
            res.sendStatus(400);
        }

        const { installationId, connectionId } = req.body;

        if (!installationId || !connectionId) {
            res.sendStatus(400);
        }

        const session = await oAuthSessionService.findByConnectionId(installationId);

        if (!session) {
            res.sendStatus(404);
            return;
        }

        const { credentials: rawCredentials, app_id, access_tokens_url } = session.connectionConfig;

        const credentials: AppCredentials = {
            type: AuthModes.App,
            access_token: (rawCredentials as any)?.token,
            expires_at: (rawCredentials as any)?.expires_at,
            raw: rawCredentials as unknown as Record<string, unknown>
        };

        const connectionConfig = {
            app_id: app_id as string,
            access_tokens_url: access_tokens_url as string
        };

        const accountId = (await environmentService.getAccountIdFromEnvironment(session.environmentId)) as number;

        const [updatedConnection] = await connectionService.upsertConnection(
            connectionId,
            session.providerConfigKey,
            session.provider,
            credentials as unknown as AuthCredentials,
            connectionConfig,
            session.environmentId,
            accountId
        );

        if (updatedConnection) {
            const syncClient = await SyncClient.getInstance();
            await syncClient?.initiate(updatedConnection.id);
        }

        //await oAuthSessionService.delete(session.id as string);

        res.sendStatus(200);
    }

    /**
     * App Webhook
     * @desc receive a POST request from an app installation with
     * the information to be able to obtain an access token to make requests
     */
    public async webhook(req: Request, res: Response, _: NextFunction) {
        console.log('webhook');
        console.log(req.body);
        if (!req.body) {
            return res.sendStatus(400);
        }

        if (req.body.action === 'created') {
            const { installation } = req.body;
            const { id, account } = installation;
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
                    id,
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
                    connectionId: id,
                    webSocketClientId: ''
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
