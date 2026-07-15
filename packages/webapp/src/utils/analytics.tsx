import posthog from 'posthog-js';
import { usePostHog } from 'posthog-js/react';

import type { AnalyticsEvents } from './analyticsEvents';
import type { ApiUser } from '@nangohq/types';

/**
 * Typed, catalog-checked event tracking. Uses the `posthog` singleton so it works inside and
 * outside React components. Prefer this over `useAnalyticsTrack` for new events: the event name
 * and properties are validated against {@link AnalyticsEvents} at compile time.
 */
export function track<E extends keyof AnalyticsEvents>(event: E, properties: AnalyticsEvents[E]) {
    posthog?.capture(event, properties);
}

export function useAnalyticsTrack() {
    const posthog = usePostHog();

    return (event: string, properties?: Record<string, string | number>) => {
        posthog?.capture(event, properties);
    };
}

export function useAnalyticsIdentify() {
    const posthog = usePostHog();

    return (user: ApiUser) => {
        posthog?.identify(user.email, {
            email: user.email,
            name: user.name,
            userId: user.id,
            accountId: user.accountId
        });

        posthog?.group('company', `${user.accountId}`);
    };
}

export function useAnalyticsReset() {
    const posthog = usePostHog();

    return () => {
        posthog?.reset();
    };
}
