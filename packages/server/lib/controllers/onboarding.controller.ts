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
    syncDataService,
    SyncCommand
} from '@nangohq/shared';
import type { ReportedSyncJobStatus, IncomingPreBuiltFlowConfig } from '@nangohq/shared';
import { getUserAccountAndEnvironmentFromSession } from '../utils/utils.js';

const syncName = 'github-issues-lite';

class OnboardingController {
    async init(req: Request, res: Response, next: NextFunction) {
        try {
            const { success: sessionSuccess, error: sessionError, response } = await getUserAccountAndEnvironmentFromSession(req);
            if (!sessionSuccess || response === null) {
                errorManager.errResFromNangoErr(res, sessionError);
                return;
            }

            const { user, account, environment } = response;

            const onboardingId = await initOrUpdateOnboarding(user.id, account.id);

            const { connection_id, provider_config_key } = req.body;
            const { success, error } = await syncOrchestrator.runSyncCommand(
                environment.id,
                provider_config_key as string,
                [syncName],
                SyncCommand.RUN,
                connection_id
            );

            if (!success) {
                errorManager.errResFromNangoErr(res, error);
                return;
            }

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

            const { response: records } = await syncDataService.getDataRecords(
                connectionId as string,
                providerConfigKey as string,
                environment.id,
                model as string
            );

            res.status(200).json({ ...status, records });
        } catch (err) {
            next(err);
        }
    }

    async checkSyncCompletion(req: Request, res: Response, next: NextFunction) {
        try {
            const { success: sessionSuccess, error: sessionError, response } = await getUserAccountAndEnvironmentFromSession(req);

            if (!sessionSuccess || response === null) {
                errorManager.errResFromNangoErr(res, sessionError);
                return;
            }

            const { environment } = response;
            const { connection_id: connectionId, provider_config_key: providerConfigKey } = req.query;

            // TODO if there are previous jobs then no need for more polling
            const {
                success,
                error,
                response: status
            } = await syncOrchestrator.getSyncStatus(environment.id, providerConfigKey as string, [syncName], connectionId as string, true);

            if (!success || !status) {
                errorManager.errResFromNangoErr(res, error);
                return;
            }

            const [job] = status as ReportedSyncJobStatus[];

            res.status(200).json(job);
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

            if (!req.body.progress === undefined || req.body.progress === null) {
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

            const { account, user } = response;

            await updateOnboardingProgress(Number(id), req.body.progress, user.id, account.id);

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
            const githubDemoSync = flowService.getFlow(syncName);
            const config: IncomingPreBuiltFlowConfig[] = [
                {
                    provider: 'github',
                    providerConfigKey: configService.DEMO_GITHUB_CONFIG_KEY,
                    type: SyncConfigType.SYNC,
                    name: syncName,
                    runs: githubDemoSync?.runs as string,
                    auto_start: githubDemoSync?.auto_start as boolean,
                    models: githubDemoSync?.returns as string[],
                    model_schema: JSON.stringify(githubDemoSync?.model_schema),
                    is_public: true,
                    public_route: 'github'
                }
            ];

            await deployPreBuiltSyncConfig(environment.id, config, '');

            res.sendStatus(200);
        } catch (err) {
            next(err);
        }
    }
}

export default new OnboardingController();
