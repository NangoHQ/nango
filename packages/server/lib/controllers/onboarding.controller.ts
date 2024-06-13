import type { Request, Response, NextFunction } from 'express';
import {
    errorManager,
    initOnboarding,
    getOnboardingProgress,
    updateOnboardingProgress,
    flowService,
    SyncConfigType,
    deployPreBuilt as deployPreBuiltSyncConfig,
    syncManager,
    getOnboardingProvider,
    createOnboardingProvider,
    DEMO_GITHUB_CONFIG_KEY,
    connectionService,
    DEMO_SYNC_NAME,
    DEMO_MODEL,
    getSyncByIdAndName,
    DEFAULT_GITHUB_CLIENT_ID,
    DEFAULT_GITHUB_CLIENT_SECRET,
    SyncCommand,
    SyncStatus,
    SyncClient,
    NangoError,
    DEMO_ACTION_NAME,
    createActivityLog,
    LogActionEnum,
    analytics,
    AnalyticsTypes,
    getSyncConfigRaw
} from '@nangohq/shared';
import type { IncomingPreBuiltFlowConfig } from '@nangohq/shared';
import { getLogger } from '@nangohq/utils';
import type { LogContext } from '@nangohq/logs';
import { defaultOperationExpiration, logContextGetter } from '@nangohq/logs';
import { records as recordsService } from '@nangohq/records';
import type { GetOnboardingStatus } from '@nangohq/types';
import type { RequestLocals } from '../utils/express.js';
import { getOrchestrator } from '../utils/utils.js';

const logger = getLogger('Server.Onboarding');
const orchestrator = getOrchestrator();

