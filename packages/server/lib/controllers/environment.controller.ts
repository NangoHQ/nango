import type { Request, Response, NextFunction } from 'express';
import {
    accountService,
    hmacService,
    environmentService,
    errorManager,
    getBaseUrl,
    isCloud,
    getWebsocketsPath,
    getOauthCallbackUrl,
    getGlobalWebhookReceiveUrl,
    getEnvironmentId
} from '@nangohq/shared';
import { packageJsonFile, getUserAccountAndEnvironmentFromSession } from '../utils/utils.js';

class EnvironmentController {
    async meta(req: Request, res: Response, next: NextFunction) {
        try {
            const { success: sessionSuccess, error: sessionError, response } = await getUserAccountAndEnvironmentFromSession(req);
            if (!sessionSuccess || response === null) {
                errorManager.errResFromNangoErr(res, sessionError);
                return;
            }
            const { account } = response;

            const environments = await environmentService.getEnvironmentsByAccountId(account.id);
            const version = packageJsonFile().version;
            res.status(200).send({ environments, version });
        } catch (err) {
            next(err);
        }
    }

    async getEnvironment(req: Request, res: Response, next: NextFunction) {
        try {
            const { success: sessionSuccess, error: sessionError, response } = await getUserAccountAndEnvironmentFromSession(req);
            if (!sessionSuccess || response === null) {
                errorManager.errResFromNangoErr(res, sessionError);
                return;
            }
            const { environment, account, user } = response;

            if (!isCloud()) {
                environment.websockets_path = getWebsocketsPath();
                if (process.env[`NANGO_SECRET_KEY_${environment.name.toUpperCase()}`]) {
                    environment.secret_key = process.env[`NANGO_SECRET_KEY_${environment.name.toUpperCase()}`] as string;
                    environment.secret_key_rotatable = false;
                }

                if (process.env[`NANGO_PUBLIC_KEY_${environment.name.toUpperCase()}`]) {
                    environment.public_key = process.env[`NANGO_PUBLIC_KEY_${environment.name.toUpperCase()}`] as string;
                    environment.public_key_rotatable = false;
                }
            }

            environment.callback_url = await getOauthCallbackUrl(environment.id);
            const webhookBaseUrl = await getGlobalWebhookReceiveUrl();
            environment.webhook_receive_url = `${webhookBaseUrl}/${environment.uuid}`;

            const environmentVariables = await environmentService.getEnvironmentVariables(environment.id);

            res.status(200).send({
                account: { ...environment, env_variables: environmentVariables, host: getBaseUrl(), uuid: account.uuid, email: user.email }
            });
        } catch (err) {
            next(err);
        }
    }

    async getHmacDigest(req: Request, res: Response, next: NextFunction) {
        try {
            const { success: sessionSuccess, error: sessionError, response } = await getUserAccountAndEnvironmentFromSession(req);
            if (!sessionSuccess || response === null) {
                errorManager.errResFromNangoErr(res, sessionError);
                return;
            }
            const { environment } = response;
            const { provider_config_key: providerConfigKey, connection_id: connectionId } = req.query;

            if (!providerConfigKey) {
                errorManager.errRes(res, 'missing_provider_config_key');
                return;
            }

            if (!connectionId) {
                errorManager.errRes(res, 'missing_connection_id');
                return;
            }

            if (environment.hmac_enabled && environment.hmac_key) {
                const digest = await hmacService.digest(environment.id, providerConfigKey as string, connectionId as string);
                res.status(200).send({ hmac_digest: digest });
            } else {
                res.status(200).send({ hmac_digest: null });
            }
        } catch (err) {
            next(err);
        }
    }

    async getAdminAuthInfo(req: Request, res: Response, next: NextFunction) {
        try {
            const { connection_id: connectionId } = req.query;

            if (!connectionId) {
                errorManager.errRes(res, 'missing_connection_id');
                return;
            }

            const integration_key = process.env['NANGO_SLACK_INTEGRATION_KEY'] || 'slack';
            const nangoAdminUUID = process.env['NANGO_ADMIN_UUID'];
            const env = 'prod';
            const info = await accountService.getAccountAndEnvironmentIdByUUID(nangoAdminUUID as string, env);
            const digest = await hmacService.digest(info?.environmentId as number, integration_key, connectionId as string);
            const { environment } = await environmentService.getAccountAndEnvironmentById(info?.accountId as number, env);

            res.status(200).send({ hmac_digest: digest, public_key: environment?.public_key, integration_key });
        } catch (err) {
            next(err);
        }
    }

    async updateCallback(req: Request, res: Response, next: NextFunction) {
        try {
            if (req.body == null) {
                errorManager.errRes(res, 'missing_body');
                return;
            }

            if (req.body['callback_url'] == null) {
                errorManager.errRes(res, 'missing_callback_url');
                return;
            }

            const { success: sessionSuccess, error: sessionError, response } = await getUserAccountAndEnvironmentFromSession(req);
            if (!sessionSuccess || response === null) {
                errorManager.errResFromNangoErr(res, sessionError);
                return;
            }
            const { environment } = response;

            await environmentService.editCallbackUrl(req.body['callback_url'], environment.id);
            res.status(200).send();
        } catch (err) {
            next(err);
        }
    }

    async updateWebhookURL(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.body) {
                errorManager.errRes(res, 'missing_body');
                return;
            }

