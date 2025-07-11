import { deserialize, serialize } from 'node:v8';

import { Err, Ok } from '@nangohq/utils';

import type { Result } from '@nangohq/utils';

export const serde = {
    serialize: <T>(obj: T): Result<Buffer> => {
        try {
            const res = serialize(obj);
            return Ok(res);
        } catch (err) {
            return Err(new Error(`Serialization failed`, { cause: err }));
        }
    },

    deserialize: <T>(encoded: Buffer): Result<T> => {
        try {
            const res = deserialize(encoded) as T;
            return Ok(res);
        } catch (err) {
            return Err(new Error(`Deserialization failed`, { cause: err }));
        }
    }
};
