import { OutboundUrlError } from './errors.js';
import { assertSafeOutboundUrl, assertSafeOutboundUrlSync } from './validate.js';

import type { OutboundUrlPolicy } from './policy.js';

/**
 * Absolute URL for the upcoming redirect request, from Node `follow-redirects` options.
 */
export function absoluteUrlFromRedirectRequestOptions(options: Record<string, unknown>): string | null {
    if (typeof options['href'] === 'string' && options['href'].length > 0) {
        return options['href'];
    }
    const protocol = typeof options['protocol'] === 'string' ? options['protocol'] : '';
    const host =
        typeof options['host'] === 'string'
            ? options['host']
            : typeof options['hostname'] === 'string'
              ? `${options['hostname']}${typeof options['port'] === 'number' && options['port'] ? `:${options['port']}` : ''}`
              : '';
    const path = typeof options['path'] === 'string' ? options['path'] : '/';
    if (!protocol || !host) {
        return null;
    }
    return `${protocol}//${host}${path.startsWith('/') ? path : `/${path}`}`;
}

export function createRedirectValidator(
    policy: OutboundUrlPolicy,
    options?: {
        onDenied?: (error: OutboundUrlError, absoluteUrl: string) => void;
    }
): (absoluteRedirectUrl: string) => void {
    return (absoluteRedirectUrl: string) => {
        try {
            assertSafeOutboundUrlSync(absoluteRedirectUrl, policy, { context: 'redirect' });
        } catch (err) {
            const error =
                err instanceof OutboundUrlError
                    ? err
                    : new OutboundUrlError('redirect_denied', 'Redirect target is not allowed.', { url: absoluteRedirectUrl, cause: err });
            options?.onDenied?.(error, absoluteRedirectUrl);
            throw error;
        }
    };
}

export function createAsyncRedirectValidator(
    policy: OutboundUrlPolicy,
    options?: {
        onDenied?: (error: OutboundUrlError, absoluteUrl: string) => void;
    }
): (absoluteRedirectUrl: string) => Promise<void> {
    return async (absoluteRedirectUrl: string) => {
        try {
            await assertSafeOutboundUrl(absoluteRedirectUrl, policy, { context: 'redirect' });
        } catch (err) {
            const error =
                err instanceof OutboundUrlError
                    ? err
                    : new OutboundUrlError('redirect_denied', 'Redirect target is not allowed.', { url: absoluteRedirectUrl, cause: err });
            options?.onDenied?.(error, absoluteRedirectUrl);
            throw error;
        }
    };
}
