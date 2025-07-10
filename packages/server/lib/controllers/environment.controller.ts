import { accountService, environmentService, errorManager, hmacService } from '@nangohq/shared';
import { flags } from '@nangohq/utils';

import { envs } from '../env.js';

import type { RequestLocals } from '../utils/express.js';
import type { NextFunction, Request, Response } from 'express';

class EnvironmentController {
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
            if (!flags.hasAdminCapabilities || !envs.NANGO_ADMIN_UUID) {
                res.status(400).send({ error: { code: 'feature_disabled', message: 'Admin capabilities are not enabled' } });
                return;
            }

            const { connection_id: connectionId } = req.query;

            if (!connectionId) {
                errorManager.errRes(res, 'missing_connection_id');
                return;
            }

            const integration_key = envs.NANGO_SLACK_INTEGRATION_KEY;
            const env = 'prod';
            const info = await accountService.getAccountAndEnvironmentIdByUUID(envs.NANGO_ADMIN_UUID, env);

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
