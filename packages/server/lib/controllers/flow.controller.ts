import type { Request, Response, NextFunction } from 'express';
import type { FlowDownloadBody } from '@nangohq/shared';
import {
    flowService,
    errorManager,
    configService,
    deployPreBuilt as deployPreBuiltSyncConfig,
    syncManager,
    remoteFileService,
    environmentService,
    getSyncConfigsAsStandardConfig,
    getSyncConfigById
} from '@nangohq/shared';
import { logContextGetter } from '@nangohq/logs';
import type { RequestLocals } from '../utils/express.js';
import { getOrchestrator } from '../utils/utils.js';

const orchestrator = getOrchestrator();

class FlowController {
    public async getFlows(_: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            const availableFlows = flowService.getAllAvailableFlows();
            const addedFlows = await flowService.getAddedPublicFlows(res.locals['environment'].id);

            res.send({ addedFlows, availableFlows });
        } catch (err) {
            next(err);
        }
    }

    public async adminDeployPrivateFlow(req: Request, res: Response<any, never>, next: NextFunction) {
        try {
            const { targetAccountUUID, targetEnvironment, config } = req.body;

            const result = await environmentService.getAccountAndEnvironment({ accountUuid: targetAccountUUID, envName: targetEnvironment });
            if (!result) {
                res.status(400).send('Invalid environment');
                return;
            }

            const { environment, account } = result;

            const {
                success: preBuiltSuccess,
                error: preBuiltError,
                response: preBuiltResponse
            } = await deployPreBuiltSyncConfig({
                environment,
                account,
                configs: config,
                logContextGetter,
                orchestrator
            });

            if (!preBuiltSuccess || preBuiltResponse === null) {
                errorManager.errResFromNangoErr(res, preBuiltError);
                return;
            }

            await syncManager.triggerIfConnectionsExist(preBuiltResponse.result, environment.id, logContextGetter, orchestrator);

            res.sendStatus(200);
        } catch (err) {
            next(err);
        }
    }

    public async downloadFlow(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            const environmentId = res.locals['environment'].id;
            const accountId = res.locals['account'].id;

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
                await remoteFileService.zipAndSendPublicFiles(res, name, accountId, environmentId, body.public_route as string, flowType);
                return;
            } else {
                // it has an id, so it's either a public template that is active, or a private template
                // either way, we need to fetch it from the users directory in s3
                const configLookupResult = await getSyncConfigById(environmentId, id as number);
                if (!configLookupResult) {
                    res.status(400).send('Invalid file reference');
                    return;
                }

                const { nango_config_id, file_location } = configLookupResult;
                await remoteFileService.zipAndSendFiles(res, name, accountId, environmentId, nango_config_id, file_location, providerConfigKey, flowType);
                return;
            }
        } catch (err) {
            next(err);
        }
    }

    public async getFlowConfig(_: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            const environmentId = res.locals['environment'].id;

            const nangoConfigs = await getSyncConfigsAsStandardConfig(environmentId);

            res.send(nangoConfigs);
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
