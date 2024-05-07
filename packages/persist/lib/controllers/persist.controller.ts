import type { NextFunction, Request, Response } from 'express';
import type { LogLevel } from '@nangohq/shared';
import { records as recordsService, format as recordsFormatter } from '@nangohq/records';
import type { FormattedRecord, UnencryptedRecordData, UpsertSummary } from '@nangohq/records';
import { createActivityLogMessage, errorManager, ErrorSourceEnum, LogActionEnum, updateSyncJobResult, getSyncConfigByJobId } from '@nangohq/shared';
import tracer from 'dd-trace';
import type { Span } from 'dd-trace';
import { logContextGetter, oldLevelToNewLevel } from '@nangohq/logs';
import type { Result } from '@nangohq/utils';
import { resultErr, resultOk, isOk, isErr, metrics, stringifyError } from '@nangohq/utils';

type persistType = 'save' | 'delete' | 'update';
type RecordRequest = Request<
    {
        environmentId: number;
        nangoConnectionId: number;
        syncId: string;
        syncJobId: number;
    },
    void,
    {
        model: string;
        records: Record<string, any>[];
        providerConfigKey: string;
        connectionId: string;
        activityLogId: number;
    },
    void
>;

const MAX_LOG_CHAR = 10000;

class PersistController {
    public async saveActivityLog(
        req: Request<{ environmentId: number }, void, { activityLogId: number; level: LogLevel; msg: string }, void>,
        res: Response,
        next: NextFunction
    ) {
        const {
            params: { environmentId },
            body: { activityLogId, level, msg }
        } = req;
        const truncatedMsg = msg.length > MAX_LOG_CHAR ? `${msg.substring(0, MAX_LOG_CHAR)}... (truncated)` : msg;
        const result = await createActivityLogMessage(
            {
                level,
                environment_id: environmentId,
                activity_log_id: activityLogId,
                content: truncatedMsg,
                timestamp: Date.now()
            },
            false
        );
        const logCtx = logContextGetter.get({ id: String(activityLogId) });
        logCtx.logToConsole = false;
        await logCtx.log({ type: 'log', message: truncatedMsg, environmentId: environmentId, level: oldLevelToNewLevel[level], source: 'user' });

        if (result) {
            res.status(201).send();
        } else {
            next(new Error(`Failed to save log ${activityLogId}`));
        }
    }

    public async saveRecords(req: RecordRequest, res: Response, next: NextFunction) {
        const {
            params: { environmentId, nangoConnectionId, syncId, syncJobId },
            body: { model, records, providerConfigKey, connectionId, activityLogId }
        } = req;
        const persist = async (records: FormattedRecord[]) => {
            return recordsService.upsert({ records, connectionId: nangoConnectionId, model, softDelete: false });
        };
        const result = await PersistController.persistRecords({
            persistType: 'save',
            environmentId,
            connectionId,
            providerConfigKey,
            nangoConnectionId,
            syncId,
            syncJobId,
            model,
            records,
            activityLogId,
            softDelete: false,
            persistFunction: persist
        });
        if (isOk(result)) {
            res.status(201).send();
        } else {
            next(new Error(`'Failed to save records': ${result.err.message}`));
        }
    }

    public async deleteRecords(req: RecordRequest, res: Response, next: NextFunction) {
        const {
            params: { environmentId, nangoConnectionId, syncId, syncJobId },
            body: { model, records, providerConfigKey, connectionId, activityLogId }
        } = req;
        const persist = async (records: FormattedRecord[]) => {
            return recordsService.upsert({ records, connectionId: nangoConnectionId, model, softDelete: true });
        };
        const result = await PersistController.persistRecords({
            persistType: 'delete',
            environmentId,
            connectionId,
            providerConfigKey,
            nangoConnectionId,
            syncId,
            syncJobId,
            model,
            records,
            activityLogId,
            softDelete: true,
            persistFunction: persist
        });
        if (isOk(result)) {
            res.status(201).send();
        } else {
            next(new Error(`'Failed to delete records': ${result.err.message}`));
        }
    }

    public async updateRecords(req: RecordRequest, res: Response, next: NextFunction) {
        const {
            params: { environmentId, nangoConnectionId, syncId, syncJobId },
            body: { model, records, providerConfigKey, connectionId, activityLogId }
        } = req;
        const persist = async (records: FormattedRecord[]) => {
            return recordsService.update({ records, connectionId: nangoConnectionId, model });
        };
        const result = await PersistController.persistRecords({
            persistType: 'update',
            environmentId,
            connectionId,
            providerConfigKey,
            nangoConnectionId,
            syncId,
            syncJobId,
            model,
            records,
            activityLogId,
            softDelete: false,
            persistFunction: persist
        });
        if (isOk(result)) {
            res.status(201).send();
        } else {
            next(new Error(`'Failed to update records': ${result.err.message}`));
        }
    }

