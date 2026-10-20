import posthog from 'posthog-js';
import { usePostHog } from 'posthog-js/react';
import { useEffect } from 'react';

import type { AccountGroupProperties, AnalyticsEventNameFor, AnalyticsEventPropertiesArgs, ApiUser, GetMeta } from '@nangohq/types';

/** Uses the `posthog` singleton so it works outside React components too. */
export function track<E extends AnalyticsEventNameFor<'web'>>(event: E, ...[properties]: AnalyticsEventPropertiesArgs<E>) {
    posthog?.capture(event, { ...properties, surface: 'web' });
}

// Every group() call with properties sends a $groupidentify event, and useAnalytics identifies on each render.
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
}

function resumeAnalytics() {
    if (posthog?.has_opted_out_capturing()) {
        posthog.opt_in_capturing({ captureEventName: false });
    }
}

export function isSessionRecordingAllowed({
    user,
    loadingUser,
    meta
}: {
    user: ApiUser | undefined;
    loadingUser: boolean;
    meta: GetMeta['Success']['data'] | undefined;
}): boolean | undefined {
    if (loadingUser) {
        return undefined;
    }
    if (!user) {
        return true;
    }
    // A recording already running from the sign-in page must stop until /meta rules out a BAA account.
    if (!meta) {
        return false;
    }
    return !meta.hasBaa && !meta.debugMode;
}

export function useAnalytics(input: Parameters<typeof isSessionRecordingAllowed>[0]) {
    const { user, meta } = input;
    const identify = useAnalyticsIdentify();
    const recording = isSessionRecordingAllowed(input);

    // Keep this effect before the recording one. PostHog drops identify and recording while the browser is opted out.
    useEffect(() => {
        if (!user || !meta) {
            return;
        }
        if (meta.debugMode) {
            stopAnalytics();
            return;
        }
        resumeAnalytics();
        identify(user, meta.accountGroup);
    }, [user, meta, identify]);

    useEffect(() => {
        if (recording === undefined) {
            return;
        }
        if (recording) {
            posthog?.startSessionRecording();
        } else {
            posthog?.stopSessionRecording();
        }
    }, [recording]);
}

export function resetAnalytics() {
    sentAccountGroup = undefined;
    posthog?.reset();
}
