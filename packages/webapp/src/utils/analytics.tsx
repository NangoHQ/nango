import posthog from 'posthog-js';
import { usePostHog } from 'posthog-js/react';

import { globalEnv } from './env';

import type { AccountGroupProperties, AnalyticsEventNameFor, AnalyticsEventPropertiesArgs, ApiUser } from '@nangohq/types';

/** Uses the `posthog` singleton so it works outside React components too. */
export function track<E extends AnalyticsEventNameFor<'web'>>(event: E, ...[properties]: AnalyticsEventPropertiesArgs<E>) {
    posthog?.capture(event, { ...properties, surface: 'web' });
}

export function analyticsSessionHeaders(url: URL): Record<string, string> {
    // The OAuth issuer can share this origin, and its CORS policy rejects the header, so match the path too.
    if (url.origin !== new URL(globalEnv.dashboardApiUrl).origin || !url.pathname.startsWith('/api/v1/')) {
        return {};
    }
    const sessionId = posthog?.get_session_id();
    return sessionId ? { 'X-Nango-Analytics-Session-Id': sessionId } : {};
}

// Every group() call with properties sends a $groupidentify event, and PrivateRoute identifies on each render.
let sentAccountGroup: string | undefined;

export function useAnalyticsIdentify() {
    const posthog = usePostHog();

    return (user: ApiUser, accountGroup?: AccountGroupProperties) => {
        // Must match the distinct id the server sends for this user, or PostHog counts one person twice.
        posthog?.identify(String(user.id), {
            email: user.email,
            name: user.name,
            userId: user.id,
            accountId: user.accountId
        });

        const group = JSON.stringify([user.accountId, accountGroup]);
        const isNewGroup = accountGroup !== undefined && group !== sentAccountGroup;
        posthog?.group('company', `${user.accountId}`, isNewGroup ? accountGroup : undefined);
        if (isNewGroup) {
            sentAccountGroup = group;
        }
    };
}

// Opt-out persists in the browser. That keeps capturing off through the reload that starts an impersonation.
export function stopAnalytics() {
    posthog?.opt_out_capturing();
    posthog?.stopSessionRecording();
}

export function resumeAnalytics() {
    if (posthog?.has_opted_out_capturing()) {
        posthog.opt_in_capturing({ captureEventName: false });
        posthog.startSessionRecording();
    }
}

export function resetAnalytics() {
    sentAccountGroup = undefined;
    posthog?.reset();
}
