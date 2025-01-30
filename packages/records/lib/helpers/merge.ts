import deepmerge from '@fastify/deepmerge';
import type { UnencryptedRecordData } from '../types';

const merge = deepmerge({
    // define algorithm for merging arrays - merges each item in the array
    // rather than concatenating
    mergeArray: (options) => {
        const deepmerge = options.deepmerge;
        const clone = options.clone;
        return function (target, source) {
            let i = 0;
            const il = Math.max(target.length, source.length);
            const result = new Array(il);
            for (i = 0; i < il; ++i) {
                if (i < source.length) {
                    result[i] = deepmerge(target[i], source[i]);
                } else {
                    result[i] = clone(target[i]);
                }
            }
            return result;
        };
    }
});

export function deepMergeRecordData(oldData: UnencryptedRecordData, newData: UnencryptedRecordData): UnencryptedRecordData {
    return merge(oldData, newData) as UnencryptedRecordData;
}
