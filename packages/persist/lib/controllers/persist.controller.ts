import type { NextFunction, Request, Response } from 'express';
import { records as recordsService, format as recordsFormatter } from '@nangohq/records';
import type { FormattedRecord, UnencryptedRecordData, UpsertSummary } from '@nangohq/records';
import { errorManager, ErrorSourceEnum, LogActionEnum, updateSyncJobResult, getSyncConfigByJobId } from '@nangohq/shared';
import tracer from 'dd-trace';
import type { Span } from 'dd-trace';
import { logContextGetter, oldLevelToNewLevel } from '@nangohq/logs';
import type { Result } from '@nangohq/utils';
import { Err, Ok, metrics, stringifyError } from '@nangohq/utils';

type LegacyLogLevel = 'info' | 'debug' | 'error' | 'warn' | 'http' | 'verbose' | 'silly';
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
        activityLogId: string;
    },
    void
>;

const MAX_LOG_CHAR = 10000;

class PersistController {
    public async saveLog(
        req: Request<{ environmentId: number }, void, { activityLogId: string; level: LegacyLogLevel; msg: string; timestamp?: number }, void>,
        res: Response,
        next: NextFunction
    ) {
        const {
            params: { environmentId },
            body: { activityLogId, level, msg, timestamp }
        } = req;
        const truncatedMsg = msg.length > MAX_LOG_CHAR ? `${msg.substring(0, MAX_LOG_CHAR)}... (truncated)` : msg;
        const logCtx = logContextGetter.getStateLess({ id: String(activityLogId) }, { logToConsole: false });
        const result = await logCtx.log({
            type: 'log',
            message: truncatedMsg,
            environmentId: environmentId,
            level: oldLevelToNewLevel[level],
            source: 'user',
            createdAt: (timestamp ? new Date(timestamp) : new Date()).toISOString()
        });

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
        if (result.isOk()) {
            res.status(201).send();
        } else {
            next(new Error(`'Failed to save records': ${result.error.message}`));
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
        if (result.isOk()) {
            res.status(201).send();
        } else {
            next(new Error(`'Failed to delete records': ${result.error.message}`));
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
        if (result.isOk()) {
            res.status(201).send();
        } else {
            next(new Error(`'Failed to update records': ${result.error.message}`));
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
        activityLogId: string;
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
        const logCtx = logContextGetter.getStateLess({ id: String(activityLogId) });
        if (formatting.isErr()) {
            await logCtx.error('There was an issue with the batch', { error: formatting.error, persistType });
            const err = new Error(`Failed to ${persistType} records ${activityLogId}`);

            span.setTag('error', err).finish();
            return Err(err);
        }

        const syncConfig = await getSyncConfigByJobId(syncJobId);
        if (syncConfig && !syncConfig?.models.includes(model)) {
            const err = new Error(`The model '${model}' is not included in the declared sync models: ${syncConfig.models}.`);
            await logCtx.error(`The model '${model}' is not included in the declared sync models`);

            span.setTag('error', err).finish();
            return Err(err);
        }

        const persistResult = await persistFunction(formatting.value);
        if (persistResult.isOk()) {
            const summary = persistResult.value;
            const updatedResults = {
                [model]: {
                    added: summary.addedKeys.length,
                    updated: summary.updatedKeys.length,
                    deleted: summary.deletedKeys?.length || 0
                }
            };
            for (const nonUniqueKey of summary.nonUniqueKeys) {
                await logCtx.error(`Found duplicate key '${nonUniqueKey}' for model ${model}. The record was ignored.`);
            }

            await logCtx.info('Batch saved successfully', { persistType, updatedResults });

            await updateSyncJobResult(syncJobId, updatedResults, model);

            metrics.increment(metrics.Types.PERSIST_RECORDS_COUNT, records.length);
            metrics.increment(metrics.Types.PERSIST_RECORDS_SIZE_IN_BYTES, recordsSizeInBytes);

            span.finish();
            return Ok(void 0);
        } else {
            const content = `There was an issue with the batch ${persistType}. ${stringifyError(persistResult.error)}`;

            await logCtx.error('There was an issue with the batch', { error: persistResult.error, persistType });

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
            span.setTag('error', persistResult.error).finish();
            return Err(persistResult.error);
        }
    }
}

export default new PersistController();
