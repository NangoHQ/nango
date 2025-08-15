import tracer from 'dd-trace';

import { logContextGetter } from '@nangohq/logs';
import { format as recordsFormatter, records as recordsService } from '@nangohq/records';
import { ErrorSourceEnum, LogActionEnum, connectionService, errorManager, getSyncConfigByJobId, updateSyncJobResult } from '@nangohq/shared';
import { Err, Ok, metrics, stringifyError } from '@nangohq/utils';

import { logger } from './logger.js';
import { pubsub } from './pubsub.js';

import type { FormattedRecord, UnencryptedRecordData, UpsertSummary } from '@nangohq/records';
import type { MergingStrategy } from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type { Span } from 'dd-trace';

export type PersistType = 'save' | 'delete' | 'update';
export const recordsPath = '/environment/:environmentId/connection/:nangoConnectionId/sync/:syncId/job/:syncJobId/records';

export async function persistRecords({
    persistType,
    accountId,
    environmentId,
    connectionId,
    providerConfigKey,
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
    connectionId: number;
    providerConfigKey: string;
    syncId: string;
    syncJobId: number;
    model: string;
    records: Record<string, any>[];
    activityLogId: string;
    merging?: MergingStrategy;
}): Promise<Result<MergingStrategy>> {
    const active = tracer.scope().active();
    const span = tracer.startSpan('persistRecords', {
        childOf: active as Span,
        tags: {
            persistType,
            environmentId,
            providerConfigKey,
            syncId,
            syncJobId,
            model,
            activityLogId
        }
    });

    const logCtx = logContextGetter.getStateLess({ id: String(activityLogId), accountId });

    const connection = await connectionService.getConnectionById(connectionId);
    if (!connection) {
        const err = new Error(`Connection ${connectionId} not found`);
        void logCtx.error('Connection not found', { error: err, persistType });
        span.setTag('error', err).finish();
        return Err(err);
    }

    let persistFunction: (records: FormattedRecord[]) => Promise<Result<UpsertSummary>>;
    let softDelete: boolean;
    switch (persistType) {
        case 'save':
            softDelete = false;
            persistFunction = async (records: FormattedRecord[]) => recordsService.upsert({ records, connectionId, environmentId, model, softDelete, merging });
            break;
        case 'delete':
            softDelete = true;
            persistFunction = async (records: FormattedRecord[]) => recordsService.upsert({ records, connectionId, environmentId, model, softDelete, merging });
            break;
        case 'update':
            softDelete = false;
            persistFunction = async (records: FormattedRecord[]) => {
                return recordsService.update({ records, connectionId, model, merging });
            };
            break;
    }

    const recordsData = records as UnencryptedRecordData[];
    const formatting = recordsFormatter.formatRecords({
        data: recordsData,
        connectionId,
        model,
        syncId,
        syncJobId,
        softDelete
    });

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

        await updateSyncJobResult(syncJobId, updatedResults, baseModel);

        const allModifiedKeys = new Set([...summary.addedKeys, ...summary.updatedKeys, ...(summary.deletedKeys || [])]);
        const total = allModifiedKeys.size + summary.unchangedKeys.length;

        void logCtx.info(
            `Successfully batch ${persistType}d ${total} record${total > 1 ? 's' : ''} (${allModifiedKeys.size} modified) for model ${baseModel} `,
            { persistType },
            {
                persistResults: {
                    model: baseModel,
                    added: summary.addedKeys.length,
                    updated: summary.updatedKeys.length,
                    deleted: summary.deletedKeys?.length || 0,
                    unchanged: summary.unchangedKeys.length,

                    addedKeys: summary.addedKeys,
                    updatedKeys: summary.updatedKeys,
                    deleteKeys: summary.deletedKeys || [],
                    unchangedKeys: [] // TODO: reup summary.unchangedKeys
                }
            }
        );

        const mar = new Set(summary.activatedKeys).size;

        if (mar > 0) {
            void pubsub.publisher.publish({
                subject: 'usage',
                type: 'usage.monthly_active_records',
                payload: { value: mar, properties: { accountId, environmentId, providerConfigKey, connectionId, syncId, model } }
            });
        }

        // Datadog metrics
        let recordsSizeInBytes = 0;
        let modifiedRecordsSizeInBytes = 0;
        try {
            recordsSizeInBytes = Buffer.byteLength(JSON.stringify(records), 'utf8');
            modifiedRecordsSizeInBytes = recordsData.reduce((acc, record) => {
                if (allModifiedKeys.has(record.id)) {
                    return acc + Buffer.byteLength(JSON.stringify(record), 'utf8');
                }
                return acc;
            }, 0);
        } catch (err) {
            logger.warning('Failed to calculate record sizes in bytes', { environmentId, connectionId, syncId, model, error: stringifyError(err) });
        }
        metrics.increment(metrics.Types.MONTHLY_ACTIVE_RECORDS_COUNT, mar, { accountId });
        metrics.increment(metrics.Types.PERSIST_RECORDS_COUNT, records.length);
        metrics.increment(metrics.Types.PERSIST_RECORDS_MODIFIED_COUNT, allModifiedKeys.size);
        metrics.increment(metrics.Types.PERSIST_RECORDS_MODIFIED_SIZE_IN_BYTES, modifiedRecordsSizeInBytes);
        metrics.increment(metrics.Types.PERSIST_RECORDS_SIZE_IN_BYTES, recordsSizeInBytes, { accountId });

        span.addTags({
            'records.in.count': records.length,
            'records.in.sizeInBytes': recordsSizeInBytes,
            'records.modified.count': allModifiedKeys.size,
            'records.modified.sizeInBytes': modifiedRecordsSizeInBytes
        });
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
                connectionId,
                providerConfigKey: providerConfigKey,
                syncId: syncId,
                syncJobId: syncJobId
            }
        });
        span.setTag('error', persistResult.error).finish();
        return Err(persistResult.error);
    }
}
