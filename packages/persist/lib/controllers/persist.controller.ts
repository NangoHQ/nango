import type { NextFunction, Request, Response } from 'express';
import type { LogLevel, DataResponse, DataRecord } from '@nangohq/shared';
import { records as recordsService, format as recordsFormatter } from '@nangohq/records';
import type { FormattedRecord, UnencryptedRecordData, UpsertSummary } from '@nangohq/records';
import {
    createActivityLogMessage,
    errorManager,
    ErrorSourceEnum,
    LogActionEnum,
    updateSyncJobResult,
    dataService,
    syncDataService,
    getSyncConfigByJobId
} from '@nangohq/shared';
import tracer from 'dd-trace';
import type { Span } from 'dd-trace';
import { logContextGetter, oldLevelToNewLevel } from '@nangohq/logs';
import { getLogger, resultErr, resultOk, isOk, isErr, metrics, stringifyError } from '@nangohq/utils';
import type { Result } from '@nangohq/utils';

const logger = getLogger('PersistController');

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
        const logCtx = logContextGetter.get({ id: String(activityLogId) });
        const persist = async (records: FormattedRecord[], legacyRecords: DataRecord[]) => {
            const newUpsert = recordsService.upsert({ records, connectionId: nangoConnectionId, model, softDelete: false });
            const legacyUpsert = dataService.upsert(legacyRecords, nangoConnectionId, model, activityLogId, environmentId, false, logCtx);
            const [newRes] = await Promise.all([newUpsert, legacyUpsert]);
            return newRes;
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
        const logCtx = logContextGetter.get({ id: String(activityLogId) });
        const persist = async (records: FormattedRecord[], legacyRecords: DataRecord[]) => {
            const newUpsert = recordsService.upsert({ records, connectionId: nangoConnectionId, model, softDelete: true });
            const legacyUpsert = dataService.upsert(legacyRecords, nangoConnectionId, model, activityLogId, environmentId, true, logCtx);
            const [newRes] = await Promise.all([newUpsert, legacyUpsert]);
            return newRes;
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
        const logCtx = logContextGetter.get({ id: String(activityLogId) });
        const persist = async (records: FormattedRecord[], legacyRecords: DataRecord[]) => {
            const newUpsert = recordsService.update({ records, connectionId: nangoConnectionId, model });
            const legacyUpsert = dataService.update(legacyRecords, nangoConnectionId, model, activityLogId, environmentId, logCtx);
            const [newRes] = await Promise.all([newUpsert, legacyUpsert]);
            return newRes;
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
        persistFunction: (records: FormattedRecord[], legacyRecords: DataRecord[]) => Promise<Result<UpsertSummary>>;
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

        let formattedRecords: FormattedRecord[] = [];
        const formatting = recordsFormatter.formatRecords({
            data: records as UnencryptedRecordData[],
            connectionId: nangoConnectionId,
            model,
            syncId,
            syncJobId,
            softDelete
        });
        if (isErr(formatting)) {
            logger.error('Failed to format records: ' + formatting.err.message);
        } else {
            formattedRecords = formatting.res;
        }

        const {
            success,
            error,
            response: legacyFormattedRecords
        } = syncDataService.formatDataRecords(records as unknown as DataResponse[], nangoConnectionId, model, syncId, syncJobId, softDelete);

        const logCtx = logContextGetter.get({ id: String(activityLogId) });
        if (!success || legacyFormattedRecords === null) {
            await createActivityLogMessage({
                level: 'error',
                environment_id: environmentId,
                activity_log_id: activityLogId,
                content: `There was an issue with the batch ${persistType}. ${error?.message}`,
                timestamp: Date.now()
            });
            await logCtx.error('There was an issue with the batch', { error, persistType });
            const res = resultErr(`Failed to ${persistType} records ${activityLogId}`);

            span.setTag('error', res.err).finish();
            return res;
        }
        const syncConfig = await getSyncConfigByJobId(syncJobId);

        if (syncConfig && !syncConfig.models.includes(model)) {
            const res = resultErr(`The model '${model}' is not included in the declared sync models: ${syncConfig.models}.`);
            await logCtx.error('The model is not included in the declared sync models', { model });

            span.setTag('error', res.err).finish();
            return res;
        }

        const persistResult = await persistFunction(formattedRecords, legacyFormattedRecords);
        // TODO after migrating records
        // add activityLog if persistResult.nonUniqueKeys is not empty
        //
        // for (const nonUniqueKey of persistResult.summary.nonUniqueKeys) {
        //     await createActivityLogMessage({
        //         level: 'error',
        //         environment_id,
        //         activity_log_id: activityLogId,
        //         content: `Found duplicate key '${nonUniqueKey}' for model ${model}. The record was ignored.`,
        //         timestamp: Date.now()
        //     });
        // }

        if (isOk(persistResult)) {
            const summary = persistResult.res;
            const updatedResults = {
                [model]: {
                    added: summary.addedKeys.length,
                    updated: summary.updatedKeys.length,
                    deleted: summary.deletedKeys?.length as number
                }
            };

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
            const res = resultErr(persistResult.err);
            span.setTag('error', res.err).finish();
            return res;
        }
    }
}

export default new PersistController();
