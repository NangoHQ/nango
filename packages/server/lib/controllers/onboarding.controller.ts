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
    DEMO_GITHUB_CONFIG_KEY,
    connectionService,
    DEMO_SYNC_NAME,
    DEMO_MODEL,
    getSyncByIdAndName,
    DEFAULT_GITHUB_CLIENT_ID,
    DEFAULT_GITHUB_CLIENT_SECRET,
    DEMO_SYNC_ACTION,
    SyncCommand,
    SyncStatus
    // SyncStatus,
    // SyncCommand
} from '@nangohq/shared';
import type { CustomerFacingDataRecord, IncomingPreBuiltFlowConfig } from '@nangohq/shared';
import { getUserAccountAndEnvironmentFromSession } from '../utils/utils.js';

interface OnboardingStatus {
    id: number;
    progress: number;
    records: CustomerFacingDataRecord[] | null;
    provider: boolean;
    connection: boolean;
    sync: boolean;
}

class OnboardingController {
    /**
     * Start an onboarding process
     */
    async create(req: Request, res: Response, next: NextFunction) {
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
            if (!DEFAULT_GITHUB_CLIENT_ID || !DEFAULT_GITHUB_CLIENT_SECRET) {
                throw new Error('missing_env_var');
            }

            // Create an onboarding state to remember where user left
            const onboardingId = await initOnboarding(user.id);
            if (!onboardingId) {
                res.status(500).json({
                    error: 'Failed to create onboarding'
                });
            }

            // We create a default provider if not already there
            // Because we need one to launch authorization straight away
            const provider = await getOnboardingProvider({ envId: environment.id });
            if (!provider) {
                await createOnboardingProvider({ envId: environment.id });
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
                res.status(400).json({ message: 'onboarding_dev_only' });
                return;
            }

            const status = await getOnboardingProgress(user.id);
            if (!status) {
                res.status(404).send({ message: 'no_onboarding' });
                return;
            }

            const payload: OnboardingStatus = {
                id: status.id,
                progress: status.progress,
                connection: false,
                provider: false,
                sync: false,
                records: null
            };
            const { connection_id: connectionId } = req.query;
            if (!connectionId || typeof connectionId !== 'string') {
                res.status(400).json({ message: 'connection_id must be a string' });
                return;
            }

            const provider = await getOnboardingProvider({ envId: environment.id });
            if (!provider) {
                payload.progress = 0;
                res.status(200).json(payload);
                return;
            } else {
                payload.provider = true;
            }

            const connectionExists = await connectionService.checkIfConnectionExists(connectionId, DEMO_GITHUB_CONFIG_KEY, environment.id);
            if (!connectionExists) {
                payload.progress = 0;
                res.status(200).json(payload);
                return;
            } else {
                payload.connection = true;
            }

            const sync = await getSyncByIdAndName(connectionExists.id, DEMO_SYNC_NAME);
            if (!sync) {
                payload.progress = 1;
                res.status(200).json(payload);
                return;
            } else {
                payload.sync = true;
                payload.progress = 3;
            }

            const getRecords = await syncDataService.getAllDataRecords(connectionId, DEMO_GITHUB_CONFIG_KEY, environment.id, DEMO_MODEL);
            if (!getRecords.success) {
                res.status(400).json({ message: 'failed_to_get_records' });
                return;
            } else {
                payload.records = getRecords.response?.records || [];
            }
            if (payload.records.length > 0) {
                payload.progress = 4;
            }

            res.status(200).json(payload);
        } catch (err) {
            next(err);
        }
    }

    /**
     * Create onboarding provider
     */
    async deploy(req: Request, res: Response, next: NextFunction) {
        try {
            const { success: sessionSuccess, error: sessionError, response } = await getUserAccountAndEnvironmentFromSession(req);
            if (!sessionSuccess || response === null) {
                errorManager.errResFromNangoErr(res, sessionError);
                return;
            }

            const { environment } = response;
            const githubDemoSync = flowService.getFlow(DEMO_SYNC_NAME);
            if (!githubDemoSync) {
                throw new Error('failed_to_find_demo_sync');
            }

            const config: IncomingPreBuiltFlowConfig[] = [
                {
                    provider: 'github',
                    providerConfigKey: DEMO_GITHUB_CONFIG_KEY,
                    type: SyncConfigType.SYNC,
                    name: DEMO_SYNC_NAME,
                    runs: githubDemoSync.runs,
                    auto_start: githubDemoSync.auto_start === true,
                    models: githubDemoSync.returns,
                    model_schema: JSON.stringify(githubDemoSync?.models),
                    is_public: true,
                    public_route: 'github'
                },
                {
                    provider: 'github',
                    providerConfigKey: DEMO_GITHUB_CONFIG_KEY,
                    type: SyncConfigType.ACTION,
                    name: DEMO_SYNC_ACTION,
                    is_public: true,
                    runs: 'every day',
                    models: [],
                    model_schema: ''
                }
            ];
            const deploy = await deployPreBuiltSyncConfig(environment.id, config, '');
            if (!deploy.success || deploy.response === null) {
                errorManager.errResFromNangoErr(res, deploy.error);
                return;
            }

            res.status(200).json({ success: true });
        } catch (err) {
            next(err);
        }
    }

    async checkSyncCompletion(req: Request<unknown, unknown, { connectionId?: string }>, res: Response, next: NextFunction) {
        try {
            const { success: sessionSuccess, error: sessionError, response } = await getUserAccountAndEnvironmentFromSession(req);

            if (!sessionSuccess || response === null) {
                errorManager.errResFromNangoErr(res, sessionError);
                return;
            }

            if (!req.body || !req.body.connectionId || typeof req.body.connectionId !== 'string') {
                res.status(400).json({ message: 'connection_id must be a string' });
                return;
            }

            const { environment } = response;
            const {
                success,
                error,
                response: status
            } = await syncOrchestrator.getSyncStatus(environment.id, DEMO_GITHUB_CONFIG_KEY, [DEMO_SYNC_NAME], req.body.connectionId, true);

            if (!success || !status) {
                errorManager.errResFromNangoErr(res, error);
                return;
            }

            const [job] = status;
            if (!job) {
                res.status(400).json({ message: 'No sync job found' });
                return;
            }

            if (!job.nextScheduledSyncAt && job.jobStatus === SyncStatus.PAUSED) {
                await syncOrchestrator.runSyncCommand(environment.id, DEMO_GITHUB_CONFIG_KEY, [DEMO_SYNC_NAME], SyncCommand.RUN_FULL, req.body.connectionId);
            }

            res.status(200).json(job);
        } catch (err) {
            next(err);
        }
    }

    async updateStatus(req: Request<unknown, unknown, { progress?: string }>, res: Response, next: NextFunction) {
        try {
            const { success: sessionSuccess, error: sessionError, response } = await getUserAccountAndEnvironmentFromSession(req);
            if (!sessionSuccess || response === null) {
                errorManager.errResFromNangoErr(res, sessionError);
                return;
            }

            if (response.environment.name !== 'dev') {
                res.status(400).json({ message: 'onboarding_dev_only' });
                return;
            }

            if (typeof req.body.progress !== 'number') {
                res.status(400).json({ message: 'Missing progress' });
                return;
            }

            const { user } = response;
            const status = await getOnboardingProgress(user.id);
            if (!status) {
                res.status(404).send({ message: 'no_onboarding' });
                return;
            }

            await updateOnboardingProgress(status.id, req.body.progress);

            res.status(200).json({
                success: true
            });
        } catch (err) {
            next(err);
        }
    }
}

export default new OnboardingController();
