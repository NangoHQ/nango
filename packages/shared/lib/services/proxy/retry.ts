import { isAxiosError } from 'axios';
import get from 'lodash-es/get.js';

import { networkError } from '@nangohq/utils';

import type { RetryReason } from './utils.js';
import type { ApplicationConstructedProxyConfiguration } from '@nangohq/types';
import type { AxiosError } from 'axios';

/**
 * Determine if we can retry or not based on the error we are receiving
 * The strategy has been laid out carefully, be careful on modifying anything here.
 */
export function getProxyRetryFromErr({ err, proxyConfig }: { err: unknown; proxyConfig?: ApplicationConstructedProxyConfiguration | undefined }): RetryReason {
    if (!isAxiosError(err)) {
        return { retry: false, reason: 'unknown_error' };
    }
    if (!proxyConfig) {
        return { retry: false, reason: 'empty_proxy_config' };
    }

    if (err.code && networkError.includes(err.code)) {
        // Network error do not have headers so we can early return true
        return { retry: true, reason: 'network_error' };
    }

    const status = err.response?.status || 0;
    const customHeaderConf = proxyConfig.provider.proxy?.retry;
    let isRetryable = false;
    let reason: string | undefined;

    if (Array.isArray(customHeaderConf?.error_code)) {
        for (const code of customHeaderConf.error_code) {
            if (matchesStatusCode(status, code)) {
                isRetryable = true;
                reason = `provider_error_code_${code}`;
                break;
            }
        }
    } else {
        // If error_code is not defined, we fall back to default retryable statuses
        // We allow headers to override this later (e.g., remaining=0), so we don't return early
        isRetryable =
            // Maybe: temporary error
            status >= 500 ||
            // Rate limit
            status === 429 ||
            // Maybe: token was refreshed
            status === 401;
    }
    if (!isRetryable && proxyConfig.retryOn) {
        if (proxyConfig.retryOn?.includes(status)) {
            isRetryable = true;
            reason = `retry_on_${status}`;
        }
    }

    if (!isRetryable && customHeaderConf?.remaining && err.response?.headers[customHeaderConf.remaining] === '0') {
        // Custom header in providers.yaml
        isRetryable = true;
        reason = 'provider_remaining';
    }

    if (!isRetryable) {
        return { retry: false, reason: 'not_retryable' };
    }

    if (proxyConfig.retryHeader && (proxyConfig.retryHeader.at || proxyConfig.retryHeader.after)) {
        // Headers configured on the fly
        const type = proxyConfig.retryHeader.at ? 'at' : 'after';
        const retryHeader = proxyConfig.retryHeader.at ? proxyConfig.retryHeader.at : proxyConfig.retryHeader.after;

        const res = getRetryFromHeader({ err, type, retryHeader: retryHeader! });
        if (res.found) {
            return { retry: true, reason: `custom_${res.reason}`, wait: res.wait };
        }
    }

    if (proxyConfig.provider.proxy && proxyConfig.provider.proxy.retry && (proxyConfig.provider.proxy.retry.at || proxyConfig.provider.proxy.retry.after)) {
        // Headers configured in the providers.yaml
        const type = proxyConfig.provider.proxy.retry.at ? 'at' : 'after';
        const retryHeader = proxyConfig.provider.proxy.retry.at ? proxyConfig.provider.proxy.retry.at : proxyConfig.provider.proxy.retry.after;

        const res = getRetryFromHeader({ err, type, retryHeader: retryHeader as string });
        if (res.found) {
            return { retry: true, reason: `preconfigured_${res.reason}`, wait: res.wait };
        }
    }

    if (proxyConfig.provider.proxy?.retry?.in_body) {
        const { strategy: type, value: rawRegex, path: retryPath } = proxyConfig.provider.proxy.retry.in_body;

        // Convert string to RegExp if necessary
        const retryRegex = rawRegex ? (typeof rawRegex === 'string' ? new RegExp(rawRegex) : rawRegex) : /(?:)/;

        const res = getRetryFromBody({ err, type, retryPath, retryRegex });
        if (res.found) {
            return {
                retry: true,
                reason: `preconfigured_${res.reason}`,
                wait: res.wait
            };
        }
    }

    return { retry: true, reason: reason || `status_code_${status}` };
}