class OnboardingController {
    /**
     * Start an onboarding process.
     * We create a row in the DB to store the global state and create a GitHub provider so we can launch the oauth process
     */
    async create(_: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            const { user, environment, account } = res.locals;

            if (environment.name !== 'dev') {
                res.status(400).json({ error: 'onboarding_dev_only' });
                return;
            }
            if (!DEFAULT_GITHUB_CLIENT_ID || !DEFAULT_GITHUB_CLIENT_SECRET) {
                throw new Error('missing_env_var');
            }

            void analytics.track(AnalyticsTypes.DEMO_1, account.id, { user_id: user.id });

            // Create an onboarding state to remember where user left
            const onboardingId = await initOnboarding(user.id);
            if (!onboardingId) {
                void analytics.track(AnalyticsTypes.DEMO_1_ERR, account.id, { user_id: user.id });
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
     * Get the interactive demo status.
     * We use the progress stored in DB to remember "unprovable step", but most of steps relies on specific data to be present.
     * So we check if each step has been correctly achieved.
     * This is particularly useful if we retry, if some parts have failed or if the user has deleted part of the state
     */
    async status(req: Request, res: Response<GetOnboardingStatus['Reply'], Required<RequestLocals>>, next: NextFunction) {
        try {
            const { user, environment } = res.locals;
            if (environment.name !== 'dev') {
                res.status(400).json({ error: { code: 'onboarding_dev_only' } });
                return;
            }

            const status = await getOnboardingProgress(user.id);
            if (!status) {
                res.status(404).send({ error: { code: 'no_onboarding' } });
                return;
            }

            const payload: GetOnboardingStatus['Success'] = {
                id: status.id,
                progress: status.progress,
                connection: false,
                provider: false,
                sync: false,
                records: null
            };
            const { connection_id: connectionId } = req.query;
            if (!connectionId || typeof connectionId !== 'string') {
                res.status(400).json({ error: { code: 'invalid_query_params' } });
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

            const getRecords = await recordsService.getRecords({
                connectionId: connectionExists.id,
                model: DEMO_MODEL
            });
            if (getRecords.isErr()) {
                res.status(400).json({ error: { code: 'failed_to_get_records' } });
                return;
            } else {
                payload.records = getRecords.value.records;
            }
            if (payload.records.length > 0) {
                payload.progress = status.progress > 4 ? status.progress : 4;
            }

            res.status(200).json(payload);
        } catch (err) {
            next(err);
        }
    }

    /**
     * Create interactive demo Sync and Action
     * The code can be found in nango-integrations/github
     */
    async deploy(_: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            const { environment, account, user } = res.locals;
            void analytics.track(AnalyticsTypes.DEMO_2, account.id, { user_id: user.id });

            const githubDemoSync = flowService.getFlow(DEMO_SYNC_NAME);
            const githubDemoAction = flowService.getFlow(DEMO_ACTION_NAME);
            if (!githubDemoSync || !githubDemoAction) {
                void analytics.track(AnalyticsTypes.DEMO_2_ERR, account.id, { user_id: user.id });
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
                    endpoints: githubDemoSync.endpoints,
                    model_schema: JSON.stringify(githubDemoSync.models),
                    is_public: true,
                    public_route: 'github',
                    input: ''
                },
                {
                    provider: 'github',
                    providerConfigKey: DEMO_GITHUB_CONFIG_KEY,
                    type: SyncConfigType.ACTION,
                    name: DEMO_ACTION_NAME,
                    is_public: true,
                    runs: 'every day',
                    endpoints: githubDemoAction.endpoints,
                    models: [githubDemoAction.returns as unknown as string],
                    model_schema: JSON.stringify(githubDemoAction.models),
                    public_route: 'github',
                    input: githubDemoAction.input!
                }
            ];

            const deploy = await deployPreBuiltSyncConfig(environment, config, '', logContextGetter, orchestrator);
            if (!deploy.success || deploy.response === null) {
                void analytics.track(AnalyticsTypes.DEMO_2_ERR, account.id, { user_id: user.id });
                errorManager.errResFromNangoErr(res, deploy.error);
                return;
            }

            await syncManager.triggerIfConnectionsExist(deploy.response.result, environment.id, logContextGetter, orchestrator);

            void analytics.track(AnalyticsTypes.DEMO_2_SUCCESS, account.id, { user_id: user.id });
            res.status(200).json({ success: true });
        } catch (err) {
            next(err);
        }
    }

    /**
     * Check the sync completion state.
     * It could be replaced by regular API calls.
     */
    async checkSyncCompletion(
        req: Request<unknown, unknown, { connectionId?: string } | undefined>,
        res: Response<any, Required<RequestLocals>>,
        next: NextFunction
    ) {
        try {
            if (!req.body?.connectionId || typeof req.body.connectionId !== 'string') {
                res.status(400).json({ message: 'connection_id must be a string' });
                return;
            }

            const { environment, account, user } = res.locals;
            void analytics.track(AnalyticsTypes.DEMO_4, account.id, { user_id: user.id });
            const {
                success,
                error,
                response: status
            } = await syncManager.getSyncStatus(environment.id, DEMO_GITHUB_CONFIG_KEY, [DEMO_SYNC_NAME], orchestrator, req.body.connectionId, true);

            if (!success || !status) {
                void analytics.track(AnalyticsTypes.DEMO_4_ERR, account.id, { user_id: user.id });
                errorManager.errResFromNangoErr(res, error);
                return;
            }

            if (status.length <= 0) {
                // If for any reason we don't have a sync, because of a partial state
                logger.info(`[demo] no sync were found ${environment.id}`);
                await syncManager.runSyncCommand({
                    recordsService,
                    orchestrator,
                    environment,
                    providerConfigKey: DEMO_GITHUB_CONFIG_KEY,
                    syncNames: [DEMO_SYNC_NAME],
                    command: SyncCommand.RUN_FULL,
                    logContextGetter,
                    connectionId: req.body.connectionId,
                    initiator: 'demo'
                });
                await syncManager.runSyncCommand({
                    recordsService,
                    orchestrator,
                    environment,
                    providerConfigKey: DEMO_GITHUB_CONFIG_KEY,
                    syncNames: [DEMO_SYNC_NAME],
                    command: SyncCommand.UNPAUSE,
                    logContextGetter,
                    connectionId: req.body.connectionId,
                    initiator: 'demo'
                });

                res.status(200).json({ retry: true });
                return;
            }

            const [job] = status;
            if (!job) {
                res.status(400).json({ message: 'No sync job found' });
                return;
            }

            if (!job.nextScheduledSyncAt && job.jobStatus === SyncStatus.PAUSED) {
                // If the sync has never run
                logger.info(`[demo] no job were found ${environment.id}`);
                await syncManager.runSyncCommand({
                    recordsService,
                    orchestrator,
                    environment,
                    providerConfigKey: DEMO_GITHUB_CONFIG_KEY,
                    syncNames: [DEMO_SYNC_NAME],
                    command: SyncCommand.RUN_FULL,
                    logContextGetter,
                    connectionId: req.body.connectionId,
                    initiator: 'demo'
                });
            }

            if (job.jobStatus === SyncStatus.SUCCESS) {
                void analytics.track(AnalyticsTypes.DEMO_4_SUCCESS, account.id, { user_id: user.id });
            }

            res.status(200).json(job);
        } catch (err) {
            next(err);
        }
    }

    /**
     * Log the progress, this is merely informative and for BI.
     */
    async updateStatus(req: Request<unknown, unknown, { progress?: number } | undefined>, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            const { user, account, environment } = res.locals;
            if (environment.name !== 'dev') {
                res.status(400).json({ message: 'onboarding_dev_only' });
                return;
            }

            if (typeof req.body?.progress !== 'number' || req.body.progress > 6 || req.body.progress < 0) {
                res.status(400).json({ message: 'Missing progress' });
                return;
            }

            const progress = req.body.progress;

            const status = await getOnboardingProgress(user.id);
            if (!status) {
                res.status(404).send({ message: 'no_onboarding' });
                return;
            }

            await updateOnboardingProgress(status.id, progress);
            if (progress === 3 || progress === 6) {
                void analytics.track(AnalyticsTypes[`DEMO_${progress}`], account.id, { user_id: user.id });
            }
            if (progress === 1) {
                // Step 1 is actually deploy+frontend auth
                // Frontend is in a different API so we can't instrument it on the backend so we assume if we progress then step 1 was a success
                void analytics.track(AnalyticsTypes.DEMO_1_SUCCESS, account.id, { user_id: user.id });
            }

            res.status(200).json({
                success: true
            });
        } catch (err) {
            next(err);
        }
    }

