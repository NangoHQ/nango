import type { Request, Response } from 'express';
import type { NextFunction } from 'express';
import { getUserAccountAndEnvironmentFromSession } from '../utils/utils.js';
import {
    flowService,
    accountService,
    getEnvironmentAndAccountId,
    errorManager,
    IncomingPreBuiltFlowConfig,
    configService,
    createPreBuiltSyncConfig
} from '@nangohq/shared';

class FlowController {
    public async getFlows(req: Request, res: Response, next: NextFunction) {
        try {
            const { success, error, response } = await getUserAccountAndEnvironmentFromSession(req);

            if (!success || response === null) {
                errorManager.errResFromNangoErr(res, error);
                return;
            }
            const availableFlows = flowService.getAllAvailableFlows();
            const addedFlows = await flowService.getAddedPublicFlows(response.environment.id);

            res.send({ addedFlows, availableFlows });
        } catch (e) {
            next(e);
        }
    }

    public async adminDeployPrivateFlow(req: Request, res: Response, next: NextFunction) {
        try {
            const { success, error, response } = await getEnvironmentAndAccountId(res, req);

            if (!success || response === null) {
                errorManager.errResFromNangoErr(res, error);
                return;
            }

            const { accountId } = response;
            const fullAccount = await accountService.getAccountById(accountId);

            if (fullAccount?.uuid !== process.env['NANGO_ADMIN_UUID']) {
                res.status(401).send('Unauthorized');
                return;
            }

            const { targetAccountUUID, targetEnvironment, config } = req.body;

            const environmentId = await accountService.getEnvironmentIdByUUID(targetAccountUUID, targetEnvironment);

            if (!environmentId) {
                res.status(400).send('Invalid environment');
                return;
            }

            const { success: preBuiltSuccess, error: preBuiltError, response: preBuiltResponse } = await createPreBuiltSyncConfig(environmentId, config);

            if (!preBuiltSuccess || preBuiltResponse === null) {
                errorManager.errResFromNangoErr(res, preBuiltError);
                return;
            }

            console.log(preBuiltResponse);
            res.send(200);
        } catch (e) {
            next(e);
        }
    }

    public async deployPreBuiltFlow(req: Request, res: Response, next: NextFunction) {
        try {
            const { success, error, response } = await getEnvironmentAndAccountId(res, req);

            if (!success || response === null) {
                errorManager.errResFromNangoErr(res, error);
                return;
            }

            const config: IncomingPreBuiltFlowConfig[] = req.body;

            if (!config) {
                res.status(400).send('Missing config');
                return;
            }

            if (config.some((c) => !c.integration)) {
                res.status(400).send('Missing integration');
                return;
            }

            const { environmentId } = response;

            if (config && config.length === 1) {
                const [firstConfig] = config;
                const providerLookup = await configService.getConfigIdByProvider(firstConfig?.integration as string, environmentId);

                if (!providerLookup) {
                    errorManager.errRes(res, 'provider_not_on_account');
                    return;
                }
            }

            const { success: preBuiltSuccess, error: preBuiltError, response: preBuiltResponse } = await createPreBuiltSyncConfig(environmentId, config);

            if (!preBuiltSuccess || preBuiltResponse === null) {
                errorManager.errResFromNangoErr(res, preBuiltError);
                return;
            }

            // TODO start the sync if connection(s) exist

            console.log(preBuiltResponse);

            res.send(201);
        } catch (e) {
            next(e);
        }
    }
}

export default new FlowController();
