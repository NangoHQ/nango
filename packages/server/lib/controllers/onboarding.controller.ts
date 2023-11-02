import type { Request, Response, NextFunction } from 'express';
import {
    errorManager,
    initOrUpdateOnboarding,
    getOnboardingProgress,
    updateOnboardingProgress,
    configService,
    flowService,
    SyncConfigType,
    deployPreBuilt as deployPreBuiltSyncConfig,
    syncOrchestrator,
    syncDataService
} from '@nangohq/shared';
import type { IncomingPreBuiltFlowConfig } from '@nangohq/shared';
import { getUserAccountAndEnvironmentFromSession } from '../utils/utils.js';

class OnboardingController {
    async init(req: Request, res: Response, next: NextFunction) {
        try {
            const { success: sessionSuccess, error: sessionError, response } = await getUserAccountAndEnvironmentFromSession(req);
            if (!sessionSuccess || response === null) {
                errorManager.errResFromNangoErr(res, sessionError);
                return;
            }

            const { user } = response;

            const onboardingId = await initOrUpdateOnboarding(user.id);

            if (!onboardingId) {
                res.status(500).json({
                    error: 'Failed to create onboarding'
                });
            }

            res.status(201).json({
                id: onboardingId
            });
        } catch (err) {
            next(err);
        }
    }

    async status(req: Request, res: Response, next: NextFunction) {
        try {
            const { success: sessionSuccess, error: sessionError, response } = await getUserAccountAndEnvironmentFromSession(req);
            if (!sessionSuccess || response === null) {
                errorManager.errResFromNangoErr(res, sessionError);
                return;
            }
            const { user, environment } = response;
            const { connection_id: connectionId, provider_config_key: providerConfigKey, model } = req.query;

            const status = await getOnboardingProgress(user.id);

            const {
                success,
                error,
                response: records
            } = await syncDataService.getDataRecords(connectionId as string, providerConfigKey as string, environment.id, model as string);
            console.log(success, error);

            res.status(200).json({ ...status, records });
        } catch (err) {
            next(err);
        }
    }

    async updateStatus(req: Request, res: Response, next: NextFunction) {
        try {
            const { success: sessionSuccess, error: sessionError, response } = await getUserAccountAndEnvironmentFromSession(req);
            if (!sessionSuccess || response === null) {
                errorManager.errResFromNangoErr(res, sessionError);
                return;
            }

            if (!req.body.progress) {
                res.status(400).json({
                    error: 'Missing progress'
                });
            }

            const id = req.params['id'];

            if (!id) {
                res.status(400).json({
                    error: 'Missing id'
                });
            }

            await updateOnboardingProgress(Number(id), req.body.progress);

            res.status(200).json({
                success: true
            });
        } catch (err) {
            next(err);
        }
    }

    async verify(req: Request, res: Response, next: NextFunction) {
        try {
            const { success: sessionSuccess, error: sessionError, response } = await getUserAccountAndEnvironmentFromSession(req);
            if (!sessionSuccess || response === null) {
                errorManager.errResFromNangoErr(res, sessionError);
                return;
            }

            const { account, environment } = response;
            await configService.createDefaultProviderConfigIfNotExisting(account.id);
            const syncName = 'github-issues-lite';
            const githubDemoSync = flowService.getFlow(syncName);
            const config: IncomingPreBuiltFlowConfig[] = [
                {
                    provider: 'github',
                    providerConfigKey: configService.DEMO_GITHUB_CONFIG_KEY,
                    type: SyncConfigType.SYNC,
                    name: syncName,
                    runs: githubDemoSync?.runs as string,
                    auto_start: true,
                    models: githubDemoSync?.returns as string[],
                    model_schema: JSON.stringify(githubDemoSync?.model_schema),
                    is_public: true,
                    public_route: 'github'
                }
            ];
            const { response: preBuiltResponse } = await deployPreBuiltSyncConfig(environment.id, config, '');

            if (preBuiltResponse) {
                await syncOrchestrator.triggerIfConnectionsExist(preBuiltResponse.result, environment.id);
            }

            res.sendStatus(200);
        } catch (err) {
            next(err);
        }
    }
}

export default new OnboardingController();
