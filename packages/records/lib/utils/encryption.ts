import { Encryption } from '@nangohq/utils';

import { dek } from '../env.js';

import type { EncryptedRecordData, FormattedRecord, UnencryptedRecordData } from '../types.js';

let encryption: Encryption | null = null;

function getEncryption(): Encryption {
    if (!encryption) {
        const encryptionKey = dek.get();
        if (!encryptionKey) {
            throw new Error('Encryption key is required to store records');
        }
        encryption = new Encryption(encryptionKey);
    }
    return encryption;
}

function isEncrypted(data: UnencryptedRecordData | EncryptedRecordData): data is EncryptedRecordData {
    return !!data && 'encryptedValue' in data;
}

export async function decryptRecordData(record: FormattedRecord): Promise<UnencryptedRecordData> {
    const encryptionManager = getEncryption();
    const { json } = record;
    if (isEncrypted(json)) {
        const { encryptedValue, iv, authTag } = json;
        const decryptedString = await encryptionManager.decryptAsync(encryptedValue, iv, authTag);
        return JSON.parse(decryptedString) as UnencryptedRecordData;
    }
    return json;
}

export function encryptRecords(records: FormattedRecord[]): FormattedRecord[] {
    const encryptionManager = getEncryption();
    const encryptedDataRecords: FormattedRecord[] = Object.assign([], records);

    for (const record of encryptedDataRecords) {
        const [encryptedValue, iv, authTag] = encryptionManager.encryptSync(JSON.stringify(record.json));
        record.json = { encryptedValue, iv, authTag };
    }

    return encryptedDataRecords;
}
