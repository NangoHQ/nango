import { APICallError, RetryError } from 'ai';

import type { AgentPlaygroundModelUnavailableError } from '@nangohq/types';

export type ModelErrorCategory = 'outage' | 'rate_limit' | 'quota' | 'auth';

interface ProviderFailure {
    statusCode: number | undefined;
    codes: string[];
    isRetryable: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;
}

function errorCodes(data: unknown): string[] {
    const record = asRecord(data);
    const error = asRecord(record?.['error']) ?? record;
    return [error?.['code'], error?.['type']].filter((value): value is string => typeof value === 'string');
}

function parseJson(text: string | undefined): unknown {
    if (!text) {
        return undefined;
    }
    try {
        return JSON.parse(text);
    } catch {
        return undefined;
    }
}

function providerFailure(error: unknown): ProviderFailure | undefined {
    const cause = RetryError.isInstance(error) ? error.lastError : error;
    if (APICallError.isInstance(cause)) {
        const codes = errorCodes(cause.data);
        return {
            statusCode: cause.statusCode,
            codes: codes.length > 0 ? codes : errorCodes(parseJson(cause.responseBody)),
            isRetryable: cause.isRetryable
        };
    }
    // An error OpenAI sends after the reply started is a plain object, not an APICallError.
    const record = asRecord(cause);
    if (record && typeof record['statusCode'] === 'number' && typeof record['isRetryable'] === 'boolean') {
        return { statusCode: record['statusCode'], codes: errorCodes(record), isRetryable: record['isRetryable'] };
    }
    return undefined;
}

export function modelErrorCategory(error: unknown): ModelErrorCategory | null {
    const failure = providerFailure(error);
    if (!failure) {
        return null;
    }
    const { statusCode, codes, isRetryable } = failure;
    if (codes.includes('insufficient_quota')) {
        return 'quota';
    }
    if (statusCode === 401 || statusCode === 403) {
        return 'auth';
    }
    if (statusCode === 429) {
        return 'rate_limit';
    }
    // The SDK also builds status-less errors for request mistakes that retrying won't fix.
    if (statusCode === undefined) {
        return isRetryable ? 'outage' : null;
    }
    if (statusCode === 408 || statusCode === 409 || statusCode >= 500) {
        return 'outage';
    }
    return null;
}

export function modelUnavailableError(category: ModelErrorCategory): AgentPlaygroundModelUnavailableError {
    return { error: { code: 'model_unavailable', retryable: category === 'outage' || category === 'rate_limit' } };
}
