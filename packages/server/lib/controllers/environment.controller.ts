import type { Request, Response, NextFunction } from 'express';
import type { DBEnvironment, DBEnvironmentVariable, ExternalWebhook } from '@nangohq/types';
import { isCloud, baseUrl } from '@nangohq/utils';
import {
    accountService,
    hmacService,
    environmentService,
    connectionService,
    errorManager,
    getWebsocketsPath,
    getGlobalWebhookReceiveUrl,
    generateSlackConnectionId,
    externalWebhookService
} from '@nangohq/shared';
import { NANGO_ADMIN_UUID } from './account.controller.js';
import type { RequestLocals } from '../utils/express.js';

export interface EnvironmentAndAccount {
    environment: DBEnvironment;
    env_variables: DBEnvironmentVariable[];
    webhook_settings: ExternalWebhook | null;
    host: string;
    uuid: string;
    name: string;
    email: string;
    slack_notifications_channel: string | null;
}

class EnvironmentController {
    async getEnvironment(_: Request, res: Response<{ environmentAndAccount: EnvironmentAndAccount }, Required<RequestLocals>>, next: NextFunction) {
        try {
            const { environment, account, user } = res.locals;

            if (!isCloud) {
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

            environment.callback_url = await environmentService.getOauthCallbackUrl(environment.id);
            const webhookBaseUrl = getGlobalWebhookReceiveUrl();
            environment.webhook_receive_url = `${webhookBaseUrl}/${environment.uuid}`;

            let slack_notifications_channel = '';
            if (environment.slack_notifications) {
                const connectionId = generateSlackConnectionId(account.uuid, environment.name);
                const integration_key = process.env['NANGO_SLACK_INTEGRATION_KEY'] || 'slack';
                const nangoAdminUUID = NANGO_ADMIN_UUID;
                const env = 'prod';
                const info = await accountService.getAccountAndEnvironmentIdByUUID(nangoAdminUUID as string, env);
                if (info) {
                    const connectionConfig = await connectionService.getConnectionConfig({
                        provider_config_key: integration_key,
                        environment_id: info.environmentId,
                        connection_id: connectionId
                    });
                    if (connectionConfig && connectionConfig['incoming_webhook.channel']) {
                        slack_notifications_channel = connectionConfig['incoming_webhook.channel'];
                    }
                }
            }

            const environmentVariables = await environmentService.getEnvironmentVariables(environment.id);

            const webhookSettings = await externalWebhookService.get(environment.id);

            res.status(200).send({
                environmentAndAccount: {
                    environment,
                    env_variables: environmentVariables || [],
                    webhook_settings: webhookSettings,
                    host: baseUrl,
                    uuid: account.uuid,
                    name: account.name,
                    email: user.email,
                    slack_notifications_channel
                }
            });
        } catch (err) {
            next(err);
        }
    }

    getHmacDigest(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            const { environment } = res.locals;
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
                const digest = hmacService.computeDigest({ key: environment.hmac_key, values: [providerConfigKey as string, connectionId as string] });
                res.status(200).send({ hmac_digest: digest });
            } else {
                res.status(200).send({ hmac_digest: null });
            }
        } catch (err) {
            next(err);
        }
    }

    async getAdminAuthInfo(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            const { connection_id: connectionId } = req.query;

            if (!connectionId) {
                errorManager.errRes(res, 'missing_connection_id');
                return;
            }

            const integration_key = process.env['NANGO_SLACK_INTEGRATION_KEY'] || 'slack';
            const nangoAdminUUID = NANGO_ADMIN_UUID;
            const env = 'prod';
            const info = await accountService.getAccountAndEnvironmentIdByUUID(nangoAdminUUID as string, env);

            if (!info) {
                errorManager.errRes(res, 'account_not_found');
                return;
            }

            const environment = await environmentService.getById(info.environmentId);
            if (!environment) {
                errorManager.errRes(res, 'account_not_found');
                return;
            }

            const digest = hmacService.computeDigest({ key: environment.hmac_key!, values: [integration_key, connectionId as string] });

            res.status(200).send({ hmac_digest: digest, public_key: environment.public_key, integration_key });
        } catch (err) {
            next(err);
        }
    }

    async updateCallback(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            if (req.body == null) {
                errorManager.errRes(res, 'missing_body');
                return;
            }

            if (req.body['callback_url'] == null) {
                errorManager.errRes(res, 'missing_callback_url');
                return;
            }

            const { environment } = res.locals;

            await environmentService.editCallbackUrl(req.body['callback_url'], environment.id);
            res.status(200).send();
        } catch (err) {
            next(err);
        }
    }

    async updateHmacEnabled(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            if (!req.body) {
                errorManager.errRes(res, 'missing_body');
                return;
            }

            const { environment } = res.locals;

            await environmentService.editHmacEnabled(req.body['hmac_enabled'], environment.id);
            res.status(200).send();
        } catch (err) {
            next(err);
        }
    }

    async updateSlackNotificationsEnabled(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            if (!req.body) {
                errorManager.errRes(res, 'missing_body');
                return;
            }

            const { environment } = res.locals;

            await environmentService.editSlackNotifications(req.body['slack_notifications'], environment.id);
            res.status(200).send();
        } catch (err) {
            next(err);
        }
    }

    async updateHmacKey(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            if (!req.body) {
                errorManager.errRes(res, 'missing_body');
                return;
            }

            const { environment } = res.locals;

            await environmentService.editHmacKey(req.body['hmac_key'], environment.id);
            res.status(200).send();
        } catch (err) {
            next(err);
        }
    }

    async getEnvironmentVariables(_req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            const environmentId = res.locals['environment'].id;
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

    async updateEnvironmentVariables(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            if (!req.body) {
                errorManager.errRes(res, 'missing_body');
                return;
            }

            const { environment } = res.locals;

            await environmentService.editEnvironmentVariable(environment.id, req.body);
            res.status(200).send();
        } catch (err) {
            next(err);
        }
    }

    async rotateKey(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            if (!req.body.type) {
                res.status(400).send({ error: 'The type of key to rotate is required' });
                return;
            }

            const { environment } = res.locals;

            const newKey = await environmentService.rotateKey(environment.id, req.body.type);
            res.status(200).send({ key: newKey });
        } catch (err) {
            next(err);
        }
    }

    async revertKey(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            if (!req.body.type) {
                res.status(400).send({ error: 'The type of key to rotate is required' });
                return;
            }

            const { environment } = res.locals;

            const newKey = await environmentService.revertKey(environment.id, req.body.type);
            res.status(200).send({ key: newKey });
        } catch (err) {
            next(err);
        }
    }

    async activateKey(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            if (!req.body.type) {
                res.status(400).send({ error: 'The type of key to activate is required' });
                return;
            }
            const { environment } = res.locals;

            await environmentService.activateKey(environment.id, req.body.type);
            res.status(200).send();
        } catch (err) {
            next(err);
        }
    }
}

export default new EnvironmentController();
