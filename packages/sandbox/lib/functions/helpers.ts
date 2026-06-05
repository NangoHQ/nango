import type { FunctionErrorCode } from '@nangohq/types';

export class FunctionError extends Error {
    public readonly code: FunctionErrorCode;
    public readonly status: number;
    public readonly payload?: unknown;

    constructor({ code, message, status, payload }: { code: FunctionErrorCode; message: string; status: number; payload?: unknown }) {
        super(message);
        this.name = 'FunctionError';
        this.code = code;
        this.status = status;
        if (payload !== undefined) {
            this.payload = payload;
        }
    }
}