            const { success: sessionSuccess, error: sessionError, response } = await getUserAccountAndEnvironmentFromSession(req);
            if (!sessionSuccess || response === null) {
                errorManager.errResFromNangoErr(res, sessionError);
                return;
            }
            const { environment } = response;

            await environmentService.editWebhookUrl(req.body['webhook_url'], environment.id);
            res.status(200).send();
        } catch (err) {
            next(err);
        }
    }

    async updateAlwaysSendWebhook(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.body) {
                errorManager.errRes(res, 'missing_body');
                return;
            }

            const { success: sessionSuccess, error: sessionError, response } = await getUserAccountAndEnvironmentFromSession(req);
            if (!sessionSuccess || response === null) {
                errorManager.errResFromNangoErr(res, sessionError);
                return;
            }
            const { environment } = response;

            await environmentService.editAlwaysSendWebhook(req.body['always_send_webhook'], environment.id);
            res.status(200).send();
        } catch (err) {
            next(err);
        }
    }

    async updateHmacEnabled(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.body) {
                errorManager.errRes(res, 'missing_body');
                return;
            }

            const { success: sessionSuccess, error: sessionError, response } = await getUserAccountAndEnvironmentFromSession(req);
            if (!sessionSuccess || response === null) {
                errorManager.errResFromNangoErr(res, sessionError);
                return;
            }
            const { environment } = response;

            await environmentService.editHmacEnabled(req.body['hmac_enabled'], environment.id);
            res.status(200).send();
        } catch (err) {
            next(err);
        }
    }

    async updateSlackNotificationsEnabled(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.body) {
                errorManager.errRes(res, 'missing_body');
                return;
            }

            const { success: sessionSuccess, error: sessionError, response } = await getUserAccountAndEnvironmentFromSession(req);
            if (!sessionSuccess || response === null) {
                errorManager.errResFromNangoErr(res, sessionError);
                return;
            }
            const { environment } = response;

            await environmentService.editSlackNotifications(req.body['slack_notifications'], environment.id);
            res.status(200).send();
        } catch (err) {
            next(err);
        }
    }

    async updateHmacKey(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.body) {
                errorManager.errRes(res, 'missing_body');
                return;
            }

            const { success: sessionSuccess, error: sessionError, response } = await getUserAccountAndEnvironmentFromSession(req);
            if (!sessionSuccess || response === null) {
                errorManager.errResFromNangoErr(res, sessionError);
                return;
            }
            const { environment } = response;

            await environmentService.editHmacKey(req.body['hmac_key'], environment.id);
            res.status(200).send();
        } catch (err) {
            next(err);
        }
    }

    async getEnvironmentVariables(_req: Request, res: Response, next: NextFunction) {
        try {
            const environmentId = getEnvironmentId(res);
            const environmentVariables = await environmentService.getEnvironmentVariables(environmentId);

            if (!environmentVariables) {
                res.status(200).send([]);
                return;
            }

            const envs = environmentVariables.map((env) => {
                return {
                    name: env.name,
                    value: env.value
                };
            });

            res.status(200).send(envs);
        } catch (err) {
            next(err);
        }
    }

    async updateEnvironmentVariables(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.body) {
                errorManager.errRes(res, 'missing_body');
                return;
            }

            const { success: sessionSuccess, error: sessionError, response } = await getUserAccountAndEnvironmentFromSession(req);
            if (!sessionSuccess || response === null) {
                errorManager.errResFromNangoErr(res, sessionError);
                return;
            }
            const { environment } = response;

            await environmentService.editEnvironmentVariable(environment.id, req.body);
            res.status(200).send();
        } catch (err) {
            next(err);
        }
    }

    async rotateKey(req: Request, res: Response, next: NextFunction) {
        try {
            const { success: sessionSuccess, error: sessionError, response } = await getUserAccountAndEnvironmentFromSession(req);
            if (!sessionSuccess || response === null) {
                errorManager.errResFromNangoErr(res, sessionError);
                return;
            }

            if (!req.body.type) {
                res.status(400).send({ error: 'The type of key to rotate is required' });
                return;
            }
            const { environment } = response;

            const newKey = await environmentService.rotateKey(environment.id, req.body.type);
            res.status(200).send({ key: newKey });
        } catch (err) {
            next(err);
        }
    }

    async revertKey(req: Request, res: Response, next: NextFunction) {
        try {
            const { success: sessionSuccess, error: sessionError, response } = await getUserAccountAndEnvironmentFromSession(req);
            if (!sessionSuccess || response === null) {
                errorManager.errResFromNangoErr(res, sessionError);
                return;
            }

            if (!req.body.type) {
                res.status(400).send({ error: 'The type of key to rotate is required' });
                return;
            }
            const { environment } = response;

            const newKey = await environmentService.revertKey(environment.id, req.body.type);
            res.status(200).send({ key: newKey });
        } catch (err) {
            next(err);
        }
    }

    async activateKey(req: Request, res: Response, next: NextFunction) {
        try {
            const { success: sessionSuccess, error: sessionError, response } = await getUserAccountAndEnvironmentFromSession(req);
            if (!sessionSuccess || response === null) {
                errorManager.errResFromNangoErr(res, sessionError);
                return;
            }

            if (!req.body.type) {
                res.status(400).send({ error: 'The type of key to activate is required' });
                return;
            }
            const { environment } = response;

            await environmentService.activateKey(environment.id, req.body.type);
            res.status(200).send();
        } catch (err) {
            next(err);
        }
    }
}

export default new EnvironmentController();
