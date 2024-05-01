import md5 from 'md5';
import * as uuid from 'uuid';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import type { FormattedRecord, UnencryptedRecordData } from '../types.js';
import { resultErr, resultOk } from '@nangohq/utils';
import type { Result } from '@nangohq/utils';

dayjs.extend(utc);

export const formatRecords = (
    data: UnencryptedRecordData[],
    connection_id: number,
    model: string,
    syncId: string,
    sync_job_id: number,
    softDelete = false
): Result<FormattedRecord[]> => {
    // hashing unique composite key (connection, model, external_id)
    // to generate stable record ids across script executions
    const stableId = (unencryptedData: UnencryptedRecordData): string => {
        const namespace = uuid.v5(`${connection_id}${model}`, uuid.NIL);
        return uuid.v5(`${connection_id}${model}${unencryptedData.id}`, namespace);
    };
    const formattedRecords: FormattedRecord[] = [];
    const now = new Date();
    for (const datum of data) {
        const data_hash = md5(JSON.stringify(datum));

        if (!datum) {
            break;
        }

        if (!datum['id']) {
            const error = new Error(`Missing id field in record: ${JSON.stringify(datum)}. Model: ${model}`);
            return resultErr(error);
        }

        const formattedRecord: FormattedRecord = {
            id: stableId(datum),
            json: datum,
            external_id: datum['id'],
            data_hash,
            model,
            connection_id,
            sync_id: syncId,
            sync_job_id
        };

        if (softDelete) {
            const deletedAt = datum['deletedAt'];
            formattedRecord.updated_at = now;
            formattedRecord.deleted_at = deletedAt ? dayjs(deletedAt as string).toDate() : now;
        } else {
            formattedRecord.deleted_at = null;
        }
        formattedRecords.push(formattedRecord);
    }
    return resultOk(formattedRecords);
};
