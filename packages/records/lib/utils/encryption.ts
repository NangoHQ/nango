import type { EncryptedRecordData, FormattedRecord, UnencryptedRecord, UnencryptedRecordData } from '../types';
import { Encryption } from '@nangohq/utils';
import { envs } from '../env.js';

function getEncryption(): Encryption {
    const encryptionKey = envs.NANGO_ENCRYPTION_KEY;
    if (!encryptionKey) {
        throw new Error('NANGO_ENCRYPTION_KEY is not set');
    }
    return new Encryption(encryptionKey);
}

function isEncrypted(data: UnencryptedRecordData | EncryptedRecordData): data is EncryptedRecordData {
    return 'encryptedValue' in data;
}

export function decryptRecord(record: FormattedRecord): UnencryptedRecordData {
    const encryptionManager = getEncryption();
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
            record: decryptRecord(record)
        });
    }
    return decryptedRecords;
}

export function encryptRecords(records: FormattedRecord[]): FormattedRecord[] {
    const encryptionManager = getEncryption();
    const encryptedDataRecords: FormattedRecord[] = Object.assign([], records);

    for (const record of encryptedDataRecords) {
        const [encryptedValue, iv, authTag] = encryptionManager.encrypt(JSON.stringify(record.json));
        record.json = { encryptedValue, iv, authTag };
    }

    return encryptedDataRecords;
}
