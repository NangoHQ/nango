import type { Request, Response, NextFunction } from 'express';
import type { Environment } from '@nangohq/shared';
import { isCloud, baseUrl } from '@nangohq/utils';
import {
    accountService,
    hmacService,
    environmentService,
    errorManager,
    getWebsocketsPath,
    getOauthCallbackUrl,
    getGlobalWebhookReceiveUrl,
    packageJsonFile,
    getOnboardingProgress,
    userService
} from '@nangohq/shared';
import { NANGO_ADMIN_UUID } from './account.controller.js';
import type { RequestLocals } from '../utils/express.js';

export interface GetMeta {
    environments: Pick<Environment, 'name'>[];
    email: string;
    version: string;
    baseUrl: string;
    debugMode: boolean;
    onboardingComplete: boolean;
}

class EnvironmentController {
    async meta(req: Request, res: Response<GetMeta, never>, next: NextFunction) {
        try {
            const sessionUser = req.user;
            if (!sessionUser) {
                errorManager.errRes(res, 'user_not_found');
                return;
            }

            const user = await userService.getUserById(sessionUser.id);
            if (!user) {
                errorManager.errRes(res, 'user_not_found');
                return;
            }

            const environments = await environmentService.getEnvironmentsByAccountId(user.account_id);
            const version = packageJsonFile().version;
            const onboarding = await getOnboardingProgress(sessionUser.id);
            res.status(200).send({
                environments,
                version,
                email: sessionUser.email,
                baseUrl,
                debugMode: req.session.debugMode === true,
                onboardingComplete: onboarding?.complete || false
            });
        } catch (err) {
            next(err);
        }
    }

    async getEnvironment(_: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            const environment = res.locals['environment'];
            const account = res.locals['account'];
            const user = res.locals['user'];

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

            environment.callback_url = await getOauthCallbackUrl(environment.id);
            const webhookBaseUrl = getGlobalWebhookReceiveUrl();
            environment.webhook_receive_url = `${webhookBaseUrl}/${environment.uuid}`;

            const environmentVariables = await environmentService.getEnvironmentVariables(environment.id);

            res.status(200).send({
                account: { ...environment, env_variables: environmentVariables, host: baseUrl, uuid: account.uuid, email: user.email }
            });
        } catch (err) {
            next(err);
        }
    }

    async getHmacDigest(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
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
                const digest = await hmacService.digest(environment.id, providerConfigKey as string, connectionId as string);
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
            const digest = await hmacService.digest(info?.environmentId as number, integration_key, connectionId as string);

            res.status(200).send({ hmac_digest: digest, public_key: res.locals['environment'].public_key, integration_key });
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

    async updateWebhookURL(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            if (!req.body) {
                errorManager.errRes(res, 'missing_body');
                return;
            }

            const { environment } = res.locals;

            await environmentService.editWebhookUrl(req.body['webhook_url'], environment.id);
            res.status(200).send();
        } catch (err) {
            next(err);
        }
    }

    async updateAlwaysSendWebhook(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            if (!req.body) {
                errorManager.errRes(res, 'missing_body');
                return;
            }

            const { environment } = res.locals;

            await environmentService.editAlwaysSendWebhook(req.body['always_send_webhook'], environment.id);
            res.status(200).send();
        } catch (err) {
            next(err);
        }
    }

    async updateSendAuthWebhook(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            if (!req.body) {
                errorManager.errRes(res, 'missing_body');
                return;
            }

            const { environment } = res.locals;

            await environmentService.editSendAuthWebhook(req.body['send_auth_webhook'], environment.id);
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
