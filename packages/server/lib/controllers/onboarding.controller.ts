import type { Request, Response, NextFunction } from 'express';
import {
    errorManager,
    initOnboarding,
    getOnboardingProgress,
    updateOnboardingProgress,
    flowService,
    SyncConfigType,
    deployPreBuilt as deployPreBuiltSyncConfig,
    syncOrchestrator,
    syncDataService,
    getOnboardingProvider,
    createOnboardingProvider,
    DEMO_GITHUB_CONFIG_KEY
} from '@nangohq/shared';
import type { CustomerFacingDataRecord, IncomingPreBuiltFlowConfig } from '@nangohq/shared';
import { getUserAccountAndEnvironmentFromSession } from '../utils/utils.js';

const syncName = 'github-issues-lite';

class OnboardingController {
    /**
     * Start an onboarding process
     */
    async init(req: Request, res: Response, next: NextFunction) {
        try {
            const { success: sessionSuccess, error: sessionError, response } = await getUserAccountAndEnvironmentFromSession(req);
            if (!sessionSuccess || response === null) {
                errorManager.errResFromNangoErr(res, sessionError);
                return;
            }

            const { user, account, environment } = response;

            if (environment.name !== 'dev') {
                res.status(400).json({ error: 'onboarding_dev_only' });
                return;
            }

            // Create an onboarding state to remember where user left
            const onboardingId = await initOnboarding(user.id, account.id);

            // Create a default provider if not already there
            const provider = await getOnboardingProvider(environment.id);
            if (!provider) {
                await createOnboardingProvider(environment.id);
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

    /**
     * Get the onboarding status
     */
    async status(req: Request, res: Response, next: NextFunction) {
        try {
            const { success: sessionSuccess, error: sessionError, response } = await getUserAccountAndEnvironmentFromSession(req);
            if (!sessionSuccess || response === null) {
                errorManager.errResFromNangoErr(res, sessionError);
                return;
            }

            const { user, environment } = response;
            if (environment.name !== 'dev') {
                res.status(400).json({ error: 'onboarding_dev_only' });
                return;
            }

            const status = await getOnboardingProgress(user.id);
            if (!status) {
                res.status(404).send({ error: 'no_onboarding' });
                return;
            }

            const payload: { progress: number; records: CustomerFacingDataRecord[] | null; provider: boolean; connection: boolean; sync: boolean } = {
                progress: 0,
                connection: false,
                provider: false,
                records: null,
                sync: false
            };
            const { connection_id: connectionId, model } = req.query;

            const provider = await getOnboardingProvider(environment.id);
            if (!provider) {
                res.status(200).json(payload);
                return;
            }

            const { response: records } = await syncDataService.getAllDataRecords(connectionId as string, provider.unique_key, environment.id, model as string);

            res.status(200).json({ records, provider: true, connection: true, sync: true });
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

            const [job] = status;

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

            if (response.environment.name !== 'dev') {
                res.status(400).json({ error: 'onboarding_dev_only' });
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

            const { environment } = response;
            const githubDemoSync = flowService.getFlow(syncName);

            if (!githubDemoSync) {
                throw new Error('failed_to_find_demo_sync');
            }

            githubDemoSync.runs = 'every 5 minutes';
            const config: IncomingPreBuiltFlowConfig[] = [
                {
                    provider: 'github',
                    providerConfigKey: DEMO_GITHUB_CONFIG_KEY,
                    type: SyncConfigType.SYNC,
                    name: syncName,
                    runs: githubDemoSync.runs,
                    auto_start: githubDemoSync.auto_start === true,
                    models: githubDemoSync.returns,
                    model_schema: JSON.stringify(githubDemoSync?.models),
                    is_public: true,
                    public_route: 'github'
                }
            ];
            console.log('prit');

            await deployPreBuiltSyncConfig(environment.id, config, '');

            console.log('prut');
            res.sendStatus(200);
        } catch (err) {
            next(err);
        }
    }
}

export default new OnboardingController();
