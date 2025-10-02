import type { NangoError } from '../utils/error.js';

export interface ServiceResponse<T = any> {
    success: boolean;
    error: NangoError | null;
    response: T | null;
}
