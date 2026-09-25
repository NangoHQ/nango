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
        posthog?.identify(user.email, {
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

export function resetAnalytics() {
    sentAccountGroup = undefined;
    posthog?.reset();
}
