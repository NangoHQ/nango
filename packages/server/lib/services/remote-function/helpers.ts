import { stringifyError } from '@nangohq/utils';

import type { FunctionErrorCode } from '@nangohq/types';
import type { Response } from 'express';

export type RemoteFunctionStep = 'compilation' | 'deployment' | 'lookup' | 'execution';

export function sendStepError({ res, step: _step, error, status }: { res: Response; step: RemoteFunctionStep; error: unknown; status?: number }): void {
    const normalized = normalizeError(error);

    res.status(status ?? normalized.status ?? 500).send({
        error: {
            code: (normalized.code ?? 'server_error') as FunctionErrorCode,
            message: normalized.message,
            ...(normalized.payload !== undefined ? { payload: normalized.payload } : {})
        }
    });
}

function normalizeError(error: unknown): {
    message: string;
    code?: string;
    payload?: unknown;
    status?: number;
} {
    if (error && typeof error === 'object') {
        const err = error as Record<string, unknown>;
        const message = typeof err['message'] === 'string' ? sanitizeMessage(err['message']) : sanitizeMessage(stringifyError(error));
        const code = typeof err['type'] === 'string' ? err['type'] : typeof err['code'] === 'string' ? err['code'] : undefined;
        const payload = 'payload' in err ? err['payload'] : undefined;
        const status = typeof err['status'] === 'number' ? err['status'] : undefined;
        return { message, ...(code ? { code } : {}), ...(payload !== undefined ? { payload } : {}), ...(status ? { status } : {}) };
    }
    return { message: sanitizeMessage(stringifyError(error)) };
}

/**
 * Strip internal details from error messages before sending to the client.
 * Removes: absolute paths, localhost/private URLs, env var names, stack traces.
 */
function sanitizeMessage(message: string): string {
    return message
        .replace(/\/[^\s"']+\/[^\s"']*/g, '<path>') // absolute paths
        .replace(/https?:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+)(:\d+)?[^\s]*/g, '<internal-url>') // internal URLs
        .replace(/\b[A-Z][A-Z0-9_]{4,}\b/g, (m) => (process.env[m] !== undefined ? '<env>' : m)) // env var names that exist
        .slice(0, 500); // cap length
}
