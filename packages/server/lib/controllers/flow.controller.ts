import type { Request, Response } from 'express';
import type { NextFunction } from 'express';
import { flowService, getEnvironmentAndAccountId, errorManager, IncomingPreBuiltFlowConfig, configService, createPreBuiltSyncConfig } from '@nangohq/shared';

class FlowController {
    public async getFlows(_req: Request, res: Response, next: NextFunction) {
        try {
            const flows = flowService.getAllAvailableFlows();

            res.send(flows);
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

            const config: IncomingPreBuiltFlowConfig = req.body;

            if (!config.integration) {
                res.status(400).send('Missing integration');
                return;
            }

            const { environmentId } = response;

            const providerLookup = await configService.getConfigIdByProvider(config.integration, environmentId);

            if (!providerLookup) {
                errorManager.errRes(res, 'provider_not_on_account');
                return;
            }

            const { id: nango_config_id, unique_key: provider_config_key } = providerLookup;

            const result = await createPreBuiltSyncConfig(environmentId, provider_config_key, { ...config, nango_config_id });

            // TODO start the sync if connection(s) exist

            console.log(result);

            res.send(201);
        } catch (e) {
            next(e);
        }
    }
}

export default new FlowController();
