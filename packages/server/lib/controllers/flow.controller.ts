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
    deployPreBuilt as deployPreBuiltSyncConfig,
    syncOrchestrator,
    FlowDownloadBody,
    remoteFileService,
    getAllSyncsAndActions,
    getNangoConfigIdAndLocationFromId,
    getSyncsByConnectionIdsAndEnvironmentIdAndSyncName
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

            const result = await accountService.getAccountAndEnvironmentIdByUUID(targetAccountUUID, targetEnvironment);

            if (!result) {
                res.status(400).send('Invalid environment');
                return;
            }

            const { environmentId } = result;

            const {
                success: preBuiltSuccess,
                error: preBuiltError,
                response: preBuiltResponse
            } = await deployPreBuiltSyncConfig(environmentId, config, req.body.nangoYamlBody || '');

            if (!preBuiltSuccess || preBuiltResponse === null) {
                errorManager.errResFromNangoErr(res, preBuiltError);
                return;
            }

            await syncOrchestrator.triggerIfConnectionsExist(preBuiltResponse.result, environmentId);

            res.sendStatus(200);
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

            if (config.some((c) => !c.provider)) {
                res.status(400).send('Missing integration');
                return;
            }

            const { environmentId } = response;

            // config is an array for compatibility purposes, it will only ever have one item
            const [firstConfig] = config;
            const providerLookup = await configService.getConfigIdByProvider(firstConfig?.provider as string, environmentId);

            if (!providerLookup) {
                errorManager.errRes(res, 'provider_not_on_account');
                return;
            }

            const { success: preBuiltSuccess, error: preBuiltError, response: preBuiltResponse } = await deployPreBuiltSyncConfig(environmentId, config, '');

            if (!preBuiltSuccess || preBuiltResponse === null) {
                errorManager.errResFromNangoErr(res, preBuiltError);
                return;
            }

            await syncOrchestrator.triggerIfConnectionsExist(preBuiltResponse.result, environmentId);

            res.sendStatus(201);
        } catch (e) {
            next(e);
        }
    }

    public async downloadFlow(req: Request, res: Response, next: NextFunction) {
        try {
            const { success, error, response } = await getEnvironmentAndAccountId(res, req);

            if (!success || response === null) {
                errorManager.errResFromNangoErr(res, error);
                return;
            }

            const { environmentId, accountId } = response;

            const body: FlowDownloadBody = req.body as FlowDownloadBody;

            if (!body) {
                res.status(400).send('Missing body');
                return;
            }

            const { id, name, provider, is_public } = body;

            if (!name || !provider || typeof is_public === 'undefined') {
                res.status(400).send('Missing required fields');
                return;
            }

            if (!id && is_public) {
                await remoteFileService.zipAndSendPublicFiles(res, name, accountId, environmentId, body.public_route as string);
                return;
            } else {
                // it has an id, so it's either a public template that is active, or a private template
                // either way, we need to fetch it from the users directory in s3
                const configLookupResult = await getNangoConfigIdAndLocationFromId(id as number);

                if (!configLookupResult) {
                    res.status(400).send('Invalid file reference');
                    return;
                }

                const { nango_config_id, file_location } = configLookupResult;
                await remoteFileService.zipAndSendFiles(res, name, accountId, environmentId, nango_config_id, file_location);
                return;
            }
        } catch (e) {
            next(e);
        }
    }

    public async getFlowConfig(req: Request, res: Response, next: NextFunction) {
        try {
            const { success, error, response } = await getEnvironmentAndAccountId(res, req);

            if (!success || response === null) {
                errorManager.errResFromNangoErr(res, error);
                return;
            }

            const { environmentId } = response;

            const nangoConfigs = await getAllSyncsAndActions(environmentId);

            res.send(nangoConfigs);
        } catch (e) {
            next(e);
        }
    }

    public async deleteFlow(req: Request, res: Response, next: NextFunction) {
        try {
            const { success, error, response } = await getEnvironmentAndAccountId(res, req);

            if (!success || response === null) {
                errorManager.errResFromNangoErr(res, error);
                return;
            }

            const { environmentId } = response;

            const id = req.params['id'];
            const connectionIds = req.query['connectionIds'] as string;
            const syncName = req.query['sync_name'] as string;

            if (!id) {
                res.status(400).send('Missing id');
                return;
            }

            if (!connectionIds) {
                res.status(400).send('Missing connectionIds');
                return;
            }

            if (!syncName) {
                res.status(400).send('Missing sync_name');
                return;
            }

            const connections = connectionIds.split(',');

            const syncs = await getSyncsByConnectionIdsAndEnvironmentIdAndSyncName(connections, environmentId, syncName);

            for (const sync of syncs) {
                await syncOrchestrator.deleteSync(sync.id as string, environmentId);
            }

            await syncOrchestrator.deleteConfig(Number(id), environmentId);

            res.sendStatus(204);
        } catch (e) {
            next(e);
        }
    }
}

export default new FlowController();
