import { usePostHog } from 'posthog-js/react';
import type { User } from './user';

export function useAnalyticsTrack() {
    const posthog = usePostHog();

    return (event: string, properties?: Record<string, string | number>) => {
        posthog?.capture(event, properties);
    };
}

export function useAnalyticsIdentify() {
    const posthog = usePostHog();

    return (user: User) => {
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
