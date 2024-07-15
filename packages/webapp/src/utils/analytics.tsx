import type { ApiUser } from '@nangohq/types';
import { usePostHog } from 'posthog-js/react';

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
