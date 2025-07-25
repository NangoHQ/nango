import { configService, flowService, getSyncConfigById, getSyncConfigsAsStandardConfig, remoteFileService } from '@nangohq/shared';

import type { RequestLocals } from '../utils/express.js';
import type { FlowDownloadBody } from '@nangohq/shared';
import type { ScriptTypeLiteral } from '@nangohq/types';
import type { NextFunction, Request, Response } from 'express';

class FlowController {
    public async downloadFlow(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            const environmentId = res.locals['environment'].id;

            const body: FlowDownloadBody = req.body as FlowDownloadBody;

            if (!body) {
                res.status(400).send('Missing body');
                return;
            }

            const { id, name, provider, is_public, providerConfigKey, flowType } = body;

            if (!name || !provider || typeof is_public === 'undefined') {
                res.status(400).send('Missing required fields');
                return;
            }

            if (!id && is_public) {
                const flow = flowService.getFlowByIntegrationAndName({ provider, type: flowType as ScriptTypeLiteral, scriptName: name });
                if (!flow) {
                    res.status(400).send({ error: { code: 'invalid_query' } });
                    return;
                }
                await remoteFileService.zipAndSendPublicFiles({ res, scriptName: name, providerPath: provider, flowType });
                return;
            } else {
                // it has an id, so it's either a public template that is active, or a private template
                // either way, we need to fetch it from the users directory in s3
                const syncConfig = await getSyncConfigById(environmentId, id as number);
                if (!syncConfig) {
                    res.status(400).send('Invalid file reference');
                    return;
                }

                await remoteFileService.zipAndSendFiles({
                    res,
                    scriptName: name,
                    syncConfig,
                    providerConfigKey
                });
                return;
            }
        } catch (err) {
            next(err);
        }
    }

    public async getFlow(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            const environment = res.locals['environment'];
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
