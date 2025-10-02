import { logContextGetter } from '@nangohq/logs';
import { records as recordsService } from '@nangohq/records';
import {
    NangoError,
    configService,
    connectionService,
    errorManager,
    getSyncConfigRaw,
    getSyncs,
    syncCommandToOperation,
    verifyOwnership
} from '@nangohq/shared';
import { isHosted } from '@nangohq/utils';

import { getOrchestrator } from '../utils/utils.js';

import type { RequestLocals } from '../utils/express.js';
import type { LogContextOrigin } from '@nangohq/logs';
import type { Sync, SyncCommand } from '@nangohq/shared';
import type { NextFunction, Request, Response } from 'express';

const orchestrator = getOrchestrator();

class SyncController {
    public async getSyncsByParams(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            const { environment } = res.locals;
            const { connection_id, provider_config_key } = req.query;

            const {
                success,
                error,
                response: connection
            } = await connectionService.getConnection(connection_id as string, provider_config_key as string, environment.id);

            if (!success) {
                errorManager.errResFromNangoErr(res, error);

                return;
            }

            if (!connection) {
                const error = new NangoError('unknown_connection', { connection_id, provider_config_key, environmentName: environment.name });
                errorManager.errResFromNangoErr(res, error);

                return;
            }

            if (isHosted) {
                res.send([]);
                return;
            }

            const rawSyncs = await getSyncs(connection, orchestrator);
            const syncs = await this.addRecordCount(rawSyncs, connection.id, environment.id);
            res.send(syncs);
        } catch (err) {
            next(err);
        }
    }

    private async addRecordCount(syncs: (Sync & { models: string[] })[], connectionId: number, environmentId: number) {
        const byModel = await recordsService.getRecordStatsByModel({ connectionId, environmentId });
        if (byModel.isOk()) {
            return syncs.map((sync) => ({
                ...sync,
                record_count: Object.fromEntries(
                    sync.models.map((model) => {
                        const modelFullName = sync.variant === 'base' ? model : `${model}::${sync.variant}`;
                        return [model, byModel.value[modelFullName]?.count ?? 0];
                    })
                )
            }));
        } else {
            return syncs.map((sync) => ({ ...sync, record_count: null }));
        }
    }

    public async syncCommand(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        let logCtx: LogContextOrigin | undefined;

        try {
            const { account, environment } = res.locals;

            const { command, nango_connection_id, sync_id, sync_name, sync_variant, delete_records } = req.body;
            const connection = await connectionService.getConnectionById(nango_connection_id);
            if (!connection) {
                res.status(404).json({ error: { code: 'not_found' } });
                return;
            }

            const config = await configService.getProviderConfig(connection.provider_config_key, environment.id);
            if (!config) {
                res.status(404).json({ error: { code: 'not_found' } });
                return;
            }

            const syncConfig = await getSyncConfigRaw({ environmentId: config.environment_id, config_id: config.id!, name: sync_name, isAction: false });
            if (!syncConfig) {
                res.status(404).json({ error: { code: 'not_found' } });
                return;
            }

            if (!syncConfig.enabled) {
                res.status(404).json({ error: { code: 'disabled_resource', message: 'The sync is disabled' } });
                return;
            }

            logCtx = await logContextGetter.create(
                { operation: { type: 'sync', action: syncCommandToOperation[command as SyncCommand] } },
                {
                    account,
                    environment,
                    integration: { id: config.id!, name: config.unique_key, provider: config.provider },
                    connection: { id: connection.id, name: connection.connection_id },
                    syncConfig: { id: syncConfig.id, name: syncConfig.sync_name }
                }
            );

            if (!(await verifyOwnership(nango_connection_id, environment.id, sync_id))) {
                void logCtx.error('Unauthorized access to run the command');
                await logCtx.failed();

                res.status(401).json({ error: { code: 'forbidden' } });
                return;
            }

            const result = await orchestrator.runSyncCommand({
                connectionId: connection.id,
                syncId: sync_id,
                syncVariant: sync_variant,
                command,
                environmentId: environment.id,
                logCtx,
                recordsService,
                initiator: 'UI',
                delete_records
            });

            if (result.isErr()) {
                errorManager.handleGenericError(result.error, req, res);
                await logCtx.failed();
                return;
            }

            void logCtx.info(`Sync command run successfully "${command}"`, { command, syncId: sync_id });
            await logCtx.success();

            res.status(200).json({ data: { success: true } });
        } catch (err) {
            if (logCtx) {
                void logCtx.error('Failed to sync command', { error: err });
                await logCtx.failed();
            }
            next(err);
        }
    }
}

export default new SyncController();
