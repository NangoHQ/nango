import { stringifyError } from '@nangohq/utils';

import type { Response } from 'express';

export type SfStep = 'compilation' | 'deployment' | 'lookup' | 'execution';

export function sendSfStepError({
    res,
    step,
    error,
    status,
    workspacePath
}: {
    res: Response;
    step: SfStep;
    error: unknown;
    status?: number;
    workspacePath?: string;
}) {
    const normalized = normalizeSfError(error, workspacePath);

    res.status(status || normalized.status || 500).send({
        error: {
            step,
            message: normalized.message,
            ...(normalized.code ? { code: normalized.code } : {}),
            ...(normalized.payload ? { payload: normalized.payload } : {}),
            ...(normalized.additionalProperties ? { additional_properties: normalized.additionalProperties } : {}),
            ...(normalized.stack ? { stack: normalized.stack } : {})
        }
    });
}

export function normalizeErrorMessage(message: string, workspacePath?: string): string {
    if (!workspacePath) {
        return message;
    }

    const normalizedWorkspace = workspacePath.replaceAll('\\', '/');
    return message.replaceAll('\\', '/').replaceAll(normalizedWorkspace, '').replace(/^\//, '');
}

function normalizeSfError(
    error: unknown,
    workspacePath?: string
): {
    message: string;
    code?: string;
    payload?: unknown;
    additionalProperties?: unknown;
    status?: number;
    stack?: string;
} {
    if (error && typeof error === 'object') {
        const maybeError = error as Record<string, unknown>;
        const message =
            typeof maybeError['message'] === 'string'
                ? normalizeErrorMessage(maybeError['message'] as string, workspacePath)
                : normalizeErrorMessage(stringifyError(error), workspacePath);
        const stack = typeof maybeError['stack'] === 'string' ? normalizeErrorMessage(maybeError['stack'] as string, workspacePath) : undefined;
        const code = typeof maybeError['type'] === 'string' ? (maybeError['type'] as string) : undefined;
        const payload = 'payload' in maybeError ? maybeError['payload'] : undefined;
        const additionalProperties = 'additional_properties' in maybeError ? maybeError['additional_properties'] : undefined;
        const status = typeof maybeError['status'] === 'number' ? (maybeError['status'] as number) : undefined;

        return {
            message,
            ...(code ? { code } : {}),
            ...(payload !== undefined ? { payload } : {}),
            ...(additionalProperties !== undefined ? { additionalProperties } : {}),
            ...(status ? { status } : {}),
            ...(stack ? { stack } : {})
        };
    }

    return {
        message: normalizeErrorMessage(stringifyError(error), workspacePath)
    };
}