/**
 * Get possible retry and wait time from headers
 */
export function getRetryFromHeader({
    err,
    type,
    retryHeader
}: {
    err: AxiosError;
    type: 'at' | 'after';
    retryHeader: string;
}): { found: false; reason: string } | { found: true; reason: string; wait: number } {
    const resetTimeEpoch = err.response?.headers[retryHeader] || err.response?.headers[retryHeader.toLowerCase()];
    return parseRetryValue({ type, rawValue: resetTimeEpoch, source: 'header' });
}

/**
 * Get possible retry and wait time from body
 */
export function getRetryFromBody({
    err,
    type,
    retryPath,
    retryRegex
}: {
    err: AxiosError;
    type: 'at' | 'after';
    retryPath: string;
    retryRegex: RegExp;
}): ReturnType<typeof parseRetryValue> {
    const responseBody = err.response?.data;
    if (!responseBody) {
        return { found: false, reason: 'in_body:no_response' };
    }

    const rawMessage = get(responseBody, retryPath);
    if (!rawMessage) {
        return { found: false, reason: 'in_body:path_missing' };
    }

    if (typeof rawMessage !== 'string') {
        return { found: false, reason: 'in_body:path_not_string' };
    }

    const match = rawMessage.match(retryRegex);

    if (!match || !match[1]) {
        return { found: false, reason: 'in_body:no_match' };
    }

    const extractedValue = match[1].trim();
    const result = parseRetryValue({ type, rawValue: extractedValue, source: 'body' });
    return {
        ...result,
        reason: result.found ? `in_body:${type}` : result.reason
    };
}

/**
 * Parses a retry value based on the specified strategy ('at' or 'after').
 */
function parseRetryValue({
    type,
    rawValue,
    source
}: {
    type: 'at' | 'after';
    rawValue: string | undefined;
    source: 'header' | 'body';
}): ReturnType<typeof getRetryFromHeader> {
    const prefix = `${type}:${source}`;

    if (!rawValue) {
        return { found: false, reason: `${type}:no_${source}` };
    }

    if (type === 'at') {
        const currentEpochTime = Math.floor(Date.now() / 1000);
        let retryAtEpoch: number;
        const numericValue = Number(rawValue);
        if (!isNaN(numericValue)) {
            const dateFromValue = new Date(numericValue);
            const isMs = dateFromValue.getFullYear() > 1971;
            retryAtEpoch = isMs ? Math.floor(numericValue / 1000) : numericValue;
        } else {
            const dateValue = new Date(rawValue).getTime();
            if (isNaN(dateValue)) {
                return { found: false, reason: `${prefix}_invalid_date` };
            }
            retryAtEpoch = Math.floor(dateValue / 1000);
        }

        if (retryAtEpoch <= currentEpochTime) {
            return { found: false, reason: `${prefix}_invalid_wait` };
        }
        // TODO: handle non-seconds header
        const waitDuration = Math.ceil(retryAtEpoch - currentEpochTime);
        return { found: true, reason: type, wait: waitDuration * 1000 };
    }

    if (type === 'after') {
        // TODO: handle non-seconds header (e.g: linear)
        const retryAfter = Number(rawValue);
        if (isNaN(retryAfter)) {
            return { found: false, reason: `${prefix}_invalid_number` };
        }

        return { found: true, reason: type, wait: retryAfter * 1000 };
    }

    return { found: false, reason: `unknown_type:${type}` };
}

function matchesStatusCode(status: number, rule: string): boolean {
    if (!rule) return false;

    const trimmed = rule.trim();

    if (/^[<>]=?\s*\d+$/.test(trimmed)) {
        const operatorMatch = trimmed.match(/^([<>]=?)\s*(\d+)$/);
        if (operatorMatch) {
            const [, operator, value] = operatorMatch;
            const numeric = Number(value);
            switch (operator) {
                case '>':
                    return status > numeric;
                case '>=':
                    return status >= numeric;
                case '<':
                    return status < numeric;
                case '<=':
                    return status <= numeric;
            }
        }
    } else if (/^\d+$/.test(trimmed)) {
        return status === Number(trimmed);
    }

    return false;
}
