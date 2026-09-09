import { logContextGetter } from '@nangohq/logs';
import { configService, connectionService, errorManager, getSyncConfigRaw, syncCommandToOperation, verifyOwnership } from '@nangohq/shared';

import { requireEnvironment } from '../utils/asyncWrapper.js';
import { getOrchestrator } from '../utils/utils.js';

import type { RequestLocals } from '../utils/express.js';
import type { LogContextOrigin } from '@nangohq/logs';
import type { SyncCommand } from '@nangohq/shared';
import type { NextFunction, Request, Response } from 'express';

const orchestrator = getOrchestrator();

class SyncController {
    public async syncCommand(req: Request, res: Response<any, RequestLocals>, next: NextFunction) {
        let logCtx: LogContextOrigin | undefined;

        try {
            const { account } = res.locals;
            const environment = requireEnvironment(req, res);
            if (!environment) {
                return;
            }

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
                syncName: sync_name,
                syncVariant: sync_variant,
                command,
                environmentId: environment.id,
                logCtx,
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
