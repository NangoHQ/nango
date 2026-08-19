import { configService, getSyncConfigsAsStandardConfig } from '@nangohq/shared';

import flowService from '../services/flow.service.js';
import { requireEnvironment } from '../utils/asyncWrapper.js';

import type { RequestLocals } from '../utils/express.js';
import type { NextFunction, Request, Response } from 'express';

class FlowController {
    public async getFlow(req: Request, res: Response<any, RequestLocals>, next: NextFunction) {
        try {
            const environment = requireEnvironment(req, res);
            if (!environment) {
                return;
            }
            const providerConfigKey = req.query['provider_config_key'] as string;
            const { flowName } = req.params;

            if (!providerConfigKey) {
                res.status(400).send({ message: 'Missing provider config key' });
                return;
            }

            if (!flowName) {
                res.status(400).send({ message: 'Missing sync name' });
                return;
            }

            const flow = flowService.getSingleFlowAsStandardConfig(flowName);
            const integration = await configService.getProviderConfig(providerConfigKey, environment.id);
            const flowConfig = await getSyncConfigsAsStandardConfig(environment.id, providerConfigKey, flowName);

            res.send({ flowConfig, unEnabledFlow: flow, provider: integration?.provider });
        } catch (err) {
            next(err);
        }
    }
}

export default new FlowController();
