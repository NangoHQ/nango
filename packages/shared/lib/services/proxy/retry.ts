import type { ApplicationConstructedProxyConfiguration } from '@nangohq/types';
import { networkError } from '@nangohq/utils';
import type { AxiosError } from 'axios';
import { isAxiosError } from 'axios';

/**
 * Determine if we can retry or not based on the error we are receiving
 * The strategy has been laid out carefully, be careful on modifying anything here.
 */
export function getProxyRetryFromErr({ err, proxyConfig }: { err: unknown; proxyConfig?: ApplicationConstructedProxyConfiguration | undefined }): {
    retry: boolean;
    reason: string;
    wait?: number;
} {
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

    // We don't return straight away because headers are more important than status code
    // If we find headers we will be able to adapt the wait time but we won't look for headers if it's not those status code
    let isRetryable = status >= 500 || status === 429;
    let reason: string | undefined;

    if (!isRetryable && proxyConfig.retryOn) {
        if (proxyConfig.retryOn?.includes(status)) {
            isRetryable = true;
            reason = `retry_on_${status}`;
        }
    }
    if (!isRetryable) {
        const customHeaderConf = proxyConfig.provider.proxy?.retry;
        if (customHeaderConf) {
            if (customHeaderConf.error_code && Number(customHeaderConf.error_code) === status) {
                // Custom status code in providers.yaml
                isRetryable = true;
                reason = 'provider_error_code';
            } else if (customHeaderConf.remaining && err.response && err.response.headers[customHeaderConf.remaining] === '0') {
                // Custom header in providers.yaml
                isRetryable = true;
                reason = 'provider_remaining';
            }
        }
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
    if (type === 'at') {
        const resetTimeEpoch = err.response?.headers[retryHeader] || err.response?.headers[retryHeader.toLowerCase()];
        if (!resetTimeEpoch) {
            return { found: false, reason: 'at:no_header' };
        }

        const currentEpochTime = Math.floor(Date.now() / 1000);
        const retryAtEpoch = Number(resetTimeEpoch);

        if (retryAtEpoch <= currentEpochTime) {
            return { found: false, reason: 'at:invalid_wait' };
        }

        // TODO: handle non-seconds header
        const waitDuration = Math.ceil(retryAtEpoch - currentEpochTime);

        return { found: true, reason: 'at', wait: waitDuration * 1000 };
    } else if (type === 'after') {
        const retryHeaderVal = err.response?.headers[retryHeader] || err.response?.headers[retryHeader.toLowerCase()];

        if (!retryHeaderVal) {
            return { found: false, reason: 'after:no_header' };
        }

        // TODO: handle non-seconds header
        const retryAfter = Number(retryHeaderVal);

        return { found: true, reason: 'after', wait: retryAfter * 1000 };
    }

    return { found: false, reason: 'no_header_configured' };
}
