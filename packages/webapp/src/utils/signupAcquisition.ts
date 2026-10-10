import posthog from 'posthog-js';

import type { SignupAcquisition } from '@nangohq/types';

function parseInitialPage(value: unknown): URL | undefined {
    if (typeof value !== 'string' || value.length > 8192) return;
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:') return;
        const isWebsite = /^(www\.)?nango\.dev$|^([a-z0-9-]+\.)?next\.nango\.dev$/.test(url.hostname);
        const isAppSignup = /^(?:app|app-development|pr-\d+\.app-development)\.nango\.dev$/.test(url.hostname) && /^\/signup\/?$/.test(url.pathname);
        if (isWebsite || isAppSignup) return url;
    } catch {
        // Missing or malformed first visits stay unknown.
    }
    return;
}

function readCampaignFields(url: URL): SignupAcquisition {
    const result: SignupAcquisition = {};
    for (const suffix of ['source', 'medium', 'campaign', 'content', 'term'] as const) {
        const value = url.searchParams.get(`utm_${suffix}`)?.trim();
        // oxlint-disable-next-line no-control-regex -- Reject control characters before sending campaign values.
        if (value && value.length <= 256 && !/[\x00-\x1f\x7f-\x9f@]/.test(value)) result[`acquisition_utm_${suffix}`] = value;
    }
    return result;
}

function readReferringDomain(value: unknown): string | undefined {
    if (typeof value !== 'string' || value === '$direct') return;
    try {
        const referrer = new URL(value);
        if (['http:', 'https:'].includes(referrer.protocol) && !/(^|\.)nango\.dev$/.test(referrer.hostname)) {
            return referrer.hostname;
        }
    } catch {
        // Missing or malformed referrers stay unknown.
    }
    return;
}

/** Version-specific adapter for posthog-js 1.435.9; covered by the SDK regression test. */
export function acquisitionFromInitialInfo(info: unknown): SignupAcquisition | undefined {
    if (!info || typeof info !== 'object') return;
    const { u: initialPageUrl, r: initialReferrer } = info as { u?: unknown; r?: unknown };
    const url = parseInitialPage(initialPageUrl);
    if (!url) return;

    const acquisition = readCampaignFields(url);
    if (url.pathname.length <= 1024) acquisition.acquisition_landing_path = url.pathname;
    const referringDomain = readReferringDomain(initialReferrer);
    if (referringDomain) acquisition.acquisition_referring_domain = referringDomain;
    return Object.keys(acquisition).length ? acquisition : undefined;
}

export function readSignupAcquisition(): SignupAcquisition | undefined {
    try {
        if (posthog.has_opted_out_capturing()) return;
        return acquisitionFromInitialInfo(posthog.get_property('$initial_person_info'));
    } catch {
        return;
    }
}