    /**
     * Trigger an action to write a test GitHub issue
     */
    async writeGithubIssue(
        req: Request<unknown, unknown, { connectionId?: string; title?: string } | undefined>,
        res: Response<any, Required<RequestLocals>>,
        next: NextFunction
    ) {
        let logCtx: LogContext | undefined;
        try {
            const { environment, account, user } = res.locals;
            if (environment.name !== 'dev') {
                res.status(400).json({ message: 'onboarding_dev_only' });
                return;
            }

            if (!req.body?.connectionId || typeof req.body.connectionId !== 'string') {
                res.status(400).json({ message: 'connection_id must be a string' });
                return;
            }
            if (!req.body.title || typeof req.body.title !== 'string') {
                res.status(400).json({ message: 'title must be a string' });
                return;
            }

            void analytics.track(AnalyticsTypes.DEMO_5, account.id, { user_id: user.id });

            const syncClient = await SyncClient.getInstance();
            if (!syncClient) {
                void analytics.track(AnalyticsTypes.DEMO_5_ERR, account.id, { user_id: user.id });
                throw new NangoError('failed_to_get_sync_client');
            }

            const {
                success,
                error,
                response: connection
            } = await connectionService.getConnection(req.body.connectionId, DEMO_GITHUB_CONFIG_KEY, environment.id);
            if (!success || !connection) {
                void analytics.track(AnalyticsTypes.DEMO_5_ERR, account.id, { user_id: user.id });
                errorManager.errResFromNangoErr(res, error);
                return;
            }

            const activityLogId = await createActivityLog({
                level: 'info',
                success: false,
                action: LogActionEnum.ACTION,
                start: Date.now(),
                end: Date.now(),
                timestamp: Date.now(),
                connection_id: connection.connection_id,
                provider: 'github',
                provider_config_key: connection.provider_config_key,
                environment_id: environment.id,
                operation_name: DEMO_ACTION_NAME
            });

            if (!activityLogId) {
                throw new NangoError('failed_to_create_activity_log');
            }

            const syncConfig = await getSyncConfigRaw({
                environmentId: environment.id,
                config_id: connection.config_id!,
                name: DEMO_ACTION_NAME,
                isAction: true
            });
            if (!syncConfig) {
                res.status(500).json({ message: 'failed_to_find_action' });
                return;
            }

            logCtx = await logContextGetter.create(
                {
                    id: String(activityLogId),
                    operation: { type: 'action' },
                    message: 'Start action',
                    expiresAt: defaultOperationExpiration.action()
                },
                {
                    account,
                    environment,
                    user,
                    integration: { id: connection.config_id!, name: connection.provider_config_key, provider: 'github' },
                    connection: { id: connection.id!, name: connection.connection_id },
                    syncConfig: { id: syncConfig.id!, name: syncConfig?.sync_name }
                }
            );
            const actionResponse = await orchestrator.triggerAction({
                connection,
                actionName: DEMO_ACTION_NAME,
                input: { title: req.body.title },
                activityLogId,
                environment_id: environment.id,
                logCtx
            });

            if (actionResponse.isErr()) {
                void analytics.track(AnalyticsTypes.DEMO_5_ERR, account.id, { user_id: user.id });
                errorManager.errResFromNangoErr(res, actionResponse.error);
                await logCtx.error('Failed to trigger action', { error: actionResponse.error });
                await logCtx.failed();
                return;
            }

            await logCtx.success();
            void analytics.track(AnalyticsTypes.DEMO_5_SUCCESS, account.id, { user_id: user.id });
            res.status(200).json({ action: actionResponse.value });
        } catch (err) {
            if (logCtx) {
                await logCtx.error('Failed to trigger action', { error: err });
                await logCtx.failed();
            }
            next(err);
        }
    }
}

export default new OnboardingController();
