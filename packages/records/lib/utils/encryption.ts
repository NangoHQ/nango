import type { EncryptedRecordData, FormattedRecord, UnencryptedRecord, UnencryptedRecordData } from '../types';
import { encryptionManager } from '@nangohq/shared';

function isEncrypted(data: UnencryptedRecordData | EncryptedRecordData): data is EncryptedRecordData {
    return 'encryptedValue' in data;
}

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
    if (!encryptionManager.shouldEncrypt()) {
        return records;
    }

    const encryptedDataRecords: FormattedRecord[] = Object.assign([], records);

    for (const record of encryptedDataRecords) {
        const [encryptedValue, iv, authTag] = encryptionManager.encrypt(JSON.stringify(record.json));
        record.json = { encryptedValue, iv, authTag };
    }

    return encryptedDataRecords;
}
