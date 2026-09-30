import posthog from 'posthog-js';
import { usePostHog } from 'posthog-js/react';

import type { AnalyticsEvents } from './analyticsEvents';
import type { AccountGroupProperties, ApiUser } from '@nangohq/types';

/**
 * Typed, catalog-checked event tracking. Uses the `posthog` singleton so it works inside and
 * outside React components. The event name and properties are validated against
 * {@link AnalyticsEvents} at compile time.
 */
export function track<E extends keyof AnalyticsEvents>(event: E, properties: AnalyticsEvents[E]) {
    posthog?.capture(event, properties);
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
