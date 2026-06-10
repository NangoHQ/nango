import { stringifyError } from '@nangohq/utils';

import type { FunctionErrorCode } from '@nangohq/types';
import type { Response } from 'express';

const maxFunctionErrorMessageLength = 20_000;

/**
 * Runtime allow-list for error codes exposed by the function API.
 * normalizeError receives arbitrary Error-like objects, so internal codes
 * such as ENOENT should not be returned as public API error codes.
 */
const functionErrorCodes = new Set<string>([
    'invalid_request',
    'integration_not_found',
    'compilation_error',
    'dryrun_error',
    'deployment_error',
    'connection_not_found',
    'dryrun_not_found',
    'deployment_not_found',
    'function_disabled',
    'execution_environment_unavailable',
    'timeout',
    'validation_error'
] satisfies FunctionErrorCode[]);

export function isFunctionErrorCode(code: string | undefined): code is FunctionErrorCode {
    return Boolean(code && functionErrorCodes.has(code));
}

export function normalizeFunctionErrorCode(code: string | undefined, fallback: FunctionErrorCode = 'dryrun_error'): FunctionErrorCode {
    return isFunctionErrorCode(code) ? code : fallback;
}

export function sendStepError({ res, error, status }: { res: Response; error: unknown; status?: number }): void {
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
        const rawCode = typeof err['type'] === 'string' ? err['type'] : typeof err['code'] === 'string' ? err['code'] : undefined;
        const code = isFunctionErrorCode(rawCode) ? rawCode : undefined;
        const payload = 'payload' in err ? err['payload'] : undefined;
        const status = typeof err['status'] === 'number' ? err['status'] : undefined;
        return { message, ...(code ? { code } : {}), ...(payload !== undefined ? { payload } : {}), ...(status ? { status } : {}) };
    }

    return { message: sanitizeMessage(stringifyError(error)) };
}

function sanitizeMessage(message: string): string {
    const urlReplacements: string[] = [];
    const messageWithUrlPlaceholders = message.replace(/https?:\/\/[^\s"']+/g, (match) => {
        const replacementKey = urlReplacements.length;
        urlReplacements.push(removeUrlOrigin(match));
        return `__URL_PLACEHOLDER_${replacementKey}__`;
    });

    return messageWithUrlPlaceholders
        .replace(/(^|[\s"'(])(\/[^\s"')]+)/g, (_, prefix: string) => `${prefix}${redactAbsolutePath()}`)
        .replace(/__URL_PLACEHOLDER_(\d+)__/g, (_, index: string) => urlReplacements[Number(index)] ?? '<url>')
        .replace(/\b[A-Z][A-Z0-9_]{4,}\b/g, (match) => (process.env[match] !== undefined ? '<env>' : match))
        .slice(0, maxFunctionErrorMessageLength);
}

function removeUrlOrigin(value: string): string {
    try {
        const url = new URL(value);
        return `${url.pathname}${url.search}${url.hash}`;
    } catch {
        return '<url>';
    }
}

function redactAbsolutePath(): string {
    return '<path>';
}
