import { serialize, deserialize } from 'v8';
import type { Result } from '@nangohq/utils';
import { Ok, Err } from '@nangohq/utils';

export const serde = {
    encode: <T>(obj: T): Result<Buffer> => {
        try {
            const res = serialize(obj);
            return Ok(res);
        } catch (err) {
            return Err(new Error(`Serialization failed`, { cause: err }));
        }
    },

    decode: <T>(encoded: Buffer): Result<T> => {
        try {
            const res = deserialize(encoded) as T;
            return Ok(res);
        } catch (err) {
            return Err(new Error(`Deserialization failed`, { cause: err }));
        }
    }
};
