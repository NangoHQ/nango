import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import md5 from 'md5';
import * as uuid from 'uuid';

import { Err, Ok } from '@nangohq/utils';

import type { FormattedRecord, UnencryptedRecordData } from '../types.js';
import type { Result } from '@nangohq/utils';

dayjs.extend(utc);

export const formatRecords = ({
    data,
    connectionId,
    model,
    syncId,
    syncJobId,
    softDelete = false
}: {
    data: UnencryptedRecordData[];
    connectionId: number;
    model: string;
    syncId: string;
    syncJobId: number;
    softDelete?: boolean;
}): Result<FormattedRecord[]> => {
    // hashing unique composite key (connection, model, external_id)
    // to generate stable record ids across script executions
    const stableId = (unencryptedData: UnencryptedRecordData): string => {
        const namespace = uuid.v5(`${connectionId}${model}`, uuid.NIL);
        return uuid.v5(`${connectionId}${model}${unencryptedData.id}`, namespace);
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
            return Err(error);
        }

        const formattedRecord: FormattedRecord = {
            id: stableId(datum),
            json: datum,
            // postgresql does not support null bytes in strings
            external_id: String(datum['id']).replaceAll('\x00', ''),
            data_hash,
            model,
            connection_id: connectionId,
            sync_id: syncId,
            sync_job_id: syncJobId
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
    return Ok(formattedRecords);
};
