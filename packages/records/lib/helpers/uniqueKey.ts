import type { FormattedRecord } from '../types.js';

export function getUniqueId(record: FormattedRecord): string {
    return record.external_id;
}

export function verifyUniqueKeysAreUnique(records: FormattedRecord[]): { nonUniqueKeys: Set<string> } {
    const idMap = new Set<string>();
    const nonUniqueKeys = new Set<string>();

    for (const record of records) {
        const id = getUniqueId(record);
        if (idMap.has(id)) {
            nonUniqueKeys.add(id);
        } else {
            idMap.add(id);
        }
    }

    return { nonUniqueKeys };
}

export function removeDuplicateKey(records: FormattedRecord[]): { records: FormattedRecord[]; nonUniqueKeys: string[] } {
    const { nonUniqueKeys } = verifyUniqueKeysAreUnique(records);
    const seen = new Set();
    const recordsWithoutDuplicates = records.filter((record) => {
        const key = getUniqueId(record);
        return seen.has(key) ? false : seen.add(key);
    });

    return { records: recordsWithoutDuplicates, nonUniqueKeys: Array.from(nonUniqueKeys) };
}
