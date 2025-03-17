import { records as recordsService, format as recordsFormatter } from '@nangohq/records';
import type { FormattedRecord, UnencryptedRecordData, UpsertSummary } from '@nangohq/records';
import { errorManager, ErrorSourceEnum, LogActionEnum, updateSyncJobResult, getSyncConfigByJobId } from '@nangohq/shared';
import tracer from 'dd-trace';
import type { Span } from 'dd-trace';
import { logContextGetter } from '@nangohq/logs';
import type { Result } from '@nangohq/utils';
import { Err, Ok, metrics, stringifyError } from '@nangohq/utils';
import type { MergingStrategy } from '@nangohq/types';

export type PersistType = 'save' | 'delete' | 'update';
export const recordsPath = '/environment/:environmentId/connection/:nangoConnectionId/sync/:syncId/job/:syncJobId/records';

export async function persistRecords({
    persistType,
    accountId,
    environmentId,
    connectionId,
    providerConfigKey,
    nangoConnectionId,
    syncId,
    syncJobId,
    model,
    records,
    activityLogId,
    merging = { strategy: 'override' }
}: {
    persistType: PersistType;
    accountId: number;
    environmentId: number;
    connectionId: string;
    providerConfigKey: string;
    nangoConnectionId: number;
    syncId: string;
    syncJobId: number;
    model: string;
    records: Record<string, any>[];
    activityLogId: string;
    merging?: MergingStrategy;
}): Promise<Result<MergingStrategy>> {
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

    let persistFunction: (records: FormattedRecord[]) => Promise<Result<UpsertSummary>>;
    let softDelete: boolean;
    switch (persistType) {
        case 'save':
            softDelete = false;
            persistFunction = async (records: FormattedRecord[]) =>
                recordsService.upsert({ records, connectionId: nangoConnectionId, environmentId, model, softDelete, merging });
            break;
        case 'delete':
            softDelete = true;
            persistFunction = async (records: FormattedRecord[]) =>
                recordsService.upsert({ records, connectionId: nangoConnectionId, environmentId, model, softDelete, merging });
            break;
        case 'update':
            softDelete = false;
            persistFunction = async (records: FormattedRecord[]) => {
                return recordsService.update({ records, connectionId: nangoConnectionId, model, merging });
            };
            break;
    }

    const formatting = recordsFormatter.formatRecords({
        data: records as UnencryptedRecordData[],
        connectionId: nangoConnectionId,
        model,
        syncId,
        syncJobId,
        softDelete
    });
    const logCtx = logContextGetter.getStateLess({ id: String(activityLogId), accountId });
    if (formatting.isErr()) {
        void logCtx.error('There was an issue with the batch', { error: formatting.error, persistType });
        const err = new Error(`Failed to ${persistType} records ${activityLogId}`);

        span.setTag('error', err).finish();
        return Err(err);
    }

    const baseModel = model.split('::')[0] || model;
    const syncConfig = await getSyncConfigByJobId(syncJobId);
    if (syncConfig && !syncConfig.models.includes(baseModel)) {
        const err = new Error(`The model '${baseModel}' is not included in the declared sync models: ${syncConfig.models.join(', ')}.`);
        void logCtx.error(`The model '${baseModel}' is not included in the declared sync models`);

        span.setTag('error', err).finish();
        return Err(err);
    }

    const persistResult = await persistFunction(formatting.value);
    if (persistResult.isOk()) {
        const summary = persistResult.value;
        const updatedResults = {
            [baseModel]: {
                added: summary.addedKeys.length,
                updated: summary.updatedKeys.length,
                deleted: summary.deletedKeys?.length || 0
            }
        };
        for (const nonUniqueKey of summary.nonUniqueKeys) {
            void logCtx.error(`Found duplicate key '${nonUniqueKey}' for model ${baseModel}. The record was ignored.`);
        }

        const total = summary.addedKeys.length + summary.updatedKeys.length + (summary.deletedKeys?.length || 0);
        void logCtx.info(`Successfully batched ${total} record${total > 1 ? 's' : ''}`, {
            persistType,
            updatedResults
        });
        await updateSyncJobResult(syncJobId, updatedResults, baseModel);

        metrics.increment(metrics.Types.PERSIST_RECORDS_COUNT, records.length, { accountId });
        metrics.increment(metrics.Types.PERSIST_RECORDS_SIZE_IN_BYTES, recordsSizeInBytes, { accountId });

        span.finish();
        return Ok(persistResult.value.nextMerging);
    } else {
        const content = `There was an issue with the batch ${persistType}. ${stringifyError(persistResult.error)}`;

        void logCtx.error('There was an issue with the batch', { error: persistResult.error, persistType });

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