    private static async persistRecords({
        persistType,
        environmentId,
        connectionId,
        providerConfigKey,
        nangoConnectionId,
        syncId,
        syncJobId,
        model,
        records,
        activityLogId,
        softDelete,
        persistFunction
    }: {
        persistType: persistType;
        environmentId: number;
        connectionId: string;
        providerConfigKey: string;
        nangoConnectionId: number;
        syncId: string;
        syncJobId: number;
        model: string;
        records: Record<string, any>[];
        activityLogId: number;
        softDelete: boolean;
        persistFunction: (records: FormattedRecord[]) => Promise<Result<UpsertSummary>>;
    }): Promise<Result<void>> {
        const active = tracer.scope().active();
        const recordsSizeInBytes = Buffer.byteLength(JSON.stringify(records), 'utf8');
        const span = tracer.startSpan('persistRecords', {
            childOf: active as Span,
            tags: {
                persistType,
                environmentId,
                connectionId,
                providerConfigKey,
                nangoConnectionId,
                syncId,
                syncJobId,
                model,
                activityLogId,
                'records.count': records.length,
                'records.sizeInBytes': recordsSizeInBytes
            }
        });

        const formatting = recordsFormatter.formatRecords({
            data: records as UnencryptedRecordData[],
            connectionId: nangoConnectionId,
            model,
            syncId,
            syncJobId,
            softDelete
        });
        const logCtx = logContextGetter.get({ id: String(activityLogId) });
        if (isErr(formatting)) {
            await createActivityLogMessage({
                level: 'error',
                environment_id: environmentId,
                activity_log_id: activityLogId,
                content: `There was an issue with the batch ${persistType}. ${formatting.err.message}`,
                timestamp: Date.now()
            });
            await logCtx.error('There was an issue with the batch', { error: formatting.err, persistType });
            const res = resultErr(`Failed to ${persistType} records ${activityLogId}`);

            span.setTag('error', res.err).finish();
            return res;
        }

        const syncConfig = await getSyncConfigByJobId(syncJobId);
        if (syncConfig && !syncConfig?.models.includes(model)) {
            const res = resultErr(`The model '${model}' is not included in the declared sync models: ${syncConfig.models}.`);
            await logCtx.error('The model is not included in the declared sync models', { model });

            span.setTag('error', res.err).finish();
            return res;
        }

        const persistResult = await persistFunction(formatting.res);
        if (isOk(persistResult)) {
            const summary = persistResult.res;
            const updatedResults = {
                [model]: {
                    added: summary.addedKeys.length,
                    updated: summary.updatedKeys.length,
                    deleted: summary.deletedKeys?.length || 0
                }
            };
            for (const nonUniqueKey of summary.nonUniqueKeys) {
                await createActivityLogMessage({
                    level: 'error',
                    environment_id: environmentId,
                    activity_log_id: activityLogId,
                    content: `Found duplicate key '${nonUniqueKey}' for model ${model}. The record was ignored.`,
                    timestamp: Date.now()
                });
            }

            await createActivityLogMessage({
                level: 'info',
                environment_id: environmentId,
                activity_log_id: activityLogId,
                content: `Batch ${persistType} was a success and resulted in ${JSON.stringify(updatedResults, null, 2)}`,
                timestamp: Date.now()
            });
            await logCtx.info('Batch saved successfully', { persistType, updatedResults });

            await updateSyncJobResult(syncJobId, updatedResults, model);

            metrics.increment(metrics.Types.PERSIST_RECORDS_COUNT, records.length);
            metrics.increment(metrics.Types.PERSIST_RECORDS_SIZE_IN_BYTES, recordsSizeInBytes);

            span.finish();
            return resultOk(void 0);
        } else {
            const content = `There was an issue with the batch ${persistType}. ${stringifyError(persistResult.err)}`;

            await createActivityLogMessage({
                level: 'error',
                environment_id: environmentId,
                activity_log_id: activityLogId,
                content,
                timestamp: Date.now()
            });
            await logCtx.error('There was an issue with the batch', { error: persistResult.err, persistType });

            errorManager.report(content, {
                environmentId: environmentId,
                source: ErrorSourceEnum.CUSTOMER,
                operation: LogActionEnum.SYNC,
                metadata: {
                    connectionId: connectionId,
                    providerConfigKey: providerConfigKey,
                    syncId: syncId,
                    nangoConnectionId: nangoConnectionId,
                    syncJobId: syncJobId
                }
            });
            span.setTag('error', persistResult.err).finish();
            return persistResult;
        }
    }
}

export default new PersistController();
