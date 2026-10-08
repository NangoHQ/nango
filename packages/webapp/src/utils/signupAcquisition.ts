import posthog from 'posthog-js';

import type { SignupAcquisition } from '@nangohq/types';

/** Version-specific adapter for posthog-js 1.435.9; covered by the SDK regression test. */
export function acquisitionFromInitialInfo(info: unknown): SignupAcquisition | undefined {
    if (!info || typeof info !== 'object') return;
    const { u, r } = info as { u?: unknown; r?: unknown };
    if (typeof u !== 'string' || u.length > 8192) return;
    try {
        const url = new URL(u);
        if (!['https:'].includes(url.protocol) || !['nango.dev', 'www.nango.dev'].includes(url.hostname)) return;
        const result: SignupAcquisition = {};
        for (const suffix of ['source', 'medium', 'campaign', 'content', 'term'] as const) {
            const value = url.searchParams.get(`utm_${suffix}`)?.trim();
            // oxlint-disable-next-line no-control-regex -- Reject control characters before sending campaign values.
            if (value && value.length <= 256 && !/[\x00-\x1f\x7f@]/.test(value)) result[`acquisition_utm_${suffix}`] = value;
        }
        if (url.pathname.length <= 1024) result.acquisition_landing_path = url.pathname;
        if (typeof r === 'string' && r !== '$direct') {
            try {
                const referrer = new URL(r);
                if (['http:', 'https:'].includes(referrer.protocol) && !/(^|\.)nango\.dev$/.test(referrer.hostname)) {
                    result.acquisition_referring_domain = referrer.hostname;
                }
            } catch {
                /* Missing or malformed referrers remain unknown. */
            }
        }
        return Object.keys(result).length ? result : undefined;
    } catch {
        return;
    }
}

export function readSignupAcquisition(): SignupAcquisition | undefined {
    try {
        if (posthog.has_opted_out_capturing()) return;
        return acquisitionFromInitialInfo(posthog.get_property('$initial_person_info'));
    } catch {
        return;
    }
}
