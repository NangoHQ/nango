import type { Request, Response, NextFunction } from 'express';
import type { ApiEnvironment, ApiEnvironmentVariable, ApiWebhooks } from '@nangohq/types';
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
import { webhooksToApi } from '../formatters/webhooks.js';
import { environmentToApi } from '../formatters/environment.js';

export interface EnvironmentAndAccount {
    environment: ApiEnvironment;
    env_variables: ApiEnvironmentVariable[];
    webhook_settings: ApiWebhooks;
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
                    environment: environmentToApi(environment),
                    env_variables:
                        environmentVariables?.map((envVar) => {
                            return { name: envVar.name, value: envVar.value };
                        }) || [],
                    webhook_settings: webhooksToApi(
                        webhookSettings || {
                            id: 0,
                            environment_id: 0,
                            created_at: new Date(),
                            updated_at: new Date(),
                            on_auth_creation: false,
                            on_auth_refresh_error: false,
                            on_sync_completion_always: false,
                            on_sync_error: false,
                            primary_url: null,
                            secondary_url: null
                        }
                    ),
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
