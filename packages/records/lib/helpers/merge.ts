import deepmerge from '@fastify/deepmerge';
import type { UnencryptedRecordData } from '../types';

const merge = deepmerge({
    // define algorithm for merging arrays - merges each item in the array
    // rather than concatenating
    mergeArray: (options) => {
        const clone = options.clone;
        return function (_, source) {
            return clone(source);
        };
    }
});

export function deepMergeRecordData(oldData: UnencryptedRecordData, newData: UnencryptedRecordData): UnencryptedRecordData {
    return merge(oldData, newData) as UnencryptedRecordData;
}
