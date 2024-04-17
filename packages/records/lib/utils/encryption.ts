import type { EncryptedRecordData, FormattedRecord, UnencryptedRecord, UnencryptedRecordData } from '../types';
import { Encryption } from '@nangohq/utils';
import { envs } from '../env.js';

function isEncrypted(data: UnencryptedRecordData | EncryptedRecordData): data is EncryptedRecordData {
    return 'encryptedValue' in data;
}
const encryptionManager = new Encryption(envs.NANGO_ENCRYPTION_KEY);

export function decryptRecordData(record: FormattedRecord): UnencryptedRecordData {
    const { json } = record;
    if (isEncrypted(json)) {
        const { encryptedValue, iv, authTag } = json;
        const decryptedString = encryptionManager.decrypt(encryptedValue, iv, authTag);
        return JSON.parse(decryptedString) as UnencryptedRecordData;
    }
    return json;
}

export function decryptRecords(records: FormattedRecord[]): UnencryptedRecord[] {
    const decryptedRecords: UnencryptedRecord[] = [];
    for (const record of records) {
        decryptedRecords.push({
            ...record,
            record: decryptRecordData(record)
        });
    }
    return decryptedRecords;
}

export function encryptDataRecords(records: FormattedRecord[]): FormattedRecord[] {
    const encryptedDataRecords: FormattedRecord[] = Object.assign([], records);

    for (const record of encryptedDataRecords) {
        const [encryptedValue, iv, authTag] = encryptionManager.encrypt(JSON.stringify(record.json));
        record.json = { encryptedValue, iv, authTag };
    }

    return encryptedDataRecords;
}
