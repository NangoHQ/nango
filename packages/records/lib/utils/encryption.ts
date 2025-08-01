import { Encryption } from '@nangohq/utils';

import { envs } from '../env.js';

import type { EncryptedRecordData, FormattedRecord, UnencryptedRecordData } from '../types.js';

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
